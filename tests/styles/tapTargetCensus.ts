/**
 * tests/styles/tapTargetCensus.ts
 *
 * The reasons-required census for the repo-wide tap-height guard (spec §5.3).
 *
 * A row here does NOT mean "this control is too small". It means the STATIC
 * scanner could not prove a >= 44px height from the class string, and a human
 * wrote down why that is acceptable — a principled exemption family, the
 * geometry that reaches the floor, a filed under-floor defect, or a className
 * the resolver cannot read. The alternative to a row is a named suite failure,
 * never a silent pass.
 *
 * Categories (spec §5.3):
 *   inline-prose-link    bucket B — WCAG 2.5.5 inline exception (PRODUCT.md:59)
 *   parent-label-target  bucket C — the real target is the label/row around it
 *   full-bleed           bucket F — the control fills a region taller than 44px
 *   padding-arithmetic   bucket D — clears by computed geometry; reason shows it
 *   under-floor-filed    genuinely under the floor, filed on the ledger
 *   unresolvable-dynamic bucket E residue — className the resolver cannot read
 *
 * Seeded 2026-08-14 by running the shipped scanner (spec §1.1 R7: the branch
 * derives its own numbers), and re-derived 2026-08-15 after the whole-diff
 * review tightened the grammar. 53 rows out of 354 in-scope elements — 301
 * clear statically. Per category: 15 full-bleed, 13 unresolvable-dynamic, 9
 * padding-arithmetic, 7 inline-prose-link, 7 parent-label-target, 2
 * dev-only-unstyled.
 *
 * Three rows moved from `under-floor-filed` to `parent-label-target` on
 * 2026-08-25, and the direction is the point: they are not reclassified, they
 * are REPAIRED. `BL-CHECKBOX-ROW-LABEL-UNDER-FLOOR` had them right about the
 * mechanism and wrong about the site — a native input IS targeted through its
 * label, and that label was one text line high. Now it carries the floor, so
 * the category that was already true of the mechanism is true of the box too.
 * `under-floor-filed` is now EMPTY. Its last two rows were the dev panel's, and
 * they moved to `dev-only-unstyled` on the same date: that surface is ratified
 * as an unstyled developer tool, not a repair anybody owes. The category stays
 * in the union because the next genuinely-under-floor site should have somewhere
 * honest to go.
 *
 * The two rows the tightening ADDED are the useful record here: both had been
 * clearing on a horizontal-only pseudo bleed that proves nothing about height.
 * A census row that grows because the recogniser got stricter is the system
 * working; a clear that survives because the recogniser is loose is the failure
 * this guard exists to prevent.
 */

export type TapCensusCategory =
  | "inline-prose-link"
  | "parent-label-target"
  | "full-bleed"
  | "padding-arithmetic"
  | "under-floor-filed"
  /**
   * A build-gated developer surface, ratified as unstyled. NOT a filing: the
   * floor is not enforced here and this census does not claim it is. Every such
   * row states its re-file trigger, and its executable premise — that the file
   * is still excluded from Tailwind's source scan — is asserted by the suite.
   */
  | "dev-only-unstyled"
  | "unresolvable-dynamic";

export type TapCensusRow = {
  /** Repo-relative path, as the scanner reports it. */
  readonly file: string;
  /** 1-based line of the element's opening tag. Part of the key. */
  readonly line: number;
  readonly tag: string;
  readonly category: TapCensusCategory;
  /** Why this element does not need to clear statically. Never blank. */
  readonly reason: string;
  /** Required on `under-floor-filed` rows: the ledger entry that owns the repair. */
  readonly backlogRef?: string;
};

export const TAP_TARGET_CENSUS: readonly TapCensusRow[] = [
  // ---- dev-only-unstyled (2) ----------------------------------------------
  // Ratified 2026-08-25 (design doc 2026-08-25-ui-polish-class-sweep-design.md,
  // D5), closing BL-ADMIN-DEV-PANEL-TAP-FLOOR. These were `under-floor-filed`,
  // which asserts an OPEN repair somebody owes; nobody owes this one.
  {
    file: "app/admin/dev/page.tsx",
    line: 151,
    tag: "button",
    category: "dev-only-unstyled",
    reason:
      "Dev-panel button at py-1 (~28px). The page is build-gated out of production (ADMIN_DEV_PANEL_ENABLED) and `app/globals.css` excludes it from Tailwind's source scan, so a class-level repair emits NO CSS while making a static guard report a floor the browser never applies — strictly worse than an honest row. Ratified as an unstyled developer tool rather than repaired. RE-FILE TRIGGER: ADMIN_DEV_PANEL_ENABLED becoming true in a production build, or the panel gaining a non-developer audience.",
  },
  {
    file: "app/admin/dev/page.tsx",
    line: 165,
    tag: "button",
    category: "dev-only-unstyled",
    reason:
      "Second dev-panel button, same shape and same ratification as the one above. RE-FILE TRIGGER: as above — a production build reaching this surface, or a non-developer audience for it.",
  },
  // ---- full-bleed, added by the R1 grammar tightening (2) ----------------
  // Both of these were CLEARING before the whole-diff review, and both for the
  // wrong reason: the pseudo recipe read any `before:-inset-*` as proof of
  // height, including the horizontal-only form. Neither element's height comes
  // from its own class string at all, so neither can be proven statically —
  // which is a census row, not a defect (whole-diff R1 F3).
  {
    file: "components/admin/BellPanel.tsx",
    line: 720,
    tag: "a",
    category: "full-bleed",
    reason:
      "The chevron link is `w-7 self-stretch` inside the alert row, so its height is the ROW's, which the file's own comment measures at 60px+. `before:inset-y-0 before:-inset-x-2` bleeds the target 8px sideways to 44px WIDE — a width repair, and width is not what this guard proves (spec §5.1). The height is real and comes from the parent, which no class string on this element can state.",
  },
  {
    file: "components/admin/nav/AdminPageHeader.tsx",
    line: 47,
    tag: "Link",
    category: "full-bleed",
    reason:
      "The back link's hit area is a DIRECTIONAL pseudo bleed — `before:-inset-x-2 before:-top-6 before:bottom-0` — reaching 24px upward into the header's own padding and nothing downward. The scanner models the symmetric `-inset-y-*` form only, deliberately: adding the edges up needs the element's own line height, which is exactly the content-dependence this census exists for.",
  },

  // ---- inline-prose-link (7) ---------------------------------------------
  // WCAG 2.5.5 exempts targets in a sentence or block of text; PRODUCT.md:59
  // carries that exception forward for this project.
  {
    file: "app/admin/settings/admins/RevokeRowButton.tsx",
    line: 284,
    tag: "button",
    category: "inline-prose-link",
    reason:
      "One of the THREE inline-prose exemptions ratified 2026-08-10 (spec 2026-08-10-tap-target-inline-controls); `tests/a11y/tapTargetInlineExemptions.test.ts` pins its comment, its class string and its inline-prose parent.",
  },
  {
    file: "components/admin/RoleRecognizeControl.tsx",
    line: 274,
    tag: "button",
    category: "inline-prose-link",
    reason:
      "Second of the three ratified inline-prose exemptions (2026-08-10), pinned in source by `tests/a11y/tapTargetInlineExemptions.test.ts`.",
  },
  {
    file: "components/shared/ReportModal.tsx",
    line: 599,
    tag: "button",
    category: "inline-prose-link",
    reason:
      "Third of the three ratified inline-prose exemptions (2026-08-10), pinned in source by `tests/a11y/tapTargetInlineExemptions.test.ts`.",
  },
  {
    file: "app/help/errors/page.tsx",
    line: 82,
    tag: "a",
    category: "inline-prose-link",
    reason:
      "Help-doc link inside running prose, with no className at all — the MDX-content case PRODUCT.md:59 names explicitly.",
  },
  {
    file: "app/show/[slug]/unpublish/blocks.tsx",
    line: 65,
    tag: "a",
    category: "inline-prose-link",
    reason:
      "Underlined link inside the unpublished-show explanation paragraph; inline within running text.",
  },
  {
    file: "components/admin/HoverHelp.tsx",
    line: 613,
    tag: "a",
    category: "inline-prose-link",
    reason:
      "'Learn more' link at the end of the help popover's prose body; inline within running text.",
  },
  {
    file: "components/admin/ShowsTable.tsx",
    line: 705,
    tag: "Link",
    category: "inline-prose-link",
    reason:
      "'What the sync statuses mean' link inside the legend paragraph under the table; inline within running text.",
  },

  // ---- parent-label-target (7) -------------------------------------------
  // A native checkbox inside a <label>: the label is the target, and it carries
  // the floor. The input's own `size-*` is the drawn box, not the hit area.
  {
    file: "app/admin/settings/roles/RoleMappingRow.tsx",
    line: 261,
    tag: "input",
    category: "parent-label-target",
    reason:
      "Role-flag checkbox inside `<label className='flex min-h-tap-min cursor-pointer items-center gap-2.5'>` — the label carries the floor and the whole row is the target.",
  },
  {
    file: "components/admin/RoleRecognizeControl.tsx",
    line: 327,
    tag: "input",
    category: "parent-label-target",
    reason: "Role-recognize checkbox inside its floor-carrying `<label>` row.",
  },
  {
    file: "components/admin/dev/MaterializeCard.tsx",
    line: 198,
    tag: "input",
    category: "parent-label-target",
    reason: "Dev materialize-option checkbox inside its label row; the row is the target.",
  },
  {
    file: "components/admin/wizard/Step3ReviewModal.tsx",
    line: 783,
    tag: "input",
    category: "parent-label-target",
    reason: "Step-3 review selection checkbox inside its label row; the row is the target.",
  },
  {
    file: "app/admin/settings/roles/RoleMappingRow.tsx",
    line: 287,
    tag: "input",
    category: "parent-label-target",
    reason:
      "FINANCIALS checkbox, now inside a floor-carrying `<label>` like its A1/V1/L1 siblings. Was `under-floor-filed`: the floor sat on the row `div` while the `<label htmlFor>` was a SIBLING of the input, so it was on an element that toggles nothing (BL-CHECKBOX-ROW-LABEL-UNDER-FLOOR, closed 2026-08-25). The caution copy stays OUTSIDE the label, still bound by `aria-describedby`, so the accessible name is the short caption alone.",
  },
  {
    file: "components/admin/RoleRecognizeControl.tsx",
    line: 360,
    tag: "input",
    category: "parent-label-target",
    reason:
      "FINANCIALS checkbox, identical shape and identical repair to the RoleMappingRow row above — the two are the same control and drifted apart once already.",
  },
  {
    file: "components/admin/StagedReviewCard.tsx",
    line: 587,
    tag: "input",
    category: "parent-label-target",
    reason:
      "Staged-review action radio inside `<label className='flex min-h-tap-min cursor-pointer items-center gap-2 py-1 …'>`. Was `under-floor-filed` and deferred under class-sweep exception (c); the 2026-08-25 sweep touched this surface, so (c) stopped fencing it.",
  },
  // ---- full-bleed (13) ----------------------------------------------------
  // Scrims, click-away layers, and controls whose box IS a region far taller
  // than 44px. Every one is `inset-0`/`size-full` or fills a sized parent.
  {
    file: "components/admin/AppHealthPopover.tsx",
    line: 69,
    tag: "button",
    category: "full-bleed",
    reason: "Popover scrim: `absolute inset-0`, so its box is the viewport it dims.",
  },
  {
    file: "components/admin/BellPanel.tsx",
    line: 1267,
    tag: "div",
    category: "full-bleed",
    reason: "Bell-panel scrim: `fixed inset-0 z-banner bg-overlay-scrim`.",
  },
  {
    file: "components/admin/FinalizeButton.tsx",
    line: 787,
    tag: "button",
    category: "full-bleed",
    reason: "Finalize details scrim: `absolute inset-0 bg-overlay-scrim`.",
  },
  {
    file: "components/admin/HelpSheet.tsx",
    line: 135,
    tag: "div",
    category: "full-bleed",
    reason: "Help-sheet scrim: `absolute inset-0 bg-black/40`.",
  },
  {
    file: "components/admin/ShowRowActions.tsx",
    line: 619,
    tag: "button",
    category: "full-bleed",
    reason:
      "Click-away layer behind the row-actions menu: `fixed inset-0 z-banner cursor-default`.",
  },
  {
    file: "components/admin/nav/UserMenu.tsx",
    line: 66,
    tag: "button",
    category: "full-bleed",
    reason: "Click-away layer behind the user menu: `fixed inset-0 z-raised cursor-default`.",
  },
  {
    file: "components/admin/showpage/ShareHub.tsx",
    line: 760,
    tag: "button",
    category: "full-bleed",
    reason: "Click-away layer behind the share popover: `fixed inset-0 z-dropdown cursor-default`.",
  },
  {
    file: "components/admin/showpage/ShareHub.tsx",
    line: 1054,
    tag: "div",
    category: "full-bleed",
    reason:
      "Not a control: a full-width section wrapper whose `onClick` scrolls its own section into view. The real targets are the rows inside it, and the wrapper spans the whole section.",
  },
  {
    file: "components/admin/wizard/CrewRowActions.tsx",
    line: 248,
    tag: "button",
    category: "full-bleed",
    reason: "Click-away layer behind the crew-row menu: `fixed inset-0 z-dropdown cursor-default`.",
  },
  {
    file: "components/admin/wizard/step3ReviewSections.tsx",
    // Line moved 3909 -> 3928 on 2026-08-27 by this arc's own Task 4 (impeccable P1b),
    // which added the placeholder's name span and the anchor's focus ring 19 lines above.
    // The ELEMENT is untouched: same `<a>`, same full-bleed layout, same reason below.
    line: 3928,
    tag: "a",
    category: "full-bleed",
    reason:
      "`relative block aspect-4/3 w-full` link wrapping the diagram preview image, which is a `fill` child of it — the anchor IS the tile box, measured 97px tall at the 390px sheet and 170px on desktop, so far past 44px. Note for anyone reading this after a diff that moves the tile's border: the tile's CHROME (`rounded-md border border-text-faint bg-surface-sunken`) lives on the IMAGE, and it moving does not affect this row. What makes the anchor full-bleed is the LAYOUT — `relative` plus the aspect box plus a `fill` child — and 2026-08-27 saw exactly that confusion, where the chrome moved to the anchor and back while this row stayed correct throughout.",
  },
  {
    file: "components/diagrams/Gallery.tsx",
    line: 354,
    tag: "button",
    category: "full-bleed",
    reason: "`block size-full cursor-zoom-in` over a gallery tile: the tile is the target.",
  },
  {
    file: "components/diagrams/GalleryLightbox.tsx",
    line: 622,
    tag: "motion.div",
    category: "full-bleed",
    reason: "Lightbox surface: `fixed inset-0 z-overlay flex` — the whole viewport.",
  },
  {
    file: "components/shared/ReportModal.tsx",
    line: 546,
    tag: "button",
    category: "full-bleed",
    reason: "Report-modal scrim: `absolute inset-0 bg-text-strong/40`.",
  },

  // ---- padding-arithmetic (9) --------------------------------------------
  // The floor is reached by computed geometry the token grammar does not read.
  // Each reason shows the arithmetic.
  // Recategorised 2026-08-15 (whole-diff R3 F2): it sat in the full-bleed
  // section while its category had already moved, so the section headers and
  // the row disagreed.
  {
    file: "components/admin/nav/AdminNav.tsx",
    line: 232,
    tag: "Link",
    category: "padding-arithmetic",
    reason:
      "Bottom-tab link: `flex flex-col items-center justify-center gap-1 self-stretch py-2 text-xs` around a `size-5` icon and one text-xs line = 8 + 20 + 4 + 16 + 8 = 56px. `self-stretch` then matches every tab to the tallest. The bar itself (`fixed inset-x-0 bottom-0 flex border-t`, AdminNav.tsx:219) declares NO height, so it is the CONTENT that clears the floor here — the row said `full-bleed` and named a fixed-height bar that does not exist (whole-diff R2 F2).",
  },
  {
    file: "app/me/meShowSections.tsx",
    line: 213,
    tag: "Link",
    category: "padding-arithmetic",
    reason:
      "Card-sized show link: `p-tile-pad py-6` = 24px top + 24px bottom around at least one line of text, so >= 48px before content.",
  },
  {
    file: "components/admin/ShowsTable.tsx",
    line: 546,
    tag: "Link",
    category: "padding-arithmetic",
    reason:
      "Table row link: `flex flex-col gap-1 px-4 py-3` = 12px + 12px around two stacked lines (>= 20px each plus a 4px gap), so >= 68px.",
  },
  {
    file: "components/admin/wizard/Step3SheetCard.tsx",
    line: 151,
    tag: "a",
    category: "padding-arithmetic",
    reason:
      "Negative-margin hit-area recipe, one-directional UPWARD (amended 2026-08-15, spec 2026-08-15-step3-tap-cluster \u00a72.1): `-mt-5 -mx-2 px-2 pt-5` = 20px above a `text-base` line (24.8px line-height) = 44.8px, with the negative margin keeping the layout box unchanged. The scan cannot credit one-sided padding (`verticalPaddingPx` takes `Math.min(top, bottom)`), which is why it lands here rather than clearing.",
  },
  {
    file: "components/admin/PublishedToggle.tsx",
    // Re-keyed 292 -> 459 -> 486 -> 507 -> 517 by review-modal-strip-dock — SEVEN
    // times across one arc, every shift caused by lines added ABOVE this element
    // and none by the element itself, which is the whole content of
    // BL-MUTATION-SITEID-LINE-KEYED-CHURN in its own domain. It added the
    // placement effect above this component. The element, its recipe and this
    // row's reason are all unchanged — only the address moved, which is the
    // line-keyed churn the mutation registry records as
    // BL-MUTATION-SITEID-LINE-KEYED-CHURN in its own domain. Verified a MOVE
    // rather than a new violation both times: both census arms failed with one
    // entry each (one missing, one stale), and the element's context is
    // byte-identical against the pre-change file. The second shift came from
    // the diff-review round-1 degenerate-guard repair, which added lines above
    // this element without touching it — the fifth position-or-count-keyed
    // record this one arc has had to move.
    line: 517,
    tag: "button",
    category: "padding-arithmetic",
    reason:
      "Switch: 28px visual track (`h-7`) with `before:absolute before:-inset-y-2 before:inset-x-0` extending the hit area 8px above and below = 44px. The `h-7` reads as a rule-8 defeater, which is why it lands here rather than clearing.",
  },
  {
    file: "components/admin/settings/AutoPublishToggle.tsx",
    line: 123,
    tag: "button",
    category: "padding-arithmetic",
    reason:
      "Same switch recipe as PublishedToggle (28px track + `before:-inset-y-2` = 44px). The expansion was ADDED on this branch: the guard found this switch at a bare 28px hit area, matching a sibling that had already been repaired.",
  },
  {
    file: "components/admin/settings/NotifyToggle.tsx",
    line: 131,
    tag: "button",
    category: "padding-arithmetic",
    reason:
      "Same switch recipe and the same repair as AutoPublishToggle, found by the same scan run (28px track + `before:-inset-y-2` = 44px).",
  },
  {
    file: "components/crew/primitives/SourceLink.tsx",
    line: 95,
    tag: "a",
    category: "padding-arithmetic",
    reason:
      "'In sheet' link: `h-fit` on the visual box with a `before:absolute before:h-tap-min` pseudo spanning the card width as the hit area. The `h-fit` reads as a rule-8 defeater, so the site is recorded rather than cleared.",
  },
  {
    file: "components/shared/CardReportTrigger.tsx",
    line: 73,
    tag: "button",
    category: "padding-arithmetic",
    reason:
      "Card report flag: same `h-fit` + `before:absolute` 44px pseudo recipe as SourceLink, and recorded for the same reason.",
  },

  // ---- unresolvable-dynamic (13) -----------------------------------------
  // Spec §5.4's consequence bound in action: the resolver could not read the
  // className, so the element is named here instead of being passed silently.
  {
    file: "app/admin/show/[slug]/ShareLinkCopyButton.tsx",
    line: 169,
    tag: "button",
    category: "unresolvable-dynamic",
    reason:
      "`className={className[variant]}` — a computed member access (spec §5.2 rule 6: not resolvable).",
  },
  {
    file: "app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx",
    line: 87,
    tag: "button",
    category: "unresolvable-dynamic",
    reason:
      "`className={`${rowClassName} …`}` — the class string arrives as a PROP from _PickerInterstitial, which is the className-as-prop limit spec §10 records.",
  },
  {
    file: "components/admin/DataQualityWarningControls.tsx",
    line: 110,
    tag: "button",
    category: "unresolvable-dynamic",
    reason: "`${NEUTRAL_BTN} ${RING_OFFSET[mode]}` — computed member access in the template.",
  },
  {
    file: "components/admin/HoverHelp.tsx",
    line: 550,
    tag: "button",
    category: "unresolvable-dynamic",
    reason:
      "Help trigger whose className is assembled per variant; one arm is outside the resolver's rules, so the whole className demotes (rule 2).",
  },
  {
    file: "components/admin/HoverHelp.tsx",
    line: 562,
    tag: "button",
    category: "unresolvable-dynamic",
    reason: "Second help-trigger variant in the same component, demoted for the same reason.",
  },
  {
    file: "components/admin/NeedsAttentionSummaryCard.tsx",
    line: 36,
    tag: "Link",
    category: "unresolvable-dynamic",
    reason:
      "Template className with an unreadable span; the readable part already carries `min-h-tap-min`, but an unread span could carry a defeater, so it demotes.",
  },
  {
    file: "components/admin/SheetIconLink.tsx",
    line: 91,
    tag: "a",
    category: "unresolvable-dynamic",
    reason:
      "`${BASE_CLASSES} ${BACKDROP_SKIN[ringOffset]} ${className ?? ''}` — a computed member access plus a caller-supplied prop.",
  },
  {
    file: "components/admin/ShowRowActions.tsx",
    line: 716,
    tag: "button",
    category: "unresolvable-dynamic",
    reason:
      "Row-actions menu item: spreads `{...itemDisabledProps}`, an identifier the resolver cannot read, and a spread can override className.",
  },
  {
    file: "components/admin/ShowRowActions.tsx",
    line: 750,
    tag: "button",
    category: "unresolvable-dynamic",
    reason: "Second menu item with the same identifier spread.",
  },
  {
    file: "components/admin/ShowRowActions.tsx",
    line: 781,
    tag: "button",
    category: "unresolvable-dynamic",
    reason: "Third menu item with the same identifier spread.",
  },
  {
    file: "components/admin/review/ReviewModalShell.tsx",
    line: 595,
    tag: "button",
    category: "unresolvable-dynamic",
    reason:
      "Modal scrim that also spreads `{...{ [`data-${prefix}-scrim`]: '' }}` and `{...entranceAttr}` — a computed key and an identifier. (Its readable className is `absolute inset-0`, i.e. full-bleed, but the spread is what demotes it.)",
  },
  {
    file: "components/shared/AccentButton.tsx",
    line: 139,
    tag: "button",
    category: "unresolvable-dynamic",
    reason:
      "The allowlisted component's OWN implementation: `className={classes}` composes the base with a caller prop, and it also spreads `{...rest}`. Its call sites clear through rule 7; this element is the definition, not a call site.",
  },
  {
    file: "components/shared/ReportButton.tsx",
    line: 142,
    tag: "button",
    category: "unresolvable-dynamic",
    reason:
      "Variant-driven className whose branches interpolate an unreadable `${offsetClass}` span; the readable parts carry `min-h-tap-min` on every branch, but an unread span could carry a defeater.",
  },
];
