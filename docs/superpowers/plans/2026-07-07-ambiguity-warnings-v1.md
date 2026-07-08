# Ambiguity Warnings v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the lean per-field confidence layer: three new ambiguity warning sites (rooms split / hotels guest split / dates order), the promoted `HOTEL_CARDINALITY_EXCEEDED`, `blockRef.field`, the `AMBIGUITY_CODES` registry, the transform-sites walker meta-test, and the wizard third state — per the adversarial-APPROVED spec `docs/superpowers/specs/2026-07-07-ambiguity-warnings-v1-design.md` (19 rounds).

**Architecture:** Parser emit sites ride the existing `ParseAggregator` → `parse_warnings` jsonb path (no DB migration). Class membership is a registry (`lib/parser/ambiguityCodes.ts`), consumed by wizard derivations at three grains (section / row / card) and by `rescanDecision`. A filesystem-walked meta-test pins declarations.

**Tech Stack:** TypeScript, vitest, existing parser/wizard code. No new dependencies.

## Global Constraints

- TDD per task: failing test → minimal impl → pass → commit (AGENTS.md invariant 1). Commit format `<type>(<scope>): <summary>`.
- No raw codes in UI (invariant 5); catalog copy via `lib/messages/lookup.ts`.
- §12.4 three-way lockstep + full CI touchpoints for the 4 new codes (spec §4.4): master-spec table row (insert in parser-warning band near `:2893`) + YAML appendix (`:3083`) + `pnpm gen:spec-codes` + `catalog.ts` row + `pnpm gen:internal-code-enums` + help `_families` check — same commit. NEVER prettier the master spec.
- Spec §11 do-not-relitigate register binds implementers too.
- UI files (`components/admin/wizard/*`, `lib/admin/step3SectionStatus.ts` is lib — but any `components/` change) = Opus-owned; impeccable dual-gate before milestone close (invariant 8).
- Before push: `pnpm test` full suite + `pnpm typecheck` + `pnpm lint` + `pnpm format:check`. Structural meta-tests re-run after editing scanned surfaces.
- Advisory locks: untouched (no mutation-path changes). Telemetry rule 10: no new mutation surfaces.

**Meta-test inventory (declared):** CREATES `tests/parser/_metaTransformSitesWalker.test.ts`; EXTENDS `tests/parser/dataGapsClassCompleteness.test.ts`. Mutation harness `SECTION_DOMAIN_MAP`: section-keyed, no registration needed (verified).

**Emit-helper pattern (binding for Tasks 5-7, spec §4):** each site emits through a named helper following the `warnings.ts` / `agendaWarnings.ts` precedent — `emitRoomSplitAmbiguity(agg, {...})` (rooms local or `warnings.ts`), `emitHotelGuestSplitAmbiguity(agg, {...})` + `emitHotelCardinalityExceeded(agg, {...})` (hotels local module), `emitDateOrderSuggestsDmy(agg, {...})` (dates local). Callers never push raw warning objects; each task's tests import the parse path (behavior) while the helper centralizes message/blockRef construction — one place to keep §12.4 copy handles consistent.

---

### Task 1: §12.4 lockstep — four new codes

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (table band near `:2893`; YAML appendix after `:3083`)
- Modify: `lib/messages/catalog.ts` (4 rows, template = `CREW_COLUMN_POSITIONAL_FALLBACK` at `:1242-1254`)
- Generated: `lib/messages/__generated__/spec-codes.ts`, `lib/messages/__generated__/internal-code-enums.ts`
- Test: existing `tests/cross-cutting/codes.test.ts` (x1 parity) must pass

**Interfaces — Produces:** catalog codes `ROOM_HEADER_SPLIT_AMBIGUOUS`, `HOTEL_GUEST_SPLIT_AMBIGUOUS`, `DATE_ORDER_SUGGESTS_DMY`, `HOTEL_CARDINALITY_EXCEEDED` (all: `crewFacing: null`, action-first dougFacing naming sheet location).

- [ ] **Step 1 (failing-test phase):** Add the 4 rows to the master spec §12.4 band + YAML appendix (Step 2 content below), run `pnpm gen:spec-codes`, THEN run `pnpm vitest run tests/cross-cutting/codes.test.ts` — expect FAIL (x1 parity: SPEC_CODES has 4 codes with no catalog rows). This is the task's red state.
- [ ] **Step 2:** Add 4 rows to master spec §12.4 parser-warning band (format matches `:2893` row exactly — 5 columns). Draft copy (final wording may be tuned, structure fixed):
  - `ROOM_HEADER_SPLIT_AMBIGUOUS` | a room header could be split into name/dimensions more than one way; we picked the most likely | "We had to make a judgment call splitting a room line in _<sheet-name>_ into name and dimensions — check the rooms section against your sheet." | — | Doug → spot-check rooms
  - `HOTEL_GUEST_SPLIT_AMBIGUOUS` | a hotel guest cell looked like it might contain several glued-together guests | "A guest line in _<sheet-name>_'s hotel section may contain more than one person — check the hotel guest list against your sheet." | — | Doug → spot-check hotel guests
  - `DATE_ORDER_SUGGESTS_DMY` | the show dates only make sense in order if read day-first; we read them month-first | "The dates in _<sheet-name>_ look out of order the way we read them (month first). If you wrote them day-first, fix the dates in the sheet — we may have every date wrong." | — | Doug → fix sheet dates
  - `HOTEL_CARDINALITY_EXCEEDED` | more than 4 hotels found; extras were dropped | "_<sheet-name>_ lists more than 4 hotels — we kept the first 4. Remove old hotel blocks from the sheet if this is wrong." | — | Doug → trim hotel list
  Add matching YAML appendix entries (one-paragraph helpfulContext each).
- [ ] **Step 3:** `pnpm gen:spec-codes` — regenerates manifest.
- [ ] **Step 4:** Add the 4 rows to `lib/messages/catalog.ts` (8-field shape: code, dougFacing, crewFacing: null, followUp, helpfulContext, title, longExplanation, helpHref `/help/errors#<CODE>`). Copy verbatim from spec rows.
- [ ] **Step 5:** `pnpm gen:internal-code-enums`.
- [ ] **Step 6:** `pnpm vitest run tests/cross-cutting/codes.test.ts tests/messages/` — PASS (x1 parity + help families; if the help `_families` test demands family registration, add codes to the parser-warning family it asserts).
- [ ] **Step 7:** Commit `feat(parser): §12.4 + catalog rows for ambiguity warning codes` (spec edit + both generated files + catalog in ONE commit).

### Task 2: GAP_CLASSES + recovery/regression coverage

**Files:**
- Modify: `lib/parser/dataGaps.ts:30-56` (append 4 entries)
- Test: `tests/parser/dataGapsClassCompleteness.test.ts` (extend), `tests/parser/dataGaps.test.ts`

**Interfaces — Produces:** `GAP_CLASSES` includes the four codes with labels: `"unclear room split"`, `"possibly merged hotel guests"`, `"dates may be day-first"`, `"too many hotels"`. `GapCode` union widens automatically.

- [ ] **Step 1:** Extend `dataGapsClassCompleteness` expectations for 4 new classes; write new test in `tests/parser/dataGaps.test.ts`:

```ts
it("ambiguity + cardinality codes are gap classes (counted, recovered symmetrically)", () => {
  const mk = (code: string): ParseWarning => ({ severity: "warn", code, message: "x" });
  const s = summarizeDataGaps([
    mk("ROOM_HEADER_SPLIT_AMBIGUOUS"), mk("HOTEL_GUEST_SPLIT_AMBIGUOUS"),
    mk("DATE_ORDER_SUGGESTS_DMY"), mk("HOTEL_CARDINALITY_EXCEEDED"),
  ]);
  expect(s.total).toBe(4);
  // recovery symmetry: an ambiguity regression blocks recovery
  const baseline = summarizeDataGaps([]);
  expect(hasRecoveredToBaseline(baseline, s)).toBe(false);
});

it("regression gate stays UNPARTITIONED for ambiguity + cardinality classes (spec §3.4 carve-out)", () => {
  const mkN = (code: string, n: number): ParseWarning[] =>
    Array.from({ length: n }, () => ({ severity: "warn" as const, code, message: "x" }));
  const prior = summarizeDataGaps([]);
  // new-class appearance fires the gate for an ambiguity code…
  expect(isQualityRegression(prior, summarizeDataGaps(mkN("ROOM_HEADER_SPLIT_AMBIGUOUS", 6)))).toBe(true);
  // …and for the promoted cardinality code
  expect(isQualityRegression(prior, summarizeDataGaps(mkN("HOTEL_CARDINALITY_EXCEEDED", 6)))).toBe(true);
});
```

(Adapt threshold fixture counts to `isQualityRegression`'s real signature/thresholds at `dataGaps.ts:110-118` — new-class appearance already fires per `buildRegressionPayload` semantics; assert via the gate function the cron path actually calls.)

- [ ] **Step 2:** Run — FAIL (codes not in `GAP_CLASSES`, total 0).
- [ ] **Step 3:** Append to `GAP_CLASSES`:

```ts
  { code: "ROOM_HEADER_SPLIT_AMBIGUOUS", label: "unclear room split" },
  { code: "HOTEL_GUEST_SPLIT_AMBIGUOUS", label: "possibly merged hotel guests" },
  { code: "DATE_ORDER_SUGGESTS_DMY", label: "dates may be day-first" },
  { code: "HOTEL_CARDINALITY_EXCEEDED", label: "too many hotels" },
```

- [ ] **Step 4:** Run tests + `pnpm vitest run tests/parser/dataGapsClassCompleteness.test.ts` (update its pinned counts/partitions per its failure output — counts move by exactly 4). PASS.
- [ ] **Step 5:** Commit `feat(parser): ambiguity + cardinality codes join GAP_CLASSES`.

### Task 3: AMBIGUITY_CODES registry + subset invariant

**Files:**
- Create: `lib/parser/ambiguityCodes.ts`
- Test: `tests/parser/ambiguityCodes.test.ts`

**Interfaces — Produces:** `AMBIGUITY_CODES: Set<string>` (4 members per spec §3.2 — NOT `AGENDA_DAY_AMBIGUOUS`, NOT `HOTEL_CARDINALITY_EXCEEDED`), `isAmbiguityCode(code: string): boolean`.

- [ ] **Step 1:** Test:

```ts
import { AMBIGUITY_CODES, isAmbiguityCode } from "@/lib/parser/ambiguityCodes";
import { GAP_CLASSES } from "@/lib/parser/dataGaps";

it("registry has exactly the four ratified members", () => {
  expect([...AMBIGUITY_CODES].sort()).toEqual([
    "CREW_COLUMN_POSITIONAL_FALLBACK", "DATE_ORDER_SUGGESTS_DMY",
    "HOTEL_GUEST_SPLIT_AMBIGUOUS", "ROOM_HEADER_SPLIT_AMBIGUOUS",
  ]);
  expect(isAmbiguityCode("AGENDA_DAY_AMBIGUOUS")).toBe(false); // semantic exclusion, spec §3.2
  expect(isAmbiguityCode("HOTEL_CARDINALITY_EXCEEDED")).toBe(false);
});
it("AMBIGUITY_CODES ⊆ GAP_CLASSES codes (spec §7.2 invariant)", () => {
  const gap = new Set(GAP_CLASSES.map((g) => g.code as string));
  for (const c of AMBIGUITY_CODES) expect(gap.has(c)).toBe(true);
});
```

- [ ] **Step 2:** Run — FAIL (module missing). **Step 3:** Implement per spec §3.2 code block (file content is exactly the registry + predicate + doc comment citing spec). **Step 4:** PASS. **Step 5:** Commit `feat(parser): AMBIGUITY_CODES registry + subset invariant test`.

### Task 4: `blockRef.field` + warning-shape class-sweep

**Files:**
- Modify: `lib/parser/types.ts:15`
- Sweep: `rg -l "toEqual\(" tests/parser tests/admin tests/components | xargs rg -l "blockRef"` — any exact-shape assertion on warning objects

**Interfaces — Produces:** `blockRef?: { kind: string; index?: number; iso?: string; name?: string; field?: string }`.

- [ ] **Step 1 (failing-test phase):** Write a type-level test in `tests/parser/types.field.test.ts`:

```ts
import type { ParseWarning } from "@/lib/parser/types";
it("blockRef accepts a field anchor", () => {
  const w: ParseWarning = {
    severity: "warn", code: "ROOM_HEADER_SPLIT_AMBIGUOUS", message: "x",
    blockRef: { kind: "rooms", name: "LASALLE", field: "dims" },
  };
  expect(w.blockRef?.field).toBe("dims");
});
```

Run `pnpm typecheck` — expect FAIL (`field` not in blockRef type). **Step 2:** Add `field?: string` to `types.ts:15`. **Step 3:** `pnpm typecheck` + the new test — PASS (optional member, exactOptionalPropertyTypes-safe since emitters set it explicitly, never `undefined`). **Step 4:** Run the sweep command; run every hit file's tests — expect NO failures (no existing emitter sets `field`); record sweep in commit body. **Step 5:** Commit `feat(parser): blockRef.field member for per-field warning anchors`.

### Task 5: rooms site — `ROOM_HEADER_SPLIT_AMBIGUOUS`

**Files:**
- Modify: `lib/parser/blocks/rooms.ts` (`splitRoomHeader` at `:1439` gains `ambiguity` return member; persisting callers emit)
- Test: `tests/parser/blocks/rooms.test.ts` (or sibling new file `rooms.ambiguity.test.ts`)

**Interfaces — Produces:** `splitRoomHeader` returns `{ name, dimensions, floor, ambiguity?: { field: "dims" | "name"; reason: string } }`. Callers emit `{ severity: "warn", code: "ROOM_HEADER_SPLIT_AMBIGUOUS", message, blockRef: { kind: "rooms", name: <parsed name>, field: ambiguity.field }, rawSnippet: raw }` exactly once per KEPT room.

Trigger branches (spec §4.1, verified against `splitRoomHeader` structure): (a) >1 complete `dimsFullRe` group in the raw header; (b) dims-leading raw (name reconstructed after a leading dims strip); (c) residual name empty/degenerate (≤1 alnum char) while raw was non-trivial (>3 chars). `kind` is ALWAYS literal `"rooms"`.

- [ ] **Step 1:** Failing tests:

```ts
it("warns on double-dims header, field=dims, kept room", () => {
  const agg = newAggregator();
  const rooms = parseRooms(fixtureWith("BREAKOUT 1 LASALLE 50' x 40' 30' x 20'"), agg);
  const w = agg.warnings.filter((x) => x.code === "ROOM_HEADER_SPLIT_AMBIGUOUS");
  expect(w).toHaveLength(1);
  expect(w[0]!.blockRef).toMatchObject({ kind: "rooms", field: "dims", name: "LASALLE" }); // parsed room name required
  expect(w[0]!.rawSnippet).toContain("50' x 40' 30' x 20'"); // rawSnippet = raw header cell
});
it("no warn on plain 3-operand dims", () => {
  const agg = newAggregator();
  parseRooms(fixtureWith("BREAKOUT 1 LASALLE 75' x 37' x 16'"), agg);
  expect(agg.warnings.some((x) => x.code === "ROOM_HEADER_SPLIT_AMBIGUOUS")).toBe(false);
});
it("dropped placeholder room emits nothing (spec §11.7)", () => { /* placeholder fixture, assert zero */ });
// branch (b): dims-leading header — name reconstructed after leading dims strip
it("warns on dims-leading header, field=name", () => {
  const agg = newAggregator();
  parseRooms(fixtureWith("BREAKOUT 1 50' x 40' LASALLE"), agg);
  const w = agg.warnings.filter((x) => x.code === "ROOM_HEADER_SPLIT_AMBIGUOUS");
  expect(w).toHaveLength(1);
  expect(w[0]!.blockRef).toMatchObject({ kind: "rooms", field: "name" });
});
// branch (c): degenerate residual name from a non-trivial raw
it("warns when strip leaves an empty/degenerate name", () => {
  const agg = newAggregator();
  parseRooms(fixtureWith("BREAKOUT 1 50' x 40'"), agg); // raw non-trivial, name residual empty
  expect(agg.warnings.filter((x) => x.code === "ROOM_HEADER_SPLIT_AMBIGUOUS")).toHaveLength(1);
});
// exact-once across persisting caller shapes: centralize emission behind ONE post-keep helper
// (emitRoomSplitAmbiguity called at the single point where a split room is COMMITTED to output),
// so no caller can go dark or double-emit. Coverage: implementation-time persist/reject enumeration
// of the seven call sites (rooms.ts:752,957,968,1140,1187,1247,1404) lands in the test file as a
// comment; ONE fixture per PERSISTING caller (not just per RoomKind) asserting exactly 1 warning,
// plus one rejected-candidate fixture asserting 0.
it("emits exactly once per kept room, per persisting caller fixture", () => { /* per enumeration above */ });
// rejected candidate emits nothing: ambiguous header on a room the placeholder gate drops
// PURE-HELPER layer (spec §4.1 two-layer testability): direct splitRoomHeader unit tests
it("splitRoomHeader metadata per branch", () => {
  expect(splitRoomHeader("LASALLE 50' x 40' 30' x 20'", "breakout").ambiguity).toMatchObject({ field: "dims" });
  expect(splitRoomHeader("50' x 40' LASALLE", "breakout").ambiguity).toMatchObject({ field: "name" });
  expect(splitRoomHeader("BREAKOUT 1 50' x 40'", "breakout").ambiguity).toMatchObject({ field: "name" }); // empty residual
  expect(splitRoomHeader("- 50' x 40'", "breakout").ambiguity).toMatchObject({ field: "name" }); // punctuation-only residual
  expect(splitRoomHeader("X 50' x 40'", "breakout").ambiguity).toMatchObject({ field: "name" }); // single-char residual
  expect(splitRoomHeader("LASALLE 75' x 37' x 16'", "breakout").ambiguity).toBeUndefined(); // 3-operand negative
});
```

(Adapt `fixtureWith`/`parseRooms` names to the file's real test harness — the existing rooms tests show the entry point; keep assertions against `agg.warnings`, never rendered output.)
- [ ] **Step 2:** FAIL. **Step 3:** Implement: pure metadata in `splitRoomHeader` branches; emission goes through EXACTLY ONE commit-point call — `emitRoomSplitAmbiguity(agg, ...)` invoked at the single place a split room is committed to parsed output (after any placeholder/reject gate). Callers never emit individually. The seven-site enumeration (`rooms.ts:752, :957, :968, :1140, :1187, :1247, :1404`) is used ONLY to prove each path either reaches that commit point or rejects the candidate — documented as the comment in the test file, not as emit sites. **Step 4:** PASS + run full `tests/parser/blocks/rooms*.test.ts`. **Step 5:** Commit `feat(parser): ROOM_HEADER_SPLIT_AMBIGUOUS on judgment-call room splits`.

### Task 6: hotels site — guest split + cardinality promotion

**Files:**
- Modify: `lib/parser/blocks/hotels.ts` (`parseGuestCell` returns branch metadata; structured callers `:446`, `:449` emit; `cap()`/cardinality path emits aggregator warning; delete log-only `warn()` if orphaned)
- Test: `tests/parser/blocks/hotels.test.ts` (or `hotels.ambiguity.test.ts`)

**Interfaces — Produces:** `parseGuestCell(cell)` → `{ names, confs, ambiguity?: { reasons: string[] } }` (pure). Callers emit ONE `HOTEL_GUEST_SPLIT_AMBIGUOUS` per triggering CELL: `blockRef: { kind: "hotels", name?: <hotel_name if resolved>, field: "guests" }`, `rawSnippet` = whole cell. `HOTEL_CARDINALITY_EXCEEDED` emitted into aggregator on truncation, `blockRef: { kind: "hotels" }`, NO `field`.

Predicates (spec §4.2, exact): fallback segment with ≥4 name-like tokens (`/^[\p{L}][\p{L}\p{M}.'-]*$/u` per whitespace-split token) OR interior `/\d{4,}/` run (match neither at index 0 nor segment end); tail-branch append.

- [ ] **Step 1:** Failing tests: glued 4-token fallback cell → exactly 1 warning; "Mary St. Claire" → 0; "José Núñez-Marín" → 0; **interior digit-run independent of token count**: "Bob Smith 103317 Jones" (3 name-like tokens, interior `\d{4,}` unconsumed) → 1 warning; boundary digit runs: "103317 Bob Smith" and "Bob Smith 103317" (run at index 0 / segment end, <4 tokens) → 0; **tail-only isolation**: a cell like "Doug — #103317 Extra Person" (tokenRe matches Doug+conf, un-numbered tail appended as guest; <4 tokens, no interior digit run) → exactly 1 warning; **fallback-predicate isolation at the PURE layer**: direct `parseGuestCell` assertions on `ambiguity.reasons` — the interior-digit-run fixture must trigger via the FALLBACK branch (segment with NO tokenRe match, e.g. "Bob Smith x103317 Jones" if `x`-prefix defeats tokenRe — pick a fixture verified to leave tokenRe unmatched) and its `reasons` must name the digit-run predicate, NOT the tail branch; **anchor fields**: every warning asserts `rawSnippet` === the whole raw cell, `blockRef.name` === resolved `hotel_name` on the structured-slot fixture where it resolves BEFORE emit, and `blockRef.name` ABSENT (`"name" in blockRef === false`) on an unresolved-slot fixture; multi-segment cell with both branches → exactly 1; two ambiguous cells → 2; >4 hotels fixture through `parseHotels(..., agg)` → `HOTEL_CARDINALITY_EXCEEDED` in `agg.warnings` with `severity:"warn"`, `blockRef:{kind:"hotels"}` AND counted by `summarizeDataGaps`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement (live signature is `parseHotels(markdown, version, agg?)` — `agg` ALREADY threaded at the top level; the work is passing it down into `cap(hotels, agg?)` and the structured-slot guest path — tests call `parseHotels(markdown, "v1"|"v2"|"v4", agg)`, no public signature drift; keep `log.warn` telemetry alongside if desired, delete local `warn()` when orphaned; the no-inline-email guard scans lib/sync+lib/drive not parser, but re-run `tests/admin/no-inline-email-normalization.test.ts` anyway if any `.toLowerCase()/.trim()` added). **Step 4:** PASS + full hotels tests. **Step 5:** Commit `feat(parser): HOTEL_GUEST_SPLIT_AMBIGUOUS + promote HOTEL_CARDINALITY_EXCEEDED to ParseWarning`.

### Task 7: dates site — `collectDateTokens` + `DATE_ORDER_SUGGESTS_DMY`

**Files:**
- Create: collector + check in `lib/parser/blocks/dates.ts` (exported `collectDateTokens` for unit tests; walker declaration lives here)
- Modify: both walkers (`parseV1Dates` loop ~`:150-181`, `parseV2V4Dates` ~`:189+`) to collect pre-sort and run the check once per DATES block
- Test: `tests/parser/blocks/dates.ambiguity.test.ts`

**Interfaces — Produces:** `collectDateTokens(rows: Array<{ kind: "prefix" | "multi"; cell: string }>): Array<{ raw: string; mdyIso: string | null; dmyIso: string | null }>`; `checkDateOrder(tokens, agg)` emits ≤1 warning per block: `blockRef: { kind: "dates", field: "order" }`, `rawSnippet` = first out-of-order raw token.

Binding rules (spec §4.3): prefix rows (TRAVEL/SET/travel_set) contribute ≤1 leading token, all families; multi rows (v1 SHOW via `extractAllDates` path) contribute every match in offset order, NO numeric-dash family. Combined-alternation single pass mirrors `normalizeDate` precedence; 2-digit dash years rejected. Dual read: `a/b/y` → `mdyIso` (a-as-month, calendar-valid else null), `dmyIso` (b-as-month, else null); ISO/longform = fixed points both. Emit iff MDY seq (nulls skipped) strictly decreases somewhere AND no numeric token has `dmyIso=null` AND full dmy seq non-decreasing.

- [ ] **Step 1:** Failing unit tests on `collectDateTokens` (token order, prefix-only truncation, SHOW-cell dash exclusion, **positive prefix-row numeric-dash collection + dual read**: TRAVEL rows `10-3-2026`, `11-3-2026`, `1-4-2026` are collected (4-digit-year dash family), each with both `mdyIso` and `dmyIso` populated, and the trio triggers the check exactly like its slash twin; 2-digit dash `10-3-26` NOT a token, symmetric 5/5 token) + `checkDateOrder` matrix:

```ts
// DMY sheet, day<=12 rows: MDY reading non-monotonic, DMY monotonic → 1 warning
expect(run(["3/10/2026", "4/10/2026", "5/10/2026", "3/11/2026"])).toHaveLength(0); // MDY already monotonic? pick fixture where MDY decreases:
expect(run(["10/3/2026", "11/3/2026", "1/4/2026"])).toHaveLength(1); // MDY: Oct3,Nov3,Jan4 ↓; DMY: Mar10,Mar11,Apr1 ↑
// US sheet typo: 3/25 kills DMY hypothesis → 0
expect(run(["3/25/2026", "3/20/2026"])).toHaveLength(0);
// both orders broken → 0 ; <2 dates → 0 ; MDY-invalid token participates in DMY seq
```

- [ ] **Step 1b (integration red):** End-to-end aggregator tests, one per parser version, calling the real entry point with an aggregator (thread `agg` into `parseV1Dates` / `parseV2V4Dates` — today the walkers don't receive it):

```ts
it("v1: DMY-ordered sheet lands DATE_ORDER_SUGGESTS_DMY in agg.warnings", () => {
  const agg = newAggregator();
  parseDates(v1FixtureWithDmyDates, "v1", agg);
  const w = agg.warnings.filter((x) => x.code === "DATE_ORDER_SUGGESTS_DMY");
  expect(w).toHaveLength(1);
  expect(w[0]!.blockRef).toMatchObject({ kind: "dates", field: "order" });
  expect(w[0]!.rawSnippet).toBe("1/4/2026"); // first out-of-order RAW token, spec §4.3
});
it("v2/v4: same, through the v2 walker", () => { /* same shape, v2 fixture */ });
```

(Adapt entry-point name/signature to `dates.ts`'s real exported parse function — verified: `parseDates(..., agg?)` exists; the change is passing `agg` down to both walkers.) These tests are what prove the persisted-warning path is not dark — unit tests on the collector alone are insufficient.
- [ ] **Step 2:** FAIL. **Step 3:** Implement collector + check; wire BOTH walkers pre-`showDays.sort()`, passing `agg` through. **Step 4:** Placement-proof tests: v1 AND v2/v4 fixtures whose dates sort clean but encounter dirty (e.g. `SHOW 11/3/2026`, `SHOW 1/4/2026` after a `10/3/2026` travel row) — post-sort implementation fails. PASS. **Step 5:** Commit `feat(parser): DATE_ORDER_SUGGESTS_DMY block-level sequence check`.

### Task 8: transform-sites walker meta-test

**Files:**
- Modify: every `lib/parser/blocks/*.ts` — add `export const TRANSFORM_SITES` (shape per spec §6; files with no transform sites export `[]`; deferred sites use `{ site, exempt: "deferred:BL-..." }` / `"deterministic"` / `"verbatim"`)
- Also: `lib/parser/blocks/crew.ts` declares `CREW_COLUMN_POSITIONAL_FALLBACK` (inverse-completeness)
- Create: `tests/parser/_metaTransformSitesWalker.test.ts` (template: `_metaKnownSectionsWalker.test.ts` — filesystem-walked, fails-by-default)

**Interfaces — Produces:** walker asserting spec §6 (1)(2)(4)(5): export present on every file; every declared `code` passes `isMessageCode`; five named per-file declarations exist (`crew.ts`: CREW_COLUMN_POSITIONAL_FALLBACK; `rooms.ts`: ROOM_HEADER_SPLIT_AMBIGUOUS; `hotels.ts`: both hotel codes; `dates.ts`: DATE_ORDER_SUGGESTS_DMY); `AMBIGUITY_CODES ⊆ declared codes`. NO catalog-severity assertion (retired R8).

- [ ] **Step 1:** Write walker test (readdirSync over `lib/parser/blocks`, dynamic import, assert export). Run — FAIL (no file has the export). **Step 2:** Add `TRANSFORM_SITES` to every block file (enumerate transform sites per file during implementation; deferred exemption seeds per spec §6 with CONCRETE backlog IDs: `personalization.ts` stage-clause `deterministic`-or-already-warns, `_dimsToken.ts` consumers `deterministic`, hotels inline paths `deferred:BL-PARSER-HOTEL-INLINE-AMBIGUITY`, address parsing `deferred:BL-PARSER-ADDRESS-SPLIT-AMBIGUITY` — never a bare `deferred:BACKLOG` placeholder). Walker additionally asserts every `deferred:<ref>` value matches `/^deferred:BL-[A-Z0-9-]+$/` AND the ref string appears in `BACKLOG.md`. **Step 3:** Add the matching BACKLOG.md rows — the walker stays RED until BOTH the declarations and the backlog rows exist. **Step 4:** Run walker — PASS only now. **Step 5:** Commit `test(parser): transform-sites walker meta-test + per-file declarations`.

### Task 9: wizard derivations — section/row/card tri-state

**Files:**
- Modify: `lib/admin/step3SectionStatus.ts` (section status: flagged / judgment / clean per §7.1)
- Modify: `components/admin/wizard/Step3Review.tsx` (`rowNeedsLook` partition + three counts per §7.2; judgment predicate `isAmbiguityCode ∧ DATA_GAP_CODES`)
- Modify: `components/admin/wizard/Step3SheetCard.tsx:470-471` (`needsLook` partition per §7.3a; judgment card variant; `DataQualityBadge` keeps FULL count)
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (judgment callout variant + FIELD_LABELS map per §7.3)
- Test: `tests/admin/step3SectionStatus.test.ts`, wizard component tests (existing files for these components)

**Interfaces — Consumes:** `isAmbiguityCode` (Task 3), `DATA_GAP_CODES` (`dataGaps.ts:72`). **Produces:** `sectionStatus(warnings): "flagged" | "judgment" | "clean"`; row buckets N/M/K within `publishRows` only; FIELD_LABELS = `{ dims: "dimensions", name: "room name", guests: "guest list", order: "date order" }`, unknown → omit phrase.

- [ ] **Step 1:** Failing derivation tests (all from spec §10): mixed-warning row (non-gap warn + ambiguity gap → row judgment, section flagged); **gap-mixed row precedence** (`FIELD_UNREADABLE` + `ROOM_HEADER_SPLIT_AMBIGUOUS` on one row → needs-look (K), counted once, NOT judgment — precedence needs-look > judgment > clean); M=0 renders two-state summary; blocking rows excluded; set-aside excluded; missing-preview row stays needs-look despite ambiguity; finalize-failure likewise; N+M+K === publishRows.length; ambiguity-only section → judgment; ambiguity+non-ambiguity section → flagged; FIELD_LABELS unknown-value omission. **Task 9 is DERIVATION-ONLY** — every test here asserts pure predicates/derived values (`sectionStatus(...)`, `rowNeedsLook(...)`, `rowIsJudgment(...)`, `nonAmbiguityGapTotal(...)`, count triple, FIELD_LABELS lookup) with NO rendered-chrome assertions; visual/chrome tests (including the badge/chrome split: judgment chrome present while `DataQualityBadge` shows the FULL gap count) live in Task 11, preserving its red phase. Where a derivation currently lives inline in a component (`rowNeedsLook` in `Step3Review.tsx`, `needsLook` in `Step3SheetCard.tsx`), extract it to a pure exported function (component file or `lib/admin/`) so Task 9 tests target the function, and Task 11 wires chrome to it.
- [ ] **Step 2:** FAIL. **Step 3:** Implement:

```ts
// Step3Review.tsx — partition ONLY the gap clause; preserve other OR branches (spec §7.2)
function rowNeedsLook(row: Step3Row): boolean {
  return (
    !hasReviewablePreview(row) ||
    row.lastFinalizeFailureCode != null ||
    nonAmbiguityGapTotal(row) > 0
  );
}
function nonAmbiguityGapTotal(row: Step3Row): number {
  const s = summarizeDataGaps(stripLegacyUnknownFieldAnchors(arr((row.parseResult as ParseResult)?.warnings)));
  return GAP_CLASSES.reduce((n, g) => n + (isAmbiguityCode(g.code) ? 0 : s.classes[g.code]), 0);
}
function rowIsJudgment(row: Step3Row): boolean {
  if (rowNeedsLook(row)) return false;
  const warnings = stripLegacyUnknownFieldAnchors(arr((row.parseResult as ParseResult)?.warnings));
  return warnings.some((w) => w.severity === "warn" && isAmbiguityCode(w.code));
}
```

  (Adapt to the file's local helpers; `summarizeDataGaps` already exposes per-class counts.) Card + section analogues per spec. Summary copy: "N clean · M parsed with judgment — spot-check · K need a look" (final copy at impeccable gate; "flagged" wording banned for K).
- [ ] **Step 4:** PASS + full `tests/admin` + component tests. **Step 5:** Commit `feat(admin): wizard third state — judgment tri-state at section/row/card grains`.

### Task 10: rescanDecision partition

**Files:**
- Modify: `lib/onboarding/rescanDecision.ts:40-48`
- Test: `tests/onboarding/rescanDecision.test.ts` (existing file — extend)

**Interfaces — Produces:** `gapRegressed` compares NON-ambiguity classes only; `decisionItems` unchanged.

- [ ] **Step 1:** Failing tests: ambiguity-only class increase → `dirty: false`; non-ambiguity increase → `dirty: true`; invariant-triggered dirty unaffected.
- [ ] **Step 2:** FAIL. **Step 3:**

```ts
const gapRegressed = (Object.keys(newGaps) as Array<keyof typeof newGaps>).some(
  (cls) => !isAmbiguityCode(cls) && newGaps[cls] > (priorGaps?.[cls] ?? 0),
);
```

- [ ] **Step 4:** PASS + `tests/onboarding/` suite. **Step 5:** Commit `feat(onboarding): rescan dirty gate ignores ambiguity-only gap increases`.

### Task 11: wizard UI chrome (Opus + impeccable)

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (judgment callout variant, copy "We made a judgment call reading this — worth a glance"), `Step3SheetCard.tsx` (judgment border/affordance variant), `Step3Review.tsx` (three-count summary copy)

Visual treatment within DESIGN.md tokens, distinct from flagged amber and clean. No new chip. `ModalSectionChrome` deep-link untouched. Transition inventory: all state pairs instant (spec §7.4); no AnimatePresence introduced. Dimensional invariants: N/A (spec §7.5).

- [ ] **Step 1:** Render tests for the three visual states (assert on `data-testid`/class hooks, cloned-tree label scans per anti-tautology rule). **Step 2 (transition-audit, mandatory per AGENTS.md writing-plans rule + spec §7.4):** Test that audits the changed wizard files' animation surfaces:

```ts
it("no animated wrapper introduced for status states (spec §7.4: all pairs instant)", () => {
  // static scan of the three changed component sources:
  for (const f of ["Step3Review.tsx", "Step3SheetCard.tsx", "step3ReviewSections.tsx"]) {
    const src = readFileSync(join(WIZARD_DIR, f), "utf8");
    expect(src.includes("AnimatePresence")).toBe(false); // none exist today; spec forbids introducing one for these states
    // BEFORE implementing chrome (red phase), capture and HARDCODE the pre-existing count per file:
    //   rg -c "transition-(all|colors|opacity)" <file>   → e.g. { "Step3Review.tsx": 0, ... }
    // The literal map below is filled with those numbers in the failing-test commit. If chrome work
    // adds a transition class, this test fails — the red state that proves the pin is live.
    expect((src.match(/transition-(?:all|colors|opacity)/g) ?? []).length).toBe(
      PREEXISTING_TRANSITION_COUNTS[f], // exact hardcoded literals, captured pre-implementation
    );
  }
});
// behavioral: re-render a card from judgment → needs-look props and assert the new class is present
// synchronously (no waitFor needed = instant), covering clean↔judgment, clean↔flagged, judgment↔flagged pairs.
```

  Spec §7.4 inventory inlined: 3 pairs (clean↔judgment, clean↔flagged, judgment↔flagged) + summary counts — ALL instant, no compound transitions, callout expand/collapse unchanged. **Step 3:** Implement chrome. **Step 4:** PASS. **Step 5:** Run `/impeccable critique` + `/impeccable audit` on the diff; fix or DEFERRED.md HIGH/CRITICAL findings. **Step 5b:** After ALL impeccable fixes/deferrals, re-run the full Task 11 test set (render states + transition audit) AND the Task 9 derivation tests — must PASS before commit. **Step 6:** Commit `feat(admin): judgment-state chrome for wizard review surfaces`.

### Task 12: close-out gates

- [ ] **Step 1:** `pnpm test` (FULL suite). **Step 2:** `pnpm typecheck`. **Step 3:** `pnpm lint`. **Step 4:** `pnpm format:check` (never prettier the master spec — verify it's untouched by any formatter: `git diff --stat docs/superpowers/specs/2026-04-30-*.md` shows only the intended §12.4 rows). **Step 5:** Re-run structural meta-tests touching scanned surfaces: `tests/parser/_metaKnownSectionsWalker.test.ts`, `tests/parser/_metaTransformSitesWalker.test.ts`, `tests/auth/_metaInfraContract.test.ts`, `tests/log/_metaMutationSurfaceObservability.test.ts`. **Step 6:** Mutation-harness check: `lib/parser` moved → run mutation project locally per memory rule if `classify.ts`-adjacent surfaces changed (SECTION_DOMAIN_MAP untouched → expected no-op, but run `pnpm vitest run tests/parser/mutation/` to confirm). **Step 7:** Commit any stragglers; whole-diff Codex review comes next (pipeline step, not a plan task).
