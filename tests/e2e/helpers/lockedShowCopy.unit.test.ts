/**
 * tests/e2e/helpers/lockedShowCopy.unit.test.ts — invariant 2's "tests assert
 * the lock is held", proved without a database.
 *
 * WHY THIS FILE EXISTS. `tests/help/walker-routes.test.ts` is the guard usually
 * cited for locked-table fixture writes, and it CANNOT prove this: it
 * recognizes PostgREST mutation syntax, so it is equally green whether the SQL
 * this helper emits holds the advisory lock or not. Probed 2026-08-25 by
 * deleting the lock line from `lockedStatement`:
 *
 *     currentWalkerHits: 0   mutantWalkerHits: 0
 *     lockPresentCurrent: true   lockPresentMutant: false
 *
 * Same verdict, opposite safety. So the lock needs its own executable proof and
 * this is it.
 *
 * CONSEQUENCE BOUND, so the file has a closable end: the emitted transaction
 * either acquires the per-show advisory lock BEFORE its write and releases it
 * only at the commit AFTER, or it fails here by name. SQL that is merely
 * unusual, or a body this analyzer cannot classify, is a documented limit
 * rather than a pass — `lockOrderProblems` returns a problem for any shape it
 * cannot place, so an unrecognized transaction reds instead of sliding through.
 *
 * POSITIVE CONTROLS ARE THE POINT. An order assertion over one known-good
 * string proves nothing about the analyzer; a mutant it fails to catch is a
 * guard that would have passed the defect. Each of the three ways this shape is
 * known to go wrong — the lock deleted, the lock after the write, a commit
 * between the lock and the write — is built here and asserted RED. Those three
 * are not hypothetical: lockedCrewRestriction.ts's header records arc C
 * spending review rounds 4, 5 and 6 on exactly them, one per round, while a
 * lexical guard over the source stayed green.
 */
import { describe, expect, test } from "vitest";

import { copyShowBody, deleteShowBody, lockedStatement } from "./lockedShowCopy";

const DFID = "empty-state-spec:abc12345";
const TEMPLATE = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";

/**
 * Classify one transaction's statement ORDER and return every way it fails the
 * invariant. Positions come from the emitted text, so a reordering moves them.
 *
 * Deliberately NOT a "does the string contain a lock" check: containment is
 * satisfied by a lock placed after the write, or outside the transaction, both
 * of which leave the write unprotected.
 */
function lockOrderProblems(sql: string): string[] {
  const problems: string[] = [];
  const begin = sql.indexOf("begin;");
  const commit = sql.lastIndexOf("commit;");
  const locks = [...sql.matchAll(/pg_advisory_xact_lock\(/g)].map((m) => m.index ?? -1);
  const write = sql.search(/\b(insert|update|delete)\s+(into|from|public\.)/i);

  if (begin < 0) problems.push("no begin");
  if (commit < 0) problems.push("no commit");
  if (write < 0) problems.push("no write statement this analyzer can place");
  if (locks.length === 0) problems.push("no advisory lock");
  // Single-holder rule: exactly one acquisition per transaction. Two is the
  // nesting invariant 2 forbids, and it deadlocks under burst.
  if (locks.length > 1) problems.push(`${locks.length} advisory locks in one transaction`);
  if (problems.length > 0) return problems;

  const lock = locks[0]!;
  if (!(begin < lock)) problems.push("lock is not inside the transaction");
  if (!(lock < write)) problems.push("lock is acquired AFTER the write it must cover");
  if (!(write < commit)) problems.push("write is not inside the transaction");
  // A commit between the lock and the write releases it before the write runs.
  const between = sql.slice(lock, write);
  if (/\bcommit;/.test(between)) problems.push("a commit sits between the lock and the write");
  // The lock must be keyed on the show, not on a constant.
  if (!/hashtext\('show:'\s*\|\|/.test(sql)) problems.push("lock is not keyed on 'show:' || <id>");
  return problems;
}

describe("lockedShowCopy emits a correctly-ordered locked transaction", () => {
  test("PREMISE: the analyzer rejects each way this shape is known to go wrong", () => {
    const good = lockedStatement(DFID, deleteShowBody(DFID));
    // The premise is that lockOrderProblems DISCRIMINATES. Without these three
    // the green assertions below would hold for an analyzer that returns [] for
    // everything, which is the tautology this project's guard-premise rule bans.
    const lockDeleted = good.replace(/select pg_advisory_xact_lock\([^;]*\);/, "");
    const lockAfterWrite = lockedStatement(DFID, deleteShowBody(DFID))
      .replace(/select pg_advisory_xact_lock\([^;]*\);/, "")
      .replace(
        /(returning id;)/,
        `$1\n    select pg_advisory_xact_lock(hashtext('show:' || '${DFID}'));`,
      );
    const commitBetween = good.replace(
      /(select pg_advisory_xact_lock\([^;]*\);)/,
      "$1\n    commit;\n    begin;",
    );
    const doubleLock = good.replace(/(select pg_advisory_xact_lock\([^;]*\);)/, "$1\n    $1");

    expect(lockOrderProblems(lockDeleted), "lock deleted must be caught").toContain(
      "no advisory lock",
    );
    expect(lockOrderProblems(lockAfterWrite), "lock after the write must be caught").toContain(
      "lock is acquired AFTER the write it must cover",
    );
    expect(lockOrderProblems(commitBetween), "a commit between must be caught").toContain(
      "a commit sits between the lock and the write",
    );
    expect(
      lockOrderProblems(doubleLock).join(" "),
      "a nested second acquisition must be caught",
    ).toContain("advisory locks in one transaction");
  });

  test("the COPY transaction holds the lock for its insert", () => {
    const sql = lockedStatement(DFID, copyShowBody(TEMPLATE, { id: "x", drive_file_id: DFID }));
    expect(lockOrderProblems(sql), sql).toEqual([]);
    // Keyed on the NEW show, which is the row this transaction writes.
    expect(sql).toContain(`hashtext('show:' || '${DFID}')`);
    // The RETURNING guard is what makes a missing template throw rather than
    // yield an empty copy.
    expect(sql).toMatch(/returning id;/);
  });

  test("the DELETE transaction holds the lock for its delete", () => {
    const sql = lockedStatement(DFID, deleteShowBody(DFID));
    expect(lockOrderProblems(sql), sql).toEqual([]);
    expect(sql).toContain(`hashtext('show:' || '${DFID}')`);
  });

  test("cleanup locks each show on its own key, never one lock for several", () => {
    const ids = ["empty-state-spec:aaaaaaaa", "empty-state-spec:bbbbbbbb"];
    const perShow = ids.map((d) => lockedStatement(d, deleteShowBody(d)));
    for (const [i, sql] of perShow.entries()) {
      expect(lockOrderProblems(sql), sql).toEqual([]);
      expect(sql).toContain(`hashtext('show:' || '${ids[i]}')`);
      // The other show's key must NOT appear: one transaction, one show, one
      // lock. A batched `delete ... in (...)` under a single key would leave
      // every other show's row mutated outside its own lock.
      expect(sql).not.toContain(ids[1 - i]!);
    }
  });

  test("a show id carrying a quote is escaped, not interpolated raw", () => {
    const nasty = "empty-state-spec:o'brien";
    const sql = lockedStatement(nasty, deleteShowBody(nasty));
    expect(sql).toContain("'empty-state-spec:o''brien'");
    expect(lockOrderProblems(sql), sql).toEqual([]);
  });
});
