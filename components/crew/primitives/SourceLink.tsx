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
  /**
   * Optional section anchor (tab + gid + a1). Absent/disallowed → un-anchored
   * base link. `undefined` is accepted (mirrors `buildSheetDeepLink`'s
   * `anchor?` contract) so call sites can pass `sourceAnchors[regionId]` — an
   * indexed read that widens to `SourceAnchor | undefined` under
   * `noUncheckedIndexedAccess` — without a non-null assertion.
   */
  anchor?: SourceAnchor | null | undefined;
  /**
   * CARDREPORT-1: which direction the invisible ≥44px tap overlay grows. The
   * visible glyph+label are unchanged; a transparent out-of-flow `::before`
   * (invisible to `getBoundingClientRect()`) enlarges only the hit area.
   * `"up"` (default) anchors the overlay bottom to the box bottom and grows
   * upward — zero downward overhang, so it never intersects the interactive
   * rows below a SectionCard header. `"down"` anchors the top and grows down —
   * used only by the bare `schedule-days` header to clear the agenda above.
   */
  hitDirection?: "up" | "down";
};

export function SourceLink({
  driveFileId,
  anchor,
  hitDirection = "up",
}: SourceLinkProps): ReactNode {
  const href = buildSheetDeepLink(driveFileId, anchor);
  // No source sheet → no affordance. Mirrors the helper's null contract.
  if (href === null) return null;

  // Full-literal per branch so the Tailwind v4 JIT sees complete class names.
  const overlay =
    hitDirection === "down"
      ? "relative before:absolute before:content-[''] before:inset-x-0 before:top-0 before:h-tap-min"
      : "relative before:absolute before:content-[''] before:inset-x-0 before:bottom-0 before:h-tap-min";

  return (
    <a
      data-slot="source-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View this section in the source sheet"
      className={`inline-flex h-fit shrink-0 items-center gap-1 text-xs font-medium text-text-faint transition-colors hover:text-text-subtle focus-visible:text-text-subtle [&_svg]:size-3.5 [&_svg]:opacity-70 ${overlay}`}
    >
      <SheetIcon />
      <span>In sheet</span>
    </a>
  );
}
