import { describe, expect, it } from "vitest";
import { aggregateDays } from "@/lib/crew/agendaDisplay";
import type { ShowRow } from "@/lib/parser/types";

const dates = (o: Partial<ShowRow["dates"]> = {}): ShowRow["dates"] => ({
  travelIn: null,
  set: null,
  showDays: [],
  travelOut: null,
  ...o,
});

describe("aggregateDays — Show Day numbering (bug #316 item 2)", () => {
  it("numbers show days 1..N by CHRONOLOGICAL order, not array order", () => {
    // showDays deliberately out of order; travelIn + travelOut bracket them.
    const rows = aggregateDays(
      dates({
        travelIn: "2025-10-18",
        set: "2025-10-19",
        showDays: ["2025-10-22", "2025-10-20", "2025-10-21"],
        travelOut: "2025-10-23",
      }),
    );
    // Expected labels derived from the fixture (3 show days, sorted ASC), not hardcoded max.
    const showRows = rows.filter((r) => r.phase === "Show");
    expect(showRows.map((r) => r.date)).toEqual(["2025-10-20", "2025-10-21", "2025-10-22"]);
    expect(showRows.map((r) => r.label)).toEqual(showRows.map((_, i) => `Show Day ${i + 1}`));
    // Non-show labels equal their phase; phase is UNCHANGED.
    const byDate = new Map(rows.map((r) => [r.date, r]));
    expect(byDate.get("2025-10-18")).toMatchObject({ phase: "Travel In", label: "Travel In" });
    expect(byDate.get("2025-10-19")).toMatchObject({ phase: "Set", label: "Set" });
    expect(byDate.get("2025-10-23")).toMatchObject({ phase: "Travel Out", label: "Travel Out" });
    // "Show" phase never leaks into the label field.
    expect(rows.every((r) => r.label !== "Show")).toBe(true);
  });

  it("single show day → 'Show Day 1'", () => {
    const rows = aggregateDays(dates({ showDays: ["2025-10-20"] }));
    expect(rows).toEqual([{ date: "2025-10-20", phase: "Show", label: "Show Day 1" }]);
  });

  it("a showDays date colliding with set is deduped to 'Set' and NOT counted as a show day", () => {
    // 2025-10-19 is both set and a showDays entry → first-wins = Set.
    const rows = aggregateDays(
      dates({ set: "2025-10-19", showDays: ["2025-10-19", "2025-10-20", "2025-10-21"] }),
    );
    const byDate = new Map(rows.map((r) => [r.date, r]));
    expect(byDate.get("2025-10-19")).toMatchObject({ phase: "Set", label: "Set" });
    // Remaining show days number 1..2 CONTIGUOUSLY (no gap from the collided date).
    expect(byDate.get("2025-10-20")).toMatchObject({ phase: "Show", label: "Show Day 1" });
    expect(byDate.get("2025-10-21")).toMatchObject({ phase: "Show", label: "Show Day 2" });
  });
});
