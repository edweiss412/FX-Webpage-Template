# Task 1: Detector core — exported `classifyLaterSegment` (D1–D7)

**Files:**
- Create: `tests/parser/inlineLaterGroupDetector.test.ts`
- Modify: `lib/parser/blocks/hotels.ts` (add the exported detector beside `buildInlineHotel`; touch nothing else)

**Interfaces:**
- Consumes: `buildInlineHotel(rest, ordinal, contextYear)` (module-private `InlineBuild` return `{ row, judgedGuestBoundary, addressAmbiguity? }`, read at `lib/parser/blocks/hotels.ts:724`); `STREET_ADDRESS_RE`/`STREET_ADDRESS_ZIP_RE`/`looksLikeStreetStart`/`stripConfTokens` machinery in `lib/parser/blocks/hotelConfTokens.ts`.
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

Create `tests/parser/inlineLaterGroupDetector.test.ts` with this harness and the unit-oracle set below. Every oracle's input/assertion text is copied byte-exact from its named spec §8.1 row (the row name is in the `it()` title); the code below is complete for the first three and the remaining `it()` blocks follow the identical pattern with their row's literal input and assertions.

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
2. "Trailing-initial UNIT oracle" — `classifyLaterSegment("Marriott Plaza Jane D - 1002 Check In: 3/3 Check Out: 3/4", 1, "2026")` → `outcome.tier === 3` (4 whitespace words, 3 BASE words). Failure mode: whitespace word-count implementation returns `{ tier: 2 }`.
3. "Zero-width strip UNIT oracle" — the row's segment literal with U+200B (`​`) between `2` and `00` of the street number → tier 1, `build.row.hotel_name === "Marriott Downtown 200 Oak Ave, Chicago, IL 60601"` (zero-width GONE), `build.row.hotel_address === null` (D6 leaves the split to the caller's `stripHotelNameConf` pass), names `["Jane Doe"]`. Materialize ONLY U+200B/U+200C/U+200D, never U+FEFF (BOM is JavaScript `\s`). Failure mode: strip-less D1 falls to the word arm, `{ tier: 2 }`.
4. "D4 smaller-index precedence" unit assertion (optional per spec — include): the row's input → tier 2.

Failure modes stated per group: (1) kills fire-tier-1-on-D4-match; (2) kills missing guard branches / date-machinery bypass; (3) kills `buildInlineHotel(rest, 1, null)` hardcoding of ordinal/contextYear.

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
