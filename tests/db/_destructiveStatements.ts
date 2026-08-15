/**
 * tests/db/_destructiveStatements.ts
 *
 * The two constants the destructive-file guard shares between its ANALYZER
 * (`_destructiveFileAnalysis.ts`, which anchors recognized statements to checked
 * execution sites) and its DISCOVERY walk (`_metaDestructiveDbTargetGuard.test.ts`,
 * which decides which files are analyzed at all). One home, because two copies is a
 * drift neither side can see.
 */
/**
 * The destructive-statement recognizer, owned here and imported by BOTH the analyzer and the
 * meta-test's discovery walk: Rule 2 anchors recognized statements to checked executions, so the two
 * must range over the same set or discovery finds a file nothing anchors within — or the
 * reverse. Keyed on the FUNCTION NAME, not a statement shape (whole-diff r15).
 */
export const DESTRUCTIVE_STATEMENT_PATTERNS = {
  /** Executes the whole-DB wipe RPC. */
  executesWipe: /\bpublic\.reset_validation_data\s*\(/i,
  /** Flips the prod-safety gate ON - the only thing between a test run and a live wipe. */
  enablesWipeGate: /destructive_reset_gate\b[\s\S]{0,120}?\benabled\s*=\s*(?:true|\$\{?\s*true)/i,
  /** Executes a retention prune: deletes by time window against whatever DB it hits. */
  executesPrune: /\bpublic\.prune_(?:sync_log|app_events)\s*\(/i,
} as const;

/**
 * The guard's own two files, exempted BY NAME rather than by accident. Both quote
 * destructive SQL as FIXTURE TEXT for a pure function; neither imports the driver, opens
 * a connection, or reads a database URL. Before this list they were exempt only because
 * one of them quoted the inline-exemption comment form inside a failure MESSAGE — an
 * exemption that holds by coincidence is one unrelated-looking edit from not holding.
 */
export const GUARD_OWN_FILES: readonly string[] = [
  "tests/db/_metaDestructiveDbTargetGuard.test.ts",
  "tests/db/destructiveFileAnalysis.test.ts",
];
