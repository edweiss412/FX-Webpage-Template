# Task 4: Stash → emit plumbing (HotelAmbiguity kinds, toPending, two emitters)

**Files:**
- Create: `tests/parser/inlineLaterGroupEnvelope.test.ts`
- Modify: `lib/parser/blocks/hotels.ts` (stash kinds → pending plumbing; TRANSFORM_SITES rows for both stash sites at the `:1182` registry), `lib/parser/warnings.ts` (two emitters beside the existing hotel emitters — `HOTEL_GUEST_SPLIT_AMBIGUOUS` const `:239`/emit `:240`, address emitter `:389` are the templates)
- Modify: `tests/parser/inlineLaterGroupOwnHotel.test.ts` — UNSKIP the `describe.skip("warning cardinality — unskipped by Task 4")` block

**Interfaces:**
- Consumes: Tasks 2–3 stash slots; `collapse` (`lib/parser/useRawContentHash.ts:16-18`, used at `lib/parser/warnings.ts:255`); `ParseAggregator` (`lib/parser/warnings.ts:17`).
- Produces: two ParseWarning codes emitted with LITERAL strings `"HOTEL_INLINE_GROUP_OWN_HOTEL"` and `"HOTEL_INLINE_GROUP_HOTEL_SUSPECTED"` (never a shared const interpolation — extractor `scripts/extract-internal-code-enums.ts:70-73` scans literals), severity `warn`, field `address` (label "hotel name and address", `step3Buckets.ts:129-135` mapping), message copy per spec §7 with `<raw, collapsed>` = `collapse(<raw segment/cell>)` (whitespace fold, `&#10;` stays LITERAL — NOT D1).

## Oracle groups (spec §8.1/§8.4 rows, byte-exact)

1. Envelope OWN and SUSPECTED on D1-affected inputs (`&#10;`, doubled space, quotes): `rawSnippet` === the RAW segment/cell bytes AND `!== normalized`; surviving `index`; verdict fields (D7 — `build.judgedGuestBoundary` mapping; 7b guest warning); roleToken-absent asserts (R43).
2. Null group-0 `baseName` envelope (R16 f5).
3. Stash order both slots (probe B6 cell — address-shape-unsplit path; first-stash-wins per-row sink, `lib/parser/blocks/hotels.ts:845` pattern).
4. Field-label render (`field: "address"` bucket mapping).
5. Emission order vs cardinality (the 5-group literal row).
6. UNSKIPPED Task-2/3 warning-cardinality block: every `exactly one SUSPECTED@i` / `OWN@i` / `ZERO OWN` clause from the §8.1 rows, asserted as `warnings.filter((w) => w.code === "HOTEL_INLINE_GROUP_HOTEL_SUSPECTED").length` etc. against the aggregator output — never `.some()`.

Concrete failure modes: normalized-persisting emitters (byte asserts fail), double emission (cardinality), wrong stash order, shared-const code strings (row j oracle in Task 5 + extractor), spurious warnings on parity negatives (ZERO-new-codes asserts across Task 2/3 negatives now enforced at the warning layer).

## Steps

- [ ] **Step 1: Write failing envelope tests + unskip the cardinality block** — run `pnpm vitest run tests/parser/inlineLaterGroupEnvelope.test.ts tests/parser/inlineLaterGroupOwnHotel.test.ts`; expected FAIL (no emitters yet).
- [ ] **Step 2: Commit failing tests** — `git commit -m "test(parser): envelope + warning-cardinality oracles for HOTEL_INLINE_GROUP_* codes"`
- [ ] **Step 3: Implement** — HotelAmbiguity stash kinds in hotels.ts, toPending mapping, two emitters in warnings.ts (literal codes, §7 copy verbatim), TRANSFORM_SITES rows for both stash sites.
- [ ] **Step 4: Run to green** — both files + `pnpm vitest run tests/parser`. Expected: PASS (walker meta-test will fail if TRANSFORM_SITES rows are missing/mis-named — it must PASS here with the registry rows; the count edits land in Task 5).
- [ ] **Step 5: Typecheck** — `pnpm typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(parser): stash HotelAmbiguity kinds + emitters for HOTEL_INLINE_GROUP_* codes"`
