"use client";

/**
 * components/admin/showpage/PublishedReviewModal.tsx (admin-show-modal spec §6)
 *
 * The published review surface composed inside the shared `ReviewModalShell`
 * chrome: the dashboard's `/admin?show=<slug>` modal. Header slot owns the
 * heading-safe `<h2>` title (the dialog's aria-labelledby target — ONLY the
 * title text; the sheet deep link is a separate adjacent 44px icon anchor, the
 * Step3ReviewModal pattern) plus the close button. The control strip is NOT in
 * the header: it mounts in the shell's `subHeader` band, its own seamed row
 * below the header (modal-header-reconciliation §6.1) — identity above, live
 * controls below. `<StatusStrip>` renders no title of its own and no container
 * chrome at all (§6.5), so the panel contains exactly one title node and no h1,
 * and the band's surface, seam and `px-tile-pad` are never doubled. Body =
 * `<ShowReviewSurface layout="modal" syncHash>` with the EXACT extras
 * composition `PublishedReviewPage` builds today (Overview first, Changes
 * last, per-section warning controls, raw-unrecognized bottom slot). NO
 * footer: the publish control is the strip's inline toggle; archive lives in
 * the Overview archive row (spec §6.1).
 *
 * RSC boundary: server-only pieces arrive pre-rendered as ReactNode SLOTS
 * (`alertSlot`, `shareSlot`); every server action arrives as a DIRECT ref
 * (never an inline-wrapped closure — the RSC server-action lesson).
 * `buildSectionWarningModel` (SERVER, node:crypto) ran on the loader; this
 * shell only invokes the crypto-free `buildSectionWarningExtras` factory.
 *
 * Close: every affordance (X, scrim, Esc, drag-dismiss) funnels through
 * `handleClose` — an instant client-side hide (local `closing` state) plus
 * `useShowModalNav().close` (the current URL minus `show`/`alert_id`) catching
 * the URL up in the background.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ExternalLink, History, LayoutDashboard, X } from "lucide-react";

import { ReviewModalShell } from "@/components/admin/review/ReviewModalShell";
import { ShowReviewSurface, type ExtraSection } from "@/components/admin/review/ShowReviewSurface";
import type { PublishedSectionData } from "@/components/admin/review/sectionData";
import type { SectionWarningRecord } from "@/lib/admin/sectionWarningModel";
import { buildSectionWarningExtras } from "@/components/admin/showpage/sectionWarningExtras";
import {
  RawUnrecognizedCallout,
  dateSummarySegments,
} from "@/components/admin/wizard/step3ReviewSections";
import { StatusStrip } from "@/components/admin/showpage/StatusStrip";
import { OverviewSection } from "@/components/admin/showpage/OverviewSection";
import { ChangesSection } from "@/components/admin/showpage/ChangesSection";
import type { ChangesSectionProps } from "@/components/admin/showpage/ChangesSection";
import { useShowModalNav } from "@/components/admin/useShowModalNav";

type LifecycleResult = { ok: true } | { ok: false; code: string };

const TESTID_BASE = "published-show-review";

// Props = PublishedReviewPageProps verbatim + { alertId } (spec §6). Declared
// here (not imported) so Task 7's deletion of PublishedReviewPage.tsx leaves
// no orphaned type import.
export type PublishedReviewModalProps = {
  /** The published-mode content contract feeding every parsed section panel. */
  data: PublishedSectionData;
  /** Per-section warning model (server-derived, crypto-free record) for §5.3 controls. */
  bySection: SectionWarningRecord;

  // ── StatusStrip / header ──
  slug: string;
  showId: string;
  title: string | null;
  archived: boolean;
  published: boolean;
  finalizeOwned: boolean;
  setPublished: (next: boolean) => Promise<LifecycleResult>;
  isLive: boolean;
  lastSyncedAt: string | null;
  lastCheckedAt: string | null;
  lastSyncStatus: string | null;
  now: Date;
  alertCount: number;

  // ── Overview ──
  openSheetHref: string | null;
  hasActionableWarnings: boolean;
  archiveAction: () => Promise<LifecycleResult>;
  unarchiveAction: (showId: string) => Promise<void>;
  /** Server-rendered `<PerShowAlertSection/>`. */
  alertSlot: ReactNode;
  /** Server-rendered share-&-access cluster (`<CurrentShareLinkPanel/>`). */
  shareSlot: ReactNode;

  // ── Changes ──
  feed: ChangesSectionProps["feed"];
  undoAction: ChangesSectionProps["undoAction"];
  acceptAction: ChangesSectionProps["acceptAction"];
  acceptAllAction: ChangesSectionProps["acceptAllAction"];
  approveAction: ChangesSectionProps["approveAction"];
  rejectAction: ChangesSectionProps["rejectAction"];

  /** `?alert_id` (first value) — the §3 one-shot highlight-scroll target; null → no scroll. */
  alertId: string | null;
};

export function PublishedReviewModal(props: PublishedReviewModalProps) {
  const {
    data,
    bySection,
    slug,
    showId,
    title,
    archived,
    published,
    finalizeOwned,
    setPublished,
    isLive,
    lastSyncedAt,
    lastCheckedAt,
    lastSyncStatus,
    now,
    alertCount,
    openSheetHref,
    hasActionableWarnings,
    archiveAction,
    unarchiveAction,
    alertSlot,
    shareSlot,
    feed,
    undoAction,
    acceptAction,
    acceptAllAction,
    approveAction,
    rejectAction,
    alertId,
  } = props;

  const { close } = useShowModalNav();
  // Instant close: the close nav is a full RSC round-trip of the dashboard
  // (the modal is server-rendered off `?show`), so the shell would otherwise
  // stay mounted until the new payload lands. Hide client-side FIRST (the
  // shell's unmount cleanups restore focus/inert/scroll immediately), then let
  // `close()` catch the URL up in the background. No reset path needed: a
  // reopen streams through the Suspense fallback (ShowReviewModalSkeleton — a
  // different element type), which unmounts this instance, so a fresh open
  // never inherits `closing`.
  const [closing, setClosing] = useState(false);
  const handleClose = useCallback(() => {
    setClosing(true);
    close();
  }, [close]);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // The consumer owns the scroll container the surface hands its scroll-spy
  // (shell contract: no body wrapper — the surface root IS the body element).
  const scrollerRef = useRef<HTMLElement | null>(null);
  const h2Id = useId();
  // §6.2 guard: the published adapter can yield an empty title — never an
  // empty accessible name.
  const displayTitle = title || slug;

  // §6.3 subline: identity's second line, derived ENTIRELY from `data` — no new
  // props (§F2). `dateSummarySegments` is imported from the wizard module in
  // place; the helper does NOT move (§6.3, Watchpoint 6) — `PublishedReviewModal`
  // already imports `RawUnrecognizedCallout` from that same module, so the
  // cross-domain import is established, and moving the helper would drag its
  // ten-caller `arr` dependency with it.
  const client = data.clientLabel;
  const segs = dateSummarySegments(data.dates ?? undefined);

  // §5.3 per-section warning controls: the crypto-free render factory over the
  // server-derived model. Memoized on the record identity (stable per render).
  const renderSectionExtras = useMemo(() => buildSectionWarningExtras({ bySection }), [bySection]);

  // §3 one-shot alert_id scroll: on mount with an alertId, scroll the
  // highlighted alert row (li[aria-current="true"], the PerShowAlertSection
  // highlight) into center view; no match → the #overview rail target. The
  // ref guard makes it one-shot — a rerender (even a changed alertId) never
  // re-fires. Precedence over the surface's syncHash hash-restore is
  // structural: child effects run before parent effects, so this scroll
  // lands last when both fire on mount.
  const alertScrollFiredRef = useRef(false);
  useEffect(() => {
    if (alertId == null || alertScrollFiredRef.current) return;
    alertScrollFiredRef.current = true;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const target =
      scroller.querySelector('li[aria-current="true"]') ?? scroller.querySelector("#overview");
    if (target instanceof HTMLElement && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ block: "center" });
    }
  }, [alertId]);

  // §5.1 Overview — the FIRST rail item; alert-count chip when > 0,
  // rendered with the StatusStrip alert-badge token idiom.
  const overviewExtra: ExtraSection = {
    id: "overview",
    label: "Overview",
    Icon: LayoutDashboard,
    ...(alertCount > 0
      ? {
          railBadge: (
            <span
              data-testid="overview-rail-badge"
              className="ml-auto inline-flex shrink-0 items-center rounded-pill bg-warning-bg px-1.5 text-xs font-semibold tabular-nums text-warning-text"
            >
              {/* The count alone reads as a bare number to a screen reader; name
                  the unit. The separator space is its OWN visible text node — a
                  leading space inside the sr-only span is trimmed during
                  accessible-name computation ("3open alerts", memory-#470 class). */}
              {alertCount}{" "}
              <span className="sr-only">open {alertCount === 1 ? "alert" : "alerts"}</span>
            </span>
          ),
        }
      : {}),
    render: () => (
      <OverviewSection
        slug={slug}
        showId={showId}
        archived={archived}
        published={published}
        finalizeOwned={finalizeOwned}
        openSheetHref={openSheetHref}
        hasActionableWarnings={hasActionableWarnings}
        archiveAction={archiveAction}
        unarchiveAction={unarchiveAction}
        alertSlot={alertSlot}
        shareSlot={shareSlot}
      />
    ),
  };

  // §5.4 Changes — the LAST rail item.
  const changesExtra: ExtraSection = {
    id: "changes",
    label: "Changes",
    Icon: History,
    render: () => (
      <ChangesSection
        feed={feed}
        now={now}
        showId={showId}
        undoAction={undoAction}
        acceptAction={acceptAction}
        acceptAllAction={acceptAllAction}
        approveAction={approveAction}
        rejectAction={rejectAction}
      />
    ),
  };

  return (
    <ReviewModalShell
      open={!closing}
      onClose={handleClose}
      labelledBy={h2Id}
      dataAttrPrefix="review-modal"
      testIdBase={TESTID_BASE}
      initialFocusRef={closeRef}
      header={
        // TWO children, no outer flex-column wrapper (modal-header-reconciliation
        // §6.2): the control strip has moved out to the `subHeader` band, so
        // there is no second row left inside the header for a column to space.
        // The shell's <header> is `flex items-start gap-3`, so these sit side by
        // side — the text block flexes, the actions cluster stays shrink-0.
        <>
          <div className="min-w-0 flex-1">
            {/* Heading-safe title split (Step3 pattern): the h2 holds ONLY the
                plain title (the dialog's accessible name); the deep link is a
                separate adjacent 44px icon anchor. */}
            <div className="flex min-w-0 items-center gap-1">
              <h2 id={h2Id} data-testid={`${TESTID_BASE}-title`} className="min-w-0">
                <span className="min-w-0 wrap-break-word text-lg font-bold tracking-tight text-text-strong">
                  {displayTitle}
                </span>
              </h2>
              {/* §6.2 guard: null → omitted entirely (no dead anchor). */}
              {openSheetHref !== null ? (
                <a
                  data-testid={`${TESTID_BASE}-sheetlink`}
                  href={openSheetHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open the source sheet for ${displayTitle}`}
                  className="inline-flex size-tap-min shrink-0 items-center justify-center rounded-sm text-text-subtle transition-colors duration-fast hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  <ExternalLink aria-hidden="true" className="size-4" />
                </a>
              ) : null}
            </div>
            {/* §6.3 subline: client entry (omitted WITH its bullet when null —
                a leading separator with nothing before it is the defect) plus
                the dates entry, which ALWAYS renders so the line never
                disappears. Mirrors Step3ReviewModal.tsx's subline exactly,
                including the "Dates not detected" fallback. */}
            <div
              data-testid={`${TESTID_BASE}-subline`}
              className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-text-subtle"
            >
              {/* §9: instant — deliberate (client presence follows data, not a state transition) */}
              {client !== null ? (
                <>
                  <span className="min-w-0 wrap-break-word">{client}</span>
                  <span
                    aria-hidden="true"
                    className="size-[3px] shrink-0 rounded-pill bg-border-strong"
                  />
                </>
              ) : null}
              <span className="min-w-0 wrap-break-word">
                {segs.length > 0 ? segs.join(" · ") : "Dates not detected"}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* §6.6 alert pill — RELOCATED from the control strip. It stays an
                <a href="#overview"> (§F1, Watchpoint 4): the mock draws an
                inert <span>, but that is a static-canvas artifact, and a span
                would delete the only affordance connecting this count to the
                alert list. `overviewSection.test.tsx` pins the jump target.

                `before:-inset-y-3` is COPIED from the old strip badge, not
                chosen fresh: text-xs (~16px line box) + py-1 (8px) ≈ a 24px
                visible pill, and -inset-y-3 (12px per side) ≈ 48px ≥ the 44px
                tap floor. `-inset-y-2` would yield ~40px and MISS it. T-TAP
                probes the resolved hit band rather than trusting this
                arithmetic (§11.1).

                Guard (§7): the count is server-derived (an array length), so
                the Number.isInteger gate is defensive-only — but an unguarded
                render puts a literal "NaN alerts" in the header. */}
            {Number.isInteger(alertCount) && alertCount > 0 ? (
              <a
                href="#overview"
                data-testid={`${TESTID_BASE}-alert-pill`}
                className="relative inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-warning-bg px-2.5 py-1 text-xs font-semibold tabular-nums text-warning-text transition-colors duration-fast before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] hover:bg-warning-bg/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                {/* Decorative: the count text carries the meaning. Replaces the
                    strip badge's TriangleAlert glyph per the mock. The token is
                    live (globals.css `--color-status-review`) — never the mock hex. */}
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-pill bg-status-review"
                />
                {/* Capped at 99+ (§6.6): `alertCount` is unbounded and this group
                    is shrink-0 beside Close, so four digits squeeze the title at
                    375px. The UNIT stays VISIBLE — a bare "99+" is not
                    self-explanatory — and the exact count is preserved for
                    assistive tech past the cap only (below it the visible text
                    is already exact). */}
                {alertCount > 99 ? "99+" : alertCount} {alertCount === 1 ? "alert" : "alerts"}
                {alertCount > 99 ? (
                  <>
                    {/* The separator is its OWN visible text node. A leading
                        space INSIDE the sr-only span is trimmed during
                        accessible-name computation, yielding
                        "99+ alerts(1200 open alerts)" — the same bug class as
                        the Overview rail badge above. */}{" "}
                    <span className="sr-only">({alertCount} open alerts)</span>
                  </>
                ) : null}
              </a>
            ) : null}
            <button
              ref={closeRef}
              type="button"
              data-testid={`${TESTID_BASE}-close`}
              aria-label="Close"
              onClick={handleClose}
              className="-mr-1 inline-flex size-tap-min shrink-0 items-center justify-center rounded-sm text-text-subtle transition-colors duration-fast hover:bg-surface-sunken hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
        </>
      }
      // The control strip is its OWN band below the header seam
      // (modal-header-reconciliation §6.1): identity above, live controls below.
      subHeader={
        <StatusStrip
          slug={slug}
          archived={archived}
          published={published}
          finalizeOwned={finalizeOwned}
          setPublished={setPublished}
          isLive={isLive}
          lastSyncedAt={lastSyncedAt}
          lastCheckedAt={lastCheckedAt}
          lastSyncStatus={lastSyncStatus}
          now={now}
        />
      }
    >
      {/* Body: the surface mounts DIRECTLY in the panel flex column (shell
          contract) — its root is the body element, its internal scroller fills
          it. syncHash explicit: the modal keeps the page's hash deep links
          (§6.4; the modal-layout default is false). */}
      <ShowReviewSurface
        data={data}
        scrollerRef={scrollerRef}
        layout="modal"
        syncHash
        extraSectionsBefore={[overviewExtra]}
        extraSectionsAfter={[changesExtra]}
        renderSectionExtras={renderSectionExtras}
        bottomSlot={<RawUnrecognizedCallout raw={data.rawUnrecognized} />}
      />
    </ReviewModalShell>
  );
}
