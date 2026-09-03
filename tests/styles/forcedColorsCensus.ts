/**
 * Forced-colors census: the disposition of every candidate the two scanner arms
 * report. Spec `docs/superpowers/specs/2026-09-01-forced-colors-pass.md` §4.4,
 * plan `docs/superpowers/plans/2026-09-01-forced-colors-pass.md`.
 *
 * WHY A CENSUS AND NOT A FILTER. Both arms REPORT candidates and neither decides
 * that a candidate is a defect, because CSS alone cannot say when a rule applies
 * and cannot see a glyph. Every reported candidate is therefore either repaired by
 * this pass or carries a row here naming the carrier that survives. Silence is not
 * a disposition.
 *
 * Rows are content-keyed on the subject rather than on a line number, because a
 * line-keyed registry rots under any edit above it — the lesson
 * `tests/styles/controlOutlineScan.ts:99-196` records in a hundred lines of
 * re-keying history.
 */

/** Why a reported Arm 2 rule is not a defect, or how it is repaired. */
export type CarrierDisposition =
  /** The pass repairs it in the forced-colors block. */
  | "repaired"
  /** Deliberately flattened; the spec's Documented Limits names the class. */
  | "deliberate-flatten";

export type CarrierCensusRow = {
  /** The rule's selector or `@keyframes <name>`, exactly as the arm reports it. */
  readonly subject: string;
  /**
   * The at-rule chain the subject sits inside, outermost first, exactly as the arm
   * reports it. Empty at top level.
   *
   * Part of the KEY, not decoration. `[data-step3-warning-flash]` exists in the
   * base context and again inside `@media (prefers-reduced-motion: reduce)`, so a
   * subject-only match let the reduced-motion row license a base-context candidate
   * silently while the fixed row count stayed green. Whole-diff review R1.
   */
  readonly context: readonly string[];
  readonly disposition: CarrierDisposition;
  /** Names the carrier that survives, or the spec limit that accepts the flatten. */
  readonly reason: string;
};

/**
 * Arm 2's twelve A2a rules and five A2b animations, as reported on the base of
 * this branch. The count is pinned by the suite: a census that silently grows
 * passes a subset assertion, which is why the literal is asserted rather than the
 * membership alone.
 */
export const CARRIER_CENSUS: readonly CarrierCensusRow[] = [
  // ── The three cues, and the gradient. Repaired by the pass. ──
  {
    subject: "@keyframes share-link-flash-ring",
    context: [],
    disposition: "repaired",
    reason: "the cue this pass is named for; its only carrier is a dropped box-shadow (spec §5.1)",
  },
  {
    subject: "@keyframes share-link-flash-bg",
    context: [],
    disposition: "repaired",
    reason: "the background leg of the same cue; both endpoints force to one value (spec §5.1)",
  },
  {
    subject: "@keyframes step3-warning-flash",
    context: [],
    disposition: "repaired",
    reason: "a jump-target highlight whose only carrier is a forced background (spec §5.2)",
  },
  {
    subject: "[data-step3-warning-flash]",
    context: ["@media (prefers-reduced-motion: reduce)"],
    disposition: "repaired",
    reason:
      "the steady reduced-motion fallback for the same cue. Its carrier is FORCED rather than dropped, which is the case the first Arm 2 criterion could not see (spec §5.2)",
  },
  {
    subject:
      'progress[data-testid="wizard-step2-progressbar"]:indeterminate::-webkit-progress-bar,\nprogress[data-testid="wizard-finalize-progressbar"]:indeterminate::-webkit-progress-bar',
    context: [],
    disposition: "repaired",
    reason:
      "the indeterminate shimmer, on BOTH the step-2 and finalize bars: the rule is a grouped selector and this pass repairs both (spec §5.5)",
  },
  {
    subject:
      'progress[data-testid="wizard-step2-progressbar"]:indeterminate::-moz-progress-bar,\nprogress[data-testid="wizard-finalize-progressbar"]:indeterminate::-moz-progress-bar',
    context: [],
    disposition: "repaired",
    reason: "the same shimmer in Gecko, whose rule also sets a transparent background (spec §5.5)",
  },

  // ── The freshness cue. NOT repaired: it already survives. ──
  {
    subject: "@keyframes section-freshness-flash-1",
    context: [],
    disposition: "deliberate-flatten",
    reason:
      "the fade is lost and the signal is not: the gating attribute is present only during a flash, so the forced opaque outline IS the cue (spec §5.3, §8 limit 7)",
  },
  {
    subject: "@keyframes section-freshness-flash-2",
    context: [],
    disposition: "deliberate-flatten",
    reason: "the alternate body of the same cue, kept identical by an existing drift pin",
  },
  {
    subject: "[data-section-freshness-flash]",
    context: ["@media (prefers-reduced-motion: reduce)"],
    disposition: "deliberate-flatten",
    reason:
      "its reduced-motion arm; under forced colors a reduced-motion user sees the steady outline the normal-mode design withholds, accepted for symmetry since the fade is gone for everyone (spec §8 limit 8)",
  },

  // ── Base reading colour. Flattening these is what forced colors is FOR. ──
  {
    subject: "html",
    context: [],
    disposition: "deliberate-flatten",
    reason: "the page's base colour pair; the user asked for the palette (spec §8 limit 2)",
  },
  {
    subject: ".help-prose > h1",
    context: ["@layer base"],
    disposition: "deliberate-flatten",
    reason: "a reading-hierarchy heading colour, not a state (spec §8 limit 2)",
  },
  {
    subject: ".help-prose > h2",
    context: ["@layer base"],
    disposition: "deliberate-flatten",
    reason: "same",
  },
  {
    subject: ".help-prose > h3",
    context: ["@layer base"],
    disposition: "deliberate-flatten",
    reason: "same",
  },
  {
    subject: '.help-prose > table[data-stack="true"] .th-label',
    context: ["@layer base", "@media (max-width: 480px)"],
    disposition: "deliberate-flatten",
    reason: "a stacked-table label colour under 480px; hierarchy, not state (spec §8 limit 2)",
  },

  // ── The progress track's non-indeterminate rules. ──
  {
    subject:
      'progress[data-testid="wizard-step2-progressbar"]::-webkit-progress-bar,\nprogress[data-testid="wizard-finalize-progressbar"]::-webkit-progress-bar',
    context: [],
    disposition: "repaired",
    reason: "the determinate track, repaired alongside the fill so the two stay distinguishable",
  },
  {
    subject:
      'progress[data-testid="wizard-step2-progressbar"]::-webkit-progress-value,\nprogress[data-testid="wizard-finalize-progressbar"]::-webkit-progress-value',
    context: [],
    disposition: "repaired",
    reason: "the determinate fill; it is the half AC-5's negative control deletes",
  },
  {
    subject:
      'progress[data-testid="wizard-step2-progressbar"]::-moz-progress-bar,\nprogress[data-testid="wizard-finalize-progressbar"]::-moz-progress-bar',
    context: [],
    disposition: "repaired",
    reason: "the same fill in Gecko, a separate declaration and a separate control",
  },
];

/** Why a reported Arm 1 collision is not a defect, or that the pass repairs it. */
export type CollapseDisposition =
  /** Colour is the sole VISUAL carrier; the pass repairs it. */
  | "repaired"
  /** Something non-chromatic also changes, so the state survives. */
  | "carrier-survives"
  /** Deliberately flattened; a spec Documented Limit names the class. */
  | "deliberate-flatten"
  /** Not a state distinction at all. */
  | "not-a-state";

export type CollapseCensusRow = {
  /** `file:line` of the element's opening tag, as Arm 1 reports it. */
  readonly site: string;
  readonly disposition: CollapseDisposition;
  /** For a non-repair, the carrier that survives, named. */
  readonly reason: string;
  /**
   * How to reach this control in a real browser. REQUIRED on a repair row.
   *
   * Whole-diff review R1: AC-4 renders the colliding class strings against the
   * live compiled stylesheet, which proves the CSS repair, and does NOT render the
   * component. A row holding only a site and a token pair cannot be navigated to,
   * so a live condition could inverate and the synthetic case would stay green.
   * Naming the locator here is what makes the gap addressable rather than
   * invisible — and `bound` says plainly whether a browser case actually uses it
   * yet.
   */
  readonly binding?: {
    /** A `data-testid`, or another attribute selector that resolves to the element. */
    readonly locator: string;
    /** What moves the control between the two colliding states. */
    readonly toggle: string;
    /** Whether a browser case currently navigates to it. */
    readonly bound: boolean;
  };
};

/**
 * THE RULE THESE ROWS APPLY. A surviving carrier must be VISUALLY PERCEIVABLE.
 * Forced colors is used by SIGHTED people who need contrast, so an accessibility
 * attribute is not a carrier for them: `aria-current="page"` renders nothing. And
 * a carrier painted in a forced property does not survive however geometric it
 * looks — the review rail's indicator is positioned by transform and sized by
 * height, but its only paint is `bg-accent`, which forces to the same system
 * colour as the rail behind it.
 *
 * A carrier survives when it is rendered TEXT that differs, a glyph differing in
 * SHAPE, a border or outline WIDTH, a padding or size difference, a font-weight
 * change, or an element present in one state and absent in the other.
 *
 * Every row was decided by READING what the component renders. Three plan-review
 * rounds found dispositions made from class-string diffs instead, and the tell was
 * internal: the same shape (`aria-expanded` plus a rendered popup) was censused at
 * one site and repaired at its twin.
 */
export const COLLAPSE_CENSUS: readonly CollapseCensusRow[] = [
  // ── Repair: colour is the sole visual carrier. ──
  {
    site: "app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:249",
    disposition: "repaired",
    binding: {
      locator: '[data-testid="picker-role-chip"]',
      toggle: "a crew member with LEAD in role_flags versus one without",
      bound: false,
    },
    reason:
      "crew-facing role chip; both paths render the same {c.role}, no glyph, no aria, no size or weight difference",
  },
  {
    site: "components/crew/CrewSubNav.tsx:114",
    disposition: "repaired",
    binding: {
      locator: '[data-testid="crew-sub-nav"] [data-section]',
      toggle: "navigating between crew sections",
      bound: false,
    },
    reason:
      "crew-facing tabs; border-b-2 on BOTH paths so only its colour differs, same icon either way, aria-current toggles nothing rendered",
  },
  {
    site: "components/admin/review/ShowReviewSurface.tsx:838",
    disposition: "repaired",
    binding: {
      locator: '[data-testid*="-review-chip-item-"]',
      toggle: "clicking another chip",
      bound: false,
    },
    reason:
      "nav pill; border width is in the shared base so both are 1px, icon tint unconditional, label unchanged",
  },
  {
    site: "components/admin/review/ShowReviewSurface.tsx:1019",
    disposition: "repaired",
    binding: {
      locator: '[data-testid*="-review-chip-item-"]',
      toggle: "clicking another chip",
      bound: false,
    },
    reason: "same pair; the sr-only text and dot are status-derived, not active-derived",
  },
  {
    site: "components/admin/review/ShowReviewSurface.tsx:805",
    disposition: "repaired",
    binding: {
      locator: '[data-testid$="-review-rail-item-"]',
      toggle: "clicking another rail item",
      bound: false,
    },
    reason:
      "rail item; active fills at rest and inactive only on hover, and the rail indicator's own paint is a background that flattens with it",
  },
  {
    site: "components/admin/review/ShowReviewSurface.tsx:926",
    disposition: "repaired",
    binding: {
      locator: '[data-testid*="-review-rail-item-"]',
      toggle: "clicking another rail item",
      bound: false,
    },
    reason: "same; railCount and the dot are data-derived",
  },
  {
    site: "components/admin/UndoChangeButton.tsx:51",
    disposition: "repaired",
    binding: {
      locator: '[data-testid="change-feed-undo"]',
      toggle: "the quiet prop, set by the feed row's density",
      bound: false,
    },
    reason:
      "the quiet/consequential safety distinction; `border` on both branches so no width change, and children are keyed on `pending` rather than on `quiet`",
  },
  {
    site: "components/admin/nav/AdminNav.tsx:236",
    disposition: "repaired",
    binding: {
      locator: 'nav [aria-current="page"]',
      toggle: "navigating to another admin route",
      // Bound by AC-4e on desktop-chromium, where this row is the visible one:
      // the top row is `hidden min-[840px]:flex`, so it renders at 1280 and not
      // at 390. The mobile half of the same case binds :301.
      bound: true,
    },
    reason: "desktop nav; aria-current only, and icon and label render unchanged in both states",
  },
  {
    site: "components/admin/nav/AdminNav.tsx:301",
    disposition: "repaired",
    binding: {
      locator: '[data-testid^="admin-bottom-tab-"]',
      toggle: "navigating to another admin route",
      // NOT bound, and the reason is the engine rather than a missing seed:
      // these bottom tabs render only under 840px, so mobile-safari is the only
      // project that can reach them, and WebKit does not implement
      // forced-colors — AC-4e skips there by design. Binding this row needs a
      // third project on an engine that implements the feature at a phone
      // viewport, not a fixture.
      bound: false,
    },
    reason:
      "mobile tab; aria-current only, and the attention badge is keyed on showBadge rather than on active",
  },
  {
    site: "components/admin/telemetry/EventFilters.tsx:97",
    disposition: "repaired",
    binding: {
      locator: '[data-testid^="filter-level-"]',
      toggle: "toggling a level filter",
      bound: false,
    },
    reason: "level filter; aria-pressed only, and the visible text is the level either way",
  },
  {
    site: "components/admin/DashboardBucketSegmentedControl.tsx:56",
    disposition: "repaired",
    binding: {
      locator: '[data-testid="dashboard-bucket-active"]',
      toggle: "switching bucket",
      bound: false,
    },
    reason:
      "an interactive Link whose selected state was carried by bg-surface, shadow-tile and a text tone, all of which flatten or drop; its label is static across both paths and aria-current renders nothing, so the selected fill is what repairs it",
  },
  {
    site: "components/admin/DashboardBucketSegmentedControl.tsx:76",
    disposition: "repaired",
    binding: {
      locator: '[data-testid="dashboard-bucket-archived"]',
      toggle: "switching bucket",
      bound: false,
    },
    reason:
      "an interactive Link whose selected state was carried by bg-surface, shadow-tile and a text tone, all of which flatten or drop; its label is static across both paths and aria-current renders nothing, so the selected fill is what repairs it",
  },
  // ── Carrier survives: something non-chromatic changes too. ──
  {
    site: "components/crew/primitives/RunOfShowList.tsx:93",
    disposition: "carrier-survives",
    reason:
      "titleTone is driven by isSynthetic (components/crew/primitives/RunOfShowList.tsx:48), the SAME condition that gives the ancestor border-l border-border pl-2 at :78 - a border WIDTH and an indent, both of which survive",
  },
  {
    site: "components/admin/review/ShowReviewSurface.tsx:823",
    disposition: "carrier-survives",
    reason:
      "a label inside the rail item at :805, whose aria-current the selected-state rule paints; its sibling icon at :819 is censused on the same reasoning",
  },
  {
    site: "components/admin/review/ShowReviewSurface.tsx:945",
    disposition: "carrier-survives",
    reason:
      "a label inside the rail item at :926, whose aria-current the selected-state rule paints; its sibling icon at :939 is censused on the same reasoning",
  },
  {
    site: "app/me/meShowSections.tsx:219",
    disposition: "carrier-survives",
    reason:
      "the same value picks the tone AND renders the words: relativeDayChip returns Today/Tomorrow/In N days (lib/time/relative.ts:31)",
  },
  { site: "app/me/meShowSections.tsx:278", disposition: "carrier-survives", reason: "same" },
  {
    site: "components/admin/ShowRowActions.tsx:647",
    disposition: "carrier-survives",
    reason: "aria-expanded AND an open menu that is rendered",
  },
  {
    site: "components/admin/wizard/CrewRowActions.tsx:270",
    disposition: "carrier-survives",
    reason: "same",
  },
  {
    site: "components/admin/showpage/PublishedReviewModal.tsx:1133",
    disposition: "carrier-survives",
    reason:
      "the states differ by filled, triangular and hollow MARKS (components/admin/review/attentionMark.ts:76), which is shape",
  },
  {
    site: "components/admin/wizard/Step3ReviewModal.tsx:590",
    disposition: "carrier-survives",
    reason: "same",
  },
  {
    site: "components/admin/UseRawControl.tsx:334",
    disposition: "carrier-survives",
    reason:
      "role=radio with aria-checked AND a rendered dot (components/admin/UseRawControl.tsx:368)",
  },
  {
    site: "components/admin/UseRawControl.tsx:360",
    disposition: "carrier-survives",
    reason: "the checked row renders In use or Selected beside the dot",
  },
  {
    site: "components/admin/UseRawControl.tsx:372",
    disposition: "carrier-survives",
    reason: "same",
  },
  {
    site: "components/admin/showpage/ShareHub.tsx:828",
    disposition: "carrier-survives",
    reason: "aria-expanded AND when true a popup is on screen",
  },
  {
    site: "components/admin/review/ShowReviewSurface.tsx:819",
    disposition: "carrier-survives",
    reason: "an icon inside a rail item this pass repairs, so it inherits a repaired state",
  },
  {
    site: "components/admin/review/ShowReviewSurface.tsx:939",
    disposition: "carrier-survives",
    reason:
      "an icon inside the second rail item this pass repairs, so it inherits its repaired state",
  },
  {
    site: "components/admin/showpage/PublishedReviewModal.tsx:1376",
    disposition: "carrier-survives",
    reason:
      "monitoringOnly also selects the attention mark's SHAPE at :1189 via attentionMarkClass (filled, triangular or hollow), which is what carries it; the chevron is aria-hidden decoration whose tone echoes that. Its rotation is driven by menuOpen, a different variable, so rotation distinguishes nothing within a colliding pair",
  },
  {
    site: "components/admin/wizard/Step3ReviewModal.tsx:729",
    disposition: "carrier-survives",
    reason:
      "same shape as PublishedReviewModal:1376: the mark's shape carries the state and the chevron's rotation is driven by a different variable",
  },
  {
    site: "components/crew/CrewSubNav.tsx:125",
    disposition: "carrier-survives",
    reason: "an icon inside the tab button this pass repairs",
  },
  // ── Deliberate flatten: a ruled exemption, or a limit the spec records. ──
  {
    site: "components/admin/OnboardingWizard.tsx:260",
    disposition: "deliberate-flatten",
    reason:
      "ACTIVE and DONE are carried by a Check glyph and font-weight; VISITED against UNREACHED flattens, and the spec records that pair as a deliberate limit (spec 8 limit 2) since both are non-current steps",
  },
  {
    site: "components/admin/PublishedToggle.tsx:517",
    disposition: "deliberate-flatten",
    reason:
      "switch track; contrast treatment already ruled (DESIGN.md 1.2a, tests/styles/controlOutlineResidue.ts:873)",
  },
  {
    site: "components/admin/settings/AutoPublishToggle.tsx:123",
    disposition: "deliberate-flatten",
    reason: "same",
  },
  {
    site: "components/admin/settings/NotifyToggle.tsx:131",
    disposition: "deliberate-flatten",
    reason: "switch track; the notify toggle wears the same ruled recipe (DESIGN.md 1.2a)",
  },
  {
    site: "components/admin/settings/DeveloperToggleButton.tsx:93",
    disposition: "deliberate-flatten",
    reason: "switch track; the developer toggle wears the same ruled recipe (DESIGN.md 1.2a)",
  },
  {
    // :113 until the comment carrying this file's data-fc-skip note moved above the
    // element to stop overflowing sec-15's 700-character tween window. Same eight-line
    // shift that moved controlOutlineScan's row to :135; both are line-keyed, so both
    // move together and neither is safe to carry over from a pre-move reading.
    site: "components/admin/telemetry/AutoRefreshControl.tsx:121",
    disposition: "deliberate-flatten",
    reason: "switch track; the auto-refresh toggle wears the same ruled recipe (DESIGN.md 1.2a)",
  },
  {
    site: "components/admin/PerShowActionableWarnings.tsx:458",
    disposition: "deliberate-flatten",
    reason:
      "the pair differs only in focus-visible:ring-offset-*; the ring is not this repo's focus indicator and an offset colour is invisible either way",
  },
  {
    site: "components/admin/showpage/PublishedReviewModal.tsx:1327",
    disposition: "deliberate-flatten",
    reason:
      "text-warning-text/80 against a sibling tone; emphasis, which spec 8 limit 2 flattens deliberately",
  },
  {
    site: "components/admin/wizard/Step3ReviewModal.tsx:662",
    disposition: "deliberate-flatten",
    reason: "text-warning-text/80 against a sibling tone; emphasis, which spec 8 limit 2 flattens",
  },
  {
    site: "components/shared/AccentButton.tsx:139",
    disposition: "deliberate-flatten",
    reason:
      "sixteen paths colliding on shadow-tile alone, a raised variant against a flat one; spec 8 limit 3",
  },
  // ── Not a collapse. ──
  {
    site: "components/admin/RescanSheetButton.tsx:209",
    disposition: "not-a-state",
    reason:
      "the two paths are one button on two surrounding plates (components/admin/RescanSheetButton.tsx:222), not two user-visible states",
  },
  {
    site: "components/admin/NeedsAttentionSummaryCard.tsx:36",
    disposition: "not-a-state",
    reason:
      "its colliding pair is identical: two render paths resolving to the same class string, so nothing differs",
  },
];
