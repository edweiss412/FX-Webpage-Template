/**
 * app/admin/show/[slug]/page.tsx
 * (consolidated-admin-show-page spec §4–§6, §10 — Task 13 page rebuild)
 *
 * The consolidated per-show admin page. It reads the whole published-review
 * surface through ONE statement-consistent entry point — `readShowReviewSnapshot`
 * over the `get_admin_show_review_snapshot` RPC (§3.3a) — builds the mode-agnostic
 * `PublishedSectionData` (§3.2), derives the per-section warning model server-side
 * (crypto), and renders the client `PublishedReviewPage` shell: the pinned
 * StatusStrip over the shared `ShowReviewSurface` with Overview first, Changes
 * last, and per-section warning controls under each parsed section.
 *
 * Posture preserved from the prior page (§6 / §11):
 *   - `requireAdmin()` runs here (defense in depth); a snapshot `not_admin_or_missing`
 *     → `notFound()`; a snapshot `infra_error` → throw (existing error boundary,
 *     never a raw code in UI — invariant 5).
 *   - Crew-link surfaces (share panel, rotate/reset, Preview-As) gate on
 *     `published && !archived`; archived is read-only.
 *   - Every Supabase await destructures `{ data, error }` (invariant 9); a feed
 *     `SyncInfraError` degrades to a calm notice, not a 500.
 *
 * Read-path pin (`tests/admin/_showReviewReadPathPin.test.ts`): the only `.from()`
 * here is the slug→id lookup on `shows` (needed to CALL the snapshot RPC, which
 * takes `p_show_id`); the crew/rooms/hotels/transport/contacts reads all flow
 * through the snapshot RPC — the prior direct `crew_members` read is GONE (its
 * allowlist row is removed in the same change).
 */
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import { nowDate } from "@/lib/time/now";
import { isShowLiveOnDate } from "@/lib/time/showSpan";
import { formatIsoForTimezone } from "@/lib/time/rightNow";
import { resolveShowTimezone } from "@/lib/time/showTimezone";
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";
import { readShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
import { loadIgnoredWarnings } from "@/lib/admin/loadIgnoredWarnings";
import { loadShowShareToken } from "@/lib/data/loadShowShareToken";
import { readShowChangeFeed } from "@/lib/sync/feed/readShowChangeFeed";
import { SyncInfraError } from "@/lib/sync/perFileProcessor";
import { fetchPerShowAlerts, PerShowAlertSection } from "@/components/admin/PerShowAlertSection";
import { renderedSectionIds } from "@/components/admin/review/sectionInclusion";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { ParseWarning } from "@/lib/parser/types";
import {
  isDataQualityWarning,
  selectActionableForDisplay,
  OPERATOR_ACTIONABLE_ANCHORED,
} from "@/lib/parser/dataGaps";
import { partitionByIgnored } from "@/lib/dataQuality/partitionByIgnored";
import { CREW_ROSTER_READ_CAP } from "./crewLinkMailto";
import { CurrentShareLinkPanel } from "./CurrentShareLinkPanel";
import { ShareTokenProvider } from "./ShareTokenContext";
import { PickerResetControl, type PickerResetCrewRow } from "./PickerResetControl";
import {
  archiveShowAction,
  setShowPublishedAction,
  unarchiveShowAction,
  mi11ApproveAction,
  mi11RejectAction,
  undoChangeAction,
  acceptChangeAction,
  acceptAllAction,
} from "./_actions";
import { PublishedReviewPage } from "@/components/admin/showpage/PublishedReviewPage";

export const dynamic = "force-dynamic";

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
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

  // slug → id: the snapshot RPC takes `p_show_id`, but the route is keyed by
  // slug. This minimal lookup on `shows` (NOT a review table — read-path pin
  // allows it) resolves the id + is the notFound gate for a missing show.
  // The lookup await + its error handling stay INSIDE the try (the
  // _metaInfraContract proximity guard); `notFound()` is a control-flow signal
  // and lives OUTSIDE it so the catch never swallows it.
  let showIdRow: { id: string } | null;
  try {
    const { data, error } = await supabase
      .from("shows")
      .select("id")
      .eq("slug", slug)
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (error) {
      void log.error("show id lookup failed:", {
        source: "admin.show",
        code: "ADMIN_SHOW_LOOKUP_FAILED",
        slug,
        error: error.message,
      });
      throw new Error("show_lookup_failed");
    }
    showIdRow = data;
  } catch (err) {
    if (err instanceof Error && err.message === "show_lookup_failed") throw err;
    void log.error("show id lookup threw:", {
      source: "admin.show",
      code: "ADMIN_SHOW_LOOKUP_THREW",
      slug,
      error: err,
    });
    throw new Error("show_lookup_failed");
  }
  if (!showIdRow) notFound();
  const showId = showIdRow.id;

  // Statement-consistent published-review snapshot (§3.3a). not_admin_or_missing
  // → notFound() (requireAdmin already ran; this is the show-missing/RLS gate);
  // infra_error → throw to the error boundary (no raw code in UI, invariant 5).
  const snapResult = await readShowReviewSnapshot(supabase, showId);
  if (snapResult.kind === "not_admin_or_missing") notFound();
  if (snapResult.kind === "infra_error") {
    throw new Error("show_review_snapshot_failed");
  }
  const snapshot = snapResult.snapshot;
  const show = snapshot.show;

  const publishedData = buildPublishedSectionData(snapshot, { slug });
  const { archived, published, dates, venue, driveFileId } = publishedData;
  const title = publishedData.title || null;
  const lastSyncedAt = str(show.last_synced_at);
  const lastSyncStatus = str(show.last_sync_status);
  const pickerEpoch = typeof show.picker_epoch === "number" ? show.picker_epoch : 1;
  const isShowEligibleForCrewLink = published && !archived;

  // §3.2 finalize-owned ("Publishing…") — same SECURITY DEFINER predicate the
  // dashboard uses. Queried for every non-archived show; fail toward
  // NOT-finalize-owned on any RPC fault (the RPC's hard refusal is the backstop).
  let finalizeOwned = false;
  if (!archived) {
    try {
      const { data, error } = await supabase.rpc("readfinalizeowned_b2", { p_show_id: showId });
      if (!error && data === true) finalizeOwned = true;
    } catch (err) {
      void log.warn("readfinalizeowned_b2 rpc threw:", {
        source: "admin.show",
        code: "ADMIN_SHOW_FINALIZE_OWNED_RPC_FAILED",
        slug,
        showId,
        error: err,
      });
    }
  }

  // Independent post-snapshot reads fan out in one wave (each resolves to a
  // typed local result and never rejects, so Promise.all never short-circuits).
  const readFeed = async (): Promise<{
    feed: Awaited<ReturnType<typeof readShowChangeFeed>> | null;
  }> => {
    try {
      return { feed: await readShowChangeFeed(showId) };
    } catch (err) {
      if (
        err instanceof SyncInfraError ||
        (err instanceof Error && err.name === "SyncInfraError")
      ) {
        void log.error("changes feed read failed:", {
          source: "admin.show",
          code: "ADMIN_SHOW_CHANGE_FEED_READ_FAILED",
          slug,
          showId,
          error: err,
        });
        return { feed: null };
      }
      throw err;
    }
  };

  const readToken = async (): Promise<{ token: string | null; epoch: number }> => {
    try {
      return await loadShowShareToken(showId);
    } catch (err) {
      void log.warn("share-token read failed:", {
        source: "admin.show",
        code: "ADMIN_SHOW_TOKEN_READ_FAILED",
        slug,
        showId,
        error: err,
      });
      return { token: null, epoch: pickerEpoch };
    }
  };

  const [{ feed }, { token, epoch: tokenEpoch }, now, ignoredResult, alertsForCount] =
    await Promise.all([
      readFeed(),
      readToken(),
      nowDate(),
      loadIgnoredWarnings(showId),
      fetchPerShowAlerts(showId),
    ]);

  // §5.1 alert-count badge: open non-health alerts for this show (the
  // PerShowAlertSection count query). Any fault → 0 (badge hidden — safe degrade).
  const alertCount = Array.isArray(alertsForCount) ? alertsForCount.length : 0;

  // Ignored-warning fingerprints (side table, survives the parse_warnings
  // full-replace). An infra_error → empty set → every warning shows active
  // (fail toward VISIBLE, never hide a warning on a read fault).
  const ignoredFingerprints =
    ignoredResult.kind === "ok" ? ignoredResult.fingerprints : new Set<string>();

  // §5.3 per-section warning model (SERVER, crypto): routed by the SAME
  // `warningsBySection` the surface uses for its rail chips, partitioned by
  // ignored fingerprint, each warning stamped with its report surface id.
  // Section inclusion via the PURE server-safe module (§5.3). The registry
  // proper — `step3Sections` — lives in a `"use client"` module; invoking it
  // here (a Server Component) throws (client exports are opaque server
  // references). `renderedSectionIds` carries the same inclusion logic with no
  // client dependency (lockstep-pinned to `step3Sections`).
  const sectionIds = new Set<SectionId>(renderedSectionIds(publishedData));
  const bySection = buildSectionWarningModel({
    slug,
    warnings: publishedData.warnings,
    ignoredFingerprints,
    renderedSectionIds: sectionIds,
  });

  // §5.1 correction-loop gate — mirrors the prior page's actionable-warnings
  // partition so the Overview Re-sync framing matches today: the data-gap digest
  // (unknown section / removed block) + the deduped operator-actionable warnings,
  // minus ignored ones. Empty → a standalone Re-sync (no callout).
  const digest = publishedData.warnings.filter(
    (w: ParseWarning) => isDataQualityWarning(w) && !OPERATOR_ACTIONABLE_ANCHORED.has(w.code),
  );
  const displayWarnings = [...digest, ...selectActionableForDisplay(publishedData.warnings)];
  const { active: activeActionable } = partitionByIgnored(displayWarnings, ignoredFingerprints);
  const hasActionableWarnings = activeActionable.length > 0;

  // §5.5 roster read cap — the snapshot RPC returns the full roster (no PostgREST
  // cap), so honor the cap post-read: over the cap, the actionable roster
  // affordances (Preview-As links + the Email-crew distribution list) are blanked
  // rather than handing out a provably-oversized/partial-seeming set (Flow 5
  // R6/R7 completeness rule). The crew SECTION still renders every row (display).
  const rosterOverCap = snapshot.crew_members.length > CREW_ROSTER_READ_CAP;
  if (rosterOverCap) {
    void log.warn("crew roster exceeded read cap:", {
      source: "admin.show",
      code: "ADMIN_SHOW_CREW_ROSTER_OVERFLOW",
      slug,
      showId,
      error: `roster > CREW_ROSTER_READ_CAP (${CREW_ROSTER_READ_CAP})`,
    });
  }
  const surfaceData = rosterOverCap ? { ...publishedData, previewRoster: [] } : publishedData;
  const crewEmails = rosterOverCap
    ? []
    : publishedData.crewMembers
        .map((c) => c.email)
        .filter((e): e is string => typeof e === "string" && e.includes("@"));

  // Per-crew picker-reset rows (id + name + role) from the snapshot roster.
  const pickerCrew: PickerResetCrewRow[] = snapshot.crew_members.map((r) => {
    const row = (r ?? {}) as Record<string, unknown>;
    return { id: str(row.id) ?? "", name: str(row.name) ?? "", role: str(row.role) };
  });

  // Live-now (§4): the SAME rule the dashboard uses (Dashboard.tsx:483-484);
  // the strip does NOT re-derive it (Task 10 contract).
  const todayIso = formatIsoForTimezone(now, resolveShowTimezone(venue as never));
  const isLive = published && isShowLiveOnDate(dates as never, todayIso);

  const openSheetHref = buildSheetDeepLink(driveFileId);

  // Server-rendered slots (admin-only reads stay on the server; passed to the
  // client shell as ReactNode props — RSC boundary).
  const alertSlot = (
    <PerShowAlertSection showId={showId} slug={slug} highlightAlertId={sp.alert_id ?? null} />
  );
  const shareSlot = (
    <CurrentShareLinkPanel
      showId={showId}
      slug={slug}
      crewEmails={crewEmails}
      showTitle={publishedData.title}
      isCrewLinkActive={isShowEligibleForCrewLink}
      resetSlot={<PickerResetControl showId={showId} crew={pickerCrew} />}
    />
  );

  return (
    <ShareTokenProvider
      key={showId}
      initialToken={isShowEligibleForCrewLink ? token : null}
      initialEpoch={tokenEpoch}
    >
      <PublishedReviewPage
        data={surfaceData}
        bySection={bySection}
        slug={slug}
        showId={showId}
        title={title}
        archived={archived}
        published={published}
        finalizeOwned={finalizeOwned}
        setPublished={setShowPublishedAction.bind(null, slug)}
        isLive={isLive}
        lastSyncedAt={lastSyncedAt}
        lastSyncStatus={lastSyncStatus}
        now={now}
        alertCount={alertCount}
        openSheetHref={openSheetHref}
        hasActionableWarnings={hasActionableWarnings}
        archiveAction={archiveShowAction.bind(null, slug)}
        unarchiveAction={unarchiveShowAction}
        alertSlot={alertSlot}
        shareSlot={shareSlot}
        feed={feed}
        undoAction={undoChangeAction}
        acceptAction={acceptChangeAction}
        acceptAllAction={acceptAllAction}
        approveAction={mi11ApproveAction}
        rejectAction={mi11RejectAction}
      />
    </ShareTokenProvider>
  );
}
