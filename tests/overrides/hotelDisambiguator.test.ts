import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { computeHotelDisambiguator } from "@/lib/overrides/hotelDisambiguator";

// §5.3 REST-2 — directly pin `computeHotelDisambiguator`. The content disambiguator
// is `check_in` (`YYYY-MM-DD`), with `\x1f` (U+001F unit-separator) + `confirmation_no`
// appended whenever the row carries a confirmation number. It reads ONLY the two
// non-overridable booking columns and NEVER the mutable `names[]` occupant list (R30),
// so it is stable across roster edits.

const SEP = "\x1f"; // U+001F unit separator — must be the raw byte, not the literal text.

describe("computeHotelDisambiguator", () => {
  it("check_in only (null confirmation_no) → 'YYYY-MM-DD' with no separator", () => {
    // Failure mode: appending an empty confirmation trailer (`check_in + \x1f + ''`)
    // when there is no confirmation number, which would never match a parsed row.
    const out = computeHotelDisambiguator({ check_in: "2026-04-15", confirmation_no: null });
    expect(out).toBe("2026-04-15");
    expect(out).not.toContain(SEP);
  });

  it("check_in + confirmation_no → 'YYYY-MM-DD' + \\x1f + confirmation_no (exact U+001F byte)", () => {
    // Failure mode: using a different delimiter (e.g. '|' or ':') that could occur
    // inside a confirmation number, or omitting the confirmation entirely.
    const out = computeHotelDisambiguator({ check_in: "2026-04-15", confirmation_no: "CONF123" });
    expect(out).toBe(`2026-04-15${SEP}CONF123`);
    // The delimiter is the raw U+001F byte, not the two-character escape "\x1f".
    expect(out.charCodeAt("2026-04-15".length)).toBe(0x1f);
    expect(out).not.toContain("\\x1f");
  });

  it("null check_in / null confirmation_no → ''-substituted, never the literal string 'null'", () => {
    expect(computeHotelDisambiguator({ check_in: null, confirmation_no: null })).toBe("");
    expect(computeHotelDisambiguator({ check_in: null, confirmation_no: null })).not.toContain("null");

    // A null check_in with a present confirmation_no substitutes '' for the date part,
    // never the string 'null' — the separator + confirmation still trails.
    const out = computeHotelDisambiguator({ check_in: null, confirmation_no: "CONF9" });
    expect(out).toBe(`${SEP}CONF9`);
    expect(out).not.toContain("null");
  });

  it("reads ONLY {check_in, confirmation_no}; never touches names[] (R30)", () => {
    // Runtime proof: a poisoned `names` getter throws if the function reads it.
    const poisoned = {
      check_in: "2026-04-15",
      confirmation_no: "CONF123",
      get names(): string[] {
        throw new Error("computeHotelDisambiguator must not read names[] (R30)");
      },
    };
    expect(() => computeHotelDisambiguator(poisoned)).not.toThrow();
    expect(computeHotelDisambiguator(poisoned)).toBe(`2026-04-15${SEP}CONF123`);

    // Source proof: the module never references the token `names`.
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "../../lib/overrides/hotelDisambiguator.ts"), "utf8");
    expect(src).not.toMatch(/\bnames\b/);
  });
});
