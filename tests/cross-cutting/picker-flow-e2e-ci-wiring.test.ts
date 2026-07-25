/**
 * tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts
 *
 * Keeps the picker-flow e2e suite from going dark again.
 *
 * Un-skipping the three stubs is not enough on its own: `testMatch` membership in
 * playwright.config.ts is not workflow wiring, and before this change the only
 * mobile-safari CI step named exactly one spec file — so "real CI green" could
 * pass without ever executing these regressions.
 *
 * Three things nothing else covers:
 *   1. the spec is named in a `playwright test` command,
 *   2. PICKER_COOKIE_SIGNING_KEY's VALUE is 64 hex in both bare-runner workflows
 *      (presence is pinned by REQUIRED_ENV in ci-workflow-speedup.test.ts, but a
 *      malformed value still throws at lib/env/pickerCookieSigningKey.ts),
 *   3. the `pull_request.paths` filter reaches every surface the suite exercises.
 *
 * Workflows are read as text with regexes — the same approach every existing
 * workflow scanner here uses, and there is no yaml dependency in this repo.
 *
 * Scope limit, stated so this file is not mistaken for more than it is: the
 * mobile-safari job stays path-filtered, so the spec is PATH_GATED rather than
 * PR-blocking-capable. Lifting that project to unconditional coverage is
 * BL-RESURRECT-MOBILE-SAFARI-E2E.
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
        // A comment starts at `#` when it opens the line or follows whitespace.
        if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]!))) return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

const read = (wf: string): string => stripComments(readRaw(wf));

/** The `pull_request.paths` block only, so a path named elsewhere cannot count. */
function pathsBlock(wf: string): string {
  const yaml = read(wf);
  const start = yaml.indexOf("paths:");
  if (start === -1) return "";
  const rest = yaml.slice(start);
  // Ends at the next key at two-space indent or shallower (e.g. `workflow_dispatch:`).
  const end = rest.slice(1).search(/\n {0,2}\S/);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

/**
 * Every surface a change to which should re-run this suite. Derived by walking
 * the spec's and its helpers' imports plus the runtime surfaces the cases drive.
 *
 * COARSE ON PURPOSE. Five review rounds each found another missing leaf — the
 * last one about thirty — which says enumeration is the wrong shape, not that the
 * list needed one more entry. These specs drive whole rendered routes, reaching
 * across app/, components/ and lib/ transitively, plus the schema the seed helpers
 * write and the CI inputs that build the server. Naming the trees cannot be
 * incomplete in the way a leaf list kept being.
 */
const REQUIRED_PATHS = [
  "app/**",
  "components/**",
  "lib/**",
  "supabase/**",
  "tests/e2e/**",
  "playwright.config.ts",
  "package.json",
  "pnpm-lock.yaml",
  ".github/workflows/crew-e2e.yml",
  ".github/actions/setup/**",
  "scripts/ci/**",
] as const;

/** Bare-runner workflows whose webServer inherits runner-level env. */
const KEYED_WORKFLOWS = ["crew-e2e.yml", "dev-gate-e2e.yml"] as const;

describe("picker-flow e2e CI wiring", () => {
  it("crew-e2e.yml runs the picker-flow spec under a project whose testMatch claims it", () => {
    const commands = [...read("crew-e2e.yml").matchAll(/playwright test[^\n]*/g)].map((m) => m[0]);
    const naming = commands.filter((c) => c.includes(SPEC));
    expect(
      naming.length,
      `no \`playwright test\` command in crew-e2e.yml names ${SPEC}. Un-skipped cases that no ` +
        "workflow runs are dark: CI would report green without executing them.",
    ).toBeGreaterThan(0);

    // Naming the file is not enough: a command selecting only mobile-safari while
    // naming picker-flow collects ZERO tests and still passes. So the command must
    // select a project whose testMatch actually claims this spec.
    const config = readFileSync(join(process.cwd(), "playwright.config.ts"), "utf8");
    const claiming = [
      ...config.matchAll(/name:\s*"([^"]+)"[\s\S]{0,4000}?testMatch:\s*\n?\s*\/\(([^/]+)\)/g),
    ]
      .filter(([, , alternatives]) => alternatives!.split("|").includes("picker-flow"))
      .map(([, project]) => project!);
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

  it.each(KEYED_WORKFLOWS)("%s sets a 64-hex PICKER_COOKIE_SIGNING_KEY under env:", (wf) => {
    const yaml = read(wf);
    // Must sit inside an `env:` mapping — a bare key elsewhere in the file reaches
    // no process.
    expect(
      /env:\s*(?:\n\s+#[^\n]*)*(?:\n\s+[A-Z_0-9]+:[^\n]*)*\n\s+PICKER_COOKIE_SIGNING_KEY:/.test(
        yaml,
      ),
      `${wf} does not set PICKER_COOKIE_SIGNING_KEY inside an env: mapping`,
    ).toBe(true);
    const match = /PICKER_COOKIE_SIGNING_KEY:\s*"?([0-9a-fA-F]*)"?/.exec(yaml);
    expect(match, `${wf} does not set PICKER_COOKIE_SIGNING_KEY at all`).not.toBeNull();
    expect(
      match![1],
      `${wf}'s PICKER_COOKIE_SIGNING_KEY must be 64 hex chars — pickerCookieSigningKey() throws ` +
        "on a malformed value, which turns the guest case into a setup crash rather than a " +
        "clean failure.",
    ).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each(REQUIRED_PATHS)("crew-e2e.yml's pull_request.paths covers %s", (path) => {
    expect(
      pathsBlock("crew-e2e.yml").includes(`- "${path}"`),
      `crew-e2e.yml's pull_request.paths omits ${path}, so a PR changing only that surface would ` +
        "not re-run the picker-flow suite.",
    ).toBe(true);
  });
});
