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
import type { AcBlocks, AcTableBlock, Finding } from "./types";

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

/** Task 3 lands declaration discovery; the cell checks are Tasks 5 and 6. */
export function checkAcCoverage(blocks: AcBlocks, kind: "spec" | "plan"): Finding[] {
  return readDeclaredTables(blocks, kind).findings;
}
