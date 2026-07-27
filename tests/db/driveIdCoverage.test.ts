/**
 * tests/db/driveIdCoverage.test.ts
 *
 * DB-FREE unit tests for the pure Drive-ID coverage auditor
 * (spec docs/superpowers/specs/data-quality/2026-07-25-secondary-drive-id-nonblank.md §4.1-§4.5).
 *
 * This file never opens a database handle — the live half lives in
 * tests/db/driveIdCoverage.db.test.ts. Everything here is synthetic input, which is
 * what lets every branch be exercised including ones no real schema produces.
 *
 * Each test names the concrete failure mode it catches (plan T1's branch table);
 * a test that only proved "the function was called" would be worthless here.
 */
import { describe, expect, test } from "vitest";

import {
  auditDriveIdCoverage,
  canonicalBare,
  canonicalNullable,
  DRIVE_ID_COVERAGE_EXEMPTIONS,
  type CoverageExemption,
  type DriveIdColumn,
  type DriveIdConstraint,
} from "@/lib/driveIdCoverage/audit";
import { unreachableDbFailure } from "@/lib/driveIdCoverage/introspect";

/** A nullable public.shows.opening_reel_drive_file_id-shaped column. */
function col(over: Partial<DriveIdColumn> = {}): DriveIdColumn {
  return { schema: "public", table: "shows", column: "drive_file_id", nullable: false, ...over };
}

function constraint(over: Partial<DriveIdConstraint> = {}): DriveIdConstraint {
  return {
    schema: "public",
    table: "shows",
    name: "shows_drive_file_id_nonblank",
    definition: canonicalBare("drive_file_id"),
    ...over,
  };
}

function exemption(over: Partial<CoverageExemption> = {}): CoverageExemption {
  return {
    schema: "public",
    table: "shows",
    column: "drive_file_id",
    reason: "documented reason",
    ...over,
  };
}

describe("canonical templates", () => {
  // These two strings are what Postgres's deparser actually emits — measured against the
  // local server (spec §3.1.2). They are module CONSTANTS rather than values derived from
  // a live "known-good" constraint: deriving them lets a poisoned calibrator redefine
  // canonicality itself (spec §4.2, adversarial R3 finding 3).
  test("bare form matches the measured deparser output", () => {
    expect(canonicalBare("drive_file_id")).toBe("CHECK ((drive_file_id ~ '[^[:space:]]'::text))");
  });

  test("nullable form matches the measured deparser output", () => {
    expect(canonicalNullable("opening_reel_drive_file_id")).toBe(
      "CHECK (((opening_reel_drive_file_id IS NULL) OR (opening_reel_drive_file_id ~ '[^[:space:]]'::text)))",
    );
  });
});

describe("coverage — the four nullability x form combinations", () => {
  // Spec §1.1 item 3: BOTH forms are accepted for a column of EITHER nullability, because a
  // CHECK fails only on FALSE and `NULL ~ '…'` is NULL, so the two are behaviorally identical.
  // All four combinations are pinned: an implementation accepting only the two stylistically
  // matched ones would pass a smaller test set (plan R1 finding 6).

  test("NOT NULL column + bare form is covered", () => {
    expect(auditDriveIdCoverage([col({ nullable: false })], [constraint()], [])).toEqual([]);
  });

  test("nullable column + nullable form is covered", () => {
    const c = col({ column: "opening_reel_drive_file_id", nullable: true });
    const k = constraint({ definition: canonicalNullable("opening_reel_drive_file_id") });
    expect(auditDriveIdCoverage([c], [k], [])).toEqual([]);
  });

  test("nullable column + BARE form is still covered", () => {
    const c = col({ nullable: true });
    expect(auditDriveIdCoverage([c], [constraint()], [])).toEqual([]);
  });

  test("NOT NULL column + NULLABLE form is still covered", () => {
    const c = col({ nullable: false });
    const k = constraint({ definition: canonicalNullable("drive_file_id") });
    expect(auditDriveIdCoverage([c], [k], [])).toEqual([]);
  });
});

describe("coverage — the false-negative and false-positive traps", () => {
  test("a column with NO constraint is reported uncovered", () => {
    // Catches: the core false negative — an unprotected column passing as covered.
    const c = col();
    expect(auditDriveIdCoverage([c], [], [])).toEqual([{ kind: "uncovered", column: c }]);
  });

  test("a constraint NAMED *_nonblank but weakened to CHECK (true) does NOT count", () => {
    // Catches: matching on the constraint's NAME instead of its DEFINITION. Someone edits the
    // predicate but keeps the name, and a name-based guard reports the column protected.
    const c = col();
    const weakened = constraint({ definition: "CHECK (true)" });
    expect(auditDriveIdCoverage([c], [weakened], [])).toEqual([{ kind: "uncovered", column: c }]);
  });

  test("a canonical constraint on a DIFFERENT table does not cover this column", () => {
    // Catches: keying coverage on the column name alone. public.shows.drive_file_id's CHECK
    // must not satisfy public.sync_log.drive_file_id.
    const target = col({ table: "sync_log" });
    const elsewhere = constraint({ table: "shows" });
    expect(auditDriveIdCoverage([target], [elsewhere], [])).toEqual([
      { kind: "uncovered", column: target },
    ]);
  });

  test("the SAME constraint name on a different table does not cover this column", () => {
    // Catches: a lookup keyed on bare conname. Constraint names are unique per TABLE, not per
    // schema (spec §3.1.3, measured) — two tables in one schema may share a name, so a
    // name-keyed match can be satisfied by an unrelated table's constraint.
    const target = col({ table: "sync_log" });
    const sameNameElsewhere = constraint({
      table: "shows",
      name: "shared_name_nonblank",
      definition: "CHECK (true)",
    });
    const alsoSameName = constraint({
      table: "sync_log",
      name: "shared_name_nonblank",
      definition: "CHECK (true)",
    });
    expect(auditDriveIdCoverage([target], [sameNameElsewhere, alsoSameName], [])).toEqual([
      { kind: "uncovered", column: target },
    ]);
  });

  test("a canonical constraint for a DIFFERENT column on the same table does not cover", () => {
    // Catches: matching any canonical-looking definition on the right table, ignoring which
    // column the predicate actually names.
    const target = col({ column: "opening_reel_drive_file_id", nullable: true });
    const otherColumn = constraint({ definition: canonicalBare("drive_file_id") });
    expect(auditDriveIdCoverage([target], [otherColumn], [])).toEqual([
      { kind: "uncovered", column: target },
    ]);
  });
});

describe("exemptions", () => {
  test("an exemption with a reason silences an uncovered column", () => {
    // Catches: the exemption mechanism not being wired at all.
    expect(auditDriveIdCoverage([col()], [], [exemption()])).toEqual([]);
  });

  test.each([
    ["empty", ""],
    ["whitespace-only", "   \t "],
  ])("an exemption with a %s reason is reported", (_label, reason) => {
    // Catches: an unexplained exemption passing silently. The row must say WHY, in the file.
    const e = exemption({ reason });
    expect(auditDriveIdCoverage([col()], [], [e])).toEqual([
      { kind: "empty_reason", exemption: e },
    ]);
  });

  test("an exemption for a column that IS covered is reported as stale", () => {
    // Catches: an exemption added during a coverage gap surviving the repair, permanently
    // blinding that column even after its CHECK lands.
    const e = exemption();
    expect(auditDriveIdCoverage([col()], [constraint()], [e])).toEqual([
      { kind: "stale_exemption", exemption: e, why: "now_covered" },
    ]);
  });

  test("an exemption naming a column absent from the census is reported as stale", () => {
    // Catches: a dropped or renamed column leaving a live exemption behind.
    const e = exemption({ table: "table_that_was_dropped" });
    expect(auditDriveIdCoverage([col()], [constraint()], [e])).toEqual([
      { kind: "stale_exemption", exemption: e, why: "column_absent" },
    ]);
  });

  test("duplicate exemption rows for one column are reported", () => {
    // Catches: two rows for one key, where the stale one is invisible behind the live one.
    const findings = auditDriveIdCoverage([col()], [], [exemption(), exemption()]);
    expect(findings).toEqual([
      { kind: "duplicate_exemption", key: JSON.stringify(["public", "shows", "drive_file_id"]) },
    ]);
  });

  test("a malformed reason is reported even when another row shares its key", () => {
    // Catches order-dependence (whole-diff R1 finding 8): validating the reason only after the
    // duplicate short-circuit made the findings depend on array order.
    const good = exemption();
    const bad = exemption({ reason: "   " });
    const forward = auditDriveIdCoverage([col()], [], [good, bad]);
    const reverse = auditDriveIdCoverage([col()], [], [bad, good]);
    for (const findings of [forward, reverse]) {
      expect(findings.map((f) => f.kind).sort()).toEqual(["duplicate_exemption", "empty_reason"]);
    }
  });

  test("dotted quoted identifiers do not collide into one key", () => {
    // Catches a non-injective key (whole-diff R1 finding 5): Postgres identifiers may contain dots
    // when quoted, so `${schema}.${table}.${column}` maps these two DIFFERENT columns to one key —
    // and a single exemption would then suppress both, hiding the second uncovered column.
    const a: DriveIdColumn = {
      schema: "public",
      table: "a",
      column: "b.drive_file_id",
      nullable: true,
    };
    const b: DriveIdColumn = {
      schema: "public",
      table: "a.b",
      column: "drive_file_id",
      nullable: true,
    };
    const exemptA: CoverageExemption = {
      schema: "public",
      table: "a",
      column: "b.drive_file_id",
      reason: "documented",
    };
    // Exempting A must leave B reported.
    expect(auditDriveIdCoverage([a, b], [], [exemptA])).toEqual([{ kind: "uncovered", column: b }]);
  });

  test("the shipped exemption list is empty", () => {
    // Spec §4.5: after the migration lands, all 23 census columns are covered. A non-empty
    // list here would mean someone silenced a column without this test being updated.
    expect(DRIVE_ID_COVERAGE_EXEMPTIONS).toEqual([]);
  });
});

describe("CI fail-not-skip decision", () => {
  // AC-6, extracted from module scope so it is testable at all (whole-diff R1 finding 2). Inline in
  // the suite, removing or inverting the throw left healthy-DB CI runs and local skip runs both
  // green — an outage could silently disable the guard with nothing to notice.
  const base = { host: "127.0.0.1:54322", error: new Error("ECONNREFUSED") };

  test("DB up, CI set → no failure", () => {
    expect(unreachableDbFailure({ ...base, dbUp: true, ci: "true" })).toBeNull();
  });

  test("DB up, CI unset → no failure", () => {
    expect(unreachableDbFailure({ ...base, dbUp: true, ci: undefined })).toBeNull();
  });

  test("DB DOWN, CI unset → no failure (local skip is correct)", () => {
    expect(unreachableDbFailure({ ...base, dbUp: false, ci: undefined })).toBeNull();
  });

  test("DB DOWN, CI set → FAILS, naming the host and the underlying error", () => {
    const err = unreachableDbFailure({ ...base, dbUp: false, ci: "true" });
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toContain("127.0.0.1:54322");
    expect(err?.message).toContain("ECONNREFUSED");
  });

  test("DB DOWN, CI set to an EMPTY string → still FAILS", () => {
    // UNSET is the only skip condition. An earlier draft used `if (!opts.ci)`, so a CI wrapper
    // exporting `CI=` would silently disable the guard while the job stayed green — presence, not
    // truthiness (whole-diff R2 finding 1).
    expect(unreachableDbFailure({ ...base, dbUp: false, ci: "" })).toBeInstanceOf(Error);
  });

  test('DB DOWN, CI set to "0"/"false" → still FAILS', () => {
    // Same class: any falsy-looking-but-SET value must not read as local.
    for (const ci of ["0", "false"]) {
      expect(unreachableDbFailure({ ...base, dbUp: false, ci })).toBeInstanceOf(Error);
    }
  });
});

describe("multiple findings", () => {
  test("every uncovered column is reported, not just the first", () => {
    // Catches: an early return that hides the second and later problems, making a repair
    // look complete when it is not.
    const a = col({ table: "sync_log" });
    const b = col({ table: "app_events" });
    const findings = auditDriveIdCoverage([a, b], [], []);
    expect(findings).toEqual([
      { kind: "uncovered", column: a },
      { kind: "uncovered", column: b },
    ]);
  });
});

// ─── T1: identity module, DB-free half ──────────────────────────────────────
// Spec docs/superpowers/specs/data-quality/2026-07-26-driveid-guard-cluster-design.md §3.1.
import {
  buildPgCronUnreachableMessage,
  execPsqlRedacted,
  redactDsn,
  resolvePgCronMode,
} from "@/tests/db/_validationTargetIdentity";

const SENTINEL_DSN = "postgresql://u:SENTINELPW@127.0.0.1:1/x";

describe("redactDsn", () => {
  test("scrubs the DSN wherever it appears — argv-echo leak (R2-1)", () => {
    const msg = `psql failed: command psql ${SENTINEL_DSN} -qAt exited 2 (${SENTINEL_DSN})`;
    const out = redactDsn(msg, SENTINEL_DSN);
    expect(out).not.toContain("SENTINELPW");
    expect(out).toContain("<TEST_DATABASE_URL redacted>");
  });

  test("DSN-free text passes through unchanged", () => {
    expect(redactDsn("nothing secret here", SENTINEL_DSN)).toBe("nothing secret here");
  });
});

describe("execPsqlRedacted", () => {
  test("a failing invocation never leaks the DSN — execFileSync embeds argv verbatim (R2-1)", () => {
    // Dead loopback port: fails without any database, exercising the real failure path.
    let thrown: Error | null = null;
    try {
      execPsqlRedacted(SENTINEL_DSN, ["-qAtc", "select 1"]);
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown, "dead-port psql must throw").not.toBeNull();
    const everything = `${thrown!.message}\n${thrown!.stack ?? ""}`;
    expect(everything).not.toContain("SENTINELPW");
  });
});

describe("buildPgCronUnreachableMessage", () => {
  test("the CI-unreachable message never carries the DSN (R3-1)", () => {
    const msg = buildPgCronUnreachableMessage(SENTINEL_DSN);
    expect(msg).not.toContain("SENTINELPW");
    expect(msg).toMatch(/psql is unreachable/i);
  });
});

describe("resolvePgCronMode", () => {
  const REMOTE = "postgresql://postgres.ref:pw@aws-1.pooler.supabase.com:5432/postgres";
  const LOOPBACK_OVERRIDE = "postgresql://postgres:postgres@127.0.0.1:1/postgres";

  test("exact 'validation' target consumes testDatabaseUrl", () => {
    const r = resolvePgCronMode({
      target: "validation",
      testDatabaseUrl: REMOTE,
      localTestDatabaseUrl: undefined,
    });
    expect(r).toEqual({ mode: "validation", dbUrl: REMOTE });
  });

  test("validation target without a DSN refuses (existing refusal preserved)", () => {
    expect(() =>
      resolvePgCronMode({
        target: "validation",
        testDatabaseUrl: undefined,
        localTestDatabaseUrl: undefined,
      }),
    ).toThrow(/TEST_DATABASE_URL/);
  });

  test("local mode IGNORES a remote testDatabaseUrl — the ambient dev-box exposure (R4-1)", () => {
    for (const target of [undefined, "", "local"]) {
      const r = resolvePgCronMode({
        target,
        testDatabaseUrl: REMOTE,
        localTestDatabaseUrl: undefined,
      });
      expect(r.mode).toBe("local");
      expect(r.dbUrl).toBe("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
    }
  });

  test("local mode honors a loopback localTestDatabaseUrl override (R5-1)", () => {
    const r = resolvePgCronMode({
      target: undefined,
      testDatabaseUrl: REMOTE,
      localTestDatabaseUrl: LOOPBACK_OVERRIDE,
    });
    expect(r).toEqual({ mode: "local", dbUrl: LOOPBACK_OVERRIDE });
  });

  test("a misspelled target THROWS — unknown modes never downgrade (R3-2)", () => {
    for (const target of ["validaton", "Validation", "prod"]) {
      expect(() =>
        resolvePgCronMode({
          target,
          testDatabaseUrl: REMOTE,
          localTestDatabaseUrl: undefined,
        }),
      ).toThrow(/PG_CRON_COVERAGE_TARGET/);
    }
  });
});

// ─── T1/T3: attachment tripwires ────────────────────────────────────────────
// Helper unit tests prove helpers; these prove the CALL SITES stay wired (plan §Attachment
// tripwires). They are TRIPWIRES — silent detachment becomes a red diff — while the runtime DO
// guard is the actual per-connection enforcement.
import { readFileSync } from "node:fs";

const PARITY_PATH = "tests/db/validation-schema-parity.test.ts";
const PGCRON_PATH = "tests/cross-cutting/pg-cron-coverage.test.ts";

/** Strip import statements (incl. multi-line) so an import occurrence cannot fake call order. */
function stripImports(src: string): string {
  return src.replace(/^import\b[\s\S]*?from\s+"[^"]*";?\s*$/gm, "");
}

function countOf(hay: string, needle: string): number {
  return hay.split(needle).length - 1;
}

/** Extract a named function's body by brace matching (for the canConnect exemption). */
function functionBody(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`function ${name} not found`);
  const open = src.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced braces in ${name}`);
}

describe("attachment tripwires — validation-schema-parity consumer", () => {
  const src = readFileSync(PARITY_PATH, "utf8");
  const noImports = stripImports(src);

  test("assertValidationIdentity( is the FIRST validation-targeting call", () => {
    const first = noImports.indexOf("assertValidationIdentity(");
    expect(first, "identity assert must be present").toBeGreaterThan(-1);
    for (const later of ["withValidationIdentityGuard(", "execPsqlRedacted("]) {
      const idx = noImports.indexOf(later);
      expect(idx, `${later} must be present`).toBeGreaterThan(-1);
      expect(first, `${later} must come after the identity assert`).toBeLessThan(idx);
    }
  });

  test("guard + redacted runner wired at both psql layers", () => {
    expect(countOf(noImports, "withValidationIdentityGuard(")).toBeGreaterThanOrEqual(2);
    expect(countOf(noImports, "execPsqlRedacted(")).toBeGreaterThanOrEqual(2);
  });

  test("no raw psql exec outside the exempt canConnect probe", () => {
    const withoutCanConnect = src.replace(functionBody(src, "canConnect"), "");
    expect(withoutCanConnect).not.toContain('execFileSync("psql"');
  });
});

describe("attachment tripwires — pg-cron consumer", () => {
  const src = readFileSync(PGCRON_PATH, "utf8");
  const noImports = stripImports(src);

  test("mode resolution routes through resolvePgCronMode exactly once", () => {
    expect(countOf(noImports, "resolvePgCronMode(")).toBe(1);
    expect(countOf(noImports, "assertLocalDbUrlIfSet(process.env.LOCAL_TEST_DATABASE_URL)")).toBe(
      1,
    );
  });

  test("env vars are read ONLY at the resolver call site", () => {
    // The single allowed read of each is the resolver-argument site; count total occurrences.
    expect(countOf(noImports, "process.env.TEST_DATABASE_URL")).toBe(1);
    expect(countOf(noImports, "process.env.PG_CRON_COVERAGE_TARGET")).toBe(1);
    expect(countOf(noImports, "process.env.LOCAL_TEST_DATABASE_URL")).toBe(1);
  });

  test("assertValidationIdentity( precedes every guarded/redacted call", () => {
    const first = noImports.indexOf("assertValidationIdentity(");
    expect(first).toBeGreaterThan(-1);
    for (const later of ["withValidationIdentityGuard(", "execPsqlRedacted("]) {
      const idx = noImports.indexOf(later);
      expect(idx, `${later} must be present`).toBeGreaterThan(-1);
      expect(first).toBeLessThan(idx);
    }
  });

  test("messages and probes carry the redaction + tri-state machinery", () => {
    expect(countOf(noImports, "buildPgCronUnreachableMessage(")).toBe(1);
    expect(countOf(noImports, "redactDsn(")).toBeGreaterThanOrEqual(1);
    expect(noImports).toContain("identity_mismatch");
  });

  test("no raw psql exec anywhere — every psql routes through execPsqlRedacted", () => {
    expect(src).not.toContain('execFileSync("psql"');
  });
});
