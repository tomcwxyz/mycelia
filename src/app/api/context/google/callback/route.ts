import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contextSources } from "@/lib/db/schema";
import { siteConfig } from "@/lib/config/site";
import { requireMembership } from "@/lib/auth/permissions";
import { getAuthenticatedUser, errorResponse } from "@/lib/utils/api";
import {
  exchangeGoogleCalendarCode,
  fetchGoogleUserInfo,
  type GoogleContextCredentials,
} from "@/lib/context/google-api";
import {
  decryptContextCredentials,
  encryptContextCredentials,
} from "@/lib/context/crypto";
import { verifyContextOAuthState } from "@/lib/context/oauth-state";
import { syncGoogleCalendarSource } from "@/lib/context/sync-google-calendar";

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
  const googleError = request.nextUrl.searchParams.get("error");
  if (googleError) {
    returnUrl.searchParams.set("context", "google-calendar-cancelled");
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

    let credentials = await exchangeGoogleCalendarCode(code);
    const profile = await fetchGoogleUserInfo(credentials.accessToken);
    const externalAccountId = profile.email.trim().toLowerCase();

    const [existing] = await db
      .select()
      .from(contextSources)
      .where(
        and(
          eq(contextSources.organisationId, state.organisationId),
          eq(contextSources.userId, user.id),
          eq(contextSources.provider, "google_calendar"),
          eq(contextSources.externalAccountId, externalAccountId),
        ),
      )
      .limit(1);

    // Google can omit refresh_token on a repeat grant. Preserve the encrypted
    // refresh token from the existing source rather than turning a successful
    // reconnect into a connection that cannot sync later.
    if (!credentials.refreshToken && existing) {
      const previous = decryptContextCredentials<GoogleContextCredentials>(
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
        provider: "google_calendar",
        externalAccountId,
        label: externalAccountId,
        status: "active",
        scopes: credentials.scope.split(" ").filter(Boolean),
        credentialsEncrypted: encryptContextCredentials(credentials),
        config: {
          calendarId: "primary",
          lookbackDays: 14,
          retentionDays: 30,
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
            calendarId: "primary",
            lookbackDays: 14,
            retentionDays: 30,
          },
          updatedAt: now,
        },
      })
      .returning({ id: contextSources.id });

    try {
      const result = await syncGoogleCalendarSource(source.id, now);
      returnUrl.searchParams.set("context", "google-calendar-connected");
      returnUrl.searchParams.set("candidates", String(result.candidatesCreated));
    } catch (syncError) {
      console.error("Initial Google Calendar context sync failed", syncError);
      returnUrl.searchParams.set("context", "google-calendar-connected");
      returnUrl.searchParams.set("sync", "failed");
    }

    return NextResponse.redirect(returnUrl);
  } catch (error) {
    console.error("Google Calendar callback failed", error);
    returnUrl.searchParams.set("context", "google-calendar-error");
    return NextResponse.redirect(returnUrl);
  }
}
