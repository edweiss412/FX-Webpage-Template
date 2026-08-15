/**
 * tests/db/_metaDestructiveDbTargetGuard.test.ts
 *
 * Structural guard for the whole-database wipe surface.
 *
 * `public.reset_validation_data()` DELETEs every row in `public.shows` (and its
 * cascade children). In this repo `TEST_DATABASE_URL` is DELIBERATELY the
 * validation project — see scripts/preflight-env.mjs:97 and AGENTS.md — so any
 * test that executes the wipe, or flips `destructive_reset_gate` to enabled,
 * MUST assert a loopback target BEFORE it connects. Without that assert a plain
 * `pnpm test` in any worktree wipes live validation: the cron sync then
 * re-ingests all shows from Drive as brand-new rows, which re-triggers the
 * auto-publish undo email for every show (observed 2026-07-23, four batches).
 *
 * RELATIONSHIP TO tests/db/_metaLocalDbUrlGuard.test.ts: that meta-test guards a
 * DIFFERENT axis — every file that READS LOCAL_TEST_DATABASE_URL must route it
 * through assertLocalDbUrl. It cannot see these files, because a wipe test that
 * resolves from TEST_DATABASE_URL never reads the variable it scans for, which is
 * exactly how the four whole-wipe suites survived the 2026-07-24 sweep
 * (spec 2026-07-24-test-safety-hardening-batch.md §2.6) unguarded. This meta-test
 * keys on the DESTRUCTIVE OPERATION instead, so a new wipe suite fails by default
 * no matter which variable it reads. Both use the one shared assert in
 * tests/db/_localDbUrl.ts; there is deliberately no second implementation.
 *
 * Discovery is filesystem-walked, not a hardcoded file list: a NEW test that
 * executes the wipe is caught without anyone remembering to register it.
 */
import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { analyseDestructiveFile } from "./_destructiveFileAnalysis";
import { DESTRUCTIVE_STATEMENT_PATTERNS, GUARD_OWN_FILES } from "./_destructiveStatements";
import { stripCommentsForFile, stripSqlComments } from "@/tests/_shared/stripComments";

const TESTS_ROOT = join(process.cwd(), "tests");

/**
 * Discovery's patterns ARE the analyzer's, imported rather than re-declared: the
 * analyzer anchors every recognized destructive statement to a checked execution site,
 * so a second copy here would mean discovery and anchoring range over different sets.
 *
 * **DOCUMENTED LIMIT - discovery is spelling-sensitive, and that is not closed.**
 * These patterns require the schema-qualified, unquoted `public.<name>(` form. An
 * unqualified `select prune_sync_log()` or a quoted `select "public"."prune_sync_log"()`
 * is NOT discovered, so no safety analysis runs on such a file (whole-diff r16). Chasing
 * SQL spellings has the same non-termination as the aliasing enumerations this module's
 * analyzer went through, so it is recorded rather than pursued: the terminating framing
 * is to discover files by the fact that they OPEN A DATABASE CONNECTION, and require the
 * guard of all of them, which removes SQL spelling from the question entirely. That is a
 * cross-cutting change over every DB test in the repo, filed with its census as
 * `BL-DESTRUCTIVE-GUARD-DISCOVERY-BY-CONNECTION`.
 */
const EXECUTES_WIPE = DESTRUCTIVE_STATEMENT_PATTERNS.executesWipe;
const ENABLES_WIPE_GATE = DESTRUCTIVE_STATEMENT_PATTERNS.enablesWipeGate;
const EXECUTES_PRUNE = DESTRUCTIVE_STATEMENT_PATTERNS.executesPrune;

/** The set discovery actually runs, so the identity test below ranges over the real
 *  thing rather than over three names that happen to be spelled the same way. */
const DISCOVERY_PATTERNS: readonly RegExp[] = [EXECUTES_WIPE, ENABLES_WIPE_GATE, EXECUTES_PRUNE];

/** Any of the sanctioned loopback asserts, called (not merely imported).
 *  Retained for the message it powers; the ADMISSION decision now runs through
 *  analyseDestructiveFile, which closes the three holes a name match leaves open. */
const CALLS_LOCAL_GUARD = /\b(?:assertLocalDbUrl|assertSafeDestructiveTarget)\s*\(/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__generated__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|mts|cts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(TESTS_ROOT).map((path) => ({ path, source: readFileSync(path, "utf8") }));

/**
 * Discovery runs on source with COMMENTS STRIPPED. A file that merely NAMES a
 * destructive statement in prose does not execute it, and matching prose makes the
 * guard a false-positive generator — demonstrated on itself: adding EXECUTES_PRUNE
 * flagged tests/cross-cutting/pg-cron-coverage.test.ts, whose only prune mentions are
 * two comments explaining which cron jobs exist. A false positive is not the safe
 * direction here; it pushes authors toward blanket exemptions, which is how the guard
 * stops guarding.
 */
// The naive form of this (regex `//` to end of line) ate the rest of the line from
// INSIDE a string: `const docs = "https://..."` silently removed a real
// `sql.unsafe("select public.prune_sync_log()")` from discovery, un-discovering a
// genuinely unsafe file (whole-diff r1 finding 2). The shared scanner is string-aware.

const destructive = files.filter(({ path, source }) => {
  // JS comments come off first, then SQL comments INSIDE the surviving string
  // literals. whole-diff r15: `select /* note */ public.reset_validation_data()` was
  // not discovered, because stripping JS comments correctly leaves SQL comments in a
  // literal untouched and the regexes never normalized them.
  // UNION of two views, never the SQL-stripped one alone. `stripSqlComments` over a
  // whole TypeScript file treats a JS decrement (`i--`) as a SQL line comment and
  // erases the rest of that line, which can delete a real destructive execution
  // (whole-diff r16, a regression introduced by r15's repair). Matching either view
  // means erasure can only ever ADD a match, never hide one.
  const js = stripCommentsForFile(source, path);
  const sql = stripSqlComments(js);
  const hit = (re: RegExp) => re.test(js) || re.test(sql);
  return DISCOVERY_PATTERNS.some(hit);
});

describe("destructive DB target guard", () => {
  test("discovery runs the analyzer's own recognizer objects, not copies of them", () => {
    // The analyzer anchors every recognized destructive statement to a checked
    // execution site, so it and discovery must range over the SAME set: a pattern one
    // side matches and the other does not is either a file discovered but never
    // anchored within, or a statement anchored in a file nobody discovered.
    //
    // Identity, not equality. Two `toEqual`-equal RegExp objects are exactly the state
    // this test exists to reject — a second copy that drifts on the next edit to one
    // of them.
    const shared = Object.values(DESTRUCTIVE_STATEMENT_PATTERNS);
    expect(DISCOVERY_PATTERNS).toHaveLength(shared.length);
    for (const re of DISCOVERY_PATTERNS) expect(shared).toContain(re);
    // Residual, stated rather than papered over: this pins the objects discovery
    // holds, not the expression that consumes them, so a fourth pattern OR'd inline
    // into the filter would escape it. That direction WIDENS discovery (more files
    // analyzed), which is the conservative one; the dangerous direction — discovery
    // recognizing a spelling the analyzer's Rule 2 does not — is what identity closes.
  });

  test("the guard's own two files are exempted by name, not by coincidence", () => {
    // Anti-vacuity for the exemption itself: if discovery stopped matching these
    // two, the exemption would be dead code and this test would still pass without
    // it. Both are discovered, and both are exempted deliberately.
    const rel = destructive.map((f) => f.path.replace(process.cwd() + "/", ""));
    for (const own of GUARD_OWN_FILES) expect(rel).toContain(own);
  });

  test("discovery matches ordinary SQL spellings, not one canonical shape", () => {
    // whole-diff r15: shape-anchored patterns missed `select * from public.prune_…()`,
    // a parenthesized call, an aliased `update … as g set enabled = true`, and any
    // form carrying an SQL block comment. Keying on the FUNCTION NAME after stripping
    // SQL comments covers the class; these are the spellings that escaped.
    const strip = (sql: string) => stripSqlComments(sql);
    for (const sql of [
      "select * from public.reset_validation_data()",
      "select /* note */ public.reset_validation_data()",
      "select (public.reset_validation_data())",
    ]) {
      expect(EXECUTES_WIPE.test(strip(sql)), sql).toBe(true);
    }
    for (const sql of [
      "select * from public.prune_app_events()",
      "select /* note */ public.prune_sync_log()",
      "select (public.prune_sync_log(interval '60 days'))",
    ]) {
      expect(EXECUTES_PRUNE.test(strip(sql)), sql).toBe(true);
    }
    for (const sql of [
      "update public.destructive_reset_gate as g set enabled = true",
      "update public.destructive_reset_gate /* note */ set enabled = true",
    ]) {
      expect(ENABLES_WIPE_GATE.test(strip(sql)), sql).toBe(true);
    }
  });

  test("the discovery patterns actually match the known wipe surface (anti-vacuity)", () => {
    // If this fails, the regexes drifted and every assertion below is vacuous.
    const rel = destructive.map((f) => f.path.replace(process.cwd() + "/", ""));
    expect(rel).toContain("tests/db/resetValidationDataDriveKeyedAudit.test.ts");
    expect(rel).toContain("tests/db/destructiveResetGate.test.ts");
    // BOTH prune tests, not just the new one. Deleting `|app_events` from
    // EXECUTES_PRUNE would otherwise make an EXISTING unsafe test vanish from
    // discovery while every assertion below still passed - the mutation this
    // guard most needs to fail on.
    expect(rel).toContain("tests/db/syncLogIndexesAndPrune.db.test.ts");
    expect(rel).toContain("tests/log/appEventsSchema.test.ts");
  });

  test.each(destructive.length ? destructive : [{ path: "<none discovered>", source: "" }])(
    "$path asserts a loopback target before wiping",
    ({ path, source }) => {
      if (path === "<none discovered>") return; // covered by the anti-vacuity test above
      const rel = path.replace(process.cwd() + "/", "");
      // The guard's own files carry destructive SQL as FIXTURE TEXT for a pure
      // function. Exempted by NAME (GUARD_OWN_FILES), which is checked before any
      // analysis runs, rather than by an inline-comment regex that these two used to
      // satisfy only because one of them quoted the comment form in a failure message.
      if (GUARD_OWN_FILES.includes(rel)) return;
      const verdict = analyseDestructiveFile(path, source);
      expect(
        verdict.ok,
        `${rel}: ${verdict.ok ? "" : verdict.reason}. ` +
          "A loopback guard must be called on the SAME value that is connected, BEFORE " +
          "the connection opens, and must resolve to the imported guard rather than a " +
          "local same-named function. TEST_DATABASE_URL is the VALIDATION project in " +
          "this repo's .env.local.",
      ).toBe(true);
      expect(
        CALLS_LOCAL_GUARD.test(source),
        `${rel} executes public.reset_validation_data() (or enables destructive_reset_gate) but ` +
          "never calls a loopback assert. TEST_DATABASE_URL is the VALIDATION project in this " +
          "repo's .env.local, so this file wipes live validation on a plain `pnpm test`. Resolve " +
          "the URL from LOCAL_TEST_DATABASE_URL and pass it through assertLocalDbUrl() " +
          "(tests/db/_localDbUrl.ts) before opening the connection. There is no inline " +
          "opt-out: the comment form this message used to offer was deleted with the " +
          "accidental self-exemption it enabled, and the only exemption now is an explicit " +
          "GUARD_OWN_FILES entry in tests/db/_destructiveStatements.ts, which is for the " +
          "guard's own fixture files and needs a reason in review.",
      ).toBe(true);
    },
  );
});
