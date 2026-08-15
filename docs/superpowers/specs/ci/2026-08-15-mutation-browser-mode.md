# Browser-mutant mode for the source-mutation harness (`BL-MUTATION-HARNESS-PLAYWRIGHT-COMPONENT-MODE`)

**Status:** DRAFT · **Date:** 2026-08-15 · **Arc:** `feat/mutation-playwright-component-mode` ·
**Graduates:** `BL-MUTATION-HARNESS-PLAYWRIGHT-COMPONENT-MODE`, `BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT`

## §0 Why this exists

The mutation score is the one review-convergence criterion this project has measured to
terminate: an enrolled vitest surface settles "does the guard pin what it claims" by machine
(the `mutation:guards` package script), while the two arcs whose guard surfaces the
registry could NOT express burned the worst round counts in the corpus — step3-a11y spent six
of nine diff rounds hand-discovering mutants (`docs/review-rounds/fix/step3-a11y-cluster/61281c23e8ce.md`),
and the classname equivalence scripts drew fifty false-pass findings across fourteen diff
rounds (`docs/review-rounds/refactor/classname-array-join-cn/9bd0a8456151.md`).

The existing harness spawns one `vitest` child per mutant
(`tests/mutation/guardSurfaces.gate.test.ts:11`) and serves the mutant from memory through a
Vite `load` hook (`tests/mutation/source/overlay.ts:32`). A Playwright guard suite cannot run
in a vitest child, its mutants are bespoke `.tsx` component edits no declared operator
expresses (`tests/mutation/source/operators.ts:17`), and its runtime is real-browser — the
three capability gaps measured by the 2026-08-09 probe
(`docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md` §1.1.4, recorded verbatim in
`BACKLOG.md` under `BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT`). This spec closes all three for
one bounded class of surface.

## §1 Scope

A new **browser-mutant mode**: registry, runner, and gate for guard surfaces whose deciding
suite is a **standalone-harness Playwright spec** — a spec that builds its own browser bundle
out-of-process with esbuild and serves it from its own http server
(`tests/e2e/standalone.config.ts:4-10`), needing no Next server and no Supabase. First and
only enrolled customer in this arc: `tests/e2e/tap-target-floor.layout.spec.ts`, with the
nineteen isolating mutants already enumerated in `BACKLOG.md` under
`BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT`.

### §1.1 Resolved scope — do not relitigate

Each decision below was ratified by the user in the 2026-08-15 design session that opened
this arc, or is fenced by an existing ratified document. Verify the citation; do not re-derive.

1. **Standalone-harness specs only.** Next-server e2e specs (anything under
   `playwright.config.ts` projects that boot dev servers) are OUT of scope — a documented
   limit (§8.1), not a finding. Ratified 2026-08-15 (design session, question 1).
2. **Explicit enumerated mutants only.** The operator family is a per-surface list of
   `{file, from, to, reason}` rows. NO generic className-token operators, no AST discovery
   over JSX — each widening of a recognizer is a bigger target for the next review round
   (AGENTS.md, "Repair direction under same-axis recurrence"). Ratified 2026-08-15
   (design session, question 2).
3. **Own command plus a non-required CI job.** `pnpm mutation:browser` is a separate entry
   point; `pnpm mutation:guards` keeps its current runtime. The CI job is never a
   branch-protection required check. Ratified 2026-08-15 (design session, question 3).
4. **This arc enrols the tap-target surface and graduates both ledger rows.** The enrolment
   run is the acceptance test. Ratified 2026-08-15 (design session, question 4).
5. **No dark registry rows.** A surface is enrolled only when the runner can execute its
   mutants — the WATCH row's own fence ("Do not relitigate this toward shipping a registry
   row the harness cannot run", `BACKLOG.md`, `BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT` probe
   block). This spec ships the runner first and the row with it.
6. **Reuse, not reimplementation, of the scoring stack.** `evaluateGate`
   (`tests/mutation/source/gate.ts:36`), `reconcile`/`score`/`AcceptedSurvivor`
   (`tests/mutation/source/ledger.ts:45`, `tests/mutation/source/ledger.ts:79`, `tests/mutation/source/ledger.ts:20`) are kind-agnostic pure functions and are
   imported unchanged. A browser-side fork of any of them is a defect.

## §2 Registry contract

New module (this arc creates it) at tests/mutation/browser/registry.ts:

```ts
export type ExplicitMutant = {
  /** Repo-relative path of the component file the edit targets. */
  file: string;
  /** Exact source text to replace. MUST occur exactly once in `file`. */
  from: string;
  /** Replacement text. `""` expresses a removal. MUST differ from `from`. */
  to: string;
  /** What production defect this mutant isolates, with its origin citation. */
  reason: string;
};

export type BrowserGuardSurface = {
  id: string;
  /** The deciding Playwright invocation, all fields explicit. */
  suite: {
    /** Repo-relative Playwright config path. */
    config: string;
    /** Filename filter passed to the CLI (positional arg). */
    filter: string;
    /** Project name passed via --project. */
    project: string;
  };
  mutants: ExplicitMutant[];
  /** Minimum acceptable mutation score, in (0, 1]. */
  scoreFloor: number;
  /** Liveness control: a hand-chosen edit the suite must obviously kill. */
  control: ExplicitMutant;
  accepted: AcceptedSurvivor[]; // imported from ../source/ledger
};
```

**Site id.** `explicit:<file>:<line>:<fromKey>><toKey>` where `<line>` is the 1-based line
of the unique `from` occurrence at run time and `<file>` is the repo-relative path. Position
is included for the same reason the vitest mode includes it
(`tests/mutation/source/operators.ts:42-47`): an edit above the site drifts the id,
surfacing as a stale ledger row plus a new unaccepted survivor instead of silently
re-matching. `<fromKey>`/`<toKey>` are the text with newlines collapsed to `\n` escapes,
truncated to the first 40 characters and suffixed `…<totalLength>` when truncation occurred
— deterministic, so a multi-line `from` still yields a stable, legible key.

**Static validation** (`validateBrowserSurface`, same file; mirrors `validateSurface`,
`tests/mutation/source/registry.ts:56`): every `file` exists; every `from` occurs EXACTLY
once in its file (zero is an unreachable mutant, two is an ambiguous anchor — both are
authoring errors, same rule as the vitest control anchor,
`tests/mutation/source/registry.ts:88-98`); `from !== to`; `mutants` non-empty; `reason`
non-empty; `scoreFloor` finite in (0, 1]; suite `config` and a file matching `filter` exist;
`accepted` rows follow the ledger rules verbatim (duplicate ids, empty reasons, accepted-gap
`ref` shaped `BL-*`/`DEF-*`) — reusing the existing checks rather than restating them where
importable. Validation failures are gate failures, reported all at once.

**Flag lifecycle** (the mode's two env vars):

| var | storage | write path | read path | effect |
| --- | --- | --- | --- | --- |
| `MUTATION_TARGET` | child env | browser runner (§3.3) | `tests/e2e/_tapTargetFloorBundle.mjs` overlay plugin (§3.1) | absolute path of the module whose text is replaced in the bundle |
| `MUTATION_MUTANT` | child env | browser runner (§3.3) | bundle overlay plugin (§3.1) AND the spec's `beforeAll` CSS assembly (§3.2) | absolute path of the temp file holding the mutated source |

Same names as the vitest mode (`tests/mutation/source/runner.ts:82-84`) by design: the
consumers are disjoint (Vite config there, esbuild script + spec `beforeAll` here), and one
vocabulary means one mental model. Both unset ⇒ every consumer behaves byte-identically to
today; the meta-test in §6 pins that.

## §3 Mechanics

### §3.1 Bundle overlay

`tests/e2e/_tapTargetFloorBundle.mjs` gains an esbuild `onLoad` plugin, `enforce`-equivalent
by registration order (first plugin wins in esbuild's onLoad chain): when `MUTATION_TARGET`
and `MUTATION_MUTANT` are both set, a load of the resolved `MUTATION_TARGET` path returns the
contents of `MUTATION_MUTANT` instead of the disk file. Exactly the vitest overlay's
recognition posture (`tests/mutation/source/overlay.ts:21-34`): match on the resolved
absolute path, nothing else — a suffix match would overlay a same-named module elsewhere in
the graph. Env unset ⇒ the plugin is not registered at all. The tracked source file is never
written; a crashed run cannot leave a mutant on disk (same invariant as
`tests/mutation/source/runner.ts:16-18`).

### §3.2 CSS visibility

Tailwind's utilities are compiled by scanning source DIRECTORIES on disk
(`tests/e2e/tap-target-floor.layout.spec.ts:174-188`), which cannot see an in-memory overlay.
A mutant that introduces a class absent from the baseline stylesheet (`rounded-[14px]` is in
the enrolment payload) would render UNSTYLED and the verdict would measure a CSS-compilation
artifact, not the production edit. So the spec's `beforeAll` CSS assembly appends one line
when `MUTATION_MUTANT` is set:

```
@source "<MUTATION_MUTANT>";
```

Tailwind scans candidate tokens textually, so pointing `@source` at the temp mutant file adds
the mutant's classes to the stylesheet. The ORIGINAL file remains scanned via its directory
line; the union is correct by construction — a utility the mutant no longer references is
inert in CSS, and the mutant's new classes now exist. No other CSS change.

### §3.3 Runner

New module (this arc creates it) at tests/mutation/browser/runner.ts, serial by design like the vitest runner
(`tests/mutation/source/runner.ts:13`):

1. **Baseline first, unmutated:** run the suite with both env vars unset. A red baseline
   aborts the surface — against a red suite every mutant scores KILLED and the score is
   meaningless (`tests/mutation/source/runner.ts:125-131`). The baseline also closes the
   Playwright no-tests trap: a misconfigured `filter`/`project` exits non-zero (or resolves
   zero tests) and fails HERE, before any mutant can be misclassified.
2. **Per mutant:** read `file`, verify the unique `from` occurrence (a drifted anchor is a
   validation failure, not a silent skip), write the substituted text to
   a mutant file in a fresh `mkdtempSync` scratch directory, spawn the suite once via
   `execFileSync(process.execPath, ["node_modules/.bin/playwright", "test", "--config", suite.config, suite.filter, "--project", suite.project], ...)`
   with `MUTATION_TARGET`/`MUTATION_MUTANT` set.
3. **Verdicts:** exit 0 ⇒ SURVIVED; numeric non-zero ⇒ KILLED; no numeric status (signal
   death, OOM, spawn failure) ⇒ throw the imported `MutantRunInfraError`
   (`tests/mutation/source/runner.ts:46`) — NEVER folded into KILLED, for the reaper reason
   documented there.
4. **Control:** after the mutant loop, run the surface's `control` the same way; a control
   the suite does not kill is a gate failure (overlay-liveness proof, same contract as
   `runControl`, `tests/mutation/source/runner.ts:170`).

Temp files live under `mkdtempSync(tmpdir())` and are removed in `finally`
(`tests/mutation/source/runner.ts:121-157` pattern).

### §3.4 Score, ledger, gate

`RunResult` uses the existing shape (`tests/mutation/source/runner.ts:22-30`), feeding
`evaluateGate` unchanged: all nine gate conditions (`tests/mutation/source/gate.ts:10-19`)
apply, including accounting (`killed + distinct survivors === mutantCount`) and the
zero-mutant/NaN defences. The control verdict is asserted by the browser gate SUITE (§3.5)
as its own expectation alongside the `evaluateGate` result — `evaluateGate` itself is
imported unmodified per §1.1.6, exactly as the vitest gate suite asserts its control
separately today (`tests/mutation/guardSurfaces.gate.test.ts` imports `runControl` beside
`evaluateGate`). Explicit mutants cannot be no-ops by construction (`from !== to`,
occurrence exactly 1), so the no-op path is structurally empty here; the gate still receives
`noOps: []` and would report any future regression.

### §3.5 Gate suite and command

New env-gated vitest suite (this arc creates it) at tests/mutation/browser/browserSurfaces.gate.test.ts, mirroring
`tests/mutation/guardSurfaces.gate.test.ts`: `describe.each` over the browser registry,
skipped unless `VITEST_INCLUDE_MUTATION_HARNESS=1`. Command:

```
"mutation:browser": "VITEST_INCLUDE_MUTATION_HARNESS=1 vitest run --project mutation tests/mutation/browser/browserSurfaces.gate.test.ts"
```

The `mutation` vitest project's include list is explicit (`vitest.projects.ts:84-91`), so
the new gate file is added there in both entries, mirroring
`tests/mutation/guardSurfaces.gate.test.ts` (`vitest.projects.ts:87`, `vitest.projects.ts:91`); its unit suites
under `tests/mutation/browser/*.test.ts` run in the default fast project via the existing
`tests/mutation/**/*.test.{ts,tsx}` include (`vitest.projects.ts:138`).

**Heavy-phase classification:** the suite transitively spawns non-interactive Playwright, so
`pnpm mutation:browser` is a MUST-wrap member of the machine-wide slot semaphore by the
transitive shape rule (AGENTS.md, heavy-phase section). The AGENTS.md known-member list gains
this entry in the same PR, and the derived-cover sweep regex gains nothing (the runner spawns
`node_modules/.bin/playwright` via `process.execPath`, so the plan adds the member entry
explicitly rather than relying on the `execFileSync("pnpm"...)` sweep to find it).

## §4 First customer: tap-target enrolment

One `BrowserGuardSurface` row:

- `id: "tapTargetFloor"`, suite `{config: "tests/e2e/standalone.config.ts", filter: "tap-target-floor", project: "standalone-chromium"}` (project names at `tests/e2e/standalone.config.ts:100`; the `standalone-webkit-a11y` project matches only `agendaScheduleLayout` and is untouched, `tests/e2e/standalone.config.ts:115`).
- `mutants`: the nineteen isolating edits enumerated in `BACKLOG.md` under
  `BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT`, reconstructed as exact `{file, from, to}` rows
  from the eight repair commits that introduced and reverted them (`893793235`, `95e9eb4a7`,
  `06cc09ed1`, `fc628f3e9`, `cc9fcfe4d`, `e88e7e0f6`, `0bce8e51c`, `50f2478e1` — all verified
  present 2026-08-15). Reconstruction is an implementation task with its own verification:
  each row's `reason` cites its source commit.
- `scoreFloor: 1`.
- `control`: strip `min-h-tap-min` from one repaired control (chosen at implementation from a
  mutant-adjacent site NOT already in the mutant list, so control and mutants stay disjoint).
- `accepted: []` at authoring. **Expected outcome: 19/19 killed** — every mutant was observed
  killing locally during the step3 arc (`BACKLOG.md`, WATCH row: "each ... run locally and
  reverted"). Any survivor is NEW information: triage in-arc to a repaired suite gap, an
  `equivalent` row with the argument, or an `accepted-gap` row with a `BL-` ref — the
  standard ledger split (`tests/mutation/source/ledger.ts:5-17`).

**Measured budget** (2026-08-15, this machine, dated record): baseline run of the suite is 56
tests in 53.9 s including its own esbuild bundle + Tailwind compile. 19 mutants + baseline +
control ≈ 21 child runs ≈ **~20-25 min wall-clock** under one heavy slot.

## §5 CI

New workflow (this arc creates it) at .github/workflows/mutation-browser.yml, cloned from the
`mutation-harness.yml` trigger posture (schedule + `workflow_dispatch` + path-filtered
`pull_request`; NOT a required check; red runs are triaged, not merge-blocking —
`.github/workflows/mutation-harness.yml:1-31`):

- `schedule`: nightly, off-peak, offset from the parser harness's `0 7 * * *` so the two
  never contend (`17 8 * * *`).
- `pull_request` paths: this workflow file, `tests/mutation/browser/**`,
  `tests/e2e/_tapTargetFloorBundle.mjs`, `tests/e2e/tap-target-floor.layout.spec.ts`,
  `tests/e2e/standalone.config.ts` — the surfaces whose edits can change a verdict.
- Job: `pnpm install`, playwright browser install (chromium only), `pnpm mutation:browser`.
  `timeout-minutes: 60`. Least-privilege permissions, same posture as the parser job.
- Local-passes-CI-fails is its own bug class (AGENTS.md cross-cutting): close-out verifies a
  REAL Actions run via the path-filtered `pull_request` firing on this PR (the workflow file
  is on the PR head, so `workflow_dispatch` cannot validate it pre-merge — same reasoning as
  `mutation-harness.yml`'s own comment).

## §6 The mode's own modules are enrolled surfaces (promotion P2 applied to itself)

The new decision logic is guard code with the defect class "reports OK while the output
moved", so it is authored as importable lib-shaped modules with referring vitest suites from
the start and enrolled in the EXISTING vitest registry (`tests/mutation/source/registry.ts:151`)
before this arc's first review dispatch, per AGENTS.md convergence-criterion bullet 4:

- tests/mutation/browser/registry.ts (new; validation + site-id derivation) — enrolled, with
  its new sibling suite tests/mutation/browser/registry.test.ts as the deciding suite.
- tests/mutation/browser/runner.ts (new) — the spawn boundary itself is not expressible without
  executing Playwright (the same shape limit the step3 filing recorded), so the pure parts
  (substitution, verdict mapping, outcome accounting) are extracted into
  a new tests/mutation/browser/mutate.ts, enrolled; the residual spawn wrapper stays thin and is
  covered by the meta-test below plus the enrolment run itself. Anything the registry cannot
  express is stated here rather than enrolled symbolically.
- A wiring meta-test pins that `_tapTargetFloorBundle.mjs` with env UNSET is byte-identical
  in behavior (the plugin list contains no overlay entry) and that the spec's `beforeAll`
  emits no extra `@source` line — the "flag off means off" half of the §2 lifecycle table.

The round-1 review brief states this arc's own scores and unaccepted-survivor sets, as the
bullet requires.

## §7 Guard conditions

| input | condition | behavior |
| --- | --- | --- |
| `from` occurs 0 times | drifted or wrong anchor | validation failure, gate red, mutant not run |
| `from` occurs 2+ times | ambiguous anchor | validation failure, gate red |
| `from === to` | no-op mutant | validation failure at authoring |
| suite filter resolves 0 tests | misconfigured suite | baseline exits non-zero ⇒ gate `baseline` failure |
| child dies on signal | reaper / OOM | `MutantRunInfraError` thrown; run aborts; NEVER scored KILLED |
| control survives | dead overlay or dead suite | gate `control-survived` failure |
| registry empty | nothing enrolled | gate suite reports zero surfaces and FAILS (`no-mutants` analog) — an empty browser registry after this arc means the enrolment was deleted, which must be loud |
| env vars set but files missing | broken runner contract | bundle script exits non-zero ⇒ baseline/mutant child non-zero; distinguished from KILLED by the baseline bracket: implementation asserts the mutant child's failure is a TEST failure (Playwright ran) by requiring the baseline green first and the control killed after, so a systemically-broken bundle fails one of the two brackets |

## §8 Documented limits (round 0)

1. **Next-server e2e surfaces are out of scope.** No bundler seam exists; expressing them
   needs per-mutant tree writes + server lifecycle. Files here, not to a finding (§1.1.1).
2. **A flaky test kill inflates the score.** A nondeterministic failure during a mutant child
   scores that mutant KILLED without the suite having earned it. The suite has been stable
   (56/56 green in CI and locally; the baseline + control brackets both re-exercise it every
   run), and survivors — the score-relevant direction — are deterministic re-runs by nature
   of the gate re-running nightly. Re-running every KILLED mutant to confirm would double a
   ~25-minute run for a defect class with no observed instance; if flake is ever observed
   here, that observation files a `BL-` row for a confirm-kill re-run mode.
3. **The json reporter file is shared.** Every child overwrites the untracked
   standalone-report.json under test-results/ (`tests/e2e/standalone.config.ts:97`). The runner is
   serial, the file is untracked, and the CI baseline comparator reads only its own run's
   output, so this is inert — recorded so nobody parallelizes the mutant loop without seeing it.
4. **Stale CSS residue.** §3.2's union stylesheet keeps utilities the mutant no longer
   references. Inert by construction; recorded because it is observable in the compiled CSS.
5. **Runtime is minutes, not seconds.** ~20-25 min for the first surface (measured, §4). The
   enrol-before-round-1 workflow holds — the run is dispatched once per arc event, not per
   edit — but this mode is not the 93 s loop the vitest mode is, and briefs should quote the
   real number.

## §9 Acceptance criteria

- AC-1: `pnpm mutation:browser` runs the tap-target surface end-to-end: baseline green,
  19 mutants classified, control killed, gate evaluated with all conditions.
- AC-2: score meets `scoreFloor: 1` with an empty unaccepted-survivor set, OR every survivor
  carries a triaged ledger row per §4 and the floor/ledger are reconciled in the same PR.
- AC-3: env vars unset ⇒ `_tapTargetFloorBundle.mjs` and the tap-target spec behave
  identically to today, pinned by the §6 wiring meta-test; the unmodified sibling
  `_step3ReviewModalBundle.mjs` is untouched byte-for-byte.
- AC-4: the §6 enrolments exist in `tests/mutation/source/registry.ts` before the first
  review dispatch, and the round-1 brief states their scores.
- AC-5: the new mutation-browser.yml workflow fires on this PR via its path filter and the
  run is green on real Actions before merge.
- AC-6: AGENTS.md heavy-phase member list names `pnpm mutation:browser`.
- AC-7: both ledger rows graduate to `BACKLOG-archive.md` with terminal states; the
  IN PROGRESS markers come off in the PR's final commit (invariant 12); the specs/ci README
  gains this spec's index row.
- AC-8: `impeccable-gate: N/A — no UI surface` (no file under `app/` or `components/` is
  touched; the two e2e-harness files are test infrastructure).

## §10 Non-goals

- Generic className/AST operators for components (§1.1.2).
- Expressing Next-server e2e suites (§8.1).
- Parallel mutant execution (§8.3 records why serial is load-bearing today).
- Confirm-kill re-runs for flake (§8.2 records the trigger that would file it).
- Any change to the parser mutation harness (`tests/parser/mutation/**`) or the vitest-mode
  runner/gate/ledger beyond the imports named in §1.1.6.
