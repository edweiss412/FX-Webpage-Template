// tests/docs/_retiredIdentifiers.ts
//
// Pure core for the retired-identifier reference guard. Split from the test file
// so the family proofs can run against synthetic inputs instead of depending on
// the real tree happening to contain an instance — the layer split
// tests/components/_orphanedComponents.ts and tests/docs/_invariant8Closeout.ts
// both use.
//
// WHY THIS EXISTS. When a component is retired, its name survives in comments,
// test titles, registries, and ledgers. Three consecutive adversarial rounds on
// the 2026-08-03 orphan-components branch each found references a hand-curated
// census had missed, and each miss came from a different `--glob` scoping
// decision silently reclassifying a live reference as history:
//
//   R1 — two files naming the path as a STRING inside a test helper (a
//        readFileSync and a registry row), invisible to an import-oriented grep.
//   R2 — a `test.describe` TITLE, and a still-open backlog entry.
//   R3 — three ACTIVE deferral-ledger rows, treated as history because they sat
//        in a docs/ directory.
//
// So discovery is a walk of `git ls-files` and every exemption is a CLAIM with a
// reason attached, reviewable per row.
//
// EXEMPTIONS ARE KEYED BY LINE CONTENT, NOT BY FILE (spec R4). A file key cannot
// distinguish a live occurrence from a historical one inside the same file, and
// this tree has exactly that case: the v1 plan's DEFERRED.md carries a LIVE
// commitment naming RightNowCard and resolved history naming it too.
// Allowlisting the file to keep the history also exempts the live row; refusing
// to allowlist it leaves the guard permanently red.
//
// ARCHIVE ROWS ARE GLOBS, WITH THE CURRENT-STATE DOCUMENTS CARVED OUT (spec R7).
// The census finds these identifiers in ~40 documents under docs/superpowers/**;
// forty hand rows would be a curated list by another name. But a glob that
// swallowed a live ledger — or 00-overview.md, whose file map declares itself
// "the source of truth for where does X live" — would reintroduce the same
// mixed-liveness defect at directory scale. Membership test for the carve-out: a
// file is CURRENT-STATE if a reader consults it to learn how things ARE, not how
// they WERE.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = process.cwd();

/** The identifiers this branch retires. A reference to any of them is a hit. */
export const RETIRED_IDENTIFIERS = [
  "RightNowCard",
  "PerShowCrewSection",
  "PerShowCrewRow",
  "ResolveAlertButton",
  "RunFinalCASButton",
] as const;

/**
 * Path prefixes whose every file is a dated record end to end: what was true
 * when written. A superseded design record is not corrected, it is superseded.
 */
export const ARCHIVE_GLOBS = [
  "docs/superpowers/specs/",
  "docs/superpowers/plans/",
  "docs/audits/",
  "docs/superpowers/artifacts/",
] as const;

/** Whole files that are archives by name rather than by directory. */
export const ARCHIVE_FILES = ["BACKLOG-archive.md", "DEFERRED-archive.md"] as const;

/**
 * CURRENT-STATE documents that sit inside an archive glob but describe how
 * things ARE. A stale reference in one of these is a defect, not a record, so
 * they need per-line rows like any live file. Every path here is asserted to
 * EXIST, so a rename cannot silently return a file to the archive glob.
 */
export const CURRENT_STATE_CARVE_OUTS = [
  "BACKLOG.md",
  "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/00-overview.md",
  "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/ROUTING.md",
  "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/HANDOFF-TEMPLATE.md",
  "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
  "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-12-user-facing-docs/DEFERRED.md",
] as const;

/** Any `DEFERRED.md` under the plans tree is a live ledger, however deeply nested. */
export function isLiveLedger(file: string): boolean {
  if ((CURRENT_STATE_CARVE_OUTS as readonly string[]).includes(file)) return true;
  return file.startsWith("docs/superpowers/plans/") && file.endsWith("/DEFERRED.md");
}

/** True when the whole file is a dated record AND is not carved out as current-state. */
export function isArchivePath(file: string): boolean {
  if (isLiveLedger(file)) return false;
  if ((ARCHIVE_FILES as readonly string[]).includes(file)) return true;
  return ARCHIVE_GLOBS.some((g) => file.startsWith(g));
}

/**
 * One exemption. `line` and `pending` carry the matched line VERBATIM (trimmed);
 * a row that matches nothing fails, so editing an exempted line invalidates its
 * exemption instead of silently widening it.
 */
export type ExemptionRow =
  | { kind: "line"; file: string; text: string; reason: string }
  | { kind: "pending"; file: string; text: string; repairedBy: string; reason: string };

/**
 * The ledger. `pending` rows are live references this branch repairs; the task
 * named in `repairedBy` deletes its rows in the same commit that repairs them,
 * and the terminal assertion requires zero `pending` rows at close-out.
 *
 * ANY task that edits, moves, or deletes an exempted line owns its row in the
 * same commit. "I only renamed a test file" is exactly the case that breaks an
 * exact-line exemption.
 */
export const RETIRED_IDENTIFIER_EXEMPTIONS: readonly ExemptionRow[] = [
  {
    kind: "pending",
    file: "app/admin/settings/admins/RevokeRowButton.tsx",
    text:
      "* C4 ResolveAlertButton pattern (shape brief §6.5):",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "BACKLOG.md",
    text:
      "**Description:** M5-D7 extracted the canonical accent-fill button chrome (`bg-accent` + `text-accent-text` + `hover:bg-accent-hover` + focus-ring + disabled treatment) into one atom and migrated the **8 admin call sites** the deferral named (ResolveAlertButton ×2, PendingPanelRetryButton, ReSyncButton, PublishShowButton, RunFinalCASButton, ResumeFinalizeButton, FinalizeButton, StagedReviewCard). A repo-wide grep at migration time found the pattern still hand-rolled in **~17 other sites** OUT OF M5-D7 SCOPE: `app/admin/error.tsx`, `app/admin/settings/error.tsx`, `app/admin/settings/admins/{error.tsx,AddAdminForm.tsx,RevokeRowButton.tsx ×3}`, `app/admin/show/[slug]/{ShareLinkCopyButton.tsx,ResetPickerEpochButton.tsx,RotateShareTokenButton.tsx ×2}`, `app/show/[slug]/unpublish/ConfirmUnpublishForm.tsx`, `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx ×2`, `components/admin/Mi11GateActions.tsx`, `components/admin/wizard/{Step1Share,Step2Verify ×2,Step3Review}.tsx`, `components/admin/settings/AddAdminDisclosure.tsx`, `components/shared/{ReportButton.tsx,ReportModal.tsx ×4}`. (Pill-badge `bg-accent text-accent-text` spans in AdminNav/NotifBell and the active-step indicators in OnboardingWizard/Step3Review/me/page are NOT buttons — they are a different, legitimate use of the token pair and out of scope for this atom.)",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "BACKLOG.md",
    text:
      "| `components/admin/PerShowCrewSection.tsx` | Nothing, anywhere, outside itself.                                                   |",
    repairedBy: "Task 6",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "BACKLOG.md",
    text:
      "| `components/admin/ResolveAlertButton.tsx` | Only other components' comments, citing it as a pattern exemplar.                    |",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "BACKLOG.md",
    text:
      "| `components/admin/RunFinalCASButton.tsx`  | Only the `AccentButton` header comment.                                              |",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "BACKLOG.md",
    text:
      "| `components/right-now/RightNowCard.tsx`   | Only comments, several of which read as though it were live.                         |",
    repairedBy: "Task 5",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "components/admin/ArchiveShowButton.tsx",
    text:
      "* mirroring components/admin/ResolveAlertButton:",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "components/admin/PendingPanelDiscardButtons.tsx",
    text:
      "* (ArchiveShowButton \"Confirm archive\", ResolveAlertButton \"Confirm dismiss\") and the",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "components/admin/PerShowCrewSection.tsx",
    text:
      "* components/admin/PerShowCrewSection.tsx",
    repairedBy: "Task 6",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "components/admin/PerShowCrewSection.tsx",
    text:
      "crew: PerShowCrewRow[];",
    repairedBy: "Task 6",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "components/admin/PerShowCrewSection.tsx",
    text:
      "export function PerShowCrewSection({",
    repairedBy: "Task 6",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "components/admin/PerShowCrewSection.tsx",
    text:
      "export type PerShowCrewRow = {",
    repairedBy: "Task 6",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "components/admin/ResolveAlertButton.tsx",
    text:
      "* components/admin/ResolveAlertButton.tsx (M9 C4 / M5-D3, hardened M9-D-C4-1)",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "components/admin/ResolveAlertButton.tsx",
    text:
      "* top-level ResolveAlertButton would couple it to the parent",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "components/admin/ResolveAlertButton.tsx",
    text:
      "export function ResolveAlertButton({ quiet = false }: { quiet?: boolean } = {}) {",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "components/admin/RetryWatchButton.tsx",
    text:
      "* safe/idempotent (unlike ResolveAlertButton's destructive Dismiss). Pending",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "components/admin/RunFinalCASButton.tsx",
    text:
      "* components/admin/RunFinalCASButton.tsx (M10 §B Task 10.1 §B / Phase 2)",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "components/admin/RunFinalCASButton.tsx",
    text:
      "export function RunFinalCASButton({ sessionId }: Props) {",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "line",
    file: "components/crew/RightNowHero.tsx",
    text:
      "* `RightNowCard`",
    reason:
      "Continuation of the retirement provenance sentence above it.",
  },
  {
    kind: "line",
    file: "components/crew/RightNowHero.tsx",
    text:
      "* `RightNowHero` IS the retired `RightNowCard` re-skinned into the mock's five-slot hero",
    reason:
      "Provenance: the hero is defined by what it was reskinned from, and the reader needs the name to find it in history.",
  },
  {
    kind: "line",
    file: "components/crew/RightNowHero.tsx",
    text:
      "// ── lastGood / morph-to-last-good tracker (verbatim from RightNowCard) ──",
    reason:
      "Provenance: marks the block as carried verbatim, which is why the retargeted regression pins apply to it.",
  },
  {
    kind: "line",
    file: "components/right-now/buildRightNowContext.ts",
    text:
      "* original `RightNowCard` at `b327d5eb0`, which is retired).",
    reason:
      "Provenance for the projection's consumer: the sentence exists to name what superseded what.",
  },
  {
    kind: "pending",
    file: "components/shared/AccentButton.tsx",
    text:
      "*     (e.g. ResolveAlertButton's `disabled:hover:bg-accent`) win in cascade",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "components/shared/AccentButton.tsx",
    text:
      "* admin call sites (ResolveAlertButton, PendingPanelRetryButton,",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "components/shared/AccentButton.tsx",
    text:
      "* ReSyncButton, PublishShowButton, RunFinalCASButton,",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/00-overview.md",
    text:
      "crew/RightNowHero.tsx      # state machine (§8.2; superseded right-now/RightNowCard.tsx at b327d5eb0)",
    reason:
      "The canonical file map points at the live hero; the retired path survives only as the supersession note that makes the change legible.",
  },
  {
    kind: "pending",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
    text:
      "- `tests/e2e/crew-page.spec.ts:619` CrewTile (~3h; existing `PerShowCrewSection.test.tsx` is admin-side, not equivalent)",
    repairedBy: "Task 6",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
    text:
      "**Description:** `components/layout/Header.tsx` show title is `text-2xl sm:text-3xl font-bold` — same scale as the RightNowCard lead. The eyebrow `client_label` is the same `text-xs uppercase` as every tile heading. Result: header competes visually with both the hero card and the tile grid; nothing dominates.",
    reason:
      "Description of a resolved deferral; rewriting it would falsify the record.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
    text:
      "**Description:** `components/right-now/RightNowCard.tsx` carries 3 `data-*` test attributes (`data-state`, `data-rendered-state`, `data-treatment`) on a screen-reader-traversed `<p>`. Over-instrumented for a hero element.",
    reason:
      "Description of a deferral resolved in M9 C1; the file it names was accurate when written.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
    text:
      "**Description:** Five different `tracking-[...]` values for uppercase eyebrows across Section + KeyValue + Header + RightNowCard + Footer (`0.12em` / `0.14em` / `0.18em` / `0.22em` / inline arbitrary values). Token-discipline contract violation — inline arbitrary values where a named token would unify the spec.",
    reason:
      "Description of a resolved deferral; rewriting it would falsify the record.",
  },
  {
    kind: "pending",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
    text:
      "**Regression test added:** `tests/components/ResolveAlertButton.test.tsx` — new case `\"M9-D-C4-1: pending flips back to false on action failure → Confirm + Cancel re-enabled (no stuck Resolving…)\"` uses a controlled async action that rejects mid-flight; asserts the disabled controls re-enable + label reverts to \"Confirm resolve\" after the failed submission. The existing `confirm → resolving` case was also rewritten to use a real `<form action={fn}>` with a controlled promise so useFormStatus has an actual submission lifecycle to track.",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
    text:
      "**Status:** **Resolved.** `components/admin/ResolveAlertButton.tsx` refactored to derive the \"Resolving…\" / disabled-controls state from `useFormStatus().pending` instead of a local `ui=\"resolving\"` flag.",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
    text:
      "**Status:** Resolved in M9 Cluster C1 (commit `9c5b98a` in recent log: \"relocate RightNowCard debug attributes off AT-traversed p (M4-D4)\").",
    reason:
      "Resolution note quoting the commit subject verbatim; rewriting it would falsify the citation.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
    text:
      "**Suggested home:** M9 polish. Either shrink the header (smaller title, condense to a sticky-thin bar) so the RightNowCard wins the page's primary moment unambiguously, OR commit to header-as-context (smaller title, drop the orange hairline which fights the RightNowCard's accent dot for the eye).",
    reason:
      "Suggested-home note on a resolved deferral; history.",
  },
  {
    kind: "pending",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
    text:
      "**Trigger:** M13 launch-gate checklist, or sooner if any milestone reopens the finalize-cas UI (`components/admin/RunFinalCASButton.tsx` / `components/admin/FinalizeButton.tsx` per-row panels).",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
    text:
      "### M4-D3 — Header weight competes with RightNowCard for the page hero — **RESOLVED 2026-05-17 via M9 Cluster C1**",
    reason:
      "A resolved deferral inside a live ledger: history, and the heading records what was true when it closed.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
    text:
      "### M4-D4 — RightNowCard data-\\* test attribute relocation — **RESOLVED 2026-05-17 via M9 Cluster C1**",
    reason:
      "A resolved deferral inside a live ledger: history, and the heading records what was true when it closed.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-12-user-facing-docs/DEFERRED.md",
    text:
      "- **Concrete fix path (NOT Phase A scope):** Project-infra session — either (a) raise `maxDiffPixels` tolerance on the four `empty-state-reachability.spec.ts` snapshots to allow ~0.02 ratio, (b) refresh the snapshots if a stable post-fonts rendering can be captured, or (c) investigate the RightNowCard hydration drift root-cause and pin its post-hydration state before the screenshot fires.",
    reason:
      "Scope note naming the M3/M4 render path as it stood; a record of the deferral's boundary, not a live pointer.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-12-user-facing-docs/DEFERRED.md",
    text:
      "- **Why deferred (concrete trigger):** Current 3 manifest keys (`dashboard-overview`, `review-queues-empty-state`, `preview-as-crew-banner`) capture surfaces that contain only hover/focus transition-colors on links/buttons — no load-time animations, no spinners, no framer-motion inside the captured selectors. `RightNowCard` does use framer-motion but is outside the `preview-as-crew-banner` capture region. The empirical determinism evidence outweighs the theoretical timing vulnerability at this scope. Phase F R4 APPROVE-with-residual disposition.",
    reason:
      "Trigger note describing the surfaces the manifest captured at filing time.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-12-user-facing-docs/DEFERRED.md",
    text:
      "- **Why deferred (NOT Phase A's surface):** Phase A does not touch `components/show/`, `components/atoms/`, or `app/show/[slug]/`. The M3 LodgingTile + tile-grid render path is owned by the M3/M4 plan tree. WebServer logs surface an incidental hydration drift on `<RightNowCard data-prefers-reduced-motion>` (\"unknown\" → \"false\"), but RightNowCard is outside the screenshotted `tile-grid` element.",
    reason:
      "Scope note describing what Phase A did not touch; a record of the boundary.",
  },
  {
    kind: "pending",
    file: "tests/components/_orphanedComponents.ts",
    text:
      "file: \"components/admin/PerShowCrewSection.tsx\",",
    repairedBy: "Task 6",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/_orphanedComponents.ts",
    text:
      "file: \"components/admin/ResolveAlertButton.tsx\",",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/_orphanedComponents.ts",
    text:
      "file: \"components/admin/RunFinalCASButton.tsx\",",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/admin/FinalizeReentry.test.tsx",
    text:
      "// RunFinalCASButton + CleanupAbandonedFinalizeButton contracts remain here.",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/admin/FinalizeReentry.test.tsx",
    text:
      "const { getByTestId } = render(<RunFinalCASButton sessionId={SESSION_ID} />);",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/admin/FinalizeReentry.test.tsx",
    text:
      "describe(\"RunFinalCASButton\", () => {",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/admin/FinalizeReentry.test.tsx",
    text:
      "import { RunFinalCASButton } from \"@/components/admin/RunFinalCASButton\";",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/admin/RescanSheetButton.test.tsx",
    text:
      "const { getByTestId, queryByTestId } = render(<RunFinalCASButton sessionId={SESSION} />);",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/admin/RescanSheetButton.test.tsx",
    text:
      "import { RunFinalCASButton } from \"@/components/admin/RunFinalCASButton\";",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/admin/RescanSheetButton.test.tsx",
    text:
      "test(\"RunFinalCASButton: renders for an OUTDATED row, NOT for a corrupt row\", async () => {",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/admin/RunFinalCASButton.test.tsx",
    text:
      "* Pins the finalize-cas per_row contract on <RunFinalCASButton>: a 409",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/admin/RunFinalCASButton.test.tsx",
    text:
      "* tests/components/admin/RunFinalCASButton.test.tsx — WM-R3 regressions.",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/admin/RunFinalCASButton.test.tsx",
    text:
      "<RunFinalCASButton sessionId={SESSION_ID} />,",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/admin/RunFinalCASButton.test.tsx",
    text:
      "const { getByTestId } = render(<RunFinalCASButton sessionId={SESSION_ID} />);",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/admin/RunFinalCASButton.test.tsx",
    text:
      "const { getByTestId, getByText } = render(<RunFinalCASButton sessionId={SESSION_ID} />);",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/admin/RunFinalCASButton.test.tsx",
    text:
      "const { getByTestId, queryByTestId } = render(<RunFinalCASButton sessionId={SESSION_ID} />);",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/admin/RunFinalCASButton.test.tsx",
    text:
      "describe(\"RunFinalCASButton\", () => {",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/admin/RunFinalCASButton.test.tsx",
    text:
      "import { RunFinalCASButton } from \"@/components/admin/RunFinalCASButton\";",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/atoms/AccentButton.test.tsx",
    text:
      "* (ResolveAlertButton, PendingPanelRetryButton, ReSyncButton,",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/atoms/AccentButton.test.tsx",
    text:
      "* PublishShowButton, RunFinalCASButton, ResumeFinalizeButton,",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "line",
    file: "tests/components/crew/rightNowHero.test.tsx",
    text:
      "* `RightNowHero` IS the retired `RightNowCard` re-skinned into the §4.16 five-slot hero",
    reason:
      "Provenance: the suite's subject is defined by what it was reskinned from.",
  },
  {
    kind: "line",
    file: "tests/components/crew/rightNowHeroRecovery.test.tsx",
    text:
      "* RETARGET (2026-08-03): this suite pinned `RightNowCard`, which the",
    reason:
      "Provenance for the retarget: naming the component this suite used to pin IS the content.",
  },
  {
    kind: "pending",
    file: "tests/components/PerShowCrewSection.test.tsx",
    text:
      "* tests/components/PerShowCrewSection.test.tsx (M11.5 §B Task F1)",
    repairedBy: "Task 6",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/PerShowCrewSection.test.tsx",
    text:
      "const { container } = render(<PerShowCrewSection showId=\"show-1\" crew={[makeRow()]} />);",
    repairedBy: "Task 6",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/PerShowCrewSection.test.tsx",
    text:
      "describe(\"PerShowCrewSection (post-F1: picker pivot)\", () => {",
    repairedBy: "Task 6",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/PerShowCrewSection.test.tsx",
    text:
      "function makeRow(overrides: Partial<PerShowCrewRow> = {}): PerShowCrewRow {",
    repairedBy: "Task 6",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/PerShowCrewSection.test.tsx",
    text:
      "import { PerShowCrewSection, type PerShowCrewRow } from \"@/components/admin/PerShowCrewSection\";",
    repairedBy: "Task 6",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/PerShowCrewSection.test.tsx",
    text:
      "render(<PerShowCrewSection showId=\"show-1\" crew={[]} />);",
    repairedBy: "Task 6",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/PerShowCrewSection.test.tsx",
    text:
      "render(<PerShowCrewSection showId=\"show-1\" crew={[makeRow()]} crewLookupFailed />);",
    repairedBy: "Task 6",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/PerShowCrewSection.test.tsx",
    text:
      "render(<PerShowCrewSection showId=\"show-1\" crew={[makeRow({ role: null })]} />);",
    repairedBy: "Task 6",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/PerShowCrewSection.test.tsx",
    text:
      "render(<PerShowCrewSection showId=\"show-1\" crew={crew} />);",
    repairedBy: "Task 6",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/ResolveAlertButton.test.tsx",
    text:
      "* tests/components/ResolveAlertButton.test.tsx — two-tap confirmation",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/ResolveAlertButton.test.tsx",
    text:
      "<ResolveAlertButton />",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/ResolveAlertButton.test.tsx",
    text:
      "const { getByTestId } = render(<ResolveAlertButton />);",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/ResolveAlertButton.test.tsx",
    text:
      "const { getByTestId } = render(<ResolveAlertButton quiet />);",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/ResolveAlertButton.test.tsx",
    text:
      "const { getByTestId, queryByTestId } = render(<ResolveAlertButton />);",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/ResolveAlertButton.test.tsx",
    text:
      "describe(\"arm-expiry announcement — ResolveAlertButton\", () => {",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/ResolveAlertButton.test.tsx",
    text:
      "describe(\"ResolveAlertButton state machine\", () => {",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/ResolveAlertButton.test.tsx",
    text:
      "import { ResolveAlertButton } from \"@/components/admin/ResolveAlertButton\";",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/components/RetryWatchButton.test.tsx",
    text:
      "* The pending state is load-bearing: unlike ResolveAlertButton there is no",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/cross-cutting/no-load-show-crew-with-auth.test.ts",
    text:
      "\"components/admin/PerShowCrewSection.tsx\",",
    repairedBy: "Task 6",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/cross-cutting/no-load-show-crew-with-auth.test.ts",
    text:
      "\"tests/components/PerShowCrewSection.test.tsx\",",
    repairedBy: "Task 6",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "line",
    file: "tests/help/_metaServerTimeGuard.test.ts",
    text:
      "// 'use client' directive over from the retired RightNowCard verbatim, so the",
    reason:
      "Explains why swapping the island exemplar preserves the classifier's contract; naming the source is the justification.",
  },
  {
    kind: "pending",
    file: "tests/help/forbidden-prose-registry.test.ts",
    text:
      "\"R14 finding 1 (tour.mdx:68). No copy-URL affordance ships in PerShowCrewSection. The retired signed-link controls did not expose a copyable URL. Until a one-tap copy button ships, Doug shares URLs through his usual channel — prose must reflect that.\",",
    repairedBy: "Task 6",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/onboarding/finalize-cas.test.ts",
    text:
      "// RunFinalCASButton renders per-row codes via messageFor().dougFacing — an",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/styles/_metaDestructiveConfirm.test.ts",
    text:
      "R(\"components/admin/ResolveAlertButton.tsx\", 0, \"panel\", \"admin-alert-confirm-resolve-button\"),",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/styles/accent-button-atom.test.ts",
    text:
      "\"ResolveAlertButton.tsx\",",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/styles/accent-button-atom.test.ts",
    text:
      "\"RunFinalCASButton.tsx\",",
    repairedBy: "Task 8",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
  {
    kind: "pending",
    file: "tests/styles/accent-button-atom.test.ts",
    text:
      "// The call sites migrated by M5-D7. ResolveAlertButton carries TWO accent",
    repairedBy: "Task 7",
    reason:
      "Live reference to a retired identifier; repaired by the named task.",
  },
];

const SELF: readonly string[] = [
  "tests/docs/_retiredIdentifiers.ts",
  "tests/docs/retiredIdentifierReferences.test.ts",
];

export interface Hit {
  file: string;
  line: number;
  identifier: string;
  text: string;
}

/** Every hit of every retired identifier across the given tracked files. */
export function scanFiles(files: readonly string[], root: string = ROOT): Hit[] {
  const out: Hit[] = [];
  for (const file of files) {
    if (SELF.includes(file)) continue; // the ledger and its test name every identifier by construction
    let source: string;
    try {
      source = readFileSync(join(root, file), "utf8");
    } catch {
      continue; // deleted between `git ls-files` and the read; not this guard's business
    }
    if (!RETIRED_IDENTIFIERS.some((id) => source.includes(id))) continue;
    const lines = source.split("\n");
    for (const [i, raw] of lines.entries()) {
      for (const identifier of RETIRED_IDENTIFIERS) {
        if (raw.includes(identifier)) out.push({ file, line: i + 1, identifier, text: raw.trim() });
      }
    }
  }
  return out;
}

/** The hits no exemption covers, sorted for a stable failure message. */
export function unexemptedHits(hits: readonly Hit[], rows: readonly ExemptionRow[]): Hit[] {
  const byFile = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = byFile.get(row.file) ?? new Set<string>();
    set.add(row.text);
    byFile.set(row.file, set);
  }
  return hits
    .filter((h) => !isArchivePath(h.file))
    .filter((h) => !(byFile.get(h.file)?.has(h.text) ?? false))
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** Exemption rows that no longer match any line — stale claims, and a failure. */
export function unmatchedRows(
  hits: readonly Hit[],
  rows: readonly ExemptionRow[],
): ExemptionRow[] {
  const present = new Set(hits.map((h) => `${h.file} ${h.text}`));
  return rows.filter((row) => !present.has(`${row.file} ${row.text}`));
}
