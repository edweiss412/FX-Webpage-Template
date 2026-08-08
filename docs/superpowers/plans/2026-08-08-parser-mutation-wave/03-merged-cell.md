# Branch 3: feat/mutation-merged-cell — ROW_CELLS_FUSED width discriminator

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Read [00-overview.md](./00-overview.md) first — Stage 0 (worktree, claim `BL-MUTATION-MERGED-CELL`, marker, push) precedes Task 1. Branches 1-2 merged (strip + `refErrorDetector` + calibration test file exist).

**Goal:** A data row exactly one cell short of its section's modal data-row width emits warn `ROW_CELLS_FUSED`; close the reachable `merged-cell` holes (spec §5).

## Acceptance criteria

- **AC-M1:** Deleting one interior pipe from a data row (rows ≥3 cells, at-modal section) yields exactly one `ROW_CELLS_FUSED` warning with `rawSnippet` = the short row's line and `blockRef.kind`/`index` set; payload unchanged vs the detector-less mutant (detection, not correction).
- **AC-M2:** ZERO `ROW_CELLS_FUSED` warnings on all 17 unmutated fixtures (probe §13.B: no corpus row sits at modal−1) — pinned in `cleanCorpusCalibration.test.ts`.
- **AC-M3:** Full §8 fan-out in one commit; gap-class counts advance 38→39 (branch 2 landed 37→38), totals accordingly; all gates green.
- **AC-M4:** `merged-cell:` ledger rows deleted except the probe-reconciled residue (rows whose target row was already off-modal — spec §5.3); residue count recorded in the PR body + backlog row close note; full harness green.

<!-- tasks: depth=3 -->

### Task 1: RED — discriminator behavior tests

<!-- task: red=`pnpm exec vitest run tests/parser/rowCellsFused.test.ts` ac=AC-M1,AC-M2 -->

**Files:**
- Create: `tests/parser/rowCellsFused.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/rowCellsFused.test.ts
// Spec §5: a merged cell exports as a deleted pipe - one cell short of the section
// modal. Failure modes caught: detector counting alignment/header rows into the modal;
// firing on legitimately ragged rows; correcting instead of detecting.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { parseSheet } from "@/lib/parser";
import { payloadOf } from "@/tests/parser/mutation/oracle";
import { premiseHolds } from "@/tests/_shared/premise";

const fused = (md: string, name: string) =>
  parseSheet(md, name).warnings.filter((w) => w.code === "ROW_CELLS_FUSED");

/** Fuse a data row inside a section with >= 3 SAME-WIDTH data rows (>= 3 cells), so the
 *  modal is well-defined and the discriminator CAN fire (r1 F1: the first eligible row
 *  by line order is the one-data-row TITLE section, where flush() bails at data<3). */
function fuseEligibleRow(md: string): { mutated: string; line: number } {
  const lines = md.split("\n");
  const isRow = (l: string) => l.trimStart().startsWith("|");
  const isAlign = (l: string) => /^\s*\|\s*:?-+/.test(l);
  let start = -1;
  for (let i = 0; i <= lines.length; i++) {
    const row = i < lines.length && isRow(lines[i]!);
    if (row && start === -1) start = i;
    if (!row && start !== -1) {
      const dataIdx = [];
      for (let j = start; j < i; j++) if (!isAlign(lines[j]!)) dataIdx.push(j);
      const widths = dataIdx.map((j) => lines[j]!.split("|").length);
      if (dataIdx.length >= 3 && widths[0]! - 2 >= 3 && widths.every((w) => w === widths[0])) {
        const t = dataIdx[1]!; // fuse the MIDDLE data row, keep the modal anchored by its siblings
        const cells = lines[t]!.split("|");
        lines[t] = ["", cells[1]! + " " + cells[2]!, ...cells.slice(3)].join("|");
        return { mutated: lines.join("\n"), line: t };
      }
      start = -1;
    }
  }
  throw new Error("no eligible section - premise violated");
}

describe("ROW_CELLS_FUSED (spec §5)", () => {
  const path = "fixtures/shows/exporter-xlsx/east-coast.md";
  const md = readFileSync(path, "utf8");

  it("premise: the fixture has a >=3-cell data row and fires zero fused warnings clean", () => {
    premiseHolds("fusable >=3-same-width-data-row section exists", fuseEligibleRow(md).mutated !== md);
    expect(fused(md, path)).toEqual([]);
  });

  it("a deleted interior pipe fires exactly one warning, and payload is untouched by the detector", () => {
    const { mutated } = fuseEligibleRow(md);
    const w = fused(mutated, path);
    expect(w).toHaveLength(1);
    expect(w[0]!.severity).toBe("warn");
    expect(w[0]!.rawSnippet).toBeTruthy();
    expect(w[0]!.blockRef?.kind).toBeTruthy();
    // detection, not correction: same payload as the mutant parsed WITHOUT this branch
    // (assert shape: the fused row's absorption is unchanged - payload keys equal the
    // mutant baseline captured before this branch; executable proxy: warning count is
    // the ONLY warnings-array delta between mutant and clean parse)
    const cleanW = parseSheet(md, path).warnings.length;
    expect(parseSheet(mutated, path).warnings.length).toBe(cleanW + 1);
    expect(payloadOf(parseSheet(mutated, path))).not.toEqual(payloadOf(parseSheet(md, path))); // fusion still absorbs - spec §5.1
  });

  it("zero warnings across the whole unmutated corpus (probe §13.B: no row at modal-1)", () => {
    for (const dir of ["fixtures/shows/exporter-xlsx", "fixtures/shows/raw"]) {
      for (const f of readdirSync(dir).filter((x) => x.endsWith(".md"))) {
        expect(fused(readFileSync(`${dir}/${f}`, "utf8"), f), f).toEqual([]);
      }
    }
  });
});
```

- [ ] **Step 2: Run to verify FAIL:** `pnpm exec vitest run tests/parser/rowCellsFused.test.ts`

### Task 2: Implement the discriminator

<!-- task: red=`pnpm exec vitest run tests/parser/rowCellsFused.test.ts` ac=AC-M1,AC-M2 -->

**Files:**
- Create: `lib/parser/rowWidthDiscriminator.ts`
- Modify: `lib/parser/index.ts` (call next to `detectRefErrorLiterals`)

**Interfaces:**
- Produces: `detectFusedRows(markdown: string): ParseWarning[]` — per blank-line-separated section: modal cell count over DATA rows (colon-dash alignment rows skipped); any data row at exactly `modal - 1` warns. Sections with < 3 data rows or without a well-defined modal (tie) are skipped (spec §5.3 residue). **Segmentation note (r1 F6):** this detector segments by blank-line pipe blocks, not the harness's `seg()` model that measured the probe base rates - the clean-corpus calibration test is the transfer gate, and any divergence surfaces there as a failing pin, never as silent corruption.

- [ ] **Step 1:** Implement:

```ts
// lib/parser/rowWidthDiscriminator.ts
// Spec §5: a data row exactly one cell short of its section's modal data-row width
// is the pipe-deletion (merged-cell) export shape. Detection only - no correction.
import type { ParseWarning } from "./types";
import { clean, splitRow } from "./blocks/_helpers";

export function detectFusedRows(markdown: string): ParseWarning[] {
  const warnings: ParseWarning[] = [];
  const lines = markdown.split("\n");
  type Row = { line: string; cells: number };
  let section: Row[] = [];
  let sectionIndex = -1;
  let sectionKind = "section";

  const flush = (): void => {
    const data = section.filter((r) => !/^\s*\|\s*:?-+/.test(r.line));
    if (data.length < 3) return;
    const freq = new Map<number, number>();
    for (const r of data) freq.set(r.cells, (freq.get(r.cells) ?? 0) + 1);
    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
    if (sorted.length > 1 && sorted[0]![1] === sorted[1]![1]) return; // modal tie: skip (spec §5.3)
    const modal = sorted[0]![0];
    for (const r of data) {
      if (r.cells === modal - 1) {
        warnings.push({
          severity: "warn",
          code: "ROW_CELLS_FUSED",
          message: "A row in this section has one fewer column than its neighbors, which is how a merged cell exports.",
          blockRef: { kind: sectionKind, index: sectionIndex },
          rawSnippet: r.line.trim(),
        });
      }
    }
  };

  for (const line of lines) {
    if (line.trimStart().startsWith("|")) {
      if (section.length === 0) {
        sectionIndex += 1;
        sectionKind = clean(splitRow(line)[0] ?? "") || "section";
      }
      section.push({ line, cells: splitRow(line).length });
    } else if (line.trim() === "" && section.length > 0) {
      flush();
      section = [];
    }
  }
  flush();
  return warnings;
}
```
- [ ] **Step 2:** Task 1 green; `cleanCorpusCalibration.test.ts` extended with `ROW_CELLS_FUSED: 0` for every fixture.
- [ ] **Step 3: Commit** `feat(parser): detect short-by-one fused rows as ROW_CELLS_FUSED`

### Task 3: §8 fan-out (one commit — same surface list as branch 2 Task 3, this code's rows)

<!-- task: red=`pnpm exec vitest run tests/cross-cutting/codes.test.ts tests/messages/_metaWarningCardCopy.test.ts tests/parser/operatorActionableWarnings.test.ts tests/parser/dataGapsClassCompleteness.test.ts tests/parser/warningScanScopeAnchor.test.ts` ac=AC-M3 -->

- [ ] **Step 1:** §12.4 row + regen + catalog row (`helpHref: "/help/errors#ROW_CELLS_FUSED"`) + card copy + `OPERATOR_ACTIONABLE_ANCHORED` + `GAP_CLASSES` (label "two columns merged into one") + class-completeness counts (38→39) + `WARNING_CODE_ANCHOR` + help family. Copy draft: title `Two columns ran together in the sheet`; dougFacing: `A row in this sheet has one fewer column than its neighbors, which is how a merged cell exports. Values to the right of the merge may appear under the wrong headings until the merge is removed in the sheet.`
- [ ] **Step 2:** Gates green; **Commit** `feat(parser): ROW_CELLS_FUSED catalog + card copy + gate fan-out`

### Task 4: Ledger shrink + residue accounting + PR

<!-- task: red=`pnpm exec vitest run tests/parser/mutation/knownHoles.test.ts` ac=AC-M4 -->

- [ ] **Step 1:** Run the full harness BEFORE deletion to enumerate `fixedHoles` — expected ≈ 2,397 (2,404 minus the probe's 7 off-modal-row mutants, §13.B; the exact number the run reports is authoritative).
- [ ] **Step 2:** Delete exactly the reported `fixedHoles` rows (not the blanket class): save the run's `fixedHoles` list, then remove those lines from `RAW_HOLES`. Residue rows stay, and the PR + backlog row record the count + reason (spec §5.3/§11.4).
- [ ] **Step 3:** Full harness: four buckets empty. Full suite + typecheck + lint + format.
- [ ] **Step 4:** PR (fan-out list, shrink count, residue note, §5.4 not-claimed statement, substitute-review deviation); marker off in last commit; merge; `0  0`.

<!-- tasks: end -->
