# Task 1: Detector core — exported `classifyLaterSegment` (D1–D7)

**Files:**

- Create: tests/parser/inlineLaterGroupDetector.test.ts
- Modify: `lib/parser/blocks/hotels.ts` (add the exported detector beside `buildInlineHotel`; touch nothing else)

**Interfaces:**

- Consumes: `buildInlineHotel(rest, ordinal, contextYear)` (module-private `InlineBuild` return `{ row, judgedGuestBoundary, addressAmbiguity? }`, declared at `lib/parser/blocks/hotels.ts:887-892`; a read site is `lib/parser/blocks/hotels.ts:724`); `STREET_ADDRESS_RE`/`STREET_ADDRESS_ZIP_RE`/`looksLikeStreetStart`/`stripConfTokens` machinery in `lib/parser/blocks/hotelConfTokens.ts`.
- Produces (later tasks rely on these EXACT names):

```ts
export type LaterSegmentOutcome =
  | { tier: 1; hotelText: string; build: InlineBuild }
  | { tier: 2 }
  | { tier: 3 };

export function classifyLaterSegment(
  rawSegment: string, // pre-D1 segment as returned by splitInlineReservationGroups
  ordinal: number,
  contextYear: string | null,
): LaterSegmentOutcome;
```

`InlineBuild` stays module-private; the alias is structural (repo emits no d.ts). `ordinal` is a precondition (positive integer), not runtime-checked.

**Normative algorithm:** spec §3, D1–D7 + S8/S9, verbatim — D1 normalization (`&#10;`/`&#9;`/`\r` → spaces, zero-width strip, straight/smart double quotes → spaces, whitespace collapse, trim — `normalizeHotelCellText` semantics); D2 divider strip; D3 prefix cut at the FIVE-way minimum (dash-run `[-–—]{1,3}\s*#?\s*(\d{4,})` no trailing `\b`, no street exemption, five-clause isZip4 exclusion / hash-only `#\s*\d{4,}` / bare `\b\d{6,}\b` / `Check In` match start / `s2.length`); D4 dual-regex smaller-index-longer-tie anchor; D4b postal-first tail arms (2,3,1) with postal-stop, arm-1 separator requirement, arm-2 city 1–3, free-run interior caps (name 4 / ZIP-arm 4 / street-arm 3); D5 seven-conjunct tier-1 partition with guard (d) ≤4 plain words, residual arms a0/a/b/c, post-prefix scan arm (i) raw + RESTRICTED-neutralized reads (`[-–—]+(?=\d)` minus isZip4) and arm (ii) conf families with ZIP+4 exclusion; D6 rebuild clauses c0/c1/c2 (overlap-merged token counting); D7 verdict fields. `baseWords` = whitespace count minus trailing `/^\p{Lu}\.?$/u` initial.

## Steps

- [ ] **Step 1: Write the failing unit tests**

Create tests/parser/inlineLaterGroupDetector.test.ts with this harness and the unit-oracle set below. Every oracle's input/assertion text is copied byte-exact from its named spec §8.1 row (the row name is in the `it()` title); the code below is complete for the first three and the remaining `it()` blocks follow the identical pattern with their row's literal input and assertions.

```ts
import { describe, expect, it } from "vitest";
import { classifyLaterSegment } from "@/lib/parser/blocks/hotels";

describe("classifyLaterSegment unit oracles (spec 2026-07-27 §8.1)", () => {
  it("Tier 2, D6 names-empty abort", () => {
    const outcome = classifyLaterSegment(
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe Check In: 3/3/26 Check Out: 3/4/26",
      1,
      "2026",
    );
    expect(outcome.tier).toBe(2);
  });

  it("Detector guard branches: divider-only and empty segments are tier 3", () => {
    expect(classifyLaterSegment("---", 1, "2026")).toEqual({ tier: 3 });
    expect(classifyLaterSegment("", 1, "2026")).toEqual({ tier: 3 });
  });

  it("contextYear + ordinal forwarding (yearless segment)", () => {
    const outcome = classifyLaterSegment(
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3 Check Out: 3/4",
      2,
      "2026",
    );
    expect(outcome.tier).toBe(1);
    if (outcome.tier !== 1) return;
    expect(outcome.build.row.ordinal).toBe(2);
    expect(outcome.build.row.check_in).toBe("2026-03-03");
    expect(outcome.build.row.check_out).toBe("2026-03-04");
    expect(outcome.build.row.names).toEqual(["Jane Doe"]);
  });
});
```

Remaining unit `it()` blocks (same file, same pattern — input + assertions from the named row):

1. "contextYear-null postal segment" (row: Detector guard branches (ii)) — tier 1 with `build.row.check_in === null` and `check_out === null`.
2. "Trailing-initial UNIT oracle" — `classifyLaterSegment("Marriott Plaza Jane D - 1002 Check In: 3/3/26 Check Out: 3/4/26", 1, "2026")` → `outcome.tier === 3` (year-suffixed per the §8.1 materialization convention — the ONLY authorized yearless oracles are contextYear forwarding and contextYear-null; plan R5 f2) (4 whitespace words, 3 BASE words). Failure mode: whitespace word-count implementation returns `{ tier: 2 }`.
3. "Zero-width strip UNIT oracle" — the row's segment literal with U+200B (`​`) between `2` and `00` of the street number → tier 1, `build.row.hotel_name === "Marriott Downtown 200 Oak Ave, Chicago, IL 60601"` (zero-width GONE), `build.row.hotel_address === null` (D6 leaves the split to the caller's `stripHotelNameConf` pass), names `["Jane Doe"]`. Materialize ONLY U+200B/U+200C/U+200D, never U+FEFF (BOM is JavaScript `\s`). Failure mode: strip-less D1 falls to the word arm, `{ tier: 2 }`.
4. "D4 smaller-index precedence" unit assertion (optional per spec — include): the row's input → tier 2.

Failure modes stated per group: (1) kills fire-tier-1-on-D4-match; (2) kills missing guard branches / date-machinery bypass; (3) kills `buildInlineHotel(rest, 1, null)` hardcoding of ordinal/contextYear.

**Branch coverage matrix (plan R4 f1 — MANDATORY; every D1-D6 branch step 4 implements has at least one unit oracle in THIS file before implementation).** Each entry names its spec §8.1 row; the unit oracle calls `classifyLaterSegment` directly with the row's later-segment literal and asserts the stated tier (plus `hotelText`/`build.row` fields where the row keeps). Task 2 re-verifies the same rows at the integration layer (rows/warnings/stripHotelNameConf interplay) — a different observation surface, not duplication.

- D1 entity member: the `&#10;` envelope keep input → tier 1 AND `build.row.hotel_name` equals the row's NORMALIZED literal (entity replaced by one space, doubles collapsed) with `hotel_address === null` — tier alone is insufficient, a no-op D1 can still reach tier 1 with corrupted text (plan R5 f1). D1 tab member + marker bound: a segment whose second marker is written `Check&#9;In` → tier 2 (the ≥2-marker S9 bound fires on D1 text — the unit-level form of the tab-entity-split degrade). D1 quote members: quoted corpus keep AND smart-quote keep → tier 1 each.
- D2: divider strip ×3 dash forms → tier 1, NAME-asserted.
- D3 five-way minimum: two-guest hyphen keep (dash-run cut) → tier 1; hash counterfeit → tier 2; bare-conf → tier 2; tail keep (Check-In-start cut) → tier 1; position-0 all-address keep (s2.length arm) → tier 1.
- isZip4 five-clause boundary: the tier-1-path ZIP+4 rejection row's five materializations — first FOUR → tier 2, FIFTH (`1234A`) → tier 1 — plus the true-ZIP+4 keep → tier 1.
- D4 anchor: comma-less city (comma before state) keep (tie-break) → tier 1; fully comma-less US (arm 3) → tier 1; arm-3 cap boundary EXACTLY-3 keep → tier 1 AND the ZIP-arm-boundary 4-keep/5-demote pair (the R4-f1 concrete case: a two-word-capped arm 3 fails the exactly-3 oracle HERE, in Task 1); Canadian postal keep → tier 1; arm-1 unit keeps ×2 + one separator-matrix materialization → tier 1; postal-stop (postal-then-trailing-unit) → tier 2; interior free-run caps: FL keep, exact-3 keep, name-region 3-word keep → tier 1 each.
- Residual guards: a0 bare-alias (one of the ×8) → tier 2; (a) ZIP-less city comma residual → tier 2; (b) unconsumed-postal (unit-tail-comma-less) → tier 2; (c) guard-(c) note text → tier 2; (d) plain-word cap 4-keep → tier 1 / 5-demote → tier 2.
- D5 word arm: tier-2 word arm row → tier 2. Post-prefix scan arm (i): post-prefix street-only → tier 2 (raw read); dash-glued street one form → tier 2 (neutralized read); word-glued street one form → tier 2; digit-run prose one form → tier 2. Arm (ii): conf-glue dash form → tier 2; hash/bare glue → tier 2.
- D6: dotted c0 pin → tier 2; Doug c1 → tier 2; Alice c2 → tier 2 (names-empty abort already above).

Remaining materializations of each family (the full ×3 dash forms, all 12 arm-1 syntax cells, all 8 a0 aliases, both provenance paths, etc.) stay Task-2 integration rows — the matrix pins every BRANCH at unit level; Task 2 exhausts every MATERIALIZATION. **Byte-assert rule for every tier-1 matrix entry (plan R5 f1 class-sweep):** each tier-1 oracle asserts the row's stated `hotel_name`/`hotel_address` (or `hotelText`) literals and `names`, never `tier === 1` alone — the branch under test transforms TEXT, so only text assertions kill its no-op mutant.

- [ ] **Step 2: Run tests, verify they fail on the missing export**

Run: `pnpm vitest run tests/parser/inlineLaterGroupDetector.test.ts`
Expected: FAIL — `classifyLaterSegment` is not exported.

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/parser/inlineLaterGroupDetector.test.ts
git commit -m "test(parser): unit oracles for classifyLaterSegment (D1-D7 detector core)"
```

- [ ] **Step 4: Implement `classifyLaterSegment` in `lib/parser/blocks/hotels.ts`**

Implement D1–D7 per the spec section quoted above, as one exported function plus module-private helpers, placed after `buildInlineHotel`. Reuse existing machinery (`buildInlineHotel` for D6, `hotelConfTokens` regex family, `looksLikeStreetStart`); duplicate `baseWords` logic verbatim if extraction would disturb existing callers (tests pin behavior, not code location — spec §3). Do NOT wire any caller yet (T2 wires `buildInlineReservations`; T1's surface is the exported function only).

- [ ] **Step 5: Run the unit tests, verify PASS**

Run: `pnpm vitest run tests/parser/inlineLaterGroupDetector.test.ts`
Expected: PASS (all unit oracles).

- [ ] **Step 6: Full-suite + typecheck sanity**

Run: `pnpm typecheck && pnpm vitest run tests/parser`
Expected: PASS — the unwired detector must not change any existing parser behavior.

- [ ] **Step 7: Commit**

```bash
git add lib/parser/blocks/hotels.ts
git commit -m "feat(parser): add classifyLaterSegment three-tier inline later-group detector"
```
