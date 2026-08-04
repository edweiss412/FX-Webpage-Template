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
- **`ADOPTION_BOUNDARY` is a DECLARED ISO-8601 constant** (spec §9), never computed at report time. A boundary derived from the corpus is silently wrong twice: it files any arc merging between the wrapper shipping and the first row landing as pre-adoption, and on an empty corpus it is `null`, so every silent arc is undiscoverable in precisely the state where the list matters most. The observed earliest `startedAt` survives only as an advisory mismatch line.
- **The boundary's error direction is one-sided, and the plan must not guess it.** Too EARLY accuses arcs that merged before the contract was live of being silent — a false statement the report prints as fact. Too LATE only excludes a few covered arcs, which is documented limit 7 (conservative under-obligation). The constant is therefore set in the **PR's last commit**, to that commit's own committer timestamp (Task 12 Step 0), and ships as `null` until then. `null` renders as "not yet adopted" with no silent-arc list — never as the epoch, which would accuse all 668 pre-adoption merges at once.
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
- Create: tests/codexGuard/reviewRounds.test.ts

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `cfg.stage` (one of `"spec" | "plan" | "diff" | "task"`) and `cfg.round` (integer ≥ 1) on the config object that Tasks 3–5 read.

**Why the harness needs a default.** The flags are required at the CLI, and `runGuard` (`tests/codexGuard/harness.ts:169`) builds a fixed arg list with no stage or round. Making the flags required without touching the harness turns every existing `tests/codexGuard` test red with exit 2. `runGuard` therefore injects `--stage spec --round 1` **only when `extraArgs` supplies neither**, so existing tests keep passing and a test that wants to exercise flag validation can still pass its own (including invalid) values.

**`runGuard` is NOT the only invocation, and the other one must be fixed by hand.** `tests/codexGuard/signals.test.ts:104` spawns the wrapper directly:

```ts
    const child = spawn(
      process.execPath,
      [GUARD, "review", "--brief", run.briefPath, "--cwd", run.cwdDir, "--out", run.outDir],
```

It bypasses the harness entirely, so the default injection never reaches it. After the hard cutover it exits 2 before spawning the fixture, and its assertions expect pid files and exit 3 (`tests/codexGuard/signals.test.ts:115-129`) — the suite regresses. Step 3a below adds `"--stage", "spec", "--round", "1"` to that literal array. **Sweep before implementing, do not trust this list:** `grep -rn '"review"' tests/ scripts/ .github/` finds every construction of a wrapper arg vector, and each one either goes through `runGuard` or gets the flags inline.

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

Then run the sweep and confirm it returns no other bare construction:

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
git add scripts/codex-guard.mjs tests/codexGuard/harness.ts tests/codexGuard/reviewRounds.test.ts
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
 * DIRECTION MATTERS, and only one direction is safe. Too EARLY is a defect: an
 * arc that merged before the contract was live is then reported as a
 * post-adoption silent arc, which is a false accusation the report prints as
 * fact. Too LATE merely excludes a few genuinely-covered arcs from the silent
 * list, which is the same conservative under-obligation already accepted as
 * documented limit 7. So this value is set in the PR's LAST commit, to that
 * commit's own committer timestamp, and it is never guessed at draft time.
 *
 * PLACEHOLDER until Task 12 Step 0 sets it. `null` means "not yet adopted":
 * the report says so by name and lists no silent arcs, rather than treating an
 * unset constant as the epoch and accusing all 668 pre-adoption merges.
 */
export const ADOPTION_BOUNDARY: string | null = null;
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
- Create: scripts/reviewRoundEmit.mjs (ESM bridge — see below)
- Modify: tests/codexGuard/reviewRounds.test.ts

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
    expect(rows[0]).toMatchObject({
      stage: "diff",
      round: 2,
      branch: "feat/emit",
      baseSha: base.slice(0, 12),
      status: "verdict",
      verdict: "APPROVE",
    });
    // Failure caught: a row whose identity disagrees with its own path - a
    // false identity in the committed corpus that the report prints as fact.
    expect(rows[0].baseSha).toBe(base.slice(0, 12));
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
  // main(): pointing CODEX_HOME at a plain FILE makes the cache/lock work in
  // the attempt loop throw, while cfg.out stays writable so the wrapper-error
  // result.json is still produced.
  it("appends a row from the wrapper_error site too", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    writeScenario(run, [{ onCall: 1, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] }]);

    const notADir = join(run.dir, "codex-home-as-a-file");
    writeFileSync(notADir, "");
    const { code } = await runGuard(run, ["--stage", "spec", "--round", "1"], {
      CODEX_HOME: notADir,
    });
    expect(code).not.toBe(2);

    // Confirm the fault really took the second writer, not the first: a
    // wrapper_error result is the ONLY body that carries this failureReason
    // (scripts/codex-guard.mjs:1087).
    expect(readResult(run)).toMatchObject({ status: "no_verdict", failureReason: "wrapper_error" });
    const rows = rowsIn(corpusPath(run.cwdDir, base));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "no_verdict", failureReason: "wrapper_error" });
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
    expect(rows[0]).toMatchObject({ status: "no_verdict", verdict: null });
    expect(rows[0].failureReason).toBe("attempts_exhausted");
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

/** Every arc-resolution case Task 3 defines, as (name, repo-builder) pairs. */
const CASES = arcFixtureCases(); // feature branch, subdirectory cwd, reused
                                 // branch, plain dir, detached HEAD, on main,
                                 // no merge base

describe("bridge parity: scripts/reviewRoundEmit.mjs vs lib/reviewRounds/arc.ts", () => {
  // Failure caught: the bridge losing a branch of the contract while the
  // TypeScript suite stays green. `on_main` is the sharp case - a bridge that
  // dropped it would write a corpus directory for an arc that does not exist,
  // and no test in Task 3 would notice, because Task 3 never runs the bridge.
  it.each(CASES)("agrees on %s", (_name, build) => {
    const cwd = build();
    const ts = tsResolveArc(cwd);
    const js = jsResolveArc(cwd);
    expect(js.ok).toBe(ts.ok);
    if (ts.ok && js.ok) {
      expect(js.branch).toBe(ts.branch);
      expect(js.baseSha).toBe(ts.baseSha);
      expect(js.corpusFile).toBe(ts.corpusFile);
    } else if (!ts.ok && !js.ok) {
      expect(js.kind).toBe(ts.kind);
    }
  });

  // Failure caught: a parity suite that passes because it exercises nothing.
  // Derived from the case list, never a literal.
  it("covers every refusal kind the contract defines", () => {
    const kinds = new Set(
      CASES.map(([, build]) => tsResolveArc(build())).filter((r) => !r.ok).map((r) => r.kind),
    );
    expect([...kinds].sort()).toEqual(
      ["detached_head", "no_merge_base", "not_a_repo", "on_main"].sort(),
    );
  });
});
```

Extract `arcFixtureCases()` into tests/reviewRounds/_arcFixtures.ts in this step and have tests/reviewRounds/arc.test.ts consume it too, so one list feeds both suites. That shared list is what makes the parity lock automatic rather than another thing to remember.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/codexGuard/reviewRounds.test.ts tests/reviewRounds/bridgeParity.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole codex-guard suite**

Run: `pnpm exec vitest run tests/codexGuard/`
Expected: PASS. Every pre-existing scenario runs against a non-repo `cwdDir`, so it takes the `not_a_repo` warn-and-skip path (plan R1) — a red run here means that path throws.

- [ ] **Step 7: Commit**

```bash
git add scripts/codex-guard.mjs scripts/reviewRoundEmit.mjs tests/codexGuard/reviewRounds.test.ts
git commit -m "feat(review-rounds): emit a corpus row from both result.json write sites"
```

---

### Task 5: `FINDINGS: <n>` declared line

**Files:**
- Modify: `scripts/codex-guard.mjs` (a `parseFindingCount` beside `parseVerdict` at `scripts/codex-guard.mjs:389`, threaded into the result body)
- Modify: `AGENTS.md` (brief-authoring contract, `AGENTS.md:186`)
- Modify: tests/codexGuard/reviewRounds.test.ts

**Interfaces:**
- Consumes: the row writer of Task 4.
- Produces: `findingCount` populated on rows whose reviewer declared it.

**Contract, verbatim, for the AGENTS.md edit:** the brief MUST instruct the reviewer to end with a final `VERDICT: <outcome>` line **and** a `FINDINGS: <n>` line. The wrapper detects both; it does not inject either instruction.

- [ ] **Step 1: Write the failing tests**

Append to tests/codexGuard/reviewRounds.test.ts:

```ts
describe("declared finding count (spec §5.3)", () => {
  // Failure caught: a count inferred from prose shape. The probe measured
  // inferred recognition at 64.8% against 681 real outputs; declared reaches
  // 99.6%. A recognizer here is the denylist shape the accept-set rule forbids.
  it("records the declared count", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    writeScenario(run, [{ onCall: 1, actions: [{ type: "lastMessage", text: "FINDINGS: 5\nVERDICT: BLOCKING\n" }, { type: "exit", code: 0 }] }]);
    await runGuard(run, ["--stage", "diff", "--round", "1"]);
    expect(rowsIn(corpusPath(run.cwdDir, base))[0].findingCount).toBe(5);
  });

  it("records 0 as 0, distinct from undeclared", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    writeScenario(run, [{ onCall: 1, actions: [{ type: "lastMessage", text: "FINDINGS: 0\nVERDICT: APPROVE\n" }, { type: "exit", code: 0 }] }]);
    await runGuard(run, ["--stage", "diff", "--round", "1"]);
    expect(rowsIn(corpusPath(run.cwdDir, base))[0].findingCount).toBe(0);
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
    expect(rowsIn(corpusPath(run.cwdDir, base))[0].findingCount).toBeNull();
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
      expect(rowsIn(corpusPath(run.cwdDir, base))[0].findingCount).toBeNull();
    },
  );

  // Failure caught: an ambiguous double declaration silently taking the first.
  it("records null when two different counts are declared", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    writeScenario(run, [{ onCall: 1, actions: [{ type: "lastMessage", text: "FINDINGS: 2\nFINDINGS: 7\nVERDICT: BLOCKING\n" }, { type: "exit", code: 0 }] }]);
    await runGuard(run, ["--stage", "diff", "--round", "1"]);
    expect(rowsIn(corpusPath(run.cwdDir, base))[0].findingCount).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/codexGuard/reviewRounds.test.ts -t "declared finding count"`
Expected: FAIL — `findingCount` is `null` on every row, so the first two cases fail.

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

Call it where the verdict is parsed and pass the value into the `writeResult` patch so it reaches the row. `findingCount` is **not** added to the result.json body's own schema — it is a corpus field; the bridge already reads `body.findingCount ?? null`, so attaching it to the patch is sufficient and does not change the wrapper's published result shape.

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
  - `readArcs(root: string): Arc[]` where `Arc = { dir: string; branch: string; baseSha: string; corpusPath: string | null; filingPath: string | null; rows: …; filingText: string | null }`

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

Create lib/reviewRounds/corpus.ts exporting `type Problem = { kind: ProblemKind; message: string }` and `checkCorpus(root: string, opts?: { resolvableIds?: Set<string> }): Problem[]`, with `ProblemKind` covering `malformed_row | identity_mismatch | round_gap | missing_filing | filing_malformed | unresolved_id | stage_without_rows | count_mismatch | duplicate_section | orphan_filing`.

Behavior, in order:

1. **Walk `join(root, CORPUS_DIR)` recursively**, collecting every file whose basename matches `/^[0-9a-f]{12}\.(jsonl|md)$/` — corpora **and** filings, since a `.jsonl`-first walk never visits an orphan filing. Every other file is ignored by name, which is what keeps docs/review-rounds/README.md from being a permanent orphan. `existsSync` guard first: an absent `docs/review-rounds/` is a legal clean state, not a failure.
2. For each arc file, derive expected `branch` (the path segments between `docs/review-rounds/` and the file) and `baseSha` (the file stem).
3. Parse each `.jsonl` line with `parseRow`; a failure yields `malformed_row` naming the repo-relative file and the 1-indexed line.
4. Every row's `branch`/`baseSha` must equal the path-derived pair → `identity_mismatch`.
5. `roundGaps(rows)` → `round_gap` per stage.
6. `countedRounds(rows)`: any stage at or above `ROUND_THRESHOLD` requires a filing section for that stage → `missing_filing` (message includes the `baseSha`, so the reused-branch test can assert which arc).
7. `parseFiling(filingText)`: each section must have `hasExamined` and `hasDisposition` → `filing_malformed`; a stage with zero rows → `stage_without_rows`; `declaredRounds` not equal to that stage's counted rounds → `count_mismatch`; two sections for one stage → `duplicate_section`.
8. Cited ids resolve against `opts.resolvableIds ?? liveLedgerIds(root)` → `unresolved_id`.
9. A a filing named for the arc's baseSha12 with no a corpus named for the arc's baseSha12 beside it → `orphan_filing`. Non-arc-shaped files are never candidates, so a README is not an orphan.

`liveLedgerIds(root)` builds the resolvable set with `ledgerIds` and `bodyDefinedIds` from `tests/docs/_ledgerMdast.ts` (`_ledgerMdast.ts:402`, `_ledgerMdast.ts:358`) over the four ledgers — `BACKLOG.md` and `BACKLOG-archive.md` under `{ requirePrefix: "BL-", levels: [2, 3] }`, `DEFERRED.md` and `DEFERRED-archive.md` under `{ requirePrefix: null, levels: [3] }` (plan R2). It does **not** import `definedIds` from `tests/docs/_metaLedgerReferentialIntegrity.test.ts`: that symbol is exported from a `*.test.ts` module, and importing it re-registers that file's whole suite.

- [ ] **Step 9: Run the gate to verify it passes**

Run: `pnpm exec vitest run tests/docs/_metaReviewRoundEconomy.test.ts`
Expected: PASS (21 cases).

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

Create lib/reviewRounds/mergedArcs.ts. Requirements, each traceable to a measured number in spec §9:

- `git rev-parse --is-shallow-repository` first. `true` → return `{ shallow: true, recognized: [], unrecognized: [] }`. The caller must refuse to present a shallow scan as complete history.
- `git log --merges --first-parent main --format=%H%x1f%s%x1f%cI`. **`--first-parent`, not bare `--merges`:** 239 of 916 real merge commits are main merged *into* a feature branch, and counting them would invent hundreds of silent arcs.
- Accept-set over subjects, keyed on structure:
  - `/^Merge pull request #(\d+) from [^/\s]+\/(.+)$/` — branch is capture 2, **the whole path after `owner/`**.
  - `/^Merge PR #(\d+): (\S+\/\S+)/` — the second spelling. The capture **must contain a `/`**. "Parses as a branch path" is NOT a sufficient test: the one real residue in this repository's history is `Merge PR #4: M12.2 Phase B1 — admin nav shell + settings shell`, and `git check-ref-format --branch M12.2` **exits 0** — ordinary git validation accepts it. A recognizer keyed on git-validity therefore invents the branch `M12.2`, joins the corpus against a branch that never existed, and silently converts the one commit the spec requires to be reported as `unrecognized` into a fictitious arc. Requiring a `/` keeps it in the residue, which is where §9 measured it and why §9 insists the residue be reported by subject rather than assumed empty.
- Everything outside the accept-set is pushed to `unrecognized` **with its subject and sha**, never dropped and never guessed at. A denylist over subjects would accept whatever it failed to model.
- `baseSha` = `git merge-base <sha>^1 <sha>^2`, first 12 chars. **Never the first parent**, which equals the merge base only when main did not advance after the branch diverged. A merge without two parents goes to `unrecognized`.

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
- Produces: `buildReport(repoRoot): Report` and a CLI that prints it. Read-only; gates nothing; exit 0 always except on its own usage error.

**Every output §9 promises gets behavioral coverage.** "Read-only" buys no test relief — the report presents its output as fact.

- [ ] **Step 1: Write the failing tests**

Append to tests/reviewRounds/report.test.ts — one describe per §9 output, each fixture-driven:

```ts
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { ADOPTION_BOUNDARY, ROUND_THRESHOLD } from "../../lib/reviewRounds/constants";
import { buildReport } from "../../scripts/review-economy";

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

/** The report's boundary in tests is injected, never the shipped constant:
 *  ADOPTION_BOUNDARY is null until Task 12 sets it, and a suite that read the
 *  real one would change behavior the day it is set. */
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

**`buildReport` takes its boundary and its merged-arc list as options.** Both default to the production values — `ADOPTION_BOUNDARY` and `mergedArcs(repoRoot)` — and both are injectable, for the two reasons the tests above make concrete: the shipped constant is `null` until Task 12 sets it, so a suite reading it directly would change behavior the day it is set; and the silent-arc join needs merged arcs that do not exist in any fixture repo's real history. The injection points are the seam, not a test-only backdoor: the CLI passes neither and gets production behavior.

**`Report` shape**, fixed here so no field is invented at implementation time:

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

Create scripts/review-economy.ts. Definitions, verbatim from spec §9 — each exists because the alternative reports conflicting facts:

- **Rounds per stage per arc**, counted vs recorded. Never collapsed across stages.
- **Trigger rate by month.** Population: `(arc, stage)` pairs having at least one counted row. A pair is bucketed by the month of its **first counted row's `startedAt`**, and counts as triggered if it **ever** reached `ROUND_THRESHOLD`. Rate is triggered ÷ population within the bucket.
- **Finding-count totals by stage**, over rows where the declared line was present. Rows with `findingCount: null` are **excluded** and reported separately as a count of undeclared rows.
- **Silent arcs**: arcs that merged with zero rows in the corpus. Joined on `(branch, baseSha)`, never on branch alone.
- **Adoption boundary**: the **declared** `ADOPTION_BOUNDARY` constant (Task 2), never the earliest `startedAt` observed. Merges before it are excluded from the silent list and reported once as a single count of pre-adoption merges, never enumerated. Merges at or after it with zero rows ARE silent, **including when the corpus is empty**. If the corpus's earliest `startedAt` precedes the constant, print an advisory mismatch line — that means the constant is wrong.
- **Shallow refusal**: on `mergedArcs(...).shallow`, skip the merged-arc scan and say so by name. The silent-arc field is **withheld, not emptied** — `silentArcs: null` with a stated reason, never `[]`. An empty array and a withheld result must be distinguishable, or a caller (and the test at Step 1) cannot tell a refusal from a clean scan.

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

**This file is outside the repo** and cannot be committed here. The repair is applied on this machine and the *contract* is recorded in `AGENTS.md`, which is the durable cross-CLI source of truth — the same posture AGENTS.md already takes for the reaper hook.

- [ ] **Step 1: Reproduce the wrong number**

Run the probe's recognizer counts against the corpus described in `docs/superpowers/specs/ci/probes/2026-08-04-finding-format-probe.md` and confirm the numbered-bold pattern alone reports 327/681. Record the command and its output in the commit message.

- [ ] **Step 2: Apply the repair**

Prefer **dropping the number** over printing a wrong one: the hook's job is to block a dispatch and explain why, and the finding tally is not load-bearing for that. If a number is kept, it must be the declared `FINDINGS:` line from Task 5 (100% reliable where present) with an explicit "not declared" rendering otherwise — never an inferred count.

- [ ] **Step 3: Verify the hook still blocks**

Run a dispatch that should be blocked (a 5th round on an artifact with four prior `.review/` dirs) and confirm the block message appears with no wrong tally.

- [ ] **Step 4: Record the contract in AGENTS.md**

Add to the convergence-criterion section, beside the existing install one-liner:

> The hook's advisory finding tally was measured at 48.0% accuracy against 681 real reviewer outputs (`docs/superpowers/specs/ci/probes/2026-08-04-finding-format-probe.md`) because it inferred findings from a numbered-bold pattern. It now reports the reviewer's declared `FINDINGS: <n>` line or says "not declared" — never an inferred count. The hook is per-machine; this paragraph is the durable contract.

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

Add `controlMutation: { find: string; replace: string }` to `GuardSurface` (`tests/mutation/source/registry.ts:12-23`), validated in `validateSurface` (`registry.ts:41`) to require that `find` occurs **exactly once** in the surface's source — an authoring-time guard against a control that silently applies zero or many times. Replace the hardcoded strings at `guardSurfaces.gate.test.ts:110-129` with `surface.controlMutation`. `taskContract` keeps its current pair, so its behavior is unchanged.

- [ ] **Step 3: Enroll the surface**

Add the `GUARD_SURFACES` row: `id: "reviewRoundEconomy"`, `sourcePath: "lib/reviewRounds/count.ts"`, `suitePaths: ["tests/reviewRounds/count.test.ts", "tests/docs/_metaReviewRoundEconomy.test.ts"]`, `operators: [...OPERATOR_NAMES]`, and a `scoreFloor` set from the measured score. Its control inverts the counting rule's status conjunct — the one mutation the suite must notice.

- [ ] **Step 4: Run the gate and record the ledger**

Run: `pnpm mutation:guards`
Expected: both surfaces pass their floor. Every survivor is triaged into `accepted` as `equivalent` or `accepted-gap` with a reason, and `EXPECTED_LEDGER_KINDS` records the resulting counts. **An unaccepted survivor is a real gap in the guard** — fix the guard, do not raise the floor.

- [ ] **Step 5: Commit**

```bash
git add tests/mutation/source/registry.ts tests/mutation/guardSurfaces.gate.test.ts
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
| 1 | HIGH - `ADOPTION_BOUNDARY` hardcoded to a date **before** this feature can merge, so any arc merging in between is falsely accused of being silent | The constant ships `null` ("not yet adopted", no silent list) and is set in the PR's **last** commit to that commit's own timestamp (Task 12 Step 0). The error direction is now one-sided: too late is documented limit 7, too early is a false accusation |
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

## Self-Review Record

**Spec coverage.** §5.1 → Task 1. §5.2 → Task 3. §5.3 → Tasks 2, 5. §5.4 → Tasks 4, 6. §5.5 → Task 6 (distinct-round counting). §6 → Task 6 (filing.ts). §7.1 → Task 6. §7.3 → Global Constraints (no new wiring; verified). §8.3 → Task 12. §9 → Tasks 7, 8. §10 items 1–10 → Tasks 1, 2+4, 5, 6, 8, 10, 12, 11, 9, 12 respectively. §11.1 → Tasks 1, 4, 5. §11.2 → Task 6. §11.3 layers 1–9 → Tasks 7, 8. §11.4 → Task 11.

**Placeholder scan.** Task 8 Step 1 is the one place carrying test *shapes* rather than full bodies. That is deliberate and bounded: the fixture set and the failure each case catches are fixed here at plan time, and the step is explicit that bodies are filled in from the `check()` and `fixtureRepo()` helpers established in Tasks 6 and 7 before the step is checked off. No other step defers content.

**Type consistency.** `ReviewRoundRow` is defined once (Task 2) and consumed unchanged by Tasks 4, 6, 8. `resolveArc`'s `ArcResolution` (Task 3) is mirrored by scripts/reviewRoundEmit.mjs (Task 4) — the two are deliberately parallel implementations, tested on both sides, because the wrapper cannot import TypeScript. `ROUND_THRESHOLD` is imported everywhere, never re-literalized. `countedRounds`/`recordedRounds`/`roundGaps` keep the same names across Tasks 6, 8, and 11.

**Three defects the verification pass caught in this plan's own first draft**, recorded because each is a class the project's writing-plans rules name explicitly:

1. **An invented fixture shape.** Every wrapper test snippet used `writeScenario(run, [{ kind: "verdict", text }])`. That shape does not exist. The real one is `{ onCall: <n>, actions: [{ type: "lastMessage", text }, { type: "exit", code: 0 }] }` — verified at `tests/codexGuard/lock.test.ts:18-31` and `tests/codexGuard/signals.test.ts:33-38`; the action vocabulary is `stdout` / `stderr` / `lastMessage` / `hang` / `exit` / `grandchild` (`tests/codexGuard/fixtures/fake-codex.mjs:51-85`). All 19 occurrences were rewritten. This is precisely the paste-time defect the "typecheck pasted snippets" rule exists to catch, and it would have cost a full review round.
2. **A test directory that runs in the wrong project.** `BASE_INCLUDE` (`vitest.projects.ts:34`) means a new tests/reviewRounds/ is never dark — but it lands in `serial`, inside the DB-booting `unit-suite-db`. Task 7 Step 5 now adds the one glob, and verifies the move rather than trusting the edit.
3. **`guardVersion` typed as a string** from the spec's schema sketch, against `const GUARD_VERSION = 1` (`scripts/codex-guard.mjs:21`). Resolved as R3.

**Verification pass.** Every `file:line` in this plan was checked against the live tree on 2026-08-04: `scripts/codex-guard.mjs` (`scripts/codex-guard.mjs:21` `GUARD_VERSION = 1`, `scripts/codex-guard.mjs:43` `usageError`, `scripts/codex-guard.mjs:54` `num`, `scripts/codex-guard.mjs:71-83` `takesValue`, `scripts/codex-guard.mjs:100` `buildConfig`, `scripts/codex-guard.mjs:130` label validation, `scripts/codex-guard.mjs:132-134` required flags, `scripts/codex-guard.mjs:158` cwd validation, `scripts/codex-guard.mjs:162` lint-doc resolution, `scripts/codex-guard.mjs:392` `parseVerdict` filter, `scripts/codex-guard.mjs:693-712` `writeResult`, `scripts/codex-guard.mjs:1026` `giveUp`, `scripts/codex-guard.mjs:1075-1093` wrapper-error catch); `tests/codexGuard/harness.ts` (`tests/codexGuard/harness.ts:127` non-repo `cwdDir`, `tests/codexGuard/harness.ts:169-206` `runGuard`, `tests/codexGuard/harness.ts:208` `readResult`); `tests/docs/_ledgerMdast.ts` (`tests/docs/_ledgerMdast.ts:300` `ExtractOpts`, `tests/docs/_ledgerMdast.ts:313` `extractEntries`, `tests/docs/_ledgerMdast.ts:358` `bodyDefinedIds`, `tests/docs/_ledgerMdast.ts:402` `ledgerIds`); `tests/docs/_metaLedgerReferentialIntegrity.test.ts` (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:42` `BACKLOG_OPTS`, the four-file `LEDGERS` list, exported `definedIds`); `tests/docs/_metaDeferralLedgerGraduation.test.ts` (`tests/docs/_metaDeferralLedgerGraduation.test.ts:58-59` both option sets); `tests/mutation/source/registry.ts` (`tests/mutation/source/registry.ts:12-23` `GuardSurface`, `tests/mutation/source/registry.ts:41` `validateSurface`, `tests/mutation/source/registry.ts:120` `GUARD_SURFACES`); `tests/mutation/source/operators.ts` (`tests/mutation/source/operators.ts:17-24` `OPERATOR_NAMES`, six operators); `tests/mutation/guardSurfaces.gate.test.ts` (`tests/mutation/guardSurfaces.gate.test.ts:33` `EXPECTED_LEDGER_KINDS`, `tests/mutation/guardSurfaces.gate.test.ts:110-129` hardcoded control); `vitest.projects.ts:134`; `vitest.config.ts:114`; `.github/workflows/unit-suite.yml` (`.github/workflows/unit-suite.yml:135` `unit-suite-nodb`, `.github/workflows/unit-suite.yml:152` depth-1 fetch, `.github/workflows/unit-suite.yml:176` aggregator); `scripts/spec-lint.ts:210`; `package.json:27-28`, `package.json:53`. Three mismatches with the spec were found and are resolved as R1–R3 above.
