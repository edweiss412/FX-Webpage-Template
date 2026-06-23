// Strict structural exception registry for the UI-label crosswalk meta-test
// (tests/help/_metaUiLabelCrosswalk.test.ts).
//
// Every entry exempts a UI-label reference in app/help/**/*.mdx that does NOT
// match shipped production code. Every entry MUST cite a concrete deferred
// disposition (DEFERRED.md M11-E-D<N>) and a rationale. When the M9 follow-up
// ships the missing labels, the corresponding entries here should be removed
// at the same time.
//
// Phase E intent (per AGENTS.md §1.7): docs are spec-canonical; M9 implementation
// gaps are M9's bug. This registry records the intentional spec-vs-shipped state.
//
// NOTE: This registry intentionally tracks ONLY the labels the meta-test
// heuristic flags (bolded `**Label**` or backticked spans inside MDX prose
// that survive the narrative-emphasis filters). Other spec-vs-shipped drift
// in the same cluster — e.g., D1 "Revoke all links" appearing only inside
// a >4-word sentence-style bold, or D3 row-action labels appearing
// unbolded in prose — is documented in DEFERRED.md M11-E-D<N> directly but
// not echoed here. Adding such an entry would fail the stale-exception
// guard (test #3) because the label string never matches a heuristic hit.

export type UiLabelException = {
  /** The exact label string as written in the MDX. */
  label: string;
  /** The MDX file path (relative to repo root) the label appears in. */
  file: string;
  /** DEFERRED.md disposition ID this exception is justified by. */
  deferredId: string;
  /** Human-readable rationale + re-open trigger. */
  rationale: string;
};

/**
 * Per-page declaration of UI-label claims in Phase E MDX. The heuristic layer
 * in _metaUiLabelCrosswalk.test.ts only catches bolded `**Label**` and
 * backticked `` `Label` `` candidates; this registry adds explicit per-page
 * declarations so labels mentioned in plain prose, `##` headings, or quoted
 * strings can also be cross-walked against production code.
 *
 * Discipline:
 *   - Only declare strings that name a UI CONTROL or visible UI affordance
 *     (button, badge, section heading, tab, link affordance, status indicator).
 *   - Do NOT declare narrative phrases, page-IA section titles, or feature
 *     descriptions. When in doubt, LEAVE IT OUT — the heuristic + registry
 *     pair only needs to cover the high-value subset.
 *   - For each entry, the test asserts: label appears in production source
 *     (`app/` excluding `app/help/`, `components/`) OR an entry exists in
 *     UI_LABEL_EXCEPTIONS for the same {file, label} citing a DEFERRED.md
 *     M11-E-D<N> ID.
 *   - String matching normalizes HTML entities (`&rsquo;`, `&quot;`) and
 *     curly Unicode quotes to straight ASCII, so MDX prose with straight
 *     apostrophes matches JSX with `&rsquo;`.
 */
export type DeclaredUiLabel = {
  /** The exact label string as it appears (or should appear) in the UI. */
  label: string;
  /** The MDX file path (relative to repo root) that documents this label. */
  file: string;
  /** Optional rationale / grep hint for verification. */
  note?: string;
};

export const DECLARED_UI_LABELS: readonly DeclaredUiLabel[] = [
  // ─── app/help/page.mdx — landing page ───
  // No UI-control labels declared (informational page with cross-links only).

  // ─── app/help/getting-started/page.mdx ───
  // Quick-start narrative. Two UI-control labels referenced from the wizard.
  {
    label: "I've shared the folder",
    file: "app/help/getting-started/page.mdx",
    note: "Wizard step-1 advance affordance — components/admin/wizard/Step1Share.tsx (uses curly apostrophe via &rsquo;; normalized at compare time).",
  },
  {
    label: "Review and apply",
    file: "app/help/getting-started/page.mdx",
    note: "Onboarding wizard step-3 first-seen action — components/admin/wizard/Step3Review.tsx:262 rendered link text. (Previously also the dead PendingPanel's row action; that component was deleted in M12.12 Task 10 — the live inbox row action is 'Review →'.)",
  },

  // ─── app/help/daily-rhythm/page.mdx ───
  // Section name + badge label referenced in prose.
  {
    label: "Active shows",
    file: "app/help/daily-rhythm/page.mdx",
    note: "Dashboard shows-table section title — components/admin/ShowsTable.tsx:162 default + Dashboard.tsx:478 (shipped with lowercase 's'). I.2 R13 finding 2 + user direction realigned MDX casing to match shipped.",
  },
  {
    label: "Changes to review",
    file: "app/help/daily-rhythm/page.mdx",
    note: "Status pill label — components/admin/NeedsAttentionInbox.tsx:106 (also lib/admin/syncStatus.ts:29 via ShowsTable's sync column). Replaces the dead ActiveShowsPanel's 'Review staged changes' badge (M12.12 Task 10).",
  },

  // ─── app/help/whats-different/page.mdx ───
  // No new UI-control labels beyond what other pages declare; prose references
  // only "Apply", "Discard", "Review staged changes" which are covered.
  {
    label: "Changes to review",
    file: "app/help/whats-different/page.mdx",
    note: "Status pill label — components/admin/NeedsAttentionInbox.tsx:106 (also lib/admin/syncStatus.ts:29 via ShowsTable's sync column).",
  },

  // ─── app/help/admin/dashboard/page.mdx ───
  // The Active shows table + Needs-attention queues. Per Phase I R13: the
  // previous "Actions column" claim (Open / Preview as / Re-sync / Archive
  // in-row buttons) was a phantom — the dashboard show rows have never had
  // in-row actions (true of the legacy ActiveShowsPanel and of the live
  // ShowsTable that replaced it). MDX rewritten to describe shipped
  // behaviour: title link, dates, crew count, last-sync + status indicator;
  // row-level actions live on the per-show panel one click deeper. Exempted
  // labels for those phantoms removed from both registries.
  {
    label: "Active shows",
    file: "app/help/admin/dashboard/page.mdx",
    note: "Shows-table section title — components/admin/ShowsTable.tsx:162 default + Dashboard.tsx:478.",
  },
  {
    label: "Changes to review",
    file: "app/help/admin/dashboard/page.mdx",
    note: "Status pill label — components/admin/NeedsAttentionInbox.tsx:106 (also lib/admin/syncStatus.ts:29 via ShowsTable's sync column).",
  },
  // NOTE (audit Chunk 2): the dashboard sync-status table's warn/idle values —
  // "Couldn't reach Drive" / "Sheet not in folder" / "Couldn't read the sheet" /
  // "Sync in progress" — are defined ONLY in lib/admin/syncStatus.ts (ShowsTable
  // renders them via a variable, so the literal strings appear in no app/ or
  // components/ file the crosswalk scans). They are intentionally QUOTED in the
  // MDX so the candidate extractor treats them as prose, not bare UI labels —
  // declaring them here would FAIL the declared-registry layer, which still
  // requires app/+components presence. Do not un-quote them without first
  // extending the crosswalk to scan lib/.
  {
    label: "Retry now",
    file: "app/help/admin/dashboard/page.mdx",
    note: "Pending-panel action button — components/admin/PendingPanelRetryButton.tsx:72.",
  },
  {
    label: "Defer until modified",
    file: "app/help/admin/dashboard/page.mdx",
    note: "Pending-panel discard action — components/admin/PendingPanelDiscardButtons.tsx:85.",
  },
  {
    label: "Permanently ignore",
    file: "app/help/admin/dashboard/page.mdx",
    note: "Pending-panel discard action — components/admin/PendingPanelDiscardButtons.tsx:96.",
  },
  // (M12.12 Task 8: the dashboard MDX was rewritten to the live inbox model —
  // its first-seen action is now "Review", so the old "Review and apply"
  // declaration for this file was removed as stale.)

  // ─── app/help/admin/onboarding-wizard/page.mdx ───
  // Three-step wizard. Prose-only references to wizard controls.
  {
    label: "I've shared the folder",
    file: "app/help/admin/onboarding-wizard/page.mdx",
    note: "Wizard step-1 advance affordance — components/admin/wizard/Step1Share.tsx (curly apostrophe normalized).",
  },
  {
    label: "What's this email?",
    file: "app/help/admin/onboarding-wizard/page.mdx",
    note: "Wizard step-1 disclosure — components/admin/wizard/Step1Share.tsx:8.",
  },
  {
    label: "Start over",
    file: "app/help/admin/onboarding-wizard/page.mdx",
    note: "Wizard pre-onboarding form — components/admin/OnboardingWizard.tsx:8.",
  },
  {
    label: "Re-run setup",
    file: "app/help/admin/onboarding-wizard/page.mdx",
    note: "Settings page action — app/admin/settings/page.tsx:5 (case-insensitive 'Re-run setup' button at line 69; 'Re-run Setup' string in file comment).",
  },

  // ─── app/help/admin/parse-warnings/page.mdx ───
  // Catalog-style reference; no top-level UI controls declared.

  // ─── app/help/admin/per-show-panel/page.mdx ───
  // Per Phase I R13 + user direction: the previous "Action required" card
  // title was a phantom (shipped StagedReviewCard has no such literal
  // heading; eyebrow is the source-kind label). "Re-sync now" was the
  // wrong literal — shipped ReSyncButton.tsx:99 renders "Re-sync from Drive".
  // MDX rewritten to describe shipped behaviour; exemption entries for the
  // phantoms removed.
  {
    label: "Re-sync from Drive",
    file: "app/help/admin/per-show-panel/page.mdx",
    note: "Per-show manual-sync button — components/admin/ReSyncButton.tsx:99.",
  },
  {
    label: "Auto sync",
    file: "app/help/admin/per-show-panel/page.mdx",
    note: "Staged-review card source-kind eyebrow — components/admin/StagedReviewCard.tsx:86.",
  },
  {
    label: "Drive push",
    file: "app/help/admin/per-show-panel/page.mdx",
    note: "Staged-review card source-kind eyebrow — components/admin/StagedReviewCard.tsx:87.",
  },
  {
    label: "Manual sync",
    file: "app/help/admin/per-show-panel/page.mdx",
    note: "Staged-review card source-kind eyebrow — components/admin/StagedReviewCard.tsx:88.",
  },
  {
    label: "Onboarding scan",
    file: "app/help/admin/per-show-panel/page.mdx",
    note: "Staged-review card source-kind eyebrow — components/admin/StagedReviewCard.tsx:89.",
  },
  {
    label: "Changes to review",
    file: "app/help/admin/per-show-panel/page.mdx",
    note: "Status pill label — components/admin/NeedsAttentionInbox.tsx:106 (also lib/admin/syncStatus.ts:29 via ShowsTable's sync column).",
  },
  {
    label: "Previewing as",
    file: "app/help/admin/per-show-panel/page.mdx",
    note: "Sticky preview banner eyebrow — components/admin/PreviewBanner.tsx:79.",
  },

  // ─── app/help/admin/preview-as-crew/page.mdx ───
  {
    label: "Previewing as",
    file: "app/help/admin/preview-as-crew/page.mdx",
    note: "Sticky preview banner eyebrow — components/admin/PreviewBanner.tsx:79.",
  },
  {
    label: "Exit preview",
    file: "app/help/admin/preview-as-crew/page.mdx",
    note: "Preview banner action button — components/admin/PreviewBanner.tsx:122.",
  },

  // ─── app/help/admin/review-queues/page.mdx ───
  {
    label: "Review and apply",
    file: "app/help/admin/review-queues/page.mdx",
    note: "Onboarding wizard step-3 first-seen action — components/admin/wizard/Step3Review.tsx:262 rendered link text. (Previously also the dead PendingPanel's row action; that component was deleted in M12.12 Task 10 — the live inbox row action is 'Review →'.)",
  },
  {
    label: "Discard",
    file: "app/help/admin/review-queues/page.mdx",
    note: "Pending-row action — components/admin/StagedReviewCard.tsx.",
  },
  {
    // M12.2 Phase A: the review-queues help page was reworked to describe the
    // redesigned "Needs attention" inbox (Dashboard.tsx h3 + NeedsAttentionInbox
    // variants), which folded in both review queues. The prior prose named the
    // retired "Sheets we couldn't auto-apply" panel and a "Review staged changes"
    // row badge; neither appears in the page anymore, so those two declarations
    // were removed to keep the stale-entry guard green. "Needs attention",
    // "Changes to review", and "Open show" are now bolded in the MDX and clear
    // the heuristic crosswalk directly (shipped in NeedsAttentionInbox.tsx /
    // Dashboard.tsx), so they need no declared-registry entry here.
    label: "Active shows",
    file: "app/help/admin/review-queues/page.mdx",
    note: "Dashboard split-column heading — components/admin/Dashboard.tsx:449.",
  },
  {
    label: "Apply",
    file: "app/help/admin/review-queues/page.mdx",
    note: "Staged-review primary action — components/admin/StagedReviewCard.tsx:182.",
  },

  // ─── app/help/admin/sharing-links/page.mdx ───
  // Legacy per-row signed-link controls were removed by the picker-auth cutover.
  // The page may still describe the operational concept, but it no longer
  // declares shipped control labels here.

  // ─── app/help/tour/page.mdx ───
  // Orientation page; section headings are page-IA, not UI controls.

  // ─── app/help/errors/page.tsx ───
  // Catalog-iterating reference; titles are MESSAGE_CATALOG entries rendered
  // dynamically from production source, so all already match by construction.
];

// Per Phase I R13 + user direction (2026-05-23): every prior exemption
// covered a Doug-facing MDX label that was either (a) wrong casing for a
// shipped label, or (b) a phantom for an unshipped UI affordance. The
// remedy was to rewrite the MDX to describe shipped behaviour and scrub
// internal milestone IDs from copy. With that work done, there are no
// remaining MDX labels that need spec-vs-shipped exemption — every label
// in DECLARED_UI_LABELS now cites a shipped surface.
//
// If a future plan ratifies docs ahead of UI implementation, add the
// exemption back here with a fresh DEFERRED.md ID. Otherwise prefer
// the discipline: only document what's shipped; describe gaps with
// Doug-facing phrasing (e.g. "not yet built") so the structural defense
// in tests/help/backlog-label-annotation.test.ts has nothing to gate.
export const UI_LABEL_EXCEPTIONS: readonly UiLabelException[] = [];
