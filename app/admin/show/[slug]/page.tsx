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
 * The GLOBAL AlertBanner is dashboard + /admin/needs-attention only (M12.3,
 * amended by the needs-attention spec D-5) — it is NOT mounted here;
 * per-show alerts surface via this page's own "Alerts for this show" section.
 * requireAdmin() runs here as defense-in-depth. Every Supabase await wraps in
 * try/catch (AGENTS.md §1.9).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { nowDate } from "@/lib/time/now";
import { HoverHelp } from "@/components/admin/HoverHelp";
import { PerShowAlertSection } from "@/components/admin/PerShowAlertSection";
import { ReSyncButton } from "@/components/admin/ReSyncButton";
import { StatusIndicator } from "@/components/admin/StatusIndicator";
import { AdminPageHeader } from "@/components/admin/nav/AdminPageHeader";
import { formatRelative, formatDateRange } from "@/lib/admin/showDisplay";
import { syncStatusBucket } from "@/lib/admin/syncStatus";
import { loadShowShareToken } from "@/lib/data/loadShowShareToken";
import { CurrentShareLinkPanel } from "./CurrentShareLinkPanel";
import { resolveOrigin } from "./resolveOrigin";
import { ShareLinkCopyButton } from "./ShareLinkCopyButton";
import { ResetPickerEpochButton } from "./ResetPickerEpochButton";
import { RotateShareTokenButton } from "./RotateShareTokenButton";
import type { PerShowCrewRow } from "@/components/admin/PerShowCrewSection";
import { ArchiveShowButton } from "@/components/admin/ArchiveShowButton";
import { PublishShowButton } from "@/components/admin/PublishShowButton";
import { UnarchiveShowButton } from "@/components/admin/UnarchiveShowButton";
import { UndoAutoPublishButton } from "@/components/admin/UndoAutoPublishButton";
import {
  archiveShowAction,
  publishShowAction,
  unarchiveShowAction,
  mi11ApproveAction,
  mi11RejectAction,
  undoChangeAction,
  undoAutoPublishAction,
} from "./_actions";
import { ChangesFeed } from "@/components/admin/ChangesFeed";
import { readShowChangeFeed } from "@/lib/sync/feed/readShowChangeFeed";
import { SyncInfraError } from "@/lib/sync/perFileProcessor";

export const dynamic = "force-dynamic";

type ShowDatesJson = {
  travelIn?: string | null;
  set?: string | null;
  showDays?: unknown;
  travelOut?: string | null;
};

type ShowLookupRow = {
  id: string;
  slug: string;
  title: string;
  client_label: string | null;
  dates: ShowDatesJson | null;
  drive_file_id: string;
  published: boolean;
  archived: boolean;
  last_synced_at: string | null;
  last_sync_status: string | null;
  // M12.13 §6.1: the EXPIRY only (never the token itself — the secret stays
  // server-side; the undo action re-reads the token by slug). Drives
  // `undoWindowOpen = expires_at != null && expires_at > now`.
  unpublish_token_expires_at: string | null;
};

type CrewMemberRow = {
  id: string;
  name: string;
  role: string | null;
};

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

// Earliest/latest dates for the per-show subtitle range (#16). Mirrors the
// dashboard's deriveStart/deriveEnd intent (components/admin/Dashboard.tsx:74-97)
// — travelIn → set → first showDay for the start; last showDay → travelOut for
// the end — so the per-show header reads the same range the dashboard row does.
function deriveShowStart(dates: ShowDatesJson | null): string | null {
  if (!dates) return null;
  const candidates: string[] = [];
  if (typeof dates.travelIn === "string") candidates.push(dates.travelIn);
  if (typeof dates.set === "string") candidates.push(dates.set);
  if (Array.isArray(dates.showDays) && dates.showDays.length > 0) {
    const first = dates.showDays[0];
    if (typeof first === "string") candidates.push(first);
  }
  if (candidates.length === 0) return null;
  return candidates.sort()[0] ?? null;
}

function deriveShowEnd(dates: ShowDatesJson | null): string | null {
  if (!dates) return null;
  const candidates: string[] = [];
  if (Array.isArray(dates.showDays) && dates.showDays.length > 0) {
    const last = dates.showDays[dates.showDays.length - 1];
    if (typeof last === "string") candidates.push(last);
  }
  if (typeof dates.travelOut === "string") candidates.push(dates.travelOut);
  if (candidates.length === 0) return null;
  return candidates.sort().reverse()[0] ?? null;
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
        "id, slug, title, client_label, dates, drive_file_id, published, archived, last_synced_at, last_sync_status, unpublish_token_expires_at",
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

  // PERF (nav-perf phase 1, A4 part 2): once show.id is known, the changes-feed
  // read, the crew_members read, the share-token read, and nowDate() are all
  // independent, so they fan out in ONE Promise.all wave instead of a serial
  // chain. Each read keeps its EXACT existing error handling INSIDE its own
  // async closure (each resolves to a typed local result and never rejects), so
  // Promise.all never short-circuits — a feed SyncInfraError still degrades to
  // the calm notice (not a crash), the crew read still flips crewLookupFailed,
  // and a token fault still yields token=null. We Promise.all the result
  // promises (invariant 9 — destructure {data,error} at each boundary inside the
  // closure); NEVER allSettled.

  // Phase 6 — the per-show changes feed (auto-applied edits + MI-11 pending holds
  // + undo/reject log). Replaces the retired live whole-parse review mount: no
  // invariant stages a whole parse anymore (§8 / resolution #21 cutover). The feed
  // data layer reads server-side (service-role) after the requireAdmin above and
  // THROWS a typed SyncInfraError on an infra fault, which we degrade gracefully
  // rather than surfacing an unclassified 500 (invariant 9). The page does NO
  // second query for hold/disposition data — each entry carries its own action
  // payload (gate / changeLogId) from Phase 5 (PF14).
  const readFeed = async (): Promise<{
    feed: Awaited<ReturnType<typeof readShowChangeFeed>> | null;
    feedInfraError: boolean;
  }> => {
    try {
      return { feed: await readShowChangeFeed(show.id), feedInfraError: false };
    } catch (err) {
      // readShowChangeFeed wraps EVERY boundary fault as a typed SyncInfraError
      // (invariant 9 / P5-F1). Match by instanceof OR by the typed `name` so a
      // cross-realm instance (e.g. a duplicated module evaluation under test) is
      // still recognized; anything else is a genuine bug and re-throws.
      if (
        err instanceof SyncInfraError ||
        (err instanceof Error && err.name === "SyncInfraError")
      ) {
        console.error(
          "[/admin/show/[slug]] changes feed read failed:",
          err instanceof Error ? err.message : String(err),
        );
        return { feed: null, feedInfraError: true };
      }
      throw err;
    }
  };

  const readCrew = async (): Promise<{ crew: PerShowCrewRow[]; crewLookupFailed: boolean }> => {
    try {
      const { data, error } = await supabase
        .from("crew_members")
        .select("id, name, role")
        .eq("show_id", show.id)
        .order("name", { ascending: true })
        .returns<CrewMemberRow[]>();
      if (error) {
        console.error("[/admin/show/[slug]] crew_members lookup failed:", error.message);
        return { crew: [], crewLookupFailed: true };
      }
      return { crew: data ?? [], crewLookupFailed: false };
    } catch (err) {
      console.error(
        "[/admin/show/[slug]] crew_members lookup threw:",
        err instanceof Error ? err.message : String(err),
      );
      return { crew: [], crewLookupFailed: true };
    }
  };

  // Share token (admin-only RPC). Wrapped per the CurrentShareLinkPanel
  // pattern — a thrown/absent token → no crew-link surfaces, never a dead URL.
  const readToken = async (): Promise<string | null> => {
    try {
      return await loadShowShareToken(show.id);
    } catch {
      return null;
    }
  };

  const [{ feed, feedInfraError }, { crew, crewLookupFailed }, token, now] = await Promise.all([
    readFeed(),
    readCrew(),
    readToken(),
    nowDate(),
  ]);

  // Archived-FIRST precedence (R10/R11): archived and published are independent
  // booleans; evaluate archived first so a drifted archived+published row still
  // reads "Archived", never "Published".
  const archived = Boolean(show.archived);
  const published = show.published;

  // M12.13 §6.1 — the auto-publish undo safety net is OPEN iff a live token mint
  // exists and hasn't expired. The page never sees the token (secret stays
  // server-side); the expiry alone gates both in-app affordances (the footer
  // button and the SHOW_FIRST_PUBLISHED alert-row action). A manual publish mints
  // no token (B2), so its expiry is null → window closed → no affordance.
  const undoExpiresAt = show.unpublish_token_expires_at;
  const undoExpiresMs = undoExpiresAt ? Date.parse(undoExpiresAt) : NaN;
  const undoWindowOpen = Number.isFinite(undoExpiresMs) && undoExpiresMs > now.getTime();

  // §3.2 finalize-owned ("Publishing…") vs Held discriminator. Same
  // authoritative source as the dashboard (components/admin/Dashboard.tsx:287):
  // the SECURITY DEFINER predicate public.readfinalizeowned_b2(p_show_id)
  // (migration 20260601000000:13, granted to authenticated in 20260601000002).
  // Queried ONLY for the in-flight case (!published && !archived) — a published
  // or archived row is never finalize-owned. Fail toward NOT-finalize-owned
  // (i.e. "Held") on ANY RPC error: a returned error, a non-true value, or a
  // thrown fault all leave finalizeOwned=false, the safe/non-alarming label.
  let finalizeOwned = false;
  if (!published && !archived) {
    try {
      const { data, error } = await supabase.rpc("readfinalizeowned_b2", {
        p_show_id: show.id,
      });
      if (!error && data === true) finalizeOwned = true;
    } catch {
      // thrown infra fault → fail toward Held (finalizeOwned stays false)
    }
  }
  // Held = not published, not archived, and NOT finalize-owned (Publishing…).
  const isHeld = !published && !archived && !finalizeOwned;
  // SHOW eligibility (spec §6 R27/R29) — whether crew-link features apply at
  // all. Distinct from TOKEN presence: a transient loadShowShareToken failure
  // on an eligible show must NOT make the show read as unpublished/archived
  // (Codex R1). Rotate/reset visibility + the rotate-success URL + the
  // Share-panel CurrentShareLinkPanel-vs-inactive-notice decision key off this.
  const isShowEligibleForCrewLink = published && !archived;
  // TOKEN-dependent surfaces (header chip, Open crew page, the real crew URL)
  // need an actual token — never render /show/<slug>/null. CurrentShareLinkPanel
  // owns its OWN token-null "unavailable / rotate to recover" state, so it is
  // gated on show-eligibility, not token presence.
  const hasCrewLinkUrl = isShowEligibleForCrewLink && token !== null;
  const crewUrl = hasCrewLinkUrl ? `${resolveOrigin()}/show/${slug}/${token}` : null;
  // Host-stripped display of the real crew URL (never the prototype's fake host).
  const crewPathDisplay = hasCrewLinkUrl ? `/show/${slug}/${token}` : null;

  // #16 subtitle = client · dates (e.g. "Northwind Bank · 6/14/26 → 6/15/26").
  // Replaces the removed "Slug:" line (#18). Guard: render client alone when
  // dates are absent; render nothing when neither client nor a date range
  // exists (a partially-parsed show must not render an empty subtitle node).
  const clientLabel = typeof show.client_label === "string" ? show.client_label.trim() : "";
  const dateRangeLabel = formatDateRange(deriveShowStart(show.dates), deriveShowEnd(show.dates));
  const subtitleParts: string[] = [];
  if (clientLabel) subtitleParts.push(clientLabel);
  if (dateRangeLabel) subtitleParts.push(dateRangeLabel);
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(" · ") : null;

  // §3.2 precedence (extends the existing archived-FIRST order at the prior
  // :241-243): archived → "Archived"; else finalize-owned !published →
  // "Publishing…"; else !published → "Held" (neutral/idle, distinct from the
  // warn "Publishing…" pill); else "Published".
  const statusPill = archived
    ? ({ status: "idle", label: "Archived" } as const)
    : finalizeOwned && !published
      ? ({ status: "warn", label: "Publishing…" } as const)
      : !published
        ? ({ status: "idle", label: "Held — not published" } as const)
        : ({ status: "positive", label: "Published" } as const);

  const syncBucket = syncStatusBucket(show.last_sync_status);
  // Mirror ShowsTable's SyncCell (components/admin/ShowsTable.tsx:64-68) and the
  // syncStatus.ts:10-11 intent: a non-ok status must surface its TEXTUAL health
  // label, not just the dot color (StatusIndicator's dot is aria-hidden — a
  // color-only failure signal is an a11y/observability regression). ok → plain
  // "Last synced {rel}"; non-ok with a timestamp → "<label> · Last synced
  // {rel}"; never-synced → the bucket label ("Not synced yet" for null status).
  const syncFooterLabel = show.last_synced_at
    ? show.last_sync_status === "ok"
      ? `Last synced ${formatRelative(show.last_synced_at, now)}`
      : `${syncBucket.label} · Last synced ${formatRelative(show.last_synced_at, now)}`
    : syncBucket.label;

  // Task 4.3 (B1): the breadcrumb + back link + status pill + crew-link chip
  // consolidate into the shared <AdminPageHeader>. pill + chip are computed
  // from the page's already-fetched data (NO second query) and moved into
  // rightSlot. The in-body "← Admin home" link is removed (the header back
  // link is the single back affordance). The share-token / published &&
  // !archived gating is unchanged (Phase A contract).
  const pill = (
    <span
      data-testid="admin-show-status-pill"
      className="inline-flex items-center rounded-pill border border-border px-2 py-0.5"
    >
      <StatusIndicator status={statusPill.status} label={statusPill.label} />
    </span>
  );
  // #16 compact crew-link chip (design crewchip.png): a single pill showing the
  // host-stripped path (truncated) + a copy affordance — NOT the full URL splayed
  // inline (the old wide-input/full-URL chrome). The full URL stays reachable via
  // the copy action (clipboard payload) AND the title attribute for hover.
  const chip =
    hasCrewLinkUrl && crewUrl && crewPathDisplay ? (
      <div
        data-testid="admin-show-share-chip"
        title={crewUrl}
        className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-pill border border-border bg-surface px-2.5 py-1 text-xs text-text-subtle"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-3.5 shrink-0 text-text-subtle"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        <code className="min-w-0 truncate font-mono text-text-strong">{crewPathDisplay}</code>
        <ShareLinkCopyButton url={crewUrl} compact />
      </div>
    ) : null;

  return (
    <main data-testid="admin-show-page" className="space-y-section-gap">
      <AdminPageHeader
        crumb="Admin › Active shows"
        backHref="/admin"
        title={show.title}
        /* #16 subtitle = client · dates, rendered INSIDE the header (directly
           under the title, above the header divider) via subSlot. #18 removed
           the prior "Slug:" line — slug stays in routing but is noise for Doug. */
        subSlot={
          subtitle ? (
            <p data-testid="admin-show-subtitle" className="text-sm text-text-subtle">
              {subtitle}
            </p>
          ) : undefined
        }
        /* M12.9: the status pill is appended INLINE after the title
           ("… (R5) [Published]"); the share-link chip stays on the right,
           vertically centered against the title+subtitle block. */
        titleAppendSlot={pill}
        rightSlot={chip}
      />

      <PerShowAlertSection
        showId={show.id}
        slug={show.slug}
        highlightAlertId={sp.alert_id ?? null}
        /* M12.13 §6.3 — SHOW_FIRST_PUBLISHED rows render the shared undo action
           iff the token window is still open. The bound action is passed down so
           the section reuses the SAME server action as the footer button. */
        undoWindowOpen={undoWindowOpen}
        undoAutoPublishAction={undoAutoPublishAction.bind(null, show.slug)}
      />

      {/* Lifecycle actions + state disclosures (spec §2.2–§2.4). Mode boundaries:
          - Archived → persistent "links are dead" disclosure + one-tap Unarchive.
          - Held → "not published" disclosure + one-tap Publish + Archive (grouped).
          - Live → NO lifecycle section; the Archive control is grouped into the
            page footer alongside Re-sync (M12.5 — was an orphaned standalone row).
          - Publishing… (finalize-owned) → nothing (mid-publish; immutable).
          The section renders ONLY when it has content (archived OR held). */}
      {archived || isHeld ? (
        <section
          data-testid="per-show-lifecycle"
          aria-label="Show lifecycle"
          className="flex flex-col gap-3"
        >
          {archived ? (
            <>
              <p
                data-testid="archived-disclosure"
                role="status"
                className="rounded-sm border border-border bg-surface-sunken p-tile-pad text-sm text-text-subtle"
              >
                This show is archived. Crew links are dead. Unarchive and re-publish to bring it
                back.
              </p>
              <div className="flex">
                <UnarchiveShowButton showId={show.id} unarchiveAction={unarchiveShowAction} />
              </div>
            </>
          ) : (
            <>
              <p
                data-testid="held-disclosure"
                role="status"
                className="rounded-sm border border-border bg-surface-sunken p-tile-pad text-sm text-text-subtle"
              >
                Held — not published. Publish to make it live, then issue a crew link.
              </p>
              <div className="flex flex-wrap items-start gap-3">
                <PublishShowButton
                  publishAction={publishShowAction.bind(null, show.slug)}
                  slug={show.slug}
                />
                <ArchiveShowButton archiveAction={archiveShowAction.bind(null, show.slug)} />
              </div>
            </>
          )}
        </section>
      ) : null}

      {/* Two-col split: Crew ⟷ Share & access. min-[720px]:items-stretch gives equal
          column height on desktop (Tailwind v4 default is NOT stretch, DESIGN
          §7). The columns must NOT also set h-full — height:100% on a flex child
          is a non-auto cross-size that SUPPRESSES align-items:stretch (the
          real-browser layout test caught this). Stacks on mobile. */}
      <div
        data-testid="per-show-split"
        className="flex flex-col gap-tile-gap min-[720px]:flex-row min-[720px]:items-stretch"
      >
        {/* Crew column (preview-as merged into each row) */}
        <section
          data-testid="per-show-crew-col"
          aria-label="Crew"
          className="flex min-w-0 flex-col gap-3 min-[720px]:flex-1"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* M12.12 matrix row 9 — div wrapper (not span): HoverHelp's root
                is a div, and span>div is invalid nesting. */}
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-text-strong">Crew</h2>
              <HoverHelp
                label="Help: Crew"
                testId="per-show-crew-help"
                rootTestId="help-affordance--per-show-crew--tooltip"
                learnMore={{ href: "/help/admin/preview-as-crew" }}
              >
                {/* M12.12 follow-up — per-row Preview as links render only when
                    published && !archived (the gate below), so this copy scopes
                    the promise to the published state instead of describing a
                    link an unpublished/archived render doesn't contain. */}
                <p>
                  Everyone on this show&apos;s crew, one row per person. Once the show is published
                  (and not archived), each row gets a Preview as link to see their page exactly as
                  they do.
                </p>
              </HoverHelp>
            </div>
            {hasCrewLinkUrl && crewUrl ? (
              // aria-label drops the decorative "→" from the accessible name
              // without splitting the text run (inline-flex drops the space
              // between split items — byte-level screenshot drift).
              <a
                data-testid="admin-show-open-crew"
                href={crewUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Open crew page"
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
              We could not load the crew list right now. Refresh the page; if the problem repeats,
              contact the developer.
            </p>
          ) : crew.length === 0 ? (
            <p data-testid="per-show-crew-empty" className="text-sm text-text-subtle">
              No crew members on this show yet. Once a sync brings them in, they will appear here.
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
          className="flex flex-col gap-3 min-[720px]:w-96 min-[720px]:shrink-0 min-[1280px]:w-120"
        >
          <h2 className="text-lg font-semibold text-text-strong">Share &amp; access</h2>
          <p className="text-sm text-text-subtle">
            One share-link reaches the whole crew. Rotate the link if it leaks; reset the picker if
            a crew member needs to re-pick their identity.
          </p>
          {isShowEligibleForCrewLink ? (
            // Pass the page's SINGLE token snapshot (Codex R2) so the header
            // chip and this panel can never render two different tokens from a
            // concurrent rotation. CurrentShareLinkPanel renders the URL when
            // the token exists and its own "unavailable — refresh / rotate"
            // recovery state when token is null — so a transient read failure on
            // a published show is NOT mislabeled "unpublished/archived" (R1).
            //
            // M12.5: Rotate + Reset are folded INTO the share-link card as a
            // divider-separated actions block (was a separate block below the
            // card). Gated on published && !archived (R29 — finalize-owned write
            // hazard); server-side RPC guard is §16 DEF-1. isCrewLinkActive =
            // show eligibility (NOT token presence, spec §6 R27) so a rotate
            // success URL shows even if the initial token read failed (R1).
            <CurrentShareLinkPanel
              showId={show.id}
              slug={show.slug}
              token={token}
              actions={
                // M12.6/M12.7: align with the design — each management action is a
                // labeled row (label + description left, compact button right) that
                // the button component OWNS, so its two-tap confirm + success states
                // render FULL-WIDTH below the label row (not cramped in a right cell).
                <div className="flex flex-col divide-y divide-border border-t border-border">
                  <RotateShareTokenButton
                    showId={show.id}
                    slug={show.slug}
                    isCrewLinkActive={isShowEligibleForCrewLink}
                    compact
                    rowLabel="Rotate share link"
                    rowDescription="Mint a new link; the old one stops working immediately."
                  />
                  <ResetPickerEpochButton
                    showId={show.id}
                    compact
                    rowLabel="Reset name picker"
                    rowDescription="Everyone re-picks who they are on their next visit."
                  />
                </div>
              }
            />
          ) : (
            <p
              data-testid="admin-share-link-inactive"
              className="rounded-sm border border-border bg-surface-sunken p-tile-pad text-sm text-text-subtle"
            >
              The crew link is inactive while this show is {archived ? "archived" : "unpublished"}.
              It will be available once the show is published.
            </p>
          )}
        </section>
      </div>

      {/* Changes feed (Phase 6) — replaces the retired live whole-parse review
          mount. Routine sheet edits auto-apply and land here with a per-item Undo;
          MI-11 (existing-crew email change) pending holds surface inline with
          Approve/Reject. A feed read infra fault degrades to a calm notice rather
          than an unclassified 500 (invariant 9). */}
      {feedInfraError || feed === null ? (
        <section aria-labelledby="admin-changes-feed-error-heading" className="flex flex-col gap-3">
          <h2
            id="admin-changes-feed-error-heading"
            className="text-lg font-semibold text-text-strong"
          >
            Changes
          </h2>
          <p
            data-testid="change-feed-infra-error"
            className="rounded-md border border-border bg-surface-sunken p-tile-pad text-sm text-text-subtle"
          >
            We couldn&rsquo;t load this show&rsquo;s changes right now. Refresh to try again.
          </p>
        </section>
      ) : (
        <ChangesFeed
          entries={feed.entries}
          truncated={feed.truncated}
          now={now}
          undoAction={undoChangeAction}
          approveAction={mi11ApproveAction}
          rejectAction={mi11RejectAction}
        />
      )}

      {/* Quiet sync footer (replaces the standalone Sync health section). */}
      <footer
        data-testid="admin-show-sync-footer"
        className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
      >
        {/* M12.12 matrix row 7 — the help affordance rides the status side of
            the justified-between footer (div wrapper, not span: HoverHelp's
            root is a div and span>div is invalid nesting). */}
        <div className="flex items-center gap-2">
          <StatusIndicator status={syncBucket.bucket} label={syncFooterLabel} />
          <HoverHelp
            label="Help: Sync status"
            testId="per-show-sync-help"
            rootTestId="help-affordance--per-show-sync-footer--tooltip"
            learnMore={{ href: "/help/admin/per-show-panel#sync-health" }}
          >
            <p>
              How the last sync with this show&apos;s sheet went. We re-check on a schedule; Re-sync
              forces a fresh read right now.
            </p>
          </HoverHelp>
        </div>
        {/* Page-level "manage this show" actions, grouped right (M12.5 — the
            Live-case Archive control moved here from a standalone mid-page row).
            Archive shows ONLY for a Live show (published && !archived); Held
            keeps Archive grouped with Publish above, Archived shows Unarchive. */}
        <div className="flex flex-wrap items-center gap-3">
          {/* M12.13 §6.2/§6.4 — the in-app undo, beside Archive/Re-sync, rendered
              iff the token window is open AND the show is Live (published &&
              !archived). Post-undo the show is archived → this disappears and the
              Re-sync-paused note + archived affordances take over. */}
          {undoWindowOpen && published && !archived ? (
            <UndoAutoPublishButton
              slug={show.slug}
              undoAction={undoAutoPublishAction.bind(null, show.slug)}
              testId="undo-auto-publish-footer"
            />
          ) : null}
          {isShowEligibleForCrewLink ? (
            <ArchiveShowButton archiveAction={archiveShowAction.bind(null, show.slug)} compact />
          ) : null}
          {archived ? (
            // Archived shows are the read-only surface; Re-sync mutates shows /
            // pending_syncs via /api/admin/sync, whose only server gate is
            // finalize-ownership (NOT archived — lib/sync/runManualSyncForShow.ts).
            // Suppress the CTA so this page never invites mutating a retired show.
            // The server-side archived refusal is deferred (DEFERRED.md DEF-3).
            <span data-testid="admin-show-resync-archived" className="text-sm text-text-subtle">
              Re-sync is paused while this show is archived.
            </span>
          ) : (
            <ReSyncButton slug={show.slug} />
          )}
        </div>
      </footer>
    </main>
  );
}
