# Row-precise UNKNOWN_FIELD anchoring + label surfacing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Step-3 review count and the admin Data-quality count agree for "Unrecognized row in sheet" warnings, point each warning's "Open in Sheet" link at the exact unrecognized row (not the block header), and show which row label is unrecognized.

**Architecture:** Mirror the existing crew-role cell-anchor precedent (`lib/drive/crewRoleAnchors.ts`): re-scan the raw workbook in the anchoring layer and resolve each `UNKNOWN_FIELD` warning to its label cell by a `(kind, label, value)` semantic key with an exactly-one-match-else-null guard. Distinct per-row anchors make the admin dedup preserve all rows (Part B, automatic). A read-time shim neutralizes stale block-region anchors on already-persisted shows (Part D). The UI surfaces the row label from `rawSnippet` (Part A).

**Tech Stack:** TypeScript, Next.js 16 (App Router), Vitest, `xlsx` (SheetJS), React 19.

**Spec:** `docs/superpowers/specs/2026-07-01-unknownfield-row-anchor.md` (APPROVED, Codex 4 rounds).

## Global Constraints

- **Invariant 1 — TDD per task.** Failing test → minimal impl → green → commit. One task per commit; conventional-commits (`<type>(<scope>): <summary>`). Never impl before its test.
- **Invariant 5 — no raw error codes in UI.** The surfaced row label is *sheet content* (not a §12.4 code); render it like the existing `w.message`/`context` (via `renderEmphasis`). Codes still route through `lib/messages/lookup.ts`. No catalog/§12.4 change in this plan.
- **Invariant 8 — impeccable dual-gate.** UI diff (`components/admin/wizard/Step3SheetCard.tsx`, `components/admin/PerShowActionableWarnings.tsx`) ships only after `/impeccable critique` AND `/impeccable audit`; HIGH/CRITICAL fixed or deferred via `DEFERRED.md`. UI work is Opus-only.
- **Invariant 9 — Supabase call-boundary.** N/A to new code: `extractUnknownFieldAnchors` is a pure raw-workbook read (no Supabase client, no advisory lock, invariant-2-safe). Keep it that way.
- **No DB migration.** `blockRef.name` rides the existing jsonb columns; `sourceCell` shape unchanged. No `supabase/migrations/**`, no `pnpm gen:schema-manifest`, no validation-project apply.
- **Never a wrong-cell link.** Every resolver returns the correct cell or `null` — never a wrong cell (spec §5.1.1).
- **Verify against the live sheet** `1XQ44uxc44pToYxQnYw4OG9V6DjE7bC5EU08o5iFpxz4`, INFO tab `gid=0` (via gsheets MCP) before final close-out (Task 10).

### Declarations (mandatory per AGENTS.md writing-plans additions)

- **Meta-test inventory:** NONE of the structural registries apply. No new Supabase call boundary (`tests/auth/_metaInfraContract.test.ts` — the new extractor is a pure workbook read, same class as `extractCrewRoleAnchors`, which is not registered there). No advisory-lock surface (`advisoryLockRpcDeadlock.test.ts`). No `admin_alerts` catalog row (`_metaAdminAlertCatalog`). No sentinel-hiding tile (`_metaSentinelHidingContract`). No new §12.4 code. No inline email normalization (`no-inline-email-normalization`). New coverage is plain unit/component tests co-located with the touched modules.
- **Advisory-lock holder topology:** N/A — the plan touches no `pg_advisory*` call path.
- **Layout-dimensions task:** N/A — Part A adds a content-height muted text line; no fixed-dimension parent containing flex/grid children whose height could collapse. (`step3-card-dimensions.spec.ts` already pins the card's own dimensions and must still pass unchanged.)
- **Transition-audit task:** N/A — no `AnimatePresence`, ternary-swap of animated nodes, or multi-state animated component in the touched files. The warning list is a static render; the added label line has no transition.

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `lib/parser/rawSnippet.ts` | Pure helpers: split `"<label> \| <value>"` → label / value | Create |
| `lib/parser/warnings.ts` | `emitUnknownField` stashes label in `blockRef.name` | Modify (:127-134) |
| `lib/drive/unknownFieldAnchors.ts` | Re-scan workbook → per-row `(kind,label,value)→cell` anchors; resolve exactly-one-else-null | Create |
| `lib/drive/showDayTimeAnchors.ts` | `WarningAnchorSources.unknownField`; dispatch `UNKNOWN_FIELD` → per-row cell; remove from region fallback | Modify (:98-102, :123-149) |
| `lib/sync/attachWarningAnchors.ts` | Wire the 4th `safe()`-wrapped source family | Modify (:6, :46-50) |
| `lib/parser/dataGaps.ts` | `stripLegacyUnknownFieldAnchors` + `selectActionableForDisplay` (Part D + tested read-boundary seam) | Modify (add fns near :152) |
| `app/admin/show/[slug]/page.tsx` | Use `selectActionableForDisplay` at the actionable read boundary | Modify (:325) |
| `components/admin/wizard/Step3SheetCard.tsx` | Apply shim at Step-3 read; surface label (Part A) | Modify (:1496, WarningsBreakdown :826-848) |
| `components/admin/PerShowActionableWarnings.tsx` | Surface label (Part A) | Modify (:44) |

Tests: `tests/parser/rawSnippet.test.ts` (new), `tests/parser/warnings.test.ts`, `tests/drive/unknownFieldAnchors.test.ts` (new), `tests/sync/attachWarningAnchors.test.ts`, `tests/drive/showDayTimeAnchors.test.ts`, `tests/parser/operatorActionableWarnings.test.ts`, `tests/parser/dataGaps.test.ts`, `tests/components/admin/perShowDataQualityActionable.test.tsx`, `tests/components/step3SheetCard.test.tsx`.

---

## Task 1: rawSnippet label/value helpers

**Files:**
- Create: `lib/parser/rawSnippet.ts`
- Test: `tests/parser/rawSnippet.test.ts`

**Interfaces:**
- Produces: `labelFromRawSnippet(raw: string | null | undefined): string | null` (text before the FIRST `" | "`, trimmed; `null` if no `" | "` or empty). `valueFromRawSnippet(raw: string | null | undefined): string | null` (everything after the first `" | "`, preserving embedded `" | "`; `null` if no `" | "`, may be `""`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/rawSnippet.test.ts
import { describe, it, expect } from "vitest";
import { labelFromRawSnippet, valueFromRawSnippet } from "@/lib/parser/rawSnippet";

describe("rawSnippet helpers", () => {
  it("splits label and value on the first ' | '", () => {
    expect(labelFromRawSnippet("GS Podium Type | (2) Acrylic Podium")).toBe("GS Podium Type");
    expect(valueFromRawSnippet("GS Podium Type | (2) Acrylic Podium")).toBe("(2) Acrylic Podium");
  });
  it("preserves ' | ' inside the value", () => {
    expect(labelFromRawSnippet("Internet | Wifi | Passcode")).toBe("Internet");
    expect(valueFromRawSnippet("Internet | Wifi | Passcode")).toBe("Wifi | Passcode");
  });
  it("returns null when there is no ' | '", () => {
    expect(labelFromRawSnippet("no separator here")).toBeNull();
    expect(valueFromRawSnippet("no separator here")).toBeNull();
  });
  it("handles empty value after the separator", () => {
    expect(labelFromRawSnippet("Notes | ")).toBe("Notes");
    expect(valueFromRawSnippet("Notes | ")).toBe("");
  });
  it("returns null for null/undefined/blank label", () => {
    expect(labelFromRawSnippet(null)).toBeNull();
    expect(labelFromRawSnippet(undefined)).toBeNull();
    expect(labelFromRawSnippet(" | value")).toBeNull(); // blank label
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/rawSnippet.test.ts`
Expected: FAIL — cannot find module `@/lib/parser/rawSnippet`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/parser/rawSnippet.ts
// emitUnknownField writes rawSnippet as `${key} | ${value}` (lib/parser/warnings.ts).
// These pure helpers recover the label (before the FIRST " | ") and the value
// (everything after it, which may itself contain " | "). Used by the anchor
// dispatch (value → provenance match) and the UI (label → operator-visible row id).
const SEP = " | ";

export function labelFromRawSnippet(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const i = raw.indexOf(SEP);
  if (i < 0) return null;
  const label = raw.slice(0, i).trim();
  return label.length > 0 ? label : null;
}

export function valueFromRawSnippet(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const i = raw.indexOf(SEP);
  if (i < 0) return null;
  return raw.slice(i + SEP.length);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/rawSnippet.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/parser/rawSnippet.ts tests/parser/rawSnippet.test.ts
git commit --no-verify -m "feat(parser): rawSnippet label/value split helpers"
```

---

## Task 2: emitUnknownField stashes the label in blockRef.name

**Files:**
- Modify: `lib/parser/warnings.ts:120-135`
- Test: `tests/parser/warnings.test.ts`

**Interfaces:**
- Produces: every `UNKNOWN_FIELD` warning now carries `blockRef: { kind, name: <label> }` (the raw label key). `rawSnippet` unchanged.

- [ ] **Step 1: Write the failing test** (append to `tests/parser/warnings.test.ts`)

```ts
import { emitUnknownField } from "@/lib/parser/warnings";

it("emitUnknownField carries the row label in blockRef.name", () => {
  const agg = { warnings: [], rawUnrecognized: [] } as any;
  emitUnknownField(agg, { block: "event_details", kind: "details", key: "GS Podium Type", value: "(2) Acrylic Podium" });
  expect(agg.warnings).toHaveLength(1);
  expect(agg.warnings[0]).toMatchObject({
    code: "UNKNOWN_FIELD",
    blockRef: { kind: "details", name: "GS Podium Type" },
    rawSnippet: "GS Podium Type | (2) Acrylic Podium",
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/warnings.test.ts -t "blockRef.name"`
Expected: FAIL — `blockRef` is `{ kind: "details" }`, missing `name`.

- [ ] **Step 3: Write minimal implementation** — in `lib/parser/warnings.ts`, change the push in `emitUnknownField` (line 131):

```ts
  agg.warnings.push({
    severity: "warn",
    code: "UNKNOWN_FIELD",
    message: `Unrecognized ${opts.block} row label: '${key}'`,
    blockRef: { kind: opts.kind, name: opts.key },
    rawSnippet: `${key} | ${value}`,
  });
```

(`opts.key` is the raw label; `key` is `opts.key.trim()` used in the message. `blockRef.name` uses the raw `opts.key`; the resolver normalizes both sides anyway.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/warnings.test.ts` then `pnpm vitest run tests/parser/`
Expected: PASS; no warning-shape snapshot broke.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/warnings.ts tests/parser/warnings.test.ts
git commit --no-verify -m "feat(parser): thread UNKNOWN_FIELD row label into blockRef.name"
```

---

## Task 3: unknownFieldAnchors module (extract + resolve)

**Files:**
- Create: `lib/drive/unknownFieldAnchors.ts`
- Test: `tests/drive/unknownFieldAnchors.test.ts`

**Interfaces:**
- Consumes: `buildAbsGrid`, `AbsGrid` from `@/lib/drive/sourceAnchors`; `clean` from `@/lib/parser/blocks/_helpers`; `SourceAnchor` from `@/lib/sheet-links/buildSheetDeepLink`.
- Produces: `type UnknownFieldAnchor = { kind: string; label: string; value: string; anchor: SourceAnchor }`; `normalizeCellKey(s: string): string`; `extractUnknownFieldAnchors(buffer: ArrayBuffer, titleToGid: Map<string, number>): UnknownFieldAnchor[]`; `resolveUnknownFieldCell(anchors, kind, label, value): SourceAnchor | null`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/drive/unknownFieldAnchors.test.ts
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  extractUnknownFieldAnchors,
  resolveUnknownFieldCell,
  normalizeCellKey,
} from "@/lib/drive/unknownFieldAnchors";

// Build a minimal INFO sheet from an array-of-arrays; returns bytes + gid map.
// Row/col are 0-based; A1 is derived by the code under test.
function buildInfoWorkbook(rows: (string | null)[][]): { buffer: ArrayBuffer; gids: Map<string, number> } {
  const ws = XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((c) => c ?? "")));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "INFO");
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return { buffer, gids: new Map([["INFO", 0]]) };
}

describe("extractUnknownFieldAnchors", () => {
  it("anchors each venue/details row to its LABEL cell keyed by (kind,label,value)", () => {
    // Rows: 0 DATES(term) 1 blank 2 VENUE 3 Where 4 blank 5 DETAILS 6 Floor Plan 7 GS Podium Type
    const { buffer, gids } = buildInfoWorkbook([
      ["DATES", ""], ["", ""], ["VENUE", ""], ["Where", "Four Seasons Hotel"],
      ["", ""], ["DETAILS", ""], ["Floor Plan", "LINK"], ["GS Podium Type", "(2) Acrylic Podium"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(anchors.find((a) => a.kind === "venue" && a.label === "where")?.anchor.a1).toBe("A4"); // row 3 → A4
    const podium = anchors.find((a) => a.kind === "details" && a.label === "gs podium type");
    expect(podium?.anchor.a1).toBe("A8"); // row 7 → A8
    expect(podium?.value).toBe(normalizeCellKey("(2) Acrylic Podium"));
  });

  it("resolves exactly-one (kind,label,value) match to the cell", () => {
    const { buffer, gids } = buildInfoWorkbook([["DETAILS", ""], ["GS Podium Type", "(2) Acrylic Podium"]]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(resolveUnknownFieldCell(anchors, "details", "GS Podium Type", "(2) Acrylic Podium")?.a1).toBe("A2");
  });

  it("PROVENANCE: same label, different value → matches the correct row (never the impostor)", () => {
    const { buffer, gids } = buildInfoWorkbook([["DETAILS", ""], ["Notes", "real note"], ["Notes", "other note"]]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(resolveUnknownFieldCell(anchors, "details", "Notes", "other note")?.a1).toBe("A3"); // not A2
  });

  it("PROVENANCE across bound divergence: parser emits an outside-bound label; an inside impostor shares the label but not the value → never anchors to the impostor", () => {
    // DETAILS block has "Notes | inside-val"; a LATER block (after the CONTACTS terminator)
    // has "Notes | outside-val". The extractor only scans the DETAILS block, so it holds
    // (details,"notes","inside-val"). The parser emitted for the OUTSIDE row (value
    // "outside-val"). Resolving with the outside value must NOT pick the inside impostor.
    const { buffer, gids } = buildInfoWorkbook([
      ["DETAILS", ""], ["Notes", "inside-val"],
      ["", ""], ["CONTACTS", ""], ["Notes", "outside-val"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(resolveUnknownFieldCell(anchors, "details", "Notes", "outside-val")).toBeNull(); // value mismatch → null, never A2
  });

  it("same label AND same value (true duplicate) → null (never a wrong cell)", () => {
    const { buffer, gids } = buildInfoWorkbook([["DETAILS", ""], ["Notes", "dup"], ["Notes", "dup"]]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(resolveUnknownFieldCell(anchors, "details", "Notes", "dup")).toBeNull();
  });

  it("kind-scoping: same label in venue and details does not cross-collide", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["VENUE", ""], ["Notes", "venue note"], ["", ""], ["DETAILS", ""], ["Notes", "details note"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(resolveUnknownFieldCell(anchors, "venue", "Notes", "venue note")?.a1).toBe("A2");
    expect(resolveUnknownFieldCell(anchors, "details", "Notes", "details note")?.a1).toBe("A5");
  });

  it("no match → null; wrong/absent inputs → null; missing gid → []", () => {
    const { buffer, gids } = buildInfoWorkbook([["DETAILS", ""], ["Floor Plan", "LINK"]]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(resolveUnknownFieldCell(anchors, "details", "Nonexistent", "x")).toBeNull();
    expect(resolveUnknownFieldCell(anchors, undefined, "Floor Plan", "LINK")).toBeNull();
    expect(extractUnknownFieldAnchors(buffer, new Map())).toEqual([]);
  });

  it("over-inclusive: does NOT stop at an internal blank row within the block", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["DETAILS", ""], ["Floor Plan", "LINK"], ["", ""], ["Notes", "kept"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(anchors.find((a) => a.label === "notes")?.anchor.a1).toBe("A4"); // row 3 → A4
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/drive/unknownFieldAnchors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/drive/unknownFieldAnchors.ts
import * as XLSX from "xlsx";
import { buildAbsGrid, type AbsGrid } from "@/lib/drive/sourceAnchors";
import { clean } from "@/lib/parser/blocks/_helpers";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";

/** An anchor to a venue/details row's LABEL cell, keyed by (kind, normalized
 *  label, normalized value). value participates in the key so resolution
 *  identifies the specific row (provenance), not merely a unique label. */
export type UnknownFieldAnchor = { kind: string; label: string; value: string; anchor: SourceAnchor };

// The two blocks whose parsers call emitUnknownField (venue.ts, event.ts). Headers
// mirror REGION_ANCHOR_SPEC (lib/sheet-links/buildSheetDeepLink.ts) exactly.
const BLOCKS: { kind: string; header: RegExp }[] = [
  { kind: "venue", header: /^VENUE$/i },
  { kind: "details", header: /^(EVENT\s+DETAILS|DETAILS|GS\s+DETAILS)/i },
];

// A row whose first non-blank cell (upper-cased) is one of these ENDS the block.
// Mirror of the crew TERMINATORS / region BLOCK_TERMINATORS. Over-inclusion is
// safe (spec §5.1.1), so this only needs to catch real section openers.
const TERMINATORS = new Set([
  "CREW", "TECH", "VENUE", "DATES", "HOTEL", "HOTELS", "ROOMS", "TRANSPORTATION",
  "CONTACTS", "SCHEDULE", "PULL SHEET", "PULL", "DIAGRAMS", "EVENT DETAILS", "DETAILS",
  "GS DETAILS", "DRESS", "GENERAL SESSION", "CONTACT OFFICE", "CLIENT",
  "DOCUMENT FOLDER LINK", "AGENDA LINK", "AGENDA", "FORM", "GEAR", "TO DO",
]);

/** Normalize a sheet cell for matching. canonicalize-exempt: sheet field text,
 *  not an email (AGENTS.md invariant 3 N/A). Applied identically to grid cells
 *  and to the label/value from the warning, so the two sides compare equal. */
export function normalizeCellKey(s: string): string {
  return clean(s).replace(/\s+/g, " ").trim().toLowerCase();
}

function firstNonBlank(grid: AbsGrid, r: number): { col: number; text: string } | null {
  for (let c = grid.minCol; c <= grid.maxCol; c++) {
    const v = clean(grid.cell(r, c));
    if (v) return { col: c, text: v };
  }
  return null;
}

function nextNonBlankAfter(grid: AbsGrid, r: number, afterCol: number): string {
  for (let c = afterCol + 1; c <= grid.maxCol; c++) {
    const v = clean(grid.cell(r, c));
    if (v) return v;
  }
  return "";
}

/**
 * Re-scan the RAW workbook to locate each venue/details row's LABEL cell, keyed by
 * (kind, normalized label, normalized value). The parser runs on synthesized
 * markdown (which loses A1 coordinates), so we reconstruct from the raw grid,
 * mirroring extractCrewRoleAnchors. OVER-INCLUSIVE by design: the scan continues
 * past internal blank rows to the next section terminator, so it is a superset of
 * the parser's emitting rows (under-inclusion is the only wrong-cell risk;
 * over-inclusion degrades to null via the exactly-one guard). Any edge → fewer/no
 * anchors, never a wrong one.
 */
export function extractUnknownFieldAnchors(
  buffer: ArrayBuffer,
  titleToGid: Map<string, number>,
): UnknownFieldAnchor[] {
  const workbook = XLSX.read(buffer, { type: "array", cellText: true, cellDates: false });
  const out: UnknownFieldAnchor[] = [];

  const sheetName = workbook.SheetNames.find(
    (n) => n.toUpperCase() === "INFO" && !/\bOLD\b/i.test(n),
  );
  if (!sheetName) return out;
  const sheet = workbook.Sheets[sheetName];
  if (!sheet || !sheet["!ref"]) return out;
  const gid = titleToGid.get(sheetName);
  if (typeof gid !== "number") return out;

  const grid = buildAbsGrid(sheet);

  for (const { kind, header } of BLOCKS) {
    let headerRow = -1;
    for (let r = grid.minRow; r <= grid.maxRow; r++) {
      const first = firstNonBlank(grid, r);
      if (first && header.test(first.text)) {
        headerRow = r;
        break;
      }
    }
    if (headerRow === -1) continue;

    for (let r = headerRow + 1; r <= grid.maxRow; r++) {
      const first = firstNonBlank(grid, r);
      if (!first) continue; // internal blank row — over-inclusive: keep scanning
      if (TERMINATORS.has(first.text.toUpperCase())) break; // next section
      const value = nextNonBlankAfter(grid, r, first.col);
      out.push({
        kind,
        label: normalizeCellKey(first.text),
        value: normalizeCellKey(value),
        anchor: { title: sheetName, gid, a1: XLSX.utils.encode_cell({ r, c: first.col }) },
      });
    }
  }

  return out;
}

/**
 * Pick the single anchor whose (kind, normalized label, normalized value) equals
 * the warning's. EXACTLY ONE match → its anchor; zero or ≥2 → null, so a wrong-cell
 * link is never produced (mirror resolveCrewRoleCell). value gives provenance: a
 * same-label impostor with a different value cannot become the single match.
 */
export function resolveUnknownFieldCell(
  anchors: UnknownFieldAnchor[],
  kind: string | undefined | null,
  label: string | undefined | null,
  value: string | undefined | null,
): SourceAnchor | null {
  if (!kind || !label) return null;
  const lk = normalizeCellKey(label);
  const vk = normalizeCellKey(value ?? "");
  const matches = anchors.filter((a) => a.kind === kind && a.label === lk && a.value === vk);
  return matches.length === 1 ? matches[0]!.anchor : null;
}
```

**Note (plan refinement of spec §5.1):** the spec names `normalizeLabelKey`/`normalizeValueKey`; label and value use identical normalization, so this plan consolidates to one `normalizeCellKey` (YAGNI). The `(kind,label,value)` match and every guarantee in spec §5.1.1 are unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/drive/unknownFieldAnchors.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/drive/unknownFieldAnchors.ts tests/drive/unknownFieldAnchors.test.ts
git commit --no-verify -m "feat(drive): per-row UNKNOWN_FIELD label-cell anchors (kind,label,value)"
```

---

## Task 4: wire + dispatch the per-row anchor (source family + dispatch, one unit)

Source-family wiring and the dispatch branch are one inseparable testable deliverable (a warning resolving to its cell requires both). They ship as one task/commit — this does not violate one-task-per-commit; it is one task.

**Files:**
- Modify: `lib/drive/showDayTimeAnchors.ts` (import; `WarningAnchorSources` :98-102; dispatch :118-149)
- Modify: `lib/sync/attachWarningAnchors.ts` (:6 import, :46-50 family)
- Test: `tests/drive/showDayTimeAnchors.test.ts`, `tests/sync/attachWarningAnchors.test.ts`

**Interfaces:**
- Consumes: `extractUnknownFieldAnchors`, `resolveUnknownFieldCell`, `UnknownFieldAnchor` (Task 3); `valueFromRawSnippet` (Task 1).
- Produces: `WarningAnchorSources` gains `unknownField: UnknownFieldAnchor[]`; `attachSourceCellAnchors` resolves `UNKNOWN_FIELD` to the per-row cell (no region fallback).

- [ ] **Step 1: Write the failing tests**

In `tests/drive/showDayTimeAnchors.test.ts` (append):
```ts
import { attachSourceCellAnchors } from "@/lib/drive/showDayTimeAnchors";

it("UNKNOWN_FIELD resolves to the per-row cell, not the block region", () => {
  const warnings = [{
    severity: "warn", code: "UNKNOWN_FIELD", message: "x",
    blockRef: { kind: "details", name: "GS Podium Type" },
    rawSnippet: "GS Podium Type | (2) Acrylic Podium",
  }] as any[];
  attachSourceCellAnchors(warnings, {
    showDay: [], crewRole: [],
    unknownField: [{ kind: "details", label: "gs podium type", value: "(2) acrylic podium",
      anchor: { title: "INFO", gid: 0, a1: "A8" } }],
    region: { details: { title: "INFO", gid: 0, a1: "A55:B74" } },
  });
  expect(warnings[0].sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A8" });
});

it("UNKNOWN_FIELD with no matching per-row anchor gets NO region fallback", () => {
  const warnings = [{
    severity: "warn", code: "UNKNOWN_FIELD", message: "x",
    blockRef: { kind: "details", name: "Mystery" }, rawSnippet: "Mystery | val",
  }] as any[];
  attachSourceCellAnchors(warnings, {
    showDay: [], crewRole: [], unknownField: [],
    region: { details: { title: "INFO", gid: 0, a1: "A55:B74" } },
  });
  expect(warnings[0].sourceCell).toBeUndefined();
});

it("FIELD_UNREADABLE still uses the region fallback (unchanged)", () => {
  const warnings = [{ severity: "warn", code: "FIELD_UNREADABLE", message: "x", blockRef: { kind: "details" } }] as any[];
  attachSourceCellAnchors(warnings, {
    showDay: [], crewRole: [], unknownField: [],
    region: { details: { title: "INFO", gid: 0, a1: "A55:B74" } },
  });
  expect(warnings[0].sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A55:B74" });
});
```

In `tests/sync/attachWarningAnchors.test.ts` (append) — end-to-end through the raw workbook:
```ts
it("attachWarningAnchors resolves an UNKNOWN_FIELD to its label cell via the raw workbook", async () => {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([["DETAILS", ""], ["GS Podium Type", "(2) Acrylic Podium"]]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "INFO");
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const warnings = [{
    severity: "warn", code: "UNKNOWN_FIELD", message: "x",
    blockRef: { kind: "details", name: "GS Podium Type" },
    rawSnippet: "GS Podium Type | (2) Acrylic Podium",
  }] as any[];
  await attachWarningAnchors(warnings, bytes, async () => new Map([["INFO", 0]]));
  expect(warnings[0].sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A2" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/drive/showDayTimeAnchors.test.ts tests/sync/attachWarningAnchors.test.ts -t "UNKNOWN_FIELD"`
Expected: FAIL — currently `UNKNOWN_FIELD` hits the region branch (`A55:B74`), no-match falls back to region, and `WarningAnchorSources` has no `unknownField`.

- [ ] **Step 3: Write minimal implementation**

`lib/drive/showDayTimeAnchors.ts` — imports + type:
```ts
import { resolveCrewRoleCell, type CrewRoleAnchor } from "@/lib/drive/crewRoleAnchors";
import { resolveUnknownFieldCell, type UnknownFieldAnchor } from "@/lib/drive/unknownFieldAnchors";
import { valueFromRawSnippet } from "@/lib/parser/rawSnippet";
// ...
export type WarningAnchorSources = {
  showDay: ShowDayTimeAnchor[];
  crewRole: CrewRoleAnchor[];
  unknownField: UnknownFieldAnchor[];
  region: Record<string, SourceAnchor>;
};
```

Dispatch — add the `UNKNOWN_FIELD` branch after the crew-role branch (~line 129), and remove `UNKNOWN_FIELD` from the region-fallback branch (line 138):
```ts
    } else if (w.code === "UNKNOWN_FIELD") {
      // Per-row cell by (kind,label,value); no region fallback — a no/ambiguous
      // match leaves the warning link-less (spec §5.1.1: correct cell or null).
      cell = resolveUnknownFieldCell(
        sources.unknownField,
        w.blockRef?.kind,
        w.blockRef?.name,
        valueFromRawSnippet(w.rawSnippet),
      );
    } else if (w.blockRef?.kind && KIND_TO_REGION[w.blockRef.kind]) {
      cell = sources.region[KIND_TO_REGION[w.blockRef.kind]!] ?? null;
    } else if (
      w.code === "FIELD_UNREADABLE" ||
      w.code === "COLUMN_HEADER_AUTOCORRECTED" ||
      w.code === "SECTION_HEADER_AUTOCORRECTED" ||
      w.code === "FIELD_LABEL_AUTOCORRECTED" ||
      w.code === "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE"
    ) {
```

`lib/sync/attachWarningAnchors.ts` — import + 4th family:
```ts
import { extractUnknownFieldAnchors } from "@/lib/drive/unknownFieldAnchors";
// ...
  attachSourceCellAnchors(warnings, {
    showDay: safe(() => extractShowDayTimeAnchors(bytes, gids), []),
    crewRole: safe(() => extractCrewRoleAnchors(bytes, gids), []),
    unknownField: safe(() => extractUnknownFieldAnchors(bytes, gids), []),
    region: regionAnchors ?? safe(() => extractSourceAnchors(bytes, gids), {}),
  });
```

Also update any existing `attachSourceCellAnchors` call in tests/`applyParseResult.ts` that constructs `WarningAnchorSources` literally to include `unknownField: []` (grep `showDay:` to find them — typecheck will flag any missed one).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/drive/showDayTimeAnchors.test.ts tests/sync/attachWarningAnchors.test.ts` then `pnpm typecheck`
Expected: PASS; typecheck clean (all `WarningAnchorSources` literals updated).

- [ ] **Step 5: Commit**

```bash
git add lib/drive/showDayTimeAnchors.ts lib/sync/attachWarningAnchors.ts tests/drive/showDayTimeAnchors.test.ts tests/sync/attachWarningAnchors.test.ts
git commit --no-verify -m "feat(drive): resolve UNKNOWN_FIELD to per-row cell via unknownField source family"
```

---

## Task 5: Part B — under-count regression (no impl change)

Part B falls out of Tasks 3-4 (distinct per-row anchors → distinct dedup keys; null-anchor rows skip the dedup). This task pins that and updates any expectation that assumed the old collapse.

**Files:** Test: `tests/parser/operatorActionableWarnings.test.ts`

- [ ] **Step 1: Write the guard test** (append)

```ts
it("two distinct-label UNKNOWN_FIELD warnings with distinct per-row anchors both survive dedup", () => {
  const warnings = [
    { severity: "warn", code: "UNKNOWN_FIELD", message: "a", sourceCell: { title: "INFO", gid: 0, a1: "A56" } },
    { severity: "warn", code: "UNKNOWN_FIELD", message: "b", sourceCell: { title: "INFO", gid: 0, a1: "A65" } },
  ] as any[];
  expect(operatorActionableWarnings(warnings)).toHaveLength(2);
});

it("two UNKNOWN_FIELD warnings with NO sourceCell both survive (no a1 → no dedup)", () => {
  const warnings = [
    { severity: "warn", code: "UNKNOWN_FIELD", message: "a" },
    { severity: "warn", code: "UNKNOWN_FIELD", message: "b" },
  ] as any[];
  expect(operatorActionableWarnings(warnings)).toHaveLength(2);
});
```

- [ ] **Step 2: Run**

Run: `pnpm vitest run tests/parser/operatorActionableWarnings.test.ts`
Expected: PASS (no impl change). If a pre-existing test asserted the old 2→1 collapse for distinct-cell `UNKNOWN_FIELD`, update it to the new expectation and note why in the commit.

- [ ] **Step 3: Commit**

```bash
git add tests/parser/operatorActionableWarnings.test.ts
git commit --no-verify -m "test(parser): pin UNKNOWN_FIELD distinct-anchor no-collapse (Part B)"
```

---

## Task 6: Part D — stripLegacyUnknownFieldAnchors + selectActionableForDisplay seam

**Files:**
- Modify: `lib/parser/dataGaps.ts` (add both fns after `operatorActionableWarnings`, ~line 170)
- Test: `tests/parser/dataGaps.test.ts`

**Interfaces:**
- Produces: `stripLegacyUnknownFieldAnchors(warnings): ParseWarning[]` — clears `sourceCell` on `UNKNOWN_FIELD` whose `sourceCell.a1` is a RANGE (contains `":"`). `selectActionableForDisplay(warnings): ParseWarning[]` — the read-boundary seam = `operatorActionableWarnings(stripLegacyUnknownFieldAnchors(warnings))`; the single function both persisted-read surfaces call, so a boundary regression is caught by this function's test.

- [ ] **Step 1: Write the failing test** (append to `tests/parser/dataGaps.test.ts`)

```ts
import {
  stripLegacyUnknownFieldAnchors, selectActionableForDisplay, operatorActionableWarnings,
} from "@/lib/parser/dataGaps";

describe("stripLegacyUnknownFieldAnchors (Part D)", () => {
  const legacy = () => ([
    { severity: "warn", code: "UNKNOWN_FIELD", message: "a", rawSnippet: "Floor Plan | LINK",
      sourceCell: { title: "INFO", gid: 0, a1: "A55:B74" } },
    { severity: "warn", code: "UNKNOWN_FIELD", message: "b", rawSnippet: "GS Podium Type | (2) Acrylic",
      sourceCell: { title: "INFO", gid: 0, a1: "A55:B74" } },
  ] as any[]);

  it("clears the stale range anchor on legacy UNKNOWN_FIELD", () => {
    expect(stripLegacyUnknownFieldAnchors(legacy()).every((w) => w.sourceCell === null)).toBe(true);
  });
  it("is a NO-OP for a new single-cell anchor (A56)", () => {
    const fresh = [{ severity: "warn", code: "UNKNOWN_FIELD", message: "a", sourceCell: { title: "INFO", gid: 0, a1: "A56" } }] as any[];
    expect(stripLegacyUnknownFieldAnchors(fresh)[0].sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A56" });
  });
  it("is a NO-OP for a new UNKNOWN_FIELD with EMPTY blockRef.name + single-cell anchor (R2 edge)", () => {
    const fresh = [{ severity: "warn", code: "UNKNOWN_FIELD", message: "a", blockRef: { kind: "details", name: "" },
      sourceCell: { title: "INFO", gid: 0, a1: "A56" } }] as any[];
    expect(stripLegacyUnknownFieldAnchors(fresh)[0].sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A56" });
  });
  it("does not touch other codes carrying a range anchor", () => {
    const other = [{ severity: "warn", code: "FIELD_UNREADABLE", message: "a", sourceCell: { title: "INFO", gid: 0, a1: "A55:B74" } }] as any[];
    expect(stripLegacyUnknownFieldAnchors(other)[0].sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A55:B74" });
  });
});

describe("selectActionableForDisplay (read-boundary seam)", () => {
  it("legacy A55-range pair → 2 items, each link-less (count corrects, no stale link)", () => {
    const items = selectActionableForDisplay([
      { severity: "warn", code: "UNKNOWN_FIELD", message: "a", rawSnippet: "Floor Plan | LINK", sourceCell: { title: "INFO", gid: 0, a1: "A55:B74" } },
      { severity: "warn", code: "UNKNOWN_FIELD", message: "b", rawSnippet: "GS Podium Type | X", sourceCell: { title: "INFO", gid: 0, a1: "A55:B74" } },
    ] as any[]);
    expect(items).toHaveLength(2);
    expect(items.every((w) => w.sourceCell === null)).toBe(true);
  });
  it("fresh distinct-cell pair → 2 items keeping their anchors", () => {
    const items = selectActionableForDisplay([
      { severity: "warn", code: "UNKNOWN_FIELD", message: "a", sourceCell: { title: "INFO", gid: 0, a1: "A56" } },
      { severity: "warn", code: "UNKNOWN_FIELD", message: "b", sourceCell: { title: "INFO", gid: 0, a1: "A65" } },
    ] as any[]);
    expect(items.map((w) => w.sourceCell?.a1).sort()).toEqual(["A56", "A65"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/dataGaps.test.ts -t "Part D|read-boundary seam"`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Write minimal implementation** — add to `lib/parser/dataGaps.ts` after `operatorActionableWarnings`:

```ts
/**
 * Read-time compatibility shim (Part D). Warnings persisted BEFORE per-row
 * anchoring carry a stale block-RANGE sourceCell (encode_range → contains ":") and
 * no per-row identity; the admin surface would keep collapsing them and rendering
 * the wrong block-header link until a re-parse rewrites the jsonb (which never
 * happens for an unchanged sheet). Clear that stale anchor at read time so legacy
 * rows behave like ambiguous rows: not deduped (count corrects) and link-less.
 * NO-OP once re-parsed — Part C anchors are single cells (encode_cell → no ":")
 * and ambiguous rows are null, so the range-":" fingerprint is the exact legacy
 * signature (never misfires on a new single-cell/null anchor, incl. empty name).
 */
export function stripLegacyUnknownFieldAnchors(
  warnings: readonly ParseWarning[] | null | undefined,
): ParseWarning[] {
  if (!warnings) return [];
  return warnings.map((w) =>
    w.code === "UNKNOWN_FIELD" && typeof w.sourceCell?.a1 === "string" && w.sourceCell.a1.includes(":")
      ? { ...w, sourceCell: null }
      : w,
  );
}

/**
 * The read-boundary seam for persisted parse_warnings feeding the operator-
 * actionable Data-quality panel: neutralize stale legacy UNKNOWN_FIELD anchors,
 * THEN filter+dedup. Both persisted-read call sites use this one function so the
 * legacy behavior is defined (and tested) in exactly one place.
 */
export function selectActionableForDisplay(
  warnings: readonly ParseWarning[] | null | undefined,
): ParseWarning[] {
  return operatorActionableWarnings(stripLegacyUnknownFieldAnchors(warnings));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/dataGaps.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/dataGaps.ts tests/parser/dataGaps.test.ts
git commit --no-verify -m "feat(parser): stripLegacyUnknownFieldAnchors + selectActionableForDisplay seam (Part D)"
```

---

## Task 7: apply the seam at the admin read boundary

**Files:**
- Modify: `app/admin/show/[slug]/page.tsx:325` (+ import)
- Test: covered by Task 6's `selectActionableForDisplay` tests; add a render assertion here for the end-to-end panel behavior.

**Interfaces:**
- Consumes: `selectActionableForDisplay` (Task 6).

- [ ] **Step 1: Write the failing test** (append to `tests/components/admin/perShowDataQualityActionable.test.tsx`)

```tsx
import { selectActionableForDisplay } from "@/lib/parser/dataGaps";
import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";

it("admin boundary: legacy A55-range UNKNOWN_FIELD pair renders 2 items, no link", () => {
  const items = selectActionableForDisplay([
    { code: "UNKNOWN_FIELD", severity: "warn", message: "a", rawSnippet: "Floor Plan | LINK", sourceCell: { title: "INFO", gid: 0, a1: "A55:B74" } },
    { code: "UNKNOWN_FIELD", severity: "warn", message: "b", rawSnippet: "GS Podium Type | (2) Acrylic", sourceCell: { title: "INFO", gid: 0, a1: "A55:B74" } },
  ] as any);
  render(<PerShowActionableWarnings items={items} driveFileId="drive123" />);
  expect(screen.getAllByTestId("per-show-actionable-item")).toHaveLength(2);
  expect(screen.queryByRole("link", { name: /Open in Sheet/ })).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/perShowDataQualityActionable.test.tsx -t "admin boundary"`
Expected: FAIL if the component/import isn't wired; PASS proves the seam produces the right items. (This asserts the seam's end-to-end render; the page wiring in Step 3 makes the real page use it.)

- [ ] **Step 3: Write minimal implementation** — in `app/admin/show/[slug]/page.tsx`, change the import at the top (currently `import { operatorActionableWarnings } from "@/lib/parser/dataGaps"` — extend it) and the call at line 325:

```ts
import { selectActionableForDisplay } from "@/lib/parser/dataGaps";
// ...
  // Neutralize stale legacy UNKNOWN_FIELD anchors, then filter+dedup — the single
  // seam so legacy behavior is defined once (Part D).
  const actionableItems = selectActionableForDisplay(dataQuality.actionable);
```

(Remove the now-unused `operatorActionableWarnings` import if nothing else in the file uses it — grep the file; typecheck will flag an unused import.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/admin/perShowDataQualityActionable.test.tsx` then `pnpm typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/show/[slug]/page.tsx" tests/components/admin/perShowDataQualityActionable.test.tsx
git commit --no-verify -m "fix(admin): route Data-quality actionable warnings through selectActionableForDisplay (Part D)"
```

---

## Task 8: Part A + shim on Step-3 (UI — Opus + impeccable)

**Files:**
- Modify: `components/admin/wizard/Step3SheetCard.tsx` (:1496 shim; WarningsBreakdown label insertion)
- Test: `tests/components/step3SheetCard.test.tsx`

**Interfaces:**
- Consumes: `stripLegacyUnknownFieldAnchors` (Task 6), `labelFromRawSnippet` (Task 1).

**DOM placement (pinned):** In `WarningsBreakdown` each warning is an `<li className="flex flex-col gap-0.5">` (line 829-833) containing, in order: the title row `<span className="flex items-baseline gap-1.5 ...">…</span>` (closes line 845), then `{context ? <p className="pl-3 …"> … }`, then the "Open in Sheet" block. Insert the label as a **direct child of the `<li>`, immediately after the title-row span's closing `</span>` (line 845) and before the `{context …}` block** — so it renders as its own flex-column row beneath the title, matching the `pl-3` indent of the context/link.

- [ ] **Step 1: Write the failing test** (append to `tests/components/step3SheetCard.test.tsx`; adapt to the file's existing render harness — the assertions are the contract)

```tsx
import { within } from "@testing-library/react";

it("Part A: two UNKNOWN_FIELD warnings render distinguishable row labels", () => {
  const warnings = [
    { code: "UNKNOWN_FIELD", severity: "warn", message: "Unrecognized event_details row label: 'Floor Plan'", rawSnippet: "Floor Plan | LINK" },
    { code: "UNKNOWN_FIELD", severity: "warn", message: "Unrecognized event_details row label: 'GS Podium Type'", rawSnippet: "GS Podium Type | (2) Acrylic Podium" },
  ];
  const { container } = renderStep3CardWithWarnings(warnings); // existing/local harness
  // Scope to the warnings list so an unrelated sibling panel cannot satisfy this.
  const labels = container.querySelectorAll('[data-testid$="-label"]');
  const texts = Array.from(labels).map((n) => n.textContent);
  expect(texts).toContain("Floor Plan");
  expect(texts).toContain("GS Podium Type"); // the two entries are distinguishable
});

it("Part A shim: a legacy A55-range UNKNOWN_FIELD renders NO 'Open in Sheet' link", () => {
  // Drives the REAL component through stripLegacyUnknownFieldAnchors(arr(pr.warnings)).
  // If the shim is removed, buildSheetDeepLink renders the stale A55 link and this fails.
  const warnings = [
    { code: "UNKNOWN_FIELD", severity: "warn", message: "x", rawSnippet: "Floor Plan | LINK",
      sourceCell: { title: "INFO", gid: 0, a1: "A55:B74" } },
  ];
  const { queryByRole } = renderStep3CardWithWarnings(warnings);
  expect(queryByRole("link", { name: /Open in Sheet/ })).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/step3SheetCard.test.tsx -t "Part A"`
Expected: FAIL — labels not rendered; and without the shim the legacy warning renders an A55 link.

- [ ] **Step 3: Write minimal implementation**

Imports in `components/admin/wizard/Step3SheetCard.tsx`:
```ts
import { labelFromRawSnippet } from "@/lib/parser/rawSnippet";
import { stripLegacyUnknownFieldAnchors } from "@/lib/parser/dataGaps";
```

Shim the Step-3 warnings source (line 1496):
```ts
  const warnings = stripLegacyUnknownFieldAnchors(arr(pr.warnings));
```

Insert the label in `WarningsBreakdown` — directly after the title-row span closes (line 845), before `{context …}`:
```tsx
              </span>
              {(() => {
                const rowLabel = labelFromRawSnippet(w.rawSnippet);
                return rowLabel ? (
                  <span
                    data-testid={`wizard-step3-card-${dfid}-warning-${i}-label`}
                    className="pl-3 text-xs text-text-subtle"
                  >
                    {rowLabel}
                  </span>
                ) : null;
              })()}
              {context ? (
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/step3SheetCard.test.tsx`
Expected: PASS. Note: `tests/e2e/step3-card-dimensions.spec.ts` runs in CI — the added text line must not break the card's pinned dimensions.

- [ ] **Step 5: Commit**

```bash
git add components/admin/wizard/Step3SheetCard.tsx tests/components/step3SheetCard.test.tsx
git commit --no-verify -m "feat(crew-page): surface UNKNOWN_FIELD row label + shim legacy anchors in Step-3 review"
```

---

## Task 9: Part A on the admin Data-quality panel (UI — Opus + impeccable)

**Files:**
- Modify: `components/admin/PerShowActionableWarnings.tsx:44`
- Test: `tests/components/admin/perShowDataQualityActionable.test.tsx`

**Interfaces:**
- Consumes: `labelFromRawSnippet` (Task 1).

**DOM placement (pinned):** each item is `<li className="flex flex-col gap-0.5 …">` containing the title `<span className="font-medium …">` (line 44), then `{context …}`, then the link. Insert the label as a **direct child of the `<li>`, immediately after the title span (line 44) and before `{context …}`**.

- [ ] **Step 1: Write the failing test** (append)

```tsx
import { within } from "@testing-library/react";

it("Part A: renders the row label from rawSnippet under the title", () => {
  const items = [{ code: "UNKNOWN_FIELD", severity: "warn", message: "x", rawSnippet: "GS Podium Type | (2) Acrylic" }];
  render(<PerShowActionableWarnings items={items as any} driveFileId="d1" />);
  const item = screen.getByTestId("per-show-actionable-item");
  expect(within(item).getByTestId("per-show-actionable-row-label")).toHaveTextContent("GS Podium Type");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/perShowDataQualityActionable.test.tsx -t "under the title"`
Expected: FAIL — label not rendered.

- [ ] **Step 3: Write minimal implementation** — in `components/admin/PerShowActionableWarnings.tsx`, add the import and insert after the title span (line 44):

```ts
import { labelFromRawSnippet } from "@/lib/parser/rawSnippet";
```
```tsx
            <span className="font-medium text-text-strong">{renderEmphasis(title)}</span>
            {(() => {
              const rowLabel = labelFromRawSnippet(w.rawSnippet);
              return rowLabel ? (
                <span data-testid="per-show-actionable-row-label" className="text-xs text-text-subtle">
                  {rowLabel}
                </span>
              ) : null;
            })()}
            {context ? (
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/admin/perShowDataQualityActionable.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/PerShowActionableWarnings.tsx tests/components/admin/perShowDataQualityActionable.test.tsx
git commit --no-verify -m "feat(admin): surface UNKNOWN_FIELD row label in the Data-quality panel"
```

---

## Task 10: live-sheet fidelity verification (gsheets MCP)

**Files:** none (verification + evidence), or a `.live.test.ts` if a durable test is added.

- [ ] **Step 1:** Read the live INFO tab of `1XQ44uxc44pToYxQnYw4OG9V6DjE7bC5EU08o5iFpxz4` (gid=0) via gsheets MCP (`sheets_get_values` `INFO!A1:E120`). Identify the DETAILS block rows and the two unrecognized labels (the reported repro).
- [ ] **Step 2:** Load the sheet as xlsx bytes and run `extractUnknownFieldAnchors` + `resolveUnknownFieldCell` for those two labels; assert each resolves to a DISTINCT single-cell `a1` in column A — never a range, never the same cell.
- [ ] **Step 3:** Record the two labels + resolved `a1` values in the closeout notes / commit message as evidence. If the live labels differ from assumptions, adjust the test fixtures (not the impl).
- [ ] **Step 4: Commit** (if a durable test was added)

```bash
git add tests/drive/unknownFieldAnchors.live.test.ts
git commit --no-verify -m "test(drive): live-sheet fidelity for UNKNOWN_FIELD per-row anchors"
```

> If gsheets MCP is unavailable in the run, fall back to a committed `fixtures/shows/` INFO tab containing venue/details blocks and note the substitution.

---

## Task 11: impeccable dual-gate on the UI diff (invariant 8)

**Files:** `components/admin/wizard/Step3SheetCard.tsx`, `components/admin/PerShowActionableWarnings.tsx` (visual). `app/admin/show/[slug]/page.tsx` seam swap is non-visual.

- [ ] **Step 1:** Run `/impeccable critique` on the UI diff (Tasks 8-9) with the canonical v3 preflight gates (PRODUCT.md → DESIGN.md → register → preflight signal).
- [ ] **Step 2:** Run `/impeccable audit` on the same diff.
- [ ] **Step 3:** Fix every HIGH/CRITICAL, or defer via a `DEFERRED.md` entry with rationale. Record findings + dispositions for the handoff.
- [ ] **Step 4: Commit** any fixes:

```bash
git add -A
git commit --no-verify -m "fix(admin): impeccable critique/audit findings on row-label surfacing"
```

---

## Task 12: full verification + close-out

- [ ] **Step 1:** `pnpm vitest run` (full suite). Green. Investigate any failure in isolation (shared-DB `.db` false failures — re-run the specific file alone).
- [ ] **Step 2:** `pnpm typecheck`. No errors.
- [ ] **Step 3:** `pnpm prettier --check .`. Fix touched files with `--write` if needed.
- [ ] **Step 4:** `pnpm lint` on touched files. Clean.
- [ ] **Step 5:** `git status` clean; `git log --oneline origin/main..HEAD` = one commit per task.

---

## Self-review (author checklist — run before adversarial review)

1. **Spec coverage:** Part A (Tasks 8-9) ✓; Part B (Task 5) ✓; Part C (Tasks 2-4) ✓; Part D (Tasks 6-7 admin, Task 8 Step-3) ✓; §5.1.1 provenance incl. outside-bound impostor → Task 3 tests ✓; live-sheet (Task 10) ✓; impeccable (Task 11) ✓.
2. **Placeholder scan:** every code step carries real code; harness-adaptation notes are explicit, not placeholders.
3. **Type consistency:** `normalizeCellKey` (Task 3) used consistently; `UnknownFieldAnchor` shape identical Tasks 3-4; `labelFromRawSnippet`/`valueFromRawSnippet` signatures identical Tasks 1/4/8/9; `stripLegacyUnknownFieldAnchors` + `selectActionableForDisplay` identical Tasks 6/7/8; `WarningAnchorSources.unknownField` added in Task 4 and consumed there; `attachSourceCellAnchors` callers updated (Task 4 Step 3 note).
4. **TDD honesty:** Task 4 is one inseparable unit (source+dispatch) with an end-to-end test; Tasks 6-7 test the real read-boundary seam (`selectActionableForDisplay`), not a re-implementation; Task 8's shim test drives the real component and asserts no stale link.
