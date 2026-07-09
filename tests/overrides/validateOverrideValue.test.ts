import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { validateOverrideValue } from "@/lib/overrides/validateOverrideValue";

// §7.4 value-guard table. `validateOverrideValue` is the (non-race) TS backstop that
// mirrors the RPC's `_validate_override_value`; the reason token is returned as `code`.
// Reason tokens (mirroring the SQL): 'invalid_shape' | 'empty' | 'noop' | 'too_long' |
// 'name_conflict'. Caps: name 200, role 120, hotel_name 200, hotel_address 300.

// --- Fixture crew / hotel lists (collision inputs are DERIVED from these, never hardcoded) ---
const CREW_FIXTURE = ["Alice Smith", "Bob Jones", "Carol White"];
const HOTEL_FINAL_FIXTURE = ["Marriott Downtown", "Hilton Bayfront", "Grand Plaza"];

// A well-formed show `dates` / `venue` value (shape mirrors lib/parser/types.ts ShowRow).
const VALID_DATES = { travelIn: "2026-04-14", set: "2026-04-15", showDays: ["2026-04-16"], travelOut: "2026-04-17" };
const VALID_VENUE = { name: "Convention Center", address: "123 Main St" };

const ctx = (over: Partial<Parameters<typeof validateOverrideValue>[2]> = {}) => ({
  matchKey: "",
  ...over,
});

describe("validateOverrideValue — show domain (dates / venue jsonb shape)", () => {
  it("accepts a well-formed dates object", () => {
    expect(validateOverrideValue("dates", VALID_DATES, ctx())).toEqual({ ok: true });
  });

  it("rejects a non-object dates value → invalid_shape", () => {
    expect(validateOverrideValue("dates", "2026-04-15", ctx())).toEqual({ ok: false, code: "invalid_shape" });
    expect(validateOverrideValue("dates", null, ctx())).toEqual({ ok: false, code: "invalid_shape" });
    expect(validateOverrideValue("dates", ["2026-04-15"], ctx())).toEqual({ ok: false, code: "invalid_shape" });
  });

  it("rejects an empty dates object → invalid_shape", () => {
    expect(validateOverrideValue("dates", {}, ctx())).toEqual({ ok: false, code: "invalid_shape" });
  });

  it("rejects a dates object with a wrong-typed field → invalid_shape", () => {
    expect(validateOverrideValue("dates", { showDays: "2026-04-16" }, ctx())).toEqual({
      ok: false,
      code: "invalid_shape",
    });
    expect(validateOverrideValue("dates", { travelIn: 20260414 }, ctx())).toEqual({
      ok: false,
      code: "invalid_shape",
    });
  });

  it("accepts a well-formed venue object", () => {
    expect(validateOverrideValue("venue", VALID_VENUE, ctx())).toEqual({ ok: true });
  });

  it("rejects a venue missing name/address, or with a wrong-typed field → invalid_shape", () => {
    expect(validateOverrideValue("venue", { name: "Only Name" }, ctx())).toEqual({ ok: false, code: "invalid_shape" });
    expect(validateOverrideValue("venue", { name: 1, address: "123 Main St" }, ctx())).toEqual({
      ok: false,
      code: "invalid_shape",
    });
    expect(validateOverrideValue("venue", "not-an-object", ctx())).toEqual({ ok: false, code: "invalid_shape" });
  });
});

describe("validateOverrideValue — text fields: empty / non-string", () => {
  it.each(["name", "role", "hotel_name", "hotel_address"] as const)(
    "%s: empty or whitespace-only → empty",
    (field) => {
      expect(validateOverrideValue(field, "", ctx({ matchKey: "x" }))).toEqual({ ok: false, code: "empty" });
      expect(validateOverrideValue(field, "   ", ctx({ matchKey: "x" }))).toEqual({ ok: false, code: "empty" });
    },
  );

  it.each(["name", "role", "hotel_name", "hotel_address"] as const)(
    "%s: a non-string jsonb value → invalid_shape",
    (field) => {
      expect(validateOverrideValue(field, 42, ctx({ matchKey: "x" }))).toEqual({ ok: false, code: "invalid_shape" });
      expect(validateOverrideValue(field, { a: 1 }, ctx({ matchKey: "x" }))).toEqual({
        ok: false,
        code: "invalid_shape",
      });
    },
  );
});

describe("validateOverrideValue — `= match_key` no-op reject", () => {
  it("name equal to match_key → noop", () => {
    expect(validateOverrideValue("name", "Alice Smith", ctx({ matchKey: "Alice Smith" }))).toEqual({
      ok: false,
      code: "noop",
    });
  });

  it("hotel_name equal to the name-part of a disambiguated match_key → noop", () => {
    const SEP = "\x1f";
    const matchKey = `Grand Plaza${SEP}2026-04-15`; // name + §5.3 disambiguator
    expect(validateOverrideValue("hotel_name", "Grand Plaza", ctx({ matchKey }))).toEqual({ ok: false, code: "noop" });
  });
});

describe("validateOverrideValue — caps", () => {
  const CAP_CASES: Array<[string, number]> = [
    ["name", 200],
    ["role", 120],
    ["hotel_name", 200],
    ["hotel_address", 300],
  ];
  it.each(CAP_CASES)("%s accepts exactly %d chars and rejects one more → too_long", (field, cap) => {
    const atCap = "a".repeat(cap);
    const overCap = "a".repeat(cap + 1);
    expect(validateOverrideValue(field as never, atCap, ctx({ matchKey: "diff" }))).toEqual({ ok: true });
    expect(validateOverrideValue(field as never, overCap, ctx({ matchKey: "diff" }))).toEqual({
      ok: false,
      code: "too_long",
    });
  });
});

describe("validateOverrideValue — collisions (inputs DERIVED from fixtures)", () => {
  it("crew name colliding with another parsed / live / active-override name → name_conflict", () => {
    // Target member is CREW_FIXTURE[0]; the OTHER members are the remaining fixture names.
    const target = CREW_FIXTURE[0]!;
    const others = CREW_FIXTURE.slice(1);
    const collidingInput = others[0]!; // derived: a real OTHER member's name
    // parsed-name collision
    expect(
      validateOverrideValue("name", collidingInput, ctx({ matchKey: target, currentParsedNames: others })),
    ).toEqual({ ok: false, code: "name_conflict" });
    // live-name collision
    expect(
      validateOverrideValue("name", others[1]!, ctx({ matchKey: target, currentLiveNames: others })),
    ).toEqual({ ok: false, code: "name_conflict" });
    // another active name-override's OUTPUT collision
    expect(
      validateOverrideValue("name", collidingInput, ctx({ matchKey: target, otherActiveNameOutputs: others })),
    ).toEqual({ ok: false, code: "name_conflict" });
  });

  it("a crew name that collides with NOTHING passes", () => {
    const target = CREW_FIXTURE[0]!;
    const others = CREW_FIXTURE.slice(1);
    expect(
      validateOverrideValue("name", "Dave Unique", ctx({ matchKey: target, currentParsedNames: others })),
    ).toEqual({ ok: true });
  });

  it("hotel_name colliding with another reservation's FINAL name → name_conflict", () => {
    const target = HOTEL_FINAL_FIXTURE[0]!;
    const otherFinals = HOTEL_FINAL_FIXTURE.slice(1);
    const collidingInput = otherFinals[0]!; // derived: another reservation's FINAL hotel_name
    expect(
      validateOverrideValue("hotel_name", collidingInput, ctx({ matchKey: target, otherFinalHotelNames: otherFinals })),
    ).toEqual({ ok: false, code: "name_conflict" });
  });

  it("a hotel_name that collides with no OTHER final name passes", () => {
    const target = HOTEL_FINAL_FIXTURE[0]!;
    const otherFinals = HOTEL_FINAL_FIXTURE.slice(1);
    expect(
      validateOverrideValue("hotel_name", "Novotel Riverside", ctx({ matchKey: target, otherFinalHotelNames: otherFinals })),
    ).toEqual({ ok: true });
  });
});

describe("validateOverrideValue — name .trim() is canonicalize-exempt in the source", () => {
  it("the source's name trim carries the // canonicalize-exempt comment (grep the source)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "../../lib/overrides/validateOverrideValue.ts"), "utf8");
    // The module MUST use a `.trim()` (the empty-guard) and it MUST be exempted, because
    // the sync transform (Task 6/7) imports these helpers and `.trim()` on a name is
    // flagged by tests/admin/no-inline-email-normalization.test.ts unless exempted.
    expect(src).toMatch(/\.trim\(\)/);
    const trimLine = src.split("\n").find((l) => l.includes(".trim()"));
    expect(trimLine).toBeDefined();
    expect(trimLine).toContain("// canonicalize-exempt: crew display name, not an email");
  });
});
