import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contextSources } from "@/lib/db/schema";
import { siteConfig } from "@/lib/config/site";
import { requireMembership } from "@/lib/auth/permissions";
import { getAuthenticatedUser, errorResponse } from "@/lib/utils/api";
import { verifyContextOAuthState } from "@/lib/context/oauth-state";
import {
  exchangeClickUpCode,
  listClickUpWorkspaces,
} from "@/lib/context/clickup-api";
import { encryptContextCredentials } from "@/lib/context/crypto";
import { syncClickUpSource } from "@/lib/context/sync-clickup";

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
    returnUrl.searchParams.set("context", "clickup-cancelled");
    return NextResponse.redirect(returnUrl);
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) return errorResponse("Missing ClickUp authorisation code", 400);

  try {
    const user = await getAuthenticatedUser();
    if (user.id !== state.userId) {
      return errorResponse("OAuth session does not match signed-in user", 403);
    }
    await requireMembership(user.id, state.organisationId, "contributor");

    const credentials = await exchangeClickUpCode(code);
    const workspaces = await listClickUpWorkspaces(credentials.accessToken);
    if (workspaces.length === 0) {
      throw new Error("ClickUp did not authorise any Workspaces");
    }

    const existing = await db
      .select({ id: contextSources.id, externalAccountId: contextSources.externalAccountId })
      .from(contextSources)
      .where(
        and(
          eq(contextSources.organisationId, state.organisationId),
          eq(contextSources.userId, user.id),
          eq(contextSources.provider, "clickup"),
        ),
      );

    const authorisedIds = new Set(workspaces.map((workspace) => workspace.id));
    for (const source of existing) {
      if (!authorisedIds.has(source.externalAccountId)) {
        await db.delete(contextSources).where(eq(contextSources.id, source.id));
      }
    }

    const encrypted = encryptContextCredentials(credentials);
    let candidatesCreated = 0;

    for (const workspace of workspaces) {
      const now = new Date();
      const [source] = await db
        .insert(contextSources)
        .values({
          organisationId: state.organisationId,
          userId: user.id,
          provider: "clickup",
          externalAccountId: workspace.id,
          label: workspace.name,
          status: "active",
          scopes: ["workspaces:read", "tasks:read"],
          credentialsEncrypted: encrypted,
          config: {
            workspaceId: workspace.id,
            workspaceName: workspace.name,
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
            label: workspace.name,
            status: "active",
            scopes: ["workspaces:read", "tasks:read"],
            credentialsEncrypted: encrypted,
            config: {
              workspaceId: workspace.id,
              workspaceName: workspace.name,
              lookbackDays: 14,
              retentionDays: 30,
            },
            updatedAt: now,
          },
        })
        .returning({ id: contextSources.id });

      try {
        const result = await syncClickUpSource(source.id, now);
        candidatesCreated += result.candidatesCreated;
      } catch (syncError) {
        console.error("Initial ClickUp context sync failed", syncError);
      }
    }

    returnUrl.searchParams.set("context", "clickup-connected");
    returnUrl.searchParams.set("workspaces", String(workspaces.length));
    returnUrl.searchParams.set("candidates", String(candidatesCreated));
    return NextResponse.redirect(returnUrl);
  } catch (error) {
    console.error("ClickUp callback failed", error);
    returnUrl.searchParams.set("context", "clickup-error");
    return NextResponse.redirect(returnUrl);
  }
}
