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
import { stripCommentsForFile, stripSqlComments } from "@/tests/_shared/stripComments";

const TESTS_ROOT = join(process.cwd(), "tests");

/**
 * Executes the whole-DB wipe RPC.
 *
 * Keyed on the FUNCTION NAME, not on a statement shape. r15 showed
 * `select * from public.reset_validation_data()`, a parenthesized form, and an aliased
 * `update … as g set enabled = true` all escaping shape-anchored patterns — the same
 * enumeration failure the analyzer went through, one layer up. A destructive function
 * named in executed code is the signal; how the statement is spelled around it is not
 * something this guard needs to model.
 */
const EXECUTES_WIPE = /\bpublic\.reset_validation_data\s*\(/i;

/** Flips the prod-safety gate ON — the only thing standing between a test run
 *  and a live wipe. */
const ENABLES_WIPE_GATE =
  /destructive_reset_gate\b[\s\S]{0,120}?\benabled\s*=\s*(?:true|\$\{?\s*true)/i;

/** Executes a retention prune. Deletes by time window against whatever DB it is
 *  pointed at, so it is destructive in exactly the sense this guard exists for.
 *  `prune_app_events` is folded in deliberately: identical hazard, no coverage
 *  before 2026-08-09, one alternation to fix. That is the class-sweep default -
 *  repair every instance of the shape in the same PR - rather than filing a peer
 *  for something free to fix here. */
const EXECUTES_PRUNE = /\bpublic\.prune_(?:sync_log|app_events)\s*\(/i;

/** Any of the sanctioned loopback asserts, called (not merely imported).
 *  Retained for the message it powers; the ADMISSION decision now runs through
 *  analyseDestructiveFile, which closes the three holes a name match leaves open. */
const CALLS_LOCAL_GUARD = /\b(?:assertLocalDbUrl|assertSafeDestructiveTarget)\s*\(/;

/** Opt-out for a file that provably cannot reach a remote (documented inline). */
const EXEMPTION = /\/\/\s*not-subject-to-destructive-target-guard:\s*\S+/;

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
  const code = stripSqlComments(stripCommentsForFile(source, path));
  return EXECUTES_WIPE.test(code) || ENABLES_WIPE_GATE.test(code) || EXECUTES_PRUNE.test(code);
});

describe("destructive DB target guard", () => {
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
      if (EXEMPTION.test(source)) return;
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
          "(tests/db/_localDbUrl.ts) before opening the connection, or add an inline " +
          "`// not-subject-to-destructive-target-guard: <reason>` with a verified reason.",
      ).toBe(true);
    },
  );
});
