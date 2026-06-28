# Gear Parser-Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the equipment that modern shows put in the GEAR tab (and recover dropped EVENT-form + secondary fields) so the crew Gear section is no longer blank, without a DB migration.

**Architecture:** New `lib/parser/blocks/gear.ts` parses the GEAR date-grid into per-room A/V/L/scenic/other values via a closed classification registry (`lib/parser/gearClassification.ts`), merged into the existing `rooms` columns in `parseSheet`. `event.ts` gains an unconditional, financial-safe form-layout harvest. Secondary parser fixes (pull-sheet width, orphan-row lighting, dash sentinel) + GearSection Scenic/Other cards + GEAR-tab source links. All reuse existing `rooms`/`event_details` columns and the existing `ln` projection — no schema change.

**Tech Stack:** TypeScript, Vitest (`npx vitest run <file>`), Next.js (GearSection RSC), the repo's `parseSheet` pipeline.

**Spec:** `docs/superpowers/specs/2026-06-28-gear-parser-fidelity-design.md` (APPROVED, Codex R10). Section refs below (e.g. "spec §3.2") point there.

## Global Constraints

- **TDD per task** (invariant 1): failing test → run-fail → minimal impl → run-pass → commit. Never impl before its test.
- **Commit per task**, conventional commits: `feat(parser):` / `test(parser):` / `feat(crew-page):` / `fix(crew-page):` etc. Never bare `parser:`.
- **No DB migration, no advisory locks, no Supabase/email/admin-alert surfaces** (spec §7). `rooms` columns (`lib/parser/types.ts:164-171`) + `ln` projection (`lib/data/getShowForViewer.ts:468-486`) already exist and are unchanged.
- **No new `ParseWarning` `code:` literal** (spec D7) — would hit the x1 catalog-parity gate. Unmatched GEAR rooms append silently.
- **Closed-vocab classification only** (spec §3.2/D3) — package-bucket + closed allow-lists, never open-ended prose heuristics.
- **Permission boundary** (spec §3.4): the form harvest must never write a financial/internal field into crew-visible `event_details`.
- **UI files** (`GearSection.tsx`, `emptyState.ts`, `buildSheetDeepLink.ts`, `sourceAnchors.ts`) → invariant-8 impeccable dual-gate + crew-preview screenshot regen at close-out (Tasks 12-13).
- **Run from the worktree** `/Users/ericweiss/FX-Webpage-Template/.claude/worktrees/gear-parser-fidelity` (branch `worktree-gear-parser-fidelity`).
- Baseline is green: `npx vitest run tests/parser tests/invariants` = 1225 passing before this plan.

---

## File Structure

- **Create** `lib/parser/gearClassification.ts` — `AUDIO/VIDEO/LIGHTING/SCENIC` allow-lists, `BUCKET_SETTERS`, `SENSITIVE_KEY_TOKENS`, `classifyGearItem()`, `gearBucketFor()`. (Task 1)
- **Create** `lib/parser/blocks/gear.ts` — `hasGearDateGrid()`, `parseGearTab()`, `GearRoom` type. (Task 2)
- **Modify** `lib/parser/index.ts` — `mergeGearIntoRooms()` + wire after `parseRooms` (`:389`). (Task 3)
- **Modify** `lib/parser/blocks/event.ts` — `opening sizzle reel` alias, `harvestFormLayout()`, `fillIfAbsentOrSentinel`, `SENSITIVE_KEY_TOKENS` skip at both sites, ALL-CAPS terminator. (Task 4)
- **Modify** `lib/parser/pull-sheet.ts` — width-tolerant variant detection (`:176`). (Task 5)
- **Modify** `lib/parser/blocks/rooms.ts` — GS orphan-continuation-row classification (`parseGsRoom`/`applyGsLabel` `:508-603`). (Task 6)
- **Modify** `lib/visibility/emptyState.ts` — `-`/`—` in `GENERIC_OPTIONAL_HIDE` (`:52`). (Task 7)
- **Modify** `lib/sheet-links/buildSheetDeepLink.ts` (+ `lib/drive/sourceAnchors.ts`) — `gear_scope` region + date-grid gate + CARD_REGION_MAP. (Task 8)
- **Modify** `components/crew/sections/GearSection.tsx` — Scenic/Other cards + `gear_scope` selection (`DISCIPLINES` `:80`). (Task 9)
- **Create** tests: `tests/parser/gearClassificationRegistry.test.ts`, `tests/parser/gear.test.ts`, `tests/parser/eventDetailsNoFinancials.test.ts`, `tests/parser/gearCorpusAudit.test.ts`; **modify** `tests/parser/event.test.ts` (or `unknownSection.test.ts`), `tests/parser/pull-sheet.test.ts`, `tests/parser/sourceAnchorsCorpus.test.ts`, `tests/components/crew/sections/GearSection.test.tsx`, + a layout assertion.

**Meta-test inventory:** CREATES `gearClassificationRegistry.test.ts` (cross-discipline collision tripwire, spec §3.2) and `eventDetailsNoFinancials.test.ts` (permission-boundary corpus tripwire, spec §6). No auth/DB/admin-alert/advisory-lock metas apply.

---

### Task 1: Classification registry + collision tripwire

**Files:**
- Create: `lib/parser/gearClassification.ts`
- Test: `tests/parser/gearClassificationRegistry.test.ts`, `tests/parser/gearClassification.test.ts`

**Interfaces:**
- Produces:
  - `type GearDiscipline = "audio" | "video" | "lighting" | "scenic" | "other"`
  - `gearBucketFor(text: string): "audio" | "lighting" | null` — bucket-setter detection (`/SOUND SYSTEM/i`→audio; `/STAGE LIGHTING/i|/UPLIGHTING/i`→lighting).
  - `isGroupingOnly(text: string): boolean` — true iff trimmed text ends in `PACKAGE` (bucket-setter not emitted as item).
  - `classifyGearItem(text: string, activeBucket: "audio"|"lighting"|null): GearDiscipline` — allow-list-first, bucket fallback, else `other`.
  - `SENSITIVE_KEY_TOKENS: ReadonlySet<string>` = `{budget, po, purchase, proposal, invoice, cost, price, quote, estimate, internal}`.
  - `isSensitiveCanonicalKey(key: string): boolean` — true iff any `_`-token of `key` ∈ `SENSITIVE_KEY_TOKENS`.

- [ ] **Step 1: Write the failing classification test** — `tests/parser/gearClassification.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { classifyGearItem, gearBucketFor, isGroupingOnly, isSensitiveCanonicalKey } from "@/lib/parser/gearClassification";

describe("classifyGearItem — allow-list first, bucket fallback", () => {
  it("DLP DATA PROJECTOR-BARCO W8 → video even with active audio bucket", () => {
    expect(classifyGearItem("DLP DATA PROJECTOR-BARCO W8", "audio")).toBe("video");
  });
  it("6'X10' PROJECTION SCREEN → video; COUNTDOWN CLOCK → video", () => {
    expect(classifyGearItem("6'X10' WIDESCREEN PROJECTION SCREEN", "audio")).toBe("video");
    expect(classifyGearItem("COUNTDOWN CLOCK", "audio")).toBe("video");
  });
  it("CABLING with no allow-list hit inherits the active audio bucket", () => {
    expect(classifyGearItem("CABLING", "audio")).toBe("audio");
    expect(classifyGearItem("CABLING", null)).toBe("other");
  });
  it("SMALL SOUND SYSTEM → audio; AUDIO MIXER - QU16 → audio; (2) KLA SPEAKERS → audio", () => {
    expect(classifyGearItem("SMALL SOUND SYSTEM", null)).toBe("audio");
    expect(classifyGearItem("AUDIO MIXER - QU16", null)).toBe("audio");
    expect(classifyGearItem("(2) KLA SPEAKERS W/ STANDS", null)).toBe("audio");
  });
  it("(2) LED LEKOS → lighting; (12) ROCKVILLE LED UPLIGHTS → lighting; (4) BLIZZARD LED BARS → lighting", () => {
    expect(classifyGearItem("(2) LED LEKOS", null)).toBe("lighting");
    expect(classifyGearItem("(12) ROCKVILLE LED UPLIGHTS", null)).toBe("lighting");
    expect(classifyGearItem("(4) BLIZZARD LED BARS", null)).toBe("lighting");
  });
  it("STRETCHED SPANDEX / PRINTED LOGO → scenic; TRUSS PODIUM → scenic", () => {
    expect(classifyGearItem("(1) PRINTED LOGO SPANDEX SECTION", null)).toBe("scenic");
    expect(classifyGearItem("TRUSS PODIUM", null)).toBe("scenic");
  });
  it("ZOOM LAPTOP PACKAGE backup → video (LAPTOP); unmatched truss bits → other", () => {
    expect(classifyGearItem("MOUNTING HARDWARE", null)).toBe("other");
  });
});

describe("gearBucketFor / isGroupingOnly", () => {
  it("SOUND SYSTEM PACKAGE and SMALL SOUND SYSTEM both set the audio bucket", () => {
    expect(gearBucketFor("SOUND SYSTEM PACKAGE")).toBe("audio");
    expect(gearBucketFor("SMALL SOUND SYSTEM")).toBe("audio");
  });
  it("STAGE LIGHTING PACKAGE and LED UPLIGHTING PACKAGE set the lighting bucket", () => {
    expect(gearBucketFor("STAGE LIGHTING PACKAGE")).toBe("lighting");
    expect(gearBucketFor("LED UPLIGHTING PACKAGE")).toBe("lighting");
  });
  it("only PACKAGE-suffixed rows are grouping-only (not emitted)", () => {
    expect(isGroupingOnly("SOUND SYSTEM PACKAGE")).toBe(true);
    expect(isGroupingOnly("SMALL SOUND SYSTEM")).toBe(false);
  });
});

describe("isSensitiveCanonicalKey (permission boundary)", () => {
  it.each(["budget", "po", "po_number", "purchase_order", "invoice", "invoice_notes", "proposal", "cost", "price", "quote", "estimate", "internal", "internal_notes"])(
    "%s is sensitive", (k) => expect(isSensitiveCanonicalKey(k)).toBe(true));
  it.each(["keynote_requirements", "opening_reel", "power", "internet", "additional_notes", "backdrop", "podium_type"])(
    "%s is NOT sensitive", (k) => expect(isSensitiveCanonicalKey(k)).toBe(false));
});
```

- [ ] **Step 2: Run → fail** — `npx vitest run tests/parser/gearClassification.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `lib/parser/gearClassification.ts`**

Closed allow-lists per spec §3.2 (case-insensitive substring match on the uppercased item text). Key points: `classifyGearItem` checks AUDIO/VIDEO/LIGHTING/SCENIC allow-lists in order (a single item matching multiple is impossible by the collision tripwire), returns the matched discipline; else the `activeBucket`; else `"other"`. `gearBucketFor` uses `/SOUND SYSTEM/i`→audio, `/STAGE LIGHTING/i`/`/UPLIGHTING/i`→lighting. `isSensitiveCanonicalKey` splits the key on `_` and intersects `SENSITIVE_KEY_TOKENS`.

```ts
export type GearDiscipline = "audio" | "video" | "lighting" | "scenic" | "other";
const AUDIO = ["SPEAKER","CONSOLE","MIXER","SOUND SYSTEM","MICROPHONE","MIC","SNAKE","ANTENNA","QU32","QU24","QU16","AB168","KLA","K8","K10","GOOSNECK","GOOSENECK","AUDIO"];
const VIDEO = ["PROJECTOR","SCREEN","MONITOR","SWITCHER","LAPTOP","CAMERA","EIKI","BARCO","POINTER","MATRIX","COUNTDOWN CLOCK","CONFIDENCE MONITOR","DLP"];
const LIGHTING = ["LEKO","UPLIGHT","LED BAR","DMX","LIGHTRONICS","LIGHTING","BLIZZARD","ROCKVILLE"];
const SCENIC = ["SPANDEX","LOGO","BRANDING","BACKDROP","SCENIC","TRUSS PODIUM","PODIUM"];
const ALLOW: ReadonlyArray<[Exclude<GearDiscipline,"other">, readonly string[]]> = [["audio",AUDIO],["video",VIDEO],["lighting",LIGHTING],["scenic",SCENIC]];

export function gearBucketFor(text: string): "audio" | "lighting" | null {
  if (/SOUND SYSTEM/i.test(text)) return "audio";
  if (/STAGE LIGHTING/i.test(text) || /UPLIGHTING/i.test(text)) return "lighting";
  return null;
}
export function isGroupingOnly(text: string): boolean { return /PACKAGE\s*$/i.test(text.trim()); }
export function classifyGearItem(text: string, activeBucket: "audio"|"lighting"|null): GearDiscipline {
  const u = text.toUpperCase();
  for (const [disc, kws] of ALLOW) if (kws.some((k) => u.includes(k))) return disc;
  return activeBucket ?? "other";
}
export const SENSITIVE_KEY_TOKENS: ReadonlySet<string> = new Set(["budget","po","purchase","proposal","invoice","cost","price","quote","estimate","internal"]);
export function isSensitiveCanonicalKey(key: string): boolean {
  return key.toLowerCase().split("_").some((t) => SENSITIVE_KEY_TOKENS.has(t));
}
// Exposed for the collision tripwire:
export const __ALLOW_LISTS__ = { audio: AUDIO, video: VIDEO, lighting: LIGHTING, scenic: SCENIC } as const;
```

> NOTE on `LIGHTING` vs `LED`: there is no bare `LED` keyword (it would mis-hit). `LED LEKOS`/`LED UPLIGHTS`/`LED BARS` match `LEKO`/`UPLIGHT`/`LED BAR`. Order of `ALLOW` is audio→video→lighting→scenic; the collision tripwire guarantees no item matches two disciplines, so order is immaterial for correctness (it only fixes determinism).

- [ ] **Step 4: Run → pass** — `npx vitest run tests/parser/gearClassification.test.ts` → PASS.

- [ ] **Step 5: Write the collision tripwire** — `tests/parser/gearClassificationRegistry.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { __ALLOW_LISTS__, gearBucketFor } from "@/lib/parser/gearClassification";

describe("gear classification registry — cross-discipline collision guard (spec §3.2)", () => {
  it("no keyword appears in more than one discipline allow-list", () => {
    const seen = new Map<string, string>();
    for (const [disc, kws] of Object.entries(__ALLOW_LISTS__))
      for (const k of kws) {
        const prev = seen.get(k);
        expect(prev, `'${k}' in both ${prev} and ${disc}`).toBeUndefined();
        seen.set(k, disc);
      }
  });
  it("discipline-consistency: a bucket-setter keyword that is also an allow-list keyword is the SAME discipline", () => {
    // SOUND SYSTEM is intentionally both the audio bucket-setter AND an audio allow-list keyword.
    expect(gearBucketFor("SOUND SYSTEM")).toBe("audio");
    expect(__ALLOW_LISTS__.audio).toContain("SOUND SYSTEM");
    // and it must NOT be in any other discipline's list:
    for (const d of ["video","lighting","scenic"] as const)
      expect(__ALLOW_LISTS__[d]).not.toContain("SOUND SYSTEM");
  });
});
```

- [ ] **Step 6: Run → pass** — `npx vitest run tests/parser/gearClassificationRegistry.test.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/parser/gearClassification.ts tests/parser/gearClassification.test.ts tests/parser/gearClassificationRegistry.test.ts
git commit -m "feat(parser): closed-vocab gear classification registry + collision tripwire"
```

---

### Task 2: `hasGearDateGrid` + `parseGearTab`

**Files:**
- Create: `lib/parser/blocks/gear.ts`
- Test: `tests/parser/gear.test.ts`

**Interfaces:**
- Consumes: `classifyGearItem`, `gearBucketFor`, `isGroupingOnly` (Task 1).
- Produces:
  - `type GearRoom = { kind: RoomKind; name: string; audio: string | null; video: string | null; lighting: string | null; scenic: string | null; other: string | null }` where `RoomKind = "gs" | "breakout" | "additional"` (import from `lib/parser/types.ts:154` — NOT a new `"general"` literal). A `GENERAL SESSION …` header maps to `kind: "gs"` (matching `parseGsRoom`'s `buildEmptyRoom("gs", …)`), `BREAKOUT …`→`"breakout"`, everything else (FOYER/LUNCH/ADDITIONAL)→`"additional"`.
  - `hasGearDateGrid(markdown: string): boolean` — the SOLE date-grid signature predicate (spec §3.1).
  - `parseGearTab(markdown: string): GearRoom[]`

**Detection / segmentation (spec §3.1):** `hasGearDateGrid` = a row whose cells are all/majority `Rental Dates`, followed (skipping `:---:`/blank rows) by an `| Item | Item | <date> … |` header (≥1 `\d{1,2}-[A-Z][a-z]{2}` token). Within the grid (between the Item header and `BACK TO INFO`): a **2-cell** non-`:---:` row is a room sub-header (kind from the leading word: `GENERAL`→`"gs"`, `BREAKOUT`→`"breakout"`, else `"additional"`; name = prefix-stripped via `/^(GENERAL SESSION|BREAKOUT( SESSION)?\s*\d*|LUNCH( ROOM| SESSION)?|ADDITIONAL( ROOM)?)\s*-?\s*/i` + strip trailing `Dimensions|Floor`); a full-width row is a package/equipment row. For each equipment row: col0 = item (skip if col1==col0 duplicate handled by taking col0; skip `isGroupingOnly`/bucket-setter-PACKAGE rows as items but apply `gearBucketFor` to update `activeBucket`); classify via `classifyGearItem(item, activeBucket)`; **qty + no-duplication (R3-M1):** parse a leading `(N)` from the item text to get `qty`, then **strip that leading `(N)` from the display text** before re-prepending — `displayItem = item.replace(/^\s*\(\d+\)\s*/, "")`; `qty = leadingN ?? maxNumericDateCell`; emit `qty != null ? \`(${qty}) ${displayItem}\` : displayItem`. So `(2) KLA SPEAKERS` → `(2) KLA SPEAKERS` (NOT `(2) (2) KLA SPEAKERS`), and `WIRELESS TABLETOP MICROPHONE` with date-col `17` → `(17) WIRELESS TABLETOP MICROPHONE`. Append to that discipline's running string for the active room.

- [ ] **Step 1: Write failing tests** — `tests/parser/gear.test.ts` (read fixtures, assert real output; derive expectations from the fixture, anti-tautology):

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { hasGearDateGrid, parseGearTab } from "@/lib/parser/blocks/gear";

const md = (f: string) => readFileSync(`fixtures/shows/${f}`, "utf8");
const room = (rs: ReturnType<typeof parseGearTab>, re: RegExp) => rs.find((r) => re.test(r.name));

describe("hasGearDateGrid (shared signature, spec §3.1)", () => {
  it("true for exporter rpas/fixed-income/consultants; false for ria (INFO-inline, no grid)", () => {
    expect(hasGearDateGrid(md("exporter-xlsx/rpas.md"))).toBe(true);
    expect(hasGearDateGrid(md("exporter-xlsx/fixed-income.md"))).toBe(true);
    expect(hasGearDateGrid(md("exporter-xlsx/consultants.md"))).toBe(true);
    expect(hasGearDateGrid(md("exporter-xlsx/ria.md"))).toBe(false);
  });
  it("false for a Rental Dates row with NO Item/date header (R5-M2 negative)", () => {
    expect(hasGearDateGrid("| Rental Dates | Rental Dates |\n| foo | bar |")).toBe(false);
  });
});

describe("parseGearTab — rpas (prod path)", () => {
  const rooms = parseGearTab(md("exporter-xlsx/rpas.md"));
  it("GS room: audio has QU32, video has BARCO, lighting has LEKO/BLIZZARD, scenic has SPANDEX", () => {
    const gs = room(rooms, /GRAND BALLROOM/i)!;
    expect(gs.audio).toMatch(/QU32/); expect(gs.video).toMatch(/BARCO|EIKI/);
    expect(gs.lighting).toMatch(/LEKO|BLIZZARD/); expect(gs.scenic).toMatch(/SPANDEX/);
  });
  it("tabletop mic qty extracted from the date column → (17)", () => {
    expect(room(rooms, /GRAND BALLROOM/i)!.audio).toMatch(/\(17\)[^|]*TABLETOP/i);
  });
  it("no duplicated leading quantity (R3-M1): (2) KLA SPEAKERS not (2) (2) KLA SPEAKERS", () => {
    const gs = room(rooms, /GRAND BALLROOM/i)!;
    for (const v of [gs.audio, gs.video, gs.lighting, gs.scenic, gs.other])
      expect(v ?? "").not.toMatch(/(\(\d+\)\s*){2}/); // no two consecutive (N) prefixes
    expect(gs.audio).toMatch(/\(2\)\s*KLA/i); // single qty prefix preserved
  });
  it("breakout rooms get projector/screen/laptop into video", () => {
    const bo = room(rooms, /STATE A/i)!;
    expect(bo.video).toMatch(/EIKI|PROJECTOR/); expect(bo.audio).toBeNull();
  });
  it("preserves unmatched gear in 'other' (R2-M3): MOUNTING HARDWARE (top-level, no bucket) → other", () => {
    const gs = room(rooms, /GRAND BALLROOM/i)!;
    expect(gs.other ?? "").toMatch(/MOUNTING HARDWARE/i);
  });
});

describe("parseGearTab — consultants variants (R1/R2/R8)", () => {
  const rooms = parseGearTab(md("exporter-xlsx/consultants.md"));
  it("tolerates the :---: row between Rental Dates and Item (consultants:139-141)", () => {
    expect(rooms.length).toBeGreaterThan(0);
  });
  it("classification precedence: BARCO/screen/countdown → video despite SOUND SYSTEM PACKAGE region", () => {
    const gs = room(rooms, /GRAND BALLROOM A\/B/i)!;
    expect(gs.video).toMatch(/BARCO/); expect(gs.video).toMatch(/COUNTDOWN|SCREEN/);
    expect(gs.audio ?? "").not.toMatch(/BARCO|COUNTDOWN/);
  });
  it("lunch-room: SMALL SOUND SYSTEM + KLA + CABLING + AUDIO MIXER QU16 all in audio", () => {
    const lunch = room(rooms, /BALLROOM C/i)!;
    expect(lunch.audio).toMatch(/SMALL SOUND SYSTEM/i);
    expect(lunch.audio).toMatch(/CABLING/i);
    expect(lunch.audio).toMatch(/QU16/i);
    expect(lunch.other ?? "").not.toMatch(/SOUND SYSTEM|CABLING/i);
  });
  it("bare FOYER opens a room; unnumbered BREAKOUT SESSION rooms parse", () => {
    expect(room(rooms, /^FOYER/i)).toBeDefined();
    expect(rooms.filter((r) => r.kind === "breakout").length).toBeGreaterThanOrEqual(4);
  });
});

describe("parseGearTab — raw family is out of scope (anti-corruption, R1-M2)", () => {
  it("mangled raw GEAR grid populates NONE of the five gear columns", () => {
    const rooms = parseGearTab(md("raw/2026-03-rpas-central-four-seasons.md"));
    // raw uses NO_HEADER + stripped names → no usable scope in ANY column
    expect(rooms.every((r) => !r.audio && !r.video && !r.lighting && !r.scenic && !r.other)).toBe(true);
  });
});

describe("parseGearTab — general-session kind (R1-M3)", () => {
  it("the GS gear room carries kind 'gs', not 'general'", () => {
    const gs = room(parseGearTab(md("exporter-xlsx/rpas.md")), /GRAND BALLROOM/i)!;
    expect(gs.kind).toBe("gs");
  });
});
```

- [ ] **Step 2: Run → fail** — `npx vitest run tests/parser/gear.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement `lib/parser/blocks/gear.ts`** per spec §3.1 (use the repo's existing row-split helper pattern — mirror `pull-sheet.ts` `splitRow`/`isSeparatorRow`; cells via the same `CELL_SPLIT_RE`). Build per-room discipline strings; trim; `null` when empty.
- [ ] **Step 4: Run → pass** — `npx vitest run tests/parser/gear.test.ts` → PASS. Iterate impl until green (do NOT weaken assertions).
- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/gear.ts tests/parser/gear.test.ts
git commit -m "feat(parser): parse GEAR date-grid into per-room A/V/L/scenic/other (exporter shape)"
```

---

### Task 3: `mergeGearIntoRooms` + wire into `parseSheet`

**Files:**
- Modify: `lib/parser/index.ts` (after `const rooms = parseRooms(...)` `:389`)
- Test: `tests/parser/gear.test.ts` (extend)

**Interfaces:**
- Consumes: `parseGearTab`, `GearRoom` (Task 2); `RoomRow` (`lib/parser/types.ts:155`).
- Produces: `mergeGearIntoRooms(parsed: RoomRow[], gear: GearRoom[]): RoomRow[]` — **exported** from `lib/parser/index.ts` (the R1-HIGH differentiating unit test imports it directly).

**Rules (spec §3.1/§3.3/§5):** match each GearRoom to a parsed room by **normalized name token** (strip room-type prefix + Dimensions/Floor, uppercase) — NOT breakout index. On match: for each of audio/video/lighting/scenic/other, set the room column **only if currently null** (fill-don't-clobber). On no exact match: append a new RoomRow with ONLY the gear columns set, all time/setup/dimensions/floor `null` (inert in schedule — `deriveScheduleBookends` keys Strike on `strike_time`). No warning code.

- [ ] **Step 1: Failing tests** (extend `tests/parser/gear.test.ts`):

```ts
import { parseSheet } from "@/lib/parser/index";
describe("mergeGearIntoRooms via parseSheet — rpas end-to-end", () => {
  const p = parseSheet(md("exporter-xlsx/rpas.md"), "rpas.md");
  it("GS room scope is populated from GEAR (was 0/0/0 before)", () => {
    const gs = p.show.rooms.find((r) => /GRAND BALLROOM/i.test(r.name))!;
    expect(gs.audio).toMatch(/QU32/); expect(gs.lighting).toMatch(/LEKO|BLIZZARD/);
  });
  it("room count does not double (GEAR rooms matched onto INFO rooms by name token)", () => {
    const names = p.show.rooms.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it("'other' column survives the merge into show.rooms (R2-M3 end-to-end preservation)", () => {
    const gs = p.show.rooms.find((r) => /GRAND BALLROOM/i.test(r.name))!;
    expect(gs.other ?? "").toMatch(/MOUNTING HARDWARE/i);
  });
});
// R1-HIGH: differentiating unit test — index-matching would attach LASALLE gear to
// DELAWARE. The real consultants LASALLE/DELAWARE GEAR blocks are IDENTICAL, so a
// fixture-only assertion is tautological; use DISTINCT per-room gear with swapped
// index-vs-name ordering. Requires `mergeGearIntoRooms` exported from lib/parser/index.ts.
import { mergeGearIntoRooms } from "@/lib/parser/index";
import type { RoomRow } from "@/lib/parser/types";
const emptyRoom = (kind: RoomRow["kind"], name: string): RoomRow => ({
  kind, name, dimensions: null, floor: null, setup: null, set_time: null, show_time: null,
  strike_time: null, audio: null, video: null, lighting: null, scenic: null, power: null,
  digital_signage: null, other: null, notes: null,
});

describe("mergeGearIntoRooms — name-token match, NOT breakout index (R1-HIGH)", () => {
  it("LASALLE gear lands on LASALLE even when INFO/GEAR breakout indices are swapped", () => {
    const info = [emptyRoom("breakout", "DELAWARE"), emptyRoom("breakout", "LASALLE")]; // INFO 1=DELAWARE, 2=LASALLE
    const gear = [
      { kind: "breakout" as const, name: "LASALLE", audio: null, video: "LASALLE-ONLY-PROJECTOR", lighting: null, scenic: null, other: null },   // GEAR 1=LASALLE
      { kind: "breakout" as const, name: "DELAWARE", audio: null, video: "DELAWARE-ONLY-SCREEN", lighting: null, scenic: null, other: null },       // GEAR 2=DELAWARE
    ];
    const merged = mergeGearIntoRooms(info, gear);
    expect(merged.find((r) => /LASALLE/i.test(r.name))!.video).toBe("LASALLE-ONLY-PROJECTOR");
    expect(merged.find((r) => /DELAWARE/i.test(r.name))!.video).toBe("DELAWARE-ONLY-SCREEN");
    // index-matching would have swapped these → both asserts catch the corruption.
  });
  it("fill-don't-clobber: a non-null INFO column is preserved over GEAR", () => {
    const info = [{ ...emptyRoom("gs", "GRAND BALLROOM"), audio: "INFO-AUDIO" }];
    const gear = [{ kind: "gs" as const, name: "GRAND BALLROOM", audio: "GEAR-AUDIO", video: "GEAR-VIDEO", lighting: null, scenic: null, other: null }];
    const merged = mergeGearIntoRooms(info, gear);
    expect(merged[0]!.audio).toBe("INFO-AUDIO"); // not clobbered
    expect(merged[0]!.video).toBe("GEAR-VIDEO"); // filled (was null)
  });
  it("appended FOYER room (no INFO peer) has gear but null times → no schedule bookend", () => {
    const merged = mergeGearIntoRooms([], [{ kind: "additional" as const, name: "FOYER", audio: null, video: null, lighting: null, scenic: null, other: "(2) Stanchions" }]);
    const foyer = merged.find((r) => /^FOYER/i.test(r.name))!;
    expect(foyer.other).toMatch(/Stanchions/);
    expect(foyer.strike_time).toBeNull();
    expect(foyer.set_time).toBeNull();
  });
});
```

- [ ] **Step 2: Run → fail.** **Step 3: Implement** `mergeGearIntoRooms` + wire it: `const gearRooms = parseGearTab(markdown); const rooms = mergeGearIntoRooms(parseRooms(markdown, version, agg), gearRooms);`. **Step 4: Run → pass.**
- [ ] **Step 5: Commit** — `feat(parser): merge GEAR-tab scope onto rooms by name token (fill-don't-clobber)`

---

### Task 4: EVENT form-layout harvest (financial-safe) + corpus tripwire

**Files:**
- Modify: `lib/parser/blocks/event.ts`
- Test: `tests/parser/event.test.ts` (create or extend), `tests/parser/eventDetailsNoFinancials.test.ts` (create)

**Interfaces:**
- Consumes: `isSensitiveCanonicalKey`, `SENSITIVE_KEY_TOKENS` (Task 1); `CANONICAL_KEY_MAP`, `toCanonicalKey`, `EVENT_LABEL_VOCAB`, `shouldHideGenericOptional` (existing in `event.ts`).
- Behavior (spec §3.4): (a) add `"opening sizzle reel": "opening_reel"` to `CANONICAL_KEY_MAP` (`:64`); (b) after the classic pass, **unconditionally** run `harvestFormLayout`: find a contiguous 2-cell `| label | value |` run with ≥3 known-vocab labels, harvest the WHOLE run (known→`CANONICAL_KEY_MAP`, unknown→`toCanonicalKey`); (c) SKIP any field whose canonical key `isSensitiveCanonicalKey`; (d) write via **`fillIfAbsentOrSentinel`** (write only when current `event_details[key]` is absent or `shouldHideGenericOptional` — never overwrite a real value); (e) tighten the room terminators (`:165`) to fire only on ALL-CAPS room headers, not title-case `General Session Room Name`.

- [ ] **Step 1: Failing tests** — `tests/parser/event.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseSheet } from "@/lib/parser/index";
const md = (f:string)=>readFileSync(`fixtures/shows/${f}`,"utf8");

describe("EVENT form-layout harvest (spec §3.4)", () => {
  it("consultants form-layout recovers keynote/reel + unknown fields, ≥10 keys", () => {
    const ed = parseSheet(md("raw/2025-10-consultants-roundtable.md"),"c.md").show.event_details;
    expect(Object.keys(ed).length).toBeGreaterThanOrEqual(10);
    expect(ed["keynote_requirements"]).toBe("TBD");
    expect(ed["opening_reel"]).toMatch(/Available if needed/i);
    for (const k of ["power_requirements","internet_requirements","backdrop","additional_notes"])
      expect(Object.keys(ed)).toContain(k); // toCanonicalKey may vary; assert presence of the snake form
  });
  it("permission boundary: NO financial keys leak (Budget/PO#/Invoice Notes)", () => {
    const ed = parseSheet(md("raw/2025-10-consultants-roundtable.md"),"c.md").show.event_details;
    for (const k of Object.keys(ed)) expect(k).not.toMatch(/budget|^po$|^po_|purchase|invoice|proposal|cost|price|quote|estimate|internal/);
    expect(Object.keys(ed)).toContain("additional_notes"); // proves skip-not-stop (after PO#)
  });
  it("fixed-income mixed sheet: form real 'No' upgrades classic sentinel TBD", () => {
    const ed = parseSheet(md("exporter-xlsx/fixed-income.md"),"fi.md").show.event_details;
    expect(ed["opening_reel"]).toBe("No");
  });
  // R3-M2: FULL deep-equality (key set AND values), not just counts. Baselines captured
  // from the pre-change parser (current main) — a renamed/dropped/clobbered key fails.
  const EAST_ED = {"led":"NO","scenic":"(1) Section Printed Spandex (4) Sections Grey Spandex","stage":"8' x 24' x 2'","opening_reel":"YES - LOOP VIDEO","keynote_requirements":"NONE","truss_podium":"YES","record":"NO","live_streaming":"NO","polling":"YES","internet":"The conference wifi has 20mb download speed.","power":"Only 2 circuits in Mabel Room - this setup needs additional power","storage":"Back of house near kitchen area","test_pattern":"16 x 9 Test Pattern"};
  const RPAS_ED = {"diagrams":"LINK","led":"N/A","scenic":"(1) II Blue Logo Spandex (2) Sections Grey Spandex","stage_size":"8' x 24' x 2'","opening_reel":"MAYBE","keynote_requirements":"TBD","virtual_speaker":"N/A","virtual_audience":"N/A","podium_type":"Truss Podium","record":"N/A","polling":"YES","internet":"Wifi from Encore","power":"(2) Power Drops from Engineering","equipment_storage":"Behind Spandex Set","staff_office_room":"TBD","fonts":"Aptos Font Folder","test_pattern":"16 x 9 Test Pattern"};
  it("negative-regression: east-coast event_details is BYTE-IDENTICAL after the unconditional harvest", () => {
    expect(parseSheet(md("raw/2024-05-east-coast-family-office.md"),"e.md").show.event_details).toEqual(EAST_ED);
  });
  it("negative-regression: rpas event_details is BYTE-IDENTICAL after the unconditional harvest", () => {
    expect(parseSheet(md("raw/2026-03-rpas-central-four-seasons.md"),"r.md").show.event_details).toEqual(RPAS_ED);
  });
});

// synthetic real-vs-real conflict (R8-M2). NON-TAUTOLOGICAL (plan-R2-H2): the form
// block carries THREE exact known-vocab labels (Keynote Requirements / Virtual Speaker
// / Stage Size — all in CANONICAL_KEY_MAP) so the ≥3-known anchor is guaranteed to
// fire, AND we assert a form-ONLY field was harvested (proving the run ran) BEFORE
// asserting opening_reel stayed YES. If fillIfAbsentOrSentinel is broken, the form's
// "Opening Sizzle Reel | No" (→opening_reel) would clobber YES → caught.
describe("real-vs-real merge (first-real-wins, harvest-proven)", () => {
  it("classic real Opening Reel=YES survives a HARVESTED form block with Opening Sizzle Reel=No", () => {
    const synthetic = [
      "| EVENT DETAILS | EVENT DETAILS |", "| :---: | :---: |",
      "| Opening Reel | YES |", "",                       // classic block: opening_reel=YES (real)
      "| Keynote Requirements | KEYNOTE-FROM-FORM |",      // 3 known-vocab labels → anchor fires
      "| Virtual Speaker | yes |",
      "| Stage Size | 20x30 |",
      "| Opening Sizzle Reel | No |",                      // → opening_reel; must NOT clobber YES
    ].join("\n");
    const ed = parseSheet(synthetic, "s.md").show.event_details;
    expect(ed["keynote_requirements"]).toBe("KEYNOTE-FROM-FORM"); // PROVES the form harvest ran (form-only field)
    expect(ed["stage_size"]).toBe("20x30");                       // (form-only)
    expect(ed["opening_reel"]).toBe("YES");                        // first-real-wins: classic real preserved
  });
});
```

> The `additional_notes`/`power_requirements` exact keys depend on `toCanonicalKey`; during impl, confirm the produced keys and adjust the assertion to the actual snake_case `toCanonicalKey` emits (still asserting the field is present, not absent). This is the only place to reconcile key spelling — do it once and pin it.

- [ ] **Step 2: Run → fail.** **Step 3: Implement** per spec §3.4. **Step 4: Run → pass** (incl. the negative-regression — if east-coast/rpas key counts changed, the harvest is over-reaching; fix, don't edit the assertion).

- [ ] **Step 5: Corpus tripwire** — `tests/parser/eventDetailsNoFinancials.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { parseSheet } from "@/lib/parser/index";
import { isSensitiveCanonicalKey } from "@/lib/parser/gearClassification";

const files = ["raw","exporter-xlsx"].flatMap((d) =>
  readdirSync(`fixtures/shows/${d}`).filter((f)=>f.endsWith(".md") && !/readme/i.test(f)).map((f)=>`${d}/${f}`));

describe("crew-visible event_details never carries a financial/internal key (spec §6)", () => {
  it.each(files)("%s", (rel) => {
    const ed = parseSheet(readFileSync(`fixtures/shows/${rel}`,"utf8"), rel).show.event_details ?? {};
    const leaked = Object.keys(ed).filter(isSensitiveCanonicalKey);
    expect(leaked, `leaked: ${leaked.join(",")}`).toEqual([]);
  });
  it("synthetic injection: each forbidden label is dropped from a harvested form run", () => {
    const synthetic = [
      "| EVENT DETAILS | EVENT DETAILS |","| :---: | :---: |",
      "| Keynote Requirements | TBD |","| Power Requirements | wifi |","| Internet Requirements | y |",
      "| Budget | 50000 |","| PO# | 12345 |","| Proposal | x |","| Invoice | y |","| Invoice Notes | z |","| Internal | q |","| Additional Notes | hi |",
    ].join("\n");
    const ed = parseSheet(synthetic,"s.md").show.event_details;
    expect(Object.keys(ed).filter(isSensitiveCanonicalKey)).toEqual([]);
    expect(ed["additional_notes"]).toBe("hi"); // recovered despite following financials
  });
});
```

- [ ] **Step 6: Run → pass.** **Step 7: Commit** — `feat(parser): EVENT form-layout harvest (financial-safe, first-real-wins) + opening sizzle reel alias`

---

### Task 5: Pull-sheet width tolerance

**Files:** Modify `lib/parser/pull-sheet.ts` (`:176` + `parseDataRows`); Test `tests/parser/pull-sheet.test.ts`.

- [ ] **Step 1: Failing test** (name the exporter fixture explicitly, R7-M2):

```ts
it("exporter east-coast 16-cell rows yield structured items, no ambiguous warning", () => {
  const r = parsePullSheet(readFileSync("fixtures/shows/exporter-xlsx/east-coast.md","utf8"));
  expect(r.warnings.find((w)=>w.code==="PULL_SHEET_AMBIGUOUS_FORMAT")).toBeUndefined();
  const items = r.pullSheet![0]!.items;
  const foh = items.find((i)=>/FOH Rack/i.test(i.item))!;
  expect(foh.qty).toBe(1); expect(foh.cat).toBe("FOH");
  expect(items.some((i)=>i.item.trim()==="")).toBe(false); // no empty-item summary rows
});
```

- [ ] **Step 2: Run → fail.** **Step 3: Implement:** change the `cells.length !== 5` ambiguity guard (`:176`) to require `cells.length < 5`; in the structured path, read Variant-A/B fields from the leading columns (existing `extractFields` reads cells[0..4]); **skip rows whose extracted item is empty** (the `…|1728|` summary rows). Keep the exact-5 canonical path. **Step 4: Run → pass** (+ existing pull-sheet tests still green: `npx vitest run tests/parser/pull-sheet.test.ts`). **Step 5: Commit** — `fix(parser): accept wide (>=5-col) pull-sheet rows incl. 16-cell exporter shape`

---

### Task 6: GS orphan-continuation-row classification

**Files:** Modify `lib/parser/blocks/rooms.ts` (`parseGsRoom`/`applyGsLabel` `:508-603`); Test `tests/parser/` (new or extend a rooms test).

- [ ] **Step 1: Failing test:**

```ts
it("east-coast GS lighting captured from the unlabeled continuation row; not in scenic", () => {
  const p = parseSheet(readFileSync("fixtures/shows/raw/2024-05-east-coast-family-office.md","utf8"),"e.md");
  const gs = p.show.rooms.find((r)=>r.kind==="gs"||/general session|mabel 1/i.test(r.name))!;
  expect(gs.lighting ?? "").toMatch(/Lekos|Blizzard/i);
  expect(gs.scenic ?? "").not.toMatch(/Lekos|Blizzard/i);
});
```

- [ ] **Step 2: Run → fail.** **Step 3: Implement:** in the GS field loop, detect an unlabeled continuation row (empty col0, non-empty value) and route its value through `classifyGearItem(value, null)` (import from Task 1) → write to the matched discipline column (Lekos/Blizzard→lighting); on no allow-list match, append to the immediately-preceding labeled field. Keep within the GS block. **Step 4: Run → pass** (+ existing rooms tests green). **Step 5: Commit** — `fix(parser): capture unlabeled GS continuation row via gear classification (east-coast lighting)`

---

### Task 7: Dash sentinel

**Files:** Modify `lib/visibility/emptyState.ts:52`; Test `tests/` (existing emptyState test or new).

- [ ] **Step 1: Failing test:** `expect(shouldHideGenericOptional("-")).toBe(true); expect(shouldHideGenericOptional("—")).toBe(true);`
- [ ] **Step 2: Run → fail.** **Step 3:** add `"-"`, `"—"` to `GENERIC_OPTIONAL_HIDE`. **Step 4: Run → pass** (+ existing emptyState/opening-reel tests green — `OPENING_REEL_HIDE` untouched). **Step 5: Commit** — `fix(crew-page): hide '-'/'—' dash placeholders in generic-optional fields`

---

### Task 8: `gear_scope` source region (date-grid-gated)

**Files:** Modify `lib/sheet-links/buildSheetDeepLink.ts` (REGION_IDS, REGION_ANCHOR_SPEC, CARD_REGION_MAP), `lib/drive/sourceAnchors.ts` (gate); Test `tests/parser/sourceAnchorsCorpus.test.ts`, **`tests/components/crew/sourceLinkCoverage.test.tsx`** (mandatory adaptation — see Step 3b, R2-H1).

- [ ] **Step 1: Failing test** (extend corpus test): a synthetic workbook with a GEAR tab containing the date-grid signature → `anchors.gear_scope.title === "GEAR"`; a GEAR tab with `Rental Dates` but no `Item/date` header → `anchors.gear_scope` undefined; no GEAR tab → undefined.
- [ ] **Step 2: Run → fail.** **Step 3: Implement:** add `gear_scope` to `REGION_IDS` + `REGION_ANCHOR_SPEC` (`{ tabs: ["GEAR"], strategy: "whole-tab" }`); add `gear-scope-scenic`/`gear-scope-other` → `rooms` in `CARD_REGION_MAP`. In `sourceAnchors.ts`, after choosing the GEAR tab for `gear_scope`, emit the anchor only if `hasGearDateGrid` (Task 2) is true for that tab's grid (convert the chosen sheet's rows to the markdown/row form `hasGearDateGrid` expects, or add a grid-level variant — share the predicate). **Step 4: Run → pass** (+ existing sourceAnchors tests green).

- [ ] **Step 3b (MANDATORY — R2-H1): adapt `tests/components/crew/sourceLinkCoverage.test.tsx`** so adding `gear_scope` to `REGION_IDS` does not break the existing meta-test:
  - Rule (c) ("every `REGION_ID` referenced by ≥1 `CARD_REGION_MAP` entry, warning-anchor-only exempt", `:219-221`): add `gear_scope` to a new `DYNAMICALLY_CONSUMED = new Set(["gear_scope"])` exemption alongside `WARNING_ANCHOR_ONLY` — `gear_scope` is consumed by GearSection's runtime `scopeRegion` selection, not a static `CARD_REGION_MAP` value.
  - Rule (a) (per-card href = `buildSheetDeepLink(driveFileId, sourceAnchors[CARD_REGION_MAP[id]])`): special-case `gear-scope-*` card ids so the EXPECTED href uses `gear_scope` when the fixture's `sourceAnchors` has a `gear_scope` entry, else `rooms` — mirroring GearSection's selection. Ensure the fully-populated `makeShowForViewer` fixture includes a `gear_scope` anchor so the GEAR-path branch is actually exercised (and a second assertion/fixture without it for the INFO-path branch).
  Run `npx vitest run tests/components/crew/sourceLinkCoverage.test.tsx` → PASS. **(This step lands in the same commit as Step 3 or its own; do not defer — it's a full-suite breaker otherwise.)**

- [ ] **Step 5: Commit** — `feat(crew-page): gear_scope source region gated on the GEAR date-grid signature`

---

### Task 9: GearSection Scenic/Other cards + gear_scope selection

**Files:** Modify `components/crew/sections/GearSection.tsx` (`DISCIPLINES` `:80-104`; scope-card render `:217-269`); Test `tests/components/crew/sections/GearSection.test.tsx`.

**This is a UI task — Opus/Claude Code (UI-always-Opus). Reuses existing card machinery; no new data shape.**

- [ ] **Step 1: Failing tests:** Scenic card renders when a room has non-sentinel `scenic` and omits when all-sentinel; Other card likewise; keynote card renders (currently-missing coverage); with a `gear_scope` anchor in `data.sourceAnchors`, scope-card SourceLink resolves to the GEAR anchor; without it, to `rooms`. Build `ShowForViewer` via the existing test factory (find it in the current GearSection test); set `rooms[0].scenic`/`.other`; derive expectations from the fixture data, not hardcoded.
- [ ] **Step 2: Run → fail.** **Step 3: Implement:** add `scenic` (`Frame` icon, "Scenic") and `other` (`Boxes` icon, "Other gear") to `DISCIPLINES` after `lighting`, accessor `(r)=>r.scenic` / `(r)=>r.other`; keep `viewerDisciplines` A/V/L-only (Scenic/Other neutral). Add `const scopeRegion = data.sourceAnchors["gear_scope"] ? "gear_scope" : CARD_REGION_MAP[\`gear-scope-${d.id}\`]` and use `data.sourceAnchors[scopeRegion]` for the SourceLink. Import `Frame`, `Boxes` from `lucide-react`. **Step 4: Run → pass** (+ existing GearSection/crew tests green). **Step 5: Commit** — `feat(crew-page): GearSection Scenic/Other scope cards + GEAR-tab source links`

---

### Task 10: Layout-dimensions assertion (mandatory — new cards in the fixed grid)

**Files:** Test only — a real-browser/jsdom-computed layout assertion for the `gear-scopes-row` grid with the new cards.

Per AGENTS.md (fixed-dimension parent + flex/grid children) the new Scenic/Other cards join the existing `grid grid-cols-1 gap-3 min-[720px]:grid-cols-3` (`GearSection.tsx:220`). **Dimensional invariant:** every rendered `gear-scope-*` card's height equals its grid cell height at ≥720px (existing `h-full`/`flex flex-col` wrapper). With 5 possible cards the grid wraps to a 2nd row (3+2); each keeps `min-w-0`.

- [ ] **Step 1:** Add a layout test using the project's standalone real-browser harness (`reference_standalone_realbrowser_layout_harness`: tailwind CLI compile `globals.css` → static HTML with all 5 cards → `http.server` → Playwright MCP `getBoundingClientRect`) OR a Playwright component render; assert each `gear-scope-*` card height == its row's height within 0.5px, and 5 cards lay out 3-then-2 ≥720px. (jsdom alone is NOT sufficient for layout — AGENTS.md.)
- [ ] **Step 2: Run → confirm pass** against the real render. **Step 3: Commit** — `test(crew-page): real-browser layout assertion for 5-card gear-scopes-row`

> **Transition audit (inline, no separate task):** GearSection scope cards are server-rendered present/absent with NO mode toggle or animation (consistent with the existing A/V/L cards). All appear/omit transitions are **instant — no animation needed**. No `AnimatePresence`/ternary-with-exit/compound transitions are added. Documented here per the spec's Transition Inventory (§4).

---

### Task 11: Full-corpus gear audit regression

**Files:** Create `tests/parser/gearCorpusAudit.test.ts`.

- [ ] **Step 1: Test:** run `parseSheet` over all `fixtures/shows/{raw,exporter-xlsx}/*.md`; assert the confirmed GEAR-tab shows (`exporter-xlsx/rpas.md`, `fixed-income.md`) report ≥1 room with non-empty audio OR video OR lighting; the form-layout show (`raw/2025-10-consultants-roundtable.md`) has non-empty `event_details`. Assert against `parseSheet` output (anti-tautology).
- [ ] **Step 2: Run → pass.** **Step 3: Commit** — `test(parser): full-corpus gear audit regression (modern shows surface scope + event_details)`

---

### Task 12: Quality gate + impeccable dual-gate + screenshot regen

- [ ] **Step 1:** Run the full suite: `npx vitest run` → all green (incl. the 2 new meta-tests). Run lint/typecheck/prettier per the repo quality gate (`pnpm lint`, `pnpm typecheck` or the project's gate command) → green. (Do NOT `--no-verify` the final commits — the quality gate must actually pass; see memory: `--no-verify` skips prettier/eslint → CI quality-gate fail.)
- [ ] **Step 2:** invariant-8 impeccable dual-gate on the UI diff (`GearSection.tsx`, `emptyState.ts`, `buildSheetDeepLink.ts`): `/impeccable critique` AND `/impeccable audit` with the canonical v3 preflight gates; HIGH/CRITICAL fixed or DEFERRED (record dispositions in the handoff). External attestation (fresh subagent/user), not self-attested.
- [ ] **Step 3:** Regen crew-preview gear screenshots (`public/help/screenshots/crew-preview-gear-mobile-*.webp`) via the screenshots workflow — the RPAS gear preview now shows real A/V/L. Re-author the bot commit if the regen lands as `github-actions[bot]` (memory: bot-commit `action_required` gate). Verify the regenerated WebP shows the gear cards.
- [ ] **Step 4: Commit** — `chore(crew-page): regen crew-preview gear screenshots (GEAR scope now surfaced)`

---

### Task 13: Whole-diff Codex review → push → CI green → merge

(Pipeline steps, executed by the orchestrator — not implementation TDD.)

- [ ] Whole-diff cross-model adversarial review (fresh-eyes, full milestone) → APPROVE.
- [ ] Push branch; open PR; verify **real GitHub CI green** (12 required checks) — not just local.
- [ ] `gh pr merge --merge`; fetch + fast-forward local `main`; verify `git rev-list --left-right --count main...origin/main` == `0  0`.

---

## Self-Review

(Run after drafting — see writing-plans + AGENTS.md writing-plans additions.)

1. **Spec coverage:** every spec section maps to a task — §3.1 GEAR parse (T2/T3), §3.2 classification (T1), §3.4 EVENT (T4), §3.5 secondaries (T5/T6/T7), §3.6 render + source links (T8/T9), §6 tests (T1-T11 + meta-tests), §7 blast-radius (T12), §8 preempts (honored in task rules). Layout-dimensions (T10) + Transition audit (T10 inline) per AGENTS.md.
2. **Meta-test inventory:** declared (T1 collision tripwire, T4 corpus tripwire); no auth/DB metas apply.
3. **Anti-tautology:** every parser test reads a fixture and asserts against `parseSheet`/`parseGearTab` output; expectations derived from fixture rows; each test names its failure mode.
4. **Adversarial review (cross-model):** the plan's own review is the next pipeline step (Plan: Codex adversarial-review to APPROVE) before execution handoff.
5. **No placeholders / type consistency:** interfaces (`GearRoom`, `classifyGearItem`, `hasGearDateGrid`, `mergeGearIntoRooms`, `isSensitiveCanonicalKey`, `gearBucketFor`) are consistent across tasks.
