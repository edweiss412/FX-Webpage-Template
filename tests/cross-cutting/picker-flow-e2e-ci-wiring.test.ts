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
 * Workflow text with comment lines removed.
 *
 * Every assertion below runs on this, not the raw file: review found all three
 * checks passing against COMMENTED-OUT wiring, since `# run: playwright test …`,
 * `# PICKER_COOKIE_SIGNING_KEY: …` and `# - "path"` all satisfy a naive match. A
 * guard that greens on disabled wiring is worse than no guard.
 */
const read = (wf: string): string =>
  readRaw(wf)
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");

/**
 * Every surface a change to which should re-run this suite. Derived by walking
 * the spec's and its helpers' imports plus the runtime surfaces the cases drive.
 *
 * FOUR review rounds each caught another omission, so treat the list as
 * discovered rather than derived. The last round added the module-evaluated and
 * schema dependencies: `lib/email/hashForLog.ts`, `lib/log/**`, `lib/messages/**`
 * and `lib/adminAlerts/**` are all reached by the picker-bootstrap route the
 * first-contact case drives, and `supabase/migrations/**` defines the resolver,
 * claim and selection RPCs plus the tables the seed helpers write, so a schema
 * change can break every case in the file.
 */
const REQUIRED_PATHS = [
  SPEC,
  "app/auth/**",
  "app/api/auth/**",
  "app/api/test-auth/**",
  "app/show/**",
  "components/auth/**",
  "lib/auth/**",
  "lib/http/**",
  "lib/crew/**",
  "lib/supabase/server.ts",
  "lib/email/canonicalize.ts",
  "lib/email/hashForLog.ts",
  "lib/env/pickerCookieSigningKey.ts",
  "lib/log/**",
  "lib/messages/**",
  "lib/adminAlerts/**",
  "supabase/migrations/**",
] as const;

/** Bare-runner workflows whose webServer inherits runner-level env. */
const KEYED_WORKFLOWS = ["crew-e2e.yml", "dev-gate-e2e.yml"] as const;

describe("picker-flow e2e CI wiring", () => {
  it("crew-e2e.yml runs the picker-flow spec in a playwright command", () => {
    const yaml = read("crew-e2e.yml");
    const commands = [...yaml.matchAll(/playwright test[^\n]*/g)].map((m) => m[0]);
    expect(
      commands.some((c) => c.includes(SPEC)),
      `no \`playwright test\` command in crew-e2e.yml names ${SPEC}. Un-skipped cases that no ` +
        "workflow runs are dark: CI would report green without executing them.",
    ).toBe(true);
  });

  it.each(KEYED_WORKFLOWS)("%s sets a 64-hex PICKER_COOKIE_SIGNING_KEY", (wf) => {
    const match = /PICKER_COOKIE_SIGNING_KEY:\s*"?([0-9a-fA-F]*)"?/.exec(read(wf));
    expect(match, `${wf} does not set PICKER_COOKIE_SIGNING_KEY at all`).not.toBeNull();
    expect(
      match![1],
      `${wf}'s PICKER_COOKIE_SIGNING_KEY must be 64 hex chars — pickerCookieSigningKey() throws ` +
        "on a malformed value, which turns the guest case into a setup crash rather than a " +
        "clean failure.",
    ).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each(REQUIRED_PATHS)("crew-e2e.yml's pull_request.paths covers %s", (path) => {
    const yaml = read("crew-e2e.yml");
    const trigger = yaml.slice(0, yaml.indexOf("jobs:"));
    expect(
      trigger.includes(`- "${path}"`),
      `crew-e2e.yml's pull_request.paths omits ${path}, so a PR changing only that surface would ` +
        "not re-run the picker-flow suite.",
    ).toBe(true);
  });
});
