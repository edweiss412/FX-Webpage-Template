/**
 * tests/ci/standalone-webkit-a11y-wiring.test.ts
 *
 * BL-AGENDA-A11Y-WEBKIT-COVERAGE (spec docs/superpowers/specs/schedule/
 * 2026-08-02-agenda-fold-seeded-e2e-webkit-design.md §4/§6 T4): the fold's accessibility
 * proof must run on WebKit, and the project selecting it must resolve EXACTLY one test.
 *
 * The exact-one pin is the joined-title grep trap made structural: Playwright applies a
 * project's `grep` to "<project> <file> <title>", so an anchored /^a11y:/ silently selects
 * ZERO tests (review R1 probe), and a loosened pattern could select the dimensional tests
 * too — both regress THIS assertion, not just coverage intent.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import standaloneConfig from "../e2e/standalone.config";
import ts from "typescript";

import { stripCommentsSafely } from "../_shared/stripComments";
import { activatedRunScalars } from "../_shared/workflowActivation";

const ROOT = process.cwd();
const PROJECT = "standalone-webkit-a11y";

describe("standalone WebKit a11y leg wiring", () => {
  it(`${PROJECT} actually runs on WebKit`, () => {
    // Whole-diff review R1 (HIGH) escaping mutant: swapping `devices["Desktop Safari"]` for
    // `devices["Desktop Chrome"]` left the exactly-one-test pin below green while Safari
    // coverage went completely dark — the engine was the ONE thing the leg exists to prove and
    // the ONLY thing nothing asserted. Read from the RESOLVED config object, not the source
    // text: `use` is what Playwright launches with, and a device spread that stopped carrying
    // webkit would regress this even if the source still spelled a Safari-looking device name.
    const project = standaloneConfig.projects?.find((p) => p.name === PROJECT);
    expect(project, `${PROJECT} is not defined in tests/e2e/standalone.config.ts`).toBeDefined();
    // EFFECTIVE engine, not the device default. Whole-diff review R5 (HIGH) escaping mutant: an
    // explicit `browserName: "chromium"` after the Desktop Safari spread left
    // `defaultBrowserType` reading "webkit" while the worker fixture launched Chromium.
    // `browserName` is an overridable worker option that merely DEFAULTS from
    // `defaultBrowserType`, so the override is what decides.
    // The spec itself can override the project too. R7 (HIGH) escaping mutant:
    // `test.use({ browserName: "chromium" })` at file scope makes the selected test launch
    // Chromium while this config read still says "webkit" — Playwright applies project options
    // first, then parent/file `test.use` overrides. Nothing downstream notices: project name,
    // test title and spec id are all unchanged, so the baseline stays green too. Refuse the
    // construct in the file this leg selects rather than trying to model its precedence.
    const specSrc = stripCommentsSafely(
      readFileSync(join(ROOT, "tests/e2e/agendaScheduleLayout.spec.ts"), "utf8"),
      ts.ScriptKind.TS,
    );
    expect(
      [/test\.use\s*\(/, /\bbrowserName\b/].filter((re) => re.test(specSrc)).map(String),
      "tests/e2e/agendaScheduleLayout.spec.ts declares test.use/browserName. A file- or " +
        "describe-scoped override wins over the project's engine, so this leg could report a " +
        "green WebKit run while executing Chromium. Put engine selection in the project only.",
    ).toEqual([]);

    // Precedence, all three levels. R8 (HIGH) escaping mutant: a TOP-LEVEL
    // `use: { browserName: "chromium" }` beats the project's device default, and reading only
    // `project.use` still answered "webkit". Playwright resolves a direct `browserName` — wherever
    // it is declared — over the device spread's `defaultBrowserType`, and the project's own `use`
    // wins over the config's.
    const engine =
      project!.use?.browserName ??
      standaloneConfig.use?.browserName ??
      project!.use?.defaultBrowserType;
    expect(
      engine,
      `${PROJECT} must launch WebKit — a Chromium device OR an explicit browserName override ` +
        "here makes the leg a duplicate of standalone-chromium and leaves Safari, an explicit " +
        "crew target, uncovered.",
    ).toBe("webkit");
  });

  it(`the standalone config resolves ${PROJECT} to exactly the one a11y test`, () => {
    const out = execFileSync(
      "pnpm",
      [
        "exec",
        "playwright",
        "test",
        "--config",
        "tests/e2e/standalone.config.ts",
        `--project=${PROJECT}`,
        "--list",
        "--reporter=json",
      ],
      { cwd: ROOT, encoding: "utf8", timeout: 300_000, maxBuffer: 64 * 1024 * 1024 },
    );
    const parsed = JSON.parse(out.slice(out.indexOf("{"))) as { suites?: unknown[] };
    const tests: { file: string; title: string }[] = [];
    const walk = (suites: unknown[]): void => {
      for (const suite of suites) {
        const s = suite as {
          file?: string;
          suites?: unknown[];
          specs?: { title: string; file: string }[];
        };
        for (const spec of s.specs ?? []) tests.push({ file: spec.file, title: spec.title });
        if (s.suites) walk(s.suites);
      }
    };
    walk(parsed.suites ?? []);
    expect(
      tests,
      `${PROJECT} must resolve exactly ONE test: the a11y disclosure/heading proof in ` +
        "agendaScheduleLayout.spec.ts. Zero = the grep regressed to non-matching (joined-title " +
        "trap); more = the dimensional suite leaked onto WebKit.",
    ).toHaveLength(1);
    expect(tests[0]!.file).toContain("agendaScheduleLayout.spec.ts");
    expect(tests[0]!.title).toContain("a11y:");
  });

  it("standalone-e2e.yml installs webkit alongside chromium", () => {
    // Executing-position, token-exact matching (plan-review R1 families MF1-MF4): YAML
    // comments are stripped (quote-aware, trailing `# webkit` is a disabled token, not an
    // install), only the HEAD segment of each run scalar counts (MF7 — an operator-guarded
    // segment such as `true || pnpm exec playwright install webkit` is skipped by the shell
    // whenever the left side succeeds, and static text cannot decide it; same fail-closed
    // command-position rule as picker-flow-e2e-ci-wiring.test.ts), that segment must be a
    // pnpm/npx-prefixed playwright invocation (an `echo playwright install webkit` payload
    // is non-executing), and `webkit` must appear as a WHOLE token of it.
    const stripYaml = (yaml: string): string =>
      yaml
        .split("\n")
        .map((line) => {
          let quote: string | null = null;
          for (let i = 0; i < line.length; i += 1) {
            const ch = line[i]!;
            if (quote !== null) {
              if (ch === quote) quote = null;
              continue;
            }
            if (ch === '"' || ch === "'") quote = ch;
            else if (ch === "#") return line.slice(0, i);
          }
          return line;
        })
        .join("\n");
    const RUNNER_PREFIX = new Set(["pnpm", "npx", "yarn", "exec"]);
    // Non-INSTALLING modes (whole-diff review R2 HIGH live mutant): `playwright install
    // --dry-run … webkit` and `install-deps --dry-run … webkit` print what they would do and exit
    // 0 having installed nothing, so a cold runner gets neither the WebKit binary nor its system
    // dependencies while the segment stays install-shaped. `--help`/`-h` are the same
    // exit-0-without-acting shape. Segments carrying any of these are not installs.
    const NON_INSTALLING = new Set(["--dry-run", "--help", "-h"]);
    // Activation (R6/R7) is decided by the shared tests/_shared/workflowActivation module, which
    // both wiring guards import so a fix to one is a fix to both.
    const installSegments = (subcommand: "install" | "install-deps"): string[][] =>
      activatedRunScalars(readFileSync(join(ROOT, ".github/workflows/standalone-e2e.yml"), "utf8"))
        .map((c) => stripYaml(c))
        .map((c) => c.split(/&&|\|\||;|\|/)[0]!)
        .map((seg) => seg.trim().split(/\s+/))
        .filter((t) => {
          const i = t.indexOf("playwright");
          return (
            i !== -1 &&
            t[i + 1] === subcommand &&
            t.slice(0, i).every((w) => RUNNER_PREFIX.has(w)) &&
            !t.some((w) => NON_INSTALLING.has(w))
          );
        });
    expect(
      installSegments("install-deps").some((t) => t.includes("webkit")),
      "no executing playwright install-deps segment carries webkit as a whole token — the " +
        "WebKit project would fail on a cold CI runner",
    ).toBe(true);
    expect(
      installSegments("install").some((t) => t.includes("webkit")),
      "no executing playwright install segment carries webkit as a whole token — the WebKit " +
        "project would fail on a cold CI runner",
    ).toBe(true);
  });
});
