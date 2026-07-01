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
}: {
  cardId: CardId;
  driveFileId: string | null;
  anchor?: SourceAnchor | null | undefined;
  showId: string;
  cardReport?: CardReportContext;
}): ReactNode {
  const region = CARD_REGION_MAP[cardId];
  return (
    <span data-slot="card-header-actions" className="inline-flex h-fit shrink-0 items-center gap-2">
      <SourceLink driveFileId={driveFileId} anchor={anchor} />
      <CardReportTrigger cardId={cardId} region={region} showId={showId} cardReport={cardReport} />
    </span>
  );
}
