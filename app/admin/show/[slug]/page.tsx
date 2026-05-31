/**
 * app/admin/show/[slug]/page.tsx (M12.2 Phase A — per-show reskin, spec §6)
 *
 * Per-show admin page. Header (status pill, archived-first; gated share-link
 * chip) → two-col Crew ⟷ Share & access → parse warnings → quiet sync footer.
 *
 * Archived-safety (R10/R11/R12/R29/R32): the page loads by slug regardless of
 * published/archived (the inbox routes archived existing shows here). Crew-link
 * surfaces (header chip, Open crew page, share URL, rotate/reset) render ONLY
 * when published && !archived && token; preview-as links + the preview route
 * gate on published && !archived; an archived show's ParsePanel is read-only.
 *
 * AlertBanner is mounted by app/admin/layout.tsx. requireAdmin() runs here as
 * defense-in-depth. Every Supabase await wraps in try/catch (AGENTS.md §1.9).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { nowDate } from "@/lib/time/now";
import { ParsePanel } from "@/components/admin/ParsePanel";
import { PerShowAlertSection } from "@/components/admin/PerShowAlertSection";
import { ReSyncButton } from "@/components/admin/ReSyncButton";
import { StatusIndicator } from "@/components/admin/StatusIndicator";
import { formatRelative } from "@/components/admin/ActiveShowsPanel";
import { syncStatusBucket } from "@/lib/admin/syncStatus";
import { loadShowShareToken } from "@/lib/data/loadShowShareToken";
import { CurrentShareLinkPanel } from "./CurrentShareLinkPanel";
import { resolveOrigin } from "./resolveOrigin";
import { ShareLinkCopyButton } from "./ShareLinkCopyButton";
import { ResetPickerEpochButton } from "./ResetPickerEpochButton";
import { RotateShareTokenButton } from "./RotateShareTokenButton";
import type { PerShowCrewRow } from "@/components/admin/PerShowCrewSection";
import type { StagedRow } from "@/components/admin/StagedReviewCard";
import { parseTriggeredReviewItems } from "@/lib/staging/triggeredReviewItems";

export const dynamic = "force-dynamic";

type ShowLookupRow = {
  id: string;
  slug: string;
  title: string;
  drive_file_id: string;
  published: boolean;
  archived: boolean;
  last_synced_at: string | null;
  last_sync_status: string | null;
};

type PendingSyncRow = {
  staged_id: string;
  drive_file_id: string;
  source_kind: StagedRow["sourceKind"];
  staged_modified_time: string;
  base_modified_time: string | null;
  warning_summary: string;
  triggered_review_items: unknown;
  parse_result: unknown;
};

type CrewMemberRow = {
  id: string;
  name: string;
  role: string | null;
};

function safeStringField(value: unknown, key: string): string | null {
  if (value === null || typeof value !== "object") return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate : null;
}

function deriveParseSummary(parseResult: unknown): string | undefined {
  if (parseResult === null || typeof parseResult !== "object") return undefined;
  const show = (parseResult as Record<string, unknown>).show;
  const title = safeStringField(show, "title");
  const client = safeStringField(show, "client_label");
  const parts: string[] = [];
  if (title) parts.push(title);
  if (client) parts.push(client);
  if (parts.length === 0) return undefined;
  // " · " (middot), not an em-dash — the project copy rule bans em-dashes in
  // rendered copy (impeccable audit P3).
  return parts.join(" · ");
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export default async function AdminShowPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ alert_id?: string }>;
}) {
  await requireAdmin();
  const { slug } = await params;
  const sp = (await searchParams) ?? {};

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    console.error(
      "[/admin/show/[slug]] supabase client construction threw:",
      err instanceof Error ? err.message : String(err),
    );
    throw new Error("supabase_client_construction_failed");
  }

  let show: ShowLookupRow | null;
  try {
    const { data, error: showError } = await supabase
      .from("shows")
      .select(
        "id, slug, title, drive_file_id, published, archived, last_synced_at, last_sync_status",
      )
      .eq("slug", slug)
      .maybeSingle<ShowLookupRow>();
    if (showError) {
      console.error("[/admin/show/[slug]] show lookup failed:", showError.message);
      throw new Error("show_lookup_failed");
    }
    show = data;
  } catch (err) {
    if (err instanceof Error && err.message === "show_lookup_failed") throw err;
    console.error(
      "[/admin/show/[slug]] show lookup threw:",
      err instanceof Error ? err.message : String(err),
    );
    throw new Error("show_lookup_failed");
  }
  if (!show) {
    notFound();
  }

  let pendingRows: PendingSyncRow[] | null;
  try {
    const { data, error: pendingError } = await supabase
      .from("pending_syncs")
      .select(
        "staged_id, drive_file_id, source_kind, staged_modified_time, base_modified_time, warning_summary, triggered_review_items, parse_result",
      )
      .eq("drive_file_id", show.drive_file_id)
      .is("wizard_session_id", null)
      .order("staged_modified_time", { ascending: false })
      .returns<PendingSyncRow[]>();
    if (pendingError) {
      console.error("[/admin/show/[slug]] pending_syncs lookup failed:", pendingError.message);
      throw new Error("pending_syncs_lookup_failed");
    }
    pendingRows = data;
  } catch (err) {
    if (err instanceof Error && err.message === "pending_syncs_lookup_failed") throw err;
    console.error(
      "[/admin/show/[slug]] pending_syncs lookup threw:",
      err instanceof Error ? err.message : String(err),
    );
    throw new Error("pending_syncs_lookup_failed");
  }

  const rows: StagedRow[] = (pendingRows ?? []).map((row) => {
    const summary = deriveParseSummary(row.parse_result);
    const parsed = parseTriggeredReviewItems(row.triggered_review_items);
    const base: StagedRow = {
      driveFileId: row.drive_file_id,
      stagedId: row.staged_id,
      sourceKind: row.source_kind,
      stagedModifiedTime: row.staged_modified_time,
      baseModifiedTime: row.base_modified_time,
      warningSummary: row.warning_summary,
      triggeredReviewItems: parsed.ok ? parsed.items : [],
      reviewItemsCorrupt: !parsed.ok,
    };
    return summary ? { ...base, parseSummaryLine: summary } : base;
  });

  let crew: PerShowCrewRow[] = [];
  let crewLookupFailed = false;
  try {
    const { data, error } = await supabase
      .from("crew_members")
      .select("id, name, role")
      .eq("show_id", show.id)
      .order("name", { ascending: true })
      .returns<CrewMemberRow[]>();
    if (error) {
      console.error("[/admin/show/[slug]] crew_members lookup failed:", error.message);
      crewLookupFailed = true;
    } else {
      crew = data ?? [];
    }
  } catch (err) {
    console.error(
      "[/admin/show/[slug]] crew_members lookup threw:",
      err instanceof Error ? err.message : String(err),
    );
    crewLookupFailed = true;
  }

  // Share token (admin-only RPC). Wrapped per the CurrentShareLinkPanel
  // pattern — a thrown/absent token → no crew-link surfaces, never a dead URL.
  let token: string | null = null;
  try {
    token = await loadShowShareToken(show.id);
  } catch {
    token = null;
  }

  const now = await nowDate();

  // Archived-FIRST precedence (R10/R11): archived and published are independent
  // booleans; evaluate archived first so a drifted archived+published row still
  // reads "Archived", never "Published".
  const archived = Boolean(show.archived);
  const published = show.published;
  const isCrewLinkActive = published && !archived && token !== null;
  const crewUrl = isCrewLinkActive ? `${resolveOrigin()}/show/${slug}/${token}` : null;
  // Host-stripped display of the real crew URL (never the prototype's fake host).
  const crewPathDisplay = isCrewLinkActive ? `/show/${slug}/${token}` : null;

  const statusPill = archived
    ? ({ status: "idle", label: "Archived" } as const)
    : !published
      ? ({ status: "warn", label: "Publishing…" } as const)
      : ({ status: "positive", label: "Published" } as const);

  const syncBucket = syncStatusBucket(show.last_sync_status);
  const syncFooterLabel = show.last_synced_at
    ? `Last synced ${formatRelative(show.last_synced_at, now)}`
    : "Not synced yet";

  return (
    <main data-testid="admin-show-page" className="space-y-section-gap">
      <header className="space-y-2">
        <p className="text-sm text-text-subtle">
          <a href="/admin" className="underline underline-offset-2">
            ← Admin home
          </a>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-text-strong" data-testid="admin-show-title">
            {show.title}
          </h1>
          <span
            data-testid="admin-show-status-pill"
            className="inline-flex items-center rounded-pill border border-border px-2 py-0.5"
          >
            <StatusIndicator status={statusPill.status} label={statusPill.label} />
          </span>
        </div>
        <p className="text-sm text-text-subtle">
          Slug: <code className="rounded-sm bg-surface-sunken px-1">{show.slug}</code>
        </p>
        {isCrewLinkActive && crewUrl && crewPathDisplay ? (
          <div
            data-testid="admin-show-share-chip"
            className="flex items-center gap-2 text-sm text-text-subtle"
          >
            <span>Crew link:</span>
            <code className="min-w-0 break-all rounded-sm bg-surface-sunken px-2 py-0.5 text-xs text-text-strong">
              {crewPathDisplay}
            </code>
            <ShareLinkCopyButton url={crewUrl} />
          </div>
        ) : null}
      </header>

      <PerShowAlertSection
        showId={show.id}
        slug={show.slug}
        highlightAlertId={sp.alert_id ?? null}
      />

      {/* Two-col split: Crew ⟷ Share & access. md:items-stretch gives equal
          column height on desktop (Tailwind v4 default is NOT stretch, DESIGN
          §7). The columns must NOT also set h-full — height:100% on a flex child
          is a non-auto cross-size that SUPPRESSES align-items:stretch (the
          real-browser layout test caught this). Stacks on mobile. */}
      <div
        data-testid="per-show-split"
        className="flex flex-col gap-tile-gap md:flex-row md:items-stretch"
      >
        {/* Crew column (preview-as merged into each row) */}
        <section
          data-testid="per-show-crew-col"
          aria-label="Crew"
          className="flex min-w-0 flex-col gap-3 md:flex-1"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-text-strong">Crew</h2>
            {isCrewLinkActive && crewUrl ? (
              <a
                data-testid="admin-show-open-crew"
                href={crewUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-tap-min items-center text-sm font-semibold text-accent-on-bg underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                Open crew page →
              </a>
            ) : null}
          </div>

          {crewLookupFailed ? (
            <p
              data-testid="per-show-crew-lookup-failed"
              className="rounded-sm border border-border bg-warning-bg p-3 text-sm text-warning-text"
            >
              We could not load the crew list right now. Refresh the page; if the
              problem repeats, contact the developer.
            </p>
          ) : crew.length === 0 ? (
            <p data-testid="per-show-crew-empty" className="text-sm text-text-subtle">
              No crew members on this show yet. Once a sync brings them in, they
              will appear here.
            </p>
          ) : (
            <>
              {!(published && !archived) ? (
                <p
                  data-testid="admin-show-preview-as-unavailable"
                  className="rounded-sm border border-border bg-info-bg p-3 text-sm text-text-subtle"
                >
                  {archived
                    ? "This show is archived. Preview-as is unavailable."
                    : "This show is not published to crew yet. Preview becomes available once publishing finishes."}
                </p>
              ) : null}
              <ul className="flex flex-col gap-2">
                {crew.map((member) => {
                  const id = (member as { id?: string }).id ?? "";
                  const name = (member as { name?: string }).name ?? "";
                  const role = (member as { role?: string }).role ?? null;
                  if (!id || !name) return null;
                  return (
                    <li
                      key={id}
                      data-testid={`admin-show-crew-row-${id}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface p-tile-pad"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-xs font-semibold text-text-subtle"
                        >
                          {initialsFor(name)}
                        </span>
                        <div className="flex flex-col">
                          <span className="text-base font-semibold text-text-strong">{name}</span>
                          {role ? <span className="text-xs text-text-subtle">{role}</span> : null}
                        </div>
                      </div>
                      {published && !archived ? (
                        <Link
                          data-testid={`admin-show-preview-as-link-${id}`}
                          href={`/admin/show/${encodeURIComponent(show.slug)}/preview/${encodeURIComponent(id)}`}
                          className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                        >
                          Preview as
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        {/* Share & access column (rotate/reset folded in, gated) */}
        <section
          data-testid="per-show-share-col"
          aria-label="Share & access"
          className="flex flex-col gap-3 md:w-96 md:shrink-0"
        >
          <h2 className="text-lg font-semibold text-text-strong">Share &amp; access</h2>
          <p className="text-sm text-text-subtle">
            One share-link reaches the whole crew. Rotate the link if it leaks;
            reset the picker if a crew member needs to re-pick their identity.
          </p>
          {isCrewLinkActive ? (
            <CurrentShareLinkPanel showId={show.id} slug={show.slug} />
          ) : (
            <p
              data-testid="admin-share-link-inactive"
              className="rounded-sm border border-border bg-surface-sunken p-tile-pad text-sm text-text-subtle"
            >
              The crew link is inactive while this show is{" "}
              {archived ? "archived" : "unpublished"}. It will be available once the
              show is published.
            </p>
          )}
          {/* Rotate + Reset gated on published && !archived (R29 — finalize-owned
              write hazard; publishing rows are finalize-owned, archived are
              retired). The server-side RPC guard is §16 DEF-1. */}
          {published && !archived ? (
            <div className="flex flex-col items-end gap-4 border-t border-border pt-4">
              <ResetPickerEpochButton showId={show.id} />
              <RotateShareTokenButton
                showId={show.id}
                slug={show.slug}
                isCrewLinkActive={isCrewLinkActive}
              />
            </div>
          ) : null}
        </section>
      </div>

      {/* Parse warnings — read-only for an archived show (R32 / §16 DEF-2). */}
      <section
        data-testid="admin-show-parse-warnings-section"
        aria-labelledby="admin-show-parse-warnings-heading"
        className="flex flex-col gap-3"
      >
        <h2
          id="admin-show-parse-warnings-heading"
          className="text-lg font-semibold text-text-strong"
        >
          Parse warnings
        </h2>
        <ParsePanel rows={rows} showId={show.id} readOnly={archived} />
      </section>

      {/* Quiet sync footer (replaces the standalone Sync health section). */}
      <footer
        data-testid="admin-show-sync-footer"
        className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
      >
        <StatusIndicator status={syncBucket.bucket} label={syncFooterLabel} />
        <ReSyncButton slug={show.slug} />
      </footer>
    </main>
  );
}
