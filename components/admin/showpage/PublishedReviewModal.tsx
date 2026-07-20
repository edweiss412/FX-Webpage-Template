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
 * (`alertSlot`); every server action arrives as a DIRECT ref
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
import { ChevronDown, ExternalLink, History, LayoutDashboard } from "lucide-react";

import { ModalCloseButton } from "@/components/admin/review/ModalCloseButton";
import { ReviewModalShell } from "@/components/admin/review/ReviewModalShell";
import {
  ShowReviewSurface,
  type AttentionJump,
  type CrewAttention,
  type ExtraSection,
} from "@/components/admin/review/ShowReviewSurface";
import { AttentionBanner } from "@/components/admin/review/AttentionBanner";
import { AttentionMenu } from "@/components/admin/showpage/AttentionMenu";
import { canonicalCrewKey, type AttentionItem } from "@/lib/admin/attentionItems";
import type { PublishedSectionData } from "@/components/admin/review/sectionData";
import type { SectionWarningRecord } from "@/lib/admin/sectionWarningModel";
import { buildSectionWarningExtras } from "@/components/admin/showpage/sectionWarningExtras";
import {
  CREW_CAP,
  RawUnrecognizedCallout,
  dateSummarySegments,
} from "@/components/admin/wizard/step3ReviewSections";
import { StatusStrip } from "@/components/admin/showpage/StatusStrip";
import type { PickerResetCrewRow } from "@/app/admin/show/[slug]/PickerResetControl";
import { OverviewSection } from "@/components/admin/showpage/OverviewSection";
import { ChangesSection } from "@/components/admin/showpage/ChangesSection";
import type { ChangesSectionProps } from "@/components/admin/showpage/ChangesSection";
import { useShowModalNav } from "@/components/admin/useShowModalNav";
import { useRouter } from "next/navigation";

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
  /** Server-derived unified attention list (published-show-alerts §3.1) — the
   *  ONE source for the pill, menu, nav badges/dots, and inline banners. */
  attentionItems: AttentionItem[];
  /** fetchPerShowAlerts returned infra_error (§3.2): degraded pill state +
   *  Overview notice; hold-derived items still render. */
  alertsDegraded: boolean;

  // ── Overview ──
  openSheetHref: string | null;
  hasActionableWarnings: boolean;
  archiveAction: () => Promise<LifecycleResult>;
  unarchiveAction: (showId: string) => Promise<void>;
  /** Crew addresses for the hub's batched Email-crew rows (share-hub T4). */
  crewEmails: readonly string[];
  /** Roster rows for the hub's everyone-reset control (share-hub T4). */
  pickerCrew: PickerResetCrewRow[];

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
    attentionItems,
    alertsDegraded,
    openSheetHref,
    hasActionableWarnings,
    archiveAction,
    unarchiveAction,
    crewEmails,
    pickerCrew,
    feed,
    undoAction,
    acceptAction,
    acceptAllAction,
    approveAction,
    rejectAction,
    alertId,
  } = props;

  const { close } = useShowModalNav();
  // Revalidate-on-open (spec 2026-07-19-show-modal-prefetch §3.2): a prefetched
  // open serves the router cache (possibly minutes old); one background
  // router.refresh() streams fresh RSC and reconciles in place. Ref guard =
  // exactly once per mounted instance (StrictMode double-effect dedupe); a
  // REOPEN is a new instance (streams through the Suspense fallback), so it
  // refreshes again — the intended per-open cadence.
  const router = useRouter();
  const refreshFiredRef = useRef(false);
  useEffect(() => {
    if (refreshFiredRef.current) return;
    refreshFiredRef.current = true;
    router.refresh();
  }, [router]);
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

  // ── Attention surface state (published-show-alerts §5/§6) ──────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const [doneIds, setDoneIds] = useState<ReadonlySet<string>>(new Set());
  const [jump, setJump] = useState<AttentionJump | null>(null);
  const jumpNonceRef = useRef(0);
  const pillRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();

  const live = useMemo(
    () => attentionItems.filter((i) => !doneIds.has(i.id)),
    [attentionItems, doneIds],
  );
  const actionable = useMemo(() => live.filter((i) => i.actionable), [live]);
  const clearingCount = live.length - actionable.length;
  // Registry-section amber dots (§5.3): overview/changes are extras with their
  // own badges, so they are excluded here.
  const attentionSections = useMemo(
    () =>
      new Set<string>(
        actionable.map((i) => i.sectionId).filter((s) => s !== "overview" && s !== "changes"),
      ),
    [actionable],
  );

  const navigateTo = useCallback((item: AttentionItem) => {
    jumpNonceRef.current += 1;
    setJump({ itemId: item.id, sectionId: item.sectionId, nonce: jumpNonceRef.current });
  }, []);

  // Plain function (React Compiler memoizes; a manual useCallback over doneIds
  // trips react-hooks/preserve-manual-memoization). §9 compound handled here in
  // the event handler — no self-close effect: the LAST actionable item
  // resolving closes an open menu. The ref mirrors doneIds so two resolves
  // completing in the SAME render window compose — the state closure alone is
  // stale for the second completion and would leave the menu open.
  const doneIdsRef = useRef<ReadonlySet<string>>(doneIds);
  const onResolved = (id: string) => {
    const next = new Set([...doneIdsRef.current, id]);
    doneIdsRef.current = next;
    setDoneIds(next);
    const remaining = attentionItems.filter((i) => i.actionable && !next.has(i.id));
    if (remaining.length === 0) setMenuOpen(false);
  };

  // Auto-open once per mount (§5.2); the guard consumes only when it DECIDES
  // (opens, or deep-link suppression) — NOT on first render, because the
  // revalidate-on-open router.refresh() above can stream actionable items
  // AFTER a prefetched empty first paint. Once fired it never re-fires, so a
  // user who closed the menu is not re-opened by later refreshes.
  const autoOpenFiredRef = useRef(false);
  useEffect(() => {
    if (autoOpenFiredRef.current) return;
    if (alertId != null) {
      autoOpenFiredRef.current = true; // deep link wins for the whole mount (§6.4)
      return;
    }
    if (actionable.length === 0) return;
    // rAF wrapper: the open is a paint-time reveal, and the lint contract
    // (react-hooks/set-state-in-effect) forbids the sync form. The guard is
    // consumed INSIDE the callback: a cancelled frame (dep change before
    // paint, or a StrictMode setup→cleanup→setup cycle) must leave the
    // one-shot unconsumed so the re-run can reschedule the open.
    const raf = requestAnimationFrame(() => {
      autoOpenFiredRef.current = true;
      setMenuOpen(true);
    });
    return () => cancelAnimationFrame(raf);
  }, [alertId, actionable.length]);

  // §6.4 one-shot alert_id deep link: a matching item jumps to its banner
  // anchor (aria-current + flash via the surface's attentionJump machinery);
  // no match → the legacy #overview center-scroll fallback. Ref guard =
  // one-shot; a rerender (even a changed alertId) never re-fires.
  const alertScrollFiredRef = useRef(false);
  useEffect(() => {
    if (alertId == null || alertScrollFiredRef.current) return;
    alertScrollFiredRef.current = true;
    const targetId = `alert:${alertId}`;
    const item = attentionItems.find((i) => i.id === targetId);
    if (item) {
      jumpNonceRef.current += 1;
      setJump({ itemId: item.id, sectionId: item.sectionId, nonce: jumpNonceRef.current });
      return;
    }
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const target = scroller.querySelector("#overview");
    if (target instanceof HTMLElement && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ block: "center" });
    }
  }, [alertId, attentionItems]);

  // ── Banner placement buckets (§5.4) ────────────────────────────────────────
  const highlightedItemId = alertId != null ? `alert:${alertId}` : null;
  // Plain per-render derivation (React Compiler memoizes; manual useMemo over
  // the unstable onResolved identity only fought the lint contract).
  // `underCrewRow` retired with the identity sub-line (show-alert-compact R6):
  // this card only renders inside the show modal, which already establishes the
  // show, so there was no longer anything for the flag to suppress.
  const bannerFor = (item: AttentionItem) => (
    <AttentionBanner
      key={item.id}
      item={item}
      slug={slug}
      now={now}
      highlighted={item.id === highlightedItemId}
      onResolved={onResolved}
    />
  );
  const { crewAttention, overviewBanners } = (() => {
    const byCrewKey = new Map<string, ReactNode[]>();
    const sectionTop: ReactNode[] = [];
    const overview: ReactNode[] = [];
    // Under-row placement targets only the RENDERED rows (CREW_CAP slice, §4).
    const renderedKeys = new Set(
      data.crewMembers.slice(0, CREW_CAP).map((m) => canonicalCrewKey(m.name || "")),
    );
    // Buckets iterate the FULL list, not the doneIds-filtered one: a resolved
    // banner swaps to "✓ Confirmed" IN PLACE and stays mounted until
    // router.refresh() reconciles (spec §6.3) — only counts/menu/dots shrink.
    for (const item of attentionItems) {
      if (item.kind !== "alert") continue;
      if (item.sectionId === "crew") {
        if (item.crewKey && renderedKeys.has(item.crewKey)) {
          const list = byCrewKey.get(item.crewKey) ?? [];
          list.push(bannerFor(item));
          byCrewKey.set(item.crewKey, list);
        } else {
          sectionTop.push(bannerFor(item));
        }
      } else if (item.sectionId === "overview") {
        overview.push(bannerFor(item));
      } else {
        // Defensive: unknown-routed alerts land in Overview (spec §4 fallback).
        overview.push(bannerFor(item));
      }
    }
    const crew: CrewAttention = { byCrewKey, sectionTop };
    return { crewAttention: crew, overviewBanners: overview };
  })();

  const overviewActionableCount = actionable.filter((i) => i.sectionId === "overview").length;
  const holdCount = actionable.filter((i) => i.kind === "hold").length;

  // §3.2 degraded notice (copy parity with the retired PerShowAlertSection
  // infra card) — rendered in Overview's attention slot when the alert read
  // faulted; never silently hidden.
  const degradedNotice = alertsDegraded ? (
    <div
      data-testid="attention-degraded-notice"
      className="rounded-md border border-border bg-warning-bg p-tile-pad text-sm text-warning-text"
    >
      <p className="text-base font-semibold">Could not load alerts</p>
      <p>This is usually temporary. Refresh in a moment.</p>
    </div>
  ) : null;

  // §5.1 Overview — the FIRST rail item; badge = overview-routed ACTIONABLE
  // attention count, rendered with the StatusStrip alert-badge token idiom.
  const overviewExtra: ExtraSection = {
    id: "overview",
    label: "Overview",
    Icon: LayoutDashboard,
    ...(overviewActionableCount > 0
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
              {overviewActionableCount}{" "}
              <span className="sr-only">
                open {overviewActionableCount === 1 ? "alert" : "alerts"}
              </span>
            </span>
          ),
        }
      : {}),
    render: () => (
      <OverviewSection
        showId={showId}
        archived={archived}
        finalizeOwned={finalizeOwned}
        openSheetHref={openSheetHref}
        hasActionableWarnings={hasActionableWarnings}
        archiveAction={archiveAction}
        unarchiveAction={unarchiveAction}
        attentionSlot={
          degradedNotice || overviewBanners.length > 0 ? (
            <div className="flex flex-col gap-2">
              {degradedNotice}
              {overviewBanners}
            </div>
          ) : null
        }
      />
    ),
  };

  // §5.4 Changes — the LAST rail item; badge = pending-hold count (§5.3).
  const changesExtra: ExtraSection = {
    id: "changes",
    label: "Changes",
    Icon: History,
    ...(holdCount > 0
      ? {
          railBadge: (
            <span
              data-testid="changes-rail-badge"
              className="ml-auto inline-flex shrink-0 items-center rounded-pill bg-warning-bg px-1.5 text-xs font-semibold tabular-nums text-warning-text"
            >
              {holdCount}{" "}
              <span className="sr-only">pending {holdCount === 1 ? "change" : "changes"}</span>
            </span>
          ),
        }
      : {}),
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
      // §6.5: this frame always streams in REPLACING the settled Suspense
      // skeleton (which owns the closed→open entrance) — an animated mount
      // here replays the pop-in over an already-opaque modal.
      entrance="none"
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
            {/* Attention pill (published-show-alerts §5.1) — four states from
                the ONE derived list. `before:-inset-y-3` hit-band arithmetic is
                COPIED from the prior pill: text-xs (~16px line box) + py-1
                (8px) ≈ a 24px visible pill; -inset-y-3 (12px per side) ≈ 48px
                ≥ the 44px tap floor. T-TAP probes the resolved band (§10). */}
            {actionable.length > 0 ? (
              <div className="relative">
                <button
                  ref={pillRef}
                  type="button"
                  data-testid={`${TESTID_BASE}-alert-pill`}
                  aria-expanded={menuOpen}
                  aria-controls={menuId}
                  onClick={() => setMenuOpen((v) => !v)}
                  className="relative inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-warning-bg px-2.5 py-1 text-xs font-semibold tabular-nums text-warning-text transition-colors duration-fast before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] hover:bg-warning-bg/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  {/* Decorative dot — the count text carries the meaning; live
                      token (--color-status-review), never the mock hex. */}
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-pill bg-status-review"
                  />
                  {/* Capped at 99+ (§11): unbounded count in a shrink-0 group
                      beside Close squeezes the title at 375px. The UNIT stays
                      VISIBLE; the exact count is preserved for assistive tech
                      past the cap only. */}
                  {actionable.length > 99 ? "99+" : actionable.length} to confirm
                  {actionable.length > 99 ? (
                    <>
                      {/* Separator is its OWN visible text node (accName trim
                          class, memory #470). */}{" "}
                      <span className="sr-only">({actionable.length} to confirm)</span>
                    </>
                  ) : null}
                  {/* Lucide chevron (codebase icon idiom), not the ⌃/⌄ text
                      glyphs — ⌃ is the macOS Control symbol and its baseline
                      drifts across platform fonts. */}
                  <ChevronDown
                    aria-hidden="true"
                    className={`size-3 shrink-0 text-warning-text transition-transform duration-fast ease-out-quart motion-reduce:transition-none ${
                      menuOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <div id={menuId}>
                  <AttentionMenu
                    items={live}
                    open={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    onNavigate={navigateTo}
                    pillRef={pillRef}
                  />
                </div>
              </div>
            ) : alertsDegraded && clearingCount === 0 ? (
              /* §5.1 degraded row: only when no hold carried the pill into the
                 To-confirm state; the Overview notice card is the detail. */
              <span
                data-testid={`${TESTID_BASE}-alert-pill`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-text-subtle"
              >
                Alerts unavailable
              </span>
            ) : clearingCount > 0 ? (
              /* §5.1 clearing state: auto-recovering items visible, never dark. */
              <span
                data-testid={`${TESTID_BASE}-alert-pill`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-surface-sunken px-2.5 py-1 text-xs font-semibold tabular-nums text-text-subtle"
              >
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-pill border-[1.5px] border-status-positive bg-transparent"
                />
                {clearingCount} clearing
              </span>
            ) : (
              /* §5.1 in-sync state (S3C-1 clean-dot recipe, DESIGN.md §92). */
              <span
                data-testid={`${TESTID_BASE}-alert-pill`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-status-positive-text"
              >
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-pill border-[1.5px] border-status-positive bg-transparent"
                />
                In sync
              </span>
            )}
            <ModalCloseButton ref={closeRef} testId={`${TESTID_BASE}-close`} />
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
          showId={showId}
          crewEmails={crewEmails}
          showTitle={title ?? slug}
          pickerCrew={pickerCrew}
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
        attentionSections={attentionSections}
        attentionJump={jump}
        crewAttention={crewAttention}
      />
    </ReviewModalShell>
  );
}
