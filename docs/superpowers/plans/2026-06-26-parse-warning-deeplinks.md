# Operator-Actionable Parse-Warning Deep Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give four operator-actionable parse-warning codes (`SCHEDULE_TIME_UNPARSED`, `UNKNOWN_ROLE_TOKEN`, `UNKNOWN_DAY_RESTRICTION`, `FIELD_UNREADABLE`) a source-sheet "Open in Sheet ↗" deep link on every operator review surface, populated on **both** the onboarding scan and cron sync ingestion paths.

**Architecture:** A new raw-grid crew-role-cell scanner (`extractCrewRoleAnchors`) mirrors the existing `extractShowDayTimeAnchors`. A code-dispatching `attachSourceCellAnchors` resolves each warning's `sourceCell` (cell anchor by ISO date / crew NAME, region anchor by block kind). A shared `attachWarningAnchors` helper — a pure raw-workbook read gated by `hasCellAnchoredWarning` — is invoked from both `runOnboardingScan.prepareOne` and the cron `prepareProcessOneFile`, so anchors are populated regardless of ingestion path. Three render surfaces (Step-3 card, StagedReviewCard, per-show panel) render the catalog-title-or-message line + the deep link.

**Tech Stack:** TypeScript, Next.js 16 App Router (RSC), `xlsx` (raw workbook parse), Vitest, Tailwind v4.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-26-parse-warning-deeplinks-design.md` (Codex-APPROVED). Spec wins on any conflict.
- **TDD per task:** failing test → minimal impl → passing test → commit. Never implement before the test.
- **Invariant 2 (advisory lock):** the shared helper is a PURE raw-workbook read — no DB access, no `pg_advisory*` call. It runs at the parse/prepare stage and acquires no lock.
- **Invariant 5 (no raw codes in UI):** every surface renders `(entry?.title ?? null) || w.message` — catalog title if present, else the human message — NEVER the bare `w.code`.
- **Invariant 8 (UI quality gate):** `components/admin/StagedReviewCard.tsx`, `app/admin/show/[slug]/page.tsx`, `components/admin/wizard/Step3SheetCard.tsx` are UI surfaces → `/impeccable critique` AND `/impeccable audit` must pass (HIGH/CRITICAL fixed or DEFERRED) before adversarial review.
- **No §12.4 / catalog change:** the link renders from `sourceCell`, not copy. Do NOT edit any `dougFacing`/`title`/`helpfulContext` for the four codes. (`x1-catalog-parity` must stay green.)
- **No DB migration:** `sourceCell` already exists in the `parse_warnings` jsonb (`lib/parser/types.ts:20`); we only populate it on a new path.
- **Commit per task**, conventional commits: `feat(parser|sync|drive|admin|crew-page): …` or `test(...)`. Use `--no-verify` (this worktree's hooks are bypassed for the autonomous pipeline; CI is the gate).
- **Anti-tautology:** derive expected A1 from fixture geometry; assert against the data source, not the rendering container.

---

## File Structure

**Create:**
- `lib/drive/crewRoleAnchors.ts` — raw-grid crew-role-cell scanner + name-key normalizer + resolver (Task 3).
- `lib/sync/attachWarningAnchors.ts` — shared anchor-population helper for both ingestion paths (Task 5).
- `tests/drive/crewRoleAnchors.test.ts` — scanner tests incl. fixture-known A1 parity (Task 3).
- `tests/sync/attachWarningAnchors.test.ts` — helper tests (Task 5).
- `tests/parser/parseWarningDeepLinkRender.test.tsx` — invariant-5 render meta-test across surfaces (Task 10).

**Modify:**
- `lib/parser/types.ts` — add `blockRef.name` (Task 1).
- `lib/parser/blocks/crew.ts` — stamp `blockRef` on the two crew-role codes in `buildCrewMember` (Task 1).
- `lib/parser/dataGaps.ts` — add `OPERATOR_ACTIONABLE_ANCHORED` + `operatorActionableWarnings` selector (Task 2).
- `lib/drive/showDayTimeAnchors.ts` — refactor `attachSourceCellAnchors` to the bundle signature + dispatch; make `CELL_ANCHORED_CODES = OPERATOR_ACTIONABLE_ANCHORED` (Task 4).
- `lib/sync/runOnboardingScan.ts` — call the shared helper (Task 6).
- `lib/sync/runScheduledCronSync.ts` — call the shared helper in `prepareProcessOneFile` (Task 7).
- `app/admin/show/[slug]/page.tsx` — widen `readDataQuality` + render the operator-actionable subsection (Task 8).
- `components/admin/StagedReviewCard.tsx` + the StagedRow construction sites — render + derive operator-actionable list (Task 9).
- `tests/drive/showDayTimeAnchors.test.ts` — invert the negative-pins + adapt to the new signature (Task 4).
- `tests/onboarding/prepareSourceCellAnchors.test.ts` — invert the UNKNOWN_ROLE_TOKEN case + add a crew-anchor case (Task 6).
- `tests/sync/sourceAnchorsPipeline.test.ts` — add the cron crew-anchor case (Task 7).

---

## Task 1: `blockRef.name` + crew-role warning enrichment

**Files:**
- Modify: `lib/parser/types.ts:12`
- Modify: `lib/parser/blocks/crew.ts:217-281` (`buildCrewMember`)
- Test: `tests/parser/crewRoleWarningBlockRef.test.ts` (create)

**Interfaces:**
- Produces: `ParseWarning.blockRef` gains optional `name?: string`. `UNKNOWN_ROLE_TOKEN` and `UNKNOWN_DAY_RESTRICTION` warnings emitted from `buildCrewMember` now carry `blockRef: { kind: "crew", index, name: <raw name cell> }`.

- [ ] **Step 1: Write the failing test**

Create `tests/parser/crewRoleWarningBlockRef.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseCrew } from "@/lib/parser/blocks/crew";
import { ParseAggregator } from "@/lib/parser/warnings";

// New-template CREW table with an unrecognized role token ("WIDGETMASTER").
const NEW_TPL = [
  "| CREW | NAME | ROLE | PHONE |",
  "| --- | --- | --- | --- |",
  "|  | Jane Doe | - WIDGETMASTER | 555-1212 |",
].join("\n");

// Old TECH template: name+schedule+role merged in col 0; "WIDGETMASTER" unknown.
const TECH_TPL = [
  "| TECH | PHONE | ARRIVAL | DEPARTURE |",
  "| --- | --- | --- | --- |",
  "| John Smith - WIDGETMASTER | 555-2323 |  |  |",
].join("\n");

// Triple-asterisk day restriction with no explicit days → UNKNOWN_DAY_RESTRICTION.
const TRIPLE = [
  "| CREW | NAME | ROLE | PHONE |",
  "| --- | --- | --- | --- |",
  "|  | Amy Lane | - LEAD*** | 555-3434 |",
].join("\n");

function roleWarnings(markdown: string, version: "v1" | "v2" | "v4") {
  const agg = new ParseAggregator();
  parseCrew(markdown, version, agg);
  return agg.warnings;
}

describe("crew-role warnings carry blockRef.name", () => {
  it("UNKNOWN_ROLE_TOKEN (new template) carries blockRef {kind:'crew', name:<NAME cell>}", () => {
    const w = roleWarnings(NEW_TPL, "v4").find((x) => x.code === "UNKNOWN_ROLE_TOKEN");
    expect(w?.blockRef).toMatchObject({ kind: "crew", index: 0, name: "Jane Doe" });
  });

  it("UNKNOWN_ROLE_TOKEN (old TECH template) carries blockRef.name = extracted name segment", () => {
    const w = roleWarnings(TECH_TPL, "v1").find((x) => x.code === "UNKNOWN_ROLE_TOKEN");
    expect(w?.blockRef).toMatchObject({ kind: "crew", index: 0, name: "John Smith" });
  });

  it("UNKNOWN_DAY_RESTRICTION carries blockRef.name", () => {
    const w = roleWarnings(TRIPLE, "v4").find((x) => x.code === "UNKNOWN_DAY_RESTRICTION");
    expect(w?.blockRef).toMatchObject({ kind: "crew", index: 0, name: "Amy Lane" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/crewRoleWarningBlockRef.test.ts`
Expected: FAIL — `blockRef` is `undefined` on the warnings (no enrichment yet).

- [ ] **Step 3: Implement**

In `lib/parser/types.ts`, widen `blockRef` (line 12):

```ts
  blockRef?: { kind: string; index?: number; iso?: string; name?: string };
```

In `lib/parser/blocks/crew.ts`, inside `buildCrewMember`, after the destructure (`const { phoneRaw, ... } = params;`, ~line 227) add a shared ref:

```ts
  // Stable per-row key for deep-link anchoring of crew-role-cell warnings.
  // name is the RAW name cell (pre-restriction-strip); the raw-grid scanner
  // re-extracts and normalizes the same value to locate the cell.
  const crewBlockRef = { kind: "crew" as const, index, name: params.nameRaw };
```

Replace the role-flag push (the existing `warnings.push(...roleFlagResult.warnings)` / `if (agg) agg.warnings.push(...roleFlagResult.warnings)`, ~lines 263-264) with a stamped version:

```ts
  const stampedRoleWarnings = roleFlagResult.warnings.map((w) =>
    w.code === "UNKNOWN_ROLE_TOKEN" ? { ...w, blockRef: crewBlockRef } : w,
  );
  warnings.push(...stampedRoleWarnings);
  if (agg) agg.warnings.push(...stampedRoleWarnings);
```

Add `blockRef` to the `tripleAsteriskWarning` literal (~lines 273-278):

```ts
    const tripleAsteriskWarning = {
      severity: "warn" as const,
      code: "UNKNOWN_DAY_RESTRICTION",
      message: `Role cell contains *** but no explicit day dates found: '${params.roleRaw}'`,
      rawSnippet: params.roleRaw,
      blockRef: crewBlockRef,
    };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/crewRoleWarningBlockRef.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/types.ts lib/parser/blocks/crew.ts tests/parser/crewRoleWarningBlockRef.test.ts
git commit --no-verify -m "feat(parser): stamp blockRef.name on crew-role-cell warnings for deep-link anchoring"
```

---

## Task 2: `OPERATOR_ACTIONABLE_ANCHORED` taxonomy + selector

**Files:**
- Modify: `lib/parser/dataGaps.ts` (append after `dataGapClassDetails`)
- Test: `tests/parser/operatorActionableWarnings.test.ts` (create)

**Interfaces:**
- Produces:
  - `export const OPERATOR_ACTIONABLE_ANCHORED: ReadonlySet<string>` = the four codes.
  - `export function operatorActionableWarnings(warnings: readonly ParseWarning[] | null | undefined): ParseWarning[]` — filters to `OPERATOR_ACTIONABLE_ANCHORED`, preserves parse order (stable), dedups by `(code, resolved-anchor-A1)`; warnings WITHOUT a resolved `sourceCell` are never deduped.

- [ ] **Step 1: Write the failing test**

Create `tests/parser/operatorActionableWarnings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  OPERATOR_ACTIONABLE_ANCHORED,
  operatorActionableWarnings,
} from "@/lib/parser/dataGaps";
import type { ParseWarning } from "@/lib/parser/types";

const anchor = { title: "INFO", gid: 0, a1: "C2" };

describe("OPERATOR_ACTIONABLE_ANCHORED + selector", () => {
  it("contains exactly the four codes", () => {
    expect([...OPERATOR_ACTIONABLE_ANCHORED].sort()).toEqual(
      ["FIELD_UNREADABLE", "SCHEDULE_TIME_UNPARSED", "UNKNOWN_DAY_RESTRICTION", "UNKNOWN_ROLE_TOKEN"],
    );
  });

  it("filters to the actionable set and drops non-members + info-severity", () => {
    const ws: ParseWarning[] = [
      { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "a", sourceCell: anchor },
      { severity: "warn", code: "UNKNOWN_SECTION_HEADER", message: "b" }, // not in set
      { severity: "info", code: "TYPO_NORMALIZED", message: "c" }, // info
    ];
    const out = operatorActionableWarnings(ws);
    expect(out.map((w) => w.code)).toEqual(["UNKNOWN_ROLE_TOKEN"]);
  });

  it("dedups by (code, resolved A1) — cascade collapses to one", () => {
    const ws: ParseWarning[] = [
      { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "LOAD IN", sourceCell: anchor },
      { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "STRKE", sourceCell: anchor },
    ];
    expect(operatorActionableWarnings(ws)).toHaveLength(1);
  });

  it("never dedups warnings without a resolved anchor (stable, no hiding)", () => {
    const ws: ParseWarning[] = [
      { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "x", blockRef: { kind: "crew", index: 0 } },
      { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "y", blockRef: { kind: "crew", index: 1 } },
    ];
    expect(operatorActionableWarnings(ws)).toHaveLength(2);
  });

  it("preserves parse order", () => {
    const ws: ParseWarning[] = [
      { severity: "warn", code: "FIELD_UNREADABLE", message: "1", sourceCell: { title: "INFO", gid: 0, a1: "A1" } },
      { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "2", sourceCell: anchor },
    ];
    expect(operatorActionableWarnings(ws).map((w) => w.message)).toEqual(["1", "2"]);
  });

  it("null/undefined/[] → []", () => {
    expect(operatorActionableWarnings(null)).toEqual([]);
    expect(operatorActionableWarnings(undefined)).toEqual([]);
    expect(operatorActionableWarnings([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/operatorActionableWarnings.test.ts`
Expected: FAIL — `OPERATOR_ACTIONABLE_ANCHORED`/`operatorActionableWarnings` not exported.

- [ ] **Step 3: Implement**

Append to `lib/parser/dataGaps.ts`:

```ts
/**
 * Operator-actionable, source-anchorable parse-warning codes. These get a
 * source-sheet "Open in Sheet" deep link on the review surfaces. DISJOINT in
 * meaning from DATA_GAP_CODES (the count-only digest) — though FIELD_UNREADABLE
 * is intentionally in BOTH (keeps its data-gap count AND gains a region link).
 * lib/drive/showDayTimeAnchors.ts uses this SAME set as the anchor-population
 * gate (CELL_ANCHORED_CODES), so the render gate and the population gate cannot
 * drift.
 */
export const OPERATOR_ACTIONABLE_ANCHORED: ReadonlySet<string> = new Set([
  "SCHEDULE_TIME_UNPARSED",
  "UNKNOWN_ROLE_TOKEN",
  "UNKNOWN_DAY_RESTRICTION",
  FIELD_UNREADABLE,
]);

/**
 * Select the operator-actionable warnings for a durable review surface:
 * filter to OPERATOR_ACTIONABLE_ANCHORED (warn-severity only), PRESERVE parse
 * order, and dedup by (code, resolved-anchor-A1). A cascade of same-cell
 * warnings (one per unknown token) collapses to one line; warnings WITHOUT a
 * resolved sourceCell are NEVER deduped (the synthesis-unstable blockRef.index
 * is never a dedup key), so no actionable row is ever hidden.
 */
export function operatorActionableWarnings(
  warnings: readonly ParseWarning[] | null | undefined,
): ParseWarning[] {
  if (!warnings) return [];
  const out: ParseWarning[] = [];
  const seen = new Set<string>();
  for (const w of warnings) {
    if (w.severity !== "warn") continue;
    if (!OPERATOR_ACTIONABLE_ANCHORED.has(w.code)) continue;
    const a1 = w.sourceCell?.a1;
    if (a1) {
      const key = `${w.code}\0${w.sourceCell!.gid}\0${a1}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(w);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/operatorActionableWarnings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/dataGaps.ts tests/parser/operatorActionableWarnings.test.ts
git commit --no-verify -m "feat(parser): add OPERATOR_ACTIONABLE_ANCHORED taxonomy + dedup selector"
```

---

## Task 3: `extractCrewRoleAnchors` raw-grid scanner

**Files:**
- Create: `lib/drive/crewRoleAnchors.ts`
- Test: `tests/drive/crewRoleAnchors.test.ts`

**Interfaces:**
- Consumes: `buildAbsGrid` (`lib/drive/sourceAnchors.ts:34`), `clean` (`lib/parser/blocks/_helpers.ts:45`), `SourceAnchor` (`lib/sheet-links/buildSheetDeepLink.ts:3`).
- Produces:
  - `export type CrewRoleAnchor = { name: string; anchor: SourceAnchor }` (`name` = normalized key).
  - `export function normalizeCrewNameKey(s: string): string`.
  - `export function extractCrewRoleAnchors(buffer: ArrayBuffer, titleToGid: Map<string, number>): CrewRoleAnchor[]`.
  - `export function resolveCrewRoleCell(anchors: CrewRoleAnchor[], name: string | undefined | null): SourceAnchor | null` (exactly-one-match-else-null).

- [ ] **Step 1: Write the failing test**

Create `tests/drive/crewRoleAnchors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  extractCrewRoleAnchors,
  resolveCrewRoleCell,
  normalizeCrewNameKey,
} from "@/lib/drive/crewRoleAnchors";

function xlsxBuffer(sheets: Record<string, string[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  const u8 = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayLike<number>);
  return u8.buffer as ArrayBuffer;
}

const GID = new Map([["INFO", 0]]);

// New template: dedicated ROLE column (col C, index 2). NAME at col B (index 1).
const NEW_TPL = {
  INFO: [
    ["CLIENT", "Inst Investor"],
    ["CREW", "NAME", "ROLE", "PHONE"],
    ["", "Doug Larson", "- Load In / Set / Strike / Load Out - LEAD", "917"],
    ["", "Calvin Saller (10/7 and 10/9 ONLY)", "- Load In / Set / Strike / Load Out - BO", "480"],
    ["DRESS", "Black"],
  ],
};

// Old TECH template: name+schedule+role merged in col B (index 1). No ROLE column.
const TECH_TPL = {
  INFO: [
    ["", "TECH", "PHONE", "ARRIVAL", "DEPARTURE"],
    ["", "Eric Weiss - Load In/Set/Strke/Load Out - A1", "508", "", ""],
  ],
};

describe("extractCrewRoleAnchors", () => {
  it("new template → anchors the ROLE-column cell, keyed by normalized NAME", () => {
    const anchors = extractCrewRoleAnchors(xlsxBuffer(NEW_TPL), GID);
    // Doug Larson row = grid row index 2; ROLE column = index 2 → C3.
    expect(resolveCrewRoleCell(anchors, "Doug Larson")).toEqual({ title: "INFO", gid: 0, a1: "C3" });
  });

  it("strips the day-restriction parenthetical from the NAME key (matches blockRef.name)", () => {
    const anchors = extractCrewRoleAnchors(xlsxBuffer(NEW_TPL), GID);
    // blockRef.name is the RAW name cell incl. parenthetical; resolver normalizes both sides.
    expect(resolveCrewRoleCell(anchors, "Calvin Saller (10/7 and 10/9 ONLY)")).toEqual({
      title: "INFO",
      gid: 0,
      a1: "C4",
    });
  });

  it("old TECH template → anchors the compound col-B cell; name = segment before ' - '", () => {
    const anchors = extractCrewRoleAnchors(xlsxBuffer(TECH_TPL), GID);
    // Eric Weiss row = grid row index 1; compound cell = col B (index 1) → B2.
    expect(resolveCrewRoleCell(anchors, "Eric Weiss")).toEqual({ title: "INFO", gid: 0, a1: "B2" });
  });

  it("old TECH template terminates on a section label in ANY column (no wrong-cell past the block)", () => {
    const tpl = {
      INFO: [
        ["", "TECH", "PHONE", "ARRIVAL", "DEPARTURE"],
        ["", "Eric Weiss - Load In/Set/Strke/Load Out - A1", "508", "", ""],
        ["TRANSPORTATION", "", "", "", ""], // terminator in col A (not techCol)
        ["", "Van Co - rental - X", "999", "", ""], // stray "X - Y" compound AFTER the block
      ],
    };
    const anchors = extractCrewRoleAnchors(xlsxBuffer(tpl), GID);
    expect(anchors).toHaveLength(1); // only Eric Weiss; post-terminator row excluded
    expect(resolveCrewRoleCell(anchors, "Van Co")).toBeNull();
  });

  it("ambiguous (two rows clean to same name) → null", () => {
    const dup = {
      INFO: [
        ["CREW", "NAME", "ROLE", "PHONE"],
        ["", "Sam Vale", "- A1", "1"],
        ["", "Sam Vale", "- V1", "2"],
      ],
    };
    const anchors = extractCrewRoleAnchors(xlsxBuffer(dup), GID);
    expect(resolveCrewRoleCell(anchors, "Sam Vale")).toBeNull();
  });

  it("no match → null; non-crew sheet → empty", () => {
    const anchors = extractCrewRoleAnchors(xlsxBuffer(NEW_TPL), GID);
    expect(resolveCrewRoleCell(anchors, "Nobody Here")).toBeNull();
    expect(extractCrewRoleAnchors(xlsxBuffer({ INFO: [["VENUE", "x"]] }), GID)).toEqual([]);
  });

  it("sheet with no gid → no anchors (degrade, never wrong)", () => {
    expect(extractCrewRoleAnchors(xlsxBuffer(NEW_TPL), new Map())).toEqual([]);
  });

  it("normalizeCrewNameKey strips parens, collapses whitespace, lowercases", () => {
    expect(normalizeCrewNameKey("  Doug   Larson (X ONLY) ")).toBe("doug larson");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/drive/crewRoleAnchors.test.ts`
Expected: FAIL — module `@/lib/drive/crewRoleAnchors` does not exist.

- [ ] **Step 3: Implement**

Create `lib/drive/crewRoleAnchors.ts`:

```ts
import * as XLSX from "xlsx";
import { buildAbsGrid, type AbsGrid } from "@/lib/drive/sourceAnchors";
import { clean } from "@/lib/parser/blocks/_helpers";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";

/** An anchor to a crew member's ROLE cell (new template) or compound name+role
 *  cell (old TECH template), keyed by the member's normalized NAME. */
export type CrewRoleAnchor = { name: string; anchor: SourceAnchor };

// Section labels that bound the CREW/TECH block (mirror of the parser's
// TERMINATING_LABELS, lib/parser/blocks/crew.ts:31-48, plus the INFO labels that
// follow the crew block in the standardized template). A row whose first
// non-blank cell matches one ends the block.
const TERMINATORS = new Set([
  "DRESS",
  "TRANSPORTATION",
  "VENUE",
  "DATES",
  "HOTEL",
  "HOTELS",
  "ROOMS",
  "CONTACTS",
  "SCHEDULE",
  "PULL SHEET",
  "PULL",
  "DIAGRAMS",
  "DETAILS",
  "CONTACT OFFICE",
  "CLIENT",
  "DOCUMENT FOLDER LINK",
  "AGENDA LINK",
  "AGENDA",
]);

/** Normalize a crew name for matching: strip markdown escapes (via clean),
 *  drop any parenthetical (day restriction "(6/24 ONLY)"), collapse whitespace,
 *  lowercase. Applied IDENTICALLY to the grid name and the warning's
 *  blockRef.name so the two sides compare for equality. */
export function normalizeCrewNameKey(s: string): string {
  return clean(s)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function firstNonBlankText(grid: AbsGrid, row: number): string {
  for (let c = grid.minCol; c <= grid.maxCol; c++) {
    const v = clean(grid.cell(row, c));
    if (v) return v;
  }
  return "";
}

function isTerminator(text: string): boolean {
  return TERMINATORS.has(text.toUpperCase());
}

// New template: dedicated ROLE column. Anchor the ROLE cell of each crew row.
function collectCrew(
  grid: AbsGrid,
  headerRow: number,
  crewCol: number,
  sheetName: string,
  gid: number,
  out: CrewRoleAnchor[],
): void {
  let nameCol = -1;
  let roleCol = -1;
  for (let c = crewCol; c <= grid.maxCol; c++) {
    const v = clean(grid.cell(headerRow, c)).toUpperCase();
    if (v === "NAME") nameCol = c;
    else if (v === "ROLE") roleCol = c;
  }
  if (nameCol === -1 || roleCol === -1) return; // no ROLE column → cannot cell-anchor
  for (let r = headerRow + 1; r <= grid.maxRow; r++) {
    const first = firstNonBlankText(grid, r);
    if (first && isTerminator(first)) break;
    const nameCell = clean(grid.cell(r, nameCol));
    if (!nameCell) continue; // blank/spacer row
    out.push({
      name: normalizeCrewNameKey(nameCell),
      anchor: { title: sheetName, gid, a1: XLSX.utils.encode_cell({ r, c: roleCol }) },
    });
  }
}

// Old TECH template: name + schedule + role merged in one cell. Mirror
// parseTechBlock (crew.ts:188-194): require " - ", name = segment before it.
function collectTech(
  grid: AbsGrid,
  headerRow: number,
  techCol: number,
  sheetName: string,
  gid: number,
  out: CrewRoleAnchor[],
): void {
  for (let r = headerRow + 1; r <= grid.maxRow; r++) {
    // Terminate on a section label in ANY column (not just techCol) — a TECH
    // block ends when the next section starts, and that label often sits in a
    // different column than the compound cell. Checking only techCol would scan
    // PAST the block and risk a wrong-cell match on a later "X - Y" compound.
    const first = firstNonBlankText(grid, r);
    if (first && isTerminator(first)) break;
    const cell = clean(grid.cell(r, techCol));
    if (!cell) continue;
    const firstDash = cell.indexOf(" - ");
    if (firstDash === -1) continue; // not a "Name - … - role" compound
    out.push({
      name: normalizeCrewNameKey(cell.slice(0, firstDash)),
      anchor: { title: sheetName, gid, a1: XLSX.utils.encode_cell({ r, c: techCol }) },
    });
  }
}

/**
 * Re-scan the RAW workbook to locate each crew member's role cell, keyed by the
 * member's normalized NAME (the synthesis-stable per-row key — the markdown
 * pipeline loses A1, so we reconstruct from the raw grid, mirroring
 * extractShowDayTimeAnchors). Handles BOTH crew-block geometries. A missing gid,
 * absent crew block, or no ROLE column degrades to no anchor — never a wrong one.
 */
export function extractCrewRoleAnchors(
  buffer: ArrayBuffer,
  titleToGid: Map<string, number>,
): CrewRoleAnchor[] {
  const workbook = XLSX.read(buffer, { type: "array", cellText: true, cellDates: false });
  const out: CrewRoleAnchor[] = [];

  for (const sheetName of workbook.SheetNames) {
    if (/\bOLD\b/i.test(sheetName)) continue; // skip archived tabs (mirror synthesis)
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet["!ref"]) continue;
    const gid = titleToGid.get(sheetName);
    if (typeof gid !== "number") continue;

    const grid = buildAbsGrid(sheet);
    for (let r = grid.minRow; r <= grid.maxRow; r++) {
      let headerCol = -1;
      let isTech = false;
      for (let c = grid.minCol; c <= grid.maxCol; c++) {
        const v = clean(grid.cell(r, c)).toUpperCase();
        if (v === "CREW") {
          headerCol = c;
          isTech = false;
          break;
        }
        if (v === "TECH") {
          headerCol = c;
          isTech = true;
          break;
        }
      }
      if (headerCol === -1) continue;
      if (isTech) collectTech(grid, r, headerCol, sheetName, gid, out);
      else collectCrew(grid, r, headerCol, sheetName, gid, out);
      break; // one crew block per sheet
    }
  }

  return out;
}

/**
 * Pick the single anchor whose normalized name equals the warning's normalized
 * blockRef.name. EXACTLY ONE match → its anchor; zero or two-or-more → null, so
 * a wrong-cell link is never produced (mirror resolveSourceCell's ambiguity-null).
 */
export function resolveCrewRoleCell(
  anchors: CrewRoleAnchor[],
  name: string | undefined | null,
): SourceAnchor | null {
  if (!name) return null;
  const key = normalizeCrewNameKey(name);
  const matches = anchors.filter((a) => a.name === key);
  return matches.length === 1 ? matches[0]!.anchor : null;
}
```

Note: `buildAbsGrid` and `AbsGrid` are exported from `lib/drive/sourceAnchors.ts:23,34` — confirm the `AbsGrid` type is exported; it is (`export type AbsGrid`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/drive/crewRoleAnchors.test.ts`
Expected: PASS (all 7 cases, incl. the fixture-known A1 values C3/C4/B2 — the anti-tautology parity assertions).

- [ ] **Step 5: Commit**

```bash
git add lib/drive/crewRoleAnchors.ts tests/drive/crewRoleAnchors.test.ts
git commit --no-verify -m "feat(drive): add extractCrewRoleAnchors raw-grid scanner (both crew geometries)"
```

---

## Task 4: Dispatch-by-code `attachSourceCellAnchors` + unified gate

**Files:**
- Modify: `lib/drive/showDayTimeAnchors.ts:1-103`
- Modify: `tests/drive/showDayTimeAnchors.test.ts` (adapt signature + invert negative-pins)

**Interfaces:**
- Consumes: `OPERATOR_ACTIONABLE_ANCHORED` (Task 2), `CrewRoleAnchor`/`extractCrewRoleAnchors`/`resolveCrewRoleCell` (Task 3).
- Produces:
  - `export type WarningAnchorSources = { showDay: ShowDayTimeAnchor[]; crewRole: CrewRoleAnchor[]; region: Record<string, SourceAnchor> }`.
  - `attachSourceCellAnchors(warnings: ParseWarning[], sources: WarningAnchorSources): void` (NEW signature — dispatches by code).
  - `CELL_ANCHORED_CODES` is now `OPERATOR_ACTIONABLE_ANCHORED` (same reference).

- [ ] **Step 1: Write the failing test**

Replace the existing `attachSourceCellAnchors` + `hasCellAnchoredWarning` tests in `tests/drive/showDayTimeAnchors.test.ts`. The two negative-pins (UNKNOWN_ROLE_TOKEN gets no sourceCell; `hasCellAnchoredWarning` false for it) are INVERTED. New/updated cases:

```ts
import { resolveCrewRoleCell, extractCrewRoleAnchors } from "@/lib/drive/crewRoleAnchors";
// ... existing imports (attachSourceCellAnchors, hasCellAnchoredWarning, etc.) ...

const crewAnchors = [
  { name: "jane doe", anchor: { title: "INFO", gid: 0, a1: "C3" } },
];
const regionAnchors = { crew: { title: "INFO", gid: 0, a1: "A2:D5" } };

it("dispatches by code: ISO→schedule, name→crew, kind→region", () => {
  const warnings: ParseWarning[] = [
    { severity: "warn", code: "SCHEDULE_TIME_UNPARSED", message: "t", blockRef: { kind: "dates", index: 0, iso: "2026-05-12" } },
    { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "r", blockRef: { kind: "crew", index: 0, name: "Jane Doe" } },
    { severity: "warn", code: "FIELD_UNREADABLE", message: "f", blockRef: { kind: "crew", index: 1 } },
  ];
  attachSourceCellAnchors(warnings, { showDay: anchors, crewRole: crewAnchors, region: regionAnchors });
  expect(warnings[0]!.sourceCell).toEqual(anchors[1]!.anchor); // ISO match (existing `anchors` fixture)
  expect(warnings[1]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "C3" }); // crew name match (INVERTED)
  expect(warnings[2]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A2:D5" }); // crew region
});

it("UNKNOWN_DAY_RESTRICTION resolves by crew name too", () => {
  const ws: ParseWarning[] = [
    { severity: "warn", code: "UNKNOWN_DAY_RESTRICTION", message: "d", blockRef: { kind: "crew", index: 0, name: "Jane Doe" } },
  ];
  attachSourceCellAnchors(ws, { showDay: [], crewRole: crewAnchors, region: {} });
  expect(ws[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "C3" });
});

it("FIELD_UNREADABLE with no region for its kind → null (no wrong-region link)", () => {
  const ws: ParseWarning[] = [
    { severity: "warn", code: "FIELD_UNREADABLE", message: "f", blockRef: { kind: "venue", index: 0 } },
  ];
  attachSourceCellAnchors(ws, { showDay: [], crewRole: [], region: {} });
  expect(ws[0]!.sourceCell).toBeUndefined();
});

it("hasCellAnchoredWarning is TRUE for all four anchored codes (INVERTED for UNKNOWN_ROLE_TOKEN)", () => {
  for (const code of ["SCHEDULE_TIME_UNPARSED", "UNKNOWN_ROLE_TOKEN", "UNKNOWN_DAY_RESTRICTION", "FIELD_UNREADABLE"]) {
    expect(hasCellAnchoredWarning([{ severity: "warn", code, message: "x" }])).toBe(true);
  }
  expect(hasCellAnchoredWarning([{ severity: "warn", code: "UNKNOWN_SECTION_HEADER", message: "x" }])).toBe(false);
  expect(hasCellAnchoredWarning([])).toBe(false);
});
```

(Update any other existing call of `attachSourceCellAnchors(warnings, anchors)` in this test file to the new `{ showDay: anchors, crewRole: [], region: {} }` shape.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/drive/showDayTimeAnchors.test.ts`
Expected: FAIL — old signature; UNKNOWN_ROLE_TOKEN not yet anchored; `hasCellAnchoredWarning` returns false for it.

- [ ] **Step 3: Implement**

In `lib/drive/showDayTimeAnchors.ts`:

Add imports near the top:

```ts
import { OPERATOR_ACTIONABLE_ANCHORED } from "@/lib/parser/dataGaps";
import { resolveCrewRoleCell, type CrewRoleAnchor } from "@/lib/drive/crewRoleAnchors";
```

Replace the `CELL_ANCHORED_CODES` declaration (line 9) with the shared set (single source of truth — render gate and population gate cannot drift). **Export it** so the parity test can assert reference identity:

```ts
/** The codes that carry a source-cell/region anchor. SAME OBJECT the render
 *  surfaces gate on (OPERATOR_ACTIONABLE_ANCHORED) so population ↔ render cannot
 *  drift. Name retained for continuity; FIELD_UNREADABLE resolves to a region.
 *  Exported so a structural test can pin the reference identity. */
export const CELL_ANCHORED_CODES = OPERATOR_ACTIONABLE_ANCHORED;
```

Replace `attachSourceCellAnchors` (lines 83-97) with the dispatching version:

```ts
export type WarningAnchorSources = {
  showDay: ShowDayTimeAnchor[];
  crewRole: CrewRoleAnchor[];
  region: Record<string, SourceAnchor>;
};

/**
 * Mutate `warnings` in place, setting `sourceCell` on each anchored warning.
 * Dispatch by code:
 *   - SCHEDULE_TIME_UNPARSED → resolve by blockRef.iso (show-day TIME cell).
 *   - UNKNOWN_ROLE_TOKEN / UNKNOWN_DAY_RESTRICTION → resolve by blockRef.name
 *     against the crew-role cell anchors (exactly-one match else null).
 *   - FIELD_UNREADABLE → the REGION anchor for blockRef.kind (kind-keyed 1:1;
 *     missing kind → null, never a wrong-region link).
 * Best-effort: a warning with no/ambiguous match is left link-less.
 */
export function attachSourceCellAnchors(
  warnings: ParseWarning[],
  sources: WarningAnchorSources,
): void {
  for (const w of warnings) {
    if (!CELL_ANCHORED_CODES.has(w.code)) continue;
    let cell: SourceAnchor | null = null;
    if (w.code === "SCHEDULE_TIME_UNPARSED") {
      cell = resolveSourceCell(sources.showDay, w.blockRef?.iso);
    } else if (w.code === "UNKNOWN_ROLE_TOKEN" || w.code === "UNKNOWN_DAY_RESTRICTION") {
      cell = resolveCrewRoleCell(sources.crewRole, w.blockRef?.name);
    } else if (w.code === "FIELD_UNREADABLE") {
      const kind = w.blockRef?.kind;
      cell = kind ? (sources.region[kind] ?? null) : null;
    }
    if (cell) w.sourceCell = cell;
  }
}
```

`hasCellAnchoredWarning` (lines 99-103) needs no change — it already reads `CELL_ANCHORED_CODES`, which is now the four-code set.

**Build coherence (mandatory — same commit):** the signature change breaks the sole non-test caller, `runOnboardingScan.prepareOne:949`. Update it in THIS task to the new signature (show-day only for now, behavior-preserving) so the tree compiles after the Task 4 commit. Task 6 then replaces this block entirely with the shared helper:

```ts
// runOnboardingScan.ts prepareOne (Task 4: keep the build green; Task 6 swaps to the helper)
if (bytes && parseResult.warnings && hasCellAnchoredWarning(parseResult.warnings)) {
  try {
    const gids = await listSheetGids(file.driveFileId);
    attachSourceCellAnchors(parseResult.warnings, {
      showDay: extractShowDayTimeAnchors(bytes, gids),
      crewRole: [],
      region: {},
    });
  } catch {
    // deep-link anchors are optional; ignore and continue the scan.
  }
}
```

- [ ] **Step 4: Run test + full typecheck to verify the tree compiles**

Run: `pnpm vitest run tests/drive/showDayTimeAnchors.test.ts && pnpm typecheck`
Expected: PASS — both the narrow test AND the whole-tree typecheck (the inline caller update keeps the build green; no other caller of `attachSourceCellAnchors` exists outside tests).

- [ ] **Step 5: Commit**

```bash
git add lib/drive/showDayTimeAnchors.ts lib/sync/runOnboardingScan.ts tests/drive/showDayTimeAnchors.test.ts
git commit --no-verify -m "feat(drive): dispatch attachSourceCellAnchors by code; unify gate with OPERATOR_ACTIONABLE_ANCHORED"
```

---

## Task 5: `attachWarningAnchors` shared helper

**Files:**
- Create: `lib/sync/attachWarningAnchors.ts`
- Test: `tests/sync/attachWarningAnchors.test.ts`

**Interfaces:**
- Consumes: `extractShowDayTimeAnchors`, `attachSourceCellAnchors`, `hasCellAnchoredWarning` (`lib/drive/showDayTimeAnchors.ts`); `extractCrewRoleAnchors` (Task 3); `extractSourceAnchors` (`lib/drive/sourceAnchors.ts`).
- Produces: `export async function attachWarningAnchors(warnings, bytes, resolveGids, regionAnchors?): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `tests/sync/attachWarningAnchors.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import * as XLSX from "xlsx";
import { attachWarningAnchors } from "@/lib/sync/attachWarningAnchors";
import type { ParseWarning } from "@/lib/parser/types";

function xlsxBuffer(aoa: string[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "INFO");
  const u8 = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayLike<number>);
  return u8.buffer as ArrayBuffer;
}

const CREW = xlsxBuffer([
  ["CREW", "NAME", "ROLE", "PHONE"],
  ["", "Jane Doe", "- WIDGETMASTER", "555"],
]);
const gids = () => Promise.resolve(new Map([["INFO", 0]]));

describe("attachWarningAnchors", () => {
  it("attaches crew-role sourceCell (UNKNOWN_ROLE_TOKEN) via the lazy gids thunk", async () => {
    const warnings: ParseWarning[] = [
      { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "x", blockRef: { kind: "crew", index: 0, name: "Jane Doe" } },
    ];
    await attachWarningAnchors(warnings, CREW, gids);
    // ROLE col index 2 → C; data row grid index 1 → row 2 → C2.
    expect(warnings[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "C2" });
  });

  it("does NOT call resolveGids when no anchored warning is present (cost gate)", async () => {
    const resolveGids = vi.fn(gids);
    await attachWarningAnchors(
      [{ severity: "warn", code: "UNKNOWN_SECTION_HEADER", message: "x" }],
      CREW,
      resolveGids,
    );
    expect(resolveGids).not.toHaveBeenCalled();
  });

  it("returns early when bytes are undefined (link-less, no throw)", async () => {
    const warnings: ParseWarning[] = [
      { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "x", blockRef: { kind: "crew", index: 0, name: "Jane Doe" } },
    ];
    await attachWarningAnchors(warnings, undefined, gids);
    expect(warnings[0]!.sourceCell).toBeUndefined();
  });

  it("swallows a thrown error (scan never breaks)", async () => {
    const warnings: ParseWarning[] = [
      { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "x", blockRef: { kind: "crew", index: 0, name: "Jane Doe" } },
    ];
    await expect(
      attachWarningAnchors(warnings, CREW, () => Promise.reject(new Error("boom"))),
    ).resolves.toBeUndefined();
    expect(warnings[0]!.sourceCell).toBeUndefined();
  });

  it("reuses a precomputed region map when supplied (no recompute)", async () => {
    const warnings: ParseWarning[] = [
      { severity: "warn", code: "FIELD_UNREADABLE", message: "f", blockRef: { kind: "crew", index: 0 } },
    ];
    const region = { crew: { title: "INFO", gid: 0, a1: "A1:D2" } };
    await attachWarningAnchors(warnings, CREW, gids, region);
    expect(warnings[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A1:D2" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/sync/attachWarningAnchors.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `lib/sync/attachWarningAnchors.ts`:

```ts
import {
  attachSourceCellAnchors,
  extractShowDayTimeAnchors,
  hasCellAnchoredWarning,
} from "@/lib/drive/showDayTimeAnchors";
import { extractCrewRoleAnchors } from "@/lib/drive/crewRoleAnchors";
import { extractSourceAnchors } from "@/lib/drive/sourceAnchors";
import type { ParseWarning } from "@/lib/parser/types";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";

/**
 * Populate `warnings[*].sourceCell` from the raw workbook, for BOTH ingestion
 * paths (onboarding scan + cron sync). PURE raw-workbook read — NO DB access, NO
 * pg_advisory* call (invariant 2). Best-effort: any failure leaves the warnings
 * link-less and never throws.
 *
 * The cost gate (hasCellAnchoredWarning) runs BEFORE resolveGids, so a
 * warning-free sheet pays no Drive round-trip on either path. `resolveGids` is a
 * lazy thunk: onboarding passes a fetch; cron passes its already-computed
 * titleToGid wrapped in a resolved promise (no extra fetch). Region anchors are
 * self-computed unless the caller supplies them (cron reuses its map).
 */
export async function attachWarningAnchors(
  warnings: ParseWarning[] | undefined,
  bytes: ArrayBuffer | undefined,
  resolveGids: () => Promise<Map<string, number>>,
  regionAnchors?: Record<string, SourceAnchor>,
): Promise<void> {
  if (!bytes || !warnings || !hasCellAnchoredWarning(warnings)) return;
  try {
    const gids = await resolveGids();
    attachSourceCellAnchors(warnings, {
      showDay: extractShowDayTimeAnchors(bytes, gids),
      crewRole: extractCrewRoleAnchors(bytes, gids),
      region: regionAnchors ?? extractSourceAnchors(bytes, gids),
    });
  } catch {
    // deep-link anchors are optional; never break the scan/sync.
  }
}
```

Confirm `extractSourceAnchors(buffer, titleToGid)` signature matches (`lib/drive/sourceAnchors.ts:173`); it takes `(buffer: ArrayBuffer, titleToGid: Map<string, number>)` and returns `Record<string, SourceAnchor>`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/sync/attachWarningAnchors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sync/attachWarningAnchors.ts tests/sync/attachWarningAnchors.test.ts
git commit --no-verify -m "feat(sync): add shared attachWarningAnchors helper (pure read, both ingestion paths)"
```

---

## Task 6: Wire the onboarding scan path to the shared helper

**Files:**
- Modify: `lib/sync/runOnboardingScan.ts:8-11` (imports), `:946-953` (`prepareOne`)
- Modify: `tests/onboarding/prepareSourceCellAnchors.test.ts`

**Interfaces:**
- Consumes: `attachWarningAnchors` (Task 5).

- [ ] **Step 1: Write the failing test**

In `tests/onboarding/prepareSourceCellAnchors.test.ts`:
1. Add a crew fixture + a crew-anchor case asserting UNKNOWN_ROLE_TOKEN gets a `sourceCell` on the onboarding path.
2. Change the existing "does NOT fetch tab gids when no cell-anchored warning" case (lines 79-88) to use a NON-anchored code (`UNKNOWN_SECTION_HEADER`) instead of `UNKNOWN_ROLE_TOKEN` (which IS anchored now).

```ts
const CREW_AOA: string[][] = [
  ["CREW", "NAME", "ROLE", "PHONE"],
  ["", "Jane Doe", "- WIDGETMASTER", "555"],
];

it("attaches sourceCell to an UNKNOWN_ROLE_TOKEN warning (crew ROLE cell) on the onboarding path", async () => {
  const listSheetGids = vi.fn(async () => new Map([["Main", 4242]]));
  const roleWarning: ParseWarning = {
    severity: "warn",
    code: "UNKNOWN_ROLE_TOKEN",
    message: "x",
    blockRef: { kind: "crew", index: 0, name: "Jane Doe" },
  };
  const prepared = await prepareOnboardingFiles(
    "folder-1",
    depsWith([roleWarning], {
      listSheetGids,
      fetchMarkdownWithBinding: vi.fn(async (driveFileId: string) => ({
        binding: { bindingToken: `tok-${driveFileId}`, modifiedTime: "2026-05-08T12:00:00.000Z" },
        markdown: "md",
        bytes: xlsxBuffer(CREW_AOA, "Main"),
      })),
    }),
  );
  expect(listSheetGids).toHaveBeenCalledTimes(1);
  const row = prepared[0]!;
  if (row.kind !== "sheet") throw new Error("expected a sheet row");
  // ROLE col index 2 → C; data row grid index 1 → row 2 → C2.
  expect(row.parseResult.warnings[0]!.sourceCell).toEqual({ title: "Main", gid: 4242, a1: "C2" });
});

// EDIT the existing no-fetch test: swap UNKNOWN_ROLE_TOKEN → UNKNOWN_SECTION_HEADER
it("does NOT fetch tab gids when no cell-anchored warning is present (no extra round-trip)", async () => {
  const listSheetGids = vi.fn(async () => new Map([["Main", 4242]]));
  const other: ParseWarning = { severity: "warn", code: "UNKNOWN_SECTION_HEADER", message: "x" };
  const prepared = await prepareOnboardingFiles("folder-1", depsWith([other], { listSheetGids }));
  expect(listSheetGids).not.toHaveBeenCalled();
  const row = prepared[0]!;
  if (row.kind !== "sheet") throw new Error("expected a sheet row");
  expect(row.parseResult.warnings[0]!.sourceCell).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/onboarding/prepareSourceCellAnchors.test.ts`
Expected: FAIL — the new crew case finds no `sourceCell` (helper not wired in yet).

- [ ] **Step 3: Implement**

In `lib/sync/runOnboardingScan.ts`, replace the three-symbol import (lines 8-11) with the helper:

```ts
import { attachWarningAnchors } from "@/lib/sync/attachWarningAnchors";
```

(Delete the `attachSourceCellAnchors, extractShowDayTimeAnchors, hasCellAnchoredWarning` import from `@/lib/drive/showDayTimeAnchors` — they're no longer referenced here.)

Replace the inline anchor block in `prepareOne` (lines 943-953) with:

```ts
    // Best-effort exact-cell/region deep links on BOTH ingestion paths via the
    // shared helper (pure raw-workbook read; gated internally so a warning-free
    // sheet pays no extra fetch). Onboarding passes a lazy gids fetch; the helper
    // self-computes region anchors.
    await attachWarningAnchors(parseResult.warnings, bytes, () =>
      listSheetGids(file.driveFileId),
    );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/onboarding/prepareSourceCellAnchors.test.ts`
Expected: PASS (incl. the still-green SCHEDULE_TIME_UNPARSED case — the helper preserves that path).

- [ ] **Step 5: Commit**

```bash
git add lib/sync/runOnboardingScan.ts tests/onboarding/prepareSourceCellAnchors.test.ts
git commit --no-verify -m "feat(sync): route onboarding scan anchor population through the shared helper"
```

---

## Task 7: Wire the cron sync path to the shared helper

**Files:**
- Modify: `lib/sync/runScheduledCronSync.ts` (import + insert after `:2443`)
- Modify: `tests/sync/sourceAnchorsPipeline.test.ts`

**Interfaces:**
- Consumes: `attachWarningAnchors` (Task 5); the existing `prepareProcessOneFile` harness (`tests/sync/sourceAnchorsPipeline.test.ts`).

- [ ] **Step 1: Write the failing test**

Add to `tests/sync/sourceAnchorsPipeline.test.ts` (inside the `describe("sourceAnchors pipeline (Task 5)")` block or a new `describe`), a cron crew-anchor case:

```ts
test("cron path attaches crew-role sourceCell to UNKNOWN_ROLE_TOKEN (parse-warning deep links)", async () => {
  const DRIVE_FILE_ID = "file-crew-1";
  const CREW_BYTES = makeXlsx([
    {
      name: "INFO",
      rows: [
        ["CREW", "NAME", "ROLE", "PHONE"],
        ["", "Jane Doe", "- WIDGETMASTER", "555"],
      ],
    },
  ]);
  const deps: ProcessOneFileDeps = {
    captureBinding: async () => BINDING,
    fetchMarkdownAtRevision: async () => "",
    fetchXlsxBytes: async () => CREW_BYTES,
    parseSheet: () =>
      emptyParsedSheet({
        warnings: [
          {
            severity: "warn",
            code: "UNKNOWN_ROLE_TOKEN",
            message: "x",
            blockRef: { kind: "crew", index: 0, name: "Jane Doe" },
          },
        ],
      }),
    driveClient: {
      async getFile() {
        return {
          driveFileId: DRIVE_FILE_ID,
          headRevisionId: "rev-1",
          md5Checksum: "a".repeat(32),
          mimeType: "application/vnd.google-apps.spreadsheet",
          modifiedTime: "2026-01-01T00:00:00.000Z",
        };
      },
      async listFolder() {
        return { folderId: "folder-1", files: [] };
      },
      listSpreadsheetSheets: async () => SHEETS_RESPONSE,
    },
  };

  const prepared = await prepareProcessOneFile(
    DRIVE_FILE_ID,
    "cron",
    makeFileMeta(DRIVE_FILE_ID),
    deps,
    async () => null,
  );
  expect(prepared.kind).toBe("ready");
  if (prepared.kind !== "ready") return;
  // ROLE col index 2 → C; data row grid index 1 → row 2 → C2.
  expect(prepared.parseResult.warnings[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "C2" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/sync/sourceAnchorsPipeline.test.ts -t "cron path attaches crew-role"`
Expected: FAIL — `sourceCell` is undefined (helper not invoked on the cron path yet).

- [ ] **Step 3: Implement**

In `lib/sync/runScheduledCronSync.ts`, add the import near the other sync imports:

```ts
import { attachWarningAnchors } from "@/lib/sync/attachWarningAnchors";
```

In `prepareProcessOneFile`, immediately after the `sourceAnchors` computation (line 2443, `const sourceAnchors: Record<string, SourceAnchor> = xlsxBytes !== undefined ? extractSourceAnchors(xlsxBytes, titleToGid) : {};`), insert:

```ts
  // Populate per-warning source-cell/region deep-link anchors on the cron path
  // (parse-warning deep links). Pure raw-workbook read inside the existing prepare
  // stage — no new lock (invariant 2). Reuse the already-computed titleToGid +
  // sourceAnchors (no extra fetch / recompute).
  await attachWarningAnchors(
    enriched.warnings,
    xlsxBytes,
    async () => titleToGid,
    sourceAnchors,
  );
```

(`enriched` is the `ParseResult` from line 2410; `xlsxBytes` is `ArrayBuffer | undefined`; `titleToGid` is the gids map; `sourceAnchors` is the region map. The mutated `enriched.warnings` flow to `parseResult: enriched` at line 2475 and persist to `shows_internal.parse_warnings` downstream unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/sync/sourceAnchorsPipeline.test.ts`
Expected: PASS (the new cron case + the existing venue/persistence cases stay green).

- [ ] **Step 5: Commit**

```bash
git add lib/sync/runScheduledCronSync.ts tests/sync/sourceAnchorsPipeline.test.ts
git commit --no-verify -m "feat(sync): populate parse-warning anchors on the cron path via the shared helper"
```

---

## Task 8: Per-show panel renders operator-actionable warnings + deep links

**Files:**
- Modify: `app/admin/show/[slug]/page.tsx:260-288` (`readDataQuality`), `:719-782` (panel JSX)
- Test: `tests/admin/perShowDataQualityActionable.test.tsx` (create)

**Interfaces:**
- Consumes: `operatorActionableWarnings` (Task 2), `buildSheetDeepLink` (`lib/sheet-links/buildSheetDeepLink.ts`), `isMessageCode`/`messageFor` (`lib/messages/lookup.ts`), `MessageCode` (`lib/messages/catalog.ts`).

UI surface → invariant 8 (impeccable) applies at Task 11.

- [ ] **Step 1: Write the failing test**

Create `tests/admin/perShowDataQualityActionable.test.tsx`. Because the panel is RSC, test the pure render contract by extracting the operator-actionable subsection into a small client/presentational component `PerShowActionableWarnings` (create `components/admin/PerShowActionableWarnings.tsx`) and test THAT (the page composes it). The test asserts: (a) renders the catalog title (not the raw code/message) for `UNKNOWN_ROLE_TOKEN`; (b) renders an "Open in Sheet" link when `sourceCell` present; (c) no link when absent.

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import type { ParseWarning } from "@/lib/parser/types";

const dfid = "drivefile123";

describe("PerShowActionableWarnings", () => {
  it("renders the catalog TITLE for UNKNOWN_ROLE_TOKEN, never the raw code", () => {
    const ws: ParseWarning[] = [
      { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "Unknown role token: 'WIDGET'", sourceCell: { title: "INFO", gid: 0, a1: "C3" } },
    ];
    render(<PerShowActionableWarnings warnings={ws} driveFileId={dfid} />);
    expect(screen.getByText("Role we didn't recognize")).toBeInTheDocument();
    expect(screen.queryByText("UNKNOWN_ROLE_TOKEN")).not.toBeInTheDocument();
  });

  it("renders an Open-in-Sheet link to the resolved cell when sourceCell present", () => {
    const ws: ParseWarning[] = [
      { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "x", sourceCell: { title: "INFO", gid: 0, a1: "C3" } },
    ];
    render(<PerShowActionableWarnings warnings={ws} driveFileId={dfid} />);
    const link = screen.getByRole("link", { name: /open in sheet/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("range=C3"));
  });

  it("renders no link when sourceCell is absent", () => {
    const ws: ParseWarning[] = [{ severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "x" }];
    render(<PerShowActionableWarnings warnings={ws} driveFileId={dfid} />);
    expect(screen.queryByRole("link", { name: /open in sheet/i })).not.toBeInTheDocument();
  });

  it("renders nothing when there are no operator-actionable warnings", () => {
    const { container } = render(<PerShowActionableWarnings warnings={[]} driveFileId={dfid} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/admin/perShowDataQualityActionable.test.tsx`
Expected: FAIL — `PerShowActionableWarnings` does not exist.

- [ ] **Step 3: Implement**

Create `components/admin/PerShowActionableWarnings.tsx`:

```tsx
import { isMessageCode, messageFor } from "@/lib/messages/lookup";
import type { MessageCode } from "@/lib/messages/catalog";
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";
import { renderEmphasis } from "@/components/messages/renderEmphasis";
import { operatorActionableWarnings } from "@/lib/parser/dataGaps";
import type { ParseWarning } from "@/lib/parser/types";

/**
 * Operator-actionable parse warnings on the per-show Data Quality panel, with a
 * source-sheet deep link when the scan resolved the offending cell/region.
 * Renders the catalog TITLE (else the human .message) — never the bare code
 * (invariant 5). Deduped + stable-ordered via operatorActionableWarnings.
 */
export function PerShowActionableWarnings({
  warnings,
  driveFileId,
}: {
  warnings: ParseWarning[];
  driveFileId: string | null;
}) {
  const items = operatorActionableWarnings(warnings);
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2" data-testid="per-show-actionable-warnings">
      {items.map((w, i) => {
        const entry = isMessageCode(w.code) ? messageFor(w.code as MessageCode) : null;
        const title = (entry?.title ?? null) || w.message;
        const context = entry?.helpfulContext ?? null;
        const href = w.sourceCell ? buildSheetDeepLink(driveFileId, w.sourceCell) : null;
        return (
          <li
            key={`${w.code}-${i}`}
            data-testid="per-show-actionable-item"
            className="flex flex-col gap-0.5 rounded-sm border border-border bg-warning-bg p-3 text-sm text-warning-text"
          >
            <span className="font-medium text-text-strong">{renderEmphasis(title)}</span>
            {context ? <span className="text-xs text-text-subtle">{renderEmphasis(context)}</span> : null}
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="self-start text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                Open in Sheet <span aria-hidden="true">↗</span>
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
```

In `app/admin/show/[slug]/page.tsx`, widen `readDataQuality` to also return the actionable warnings + the show's `drive_file_id`. Change the return type to `{ messages: string[]; actionable: ParseWarning[]; failed: boolean }` and the success return:

```ts
    const messages = warnings
      .filter(isDataQualityWarning)
      .map((w) => w.message)
      .filter((m): m is string => typeof m === "string" && m.length > 0);
    return { messages, actionable: warnings, failed: false };
```

(Set `actionable: []` in both failure returns. The component filters via `operatorActionableWarnings`, so passing all `warnings` is fine.)

In the panel JSX, render `<PerShowActionableWarnings>` as a sibling block. The panel already renders when `dataQuality.messages.length > 0`; broaden the render condition so the panel also shows when there are actionable warnings, and mount the component inside the section (after the data-gap `<ul>`):

```tsx
{/* operator-actionable parse warnings with source-sheet deep links */}
<PerShowActionableWarnings warnings={dataQuality.actionable} driveFileId={show.drive_file_id} />
```

Adjust the panel's outer condition to `dataQuality.failed ? (…) : (dataQuality.messages.length > 0 || operatorActionableWarnings(dataQuality.actionable).length > 0) ? (… section …) : null`. Import `operatorActionableWarnings` + `PerShowActionableWarnings` at the top. Confirm `show.drive_file_id` is in scope on the page (the page already loads the `show` row; if the column isn't selected, add `drive_file_id` to its select).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/admin/perShowDataQualityActionable.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/PerShowActionableWarnings.tsx "app/admin/show/[slug]/page.tsx" tests/admin/perShowDataQualityActionable.test.tsx
git commit --no-verify -m "feat(admin): render operator-actionable parse warnings + deep links on the per-show panel"
```

---

## Task 9: StagedReviewCard renders operator-actionable warnings + deep links

**Files:**
- Modify: `components/admin/StagedReviewCard.tsx` (StagedRow type + render region ~`:541-565`)
- Modify: every StagedRow construction site (Site A `app/admin/show/staged/[stagedId]/page.tsx:175-191`; Site B `app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx:225-237`; plus any "live" site found via grep)
- Test: `tests/components/stagedReviewActionable.test.tsx` (create)

**Interfaces:**
- Reuses `PerShowActionableWarnings` (Task 8) for the render (DRY — one operator-actionable renderer).

- [ ] **Step 1: Write the failing test**

Create `tests/components/stagedReviewActionable.test.tsx` asserting that when a `StagedRow` carries `operatorActionable` warnings with `sourceCell`, the card renders the title + "Open in Sheet" link:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StagedReviewCard, type StagedRow } from "@/components/admin/StagedReviewCard";
import type { ParseWarning } from "@/lib/parser/types";

function baseRow(over: Partial<StagedRow> = {}): StagedRow {
  return {
    driveFileId: "df1",
    stagedId: "s1",
    sourceKind: "cron",
    stagedModifiedTime: "2026-01-01T00:00:00.000Z",
    baseModifiedTime: null,
    warningSummary: "",
    triggeredReviewItems: [],
    ...over,
  };
}

describe("StagedReviewCard operator-actionable warnings", () => {
  it("renders the title + Open-in-Sheet link for an anchored UNKNOWN_ROLE_TOKEN", () => {
    const actionable: ParseWarning[] = [
      { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "x", sourceCell: { title: "INFO", gid: 0, a1: "C3" } },
    ];
    render(<StagedReviewCard row={baseRow({ operatorActionable: actionable })} />);
    expect(screen.getByText("Role we didn't recognize")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open in sheet/i })).toHaveAttribute(
      "href",
      expect.stringContaining("range=C3"),
    );
  });

  it("renders nothing extra when operatorActionable is empty/absent", () => {
    render(<StagedReviewCard row={baseRow()} />);
    expect(screen.queryByText("Role we didn't recognize")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/stagedReviewActionable.test.tsx`
Expected: FAIL — `StagedRow` has no `operatorActionable`; card renders nothing.

- [ ] **Step 3: Implement**

In `components/admin/StagedReviewCard.tsx`:
- Add to `StagedRow` (after `dataGaps?`): `operatorActionable?: ParseWarning[];` (import `ParseWarning` from `@/lib/parser/types`).
- After the data-gaps `<ul>` block (~line 565), mount the shared renderer:

```tsx
{row.operatorActionable && row.operatorActionable.length > 0 ? (
  <PerShowActionableWarnings warnings={row.operatorActionable} driveFileId={row.driveFileId} />
) : null}
```

Import `PerShowActionableWarnings` from `@/components/admin/PerShowActionableWarnings`.

At each StagedRow construction site, derive `operatorActionable` from the parse warnings using the selector:
- **Site A** (`app/admin/show/staged/[stagedId]/page.tsx:179-190`): add `operatorActionable: operatorActionableWarnings(warnings),` (the `warnings` local already exists at line 177).
- **Site B** (`app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx:225-237`): extract `const warnings = Array.isArray(row.parse_result?.warnings) ? row.parse_result!.warnings! : [];` then add `operatorActionable: operatorActionableWarnings(warnings),`.
- Run `rg -n "triggeredReviewItems:" app/ components/` to find any OTHER StagedRow construction (e.g. a "live" staged site); add the same derivation there. (`operatorActionable` is optional → a missed site degrades to no list, never a crash, but wire all found.)

Import `operatorActionableWarnings` from `@/lib/parser/dataGaps` at each site.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/stagedReviewActionable.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/StagedReviewCard.tsx "app/admin/show/staged/[stagedId]/page.tsx" "app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx" tests/components/stagedReviewActionable.test.tsx
git commit --no-verify -m "feat(admin): render operator-actionable parse warnings + deep links on StagedReviewCard (all modes)"
```

---

## Task 10: Real Step-3 link test + invariant-5 meta-test + gate-identity pin

**Files:**
- Modify: `tests/components/step3SheetCard.test.tsx` (extend with a real positive-link case)
- Create: `tests/parser/parseWarningDeepLinkRender.test.tsx`

**Interfaces:** none new — asserts cross-surface invariants against the REAL surfaces.

- [ ] **Step 1a: Extend the REAL Step-3 surface test (not a proxy)**

`Step3SheetCard` needs no code change — but the spec requires verifying it renders the link for the NEW codes on the actual surface. Open `tests/components/step3SheetCard.test.tsx`; it already builds a `Step3Row` with `parseResult.warnings` and asserts a `no sourceCell` case (the existing test around the `wizard-step3-card-<dfid>-warning-...` testids). Mirror that row builder and add a positive case: a warning of a NEW operator-actionable code carrying a `sourceCell`, asserting the open-link renders to that cell. Use the component's real testids (`wizard-step3-card-${dfid}-warning-${i}-open`):

```tsx
it("renders an Open-in-Sheet link for an UNKNOWN_ROLE_TOKEN that resolved a sourceCell", () => {
  // Reuse this file's existing Step3Row builder; set the row's parseResult.warnings to:
  const warnings = [
    {
      severity: "warn" as const,
      code: "UNKNOWN_ROLE_TOKEN",
      message: "Unknown role token: 'WIDGET'",
      sourceCell: { title: "INFO", gid: 0, a1: "C3" },
    },
  ];
  // render <Step3SheetCard row={<builder with warnings>} ... /> exactly as the
  // existing "no sourceCell" test renders it (same dfid + props), then:
  const link = screen.getByTestId(`wizard-step3-card-${DFID}-warning-0-open`);
  expect(link).toHaveAttribute("href", expect.stringContaining("range=C3"));
  // invariant 5: the rendered title is the catalog title, not the raw code
  expect(screen.getByText("Role we didn't recognize")).toBeInTheDocument();
});
```

(`DFID` = the drive-file-id constant the existing test already uses for its testids. Reuse the file's `render`/`screen` imports and its Step3Row factory — do not invent a new fixture.)

- [ ] **Step 1b: Write the failing cross-surface invariant test**

Create `tests/parser/parseWarningDeepLinkRender.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { OPERATOR_ACTIONABLE_ANCHORED } from "@/lib/parser/dataGaps";
import { CELL_ANCHORED_CODES, hasCellAnchoredWarning } from "@/lib/drive/showDayTimeAnchors";
import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import type { ParseWarning } from "@/lib/parser/types";

// Realistic, human, NON-code messages per code (mirrors what each producer emits)
// so the invariant-5 assertion is real for ALL FOUR, with no exemption.
const HUMAN_MESSAGE: Record<string, string> = {
  SCHEDULE_TIME_UNPARSED: "We couldn't read a start time for one of the show days",
  UNKNOWN_ROLE_TOKEN: "Unknown role token in a crew member's role cell",
  UNKNOWN_DAY_RESTRICTION: "Role cell contains *** but no explicit day dates found",
  FIELD_UNREADABLE: "We couldn't read this crew member's phone number",
};

describe("parse-warning deep-link render invariants", () => {
  it("population gate IS the render gate — same object reference (no drift)", () => {
    // Pins the ratified 'one set' contract structurally: a future duplicate set
    // with the same members would FAIL this identity assertion.
    expect(CELL_ANCHORED_CODES).toBe(OPERATOR_ACTIONABLE_ANCHORED);
  });

  it("hasCellAnchoredWarning is true for every anchored code, false otherwise", () => {
    for (const code of OPERATOR_ACTIONABLE_ANCHORED) {
      expect(hasCellAnchoredWarning([{ severity: "warn", code, message: "x" }])).toBe(true);
    }
    expect(hasCellAnchoredWarning([{ severity: "warn", code: "UNKNOWN_SECTION_HEADER", message: "x" }])).toBe(false);
  });

  it("never renders the raw §12.4 code for ANY of the four codes (invariant 5)", () => {
    for (const code of OPERATOR_ACTIONABLE_ANCHORED) {
      const ws: ParseWarning[] = [
        { severity: "warn", code, message: HUMAN_MESSAGE[code]!, sourceCell: { title: "INFO", gid: 0, a1: "A1" } },
      ];
      const { container, unmount } = render(<PerShowActionableWarnings warnings={ws} driveFileId="df" />);
      // No exemption: the literal code string must never appear, for every code.
      expect(container.textContent).not.toContain(code);
      unmount();
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they pass (or catch a real drift)**

Run: `pnpm vitest run tests/parser/parseWarningDeepLinkRender.test.tsx tests/components/step3SheetCard.test.tsx`
Expected: PASS once Tasks 2-9 are in. A failure here is a REAL drift (gate split, raw-code leak, or Step-3 link regression) — fix the offending surface, do not weaken the test. Note: the identity assertion requires `CELL_ANCHORED_CODES` to be exported from `showDayTimeAnchors.ts` (Task 4).

- [ ] **Step 3: (No new impl — guard tests only.)** If a code's catalog `.message` could itself equal its code on some producer, that is a real invariant-5 violation in that producer — fix the producer, not the test.

- [ ] **Step 4: Re-run**

Run: `pnpm vitest run tests/parser/parseWarningDeepLinkRender.test.tsx tests/components/step3SheetCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/parser/parseWarningDeepLinkRender.test.tsx tests/components/step3SheetCard.test.tsx
git commit --no-verify -m "test: pin real Step-3 link, invariant-5 (all 4 codes), and gate-identity for parse-warning deep links"
```

---

## Task 11: Full verification + impeccable dual-gate

**Files:** none (verification + UI gate).

- [ ] **Step 1: Typecheck + format (the exact CI commands)**

Run:
```bash
pnpm typecheck
pnpm format:check
```
Expected: both PASS. (`pnpm typecheck` runs the pretypecheck generators and typechecks tests too — it catches errors `pnpm tsc --noEmit` misses.) Fix any type errors (esp. the `attachSourceCellAnchors` signature change ripple and the StagedRow site derivations). If `format:check` fails, run `pnpm prettier --write` on the changed files and re-check.

- [ ] **Step 2: Run the full affected test surface**

Run:
```bash
pnpm vitest run tests/parser tests/drive tests/sync tests/onboarding tests/admin tests/components
```
Expected: PASS (env-gated DB tests may skip locally — that's expected; they run in CI).

- [ ] **Step 3: impeccable critique on the UI diff**

The three UI surfaces (`StagedReviewCard.tsx`, `app/admin/show/[slug]/page.tsx`, `components/admin/PerShowActionableWarnings.tsx`) are UI → invariant 8. Run `/impeccable critique` on the diff with the canonical v3 preflight gates (PRODUCT.md / DESIGN.md / register / preflight). Fix HIGH/CRITICAL findings or record a `DEFERRED.md` entry. Record findings + dispositions for the milestone close-out.

- [ ] **Step 4: impeccable audit on the UI diff**

Run `/impeccable audit` on the same diff. Same disposition rule. Both commands must pass before the cross-model whole-diff review.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit --no-verify -m "chore: typecheck/format/impeccable fixes for parse-warning deep links"
```

---

## Adversarial review (cross-model)

After the self-review below, invoke the cross-CLI adversarial review (Codex) on the WHOLE diff. Iterate to APPROVE (reviewer-only; do not let it fix). Do not proceed to execution handoff / merge without an APPROVE.

---

## Self-Review (run after drafting — checklist, not a subagent)

1. **Spec coverage:** §3 taxonomy → Task 2; §4 four codes → Tasks 1,3,4,8,9; §5.1 blockRef.name → Task 1; §5.2 emission → Task 1; §5.3 scanner → Task 3; §5.4 dispatch+gate → Task 4; §5.5 FIELD_UNREADABLE region → Task 4; §5.6 shared helper + both paths → Tasks 5,6,7; §6 surfaces → Tasks 8,9,10; §6.1 guards/dedup → Tasks 2,8; §9 companion-surface parity → Task 3 (fixture-known A1); §10 meta-tests → Tasks 4,10; §11 testing → every task. No gaps.
2. **Placeholder scan:** no TBD/TODO; every code step has real code.
3. **Type consistency:** `WarningAnchorSources` shape consistent (Tasks 4,5); `CrewRoleAnchor`/`resolveCrewRoleCell` consistent (Tasks 3,4); `operatorActionableWarnings` signature consistent (Tasks 2,8,9); `attachWarningAnchors` signature consistent (Tasks 5,6,7).
