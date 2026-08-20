export type Severity = "fail" | "advisory";
export type Check =
  | "document"
  | "citations"
  | "numerics"
  | "copy"
  | "sections"
  | "taskContract"
  | "universals"
  | "claimSweep";
export interface Finding {
  check: Check;
  code: string;
  severity: Severity;
  docLine: number; // 1-based; whole-doc findings use 1
  column: number; // 1-based UTF-16 code-unit offset; whole-doc findings use 1
  message: string;
  detail?: string;
  /**
   * The SWEPT document this finding is about; absent = the linted document.
   *
   * Only the claim sweep sets it: that arm reports over a DECLARED set of
   * documents (spec §3.3) while every other arm reports over the one document
   * `spec:lint` was given, so `LintResult.doc` identifies those and this field
   * would be noise on them.
   */
  docPath?: string;
  /**
   * The declared token this finding is about — the superseded value, or the
   * changed-claim identifier. Part of the claim sweep's finding IDENTITY,
   * `(code, docPath, docLine, column, token)`, which is why it is a field
   * rather than only a substring of `message`.
   */
  token?: string;
}
export interface InventoryOccurrence {
  docLine: number;
  column: number;
  snippet: string;
}
export interface InventoryGroup {
  raw: string;
  occurrences: InventoryOccurrence[];
}
export interface LintDoc {
  text: string;
  repoRelPath: string;
  kind: "spec" | "plan";
  kindSource: "inferred" | "explicit";
}
export interface LintResult {
  doc: string;
  kind: "spec" | "plan";
  kindSource: "inferred" | "explicit";
  findings: Finding[];
  inventory: InventoryGroup[];
}
export interface FileResolver {
  /** null = tracked but unreadable OR tracked symlink (spec §7); throw = infra fault (adapter exits 2) */
  readFileLines(path: string): string[] | null;
  listTrackedFiles(): string[];
}

/**
 * One document in the claim sweep's DECLARED swept set (claim-sweep spec §3.3).
 *
 * Lives here with `ExecResults`, `ParseResults` and `FixtureResults` because it
 * is the same kind of thing: data the ADAPTER resolves and INJECTS, so that no
 * filesystem or git type crosses the purity boundary.
 */
export interface SweepDocument {
  /** Repo-relative path, used verbatim in the finding's identity and message. */
  path: string;
  /** null = declared but unreadable. It was NOT swept, and silence is not a clean. */
  lines: string[] | null;
}

/**
 * The repair, DECLARED by the author and never inferred from a diff
 * (claim-sweep spec §3.0).
 *
 * The incident commit changes many numeric literals and carries `58` on BOTH
 * sides of its own diff, so no rule over that diff selects the semantic pair
 * deterministically. The numeric half therefore takes a superseded/replacement
 * PAIR and the named half takes a changed-claim IDENTIFIER — different shapes,
 * because they are different facts: a repair that re-classifies a site changes
 * the CLAIM about a stable identifier, and the identifier itself has no
 * replacement.
 */
export interface RepairRecord {
  /** The superseded numeric literal, or null when no numeric pair was declared. */
  superseded: string | null;
  /** Its replacement. Null iff `superseded` is null. */
  replacement: string | null;
  /** An identifier whose claim the author says the repair changed, or null. */
  claimAbout: string | null;
  /**
   * Repo-relative path -> the 1-based lines the repair's hunks added or
   * changed. Consumed by the NAMED half only: the numeric half is deliberately
   * blind to diff status, because the incident's sharpest survivor is an ADDED
   * line inside the repair's own hunk.
   */
  touchedLines: ReadonlyMap<string, ReadonlySet<number>>;
}

/**
 * What the adapter hands the claim sweep: the resolved swept set and the
 * declared repair. Absent/null = nothing was declared and the arm runs nothing.
 */
export interface ClaimSweepInput {
  documents: readonly SweepDocument[];
  record: RepairRecord;
}

/**
 * A `red=` command's observed outcome (arms spec §4.4). Classification is
 * error-first and lives in the ADAPTER; the core only ever receives this token,
 * so no runner type crosses the purity boundary.
 */
export type ExecOutcome =
  | { kind: "exit"; code: number }
  | { kind: "timeout" }
  | { kind: "signal"; signal: string }
  | { kind: "spawn-error"; message: string };

export interface ExecResults {
  /** key = marker line. */
  outcomes: ReadonlyMap<number, ExecOutcome>;
  /** key = marker line; already trimmed to 200 characters by the adapter. */
  stderrTails: ReadonlyMap<number, string>;
}

/**
 * Parse-capability outcomes (verdict-capability spec §3), keyed by the marker
 * or gate line the command came from. Identical shape to `ExecResults` and
 * deliberately the same union: an `sh -nc` spawn can fail in exactly the ways
 * an `sh -c` spawn can, and a second copy of the union is a second chance for
 * the two classifications to disagree. Keying by line is unambiguous because a
 * marker and a gate can never share one.
 */
export type ParseResults = ExecResults;

/**
 * Collection-probe outcomes (verdict-capability spec §5.2), keyed by marker
 * line. Unlike a red execution, a probe's STDOUT is the observation — `vitest
 * list` prints one line per collected test — so the adapter captures it here
 * while red-command stdout stays discarded.
 */
export interface ProbeResults {
  outcomes: ReadonlyMap<number, ExecOutcome>;
  /** key = marker line; the probe's captured stdout, verbatim. */
  stdout: ReadonlyMap<number, string>;
  /** key = marker line; already trimmed to 200 characters by the adapter. */
  stderrTails: ReadonlyMap<number, string>;
}

/**
 * One spliced block's outcome, as the vitest JSON reporter described it
 * (fixture spec §4.3). The adapter reads the report and flattens it to this;
 * no runner or filesystem type crosses the purity boundary.
 *
 * Both failure CHANNELS are carried, and that is load-bearing rather than
 * belt-and-braces: a premise that fails at MODULE scope throws during
 * collection, so the file registers no test case and its message arrives at
 * FILE level and nowhere else (spec §2.9). An adapter forwarding only
 * `failureMessages` loses exactly the shape this arm exists to catch.
 *
 * `assertions` carries each test case's own status because a REPORTED
 * assertion is not an EXECUTED one (spec §2.5): a skipped body occupies an
 * entry while never running. The ladder never reads it as a certificate; it is
 * here so that an implementation which does can be caught.
 */
export interface FixtureOutcome {
  /** The reporter's file-level status, verbatim. */
  fileStatus: string;
  assertions: readonly { status: string; title: string }[];
  /** Every failing assertion's messages for this file, flattened. */
  failureMessages: readonly string[];
  /** The reporter's file-level message; "" when it carries none. */
  fileMessage: string;
}

export interface FixtureResults {
  /** key = marker line. A block absent from this map has no result. */
  files: ReadonlyMap<number, FixtureOutcome>;
  /**
   * Set by the adapter when NO report could be read at all — a pre-existing
   * splice directory, a spawn that threw, timed out or was signalled,
   * unreadable JSON. Every enrolled block then draws the advisory naming this
   * reason, which is the report's absence stated rather than inferred.
   */
  unavailable?: string;
}
