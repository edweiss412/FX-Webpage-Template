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

/**
 * A plan at 0 hard WITH advisories, so the advisory case is not vacuous. The
 * universal-claims arm advises on absolute prose; the task region is well-formed
 * so nothing is hard.
 */
const ADVISORY_DOC = [
  "# Plan",
  "",
  // Draws COPY_UNPAIRED_QUOTE, an ADVISORY. Verified against the real CLI: a
  // fixture that draws none would make the advisory case vacuous.
  'The parser handles the "unpaired case fine.',
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

/** The REAL CLI's raw report for a planted doc. */
function rawReport(run: Run, rel: string): string {
  try {
    return execFileSync(process.execPath, [TSX, join(ROOT, "scripts/spec-lint.ts"), rel], {
      cwd: run.cwdDir,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    return String((e as { stdout?: string }).stdout ?? "");
  }
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

/**
 * A stub CLI emitting exact lines, so a summary line that passes `embedReport`'s
 * frame clauses but carries no readable COUNT can be produced. The real CLI
 * cannot emit one, which is precisely why the gate must not assume it never
 * will: `embedReport` validates that a `summary:` line exists, is unique and is
 * last, and never that a number can be read out of it.
 */
function stubCli(run: Run, lines: string[], exitCode = 1): Record<string, string> {
  const stub = join(run.dir, `stub-${Math.abs(lines.join("").length)}.mjs`);
  writeFileSync(
    stub,
    [
      `const L = ${JSON.stringify(lines)};`,
      `process.stdout.write(L.join(String.fromCharCode(10)) + String.fromCharCode(10));`,
      `process.exitCode = ${exitCode};`,
    ].join("\n"),
  );
  return { ...REAL_CLI, CODEX_GUARD_SPEC_LINT: stub };
}

const outEmpty = (run: Run) =>
  !existsSync(run.outDir) || readdirSync(run.outDir).every((f) => f !== "result.json");

describe("codex-guard lint gate — coverage", () => {
  it(
    "AC-2: refuses a spec-stage dispatch that names no --lint-doc",
    async () => {
      // The arm that makes the gate non-optional. Without it the obligation is
      // the paragraph at docs/agents/spec-self-review.md:25 and the mechanism is
      // a flag nobody has to pass, which is the row's own diagnosis: two oracles
      // declared as COMMANDS ran several times each, this one declared as a
      // PARAGRAPH ran zero times.
      const run = mkRun();
      writeScenario(run, APPROVE);
      // injectDefaults would supply the harness waiver; this case must not take it.
      const r = await runGuard(
        run,
        ["--stage", "spec", "--round", "1"],
        {},
        { injectDefaults: false },
      );

      expect(r.code).toBe(2);
      expect(r.stderr).toContain("--lint-doc");
      expect(readCalls(run)).toHaveLength(0);
      expect(outEmpty(run)).toBe(true);
    },
    T,
  );

  it(
    "AC-2: refuses a plan-stage dispatch that names no --lint-doc",
    async () => {
      const run = mkRun();
      writeScenario(run, APPROVE);
      const r = await runGuard(
        run,
        ["--stage", "plan", "--round", "1"],
        {},
        { injectDefaults: false },
      );
      expect(r.code).toBe(2);
      expect(readCalls(run)).toHaveLength(0);
    },
    T,
  );

  it(
    "AC-2: --no-lint-gate waives the coverage arm",
    async () => {
      // The escape is real and meant to be used: a brief may legitimately review
      // an artifact that is mid-repair. A run that declares that is doing
      // something different from a run that forgot.
      const run = mkRun();
      writeScenario(run, APPROVE);
      const r = await runGuard(
        run,
        ["--stage", "spec", "--round", "1", "--no-lint-gate"],
        {},
        { injectDefaults: false },
      );
      expect(r.code).toBe(0);
      expect(readCalls(run)).toHaveLength(1);
    },
    T,
  );

  it.each([["diff"], ["task"]])(
    "AC-2: --stage %s is untouched by the coverage arm",
    async (stage) => {
      // The gate is scoped to the stages whose ARTIFACT is the thing under
      // review. A diff dispatch names no document and must stay dispatchable.
      const run = mkRun();
      writeScenario(run, APPROVE);
      const r = await runGuard(
        run,
        ["--stage", stage!, "--round", "2"],
        {},
        { injectDefaults: false },
      );
      expect(r.code).toBe(0);
      expect(readCalls(run)).toHaveLength(1);
    },
    T,
  );
});

describe("codex-guard lint gate — summary-grammar", () => {
  it.each([
    ["a non-numeric count", "summary: banana"],
    ["a missing advisory half", "summary: 3 hard"],
    ["a reworded line", "summary: three hard, zero advisory"],
  ])(
    "AC-1: %s refuses as an INFRA FAULT rather than defaulting to zero",
    async (_name, summaryLine) => {
      // Probed on the shipped wrapper: `summary: banana` passes embedReport
      // intact. An extractor defaulting to zero there dispatches a hard artifact
      // with every frame clause green — the silent wrongness the consequence
      // bound rules out — so this is a refusal, not a parse with a fallback.
      const run = mkRun();
      const rel = "docs/superpowers/plans/p.md";
      plantDoc(run, rel, CLEAN_DOC);
      writeScenario(run, APPROVE);
      const r = await runGuard(
        run,
        ["--lint-doc", rel, "--stage", "spec"],
        stubCli(run, [`spec:lint ${rel}`, "kind: plan (inferred)", "", summaryLine]),
      );

      expect(r.code).toBe(2);
      expect(r.stderr).toContain(rel);
      expect(readCalls(run)).toHaveLength(0);
      expect(outEmpty(run)).toBe(true);
    },
    T,
  );

  it(
    "AC-1: a WELL-FORMED count from the same stub dispatches — the refusal is about the grammar, not the stub",
    async () => {
      // The dispatching twin. Without it, a gate that refused every stubbed run
      // would satisfy all three cases above.
      const run = mkRun();
      const rel = "docs/superpowers/plans/p.md";
      plantDoc(run, rel, CLEAN_DOC);
      writeScenario(run, APPROVE);
      const r = await runGuard(
        run,
        ["--lint-doc", rel, "--stage", "spec"],
        stubCli(
          run,
          [`spec:lint ${rel}`, "kind: plan (inferred)", "", "summary: 0 hard, 2 advisory"],
          0,
        ),
      );
      expect(r.code).toBe(0);
      expect(readCalls(run)).toHaveLength(1);
    },
    T,
  );
});

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
    "AC-3: a CLEAN document named FIRST does not hide a hard one named after it",
    async () => {
      // The multi-document case is REQUIRED, not extra. A gate reading
      // cfg.lintDocs[0] passes every single-document test above while
      // dispatching a hard artifact whenever a clean one is named ahead of it —
      // and real dispatches cite a spec PLUS its probe records, so that ordering
      // is the common one rather than a contrived one.
      const run = mkRun();
      const clean = plantDoc(run, "docs/superpowers/plans/clean.md", CLEAN_DOC);
      const hard = plantDoc(run, "docs/superpowers/plans/hard.md", HARD_DOC);
      expect(hardCount(run, clean)).toBe(0);
      expect(hardCount(run, hard)).toBeGreaterThan(0);

      writeScenario(run, APPROVE);
      const r = await runGuard(
        run,
        ["--lint-doc", clean, "--lint-doc", hard, "--stage", "spec"],
        REAL_CLI,
      );

      expect(r.code).toBe(2);
      // Names the FAILING one, and does not accuse the clean one.
      expect(r.stderr).toContain(hard);
      expect(r.stderr).not.toContain(clean);
      expect(readCalls(run)).toHaveLength(0);
    },
    T,
  );

  it(
    "AC-3: advisory findings never refuse",
    async () => {
      // Advisory noise is normal in probe-record artifacts, and blocking on it
      // would be its own waste. Asserted with a document that HAS advisories, so
      // the case is not vacuously satisfied by a clean one.
      const run = mkRun();
      const rel = plantDoc(run, "docs/superpowers/plans/p.md", ADVISORY_DOC);
      const raw = rawReport(run, rel);
      const m = /^summary: (\d+) hard, (\d+) advisory$/m.exec(raw)!;
      expect(Number(m[1])).toBe(0);
      expect(Number(m[2])).toBeGreaterThan(0);

      writeScenario(run, APPROVE);
      const r = await runGuard(run, ["--lint-doc", rel, "--stage", "spec"], REAL_CLI);
      expect(r.code).toBe(0);
      expect(readCalls(run)).toHaveLength(1);
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
