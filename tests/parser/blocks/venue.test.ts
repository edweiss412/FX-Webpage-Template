import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseVenue } from "@/lib/parser/blocks/venue";
import { detectVersion } from "@/lib/parser/schema";
import { newAggregator } from "@/lib/parser/warnings";
import { inScopeAliases } from "@/lib/parser/aliases";
import { unambiguousTypos } from "@/tests/parser/_typoGenerator";

// ── Fixture paths ────────────────────────────────────────────────────────────
// 2026-03: v4. VENUE block at lines 40–44 (verified):
//   line 40: | VENUE NAME | Four Seasons Hotel Chicago |
//   line 42: | VENUE ADDRESS | 120 E Delaware Pl Chicago, IL 60611 |
//   line 43: | LOADING DOCK | 64 East Walton St (Security located on 7th Floor) |
//   line 44: | GOOGLE LINK | https://maps.app.goo.gl/7Ns5P1ApDmE8bBqi6 |
// Note: plan claimed lines 40-44 — actual content verified above.
const FIXTURE_V4 = "fixtures/shows/raw/2026-03-rpas-central-four-seasons.md";

// 2025-03: v2. VENUE block at lines 316–319:
//   line 316: | VENUE | VENUE NAME | Four Seasons Hotel Chicago |
//   line 318: |       | VENUE ADDRESS | 120 E Delaware Pl Chicago, IL 60611 |
//   line 319: |       | LOADING DOCK | 64 East Walton St (Security located on 7th Floor) |
const FIXTURE_V2 = "fixtures/shows/raw/2025-03-dci-rpas-central.md";

// 2024-05: v1/v2 (has "Hotal Contact Info" so v2). Has |VENUE| + |Hotel Address| shape.
const FIXTURE_V1_SHAPE = "fixtures/shows/raw/2024-05-east-coast-family-office.md";

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

// ── v4 tests ─────────────────────────────────────────────────────────────────
describe("parseVenue — v4 shape (2026-03 fixture)", () => {
  const md = readFileSync(FIXTURE_V4, "utf8");

  it("extracts venue.name = 'Four Seasons Hotel Chicago'", () => {
    const r = parseVenue(md, "v4");
    expect(r?.name).toBe("Four Seasons Hotel Chicago");
  });

  it("extracts venue.address = '120 E Delaware Pl Chicago, IL 60611'", () => {
    const r = parseVenue(md, "v4");
    expect(r?.address).toBe("120 E Delaware Pl Chicago, IL 60611");
  });

  it("extracts venue.loadingDock", () => {
    const r = parseVenue(md, "v4");
    expect(r?.loadingDock).toBe("64 East Walton St (Security located on 7th Floor)");
  });

  it("extracts venue.googleLink", () => {
    const r = parseVenue(md, "v4");
    expect(r?.googleLink).toBe("https://maps.app.goo.gl/7Ns5P1ApDmE8bBqi6");
  });

  it("returns a non-null venue object", () => {
    const r = parseVenue(md, "v4");
    expect(r).not.toBeNull();
  });
});

// ── v2 tests ─────────────────────────────────────────────────────────────────
describe("parseVenue — v2 shape (2025-03 fixture)", () => {
  const md = readFileSync(FIXTURE_V2, "utf8");

  it("extracts venue.name = 'Four Seasons Hotel Chicago'", () => {
    const r = parseVenue(md, "v2");
    expect(r?.name).toBe("Four Seasons Hotel Chicago");
  });

  it("extracts venue.address", () => {
    const r = parseVenue(md, "v2");
    expect(r?.address).toBe("120 E Delaware Pl Chicago, IL 60611");
  });

  it("extracts venue.loadingDock (v2 sub-row format)", () => {
    const r = parseVenue(md, "v2");
    expect(r?.loadingDock).toBe("64 East Walton St (Security located on 7th Floor)");
  });

  it("returns a non-null venue object", () => {
    const r = parseVenue(md, "v2");
    expect(r).not.toBeNull();
  });
});

// ── v1 shape (2024-05 fixture — |VENUE| label + |Hotel Address| rows) ────────
describe("parseVenue — v1/v2 merged shape (2024-05 fixture)", () => {
  const md = readFileSync(FIXTURE_V1_SHAPE, "utf8");

  it("extracts venue.name = 'Four Seasons Fort Lauderdale'", () => {
    const version = detectVersion(md);
    const r = parseVenue(md, version ?? "v2");
    expect(r?.name).toBe("Four Seasons Fort Lauderdale");
  });

  it("extracts venue.address (Hotel Address alias)", () => {
    const version = detectVersion(md);
    const r = parseVenue(md, version ?? "v2");
    expect(r?.address).toBe("525 N Fort Lauderdale Beach Blvd");
  });
});

// ── Other v4 fixtures ─────────────────────────────────────────────────────────
describe("parseVenue — 2026-04 v4 fixture (Waldorf Astoria)", () => {
  const md = readFileSync("fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md", "utf8");

  it("extracts venue.name = 'Waldorf Astoria Chicago'", () => {
    const r = parseVenue(md, "v4");
    expect(r?.name).toBe("Waldorf Astoria Chicago");
  });

  it("extracts venue.address = '11 E Walton St Chicago, IL 60611'", () => {
    const r = parseVenue(md, "v4");
    expect(r?.address).toBe("11 E Walton St Chicago, IL 60611");
  });

  it("extracts venue.googleLink", () => {
    const r = parseVenue(md, "v4");
    expect(r?.googleLink).toBe("https://maps.app.goo.gl/cNpJcvcS6oXjhKrZ8");
  });
});

// ── Null-safety ───────────────────────────────────────────────────────────────
describe("parseVenue — null safety", () => {
  it("returns null when no venue block present", () => {
    const md = "| CLIENT | Some Corp |\n| :--: | :--: |\n| Client Contact | Bob |\n";
    const r = parseVenue(md, "v2");
    expect(r).toBeNull();
  });

  it("omits loadingDock when not present", () => {
    const md = [
      "| VENUE NAME | Test Hotel |",
      "| :--: | :--: |",
      "| VENUE ADDRESS | 123 Main St |",
    ].join("\n");
    const r = parseVenue(md, "v4");
    expect(r).not.toBeNull();
    expect(r?.loadingDock).toBeUndefined();
  });
});

// ── Corpus coverage ───────────────────────────────────────────────────────────

/**
 * Per-fixture expected venue names. Built from corpus inspection to catch any
 * regression where a column header (e.g. "VENUE NAME/VENUE ADDRESS") leaks
 * through as the venue name instead of the actual value.
 *
 * Fixtures without a venue block (returns null) map to null.
 */
const EXPECTED_VENUE_NAMES: Record<string, string | null> = {
  "2024-05-east-coast-family-office.md": "Four Seasons Fort Lauderdale",
  "2025-03-dci-rpas-central.md": "Four Seasons Hotel Chicago",
  "2025-04-asset-mgmt-cfo-coo.md": "Four Seasons Hotel Chicago",
  "2025-05-redefining-fixed-income-private-credit.md": "Four Seasons Hotel Chicago",
  "2025-06-ria-investment-forum.md": "Park Hyatt Chicago",
  "2025-10-consultants-roundtable.md": "Four Seasons Hotel Chicago",
  // 2025-10 fixture uses a non-standard combined cell: "VENUE NAME/VENUE ADDRESS" as label
  // and "Park Hyatt Chicago/800 N Michigan Ave&#10;Chicago, IL 60611" as value (&#10; is literal).
  // The parser splits on the first '/' so name = "Park Hyatt Chicago",
  // address = "800 N Michigan Ave&#10;Chicago, IL 60611".
  "2025-10-fixed-income-trading-summit.md": "Park Hyatt Chicago",
  "2026-03-rpas-central-four-seasons.md": "Four Seasons Hotel Chicago",
  "2026-04-asset-mgmt-cfo-coo-waldorf.md": "Waldorf Astoria Chicago",
  "2026-05-fintech-forum-cto-summit.md": "Kimpton Gray",
};

// ── 2025-10 combined-cell split ───────────────────────────────────────────────
describe("parseVenue — 2025-10 fixture combined VENUE NAME/VENUE ADDRESS split", () => {
  const md = readFileSync("fixtures/shows/raw/2025-10-fixed-income-trading-summit.md", "utf8");

  it("venue.name is 'Park Hyatt Chicago' (pre-slash portion only)", () => {
    const r = parseVenue(md, "v2");
    expect(r?.name).toBe("Park Hyatt Chicago");
  });

  it("venue.address is the post-slash portion, with the in-cell &#10; decoded", () => {
    const r = parseVenue(md, "v2");
    expect(r?.address).toBeTruthy();
    // The exporter's in-cell line break (&#10;) is decoded to a space at the value
    // boundary (presence) so the address never surfaces a raw HTML entity to crew.
    expect(r?.address).toBe("800 N Michigan Ave Chicago, IL 60611");
  });

  it("venue.name does not contain a slash (no combined-cell stuffing)", () => {
    const r = parseVenue(md, "v2");
    expect(r?.name).not.toContain("/");
  });

  it("venue.googleLink is captured from the blank-col0 continuation row (line 36)", () => {
    const r = parseVenue(md, "v2");
    expect(r?.googleLink).toBe("https://maps.app.goo.gl/CYPC3gxtqUj3AdEk7");
  });

  it("venue.loadingDock is captured from the blank-col0 continuation row (line 35)", () => {
    const r = parseVenue(md, "v2");
    expect(r?.loadingDock).toBe("806 N Rush St Chicago, IL 60611");
  });
});

describe("parseVenue — corpus coverage (all 10 fixtures)", () => {
  for (const fixturePath of ALL_FIXTURES) {
    const fileName = fixturePath.split("/").pop()!;
    it(`${fileName} → returns venue object or null (not undefined)`, () => {
      const md = readFileSync(fixturePath, "utf8");
      const version = detectVersion(md);
      expect(version).not.toBeNull();

      const r = parseVenue(md, version!);
      // parseVenue must return either a valid object or null, never undefined
      expect(r === null || (typeof r === "object" && typeof r.name === "string")).toBe(true);
    });

    it(`${fileName} → venue.name is not a column header`, () => {
      const md = readFileSync(fixturePath, "utf8");
      const version = detectVersion(md);

      const r = parseVenue(md, version!);
      if (r !== null) {
        // Must not be a raw column header string
        expect(r.name).not.toMatch(/VENUE NAME/i);
        expect(r.name).not.toMatch(/VENUE ADDRESS/i);
        // Must be a non-empty string
        expect(r.name.length).toBeGreaterThan(0);
      }
    });

    it(`${fileName} → venue.name matches expected value`, () => {
      const md = readFileSync(fixturePath, "utf8");
      const version = detectVersion(md);

      const r = parseVenue(md, version!);
      const expected = EXPECTED_VENUE_NAMES[fileName];
      if (expected === null) {
        expect(r).toBeNull();
      } else {
        expect(r?.name).toBe(expected);
      }
    });
  }
});

describe("parseVenue — field-label typo recovery (FIELD_LABEL_AUTOCORRECTED)", () => {
  it("recovers a typo'd venue field label, emits FIELD_LABEL_AUTOCORRECTED, and fires NO UNKNOWN_FIELD", () => {
    // 'Venue Adress' (deletion) → venue.address. Today: empty address + UNKNOWN_FIELD (verified).
    const md = [
      "| VENUE NAME | Four Seasons Hotel |",
      "| Venue Adress | 120 E Delaware Pl Chicago, IL 60611 |",
    ].join("\n");
    const agg = newAggregator();
    const r = parseVenue(md, "v4", agg);
    expect(r?.address).toContain("120 E Delaware Pl"); // value recovered into the right field
    const notes = agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED");
    expect(notes).toHaveLength(1);
    expect(notes[0]!.severity).toBe("warn");
    expect(notes[0]!.blockRef).toMatchObject({ kind: "venue" });
    expect(agg.warnings.filter((w) => w.code === "UNKNOWN_FIELD")).toHaveLength(0); // no downgrade
  });

  it("a correctly-spelled venue label is NOT flagged", () => {
    const md = [
      "| VENUE NAME | Four Seasons |",
      "| VENUE ADDRESS | 120 E Delaware Pl Chicago, IL 60611 |",
    ].join("\n");
    const agg = newAggregator();
    parseVenue(md, "v4", agg);
    expect(agg.warnings.find((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toBeUndefined();
  });

  it("a typo near an OUT-of-scope alias is NOT fuzzed into venue (stays UNKNOWN_FIELD)", () => {
    // 'Clent Contact' is Damerau 1 from the OUT-of-scope alias 'Client Contact' (client.contact)
    // but is NOT near any venue.* alias → the venue-scoped fuzzy returns null → UNKNOWN_FIELD.
    const md = ["| VENUE NAME | Four Seasons |", "| Clent Contact | someone@x.com |"].join("\n");
    const agg = newAggregator();
    parseVenue(md, "v4", agg);
    expect(agg.warnings.find((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toBeUndefined();
    expect(agg.warnings.find((w) => w.code === "UNKNOWN_FIELD")).toBeTruthy();
  });

  it("generator: single-edit typos of venue field aliases (≥5 chars) recover", () => {
    // pass the FULL alias set so a generated typo that equals a real other-block exact alias is dropped
    const ALL = inScopeAliases(""); // every REVERSE_MAP key
    const venueAliases = inScopeAliases("venue.").filter((a) => a.length >= 5);
    for (const alias of venueAliases.slice(0, 4)) {
      // bound the loop for speed; a representative sample across venue.* aliases
      for (const typo of unambiguousTypos(
        alias.toUpperCase(),
        ALL.map((a) => a.toUpperCase()),
        { minLen: 5 },
      ).slice(0, 6)) {
        const md = ["| VENUE NAME | Four Seasons |", `| ${typo} | some value |`].join("\n");
        const agg = newAggregator();
        parseVenue(md, "v4", agg);
        // the recovered label must NOT be an UNKNOWN_FIELD (it corrected to a venue field)
        expect(
          agg.warnings.find((w) => w.code === "UNKNOWN_FIELD"),
          `typo '${typo}' of '${alias}' should recover, not UNKNOWN_FIELD`,
        ).toBeUndefined();
      }
    }
  });
});
