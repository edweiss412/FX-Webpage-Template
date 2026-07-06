# Parser Anchor De-literalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De-literalize the three Tier-1 "single-literal anchor" brittleness sources the edge-case audit ranked highest — room-header discovery (findings #6), stage-restriction phrasing (#7), and short-header typos (#5) — so future show-bible variation parses correctly or is explicitly signaled, never silently wrong.

**Architecture:** Three independent parser changes, one PR. **Part A** replaces the two-literal-name `mabelRe` loop in `lib/parser/blocks/rooms.ts` with a precomputed room-header model admitting a candidate on THREE local structural signals (shape + preceded-by-boundary + field-evidence). **Part B** replaces three hardcoded stage-restriction phrasings in `lib/parser/personalization.ts` with a token-level `parseStageClause` grammar, adding one new §12.4 code `UNKNOWN_STAGE_RESTRICTION`. **Part C** adds `CREW`/`TECH` short-header typo tolerance in `lib/parser/sectionHeaderNormalize.ts` behind the existing field-band gate.

**Tech Stack:** TypeScript, Vitest (`pnpm test` = `vitest run`), Next.js 16. Parser is pure functions over Google-Sheets-derived markdown; entry `parseSheet(markdown, filename?)` at `lib/parser/index.ts:516`.

**Canonical reference:** The APPROVED spec `docs/superpowers/specs/2026-07-05-parser-anchor-deliteralization.md` is the single source of truth for every exact regex, predicate body, and token-classification rule. This plan cites spec section numbers for those bodies (to prevent drift — the spec is ratified) and provides the task decomposition, test code, integration glue, and commit boundaries. Where a task step says "per spec §X", copy the exact code from that spec section.

## Global Constraints

- **Blast radius: parser-only.** NO UI (`app/**` except static `app/help/errors/*.ts` data files, `components/**`), NO DB/migrations, NO advisory-locks. Verified: current branch diff vs main is spec + BACKLOG only.
- **TDD per task** (plan-wide invariant 1): failing test → run-fail → minimal impl → run-pass → commit. Never impl before its test.
- **Commit per task** (invariant 6), conventional-commits: `feat(parser):` / `test(parser):` / `feat(messages):` / `docs(parser):`. One task per commit; use `--no-verify` (shared lint-staged hooks belong to the main checkout).
- **No raw error codes in UI** (invariant 5): user copy flows through `lib/messages/lookup.ts`; the new code's Doug-facing copy lives in `lib/messages/catalog.ts`.
- **New §12.4 code = full lockstep** (see Task B3): master-spec §12.4 prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts` row land in ONE commit; `x1-catalog-parity` (`tests/messages/codes.test.ts`) compares runtime catalog ↔ §12.4 prose.
- **Run the FULL suite** (`pnpm test`) before the whole-diff review, not just touched files — a new code touches x1/x2/help/codes-coverage AND the data-gap-completeness gates. Also `pnpm typecheck`, `pnpm lint`, `pnpm format:check` before push (each is a separate CI gate).
- **Spec is canonical** (invariant 7): anywhere this plan and the spec disagree, the spec wins — open a question instead of silently diverging.

## Meta-test inventory (declared per AGENTS.md writing-plans additions)

- **CREATES** the exhaustive room-admit truth-table test `tests/parser/blocks/roomHeaderModel.test.ts` (Task A4) — the structural defense that closed the R30–R38 room-admit vector.
- **EXTENDS** `tests/parser/dataGapsClassCompleteness.test.ts` (Task B3): `DATA_GAP_CODES.size` 22→23, `ALL_PERSISTED_WARNING_CODES.size` 42→43, partition comment 22/7/2/11 → 23/7/2/11.
- **EXTENDS** the §12.4 catalog-parity gate `tests/messages/codes.test.ts` (Task B3) by adding the new code across all three lockstep surfaces.
- **No advisory-lock topology** applies — no `pg_advisory*` in scope (declared explicitly per the writing-plans rule).

## Advisory-lock holder topology

N/A — this plan touches no `pg_advisory*` code path. Declared explicitly per the writing-plans mandate.

---

## File Structure

**Part A — rooms (`lib/parser/blocks/rooms.ts`)**
- Modify: replace the `mabelRe` loop (`:823-847`) with `computeRoomHeaderModel` + a Pass-2 extraction driven by the model. Add the pure predicates (`roomHeaderNameShape`, `headerDayMarker`, `isRoomHeaderShape`, `roomBaseName`, `dayRangeOf`, `roomGroupKey`, `hasRoomFieldBlock`, `precededByBoundary`, `isRoomHeader`, `computeRoomHeaderModel`). Convert `extractBoBlock`/`extractGsBlock` to LINE-based (take `lines` + start line + model). Keep `buildEmptyRoom`, `mergeBoFields`, `roomHasContent`, `applyBoFields` VERBATIM.
- Test: `tests/parser/blocks/roomHeaderModel.test.ts` (new — predicates + truth-table), extend the corpus no-op assertion.

**Part B — stage grammar (`lib/parser/personalization.ts`)**
- Create: `lib/parser/stageClause.ts` — `parseStageClause` + `StageClause` type (token-level grammar). Keeping it in its own file isolates the grammar from `personalization.ts` per spec §3.
- Modify: `extractStageRestriction` (`:158-168`) to delegate to `parseStageClause`; `extractRoleFlags` shares the tokenizer. `lib/parser/blocks/crew.ts` stamping (`:326-334`) to emit `UNKNOWN_STAGE_RESTRICTION`.
- Touchpoints (Task B3): `lib/messages/catalog.ts`, master spec §12.4, `lib/parser/dataGaps.ts`, `lib/drive/showDayTimeAnchors.ts`, plus generated files.
- Test: `tests/parser/stageClause.test.ts` (new), extend `tests/parser/dataGapsClassCompleteness.test.ts`, `tests/messages/codes.test.ts`.

**Part C — short header (`lib/parser/sectionHeaderNormalize.ts`)**
- Modify: add `SHORT_SECTION_VOCAB = ["CREW","TECH"]` + `SHORT_SECTION_VOCAB_EXCLUDE = ["CREWS","TECHS"]` behind the existing `countFieldHeaderWords ≥ 1` field-band gate + `noExactSpellingElsewhere`.
- Test: `tests/parser/sectionHeaderNormalize.test.ts` (extend).

---
## Part A — Room-header de-literalization

**Interfaces produced by Part A** (later Part-A tasks + the corpus test rely on these exact signatures, copied from spec §2.2):
- `roomHeaderNameShape(col0Raw: string): boolean`
- `headerDayMarker(col0Raw: string): boolean`
- `isRoomHeaderShape(col0Raw: string): boolean` = `roomHeaderNameShape && headerDayMarker`
- `roomBaseName(firstLine: string): string`
- `dayRangeOf(col0Raw: string): string`
- `roomGroupKey(col0Raw: string, firstLine: string): string`
- `hasRoomFieldBlock(lines: string[], i: number): boolean`
- `precededByBoundary(lines: string[], i: number): boolean`
- `isRoomHeader(lines: string[], i: number): boolean` = `isRoomHeaderShape(col0Of(lines[i])) && precededByBoundary(lines,i) && hasRoomFieldBlock(lines,i)`
- `type RoomCandidate = { key: string; displayName: string; lineIndex: number }`
- `type RoomHeaderModel = { lines: string[]; roomHeaderLines: ReadonlySet<number>; groups: Map<string, RoomCandidate[]> }`
- `computeRoomHeaderModel(markdown: string): RoomHeaderModel`

### Task A1: Pure single-cell room predicates + identity/group-key

**Files:**
- Modify: `lib/parser/blocks/rooms.ts` (add the six pure functions; do NOT yet touch the `mabelRe` loop)
- Test: `tests/parser/blocks/roomHeaderModel.test.ts` (new)

**Interfaces:**
- Produces: `roomHeaderNameShape`, `headerDayMarker`, `isRoomHeaderShape`, `roomBaseName`, `dayRangeOf`, `roomGroupKey` (signatures above).
- Consumes: nothing (pure).

- [ ] **Step 1: Write the failing unit test.** Create `tests/parser/blocks/roomHeaderModel.test.ts`. Import the six functions from `@/lib/parser/blocks/rooms`. Assert the spec §2.3 guard rows and §2.2 examples:

```ts
import { describe, it, expect } from "vitest";
import {
  roomHeaderNameShape, headerDayMarker, isRoomHeaderShape,
  roomBaseName, dayRangeOf, roomGroupKey,
} from "@/lib/parser/blocks/rooms";

describe("room shape predicates (spec §2.2/§2.3)", () => {
  it("roomHeaderNameShape: proper name yes; dims-leading/field-label/day-only no", () => {
    expect(roomHeaderNameShape("MABEL 1&#10;DAY 1 & 2")).toBe(true);
    expect(roomHeaderNameShape("LAUDERDALE 1, 2, 3 DAY 1 & 2")).toBe(true); // commas (R21)
    expect(roomHeaderNameShape("Hotel Ballroom DAY 1 & 2")).toBe(true);     // compound (R33)
    expect(roomHeaderNameShape("4' X 8' RISER")).toBe(false);              // dims-leading
    expect(roomHeaderNameShape("HOTEL DAY 1 & 2")).toBe(false);            // exact section token (R33)
    expect(roomHeaderNameShape("FOYER DAY 1 & 2")).toBe(false);            // FOYER token via base (R32)
    expect(roomHeaderNameShape("Grand Foyer DAY 1 & 2")).toBe(true);       // compound ≠ FOYER
    expect(roomHeaderNameShape("BO Setup")).toBe(false);                   // field label (item 3)
    expect(roomHeaderNameShape("DAY 1")).toBe(false);                      // empty base (R36)
    expect(roomHeaderNameShape("DAYS 1 & 2")).toBe(false);
  });
  it("headerDayMarker: trailing-last-content only", () => {
    expect(headerDayMarker("MABEL 1&#10;DAY 1 & 2")).toBe(true);
    expect(headerDayMarker("LAUDERDALE 1, 2, 3 DAY 1 & 2")).toBe(true);
    expect(headerDayMarker("MERIDIAN&#10;DAY 1 & 2&#10;60' x 45'")).toBe(true); // dims after DAY ok
    expect(headerDayMarker("SPECIAL DAY 1 NOTES")).toBe(false);           // word after number (R26)
    expect(headerDayMarker("SPECIAL DAY 1&#10;NOTES")).toBe(false);       // prose line after (R35)
    expect(headerDayMarker("FOH POSITION&#10;Downstage")).toBe(false);
  });
  it("isRoomHeaderShape composes both", () => {
    expect(isRoomHeaderShape("MABEL 1&#10;DAY 1 & 2")).toBe(true);
    expect(isRoomHeaderShape("PROJECTION SCREEN&#10;5' x 9'")).toBe(false);
  });
  it("roomBaseName strips trailing inline DAY, uppercases", () => {
    expect(roomBaseName("SALON ABCD DAY 1 & 2")).toBe("SALON ABCD");
    expect(roomBaseName("MABEL 1")).toBe("MABEL 1");
    expect(roomBaseName("DAY 1")).toBe("");
  });
  it("dayRangeOf normalizes the trailing range from any line", () => {
    expect(dayRangeOf("MABEL 1&#10;DAY 1 & 2")).toBe("1&2");
    expect(dayRangeOf("SALON ABCD DAY 1")).toBe("1");
  });
  it("roomGroupKey merges same name+day, splits distinct days", () => {
    const k = (c: string) => roomGroupKey(c, c.replace(/&#10;/g, "\n").split("\n")[0].trim());
    expect(k("SALON ABCD DAY 1 & 2")).toBe(k("SALON ABCD&#10;DAY 1 & 2")); // R27 merge
    expect(k("SALON ABCD DAY 1")).not.toBe(k("SALON ABCD DAY 2"));         // R34 split
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `pnpm test tests/parser/blocks/roomHeaderModel.test.ts` → FAIL (exports not defined).

- [ ] **Step 3: Implement the six pure functions** in `lib/parser/blocks/rooms.ts` (near the existing room helpers), copying the exact bodies from spec §2.2 (a)/(b)/(c)/(d) and §2.3 items 1-3:
  - `roomHeaderNameShape` — spec §2.3 items 1-3: first line uppercased matches `^[A-Z0-9][A-Z0-9 &',./-]*$`, NOT `^\d+\s*'\s*x`, `roomBaseName` non-empty (R36), not a section banner (item 2: PREFIX-match `GENERAL SESSION|BREAKOUT|ADDITIONAL|LUNCH|DETAILS`, EXACT-match generic tokens `DOCUMENTS|DATES|CREW|DRESS|TRANSPORTATION|HOTEL|VENUE|AGENDA|CONTACTS` + `KNOWN_SECTION_HEADERS`/`KNOWN_SUB_LABELS` incl `FOYER`, against the DAY-stripped identity), not a `^GS\s` field row, not a field label (item 3 list = the `applyBoLabel` labels).
  - `headerDayMarker` — spec §2.2 (b): split lines, `anchor` = LAST line matching `/\bDAYS?\s+\d[\d\s&,.\-–—]*$/i`, return `false` if none, else every line after `anchor` is a dims-only line `/^\d+\s*'?\s*x\s*\d/i`.
  - `isRoomHeaderShape` = `roomHeaderNameShape(col0Raw) && headerDayMarker(col0Raw)`.
  - `roomBaseName` = `firstLine.replace(/\s*\bDAYS?\s+\d[\d\s&,.\-–—]*$/i, "").trim().toUpperCase()`.
  - `dayRangeOf` — spec §2.2 (d): `(/\bDAYS?\s+(\d[\d\s&,.\-–—]*?)\s*$/im.exec(col0Raw.replace(/&#10;/g,"\n"))?.[1] ?? "").replace(/\s+/g,"").toUpperCase()`.
  - `roomGroupKey(col0Raw, firstLine)` = `roomBaseName(firstLine) + " " + dayRangeOf(col0Raw)`.
  - Derive the field-label set and section-token sets as shared `const`s (item 3 note: DERIVED from the `applyBoLabel` label list so it cannot drift). Import `KNOWN_SECTION_HEADERS`/`KNOWN_SUB_LABELS` from `@/lib/parser/knownSections`.

- [ ] **Step 4: Run to verify it passes.** `pnpm test tests/parser/blocks/roomHeaderModel.test.ts` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add lib/parser/blocks/rooms.ts tests/parser/blocks/roomHeaderModel.test.ts
git commit --no-verify -m "feat(parser): pure room-shape predicates (name-shape, day-marker, group key)"
```

### Task A2: Local block-context predicates (field-evidence + boundary)

**Files:**
- Modify: `lib/parser/blocks/rooms.ts` (add `hasRoomFieldBlock`, `precededByBoundary`, `isRoomHeader`)
- Test: `tests/parser/blocks/roomHeaderModel.test.ts` (extend)

**Interfaces:**
- Consumes: `isRoomHeaderShape` (Task A1).
- Produces: `hasRoomFieldBlock`, `precededByBoundary`, `isRoomHeader` (signatures above).

- [ ] **Step 1: Extend the test** with the three-signal cases (spec §2.2 (c2), verified via probe14):

```ts
import { hasRoomFieldBlock, precededByBoundary, isRoomHeader } from "@/lib/parser/blocks/rooms";

const T = (s: string) => s.split("\n");
describe("room block-context predicates (spec §2.2 c2 — R37/R38)", () => {
  const room = T(["| MABEL 1&#10;DAY 1 & 2 |", "| :---: | :---: |", "| BO Setup | TBD |", "| BO Audio | NONE |"]);
  it("hasRoomFieldBlock true when a BO field row is immediately beneath (skipping separator)", () => {
    expect(hasRoomFieldBlock(room, 0)).toBe(true);
  });
  it("hasRoomFieldBlock false for an agenda note (schedule rows beneath)", () => {
    expect(hasRoomFieldBlock(T(["| WELCOME RECEPTION DAY 1 |", "| 6:00 PM | Cocktails |"]), 0)).toBe(false);
  });
  it("precededByBoundary: blank/separator/all-empty row above, or i===0", () => {
    expect(precededByBoundary(T(["", "| MABEL 1&#10;DAY 1 & 2 |"]), 1)).toBe(true);          // blank
    expect(precededByBoundary(T(["| | | |", "| LAUDERDALE 1, 2, 3 DAY 1 & 2 |"]), 1)).toBe(true); // all-empty
    expect(precededByBoundary(T(["| BO Setup | TBD |", "| WELCOME RECEPTION DAY 1 |"]), 1)).toBe(false); // field row above
  });
  it("isRoomHeader: interleaved note fails boundary even with a BO row beneath (R38)", () => {
    const inter = T(["| MABEL 1&#10;DAY 1 & 2 |", "| :---: | :---: |", "| BO Setup | TBD |",
                     "| WELCOME RECEPTION DAY 1 |", "| BO Audio | L-Acoustics |"]);
    expect(isRoomHeader(inter, 0)).toBe(true);   // MABEL is a room
    expect(isRoomHeader(inter, 3)).toBe(false);  // the note is NOT
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `pnpm test tests/parser/blocks/roomHeaderModel.test.ts` → FAIL (new exports undefined).

- [ ] **Step 3: Implement** the three functions in `lib/parser/blocks/rooms.ts`, copying spec §2.2 (c2):
  - `hasRoomFieldBlock(lines, i)`: scan `k = i+1..`; `t = lines[k].trim()`; if `!t.startsWith("|")` break; if separator `/^\|\s*:?-+/` or an all-empty-cells row → continue; if col0 (strip optional `BO `/`GS `, upper) ∈ field-label set → return `true`; else break.
  - `precededByBoundary(lines, i)`: `i===0` || prev not `|`-started || prev is separator `/^\|\s*:?-+/` || prev is an all-empty-cells row. Define `allEmptyCells(row)` = row starts with `|` and every cell between outer pipes is whitespace.
  - `isRoomHeader(lines, i)` = `isRoomHeaderShape(col0Of(lines[i])) && precededByBoundary(lines, i) && hasRoomFieldBlock(lines, i)`, where `col0Of(line)` extracts the first cell (`line.split("|")[1] ?? ""`) trimmed.

- [ ] **Step 4: Run to verify it passes.** `pnpm test tests/parser/blocks/roomHeaderModel.test.ts` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add lib/parser/blocks/rooms.ts tests/parser/blocks/roomHeaderModel.test.ts
git commit --no-verify -m "feat(parser): room field-evidence + boundary predicates (room-vs-note discriminator)"
```

### Task A3: Room-header model + line-based extraction, replacing the mabelRe loop

**Files:**
- Modify: `lib/parser/blocks/rooms.ts` — add `computeRoomHeaderModel`; convert `extractBoBlock`/`extractGsBlock` to LINE-based; replace the `mabelRe` loop (`:823-847`) with a Pass-2 that consumes the model; thread the model into `parseGsRoom`/`parseBoRooms` (called from `collectV2V1Rooms:215`).
- Test: `tests/parser/blocks/roomHeaderModel.test.ts` (extend with corpus no-op + integration)

**Interfaces:**
- Consumes: `isRoomHeader`, `roomGroupKey`, `buildEmptyRoom`, `mergeBoFields`, `roomHasContent`, `applyBoFields` (existing, VERBATIM).
- Produces: `computeRoomHeaderModel`; behavior-identical `collectV2V1Rooms` output.

- [ ] **Step 1: Write the failing corpus + model test.** Extend `roomHeaderModel.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { parseSheet } from "@/lib/parser";
import { computeRoomHeaderModel } from "@/lib/parser/blocks/rooms";

describe("computeRoomHeaderModel + corpus no-op (spec §2.4/§8)", () => {
  const eastCoast = readFileSync("fixtures/shows/raw/2024-05-east-coast-family-office.md", "utf8");
  it("admits exactly MABEL 1 and LAUDERDALE from the east-coast fixture", () => {
    const m = computeRoomHeaderModel(eastCoast);
    const names = [...m.groups.values()].flat().map((c) => c.displayName).sort();
    expect(names).toEqual(["LAUDERDALE 1, 2, 3 DAY 1 & 2", "MABEL 1"]);
  });
  it("east-coast rooms parse byte-identically (both emitted with BO Setup)", () => {
    const rooms = parseSheet(eastCoast).rooms;
    const mabel = rooms.find((r) => r.name === "MABEL 1");
    const laud = rooms.find((r) => r.name === "LAUDERDALE 1, 2, 3 DAY 1 & 2");
    expect(mabel?.setup).toBe("TBD");
    expect(laud?.setup).toBe("TBD");
  });
});
```
(The exhaustive corpus-wide deep-equal snapshot is Task A4; this task pins the east-coast anchor.)

- [ ] **Step 2: Run to verify it fails.** `pnpm test tests/parser/blocks/roomHeaderModel.test.ts` → FAIL (`computeRoomHeaderModel` undefined).

- [ ] **Step 3: Implement per spec §2.2 (e) + Pass-0/1/2 + Terminator:**
  - `computeRoomHeaderModel(markdown)`: `const lines = markdown.split("\n")`; scan each row's col0; admit iff `isRoomHeader(lines, i)`; record `{ key: roomGroupKey(rawHeader, firstLine), displayName: firstLine, lineIndex: i }`; group by `key`; `roomHeaderLines` = set of every admitted `lineIndex`; return `{ lines, roomHeaderLines, groups }`.
  - Convert `extractBoBlock` to `extractBoBlock(lines: string[], startLine: number, model: RoomHeaderModel): string` — walk `lines` from `startLine`; terminate at the earliest of (a) a non-`|`/blank line after content (existing `:890` rule), (b) a structural keyword `NEXT_ROOM_HEADER_RE` (keep, minus the literal MABEL/LAUDERDALE which are now covered by (c)), (c) an absolute index ∈ `model.roomHeaderLines` — EXCEPT the block's own start line (`k===0` guard, preserve `:888-894` verbatim). Behavior-identical because `mabelRe`'s `m.index` was the row's line-start (spec §2.2 (e)/§8 R24).
  - Convert `extractGsBlock` similarly to take `(lines, startLine, model)`.
  - Replace the `mabelRe` loop (`:823-847`) with Pass-2: for each key-group, extract EVERY member block via `extractBoBlock(model.lines, candidate.lineIndex, model)`, `mergeBoFields` across the group (VERBATIM), `buildEmptyRoom("breakout", displayName)`, emit iff `roomHasContent`. Preserve the `seen.has(headerKey)` dedup — a room already claimed by a BREAKOUT/LUNCH path is skipped (use `roomBaseName`-keyed or the existing `headerKey` per spec §2.2 step 1).
  - Compute the model ONCE at the top of `collectV2V1Rooms` (before `parseGsRoom`/`parseBoRooms`) and thread it in (spec Pass-0, R17 f2).

- [ ] **Step 4: Run the parser suite.** `pnpm test tests/parser/` → PASS (the new test + all existing room/parser tests still green).

- [ ] **Step 5: Commit.**
```bash
git add lib/parser/blocks/rooms.ts tests/parser/blocks/roomHeaderModel.test.ts
git commit --no-verify -m "feat(parser): de-literalize room discovery via precomputed room-header model"
```

### Task A4: Exhaustive room-admit truth-table + corpus no-op (structural defense)

**Files:**
- Test: `tests/parser/blocks/roomHeaderModel.test.ts` (extend — the structural defense per AGENTS.md same-vector rule)

**Interfaces:** Consumes `isRoomHeader`, `parseSheet` (no new production code).

- [ ] **Step 1: Write the exhaustive truth-table + corpus no-op test** (spec §8 "EXHAUSTIVE unit truth-table" + "Corpus-wide rooms no-op"):

```ts
import { readdirSync, readFileSync } from "node:fs";
import { isRoomHeader } from "@/lib/parser/blocks/rooms";

const row = (col0: string, below: string[] = [], above = "") =>
  [above, `| ${col0} |`, ...below].filter((_, idx) => idx > 0 || above !== "");

describe("isRoomHeader exhaustive truth-table (spec §8 — R30–R38 structural closure)", () => {
  const cases: Array<[string, string[], string, boolean]> = [
    // [col0, rowsBelow, rowAbove, expected]
    ["MABEL 1&#10;DAY 1 & 2", ["| :---: |", "| BO Setup | TBD |"], "", true],
    ["LAUDERDALE 1, 2, 3 DAY 1 & 2", ["| BO Setup | TBD |"], "| | |", true],
    ["WELCOME RECEPTION DAY 1", ["| 6:00 PM | X |"], "", false],                 // agenda note, no field
    ["WELCOME RECEPTION DAY 1", ["| BO Audio | L |"], "| BO Setup | TBD |", false], // interleaved (R38)
    ["WELCOME RECEPTION DAY 1", ["| BO Setup | 5PM |"], "", true],               // titled table w/ BO
    ["SPECIAL DAY 1 NOTES", ["| BO Setup | TBD |"], "", false],                  // DAY-note (R26)
    ["DAY 1", ["| BO Setup | TBD |"], "", false],                               // empty base (R36)
    ["4' X 8' RISER", ["| BO Setup | TBD |"], "", false],                       // dims, no DAY (R30)
    ["HOTEL DAY 1 & 2", ["| BO Setup | TBD |"], "", false],                     // exact token (R33)
    ["Hotel Ballroom DAY 1 & 2", ["| BO Setup | TBD |"], "", true],             // compound (R33)
  ];
  it.each(cases)("%s → %s", (col0, below, above, expected) => {
    const lines = [above || "", `| ${col0} |`, ...below];
    const i = 1;
    expect(isRoomHeader(lines, i)).toBe(expected);
  });
});

describe("corpus-wide rooms no-op (spec §2.4 — the primary structural defense)", () => {
  it.each(readdirSync("fixtures/shows/raw").filter((f) => f.endsWith(".md")))(
    "%s rooms unchanged (no fabricated/dropped room)", (file) => {
      const md = readFileSync(`fixtures/shows/raw/${file}`, "utf8");
      const rooms = parseSheet(md).rooms;
      // No bogus room: every emitted room name is a real header (non-empty, has content)
      for (const r of rooms) expect(r.name.trim().length).toBeGreaterThan(0);
      expect(rooms).toMatchSnapshot();
    });
});
```
Note: the `toMatchSnapshot()` baseline must be captured on `origin/main` behavior. Capture it by running this test ONCE against `origin/main` (git stash the source change, run `pnpm test -u` for the snapshot file only, restore). If snapshot infra is undesirable, replace with an explicit per-fixture expected-room-count assertion derived from `origin/main` (run `parseSheet` on `origin/main` to read counts). Document the chosen mechanism in the commit.

- [ ] **Step 2: Run.** `pnpm test tests/parser/blocks/roomHeaderModel.test.ts` → truth-table PASS; corpus no-op PASS (or reveals a drift to fix in `rooms.ts`).

- [ ] **Step 3: If corpus no-op fails**, the de-literalization changed a real fixture's rooms — fix `rooms.ts` (do NOT edit the snapshot to match). Re-run until green.

- [ ] **Step 4: Commit.**
```bash
git add tests/parser/blocks/roomHeaderModel.test.ts tests/parser/blocks/__snapshots__/
git commit --no-verify -m "test(parser): exhaustive room-admit truth-table + corpus no-op (structural defense)"
```

---
## Part B — Stage-restriction token grammar + `UNKNOWN_STAGE_RESTRICTION`

**Interfaces produced by Part B** (copied from spec §3.2 + §9 `consumedOnlyClause` preempt):
- `type StageClause = { stages: WorkPhase[]; cleaned: string; unrecognizedRestriction: boolean; consumedOnlyClause: boolean }`
  - `consumedOnlyClause` = `true` whenever `parseStageClause` consumed a trailing `ONLY`/`ONLY***` marker (explicit OR malformed OR full-4) — the signal that suppresses the pre-existing crew triple-asterisk `UNKNOWN_DAY_RESTRICTION` guard (spec §9; the field does NOT yet exist in live code — it is NEW).
- `parseStageClause(roleCell: string): StageClause` — the token-level grammar (spec §3.2 steps 1-4).
- `extractStageRestriction(roleCell: string): { restriction: StageRestriction; warnings: ParseWarning[]; consumedOnlyClause: boolean }` — CHANGED return shape (was bare `StageRestriction`; spec §3).

### Task B1: `parseStageClause` token-level grammar

**Files:**
- Create: `lib/parser/stageClause.ts`
- Test: `tests/parser/stageClause.test.ts` (new)

**Interfaces:**
- Consumes: `WorkPhase` (`lib/parser/types.ts:141`), `FULL_STAGE_ONLY_PATTERN`/`STAGE_TRAILING_MARKER_RE`/`STAGE_VOCAB`/`MULTI_WORD_TOKENS` (re-exported from `personalization.ts` or moved to a shared module — pick one and keep it single-source).
- Produces: `parseStageClause`, `StageClause`.

- [ ] **Step 1: Write the failing test** (spec §3.2 branches — explicit / malformed / role-clause; §9 preempts R16/R22/R25/R28):

```ts
import { describe, it, expect } from "vitest";
import { parseStageClause } from "@/lib/parser/stageClause";

describe("parseStageClause (spec §3.2)", () => {
  it("EXPLICIT: any subset/order of the 5 stages + trailing ONLY", () => {
    expect(parseStageClause("Set / Strike ONLY").stages).toEqual(["Set", "Strike"]);
    expect(parseStageClause("Load Out / Strike ONLY").stages).toEqual(["Load Out", "Strike"]);
    expect(parseStageClause("Set / Show ONLY").stages).toEqual(["Set", "Show"]);
    expect(parseStageClause("Set / Strike ONLY").unrecognizedRestriction).toBe(false);
  });
  it("EXPLICIT keeps a role token and routes it to cleaned (R22)", () => {
    const r = parseStageClause("A1 / Set / Strike ONLY");
    expect(r.stages).toEqual(["Set", "Strike"]);
    expect(r.cleaned).toMatch(/A1/);
    expect(r.unrecognizedRestriction).toBe(false);
  });
  it("hyphen-mixed stage is not swallowed by an adjacent role (R25)", () => {
    expect(parseStageClause("Load In / Set - LEAD ONLY").stages).toEqual(["Load In", "Set"]);
  });
  it("MALFORMED: >=1 stage AND >=1 unknown → unrecognizedRestriction, no stages (R28)", () => {
    const r = parseStageClause("Set / Rehearsal ONLY");
    expect(r.stages).toEqual([]);
    expect(r.unrecognizedRestriction).toBe(true);
    expect(r.cleaned).toMatch(/Rehearsal/); // non-stage tokens preserved (autocorrect/UNKNOWN_ROLE downstream)
  });
  it("ROLE CLAUSE: zero stages → not a restriction (Rehearsal ONLY, RIGGER ONLY)", () => {
    expect(parseStageClause("Rehearsal ONLY").stages).toEqual([]);
    expect(parseStageClause("Rehearsal ONLY").unrecognizedRestriction).toBe(false);
    expect(parseStageClause("RIGGER ONLY").unrecognizedRestriction).toBe(false);
  });
  it("full-4 lenient star: the EXACT live full-4 phrase (no Show) keeps a 4-stage restriction (R17)", () => {
    // FULL_STAGE_ONLY_PATTERN = /Load In / Set / Strike / Load Out ONLY\*{0,3}/i (personalization.ts:53)
    const r = parseStageClause("Load In / Set / Strike / Load Out ONLY**");
    expect(r.stages).toEqual(["Load In", "Set", "Strike", "Load Out"]);
    expect(r.unrecognizedRestriction).toBe(false);
    expect(r.consumedOnlyClause).toBe(true);
  });
  it("NON-full-4 clause with Show + a double-star marker does NOT restrict (fail-open, R17)", () => {
    // 'Load In / Set / Show / Strike ONLY**' is NOT the full-4 phrase and ONLY** is invalid for
    // generalized clauses → no stages, no restriction (must NOT hide Show days).
    const r = parseStageClause("Load In / Set / Show / Strike ONLY**");
    expect(r.stages).toEqual([]);
    expect(r.unrecognizedRestriction).toBe(false);
  });
  it("consumedOnlyClause is true for a malformed ONLY*** clause (suppresses crew triple-asterisk guard)", () => {
    expect(parseStageClause("Set / Rehearsal ONLY***").consumedOnlyClause).toBe(true);
    expect(parseStageClause("Set / Rehearsal ONLY***").unrecognizedRestriction).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `pnpm test tests/parser/stageClause.test.ts` → FAIL.

- [ ] **Step 3: Implement `parseStageClause`** per spec §3.2 steps 1-4 EXACTLY:
  1. strip a leading dash;
  2. full-4 lenient-star carve-out (`FULL_STAGE_ONLY_PATTERN`, `ONLY\*{0,3}` → the 4-stage restriction; `cleaned = prefix + tail`);
  3. strict marker `\bONLY\b(?:\s*\*{3})?(?!\s*\*)`;
  4. TOKEN classification: multi-word extraction FIRST (`MULTI_WORD_TOKENS`, preserving R1), then split the body on `/` AND `-`, classify each atomic token STAGE (`STAGE_VOCAB` + "SHOW") / ROLE / UNKNOWN.
  - Branches: **explicit** (≥1 STAGE, 0 UNKNOWN → `stages`=STAGE tokens, `cleaned`=ROLE tokens + tail, `unrecognizedRestriction=false`); **malformed** (≥1 STAGE, ≥1 UNKNOWN → `stages`=[], `unrecognizedRestriction=true`, `cleaned`= ALL non-stage tokens [role+unknown] + tail); **role clause** (0 STAGE → `stages`=[], `unrecognizedRestriction=false`, `cleaned`=roleCell unchanged).
  - Note `WorkPhase` order for `stages` follows appearance order in the cell.
  - `consumedOnlyClause`: set `true` whenever a trailing `ONLY`/`ONLY***` marker (or the full-4 `ONLY\*{0,3}`) was matched and stripped — i.e. the clause presented as an ONLY-clause, EVEN in the malformed branch. This is what tells crew.ts the `***` was already accounted for (spec §9). A pure role clause with NO `ONLY` marker (`- LEAD***`) leaves it `false` so the existing bare-`***` UNKNOWN_DAY_RESTRICTION path still fires.

- [ ] **Step 4: Run to verify it passes.** `pnpm test tests/parser/stageClause.test.ts` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add lib/parser/stageClause.ts tests/parser/stageClause.test.ts
git commit --no-verify -m "feat(parser): token-level parseStageClause grammar (subset/reordered stage restrictions)"
```

### Task B2: Wire `extractStageRestriction` to the grammar (return `{restriction, warnings}`)

**Files:**
- Modify: `lib/parser/personalization.ts` (`extractStageRestriction:158-168` → delegates to `parseStageClause`; share the tokenizer with `extractRoleFlags`). Update all call sites to the new return shape.
- Test: `tests/parser/stageClause.test.ts` / a personalization test (extend)

**Interfaces:**
- Consumes: `parseStageClause` (B1).
- Produces: `extractStageRestriction(roleCell): { restriction: StageRestriction; warnings: ParseWarning[] }`.

- [ ] **Step 1: Write the failing test** — `extractStageRestriction` returns explicit restriction with no warning; malformed returns `{kind:"none"}` restriction + a `UNKNOWN_STAGE_RESTRICTION` warning; role clause returns `{kind:"none"}` + no stage warning:

```ts
import { extractStageRestriction } from "@/lib/parser/personalization";
it("extractStageRestriction: explicit → restriction, no warning", () => {
  const r = extractStageRestriction("Set / Strike ONLY");
  expect(r.restriction).toEqual({ kind: "explicit", stages: ["Set", "Strike"] });
  expect(r.warnings).toEqual([]);
});
it("extractStageRestriction: malformed → none + UNKNOWN_STAGE_RESTRICTION", () => {
  const r = extractStageRestriction("Set / Rehearsal ONLY");
  expect(r.restriction).toEqual({ kind: "none" });
  expect(r.warnings.map((w) => w.code)).toContain("UNKNOWN_STAGE_RESTRICTION");
});
it("extractStageRestriction: role clause → none + no stage warning", () => {
  const r = extractStageRestriction("Rehearsal ONLY");
  expect(r.restriction).toEqual({ kind: "none" });
  expect(r.warnings.map((w) => w.code)).not.toContain("UNKNOWN_STAGE_RESTRICTION");
});
```
(`UNKNOWN_STAGE_RESTRICTION` need not be a registered catalog code yet for this unit — the warning object carries a `code` string; the catalog lockstep is Task B3. If the `ParseWarning` code type is a union, add the literal to that union here and note it.)

- [ ] **Step 2: Run to verify it fails.** `pnpm test tests/parser/stageClause.test.ts` → FAIL.

- [ ] **Step 3: Implement.** Rewrite `extractStageRestriction` to call `parseStageClause`, map `stages.length>0` → `{kind:"explicit", stages}`, else `{kind:"none"}`; when `unrecognizedRestriction` push a `UNKNOWN_STAGE_RESTRICTION` warning (blockRef stamped later in crew.ts); pass through `consumedOnlyClause` on the result. Update every call site of `extractStageRestriction` (grep `extractStageRestriction(` — `crew.ts` and any tests) to destructure `{restriction, warnings, consumedOnlyClause}`. Route `cleaned` into `extractRoleFlags` so typo-roles autocorrect and `RIGGER` surfaces as `UNKNOWN_ROLE_TOKEN` (spec §3.2 malformed branch).

- [ ] **Step 4: Run.** `pnpm test tests/parser/` → PASS (existing stage-filter tests updated to the new return shape as needed — update them to the new contract, verifying each, per the "behavior change → update old-behavior tests" rule).

- [ ] **Step 5: Commit.**
```bash
git add lib/parser/personalization.ts lib/parser/blocks/crew.ts tests/
git commit --no-verify -m "feat(parser): extractStageRestriction delegates to parseStageClause, returns warnings"
```

### Task B3: Register `UNKNOWN_STAGE_RESTRICTION` across all §12.4 + data-gap touchpoints

**Files:**
- Modify: master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4 (add the row; do NOT run prettier on the master spec).
- Regenerate: `pnpm gen:spec-codes` → `lib/messages/__generated__/spec-codes.ts`; `pnpm gen:internal-code-enums` → `lib/messages/__generated__/internal-code-enums.ts`.
- Modify: `lib/messages/catalog.ts` (add the runtime row — fields `code, dougFacing, crewFacing?, followUp, helpfulContext, title, longExplanation, helpHref`; OMIT `audience` [Doug-facing default] and `resolution` unless the row needs auto-resolve — mirror `UNKNOWN_ROLE_TOKEN:1161`).
- Modify: `lib/parser/dataGaps.ts` — add `{ code: "UNKNOWN_STAGE_RESTRICTION", label: "unrecognized stage restriction" }` to `GAP_CLASSES` (`:30-53`); add `UNKNOWN_STAGE_RESTRICTION` to `OPERATOR_ACTIONABLE_ANCHORED` (`:160-181`).
- Modify: `lib/drive/showDayTimeAnchors.ts` — add `UNKNOWN_STAGE_RESTRICTION` to the crew-role `blockRef.name` resolution branch (`:129-135`).
- Modify: `tests/parser/dataGapsClassCompleteness.test.ts` — `DATA_GAP_CODES.size` `.toBe(22)`→`.toBe(23)` (`:193`); `ALL_PERSISTED_WARNING_CODES.size` `.toBe(42)`→`.toBe(43)` (`:197`); partition comment `22/7/2/11`→`23/7/2/11` (`:192`, `:35`).
- Test: `tests/messages/codes.test.ts` (x1 parity — auto-checks once all three lockstep surfaces agree); add a help-family + anchor-resolver assertion.

**Interfaces:** Consumes the B2 warning emission.

- [ ] **Step 1: Write the failing assertions.** (a) In `tests/parser/dataGapsClassCompleteness.test.ts`, bump the partition sizes (this test now FAILS because the code isn't yet in `GAP_CLASSES`). (b) Add a help-family + anchor test:
```ts
import { familyFor } from "@/app/help/errors/_families";
import { OPERATOR_ACTIONABLE_ANCHORED } from "@/lib/parser/dataGaps";
it("UNKNOWN_STAGE_RESTRICTION auto-groups under crew-schedule (no _families.ts edit)", () => {
  expect(familyFor("UNKNOWN_STAGE_RESTRICTION").id).toBe("crew-schedule");
});
it("UNKNOWN_STAGE_RESTRICTION is operator-actionable-anchored", () => {
  expect(OPERATOR_ACTIONABLE_ANCHORED).toContain("UNKNOWN_STAGE_RESTRICTION");
});
```

- [ ] **Step 2: Run to verify it fails.** `pnpm test tests/parser/dataGapsClassCompleteness.test.ts tests/messages/codes.test.ts` → FAIL (code not registered; x1 parity mismatch).

- [ ] **Step 3: Implement the lockstep** in ONE commit, in order: (a) add the §12.4 prose row (copy the format of the `UNKNOWN_ROLE_TOKEN`/`UNKNOWN_DAY_RESTRICTION` rows at `:2884-2887` + the long-explanations block `~:3179`); (b) `pnpm gen:spec-codes` + commit the regen; (c) add the `catalog.ts` row (Doug copy per spec §7 item 3); (d) `pnpm gen:internal-code-enums` + commit; (e) `dataGaps.ts` `GAP_CLASSES` + `OPERATOR_ACTIONABLE_ANCHORED`; (f) `showDayTimeAnchors.ts` branch; (g) the completeness partition bumps.

- [ ] **Step 4: Run the full messages + parser gate.** `pnpm test tests/messages/ tests/parser/dataGapsClassCompleteness.test.ts tests/help/` → PASS.

- [ ] **Step 5: Commit** (single lockstep commit).
```bash
git add docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/ lib/parser/dataGaps.ts lib/drive/showDayTimeAnchors.ts tests/
git commit --no-verify -m "feat(messages): register UNKNOWN_STAGE_RESTRICTION (§12.4 lockstep + data-gap + anchor)"
```

### Task B4: Emit `UNKNOWN_STAGE_RESTRICTION` from crew stamping + fail-open schedule

**Files:**
- Modify: `lib/parser/blocks/crew.ts` — (a) stamp the `UNKNOWN_STAGE_RESTRICTION` warning with a crew `blockRef` at the stage-restriction site, mirroring the `UNKNOWN_ROLE_TOKEN` stamping `:326-334`; (b) thread `consumedOnlyClause` into the pre-existing triple-asterisk guard (`:347-352`), adding `&& !stageResult.consumedOnlyClause` so a consumed `ONLY***` stage clause does NOT also fire `UNKNOWN_DAY_RESTRICTION`/`unknown_asterisk` (spec §9). Confirm the fail-open outcome: a malformed clause → `{kind:"none"}` restriction → the crew member sees the WHOLE show (spec §9), NOT zero-days and NOT an unknown-date restriction.
- Test: `tests/parser/blocks/crew.test.ts` (extend) + a `stageSchedule` integration assertion

**Interfaces:** Consumes B2/B3 (`extractStageRestriction` now returns `consumedOnlyClause`).

- [ ] **Step 1: Write the failing integration tests** — (a) `Set / Rehearsal ONLY` → `UNKNOWN_STAGE_RESTRICTION` stamped with crew `blockRef.name`, whole-show; (b) **`Set / Rehearsal ONLY***` → ONLY `UNKNOWN_STAGE_RESTRICTION` (NOT `UNKNOWN_DAY_RESTRICTION`), date restriction stays `{kind:"none"}` (not `unknown_asterisk`), whole-show** (the consumedOnlyClause guard):
```ts
it("malformed stage clause → UNKNOWN_STAGE_RESTRICTION + whole-show (fail-open)", () => {
  const md = /* a v2 crew fixture row with role cell 'Set / Rehearsal ONLY' */;
  const parsed = parseCrew(md, "v2");
  const codes = parsed.warnings.map((w) => w.code);
  expect(codes).toContain("UNKNOWN_STAGE_RESTRICTION");
  const warn = parsed.warnings.find((w) => w.code === "UNKNOWN_STAGE_RESTRICTION");
  expect(warn?.blockRef?.name).toBeTruthy();
});
it("malformed ONLY*** clause: only UNKNOWN_STAGE_RESTRICTION, no UNKNOWN_DAY_RESTRICTION (consumedOnlyClause)", () => {
  const md = /* a v2 crew fixture row with role cell 'Set / Rehearsal ONLY***' */;
  const codes = parseCrew(md, "v2").warnings.map((w) => w.code);
  expect(codes).toContain("UNKNOWN_STAGE_RESTRICTION");
  expect(codes).not.toContain("UNKNOWN_DAY_RESTRICTION"); // suppressed by !consumedOnlyClause
});
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.

- [ ] **Step 3: Implement** the crew.ts stamping (mirror `:326-334`), threading `warnings` + `consumedOnlyClause` from `extractStageRestriction`. Change the triple-asterisk guard condition (`crew.ts:347-352`) from `hasTripleAsterisk(roleRaw) && dateRestriction.kind==="none" && stageRestriction.kind==="none"` to ALSO require `&& !stageResult.consumedOnlyClause`. Verify `effectiveViewerDateRestriction` (`stageSchedule.ts:48-67`) with a `{kind:"none"}` stage restriction yields the whole show; ensure the malformed clause routes to `{kind:"none"}` (per B2) so neither the zero-days trap (`:66`) nor the `unknown_asterisk` path is hit.

- [ ] **Step 4: Run.** `pnpm test tests/parser/` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add lib/parser/blocks/crew.ts tests/parser/blocks/crew.test.ts
git commit --no-verify -m "feat(parser): stamp UNKNOWN_STAGE_RESTRICTION on crew role cell (fail-open whole-show)"
```

---

## Part C — Short-header typo tolerance (CREW/TECH)

### Task C1: `CREW`/`TECH` short vocab behind the field-band gate

**Files:**
- Modify: `lib/parser/sectionHeaderNormalize.ts` (add `SHORT_SECTION_VOCAB = ["CREW","TECH"]`, `SHORT_SECTION_VOCAB_EXCLUDE = ["CREWS","TECHS"]`; wire into `normalizeSectionHeaders:44` behind the existing `countFieldHeaderWords ≥ 1` field-band gate `:73` + `noExactSpellingElsewhere:76`, with `minLen: 4`).
- Test: `tests/parser/sectionHeaderNormalize.test.ts` (extend)

**Interfaces:** Consumes the existing `typoGate` / `countFieldHeaderWords` machinery.

- [ ] **Step 1: Write the failing test** (spec §4 + §9 `minLen:4` preempt):
```ts
it("TCEH → TECH when field-band corroborates; CREW/TECH plurals excluded", () => {
  // header row 'TCEH' with >=1 SECTION_FIELD_HEADER_WORD beneath → normalized to TECH
  expect(normalizeShortHeader("TCEH", /*fieldBand*/ 1)).toBe("TECH");
  expect(normalizeShortHeader("CRWE", 1)).toBe("CREW");
  expect(normalizeShortHeader("CREWS", 1)).toBe("CREWS"); // EXCLUDE plural
  expect(normalizeShortHeader("TCEH", 0)).toBe("TCEH");   // no field band → no correction
});
```
(Use the actual `normalizeSectionHeaders` entry + a fixture-shaped input if there is no isolated helper; adapt the assertion to the real signature — see `sectionHeaderNormalize.ts:44`.)

- [ ] **Step 2: Run to verify it fails.** → FAIL.

- [ ] **Step 3: Implement** — add the short vocab + EXCLUDE and route `CREW`/`TECH` through the same typo gate as the long vocab, with `minLen:4` and the field-band + `noExactSpellingElsewhere` + EXCLUDE compensating gates (spec §4.2/§4.3). Do NOT add `HOTEL`/`VENUE`/`DATES` (spec §9 — no field-band signal / already-loud MI-3).

- [ ] **Step 4: Run.** `pnpm test tests/parser/sectionHeaderNormalize.test.ts` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add lib/parser/sectionHeaderNormalize.ts tests/parser/sectionHeaderNormalize.test.ts
git commit --no-verify -m "feat(parser): CREW/TECH short-header typo tolerance behind field-band gate"
```

---

## Final tasks

### Task F1: Full-suite green + static gates

- [ ] **Step 1:** `pnpm test` (FULL suite) → all green. Triage any failure env/psql-vs-real (a new §12.4 code touches x1/x2/help/codes-coverage).
- [ ] **Step 2:** `pnpm typecheck` → clean (vitest strips types; `next build`/quality-tsc catches TS errors).
- [ ] **Step 3:** `pnpm lint` → clean (CI `quality` runs eslint incl. canonical-tailwind — N/A here but run it).
- [ ] **Step 4:** `pnpm format:check` → clean (`--no-verify` bypassed the prettier hook; CI checks it). If it flags files, `pnpm format` the NON-spec files only (NEVER prettier the master spec — mangles §12.4).
- [ ] **Step 5:** No commit unless a gate required a fix; if so, commit `chore(parser): satisfy typecheck/lint/format gates`.

### Task F2: Plan self-review + cross-model adversarial review

- [ ] **Step 1: Self-review** the whole diff against the spec (spec-coverage: every §2/§3/§4 requirement maps to a task; §7 touchpoint checklist fully covered; §8 tests all present).
- [ ] **Step 2: Adversarial review (cross-model)** — invoke the `adversarial-review` skill → Codex, REVIEWER ONLY, iterate to APPROVE (no round budget). Class-sweep every finding; ship a structural pin after 3+ same-vector rounds.

### Task F3: Push → real CI green → merge → sync main

- [ ] **Step 1:** Push the branch; open the PR (`gh pr create`).
- [ ] **Step 2:** Wait for REAL GitHub Actions green (`gh pr checks <PR#> --watch`; confirm `mergeStateStatus == CLEAN`, not a SHA false-green). Reconcile DIRTY/behind-base before claiming green.
- [ ] **Step 3:** `gh pr merge <PR#> --merge` (merge commit — squash/rebase disabled).
- [ ] **Step 4:** Fast-forward local `main`; verify `git rev-list --left-right --count main...origin/main` == `0  0`.

---

## Self-review checklist (run before adversarial review)

1. **Spec coverage:** Part A → spec §2 (A1-A4). Part B → spec §3 + §7 (B1-B4). Part C → spec §4 (C1). §8 tests → A1/A2/A4 truth-table + corpus, B1/B2 grammar, B4 crew integration, C1 typo. §12.4 lockstep + data-gap + anchor → B3. ✓
2. **Placeholder scan:** every code step shows test code or cites the exact spec section for the body. The one fixture-shaped input (B4 Step 1, C1 Step 1) is marked to adapt to the real signature — acceptable (the exact fixture is constructed at implementation time from the cited parser entry).
3. **Type consistency:** `extractStageRestriction` return shape changes in B2 (consumed by B4/crew.ts) — flagged in both tasks. `RoomHeaderModel`/`isRoomHeader` signatures consistent across A1-A4.
4. **Type consistency, cont.:** the room truth-table is **Task A4** (Part A has four tasks A1-A4; no A5). ✓
