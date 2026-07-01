import { describe, it, expect } from "vitest";
import { labelFromRawSnippet, valueFromRawSnippet } from "@/lib/parser/rawSnippet";

describe("rawSnippet helpers", () => {
  it("splits label and value on the first ' | '", () => {
    expect(labelFromRawSnippet("GS Podium Type | (2) Acrylic Podium")).toBe("GS Podium Type");
    expect(valueFromRawSnippet("GS Podium Type | (2) Acrylic Podium")).toBe("(2) Acrylic Podium");
  });
  it("preserves ' | ' inside the value", () => {
    expect(labelFromRawSnippet("Internet | Wifi | Passcode")).toBe("Internet");
    expect(valueFromRawSnippet("Internet | Wifi | Passcode")).toBe("Wifi | Passcode");
  });
  it("returns null when there is no ' | '", () => {
    expect(labelFromRawSnippet("no separator here")).toBeNull();
    expect(valueFromRawSnippet("no separator here")).toBeNull();
  });
  it("handles empty value after the separator", () => {
    expect(labelFromRawSnippet("Notes | ")).toBe("Notes");
    expect(valueFromRawSnippet("Notes | ")).toBe("");
  });
  it("returns null for null/undefined/blank label", () => {
    expect(labelFromRawSnippet(null)).toBeNull();
    expect(labelFromRawSnippet(undefined)).toBeNull();
    expect(labelFromRawSnippet(" | value")).toBeNull();
  });
});
