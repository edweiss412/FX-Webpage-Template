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
suites are a **standalone-harness Playwright spec** — a spec that builds its own browser
bundle out-of-process with esbuild and serves it from its own http server
(`tests/e2e/standalone.config.ts:4-10`), needing no Next server and no Supabase — optionally
joined by companion vitest suites that share the kill decision. First and only enrolled
customer in this arc: the tap-target surface, deciding suites
`tests/e2e/tap-target-floor.layout.spec.ts` plus
`tests/components/admin/wizard/Step3Review.test.tsx`, with the nineteen isolating mutants
already enumerated in `BACKLOG.md` under `BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT`.

### §1.1 Resolved scope — do not relitigate

Each decision below was ratified by the user in the 2026-08-15 design session that opened
this arc, or is fenced by an existing ratified document. Verify the citation; do not re-derive.

1. **Standalone-harness specs only.** Next-server e2e specs (anything under
   `playwright.config.ts` projects that boot dev servers) are OUT of scope — a documented
   limit (§8.1), not a finding. Ratified 2026-08-15 (design session, question 1).
2. **Explicit enumerated mutants only.** The operator family is a per-surface list of
   explicit edits. NO generic className-token operators, no AST discovery over JSX — each
   widening of a recognizer is a bigger target for the next review round (AGENTS.md,
   "Repair direction under same-axis recurrence"). Ratified 2026-08-15
   (design session, question 2).
3. **Own command plus a non-required CI job.** `pnpm mutation:browser` is a separate entry
   point; `pnpm mutation:guards` keeps its current runtime. The CI job is never a
   branch-protection required check. Ratified 2026-08-15 (design session, question 3).
4. **This arc enrols the tap-target surface and graduates both ledger rows.** The enrolment
   run is the acceptance test. Ratified 2026-08-15 (design session, question 4).
5. **No dark registry rows.** A surface is enrolled only when the runner can execute its
   mutants — the WATCH row's own fence ("Do not relitigate this toward shipping a registry
   row the harness cannot run", `BACKLOG.md`, `BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT` probe
   block). This spec ships the runner first and the row with it. The mixed-kind suite list
   (§2) exists for the same reason: payload mutant #17 is killed by a vitest suite, and
   without the vitest kind it would enrol as a guaranteed survivor.
6. **Reuse, not reimplementation, of the scoring stack.** `evaluateGate`
   (`tests/mutation/source/gate.ts:36`), `reconcile`/`score`/`AcceptedSurvivor`
   (`tests/mutation/source/ledger.ts:45`, `tests/mutation/source/ledger.ts:79`,
   `tests/mutation/source/ledger.ts:20`) are kind-agnostic pure functions and are imported
   unchanged. A browser-side fork of any of them is a defect.

## §2 Registry contract

New module (this arc creates it) at tests/mutation/browser/registry.ts:

```ts
export type MutantEdit = {
  /** Repo-relative path of the file the edit targets. Must exist. */
  file: string;
  /** Exact source text to replace. MUST occur exactly once in `file`. */
  from: string;
  /** Replacement text. `""` expresses a removal. MUST differ from `from`. */
  to: string;
};

export type ExplicitMutant = {
  /** Surface-unique stable key; the ledger/site id is `explicit:<key>`. */
  key: string;
  /** 1..N substitutions applied together as ONE atomic mutant. */
  edits: MutantEdit[];
  /** What production defect this mutant isolates, with its origin citation. */
  reason: string;
};

export type DecidingSuite =
  | { kind: "playwright"; config: string; filter: string; project: string }
  | { kind: "vitest"; path: string };

export type BrowserGuardSurface = {
  id: string;
  /** All suites run per mutant; a mutant is KILLED if ANY suite rejects it. */
  suites: DecidingSuite[];
  mutants: ExplicitMutant[];
  /** Minimum acceptable mutation score, in (0, 1]. */
  scoreFloor: number;
  /** Liveness control: a hand-chosen edit the suites must obviously kill. */
  control: ExplicitMutant;
  accepted: AcceptedSurvivor[]; // imported from ../source/ledger
};
```

**Multi-edit mutants are load-bearing, not a generalization for its own sake:** five of the
nineteen payload mutants span 2-5 sites — both pill sites for the radius swaps, two files
for the byte-identical caret className, a remove-and-add pair for the `cursor-pointer`
relocation, and five files for the `w-fit` strip (§4 payload, "Multi-site mutants" table). A
single `{file, from, to}` cannot express any of them.

**Site id.** `explicit:<key>` — content-anchored, not positional. The vitest mode derives
ids from position so that drift surfaces as a stale-plus-new pair
(`tests/mutation/source/operators.ts:42-47`); an explicit mutant's anchor is the `from` text
itself, so drift surfaces EARLIER and LOUDER as a validation failure (a `from` that no
longer occurs exactly once fails the gate before any child spawns). Key uniqueness within a
surface is validated; a duplicate key is a validation failure.

**Static validation** (`validateBrowserSurface`, same file; mirrors `validateSurface`,
`tests/mutation/source/registry.ts:56`): for every edit of every mutant and the control —
`file` exists; `from` occurs EXACTLY once in `file` (zero is an unreachable mutant, two is
an ambiguous anchor — both authoring errors, same rule as the vitest control anchor,
`tests/mutation/source/registry.ts:88-98`); `from !== to`. Per mutant: `edits` non-empty,
`reason` non-empty, `key` unique. Per surface: `mutants` non-empty; `scoreFloor` finite in
(0, 1]; every playwright suite's `config` exists and a spec file matching `filter` exists;
every vitest suite's `path` exists; `accepted` rows follow the ledger rules verbatim
(duplicate ids, empty reasons, accepted-gap `ref` shaped `BL-*`/`DEF-*`) — reusing the
existing checks rather than restating them where importable. Validation failures are gate
failures, reported all at once, BEFORE any child spawns.

**Flag lifecycle** (the mode's one env var):

| var | storage | write path | read path | effect |
| --- | --- | --- | --- | --- |
| `MUTATION_OVERLAY_MANIFEST` | child env | browser runner (§3.3) | (a) the bundle script's overlay plugin (§3.1); (b) the tap-target spec's `beforeAll` CSS assembly (§3.2); (c) the browser-mode vitest overlay config (§3.3) | absolute path of a JSON manifest `{entries: [{target, mutant}]}` mapping each overlaid module to the temp file holding its mutated text |

One manifest, consumed by every overlay layer, expressing N-file mutants uniformly. The
vitest mode's `MUTATION_TARGET`/`MUTATION_MUTANT` pair
(`tests/mutation/source/runner.ts:82-84`) is untouched and never read by this mode — one
mechanism per mode, no aliasing. Env unset ⇒ every consumer behaves byte-identically to
today; the meta-test in §6 pins that.

## §3 Mechanics

### §3.1 Bundle overlay

`tests/e2e/_tapTargetFloorBundle.mjs` gains an esbuild `onLoad` plugin registered first
(esbuild runs `onLoad` callbacks in registration order; the first non-undefined result
wins): when `MUTATION_OVERLAY_MANIFEST` is set, the plugin EAGERLY, at registration time,
parses the manifest and reads every `mutant` file — any missing or unreadable entry is a
loud failure BEFORE the build begins (this eager read is half of the §3.4 verdict-integrity
contract) — then, after all entries validate, writes the sentinel file `<manifest>.ok` and
serves each entry's mutant text for a load of its resolved `target` path. Recognition
matches the vitest overlay's posture (`tests/mutation/source/overlay.ts:21-34`): resolved
absolute path equality, nothing else — a suffix match would overlay a same-named module
elsewhere in the graph. Env unset ⇒ the plugin is not registered at all. Tracked source
files are never written; a crashed run cannot leave a mutant on disk (same invariant as
`tests/mutation/source/runner.ts:16-18`).

### §3.2 CSS visibility

Tailwind's utilities are compiled by scanning source DIRECTORIES on disk
(`tests/e2e/tap-target-floor.layout.spec.ts:174-188`), which cannot see an in-memory
overlay. A mutant that introduces a class absent from the baseline stylesheet
(`rounded-[14px]` is in the enrolment payload) would render UNSTYLED and the verdict would
measure a CSS-compilation artifact, not the production edit. So the spec's `beforeAll` CSS
assembly appends, when `MUTATION_OVERLAY_MANIFEST` is set, one line per manifest entry:

```
@source "<entry.mutant>";
```

Tailwind scans candidate tokens textually, so pointing `@source` at each temp mutant file
adds the mutant's classes to the stylesheet. The ORIGINAL files remain scanned via their
directory lines; the union is correct by construction — a utility the mutant no longer
references is inert in CSS, and the mutant's new classes now exist. No other CSS change.

### §3.3 Runner

New module (this arc creates it) at tests/mutation/browser/runner.ts, serial by design like
the vitest runner (`tests/mutation/source/runner.ts:13`):

1. **Baseline first, unmutated:** run every declared suite with the env var unset. A red
   baseline aborts the surface — against a red suite every mutant scores KILLED and the
   score is meaningless (`tests/mutation/source/runner.ts:125-131`). The baseline also
   closes the no-tests trap for both kinds: a playwright `filter`/`project` that resolves
   zero tests, and a vitest `path` with no matching files, both exit non-zero and fail
   HERE, before any mutant can be misclassified.
2. **Per mutant (and the control):** validate every edit's `from` against the live file
   (drift is a loud validation failure, not a silent skip), write each edited file's full
   text to a fresh `mkdtempSync` scratch directory, write the JSON manifest, delete any
   stale `<manifest>.ok` sentinel, then run each declared suite in order with
   `MUTATION_OVERLAY_MANIFEST` set — vitest suites first (cheap, ~seconds), playwright
   after — short-circuiting on the first kill, mirroring `runAllSuites`
   (`tests/mutation/source/runner.ts:104-116`).
3. **Child invocations.** Playwright kind:
   `execFileSync("pnpm", ["exec", "playwright", "test", "--config", suite.config, suite.filter, "--project", suite.project], ...)`
   — through `pnpm exec`, exactly as the existing harness spawns vitest
   (`tests/mutation/source/childRun.ts:18`); the `node_modules/.bin/*` entries are shell
   shims and are never handed to `process.execPath`. Vitest kind:
   `execFileSync("pnpm", ["exec", "vitest", "run", "--config", "tests/mutation/browser/vitestOverlay.config.ts", suite.path], ...)`
   — a new thin config whose only additions over the suite's normal environment are the
   manifest-driven overlay (per-entry `load` hooks built from `createMutantLoadHook`,
   `tests/mutation/source/overlay.ts:32`) and the same eager-validate-then-sentinel
   behavior as §3.1.
4. **Signal deaths:** a child with no numeric exit status (signal, OOM, spawn failure)
   throws the imported `MutantRunInfraError` (`tests/mutation/source/runner.ts:46`) — NEVER
   folded into KILLED, for the reaper reason documented there.
5. **Control:** after the mutant loop, the surface's `control` runs under the identical
   per-mutant procedure; a control no suite kills is a gate failure (overlay-liveness
   proof, same contract as `runControl`, `tests/mutation/source/runner.ts:170`).

Temp files live under `mkdtempSync` scratch directories removed in `finally`
(`tests/mutation/source/runner.ts:121-157` pattern).

### §3.4 Verdict integrity — a non-zero exit is not evidence by itself

A mutant-child failure has three distinguishable causes: the suite noticed the mutant
(detection), the mutant broke compilation (detection, the analog of the vitest mode's
compile-failure limit L-3), and the HARNESS failed before the overlay was live (not
detection — scoring it KILLED fabricates a kill, and a systematically broken setup would
fabricate a perfect score). The vitest mode's oracle maps every non-zero to KILLED
(`tests/mutation/source/oracle.ts:12`) and tolerates that only because its overlay cannot
fail per-mutant after the runner writes the file; this mode's overlay CAN (manifest path
typo, unreadable temp dir), so verdicts require evidence:

- **Overlay sentinel.** Both overlay layers (§3.1 bundle plugin, §3.3 vitest config)
  validate the manifest eagerly and write `<manifest>.ok` only after every entry's mutant
  text has been read. The runner deletes the sentinel before each child and checks it
  after.
- **Execution evidence (playwright kind).** The standalone config always writes a json
  report (`tests/e2e/standalone.config.ts:97`). The runner deletes it before each
  playwright child and reads it after; "tests ran" means the fresh report exists and
  records at least one executed test.

Verdict table for a suite child run with the env var set (baseline is env-unset and must
simply be green with tests ran):

| sentinel | exit | report (playwright kind) | verdict |
| --- | --- | --- | --- |
| present | 0 | ≥1 test executed | this suite did not kill (SURVIVED if no suite kills) |
| present | 0 | absent / 0 tests | `MutantRunInfraError` — a silent no-op run can never count as survival evidence |
| present | non-zero | any | KILLED (assertion failure, or mutant-induced compile/bundle death — §8.6) |
| absent | any | any | `MutantRunInfraError` — the overlay never validated, so nothing this child did observed the mutant |

The vitest kind uses the same table minus the report column (sentinel present + exit 0 =
did-not-kill; the no-tests case is closed at baseline, §3.3 step 1). Every
`MutantRunInfraError` aborts the run loudly; none is scored.

### §3.5 Score, ledger, gate

`RunResult` uses the existing shape (`tests/mutation/source/runner.ts:22-30`), feeding
`evaluateGate` unchanged: all nine gate conditions (`tests/mutation/source/gate.ts:10-19`)
apply, including accounting (`killed + distinct survivors === mutantCount`) and the
zero-mutant/NaN defences. The control verdict is asserted by the browser gate SUITE (§3.6)
as its own expectation alongside the `evaluateGate` result — `evaluateGate` itself is
imported unmodified per §1.1.6, exactly as the vitest gate suite asserts its control
separately today (`tests/mutation/guardSurfaces.gate.test.ts` imports `runControl` beside
`evaluateGate`). Explicit mutants cannot be no-ops by construction (`from !== to` per edit,
occurrence exactly 1), so the no-op path is structurally empty here; the gate still
receives `noOps: []` and would report any future regression.

### §3.6 Gate suite and command

New env-gated vitest suite (this arc creates it) at
tests/mutation/browser/browserSurfaces.gate.test.ts, mirroring
`tests/mutation/guardSurfaces.gate.test.ts`: `describe.each` over the browser registry,
skipped unless `VITEST_INCLUDE_MUTATION_HARNESS=1`, plus a non-env-gated structural case
asserting the registry is non-empty once this arc lands (an empty browser registry after
enrolment means the enrolment was deleted, which must be loud). Command:

```
"mutation:browser": "VITEST_INCLUDE_MUTATION_HARNESS=1 vitest run --project mutation tests/mutation/browser/browserSurfaces.gate.test.ts"
```

The `mutation` vitest project's include list is explicit (`vitest.projects.ts:84-91`), so
the new gate file is added there in both entries, mirroring
`tests/mutation/guardSurfaces.gate.test.ts` (`vitest.projects.ts:87`,
`vitest.projects.ts:91`); its unit suites under `tests/mutation/browser/*.test.ts` run in
the default fast project via the existing `tests/mutation/**/*.test.{ts,tsx}` include
(`vitest.projects.ts:138`).

**Heavy-phase classification:** the gate suite transitively spawns non-interactive
Playwright, so `pnpm mutation:browser` is a MUST-wrap member of the machine-wide slot
semaphore by the transitive shape rule (AGENTS.md, heavy-phase section). The AGENTS.md
known-member list gains this entry in the same PR — stated explicitly because the runner's
spawn shape (`execFileSync("pnpm", ["exec", "playwright", ...])`) is not matched by the
member list's derived-cover sweep regex, so the sweep alone would not discover it.

## §4 First customer: tap-target enrolment

One `BrowserGuardSurface` row:

- `id: "tapTargetFloor"`; `suites`:
  `{kind: "vitest", path: "tests/components/admin/wizard/Step3Review.test.tsx"}` then
  `{kind: "playwright", config: "tests/e2e/standalone.config.ts", filter: "tap-target-floor", project: "standalone-chromium"}`
  (project names at `tests/e2e/standalone.config.ts:100`; the `standalone-webkit-a11y`
  project matches only `agendaScheduleLayout` and is untouched,
  `tests/e2e/standalone.config.ts:115`). The vitest suite is load-bearing for exactly one
  mutant — the partial heading revert (payload #17) is killed by
  `tests/components/admin/wizard/Step3Review.test.tsx:809-813` and by nothing in the
  Playwright spec.
- `mutants`: the nineteen isolating edits enumerated in `BACKLOG.md` under
  `BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT`, reconstructed against the CURRENT tree as exact
  edit rows — the reconstruction table (verified-unique `from` anchors, per-mutant source
  commits `893793235`, `95e9eb4a7`, `06cc09ed1`, `fc628f3e9`, `cc9fcfe4d`, `e88e7e0f6`,
  `0bce8e51c`, `50f2478e1`, all verified present 2026-08-15) is EMBEDDED in the
  implementation plan as its enrolment payload section, so the handoff carries it inside
  the repo rather than in any session-scoped path. Two tree drifts since the mutants were
  authored, recorded in the payload and honored by the enrolment: commit `e9e80ec25`
  replaced the text carets with lucide `<ChevronRight>` SVGs (payload #8 becomes "same box,
  nothing drawable" — an empty span) and moved the administrators summary to `flex w-full`,
  which the guard now asserts INVERTED via `DI2_FULL_WIDTH_BY_DESIGN`
  (`tests/e2e/tap-target-floor.layout.spec.ts:86`), so the `w-fit` strip (payload #18) is
  FIVE sites on the current tree, not the six the BACKLOG prose records. The two
  MEDIUM-confidence rows (#8, #18) get an implementation-task step that runs each mutant
  locally and observes its named failure line before enrolment.
- `scoreFloor: 1`.
- `control`: strip `min-h-tap-min` from one repaired control (chosen at implementation from
  a mutant-adjacent site NOT already in the mutant list, so control and mutants stay
  disjoint).
- `accepted: []` at authoring. **Expected outcome: 19/19 killed** — every mutant was
  observed killing locally during the step3 arc (`BACKLOG.md`, WATCH row: "each ... run
  locally and reverted"). Any survivor is NEW information: triage in-arc to a repaired
  suite gap, an `equivalent` row with the argument, or an `accepted-gap` row with a `BL-`
  ref — the standard ledger split (`tests/mutation/source/ledger.ts:5-17`).

**Measured budget** (2026-08-15, this machine, dated record): baseline run of the
Playwright suite is 56 tests in 53.9 s including its own esbuild bundle + Tailwind compile.
19 mutants + baseline + control ≈ 21 playwright child runs plus up-to-21 fast vitest child
runs ≈ **~20-30 min wall-clock** under one heavy slot (vitest-first short-circuiting spends
seconds to sometimes save a browser boot).

## §5 CI

New workflow (this arc creates it) at .github/workflows/mutation-browser.yml, cloned from
the `mutation-harness.yml` trigger posture (schedule + `workflow_dispatch` + path-filtered
`pull_request`; NOT a required check; red runs are triaged, not merge-blocking —
`.github/workflows/mutation-harness.yml:1-31`):

- `schedule`: nightly, off-peak, offset from the parser harness's `0 7 * * *` so the two
  never contend (`17 8 * * *`).
- `pull_request` paths: this workflow file, `tests/mutation/browser/**`,
  `tests/e2e/_tapTargetFloorBundle.mjs`, `tests/e2e/tap-target-floor.layout.spec.ts`,
  `tests/e2e/standalone.config.ts`, `tests/components/admin/wizard/Step3Review.test.tsx` —
  the surfaces whose edits can change a verdict.
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
- tests/mutation/browser/runner.ts (new) — the spawn boundary itself is not expressible
  without executing Playwright (the same shape limit the step3 filing recorded), so the pure
  parts (edit application, manifest construction, the §3.4 verdict table, outcome
  accounting) are extracted into a new tests/mutation/browser/mutate.ts, enrolled; the
  residual spawn wrapper stays thin and is covered by the meta-test below plus the enrolment
  run itself. Anything the registry cannot express is stated here rather than enrolled
  symbolically.
- A wiring meta-test pins that `_tapTargetFloorBundle.mjs` with the env var UNSET registers
  no overlay plugin and that the tap-target spec's `beforeAll` emits no extra `@source`
  line — the "flag off means off" half of the §2 lifecycle table.

The round-1 review brief states this arc's own scores and unaccepted-survivor sets, as the
bullet requires.

## §7 Guard conditions

| input | condition | behavior |
| --- | --- | --- |
| any edit's `from` occurs 0 times | drifted or wrong anchor | validation failure, gate red, mutant never spawned |
| any edit's `from` occurs 2+ times | ambiguous anchor | validation failure, gate red |
| `from === to` in any edit | no-op edit | validation failure at authoring |
| duplicate mutant `key` in a surface | ledger id collision | validation failure |
| playwright filter resolves 0 tests, or vitest path matches no suite | misconfigured suite | baseline exits non-zero ⇒ gate `baseline` failure |
| child dies on signal | reaper / OOM | `MutantRunInfraError`; run aborts; NEVER scored KILLED |
| manifest missing/unreadable, or any mutant temp file unreadable | broken runner contract | overlay never writes the sentinel ⇒ `MutantRunInfraError` (§3.4), never KILLED |
| child exits 0 with no fresh report / zero tests (playwright kind) | silent no-op run | `MutantRunInfraError`, never SURVIVED (§3.4) |
| control survives every suite | dead overlay or dead suite | gate failure asserted by the gate suite (§3.5) |
| registry empty after this arc | enrolment deleted | structural gate-suite case fails loudly (§3.6) |

## §8 Documented limits (round 0)

1. **Next-server e2e surfaces are out of scope.** No bundler seam exists; expressing them
   needs per-mutant tree writes + server lifecycle. Files here, not to a finding (§1.1.1).
2. **A flaky test kill inflates the score.** A nondeterministic failure during a mutant
   child scores that mutant KILLED without the suite having earned it. The suite has been
   stable (56/56 green in CI and locally; the baseline + control brackets both re-exercise
   it every run), and survivors — the score-relevant direction — are re-examined every
   nightly run. Re-running every KILLED mutant to confirm would double a ~25-minute run for
   a defect class with no observed instance; if flake is ever observed here, that
   observation files a `BL-` row for a confirm-kill re-run mode.
3. **The json reporter file is shared.** Every child overwrites the untracked
   standalone-report.json under test-results/ (`tests/e2e/standalone.config.ts:97`). The
   runner is serial and DEPENDS on that file per child (§3.4 execution evidence), which is
   one more reason the mutant loop must never be parallelized without redesigning the
   report plumbing — recorded so nobody tries.
4. **Stale CSS residue.** §3.2's union stylesheet keeps utilities the mutant no longer
   references. Inert by construction; recorded because it is observable in the compiled CSS.
5. **Runtime is minutes, not seconds.** ~20-30 min for the first surface (measured, §4).
   The enrol-before-round-1 workflow holds — the run is dispatched once per arc event, not
   per edit — but this mode is not the 93 s loop the vitest mode is, and briefs should
   quote the real number.
6. **A mutant-induced compile/bundle death counts as detection.** Once the overlay sentinel
   proves the mutant was live, a non-zero child exit is KILLED even when the failure is a
   build error rather than an assertion — the mirror of the vitest mode's limit L-3
   (`tests/mutation/source/runner.ts:40-42` states the same posture). Explicit class-string
   edits rarely break a build, so this path should be near-empty; it is recorded because
   the §3.4 table routes through it.

## §9 Acceptance criteria

- AC-1: `pnpm mutation:browser` runs the tap-target surface end-to-end: baseline green
  across both suites, 19 mutants classified via the §3.4 evidence table, control killed,
  gate evaluated with all conditions.
- AC-2: score meets `scoreFloor: 1` with an empty unaccepted-survivor set, OR every
  survivor carries a triaged ledger row per §4 and the floor/ledger are reconciled in the
  same PR.
- AC-3: env var unset ⇒ `_tapTargetFloorBundle.mjs` and the tap-target spec behave
  identically to today, pinned by the §6 wiring meta-test; the unmodified sibling
  `_step3ReviewModalBundle.mjs` is untouched byte-for-byte.
- AC-4: the §6 enrolments exist in `tests/mutation/source/registry.ts` before the first
  implementation review dispatch, and that round's brief states their scores.
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
- Parallel mutant execution (§8.3 records why serial is load-bearing).
- Confirm-kill re-runs for flake (§8.2 records the trigger that would file it).
- Any change to the parser mutation harness (`tests/parser/mutation/**`) or the vitest-mode
  runner/gate/ledger beyond the imports named in §1.1.6.
