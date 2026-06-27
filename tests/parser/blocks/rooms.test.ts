import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseRooms, V4_BARE_LABEL_VOCAB } from "@/lib/parser/blocks/rooms";
import { detectVersion } from "@/lib/parser/schema";
import { newAggregator } from "@/lib/parser/warnings";
import { gatedVocabCorrect } from "@/lib/parser/typoGate";
import { unambiguousTypos } from "../_typoGenerator";

const ALL_FIXTURES = [
  "fixtures/shows/raw/2024-05-east-coast-family-office.md",
  "fixtures/shows/raw/2025-03-dci-rpas-central.md",
  "fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md",
  "fixtures/shows/raw/2025-05-redefining-fixed-income-private-credit.md",
  "fixtures/shows/raw/2025-06-ria-investment-forum.md",
  "fixtures/shows/raw/2025-10-consultants-roundtable.md",
  "fixtures/shows/raw/2025-10-fixed-income-trading-summit.md",
  "fixtures/shows/raw/2026-03-rpas-central-four-seasons.md",
  "fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md",
  "fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md",
] as const;

// ── v4 structured rooms (2026-04-asset-mgmt-cfo-coo-waldorf) ─────────────────
// Fixture lines 54-58: GENERAL SESSION block with Setup/Set Time/Show Time/Strike Time

describe("parseRooms — v4 GS from waldorf (2026-04)", () => {
  const md = readFileSync("fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md", "utf8");
  const rooms = parseRooms(md, "v4");
  const gs = rooms.filter((r) => r.kind === "gs");

  it("finds at least 1 GS room", () => {
    expect(gs.length).toBeGreaterThanOrEqual(1);
  });

  it("gs room kind is 'gs'", () => {
    expect(gs[0]!.kind).toBe("gs");
  });

  it("gs room name contains SINCLAIR", () => {
    expect(gs[0]!.name).toContain("SINCLAIR");
  });

  it("setup is '9 Clusters of 6 ppl = 54 ppl total'", () => {
    expect(gs[0]!.setup).toBe("9 Clusters of 6 ppl = 54 ppl total");
  });

  it("set_time is '4/20 @ 8:00 AM'", () => {
    expect(gs[0]!.set_time).toBe("4/20 @ 8:00 AM");
  });

  it("show_time is '4/21 @ 7:30 AM'", () => {
    expect(gs[0]!.show_time).toBe("4/21 @ 7:30 AM");
  });

  it("strike_time is '4/22 @ 12:00 PM'", () => {
    expect(gs[0]!.strike_time).toBe("4/22 @ 12:00 PM");
  });
});

// ── v4 structured rooms (2026-03-rpas-central-four-seasons) ──────────────────
describe("parseRooms — v4 GS + 2 breakouts (2026-03)", () => {
  const md = readFileSync("fixtures/shows/raw/2026-03-rpas-central-four-seasons.md", "utf8");
  const rooms = parseRooms(md, "v4");
  const gs = rooms.filter((r) => r.kind === "gs");
  const bo = rooms.filter((r) => r.kind === "breakout");

  it("finds 1 GS room", () => {
    expect(gs).toHaveLength(1);
  });

  it("finds 2 breakout rooms", () => {
    expect(bo).toHaveLength(2);
  });

  it("GS room name contains GRAND BALLROOM", () => {
    expect(gs[0]!.name).toContain("GRAND BALLROOM");
  });

  it("GS set_time is '3/23 @ 8am'", () => {
    expect(gs[0]!.set_time).toBe("3/23 @ 8am");
  });

  it("breakout 1 name contains STATE A", () => {
    expect(bo[0]!.name).toContain("STATE A");
  });

  it("breakout 2 name contains STATE B", () => {
    expect(bo[1]!.name).toContain("STATE B");
  });
});

// ── v2 GS-prefix rooms (2025-04-asset-mgmt-cfo-coo) ─────────────────────────
describe("parseRooms — v2 GS-prefix + BO-prefix + additional (2025-04)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md", "utf8");
  const rooms = parseRooms(md, "v2");
  const gs = rooms.filter((r) => r.kind === "gs");
  const bo = rooms.filter((r) => r.kind === "breakout");
  const additional = rooms.filter((r) => r.kind === "additional");

  it("finds 1 GS room", () => {
    expect(gs).toHaveLength(1);
  });

  it("GS setup contains '8 Rounds of 7 ppl'", () => {
    expect(gs[0]!.setup).toContain("8 Rounds");
  });

  it("GS set_time is '4/7 @ 10:00 AM'", () => {
    expect(gs[0]!.set_time).toBe("4/7 @ 10:00 AM");
  });

  it("GS scenic contains 'Blue Spandex'", () => {
    expect(gs[0]!.scenic).toContain("Blue Spandex");
  });

  it("drops the 3 empty 'BREAKOUT N BREAKOUT ROOM Dimensions Floor' template stubs", () => {
    // Unfilled placeholder templates (no real name beyond the column labels, no
    // fields) — phantom rooms, now suppressed consistently with the v4 path.
    expect(bo).toHaveLength(0);
  });

  it("drops the empty 'ADDITIONAL ROOM' template stub", () => {
    expect(additional).toHaveLength(0);
  });
});

// ── v2 GS-prefix rooms (2025-10-fixed-income-trading-summit) ─────────────────
describe("parseRooms — v2 GS + 1 breakout (2025-10-trading-summit)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-10-fixed-income-trading-summit.md", "utf8");
  const rooms = parseRooms(md, "v2");
  const gs = rooms.filter((r) => r.kind === "gs");
  const bo = rooms.filter((r) => r.kind === "breakout");

  it("finds 1 GS room", () => {
    expect(gs).toHaveLength(1);
  });

  it("GS name contains SALON ABC", () => {
    expect(gs[0]!.name).toContain("SALON ABC");
  });

  it("GS set_time is '10/19 @ 12PM'", () => {
    expect(gs[0]!.set_time).toBe("10/19 @ 12PM");
  });

  it("finds at least 1 breakout", () => {
    expect(bo.length).toBeGreaterThanOrEqual(1);
  });

  it("breakout name contains SALON D", () => {
    expect(bo[0]!.name).toContain("SALON D");
  });
});

// ── v1 GS rooms (2024-05-east-coast-family-office) ───────────────────────────
describe("parseRooms — v1 GS-prefix rooms (2024-05)", () => {
  const md = readFileSync("fixtures/shows/raw/2024-05-east-coast-family-office.md", "utf8");
  const rooms = parseRooms(md, "v1");
  const gs = rooms.filter((r) => r.kind === "gs");

  it("finds 1 GS room", () => {
    expect(gs).toHaveLength(1);
  });

  it("GS setup contains '18 Tables'", () => {
    expect(gs[0]!.setup).toContain("18 Tables");
  });

  it("GS audio is populated", () => {
    expect(gs[0]!.audio).toBeTruthy();
  });

  it("GS scenic is populated", () => {
    expect(gs[0]!.scenic).toBeTruthy();
  });
});

// ── Corpus-coverage test ──────────────────────────────────────────────────────
describe("parseRooms — corpus coverage", () => {
  for (const path of ALL_FIXTURES) {
    it(`${path} yields array, all kinds valid`, () => {
      const md = readFileSync(path, "utf8");
      const version = detectVersion(md);
      const rooms = parseRooms(md, version ?? "v2");
      expect(Array.isArray(rooms)).toBe(true);
      for (const r of rooms) {
        expect(["gs", "breakout", "additional"]).toContain(r.kind);
        expect(typeof r.name).toBe("string");
        expect(r.name.length).toBeGreaterThan(0);
      }
    });
  }
});

// ── PR-D3: v4 fuzzy field-label recovery ─────────────────────────────────────
const FLA = (agg: ReturnType<typeof newAggregator>) =>
  agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED");
// A v4 GS block. First row MUST be an exact bare label so hasBareV4DataRow detects v4.
function v4Gs(name: string, rows: string[]): string {
  return [`| GENERAL SESSION ${name} | |`, ...rows].join("\n") + "\n";
}
function v4Breakout(name: string, rows: string[]): string {
  return [`| BREAKOUT 1 ${name} | |`, ...rows].join("\n") + "\n";
}

describe("parseRooms — v4 fuzzy field-label recovery (PR-D3)", () => {
  it("recovers a misspelled label into the right field and warns once (kind=rooms)", () => {
    // "Setup" exact = detector + claims setup; "Lightng" typo recovers into lighting.
    const agg = newAggregator();
    const rooms = parseRooms(
      v4Gs("BALLROOM", ["| Setup | 100 chairs |", "| Lightng | 4 movers |"]),
      "v4",
      agg,
    );
    const gs = rooms.find((r) => r.kind === "gs")!;
    expect(gs.setup).toBe("100 chairs");
    expect(gs.lighting).toBe("4 movers");
    const warns = FLA(agg);
    expect(warns).toHaveLength(1);
    expect(warns[0]!.severity).toBe("warn");
    expect(warns[0]!.blockRef?.kind).toBe("rooms");
    expect(warns[0]!.rawSnippet).toBe("Lightng");
  });

  it("exact-wins: a real exact label suppresses a real fuzzy sibling for the same field, either order, no warn", () => {
    // Leading "Setup" detects the v4 block. "Lightng" (>=5 chars) IS a fuzzy candidate for
    // lighting, so a real exact "Lighting | REAL" must suppress it (exactReal guard) either
    // order — this genuinely exercises the post-loop exactReal skip.
    const a = newAggregator();
    const ra = parseRooms(
      v4Gs("A", ["| Setup | det |", "| Lighting | REAL |", "| Lightng | WRONG |"]),
      "v4",
      a,
    ).find((r) => r.kind === "gs")!;
    expect(ra.lighting).toBe("REAL");
    expect(FLA(a)).toHaveLength(0);
    const b = newAggregator();
    const rb = parseRooms(
      v4Gs("B", ["| Setup | det |", "| Lightng | WRONG |", "| Lighting | REAL |"]),
      "v4",
      b,
    ).find((r) => r.kind === "gs")!;
    expect(rb.lighting).toBe("REAL");
    expect(FLA(b)).toHaveLength(0);
  });

  it("empty exact does NOT claim: a real typo sibling recovers and warns", () => {
    // "Setup" exact (detector) is real; "Lighting" exact is EMPTY so does not claim lighting;
    // "Lightng" (>=5 chars) typo recovers into lighting.
    const agg = newAggregator();
    const gs = parseRooms(
      v4Gs("C", ["| Setup | x |", "| Lighting | |", "| Lightng | 4 movers |"]),
      "v4",
      agg,
    ).find((r) => r.kind === "gs")!;
    expect(gs.lighting).toBe("4 movers");
    expect(FLA(agg)).toHaveLength(1);
  });

  it("SENTINEL exact does NOT claim: a sentinel exact value never blocks a real fuzzy recovery", () => {
    // "Lighting | TBD" is a sentinel → does not claim lighting; "Lightng | Real" recovers.
    const agg = newAggregator();
    const gs = parseRooms(
      v4Gs("D", ["| Setup | x |", "| Lighting | TBD |", "| Lightng | Real |"]),
      "v4",
      agg,
    ).find((r) => r.kind === "gs")!;
    expect(gs.lighting).toBe("Real");
    expect(FLA(agg)).toHaveLength(1);
  });

  it("two fuzzy siblings: last-write-wins, single warn", () => {
    const agg = newAggregator();
    const gs = parseRooms(
      v4Gs("E", ["| Setup | x |", "| Lightng | A |", "| Lightng | B |"]),
      "v4",
      agg,
    ).find((r) => r.kind === "gs")!;
    expect(gs.lighting).toBe("B");
    expect(FLA(agg)).toHaveLength(1);
  });

  it("PHANTOM guard: fuzzy-only content does NOT resurrect a placeholder breakout (room dropped, no warn)", () => {
    // Placeholder name + all exact rows empty + one typo with a value → room must be DROPPED.
    const agg = newAggregator();
    const rooms = parseRooms(
      v4Breakout("BREAKOUT ROOM", ["| Setup | |", "| Scnic | white cyc |"]),
      "v4",
      agg,
    );
    expect(rooms.some((r) => r.kind === "breakout")).toBe(false);
    expect(FLA(agg)).toHaveLength(0);
  });

  it("REAL-ROOM fuzzy: a non-placeholder breakout recovers a typo'd field and warns", () => {
    const agg = newAggregator();
    const rooms = parseRooms(
      v4Breakout("SALON D", ["| Setup | |", "| Scnic | white cyc |"]),
      "v4",
      agg,
    );
    const bo = rooms.find((r) => r.kind === "breakout");
    expect(bo?.scenic).toBe("white cyc");
    expect(FLA(agg)).toHaveLength(1);
  });

  it("exact alias 'backdrop / scenic' routes to scenic with NO fuzzy warning", () => {
    const agg = newAggregator();
    const gs = parseRooms(
      v4Gs("F", ["| Setup | x |", "| backdrop / scenic | blue |"]),
      "v4",
      agg,
    ).find((r) => r.kind === "gs")!;
    expect(gs.scenic).toBe("blue");
    expect(FLA(agg)).toHaveLength(0);
  });

  it("multi-block isolation: the same typo in two blocks emits two independent warnings", () => {
    const agg = newAggregator();
    const md =
      v4Gs("G", ["| Setup | x |", "| Lightng | A |"]) +
      v4Breakout("SALON E", ["| Setup | y |", "| Lightng | B |"]);
    parseRooms(md, "v4", agg);
    expect(FLA(agg)).toHaveLength(2);
  });

  it("below-minLen / tie-abort: short or ambiguous labels are not fuzz-recognized (field stays null)", () => {
    const agg = newAggregator();
    const gs = parseRooms(v4Gs("H", ["| Setup | x |", "| Pwr | y |"]), "v4", agg).find(
      (r) => r.kind === "gs",
    )!;
    expect(gs.power).toBeNull(); // "Pwr" (3 chars) < minLen 5 → not corrected
    expect(FLA(agg)).toHaveLength(0);
  });

  it("multiword-alias typo stays P4 (dropped, not recovered): 'Backdrop Scnic' is not fuzzed", () => {
    const agg = newAggregator();
    const gs = parseRooms(
      v4Gs("I", ["| Setup | x |", "| Backdrop Scnic | blue |"]),
      "v4",
      agg,
    ).find((r) => r.kind === "gs")!;
    expect(gs.scenic).toBeNull(); // distance > 1 from the 12 bare labels → null
    expect(FLA(agg)).toHaveLength(0);
  });
});

describe("parseRooms — v4 label gate corrects unseen typos (PR-D3)", () => {
  it("corrects unambiguous single-edit typos of every bare label back to that label", () => {
    const opts = { minLen: 5, tieAbort: true } as const;
    expect(V4_BARE_LABEL_VOCAB.length).toBe(12);
    for (const member of V4_BARE_LABEL_VOCAB) {
      for (const typo of unambiguousTypos(member, V4_BARE_LABEL_VOCAB, { minLen: 5 })) {
        const fix = gatedVocabCorrect(typo, V4_BARE_LABEL_VOCAB, opts);
        expect(fix?.corrected, `${typo} → ${member}`).toBe(true);
        expect(fix?.match, `${typo} → ${member}`).toBe(member);
      }
    }
  }, 30000); // generous timeout (PR-D1 CI-shard lesson; small vocab here, but be safe)
});
