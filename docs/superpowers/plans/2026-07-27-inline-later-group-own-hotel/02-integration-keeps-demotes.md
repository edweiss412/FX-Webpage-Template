# Task 2: Integration — wire the detector; tier-1 keeps, tier-2 demotes, parity negatives

**Files:**
- Create: `tests/parser/inlineLaterGroupOwnHotel.test.ts`
- Modify: `lib/parser/blocks/hotels.ts` — `buildInlineReservations` later-segment region loop (the `:717+` region; group 0 untouched) + D7 verdict wiring

**Interfaces:**
- Consumes: `classifyLaterSegment` / `LaterSegmentOutcome` (Task 1, exact signature in 01-detector-core.md); `parseHotels(markdown, version)` public API.
- Produces: tier-1 later groups whose row is `outcome.build.row` with `hotel_name = outcome.hotelText`, `hotel_address = null`, then conf-stripped/split by the EXISTING per-row `stripHotelNameConf` pass (`lib/parser/blocks/hotels.ts:831` pattern, first-stash-wins `:845`); a per-row pending-stash slot for `HOTEL_INLINE_GROUP_OWN_HOTEL` / `HOTEL_INLINE_GROUP_HOTEL_SUSPECTED` (a module-private array consumed by Task 4's emit plumbing — until Task 4 lands, stashes are recorded on the row builds but no ParseWarning is emitted, and the T2 tests assert ROWS only; warning-cardinality assertions are added in Task 4's step 1 by UNSKIPPING the `describe.skip("warning cardinality")` block written here).

**Test harness (top of the new file):**

```ts
import { describe, expect, it } from "vitest";
import { parseHotels } from "@/lib/parser/blocks/hotels";

const HEAD =
  "Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1/26 Check Out: 3/2/26 ";
const cell = (later: string) => `| Hotel Stays | ${HEAD}${later} |`;
const rowsOf = (later: string) => parseHotels(cell(later), "v1");
```

## Oracle groups (each `it()` = one spec §8.1 row, byte-exact input + assertions from the row)

Every row below names its spec §8.1 anchor (bold row name). The row text is normative: copy its later-segment input(s), its today-parse literals (for byte-parity demotes), and its assertion clauses verbatim. Assertions on kept rows check `hotel_name`, `hotel_address`, `names`, `check_in`, `check_out` against the row's stated literals; assertions on demotes check the FULL row array deep-equals the row's stated today-parse shape (derived from the row's probe clause), plus `NO row whose hotel_name/hotel_address contains <the row's buried-name tokens>`. Warning-cardinality clauses (`exactly one SUSPECTED@i`, `OWN@i`, `ZERO OWN`) go into the `describe.skip("warning cardinality — unskipped by Task 4")` block with the same row names.

1. **Keeps (tier 1):** backlog clobber B1z; two-guest keep ×2 (hyphen + glued-em corpus form); tail keep (R12 f1); D4b tail arms — comma / comma-less / Canadian / arm-3 cap-boundary (R19) / ZIP+4 ×2 / unit ×2 + R16 composition; FL keeps ×2 (R37); exact-3 keeps ×2 (R37 f4); overlap keeps ×2 (R40); arm-1 syntax matrix (12 materializations, R45/R46); Florence keep (R40); zero-city keeps ×2 (R32); 3-word name-region keep; FOUR-word corpus-brand keep (R47); quoted corpus keep (R47); smart-quote keep (R48); below-threshold guest keep (R33 documented limit); divider strip ×3 dash forms NAME-asserted (R45); tier-1 ZIP+4 post-marker keep (R18 f2); ZIP+4-then-suffix-word keep (R52); dash-before-letters note keep (R52); position-0 all-address keep; entity-split final checkout keep (R26).
2. **Demotes (tier 2):** suffix-only; city collision (R4); unconsumed postal (R2); ZIP-less city ×2 (R3); guard-(c) note text + conservatism; counterfeit-postal unit ×3 (R22); postal-then-trailing-unit (R22/R39); post-postal unit designation (R39); a0 bare-alias ×8 + dotted c0 pin (R41/R42); Steve alias-prefix (R34); hash counterfeit ×3 (R23); trailing-letter dash-run ×2 (R25); bare-conf ×2 (R24); dash-street ×2 (R27); guest-before-dash-street ×3 incl. en-dash (R27/R49); guests-inside-address ×3 (R36); MLK street conservatism (R36); ZIP-arm boundary 4-keep/5-demote (R40/R47); unconfirmed-guest five-word ×3 provenance paths (R31/R47); second-postal ×2 (R38); Doug c1 / Alice c2 (R32); suffixed-lc + lowercase-casing family (R30); glued-missing-checkin (R12 f2); conf-glue ×3 dash forms (R13/R49); hash/bare glue (R17); degraded-segment demote (R11); D4 smaller-index precedence (R16 f4); post-prefix street/postal-only ×2 (R16 f3); post-guest arm (R5); dash-glued street ×3 forms (R29/R49); word-glued street ×3 forms (R55); suffix-surname ×2 forms (R52 documented limit); digit-run prose ×2 forms (R54/R55 documented limit).
3. **Parity negatives (byte-identical to today, zero new rows/changes):** bare-name post-marker glue (documented limit); tier-2 word arm; tier-3 silence (B5 consultants shape); no-tier-1 parity (B5 + 2-group below-threshold cell); single-group cell untouched; entity-split second-marker routing negative (R24 f2); quote-split second-marker routing negative ×3 forms (R50); tab raw-gate parity (R39); row 0 always untouched.

Concrete failure modes: group 1 kills every under-keeping mutant (each keep row names the specific mutant its assertions fail — e.g. a 3-cap guard (d), a straight-quote-only D1, an unrestricted or over-restricted neutralizer); group 2 kills every over-keeping/corrupting mutant (each demote row's kill-claim clause is part of the row); group 3 kills scope creep onto shipped single-group/routing behavior.

## Steps

- [ ] **Step 1: Write the failing integration tests** — the harness above + one `it()` per row listed, in three `describe` blocks (`keeps`, `demotes`, `parity negatives`), plus the `describe.skip("warning cardinality — unskipped by Task 4")` block containing the per-row warning-count assertions. Inputs and expected literals copied from the spec rows.
- [ ] **Step 2: Run, verify keeps/demotes FAIL** — `pnpm vitest run tests/parser/inlineLaterGroupOwnHotel.test.ts`. Expected: parity negatives PASS already (they assert today's behavior); keeps and demote-shape assertions FAIL (detector unwired).
- [ ] **Step 3: Commit failing tests** — `git add tests/parser/inlineLaterGroupOwnHotel.test.ts && git commit -m "test(parser): integration oracles for inline later-group own-hotel keeps/demotes/parity"`
- [ ] **Step 4: Wire the detector** — in `buildInlineReservations`' later-segment loop: call `classifyLaterSegment(rawSegment, ordinal, contextYear)` BEFORE the all-names guard (`:735-753`); tier 1 replaces the group's provisional row with `build.row` + `hotel_name = hotelText` / `hotel_address = null` and records an OWN stash; tier 2 keeps today's inherit and records a SUSPECTED stash; tier 3 unchanged. Degraded segments (≥2 markers on D1 text) demote tier-1-qualifying outcomes (spec scope A tier-gate; the scan itself is Task 3). Group 0 and single-group cells never call the detector.
- [ ] **Step 5: Run to green** — `pnpm vitest run tests/parser/inlineLaterGroupOwnHotel.test.ts tests/parser/inlineLaterGroupDetector.test.ts`. Expected: PASS (skip block still skipped).
- [ ] **Step 6: Full parser suite + typecheck** — `pnpm typecheck && pnpm vitest run tests/parser`. Expected: PASS (corpus goldens unchanged — no fixture reaches tier 1/2 per §9).
- [ ] **Step 7: Commit** — `git add lib/parser/blocks/hotels.ts && git commit -m "feat(parser): wire classifyLaterSegment into buildInlineReservations (tier-1 keeps + stash slots)"`
