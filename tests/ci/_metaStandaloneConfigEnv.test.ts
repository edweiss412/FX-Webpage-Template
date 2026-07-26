/**
 * tests/ci/_metaStandaloneConfigEnv.test.ts
 *
 * Two specs in the standalone config reach the REAL server chain at module
 * load (`requireAdmin` -> `hashForLog` -> `lib/log` -> `lib/supabase/server`),
 * where module-level guards throw on missing env. Today that is patched
 * TWICE: `tests/e2e/helpers/loadTestEnv.ts` fixes a developer machine, and
 * `.github/workflows/modal-header-layout-e2e.yml` copies nine variables into
 * one workflow's `env:`. Only the CI half covers the failing specs — which is
 * precisely why retiring that workflow would break them.
 *
 * So the fallbacks move into the config, once, where every consumer of the
 * config gets them.
 *
 * PRECEDENCE, stated correctly. Playwright evaluates the config BEFORE
 * loading any test module, so a top-level `process.env.X ??=` here populates
 * the variable first, and `loadTestEnv` (via `@next/env`, which preserves
 * already-defined process values) will NOT override it. The config defaults
 * therefore win over `.env.local`, not the other way round.
 *
 * That is deliberate and acceptable ONLY because every value is a
 * placeholder rather than a credential — the same demo values
 * `playwright.config.ts` already uses. This test pins that property, because
 * the day someone adds a real secret here is the day the precedence becomes
 * a leak rather than a convenience.
 *
 * Spec: docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md §4.1.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const CONFIG = "tests/e2e/standalone.config.ts";

/** The nine variables the retiring workflow supplied. */
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

  it("defaults every variable the retired workflow supplied, non-destructively", () => {
    const missing = REQUIRED.filter(
      (name) => !new RegExp(`process\\.env\\.${name}\\s*\\?\\?=`).test(source),
    );
    expect(missing, `${CONFIG} must default these with ??= so a real env still wins`).toEqual([]);
  });

  it("uses ??= and never bare assignment, so a caller's env is never clobbered", () => {
    for (const name of REQUIRED) {
      const bare = new RegExp(`process\\.env\\.${name}\\s*=[^=]`);
      expect(bare.test(source), `${name} must not be assigned unconditionally`).toBe(false);
    }
  });

  it("sets the defaults BEFORE defineConfig, or Playwright loads tests first", () => {
    const firstDefault = source.search(/process\.env\.\w+\s*\?\?=/);
    const define = source.search(/export default defineConfig/);
    expect(firstDefault).toBeGreaterThan(-1);
    expect(firstDefault).toBeLessThan(define);
  });

  it("carries no value that looks like a real credential", () => {
    // The precedence above means these WIN over .env.local. That is only safe
    // while every value is a placeholder, so the property is pinned, not
    // assumed. Demo Supabase JWTs are allowed by their well-known issuer.
    // Resolve `const X = "…"` indirection: an earlier version of this test
    // matched inline literals only, so a credential parked behind a const
    // would have passed unread.
    const consts = new Map(
      [...source.matchAll(/const (\w+)\s*=\s*\n?\s*"([^"]*)"/g)].map((m) => [m[1]!, m[2]!]),
    );
    const assigned = [...source.matchAll(/process\.env\.(\w+)\s*\?\?=\s*(?:"([^"]*)"|(\w+))/g)].map(
      (m) => [m[0]!, m[1]!, m[2] ?? consts.get(m[3]!)] as const,
    );
    expect(assigned.length).toBe(REQUIRED.length);
    // Every value must have RESOLVED — an unresolved const would otherwise
    // skip both branches below and assert nothing.
    expect(assigned.filter(([, , v]) => v === undefined).map(([, n]) => n)).toEqual([]);
    for (const [, name, value] of assigned) {
      if (value!.startsWith("eyJ")) {
        const body = JSON.parse(Buffer.from(value!.split(".")[1]!, "base64url").toString()) as {
          iss?: string;
        };
        expect(body.iss, `${name} must be a demo token, not a project token`).toBe("supabase-demo");
      } else {
        expect(value, `${name} must be an obvious placeholder`).toMatch(/test|demo|127\.0\.0\.1/i);
      }
    }
  });
});
