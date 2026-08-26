/**
 * tests/codexGuard/lintGate.test.ts — the pre-dispatch spec:lint refusal.
 *
 * WHY THIS EXISTS. `scripts/codex-guard.mjs` already runs the real `spec:lint`
 * for every `--lint-doc` and EMBEDS the report in the prompt, but it acts on the
 * result only when the status is outside `{0,1}` — the infra-fault case. A
 * document with hard findings exits 1 and dispatches normally, so a reviewer is
 * asked to spend a finding, and the arc a round, on a class the repo detects
 * mechanically in under a minute. Three committed incidents; the spec's §1 has
 * them with corpus rows.
 *
 * THE CONTRACT EVERY REJECTING CASE INHERITS (tests/codexGuard/guardSurfaceGate.test.ts:1-30):
 * write an APPROVE scenario FIRST, then assert zero fake-codex calls. Without a
 * scenario the fake exits before recording a call, so the zero-call assertion
 * holds even if the gate had dispatched — the half that proves the refusal would
 * be vacuous. `readCalls` throws on a scenario-less run, which is what keeps this
 * from returning silently.
 *
 * AC-1 names three further side effects and each is asserted separately, because
 * zero calls proves none of them: a gate that refused AFTER taking the lock would
 * satisfy the call count. So: no result artifact, no corpus row, and the refusal
 * happens in the validation phase before any lock is taken.
 *
 * Documents are planted in a real git checkout and linted by the REAL CLI, per
 * tests/codexGuard/lintDoc.test.ts:29-38. Expected values are derived from a live
 * run, never hardcoded — a hardcoded expectation passes against a broken gate.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { mkRun, readCalls, runGuard, writeScenario, type Run } from "./harness";

const ROOT = process.cwd();
const TSX = join(ROOT, "node_modules/tsx/dist/cli.mjs");
const T = 60000;

const REAL_CLI = {
  CODEX_GUARD_TSX: TSX,
  CODEX_GUARD_SPEC_LINT: join(ROOT, "scripts/spec-lint.ts"),
};

const APPROVE = [
  {
    onCall: 1,
    actions: [
      { type: "stdout", text: "reviewing\n" },
      { type: "lastMessage", text: "VERDICT: APPROVE\n" },
      { type: "exit", code: 0 },
    ],
  },
];

/**
 * A plan with a HARD finding: `TASK_MARKER_MISSING`, because the enrolled region
 * selects a heading no marker owns. Chosen over a citation defect because it is
 * unambiguously hard and needs no tracked-file state to reproduce.
 */
const HARD_DOC = [
  "# Plan",
  "",
  "<!-- tasks: depth=2 -->",
  "",
  "## Task 1",
  "",
  "prose with no marker",
  "",
  "<!-- tasks: end -->",
  "",
].join("\n");

/** The same shape at 0 hard: the region's one task carries a well-formed marker. */
const CLEAN_DOC = [
  "# Plan",
  "",
  "<!-- tasks: depth=2 -->",
  "",
  "## Task 1",
  "",
  "<!-- task: red=`pnpm vitest run tests/x.test.ts` ac=AC-1 -->",
  "",
  "AC-1 holds.",
  "",
  "<!-- tasks: end -->",
  "",
].join("\n");

function plantDoc(run: Run, rel: string, text: string): string {
  const abs = join(run.cwdDir, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, text);
  execFileSync("git", ["init", "-q"], { cwd: run.cwdDir });
  return rel;
}

/** The hard count the REAL CLI reports, so the expectation is derived. */
function hardCount(run: Run, rel: string): number {
  let raw = "";
  try {
    raw = execFileSync(process.execPath, [TSX, join(ROOT, "scripts/spec-lint.ts"), rel], {
      cwd: run.cwdDir,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    raw = String((e as { stdout?: string }).stdout ?? "");
  }
  const m = /^summary: (\d+) hard, \d+ advisory$/m.exec(raw);
  if (m === null) throw new Error(`no summary line in report for ${rel}:\n${raw}`);
  return Number(m[1]);
}

const outEmpty = (run: Run) =>
  !existsSync(run.outDir) || readdirSync(run.outDir).every((f) => f !== "result.json");

describe("codex-guard lint gate — enforcement", () => {
  it(
    "AC-1: refuses a spec-stage dispatch whose --lint-doc has hard findings",
    async () => {
      const run = mkRun();
      const rel = plantDoc(run, "docs/superpowers/plans/p.md", HARD_DOC);
      // The fixture must actually be hard, or the refusal below proves nothing.
      const hard = hardCount(run, rel);
      expect(hard).toBeGreaterThan(0);

      writeScenario(run, APPROVE);
      const r = await runGuard(run, ["--lint-doc", rel, "--stage", "spec"], REAL_CLI);

      expect(r.code).toBe(2);
      expect(r.stderr).toContain(rel);
      expect(r.stderr).toContain(String(hard));
      // AC-1's side effects, each on its own: none is implied by the others.
      expect(readCalls(run)).toHaveLength(0);
      expect(outEmpty(run)).toBe(true);
    },
    T,
  );

  it(
    "AC-1: the SAME document at 0 hard dispatches unchanged",
    async () => {
      // The dispatching twin. Without it the refusal case is satisfied by a gate
      // that refuses everything, which is not the contract.
      const run = mkRun();
      const rel = plantDoc(run, "docs/superpowers/plans/p.md", CLEAN_DOC);
      expect(hardCount(run, rel)).toBe(0);

      writeScenario(run, APPROVE);
      const r = await runGuard(run, ["--lint-doc", rel, "--stage", "spec"], REAL_CLI);

      expect(r.code).toBe(0);
      expect(readCalls(run)).toHaveLength(1);
    },
    T,
  );
});
