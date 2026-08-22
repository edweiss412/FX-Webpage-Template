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
  // Byte-frozen copies of the ledgers at a named date, cross-checked against git
  // history by the `pnpm ledger:mass` oracle. A snapshot of BACKLOG.md carries
  // every name the repo had retired by that date BY CONSTRUCTION, and the one
  // repair this guard asks for — edit the line — is precisely the mutant the
  // oracle exists to kill. Scoped to this ONE directory, never `tests/fixtures/`:
  // a live fixture naming a retired component is still a defect. The naming
  // assertion below keeps a non-snapshot file from landing here unnoticed.
  "tests/fixtures/ledger-mass/",
] as const;

/**
 * Every file under the frozen-snapshot glob is a dated ledger snapshot.
 *
 * The glob exempts a whole directory, so without this a hand-written helper
 * dropped beside the snapshots would inherit the exemption silently — the
 * "archive globs matching nothing" assertion catches a typo that WIDENS by
 * matching nothing, not one that widens by matching too much.
 */
export const FROZEN_LEDGER_SNAPSHOT_GLOB = "tests/fixtures/ledger-mass/";
export const FROZEN_LEDGER_SNAPSHOT_NAME = /^\d{4}-\d{2}-\d{2}\.ledgers\.json$/;

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
  // The master spec is the canonical contract (AGENTS.md invariant 7), not a dated
  // record. It sits inside the specs glob, so without this row an injected stale
  // reference in it would be silently exempt — whole-diff R2 proved exactly that.
  "docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md",
  "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/00-overview.md",
  "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/ROUTING.md",
  "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/HANDOFF-TEMPLATE.md",
  "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
  "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-12-user-facing-docs/DEFERRED.md",
] as const;

/**
 * Live, current-state files inside the archive globs.
 *
 * Three families, each discovered by SHAPE rather than enumerated, so a new one is
 * covered the day it lands:
 *   - any `DEFERRED.md` under the plans tree (a deferral is a commitment),
 *   - any `README.md` under `docs/superpowers/**` (whole-diff R3: these are
 *     catalogs and subsystem indexes — they describe what exists NOW, so a stale
 *     entry in one is a defect, not a record),
 *   - the explicitly named documents in CURRENT_STATE_CARVE_OUTS.
 */
export function isLiveLedger(file: string): boolean {
  if ((CURRENT_STATE_CARVE_OUTS as readonly string[]).includes(file)) return true;
  if (file.startsWith("docs/superpowers/") && file.endsWith("/README.md")) return true;
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
    file: "BACKLOG-archive.md",
    text:
      "**Description:** M5-D7 extracted the canonical accent-fill button chrome (`bg-accent` + `text-accent-text` + `hover:bg-accent-hover` + focus-ring + disabled treatment) into one atom and migrated the **8 admin call sites** the deferral named (ResolveAlertButton ×2, PendingPanelRetryButton, ReSyncButton, PublishShowButton, RunFinalCASButton, ResumeFinalizeButton, FinalizeButton, StagedReviewCard). **Census note (2026-08-03):** four of those eight call sites have since been deleted — PublishShowButton at `32fec4fac` (with `/admin/unpublished`), ResumeFinalizeButton at the Step-3 consolidation, and ResolveAlertButton and RunFinalCASButton as zero-production-importer components — and `ReSyncButton` was separately DE-MIGRATED to a ghost trigger by the modal-header reconciliation (§6.7), so the executable `MIGRATED_FILES` census in `tests/styles/accent-button-atom.test.ts` is now three: `PendingPanelRetryButton`, `FinalizeButton`, `StagedReviewCard`. That scan walks the migrated files, not the repo; repo-wide `bg-accent` coverage belongs to `tests/styles/_metaBgAccentInventory.test.ts`. A repo-wide grep at migration time found the pattern still hand-rolled in **~17 other sites** OUT OF M5-D7 SCOPE: `app/admin/error.tsx`, `app/admin/settings/error.tsx`, `app/admin/settings/admins/{error.tsx,AddAdminForm.tsx,RevokeRowButton.tsx ×3}`, `app/admin/show/[slug]/{ShareLinkCopyButton.tsx,ResetPickerEpochButton.tsx,RotateShareTokenButton.tsx ×2}`, `app/show/[slug]/unpublish/ConfirmUnpublishForm.tsx`, `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx ×2`, `components/admin/Mi11GateActions.tsx`, `components/admin/wizard/{Step1Share,Step2Verify ×2,Step3Review}.tsx`, `components/admin/settings/AddAdminDisclosure.tsx`, `components/shared/{ReportButton.tsx,ReportModal.tsx ×4}`. (Pill-badge `bg-accent text-accent-text` spans in AdminNav/NotifBell and the active-step indicators in OnboardingWizard/Step3Review/me/page are NOT buttons — they are a different, legitimate use of the token pair and out of scope for this atom.)",
    reason:
      "BL-ACCENT-BUTTON-ATOM-SWEEP's description records which call sites M5-D7 migrated. The retired names ARE the census, and the note says they are retired. Moved to BACKLOG-archive.md 2026-08-06 when the L-wave demoted the entry at its honest census (3 live in MIGRATED_FILES, not 8); the line is unchanged, only its file.",
  },
  {
    kind: "line",
    file: "BACKLOG.md",
    text:
      "| `components/admin/PerShowCrewSection.tsx` | RETIRED. Mount removed at `d70761005`; the route is now a 307 into the dashboard modal, where `CrewBreakdown` renders the roster.                                 |",
    reason:
      "Disposition table in the worked orphan entry: each row records what was retired and what superseded it.",
  },
  {
    kind: "line",
    file: "BACKLOG.md",
    text:
      "| `components/admin/ResolveAlertButton.tsx` | RETIRED. Superseded at `67ce6d082` by the bell panel's resolve control (labelled `Confirm` / `Mark resolved`, never \"Dismiss\").                                   |",
    reason:
      "Disposition table in the worked orphan entry.",
  },
  {
    kind: "line",
    file: "BACKLOG.md",
    text:
      "| `components/admin/RunFinalCASButton.tsx`  | RETIRED. Superseded at `bd214c04b`; `FinalizeButton`'s `\"finish\"` mode is the live finalize-cas path.                                                             |",
    reason:
      "Disposition table in the worked orphan entry.",
  },
  {
    kind: "line",
    file: "BACKLOG.md",
    text:
      "| `components/right-now/RightNowCard.tsx`   | RETIRED. Superseded at `b327d5eb0` by `RightNowHero`; its two regression suites were RETARGETED onto the hero first, each proven by mutation rather than assumed. |",
    reason:
      "Disposition table in the worked orphan entry.",
  },
  {
    kind: "line",
    file: "BACKLOG.md",
    text:
      "Last reconciled: 2026-08-22 \u2014 `docs/derived-numbers-provenance` graduated `BL-DERIVED-NUMBERS-IN-DOCS-ROT` as a CONVENTION with no test, and both halves of the row's own reasoning were overturned by the count it scheduled as its first step. Half one: the hand-carried set's SIZE is not measurable \u2014 three defensible readings of \"derived\" give 31.7%, 59.7% and 35.1% over the same 16 records, 653 of reading B's 725 derived figures are single-digit token collisions, and the record scoring zero under every reading is on inspection one of the best-provenanced in the corpus, binding by blob hash and indented transcript rather than by fenced block. A classifier that inverts the ranking on its clearest case measures a formatting habit, not provenance; this is rule 358's boundary-dependent-counts form arriving in documents instead of code, and the repair is the same one \u2014 stop reporting the count, shift to the predicate that survives every reading. Half two: it does not matter, because all 16 records already bind their figures to a run context and the gate the row sketched fires 23 times with a yield of ZERO. What ships is a `## Stating a figure` section in the probe directory's README, the census script as probe apparatus wired into no gate, and the probe record. The row's own near-miss is recorded rather than buried: a first pass called a 1127-vs-1173 file count live rot before reading that record's header, which dates every figure in it to its commit \u2014 checking a figure against the tree without checking it against its own record's binding is half a check. And the rot is not in the population the row scoped: three of its four measured instances happened in ledger-class documents, where the same instrument reads 3.4% against the probe records' 35.1% over five times the population, filed as `BL-LEDGER-FIGURE-PROVENANCE` and fenced against `BL-CLOSEOUT-COUNT-PROSE-DRIFT`. Prior: 2026-08-17 \u2014 `fix/shell-binding-mixed-quoted-value` graduated `BL-SHELL-BINDING-MIXED-QUOTED-VALUE`: the psql guard's assignment family reads LEXED WORDS now, and the quoting-position regex family is deleted rather than widened \u2014 declaration keywords and whole-argument quoting needed no grammar at all once words existed. The lexer had to become bash-faithful first (four escape fixes shipped as one class), which closed an R40-era documented limit as a by-product. Whole-diff review then found the repair's own class twice, both REGRESSIONS against the retired patterns and both repaired in-branch: compound-array values, and assignments inside a nested substitution body \u2014 the second a FALSE CERTIFICATION rather than a miss. Two peers are filed with their class-sweep exception named. Prior: 2026-08-17 \u2014 `fix/mutation-child-lifetime` graduated `BL-MUTATION-CHILD-LIFETIME-PARENT-DEATH`: mutation-harness children are now bounded in BOTH directions \u2014 by the parent's wall-clock ceiling while it lives, and by a perl supervisor's `getppid()` watchdog once it does not, which SIGKILLs the whole process group within one 0.5 s poll of the harness dying. The entry's own first scheduled step was answered NO and that is the load-bearing correction: the watchdog does NOT make `setpgrp` unnecessary, because the group serves the parent-ALIVE hazard and is also how the watchdog delivers its own kill, so the repair composes rather than simplifies. `childRun`'s sibling gap went with it \u2014 its `status ?? 1` catch turned a signal-killed fixture into exactly `1`, which the premise contract reads as PROVEN, and abnormal outcomes now throw. The new module is enrolled at 12/12 with an empty ledger and `scoreFloor: 1`, while the watchdog string itself is honestly CANNOT-EXPRESS (no declared operator rewrites string content) and is guarded by a live process-tree suite kept OUT of `suitePaths` so the per-mutant gate cost stays flat. Prior: 2026-08-16 \u2014 `test/execution-methods-driver-derived` graduated `BL-EXECUTION-METHODS-DERIVED-FROM-DRIVER-TYPES`: the query-submitting core of the destructive-file analyzer's `EXECUTION_METHODS` is now DERIVED from the installed postgres.js driver's own type declarations through a committed generated module, with freshness armed both locally (a `pretest-gen` MANIFEST row) and in CI (an x-audits step that fails on a stale COMMIT). The composed set did not move \u2014 the same ten members ship \u2014 because the deliverable is drift visibility, not a different answer. The entry's own equality claim turned out to be FALSE under probe and the correction is the load-bearing part: the rule yields FOUR members, not ten, so what ships is the IMPLICATION (every method typed as returning `PendingQuery`/`PendingRequest`/`ListenRequest` is an execution site) and the other six are hand-justified with per-member citations rather than contorted into derivation theater. The surface was enrolled in the source-mutation gate BEFORE the first diff-review round and scores 11/11 with an empty ledger \u2014 its one enrolment-run survivor was repaid with a fixture, not blessed \u2014 which matters because this row exists precisely to record what that gate cannot see: the surface sat at 1.00 with zero unaccepted survivors while `.file()` was missing from the set, since a missing member of a `Set` literal is not a mutation of code that exists. Prior: 2026-08-16 \u2014 `test/psql-scan-mutation-enrolment` graduated `BL-PSQL-SCAN-MUTATION-ENROLMENT`: the psql startup-file scanner is enrolled in the source-mutation registry at `scoreFloor` 1.00 with an empty unaccepted-survivor set \u2014 48 mutants, 30 killed, 18 equivalent, 0 accepted-gap. The row's own four starters were corrected by measurement rather than argument, in both directions: the `token.length > 1` starter is a coverage gap but NOT a source defect (the original already reads a bare `-` as the DBNAME positional), and the `{1,2}` flag-regex starter turned out to be three sites with two answers \u2014 two killed, and one equivalent because its follower character class already contains a dash. `scan.ts` itself is untouched by the arc, which is the outcome the spec's original-misbehaves bar was written to produce. Both cross-model review rounds refuted a written argument with a probe it had never been checked against, and each refutation became a test rather than a re-argued row \u2014 which is why the surface ships with no accepted gap at all. `BL-SHELL-BINDING-MIXED-QUOTED-VALUE` and `BL-PREMISE-SCAN-DESCRIBE-LOCAL-EXTENTS` are filed in the same PR. Enrolment also caught the guard catching its own paperwork \u2014 quoting concrete shell spellings in `registry.ts` made that tracked file a reported psql binding. Prior: 2026-08-15 \u2014 `feat/mutation-playwright-component-mode` graduated `BL-MUTATION-HARNESS-PLAYWRIGHT-COMPONENT-MODE` and `BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT`, closing a circular wait: the enrolment row sat at WATCH on a trigger \u2014 \"the harness gains a Playwright/component-mutant mode\" \u2014 that no ledger row scheduled until the sibling was filed, and both closed in the arc that built the mode. The harness gained a browser-mutant mode (explicit per-surface edit lists, a serial runner with baseline and control brackets, three overlay layers driven by ONE env var, and a nightly non-required CI job), and its first customer enrolled at 19/19 killed, score 1.0, empty unaccepted-survivor set, control killed, targets byte-identical \u2014 19.1 min in CI against a 60-min cap. The operator family is CLOSED and hand-enumerated rather than a generic recognizer, ratified up front because each widening of a recognizer is a bigger target for the next review round. Verdict integrity is the part neither row anticipated: a non-zero child exit is not evidence by itself, so every child runs against an overlay sentinel deleted before it and re-checked after, a Playwright child additionally needs a fresh json report recording at least one executed test, and anything else raises `MutantRunInfraError` and is never scored \u2014 the failure this closes is the worst one available to a mutation harness, where a systematically dead overlay reports a PERFECT score with every other gate condition still passing. Six defects surfaced that neither row described, each of which would have shipped a wrong NUMBER rather than a loud failure: `String.replace` expanding `$&`/`$1` in a string replacement so a mutant applies as text nobody wrote; macOS resolving `/var` through a symlink so the overlay served clean disk text while every other signal read live; the new gate silently joining the parser harness's whole-project sweep, a job that installs no browser; the mixed-kind suite list being load-bearing, since one payload mutant is killed by the vitest suite alone and a Playwright-only registry would have enrolled it as a guaranteed survivor; green-but-empty as the no-tests trap, closed by asserting a non-zero executed count at baseline; and a latent ambient-config bug in the vitest partition guard that this arc's own command exposed, swept to four sites and pinned by a source scan because every other case there reads a stubbed config and would pass a revert whenever the ambient is clean. The mode's own two pure modules are enrolled as source-mutation surfaces before the arc's first review dispatch; what the registry cannot express \u2014 the spawn boundary needing a real Playwright child \u2014 is stated rather than enrolled symbolically. Prior: 2026-08-15 \u2014 `feat/spec-lint-intent-red` graduated `BL-SPEC-LINT-CITATION-INTENT` and `BL-SPECLINT-RED-EXECUTABILITY-ARM`: `spec:lint` now says whether a citation resolves to the RIGHT file, and the task-marker contract's red-then-green cycle is declared and checkable. Both rows' own sketches were corrected by measurement rather than argument. The citation row asked for a per-case demotion; the corpus said the whole arm must be advisory, because the strictest content condition still fires on 15 of 135 CORRECT citations of a merged plan, and a hard code with an 11% false-positive floor gets waived reflexively. Detection was never the gap either \u2014 the shipped advisory already fired on most of the wrong citations and on 69 spans of the correct plan, so what shipped is discrimination (an enclosing-declaration rescue) and actionability (relocation hints naming which other file the doc itself cites does hold the identifiers). The red row's exempt branch for author-written reds became a DECLARED `red-state=authored` + `red-target=`, because no recognizer over task prose can decide whether a `red=` is asserted-red-now or authored-by-the-task. Validated against the citations that actually burned rounds: the fixture corpus is distilled from the KNOWN-BAD sync-log plan, not the corrected one, because the human repair of that defect made the mirror-image error on eight citations. Two wrong citations are a documented recall ceiling \u2014 a vocabulary-sharing sibling is indistinguishable by content \u2014 and are pinned as premise-guarded silent cases. The mutation gate found 26 unaccepted survivors on first run; fourteen were repaid by tests, one by a source simplification, and the rest are argued reachability rows. Prior: 2026-08-15 \u2014 `fix/changes-feed-batch-flake` graduated `BL-CHANGES-FEED-MODAL-BATCH-FLAKE`: the entry's own first-thing-to-check was checked and REFUTED. There is no cross-spec fixture collision \u2014 both CI failures hit the first spec executed, before any other spec had touched the database \u2014 and the real cause, measured from the failing runs' job logs, is a transient gateway 502 on the foreground snapshot RPC that the loader deliberately throws to the `/admin` error boundary, where a wait for the modal alone starves. The row's \"passes standalone, fails in batch\" evidence was a sampling artifact: standalone ran only locally, where that fault environment does not exist, so the flake correlated with \"batch\" by measurement design. Two defects the row did not describe were found on the way: the fatal log path rendered its PostgREST error as `'[object Object]'`, which is why the 502 had to be attributed through a same-class witness 62 seconds later, and a recovery on a GREEN run would have left no trace an operator could see \u2014 the list reporter prints no annotations and a green run uploads no artifact \u2014 so the executed-count oracle now prints every `infra-recovery` row plus a total. Filed `BL-MODAL-WAIT-BOUNDARY-HELPER-ADOPTION` and `BL-SNAPSHOT-READ-TRANSIENT-502-POSTURE`. Prior: 2026-08-15 \u2014 `fix/sync-observability-gaps` graduated `BL-MANUAL-SYNC-UNEMITTED` and `BL-PENDING-RETRY-EXISTING-SHOW-THROWS`: manual sync now records every terminal outcome, and the existing-show pending-ingestion retry executes real sync work instead of throwing `SyncInfraError` before touching anything. Both rows' own prescriptions were partly rejected with reasons recorded in the archive \u2014 a per-branch emit is the shape that failed (the single site switches exhaustively, so a new outcome variant is a compile error until the mapping says what it records), and per-route tail injection is the hand-enumerated cover that came up short five times in the parent arc (one default at the shared `applyStaged` chokepoint covers both live routes and every future caller). Three things the rows did not describe were found by sweeping rather than reading: `toResult` fell through to an implicit `null` that turned an unhandled phase-1 variant into a clean pass, four terminal branches of the SHARED pipeline wrote no row at all (three fetch-failure arms plus the pull-sheet-override TOCTOU skip, all of which benefit cron identically), and adding the production sink default made every existing applied-path unit test open a real postgres connection \u2014 probed, 14 rows written to the shared local DB, deleted, zero after the injections landed. Emit placement is load-bearing twice: post-commit, because attribution resolves in the sink's subselect and an in-tx emit is permanently NULL-attributed at show birth; and keyed on a TRACKED sink, because a throw after an outcome row already landed must add nothing rather than file a `parse_error` over it. The two live probes are why this shipped correct \u2014 the retry defect survived because the shipped tests inject `processOneFile_unlocked` itself, and the env-bound probe was verified to discriminate by re-injecting the defect. Prior: 2026-08-11 \u2014 `fix/tap-target-inline-controls` graduated `BL-TAP-TARGET-INLINE-TEXT-CONTROLS`: the per-site prose-vs-chrome judgment the row was filed to obtain, ratified by the user 2026-08-10 as **3 exempt / 5 repaired**. The exempt three are pinned in SOURCE rather than in a browser \u2014 an exempt site's contract is \"unchanged source\", and a rendered box cannot say whether the exemption is still the ratified decision or an accident nobody recorded; the guard pins the comment AND the class string and was proven against four mutants. The repaired five are pinned by real-browser rects on the PRODUCTION routes (red observed first at 16.80 / 19.36 / 17.05 / 16.80px), wired into `lifecycle-layout-e2e.yml` behind an execution oracle that job did not previously have. Two of the row's own site labels were wrong and were corrected from the live tree. Two measurement lessons are recorded in the archive entry because each produced a wrong answer first: `boundingBox()` is viewport-relative and Playwright scrolls between reads, which manufactured a phantom 5.4px overlap, and the container change made to \"fix\" that phantom was reverted once a mutant showed the suite stayed green without it. The invariant-8 gate's one P1 was refuted by measurement against a stale contrast comment in `app/globals.css`; four follow-ups filed. Prior: 2026-08-04 \u2014 `feat/harness-font-fidelity` (PR #705) graduated `BL-HARNESS-FONT-FIDELITY`: the face is declared once in `app/fonts.css` over the committed binary and read by BOTH Next roots AND by `compileEntryCss`, so the 32 standalone harnesses render what the product renders instead of the ambient host font. The entry's own count of 31 was right when filed and is 32 as shipped \u2014 the browser guard this work added is itself a caller, found by the fail-by-default wiring meta-test rather than by anyone remembering. The spec it asked for was written and its central premise EXPIRED before implementation: drafted against `next/font/google` with seven Google v20 subsets, while `main` had already moved to `next/font/local` over an upstream v4.1 subset, so shipping \u00a73.3 verbatim would have stripped `ss04`/`zero`/`opsz` and reverted `BL-INTER-NUMERAL-DISAMBIGUATION`. User-ratified 2026-08-04 to one face over the existing bytes, with the stale sections marked SUPERSEDED in place because `consistency.mjs` cross-checks the document's own counts. Four claims were overturned by measurement rather than argument and each is corrected where it was wrong: the mutation matrix found the guard never compared the fallback's override VALUES; CI found a Linux/macOS rasterization gap (hinted 132px vs geometric 130.09375px) root-caused in the pinned container rather than papered over with a wider tolerance; the impeccable critique found a rationale written into five surfaces that this branch's own post-step had invalidated; and the audit found the binary had lost its one-year immutable cache on the move out of `.next/static/media/`, now restored by a content-hashed filename plus a `next.config.ts` header. Prior: 2026-08-04 \u2014 `fix/apply-undo-audit-fidelity` (PR #697, merge `644f8bb06`) graduated `BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP`, `BL-IDENTITYLINK-LANDED-VS-REQUESTED` and `BL-UNDO-SELECTIONS-RESET-AT-DROP`. The notice and feed now derive from rename pairs that actually LANDED, with unlanded ones recorded as a durable `IDENTITY_LINK_RENAME_UNLANDED` event \u2014 and that row's own premise was partly wrong: the feed never consumed the requested `identityLinkRenames` at all, it re-derived its own pairs from `triggeredItems` with NO accept gate, a wider defect than the row described. The notice needed a two-arm split rather than a swap, because feeding landed pairs to arm (c) as well would have fired a FALSE capability-loss notice for every pair whose source row survived; arm (c) now suppresses a loss only when the source SURVIVED, which also surfaces a real loss the old suppression hid. The roleFlagsNotice row named ONE discard site and the class sweep found FOUR (finalize-cas, ordinary finalize, `runManualStageForFirstSeen`, and the pending-ingestion retry, which bypasses the locked wrapper's post-commit tail entirely), all repaired through one shared `lib/sync/emitRoleFlagsNotice.ts` and flushed in a `finally` after the outer transaction at three sites \u2014 including the STREAMING finalize-cas handler, the one real operator traffic reaches; the structural guard against a fifth is DESCOPED and refiled as `BL-ROLEFLAGSNOTICE-DROP-GUARD`. `selections_reset_at` survives an undo, the real fix being to capture the successor's marker BEFORE the delete \u2014 the common rename path takes the clean-INSERT branch, so a merge living only in `ON CONFLICT` would never have run \u2014 with `mi11_approve_hold` repaired as a second producer dropping the column at two sites, and two historical shapes left unrescuable as documented limits. The same branch filed `BL-CAPABILITY-LOSS-SURVIVING-ROW-FALSE-POSITIVE`, `BL-SHADOW-REBUILD-EXHAUSTED-EMIT-PLACEMENT` and `BL-CODE-ENUM-PROVENANCE-COMMENT-BLIND`. Prior: 2026-08-03 \u2014 `feat/inter-numeral-disambiguation` graduated `BL-INTER-NUMERAL-DISAMBIGUATION` by changing the FONT rather than the CSS: the row's premise was false. Probed live before drafting \u2014 the Inter build Google Fonts serves has the character variants stripped (`calt ccmp dnom frac kern locl mark mkmk numr pnum tnum`, `wght` axis only), so the requested `\"zero\" 1, \"cv05\" 1` would have rendered nothing, exactly as the `\"cv11\" 1` beside it had been rendering nothing since `78662acb5` (2026-05-03). Two defects in the row itself besides: `cv05` never touches capital `I`, and `ss04` is Inter's own disambiguation set covering both letterforms. Shipped a latin + latin-ext SUBSET of the upstream v4.1 release (173 KB, built by `scripts/subset-inter.sh` from a checksum-pinned input, OFL alongside) via `next/font/local` \u2014 verbatim at 344 KB was the gate decision until the impeccable audit measured it costing FCP +136-164ms and a fallback-to-Inter swap landing 3.7s in on slow 4G. `ss04` at `html`, `ss04`/`tnum` on the tabular rule, and `zero` on a NARROWER `.code-value` class, because `.tabular-nums` turned out to sit on whole prose sentences including the Right Now hero's 30px bold h2. `ss04` is REPEATED on each rule because `font-feature-settings` inherits as a whole value, not a merged list. Fourteen false claims corrected across `DESIGN.md`, the font-binding spec and plan, and eight source comments, including that plan's own P3 disposition claiming the binding \"deterministically activates Inter's alternates \u2026 for the first time\" (it activated nothing). New guard `tests/styles/fontFeatureAvailability.test.ts` derives the font path from `app/fonts.ts` and fails the build on any tag the loaded binary cannot honor, with a regression proof against the committed Google binary; in the browser `zero` needs a PIXEL oracle because `zero` and `zero.slash` share an xAdvance of 1292, so no width assertion can ever see it. Cross-model spec review round 1 returned BLOCKING with 7 findings, five confirmed by probe and all repaired. Prior: 2026-08-03 \u2014 `feat/needs-attention-holds-rollup` graduated `BL-NEEDS-ATTENTION-HOLDS-ROLLUP` (the cross-show open-holds read plus the fourth needs-attention stream across page, inbox, badge, mobile chip, and digest; spec `docs/superpowers/specs/2026-08-03-needs-attention-holds-rollup-design.md`, plan `docs/superpowers/plans/2026-08-03-needs-attention-holds-rollup.md`). Prior: 2026-08-03 \u2014 `feat/sync-feed-undo-announce` graduated `BL-SYNC-FEED-UI-POLISH` and all three children. `BL-SYNCFEED-UI-1` shipped, with its own premise corrected: the note's proposed in-button `aria-live` region cannot work, because a successful undo flips the row out of `status='applied'` and unmounts the button before assistive technology reads anything. Six adversarial rounds then refuted every surface-level owner in turn (the group empties, the strip returns null, the dashboard returns a different tree, the feed is swapped for its error rendering), and the vector was settled by an executable spike rather than a seventh prose argument. The channel lives in `AdminAnnounceProvider`, mounted by the admin layout AND by `ReviewModalShell` \u2014 a modal needs its own, since content outside an `aria-modal` dialog is excluded from the accessibility tree. `BL-SYNCFEED-UI-3` graduated as already-shipped (fixture corrected at `c3920fe6a`); `BL-SYNCFEED-UI-2` ratified as untriggered with its re-open trigger preserved. The same work fixed a class defect the sweep found: all three feed action buttons rendered their failure card by conditional mount, so failures were silent to AT too. Filed `BL-FEED-BUTTON-SUCCESS-ANNOUNCE`, `BL-BULK-UNDO-ANNOUNCE-UNMOUNT`, and `BL-ANNOUNCE-REGION-UNMOUNT-CLASS`. Prior: 2026-08-03 \u2014 `feat/modal-freshness-cue` graduated `BL-MODAL-REALTIME-UPDATED-CUE` as SHIPPED: the published review modal now flashes the panel card of every registry section whose CONTENT changed across a realtime-driven reconcile, plus an sr-only announcement from the same detector, so a swap under the reader is attributable instead of silent. The entry's premise was wrong and is corrected in the archive: the 2026-07-19 realtime spec ratified that the BRIDGE renders `null`, never that the surface it refreshes must stay silent, so this was a new design decision rather than a reversal. The user chose flash-then-fade directly. Two adversarial rounds (the second split in half) returned BLOCKING and were repaired: the projection missed routed warnings, routed use-raw state, section anchors and attention items, and separately OVER-hashed the warnings panel and non-rendered decision fields; the mount baseline lived in a ref that abandoned renders consumed; and an aborted close hides the shell without unmounting the state owner. Prior: 2026-08-03 \u2014 `chore/scanner-precision-cluster` graduated `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN` and `BL-LEDGER-GUARD-BODY-DEFINED-IDS`, the two entries whose shared shape is a static scanner opening too small a set of files while a hand-maintained residue covers the gap. Both residues had already rotted: the enum's four-code list held one code that was long since absorbed while ELEVEN real \u00a712.4 codes were dark, and the ledger guard's eight `KNOWN_DANGLING` rows were never debt at all. The scan is now type-aware and fail-closed (58 codes, 0 unresolved, 44 capture-linked skips) after six adversarial rounds established that every syntactic mechanism \u2014 root widening, type-stripping, written-return-type matching \u2014 is defeated by a spelling; the ledger guard now resolves body-defined sub-item ids under three corpus-measured conditions. One documented limit is fenced rather than overclaimed and filed as `BL-CATALOG-PARTITION-WARNING-CLASS`: provenance through `any` is undecidable, so the real closure is an enumerated catalog, not a better scanner. Prior: 2026-08-03 \u2014 `feat/font-binding-modal-freshness-cue` graduated `BL-HEADER-FONT-FALLBACK-WRAP`: the browser check it asked for refuted its own stated doubt (Next 16 registers the literal family name, so the crew import DID bind) and surfaced a wider finding \u2014 the product rendered two type families across its trees while `DESIGN.md` \u00a72.1 commits to one, because the loader had never been wired at the root. Shipped as one shared loader instance in `app/fonts.ts` imported by BOTH Next roots (the crash screen replaces the root layout, so it was otherwise left behind), with `--font-sans` binding next/font's metric-matched fallback face so the swap window stops reflowing ~10%. Filed `BL-HARNESS-FONT-FIDELITY` (the 31 standalone harnesses have no Next runtime and keep measuring the ambient host font \u2014 zero cost today, needs a spec not a patch) and `BL-INTER-NUMERAL-DISAMBIGUATION` (impeccable P3). Prior: 2026-08-03 \u2014 `chore/orphan-components-lead-prose` settled the two entries the copy/dead-code sweep left behind. `BL-LEAD-CAPABILITY-PROSE-STALE` graduated: both prose claims turned out STALE rather than intentional \u2014 the `capabilityTransitions` line is a verbatim quote that stopped being verbatim at `e348c81ca`, and MI-9's \"admin/ops\" clause was inherited from \u00a712.4 copy strings whose every other instance had already been retired or corrected. A third instance the literal sweep could not see (`lib/sync/phase2.ts`, a semantic variant in production source) was corrected with them, and two guards shipped in the same commits: `capabilityHeaderParity` extracts the expected flag set from `scopeTiles.ts` source, and `capabilityClaimProse` scans the MI-9 rows AND every `.ts`/`.tsx` under `app`/`components`/`lib` with a positive-claim recognizer. `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS` was AMENDED, not archived: four components retired (each with a named superseding commit and live successor; `RightNowCard`'s two regression suites were retargeted onto `RightNowHero` and each proven by mutation before the deletion), and `WrappedTile` stays as a DECIDED retention \u2014 deleting it would orphan `TileErrorBoundary` and `TileServerFallback` rather than shrink the ledger, and the orphan guard now asserts its reason says so. Filed `BL-CAPABILITY-MATRIX-FINANCIALS-PREDICATE` (the matrix models five predicates, the code has six) and `BL-BELLPANEL-DISMISS-COMMENT-DRIFT` (six comments name a label the panel stopped rendering). New guard `tests/docs/retiredIdentifierReferences.test.ts` walks every tracked file for references to what was retired, keyed by LINE CONTENT with reasoned exemptions \u2014 three adversarial rounds each found references a hand-curated census had missed, so the census is now a walk. Prior: 2026-08-03 \u2014 `docs/close-v1-override-wont-build` graduated `BL-VERSION-AMBIGUOUS-V1-OVERRIDE` as RESOLVED \u2014 WON'T BUILD: no admin force-classify override gets built, now or trigger-gated. The row's premise was false as stated. `v1` is a fallback bucket, not a confirmed legacy template (`lib/parser/schema.ts:37`; the registry entry at `lib/parser/schema.ts:53` carries no `requires` array, so nothing positively identifies a v1 sheet), and its \"a genuine legacy-v1 sheet has neither resolution\" conflated _no markers registered today_ with _no registrable structure_ \u2014 a real legacy sheet, once actually seen, is indistinguishable from a genuinely-new template, and the gate spec's \u00a77.1 resolution #2 (developer registers the markers) is not limited to new templates. Probed: all 10 committed fixtures classify confidently (6\u00d7 v2 at 7/0, 4\u00d7 v4 at 8/0), zero ambiguous, zero v1. The override would convert a signaled failure into a silent one, inverting the preparedness-audit posture, and it serves none of the four indistinguishable bucket occupants better than their existing disposition. Re-open trigger recorded in the archive entry, conjunctive: a real legacy sheet surfaces AND marker registration proves impossible. **Current state after this and the same-day `docs/graduate-bl-unpublish-to-held` graduation: six of the eight rows the 2026-08-02 segment below enumerates remain open** (`BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`, `BL-HEADER-REACT-RECONCILE-HARNESS`, `BL-PG-CRON-HOST-ASSERTION`, `BL-NEEDS-ATTENTION-HOLDS-ROLLUP`, `BL-RESYNC-STAGED-REVIEW-UI`, `BL-STEP3-FULL-CREW-PREVIEW`); that segment's own \"Eight open rows here\" count is left as written, because it describes the state at the 2026-08-02 reconciliation and demoting it behind `Prior:` is what marks it as history. Prior: 2026-08-03 \u2014 `docs/graduate-bl-unpublish-to-held` graduated `BL-UNPUBLISH-TO-HELD` as already-shipped: the 2026-07-01 published toggle (`unpublish_show` RPC in `supabase/migrations/20260701000000_published_toggle_unpublish_show.sql`, driven by `setShowPublishedAction(slug, false)` from the admin show review modal, commit 945bd4ef0) is exactly the published\u2192Held inverse the row asked for \u2014 the row's 2026-08-02 \"Verified: no such RPC exists\" was a false verification, and its premise that the M12.13 token-unpublish archives was stale too (both unpublish paths are pure `published=false`). A 10-point audit of the shipped surface before graduating found no functional gap and one gate-scope finding, filed as `BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED` (the validation-schema-parity gate covers tables\u00d7columns only, never functions \u2014 no current drift, probed live). Prior: 2026-08-02 \u2014 `chore/copy-deadcode-sweep` graduated three copy-and-dead-code entries (`BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT`: the \u00a712.4 helpfulContext no longer claims either capability role unlocks admin access \u2014 probed, `is_admin()` never reads `role_flags` \u2014 landed as a five-surface lockstep in one commit plus the row's `longExplanation` and the `scopeTiles` header comment it contradicted; `BL-ADMIN-PARSEPANEL-ORPHANED`: the component deleted behind a new zero-production-importer guard that asks the compiler for both module edges and their targets, with the five peers the class sweep found filed as `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS`; `BL-HELP-STRIP-COPYLINK-STALE`: the per-show help prose now names the Share link button, no screenshot regenerated). Also filed `BL-LEAD-CAPABILITY-PROSE-STALE` for the two remaining prose claims that need a contract read. Prior: 2026-08-02 \u2014 `docs/dangling-citation-ledger-filing` took the referential-integrity guard's `KNOWN_DANGLING` debt map from 50 rows to 9, filing 39 real entries and correcting one citation (`BL-FLOW4` came off as a side effect: with its family now defined, the stem suppresses as a family reference). Eight open rows here (`BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`, `BL-HEADER-REACT-RECONCILE-HARNESS`, `BL-PG-CRON-HOST-ASSERTION`, `BL-NEEDS-ATTENTION-HOLDS-ROLLUP`, `BL-RESYNC-STAGED-REVIEW-UI`, `BL-STEP3-FULL-CREW-PREVIEW`, `BL-UNPUBLISH-TO-HELD`, `BL-VERSION-AMBIGUOUS-V1-OVERRIDE`) plus `BL-LEDGER-GUARD-BODY-DEFINED-IDS` as the handoff for the eight ids defined in a parent entry's BODY, which stay body-defined by decision. Thirty-one went straight to `BACKLOG-archive.md` at their terminal state: eleven already shipped (the row was deleted at close instead of graduated, twice on a spec's explicit instruction), fifteen were impeccable-gate deferrals whose promised row was never opened and whose deferral has since closed, and five name a branch that was never taken. One citation was corrected instead of filed: `BL-SYNC-FEED-UI-POLISH` pointed at a backlog-id family that exists nowhere in the repo. The 9 rows left are the eight body-defined ids above plus `BL-RESOLVED`, a prose placeholder in an audit doc, both handed to follow-ups. Prior: 2026-08-02 \u2014 `test/agenda-fold-seeded-e2e` graduated `BL-AGENDA-FOLD-NO-SEEDED-E2E` (the per-viewer agenda day fold exercised through the REAL crew page: seeded `agenda_links` + two complementary date-restricted viewers, each an email-matched Google session against its own seeded show, plus an unrestricted admin control in `stage-restricted-crew-schedule.spec.ts`, wired into `crew-e2e.yml` under desktop-chromium behind a run-command wiring guard) and `BL-AGENDA-A11Y-WEBKIT-COVERAGE` (grep-scoped `standalone-webkit-a11y` project resolving exactly one test, structurally pinned, plus webkit installs and a regenerated baseline). Prior: 2026-08-02 \u2014 docs/citation-rot-financials-vocab graduated BL-DANGLING-CITATIONS-RETIRED-WORKFLOW (15 dangling citations to the seven retired e2e workflows rendered as prose across 10 docs, class-swept per the AGENTS.md bug-shape rule; spec:lint target-class findings now zero tree-wide) and BL-MASTERSPEC-FINANCIALS-VOCAB (14 master-spec financials-entitlement claims reconciled to LEAD \u222a FINANCIALS \u222a admin, line-count-neutral; 4 seed exclusions + 8 window-probe non-claims ratified in docs/superpowers/specs/2026-08-02-docs-hygiene-citation-rot-financials-vocab-design.md; specs README line-count note corrected), and filed BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT (\u00a712.4 copy over-grant, deferred to the next \u00a712.4 copy pass). Earlier reconciliations (deduplicated 2026-08-02 \u2014 this line had accumulated 40 segments, 26 of them verbatim repeats of merge-concatenated chains): **[BACKLOG-archive.md \u00a7 Reconciliation log](./BACKLOG-archive.md#reconciliation-log)**.",
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
      "* consolidation, ResolveAlertButton and RunFinalCASButton retired 2026-08-03,",
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
      "* RunFinalCASButton was retired 2026-08-03 (see the note below).",
    reason:
      "Records which surfaces this suite lost and when; the names are the history the count depends on.",
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
      "* atom — plus PublishShowButton, ResumeFinalizeButton, ResolveAlertButton and",
    reason:
      "Retirement provenance for the atom's drift history; naming what left keeps the eight-site census checkable.",
  },
  {
    kind: "line",
    file: "tests/components/atoms/AccentButton.test.tsx",
    text:
      "* RunFinalCASButton, all since deleted, and ReSyncButton, de-migrated).",
    reason:
      "Second half of the same census sentence.",
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
