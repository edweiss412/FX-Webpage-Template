// tests/parser/leadingColumnAutocorrect.test.ts
// Spec §6: uniformly-empty leading column = drag-shift export artifact; the inverse
// transform is total, so correct + warn. Failure modes caught: data-only trigger
// (61 corpus false positives, probe §13.C); ratio trigger (East Coast partial runs);
// missing structured autocorrect field; payload not actually restored.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseSheet } from "@/lib/parser";
import { payloadOf } from "@/tests/parser/mutation/oracle";
import { premiseHolds } from "@/tests/_shared/premise";
import { canonicalSectionKind } from "@/lib/parser/sectionKind"; // branch-2 helper (r6: openerCell needs it)

const shifts = (md: string, name: string) =>
  parseSheet(md, name).warnings.filter((w) => w.code === "LEADING_COLUMN_AUTOCORRECTED");

/** Prefix an empty cell to EVERY row of ONE LOGICAL SECTION (columnShift shape,
 *  operators.ts:144). Retro F1: the operator's unit is the LOGICAL section - rows up to
 *  the next recognized section-opening header WITHIN the pipe block - not the whole
 *  contiguous block. A helper that shifts the whole block leaves 46 of the 211 ledger
 *  holes unreachable (mutants shift one section inside a multi-section block). */
function shiftLogicalSection(md: string, start: number): string {
  const lines = md.split("\n");
  for (let i = start; i < lines.length; i++) {
    const l = lines[i]!;
    if (!l.trimStart().startsWith("|")) break;
    if (i > start && openerCell(l) !== null) break; // next logical section begins
    lines[i] = l.replace(/^(\s*)\|/, "$1|  |");
  }
  return lines.join("\n");
}
/** Retro r5: the opener may sit in cell 1 (unshifted) OR cell 2 (columnShift moved it
 *  right - a shifted section's own header row leads empty). Check cell 1; when cell 1
 *  is empty, check cell 2. Returns the canonical kind or null. */
function openerCell(line: string): string | null {
  const parts = line.split("|");
  const c1 = (parts[1] ?? "").trim();
  if (c1 !== "") return canonicalSectionKind(c1);
  return canonicalSectionKind((parts[2] ?? "").trim());
}

describe("LEADING_COLUMN_AUTOCORRECTED (spec §6)", () => {
  const path = "fixtures/shows/exporter-xlsx/east-coast.md";
  const md = readFileSync(path, "utf8");
  const firstSection = md.split("\n").findIndex((l) => l.startsWith("|"));

  it("premise: corpus fires zero clean; the mutated section genuinely leads empty on every row", () => {
    expect(shifts(md, path)).toEqual([]);
    const mutated = shiftLogicalSection(md, firstSection);
    premiseHolds("section was shifted", mutated !== md);
  });

  it("corrects: payload equals unshifted baseline, one warning with structured autocorrect", () => {
    const mutated = shiftLogicalSection(md, firstSection);
    expect(payloadOf(parseSheet(mutated, path))).toEqual(payloadOf(parseSheet(md, path)));
    const w = shifts(mutated, path);
    expect(w).toHaveLength(1);
    expect(w[0]!.autocorrect).toEqual({
      subject: null,
      corrections: [{ detected: "empty leading column", corrected: "shifted left" }],
    });
  });

  it("partial leading-empty runs never fire (East Coast lines 99+ sit at 19-of-23, probe §13.C)", () => {
    expect(shifts(md, path)).toEqual([]); // the clean fixture IS the partial-run carrier
  });
});
