# Branch 2: feat/mutation-ref-sub — REF_ERROR_LITERAL detector

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Read [00-overview.md](./00-overview.md) first — Stage 0 (worktree, claim `BL-MUTATION-REF-SUB`, marker, push) precedes Task 1. Branch 1 must be merged (its strip is assumed present).

**Goal:** Every cell whose post-`clean()` value contains the literal `#REF!` emits one warn-severity `REF_ERROR_LITERAL` `ParseWarning`; close all 3,314 `ref-sub` holes (spec §4).

## Acceptance criteria

- **AC-R1:** A cell rewritten to `#REF!` in any corpus fixture yields exactly one `REF_ERROR_LITERAL` warning for that cell (deduped per section/row/cell), `severity: "warn"`, `rawSnippet` = the cell text, `blockRef.kind` set; parse payload unchanged vs the mutant-without-detector.
- **AC-R2:** The ESCAPED corpus form is detected: the 24 committed `\#REF\!` occurrences produce EXACTLY 24 warnings on the unmutated corpus, pinned per fixture (consultants 6, fintech 5, fixed-income 5, rpas 5, 2025-10-consultants-roundtable 3 — probe §13.A).
- **AC-R3:** Full §8 fan-out lands in one commit and all its gates pass (`x1-catalog-parity`, card copy, actionable, gap-class 37→38 with total 57→58 at this branch, `WARNING_CODE_ANCHOR`, help family).
- **AC-R4:** `refSub`'s skip guard compares post-`clean()` (spec §4.4); `applicabilityAudit` + coverage floors green after the guard fix and after `RISK_CRITICAL` gains `pull_sheet`.
- **AC-R5:** All 3,314 `ref-sub:` rows deleted; full harness green (four buckets empty; any cross-class fingerprint drift regenerated in-branch per spec §9).

<!-- tasks: depth=3 -->

### Task 1: RED — detector behavior tests

<!-- task: red=`pnpm exec vitest run tests/parser/refErrorLiteral.test.ts` ac=AC-R1,AC-R2 -->

**Files:**
- Create: `tests/parser/refErrorLiteral.test.ts`

**Interfaces:**
- Consumes: `parseSheet`, `ParseWarning` (`lib/parser/types.ts:67`).
- Produces: the behavior contract Task 2 implements; the per-fixture expected counts Task 4's calibration test re-pins.

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/refErrorLiteral.test.ts
// Spec §4: #REF! is a broken-reference export artifact; the parser must signal it,
// never absorb it silently. Failure modes caught: raw-text matching that misses the
// escaped corpus form; duplicate warnings per derived field; hard-fail regression.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseSheet } from "@/lib/parser";
import { premiseHolds } from "@/tests/_shared/premise";

const refWarnings = (md: string, name: string) =>
  parseSheet(md, name).warnings.filter((w) => w.code === "REF_ERROR_LITERAL");

describe("REF_ERROR_LITERAL (spec §4)", () => {
  it("premise: the corpus carries the escaped form", () => {
    const md = readFileSync("fixtures/shows/exporter-xlsx/consultants.md", "utf8");
    premiseHolds("consultants fixture carries escaped #REF!", md.includes("\\#REF\\!"));
  });

  it("detects a bare #REF! cell injected into a clean fixture (operator shape)", () => {
    const md = readFileSync("fixtures/shows/raw/2024-05-east-coast-family-office.md", "utf8");
    premiseHolds("east-coast raw fixture is #REF-free", !md.includes("#REF"));
    // rewrite the first eligible data cell to the bare literal, mirroring refSub (operators.ts:70)
    const lines = md.split("\n");
    const i = lines.findIndex((l) => l.startsWith("|") && !/^\|\s*:?-+/.test(l));
    const cells = lines[i]!.split("|");
    cells[1] = " #REF! ";
    lines[i] = cells.join("|");
    const w = refWarnings(lines.join("\n"), "east-coast.md");
    expect(w).toHaveLength(1);
    expect(w[0]!.severity).toBe("warn");
    expect(w[0]!.rawSnippet).toContain("#REF!");
    expect(w[0]!.blockRef?.kind).toBe("section"); // headerless synthetic section -> generic bucket (retro F2: canonical-or-fallback, never raw text)
  });

  it("detects the ESCAPED corpus form - per-fixture counts pinned (probe §13.A)", () => {
    const expected: Record<string, number> = {
      "fixtures/shows/exporter-xlsx/consultants.md": 6,
      "fixtures/shows/exporter-xlsx/fintech.md": 5,
      "fixtures/shows/exporter-xlsx/fixed-income.md": 5,
      "fixtures/shows/exporter-xlsx/rpas.md": 5,
      "fixtures/shows/raw/2025-10-consultants-roundtable.md": 3,
    };
    for (const [path, n] of Object.entries(expected)) {
      expect(refWarnings(readFileSync(path, "utf8"), path), path).toHaveLength(n);
    }
  });

  it("a cell containing #REF! twice warns ONCE (per-cell dedup, isolated)", () => {
    // r1 F5: isolate dedup on a synthetic cell with TWO occurrences in one cell -
    // the per-fixture pins above cannot distinguish per-cell from per-occurrence.
    const md = "| CLIENT | x |\n| range | #REF! - #REF! |";
    expect(refWarnings(md, "synthetic.md")).toHaveLength(1);
  });

  it("does not hard-fail: hardErrors unchanged by detection", () => {
    const md = readFileSync("fixtures/shows/exporter-xlsx/consultants.md", "utf8");
    const clean = parseSheet(md.replaceAll("\\#REF\\!", "placeholder"), "consultants.md");
    expect(parseSheet(md, "consultants.md").hardErrors).toEqual(clean.hardErrors);
  });
});
```

- [ ] **Step 2: Run to verify it fails:** `pnpm exec vitest run tests/parser/refErrorLiteral.test.ts` — FAIL (code never emitted).

### Task 2: Implement the detector

<!-- task: red=`pnpm exec vitest run tests/parser/refErrorLiteral.test.ts` ac=AC-R1,AC-R2 -->

**Files:**
- Create: `lib/parser/refErrorDetector.ts`
- Create: `lib/parser/sectionKind.ts` (+ `tests/parser/sectionKind.test.ts` — retro F2 helper, full KIND_TO_SECTION vocabulary table test)
- Modify: `lib/parser/index.ts` (call site inside `parseSheet`, after `normalizeSectionHeaders` — the same post-seam position the §5/§6 scanners will share)

**Interfaces:**
- Produces: `detectRefErrorLiterals(markdown: string): ParseWarning[]` — pure, whole-document, post-seam. Emits one warning per offending (section, row, cell), `blockRef.kind` = the section's CANONICAL routing key via `canonicalSectionKind` (or `"section"` when unrecognized/headerless; never raw text — retro F2), `blockRef.index` = the LOGICAL section ordinal (advances at blank-line boundaries AND at recognized openers within a pipe run — retro r5).

- [ ] **Step 1: Implement**

```ts
// lib/parser/refErrorDetector.ts
// Spec §4: cell-level detector on cleaned cell values. Detection is `contains`
// on the post-clean() text (the corpus stores the escaped form; clean() unescapes).
import type { ParseWarning } from "./types";
import { clean, splitRow } from "./blocks/_helpers";
// canonicalSectionKind: NEW shared helper this branch adds (lib/parser/sectionKind.ts) -
// maps a section-opening label to a KIND_TO_SECTION routing KEY (lib/admin/
// step3SectionStatus.ts:22 vocabulary; correct examples per retro r5:
// HOTEL -> "hotels", TRANSPORTATION -> "transportation", CREW/TECH -> "crew",
// CLIENT -> "client", DATES -> "dates"), null when unrecognized. The helper's
// table test asserts every emitted key IS a KIND_TO_SECTION key (structural,
// not example-based). Branches 3-4 reuse it.
import { canonicalSectionKind } from "./sectionKind";

export function detectRefErrorLiterals(markdown: string): ParseWarning[] {
  const warnings: ParseWarning[] = [];
  const lines = markdown.split("\n");
  let sectionIndex = -1;
  let sectionKind = "section";
  let prevBlank = true;
  for (const line of lines) {
    const isRow = line.trimStart().startsWith("|");
    const opener = isRow && canonicalSectionKind(clean(splitRow(line)[0] ?? "")) !== null;
    if (isRow && (prevBlank || opener)) {
      // Retro F2 + r5: kind is a CANONICAL routing key or "section" - never raw text -
      // and a recognized opener WITHIN a pipe run starts a new logical section, so a
      // later section never inherits the preceding section's kind.
      sectionIndex += 1;
      sectionKind = canonicalSectionKind(clean(splitRow(line)[0] ?? "")) ?? "section";
    }
    prevBlank = line.trim() === "";
    if (!isRow || /^\s*\|\s*:?-+/.test(line)) continue;
    for (const cellRaw of splitRow(line)) {
      const cell = clean(cellRaw);
      if (cell.includes("#REF!")) {
        warnings.push({
          severity: "warn",
          code: "REF_ERROR_LITERAL",
          message: `A broken spreadsheet reference ("#REF!") appears in the sheet where a real value belongs.`,
          blockRef: { kind: sectionKind, index: sectionIndex },
          rawSnippet: cellRaw.trim(),
        });
      }
    }
  }
  return warnings;
}
```

(One warning per offending CELL — the loop emits at most one per cell by construction; a cell fanning into multiple derived fields is only visited once here, which IS the dedup the spec requires.)

- [ ] **Step 2: Wire into `parseSheet`** after the `secNorm` block (`index.ts` step 2.5): `agg.warnings.push(...detectRefErrorLiterals(markdown));`
- [ ] **Step 3: Task 1 tests PASS.** Also `pnpm exec vitest run tests/parser/payloadZeroWidth.test.ts` (branch 1 guard unaffected).
- [ ] **Step 4: Commit** `feat(parser): detect #REF! export artifacts as REF_ERROR_LITERAL`

### Task 3: §8 fan-out (one commit)

<!-- task: red=`pnpm exec vitest run tests/cross-cutting/codes.test.ts tests/messages/_metaWarningCardCopy.test.ts tests/parser/operatorActionableWarnings.test.ts tests/parser/dataGapsClassCompleteness.test.ts tests/parser/warningScanScopeAnchor.test.ts` ac=AC-R3 -->

**Files (all in ONE commit):**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4 (new row, mirror the `STAGE_WORD_AUTOCORRECTED` row shape at `2026-04-30-fxav-crew-pages-v1.md:2899`)
- Regenerate: `pnpm gen:spec-codes` → `lib/messages/__generated__/spec-codes.ts` AND `pnpm gen:internal-code-enums` → `lib/messages/__generated__/internal-code-enums.ts` (retro F2; gates: `tests/messages/_metaParseWarningSiteCoverage.test.ts:60`, `tests/parser/warningScanScopeAnchor.test.ts:49`)
- Modify: `lib/messages/catalog.ts` (full row: dougFacing, crewFacing null, followUp "Doug → fix in sheet", helpfulContext, triggerContext, title, longExplanation, `helpHref: "/help/errors#REF_ERROR_LITERAL"`)
- Modify: `tests/messages/warningCardCopyRegistry.ts` (`WARNING_CARD_COPY_CODES` + copy row)
- Modify: `lib/parser/dataGaps.ts` (`OPERATOR_ACTIONABLE_ANCHORED` + `GAP_CLASSES` row — label "broken reference in sheet")
- Modify: `tests/parser/dataGapsClassCompleteness.test.ts` (DATA_GAP_CODES 37→38 at this branch; Layer-1 totals accordingly)
- Modify: `tests/parser/_warningCodeAnchor.ts` (`WARNING_CODE_ANCHOR` + row)
- Modify: `app/help/errors/_families.ts` (family row — the wave's ONLY UI-surface touch, spec §1.1.8 as amended; the impeccable dual-gate runs at branch 4 close, not here)
- Note (retro F3): tests assert `sourceCell` ABSENCE for `REF_ERROR_LITERAL` (`attachSourceCellAnchors` has no dispatch for it; blockRef-only anchoring, spec §11.9)

Copy draft (adjust to catalog voice; NO em-dashes, `'` apostrophes):
- title: `Broken spreadsheet reference in the sheet`
- dougFacing: `A cell in this sheet contains "#REF!", which is what Sheets shows when a formula's reference was deleted. The page will display it as-is until the formula is repaired in the sheet.`

- [ ] **Step 1:** Land all files; run the five gate suites in the task marker — all PASS.
- [ ] **Step 2: Commit** `feat(parser): REF_ERROR_LITERAL catalog + card copy + gate fan-out`

### Task 4: Clean-corpus calibration test (NEW file, wave template)

<!-- task: red=`pnpm exec vitest run tests/parser/cleanCorpusCalibration.test.ts` ac=AC-R2 -->

**Files:**
- Create: `tests/parser/cleanCorpusCalibration.test.ts` — walks BOTH fixture directories from disk (new fixtures are covered by default), asserts per-code expected clean-corpus warning counts: `REF_ERROR_LITERAL` — the Task 1 per-fixture table, every other fixture 0. Branches 3-4 extend the same file with their codes at 0.

- [ ] **Step 1:** Write + run: PASS (detector already landed). Failure mode caught: a future fixture or detector change silently shifting the clean-corpus base rate.

```ts
// tests/parser/cleanCorpusCalibration.test.ts
// Spec §10: per-code clean-corpus expectations, walked from disk so a NEW fixture
// is covered by default. Branches 3-4 append their codes to WAVE_CODES at 0.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { parseSheet } from "@/lib/parser";

const EXPECTED_REF: Record<string, number> = {
  "fixtures/shows/exporter-xlsx/consultants.md": 6,
  "fixtures/shows/exporter-xlsx/fintech.md": 5,
  "fixtures/shows/exporter-xlsx/fixed-income.md": 5,
  "fixtures/shows/exporter-xlsx/rpas.md": 5,
  "fixtures/shows/raw/2025-10-consultants-roundtable.md": 3,
};
// Branches 3-4 extend: { code, expected } with expected defaulting to 0 everywhere.
const WAVE_CODES: Array<{ code: string; expected: Record<string, number> }> = [
  { code: "REF_ERROR_LITERAL", expected: EXPECTED_REF },
];

describe("clean-corpus calibration (spec §10)", () => {
  for (const dir of ["fixtures/shows/exporter-xlsx", "fixtures/shows/raw"]) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".md"))) {
      const path = `${dir}/${f}`;
      it(`${path} matches every wave code's pinned base rate`, () => {
        const warnings = parseSheet(readFileSync(path, "utf8"), f).warnings;
        for (const { code, expected } of WAVE_CODES) {
          const n = warnings.filter((w) => w.code === code).length;
          expect(n, `${code} on ${path}`).toBe(expected[path] ?? 0);
        }
      });
    }
  }
});
```

- [ ] **Step 2: Commit** `test(parser): clean-corpus calibration pins for REF_ERROR_LITERAL`

### Task 5: Operator guard fix + RISK_CRITICAL extension

<!-- task: red=`pnpm exec vitest run tests/parser/mutation/operators.test.ts tests/parser/mutation/applicabilityAudit.test.ts tests/parser/mutation/classify.test.ts` ac=AC-R4 -->

**Files:**
- Modify: `tests/parser/mutation/operators.ts:74` — `if (c.val.trim() === "#REF!") continue;` → `if (clean(c.val).includes("#REF!")) continue;` (import `clean` from `@/lib/parser/blocks/_helpers`); spec §4.4 as amended by retro review F1: INCLUDES, not equality — an equality guard leaves the escaping mutant `ref-sub:2025-10-consultants-roundtable:B28:L209:X2` (ABSORBED → SILENT_SIGNAL_LOSS once the detector lands, REF_ERROR_LITERAL 3/3 with only the echoed rawSnippet moving).
- Modify: `tests/parser/mutation/classify.ts` `RISK_CRITICAL` (`classify.ts:25-33`): add `"pull_sheet"`; update `applicabilityAudit.ts` / floor expectations that enumerate the set.
- Modify: `tests/parser/mutation/operators.test.ts` — add cases: an escaped `\#REF\!` whole-cell site generates NO mutant, AND a composite `\#REF\!/NAME` site generates NO mutant (includes-guard).
- Modify: `tests/parser/mutation/applicabilityAudit.ts:140` — the audit INDEPENDENTLY mirrors the old raw-equality skip (`c.trim() !== "#REF!"`); update it to the same post-`clean()` includes rule or the exhaustive exact-count gate disagrees by 24 sites (retro F6: consultants 6, fintech 5, fixed-income 5, rpas 5, consultants-roundtable 3). Run the exhaustive gate locally (`VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run tests/parser/mutationHarness.gates.test.ts`) before pushing.

- [ ] **Step 1:** RED case first (guard test fails against old comparison), then apply both edits, suites green.
- [ ] **Step 2: Commit** `infra: refSub no-op guard compares post-clean; RISK_CRITICAL gains pull_sheet`

### Task 6: Ledger shrink + harness + PR

<!-- task: red=`pnpm exec vitest run tests/parser/mutation/knownHoles.test.ts` ac=AC-R5 -->

- [ ] **Step 1:** `perl -ni -e 'print unless /^ref-sub:/' tests/parser/mutation/knownHoles.ts` then `knownHoles.test.ts` green.
- [ ] **Step 2:** Full harness (8 shards): four buckets empty. If `driftedAlarms` surfaces (the detector fires on baseline for 5 fixtures — cross-class fingerprint moves largely cancel, spec §9), regenerate the drifted rows' fingerprints in this branch and record the count in the PR body.
- [ ] **Step 3:** Full suite + typecheck + lint + format; push; PR body: fan-out list, ledger shrink (−3,314), live-show consequence note (spec §4.2: shows carrying `#REF!` warn on next sync, intended), substitute-review deviation.
- [ ] **Step 4:** Marker off in last commit; PR-head harness verified; merge; `0  0`.

<!-- tasks: end -->
