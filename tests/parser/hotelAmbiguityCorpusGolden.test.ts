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

const FAMILIES = ["fixtures/shows/raw", "fixtures/shows/exporter-xlsx"] as const;

/** basename (minus .md) → expected card counts. Every fixture is listed. */
const GOLDEN: Record<string, { guest: number; address: number }> = {
  // ── inline shows: the parser judges the hotel/first-guest boundary ──
  "2024-05-east-coast-family-office": { guest: 1, address: 0 },
  "2025-03-dci-rpas-central": { guest: 1, address: 0 },
  "2025-04-asset-mgmt-cfo-coo": { guest: 1, address: 0 },
  "2025-05-redefining-fixed-income-private-credit": { guest: 1, address: 0 },
  "2025-06-ria-investment-forum": { guest: 1, address: 0 },
  "east-coast": { guest: 1, address: 0 },
  "redefining-fi": { guest: 1, address: 0 },
  ria: { guest: 1, address: 0 },
  // 2 reservations, exactly 1 card: group 2 inherits the hotel name and judges
  // no boundary. A `names.length >= 1` predicate emits 2 and fails here — this
  // row is the anti-tautology anchor for the whole slice.
  consultants: { guest: 1, address: 0 },
  // ── structured shows: guests arrive in their own labeled cell ──
  "2025-10-consultants-roundtable": { guest: 0, address: 0 },
  "2025-10-fixed-income-trading-summit": { guest: 0, address: 0 },
  "2026-03-rpas-central-four-seasons": { guest: 0, address: 0 },
  "2026-04-asset-mgmt-cfo-coo-waldorf": { guest: 0, address: 0 },
  "2026-05-fintech-forum-cto-summit": { guest: 0, address: 0 },
  fintech: { guest: 0, address: 0 },
  "fixed-income": { guest: 0, address: 0 },
  rpas: { guest: 0, address: 0 },
};

function countsFor(path: string) {
  const agg = newAggregator();
  parseHotels(readFileSync(path, "utf8"), "v1", agg);
  return {
    guest: agg.warnings.filter((w) => w.code === "HOTEL_GUEST_SPLIT_AMBIGUOUS").length,
    address: agg.warnings.filter((w) => w.code === "HOTEL_ADDRESS_SPLIT_AMBIGUOUS").length,
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
  it("every corpus fixture has a golden row", () => {
    const missing = fixtures.map(([name]) => name).filter((n) => !(n in GOLDEN));
    expect(missing, `fixtures with no GOLDEN entry: ${missing.join(", ")}`).toEqual([]);
  });

  it.each(fixtures)("%s emits exactly its golden card counts", (name, path) => {
    expect(countsFor(path)).toEqual(GOLDEN[name]);
  });

  it("totals 9 guest cards and 0 address cards across both families", () => {
    const total = fixtures.reduce(
      (acc, [, path]) => {
        const c = countsFor(path);
        return { guest: acc.guest + c.guest, address: acc.address + c.address };
      },
      { guest: 0, address: 0 },
    );
    // Zero address cards is EXPECTED, not a gap: no corpus hotel string has more
    // than one street-phrase candidate, and none is a suffixless address. P3 is
    // forward-looking coverage proven by its synthetic emit tests.
    expect(total).toEqual({ guest: 9, address: 0 });
  });
});
