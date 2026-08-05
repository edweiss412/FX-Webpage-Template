# Review Round Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the adversarial-review round corpus durable and committed, and oblige an arc that burns four counted rounds in one review stage to file a short retrospective naming what could have been caught mechanically instead.

**Architecture:** `scripts/codex-guard.mjs` gains two required flags (`--stage`, `--round`) and appends one JSONL row per dispatch, at **both** result.json write sites, into a committed per-arc corpus at docs/review-rounds/<branch>/<baseSha12>.jsonl. A disk-discovered meta-test (tests/docs/_metaReviewRoundEconomy.test.ts) gates merges on obliged arcs having filed. `pnpm review:economy` reports across arcs, read-only, gating nothing. Row-writing logic lives in a new `lib/reviewRounds/` module so it is unit-testable independently of the wrapper.

**Tech Stack:** Node ESM (`scripts/codex-guard.mjs` is `.mjs`, no TypeScript), TypeScript + Vitest for the library, gate, and report; `tsx` for the report CLI; `mdast` via the existing `tests/docs/_ledgerMdast.ts` for ledger id resolution.

**Spec:** `docs/superpowers/specs/ci/2026-08-04-review-round-economy.md` — canonical. Probes: `docs/superpowers/specs/ci/probes/2026-08-04-finding-format-probe.md`, `docs/superpowers/specs/ci/probes/2026-08-04-mergebase-stability-probe.md`.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec.

- **`ROUND_THRESHOLD = 4`** (spec §4.3). Counted per `(arc, stage)`. This is the single canonical definition — every module that reasons about the threshold imports the exported constant. The only places a bare `4` may appear are test fixtures that must state a concrete count.
- **Arc identity is `(branch, baseSha)`** (spec §5.2), where `branch` is `git rev-parse --abbrev-ref HEAD` and `baseSha` is the **first 12 characters** of `git merge-base origin/main HEAD`. Never derived from `--out` path naming. Every join in the gate and the report is on this pair, never on branch alone.
- **Corpus path:** docs/review-rounds/<branch>/<baseSha12>.jsonl, filing sibling docs/review-rounds/<branch>/<baseSha12>.md. `<branch>` is used **as a nested path**, not slugged: `feat/foo` → `docs/review-rounds/feat/foo/`.
- **Corpus root resolves against the git toplevel of `--cwd`** — `git -C <cwd> rev-parse --show-toplevel` — never against `--cwd` itself (spec §5.2). `--cwd` is validated only to be a directory (`scripts/codex-guard.mjs:158`).
- **`--stage` accept-set:** exactly one of `spec`, `plan`, `diff`, `task`. Closed and keyed on value. No `unknown` bucket — that would be a silent exemption. Anything outside → `usageError` (`scripts/codex-guard.mjs:43`), exit 2.
- **`--round` accept-set:** decimal integer ≥ 1. Invalid → `usageError`, exit 2.
- **Both flags are required — a hard cutover.** No dual-mode grace period (spec §5.1).
- **Counting rule is exactly two conjuncts** (spec §5.4): `status === "verdict"` **AND** `stage` in `spec`/`plan`/`diff`. **`failureReason` is NOT a conjunct** — a recovered verdict carries a real verdict alongside `failureReason: "total_timeout"` or `"attempts_exhausted"` and **counts**.
- **Threshold counts DISTINCT `round` values** among counted rows. Duplicates are legal (spec §5.5) — a parallel scoped-review wave shares one round number and counts once.
- **Rows are emitted at BOTH result.json write sites:** `writeResult` (`scripts/codex-guard.mjs:693`, write at `scripts/codex-guard.mjs:712`) and the `wrapper_error` catch (`scripts/codex-guard.mjs:1075-1093`). The second site's body omits `recoveredFrom` and `nativeBinaryResolved`, so the row writer defaults those to `null` rather than reading undefined keys.
- **The gate checks presence and id-resolution only** (spec §7.2). Never prose quality, never whether a classification is correct, never free-text finding shapes.
- **Threat model is an arc that FORGETS, not one that HIDES** (spec §8.1). Bypassing the wrapper, deleting rows before commit, and hand-editing the corpus are out of scope by declaration.
- **Consequence bound** (spec §8.2): every arc is correctly obliged, correctly exempt, or loudly refuses to record. Never silently wrong. Over-obligation costs one `**Mechanizable:** none` line and is a documented limit.
- **`findingCount` is never inferred from prose shape** (spec §3, §5.3). Integer when the reviewer emitted a declared `FINDINGS: <n>` line; `null` otherwise. `null` never folds into zero.
- **The adoption boundary is a DECLARED ISO-8601 value** (spec §9), never computed at report time from the corpus. A boundary derived from the corpus is silently wrong twice: it files any arc merging between the wrapper shipping and the first row landing as pre-adoption, and on an empty corpus it is `null`, so every silent arc is undiscoverable in precisely the state where the list matters most. The observed earliest `startedAt` survives only as an advisory mismatch line.
- **The boundary is READ FROM GIT, not hand-set, because no commit in this PR can hold the right value.** Any literal written before the merge is earlier than the merge, and early is the unsafe direction: it accuses arcs that merged before the contract was live of being silent, which the report prints as fact. Too late only excludes a few covered arcs (documented limit 7, conservative). `adoptionBoundary(repoRoot)` therefore returns the committer date of the **first-parent commit on main that added lib/reviewRounds/constants.ts** — the merge commit of this PR, whose date IS the moment recording began. Correct by construction, checkable, and needing no follow-up commit. `null` (not yet on main) renders as "not yet adopted" and **withholds** the silent list, never treating an unset boundary as the epoch. The git query names `main` explicitly: a ref-less `git log` walks HEAD, and on the branch that adds the constants module HEAD's first-parent history contains that addition, so the boundary would come back earlier than the merge — the exact too-early failure this bullet exists to prevent.
- **Post-adoption is STRICTLY LATER than the boundary; equality is pre-adoption.** The boundary is the committer date of this PR's merge, so this arc's own `mergedAt` equals it exactly, and this arc has no corpus by ratified design (spec §12). Under a strictly-less test that equality lands in the post-adoption branch and the report names the adoption merge itself as silent — the system's first output accusing the merge that created it. The contract goes live **with** that merge, not before it, so the merge that establishes the boundary cannot be obliged by it.
- **The shallow-clone refusal is proven behaviorally, on a synthesized shallow clone** (spec §11.3 layer 2a), never by a skip gated on the ambient repository's depth. An implementation that omits the `--is-shallow-repository` check passes every ambient-gated layer while presenting truncated history as complete — and depth-1 is the normal CI state (`.github/workflows/unit-suite.yml:152`). A withheld silent-arc list and an empty one must be **distinguishable values**, or the assertion cannot tell a refusal from a clean scan.
- **Anti-tautology (project rule):** every expected value derives from fixture content, never from a hardcoded literal. Every new test states the concrete failure mode it catches.
- **TDD per task** (AGENTS.md invariant 1): failing test → minimal implementation → passing test → commit. Never implementation before the test.
- **Commit per task** (AGENTS.md invariant 6), conventional commits. Do not batch tasks.
- **All work in the worktree** `/Users/ericweiss/FX-worktrees/review-round-economy` (AGENTS.md invariant 11). Never the main checkout.
- **`echo >>` is banned** for appending to files (project writing-plans rule). Use `printf '\n%s\n'`.

### Ratified decisions carried from the spec — do not relitigate

Spec §1.1 rows 1–13, in full. Most load-bearing for implementation:

1. Deterministic round-count trigger, not detected finding-repetition.
2. `**Mechanizable:** none` is a legal, expected disposition.
3. `findings[]` shape extraction is deliberately **not** implemented (§3 measures the 64.8% ceiling for inferred recognition vs 99.6% declared).
4. Cross-arc filing automation is out of scope; the report gates nothing.
5. Retroactive backfill is out of scope. **This arc is invisible to its own gate, and that is correct** (spec §12).
6. `stage: "task"` rows are recorded and never counted.

### Plan-time spec resolutions

Three details the spec does not settle that implementation forces. Each is resolved conservatively (demote + surfaced warning = documented limit under §8.2), and each is recorded in the spec's documented-limits section by Task 12.

**R1 — `--cwd` is not a git repository.** Spec §11.1 names detached HEAD (exit 2) and `main` (skip with warning) but not "no repo at all". `--cwd` is validated only as a directory (`scripts/codex-guard.mjs:158`), and `tests/codexGuard/harness.ts:127` creates `cwdDir` with a bare `mkdirSync` — it is **not** a git repo. Making this exit 2 would break every existing `tests/codexGuard` test and make the wrapper unusable outside a repo.

**Resolution:** not-a-git-repo → warn on stderr, skip the row, leave exit code and result.json untouched. This differs from detached HEAD deliberately: inside a repo, a detached HEAD is a real arc whose identity cannot be determined, so silently under-recording a live review is the §8.2 failure. Outside a repo there is no arc to record.

**R2 — DEFERRED ledger ids are not `DEF-`-prefixed.** Spec §6 item 4 says "every `BL-`/`DEF-` id cited anywhere in the section resolves against the ledgers." Verified against the live tree: `DEFERRED.md` entries are bare SHOUTY tokens (`PSQL-GUARD-RECALL-RESIDUAL`, `STEP3-GALLERY-TAP-TARGETS-1`, `NEWTAB-GUARD-UNDECIDABLE-2` — DEFERRED.md:11, DEFERRED.md:45, DEFERRED.md:98), and `DEFERRED_OPTS` is `{ requirePrefix: null, levels: [3] }` (`tests/docs/_metaDeferralLedgerGraduation.test.ts:58`). The only `DEF-` token in the tree is `DEF-FLIGHT-1` in `BACKLOG.md`. The production `definedIds` helper resolves all four ledgers under `BACKLOG_OPTS` (`requirePrefix: "BL-"`), so it collects **only** `BL-` ids.

**Resolution:** the resolvable-id set is built from all four ledgers under **both** option sets — `BACKLOG_OPTS` over `BACKLOG.md`/`BACKLOG-archive.md` and `DEFERRED_OPTS` over `DEFERRED.md`/`DEFERRED-archive.md` — so a DEFERRED entry's real SHOUTY id resolves. The **citation recognizer** stays narrow: only `BL-…` and `DEF-…` tokens are treated as citations. A filing naming a bare `PSQL-GUARD-RECALL-RESIDUAL` is not recognized as a citation, so it is neither checked nor rejected. That is a conservative under-check, not silent wrongness, and files to documented limits.

**R3 — `guardVersion` is a number, not a string.** Spec §5.3's row schema shows `"guardVersion": "…"`. Live: `const GUARD_VERSION = 1` (`scripts/codex-guard.mjs:21`), a number. The row copies it verbatim, so the field is typed `number`.

### Meta-test inventory (mandatory declaration)

- **CREATES:** tests/docs/_metaReviewRoundEconomy.test.ts — disk-discovered walk of `docs/review-rounds/`, gating obliged-arc filing, corpus schema, arc-identity agreement, and cited-id resolution.
- **EXTENDS:** `tests/mutation/source/registry.ts` (`GUARD_SURFACES` at `registry.ts:120`) — enrolls `_metaReviewRoundEconomy` as a second guard surface, and `tests/mutation/guardSurfaces.gate.test.ts` (`EXPECTED_LEDGER_KINDS` at `tests/mutation/guardSurfaces.gate.test.ts:33`, control mutation at `tests/mutation/guardSurfaces.gate.test.ts:110-129`) to generalize the hardcoded `taskContract` control.
- **NOT extended, with reason:** `tests/auth/_metaInfraContract.test.ts` (no Supabase call boundary), `tests/auth/advisoryLockRpcDeadlock.test.ts` (no `pg_advisory*`), `tests/log/_metaMutationSurfaceObservability.test.ts` (no mutating HTTP route or `"use server"` action — the wrapper is a CLI and the report is read-only).

### Advisory-lock holder topology

**N/A** — this plan touches no `pg_advisory*` code path. No DB surface at all: no migration, no RPC, no table.

### CI wiring

`tests/docs/**/*.test.{ts,tsx}` is already in `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:134`), run by the `parallel` project (`vitest.config.ts:114`) in job `unit-suite-nodb` (`.github/workflows/unit-suite.yml:135`), whose aggregator `unit-suite` (`.github/workflows/unit-suite.yml:176`) is the required check. `tests/codexGuard/**` and `tests/mutation/**/*.test.ts` are likewise already covered. **No new workflow and no path-filter change.**

**One glob IS required, and omitting it is the difference between fast and slow, not between covered and dark.** `BASE_INCLUDE` is `tests/**/*.test.ts` (`vitest.projects.ts:34`), so a brand-new tests/reviewRounds/ directory is picked up by the `serial` project — which runs in `unit-suite-db`, a job that boots a database these tests never touch. Task 7 Step 5 therefore adds `"tests/reviewRounds/**/*.test.{ts,tsx}"` to `PARALLEL_TEST_GLOBS`. The new tests are pure and DB-free, which is exactly the property that glob asserts.

All new test files land under tests/reviewRounds/ and the three already-covered trees, so that single glob is the whole wiring change. The report tests deliberately do **not** go in `tests/scripts/`: that tree is mixed — `vitest.config.ts:80` records an env-bound doc-scan there — so adding it wholesale to the DB-free parallel project would be unsound.

**impeccable-gate: N/A — no UI surface.** No file under `app/`, `components/`, `app/globals.css`, `tailwind.config.*`, or `DESIGN.md` is touched.

---

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| lib/reviewRounds/constants.ts | `ROUND_THRESHOLD`, `STAGES`, `COUNTED_STAGES` — the single canonical definitions | 2 |
| lib/reviewRounds/row.ts | Row shape, `serializeRow`, `parseRow`, `appendRow` — JSONL primitives, no git | 2 |
| lib/reviewRounds/arc.ts | `resolveArc(cwd)` → `{ repoRoot, branch, baseSha }` or a typed refusal | 3 |
| lib/reviewRounds/corpus.ts | `readArcs(root)` — disk walk producing arcs with rows + filing text | 6 |
| lib/reviewRounds/count.ts | `countedRounds(rows)` — the two-conjunct rule, distinct-round counting | 6 |
| lib/reviewRounds/filing.ts | `parseFiling(md)` — sections, headings, cited ids. Structure only | 6 |
| lib/reviewRounds/mergedArcs.ts | `mergedArcs(repoRoot)` — git log → recognized/unrecognized merges | 7 |
| `scripts/codex-guard.mjs` | Flags, row emission at both write sites, `parseVerdict` widening | 1, 4, 5, 9 |
| scripts/review-economy.ts | Read-only cross-arc report CLI | 8 |
| tests/docs/_metaReviewRoundEconomy.test.ts | The merge gate | 6 |
| `tests/reviewRounds/*.test.ts` | Unit tests for the `lib/reviewRounds/` modules | 2, 3, 6, 7 |
| tests/codexGuard/reviewRounds.test.ts | Wrapper-level row-emission tests | 1, 4, 5 |
| tests/reviewRounds/report.test.ts | Report producer + aggregation tests | 7, 8 |

`lib/reviewRounds/` is a new directory following the existing `lib/<domain>/` convention (`lib/email/`, `lib/audit/`, `lib/observe/`). Splitting by responsibility rather than layer: the JSONL primitives have no git dependency and are testable without a repo; the git-dependent arc resolution is its own unit; the gate's reading logic is separate from the gate's assertions so the report can reuse it.

---

### Task 1: `--stage` and `--round` flags

**Files:**
- Modify: `scripts/codex-guard.mjs:71-83` (the `takesValue` `Set`), `scripts/codex-guard.mjs:100-135` (`buildConfig`)
- Modify: `tests/codexGuard/harness.ts:169-206` (`runGuard` — default injection)
- Modify: `tests/codexGuard/signals.test.ts:104` (the one direct spawn), `tests/codexGuard/usage.test.ts:56` (the missing-`--brief` row)
- Create: tests/codexGuard/reviewRounds.test.ts

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `cfg.stage` (one of `"spec" | "plan" | "diff" | "task"`) and `cfg.round` (integer ≥ 1) on the config object that Tasks 3–5 read.

**Why the harness needs a default.** The flags are required at the CLI, and `runGuard` (`tests/codexGuard/harness.ts:169`) builds a fixed arg list with no stage or round. Making the flags required without touching the harness turns every existing `tests/codexGuard` test red with exit 2. `runGuard` therefore injects `--stage spec --round 1` **only when `extraArgs` supplies neither**, so existing tests keep passing and a test that wants to exercise flag validation can still pass its own (including invalid) values.

**`runGuard` is NOT the only invocation, and the other TWO must be fixed by hand.** The sweep below returns exactly two direct constructions of a wrapper arg vector outside the harness — `tests/codexGuard/signals.test.ts:104` and `tests/codexGuard/usage.test.ts:56` — and Steps 3a and 3b handle one each. Neither is optional: the first regresses loudly, the second regresses **silently**, which is worse.

`tests/codexGuard/signals.test.ts:104` spawns the wrapper directly:

```ts
    const child = spawn(
      process.execPath,
      [GUARD, "review", "--brief", run.briefPath, "--cwd", run.cwdDir, "--out", run.outDir],
```

It bypasses the harness entirely, so the default injection never reaches it. After the hard cutover it exits 2 before spawning the fixture, and its assertions expect pid files and exit 3 (`tests/codexGuard/signals.test.ts:115-129`) — the suite regresses. Step 3a below adds `"--stage", "spec", "--round", "1"` to that literal array.

`tests/codexGuard/usage.test.ts:56` is the dangerous one, because it stays **green** while its coverage disappears. Its `rawGuard` helper (`tests/codexGuard/usage.test.ts:20`) exists precisely to omit the flags the harness always supplies, and the missing-`--brief` row uses it. `--stage` is validated before `--brief` (Step 4 inserts the block at `scripts/codex-guard.mjs:130`, ahead of the `--brief` check at `scripts/codex-guard.mjs:132`), so that row starts exiting 2 on `--stage` instead — and the shared `expectUsage` helper (`tests/codexGuard/usage.test.ts:45`) asserts only exit 2 plus the generic `codex-guard:` prefix, which both failures satisfy. The test keeps passing and stops testing what its name says. Step 3b passes the flags and tightens the assertion to name `--brief`.

**Sweep before implementing, do not trust this list:** `grep -rn '"review"' tests/ scripts/ .github/` finds every construction of a wrapper arg vector, and each one either goes through `runGuard` or gets the flags inline. Ignore the unrelated hits (`"review"` is also an admin status token and a component directory) and `scripts/codex-guard.mjs:69`, which is the subcommand check itself.

- [ ] **Step 1: Write the failing tests**

Create tests/codexGuard/reviewRounds.test.ts:

```ts
import { describe, expect, it } from "vitest";

import { mkRun, runGuard, writeScenario } from "./harness";

describe("codex-guard --stage / --round validation (spec §5.1)", () => {
  // Failure caught: inference creeping back in - a wrapper that guesses the
  // stage from the brief or the --out path instead of being told.
  it("exits 2 naming --stage when it is missing", async () => {
    const run = mkRun();
    writeScenario(run, [{ onCall: 1, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] }]);
    const { code, stderr } = await runGuard(run, ["--round", "1"], {}, { injectDefaults: false });
    expect(code).toBe(2);
    expect(stderr).toContain("--stage");
  });

  // Failure caught: a required flag that silently defaults, which is the
  // "forgetting exempts the arc" hole the hard cutover exists to close.
  it("exits 2 naming --round when it is missing", async () => {
    const run = mkRun();
    writeScenario(run, [{ onCall: 1, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] }]);
    const { code, stderr } = await runGuard(run, ["--stage", "spec"], {}, { injectDefaults: false });
    expect(code).toBe(2);
    expect(stderr).toContain("--round");
  });

  // Failure caught: a silent `unknown` stage bucket - an exemption from the
  // gate wearing the costume of tolerance.
  it("exits 2 on a stage outside the accept-set, naming the value", async () => {
    const run = mkRun();
    writeScenario(run, [{ onCall: 1, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] }]);
    const { code, stderr } = await runGuard(run, ["--stage", "review", "--round", "1"]);
    expect(code).toBe(2);
    expect(stderr).toContain("--stage");
    expect(stderr).toContain("review");
  });

  it.each([["0"], ["-1"], ["1.5"], ["abc"], [""]])(
    "exits 2 on --round %j",
    async (bad) => {
      const run = mkRun();
      writeScenario(run, [{ onCall: 1, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] }]);
      const { code, stderr } = await runGuard(run, ["--stage", "spec", "--round", bad]);
      expect(code).toBe(2);
      expect(stderr).toContain("--round");
    },
  );

  it.each([["spec"], ["plan"], ["diff"], ["task"]])(
    "accepts stage %j",
    async (stage) => {
      const run = mkRun();
      writeScenario(run, [{ onCall: 1, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] }]);
      const { code } = await runGuard(run, ["--stage", stage, "--round", "2"]);
      expect(code).toBe(0);
    },
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/codexGuard/reviewRounds.test.ts`
Expected: FAIL — `runGuard` does not accept a fourth argument, and the wrapper rejects `--stage` as an unknown flag (exit 2 for the wrong reason, so the accept-set and `--round` cases fail on the assertion text).

- [ ] **Step 3: Extend the harness with opt-out default injection**

In `tests/codexGuard/harness.ts`, change `runGuard`'s signature and arg construction:

```ts
export function runGuard(
  run: Run,
  extraArgs: string[] = [],
  envOverrides: Record<string, string> = {},
  opts: { injectDefaults?: boolean } = {},
): Promise<GuardExit> {
  // The review-round flags are REQUIRED at the CLI (spec §5.1, hard cutover).
  // Every pre-existing scenario test predates them, so the harness supplies a
  // default pair unless the caller already passed one - a test exercising flag
  // validation opts out with { injectDefaults: false } or passes its own value.
  const inject = opts.injectDefaults ?? true;
  const defaults = inject
    ? [
        ...(extraArgs.includes("--stage") ? [] : ["--stage", "spec"]),
        ...(extraArgs.includes("--round") ? [] : ["--round", "1"]),
      ]
    : [];
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [
        GUARD,
        "review",
        "--brief",
        run.briefPath,
        "--cwd",
        run.cwdDir,
        "--out",
        run.outDir,
        ...defaults,
        ...extraArgs,
      ],
      // ... rest unchanged
```

- [ ] **Step 3a: Fix the one invocation that bypasses the harness**

In `tests/codexGuard/signals.test.ts:104`, extend the literal arg array:

```ts
      [GUARD, "review", "--brief", run.briefPath, "--cwd", run.cwdDir, "--out", run.outDir,
       "--stage", "spec", "--round", "1"],
```

- [ ] **Step 3b: Stop the second invocation from degrading silently**

Read `tests/codexGuard/usage.test.ts` first and match its real helper signatures: `rawGuard(run: Run, argv: string[], envOverrides?: Record<string, string>)` (`tests/codexGuard/usage.test.ts:20`) takes the WHOLE argv including the `"review"` subcommand, and `expectUsage(res: GuardExit, run: Run)` (`tests/codexGuard/usage.test.ts:45`) asserts exit 2, a `codex-guard:` prefix, and no result.json in the out dir. Replace the missing-`--brief` case with:

```ts
  it("missing --brief", async () => {
    const run = mkRun();
    // The review-round flags are validated BEFORE --brief, so a row that omits
    // them exits 2 on --stage instead. expectUsage cannot tell the two apart -
    // it asserts exit 2 and the generic `codex-guard:` prefix, which both
    // satisfy - so this case would keep passing while testing nothing.
    const res = await rawGuard(run, [
      "review",
      "--cwd",
      run.cwdDir,
      "--out",
      run.outDir,
      "--stage",
      "spec",
      "--round",
      "1",
    ]);
    expectUsage(res, run);
    // Failure caught: exiting 2 for the wrong reason. Naming the flag is what
    // makes the assertion specific to the case the test is named for.
    expect(res.stderr).toContain("--brief");
  });
```

Then run the sweep and confirm it returns no THIRD bare construction:

```bash
grep -rn '"review"' tests/ scripts/ .github/ | grep -v 'runGuard\|reviewRounds\|review-economy'
```

- [ ] **Step 4: Add the flags to the wrapper**

In `scripts/codex-guard.mjs`, add both to the `takesValue` `Set` (`scripts/codex-guard.mjs:71-83`), after `"--label"`:

```js
    "--label",
    "--stage",
    "--round",
```

Then in `buildConfig`, immediately after the `--label` validation at `scripts/codex-guard.mjs:130` and before the `--brief` check at `scripts/codex-guard.mjs:132`:

```js
  // §5.1 - closed accept-set, keyed on value, never coerced. An `unknown`
  // bucket would be a silent exemption from the filing gate, which is exactly
  // the failure this design refuses. `task` is recorded and never counted.
  const STAGES = new Set(["spec", "plan", "diff", "task"]);
  if (flags.stage === undefined) usageError("--stage is required (spec|plan|diff|task)");
  if (!STAGES.has(flags.stage))
    usageError(`--stage must be one of spec|plan|diff|task: ${flags.stage}`);
  cfg.stage = flags.stage;
  if (flags.round === undefined) usageError("--round is required (integer >= 1)");
  cfg.round = num("--round", flags.round, { integer: true });
```

`num` (`scripts/codex-guard.mjs:54`) rejects non-finite values, values `<= 0`, and — with `integer: true` — non-integers, which is exactly "decimal integer ≥ 1". It calls `usageError` itself, so exit 2 and the flag name in stderr come for free.

- [ ] **Step 5: Run the new tests to verify they pass**

Run: `pnpm exec vitest run tests/codexGuard/reviewRounds.test.ts`
Expected: PASS (9 cases).

- [ ] **Step 6: Run the whole codex-guard suite for regressions**

Run: `pnpm exec vitest run tests/codexGuard/`
Expected: PASS — the harness default keeps every pre-existing scenario green. A red run here means the default injection is not reaching a call site.

- [ ] **Step 7: Commit**

```bash
git add scripts/codex-guard.mjs tests/codexGuard/harness.ts tests/codexGuard/reviewRounds.test.ts \
        tests/codexGuard/signals.test.ts tests/codexGuard/usage.test.ts
git commit -m "feat(review-rounds): codex-guard requires --stage and --round"
```

---

### Task 2: JSONL row primitives

**Files:**
- Create: lib/reviewRounds/constants.ts, lib/reviewRounds/row.ts
- Create: tests/reviewRounds/row.test.ts

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ROUND_THRESHOLD: 4`, `STAGES: readonly ["spec","plan","diff","task"]`, `COUNTED_STAGES: readonly ["spec","plan","diff"]`, `type Stage`
  - `type ReviewRoundRow` (all scalar fields, spec §5.3)
  - `serializeRow(row: ReviewRoundRow): string` — one line, trailing `\n`
  - `parseRow(line: string): { ok: true; row: ReviewRoundRow } | { ok: false; problem: string }`
  - `appendRow(file: string, row: ReviewRoundRow): { ok: true } | { ok: false; problem: string }`

No JSONL utility exists in the repo today (verified: `grep -rl 'jsonl\|JSONL' lib/` returns nothing). This is new.

- [ ] **Step 1: Write the failing test**

Create tests/reviewRounds/row.test.ts:

```ts
import { mkdtempSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ROUND_THRESHOLD, STAGES, COUNTED_STAGES } from "../../lib/reviewRounds/constants";
import { appendRow, parseRow, serializeRow, type ReviewRoundRow } from "../../lib/reviewRounds/row";

const ROW: ReviewRoundRow = {
  stage: "diff",
  round: 3,
  branch: "feat/foo",
  baseSha: "20fccb1f3a0c",
  label: "guard-scope",
  status: "verdict",
  verdict: "BLOCKING",
  failureReason: null,
  findingCount: 5,
  startedAt: "2026-08-04T14:02:11.000Z",
  endedAt: "2026-08-04T14:19:40.000Z",
  briefPath: ".review/foo-r3/brief.md",
  outDir: ".review/foo-r3",
  guardVersion: 1,
  recoveredFrom: null,
};

describe("review-round constants (spec §4.3)", () => {
  it("pins the canonical threshold and the counted-stage subset", () => {
    expect(ROUND_THRESHOLD).toBe(4);
    expect([...STAGES]).toEqual(["spec", "plan", "diff", "task"]);
    // Failure caught: `task` leaking into the counted set, which would let four
    // non-review dispatches manufacture a filing obligation out of nothing.
    expect([...COUNTED_STAGES]).toEqual(["spec", "plan", "diff"]);
    expect(COUNTED_STAGES).not.toContain("task");
  });
});

describe("row serialization (spec §5.3)", () => {
  it("round-trips every field through one newline-terminated line", () => {
    const line = serializeRow(ROW);
    expect(line.endsWith("\n")).toBe(true);
    expect(line.trimEnd()).not.toContain("\n");
    const parsed = parseRow(line);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.row).toEqual(ROW);
  });

  // Failure caught: a row that grows unbounded. Spec §5.3 - all scalars, no
  // array field, no free-text field, so a row is bounded by construction.
  it("holds no array or object field", () => {
    for (const [key, value] of Object.entries(ROW)) {
      expect(Array.isArray(value), `${key} is an array`).toBe(false);
      expect(typeof value === "object" && value !== null, `${key} is an object`).toBe(false);
    }
  });

  // Failure caught: a malformed row swallowed as an empty corpus, which reads
  // as "this arc ran no rounds" - an obliged arc reported compliant.
  it.each([
    ["not json at all", "{nope"],
    ["missing stage", JSON.stringify({ ...ROW, stage: undefined })],
    ["stage outside the accept-set", JSON.stringify({ ...ROW, stage: "review" })],
    ["round below 1", JSON.stringify({ ...ROW, round: 0 })],
    ["non-integer round", JSON.stringify({ ...ROW, round: 1.5 })],
    ["status outside the two literals", JSON.stringify({ ...ROW, status: "wrapper_error" })],
  ])("rejects %s with a problem string", (_name, line) => {
    const parsed = parseRow(line);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.problem.length).toBeGreaterThan(0);
  });

  // Failure caught: `null` findingCount rejected as malformed, which would make
  // every reviewer that omits the declared line poison its own corpus.
  it("accepts a null findingCount and a non-null failureReason together", () => {
    const recovered = { ...ROW, findingCount: null, failureReason: "attempts_exhausted" };
    const parsed = parseRow(serializeRow(recovered));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.row).toEqual(recovered);
  });
});

describe("append (spec §5.2)", () => {
  it("creates missing parent directories and appends without rewriting", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-rounds-"));
    const file = join(dir, "feat", "foo", "20fccb1f3a0c.jsonl");
    expect(appendRow(file, ROW).ok).toBe(true);
    expect(appendRow(file, { ...ROW, round: 4 }).ok).toBe(true);
    const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    // Derived from what was written, not from a literal.
    expect(lines.map((l) => (parseRow(l) as { row: ReviewRoundRow }).row.round)).toEqual([3, 4]);
  });

  // Failure caught: telemetry breaking a review. A corpus that cannot be
  // written must degrade to a reported problem, never an exception.
  it("returns a problem instead of throwing when the file is unwritable", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-rounds-ro-"));
    const file = join(dir, "locked.jsonl");
    writeFileSync(file, "");
    chmodSync(file, 0o444);
    const result = appendRow(file, ROW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem.length).toBeGreaterThan(0);
  });

  // Failure caught: a previous row without a trailing newline silently merging
  // with the next one, producing a single unparseable line. This is the
  // `echo >>` defect class the project rule names.
  it("recovers when the existing file lacks a trailing newline", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-rounds-nl-"));
    const file = join(dir, "arc.jsonl");
    writeFileSync(file, serializeRow(ROW).trimEnd());
    expect(appendRow(file, { ...ROW, round: 4 }).ok).toBe(true);
    const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => parseRow(l).ok)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/reviewRounds/row.test.ts`
Expected: FAIL — `Cannot find module '../../lib/reviewRounds/constants'`.

- [ ] **Step 3: Write the constants**

Create lib/reviewRounds/constants.ts:

```ts
import { execFileSync } from "node:child_process";

/**
 * The canonical threshold (spec §4.3). Every module that reasons about the
 * filing duty imports THIS - a literal 4 anywhere outside a fixture is a
 * second definition waiting to drift from the first.
 *
 * It matches the REVIEW_ROUND_CAP default in the per-machine dispatch hook so
 * one number governs both the dispatch block and the filing duty.
 */
export const ROUND_THRESHOLD = 4;

/** Closed accept-set, keyed on value (spec §5.1). No `unknown` bucket. */
export const STAGES = ["spec", "plan", "diff", "task"] as const;
export type Stage = (typeof STAGES)[number];

/**
 * `task` is recorded and never counted (spec §5.1). The wrapper has one
 * subcommand serving two call classes; declaring a non-review task as `diff`
 * would record a review round that never happened, and four such tasks would
 * manufacture a filing obligation out of nothing.
 */
export const COUNTED_STAGES = ["spec", "plan", "diff"] as const;

/**
 * The moment the recording contract went live (spec §9). DECLARED, and set by
 * the commit that merges this system - never derived from the corpus.
 *
 * A derived boundary (the earliest startedAt observed) is silently wrong twice.
 * The contract is live the moment the wrapper ships, but the first row lands
 * whenever the next dispatch happens to run, so an arc merging in between is
 * filed as pre-adoption despite being fully covered. And an empty corpus has no
 * earliest row, so the boundary is null, the universe is empty, and the report
 * declares no silent arcs in exactly the state where nothing is being recorded
 * at all. That failure is self-concealing: the worse the adoption, the cleaner
 * the report.
 *
 * The observed earliest row is still reported, as an ADVISORY line: a corpus
 * predating this constant means this constant is wrong, and saying so is
 * cheaper than deriving a number nothing can check.
 *
 * It is NOT a hand-set literal, and no commit inside this PR can hold the right
 * value. Any timestamp written before the merge is EARLIER than the merge, and
 * early is the unsafe direction: an arc merging between that commit and this
 * one is then reported as a post-adoption silent arc, which is a false
 * accusation the report prints as fact. A hand-set literal is also a value
 * nothing can check, and forgetting to update it is silent.
 *
 * So it is READ FROM GIT, from the one place that knows when the contract went
 * live: the first-parent commit on main that ADDED this file. That is the merge
 * commit of this PR, whose committer date IS the moment the wrapper began
 * recording. It cannot be too early or too late by construction, and it needs
 * no follow-up commit.
 *
 * The `main` ref below is LOAD-BEARING, not decoration. A ref-less `git log`
 * walks HEAD, and on the feature branch that adds this file HEAD's first-parent
 * history contains the branch-local addition - so the query returns a boundary
 * EARLIER than the merge, which is the exact "too early" failure this whole
 * design exists to prevent. Adoption is a fact about main.
 *
 * `null` - the file not yet on main - means "not yet adopted". The report says
 * so by name and WITHHOLDS the silent list, rather than treating an unset
 * boundary as the epoch and accusing all 668 pre-adoption merges at once.
 */
export function adoptionBoundary(repoRoot: string): string | null {
  try {
    const out = execFileSync(
      "git",
      [
        "log",
        "--first-parent",
        "--diff-filter=A",
        "--format=%cI",
        "main",
        "--",
        "lib/reviewRounds/constants.ts",
      ],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    // Last line: the OLDEST addition, in case the file were ever removed and
    // re-added. Adoption is when it FIRST went live, not the latest churn.
    const lines = out.split("\n").filter(Boolean);
    return lines.length > 0 ? (lines[lines.length - 1] as string) : null;
  } catch {
    return null;
  }
}
export type CountedStage = (typeof COUNTED_STAGES)[number];

export function isStage(v: unknown): v is Stage {
  return typeof v === "string" && (STAGES as readonly string[]).includes(v);
}

export function isCountedStage(v: unknown): v is CountedStage {
  return typeof v === "string" && (COUNTED_STAGES as readonly string[]).includes(v);
}
```

- [ ] **Step 4: Write the row module**

Create lib/reviewRounds/row.ts:

```ts
import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";

import { isStage, type Stage } from "./constants";

/** Spec §5.3. All scalars - no array field, no free-text field, so a row is
 *  bounded by construction rather than by truncation logic. */
export type ReviewRoundRow = {
  stage: Stage;
  round: number;
  branch: string;
  baseSha: string;
  label: string | null;
  status: "verdict" | "no_verdict";
  verdict: string | null;
  failureReason: string | null;
  findingCount: number | null;
  startedAt: string | null;
  endedAt: string | null;
  briefPath: string;
  outDir: string;
  /** `GUARD_VERSION` is a number in the wrapper (scripts/codex-guard.mjs:21). */
  guardVersion: number | null;
  recoveredFrom: string | null;
};

export type ParseResult =
  | { ok: true; row: ReviewRoundRow }
  | { ok: false; problem: string };

export function serializeRow(row: ReviewRoundRow): string {
  return JSON.stringify(row) + "\n";
}

const STRING_OR_NULL = [
  "label",
  "verdict",
  "failureReason",
  "startedAt",
  "endedAt",
  "recoveredFrom",
] as const;

export function parseRow(line: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (e) {
    return { ok: false, problem: `not valid JSON: ${(e as Error).message}` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, problem: "row is not a JSON object" };
  }
  const r = parsed as Record<string, unknown>;

  if (!isStage(r.stage)) return { ok: false, problem: `stage not in accept-set: ${String(r.stage)}` };
  if (typeof r.round !== "number" || !Number.isInteger(r.round) || r.round < 1) {
    return { ok: false, problem: `round must be an integer >= 1: ${String(r.round)}` };
  }
  if (r.status !== "verdict" && r.status !== "no_verdict") {
    return { ok: false, problem: `status must be "verdict" or "no_verdict": ${String(r.status)}` };
  }
  for (const k of ["branch", "baseSha", "briefPath", "outDir"] as const) {
    if (typeof r[k] !== "string" || r[k] === "") {
      return { ok: false, problem: `${k} must be a non-empty string` };
    }
  }
  for (const k of STRING_OR_NULL) {
    if (r[k] !== null && typeof r[k] !== "string") {
      return { ok: false, problem: `${k} must be a string or null` };
    }
  }
  // `null` means NOT DECLARED, never "none found" (spec §5.3). Folding it into
  // zero would state a false total in every report.
  if (r.findingCount !== null && (typeof r.findingCount !== "number" || !Number.isInteger(r.findingCount) || r.findingCount < 0)) {
    return { ok: false, problem: `findingCount must be a non-negative integer or null` };
  }
  if (r.guardVersion !== null && typeof r.guardVersion !== "number") {
    return { ok: false, problem: `guardVersion must be a number or null` };
  }
  return { ok: true, row: r as unknown as ReviewRoundRow };
}

export type AppendResult = { ok: true } | { ok: false; problem: string };

/**
 * Appends one row. NEVER throws: this is telemetry attached to a review that
 * has already happened, and a corpus that cannot be written must not change
 * the wrapper's exit code or lose the result.json (spec §11.1).
 */
export function appendRow(file: string, row: ReviewRoundRow): AppendResult {
  try {
    mkdirSync(dirname(file), { recursive: true });
    // A prior writer that died mid-line, or a hand-edit that stripped the final
    // newline, would otherwise merge two rows into one unparseable line.
    let prefix = "";
    try {
      if (statSync(file).size > 0) {
        const existing = readFileSync(file, "utf8");
        if (!existing.endsWith("\n")) prefix = "\n";
      }
    } catch {
      /* file does not exist yet - no prefix needed */
    }
    appendFileSync(file, prefix + serializeRow(row));
    return { ok: true };
  } catch (e) {
    return { ok: false, problem: `could not append to ${file}: ${(e as Error).message}` };
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/reviewRounds/row.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors. The repo's strict config includes `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.

- [ ] **Step 7: Commit**

```bash
git add lib/reviewRounds/constants.ts lib/reviewRounds/row.ts tests/reviewRounds/row.test.ts
git commit -m "feat(review-rounds): JSONL row primitives and canonical threshold"
```

---

### Task 3: Arc identity resolution

**Files:**
- Create: lib/reviewRounds/arc.ts
- Create: tests/reviewRounds/arc.test.ts

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `resolveArc(cwd: string): ArcResolution`, where

```ts
type ArcResolution =
  | { ok: true; repoRoot: string; branch: string; baseSha: string; corpusFile: string; filingFile: string }
  | { ok: false; kind: "not_a_repo" | "on_main" | "no_merge_base"; problem: string }
  | { ok: false; kind: "detached_head"; problem: string };
```

The caller decides what each refusal costs. Task 4 maps `detached_head` to exit 2 and everything else to a warning, per spec §11.1 and plan resolution R1.

- [ ] **Step 1: Write the failing test**

Create tests/reviewRounds/arc.test.ts:

```ts
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveArc } from "../../lib/reviewRounds/arc";

const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/** A real repo with a `main` and one commit, network-free and deterministic. */
function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "arc-repo-"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "T");
  writeFileSync(join(dir, "seed.txt"), "seed\n");
  git(dir, "add", "seed.txt");
  git(dir, "commit", "-qm", "seed");
  // `origin/main` without a network: a local remote-tracking ref.
  git(dir, "update-ref", "refs/remotes/origin/main", git(dir, "rev-parse", "HEAD"));
  return dir;
}

describe("arc identity (spec §5.2)", () => {
  it("resolves branch and 12-char merge base, and nests the branch as a path", () => {
    const dir = makeRepo();
    const base = git(dir, "rev-parse", "HEAD");
    git(dir, "checkout", "-q", "-b", "feat/foo");
    writeFileSync(join(dir, "a.txt"), "a\n");
    git(dir, "add", "a.txt");
    git(dir, "commit", "-qm", "work");

    const arc = resolveArc(dir);
    expect(arc.ok).toBe(true);
    if (!arc.ok) return;
    expect(arc.branch).toBe("feat/foo");
    // Derived from the repo, never a literal.
    expect(arc.baseSha).toBe(base.slice(0, 12));
    expect(arc.baseSha).toHaveLength(12);
    // Failure caught: slugging `/` to `-`, which collides two branches
    // differing only there.
    expect(arc.corpusFile).toBe(
      join(dir, "docs", "review-rounds", "feat", "foo", `${base.slice(0, 12)}.jsonl`),
    );
    expect(arc.filingFile).toBe(arc.corpusFile.replace(/\.jsonl$/, ".md"));
  });

  // Failure caught: a corpus written under `<repo>/app/docs/review-rounds/`
  // that the gate - walking from the repo root - never sees, so an obliged
  // arc passes. Silent wrongness, not a conservative outcome.
  it("resolves the corpus root against the git toplevel, not against --cwd", () => {
    const dir = makeRepo();
    git(dir, "checkout", "-q", "-b", "feat/sub");
    const sub = join(dir, "app", "nested");
    mkdirSync(sub, { recursive: true });

    const fromRoot = resolveArc(dir);
    const fromSub = resolveArc(sub);
    expect(fromRoot.ok && fromSub.ok).toBe(true);
    if (!fromRoot.ok || !fromSub.ok) return;
    expect(fromSub.corpusFile).toBe(fromRoot.corpusFile);
    expect(fromSub.corpusFile).not.toContain(join("app", "nested"));
  });

  // Failure caught: a later arc reusing a merged arc's branch name inheriting
  // its corpus AND its filing - the gate then reports compliance for an arc
  // that burned four rounds and filed nothing. Real: this repo has reused
  // three branch names across distinct PRs (spec §5.2).
  it("gives two arcs on one branch name distinct files when the merge base differs", () => {
    const dir = makeRepo();
    git(dir, "checkout", "-q", "-b", "feat/reused");
    const first = resolveArc(dir);

    git(dir, "checkout", "-q", "main");
    writeFileSync(join(dir, "b.txt"), "b\n");
    git(dir, "add", "b.txt");
    git(dir, "commit", "-qm", "main advances");
    git(dir, "update-ref", "refs/remotes/origin/main", git(dir, "rev-parse", "HEAD"));
    git(dir, "branch", "-qD", "feat/reused");
    git(dir, "checkout", "-q", "-b", "feat/reused");
    const second = resolveArc(dir);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.baseSha).not.toBe(first.baseSha);
    expect(second.corpusFile).not.toBe(first.corpusFile);
  });

  // Plan resolution R1: outside a repo there is no arc to record, so this is a
  // warning-and-skip, not a refusal to run. Failure caught: an exception that
  // breaks every existing tests/codexGuard run (harness.ts:127 mkdirSync).
  it("reports not_a_repo for a plain directory", () => {
    const plain = mkdtempSync(join(tmpdir(), "arc-plain-"));
    const arc = resolveArc(plain);
    expect(arc.ok).toBe(false);
    if (arc.ok) return;
    expect(arc.kind).toBe("not_a_repo");
  });

  // Failure caught: rows landing in a nonsense location. Inside a repo a
  // detached HEAD IS a live arc whose identity cannot be determined, so
  // under-recording it silently is the §8.2 failure.
  it("reports detached_head on a detached checkout", () => {
    const dir = makeRepo();
    git(dir, "checkout", "-q", "--detach");
    const arc = resolveArc(dir);
    expect(arc.ok).toBe(false);
    if (arc.ok) return;
    expect(arc.kind).toBe("detached_head");
  });

  it("reports on_main when HEAD is the trunk", () => {
    const arc = resolveArc(makeRepo());
    expect(arc.ok).toBe(false);
    if (arc.ok) return;
    expect(arc.kind).toBe("on_main");
  });

  it("reports no_merge_base when origin/main is absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "arc-noremote-"));
    git(dir, "init", "-q", "-b", "main");
    git(dir, "config", "user.email", "t@example.com");
    git(dir, "config", "user.name", "T");
    writeFileSync(join(dir, "s.txt"), "s\n");
    git(dir, "add", "s.txt");
    git(dir, "commit", "-qm", "seed");
    git(dir, "checkout", "-q", "-b", "feat/x");
    const arc = resolveArc(dir);
    expect(arc.ok).toBe(false);
    if (arc.ok) return;
    expect(arc.kind).toBe("no_merge_base");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/reviewRounds/arc.test.ts`
Expected: FAIL — `Cannot find module '../../lib/reviewRounds/arc'`.

- [ ] **Step 3: Write the arc module**

Create lib/reviewRounds/arc.ts:

```ts
import { execFileSync } from "node:child_process";
import { join } from "node:path";

export const CORPUS_DIR = join("docs", "review-rounds");

export type ArcRefusalKind = "not_a_repo" | "detached_head" | "on_main" | "no_merge_base";

export type ArcResolution =
  | {
      ok: true;
      repoRoot: string;
      branch: string;
      baseSha: string;
      corpusFile: string;
      filingFile: string;
    }
  | { ok: false; kind: ArcRefusalKind; problem: string };

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/**
 * Arc identity is `(branch, merge-base SHA)` read from git, NEVER from `--out`
 * path naming (spec §5.2). A branch name is not unique over time - this
 * repository has already reused three across distinct PRs - and keyed on
 * branch alone a later arc inherits a merged arc's corpus and its filing.
 */
export function resolveArc(cwd: string): ArcResolution {
  // Resolve against the git TOPLEVEL, not `--cwd`: the wrapper validates
  // `--cwd` only as a directory, so a dispatch handed a repo subdirectory
  // would otherwise write its corpus somewhere the gate never walks.
  const repoRoot = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (repoRoot === null) {
    return { ok: false, kind: "not_a_repo", problem: `not a git repository: ${cwd}` };
  }

  const branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch === null || branch === "" || branch === "HEAD") {
    return {
      ok: false,
      kind: "detached_head",
      problem: `HEAD is detached in ${repoRoot}; an arc has no identity without a branch`,
    };
  }
  if (branch === "main") {
    return { ok: false, kind: "on_main", problem: "HEAD is main; there is no arc to record" };
  }

  const base = git(cwd, ["merge-base", "origin/main", "HEAD"]);
  if (base === null || base.length < 12) {
    return {
      ok: false,
      kind: "no_merge_base",
      problem: `could not compute merge-base origin/main HEAD in ${repoRoot}`,
    };
  }
  const baseSha = base.slice(0, 12);

  // The branch is used AS A NESTED PATH, not slugged: flattening `/` to `-`
  // collides two branches differing only there.
  const corpusFile = join(repoRoot, CORPUS_DIR, ...branch.split("/"), `${baseSha}.jsonl`);
  return {
    ok: true,
    repoRoot,
    branch,
    baseSha,
    corpusFile,
    filingFile: corpusFile.replace(/\.jsonl$/, ".md"),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/reviewRounds/arc.test.ts`
Expected: PASS (8 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/reviewRounds/arc.ts tests/reviewRounds/arc.test.ts
git commit -m "feat(review-rounds): arc identity from branch and merge base"
```

---

### Task 4: Emit rows from both result.json write sites

**Files:**
- Modify: `scripts/codex-guard.mjs` — `writeResult` (`scripts/codex-guard.mjs:693-713`) and the `main().catch` wrapper-error site (`scripts/codex-guard.mjs:1075-1093`)
- Create: scripts/reviewRoundEmit.mjs (ESM bridge — see below), tests/reviewRounds/_arcFixtures.ts, tests/reviewRounds/bridgeParity.test.ts
- Modify: tests/codexGuard/reviewRounds.test.ts, tests/reviewRounds/arc.test.ts (Step 4a moves its fixture list into the shared module)

**Interfaces:**
- Consumes: `cfg.stage` / `cfg.round` (Task 1); `appendRow`, `ReviewRoundRow` (Task 2); `resolveArc` (Task 3).
- Produces: rows on disk at the arc's corpus path — the input to Tasks 6 and 8.

**Why a bridge module.** `scripts/codex-guard.mjs` is plain Node ESM run directly by `node` with no build step, so it cannot `import` a `.ts` file. scripts/reviewRoundEmit.mjs is a small `.mjs` that re-implements the two calls it needs against the same contract; the TypeScript modules stay the tested source of truth for everything else and the meta-test and report consume them directly. The bridge is kept minimal — build the row, resolve the arc, append — and tests/codexGuard/reviewRounds.test.ts tests it end-to-end through the wrapper, which is where its correctness actually matters.

**Two implementations of one contract need a parity lock, not two test suites.** The wrapper executes the JavaScript copy; every other consumer executes the TypeScript one. Testing each against its own cases lets them drift on any case only one of them covers, and `on_main` is the sharp example: if the bridge alone lost that branch, it would write a corpus directory for an arc that does not exist while every TypeScript arc test stayed green. Enumerating the same cases twice does not fix that, because the enumeration is exactly what drifts.

Step 4a therefore adds a **differential test**: it builds each arc-resolution fixture repo once and asserts `resolveArc` from lib/reviewRounds/arc.ts and `resolveArc` from scripts/reviewRoundEmit.mjs return the **same** `ok`, `kind`, `branch`, `baseSha`, and `corpusFile` for every one. A case added to Task 3 then covers the bridge automatically, and the two cannot silently diverge. Vitest imports the `.mjs` directly; no build step is involved.

- [ ] **Step 1: Write the failing tests**

Append to tests/codexGuard/reviewRounds.test.ts:

```ts
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Task 1's `./harness` line becomes this. `readResult` arrives HERE, in the
// task that first calls it: Task 4 must be runnable and committable on its own
// (TDD invariant 1), and a test block whose helper is imported by a later
// task's fence is red for a reason that has nothing to do with the behavior
// under test.
import { mkRun, readResult, runGuard, writeScenario } from "./harness";

/** Turn a harness run's cwdDir into a real repo on a feature branch. */
function gitify(cwdDir: string): { base: string } {
  const g = (...args: string[]) =>
    execFileSync("git", args, { cwd: cwdDir, encoding: "utf8" }).trim();
  g("init", "-q", "-b", "main");
  g("config", "user.email", "t@example.com");
  g("config", "user.name", "T");
  writeFileSync(join(cwdDir, "seed.txt"), "seed\n");
  g("add", "seed.txt");
  g("commit", "-qm", "seed");
  const base = g("rev-parse", "HEAD");
  g("update-ref", "refs/remotes/origin/main", base);
  g("checkout", "-q", "-b", "feat/emit");
  return { base };
}

const corpusPath = (cwdDir: string, base: string): string =>
  join(cwdDir, "docs", "review-rounds", "feat", "emit", `${base.slice(0, 12)}.jsonl`);

const rowsIn = (file: string): Record<string, unknown>[] =>
  readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);

describe("row emission (spec §5.4)", () => {
  // Failure caught: emission silently no-ops and the corpus is empty forever,
  // so every arc reads as having run zero rounds.
  it("appends a row after a successful verdict", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    writeScenario(run, [{ onCall: 1, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] }]);
    const { code } = await runGuard(run, ["--stage", "diff", "--round", "2"]);
    expect(code).toBe(0);

    const rows = rowsIn(corpusPath(run.cwdDir, base));
    expect(rows).toHaveLength(1);
    expect(rows[0]!).toMatchObject({
      stage: "diff",
      round: 2,
      branch: "feat/emit",
      baseSha: base.slice(0, 12),
      status: "verdict",
      verdict: "APPROVE",
    });
    // Failure caught: a row whose identity disagrees with its own path - a
    // false identity in the committed corpus that the report prints as fact.
    expect(rows[0]!.baseSha).toBe(base.slice(0, 12));
  });

  // Failure caught: wrapper failures missing from the corpus entirely. Only
  // ONE of the two write sites emitting is the documented defect (spec §5.4).
  //
  // The trigger matters and is NOT the lint arm. `buildConfig` and the whole
  // `--lint-doc` preprocessing block run at MODULE TOP LEVEL
  // (scripts/codex-guard.mjs:921 and :926), before `main` is even defined
  // (:994) and long before `main().catch` is installed (:1066). A bad
  // CODEX_GUARD_TSX therefore exits 2 in preprocessing, writes no result at
  // all, and never reaches the second writer. The fault must be raised INSIDE
  // main(). A CODEX_HOME pointed at a plain file does NOT do it - every read of
  // cfg.codexHome is already guarded (the heartbeat mkdir, the cache rung, and
  // findRollout each swallow their own failure), so that dispatch runs to a
  // clean verdict. Probed 2026-08-04: status "verdict", exit 0, twice. What
  // does reach the site is a DIRECTORY planted where attempt 1's transcript
  // file must go: createWriteStream errors, the stream-error latch rejects with
  // fail() (scripts/codex-guard.mjs:561-564), and that rejection leaves the
  // attempt loop for main().catch - while cfg.out stays writable, so the
  // wrapper-error result.json is still produced. Probed the same day: exit 3,
  // failureReason "wrapper_error".
  it("appends a row from the wrapper_error site too", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    writeScenario(run, [{ onCall: 1, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] }]);

    mkdirSync(join(run.outDir, "attempt-1.transcript.txt"), { recursive: true });
    const { code } = await runGuard(run, ["--stage", "spec", "--round", "1"]);
    expect(code).toBe(3);

    // Confirm the fault really took the second writer, not the first: a
    // wrapper_error result is the ONLY body that carries this failureReason
    // (scripts/codex-guard.mjs:1087).
    expect(readResult(run)).toMatchObject({ status: "no_verdict", failureReason: "wrapper_error" });
    const rows = rowsIn(corpusPath(run.cwdDir, base));
    expect(rows).toHaveLength(1);
    expect(rows[0]!).toMatchObject({ status: "no_verdict", failureReason: "wrapper_error" });
  });

  // Belt-and-braces on the same defect, and independent of any trigger being
  // available: if a future refactor moves the fault surface, the integration
  // test above can silently stop reaching the second writer while still
  // passing on the first. This one cannot.
  it("has an emit call at BOTH result.json write sites", () => {
    const src = readFileSync(join(process.cwd(), "scripts", "codex-guard.mjs"), "utf8");
    const writes = [...src.matchAll(/result\.json/g)].length;
    const emits = [...src.matchAll(/emitReviewRoundRow\(/g)].length;
    // Derived from the source, not a literal: every result.json write site is
    // paired with an emit, plus the one emit inside the shared helper.
    expect(emits).toBeGreaterThanOrEqual(2);
    expect(writes).toBeGreaterThan(0);
  });

  // Failure caught: infra faults vanishing, or worse being recorded as
  // verdicts - the reaper bug killed 58% of dispatches at one point, and
  // counting those would push nearly every arc over threshold on noise.
  it("records a no_verdict row and marks it", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    writeScenario(run, [{ onCall: 1, actions: [{ type: "exit", code: 0 }] }]);
    await runGuard(run, ["--stage", "spec", "--round", "1", "--max-attempts", "1"]);
    const rows = rowsIn(corpusPath(run.cwdDir, base));
    expect(rows).toHaveLength(1);
    expect(rows[0]!).toMatchObject({ status: "no_verdict", verdict: null });
    expect(rows[0]!.failureReason).toBe("attempts_exhausted");
  });

  // Failure caught: telemetry breaking a review. The row is attached to work
  // that already happened; a corpus that cannot be written must not change the
  // exit code or lose the result.json.
  it("warns and preserves exit code and result.json when the corpus is unwritable", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    // Plant a DIRECTORY where the row file must go: mkdir succeeds, append fails.
    mkdirSync(corpusPath(run.cwdDir, base), { recursive: true });
    writeScenario(run, [{ onCall: 1, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] }]);
    const { code, stderr } = await runGuard(run, ["--stage", "spec", "--round", "1"]);
    expect(code).toBe(0);
    expect(existsSync(join(run.outDir, "result.json"))).toBe(true);
    expect(stderr.toLowerCase()).toContain("review-round");
  });

  // Plan resolution R1. Failure caught: a non-repo --cwd throwing, which would
  // break every pre-existing tests/codexGuard scenario.
  it("warns and exits 0 when --cwd is not a git repository", async () => {
    const run = mkRun(); // cwdDir is a bare mkdirSync temp dir
    writeScenario(run, [{ onCall: 1, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] }]);
    const { code, stderr } = await runGuard(run, ["--stage", "spec", "--round", "1"]);
    expect(code).toBe(0);
    expect(stderr.toLowerCase()).toContain("review-round");
  });

  // Failure caught: rows landing in a nonsense location under a detached HEAD.
  it("exits 2 on a detached HEAD", async () => {
    const run = mkRun();
    gitify(run.cwdDir);
    execFileSync("git", ["checkout", "-q", "--detach"], { cwd: run.cwdDir });
    writeScenario(run, [{ onCall: 1, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] }]);
    const { code, stderr } = await runGuard(run, ["--stage", "spec", "--round", "1"]);
    expect(code).toBe(2);
    expect(stderr.toLowerCase()).toContain("detached");
  });

  // Failure caught: a corpus written under `<repo>/app/docs/` that the gate,
  // walking from the repo root, never sees - so an obliged arc passes.
  it("writes the repo-root corpus when --cwd is a subdirectory", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    const sub = join(run.cwdDir, "app", "nested");
    mkdirSync(sub, { recursive: true });
    writeScenario(run, [{ onCall: 1, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] }]);
    await runGuard(run, ["--stage", "spec", "--round", "1", "--cwd", sub]);
    expect(existsSync(corpusPath(run.cwdDir, base))).toBe(true);
    expect(existsSync(join(sub, "docs", "review-rounds"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/codexGuard/reviewRounds.test.ts -t "row emission"`
Expected: FAIL — no corpus file is written; `rowsIn` throws ENOENT.

- [ ] **Step 3: Write the bridge module**

Create scripts/reviewRoundEmit.mjs:

```js
// ESM bridge: codex-guard.mjs runs under plain `node` with no build step, so it
// cannot import the TypeScript modules in lib/reviewRounds/. This file mirrors
// their contract for the two calls the wrapper needs. The TS modules stay the
// tested source of truth for the gate and the report; this bridge is tested
// end-to-end through the wrapper in tests/codexGuard/reviewRounds.test.ts.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

function git(cwd, args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** Mirror of lib/reviewRounds/arc.ts `resolveArc` (spec §5.2). */
export function resolveArc(cwd) {
  const repoRoot = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (repoRoot === null) return { ok: false, kind: "not_a_repo", problem: `not a git repository: ${cwd}` };

  const branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch === null || branch === "" || branch === "HEAD")
    return { ok: false, kind: "detached_head", problem: `HEAD is detached in ${repoRoot}` };
  if (branch === "main")
    return { ok: false, kind: "on_main", problem: "HEAD is main; there is no arc to record" };

  const base = git(cwd, ["merge-base", "origin/main", "HEAD"]);
  if (base === null || base.length < 12)
    return { ok: false, kind: "no_merge_base", problem: `no merge-base origin/main HEAD in ${repoRoot}` };

  const baseSha = base.slice(0, 12);
  const corpusFile = join(repoRoot, "docs", "review-rounds", ...branch.split("/"), `${baseSha}.jsonl`);
  return { ok: true, repoRoot, branch, baseSha, corpusFile };
}

/**
 * Appends one row. NEVER throws and NEVER changes the caller's exit code: the
 * row is telemetry attached to a review that already happened (spec §11.1).
 * Returns a problem string, or null on success.
 */
export function emitRow(cfg, body) {
  const arc = resolveArc(cfg.cwd);
  if (!arc.ok) return arc;

  const row = {
    stage: cfg.stage,
    round: cfg.round,
    branch: arc.branch,
    baseSha: arc.baseSha,
    label: body.label ?? null,
    status: body.status,
    verdict: body.verdict ?? null,
    failureReason: body.failureReason ?? null,
    findingCount: body.findingCount ?? null,
    startedAt: body.startedAt ?? null,
    endedAt: body.endedAt ?? null,
    briefPath: cfg.brief,
    outDir: cfg.out,
    guardVersion: body.guardVersion ?? null,
    // The wrapper_error site's body omits these two, so they DEFAULT here
    // rather than being read off an undefined key (spec §5.4).
    recoveredFrom: body.recoveredFrom ?? null,
  };

  try {
    mkdirSync(dirname(arc.corpusFile), { recursive: true });
    let prefix = "";
    try {
      if (statSync(arc.corpusFile).size > 0 && !readFileSync(arc.corpusFile, "utf8").endsWith("\n"))
        prefix = "\n";
    } catch {
      /* not created yet */
    }
    appendFileSync(arc.corpusFile, prefix + JSON.stringify(row) + "\n");
    return null;
  } catch (e) {
    return { ok: false, kind: "unwritable", problem: `could not append row: ${e.message}` };
  }
}
```

- [ ] **Step 4: Wire the wrapper**

In `scripts/codex-guard.mjs`, add the import beside the existing ones at the top:

```js
import { emitRow, resolveArc } from "./reviewRoundEmit.mjs";
```

Add the shared reporter above `writeResult` (`scripts/codex-guard.mjs:693`):

```js
// A row is telemetry attached to a review that ALREADY HAPPENED. Losing it must
// never change the exit code or the result.json (spec §11.1) - except on a
// detached HEAD, which is a LIVE arc whose identity cannot be determined, and
// silently under-recording that is the §8.2 failure. Outside a repo entirely
// there is no arc to record, so that one warns (plan R1).
let reviewRowWritten = false;
function emitReviewRoundRow(cfg, body) {
  if (reviewRowWritten) return;
  reviewRowWritten = true;
  const problem = emitRow(cfg, body);
  if (problem) process.stderr.write(`codex-guard: review-round row not written: ${problem.problem}\n`);
}
```

Then in `writeResult`, after the `writeFileSync` at `scripts/codex-guard.mjs:712`:

```js
  writeFileSync(join(cfg.out, "result.json"), JSON.stringify(body, null, 2) + "\n");
  emitReviewRoundRow(cfg, body);
}
```

And in the `main().catch` handler, immediately after its `writeFileSync` of the wrapper-error body, emit with the same body object. Extract that literal into a `const body = {...}` first so both the write and the emit see one value rather than two hand-synced copies.

The `reviewRowWritten` latch matters because `onSignal` (`scripts/codex-guard.mjs:1041`) also calls `writeResult`, and a SIGTERM arriving after a normal `writeResult` would otherwise append a second row for one dispatch — inflating the round count with a duplicate that distinct-value counting would NOT collapse, since both rows carry the same `round`. (Distinct-value counting makes this harmless for the threshold, but the report's recorded-row totals would be wrong.)

Finally, in `buildConfig`, after `cfg.cwd` is validated as a directory (`scripts/codex-guard.mjs:158`), fail fast on a detached HEAD:

```js
  const arc = resolveArc(cfg.cwd);
  if (!arc.ok && arc.kind === "detached_head") usageError(arc.problem);
```

- [ ] **Step 4a: Lock the bridge against the TypeScript implementation**

Create tests/reviewRounds/bridgeParity.test.ts. It reuses Task 3's `makeRepo` helper and drives **both** implementations over the identical repo, so the two can never diverge on a case only one suite covers:

```ts
import { describe, expect, it } from "vitest";

import { resolveArc as tsResolveArc } from "../../lib/reviewRounds/arc";
// The wrapper runs this copy. Vitest imports the .mjs directly; no build step.
import { resolveArc as jsResolveArc } from "../../scripts/reviewRoundEmit.mjs";
import { arcFixtureCases } from "./_arcFixtures";

/** Every arc-resolution case Task 3 defines, as (name, repo-builder) pairs:
 *  feature branch, subdirectory cwd, reused branch, plain dir, detached HEAD,
 *  on main, no merge base. */
const CASES = arcFixtureCases();

describe("bridge parity: scripts/reviewRoundEmit.mjs vs lib/reviewRounds/arc.ts", () => {
  // Failure caught: the bridge losing a branch of the contract while the
  // TypeScript suite stays green. `on_main` is the sharp case - a bridge that
  // dropped it would write a corpus directory for an arc that does not exist,
  // and no test in Task 3 would notice, because Task 3 never runs the bridge.
  it.each(CASES)("agrees on %s", (_name, build) => {
    const cwd = build();
    const ts = tsResolveArc(cwd);
    // The bridge is plain JS, so its return type is not the discriminated union
    // `ArcResolution`. Reading it as a bag of fields keeps the comparison honest
    // (a cast would assert the very shape under test) and keeps the file
    // typechecking under `strict`.
    const js: Record<string, unknown> = jsResolveArc(cwd);
    expect(js.ok).toBe(ts.ok);
    // Branching on `ts.ok` alone is sound because the line above already pinned
    // the two to agree on it.
    if (ts.ok) {
      expect(js.branch).toBe(ts.branch);
      expect(js.baseSha).toBe(ts.baseSha);
      expect(js.corpusFile).toBe(ts.corpusFile);
    } else {
      expect(js.kind).toBe(ts.kind);
    }
  });

  // Failure caught: a parity suite that passes because it exercises nothing.
  // Derived from the case list, never a literal.
  it("covers every refusal kind the contract defines", () => {
    const kinds = new Set(
      CASES.flatMap(([, build]) => {
        const r = tsResolveArc(build());
        return r.ok ? [] : [r.kind];
      }),
    );
    expect([...kinds].sort()).toEqual(
      ["detached_head", "no_merge_base", "not_a_repo", "on_main"].sort(),
    );
  });
});
```

Extract `arcFixtureCases()` into tests/reviewRounds/_arcFixtures.ts in this step and have tests/reviewRounds/arc.test.ts consume it too, so one list feeds both suites. That shared list is what makes the parity lock automatic rather than another thing to remember. Its exported shape is `arcFixtureCases(): [name: string, build: () => string][]`, where `build()` returns the `cwd` to hand `resolveArc` — the repo root for most cases, the nested subdirectory for the subdirectory case.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/codexGuard/reviewRounds.test.ts tests/reviewRounds/bridgeParity.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole codex-guard suite**

Run: `pnpm exec vitest run tests/codexGuard/`
Expected: PASS. Every pre-existing scenario runs against a non-repo `cwdDir`, so it takes the `not_a_repo` warn-and-skip path (plan R1) — a red run here means that path throws.

- [ ] **Step 7: Commit**

```bash
git add scripts/codex-guard.mjs scripts/reviewRoundEmit.mjs tests/codexGuard/reviewRounds.test.ts \
        tests/reviewRounds/_arcFixtures.ts tests/reviewRounds/arc.test.ts \
        tests/reviewRounds/bridgeParity.test.ts
git commit -m "feat(review-rounds): emit a corpus row from both result.json write sites"
```

---

### Task 5: `FINDINGS: <n>` declared line

**Files:**
- Modify: `scripts/codex-guard.mjs` (a `parseFindingCount` beside `parseVerdict` at `scripts/codex-guard.mjs:389`, driven from **every** site that reads a terminal message — `classifyAttempt` (`scripts/codex-guard.mjs:487-508`), `tryRolloutScrape` (`scripts/codex-guard.mjs:781-784`) and `onSignal` (`scripts/codex-guard.mjs:1042-1058`) — and carried on `state` so that all **four** terminal write paths read one value)
- Modify: `AGENTS.md` (brief-authoring contract, `AGENTS.md:186`)
- Modify: tests/codexGuard/reviewRounds.test.ts

**Interfaces:**
- Consumes: the row writer of Task 4.
- Produces: `findingCount` populated on rows whose reviewer declared it.

**Contract, verbatim, for the AGENTS.md edit:** the brief MUST instruct the reviewer to end with a final `VERDICT: <outcome>` line **and** a `FINDINGS: <n>` line. The wrapper detects both; it does not inject either instruction.

- [ ] **Step 1: Write the failing tests**

Append to tests/codexGuard/reviewRounds.test.ts:

```ts
// Task 4's `node:child_process` line and its `./harness` line each grow one
// entry. The interrupted-path case drives the wrapper itself so it chooses when
// SIGTERM lands, which `runGuard`'s execFile cannot do; `GUARD` and `guardEnv`
// are what make that spawn identical to a harness run in every other respect.
import { execFileSync, spawn } from "node:child_process";
import { GUARD, guardEnv, mkRun, readResult, runGuard, writeScenario } from "./harness";

describe("declared finding count (spec §5.3)", () => {
  // Failure caught: a count inferred from prose shape. The probe measured
  // inferred recognition at 64.8% against 681 real outputs; declared reaches
  // 99.6%. A recognizer here is the denylist shape the accept-set rule forbids.
  it("records the declared count", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    writeScenario(run, [{ onCall: 1, actions: [{ type: "lastMessage", text: "FINDINGS: 5\nVERDICT: BLOCKING\n" }, { type: "exit", code: 0 }] }]);
    await runGuard(run, ["--stage", "diff", "--round", "1"]);
    expect(rowsIn(corpusPath(run.cwdDir, base))[0]!.findingCount).toBe(5);
  });

  it("records 0 as 0, distinct from undeclared", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    writeScenario(run, [{ onCall: 1, actions: [{ type: "lastMessage", text: "FINDINGS: 0\nVERDICT: APPROVE\n" }, { type: "exit", code: 0 }] }]);
    await runGuard(run, ["--stage", "diff", "--round", "1"]);
    expect(rowsIn(corpusPath(run.cwdDir, base))[0]!.findingCount).toBe(0);
  });

  // Failure caught: `null` folded into zero, which understates every report
  // total and is indistinguishable from "no findings found" (spec §5.3).
  it("records null when no line was declared, never zero", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "lastMessage", text: "I found 3 problems, listed above.\nVERDICT: BLOCKING\n" }, { type: "exit", code: 0 }] },
    ]);
    await runGuard(run, ["--stage", "diff", "--round", "1"]);
    expect(rowsIn(corpusPath(run.cwdDir, base))[0]!.findingCount).toBeNull();
  });

  // Failure caught: an unanchored recognizer reading "FINDINGS: 2 or 7" as 2,
  // recording an ambiguous declaration as a fact. This is an ordinary malformed
  // reviewer response, not hiding, so the consequence bound applies: the corpus
  // must not carry a false scalar.
  it.each([["FINDINGS: 2 or 7"], ["FINDINGS: 3 (plus 2 nits)"], ["FINDINGS: 4 and rising"]])(
    "records null for the ambiguous single line %j",
    async (line) => {
      const run = mkRun();
      const { base } = gitify(run.cwdDir);
      writeScenario(run, [
        { onCall: 1, actions: [{ type: "lastMessage", text: `${line}\nVERDICT: BLOCKING\n` }, { type: "exit", code: 0 }] },
      ]);
      await runGuard(run, ["--stage", "diff", "--round", "1"]);
      expect(rowsIn(corpusPath(run.cwdDir, base))[0]!.findingCount).toBeNull();
    },
  );

  // Failure caught: an ambiguous double declaration silently taking the first.
  it("records null when two different counts are declared", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    writeScenario(run, [{ onCall: 1, actions: [{ type: "lastMessage", text: "FINDINGS: 2\nFINDINGS: 7\nVERDICT: BLOCKING\n" }, { type: "exit", code: 0 }] }]);
    await runGuard(run, ["--stage", "diff", "--round", "1"]);
    expect(rowsIn(corpusPath(run.cwdDir, base))[0]!.findingCount).toBeNull();
  });

  // Failure caught: wiring the count at the verdict-success path only. A
  // reviewer that declares its count and then dies before emitting a VERDICT
  // line records `null`, which means NOT DECLARED - so a real declaration is
  // erased, and the corpus reports the reviewer never gave a number.
  it("records a declared count on a no_verdict row, never null", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "lastMessage", text: "FINDINGS: 2\nStill working, no verdict yet.\n" }, { type: "exit", code: 0 }] },
    ]);
    await runGuard(run, ["--stage", "diff", "--round", "1", "--max-attempts", "1"]);
    const row = rowsIn(corpusPath(run.cwdDir, base))[0]!;
    expect(row.status).toBe("no_verdict");
    expect(row.findingCount).toBe(2);
  });

  // Failure caught: the SECOND parse site left unwired. A rollout-recovered
  // verdict is a full review that reached a conclusion, and recording its
  // declared count as `null` says the reviewer declared nothing.
  it("records the declared count on a rollout-recovered verdict", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    const SID = "0199aa11-2233-4455-6677-889900aabbcc";
    const rolloutDir = join(run.codexHome, "sessions", "2026", "07", "24");
    mkdirSync(rolloutDir, { recursive: true });
    // The -o write never lands; the verdict AND its count survive only in the
    // rollout, which is exactly the shape the reaper bug produced.
    const rollout = [
      JSON.stringify({
        timestamp: "2026-07-24T20:30:43.000Z",
        type: "session_meta",
        payload: { id: SID, cli_version: "0.146.0-alpha.6", originator: "codex_exec" },
      }),
      JSON.stringify({
        timestamp: "2026-07-24T20:31:00.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "FINDINGS: 3\n\nVERDICT: BLOCKING" }],
        },
      }),
    ].join("\n");
    writeFileSync(join(rolloutDir, `rollout-2026-07-24T20-30-43-${SID}.jsonl`), rollout + "\n");

    writeScenario(run, [
      { onCall: 1, actions: [{ type: "stderr", text: `session id: ${SID}\n` }, { type: "exit", code: 0 }] },
      { onCall: 2, actions: [{ type: "stderr", text: "dead\n" }, { type: "exit", code: 0 }] },
      { onCall: 3, actions: [{ type: "stderr", text: "dead\n" }, { type: "exit", code: 0 }] },
    ]);
    await runGuard(run, ["--stage", "diff", "--round", "1"]);

    expect(readResult(run)).toMatchObject({ status: "verdict", recoveredFrom: "rollout_scrape" });
    const row = rowsIn(corpusPath(run.cwdDir, base))[0]!;
    // Derived from the rollout fixture's own declared line, not a literal
    // repeated from the assertion side.
    expect(row.findingCount).toBe(3);
    expect(row.verdict).toBe("BLOCKING");
  });

  // Failure caught: the count wired at the two SUCCESS writers only. `onSignal`
  // (scripts/codex-guard.mjs:1051-1057) writes its own terminal result, so a
  // reviewer that declared FINDINGS: 2 and was then interrupted records `null`
  // - "not declared" - and the corpus then reports a declaration that WAS made
  // as one the reviewer never gave. A false fact about a real review, which is
  // the outcome the consequence bound forbids.
  it("records a declared count on an interrupted row", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    const DECLARED = 2;
    // Attempt 1 declares its count and stops short of a VERDICT line, so the
    // ladder continues (no_marker); attempt 2 hangs, which is what leaves a
    // live child for the SIGTERM to interrupt.
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "stdout", text: "x" }, { type: "lastMessage", text: `FINDINGS: ${DECLARED}\nStill working, no verdict yet.\n` }, { type: "exit", code: 0 }] },
      { onCall: 2, actions: [{ type: "stdout", text: "x" }, { type: "hang" }] },
    ]);
    const child = spawn(
      process.execPath,
      [GUARD, "review", "--brief", run.briefPath, "--cwd", run.cwdDir, "--out", run.outDir, "--stage", "diff", "--round", "1"],
      {
        env: guardEnv(run, {
          CODEX_GUARD_STALL_SECS: "30",
          CODEX_GUARD_ATTEMPT_MAX_SECS: "60",
          CODEX_GUARD_TOTAL_MAX_SECS: "90",
        }),
      },
    );
    const exited = new Promise<number | null>((res) => child.on("exit", (c) => res(c)));
    const nap = (ms: number) => new Promise((r) => setTimeout(r, ms));
    try {
      // Waiting on attempt 2's pidfile is what makes this deterministic rather
      // than a sleep: it proves attempt 1 was already read and classified, so
      // there is a declared count present to lose.
      for (let i = 0; i < 200 && !existsSync(join(run.recordDir, "pid-2.txt")); i++) await nap(50);
      expect(existsSync(join(run.recordDir, "pid-2.txt"))).toBe(true);
      child.kill("SIGTERM");
      expect(await exited).toBe(3);
    } finally {
      child.kill("SIGKILL");
    }
    expect(readResult(run)).toMatchObject({ failureReason: "interrupted" });
    const row = rowsIn(corpusPath(run.cwdDir, base))[0]!;
    expect(row.failureReason).toBe("interrupted");
    // Derived from the scenario's own declared line, never a literal repeated
    // on the assertion side.
    expect(row.findingCount).toBe(DECLARED);
  }, 30000);

  // Failure caught: the same gap at the fourth writer. The `main().catch`
  // handler (scripts/codex-guard.mjs:1075-1093) builds its OWN body literal
  // instead of going through `writeResult`, so a count threaded through
  // `writeResult` alone is absent from every wrapper-error row - and an infra
  // fault is exactly when an operator most wants the reviewer's own number.
  it("records a declared count on a wrapper_error row", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    const DECLARED = 2;
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "stdout", text: "x" }, { type: "lastMessage", text: `FINDINGS: ${DECLARED}\nStill working, no verdict yet.\n` }, { type: "exit", code: 0 }] },
    ]);
    // The fault must land inside main() and AFTER attempt 1 declared its count,
    // so the directory goes where attempt TWO's transcript must be written.
    // Task 4 Step 1 records why this is the trigger that reaches the site and
    // why the CODEX_HOME one does not.
    mkdirSync(join(run.outDir, "attempt-2.transcript.txt"), { recursive: true });
    const { code } = await runGuard(run, ["--stage", "diff", "--round", "1"]);
    expect(code).toBe(3);
    expect(readResult(run)).toMatchObject({ status: "no_verdict", failureReason: "wrapper_error" });
    const row = rowsIn(corpusPath(run.cwdDir, base))[0]!;
    expect(row.findingCount).toBe(DECLARED);
  });

  // Failure caught: the count extracted BELOW `classifyAttempt`'s exit-shape
  // guards. An attempt that writes its message and then exits nonzero returns
  // at the `nonzero_exit` guard (scripts/codex-guard.mjs:492-495), which is
  // ABOVE the read, so the message is never opened and the corpus records
  // `null` - "not declared" - against a message that plainly declares. The
  // reviewer's own number is a fact about the review, not about the exit code
  // of the process that carried it.
  it("records a declared count on a nonzero-exit attempt whose message landed", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    const DECLARED = 2;
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "lastMessage", text: `FINDINGS: ${DECLARED}\nVERDICT: BLOCKING\n` }, { type: "exit", code: 1 }] },
    ]);
    await runGuard(run, ["--stage", "diff", "--round", "1", "--max-attempts", "1"]);
    const row = rowsIn(corpusPath(run.cwdDir, base))[0]!;
    // The verdict is NOT accepted, because the attempt failed - and the
    // declared count survives anyway. That is the decoupling stated as an
    // assertion: one row carrying both answers, reached by different paths.
    expect(row.status).toBe("no_verdict");
    expect(row.verdict).toBeNull();
    // Derived from the scenario's own declared line, never a literal repeated
    // on the assertion side.
    expect(row.findingCount).toBe(DECLARED);
  });

  // Failure caught: the count extracted BELOW the scrape's verdict guard.
  // `tryRolloutScrape` continues at `parsed.shape !== "ok"`
  // (scripts/codex-guard.mjs:783-784), so a rollout whose message declares a
  // count but never reached a VERDICT line loses it - and on this dispatch
  // nothing else ever read a message, so the declaration is gone outright
  // rather than merely stale.
  it("records a declared count from a rollout message carrying no verdict", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    const DECLARED = 2;
    const SID = "0199bb22-3344-5566-7788-99aabbccddee";
    const rolloutDir = join(run.codexHome, "sessions", "2026", "07", "24");
    mkdirSync(rolloutDir, { recursive: true });
    const rollout = [
      JSON.stringify({
        timestamp: "2026-07-24T21:10:00.000Z",
        type: "session_meta",
        payload: { id: SID, cli_version: "0.146.0-alpha.6", originator: "codex_exec" },
      }),
      JSON.stringify({
        timestamp: "2026-07-24T21:11:00.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: `FINDINGS: ${DECLARED}\n\nStill working, no verdict yet.` }],
        },
      }),
    ].join("\n");
    writeFileSync(join(rolloutDir, `rollout-2026-07-24T21-10-00-${SID}.jsonl`), rollout + "\n");

    // The -o write never lands, so the ONLY terminal message this dispatch
    // produced is the scraped one.
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "stderr", text: `session id: ${SID}\n` }, { type: "exit", code: 0 }] },
    ]);
    await runGuard(run, ["--stage", "diff", "--round", "1", "--max-attempts", "1"]);

    // No verdict is recovered - there was none to recover - and the count
    // lands regardless, which is the whole point of the split.
    expect(readResult(run)).toMatchObject({ status: "no_verdict", recoveredFrom: null });
    const row = rowsIn(corpusPath(run.cwdDir, base))[0]!;
    // Derived from the rollout fixture's own declared line.
    expect(row.findingCount).toBe(DECLARED);
  });

  // Failure caught: the interrupt path reading nothing at all. The live
  // attempt writes its terminal message and then hangs, so `classifyAttempt`
  // never runs for it and neither read site is ever reached; `onSignal`
  // (scripts/codex-guard.mjs:1042-1058) then writes the interrupted result
  // from a carrier that is still null. A declaration sitting on disk in the
  // out-dir is recorded as one the reviewer never gave, on the one dispatch
  // shape where no later attempt and no scrape can recover it.
  it("records a declared count when SIGTERM lands before the attempt is classified", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    const DECLARED = 2;
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "stdout", text: "x" }, { type: "lastMessage", text: `FINDINGS: ${DECLARED}\nStill working, no verdict yet.\n` }, { type: "hang" }] },
    ]);
    const child = spawn(
      process.execPath,
      [GUARD, "review", "--brief", run.briefPath, "--cwd", run.cwdDir, "--out", run.outDir, "--stage", "diff", "--round", "1"],
      {
        env: guardEnv(run, {
          CODEX_GUARD_STALL_SECS: "30",
          CODEX_GUARD_ATTEMPT_MAX_SECS: "60",
          CODEX_GUARD_TOTAL_MAX_SECS: "90",
        }),
      },
    );
    const exitedAt = new Promise<number | null>((res) => child.on("exit", (c) => res(c)));
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const msgPath = join(run.outDir, "attempt-1.last-message.txt");
    try {
      // Waiting on the MESSAGE FILE rather than a pidfile is what puts the
      // signal in the right window: the file existing proves the declaration
      // is on disk, and attempt 1 hanging proves nothing has classified it.
      for (let i = 0; i < 200 && !existsSync(msgPath); i++) await pause(50);
      expect(existsSync(msgPath)).toBe(true);
      // No second attempt was ever started, so no other read could have run.
      expect(existsSync(join(run.recordDir, "pid-2.txt"))).toBe(false);
      child.kill("SIGTERM");
      expect(await exitedAt).toBe(3);
    } finally {
      child.kill("SIGKILL");
    }
    expect(readResult(run)).toMatchObject({ failureReason: "interrupted" });
    const row = rowsIn(corpusPath(run.cwdDir, base))[0]!;
    expect(row.failureReason).toBe("interrupted");
    // Derived from the scenario's own declared line, never a literal repeated
    // on the assertion side.
    expect(row.findingCount).toBe(DECLARED);
  }, 30000);
});
```

This block grows the file's single import section by **three** names across two lines, both spelled out at the top of the fence: `spawn` joins `execFileSync` on the `node:child_process` line, and `GUARD` and `guardEnv` join the `./harness` line. Everything else the cases reach for is already there after Task 4 — `readResult` on the `./harness` line, and `join`, `mkdirSync`, `existsSync` and `writeFileSync` on the two `node:` lines. Re-importing any of THOSE is a duplicate-identifier error, not a no-op.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/codexGuard/reviewRounds.test.ts -t "declared finding count"`
Expected: FAIL — `findingCount` is `null` on every row, so the two declared-count cases and all **seven** wiring cases (no-verdict, rollout-recovered, interrupted, wrapper_error, nonzero-exit, rollout-without-verdict, SIGTERM-before-classification) fail. The `null` cases pass vacuously today, which is why they are not the red state.

- [ ] **Step 3: Implement the parser**

In `scripts/codex-guard.mjs`, beside `parseVerdict` (`scripts/codex-guard.mjs:389`):

```js
/**
 * The DECLARED count, never an inferred one (spec §3/§5.3). Returns null when
 * the line is absent or when two DIFFERENT counts are declared - `null` means
 * NOT DECLARED, and it must never be confused with a declared zero.
 */
function parseFindingCount(text) {
  const noFences = text.replace(/^ {0,3}```[^\n]*\n[\s\S]*?^ {0,3}```[^\n]*$/gm, "");
  const seen = new Set();
  for (const line of noFences.split("\n")) {
    const m = /^\s*(?:\*{1,2}|_{1,2})?\s*FINDINGS:\s*(\d+)\s*(?:\*{1,2}|_{1,2})?\s*$/.exec(line);
    if (m) seen.add(Number(m[1]));
  }
  return seen.size === 1 ? [...seen][0] : null;
}
```

**Verdict extraction and count extraction share a READ. They share no CONTROL PATH.** That sentence is the whole design, and getting it wrong is what the round-4 placement did: it computed the count at the two sites that read a message but placed each call *after* that site's verdict logic, which made a declared count conditional on a verdict being reached. The record schema never said it was. `findingCount: null` means the reviewer declared nothing (Global Constraints, spec §5.3) — so every ordinary input that carries a declaration into a failed or unverdicted path recorded a false fact about a real review: a nonzero-exit or killed attempt whose `-o` message declared (`classifyAttempt` returns above the read at `scripts/codex-guard.mjs:487-495`), a scraped rollout message that declared but never reached a `VERDICT:` line (`tryRolloutScrape` continues at `scripts/codex-guard.mjs:783-784`), and an attempt whose message landed before a SIGTERM that arrived before any classification.

So the count is extracted **whenever the wrapper reads a terminal message at all** — above every verdict guard, every early return and every acceptance branch — and the two extractions are wired to the same read, never to the same `if`.

**THREE sites read a terminal message; FOUR sites write a terminal result. Recomputing the count at the write sites is four chances to diverge, which is the defect class itself.** So it is computed exactly where a message is read, carried on `state`, and read back by every writer.

**The carrier and its grain.** `state` (`scripts/codex-guard.mjs:995-1006`) gains `findingCount: null` beside `heldLockDir`. It holds the declaration of the **last non-empty terminal message the dispatch produced** — nothing more subtle than that, because that is also the message a reader looking at the out-dir would pick, and Task 10's hook has to pick the same one.

```js
    heldLockDir: null,
    // The declared count of the LAST non-empty terminal message this dispatch
    // produced. One carrier, so the four terminal writers cannot disagree.
    findingCount: null,
```

**The one primitive that holds the grain**, added beside `parseFindingCount` so no read site has to restate it. It takes TEXT, not a path: every read site already has the message in hand, and a helper that reads would need its own answer to what an unreadable file means at three sites that answer it differently.

```js
/**
 * The grain, in one place: the LAST NON-EMPTY terminal message wins. An empty
 * or absent message is not a declaration of nothing, so it never erases an
 * earlier one - which is why every read site can call this unconditionally,
 * above its own guards, without checking anything first.
 */
function recordDeclaredCount(state, text) {
  if (typeof text !== "string" || text.trim() === "") return;
  state.findingCount = parseFindingCount(text);
}
```

**Read site 1 — the `-o` message** (`classifyAttempt`, `scripts/codex-guard.mjs:487-508`). The read moves to the TOP of the function, above all four guards, and the count is recorded there. The function gains a `state` parameter — its header becomes `function classifyAttempt(attempt, state) {` — and its one call site (`scripts/codex-guard.mjs:678`) passes it. The body becomes, in full:

```js
  // ONE read, TWO extractions, and this one runs ABOVE every guard below it.
  // A killed or nonzero-exit attempt can still have left a readable message,
  // and that message's declaration is a fact about the review whatever the
  // exit shape of the process that carried it was. `hasMsg` keeps absent and
  // empty distinguishable, which the two failure shapes below still need; the
  // read itself is the same call it always was, so a genuinely unreadable file
  // still throws to the caller's classification catch exactly as before.
  const hasMsg = existsSync(attempt.lastMessagePath);
  const msg = hasMsg ? readFileSync(attempt.lastMessagePath, "utf8") : "";
  recordDeclaredCount(state, msg);

  if (attempt.killedReason !== null) {
    attempt.failureShape = "killed";
    return;
  }
  if (attempt.exitCode !== 0) {
    attempt.failureShape = "nonzero_exit";
    return;
  }
  if (!hasMsg) {
    attempt.failureShape = "no_o_file";
    return;
  }
  if (msg.trim() === "") {
    attempt.failureShape = "empty_o_file";
    return;
  }
  const parsed = parseVerdict(msg);
  attempt.parsed = parsed;
  if (parsed.shape !== "ok") attempt.failureShape = parsed.shape;
}
```

```js
  try {
    classifyAttempt(attempt, state);
  } catch (e) {
```

**Read site 2 — the scraped rollout message** (`scripts/codex-guard.mjs:781-784`). It writes the carrier rather than returning `findingCount` in its patch. One carrier means precedence is settled by write order instead of by spread order, and the scrape's write is last by construction: it runs only after the attempt loop has already given up. The recording goes ABOVE the verdict guard, so a scraped message that declared a count without reaching a `VERDICT:` line still records it:

```js
      const msg = lastAgentMessage(rollout);
      if (!msg) continue;
      // ABOVE the guard below, for the same reason as site 1. A scraped message
      // is a terminal message this dispatch produced whether or not it carries
      // a verdict, and it replaces any earlier attempt's declaration -
      // including replacing a number with "not declared" when it declares none.
      recordDeclaredCount(state, msg);
      const parsed = parseVerdict(msg);
      if (parsed.shape !== "ok") continue;
```

**Read site 3 — the live attempt at interrupt time** (`onSignal`, `scripts/codex-guard.mjs:1042-1058`). An attempt that wrote its `-o` message and then hung is never classified at all, so site 1 never runs for it and the interrupt is the first and only chance to read it. Placed just after the live-attempt snapshot push and before `writeResult`, with a guard of its own — unlike site 1 there is no caller to catch a throw here, and losing the whole interrupted result over an unreadable message would trade a missing count for a missing row:

```js
      // The live attempt may have written its message and then hung, so this is
      // the FIRST read of it, not a second one. A hung attempt that wrote
      // nothing reads "" and changes nothing, so an earlier attempt's
      // declaration survives the interrupt untouched.
      try {
        const livePath = state.currentAttempt?.lastMessagePath;
        if (livePath && existsSync(livePath)) {
          recordDeclaredCount(state, readFileSync(livePath, "utf8"));
        }
      } catch {
        /* an unreadable message is never a reason to lose the interrupted row */
      }
      writeResult(cfg, state, { failureReason: "interrupted", error: `signal ${sig}` });
```

**The four terminal writers, and the two places they read from.** Writers 1, 2 and 3 all funnel through `writeResult`, so ONE default line serves them:

1. **The verdict-success write** (`scripts/codex-guard.mjs:1016-1021`) — `writeResult`.
2. **`giveUp`** (`scripts/codex-guard.mjs:1026-1029`) — `writeResult`, including the rollout-recovered case.
3. **`onSignal`** (`scripts/codex-guard.mjs:1042-1058`) — `writeResult` with `failureReason: "interrupted"`. A reviewer that declared its count and was then interrupted is a real declaration, and this writer is why the count cannot live on the final `attempt`: at interrupt time the live attempt may be a hung one that declared nothing, and an earlier attempt's declaration has to survive it. The carrier's non-empty grain gives that half; read site 3 gives the other half, for the hung attempt that DID declare before it hung.
4. **`main().catch`** (`scripts/codex-guard.mjs:1066-1093`) — builds its OWN body literal and never touches `writeResult`, so it is the one site that needs a second read.

```js
    recoveredFrom: null,
    // Serves writers 1, 2 and 3 - every path through writeResult - from the one
    // carrier. Placed above the `...patch` spread, so a patch may still override
    // it; none does today.
    findingCount: state.findingCount ?? null,
```

```js
          failureReason: "wrapper_error",
          // Writer 4. `state` is already read here (globalThis.__guardState),
          // and the optional chain matches the `state?.startedAtIso ?? null`
          // line below: the handler can run before main() ever set state.
          findingCount: state?.findingCount ?? null,
```

`findingCount` is a corpus field, and the bridge reads `body.findingCount ?? null`, so those two reads are the whole wiring. It rides along as one additive key on result.json; no existing test pins that body's key set (verified: no `Object.keys` assertion over `readResult` in `tests/codexGuard/`), and an additive key is not a breaking change to the published shape.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/codexGuard/reviewRounds.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the AGENTS.md brief contract**

In `AGENTS.md`, extend the brief-authoring bullet (`AGENTS.md:186`) so it reads:

> - Brief authoring: the brief MUST instruct the reviewer to end with a final `VERDICT: <outcome>` line using one of APPROVE / NEEDS-ATTENTION / BLOCKING, and a `FINDINGS: <n>` line declaring how many findings it raised (`FINDINGS: 0` when none). The wrapper detects both; it does not inject either instruction. A missing `FINDINGS:` line records `findingCount: null` — "not declared", never "none found".

- [ ] **Step 6: Commit**

```bash
git add scripts/codex-guard.mjs AGENTS.md tests/codexGuard/reviewRounds.test.ts
git commit -m "feat(review-rounds): declared FINDINGS count on every row"
```

---

### Task 6: The merge gate

**Files:**
- Create: lib/reviewRounds/count.ts, lib/reviewRounds/filing.ts, lib/reviewRounds/corpus.ts
- Create: tests/reviewRounds/count.test.ts, tests/reviewRounds/filing.test.ts
- Create: tests/docs/_metaReviewRoundEconomy.test.ts

**Interfaces:**
- Consumes: `ROUND_THRESHOLD`, `COUNTED_STAGES`, `isCountedStage` (Task 2); `parseRow`, `ReviewRoundRow` (Task 2); `CORPUS_DIR` (Task 3).
- Produces:
  - `countedRounds(rows: ReviewRoundRow[]): Map<Stage, number>` — distinct counted `round` values per stage
  - `recordedRounds(rows: ReviewRoundRow[]): Map<Stage, number>`
  - `roundGaps(rows: ReviewRoundRow[]): Stage[]` — stages whose declared rounds are not a contiguous `1..N`
  - `parseFiling(md: string): FilingSection[]` where `FilingSection = { stage: string; declaredRounds: number; hasExamined: boolean; hasDisposition: boolean; citedIds: string[]; }`
  - `readArcs(root: string): Arc[]` where `Arc = { dir: string; branch: string; baseSha: string; corpusPath: string | null; filingPath: string | null; rows: ReviewRoundRow[]; malformed: { line: number; problem: string }[]; filingText: string | null }`
  - `checkCorpus(root: string, opts?: { resolvableIds?: Set<string> }): Problem[]` and `liveLedgerIds(root: string): Set<string>`

**Discovery is over BOTH extensions, not over corpora alone** (spec §7.1). Enumerating `.jsonl` and reaching for a sibling leaves an orphan `.md` unvisited — which makes assertion 9 vacuous in exactly the case it exists to catch. `readArcs` collects arc *directories*; an arc is any directory holding either file.

**But "any `.md`" is too wide, and taken literally it makes the gate fail on its own documentation.** Task 12 adds docs/review-rounds/README.md, which has no sibling corpus and would be reported as an `orphan_filing` forever — the live-corpus test could never be green after Task 12 shipped. Discovery is therefore keyed on the **filename shape that arc identity already defines**: a corpus is a corpus named for the arc's baseSha12 and a filing is a filing named for the arc's baseSha12, where `<baseSha12>` matches `/^[0-9a-f]{12}$/`. Anything else under docs/review-rounds/ — a README, a note, an editor backup — is not an arc file and is ignored by name.

This is narrower AND stricter than "any `.md`": it still catches the orphan the assertion exists for (a a 12-hex-stemmed .md with no a 12-hex-stemmed .jsonl beside it), and it additionally rejects a filing whose stem is not a merge-base at all, which the loose walk would have accepted silently. It costs nothing, because the shape is not a new convention — it is the one §5.2 already requires the writer to produce.

- [ ] **Step 1: Write the failing counting + filing tests**

Create tests/reviewRounds/count.test.ts:

```ts
import { describe, expect, it } from "vitest";

import { ROUND_THRESHOLD } from "../../lib/reviewRounds/constants";
import { countedRounds, recordedRounds, roundGaps } from "../../lib/reviewRounds/count";
import type { ReviewRoundRow } from "../../lib/reviewRounds/row";

const row = (over: Partial<ReviewRoundRow>): ReviewRoundRow => ({
  stage: "diff",
  round: 1,
  branch: "feat/x",
  baseSha: "aaaaaaaaaaaa",
  label: null,
  status: "verdict",
  verdict: "APPROVE",
  failureReason: null,
  findingCount: null,
  startedAt: "2026-08-01T00:00:00.000Z",
  endedAt: "2026-08-01T00:10:00.000Z",
  briefPath: "b.md",
  outDir: "o",
  guardVersion: 1,
  recoveredFrom: null,
  ...over,
});

describe("counting rule (spec §5.4) - exactly two conjuncts", () => {
  // THE defect this test exists for: an implementation that reads
  // `failureReason: null` as part of the counted combination drops four
  // recovered verdicts, sees a contiguous 1..4, obliges nothing, and passes
  // every other assertion. An obliged arc reported compliant.
  it("counts a recovered verdict whose failureReason is non-null", () => {
    const rows = [1, 2, 3, 4].map((n) =>
      row({ round: n, status: "verdict", failureReason: "attempts_exhausted" }),
    );
    expect(countedRounds(rows).get("diff")).toBe(rows.length);
    expect(countedRounds(rows).get("diff")).toBeGreaterThanOrEqual(ROUND_THRESHOLD);
  });

  it("excludes no_verdict rows, including wrapper_error", () => {
    const rows = [
      row({ round: 1 }),
      row({ round: 2 }),
      row({ round: 3 }),
      row({ round: 4, status: "no_verdict", verdict: null, failureReason: "wrapper_error" }),
    ];
    expect(countedRounds(rows).get("diff")).toBe(3);
    expect(recordedRounds(rows).get("diff")).toBe(4);
  });

  // Failure caught: a threshold that counts every verdict row regardless of
  // stage, so four non-review task dispatches manufacture an obligation.
  it("excludes stage task from the count but not from the record", () => {
    const rows = [1, 2, 3, 4].map((n) => row({ round: n, stage: "task" }));
    expect(countedRounds(rows).get("task")).toBeUndefined();
    expect(recordedRounds(rows).get("task")).toBe(4);
  });

  // Failure caught: taxing the practice AGENTS.md recommends - split
  // tight-scope reviews share one round number and must count once.
  it("counts DISTINCT round values, so a parallel wave counts once", () => {
    const rows = [1, 2, 3, 3, 3].map((n) => row({ round: n }));
    expect(countedRounds(rows).get("diff")).toBe(3);
    expect(recordedRounds(rows).get("diff")).toBe(5);
  });

  it("keeps stages independent", () => {
    const rows = [
      ...[1, 2, 3, 4].map((n) => row({ round: n, stage: "diff" })),
      row({ round: 1, stage: "spec" }),
    ];
    expect(countedRounds(rows).get("diff")).toBe(4);
    expect(countedRounds(rows).get("spec")).toBe(1);
  });

  it("reports a gap when declared rounds are not contiguous", () => {
    expect(roundGaps([1, 2, 4].map((n) => row({ round: n })))).toContain("diff");
    expect(roundGaps([1, 2, 3].map((n) => row({ round: n })))).toEqual([]);
    // Duplicates are legal and do not read as a gap.
    expect(roundGaps([1, 2, 3, 3].map((n) => row({ round: n })))).toEqual([]);
  });

  // Failure caught: contiguity computed over counted rows only, which would
  // report a gap whenever an infra fault occupied a round number.
  it("computes contiguity over DECLARED rounds, including no_verdict rows", () => {
    const rows = [
      row({ round: 1 }),
      row({ round: 2, status: "no_verdict", verdict: null, failureReason: "wrapper_error" }),
      row({ round: 3 }),
    ];
    expect(roundGaps(rows)).toEqual([]);
  });
});
```

Create tests/reviewRounds/filing.test.ts:

<!-- spec-lint: ignore — U+2014 is the documented filing-heading separator (spec §6); the recognizer and its fixtures must carry the literal character -->
```ts
import { describe, expect, it } from "vitest";

import { parseFiling } from "../../lib/reviewRounds/filing";

const FILING = `## diff — 7 rounds

**Examined:** R1-R7, 23 findings.

**Mechanizable:**
- "spec cites a symbol that no longer exists" (R2, R4, R5) —
  extend \`spec:lint\` to resolve every \`file:line\` citation -> BL-SPEC-CITATION-RESOLVE

**Judgment:** R1 scope call on the picker pivot; R6 copy decision.
**Infra:** R3 reaped, no verdict.
`;

describe("filing structure (spec §6)", () => {
  it("extracts stage, declared round count, and cited ids", () => {
    const [section, ...rest] = parseFiling(FILING);
    expect(rest).toEqual([]);
    expect(section?.stage).toBe("diff");
    expect(section?.declaredRounds).toBe(7);
    expect(section?.hasExamined).toBe(true);
    expect(section?.hasDisposition).toBe(true);
    expect(section?.citedIds).toEqual(["BL-SPEC-CITATION-RESOLVE"]);
  });

  // Ratified: `**Mechanizable:** none` is legal and expected (spec §1.1). The
  // filing is a duty to look, not a duty to find.
  it("accepts Mechanizable: none with an Examined line", () => {
    const [s] = parseFiling("## spec — 4 rounds\n\n**Examined:** R1-R4.\n\n**Mechanizable:** none\n");
    expect(s?.hasExamined).toBe(true);
    expect(s?.hasDisposition).toBe(true);
    expect(s?.citedIds).toEqual([]);
  });

  it("reports a missing Examined line", () => {
    const [s] = parseFiling("## spec — 4 rounds\n\n**Mechanizable:** none\n");
    expect(s?.hasExamined).toBe(false);
  });

  it("reports a section with no disposition line at all", () => {
    const [s] = parseFiling("## spec — 4 rounds\n\n**Examined:** R1-R4.\n");
    expect(s?.hasDisposition).toBe(false);
  });

  // Failure caught: two contradictory sections for one stage both passing,
  // with nothing saying which is the filing (spec §7.1 assertion 8).
  it("returns both sections when a stage appears twice", () => {
    const sections = parseFiling(
      "## diff — 4 rounds\n\n**Examined:** a\n**Infra:** b\n\n## diff — 9 rounds\n\n**Examined:** c\n**Infra:** d\n",
    );
    expect(sections.map((s) => s.stage)).toEqual(["diff", "diff"]);
  });

  // Plan resolution R2: the recognizer is narrow on purpose. A bare SHOUTY
  // DEFERRED id is not treated as a citation, so it is neither checked nor
  // wrongly rejected - a conservative under-check, not silent wrongness.
  it("recognizes BL- and DEF- tokens only", () => {
    const [s] = parseFiling(
      "## spec — 4 rounds\n\n**Examined:** a\n**Mechanizable:** BL-ONE, DEF-TWO, PSQL-GUARD-RECALL-RESIDUAL\n",
    );
    expect(s?.citedIds).toEqual(["BL-ONE", "DEF-TWO"]);
  });
});
```

- [ ] **Step 2: Run both to verify they fail**

Run: `pnpm exec vitest run tests/reviewRounds/count.test.ts tests/reviewRounds/filing.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `count.ts`**

Create lib/reviewRounds/count.ts:

```ts
import { isCountedStage, type Stage } from "./constants";
import type { ReviewRoundRow } from "./row";

/**
 * The counting rule is EXACTLY TWO CONJUNCTS (spec §5.4):
 *   status === "verdict"  AND  stage is a counted stage.
 *
 * `failureReason` is deliberately NOT a conjunct. `giveUp()` merges a rollout
 * scrape into the result, so a RECOVERED verdict carries a real verdict
 * alongside failureReason "total_timeout" or "attempts_exhausted" - the
 * reviewer did its work and the verdict was recovered, so it counts.
 */
function bucket(
  rows: ReviewRoundRow[],
  keep: (r: ReviewRoundRow) => boolean,
): Map<Stage, number> {
  const perStage = new Map<Stage, Set<number>>();
  for (const r of rows) {
    if (!keep(r)) continue;
    let set = perStage.get(r.stage);
    if (!set) {
      set = new Set<number>();
      perStage.set(r.stage, set);
    }
    set.add(r.round);
  }
  return new Map([...perStage].map(([stage, set]) => [stage, set.size]));
}

/** Distinct counted `round` values per stage - a parallel wave counts once. */
export function countedRounds(rows: ReviewRoundRow[]): Map<Stage, number> {
  return bucket(rows, (r) => r.status === "verdict" && isCountedStage(r.stage));
}

/** Distinct declared `round` values per stage, regardless of status or stage. */
export function recordedRounds(rows: ReviewRoundRow[]): Map<Stage, number> {
  const perStage = new Map<Stage, number>();
  for (const r of rows) perStage.set(r.stage, (perStage.get(r.stage) ?? 0) + 1);
  return perStage;
}

/**
 * Stages whose DECLARED rounds are not a contiguous 1..N. Computed over every
 * row, not only counted ones: an infra fault legitimately occupies a round
 * number, and excluding it would report a gap on a healthy arc.
 */
export function roundGaps(rows: ReviewRoundRow[]): Stage[] {
  const perStage = new Map<Stage, Set<number>>();
  for (const r of rows) {
    let set = perStage.get(r.stage);
    if (!set) {
      set = new Set<number>();
      perStage.set(r.stage, set);
    }
    set.add(r.round);
  }
  const bad: Stage[] = [];
  for (const [stage, set] of perStage) {
    const sorted = [...set].sort((a, b) => a - b);
    const contiguous = sorted.every((n, i) => n === i + 1);
    if (!contiguous) bad.push(stage);
  }
  return bad;
}
```

- [ ] **Step 4: Write filing.ts**

Create lib/reviewRounds/filing.ts:

<!-- spec-lint: ignore — U+2014 is the documented filing-heading separator (spec §6); the recognizer and its fixtures must carry the literal character -->
```ts
export type FilingSection = {
  stage: string;
  /** The `<n>` in `## <stage> — <n> rounds`, or null when absent/unparseable. */
  declaredRounds: number | null;
  hasExamined: boolean;
  hasDisposition: boolean;
  citedIds: string[];
  /** 1-indexed line of the heading, for a message that names its location. */
  line: number;
};

// `—` (em dash) is the documented separator; `-` and `--` are tolerated so a
// filing is not rejected over a keyboard, which would be prose-quality
// gatekeeping (spec §7.2).
const HEADING = /^##\s+(\S+)\s*(?:—|--|-)\s*(\d+)\s+rounds?\s*$/;
const HEADING_LOOSE = /^##\s+(\S+)\b/;
const DISPOSITIONS = ["Mechanizable", "Judgment", "Infra"] as const;
/**
 * Narrow on purpose (plan R2). DEFERRED entries carry bare SHOUTY ids, and a
 * recognizer wide enough to catch them would classify ordinary prose as a
 * citation. An unrecognized token is not a citation: it is neither checked nor
 * rejected - a conservative under-check, recorded as a documented limit.
 */
const CITED_ID = /\b(?:BL|DEF)-[A-Z0-9][A-Z0-9-]*\b/g;

export function parseFiling(md: string): FilingSection[] {
  const lines = md.split("\n");
  const sections: FilingSection[] = [];
  let current: FilingSection | null = null;
  let body: string[] = [];

  const close = (): void => {
    if (!current) return;
    const text = body.join("\n");
    current.hasExamined = /^\s*\*\*Examined:\*\*/m.test(text);
    current.hasDisposition = DISPOSITIONS.some((d) =>
      new RegExp(`^\\s*\\*\\*${d}:\\*\\*`, "m").test(text),
    );
    current.citedIds = [...new Set(text.match(CITED_ID) ?? [])];
    sections.push(current);
    current = null;
    body = [];
  };

  lines.forEach((line, i) => {
    const strict = HEADING.exec(line);
    const loose = HEADING_LOOSE.exec(line);
    if (strict) {
      close();
      current = {
        stage: strict[1] as string,
        declaredRounds: Number(strict[2]),
        hasExamined: false,
        hasDisposition: false,
        citedIds: [],
        line: i + 1,
      };
    } else if (loose) {
      close();
      current = {
        stage: loose[1] as string,
        declaredRounds: null,
        hasExamined: false,
        hasDisposition: false,
        citedIds: [],
        line: i + 1,
      };
    } else if (current) {
      body.push(line);
    }
  });
  close();
  return sections;
}
```

- [ ] **Step 5: Run both tests to verify they pass**

Run: `pnpm exec vitest run tests/reviewRounds/count.test.ts tests/reviewRounds/filing.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing gate test**

Create tests/docs/_metaReviewRoundEconomy.test.ts. It builds each fixture corpus in a temp dir (`mkdtempSync(join(tmpdir(), …))`, the pattern at `tests/docs/_metaLedgerClaimCollision.test.ts:166`) and runs the checker against it, plus one live pass over the real `docs/review-rounds/`.

<!-- spec-lint: ignore — U+2014 is the documented filing-heading separator (spec §6); the recognizer and its fixtures must carry the literal character -->
```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { checkCorpus, type Problem } from "../../lib/reviewRounds/corpus";
import { ROUND_THRESHOLD } from "../../lib/reviewRounds/constants";

const ROOT = join(__dirname, "..", "..");
const tmpRoots: string[] = [];
afterAll(() => {
  for (const d of tmpRoots) rmSync(d, { recursive: true, force: true });
});

type Fixture = { path: string; body: string };

/** Build a corpus tree and check it. `path` is relative to docs/review-rounds/. */
function check(files: Fixture[]): Problem[] {
  const root = mkdtempSync(join(tmpdir(), "rre-"));
  tmpRoots.push(root);
  for (const f of files) {
    const abs = join(root, "docs", "review-rounds", f.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.body);
  }
  // Resolvable ids are injected so a fixture never depends on the live ledgers.
  return checkCorpus(root, { resolvableIds: new Set(["BL-REAL"]) });
}

const ARC = "feat/foo/aaaaaaaaaaaa";
const row = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    stage: "diff",
    round: 1,
    branch: "feat/foo",
    baseSha: "aaaaaaaaaaaa",
    label: null,
    status: "verdict",
    verdict: "APPROVE",
    failureReason: null,
    findingCount: null,
    startedAt: "2026-08-01T00:00:00.000Z",
    endedAt: "2026-08-01T00:10:00.000Z",
    briefPath: "b.md",
    outDir: "o",
    guardVersion: 1,
    recoveredFrom: null,
    ...over,
  });

const rows = (...overrides: Record<string, unknown>[]): string =>
  overrides.map((o) => row(o)).join("\n") + "\n";

/** Derived from ROUND_THRESHOLD, never a literal - a fixture that cannot reach
 *  the threshold would make the core assertion vacuous. */
const OBLIGING = Array.from({ length: ROUND_THRESHOLD }, (_, i) => ({ round: i + 1 }));
const BELOW = OBLIGING.slice(0, ROUND_THRESHOLD - 1);

const FILING_OK = `## diff — ${ROUND_THRESHOLD} rounds\n\n**Examined:** R1-R${ROUND_THRESHOLD}.\n\n**Mechanizable:** none\n`;

describe("review-round economy gate (spec §7.1)", () => {
  it("FAILS an arc at threshold with no filing - the core assertion", () => {
    const problems = check([{ path: `${ARC}.jsonl`, body: rows(...OBLIGING) }]);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.map((p) => p.kind)).toContain("missing_filing");
  });

  it("PASSES the same arc once the filing exists", () => {
    expect(
      check([
        { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
        { path: `${ARC}.md`, body: FILING_OK },
      ]),
    ).toEqual([]);
  });

  it("PASSES below threshold", () => {
    expect(check([{ path: `${ARC}.jsonl`, body: rows(...BELOW) }])).toEqual([]);
  });

  it("PASSES when the last round is a no_verdict - infra noise must not oblige", () => {
    expect(
      check([
        {
          path: `${ARC}.jsonl`,
          body: rows(...BELOW, {
            round: ROUND_THRESHOLD,
            status: "no_verdict",
            verdict: null,
            failureReason: "attempts_exhausted",
          }),
        },
      ]),
    ).toEqual([]);
  });

  it("PASSES when the last round is a wrapper_error - same status, not a third one", () => {
    expect(
      check([
        {
          path: `${ARC}.jsonl`,
          body: rows(...BELOW, {
            round: ROUND_THRESHOLD,
            status: "no_verdict",
            verdict: null,
            failureReason: "wrapper_error",
          }),
        },
      ]),
    ).toEqual([]);
  });

  // The recovered-verdict case. An implementation reading failureReason: null
  // as part of the counted combination passes every other test here.
  it("FAILS when every round is a recovered verdict with a non-null failureReason", () => {
    const problems = check([
      {
        path: `${ARC}.jsonl`,
        body: rows(...OBLIGING.map((o) => ({ ...o, failureReason: "attempts_exhausted" }))),
      },
    ]);
    expect(problems.map((p) => p.kind)).toContain("missing_filing");
  });

  it("PASSES four task rounds with no filing - a task dispatch is not a review round", () => {
    expect(
      check([
        { path: `${ARC}.jsonl`, body: rows(...OBLIGING.map((o) => ({ ...o, stage: "task" }))) },
      ]),
    ).toEqual([]);
  });

  // Failure caught: a filing SECTION for a stage the spec permits no filing
  // for. Spec §6 item 1 admits only spec, plan and diff; `task` rows are
  // recorded and never counted (spec §5.1), so a task filing is a category
  // error rather than a miscount. Every check downstream of the heading waved
  // it through: `recorded.get("task")` is 4, so stage_without_rows stayed
  // quiet, and `counted.get("task") ?? 0` is 0 against the declared 0, so
  // count_mismatch did too. The case directly above cannot catch it - that one
  // has no filing at all - so the gate returned CLEAN on a structurally
  // invalid filing, which is the binding gate blessing what the spec forbids.
  it("FAILS a filing section for a stage that carries no filings", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING.map((o) => ({ ...o, stage: "task" }))) },
      { path: `${ARC}.md`, body: "## task — 0 rounds\n\n**Examined:** R1-R4.\n**Infra:** none\n" },
    ]);
    // A green result here IS the defect, and the kind is what separates the fix
    // from a coincidental failure on some other check.
    expect(problems).not.toEqual([]);
    expect(problems.map((p) => p.kind)).toContain("stage_not_filable");
  });

  it("PASSES a parallel wave whose distinct rounds are below threshold", () => {
    expect(
      check([{ path: `${ARC}.jsonl`, body: rows({ round: 1 }, { round: 2 }, { round: 3 }, { round: 3 }, { round: 3 }) }]),
    ).toEqual([]);
  });

  it("FAILS on a round gap", () => {
    const problems = check([{ path: `${ARC}.jsonl`, body: rows({ round: 1 }, { round: 2 }, { round: 4 }) }]);
    expect(problems.map((p) => p.kind)).toContain("round_gap");
  });

  it("FAILS when a filing cites an unresolvable id", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
      {
        path: `${ARC}.md`,
        body: `## diff — ${ROUND_THRESHOLD} rounds\n\n**Examined:** a\n\n**Mechanizable:** BL-NOT-A-REAL-ID\n`,
      },
    ]);
    expect(problems.map((p) => p.kind)).toContain("unresolved_id");
  });

  it("PASSES when the cited id resolves", () => {
    expect(
      check([
        { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
        {
          path: `${ARC}.md`,
          body: `## diff — ${ROUND_THRESHOLD} rounds\n\n**Examined:** a\n\n**Mechanizable:** BL-REAL\n`,
        },
      ]),
    ).toEqual([]);
  });

  it("FAILS a filing section naming a stage with zero rows - catches copy-paste between arcs", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
      { path: `${ARC}.md`, body: `${FILING_OK}\n## spec — 4 rounds\n\n**Examined:** a\n**Infra:** b\n` },
    ]);
    expect(problems.map((p) => p.kind)).toContain("stage_without_rows");
  });

  it("FAILS a filing missing its Examined line", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
      { path: `${ARC}.md`, body: `## diff — ${ROUND_THRESHOLD} rounds\n\n**Mechanizable:** none\n` },
    ]);
    expect(problems.map((p) => p.kind)).toContain("filing_malformed");
  });

  // Failure caught: a heading with NO round count passing over an obliging
  // corpus. `HEADING_LOOSE` builds a section with `declaredRounds: null`; its
  // presence suppressed `missing_filing`, both body-field checks pass on this
  // body, and `count_mismatch` skipped `null` - so a structurally nonconforming
  // filing was reported compliant. Every other case in this describe would
  // still pass, which is exactly how the hole shipped.
  it("FAILS a filing heading that carries no round count", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
      { path: `${ARC}.md`, body: "## diff\n\n**Examined:** R1-R4.\n**Mechanizable:** none\n" },
    ]);
    // Not merely "some problem": a green result here is the defect, and the
    // kind is what distinguishes the fix from a coincidental failure.
    expect(problems).not.toEqual([]);
    expect(problems.map((p) => p.kind)).toContain("filing_malformed");
  });

  it("FAILS a malformed JSON row, naming file and line", () => {
    const problems = check([{ path: `${ARC}.jsonl`, body: `${row()}\n{not json\n` }]);
    const bad = problems.find((p) => p.kind === "malformed_row");
    expect(bad).toBeDefined();
    expect(bad?.message).toContain(`${ARC}.jsonl`);
    expect(bad?.message).toContain("line 2");
  });

  // A flat walk misses this, which is how the defect shipped in spec draft 1.
  it("FAILS an obliged arc nested two levels deep", () => {
    const problems = check([
      { path: "feat/deep/nested/bbbbbbbbbbbb.jsonl", body: rows(...OBLIGING.map((o) => ({ ...o, branch: "feat/deep/nested", baseSha: "bbbbbbbbbbbb" }))) },
    ]);
    expect(problems.map((p) => p.kind)).toContain("missing_filing");
  });

  // Failure caught: a later arc inheriting a merged arc's filing. This is the
  // reason arc identity is (branch, baseSha) and not branch alone.
  it("FAILS the new arc when an older arc on the same branch has the filing", () => {
    const old = "feat/reused/aaaaaaaaaaaa";
    const fresh = "feat/reused/cccccccccccc";
    const problems = check([
      { path: `${old}.jsonl`, body: rows(...OBLIGING.map((o) => ({ ...o, branch: "feat/reused" }))) },
      { path: `${old}.md`, body: FILING_OK },
      { path: `${fresh}.jsonl`, body: rows(...OBLIGING.map((o) => ({ ...o, branch: "feat/reused", baseSha: "cccccccccccc" }))) },
    ]);
    expect(problems.some((p) => p.kind === "missing_filing" && p.message.includes("cccccccccccc"))).toBe(true);
  });

  it("FAILS a row whose branch or baseSha disagrees with its containing path", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows({ round: 1, branch: "feat/wrong" }) },
    ]);
    expect(problems.map((p) => p.kind)).toContain("identity_mismatch");
  });

  it("FAILS a filing heading whose round count contradicts the corpus", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
      { path: `${ARC}.md`, body: `## diff — 999 rounds\n\n**Examined:** a\n**Infra:** b\n` },
    ]);
    expect(problems.map((p) => p.kind)).toContain("count_mismatch");
  });

  it("FAILS two sections for one stage", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
      { path: `${ARC}.md`, body: `${FILING_OK}\n${FILING_OK}` },
    ]);
    expect(problems.map((p) => p.kind)).toContain("duplicate_section");
  });

  // The case a .jsonl-first walk never visits, which makes the orphan check
  // vacuous in exactly the situation it exists for.
  it("FAILS an orphan filing with no corpus beside it", () => {
    const problems = check([{ path: `${ARC}.md`, body: FILING_OK }]);
    expect(problems.map((p) => p.kind)).toContain("orphan_filing");
  });

  // Failure caught: a walk keyed on "any .md" reports the corpus README as a
  // permanent orphan, so the live-corpus test can never be green once Task 12
  // ships the README. Discovery is keyed on the <baseSha12> filename shape
  // that §5.2 already requires.
  it("PASSES a README and other non-arc-shaped files in the corpus tree", () => {
    expect(
      check([
        { path: "README.md", body: "# Review rounds\n\nWhat this directory is.\n" },
        { path: "feat/notes.md", body: "scratch\n" },
        { path: `${ARC}.jsonl`, body: rows(...BELOW) },
      ]),
    ).toEqual([]);
  });

  // Failure caught: a filing whose stem is not a merge base at all. The loose
  // "any .md" walk accepted this silently; the shape key rejects it.
  it("FAILS a filing whose stem is not a 12-hex merge base", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
      { path: "feat/foo/my-notes.md", body: FILING_OK },
    ]);
    // The real arc still owes a filing, because my-notes.md is not one.
    expect(problems.map((p) => p.kind)).toContain("missing_filing");
  });

  // Fails-by-default: a NEW arc dropped in is covered without editing the test.
  it("FAILS a brand-new fixture arc with no filing, without any test edit", () => {
    const problems = check([
      { path: "chore/brand-new/dddddddddddd.jsonl", body: rows(...OBLIGING.map((o) => ({ ...o, branch: "chore/brand-new", baseSha: "dddddddddddd" }))) },
    ]);
    expect(problems.map((p) => p.kind)).toContain("missing_filing");
  });
});

describe("live corpus", () => {
  it("is clean", () => {
    // Discovered from disk: a new arc's files are covered by default and can
    // never be silently exempt. Empty today (spec §12 - this arc is
    // pre-adoption by construction), which is a legal clean state.
    expect(checkCorpus(ROOT)).toEqual([]);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `pnpm exec vitest run tests/docs/_metaReviewRoundEconomy.test.ts`
Expected: FAIL — `Cannot find module '../../lib/reviewRounds/corpus'`.

- [ ] **Step 8: Write corpus.ts**

Create lib/reviewRounds/corpus.ts:

```ts
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import {
  bodyDefinedIds,
  ledgerIds,
  type ExtractOpts,
} from "../../tests/docs/_ledgerMdast";
import { CORPUS_DIR } from "./arc";
import { COUNTED_STAGES, isCountedStage, ROUND_THRESHOLD, type Stage } from "./constants";
import { countedRounds, recordedRounds, roundGaps } from "./count";
import { parseFiling, type FilingSection } from "./filing";
import { parseRow, type ReviewRoundRow } from "./row";

export type ProblemKind =
  | "malformed_row"
  | "identity_mismatch"
  | "round_gap"
  | "missing_filing"
  | "filing_malformed"
  | "unresolved_id"
  | "stage_not_filable"
  | "stage_without_rows"
  | "count_mismatch"
  | "duplicate_section"
  | "orphan_filing";

export type Problem = { kind: ProblemKind; message: string };

export type Arc = {
  /** Repo-relative directory holding the arc's files. */
  dir: string;
  branch: string;
  baseSha: string;
  /** Repo-relative, or null when the arc has only a filing. */
  corpusPath: string | null;
  filingPath: string | null;
  rows: ReviewRoundRow[];
  malformed: { line: number; problem: string }[];
  filingText: string | null;
};

/**
 * Discovery is keyed on the FILENAME SHAPE arc identity already defines (spec
 * §5.2), over BOTH extensions. Two reasons, and dropping either breaks a real
 * case:
 *
 *  - Both extensions, because a `.jsonl`-first walk that reaches for a sibling
 *    never VISITS an orphan filing, which makes the orphan check vacuous in
 *    exactly the situation it exists for.
 *  - Shape-keyed rather than "any .md", because docs/review-rounds/README.md has
 *    no sibling corpus and would be reported as an orphan forever - the live
 *    corpus check could never be green once Task 12 ships it.
 *
 * The shape is not a new convention. It is the one the writer already produces,
 * so keying on it additionally rejects a filing whose stem is not a merge base
 * at all, which a loose walk would have accepted silently.
 */
const ARC_FILE = /^([0-9a-f]{12})\.(jsonl|md)$/;

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (entry.isFile() && ARC_FILE.test(entry.name)) out.push(abs);
  }
}

/**
 * Every arc under `docs/review-rounds/`, discovered from disk so a NEW arc is
 * covered by default rather than silently exempt. An absent corpus directory is
 * a legal clean state (spec §12), not a failure.
 */
export function readArcs(root: string): Arc[] {
  const base = join(root, CORPUS_DIR);
  if (!existsSync(base)) return [];

  const files: string[] = [];
  walk(base, files);

  const byArc = new Map<string, Arc>();
  for (const abs of files.sort()) {
    const segments = relative(base, abs).split(sep);
    const name = segments[segments.length - 1] ?? "";
    const match = ARC_FILE.exec(name);
    if (match === null) continue;
    const baseSha = match[1] ?? "";
    // The branch is the nested path, never a slug: flattening `/` to `-` would
    // collide two branches differing only there.
    const branch = segments.slice(0, -1).join("/");
    const key = `${branch}\u0000${baseSha}`;

    let arc = byArc.get(key);
    if (arc === undefined) {
      arc = {
        dir: [CORPUS_DIR, ...segments.slice(0, -1)].join("/"),
        branch,
        baseSha,
        corpusPath: null,
        filingPath: null,
        rows: [],
        malformed: [],
        filingText: null,
      };
      byArc.set(key, arc);
    }

    const relPath = [CORPUS_DIR, ...segments].join("/");
    const text = readFileSync(abs, "utf8");
    if (match[2] === "jsonl") {
      arc.corpusPath = relPath;
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        if (line.trim() === "") continue;
        const parsed = parseRow(line);
        if (parsed.ok) arc.rows.push(parsed.row);
        else arc.malformed.push({ line: i + 1, problem: parsed.problem });
      }
    } else {
      arc.filingPath = relPath;
      arc.filingText = text;
    }
  }
  return [...byArc.values()];
}

const BACKLOG_OPTS: ExtractOpts = { requirePrefix: "BL-", levels: [2, 3] };
const DEFERRED_OPTS: ExtractOpts = { requirePrefix: null, levels: [3] };
const LEDGERS: readonly (readonly [string, ExtractOpts])[] = [
  ["BACKLOG.md", BACKLOG_OPTS],
  ["BACKLOG-archive.md", BACKLOG_OPTS],
  ["DEFERRED.md", DEFERRED_OPTS],
  ["DEFERRED-archive.md", DEFERRED_OPTS],
];

/**
 * The resolvable-id set, over all four ledgers under BOTH option sets (plan R2).
 * DEFERRED entries carry bare SHOUTY ids, so the production `definedIds` helper
 * - which resolves every ledger under BACKLOG_OPTS - collects only `BL-` ids.
 *
 * It deliberately does NOT import `definedIds` from
 * tests/docs/_metaLedgerReferentialIntegrity.test.ts: that symbol is exported
 * from a `*.test.ts` module, and importing it re-registers that file's whole
 * suite inside this one.
 */
export function liveLedgerIds(root: string): Set<string> {
  const out = new Set<string>();
  for (const [file, opts] of LEDGERS) {
    const abs = join(root, file);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, "utf8");
    for (const id of ledgerIds(text, opts)) out.add(id);
    for (const id of bodyDefinedIds(text, opts)) out.add(id);
  }
  return out;
}

export function checkCorpus(
  root: string,
  opts: { resolvableIds?: Set<string> } = {},
): Problem[] {
  const problems: Problem[] = [];
  // `??` short-circuits, so a fixture root with no ledgers never reads one.
  const resolvable = opts.resolvableIds ?? liveLedgerIds(root);

  for (const arc of readArcs(root)) {
    for (const bad of arc.malformed) {
      // A malformed row swallowed as an empty corpus reads as "this arc ran no
      // rounds", which reports an obliged arc as compliant.
      problems.push({
        kind: "malformed_row",
        message: `${arc.corpusPath}: line ${bad.line} is not a valid row: ${bad.problem}`,
      });
    }

    if (arc.corpusPath === null) {
      problems.push({
        kind: "orphan_filing",
        message: `${arc.filingPath}: a filing with no corpus beside it, so nothing says which rounds it describes`,
      });
      continue;
    }

    for (const row of arc.rows) {
      if (row.branch === arc.branch && row.baseSha === arc.baseSha) continue;
      problems.push({
        kind: "identity_mismatch",
        message: `${arc.corpusPath}: a row declares (${row.branch}, ${row.baseSha}) but its path says (${arc.branch}, ${arc.baseSha})`,
      });
    }

    for (const stage of roundGaps(arc.rows)) {
      problems.push({
        kind: "round_gap",
        message: `${arc.corpusPath}: stage ${stage} declares rounds that are not a contiguous 1..N`,
      });
    }

    const counted = countedRounds(arc.rows);
    const recorded = recordedRounds(arc.rows);
    const sections = arc.filingText === null ? [] : parseFiling(arc.filingText);
    const byStage = new Map<string, FilingSection[]>();
    for (const section of sections) {
      const group = byStage.get(section.stage);
      if (group) group.push(section);
      else byStage.set(section.stage, [section]);
    }

    const filingPath = `${arc.corpusPath.slice(0, -".jsonl".length)}.md`;
    for (const [stage, n] of counted) {
      if (n < ROUND_THRESHOLD) continue;
      if ((byStage.get(stage) ?? []).length > 0) continue;
      // The baseSha is in the message so a reused branch name cannot leave a
      // reader guessing WHICH arc owes the filing.
      problems.push({
        kind: "missing_filing",
        message: `${arc.branch} ${arc.baseSha}: stage ${stage} burned ${n} counted rounds and has no filing section (expected ${filingPath})`,
      });
    }

    for (const [stage, group] of byStage) {
      if (group.length > 1) {
        problems.push({
          kind: "duplicate_section",
          message: `${arc.filingPath}: ${group.length} sections for stage ${stage}, and nothing says which is the filing`,
        });
      }
      for (const section of group) {
        // Spec §6 item 1: only spec, plan and diff are filable. `task` rows are
        // RECORDED and never COUNTED (spec §5.1), so a `task` section is a
        // CATEGORY ERROR rather than a miscount - and every check below waves
        // it through. Against four contiguous `task` rows and a heading of
        // `## task - 0 rounds`: `recorded.get("task")` is 4, so
        // stage_without_rows does not fire, and `counted.get("task") ?? 0` is 0
        // against a declared 0, so count_mismatch does not either. checkCorpus
        // returned CLEAN on a filing the spec forbids. Checked before the
        // heading's count, because a section for a stage that cannot be filed
        // has no count worth reading.
        if (!isCountedStage(stage)) {
          problems.push({
            kind: "stage_not_filable",
            message: `${arc.filingPath}:${section.line}: stage ${stage} carries no filing; only ${[...COUNTED_STAGES].join(", ")} are counted stages`,
          });
          continue;
        }
        // Spec §6 item 1: the heading CARRIES its round count. A loose heading
        // (`## diff`) parses to `declaredRounds: null`, and until this check
        // existed that section satisfied the filing duty by merely being there:
        // its presence suppressed `missing_filing`, both body-field checks
        // passed, and the count check below skipped `null` outright. A
        // structurally nonconforming filing was reported compliant over four
        // counted rounds - silent wrongness, the one outcome the consequence
        // bound forbids. Reported here rather than ALSO as `missing_filing`,
        // because "this section's heading is malformed" and "there is no
        // section" cannot both be true of the same section, and the gate blocks
        // on either one.
        const declared = section.declaredRounds;
        if (declared === null) {
          problems.push({
            kind: "filing_malformed",
            message: `${arc.filingPath}:${section.line}: stage ${stage} heading declares no round count; the heading must carry "<n> rounds"`,
          });
          continue;
        }
        if (!section.hasExamined || !section.hasDisposition) {
          problems.push({
            kind: "filing_malformed",
            message: `${arc.filingPath}:${section.line}: stage ${stage} needs an **Examined:** line and at least one disposition line`,
          });
          continue;
        }
        if ((recorded.get(stage as Stage) ?? 0) === 0) {
          // Catches a filing copy-pasted between arcs: a section for a stage
          // this arc never dispatched.
          problems.push({
            kind: "stage_without_rows",
            message: `${arc.filingPath}:${section.line}: stage ${stage} has no rows in this arc's corpus`,
          });
          continue;
        }
        const expected = counted.get(stage as Stage) ?? 0;
        if (declared !== expected) {
          problems.push({
            kind: "count_mismatch",
            message: `${arc.filingPath}:${section.line}: stage ${stage} declares ${declared} rounds; the corpus counts ${expected}`,
          });
        }
      }
    }

    for (const section of sections) {
      for (const id of section.citedIds) {
        if (resolvable.has(id)) continue;
        problems.push({
          kind: "unresolved_id",
          message: `${arc.filingPath}:${section.line}: cited id ${id} resolves against no ledger entry`,
        });
      }
    }
  }
  return problems;
}
```

Two shapes in there are load-bearing and easy to lose. The `malformed_row` message carries the repo-relative path **and** the 1-indexed line, because a gate that says only "a row is bad" costs the reader a manual scan of a file the tooling wrote. And the section checks `continue` after each problem, so one malformed section does not also report a count mismatch computed from a heading nobody can trust.

**The two heading checks LEAD that loop, in that order, and the ordering is the fix rather than an accident.** Spec §6 item 1 makes a filing heading carry two facts — a filable stage, and a round count — and until these checks existed a section discharged the filing duty by merely being present. Both holes have the same shape. `HEADING_LOOSE` exists so a filing is not rejected over a keyboard, but the section it builds carries `declaredRounds: null`, and every downstream check was permissive about `null`: `missing_filing` was suppressed by the section's mere presence, `hasExamined` / `hasDisposition` are body facts that a loose heading does not affect, and `count_mismatch` skipped `null` explicitly — so a four-round arc filing a bare `## diff` heading passed. A heading naming an unfilable stage (`## task — 0 rounds`) passed for the mirror-image reason: the stage was never checked against `COUNTED_STAGES` at all, and on a stage whose rows are recorded but never counted the two count checks positively agree with each other — `stage_without_rows` sees four recorded rows, `count_mismatch` compares a declared 0 against a counted 0. Running the stage check first and the count check second, each with a `continue`, makes both heading facts preconditions for reading anything else out of that section — which is what §6 item 1 already said the heading was for. The stage check leads because a section for a stage that carries no filing is not a filing at all, so its round count is not worth reading.

- [ ] **Step 9: Run the gate to verify it passes**

Run: `pnpm exec vitest run tests/docs/_metaReviewRoundEconomy.test.ts`
Expected: PASS (26 cases).

- [ ] **Step 10: Typecheck and run the docs suite**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run tests/docs/ tests/reviewRounds/`
Expected: 0 type errors; all green.

- [ ] **Step 11: Commit**

```bash
git add lib/reviewRounds/count.ts lib/reviewRounds/filing.ts lib/reviewRounds/corpus.ts \
        tests/reviewRounds/count.test.ts tests/reviewRounds/filing.test.ts \
        tests/docs/_metaReviewRoundEconomy.test.ts
git commit -m "feat(review-rounds): merge gate obliging a filing at four counted rounds"
```

---

### Task 7: Merged-arc producer

**Files:**
- Create: lib/reviewRounds/mergedArcs.ts
- Create: tests/reviewRounds/report.test.ts

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `mergedArcs(repoRoot: string): { shallow: boolean; recognized: MergedArc[]; unrecognized: { sha: string; subject: string }[] }` where `MergedArc = { sha: string; branch: string; baseSha: string; mergedAt: string }`.

**This layer must NOT be a real-history test** (spec §11.3). CI checks out at depth 1 and fetches only `origin/main` at depth 1 (`.github/workflows/unit-suite.yml:152`); a layer-1 test reading the live log derives expectations from truncated history and passes over zero or one merge — a vacuous pass wearing a real-history costume.

- [ ] **Step 1: Write the failing test**

Create tests/reviewRounds/report.test.ts:

```ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { mergedArcs } from "../../lib/reviewRounds/mergedArcs";

const g = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/**
 * One repo carrying every shape the accept-set must decide (spec §11.3 layer 1):
 * the standard PR-merge subject, the second spelling, main merged INTO a
 * feature branch, a non-first-parent merge, an unrecognized subject, and a
 * branch whose main advanced after divergence.
 */
function fixtureRepo(): { dir: string; advancedBase: string } {
  const dir = mkdtempSync(join(tmpdir(), "merged-arcs-"));
  g(dir, "init", "-q", "-b", "main");
  g(dir, "config", "user.email", "t@example.com");
  g(dir, "config", "user.name", "T");
  const commit = (name: string, msg: string): void => {
    writeFileSync(join(dir, name), `${name}\n`);
    g(dir, "add", name);
    g(dir, "commit", "-qm", msg);
  };
  commit("seed.txt", "seed");

  // (a) standard PR merge, nested branch name
  g(dir, "checkout", "-q", "-b", "feat/nested-name");
  commit("a.txt", "a");
  g(dir, "checkout", "-q", "main");
  g(dir, "merge", "-q", "--no-ff", "feat/nested-name", "-m",
    "Merge pull request #101 from owner/feat/nested-name");

  // (b) second spelling
  g(dir, "checkout", "-q", "-b", "chore/second-spelling");
  commit("b.txt", "b");
  g(dir, "checkout", "-q", "main");
  g(dir, "merge", "-q", "--no-ff", "chore/second-spelling", "-m",
    "Merge PR #102: chore/second-spelling - a thing");

  // (c) main advances, THEN the branch merges - first parent != merge base
  g(dir, "checkout", "-q", "-b", "feat/advanced-main");
  commit("c.txt", "c");
  const advancedBase = g(dir, "merge-base", "main", "feat/advanced-main");
  g(dir, "checkout", "-q", "main");
  commit("d.txt", "main advances");
  g(dir, "merge", "-q", "--no-ff", "feat/advanced-main", "-m",
    "Merge pull request #103 from owner/feat/advanced-main");

  // (d) main merged INTO a feature branch - NOT a merged feature arc.
  // main MUST advance first. Without that, merging main into the branch is
  // already-up-to-date and creates NO COMMIT AT ALL, so the fixture holds zero
  // non-first-parent merges and a producer that omits --first-parent passes
  // the exclusion assertion vacuously.
  g(dir, "checkout", "-q", "-b", "feat/took-main");
  commit("e.txt", "e");
  g(dir, "checkout", "-q", "main");
  commit("e2.txt", "main advances again");
  g(dir, "checkout", "-q", "feat/took-main");
  g(dir, "merge", "-q", "--no-ff", "main", "-m", "Merge branch 'main' into feat/took-main");
  g(dir, "checkout", "-q", "main");

  // (e) a first-parent merge with an unrecognized subject
  g(dir, "checkout", "-q", "-b", "feat/mystery");
  commit("f.txt", "f");
  g(dir, "checkout", "-q", "main");
  g(dir, "merge", "-q", "--no-ff", "feat/mystery", "-m", "combine the mystery work");

  // (f) the LIVE ambiguous residue, copied from this repository's history: a
  // second-spelling subject whose first token IS a valid git branch name and
  // is NOT a branch. `git check-ref-format --branch M12.2` exits 0, so a
  // recognizer keyed on git-validity invents this branch instead of reporting
  // the residue.
  g(dir, "checkout", "-q", "-b", "feat/ambiguous-subject");
  commit("g.txt", "g");
  g(dir, "checkout", "-q", "main");
  g(dir, "merge", "-q", "--no-ff", "feat/ambiguous-subject", "-m",
    "Merge PR #4: M12.2 Phase B1 - admin nav shell + settings shell");

  return { dir, advancedBase };
}

describe("merged-arc producer (spec §9, §11.3 layer 1)", () => {
  const { dir, advancedBase } = fixtureRepo();
  const result = mergedArcs(dir);

  it("recognizes both PR-merge spellings", () => {
    const branches = result.recognized.map((a) => a.branch);
    expect(branches).toContain("feat/nested-name");
    expect(branches).toContain("chore/second-spelling");
  });

  // Failure caught: joining `nested-name` against a corpus stored at
  // `feat/nested-name`, so fully-recorded arcs come back as silent. 607 of the
  // 676 recognized merges in real history name a nested branch.
  it("extracts the WHOLE branch path after owner/, not the last component", () => {
    const arc = result.recognized.find((a) => a.branch.endsWith("nested-name"));
    expect(arc?.branch).toBe("feat/nested-name");
    expect(arc?.branch).not.toBe("nested-name");
  });

  // Failure caught: using the merge's first parent as baseSha. Measured on
  // real history, four of seven merges on the three reused branch names differ.
  it("reconstructs baseSha as merge-base of both parents, not the first parent", () => {
    const arc = result.recognized.find((a) => a.branch === "feat/advanced-main");
    expect(arc).toBeDefined();
    // Derived from the fixture repo, never a literal.
    expect(arc?.baseSha).toBe(advancedBase.slice(0, 12));
    const firstParent = g(dir, "rev-parse", `${arc?.sha}^1`);
    expect(arc?.baseSha).not.toBe(firstParent.slice(0, 12));
  });

  // Failure caught: inventing hundreds of silent arcs that never existed. In
  // real history 239 of 916 merges are main merged INTO a feature branch.
  it("excludes main-merged-into-branch from the recognized set", () => {
    expect(result.recognized.map((a) => a.branch)).not.toContain("main");
    expect(result.unrecognized.map((u) => u.subject)).not.toContain(
      expect.stringContaining("Merge branch 'main' into"),
    );
  });

  // Failure caught: a residue silently dropped. Real history's single residue
  // - `Merge PR #4: …` - is a genuine PR merge in a second spelling, which is
  // exactly why the residue must be reported rather than assumed empty.
  it("reports the unrecognized residue BY SUBJECT, never dropping it", () => {
    expect(result.unrecognized.map((u) => u.subject)).toContain("combine the mystery work");
    expect(result.unrecognized.every((u) => u.sha.length > 0)).toBe(true);
  });

  // Failure caught: a recognizer keyed on git-validity inventing the branch
  // `M12.2` from the live residue subject, joining the corpus against a branch
  // that never existed and suppressing the one commit §9 requires be reported.
  it("does NOT invent a branch from a second-spelling subject with no slash", () => {
    expect(result.recognized.map((a) => a.branch)).not.toContain("M12.2");
    expect(result.unrecognized.map((u) => u.subject)).toContain(
      "Merge PR #4: M12.2 Phase B1 - admin nav shell + settings shell",
    );
    // Pin the premise, so this test cannot rot into a tautology if git changes:
    // ordinary git validation ACCEPTS the token, which is why validity is not
    // the discriminator.
    expect(() =>
      execFileSync("git", ["check-ref-format", "--branch", "M12.2"], { cwd: dir }),
    ).not.toThrow();
  });

  // Failure caught: a producer that omits --first-parent. Requires the fixture
  // to actually CONTAIN a non-first-parent merge, which it only does because
  // main advances before feat/took-main merges it.
  it("has a real non-first-parent merge in the fixture and excludes it", () => {
    const all = g(dir, "log", "--merges", "--format=%H").split("\n").filter(Boolean);
    const firstParent = g(dir, "log", "--merges", "--first-parent", "main", "--format=%H")
      .split("\n")
      .filter(Boolean);
    // Derived from the fixture, not asserted as a literal count.
    expect(all.length).toBeGreaterThan(firstParent.length);
    expect(result.recognized.map((a) => a.branch)).not.toContain("feat/took-main");
  });

  it("reports the repository as not shallow", () => {
    expect(result.shallow).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/reviewRounds/report.test.ts`
Expected: FAIL — `Cannot find module '../../lib/reviewRounds/mergedArcs'`.

- [ ] **Step 3: Implement the producer**

Create lib/reviewRounds/mergedArcs.ts. Every rule below is traceable to a measured number in spec §9:

```ts
import { execFileSync } from "node:child_process";

export type MergedArc = { sha: string; branch: string; baseSha: string; mergedAt: string };
export type UnrecognizedMerge = { sha: string; subject: string };
export type MergedArcsResult = {
  shallow: boolean;
  recognized: MergedArc[];
  unrecognized: UnrecognizedMerge[];
};

/** ASCII unit separator: a subject can contain anything except this. */
const FIELD_SEP = "\u001f";

function git(repoRoot: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** The standard GitHub merge subject. Branch is the WHOLE path after `owner/`. */
const PULL_REQUEST = /^Merge pull request #\d+ from [^/\s]+\/(.+)$/;

/**
 * The second spelling. The capture MUST contain a `/`.
 *
 * "Parses as a branch name" is NOT a sufficient test. The one real residue in
 * this repository's history is `Merge PR #4: M12.2 Phase B1 ...`, and
 * `git check-ref-format --branch M12.2` EXITS 0 - ordinary git validation
 * accepts the token. A recognizer keyed on git-validity therefore invents the
 * branch `M12.2`, joins the corpus against a branch that never existed, and
 * silently converts the one commit §9 requires be REPORTED into a fictitious
 * arc. Requiring a `/` keeps it in the residue, which is where §9 measured it.
 */
const SECOND_SPELLING = /^Merge PR #\d+: (\S+\/\S+)/;

export function mergedArcs(repoRoot: string): MergedArcsResult {
  // First, and unconditional. A shallow clone presents truncated history as
  // complete, and depth-1 is the NORMAL CI state - a scan that answers from it
  // is a partial answer labelled complete, which is the §8.2 failure.
  if (git(repoRoot, ["rev-parse", "--is-shallow-repository"]) === "true") {
    return { shallow: true, recognized: [], unrecognized: [] };
  }

  // `--first-parent`, not bare `--merges`: 239 of 916 real merge commits are
  // main merged INTO a feature branch, and counting those would invent hundreds
  // of silent arcs that never existed.
  const log = git(repoRoot, [
    "log",
    "--merges",
    "--first-parent",
    "main",
    "--format=%H%x1f%s%x1f%cI",
  ]);

  const recognized: MergedArc[] = [];
  const unrecognized: UnrecognizedMerge[] = [];
  for (const line of (log ?? "").split("\n")) {
    if (line.trim() === "") continue;
    const fields = line.split(FIELD_SEP);
    const sha = fields[0] ?? "";
    const subject = fields[1] ?? "";
    const mergedAt = fields[2] ?? "";

    // An ACCEPT-set over subjects, keyed on structure. A denylist would accept
    // whatever it failed to model, which is how a residue becomes an invention.
    const branch = PULL_REQUEST.exec(subject)?.[1] ?? SECOND_SPELLING.exec(subject)?.[1] ?? null;
    if (branch === null) {
      // Reported BY SUBJECT, never dropped and never guessed at.
      unrecognized.push({ sha, subject });
      continue;
    }

    // NEVER the first parent, which equals the merge base only when main did not
    // advance after the branch diverged. Measured on real history: four of the
    // seven merges on the three reused branch names differ.
    const base = git(repoRoot, ["merge-base", `${sha}^1`, `${sha}^2`]);
    if (base === null || base.length < 12) {
      // A merge without two reachable parents has no reconstructible base, so it
      // is residue rather than an arc with a guessed identity.
      unrecognized.push({ sha, subject });
      continue;
    }
    recognized.push({ sha, branch, baseSha: base.slice(0, 12), mergedAt });
  }
  return { shallow: false, recognized, unrecognized };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/reviewRounds/report.test.ts`
Expected: PASS (6 cases).

- [ ] **Step 5: Wire the new test directory into the parallel project**

`BASE_INCLUDE` (`vitest.projects.ts:34`) is `tests/**/*.test.ts`, so tests/reviewRounds/ is already **run** — by the `serial` project, inside `unit-suite-db`, which boots a database these pure tests never touch. Add to `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:94`), beside the existing `tests/docs/**` entry:

```ts
  "tests/reviewRounds/**/*.test.{ts,tsx}",
```

Verify the file actually moved projects rather than trusting the edit:

```bash
pnpm exec vitest run --project=parallel tests/reviewRounds/ --reporter=basic
pnpm exec vitest list --project=serial 2>/dev/null | grep reviewRounds && echo "STILL SERIAL - glob not applied"
```

Expected: the parallel run collects the new files; the serial grep prints nothing.

- [ ] **Step 6: Commit**

```bash
git add lib/reviewRounds/mergedArcs.ts tests/reviewRounds/report.test.ts vitest.projects.ts
git commit -m "feat(review-rounds): merged-arc producer with declared accept-set"
```

---

### Task 8: The report

**Files:**
- Create: scripts/review-economy.ts
- Modify: `package.json` (add `"review:economy": "tsx scripts/review-economy.ts"` beside `"ledger:claims"` at `package.json:28`)
- Modify: tests/reviewRounds/report.test.ts

**Interfaces:**
- Consumes: `readArcs`/`checkCorpus` inputs (Task 6), `countedRounds`/`recordedRounds` (Task 6), `mergedArcs` (Task 7), `ROUND_THRESHOLD` (Task 2).
- Produces: `buildReport(repoRoot: string, opts?: ReportOptions): Report` and a CLI that prints it. Read-only; gates nothing; exit 0 always except on its own usage error.

**Every output §9 promises gets behavioral coverage.** "Read-only" buys no test relief — the report presents its output as fact.

- [ ] **Step 1: Write the failing tests**

Append to tests/reviewRounds/report.test.ts — one describe per §9 output, each fixture-driven.

**tests/reviewRounds/report.test.ts has ONE import section**, written by Task 7. This step does not repeat it: `execFileSync`, `mkdtempSync`, `writeFileSync`, `tmpdir`, `join`, `describe`/`expect`/`it`, and `mergedArcs` are already imported there, and re-declaring any of them is a duplicate-identifier error, not a no-op. The two existing `node:` lines are extended in place and two new lines are added, so the section's changed lines read:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { adoptionBoundary, ROUND_THRESHOLD } from "../../lib/reviewRounds/constants";
import { buildReport } from "../../scripts/review-economy";
```

Then append the bodies to tests/reviewRounds/report.test.ts:

```ts
/** Plant a corpus tree under `root` and return `root`. Paths are relative to
 *  docs/review-rounds/, exactly as on disk. */
function corpus(root: string, files: { path: string; body: string }[]): string {
  for (const f of files) {
    const abs = join(root, "docs", "review-rounds", f.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.body);
  }
  return root;
}

const jrow = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    stage: "diff",
    round: 1,
    branch: "feat/foo",
    baseSha: "aaaaaaaaaaaa",
    label: null,
    status: "verdict",
    verdict: "APPROVE",
    failureReason: null,
    findingCount: null,
    startedAt: "2026-09-03T00:00:00.000Z",
    endedAt: "2026-09-03T00:10:00.000Z",
    briefPath: "b.md",
    outDir: "o",
    guardVersion: 1,
    recoveredFrom: null,
    ...over,
  });

const jrows = (...o: Record<string, unknown>[]): string => o.map(jrow).join("\n") + "\n";

/** Derived from ROUND_THRESHOLD - a fixture that cannot reach the threshold
 *  makes every trigger assertion below vacuous. */
const OBLIGE = Array.from({ length: ROUND_THRESHOLD }, (_, i) => ({ round: i + 1 }));

/** The report's boundary in tests is injected, never the production one:
 *  `adoptionBoundary(repoRoot)` reads git for the first-parent commit on main
 *  that added lib/reviewRounds/constants.ts, so a suite that called it would
 *  return null in every fixture repo and change behavior the day this merges. */
const BOUNDARY = "2026-09-01T00:00:00.000Z";
const opts = { adoptionBoundary: BOUNDARY };

describe("report aggregation (spec §9)", () => {
  // Failure caught: collapsing stages into one number, which cannot be
  // compared against a per-stage threshold, and an implementation that counts
  // every RECORDED row against it.
  it("reports rounds PER STAGE, counted and recorded separately", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-stage-")), [
      {
        path: "feat/foo/aaaaaaaaaaaa.jsonl",
        body: jrows(
          { stage: "spec", round: 1 },
          { stage: "spec", round: 2 },
          { stage: "diff", round: 1 },
          { stage: "diff", round: 1 },
          { stage: "diff", round: 2, status: "no_verdict", verdict: null, failureReason: "wrapper_error" },
          { stage: "task", round: 1 },
        ),
      },
    ]);
    const arc = buildReport(root, opts).arcs.find((a) => a.baseSha === "aaaaaaaaaaaa");
    expect(arc?.stages.spec).toEqual({ counted: 2, recorded: 2 });
    // Two rows share round 1, so counted is 1; the no_verdict row is recorded
    // but never counted.
    expect(arc?.stages.diff).toEqual({ counted: 1, recorded: 3 });
    expect(arc?.stages.task).toEqual({ counted: 0, recorded: 1 });
  });

  // Failure caught: a branch-only join reading an older arc's rows as evidence
  // for a later one. THIS FAILS AND EVERY OTHER TEST IN THIS FILE PASSES,
  // which is exactly how the defect would ship. Mirrors real history: this
  // repo has reused three branch names across distinct PRs.
  it("lists the newer arc as silent when an older arc shares its branch name", () => {
    const root = mkdtempSync(join(tmpdir(), "rep-join-"));
    corpus(root, [{ path: "feat/reused/aaaaaaaaaaaa.jsonl", body: jrows(...OBLIGE.map((o) => ({ ...o, branch: "feat/reused" }))) }]);
    const report = buildReport(root, {
      ...opts,
      mergedArcs: [
        { sha: "1".repeat(40), branch: "feat/reused", baseSha: "aaaaaaaaaaaa", mergedAt: "2026-09-04T00:00:00.000Z" },
        { sha: "2".repeat(40), branch: "feat/reused", baseSha: "cccccccccccc", mergedAt: "2026-09-05T00:00:00.000Z" },
      ],
    });
    const silent = report.silentArcs?.map((a) => a.baseSha) ?? [];
    expect(silent).toContain("cccccccccccc");
    expect(silent).not.toContain("aaaaaaaaaaaa");
  });

  // Failure caught: a stage that began in one month and crossed in the next
  // landing in two buckets, which makes a monthly rate exceed 1 and reports
  // the first month as two different numbers.
  it("buckets a stage by its FIRST counted row's month and counts it triggered if it EVER crossed", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-rate-")), [
      {
        // Crosses the threshold, but its first counted row is in September.
        path: "feat/spanner/aaaaaaaaaaaa.jsonl",
        body: jrows(
          ...OBLIGE.slice(0, ROUND_THRESHOLD - 1).map((o) => ({ ...o, branch: "feat/spanner", startedAt: "2026-09-28T00:00:00.000Z" })),
          { round: ROUND_THRESHOLD, branch: "feat/spanner", startedAt: "2026-10-02T00:00:00.000Z" },
        ),
      },
      {
        // Same September bucket, never crosses.
        path: "feat/short/bbbbbbbbbbbb.jsonl",
        body: jrows({ round: 1, branch: "feat/short", baseSha: "bbbbbbbbbbbb", startedAt: "2026-09-10T00:00:00.000Z" }),
      },
    ]);
    const rate = buildReport(root, opts).triggerRateByMonth;
    // Population and numerator both derived from the fixture: two (arc, stage)
    // pairs in 2026-09, one of which ever crossed.
    expect(rate["2026-09"]).toEqual({ population: 2, triggered: 1, rate: 0.5 });
    // The crossing does NOT also create an October bucket.
    expect(rate["2026-10"]).toBeUndefined();
  });

  // Failure caught: a rate computed over arcs rather than over (arc, stage)
  // pairs that actually completed a review.
  it("excludes task stages and no-verdict-only stages from the rate population", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-pop-")), [
      {
        path: "feat/foo/aaaaaaaaaaaa.jsonl",
        body: jrows(
          { stage: "spec", round: 1 },
          { stage: "task", round: 1 },
          { stage: "plan", round: 1, status: "no_verdict", verdict: null, failureReason: "attempts_exhausted" },
        ),
      },
    ]);
    // Only the spec stage completed a review, so the population is 1.
    expect(buildReport(root, opts).triggerRateByMonth["2026-09"]?.population).toBe(1);
  });

  // Failure caught: null folded into zero, which understates every total and
  // is indistinguishable from "no findings found".
  it("totals findingCount over declared rows only and reports undeclared as its own count", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-find-")), [
      {
        path: "feat/foo/aaaaaaaaaaaa.jsonl",
        body: jrows(
          { round: 1, findingCount: 5 },
          { round: 2, findingCount: 0 },
          { round: 3, findingCount: null },
        ),
      },
    ]);
    const f = buildReport(root, opts).findingsByStage.diff;
    // 5 + 0 over the two DECLARED rows. A null-as-zero implementation reports
    // the same total but declaredRows: 3, so both fields are asserted.
    expect(f).toEqual({ total: 5, declaredRows: 2, undeclaredRows: 1 });
  });

  it("lists a merged arc with zero rows as silent and one with rows as not", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-silent-")), [
      { path: "feat/recorded/aaaaaaaaaaaa.jsonl", body: jrows({ round: 1, branch: "feat/recorded" }) },
    ]);
    const report = buildReport(root, {
      ...opts,
      mergedArcs: [
        { sha: "1".repeat(40), branch: "feat/recorded", baseSha: "aaaaaaaaaaaa", mergedAt: "2026-09-04T00:00:00.000Z" },
        { sha: "2".repeat(40), branch: "feat/quiet", baseSha: "bbbbbbbbbbbb", mergedAt: "2026-09-04T00:00:00.000Z" },
      ],
    });
    expect(report.silentArcs?.map((a) => a.branch)).toEqual(["feat/quiet"]);
  });

  // Failure caught: the 668-arc mass false classification.
  it("excludes pre-adoption merges from the silent list and reports them as a single count", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-adopt-")), []);
    const report = buildReport(root, {
      ...opts,
      mergedArcs: [
        { sha: "1".repeat(40), branch: "feat/ancient", baseSha: "aaaaaaaaaaaa", mergedAt: "2026-08-01T00:00:00.000Z" },
        { sha: "2".repeat(40), branch: "feat/modern", baseSha: "bbbbbbbbbbbb", mergedAt: "2026-09-04T00:00:00.000Z" },
      ],
    });
    expect(report.silentArcs?.map((a) => a.branch)).toEqual(["feat/modern"]);
    expect(report.preAdoptionMergeCount).toBe(1);
    // Reported as a COUNT, never enumerated (spec §8.3 limit 7).
    expect(report).not.toHaveProperty("preAdoptionArcs");
  });

  // Failure caught: THIS arc's own merge reported as silent. The boundary IS
  // the committer date of the merge that puts the constants module on main, so
  // the adoption arc's mergedAt equals it exactly; a strictly-less pre-adoption
  // test drops that equality into the post-adoption branch, and this arc has no
  // corpus by ratified design (spec §12), so the report accuses the very merge
  // that created it. Every other case in this file passes either way.
  it("treats a merge whose timestamp EQUALS the boundary as pre-adoption", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-equal-")), []);
    const report = buildReport(root, {
      ...opts,
      mergedArcs: [
        // mergedAt is BOUNDARY itself, not a second literal that could drift
        // away from it and make the equality this test is named for untested.
        { sha: "3".repeat(40), branch: "feat/the-adoption-merge", baseSha: "ffffffffffff", mergedAt: BOUNDARY },
      ],
    });
    expect(report.silentArcs).toEqual([]);
    expect(report.preAdoptionMergeCount).toBe(1);
  });

  // The two cases that pass TRIVIALLY under a boundary derived from the corpus,
  // which is why the boundary is declared. Both are silent wrongness.
  it("lists a zero-row arc merged AFTER the boundary but BEFORE the earliest corpus row as silent", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-gap-")), [
      // Earliest row is 2026-09-03; a derived boundary would be that date.
      { path: "feat/foo/aaaaaaaaaaaa.jsonl", body: jrows({ round: 1 }) },
    ]);
    const report = buildReport(root, {
      ...opts,
      mergedArcs: [
        { sha: "9".repeat(40), branch: "feat/first-silent", baseSha: "dddddddddddd", mergedAt: "2026-09-02T00:00:00.000Z" },
      ],
    });
    expect(report.silentArcs?.map((a) => a.branch)).toContain("feat/first-silent");
    expect(report.preAdoptionMergeCount).toBe(0);
  });

  it("still lists post-boundary zero-row merges as silent when the corpus is EMPTY", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-empty-")), []);
    const report = buildReport(root, {
      ...opts,
      mergedArcs: [
        { sha: "9".repeat(40), branch: "feat/nothing-recorded", baseSha: "eeeeeeeeeeee", mergedAt: "2026-09-04T00:00:00.000Z" },
      ],
    });
    // A derived boundary is null here, the universe collapses to empty, and the
    // report declares all-clear in exactly the state where nothing is recorded.
    expect(report.silentArcs?.map((a) => a.branch)).toEqual(["feat/nothing-recorded"]);
  });

  it("prints an advisory mismatch when the earliest corpus row precedes the boundary", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-mismatch-")), [
      { path: "feat/foo/aaaaaaaaaaaa.jsonl", body: jrows({ round: 1, startedAt: "2026-08-15T00:00:00.000Z" }) },
    ]);
    const report = buildReport(root, opts);
    expect(report.boundaryAdvisory).toContain("2026-08-15");
  });

  // Failure caught: an unset boundary treated as the epoch, which accuses every
  // pre-adoption merge in one run.
  it("reports not-yet-adopted and withholds the silent list when the boundary is null", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-null-")), []);
    const report = buildReport(root, {
      adoptionBoundary: null,
      mergedArcs: [
        { sha: "1".repeat(40), branch: "feat/whatever", baseSha: "aaaaaaaaaaaa", mergedAt: "2026-09-04T00:00:00.000Z" },
      ],
    });
    expect(report.silentArcs).toBeNull();
    expect(report.notes.join(" ")).toMatch(/not yet adopted/i);
  });

  // Failure caught: a partial answer labelled complete - the §8.2 failure.
  // Ambient-gated skipping cannot catch this: an implementation with NO
  // --is-shallow-repository check passes every other test in this file.
  it("refuses the merged-arc scan on a synthesized shallow clone and says so by name", () => {
    const origin = fixtureRepo().dir; // Task 7's layer-1 fixture, reused
    const shallow = join(mkdtempSync(join(tmpdir(), "rep-shallow-")), "clone");
    execFileSync("git", ["clone", "--depth=1", `file://${origin}`, shallow]);
    expect(
      execFileSync("git", ["rev-parse", "--is-shallow-repository"], { cwd: shallow, encoding: "utf8" }).trim(),
    ).toBe("true");

    const report = buildReport(shallow, opts);
    // WITHHELD, not empty. An empty array and a refusal must be different
    // values, or this assertion cannot tell one from the other.
    expect(report.silentArcs).toBeNull();
    expect(report.shallow).toBe(true);
    expect(report.notes.join(" ")).toMatch(/shallow/i);
  });
});

describe("adoption boundary, production default (spec §9)", () => {
  // Failure caught: the boundary query defaulting to HEAD. Every other test in
  // this file INJECTS `adoptionBoundary`, so the production path - the one that
  // actually runs - has no other coverage at all. Without the `main` ref, a
  // ref-less `git log` walks HEAD, finds the constants module's BRANCH-LOCAL
  // addition, and returns a boundary EARLIER than the merge. Early is the
  // unsafe direction: arcs that merged between that commit and the real merge
  // are then printed as silent, as fact.
  it("is null until the constants module is on main, then is the merge commit's date", () => {
    const repo = mkdtempSync(join(tmpdir(), "rep-boundary-"));
    const git = (...args: string[]): string =>
      execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "T");
    writeFileSync(join(repo, "seed.txt"), "seed\n");
    git("add", "seed.txt");
    git("commit", "-qm", "seed");

    git("checkout", "-q", "-b", "feat/adopting");
    const constants = join(repo, "lib", "reviewRounds", "constants.ts");
    mkdirSync(dirname(constants), { recursive: true });
    writeFileSync(constants, "export const ROUND_THRESHOLD = 4;\n");
    git("add", "lib/reviewRounds/constants.ts");
    git("commit", "-qm", "feat: constants");

    // HEAD is the feature branch and the file IS reachable from HEAD. Adoption
    // is a fact about MAIN, so the boundary must still be null here - this is
    // the assertion a HEAD-defaulting query fails.
    expect(adoptionBoundary(repo)).toBeNull();
    // And the production default reaches the report: no injected boundary, so
    // buildReport calls adoptionBoundary itself and must withhold rather than
    // accuse.
    const early = buildReport(repo, {
      mergedArcs: [
        { sha: "4".repeat(40), branch: "feat/adopting", baseSha: "aaaaaaaaaaaa", mergedAt: "2026-09-04T00:00:00.000Z" },
      ],
    });
    expect(early.silentArcs).toBeNull();
    expect(early.notes.join(" ")).toMatch(/not yet adopted/i);

    git("checkout", "-q", "main");
    git("merge", "-q", "--no-ff", "-m", "merge feat/adopting", "feat/adopting");
    // Derived from the fixture repo's own log, never a literal: the boundary IS
    // the committer date of the first-parent merge that put the file on main.
    const mergeDate = git("log", "-1", "--first-parent", "--format=%cI", "main");
    expect(adoptionBoundary(repo)).toBe(mergeDate);
    expect(buildReport(repo, { mergedArcs: [] }).silentArcs).toEqual([]);
  });
});

describe("real history (spec §11.3 layer 2)", () => {
  // A test that quietly passes over one merge is a false presence. Numbers are
  // derived from the live log, never from literals - a hardcoded 676 makes
  // this a tripwire on the calendar instead of on the producer.
  const isShallow =
    execFileSync("git", ["rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).trim() === "true";

  it.skipIf(isShallow)("matches the live log when history is available", () => {
    const expected = execFileSync(
      "git",
      ["log", "--merges", "--first-parent", "main", "--format=%s"],
      { encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean);
    const { recognized, unrecognized } = mergedArcs(process.cwd());
    // Every first-parent merge is accounted for: recognized or reported.
    expect(recognized.length + unrecognized.length).toBe(expected.length);
    // The residue is REPORTED, never assumed empty - and every entry carries
    // its subject, per §9.
    expect(unrecognized.every((u) => u.subject.length > 0)).toBe(true);
  });

  it.runIf(isShallow)("SKIPS BY NAME on a shallow clone", () => {
    // A named absence, not a quiet pass over one merge.
    expect(mergedArcs(process.cwd()).shallow).toBe(true);
  });
});
```

**`buildReport` takes its boundary and its merged-arc list as options.** Both default to the production values — `adoptionBoundary(repoRoot)` (Task 2) and `mergedArcs(repoRoot)` (Task 7) — and both are injectable, for the two reasons the tests above make concrete: the production boundary reads git for the commit that added lib/reviewRounds/constants.ts, so it is `null` in every fixture repo and changes the day this merges; and the silent-arc join needs merged arcs that do not exist in any fixture repo's real history. The injection points are the seam, not a test-only backdoor: the CLI passes neither and gets production behavior.

**Injection everywhere is how the production path goes untested, so one case refuses it.** The "adoption boundary, production default" describe above passes no `adoptionBoundary` and builds a real git repo instead, because the defect it catches lives entirely in the argv the production function hands `git`: a ref-less `git log` walks HEAD, and on the branch that adds the constants module HEAD's first-parent history contains its addition. Every injected test in this file is blind to that by construction.

**`Report` shape**, fixed here so no field is invented at implementation time (and repeated verbatim in the module at Step 3, which is the file that declares it):

```ts
export type StageCounts = { counted: number; recorded: number };
export type Report = {
  arcs: { branch: string; baseSha: string; stages: Record<string, StageCounts> }[];
  triggerRateByMonth: Record<string, { population: number; triggered: number; rate: number }>;
  findingsByStage: Record<string, { total: number; declaredRows: number; undeclaredRows: number }>;
  /** null means WITHHELD - a shallow clone or an unset boundary. Never [] for
   *  those cases: an empty list is a completed scan that found nothing. */
  silentArcs: { branch: string; baseSha: string; sha: string; mergedAt: string }[] | null;
  preAdoptionMergeCount: number;
  unrecognizedMerges: { sha: string; subject: string }[];
  shallow: boolean;
  /** Present when the corpus's earliest startedAt precedes the boundary, which
   *  means the declared constant is wrong. */
  boundaryAdvisory: string | null;
  notes: string[];
};
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run tests/reviewRounds/report.test.ts`
Expected: FAIL — `Cannot find module '../../scripts/review-economy'`. The suite imports `buildReport` at the top, so this is a real red state and not a rerun of Task 7.

- [ ] **Step 3: Implement the report**

Create scripts/review-economy.ts. Every definition below is verbatim from spec §9, and each exists because the alternative reports conflicting facts:

```ts
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { adoptionBoundary, ROUND_THRESHOLD, isCountedStage } from "../lib/reviewRounds/constants";
import { readArcs } from "../lib/reviewRounds/corpus";
import { countedRounds, recordedRounds } from "../lib/reviewRounds/count";
import { mergedArcs, type MergedArc } from "../lib/reviewRounds/mergedArcs";
import type { ReviewRoundRow } from "../lib/reviewRounds/row";

export type StageCounts = { counted: number; recorded: number };
export type Report = {
  arcs: { branch: string; baseSha: string; stages: Record<string, StageCounts> }[];
  triggerRateByMonth: Record<string, { population: number; triggered: number; rate: number }>;
  findingsByStage: Record<string, { total: number; declaredRows: number; undeclaredRows: number }>;
  /** null means WITHHELD - a shallow clone or an unset boundary. Never [] for
   *  those cases: an empty list is a completed scan that found nothing. */
  silentArcs: { branch: string; baseSha: string; sha: string; mergedAt: string }[] | null;
  preAdoptionMergeCount: number;
  unrecognizedMerges: { sha: string; subject: string }[];
  shallow: boolean;
  /** Present when the corpus's earliest startedAt precedes the boundary, which
   *  means the declared constant is wrong. */
  boundaryAdvisory: string | null;
  notes: string[];
};

export type ReportOptions = {
  /** Defaults to `adoptionBoundary(repoRoot)`. Injectable because the production
   *  value is read from git and is null in every fixture repo. */
  adoptionBoundary?: string | null;
  /** Defaults to `mergedArcs(repoRoot).recognized`. Injectable because the
   *  silent-arc join needs merges no fixture repo's real history contains. */
  mergedArcs?: MergedArc[];
};

const arcKey = (branch: string, baseSha: string): string => `${branch}\u0000${baseSha}`;

export function buildReport(repoRoot: string, opts: ReportOptions = {}): Report {
  const notes: string[] = [];
  const arcs = readArcs(repoRoot);
  const boundary =
    opts.adoptionBoundary !== undefined ? opts.adoptionBoundary : adoptionBoundary(repoRoot);

  // --- rounds per stage per arc, counted vs recorded, NEVER collapsed --------
  // Collapsing stages produces one number that cannot be compared against a
  // per-stage threshold, and counting every recorded row against it obliges an
  // arc on infra noise.
  const arcRows: Report["arcs"] = arcs.map((arc) => {
    const counted = countedRounds(arc.rows);
    const recorded = recordedRounds(arc.rows);
    const stages: Record<string, StageCounts> = {};
    for (const [stage, rowCount] of recorded) {
      stages[stage] = { counted: counted.get(stage) ?? 0, recorded: rowCount };
    }
    return { branch: arc.branch, baseSha: arc.baseSha, stages };
  });

  // --- trigger rate by month -------------------------------------------------
  // Population is (arc, stage) PAIRS that actually completed a review, not arcs.
  // A pair is bucketed by its FIRST counted row's month and counts as triggered
  // if it EVER crossed - a stage that began in one month and crossed in the next
  // must not land in two buckets, which is how a monthly rate exceeds 1.
  const triggerRateByMonth: Report["triggerRateByMonth"] = {};
  for (const arc of arcs) {
    const byStage = new Map<string, ReviewRoundRow[]>();
    for (const row of arc.rows) {
      if (row.status !== "verdict" || !isCountedStage(row.stage)) continue;
      const group = byStage.get(row.stage);
      if (group) group.push(row);
      else byStage.set(row.stage, [row]);
    }
    for (const rows of byStage.values()) {
      const stamps = rows
        .map((r) => r.startedAt)
        .filter((s): s is string => s !== null)
        .sort();
      const month = (stamps[0] ?? "unknown").slice(0, 7);
      const bucket = triggerRateByMonth[month] ?? { population: 0, triggered: 0, rate: 0 };
      bucket.population += 1;
      if (new Set(rows.map((r) => r.round)).size >= ROUND_THRESHOLD) bucket.triggered += 1;
      bucket.rate = bucket.triggered / bucket.population;
      triggerRateByMonth[month] = bucket;
    }
  }

  // --- finding totals by stage ----------------------------------------------
  // `null` is EXCLUDED and counted on its own. Folding it into zero understates
  // every total and is indistinguishable from "no findings found".
  const findingsByStage: Report["findingsByStage"] = {};
  for (const arc of arcs) {
    for (const row of arc.rows) {
      const f = findingsByStage[row.stage] ?? { total: 0, declaredRows: 0, undeclaredRows: 0 };
      if (row.findingCount === null) f.undeclaredRows += 1;
      else {
        f.total += row.findingCount;
        f.declaredRows += 1;
      }
      findingsByStage[row.stage] = f;
    }
  }

  // --- silent arcs, adoption boundary, shallow refusal -----------------------
  const merges =
    opts.mergedArcs !== undefined
      ? { shallow: false, recognized: opts.mergedArcs, unrecognized: [] }
      : mergedArcs(repoRoot);

  const recorded = new Set(
    arcs.filter((a) => a.rows.length > 0).map((a) => arcKey(a.branch, a.baseSha)),
  );
  let silentArcs: Report["silentArcs"] = null;
  let preAdoptionMergeCount = 0;

  if (merges.shallow) {
    // WITHHELD, not empty. A partial answer labelled complete is the §8.2
    // failure, and depth-1 is the normal CI state.
    notes.push(
      "merged-arc scan REFUSED: this is a shallow clone, so its history is truncated. The silent-arc list is withheld, not empty.",
    );
  } else if (boundary === null) {
    // An unset boundary treated as the epoch accuses every pre-adoption merge in
    // one run, and the report prints that as fact.
    notes.push(
      "adoption boundary: not yet adopted. lib/reviewRounds/constants.ts is not on main, so no merge can be classified and the silent-arc list is withheld.",
    );
  } else {
    const silent: NonNullable<Report["silentArcs"]> = [];
    for (const merge of merges.recognized) {
      // Post-adoption is STRICTLY LATER than the boundary, so a merge whose
      // timestamp EQUALS it is pre-adoption. That equality is not a corner case
      // - it is this PR. The boundary is the committer date of the merge that
      // put lib/reviewRounds/constants.ts on main, so that merge's own arc
      // carries exactly this timestamp, and this arc has no corpus by ratified
      // design (spec §12). Under a strict `<` test it fell into the
      // post-adoption branch and the report listed the adoption merge itself as
      // silent. The contract goes live WITH that merge, not before it, so the
      // merge that establishes the boundary cannot be obliged by it.
      if (Date.parse(merge.mergedAt) <= Date.parse(boundary)) {
        // Reported as a COUNT, never enumerated (documented limit 7).
        preAdoptionMergeCount += 1;
        continue;
      }
      // Joined on (branch, baseSha), NEVER on branch alone: this repo has reused
      // three branch names across distinct PRs, and a branch-only join reads an
      // older arc's rows as evidence for a later one.
      if (recorded.has(arcKey(merge.branch, merge.baseSha))) continue;
      silent.push({
        branch: merge.branch,
        baseSha: merge.baseSha,
        sha: merge.sha,
        mergedAt: merge.mergedAt,
      });
    }
    silentArcs = silent;
  }

  // The DECLARED boundary is never checked against the corpus, but a corpus that
  // predates it means the boundary is wrong, and saying so is cheaper than
  // deriving a number nothing can check.
  const earliest = arcs
    .flatMap((a) => a.rows)
    .map((r) => r.startedAt)
    .filter((s): s is string => s !== null)
    .sort()[0];
  const boundaryAdvisory =
    boundary !== null && earliest !== undefined && Date.parse(earliest) < Date.parse(boundary)
      ? `ADVISORY: the earliest recorded row (${earliest}) precedes the declared adoption boundary (${boundary}), so the boundary is wrong.`
      : null;

  return {
    arcs: arcRows,
    triggerRateByMonth,
    findingsByStage,
    silentArcs,
    preAdoptionMergeCount,
    unrecognizedMerges: merges.unrecognized,
    shallow: merges.shallow,
    boundaryAdvisory,
    notes,
  };
}

// ---------------------------------------------------------------------------
// CLI. Read-only, gates nothing, exit 0 always except on its own usage error.
// ---------------------------------------------------------------------------

function render(report: Report): string {
  const out: string[] = ["review round economy", ""];

  out.push(`arcs recorded: ${report.arcs.length}`);
  for (const arc of report.arcs) {
    const stages = Object.entries(arc.stages)
      .map(([stage, c]) => `${stage} ${c.counted}/${c.recorded}`)
      .join("  ");
    out.push(`  ${arc.branch} ${arc.baseSha}  ${stages || "(no rows)"}`);
  }

  out.push("", `filing threshold: ${ROUND_THRESHOLD} counted rounds in one stage`, "");
  out.push("trigger rate by month (triggered / population):");
  for (const month of Object.keys(report.triggerRateByMonth).sort()) {
    const r = report.triggerRateByMonth[month]!;
    out.push(`  ${month}  ${r.triggered}/${r.population}  ${(r.rate * 100).toFixed(1)}%`);
  }

  out.push("", "declared findings by stage:");
  for (const stage of Object.keys(report.findingsByStage).sort()) {
    const f = report.findingsByStage[stage]!;
    out.push(
      `  ${stage}  total ${f.total} over ${f.declaredRows} declared row(s), ${f.undeclaredRows} undeclared`,
    );
  }

  out.push("");
  if (report.silentArcs === null) {
    // The withheld case reads differently from the clean one BY CONSTRUCTION.
    out.push("silent arcs: WITHHELD (see notes)");
  } else {
    out.push(`silent arcs: ${report.silentArcs.length}`);
    for (const a of report.silentArcs) out.push(`  ${a.branch} ${a.baseSha}  merged ${a.mergedAt}`);
  }
  out.push(`pre-adoption merges (excluded, not enumerated): ${report.preAdoptionMergeCount}`);

  if (report.unrecognizedMerges.length > 0) {
    out.push("", `unrecognized merge subjects: ${report.unrecognizedMerges.length}`);
    for (const u of report.unrecognizedMerges) out.push(`  ${u.sha.slice(0, 12)}  ${u.subject}`);
  }
  if (report.boundaryAdvisory !== null) out.push("", report.boundaryAdvisory);
  for (const note of report.notes) out.push("", note);
  return out.join("\n") + "\n";
}

export function main(argv: string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write("usage: pnpm review:economy [--json]\n");
    return 0;
  }
  const unknown = argv.filter((a) => a !== "--json");
  if (unknown.length > 0) {
    process.stderr.write(`review:economy: unknown argument: ${unknown[0]}\n`);
    return 2;
  }
  const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
  const report = buildReport(repoRoot);
  process.stdout.write(argv.includes("--json") ? JSON.stringify(report, null, 2) + "\n" : render(report));
  return 0;
}

// Guarded so importing this module from the test suite does not run the CLI.
const entry = process.argv[1];
if (entry !== undefined && fileURLToPath(import.meta.url) === resolve(entry)) {
  process.exit(main(process.argv.slice(2)));
}
```

- [ ] **Step 4: Add the package script**

In `package.json`, beside `"ledger:claims"` (`package.json:28`):

```json
    "review:economy": "tsx scripts/review-economy.ts",
```

- [ ] **Step 5: Run the tests and the CLI**

Run: `pnpm exec vitest run tests/reviewRounds/report.test.ts && pnpm review:economy`
Expected: tests PASS; the CLI prints a report over the (empty) live corpus and exits 0 without throwing.

- [ ] **Step 6: Commit**

```bash
git add scripts/review-economy.ts package.json tests/reviewRounds/report.test.ts
git commit -m "feat(review-rounds): pnpm review:economy cross-arc report"
```

---

### Task 9: Widen `parseVerdict` past markdown emphasis

**Files:**
- Modify: `scripts/codex-guard.mjs:392`
- Create: tests/codexGuard/verdictEmphasis.test.ts

**Interfaces:**
- Consumes: nothing.
- Produces: no new export — `parseVerdict`'s accepted input widens.

Three dispatches in the 681-file probe corpus emitted `**VERDICT: …**` and were recorded `no_verdict`: a full review spent, then filed as an infrastructure fault (spec §3 consequence 3).

- [ ] **Step 1: Write the failing test**

Create tests/codexGuard/verdictEmphasis.test.ts driving the wrapper through the harness with each shape:

```ts
import { describe, expect, it } from "vitest";

import { mkRun, readResult, runGuard, writeScenario } from "./harness";

describe("verdict lines wrapped in markdown emphasis (spec §3 consequence 3)", () => {
  // Failure caught: a full review spent, then filed as an infrastructure
  // fault - indistinguishable in result.json from a reaped dispatch.
  it.each([
    ["**VERDICT: APPROVE**"],
    ["*VERDICT: APPROVE*"],
    ["__VERDICT: APPROVE__"],
    ["  **VERDICT: APPROVE**  "],
  ])("recovers the verdict from %j", async (line) => {
    const run = mkRun();
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "lastMessage", text: `${line}\n` }, { type: "exit", code: 0 }] },
    ]);
    const { code } = await runGuard(run);
    expect(code).toBe(0);
    expect(readResult(run)).toMatchObject({ status: "verdict", verdict: "APPROVE" });
  });

  // The existing ambiguity guard must survive the widening: a line naming two
  // outcomes, or joining them with " or ", is still not a verdict.
  it.each([
    ["**VERDICT: APPROVE or BLOCKING**"],
    ["**VERDICT: APPROVE / NEEDS-ATTENTION**"],
  ])("still refuses the ambiguous line %j", async (line) => {
    const run = mkRun();
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "lastMessage", text: `${line}\n` }, { type: "exit", code: 0 }] },
    ]);
    await runGuard(run, ["--max-attempts", "1"]);
    expect(readResult(run)).toMatchObject({ status: "no_verdict" });
  });

  // Failure caught: widening so far that the brief's own INSTRUCTION to emit a
  // verdict is read as a verdict. The instruction text is what every brief in
  // the repo contains, so a regex that matches it breaks every dispatch.
  it("does not read a fenced example as a verdict", async () => {
    const run = mkRun();
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "lastMessage", text: "```\nVERDICT: APPROVE\n```\nStill working.\n" }, { type: "exit", code: 0 }] },
    ]);
    await runGuard(run, ["--max-attempts", "1"]);
    expect(readResult(run)).toMatchObject({ status: "no_verdict" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run tests/codexGuard/verdictEmphasis.test.ts`
Expected: FAIL on the four emphasis cases (recorded `no_verdict`); the three guard cases already pass and must keep passing.

- [ ] **Step 3: Widen the filter**

In `scripts/codex-guard.mjs`, change the line filter at `scripts/codex-guard.mjs:392`:

```js
  // Leading markdown emphasis is stripped before the marker test: three real
  // dispatches in the 681-output probe corpus emitted `**VERDICT: …**` and were
  // filed as infrastructure faults - a full review spent and then discarded.
  // Fence stripping above still runs first, so a fenced example is not a verdict.
  const lines = noFences.filter((l) => /^\s*(?:\*{1,2}|_{1,2})?\s*VERDICT:\s*\S/.test(l));
```

Emphasis must also be stripped from the captured `verdictLine` before the outcome is matched, so the recorded value stays the bare outcome.

- [ ] **Step 4: Run the new test and the full guard suite**

Run: `pnpm exec vitest run tests/codexGuard/`
Expected: PASS throughout. The pre-existing verdict-parsing tests are the regression check on the widening.

- [ ] **Step 5: Commit**

```bash
git add scripts/codex-guard.mjs tests/codexGuard/verdictEmphasis.test.ts
git commit -m "fix(review-rounds): accept a verdict line wrapped in markdown emphasis"
```

---

### Task 10: Repair the dispatch hook's finding tally

**Files:**
- Modify: `$HOME/.claude/hooks/review-convergence-gate.sh` (per-machine, NOT tracked in this repo)
- Modify: `AGENTS.md` (record the repair in the convergence-criterion section)

The hook counts findings with the numbered-bold pattern alone, which the probe measured at **48.0%** against 681 real outputs (spec §3, table row 2). Its advisory "~N findings" line therefore reads zero for the other 52%. Leaving a known-wrong number in an operator-facing message is the exact defect class this system exists to close.

**The disposition, fixed here so Steps 2 and 4 cannot disagree:** the hook reports the reviewer's declared `FINDINGS:` count when present, and the literal text `not declared` otherwise. Never an inferred count, and never a silently dropped number — a blank where a tally used to be reads as "zero findings" to the next operator, which is the same false statement in quieter form.

**The hook and `parseFindingCount` must agree, because they read the same reviewer output and an operator sees both.** They are two implementations of one rule, and the rule has a grain: `parseFindingCount` (Task 5) reads ONE terminal message per dispatch, strips fenced blocks, matches an end-anchored `FINDINGS: <n>` line, and returns `null` when two different values are declared. A hook that SUMS across a round's `attempt-*.last-message.txt` files reads a different grain and prints a different number for the same round — a round whose failed first attempt declared 2 and whose successful retry declared 1 records `findingCount: 1` in the corpus while the hook prints 3, and nothing on screen says which is the reviewer's actual claim. **Where both exist, the corpus row is authoritative**: it is the committed, reviewable record, and the hook's line is an advisory rendering of it. The repair below makes the hook read the wrapper's own resolved answer wherever one survives on disk, and apply the corpus's rule rather than a rule of its own only where none does.

**This file is outside the repo** and cannot be committed here. The repair is applied on this machine and the *contract* is recorded in `AGENTS.md`, which is the durable cross-CLI source of truth — the same posture AGENTS.md already takes for the reaper hook.

- [ ] **Step 1: Reproduce the wrong number**

Run the probe's recognizer counts against the corpus described in `docs/superpowers/specs/ci/probes/2026-08-04-finding-format-probe.md` and confirm the numbered-bold pattern alone reports 327/681. Record the command and its output in the commit message.

- [ ] **Step 2: Apply the repair**

**One contract, both halves agreeing: the hook reports the reviewer's DECLARED `FINDINGS:` count per prior round, read by the SAME rule `parseFindingCount` uses, and the literal text `not declared` for a round that declared none. It never infers a count, and it never sums.** Dropping the number entirely is NOT the disposition — Step 4 commits AGENTS.md prose that promises this rendering, and prose promising one behavior over an implementation doing another is the contradiction this task exists to remove.

The hook is per-machine and untracked, so this step describes the precise change rather than a diff; the AGENTS.md prose in Step 4 is the durable contract. Two edits inside `$HOME/.claude/hooks/review-convergence-gate.sh`:

1. Replace the inferring tally. The current assignment greps the numbered-bold pattern across every `attempt-*.last-message.txt` in each prior round's out-dir and sums the per-file counts — the 48.0% recognizer, at a grain the corpus does not use. Replace it with a per-dispatch read whose FIRST source is the dispatch's own answer:
   - **The dispatch's result.json is authoritative and is never re-derived.** Each prior round's out-dir holds one, and after Task 5 it carries the resolved `findingCount` — the very value the corpus row holds, because the bridge copies it straight across (Task 4 Step 3). A number renders as itself; an explicit `null` renders `not declared`. Re-deriving a count the wrapper already resolved is the only way the two can disagree, so the hook does not.
   - **Only a dispatch with no usable result.json falls through to the message files:** an out-dir from before this feature (a result.json with no `findingCount` key at all — absent is not `null`), a run whose result.json never landed, or a file that does not parse. Then, and only then, the scan below applies.
   - **The scan picks the same message the wrapper did.** `recovered-from-rollout.txt` when the out-dir holds one, because on a rollout-recovered dispatch THAT file is the terminal message: `tryRolloutScrape` writes it and points `lastMessagePath` at it (`scripts/codex-guard.mjs:785-795`), which is the `recoveredFrom: "rollout_scrape"` contract AGENTS.md already documents. Otherwise the LAST `attempt-*.last-message.txt` with non-empty content — last, because earlier attempts are superseded work; non-empty, because an empty `-o` file never resets the wrapper's carrier either (`recordDeclaredCount`'s non-empty grain, Task 5 Step 3). Note that this rule matches the wrapper on a nonzero-exit or killed attempt only because Task 5's read sits above `classifyAttempt`'s exit-shape guards; with the round-4 placement it did not, and the fallback silently disagreed there too. The one shape the fallback still cannot see is a scraped rollout message that declared a count but carried no verdict: nothing is recovered, so no file is written, so there is nothing on disk to scan. It is reachable only when no usable result.json survives, and it renders `not declared` against a corpus row that has the number. Recorded as a documented limit of the fallback rather than repaired, because the repair is a file the wrapper writes for no other reason.
   - **Elide fenced blocks first**, the same elision `parseFindingCount` applies, so a `FINDINGS:` line quoted inside an example block is not read as a declaration.
   - **End-anchored pattern**, the same one: an optional bold or italic wrapper, `FINDINGS:`, decimal digits, and nothing else on the line. `FINDINGS: 2 or 7` declares nothing.
   - **Ambiguity renders as `not declared`.** Two DIFFERENT counts in one terminal message is `null` in `parseFindingCount`, and it must not become a number here.
   - **Per round, never summed and never inferred.** Summing is how a round whose failed first attempt declared 2 and whose retry declared 1 prints 3 against a corpus row of 1. The variable holds one rendering per prior round, so a reader can line the hook's output up against the corpus rows one to one.
2. Replace the `~$FINDINGS findings` fragment in the block message. `~` announces an estimate, and there is no longer an estimate: it becomes a per-round list built from that variable — `R1: 2, R2: not declared, R3: 1` — with `not declared` spelled out for every round that declared nothing. One shell variable feeds the message, so the rendering has a single source.

Everything else in the hook is untouched: the round cap, the two convergence-criterion gates, and the `CONVERGENCE_ACK=1` override all keep their current behavior. The tally is advisory and stays advisory — this repair makes it honest, it does not make it load-bearing.

- [ ] **Step 3: Verify the hook still blocks, and that both renderings appear**

Run a dispatch that should be blocked (a 5th round on an artifact with four prior `.review/` dirs) and confirm the block message appears. Run it against three prepared fixtures:

1. Prior rounds whose terminal messages carry `FINDINGS: <n>` lines — must print each round's own declared count, one per round.
2. Prior rounds whose messages carry none — must print `not declared`. A run that prints `0` here is the original defect wearing a new number.
3. **The divergence case, which is the reason this task exists:** one round whose FIRST attempt file declares `FINDINGS: 2` and whose LAST attempt file declares `FINDINGS: 1`. The hook must print `1` — the terminal message's count, the same value `parseFindingCount` would put in that round's corpus row. A `3` is the old summing grain surviving the repair.
4. **Rollout recovery, where the terminal message is not an attempt file at all.** One round whose `attempt-1.last-message.txt` declares `FINDINGS: 2` with no VERDICT line, whose `recovered-from-rollout.txt` declares `FINDINGS: 3` with one, and whose result.json carries `findingCount: 3` and `recoveredFrom: "rollout_scrape"`. The hook must print `3`. A `2` is a scan reading an attempt file the wrapper superseded — and `2` is exactly what a "last non-empty attempt file" rule prints, which is why this fixture exists. Then delete that result.json and re-run: still `3`, because the fallback prefers the recovered message.
5. **An exhausted round whose final attempt is empty.** `attempt-1.last-message.txt` declares `FINDINGS: 2`; `attempt-2.last-message.txt` is zero bytes; result.json carries `findingCount: 2`, because an empty message never resets the wrapper's carrier (Task 5 Step 3). The hook must print `2`. Then delete that result.json and re-run: still `2`, via the fallback's last-NON-EMPTY rule. Both sources agreeing on this shape is the whole point — a fallback that took the final attempt file regardless of content would print `not declared` against a corpus row of 2, which is the same "the reviewer declared nothing" falsehood in the operator's face rather than in the corpus.

- [ ] **Step 4: Record the contract in AGENTS.md**

Add to the convergence-criterion section, beside the existing install one-liner:

> The hook's advisory finding tally was measured at 48.0% accuracy against 681 real reviewer outputs (`docs/superpowers/specs/ci/probes/2026-08-04-finding-format-probe.md`) because it inferred findings from a numbered-bold pattern. It now reports the reviewer's declared `FINDINGS: <n>` line per round, or says "not declared" — never an inferred count and never a sum. It takes that count from the dispatch's own result.json whenever one carries a `findingCount` key: that is the wrapper's resolved answer and the same value the corpus row holds, and re-deriving it is the only way the two can disagree. Only when no usable result.json survives does it read the message files itself, by the same rule `parseFindingCount` in `scripts/codex-guard.mjs` uses: ONE terminal message per dispatch — the recovered rollout message when the out-dir holds one, else the last attempt message with non-empty content — fenced blocks elided, the pattern end-anchored, and two different declared values treated as "not declared". The two must agree, because an operator sees both; where both exist, the committed corpus row is authoritative and the hook's line is an advisory rendering of it. The hook is per-machine; this paragraph is the durable contract.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs(review-rounds): the dispatch hook reports declared findings, never inferred"
```

---

### Task 11: Mutation enrollment

**Files:**
- Modify: `tests/mutation/source/registry.ts` (`GUARD_SURFACES` at `registry.ts:120`, `GuardSurface` at `registry.ts:12-23`, `validateSurface` at `registry.ts:41`)
- Modify: `tests/mutation/guardSurfaces.gate.test.ts` (`EXPECTED_LEDGER_KINDS` at `tests/mutation/guardSurfaces.gate.test.ts:33`, control mutation at `tests/mutation/guardSurfaces.gate.test.ts:110-129`)
- Modify: `tests/mutation/_metaGuardSurfaceRegistry.test.ts` — **a third consumer, and the one a `GuardSurface` change breaks silently at typecheck.** Its `VALID: GuardSurface` fixture (`tests/mutation/_metaGuardSurfaceRegistry.test.ts:16`) is a fully-typed literal with no `controlMutation` field, so adding a required field makes `pnpm exec tsc --noEmit` fail there, not in either file above. It is also where the new `validateSurface` rules get their behavioral cases.

**Sweep before editing the type, do not trust this list:** `grep -rn 'GuardSurface' tests/ lib/ scripts/` enumerates every consumer of the type. Each one either gains the field or is shown not to construct a `GuardSurface` literal.

**Interfaces:**
- Consumes: lib/reviewRounds/corpus.ts and lib/reviewRounds/count.ts (Task 6) as the mutated sources.
- Produces: a second enrolled `GuardSurface`, and a per-surface control mutation replacing the hardcoded one.

**Two things block a second surface today**, and both are part of this task. `EXPECTED_LEDGER_KINDS` (`tests/mutation/guardSurfaces.gate.test.ts:33`) requires an entry keyed by surface id — verified: it currently holds only `taskContract: { equivalent: 18, "accepted-gap": 2 }` and the suite asserts its key set equals the enrolled ids exactly. And the control mutation (`tests/mutation/guardSurfaces.gate.test.ts:110-129`) is hardcoded to `'if (kind !== "plan") return [];'`, a `taskContract` source string — verified live. A second surface fails on both until the control is generalized per surface.

- [ ] **Step 1: Write the failing tests**

In `tests/mutation/_metaGuardSurfaceRegistry.test.ts`, add the behavioral cases for the new `validateSurface` rules — the authoring-time half of the control's liveness guarantee:

```ts
  // Failure caught: a control whose `find` string is absent from the source.
  // The overlay applies nothing, the suite stays green, and the AC-3 liveness
  // probe reports success while proving nothing at all.
  it("rejects a control mutation that matches zero times", () => {
    expect(
      validateSurface({ ...VALID, controlMutation: { find: "no such text", replace: "x" } }),
    ).not.toEqual([]);
  });

  // Failure caught: an ambiguous control. Which site got mutated decides
  // whether the probe is meaningful, and "whichever String.replace hit first"
  // is not a decision anyone made.
  it("rejects a control mutation that matches more than once", () => {
    expect(
      validateSurface({ ...VALID, controlMutation: { find: "const", replace: "let" } }),
    ).not.toEqual([]);
  });

  it("accepts a control mutation that matches exactly once", () => {
    expect(validateSurface(VALID)).toEqual([]);
  });
```

`VALID` (`tests/mutation/_metaGuardSurfaceRegistry.test.ts:16`) gains a `controlMutation` in the same edit; without it the file does not typecheck once the field is required, and that failure is the first red state.

Then add the new surface's row to `EXPECTED_LEDGER_KINDS` and run the gate. It fails on the hardcoded control, which is the second red state.

- [ ] **Step 2: Generalize the control**

Add `controlMutation: { find: string; replace: string }` to `GuardSurface` (`tests/mutation/source/registry.ts:12-23`), validated in `validateSurface` (`registry.ts:41`) to require that `find` occurs **exactly once** in the surface's source — an authoring-time guard against a control that silently applies zero or many times. `taskContract` keeps its current pair, so its behavior is unchanged.

**Swapping the strings is not enough: the existing control proves nothing about the control.** The live test (`tests/mutation/guardSurfaces.gate.test.ts:110-129`) builds `broken`, asserts it differs from the source, then **discards it** and runs `runSurface` over every `equality-flip` mutant, asserting only `killed > 0`. Nothing ties the kill to the declared mutation. Its own comment says "one operator, one site", but no site is pinned. On the new surface that is not hypothetical: lib/reviewRounds/count.ts has two equality sites — the status conjunct in `countedRounds` and the contiguity comparison in `roundGaps` — so the contiguity mutant can be killed while the status-conjunct control **survives**, and AC-3 still reports success. That is the exact vacuity the control exists to rule out, inside the vacuity check.

The control therefore asserts its own mutant, by executing it — through the harness's existing overlay, never by writing the tracked file. Read `tests/mutation/source/runner.ts` before writing this: `runSuite(root, target, mutantFile, suite, context): number` (`tests/mutation/source/runner.ts:68`) returns the child's exit code, and `runSurface` (`tests/mutation/source/runner.ts:118-134`) shows the whole pattern — `mkdtempSync` a scratch dir, write the mutant text into a scratch mutant file, and pass the REAL `target` path alongside the scratch `mutantFile` so the overlay's `load` hook serves the mutant in its place.

The import section of `tests/mutation/guardSurfaces.gate.test.ts` grows to cover it. Its `node:fs` line (`tests/mutation/guardSurfaces.gate.test.ts:1`) and its runner line (`tests/mutation/guardSurfaces.gate.test.ts:5`) are extended in place rather than duplicated, so the whole section becomes:

```ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateGate } from "./source/gate";
import { GUARD_SURFACES } from "./source/registry";
import { runSuite, runSurface } from "./source/runner";

// ... and inside describe.each, replacing the AC-3 control case:
    it("kills the surface's DECLARED control mutant, proving the overlay is live (AC-3)", () => {
      // Failure caught: a control that proves nothing about the control. The
      // previous version built `broken`, DISCARDED it, and ran every
      // `equality-flip` mutant instead, asserting only `killed > 0`. On a
      // surface with two equality sites - lib/reviewRounds/count.ts has the
      // status conjunct in `countedRounds` and the contiguity comparison in
      // `roundGaps` - the contiguity mutant can be killed while the DECLARED
      // status-conjunct control survives, and AC-3 still reports success.
      const source = readFileSync(surface.sourcePath, "utf8");
      const { find, replace } = surface.controlMutation;
      // validateSurface already pins exactly-once; assert it here too, because
      // a control that applies zero times is the failure this test exists for.
      expect(source.split(find)).toHaveLength(2);
      const broken = source.replace(find, replace);
      expect(broken, "control mutation did not apply").not.toBe(source);

      // The overlay serves the mutant from a scratch file and NEVER writes
      // surface.sourcePath, so a thrown assertion cannot leave a mutant on the
      // tracked tree and no source restore is needed. The AC-4 case above stays
      // green for free.
      const scratch = mkdtempSync(join(tmpdir(), "fx-control-"));
      try {
        const mutantFile = join(scratch, "mutant.ts");
        writeFileSync(mutantFile, broken);
        const target = resolve(root, surface.sourcePath);
        // The DECLARED mutant, run against the surface's OWN suites. A zero
        // from every one of them means the suite cannot see this mutation.
        const codes = surface.suitePaths.map((suite) =>
          runSuite(root, target, mutantFile, suite, `${surface.id} control`),
        );
        expect(
          codes.some((code) => code !== 0),
          "the declared control mutant SURVIVED every suite",
        ).toBe(true);
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    });
```

This replaces the `runSurface(..., { operators: ["equality-flip"] })` probe rather than sitting beside it: that probe's only claim was liveness, and executing the declared mutant establishes liveness directly instead of inferring it from an unrelated mutant's death. `runSurface` keeps its other caller (`tests/mutation/guardSurfaces.gate.test.ts:49`), which is why it stays on the import line.

- [ ] **Step 3: Enroll the surface**

Add the `GUARD_SURFACES` row: `id: "reviewRoundEconomy"`, `sourcePath: "lib/reviewRounds/count.ts"`, `suitePaths: ["tests/reviewRounds/count.test.ts", "tests/docs/_metaReviewRoundEconomy.test.ts"]`, `operators: [...OPERATOR_NAMES]`, and a `scoreFloor` set from the measured score. Its control inverts the counting rule's status conjunct — the one mutation the suite must notice.

- [ ] **Step 4: Run the gate and record the ledger**

Run: `pnpm mutation:guards`
Expected: both surfaces pass their floor. Every survivor is triaged into `accepted` as `equivalent` or `accepted-gap` with a reason, and `EXPECTED_LEDGER_KINDS` records the resulting counts. **An unaccepted survivor is a real gap in the guard** — fix the guard, do not raise the floor.

- [ ] **Step 5: Commit**

```bash
git add tests/mutation/source/registry.ts tests/mutation/guardSurfaces.gate.test.ts \
        tests/mutation/_metaGuardSurfaceRegistry.test.ts
git commit -m "test(review-rounds): enroll the round-economy gate as a mutation surface"
```

---

### Task 12: Documentation, call sites, and the spec's documented limits

**Files:**
- Modify: `docs/superpowers/specs/ci/README.md` (row for the spec)
- Modify: `AGENTS.md` (codex-guard section: the required flags)
- Modify: `docs/superpowers/specs/ci/2026-08-04-review-round-economy.md` (§8.3 — plan resolutions R1–R3)
- Create: docs/review-rounds/README.md

- [ ] **Step 1: Add the spec README row**

The table already carries a row for this spec (verified: `docs/superpowers/specs/ci/README.md` last lines). Confirm it, and add a row for the plan if the README indexes plans.

- [ ] **Step 2: Update the AGENTS.md codex-guard contract**

Extend the dispatch bullet (`AGENTS.md:184`) so every documented invocation carries the flags:

> - All direct `codex exec` review/task dispatches SHOULD go through `node scripts/codex-guard.mjs review --brief <file> --cwd <dir> --out <dir> --stage <spec|plan|diff|task> --round <n>`. **`--stage` and `--round` are required** — a dispatch missing either exits 2 naming the flag, never silently skipping. `--stage task` records a non-review dispatch that is never counted toward the filing threshold.

Add a `docs/review-rounds/` bullet describing the corpus, the filing duty at `ROUND_THRESHOLD` counted rounds, and `pnpm review:economy`.

- [ ] **Step 3: Record the plan resolutions in the spec's documented limits**

Append to spec §8.3, continuing its numbering:

> 10. **A `--cwd` outside a git repository records nothing.** The wrapper warns on stderr and leaves the exit code and result.json untouched. Distinct from a detached HEAD (exit 2) deliberately: inside a repo, a detached HEAD is a live arc whose identity cannot be determined, so under-recording it silently is the §8.2 failure; outside a repo there is no arc to record.
> 11. **A filing may cite a DEFERRED entry by an id the gate does not recognize.** DEFERRED entries carry bare SHOUTY ids (`PSQL-GUARD-RECALL-RESIDUAL`), not a `DEF-` prefix, and the citation recognizer matches `BL-`/`DEF-` tokens only. An unrecognized token is not treated as a citation, so it is neither resolved nor rejected. Conservative under-check; widening the recognizer would classify ordinary prose as a citation.

Also correct §5.3's schema comment: `guardVersion` is a **number** (`scripts/codex-guard.mjs:21`), not a string.

- [ ] **Step 4: Write the corpus README**

Create docs/review-rounds/README.md explaining the layout (<branch>/<baseSha12>.jsonl + `.md`), that files are written by `scripts/codex-guard.mjs` at dispatch time and committed with the arc, that the gate is tests/docs/_metaReviewRoundEconomy.test.ts, and that the directory is legitimately empty until the first arc dispatched after this merges (spec §12).

This file also gives the otherwise-empty directory a reason to exist in git, so `docs/review-rounds/` is present in a fresh clone and the gate's `existsSync` guard is exercised against a real directory.

- [ ] **Step 5: Verify the full suite and the spec lint**

Run: `pnpm exec tsc --noEmit && pnpm spec:lint docs/superpowers/specs/ci/2026-08-04-review-round-economy.md && pnpm exec vitest run tests/docs/ tests/reviewRounds/ tests/codexGuard/ tests/scripts/ tests/mutation/`
Expected: 0 type errors, 0 hard lint findings, all suites green.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/ci/README.md AGENTS.md \
        docs/superpowers/specs/ci/2026-08-04-review-round-economy.md docs/review-rounds/README.md
git commit -m "docs(review-rounds): required flags, corpus layout, and three documented limits"
```

---

### Task 13: Self-review

- [ ] **Step 1: Spec coverage sweep**

For each spec section §5 through §11, name the task implementing it. Any section without one is a gap — add the task.

- [ ] **Step 2: Run the full affected suite plus a clean-checkout simulation**

Run: `pnpm exec vitest run tests/docs/ tests/reviewRounds/ tests/codexGuard/ tests/scripts/ tests/mutation/ && pnpm mutation:guards`

- [ ] **Step 3: Self-consistency sweep**

`grep -rn 'ROUND_THRESHOLD\|\b4 rounds\b' lib/ scripts/ tests/ docs/superpowers/specs/ci/2026-08-04-review-round-economy.md` — every bare `4` outside a fixture must be the imported constant.

- [ ] **Step 4: Class-sweep the findings from every review round before resubmitting**

On any finding, sweep the whole diff for the same *shape* before repairing the named instance (AGENTS.md cross-cutting discipline). Every peer not repaired in-branch gets a `BL-` row naming which exception applies — (a) needs a product decision, (b) fenced by a ratified scope decision, or (c) a redesign of a surface this PR does not touch. "Same defect, different file" is never sufficient.

---

### Task 14: Adversarial review (cross-model)

- [ ] **Step 1: Plan-stage cross-model review**

Dispatch `codex-guard review` against this plan with `--stage plan --round 1`. The brief carries: REVIEWER ONLY framing, fresh-eyes posture, the do-not-relitigate list (spec §1.1 rows 1–13 plus plan resolutions R1–R3), **and both convergence criteria** — the consequence bound (every arc correctly obliged, correctly exempt, or loudly refusing; a conservative demote plus a surfaced warning is a documented limit) and the threat-model fence (defends against an arc that forgets, not one that hides). It must also state the `VERDICT:` and `FINDINGS:` output contract.

Once Task 11 has landed, state the convergence criterion as **the mutation score plus an empty unaccepted-survivor set** — both machine-computed. A "the guard does not pin what it claims" finding is then admissible only with a surviving mutant from the declared operator set.

- [ ] **Step 2: Whole-diff cross-model review**

After implementation, a fresh-eyes whole-diff review with the same contract at `--stage diff`.

**Both cross-model gates are REQUIRED before merge** (AGENTS.md autonomous-ship). Codex/OpenAI credits were exhausted until 2026-08-10 21:36 as of 2026-08-04; if a gate is unreachable when implementation is otherwise complete, escalate at that point rather than merging without it.

- [ ] **Step 3: Execution handoff**

---

## Review Round 1 Triage

Ten findings, all confirmed against the live tree before repair. Recorded so a later round does not re-derive them.

| # | Finding | Repair |
| --- | --- | --- |
| 1 | HIGH - the adoption boundary hardcoded to a date **before** this feature can merge, so any arc merging in between is falsely accused of being silent | `adoptionBoundary(repoRoot)` (Task 2) reads the committer date of the first-parent commit on main that ADDED lib/reviewRounds/constants.ts, so it needs no follow-up commit and cannot be hand-set wrong. Not yet on main reads `null` ("not yet adopted", silent list withheld). The error direction is one-sided: too late is documented limit 7, too early is a false accusation |
| 2 | HIGH - the second-spelling recognizer accepted any git-valid token, inventing branch `M12.2` from the one real residue; the fixture also had no genuine non-first-parent merge (`main` never advanced, so the merge was already-up-to-date and created no commit) | Capture must contain a `/`. Fixture gains the live ambiguous subject and advances `main` before the took-main merge; two new tests pin both, one of them asserting `check-ref-format` **accepts** `M12.2` so the premise cannot rot |
| 3 | HIGH - Task 12's corpus README is an orphan filing by construction, so the live-corpus test could never be green | Discovery is keyed on the `^[0-9a-f]{12}\.(jsonl\|md)$` filename shape §5.2 already requires. Narrower AND stricter: it still catches the real orphan and now also rejects a filing whose stem is not a merge base |
| 4 | HIGH - `mkRun`, not `makeRun`, at all 19 call sites; Task 9 had no imports and two mangled template literals that swallowed the exit action | Renamed, imports added, both literals rebuilt |
| 5 | HIGH - `tests/codexGuard/signals.test.ts:104` spawns the wrapper directly, bypassing the harness default, so the hard cutover regresses the suite | New Step 3a edits that literal array, plus a `grep -rn '"review"'` sweep so the fix is not keyed to one known site |
| 6 | HIGH - the wrapper-error test could not reach the second writer: `buildConfig` and the whole `--lint-doc` block run at MODULE TOP LEVEL (`scripts/codex-guard.mjs:921` and `scripts/codex-guard.mjs:926`), before `main` is defined (`scripts/codex-guard.mjs:994`) | Trigger changed to a `CODEX_HOME` pointing at a plain file, which throws inside `main()` while leaving `cfg.out` writable; a structural test asserting an emit at both sites backs it up |
| 7 | MEDIUM - the `.mjs` bridge and the TypeScript module were tested separately, so they could drift on any case only one covered | Step 4a differential test drives **both** over one shared fixture list (tests/reviewRounds/_arcFixtures.ts), asserting identical results and full refusal-kind coverage |
| 8 | HIGH - Task 8's twelve report cases were empty placeholders and never imported `buildReport`, so Step 2 could not fail as claimed | Every body written, `Report` shape fixed in the plan, boundary and merged-arc list made injectable with production defaults |
| 9 | HIGH - `tests/mutation/_metaGuardSurfaceRegistry.test.ts:16` holds a typed `GuardSurface` literal, so requiring `controlMutation` breaks typecheck **there**; its validation had no behavioral case | File added to Task 11, three `validateSurface` cases written (zero matches, many matches, exactly one), plus a `grep -rn 'GuardSurface'` consumer sweep |
| 10 | MEDIUM - `FINDINGS: 2 or 7` recorded as `2`, an unanchored recognizer turning an ambiguous declaration into a false scalar | Regex end-anchored; three ambiguous single-line cases added |

Two classes were swept rather than patched at their named instance: every wrapper arg-vector construction (finding 5) and every `GuardSurface` consumer (finding 9) get a `grep` sweep in the task body, because "the one we know about" is what made both defects invisible in the first place.

## Review Round 2 Triage

Eight findings, all confirmed against the live tree before repair.

| # | Finding | Repair |
| --- | --- | --- |
| 1 | BLOCKING - the boundary repair referenced a "Task 12 Step 0" that did not exist, and **no commit inside this PR can hold a safe value**: any timestamp written before the merge is earlier than the merge, which is the direction that falsely accuses arcs | Replaced the constant with `adoptionBoundary(repoRoot)`, read from the one source that knows when the contract went live: the committer date of the first-parent commit on main that ADDED the constants module. Correct by construction, checkable, no follow-up commit |
| 2 | BLOCKING - three tasks' `git add` omitted files those tasks modify, so a clean checkout fails while the implementer's dirty worktree passes | All three fixed, then every one of the twelve commit blocks swept against its own steps |
| 3 | BLOCKING - pasted TypeScript fails the strict tsconfig: unguarded indexed dereferences under `noUncheckedIndexedAccess`, an unimported helper, and duplicate imports | Every instance fixed. A mechanical checker now backs this class (see below) |
| 4 | BLOCKING - Tasks 6, 7, 8 and 10 gave behavior lists instead of code, and `readArcs` was promised by Task 6 and consumed by Task 8 but never produced | Complete modules written for corpus.ts, mergedArcs.ts and review-economy.ts, `readArcs` among them; Task 10 is now an exact edit |
| 5 | BLOCKING - the generalized control still proved nothing about the control: the live test builds `broken`, **discards it**, and runs every `equality-flip` mutant asserting only `killed > 0`. count.ts has two equality sites, so the contiguity mutant can be killed while the status-conjunct control survives | The control now executes its declared mutant against the surface's own suites and asserts at least one goes RED. Liveness is established, not inferred. (Round 3 finding 4c replaced the disk-write with the harness's own overlay, so the tracked tree is never touched at all) |
| 6 | HIGH - the sweep returned two direct invocations and only one was handled; `tests/codexGuard/usage.test.ts:56`'s "missing --brief" case would exit 2 for the wrong reason and stay green, silently losing its coverage | New Step 3b passes the flags and tightens the assertion to name `--brief` |
| 7 | HIGH - `findingCount` was wired at one of two `parseVerdict` sites, so a `no_verdict` response or a rollout-recovered verdict declaring `FINDINGS: n` recorded `null`, which falsely means "not declared" | Both sites specified, both terminal writes named, two tests added |
| 8 | HIGH - Task 10 preferred dropping the tally while committing prose promising it | One contract in all three places: the declared count, or the literal `not declared`, never inferred and never dropped |

**Findings 3 and 6 were the same shape twice, so the second repair was mechanical rather than per-instance.** Round 1 and round 2 each spent a finding on pasted snippets that do not compile, one instance at a time, which is precisely the drip-feed the round-economy rules name as a review defect. A checker now extracts every fenced block and reports the shapes that actually bit here - unguarded indexed access, em dashes inside fences, mangled template literals, duplicate imports - and is waiver-aware in the same way the real linter is. It reports 0 problems over 54 blocks. It is filed rather than shipped in this PR (exception (c): it is a change to the spec-lint surface, which this PR does not otherwise touch).

## Review Round 3 Triage

Five findings, all confirmed against the live tree before repair. Four of the five are the system reporting a **false fact about itself** — an arc accused, a filing blessed, a tally contradicted — which is the one outcome the consequence bound forbids, so each carries a test that fails on the old behavior.

| # | Finding | Repair |
| --- | --- | --- |
| 1 | BLOCKING - `adoptionBoundary` passed no ref, so `git log` walked HEAD. On the branch that adds the constants module HEAD's first-parent history contains that addition, so the query returns the branch-local commit's date: a boundary EARLIER than the merge, which is the precise too-early failure the whole design exists to prevent | `main` inserted before the `--` separator, with the reason in the doc comment. Covered by a new "adoption boundary, production default" case in Task 8 that builds a real repo, asserts `null` while HEAD is the feature branch, merges `--no-ff`, and asserts the boundary equals the merge commit's `%cI` read back from the same repo. It is the ONLY case in that file that declines the injection, which is why the defect had no coverage at all |
| 2 | BLOCKING - the adoption merge reported ITSELF as silent. The boundary and this PR's own `mergedAt` are one commit's `%cI`, the pre-adoption test was strictly `<`, and this arc has no corpus by ratified design (spec §12) | Post-adoption is now strictly GREATER than the boundary; equality is pre-adoption. The contract goes live with that merge, not before it, so the merge that establishes the boundary cannot be obliged by it. New test asserts an arc whose `mergedAt` is `BOUNDARY` itself is absent from `silentArcs` and present in `preAdoptionMergeCount`, plus a Global Constraints bullet so neither side is relitigated |
| 3 | BLOCKING - an obliged arc passed with a malformed filing heading. `HEADING_LOOSE` builds a section with `declaredRounds: null`; its presence suppressed `missing_filing`, both body-field checks passed, and `count_mismatch` skipped `null` outright | A `null` round count is now a `filing_malformed` problem, checked FIRST in the section loop with a `continue`, so the heading's count is a precondition for reading anything else out of that section. New gate case pins the exact four-line filing that used to pass |
| 4 | BLOCKING - three fences still do not compile: Task 2's constants module calls `execFileSync` with no import; Task 4's block calls `readResult`, whose import arrived only in Task 5, so Task 4 is not independently runnable (TDD invariant 1); Task 11's control fence used an unimported `writeFileSync` and a NONEXISTENT `runSuites`, and wrote the mutant to the tracked source path | Import added; `readResult` moved onto Task 4's `./harness` line with Task 5's prose corrected to add nothing; Task 11 rewritten against the real primitive `runSuite` (`tests/mutation/source/runner.ts:68`) using the overlay pattern from `runSurface` (`tests/mutation/source/runner.ts:118-134`) - scratch dir, scratch mutant file, real `target`. No write to `surface.sourcePath` at all, so the source restore disappears with it |
| 5 | BLOCKING - the hook's declared tally still diverged from the corpus. The hook SUMMED matching lines across every `attempt-*.last-message.txt` in a round's out-dir; `parseFindingCount` reads ONE terminal message per dispatch. A round whose failed first attempt declares 2 and whose retry declares 1 records 1 and prints 3 | Task 10 now specifies the hook applying `parseFindingCount`'s rule point for point - terminal message only, fenced blocks elided, end-anchored pattern, ambiguity renders `not declared` - per round and never summed. Stated explicitly: the two must agree, and where both exist the corpus row is authoritative. Step 3 gains the divergence fixture as its third verification case |

**Finding 4 is the third round in a row to spend a finding on a fence that does not compile, so the repair is mechanical rather than per-instance.** The round-2 checker caught unguarded indexed access, fenced em dashes, mangled template literals, and duplicate imports; it had nothing to say about a name that is simply never imported, which is what all three instances here were. It now collects each fence's imports, declarations, destructured bindings and parameters, and reports any well-known Node or vitest API used without one — resolving names across fences that target the same file, so an append block is not read as importing nothing, and skipping indented-only excerpts, which have no import section to grow. It reports 0 problems over 54 blocks. Same disposition as round 2: filed, not shipped in this PR (exception (c) — it is a change to the spec-lint surface this PR does not otherwise touch).

## Review Round 4 Triage

Two findings, both confirmed against the live tree before repair. Both are the same failure the last round named: the system stating a **false fact about itself** — a declaration the reviewer made recorded as one it never gave, and a filing the spec forbids reported as compliant — so each carries a test that fails on the old behavior.

| # | Finding | Repair |
| --- | --- | --- |
| 1 | BLOCKING - `findingCount` diverged across terminal paths, and the hook read a different source than the corpus. Task 5 wired the count at the normal-success write and at `giveUp` only, so a reviewer that emitted `FINDINGS: 2` and was then interrupted (`scripts/codex-guard.mjs:1042-1058`) or hit a wrapper fault (`scripts/codex-guard.mjs:1066-1093`) recorded `null` — "not declared", which is a different and false claim. Separately, Task 10's hook read "the last non-empty attempt message", which disagrees with the corpus on a rollout-recovered dispatch (whose terminal message is `recovered-from-rollout.txt`) and on an exhausted run whose final attempt is empty | The count is computed at the TWO sites that read a terminal message and carried on `state.findingCount`; all FOUR terminal writers read that one carrier, three of them through a single `writeResult` default. Recomputing at four sites is four chances to diverge, which is the defect class itself. All four writers are now named in the task prose, and each unwired one gained a test: a SIGTERM landing after a declaring attempt, and a wrapper fault after one. The hook now prefers the dispatch's own result.json — the wrapper's resolved answer, and the value the corpus row holds — and scans message files only when none survives, preferring `recovered-from-rollout.txt` over the attempt files. Both divergence shapes are Step 3 fixtures, each run twice (with the result.json and without it) so the fallback is exercised too |
| 2 | HIGH - the gate blessed a filing stage the spec forbids. `checkCorpus` never checked a section's stage against `COUNTED_STAGES`, and against contiguous `task` rows plus a `## task — 0 rounds` section the two count checks positively agree with each other: `recorded.get("task")` is 4 so `stage_without_rows` stays silent, and `counted.get("task") ?? 0` equals the declared 0 so `count_mismatch` does too. Spec §6 item 1 permits only `spec`, `plan` and `diff`. The existing "four task rounds without a filing" case cannot reach this — it has no filing at all | New `stage_not_filable` kind, added to the `ProblemKind` union, which is its only enumeration in the plan (verified by grep over every kind name). It is raised FIRST in the section loop with a `continue`, ahead of the round-count check, because a section for a stage that carries no filing is not a filing and its count is not worth reading. New gate case uses exactly the passing shape and asserts the kind rather than merely "some problem" |

**Finding 1's repair turned up a peer in Task 4, repaired in place rather than filed.** Both new tests need a terminal path forced, and Task 4's wrapper-error test claimed a trigger that reaches none: a `CODEX_HOME` pointed at a plain file. Probed 2026-08-04 against the live wrapper — every read of `cfg.codexHome` is already guarded (the heartbeat `mkdir`, the cache rung, `findRollout`), so that dispatch runs to a clean `verdict` at exit 0, two runs out of two. The round-2 repair that introduced it (finding 6) was reasoned from module-load order and never probed, which is precisely the probe-less acceptance the admissibility contract charges as a review defect. Both tasks now plant a directory where an attempt's transcript file must be written: `createWriteStream` errors, the stream-error latch rejects with `fail()` (`scripts/codex-guard.mjs:561-564`), and that rejection leaves the attempt loop for `main().catch` while `cfg.out` stays writable. Probed the same day: exit 3, `failureReason: "wrapper_error"`.

## Review Round 5 Triage

One finding, confirmed against the live tree before repair. It is the third consecutive round on `findingCount`, and the same false fact each time: a declaration the reviewer made, recorded as one it never gave.

| # | Finding | Repair |
| --- | --- | --- |
| 1 | BLOCKING - the declared count was extracted only after guards that return early, so ordinary inputs recorded `null` ("not declared") despite a declaration. Round 4 computed the count at the two sites that read a terminal message but placed each call AFTER that site's verdict logic. `classifyAttempt` returns above the read when the attempt was killed or exited nonzero (`scripts/codex-guard.mjs:487-495`), and `tryRolloutScrape` continues immediately when the scraped text carries no verdict (`scripts/codex-guard.mjs:783-784`). Three ordinary inputs recorded a false `null`: a nonzero-exit or killed attempt whose `-o` message declared, a rollout message declaring a count with no `VERDICT:` line, and an attempt whose message landed before a SIGTERM that reached `onSignal` before any classification | The two extractions are decoupled: they share a READ and no CONTROL PATH. One text-taking primitive, `recordDeclaredCount`, holds the grain in one place (last NON-EMPTY terminal message wins, so an absent or empty later message never erases an earlier declaration), and every site that reads a terminal message calls it above every verdict guard, early return and acceptance branch. `classifyAttempt`'s read moves to the top of the function, above all four guards, keeping a `hasMsg` flag so `no_o_file` and `empty_o_file` stay distinguishable; the scrape records above its verdict guard; and `onSignal` gains a THIRD read site, because a hung attempt's message is never classified at all and the interrupt is its only chance. The task prose now states the rule as the design: verdict extraction and count extraction share a read but not a control path, and the round-4 placement failed by making a declared count conditional on a verdict, which the record schema never said it was. One test per input, each deriving its expectation from the `DECLARED` constant that built the scenario |

**Why the existing three wiring tests could not catch any of it, which is the reason this shipped twice.** The no-verdict case exits cleanly, so it never reaches an exit-shape guard; the rollout case includes a verdict, so the scrape's guard is never the one that fires; and the interrupted and wrapper-error cases both take their declaration from an EARLIER completed attempt, so the carrier is already set before the path under test runs. Three tests over three terminal paths, and all three enter through the one branch that was already correct. The new cases are chosen by the guard they must cross, not by the writer they must reach.

**The sweep this finding demands, run across the whole plan.** The shape is: a value the corpus records unconditionally, extracted inside a conditional branch. `findingCount` is the only unconditional-by-schema field the wrapper derives from reviewer output; every other row field is either identity resolved once per dispatch before any branch (Task 3's `branch`, `baseSha`, `arc`, and `stage` / `round` / `startedAt` straight off `cfg` and `state`) or is itself the branch outcome, where conditionality is the definition rather than a defect (`status`, `verdict`, `verdictLine`, `failureReason`, `recoveredFrom`). The report side reads only what the corpus holds and guards `null` explicitly at every total (Task 8's `undeclaredRows`). One near-peer surfaced and was repaired in place rather than filed: Task 10's fallback rule inherited the same defect from the other end — its "last non-empty attempt message" scan matches the wrapper on a nonzero-exit or killed attempt ONLY once Task 5's read sits above the exit-shape guards, so under the round-4 placement the advisory line and the corpus row disagreed there as well. Its one remaining blind spot, a scraped rollout that declared without a verdict and therefore wrote no file, is now stated as a documented limit of the fallback in Task 10 Step 1.

## Self-Review Record

**Spec coverage.** §5.1 → Task 1. §5.2 → Task 3. §5.3 → Tasks 2, 5. §5.4 → Tasks 4, 6. §5.5 → Task 6 (distinct-round counting). §6 → Task 6 (filing.ts). §7.1 → Task 6. §7.3 → Global Constraints (no new wiring; verified). §8.3 → Task 12. §9 → Tasks 7, 8. §10 items 1–10 → Tasks 1, 2+4, 5, 6, 8, 10, 12, 11, 9, 12 respectively. §11.1 → Tasks 1, 4, 5. §11.2 → Task 6. §11.3 layers 1–9 → Tasks 7, 8. §11.4 → Task 11.

**Placeholder scan.** Every step carries pasteable content. The four that once carried behavior lists rather than code — Task 6 Step 8 (corpus.ts), Task 7 Step 3 (mergedArcs.ts), Task 8 Step 3 (review-economy.ts), and Task 10 Step 2 (the hook repair) — now carry the module or, for the untracked per-machine hook, the exact edit plus the AGENTS.md prose that is its durable contract. The one deliberate non-code step is Task 10 Step 1, which reproduces a measured number rather than writing anything.

**Type consistency.** `ReviewRoundRow` is defined once (Task 2) and consumed unchanged by Tasks 4, 6, 8. `resolveArc`'s `ArcResolution` (Task 3) is mirrored by scripts/reviewRoundEmit.mjs (Task 4) — the two are deliberately parallel implementations, tested on both sides, because the wrapper cannot import TypeScript. `ROUND_THRESHOLD` is imported everywhere, never re-literalized. `countedRounds`/`recordedRounds`/`roundGaps` keep the same names across Tasks 6, 8, and 11.

**Three defects the verification pass caught in this plan's own first draft**, recorded because each is a class the project's writing-plans rules name explicitly:

1. **An invented fixture shape.** Every wrapper test snippet used `writeScenario(run, [{ kind: "verdict", text }])`. That shape does not exist. The real one is `{ onCall: <n>, actions: [{ type: "lastMessage", text }, { type: "exit", code: 0 }] }` — verified at `tests/codexGuard/lock.test.ts:18-31` and `tests/codexGuard/signals.test.ts:33-38`; the action vocabulary is `stdout` / `stderr` / `lastMessage` / `hang` / `exit` / `grandchild` (`tests/codexGuard/fixtures/fake-codex.mjs:51-85`). All 19 occurrences were rewritten. This is precisely the paste-time defect the "typecheck pasted snippets" rule exists to catch, and it would have cost a full review round.
2. **A test directory that runs in the wrong project.** `BASE_INCLUDE` (`vitest.projects.ts:34`) means a new tests/reviewRounds/ is never dark — but it lands in `serial`, inside the DB-booting `unit-suite-db`. Task 7 Step 5 now adds the one glob, and verifies the move rather than trusting the edit.
3. **`guardVersion` typed as a string** from the spec's schema sketch, against `const GUARD_VERSION = 1` (`scripts/codex-guard.mjs:21`). Resolved as R3.

**Verification pass.** Every `file:line` in this plan was checked against the live tree on 2026-08-04: `scripts/codex-guard.mjs` (`scripts/codex-guard.mjs:21` `GUARD_VERSION = 1`, `scripts/codex-guard.mjs:43` `usageError`, `scripts/codex-guard.mjs:54` `num`, `scripts/codex-guard.mjs:71-83` `takesValue`, `scripts/codex-guard.mjs:100` `buildConfig`, `scripts/codex-guard.mjs:130` label validation, `scripts/codex-guard.mjs:132-134` required flags, `scripts/codex-guard.mjs:158` cwd validation, `scripts/codex-guard.mjs:162` lint-doc resolution, `scripts/codex-guard.mjs:392` `parseVerdict` filter, `scripts/codex-guard.mjs:693-712` `writeResult`, `scripts/codex-guard.mjs:1026` `giveUp`, `scripts/codex-guard.mjs:1075-1093` wrapper-error catch); `tests/codexGuard/harness.ts` (`tests/codexGuard/harness.ts:127` non-repo `cwdDir`, `tests/codexGuard/harness.ts:169-206` `runGuard`, `tests/codexGuard/harness.ts:208` `readResult`); `tests/docs/_ledgerMdast.ts` (`tests/docs/_ledgerMdast.ts:300` `ExtractOpts`, `tests/docs/_ledgerMdast.ts:313` `extractEntries`, `tests/docs/_ledgerMdast.ts:358` `bodyDefinedIds`, `tests/docs/_ledgerMdast.ts:402` `ledgerIds`); `tests/docs/_metaLedgerReferentialIntegrity.test.ts` (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:42` `BACKLOG_OPTS`, the four-file `LEDGERS` list, exported `definedIds`); `tests/docs/_metaDeferralLedgerGraduation.test.ts` (`tests/docs/_metaDeferralLedgerGraduation.test.ts:58-59` both option sets); `tests/mutation/source/registry.ts` (`tests/mutation/source/registry.ts:12-23` `GuardSurface`, `tests/mutation/source/registry.ts:41` `validateSurface`, `tests/mutation/source/registry.ts:120` `GUARD_SURFACES`); `tests/mutation/source/operators.ts` (`tests/mutation/source/operators.ts:17-24` `OPERATOR_NAMES`, six operators); `tests/mutation/guardSurfaces.gate.test.ts` (`tests/mutation/guardSurfaces.gate.test.ts:33` `EXPECTED_LEDGER_KINDS`, `tests/mutation/guardSurfaces.gate.test.ts:110-129` hardcoded control); `vitest.projects.ts:134`; `vitest.config.ts:114`; `.github/workflows/unit-suite.yml` (`.github/workflows/unit-suite.yml:135` `unit-suite-nodb`, `.github/workflows/unit-suite.yml:152` depth-1 fetch, `.github/workflows/unit-suite.yml:176` aggregator); `scripts/spec-lint.ts:210`; `package.json:27-28`, `package.json:53`. Three mismatches with the spec were found and are resolved as R1–R3 above.
