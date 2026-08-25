/**
 * tests/supabase/_metaRetryableRpcVolatility.test.ts — Task 2 of the transient-502 plan.
 *
 * Guards RETRYABLE_RPCS in BOTH directions, because a retry is only safe if the database can
 * prove the call cannot have written:
 *
 *   SAFETY       every name in the set is non-VOLATILE AND completes inside a READ ONLY
 *                transaction. Volatility alone is NECESSARY AND NOT SUFFICIENT: a STABLE
 *                function can still write through a VOLATILE callee (spec §4.2), and the
 *                READ ONLY arm is what catches that at any call depth.
 *   COMPLETENESS every non-VOLATILE function name appearing as a string literal in the
 *                product tree is in the set or in EXCLUSIONS with a reason. Discovery matches
 *                literals against the CATALOG rather than recognizing call sites, because two
 *                call-site rules failed one round apart (spec §4.4).
 *
 * The arms FAIL when the catalog is unreachable; they never skip. Every other DB suite here
 * skips, and that is right for them — a skip loses coverage OF THE DATABASE. This one verifies
 * a safety precondition of product code that ships either way, so a skip would leave the retry
 * set unverified while the suite reported pass. The suite lives in tests/supabase/, which is
 * NOT in PARALLEL_TEST_GLOBS and therefore runs in the serial project, which is the tier that
 * boots Supabase.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { RETRYABLE_RPCS } from "@/lib/supabase/retryEligibility";
import { assertLocalDbUrl } from "../db/_localDbUrl";
import { premise } from "../_shared/premise";
import {
  EXCLUSIONS,
  PRODUCT_SOURCE_EXTENSION,
  buildCallArgs,
  bodyCannotHaveRun,
  buildCatalog,
  READ_ONLY_SQLSTATE,
  completenessViolations,
  literalsInProductTree,
  readOnlyViolations,
  safetyViolations,
  type Catalog,
  type CatalogRow,
  type ReadOnlyOutcome,
} from "./retryableRpcVolatilityScan";

// Guarded, because a raw LOCAL_TEST_DATABASE_URL read is exactly what
// tests/db/_metaLocalDbUrlGuard.test.ts refuses: this suite opens a real connection, so an
// ambient non-loopback value would point it at a REMOTE database. assertLocalDbUrl refuses
// anything that is not loopback rather than trusting the variable's name.
const sql = postgres(
  assertLocalDbUrl(
    process.env.LOCAL_TEST_DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  ),
  { max: 1, prepare: false },
);
afterAll(async () => {
  await sql.end({ timeout: 5 });
});

let catalog: Catalog = new Map();
let memberCalls: {
  proname: string;
  identity: string;
  isstrict: boolean;
  argtypes: string[];
}[] = [];

beforeAll(async () => {
  // Every overload is kept. Building `name -> row` collapsed them last-wins, which let a
  // VOLATILE overload hide behind a STABLE one of the same name (round-1 review).
  const rows = await sql<CatalogRow[]>`
    select p.proname, p.provolatile,
           pg_get_function_identity_arguments(p.oid) as identity
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'`;
  catalog = buildCatalog(rows);

  // The call text for every overload of every member, built from the catalog rather than
  // hand-written, so a signature change cannot leave the arm calling a shape that no longer
  // exists. NULL arguments: the arm asks whether the body can WRITE, never what it returns.
  const members = [...RETRYABLE_RPCS];
  // Argument TYPES, not a pre-built NULL list. The args are built in TS by `buildCallArgs`, which
  // substitutes a real value per type — NULL arguments make PostgreSQL skip a STRICT body entirely,
  // so a NULL-called STRICT member would be recorded clean without executing (round-2 review).
  memberCalls = await sql<
    { proname: string; identity: string; isstrict: boolean; argtypes: string[] }[]
  >`
    select p.proname,
           pg_get_function_identity_arguments(p.oid) as identity,
           p.proisstrict as isstrict,
           coalesce(
             (select array_agg(format_type(t.oid, null) order by o.ord)
                from unnest(p.proargtypes) with ordinality as o(tid, ord)
                join pg_type t on t.oid = o.tid),
             '{}') as argtypes
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any(${members})`;
});

/**
 * Execute one call inside a READ ONLY transaction and report what SQLSTATE, if any, came back.
 *
 * The transaction always rolls back, and an optional `setup` runs BEFORE the access mode is set,
 * which is the only order Postgres allows for creating a planted fixture in the same transaction.
 *
 * The outcome is DATA, not an assertion. The arm's verdict is `readOnlyViolations`, a pure
 * function, so every branch can be driven by a planted outcome rather than by whichever real
 * member happens to behave that way today.
 */
async function runReadOnly(
  name: string,
  identity: string,
  args: string,
  setup?: (tx: postgres.TransactionSql) => Promise<void>,
): Promise<ReadOnlyOutcome> {
  try {
    await sql.begin(async (tx) => {
      if (setup !== undefined) await setup(tx);
      await tx`set transaction read only`;
      await tx.unsafe(`select public.${name}(${args})`);
      // Rolled back either way; the arm never leaves state behind, even on the clean path.
      await tx`rollback`;
    });
    return { name, identity, sqlstate: null, message: null };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    // A raise with no SQLSTATE would otherwise read as `null`, which is the CLEAN verdict — the
    // one direction this must never guess in. Unknown becomes a non-null sentinel instead.
    return {
      name,
      identity,
      sqlstate: e.code ?? "UNKNOWN",
      message: e.message ?? null,
    };
  }
}

describe("RETRYABLE_RPCS — premises", () => {
  test("the catalog resolved, so an empty result cannot pass this suite vacuously", () => {
    premise("public functions in the catalog", catalog.size, 0);
  });

  test("the product-tree walk found literals", () => {
    premise("string literals in the product tree", literalsInProductTree().size, 0);
  });
});

describe("the product-tree walk skips what it claims to skip", () => {
  /**
   * Written because the mutation gate found BOTH of this walker's guards deletable with every
   * test green: flipping `node_modules || dot-dir` to `&&` skips nothing, and removing the
   * `continue` after recursing falls through to the extension test. Neither changed a result,
   * because the real roots (`app`, `lib`, `components` — 262 directories) happen to contain no
   * node_modules, no dot-directory, and no directory named `*.ts`.
   *
   * "Happens to contain none today" is a fact about the tree, not a property of the walker, and
   * an `equivalent` row resting on it would expire the first time someone nests a dependency.
   * A fixture makes the guards observable, so the walker is pinned by construction instead.
   */
  test("node_modules and dot-directories are not descended into", () => {
    const root = mkdtempSync(join(tmpdir(), "walk-fixture-"));
    premise("fixture directories the walk can descend into", 3, 0);
    try {
      mkdirSync(join(root, "node_modules"), { recursive: true });
      mkdirSync(join(root, ".hidden"), { recursive: true });
      writeFileSync(join(root, "kept.ts"), 'const a = "KEPT_LITERAL";\n');
      writeFileSync(join(root, "node_modules", "dep.ts"), 'const b = "NODE_MODULES_LITERAL";\n');
      writeFileSync(join(root, ".hidden", "h.ts"), 'const c = "HIDDEN_LITERAL";\n');

      const found = literalsInProductTree([root]);

      // The premise: the walk reached the fixture at all. Without it, a walker that returned an
      // empty set would satisfy both exclusions vacuously.
      expect(found.has("KEPT_LITERAL")).toBe(true);
      expect(found.has("NODE_MODULES_LITERAL")).toBe(false);
      expect(found.has("HIDDEN_LITERAL")).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a DIRECTORY whose name ends in .ts is recursed, never read as a file", () => {
    // The `continue` after `walk(full)` is what stops a directory from reaching readFileSync.
    // Remove it and a directory named `x.ts` passes the extension test and throws EISDIR.
    const root = mkdtempSync(join(tmpdir(), "walk-dirts-"));
    premise("a nested .ts-named directory to recurse into", 1, 0);
    try {
      mkdirSync(join(root, "nested.ts"), { recursive: true });
      writeFileSync(join(root, "nested.ts", "inner.ts"), 'const d = "INNER_LITERAL";\n');

      const found = literalsInProductTree([root]);

      expect(found.has("INNER_LITERAL")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("RETRYABLE_RPCS — safety arm", () => {
  test("every member is non-VOLATILE in the live catalog", () => {
    premise("catalog rows to judge the set against", catalog.size, 0);
    expect(safetyViolations(RETRYABLE_RPCS, catalog)).toEqual([]);
  });

  test("PLANT: a VOLATILE name in the set fails the arm", () => {
    const volatileName = [...catalog].find(([, rows]) => rows.some((r) => r.volatile))?.[0];
    premise("a VOLATILE function exists to plant with", volatileName === undefined ? 0 : 1, 0);
    expect(safetyViolations([volatileName!], catalog)).toHaveLength(1);
  });

  test("PLANT: a name absent from the catalog fails rather than being skipped", () => {
    // The premise is the catalog being NON-empty: against an empty one every name is
    // unresolvable, so this plant would pass for the wrong reason.
    premise("catalog rows the planted name is genuinely absent from", catalog.size, 0);
    expect(safetyViolations(["no_such_function_anywhere"], catalog)).toHaveLength(1);
  });

  test("every member is EXECUTED inside a READ ONLY transaction", async () => {
    // The premise is that the arm reaches every overload of every member. It used to filter on
    // `pronargs = 0`, so 8 of the 13 members were never executed at all and the suite still read
    // as green — the count assertion below is what makes that visible rather than silent.
    premise("member overloads to execute", memberCalls.length, 0);
    expect(new Set(memberCalls.map((c) => c.proname))).toEqual(new Set(RETRYABLE_RPCS));

    const outcomes: ReadOnlyOutcome[] = [];
    for (const call of memberCalls) {
      const args = buildCallArgs(call.argtypes);
      const skipped = bodyCannotHaveRun(call.isstrict, args.unsupported);
      const outcome = skipped
        ? // Do not even issue the call: it cannot execute the body, and running it would only
          // produce a clean-looking result. Record WHY instead.
          {
            name: call.proname,
            identity: call.identity,
            sqlstate: null,
            message: `no sentinel for ${args.unsupported.join(", ")}`,
            bodySkipped: true,
          }
        : await runReadOnly(call.proname, call.identity, args.sql);
      outcomes.push(outcome);
    }

    expect(readOnlyViolations(outcomes)).toEqual([]);
    // Each outcome is a real execution, not a skip. Without this a future `continue` could
    // reintroduce the same hole with the violation list still empty.
    expect(outcomes).toHaveLength(memberCalls.length);
  });

  test("PLANT: a STABLE function that writes through a VOLATILE callee is caught by the arm", async () => {
    // The case that discriminates this arm from the SAFETY arm: the planted function is declared
    // STABLE, so volatility checking passes it, and only EXECUTING it under READ ONLY exposes the
    // write. Without this, deleting the arm entirely would leave the suite green, because every
    // real member is genuinely read-only.
    //
    // The callee must be VOLATILE and the write must happen THROUGH it. A STABLE function that
    // inserts directly raises 0A000 ("INSERT is not allowed in a non-volatile function"), which is
    // Postgres refusing the function's declaration rather than the transaction refusing the write
    // — a plant built that way plants the wrong thing and never reaches 25006. Probed both shapes.
    premise("a live connection to build the planted pair on", catalog.size, 0);
    const outcome = await runReadOnly("_probe_stable_calls_vol", "", "", async (tx) => {
      await tx.unsafe(`create table _probe_t(x int)`);
      await tx.unsafe(
        `create function _probe_vol() returns void language plpgsql volatile as $$ begin insert into _probe_t values (1); end $$`,
      );
      await tx.unsafe(
        `create function _probe_stable_calls_vol() returns void language plpgsql stable as $$ begin perform _probe_vol(); end $$`,
      );
    });

    // The exact SQLSTATE, not merely "it raised". A plant asserting only that something threw
    // passes on a typo in the function name, which is the tautology this arm is most exposed to.
    expect(outcome.sqlstate).toBe(READ_ONLY_SQLSTATE);
    expect(readOnlyViolations([outcome], new Map())).toHaveLength(1);
    // And a declaration cannot excuse it: 25006 is the arm firing, never noise to be waived.
    expect(readOnlyViolations([outcome], new Map([[outcome.name, "declared"]]))).toHaveLength(1);
  });

  test("PLANT: an undeclared member that raises is a violation, and a stale declaration is too", () => {
    // no-premise: every input is a literal built in the test; no catalog, connection, or file is read.
    //
    // Both directions of READ_ONLY_INCONCLUSIVE, on planted outcomes so neither rests on which
    // members happen to raise today.
    const raised: ReadOnlyOutcome = {
      name: "_undeclared",
      identity: "",
      sqlstate: "P0001",
      message: "forbidden",
    };
    const clean: ReadOnlyOutcome = {
      name: "_declared",
      identity: "",
      sqlstate: null,
      message: null,
    };
    const declared = new Map([["_declared", "a reason"]]);

    expect(readOnlyViolations([raised], declared)).toHaveLength(1);
    expect(readOnlyViolations([clean], declared)).toHaveLength(1);
    // A declared name with TWO overloads, one raising and one clean, is NOT stale. Judged per
    // outcome the clean overload reported the declaration stale and failed the arm, while the
    // declaration was legitimately true of the other overload — the same name-versus-overload
    // confusion as the catalog collapse, swept out of this round's own repair.
    expect(
      readOnlyViolations(
        [
          { name: "_mixed", identity: "a integer", sqlstate: "42501", message: "forbidden" },
          { name: "_mixed", identity: "a integer, b integer", sqlstate: null, message: null },
        ],
        new Map([["_mixed", "one overload is admin-gated"]]),
      ),
    ).toEqual([]);
    // But a name whose EVERY overload runs clean is still stale, so the rule did not simply go quiet.
    expect(
      readOnlyViolations(
        [
          { name: "_mixed", identity: "a integer", sqlstate: null, message: null },
          { name: "_mixed", identity: "a integer, b integer", sqlstate: null, message: null },
        ],
        new Map([["_mixed", "one overload is admin-gated"]]),
      ),
    ).toHaveLength(1);

    // And the reasoned-entry rule: a declaration with an EMPTY reason does not excuse anything.
    expect(
      readOnlyViolations([{ ...raised, name: "_blank" }], new Map([["_blank", "   "]])),
    ).toHaveLength(1);
  });
});

describe("a NULL argument cannot be mistaken for an executed body", () => {
  /**
   * Round-2 review found the arm calling every member with NULL arguments while treating a
   * non-throwing call as clean. PostgreSQL SKIPS a `STRICT` function's body entirely on any NULL
   * input, so a STRICT member reached "verified read-only" without executing one statement.
   *
   * No member is STRICT today (proisstrict is false for all thirteen, and for all sixty-six public
   * functions), which is exactly why nothing observed it. Both halves are therefore planted.
   */
  test("PLANT: a STRICT writer called with a real value IS caught by the arm", async () => {
    premise("a live connection to build the planted STRICT pair on", catalog.size, 0);
    // `text` deliberately: it HAS a sentinel, so the body actually runs and the arm can fire.
    const outcome = await runReadOnly(
      "_probe_strict_text",
      "",
      buildCallArgs(["text"]).sql,
      async (tx) => {
        await tx.unsafe(`create table _probe_st(x int)`);
        await tx.unsafe(
          `create function _probe_st_vol(a text) returns void language plpgsql volatile as $$ begin insert into _probe_st values (1); end $$`,
        );
        await tx.unsafe(
          `create function _probe_strict_text(a text) returns void language plpgsql stable strict as $$ begin perform _probe_st_vol(a); end $$`,
        );
      },
    );
    expect(outcome.sqlstate).toBe(READ_ONLY_SQLSTATE);
  });

  test("PLANT: the SAME function called with NULL raises nothing — the defect, reproduced", async () => {
    premise("a live connection to build the planted STRICT pair on", catalog.size, 0);
    // This is what the arm used to do. It is the reason a NULL-called STRICT member looked clean:
    // the body never ran, so there was nothing to raise.
    const outcome = await runReadOnly("_probe_strict_text2", "", "null::text", async (tx) => {
      await tx.unsafe(`create table _probe_st2(x int)`);
      await tx.unsafe(
        `create function _probe_st_vol2(a text) returns void language plpgsql volatile as $$ begin insert into _probe_st2 values (1); end $$`,
      );
      await tx.unsafe(
        `create function _probe_strict_text2(a text) returns void language plpgsql stable strict as $$ begin perform _probe_st_vol2(a); end $$`,
      );
    });
    // No error at all, from a function that demonstrably writes. Clean is NOT evidence here.
    expect(outcome.sqlstate).toBeNull();
  });

  test("PLANT: a STRICT member with an unsupported argument type is never reported clean", () => {
    // no-premise: every input is a literal built in the test.
    //
    // The remaining NULL path: a type with no sentinel falls back to NULL, and for a STRICT
    // function that means the body cannot run. The classifier must refuse to call that clean.
    const args = buildCallArgs(["some_exotic_type"]);
    expect(args.unsupported).toEqual(["some_exotic_type"]);
    expect(bodyCannotHaveRun(true, args.unsupported)).toBe(true);
    // A non-STRICT function with the same NULL fallback still executes, so it is NOT skipped.
    expect(bodyCannotHaveRun(false, args.unsupported)).toBe(false);

    const skipped: ReadOnlyOutcome = {
      name: "_strict_exotic",
      identity: "a some_exotic_type",
      sqlstate: null,
      message: "no sentinel",
      bodySkipped: true,
    };
    // Clean-looking (sqlstate null) yet a violation, which is the whole point.
    expect(readOnlyViolations([skipped], new Map())).toHaveLength(1);
    // And a declaration does not excuse it either: this is not an inconclusive raise, it is a
    // call that never happened.
    expect(readOnlyViolations([skipped], new Map([["_strict_exotic", "declared"]]))).toHaveLength(
      1,
    );
  });

  test("every supported argument type produces a NON-null literal", () => {
    // no-premise: literal inputs. Guards the sentinel table against a row that silently degrades
    // to NULL, which would reintroduce the STRICT skip for that type.
    const types = ["text", "text[]", "uuid", "uuid[]", "timestamp with time zone"];
    const built = buildCallArgs(types);
    expect(built.unsupported).toEqual([]);
    expect(built.sql).not.toContain("null");
    expect(built.sql.split(",")).toHaveLength(types.length);
  });
});

describe("the walk covers every extension the project compiles", () => {
  test("PRODUCT_SOURCE_EXTENSION accepts every extension tsconfig names", () => {
    // no-premise: tsconfig is read below and asserted non-empty.
    //
    // `.tsx?` alone skipped `.mts`, which tsconfig compiles — so a product module could name an RPC
    // invisibly to the completeness arm (round-2 review). Derived from tsconfig rather than
    // restated, so adding a glob there fails here instead of silently narrowing the walk.
    const cfg = readFileSync(join(process.cwd(), "tsconfig.json"), "utf8");
    const globs = [...cfg.matchAll(/"\*\*\/\*\.([a-z]+)"/g)].map((m) => m[1]!);
    premise("extension globs parsed out of tsconfig include", globs.length, 0);
    for (const ext of new Set(globs)) {
      expect(PRODUCT_SOURCE_EXTENSION.test(`some.${ext}`), `tsconfig compiles .${ext}`).toBe(true);
    }
  });

  test("it still rejects what is not source", () => {
    // no-premise: literal inputs.
    for (const f of ["notes.md", "data.json", "styles.css", "image.png"]) {
      expect(PRODUCT_SOURCE_EXTENSION.test(f), f).toBe(false);
    }
  });
});

describe("overloads are kept apart, not collapsed", () => {
  /**
   * Round-1 review found the catalog built as `name -> row`, so two overloads of one name
   * resolved last-wins and a VOLATILE overload could hide behind a STABLE one. A retry is decided
   * from the `/rpc/<name>` path, which carries no argument types, so hiding it there is exactly
   * the case that matters.
   *
   * `public` contains no overloaded functions, which is WHY nothing observed this. Both halves
   * are therefore planted: the grouping is driven by a real overloaded pair created in a
   * rolled-back transaction, and the safety verdict by rows built in memory.
   */
  test("PLANT: a real overloaded pair survives the catalog build as two entries", async () => {
    premise("a live connection to create the planted overloads on", catalog.size, 0);
    let rows: CatalogRow[] = [];
    await sql
      .begin(async (tx) => {
        await tx.unsafe(
          `create function _probe_ovl(a int) returns void language plpgsql stable as $$ begin end $$`,
        );
        await tx.unsafe(
          `create function _probe_ovl(a int, b int) returns void language plpgsql volatile as $$ begin end $$`,
        );
        rows = await tx<CatalogRow[]>`
          select p.proname, p.provolatile,
                 pg_get_function_identity_arguments(p.oid) as identity
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = '_probe_ovl'`;
        await tx`rollback`;
      })
      .catch(() => undefined); // the rollback is how this transaction ends; it is not a failure

    // The premise: Postgres really did accept two functions of one name. If the plant silently
    // created one, every assertion below would pass on a catalog that never faced an overload.
    premise("planted overloads visible in pg_proc", rows.length, 1);

    const planted = buildCatalog(rows);
    expect(planted.get("_probe_ovl")).toHaveLength(2);
    // The collapse, stated as its consequence: the VOLATILE overload is still reachable, so the
    // name is unsafe. Built `name -> row`, this list holds one entry and may report it clean.
    expect(safetyViolations(["_probe_ovl"], planted)).toHaveLength(1);
  });

  test("PLANT: a volatile overload in ANY position condemns the name", () => {
    // no-premise: the catalog rows are literals built in the test; nothing environmental is read.
    //
    // Position matters: a fix that reads `rows[0]` passes the first case and fails the second.
    const first = buildCatalog([
      { proname: "f", provolatile: "v", identity: "a integer" },
      { proname: "f", provolatile: "s", identity: "a integer, b integer" },
    ]);
    const last = buildCatalog([
      { proname: "f", provolatile: "s", identity: "a integer" },
      { proname: "f", provolatile: "v", identity: "a integer, b integer" },
    ]);
    expect(safetyViolations(["f"], first)).toHaveLength(1);
    expect(safetyViolations(["f"], last)).toHaveLength(1);

    // And the completeness mirror: a name with any volatile overload is already unretryable, so
    // it owes no entry in the set and must not be reported as a gap.
    expect(completenessViolations(new Set(["f"]), last, new Set(), new Map())).toEqual([]);
    // While an all-STABLE name named in the tree still does.
    const allStable = buildCatalog([
      { proname: "f", provolatile: "s", identity: "a integer" },
      { proname: "f", provolatile: "s", identity: "a integer, b integer" },
    ]);
    expect(completenessViolations(new Set(["f"]), allStable, new Set(), new Map())).toHaveLength(1);
  });

  test("PLANT: an exclusion with a blank reason does not excuse a name", () => {
    // no-premise: the catalog row and both maps are literals built in the test.
    //
    // `exclusions.has(name)` accepted an empty string, which is how an exemption gets added with
    // the justification left for later and never written (round-1 review).
    const cat = buildCatalog([{ proname: "f", provolatile: "s", identity: "" }]);
    const literals = new Set(["f"]);
    expect(completenessViolations(literals, cat, new Set(), new Map([["f", "   "]]))).toHaveLength(
      1,
    );
    expect(
      completenessViolations(literals, cat, new Set(), new Map([["f", "a real reason"]])),
    ).toEqual([]);
  });
});

describe("RETRYABLE_RPCS — completeness arm", () => {
  test("every non-VOLATILE name in the product tree is retryable or excluded", () => {
    premise("literals walked out of the product tree", literalsInProductTree().size, 0);
    expect(
      completenessViolations(literalsInProductTree(), catalog, RETRYABLE_RPCS, EXCLUSIONS),
    ).toEqual([]);
  });

  test("PLANT: removing a member from the set fails the arm", () => {
    const shrunk = new Set(RETRYABLE_RPCS);
    const dropped = [...RETRYABLE_RPCS].find((n) => literalsInProductTree().has(n));
    premise("a member is named in the product tree", dropped === undefined ? 0 : 1, 0);
    shrunk.delete(dropped!);
    expect(
      completenessViolations(literalsInProductTree(), catalog, shrunk, EXCLUSIONS).length,
    ).toBeGreaterThan(0);
  });
});
