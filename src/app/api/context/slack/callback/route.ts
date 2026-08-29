import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contextSources } from "@/lib/db/schema";
import { siteConfig } from "@/lib/config/site";
import { requireMembership } from "@/lib/auth/permissions";
import { getAuthenticatedUser, errorResponse } from "@/lib/utils/api";
import { verifyContextOAuthState } from "@/lib/context/oauth-state";
import {
  exchangeSlackCode,
  slackContextScopes,
} from "@/lib/context/slack-api";
import { encryptContextCredentials } from "@/lib/context/crypto";

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
    returnUrl.searchParams.set("context", "slack-cancelled");
    return NextResponse.redirect(returnUrl);
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) return errorResponse("Missing Slack authorisation code", 400);

  try {
    const user = await getAuthenticatedUser();
    if (user.id !== state.userId) {
      return errorResponse("OAuth session does not match signed-in user", 403);
    }
    await requireMembership(user.id, state.organisationId, "contributor");

    const redirectUri = new URL(
      "/api/context/slack/callback",
      siteConfig.url,
    ).toString();
    const result = await exchangeSlackCode(code, redirectUri);
    const now = new Date();

    await db
      .insert(contextSources)
      .values({
        organisationId: state.organisationId,
        userId: user.id,
        provider: "slack",
        externalAccountId: result.teamId,
        label: result.teamName,
        status: "active",
        scopes: slackContextScopes,
        credentialsEncrypted: encryptContextCredentials(result.credentials),
        config: {
          teamId: result.teamId,
          teamName: result.teamName,
          slackUserId: result.slackUserId,
          mode: "message_shortcut",
          shortcutCallbackId: "tending_relationship_context",
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
          label: result.teamName,
          status: "active",
          scopes: slackContextScopes,
          credentialsEncrypted: encryptContextCredentials(result.credentials),
          config: {
            teamId: result.teamId,
            teamName: result.teamName,
            slackUserId: result.slackUserId,
            mode: "message_shortcut",
            shortcutCallbackId: "tending_relationship_context",
            retentionDays: 30,
          },
          updatedAt: now,
        },
      });

    returnUrl.searchParams.set("context", "slack-connected");
    return NextResponse.redirect(returnUrl);
  } catch (error) {
    console.error("Slack callback failed", error);
    returnUrl.searchParams.set("context", "slack-error");
    return NextResponse.redirect(returnUrl);
  }
}
