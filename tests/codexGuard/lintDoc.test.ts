import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkRun, readCalls, readResult, runGuard, writeScenario, type Run } from "./harness";

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
 * A doc inside the run's --cwd. Reports for it are produced by the REAL CLI, so
 * the expected embed is derived from a live run rather than hardcoded — a
 * hardcoded expectation passes against a broken embed.
 */
function plantDoc(run: Run, rel: string, text: string): string {
  const abs = join(run.cwdDir, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, text);
  // codex-guard resolves --lint-doc AND its lint child against --cwd, so the
  // fixture has to be a realistic checkout rather than a bare directory.
  execFileSync("git", ["init", "-q"], { cwd: run.cwdDir });
  return rel;
}

/**
 * Defects across MULTIPLE check families, so the report carries more than one
 * finding, a `detail:` line, and several section labels. A single-finding
 * fixture makes the ordered/multiplicity/detail assertions below vacuous —
 * transforms that reorder, deduplicate, or delete details all pass against it.
 */
const PLAN_WITH_DEFECT = [
  "# Plan",
  "",
  "See `lib/specLint/parse.ts:99999` and `lib/specLint/run.ts:99998`.",
  "",
  "The budget covers 3 reports here and 7 reports there.",
  "",
  "<!-- tasks: depth=2 -->",
  "",
  "## Task 1",
  "",
  "prose with no marker",
  "",
  "## Task 2",
  "",
  "<!-- task: red=`` ac=AC-1 -->",
  "",
  "<!-- tasks: end -->",
  "",
].join("\n");

/** Findings only — the lines a reviewer actually reads. */
const findingLines = (s: string) =>
  s.split("\n").filter((l) => /^\s+(FAIL|ADVISORY)\s+[A-Z_]+\s/.test(l));

describe("codex-guard --lint-doc (design §2.2)", () => {
  it(
    "AC-2: --lint-doc is accepted without --fallback",
    async () => {
      const run = mkRun();
      const rel = plantDoc(run, "docs/superpowers/plans/p.md", PLAN_WITH_DEFECT);
      writeScenario(run, APPROVE);
      const r = await runGuard(run, ["--lint-doc", rel, "--no-lint-gate"], REAL_CLI);
      expect(r.code).toBe(0);
      expect(readResult(run).verdict).toBe("APPROVE");
    },
    T,
  );

  it(
    "AC-1/AC-20/M43/M48/M54: the embedded block carries every finding and drops INVENTORY",
    async () => {
      const run = mkRun();
      const rel = plantDoc(run, "docs/superpowers/plans/p.md", PLAN_WITH_DEFECT);
      writeScenario(run, APPROVE);
      await runGuard(run, ["--lint-doc", rel, "--no-lint-gate"], REAL_CLI);

      const prompt = readCalls(run)[0]!.stdin;
      expect(prompt).toContain(`===== SPEC-LINT: ${rel} =====`);

      // Derived from a live CLI run, never hardcoded.
      // The CLI exits 1 when it has findings, which is the expected case here.
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
      expect(findingLines(raw).length).toBeGreaterThan(0);
      // The fixture must not be vacuous: independent `toContain` assertions on a
      // one-finding, zero-detail report pass against transforms that reorder,
      // deduplicate, or drop details.
      const rawFindings = findingLines(raw);
      expect(rawFindings.length).toBeGreaterThan(1);
      expect(raw).toMatch(/^\s+detail: /m);
      expect(raw).toMatch(/^INVENTORY$/m);

      // ORDERED SEQUENCE, with multiplicity — not a set, not containment.
      const block = prompt
        .split(`===== SPEC-LINT: ${rel} =====\n`)[1]!
        .split("\n===== END SPEC-LINT =====")[0]!;
      const sentLines = block.split("\n");
      const inv = raw.split("\n").indexOf("INVENTORY");
      const sum = raw.split("\n").findIndex((l) => l.startsWith("summary:"));
      const expected = [...raw.split("\n").slice(0, inv === -1 ? sum : inv), raw.split("\n")[sum]!];
      expect(sentLines).toEqual(expected);
      expect(block).not.toMatch(/^INVENTORY$/m);
      expect(block.trimEnd().split("\n").pop()).toMatch(/^summary: /);
    },
    T,
  );

  it(
    "AC-4 (SUPERSEDED 2026-08-26): a doc with hard findings is now REFUSED before dispatch",
    async () => {
      // This test asserted the opposite until the pre-dispatch lint gate landed:
      // "a doc with hard findings still dispatches — the report is why the
      // reviewer is there." That contract was deliberately reversed by
      // `docs/superpowers/specs/2026-08-26-speclint-dispatch-gates-design.md` §3,
      // closing `BL-CODEX-GUARD-SPECLINT-PREDISPATCH-GATE`, because three
      // committed incidents showed the reviewer spending a finding — and the arc
      // a round — on a class `pnpm spec:lint` prints in under a minute. The
      // embed is unchanged and still disclosed; what changed is that a HARD
      // artifact no longer reaches a reviewer at all.
      //
      // Kept as a reversal record rather than deleted, so the old contract
      // cannot be reintroduced by someone reading only the new one.
      const run = mkRun();
      const rel = plantDoc(run, "docs/superpowers/plans/p.md", PLAN_WITH_DEFECT);
      writeScenario(run, APPROVE);
      const r = await runGuard(run, ["--lint-doc", rel], REAL_CLI);
      expect(r.code).toBe(2);
      expect(readCalls(run)).toHaveLength(0);
    },
    T,
  );

  it(
    "AC-5/M68: lintArm records present/absent — from EVERY writer, not just the happy path",
    async () => {
      const a = mkRun();
      const rel = plantDoc(a, "docs/superpowers/plans/p.md", PLAN_WITH_DEFECT);
      writeScenario(a, APPROVE);
      await runGuard(a, ["--lint-doc", rel, "--no-lint-gate"], REAL_CLI);
      expect(readResult(a).lintArm).toBe("present");

      const b = mkRun();
      writeScenario(b, APPROVE);
      await runGuard(b, [], REAL_CLI);
      expect(readResult(b).lintArm).toBe("absent");
    },
    T,
  );

  it(
    "AC-19: a --lint-doc outside the --cwd repository exits 2 and dispatches NOTHING",
    async () => {
      const run = mkRun();
      plantDoc(run, "docs/superpowers/plans/p.md", PLAN_WITH_DEFECT);
      writeScenario(run, APPROVE);
      const r = await runGuard(run, ["--lint-doc", "/etc/hosts"], REAL_CLI);
      expect(r.code).toBe(2);
      expect(r.stderr).toMatch(/outside the repository/i);
      expect(readCalls(run)).toEqual([]);
    },
    T,
  );

  it(
    "AC-18/M20: the lint child runs with cwd = --cwd, not the wrapper's launch cwd",
    async () => {
      // Invariant 11 makes launch-cwd and --cwd differ on every worktree run, so
      // this is the case that breaks the feature in normal use.
      const run = mkRun();
      const rel = plantDoc(run, "docs/superpowers/plans/p.md", PLAN_WITH_DEFECT);
      writeScenario(run, APPROVE);
      const r = await runGuard(run, ["--lint-doc", rel, "--no-lint-gate"], REAL_CLI);
      expect(r.code).toBe(0);
      expect(readCalls(run)[0]!.stdin).toContain("TASK_MARKER_MISSING");
    },
    T,
  );

  it(
    "M81: any child status outside {0,1} refuses — 2, 3 and 255 alike",
    async () => {
      // The CLI defines exactly 0 and 1. An undefined status means it is not the
      // CLI, so dispatching a report built from whatever it printed would arm
      // the reviewer with something no contract describes.
      for (const status of [2, 3, 255]) {
        const run = mkRun();
        const rel = plantDoc(run, "docs/superpowers/plans/p.md", PLAN_WITH_DEFECT);
        const stub = join(run.dir, `exit-${status}.mjs`);
        writeFileSync(
          stub,
          `process.stdout.write("spec:lint ${rel}\\nkind: plan (inferred)\\n\\nsummary: 0 hard, 0 advisory\\n");\nprocess.exit(${status});\n`,
        );
        writeScenario(run, APPROVE);
        const r = await runGuard(run, ["--lint-doc", rel, "--no-lint-gate"], {
          ...REAL_CLI,
          CODEX_GUARD_SPEC_LINT: stub,
        });
        expect(`status=${status} exit=${r.code}`).toBe(`status=${status} exit=2`);
        expect(readCalls(run)).toEqual([]);
      }
    },
    T,
  );

  it(
    "M87: the lint child defaults to --cwd's checkout, never the guard's launch cwd",
    async () => {
      // Defaulting to the launch checkout lints the TARGET with MAIN's linter:
      // well-formed report, armed-looking dispatch, and any check the target
      // adds silently absent — the exact silent-corruption shape this arm
      // exists to prevent, committed inside the arm itself.
      //
      // The fixture --cwd has NO scripts/spec-lint.ts. Resolving against the
      // launch checkout finds a working CLI and dispatches; resolving against
      // --cwd finds nothing and must refuse. That difference IS the assertion.
      const run = mkRun();
      const rel = plantDoc(run, "docs/superpowers/plans/p.md", PLAN_WITH_DEFECT);
      writeScenario(run, APPROVE);
      const r = await runGuard(run, ["--lint-doc", rel]); // no env override
      expect(r.code).toBe(2);
      expect(readCalls(run)).toEqual([]);
    },
    T,
  );

  it(
    "AC-21.1/AC-21.4/M51/M59: the aggregate budget holds, and an unseatable request refuses",
    async () => {
      // The floor is each report's OWN frame, which scales with the document
      // path. A fixed constant under-counts long paths: the precheck passes and
      // the emitted total runs far over budget (measured on the previous logic:
      // 909 docs at a 206-byte path emitted 272,700 against 200,000).
      const run = mkRun();
      const rel = plantDoc(run, "docs/superpowers/plans/p.md", PLAN_WITH_DEFECT);
      writeScenario(run, APPROVE);
      const many = Array.from({ length: 40 }, () => ["--lint-doc", rel]).flat();
      const r = await runGuard(run, [...many, "--no-lint-gate"], {
        ...REAL_CLI,
        CODEX_GUARD_LINT_BUDGET_BYTES: "4000",
      });
      expect(r.code).toBe(2);
      expect(r.stderr).toMatch(/cannot be seated/);
      expect(readCalls(run)).toEqual([]);
    },
    T,
  );

  it(
    "AC-21.1: a seatable multi-doc request stays within the aggregate budget",
    async () => {
      const run = mkRun();
      const rel = plantDoc(run, "docs/superpowers/plans/p.md", PLAN_WITH_DEFECT);
      writeScenario(run, APPROVE);
      const budget = 3000;
      const r = await runGuard(run, ["--lint-doc", rel, "--lint-doc", rel, "--no-lint-gate"], {
        ...REAL_CLI,
        CODEX_GUARD_LINT_BUDGET_BYTES: String(budget),
      });
      expect(r.code).toBe(0);
      const stdin = readCalls(run)[0]!.stdin;
      const blocks = stdin.split("===== SPEC-LINT: ").slice(1);
      expect(blocks.length).toBe(2);
      const emitted = blocks.reduce(
        (a, b) => a + Buffer.byteLength(b.split("\n===== END SPEC-LINT =====")[0]!),
        0,
      );
      expect(emitted).toBeLessThanOrEqual(budget);
      // Every emitted block keeps its summary, truncated or not.
      for (const b of blocks) {
        expect(b.split("\n===== END SPEC-LINT =====")[0]!.trimEnd().split("\n").pop()).toMatch(
          /^summary: /,
        );
      }
    },
    T,
  );

  /** A stub CLI at `--cwd/scripts/spec-lint.ts` emitting exactly `lines`. */
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

  it(
    "AC-36/M45/M49/M70/M78/M84: every malformed FRAME refuses and dispatches nothing",
    async () => {
      const rel = "docs/superpowers/plans/p.md";
      const OK = `spec:lint ${rel}`;
      const cases: Record<string, string[]> = {
        // Both ends correct is not enough — no kind: line, no blank.
        prematureSummary: [OK, "summary: 0 hard, 0 advisory"],
        // Well-formed header naming a DIFFERENT document.
        wrongDocument: [
          "spec:lint some-other.md",
          "kind: plan (inferred)",
          "",
          "summary: 0 hard, 0 advisory",
        ],
        // Header shape corrupt, summary fine.
        wrongHeader: ["wrong-header", "kind: plan (inferred)", "", "summary: 0 hard, 0 advisory"],
        // Summary present but not final.
        summaryNotFinal: [
          OK,
          "kind: plan (inferred)",
          "",
          "summary: 1 hard, 0 advisory",
          "  FAIL X 1:1 late",
        ],
        // INVENTORY after summary.
        inventoryAfterSummary: [
          OK,
          "kind: plan (inferred)",
          "",
          "summary: 0 hard, 0 advisory",
          "INVENTORY",
        ],
        // Evidence hiding in the discard span — the class round 2 found.
        findingInDiscardSpan: [
          OK,
          "kind: plan (inferred)",
          "",
          "INVENTORY",
          "  FAIL X 9:1 hidden",
          "summary: 1 hard, 0 advisory",
        ],
        detailInDiscardSpan: [
          OK,
          "kind: plan (inferred)",
          "",
          "INVENTORY",
          "    detail: hidden evidence",
          "summary: 0 hard, 0 advisory",
        ],
        labelInDiscardSpan: [
          OK,
          "kind: plan (inferred)",
          "",
          "INVENTORY",
          "  taskContract:",
          "summary: 0 hard, 0 advisory",
        ],
      };
      for (const [name, lines] of Object.entries(cases)) {
        const run = mkRun();
        plantDoc(run, rel, PLAN_WITH_DEFECT);
        writeScenario(run, APPROVE);
        const r = await runGuard(run, ["--lint-doc", rel], stubCli(run, lines));
        expect(`${name} exit=${r.code}`).toBe(`${name} exit=2`);
        expect(readCalls(run)).toEqual([]);
      }
    },
    T,
  );

  it(
    "AC-37/M33: a lint child that cannot spawn refuses and dispatches nothing",
    async () => {
      const run = mkRun();
      const rel = plantDoc(run, "docs/superpowers/plans/p.md", PLAN_WITH_DEFECT);
      writeScenario(run, APPROVE);
      const r = await runGuard(run, ["--lint-doc", rel], {
        ...REAL_CLI,
        CODEX_GUARD_SPEC_LINT: join(run.dir, "does-not-exist.mjs"),
      });
      expect(r.code).toBe(2);
      expect(readCalls(run)).toEqual([]);
    },
    T,
  );

  it(
    "AC-21.3/AC-21.5/AC-21.6/AC-21.7: a truncated block keeps its head, order and honest arithmetic",
    async () => {
      const run = mkRun();
      const rel = plantDoc(run, "docs/superpowers/plans/p.md", PLAN_WITH_DEFECT);
      writeScenario(run, APPROVE);
      const r = await runGuard(run, ["--lint-doc", rel, "--no-lint-gate"], {
        ...REAL_CLI,
        CODEX_GUARD_LINT_BUDGET_BYTES: "300",
      });
      expect(r.code).toBe(0);
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
      const block = readCalls(run)[0]!
        .stdin.split(`===== SPEC-LINT: ${rel} =====\n`)[1]!
        .split("\n===== END SPEC-LINT =====")[0]!;
      const bl = block.split("\n");
      expect(bl[0]).toBe(`spec:lint ${rel}`);
      expect(bl[1]).toMatch(/^kind: /);
      expect(bl[2]).toBe("");
      // summary LAST, notice immediately before it.
      expect(bl[bl.length - 1]).toMatch(/^summary: /);
      const notice = bl[bl.length - 2]!;
      expect(notice).toMatch(/^\[truncated: \d+ of \d+ bytes shown\]$/);
      // N recomputed from the retained body, never read back from the notice.
      const [, n, m] = notice.match(/\[truncated: (\d+) of (\d+) bytes shown\]/)!;
      const retained = bl.slice(3, bl.length - 2).join("\n");
      expect(Number(n)).toBe(Buffer.byteLength(retained));
      // M must be pinned too. `M > N` passes a mutant reporting 999999 — it
      // lies about how much was omitted while every other assertion holds. M is
      // the UNTRUNCATED body: raw minus the head and everything from INVENTORY on.
      const rawLines = raw.split("\n");
      const rawInv = rawLines.indexOf("INVENTORY");
      const rawSum = rawLines.findIndex((l) => l.startsWith("summary:"));
      const fullBody = rawLines.slice(3, rawInv === -1 ? rawSum : rawInv).join("\n");
      expect(Number(m)).toBe(Buffer.byteLength(fullBody));
    },
    T,
  );

  it(
    "AC-3: a --lint-doc the CLI cannot read exits 2 and dispatches nothing",
    async () => {
      const run = mkRun();
      plantDoc(run, "docs/superpowers/plans/p.md", PLAN_WITH_DEFECT);
      writeScenario(run, APPROVE);
      const r = await runGuard(
        run,
        ["--lint-doc", "docs/superpowers/plans/does-not-exist.md"],
        REAL_CLI,
      );
      expect(r.code).toBe(2);
      expect(readCalls(run)).toEqual([]);
    },
    T,
  );
});
