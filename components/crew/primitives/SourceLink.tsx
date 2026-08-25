/**
 * components/crew/primitives/SourceLink.tsx — tile → source-sheet deep link.
 *
 * A RECESSIVE "In sheet" affordance for a SectionCard's header `action` slot: a
 * small spreadsheet glyph + the short label "In sheet", kept secondary to the
 * section title by SIZE and by the icon rather than by colour.
 *
 * RESOLVED 2026-08-25 (`BL-TEXT-FAINT-AS-RESTING-INTERACTIVE-COLOUR`, design doc
 * 2026-08-25-ui-polish-class-sweep-design.md D4). This used to rest at
 * `text-text-faint` with hover at `text-text-subtle`, and the open question was
 * whether a crew-facing control may rest at the faint rung. The answer is the
 * condition now in DESIGN §1.1a: only where the control renders NO TEXT OF ITS
 * OWN. This one renders a label, and the faint rung is 3.35:1 — under the 4.5:1
 * floor for text. So it rests at `text-text`, hover and focus step to
 * `text-text-strong`, and focus also carries a RING, because a colour-only
 * indicator between 17.2:1 and 19:1 is no indicator at all.
 *
 * The quietness here was a deliberate crew-surface choice and was overridden
 * knowingly; it is stated in the PR body as a decision the owner can reverse.
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

  // Rests at text-text, not text-text-faint (DESIGN §1.1a, design doc
  // 2026-08-25-ui-polish-class-sweep-design.md D4). This link renders the label
  // "In sheet", and the faint rung measures 3.35:1 on the card fill — over the
  // 3:1 non-text floor a glyph would be held to, under the 4.5:1 floor for
  // TEXT. The quietness here was a deliberate crew-surface choice and it is
  // being overridden knowingly: the icon plus `text-xs` still keep this
  // secondary to the section copy without putting the label under the floor.
  // Hover and focus step to text-text-strong because their old target
  // (text-subtle) is now LIGHTER than the resting colour, which would make the
  // link read fainter on hover than at rest.
  //
  // And focus gains a RING, which it did not have before. Raising the resting
  // colour broke the focus indicator: this link's only focus cue was a colour
  // step, which used to be a visible 3.35:1 -> 6.8:1 jump and would now be
  // 17.2:1 -> 19:1, effectively invisible. A colour-only indicator that close
  // fails WCAG 2.4.11, and a keyboard user on a crew page would have had no
  // idea where they were. The ring matches CardReportTrigger, this link's peer
  // on the same cards. Found by the invariant-8 audit half on this branch.
  return (
    <a
      data-slot="source-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="In sheet, view this section in Google Sheets (opens in a new tab)"
      className={`inline-flex h-fit shrink-0 items-center gap-1 rounded-sm text-xs font-medium text-text transition-colors hover:text-text-strong focus-visible:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring [&_svg]:size-3.5 [&_svg]:opacity-70 ${overlay}`}
    >
      <SheetIcon />
      <span>In sheet</span>
    </a>
  );
}
