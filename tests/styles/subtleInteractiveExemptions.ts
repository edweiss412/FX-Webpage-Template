/**
 * tests/styles/subtleInteractiveExemptions.ts
 *
 * Reasons-required carve-out registry for DESIGN.md §1.1a. The rule is
 * "`--color-text-subtle` is never the resting color of an action target",
 * and these are the three ratified families where it is — by decision, not by
 * omission (spec §4.1, user-ratified 2026-08-14).
 *
 * A row is keyed `file:line:token`, one site per row (the shipped precedent in
 * `zIndexExemptions.ts`, accepted there for the same reason: a whole-file row
 * would exempt sites nobody looked at). Line-keys rot on unrelated edits; the
 * suite's stale-row check turns that rot into a named failure rather than a
 * silent hole.
 *
 * `state-dim` rows carry a `siblingCue` naming the non-color cue that keeps the
 * pair distinguishable, and the suite READS that file and asserts the token is
 * still there — so a refactor that removes the cue fails the row instead of
 * leaving a stale claim behind.
 */

export type SubtleFamily = "summary-disclosure" | "dismissable-chip" | "state-dim";

export type SubtleExemption = {
  /** Repo-relative path, as the scanner reports it. */
  readonly file: string;
  /** 1-based line of the element's opening tag. Part of the key. */
  readonly line: number;
  /** The element's tag, for human triage; the suite checks it against the LIVE hit. */
  readonly tag: string;
  /** The policed token this row exempts. */
  readonly token: string;
  readonly family: SubtleFamily;
  /** Why this site stays subtle. Never blank. */
  readonly reason: string;
  /** Required on `state-dim` rows: the cue that survives the text-color delta. */
  readonly siblingCue?: { readonly file: string; readonly token: string };
};

export const SUBTLE_INTERACTIVE_EXEMPTIONS: readonly SubtleExemption[] = [
  // ---- Family S: <summary> disclosure headers (7) -------------------------
  // Half caption, half control: the text names the CONTENT it folds, and the
  // fold affordance is carried by the marker/chevron and the interaction, not
  // by label weight.
  {
    file: "app/me/meShowSections.tsx",
    line: 122,
    tag: "summary",
    token: "text-text-subtle",
    family: "summary-disclosure",
    reason:
      "Disclosure header for a past-shows group; the text names the folded content and the chevron carries the affordance (DESIGN §1.1a Family S)",
  },
  {
    file: "components/admin/settings/AdministratorsSection.tsx",
    line: 151,
    tag: "summary",
    token: "text-text-subtle",
    family: "summary-disclosure",
    reason:
      "Disclosure header for the administrators list detail; caption-weight by design (DESIGN §1.1a Family S)",
  },
  {
    file: "components/admin/showpage/sectionWarningExtras.tsx",
    // :272 → 277 on this arc (its two anchorIds props, spec §4.4) → 282 on the
    // merge, because main's own edit lands above it too and the two stack. Both
    // sides happened to reach 277 independently, which is exactly why the
    // merged value had to be re-MEASURED rather than inherited from either.
    // Then 282 -> 285 when the wizard-ignore arc gave the mount its discriminated
    // `target` prop plus its new-tab-scanner exemption comment. Re-measured on the live
    // tree by identity, not by adding a delta: 285 is that same `<summary>`.
    line: 285,
    tag: "summary",
    token: "text-text-subtle",
    family: "summary-disclosure",
    reason:
      "Disclosure header over the extra parse-warning detail; the warning card itself carries the emphasis (DESIGN §1.1a Family S)",
  },
  {
    file: "components/admin/wizard/step3ReviewSections.tsx",
    // 1626 -> 1627: the geometry extraction added one import line near the top of
    // the file. Verified by identity, not by offset — the `<summary>` whose
    // className carries `text-text-subtle`, exactly the row below.
    // Then 1627 -> 1628 on the merge of origin/main (6441d5e4c). Main moved this row
    // too, so neither parent's number describes the merged tree. Located by running
    // the scanner on the merged tree, not by adding the two deltas: the live hit is
    // 1628, and line 1628 is that same `<summary>`.
    // Then 1628 -> 1633 when the announce-log import block landed. Located again on the
    // live tree: 1633 is that same `<summary>`.
    // Then 1633 -> 1638 when the wizard-ignore arc added its imports and the panel's
    // partition block. Located on the live tree again: 1638 is that same `<summary>`.
    line: 1639,
    tag: "summary",
    token: "text-text-subtle",
    family: "summary-disclosure",
    reason:
      "Step-3 review section disclosure header; subtle keeps the section body the loudest thing in the card (DESIGN §1.1a Family S)",
  },
  {
    file: "components/admin/wizard/step3ReviewSections.tsx",
    line: 3316,
    tag: "summary",
    token: "text-text-subtle",
    family: "summary-disclosure",
    reason:
      "Wizard Ignored (N) disclosure header; a caption-weight fold label over warnings the operator has already dismissed, so the active list above it stays the loudest thing in the panel. Copies the published sectionWarningExtras disclosure verbatim, including this token (DESIGN §1.1a Family S)",
  },
  {
    file: "components/crew/AgendaScheduleBlock.tsx",
    line: 107,
    tag: "summary",
    token: "text-text-subtle",
    family: "summary-disclosure",
    reason:
      "Crew agenda block disclosure header; the block's times and rooms are the crew-facing signal, not the fold label (DESIGN §1.1a Family S)",
  },
  {
    file: "components/crew/primitives/KeyTimesStrip.tsx",
    line: 191,
    tag: "summary",
    token: "text-text-subtle",
    family: "summary-disclosure",
    reason:
      "Key-times strip disclosure header; the strip's times are the answer, the fold label is a caption (DESIGN §1.1a Family S)",
  },
  {
    file: "components/crew/primitives/RunOfShowList.tsx",
    line: 93,
    tag: "summary",
    token: "text-text-subtle",
    family: "summary-disclosure",
    reason:
      "Run-of-show synthetic-row disclosure header; both caption-like as a fold label and deliberately dim as a synthetic row (DESIGN §1.1a Family S). The caveat this row used to carry is RESOLVED: it was the one Family S site that suppressed the native marker without rendering a replacement, so the only visible fold cue was the title's trailing ellipsis — a truncation mark, not a control. BL-RUNOFSHOW-SUMMARY-NO-MARKER closed on 2026-08-25 (design doc 2026-08-25-ui-polish-class-sweep-design.md, D10): the site KEEPS Family S and its dim tone and now renders a chevron, so the family's own claim — that the marker and the interaction carry the fold, not label weight — is true of this site again. Pinned by tests/styles/summaryFoldCue.test.ts",
  },

  // ---- Family C: dismissable filter chips (1) -----------------------------
  // The chip's text names an APPLIED FILTER (a caption); the dismiss glyph is
  // the control.
  {
    file: "components/admin/telemetry/ActiveFilterChips.tsx",
    line: 90,
    tag: "button",
    token: "text-text-subtle",
    family: "dismissable-chip",
    reason:
      "Active-filter chip: the label states the applied filter and the dismiss glyph is the control (DESIGN §1.1a Family C)",
  },
  // `ActiveFilterChips.tsx:101` was a SECOND Family C row until the whole-diff
  // review read the markup (R1 F2). It is the "Clear filters" action — a plain
  // underlined button with no filter caption and no dismiss glyph — so it is
  // not a chip and never met Family C's definition (spec §4.2). It was swapped
  // to `text-text` with `hover:text-text-strong` instead, which is what the
  // ratified policy says about a control that belongs to no carve-out family.
  // The family set is untouched; a membership claim that was false is not.

  // ---- Family D: state-pair dim members (6) -------------------------------
  // The dim member of a state pair may rest subtle only while the pair stays
  // distinguishable by at least one cue besides the text-color delta. The cue
  // may sit on EITHER member, and the suite validates it against source.
  {
    file: "app/show/[slug]/[shareToken]/_PickerInterstitial.tsx",
    line: 240,
    tag: "button",
    token: "text-text-subtle",
    family: "state-dim",
    reason:
      "Claimed-vs-unclaimed picker rows. This is the DECLARATION site (the `rowClasses` ternary); the subtle branch is dead here because claimed rows return earlier, and it is RENDERED by _ClaimedRowButton via the `rowClassName` prop. The dim member itself carries the cues: a `bg-surface-sunken` fill plus the lock glyph (DESIGN §1.1a Family D; spec §4.3 round-2 F1)",
    siblingCue: {
      file: "app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx",
      token: "picker-row-lock",
    },
  },
  {
    file: "components/admin/DashboardBucketSegmentedControl.tsx",
    line: 56,
    tag: "Link",
    token: "text-text-subtle",
    family: "state-dim",
    reason:
      'Unselected dashboard bucket segment; the selected segment carries a `bg-surface` fill, `shadow-tile`, `text-text-strong` and `aria-current="page"` (DESIGN §1.1a Family D)',
    siblingCue: {
      file: "components/admin/DashboardBucketSegmentedControl.tsx",
      token: "shadow-tile",
    },
  },
  {
    file: "components/admin/DashboardBucketSegmentedControl.tsx",
    line: 76,
    tag: "Link",
    token: "text-text-subtle",
    family: "state-dim",
    reason:
      "Unselected dashboard bucket segment (archived); same pair and same cues as the active segment row (DESIGN §1.1a Family D)",
    siblingCue: {
      file: "components/admin/DashboardBucketSegmentedControl.tsx",
      token: "shadow-tile",
    },
  },
  {
    file: "components/admin/nav/AdminNav.tsx",
    line: 168,
    tag: "Link",
    token: "text-text-subtle",
    family: "state-dim",
    reason:
      'Inactive desktop admin nav link; the active link carries a `bg-surface-raised` fill, `text-text-strong` and `aria-current="page"` (DESIGN §1.1a Family D)',
    siblingCue: { file: "components/admin/nav/AdminNav.tsx", token: "bg-surface-raised" },
  },
  {
    file: "components/admin/nav/AdminNav.tsx",
    line: 232,
    tag: "Link",
    token: "text-text-subtle",
    family: "state-dim",
    reason:
      'Inactive admin bottom tab; the active tab carries `aria-current="page"` and the visual delta is `text-accent-on-bg` vs subtle — a hue-plus-lightness delta with no layout cue, recorded as-is (DESIGN §1.1a Family D)',
    // Pinned on `aria-current`, which is what the reason actually rests on. The
    // first version pinned `text-accent-on-bg` — the COLOUR DELTA ITSELF — so
    // the row asserted the very thing Family D requires an additional cue FOR
    // (whole-diff R1 F7). The attribute is written as an expression, so the pin
    // is that expression: `aria-current="page"` is a string this file never
    // contains, and pinning it would fail for the wrong reason.
    siblingCue: {
      file: "components/admin/nav/AdminNav.tsx",
      token: 'aria-current={active ? "page" : undefined}',
    },
  },
  {
    file: "components/crew/CrewSubNav.tsx",
    line: 114,
    tag: "button",
    token: "text-text-subtle",
    family: "state-dim",
    reason:
      'Inactive crew sub-nav tab; the active desktop branch carries `border-accent` + `text-text-strong`, the active mobile branch `text-accent-on-bg` plus `aria-current="page"` (DESIGN §1.1a Family D)',
    // `border-accent` is the DESKTOP branch's cue only; the mobile branch this
    // row also covers rests on `aria-current` alone, so the desktop pin left
    // half the row unasserted (whole-diff R1 F7). Pinned on the cue both
    // branches share.
    siblingCue: {
      file: "components/crew/CrewSubNav.tsx",
      token: 'aria-current={isActive ? "page" : undefined}',
    },
  },
];
