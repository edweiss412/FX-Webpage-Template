import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseRooms } from "@/lib/parser/blocks/rooms";
import { detectVersion } from "@/lib/parser/schema";

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

  it("finds 3 breakout rooms", () => {
    expect(bo).toHaveLength(3);
  });

  it("finds 1 additional room", () => {
    expect(additional).toHaveLength(1);
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
