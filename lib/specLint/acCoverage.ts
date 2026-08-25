/**
 * The AC coverage arm (`docs/superpowers/specs/ci/2026-08-25-planlint-ac-command-observability-design.md`).
 *
 * A plan opts ONE table in with `<!-- ac-coverage: command-col=N -->`. In a
 * declared table the arm asserts, hard, that each data row's command cell carries
 * commands and that every one of them parses, and advises when a row cites an
 * executable pin under `tests/` the command cannot reach.
 *
 * It recognizes nothing in open English AND no markdown grammar: remark parses,
 * the adapter injects the view, and this module reads it (spec §8.3).
 *
 * Pure: no `node:` imports and no third-party imports
 * (pinned by tests/specLint/_metaPureCore.test.ts).
 */
import type { AcBlocks, AcParseResults, AcRow, AcTableBlock, Finding } from "./types";
import { acKey } from "./types";

const DECL_ANY = /^ {0,3}<!-- ac-coverage:/;
const DECL = /^ {0,3}<!-- ac-coverage: command-col=([1-9][0-9]*) -->[ \t]*$/;

const finding = (
  severity: "fail" | "advisory",
  code: string,
  docLine: number,
  message: string,
  detail?: string,
): Finding => ({
  check: "acCoverage",
  code,
  severity,
  docLine,
  column: 1,
  message,
  ...(detail === undefined ? {} : { detail }),
});

/**
 * A span carries a command only if it is neither blank nor comment-only.
 *
 * `sh -nc -- '# anything'` exits 0, so parseability alone accepts a cell holding
 * no command at all (spec round-3 finding 1). This is the decidable part of L-1;
 * whether a syntactically valid span is THE producing command is not.
 */
export function carriesCommand(span: string): boolean {
  const s = span.trim();
  return s !== "" && !s.startsWith("#");
}

/**
 * EVERY command-carrying span in the row's command cell, in document order.
 *
 * Every, not the first: one fixture row carries three producing commands, and a
 * first-span rule accepts a broken second one (spec round-1 finding 1).
 */
export function commandSpansOf(row: AcRow, commandCol: number): string[] {
  return (row.cells[commandCol - 1]?.codes ?? []).filter(carriesCommand);
}

export interface DeclaredTable {
  declLine: number;
  commandCol: number;
  table: AcTableBlock;
}

/**
 * Declarations and the tables they govern.
 *
 * A declaration governs the next `table` block PROVIDED no other declaration lies
 * between them. Without the proviso two consecutive declarations both bind to one
 * table and check it against contradictory columns (self-found by probe, spec §8.1).
 */
export function readDeclaredTables(
  blocks: AcBlocks,
  kind: "spec" | "plan",
): { tables: DeclaredTable[]; findings: Finding[] } {
  const tables: DeclaredTable[] = [];
  const findings: Finding[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.kind !== "html" || !DECL_ANY.test(b.value.trim())) continue;
    const m = DECL.exec(b.value.trim());
    if (!m) {
      findings.push(
        finding(
          "fail",
          "AC_COVERAGE_MALFORMED",
          b.line,
          "declaration does not match `<!-- ac-coverage: command-col=N -->` exactly",
        ),
      );
      continue;
    }
    if (kind !== "plan") {
      findings.push(
        finding(
          "advisory",
          "AC_COVERAGE_NOT_A_PLAN",
          b.line,
          "the AC coverage arm runs on plan-kind documents only, so this declaration is read by nothing",
        ),
      );
      continue;
    }
    let governed: AcTableBlock | null = null;
    for (let j = i + 1; j < blocks.length; j++) {
      const n = blocks[j]!;
      if (n.kind === "html" && DECL_ANY.test(n.value.trim())) break; // a later declaration claims it
      if (n.kind === "table") {
        governed = n;
        break;
      }
    }
    if (governed === null) {
      findings.push(
        finding(
          "fail",
          "AC_COVERAGE_NO_TABLE",
          b.line,
          "no table follows this declaration before the next one",
        ),
      );
      continue;
    }
    const commandCol = Number(m[1]);
    if (commandCol > governed.header.length) {
      findings.push(
        finding(
          "fail",
          "AC_COVERAGE_COL_OUT_OF_RANGE",
          b.line,
          `command-col=${commandCol} exceeds the table's ${governed.header.length} columns`,
        ),
      );
      continue;
    }
    if (governed.rows.length === 0) {
      findings.push(
        finding(
          "advisory",
          "AC_COVERAGE_EMPTY_TABLE",
          b.line,
          "declared table has no data rows, so the declaration checks nothing",
        ),
      );
    }
    tables.push({ declLine: b.line, commandCol, table: governed });
  }
  return { tables, findings };
}

export interface AcCommandEntry {
  line: number;
  spanIndex: number;
  command: string;
}

/**
 * Entries for the adapter's parse-check spawn. One per command-carrying span,
 * keyed by `(line, spanIndex)`.
 *
 * NOT `ParseCheckEntry`, and NOT the shared line-keyed `ExecResults`: an AC row
 * contributes one entry per span, so a line-keyed store keeps only the last and
 * silently accepts a broken FIRST command (spec round-2 finding 2).
 */
export function acCommandPlan(blocks: AcBlocks, kind: "spec" | "plan"): AcCommandEntry[] {
  const out: AcCommandEntry[] = [];
  for (const { commandCol, table } of readDeclaredTables(blocks, kind).tables) {
    for (const row of table.rows) {
      // A short row is reported by `checkAcCoverage`; it contributes no spawn, so
      // no key is ever built from a cell that does not exist.
      if (row.cells.length < commandCol) continue;
      commandSpansOf(row, commandCol).forEach((command, spanIndex) => {
        out.push({ line: row.line, spanIndex, command });
      });
    }
  }
  return out.sort((a, b) => a.line - b.line || a.spanIndex - b.spanIndex);
}

/**
 * The arm. `parse` is null on the static invocation, the same static/injected
 * split the red arm uses: no spawns, so no `AC_COMMAND_UNPARSABLE`, and every
 * other code still reports.
 */
export function checkAcCoverage(
  blocks: AcBlocks,
  kind: "spec" | "plan",
  parse: AcParseResults | null = null,
): Finding[] {
  const { tables, findings } = readDeclaredTables(blocks, kind);
  for (const { commandCol, table } of tables) {
    for (const row of table.rows) {
      if (row.cells.length < commandCol) {
        findings.push(
          finding(
            "fail",
            "AC_COVERAGE_COL_OUT_OF_RANGE",
            row.line,
            `row has ${row.cells.length} cells; command-col=${commandCol}`,
          ),
        );
        continue;
      }
      const spans = commandSpansOf(row, commandCol);
      if (spans.length === 0) {
        findings.push(
          finding(
            "fail",
            "AC_COMMAND_CELL_NOT_RUNNABLE",
            row.line,
            "command cell carries no command",
            `cell: ${row.cells[commandCol - 1]!.text.trim()}`,
          ),
        );
        continue;
      }
      // EVERY span, each judged under its OWN key, so an earlier failure cannot
      // be overwritten by a later success.
      spans.forEach((command, spanIndex) => {
        const outcome = parse?.outcomes.get(acKey(row.line, spanIndex));
        if (outcome !== undefined && outcome.exit !== 0) {
          findings.push(
            finding(
              "fail",
              "AC_COMMAND_UNPARSABLE",
              row.line,
              "command is not parseable by the executing shell",
              `command: ${command}`,
            ),
          );
        }
      });
    }
  }
  return findings;
}
