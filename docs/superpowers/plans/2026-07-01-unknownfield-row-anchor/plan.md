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
- **Verify against the live sheet** `1XQ44uxc44pToYxQnYw4OG9V6DjE7bC5EU08o5iFpxz4`, INFO tab `gid=0` (via gsheets MCP) before final close-out (Task 11).

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
| `lib/sync/attachWarningAnchors.ts` | Wire the 4th `safe()`-wrapped source family | Modify (:46-50) |
| `lib/parser/dataGaps.ts` | `stripLegacyUnknownFieldAnchors` read-time shim (Part D) | Modify (add fn near :152) |
| `app/admin/show/[slug]/page.tsx` | Apply shim at the published-warnings read boundary | Modify (:291) |
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
- Consumes: nothing new.
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

(`opts.key` is the raw label; `key` is `opts.key.trim()` used in the message. `blockRef.name` uses the raw `opts.key` so it matches the emit-site input; the resolver normalizes both sides anyway.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/warnings.test.ts`
Expected: PASS. Also run `pnpm vitest run tests/parser/` to confirm no snapshot of the warning shape broke.

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

// Build a minimal INFO sheet with a VENUE block and a DETAILS block, returning
// the workbook bytes + a gid map. Row/col are 0-based; A1 is derived by the code.
function buildInfoWorkbook(rows: (string | null)[][]): { buffer: ArrayBuffer; gids: Map<string, number> } {
  const ws = XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((c) => c ?? "")));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "INFO");
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return { buffer, gids: new Map([["INFO", 0]]) };
}

describe("extractUnknownFieldAnchors", () => {
  it("anchors each venue/details row to its LABEL cell keyed by (kind,label,value)", () => {
    // Row indices: 0 DATES header (terminator context), 1 blank, 2 VENUE, 3 Where row,
    // 4 blank, 5 DETAILS, 6 Floor Plan, 7 GS Podium Type
    const { buffer, gids } = buildInfoWorkbook([
      ["DATES", ""],
      ["", ""],
      ["VENUE", ""],
      ["Where", "Four Seasons Hotel"],
      ["", ""],
      ["DETAILS", ""],
      ["Floor Plan", "LINK"],
      ["GS Podium Type", "(2) Acrylic Podium"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    const venue = anchors.find((a) => a.kind === "venue" && a.label === "where");
    expect(venue?.anchor.a1).toBe("A4"); // row index 3 → A4
    const podium = anchors.find((a) => a.kind === "details" && a.label === "gs podium type");
    expect(podium?.anchor.a1).toBe("A8"); // row index 7 → A8
    expect(podium?.value).toBe(normalizeCellKey("(2) Acrylic Podium"));
  });

  it("resolves exactly-one (kind,label,value) match to the cell", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["DETAILS", ""],
      ["GS Podium Type", "(2) Acrylic Podium"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    const cell = resolveUnknownFieldCell(anchors, "details", "GS Podium Type", "(2) Acrylic Podium");
    expect(cell?.a1).toBe("A2");
  });

  it("PROVENANCE: same label, different value → matches the correct row (never the impostor)", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["DETAILS", ""],
      ["Notes", "real note"],
      ["Notes", "other note"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    const cell = resolveUnknownFieldCell(anchors, "details", "Notes", "other note");
    expect(cell?.a1).toBe("A3"); // the "other note" row, not "real note" at A2
  });

  it("same label AND same value (true duplicate) → null (never a wrong cell)", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["DETAILS", ""],
      ["Notes", "dup"],
      ["Notes", "dup"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(resolveUnknownFieldCell(anchors, "details", "Notes", "dup")).toBeNull();
  });

  it("kind-scoping: same label in venue and details does not cross-collide", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["VENUE", ""],
      ["Notes", "venue note"],
      ["", ""],
      ["DETAILS", ""],
      ["Notes", "details note"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(resolveUnknownFieldCell(anchors, "venue", "Notes", "venue note")?.a1).toBe("A2");
    expect(resolveUnknownFieldCell(anchors, "details", "Notes", "details note")?.a1).toBe("A5");
  });

  it("no match → null; missing INFO tab → []", () => {
    const { buffer, gids } = buildInfoWorkbook([["DETAILS", ""], ["Floor Plan", "LINK"]]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(resolveUnknownFieldCell(anchors, "details", "Nonexistent", "x")).toBeNull();
    expect(resolveUnknownFieldCell(anchors, undefined, "Floor Plan", "LINK")).toBeNull();
    // missing gid → []
    expect(extractUnknownFieldAnchors(buffer, new Map())).toEqual([]);
  });

  it("over-inclusive: does NOT stop at an internal blank row within the block", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["DETAILS", ""],
      ["Floor Plan", "LINK"],
      ["", ""], // internal blank — must NOT terminate the block
      ["Notes", "kept"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(anchors.find((a) => a.label === "notes")?.anchor.a1).toBe("A4");
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
 *  label, normalized value). The value participates in the key so resolution
 *  identifies the specific row (provenance), not merely a unique label. */
export type UnknownFieldAnchor = { kind: string; label: string; value: string; anchor: SourceAnchor };

// The two blocks whose parsers call emitUnknownField (venue.ts, event.ts). Headers
// mirror REGION_ANCHOR_SPEC (lib/sheet-links/buildSheetDeepLink.ts) exactly.
const BLOCKS: { kind: string; header: RegExp }[] = [
  { kind: "venue", header: /^VENUE$/i },
  { kind: "details", header: /^(EVENT\s+DETAILS|DETAILS|GS\s+DETAILS)/i },
];

// A row whose first non-blank cell (upper-cased) is one of these ENDS the block.
// Mirror of the crew TERMINATORS / region BLOCK_TERMINATORS — the set of section
// openers on the INFO tab. Over-inclusion is safe (spec §5.1.1), so this list only
// needs to catch the real section boundaries, not every possible label.
const TERMINATORS = new Set([
  "CREW", "TECH", "VENUE", "DATES", "HOTEL", "HOTELS", "ROOMS", "TRANSPORTATION",
  "CONTACTS", "SCHEDULE", "PULL SHEET", "PULL", "DIAGRAMS", "EVENT DETAILS", "DETAILS",
  "GS DETAILS", "DRESS", "GENERAL SESSION", "CONTACT OFFICE", "CLIENT",
  "DOCUMENT FOLDER LINK", "AGENDA LINK", "AGENDA", "FORM", "GEAR", "TO DO",
]);

/** Normalize a sheet cell for matching. canonicalize-exempt: sheet field text,
 *  not an email (AGENTS.md invariant 3 N/A). Applied identically to grid cells
 *  and to the label/value derived from the warning, so the two sides compare equal. */
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
 * Re-scan the RAW workbook to locate each venue/details row's LABEL cell, keyed
 * by (kind, normalized label, normalized value). The parser runs on synthesized
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

**Note (plan refinement of spec §5.1):** the spec names `normalizeLabelKey`/`normalizeValueKey`; label and value use identical normalization, so this plan consolidates to one `normalizeCellKey` (YAGNI — no behavior difference). The `(kind,label,value)` match and every guarantee in spec §5.1.1 are unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/drive/unknownFieldAnchors.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/drive/unknownFieldAnchors.ts tests/drive/unknownFieldAnchors.test.ts
git commit --no-verify -m "feat(drive): per-row UNKNOWN_FIELD label-cell anchors (kind,label,value)"
```

---

## Task 4: wire the unknownField source family

**Files:**
- Modify: `lib/drive/showDayTimeAnchors.ts:98-102` (WarningAnchorSources type)
- Modify: `lib/sync/attachWarningAnchors.ts:6,46-50`
- Test: `tests/sync/attachWarningAnchors.test.ts`

**Interfaces:**
- Consumes: `extractUnknownFieldAnchors`, `UnknownFieldAnchor` (Task 3).
- Produces: `WarningAnchorSources` gains `unknownField: UnknownFieldAnchor[]`; `attachWarningAnchors` populates it (safe-wrapped).

- [ ] **Step 1: Write the failing test** (append to `tests/sync/attachWarningAnchors.test.ts`)

```ts
it("populates sources.unknownField and resolves an UNKNOWN_FIELD warning to its cell", async () => {
  // Build an INFO workbook with a DETAILS block; a UNKNOWN_FIELD warning for one row.
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([["DETAILS", ""], ["GS Podium Type", "(2) Acrylic Podium"]]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "INFO");
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

  const warnings = [{
    severity: "warn", code: "UNKNOWN_FIELD",
    message: "Unrecognized event_details row label: 'GS Podium Type'",
    blockRef: { kind: "details", name: "GS Podium Type" },
    rawSnippet: "GS Podium Type | (2) Acrylic Podium",
  }] as any[];

  await attachWarningAnchors(warnings, bytes, async () => new Map([["INFO", 0]]));
  expect(warnings[0].sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A2" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/sync/attachWarningAnchors.test.ts -t "sources.unknownField"`
Expected: FAIL — `sourceCell` is undefined (no unknownField source wired yet) or a region range.

- [ ] **Step 3: Write minimal implementation**

In `lib/drive/showDayTimeAnchors.ts`, extend `WarningAnchorSources` (lines 98-102) and its import:
```ts
import { resolveCrewRoleCell, type CrewRoleAnchor } from "@/lib/drive/crewRoleAnchors";
import {
  resolveUnknownFieldCell,
  type UnknownFieldAnchor,
} from "@/lib/drive/unknownFieldAnchors";
// ...
export type WarningAnchorSources = {
  showDay: ShowDayTimeAnchor[];
  crewRole: CrewRoleAnchor[];
  unknownField: UnknownFieldAnchor[];
  region: Record<string, SourceAnchor>;
};
```

In `lib/sync/attachWarningAnchors.ts`, add the import and the 4th family:
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

(The dispatch that consumes `sources.unknownField` lands in Task 5; this test will pass once Task 5's dispatch branch is added. To keep Task 4 green on its own, assert only that `sources.unknownField` is populated — see Step 1 variant below. **Sequencing note:** implement Task 4 + Task 5 together if executing task-by-task, or make this test assert the source array via a spy. Simplest: fold the dispatch (Task 5) into this commit.)

> **Execution note:** Tasks 4 and 5 are two edits to the same call chain (`attachWarningAnchors` → `attachSourceCellAnchors`). Implement Task 5's dispatch branch before running this task's end-to-end assertion. Commit them separately (source-family wiring, then dispatch) or together as one `feat(drive)` commit — do not leave the tree with `unknownField` populated but unused between commits if running CI mid-plan.

- [ ] **Step 4: Run test to verify it passes** (after Task 5's dispatch is in place)

Run: `pnpm vitest run tests/sync/attachWarningAnchors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/drive/showDayTimeAnchors.ts lib/sync/attachWarningAnchors.ts tests/sync/attachWarningAnchors.test.ts
git commit --no-verify -m "feat(drive): wire unknownField anchor source family"
```

---

## Task 5: dispatch UNKNOWN_FIELD to the per-row cell (remove from region fallback)

**Files:**
- Modify: `lib/drive/showDayTimeAnchors.ts:118-149` (attachSourceCellAnchors dispatch)
- Test: `tests/drive/showDayTimeAnchors.test.ts`

**Interfaces:**
- Consumes: `resolveUnknownFieldCell` (Task 3), `valueFromRawSnippet` (Task 1).
- Produces: `UNKNOWN_FIELD` resolves to the per-row cell; no longer falls back to the block region.

- [ ] **Step 1: Write the failing test** (append to `tests/drive/showDayTimeAnchors.test.ts`)

```ts
import { attachSourceCellAnchors } from "@/lib/drive/showDayTimeAnchors";

it("UNKNOWN_FIELD resolves to the per-row cell, not the block region", () => {
  const warnings = [{
    severity: "warn", code: "UNKNOWN_FIELD",
    message: "x", blockRef: { kind: "details", name: "GS Podium Type" },
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

it("UNKNOWN_FIELD with no matching per-row anchor gets NO region fallback (sourceCell stays undefined)", () => {
  const warnings = [{
    severity: "warn", code: "UNKNOWN_FIELD",
    message: "x", blockRef: { kind: "details", name: "Mystery" },
    rawSnippet: "Mystery | val",
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

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/drive/showDayTimeAnchors.test.ts -t "UNKNOWN_FIELD"`
Expected: FAIL — currently `UNKNOWN_FIELD` still hits the region branch → `A55:B74`, and the no-match case falls back to the region too.

- [ ] **Step 3: Write minimal implementation** — in `lib/drive/showDayTimeAnchors.ts`:

Add the import:
```ts
import { valueFromRawSnippet } from "@/lib/parser/rawSnippet";
```

Add a new branch after the crew-role branch (currently ends ~line 129), before the `KIND_TO_REGION` branch:
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
```

Remove `UNKNOWN_FIELD` from the region-fallback branch (currently line 138):
```ts
    } else if (
      w.code === "FIELD_UNREADABLE" ||
      w.code === "COLUMN_HEADER_AUTOCORRECTED" ||
      w.code === "SECTION_HEADER_AUTOCORRECTED" ||
      w.code === "FIELD_LABEL_AUTOCORRECTED" ||
      w.code === "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE"
    ) {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/drive/showDayTimeAnchors.test.ts tests/sync/attachWarningAnchors.test.ts`
Expected: PASS (including Task 4's end-to-end test).

- [ ] **Step 5: Commit**

```bash
git add lib/drive/showDayTimeAnchors.ts tests/drive/showDayTimeAnchors.test.ts
git commit --no-verify -m "feat(drive): dispatch UNKNOWN_FIELD to per-row cell, drop region fallback"
```

---

## Task 6: Part B — under-count regression (no impl change)

**Files:**
- Test: `tests/parser/operatorActionableWarnings.test.ts`

Part B falls out of Tasks 3-5 (distinct per-row anchors → distinct dedup keys; null-anchor rows skip the dedup). This task pins that behavior and updates any expectation that assumed the old collapse.

- [ ] **Step 1: Write the failing/guard test** (append)

```ts
it("two distinct-label UNKNOWN_FIELD warnings with distinct per-row anchors both survive dedup", () => {
  const warnings = [
    { severity: "warn", code: "UNKNOWN_FIELD", message: "a", sourceCell: { title: "INFO", gid: 0, a1: "A56" } },
    { severity: "warn", code: "UNKNOWN_FIELD", message: "b", sourceCell: { title: "INFO", gid: 0, a1: "A65" } },
  ] as any[];
  expect(operatorActionableWarnings(warnings)).toHaveLength(2);
});

it("two UNKNOWN_FIELD warnings with NO sourceCell (ambiguous) both survive (no a1 → no dedup)", () => {
  const warnings = [
    { severity: "warn", code: "UNKNOWN_FIELD", message: "a" },
    { severity: "warn", code: "UNKNOWN_FIELD", message: "b" },
  ] as any[];
  expect(operatorActionableWarnings(warnings)).toHaveLength(2);
});
```

- [ ] **Step 2: Run**

Run: `pnpm vitest run tests/parser/operatorActionableWarnings.test.ts`
Expected: PASS (no impl change needed — this pins the emergent behavior). If any pre-existing test asserted the old 2→1 collapse for distinct-cell UNKNOWN_FIELD, update it to the new expectation and note why in the commit.

- [ ] **Step 3: Commit**

```bash
git add tests/parser/operatorActionableWarnings.test.ts
git commit --no-verify -m "test(parser): pin UNKNOWN_FIELD distinct-anchor no-collapse (Part B)"
```

---

## Task 7: Part D — stripLegacyUnknownFieldAnchors shim

**Files:**
- Modify: `lib/parser/dataGaps.ts` (add function near `operatorActionableWarnings`, ~line 152)
- Test: `tests/parser/dataGaps.test.ts`

**Interfaces:**
- Produces: `stripLegacyUnknownFieldAnchors(warnings: readonly ParseWarning[] | null | undefined): ParseWarning[]` — clears `sourceCell` on `UNKNOWN_FIELD` warnings whose persisted `sourceCell.a1` is a RANGE (contains `":"`).

- [ ] **Step 1: Write the failing test** (append to `tests/parser/dataGaps.test.ts`)

```ts
import { stripLegacyUnknownFieldAnchors, operatorActionableWarnings } from "@/lib/parser/dataGaps";

describe("stripLegacyUnknownFieldAnchors (Part D)", () => {
  it("clears the stale range anchor on legacy UNKNOWN_FIELD → both rows survive, no link", () => {
    const legacy = [
      { severity: "warn", code: "UNKNOWN_FIELD", message: "a", rawSnippet: "Floor Plan | LINK",
        sourceCell: { title: "INFO", gid: 0, a1: "A55:B74" } },
      { severity: "warn", code: "UNKNOWN_FIELD", message: "b", rawSnippet: "GS Podium Type | (2) Acrylic",
        sourceCell: { title: "INFO", gid: 0, a1: "A55:B74" } },
    ] as any[];
    const stripped = stripLegacyUnknownFieldAnchors(legacy);
    expect(stripped.every((w) => w.sourceCell === null)).toBe(true);
    // count corrects: no a1 → not deduped
    expect(operatorActionableWarnings(stripped)).toHaveLength(2);
  });

  it("is a NO-OP for a new single-cell UNKNOWN_FIELD anchor (A56)", () => {
    const fresh = [{ severity: "warn", code: "UNKNOWN_FIELD", message: "a",
      sourceCell: { title: "INFO", gid: 0, a1: "A56" } }] as any[];
    expect(stripLegacyUnknownFieldAnchors(fresh)[0].sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A56" });
  });

  it("is a NO-OP for a new UNKNOWN_FIELD with empty blockRef.name + single-cell anchor (R2 edge)", () => {
    const fresh = [{ severity: "warn", code: "UNKNOWN_FIELD", message: "a", blockRef: { kind: "details", name: "" },
      sourceCell: { title: "INFO", gid: 0, a1: "A56" } }] as any[];
    expect(stripLegacyUnknownFieldAnchors(fresh)[0].sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A56" });
  });

  it("does not touch other codes carrying a range anchor", () => {
    const other = [{ severity: "warn", code: "FIELD_UNREADABLE", message: "a",
      sourceCell: { title: "INFO", gid: 0, a1: "A55:B74" } }] as any[];
    expect(stripLegacyUnknownFieldAnchors(other)[0].sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A55:B74" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/dataGaps.test.ts -t "stripLegacyUnknownFieldAnchors"`
Expected: FAIL — function not exported.

- [ ] **Step 3: Write minimal implementation** — add to `lib/parser/dataGaps.ts` (after `operatorActionableWarnings`):

```ts
/**
 * Read-time compatibility shim (Part D). Warnings persisted BEFORE per-row
 * anchoring carry a stale block-RANGE sourceCell (encode_range → contains ":") and
 * no per-row identity; the admin surface would keep collapsing them and rendering
 * the wrong block-header link until a re-parse rewrites the jsonb (which never
 * happens for an unchanged sheet). Clear that stale anchor at read time so legacy
 * rows behave like ambiguous rows: not deduped (count corrects) and link-less
 * (no wrong A55 link); the label still shows via rawSnippet. NO-OP once re-parsed
 * — Part C anchors are single cells (encode_cell → no ":") and ambiguous rows are
 * null, so the range-":" fingerprint is the exact, unambiguous legacy signature.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/dataGaps.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/parser/dataGaps.ts tests/parser/dataGaps.test.ts
git commit --no-verify -m "feat(parser): stripLegacyUnknownFieldAnchors read-time shim (Part D)"
```

---

## Task 8: apply the shim at the admin read boundary

**Files:**
- Modify: `app/admin/show/[slug]/page.tsx:291`
- Test: `tests/components/admin/perShowDataQualityActionable.test.tsx`

**Interfaces:**
- Consumes: `stripLegacyUnknownFieldAnchors` (Task 7), `operatorActionableWarnings`.

- [ ] **Step 1: Write the failing test** — assert the panel shows BOTH legacy rows and NO link. (append to `tests/components/admin/perShowDataQualityActionable.test.tsx`; mirror the file's existing render harness for `PerShowActionableWarnings` fed by `operatorActionableWarnings(stripLegacyUnknownFieldAnchors(warnings))`.)

```tsx
it("legacy: two UNKNOWN_FIELD sharing an A55 range render as two items with no link", () => {
  const legacy = [
    { code: "UNKNOWN_FIELD", severity: "warn", message: "a", rawSnippet: "Floor Plan | LINK",
      sourceCell: { title: "INFO", gid: 0, a1: "A55:B74" } },
    { code: "UNKNOWN_FIELD", severity: "warn", message: "b", rawSnippet: "GS Podium Type | (2) Acrylic",
      sourceCell: { title: "INFO", gid: 0, a1: "A55:B74" } },
  ];
  const items = operatorActionableWarnings(stripLegacyUnknownFieldAnchors(legacy as any));
  render(<PerShowActionableWarnings items={items} driveFileId="drive123" />);
  expect(screen.getAllByTestId("per-show-actionable-item")).toHaveLength(2);
  expect(screen.queryByRole("link", { name: /Open in Sheet/ })).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/perShowDataQualityActionable.test.tsx -t "legacy"`
Expected: FAIL — without the shim, `operatorActionableWarnings` collapses to 1 item and renders the A55 link.

- [ ] **Step 3: Write minimal implementation** — in `app/admin/show/[slug]/page.tsx`, add the import and wrap the assignment at line 291:

```ts
import { operatorActionableWarnings, stripLegacyUnknownFieldAnchors } from "@/lib/parser/dataGaps";
// ...
      warnings = stripLegacyUnknownFieldAnchors(
        Array.isArray(data?.parse_warnings) ? data!.parse_warnings : [],
      );
```

(The existing `operatorActionableWarnings(dataQuality.actionable)` at line 325 now receives shimmed warnings; the `messages` digest at 309-312 is unaffected — it excludes `OPERATOR_ACTIONABLE_ANCHORED` codes.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/admin/perShowDataQualityActionable.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/show/[slug]/page.tsx" tests/components/admin/perShowDataQualityActionable.test.tsx
git commit --no-verify -m "fix(admin): strip legacy UNKNOWN_FIELD anchors at the data-quality read boundary"
```

---

## Task 9: Part A + shim on Step-3 (UI — Opus + impeccable)

**Files:**
- Modify: `components/admin/wizard/Step3SheetCard.tsx:1496` (shim), `:826-848` (WarningsBreakdown label)
- Test: `tests/components/step3SheetCard.test.tsx`

**Interfaces:**
- Consumes: `stripLegacyUnknownFieldAnchors` (Task 7), `labelFromRawSnippet` (Task 1).

- [ ] **Step 1: Write the failing test** (append to `tests/components/step3SheetCard.test.tsx`; mirror the file's existing render harness)

```tsx
it("Part A: two UNKNOWN_FIELD warnings render distinguishable row labels", () => {
  // Render the card with two UNKNOWN_FIELD warnings differing only by rawSnippet label.
  // (Use the file's existing helper to build a card with a parse result carrying these warnings.)
  const warnings = [
    { code: "UNKNOWN_FIELD", severity: "warn", message: "Unrecognized event_details row label: 'Floor Plan'", rawSnippet: "Floor Plan | LINK" },
    { code: "UNKNOWN_FIELD", severity: "warn", message: "Unrecognized event_details row label: 'GS Podium Type'", rawSnippet: "GS Podium Type | (2) Acrylic Podium" },
  ];
  renderStep3CardWithWarnings(warnings); // existing/local harness
  // Scope extraction to the warnings list so a sibling panel cannot satisfy this.
  const list = screen.getByTestId(/wizard-step3-card-.*-warnings/); // or the WarningsBreakdown container
  expect(within(list).getByText("Floor Plan")).toBeInTheDocument();
  expect(within(list).getByText("GS Podium Type")).toBeInTheDocument();
  // The two entries are distinguishable: their label lines differ.
  expect(within(list).getByText("Floor Plan")).not.toBe(within(list).getByText("GS Podium Type"));
});
```

> If `renderStep3CardWithWarnings` / the list testid differ in the existing file, adapt to the file's established harness — the assertion (two distinct label texts, scoped to the warnings list) is the contract.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/step3SheetCard.test.tsx -t "Part A"`
Expected: FAIL — labels not rendered.

- [ ] **Step 3: Write minimal implementation**

Add imports to `components/admin/wizard/Step3SheetCard.tsx`:
```ts
import { labelFromRawSnippet } from "@/lib/parser/rawSnippet";
import { stripLegacyUnknownFieldAnchors } from "@/lib/parser/dataGaps";
```

Shim the Step-3 warnings source (line 1496):
```ts
  const warnings = stripLegacyUnknownFieldAnchors(arr(pr.warnings));
```

Surface the label in `WarningsBreakdown` — insert after the title `<span>` (line 841), before the `context` block:
```tsx
                <span className="font-medium text-text-strong">{renderEmphasis(title)}</span>
                {/* ...existing warn/info chip span... */}
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
Expected: PASS. Also run `pnpm vitest run tests/e2e/step3-card-dimensions.spec.ts` if it runs in the local harness (or note it runs in CI) — the added text line must not break the card's pinned dimensions.

- [ ] **Step 5: Commit**

```bash
git add components/admin/wizard/Step3SheetCard.tsx tests/components/step3SheetCard.test.tsx
git commit --no-verify -m "feat(crew-page): surface UNKNOWN_FIELD row label + shim legacy anchors in Step-3 review"
```

---

## Task 10: Part A on the admin Data-quality panel (UI — Opus + impeccable)

**Files:**
- Modify: `components/admin/PerShowActionableWarnings.tsx:44`
- Test: `tests/components/admin/perShowDataQualityActionable.test.tsx`

**Interfaces:**
- Consumes: `labelFromRawSnippet` (Task 1).

- [ ] **Step 1: Write the failing test** (append)

```tsx
it("Part A: renders the row label from rawSnippet under the title", () => {
  const items = [{ code: "UNKNOWN_FIELD", severity: "warn", message: "x", rawSnippet: "GS Podium Type | (2) Acrylic" }];
  render(<PerShowActionableWarnings items={items as any} driveFileId="d1" />);
  const item = screen.getByTestId("per-show-actionable-item");
  expect(within(item).getByText("GS Podium Type")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/perShowDataQualityActionable.test.tsx -t "Part A"`
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

## Task 11: live-sheet fidelity verification (gsheets MCP)

**Files:** none (verification + evidence only).

- [ ] **Step 1:** Read the live INFO tab of `1XQ44uxc44pToYxQnYw4OG9V6DjE7bC5EU08o5iFpxz4` (gid=0) via gsheets MCP (`sheets_get_values` INFO!A1:E120). Identify the DETAILS block rows and which two are the unrecognized labels (the reported repro).
- [ ] **Step 2:** Write a focused integration test (or a scratch `tsx` script) that downloads/loads the sheet as xlsx bytes and runs `extractUnknownFieldAnchors` + `resolveUnknownFieldCell` for those two labels; assert each resolves to a DISTINCT single-cell `a1` in column A (e.g. the two label rows), never a range, never the same cell.
- [ ] **Step 3:** Record the two resolved `a1` values + the two labels in the plan's closeout notes / commit message as evidence. If the live labels differ from assumptions, adjust the test fixtures (not the impl) accordingly.
- [ ] **Step 4: Commit** (if a durable integration test was added)

```bash
git add tests/drive/unknownFieldAnchors.live.test.ts
git commit --no-verify -m "test(drive): live-sheet fidelity for UNKNOWN_FIELD per-row anchors"
```

> If the gsheets MCP is unavailable in the run, fall back to the committed fixtures under `fixtures/shows/` for an INFO tab containing venue/details blocks, and note the substitution.

---

## Task 12: impeccable dual-gate on the UI diff (invariant 8)

**Files:** `components/admin/wizard/Step3SheetCard.tsx`, `components/admin/PerShowActionableWarnings.tsx` (and `app/admin/show/[slug]/page.tsx` shim — non-visual).

- [ ] **Step 1:** Run `/impeccable critique` on the UI diff (Tasks 9-10) with the canonical v3 preflight gates (PRODUCT.md → DESIGN.md → register → preflight signal).
- [ ] **Step 2:** Run `/impeccable audit` on the same diff.
- [ ] **Step 3:** Fix every HIGH/CRITICAL finding, or defer via a `DEFERRED.md` entry with rationale. Record findings + dispositions for the handoff.
- [ ] **Step 4: Commit** any fixes:

```bash
git add -A
git commit --no-verify -m "fix(admin): impeccable critique/audit findings on row-label surfacing"
```

---

## Task 13: full verification + close-out

- [ ] **Step 1:** `pnpm vitest run` (full suite). Expected: green. Investigate any failure in isolation (shared-DB pollution can cause `.db` false failures — re-run the specific file alone).
- [ ] **Step 2:** `pnpm typecheck` (or `pnpm tsc --noEmit`). Expected: no errors.
- [ ] **Step 3:** `pnpm prettier --check .` — the whole tree. Fix with `pnpm prettier --write` on touched files if needed.
- [ ] **Step 4:** `pnpm lint` on touched files. Expected: clean.
- [ ] **Step 5:** Confirm no stray edits: `git status` clean, `git log --oneline origin/main..HEAD` shows one commit per task.

---

## Self-review (author checklist — run before adversarial review)

1. **Spec coverage:** Part A (Tasks 9-10) ✓; Part B (Task 6) ✓; Part C (Tasks 2-5) ✓; Part D (Tasks 7-8, and Step-3 shim in Task 9) ✓; live-sheet verify (Task 11) ✓; impeccable (Task 12) ✓. §5.1.1 provenance → Task 3 provenance tests ✓.
2. **Placeholder scan:** every code step carries real code; test harness adaptation notes are explicit, not placeholders.
3. **Type consistency:** `normalizeCellKey` (Task 3) used consistently; `UnknownFieldAnchor` shape identical in Tasks 3-5; `labelFromRawSnippet`/`valueFromRawSnippet` signatures identical in Tasks 1/5/9/10; `stripLegacyUnknownFieldAnchors` signature identical in Tasks 7/8/9; `WarningAnchorSources.unknownField` added in Task 4 and consumed in Task 5.
