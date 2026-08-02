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

const ROOT = process.cwd();
const PROJECT = "standalone-webkit-a11y";

describe("standalone WebKit a11y leg wiring", () => {
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
    // install), run scalars split on shell operators, each segment must be a
    // pnpm/npx-prefixed playwright invocation (an `echo playwright install webkit` payload
    // is non-executing), and `webkit` must appear as a WHOLE token of that segment.
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
    const installSegments = (subcommand: "install" | "install-deps"): string[][] =>
      [
        ...stripYaml(
          readFileSync(join(ROOT, ".github/workflows/standalone-e2e.yml"), "utf8"),
        ).matchAll(/\n\s*(?:-\s*)?run:\s*([^\n]*)/g),
      ]
        .map((m) => m[1]!)
        .flatMap((c) => c.split(/&&|\|\||;|\|/))
        .map((seg) => seg.trim().split(/\s+/))
        .filter((t) => {
          const i = t.indexOf("playwright");
          return (
            i !== -1 && t[i + 1] === subcommand && t.slice(0, i).every((w) => RUNNER_PREFIX.has(w))
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
