/**
 * tests/help/_uiLabelThirdPartyCarve.ts
 *
 * Labels in /help copy that name ANOTHER PRODUCT's controls, not this app's
 * (BL-CROSSWALK-HAYSTACK-RENDERED-TEXT-ONLY). These are correct documentation
 * — "click **Share** on that folder… Give it **Viewer** access" instructs the
 * admin inside GOOGLE DRIVE's UI — so they were never this app's labels to
 * attest, and `_uiLabelExceptions.ts` cannot hold them (its rows must cite a
 * DEFERRED.md M11-E-D<N> id, and these are not deferrals).
 *
 * DOCUMENTED LIMIT (M-wave 2 spec §4 limit 3): a label wrongly placed here is
 * invisible to the crosswalk — the carve itself is the new residual. The
 * reason field and review are the mitigation: every row must say WHOSE
 * control it is and where the surrounding copy points the reader, and a row
 * whose label leaves its MDX file fails the stale check.
 */

export type ThirdPartyLabelRow = {
  /** Repo-relative MDX path, matching the crosswalk's candidate `file`. */
  readonly file: string;
  /** The bolded/backticked label exactly as it appears in the MDX. */
  readonly label: string;
  /** Whose UI owns the control. */
  readonly product: string;
  /** Why this is third-party copy, never a candidate. Never blank. */
  readonly reason: string;
};

export const THIRD_PARTY_UI_LABELS: readonly ThirdPartyLabelRow[] = [
  {
    file: "app/help/getting-started/page.mdx",
    label: "Share",
    product: "Google Drive",
    reason:
      "Step 1 instructs the admin inside Drive: 'click Share on that folder'. The control belongs to Drive's folder UI; U8's probe (2026-08-05) confirmed the copy is accurate and rewriting it to name an in-app control would make correct documentation wrong.",
  },
  {
    file: "app/help/getting-started/page.mdx",
    label: "Viewer",
    product: "Google Drive",
    reason:
      "Same Step-1 Drive instruction: 'Give it Viewer access' names Drive's sharing-role dropdown value, not any control this app renders.",
  },
];
