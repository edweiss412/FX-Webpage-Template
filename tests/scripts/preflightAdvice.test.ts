import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The preflight warning must give advice that WORKS, and must not carry advice that does not.
 *
 * TEST_DATABASE_URL is the LEFT operand of the `??` at every site that resolves a database
 * from it, so setting DATABASE_URL -- what the message used to advise -- changes nothing a
 * route handler reads. A reader who follows it gets the same wrong-database failure and no
 * signal that they did anything wrong. The adjacent claim that nothing but the allowlist rows
 * honours the variable is what makes a reader stop reading, and it is false: the app server
 * honours it.
 *
 * The assertion is EQUALITY against the expected block, not a set of substring or line
 * checks. Partial oracles were tried across two review rounds and each one admitted a
 * different ordinary edit that restored broken or self-contradicting advice: a substring
 * check accepted NOT_TEST_DATABASE_URL=, an anchored remedy line accepted "Set DATABASE_URL"
 * in place of "Export DATABASE_URL", and an unanchored polarity line accepted a contradictory
 * clause appended to it. Equality rejects all of them by construction.
 *
 * `--no-db` keeps this hermetic and fast: the deferred warnings flush from an `on("exit")`
 * handler, so they print on that early-exit path too, and the test opens no connection.
 */
const ROOT = join(__dirname, "..", "..");
const REMOTE_HOST = "remote.sentinel.invalid";
const REMOTE = `postgresql://u:p@${REMOTE_HOST}:5432/postgres`;
const LOOPBACK = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Every var preflight hard-requires, with values its validators accept. CI has no tracked
// `.env.local`, so without these preflight exits during its env checks -- which run BEFORE
// the warning -- and the comparison below would be against an empty string.
const REQUIRED_ENV: Record<string, string> = {
  HASH_FOR_LOG_PEPPER: "x".repeat(48),
  PICKER_COOKIE_SIGNING_KEY: "test-signing-key",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
  SUPABASE_ANON_KEY: "test-anon",
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "x@y.z", private_key: "k" }),
};

/**
 * The COMPLETE stderr of a `--no-db` run with a non-loopback TEST_DATABASE_URL, verbatim.
 * Update this WITH any deliberate copy change, never around one.
 */
const EXPECTED_WARNING = [
  `WARN: TEST_DATABASE_URL is NON-LOOPBACK (${REMOTE_HOST}). This is the VALIDATION deployment, and it`,
  "      is set that way on purpose for the schema-parity gates.",
  "      Anything that honours this variable writes to validation, where the notify cron sends",
  "      REAL email to Doug.",
  "      Test helpers no longer honour it (only the two rows in",
  "      tests/db/_validationEnvAllowlist.ts do), but the APP SERVER does: route handlers",
  "      resolve TEST_DATABASE_URL ?? DATABASE_URL, so a locally booted server reads validation.",
  "      Playwright pins a loopback value on every server it STARTS. A server already",
  "      listening on the port is REUSED as-is and keeps whatever database it was started",
  "      with, so a hand-started `pnpm dev` stays on validation even under `pnpm test:e2e`.",
  "      To point a local run at local Postgres, override the variable itself:",
  `        TEST_DATABASE_URL=${LOOPBACK} <cmd>`,
  "      Setting DATABASE_URL does not work, because TEST_DATABASE_URL is the left `??` operand.",
].join("\n");

function runPreflight(testDatabaseUrl: string) {
  const r = spawnSync(process.execPath, [join(ROOT, "scripts", "preflight-env.mjs"), "--no-db"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...REQUIRED_ENV, TEST_DATABASE_URL: testDatabaseUrl },
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/**
 * There is no extractor any more, and that is the point.
 *
 * Two earlier versions each anchored somewhere and compared a region: a continuation-rule
 * block that terminated on blank, column-zero and single-space lines, so anything appended
 * past one of those was invisible; then a slice from the warning's first line to the end,
 * which fixed suffixes but ignored anything inserted BEFORE the anchor. Each fix moved the
 * blind spot rather than removing it, which is what an anchored region does.
 *
 * Under `--no-db` with REQUIRED_ENV supplied, this script's stderr is exactly this warning and
 * nothing else -- probed, byte-identical across runs. So the comparand is the whole stream,
 * and there is no region left for text to hide outside of, at either end.
 *
 * If preflight ever emits another warning on stderr in this configuration, this test fails and
 * the expected value is updated with it. That is the correct direction: new stderr copy is a
 * copy change like any other, and reviewing it is the point of the guard.
 */

describe("preflight's non-loopback TEST_DATABASE_URL warning", () => {
  it("fires at all, on stderr (premise)", () => {
    const { stderr, stdout } = runPreflight(REMOTE);
    expect(stderr, "the warning did not fire").toContain("TEST_DATABASE_URL is NON-LOOPBACK");
    // The warning is written by console.warn. Which stream carries it is part of the
    // contract: a test reading stdout would stay red after a correct copy change.
    expect(stdout, "the warning moved to stdout").not.toContain("NON-LOOPBACK");
  });

  it("does not fire for a loopback value (premise: the branch discriminates)", () => {
    expect(runPreflight(LOOPBACK).stderr).not.toContain("TEST_DATABASE_URL is NON-LOOPBACK");
  });

  it("emits exactly the expected stderr, whole", () => {
    // Equality over the WHOLE stream, so any edit fails wherever it lands: a reworded broken
    // remedy, an inverted polarity, a clause appended after, a line inserted before, a
    // corrupted DSN, or a wrong variable name.
    expect(runPreflight(REMOTE).stderr.trimEnd()).toBe(EXPECTED_WARNING);
  });
});
