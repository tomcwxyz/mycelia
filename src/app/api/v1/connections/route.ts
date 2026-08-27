import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { connections, organisations } from "@/lib/db/schema";
import { successResponse, errorResponse } from "@/lib/utils/api";
import { getApiContext, apiErrorResponse } from "@/lib/api-keys/context";
import { parsePagination } from "@/lib/api/pagination";
import {
  createConnectionSchema,
  normaliseContactDetails,
} from "@/lib/validators/connections";
import { PLAN_LIMITS } from "@/lib/config/plans";
import { emitEvent } from "@/lib/webhooks/emit";
import { connectionCreatedPayload } from "@/lib/webhooks/payloads";
import { count, desc, eq } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { organisationId } = await getApiContext(request, "read");
    const { limit, offset } = parsePagination(request);

    const rows = await db
      .select()
      .from(connections)
      .where(eq(connections.organisationId, organisationId))
      .orderBy(desc(connections.createdAt))
      .limit(limit)
      .offset(offset);

    return successResponse({ data: rows });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { organisationId } = await getApiContext(request, "read_write");
    const body = await request.json();
    const parsed = createConnectionSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 422);
    }

    const [org] = await db
      .select({ plan: organisations.plan })
      .from(organisations)
      .where(eq(organisations.id, organisationId))
      .limit(1);

    if (org) {
      const [connectionCount] = await db
        .select({ value: count() })
        .from(connections)
        .where(eq(connections.organisationId, organisationId));

      const limit = PLAN_LIMITS[org.plan].connections;
      if (connectionCount.value >= limit) {
        return errorResponse(
          `Your plan allows up to ${limit} connections. Upgrade to add more.`,
          403,
        );
      }
    }

    const [connection] = await db
      .insert(connections)
      .values({
        organisationId,
        name: parsed.data.name,
        type: parsed.data.type,
        contactDetails: normaliseContactDetails(parsed.data.contactDetails) ?? {},
        metadata: parsed.data.metadata ?? {},
      })
      .returning();

    try {
      await emitEvent(organisationId, "connection.created", {
        actor: {
          kind: "system",
          ref: "tending:apikey",
          name: "API",
        },
        ...connectionCreatedPayload({
          connectionId: connection.id,
          name: connection.name,
          type: connection.type,
        }),
      });
    } catch (webhookError) {
      console.error("Failed to emit connection.created webhook", connection.id, webhookError);
    }

    return successResponse(connection, 201);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
