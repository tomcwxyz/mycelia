import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  connections,
  momentConnections,
  moments,
  observations,
} from "@/lib/db/schema";
import { getApiContext, apiErrorResponse } from "@/lib/api-keys/context";
import { errorResponse, successResponse } from "@/lib/utils/api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { organisationId } = await getApiContext(request, "read");
    const { id } = await params;
    const url = new URL(request.url);
    const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "30", 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 30;

    const [connection] = await db
      .select({
        id: connections.id,
        name: connections.name,
        type: connections.type,
        threadSummary: connections.threadSummary,
        threadUpdatedAt: connections.threadUpdatedAt,
        contactDetails: connections.contactDetails,
        metadata: connections.metadata,
        createdAt: connections.createdAt,
        updatedAt: connections.updatedAt,
      })
      .from(connections)
      .where(
        and(
          eq(connections.id, id),
          eq(connections.organisationId, organisationId),
        ),
      )
      .limit(1);

    if (!connection) return errorResponse("Connection not found", 404);

    const relationshipMoments = await db
      .select({
        id: moments.id,
        content: moments.content,
        source: moments.source,
        eventDate: moments.eventDate,
        spaceId: moments.spaceId,
        createdAt: moments.createdAt,
      })
      .from(momentConnections)
      .innerJoin(moments, eq(moments.id, momentConnections.momentId))
      .where(
        and(
          eq(momentConnections.connectionId, id),
          eq(moments.organisationId, organisationId),
        ),
      )
      .orderBy(desc(moments.createdAt))
      .limit(limit);

    const relationshipObservations = await db
      .select({
        id: observations.id,
        type: observations.type,
        content: observations.content,
        severity: observations.severity,
        status: observations.status,
        userResponse: observations.userResponse,
        dueAt: observations.dueAt,
        sourceMomentId: observations.sourceMomentId,
        createdAt: observations.createdAt,
      })
      .from(observations)
      .where(
        and(
          eq(observations.organisationId, organisationId),
          sql`${id}::uuid = ANY(${observations.connections})`,
        ),
      )
      .orderBy(desc(observations.createdAt))
      .limit(limit);

    return successResponse({
      connection,
      moments: relationshipMoments,
      observations: relationshipObservations,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
