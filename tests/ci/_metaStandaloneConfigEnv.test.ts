/**
 * tests/ci/_metaStandaloneConfigEnv.test.ts
 *
 * Two specs in the standalone config reach the REAL server chain at module
 * load (`requireAdmin` -> `hashForLog` -> `lib/log` -> `lib/supabase/server`),
 * where module-level guards throw on missing env. That used to be patched
 * twice — `tests/e2e/helpers/loadTestEnv.ts` for a developer machine, and one
 * workflow's `env:` block for CI — so retiring that workflow would have broken
 * them. The fallbacks now live in the config, once.
 *
 * PRECEDENCE, stated correctly. Playwright evaluates the config BEFORE loading
 * any test module, so a top-level `process.env.X ??=` lands first, and
 * `loadTestEnv` (via `@next/env`, which preserves already-defined process
 * values) will NOT override it. The config defaults therefore WIN over
 * `.env.local`.
 *
 * That is acceptable only because every value is a placeholder rather than a
 * credential, so this pins that property instead of assuming it.
 *
 * Every check reads the AST, never the source text: an adversarial round
 * showed all three of the original text checks could be satisfied by
 * COMMENTED-OUT assignments, which is fail-open in the worst direction for a
 * guard whose whole job is to notice a real credential.
 *
 * Spec: docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md §4.1.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  defaultsPrecedeDefineConfig,
  envDefaults,
  envHardAssignments,
} from "./_standaloneConfigScan";

const ROOT = process.cwd();
const CONFIG = "tests/e2e/standalone.config.ts";

/** The nine variables the retired workflow supplied. */
const REQUIRED = [
  "HASH_FOR_LOG_PEPPER",
  "JWT_SIGNING_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

describe("standalone config carries its own env fallbacks", () => {
  const source = readFileSync(join(ROOT, CONFIG), "utf8");

  it("ignores commented-out and stringified assignments", () => {
    // The exact fail-open an adversarial round found: a text scan reads these
    // as real. Pinned first, because every assertion below trusts this reader.
    const decoy = [
      '// process.env.HASH_FOR_LOG_PEPPER ??= "commented";',
      '/* process.env.SUPABASE_URL ??= "block-commented"; */',
      "const doc = 'process.env.JWT_SIGNING_SECRET ??= \"in-a-string\"';",
      'process.env.REAL_ONE ??= "live";',
    ].join("\n");
    expect([...envDefaults(decoy).keys()]).toEqual(["REAL_ONE"]);
  });

  it("defaults exactly the required set, by name", () => {
    // Set equality, not a count: an earlier version asserted only the NUMBER
    // of assignments, which a duplicate plus a missing name satisfies.
    expect(new Set(envDefaults(source).keys())).toEqual(new Set(REQUIRED));
  });

  it("uses ??= and never bare assignment, so a caller's env is never clobbered", () => {
    expect(envHardAssignments(source)).toEqual([]);
  });

  it("sets the defaults BEFORE defineConfig, or Playwright loads tests first", () => {
    expect(defaultsPrecedeDefineConfig(source)).toBe(true);
  });

  it("carries no value that looks like a real credential", () => {
    // The precedence above means these WIN over .env.local, so the guard is
    // load-bearing. A demo Supabase JWT is identified by its well-known
    // issuer AND its well-known signature — checking `iss` alone trusts an
    // unsigned payload an attacker controls, which an adversarial round
    // correctly flagged.
    const DEMO_SIGNATURES = new Set([
      "CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
      "EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
    ]);
    for (const [name, value] of envDefaults(source)) {
      if (value.startsWith("eyJ")) {
        const [, payload, signature] = value.split(".");
        const body = JSON.parse(Buffer.from(payload!, "base64url").toString()) as { iss?: string };
        expect(body.iss, `${name}: must be a demo token`).toBe("supabase-demo");
        expect(DEMO_SIGNATURES.has(signature!), `${name}: unknown signature`).toBe(true);
      } else {
        expect(value, `${name} must be an obvious placeholder`).toMatch(/test|demo|127\.0\.0\.1/i);
      }
    }
  });
});
