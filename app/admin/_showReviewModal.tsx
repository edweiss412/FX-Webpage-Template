/**
 * app/admin/_showReviewModal.tsx
 * (admin-show-modal spec §4 — Task 7 server loader)
 *
 * The published show review surface as the dashboard's `/admin?show=<slug>`
 * modal. This async Server Component is the VERBATIM transplant of the
 * consolidated per-show page body (app/admin/show/[slug]/page.tsx:87-380 at the
 * move): it reads the whole published-review surface through ONE
 * statement-consistent entry point — `readShowReviewSnapshot` over the
 * `get_admin_show_review_snapshot` RPC (§3.3a) — builds the mode-agnostic
 * `PublishedSectionData` (§3.2), derives the per-section warning model
 * server-side (crypto), and renders the client `PublishedReviewModal` shell:
 * the ReviewModalShell chrome with StatusStrip in the header over the shared
 * `ShowReviewSurface` with Overview first, Changes last, and per-section
 * warning controls under each parsed section.
 *
 * Deltas from the page body (spec §4 / D8 — the ONLY changes):
 *   - the two `notFound()` sites (absent slug row; snapshot
 *     `not_admin_or_missing`) become `redirect("/admin")` — a missing/blocked
 *     show closes the modal back to the dashboard instead of 404ing it;
 *   - direct `{ slug, alertId }` args replace params/searchParams plumbing;
 *   - renders `<PublishedReviewModal … alertId>` instead of
 *     `<PublishedReviewPage>` (same prop payload + the §3 one-shot highlight).
 *
 * Posture preserved (§6 / §11): infra faults (client construction, lookup
 * returned-error, lookup throw, snapshot `infra_error`) still THROW to the
 * error boundary — never a raw code in UI (invariant 5). Crew-link surfaces
 * (share panel, rotate/reset, Preview-As) gate on `published && !archived`;
 * archived is read-only. Every Supabase await destructures `{ data, error }`
 * (invariant 9); a feed `SyncInfraError` degrades to a calm notice, not a 500.
 *
 * Read-path pin (`tests/admin/_showReviewReadPathPin.test.ts`): the only
 * `.from()` here is the slug→id lookup on `shows` (needed to CALL the snapshot
 * RPC, which takes `p_show_id`); the crew/rooms/hotels/transport/contacts
 * reads all flow through the snapshot RPC.
 */
import { redirect } from "next/navigation";
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
import { fetchPerShowAlerts } from "@/lib/adminAlerts/fetchPerShowAlerts";
import { deriveAttentionItems } from "@/lib/admin/attentionItems";
import { renderedSectionIds } from "@/components/admin/review/sectionInclusion";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import { CREW_ROSTER_READ_CAP } from "@/app/admin/show/[slug]/crewLinkMailto";
import { ShareTokenProvider } from "@/app/admin/show/[slug]/ShareTokenContext";
import { ShowRealtimeBridge } from "@/components/realtime/ShowRealtimeBridge";
import type { PickerResetCrewRow } from "@/app/admin/show/[slug]/PickerResetControl";
import {
  archiveShowAction,
  setShowPublishedAction,
  unarchiveShowAction,
  mi11ApproveAction,
  mi11RejectAction,
  undoChangeAction,
  acceptChangeAction,
  acceptAllAction,
} from "@/app/admin/show/[slug]/_actions";
import { PublishedReviewModal } from "@/components/admin/showpage/PublishedReviewModal";

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export async function ShowReviewModal({ slug, alertId }: { slug: string; alertId: string | null }) {
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

  // slug → id: the snapshot RPC takes `p_show_id`, but the modal is keyed by
  // slug. This minimal lookup on `shows` (NOT a review table — read-path pin
  // allows it) resolves the id + is the missing-show gate.
  // The lookup await + its error handling stay INSIDE the try (the
  // _metaInfraContract proximity guard); `redirect()` is a control-flow signal
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
  if (!showIdRow) redirect("/admin");
  const showId = showIdRow.id;

  // Realtime-refresh spec §4.1: viewer_version_token, TOKEN-FIRST — sampled
  // serially BEFORE the data wave (the getShowForViewer.ts:920-935 read-order
  // precedent, audit idx19): data-then-token lets a write committing between
  // the reads yield fresh-token + stale-data, which suppresses the bridge's
  // catch-up refresh → stuck stale. NEVER cached (a cache wrapper would
  // re-serve a stale fence forever → refresh loop; pinned by the read-path
  // meta-test — which is also why this comment avoids naming the wrapper).
  // Fault posture (§4.2): fail OPEN — log the forensic code and render this
  // pass without the bridge; the modal's revalidate-on-open refresh re-runs
  // the loader and recovers the bridge when the read heals. Named closure
  // (not inline try/catch) so the invariant-9 registry row in
  // tests/admin/_metaInfraContract.test.ts can grep the helper by name.
  const readBridgeVersionToken = async (): Promise<string | null> => {
    try {
      const { data, error } = await supabase.rpc("viewer_version_token", { p_show_id: showId });
      if (error) {
        void log.warn("viewer version token read failed:", {
          source: "admin.show",
          code: "ADMIN_SHOW_VERSION_TOKEN_READ_FAILED",
          slug,
          showId,
          error: error.message,
        });
        return null;
      }
      // Non-string payload coerces to "" DELIBERATELY (spec §5 guard table):
      // the bridge mounts and its catch-up compares "" vs live — one extra
      // refresh worst case, then converges. Fail-open (null) is reserved for
      // read FAULTS, not malformed-but-successful payloads.
      return typeof data === "string" ? data : "";
    } catch (err) {
      void log.warn("viewer version token read threw:", {
        source: "admin.show",
        code: "ADMIN_SHOW_VERSION_TOKEN_READ_FAILED",
        slug,
        showId,
        error: err,
      });
      return null;
    }
  };
  const versionToken = await readBridgeVersionToken();

  // §3.2 finalize-owned ("Publishing…") — same SECURITY DEFINER predicate the
  // dashboard uses. Invariant 9: the RPC boundary destructures { data, error }
  // and BOTH the returned-error and the thrown-error paths are surfaced
  // (distinct log.error emits) — never a silent finalize=false. Posture
  // preserved from the prior page (§6): fail toward NOT-finalize-owned on ANY
  // fault (returned error, non-true value, or throw). A transiently enabled
  // toggle is safe — the mutation server actions independently refuse during
  // finalize (the RPC's hard FINALIZE_OWNED_SHOW refusal is the backstop) — so
  // a read fault degrades to a logged cosmetic exposure, never an admin
  // lockout on a transient blip.
  //
  // Perceived-latency tier 3: the read fires in the parallel wave below —
  // BEFORE `archived` is known — so it runs unconditionally (one cheap extra
  // RPC on the rare archived open). The APPLICATION stays archived-gated:
  // `finalizeOwned` below is forced false for archived shows.
  const readFinalizeOwned = async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc("readfinalizeowned_b2", { p_show_id: showId });
      if (error) {
        void log.error("readfinalizeowned_b2 rpc returned error:", {
          source: "admin.show",
          code: "ADMIN_SHOW_FINALIZE_OWNED_RPC_FAILED",
          slug,
          showId,
          error: error.message,
        });
        return false;
      }
      return data === true;
    } catch (err) {
      void log.error("readfinalizeowned_b2 rpc threw:", {
        source: "admin.show",
        code: "ADMIN_SHOW_FINALIZE_OWNED_RPC_FAILED",
        slug,
        showId,
        error: err,
      });
      return false;
    }
  };

  // Independent post-lookup reads fan out in ONE wave (each helper resolves to
  // a typed local result and never rejects, so Promise.all never
  // short-circuits). Perceived-latency tier 3: the snapshot RPC is IN the wave
  // — everything here keys off `showId` alone, so nothing needs to wait for
  // the snapshot (the loader used to stack snapshot → finalize → the rest as
  // three serial round-trip waves behind the skeleton).
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

  // Fault fallback epoch is null here (the snapshot's picker_epoch isn't
  // known until the wave settles); resolved to `pickerEpoch` post-wave.
  const readToken = async (): Promise<{ token: string | null; epoch: number | null }> => {
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
      return { token: null, epoch: null };
    }
  };

  const [
    snapResult,
    finalizeOwnedRead,
    { feed },
    { token, epoch: tokenEpochRead },
    now,
    ignoredResult,
    alertsForCount,
  ] = await Promise.all([
    readShowReviewSnapshot(supabase, showId),
    readFinalizeOwned(),
    readFeed(),
    readToken(),
    nowDate(),
    loadIgnoredWarnings(showId),
    fetchPerShowAlerts(showId),
  ]);

  // Statement-consistent published-review snapshot (§3.3a). not_admin_or_missing
  // → redirect("/admin") (D8 — requireAdmin already ran on the dashboard page;
  // this is the show-missing/RLS gate, and a dead modal closes to the dashboard);
  // infra_error → throw to the error boundary (no raw code in UI, invariant 5).
  if (snapResult.kind === "not_admin_or_missing") redirect("/admin");
  if (snapResult.kind === "infra_error") {
    throw new Error("show_review_snapshot_failed");
  }
  const snapshot = snapResult.snapshot;
  const show = snapshot.show;

  const publishedData = buildPublishedSectionData(snapshot, { slug });
  const { archived, published, dates, venue, driveFileId } = publishedData;
  const title = publishedData.title || null;
  const lastSyncedAt = str(show.last_synced_at);
  // shows.last_checked_at — last time the cron SUCCESSFULLY reached Drive and
  // evaluated this show (distinct from last_synced_at, the last content apply /
  // error stamp). Drives the StatusStrip sync-age badge time (2026-07-17
  // sync-cell). `show` is `to_jsonb(shows)` so the column is present.
  const lastCheckedAt = str(show.last_checked_at);
  const lastSyncStatus = str(show.last_sync_status);
  const pickerEpoch = typeof show.picker_epoch === "number" ? show.picker_epoch : 1;
  const isShowEligibleForCrewLink = published && !archived;
  // Archived gate applied HERE (the wave fired the read unconditionally).
  const finalizeOwned = !archived && finalizeOwnedRead;
  const tokenEpoch = tokenEpochRead ?? pickerEpoch;

  // published-show-alerts §3: ONE serializable attention list feeds the modal's
  // pill/menu/dots/banners. Alert-read fault → degraded pill + Overview notice
  // (§3.2); hold-derived items still flow from the feed.
  const alertsDegraded = !Array.isArray(alertsForCount);
  const attentionItems = deriveAttentionItems({
    alerts: alertsDegraded ? [] : alertsForCount,
    feed: feed ? { entries: feed.entries } : null,
    slug,
    driveFileId,
  });

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

  // The §5.1 correction-loop gate that used to live here is GONE with the
  // Overview callout it fed. The guidance now renders in the Parse warnings
  // panel, which gates on the raw `warnings.length` it already holds — so no
  // actionable-warning partition has to be recomputed on the server and handed
  // down. Deleting the gate WITH its only consumer is deliberate: a surviving
  // `hasActionableWarnings` with no reader is exactly the zombie-flag shape.

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
  // §2.1 published archived-tab include offer: POST-AUGMENTATION after the warning model exists
  // (the model derives from `publishedData`, so this cannot move earlier — it attaches here).
  // Names come from the ACTIVE partition only (durable Ignore removes a record, hiding the
  // offer); raw `blockRef.name`, blanks dropped, exact-string deduped (no trim — RPC identity is
  // exact). Attached only when published && !archived && driveFileId present with ≥1 name.
  const activeArchivedTabNames = Array.from(
    new Set(
      Object.values(bySection)
        .flatMap((m) => m?.active ?? [])
        .filter((item) => item.warning.code === "PULL_SHEET_ON_ARCHIVED_TAB")
        .map((item) => item.warning.blockRef?.name)
        .filter((n): n is string => typeof n === "string" && n.trim().length > 0),
    ),
  );
  const archivedTabOffer =
    published && !archived && driveFileId != null && activeArchivedTabNames.length > 0
      ? { tabNames: activeArchivedTabNames, slug }
      : null;
  const withOffer = { ...publishedData, archivedTabOffer };
  const surfaceData = rosterOverCap ? { ...withOffer, previewRoster: [] } : withOffer;
  const crewEmails = rosterOverCap
    ? []
    : publishedData.crewMembers
        .map((c) => c.email)
        .filter((e): e is string => typeof e === "string" && e.includes("@"));

  // Picker-reset roster rows (id + name + role) from the snapshot.
  //
  // share-hub T4 widened the serialization gate from `published && !archived`
  // to `!archived`: the hub keeps rotate/reset reachable while a show is
  // UNPUBLISHED (spec §1.1), so those affordances must serialize for a held
  // show. The archived arm of the original gate is unchanged and load-bearing —
  // reset_crew_member_selection is admin-only but lifecycle-agnostic
  // (BL-RPC-RESET-SELECTION-LIFECYCLE-GUARD), so a read-only show must not
  // carry those live action references into its RSC payload at all. Hiding them
  // client-side is not sufficient.
  const pickerCrew: PickerResetCrewRow[] = archived
    ? []
    : snapshot.crew_members.map((r) => {
        const row = (r ?? {}) as Record<string, unknown>;
        return { id: str(row.id) ?? "", name: str(row.name) ?? "", role: str(row.role) };
      });

  // Live-now (§4): the SAME rule the dashboard uses (Dashboard.tsx:483-484);
  // the strip does NOT re-derive it (Task 10 contract).
  const todayIso = formatIsoForTimezone(now, resolveShowTimezone(venue as never));
  const isLive = published && isShowLiveOnDate(dates as never, todayIso);

  const openSheetHref = buildSheetDeepLink(driveFileId);

  // Serialization gate (old-page parity, page.tsx merge-base:792): build the
  // share-&-access cluster ONLY when the crew link is eligible (published &&
  // !archived). The cluster subtree (rotate + per-member picker-reset actions)
  // carries live server-action references; the reset RPC has no archived/
  // published/finalize lifecycle guard (reset_crew_member_selection is
  // admin-only but lifecycle-agnostic — BL-RPC-RESET-SELECTION-LIFECYCLE-GUARD),
  // so those affordances must not be SERIALIZED into the RSC payload for a show
  // the UI presents read-only — hiding them client-side (OverviewSection's
  // isCrewLinkActive branch) is not enough. OverviewSection renders its inactive-
  // share notice for the null case, driven by the published/archived flags (not
  // slot presence). (Archive/unarchive are NOT gated here: archive_show carries
  // its own finalize-owned refusal server-side — defense-in-depth backstop.)

  return (
    <ShareTokenProvider
      key={showId}
      initialToken={isShowEligibleForCrewLink ? token : null}
      initialEpoch={tokenEpoch}
    >
      <PublishedReviewModal
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
        lastCheckedAt={lastCheckedAt}
        lastSyncStatus={lastSyncStatus}
        now={now}
        attentionItems={attentionItems}
        alertsDegraded={alertsDegraded}
        openSheetHref={openSheetHref}
        crewEmails={crewEmails}
        pickerCrew={pickerCrew}
        archiveAction={archiveShowAction.bind(null, slug)}
        unarchiveAction={unarchiveShowAction}
        feed={feed}
        undoAction={undoChangeAction}
        acceptAction={acceptChangeAction}
        acceptAllAction={acceptAllAction}
        approveAction={mi11ApproveAction}
        rejectAction={mi11RejectAction}
        alertId={alertId}
      />
      {/* Realtime-refresh §4.3: strictly the LAST child — appending/omitting a
          trailing sibling never shifts PublishedReviewModal's child index, so
          the fault render (bridge absent) cannot reset the modal's client
          state. A `{null}` trailing slot keeps the child ARRAY shape stable
          across fault/ok renders. */}
      {versionToken !== null ? (
        <ShowRealtimeBridge showId={showId} slug={slug} renderVersion={versionToken} />
      ) : null}
    </ShareTokenProvider>
  );
}
