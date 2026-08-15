# Guard-completeness wave — four ledger entries, one spec

**Date:** 2026-08-14 · **Branch:** `chore/guard-completeness-wave` · **Status:** APPROVED — cross-model adversarial review converged APPROVE/0 at round 6 (2026-08-14; corpus `docs/review-rounds/chore/guard-completeness-wave/04f601134519.jsonl`)

Covers four `BACKLOG.md` entries whose shared class is guard completeness — a guard, suite, or adapter that claims coverage it cannot prove:

| Entry | Surface | Disposition |
| --- | --- | --- |
| `BL-DESTRUCTIVE-GUARD-EXECUTION-SITE` | `tests/db/_destructiveFileAnalysis.ts` | REDESIGN — execution-site framing (§2); discovery-by-connection refiled (§2.5) |
| `BL-LEDGER-GIT-TIMEOUT-CONSTANTS` | `scripts/lib/ledger-git.ts` | REDESIGN — spawn seam as optional `realGitSurface` parameter (§3) |
| `BL-CI-WIRING-GUARD-RESIDUAL-BYPASSES` | `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` | DEMOTE to archive — documented limit, no code change (§4) |
| `BL-PG-CRON-HOST-ASSERTION` | `tests/cross-cutting/pg-cron-coverage.test.ts` | BUILD — queue-origin oracle per target mode (§5) |

## 1.1 Resolved scope — do not relitigate

- **"Documented limit, no code change" is a legitimate terminal disposition** per the ledger filing bar (`AGENTS.md` § "Ledger filing bar (2026-08-04)") and the demotion procedure (`docs/superpowers/specs/2026-08-04-backlog-convergence-design.md` §2.1–§2.3: probe-first, durable grepable record, recoverable by construction).
- **Entry C's ratification is settled.** BL-CI-WIRING-GUARD-RESIDUAL-BYPASSES was owner-ratified as a documented limit 2026-08-10 (`feat/crew-chrome-footer-avatar` R4; ratification text lives in the guard itself, `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:216-217`). The promotion trigger has not fired. This spec does not reopen the ratification, and a review round proposing a narrower bypass-closing recognizer relitigates it — the guard's own limits block names that ratchet and declines it (lines 226-244).
- **Entry D's soundness bar is fixed by the entry** (`BACKLOG.md` § BL-PG-CRON-HOST-ASSERTION): a host assertion must survive scheme mismatch, trailing slash, base paths, and the target-flag non-proof, demonstrated against a live mismatch, or not land at all. "A host check that passes `http://` against an `https://` GUC would be worse than none, because it would read as coverage."
- **Entry A's acceptance is fixed by the entry** (`BACKLOG.md` § BL-DESTRUCTIVE-GUARD-EXECUTION-SITE "Acceptance"): every current rejection fixture still rejects, all real destructive files still pass, a file acquiring a driver by an unenumerated route is rejected because its client is not in the checked set, and the acquisition rules become DELETABLE — "the redesign should make the module smaller, not larger."
- **Entry B's gap classification is settled:** the four constants are ledgered `accepted-gap`, NOT `equivalent` (`tests/mutation/source/registry.ts:435-470`), because a reachable timeout would be observable — an equivalence claim would overclaim. The seam converts them to killable; do not relitigate the accepted-gap-vs-equivalent call.
- **Scope fence:** this wave changes NO production application code. Surfaces are a test-support analyzer (`tests/db/`), a scripts-tree adapter (`scripts/lib/`), a ledger archive move, and (at most) a CI-suite assertion. No UI surface — the invariant-8 impeccable gate is N/A.

## 2. Entry A — BL-DESTRUCTIVE-GUARD-EXECUTION-SITE

### 2.1 Current state, verified 2026-08-14

`tests/db/_destructiveFileAnalysis.ts` (420 lines, TypeScript AST via `ts.createSourceFile`, `tests/db/_destructiveFileAnalysis.ts:59`) exports `analyseDestructiveFile(filePath, rawSource)` returning `DestructiveFileVerdict = {ok:true} | {ok:false; reason}` (line 48, line 55). Its verdict has three legs:

1. **Guard provenance** — `assertLocalDbUrl` is trusted only when imported from `tests/db/_localDbUrl` and not shadowed by any local declaration (lines 69-108).
2. **Connection checking** — every declaration of a connected identifier must be a `const` initialized directly by a trusted guard call, declared before the connection (lines 293-364); inline `postgres(guard(...))` accepted (lines 302-304); zero connections = ok (line 282).
3. **Acquisition enumeration** — the leg this entry retires: rejection rules for dynamic `import()`, `require()`, `createRequire` via `node:module`/`module` import, any `.getBuiltinModule` property call, non-literal import specifiers, named/namespace `postgres` value bindings, and driver identifiers outside call position (lines 117-163, lines 178-216, lines 227-263).

Discovery lives in `tests/db/_metaDestructiveDbTargetGuard.test.ts` (191 lines): a filesystem walk of `tests/` (lines 81-91) matched against destructive-spelling regexes — `EXECUTES_WIPE` (line 58), `ENABLES_WIPE_GATE` (line 63), `EXECUTES_PRUNE` (line 71) — over the union of JS-stripped and SQL-stripped views (lines 117-120), then `analyseDestructiveFile` per discovered file (lines 165-190). Discovered population today: 9 files — 7 real destructive files, all verdict ok, plus the guard's own 2 files (`_metaDestructiveDbTargetGuard.test.ts`, `destructiveFileAnalysis.test.ts`), which are EXEMPTED before analysis and would be rejected `no loopback guard is called` if analyzed (probed, spec review R1 F4). The rejection corpus is `tests/db/destructiveFileAnalysis.test.ts` (397 lines): 2 accept cases, 26 labeled rejection blocks expanding to 32 mutant sources, all inline template strings (lines 25-30).

The factory gap, live: `tests/db/resetValidationDataConcurrency.test.ts:33` defines `const newConn = (): Sql => postgres(DB_URL, {max:1, prepare:false})`, called at lines 63-64 (`const a = newConn()`, `const b = newConn()`). The analyzer sees the single `postgres()` inside the arrow — never the call sites — which is why the prior execution-site attempt was reverted (`BACKLOG.md` entry body, disposition reason (c)).

Three additional defects found during this wave's exploration, all repaired by the redesign:

- **Dead allowlist name.** `GUARD_NAMES = ["assertLocalDbUrl", "assertSafeDestructiveTarget"]` (line 53), but `assertSafeDestructiveTarget` exists repo-wide only as a local, non-exported function in `tests/db/_validation-cleanup-helpers.ts:37`; `tests/db/_localDbUrl.ts` exports only `assertLocalDbUrl` (line 50) and `assertLocalDbUrlIfSet` (line 77). The name can satisfy the meta-test's message regex but can never satisfy `trusted()` — a guard premise that is false where it runs.
- **Accidental self-exemption.** `_metaDestructiveDbTargetGuard.test.ts` survives its own discovery only because its `EXEMPTION` regex happens to match its own failure-message text (line 187, fixture SQL at lines 130-149). Without that accident it would be discovered and rejected. The exemption must be explicit, not coincidental.
- **Stale comment.** `_destructiveFileAnalysis.ts:276-282` claims `resetValidationDataPostgrest.test.ts` opens no postgres connection; it does, at `resetValidationDataPostgrest.test.ts:59`.

### 2.2 Design: check execution sites, delete acquisition enumeration

The redesigned `analyseDestructiveFile` keeps its signature, verdict shape, guard-provenance leg, and the connection-checking logic — and replaces the acquisition leg with an execution-site rule:

**Every DB execution in a discovered file must run on a client in the checked set.** Three rules, jointly (spec review R1 F1 demonstrated that the client-shaped rule ALONE is bypassable by detaching a method — `const {unsafe} = target; await unsafe("select public.prune_sync_log()")` produces no tagged template and no property call, and the probe showed the CURRENT analyzer returns `{ok:true}` on exactly that source):

- **Checked-connection expression:** a call to the imported `postgres` default binding whose argument satisfies the existing trusted-guard derivation (leg 2, unchanged).
- **Checked client:** an identifier `const`-bound to a checked-connection expression, or `const`-bound to a call of a local factory (see §2.3).
- **Rule 1 — client-shaped executions:** any identifier used as a tagged-template tag (`` sql`...` ``) and any property call on a client identifier (`.unsafe(...)`, `.begin(...)`, `.end()`, …) must have a checked client as its tag/receiver, else reject with a named reason. A `.begin`/transaction callback parameter of a checked client is itself checked.
- **Rule 2 — destructive-string anchoring:** every string or template literal matching the destructive-statement recognizer (the SAME patterns discovery uses — extracted to one shared exported constant so analyzer and meta-test cannot drift) must sit, syntactically, inside a Rule-1 execution on a checked client. A recognized destructive string anywhere else — a bare call argument (`unsafe("select public.prune_sync_log()")`), a variable initializer later laundered, a callback — rejects with the string's line. This is what closes the detached-method probe: the acquisition route stays unknown, and the STATEMENT is still caught.
- **Rule 3 — checked-client containment:** a checked client identifier may appear ONLY as a declaration initializer target, a tagged-template tag, or a property-call receiver. Any other appearance — destructuring (`const {unsafe} = sql`), a stored method reference (`const u = sql.unsafe`), a computed member (`sql["unsafe"]`), passing the client as a function argument, re-export — rejects loudly. This closes the capability-laundering class sweep of F1 at the source end for checked clients; for UNKNOWN identifiers the same shapes are covered by Rule 2 when the statement is recognizable.
- **Everything else is rejection, not silence:** an execution-shaped node the analyzer cannot classify fails loudly with the node's line — conservative plus surfaced, per the preparedness posture.

Acquisition then stops mattering, exactly as the entry's acceptance frames it: a client obtained via `require()`, `import()`, `createRequire`, `getBuiltinModule`, a namespace import, or any route nobody has enumerated yet is not in the checked set — Rule 1 rejects its client-shaped executions, Rule 2 rejects its recognizable destructive statements regardless of shape. The acquisition rules at lines 117-163, lines 178-216, lines 227-263 are **deleted** — the module gets smaller, per the entry's own acceptance line.

**Residual, stated as the recognizer bound it is (files to §6, not to a round):** a destructive statement in a spelling the shared recognizer does not match, executed via an unknown-acquisition bare call, escapes Rule 2 — the identical recognizer bound that already governs FILE discovery, now shared as one constant. Within a discovered file, every client-shaped execution and every recognizable destructive string is still checked.

**Containment contingency (declared now so it does not become a round):** if plan-time validation shows a real discovered file passing its checked client into a local helper, the repair is a file-local refactor of that test-support file (inline the helper or thread the tagged call), NOT a widening of Rule 3 — the checked set stays closed over what the analyzer fully classifies.

Also in this redesign: `GUARD_NAMES` drops the dead `assertSafeDestructiveTarget` name; the meta-test's self-exemption becomes an explicit registered exemption with a reason; the stale lines 276-282 comment is corrected.

### 2.3 The local-factory problem, solved at the width the corpus needs

The prior attempt failed on interprocedural propagation. The redesign uses a one-level factory summary, which covers the entire live corpus without general interprocedural analysis:

**A local function declaration (function/arrow/method-less const) is a checked factory when every `return` expression (or the arrow's body expression) is a checked-connection expression.** A call to a checked factory is a checked-connection expression. Factories are summarized once, non-recursively: a factory whose body returns another factory's call, or anything the analyzer cannot classify, is NOT checked — its call sites reject with a named reason. That is a documented limit, not a gap: the failure mode is a loud false rejection the author repairs by inlining or simplifying, never a silent pass.

This admits `newConn` (arrow body is exactly `postgres(DB_URL, …)` with `DB_URL` trusted) and keeps the invariant sound: the checked set only ever grows from expressions the analyzer fully classified.

### 2.4 Acceptance criteria (fixed by the ledger row; restated)

1. Every fixture in `tests/db/destructiveFileAnalysis.test.ts` still rejects — reasons may change (acquisition-rule reasons become unchecked-execution-site reasons); each fixture's new reason is asserted, not just `ok:false`.
2. All 7 real discovered files still pass (the discovered population is 9: 7 real destructive files with ok verdicts plus the guard's own 2 files, which are exempted before analysis — today by the accidental self-exemption §2.1 documents, after this wave by an explicit registered exemption). `resetValidationDataConcurrency.test.ts` passes through the factory summary.
3. A file acquiring a driver by a route not in the old rejection list is rejected — new fixtures prove it for at least: the detached-method probe from spec review R1 F1 verbatim (`const {unsafe} = target; await unsafe(...)` with a recognized destructive string), an unenumerated dynamic acquisition shape, a stored method reference and a computed member on a CHECKED client (Rule 3), and a factory the summary cannot classify.
4. **AMENDED 2026-08-15, owner-ratified (diff review R1 finding 2).** As written this read "the
   acquisition rules are deleted; net module line count decreases", carrying the ledger entry's
   expectation that the redesign would make the module smaller. The first half holds and is the
   part that was ever load-bearing. The second half was a prediction, and it is FALSE as measured:
   `tests/db/_destructiveFileAnalysis.ts` went 420 to 597 lines, of which **412 are code** (262
   before), so a sub-420 file is unreachable at any documentation level — the execution-site
   machinery (factory summaries, the checked-set fixpoint, three rules) is simply more code than
   the enumeration it retires, and shipping the number would have meant either splitting the module
   or deleting the limits and probe records these guard files deliberately carry inline.

   The criterion is therefore **rule count and enumeration surface, measured, not lines**: four
   acquisition rejection rules deleted (named/namespace import ban, dynamic acquisition, impostor
   `postgres(...)` call, driver-outside-call-position) and six enumerated acquisition routes reduced
   to zero, with nothing enumerated in their place. The line growth is a documented cost, recorded
   here and in the archive entry rather than reinterpreted. What the module does NOT do is grow a
   new open-ended recognizer: the one closed set it gained, `EXECUTION_METHODS`, is backstopped by
   Rule 2, whose recognizer governs file discovery too and is now shared from
   `tests/db/_destructiveStatements.ts`.
5. Discovery (`_metaDestructiveDbTargetGuard.test.ts`) keeps its walk and regexes, now importing the shared destructive-statement recognizer constant (§2.2 Rule 2) instead of declaring its own copies; its accidental self-exemption becomes explicit.
6. The redesigned analyzer is ENROLLED in `tests/mutation/source/registry.ts` (sourcePath `tests/db/_destructiveFileAnalysis.ts`, suite `tests/db/destructiveFileAnalysis.test.ts` — pure AST, DB-free, ~1s) with `pnpm heavy pnpm mutation:guards` run BEFORE the diff-review round-1 dispatch and the measured score plus unaccepted-survivor set stated in that brief, per the AGENTS.md guard-surface enrolment contract.

### 2.5 What this wave does NOT do: discovery-by-connection

The entry's "second open limit" — spelling-sensitive FILE discovery (`select prune_sync_log()` and `select "public"."prune_sync_log"()` are never discovered, `_metaDestructiveDbTargetGuard.test.ts:40-49`) — terminates only via discovery-by-connection: analyze every file that opens a DB connection. Census, measured 2026-08-14 on this branch (`rg -l 'from "postgres"|require\("postgres"\)' tests/`): **~150 test files import the postgres driver; ~60 of them never call `assertLocalDbUrl`**, many connecting through shared helpers (`tests/db/_b2Helpers.ts`, `tests/sync/_holdAwareTestkit.ts`, …) or legitimately targeting the validation project. Requiring the analyzer of all of them is an arc of its own — per-file dispositions, helper-module modeling, and a validation-target accept-set the current guard deliberately does not have. It is REFILED as a new ledger row (`BL-DESTRUCTIVE-GUARD-DISCOVERY-BY-CONNECTION`, census attached as probe evidence, effort L) rather than smuggled into this wave. The spelling limit stays documented in the meta-test header, where it already lives.

## 3. Entry B — BL-LEDGER-GIT-TIMEOUT-CONSTANTS

### 3.1 Current state, verified 2026-08-14

`scripts/lib/ledger-git.ts` exports exactly one symbol, `realGitSurface(): GitSurface` (`scripts/lib/ledger-git.ts:88`), imports `spawnSync` directly (line 10), and holds four spawn-bound constants: `FETCH_MS = 30_000` (line 32), `LS_REMOTE_MS = 30_000` (line 33), `GH_MS = 10_000` (line 34), `MAX_GIT_STDOUT = 64 * 1024 * 1024` (line 62). Six `spawnSync` call sites: the shared `git(args, timeout)` helper (line 64 ff., `maxBuffer: MAX_GIT_STDOUT`) serving eight readers, plus five inline calls — `localRefs` (line 114, `LS_REMOTE_MS`, no `maxBuffer`), `prList` (line 140, `GH_MS`, no `maxBuffer`), `fileOids` (line 204), `showFile` (line 232), `mergeBase` (line 259, `LS_REMOTE_MS` + `MAX_GIT_STDOUT`).

The only production importer is `scripts/ledger-claims.ts:19` (surface constructed at line 65). The suite (`tests/scripts/ledgerClaimsCheck.test.ts`) tests against REAL git binaries in throwaway repos (`throwawayRepo` line 776, `atRepo` line 807, `withFakeGh` line 832) — no spawn mocks, which is why a 30000-to-30001 mutant is invisible: the only separating behavior is whether a child running between the two bounds is killed.

Mutation ledger: six `accepted-gap` rows, all `ref: "BL-LEDGER-GIT-TIMEOUT-CONSTANTS"`, at `tests/mutation/source/registry.ts:435-470` (`integer-literal:32:18:30000>30001`, `integer-literal:33:22:30000>30001`, `integer-literal:34:15:10000>10001`, `integer-literal:62:24:64>65`, `integer-literal:62:29:1024>1025`, `integer-literal:62:36:1024>1025`). Accepted-gap counts as a survivor (`tests/mutation/source/ledger.ts:79-91` excludes only `equivalent` from the denominator), so the surface scores 72/78 ≈ 0.923 against `scoreFloor: 0.9` (`registry.ts:385`). The gate pins exact ledger-kind counts: `ledgerGit: { equivalent: 6, "accepted-gap": 6 }` (`tests/mutation/guardSurfaces.gate.test.ts:64`).

Structural guards touching this module:

- `tests/scripts/ledgerFields.test.ts:150-173` — the spawn-ban: three sibling modules must spawn nothing, and the anti-vacuity twin at line 166 requires ledger-git.ts source to match `/from\s+["']node:child_process["']/`.
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

- **Interface injection is the file family's established pattern** — `GitSurface` itself is injected into `resolveClaims`/`runCheck` (`scripts/lib/ledger-check.ts:4` header: "NO SUBPROCESS SPAWNING", everything arriving through the injected `GitSurface`), and `realGitSurface()` is arity-0 at all three call sites, so an optional parameter is backward compatible with zero caller edits.
- **A mutable module-level `let run = spawnSync`** is writable module state reachable from any importer — a wider surface for the spawn-ban guard to police, which is the widening cost the entry itself warns about.
- **An options object carrying the bounds** would make the timeouts caller-configurable in production, changing the module's contract; nothing needs that. The constants stay module-private; the seam exposes the SPAWN, and the test observes what values arrive at it.

The literal `import { spawnSync } from "node:child_process"` stays (it is the default), so the anti-vacuity guard at `tests/scripts/ledgerFields.test.ts:166` and the premise-scan module list (`tests/mutation/source/premiseScan.ts:31`) hold without edits.

All six internal call sites route through the seam. The test injects a recording fake that captures `(cmd, args, options)` per call and returns canned success shapes, then asserts per reader:

- `fetch` passes `timeout: 30_000` (FETCH_MS);
- `lsRemote`, `localRefs`, `mergedIntoMain`, `readBlob`, `diffHunks`, `tipEpoch`, `isShallow`, `currentBranch`, `mergeBase`, `fileOids`, `showFile` pass `timeout: 30_000` (LS_REMOTE_MS);
- `prList` passes `timeout: 10_000` (GH_MS);
- every reader routed through `git()`, plus `mergeBase`, `fileOids`, and `showFile`, passes `maxBuffer: 67_108_864` (MAX_GIT_STDOUT — verified live: `fileOids` and `showFile` pass both `LS_REMOTE_MS` and `MAX_GIT_STDOUT`);
- `localRefs` and `prList` gain `maxBuffer: MAX_GIT_STDOUT`, asserted like the rest — see the fault repair below.

Expected literals live in the test, so each source mutant (30001, 10001, 65, 1025) diverges from the recorded value and dies.

**Fault repair folded in (spec review R1 F2 — probe showed the documented "ENOBUFS is loud" claim FALSE for `prList`).** `prList` returns `[]` on `r.status !== 0 || !r.stdout` and never reads `r.error` (`scripts/lib/ledger-git.ts:154` region), so a spawn-level fault — ENOBUFS past Node's 1 MiB default, ETIMEDOUT at GH_MS, gh missing — reads as an EMPTY open-PR universe, and `resolveClaims` consumes it with no degraded marker (`scripts/lib/ledger-claims-core.ts:201`). A fault that silently shrinks the claim universe is a false "no collision" — precisely the defect class invariant 12 exists to stop, and a consequence-bound violation (silently wrong, no signal). Repair, scoped to the three touched scripts-tree modules (`ledger-git.ts`, `ledger-claims-core.ts`, `ledger-check.ts`):

- `prList` throws on `r.error`, on `r.status !== 0`, AND on every status-zero malformed-output class spec review R2 F2 enumerated by probe: empty stdout, invalid JSON, non-array JSON, and array rows failing the FULL consumed-field shape — numeric `number`, non-empty string `headRefName`, boolean `isCrossRepository` (present, not coerced: today's `=== true` at `scripts/lib/ledger-git.ts:166` silently reads a MISSING flag as a base-repository PR, which `resolveClaims` then attaches — spec review R3 F1 probe), and `headRepositoryOwner` absent, `null`, or an object whose `login` is a string (today's `?? null` coercion at line 165 becomes validation). `[]` is returned ONLY when gh exits 0 and the payload parses to a well-formed (possibly empty) row array (`scripts/lib/ledger-git.ts:154-170` today returns `[]` or a coerced row for all of these).
- `resolveClaims` wraps the `git.prList()` call in try/catch and pushes a `pr-universe-unavailable: <message>` degraded marker (the established idiom at `scripts/lib/ledger-claims-core.ts:139`).
- `runCheck`'s degraded-promotion loop (`scripts/lib/ledger-check.ts:255-259`) currently promotes ONLY `fetch-failed` markers to `untrusted` — spec review R2 F1 proved by execution that the marker alone still yields a trusted `{"code":0}`. The loop therefore also promotes `pr-universe-unavailable`, so the fault lands as exit 2 ("check could not be trusted"), which is the UNTRUSTED-DOMINATES contract already stated in that function's own comment (`scripts/lib/ledger-check.ts:261-265`). Acceptance asserts the EXIT CODE, not merely the marker: a `runCheck` case with a throwing `prList` returns `code: 2`.
- Both `localRefs` and `prList` gain `maxBuffer: MAX_GIT_STDOUT`, and the seam test asserts all six spawn sites pass it.
- `ledgerClaimsCore` is an enrolled mutation surface (`tests/mutation/source/registry.ts:330`), so its ledger rows are reconciled in the same task.

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

Both bypasses are real, and both are already documented in the owning surface's limits record — the standalone JSDoc block at `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:215-245`, immediately above `PROJECT_GATED` (line 254), whose own text carries the ratification: "owner-ratified 2026-08-10 after four review rounds each surfaced a narrower bypass and no product code changed" (lines 216-217). The block names both bypasses, states the threat-model fence (ordinary authoring mistakes by a contributor, not deliberately constructed fake declarations), states the consequence bound (accidental cases are caught loudly with the offending file and line), and cross-references `BL-CI-WIRING-GUARD-RESIDUAL-BYPASSES` by id. One correction to the entry's prose: the block is a standalone JSDoc above the registry, not the file's top header (lines 1-32 never mentions the limits) — substance identical, placement misdescribed.

Mechanics, for the record:

- Bypass 1: `scanSkip` (lines 518-531) matches the `test.skip` callee shape only and never inspects `arguments[0]`, so `test.skip(false, "…")` binds a registry row while gating nothing (liveness is `titlesWithSkip.has(row.title)`, line 540).
- Bypass 2: one `PROJECT_GATED` row (lines 569-570) drops the flat identifier ban (line 585) for the whole file, and the body scans stop at nested function boundaries (lines 664-671, lines 692-699; rationale comment lines 643-644), so a gate inside a `test.step` callback in another test of the same file is unscanned.

### 4.2 Disposition: DEMOTE to archive — documented limit, no code change

Per the ledger filing bar (`AGENTS.md` § "Ledger filing bar (2026-08-04)"), a row whose worst case is conservative behavior plus a surfaced signal is a DOCUMENTED LIMIT and "belongs in the owning surface's limits record …, not in the open queue." That is this row's state already: the limit is recorded in the owning surface (lines 215-245), grepable by the BL id, dated, ratified, with the promotion trigger unfired ("a real contributor hits one of these by accident, or the guard is extended to a surface where a fake declaration is plausible", `BACKLOG.md` entry body). The row was born demoted; keeping it in the open queue re-lists settled work.

Action: move the entry to `BACKLOG-archive.md` at terminal state DOCUMENTED LIMIT, carrying the full original body per the archive convention, the promotion trigger verbatim (it is the re-open condition), and the corrected locator (`tests/cross-cutting/`, not `tests/ci/`). No guard code changes. No mutation enrolment: the guard's logic is inline in the test file with no exported module, so the source-mutation registry cannot express it as shipped (rows mutate a `sourcePath` module judged by a referring suite, `tests/mutation/source/registry.ts:12-38`); restructuring the guard to make it enrollable is exactly the recognizer-ratchet work the ratification declines. This mirrors the step3-a11y precedent — a surface the registry cannot express is re-dispositioned honestly with the probe that shows it, never enrolled symbolically (`AGENTS.md` § convergence criterion, item 3).

### 4.3 What would reverse this

Only the promotion trigger. A demotion under this procedure is recoverable by construction — the archive entry carries the full body, and the guard-block cross-ref survives, so a future arc re-files from evidence rather than from scratch.

## 5. Entry D — BL-PG-CRON-HOST-ASSERTION

### 5.1 Current state and prior art, verified 2026-08-14

The suite is `tests/cross-cutting/pg-cron-coverage.test.ts` (543 lines) with helpers in `tests/cross-cutting/pgCronSmokes.ts`; 9 canonical jobs read from `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json` (`pg-cron-coverage.test.ts:67-77`). Route assertions are substring containment on command text (line 465, lines 300 and 306, line 382) — host never checked, exactly as the entry says. Target mode comes from `tests/db/_validationTargetIdentity.ts:115-136` (unset/local ⇒ loopback DB; `validation` ⇒ `TEST_DATABASE_URL`); CI runs the validation mode in `x-audits.yml:406` and the local mode in unit-suite-db.

The host is baked into `cron.job.command` AT MIGRATION TIME (`supabase/migrations/20260527000003_schedule_cron_jobs.sql:40-41`, line 45, jobs lines 88-145; `supabase/migrations/20260602000005_b3_schedule_notify_cron.sql:8` and its lines 35 and 43; `supabase/migrations/20260727000001_reschedule_refresh_watch.sql:9` and its line 20) from the GUC `app.fxav_vercel_url`, which the local bootstrap sets database-wide (`scripts/ci/supabase-local-bootstrap.sh:38`, applied lines 106-108).

Two probes run this wave change the entry's premises:

1. **The GUC oracle is dead on the one target that matters, for a recorded reason the entry does not cite.** Probed live: local (127.0.0.1:54322) `current_setting('app.fxav_vercel_url')` = `http://host.docker.internal:3000`, matching the baked commands; **validation (`vzakgrxqwcalbmagufjh`) returns EMPTY** — Supabase managed Postgres denies `ALTER DATABASE ... SET app.*` to `postgres`, so validation's migration used session-scoped `set_config` and the GUC evaporated with that session (`docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/handoffs/Phase-0.A-block-1-closeout.md:39-49`, F1). A GUC comparison is therefore vacuous exactly where a stale baked host is reachable.
2. **The dispatch URL is ALREADY observable live, and the suite discards the answer.** `pgCronSmokes.ts:34-47` executes each stored command in a rolled-back transaction and reads the resulting `net.http_request_queue.url` under its own xid. `pg-cron-coverage.test.ts:526` parses it with `new URL(...)` and line 528 asserts ONLY `pathname + search` — `protocol` and `host` are in hand and thrown away.

A sound host oracle also already exists, mutation-tested: `scripts/lib/validation-smoke-target.ts:12-35` pins the exact production host (https-only, no explicit port, preview-host recognizer scoped), with cases covering per-deployment preview hosts, an `.evil.test` suffix, `http://`, and an explicit port at `tests/scripts/validation-smoke-base-url.test.ts:17-55`. The only host comparison ever designed for cron was a MANUAL operator checklist (`docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/01-pivot-tasks.md:827`, R18 F40): scheme+host must equal the stable alias, never a `<project>-<hash>-<team>.vercel.app` preview.

One docs defect found: the ci-dark spec's pointer for this entry names §10.4, but §10.4 is `BL-CI-VITEST-EXCLUSION-COVERAGE` (`docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md:293-295` vs line 418). Corrected in this wave to cite the backlog entry directly.

### 5.2 Design: assert the dispatch origin from the queue, per target mode

Extend the firing-smoke census (`pg-cron-coverage.test.ts:501-528`) to assert, per job, on the SAME `new URL(...)` value it already parses:

- **Local / unset mode:** read `current_setting('app.fxav_vercel_url', true)` over the same connection that read the queue; assert it is non-empty (a silent bootstrap regression surfaces here), then assert `new URL(guc).origin === parsed.origin`. Both sides come from the database actually connected — no flag inference.
- **Validation mode:** the GUC is unavailable (probe 1), so the expected value is the deployment contract itself: `parsed.protocol === "https:"`, `parsed.port === ""`, and `parsed.hostname` equal to the production host pinned in `scripts/lib/validation-smoke-target.ts:12`. That constant is module-private today (`export` grep: only `assertValidationSmokeBaseUrl` at line 15) — this wave EXPORTS `PRODUCTION_HOST` so the cron comparator imports it rather than re-typing it. The smoke ASSERT FUNCTION is deliberately not reused: it accepts per-deployment preview hosts (`tests/scripts/validation-smoke-base-url.test.ts:24`), which is correct for smokes and WRONG for cron — a preview host is a FAILURE for cron, per the manual-checklist precedent (stable alias, never `<project>-<hash>-<team>.vercel.app`).

The comparator is extracted as a small exported helper in `pgCronSmokes.ts` (pure function: `(url: URL, mode, gucValue) => {ok} | {ok:false; reason}`) so its failure modes are unit-testable without a DB — and `pgCronSmokes.ts` is then ENROLLED in `tests/mutation/source/registry.ts` (sourcePath `tests/cross-cutting/pgCronSmokes.ts`, suite = the new DB-free comparator unit file, which also imports and exercises `firingSmokeSql`/`queuedUrlsFromSmokeOutput`), with `pnpm heavy pnpm mutation:guards` run before the diff-review round-1 dispatch and the score plus unaccepted-survivor set stated in that brief. The module is exactly the registry's shape — exported pure functions with a referring suite (spec review R1 F3).

### 5.3 Soundness against the entry's four objections

| Objection (entry, verbatim class) | Why this design survives it |
| --- | --- |
| Scheme mismatch (`http://` passing against `https://`) | `URL.origin` includes the protocol; validation mode additionally pins `protocol === "https:"`. The unit suite proves `http://` fails. |
| Trailing slash | `URL.origin` has no path component; a trailing slash cannot reach the comparison. |
| Base paths | Path is asserted by the EXISTING route assertions; the origin comparison is path-blind by construction, so a base-path smuggle fails the route assertion, not silently passes the host one. |
| Target flag proves nothing about the connected database | The actual value is read from `net.http_request_queue` of the connected database, produced by executing that database's own stored command; the local-mode expected value is read from the same connection. No leg keys off the flag alone — the flag only selects WHICH contract applies (GUC-origin equality vs production-host pin). |

**Live-mismatch demonstration (required by the entry before the assertion lands):** unit cases on the extracted comparator for each failure mode (http-for-https, preview host, explicit port, foreign host, empty GUC in local mode), PLUS one integration-shaped sabotage: in a rolled-back transaction on the local stack, re-bake one job's command with an `http://` origin and assert the census assertion goes red by name. The mechanism-sabotage pattern to copy is `tests/cross-cutting/pgCronCiVacuity.test.ts:143-214`.

### 5.4 Disposition

BUILD — the entry's bar is met: an oracle that survives all four objections exists, is demonstrated against live mismatches, and reuses an already-mutation-tested host pin instead of inventing a recognizer. The entry graduates when the assertion lands. The GUC-on-validation vacuity is recorded in §6 as a documented limit with its Phase-0.A citation, so no future round re-derives it.

## 6. Documented limits

Consequence bound for every limit here: behavior is conservative (loud failure or unchanged current semantics) plus a surfaced signal — never silently wrong. Threat-model fence: all guards in this wave defend against ordinary authoring mistakes by a contributor; deliberate obfuscation or deliberate circumvention files here, not to the open queue.

1. **`prList` fault semantics change is deliberate and bounded** (§3.4): faults and malformed status-zero output now throw, surface as a degraded marker, and promote to exit 2 via `runCheck`'s untrusted-dominates contract; only a clean well-formed gh run yields a row array. The prior "overflow is loud" belief was FALSE (spec review R1 F2 probe: ENOBUFS lands in the `status !== 0` branch and returned `[]`), which is why this is a repair and not scope creep.
2. **A production caller could inject its own spawn through the `realGitSurface` seam.** Outside the threat model (deliberate circumvention); the spawn-ban guard still pins that no OTHER module imports `node:child_process`, so the injected function would itself have to come from a module the guard already polices.
3. **Wiring-guard bypasses (entry C)** stay open as ratified limits in `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:215-245`; re-open condition is the promotion trigger preserved in the archive entry.
4. **`app.fxav_vercel_url` is unreadable on validation** (managed PG denies `ALTER DATABASE ... SET app.*`; session-scoped workaround recorded at `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/handoffs/Phase-0.A-block-1-closeout.md:39-49`). Validation-mode host assertions therefore pin the deployment contract (production host, https, default port) instead of comparing to the GUC. A future validation host migration means editing ONE constant (`scripts/lib/validation-smoke-target.ts`), which is the point of importing it.
5. **Destructive-file DISCOVERY stays spelling-sensitive** (`tests/db/_metaDestructiveDbTargetGuard.test.ts:40-49`): quoted or unqualified destructive SQL is not discovered and no analysis runs. Terminating fix is discovery-by-connection, refiled with census evidence (§2.5) as `BL-DESTRUCTIVE-GUARD-DISCOVERY-BY-CONNECTION`.
6. **The REST wipe channel is unmodeled** by the destructive-file analyzer: `tests/db/resetValidationDataPostgrest.test.ts` executes its wipe over PostgREST, guarded by a LOCAL `assertLocalRestUrl` (lines 45-55) the analyzer neither requires nor verifies. The execution-site framing covers DB clients; an HTTP executor is a different channel. Recorded here; promoting `assertLocalRestUrl` into the shared guard module is follow-on work only if a second REST-destructive file ever appears.
7. **Factory summaries are one-level and non-recursive** (§2.3): a factory returning another factory's call rejects loudly. Conservative-plus-surfaced by design.
8. **Rule 3 keys on POSITION, not on what the position does with the value**, so it refuses uses that merely INSPECT a checked client alongside the ones that launder its capability: `if (!sql) throw new Error(...)`, `sql == null` and `typeof sql` are all rejected, though none hands the client to an untracked name. Conservative-plus-surfaced — a loud, local rejection an author fixes by restructuring, never a silent acceptance — and pinned by fixture (bx) in `tests/db/destructiveFileAnalysis.test.ts`. Recorded here rather than in the rule's own header because that header sits above two position-encoded mutation-ledger siteIds, and inserting lines there would silently invalidate both.

## 7. Test plan

- **Entry A:** the existing 32-fixture rejection corpus re-asserted with per-fixture REASONS (anti-tautology: each fixture pins the reason class it now trips, so a fixture cannot pass by tripping an unrelated check); new accept fixture for the factory pattern (`newConn` shape); new reject fixtures per §2.4 item 3 (detached-method probe verbatim, unenumerated acquisition shape, Rule-3 laundering shapes, unclassifiable factory); the 7 real discovered files pass and the guard's 2 own files carry explicit exemptions; meta-test suite stays green with the shared recognizer import; mutation enrolment per §2.4 item 6.
- **Entry B:** new seam test (recording fake spawn) asserting per-reader `timeout`/`maxBuffer` literals across all six spawn sites; prList fault cases assert a THROW for: spawn error object, non-zero exit, and the status-zero malformed classes (empty stdout, invalid JSON, non-array JSON, and per-field malformed rows: missing/non-numeric `number`, missing, empty, or non-string `headRefName`, missing/non-boolean `isCrossRepository`, mis-shaped `headRepositoryOwner`); a `resolveClaims` case asserts the `pr-universe-unavailable` degraded marker; a `runCheck` case with a throwing `prList` asserts `code: 2`; existing `ledgerClaimsCheck` real-git suites green (the gh-fault case at its lines 1150-1170 updated to the new contract); `pnpm heavy pnpm mutation:guards` — `ledgerGit` at `{ equivalent: 6, "accepted-gap": 0 }`, zero unaccepted survivors, ledger siteIds reconciled after line shifts; spot-check one timeout and one maxBuffer mutant by hand (mutate-your-own-fix).
- **Entry C:** docs-only — `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaDeferralLedgerGraduation.test.ts` green after the archive move (the in-progress guard's archives-reject-in-flight rule: the marker comes off in the same commit that archives, per invariant 12; the graduation guard gains C's `BACKLOG_GRADUATED` row in the same commit).
- **Entry D:** comparator unit cases in a new DB-free `pgCronSmokes` unit suite (accept + http-for-https + preview host + explicit port + foreign host + empty-GUC-local), which doubles as the mutation-enrolment referring suite (§5.2); census assertion wired for every job row in both modes; one sabotage integration case (re-baked `http://` command in a rolled-back tx goes red by name); existing 10 suite cases stay green; validation-mode run via the `x-audits.yml` path exercised in CI before merge.
- Suites touched run scoped during development; full `pnpm heavy pnpm test` plus `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check` before push (pre-push gates).

### 7.1 Ledger closeout — all four entries (spec review R4 F1: the class, enumerated)

Every entry this wave resolves leaves the open queue with a durable archive record AND a `BACKLOG_GRADUATED` registry row in `tests/docs/_metaDeferralLedgerGraduation.test.ts` (row shape: entry id + per-entry `provenance` string the archived section must contain — this branch), in the same commit as its archive move. Marker timing follows invariant 12's GRADUATING-entry rule: each entry's `IN PROGRESS` marker comes off in the same commit that archives that entry (archives categorically reject in-flight entries — `tests/docs/_metaLedgerInProgress.test.ts:77-81`), so C's marker comes off at its §4.2 archive commit early in the branch while A/B/D markers stay live until each one's close-out archive commit. The invariant-12 "PR's last commit" rule governs markers of entries a branch leaves OPEN at merge — this wave has none, so no marker survives to the merge either way:

- **Entry C** — archived at implementation start (§4.2), terminal state DEMOTED TO A DOCUMENTED LIMIT; `BACKLOG_GRADUATED` row with provenance `chore/guard-completeness-wave`.
- **Entries A, B, D** — graduate at implementation close-out, each moved to `BACKLOG-archive.md` with a `— CLOSED 2026-08-<dd> (chore/guard-completeness-wave, SHIPPED)` heading recording what shipped and which premises this spec corrected (A: the 7+2 partition and the three-rule redesign; B: the refuted "ENOBUFS is loud" belief; D: the dead-GUC probe and the queue-origin oracle); each gets its `BACKLOG_GRADUATED` row.
- The refiled `BL-DESTRUCTIVE-GUARD-DISCOVERY-BY-CONNECTION` row is the one NEW open entry this wave leaves behind (§2.5), filed with the census probe.

## 8. Out of scope

- Discovery-by-connection for the destructive-file guard (§2.5 — refiled with census).
- Any closing of the wiring-guard bypasses (§4 — ratified limits; reopening requires the promotion trigger).
- Mutation-registry enrolment of the WIRING GUARD only (its logic is inline in the test file; the registry cannot express it as shipped, and restructuring is the ratchet §4 declines). The destructive-file analyzer and `pgCronSmokes.ts` ARE enrolled by this wave (§2.4 item 6, §5.2).
- `scoreFloor` ratchet for `ledgerGit` (§3.4).
- Production application code of any kind (§1.1 scope fence).
