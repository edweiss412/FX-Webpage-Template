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
import { log } from "@/lib/log";
import { nowDate } from "@/lib/time/now";
import { HoverHelp } from "@/components/admin/HoverHelp";
import { PerShowAlertSection } from "@/components/admin/PerShowAlertSection";
import { ReSyncButton } from "@/components/admin/ReSyncButton";
import { StatusIndicator } from "@/components/admin/StatusIndicator";
import { AdminPageHeader } from "@/components/admin/nav/AdminPageHeader";
import { formatRelative, formatDateRange } from "@/lib/admin/showDisplay";
import { syncStatusBucket } from "@/lib/admin/syncStatus";
import { loadShowShareToken } from "@/lib/data/loadShowShareToken";
import { CREW_ROSTER_READ_CAP } from "./crewLinkMailto";
import { CurrentShareLinkPanel } from "./CurrentShareLinkPanel";
import { ShareTokenProvider } from "./ShareTokenContext";
import { ShareChip } from "./ShareChip";
import { CrewPageLink } from "./CrewPageLink";
import { PickerResetControl } from "./PickerResetControl";
import { ArchiveShowButton } from "@/components/admin/ArchiveShowButton";
import { UnarchiveShowButton } from "@/components/admin/UnarchiveShowButton";
import { PublishedToggle } from "@/components/admin/PublishedToggle";
import {
  archiveShowAction,
  setShowPublishedAction,
  unarchiveShowAction,
  mi11ApproveAction,
  mi11RejectAction,
  undoChangeAction,
} from "./_actions";
import { ChangesFeed } from "@/components/admin/ChangesFeed";
import { readShowChangeFeed } from "@/lib/sync/feed/readShowChangeFeed";
import { SyncInfraError } from "@/lib/sync/perFileProcessor";
import type { ParseWarning } from "@/lib/parser/types";
import {
  isDataQualityWarning,
  selectActionableForDisplay,
  OPERATOR_ACTIONABLE_ANCHORED,
  DATA_GAP_CLASS_LABELS,
} from "@/lib/parser/dataGaps";
import { normalizeUseRawDecisions, type UseRawDecision } from "@/lib/sync/useRawOverlay";
import { UseRawControlBoundary } from "@/components/admin/UseRawControlBoundary";
import { isMessageCode, messageFor } from "@/lib/messages/lookup";
import type { MessageCode } from "@/lib/messages/catalog";
import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import { CorrectionLoopCallout } from "@/components/admin/CorrectionLoopCallout";
import { DataQualityWarningControls } from "@/components/admin/DataQualityWarningControls";
import {
  BulkIgnoreControls,
  type BulkIgnoreGroupWithLabel,
} from "@/components/admin/BulkIgnoreControls";
import { loadIgnoredWarnings } from "@/lib/admin/loadIgnoredWarnings";
import { groupIgnorableByCode } from "@/lib/dataQuality/bulkIgnoreGroups";
import { partitionByIgnored } from "@/lib/dataQuality/partitionByIgnored";
import { buildReportSurfaceId } from "@/lib/dataQuality/warningFingerprint";

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
  venue: unknown;
  drive_file_id: string;
  published: boolean;
  archived: boolean;
  picker_epoch: number;
  last_synced_at: string | null;
  last_sync_status: string | null;
};

type CrewMemberRow = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
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
    void log.error("supabase client construction threw:", {
      source: "admin.show",
      code: "ADMIN_SHOW_CLIENT_CONSTRUCTION_FAILED",
      slug,
      error: err,
    });
    throw new Error("supabase_client_construction_failed");
  }

  let show: ShowLookupRow | null;
  try {
    const { data, error: showError } = await supabase
      .from("shows")
      .select(
        "id, slug, title, client_label, dates, venue, drive_file_id, published, archived, picker_epoch, last_synced_at, last_sync_status",
      )
      .eq("slug", slug)
      .limit(1)
      .maybeSingle<ShowLookupRow>();
    if (showError) {
      void log.error("show lookup failed:", {
        source: "admin.show",
        code: "ADMIN_SHOW_LOOKUP_FAILED",
        slug,
        error: showError.message,
      });
      throw new Error("show_lookup_failed");
    }
    show = data;
  } catch (err) {
    if (err instanceof Error && err.message === "show_lookup_failed") throw err;
    void log.error("show lookup threw:", {
      source: "admin.show",
      code: "ADMIN_SHOW_LOOKUP_THREW",
      slug,
      error: err,
    });
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
        void log.error("changes feed read failed:", {
          source: "admin.show",
          code: "ADMIN_SHOW_CHANGE_FEED_READ_FAILED",
          slug,
          showId: show.id,
          error: err,
        });
        return { feed: null, feedInfraError: true };
      }
      throw err;
    }
  };

  const readCrew = async (): Promise<{ crew: CrewMemberRow[]; crewLookupFailed: boolean }> => {
    try {
      const { data, error } = await supabase
        .from("crew_members")
        .select("id, name, role, email")
        .eq("show_id", show.id)
        .order("name", { ascending: true })
        .limit(CREW_ROSTER_READ_CAP + 1)
        .returns<CrewMemberRow[]>();
      if (error) {
        void log.error("crew_members lookup failed:", {
          source: "admin.show",
          code: "ADMIN_SHOW_CREW_LOOKUP_FAILED",
          slug,
          showId: show.id,
          error: error.message,
        });
        return { crew: [], crewLookupFailed: true };
      }
      const rows = data ?? [];
      if (rows.length > CREW_ROSTER_READ_CAP) {
        // Flow 5 adversarial R6/R7 — the roster MAY be incomplete at the
        // PostgREST row cap. A distribution list must be provably complete or
        // absent, and the display must never be silently partial: reuse the
        // existing visible crew-unavailable state.
        void log.error("crew_members roster exceeded read cap:", {
          source: "admin.show",
          code: "ADMIN_SHOW_CREW_ROSTER_OVERFLOW",
          slug,
          showId: show.id,
          error: `roster > CREW_ROSTER_READ_CAP (${CREW_ROSTER_READ_CAP})`,
        });
        return { crew: [], crewLookupFailed: true };
      }
      return { crew: rows, crewLookupFailed: false };
    } catch (err) {
      void log.error("crew_members lookup threw:", {
        source: "admin.show",
        code: "ADMIN_SHOW_CREW_LOOKUP_THREW",
        slug,
        showId: show.id,
        error: err,
      });
      return { crew: [], crewLookupFailed: true };
    }
  };

  // Share token (admin-only RPC). Wrapped per the CurrentShareLinkPanel
  // pattern — a thrown/absent token → no crew-link surfaces, never a dead URL.
  const readToken = async (): Promise<{ token: string | null; epoch: number }> => {
    try {
      return await loadShowShareToken(show.id);
    } catch (err) {
      // Fail-open forensic breadcrumb: a token read fault silently hid all
      // crew-link surfaces (fallback token=null) with no server trace. Keep the
      // SAME fallback; just record which show/why (invariant 9 — logging never
      // changes the fallback).
      void log.warn("share-token read failed:", {
        source: "admin.show",
        code: "ADMIN_SHOW_TOKEN_READ_FAILED",
        slug,
        showId: show.id,
        error: err,
      });
      // SAME fallback (crew-link surfaces hide on token=null); best-effort epoch
      // baseline from the show row so the client provider's monotonic gate has a
      // floor even when the atomic read faulted.
      return { token: null, epoch: show.picker_epoch ?? 1 };
    }
  };

  // parse-data-quality-warnings §6.5/§6.6 (Task 12) — the durable per-show "Data
  // quality" panel reads shows_internal.parse_warnings and lists each
  // warn-severity .message. INVARIANT 9 (R10 F1): { data, error } destructure;
  // a returned error OR a thrown error → `failed: true` (degraded VISIBLE notice,
  // mirroring the Changes-feed SyncInfraError degrade above), NEVER a silent
  // empty panel — collapsing a failed read to "no warnings" would recreate the
  // silent-drop this feature kills. null/absent row (genuinely no warnings) is
  // kept DISTINCT from a failure: messages=[], failed=false → panel simply
  // absent. Resolves to a typed local result and never rejects (Promise.all-safe).
  const readDataQuality = async (): Promise<{
    digest: ParseWarning[];
    actionable: ParseWarning[];
    useRawDecisions: UseRawDecision[];
    failed: boolean;
  }> => {
    // The supabase await + its error handling stay TIGHT in the try/catch (invariant 9 / the
    // _metaInfraContract proximity guard); the pure warnings→messages processing (no await, can't
    // throw the supabase fault) runs AFTER the try.
    let warnings: ParseWarning[];
    // Persisted use-raw decisions (spec §8): the SINGLE jsonb read boundary is
    // normalizeUseRawDecisions. A read fault → [] (the control degrades to
    // transform-active, never crashes the panel).
    let useRawDecisions: UseRawDecision[] = [];
    try {
      const { data, error } = await supabase
        .from("shows_internal")
        .select("parse_warnings, use_raw_decisions")
        .eq("show_id", show.id)
        .maybeSingle<{ parse_warnings: ParseWarning[] | null; use_raw_decisions: unknown }>();
      if (error) {
        void log.error("shows_internal read failed:", {
          source: "admin.show",
          code: "ADMIN_SHOW_INTERNAL_PARSE_WARNINGS_READ_FAILED",
          slug,
          showId: show.id,
          error: error.message,
        });
        return { digest: [], actionable: [], useRawDecisions: [], failed: true };
      }
      warnings = Array.isArray(data?.parse_warnings) ? data!.parse_warnings : [];
      useRawDecisions = normalizeUseRawDecisions(data?.use_raw_decisions ?? null);
    } catch (err) {
      void log.error("shows_internal read threw:", {
        source: "admin.show",
        code: "ADMIN_SHOW_INTERNAL_PARSE_WARNINGS_READ_THREW",
        slug,
        showId: show.id,
        error: err,
      });
      return { digest: [], actionable: [], useRawDecisions: [], failed: true };
    }
    // Gate on the three DATA-QUALITY codes before rendering .message (R1 [high]):
    // shows_internal.parse_warnings also holds non-DQ warn warnings whose message
    // can BE the raw code (asset reelWarning() → message: code), which would print a
    // raw §12.4 code (invariant 5) and misclassify it under "Data quality".
    // Exclude operator-actionable codes (e.g. FIELD_UNREADABLE, which is in BOTH
    // DATA_GAP_CODES and OPERATOR_ACTIONABLE_ANCHORED) from the flat .message
    // digest — they render once, below, as a titled card WITH a source-sheet
    // deep link (strictly better). The digest keeps the non-actionable data gaps
    // (UNKNOWN_SECTION_HEADER, BLOCK_DISAPPEARED). Avoids the double-render the
    // impeccable critique flagged.
    // The data-gap digest (UNKNOWN_SECTION_HEADER, BLOCK_DISAPPEARED) — the DQ codes that are
    // NOT operator-actionable-anchored. Kept as full ParseWarning objects (not flattened to
    // `.message`) so the panel can render each through the same per-warning card +
    // Report/Ignore controls as the operator-actionable warnings (DQIGNORE-1). The gate stays
    // isDataQualityWarning FIRST, preserving the invariant-5 protection against rendering a
    // non-DQ warn warning whose `.message` IS its raw §12.4 code.
    const digest = warnings.filter(
      (w) => isDataQualityWarning(w) && !OPERATOR_ACTIONABLE_ANCHORED.has(w.code),
    );
    // Carry the full warnings through too so the panel can render the operator-actionable subset
    // WITH their source-sheet deep links (selectActionableForDisplay filters + dedups).
    return { digest, actionable: warnings, useRawDecisions, failed: false };
  };

  const [
    { feed, feedInfraError },
    { crew, crewLookupFailed },
    { token, epoch: tokenEpoch },
    dataQuality,
    now,
    ignoredResult,
  ] = await Promise.all([
    readFeed(),
    readCrew(),
    readToken(),
    readDataQuality(),
    nowDate(),
    loadIgnoredWarnings(show.id),
  ]);

  // Flow 5 (audit 5.2) — distribution list for the "Email crew" affordances.
  // Emails are canonicalized-or-null at the parse boundary; this filter drops
  // nulls (the mailto helper applies the authoritative shape validator).
  const crewEmails = crew
    .map((c) => c.email)
    .filter((e): e is string => typeof e === "string" && e.includes("@"));

  // Operator-actionable parse warnings (filtered + deduped ONCE here, not in the
  // JSX condition and again in the component — whole-diff R1). selectActionableForDisplay
  // first neutralizes stale legacy UNKNOWN_FIELD block-range anchors (Part D) so
  // already-persisted shows self-heal at read time. The per-show Data Quality panel
  // renders these with source-sheet deep links below the data-gap digest.
  const actionableItems = selectActionableForDisplay(dataQuality.actionable);
  // DQIGNORE-1 — every data-quality warning renders as a per-warning card with Report/Ignore
  // controls. The data-gap digest (UNKNOWN_SECTION_HEADER, BLOCK_DISAPPEARED) leads (preserving
  // the prior visual order: data gaps above operator-actionable rows), followed by the deduped
  // operator-actionable warnings. The two sets are disjoint by code, so no warning double-renders.
  const displayWarnings = [...dataQuality.digest, ...actionableItems];
  // Partition displayable warnings into active vs ignored by content fingerprint. A
  // loadIgnoredWarnings infra_error → empty set → every warning shows active (fail toward
  // VISIBLE — never hide a warning on a read fault). Ignore state lives in a side table, so
  // it survives the parse_warnings full-replace on each sync. BLOCK_DISAPPEARED has no content
  // fingerprint (warningFingerprint → null), so it can never be ignored — it is always active.
  const ignoredFingerprints =
    ignoredResult.kind === "ok" ? ignoredResult.fingerprints : new Set<string>();
  const { active: activeActionable, ignored: ignoredActionable } = partitionByIgnored(
    displayWarnings,
    ignoredFingerprints,
  );
  // spec §8: the persisted use-raw decision for a warning is matched by
  // (code, resolution.contentHash) — NEVER by target. `<UseRawControl>` self-guards
  // out-of-scope / unresolvable warnings to null, so it's rendered unconditionally.
  const decisionFor = (w: ParseWarning): UseRawDecision | undefined =>
    dataQuality.useRawDecisions.find(
      (d) =>
        d.code === w.code &&
        w.resolution?.resolvable === true &&
        d.contentHash === w.resolution.contentHash,
    );
  // DQIGNORE-2 — bulk "Ignore all N of this type": for any code with >=2 distinct-content
  // ACTIVE ignorable warnings, offer a single action that fans out one precise
  // per-fingerprint ignore. The label is the plain-language type (catalog title, else the
  // data-gap class label) — never the raw §12.4 code (invariant 5). Empty when no code has
  // a bulk-eligible group; BulkIgnoreControls then renders nothing.
  const bulkGroupLabel = (code: string): string | null => {
    const title = isMessageCode(code) ? messageFor(code as MessageCode).title : null;
    if (title) return title;
    if (code in DATA_GAP_CLASS_LABELS) {
      return DATA_GAP_CLASS_LABELS[code as keyof typeof DATA_GAP_CLASS_LABELS];
    }
    return null;
  };
  const bulkIgnoreGroups: BulkIgnoreGroupWithLabel[] = groupIgnorableByCode(activeActionable).map(
    (group) => ({ ...group, label: bulkGroupLabel(group.code) }),
  );

  // Archived-FIRST precedence (R10/R11): archived and published are independent
  // booleans; evaluate archived first so a drifted archived+published row still
  // reads "Archived", never "Published".
  const archived = Boolean(show.archived);
  const published = show.published;

  // §3.2 finalize-owned ("Publishing…") vs Held discriminator. Same
  // authoritative source as the dashboard (components/admin/Dashboard.tsx:287):
  // the SECURITY DEFINER predicate public.readfinalizeowned_b2(p_show_id)
  // (migration 20260601000000:13, granted to authenticated in 20260601000002).
  // Queried for EVERY non-archived show (published-toggle R3): the predicate's
  // shows_pending_changes branch is NOT constrained to unpublished rows, so a
  // LIVE show mid-pending-changes-finalize is finalize-owned too — the toggle
  // must render ON-disabled there. Fail toward NOT-finalize-owned on ANY RPC
  // error (returned error, non-true value, or thrown fault): a transiently
  // enabled toggle is safe — the RPC's hard FINALIZE_OWNED_SHOW refusal is the
  // backstop (defense in depth).
  let finalizeOwned = false;
  if (!archived) {
    try {
      const { data, error } = await supabase.rpc("readfinalizeowned_b2", {
        p_show_id: show.id,
      });
      if (!error && data === true) finalizeOwned = true;
    } catch (err) {
      // thrown infra fault → fail toward Held (finalizeOwned stays false).
      // Fail-open forensic breadcrumb so this safe-but-silent RPC fault leaves a
      // server trace; the fallback (NOT-finalize-owned) is UNCHANGED.
      void log.warn("readfinalizeowned_b2 rpc threw:", {
        source: "admin.show",
        code: "ADMIN_SHOW_FINALIZE_OWNED_RPC_FAILED",
        slug,
        showId: show.id,
        error: err,
      });
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
  // Instant-rotate rework: the token-dependent surfaces (header ShareChip, Open
  // crew page CrewPageLink, the share URL in ShareLinkBody) now read the token
  // from ShareTokenProvider (seeded below) so a rotate updates them instantly.
  // The provider is seeded with the token ONLY for an eligible show — an
  // ineligible show never serializes the token to the client — and with the
  // atomic-read epoch as the monotonic floor. The child surfaces self-gate on
  // (isEligible && token != null), so an ineligible show or a null token hides
  // them without ever rendering /show/<slug>/null.
  const initialEpoch = tokenEpoch;

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
  // #16 compact crew-link chip (design crewchip.png). Now a client component that
  // reads the token from ShareTokenProvider and self-gates on
  // (isEligible && token != null) — updates instantly after a rotate.
  const chip = <ShareChip slug={show.slug} isEligible={isShowEligibleForCrewLink} />;

  return (
    <ShareTokenProvider
      key={show.id}
      initialToken={isShowEligibleForCrewLink ? token : null}
      initialEpoch={initialEpoch}
    >
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
                  Held — not published. Turn on{" "}
                  <a href="#share-access" className="font-semibold text-text-strong underline">
                    Published in Share &amp; access
                  </a>{" "}
                  to make it live.
                </p>
                <div className="flex flex-wrap items-start gap-3">
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
                    Everyone on this show&apos;s crew, one row per person. Once the show is
                    published (and not archived), each row gets a Preview as link to see their page
                    exactly as they do.
                  </p>
                </HoverHelp>
              </div>
              <CrewPageLink slug={show.slug} isEligible={isShowEligibleForCrewLink} />
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
            id="share-access"
            data-testid="per-show-share-col"
            aria-label="Share & access"
            className="flex scroll-mt-4 flex-col gap-3 min-[720px]:w-96 min-[720px]:shrink-0 min-[1280px]:w-120"
          >
            <h2 className="text-lg font-semibold text-text-strong">Share &amp; access</h2>
            <p className="text-sm text-text-subtle">
              One share-link reaches the whole crew. Rotate the link if it leaks; reset the picker
              if a crew member needs to re-pick their identity.
            </p>
            {/* Published toggle (spec §3.3, D2/D3): the single publish control — replaces the
              window-gated Undo auto-publish and the Held Publish button. Hidden ONLY on
              archived shows (their lifecycle section owns Unarchive); disabled whenever a
              finalize owns the show, in BOTH published states. */}
            {!archived ? (
              <PublishedToggle
                slug={show.slug}
                published={published}
                finalizeOwned={finalizeOwned}
                setPublished={setShowPublishedAction.bind(null, show.slug)}
              />
            ) : null}
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
                crewEmails={crewEmails}
                showTitle={show.title}
                isCrewLinkActive={isShowEligibleForCrewLink}
                // The rotate row lives inside ShareLinkBody (it reads the token from
                // the provider so a rotate updates the URL instantly). The page only
                // passes the reset control as a slot, rendered below the rotate row.
                resetSlot={<PickerResetControl showId={show.id} crew={crew} />}
              />
            ) : (
              <p
                data-testid="admin-share-link-inactive"
                className="rounded-sm border border-border bg-surface-sunken p-tile-pad text-sm text-text-subtle"
              >
                The crew link is inactive while this show is {archived ? "archived" : "unpublished"}
                . It will be available once the show is published.
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
          <section
            aria-labelledby="admin-changes-feed-error-heading"
            className="flex flex-col gap-3"
          >
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

        {/* parse-data-quality-warnings §6.5 — the durable per-show "Data quality"
          panel: each warn-severity parse warning's human .message (invariant 5 —
          never a raw code). Mode boundaries: a read FAILURE degrades to a calm
          notice (invariant 9, mirroring the Changes-feed degrade above); a clean
          read with zero warn-severity messages renders NOTHING (no empty shell).
          Static parse state → present/absent is instant, no animation. */}
        {dataQuality.failed ? (
          <section
            aria-labelledby="per-show-data-quality-error-heading"
            className="flex flex-col gap-3"
          >
            <h2
              id="per-show-data-quality-error-heading"
              className="text-lg font-semibold text-text-strong"
            >
              Data quality
            </h2>
            <p
              data-testid="per-show-data-quality-error"
              className="rounded-md border border-border bg-surface-sunken p-tile-pad text-sm text-text-subtle"
            >
              We couldn&rsquo;t read this show&rsquo;s data-quality notes right now. Refresh to try
              again.
            </p>
          </section>
        ) : activeActionable.length > 0 || ignoredActionable.length > 0 ? (
          <section
            data-testid="per-show-data-quality"
            aria-labelledby="per-show-data-quality-heading"
            className="flex flex-col gap-3"
          >
            <div className="flex items-center gap-2">
              <h2
                id="per-show-data-quality-heading"
                className="text-lg font-semibold text-text-strong"
              >
                Data quality
              </h2>
              <HoverHelp
                label="Help: Data quality"
                testId="per-show-data-quality-help"
                rootTestId="help-affordance--per-show-data-quality--tooltip"
                learnMore={{ href: "/help/admin/parse-warnings" }}
              >
                <p>
                  Things we noticed while reading this show&apos;s sheet that may have dropped data:
                  an unreadable field, an unrecognized section, or a block that vanished since the
                  last sync. These are advisory — the show still published.
                </p>
              </HoverHelp>
            </div>
            {/* Flow 3 (audit 3.1): correction-loop callout — how to fix a flagged value.
              Gated on an ACTIVE warning (ignored-only survives re-sync, so "we'll clear
              this" would be false) AND !archived (a retired show is read-only; the footer
              Re-sync is likewise suppressed, page.tsx #resync). Mounts its own <ReSyncButton>
              (data-testid admin-resync-button); the footer instance stays for sync-health. */}
            {activeActionable.length > 0 && !archived ? (
              <CorrectionLoopCallout mode="resync">
                <ReSyncButton slug={show.slug} />
              </CorrectionLoopCallout>
            ) : null}
            {/* DQIGNORE-2 — bulk "Ignore all N of this type", shown above the cards it
              acts on. Renders nothing unless a code has >=2 distinct-content active
              ignorable warnings. */}
            <BulkIgnoreControls slug={show.slug} groups={bulkIgnoreGroups} />
            {/* Every ACTIVE data-quality warning as a per-warning card: the data-gap
              digest (unknown section / removed block) leads, followed by the
              operator-actionable warnings (role/day/schedule/field) with a source-
              sheet deep link when the scan resolved the cell. Each card carries a
              Report control and (when the warning is content-fingerprintable) an
              Ignore control. Renders nothing when there are none. */}
            <PerShowActionableWarnings
              items={activeActionable}
              driveFileId={show.drive_file_id}
              renderItemControls={(w) => (
                <>
                  <DataQualityWarningControls
                    slug={show.slug}
                    showId={show.id}
                    warning={w}
                    driveFileId={show.drive_file_id}
                    mode="active"
                    reportSurfaceId={buildReportSurfaceId(show.slug, w)}
                  />
                  {/* spec §8: use-raw toggle for the 3 recoverable structural-transform
                      warnings; self-hides (null) for every other code. */}
                  <UseRawControlBoundary
                    surface="show"
                    showId={show.id}
                    warning={w}
                    decision={decisionFor(w)}
                  />
                </>
              )}
            />
            {/* Collapsible "Ignored (N)" subsection — content-keyed ignores that survive
              re-sync. Native <details>: chevron transform only, body instant (D9). */}
            {ignoredActionable.length > 0 ? (
              <details data-testid="per-show-ignored-warnings" className="group">
                <summary
                  data-testid="per-show-ignored-summary"
                  className="cursor-pointer list-none text-xs font-semibold uppercase tracking-eyebrow text-text-subtle hover:text-text [&::-webkit-details-marker]:hidden"
                >
                  Ignored ({ignoredActionable.length}){" "}
                  <span
                    aria-hidden="true"
                    className="ml-1 inline-block transition-transform group-open:rotate-90"
                  >
                    ▸
                  </span>
                </summary>
                <div className="mt-3" data-testid="per-show-ignored-list">
                  <PerShowActionableWarnings
                    items={ignoredActionable}
                    driveFileId={show.drive_file_id}
                    tone="muted"
                    renderItemControls={(w) => (
                      <>
                        <DataQualityWarningControls
                          slug={show.slug}
                          showId={show.id}
                          warning={w}
                          driveFileId={show.drive_file_id}
                          mode="ignored"
                          reportSurfaceId={buildReportSurfaceId(show.slug, w)}
                        />
                        {/* spec §8: use-raw toggle also available on an ignored in-scope
                            warning; self-hides (null) for every other code. */}
                        <UseRawControlBoundary
                          surface="show"
                          showId={show.id}
                          warning={w}
                          decision={decisionFor(w)}
                        />
                      </>
                    )}
                  />
                </div>
              </details>
            ) : null}
          </section>
        ) : null}

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
                How the last sync with this show&apos;s sheet went. We re-check on a schedule;
                Re-sync forces a fresh read right now.
              </p>
            </HoverHelp>
          </div>
          {/* Page-level "manage this show" actions, grouped right (M12.5 — the
            Live-case Archive control moved here from a standalone mid-page row).
            Archive shows ONLY for a Live show (published && !archived); Held
            keeps Archive grouped with Publish above, Archived shows Unarchive. */}
          <div className="flex flex-wrap items-center gap-3">
            {isShowEligibleForCrewLink ? (
              <ArchiveShowButton archiveAction={archiveShowAction.bind(null, show.slug)} compact />
            ) : null}
            {/* #resync — fragment target for the RESYNC_SHRINK_HELD alert action link
              ("Review & re-sync", lib/adminAlerts/alertActions.ts). Plain block wrapper so
              it's a single flex item and does not disturb the actions-row layout. */}
            <div id="resync">
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
          </div>
        </footer>
      </main>
    </ShareTokenProvider>
  );
}
