/**
 * components/crew/primitives/SourceLink.tsx — tile → source-sheet deep link.
 *
 * A SUBTLE "In sheet" affordance for a SectionCard's header `action` slot. It is
 * deliberately RECESSIVE: a small spreadsheet glyph + the short label "In sheet"
 * in the faintest text token (`text-text-faint`, quieter than the card title's
 * `text-text-subtle`), so it never competes with the section title or its
 * content. Hover lifts it to `text-text-subtle` for affordance feedback.
 *
 * It renders NOTHING (returns null) when `buildSheetDeepLink(driveFileId, anchor)`
 * yields null — i.e. when there is no source sheet to link to (null/empty
 * driveFileId). Otherwise it is a single `<a>` opening the Google Sheet in a new
 * tab with a hardened `rel`, the spreadsheet `SheetIcon` (same thin-stroke glyph
 * family as the card-head / FactRows icons), and a descriptive `aria-label`.
 *
 * Dimensional invariant: this lives in the header `action` slot and must NOT add
 * height to any data row. `inline-flex shrink-0 items-center h-fit` keeps it at
 * its intrinsic height and prevents it from stretching its flex parent.
 *
 * Props (binding contract): {driveFileId: string | null, anchor?: SourceAnchor | null}.
 * Pure synchronous Server Component (no `'use client'`) — props in, markup out.
 */
import type { ReactNode } from "react";
import { buildSheetDeepLink, type SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";
import { SheetIcon } from "@/components/crew/icons/sectionIcons";

type SourceLinkProps = {
  /** The source sheet's Drive file id. A null/empty id renders nothing. */
  driveFileId: string | null;
  /** Optional section anchor (tab + gid + a1). Absent/disallowed → un-anchored base link. */
  anchor?: SourceAnchor | null;
};

export function SourceLink({ driveFileId, anchor }: SourceLinkProps): ReactNode {
  const href = buildSheetDeepLink(driveFileId, anchor);
  // No source sheet → no affordance. Mirrors the helper's null contract.
  if (href === null) return null;

  return (
    <a
      data-slot="source-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View this section in the source sheet"
      className="inline-flex h-fit shrink-0 items-center gap-1 text-xs font-medium text-text-faint transition-colors hover:text-text-subtle focus-visible:text-text-subtle [&_svg]:size-3.5 [&_svg]:opacity-70"
    >
      <SheetIcon />
      <span>In sheet</span>
    </a>
  );
}
