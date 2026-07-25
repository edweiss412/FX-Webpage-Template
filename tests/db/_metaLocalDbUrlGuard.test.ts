/**
 * tests/db/_metaLocalDbUrlGuard.test.ts
 * (spec docs/superpowers/specs/2026-07-24-test-safety-hardening-batch.md §2.6)
 *
 * THE PROBLEM (BL-DBTEST-LOOPBACK-EVAL-GUARD):
 *   ~37 db suites resolved their connection URL as
 *     process.env.LOCAL_TEST_DATABASE_URL ?? "<loopback default>"
 *   and handed it straight to postgres(). A probe `beforeAll` flips `dbUp = true`
 *   on a successful connection and an `afterAll` runs DELETE/UPDATE teardown under
 *   `if (dbUp)`. Point LOCAL_TEST_DATABASE_URL at a remote host (easy: in this repo
 *   TEST_DATABASE_URL IS the validation project, one variable name away) and the
 *   teardown mutates that remote database.
 *
 * THE GUARD:
 *   `assertLocalDbUrl` / `assertLocalDbUrlIfSet` (tests/db/_localDbUrl.ts) throw at
 *   MODULE EVAL — before any handle exists — unless the hostname is loopback.
 *
 * This file has two halves:
 *   (1) BEHAVIORAL — the helper itself does what its name claims, including that no
 *       message ever echoes a DSN password into CI logs;
 *   (2) STRUCTURAL (added in the next task) — every file in the tree that READS the
 *       variable routes it through the guard, so a NEW suite fails by default.
 */
import { describe, expect, test } from "vitest";

import { assertLocalDbUrl, assertLocalDbUrlIfSet } from "./_localDbUrl";

const LOOPBACK_DSNS = [
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  "postgresql://postgres:postgres@localhost:54322/postgres",
  "postgresql://postgres:postgres@[::1]:54322/postgres",
];

const REMOTE_DSN =
  "postgresql://postgres:postgres@aws-1-us-east-2.pooler.supabase.com:5432/postgres";

describe("assertLocalDbUrl (spec §2.3)", () => {
  test("returns each accepted loopback URL UNCHANGED (identity, not truthiness)", () => {
    for (const dsn of LOOPBACK_DSNS) {
      expect(assertLocalDbUrl(dsn)).toBe(dsn);
    }
  });

  test("a non-default port on loopback is still accepted (host is the only criterion)", () => {
    const dsn = "postgresql://postgres:postgres@127.0.0.1:65432/postgres";
    expect(assertLocalDbUrl(dsn)).toBe(dsn);
  });

  test("refuses a remote host, naming the host and BOTH env vars", () => {
    let message = "";
    try {
      assertLocalDbUrl(REMOTE_DSN);
      throw new Error("expected assertLocalDbUrl to throw");
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("aws-1-us-east-2.pooler.supabase.com");
    expect(message).toContain("LOCAL_TEST_DATABASE_URL");
    expect(message).toContain("TEST_DATABASE_URL");
  });

  test("refuses a host that merely CONTAINS a loopback token", () => {
    // A substring check (`url.includes("127.0.0.1")`) would accept this and connect
    // to an attacker-controlled or simply wrong remote host.
    expect(() => assertLocalDbUrl("postgresql://u:p@127.0.0.1.evil.example:5432/db")).toThrow(
      /127\.0\.0\.1\.evil\.example/,
    );
  });

  test("refuses an unparseable value and an empty string", () => {
    expect(() => assertLocalDbUrl("not a url")).toThrow(/unparseable/i);
    // "" is NOT nullish, so `??` never falls back to the loopback default: today
    // that reaches postgres("") as a mystery failure.
    expect(() => assertLocalDbUrl("")).toThrow(/unparseable/i);
  });

  test("NO message echoes the DSN password (these strings land in CI logs)", () => {
    const secret = "sup3rs3cret";
    const credentialed = `postgresql://postgres:${secret}@remote.example:5432/db`;
    const unparseable = `postgres//postgres:${secret}@:::`;

    for (const value of [credentialed, unparseable]) {
      let message = "";
      try {
        assertLocalDbUrl(value);
        throw new Error("expected assertLocalDbUrl to throw");
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).not.toContain(secret);
    }
  });
});

describe("assertLocalDbUrlIfSet (spec §2.2 — the qualityRegressionLifecycle leg)", () => {
  test("passes undefined through, so an unset variable stays unset", () => {
    expect(assertLocalDbUrlIfSet(undefined)).toBeUndefined();
  });

  test("guards a set value exactly like assertLocalDbUrl", () => {
    expect(assertLocalDbUrlIfSet(LOOPBACK_DSNS[0])).toBe(LOOPBACK_DSNS[0]);
    expect(() => assertLocalDbUrlIfSet(REMOTE_DSN)).toThrow(
      /aws-1-us-east-2\.pooler\.supabase\.com/,
    );
    // An empty string is a misconfiguration, not "unset".
    expect(() => assertLocalDbUrlIfSet("")).toThrow(/unparseable/i);
  });
});
