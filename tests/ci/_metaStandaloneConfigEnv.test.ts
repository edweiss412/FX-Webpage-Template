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
 * These assertions OBSERVE the config running (`_standaloneConfigProbe.ts`)
 * rather than reading its source. Two adversarial rounds broke two successive
 * static readers — a regex one with a comment, its AST successor with
 * `if (false)`, uncalled functions, duplicate `??=`, lexical scope, and
 * bracket member access. The questions here are all "what does this module
 * DO", so the module is run and the answers read off.
 *
 * The properties below are the REAL contract, not a proxy for it: a caller's
 * value survives, an absent one gets a placeholder default. An earlier version
 * asserted source ORDER relative to `defineConfig`, which is not the actual
 * requirement — Playwright awaits evaluation of the whole config module before
 * loading any test module — and would have failed a legitimate config.
 *
 * Spec: docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md §4.1.
 */
import { describe, expect, it } from "vitest";

import { probeConfig } from "./_standaloneConfigProbe";

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

/**
 * The exact values the config is allowed to install. Pinned EXACTLY rather
 * than pattern-matched: an adversarial round noted that `/test|demo/` accepts
 * a real pepper containing "test", and that a hostname can contain
 * "127.0.0.1" as a substring. A frozen set has no such slack — adding a value
 * here is a deliberate, reviewable edit, which is the actual control.
 */
const ALLOWED_DEFAULTS: Record<string, string> = {
  HASH_FOR_LOG_PEPPER: "fxav-r41-test-pepper-32-chars-min-deterministic",
  JWT_SIGNING_SECRET: "redeem-link-test-secret-32-bytes-min",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  SUPABASE_SECRET_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
};

describe("standalone config env fallbacks (observed, not parsed)", () => {
  it("installs exactly the expected placeholder for every required name", () => {
    const { env } = probeConfig(REQUIRED);
    // Set equality by NAME, then value equality — a count alone is satisfied
    // by a duplicate plus a missing name.
    expect(new Set(Object.keys(env))).toEqual(new Set(REQUIRED));
    const unset = REQUIRED.filter((n) => env[n] === null);
    expect(unset, "config must default every one of these").toEqual([]);
    expect(env).toEqual(ALLOWED_DEFAULTS);
  }, 120_000);

  it("never clobbers a value the caller already set", () => {
    // The behavioural form of "uses ??= and not =". Syntax-independent: it
    // catches `process.env.X = …`, `process.env["X"] = …`, an assignment
    // inside a helper, or any other shape, because it observes the outcome.
    const preset = Object.fromEntries(REQUIRED.map((n) => [n, `CALLER-${n}`]));
    const { env } = probeConfig(REQUIRED, preset);
    expect(env).toEqual(preset);
  }, 120_000);
});
