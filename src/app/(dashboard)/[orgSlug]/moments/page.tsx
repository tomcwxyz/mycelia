export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import {
  organisations,
  moments,
  momentConnections,
  connections,
  spaces,
  users,
} from "@/lib/db/schema";
import { and, eq, desc, inArray, asc, gte, lte } from "drizzle-orm";
import { MomentList } from "@/components/moments/moment-list";
import { MomentFilters } from "@/components/moments/moment-filters";
import { ComposerTriggerBar } from "@/components/moments/composer-trigger-bar";
import { auth } from "@/lib/auth";
import { canPerform, getMembership, hasMinRole } from "@/lib/auth/permissions";

export default async function MomentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{
    spaceId?: string;
    authorId?: string;
    connectionType?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { orgSlug } = await params;
  const { spaceId, authorId, connectionType, from, to } = await searchParams;

  const [org] = await db
    .select()
    .from(organisations)
    .where(eq(organisations.slug, orgSlug))
    .limit(1);

  if (!org) return null;

  const session = await auth();
  const membership = session?.user?.id
    ? await getMembership(session.user.id, org.id)
    : null;
  const canDeleteAnyMoment = membership
    ? canPerform(membership, "DELETE_MOMENTS", "admin")
    : false;
  const canDeleteOwnMoment = membership
    ? hasMinRole(membership.role, "contributor")
    : false;

  const allSpaces = await db
    .select({ id: spaces.id, name: spaces.name })
    .from(spaces)
    .where(eq(spaces.organisationId, org.id))
    .orderBy(asc(spaces.name));

  const orgAuthors = await db
    .selectDistinct({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(moments)
    .innerJoin(users, eq(users.id, moments.authorId))
    .where(eq(moments.organisationId, org.id));

  const conditions = [eq(moments.organisationId, org.id)];
  if (spaceId) conditions.push(eq(moments.spaceId, spaceId));
  if (authorId) conditions.push(eq(moments.authorId, authorId));
  if (from) conditions.push(gte(moments.createdAt, new Date(from)));
  if (to) conditions.push(lte(moments.createdAt, new Date(to)));

  // A moment doesn't have its own type — filter by whether any of its
  // linked connections match the selected connection type.
  if (connectionType) {
    const matchingMomentIds = await db
      .selectDistinct({ momentId: momentConnections.momentId })
      .from(momentConnections)
      .innerJoin(
        connections,
        eq(momentConnections.connectionId, connections.id)
      )
      .where(
        and(
          eq(connections.organisationId, org.id),
          eq(
            connections.type,
            connectionType as "person" | "organisation" | "group" | "community"
          )
        )
      );

    const ids = matchingMomentIds.map((m) => m.momentId);
    conditions.push(
      ids.length ? inArray(moments.id, ids) : inArray(moments.id, ["__none__"])
    );
  }

  const rows = await db
    .select({
      id: moments.id,
      content: moments.content,
      source: moments.source,
      createdAt: moments.createdAt,
      eventDate: moments.eventDate,
      authorId: moments.authorId,
    })
    .from(moments)
    .where(and(...conditions))
    .orderBy(desc(moments.createdAt));

  const links = rows.length
    ? await db
        .select({
          momentId: momentConnections.momentId,
          id: connections.id,
          name: connections.name,
          type: connections.type,
        })
        .from(momentConnections)
        .innerJoin(
          connections,
          eq(momentConnections.connectionId, connections.id)
        )
        .where(
          inArray(
            momentConnections.momentId,
            rows.map((m) => m.id)
          )
        )
    : [];

  const connectionsByMoment = new Map<
    string,
    { id: string; name: string; type: string }[]
  >();
  for (const link of links) {
    const list = connectionsByMoment.get(link.momentId) ?? [];
    list.push({ id: link.id, name: link.name, type: link.type });
    connectionsByMoment.set(link.momentId, list);
  }

  const authorById = new Map(
    orgAuthors.map((a) => [a.id, { name: a.name, email: a.email }])
  );

  const momentsWithConnections = rows.map((m) => ({
    ...m,
    connections: connectionsByMoment.get(m.id) ?? [],
    author: m.authorId ? (authorById.get(m.authorId) ?? null) : null,
  }));

  return (
    <div className="stagger-children space-y-6">
      <div>
        <h1 className="font-display text-bark text-4xl">
          The river of moments
        </h1>
        <p className="text-muted mt-2">
          Everything that happened, as it flowed —{" "}
          {rows.length === 1 ? "1 moment" : `${rows.length} moments`} and
          counting
        </p>
      </div>

      <ComposerTriggerBar />

      <MomentFilters
        spaces={allSpaces.map((s) => ({ value: s.id, label: s.name }))}
        authors={orgAuthors.map((a) => ({
          value: a.id,
          label: a.name ?? a.email,
        }))}
        spaceId={spaceId}
        authorId={authorId}
        connectionType={connectionType}
        from={from}
        to={to}
      />

      <MomentList
        moments={momentsWithConnections}
        orgSlug={orgSlug}
        organisationId={org.id}
        deletableMomentIds={momentsWithConnections
          .filter(
            (moment) =>
              canDeleteAnyMoment ||
              (canDeleteOwnMoment &&
                Boolean(session?.user?.id) &&
                moment.authorId === session?.user?.id),
          )
          .map((moment) => moment.id)}
      />
    </div>
  );
}
