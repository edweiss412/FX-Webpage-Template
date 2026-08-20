# Handoff — browser mutation gate child lifetime

Spec and plan are complete and accepted. **This document is for the implementer**; everything below
was paid for once already and should not be re-derived.

## Where the work is

| | |
| --- | --- |
| **Branch** | `fix/mutation-browser-child-lifetime` |
| **Spec** | `docs/superpowers/specs/ci/2026-08-20-browser-child-lifetime-design.md` |
| **Plan** | `docs/superpowers/plans/ci/2026-08-20-browser-child-lifetime.md` |
| **Probe** | `docs/superpowers/specs/ci/probes/2026-08-20-browser-child-wallclock-probe.md` |
| **Round record** | `docs/review-rounds/fix/mutation-browser-child-lifetime/03953337388b.md` |
| **Ledger row** | `BL-MUTATION-BROWSER-CHILD-LIFETIME` (`BACKLOG.md`), marked IN PROGRESS on this branch |
| **Tasks** | 5, plus a closeout gate deliberately OUTSIDE the task region |

**Work from the branch AS CHECKED OUT, never from a pinned sha.** `git fetch && git checkout
fix/mutation-browser-child-lifetime` and take its tip. A sha quoted in any message — including the
one this handoff was sent with — is stale the moment a repair lands, and an implementation session has
already been burned on exactly that.

## The number, and where it comes from

`BROWSER_MUTANT_TIMEOUT_MS = 660_000` — **10x the pooled measured healthy maximum of 65111 ms**, over
82 children across two full GREEN gate runs.

The maximum is load-bearing and usable only because it **reproduces**: 65111 ms in one run, 62723 ms
in the other, within 4%. A single-run max is indistinguishable from a stall and would not have earned
this ceiling. Median is 24451 ms, so the observed max is already 2.66x its own median — which is why
the multiple is applied to the MAX and not the median.

**Do not adopt `MUTANT_TIMEOUT_MS` (180 s).** It is only 2.76x this surface's measured max: one
contention regime widening the tail threefold puts HEALTHY children past it.

**If a second browser surface enrols, re-measure rather than re-argue.** The constant is stated as a
multiple of a measured quantity precisely so that re-measuring is the documented response.

## Enrolment, in full — because a mutation score is NOT available here

- **`tests/mutation/browser/runner.ts` is NOT enrolled and NOT enrollable.** This is pre-existing and
  documented in the registry itself, in the comment above the `browserRegistry` row in
  `tests/mutation/source/registry.ts`: *"the spawn boundary in `tests/mutation/browser/runner.ts`
  needs a real Playwright child, the same shape limit the step3-a11y filing recorded."*
- **`spawnBounded` IS enrolled** (`tests/mutation/source/registry.ts`, id `spawnBounded`) and **this
  design does not modify it** — the repair is a call-site swap. Its score is therefore unchanged by
  construction. If a repair round DOES modify `spawnBounded.ts`, that surface's score plus an empty
  unaccepted-survivor set becomes the criterion for that change, computed with `pnpm mutation:guards`
  BEFORE the dispatch.
- **Therefore the round-1 `--stage diff` brief carries `CANNOT-EXPRESS:` with the registry citation
  above, NOT a `MUTATION SCORE:` line.** The wrapper exits 2 without one or the other. Say this
  explicitly in the brief rather than omitting it: a brief that quietly drops the score line reads as
  an oversight, and the next reviewer will ask for a number that cannot be computed.
- Task 3 changes `spawnBounded`'s SUITE, not the module. That does not trigger the score rule, and a
  strengthened suite can only raise the score.

## Task 5 — the derived-cover guard, and what it kills

The spawn-disposition cover is a **guard, not a table**. The suite walks `tests/mutation/` itself,
matches the call shape, and fails BY NAME on any hit with no disposition row.

```
rg -n 'execFileSync\(|spawnSync\(|\bspawn\(' tests/mutation/
```

Constraints that are the whole point — do not relax them while implementing:

- it takes **no filename filter and no list of files to check**; a guard handed the list it is meant
  to derive proves nothing;
- rows may be file-keyed (e.g. `premiseScan.test.ts` — every hit is a fixture string;
  `spawnBounded.live.test.ts` — unbounded spawns ARE the property under test) or line-keyed;
- the registry lives **in the suite**, not in markdown, because a table no guard reads is decoration;
- the walk carries an executable premise — a walk that silently returns nothing passes vacuously and
  would forever.

**Weaker implementation it kills:** asserting only that existing rows still resolve to real sites.
That direction passes while a NEW undispositioned site sits uncovered — the enumeration failure in a
guard's clothing. Both directions are asserted and **swept-to-row is the one that must fail on a new
site**.

## Traps that each cost a round — one line each

1. **A red that fails before its assertions run is not a red.** Cost two of four plan rounds and
   recurred after being named: an unresolved import (Task 1), then a private `runChild` failing on
   missing ACCESS (Task 2). Filed as `BL-SPECLINT-RED-REASON-VERIFICATION`.
2. **This tree has the collect-nothing trap in BOTH directions.** Bare `pnpm vitest run` collects
   NOTHING for the nightly gate file (`NIGHTLY_ONLY_EXCLUDES`, `vitest.projects.ts:101`); the
   env-and-project-gated form collects NOTHING for a unit test (the `mutation` project includes only
   the four nightly gate files). Both exit 0. Pick per target and RUN it.
3. **A source-substring check loses to an ordinary alias.** `import { execFileSync as legacyRun }`
   passes an `execFileSync(` absence check with the unbounded call live. AC-1 is asserted at the
   BINDING level — the module imports nothing from `node:child_process` — with AC-3's execution as
   the behavioural half.
4. **"It threw" does not attribute the throw.** `tests/mutation/browser/runner.ts:227` already throws
   `MutantRunInfraError` on the sentinel path, so AC-4 asserts inequality across all three causes.
5. **Presence is not forwarding.** An implementation overwriting the fallback's ceiling with
   `MUTANT_TIMEOUT_MS` passes a presence check, the existing fixture, AND the closeout gate — because
   that gate runs `perl`-PRESENT and never exercises the fallback. AC-6 asserts a distinctive caller
   value reaches `calls[1]`.
6. **A sweep that filters by filename is unsound, not merely incomplete.** The first version excluded
   `*.test.ts` while claiming walk-root coverage, so it could not have established its own conclusion.
   Unfiltered it found four more in-class sites.
7. **An over-tight consequence bound manufactures findings against correct code.** "A healthy-but-slow
   child must not become a timeout" was withdrawn: any finite ceiling converts a sufficiently slow
   healthy child into a timeout. The bound is stated by DIRECTION — false certification, wrong
   attribution — and a conservative over-report is a documented limit.
8. **A fixture can be neutralized by another rule in the same design.** Run both questions per
   criterion: what weaker implementation passes this, and does anything else here neutralize it.

## Things you would otherwise re-derive

- **A timeout maps to INFRA, not KILLED** — the `childRun` reading, not `runSuite`'s. The source
  harness deliberately reads the same event two ways; spec §5.3 carries the argument AND the
  counter-argument so neither side is re-litigated.
- **The first timeout aborts the whole invocation.** Nothing catches `MutantRunInfraError` — the sole
  `catch` in the browser runner is inside `runChild` (`tests/mutation/browser/runner.ts:162`). So a
  second hung child is unreachable in one run, and the reachable worst case against the nightly's
  `timeout-minutes: 60` is **2460 s of 3600 s**.
- **`spawnBounded` discards child stdio by design.** That is a behaviour change from today's
  `stdio: "pipe"` and an intended one — nothing reads the child's output, and piping reintroduces the
  1 MB `maxBuffer` cap that made high-output surfaces unenrollable.
- **The browser mutant set is small and known:** one surface, `tapTargetFloor`, 19 mutants, 2 deciding
  suites. A full gate run is ~617-652 s locally.
- **`pnpm heavy` is mandatory** for the gate and never set `FX_HEAVY_SLOT_DIR`.
- **No meta-test governs this arc's new suites.** `_metaPremiseContract` derives its universe from
  `GUARD_SURFACES` `suitePaths` (`tests/mutation/_metaPremiseContract.test.ts:334`) and this arc adds
  no registry row. The premise discipline here is convention, enforced by review.
- **`spec:lint` makes no collection claim.** Plain runs return nothing when no probes ran
  (`lib/specLint/redContract.ts:754`), and under `--exec-red` the arm is silent for anything wrapped
  in `pnpm heavy` (`lib/specLint/redContract.ts:721`).

## Filings this arc produced

| id | home | why |
| --- | --- | --- |
| `BL-MUTATION-SOURCE-SHARD-BUDGET-BREACH` | `BACKLOG.md` | the `budget` job red on main 08-18 and 08-19; separate job, separate repair from the coverage row |
| `BL-SPECLINT-RED-REASON-VERIFICATION` | `BACKLOG.md` | the red-contract arm checks that a command fails, never that it failed for the reason the task named |
