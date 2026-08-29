import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contextSources } from "@/lib/db/schema";
import {
  errorResponse,
  getOrgContext,
  successResponse,
} from "@/lib/utils/api";
import { encryptContextCredentials } from "@/lib/context/crypto";

function inboundDomain() {
  const domain = process.env.EMAIL_INBOUND_DOMAIN?.trim().toLowerCase();
  if (!domain) throw new Error("EMAIL_INBOUND_DOMAIN is not configured");
  return domain;
}

export async function POST(request: Request) {
  try {
    const { user, organisationId } = await getOrgContext(request);

    const [existing] = await db
      .select({
        id: contextSources.id,
        label: contextSources.label,
      })
      .from(contextSources)
      .where(
        and(
          eq(contextSources.organisationId, organisationId),
          eq(contextSources.userId, user.id),
          eq(contextSources.provider, "email_forward"),
          eq(contextSources.status, "active"),
        ),
      )
      .limit(1);

    if (existing) {
      return successResponse({
        id: existing.id,
        address: existing.label,
        created: false,
      });
    }

    const token = randomBytes(18).toString("hex");
    const address = `${token}@${inboundDomain()}`;
    const [created] = await db
      .insert(contextSources)
      .values({
        organisationId,
        userId: user.id,
        provider: "email_forward",
        externalAccountId: token,
        label: address,
        status: "active",
        scopes: ["email.forwarded"],
        credentialsEncrypted: encryptContextCredentials({
          transport: "resend_inbound",
        }),
        config: {
          address,
          retentionDays: 30,
          senderRestrictedToUser: true,
        },
      })
      .returning({ id: contextSources.id });

    return successResponse({
      id: created.id,
      address,
      created: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message === "Not authenticated") return errorResponse(message, 401);
    if (message.includes("Not a member")) return errorResponse("Forbidden", 403);
    if (message.includes("Subscription required")) return errorResponse(message, 402);
    if (message.includes("not configured")) {
      return errorResponse("Inbound email is not configured", 503);
    }
    console.error("Email context source setup failed", error);
    return errorResponse("Could not set up email forwarding", 500);
  }
}
