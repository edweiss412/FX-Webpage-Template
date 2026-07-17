/**
 * components/crew/primitives/CardHeaderActions.tsx — the SectionCard header
 * `action` cluster: the recessive `SourceLink` deep link plus the per-card
 * `CardReportTrigger`, right-aligned as one intrinsic-height group.
 *
 * Server Component (no `"use client"`): it renders the server `SourceLink` and
 * the client `CardReportTrigger` leaf. The `anchor` is passed in EXPLICITLY (not
 * derived from `CARD_REGION_MAP[cardId]`) because some call sites compute a
 * bespoke anchor — the `gear-scope-*` cards pick the dynamic `gear_scope` anchor
 * when present, else fall back to `rooms` (GearSection). Only `region` (for the
 * report `fieldRef`) comes from the static `CARD_REGION_MAP`.
 */
import type { ReactNode } from "react";
import { SourceLink } from "@/components/crew/primitives/SourceLink";
import { CardReportTrigger } from "@/components/shared/CardReportTrigger";
import { DEFAULT_CARD_REPORT, type CardReportContext } from "@/lib/crew/cardReportContext";
import {
  CARD_REGION_MAP,
  type CardId,
  type SourceAnchor,
} from "@/lib/sheet-links/buildSheetDeepLink";

export function CardHeaderActions({
  cardId,
  driveFileId,
  anchor,
  showId,
  cardReport = DEFAULT_CARD_REPORT,
  hitDirection = "up",
}: {
  cardId: CardId;
  driveFileId: string | null;
  anchor?: SourceAnchor | null | undefined;
  showId: string;
  cardReport?: CardReportContext;
  /**
   * CARDREPORT-1: direction the leaves' ≥44px tap overlays grow. Default `"up"`
   * is correct for every `SectionCard`-hosted cluster (zero downward overhang
   * clears the interactive rows below). The one bare `schedule-days` header
   * (`ScheduleSection`) passes `"down"` to clear the agenda above. Reflected as
   * `data-hit-direction` so a jsdom render test can pin the production wiring
   * (a forgotten prop would silently default schedule-days to `"up"`).
   */
  hitDirection?: "up" | "down";
}): ReactNode {
  const region = CARD_REGION_MAP[cardId];
  return (
    // A `div` (flow content), NOT a `span`: CardReportTrigger mounts ReportModal's
    // `<div role="dialog">` overlay as a descendant when open, which is invalid
    // inside a `span` (phrasing content). `inline-flex` keeps the cluster's
    // intrinsic-width, header-band layout identical to a span. `gap-4` (not gap-2)
    // gives the trigger's centered 44px overlay ≥1px clearance from SourceLink.
    <div
      data-slot="card-header-actions"
      data-hit-direction={hitDirection}
      className="inline-flex h-fit shrink-0 items-center gap-4"
    >
      <SourceLink driveFileId={driveFileId} anchor={anchor} hitDirection={hitDirection} />
      <CardReportTrigger
        cardId={cardId}
        region={region}
        showId={showId}
        cardReport={cardReport}
        hitDirection={hitDirection}
      />
    </div>
  );
}
