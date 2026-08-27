import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseVenue, isVenueBlockOpener } from "@/lib/parser/blocks/venue";
import { splitRow } from "@/lib/parser/blocks/_helpers";
import { detectVersion } from "@/lib/parser/schema";
import { newAggregator } from "@/lib/parser/warnings";
import { inScopeAliases, resolveAlias, TYPO_ALIASES } from "@/lib/parser/aliases";
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
    // 'Venue Adress' (deletion) → venue.address. Before the scoped fuzzy fallback existed this
    // left an empty address; the UNKNOWN_FIELD half of that old behaviour is now impossible
    // from a direct parseVenue call either way, so the assertion below is a no-downgrade pin
    // on the fuzzy path, not a claim about the retired emitter.
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

  it("warns on a FIRST-row typo'd venue field label (no premature scope-gate suppression)", () => {
    // idx53: the misspelled label is on ROW 1 — the position the retired positional scope
    // window opened AFTER. The field must still recover AND emit FIELD_LABEL_AUTOCORRECTED;
    // a first-row fuzzy correction must never be a silent re-route (spec §2 rule 4: always
    // warn). Still load-bearing after the window's removal: this emit is deliberately
    // ungated, so it must not acquire the venue-block-membership gate TYPO_NORMALIZED took.
    const md = [
      "| Venue Adress | 120 E Delaware Pl Chicago, IL 60611 |",
      "| VENUE NAME | Four Seasons Hotel |",
    ].join("\n");
    const agg = newAggregator();
    const r = parseVenue(md, "v4", agg);
    // (a) the misspelled-label field still resolves/assigns correctly
    expect(r?.name).toBe("Four Seasons Hotel");
    expect(r?.address).toContain("120 E Delaware Pl");
    // (b) the first-row fuzzy correction is surfaced (not silently re-routed)
    const warns = agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED");
    expect(warns).toHaveLength(1);
    expect(warns[0]!.severity).toBe("warn");
    expect(warns[0]!.blockRef).toMatchObject({ kind: "venue" });
    expect(warns[0]!.rawSnippet).toBe("Venue Adress");
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

  it("a typo near an OUT-of-scope alias is NOT fuzzed into venue", () => {
    // 'Clent Contact' is Damerau 1 from the OUT-of-scope alias 'Client Contact' (client.contact)
    // but is NOT near any venue.* alias → the venue-scoped fuzzy returns null → the label is
    // left unresolved. It is NOT downgraded into a venue field, which is the claim here.
    // `parseVenue` emits no UNKNOWN_FIELD at all any more: the near-miss detector at the
    // `parseSheet` seam owns that code (field-near-miss spec §2.1), so a DIRECT call has no
    // replacement emission to assert.
    const md = ["| VENUE NAME | Four Seasons |", "| Clent Contact | someone@x.com |"].join("\n");
    const agg = newAggregator();
    const r = parseVenue(md, "v4", agg);
    // Non-vacuity: the row was read and refused, not skipped along with the whole document.
    expect(r?.name).toBe("Four Seasons");
    expect(r?.address).toBe("");
    expect(agg.warnings.find((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toBeUndefined();
    expect(agg.warnings.find((w) => w.code === "UNKNOWN_FIELD")).toBeUndefined();
  });

  /**
   * EXHAUSTIVE, not sampled. Every venue alias of length >= 5, and every unambiguous single-edit
   * neighbour of each — 8453 cases across 11 aliases. The previous version sampled
   * `.slice(0, 4)` aliases x `.slice(0, 6)` typos, which coupled coverage to `FIELD_ALIASES`
   * insertion order and, in practice, exercised only the five aliases whose canonicals
   * `parseVenue` never assigns — so not one sampled case could prove a value reached a field.
   * Spec: docs/superpowers/specs/parser/2026-08-02-parser-determinism-pair.md §4.
   *
   * The oracle is ONE strict deep-equality comparison against an object derived from each case's
   * own inputs. Four review rounds each found a mutant that escaped a weaker, property-listing
   * assertion (anchor corruption; trim cases with no routing assertion; a third field corrupted
   * with a non-sentinel marker; a stray field set to null / "" / a non-string). Deep equality is
   * exhaustive in both directions, so there is no field the assertion can forget.
   */
  const VENUE_OUTPUT_FIELD: Record<string, string> = {
    "venue.name": "name",
    "venue.address": "address",
    "venue.loading_dock": "loadingDock",
    "venue.google_link": "googleLink",
    "venue.notes": "notes",
  };
  const TYPO_SENTINEL = "__TYPO_SENTINEL__";
  const ANCHOR_NAME = "Four Seasons";
  const ANCHOR_DOCK = "dock ref";

  // Measured 3.58s exhaustive. Vitest's default is 5000ms and no testTimeout override exists in
  // vitest.config.ts / vitest.projects.ts / vitest.sequencer.ts / package.json, so this case
  // carries its own generous timeout rather than raising the global one for every other test.
  const TYPO_SPACE_TIMEOUT_MS = 30_000;

  it(
    "generator: every single-edit typo of every venue field alias (>=5 chars) routes correctly",
    () => {
      // pass the FULL alias set so a generated typo that equals a real other-block exact alias is dropped
      const ALL = inScopeAliases("").map((a) => a.toUpperCase());
      const venueAliases = inScopeAliases("venue.").filter((a) => a.length >= 5);

      // Coverage floor, DERIVED: every canonical parseVenue can assign must be reachable from
      // some enumerated alias. Catches the deletion of the last alias of an assignable canonical.
      const coveredCanonicals = new Set(venueAliases.map((a) => resolveAlias(a)));
      for (const canonical of Object.keys(VENUE_OUTPUT_FIELD)) {
        expect(
          coveredCanonicals.has(canonical),
          `no enumerated venue alias resolves to ${canonical} — generator coverage has shrunk`,
        ).toBe(true);
      }

      let totalCases = 0;
      for (const alias of venueAliases) {
        const canonical = resolveAlias(alias)!;
        const targetField = VENUE_OUTPUT_FIELD[canonical];
        const isNameAlias = canonical === "venue.name";

        // The anchor opens the venue block (a lone typo row does not). It must NOT share the
        // canonical under test: assignment is first-wins, so a colliding anchor would shadow the
        // typo's value and make the routing assertion vacuous.
        const anchorRow = isNameAlias
          ? `| LOADING DOCK | ${ANCHOR_DOCK} |`
          : `| VENUE NAME | ${ANCHOR_NAME} |`;
        const expected: Record<string, string> = isNameAlias
          ? { name: "", address: "", loadingDock: ANCHOR_DOCK }
          : { name: ANCHOR_NAME, address: "" };
        if (targetField) expected[targetField] = TYPO_SENTINEL;

        const typos = unambiguousTypos(alias.toUpperCase(), ALL, { minLen: 5 });
        // Volume floor, DERIVED from the alias: measured ratios are 53.8-56.6, so this has ~5x
        // headroom while redding any re-introduction of sampling (`.slice(0, 1)` lands at 0.09).
        expect(
          typos.length,
          `alias '${alias}' generated only ${typos.length} typos — sampling has returned`,
        ).toBeGreaterThanOrEqual(alias.length * 10);

        for (const typo of typos) {
          totalCases += 1;
          const md = [anchorRow, `| ${typo} | ${TYPO_SENTINEL} |`].join("\n");
          const agg = newAggregator();
          const result = parseVenue(md, "v4", agg);
          const where = `typo '${typo}' of '${alias}'`;

          // THE oracle: the whole returned object, exactly.
          expect(result, `${where}: wrong parse result`).toStrictEqual(expected);

          expect(
            agg.warnings.filter((w) => w.code === "UNKNOWN_FIELD"),
            `${where} should recover, not UNKNOWN_FIELD`,
          ).toHaveLength(0);

          const autocorrected = agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED");
          if (typo.trim() === alias.toUpperCase()) {
            // Leading/trailing-space neighbours are not typos: resolveAliasScoped trims, so they
            // resolve EXACTLY and must not be reported as a correction. TYPO_NORMALIZED fires iff
            // the alias is a registered typo spelling (e.g. 'hotal contact info') AND the row's
            // physical block is the venue block. The predicate is `isVenueBlockOpener` — THE
            // shared definition, called by the gate and by the near-miss detector's
            // anchor-namespace arm alike, so this generator and the parser cannot drift apart
            // (2026-08-27-venue-block-predicate-design.md §2).
            //
            // Both corpus venue shapes are inside it, so the anchor rows here — which open v4
            // two-column tables — now pin the FIRING direction on `VENUE NAME`, the shape that
            // was silent before that spec and is the current template. The membership term is
            // DERIVED from the document rather than folded into a constant, so narrowing the
            // predicate reds these cases instead of passing.
            //
            // What this generator does NOT discriminate, said plainly so the next reader does
            // not overrate it: only ONE of the four registered typo aliases is venue-scoped
            // (`hotal contact info` -> `venue.contact_info`; `diagrams`, `virtaul audience` and
            // `goosneck` are all `details.*`). So the `LOADING DOCK` arm carries no typo alias
            // and its silence holds whatever the predicate says — a NON-REGRESSION check, not a
            // discriminating one. The discriminating silence witness is the byte-identical
            // `| HOTEL |` case in tests/parser/fieldNearMissBaseline.test.ts.
            const opensVenueBlock = isVenueBlockOpener(splitRow(anchorRow.trim())[0] ?? "");
            expect(autocorrected, `${where} resolves exactly after trim`).toHaveLength(0);
            expect(
              agg.warnings.some((w) => w.code === "TYPO_NORMALIZED"),
              `${where}: TYPO_NORMALIZED must fire iff '${alias}' is a registered typo alias AND the row sits in the venue block`,
            ).toBe(TYPO_ALIASES.has(alias) && opensVenueBlock);
          } else {
            expect(autocorrected, `${where} should emit exactly one autocorrect`).toHaveLength(1);
            expect(autocorrected[0]!.severity, `${where}`).toBe("warn");
            expect(autocorrected[0]!.blockRef, `${where}`).toMatchObject({ kind: "venue" });
          }
        }
      }

      // Non-vacuity: an empty generator would make every loop above a silent no-op.
      expect(totalCases, "the typo generator produced no cases at all").toBeGreaterThan(0);
    },
    TYPO_SPACE_TIMEOUT_MS,
  );
});
