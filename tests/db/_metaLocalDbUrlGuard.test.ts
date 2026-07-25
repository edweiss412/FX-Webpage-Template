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
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

import { assertLocalDbUrl, assertLocalDbUrlIfSet } from "./_localDbUrl";
import { classifyLocalDbUrlSource, type LocalDbUrlClassification } from "./_localDbUrlScan";

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

// ── (2) STRUCTURAL ────────────────────────────────────────────────────────────
// The classifier is exercised against SYNTHETIC sources first: run only against
// the live tree, a fail-OPEN branch is unobservable (the tree would simply have no
// instance of the shape), and the guard would look green while accepting the very
// bypass it exists to reject.

const ENV = "process.env.LOCAL_TEST_DATABASE_URL";
const DEFAULT_DSN = '"postgresql://postgres:postgres@127.0.0.1:54322/postgres"';

describe("classifyLocalDbUrlSource — synthetic shapes (spec §2.6)", () => {
  test("the canonical guarded shape reads once and is guarded", () => {
    const src = `const U = assertLocalDbUrl(${ENV} ?? ${DEFAULT_DSN});`;
    expect(classifyLocalDbUrlSource(src)).toMatchObject({ envReads: 1, unguardedReads: 0 });
  });

  test("a guard call ELSEWHERE in the expression does not launder an unguarded read", () => {
    // The exact shape a regex ("file mentions assertLocalDbUrl near the env read")
    // would accept: the guard runs on the fallback, the env value bypasses it.
    const src = `const U = assertLocalDbUrl(fallback) ?? ${ENV};`;
    expect(classifyLocalDbUrlSource(src)).toMatchObject({ envReads: 1, unguardedReads: 1 });
  });

  test("importing the guard without using it on the read is not enough", () => {
    const src = [
      'import { assertLocalDbUrl } from "@/tests/db/_localDbUrl";',
      `const U = ${ENV} ?? ${DEFAULT_DSN};`,
    ].join("\n");
    expect(classifyLocalDbUrlSource(src)).toMatchObject({ envReads: 1, unguardedReads: 1 });
  });

  test("assertLocalDbUrlIfSet also counts as a guard", () => {
    const src = `const U = process.env.TEST_DATABASE_URL ?? assertLocalDbUrlIfSet(${ENV});`;
    expect(classifyLocalDbUrlSource(src)).toMatchObject({ envReads: 1, unguardedReads: 0 });
  });

  test("the bracket spelling is a read too", () => {
    const src = `const U = assertLocalDbUrl(process.env["LOCAL_TEST_DATABASE_URL"] ?? ${DEFAULT_DSN});`;
    expect(classifyLocalDbUrlSource(src)).toMatchObject({ envReads: 1, unguardedReads: 0 });
    const bare = `const U = process.env["LOCAL_TEST_DATABASE_URL"];`;
    expect(classifyLocalDbUrlSource(bare)).toMatchObject({ envReads: 1, unguardedReads: 1 });
  });

  test("a MENTION in a comment or string is not a read (this is what keeps this file out of its own scan set)", () => {
    const src = [
      "// LOCAL_TEST_DATABASE_URL is documented here",
      'const doc = "process.env.LOCAL_TEST_DATABASE_URL";',
    ].join("\n");
    expect(classifyLocalDbUrlSource(src)).toMatchObject({ envReads: 0, unguardedReads: 0 });
  });

  test("an exemption marker needs a reason", () => {
    expect(classifyLocalDbUrlSource("// local-db-url-exempt:").exemptReason).toBeNull();
    expect(
      classifyLocalDbUrlSource("// local-db-url-exempt: validation-capable by design").exemptReason,
    ).toBe("validation-capable by design");
  });
});

// ── The live tree ─────────────────────────────────────────────────────────────

const TESTS_ROOT = join(process.cwd(), "tests");

function walkTestSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTestSources(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Every file under tests/ that actually READS the variable, with its verdict. */
function scanTree(): Array<{ path: string } & LocalDbUrlClassification> {
  return walkTestSources(TESTS_ROOT)
    .map((full) => ({
      path: relative(process.cwd(), full),
      ...classifyLocalDbUrlSource(readFileSync(full, "utf8"), full),
    }))
    .filter((row) => row.envReads > 0)
    .sort((a, b) => a.path.localeCompare(b.path));
}

describe("every LOCAL_TEST_DATABASE_URL read in tests/ is guarded (spec §2.6)", () => {
  test("no unguarded read survives anywhere in the tree", () => {
    const offenders = scanTree()
      .filter((row) => row.unguardedReads > 0 && row.exemptReason === null)
      .map((row) => `${row.path} (${row.unguardedReads} unguarded)`);
    expect(
      offenders,
      "these suites read LOCAL_TEST_DATABASE_URL without assertLocalDbUrl(...):\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  test("nothing is exempt", () => {
    // Set equality, not "no NEW exemptions": the first exemption must be a
    // deliberate, reviewable edit to this expectation.
    const exempt = scanTree()
      .filter((row) => row.exemptReason !== null)
      .map((row) => row.path);
    expect(exempt).toEqual([]);
  });

  test("the walker still finds the whole scan set (a vacuous walk would pass everything above)", () => {
    const scanned = scanTree();
    expect(
      scanned.length,
      "expected 53 files reading LOCAL_TEST_DATABASE_URL = 36 swept + 15 pre-existing " +
        "+ tests/sync/qualityRegressionLifecycle.test.ts + tests/db/_remediationHelpers.ts",
    ).toBe(53);
  });

  test("the one validation-capable suite guards its LOCAL leg WITHOUT constraining TEST_DATABASE_URL", () => {
    // tests/sync/qualityRegressionLifecycle.test.ts deliberately runs against the
    // validation project when TEST_DATABASE_URL is set (its own gate at :439-449
    // fails rather than skips when an explicit URL cannot connect). Guarding that
    // leg would break it by design; leaving the LOCAL_ leg unguarded would keep the
    // remote-DELETE hazard alive in the one file that DELETEs from admin_alerts and
    // shows. Both halves are asserted here because either alone is wrong.
    const path = "tests/sync/qualityRegressionLifecycle.test.ts";
    const src = readFileSync(join(process.cwd(), path), "utf8");

    expect(classifyLocalDbUrlSource(src, path)).toMatchObject({
      envReads: 1,
      unguardedReads: 0,
      exemptReason: null,
    });
    expect(src).toContain("assertLocalDbUrlIfSet(process.env.LOCAL_TEST_DATABASE_URL)");
    expect(src, "the validation leg must stay unconstrained").toContain(
      "process.env.TEST_DATABASE_URL ??",
    );
    expect(src).not.toContain("assertLocalDbUrl(process.env.TEST_DATABASE_URL");
  });
});
