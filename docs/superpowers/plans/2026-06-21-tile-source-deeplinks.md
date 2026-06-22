# Tile → Source-Sheet Deep Links — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every crew-page source-backed card a subtle "In sheet ↗" link that opens the show's Google Sheet at the A1 region the card's data was parsed from.

**Architecture:** A standalone **label-coordinate scan** (`extractSourceAnchors`) reads the XLSX grid with absolute cell coordinates, finds each of 11 parser source-regions by its known labels (reusing parser alias constants), and computes a per-region `{title, gid, a1}` anchor via the §8.1.1 union-bounding-range reduction. Anchors are persisted in one `shows.source_anchors jsonb` column (written via the existing `applyShowSnapshot` shows-UPDATE, like `opening_reel_*`), projected through `getShowForViewer`, and turned into a URL at render time by the pure `buildSheetDeepLink` helper with a range→tab→whole-spreadsheet fallback ladder. The parser is **not** modified.

**Tech Stack:** Next.js 16, TypeScript, `sheetjs/xlsx`, postgres.js, Supabase, Vitest (node env), Playwright (real-browser layout).

## Mechanism decision (supersedes the spec's illustrative Hop 2/3 framing)

The spec (§6 Hop 3) sketched "the parser consumes pre-split anchored blocks" but **explicitly deferred the exact mechanism to this plan** ("The plan must … decide the exact mechanism"). The pre-draft code-verification pass established that `parseSheet` does **not** position-split markdown — every block parser (`lib/parser/blocks/*.ts`) scans the full markdown by label/regex, and several regions (`contacts` via `parseContacts`, `financials` via `parseOps`) are **global label scans with no block header**. Threading coordinates through that flow would be a large, fragile parser rewrite.

This plan instead extracts anchors with a **separate, parser-independent grid scan** that achieves the spec's exact contract — "every source-region resolves to exactly one `{title, gid, a1}` anchor, or none" (spec §6 Hop 3) — without touching the parser. This is strictly lower-risk and preserves the spec's §8.1.1 reduction rule (union bounding range) and §9 allowlist verbatim. All spec invariants (§5–§12) are unchanged.

---

## Global Constraints

Copied verbatim from the spec (§3 Resolved Decisions) and AGENTS.md; every task's requirements implicitly include these.

- **TDD per task** (AGENTS.md invariant 1): failing test → minimal impl → passing test → commit. Never implementation before its test.
- **Commit per task** (invariant 6), conventional-commits: `feat(<scope>)` / `test(<scope>)` / `fix(<scope>)`. Scopes in use: `sync`, `parser`, `drive`, `db`, `crew-page`, `data`, `test`, `infra`. This worktree commits with `--no-verify` (shared lint-staged hook); run `pnpm lint`/`pnpm test` explicitly instead.
- **Anchor shape:** `{ title: string; gid: number; a1?: string }`. `gid === 0` is VALID (INFO is gid 0) — presence tested with `gid != null`/`typeof gid === "number"`, NEVER truthiness (spec §5.3). `a1` is range-only A1, **no sheet prefix**, URL-encoded via `encodeURIComponent` at link-build time.
- **Allowlist (spec §9):** `INFO, AGENDA, GEAR, TRAVEL, PULL SHEET` only. Matched by tab **title**, case-sensitive, exact. Enforced at write-time (drop disallowed) AND read-time (`buildSheetDeepLink` re-checks).
- **11 canonical region ids (spec §8.1):** `crew, contacts, hotels, transportation, flights, rooms, venue, financials, details, gear_packlist, schedule`. Every §8.1 tab is in the allowlist.
- **Fallback ladder (spec §5.2):** `{title∈allowlist,gid,a1}` → `…/edit#gid=<gid>&range=<enc a1>`; `{title∈allowlist,gid}` or empty a1 → `…/edit#gid=<gid>`; anchor missing / title∉allowlist / no gid → `…/edit`; no `drive_file_id` → link omitted.
- **Migration discipline (AGENTS.md):** idempotent DDL; `pnpm gen:schema-manifest` + commit the manifest; apply to validation project; `validation-schema-parity` gate. `shows` write is already whole-table REVOKEd (`supabase/migrations/20260523000001_picker_epoch_columns.sql:45`) and in `tests/db/postgrest-dml-lockdown.test.ts:137-150` — the new column inherits both; re-run that test post-migration.
- **postgres.js jsonb:** pass the raw JS object to `$N::jsonb` — NEVER `JSON.stringify` (double-encode trap, `runScheduledCronSync.ts:1367`).
- **Advisory lock:** the write path runs inside `pg_advisory_xact_lock(hashtext('show:'||driveFileId))` (`lib/sync/lockedShowTx.ts:57`); `source_anchors` writes ride the existing locked txn — **no new lock holder** (single-holder rule).
- **UI is Opus + impeccable** (AGENTS.md invariant 8 + routing): all `components/crew/**` and section tasks ship only after `/impeccable critique` AND `/impeccable audit` pass.
- **Sheets v4 fields mask gotcha:** the mask must be valid v4 — `sheets(properties(sheetId,title))` is valid; never add non-schema paths (the `drawings.*` 400 incident, `tests/sync/embeddedImages.test.ts:99-104`).

---

## File structure

**Create:**
- `lib/drive/sourceAnchors.ts` — `extractSourceAnchors(buffer, titleGidMap)` + region→labels map + union reduction + allowlist filter. (~Hop 2/3)
- `lib/sheet-links/buildSheetDeepLink.ts` — pure URL helper + `SOURCE_LINK_ALLOWLIST` constant + `CARD_REGION_MAP` + `MIXED_SOURCE_REGISTRY`. (Hop 5)
- `components/crew/primitives/SourceLink.tsx` — the subtle "In sheet" affordance. (UI)
- `supabase/migrations/20260621000000_add_source_anchors.sql` — the column. (Hop 4)
- Tests: `tests/drive/sourceAnchors.test.ts`, `tests/sheet-links/buildSheetDeepLink.test.ts`, `tests/sheet-links/allowlistMeta.test.ts`, `tests/components/crew/sourceLinkCoverage.test.tsx`, `tests/parser/sourceAnchorsCorpus.test.ts`, `e2e/source-link-dimensional.spec.ts`.

**Modify:**
- `lib/sync/enrichWithDrivePins.ts` — widen `SpreadsheetSheet` to `{ title; sheetId?; embeddedObjects? }`; `DriveClient.listSpreadsheetSheets` unchanged signature, richer return.
- `lib/sync/runScheduledCronSync.ts` — widen fields mask (`:1549`), map `sheetId` (`:1540-1557`); call `extractSourceAnchors` in the pipeline (`~:2243`); thread `sourceAnchors` into the shows UPDATE arm of `applyShowSnapshot` (`~:1086-1115`).
- `lib/sync/applyParseResult.ts` — carry `sourceAnchors` on the snapshot payload (no new tx method).
- `lib/drive/fetch.ts` — add a sibling fetch that also returns the raw XLSX bytes for the anchor scan (or thread bytes), so `extractSourceAnchors` can run on the same buffer.
- `lib/data/getShowForViewer.ts` — add `driveFileId` + `sourceAnchors` to `ShowForViewer` (`:97-225`) and map from `showRowDb` (`~:631`); `select('*')` already fetches the columns.
- `tests/sync/defaultDriveClientSheetsFieldsMask.test.ts:51` — update the pinned mask.
- The 7 `components/crew/sections/*Section.tsx` — pass `action={<SourceLink …/>}` on each source-backed `SectionCard`.

---

## Task 1: Widen the Sheets fields mask to capture `sheetId` (Hop 1)

**Files:**
- Modify: `lib/sync/enrichWithDrivePins.ts:59-62` (SpreadsheetSheet type)
- Modify: `lib/sync/runScheduledCronSync.ts:1540-1557` (impl), `:1549` (mask)
- Test: `tests/sync/defaultDriveClientSheetsFieldsMask.test.ts:44-51`

**Interfaces:**
- Produces: `SpreadsheetSheet = { title: string; sheetId?: number; embeddedObjects?: SpreadsheetEmbeddedObject[] }`; `listSpreadsheetSheets` returns `sheetId` from `properties.sheetId`.

- [ ] **Step 1: Update the failing mask test**

In `tests/sync/defaultDriveClientSheetsFieldsMask.test.ts:51` change the assertion to:
```ts
expect(request.fields).toBe("sheets(properties(sheetId,title))");
```

- [ ] **Step 2: Run it — verify FAIL**

Run: `pnpm test -- tests/sync/defaultDriveClientSheetsFieldsMask.test.ts`
Expected: FAIL (`expected "sheets(properties(title))" to be "sheets(properties(sheetId,title))"`).

- [ ] **Step 3: Widen the mask + type + mapping**

`lib/sync/enrichWithDrivePins.ts:59-62`:
```ts
export type SpreadsheetSheet = {
  title: string;
  sheetId?: number;
  embeddedObjects?: SpreadsheetEmbeddedObject[];
};
```
`lib/sync/runScheduledCronSync.ts:1549`: `fields: "sheets(properties(sheetId,title))",`
In the `.map(...)` (`:1551-1556`) add `sheetId`:
```ts
return {
  title: record.properties?.title ?? "",
  sheetId: typeof record.properties?.sheetId === "number" ? record.properties.sheetId : undefined,
  embeddedObjects: [],
} satisfies SpreadsheetSheet;
```

- [ ] **Step 4: Run — verify PASS**

Run: `pnpm test -- tests/sync/defaultDriveClientSheetsFieldsMask.test.ts tests/sync/embeddedImages.test.ts`
Expected: PASS (embeddedImages still green — it only asserts the mask via the same constant).
Also update the comment at `tests/sync/embeddedImages.test.ts:103` to read `sheets(properties(sheetId,title))`.

- [ ] **Step 5: Commit**
```bash
git add lib/sync/enrichWithDrivePins.ts lib/sync/runScheduledCronSync.ts tests/sync/defaultDriveClientSheetsFieldsMask.test.ts tests/sync/embeddedImages.test.ts
git commit --no-verify -m "feat(sync): capture sheetId in listSpreadsheetSheets fields mask"
```

---

## Task 2: `buildSheetDeepLink` pure helper + allowlist constant (Hop 5, helper-first)

Built before the scanner so the anchor shape + allowlist are pinned by tests other tasks depend on.

**Files:**
- Create: `lib/sheet-links/buildSheetDeepLink.ts`, `tests/sheet-links/buildSheetDeepLink.test.ts`

**Interfaces:**
- Produces:
  - `export const SOURCE_LINK_ALLOWLIST = ["INFO","AGENDA","GEAR","TRAVEL","PULL SHEET"] as const;`
  - `export type SourceAnchor = { title: string; gid: number; a1?: string };`
  - `export function buildSheetDeepLink(driveFileId: string | null | undefined, anchor?: SourceAnchor | null): string | null`

- [ ] **Step 1: Write the failing test** (`tests/sheet-links/buildSheetDeepLink.test.ts`)
```ts
import { describe, it, expect } from "vitest";
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";

const ID = "1ABC";
const base = `https://docs.google.com/spreadsheets/d/${ID}/edit`;

describe("buildSheetDeepLink", () => {
  it("builds a range link", () => {
    expect(buildSheetDeepLink(ID, { title: "INFO", gid: 0, a1: "A18:E21" }))
      .toBe(`${base}#gid=0&range=A18%3AE21`);
  });
  it("gid 0 is valid (must not degrade)", () => {
    expect(buildSheetDeepLink(ID, { title: "INFO", gid: 0, a1: "A1:B2" }))
      .toBe(`${base}#gid=0&range=A1%3AB2`);
  });
  it("URL-encodes the range colon", () => {
    expect(buildSheetDeepLink(ID, { title: "AGENDA", gid: 5, a1: "A1:C1" }))
      .toBe(`${base}#gid=5&range=A1%3AC1`);
  });
  it("empty a1 → tab rung", () => {
    expect(buildSheetDeepLink(ID, { title: "INFO", gid: 0, a1: "" })).toBe(`${base}#gid=0`);
  });
  it("a1 without numeric gid → whole-spreadsheet", () => {
    // @ts-expect-error force missing gid
    expect(buildSheetDeepLink(ID, { title: "INFO", a1: "A1:B2" })).toBe(base);
  });
  it("disallowed title → whole-spreadsheet (read-time allowlist guard)", () => {
    expect(buildSheetDeepLink(ID, { title: "CLIENT", gid: 9, a1: "A1:B2" })).toBe(base);
  });
  it("missing anchor → whole-spreadsheet", () => {
    expect(buildSheetDeepLink(ID, null)).toBe(base);
  });
  it("null/empty driveFileId → omit (null)", () => {
    expect(buildSheetDeepLink(null, { title: "INFO", gid: 0, a1: "A1:B2" })).toBeNull();
    expect(buildSheetDeepLink("", { title: "INFO", gid: 0, a1: "A1:B2" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run — verify FAIL** (`pnpm test -- tests/sheet-links/buildSheetDeepLink.test.ts` → module not found).

- [ ] **Step 3: Implement** (`lib/sheet-links/buildSheetDeepLink.ts`)
```ts
export const SOURCE_LINK_ALLOWLIST = ["INFO", "AGENDA", "GEAR", "TRAVEL", "PULL SHEET"] as const;
export type AllowedTabTitle = (typeof SOURCE_LINK_ALLOWLIST)[number];
export type SourceAnchor = { title: string; gid: number; a1?: string };

function isAllowed(title: string): boolean {
  return (SOURCE_LINK_ALLOWLIST as readonly string[]).includes(title);
}

export function buildSheetDeepLink(
  driveFileId: string | null | undefined,
  anchor?: SourceAnchor | null,
): string | null {
  if (!driveFileId) return null; // null OR empty string → omit
  const base = `https://docs.google.com/spreadsheets/d/${driveFileId}/edit`;
  if (!anchor || !isAllowed(anchor.title) || typeof anchor.gid !== "number") return base;
  let url = `${base}#gid=${anchor.gid}`; // gid===0 emitted literally
  if (anchor.a1) url += `&range=${encodeURIComponent(anchor.a1)}`;
  return url;
}
```

- [ ] **Step 4: Run — verify PASS** (`pnpm test -- tests/sheet-links/buildSheetDeepLink.test.ts`).

- [ ] **Step 5: Negative-regression** — temporarily change `typeof anchor.gid !== "number"` to `!anchor.gid` and confirm the gid-0 test FAILS; revert. Temporarily drop the `isAllowed` check and confirm the disallowed-title test FAILS; revert.

- [ ] **Step 6: Commit**
```bash
git add lib/sheet-links/buildSheetDeepLink.ts tests/sheet-links/buildSheetDeepLink.test.ts
git commit --no-verify -m "feat(crew-page): buildSheetDeepLink helper with gid-0 + allowlist + encoding"
```

---

## Task 3: `REGION_ANCHOR_SPEC` (per-region extraction strategy) + card/registry maps (data contract)

Addresses plan-R1 findings 1 & 2: a **complete literal** spec with an explicit **extraction strategy per region** (a uniform first-cell-label scan is unsound — `contacts`/`financials` are global row-label scans, `gear_packlist`/`schedule` are whole-tab, `flights` aliases `crew`).

**Files:**
- Modify: `lib/sheet-links/buildSheetDeepLink.ts` (pure data consumed by Task 4 scan, Task 9 UI, meta-tests)
- Test: `tests/sheet-links/allowlistMeta.test.ts`

**Interfaces — Produces (exact, no placeholders):**
```ts
export const REGION_IDS = ["crew","contacts","hotels","transportation","flights",
  "rooms","venue","financials","details","gear_packlist","schedule"] as const;
export type RegionId = (typeof REGION_IDS)[number];

// EXACT full-cell section-header matches that bound a "header-block" region (mirror
// of the parser's per-block TERMINATING_LABELS; lib/parser/blocks/crew.ts:29-46 et al.).
// Anchored with $ so a region's OWN data rows (e.g. "Hotel Address", "Details note",
// "Driver") do NOT terminate its block (plan-R2 finding 2). The header row is excluded
// from terminator evaluation by scanning from the row AFTER the header (plan-R2 finding 1).
export const BLOCK_TERMINATORS: RegExp[] = [
  /^(CREW|TECH|VENUE|DATES|HOTEL|HOTELS|ROOMS|TRANSPORTATION|CONTACTS|SCHEDULE|PULL SHEET|DIAGRAMS|EVENT DETAILS|DETAILS|DRESS|GENERAL SESSION|BREAKOUT(?:\s+\d+)?|TO DO)$/i,
];

export type RegionAnchorSpec =
  | { tabs: AllowedTabTitle[]; strategy: "row-label-union"; labels: RegExp[] }
  | { tabs: AllowedTabTitle[]; strategy: "header-block"; header: RegExp; terminators: RegExp[] }
  | { tabs: AllowedTabTitle[]; strategy: "whole-tab" }
  | { tabs: AllowedTabTitle[]; strategy: "alias-of"; region: RegionId };

export const REGION_ANCHOR_SPEC: Record<RegionId, RegionAnchorSpec> = {
  crew:           { tabs: ["INFO"], strategy: "header-block", header: /^(CREW|TECH)$/i, terminators: BLOCK_TERMINATORS },
  flights:        { tabs: ["INFO"], strategy: "alias-of", region: "crew" }, // legacy flights live in the INFO TECH grid arrival/departure cols (spec §10)
  contacts:       { tabs: ["INFO"], strategy: "row-label-union", labels: [/contact\s*info/i, /in\s*house\s*av/i, /^contact\b/i] },
  hotels:         { tabs: ["INFO"], strategy: "header-block", header: /^(HOTEL|HOTELS|Hotel Stays|Hotel Reservations)$/i, terminators: BLOCK_TERMINATORS },
  transportation: { tabs: ["INFO"], strategy: "header-block", header: /^(TRANSPORTATION|Driver)$/i, terminators: BLOCK_TERMINATORS },
  rooms:          { tabs: ["INFO"], strategy: "row-label-union", labels: [/^GENERAL SESSION/i, /^BREAKOUT/i, /^GS (Setup|Set Time|Strike Time|Audio|Video|Scenic|Other)/i, /^BO (Setup|Set Time|Strike Time|Audio|Video|Other)/i] },
  venue:          { tabs: ["INFO"], strategy: "row-label-union", labels: [/^VENUE$/i, /Hotel Address/i, /Loading Dock/i, /Google/i] },
  financials:     { tabs: ["INFO"], strategy: "row-label-union", labels: [/^COI$/i, /^PO\s*#?$/i, /^Proposal$/i, /^Invoice/i] },
  details:        { tabs: ["INFO"], strategy: "header-block", header: /^(EVENT\s+DETAILS|DETAILS|GS\s+DETAILS)/i, terminators: BLOCK_TERMINATORS },
  gear_packlist:  { tabs: ["PULL SHEET","GEAR"], strategy: "whole-tab" },
  schedule:       { tabs: ["AGENDA"], strategy: "whole-tab" },
};

export const CARD_REGION_MAP: Record<string, RegionId> = { /* spec §8.2, e.g. */ "crew-roster":"crew", "crew-contacts":"contacts", "travel-flight":"flights", "travel-getting-there":"transportation", "travel-hotels":"hotels", "venue-where":"venue", "venue-facilities":"venue", "venue-status":"venue", "gear-scope-audio":"rooms", "gear-scope-video":"rooms", "gear-scope-lighting":"rooms", "gear-pack-list":"gear_packlist", "gear-keynote":"details", "gear-opening-reel":"details", "schedule-days":"schedule", "schedule-call-times":"rooms", "budget-main":"financials", "today-tonight":"hotels", "today-where":"venue", "today-contact":"contacts", "today-key-times":"rooms", "today-dress":"details", "today-run-of-show":"schedule" };
export const MIXED_SOURCE_REGISTRY: Record<string, { primary: RegionId; secondaryFields: string[] }> = { "venue-facilities": { primary: "venue", secondaryFields: ["transportation.parking","event_details.internet","event_details.power"] }, "venue-status": { primary: "venue", secondaryFields: ["coi_status"] } };
export const OUT_OF_SCOPE_CARDS = ["today-rightnow","today-notes","venue-diagrams","gear-opening-reel-video"] as const;
```

- [ ] **Step 1: Write the failing meta-test** (`tests/sheet-links/allowlistMeta.test.ts`)
```ts
import { describe, it, expect } from "vitest";
import { SOURCE_LINK_ALLOWLIST, REGION_ANCHOR_SPEC, REGION_IDS } from "@/lib/sheet-links/buildSheetDeepLink";

describe("§8.1↔§9 consistency", () => {
  it("every tab in every region spec is in the allowlist", () => {
    for (const id of REGION_IDS) for (const tab of REGION_ANCHOR_SPEC[id].tabs) {
      expect(SOURCE_LINK_ALLOWLIST as readonly string[]).toContain(tab);
    }
  });
  it("master-library tabs are NOT in the allowlist", () => {
    for (const t of ["CLIENT","VENUE","TECH","ROLE","VEHICLE","CLIENTUNIQUE","CONTACTUNIQUE","FORM"]) {
      expect(SOURCE_LINK_ALLOWLIST as readonly string[]).not.toContain(t);
    }
  });
  it("covers all 11 canonical regions and alias targets resolve", () => {
    expect(REGION_IDS.length).toBe(11);
    for (const id of REGION_IDS) { const s = REGION_ANCHOR_SPEC[id]; if (s.strategy === "alias-of") expect(REGION_IDS).toContain(s.region); }
  });
});
```

- [ ] **Step 2: Run — verify FAIL** (`pnpm test -- tests/sheet-links/allowlistMeta.test.ts` → REGION_ANCHOR_SPEC undefined).
- [ ] **Step 3: Implement** the exact literals above in `lib/sheet-links/buildSheetDeepLink.ts`.
- [ ] **Step 4: Run — verify PASS**.
- [ ] **Step 5: Commit** `feat(crew-page): REGION_ANCHOR_SPEC (per-region strategy) + card/registry maps`

---

## Task 4: `extractSourceAnchors` — the label-coordinate scan (Hop 2/3 core)

**Files:**
- Create: `lib/drive/sourceAnchors.ts`, `tests/drive/sourceAnchors.test.ts`

**Interfaces:**
- Consumes: `Map<string, number>` `{title→gid}` (from Task 1's `SpreadsheetSheet[]`); `REGION_ANCHOR_SPEC`, `REGION_IDS`, `SOURCE_LINK_ALLOWLIST` (Task 3).
- Produces: `export function extractSourceAnchors(buffer: ArrayBuffer, titleToGid: Map<string, number>): Record<string, SourceAnchor>` — returns `{}` when nothing matches; keys ⊆ REGION_IDS; every value's `title` ∈ allowlist.

Algorithm (spec §8.1.1) — read the workbook; for each region, pick the **first tab in `spec.tabs` that exists in `titleToGid`** (so its title ∈ allowlist by Task-3's consistency test). Build that tab's grid keeping the **absolute** `(row,col)` origin from `XLSX.utils.decode_range(sheet["!ref"])` (do NOT discard `range.s.r/s.c`); merge-expand so a merged label resolves at its top-left. Then per **strategy**:
- **`row-label-union`** (`contacts`, `rooms`, `venue`, `financials`): collect every row whose first non-blank cell text matches any `labels` regex; the anchor `a1` = the bounding rectangle from the min (row,col) to the max (row, last-non-blank-col) across matched rows.
- **`header-block`** (`crew`, `hotels`, `transportation`, `details`): find the first row whose first cell matches `header`; **include that header row**, then scan **from the NEXT row** downward, stopping (exclusive) at the first row whose first cell **exactly** matches a `terminators` header, or a blank run / sheet end. The header row is never evaluated as its own terminator (plan-R2 finding 1). Because terminators are exact full-cell matches anchored with `$`, a region's own data rows (`Hotel Address`, a `Details note`, `Driver`, `Parking`) do NOT terminate the block (plan-R2 finding 2). `a1` = bounding rectangle from the header row through the last included row.
- **`whole-tab`** (`gear_packlist`, `schedule`): `a1` = the tab's used range (`decode_range(!ref)` → top-left:bottom-right in A1).
- **`alias-of`** (`flights`→`crew`): resolved in a second pass — copy the referenced region's computed anchor verbatim (or omit if the referent is absent).
Zero matches / tab absent → omit the region. `a1` via `XLSX.utils.encode_range` (range-only, no sheet prefix). Apply the allowlist title check defensively before emitting (belt-and-suspenders with the tab selection).

- [ ] **Step 1: Write the failing test** (`tests/drive/sourceAnchors.test.ts`) — build fixtures with the `workbookBuffer` helper pattern (`tests/drive/exportSheetToMarkdown.test.ts:5-19`):
```ts
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { extractSourceAnchors } from "@/lib/drive/sourceAnchors";

function buf(sheets: Array<{ name: string; rows: unknown[][] }>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name);
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

it("single-block region → its row range", () => {
  const b = buf([{ name: "INFO", rows: [["CLIENT","ACME"], [], ["VENUE","Four Seasons"], ["Hotel Address","525 N"]] }]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.venue).toEqual({ title: "INFO", gid: 0, a1: "A3:B4" }); // VENUE block union incl. address row
});

it("union-with-overreach for a multi-label region (financials)", () => {
  const b = buf([{ name: "INFO", rows: [["COI","Sent"], ["Proposal","Sent - $17,500"], ["PO#",""]] }]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.financials).toEqual({ title: "INFO", gid: 0, a1: "A1:B3" });
});

it("drops a region whose tab is NOT allowlisted (no CLIENT anchor)", () => {
  const b = buf([{ name: "CLIENT", rows: [["VENUE","x"]] }]);
  const a = extractSourceAnchors(b, new Map([["CLIENT", 7]]));
  expect(a.venue).toBeUndefined();
});

it("zero matches → region omitted", () => {
  const b = buf([{ name: "INFO", rows: [["CLIENT","ACME"]] }]);
  expect(extractSourceAnchors(b, new Map([["INFO", 0]])).rooms).toBeUndefined();
});

it("schedule = whole AGENDA tab (cross-tab: INFO dates excluded)", () => {
  const b = buf([
    { name: "INFO", rows: [["DATES"], ["Travel","5/13"]] },
    { name: "AGENDA", rows: [["NAME","START","FINISH"], ["","7:15 AM","7:30 AM"]] },
  ]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0], ["AGENDA", 99]]));
  expect(a.schedule).toEqual({ title: "AGENDA", gid: 99, a1: "A1:C2" }); // whole used range
});

it("contacts = row-label union (global scan, no header)", () => {
  const b = buf([{ name: "INFO", rows: [["CLIENT","x"], ["Hotal Contact Info","ashley@x"], ["In House AV","mark@y"]] }]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.contacts).toEqual({ title: "INFO", gid: 0, a1: "A2:B3" });
});

it("transportation = header-block (header → terminator)", () => {
  const b = buf([{ name: "INFO", rows: [["TRANSPORTATION","Van"], ["Driver","James"], ["Parking","#45"], ["HOTEL","Four Seasons"]] }]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.transportation).toEqual({ title: "INFO", gid: 0, a1: "A1:B3" }); // stops before HOTEL terminator
});

it("flights aliases the crew anchor", () => {
  const b = buf([{ name: "INFO", rows: [["TECH","PHONE"], ["Doug - Lead","917"], ["Eric - A1","508"], ["HOTEL","x"]] }]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.flights).toEqual(a.crew); // same anchor as crew
  expect(a.crew?.title).toBe("INFO");
});

it("gear_packlist = whole PULL SHEET tab; falls back to GEAR when PULL SHEET absent", () => {
  const b1 = buf([{ name: "PULL SHEET", rows: [["QTY","ITEM"], ["2","QU32"]] }]);
  expect(extractSourceAnchors(b1, new Map([["PULL SHEET", 7]])).gear_packlist).toEqual({ title: "PULL SHEET", gid: 7, a1: "A1:B2" });
  const b2 = buf([{ name: "GEAR", rows: [["QTY","ITEM"], ["1","Eiki"]] }]);
  expect(extractSourceAnchors(b2, new Map([["GEAR", 8]])).gear_packlist).toEqual({ title: "GEAR", gid: 8, a1: "A1:B2" });
});

it("rooms = row-label union of GS/BO scope rows", () => {
  const b = buf([{ name: "INFO", rows: [["GS Audio","(1) QU32"], ["GS Video","(2) Eiki"], ["BO Audio","NONE"]] }]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.rooms).toEqual({ title: "INFO", gid: 0, a1: "A1:B3" });
});

it("header-block: header row is NOT its own terminator (crew spans header+data)", () => {
  const b = buf([{ name: "INFO", rows: [["CREW","NAME"], ["Doug - Lead","917"], ["VENUE","Four Seasons"]] }]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.crew).toEqual({ title: "INFO", gid: 0, a1: "A1:B2" }); // CREW header + 1 data row, stops at VENUE — NOT an empty/one-row block
});

it("header-block: a region's own data row sharing the header prefix does NOT terminate (hotels keeps 'Hotel Address')", () => {
  const b = buf([{ name: "INFO", rows: [["HOTEL","Four Seasons"], ["Hotel Address","525 N"], ["DATES","5/13"]] }]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.hotels).toEqual({ title: "INFO", gid: 0, a1: "A1:B2" }); // includes 'Hotel Address', stops at exact DATES header
});

it("header-block: details keeps a 'Details note' data row (exact-match terminators)", () => {
  const b = buf([{ name: "INFO", rows: [["EVENT DETAILS","x"], ["LED","NO"], ["Details note","keep me"], ["CREW","NAME"]] }]);
  const a = extractSourceAnchors(b, new Map([["INFO", 0]]));
  expect(a.details).toEqual({ title: "INFO", gid: 0, a1: "A1:B3" }); // LED + 'Details note' included, stops at CREW
});
```

- [ ] **Step 2: Run — verify FAIL** (module not found).

- [ ] **Step 3: Implement `extractSourceAnchors`** in `lib/drive/sourceAnchors.ts` (absolute-coordinate grid scan + per-region label match + union range + allowlist filter, per the algorithm above). Reuse `XLSX` import style from `lib/drive/exportSheetToMarkdown.ts`.

- [ ] **Step 4: Run — verify PASS** (`pnpm test -- tests/drive/sourceAnchors.test.ts`).

- [ ] **Step 5: Negative-regression** — set the financials union to "first match only" and confirm the union test FAILS (proves overreach union); revert.

- [ ] **Step 6: Commit** `feat(drive): extractSourceAnchors label-coordinate region scan`

---

## Task 5: Wire the anchor scan into the sync pipeline (Hop 1↔2↔4 wiring)

**Files:**
- Modify: `lib/drive/fetch.ts:144` (return bytes alongside markdown, or add `fetchSheetXlsxBytes`), `lib/sync/runScheduledCronSync.ts:2241-2275` (call `extractSourceAnchors` with the `{title→gid}` map + bytes), `lib/sync/applyParseResult.ts` (carry `sourceAnchors` on the snapshot payload).
- Test: `tests/sync/sourceAnchorsPipeline.test.ts`

**Interfaces:**
- Consumes: `extractSourceAnchors` (Task 4), `listSpreadsheetSheets` (Task 1).
- Produces: `sourceAnchors: Record<string, SourceAnchor>` reaches `applyShowSnapshot`'s shows-UPDATE payload (Task 6).

**Ownership change (plan-R1 finding 4 — exactly one Sheets API list call):**
1. In `runScheduledCronSync` (`~:2241-2275`), call `listSpreadsheetSheets(driveFileId)` **once** near the top of the parse step, into `const sheets: SpreadsheetSheet[]`. Build `const titleToGid = new Map(sheets.filter(s => typeof s.sheetId === "number").map(s => [s.title, s.sheetId!]))`.
2. Change `enrichWithDrivePins` (`lib/sync/enrichWithDrivePins.ts:112-129`) to **accept a pre-fetched `sheets` list** via its `EnrichContext` (add `sheets?: SpreadsheetSheet[]`). `extractEmbeddedImages` uses `ctx.sheets ?? (driveClient.listSpreadsheetSheets ? await driveClient.listSpreadsheetSheets(ctx.driveFileId) : [])` — so when the pipeline passes `sheets`, enrich does NOT re-call the API.
3. Obtain the raw XLSX bytes once: have `fetchSheetAsMarkdownAtRevision` (or a new sibling `fetchSheetXlsxAtRevision`) also return `{ markdown, bytes }` (the bytes already decoded at `lib/drive/fetch.ts:144`), or fetch bytes once and pass to both `synthesizeMarkdownFromXlsx` and `extractSourceAnchors`.
4. `const sourceAnchors = extractSourceAnchors(bytes, titleToGid)`; add `sourceAnchors: Record<string, SourceAnchor>` to **`ApplyParseResultArgs`** (`lib/sync/applyParseResult.ts:26-53` args type) and pass the extracted value into the object handed to `tx.applyShowSnapshot` (alongside the existing `parseResult.openingReel` flow).

**Task-boundary (plan-R3 finding 1):** Task 5 is **in-memory threading ONLY** — it adds the field to the args type and populates it; it touches **no SQL and no DDL**. The `source_anchors` **column + the `applyShowSnapshot` UPDATE write + the persisted-row assertion are Task 6.** Task 5's test mocks `tx` and asserts the *value handed to the tx* carries the anchors; it does not hit a DB.

- [ ] **Step 1: Write the failing test** — pipeline test (deps-injection style per `tests/sync/*`) with a **mock `tx`**: stub `driveClient.listSpreadsheetSheets` (a `vi.fn()` returning `[{title:"INFO",sheetId:0}]`) + stub bytes with a VENUE row. Assert (a) the object passed to the mocked `tx.applyShowSnapshot` (i.e. `ApplyParseResultArgs.sourceAnchors`) has `venue.gid === 0` (in-memory, no DB write), and (b) **`listSpreadsheetSheets` was called exactly once** (`expect(stub).toHaveBeenCalledTimes(1)`) across both anchor extraction and enrichment.
- [ ] **Step 2: Run — verify FAIL.**
- [ ] **Step 3: Implement the ownership change** (ownership steps 1-4 above; type + threading only, no SQL).
- [ ] **Step 4: Run — verify PASS**; `pnpm test -- tests/sync` to confirm no sync/enrich regressions (esp. `tests/sync/embeddedImages.test.ts`).
- [ ] **Step 5: Commit** `feat(sync): extract source_anchors + thread onto the in-memory snapshot args`

---

## Task 6: Migration + persist `source_anchors` (Hop 4)

**Owns persistence** (plan-R3 finding 1): the `source_anchors` DDL, the `applyShowSnapshot` UPDATE SQL that writes it, and the persisted-row assertion. Consumes `ApplyParseResultArgs.sourceAnchors` (populated in-memory by Task 5).

**Files:**
- Create: `supabase/migrations/20260621000000_add_source_anchors.sql`
- Modify: `lib/sync/runScheduledCronSync.ts:1086-1115` (applyShowSnapshot shows-UPDATE arm — add `source_anchors = $N::jsonb`), `supabase/__generated__/schema-manifest.json` (regen)
- Test: extend `tests/sync/sourceAnchorsPipeline.test.ts`; re-run `tests/db/postgrest-dml-lockdown.test.ts`, `tests/db/validation-schema-parity.test.ts`

- [ ] **Step 1: Write the migration** (header-comment style per `20260619000000_*`):
```sql
-- Tile → source-sheet deep links (spec 2026-06-21 §11). One jsonb map keyed by
-- source-region id → { title, gid, a1 }. Written only by the SECURITY-DEFINER sync
-- path under the per-show advisory lock; shows write is already REVOKEd from
-- anon/authenticated (20260523000001_picker_epoch_columns.sql:45). Idempotent.
alter table public.shows add column if not exists source_anchors jsonb not null default '{}'::jsonb;
```

- [ ] **Step 2: Apply locally + regen manifest**
```bash
psql "$TEST_DATABASE_URL" -f supabase/migrations/20260621000000_add_source_anchors.sql || supabase db query --linked "$(cat supabase/migrations/20260621000000_add_source_anchors.sql)"
pnpm gen:schema-manifest
```
Expected: `schema-manifest.json` now lists `shows.source_anchors`.

- [ ] **Step 3: Write the shows-UPDATE failing test** — assert the applied shows row has `source_anchors` equal to the scanned map (pass the raw object to `$N::jsonb`, never `JSON.stringify`).

- [ ] **Step 4: Implement the write** in the `applyShowSnapshot` UPDATE arm (`~:1086-1115`) — add `source_anchors = $N::jsonb` with the raw `args.sourceAnchors ?? {}` object; mind the `$1..$N` parameter count (the documented 42P18 trap, `:1007`).

- [ ] **Step 5: Run the DB gates**
```bash
pnpm test -- tests/db/validation-schema-parity.test.ts tests/db/postgrest-dml-lockdown.test.ts tests/sync/sourceAnchorsPipeline.test.ts
```
Expected: PASS. Layer-1 parity confirms the manifest; the `shows` lockdown row (`:137`) UPDATE probe still 403s (whole-table REVOKE covers the new column — no registry change).

- [ ] **Step 6: Apply to the validation project + commit**
```bash
supabase db query --linked "alter table public.shows add column if not exists source_anchors jsonb not null default '{}'::jsonb;"
# then: notify pgrst, 'reload schema';
git add supabase/migrations/20260621000000_add_source_anchors.sql supabase/__generated__/schema-manifest.json lib/sync/runScheduledCronSync.ts lib/sync/applyParseResult.ts tests/sync/sourceAnchorsPipeline.test.ts
git commit --no-verify -m "feat(db): add shows.source_anchors jsonb + persist via applyShowSnapshot"
```

---

## Task 7: Project `driveFileId` + `sourceAnchors` through `getShowForViewer` (Hop 5)

**Files:**
- Modify: `lib/data/getShowForViewer.ts:97-225` (type), `~:631` (mapping)
- Test: `tests/data/getShowForViewerSourceAnchors.test.ts`

**Interfaces:**
- Produces: `ShowForViewer.driveFileId: string | null` and `ShowForViewer.sourceAnchors: Record<string, SourceAnchor>` (degrades to `{}` / `null` when absent). `select('*')` (`:266`) already fetches both columns — only the type + mapping change.

- [ ] **Step 1: Write the failing test** — `makeShowForViewer`-style fixture; assert `getShowForViewer` maps `showRowDb.drive_file_id` → `driveFileId` and `showRowDb.source_anchors` → `sourceAnchors`, and that a missing/`null` column yields `{}` / `null` (no throw).
- [ ] **Step 2: Run — verify FAIL.**
- [ ] **Step 3: Add the fields to the `ShowForViewer` type and map them** (mirror the `opening_reel_drive_file_id` cast pattern at `:632-633`): `driveFileId: (showRowDb.drive_file_id as string | null | undefined) ?? null,` and `sourceAnchors: (showRowDb.source_anchors as Record<string, SourceAnchor> | null | undefined) ?? {},`. No new sub-query → no `tileErrors` key, no invariant-9 surface (note inline `// not-subject-to-meta: projected from the already-fetched shows row`).
- [ ] **Step 4: Run — verify PASS.**
- [ ] **Step 5: Commit** `feat(data): project driveFileId + sourceAnchors in getShowForViewer`

---

## Task 8: `SourceLink` UI primitive (Opus + impeccable)

**Files:**
- Create: `components/crew/primitives/SourceLink.tsx`, `tests/components/crew/sourceLink.test.tsx`

**Interfaces:**
- Consumes: `buildSheetDeepLink`, `SourceAnchor`.
- Produces: `export function SourceLink({ driveFileId, anchor }: { driveFileId: string | null; anchor?: SourceAnchor | null }): ReactNode` — renders nothing when `buildSheetDeepLink` returns `null`; else a subtle `<a target="_blank" rel="noopener noreferrer">` with the spreadsheet glyph + "In sheet", styled for the `SectionCard` action slot (`flex shrink-0 items-center h-fit`, low-contrast token), `aria-label="View this section in the source sheet"`.

- [ ] **Step 1: Write the failing test** (`@vitest-environment jsdom`): renders nothing for `driveFileId=null`; renders an `<a>` with the correct `href` (asserted against `buildSheetDeepLink` output, NOT the literal — anti-tautology) + `target=_blank` + `rel=noopener noreferrer` + aria-label for a valid anchor.
- [ ] **Step 2: Run — verify FAIL.**
- [ ] **Step 3: Implement `SourceLink`** (use the frontend-design / impeccable tokens; no inline `tracking-[…]`; reuse existing icon-family treatment per `SectionCard` icon slot).
- [ ] **Step 4: Run — verify PASS.**
- [ ] **Step 5: Run `/impeccable critique` + `/impeccable audit`** on the SourceLink diff; fix HIGH/CRITICAL or defer in `DEFERRED.md`.
- [ ] **Step 6: Commit** `feat(crew-page): SourceLink primitive (subtle "In sheet" affordance)`

---

## Task 9: Field-aware coverage walker (TEST FIRST) → wire `SourceLink` into the 7 sections (Opus + impeccable)

TDD per plan-R1 finding 3: the coverage walker is the **failing test authored first**; the section wiring is the implementation that makes it pass.

**Files:**
- Create: `tests/components/crew/sourceLinkCoverage.test.tsx` (the walker — Step 1)
- Modify: all 7 `components/crew/sections/*Section.tsx` (Step 3)

The walker (spec §12 field-aware list): render each section with a full `makeShowForViewer` fixture (give every region a non-empty anchor in `data.sourceAnchors`); discover every source-backed `SectionCard` via `data-slot="section-card-action"` + a stable `data-card-id` added to each card; assert — (a) every source-backed card has an `action` link whose `href` === `buildSheetDeepLink(driveFileId, sourceAnchors[CARD_REGION_MAP[cardId]])` (anti-tautology: compare to the helper output, not a literal, and scope to the card header); (b) every card rendering >1 region's fields is in `MIXED_SOURCE_REGISTRY` with a matching field set; (c) every card with no link is in `OUT_OF_SCOPE_CARDS`; (d) every `REGION_ID` is referenced by ≥1 card in `CARD_REGION_MAP`. Walks rendered cards (not a hardcoded list) → a new SectionCard fails until classified.

- [ ] **Step 1: Write the walker test** (`tests/components/crew/sourceLinkCoverage.test.tsx`, `@vitest-environment jsdom`). Add a `data-card-id="<cardId>"` to each `SectionCard` call site's wrapper as you reference them (the ids in `CARD_REGION_MAP`).
- [ ] **Step 2: Run — verify FAIL** (`pnpm test -- tests/components/crew/sourceLinkCoverage.test.tsx`): no `action` links wired yet → coverage assertion (a) fails for every source-backed card.
- [ ] **Step 3: Wire the sections** — add `action={<SourceLink driveFileId={data.driveFileId} anchor={data.sourceAnchors[CARD_REGION_MAP["<cardId>"]]} />}` to each source-backed `SectionCard` per `CARD_REGION_MAP`; mixed cards use `MIXED_SOURCE_REGISTRY[...].primary`; add no `action` to the four `OUT_OF_SCOPE_CARDS`. Today's cards reuse the canonical region anchors.
- [ ] **Step 4: Run — verify PASS** + crew-wide sweep: `pnpm test -- tests/components/crew tests/components/tiles/_metaSentinelHidingContract.test.ts` (a shared `SectionCard` change can break distant tiles). Negative-regression: drop one card's `action`, confirm the walker FAILS, revert.
- [ ] **Step 5: Run `/impeccable critique` + `/impeccable audit`** on the sections + walker diff; fix HIGH/CRITICAL or defer.
- [ ] **Step 6: Commit** `feat(crew-page): source-sheet links on all 7 sections + field-aware coverage walker`

---

## Task 10: (folded into Task 9) — field-aware coverage parity walker

The walker is authored as Task 9 Step 1 (test-first per TDD). No separate task; see Task 9.

---

## Task 11: Corpus regression — anchors resolve to the right tab+region (spec §12)

**Files:**
- Create: `tests/parser/sourceAnchorsCorpus.test.ts` (mirror `tests/parser/exporterFixtures.test.ts` style over `fixtures/shows/raw/*.md` + the exporter-xlsx fixtures)

Since the corpus markdown fixtures lost coordinates, this test runs `extractSourceAnchors` against committed **xlsx** fixtures (add 2 representative ones under `fixtures/shows/exporter-xlsx/` — one legacy single-INFO, one standardized) and asserts each produced anchor's `title` ∈ allowlist and region→tab matches §8.1, incl. the cross-tab `schedule` (AGENDA) and a union case. If committing binary xlsx is undesirable, synthesize the two fixtures in-test via `XLSX.utils` from small representative grids drawn from the live East Coast / RPAS layouts.

- [ ] **Step 1: Write the corpus test** (region→tab assertions per §8.1, incl. cross-tab `schedule`=AGENDA + a union case).
- [ ] **Step 2: Run — verify PASS** (the scanner exists from Task 4): `pnpm test -- tests/parser/sourceAnchorsCorpus.test.ts`.
- [ ] **Step 3: Negative-red (prove the gate catches a bad mapping)** — temporarily change `REGION_ANCHOR_SPEC.schedule.tabs` to `["CLIENT"]` (a disallowed/wrong tab) and re-run; confirm the corpus test **FAILS** (schedule anchor now dropped / title not allowlisted). **Revert** and confirm green again. This supplies the red/green proof the TDD invariant requires for a regression gate built after its scanner.
- [ ] **Step 4: Commit** `test(parser): source-anchor corpus regression (legacy + standardized)`

---

## Task 12: Real-browser dimensional invariant (spec §5.4 — mandatory, jsdom insufficient)

**Harness (plan-R4 finding 1 — explicit control render):** a dev-gated render route mounts the four measured primitives **twice with identical props** — once with `action={<SourceLink…/>}`, once with `action={undefined}` — so the spec gets a real-browser no-link control without depending on the global Task-9 wiring or app seed data.

**Files:**
- Create: `app/admin/dev/source-link-dim/page.tsx` — dev-only (gated by `ADMIN_DEV_PANEL_ENABLED`, mirroring the existing `/admin/dev` route used by the `dev-build` Playwright project, `playwright.config.ts:37-190`). Renders, inside a fixed-width column: a `SectionCard` containing one `PersonRow`, one `FactRows` row, one `KeyValueRows` row, one `KeyTimesStrip` cell (static fixture props), in two sibling containers — `data-testid="card-with-link"` (passes `action={<SourceLink driveFileId="x" anchor={{title:"INFO",gid:0,a1:"A1:B2"}} />}`) and `data-testid="card-no-link"` (`action={undefined}`). Each measured row carries a stable testid: `dim-personrow`, `dim-factrow`, `dim-kvrow`, `dim-keytime`.
- Create: `e2e/source-link-dimensional.spec.ts` (Playwright `dev-build` project).

- [ ] **Step 1: Build the dev route + the spec.** The spec navigates to `/admin/dev/source-link-dim` (with `ADMIN_DEV_PANEL_ENABLED=true`, baseURL `http://127.0.0.1:3000`), reads `getBoundingClientRect().height` of each `dim-*` row inside **both** containers via `locator(...).evaluate(el => el.getBoundingClientRect().height)`, and asserts `Math.abs(withLink - noLink) <= 0.5` for each of the four row types. Anti-tautology: it measures the rows (present in both), never the link element.
- [ ] **Step 2: Run** `pnpm test:e2e -- e2e/source-link-dimensional.spec.ts` against the `dev-build` project (do NOT run the screenshot-writing config — baseline-overwrite guard). Negative-red: temporarily give the link wrapper a `min-h-[40px]` and a row a flex parent without `shrink-0` to force a height delta, confirm the spec FAILS, revert.
- [ ] **Step 3: Run `/impeccable critique`** on the dev route (UI surface). **Step 4: Commit** `test(e2e): source-link header does not change row heights`

---

## Task 13: Self-review, adversarial review, milestone close-out

- [ ] **Step 1: Full suite green** — `pnpm lint && pnpm test` (and `pnpm test:e2e` for the new spec). Fix anything red.
- [ ] **Step 2: Self-review** the diff against the spec §1–§16 coverage matrix; fix gaps inline.
- [ ] **Step 3: Impeccable close-out** — confirm `/impeccable critique` + `/impeccable audit` passed on every UI surface (Tasks 8, 9); dispositions in the handoff/DEFERRED.md.
- [ ] **Step 4: Cross-model adversarial review** of the whole diff (Codex, via the working `codex exec --output-schema -o` inline path — the companion app-server transport is wedged in this env, see memory); iterate to APPROVE.
- [ ] **Step 5: PR + CI** — push, open PR, drive CI green (validation-schema-parity, postgrest-dml-lockdown, crew suites, e2e). Merge as a merge commit once green.

---

## Self-review checklist (run before execution handoff)

- **Spec coverage:** D1–D11 → Tasks 8/9 (UX), 2 (fallback/gid-0/encoding), 1+4+5 (capture), 6 (persist), 7 (project), 3+10 (coverage), 9 (allowlist via Task 2), 4 (reduction), 11 (corpus), 12 (dimensional). §11 DML → Task 6. §9 allowlist + §8.1↔§9 → Tasks 2/3/10. ✓
- **No placeholders:** every step has concrete code/commands. ✓
- **Type consistency:** `SourceAnchor`/`buildSheetDeepLink`/`REGION_LABELS`/`CARD_REGION_MAP` defined once (Tasks 2–3), consumed by 4/5/7/8/9/10 with identical names. ✓
- **Meta-test inventory:** CREATES `allowlistMeta.test.ts` (§9 + §8.1↔§9) + `sourceLinkCoverage.test.tsx` (field-aware parity); EXTENDS `defaultDriveClientSheetsFieldsMask.test.ts`; advisory-lock topology unchanged (rides existing lock); DML lockdown inherited (`shows` already registered). ✓
- **Mechanism deviation from spec Hop 2/3:** documented above; within the spec's explicit "plan decides the exact mechanism" deferral; contract (region→one anchor or none) preserved. ✓
