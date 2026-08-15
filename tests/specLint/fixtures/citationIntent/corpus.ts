/**
 * Ground-truth corpus for the citation-intent arm (spec §6, plan "Ground-truth
 * tier table").
 *
 * A structure-preserving distillation of the measured sync-log corpus: for each
 * classifiable wrong citation of the known-bad plan, a fixture cited-file that
 * reproduces the WINDOW / ENCLOSING / FILE-PRESENCE structure the measurement
 * found, at small line numbers so the fixture is stable forever (live-code
 * citations drift — governing spec §8).
 *
 * `expect` is the ORACLE and comes from the plan's committed tier table, keyed
 * by the known-bad plan's `docLine:anchor`. The fixture is constructed to
 * realize the table, never the other way around: a fixture whose structure
 * disagrees with its declared tier is the defect this file exists to prevent.
 */

export type RowKind =
  /** One of the 17 classifiable wrong citations; must fire at its stated tier. */
  | "wrong"
  /** Vocabulary-sharing sibling: undetectable by content (spec §1.1 item 2, §8 item 1). */
  | "escape"
  /** Correct citation of the merged plan: must stay clean. */
  | "negative"
  /** Correct citation naming code the plan introduces (spec §8 item 2). */
  | "future";

export interface CorpusRow {
  /** `docLine:anchor` of the known-bad plan (commit 225d37fa4^). */
  key: string;
  kind: RowKind;
  expect: "unmatched" | "absent" | "silent";
  ids: string[];
  citedPath: string;
  citedStart: number;
  citedEnd?: number;
  /** Lines of the fixture cited file. */
  file: string[];
  note: string;
}

const PAD = "  // padding";

/**
 * A fixture file of `length` padding lines, with an optional declaration on
 * line 1 and explicit content at named 1-based lines.
 */
function fileLines(spec: { length: number; decl?: string; at?: Record<number, string> }): string[] {
  const lines = Array.from({ length: spec.length }, () => PAD);
  if (spec.decl !== undefined) lines[0] = spec.decl;
  for (const [lineNo, text] of Object.entries(spec.at ?? {})) lines[Number(lineNo) - 1] = text;
  return lines;
}

const WRONG_LIB = "lib/sync/runScheduledCronSync.ts";
const WRONG_TEST = "tests/db/_metaDestructiveDbTargetGuard.test.ts";
const WRONG_SPEC = "tests/sync/runScheduledCronSync.test.ts";
const WRONG_SQL = "supabase/migrations/20260629000002_app_events.sql";
const CRON_DECL = "export async function runScheduledCronSync(deps) {";

export const CORPUS: CorpusRow[] = [
  // ---- UNMATCHED: the ids live elsewhere in the wrong file (10 rows) --------
  {
    key: "221:740",
    kind: "wrong",
    expect: "unmatched",
    ids: ["scanPreparedFileWithTx", "recordLiveRowConflict", "file.driveFileId"],
    citedPath: WRONG_LIB,
    citedStart: 12,
    file: fileLines({
      length: 30,
      decl: CRON_DECL,
      at: { 28: "  scanPreparedFileWithTx(tx, prepared);" },
    }),
    note: "sites-list row belonging to runOnboardingScan.ts",
  },
  {
    key: "221:826",
    kind: "wrong",
    expect: "unmatched",
    ids: ["scanPreparedFileWithTx", "recordLiveRowConflict", "file.driveFileId"],
    citedPath: WRONG_LIB,
    citedStart: 14,
    file: fileLines({
      length: 30,
      decl: CRON_DECL,
      at: { 30: "  recordLiveRowConflict(row);" },
    }),
    note: "sites-list row belonging to runOnboardingScan.ts",
  },
  {
    key: "221:842",
    kind: "wrong",
    expect: "unmatched",
    ids: ["scanPreparedFileWithTx", "recordLiveRowConflict", "file.driveFileId"],
    citedPath: WRONG_LIB,
    citedStart: 16,
    file: fileLines({
      length: 30,
      decl: CRON_DECL,
      at: { 30: "  const id = file.driveFileId;" },
    }),
    note: "sites-list row belonging to runOnboardingScan.ts",
  },
  {
    key: "221:863",
    kind: "wrong",
    expect: "unmatched",
    ids: ["scanPreparedFileWithTx"],
    citedPath: WRONG_LIB,
    citedStart: 12,
    file: fileLines({
      length: 30,
      decl: CRON_DECL,
      at: { 25: "  await scanPreparedFileWithTx(tx, prepared);" },
    }),
    note: "sites-list row belonging to runOnboardingScan.ts",
  },
  {
    key: "221:896",
    kind: "wrong",
    expect: "unmatched",
    ids: ["recordLiveRowConflict"],
    citedPath: WRONG_LIB,
    citedStart: 18,
    file: fileLines({
      length: 30,
      decl: CRON_DECL,
      at: { 26: "  recordLiveRowConflict(row);" },
    }),
    note: "sites-list row belonging to runOnboardingScan.ts",
  },
  {
    key: "221:922",
    kind: "wrong",
    expect: "unmatched",
    ids: ["file.driveFileId"],
    citedPath: WRONG_LIB,
    citedStart: 20,
    file: fileLines({
      length: 30,
      decl: CRON_DECL,
      at: { 30: "  log({ driveFileId: file.driveFileId });" },
    }),
    note: "sites-list row belonging to runOnboardingScan.ts",
  },
  {
    key: "221:1019",
    kind: "wrong",
    expect: "unmatched",
    ids: ["scanPreparedFileWithTx", "file.driveFileId"],
    citedPath: WRONG_LIB,
    citedStart: 22,
    file: fileLines({
      length: 30,
      decl: CRON_DECL,
      at: { 29: "  scanPreparedFileWithTx(tx, file.driveFileId);" },
    }),
    note: "do-not-touch row belonging to runManualStageForFirstSeen.ts",
  },
  {
    key: "229:147",
    kind: "wrong",
    expect: "unmatched",
    ids: ["runManualStageForFirstSeen", "runManualSyncForShow", "runOne"],
    citedPath: WRONG_LIB,
    citedStart: 12,
    file: fileLines({ length: 30, decl: CRON_DECL, at: { 30: "  await runOne(show);" } }),
    note: "sole-emission row belonging to runManualStageForFirstSeen.ts",
  },
  {
    key: "317:60-62",
    kind: "wrong",
    expect: "unmatched",
    ids: ["test.each"],
    citedPath: WRONG_SPEC,
    citedStart: 12,
    citedEnd: 14,
    file: fileLines({
      length: 30,
      decl: "describe('cron sync', () => {",
      at: { 30: "  test.each(rows)('%s', () => {});" },
    }),
    note: "range citation whose subject lives in the sibling suite",
  },
  {
    key: "329:42-43",
    kind: "wrong",
    expect: "unmatched",
    ids: ["CALLS_LOCAL_GUARD", "postgres", "assertLocalDbUrl"],
    citedPath: WRONG_TEST,
    citedStart: 12,
    citedEnd: 13,
    file: fileLines({
      length: 30,
      decl: "const OTHER_CONSTANT = 1;",
      at: { 28: "const CALLS_LOCAL_GUARD = ['assertLocalDbUrl'];" },
    }),
    note: "one of the eight rows the R1 repair mis-moved",
  },

  // ---- ABSENT: no id appears anywhere in the wrong file (5 rows) -----------
  {
    key: "223:1134",
    kind: "wrong",
    expect: "absent",
    ids: ["RUN_LEVEL_SYNC_LOG_SITES"],
    citedPath: WRONG_LIB,
    citedStart: 12,
    file: fileLines({ length: 30, decl: CRON_DECL }),
    note: "constant that lives in the manual-stage module",
  },
  {
    key: "309:53-64",
    kind: "wrong",
    expect: "absent",
    ids: ["sync_log_prune"],
    citedPath: WRONG_SQL,
    citedStart: 12,
    citedEnd: 16,
    file: fileLines({ length: 30, decl: "create table app_events (" }),
    note: "migration row belonging to a different migration file",
  },
  {
    key: "319:35",
    kind: "wrong",
    expect: "absent",
    ids: ["EXECUTES_WIPE", "ENABLES_WIPE_GATE"],
    citedPath: WRONG_LIB,
    citedStart: 12,
    file: fileLines({ length: 30, decl: CRON_DECL }),
    note: "guard constant belonging to the destructive-target meta-test",
  },
  {
    key: "319:39-41",
    kind: "wrong",
    expect: "absent",
    ids: ["EXECUTES_WIPE", "ENABLES_WIPE_GATE"],
    citedPath: WRONG_LIB,
    citedStart: 14,
    citedEnd: 16,
    file: fileLines({ length: 30, decl: CRON_DECL }),
    note: "guard constant belonging to the destructive-target meta-test",
  },
  {
    key: "319:60-62",
    kind: "wrong",
    expect: "absent",
    ids: ["EXECUTES_WIPE", "ENABLES_WIPE_GATE"],
    citedPath: WRONG_LIB,
    citedStart: 20,
    citedEnd: 22,
    file: fileLines({ length: 30, decl: CRON_DECL }),
    note: "guard constant belonging to the destructive-target meta-test",
  },

  // ---- ESCAPES: vocabulary-sharing sibling, undetectable by content --------
  {
    key: "221:719",
    kind: "escape",
    expect: "silent",
    ids: ["scanPreparedFileWithTx"],
    citedPath: "lib/sync/runManualSyncForShow.ts",
    citedStart: 12,
    file: fileLines({
      length: 30,
      decl: "export async function runManualSyncForShow(deps) {",
      at: { 10: "  await scanPreparedFileWithTx(tx, prepared);" },
    }),
    note: "the wrong file genuinely calls the named helper within the window",
  },
  {
    key: "221:1001",
    kind: "escape",
    expect: "silent",
    ids: ["file.driveFileId"],
    citedPath: "lib/sync/runOnboardingScan.ts",
    citedStart: 12,
    file: fileLines({
      length: 30,
      decl: "export async function runOnboardingScan(deps) {",
      at: { 15: "  const id = file.driveFileId;" },
    }),
    note: "shared vocabulary puts a boundary hit inside the window of the wrong file",
  },

  // ---- NEGATIVES: correct citations of the merged plan --------------------
  {
    key: "final:logSync",
    kind: "negative",
    expect: "silent",
    ids: ["logSync"],
    citedPath: WRONG_LIB,
    citedStart: 12,
    file: fileLines({ length: 30, decl: CRON_DECL, at: { 12: "  await logSync(entry);" } }),
    note: "window hit on the cited line itself",
  },
  {
    key: "final:SyncLogDeps.logSync",
    kind: "negative",
    expect: "silent",
    ids: ["SyncLogDeps.logSync"],
    citedPath: WRONG_LIB,
    citedStart: 12,
    file: fileLines({ length: 30, decl: CRON_DECL, at: { 13: "interface SyncLogDeps {" } }),
    note: "dotted id matched by its head segment — naive substring never matches the literal",
  },
  {
    key: "final:enclosing",
    kind: "negative",
    expect: "silent",
    ids: ["runScheduledCronSync"],
    citedPath: WRONG_LIB,
    citedStart: 25,
    file: fileLines({ length: 30, decl: CRON_DECL }),
    note: "enclosing-declaration rescue: the decl sits far above the window",
  },
  {
    key: "final:sql-enclosing",
    kind: "negative",
    expect: "silent",
    ids: ["app_events"],
    citedPath: WRONG_SQL,
    citedStart: 20,
    file: fileLines({ length: 30, decl: "create table app_events (" }),
    note: "SQL enclosing shape rescues a citation deep inside a long DDL statement",
  },

  // ---- FUTURE CODE: correct, but names code the plan introduces -----------
  {
    key: "final:durationMs",
    kind: "future",
    expect: "absent",
    ids: ["durationMs"],
    citedPath: WRONG_LIB,
    citedStart: 12,
    file: fileLines({ length: 30, decl: CRON_DECL }),
    note: "the measured 15-of-135 floor: the field does not exist yet",
  },
  {
    key: "final:syncLogDurationMs",
    kind: "future",
    expect: "absent",
    ids: ["syncLogDurationMs"],
    citedPath: WRONG_LIB,
    citedStart: 20,
    file: fileLines({ length: 30, decl: CRON_DECL }),
    note: "second future-code row, cited at a different line of the same file",
  },
];
