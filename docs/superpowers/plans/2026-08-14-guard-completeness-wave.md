# Guard-Completeness Wave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close four guard-completeness ledger entries: redesign the destructive-file analyzer to execution-site checking, give ledger-git an injectable spawn seam with sound prList fault semantics, demote the wiring-guard bypass entry to the archive, and land a sound pg-cron dispatch-host assertion.

**Architecture:** Four independent sub-arcs on one branch, each with its own TDD cycle and archive close-out. No production application code changes — surfaces are `tests/db/` (analyzer), `scripts/lib/` (git adapter + claims core + check), `tests/cross-cutting/` (pg-cron suite + smokes helpers), and the ledger documents. Two modules gain source-mutation enrolment before the diff-review dispatch.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest, TypeScript compiler API (`ts.*` AST), postgres.js, pg_cron/pg_net (read-only), source-mutation harness (`pnpm mutation:guards`).

**Spec:** `docs/superpowers/specs/ci/2026-08-14-guard-completeness-wave-design.md` (APPROVED at cross-model round 6). The spec is canonical; where this plan compresses, the spec section cited governs.

## Global Constraints

- Invariant 11: all work in this worktree (`../FX-worktrees/guard-completeness-wave`), never the main checkout.
- Invariant 6: one conventional-commits commit per task (`test(db):`, `fix(infra):`, `docs:` etc. as tagged per task).
- Heavy phases (`pnpm test`, `pnpm mutation:guards`, builds) run under `pnpm heavy` (AGENTS.md semaphore).
- No production `app/`/`lib/` application code; no UI surface (spec §1.1 scope fence). Invariant-8: N/A (see §12).
- Marker timing: each entry's `IN PROGRESS` marker comes off in the same commit that archives that entry (spec §7.1).
- Mutation-family closure: operator families for both new registry rows are the registry's existing `OPERATOR_NAMES` set (`tests/mutation/source/registry.ts:374` pattern); a reviewer-proposed NEW family is admissible only with a live escaping mutant against the shipped guard.
- Pre-push gates: full `pnpm heavy pnpm test`, `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`.

## Acceptance-criteria index (spec anchors)

| AC | Spec anchor | One-line contract |
| --- | --- | --- |
| AC-1 | §2.4-1 | Every existing rejection fixture still rejects, with its NEW reason asserted per fixture |
| AC-2 | §2.4-2 | 7 real discovered files pass; guard's 2 own files carry explicit exemptions |
| AC-3 | §2.4-3 | New reject fixtures: detached-method probe verbatim, unenumerated acquisition, Rule-3 laundering shapes, unclassifiable factory |
| AC-4 | §2.4-4 (AMENDED 2026-08-15) | Acquisition rules deleted and the enumeration surface goes to zero; the line-count half is retired as a refuted prediction — 412 code lines vs 262, measured |
| AC-5 | §2.4-5 | Meta-test imports the shared recognizer; self-exemption explicit |
| AC-6 | §2.4-6 | Analyzer enrolled in mutation registry; `mutation:guards` run pre-diff-review |
| AC-7 | §3.2 | `realGitSurface(opts?: { spawn?: typeof spawnSync })`; all six spawn sites routed through the seam |
| AC-8 | §3.2 | Seam test asserts per-site `timeout`/`maxBuffer` literals (four constants, six sites) |
| AC-9 | §3.4 | prList throws on `r.error`, non-zero status, and every status-zero malformed class; `[]` only from a well-formed row array |
| AC-10 | §3.4 | `pr-universe-unavailable` degraded marker; `runCheck` returns `code: 2` with a throwing prList |
| AC-11 | §3.4 | `ledgerGit` gate row at `{ equivalent: 6 }` (accepted-gap rows all deleted; zero-count kinds are omitted per the gate reducer); siteIds reconciled; one timeout + one maxBuffer hand-mutant spot-check |
| AC-12 | §4.2 | Entry C archived (full body, trigger verbatim, corrected locator), marker off same commit, `BACKLOG_GRADUATED` row |
| AC-13 | §5.2 | `PRODUCTION_HOST` exported; comparator in `pgCronSmokes.ts`; six unit cases |
| AC-14 | §5.2 | Census asserts origin per job in both modes; local expected read from same connection's GUC |
| AC-15 | §5.3 | Sabotage integration case: re-baked `http://` command goes red by name in a rolled-back tx |
| AC-16 | §5.2 | `pgCronSmokes` enrolled in mutation registry with the unit suite |
| AC-17 | §2.5, §5.1 | ci-dark §10.4 cross-ref corrected; `BL-DESTRUCTIVE-GUARD-DISCOVERY-BY-CONNECTION` filed with census |
| AC-18 | §7, §7.1 | Close-out: full-suite green, entries A/B/D archived + graduated, validation-mode pg-cron run exercised |

## Meta-test inventory (declared per writing-plans rule)

- EXTENDS: `tests/db/destructiveFileAnalysis.test.ts` (rewritten reasons + new fixtures), `tests/db/_metaDestructiveDbTargetGuard.test.ts` (shared recognizer import, explicit self-exemption), `tests/mutation/guardSurfaces.gate.test.ts` expectations, `tests/docs/_metaDeferralLedgerGraduation.test.ts` (`BACKLOG_GRADUATED` rows ×4).
- CREATES: tests/scripts/ledgerGitSpawnSeam.test.ts, tests/cross-cutting/pgCronSmokesUnit.test.ts.
- Advisory-lock topology: N/A — no `pg_advisory*` surface touched. Supabase call-boundary registry: N/A — no Supabase client call sites touched.

---

`<SEP>` in any embedded ledger/archive text below stands for the archive convention's em-dash separator (space, em-dash, space) and MUST be written as that literal character in the target file; it is encoded here only to keep this plan clear of the user-copy em-dash lint.

<!-- tasks: depth=3 -->

### Task 1: Entry C — archive the wiring-guard entry (docs only)

**Files:**
- Modify: `BACKLOG.md` (remove entry at § BL-CI-WIRING-GUARD-RESIDUAL-BYPASSES, lines ~522-534)
- Modify: `BACKLOG-archive.md` (new section at top)
- Modify: `tests/docs/_metaDeferralLedgerGraduation.test.ts` (`BACKLOG_GRADUATED` array)

**Interfaces:** Produces: archived section whose heading grep `BL-CI-WIRING-GUARD-RESIDUAL-BYPASSES` resolves in `BACKLOG-archive.md`; a `BACKLOG_GRADUATED` row `{ id: "BL-CI-WIRING-GUARD-RESIDUAL-BYPASSES", provenance: "chore/guard-completeness-wave" }`.

<!-- task: red=`pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` ac=AC-12 -->

- [ ] **Step 1: Add the graduation registry row FIRST (this is the red).** In `tests/docs/_metaDeferralLedgerGraduation.test.ts`, append to `BACKLOG_GRADUATED` (after the LAST existing row — the array spans roughly lines 95-499; locate its closing `];` with `nl` at implementation time rather than trusting a line number):

```ts
  // chore/guard-completeness-wave (2026-08-14): owner-ratified documented limit
  // (2026-08-10) demoted per the filing bar; the limits live in the guard's own
  // JSDoc block (tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:215-245).
  {
    id: "BL-CI-WIRING-GUARD-RESIDUAL-BYPASSES",
    provenance: "chore/guard-completeness-wave",
  },
```

- [ ] **Step 2: Run the DECLARED marker command to verify it fails** — the row demands an archived section that does not exist yet.
Run: `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts`
Expected: FAIL — graduation row with no matching archive section containing the provenance string.

- [ ] **Step 3: Move the entry.** Cut the whole entry body from `BACKLOG.md` (heading `### BL-CI-WIRING-GUARD-RESIDUAL-BYPASSES …` through the `---` before `### BL-IDENTITY-CLEAR-FAILURE-IS-SILENT`). Paste at the TOP of `BACKLOG-archive.md` under a new heading, preserving the body verbatim below it, then append the closing block:

```markdown
## BL-CI-WIRING-GUARD-RESIDUAL-BYPASSES <SEP> two deliberate-authoring bypasses of the crew-e2e wiring guard <SEP> DEMOTED TO A DOCUMENTED LIMIT 2026-08-14 (chore/guard-completeness-wave)

<original body verbatim, WITHOUT the IN PROGRESS status field — replace the meta line's `**Status:** IN PROGRESS · **Branch:** chore/guard-completeness-wave · ` prefix with nothing>

**Archive disposition (2026-08-14, chore/guard-completeness-wave):** demoted per the ledger filing bar <SEP> the limit is recorded in the owning surface's JSDoc block (`tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:215-245`, ratified 2026-08-10), grepable by this id. Locator correction: the guard lives in `tests/cross-cutting/`, not `tests/ci/` as the entry's filing said. Re-open condition is the promotion trigger above, verbatim and unchanged. Spec: `docs/superpowers/specs/ci/2026-08-14-guard-completeness-wave-design.md` §4.
```

- [ ] **Step 4: Re-run the SAME declared command to verify green** (the marker contract is red-then-green on one unchanged command).
Run: `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts`
Expected: PASS. Then, additional coverage (not the marker command): `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` — PASS (marker removed in the same edit, so the archive holds no in-flight entry).

- [ ] **Step 5: Commit.**

```bash
git add BACKLOG.md BACKLOG-archive.md tests/docs/_metaDeferralLedgerGraduation.test.ts
git commit -m "docs: demote BL-CI-WIRING-GUARD-RESIDUAL-BYPASSES to archived documented limit"
```

### Task 2: Entry B — spawn seam (`realGitSurface` optional parameter)

**Files:**
- Modify: `scripts/lib/ledger-git.ts`
- Test (create): tests/scripts/ledgerGitSpawnSeam.test.ts

**Interfaces:** Produces: `realGitSurface(opts?: { spawn?: typeof spawnSync }): GitSurface` — arity-0 callers unchanged. Consumed by Task 3's fault tests and Task 4's mutation run.

<!-- task: red=`pnpm vitest run tests/scripts/ledgerGitSpawnSeam.test.ts` ac=AC-7,AC-8 -->

- [ ] **Step 1: Write the failing seam test.** Create tests/scripts/ledgerGitSpawnSeam.test.ts. RED validity: fails today because `realGitSurface` accepts no parameter and every call site invokes module-scope `spawnSync` directly (`scripts/lib/ledger-git.ts:10`, sites at lines 114, 140, 204, 232, 259 and the `git()` helper) — the recording fake is never called.

```ts
import { describe, expect, it } from "vitest";
import type { spawnSync } from "node:child_process";
import { realGitSurface } from "@/scripts/lib/ledger-git";

type SpawnArgs = { cmd: string; args: string[]; opts: Record<string, unknown> };

function recordingSpawn(stdout = "") {
  const calls: SpawnArgs[] = [];
  const fake = ((cmd: string, args: string[], opts: Record<string, unknown>) => {
    calls.push({ cmd, args, opts });
    return { status: 0, stdout, stderr: "", error: undefined, signal: null };
  }) as unknown as typeof spawnSync;
  return { calls, fake };
}

const MAX = 64 * 1024 * 1024;

describe("ledger-git spawn seam pins the timeout and maxBuffer constants", () => {
  it("fetch passes FETCH_MS=30000 and MAX_GIT_STDOUT", () => {
    const { calls, fake } = recordingSpawn();
    realGitSurface({ spawn: fake }).fetch();
    const c = calls[0];
    expect(c?.opts.timeout).toBe(30_000);
    expect(c?.opts.maxBuffer).toBe(MAX);
  });

  it("localRefs passes LS_REMOTE_MS=30000 and now MAX_GIT_STDOUT", () => {
    const { calls, fake } = recordingSpawn("");
    realGitSurface({ spawn: fake }).localRefs();
    expect(calls[0]?.opts.timeout).toBe(30_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });

  it("prList passes GH_MS=10000 and now MAX_GIT_STDOUT", () => {
    const { calls, fake } = recordingSpawn("[]");
    realGitSurface({ spawn: fake }).prList();
    expect(calls[0]?.opts.timeout).toBe(10_000);
    expect(calls[0]?.opts.maxBuffer).toBe(MAX);
  });
});
```

Add one `it` per remaining reader (`lsRemote`, `mergedIntoMain`, `readBlob`, `diffHunks`, `tipEpoch`, `isShallow`, `currentBranch`, `mergeBase`, `fileOids`, `showFile`) asserting `timeout: 30_000` + `maxBuffer: MAX` — derive each canned `stdout` from what the reader parses (empty string is fine for readers that tolerate empty output; give `mergeBase` a 40-hex line, and `fileOids` the ls-tree row shape its parser actually splits — `"100644 blob <40-hex>\t<path>"` (probed: `scripts/lib/ledger-git.ts:217-219` ignores a bare `<oid> <path>` line, so that fixture would leave the reader unparsed while the spawn-option assertion stayed green — derive every canned stdout from the reader's own parse, plan review R5 F2). **`currentBranch` needs an environment premise:** it returns `GITHUB_HEAD_REF` WITHOUT spawning when GitHub Actions variables are set (`scripts/lib/ledger-git.ts:313-316`; existing proof `tests/scripts/ledgerClaimsCheck.test.ts:1113-1118`), and the PR unit workflow sets them (`.github/workflows/unit-suite.yml:90-92`) — so its case must `vi.stubEnv("GITHUB_ACTIONS", "")` and `vi.stubEnv("GITHUB_HEAD_REF", "")` (restore via `vi.unstubAllEnvs()` in `afterEach`) before asserting the recorded spawn call, else `calls[0]` is empty in CI while green locally. Premise note per anti-tautology rule: each case's failure mode is "constant changed at source"; the expected literal lives in the test, so a 30001 mutant diverges.

- [ ] **Step 2: Run to verify it fails.**
Run: `pnpm vitest run tests/scripts/ledgerGitSpawnSeam.test.ts`
Expected: FAIL — `realGitSurface` ignores the argument; recording fake never called (calls[0] undefined).

- [ ] **Step 3: Implement the seam.** In `scripts/lib/ledger-git.ts`: change the export to

```ts
export function realGitSurface(opts?: { spawn?: typeof spawnSync }): GitSurface {
  const spawn = opts?.spawn ?? spawnSync;
  // The module-scoped `git(args, timeout)` helper (scripts/lib/ledger-git.ts:64)
  // cannot see this local binding (probed: TS2304 if left at module scope), so
  // MOVE it inside realGitSurface as a closure over `spawn`:
  const git = (args: string[], timeout: number): string => {
    const r = spawn("git", args, {
      cwd: gitRoot(),
      encoding: "utf8",
      timeout,
      maxBuffer: MAX_GIT_STDOUT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    // ...existing error/status handling body moves verbatim...
    return r.stdout ?? "";
  };
  // every other internal `spawnSync(` call site becomes `spawn(`
  return { /* readers unchanged, now closing over spawn + git */ };
}
```

Keep the literal `import { spawnSync } from "node:child_process"` (anti-vacuity guard `tests/scripts/ledgerFields.test.ts:166` requires it). Add `maxBuffer: MAX_GIT_STDOUT` to the `localRefs` and `prList` spawn options.

- [ ] **Step 4: Re-run the SAME declared command to verify green.**
Run: `pnpm vitest run tests/scripts/ledgerGitSpawnSeam.test.ts`
Expected: PASS. Then, additional coverage (not the marker command): `pnpm vitest run tests/scripts/ledgerClaimsCheck.test.ts tests/scripts/ledgerFields.test.ts` — PASS (real-git suites unaffected; default path unchanged).

- [ ] **Step 5: Commit.**

```bash
git add scripts/lib/ledger-git.ts tests/scripts/ledgerGitSpawnSeam.test.ts
git commit -m "test(infra): injectable spawn seam pins ledger-git timeout and maxBuffer constants"
```

### Task 3: Entry B — prList fault semantics + exit-2 promotion

**Files:**
- Modify: `scripts/lib/ledger-git.ts` (prList body, lines ~139-170)
- Modify: `scripts/lib/ledger-claims-core.ts` (~line 201)
- Modify: `scripts/lib/ledger-check.ts` (degraded loop, lines ~255-259)
- Modify: `tests/scripts/ledgerClaimsCheck.test.ts` (gh-fault cases, lines ~1150-1182)
- Test: extend tests/scripts/ledgerGitSpawnSeam.test.ts

**Interfaces:** Produces: prList throw contract (spec §3.4); degraded marker prefix `pr-universe-unavailable`; `runCheck` exit-2 on PR-universe faults. Consumes: Task 2 seam for fault injection.

<!-- task: red=`pnpm vitest run tests/scripts/ledgerGitSpawnSeam.test.ts tests/scripts/ledgerClaimsCheck.test.ts` ac=AC-9,AC-10 -->

- [ ] **Step 1: Write failing fault cases** in ledgerGitSpawnSeam.test.ts. RED validity: today `scripts/lib/ledger-git.ts:154` returns `[]` for every one of these (never reads `r.error`; coerces fields), so each `toThrow` fails.

```ts
function faultSpawn(result: Partial<ReturnType<typeof spawnSync>>) {
  return ((..._a: unknown[]) => ({
    status: 0, stdout: "", stderr: "", error: undefined, signal: null, ...result,
  })) as unknown as typeof spawnSync;
}

describe("prList fault + malformed-output contract (spec §3.4)", () => {
  const cases: Array<[string, Partial<ReturnType<typeof spawnSync>>]> = [
    ["spawn error object", { error: Object.assign(new Error("ENOBUFS"), { code: "ENOBUFS" }), status: null }],
    ["non-zero exit", { status: 1, stdout: "[]" }],
    ["empty stdout", { status: 0, stdout: "" }],
    ["invalid JSON", { status: 0, stdout: "not-json" }],
    ["non-array JSON", { status: 0, stdout: "{}" }],
    ["row missing number", { status: 0, stdout: JSON.stringify([{ headRefName: "b", isCrossRepository: false }]) }],
    ["row non-numeric number", { status: 0, stdout: JSON.stringify([{ number: "7", headRefName: "b", isCrossRepository: false }]) }],
    ["row missing headRefName", { status: 0, stdout: JSON.stringify([{ number: 7, isCrossRepository: false }]) }],
    ["row empty headRefName", { status: 0, stdout: JSON.stringify([{ number: 7, headRefName: "", isCrossRepository: false }]) }],
    ["row non-string headRefName", { status: 0, stdout: JSON.stringify([{ number: 7, headRefName: 42, isCrossRepository: false }]) }],
    ["row missing isCrossRepository", { status: 0, stdout: JSON.stringify([{ number: 7, headRefName: "b" }]) }],
    ["row non-boolean isCrossRepository", { status: 0, stdout: JSON.stringify([{ number: 7, headRefName: "b", isCrossRepository: "no" }]) }],
    ["owner with non-string login", { status: 0, stdout: JSON.stringify([{ number: 7, headRefName: "b", isCrossRepository: false, headRepositoryOwner: { login: 9 } }]) }],
    ["owner as string", { status: 0, stdout: JSON.stringify([{ number: 7, headRefName: "b", isCrossRepository: false, headRepositoryOwner: "owner" }]) }],
    ["owner as number", { status: 0, stdout: JSON.stringify([{ number: 7, headRefName: "b", isCrossRepository: false, headRepositoryOwner: 7 }]) }],
    ["owner as boolean", { status: 0, stdout: JSON.stringify([{ number: 7, headRefName: "b", isCrossRepository: false, headRepositoryOwner: true }]) }],
    ["owner as array", { status: 0, stdout: JSON.stringify([{ number: 7, headRefName: "b", isCrossRepository: false, headRepositoryOwner: [] }]) }],
    ["owner as empty object (login absent)", { status: 0, stdout: JSON.stringify([{ number: 7, headRefName: "b", isCrossRepository: false, headRepositoryOwner: {} }]) }],
  ];
  it.each(cases)("throws on %s", (_label, result) => {
    expect(() => realGitSurface({ spawn: faultSpawn(result) }).prList()).toThrow();
  });
  it("returns rows for a clean well-formed payload, and [] for a clean empty one", () => {
    const good = JSON.stringify([{ number: 7, headRefName: "b", headRepositoryOwner: { login: "x" }, isCrossRepository: false }]);
    expect(realGitSurface({ spawn: faultSpawn({ status: 0, stdout: good }) }).prList()).toHaveLength(1);
    expect(realGitSurface({ spawn: faultSpawn({ status: 0, stdout: "[]" }) }).prList()).toEqual([]);
  });
});
```

(Derivation, not enumeration: the case list is one missing + one wrong-type row per consumed `PrRow` field — `number`, `headRefName`, `isCrossRepository`, `headRepositoryOwner` — so a field added to `PrRow` without matrix rows is visible in review as a missing pair.)

- [ ] **Step 2: Run the DECLARED marker command to verify it fails.**
Run: `pnpm vitest run tests/scripts/ledgerGitSpawnSeam.test.ts tests/scripts/ledgerClaimsCheck.test.ts`
Expected: FAIL — every `toThrow` case returns `[]` or a coerced row instead (the seam suite's failures make the two-suite command exit non-zero).

- [ ] **Step 3: Implement prList validation** (replace the body from the `spawnSync` call's result handling down):

```ts
      if (r.error) throw r.error;
      if (r.status !== 0)
        throw new Error(`gh pr list failed: ${(r.stderr ?? "").trim()}`);
      if (!r.stdout) throw new Error("gh pr list: empty stdout on exit 0");
      let parsed: unknown;
      try {
        parsed = JSON.parse(r.stdout);
      } catch {
        throw new Error("gh pr list: invalid JSON on exit 0");
      }
      if (!Array.isArray(parsed)) throw new Error("gh pr list: non-array payload");
      return parsed.map((x, i) => {
        const row = x as Record<string, unknown>;
        const number = row.number;
        const headRefName = row.headRefName;
        const isCrossRepository = row.isCrossRepository;
        const owner = row.headRepositoryOwner;
        if (typeof number !== "number") throw new Error(`gh pr list row ${i}: number is not numeric`);
        if (typeof headRefName !== "string" || headRefName === "")
          throw new Error(`gh pr list row ${i}: headRefName is not a non-empty string`);
        if (typeof isCrossRepository !== "boolean")
          throw new Error(`gh pr list row ${i}: isCrossRepository is not boolean`);
        let login: string | null = null;
        if (owner !== undefined && owner !== null) {
          // Spec shape: absent, null, or an OBJECT whose login is a string.
          // Probed escapes this must reject: "owner", 7, true, [], {} (each was
          // silently coerced to null by the old ?? null; plan review R1 F2).
          if (typeof owner !== "object" || Array.isArray(owner))
            throw new Error(`gh pr list row ${i}: headRepositoryOwner is not an object`);
          const l = (owner as Record<string, unknown>).login;
          if (typeof l !== "string")
            throw new Error(`gh pr list row ${i}: headRepositoryOwner.login is not a string`);
          login = l;
        }
        return { number, headRefName, headRepositoryOwner: login, isCrossRepository };
      });
```

- [ ] **Step 4: Degraded marker + promotion.** In `scripts/lib/ledger-claims-core.ts` wrap the call at ~line 201:

```ts
  let prRows: PrRow[] = [];
  if (!declaredOnly) {
    try {
      prRows = git.prList();
    } catch (e) {
      degraded.push(`pr-universe-unavailable: ${(e as Error).message}`);
    }
  }
  for (const row of prRows) {
```

In `scripts/lib/ledger-check.ts` degraded loop (~line 256):

```ts
      if (d.startsWith("fetch-failed") || d.startsWith("pr-universe-unavailable")) {
```

- [ ] **Step 5: Update the ONE existing gh-fault case** in `tests/scripts/ledgerClaimsCheck.test.ts` — line ~1170, "discards a failed gh's output even when it printed well-formed JSON" — to assert `toThrow` instead of `[]` (its intent, a failed gh's payload never becomes a PR universe, is preserved; only the signal changes). The line-1150 case ("parses gh's rows, keeping the fork flag") is a SUCCESS-path case and stays as-is. Add a `runCheck`-level case injecting a `GitSurface` whose `prList` throws and asserting the JSON envelope's `code` is `2` and `reasons` contains a `pr-universe-unavailable` entry (mirror the existing degraded-universe describe at line 272 for envelope access).

- [ ] **Step 6: Re-run the SAME declared command to verify green.**
Run: `pnpm vitest run tests/scripts/ledgerGitSpawnSeam.test.ts tests/scripts/ledgerClaimsCheck.test.ts`
Expected: PASS. Then, additional coverage (not the marker command): `pnpm vitest run tests/scripts/ledgerFields.test.ts tests/docs/_metaLedgerClaimCollision.test.ts` — PASS.

- [ ] **Step 7: Commit.**

```bash
git add scripts/lib/ledger-git.ts scripts/lib/ledger-claims-core.ts scripts/lib/ledger-check.ts tests/scripts/
git commit -m "fix(infra): prList faults throw and degrade the claim universe to exit 2, never silent-empty"
```

### Task 4: Entry B — mutation-ledger reconciliation

**Files:**
- Modify: `tests/mutation/source/registry.ts` (ledgerGit rows ~lines 370-476; ledgerClaimsCore rows if line-shifted)
- Modify: `tests/mutation/guardSurfaces.gate.test.ts:64`

<!-- task: red=`pnpm heavy pnpm mutation:guards` ac=AC-11 -->

- [ ] **Step 1: Register the seam suite and delete the gaps.** Add "tests/scripts/ledgerGitSpawnSeam.test.ts" to the `ledgerGit` surface's `suitePaths` (the runner executes ONLY registered suites — `tests/mutation/source/runner.ts:129` and its line 142 — so without this row the seam test kills nothing). Delete the six accepted-gap rows (siteIds `integer-literal:32:18:30000>30001`, `integer-literal:33:22:30000>30001`, `integer-literal:34:15:10000>10001`, `integer-literal:62:24:64>65`, `integer-literal:62:29:1024>1025`, `integer-literal:62:36:1024>1025`) and change the gate expectation to `ledgerGit: { equivalent: 6 }` — the reducer at `tests/mutation/guardSurfaces.gate.test.ts:124-128` OMITS absent kinds, so a zero-count key in the expected object can never match (plan review R3 F1); expectations list only the kinds whose count is non-zero. Registry reconciliation (authored AND run at plan time): current rows for `ledgerGit` = 6 equivalent + 6 accepted-gap (`rg -c 'kind: "accepted-gap"' tests/mutation/source/registry.ts` scoped to the ledgerGit block = 6); this task removes exactly the 6 accepted-gap rows and adds none.

- [ ] **Step 2: Run the harness — expect the RED first.**
Run: `pnpm heavy pnpm mutation:guards`
Expected: FAIL initially — position-encoded siteIds on remaining `equivalent` rows are stale after Task 2/3 line shifts (`reconcile` reports stale + unaccepted). Repair each row's siteId to the new line:col reported, rerun until green with all six former gap mutants KILLED and zero unaccepted survivors — do not pin a numeric score in advance: the site population changes with the seam and validation edits (probed pre-repair at 84 sites, 85 with the seam applied, before Task 3 adds more), so the number is measured, not predicted. If the seam/validation code added or removed integer literals, the mutant population changes — classify any NEW site honestly (`equivalent` only with an argument, else kill it with a test).

- [ ] **Step 3: Hand-mutant spot-check (mutate-your-own-fix).** Manually set `GH_MS = 10_001` — run the seam suite, confirm red; revert. Manually set `MAX_GIT_STDOUT = 65 * 1024 * 1024` — run, confirm red; revert. Record both in the commit message.

- [ ] **Step 4: Commit.**

```bash
git add tests/mutation/ tests/scripts/ledgerGitSpawnSeam.test.ts
# tests/scripts/ is staged because survivor triage may have added killing cases there;
# stage any other file this task's triage touched before committing.
git commit -m "test(infra): ledgerGit mutation gaps closed — accepted-gap 6->0, siteIds reconciled (hand-verified GH_MS and MAX_GIT_STDOUT mutants red)"
```

### Task 5: Entry A — shared destructive-statement recognizer + explicit self-exemption

**Files:**
- Modify: `tests/db/_destructiveFileAnalysis.ts` (export the patterns)
- Modify: `tests/db/_metaDestructiveDbTargetGuard.test.ts` (import them; explicit exemption)

**Interfaces:** Produces: `export const DESTRUCTIVE_STATEMENT_PATTERNS: readonly RegExp[]` (the current `EXECUTES_WIPE`/`ENABLES_WIPE_GATE`/`EXECUTES_PRUNE` regex SOURCES, moved verbatim) and `export const GUARD_OWN_FILES: readonly string[]` naming the two self-files with reasons. Consumed by Task 6's Rule 2.

<!-- task: red=`pnpm vitest run tests/db/_metaDestructiveDbTargetGuard.test.ts` ac=AC-5 -->

- [ ] **Step 1: Export first (mechanical, no test yet).** In `_destructiveFileAnalysis.ts`, add `export const DESTRUCTIVE_STATEMENT_PATTERNS` (the three regex literals copied verbatim from the meta-test's `EXECUTES_WIPE`/`ENABLES_WIPE_GATE`/`EXECUTES_PRUNE`) and `export const GUARD_OWN_FILES = ["tests/db/_metaDestructiveDbTargetGuard.test.ts", "tests/db/destructiveFileAnalysis.test.ts"] as const;`. This step exists so the next step's RED is a BEHAVIOR failure, not an unresolved import (a RED from an unresolved import is invalid by construction — `docs/agents/writing-plans.md:15`, flagged plan review R1 F7).

- [ ] **Step 2: Write the failing assertion.** Add to `_metaDestructiveDbTargetGuard.test.ts` a case importing both exports and asserting the meta-test's OWN pattern bindings are identity-equal (`toBe`, not `toEqual`) to the imported ones, and that the exemption decision for the two self-files is `GUARD_OWN_FILES` membership. RED validity: the imports RESOLVE (Step 1), and the assertion fails because the meta-test still declares its own regex copies at lines 58/63/71 and still exempts via the `EXEMPTION` message-text accident at line 187 — those live declarations are the production lines whose defect makes it red.

- [ ] **Step 3: Run the DECLARED marker command to verify it fails.**
Run: `pnpm vitest run tests/db/_metaDestructiveDbTargetGuard.test.ts`
Expected: FAIL — `toBe` identity mismatch (two distinct RegExp objects).

- [ ] **Step 4: Implement.** Replace the meta-test's local regex declarations with the imported constant; replace the accidental exemption with explicit `GUARD_OWN_FILES` membership BEFORE the analyzer call, commented (fixture SQL strings, not live executions). Delete the `EXEMPTION` regex if the self-files were its only match (`rg` first; prefer deletion — smaller surface).

- [ ] **Step 5: Re-run the SAME declared command to verify green.** `pnpm vitest run tests/db/_metaDestructiveDbTargetGuard.test.ts` — Expected: PASS. Then, additional coverage (not the marker command): `pnpm vitest run tests/db/destructiveFileAnalysis.test.ts` — PASS.

- [ ] **Step 5: Commit.**

```bash
git add tests/db/_destructiveFileAnalysis.ts tests/db/_metaDestructiveDbTargetGuard.test.ts
git commit -m "test(db): shared destructive-statement recognizer; guard self-exemption explicit"
```

### Task 6: Entry A — analyzer redesign (three rules, factory summary, acquisition rules deleted)

**Files:**
- Modify: `tests/db/_destructiveFileAnalysis.ts` (major rewrite of the acquisition leg)
- Modify: `tests/db/destructiveFileAnalysis.test.ts` (reason rewrites + new fixtures)

**Interfaces:** Consumes: Task 5's `DESTRUCTIVE_STATEMENT_PATTERNS`. Keeps: `analyseDestructiveFile(filePath, rawSource): DestructiveFileVerdict` signature and verdict shape.

<!-- task: red=`pnpm vitest run tests/db/destructiveFileAnalysis.test.ts` ac=AC-1,AC-2,AC-3,AC-4 -->

- [ ] **Step 1: Write the failing fixtures first.** Add to `destructiveFileAnalysis.test.ts` (same inline-template style, `IMPORT`/`PRUNE` constants at lines 26-30):

<!-- plan-fences: ignore MANGLED_TEMPLATE — the fixture sources in this block are JS TEMPLATE LITERALS whose bodies contain tagged templates (`sql`select 1``), so the inner backticks MUST be escaped for the snippet to be the code that ships. The rule's target is an escape that is a paste artifact; here it is the language. Shipped verbatim in tests/db/destructiveFileAnalysis.test.ts. -->

```ts
// (aa) detached method from an unknown identifier: spec review R1 F1 probe VERBATIM.
// Production line whose absence makes this fail today: no Rule-2 destructive-string
// anchoring exists in _destructiveFileAnalysis.ts; current analyzer returns ok:true.
it("(aa) rejects a destructive string executed through a detached method of an unknown client", () => {
  const src = `${IMPORT}
const safe = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const target = getDbClient(process.env.TEST_DATABASE_URL);
const { unsafe } = target;
await unsafe("select public.prune_sync_log()");`;
  const v = analyseDestructiveFile(P, src);
  expect(v.ok).toBe(false);
  if (!v.ok) expect(v.reason).toMatch(/destructive statement outside a checked execution/);
});

// (ab) destructuring a CHECKED client: Rule 3 containment.
it("(ab) rejects destructuring a checked client", () => {
  const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL);
const { unsafe } = sql;
await unsafe("select 1");`;
  const v = analyseDestructiveFile(P, src);
  expect(v.ok).toBe(false);
  if (!v.ok) expect(v.reason).toMatch(/checked client .* may only be used as/);
});

// (ac) stored method reference on a checked client; (ad) computed member on a
// checked client; (ae) checked client passed as a function argument; same
// Rule-3 reason class, one `it` each with the corresponding single-line variant
// (`const u = sql.unsafe;` / `sql["unsafe"]("select 1")` / `helper(sql)`).

// (ah) UNENUMERATED dynamic acquisition (spec §2.4-3): indirect require, a route
// none of the old rejection rules listed. Production line whose absence makes this
// fail today: Rule 1 does not exist; the old dynamicAcquire enumeration does not
// match Function("return require") and the analyzer returns ok:true.
it("(ah) rejects an execution on a client acquired by an unenumerated route", () => {
  const src = `${IMPORT}
const safe = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const req = Function("return require")();
const pg = req("postgres");
const sql = pg(process.env.TEST_DATABASE_URL);
sql\`select 1\`;`;
  const v = analyseDestructiveFile(P, src);
  expect(v.ok).toBe(false);
  if (!v.ok) expect(v.reason).toMatch(/unchecked execution site/);
});

// (af) factory the summary cannot classify: returns another factory's call.
it("(af) rejects a factory whose body is not a checked-connection expression", () => {
  const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const inner = () => postgres(DB_URL);
const outer = () => inner();
const sql = outer();
sql\`select 1\`;`;
  const v = analyseDestructiveFile(P, src);
  expect(v.ok).toBe(false);
  if (!v.ok) expect(v.reason).toMatch(/factory .* not .* checked/);
});

// (ag) ACCEPT: the newConn factory shape from resetValidationDataConcurrency.
it("(ag) accepts a one-level factory returning a checked connection", () => {
  const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const newConn = () => postgres(DB_URL, { max: 1 });
const a = newConn();
const b = newConn();
a\`select 1\`;
b\`select 1\`;`;
  expect(analyseDestructiveFile(P, src)).toEqual({ ok: true });
});
```

Then rewrite every existing rejection fixture's assertion to pin its NEW reason class (spec AC-1): fixtures (s),(t),(u),(v),(w),(x),(y) — the acquisition/alias family — now reject via Rule 1/Rule 2 reasons (unchecked execution / destructive string outside checked execution) instead of acquisition-rule text (probed for (s): its current reason is the driver-call-position rule this task DELETES, and its `target.unsafe(...)` execution lands in Rule 1 — plan review R3 F3); binding/shadowing fixtures (a)-(r),(z),(g) keep connection/provenance reasons. Work fixture-by-fixture: run, read the actual reason, confirm it is the intended CLASS (not an incidental one — anti-tautology), pin it.

- [ ] **Step 2: Run the DECLARED marker command to verify the new fixtures fail.**
Run: `pnpm vitest run tests/db/destructiveFileAnalysis.test.ts`
Expected: (aa)-(af) FAIL (current analyzer returns ok:true for (aa),(ab)-(ae) shapes; (af) currently passes the connection check); (ag) may PASS today — keep it as the regression pin for the factory summary.

- [ ] **Step 3: Implement the redesign** in `_destructiveFileAnalysis.ts`, structured as:

```ts
// 1. Collect (unchanged): guard provenance/shadowing; driver default-import binding.
// 2. checkedConnections: postgres(<trusted-arg>) call expressions (existing checkConnection logic).
// 3. factorySummaries: local function/arrow whose every return (or body expression)
//    is a checked-connection expression -> checked factory (non-recursive; anything
//    else -> NOT checked, and its call sites are unchecked initializers).
// 4. checkedClients: const-bound identifiers whose initializer is a checked-connection
//    expression or a checked-factory call; plus .begin callback params of checked clients.
// 5. Rule 1: every tagged-template tag and property-call receiver identifier must be
//    a checked client -> else {ok:false, reason: "unchecked execution site at line N"}.
// 6. Rule 2: every string/template literal matching DESTRUCTIVE_STATEMENT_PATTERNS
//    must sit inside a Rule-1 execution on a checked client -> else
//    "destructive statement outside a checked execution at line N".
// 7. Rule 3: any OTHER appearance of a checked client identifier (destructuring,
//    property read without call, computed member, argument position, export)
//    -> "checked client X may only be used as a template tag or method receiver (line N)".
// 8. DELETE: dynamicAcquire rules (lines 178-216), named/namespace-import rejections
//    (117-163 driver-binding variants beyond default), driver-call-position rules (227-263).
//    Correct the stale comment at 276-282 (resetValidationDataPostgrest DOES connect, :59).
//    Drop "assertSafeDestructiveTarget" from GUARD_NAMES.
```

Implementation detail for Rule 1's property-call allowance: the allowed method set is UNRESTRICTED on a checked client (any `checked.method(...)` is fine — the client is loopback-guarded); Rule 1 only rejects when the receiver/tag is NOT checked. Rule 2's "inside" test: walk up from the literal to the nearest CallExpression/TaggedTemplateExpression ancestor and test that node against Rule 1's accepted set.

- [ ] **Step 4: Re-run the SAME declared command to verify green, then the meta-guard and line-count check.**
Run: `pnpm vitest run tests/db/destructiveFileAnalysis.test.ts`
Expected: PASS. Then, additional coverage (not the marker command): `pnpm vitest run tests/db/_metaDestructiveDbTargetGuard.test.ts` — PASS — all rewritten reasons, new fixtures, and the 7 real files (the meta-guard's per-file `test.each` IS the 7-file validation; if any real file trips Rule 3, apply the spec's containment contingency: file-local refactor of that test file, NOT a Rule-3 widening).
Then: `wc -l tests/db/_destructiveFileAnalysis.ts` — RECORD the number in the commit message. The `< 420` assertion this step originally carried is retired with AC-4 (amended 2026-08-15, owner-ratified after diff review R1 finding 2): the module is 597 lines of which 412 are code, and the criterion is the deleted rules and the zeroed enumeration surface.

- [ ] **Step 5: Commit.**

```bash
git add tests/db/_destructiveFileAnalysis.ts tests/db/destructiveFileAnalysis.test.ts
# If Step 4's containment contingency forced a file-local refactor of a real
# discovered file, stage that file too (it is part of this task's change).
git commit -m "test(db): destructive-file analyzer checks execution sites; acquisition enumeration deleted (<N> lines, was 420)"
```

### Task 7: Entry A — mutation enrolment of the analyzer

**Files:**
- Modify: `tests/mutation/source/registry.ts` (new surface row)
- Modify: `tests/mutation/guardSurfaces.gate.test.ts` (expectations row)

<!-- task: red=`pnpm heavy pnpm mutation:guards` ac=AC-6 -->

- [ ] **Step 1: Add the registry row ONLY** (mirror `registry.ts:370-385`): id `destructiveFileAnalysis`, sourcePath `tests/db/_destructiveFileAnalysis.ts`, suitePaths ["tests/db/destructiveFileAnalysis.test.ts"], operators `[...OPERATOR_NAMES]`, `scoreFloor: 0.8` (concrete finite — `registry.ts:79-81` rejects otherwise; raise to measured-minus-0.05 after Step 3 if measured exceeds 0.85), control a boolean-flip on a Rule-1 rejection branch the suite provably kills. Do NOT add the gate row yet.

- [ ] **Step 2: Observe the RED.** Run: `pnpm heavy pnpm mutation:guards` — Expected: FAIL on `EXPECTED_LEDGER_KINDS` key-set inequality (`tests/mutation/guardSurfaces.gate.test.ts:85-89`): the enrolled surface has no expectations row. This is the task's declared red, unconditional.

- [ ] **Step 3: Add the gate row** `destructiveFileAnalysis: {}` (kinds appear only when a triaged row of that kind exists — the reducer omits absent kinds), rerun, and triage survivors, updating the row to the final non-zero kinds only. Triage every survivor: kill with a fixture, or ledger `equivalent`/`accepted-gap` with an argument and (for gaps) a `ref:` to a filed backlog row; update the gate row to the FINAL triaged counts. Record the final score + survivor set — these numbers go verbatim in the diff-review round-1 brief (AGENTS.md enrolment contract).

- [ ] **Step 4: Commit.**

```bash
git add tests/mutation/ tests/db/destructiveFileAnalysis.test.ts
# The fixture suite is staged because survivor triage may add killing fixtures.
git commit -m "test(db): enroll destructive-file analyzer in source-mutation registry (score <measured>)"
```

### Task 8: Entry D — origin comparator + PRODUCTION_HOST export + unit suite

**Files:**
- Modify: `scripts/lib/validation-smoke-target.ts` (export the constant)
- Modify: `tests/cross-cutting/pgCronSmokes.ts` (comparator)
- Test (create): tests/cross-cutting/pgCronSmokesUnit.test.ts

**Interfaces:** Produces: `export const PRODUCTION_HOST` (validation-smoke-target.ts); `export function assertCronDispatchOrigin(url: URL, mode: "local" | "validation", gucValue: string | null): { ok: true } | { ok: false; reason: string }` (pgCronSmokes.ts). Consumed by Task 9's census assertion and Task 10's enrolment.

<!-- task: red=`pnpm vitest run tests/cross-cutting/pgCronSmokesUnit.test.ts` ac=AC-13 -->

- [ ] **Step 1: Export + stub first (mechanical).** In `validation-smoke-target.ts` change line 12 to `export const PRODUCTION_HOST = ...` (same literal). In `pgCronSmokes.ts` add `import { PRODUCTION_HOST } from "@/scripts/lib/validation-smoke-target";` and a STUB comparator that accepts everything:

```ts
export function assertCronDispatchOrigin(
  url: URL,
  mode: "local" | "validation",
  gucValue: string | null,
): { ok: true } | { ok: false; reason: string } {
  void url; void mode; void gucValue;
  return { ok: true };
}
```

This keeps the next step's RED a behavior failure rather than an unresolved import (writing-plans RED-validity rule; plan review R1 F7).

- [ ] **Step 2: Write the failing unit suite.** RED validity: every REJECT case fails against the stub — the missing validation branches (scheme, port, host pin, GUC-origin compare, empty-GUC) are the absent production lines.

```ts
import { describe, expect, it } from "vitest";
import { assertCronDispatchOrigin, firingSmokeSql, queuedUrlsFromSmokeOutput } from "@/tests/cross-cutting/pgCronSmokes";
import { PRODUCTION_HOST } from "@/scripts/lib/validation-smoke-target";

describe("assertCronDispatchOrigin (spec §5.2-§5.3)", () => {
  const prod = `https://${PRODUCTION_HOST}/api/cron/sync`;
  it("accepts the production alias in validation mode", () => {
    expect(assertCronDispatchOrigin(new URL(prod), "validation", null).ok).toBe(true);
  });
  it("rejects http scheme in validation mode", () => {
    expect(assertCronDispatchOrigin(new URL(`http://${PRODUCTION_HOST}/x`), "validation", null).ok).toBe(false);
  });
  it("rejects a preview host in validation mode (stable alias only for cron)", () => {
    expect(assertCronDispatchOrigin(new URL(`https://fxav-crew-pages-validation-c3b-eric-weiss-projects.vercel.app/x`), "validation", null).ok).toBe(false);
  });
  it("rejects an explicit port in validation mode", () => {
    expect(assertCronDispatchOrigin(new URL(`https://${PRODUCTION_HOST}:8443/x`), "validation", null).ok).toBe(false);
  });
  it("rejects a foreign host in validation mode", () => {
    expect(assertCronDispatchOrigin(new URL("https://attacker.example.com/x"), "validation", null).ok).toBe(false);
  });
  it("local mode compares URL origins and tolerates trailing-slash/path differences", () => {
    const r = assertCronDispatchOrigin(new URL("http://host.docker.internal:3000/api/cron/sync"), "local", "http://host.docker.internal:3000/");
    expect(r.ok).toBe(true);
  });
  it("local mode rejects a scheme mismatch against the GUC", () => {
    expect(assertCronDispatchOrigin(new URL("http://host.docker.internal:3000/x"), "local", "https://host.docker.internal:3000").ok).toBe(false);
  });
  it("local mode fails loudly on an empty GUC", () => {
    expect(assertCronDispatchOrigin(new URL("http://host.docker.internal:3000/x"), "local", null).ok).toBe(false);
    expect(assertCronDispatchOrigin(new URL("http://host.docker.internal:3000/x"), "local", "").ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run the DECLARED marker command to verify it fails.**
Run: `pnpm vitest run tests/cross-cutting/pgCronSmokesUnit.test.ts`
Expected: FAIL — all six reject cases return `ok: true` from the stub.

- [ ] **Step 4: Implement the real comparator** (replacing the stub body; `PRODUCTION_HOST` is already imported from Step 1):

```ts
export function assertCronDispatchOrigin(
  url: URL,
  mode: "local" | "validation",
  gucValue: string | null,
): { ok: true } | { ok: false; reason: string } {
  if (mode === "validation") {
    if (url.protocol !== "https:") return { ok: false, reason: `scheme ${url.protocol} is not https:` };
    if (url.port !== "") return { ok: false, reason: `explicit port ${url.port}` };
    if (url.hostname !== PRODUCTION_HOST)
      return { ok: false, reason: `host ${url.hostname} is not the stable alias ${PRODUCTION_HOST}` };
    return { ok: true };
  }
  if (gucValue === null || gucValue === "") return { ok: false, reason: "app.fxav_vercel_url GUC is empty" };
  let expected: URL;
  try {
    expected = new URL(gucValue);
  } catch {
    return { ok: false, reason: `GUC value ${gucValue} is not a URL` };
  }
  if (expected.origin !== url.origin)
    return { ok: false, reason: `dispatch origin ${url.origin} != GUC origin ${expected.origin}` };
  return { ok: true };
}
```

- [ ] **Step 5: Re-run the SAME declared command to verify green.**
Run: `pnpm vitest run tests/cross-cutting/pgCronSmokesUnit.test.ts`
Expected: PASS. Then, additional coverage (not the marker command): `pnpm vitest run tests/scripts/validation-smoke-base-url.test.ts` — PASS (export change is behavior-neutral).

- [ ] **Step 6: Commit.**

```bash
git add scripts/lib/validation-smoke-target.ts tests/cross-cutting/pgCronSmokes.ts tests/cross-cutting/pgCronSmokesUnit.test.ts
git commit -m "test(infra): cron dispatch-origin comparator; PRODUCTION_HOST exported"
```

### Task 9: Entry D — census wiring + sabotage case

**Files:**
- Modify: `tests/cross-cutting/pg-cron-coverage.test.ts` (firing-smoke census, lines ~501-528)

<!-- task: red=`pnpm vitest run tests/cross-cutting/pg-cron-coverage.test.ts` ac=AC-14,AC-15 -->

- [ ] **Step 1: Stub-wire the census check, so the sabotage RED is observable.** In `pg-cron-coverage.test.ts`, add the shared function the census loop AND the sabotage case will both call — initially a stub performing NO origin check — and wire it into the census loop for every job row (GUC read over the SAME psql invocation that reads the queue: `select current_setting('app.fxav_vercel_url', true)` appended to the existing query batch; mode from the suite's existing `resolvePgCronMode` result, whose shape is `{ mode: "validation" | "local"; dbUrl: string }` — `tests/db/_validationTargetIdentity.ts:108` — so the comparator receives `resolved.mode`):

```ts
// pg-cron-coverage.test.ts: used by BOTH the census loop and the sabotage case.
// urls come from the suite's existing firing-smoke path (firingSmokeSql ->
// psql -> queuedUrlsFromSmokeOutput), exactly as the census already obtains them.
function assertJobDispatchOrigin(
  jobname: string,
  queuedUrls: string[],
  guc: string | null,
  mode: "validation" | "local",
): void {
  void jobname; void queuedUrls; void guc; void mode; // stub: no origin check yet
}
```

- [ ] **Step 2: Add the sabotage case — this is the observed RED.** Registration shape (plan review R4 F2 probed both naive forms unsound: `liveCase` inside a validation-skipped `describe` still inflates `expectedQueries` at collection — Vitest executes skipped-suite factories — and a plain `test` bypasses the suite's local-unreachable skip): gate at REGISTRATION time, mirroring the suite's own `liveDbTest` construction at `tests/cross-cutting/pg-cron-coverage.test.ts:184-185`:

```ts
const sabotageCase =
  coverageTarget !== "validation" && livePsqlReachable === "reachable" ? liveCase : undefined;
sabotageCase?.(
  "census origin assertion goes red by name on a re-baked http:// host",
  async () => { /* body below */ },
  { queries: 2 }, // declare the case's actual floor once written
);
```

On validation the case is never registered (no floor inflation); on an unreachable local stack it is never registered (no skip bypass); on a reachable local stack it runs with full live-case accounting. Body: in a rolled-back transaction, `update cron.job set command = replace(command, current_setting('app.fxav_vercel_url', true), 'http://evil.invalid')` for one job, re-run the firing smoke on the mutated command, and assert `assertJobDispatchOrigin(jobname, urls, guc, resolved.mode)` THROWS with the job's name and the origin mismatch in the message. Run: `pnpm vitest run tests/cross-cutting/pg-cron-coverage.test.ts` — Expected: FAIL (the stub never throws; the missing origin-check body is the absent production code). This is also the live-mismatch demonstration spec §5.3 requires.

- [ ] **Step 2b: Implement the check** inside `assertJobDispatchOrigin`:

```ts
  const parsed = new URL(queuedUrls[0] ?? "");
  const verdict = assertCronDispatchOrigin(parsed, mode, guc);
  if (!verdict.ok) throw new Error(`${jobname}: ${verdict.reason}`);
```

- [ ] **Step 3: Re-run the SAME declared command to verify green.**
Run: `pnpm vitest run tests/cross-cutting/pg-cron-coverage.test.ts`
Expected: PASS (10 existing + new cases).

- [ ] **Step 4: Commit.**

```bash
git add tests/cross-cutting/pg-cron-coverage.test.ts
git commit -m "test(infra): pg-cron census asserts dispatch origin per job; sabotage case proves the oracle"
```

### Task 10: Entry D — pgCronSmokes mutation enrolment

**Files:**
- Modify: `tests/mutation/source/registry.ts`, `tests/mutation/guardSurfaces.gate.test.ts`

<!-- task: red=`pnpm heavy pnpm mutation:guards` ac=AC-16 -->

- [ ] **Step 1: Add the registry row (gate row comes in Step 2 after the observed red):** id `pgCronSmokes`, sourcePath `tests/cross-cutting/pgCronSmokes.ts`, suitePaths ["tests/cross-cutting/pgCronSmokesUnit.test.ts"] (DB-free — the unit suite from Task 8 must import and exercise `firingSmokeSql` and `queuedUrlsFromSmokeOutput` too; add 2-3 direct cases for each if Task 8 did not), operators `[...OPERATOR_NAMES]`, `scoreFloor: 0.8` concrete (raise post-measurement as in Task 7), The gate row `pgCronSmokes: {}` (kinds listed only when non-zero after triage — the reducer omits absent kinds) is added only AFTER Step 2's observed red.

- [ ] **Step 2: Observe the RED, then complete.** Run `pnpm heavy pnpm mutation:guards` after adding ONLY the registry row — Expected: FAIL on the missing `pgCronSmokes` gate key (same mechanism as Task 7 Step 2). Then add the gate row, rerun, triage survivors, record the score for the diff-review brief.

- [ ] **Step 3: Commit.**

```bash
git add tests/mutation/ tests/cross-cutting/pgCronSmokesUnit.test.ts
# The unit suite is staged because Step 1 may add direct firingSmokeSql /
# queuedUrlsFromSmokeOutput cases and survivor triage may add killers.
git commit -m "test(infra): enroll pgCronSmokes in source-mutation registry (score <measured>)"
```

<!-- tasks: end -->

### Task 11: Docs sweep — cross-ref fix + discovery-by-connection filing

(Deliberately OUTSIDE the task-marker regions: a docs pointer edit has no executable red-to-green cycle of its own — the spec:lint command greens on Step 0's pre-existing-failure repairs regardless of the AC-17 edits, so declaring it as this task's red would be a vacuous marker (plan review R3 F2). AC-17's verification is Step 3's suite run plus diff review.)

**Files:**
- Modify: `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md:295`
- Modify: `BACKLOG.md` (new entry)

- [ ] **Step 0: Clear the pre-existing hard failures in the same file** — the red= command already exits 1 on `main` for two `CITATION_AMBIGUOUS` findings at `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md:99` and its line 141 (probed at plan time; without repairing them the red can never turn green on this command). Disambiguate each citation per the linter's message (qualify the path), verifying each against the live tree first.

- [ ] **Step 1:** Change the `(§10.4)` pointer at line 295 to `(see BACKLOG.md § BL-PG-CRON-HOST-ASSERTION — the §10.4 pointer was wrong; §10.4 is BL-CI-VITEST-EXCLUSION-COVERAGE)` and, since that entry graduates this wave (Task 12), point at `BACKLOG-archive.md`'s section instead once Task 12 lands — write the final form directly: `(resolved by docs/superpowers/specs/ci/2026-08-14-guard-completeness-wave-design.md §5; the original §10.4 cross-ref was a mis-pointer)`.

- [ ] **Step 2: File the new entry** in `BACKLOG.md` (open section, guard class):

```markdown
### BL-DESTRUCTIVE-GUARD-DISCOVERY-BY-CONNECTION <SEP> discover destructive-analysis files by connection, not by SQL spelling

**Status:** OPEN · **Severity:** MEDIUM · **Class:** structural guard · **Effort:** L · **Filed:** 2026-08-14 (`chore/guard-completeness-wave`, spec §2.5)

Discovery in `tests/db/_metaDestructiveDbTargetGuard.test.ts` is spelling-sensitive (its own header records the limit): a quoted or unqualified destructive statement is never discovered, so no analysis runs. The terminating framing is to analyze every file that opens a DB connection. **Probe (2026-08-14):** `rg -l 'from "postgres"|require\("postgres"\)' tests/` <SEP> ~150 test files import the driver; ~60 never call `assertLocalDbUrl`, many through shared helpers (`tests/db/_b2Helpers.ts`, `tests/sync/_holdAwareTestkit.ts`) or legitimately targeting validation. Scope: per-file dispositions, helper-module modeling, and a validation-target accept-set the loopback-only guard deliberately lacks. Prereq: its own spec.
```

- [ ] **Step 3: Run** `pnpm spec:lint` on the edited ci-dark spec + `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts`. Expected: PASS (new entry carries no in-progress marker).

- [ ] **Step 4: Commit.**

```bash
git add docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md BACKLOG.md
git commit -m "docs: fix ci-dark host-assertion cross-ref; file discovery-by-connection with census"
```

<!-- tasks: depth=3 -->

### Task 12: Close-out — graduate A/B/D, full gates

**Files:**
- Modify: `BACKLOG.md`, `BACKLOG-archive.md`, `tests/docs/_metaDeferralLedgerGraduation.test.ts`

<!-- task: red=`pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts tests/docs/_metaLedgerInProgress.test.ts` ac=AC-18 -->

- [ ] **Step 1:** ONE commit graduates all three of A, B, D — this satisfies every commit contract at once: invariant 6's one-commit-per-task (this is Task 12's commit), and invariant 12's graduating-entry rule, because each entry's marker comes off in the SAME commit that archives that entry (they all archive in this one). For each entry: move it to `BACKLOG-archive.md` under `## <id> <SEP> <title> <SEP> CLOSED 2026-08-<dd> (chore/guard-completeness-wave, SHIPPED)`, append a disposition block recording what shipped and the premise corrections spec §7.1 names (A: 7+2 partition, three-rule redesign; B: refuted "ENOBUFS is loud"; D: dead validation GUC probe, queue-origin oracle), and add its `BACKLOG_GRADUATED` row with provenance `chore/guard-completeness-wave`. RED first: add the three graduation rows and run the DECLARED marker command — `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts tests/docs/_metaLedgerInProgress.test.ts` — observing FAIL (graduation rows without archive sections), then move the entries and re-run the SAME command to green (the in-progress guard rides in the same command at both points; it is green before and after, and the graduation half supplies the red).

- [ ] **Step 2: Full gates.**
Run: `pnpm heavy pnpm test` · `pnpm typecheck` · `pnpm exec eslint .` · `pnpm format:check` · `pnpm heavy pnpm mutation:guards`
Expected: all green. For the validation-mode census leg: `PG_CRON_COVERAGE_TARGET=validation pnpm vitest run tests/cross-cutting/pg-cron-coverage.test.ts` locally (reads `TEST_DATABASE_URL`), then real CI green on the PR including `x-audits` (AGENTS.md: real CI is a separate gate from local green).

- [ ] **Step 3:** The Step 1 commit is this task's ONLY commit:

```bash
git add BACKLOG.md BACKLOG-archive.md tests/docs/_metaDeferralLedgerGraduation.test.ts
git commit -m "docs: graduate guard-completeness entries A/B/D to archive"
```
 Step 2's gates produce no commit of their own; any repair a gate forces belongs to the task that owns the touched surface and rides a dedicated commit there.

<!-- tasks: end -->

---

## 12. Invariant-8 closeout

impeccable-gate: N/A — no UI surface

### Close-out evidence (implementation, 2026-08-15)

**Ledger.** All four entries have left the open queue. Entry C was archived at implementation start
as a documented limit (`221a52833`); entries A, B and D graduated at close-out (`004df22b7`), each
one's IN PROGRESS marker coming off in the same commit that archives it, because the in-progress
guard rejects an archived entry still declaring itself in flight. Neither ledger file contains an
`IN PROGRESS` string, so no marker reaches main. Each archived entry carries a disposition recording
what shipped AND which of its own premises this work refuted.
`BL-DESTRUCTIVE-GUARD-DISCOVERY-BY-CONNECTION` is the one new open row, filed with its census probe
(~150 test files import the driver; ~60 never call `assertLocalDbUrl`).

**Cross-model review.** Diff stage: R1 BLOCKING (2 findings), R2 BLOCKING (2 findings), R3 BLOCKING (3 findings), R4 BLOCKING (1 finding), R5 BLOCKING (1 finding), R6 BLOCKING (2 findings), R7 APPROVE (0 findings). Spec and plan stages
each converged at round 6 and are filed in `docs/review-rounds/chore/guard-completeness-wave/`.

The arc's rows are split across THREE corpus files, and the round numbers restart in each one after
the first. Both are consequences of merging `origin/main` mid-arc rather than counts to read at face
value: the corpus is keyed by `git merge-base origin/main HEAD`, which moved from `04f601134519`
to `1e503d714b6e` and then to `ecbddfa1aac4` across the two merges, and that key IS the arc identity — so the rows after the merge
belong to a new arc whose own numbering starts at 1 (precedent:
`docs/review-rounds/test/resurrect-mobile-safari-e2e`, whose second file restarts the same way).

Read end to end, the DIFF stage burned SEVEN rounds on this branch, across three keys:
`04f601134519` r1, `1e503d714b6e` r1/r2, `ecbddfa1aac4` r1/r2/r3/r4. This count is DERIVED from
the corpus on disk at close-out rather than retyped, because three successive drafts of this
section got it wrong by hand and two review rounds were spent saying so; `pnpm review:economy`
reports the same rows. The second `origin/main` merge was sequenced BEFORE the last rounds on
purpose: `mutation-harness` is path-filtered with `cancel-in-progress`, so merging afterwards
would have restarted its ~2.5h whole-gate run and left the reviewed tree different from the tree
that merges.

Every diff round found something real, but not all of it was one class. Rounds 1-3 and 6 were
the analyzer; 4 and 5 were this close-out's own accounting. The analyzer findings split further:
1-3 were all one class -- which binding does a name resolve to -- while 6 was a different class
entirely, a set and a syntax family nobody had enumerated.

**The escape class: which binding does a name resolve to.** R1 probed a discovered file into
`ok:true` on a whole-database wipe — `factoryChecked` was the one place in the analyzer answering
that question with "last declaration wins". Sweeping the class rather than the instance turned up
three shapes (shadowed factory names, reassignable `let`/`var`/`function` factory bindings, and the
`.begin` callback parameter no `const` covered), and a fourth found here rather than by the
reviewer (a factory name that is also a parameter). R2 then found a fifth the sweep had missed —
named function and class EXPRESSIONS bind their own name inside their own body — and R3 a sixth,
that only a `.begin` callback's FIRST parameter is the transaction client.

The reason the class kept yielding instances is worth recording, because it is the actual defect:
the binding rule lived in THREE copies (the shadow census, `declarationsOf`, the factory summary),
so each repair taught one walker a form the others still missed. R2's fix replaced them with one
predicate, `isNamedFunctionLike`, that all three consult. Fifteen cases across thirteen labelled
fixtures — (be) through (bq) — now pin the class, and each was verified RED against the analyzer it
was written for; the two that are regression pins rather than kills say so in their own comments.
Nine more, (br) through (bz), came out of the CI gate failure described below and pin the census
and factory-declaration legs those repairs introduced, and six more, (ca) through (cf), close diff
review R6's two escapes. Twenty-five `(b*)` fixtures and six `(c*)`; the analyzer suite is 88 cases.

R1 finding 2 was AC-4's line-count criterion, escalated with the measurement and amended by owner
ratification 2026-08-15: the criterion is the deleted rules and the zeroed enumeration surface, with
the growth recorded as a documented cost rather than reinterpreted.

Final measurement, taken at the branch tip rather than at the moment of the escalation, because it
grew further with the R2, R3 and R6 repairs: `tests/db/_destructiveFileAnalysis.ts` is 664 lines of
which 442 are CODE, against 420/262 on `origin/main`. A 35-line sibling,
`tests/db/_destructiveStatements.ts`, holds the recognizer both the analyzer and discovery import.
So the module is 1.7x its former size in code — the honest number, and larger than the 412 quoted
when the amendment was ratified.

**Mutation gate** — the four surfaces this branch changes or enrols, with the provenance of each
row named, because they do not all come from the same run:

| surface | mutants | no-ops | counted | killed | score | ledger | measured by |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `destructiveFileAnalysis` (enrolled here) | 237 | 0 | 229 | 229 | 1.00 | 8 equivalent | scoped re-run after the R6 repair, confirmed by CI whole gate `cdac23ae9` |
| `pgCronSmokes` (enrolled here) | 14 | 0 | 14 | 14 | 1.00 | none | CI whole gate, `cdac23ae9` |
| `ledgerGit` | 99 | 0 | 93 | 93 | 1.00 | 6 equivalent, accepted-gap 6 → 0 | CI whole gate, `cdac23ae9` |
| `ledgerClaimsCore` | 63 | 0 | 60 | 60 | 1.00 | 3 equivalent | CI whole gate, `cdac23ae9` |

**The whole gate ran in CI, it went RED, and that is the most useful thing in this section.**

Three consecutive local `pnpm heavy pnpm mutation:guards` runs were SIGTERMed by this machine's
harness background-task cleanup, the last at 107 minutes on its final surface (exit 143; not the
codex reaper, whose kill log ends 2026-08-04, and not memory pressure — no jetsam events). The tree
was verified clean after each, so no overlay ever reached a commit. What broke the deadlock was
noticing the whole gate already runs somewhere a local reaper cannot touch: PR #786's
`mutation-harness` job. It ran all eleven enrolled surfaces at `f9905fddf` (job 94994195632, 8761s)
and **failed** — `destructiveFileAnalysis` at score 0.9469 (214/226) with **twelve unaccepted
survivors**. `ledgerGit` and `pgCronSmokes` passed in the same run.

Every one of the twelve sat in code THIS BRANCH added — the assignment-target census from diff
review R1's class sweep (nine), `isFactoryDeclaration` (two), and the candidate walker (one). That is
why the earlier local runs, which enrolled the surface before those repairs existed, had reported a
clean sweep: new code, new mutants. The close-out had been about to claim 1.00 on a derivation whose
stated precondition — a GREEN gate — was false.

**Nine of the twelve are the interesting ones, and they are the argument for this suite's central
discipline.** They do not flip `ok`. With a census leg broken the written-to name simply becomes a
CHECKED client, and the containment rule rejects the write instead of Rule 1 rejecting the execution
— so the file is refused either way and an `ok:false` fixture would pass against mutant and original
alike, proving nothing. They differ only in the REASON. Because every rejection fixture here pins a
reason CLASS rather than `ok:false` (the rule this file's own header sets out), all nine are
killable. Fixtures (br)-(bz) kill eleven of the twelve; the twelfth is genuinely equivalent and is
ledgered with its argument.

Dispositions were decided by probe, not by reading the AST: `generateMutants` produced each mutant
from the gate's own operator set, and both analyzers were run over thirteen candidate inputs with
verdict AND reason compared. The probe carried its own baseline — the same `.begin` shape with no
write, which must ACCEPT — because without it every census candidate would have been rejected for a
reason unrelated to the census and the whole exercise would have measured nothing.

Cost of the whole gate here, for whoever schedules the next one: 783 mutants across 11 surfaces,
about 100 minutes locally, of which `ledgerGit` alone is ~33 because each of its mutants runs the
real-git claims suite.

The `destructiveFileAnalysis` row is TRANSCRIBED from the post-repair run, not derived — its
verbatim output is `score={"killed":229,"countedSurvivors":0,"excluded":8,"denominator":229,
"value":1} passed=true`, over 237 mutants in 393s with `baselineGreen=true`, and the eight
reported survivors are exactly the eight ledgered `equivalent` rows. The other THREE rows are
derived, from their pass in the CI whole-gate run, and the derivation is exact: zero unaccepted
survivors is a gate CONDITION and none of them carries an accepted-gap row, so every surviving
mutant is a ledgered `equivalent` and killed = mutants − equivalent. Mutant and no-op counts come from
the gate's own `generateMutants`. Zero no-ops matters on its own — it rules out the vacuity mode
where a run generates nothing and reports a perfect score over an empty set. `baselineGreen`
matters for the same reason from the other direction: a red baseline would kill every mutant and
report a perfect score having tested nothing.

The distinction is not pedantry. A derivation is only as good as its precondition, and this
close-out spent a day carrying a derived 1.00 for this very surface whose precondition — a green
gate — turned out to be false. Where a real run exists, its numbers are quoted.

Separately, and more directly than a score: the ledger rows were verified INDIVIDUALLY as
still-surviving, by driving the gate's own `generateMutants` + `runSuite` path over only the
ledgered sites with a clean-baseline check first. A row that had become killable would report as
stale; none did.

The count there is 17 across FOUR surfaces, and diff review R4 was right that an earlier draft of
this section said 16 across three. Both halves of that were wrong. The sixteen was correct only
before the eighth `destructiveFileAnalysis` row existed, and `ledgerClaimsCore` — changed by this
branch at `scripts/lib/ledger-claims-core.ts` and enrolled with 3 rows — was missing from the table
altogether. Sixteen of the seventeen were verified by that per-row driver; the seventeenth is the
new `destructiveFileAnalysis` row, confirmed instead by the post-repair run, which reported exactly
the eight ledgered sites as its survivor set.

The analyzer's first enrolment run scored 0.82 with 35 unaccepted survivors on a fully
green suite: 26 were real gaps now killed by fixtures, one was dead code the gate proved
dead and which was deleted rather than blessed, and seven were reachability arguments
recorded with their reasons in the registry. The eighth such argument arrived at the end, from
the CI failure above.

**Gates**, with provenance stated because the two are not interchangeable. Run LOCALLY at the tip:
`typecheck`, `eslint` (0 errors), `format:check`, and the scoped suites for every touched surface.
The FULL suite was verified in CI, not locally — the local run was deliberately cancelled to free a
heavy-semaphore slot for the mutation gate, and re-running it would have duplicated what CI already
executes. All twelve required contexts were green at `f9905fddf`, including `unit-suite` and all
eight `unit-suite-db` shards, plus `pg-cron-validation-parity`, and are re-verified on the final head
before the merge.

**AC-6 is satisfied by a whole-gate run, deliberately, and not by the scoped one.** `mutation-harness`
is not one of the twelve required contexts, so it cannot block a merge — but the acceptance criterion
asks for `pnpm mutation:guards` GREEN, and the difference between that and a scoped stand-in is the
twelve survivors above. It was therefore treated as a merge gate for this arc by choice, and the
merge waited on it: the whole-gate run over all eleven enrolled surfaces at `cdac23ae9` reports
**success**.

That SHA is named rather than "the tip" for a reason worth stating. `cdac23ae9` is the last commit
on this branch that changes any SOURCE — it is the R6 repair itself — and everything after it edits
this plan, the spec, the ledger and the review-round corpus only. The mutation gate reads source, so its verdict at `cdac23ae9` is the verdict for the
merged tree, and re-running it on a documentation commit would have restarted a ~2.5h job to
re-measure bytes that did not move.

The validation-mode pg-cron leg was additionally exercised locally against the live validation
project: all nine canonical jobs are baked with the stable production alias, https, no explicit
port. `app-e2e` failed once on a single mobile-safari `/admin` assertion and passed on re-run — the
commit under it changed only markdown and one docs test, and desktop-chromium passed the same spec
in the same run, so it was flake and is recorded as such rather than waved through.

## Review-round economy note

Spec stage consumed 6 counted rounds (filing: `docs/review-rounds/chore/guard-completeness-wave/04f601134519.md`). Plan-stage and diff-stage briefs inherit the same consequence bound, threat-model fence, and do-not-relitigate set from the spec §1.1, plus: the prList row-validation matrix is DERIVED (one missing + one wrong-type case per consumed field) — a proposal to extend it is admissible only with a NEW consumed field or a probed escape.
