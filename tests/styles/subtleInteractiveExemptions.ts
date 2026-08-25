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
    line: 272,
    tag: "summary",
    token: "text-text-subtle",
    family: "summary-disclosure",
    reason:
      "Disclosure header over the extra parse-warning detail; the warning card itself carries the emphasis (DESIGN §1.1a Family S)",
  },
  {
    file: "components/admin/wizard/step3ReviewSections.tsx",
    line: 1623,
    tag: "summary",
    token: "text-text-subtle",
    family: "summary-disclosure",
    reason:
      "Step-3 review section disclosure header; subtle keeps the section body the loudest thing in the card (DESIGN §1.1a Family S)",
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
    line: 82,
    tag: "summary",
    token: "text-text-subtle",
    family: "summary-disclosure",
    reason:
      "Run-of-show synthetic-row disclosure header; both caption-like as a fold label and deliberately dim as a synthetic row (DESIGN §1.1a Family S). CAVEAT, recorded rather than papered over: this is the ONE Family S site that suppresses the native marker (`list-none [&::-webkit-details-marker]:hidden`) without rendering a replacement chevron, so the only visible fold cue is the title's trailing ellipsis. Family S names the marker as the affordance, so restoring a cue here — or moving the site out of the family — is a crew-surface design decision, filed as BL-RUNOFSHOW-SUMMARY-NO-MARKER (whole-diff R2 F3)",
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
