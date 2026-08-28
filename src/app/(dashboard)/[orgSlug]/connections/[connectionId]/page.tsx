export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  organisations,
  connections,
  organisationMemberships,
  momentConnections,
  moments,
  qualities,
  connectionSpaces,
  spaces,
} from "@/lib/db/schema";
import { and, eq, desc, asc, inArray, ne, sql } from "drizzle-orm";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { canPerform, hasMinRole } from "@/lib/auth/permissions";
import { ConnectionTypeBadge } from "@/components/ui/connection-type-badge";
import { AddMomentButton } from "@/components/moments/add-moment-button";
import { MomentList } from "@/components/moments/moment-list";
import { QualitySpectrums } from "@/components/qualities/quality-spectrums";
import { SpacePicker } from "@/components/spaces/space-picker";
import { ContactDetailsCard } from "@/components/connections/contact-details-card";
import { EditConnectionModal } from "@/components/connections/edit-connection-modal";
import { ExportButton } from "@/components/export/export-button";

export default async function ConnectionDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; connectionId: string }>;
}) {
  const { orgSlug, connectionId } = await params;

  const [org] = await db
    .select()
    .from(organisations)
    .where(eq(organisations.slug, orgSlug))
    .limit(1);

  if (!org) notFound();

  const [connection] = await db
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.id, connectionId),
        eq(connections.organisationId, org.id)
      )
    )
    .limit(1);

  if (!connection) notFound();

  // The viewer's role decides whether contact details are editable here
  // (the API enforces the same; this just hides the affordance for viewers).
  const session = await auth();
  const [membership] = session?.user?.id
    ? await db
        .select({
          role: organisationMemberships.role,
          permissions: organisationMemberships.permissions,
        })
        .from(organisationMemberships)
        .where(
          and(
            eq(organisationMemberships.userId, session.user.id),
            eq(organisationMemberships.organisationId, org.id)
          )
        )
        .limit(1)
    : [];
  const canEdit = membership
    ? hasMinRole(membership.role, "contributor")
    : false;
  const canDeleteAnyMoment = membership
    ? canPerform(membership, "DELETE_MOMENTS", "admin")
    : false;

  // Get moments for this connection
  const connectionMoments = await db
    .select({
      id: moments.id,
      content: moments.content,
      source: moments.source,
      createdAt: moments.createdAt,
      eventDate: moments.eventDate,
      authorId: moments.authorId,
    })
    .from(momentConnections)
    .innerJoin(moments, eq(momentConnections.momentId, moments.id))
    .where(eq(momentConnections.connectionId, connectionId))
    .orderBy(desc(moments.createdAt));

  const qualityRows = await db
    .select({
      spectrum: qualities.spectrum,
      position: qualities.position,
      createdAt: qualities.createdAt,
      source: qualities.source,
    })
    .from(qualities)
    .where(eq(qualities.connectionId, connectionId))
    .orderBy(asc(qualities.createdAt));

  const allSpaces = await db
    .select({ id: spaces.id, name: spaces.name })
    .from(spaces)
    .where(eq(spaces.organisationId, org.id))
    .orderBy(asc(spaces.name));

  const linkedSpaceIds = (
    await db
      .select({ spaceId: connectionSpaces.spaceId })
      .from(connectionSpaces)
      .where(eq(connectionSpaces.connectionId, connectionId))
  ).map((row) => row.spaceId);

  // Shared threads: other connections who co-appear in this connection's
  // moments, ranked by how many moments they share.
  const sharedMomentIds = connectionMoments.map((m) => m.id);
  const sharedThreads = sharedMomentIds.length
    ? await db
        .select({
          id: connections.id,
          name: connections.name,
          sharedCount: sql<number>`count(*)`.mapWith(Number),
        })
        .from(momentConnections)
        .innerJoin(
          connections,
          eq(momentConnections.connectionId, connections.id)
        )
        .where(
          and(
            inArray(momentConnections.momentId, sharedMomentIds),
            ne(momentConnections.connectionId, connectionId)
          )
        )
        .groupBy(connections.id, connections.name)
        .orderBy(desc(sql`count(*)`))
        .limit(3)
    : [];

  // A quiet status read: latest "depth" quality signal, if one has been set.
  const latestDepth = [...qualityRows]
    .reverse()
    .find((q) => q.spectrum === "depth");
  const depthLabel = latestDepth
    ? latestDepth.position > 0.25
      ? "Deepening"
      : latestDepth.position < -0.25
        ? "Cooling"
        : "Steady"
    : null;

  return (
    <div className="stagger-children space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="animate-breathe-soft from-terracotta-light to-moss-dark h-16 w-16 shrink-0 rounded-full bg-gradient-to-br shadow-[0_0_24px_rgba(138,154,86,0.35)]"
            aria-hidden="true"
          />
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-bark text-4xl">
                {connection.name}
              </h1>
              <ConnectionTypeBadge type={connection.type}>
                {connection.type}
              </ConnectionTypeBadge>
              {depthLabel && (
                <span className="border-green/35 from-green/15 to-moss/10 text-green-dark rounded-full border bg-gradient-to-r px-3 py-1 text-xs font-semibold">
                  {depthLabel}
                </span>
              )}
            </div>
            <p className="text-muted mt-2 text-sm">
              In your network since{" "}
              {connection.createdAt.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {canEdit && (
            <EditConnectionModal
              connectionId={connectionId}
              organisationId={org.id}
              initialName={connection.name}
              initialType={connection.type}
              initialContact={connection.contactDetails ?? {}}
            />
          )}
          <ExportButton
            url={`/api/connections/${connectionId}/export`}
            organisationId={org.id}
            fallbackFilename={`tending-${connection.name}.zip`}
            label="Export"
          />
          <AddMomentButton seedText={connection.name} />
        </div>
      </div>

      {/* The story leads: relationships are narratives, not records */}
      <div className="border-border bg-surface shadow-lift rounded-2xl border p-6 sm:p-8">
        <h2 className="text-muted text-xs font-medium tracking-[0.14em] uppercase">
          The story so far
        </h2>
        {connection.threadSummary ? (
          <p className="text-bark mt-3 font-serif text-lg leading-relaxed">
            {connection.threadSummary}
          </p>
        ) : (
          <p className="text-muted mt-3 text-sm">
            No story yet. As you record moments with {connection.name}, Tending
            will write and keep a living narrative of this relationship here.
          </p>
        )}
      </div>

      <div>
        <h2 className="text-muted text-xs font-medium tracking-[0.14em] uppercase">
          Qualities
        </h2>
        <div className="mt-4">
          <QualitySpectrums
            qualities={qualityRows}
            connectionId={connectionId}
            organisationId={org.id}
          />
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[3fr_2fr] lg:items-start">
        <div>
          <h2 className="font-display text-bark text-xl">Moments together</h2>
          <div className="mt-4">
            <MomentList
              moments={connectionMoments}
              orgSlug={orgSlug}
              organisationId={org.id}
              deletableMomentIds={connectionMoments
                .filter(
                  (moment) =>
                    canDeleteAnyMoment ||
                    (canEdit &&
                      Boolean(session?.user?.id) &&
                      moment.authorId === session?.user?.id),
                )
                .map((moment) => moment.id)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {sharedThreads.length > 0 && (
            <div className="underground relative overflow-hidden rounded-xl p-5">
              <p className="text-soil-ink-soft text-xs font-medium tracking-[0.12em] uppercase">
                Shared threads
              </p>
              <p className="text-soil-ink mt-2.5 text-sm leading-relaxed">
                Connected to{" "}
                {sharedThreads.map((t, i) => (
                  <span key={t.id}>
                    <Link
                      href={`/${orgSlug}/connections/${t.id}`}
                      className="text-spore decoration-spore/30 hover:decoration-spore underline underline-offset-2"
                    >
                      {t.name}
                    </Link>
                    {i < sharedThreads.length - 2
                      ? ", "
                      : i === sharedThreads.length - 2
                        ? " and "
                        : ""}
                  </span>
                ))}{" "}
                through shared moments.
              </p>
            </div>
          )}

          <ContactDetailsCard
            details={connection.contactDetails ?? {}}
            canEdit={canEdit}
          />

          <div className="border-border bg-surface shadow-lift rounded-xl border p-6">
            <h2 className="text-muted text-xs font-medium tracking-[0.14em] uppercase">
              Spaces
            </h2>
            <div className="mt-4">
              <SpacePicker
                connectionId={connectionId}
                organisationId={org.id}
                allSpaces={allSpaces}
                initialSelected={linkedSpaceIds}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
