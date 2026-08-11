/**
 * tests/components/admin/showpage/popoverOverlayRegistry.ts
 *
 * Registry of every anchored, internally-scrolling OVERLAY in `components/**`,
 * with an explicit decision about how each one survives a clipping ancestor.
 *
 * Why this exists (plan 2026-07-24-sharehub-viewport-popover-and-archive-copy
 * Task 1): the review-modal panel carries `overflow-clip`
 * (components/admin/review/ReviewModalShell.tsx:623), which is NOT a scroll
 * container. An overlay anchored inside it that carries its own
 * `overflow-y-auto` therefore strands the tail of its scroll range in the
 * hidden strip below the clip edge — content that no scroll position in any
 * container can reach. `HoverHelp` hit this (BL-HOVERHELP-PORTAL) and was
 * fixed; the share hub was written in the same idiom afterwards, did NOT
 * inherit the fix, and nothing failed. That is the gap this registry closes.
 *
 * RE-KEYED PER OVERLAY 2026-08-10 (BL-POPOVER-REGISTRY-PER-FILE-AND-TAILWIND-
 * ONLY): rows were previously per FILE, so a second undispositioned overlay in
 * a registered file was invisible to the guard, and recognition read only the
 * Tailwind class idiom, so an inline-style overlay was never detected. Each
 * row now names ONE overlay element by its stable marker — the element's
 * `data-testid` literal, or the exact source text of its value expression when
 * dynamic (HoverHelp's `` `${testId}-body` ``). Detection is the per-element
 * AST walk in `_popoverOverlayExtract.ts`, covering both the class idiom and
 * literal inline styles.
 *
 * THE FENCE (documented limit, stated rather than over-promised): recognition
 * reads the structural accept-set only — static className forms (literals,
 * static template chunks, module-const references incl. `cn(...)` wrapping,
 * conditional branches) and literal `style` object properties. Runtime-
 * assembled styles and spread-in props are OUTSIDE recognition; a POSITIONED
 * element whose `style` is unreadable is refused by name unless it carries a
 * row in `UNCLASSIFIED_STYLE_EXEMPTIONS` below. Adversarial obfuscation is out
 * of scope (accidental authoring is the threat model).
 *
 * Files that left the registry in the re-key, recorded so nobody re-adds them
 * from memory of the old rows: `FinalizeButton.tsx` (its sheet is `relative`
 * — the old file-level match co-located an anchor hint and a scroller from
 * DIFFERENT surfaces, the row itself called it a benign over-match) and
 * `BellPanel.tsx` (its scroller is unpositioned in-file; the positioning
 * lives in the nav mount, outside any clipping ancestor — the old row said
 * exactly this).
 */

/** How a given overlay avoids stranding content behind a clip edge. */
export type OverlayDisposition =
  /** Resolves geometry through `lib/popover/position.ts` (asserted by import). */
  | "placement-module"
  /** Capped against the clip edge via `useFitWithinClip` (asserted by import). */
  | "fit-within-clip"
  /** Not inside a clipping ancestor, or has no internal scroll range to strand. */
  | "not-clip-constrained"
  /** Matches the shape and is NOT known-safe; carries a backlog ref. */
  | "unverified-gap";

export type OverlayRow = {
  /** Repo-relative path, exactly as `walkSourceFiles` yields it. */
  readonly file: string;
  /**
   * The overlay element's stable marker: its `data-testid` literal, or the
   * exact source text of the value expression when dynamic.
   */
  readonly overlay: string;
  readonly disposition: OverlayDisposition;
  /** Why this disposition is correct. Never blank. */
  readonly reason: string;
};

export const POPOVER_OVERLAY_REGISTRY: readonly OverlayRow[] = [
  {
    file: "components/admin/HoverHelp.tsx",
    overlay: "`${testId}-body`",
    disposition: "placement-module",
    reason:
      "Migrated 2026-07-22 (feat/hoverhelp-smart-position). Portals into the ReviewModalShell panel via PopoverHostContext and places with computePopoverPlacement.",
  },
  {
    file: "components/admin/showpage/ShareHub.tsx",
    overlay: "share-hub-popover",
    disposition: "placement-module",
    reason:
      "Migrated 2026-07-24. Same portal + computePopoverPlacement stack as HoverHelp; before this it was the live instance of the defect (armed Archive confirm unreachable at every phone height).",
  },
  {
    file: "components/admin/ReSyncButton.tsx",
    overlay: "admin-resync-error",
    disposition: "fit-within-clip",
    reason:
      "Clip-safe by the other route: useFitWithinClip caps the overlay against the clip edge. Full-width inset-x-0, where flipping sides buys nothing, so the placement module is not worth the churn.",
  },
  {
    file: "components/admin/ReSyncButton.tsx",
    overlay: "admin-resync-shrink-confirm",
    disposition: "fit-within-clip",
    reason:
      "Same OVERLAY_PANEL skin and cap as admin-resync-error — one shared const carries the fit-within-clip geometry for all three ReSync overlays.",
  },
  {
    file: "components/admin/ReSyncButton.tsx",
    overlay: "admin-resync-success",
    disposition: "fit-within-clip",
    reason:
      "Same OVERLAY_PANEL skin and cap as admin-resync-error; the success summary can exceed the panel height on phones, so the cap is load-bearing, not decorative.",
  },
  {
    file: "components/admin/PublishedToggle.tsx",
    overlay: "published-toggle-popover",
    disposition: "fit-within-clip",
    reason:
      "Detected 2026-08-02, the moment its anchored refusal banner became an internal scroller (BL-PUBLISHED-TOGGLE-OVERLAY-CLIP). Absolutely anchored inside the sticky strip inside the review-modal panel (overflow-clip, NOT a scroll container); useFitWithinClip caps it against that edge. Full-width inset-x-0, so side-flipping buys nothing.",
  },
  {
    file: "components/admin/showpage/AttentionMenu.tsx",
    overlay: "published-show-review-attention-menu",
    disposition: "fit-within-clip",
    reason:
      "Surfaced BY this registry 2026-07-24 as unverified-gap, then MEASURED and closed 2026-08-02 (BL-ATTENTION-MENU-PANEL-CLIP): spec 2026-08-01-admin-popover-overlay-cluster §2.2 probed 390x560 and found a 54px stranded tail. Positioning on the panel wrapper, scroll on the inner list — the anchored-descendant-scroller shape; its scroller takes useFitWithinClip.",
  },
];

export type UnclassifiedStyleExemption = {
  readonly file: string;
  /** Marker (or source text) identifying the element, as extraction reports it. */
  readonly overlay: string;
  /** Why a runtime-assembled style is CORRECT here. Never blank. */
  readonly reason: string;
};

/**
 * Positioned elements whose `style` is legitimately runtime-assembled. Each
 * row is held against live extraction both ways (missing row fails; stale row
 * fails), so this list can never silently grow or rot.
 */
export const UNCLASSIFIED_STYLE_EXEMPTIONS: readonly UnclassifiedStyleExemption[] = [
  {
    file: "components/admin/AnchoredPortal.tsx",
    overlay: "testId",
    reason:
      "The placement MECHANISM itself: its style IS the computed placement output (lib/popover/place), applied to a portal under document.body — no clipping ancestor can sit between it and the viewport, which is the property every consumer row above is buying.",
  },
];
