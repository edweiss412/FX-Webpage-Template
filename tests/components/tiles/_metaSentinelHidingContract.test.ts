/**
 * tests/components/tiles/_metaSentinelHidingContract.test.ts
 *
 * THE PROBLEM:
 *   Rounds 10, 11, 12 of M4 cross-CLI adversarial review each surfaced
 *   new instances of the SAME bug class:
 *
 *     "Tile consumes a §8.3 generic-optional text field WITHOUT routing
 *      it through lib/visibility/emptyState.ts:shouldHideGenericOptional,
 *      so sentinel values ('TBD' / 'N/A' / 'TBA') leak into the rendered
 *      DOM as if they were real content."
 *
 *   Examples patched across the milestone:
 *     - NotesTile (5 sources: venue / hotel / room / transport / contact)
 *     - TransportTile inline notes paragraph + allEmpty branch
 *     - ShowStatusTile.venueNotes
 *     - LodgingTile.notes KeyValue
 *     - VenueTile.notes KeyValue
 *     - ContactsTile.notes paragraph
 *     - ShowStatusTile.pickDressCode helper (event_details candidates)
 *     - AudioScopeTile / VideoScopeTile / LightingScopeTile filter
 *     - FinancialsTile.po / proposal / invoice / invoice_notes
 *
 *   Per-instance fixes (one or two per review round) burned 3 review
 *   rounds and never fully converged because each fix exposed adjacent
 *   surfaces. The class-sweep memory rule was applied each round but
 *   still missed sister tiles, helpers, and adjacent code paths. The
 *   canonical example for this discipline is `tests/auth/_metaInfraContract.
 *   test.ts` — same shape, different domain (auth helpers vs. tile
 *   sentinel-hiding).
 *
 * THE META-DISCIPLINE:
 *   This test enumerates every TILE FILE in `components/tiles/` and
 *   asserts the structural contract:
 *
 *     "If a tile consumes any canonical §8.3 generic-optional text
 *      field, the tile MUST import lib/visibility/emptyState.ts:
 *      shouldHideGenericOptional and use it on that field's read path."
 *
 *   Concretely, the test scans tile sources for raw access to known
 *   generic-optional fields and asserts the file:
 *     - imports `shouldHideGenericOptional` from emptyState, AND
 *     - has at least one call site of `shouldHideGenericOptional(`.
 *
 *   What this test catches:
 *     - "I added a new tile that reads notes/po/invoice/audio/etc.
 *       but forgot to wire the predicate" — fails at CI before
 *       adversarial review can find it.
 *     - "I refactored a tile and accidentally collapsed the predicate
 *       call into raw truthiness" — fails because the import or call
 *       site disappears.
 *
 *   What this test does NOT replace:
 *     - Per-tile sentinel × value coverage in
 *       tests/components/tiles/SentinelHidingClass.test.tsx (still
 *       required for behavioral assertion that sentinels don't reach
 *       the DOM).
 *     - Adversarial review (catches design-level issues a static
 *       contract test cannot — e.g., a new field type that should be
 *       added to GENERIC_OPTIONAL_FIELDS below).
 *     - The class-sweep memory rule (still required for callers + adjacent
 *       code paths beyond the tile itself).
 *
 *   Future-proofing:
 *     - Adding a new generic-optional field name to the data model
 *       requires extending GENERIC_OPTIONAL_FIELDS below + adding a
 *       corresponding test row in SentinelHidingClass.test.tsx.
 *     - Adding a new tile that consumes one of these fields without
 *       wiring the predicate is now a CI failure, not a future
 *       review-round finding.
 *
 *   Exemption mechanism:
 *     - Identity fields (e.g., hotel_name, contact.name) that happen
 *       to BE the predicate-inverse (always truthy → render) are NOT
 *       in GENERIC_OPTIONAL_FIELDS. They live separately in
 *       IDENTITY_FIELD_REFERENCES and are explicitly NOT subject to
 *       this contract.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const TILES_DIR = join(process.cwd(), "components", "tiles");

/**
 * The canonical §8.3 generic-optional text-field reference patterns.
 * Each entry is a regex matching `<some accessor>.<field>` in a tile
 * source. If any of these matches a tile, the tile MUST route the
 * value through `shouldHideGenericOptional`.
 *
 * Rationale per pattern (commit history attribution in parens):
 *   - `\.notes\b`                — notes columns on every block-level
 *                                  row (venue, hotel, room, transport,
 *                                  contact). Round-10 named instance.
 *   - `\.invoice_notes\b`        — financials notes. Round-12 named.
 *   - `\.po\b` / `\.proposal\b` /
 *     `\.invoice\b`              — financials identity-as-text fields
 *                                  treated as generic-optional per
 *                                  round-12 disposition.
 *   - `\.audio\b` / `\.video\b` /
 *     `\.lighting\b`             — room scope strings. Round-12
 *                                  reclassification.
 *   - `event_details\["dress_code"\]`
 *     / `dress_code|dress code|attire|dress`
 *                                — round-11 named via pickDressCode.
 *   - `event_details\["power"\]` /
 *     `\["internet"\]` /
 *     `\["keynote_requirements"\]`
 *                                — predicate-table examples (already
 *                                  wired but kept here for structural
 *                                  symmetry).
 */
const GENERIC_OPTIONAL_FIELDS: ReadonlyArray<{
  /** Human-friendly description for failure messages. */
  description: string;
  /** Regex matching the field's read path in a tile source. */
  pattern: RegExp;
}> = [
  {
    description: "notes (venue/hotel/room/transport/contact)",
    pattern: /\.notes\b/,
  },
  {
    description: "financials.invoice_notes",
    pattern: /\.invoice_notes\b/,
  },
  // The financials identity-as-text fields. The pattern matches
  // `financials.po`, `financials.proposal`, `financials.invoice` —
  // we anchor on `financials.` prefix to avoid false positives on
  // unrelated `.po` / `.proposal` properties elsewhere.
  {
    description: "financials.po / proposal / invoice",
    pattern: /\bfinancials\??\.(po|proposal|invoice)\b/,
  },
  {
    description: "room.audio / video / lighting (scope tiles)",
    pattern: /\br\.(audio|video|lighting)\b/,
  },
  {
    description: "event_details dress_code candidates",
    pattern: /event_details\["?(dress_code|dress|attire)"?\]|"dress_code"|"attire"|"dress code"/,
  },
  // Round-13 reclassification: vehicle metadata on TransportationRow.
  // The pattern anchors on `transportation.` to avoid matching unrelated
  // .vehicle / .parking / .color references elsewhere (e.g., a hypothetical
  // `palette.color` token).
  {
    description: "transportation.vehicle / license_plate / color / parking",
    pattern: /\btransportation\??\.(vehicle|license_plate|color|parking)\b/,
  },
  // Round-15 reclassification: driver assignment + contact fields on
  // TransportationRow. Reasoning per Codex round 15: a sentinel
  // driver_phone like "TBD" rendered as a `tel:TBD` link, creating a
  // dead/misleading contact control. Round 12 had deferred these as
  // identity fields; round 15 reversed that on user-harm grounds.
  {
    description: "transportation.driver_name / driver_phone / driver_email",
    pattern: /\btransportation\??\.(driver_name|driver_phone|driver_email)\b/,
  },
  // Round-14: HotelReservationRow optional text fields beyond `notes`.
  // hotel_address and confirmation_no were missed by round-10's notes
  // sweep because they are KeyValue rows on the body, not aggregated
  // through NotesTile. The pattern matches `res.hotel_address` and
  // `res.confirmation_no` in LodgingTile (and any future tile that
  // unfurls reservation rows).
  {
    description: "hotelReservation.hotel_address / confirmation_no",
    pattern: /\bres\??\.(hotel_address|confirmation_no)\b/,
  },
];

/**
 * Identity-field references that look LIKE generic-optional fields
 * but are NOT subject to the contract per spec §8.3 + Codex rounds
 * 10/11 dispositions. Listed here for documentation; the contract
 * test below ignores any tile whose ONLY matches are identity fields.
 *
 * (Currently unused in the contract logic — kept for readability +
 * future-proofing if a tile is exempted because it ONLY uses identity
 * fields. As of M4 round 12, no such tile exists.)
 */
// const IDENTITY_FIELD_REFERENCES = [
//   /\.hotel_name\b/,
//   /\.contact\.name\b/,
// ];

/**
 * Tiles explicitly exempted from the contract. Each exemption MUST
 * include a one-line rationale tying the tile to a spec section or
 * Codex disposition. The list is intentionally short — every entry is
 * a documented decision, not a "we'll fix it later."
 *
 * Empty as of M4 round 12: every tile that consumes generic-optional
 * text fields routes through the predicate. Future exemptions go here.
 */
const EXEMPTIONS: ReadonlyArray<{
  filename: string;
  reason: string;
}> = [];

/** Files in components/tiles/ that aren't tiles per se (helpers). */
const NON_TILE_FILES = new Set<string>([
  // None as of M4 round 12. Helper-style files would go here.
]);

function listTileFiles(): string[] {
  return readdirSync(TILES_DIR)
    .filter((f) => f.endsWith(".tsx") && !NON_TILE_FILES.has(f))
    .sort();
}

function readTileSource(filename: string): string {
  return readFileSync(join(TILES_DIR, filename), "utf8");
}

describe("META §8.3 sentinel-hiding contract — components/tiles/", () => {
  test("at least one tile file exists (sanity guard)", () => {
    // If this fails, the test is reading the wrong directory or the
    // tiles directory got deleted.
    const files = listTileFiles();
    expect(files.length).toBeGreaterThan(0);
  });

  test("every tile that consumes a §8.3 generic-optional field imports shouldHideGenericOptional", () => {
    const tiles = listTileFiles();
    const exemptSet = new Set(EXEMPTIONS.map((e) => e.filename));
    const failures: string[] = [];

    for (const filename of tiles) {
      if (exemptSet.has(filename)) continue;
      const source = readTileSource(filename);

      // Which canonical generic-optional fields does this tile reference?
      const matches = GENERIC_OPTIONAL_FIELDS.filter((f) =>
        f.pattern.test(source),
      );
      if (matches.length === 0) continue;

      // The tile DOES consume at least one generic-optional field.
      // It MUST therefore import + use shouldHideGenericOptional.
      const hasImport = /shouldHideGenericOptional\b/.test(source);
      // Belt-and-braces: check for an actual call site, not just an
      // unused import. The regex looks for `shouldHideGenericOptional(`
      // which catches every call form.
      const hasCallSite = /shouldHideGenericOptional\s*\(/.test(source);

      if (!hasImport || !hasCallSite) {
        const fields = matches.map((m) => m.description).join(", ");
        failures.push(
          `${filename}: consumes [${fields}] but ${
            !hasImport
              ? "does not import shouldHideGenericOptional"
              : "imports shouldHideGenericOptional but never calls it"
          }`,
        );
      }
    }

    expect(failures, failures.join("\n")).toEqual([]);
  });

  test("EXEMPTIONS list is documented (every entry has a reason)", () => {
    // Defense-in-depth: an exemption with empty/missing reason is a
    // silent contract loophole. Every exemption MUST cite a spec
    // section or Codex round disposition.
    for (const e of EXEMPTIONS) {
      expect(
        e.reason.trim().length,
        `${e.filename}: exemption reason is empty`,
      ).toBeGreaterThan(20);
    }
  });

  test("known generic-optional fields list is non-empty", () => {
    // If a future refactor accidentally empties GENERIC_OPTIONAL_FIELDS,
    // this test would otherwise pass vacuously. Pin the floor.
    expect(GENERIC_OPTIONAL_FIELDS.length).toBeGreaterThanOrEqual(5);
  });
});
