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
 * this branch, plus the crew search reveal cue's rule and animation (one each,
 * feat/crew-show-search). The count is pinned by the suite: a census that silently grows
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
    subject: "@keyframes search-reveal-flash",
    context: [],
    disposition: "repaired",
    reason:
      "the crew search reveal: a jump-target tint whose only carrier is a forced background, repaired by the same steady Highlight outline as the step-3 cue (crew show search spec §6.6)",
  },
  {
    subject: "[data-search-reveal]",
    context: ["@media (prefers-reduced-motion: reduce)"],
    disposition: "repaired",
    reason:
      "the steady reduced-motion tint for the same cue, a FORCED carrier; the forced-colors outline rule is unconditional, so it holds in this mode too",
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
    reason:
      "the determinate fill; its Gecko counterpart is the half AC-5's negative control deletes, since deleting this -webkit- declaration leaves Blink's render byte-identical (spec limit 10)",
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
    site: "app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:255",
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
    // 844 -> 865 on feat/warning-card-fixes Task 17 (jumpToHotel added above it); located
    // by its own element on the edited tree (same tag, same class string).
    // 865 -> 886 on feat/warning-card-fixes (a11y fix (a): the jump-focus helpers above the rail); located by its own element (5-line context match).
    // 886 -> 862 on the merge of origin/main into feat/crew-page-redesign (that branch
    // read 820: its scroll spy moved out to lib/ui/scrollSpy.ts); located by its own
    // element on the merged tree (6-line context match), not by adding the deltas.
    site: "components/admin/review/ShowReviewSurface.tsx:862",
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
    // 1025 -> 1046 on feat/warning-card-fixes Task 17 (jumpToHotel added above it); located
    // by its own element on the edited tree (same tag, same class string).
    // 1046 -> 1067 on feat/warning-card-fixes (a11y fix (a): the jump-focus helpers above the rail); located by its own element (5-line context match).
    // 1067 -> 1043 on the merge of origin/main into feat/crew-page-redesign (that branch
    // read 1001: its scroll spy moved out to lib/ui/scrollSpy.ts); located by its own
    // element on the merged tree (6-line context match), not by adding the deltas.
    site: "components/admin/review/ShowReviewSurface.tsx:1043",
    disposition: "repaired",
    binding: {
      locator: '[data-testid*="-review-chip-item-"]',
      toggle: "clicking another chip",
      bound: false,
    },
    reason: "same pair; the sr-only text and dot are status-derived, not active-derived",
  },
  {
    // 811 -> 832 on feat/warning-card-fixes Task 17 (jumpToHotel added above it); located
    // by its own element on the edited tree (same tag, same class string).
    // 832 -> 853 on feat/warning-card-fixes (a11y fix (a): the jump-focus helpers above the rail); located by its own element (5-line context match).
    // 853 -> 829 on the merge of origin/main into feat/crew-page-redesign (that branch
    // read 787: its scroll spy moved out to lib/ui/scrollSpy.ts); located by its own
    // element on the merged tree (6-line context match), not by adding the deltas.
    site: "components/admin/review/ShowReviewSurface.tsx:829",
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
    // 932 -> 953 on feat/warning-card-fixes Task 17 (jumpToHotel added above it); located
    // by its own element on the edited tree (same tag, same class string).
    // 953 -> 974 on feat/warning-card-fixes (a11y fix (a): the jump-focus helpers above the rail); located by its own element (5-line context match).
    // 974 -> 950 on the merge of origin/main into feat/crew-page-redesign (that branch
    // read 908: its scroll spy moved out to lib/ui/scrollSpy.ts); located by its own
    // element on the merged tree (6-line context match), not by adding the deltas.
    site: "components/admin/review/ShowReviewSurface.tsx:950",
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
      // Bound by AC-4e, which runs under desktop-chromium — the only project that
      // collects the forced-colors spec — where this row is the visible one: the
      // top nav is `hidden min-[840px]:flex`, so it renders at 1280. There is no
      // mobile half; :301 stays unbound because no collecting project reaches it.
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
  // The day row's two pressed-state buttons were repair rows until the UI-gate
  // re-run (critique N6) gave the pressed day a selection bar, an ::after box the
  // unpressed day does not have: a shape, which forcing keeps (the bar paints
  // HighlightText there, app/globals.css), so the pair no longer collapses and
  // the scanner no longer reports it. The aria-pressed Highlight fill still
  // applies to both buttons.
  {
    site: "components/crew/CrewDayRow.tsx:128",
    disposition: "carrier-survives",
    reason:
      "crew day row's Now button; pressed, it carries the selection bar under its label (an ::after box the unpressed button lacks), which survives forcing, and the aria-pressed Highlight fill still applies",
  },
  {
    site: "components/crew/CrewDayRow.tsx:144",
    disposition: "carrier-survives",
    reason:
      "crew day button; pressed, it carries the selection bar under its label (an ::after box the unpressed day lacks), which survives forcing, and the aria-pressed Highlight fill still applies",
  },
  {
    site: "components/crew/CrewDayRow.tsx:158",
    disposition: "carrier-survives",
    reason:
      "the weekday caption inside a crew day button; the button itself carries the pressed state, as aria-pressed (the forced-colors Highlight fill at CrewDayRow.tsx:144, and its selection bar), and the caption inherits HighlightText on it",
  },
  {
    site: "components/crew/CrewDayRow.tsx:167",
    disposition: "carrier-survives",
    reason: "same",
  },
  {
    // :93 -> :76 (and :48 -> :36, :78 -> :61 in the reason) on feat/crew-show-search (Schedule search entries): the row's
    // display fields moved to `runOfShowEntryLine` below the components. Same summary.
    // :76 -> :79 (and :36 -> :39, :61 -> :64 in the reason) on feat/crew-page-redesign
    // (plan Task 10): the row's `next` prop for the run card's "Next" marker sits above it.
    site: "components/crew/primitives/RunOfShowList.tsx:79",
    disposition: "carrier-survives",
    reason:
      "titleTone is driven by isSynthetic (components/crew/primitives/RunOfShowList.tsx:39), the SAME condition that gives the ancestor border-l border-border pl-2 at :64 - a border WIDTH and an indent, both of which survive",
  },
  {
    // 829 -> 850 on feat/warning-card-fixes Task 17 (jumpToHotel added above it); located
    // by its own element on the edited tree (same tag, same class string).
    // 850 -> 871 on feat/warning-card-fixes (a11y fix (a): the jump-focus helpers above the rail); located by its own element (5-line context match).
    // 871 -> 847 on the merge of origin/main into feat/crew-page-redesign (that branch
    // read 805: its scroll spy moved out to lib/ui/scrollSpy.ts); located by its own
    // element on the merged tree (6-line context match), not by adding the deltas.
    site: "components/admin/review/ShowReviewSurface.tsx:847",
    disposition: "carrier-survives",
    reason:
      "a label inside the rail item at :805, whose aria-current the selected-state rule paints; its sibling icon at :819 is censused on the same reasoning",
  },
  {
    // 951 -> 972 on feat/warning-card-fixes Task 17 (jumpToHotel added above it); located
    // by its own element on the edited tree (same tag, same class string).
    // 972 -> 993 on feat/warning-card-fixes (a11y fix (a): the jump-focus helpers above the rail); located by its own element (5-line context match).
    // 993 -> 969 on the merge of origin/main into feat/crew-page-redesign (that branch
    // read 927: its scroll spy moved out to lib/ui/scrollSpy.ts); located by its own
    // element on the merged tree (6-line context match), not by adding the deltas.
    site: "components/admin/review/ShowReviewSurface.tsx:969",
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
    // 590 -> 601 on feat/warning-card-fixes Task 18b (the unsaved-reading guard ref and
    // helper above it); located by its own element.
    site: "components/admin/wizard/Step3ReviewModal.tsx:601",
    disposition: "carrier-survives",
    reason: "same",
  },
  // The three UseRawControl rows: 334 -> 329, 360 -> 355, 372 -> 367 (and the dot the first
  // reason cites, 368 -> 363) on feat/warning-card-fixes Task 4; located by their own
  // elements (the ChoiceRow <button>, its radio-dot <span>, its label <span>).
  // 329 -> 332, 355 -> 358, 367 -> 370 (the dot 363 -> 366) on feat/warning-card-fixes
  // Task 14 (the useUseRawDraft import and the per-row marker's doc lines above them);
  // located by the same three elements. The 358 reason is restated: since spec §6.3 an
  // unsaved draft's checked row carries no marker (the persisted row keeps it), so the
  // surviving carrier is the filled inner dot, which renders on the checked row only.
  {
    site: "components/admin/UseRawControl.tsx:332",
    disposition: "carrier-survives",
    reason:
      "role=radio with aria-checked AND a rendered dot (components/admin/UseRawControl.tsx:366)",
  },
  {
    site: "components/admin/UseRawControl.tsx:358",
    disposition: "carrier-survives",
    reason:
      "the checked row renders a filled inner dot (components/admin/UseRawControl.tsx:366), a shape that survives forced colours",
  },
  {
    site: "components/admin/UseRawControl.tsx:370",
    disposition: "carrier-survives",
    reason: "same",
  },
  {
    site: "components/admin/showpage/ShareHub.tsx:828",
    disposition: "carrier-survives",
    reason: "aria-expanded AND when true a popup is on screen",
  },
  {
    // 825 -> 846 on feat/warning-card-fixes Task 17 (jumpToHotel added above it); located
    // by its own element on the edited tree (same tag, same class string).
    // 846 -> 867 on feat/warning-card-fixes (a11y fix (a): the jump-focus helpers above the rail); located by its own element (5-line context match).
    // 867 -> 843 on the merge of origin/main into feat/crew-page-redesign (that branch
    // read 801: its scroll spy moved out to lib/ui/scrollSpy.ts); located by its own
    // element on the merged tree (6-line context match), not by adding the deltas.
    site: "components/admin/review/ShowReviewSurface.tsx:843",
    disposition: "carrier-survives",
    reason: "an icon inside a rail item this pass repairs, so it inherits a repaired state",
  },
  {
    // 945 -> 966 on feat/warning-card-fixes Task 17 (jumpToHotel added above it); located
    // by its own element on the edited tree (same tag, same class string).
    // 966 -> 987 on feat/warning-card-fixes (a11y fix (a): the jump-focus helpers above the rail); located by its own element (5-line context match).
    // 987 -> 963 on the merge of origin/main into feat/crew-page-redesign (that branch
    // read 921: its scroll spy moved out to lib/ui/scrollSpy.ts); located by its own
    // element on the merged tree (6-line context match), not by adding the deltas.
    site: "components/admin/review/ShowReviewSurface.tsx:963",
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
    // 729 -> 740 on feat/warning-card-fixes Task 18b; located by its own element.
    site: "components/admin/wizard/Step3ReviewModal.tsx:740",
    disposition: "carrier-survives",
    reason:
      "same shape as PublishedReviewModal:1376: the mark's shape carries the state and the chevron's rotation is driven by a different variable",
  },
  {
    // :116 until the merge of origin/main (crew show search), which gave the nav a
    // `hidden` prop (search hides it while results show) above this class list.
    // 119 -> 124 on the crew day row's arc (plan Task 8): the accent bar's
    // transition switch became its own effect above. Same <Icon>, confirmed at
    // the new key. 124 -> 128 on the layout dimensions arc (plan Task 13): the
    // header comment gained the nav's dimension rule. Same <Icon>. 128 -> 137 on
    // the invariant-8 fixes (critique F15): the bar's fixed base height and its
    // scaleY style sit above. Same <Icon>. 137 -> 138 (audit P1-3): the header
    // comment's dimension rule names the header's bottom edge. Same <Icon>.
    // 138 -> 141 (whole-diff review round 2, round 3, 3A-2): the indicator
    // effect's `hidden` dependency and its note sit above. Same <Icon>.
    site: "components/crew/CrewWideNav.tsx:141",
    disposition: "carrier-survives",
    reason:
      "an icon inside the crew wide nav item; the item itself carries the state, as aria-current (the forced-colors Highlight fill) and as weight (font-semibold on the active path only)",
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
  // components/admin/PerShowActionableWarnings.tsx:458 (deliberate-flatten) DELETED on
  // feat/warning-card-fixes Task 9: that "Open in Sheet" text link left the card when
  // the sheet link became the compact shell's icon (warning-card-fixes spec §3.6, R11).
  {
    site: "components/admin/showpage/PublishedReviewModal.tsx:1327",
    disposition: "deliberate-flatten",
    reason:
      "text-warning-text/80 against a sibling tone; emphasis, which spec 8 limit 2 flattens deliberately",
  },
  {
    // 662 -> 673 on feat/warning-card-fixes Task 18b; located by its own element.
    site: "components/admin/wizard/Step3ReviewModal.tsx:673",
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
    // 209 -> 213 on feat/warning-card-fixes Task 18b (the unsaved-reading guard hook
    // and its import); located by its own trigger element.
    site: "components/admin/RescanSheetButton.tsx:213",
    disposition: "not-a-state",
    reason:
      "the two paths are one button on two surrounding plates (components/admin/RescanSheetButton.tsx:226), not two user-visible states",
  },
  {
    // Added on feat/warning-card-fixes Task 13 (spec §7.3): the shared archived-tab include
    // button. Its `plate` prop picks the outline per placement, so the pair differs only
    // in border colour; located by its own element, ArchivedTabIncludeButton's <button>.
    site: "components/admin/wizard/archivedTabOffer.tsx:158",
    disposition: "not-a-state",
    reason:
      "the two paths are one button on two surrounding plates (the tinted Pack list and Resolve box offer, the neutral warning card), chosen per placement by the `plate` prop and fixed for that mount, not two user-visible states",
  },
  {
    site: "components/admin/NeedsAttentionSummaryCard.tsx:36",
    disposition: "not-a-state",
    reason:
      "its colliding pair is identical: two render paths resolving to the same class string, so nothing differs",
  },
];
