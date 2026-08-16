# pg-cron vacuity guard: mechanism-sabotage probes

**Date:** 2026-08-01 · **Backlog:** `BL-PG-CRON-PER-CASE-QUERY-ATTRIBUTION` (BACKLOG.md, "the vacuity guard counts queries in aggregate, not per case") · **Class:** CI coverage integrity, guard-on-guard · **Size:** S (one test file extended, no product code)

## 1. Problem — measured, not theorized

`tests/cross-cutting/pg-cron-coverage.test.ts` carries a query-count mechanism: a module-scope `queryCount` incremented inside `psql()`, an observe callback `() => queryCount` handed to `makeLiveCaseCounter` (per-case attribution — a live case that issues no query throws by name), and an `afterAll` aggregate branch (`queryCount < liveCaseCount()`). The executable vacuity guard `tests/cross-cutting/pgCronCiVacuity.test.ts` runs the suite in a child vitest under three environments and reads outcomes; the wrapper module has behavioural cover in `tests/cross-cutting/liveCaseCounter.test.ts`.

None of that protects the mechanism's WIRING in the suite itself. `makeLiveCaseCounter`'s `observe` parameter is optional (`tests/cross-cutting/_liveCaseCounter.ts`, `observe?: () => number`), so the wiring can be deleted wholesale and every guard stays green. Probed 2026-08-01 on the current tree (worktree at `0fb6f9efb`, local Supabase reachable at 127.0.0.1:54322; baseline run of both guard files: 9/9 green in 2.58s, children verified live at ~750–860ms each):

| Mutant | Edit to `pg-cron-coverage.test.ts` | Guard outcome | Verdict |
| --- | --- | --- | --- |
| MF-1 | Delete `queryCount` decl + `queryCount += 1` + observe arg + `afterAll` aggregate branch (the `1c1ae148e` state; typechecks clean) | 9/9 green | **ESCAPES** |
| MF-2 | Drop only the observe arg: `makeLiveCaseCounter(liveDbTest)` | 9/9 green | **ESCAPES** — the SHIPPED per-case attribution silently regresses to aggregate-only |
| MF-3 | Drop only `queryCount += 1` | vacuity probe 3 reds: every live case throws `live case "pg_net extension is installed" issued NO database query …` | caught (existing cover) |
| MF-4 | Delete only the `afterAll` aggregate branch | 9/9 green | **ESCAPES** |

MF-1 is the hole the backlog entry demonstrates via commit `1c1ae148e` (which had the executable guard without query counting and was green). MF-2 and MF-4 are the same family enumerated to closure per the class-sweep rule.

## 1.1 Resolved scope — do not relitigate

- **The `psql("SELECT 1")` proxy is fenced OFF.** Replacing every case body with a trivial query defeats attribution; proving assertions are MEANINGFUL is a reviewer's job, and four adversarial rounds each defeated the next proxy (source patterns, case names, aggregate count). A fifth proxy is out of scope by ratified backlog decision (BACKLOG.md entry, "Why THAT is not patched"). These probes prove the mechanism EXISTS and FIRES — nothing more.
- **The aggregate-count defect is closed.** Per-case attribution shipped (`_liveCaseCounter.ts` observe path; BACKLOG.md entry, "Per-case attribution SHIPPED"). This work does not touch the suite or the wrapper — it adds detection for their sabotage.
- **Execute-the-suite is the ratified guard class.** Source-pattern guards were defeated twice (`pgCronCiVacuity.test.ts` header, "WHY THIS EXECUTES THE SUITE INSTEAD OF READING IT"). The new probes are the same class: run a child vitest, read the outcome.
- **Guard-of-guard regress stops here.** Sabotage of `pgCronCiVacuity.test.ts` itself (deleting these probes, weakening `passedNames`) is reviewer territory, same fence as the proxy. No probe-of-the-probe.
- **TDD invariant satisfied by mutant red/green** (plan will encode): each probe is proven RED against every escaping mutant it claims to catch and GREEN on the healthy tree — the mutation-family closure protocol of `docs/agents/writing-plans.md`, which for guard surfaces IS the failing-test step.

## 2. Design

Extend `tests/cross-cutting/pgCronCiVacuity.test.ts` (serial project — `tests/cross-cutting` is not in `PARALLEL_TEST_GLOBS`, `vitest.projects.ts`; CI job `unit-suite-db`, which boots Supabase) with a second describe block, "query-count mechanism cannot be deleted silently", holding one injection helper and two probes. The existing `runSuite` helper gains an optional second parameter `file: string = SUITE` threaded into the child vitest argument list — the three existing call sites pass no second argument and are behaviourally unchanged; the probes pass the mutant's repo-relative path.

### 2.1 Injection helper

> **SUPERSEDED 2026-08-15 — the transient sibling file is gone.** The delivery mechanism below (a real `.test.ts` file written into the globbed tree, then unlinked) is replaced by the in-memory overlay per `docs/superpowers/specs/ci/2026-08-15-local-harness-false-failures-design.md` §2.2, graduating `BL-TESTFAST-RACES-TRANSIENT-MUTANT-FILE`. `writeMutant` now writes the mutant TEXT to an `mkdtemp` scratch file outside the repo under a non-test extension and RETURNS that path; the child runs the suite at its REAL path with the text served from a `load` hook (`tests/mutation/source/mutantOverlay.config.ts`), so no path matched by any project glob exists at any instant and a SIGKILL mid-probe leaves no stray. `runSuite` also gained an explicit `stdio: ["ignore", "pipe", "pipe"]`, so the intentionally-failing children stop echoing their `FAIL` lines onto the outer run's stderr. Everything else here — the anchors, the exactly-once refuse-to-cover contract, and both probes' assertions — is unchanged and still current.

`writeMutant(edits)`: read `tests/cross-cutting/pg-cron-coverage.test.ts` source; for each edit, assert its anchor occurs EXACTLY once in the source and apply it, THROWING with a "suite refactored; update the probe anchors" message otherwise (refuse-to-cover: an anchor miss must red the probe, never skip it); write the result to a transient sibling file in the same directory, basename "pg-cron-coverage.mechanism-probe-mutant.test.ts" (never tracked by git). The probes reference the module-scope path constants directly — the repo-relative one as the child vitest filter, the absolute one for cleanup — so the helper returns nothing (plan R1 F4 alignment). Each probe wraps its run in `try/finally` and unlinks the mutant file.

Anchors (both verified unique on the current tree):

- **Inert-case injection** — after the line `describe("M12.1: pg-cron-coverage (live-DB introspection)", () => {`, insert `liveCase("INERT MECHANISM PROBE", () => {});`. The name collides with nothing in `LIVE_CASES`.
- **Observe-strip** (probe B only) — replace `makeLiveCaseCounter(liveDbTest, () => queryCount)` with `makeLiveCaseCounter(liveDbTest)`.

Placement notes, all load-bearing: the mutant lives in the SAME directory so its relative import `./_liveCaseCounter` and the `@/` aliases resolve; it must keep a ".test.ts" suffix because vitest treats CLI file args as filters against the project include globs (`BASE_INCLUDE`, `vitest.projects.ts`); its transient existence cannot race any tree-walking guard because the serial project runs with `fileParallelism: false` (vitest.config.ts, serial project block) and the serial/parallel phases never overlap (vitest.config.ts header comment), while CI shards run on separate runners with separate filesystems.

### 2.2 Probe A — per-case attribution is wired and fires

Mutant: inert case injected. Child env: `CI: "true"`, `PG_CRON_COVERAGE_TARGET: "local"` (pinned for the same ambient-reroute reason as the existing probes), DSN inherited — identical posture to the existing "runs every live case against a reachable database in CI" probe.

Assert: child exit status ≠ 0 AND output matches `live case "INERT MECHANISM PROBE" issued NO database query`.

- Healthy tree: the inert case throws by name (attribution), the six real cases pass, `afterAll` holds (6 counted cases, 6 queries) → probe GREEN.
- MF-1: inert case passes, no aggregate branch → child exits 0 → probe RED.
- MF-2: inert case passes per-case; the aggregate branch reds the child but with the AGGREGATE message, so the named-message match fails → probe RED. The name-specific match is what makes attribution regression detectable.

### 2.3 Probe B — the aggregate branch still backstops when attribution is absent

Mutant: inert case injected AND observe arg stripped. Same child env.

Assert: child exit status ≠ 0 AND output matches `live cases ran but only \d+ database queries were issued`.

- Healthy tree: 7 cases all pass individually (no observe), `afterAll` sees 7 counted cases vs 6 queries → throws the aggregate message → probe GREEN.
- MF-4: no aggregate branch → child exits 0 → probe RED.
- MF-1: the observe-strip anchor is already absent → `writeMutant` throws → probe RED (refuse-to-cover doubles as detection).

## 3. Mutation-family closure matrix

| Family | Caught by | Evidence class |
| --- | --- | --- |
| MF-1 whole-mechanism deletion | Probe A (child green ⇒ probe red); Probe B (anchor miss) | live mutant, measured escaping today |
| MF-2 observe-arg drop | Probe A (message shape flips to aggregate); Probe B (anchor miss) | live mutant, measured escaping today |
| MF-3 increment drop | existing vacuity probe 3 | measured caught today (see §1 table) |
| MF-4 aggregate-branch deletion | Probe B (child green ⇒ probe red) | live mutant, measured escaping today |
| Wrapper-internal sabotage (delete the per-case throw, break the before-snapshot, drop `await fn()`) | `liveCaseCounter.test.ts` behavioural cases; Probe A additionally reds on the per-case-throw deletion | existing behavioural cover, unchanged |
| `afterAll` zero-case branch deletion | not probed — documented limit, §4 | — |

## 4. Documented limits

- **Assertion meaningfulness is out of scope** (§1.1, ratified fence). A saboteur replacing case bodies with `psql("SELECT 1")` still passes; that is the reviewer's catch by design.
- **The `afterAll` zero-case branch** (`liveCaseCount() === 0` throw) is redundant defense-in-depth: the shape it guards — live cases skipped wholesale in CI — is independently redded by the existing probe 3's by-name floor (skipped ≠ passed). Deleting the branch loses redundancy, not detection. No probe.
- **Both new probes require a reachable local database**, exactly like the existing probe 3 — the dev contract already requires one (`pnpm preflight` fails loud without it) and `unit-suite-db` boots one. No new environmental constraint.
- **Guard-of-guard regress stops at this layer** (§1.1).
- **Cost:** two additional child-vitest runs in the file, ~0.8–1s each locally (hot cache, measured); on the one `unit-suite-db` shard leg that holds this file, comparable to the three existing probes it joins.

## 5. Acceptance

1. Both probes green on the healthy tree; the full guard file (5 probes) green locally with the DB up.
2. Mutant red/green protocol executed and recorded in the plan: MF-1 reds probe A and probe B; MF-2 reds probe A and probe B; MF-4 reds probe B; healthy tree greens all.
3. `pnpm exec tsc --noEmit`, eslint, `pnpm format:check`, full `pnpm test` green.
4. No change to `pg-cron-coverage.test.ts`, `_liveCaseCounter.ts`, `liveCaseCounter.test.ts`, workflows, or vitest config.
5. BACKLOG entry graduated to `BACKLOG-archive.md` with provenance (branch `test/pg-cron-mechanism-sabotage-probe`), plus the `BACKLOG_GRADUATED` registry row in `tests/docs/_metaDeferralLedgerGraduation.test.ts` — the ONE row this branch touches in that orchestrator-owned file.

## 6. Citation index (file + symbol; line numbers volatile)

- `tests/cross-cutting/pg-cron-coverage.test.ts` — `let queryCount`, `psql()` increment, `makeLiveCaseCounter(liveDbTest, () => queryCount)`, `afterAll` aggregate branch, describe `"M12.1: pg-cron-coverage (live-DB introspection)"`.
- `tests/cross-cutting/_liveCaseCounter.ts` — `makeLiveCaseCounter(register, observe?)`, per-case throw `issued NO database query`.
- `tests/cross-cutting/pgCronCiVacuity.test.ts` — `runSuite`, `LIVE_CASES`, `passedNames`, the three existing probes, header ratifying execute-the-suite.
- `tests/cross-cutting/liveCaseCounter.test.ts` — wrapper behavioural cover incl. `rejects a case that issued NO query, naming it`.
- `vitest.projects.ts` — `BASE_INCLUDE`, `PARALLEL_TEST_GLOBS` (no `tests/cross-cutting`).
- `vitest.config.ts` — serial project `fileParallelism: false`; header: phases sequential.
- `.github/workflows/unit-suite.yml` — `unit-suite-db` boots Supabase, runs `--project=serial`.
- BACKLOG.md — entry `BL-PG-CRON-PER-CASE-QUERY-ATTRIBUTION`; commit `1c1ae148e`.
