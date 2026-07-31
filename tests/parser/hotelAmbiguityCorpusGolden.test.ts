// tests/parser/hotelAmbiguityCorpusGolden.test.ts
//
// S4's normative corpus golden (spec §9). PER FIXTURE, not family totals:
// family totals are satisfied by one fixture emitting zero and another two, so
// they cannot detect a redistribution.
//
// Both fixture families are pinned. Earlier spec drafts pinned only `raw/`,
// which is how the multi-group `consultants` case survived three review rounds.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseHotels } from "@/lib/parser/blocks/hotels";
import { newAggregator } from "@/lib/parser/warnings";
import { CORPUS_TEMP_PREFIX } from "../helpers/corpusTemp";
import { WARNING_CARD_COPY_CODES } from "../messages/warningCardCopyRegistry";

// Declared ONCE and read by BOTH the membership guard and the countsFor filters: a
// misspelling then fails the guard AND cannot silently make a filter count nothing.
const OWN_CODE = "HOTEL_INLINE_GROUP_OWN_HOTEL";
const SUSPECTED_CODE = "HOTEL_INLINE_GROUP_HOTEL_SUSPECTED";

const FAMILIES = ["fixtures/shows/raw", "fixtures/shows/exporter-xlsx"] as const;

/** basename (minus .md) → expected card counts. Every fixture is listed. */
const GOLDEN: Record<string, { guest: number; address: number; own: number; suspected: number }> = {
  // ── inline shows: the parser judges the hotel/first-guest boundary ──
  "2024-05-east-coast-family-office": { guest: 1, address: 0, own: 0, suspected: 0 },
  "2025-03-dci-rpas-central": { guest: 1, address: 0, own: 0, suspected: 0 },
  "2025-04-asset-mgmt-cfo-coo": { guest: 1, address: 0, own: 0, suspected: 0 },
  "2025-05-redefining-fixed-income-private-credit": { guest: 1, address: 0, own: 0, suspected: 0 },
  "2025-06-ria-investment-forum": { guest: 1, address: 0, own: 0, suspected: 0 },
  "east-coast": { guest: 1, address: 0, own: 0, suspected: 0 },
  "redefining-fi": { guest: 1, address: 0, own: 0, suspected: 0 },
  ria: { guest: 1, address: 0, own: 0, suspected: 0 },
  // 2 reservations, exactly 1 card: group 2 inherits the hotel name and judges
  // no boundary. A `names.length >= 1` predicate emits 2 and fails here — this
  // row is the anti-tautology anchor for the whole slice.
  consultants: { guest: 1, address: 0, own: 0, suspected: 0 },
  // ── structured shows: guests arrive in their own labeled cell ──
  "2025-10-consultants-roundtable": { guest: 0, address: 0, own: 0, suspected: 0 },
  "2025-10-fixed-income-trading-summit": { guest: 0, address: 0, own: 0, suspected: 0 },
  "2026-03-rpas-central-four-seasons": { guest: 0, address: 0, own: 0, suspected: 0 },
  "2026-04-asset-mgmt-cfo-coo-waldorf": { guest: 0, address: 0, own: 0, suspected: 0 },
  "2026-05-fintech-forum-cto-summit": { guest: 0, address: 0, own: 0, suspected: 0 },
  fintech: { guest: 0, address: 0, own: 0, suspected: 0 },
  "fixed-income": { guest: 0, address: 0, own: 0, suspected: 0 },
  rpas: { guest: 0, address: 0, own: 0, suspected: 0 },
};

function countsFor(path: string) {
  const agg = newAggregator();
  parseHotels(readFileSync(path, "utf8"), "v1", agg);
  return {
    guest: agg.warnings.filter((w) => w.code === "HOTEL_GUEST_SPLIT_AMBIGUOUS").length,
    address: agg.warnings.filter((w) => w.code === "HOTEL_ADDRESS_SPLIT_AMBIGUOUS").length,
    own: agg.warnings.filter((w) => w.code === OWN_CODE).length,
    suspected: agg.warnings.filter((w) => w.code === SUSPECTED_CODE).length,
  };
}

const fixtures = FAMILIES.flatMap((dir) =>
  readdirSync(join(process.cwd(), dir))
    // Serial tests write synthetic fixtures into the corpus under this prefix
    // and a parallel-set reader that does not filter them parses one
    // mid-overlap, making the golden non-deterministic. Pinned by
    // tests/cross-cutting/corpus-temp-prefix.test.ts, whose scanner slices to
    // the next semicolon, so this comment deliberately contains none.
    .filter((f) => f.endsWith(".md") && f !== "README.md" && !f.startsWith(CORPUS_TEMP_PREFIX))
    .map((f) => [f.replace(/\.md$/, ""), join(process.cwd(), dir, f)] as const),
);

describe("hotel ambiguity — corpus golden (spec §9)", () => {
  // Fails-by-default: a NEW fixture has no golden row and trips this before it
  // can silently change the totals.
  it("both new codes are registered for card copy", () => {
    // Couples the filter spellings above to the shipped registry.
    expect(WARNING_CARD_COPY_CODES.has(OWN_CODE), OWN_CODE).toBe(true);
    expect(WARNING_CARD_COPY_CODES.has(SUSPECTED_CODE), SUSPECTED_CODE).toBe(true);
  });

  it("the fixture set and the golden keys are EXACTLY equal", () => {
    // Subset-only ("every fixture has a row") pins ADDITIONS but not DELETIONS:
    // removing or renaming a fixture leaves the per-fixture loop and the totals
    // unchanged while silently shrinking the two-family coverage this file claims.
    const found = fixtures.map(([name]) => name).sort();
    const declared = Object.keys(GOLDEN).sort();
    const missing = found.filter((n) => !declared.includes(n));
    const stale = declared.filter((n) => !found.includes(n));
    expect(missing, `fixtures with no GOLDEN entry: ${missing.join(", ")}`).toEqual([]);
    expect(stale, `GOLDEN rows with no fixture: ${stale.join(", ")}`).toEqual([]);
  });

  it.each(fixtures)("%s emits exactly its golden card counts", (name, path) => {
    expect(countsFor(path)).toEqual(GOLDEN[name]);
  });

  it("totals 9 guest cards, 0 address cards and 0 inline-group cards across both families", () => {
    const total = fixtures.reduce(
      (acc, [, path]) => {
        const c = countsFor(path);
        return {
          guest: acc.guest + c.guest,
          address: acc.address + c.address,
          own: acc.own + c.own,
          suspected: acc.suspected + c.suspected,
        };
      },
      { guest: 0, address: 0, own: 0, suspected: 0 },
    );
    // Zero address cards is EXPECTED, not a gap: no corpus hotel string has more
    // than one street-phrase candidate, and none is a suffixless address. P3 is
    // forward-looking coverage proven by its synthetic emit tests.
    // Zero inline-group cards is likewise EXPECTED (spec §9): the only multi-marker
    // inline cell in the corpus is consultants', whose later segment's prefix is the
    // 2-base-word `Eric Weiss` with no address — tier 3, silent.
    expect(total).toEqual({ guest: 9, address: 0, own: 0, suspected: 0 });
  });
});
