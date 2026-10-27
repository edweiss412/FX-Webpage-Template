# Warning card fixes — Tasks 1-5: pure and lib changes

Read 00-overview.md first (Global Constraints, sweeps, harness checklist). Every task: RED observed, GREEN, the listed suites green, one commit.

<!-- tasks: depth=2 red-contract -->

## Task 1 — The inline guest emitter keeps its names (`readAs`)

<!-- task: red=`pnpm exec vitest run tests/parser/blocks/hotels.inlineGuestAmbiguity.test.ts` red-state=authored red-target=`lib/parser/warnings.ts:657` why=`emitInlineHotelGuestAmbiguity writes resolution with resolvable false and reason raw-not-guest-scoped and nothing else on this line, discarding the parsedNames it receives, so the new case expecting resolution.readAs.names to equal the parsed reservation names fails until this line carries readAs` ac=AC-4 -->

What is red and why: the new case expects `resolution.readAs` on every producing exit; the emitter drops `parsedNames` at `lib/parser/warnings.ts:657`.

Claims AC-4 (declared in 00-overview.md, Acceptance criteria).

**Files:**
- Modify: `lib/parser/types.ts:55-64` (non-resolvable variant of `UseRawResolution`)
- Modify: `lib/parser/warnings.ts:657` (`emitInlineHotelGuestAmbiguity`)
- Modify: `tests/parser/blocks/hotels.inlineGuestAmbiguity.test.ts`

**Interfaces:**
- Produces: on the `resolvable: false` variant, `readAs?: { kind: "hotels"; names: string[] }`, set ONLY by `emitInlineHotelGuestAmbiguity` (spec §5.2, comment text verbatim from the spec). Consumed by Task 4 (`weReadGuestsText`) and Task 10.

- [ ] **Step 1: RED.** In `tests/parser/blocks/hotels.inlineGuestAmbiguity.test.ts`:
  - In `describe("fires once per producing exit")`, change the `resolution` assertion from `toEqual({ resolvable: false, reason: "raw-not-guest-scoped" })` to `toMatchObject({ resolvable: false, reason: "raw-not-guest-scoped" })` (the shape now has one more field).
  - Add `it("readAs carries the reservation's own names on every producing exit")`: a plain `for` loop (not `it.each`, so the premise never sits in a zero-case callback) over the same three cells the `it.each` uses, body as below (strict-TS checked at plan time; `"readAs" in r` compiles before and after Step 2's type change):

```ts
import { expect } from "vitest";
import { parseHotels } from "@/lib/parser/blocks/hotels";
import { newAggregator } from "@/lib/parser/warnings";
import { premiseHolds } from "@/tests/_shared/premise";

const inline = (cell: string) => `| Hotel Reservations | ${cell} |`;
const CELLS = [
  "Four Seasons Fort Lauderdale Doug--- 103317 Carl –- 103316 Eric W--- 110525",
  "Hyatt Regency Eric Weiss - 110525",
  "Four Seasons Chicago Eric Weiss 2004173 In on the 6th out on the 10th",
] as const;
const parse = (cell: string) => {
  const agg = newAggregator();
  const hotels = parseHotels(inline(cell), "v2", agg);
  return { hotels, warnings: agg.warnings.filter((w) => w.code === "HOTEL_GUEST_SPLIT_AMBIGUOUS") };
};

premiseHolds(
  "at least one producing exit parses a non-empty names list",
  CELLS.some((c) => parse(c).hotels.some((h) => h.names.length > 0)),
);
for (const cell of CELLS) {
  const { hotels, warnings } = parse(cell);
  expect(warnings).toHaveLength(1);
  const w = warnings[0];
  if (w === undefined) throw new Error("no HOTEL_GUEST_SPLIT_AMBIGUOUS warning");
  const idx = w.blockRef?.index;
  if (idx === undefined || !Number.isSafeInteger(idx)) throw new Error("blockRef.index is not a safe integer");
  const reservation = hotels[idx];
  if (reservation === undefined) throw new Error("no reservation at blockRef.index");
  expect(w.resolution).toEqual({
    resolvable: false,
    reason: "raw-not-guest-scoped",
    readAs: { kind: "hotels", names: reservation.names },
  });
  const r = w.resolution;
  const readAs: unknown = r !== undefined && "readAs" in r ? r.readAs : undefined;
  if (typeof readAs !== "object" || readAs === null || !("names" in readAs)) throw new Error("readAs.names absent");
  expect(readAs.names).not.toBe(reservation.names); // the emitter copies (spec §5.2)
}
```

  - Failure modes caught: names discarded; names that differ from what the reservation shows; an aliased array.
  Run the red command: the new case fails (`readAs` absent); the edited `it.each` passes.
- [ ] **Step 2: GREEN.** Add the field to the variant (spec §5.2 block, verbatim) and set `readAs: { kind: "hotels", names: [...params.parsedNames] }` at `warnings.ts:657`. Update the function's doc comment to say the reading is stored for display only.
- [ ] **Step 3: green.** The red command passes; also `pnpm exec vitest run tests/components/UseRawControl.test.tsx tests/sync/useRawOverlay.test.ts tests/admin/warningFixAffordance.test.tsx` (consumers that narrow `resolvable: true` are untouched).
- [ ] **Step 4: commit** `feat(parser): keep the guest names on the inline hotel split warning`.

## Task 2 — Venue-with-no-address links the empty value cell, on both venue layouts

<!-- task: red=`pnpm exec vitest run tests/drive/venueAddressAnchor.test.ts tests/drive/showDayTimeAnchors.test.ts tests/parser/parseWarningDeepLinkRender.test.tsx` red-state=authored red-target=`lib/drive/showDayTimeAnchors.ts:71` why=`LINK_ONLY_ANCHORED ends at PULL_SHEET_ON_ARCHIVED_TAB on this line, so VENUE_ADDRESS_MISSING is skipped at the CELL_ANCHORED_CODES gate, and Step 1 lands venueAddressAnchor as a stub whose two exports return null, so the suite collects and the new cases expecting INFO value cells on the 3-column and 2-column workbooks, the region fallback on the negatives, and the fourteen-code membership pins all fail until the code joins the set and a dispatch branch reads the new anchor` ac=AC-3 -->

What is red and why: `VENUE_ADDRESS_MISSING` is in no anchor set, so `attachSourceCellAnchors` never gives it a `sourceCell`; no venue-block anchor exists, and the UNKNOWN_FIELD scan cannot see the 3-column layout (`lib/drive/unknownFieldAnchors.ts:81` skips blank-col0 rows).

Claims AC-3 (declared in 00-overview.md, Acceptance criteria).

**Files:**
- Create: lib/drive/venueAddressAnchor.ts (spec §4.2 item 3; the generic UNKNOWN_FIELD scan in `lib/drive/unknownFieldAnchors.ts` is NOT edited)
- Modify: `lib/drive/showDayTimeAnchors.ts:65-72` (`LINK_ONLY_ANCHORED`), `lib/drive/showDayTimeAnchors.ts:168-183` (`WarningAnchorSources.venueAddress`), and a branch in `attachSourceCellAnchors` immediately before `} else if (Object.hasOwn(CODE_TO_REGION, w.code)) {`
- Modify: `lib/sync/attachWarningAnchors.ts:82-89` (populate `venueAddress`)
- Create: tests/drive/venueAddressAnchor.test.ts
- Modify: `tests/drive/showDayTimeAnchors.test.ts:636-645`, `tests/parser/parseWarningDeepLinkRender.test.tsx:36-45`

**Interfaces (typechecked at plan time):**
- `export function resolveVenueAddressCell(blocks: readonly SynthesizedBlock[], titleToGid: ReadonlyMap<string, number>): SourceAnchor | null` and `export function extractVenueAddressAnchor(buffer: ArrayBuffer, titleToGid: ReadonlyMap<string, number>): SourceAnchor | null` (= `resolveVenueAddressCell(synthesizeBlocksFromXlsx(buffer).blocks, titleToGid)`), in lib/drive/venueAddressAnchor.ts. The rule is spec §4.2 item 3 verbatim: tab = first of `REGION_ANCHOR_SPEC.venue.tabs` in the gid map and `SOURCE_LINK_ALLOWLIST`; venue block(s) = grid blocks on that tab with a row whose `cells[0]` matches `REGION_ANCHOR_SPEC.venue.header` as-is (no trim, as `headerBlock` tests it), rows from that header row down, `absRow !== null`; address row = first `i` in `[0, 1]` with `resolveAlias(cells[i] ?? "") === "venue.address"`; link only when exactly one address row exists and `!/\S/.test(cells[i + 1] ?? "")`, at `encode_cell({ r: absRow, c: absCol0 + i + 1 })`, scope `"cell"`; else `null`. Header and tabs are read from `REGION_ANCHOR_SPEC`, never retyped. **No `.trim()`, `.toLowerCase()` or their variants in this module:** `tests/admin/no-inline-email-normalization.test.ts:95` scans every `lib/drive` file and rejects them unexempted; `/\S/` (the idiom at `lib/drive/sourceAnchors.ts:109-112`) and `resolveAlias` (which trims and lowercases inside `lib/parser`) need no exemption line.
- `WarningAnchorSources.venueAddress?: SourceAnchor | null`; dispatch `cell = sources.venueAddress ?? sources.region["venue"] ?? null;`.

- [ ] **Step 1: stub.** Create lib/drive/venueAddressAnchor.ts with both exports returning `null` (the documented wrong answer: "no venue-address anchor"). It compiles and collects; nothing imports it yet.
- [ ] **Step 2: RED.** tests/drive/venueAddressAnchor.test.ts. Shared helpers: `fixtureBuffer` and an independent `cellOf(wb, tab, text)` (the INFO cell whose trimmed text equals `text`; premise exactly one hit), both copied in shape from `tests/drive/unknownFieldAnchors.test.ts:57-61` and `tests/drive/unknownFieldAnchors.test.ts:346-358`; `rewrite(wb)` writes a workbook back to an `ArrayBuffer` as that file's `buildWorkbook` does. Expected cells are DERIVED (label cell's row, column + 1), never typed; the plan-time probe values in 00-overview.md are for the reader only.
  1. **3-column layout, every emitting workbook.** A plain `for` loop over `fintech.xlsx`, `rpas.xlsx`, `fixed-income.xlsx` with an unconditional premise above it that the list is non-empty. Per workbook: premise the parse emits exactly one `VENUE_ADDRESS_MISSING`; `label = cellOf(wb, "INFO", "VENUE ADDRESS")`; premise the label sits in column B (the scope row's second column) and the cell to its right is empty or absent; `extractVenueAddressAnchor(buffer, gids)` equals `{ title: "INFO", gid: gids.get("INFO"), a1: <label row, column + 1>, scope: "cell" }`.
  2. **2-column layout.** `east-coast.xlsx` with the cell right of `cellOf(wb, "INFO", "Hotel Address")` deleted (premise: it held a non-empty string): the anchor is that cell.
  3. **Negatives (fallback), one test each, each beside its firing twin:** unedited `east-coast.xlsx` (one address row, non-empty value) → `null`; `fintech.xlsx` with the label one row below `VENUE ADDRESS` (premise: it reads `LOADING DOCK`) rewritten to `VENUE ADDRESS`, so the venue block holds two address rows (premise via `cellOf`-style scan: two INFO cells read `VENUE ADDRESS`) → `null`.
  4. **Pure rule on constructed blocks** (`GridBlock` literals): no gid for `INFO` → `null`; a block on a tab outside `SOURCE_LINK_ALLOWLIST` → `null`; a block with no `VENUE` header row (the v4 `VENUE NAME`-opened table, L1) → `null`; a row whose `cells[0]` and `cells[1]` both resolve uses `i = 0`; a row with `absRow: null` is skipped.
  5. **Ingestion seam.** For blanked east-coast and for `fintech.xlsx`: `parseSheet(synthesizeMarkdownFromXlsx(buffer).markdown, …)` then `attachWarningAnchors(...)`; the one `VENUE_ADDRESS_MISSING`'s `sourceCell` equals case 1 / case 2's expectation. Then a second region-only `attachSourceCellAnchors(parsed.warnings, { showDay: [], crewRole: [], region: { venue: { title: "INFO", gid: 0, a1: "A1:C20" } } })` leaves `sourceCell.a1` unchanged (never-demote, `lib/drive/showDayTimeAnchors.ts:314`).
  6. **Fallback through the seam.** The two-address-row fintech variant: premise exactly one `VENUE_ADDRESS_MISSING`; its `sourceCell.a1` contains a colon and `XLSX.utils.decode_range` of it contains the `cellOf(wb, "INFO", "VENUE")` header cell (the venue region).
  In `tests/drive/showDayTimeAnchors.test.ts:636-645` add `"VENUE_ADDRESS_MISSING"` to `LINK_ONLY` and retitle "fourteen codes"; in `tests/parser/parseWarningDeepLinkRender.test.tsx` add it to the `extra` literal. Run the red command: the suite collects; cases 1, 2 and 5, the positive halves of case 4, and both pins fail on their assertions (the stub returns `null`; the code is in no set); the negatives of cases 3, 4 and 6 pass against the stub, which is what makes them differential twins.
- [ ] **Step 3: GREEN.** Implement the module, add the source field, populate it in `attachWarningAnchors` with `venueAddress: safe(() => extractVenueAddressAnchor(bytes, gids), null)`, add the code to `LINK_ONLY_ANCHORED` (not `OPERATOR_ACTIONABLE_ANCHORED`, spec §4.2 item 1), add the dispatch branch. `applyParseResult`'s region-only pass and `attachArchivedTabAnchors` are not edited (they pass no `venueAddress`).
- [ ] **Step 4: green.** The red command; plus `pnpm exec vitest run tests/admin/no-inline-email-normalization.test.ts tests/drive/unknownFieldAnchors.test.ts tests/sync/attachWarningAnchors.test.ts tests/parser/operatorActionableWarnings.test.ts tests/parser/venueAddressMissing.test.ts tests/parser/waveCodesSourceCell.test.ts tests/sync/sourceAnchorsPipeline.test.ts` (the second proves the generic scan is untouched); then the walker cover (00-overview.md, "Walker cover"), because this task adds a `lib/drive` source file and a test file.
- [ ] **Step 5: commit** `feat(sync): link the venue-with-no-address card to the empty address cell on both venue layouts`.

## Task 3 — Route archived-tab warnings to Pack list

<!-- task: red=`pnpm exec vitest run tests/admin/step3SectionStatus.test.ts` red-state=authored red-target=`lib/admin/step3SectionStatus.ts:50` why=`KIND_TO_SECTION ends at financials on this line with no pull_sheet_archived_tab key, so sectionForWarning returns null for both archived-tab codes and the new cases expecting packlist from sectionForWarning and warningsBySection fail until the key is added` ac=AC-6 -->

What is red and why: `pull_sheet_archived_tab` is not a `KIND_TO_SECTION` key, so both archived-tab codes route to `warnings`.

Claims AC-6 (declared in 00-overview.md, Acceptance criteria).

**Files:**
- Modify: `lib/admin/step3SectionStatus.ts:28-51`
- Modify: `tests/admin/step3SectionStatus.test.ts`; repairs in the suites listed in Step 3 only where they encoded the old routing

**Interfaces:**
- Produces: `KIND_TO_SECTION.pull_sheet_archived_tab === "packlist"`. Consumed by Task 13 (card body), Task 17 (`Go to Pack list`).

- [ ] **Step 1: RED.** In `describe("sectionForWarning")`: for each of `PULL_SHEET_ON_ARCHIVED_TAB` and `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` (built with `blockRef: { kind: "pull_sheet_archived_tab", name: "OLD GEAR" }`, the shape `lib/sync/pullSheetOverride.ts:118-143` emits), `sectionForWarning` returns `"packlist"`. In `describe("warningsBySection")`: with `packlist` in the rendered set, both land in `packlist`; with `packlist` absent they land in `warnings` (the existing fallback, asserted in the same test). Failure caught: the content-changed code missed.
- [ ] **Step 2: GREEN.** Add `pull_sheet_archived_tab: "packlist",` after `gear_packlist` (keep the pack-list keys together).
- [ ] **Step 3: green, then reconcile pins.** Run `pnpm exec vitest run tests/admin/step3SectionStatus.test.ts tests/parser/sectionKind.test.ts tests/parser/fuzz/groundTruth.test.ts tests/components/admin/review/routedWarningsGate.test.tsx tests/components/admin/review/sectionFreshness.test.ts tests/components/admin/review/sectionFreshnessProjection.probe.test.tsx tests/components/admin/wizard/step3ReviewSections.test.tsx tests/lib/admin/warningAttention.test.ts tests/dev/attentionScenariosWarnings.test.ts tests/components/admin/dataQualityBadgeArchivedTab.test.tsx tests/admin/deriveActiveArchivedTabNames.test.ts tests/components/admin/wizard/Step3ReviewModal.test.tsx`. A failure is repaired only when it pins a consequence the spec §7.2 table names (attention row second line `Pack list`; Pack list flagged; Warnings count down by one; published card in Pack list's extras); each repaired assertion cites `spec §7.2` in a comment. Any other failure stops the task.
- [ ] **Step 4: commit** `feat(onboarding): route archived pull sheet warnings to Pack list`.

## Task 4 — The reading-display module

<!-- task: red=`pnpm exec vitest run tests/lib/admin/warningReadingDisplay.test.ts` red-state=authored red-target=`components/admin/UseRawControl.tsx:55` why=`the four use-raw codes live only in this module-local IN_SCOPE set, and Step 1 lands lib/admin/warningReadingDisplay as a stub whose sets are empty and whose helpers return null or false, so the suite collects and every behavioral case (caps, name lists, previews, readingShown, isJudgmentCall, the set sizes) fails until the helpers are implemented and IN_SCOPE moves into USE_RAW_CODES` ac=AC-4 -->

What is red and why: no module exports the scope set or the display helpers; `IN_SCOPE` is private to `UseRawControl.tsx:55`.

Claims AC-4 (declared in 00-overview.md, Acceptance criteria).

**Files:**
- Create: lib/admin/warningReadingDisplay.ts (pure, client-safe: imports only `@/lib/parser/types` (type), `@/lib/dataQuality/ignorableSnippet`)
- Modify: `components/admin/UseRawControl.tsx:54-60` (delete `IN_SCOPE`, import `USE_RAW_CODES`; `deriveUseRawControlState` reads it)
- Create: tests/lib/admin/warningReadingDisplay.test.ts

**Interfaces (all exported from lib/admin/warningReadingDisplay.ts):**
- `SHEET_SAYS_CAP = 160`, `WE_READ_NAMES_CAP = 6`, `CASE_PREVIEWS_CAP = 3`, `CASE_PREVIEW_CHARS = 40`
- `USE_RAW_CODES: ReadonlySet<string>` (the four codes, moved verbatim)
- `HOTEL_RESERVATION_JUDGMENT_CODES: ReadonlySet<string>` = `HOTEL_GUEST_SPLIT_AMBIGUOUS`, `HOTEL_ADDRESS_SPLIT_AMBIGUOUS`, `HOTEL_INLINE_GROUP_OWN_HOTEL`, `HOTEL_INLINE_GROUP_HOTEL_SUSPECTED` (spec §5.1; home is a plan decision, builder's call 3)
- `isJudgmentCall(w: Pick<ParseWarning, "severity" | "code">): boolean` = `isWarnSeverity(w) && isAmbiguityCode(w.code)`: the one spelling of "this row is a judgment call" (spec §3.2, §6.2, §6.4 all use it), so the card kind, the Accept wording and the Accepted partition cannot drift (spec §1.4, no copy fork). Imports `isWarnSeverity` (`lib/parser/dataGaps.ts:277`) and `isAmbiguityCode`.
- `sheetSaysText(raw: unknown): string | null`, `weReadGuestsText(readAs: unknown): string | null`, `casePreviewsText(previews: unknown): string | null`, `readingShown(w: ParseWarning): boolean` — definitions in spec §5.6 and §7.3. `casePreviewsText` returns the previews part only (`‘AUDIO 1’, ‘VIDEO RACK’, ‘(no header text)’ and 2 more`); the card prints the `Cases ` label. A non-string preview entry is treated as blank (plan decision: the shown count stays the case count).
- Consumed by Tasks 7, 9, 10, 11, 12, 13, 16, 17.

- [ ] **Step 1: stub.** Create lib/admin/warningReadingDisplay.ts exporting every Interfaces name: the four caps at their spec values, `USE_RAW_CODES` and `HOTEL_RESERVATION_JUDGMENT_CODES` as empty sets, every function returning `null` (text helpers) or `false` (predicates). `UseRawControl.tsx` is not touched yet.
- [ ] **Step 2: RED.** tests/lib/admin/warningReadingDisplay.test.ts, every boundary derived from the imported caps:
  - `sheetSaysText`: `undefined`, `42`, `"   "` → `null`; `" a \n  b "` → `"a b"`; `"x".repeat(SHEET_SAYS_CAP)` unchanged; `"x".repeat(SHEET_SAYS_CAP + 1)` → `"x".repeat(SHEET_SAYS_CAP) + "…"`; `SHEET_SAYS_CAP - 1` unchanged.
  - `weReadGuestsText`: `null`, `"Eric"`, `{ kind: "rooms", names: [] }`, `{ kind: "hotels" }`, `{ kind: "hotels", names: "Eric" }` → `null`; `names: []` and `names: ["  ", ""]` → `no guests`; `[1, " Eric "]` → `1 guest: Eric`; `WE_READ_NAMES_CAP` names → `<cap> guests: a, b, …` with no "more"; `WE_READ_NAMES_CAP + 1` → `<cap+1> guests: <first cap joined ", ">, and 1 more`.
  - `casePreviewsText`: non-array and `[]` → `null`; three previews with one blank → all three quoted, blank as `(no header text)`; `CASE_PREVIEWS_CAP + 2` previews → first three ` and 2 more`; a preview of `CASE_PREVIEW_CHARS + 1` characters → first `CASE_PREVIEW_CHARS` + `…`; exactly `CASE_PREVIEW_CHARS` unchanged.
  - `readingShown`: each `USE_RAW_CODES` member with `resolvable: true` → true (loop over the set, premise `USE_RAW_CODES.size === 4` stated above the loop); a use-raw code with `{ resolvable: false, reason: "empty-raw" }` → false; with no `resolution` (legacy) → false; `HOTEL_GUEST_SPLIT_AMBIGUOUS` with `{ resolvable: false, reason: "raw-not-guest-scoped" }` and `rawSnippet: "Hyatt Eric"` → true, with `rawSnippet: "  "` → false; `CREW_COLUMN_POSITIONAL_FALLBACK` (judgment, not use-raw) → false.
  - `isJudgmentCall`: warn `CREW_COLUMN_POSITIONAL_FALLBACK` → true; warn `UNKNOWN_FIELD` → false; `CREW_COLUMN_POSITIONAL_FALLBACK` at severity `info` → false (one test, three rows).
  - Sets: `HOTEL_RESERVATION_JUDGMENT_CODES` and `USE_RAW_CODES` are each subsets of `AMBIGUITY_CODES`; `HOTEL_RESERVATION_JUDGMENT_CODES.size === 4`.
  Failure modes: off-by-one at each cap; a blank leaking as an empty name; a disabled use-raw state counted as a shown reading.
  Run the red command: the suite collects and every positive case fails on its assertion (empty sets, `null` text, `false` predicates); the `null`/`false` negatives pass, as differential twins.
- [ ] **Step 3: GREEN.** Implement the module; switch `UseRawControl.tsx` to `USE_RAW_CODES` (no behaviour change).
- [ ] **Step 4: green.** Red command, plus `pnpm exec vitest run tests/components/UseRawControl.test.tsx tests/lib/admin/activeWarningEntries.test.ts`; then the walker cover (00-overview.md), because this task adds a `lib/admin` source file and a test file.
- [ ] **Step 5: commit** `feat(admin): one module for the reading and preview display rules`.

## Task 5 — §12.4 catalog lockstep: three helpfulContext rows

<!-- task: red=`pnpm exec vitest run tests/messages/hotelAmbiguityCatalogCopy.test.ts tests/messages/_metaWarningCardCopy.test.ts tests/cross-cutting/codes.test.ts` red-state=authored red-target=`lib/messages/catalog.ts:1646` why=`the HOTEL_GUEST_SPLIT_AMBIGUOUS helpfulContext on this line still reads the pre-arc sentence and the two archived-tab rows still say Gear section, so the updated copy pin and the updated EXPECTED_HELPFUL_CONTEXT fixture fail until the catalog, the master spec appendix and the generated codes carry the new strings` ac=AC-6,AC-9 -->

What is red and why: the test-side copy (hotel pin, registry fixture) is updated first; the catalog still carries the old three strings.

Claims AC-6, AC-9 (declared in 00-overview.md, Acceptance criteria).

**Files (all in ONE commit, spec §9):**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3216`, `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3230`, `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3231` (helpfulContext yaml appendix inside §12.4)
- Regenerate: `lib/messages/__generated__/spec-codes.ts` via `pnpm gen:spec-codes`
- Modify: `lib/messages/catalog.ts:1646`, `lib/messages/catalog.ts:1807`, `lib/messages/catalog.ts:1823`
- Modify: `tests/messages/warningCardCopyRegistry.ts:238`, `tests/messages/warningCardCopyRegistry.ts:251`, `tests/messages/warningCardCopyRegistry.ts:253` (`EXPECTED_HELPFUL_CONTEXT`)
- Modify: `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:132`, `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:155`, `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:156` (§4.2 rows 12, 35, 36) and one dated amendment line after the control-references paragraph at `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:177`
- Modify: `tests/messages/hotelAmbiguityCatalogCopy.test.ts:48-50`
- Modify: `tests/messages/_metaWarningCardCopy.test.ts` (new guard case)

**Interfaces:** none (copy only). The three strings, verbatim: spec §5.7 (`HOTEL_GUEST_SPLIT_AMBIGUOUS`) and §7.5 (both archived rows).

- [ ] **Step 1: RED.** Update `hotelAmbiguityCatalogCopy.test.ts:48-50` and the three `EXPECTED_HELPFUL_CONTEXT` rows to the new strings. Add to `_metaWarningCardCopy.test.ts` (strict-TS checked at plan time; `isMessageCode` is the type guard at `lib/messages/lookup.ts:96`):

```ts
import { expect, it } from "vitest";
import { AMBIGUITY_CODES } from "@/lib/parser/ambiguityCodes";
import { isMessageCode, messageFor } from "@/lib/messages/lookup";
import { premiseHolds } from "@/tests/_shared/premise";

const NAMES_IGNORE = /\bIgnore\b/;

it("no judgment code's controlsNote names Ignore (warning-card-fixes §6.1)", () => {
  premiseHolds("the predicate fires on a planted note", NAMES_IGNORE.test("Use Report, or Ignore to hide this notice"));
  const codes = [...AMBIGUITY_CODES];
  premiseHolds("the judgment set is non-empty", codes.length > 0);
  for (const code of codes) {
    if (!isMessageCode(code)) throw new Error(`${code} has no catalog row`);
    const note = messageFor(code).controlsNote;
    expect(note == null || !NAMES_IGNORE.test(note), code).toBe(true);
  }
});
```

  This case is a ratchet (green on the current catalog, measured: no judgment code carries a note); the RED is the copy pins. Run the red command: the two copy assertions fail.
- [ ] **Step 2: GREEN, lockstep.** Edit the master spec appendix rows, run `pnpm gen:spec-codes`, edit the catalog rows, edit the copy-restore spec §4.2 rows, and add under the paragraph at `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:177`: `Amended 2026-10-26 (warning-card-fixes §7.3): the archived-tab include offer now also renders on the wizard Sheet warnings card, as the "Use this pull sheet" button.`
- [ ] **Step 3: green.** Red command; plus `pnpm exec vitest run tests/messages/_metaErrorCatalogDocs.test.ts tests/styles/_metaEmDashCopy.test.ts`; and generator freshness by comparing the first generation with a second one, never the working tree with the index (the intended change is unstaged here): `cp lib/messages/__generated__/spec-codes.ts "$SCRATCH/spec-codes.gen1.ts" && pnpm gen:spec-codes && cmp "$SCRATCH/spec-codes.gen1.ts" lib/messages/__generated__/spec-codes.ts` exits 0 (`$SCRATCH` = the session scratchpad); then `git diff --stat lib/messages/__generated__/` lists only `spec-codes.ts`, and `git diff lib/messages/__generated__/spec-codes.ts | grep -c '^+.*Gear section'` prints `0`.
- [ ] **Step 4: commit** `fix(onboarding): point the archived-tab help at Pack list and rewrite the hotel split help`.

<!-- tasks: end -->
