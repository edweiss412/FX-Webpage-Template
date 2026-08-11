/**
 * tests/help/_uiLabelIndirectCopySources.ts
 *
 * Labels whose shipped copy is DEFINED in a constant, ternary, or derive
 * function and rendered indirectly (BL-CROSSWALK-HAYSTACK-RENDERED-TEXT-ONLY,
 * spec §2.5). The rendered-text haystack deliberately excludes such copy —
 * including bare initializers is exactly the false-assurance path the rebuild
 * removed — so each of these labels FAILS the automatic crosswalk and is
 * dispositioned here, loudly, with the source that defines the string.
 *
 * `source` is the repo-relative file whose SOURCE TEXT contains the label
 * literal (held executable: the validation test reads the file and asserts
 * the literal is present, so a reworded constant fails here instead of
 * silently un-anchoring the row). `reason` explains the render path.
 */

export type IndirectCopyRow = {
  /** Repo-relative MDX path, matching the crosswalk's candidate `file`. */
  readonly file: string;
  /** The bolded/backticked label exactly as it appears in the MDX. */
  readonly label: string;
  /** Repo-relative source file whose text contains the label literal. */
  readonly source: string;
  /** How the string reaches the DOM. Never blank. */
  readonly reason: string;
};

export const INDIRECT_COPY_SOURCES: readonly IndirectCopyRow[] = [
  {
    file: "app/help/admin/dashboard/page.mdx",
    label: "Held, not published",
    source: "components/admin/ShowsTable.tsx",
    reason:
      "Ternary in the state-pill label derivation (place=inline verbose form of the Held pill); rendered as {label} in ShowsTable's inline pill.",
  },
  {
    file: "app/help/admin/dashboard/page.mdx",
    label: "Synced",
    source: "components/admin/showpage/StatusStrip.tsx",
    reason:
      "Template `Synced ${relative}` assigned to the ok-bucket sync label variable and rendered in the status strip's sync-age badge.",
  },
  {
    file: "app/help/admin/dashboard/page.mdx",
    label: "Not synced yet",
    source: "lib/admin/syncStatus.ts",
    reason:
      "The idle-bucket label constant in deriveSyncStatus; rendered wherever the sync badge shows the idle bucket (dashboard rows, status strip).",
  },
  {
    file: "app/help/admin/settings/page.mdx",
    label: "Not synced yet",
    source: "components/admin/settings/DriveConnectionPanel.tsx",
    reason:
      "The null-guarded lastReadClause in deriveStatusLine appends ' · Not synced yet' to the connection status line.",
  },
  {
    file: "app/help/admin/dashboard/page.mdx",
    label: "Reject",
    source: "components/admin/Mi11GateActions.tsx",
    reason:
      'Ternary `isApprove ? "Approve" : "Reject"` assigned to idleLabel and rendered as the gate action button\'s text.',
  },
  {
    file: "app/help/admin/per-show-panel/page.mdx",
    label: "Reject",
    source: "components/admin/Mi11GateActions.tsx",
    reason:
      "Same idleLabel ternary as the dashboard row — one shared component renders the gate actions on the per-show panel.",
  },
  {
    file: "app/help/admin/review-queues/page.mdx",
    label: "Reject",
    source: "components/admin/Mi11GateActions.tsx",
    reason: "Same idleLabel ternary; the review queue rows mount the same gate-action component.",
  },
  {
    file: "app/help/admin/settings/page.mdx",
    label: "Connected",
    source: "components/admin/settings/DriveConnectionPanel.tsx",
    reason:
      "deriveStatusLine's positive branch returns `Connected · ${syncingLabel}…`; the panel renders the returned string as the status line.",
  },
  {
    file: "app/help/admin/settings/page.mdx",
    label: "Connection not set up",
    source: "components/admin/settings/DriveConnectionPanel.tsx",
    reason:
      "deriveStatusLine's not_configured branch (folderId === null) returns this string verbatim as the status line.",
  },
  {
    file: "app/help/admin/settings/page.mdx",
    label: "Connection needs attention",
    source: "components/admin/settings/DriveConnectionPanel.tsx",
    reason:
      "deriveStatusLine's warn branches return `Connection needs attention${lastReadClause}` as the status line.",
  },
];
