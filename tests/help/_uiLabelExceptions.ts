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

  // ─── M11-E-D3: Active Shows panel section name (master spec §9.1; M9 deferred) ───
  {
    label: "Active Shows",
    file: "app/help/admin/review-queues/page.mdx",
    deferredId: "M11-E-D3",
    rationale:
      "Master spec §9.1 dashboard section name. Shipped dashboard at app/admin/page.tsx does not yet render the literal 'Active Shows' panel heading; M9 ships ActiveShowsPanel. Re-open when M9 lands.",
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
