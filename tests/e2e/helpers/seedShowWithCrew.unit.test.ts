/**
 * tests/e2e/helpers/seedShowWithCrew.unit.test.ts — the locked seed
 * transaction's SHAPE, proved without a database (M-wave 2 W-E2E review r1 F1).
 *
 * The walker guard recognizes only PostgREST DML, so nothing structural pinned
 * the psql path's lock topology: a mutant removing the advisory lock, moving
 * it after the writes, or committing before them would have passed every
 * existing suite. The shape lives in ONE exported builder (the
 * lockedCrewRestriction "no second copy" principle), and these rows pin it:
 * lock first, statements after, one commit, and no caller statement may carry
 * its own transaction control.
 */
import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { lockedSeedTxSql } from "./seedShowWithCrew";

const DRIVE = "unit-pin:drive";

describe("lockedSeedTxSql — the locked seed transaction shape", () => {
  test("the advisory lock precedes EVERY caller statement, inside one begin/commit", () => {
    const sql = lockedSeedTxSql(DRIVE, [
      "delete from public.shows where drive_file_id = 'x';",
      "insert into public.shows (id) values ('y');",
    ]);
    const lines = sql.split("\n");
    expect(lines[0]).toBe("begin;");
    expect(lines[1]).toContain("pg_advisory_xact_lock(hashtext('show:' ||");
    expect(lines[1]).toContain(DRIVE);
    expect(lines.at(-1)).toBe("commit;");
    // Structural order: the lock's line index is below every caller statement's.
    const lockIdx = lines.findIndex((l) => l.includes("pg_advisory_xact_lock"));
    const firstWriteIdx = lines.findIndex((l) => l.includes("delete from public.shows"));
    expect(lockIdx).toBeGreaterThan(-1);
    expect(firstWriteIdx).toBeGreaterThan(lockIdx);
    // Exactly ONE commit and ONE begin — a mutant interposing either is loud.
    expect(lines.filter((l) => /^commit;$/i.test(l))).toHaveLength(1);
    expect(lines.filter((l) => /^begin;$/i.test(l))).toHaveLength(1);
  });

  test("a caller statement smuggling its own transaction control is REFUSED", () => {
    // The reviewer's escaping-mutant class: "commit before the writes" must not
    // be expressible through the builder at all.
    for (const smuggled of [
      "commit; delete from public.shows where drive_file_id = 'x';",
      "insert into public.shows (id) values ('y'); rollback;",
      "begin; select 1;",
    ]) {
      expect(() => lockedSeedTxSql(DRIVE, [smuggled])).toThrow(/transaction control/);
    }
  });

  test("the module's psql child env never honors the remote opt-in (review r1 F2)", () => {
    // Source pin: the resolver profile is loopback-only by the split-target
    // rationale, so the child env must be scrubbed UNCONDITIONALLY — with the
    // opt-in honored, LOCKED_FIXTURE_ALLOW_REMOTE=1 keeps ambient PG* variables
    // and libpq can retarget behind the validated loopback DSN.
    const src = readFileSync(new URL("./seedShowWithCrew.ts", import.meta.url), "utf8");
    const calls = src.match(/psqlChildEnv\(\{[^}]*\}\)/g) ?? [];
    expect(calls.length, "exactly one psqlChildEnv call in the module").toBe(1);
    expect(calls[0]).toContain("honorRemoteOptIn: false");
  });
});
