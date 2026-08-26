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
 * Classify the transaction as a whole and return every way it fails invariant 2.
 *
 * WHITELIST, NOT BLACKLIST, and that is the repair spec review round 3 forced.
 * The first version compared string INDICES — first `begin`, last `commit`,
 * first write, plus a scan for a literal `commit;` in between — and a reviewer
 * probe walked straight through it with four shapes it returned `[]` for: a
 * transaction committed BEFORE the lock, a `rollback;` between the lock and the
 * write, an `end;` doing the same, and a second write placed after the
 * protected transaction. Every one leaves a `shows` write unlocked.
 *
 * Patching those four in would have invited a fifth. So this does not enumerate
 * what is forbidden; it states the ONE sequence that is allowed and rejects
 * everything else, including any statement it cannot classify. `lockedStatement`
 * emits exactly one shape, so accepting exactly one shape is honest rather than
 * strict: there is nothing legitimate for this to turn away.
 *
 * CONSEQUENCE BOUND: the transaction is either exactly
 * `begin` → `pg_advisory_xact_lock` → one write → `commit`, or it fails here by
 * name. An unrecognized statement is a failure, never a pass.
 */
function lockOrderProblems(sql: string): string[] {
  const statements = sql
    .split(";")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  type Kind = "begin" | "lock" | "write" | "commit" | "other";
  const classify = (st: string): Kind => {
    const head = st.toLowerCase();
    if (/^begin\b/.test(head)) return "begin";
    if (/^select\s+pg_advisory_xact_lock\(/.test(head)) return "lock";
    if (/^(insert\s+into|update|delete\s+from)\b/.test(head)) return "write";
    if (/^commit\b/.test(head)) return "commit";
    return "other";
  };

  const kinds = statements.map(classify);
  const problems: string[] = [];

  // Fail-closed on anything unclassified, naming it, so a future statement type
  // is a red test rather than a silent pass. `rollback`, `end`, `savepoint` and
  // a second `begin` all land here.
  kinds.forEach((k, i) => {
    if (k === "other") problems.push(`unrecognized statement: ${statements[i]!.slice(0, 60)}`);
  });

  const shape = kinds.filter((k) => k !== "other").join(",");
  if (shape !== "begin,lock,write,commit") {
    problems.push(`transaction shape is [${shape}], must be exactly [begin,lock,write,commit]`);
  }
  if (problems.length > 0) return problems;

  if (!/hashtext\('show:'\s*\|\|/.test(sql)) problems.push("lock is not keyed on 'show:' || <id>");
  return problems;
}

describe("lockedShowCopy emits a correctly-ordered locked transaction", () => {
  test("PREMISE: the analyzer rejects every escape found so far, not just the first three", () => {
    const good = lockedStatement(DFID, deleteShowBody(DFID));
    const lock = `select pg_advisory_xact_lock(hashtext('show:' || '${DFID}'));`;
    // Each mutant leaves at least one `shows` write outside a held lock. The
    // first three cost arc C review rounds 4, 5 and 6 one per round; the last
    // four were found by spec review round 3 walking through the INDEX-based
    // analyzer this whitelist replaced.
    const mutants: Array<[string, string]> = [
      ["lock deleted", good.replace(/select pg_advisory_xact_lock\([^;]*\);/, "")],
      [
        "lock after the write",
        good
          .replace(/select pg_advisory_xact_lock\([^;]*\);/, "")
          .replace(/returning id;/, (m) => `${m}\n    ${lock}`),
      ],
      [
        "commit between lock and write",
        good.replace(
          /select pg_advisory_xact_lock\([^;]*\);/,
          (m) => `${m}\n    commit;\n    begin;`,
        ),
      ],
      [
        "nested second acquisition",
        good.replace(/select pg_advisory_xact_lock\([^;]*\);/, (m) => `${m}\n    ${m}`),
      ],
      ["commit BEFORE the lock", good.replace(/begin;/, (m) => `${m}\n    commit;`)],
      [
        "rollback between lock and write",
        good.replace(/select pg_advisory_xact_lock\([^;]*\);/, (m) => `${m}\n    rollback;`),
      ],
      [
        "end between lock and write",
        good.replace(/select pg_advisory_xact_lock\([^;]*\);/, (m) => `${m}\n    end;`),
      ],
      [
        "a second write after the transaction",
        `${good}\n    delete from public.shows where drive_file_id = 'other';`,
      ],
    ];
    for (const [name, sql] of mutants) {
      expect(lockOrderProblems(sql), `${name} must be caught:\n${sql}`).not.toEqual([]);
    }
    // And the real thing is accepted, so the controls above are not passing
    // because the analyzer rejects everything.
    expect(lockOrderProblems(good), good).toEqual([]);
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
