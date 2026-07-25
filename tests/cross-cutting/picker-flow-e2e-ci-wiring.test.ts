/**
 * tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts
 *
 * Keeps the picker-flow e2e suite from going dark again.
 *
 * Un-skipping the three stubs was not enough on its own: `testMatch` membership in
 * playwright.config.ts is not workflow wiring, and before this change the only
 * mobile-safari CI step named exactly one spec file — so "real CI green" could pass
 * without ever executing these regressions. Two independent gaps also existed:
 * `PICKER_COOKIE_SIGNING_KEY` was set in no workflow at all (so the suite would
 * have crashed at setup rather than failing cleanly), and the trigger's path
 * allow-list was incomplete.
 *
 * Coverage status, which the inverted trigger changed: because the workflow now
 * filters by `paths-ignore` rather than `paths`, the scanner in
 * tests/ci/_workflowCoverageScan.ts no longer classifies it as path-filtered, so
 * BOTH specs it runs are genuinely PR-covered and their `PATH_GATED` allowlist
 * rows were removed. That is a real improvement over the `PATH_GATED` state this
 * branch first aimed for. It does not lift the REST of the mobile-safari project,
 * which stays dark under BL-RESURRECT-MOBILE-SAFARI-E2E.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SPEC = "tests/e2e/picker-flow.spec.ts";

const readRaw = (wf: string): string =>
  readFileSync(join(process.cwd(), ".github/workflows", wf), "utf8");

/**
 * Strip YAML comments — WHOLE-LINE and TRAILING.
 *
 * Review found all three assertions passing against commented-out wiring, twice.
 * Removing only full-line comments still accepted
 * `run: echo ok # playwright test …picker-flow.spec.ts`,
 * `FOO: bar # PICKER_COOKIE_SIGNING_KEY: "<64hex>"` and
 * `- "other" # - "app/auth/**"`. A guard that greens on disabled wiring is worse
 * than no guard, so the trailing form is stripped too — quote-aware, since a `#`
 * inside a quoted scalar is data, not a comment.
 */
function stripComments(yaml: string): string {
  return yaml
    .split("\n")
    .map((line) => {
      let quote: string | null = null;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i]!;
        if (quote !== null) {
          if (ch === quote) quote = null;
          continue;
        }
        if (ch === '"' || ch === "'") {
          quote = ch;
          continue;
        }
        if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]!))) return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

const read = (wf: string): string => stripComments(readRaw(wf));

/** Drop `//` and block comments, preserving string and regex literals. */
function stripTsComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "//") {
      const nl = src.indexOf("\n", i);
      i = nl === -1 ? src.length : nl;
      continue;
    }
    if (two === "/*") {
      const close = src.indexOf("*/", i + 2);
      i = close === -1 ? src.length : close + 2;
      continue;
    }
    const ch = src[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== ch) j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** The `pull_request.paths-ignore` block only, so an entry elsewhere cannot count. */
function pathsIgnoreBlock(wf: string): string {
  const yaml = read(wf);
  const start = yaml.indexOf("paths-ignore:");
  if (start === -1) return "";
  const rest = yaml.slice(start);
  const end = rest.slice(1).search(/\n {0,2}\S/);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

/**
 * The trigger is INVERTED: `paths-ignore`, not `paths`.
 *
 * Six review rounds each found another missing entry in an allow-list — leaf files,
 * then whole trees, then build inputs like next.config.ts, tsconfig.json,
 * instrumentation.ts and the pretest generators. An allow-list of "everything that
 * can affect this job" cannot be completed by inspection: the job builds the app
 * and these specs drive whole rendered routes.
 *
 * `paths-ignore` cannot be incomplete in the dangerous direction — anything not
 * listed triggers the job — so the contract pinned here is narrow and checkable:
 * the workflow must use `paths-ignore`, and every entry must be a DOCS pattern,
 * since prose cannot change what the app does.
 */
const DOCS_ONLY = /(\.md$|^docs\/|^\.github\/ISSUE_TEMPLATE\/|^LICENSE$)/;

/** Bare-runner workflows whose webServer inherits runner-level env. */
const KEYED_WORKFLOWS = ["crew-e2e.yml", "dev-gate-e2e.yml"] as const;

describe("picker-flow e2e CI wiring", () => {
  it("crew-e2e.yml runs the spec under a project whose testMatch claims it", () => {
    // From `run:` lines only: a step `name:` mentioning the spec must not satisfy
    // this, which an earlier version accepted.
    const commands = [...read("crew-e2e.yml").matchAll(/\n\s*(?:-\s*)?run:\s*([^\n]*)/g)]
      .map((m) => m[1]!)
      .filter((c) => c.includes("playwright test"));
    const naming = commands.filter((c) => c.includes(SPEC));
    expect(
      naming.length,
      `no \`playwright test\` run: line in crew-e2e.yml names ${SPEC}. Un-skipped cases that no ` +
        "workflow runs are dark: CI would report green without executing them.",
    ).toBeGreaterThan(0);

    // Naming the file is not enough: a command selecting only mobile-safari while
    // naming picker-flow collects ZERO tests and still passes. Split the config on
    // project boundaries first — one lazy regex could pair a project's name with a
    // LATER project's testMatch.
    // Comments stripped first: a commented-out `// testMatch: /(picker-flow|…)/`
    // above a live one marked the project as claiming the spec, while the real
    // run collected zero picker tests.
    const config = stripTsComments(
      readFileSync(join(process.cwd(), "playwright.config.ts"), "utf8"),
    );
    const claiming = config
      .split(/\n\s*name:\s*"/)
      .slice(1)
      .map((block) => {
        const project = block.slice(0, block.indexOf('"'));
        const match = /testMatch:\s*\n?\s*\/\(([^/]+)\)/.exec(block);
        return match !== null && match[1]!.split("|").includes("picker-flow") ? project : null;
      })
      .filter((p): p is string => p !== null);
    expect(
      claiming.length,
      "no playwright.config.ts project's testMatch includes picker-flow",
    ).toBeGreaterThan(0);
    expect(
      naming.some((c) => claiming.some((project) => c.includes(`--project=${project}`))),
      `the command naming ${SPEC} selects no project whose testMatch claims it (claiming: ` +
        `${claiming.join(", ")}). It would collect zero tests and still report green.`,
    ).toBe(true);
  });

  it("crew-e2e.yml uses paths-ignore, so a new code path cannot silently skip it", () => {
    const yaml = read("crew-e2e.yml");
    const trigger = yaml.slice(0, yaml.indexOf("jobs:"));
    expect(
      /\n\s+paths-ignore:/.test(trigger),
      "crew-e2e.yml must filter with paths-ignore rather than paths: an allow-list of affecting " +
        "paths was found incomplete in six consecutive review rounds, while paths-ignore cannot " +
        "be incomplete in the direction that matters.",
    ).toBe(true);
    expect(
      /\n\s+paths:/.test(trigger),
      "a paths: allow-list re-opens the incompleteness class",
    ).toBe(false);
  });

  it("every paths-ignore entry is a docs pattern", () => {
    // Quotes optional: `- app/**` and `- 'app/**'` were invisible to a
    // double-quote-only parser, so a code pattern could hide there while the
    // quoted docs entries kept the list non-empty and the test green.
    const entries = [...pathsIgnoreBlock("crew-e2e.yml").matchAll(/^\s*-\s*(.+?)\s*$/gm)].map((m) =>
      m[1]!.replace(/^['"]|['"]$/g, ""),
    );
    expect(entries.length, "paths-ignore is empty").toBeGreaterThan(0);
    expect(
      entries.filter((e) => !DOCS_ONLY.test(e)),
      "paths-ignore may only skip documentation. A code or config pattern here means a change to " +
        "it would NOT run the picker-flow suite, which is the failure this guard exists for.",
    ).toEqual([]);
  });

  it.each(KEYED_WORKFLOWS)(
    "%s sets a 64-hex PICKER_COOKIE_SIGNING_KEY where the run sees it",
    (wf) => {
      const yaml = read(wf);
      // Locality matters, not just presence: the key must sit in an `env:` mapping
      // that the Playwright process (and the server it spawns) actually inherits.
      // A file-global check passes when the only valid key is moved into an
      // unrelated job or step, where it reaches nothing.
      //
      // crew-e2e keeps its secrets at JOB level (two-space indent under the job);
      // dev-gate keeps them in the Playwright run STEP's env: block (deeper indent).
      const expectedIndent = wf === "crew-e2e.yml" ? 6 : 10;
      const located = new RegExp(`\\n {${expectedIndent}}PICKER_COOKIE_SIGNING_KEY:`).test(yaml);
      expect(
        located,
        `${wf} sets PICKER_COOKIE_SIGNING_KEY, but not at the ${expectedIndent}-space indent that ` +
          "puts it in the env: block the Playwright run inherits. A key in an unrelated job or " +
          "step reaches no process.",
      ).toBe(true);
      const match = /PICKER_COOKIE_SIGNING_KEY:\s*"?([0-9a-fA-F]*)"?/.exec(yaml);
      expect(match, `${wf} does not set PICKER_COOKIE_SIGNING_KEY at all`).not.toBeNull();
      expect(
        match![1],
        `${wf}'s PICKER_COOKIE_SIGNING_KEY must be 64 hex chars — pickerCookieSigningKey() throws ` +
          "on a malformed value, which turns the guest case into a setup crash rather than a clean " +
          "failure.",
      ).toMatch(/^[0-9a-f]{64}$/);
    },
  );
});
