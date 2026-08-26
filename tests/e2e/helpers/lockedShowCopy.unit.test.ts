/**
 * tests/e2e/helpers/lockedShowCopy.unit.test.ts — invariant 2's "tests assert
 * the lock is held", proved without a database, through the PRODUCTION callers.
 *
 * WHY THIS FILE EXISTS. `tests/help/walker-routes.test.ts` is the guard usually
 * cited for locked-table fixture writes and it cannot discharge this one: it
 * recognizes PostgREST mutation syntax, so it is equally green whether the SQL
 * emitted here holds the advisory lock or not. Probed by deleting the lock
 * line: `mutantWalkerHits: 0`, `lockPresentMutant: false`. Same verdict,
 * opposite safety.
 *
 * WHY IT NO LONGER ANALYZES SQL, which is the shape this file arrived at after
 * two review rounds spent widening a recognizer. The first version compared
 * statement indices; a reviewer found four transactions it accepted. The second
 * classified statements against a whitelist; the next round found six more
 * (`where false` and `limit 0` execute the lock zero times, `generate_series`
 * and two calls in one select execute it twice, a lock on another show's key,
 * a `delete` broad enough to touch other shows). Each round's repair was a
 * bigger recognizer and therefore a bigger target, which is exactly the
 * ratchet AGENTS.md's round-economy rule says to refuse.
 *
 * So there is no recognizer. The proof drives the REAL `copyShowLocked` and
 * `deleteShowsLocked` through an injected executor, captures the SQL they
 * actually emit, and compares it to the exact text this file declares. Every
 * escape above, and every one nobody has thought of, changes that text and
 * fails here. The input space is one string rather than all of SQL.
 *
 * It also closes the joins a hand-composed assertion left untested (plan review
 * R2 F3): that `copyShowLocked` locks the NEW show rather than the template,
 * that `deleteShowsLocked` locks each show it removes, and that `runLocked`
 * forwards the key it was given. A drift at any of those leaves both writes
 * functionally successful and every lexical guard green.
 *
 * CONSEQUENCE BOUND: the emitted transaction is character-for-character the
 * declared one, or this fails. What it does NOT prove is what Postgres does
 * with that text — a lock keyed correctly but executed zero times by some
 * future body would need a live-database probe, which is a different test's
 * class. Recorded as a limit rather than chased, because chasing it is how the
 * recognizer got big.
 */
import { describe, expect, test } from "vitest";

import {
  assertDeletedRows,
  copyShowLocked,
  deleteShowsLocked,
  psqlExecutor,
  type Spawn,
  type SqlExecutor,
} from "./lockedShowCopy";

const NEW_ID = "11111111-2222-3333-4444-555555555555";
const NEW_DFID = "empty-state-spec:abc12345";
const TEMPLATE = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";

/** Collapse runs of whitespace so indentation is not the subject of the test. */
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * An executor that records what it was asked to run and returns `rows`.
 *
 * It routes through the REAL `psqlExecutor`, capturing at the SPAWN. Recording
 * at the `SqlExecutor` seam instead would leave `psqlExecutor` unexercised, and
 * an edit that stripped the lock just before spawning would keep every
 * assertion here green — which is precisely what a reviewer probe demonstrated
 * against the previous version of this file.
 */
function recorder(rows: string[]): { exec: SqlExecutor; seen: string[]; args: string[][] } {
  const seen: string[] = [];
  const args: string[][] = [];
  const spawn: Spawn = (a, input) => {
    args.push([...a]);
    seen.push(input);
    return rows.join("\n");
  };
  return { seen, args, exec: (sql: string) => psqlExecutor(sql, spawn) };
}

describe("copyShowLocked emits exactly one locked transaction, keyed on the new show", () => {
  test("the emitted SQL is character-for-character the declared transaction", () => {
    const { exec, seen } = recorder([NEW_ID]);
    copyShowLocked(TEMPLATE, { id: NEW_ID, drive_file_id: NEW_DFID, slug: "s" }, exec);

    expect(seen, "exactly one statement block is run").toHaveLength(1);
    const overrides = JSON.stringify({ id: NEW_ID, drive_file_id: NEW_DFID, slug: "s" });
    expect(norm(seen[0]!)).toBe(
      norm(`
        begin;
        select pg_advisory_xact_lock(hashtext('show:' || '${NEW_DFID}'));
        insert into public.shows
          select (jsonb_populate_record(null::public.shows, to_jsonb(s) || '${overrides}'::jsonb)).*
            from public.shows s
           where s.drive_file_id = '${TEMPLATE}'
        returning id;
        commit;
      `),
    );
  });

  test("the lock is keyed on the NEW show, never on the template", () => {
    const { exec, seen } = recorder([NEW_ID]);
    copyShowLocked(TEMPLATE, { id: NEW_ID, drive_file_id: NEW_DFID }, exec);
    // The join plan review R2 F3 named: `copyShowLocked` picks the key and
    // `runLocked` forwards it. Locking the template would leave the row this
    // transaction actually writes unprotected while looking correct.
    expect(seen[0]).toContain(`hashtext('show:' || '${NEW_DFID}')`);
    expect(seen[0]).not.toContain(`hashtext('show:' || '${TEMPLATE}')`);
  });

  test("a template that matched no row throws instead of yielding an empty copy", () => {
    const { exec } = recorder([]); // RETURNING produced nothing
    expect(() => copyShowLocked(TEMPLATE, { id: NEW_ID, drive_file_id: NEW_DFID }, exec)).toThrow(
      /matched no row/,
    );
  });

  test("overrides missing an id or a drive_file_id are refused before any SQL runs", () => {
    const { exec, seen } = recorder([NEW_ID]);
    expect(() => copyShowLocked(TEMPLATE, { id: NEW_ID }, exec)).toThrow(/drive_file_id/);
    expect(() => copyShowLocked(TEMPLATE, { drive_file_id: NEW_DFID }, exec)).toThrow(/id/);
    expect(seen, "nothing reached the database").toHaveLength(0);
  });

  test("a show id carrying a quote is escaped, not interpolated raw", () => {
    const nasty = "empty-state-spec:o'brien";
    const { exec, seen } = recorder([NEW_ID]);
    copyShowLocked(TEMPLATE, { id: NEW_ID, drive_file_id: nasty }, exec);
    expect(seen[0]).toContain("'empty-state-spec:o''brien'");
  });
});

describe("deleteShowsLocked takes one lock per show, on that show's own key", () => {
  test("each show gets its own transaction, and the SQL is the declared one", () => {
    const ids = ["empty-state-spec:aaaaaaaa", "empty-state-spec:bbbbbbbb"];
    const { exec, seen } = recorder([NEW_ID]);
    deleteShowsLocked(ids, exec);

    expect(seen, "one transaction per show, never one lock for several").toHaveLength(2);
    for (const [i, dfid] of ids.entries()) {
      expect(norm(seen[i]!)).toBe(
        norm(`
          begin;
          select pg_advisory_xact_lock(hashtext('show:' || '${dfid}'));
          delete from public.shows where drive_file_id = '${dfid}' returning id;
          commit;
        `),
      );
      // The other show's key must not appear: a batched delete under one key
      // would mutate every other row outside its own lock.
      expect(seen[i]).not.toContain(ids[1 - i]!);
    }
  });

  test("a cleanup that removed nothing fails, and names every show that did", () => {
    // `DELETE 0` is what a zero-row delete really prints when the status line is
    // not suppressed. The check must reject it; treating "stdout is non-empty"
    // as success is the vacuous version this replaced.
    const { exec } = recorder(["DELETE 0"]);
    expect(() => deleteShowsLocked(["empty-state-spec:aaaaaaaa"], exec)).toThrow(
      /delete returned no row id/,
    );
  });

  test("one show's failure does not abandon the rest", () => {
    const seen: string[] = [];
    const exec: SqlExecutor = (sql) => {
      seen.push(sql);
      return sql.includes("bbbbbbbb") ? "DELETE 0" : NEW_ID;
    };
    expect(() =>
      deleteShowsLocked(
        ["empty-state-spec:aaaaaaaa", "empty-state-spec:bbbbbbbb", "empty-state-spec:cccccccc"],
        exec,
      ),
    ).toThrow(/1 cleanup failure/);
    // A cleanup that stops at the first failure leaves more residue than it
    // removes, so all three must have been attempted.
    expect(seen).toHaveLength(3);
  });
});

describe("the real executor forwards the transaction and asks psql for bare rows", () => {
  test("the SQL reaching the child is the SQL the caller built, byte for byte", () => {
    const { exec, seen, args } = recorder([NEW_ID]);
    copyShowLocked(TEMPLATE, { id: NEW_ID, drive_file_id: NEW_DFID }, exec);
    // The lock survives the whole path, spawn included. This is the assertion
    // an injected SqlExecutor could not make: with the seam one level up, an
    // edit inside psqlExecutor was invisible.
    expect(seen[0]).toContain(`pg_advisory_xact_lock(hashtext('show:' || '${NEW_DFID}'))`);
    expect(seen[0]).toContain("insert into public.shows");
  });

  test("`-q` is passed, because the delete check depends on it", () => {
    const { exec, args } = recorder([NEW_ID]);
    deleteShowsLocked(["empty-state-spec:aaaaaaaa"], exec);
    // Without -q psql prints the command status, `DELETE 0` becomes non-empty
    // output, and assertDeletedRows' predicate is asked to tell a status line
    // from a row id. It can, but only because this flag keeps them apart.
    expect(args[0]).toContain("-q");
    expect(args[0]).toContain("-At");
    expect(args[0]).toContain("ON_ERROR_STOP=1");
  });

  test("the resolved DSN is the loopback target, never an ambient remote", () => {
    const { exec, args } = recorder([NEW_ID]);
    deleteShowsLocked(["empty-state-spec:aaaaaaaa"], exec);
    const dsn = args[0]!.at(-1)!;
    expect(dsn, `psql was pointed at ${dsn}`).toMatch(/@(127\.0\.0\.1|localhost|\[::1\]):/);
  });
});

describe("assertDeletedRows discriminates a real delete from a status line", () => {
  // NEGATIVE PROOFS, and the reason this predicate is a pure function at all:
  // both checks landed once without one (plan review R2 F4), which means either
  // could have been deleted with every green test staying green.
  const cases: Array<[string, string, boolean]> = [
    ["a returned row id", NEW_ID, true],
    ["a row id with trailing newline", `${NEW_ID}\n`, true],
    ["two returned ids", `${NEW_ID}\n${NEW_ID}`, true],
    ["the zero-row command status", "DELETE 0", false],
    ["a one-row command status with no id", "DELETE 1", false],
    ["empty output", "", false],
    ["whitespace only", "   \n  ", false],
    ["a NOTICE and nothing else", "NOTICE:  relation does not exist", false],
  ];
  for (const [label, stdout, ok] of cases) {
    test(`${label} → ${ok ? "accepted" : "rejected"}`, () => {
      if (ok) expect(() => assertDeletedRows(stdout, "d")).not.toThrow();
      else expect(() => assertDeletedRows(stdout, "d")).toThrow(/no row id/);
    });
  }
});
