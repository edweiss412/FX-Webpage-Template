import { describe, expect, test } from "vitest";
import { downgradeRunOfShow } from "@/lib/data/downgradeRunOfShow";
import { decodeRunOfShow } from "@/lib/data/decodeRunOfShow";
import type { RunOfShow } from "@/lib/parser/types";

describe("downgradeRunOfShow — ScheduleDay map → legacy Record<iso, AgendaEntry[]>", () => {
  const titled: RunOfShow = {
    "2025-10-08": {
      entries: [
        { start: "7:15am", title: "Registration" },
        { start: "8:00am", title: "Leaders Breakfast" },
      ],
      showStart: "7:15am",
      window: null,
    },
  };

  test("titled day → entries only; showStart/window dropped", () => {
    const out = downgradeRunOfShow(titled);
    // Assert against the DATA SHAPE, not a rendered container (anti-tautology).
    expect(out["2025-10-08"]).toEqual([
      { start: "7:15am", title: "Registration" },
      { start: "8:00am", title: "Leaders Breakfast" },
    ]);
    // The legacy shape is a bare array — no object keys, no showStart/window.
    expect(Array.isArray(out["2025-10-08"])).toBe(true);
    expect((out["2025-10-08"] as unknown as Record<string, unknown>).showStart).toBeUndefined();
  });

  test("bare-window day (entries:[]) → empty legacy array (the window is unrepresentable in the old shape)", () => {
    const win: RunOfShow = {
      "2025-05-13": {
        entries: [],
        showStart: "7:30am",
        window: { start: "7:30am", end: "5:50pm" },
      },
    };
    const out = downgradeRunOfShow(win);
    expect(out["2025-05-13"]).toEqual([]);
  });

  test("downgrade output is array-shaped (OLD-decoder-valid) AND decodes clean under the new decoder", () => {
    const legacy = downgradeRunOfShow(titled);
    // OLD-decoder validity == every day value is a bare ARRAY. The PRE-Task-6
    // decoder requires arrays and corrupt-skips object days; downgrade restores
    // that array shape. (Plan-review finding 3: do NOT assert the OLD bare-array
    // shape out of the POST-Task-6 decoder — it now WRAPS arrays into ScheduleDay,
    // so the correct expected value below is the WRAPPED shape. The OLD decoder's
    // corrupt-skip-not-throw on a ScheduleDay object is pinned separately in
    // Task 6's decodeRunOfShow.test.ts, not here.)
    expect(Object.values(legacy).every((d) => Array.isArray(d))).toBe(true);
    const decoded = decodeRunOfShow(legacy);
    expect(decoded.corrupt).toBe(false);
    expect(decoded.value).toEqual({
      "2025-10-08": {
        entries: [
          { start: "7:15am", title: "Registration" },
          { start: "8:00am", title: "Leaders Breakfast" },
        ],
        showStart: null,
        window: null,
      },
    });
  });
});
