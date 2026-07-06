import type { ArchivedPullSheetTab, ParseResult, ParseWarning } from "@/lib/parser/types";

/**
 * Pull-sheet override — the durable/pending decision that an admin opted-in a
 * pull sheet living on an archived ("OLD …") tab (§5.4, D4). The full object
 * (with audit fields) is stored on `pending_syncs.pull_sheet_override` (onboarding)
 * and `shows.pull_sheet_override` (durable/cron).
 */
export type PullSheetOverride = {
  tabName: string;
  fingerprint: string;
  acceptedBy: string;
  acceptedAt: string;
};

/**
 * The operational projection of an override — the ONLY part that affects what the
 * parse emits (§5.8, Codex R3-1). Drops the audit fields (`acceptedBy`/`acceptedAt`).
 * Stored verbatim on `*.pull_sheet_override_applied` so the finalize gate can
 * deep-equal it against `overrideSnapshot(desired override)`.
 */
export type OverrideSnapshot = { tabName: string; fingerprint: string } | null;

/** Drop the audit fields; `null` passes through as `null` (§5.8). */
export function overrideSnapshot(o: PullSheetOverride | null | undefined): OverrideSnapshot {
  return o ? { tabName: o.tabName, fingerprint: o.fingerprint } : null;
}

/**
 * Deep-equality for two override snapshots (§5.8 deferred-apply gate). Both-null is equal;
 * one-null-one-set is not; two set snapshots match iff `tabName` AND `fingerprint` agree.
 * The single comparator every deferred-apply gate (Flow A/B finalize, Flow C live cron) uses
 * so no path re-derives the null-safety.
 */
export function overrideSnapshotsEqual(a: OverrideSnapshot, b: OverrideSnapshot): boolean {
  if (a === null || b === null) return a === b;
  return a.tabName === b.tabName && a.fingerprint === b.fingerprint;
}

/**
 * One `PULL_SHEET_ON_ARCHIVED_TAB` warning per NOT-included archived-tab pull
 * sheet (§5.2). The `included:true` (accepted) tab is reconciled separately by
 * {@link reconcileIncludedTab}, never warned here. `rawSnippet` joins the case
 * header previews so the badge/gap signal carries reviewable content.
 */
export function emitArchivedTabWarnings(tabs: ArchivedPullSheetTab[]): ParseWarning[] {
  return tabs
    .filter((tab) => !tab.included)
    .map((tab) => ({
      severity: "warn",
      code: "PULL_SHEET_ON_ARCHIVED_TAB",
      message: `Pull sheet found on archived tab "${tab.tabName}"; left out of the parse.`,
      rawSnippet: tab.headerPreviews.join(" | "),
      blockRef: { kind: "pull_sheet_archived_tab", name: tab.tabName },
    }));
}

/**
 * The forensic + UI-facing `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` warning raised
 * when an accepted archived-tab pull sheet's content drifted (or its tab vanished)
 * since the admin pinned it (§5.2). Rendered as an S4 re-confirm card; also emitted
 * as a forensic event on the cron path.
 */
export function contentChangedWarning(tabName: string): ParseWarning {
  return {
    severity: "warn",
    code: "PULL_SHEET_OVERRIDE_CONTENT_CHANGED",
    message: `Included archived-tab pull sheet "${tabName}" changed since accept; set back to skipped for re-confirm.`,
    blockRef: { kind: "pull_sheet_archived_tab", name: tabName },
  };
}

/**
 * Reconcile the exporter's returned archived tabs against the stored override
 * (§5.2/§5.3). The override pins ONE archived tab by `tabName` + `fingerprint`:
 *
 *  - `no_override`   — nothing pinned; nothing to reconcile.
 *  - `match`         — the pinned tab is present and its current fingerprint
 *                      equals the accepted one → the included pull sheet stays.
 *  - `content_changed` — the pinned tab is present but its fingerprint drifted
 *                      (content changed under an unchanged override) → discard-and-rerun.
 *  - `tab_missing`   — no tab for `override.tabName` (renamed/deleted server-side,
 *                      Codex plan-R2-1, spec §6) → discard-and-rerun (rendered S1).
 */
export function reconcileIncludedTab(args: {
  tabs: ArchivedPullSheetTab[];
  override: PullSheetOverride | null;
}):
  | { kind: "no_override" }
  | { kind: "match" }
  | { kind: "content_changed"; changedTab: ArchivedPullSheetTab }
  | { kind: "tab_missing" } {
  const { tabs, override } = args;
  if (!override) return { kind: "no_override" };
  const tab = tabs.find((t) => t.tabName === override.tabName);
  if (!tab) return { kind: "tab_missing" };
  if (tab.fingerprint === override.fingerprint) return { kind: "match" };
  return { kind: "content_changed", changedTab: tab };
}

/**
 * SINGLE-SOURCE discard-and-rerun (§5.2, I5b — structural defense).
 *
 * On `content_changed` OR `tab_missing`, ALL THREE consumers (`runOnboardingScan`,
 * `rescanWizardSheet`, `runScheduledCronSync`) MUST behave identically:
 *
 *   1. clear the override (write `null`) — the pin no longer matches reviewed content;
 *   2. re-parse WITHOUT `includePullSheetFromTab` and stage/apply THAT result — the
 *      first parse already contains the CHANGED gear and is unusable. The no-override
 *      re-parse PRESERVES any current non-OLD pull sheet and drops ONLY the OLD-tab
 *      gear (Codex plan-R4-1). `pullSheet` is empty ONLY when there is no non-OLD
 *      pull sheet — it is NEVER force-emptied here;
 *   3. `pull_sheet_override_applied = null` — the no-override parse was produced
 *      under no override, so `overrideSnapshot(null) === applied` and the row
 *      finalizes as a plain no-pull-sheet show (NOT left blocked at `applied = A`);
 *   4. re-emit the offer: for `content_changed`, flag the re-detected tab entry
 *      `contentChangedSinceAccept = true` (S4 re-confirm) with the NEW previews/
 *      fingerprint; for `tab_missing` there is no server-side tab → no offer (S1);
 *   5. push a `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` warning + run the caller's
 *      forensic `emit` (cron app_event; no-op elsewhere).
 *
 * `reparseNoOverride` MUST return a fully-finalized `ParseResult` — i.e. with
 * `archivedPullSheetTabs` set from the no-override export AND its
 * `PULL_SHEET_ON_ARCHIVED_TAB` warnings already pushed (via {@link finalizeArchivedTabs}),
 * exactly as the non-discard staging path does — so no path can diverge.
 */
export async function discardAndRerun(args: {
  reconcile:
    | { kind: "content_changed"; changedTab: ArchivedPullSheetTab }
    | { kind: "tab_missing" };
  overrideTabName: string;
  reparseNoOverride: () => Promise<ParseResult>;
  clearOverride: () => Promise<void>;
  emit?: () => void | Promise<void>;
}): Promise<{ parseResult: ParseResult; appliedSnapshot: OverrideSnapshot }> {
  await args.clearOverride();
  const parseResult = await args.reparseNoOverride();
  if (args.reconcile.kind === "content_changed") {
    // Flag the re-detected (now included:false) offer entry so Step 3 renders S4
    // "changed — re-confirm" rather than a first-time S2 (§5.2/§5.6, Codex R10-2),
    // even though the override is now null. Preserves the NEW previews/fingerprint.
    const entry = parseResult.archivedPullSheetTabs.find((t) => t.tabName === args.overrideTabName);
    if (entry) entry.contentChangedSinceAccept = true;
  }
  parseResult.warnings.push(contentChangedWarning(args.overrideTabName));
  await args.emit?.();
  return { parseResult, appliedSnapshot: null };
}

/**
 * Attach the exporter's returned archived tabs onto a parse result AND push the
 * matching `PULL_SHEET_ON_ARCHIVED_TAB` warnings — the one shared step every scan
 * path (onboarding, rescan, cron) runs after parse so the staged envelope always
 * carries `archivedPullSheetTabs` as a first-class field (§5.9). Mutates + returns
 * `pr` for call-site convenience.
 */
export function finalizeArchivedTabs(pr: ParseResult, tabs: ArchivedPullSheetTab[]): ParseResult {
  pr.archivedPullSheetTabs = tabs;
  pr.warnings.push(...emitArchivedTabWarnings(tabs));
  return pr;
}
