/**
 * idx20 (BL-ROOMS-BREAKOUT-REUSE-DROP) — a breakout room reused across days
 * (two "BREAKOUT N <venue>" blocks sharing a venue but with different sessions)
 * was silently DROPPED by the venue-name dedup. Owner decision (2026-07-03):
 * MERGE into one card — physical specs kept once, time fields concatenated (they
 * carry their own dates), other content fields day-labeled when they differ.
 */
import { describe, it, expect } from "vitest";
import { parseRooms } from "@/lib/parser/blocks/rooms";

const boBlock = (n: number, setup: string, show: string, audio?: string) =>
  [
    `| BREAKOUT ${n} SALON A 40' x 30' x 12' 8th Floor | BREAKOUT ${n} SALON A 40' x 30' x 12' 8th Floor |`,
    `| BO Setup | ${setup} |`,
    `| BO Show Time | ${show} |`,
    ...(audio ? [`| BO Audio | ${audio} |`] : []),
  ].join("\n");

describe("parseBoRooms — idx20 reused breakout merges into one card", () => {
  it("merges two same-venue sessions: one room, specs once, time concatenated, setup day-labeled", () => {
    const md = `${boBlock(1, "Theater for 60", "6/1 @ 9am")}\n\n${boBlock(2, "Rounds for 40", "6/2 @ 9am")}`;
    const bo = parseRooms(md, "v2").filter((r) => r.kind === "breakout");
    expect(bo).toHaveLength(1);
    expect(bo[0]!.name).toBe("SALON A");
    // physical specs kept once (same room)
    expect(bo[0]!.dimensions).toBe("40' x 30' x 12'");
    expect(bo[0]!.floor).toBe("8th Floor");
    // time carries its own dates → concatenated
    expect(bo[0]!.show_time).toBe("6/1 @ 9am / 6/2 @ 9am");
    // content fields day-labeled from the session's show date
    expect(bo[0]!.setup).toBe("6/1: Theater for 60 / 6/2: Rounds for 40");
  });

  it("keeps a single per-day value un-labeled when the same value repeats across sessions", () => {
    // audio identical both days → NOT concatenated/labeled; setup differs → labeled.
    const md = `${boBlock(1, "Theater for 60", "6/1 @ 9am", "2 mics")}\n\n${boBlock(2, "Rounds for 40", "6/2 @ 9am", "2 mics")}`;
    const bo = parseRooms(md, "v2").filter((r) => r.kind === "breakout");
    expect(bo).toHaveLength(1);
    expect(bo[0]!.audio).toBe("2 mics");
    expect(bo[0]!.setup).toBe("6/1: Theater for 60 / 6/2: Rounds for 40");
  });

  it("does NOT concatenate identical sessions (double-parse safe)", () => {
    const md = `${boBlock(1, "Theater for 60", "6/1 @ 9am")}\n\n${boBlock(1, "Theater for 60", "6/1 @ 9am")}`;
    const bo = parseRooms(md, "v2").filter((r) => r.kind === "breakout");
    expect(bo).toHaveLength(1);
    expect(bo[0]!.setup).toBe("Theater for 60");
    expect(bo[0]!.show_time).toBe("6/1 @ 9am");
  });

  it("distinct venues stay distinct (no spurious merge)", () => {
    const md = `${boBlock(1, "Theater for 60", "6/1 @ 9am")}\n\n${[
      "| BREAKOUT 2 SALON B 40' x 30' x 12' 8th Floor | BREAKOUT 2 SALON B 40' x 30' x 12' 8th Floor |",
      "| BO Setup | Rounds for 40 |",
      "| BO Show Time | 6/2 @ 9am |",
    ].join("\n")}`;
    const bo = parseRooms(md, "v2").filter((r) => r.kind === "breakout");
    expect(bo.map((r) => r.name).sort()).toEqual(["SALON A", "SALON B"]);
  });
});
