# Plan — static env-block key allowlist for both CI guard layers

**Spec:** `docs/superpowers/specs/ci/2026-08-02-ci-static-env-injection-design.md` (canonical; §3 = mutation-family closure set S1–S8; §5 = documented limits; §7 = review record). **Branch:** `test/ci-static-env-injection`. **Backlog item:** `BL-CI-STATIC-ENV-INJECTION` (graduates to repo-root `BACKLOG-archive.md` in T3).

Every task: failing test → minimal implementation → passing test → one conventional commit (`test(ci): …`). No task touches UI, DB, locks, or mutation surfaces — invariants 2/3/5/8/9/10 are N/A.

impeccable-gate: N/A — no UI surface

**Invariant 11 (recorded):** all work happens in the worktree `../FX-worktrees/ci-static-env-injection`, created off `origin/main` (2509f1452) before the first edit. Setup ran `pnpm install`, then `pnpm worktree:link-env` (`LINK .env.local -> main checkout`, "resolves ✓"), then `pnpm preflight` (`preflight: env ✓ local DB ✓`, with the standing WARN that `TEST_DATABASE_URL` is non-loopback). The main checkout is never written.

**Round-record discipline (adopted from the cross-step plan, its R3 lesson):** this plan does NOT enumerate adversarial rounds or repair SHAs — the spec's §7 (one entry per round) and `git log --oneline origin/main..HEAD` are the authoritative records; both are generated from the work and cannot drift.

**Execution-order note (honesty, mirroring the cross-step plan):** T1 and T2 were implemented red-first during the spec review train's waits (the cross-step arc's precedent), with each spec round's repair folded into the guard as it landed — the R2 value-pinning repair reshaped T1's allowlist in place. This document is therefore part as-built record; §7 of the spec and the commit log carry the round-by-round truth.

**Hygiene fixture-key note:** fixtures needing an allowlisted pair under the DEFAULT allowlist use `CREW_E2E_ONLY: '1'` (a literal live pair); `REPEATS` pins an expression text and is unsuitable for literal fixtures.

## Pre-draft verification (run 2026-08-02 in this worktree)

- Probe at origin/main 2509f1452: both layers pass a static-env-poisoned workflow at all three scopes (spec §1.0) — probe file tests/ci/probe-static-env.test.ts (untracked, deleted in T3).
- Live measurement (spec §1.0.1): 20 env sites / 13 files / 6 job-level / 14 step-level / 0 root / 0 actions / 0 services; 35 distinct keys, re-derived by script at implementation time for the seed.
- Live symbols verified this session: scanner type tables `WF_ROOT` / `WF_STEPS_JOB` / `WF_RUN_STEP` / `WF_USES_STEP` each carry `env: scalars`; `UNMODELLED_RE` alternation (`shell|working-directory|defaults|container|needs`) checked file-wide; per-job loop threads `envPoisoned` with the rejection chain ordered `no pull_request trigger → unmodelled execution override → unmodelled YAML spelling → job has no valid runs-on → earlier same-job step writes GITHUB_ENV/GITHUB_PATH → paths filter → if → coe → suppression → shell construct`; bookkeeping tail reads the PARSED step (`writesJobEnv(JSON.stringify(parsedStep))`, `usesValuePoisons(parsedStep.uses, localActions, new Set())`). Census `runBlocksOf(doc, localActions = {})` walks via `walkSteps(steps, outerGuard, state, seen)` with run-branch emit-then-poison, uses-branch through `usesKind`/`compositeStepsOf`, job seed `{ poisoned: !validRunsOnJob || mixedStepAnywhere || schemaInvalid }`, and a standalone composite-doc entry; census imports `usesKind, validRunsOn, validWorkflowShape, validatedCompositeSteps` from the scanner module. Poisoned why-string at the census `contextWhy`: `environment poisoned by an earlier same-job GITHUB_ENV/GITHUB_PATH write`. Types `ActionStep` (scanner) and `StepShape` (census) both LACK an `env` field today — T1/T2 add `env?: unknown`.
- Both guard test files already run in the unit suite (`vitest.projects.ts` `BASE_INCLUDE` serial include); NO new test file is created, so no testMatch/workflow-filter wiring changes. The probe file is deleted before merge, not wired.
- `tests/ci/**` is NOT in `MUTATION_TEST_GLOBS` (parser harness only) — no mutation-ledger interaction.

## Meta-test inventory (mandatory declaration)

This arc EXTENDS the two existing structural meta-tests in place (`tests/ci/_metaSpecRegistration.test.ts`, `tests/ci/_metaE2eWorkflowCoverage.test.ts` + the pure module `tests/ci/_workflowCoverageScan.ts`) and CREATES one new registry inside them: `ENV_KEY_ALLOWLIST` (value-pinned rows) with its hygiene `it`-blocks (pair-level stale-row; live-completeness inverse direction via `unreviewedLivePairs` with its extra-key/extra-value doctored twins, plan-R2; nested-manifest loader depth fixture over the shared `localActionTextsUnder` loader, plan-R3; governance equality via `envPairGovernance` + `governanceViolations`; non-empty-reason/value — spec §2.3). One `BACKLOG_GRADUATED` row is added to `tests/docs/_metaDeferralLedgerGraduation.test.ts` (T3). No auth/DB/alert/tile registry applies: the diff is test-only CI guard surface — the touched files ARE the meta-tests. No new comment-stripping mechanism (predicate reads parsed maps; spec §2.4), so the comment-stripping registry is untouched.

## T1 — scanner: allowlist + predicate + per-scope rejection + caller

(Scanner first: the census imports the new exports from the scanner module.)

**Red:** scanner self-suite additions in `tests/ci/_metaE2eWorkflowCoverage.test.ts`, driven through `scanWorkflowCoverage` with a fixture-local `envKeyAllowlist` (spec §4.2):

- S1 positive per scope cell: workflow-root / job / run-step dirty → claim rejected with reason `` env block sets unmodelled key(s): <sorted keys> ``; `uses:`-step dirty (REMOTE ref AND a LOCAL `./…` ref resolving a clean manifest, so only the invoking step's env can refuse — final review (a) F1) and every composite matrix cell (direct/nested × run/uses, each a local manifest step carrying an off-list `env:` key, plus the direct/nested cells whose composite step invokes a LOCAL ref) → later claim rejected via the poison reason (spec §2.1, LS3);
- S2: `PATH`, `TOTALLY_NOVEL_KEY`, and prototype-named `constructor` each red; fixture-allowlisted key stays covered;
- S3 twins: off-list key in job B → job A covered; off-list env on a non-claiming sibling run-step → claiming step covered; allowlisted keys at every scope → covered;
- S4/S5: exact reason string pinned; two off-list keys in one scope → reason lists both, sorted;
- S6: hygiene blocks (below) exercised with a doctored allowlist via direct invocation of the pure checker `envAllowlistHygieneProblems` — the live gate and the twin run the SAME assertion logic; live-completeness twin (plan-R2 red: `unreviewedLivePairs` absent → TypeError, then the live gate red on the unseeded `GH_APP_TOKEN` pair until its row landed) and the nested-manifest depth fixture (plan-R3) alongside;
- S7 (folded in at spec R2): novel value on an allowlisted key reds, pinned value stays covered;
- S8 (folded in at spec R3–R5): governance twins through pure `envPairGovernance`/`governanceViolations` — relocation, prose-park, silent gain, and path-gated duplicate each red; faithful + alias-resolved pass.

**Green:** in `tests/ci/_workflowCoverageScan.ts`: `export const ENV_KEY_ALLOWLIST: EnvKeyAllowlist` (`Record<string, { values: Array<{ text: string; governs: string[] }>; reason: string }>` — VALUE-PINNED rows per spec §7 R2, GOVERNANCE-BOUND per §7 R3 and PAIR-KEYED per final review (a) R2: `governs` hangs off each VALUE and is the derived spec set that (key, value) pair gates, hygiene asserts set equality per pair via pure `envPairGovernance` + `governanceViolations`, S8 doctored twins incl. the value-swap twin) seeded from the live tree (35 keys, pairs + governance re-derived at implementation); `export function offAllowlistEnvKeys(env: unknown, allowlist = ENV_KEY_ALLOWLIST): string[]` using `Object.hasOwn` membership plus pinned-value-text membership (spec §2.0); `Opts` gains `envKeyAllowlist?: EnvKeyAllowlist`; `ActionStep` gains `env?: unknown`. In `scanWorkflowCoverage`: compute `wfEnvOff` once per file from the parsed root `env` and `jobEnvOff` per job from the parsed job, and check the run-step's own parsed `env` inline at the claim site (AS-BUILT: no `stepEnvOff` binding was introduced — the earlier draft named one that never shipped); insert the rejection branch after the cross-step `envPoisoned` reason and before the paths-filter reason, reason string carrying the sorted union of the governing scopes' off-list keys; in the bookkeeping tail, a `uses:`-step whose parsed `env` is dirty sets `envPoisoned = true` BEFORE `usesValuePoisons` runs; `usesValuePoisons` gains an allowlist parameter and poisons on any validated composite step (either kind, any depth) whose `env` is dirty. Caller in `tests/ci/_metaE2eWorkflowCoverage.test.ts` passes nothing new (default allowlist). Hygiene `it`-blocks per spec §2.3: every `ENV_KEY_ALLOWLIST` (key, value-text) pair appears in at least one live workflow/action parsed `env:` map, else red; every LIVE pair has a reviewed row (`unreviewedLivePairs` — the plan-R2 completeness direction, making the live-green gate's "covers exactly the live tree" machine-checked); every row's `governs` equals the fresh live derivation (`envPairGovernance` over the scan's `covered.add`-site governance map, `governanceViolations` naming any mismatch); every reason non-empty and every row value-carrying.

Signature sketch (typechecked at draft time, see Snippet-typecheck note):

```ts
export type EnvKeyAllowlist = Record<
  string,
  { values: Array<{ text: string; governs: string[] }>; reason: string }
>;
export const ENV_KEY_ALLOWLIST: EnvKeyAllowlist = {};
export function offAllowlistEnvKeys(
  env: unknown,
  allowlist: EnvKeyAllowlist = ENV_KEY_ALLOWLIST,
): string[] {
  if (env === null || typeof env !== "object" || Array.isArray(env)) return [];
  return Object.entries(env)
    .filter(([k, v]) => {
      if (!Object.hasOwn(allowlist, k)) return true;
      const text = typeof v === "string" ? v : String(v);
      return !allowlist[k]!.values.some((entry) => entry.text === text);
    })
    .map(([k]) => k)
    .sort();
}
```

**Commit:** `test(ci): scanner rejects claims governed by an off-allowlist static env: key (spec §2.1)`

## T2 — census: per-scope poison + why-string generalization

**Red:** census fixture additions in `_metaSpecRegistration.test.ts` (every fixture job declares a `runs-on`; fixture-local allowlist):

- S1 cells: workflow-root dirty → all blocks poisoned; job dirty → that job only (cross-job twin); run-step dirty → that block only, sibling blocks clean; `uses:`-step dirty → that splice and all later same-job blocks poisoned, for a REMOTE ref AND a LOCAL `./…` ref over a clean manifest (final review (a) F1); composite direct-run / direct-uses / nested-run / nested-uses dirty → poisoned, plus the direct/nested cells whose composite step invokes a LOCAL ref; standalone composite-doc entry with a dirty-env step → poisoned;
- S2: `constructor` key poisons; allowlisted key clean; S7 novel value poisons;
- S3 clean twins at EVERY modeled scope: root/job/run-step, `uses:`-step (remote and local refs), all four composite cells (a missing clean cell lets a coarsening mutant escape at exactly that scope);
- `censusInvocations`: an integration fixture feeds `runBlocksOf` output of a static-env-dirty job into `censusInvocations` and pins the problem to the generalized why-string; existing cross-step poisoned-why fixture assertions updated to the new string in the same edit.

**Green:** `runBlocksOf(doc, localActions = {}, envKeyAllowlist = ENV_KEY_ALLOWLIST)` (import extended); `StepShape` gains `env?: unknown`; job seed ORs `offAllowlistEnvKeys(jobEnv, allowlist).length > 0 || wfEnvDirty`; `walkSteps` gains an `inComposite: boolean` — run-branch emits `poisoned: state.poisoned || stepDirty`, and `if (stepDirty && inComposite) state.poisoned = true` (workflow run-step dirt is block-local; composite step dirt poisons onward per LS3); uses-branch sets `state.poisoned = true` when the step's `env` is dirty, before resolution; standalone entry walks with `inComposite: true`. `contextWhy` poisoned why-string becomes `environment poisoned by a same-job GITHUB_ENV/GITHUB_PATH write or an unmodelled static env: key` (spec §2.2).

**Commit:** `test(ci): census poisons blocks governed by an off-allowlist static env: key (spec §2.2)`

## T3 — probe graduation, live-green gate, backlog graduation, fan-out

- Delete tests/ci/probe-static-env.test.ts (assertions live inverted in the suites). The probe is UNTRACKED, so a git-object check proves nothing — verify working-tree absence: `test ! -e tests/ci/probe-static-env.test.ts` (plan-R1 F4). Red/green for this task IS the full-suite gate: with the probe present the suite reds (its 4 asserts pin the PRE-fix pass-through the guard now refuses — observed 2026-08-02); deleting it is the green.
- Gates: `pnpm vitest run tests/ci/_metaSpecRegistration.test.ts tests/ci/_metaE2eWorkflowCoverage.test.ts tests/docs/_metaDeferralLedgerGraduation.test.ts tests/docs/_metaInvariant8Closeout.test.ts` green, plus the pre-push ladder (see contract below).
- Graduate `BL-CI-STATIC-ENV-INJECTION`: move the entry `BACKLOG.md` → `BACKLOG-archive.md` with provenance `test/ci-static-env-injection`; add the one `BACKLOG_GRADUATED` registry row; layering-resolve any sibling-graduation conflicts.
- Fan-out: index rows in `docs/superpowers/specs/ci/README.md` + `docs/superpowers/plans/ci/README.md`; the cross-step spec's §5 preamble AND L3 are restated from an ACTIVE fail-open residual to a CLOSED historical condition (naming the closing branch and spec, with a do-not-file-duplicates note) — a substantive edit, not a location pointer.
- **Commit:** `test(ci): graduate BL-CI-STATIC-ENV-INJECTION; retire static-env probe (T3)`

## Snippet-typecheck note (writing-plans rule)

The T1 sketch was typechecked at draft time in a scratch module in this worktree against the repo tsconfig (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), and re-synced to the PAIR-KEYED row shape after final review (a) R2 — the draft-time claim covered the draft-time shape, so the sketch above is the shipped one, not the original. All other test shapes reuse fixture idioms already compiling in the two suites (object-literal `toEqual` rows, YAML template strings, fixture-local option objects).

## Failure modes each new test catches (anti-tautology declaration)

- S1 matrix (incl. all composite cells, remote AND local refs, + census standalone): a mutant deleting the check at any single scope, or narrowing the composite walk by depth or step kind — including narrowing by `usesKind` — reverts that cell to probe behavior (`covered=true` / `poisoned=false`) and fails exactly that fixture. The R1 probe demonstrated all three composite escape cells live; the final review (a) probe demonstrated the LOCAL-invocation cell, whose fixtures resolve a CLEAN manifest so only the invoking step's env can produce the refusal. Final review (a) R3 then demonstrated the sibling-POSITION axis (first-sibling-only traversal, and recursion into only the first `uses:`), so every axis now carries a late-position positive with a clean earlier sibling, plus the swept workflow-file and job-step axes.
- S2 `constructor`: kills the `key in allowlist` mutant that the plain fixtures cannot see (R1 probe: false coverage at all five scopes in both layers).
- S3 twins: catch over-poisoning — file-wide coarsening or allowlist-ignore reds a twin, not just a positive (a guard that darkens the 13 live env-carrying workflows forces reason-free rows).
- S4/S5 reason pins: catch silent dropping (`_rowWrapperScan` lesson) and first-key-only narrowing; the assertion is on `rejected` content, not on `covered` absence alone.
- S6 hygiene: a stale or reason-less row is a live red, not drift — the live gate and the doctored twin both invoke pure `envAllowlistHygieneProblems`, so the twin exercises the same assertion logic the live gate runs (deleting a live assertion cannot leave the twin green).
- S7 novel-value twins: kill the key-name-only widening mutant (R2 live probe: `MODAL_PREFETCH_E2E=0` green run with no tests) — an allowlisted key with an unpinned value text must red in both layers while the pinned value stays clean.
- S8 governance twins (doctored trees through pure `envPairGovernance`/`governanceViolations`): kill pair-presence-only hygiene (R3 relocation), recognizer-widened derivation (R4 echo-park prose launder), and qualification-blind derivation (R5 path-gated duplicate) — each mutant reds the declaring row; the faithful tree and alias-resolved claims pass. A positive per CREDIT SITE (workflow-root env, job env, run-step env, whole-config `configSpecs`) additionally kills a single regressed credit: final review (a) showed job-level-only twins left the root-credit, step-credit, and dropped-`configSpecs` mutants alive with the live gate still reporting no violations.
- Live-green gate (§4.3): proves the seeded allowlist covers exactly the live tree — an over-tight seed reds immediately rather than darkening coverage silently (the cross-step R22 lesson: the live gate caught an over-refusal before CI).

## Review + ship

- Codex adversarial review of this plan (codex-guard, REVIEWER ONLY brief, finding-admissibility contract, §3 closure set S1–S8 as the convergence criterion) → APPROVE.
- TDD tasks T1–T3; final Codex review as TWO split tight-scope dispatches per the project's large-diff default (the diff is ~11 files): (a) guard surface — `tests/ci/_workflowCoverageScan.ts`, `tests/ci/_metaE2eWorkflowCoverage.test.ts`, `tests/ci/_metaSpecRegistration.test.ts`; (b) docs/registry fan-out — spec, plan, BACKLOG*, ledger row, READMEs, and the cross-step spec's §5 PREAMBLE + L3 (both restated from an active residual to a closed condition, not a pointer note) — each brief carrying its file list inline → both APPROVE; push; PR; real CI green; `gh pr merge --merge`; ff-sync main to `0  0`.

## Pre-push ladder record (contract, not a transcript)

The pre-push ladder (`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`) is re-run at FINAL HEAD after the review train ends; merge is gated on real CI for this PR, not on any local transcript. Standing machine context (from the cross-step arc, same box): the local full suite carries a rotating single failure among DB-touching/process-spawning specs under sibling-session contention, each green isolated; the guard suites specific to this diff must be green on every run.
