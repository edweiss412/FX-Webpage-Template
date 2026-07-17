"use client";

/**
 * components/admin/showpage/PublishedReviewPage.tsx
 * (consolidated-admin-show-page spec §4–§6, §10 — Task 13 client shell)
 *
 * The client shell for the consolidated admin show page: the pinned StatusStrip
 * over the shared `ShowReviewSurface` (layout="page"), with Overview as the first
 * rail section, Changes as the last, and the per-section warning controls wired
 * under each parsed section. It owns the scroll container ref (the shell's job,
 * spec §3.1) and mounts the two extra rail sections + the raw-unrecognized bottom
 * slot. The registry sections, rail, chip rail, scroll-spy, and hash deep links
 * all live in `ShowReviewSurface`.
 *
 * RSC boundary: server-only pieces are pre-rendered by the server page and handed
 * in as ReactNode SLOTS (`alertSlot`, `shareSlot`); every server action arrives
 * as a DIRECT ref (never an inline-wrapped closure — the RSC server-action
 * lesson). `buildSectionWarningModel` (SERVER, node:crypto) ran on the page; this
 * shell only invokes the crypto-free `buildSectionWarningExtras` render factory.
 *
 * Final scroll-container binding + two-pane dimensional invariants (§8) are the
 * Task 14 real-browser pass; this shell wires the structure the modal already
 * proves.
 */

import { useMemo, useRef, type ReactNode } from "react";
import { LayoutDashboard, History } from "lucide-react";

import { ShowReviewSurface, type ExtraSection } from "@/components/admin/review/ShowReviewSurface";
import type { PublishedSectionData } from "@/components/admin/review/sectionData";
import type { SectionWarningRecord } from "@/lib/admin/sectionWarningModel";
import { buildSectionWarningExtras } from "@/components/admin/showpage/sectionWarningExtras";
import { RawUnrecognizedCallout } from "@/components/admin/wizard/step3ReviewSections";
import { StatusStrip } from "@/components/admin/showpage/StatusStrip";
import { OverviewSection } from "@/components/admin/showpage/OverviewSection";
import { ChangesSection } from "@/components/admin/showpage/ChangesSection";
import type { ChangesSectionProps } from "@/components/admin/showpage/ChangesSection";

type LifecycleResult = { ok: true } | { ok: false; code: string };

export type PublishedReviewPageProps = {
  /** The published-mode content contract feeding every parsed section panel. */
  data: PublishedSectionData;
  /** Per-section warning model (server-derived, crypto-free record) for §5.3 controls. */
  bySection: SectionWarningRecord;

  // ── StatusStrip (spec §4) ──
  slug: string;
  showId: string;
  title: string | null;
  archived: boolean;
  published: boolean;
  finalizeOwned: boolean;
  setPublished: (next: boolean) => Promise<LifecycleResult>;
  isLive: boolean;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  now: Date;
  alertCount: number;

  // ── Overview (spec §5.1) ──
  openSheetHref: string | null;
  hasActionableWarnings: boolean;
  archiveAction: () => Promise<LifecycleResult>;
  unarchiveAction: (showId: string) => Promise<void>;
  /** Server-rendered `<PerShowAlertSection/>`. */
  alertSlot: ReactNode;
  /** Server-rendered share-&-access cluster (`<CurrentShareLinkPanel/>`). */
  shareSlot: ReactNode;

  // ── Changes (spec §5.4) ──
  feed: ChangesSectionProps["feed"];
  undoAction: ChangesSectionProps["undoAction"];
  acceptAction: ChangesSectionProps["acceptAction"];
  acceptAllAction: ChangesSectionProps["acceptAllAction"];
  approveAction: ChangesSectionProps["approveAction"];
  rejectAction: ChangesSectionProps["rejectAction"];
};

export function PublishedReviewPage(props: PublishedReviewPageProps) {
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
  } = props;

  // The shell owns the scroll container the surface hands its scroll-spy (§3.1).
  const scrollerRef = useRef<HTMLElement | null>(null);

  // §5.3 per-section warning controls: the crypto-free render factory over the
  // server-derived model. Memoized on the record identity (stable per render).
  const renderSectionExtras = useMemo(() => buildSectionWarningExtras({ bySection }), [bySection]);

  // §5.1 Overview — the FIRST rail item; alert-count chip when > 0 (spec §5.1),
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
              {alertCount}
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
    <div data-testid="admin-show-page" className="flex min-h-0 flex-1 flex-col">
      <StatusStrip
        slug={slug}
        title={title}
        archived={archived}
        published={published}
        finalizeOwned={finalizeOwned}
        setPublished={setPublished}
        isLive={isLive}
        lastSyncedAt={lastSyncedAt}
        lastSyncStatus={lastSyncStatus}
        now={now}
        alertCount={alertCount}
      />
      <ShowReviewSurface
        data={data}
        scrollerRef={scrollerRef}
        layout="page"
        extraSectionsBefore={[overviewExtra]}
        extraSectionsAfter={[changesExtra]}
        renderSectionExtras={renderSectionExtras}
        bottomSlot={<RawUnrecognizedCallout raw={data.rawUnrecognized} />}
      />
    </div>
  );
}
