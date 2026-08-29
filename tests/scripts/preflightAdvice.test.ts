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

/** The warning, verbatim. Update this WITH any deliberate copy change, never around one. */
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
 * Everything from the warning's first line to the END of stderr.
 *
 * Deliberately NOT a block extractor with a continuation rule. One was tried, walking while
 * the next line matched `/^\s{2,}\S/`, and it terminated on a blank line, a whitespace-only
 * line, a column-zero line, or a line indented by a single space -- so anything appended after
 * any of those was invisible to the equality assertion, and contradictory copy could sit in
 * stderr with the guard green. Slicing to the end has no boundary to get wrong: text appended
 * anywhere after the warning changes the comparand and fails.
 *
 * This warning is the LAST thing preflight defers, so the slice is exactly the warning today.
 * If a later warning is added after it, this test fails and the expected block is updated with
 * it, which is the correct direction: a new trailing warning is a copy change like any other.
 */
function warningOnward(stderr: string): string {
  const start = stderr.indexOf("WARN: TEST_DATABASE_URL is NON-LOOPBACK");
  return start === -1 ? "" : stderr.slice(start).trimEnd();
}

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

  it("emits exactly the expected warning", () => {
    // Equality, so ANY edit fails: a reworded broken remedy, an inverted polarity, a
    // contradictory appended clause, a corrupted DSN, or a wrong variable name.
    expect(warningOnward(runPreflight(REMOTE).stderr)).toBe(EXPECTED_WARNING);
  });
});
