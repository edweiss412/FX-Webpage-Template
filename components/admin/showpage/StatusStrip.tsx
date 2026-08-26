"use client";

/**
 * components/admin/showpage/StatusStrip.tsx (consolidated-admin-show-page spec §4/§6/§11)
 *
 * The slim, pinned status strip that stays under the admin nav while the rail sections
 * scroll. DISPLAY + 3 actions max — the publish toggle, Re-sync and the share hub.
 *
 * The budget was 2 (toggle + the share affordance, "everything else lives in Overview") until
 * modal-header-reconciliation §4.3, a RATIFIED amendment: Re-sync moves here, and
 * duplicating the control across the strip and Overview was explicitly rejected —
 * there is exactly ONE Re-sync. Alert detail still lives in the Overview rail
 * section. The share panel and archive/unarchive have since MOVED into the hub's
 * popover (share-hub T4 + the lifecycle move), superseding mock README delta 5's
 * "Unarchive is NOT a strip control".
 *
 * All data arrives as plain props (the page shell wires it); this component fetches nothing
 * and defines no server actions. The publish toggle carries its own bound action through
 * (`setPublished`); the share hub consumes `ShareTokenProvider` so a rotate updates the
 * crew URL instantly (spec §4 "within ShareTokenProvider context"). The strip's own
 * standalone copy-link was retired when the hub absorbed it.
 *
 * Mode boundaries (spec §6; title removed by modal-header-reconciliation §6.5):
 *   - Not archived            → PublishedToggle · [divider] · live badge (if live)
 *                               · sync age (if synced) · edited age (if content-edited)
 *                               · Re-sync · the hub (the GROUP is unconditional; its
 *                               crew-link half needs published + token). The alert
 *                               badge MOVED to the modal header (§6.6).
 *   - Archived (read-only)    → archived badge · sync age · edited age · the hub,
 *                               relabelled "Show actions". No toggle, no live badge, no
 *                               Re-sync. Read-only for SHARING — the crew link, Copy,
 *                               Email, rotate and reset are all gone — but NOT free of
 *                               mutating affordances: Unarchive lives in that popover
 *                               and is the only way back.
 *
 * Sync age vs edited age (2026-07-17 sync-cell): the badge shows the last-CHECKED time
 * (last successful Drive reach) for `ok`; the muted "Edited {rel}" shows the last-EDITED
 * time (last content apply). Both moved off the dashboard Sync cell, which now shows the
 * bucket + a hover-revealed "Checked" line only.
 *
 * Guard conditions (spec §11):
 *   - `lastSyncedAt` null     → OMIT the sync-age element entirely. `formatRelative` returns
 *                               "never" for null; rendering that would violate the omit
 *                               contract, so the null is guarded BEFORE the call.
 *   - no active share token   → the hub's crew-link row hides. "Active" = published: an unpublished show
 *                               keeps its token but the crew link is paused, so copying it
 *                               would hand out a dead link.
 *
 * Live-now is NOT derived here (it needs the show timezone + wall clock): the page computes
 * `published && isShowLiveOnDate(dates, todayIso)` — the same rule the dashboard uses
 * (Dashboard.tsx:483-484) — and passes the result as `isLive`.
 *
 * Container chrome (modal-header-reconciliation §6.5): the strip supplies LAYOUT ONLY.
 * Its sole render site is the published review modal, where it mounts in the shell's
 * `subHeader` band — and the band supplies the surface, the bottom seam and
 * `px-tile-pad` (ReviewModalShell.tsx). The former `chrome` prop's `"page"` arm (sticky
 * pin, z-index, own seam, shadow, own padding) was only reachable from the retired
 * standalone show page and is gone; re-adding any of it here would double-seam and
 * double-pad the band. `w-full` is added in Task 3 — it is what makes the copy button's
 * `ml-auto` resolve against the BAND's width rather than the strip's shrink-wrapped one.
 */

import { useRef } from "react";
import { PublishedToggle } from "@/components/admin/PublishedToggle";
import { ReSyncButton } from "@/components/admin/ReSyncButton";
import { StatusIndicator, StatusDot } from "@/components/admin/StatusIndicator";
import { formatRelative } from "@/lib/admin/showDisplay";
import { syncStatusBucket, showsEditedClause } from "@/lib/admin/syncStatus";
import { ShareHub } from "@/components/admin/showpage/ShareHub";
import type { PickerResetCrewRow } from "@/app/admin/show/[slug]/PickerResetControl";

type LifecycleResult = { ok: true } | { ok: false; code: string };

type StateBadge = { label: string; pill: string; dot: string };

// Mobile state badge (spec 2026-07-24-strip-mobile-stacked-band §3 R0).
// Precedence archived > isLive > published. `isLive && !published` is
// upstream-unreachable (see the Live-now note above: the page computes
// `published && isShowLiveOnDate`); precedence shows "Live" on that
// garbage-in (spec §10).
function stateBadge(archived: boolean, isLive: boolean, published: boolean): StateBadge {
  if (archived)
    return {
      label: "Archived",
      pill: "border border-border bg-surface text-text-subtle",
      dot: "bg-text-faint",
    };
  if (isLive)
    return { label: "Live", pill: "bg-accent-tint text-accent-on-bg", dot: "bg-accent-on-bg" };
  if (published)
    return {
      label: "Published",
      pill: "bg-surface-sunken text-text-subtle",
      dot: "bg-status-positive",
    };
  return { label: "Draft", pill: "bg-surface-sunken text-text-subtle", dot: "bg-text-faint" };
}

export type StatusStripProps = {
  /** Forwarded verbatim to ShareHub's trigger-elevation gate (spec §3.1). */
  attentionMenuOpen?: boolean | undefined;
  /** Stable subject id for the bound publish action + crew-URL path. Feeds the crew
   *  copy URL and the bound publish toggle — NOT a display label (the strip renders no
   *  title; the modal's `<h2>` owns it). */
  slug: string;
  /** Read-only lifecycle state: hides every mutating strip affordance EXCEPT the
   *  hub, which stays mounted because Unarchive lives in its popover and is the
   *  only way back. Read-only for publishing and syncing, not affordance-free. */
  archived: boolean;
  /** Current publish state (drives the wrapped toggle + the share hub's "active" gate). */
  published: boolean;
  /** Finalize ownership — disables the toggle in both publish states (passthrough). */
  finalizeOwned: boolean;
  /** Pre-bound `setShowPublishedAction` for this show's slug (passthrough to the toggle). */
  setPublished: (next: boolean) => Promise<LifecycleResult>;
  /** Page-computed `published && isShowLiveOnDate(...)`; badge renders only when true. */
  isLive: boolean;
  /** `shows.last_synced_at` (ISO) or null. Null → the sync-age element is not rendered.
   *  This is the "Edited" timestamp (last content apply); it feeds the muted Edited clause. */
  lastSyncedAt: string | null;
  /** `shows.last_checked_at` (ISO) or null — last successful Drive reach/evaluate. Drives the
   *  sync-age badge TIME for the `ok` bucket ("Synced {rel}"); falls back to lastSyncedAt when null. */
  lastCheckedAt: string | null;
  /** `shows.last_sync_status` → health bucket + label via `syncStatusBucket`. */
  lastSyncStatus: string | null;
  /** Server "now" for deterministic relative formatting. */
  now: Date;
  /** Subject id for the hub's rotate/reset actions (share-hub T4). */
  showId: string;
  /** Crew addresses for the hub's batched Email-crew rows; [] → no rows. */
  crewEmails: readonly string[];
  /** Show title for the mailto subject; "" falls back inside the builder. */
  showTitle: string;
  /** Roster rows for the hub's everyone-reset control; [] → empty-roster copy. */
  pickerCrew: PickerResetCrewRow[];
  /** Pre-bound (to this show's slug) Archive server action — the hub's Show section. */
  archiveAction: () => Promise<LifecycleResult>;
  /** Dev-capture snapshot thunk (spec 2026-07-22 §4.3) — threaded verbatim to ShareHub. */
  devCaptureSnapshot?: () => unknown;
  /** Show-scoped Unarchive server action (called with `showId`) — same section, archived arm. */
  unarchiveAction: (showId: string) => Promise<void>;
};

export function StatusStrip({
  attentionMenuOpen,
  slug,
  archived,
  published,
  finalizeOwned,
  setPublished,
  isLive,
  lastSyncedAt,
  lastCheckedAt,
  lastSyncStatus,
  now,
  showId,
  crewEmails,
  showTitle,
  pickerCrew,
  archiveAction,
  unarchiveAction,
  devCaptureSnapshot,
}: StatusStripProps) {
  // Handed to both overlay owners as their placement anchor; see the root
  // element below for why they cannot reach it themselves.
  const stripRef = useRef<HTMLDivElement | null>(null);

  // Sync age: guard null BEFORE formatRelative so the "never" sentinel never renders
  // (spec §11 omit contract). Element existence is gated on lastSyncedAt (a show that
  // never synced shows nothing). For the `ok` bucket the displayed TIME is
  // last_checked_at ("Synced {rel}" = last successful Drive reach), falling back to
  // last_synced_at when the check stamp is absent; non-ok buckets show the health label.
  const sync = lastSyncedAt == null ? null : syncStatusBucket(lastSyncStatus);
  const syncLabel =
    sync == null
      ? null
      : lastSyncStatus === "ok"
        ? `Synced ${formatRelative(lastCheckedAt ?? lastSyncedAt, now)}`
        : sync.label;

  // "Edited {rel}" (last_synced_at = last content apply), moved here from the dashboard
  // Sync cell. Suppressed for the three error buckets where last_synced_at is an
  // error-attempt stamp, not a content edit (showsEditedClause === false) — the same
  // deny-set the dashboard used — and when the show never synced.
  const editedRel =
    lastSyncedAt != null && showsEditedClause(lastSyncStatus)
      ? formatRelative(lastSyncedAt, now)
      : null;

  // CASP2-4 (item 2, approach A): a control/signal divider so the ON switch (bg-accent) and the
  // Live-now dot (bg-status-live = accent, SAME hue — globals.css:89) stop reading as one orange
  // smear. Renders iff there is a toggle to separate (¬archived) AND ≥1 signal follows. The two
  // disjuncts are exactly the render conditions of the live/sync elements below, so the
  // divider appears iff a signal renders beside the toggle. `hidden sm:block` — no vertical
  // divider on the wrapped 390px mobile row.
  //
  // The former third disjunct (`alertCount > 0`) was DROPPED with the alert
  // relocation (modal-header-reconciliation §7): the element it stood in for now
  // lives in the modal header, so keeping it would draw a divider followed by
  // nothing on an alerts-only show.
  const hasSignal = isLive || (syncLabel != null && sync != null);
  const showControlDivider = !archived && hasSignal;

  return (
    <div
      // The anchor BOTH overlay owners place against (spec
      // 2026-08-25-review-modal-strip-dock §3.2). PublishedToggle is a
      // grandchild and ReSyncButton's root is a fragment with no box, so
      // neither can reach this element on its own; CSS used to resolve it
      // implicitly by walking up to the nearest positioned ancestor, and the
      // placement module takes a rect instead. The owner that renders both
      // consumers is the one place that can hand it over.
      ref={stripRef}
      // share-hub T4: the #share-access deep-link target (built by
      // lib/adminAlerts/alertActions.ts:51) lives on this UNCONDITIONAL root so it
      // survives every lifecycle. Archived still renders the hub, but with no
      // share half at all, so an anchor scoped to the share affordance would
      // land on nothing there. A conditional host would dead-link the action.
      id="share-access"
      data-testid="show-status-strip"
      // Full band width is what makes right-flush reachable (§8): `ml-auto` on
      // the trailing control only reaches the band's content edge if this row
      // spans it. VERIFIED by measurement — swapping `w-full` for `w-fit` failed
      // the flush assertion by ~470px at 1280. That assertion is now T-HUB-FLUSH
      // (published-review-modal.layout.spec.ts); it superseded T-COPY-FLUSH when
      // the hub absorbed the standalone copy-link.
      //
      // Honest note: `w-full` is DEFENSIVE, not load-bearing today. The band is
      // a block-level, non-flex container, so this block-level flex row already
      // fills it; the flush assertion passes with `w-full` removed. It is kept because
      // the guarantee would evaporate the moment the band became a flex
      // container — the strip would then shrink-wrap as a flex item (this
      // repo's Tailwind v4 does not default `.flex` to align-items: stretch)
      // and `ml-auto` would flush to the strip's own edge instead.
      //
      // Deliberately NO `relative` here — that would re-anchor the Task 7
      // Re-sync overlay to the strip and break its `inset-x-0` full-band width.
      // The band owns the positioned ancestor.
      className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap"
    >
      {/* R0 (spec 2026-07-24-strip-mobile-stacked-band §3): mobile-only state
          badge on its own full-width flex line (w-full = own line under
          flex-wrap; no break elements). */}
      <div data-testid="strip-state-badge-row" className="hidden max-sm:flex w-full justify-end">
        {(() => {
          const b = stateBadge(archived, isLive, published);
          return (
            <span
              data-testid="strip-state-badge"
              className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-pill px-2.5 text-xs font-semibold ${b.pill}`}
            >
              <span aria-hidden="true" className={`size-2 shrink-0 rounded-pill ${b.dot}`} />
              {b.label}
            </span>
          );
        })()}
      </div>

      {archived ? (
        <span
          data-testid="strip-archived-badge"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-border bg-surface px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-text-subtle max-sm:hidden"
        >
          Archived · read-only
        </span>
      ) : (
        <div data-testid="strip-publish-toggle" className="shrink-0 max-sm:w-full">
          <PublishedToggle
            slug={slug}
            variant="settings"
            published={published}
            finalizeOwned={finalizeOwned}
            setPublished={setPublished}
            anchorRef={stripRef}
          />
        </div>
      )}

      {/* D1 (spec §3): mobile divider line after the publish row; absent when
          archived (R1 absent), so no divider is ever orphaned. */}
      {!archived ? (
        <div
          aria-hidden="true"
          data-testid="strip-divider-1"
          className="hidden max-sm:block h-px w-full bg-border"
        />
      ) : null}

      {showControlDivider ? (
        <span
          aria-hidden="true"
          data-testid="strip-control-divider"
          className="hidden h-5 w-px shrink-0 bg-border sm:block"
        />
      ) : null}

      {!archived && isLive ? (
        <span data-testid="strip-live-badge" className="shrink-0 max-sm:hidden">
          <StatusIndicator status="live" label="Live now" />
        </span>
      ) : null}

      {syncLabel != null && sync != null ? (
        <span
          data-testid="strip-sync-age"
          // basis-0 + grow, NOT shrink (measured 2026-07-24): under flex-wrap
          // an item wraps at its HYPOTHETICAL main size before shrink ever
          // applies, so a shrink-based cap would push the Sync trigger to its
          // own line on worst-case data. Base size 0 always fits the line;
          // grow fills the leftover; min-w-0 + overflow-hidden clip the tail.
          className="flex shrink-0 items-center gap-2 max-sm:basis-0 max-sm:grow max-sm:min-w-0 max-sm:overflow-hidden"
        >
          {/* One health dot, colored by sync HEALTH (last_sync_status bucket) — NOT the
              edit time. It pairs with both text lines (the color-blind floor). */}
          {/* pulse: subtle heartbeat on the healthy/synced dot (no-op on non-positive). */}
          <StatusDot status={sync.bucket} pulse />
          {/* ONE row (modal-header-reconciliation §4.5): dot · "Synced {rel}" ·
              3px bullet · "Edited {rel}". Equally weighted — same size/color,
              neither is the "primary" of the pair, so both inherit this row's
              type rather than setting their own.

              `inline-flex items-center` is the §8 dimensional invariant that
              guarantees the baseline-consistent single row. It replaces a
              `flex flex-col` column: restyling this element's colors or order
              while leaving `flex-col` in place passes EVERY other status
              assertion, so the single-row structure is pinned explicitly —
              in jsdom by statusStrip.test.tsx's expectSingleRowStatus() and in
              the browser by T-STATUS-INLINE.

              NOT "Synced" hardcoded: `syncLabel` is the ok-bucket phrasing for
              ONE bucket of several; every non-ok bucket renders its health
              label here instead (syncStatus.ts:20). */}
          <span
            data-testid="strip-status-line"
            className="inline-flex items-center gap-2 text-xs/tight text-text-subtle tabular-nums max-sm:min-w-0 max-sm:overflow-hidden"
          >
            {/* Clip priority (spec §3 R2): the health/synced span is never
                sacrificed in favor of the Edited clause; the Edited tail
                clips first. All max-sm scoped — desktop untouched. */}
            <span
              data-testid="strip-synced-line"
              className="max-sm:whitespace-nowrap max-sm:shrink-0"
            >
              {syncLabel}
            </span>
            {/* The bullet is the collapse's ONLY new orphan risk: with the
                column gone, nothing else separates the two texts, so it must
                mount and unmount WITH the Edited clause — never on its own.
                Same 3px decorative atom as the header subline
                (PublishedReviewModal.tsx:299-303). */}
            {editedRel != null ? (
              <>
                <span
                  aria-hidden="true"
                  data-testid="strip-status-bullet"
                  className="size-[3px] shrink-0 rounded-pill bg-border-strong"
                />
                <span data-testid="strip-edited-age" className="max-sm:truncate max-sm:min-w-0  ">
                  Edited {editedRel}
                </span>
              </>
            ) : null}
          </span>
        </span>
      ) : null}

      {/* The alert badge lived here until modal-header-reconciliation §6.6 moved
          it to the modal header as `published-show-review-alert-pill`. Do not
          re-add it: rendered in both places, the count reads as two different
          numbers the moment one of them lags. */}

      {/* Re-sync (modal-header-reconciliation §4.3 — a RATIFIED amendment to
          the "2 actions max" rule quoted at the top of this file; the budget is
          now 3). Mounted as a BARE element: a wrapper <div> would become the
          flex item, so `items-center` and the row gap would apply to the
          wrapper rather than the button, and the component's absolute result
          panels would lose the band's full width — while every focus and order
          test still passed. The trigger carries its own
          `data-testid="admin-resync-button"`; query that.

          DOM order is normative, not merely visual: the right-flushed control is
          now the HUB group (`ml-auto`), so hub-then-Re-sync would still LOOK
          right while producing the tab order toggle → hub → Re-sync → confirm
          controls, breaking §10's confirm-proximity contract. (This read
          "Copy" until the hub absorbed the standalone copy-link.)

          Archived shows get NO Re-sync trigger — it mutates via /api/admin/sync,
          which an archived show must not reach. Overview still states the reason
          (§6.7): `OverviewSection` renders `admin-show-resync-archived`, "Re-sync
          is paused while this show is archived."

          (A round-5 edit here claimed that notice had been retired with the
          share cluster. It had not — the share PANEL went, the resync notice
          stayed.)

          Counted form: the MULTI-LINE `{!archived ? (` head is what §9's lexical
          scanner sees. Both `{archived ? null : …}` AND the one-line
          `{!archived ? <ReSyncButton …/>}` render identically but are INVISIBLE
          to the pin — the one-line regex requires a LETTER immediately after
          `{`, which `!archived` does not supply. Verified by running the scan:
          the one-line form left the count at 6. This mount keeps its
          fails-by-default protection only in the form below — and Prettier
          collapses the parenthesized form back to one line unless something
          inside it forces a break, which is what the inner comment is for. */}
      {!archived ? (
        // Gated on `archived` ALONE: an unpublished (held) show is still
        // syncable — only archived is read-only.
        <ReSyncButton slug={slug} />
      ) : null}

      {/* D2 (spec §3): mobile divider before the actions row; renders iff R2
          rendered anything (sync-age needs lastSyncedAt; the Sync trigger
          needs !archived). */}
      {lastSyncedAt != null || !archived ? (
        <div
          aria-hidden="true"
          data-testid="strip-divider-2"
          className="hidden max-sm:block h-px w-full bg-border"
        />
      ) : null}

      {/* share-hub T4. The hub replaces the standalone copy-link: URL, Copy,
          Email-crew, rotate and reset all live in its popover — and, since the
          lifecycle move, Archive/Unarchive too. That is why the group is now
          UNCONDITIONAL: an archived show loses the SHARE half, but still renders
          both triggers — the primary relabelled "Show actions" — because
          Unarchive lives in that popover, so gating the group on `!archived`
          would strand the only way back.
          `ml-auto` right-flushes the group against the band's content edge —
          which resolves only because the strip row is `w-full` (see above). */}
      <div
        data-testid="share-hub-group"
        className="ml-auto flex shrink-0 items-center max-sm:w-full"
      >
        <ShareHub
          attentionMenuOpen={attentionMenuOpen}
          slug={slug}
          showId={showId}
          published={published}
          archived={archived}
          finalizeOwned={finalizeOwned}
          crewEmails={crewEmails}
          showTitle={showTitle}
          pickerCrew={pickerCrew}
          archiveAction={archiveAction}
          unarchiveAction={unarchiveAction}
          {...(devCaptureSnapshot !== undefined ? { devCaptureSnapshot } : {})}
        />
      </div>
    </div>
  );
}
