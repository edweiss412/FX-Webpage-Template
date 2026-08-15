export type Severity = "fail" | "advisory";
export type Check = "document" | "citations" | "numerics" | "copy" | "sections" | "taskContract";
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
