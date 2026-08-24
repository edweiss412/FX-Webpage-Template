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
import ts from "typescript";
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
    // A password may contain an unescaped `@`; a lazy redaction echoes its tail.
    const atInPassword = `postgresql://postgres:sup3r@${secret}@remote.example:5432/db`;

    for (const value of [credentialed, unparseable, atInPassword]) {
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
// Fixtures that expect a GUARDED verdict must import the guard: a call is only a
// guard when its callee resolves to the guard module's export (whole-diff finding 1b).
const GUARD_IMPORT =
  'import { assertLocalDbUrl, assertLocalDbUrlIfSet } from "@/tests/db/_localDbUrl";';
const DEFAULT_DSN = '"postgresql://postgres:postgres@127.0.0.1:54322/postgres"';

describe("classifyLocalDbUrlSource — synthetic shapes (spec §2.6)", () => {
  test("the canonical guarded shape reads once and is guarded", () => {
    const src = `${GUARD_IMPORT}\nconst U = assertLocalDbUrl(${ENV} ?? ${DEFAULT_DSN});`;
    expect(classifyLocalDbUrlSource(src)).toMatchObject({ envReads: 1, unguardedReads: 0 });
  });

  test("a guard call ELSEWHERE in the expression does not launder an unguarded read", () => {
    // The exact shape a regex ("file mentions assertLocalDbUrl near the env read")
    // would accept: the guard runs on the fallback, the env value bypasses it.
    const src = `const U = assertLocalDbUrl(fallback) ?? ${ENV};`;
    expect(classifyLocalDbUrlSource(src)).toMatchObject({ envReads: 1, unguardedReads: 1 });
  });

  test("importing the guard without using it on the read is not enough", () => {
    const src = [GUARD_IMPORT, `const U = ${ENV} ?? ${DEFAULT_DSN};`].join("\n");
    expect(classifyLocalDbUrlSource(src)).toMatchObject({ envReads: 1, unguardedReads: 1 });
  });

  test("assertLocalDbUrlIfSet also counts as a guard", () => {
    const src = `${GUARD_IMPORT}\nconst U = process.env.TEST_DATABASE_URL ?? assertLocalDbUrlIfSet(${ENV});`;
    expect(classifyLocalDbUrlSource(src)).toMatchObject({ envReads: 1, unguardedReads: 0 });
  });

  test("the bracket spelling is a read too", () => {
    const src = `${GUARD_IMPORT}\nconst U = assertLocalDbUrl(process.env["LOCAL_TEST_DATABASE_URL"] ?? ${DEFAULT_DSN});`;
    expect(classifyLocalDbUrlSource(src)).toMatchObject({ envReads: 1, unguardedReads: 0 });
    const bare = `const U = process.env["LOCAL_TEST_DATABASE_URL"];`;
    expect(classifyLocalDbUrlSource(bare)).toMatchObject({ envReads: 1, unguardedReads: 1 });
  });

  test("every alternative spelling of the read is still a read (whole-diff R2 finding 1)", () => {
    // Each of these reaches the same value as the canonical dot-access. Recognising
    // only the canonical form would let a future destructive suite read a remote URL
    // while the tree scan reported every file guarded.
    const bypasses = [
      `const U = (process.env).LOCAL_TEST_DATABASE_URL;`,
      `const U = process["env"].LOCAL_TEST_DATABASE_URL;`,
      `const env = process.env;\nconst U = env.LOCAL_TEST_DATABASE_URL;`,
      `const e1 = process.env;\nconst e2 = e1;\nconst U = e2["LOCAL_TEST_DATABASE_URL"];`,
      `const { LOCAL_TEST_DATABASE_URL } = process.env;`,
      `const { LOCAL_TEST_DATABASE_URL: aliased } = process.env;`,
    ];
    for (const src of bypasses) {
      expect(classifyLocalDbUrlSource(src), src).toMatchObject({
        envReads: 1,
        unguardedReads: 1,
      });
    }
  });

  test("an aliased read CAN be guarded, but a destructured one never is (fail-closed)", () => {
    const aliasGuarded = `${GUARD_IMPORT}\nconst env = process.env;\nconst U = assertLocalDbUrl(env.LOCAL_TEST_DATABASE_URL ?? ${DEFAULT_DSN});`;
    expect(classifyLocalDbUrlSource(aliasGuarded)).toMatchObject({
      envReads: 1,
      unguardedReads: 0,
    });
    // Destructuring has no read site to wrap, so it stays unguarded by construction:
    // the author is pushed to the one shape the guard can actually protect.
    const destructured = `${GUARD_IMPORT}\nconst { LOCAL_TEST_DATABASE_URL } = process.env;\nconst U = assertLocalDbUrl(LOCAL_TEST_DATABASE_URL ?? ${DEFAULT_DSN});`;
    expect(classifyLocalDbUrlSource(destructured)).toMatchObject({ unguardedReads: 1 });
  });

  test("a read of a DIFFERENT env var is not counted", () => {
    // Guards against an over-broad matcher that would sweep unrelated suites in.
    expect(classifyLocalDbUrlSource("const U = process.env.TEST_DATABASE_URL;")).toMatchObject({
      envReads: 0,
    });
    expect(
      classifyLocalDbUrlSource(
        "const notProcess = { env: {} };\nconst U = notProcess.env.LOCAL_TEST_DATABASE_URL;",
      ),
    ).toMatchObject({ envReads: 0 });
  });

  test("a LOCAL no-op named like the guard does not count as a guard (whole-diff finding 1b)", () => {
    // Name-only matching would accept this: the read is "wrapped", by a function that
    // does nothing. The guard must be the one imported from the guard module.
    const shadowed = [
      "function assertLocalDbUrl(x) { return x; }",
      `const U = assertLocalDbUrl(${ENV} ?? ${DEFAULT_DSN});`,
    ].join("\n");
    expect(classifyLocalDbUrlSource(shadowed)).toMatchObject({ envReads: 1, unguardedReads: 1 });
  });

  test("an aliased IMPORT of the guard still counts", () => {
    const aliasedImport = [
      'import { assertLocalDbUrl as guardUrl } from "@/tests/db/_localDbUrl";',
      `const U = guardUrl(${ENV} ?? ${DEFAULT_DSN});`,
    ].join("\n");
    expect(classifyLocalDbUrlSource(aliasedImport)).toMatchObject({
      envReads: 1,
      unguardedReads: 0,
    });
  });

  test("an alias CHAIN of any length is still a read (whole-diff finding 1a)", () => {
    // A bounded pass count stops recognising reads past the bound; this chain is
    // longer than any fixed number of passes the walker used to make.
    const chain = [
      "const a = process.env;",
      "const b = a;",
      "const c = b;",
      "const d = c;",
      "const e = d;",
      "const U = e.LOCAL_TEST_DATABASE_URL;",
    ].join("\n");
    expect(classifyLocalDbUrlSource(chain)).toMatchObject({ envReads: 1, unguardedReads: 1 });
  });

  test("guard provenance cannot be spoofed (whole-diff R2 finding 2)", () => {
    const read = `const U = assertLocalDbUrl(${ENV} ?? ${DEFAULT_DSN});`;
    // A sibling module that merely ENDS in the guard's name is not the guard: the
    // specifier is resolved against the file's own path.
    const sibling = ['import { assertLocalDbUrl } from "./_localDbUrl";', read].join("\n");
    expect(classifyLocalDbUrlSource(sibling, "tests/somewhere/else.ts")).toMatchObject({
      unguardedReads: 1,
    });
    // The SAME specifier from inside tests/db IS the guard.
    expect(classifyLocalDbUrlSource(sibling, "tests/db/some.db.test.ts")).toMatchObject({
      unguardedReads: 0,
    });
    // …and so is the relative form the onboarding suites actually use.
    const fromOnboarding = ['import { assertLocalDbUrl } from "../db/_localDbUrl";', read].join(
      "\n",
    );
    expect(
      classifyLocalDbUrlSource(fromOnboarding, "tests/onboarding/some.db.test.ts"),
    ).toMatchObject({ unguardedReads: 0 });
    const foreign = ['import { assertLocalDbUrl } from "@/lib/vendor/_localDbUrl";', read].join(
      "\n",
    );
    expect(classifyLocalDbUrlSource(foreign)).toMatchObject({ unguardedReads: 1 });

    // A real import SHADOWED by a local declaration of the same name is not a guard
    // either: we do not model block scope, so the name is poisoned outright.
    const shadowed = [GUARD_IMPORT, "function assertLocalDbUrl(x) { return x; }", read].join("\n");
    expect(classifyLocalDbUrlSource(shadowed)).toMatchObject({ unguardedReads: 1 });

    // …including every BINDING-PATTERN shadow (whole-diff R3 finding 2).
    const patternShadows = [
      "function f({ assertLocalDbUrl }) { return assertLocalDbUrl; }",
      "function f([assertLocalDbUrl]) { return assertLocalDbUrl; }",
      "const { assertLocalDbUrl } = fake;",
      "const [assertLocalDbUrl] = fake;",
    ];
    for (const shadow of patternShadows) {
      expect(
        classifyLocalDbUrlSource([GUARD_IMPORT, shadow, read].join("\n")),
        shadow,
      ).toMatchObject({ unguardedReads: 1 });
    }

    // A nested module whose path merely ENDS in the guard path is not the guard.
    const nested = ['import { assertLocalDbUrl } from "./db/_localDbUrl";', read].join("\n");
    expect(classifyLocalDbUrlSource(nested, "tests/vendor/tests/suite.test.ts")).toMatchObject({
      unguardedReads: 1,
    });
  });

  test("the remaining env-read forms are reads too (whole-diff R2 finding 3)", () => {
    const forms = [
      'const KEY = "LOCAL_TEST_DATABASE_URL";\nconst U = process.env[KEY];',
      // whole-diff R3 finding 3 — the process OBJECT aliased, and key/env indirection.
      "const p = process;\nconst U = p.env.LOCAL_TEST_DATABASE_URL;",
      'import * as proc from "node:process";\nconst U = proc.env.LOCAL_TEST_DATABASE_URL;',
      // The DEFAULT import is its own branch in the collector, and is the spelling a
      // contributor is most likely to write (whole-diff R4).
      'import proc from "node:process";\nconst U = proc.env.LOCAL_TEST_DATABASE_URL;',
      'const ENVKEY = "env";\nconst { [ENVKEY]: e } = process;\nconst U = e.LOCAL_TEST_DATABASE_URL;',
      "let u;\n({ LOCAL_TEST_DATABASE_URL: u } = process.env);",
      "let e;\n({ env: e } = process);\nconst U = e.LOCAL_TEST_DATABASE_URL;",
      'let K;\nK = "LOCAL_TEST_DATABASE_URL";\nconst U = process.env[K];',
      "const U = (process.env as NodeJS.ProcessEnv).LOCAL_TEST_DATABASE_URL;",
      "const U = process.env!.LOCAL_TEST_DATABASE_URL;",
      'import { env } from "node:process";\nconst U = env.LOCAL_TEST_DATABASE_URL;',
      "let e;\ne = process.env;\nconst U = e.LOCAL_TEST_DATABASE_URL;",
      "const { env: e } = process;\nconst U = e.LOCAL_TEST_DATABASE_URL;",
      'const { ["LOCAL_TEST_DATABASE_URL"]: url } = process.env;',
    ];
    for (const src of forms) {
      expect(classifyLocalDbUrlSource(src), src).toMatchObject({ envReads: 1, unguardedReads: 1 });
    }
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

/**
 * Every file under tests/ that actually READS the variable, with its verdict.
 *
 * Memoized: the walk TS-parses every file in tests/ that mentions the variable and
 * takes ~5s, which is vitest's whole default per-test timeout. Recomputing it once
 * per assertion timed the suite out on CI (unit-suite-db shard 7) while passing
 * locally on a faster box.
 */
let scanCache: Array<{ path: string } & LocalDbUrlClassification> | null = null;

function scanTree(): Array<{ path: string } & LocalDbUrlClassification> {
  if (scanCache) return scanCache;
  scanCache = walkTestSources(TESTS_ROOT)
    .map((full) => {
      // Repo-relative: guard-module provenance compares resolved paths exactly.
      const path = relative(process.cwd(), full);
      return { path, ...classifyLocalDbUrlSource(readFileSync(full, "utf8"), path) };
    })
    .filter((row) => row.envReads > 0)
    .sort((a, b) => a.path.localeCompare(b.path));
  return scanCache;
}

// 30s: the first scanTree() call parses the whole tests/ tree. The default 5s
// timeout is the same order as the walk itself, so a slower CI runner failed here
// while local passed (real-CI-is-its-own-gate).
describe(
  "every LOCAL_TEST_DATABASE_URL read in tests/ is guarded (spec §2.6)",
  { timeout: 30_000 },
  () => {
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
        "expected 67 files reading LOCAL_TEST_DATABASE_URL = 36 swept + 15 pre-existing " +
          "+ tests/sync/qualityRegressionLifecycle.test.ts + tests/db/_remediationHelpers.ts " +
          "+ tests/db/tileAlertResolution.db.test.ts " +
          "+ tests/db/watchRenewalDue.test.ts (watch lease slack; deletes rows, local-only) " +
          "+ tests/db/driveIdCoverage.db.test.ts (the Drive-ID coverage guard, 2026-07-25) " +
          "+ tests/db/watchLifecycle.db.test.ts (watch renewal lifecycle, 2026-07-26) " +
          "+ tests/cross-cutting/pg-cron-coverage.test.ts (resolver-routed local override, " +
          "guarded at the call site — spec 2026-07-26-driveid-guard-cluster-design §3.1) " +
          "+ tests/db/watchReconcileState.test.ts + tests/db/watchReconcileStateWrites.test.ts " +
          "+ tests/db/watchSurfaceStateIntegration.test.ts (watch backoff 2026-07-27; " +
          "all three delete their RUN-scoped rows, local-only) " +
          "+ tests/db/destructiveResetGate.test.ts + tests/db/resetValidationData.test.ts " +
          "+ tests/db/resetValidationDataConcurrency.test.ts " +
          "+ tests/db/resetValidationDataDriveKeyedAudit.test.ts (the four whole-DB-wipe " +
          "suites, swept off TEST_DATABASE_URL onto the loopback-only variable 2026-08-01 — " +
          "they execute reset_validation_data(), so they were the highest-blast-radius " +
          "readers still outside this scan set) " +
          "+ tests/onboarding/finalizeCasSourceAnchors.db.test.ts (existing-show re-onboard " +
          "source-anchor thread, 2026-08-03; seeds and deletes shows/pending_syncs rows, " +
          "local-only) " +
          "+ tests/db/watchActivationRace.db.test.ts (the promotion/activation interleave " +
          "test, 2026-08-09; runs promoteSettings's GLOBALLY-scoped channel statements and " +
          "captures/restores drive_watch_channels, app_settings and the orphan alert, " +
          "local-only) " +
          "+ tests/sync/backfillAnchorsToctou.db.test.ts (the anchor-backfill TOCTOU rows, " +
          "2026-08-10; seeds and deletes one fixture shows row, local-only) " +
          "+ tests/db/syncLogAttribution.db.test.ts + tests/db/syncLogIndexesAndPrune.db.test.ts " +
          "(the sync-log attribution oracle and its migration suite, 2026-08-10; both write and " +
          "prune sync_log rows, local-only) " +
          "+ tests/log/appEventsSchema.test.ts (swept off TEST_DATABASE_URL onto the loopback-only " +
          "variable 2026-08-10 - it executes prune_app_events and had been pruning the VALIDATION " +
          "project's history on a plain `pnpm test`) " +
          "+ tests/db/resetValidationDataPostgrest.test.ts (the fifth whole-DB-wipe suite, swept " +
          "2026-08-10; it wipes over PostgREST rather than a postgres connection, so its REST " +
          "endpoint is asserted loopback too) " +
          "+ tests/db/pruneGate.db.test.ts (the database-side prune posture gate, 2026-08-22; it " +
          "flips destructive_reset_gate and calls both global prune functions, every call inside " +
          "a transaction that is always rolled back, local-only)",
      ).toBe(73);
    });

    test("the one validation-capable suite guards its LOCAL leg WITHOUT constraining TEST_DATABASE_URL", () => {
      // Asserted STRUCTURALLY, not by substring: two independent `toContain` checks
      // do not prove the halves belong to the same expression, so reversing the
      // operands would leave them green while evaluating the LOCAL guard even when
      // TEST_DATABASE_URL is set (whole-diff R2 finding 5).
      const path = "tests/sync/qualityRegressionLifecycle.test.ts";
      const src = readFileSync(join(process.cwd(), path), "utf8");

      expect(classifyLocalDbUrlSource(src, path)).toMatchObject({
        envReads: 1,
        unguardedReads: 0,
        exemptReason: null,
      });

      const sourceFile = ts.createSourceFile(
        path,
        src,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      let precedence: { left: string; right: string } | null = null;
      const visit = (node: ts.Node): void => {
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === "DB_URL_EXPLICIT" &&
          node.initializer &&
          ts.isBinaryExpression(node.initializer) &&
          node.initializer.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
        ) {
          precedence = {
            left: node.initializer.left.getText(sourceFile),
            right: node.initializer.right.getText(sourceFile),
          };
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);

      expect(precedence, "DB_URL_EXPLICIT is no longer a `??` expression").not.toBeNull();
      const resolved = precedence as unknown as { left: string; right: string };
      // The validation leg is consulted FIRST and stays unconstrained…
      expect(resolved.left).toBe("process.env.TEST_DATABASE_URL");
      // …and the LOCAL leg is only reached when it is nullish, already guarded.
      expect(resolved.right.replace(/\s+/g, "")).toBe(
        "assertLocalDbUrlIfSet(process.env.LOCAL_TEST_DATABASE_URL)",
      );
    });
  },
);
