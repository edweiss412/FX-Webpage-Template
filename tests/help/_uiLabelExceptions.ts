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
    note: "Pending-panel action — components/admin/PendingPanel.tsx:125 rendered button text.",
  },

  // ─── app/help/daily-rhythm/page.mdx ───
  // Section name + badge label referenced in prose.
  {
    label: "Active Shows",
    file: "app/help/daily-rhythm/page.mdx",
    note: "Dashboard panel section name — M11-E-D3 (M9 deferred, ActiveShowsPanel not yet rendering the literal heading).",
  },
  {
    label: "Review staged changes",
    file: "app/help/daily-rhythm/page.mdx",
    note: "Badge label — components/admin/ActiveShowsPanel.tsx:69.",
  },

  // ─── app/help/whats-different/page.mdx ───
  // No new UI-control labels beyond what other pages declare; prose references
  // only "Apply", "Discard", "Review staged changes" which are covered.
  {
    label: "Review staged changes",
    file: "app/help/whats-different/page.mdx",
    note: "Badge label — components/admin/ActiveShowsPanel.tsx:69.",
  },

  // ─── app/help/admin/dashboard/page.mdx ───
  // The Active Shows + Sheets-we-couldn't-auto-apply panels. Row-action labels
  // Open / Preview as / Re-sync / Archive are M11-E-D3 (M9 deferred).
  {
    label: "Active Shows",
    file: "app/help/admin/dashboard/page.mdx",
    note: "Panel section name — M11-E-D3 (M9 deferred).",
  },
  {
    label: "Review staged changes",
    file: "app/help/admin/dashboard/page.mdx",
    note: "Badge + primary-action label — components/admin/ActiveShowsPanel.tsx:69.",
  },
  // Note: dashboard/page.mdx <h2> uses the hyphenated page-IA form
  // "Sheets-we-couldn't-auto-apply" which is a section heading, not the
  // production button/panel label. The production label "Sheets we couldn't
  // auto-apply" (no hyphens) is declared on the review-queues page where it
  // appears in prose; no dashboard entry needed.
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
  {
    label: "Review and apply",
    file: "app/help/admin/dashboard/page.mdx",
    note: "Pending-panel action — components/admin/PendingPanel.tsx:125 rendered button text.",
  },
  {
    label: "Open",
    file: "app/help/admin/dashboard/page.mdx",
    note: "Active Shows row action — M11-E-D3 (M9 deferred).",
  },
  {
    label: "Preview as",
    file: "app/help/admin/dashboard/page.mdx",
    note: "Active Shows row action — app/admin/show/[slug]/page.tsx:239 ('Preview as a crew member' substring matches).",
  },
  {
    label: "Re-sync",
    file: "app/help/admin/dashboard/page.mdx",
    note: "Active Shows row action — components/admin/ReSyncButton.tsx ('Re-sync from Drive' substring matches).",
  },
  {
    label: "Archive",
    file: "app/help/admin/dashboard/page.mdx",
    note: "Active Shows row action — M11-E-D3 (M9 deferred).",
  },

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
  // Action required + Re-sync now are M11-E-D4 (M9 deferred).
  {
    label: "Action required",
    file: "app/help/admin/per-show-panel/page.mdx",
    note: "Staged-review card title — M11-E-D4 (M9 deferred).",
  },
  {
    label: "Re-sync now",
    file: "app/help/admin/per-show-panel/page.mdx",
    note: "Per-show manual-sync button — M11-E-D4 (M9 deferred).",
  },
  {
    label: "Review staged changes",
    file: "app/help/admin/per-show-panel/page.mdx",
    note: "Badge — components/admin/ActiveShowsPanel.tsx:69.",
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
    note: "Pending-panel action — components/admin/PendingPanel.tsx:125 rendered button text.",
  },
  {
    label: "Discard",
    file: "app/help/admin/review-queues/page.mdx",
    note: "Pending-row action — components/admin/StagedReviewCard.tsx.",
  },
  {
    label: "Review staged changes",
    file: "app/help/admin/review-queues/page.mdx",
    note: "Badge label — components/admin/ActiveShowsPanel.tsx:69.",
  },
  {
    label: "Sheets we couldn't auto-apply",
    file: "app/help/admin/review-queues/page.mdx",
    note: "Panel section name — components/admin/PendingPanel.tsx:75.",
  },
  {
    label: "Active Shows",
    file: "app/help/admin/review-queues/page.mdx",
    note: "Dashboard panel name — M11-E-D3 (M9 deferred).",
  },
  {
    label: "Apply",
    file: "app/help/admin/review-queues/page.mdx",
    note: "Staged-review primary action — components/admin/StagedReviewCard.tsx:182.",
  },

  // ─── app/help/admin/sharing-links/page.mdx ───
  // Heuristic already flags `Issue first link`, `Issue new link`,
  // `Copy share link` (all M11-E-D1). Add the prose-only mentions for
  // explicit declaration too.
  {
    label: "Issue first link",
    file: "app/help/admin/sharing-links/page.mdx",
    note: "Sharing-link control — M11-E-D1 (M9 deferred).",
  },
  {
    label: "Issue new link",
    file: "app/help/admin/sharing-links/page.mdx",
    note: "Sharing-link control — M11-E-D1 (M9 deferred).",
  },
  {
    label: "Copy share link",
    file: "app/help/admin/sharing-links/page.mdx",
    note: "Sharing-link control — M11-E-D1 (M9 deferred).",
  },
  {
    label: "Revoke all links",
    file: "app/help/admin/sharing-links/page.mdx",
    note: "Sharing-link control — M11-E-D1 (M9 deferred).",
  },

  // ─── app/help/tour/page.mdx ───
  // Orientation page; section headings are page-IA, not UI controls.

  // ─── app/help/errors/page.tsx ───
  // Catalog-iterating reference; titles are MESSAGE_CATALOG entries rendered
  // dynamically from production source, so all already match by construction.
];

export const UI_LABEL_EXCEPTIONS: readonly UiLabelException[] = [
  // ─── M11-E-D1: sharing-link controls (master spec §5.2 / §7.2; M9 deferred) ───
  {
    label: "Issue first link",
    file: "app/help/admin/sharing-links/page.mdx",
    deferredId: "M11-E-D1",
    rationale:
      "Master spec §5.2 + §7.2 canonical sharing-link control label. M9 ships the control in the per-show panel crew section; per-show panel currently lacks the control. Re-open when M9 lands.",
  },
  {
    label: "Issue new link",
    file: "app/help/admin/sharing-links/page.mdx",
    deferredId: "M11-E-D1",
    rationale:
      "Master spec §5.2 + §7.2 canonical sharing-link control label. M9 deferred. Re-open when M9 lands.",
  },
  {
    label: "Copy share link",
    file: "app/help/admin/sharing-links/page.mdx",
    deferredId: "M11-E-D1",
    rationale:
      "Master spec §5.2 + §7.2 canonical sharing-link control label. M9 deferred. Re-open when M9 lands.",
  },
  {
    label: "Revoke all links",
    file: "app/help/admin/sharing-links/page.mdx",
    deferredId: "M11-E-D1",
    rationale:
      "Master spec §5.2 + §7.2 canonical sharing-link control label. Referenced in prose-only (not bolded); declared via DECLARED_UI_LABELS registry layer. M9 deferred. Re-open when M9 lands.",
  },

  // ─── M11-E-D3: Active Shows panel section name (master spec §9.1; M9 deferred) ───
  {
    label: "Active Shows",
    file: "app/help/admin/review-queues/page.mdx",
    deferredId: "M11-E-D3",
    rationale:
      "Master spec §9.1 dashboard section name. Shipped dashboard at app/admin/page.tsx does not yet render the literal 'Active Shows' panel heading; M9 ships ActiveShowsPanel. Re-open when M9 lands.",
  },
  {
    label: "Active Shows",
    file: "app/help/daily-rhythm/page.mdx",
    deferredId: "M11-E-D3",
    rationale:
      "Master spec §9.1 dashboard section name (same panel as review-queues exception). Referenced prose-only on daily-rhythm; declared via DECLARED_UI_LABELS registry layer. M9 deferred.",
  },
  {
    label: "Active Shows",
    file: "app/help/admin/dashboard/page.mdx",
    deferredId: "M11-E-D3",
    rationale:
      "Master spec §9.1 dashboard section name. Referenced prose-only on dashboard help page; declared via DECLARED_UI_LABELS registry layer. M9 deferred.",
  },
  {
    label: "Archive",
    file: "app/help/admin/dashboard/page.mdx",
    deferredId: "M11-E-D3",
    rationale:
      "Master spec §9.1 dashboard row-action label. Grep of components/admin/ActiveShowsPanel.tsx returns ZERO matches for 'Archive'; M9 deferred. Re-open when M9 ships row actions.",
  },

  // ─── M11-E-D4: per-show panel sections (master spec §9.2; M9 deferred) ───
  {
    label: "Action required",
    file: "app/help/admin/per-show-panel/page.mdx",
    deferredId: "M11-E-D4",
    rationale:
      "Master spec §9.2 per-show panel staged-review card title. The shipped per-show panel does not yet render this literal card heading; M9 deferred. Re-open when M9 lands.",
  },
  {
    label: "Re-sync now",
    file: "app/help/admin/per-show-panel/page.mdx",
    deferredId: "M11-E-D4",
    rationale:
      "Master spec §9.2 per-show panel manual-sync button. The shipped per-show panel does not yet render this literal button label; M9 deferred. Re-open when M9 lands.",
  },
];
