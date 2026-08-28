# Wizard Sheet-warnings Ignore + Report Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-warning Report + Ignore (and Un-ignore) controls in the onboarding wizard review modal's Sheet warnings panel, with a durable staged ignore store for first-seen rows, a finalize carry into `public.ignored_warnings`, and every wizard warning count reading the active partition.

**Architecture:** Server derives a per-row `WizardWarningModel` (active/ignored index partition + report surface ids) in two phases (sync identity capture in `assembleStep3Row`, async enrichment after assembly). The backend forks by row linkage: LINKED rows reuse the slug-keyed ignore routes; FIRST-SEEN rows write `pending_syncs.ignored_warnings` through one new admin server action under `withShowLock`, carried to the durable table at finalize on both apply paths. Chrome reads the partition through exactly two choke points plus a structural guard.

**Tech Stack:** Next.js 16 RSC + server actions, Supabase/postgres, Vitest (+ one Playwright-free jsdom suite set — no fixed-dimension parents are introduced).

**Spec:** `docs/superpowers/specs/2026-08-28-wizard-warning-ignore-controls.md` (spec stage closed at `c1390fba5`, 5 adversarial rounds). The plan argues from the spec; executors read both. Spec §-references below are to that file.

## Global Constraints

- TDD per task: failing test → minimal implementation → green → commit (invariant 1). Commit style `<type>(<scope>): <summary>`.
- Advisory lock: the staged action acquires ONLY via `withShowLock` (JS wrapper, `lib/sync/lockedShowTx.ts:88`); its in-lock body calls NO RPC (invariant 2 single-holder; Task 6 pins it).
- `ignored_by` is the canonicalized admin email (invariant 3; the durable table CHECK `supabase/migrations/20260702120000_ignored_warnings.sql:8-9`).
- No raw error codes in UI (invariant 5): the client maps every failure arm to the existing failCopy strings in `DataQualityWarningControls`.
- Supabase call-boundary discipline (invariant 9) on every new read/write; new helpers follow the registered-helper pattern or carry `// not-subject-to-meta: <reason>`.
- Invariant 10: the staged action gets its TWO `AUDITABLE_MUTATIONS` rows + success-branch behavioral proof IN THE SAME COMMIT as the action (Task 5 — a commit must never leave the discovery meta-test red). Emits post-commit, outside the lock tx.
- Invariant 8: this diff touches `components/` and `app/` UI — the impeccable v3 dual gate (both halves) runs before the whole-diff review (closeout §12). The two halves are deliberately not NAMED in this document until the closeout commit: the invariant-8 closeout meta-test (`tests/docs/_metaInvariant8Closeout.test.ts`) reds any plan unit naming both halves without a machine-valid `impeccable-gate:` marker, and the truthful marker can only be written once the gates have RUN (the crew-wifi plan's "no placeholder until then" precedent). The closeout commit adds the full naming AND the valid marker together.
- Heavy phases under `pnpm heavy` (full vitest suite, builds); DB slot from bl-orch before any full local suite / e2e; scoped file-list vitest runs stay unwrapped.
- The arc NEVER merges: closeout ends at READY (CI green at the shipping head + APPROVE), reported to bl-orch.
- Fleet: pane/agent labels stay the bare branch name; stage-boundary reports to bl-orch pane `w15:p2`, under 600 chars.

## Pre-verified facts (citation pass, run 2026-08-28 in this worktree)

Advisory-lock holder sweep — the §2.6 derivation, run verbatim (`rg -n 'withShowLock[<(]' app lib`, comment lines dropped):

```
app/admin/onboarding/_actions/useRawStaged.ts:128   direct acquirer (generic form)
app/admin/show/[slug]/_actions/useRaw.ts:83         direct acquirer (generic form)
lib/sync/lockedShowTx.ts:88                          the wrapper itself
lib/sync/runOnboardingScan.ts:1131                   acquires via injected recovery.withShowLock
lib/sync/promoteSnapshot.ts:370,582                  direct acquirers
lib/sync/unpublishShow.ts:327                        direct acquirer (generic form)
lib/sync/runScheduledCronSync.ts:525,617             type-position references (not acquirers)
lib/sync/runScheduledCronSync.ts:1948                direct acquirer (generic form)
lib/sync/assetRecovery.ts:104                        type declaration (not an acquirer)
lib/sync/assetRecovery.ts:535,614                    acquire via injected deps.withShowLock
lib/sync/assetRecovery.ts:885,890                    the deps implementation delegating to the wrapper
```

Not acquirers, verified: `lib/onboarding/applyRescanDecisionUnderLock.ts` (callee-handed tx), `lib/showLifecycle/archiveShow.ts` (delegates to a self-locking RPC — layer (b)). The new action joins the layer-(a) set and Task 6 pins its body RPC-free.

Other anchors (all read this session): `useRawStaged` result union `app/admin/onboarding/_actions/useRawStaged.ts:45-48`, `warningsOf` coercion `app/admin/onboarding/_actions/useRawStaged.ts:64-70`, lock call `app/admin/onboarding/_actions/useRawStaged.ts:128`. `stagedByDfid` map shape `components/admin/OnboardingWizard.tsx:478-489`, pending select `components/admin/OnboardingWizard.tsx:380`, shows select `components/admin/OnboardingWizard.tsx:425-433`, loose parse coercion `components/admin/OnboardingWizard.tsx:497-499`, row map `components/admin/OnboardingWizard.tsx:545-566`. `StagedPreviewForRow` `lib/admin/assembleStep3Row.ts:75-84`; `matchedCandidate` declared `lib/admin/assembleStep3Row.ts:137`, assigned `lib/admin/assembleStep3Row.ts:148` and `lib/admin/assembleStep3Row.ts:162`. `Step3Row` `components/admin/wizard/Step3Review.tsx:83-155`; `hasReviewablePreview` `components/admin/wizard/Step3Review.tsx:776-779` (mirrored `lib/admin/step3Buckets.ts:53-61`); `arr()` `lib/admin/step3Buckets.ts:39`; `gapWarnings` `lib/admin/step3Buckets.ts:47`; consumers `lib/admin/step3Buckets.ts:68`, `lib/admin/step3Buckets.ts:94`, `lib/admin/step3Buckets.ts:114`. `warningsBySection` `lib/admin/step3SectionStatus.ts:90-96` (mints entries with full-array index, warn-only). Attention memo `components/admin/wizard/Step3ReviewModal.tsx:313-329`; `pillInteractive` `components/admin/wizard/Step3ReviewModal.tsx:340`; menu mount `components/admin/wizard/Step3ReviewModal.tsx:549-643`. Surface memo `components/admin/review/ShowReviewSurface.tsx:282-284`; warnings dot `components/admin/review/ShowReviewSurface.tsx:343`; anchor selector `components/admin/review/ShowReviewSurface.tsx:568`; announce gate `components/admin/review/ShowReviewSurface.tsx:864-866`; staged callouts `components/admin/review/ShowReviewSurface.tsx:1149-1156`. Panel `WarningsBreakdown` `components/admin/wizard/step3ReviewSections.tsx:2885-3230` (clean/empty states `components/admin/wizard/step3ReviewSections.tsx:2985-3001`; row loop `components/admin/wizard/step3ReviewSections.tsx:3063`; jump attributes `components/admin/wizard/step3ReviewSections.tsx:3078` and `components/admin/wizard/step3ReviewSections.tsx:3082`; boundaries `components/admin/wizard/step3ReviewSections.tsx:3198-3215`; registry warnings row + railCount `components/admin/wizard/step3ReviewSections.tsx:4756-4785`). `DataQualityWarningControls` props `components/admin/DataQualityWarningControls.tsx:10-17`; fetch `components/admin/DataQualityWarningControls.tsx:63-70`; fieldRef `components/admin/DataQualityWarningControls.tsx:99-104`; ignore gate `components/admin/DataQualityWarningControls.tsx:53` and `components/admin/DataQualityWarningControls.tsx:85`. `partitionByIgnored` `lib/dataQuality/partitionByIgnored.ts:4-16`; `warningFingerprint` + `buildReportSurfaceId` `lib/dataQuality/warningFingerprint.ts:9-20`; `stableWarningKeys` `lib/dataQuality/warningIdentity.ts:43-52`. Report resolver `lib/reports/submit.ts:299-307`; staged support `lib/reports/submit.ts:279` and `lib/reports/submit.ts:290`. Shadow payload: parsed-output TYPE field `lib/onboarding/shadowPayload.ts:76`, parser `lib/onboarding/shadowPayload.ts:294`; the production WRITER is the `jsonb_build_object` payload inside `stageExistingShowShadow` (`app/api/admin/onboarding/finalize/route.ts:668-697`). Finalize: locked select `app/api/admin/onboarding/finalize/route.ts:1039-1049`; forward `app/api/admin/onboarding/finalize/route.ts:1338`; shadow hand-off `app/api/admin/onboarding/finalize/route.ts:1201`; pending delete `app/api/admin/onboarding/finalize/route.ts:1212`; first-seen-gains-show `app/api/admin/onboarding/finalize/route.ts:674-682`; cas parse `app/api/admin/onboarding/finalize-cas/route.ts:433`, cas apply `app/api/admin/onboarding/finalize-cas/route.ts:560`. `ApplyStagedCoreArgs` `lib/sync/applyStagedCore.ts:458-460`, forward `lib/sync/applyStagedCore.ts:614`. Phase 2 snapshot `lib/sync/phase2.ts:461-476`, first-seen note `lib/sync/phase2.ts:497`, showId uses `lib/sync/phase2.ts:538` and `lib/sync/phase2.ts:552`. Sink-spy driver `tests/log/adminOutcomeBehavior.test.ts:639` and `tests/log/adminOutcomeBehavior.test.ts:737`; registry `tests/log/_auditableMutations.ts`. Deadlock suite scan `tests/auth/advisoryLockRpcDeadlock.test.ts:135-214`. Announce context `components/admin/review/warningAnnounceContext.ts`.

**Meta-test inventory (declared up front):** this plan EXTENDS `tests/log/_auditableMutations.ts` (+2 action rows, one per forensic code), `tests/log/adminOutcomeBehavior.test.ts` (+1 behavioral proof), `tests/auth/advisoryLockRpcDeadlock.test.ts` (+1 parallel `withShowLock` arm), and CREATES tests/admin/wizardWarningChrome.structural.test.ts (new file; the §2.4 registered-site walk). No Supabase-call-boundary registry rows are needed: the only new DB-touching helpers are the staged action (covered by the deadlock + behavioral suites) and enrichment, which delegates all I/O to the already-registered `loadIgnoredWarnings`. Advisory-lock topology: enumerated above; chosen layer (a).

**Dimensional invariants / layout-dimensions task:** none — spec §5.1: no fixed-dimension parent gains flex/grid children; controls join an existing flex column flow. No real-browser layout assertion required on dimension grounds.

**File map:**
- Create (new files, cited un-backticked because they do not exist yet): supabase/migrations/<UTCstamp>_pending_syncs_ignored_warnings.sql (name pattern per existing files; exact timestamp at authoring), lib/admin/wizardWarningModel.ts, lib/admin/enrichStep3WarningModels.ts, app/admin/onboarding/_actions/stagedWarningIgnore.ts, lib/admin/activeWarningEntries.ts, plus the test files each task names.
- Modify: `components/admin/OnboardingWizard.tsx`, `lib/admin/assembleStep3Row.ts`, `components/admin/wizard/Step3Review.tsx` (types), `components/admin/review/sectionData.ts`, `components/admin/wizard/step3ReviewSections.tsx`, `components/admin/DataQualityWarningControls.tsx`, `components/admin/showpage/sectionWarningExtras.tsx` (call-site prop migration), `components/admin/PerShowActionableWarnings.tsx` mounts if they pass slug/showId directly (verify at task time), `lib/admin/step3Buckets.ts`, `components/admin/wizard/Step3SheetCard.tsx`, `components/admin/wizard/Step3ReviewModal.tsx`, `components/admin/review/ShowReviewSurface.tsx`, `lib/admin/visibleWarningRows.ts` or a sibling count helper, `lib/onboarding/shadowPayload.ts`, `app/api/admin/onboarding/finalize/route.ts`, `app/api/admin/onboarding/finalize-cas/route.ts`, `lib/sync/applyStagedCore.ts`, `lib/sync/phase2.ts`.

---

### Task 1: `buildWizardWarningModel` + staged-column normalizer

**Files:**
- Create: lib/admin/wizardWarningModel.ts (new)
- Test: tests/lib/admin/wizardWarningModel.test.ts (new)

**Interfaces:**
- Consumes: `partitionByIgnored` semantics via `warningFingerprint` (`lib/dataQuality/warningFingerprint.ts:9`), `buildReportSurfaceId(scope, w)` (`lib/dataQuality/warningFingerprint.ts:18`).
- Produces (later tasks rely on these exact names):
  ```ts
  export type WizardWarningItem = { index: number; reportSurfaceId: string };
  export type WizardWarningModel = { active: WizardWarningItem[]; ignored: WizardWarningItem[] };
  export type StagedIgnoreEntry = { fingerprint: string; code: string; ignored_by: string };
  export function normalizeStagedIgnoredWarnings(raw: unknown): StagedIgnoreEntry[];
  export function buildWizardWarningModel(args: {
    reportScope: string;
    warnings: readonly ParseWarning[];
    ignoredFingerprints: ReadonlySet<string>;
  }): WizardWarningModel;
  ```

- [ ] **Step 1: failing tests.** Cases (expected values derived by running the REAL `warningFingerprint` on the fixture warnings — never hardcoded hashes):
  - two warn warnings + one info, one warn fingerprint in the set → `ignored` holds that warn's ORIGINAL index; `active` holds the other two indices in order.
  - a warning with no `rawSnippet` (null fingerprint) whose code+snippet would otherwise collide → always active.
  - empty warnings → `{active: [], ignored: []}`.
  - `reportSurfaceId` equals `buildReportSurfaceId(scope, w)` for each item (assert via a second direct call — the data source, not the container).
  - `normalizeStagedIgnoredWarnings` STRIPS to exactly `{fingerprint, code, ignored_by}` (deterministic storage hygiene): well-formed array → same entries with exactly those three keys (assert deep-equal against the stripped shape, including on an input entry carrying an extra key); non-array → `[]`; entries missing a string `fingerprint` dropped.
- [ ] **Step 2: run to red.** `pnpm vitest run tests/lib/admin/wizardWarningModel.test.ts` — FAIL (module not found).
- [ ] **Step 3: implement.** Index-carrying partition (same loop shape as `partitionByIgnored` but pushing `{index, reportSurfaceId}`); `normalizeStagedIgnoredWarnings` with `Array.isArray` + per-entry field checks. Server-only note in the module doc (node:crypto via `buildReportSurfaceId`).
- [ ] **Step 4: green.** Same command, PASS.
- [ ] **Step 5: commit** `feat(admin): wizard warning model + staged ignore normalizer`.

### Task 2: (dissolved — R1 F1, resequenced by R3 F3)

The migration has no independent failing test, so it cannot be its own TDD task. It lands inside Task 7, the first task whose REAL-DB suite observes the column's absence as a chronological red (Task 5's mocked harness never consults the schema). The migration content, apply sequence, and parity steps are specified inside Task 7.

### Task 3: Phase A identity capture

**Files:**
- Modify: `components/admin/OnboardingWizard.tsx` (shows select `components/admin/OnboardingWizard.tsx:425-433` gains `slug`; pending select `components/admin/OnboardingWizard.tsx:380` gains `ignored_warnings`; `stagedByDfid` `components/admin/OnboardingWizard.tsx:478-489` gains `ignoredWarnings: unknown`), `lib/admin/assembleStep3Row.ts` (`ShowCandidate` gains `slug`; `StagedPreviewForRow` gains `ignoredWarnings: unknown`; row assembly emits the two new fields), `components/admin/wizard/Step3Review.tsx` (Step3Row fields).
- Test: the suite found by `rg -l "assembleStep3Row" tests` for the derivation cases, PLUS `tests/components/onboardingWizard.fetchStep3.test.ts` (the existing `fetchStep3Data` data-wiring harness) for live select/projection coverage: the shows select returns `slug` and the pending select returns `ignored_warnings`, and both reach the assembled rows (the wiring case is authored BEFORE the select gains the columns, observed red, green when they land — chronological red on the production select).

**Interfaces — Produces:**
```ts
// Step3Row additions (components/admin/wizard/Step3Review.tsx)
linkedShowRef?: { id: string; slug: string } | null;
stagedIgnoredWarnings?: unknown; // raw column value; normalized in enrichment
```

- [ ] **Step 1: failing tests.**
  - session-provenance branch: candidate `{id, slug: "s-1", ...}` matching → `linkedShowRef = {id, slug: "s-1"}`.
  - existing-show branch: same capture.
  - candidate with `slug: null`/missing/empty → `linkedShowRef` null.
  - no candidate → null.
  - `stagedIgnoredWarnings` passes the raw preview value through untouched (fixture value `[{fingerprint:"x",code:"C",ignored_by:"a@b.c"}]`).
- [ ] **Step 2: red** (scoped vitest on that suite).
- [ ] **Step 3: implement** — capture from `matchedCandidate` at both assignment sites (`lib/admin/assembleStep3Row.ts:148` and `lib/admin/assembleStep3Row.ts:162`); copy `ignoredWarnings` from `StagedPreviewForRow` beside `useRawDecisions`. `exactOptionalPropertyTypes`: omit keys, never `undefined`.
- [ ] **Step 4: green.**
- [ ] **Step 5: commit** `feat(admin): thread linked-show identity and staged ignore column to Step3Row`.

### Task 4: Phase B enrichment + wiring

**Files:**
- Create: lib/admin/enrichStep3WarningModels.ts (new)
- Modify: `components/admin/OnboardingWizard.tsx` (the live declaration is `const rows: Step3Row[] = manifestRows.map(...)` at `components/admin/OnboardingWizard.tsx:545`; wiring is `const enriched = await enrichStep3WarningModels(rows, loadIgnoredWarnings)` with `enriched` used downstream), `components/admin/wizard/Step3Review.tsx` (the `warningModel?` Step3Row field)
- Test: tests/lib/admin/enrichStep3WarningModels.test.ts (new) for the helper matrix, PLUS a wiring case in `tests/components/onboardingWizard.fetchStep3.test.ts` asserting enriched rows carry `warningModel` (authored before the wiring lands: observed red, green when the enrichment call lands)

**Interfaces — Produces:**
```ts
// components/admin/wizard/Step3Review.tsx (Step3Row), THIS task owns the type edit:
warningModel?: WizardWarningModel;

// lib/admin/enrichStep3WarningModels.ts
export async function enrichStep3WarningModels(
  rows: Step3Row[],
  loader: (showId: string) => Promise<LoadIgnoredWarningsResult>,
): Promise<Step3Row[]>;
// Attaches warningModel per spec §2.0/§2.1.
```

- [ ] **Step 1: failing tests** (injected loader; taxonomy per spec §2.0 — classify with `hasReviewablePreview` semantics: `parseResult` non-null object with truthy `show`):
  - LINKED + loader ok(one fingerprint) → model partitions; reportScope = slug (assert one item's id against a direct `buildReportSurfaceId(slug, w)` call).
  - LINKED + loader `infra_error` → all active.
  - FIRST-SEEN → loader NEVER called (spy assert), fingerprints from `stagedIgnoredWarnings`; reportScope `staged-${driveFileId}`.
  - FIRST-SEEN with malformed `stagedIgnoredWarnings` → all active.
  - NO-PREVIEW shapes: `parseResult` null / `{}` (no `show`) → untouched, no `warningModel` key.
  - reviewable `{show, warnings: null}` → `{active: [], ignored: []}`; reviewable with `warnings` ABSENT and with `warnings` a NON-ARRAY (string) → same empty model (two distinct cases).
  - NO-PREVIEW completions: `parseResult` a NON-OBJECT primitive, and an object with an explicitly FALSEY `show` (`{show: null, warnings: [...]}`) → untouched, no `warningModel` key (two distinct cases beside the null/`{}` ones).
  - duplicate warnings sharing one fingerprint, fingerprint ignored → BOTH indices land in `ignored` (partition semantics, spec §3 last row).
  - Premise line above the partition assertions: `premiseHolds` that the fixture's ignored fingerprint is actually produced by `warningFingerprint` on the fixture warning (guards against a fixture that can never partition).
- [ ] **Step 2: red.**  **Step 3: implement** (Promise.all over LINKED rows only; `arr()`-style warnings coercion; drive file id from `row.driveFileId`).
- [ ] **Step 4: green.**  **Step 5:** wire into `OnboardingWizard` as declared in the Files block (enrich the mapped `rows`, use the enriched value downstream), run the wiring case red-then-green, typecheck, commit `feat(admin): enrich step3 rows with wizard warning models`.

### Task 5: staged ignore server action

**Files:**
- Create: app/admin/onboarding/_actions/stagedWarningIgnore.ts (new)
- Modify: `tests/log/_auditableMutations.ts` (+2 rows), `tests/log/adminOutcomeBehavior.test.ts` (+1 proof per code)
- Test: tests/admin/stagedWarningIgnore.test.ts (new)

**Interfaces — Produces:** exactly the spec §2.6 export:
```ts
export type SetStagedWarningIgnoreResult =
  | { ok: true; state: "ignored" | "unignored" }
  | { ok: false; code: "session_not_found" | "infra_error" | "concurrent" }
  | { ok: false; code: "warning_not_found" | "warning_not_ignorable" | "warning_stale" };
export async function setStagedWarningIgnore(args: {
  wizardSessionId: string; driveFileId: string;
  action: "ignore" | "unignore"; code: string; rawSnippet: string;
}): Promise<SetStagedWarningIgnoreResult>;
```

- [ ] **Step 1: failing tests** — mirror the LIVE staged use-raw suite `tests/admin/setStagedUseRawDecisionAction.test.ts` harness shape exactly: `vi.mock("@/lib/supabase/server", ...)` module mock, a `withShowLockMock` via `vi.mock("@/lib/sync/lockedShowTx", ...)` (its module-mock pattern at `tests/admin/setStagedUseRawDecisionAction.test.ts:45`, `tests/admin/setStagedUseRawDecisionAction.test.ts:62`, `tests/admin/setStagedUseRawDecisionAction.test.ts:78`) — NOT injected dependencies. Cases:
  - unknown pairing → `session_not_found`, no lock taken (spy).
  - lock contention → `concurrent`.
  - fingerprint of `{code, rawSnippet}` not among the LOCKED parse's ignorable warnings → `warning_not_found`; present but `hasIgnorableSnippet` false → `warning_not_ignorable`; identity drifted after rescan (fixture: locked parse's matching warning has different normalized snippet) → `warning_stale`.
  - happy ignore: entry `{fingerprint, code, ignored_by: canonicalized email}` upserted; result `{ok:true,state:"ignored"}`.
  - duplicate ignore: `{ok:true,state:"ignored"}`, jsonb unchanged, NO outcome emit (spy).
  - unignore removes; unignore of absent → `{ok:true,state:"unignored"}`, no emit.
  - happy ignore's `ignored_by`: feed a NONCANONICAL admin email fixture (`"  Doug.W@Example.COM "`) and assert the STORED value is the canonicalized form — a raw pass-through cannot satisfy this (invariant 3, discriminating fixture).
  - fault matrix, one case each, all resolving `{ok:false, code:"infra_error"}` and never throwing over the caller: supabase client CONSTRUCTION throw; query await REJECTION; returned `{error}`; locked SQL throw inside the callback; the lock WRAPPER itself throwing.
  - Lock topology assertion: the mutation executes INSIDE the `withShowLockMock(driveFileId, …)` callback (the mock records callback entry/exit; assert the upsert ran within), and the callback body performs NO `.rpc(` call (static arm in Task 6 pins it too).
- [ ] **Step 2: red** — the observed red is the ABSENT MODULE (collection/import failure). The mocked harness never consults the real schema, so the column proves itself in Task 7's real-DB suite (R3 F3); the migration moves there.
- [ ] **Step 3: implement the action** clause-for-clause per `useRawStaged.ts` (same-origin assert, `requireAdmin` + `requireAdminIdentity`, pre-lock pairing verify, locked re-read of `parse_result` + `ignored_warnings`, `warningsOf`-style coercion, `canonicalize(admin.email)` for `ignored_by`, jsonb update, post-commit `logAdminOutcome({ code: "STAGED_WARNING_IGNORED" | "STAGED_WARNING_UNIGNORED", … })` outside the lock, only when mutated).
- [ ] **Step 4: register the mutation IN THIS TASK (R3 F1 — a commit must not leave the fail-by-default discovery meta-test red on an unregistered admin action):** run `tests/log/_metaMutationSurfaceObservability.test.ts` and OBSERVE it red on the new action (this is a second live red of this task); add the TWO `AUDITABLE_MUTATIONS` rows (per-code precedent `tests/log/_auditableMutations.ts:387-410`: `{ file: "app/admin/onboarding/_actions/stagedWarningIgnore.ts", fn: "setStagedWarningIgnore", code: "STAGED_WARNING_IGNORED" }` and the `"STAGED_WARNING_UNIGNORED"` twin) and the behavioral proof in `tests/log/adminOutcomeBehavior.test.ts` via `observeSuccessCodes` (`tests/log/adminOutcomeBehavior.test.ts:675`) + `recordAdminOutcomeBehavior` (`tests/log/adminOutcomeBehavior.test.ts:639`) — one success-branch proof per code.
- [ ] **Step 5: green** — the action suite, the discovery meta-test, and the behavioral suite all pass in this task's tree.  **Step 6: commit** `feat(admin): staged warning ignore action, registered + behaviorally proven`.

### Task 6: advisory-lock topology arm

(The mutation-registry rows and behavioral proof moved INTO Task 5 — R3 F1: they must land in the same commit as the action.)

**Files:**
- Modify: `tests/auth/advisoryLockRpcDeadlock.test.ts` (NEW parallel arm: scan the source of every direct `withShowLock` acquirer — seed list from the Pre-verified holder sweep above — and assert each `withShowLock` callback body, the new action module's included, contains no `.rpc(`; the existing `withShowAdvisoryLock` arm at `tests/auth/advisoryLockRpcDeadlock.test.ts:135-214` is untouched).

- [ ] **Step 1:** author the arm; its authored-red target (`red-target` sense): the arm's SCAN LIST assertion — the arm asserts it scanned every file in the holder sweep, so before the arm exists nothing pins the topology (the production gap is the unpinned topology itself). Validation: hand-probe by inserting an `.rpc("x")` call into the new action's callback in the working tree, observe the arm flag it, revert uncommitted, record both observations in the commit message (the MEMORY-guards planted-mutant discipline — validation, not the RED).
- [ ] **Step 2:** green on the real tree.  **Step 3: commit** `test(auth): withShowLock topology arm pins the staged ignore action`.

### Task 7: finalize carry, both apply paths (owns the column migration — its real-DB suite is the one place the column's absence is observable, R3 F3; Task 5's mocked suite never consults the schema, so the intervening commits stay green)

**Files:**
- Modify: `lib/onboarding/shadowPayload.ts` (the parsed-output TYPE field beside `useRawDecisions` at `lib/onboarding/shadowPayload.ts:76` and the parser at `lib/onboarding/shadowPayload.ts:294`, parsed through `normalizeStagedIgnoredWarnings`; the production WRITER edit is the route's `jsonb_build_object` at `app/api/admin/onboarding/finalize/route.ts:668-697`), `app/api/admin/onboarding/finalize/route.ts` (locked select `app/api/admin/onboarding/finalize/route.ts:1039-1049`, forward `app/api/admin/onboarding/finalize/route.ts:1338`, shadow hand-off input `app/api/admin/onboarding/finalize/route.ts:1201`), `app/api/admin/onboarding/finalize-cas/route.ts` (parse `app/api/admin/onboarding/finalize-cas/route.ts:433`, args `app/api/admin/onboarding/finalize-cas/route.ts:560`), `lib/sync/applyStagedCore.ts` (`ApplyStagedCoreArgs` beside `lib/sync/applyStagedCore.ts:458-460`, forward `lib/sync/applyStagedCore.ts:614`), `lib/sync/phase2.ts` (insert at the `lib/sync/phase2.ts:538-552` tail using `snapshot.showId`).
- Test: tests/sync/stagedIgnoreCarry.test.ts (new) + a shadow round-trip case in the existing shadowPayload suite (`rg -l "shadowPayload" tests`).

- [ ] **Step 1: failing tests** — BOTH proofs run the REAL pipeline writers end to end, the `tests/onboarding/finalizeCasSourceAnchors.db.test.ts:30-33` posture ("stage through the REAL pipeline writers ... assert on Postgres AFTER apply"); extend that harness:
  - create-path proof: stage a first-seen row with staged ignore entries in `pending_syncs.ignored_warnings`, run the REAL finalize path (locked select at `app/api/admin/onboarding/finalize/route.ts:1039-1049` → forward `app/api/admin/onboarding/finalize/route.ts:1338` → phase 2) → rows exist in `public.ignored_warnings` for the created show with the STAGING-TIME `ignored_by`; re-apply → no duplicates (`on conflict do nothing`). This proves the select and forward, not just the insert.
  - update-path proof: stage an existing-show row, run the REAL shadow chain — `stageExistingShowShadow` writes the field via the production writer (the `jsonb_build_object` payload at `app/api/admin/onboarding/finalize/route.ts:668-697`; NOTE the R1 correction — `lib/onboarding/shadowPayload.ts:76` is the parsed-output TYPE, not the writer), `deleteApprovedPending` runs, then finalize-cas parses (`app/api/admin/onboarding/finalize-cas/route.ts:433`) and applies (`app/api/admin/onboarding/finalize-cas/route.ts:560`) → rows exist for the existing show id.
  - orphaned fingerprint (no matching live warning) carries without error.
  - carry-write FAULT posture (R2 F4): inject a failure into the carry insert (the harness's existing fault-injection precedent for phase-2 writes) and assert the apply surfaces the SAME typed fault behavior the neighboring use-raw re-persist failure produces — never a silent success that dropped the carry (spec §2.7 fault-posture clause).
  - a PARSER-ONLY unit case (R2 F5 — the writer is private SQL and cannot be invoked from a unit): feed `parseShadowPayloadForApply` a payload object shaped like the route writer's output (the `jsonb_build_object` key set at `app/api/admin/onboarding/finalize/route.ts:668-697` plus the new key) and assert the parsed field beside `useRawDecisions`; it supplements, never replaces, the two pipeline proofs (which are what actually prove the writer).
  - RED validity: the production lines are the finalize select/forward/writer edits and the phase-2 insert, none of which exist yet; both pipeline proofs fail on the missing column ride-along before implementation.
- [ ] **Step 2: red** — the real-DB suite reds on the ABSENT `pending_syncs.ignored_warnings` column (the staging step cannot write it): this is the migration's chronological failing test (R3 F3).
- [ ] **Step 3: migration.** Create supabase/migrations/<UTCstamp>_pending_syncs_ignored_warnings.sql (new):
  ```sql
  alter table public.pending_syncs
    add column if not exists ignored_warnings jsonb not null default '[]'::jsonb;
  ```
  No CHECK (spec §2.7 matrix: single writer + read-side coercion); apply-twice safe via `if not exists`. Apply locally (`psql "$DATABASE_URL" -f <file>` or `supabase db query`), run `pnpm gen:schema-manifest` and stage the regenerated manifest for THIS task's commit, and apply surgically to the validation project (`supabase db query --linked "<the ALTER>"` then `notify pgrst, 'reload schema';` — validation-schema-parity steps 1-3 in one commit).
- [ ] **Step 4: implement the carry** hop by hop.  **Step 5: green** (these suites may be DB-bound — if env-bound, follow the existing suites' project tags; run under `pnpm heavy` if a full suite is needed, with the bl-orch DB slot).
- [ ] **Step 6: commit** `feat(sync): staged-ignore column + finalize carry to ignored_warnings`.

### Task 8: `DataQualityWarningControls` target generalization + report identity

**Files:**
- Modify: `components/admin/DataQualityWarningControls.tsx`, `components/admin/showpage/sectionWarningExtras.tsx` (both `SectionWarningItemControls` mounts pass `target={{kind:"show", slug, showId}}`), any other mount (`rg -n "DataQualityWarningControls" components app` — migrate every hit).
- Test: extend the component's existing suite (`rg -l "DataQualityWarningControls" tests`).

**Interfaces — Produces:**
```ts
export type WizardDqTarget =
  | { kind: "show"; slug: string; showId: string }
  | { kind: "staged"; wizardSessionId: string; driveFileId: string };
// Props: { target: WizardDqTarget; warning; driveFileId; mode; reportSurfaceId }
```

- [ ] **Step 1: failing tests.**
  - show arm: fetch URL byte-identical to today (assert the exact `/api/admin/show/<slug>/data-quality/ignore` URL + body).
  - staged arm: `setStagedWarningIgnore` called with the five args; every `ok:false` arm renders the existing failCopy plate; success announces then refreshes (existing announce/refresh assertions extended).
  - **Request-body assertion (spec §6, R5):** mounting with the staged target arm + submitting Report sends `show_id: null` and `fieldRef.driveFileId === <fixture driveFileId>` — intercept the submit request body; expected id derived from the fixture. Show arm carries `fieldRef.driveFileId` too (additive).
  - Ignore button still self-gates on `hasIgnorableSnippet` in both arms.
  - idle→running (R2 F3): staged arm with a RESOLVE-CONTROLLED action promise — while pending, the button reads "Ignoring…" and carries `aria-busy="true"`; resolve → announce + refresh path.
  - error→idle retry (R2 F3): first call rejects (error plate shown), second call succeeds — plate clears, success path runs.
- [ ] **Step 2: red.**  **Step 3: implement** (discriminated fetch/action call; `fieldRef` gains `driveFileId`; server-action import via the `"use server"` module).  **Step 4: green.**
- [ ] **Step 5: commit** `feat(admin): discriminated ignore target + report sheet identity`.

### Task 9: panel rendering (dq threading + controls + disclosure)

**Files:**
- Modify: `components/admin/review/sectionData.ts` (StagedSectionData `dq?`), `components/admin/wizard/Step3SheetCard.tsx` (buildStagedSectionData call site threads the new Step3Row fields), `components/admin/wizard/step3ReviewSections.tsx` (registry warnings row passes `dq`; `WarningsBreakdown` renders per spec §2.3).
- Test: extend `tests/components/admin/wizard/step3ReviewSections.test.tsx` + fixture builder `tests/components/admin/wizard/_step3ReviewFixture.ts`.

- [ ] **Step 0: pre-code mechanical UI checklist** (AGENTS.md pre-code gate — run BEFORE writing JSX): no em dashes in new copy; apostrophes as `&rsquo;` matching the file's convention; every new interactive element ≥44px (`min-h-tap-min` — the existing `NEUTRAL_BTN`/`ReportButton` classes already carry it, reuse them); canonical tokens only (`text-xs/relaxed`, `text-subtle`, `bg-warning-bg`); no new color tokens (so no contrast pin needed).
- [ ] **Step 1: failing tests.**
  - `dq` absent → byte-identical render (existing suite must pass UNTOUCHED — run it first and record).
  - `dq` CONSTRUCTION, against the production builder (R2 F1): `buildStagedSectionData` with a FIRST-SEEN fixture row → `dq.target` deep-equals `{ kind: "staged", wizardSessionId, driveFileId }` (values from the fixture); with a LINKED fixture row → `{ kind: "show", slug, showId }` from `linkedShowRef`; with a NO-PREVIEW row (or absent `warningModel`) → NO `dq` key at all.
  - registry FORWARDING, production wiring: render the warnings section through `step3Sections(...)` (the registry) with a staged `dq`-bearing fixture and assert the panel renders `dq-controls` (authored before the registry pass-through lands: observed red, green when it lands — the wiring's chronological red).
  - `dq` present: active rows only in the list; each rendered active row carries ORIGINAL `data-warning-index` and `data-attention-anchor="warning:<originalIndex>"` and testid `warning-<originalIndex>` (fixture: index 0 ignored, 1 active → the single rendered row asserts all three attributes equal 1).
  - warn rows get `dq-controls`; info rows none; snippet-less warn row: Report only.
  - `controlsNote` renders on control-bearing rows only.
  - Ignored (N) disclosure: `<details>` with muted rows, `mode="ignored"` controls, NO jump attributes on disclosure rows (clone tree, assert absence).
  - disclosure closed→open (R2 F3): open the `<details>`; the ignored row content is present and visible IMMEDIATELY (no height/opacity animation wrapper around the body — assert the body subtree has no transition/animation class), and the summary chevron carries the `group-open:rotate-90` rotate class (the copied published treatment).
  - all-ignored: clean sentence ("Nothing needs a look on this sheet.") + disclosure; zero warnings: existing `warnings-empty` sentence, no disclosure element.
  - `dfid === null` with `dq` present → NO controls render (the panel's existing non-null-dfid control gate, spec §3); assert both arms' controls absent.
  - out-of-range model index (model built against a longer array than the rendered one) → the row is SKIPPED, no crash (spec §3 defensive re-join row).
  - Key-identity contract, production-observable (R1 F9 — React keys are not DOM-visible, and deriving expectations from `stableWarningKeys` would test the helper against itself): the `tests/components/admin/wizard/warningsBreakdownControls.test.tsx:242-265` pattern — open a row-local control state (the error plate), re-render with an upstream warning INSERTED before it, and assert the state followed the row's CONTENT identity, not its position; run once for the active list and once inside the disclosure.
- [ ] **Step 2: red.**  **Step 3: implement.**  **Step 4: green.**
- [ ] **Step 5: commit** `feat(crew-page): wizard sheet-warnings ignore + report controls` — scope note: files live under `components/admin/wizard`, use scope `admin`: `feat(admin): …`.

### Task 10: choke point 1 — `gapWarnings` + card glyph

**Files:**
- Modify: `lib/admin/step3Buckets.ts` (`Step3RowLike` gains `warningModel?`; `gapWarnings` filters ignored indices; export `activeGapWarnings` for the card glyph), `components/admin/wizard/Step3SheetCard.tsx` (`components/admin/wizard/Step3SheetCard.tsx:513` glyph site switches to the exported accessor).
- Test: extend `tests/admin/step3Buckets.test.ts`.

- [ ] **Step 1: failing tests** — a row fixture with 2 warn gap warnings, model ignoring index 0: `nonAmbiguityGapTotal` drops by exactly the ignored row's contribution (derive both numbers from the fixture); `rowIsJudgment` flips when the only non-ambiguity warn is ignored; `deriveStep3Buckets` counts follow; absent model → byte-identical numbers (regression pin: run the existing suite untouched first). PLUS a MOUNTED card case (R2 F2): render `Step3SheetCard` with the same fixture and assert the data-gap glyph's rendered count reflects the ACTIVE partition only (expected derived from the fixture; this is the only proof that the `components/admin/wizard/Step3SheetCard.tsx:513` call site actually switched — the helper tests cannot see it).
- [ ] **Step 2: red.**  **Step 3: implement.**  **Step 4: green.**  **Step 5: commit** `feat(admin): row bucket derivations read the active warning partition`.

### Task 11: choke point 2 — entries wrapper + modal/surface/count consumers

**Files:**
- Create: lib/admin/activeWarningEntries.ts (new):
  ```ts
  export function activeWarningEntries(
    warnings: readonly ParseWarning[],
    renderedSections: ReadonlySet<SectionId>,
    ignoredIndices: ReadonlySet<number> | null,
  ): ReadonlyMap<SectionId, readonly { warning: ParseWarning; index: number }[]>;
  // warningsBySection(...) then per-section filter; identity when ignoredIndices null/empty.
  ```
- Modify: `components/admin/wizard/Step3ReviewModal.tsx` (memo at `components/admin/wizard/Step3ReviewModal.tsx:313-329` uses the wrapper with the row's ignored index set), `components/admin/review/ShowReviewSurface.tsx` (memo `components/admin/review/ShowReviewSurface.tsx:282-284` and dot `components/admin/review/ShowReviewSurface.tsx:343` via the wrapper), `components/admin/wizard/step3ReviewSections.tsx` registry `railCount` + `WarningsBreakdown` heading count via one shared helper (extend `lib/admin/sheetWarningsCount.ts` with a wizard-branch function `wizardPanelCount({rows, ignoredWarnCount})`).
- Test: tests/lib/admin/activeWarningEntries.test.ts (new) + count assertions in the Task 9 suite + a jump test in the modal suite.

- [ ] **Step 1: failing tests.**
  - wrapper: original indices preserved on survivors; identity when null; warn-only invariant maintained (feed an info warning, assert it never appears — pins `deriveWarningAttention`'s throw unreachable).
  - counts fixture (1 ignored warn + 1 active warn + 1 info): panel heading = 2, rail = 2, pill = "1 need a look" (derive from fixture; scope extraction so the disclosure's copy of the ignored label can't satisfy the count assertion — clone + strip the disclosure subtree first).
  - jump-anchor contract: with warning 0 ignored, the menu entry id `warning:1` resolves via `querySelector('[data-attention-anchor="warning:1"]')` — the same selector expression as `ShowReviewSurface.tsx:568`.
  - transition audit (spec §5): toggling the fixture to zero active warns unmounts pill + menu in that render (assert menu absent; `pillInteractive` gate) — instant, no new `AnimatePresence` anywhere in the diff (`rg -c "AnimatePresence"` unchanged).
  - §5 transition dispositions, named per row (R1 F10): idle→running label swap + `aria-busy` and error→idle retry are EXISTING `DataQualityWarningControls` behavior — covered by that component's existing suite plus Task 8's staged-arm cases (disposition: covered-elsewhere, no new test here); disclosure chevron/body treatment copies the published pattern and Task 9 asserts the disclosure exists with instant body (no new animation — the `rg -c "AnimatePresence"` check); publish-run independence: NEW case — render with `isPublishRunActive` true (the `Step3RunStateContext` fixture) and assert the ignore control is NOT disabled (it is not part of the §4.4 footer freeze set); simultaneous independent rows: NEW case — two active rows, fire both controls, each holds its own state (second not disabled while first runs).
- [ ] **Step 2: red.**  **Step 3: implement.**  **Step 4: green.**  **Step 5: commit** `feat(admin): wizard chrome reads the active warning partition`.

### Task 12: announce widening

**Files:**
- Modify: `components/admin/review/ShowReviewSurface.tsx:864-866` (provider value becomes `announceCtx` unconditionally for surface mounts).
- Test: extend the announce/producer suite (`rg -l "WarningAnnounceContext" tests`).

- [ ] **Step 1: failing test** — a STAGED surface mount: firing a producer announce lands in the announce log region (today asserted only for published). Standalone mounts outside the surface keep `NOOP_WARNING_ANNOUNCE` (existing default-context test untouched).
- [ ] **Step 2: red.**  **Step 3: implement** (delete the ternary, keep the comment updated to cite spec §2.5 supersession).  **Step 4: green.**  **Step 5: commit** `feat(admin): announce warning ignore outcomes on the staged surface`.

### Task 13: structural guard — registered-site walk

**Files:**
- Create: tests/admin/wizardWarningChrome.structural.test.ts (new)

- [ ] **Step 1:** walk, from the filesystem, `components/admin/wizard/**`, `components/admin/review/ShowReviewSurface.tsx`, AND the lib choke modules `lib/admin/step3Buckets.ts` plus the new files lib/admin/activeWarningEntries.ts, lib/admin/wizardWarningModel.ts, lib/admin/enrichStep3WarningModels.ts (un-backticked: created by earlier tasks) (R1 F8: every registered site must live INSIDE the walked tree, or the premise below can never hold); flag any line matching `warningsBySection\(|\.parseResult\??\.warnings|data\.warnings|summarizeDataGaps\(` whose `file:symbol` is NOT in the registered-site list (exactly: the two choke-point modules, `activeWarningEntries` call sites, `WarningsBreakdown` + registry closures, enrichment/stamping helpers, the attention memo's wrapper call). Include a premise: the walk SAW every registered site (a registry row whose site is missing fails — the guard-on-itself rule).
- [ ] **Step 2 (RED declaration — the guard-authoring shape, stated honestly, R3 F2):** a structural guard over an already-compliant tree has NO live red, and manufacturing one with a fake registry row is the test-local RED shape the RED-validity rule forbids — so this task deliberately claims no chronological red. Its validity evidence is instead: (a) the premise arm is production-anchored (it asserts the walk SAW every registered site in the real tree — misconfigure the walk roots and it fails on real files); (b) two uncommitted hand-probes recorded verbatim in the commit message: a planted bypass (`data.warnings.some(...)` added to a walked file) that the guard flags, and a registered site temporarily removed from its module that the premise flags. Both probes reverted before commit (the MEMORY-guards planted-mutant discipline).
- [ ] **Step 3: commit** `test(admin): structural guard for wizard warning chrome choke points`.

---

## 12. Closeout (Opus pane, after all tasks)

- [ ] Full verification battery, in order: `pnpm typecheck` (vitest AND playwright configs), `pnpm exec eslint .`, `pnpm format:check`, then `pnpm heavy pnpm test` (DB slot from bl-orch FIRST).
- [ ] Invariant 8 dual-gate on the diff: run the impeccable v3 skill's critique half, then its audit half (canonical setup: context.mjs load of PRODUCT.md + DESIGN.md → register reference read). P0/P1 fixed or `DEFERRED.md`-deferred BEFORE the whole-diff review. Findings + dispositions recorded below, and IN THIS SAME COMMIT: rewrite this section to name both halves explicitly and append the machine-valid marker line per the parser grammar in `tests/docs/_invariant8Closeout.ts` (`critique=RAN audit=RAN p0=<n> p1=<n> dispositions=<recorded|none>`; cross-check rule: p0+p1>0 requires `recorded`, zero requires `none`).
- [ ] Whole-diff cross-model review via codex-guard (`--stage diff --round 1`; round-1 diff brief needs the GUARD SURFACE line ONLY if a surface enrolled in the SOURCE-MUTATION SCORE registry (`tests/mutation/source/registry.ts`) is touched — none is (the `AUDITABLE_MUTATIONS` extension in Task 5 is a different registry and does not trigger that line); state that in the brief). 4-round cap; filing + bl-orch past it.
- [ ] Push; CI green at the shipping 40-char head (all twelve required contexts, seen>=12 — ABSENT is not green); then report READY to bl-orch pane `w15:p2`. THE ARC NEVER MERGES.
- [ ] Ledger: no `BL-`/`DEF-` rows are closed by this arc; nothing to mark or clear.
- [ ] §7 documented-limit dispositions (R1 F10 — each is a LIMIT, deliberately untested as behavior, with one absence probe where cheap): no bulk ignore in the wizard mount (Task 9 asserts NO `BulkIgnoreControls` render in the panel — one absence assertion); no prune on wizard re-scan (disposition: documented limit, spec §1.1.6 — no test; the rescan path is untouched by this diff, verified by the diff itself); one unbatched read per LINKED row (disposition: documented limit, spec §7 — no test); abandoned-session cleanup disposing staged ignores (disposition: rides the existing `pending_syncs` row-deletion behavior, already covered by the session-lifecycle suites — no new test).

(The `impeccable-gate:` marker line is written here by the closeout commit — no placeholder until then, per the grammar's malformed-line rule.)
