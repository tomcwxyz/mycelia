import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contextSources } from "@/lib/db/schema";
import { siteConfig } from "@/lib/config/site";
import { requireMembership } from "@/lib/auth/permissions";
import { getAuthenticatedUser, errorResponse } from "@/lib/utils/api";
import {
  exchangeGmailContextCode,
  gmailAccountEmail,
  type GmailContextCredentials,
} from "@/lib/context/gmail-api";
import {
  decryptContextCredentials,
  encryptContextCredentials,
} from "@/lib/context/crypto";
import { verifyContextOAuthState } from "@/lib/context/oauth-state";
import { syncGmailSource } from "@/lib/context/sync-gmail";

function redirectFor(returnTo: string) {
  return new URL(returnTo, siteConfig.url);
}

export async function GET(request: NextRequest) {
  const stateToken = request.nextUrl.searchParams.get("state");
  if (!stateToken) return errorResponse("Missing OAuth state", 400);

  let state;
  try {
    state = verifyContextOAuthState(stateToken);
  } catch {
    return errorResponse("Invalid or expired OAuth state", 400);
  }

  const returnUrl = redirectFor(state.returnTo);
  if (request.nextUrl.searchParams.get("error")) {
    returnUrl.searchParams.set("context", "gmail-cancelled");
    return NextResponse.redirect(returnUrl);
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) return errorResponse("Missing Google authorisation code", 400);

  try {
    const user = await getAuthenticatedUser();
    if (user.id !== state.userId) {
      return errorResponse("OAuth session does not match signed-in user", 403);
    }
    await requireMembership(user.id, state.organisationId, "contributor");

    let credentials = await exchangeGmailContextCode(code);
    const externalAccountId = await gmailAccountEmail(credentials.accessToken);

    const [existing] = await db
      .select()
      .from(contextSources)
      .where(
        and(
          eq(contextSources.organisationId, state.organisationId),
          eq(contextSources.userId, user.id),
          eq(contextSources.provider, "gmail"),
          eq(contextSources.externalAccountId, externalAccountId),
        ),
      )
      .limit(1);

    if (!credentials.refreshToken && existing) {
      const previous = decryptContextCredentials<GmailContextCredentials>(
        existing.credentialsEncrypted,
      );
      credentials = {
        ...credentials,
        refreshToken: previous.refreshToken,
      };
    }
    if (!credentials.refreshToken) {
      throw new Error("Google did not provide a refresh token");
    }

    const now = new Date();
    const [source] = await db
      .insert(contextSources)
      .values({
        organisationId: state.organisationId,
        userId: user.id,
        provider: "gmail",
        externalAccountId,
        label: externalAccountId,
        status: "active",
        scopes: credentials.scope.split(" ").filter(Boolean),
        credentialsEncrypted: encryptContextCredentials(credentials),
        config: {
          lookbackDays: 14,
          maxMessages: 50,
          retentionDays: 30,
          exactParticipantMatchOnly: true,
          attachmentContentRead: false,
        },
      })
      .onConflictDoUpdate({
        target: [
          contextSources.organisationId,
          contextSources.userId,
          contextSources.provider,
          contextSources.externalAccountId,
        ],
        set: {
          label: externalAccountId,
          status: "active",
          scopes: credentials.scope.split(" ").filter(Boolean),
          credentialsEncrypted: encryptContextCredentials(credentials),
          config: {
            lookbackDays: 14,
            maxMessages: 50,
            retentionDays: 30,
            exactParticipantMatchOnly: true,
            attachmentContentRead: false,
          },
          updatedAt: now,
        },
      })
      .returning({ id: contextSources.id });

    try {
      const result = await syncGmailSource(source.id, now);
      returnUrl.searchParams.set("context", "gmail-connected");
      returnUrl.searchParams.set("candidates", String(result.candidatesCreated));
    } catch (syncError) {
      console.error("Initial Gmail relationship sync failed", syncError);
      returnUrl.searchParams.set("context", "gmail-connected");
      returnUrl.searchParams.set("sync", "failed");
    }

    return NextResponse.redirect(returnUrl);
  } catch (error) {
    console.error("Gmail callback failed", error);
    returnUrl.searchParams.set("context", "gmail-error");
    return NextResponse.redirect(returnUrl);
  }
}
