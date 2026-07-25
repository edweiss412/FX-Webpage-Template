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
    expect(findings).toEqual([{ kind: "duplicate_exemption", key: "public.shows.drive_file_id" }]);
  });

  test("the shipped exemption list is empty", () => {
    // Spec §4.5: after the migration lands, all 23 census columns are covered. A non-empty
    // list here would mean someone silenced a column without this test being updated.
    expect(DRIVE_ID_COVERAGE_EXEMPTIONS).toEqual([]);
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
