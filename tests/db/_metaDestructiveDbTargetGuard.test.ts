/**
 * tests/db/_metaDestructiveDbTargetGuard.test.ts
 *
 * Structural guard for the whole-database wipe surface.
 *
 * `public.reset_validation_data()` DELETEs every row in `public.shows` (and its
 * cascade children). In this repo `TEST_DATABASE_URL` is DELIBERATELY the
 * validation project — see scripts/preflight-env.mjs:97 and AGENTS.md — so any
 * test that executes the wipe, or flips `destructive_reset_gate` to enabled,
 * MUST assert a loopback target BEFORE it connects. Without that assert a plain
 * `pnpm test` in any worktree wipes live validation: the cron sync then
 * re-ingests all shows from Drive as brand-new rows, which re-triggers the
 * auto-publish undo email for every show (observed 2026-07-23, four batches).
 *
 * The guard convention already existed in two places before this meta-test
 * (tests/db/_remediationHelpers.ts assertLocalDbUrl,
 * tests/db/_validation-cleanup-helpers.ts assertSafeDestructiveTarget) — both
 * for NARROWER, fixture-scoped deletes. The unguarded file was the one running
 * the FULL wipe. This test exists so the next such file fails by default.
 *
 * Discovery is filesystem-walked, not a hardcoded file list: a NEW test that
 * executes the wipe is caught without anyone remembering to register it.
 */
import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  LOCAL_DEFAULT_DB_URL,
  assertLocalDestructiveTarget,
  localDestructiveDbUrl,
} from "./_assertLocalDestructiveTarget.js";

const TESTS_ROOT = join(process.cwd(), "tests");

/** Executes the whole-DB wipe RPC. */
const EXECUTES_WIPE = /\bselect\s+public\.reset_validation_data\s*\(\s*\)/i;

/** Flips the prod-safety gate ON — the only thing standing between a test run
 *  and a live wipe. */
const ENABLES_WIPE_GATE =
  /update\s+public\.destructive_reset_gate\s+set\s+enabled\s*=\s*(?:true|\$\{?\s*true)/i;

/** Any of the sanctioned loopback asserts, called (not merely imported). */
const CALLS_LOCAL_GUARD =
  /\b(?:localDestructiveDbUrl|assertLocalDestructiveTarget|assertLocalDbUrl|assertSafeDestructiveTarget)\s*\(/;

/** Opt-out for a file that provably cannot reach a remote (documented inline). */
const EXEMPTION = /\/\/\s*not-subject-to-destructive-target-guard:\s*\S+/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__generated__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|mts|cts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(TESTS_ROOT).map((path) => ({ path, source: readFileSync(path, "utf8") }));

const destructive = files.filter(
  ({ source }) => EXECUTES_WIPE.test(source) || ENABLES_WIPE_GATE.test(source),
);

describe("assertLocalDestructiveTarget — runtime behavior", () => {
  test("refuses the validation session-pooler host (the exact URL shape in .env.local)", () => {
    expect(() =>
      assertLocalDestructiveTarget(
        "postgresql://postgres.vzakgrxqwcalbmagufjh:pw@aws-1-us-east-2.pooler.supabase.com:5432/postgres",
      ),
    ).toThrow(/REFUSING non-local database host/i);
  });

  test("accepts loopback in every spelling", () => {
    for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
      const url = `postgresql://postgres:postgres@${host}:54322/postgres`;
      expect(assertLocalDestructiveTarget(url)).toBe(url);
    }
  });

  test("localDestructiveDbUrl ignores TEST_DATABASE_URL even when it is remote", () => {
    const prior = process.env.TEST_DATABASE_URL;
    process.env.TEST_DATABASE_URL =
      "postgresql://postgres.vzakgrxqwcalbmagufjh:pw@aws-1-us-east-2.pooler.supabase.com:5432/postgres";
    try {
      expect(localDestructiveDbUrl()).toBe(LOCAL_DEFAULT_DB_URL);
    } finally {
      if (prior === undefined) delete process.env.TEST_DATABASE_URL;
      else process.env.TEST_DATABASE_URL = prior;
    }
  });
});

describe("destructive DB target guard", () => {
  test("the discovery patterns actually match the known wipe surface (anti-vacuity)", () => {
    // If this fails, the regexes drifted and every assertion below is vacuous.
    const rel = destructive.map((f) => f.path.replace(process.cwd() + "/", ""));
    expect(rel).toContain("tests/db/resetValidationDataDriveKeyedAudit.test.ts");
    expect(rel).toContain("tests/db/destructiveResetGate.test.ts");
  });

  test.each(destructive.length ? destructive : [{ path: "<none discovered>", source: "" }])(
    "$path asserts a loopback target before wiping",
    ({ path, source }) => {
      if (path === "<none discovered>") return; // covered by the anti-vacuity test above
      const rel = path.replace(process.cwd() + "/", "");
      if (EXEMPTION.test(source)) return;
      expect(
        CALLS_LOCAL_GUARD.test(source),
        `${rel} executes public.reset_validation_data() (or enables destructive_reset_gate) but ` +
          "never calls a loopback assert. TEST_DATABASE_URL is the VALIDATION project in this " +
          "repo's .env.local, so this file wipes live validation on a plain `pnpm test`. Call " +
          "assertLocalDestructiveTarget() from tests/db/_assertLocalDestructiveTarget.ts on the " +
          "resolved URL before opening the connection, or add an inline " +
          "`// not-subject-to-destructive-target-guard: <reason>` with a verified reason.",
      ).toBe(true);
    },
  );
});
