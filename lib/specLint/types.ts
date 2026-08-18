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
