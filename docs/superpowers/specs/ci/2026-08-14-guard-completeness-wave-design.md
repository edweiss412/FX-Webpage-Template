# Guard-completeness wave — four ledger entries, one spec

**Date:** 2026-08-14 · **Branch:** `chore/guard-completeness-wave` · **Status:** DRAFT — skeleton, citations pending surface exploration

Covers four `BACKLOG.md` entries whose shared class is guard completeness — a guard, suite, or adapter that claims coverage it cannot prove:

| Entry | Surface | Expected disposition (draft) |
| --- | --- | --- |
| `BL-DESTRUCTIVE-GUARD-EXECUTION-SITE` | `tests/db/_destructiveFileAnalysis.ts` | REDESIGN — execution-site framing |
| `BL-LEDGER-GIT-TIMEOUT-CONSTANTS` | `scripts/lib/ledger-git.ts` | REDESIGN — injectable spawn seam |
| `BL-CI-WIRING-GUARD-RESIDUAL-BYPASSES` | `tests/ci/` wiring guard | DOCUMENTED LIMIT — no code change (verify header) |
| `BL-PG-CRON-HOST-ASSERTION` | `tests/cross-cutting/` pg-cron suite | ORACLE OR HONEST LIMIT — decide by probe |

## 1.1 Resolved scope — do not relitigate

- **"Documented limit, no code change" is a legitimate terminal disposition** per the ledger filing bar (`AGENTS.md` § "Ledger filing bar (2026-08-04)") and the demotion procedure (`docs/superpowers/specs/2026-08-04-backlog-convergence-design.md` §2.1–§2.3: probe-first, durable grepable record, recoverable by construction).
- **Entry C's ratification is settled.** BL-CI-WIRING-GUARD-RESIDUAL-BYPASSES was owner-ratified as a documented limit 2026-08-10 (`feat/crew-chrome-footer-avatar` R4; ratification text lives in the guard itself, `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:216-217`). The promotion trigger has not fired. This spec does not reopen the ratification, and a review round proposing a narrower bypass-closing recognizer relitigates it — the guard's own limits block names that ratchet and declines it (`:226-244`).
- **Entry D's soundness bar is fixed by the entry** (`BACKLOG.md` § BL-PG-CRON-HOST-ASSERTION): a host assertion must survive scheme mismatch, trailing slash, base paths, and the target-flag non-proof, demonstrated against a live mismatch, or not land at all. "A host check that passes `http://` against an `https://` GUC would be worse than none, because it would read as coverage."
- **Entry A's acceptance is fixed by the entry** (`BACKLOG.md` § BL-DESTRUCTIVE-GUARD-EXECUTION-SITE "Acceptance"): every current rejection fixture still rejects, all real destructive files still pass, a file acquiring a driver by an unenumerated route is rejected because its client is not in the checked set, and the acquisition rules become DELETABLE — "the redesign should make the module smaller, not larger."
- **Entry B's gap classification is settled:** the four constants are ledgered `accepted-gap`, NOT `equivalent` (`tests/mutation/source/registry.ts:435-470`), because a reachable timeout would be observable — an equivalence claim would overclaim. The seam converts them to killable; do not relitigate the accepted-gap-vs-equivalent call.
- **Scope fence:** this wave changes NO production application code. Surfaces are a test-support analyzer (`tests/db/`), a scripts-tree adapter (`scripts/lib/`), a ledger archive move, and (at most) a CI-suite assertion. No UI surface — the invariant-8 impeccable gate is N/A.

## 2. Entry A — BL-DESTRUCTIVE-GUARD-EXECUTION-SITE

### 2.1 Current state (citations pending)

### 2.2 Design: execution-site checking

### 2.3 The local-factory problem

### 2.4 Acceptance criteria

## 3. Entry B — BL-LEDGER-GIT-TIMEOUT-CONSTANTS

### 3.1 Current state, verified 2026-08-14

`scripts/lib/ledger-git.ts` exports exactly one symbol, `realGitSurface(): GitSurface` (`scripts/lib/ledger-git.ts:88`), imports `spawnSync` directly (`:10`), and holds four spawn-bound constants: `FETCH_MS = 30_000` (`:32`), `LS_REMOTE_MS = 30_000` (`:33`), `GH_MS = 10_000` (`:34`), `MAX_GIT_STDOUT = 64 * 1024 * 1024` (`:62`). Six `spawnSync` call sites: the shared `git(args, timeout)` helper (`:64-…`, `maxBuffer: MAX_GIT_STDOUT`) serving eight readers, plus five inline calls — `localRefs` (`:114`, `LS_REMOTE_MS`, no `maxBuffer`), `prList` (`:140`, `GH_MS`, no `maxBuffer`), `fileOids` (`:204`), `showFile` (`:232`), `mergeBase` (`:259`, `LS_REMOTE_MS` + `MAX_GIT_STDOUT`).

The only production importer is `scripts/ledger-claims.ts:19` (surface constructed at `:65`). The suite (`tests/scripts/ledgerClaimsCheck.test.ts`) tests against REAL git binaries in throwaway repos (`throwawayRepo` `:776`, `atRepo` `:807`, `withFakeGh` `:832`) — no spawn mocks, which is why a 30 000 → 30 001 mutant is invisible: the only separating behavior is whether a child running between the two bounds is killed.

Mutation ledger: six `accepted-gap` rows, all `ref: "BL-LEDGER-GIT-TIMEOUT-CONSTANTS"`, at `tests/mutation/source/registry.ts:435-470` (`integer-literal:32:18:30000>30001`, `:33:22:30000>30001`, `:34:15:10000>10001`, `:62:24:64>65`, `:62:29:1024>1025`, `:62:36:1024>1025`). Accepted-gap counts as a survivor (`tests/mutation/source/ledger.ts:79-91` excludes only `equivalent` from the denominator), so the surface scores 72/78 ≈ 0.923 against `scoreFloor: 0.9` (`registry.ts:385`). The gate pins exact ledger-kind counts: `ledgerGit: { equivalent: 6, "accepted-gap": 6 }` (`tests/mutation/guardSurfaces.gate.test.ts:64`).

Structural guards touching this module:

- `tests/scripts/ledgerFields.test.ts:150-173` — the spawn-ban: three sibling modules must spawn nothing, and the anti-vacuity twin at `:166` requires ledger-git.ts source to match `/from\s+["']node:child_process["']/`.
- `tests/mutation/source/premiseScan.ts:31` — `ENVIRONMENT_SOURCES.modules` names `"node:child_process"` and `"scripts/lib/ledger-git"`.

### 3.2 Design: seam as an optional constructor parameter

Of the entry's two candidate shapes — "a module-level `run = spawnSync` a test can replace, or an options object carrying the three bounds" (`BACKLOG.md`, entry body) — this spec picks a third that is the module's own existing idiom: **an optional parameter on `realGitSurface`**.

```ts
export function realGitSurface(opts?: { spawn?: typeof spawnSync }): GitSurface {
  const spawn = opts?.spawn ?? spawnSync;
  // every internal call site uses `spawn`, never `spawnSync` directly
}
```

Why this shape and not the other two:

- **Interface injection is the file family's established pattern** — `GitSurface` itself is injected into `resolveClaims`/`runCheck` (`scripts/lib/ledger-check.ts:4` header: "NO SUBPROCESS SPAWNING — everything arrives through the injected GitSurface"), and `realGitSurface()` is arity-0 at all three call sites, so an optional parameter is backward compatible with zero caller edits.
- **A mutable module-level `let run = spawnSync`** is writable module state reachable from any importer — a wider surface for the spawn-ban guard to police, which is the widening cost the entry itself warns about.
- **An options object carrying the bounds** would make the timeouts caller-configurable in production, changing the module's contract; nothing needs that. The constants stay module-private; the seam exposes the SPAWN, and the test observes what values arrive at it.

The literal `import { spawnSync } from "node:child_process"` stays (it is the default), so the anti-vacuity guard at `tests/scripts/ledgerFields.test.ts:166` and the premise-scan module list (`tests/mutation/source/premiseScan.ts:31`) hold without edits.

All six internal call sites route through the seam. The test injects a recording fake that captures `(cmd, args, options)` per call and returns canned success shapes, then asserts per reader:

- `fetch` passes `timeout: 30_000` (FETCH_MS);
- `lsRemote`, `localRefs`, `mergedIntoMain`, `readBlob`, `diffHunks`, `tipEpoch`, `isShallow`, `currentBranch`, `mergeBase`, `fileOids`, `showFile` pass `timeout: 30_000` (LS_REMOTE_MS);
- `prList` passes `timeout: 10_000` (GH_MS);
- every reader routed through `git()`, plus `mergeBase`, `fileOids`, and `showFile`, passes `maxBuffer: 67_108_864` (MAX_GIT_STDOUT — verified live: `fileOids` and `showFile` pass both `LS_REMOTE_MS` and `MAX_GIT_STDOUT`);
- `localRefs` and `prList` pass NO `maxBuffer` — pinned as current behavior (see §6 limits).

Expected literals live in the test, so each source mutant (30 001, 10 001, 65/1025) diverges from the recorded value and dies.

### 3.3 Spawn-guard interaction

Production spawn topology is unchanged: ledger-git.ts remains the one module permitted to spawn, the seam's default is the module's own `spawnSync` import, and injection is only reachable by a caller that already holds a `typeof spawnSync` — in practice, test code. The spawn-ban guard's three-file no-spawn list and anti-vacuity twin (`tests/scripts/ledgerFields.test.ts:150-173`) need no change. A deliberate production caller injecting its own spawn through the seam is outside the guard's threat model (same fence as §4: ordinary authoring, not deliberate circumvention) — recorded in §6.

### 3.4 Mutation-ledger reconciliation and acceptance

- The six `accepted-gap` rows at `tests/mutation/source/registry.ts:435-470` are DELETED — the seam test kills their mutants.
- Gate expectation `tests/mutation/guardSurfaces.gate.test.ts:64` becomes `ledgerGit: { equivalent: 6, "accepted-gap": 0 }`.
- `siteId` is position-encoded (`operator:line:column:from>to`, `registry.ts:40-44`), so the seam's line shifts require reconciling every remaining ledger row for the surface via the existing `reconcile` path (`registry.ts:45`); the plan runs `pnpm heavy pnpm mutation:guards` and repairs stale rows in the same task.
- `scoreFloor: 0.9` stays (a floor raise is a separate ratchet decision, not this entry's subject); the gate's exact ledger-kind pin is the real closure assertion.
- Acceptance: `pnpm heavy pnpm mutation:guards` green with zero accepted-gap rows for `ledgerGit`, zero unaccepted survivors, and the new seam test failing on each of the six former gap mutants when run against a hand-applied mutant (spot-check at least one timeout and one maxBuffer mutant during implementation — mutate your own fix).

## 4. Entry C — BL-CI-WIRING-GUARD-RESIDUAL-BYPASSES

### 4.1 Current state, verified 2026-08-14

The guard is `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` — NOT under `tests/ci/`, which is what the entry's locator and the arc brief say; the archive entry corrects the locator. Companion oracle: `scripts/check-crew-e2e-executed.mjs`.

Both bypasses are real, and both are already documented in the owning surface's limits record — the standalone JSDoc block at `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:215-245`, immediately above `PROJECT_GATED` (`:254`), whose own text carries the ratification: "owner-ratified 2026-08-10 after four review rounds each surfaced a narrower bypass and no product code changed" (`:216-217`). The block names both bypasses, states the threat-model fence (ordinary authoring mistakes by a contributor, not deliberately constructed fake declarations), states the consequence bound (accidental cases are caught loudly with the offending file and line), and cross-references `BL-CI-WIRING-GUARD-RESIDUAL-BYPASSES` by id. One correction to the entry's prose: the block is a standalone JSDoc above the registry, not the file's top header (`:1-32` never mentions the limits) — substance identical, placement misdescribed.

Mechanics, for the record:

- Bypass 1: `scanSkip` (`:518-531`) matches the `test.skip` callee shape only and never inspects `arguments[0]`, so `test.skip(false, "…")` binds a registry row while gating nothing (liveness is `titlesWithSkip.has(row.title)`, `:540`).
- Bypass 2: one `PROJECT_GATED` row (`:569-570`) drops the flat identifier ban (`:585`) for the whole file, and the body scans stop at nested function boundaries (`:664-671`, `:692-699`; rationale comment `:643-644`), so a gate inside a `test.step` callback in another test of the same file is unscanned.

### 4.2 Disposition: DEMOTE to archive — documented limit, no code change

Per the ledger filing bar (`AGENTS.md` § "Ledger filing bar (2026-08-04)"), a row whose worst case is conservative behavior plus a surfaced signal is a DOCUMENTED LIMIT and "belongs in the owning surface's limits record …, not in the open queue." That is this row's state already: the limit is recorded in the owning surface (`:215-245`), grepable by the BL id, dated, ratified, with the promotion trigger unfired ("a real contributor hits one of these by accident, or the guard is extended to a surface where a fake declaration is plausible", `BACKLOG.md` entry body). The row was born demoted; keeping it in the open queue re-lists settled work.

Action: move the entry to `BACKLOG-archive.md` at terminal state DOCUMENTED LIMIT, carrying the full original body per the archive convention, the promotion trigger verbatim (it is the re-open condition), and the corrected locator (`tests/cross-cutting/`, not `tests/ci/`). No guard code changes. No mutation enrolment: the guard's logic is inline in a `.test.ts` with no exported module, so the source-mutation registry cannot express it as shipped (rows mutate a `sourcePath` module judged by a referring suite, `tests/mutation/source/registry.ts:12-38`); restructuring the guard to make it enrollable is exactly the recognizer-ratchet work the ratification declines. This mirrors the step3-a11y precedent — a surface the registry cannot express is re-dispositioned honestly with the probe that shows it, never enrolled symbolically (`AGENTS.md` § convergence criterion, item 3).

### 4.3 What would reverse this

Only the promotion trigger. A demotion under this procedure is recoverable by construction — the archive entry carries the full body, and the guard-block cross-ref survives, so a future arc re-files from evidence rather than from scratch.

## 5. Entry D — BL-PG-CRON-HOST-ASSERTION

### 5.1 Prior art and why cheap closures are rejected

### 5.2 Oracle candidates (probe-gated)

### 5.3 Disposition

## 6. Documented limits

Consequence bound for every limit here: behavior is conservative (loud failure or unchanged current semantics) plus a surfaced signal — never silently wrong. Threat-model fence: all guards in this wave defend against ordinary authoring mistakes by a contributor; deliberate obfuscation or deliberate circumvention files here, not to the open queue.

1. **`localRefs` and `prList` spawn with no `maxBuffer`** (`scripts/lib/ledger-git.ts:114`, `:140`), so Node's 1 MiB default applies. An overflow throws `ENOBUFS` — loud, not silent. The seam test PINS the absence (asserts no `maxBuffer` key) so a future change is a deliberate edit, not drift. Widening them to `MAX_GIT_STDOUT` is a behavior change this entry does not need.
2. **A production caller could inject its own spawn through the `realGitSurface` seam.** Outside the threat model (deliberate circumvention); the spawn-ban guard still pins that no OTHER module imports `node:child_process`, so the injected function would itself have to come from a module the guard already polices.
3. **Wiring-guard bypasses (entry C)** stay open as ratified limits in `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:215-245`; re-open condition is the promotion trigger preserved in the archive entry.

## 7. Test plan

## 8. Out of scope
