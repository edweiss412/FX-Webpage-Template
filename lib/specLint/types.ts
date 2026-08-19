export type Severity = "fail" | "advisory";
export type Check =
  | "document"
  | "citations"
  | "numerics"
  | "copy"
  | "sections"
  | "taskContract"
  | "universals";
export interface Finding {
  check: Check;
  code: string;
  severity: Severity;
  docLine: number; // 1-based; whole-doc findings use 1
  column: number; // 1-based UTF-16 code-unit offset; whole-doc findings use 1
  message: string;
  detail?: string;
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
