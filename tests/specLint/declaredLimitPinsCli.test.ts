import { afterEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prepareSuiteText } from "../../scripts/spec-lint";
import { discoverPins } from "../../lib/specLint/declaredLimitPins";
import { premiseHolds } from "../_shared/premise";

/**
 * Task 7b — the ADAPTER boundary (spec §4, AC-10).
 *
 * ── WHY THIS FILE EXISTS AT ALL ────────────────────────────────────────────────
 * Every other suite in this arc exercises the pure core with prepared lines the TEST
 * supplies. A shipped adapter that passes RAW lines, or never injects the surface table,
 * satisfies all of them — and the whole false-advisory class survives at the boundary
 * where it actually lives. `0 hard` cannot catch it either: the arm is advisory-only, so
 * the dogfood lint is green whether or not the arm ever ran.
 *
 * ── THE PROOF IS TWO STEPS, BECAUSE NO ONE MECHANISM REACHES BOTH FACTS ────────
 * Plan round 1 established the constraint: the shipped CLI resolves `suitePaths` from the
 * REAL registry and the tracked-file index, so a fixture suite under `__fixtures__/` is
 * NEVER READ by a real subprocess and decoys planted there are unobservable. Planting
 * them in a real enrolled suite would mean editing a tracked test to make a test pass.
 *
 *   PREPARATION is proved IN PROCESS, against the adapter's exported preparation
 *   function over fixture suite TEXT holding one live pin plus one decoy per channel.
 *   WIRING is proved BY SUBPROCESS, over a fixture PLAN naming a REAL enrolled surface,
 *   asserting the advisory appears identified by that surface's specific
 *   `(suitePath, title)` — not merely that some advisory was emitted, which ANY advisory
 *   the run happens to produce would satisfy.
 *
 * Neither covers the other, and neither covers table-driven NAMING — Task 2's
 * synthetic-surface case does that. Three facts, three proofs, stated so none is read as
 * covering more.
 *
 * ── THE DECOY TITLES MUST ALL DIFFER ───────────────────────────────────────────
 * With identical titles the pins share a `(path, title)` identity, §3.3's dedup collapses
 * them, and an adapter that NEVER PREPARES emits exactly one finding — the pass
 * condition. The proof would be satisfiable by the defect it exists to catch. Round 5
 * found precisely that in a draft written one round earlier.
 */

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const SUITE = "tests/qplinth/decoys.test.ts";

const LIVE = "the qplinth live relay is a documented limit";
const DECOY_COMMENT = "the qplinth commented relay is a known miss";
const DECOY_TEMPLATE = "the qplinth templated relay is a declared miss";
const DECOY_MULTILINE = "the qplinth stringy relay is a documented limit";

/** One LIVE pin, plus ONE DECOY PER PREPARATION CHANNEL, each differently titled. */
const DECOY_SUITE = [
  `test("${LIVE}", () => {});`,
  "",
  "/*",
  `test("${DECOY_COMMENT}", () => {});`,
  "*/",
  "",
  "const templated = `",
  `test("${DECOY_TEMPLATE}", () => {});`,
  "`;",
  "",
  // SINGLE-quoted outer delimiter deliberately. With a double-quoted one the inner quotes
  // must be backslash-escaped, and the line is then declined by the first-argument-literal
  // rule rather than by preparation — a DIFFERENT rule deciding the observation, which
  // would make this fixture prove nothing about the channel it names.
  "const stringy = '\\",
  `test("${DECOY_MULTILINE}", () => {});\\`,
  "';",
];

describe("prepareSuiteText — PREPARATION, in process (AC-10 step 1)", () => {
  it("blanks every decoy channel while the LIVE pin survives", () => {
    const prepared = prepareSuiteText(SUITE, DECOY_SUITE);
    expect(prepared.status).toBe("ok");
    if (prepared.status !== "ok") return;
    const text = prepared.lines.join("\n");

    // The assertion is the exact surviving SET, never merely that the decoys are gone: a
    // preparation that blanked the WHOLE FILE would satisfy that half on its own.
    expect(text, "the live pin's title must survive preparation").toContain(LIVE);
    for (const decoy of [DECOY_COMMENT, DECOY_TEMPLATE, DECOY_MULTILINE]) {
      expect(text, `decoy survived preparation: ${decoy}`).not.toContain(decoy);
    }

    // And the pin set the CORE then discovers is exactly the live one.
    expect(discoverPins(SUITE, prepared.lines, []).map((p) => p.title)).toEqual([LIVE]);
  });

  it("preserves the line count, so reported locations still point at the right lines", () => {
    const prepared = prepareSuiteText(SUITE, DECOY_SUITE);
    if (prepared.status !== "ok") throw new Error("expected ok");
    expect(prepared.lines.length).toBe(DECOY_SUITE.length);
  });

  it("leaves a healthy suite's pin alone — the paired positive for the blanking above", () => {
    const prepared = prepareSuiteText(SUITE, [`test("${LIVE}", () => {});`]);
    if (prepared.status !== "ok") throw new Error("expected ok");
    expect(discoverPins(SUITE, prepared.lines, []).map((p) => p.title)).toEqual([LIVE]);
  });
});

describe("prepareSuiteText — DIAGNOSTICS COME FROM THE RAW TEXT (spec §8 item 15)", () => {
  /**
   * The ONLY executable proof that the order is parse-then-blank rather than
   * blank-then-parse. A GENERIC syntax error passes under either order; this one passes
   * only if diagnostics were taken from the raw text, because stripping first CONSUMES
   * the unterminated opener to EOF and yields a clean parse — then blanks the pin along
   * with everything after it and reports "no pins" with no unreadable advisory.
   */
  const UNTERMINATED = ["/*", `test("${LIVE}", () => {});`];

  it("DECLINES a suite whose only defect is an unterminated block comment", () => {
    expect(prepareSuiteText(SUITE, UNTERMINATED).status).toBe("parse-failed");
  });

  it("…while the SAME BYTES with the opener closed prepare cleanly and keep the pin", () => {
    // ONE VARIABLE: the comment is terminated. Without this pair, "parse-failed" is
    // satisfied by an implementation that declines everything it is handed.
    const prepared = prepareSuiteText(SUITE, ["/* */", `test("${LIVE}", () => {});`]);
    expect(prepared.status).toBe("ok");
    if (prepared.status !== "ok") return;
    expect(discoverPins(SUITE, prepared.lines, []).map((p) => p.title)).toEqual([LIVE]);
  });
});

describe("the shipped CLI — WIRING, by subprocess (AC-10 step 2)", () => {
  /**
   * A REAL enrolled surface, because the shipped adapter reads the real registry and
   * would not name a synthetic one.
   *
   * This is also the POSITIVE CONTROL the closeout owes. The arm is SILENT on this arc's
   * own spec and plan for two measured reasons, and their `0 hard` is not evidence it
   * ran — so without a case showing it FIRE somewhere, a reader has two absences
   * reinforcing each other and no proof the arm works at all.
   *
   * Idiom copied from `tests/specLint/taskContractWiring.test.ts` rather than invented:
   * spawn node on tsx's `cli.mjs` directly, because `.bin/tsx` is a SHELL WRAPPER, and
   * write the fixture plan UNDER THE REPO, because the CLI resolves its argument relative
   * to the repo root.
   */
  const TSX = join(ROOT, "node_modules/tsx/dist/cli.mjs");
  const DIR = "tests/.spec-lint-fixtures-declared-limit-pins";
  const REAL_SUITE = "tests/docs/interactionTimingScan.test.ts";
  const REAL_PIN = "a COMPUTED key is a documented limit, not a site";

  afterEach(() => {
    rmSync(join(ROOT, DIR), { recursive: true, force: true });
  });

  it("emits the advisory identified by that surface's specific (suitePath, title)", () => {
    mkdirSync(join(ROOT, DIR), { recursive: true });
    const rel = `${DIR}/plan.md`;
    // NON-DECLINING Files shape: header, then an unordered item on the VERY NEXT line. No
    // blank, because a blank is DECLINED (§8 item 14) — which is exactly why this arc's
    // own plan draws no advisories and why this fixture had to be written deliberately.
    writeFileSync(join(ROOT, rel), ["**Files:**", `- Modify: \`${REAL_SUITE}\``, ""].join("\n"));

    // `--kind plan` is REQUIRED and is not a convenience: the CLI infers kind FROM THE
    // PATH, and a fixture under tests/ infers neither, exiting 2 with "cannot infer kind
    // from path" and NO stdout. The alternative — putting the fixture under
    // docs/superpowers/plans/ so inference works — would enrol it in the tracked corpus
    // and MOVE the §2.6 advisory set that Task 6 pins. So the flag is what keeps this
    // fixture out of the corpus it would otherwise perturb.
    const r = spawnSync(process.execPath, [TSX, "scripts/spec-lint.ts", "--kind", "plan", rel], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const stdout = r.stdout ?? "";

    premiseHolds("the CLI produced output at all", stdout.trim().length > 0);
    // IDENTITY, not mere presence: "some advisory appeared" is satisfied by any advisory
    // the run happens to produce, including one from an unrelated surface.
    expect(stdout).toContain("DECLARED_LIMIT_PIN_UNNAMED");
    expect(stdout).toContain(REAL_SUITE);
    expect(stdout).toContain(REAL_PIN);
  });
});
