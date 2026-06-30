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
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const REPO_ROOT = process.cwd();
const TILES_DIR = join(REPO_ROOT, "components", "tiles");

/**
 * Crew-redesign extension (Task 4): the §8.3 sentinel-hiding contract now
 * also walks the crew section/primitive trees. PersonRow is the first
 * `components/crew/` component that reads a generic-optional field
 * (`person.notes`), so the walk extension lands in the same commit as
 * PersonRow. From this commit forward the contract enforces on crew
 * components too, so a new section/primitive that reads venue/notes/contact
 * fields without routing through `shouldHideGenericOptional` fails at CI
 * (rather than as a future adversarial-review finding).
 *
 * Each entry is walked recursively for `.tsx` files. A directory that does
 * not yet exist (e.g. `components/crew/sections/` before the sections land)
 * is simply skipped — the walk extends as those trees fill in.
 */
const CREW_DIRS: ReadonlyArray<string> = [
  join(REPO_ROOT, "components", "crew", "sections"),
  join(REPO_ROOT, "components", "crew", "primitives"),
];

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
 *   - `event_details.dress_code`     — round-11 named via pickDressCode; the
 *                                  attire/dress/dress-code label family now
 *                                  collapses to this ONE canonical key at
 *                                  parse time (M4-D1), so the pattern anchors
 *                                  on the single read path.
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
    // M4-D1: dress-code is now a SINGLE canonical key. The parser
    // (lib/parser/blocks/event.ts CANONICAL_KEY_MAP) collapses the
    // attire/dress/dress-code label family to `dress_code`, so the consumer
    // reads `event_details.dress_code` only (dot or bracket access). The old
    // pattern also matched the bare quoted strings "dress_code"/"attire"/
    // "dress code" from the now-deleted 4-key probe loop — those alternatives
    // are dropped because they would only match prose/comments after the
    // collapse (a fragile match that lets the contract pass for the wrong
    // reason). This pattern anchors on the actual read path so the contract
    // still enforces: any tile/crew file reading `event_details.dress_code`
    // must route it through `shouldHideGenericOptional`.
    description: "event_details.dress_code (canonical, M4-D1)",
    pattern: /event_details(\.dress_code\b|\[\s*"dress_code"\s*\])/,
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
  // Round-16: ShowRow.venue optional text fields. loadingDock is a
  // generic-optional KeyValue row; googleLink is a URL-typed
  // anchor that ALSO needs URL-validity guarding to avoid
  // dead/misleading navigation controls (handled separately in
  // VenueTile via isParseableUrl).
  {
    description: "venue.loadingDock / googleLink",
    pattern: /\bvenue\??\.(loadingDock|googleLink)\b/,
  },
  // Round-16: ContactRow + CrewMemberRow actionable contact fields.
  // contact.phone/email render `tel:`/`mailto:` tap targets — a
  // sentinel value creates a dead/misleading control (same harm
  // pattern as round-15 driver_phone). The `member.` accessor
  // matches the analogous CrewTile render path; classified by
  // class-sweep extension of the round-16 finding. Crew-redesign
  // Task 4 adds `person.` — PersonRow ports the same actionable-row
  // idiom into components/crew/, so a sentinel `person.phone` would
  // render the same dead `tel:` control if left unguarded.
  {
    description: "contact.phone / email + member.phone / email + person.phone / email",
    pattern: /\b(contact|member|person)\??\.(phone|email)\b/,
  },
  // Round-17: PullSheetItem.cat / subCat. PackListTile builds an
  // `(cat / subCat)` taxonomy string in formatItemLabel; sentinel
  // values would otherwise render as `(N/A / TBD)`. The pattern
  // anchors on `item.cat` / `item.subCat` (PackListTile's accessor)
  // and is conservative against unrelated `.cat` / `.subCat`
  // properties elsewhere by requiring the `item.` prefix.
  {
    description: "PullSheetItem.cat / subCat (pack-list taxonomy)",
    pattern: /\bitem\??\.(cat|subCat)\b/,
  },
  // Phase-2 §4.3: ScheduleSection run-of-show optional fields. The agenda entry's
  // room / av / finish / trt are generic-optional free text — a sentinel ('TBD' /
  // 'N/A' / 'TBA' / '') must hide the field, not render as content. The pattern
  // anchors on `entry.(room|av|finish|trt)` (RunOfShowEntry's accessor) so a
  // future refactor that drops the predicate fails at CI.
  {
    description: "agenda entry.room / av / finish / trt (run-of-show)",
    pattern: /\bentry\??\.(room|av|finish|trt)\b/,
  },
  // Per-day-schedule-keytimes spec §5.3 / §5.5 / §3.3: the RAW-RENDERED free-text
  // fields are the ScheduleDay window/showStart (DayCard meta "7:30am–5:50pm" /
  // fragment showStart) and dates.setupTime (Set-day "Setup 10:00PM"). Each is
  // raw sheet text rendered by DayCard meta and MUST route through
  // shouldHideGenericOptional so a 'TBD'/'N/A'/'TBA' sentinel hides rather than
  // rendering as content. Accessors used by the consumers:
  //   - `day.window.start` / `day.window.end` (DayCard window meta)
  //   - `day.showStart`     (DayCard fragment meta)
  //   - `dates.setupTime`   (Set-day DayCard "Setup …" meta)
  // NOTE (R2 finding 6): ShowAnchor.time is INTENTIONALLY NOT registered here —
  // it is sentinel-guarded at the SOURCE (`resolveKeyTimes` only emits anchors
  // whose value passes `isAbsentTime`, and the §5.1 decision table never emits an
  // absent/sentinel time), so the KeyTimesStrip value (`s.time` → `row.value`) is
  // already clean by construction; a render-time pattern here would be vacuous.
  {
    description: "ScheduleDay.window.start / window.end / showStart",
    pattern: /\b(window\??\.(start|end)\b|\bshowStart\b)/,
  },
  {
    description: "dates.setupTime (Set-day DayCard meta)",
    pattern: /\bdates\??\.setupTime\b|\bsetupTime\b/,
  },
  // BL-EVENT-DETAILS-UNRENDERED: the crew "Tech specs" card surfaces these
  // event_details text keys (GearSection). The current card reads them via a
  // dynamic loop over CREW_TECH_SPEC_KEYS (no literal access), so this LITERAL
  // bracket pattern matches nothing today — it is FORWARD-DEFENSE that fails CI
  // if a FUTURE edit adds a direct `event_details["<key>"]` read in a walked
  // component without routing through shouldHideGenericOptional. (The card's
  // current sentinel-hiding is guaranteed by KeyValueRows + gearTechSpecs tests.)
  {
    description: "event_details tech specs (crew Tech-specs card, bracket access)",
    pattern:
      /event_details\[\s*"(stage_size|podium_type|polling|led|scenic|gooseneck|digital_signage|test_pattern|fonts|equipment_storage|staff_office_room|record|virtual_speaker|virtual_audience|notes)"\s*\]/,
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

/**
 * Files that live under a walked directory but aren't subject to the
 * contract (helpers, or crew primitives/sections that only render
 * pre-resolved/structured props and never read a raw generic-optional
 * string field). Keys are the basename so the exemption is dir-agnostic.
 *
 * As of crew-redesign Task 4: empty. The shipped crew primitives
 * (SectionCard/DayCard/KeyTimesStrip take ReactNode/structured/already-
 * resolved props; KeyValueRows already routes through the predicate) all
 * pass the extended walk without an exemption.
 */
const NON_TILE_FILES = new Set<string>([
  // None as of crew-redesign Task 4. Helper-style files would go here.
]);

/**
 * Recursively collect `.tsx` files under `dir`, returning each as a path
 * RELATIVE to `REPO_ROOT` (so `readTileSource` resolves it from the root
 * regardless of which base dir it came from). A non-existent dir yields [].
 */
function walkTsxFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkTsxFiles(full));
    } else if (entry.endsWith(".tsx")) {
      out.push(full.slice(REPO_ROOT.length + 1));
    }
  }
  return out;
}

/**
 * Returns every tile + crew section/primitive file as a repo-root-relative
 * path, with the NON_TILE_FILES exemption (matched on basename) applied and
 * the `.tsx` filter enforced.
 */
function listTileFiles(): string[] {
  const tiles = readdirSync(TILES_DIR)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => join("components", "tiles", f));
  const crew = CREW_DIRS.flatMap((d) => walkTsxFiles(d));
  return [...tiles, ...crew]
    .filter((rel) => !NON_TILE_FILES.has(rel.split("/").pop() ?? rel))
    .sort();
}

function readTileSource(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

describe("META §8.3 sentinel-hiding contract — components/tiles/ + components/crew/", () => {
  test("at least one tile file exists (sanity guard)", () => {
    // If this fails, the test is reading the wrong directory or the
    // tiles directory got deleted.
    const files = listTileFiles();
    expect(files.length).toBeGreaterThan(0);
  });

  test("the walk includes at least one components/crew/ file (extension guard)", () => {
    // Pins the crew-redesign Task 4 extension: the walk must reach the
    // crew section/primitive trees, not silently regress to tiles-only.
    // If the crew dirs vanish or the walk loses them, this fails before
    // an unguarded crew component can slip through with green CI.
    const files = listTileFiles();
    const crewFiles = files.filter((rel) => rel.startsWith("components/crew/"));
    expect(crewFiles.length, "expected ≥1 components/crew/ file in the walk").toBeGreaterThan(0);
  });

  test("every tile/crew file that consumes a §8.3 generic-optional field imports shouldHideGenericOptional", () => {
    const tiles = listTileFiles();
    const exemptSet = new Set(EXEMPTIONS.map((e) => e.filename));
    const failures: string[] = [];

    for (const relPath of tiles) {
      const basename = relPath.split("/").pop() ?? relPath;
      if (exemptSet.has(relPath) || exemptSet.has(basename)) continue;
      const source = readTileSource(relPath);

      // Which canonical generic-optional fields does this file reference?
      const matches = GENERIC_OPTIONAL_FIELDS.filter((f) => f.pattern.test(source));
      if (matches.length === 0) continue;

      // The file DOES consume at least one generic-optional field. It MUST
      // route it through the canonical predicate `shouldHideGenericOptional`
      // — EITHER directly (import + call site), OR via the shared agenda
      // sentinel-wrapper `resolveOptionalField` (lib/crew/agendaDisplay.ts),
      // which applies `shouldHideGenericOptional` (+ stripAgendaUrls) to every
      // agenda free-text field. The crew-redesign Task-3 run-of-show extraction
      // moved RunOfShowEntry's per-field guard into that shared wrapper, so
      // `RunOfShowList` routes the agenda fields via `resolveOptionalField`
      // rather than a direct predicate call. The `agendaDisplay` single-source
      // guard test pins the wrapper's body, so accepting it here does not open
      // a hole — a future edit that drops BOTH the direct call AND the wrapper
      // still fails this contract.
      const hasDirect =
        /shouldHideGenericOptional\b/.test(source) && /shouldHideGenericOptional\s*\(/.test(source);
      const hasWrapper = /resolveOptionalField\s*\(/.test(source);

      if (!hasDirect && !hasWrapper) {
        const fields = matches.map((m) => m.description).join(", ");
        failures.push(
          `${relPath}: consumes [${fields}] but does not route them through shouldHideGenericOptional (directly or via the shared resolveOptionalField wrapper)`,
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
      expect(e.reason.trim().length, `${e.filename}: exemption reason is empty`).toBeGreaterThan(
        20,
      );
    }
  });

  test("known generic-optional fields list is non-empty", () => {
    // If a future refactor accidentally empties GENERIC_OPTIONAL_FIELDS,
    // this test would otherwise pass vacuously. Pin the floor.
    expect(GENERIC_OPTIONAL_FIELDS.length).toBeGreaterThanOrEqual(5);
  });
});
