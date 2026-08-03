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
    kind: "line",
    file: "BACKLOG.md",
    text:
      "**Description:** M5-D7 extracted the canonical accent-fill button chrome (`bg-accent` + `text-accent-text` + `hover:bg-accent-hover` + focus-ring + disabled treatment) into one atom and migrated the **8 admin call sites** the deferral named (ResolveAlertButton ×2, PendingPanelRetryButton, ReSyncButton, PublishShowButton, RunFinalCASButton, ResumeFinalizeButton, FinalizeButton, StagedReviewCard). **Census note (2026-08-03):** three of those eight call sites have since been retired — ResumeFinalizeButton at the Step-3 consolidation, ResolveAlertButton and RunFinalCASButton as zero-production-importer components — and `ReSyncButton` was separately DE-MIGRATED to a ghost trigger by the modal-header reconciliation (§6.7), so the executable `MIGRATED_FILES` census in `tests/styles/accent-button-atom.test.ts` is now three: `PendingPanelRetryButton`, `FinalizeButton`, `StagedReviewCard`. That scan walks the migrated files, not the repo; repo-wide `bg-accent` coverage belongs to `tests/styles/_metaBgAccentInventory.test.ts`. A repo-wide grep at migration time found the pattern still hand-rolled in **~17 other sites** OUT OF M5-D7 SCOPE: `app/admin/error.tsx`, `app/admin/settings/error.tsx`, `app/admin/settings/admins/{error.tsx,AddAdminForm.tsx,RevokeRowButton.tsx ×3}`, `app/admin/show/[slug]/{ShareLinkCopyButton.tsx,ResetPickerEpochButton.tsx,RotateShareTokenButton.tsx ×2}`, `app/show/[slug]/unpublish/ConfirmUnpublishForm.tsx`, `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx ×2`, `components/admin/Mi11GateActions.tsx`, `components/admin/wizard/{Step1Share,Step2Verify ×2,Step3Review}.tsx`, `components/admin/settings/AddAdminDisclosure.tsx`, `components/shared/{ReportButton.tsx,ReportModal.tsx ×4}`. (Pill-badge `bg-accent text-accent-text` spans in AdminNav/NotifBell and the active-step indicators in OnboardingWizard/Step3Review/me/page are NOT buttons — they are a different, legitimate use of the token pair and out of scope for this atom.)",
    reason:
      "BL-ACCENT-BUTTON-ATOM-SWEEP's description records which call sites M5-D7 migrated. The retired names ARE the census, and the note says they are retired.",
  },
  {
    kind: "line",
    file: "BACKLOG.md",
    text:
      "| `components/admin/PerShowCrewSection.tsx` | RETIRED. Mount removed at `d70761005`; the route is now a 307 into the dashboard modal, where `CrewBreakdown` renders the roster. |",
    reason:
      "Disposition table in the worked orphan entry: each row records what was retired and what superseded it.",
  },
  {
    kind: "line",
    file: "BACKLOG.md",
    text:
      "| `components/admin/ResolveAlertButton.tsx` | RETIRED. Superseded at `67ce6d082` by the bell panel's resolve control (labelled `Confirm` / `Mark resolved`, never \"Dismiss\"). |",
    reason:
      "Disposition table in the worked orphan entry.",
  },
  {
    kind: "line",
    file: "BACKLOG.md",
    text:
      "| `components/admin/RunFinalCASButton.tsx` | RETIRED. Superseded at `bd214c04b`; `FinalizeButton`'s `\"finish\"` mode is the live finalize-cas path. |",
    reason:
      "Disposition table in the worked orphan entry.",
  },
  {
    kind: "line",
    file: "BACKLOG.md",
    text:
      "| `components/right-now/RightNowCard.tsx` | RETIRED. Superseded at `b327d5eb0` by `RightNowHero`; its two regression suites were RETARGETED onto the hero first, each proven by mutation rather than assumed. |",
    reason:
      "Disposition table in the worked orphan entry.",
  },
  {
    kind: "line",
    file: "BACKLOG.md",
    text:
      "Last reconciled: 2026-08-03 — `chore/orphan-components-lead-prose` settled the two entries the copy/dead-code sweep left behind. `BL-LEAD-CAPABILITY-PROSE-STALE` graduated: both prose claims turned out STALE rather than intentional — the `capabilityTransitions` line is a verbatim quote that stopped being verbatim at `e348c81ca`, and MI-9's \"admin/ops\" clause was inherited from §12.4 copy strings whose every other instance had already been retired or corrected. A third instance the literal sweep could not see (`lib/sync/phase2.ts`, a semantic variant in production source) was corrected with them, and two guards shipped in the same commits: `capabilityHeaderParity` extracts the expected flag set from `scopeTiles.ts` source, and `capabilityClaimProse` scans the MI-9 rows AND every `.ts`/`.tsx` under `app`/`components`/`lib` with a positive-claim recognizer. `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS` was AMENDED, not archived: four components retired (each with a named superseding commit and live successor; `RightNowCard`'s two regression suites were retargeted onto `RightNowHero` and each proven by mutation before the deletion), and `WrappedTile` stays as a DECIDED retention — deleting it would orphan `TileErrorBoundary` and `TileServerFallback` rather than shrink the ledger, and the orphan guard now asserts its reason says so. Filed `BL-CAPABILITY-MATRIX-FINANCIALS-PREDICATE` (the matrix models five predicates, the code has six) and `BL-BELLPANEL-DISMISS-COMMENT-DRIFT` (six comments name a label the panel stopped rendering). New guard `tests/docs/retiredIdentifierReferences.test.ts` walks every tracked file for references to what was retired, keyed by LINE CONTENT with reasoned exemptions — three adversarial rounds each found references a hand-curated census had missed, so the census is now a walk. Prior: 2026-08-03 — `docs/graduate-bl-unpublish-to-held` graduated `BL-UNPUBLISH-TO-HELD` as already-shipped: the 2026-07-01 published toggle (`unpublish_show` RPC in `supabase/migrations/20260701000000_published_toggle_unpublish_show.sql`, driven by `setShowPublishedAction(slug, false)` from the admin show review modal, commit 945bd4ef0) is exactly the published→Held inverse the row asked for — the row's 2026-08-02 \"Verified: no such RPC exists\" was a false verification, and its premise that the M12.13 token-unpublish archives was stale too (both unpublish paths are pure `published=false`). A 10-point audit of the shipped surface before graduating found no functional gap and one gate-scope finding, filed as `BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED` (the validation-schema-parity gate covers tables×columns only, never functions — no current drift, probed live). Prior: 2026-08-02 — `chore/copy-deadcode-sweep` graduated three copy-and-dead-code entries (`BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT`: the §12.4 helpfulContext no longer claims either capability role unlocks admin access — probed, `is_admin()` never reads `role_flags` — landed as a five-surface lockstep in one commit plus the row's `longExplanation` and the `scopeTiles` header comment it contradicted; `BL-ADMIN-PARSEPANEL-ORPHANED`: the component deleted behind a new zero-production-importer guard that asks the compiler for both module edges and their targets, with the five peers the class sweep found filed as `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS`; `BL-HELP-STRIP-COPYLINK-STALE`: the per-show help prose now names the Share link button, no screenshot regenerated). Also filed `BL-LEAD-CAPABILITY-PROSE-STALE` for the two remaining prose claims that need a contract read. Prior: 2026-08-02 — `docs/dangling-citation-ledger-filing` took the referential-integrity guard's `KNOWN_DANGLING` debt map from 50 rows to 9, filing 39 real entries and correcting one citation (`BL-FLOW4` came off as a side effect: with its family now defined, the stem suppresses as a family reference). Eight open rows here (`BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`, `BL-HEADER-REACT-RECONCILE-HARNESS`, `BL-PG-CRON-HOST-ASSERTION`, `BL-NEEDS-ATTENTION-HOLDS-ROLLUP`, `BL-RESYNC-STAGED-REVIEW-UI`, `BL-STEP3-FULL-CREW-PREVIEW`, `BL-UNPUBLISH-TO-HELD`, `BL-VERSION-AMBIGUOUS-V1-OVERRIDE`) plus `BL-LEDGER-GUARD-BODY-DEFINED-IDS` as the handoff for the eight ids defined in a parent entry's BODY, which stay body-defined by decision. Thirty-one went straight to `BACKLOG-archive.md` at their terminal state: eleven already shipped (the row was deleted at close instead of graduated, twice on a spec's explicit instruction), fifteen were impeccable-gate deferrals whose promised row was never opened and whose deferral has since closed, and five name a branch that was never taken. One citation was corrected instead of filed: `BL-SYNC-FEED-UI-POLISH` pointed at a backlog-id family that exists nowhere in the repo. The 9 rows left are the eight body-defined ids above plus `BL-RESOLVED`, a prose placeholder in an audit doc, both handed to follow-ups. Prior: 2026-08-02 — `test/agenda-fold-seeded-e2e` graduated `BL-AGENDA-FOLD-NO-SEEDED-E2E` (the per-viewer agenda day fold exercised through the REAL crew page: seeded `agenda_links` + two complementary date-restricted viewers, each an email-matched Google session against its own seeded show, plus an unrestricted admin control in `stage-restricted-crew-schedule.spec.ts`, wired into `crew-e2e.yml` under desktop-chromium behind a run-command wiring guard) and `BL-AGENDA-A11Y-WEBKIT-COVERAGE` (grep-scoped `standalone-webkit-a11y` project resolving exactly one test, structurally pinned, plus webkit installs and a regenerated baseline). Prior: 2026-08-02 — docs/citation-rot-financials-vocab graduated BL-DANGLING-CITATIONS-RETIRED-WORKFLOW (15 dangling citations to the seven retired e2e workflows rendered as prose across 10 docs, class-swept per the AGENTS.md bug-shape rule; spec:lint target-class findings now zero tree-wide) and BL-MASTERSPEC-FINANCIALS-VOCAB (14 master-spec financials-entitlement claims reconciled to LEAD ∪ FINANCIALS ∪ admin, line-count-neutral; 4 seed exclusions + 8 window-probe non-claims ratified in docs/superpowers/specs/2026-08-02-docs-hygiene-citation-rot-financials-vocab-design.md; specs README line-count note corrected), and filed BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT (§12.4 copy over-grant, deferred to the next §12.4 copy pass). Earlier reconciliations (deduplicated 2026-08-02 — this line had accumulated 40 segments, 26 of them verbatim repeats of merge-concatenated chains): **[BACKLOG-archive.md § Reconciliation log](./BACKLOG-archive.md#reconciliation-log)**.",
    reason:
      "The reconciliation log records what each branch did; naming the components this one retired is the record.",
  },
  {
    kind: "line",
    file: "components/crew/RightNowHero.tsx",
    text:
      "* `RightNowCard` required.",
    reason:
      "Continuation of the retirement provenance sentence above it.",
  },
  {
    kind: "line",
    file: "components/crew/RightNowHero.tsx",
    text:
      "* `RightNowHero` IS the retired `RightNowCard` re-skinned into the mock's",
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
    kind: "line",
    file: "components/shared/AccentButton.tsx",
    text:
      "* Step-3 consolidation, ResolveAlertButton and RunFinalCASButton retired",
    reason:
      "Retirement provenance: the atom's drift history is the point of the sentence, and naming what left keeps the census honest.",
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
    kind: "line",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
    text:
      "**Regression test added:** `tests/components/ResolveAlertButton.test.tsx` — new case `\"M9-D-C4-1: pending flips back to false on action failure → Confirm + Cancel re-enabled (no stuck Resolving…)\"` uses a controlled async action that rejects mid-flight; asserts the disabled controls re-enable + label reverts to \"Confirm resolve\" after the failed submission. The existing `confirm → resolving` case was also rewritten to use a real `<form action={fn}>` with a controlled promise so useFormStatus has an actual submission lifecycle to track.",
    reason:
      "A RESOLVED deferral's record of the test that closed it; the suite was retired with its component on 2026-08-03, and rewriting the record would falsify what closed the deferral.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
    text:
      "**Status:** **Resolved.** `components/admin/ResolveAlertButton.tsx` refactored to derive the \"Resolving…\" / disabled-controls state from `useFormStatus().pending` instead of a local `ui=\"resolving\"` flag.",
    reason:
      "Resolution note on a closed deferral: it records what was refactored at the time.",
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
    kind: "line",
    file: "tests/components/admin/FinalizeReentry.test.tsx",
    text:
      "// CleanupAbandonedFinalizeButton contract remains here. The RunFinalCASButton",
    reason:
      "Explains what left this file and where the live coverage moved; naming it is the pointer a reader needs.",
  },
  {
    kind: "line",
    file: "tests/components/atoms/AccentButton.test.tsx",
    text:
      "* ResolveAlertButton and RunFinalCASButton, all since retired).",
    reason:
      "Retirement provenance for the atom's drift history.",
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
    kind: "line",
    file: "tests/help/_metaServerTimeGuard.test.ts",
    text:
      "// 'use client' directive over from the retired RightNowCard verbatim, so the",
    reason:
      "Explains why swapping the island exemplar preserves the classifier's contract; naming the source is the justification.",
  },
  {
    kind: "line",
    file: "tests/styles/accent-button-atom.test.ts",
    text:
      "// RunFinalCASButton left the same way on 2026-08-03: both were retired as",
    reason:
      "Second half of the same de-migration note.",
  },
  {
    kind: "line",
    file: "tests/styles/accent-button-atom.test.ts",
    text:
      "// the Step-3 consolidation retired it — spec §4.5. ResolveAlertButton and",
    reason:
      "Explains why two rows left the migrated-files list; naming what left is the justification a reviewer checks.",
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
      // ONE hit per LINE, not per identifier. A line naming several retired
      // components is one reference to repair, so it takes one exemption row;
      // counting per identifier would demand N rows for one sentence. The
      // occurrence counting that matters is across DUPLICATE LINES, which this
      // preserves.
      const named = RETIRED_IDENTIFIERS.filter((id) => raw.includes(id));
      if (named.length > 0) {
        out.push({ file, line: i + 1, identifier: named.join("+"), text: raw.trim() });
      }
    }
  }
  return out;
}

/** The hits no exemption covers, sorted for a stable failure message. */
const key = (file: string, text: string): string => `${file}\u0000${text}`;

/**
 * The hits no exemption covers.
 *
 * Matching is OCCURRENCE-COUNTED, not set-based (whole-diff review finding 5): a
 * row exempts ONE occurrence of its text, so if a file gains a second identical
 * line, the duplicate surfaces. A set-based match would let one historical
 * exemption silently cover a newly duplicated live reference — the same
 * "one claim, unbounded coverage" failure that made the file-keyed design wrong.
 */
export function unexemptedHits(hits: readonly Hit[], rows: readonly ExemptionRow[]): Hit[] {
  const budget = new Map<string, number>();
  for (const row of rows) {
    const k = key(row.file, row.text);
    budget.set(k, (budget.get(k) ?? 0) + 1);
  }
  const out: Hit[] = [];
  for (const h of hits) {
    if (isArchivePath(h.file)) continue;
    const k = key(h.file, h.text);
    const left = budget.get(k) ?? 0;
    if (left > 0) {
      budget.set(k, left - 1);
      continue;
    }
    out.push(h);
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** Exemption rows that no longer match any line — stale claims, and a failure. */
export function unmatchedRows(
  hits: readonly Hit[],
  rows: readonly ExemptionRow[],
): ExemptionRow[] {
  // Counted the same way: two rows for a line that occurs once leaves one row
  // matching nothing, which is a stale claim even though the text still exists.
  const available = new Map<string, number>();
  for (const h of hits) {
    const k = key(h.file, h.text);
    available.set(k, (available.get(k) ?? 0) + 1);
  }
  const out: ExemptionRow[] = [];
  for (const row of rows) {
    const k = key(row.file, row.text);
    const left = available.get(k) ?? 0;
    if (left > 0) available.set(k, left - 1);
    else out.push(row);
  }
  return out;
}
