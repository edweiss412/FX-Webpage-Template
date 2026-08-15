# Branch 4: feat/mutation-column-shift — LEADING_COLUMN_AUTOCORRECTED

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Read [00-overview.md](./00-overview.md) first — Stage 0 (worktree, claim `BL-MUTATION-COLUMN-SHIFT`, marker, push) precedes Task 1. Branches 1-3 merged.

**Goal:** When EVERY row a section owns (header AND alignment included) leads with an empty cell, shift the grid one column left before block parsing and emit `LEADING_COLUMN_AUTOCORRECTED` (spec §6); close all 211 holes.

## Acceptance criteria

- **AC-C1:** A section uniformly prefixed with an empty leading column parses IDENTICALLY to its unshifted form plus exactly one `LEADING_COLUMN_AUTOCORRECTED` warning carrying the structured `autocorrect` field (`subject: null`).
- **AC-C2:** The all-rows trigger only: any populated first cell anywhere in the section (alignment colon-dash alignment counts as populated) suppresses it. Zero warnings on the unmutated corpus; partial-run shapes (East Coast 19-of-23) never fire. No ratio/"most rows" form (spec §6.3).
- **AC-C3:** The FULL sixth-autocorrect fan-out (spec §6.2 table) + §8 fan-out land in one commit; every consumer named in the overview's plan-time sweep is re-checked; gap-class counts advance benign-warn 7→8, totals 59→60.
- **AC-C4:** All 211 `column-shift:` rows deleted; full harness green (four buckets empty).

<!-- tasks: depth=3 -->

### Task 1: RED — autocorrect behavior tests

<!-- task: red=`pnpm exec vitest run tests/parser/leadingColumnAutocorrect.test.ts` ac=AC-C1,AC-C2 -->

**Files:**
- Create: `tests/parser/leadingColumnAutocorrect.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: FAIL:** `pnpm exec vitest run tests/parser/leadingColumnAutocorrect.test.ts`

### Task 2: Implement (the `normalizeSectionHeaders` pattern)

<!-- task: red=`pnpm exec vitest run tests/parser/leadingColumnAutocorrect.test.ts` ac=AC-C1,AC-C2 -->

**Files:**
- Create: `lib/parser/leadingColumnNormalize.ts`
- Modify: `lib/parser/index.ts` — call immediately after the `normalizeSectionHeaders` seam (`index.ts` step 2.5), same rewrite-and-collect shape: `const colNorm = normalizeLeadingColumn(markdown); markdown = colNorm.corrected; agg.warnings.push(...colNorm.warnings);`

**Interfaces:**
- Produces: `normalizeLeadingColumn(markdown: string): { corrected: string; warnings: ParseWarning[] }` — per LOGICAL SECTION (retro F1: rows split at recognized section-opening headers WITHIN a pipe block, via `canonicalSectionKind` — the operator's own unit; a whole-block model reaches only 434/535 operator mutants and misses 46 ledger holes, list in the retro review record): if EVERY row's first cell is empty after trim (an alignment row's first cell is colon-dash text, non-empty, giving the structural guarantee), drop the leading column from every row and emit one warning at section granularity. **Segmentation note (r1 F6, amended r5):** this detector segments by LOGICAL sections (blank lines AND two-cell-aware recognized openers), a reimplementation of — not an import of — the harness's `seg()` model; the clean-corpus calibration test plus the harness run are the transfer gates for any residual divergence.

- [ ] **Step 1:** Implement:

```ts
// lib/parser/leadingColumnNormalize.ts
// Spec §6: when EVERY row a section owns (header AND colon-dash alignment rows
// included) leads with an empty cell, the section was drag-shifted on export.
// The inverse transform is total: drop the leading column, warn once.
import type { ParseWarning } from "./types";
import { canonicalSectionKind } from "./sectionKind"; // branch-2 helper (retro F1/F2)

export function normalizeLeadingColumn(markdown: string): {
  corrected: string;
  warnings: ParseWarning[];
} {
  const warnings: ParseWarning[] = [];
  const lines = markdown.split("\n");
  let start = -1;
  let sectionIndex = -1;

  const leadsEmpty = (line: string): boolean => {
    const parts = line.split("|");
    return parts.length >= 3 && (parts[1] ?? "").trim() === "";
  };

  const correct = (from: number, to: number): void => {
    for (let i = from; i < to; i++) {
      // drop cell 1 (the uniformly-empty leading column) from every row
      const parts = lines[i]!.split("|");
      lines[i] = [parts[0], ...parts.slice(2)].join("|");
    }
    warnings.push({
      severity: "warn",
      code: "LEADING_COLUMN_AUTOCORRECTED",
      message: "Every row of a section started with an empty column, so we read the section one column to the left.",
      blockRef: { kind: canonicalSectionKind((lines[from]!.split("|")[1] ?? "").trim()) ?? "section", index: sectionIndex }, // retro F2
      autocorrect: {
        subject: null,
        corrections: [{ detected: "empty leading column", corrected: "shifted left" }],
      },
    });
  };

  // Retro r5: the opener may sit in cell 1 OR - when the section is shifted, including
  // the boundary-defining row of a NEIGHBOUR section the operator moved - in cell 2
  // behind an empty leading cell. One-cell detection restores only 473/535 mutants.
  const opener = (line: string): boolean => {
    const parts = line.split("|");
    const c1 = (parts[1] ?? "").trim();
    if (c1 !== "") return canonicalSectionKind(c1) !== null;
    return canonicalSectionKind((parts[2] ?? "").trim()) !== null;
  };

  for (let i = 0; i <= lines.length; i++) {
    const isRow = i < lines.length && lines[i]!.trimStart().startsWith("|");
    const boundary = !isRow || (start !== -1 && i > start && opener(lines[i]!)); // retro F1: logical-section split
    if (isRow && start === -1) {
      start = i;
      sectionIndex += 1;
    } else if (boundary && start !== -1) {
      const rows = lines.slice(start, i);
      if (rows.length > 0 && rows.every(leadsEmpty)) correct(start, i);
      start = isRow ? i : -1; // a recognized opener starts the next logical section
      if (isRow) sectionIndex += 1;
    }
  }
  return { corrected: lines.join("\n"), warnings };
}
```

Task 1 green; extend `cleanCorpusCalibration.test.ts` with `LEADING_COLUMN_AUTOCORRECTED: 0` per fixture.
- [ ] **Step 2: Commit** `feat(parser): autocorrect uniformly-empty leading column, LEADING_COLUMN_AUTOCORRECTED`

### Task 3: Sixth-autocorrect + §8 fan-out (one commit)

<!-- task: red=`pnpm exec vitest run tests/parser/_metaAutocorrectProducers.test.ts tests/parser/dataGaps.test.ts tests/messages/autocorrectGuidance.test.ts tests/parser/dataGapsClassCompleteness.test.ts tests/cross-cutting/codes.test.ts tests/messages/_metaWarningCardCopy.test.ts tests/parser/operatorActionableWarnings.test.ts tests/parser/warningScanScopeAnchor.test.ts` ac=AC-C3 -->

Spec §6.2 table, verbatim surface list (every row one commit):

- [ ] `lib/parser/autocorrectCodes.ts` `AUTOCORRECT_CODES` + comment "All five"→"All six"
- [ ] `lib/parser/dataGaps.ts:135` `AUTO_FIX_CLASSES` + `{ code: "LEADING_COLUMN_AUTOCORRECTED", label: "corrected leading column" }`; comments at `dataGaps.ts:26`, `dataGaps.ts:131`, `dataGaps.ts:136`, `dataGaps.ts:155`
- [ ] `lib/parser/types.ts:106` doc "five"→"six"
- [ ] `tests/parser/_metaAutocorrectProducers.test.ts:65` `toHaveLength(13)`→`14` + `_metaAutocorrectProducers.test.ts:77` multiplicity row
- [ ] `tests/parser/dataGaps.test.ts:402` + `dataGaps.test.ts:427` sets/counts
- [ ] `tests/messages/autocorrectGuidance.test.ts:94` + `lib/messages/autocorrectGuidance.ts` row
- [ ] `tests/parser/dataGapsClassCompleteness.test.ts:40` `BENIGN_WARN_CODES` +1 (7→8; totals 59→60)
- [ ] §12.4 row + regen + catalog row (`helpHref: "/help/errors#LEADING_COLUMN_AUTOCORRECTED"`; copy per `STAGE_WORD_AUTOCORRECTED` tone: title `Auto-corrected a section that started with an empty column` (retitled at the invariant-8 critique gate — the original `Auto-corrected a shifted section` used a word the rendered body never repeats); dougFacing: `Every row of a section in this sheet started with an empty column, so we read the section one column to the left and it parses correctly. If the empty column was intentional, update the sheet.`) + card copy + `OPERATOR_ACTIONABLE_ANCHORED` + `WARNING_CODE_ANCHOR` + help family
- [ ] `tests/components/admin/dataGapsTransitionAudit.test.tsx:178` + `tests/components/admin/ShowsTable.test.tsx:1071` — exact five-key `AutoFixSummary` fixtures gain the sixth key (retro F5)
- [ ] `pnpm gen:internal-code-enums` regen + gates (retro F2, as in branches 2-3)
- [ ] Note (retro F3): tests assert `sourceCell` ABSENCE for `LEADING_COLUMN_AUTOCORRECTED` (spec §11.9)
- [ ] Re-check every consumer in the overview's plan-time sweep list (monitorDigest.autofix* ×3, step3Buckets, warningFingerprint, sectionWarningModel.autocorrect, perShowActionableWarnings.autocorrect) for exact-set/length assumptions; update any found; note each in the commit body.
- [ ] All marker suites green. **Commit** `feat(parser): sixth autocorrect code fan-out for LEADING_COLUMN_AUTOCORRECTED`

### Task 4: Ledger shrink + PR

<!-- task: red=`pnpm exec vitest run tests/parser/mutation/knownHoles.test.ts` ac=AC-C4 -->

- [ ] **Step 1:** `perl -ni -e 'print unless /^column-shift:/' tests/parser/mutation/knownHoles.ts`; `knownHoles.test.ts` green; full harness: four buckets empty (211 expected closures — 193 wrong via restored payload+signal, 18 signal_loss via restored baseline emissions, spec §6.4).
- [ ] **Step 2 (retro F4 — the wave's one impeccable gate):** the help-family rows (branches 2-4) are the wave's single UI-surface touch. Run `/impeccable critique` AND `/impeccable audit` on the /help/errors diff (canonical v3 setup gates), disposition P0/P1 findings, then REPLACE the plan closeout's `impeccable-gate: N/A — no UI surface` line with the filled `impeccable-gate: critique=RAN audit=RAN p0=<n> p1=<n> dispositions=<recorded|none>` form in this branch.
- [ ] **Step 3:** Full suite + typecheck + lint + format; PR (fan-out, shrink −211, §6.1 live-pipeline note: exporter drops the live shape today, this defends the parser boundary; review-mechanism note per overview); marker off; merge; `0  0`.

<!-- tasks: end -->
