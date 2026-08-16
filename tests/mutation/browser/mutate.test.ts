import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { premiseHolds } from "../../_shared/premise";
import {
  accountOutcomes,
  applyEdits,
  buildManifest,
  classifyChild,
  killsMutant,
  parseManifest,
  reportEvidence,
} from "./mutate";
import type { MutantEdit } from "./registry";
import { assertBrowserBaseline, childCommand, orderSuites, sentinelPath } from "./runner";
import { BaselineNotGreenError } from "../source/oracle";
import { MutantRunInfraError } from "../source/runner";

/**
 * The pure half of the browser runner (spec §3.3, §3.4).
 *
 * Everything here decides a verdict or builds the input a verdict is read from,
 * and none of it spawns. The spawn wrapper that does is deliberately thin
 * (spec §6), because a spawn boundary is not expressible without executing
 * Playwright — so the logic that CAN be pinned by a fast suite lives here.
 */
const ROOT = process.cwd();
let dir: string;

const A = "alpha.tsx";
const B = "beta.tsx";
const ALPHA_TEXT = 'const a = <div className="rounded-pill w-fit" />;\n';
const BETA_TEXT = 'const b = <div className="rounded-pill" />;\n';

const files = (): Map<string, string> =>
  new Map([
    [A, ALPHA_TEXT],
    [B, BETA_TEXT],
  ]);

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "fx-browser-mutate-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("applyEdits — the substitution itself", () => {
  it("applies a single edit and leaves every other file untouched", () => {
    const edits: MutantEdit[] = [{ file: A, from: "w-fit", to: "" }];
    const out = applyEdits(files(), edits);
    expect(out.get(A)).toBe('const a = <div className="rounded-pill " />;\n');
    expect(out.has(B)).toBe(false);
  });

  it("applies a two-file mutant, and BOTH files equal the hand-substituted expectation", () => {
    // The positive path, stated as text rather than as "the function was
    // called": an implementation that mutated only the first file, or returned
    // its input unchanged, passes a shape assertion and fails this one.
    const edits: MutantEdit[] = [
      { file: A, from: 'className="rounded-pill', to: 'className="rounded-sm' },
      { file: B, from: 'className="rounded-pill', to: 'className="rounded-sm' },
    ];
    const out = applyEdits(files(), edits);
    expect(out.get(A)).toBe('const a = <div className="rounded-sm w-fit" />;\n');
    expect(out.get(B)).toBe('const b = <div className="rounded-sm" />;\n');
  });

  it("composes two edits to the SAME file — the relocation shape", () => {
    // Mutant 12 in the enrolment payload removes `cursor-pointer` from a target
    // and adds it to the inner visual; both edits land in one file and the
    // second must see the first's output.
    const out = applyEdits(new Map([[A, ALPHA_TEXT]]), [
      { file: A, from: "w-fit", to: "" },
      { file: A, from: "rounded-pill", to: "rounded-pill cursor-pointer" },
    ]);
    expect(out.get(A)).toBe('const a = <div className="rounded-pill cursor-pointer " />;\n');
  });

  it("replaces only the FIRST occurrence's worth — an anchor must be unique", () => {
    // Uniqueness is a registry-validation rule; here the guarantee is that the
    // applier never mass-substitutes, which would silently mutate extra sites.
    expect(() =>
      applyEdits(new Map([[A, 'x = "p"; y = "p";\n']]), [{ file: A, from: '"p"', to: '"q"' }]),
    ).toThrow(/occurs 2 times/i);
  });

  it("inserts a replacement containing `$&` verbatim, never as a pattern reference", () => {
    // `String.prototype.replace` expands `$&`, `$1`, `` $` `` and `$'` in a
    // STRING replacement. A mutant whose `to` carried one would be applied as
    // something other than its declared text — silently — and the run would
    // score a mutant nobody wrote.
    const out = applyEdits(new Map([[A, "keep w-fit here\n"]]), [
      { file: A, from: "w-fit", to: "$& $` $' $1" },
    ]);
    expect(out.get(A)).toBe("keep $& $` $' $1 here\n");
  });

  it("is ATOMIC: one missing anchor refuses the whole mutant and lists every miss", () => {
    const edits: MutantEdit[] = [
      { file: A, from: "w-fit", to: "" },
      { file: B, from: "not-present-here", to: "x" },
      { file: A, from: "also-absent", to: "y" },
    ];
    let message = "";
    try {
      applyEdits(files(), edits);
    } catch (e) {
      message = (e as Error).message;
    }
    premiseHolds("the atomicity case actually threw", message !== "");
    expect(message).toMatch(/not-present-here/);
    expect(message).toMatch(/also-absent/);
  });

  it("refuses an EMPTY anchor, and says it does not occur rather than silently prepending", () => {
    // Two enrolment survivors in one case. `edit.from === "" ? 0 : ...` is what
    // stops `"x".split("")` reporting a per-character-boundary count: read as 1
    // instead, the edit passes the uniqueness check and `replace("")` PREPENDS
    // `to` to the file (`integer-literal:44:44`). And the message selector must
    // key on ZERO, or an absent anchor is reported as "occurs 0 times"
    // (`integer-literal:47:35`) — a description of a state that cannot exist.
    let message = "";
    try {
      applyEdits(files(), [{ file: A, from: "", to: "INJECTED" }]);
    } catch (e) {
      message = (e as Error).message;
    }
    premiseHolds("the empty-anchor case actually threw rather than applying", message !== "");
    expect(message).toMatch(/does not occur/);
    expect(message, "an absent anchor must not be described as occurring").not.toMatch(
      /occurs \d+ times/,
    );
  });

  it("does not let a REFUSED edit feed the next edit on the same file", () => {
    // The `continue` after a failed anchor (`statement-removal:50:7`). Without
    // it, the refused edit still writes its half-applied text into the working
    // map, and the NEXT edit on that file then anchors against text the caller
    // never wrote — so the second edit silently succeeds and its miss vanishes
    // from the report. Both misses must be named.
    const text = "x rounded-pill y rounded-pill z\n";
    const seed = new Map([[A, text]]);
    premiseHolds(
      "edit 1's anchor is genuinely ambiguous and edit 2 anchors on what edit 1 WOULD have written",
      text.split("rounded-pill").length - 1 === 2 && !text.includes("Q"),
    );
    let message = "";
    try {
      applyEdits(seed, [
        { file: A, from: "rounded-pill", to: "Q" },
        { file: A, from: "Q", to: "R" },
      ]);
    } catch (e) {
      message = (e as Error).message;
    }
    premiseHolds("the composed-refusal case actually threw", message !== "");
    expect(message, "edit 1's ambiguity must be reported").toMatch(/occurs 2 times/);
    expect(message, "edit 2 must NOT see text edit 1 was refused permission to write").toMatch(
      /does not occur/,
    );
  });

  it("throws when an edit names a file the caller did not read", () => {
    expect(() => applyEdits(files(), [{ file: "gamma.tsx", from: "a", to: "b" }])).toThrow(
      /gamma\.tsx/,
    );
  });
});

describe("buildManifest / parseManifest", () => {
  it("round-trips non-empty entries", () => {
    // An always-empty emitter would satisfy "returns JSON"; it cannot satisfy
    // this, because the parsed entries are compared to the input.
    const entries = [
      { target: "/abs/components/admin/HelpSheet.tsx", mutant: "/tmp/x/0.tsx" },
      { target: "/abs/components/admin/HelpTooltip.tsx", mutant: "/tmp/x/1.tsx" },
    ];
    const text = buildManifest(entries);
    expect(JSON.parse(text)).toEqual({ entries });
    expect(parseManifest(text)).toEqual(entries);
  });

  it("rejects a manifest whose shape is not {entries: [{target, mutant}]}", () => {
    for (const bad of ['{"entries": {}}', '{"entries": [{"target": "/a"}]}', "[]", "null"]) {
      expect(() => parseManifest(bad), bad).toThrow();
    }
  });

  it("refuses to emit an empty manifest — every mutant overlays at least one file", () => {
    expect(() => buildManifest([])).toThrow(/empt/i);
  });
});

describe("reportEvidence — a fresh report with executed tests", () => {
  const write = (name: string, body: unknown): string => {
    const p = join(dir, name);
    writeFileSync(p, JSON.stringify(body));
    return p;
  };

  it("reports executed tests from a report written AFTER the spawn", () => {
    const spawnedAt = Date.now() - 1000;
    const path = write("fresh.json", {
      stats: { expected: 56, unexpected: 0, flaky: 0, skipped: 2 },
    });
    const evidence = reportEvidence({ path, spawnedAt });
    expect(evidence).toEqual({ present: true, fresh: true, executed: 56 });
  });

  it("counts unexpected and flaky as executed, and skipped as not", () => {
    const spawnedAt = Date.now() - 1000;
    const path = write("mixed.json", {
      stats: { expected: 3, unexpected: 2, flaky: 1, skipped: 9 },
    });
    expect(reportEvidence({ path, spawnedAt }).executed).toBe(6);
  });

  it("treats a report older than the spawn as NOT fresh — the stale-report trap", () => {
    // The runner deletes the report before each child, so a present report is
    // normally proof on its own. Freshness is the second lock: if the delete
    // ever fails silently, a previous child's report must not be read as this
    // child's execution evidence.
    const path = write("stale.json", {
      stats: { expected: 56, unexpected: 0, flaky: 0, skipped: 0 },
    });
    const evidence = reportEvidence({ path, spawnedAt: Date.now() + 60_000 });
    expect(evidence.fresh).toBe(false);
  });

  it("treats a report written in the SAME millisecond as the spawn as fresh", () => {
    // The boundary is `>=`, not `>` (`relational-boundary:134:25`). A browser
    // boot makes a same-millisecond write vanishingly rare, which is precisely
    // why an off-by-one here would sit undetected — and then, on the one run
    // that hit it, classify a real execution as an infra fault and abort a
    // 20-minute gate for nothing.
    const path = write("boundary.json", { stats: { expected: 1 } });
    const mtimeMs = statSync(path).mtimeMs;
    expect(reportEvidence({ path, spawnedAt: mtimeMs }).fresh).toBe(true);
  });

  it("counts a stats object missing every executed key as ZERO, never as a default", () => {
    // `?? 0` on each of expected / unexpected / flaky (`integer-literal:141:41`,
    // `:67`, `:88`). Any non-zero default manufactures execution evidence for a
    // run that recorded none — and executed-count is the exact signal §3.4 uses
    // to separate survival from a silent no-op, so a fabricated 1 turns "nothing
    // observed this mutant" into "this mutant survived".
    const spawnedAt = Date.now() - 1000;
    const path = write("emptystats.json", { stats: { skipped: 7 } });
    expect(reportEvidence({ path, spawnedAt }).executed).toBe(0);
  });

  it("reports an absent file as absent rather than throwing", () => {
    expect(reportEvidence({ path: join(dir, "nope.json"), spawnedAt: 0 })).toEqual({
      present: false,
      fresh: false,
      executed: 0,
    });
  });

  it("reports a malformed or stats-less report as zero executed", () => {
    const spawnedAt = Date.now() - 1000;
    expect(
      reportEvidence({ path: write("nostats.json", { suites: [] }), spawnedAt }).executed,
    ).toBe(0);
    const broken = join(dir, "broken.json");
    writeFileSync(broken, "{not json");
    expect(reportEvidence({ path: broken, spawnedAt }).executed).toBe(0);
  });
});

describe("classifyChild — the §3.4 verdict table, verbatim", () => {
  const fresh = { present: true, fresh: true, executed: 56 };
  const noTests = { present: true, fresh: true, executed: 0 };
  const absentReport = { present: false, fresh: false, executed: 0 };

  it("row 1 — sentinel present, exit 0, tests ran: this suite did not kill", () => {
    expect(
      classifyChild({
        kind: "playwright",
        sentinelPresent: true,
        exitStatus: 0,
        report: fresh,
      }),
    ).toBe("DID_NOT_KILL");
  });

  it("row 2 — sentinel present, exit 0, no fresh report or zero tests: infra, never survival", () => {
    // A silent no-op run can never count as survival evidence: it would report
    // a mutant SURVIVED that no test ever observed.
    // `present:false, fresh:true` is the shape that separates the three arms:
    // they are ALTERNATIVES, not a conjunction, and a `&&` on the first
    // connector (`logical-connector:192:15`) agrees with every other row while
    // letting an ABSENT report with a live timestamp fall through to the
    // executed check and score as survival.
    for (const report of [
      absentReport,
      noTests,
      { present: true, fresh: false, executed: 56 },
      { present: false, fresh: true, executed: 5 },
    ]) {
      const verdict = classifyChild({
        kind: "playwright",
        sentinelPresent: true,
        exitStatus: 0,
        report,
      });
      expect(verdict, JSON.stringify(report)).not.toBe("DID_NOT_KILL");
      expect(verdict, JSON.stringify(report)).not.toBe("KILLED");
      expect(typeof verdict === "object" && verdict.infra, JSON.stringify(report)).toMatch(
        /report|test/i,
      );
    }
  });

  it("row 3 — sentinel present, non-zero exit: KILLED, whatever the report says", () => {
    for (const report of [fresh, noTests, absentReport]) {
      expect(
        classifyChild({ kind: "playwright", sentinelPresent: true, exitStatus: 1, report }),
        JSON.stringify(report),
      ).toBe("KILLED");
    }
  });

  it("row 4 — sentinel absent: infra, whatever the exit status", () => {
    // The overlay never validated, so nothing this child did observed the
    // mutant. Scoring a non-zero exit KILLED here fabricates a kill, and a
    // systematically broken setup would fabricate a PERFECT score.
    for (const exitStatus of [0, 1, 2]) {
      const verdict = classifyChild({
        kind: "playwright",
        sentinelPresent: false,
        exitStatus,
        report: fresh,
      });
      expect(typeof verdict === "object" && verdict.infra, `exit ${exitStatus}`).toMatch(
        /sentinel|overlay/i,
      );
    }
  });

  it("signal death — no numeric exit status: infra, never KILLED", () => {
    for (const sentinelPresent of [true, false]) {
      const verdict = classifyChild({
        kind: "playwright",
        sentinelPresent,
        exitStatus: null,
        report: fresh,
      });
      expect(verdict, `sentinel ${sentinelPresent}`).not.toBe("KILLED");
      expect(typeof verdict === "object" && verdict.infra).toBeTruthy();
    }
  });

  it("vitest kind — the same table minus the report column", () => {
    expect(classifyChild({ kind: "vitest", sentinelPresent: true, exitStatus: 0 })).toBe(
      "DID_NOT_KILL",
    );
    expect(classifyChild({ kind: "vitest", sentinelPresent: true, exitStatus: 1 })).toBe("KILLED");
    const absent = classifyChild({ kind: "vitest", sentinelPresent: false, exitStatus: 1 });
    expect(typeof absent === "object" && absent.infra).toMatch(/sentinel|overlay/i);
    const signalled = classifyChild({ kind: "vitest", sentinelPresent: true, exitStatus: null });
    expect(typeof signalled === "object" && signalled.infra).toBeTruthy();
  });

  it("never reads a report for the vitest kind, even when one is passed", () => {
    // The no-tests trap for the vitest kind is closed at baseline (spec §3.3
    // step 1), so a report column here would be a second, divergent oracle.
    expect(
      classifyChild({
        kind: "vitest",
        sentinelPresent: true,
        exitStatus: 0,
        report: { present: false, fresh: false, executed: 0 },
      }),
    ).toBe("DID_NOT_KILL");
  });
});

describe("killsMutant — the suite-loop fold", () => {
  it("kills on KILLED and ONLY on KILLED", () => {
    // Both directions, because this predicate decides whether the loop
    // short-circuits. Flipped, a vitest `DID_NOT_KILL` returns KILLED at once:
    // the Playwright child never runs, and the surface reports a full score with
    // a killed control while almost no overlay executed (diff round 2, P0).
    expect(killsMutant("KILLED")).toBe(true);
    expect(killsMutant("DID_NOT_KILL"), "a suite that did not kill must not end the loop").toBe(
      false,
    );
  });

  it("is the predicate the runner actually folds with — not a parallel copy", () => {
    // The point of extracting it was to move an `equality-flip` site OUT of the
    // unenrollable runner. That only holds while the runner calls it, so the
    // call is pinned: a reverted inline comparison restores the P0 silently.
    const runner = readFileSync(join(ROOT, "tests/mutation/browser/runner.ts"), "utf8");
    premiseHolds("the runner source was read", runner.includes("function runMutant"));
    expect(runner, "the runner must fold through killsMutant").toMatch(
      /if \(killsMutant\(verdict\)\) return "KILLED";/,
    );
    expect(
      runner,
      "no bare KILLED comparison may return to the runner — that is the flip site this removed",
    ).not.toMatch(/verdict\s*[!=]==\s*"KILLED"/);
  });
});

describe("accountOutcomes — the RunResult the gate consumes", () => {
  it("reconciles a mixed KILLED/SURVIVED fixture", () => {
    // An always-empty accounting passes "returns an object" and fails here.
    const result = accountOutcomes({
      surfaceId: "tapTargetFloor",
      baselineGreen: true,
      outcomes: [
        { siteId: "explicit:a", verdict: "KILLED" },
        { siteId: "explicit:b", verdict: "SURVIVED" },
        { siteId: "explicit:c", verdict: "KILLED" },
        { siteId: "explicit:d", verdict: "SURVIVED" },
      ],
    });
    expect(result).toEqual({
      surfaceId: "tapTargetFloor",
      mutantCount: 4,
      noOps: [],
      baselineGreen: true,
      killed: 2,
      survivors: ["explicit:b", "explicit:d"],
      outcomes: [
        { siteId: "explicit:a", verdict: "KILLED" },
        { siteId: "explicit:b", verdict: "SURVIVED" },
        { siteId: "explicit:c", verdict: "KILLED" },
        { siteId: "explicit:d", verdict: "SURVIVED" },
      ],
    });
  });

  it("accounts for every outcome exactly once — killed + survivors === mutantCount", () => {
    const outcomes = Array.from({ length: 19 }, (_, i) => ({
      siteId: `explicit:m${i}`,
      verdict: i % 5 === 0 ? ("SURVIVED" as const) : ("KILLED" as const),
    }));
    premiseHolds(
      "the fixture holds BOTH verdicts, so the accounting cannot pass by handling only one",
      outcomes.some((o) => o.verdict === "KILLED") &&
        outcomes.some((o) => o.verdict === "SURVIVED"),
    );
    const result = accountOutcomes({ surfaceId: "s", baselineGreen: true, outcomes });
    expect(result.killed + result.survivors.length).toBe(result.mutantCount);
    expect(result.mutantCount).toBe(19);
  });

  it("carries a red baseline through rather than silently scoring the run", () => {
    const result = accountOutcomes({ surfaceId: "s", baselineGreen: false, outcomes: [] });
    expect(result.baselineGreen).toBe(false);
  });

  it("refuses a duplicate siteId rather than emitting a survivor list the gate must catch", () => {
    expect(() =>
      accountOutcomes({
        surfaceId: "s",
        baselineGreen: true,
        outcomes: [
          { siteId: "explicit:a", verdict: "SURVIVED" },
          { siteId: "explicit:a", verdict: "KILLED" },
        ],
      }),
    ).toThrow(/duplicate/i);
  });
});

describe("runner seams — the pure decisions the spawn wrapper makes (spec §3.3)", () => {
  it("orders vitest suites before playwright, preserving order within a kind", () => {
    // Vitest children cost seconds and playwright children cost a browser boot,
    // so short-circuiting on the first kill is only cheap if the cheap suites
    // run first. Payload #17 is killed by the vitest suite alone, so this
    // ordering saves a full browser boot on that mutant every run.
    const pw = (filter: string) =>
      ({
        kind: "playwright",
        config: "tests/e2e/standalone.config.ts",
        filter,
        project: "standalone-chromium",
      }) as const;
    const vi = (path: string) => ({ kind: "vitest", path }) as const;
    const ordered = orderSuites([pw("a"), vi("x"), pw("b"), vi("y")]);
    expect(ordered.map((s) => (s.kind === "vitest" ? s.path : s.filter))).toEqual([
      "x",
      "y",
      "a",
      "b",
    ]);
  });

  it("leaves an already-ordered list untouched", () => {
    const suites = [
      { kind: "vitest", path: "x" } as const,
      { kind: "playwright", config: "c", filter: "f", project: "p" } as const,
    ];
    expect(orderSuites(suites)).toEqual(suites);
  });

  it("spawns playwright through `pnpm exec`, with the config, filter and project", () => {
    // `node_modules/.bin/*` entries are shell shims and are never handed to
    // process.execPath; the existing harness spawns through `pnpm exec` for the
    // same reason (tests/mutation/source/childRun.ts:18). A wrong argv here is a
    // silent no-op run, which the §3.4 report evidence catches — after paying
    // for the child.
    expect(
      childCommand({
        kind: "playwright",
        config: "tests/e2e/standalone.config.ts",
        filter: "tap-target-floor",
        project: "standalone-chromium",
      }),
    ).toEqual({
      file: "pnpm",
      args: [
        "exec",
        "playwright",
        "test",
        "--config",
        "tests/e2e/standalone.config.ts",
        "tap-target-floor",
        "--project",
        "standalone-chromium",
      ],
    });
  });

  it("spawns vitest through `pnpm exec` with the browser-mode overlay config", () => {
    expect(childCommand({ kind: "vitest", path: "tests/components/x.test.tsx" })).toEqual({
      file: "pnpm",
      args: [
        "exec",
        "vitest",
        "run",
        "--config",
        "tests/mutation/browser/vitestOverlay.config.ts",
        "tests/components/x.test.tsx",
      ],
    });
  });

  it("derives the sentinel path from the manifest path", () => {
    expect(sentinelPath("/tmp/x/manifest.json")).toBe("/tmp/x/manifest.json.ok");
  });

  it("aborts the surface on a red baseline rather than scoring every mutant KILLED", () => {
    // Against an already-red suite every mutant scores KILLED and the run
    // reports a meaningless perfect score.
    expect(() =>
      assertBrowserBaseline("s", [{ label: "pw", exitStatus: 0, executed: 56 }]),
    ).not.toThrow();
    expect(() =>
      assertBrowserBaseline("s", [{ label: "pw", exitStatus: 1, executed: 56 }]),
    ).toThrow(BaselineNotGreenError);
  });

  it("aborts when a green baseline executed NO tests — the no-tests trap", () => {
    // A filter or project resolving zero tests exits 0. Without this, every
    // mutant would run nothing and score SURVIVED.
    expect(() => assertBrowserBaseline("s", [{ label: "pw", exitStatus: 0, executed: 0 }])).toThrow(
      /no tests|0 test/i,
    );
  });

  it("aborts when the baseline child produced no numeric exit status", () => {
    expect(() =>
      assertBrowserBaseline("s", [{ label: "pw", exitStatus: null, executed: 56 }]),
    ).toThrow(MutantRunInfraError);
  });
});
