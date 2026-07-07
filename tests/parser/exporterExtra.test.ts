import { describe, it, expect } from "vitest";
import { normalizeNewlines } from "@/lib/drive/exportSheetToMarkdown";

describe("Canadian postal tail — exporter flatten parity (rec-6d)", () => {
  it("FLATTENS a 2-line Canadian address cell (name+address on one line)", () => {
    const cell = "Fairmont Hotel\nOttawa, ON K1A 0A6";
    expect(normalizeNewlines(cell)).toBe("Fairmont Hotel Ottawa, ON K1A 0A6");
  });
  it("still flattens the US case", () => {
    const cell = "Marriott\nChicago, IL 60601";
    expect(normalizeNewlines(cell)).toBe("Marriott Chicago, IL 60601");
  });
});
