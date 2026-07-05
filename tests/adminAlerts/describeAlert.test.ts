/**
 * tests/adminAlerts/describeAlert.test.ts (spec §3.3)
 *
 * Pure formatter: AlertIdentity -> plain-text line, or null. Drops
 * `pii`-tagged segments when `includePii` is false (default true).
 */
import { describe, expect, it } from "vitest";
import { describeAlert } from "@/lib/adminAlerts/describeAlert";
import type { AlertIdentity } from "@/lib/adminAlerts/identityTypes";

describe("describeAlert", () => {
  it("joins labeled and bare segments with ' · '", () => {
    const identity: AlertIdentity = {
      global: false,
      segments: [
        { label: "Crew", value: "Jane Doe" },
        { label: null, value: "jane@gmail.com", pii: true },
        { label: "Show", value: "II — FinTech…" },
      ],
    };
    expect(describeAlert(identity)).toBe("Crew: Jane Doe · jane@gmail.com · Show: II — FinTech…");
  });

  it("defaults includePii to true", () => {
    const identity: AlertIdentity = {
      global: false,
      segments: [{ label: null, value: "secret@example.com", pii: true }],
    };
    expect(describeAlert(identity)).toBe("secret@example.com");
  });

  it("drops pii-tagged segments when includePii is false", () => {
    const identity: AlertIdentity = {
      global: false,
      segments: [
        { label: "Crew", value: "Jane Doe" },
        { label: null, value: "jane@gmail.com", pii: true },
        { label: "Show", value: "Show X" },
      ],
    };
    expect(describeAlert(identity, { includePii: false })).toBe("Crew: Jane Doe · Show: Show X");
  });

  it("returns null when global is true, regardless of segments", () => {
    const identity: AlertIdentity = {
      global: true,
      segments: [{ label: "Show", value: "Should not render" }],
    };
    expect(describeAlert(identity)).toBeNull();
  });

  it("returns null when no segment survives (empty segments)", () => {
    const identity: AlertIdentity = { global: false, segments: [] };
    expect(describeAlert(identity)).toBeNull();
  });

  it("returns null when the only segment is PII and withheld", () => {
    const identity: AlertIdentity = {
      global: false,
      segments: [{ label: null, value: "only-email@example.com", pii: true }],
    };
    expect(describeAlert(identity, { includePii: false })).toBeNull();
  });

  it("appends the coalescing disclosure segment as a bare value", () => {
    const identity: AlertIdentity = {
      global: false,
      segments: [
        { label: "Show", value: "Show X" },
        { label: null, value: "(most recent of 3)" },
      ],
    };
    expect(describeAlert(identity)).toBe("Show: Show X · (most recent of 3)");
  });
});
