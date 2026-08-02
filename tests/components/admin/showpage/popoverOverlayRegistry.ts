/**
 * tests/components/admin/showpage/popoverOverlayRegistry.ts
 *
 * Registry of every anchored, internally-scrolling overlay in `components/**`,
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
 * The companion test's detector is deliberately BROAD (see
 * `_metaPopoverPlacementContract.test.ts`). Over-matching is the intended cost:
 * it buys one reasoned row here instead of a silent pass. Under-matching is the
 * failure mode that shipped the defect.
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
  readonly disposition: OverlayDisposition;
  /** Why this disposition is correct. Never blank. */
  readonly reason: string;
};

export const POPOVER_OVERLAY_REGISTRY: readonly OverlayRow[] = [
  {
    file: "components/admin/HoverHelp.tsx",
    disposition: "placement-module",
    reason:
      "Migrated 2026-07-22 (feat/hoverhelp-smart-position). Portals into the ReviewModalShell panel via PopoverHostContext and places with computePopoverPlacement.",
  },
  {
    file: "components/admin/showpage/ShareHub.tsx",
    disposition: "placement-module",
    reason:
      "Migrated 2026-07-24. Same portal + computePopoverPlacement stack as HoverHelp; before this it was the live instance of the defect (armed Archive confirm unreachable at every phone height).",
  },
  {
    file: "components/admin/ReSyncButton.tsx",
    disposition: "fit-within-clip",
    reason:
      "Clip-safe by the other route: useFitWithinClip caps the overlay against the clip edge. Its overlay is full-width inset-x-0, where flipping sides buys nothing, so migrating it to the placement module is not worth the churn.",
  },
  {
    file: "components/admin/FinalizeButton.tsx",
    disposition: "not-clip-constrained",
    reason:
      "Portals out of the tree, so the review-modal panel is never an ancestor. Also a benign over-match: the anchor and scroller hints occur on different surfaces within the file.",
  },
  {
    file: "components/admin/BellPanel.tsx",
    disposition: "not-clip-constrained",
    reason:
      "Mounts in the nav bell (components/admin/nav/NotifBell.tsx), outside the review-modal panel, so no overflow-clip ancestor sits between it and the viewport.",
  },
  {
    file: "components/admin/PublishedToggle.tsx",
    disposition: "fit-within-clip",
    reason:
      "Detected 2026-08-02, the moment its anchored refusal banner became an internal scroller (BL-PUBLISHED-TOGGLE-OVERLAY-CLIP). The banner is absolutely anchored inside the sticky strip, which sits inside the review-modal panel (overflow-clip, NOT a scroll container), so an uncapped box strands the tail of its own scroll range below the clip edge. useFitWithinClip caps it against that edge. Placement-module migration buys nothing here: the banner is full-width inset-x-0, so flipping sides changes nothing.",
  },
  {
    file: "components/admin/showpage/AttentionMenu.tsx",
    disposition: "fit-within-clip",
    reason:
      "Surfaced BY this registry 2026-07-24 as unverified-gap, then MEASURED and closed 2026-08-02 (BL-ATTENTION-MENU-PANEL-CLIP). The suspicion was right: spec 2026-08-01-admin-popover-overlay-cluster §2.2 probed 390x560 and found the panel overhanging the clip edge by 55px with a 54px stranded tail. Its scroller now takes useFitWithinClip, so the max-h-96 cap is bounded by the clip edge rather than hoping 384px fits.",
  },
];
