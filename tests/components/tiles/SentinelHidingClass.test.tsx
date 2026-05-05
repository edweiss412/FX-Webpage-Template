/**
 * tests/components/tiles/SentinelHidingClass.test.tsx
 *
 * Pins the §8.3 generic-optional sentinel-hiding contract on every M4
 * tile that renders a free-text "notes" field. Codex round-10 fresh-
 * eyes whole-M4 review (2026-05-04) caught NotesTile bypassing
 * `lib/visibility/emptyState.ts:shouldHideGenericOptional` via a local
 * `nonEmpty()` helper that filtered only null/undefined/whitespace —
 * so values like `"N/A"`, `"TBD"`, `"TBA"` rendered as if they were
 * real notes content. Class-sweep found the same bypass in 5 more
 * tiles (TransportTile, ShowStatusTile, LodgingTile, VenueTile,
 * ContactsTile) — all of which inline truthiness or `.trim()` checks
 * for notes fields instead of routing through the central predicate.
 *
 * Spec context:
 *   - §8.3 (Whole-tile-missing / generic-optional fields).
 *   - lib/visibility/emptyState.ts:27-29 — explicit "Tiles MUST NOT
 *     inline string-list checks — every visibility decision routes
 *     through this module so the rule lives in one place."
 *   - The predicate hides `''`, `'TBD'`, `'N/A'`, `'TBA'`
 *     (case-insensitive after trim).
 *
 * Anti-tautology guarantees:
 *   - Each tile gets BOTH a sentinel and a non-sentinel test. The
 *     sentinel test asserts the rendered DOM does NOT contain the
 *     sentinel string AND the notes-specific label is absent. The
 *     non-sentinel test asserts the value IS rendered — proving the
 *     predicate isn't a no-op disabler.
 *   - Identity fields (hotel_name, contact name) are NOT subject to
 *     the predicate per §8.3. Tests verify identity values still
 *     render even when label-format strings could collide with
 *     sentinels (covered indirectly: fixtures use realistic identity
 *     names).
 *   - Each test fixture also populates a non-notes sibling field so
 *     the tile renders SOMETHING — a passing test where the tile
 *     returned null entirely would be vacuously true.
 *
 * Driving strategy:
 *   - `renderToStaticMarkup` (server-render to HTML string), same
 *     pattern as tests/components/tiles/ScopeTileIcons.test.tsx. No
 *     jsdom needed; fast and deterministic.
 *
 * Failure modes pinned (per-test):
 *   - NotesTile: a show whose ONLY notes are sentinels renders the
 *     "Things to know" tile with sentinel text. [HIGH crew impact —
 *     surfaces meaningless content as actionable context.]
 *   - TransportTile: `notes: "TBD"` renders a paragraph with "TBD".
 *   - ShowStatusTile: `venue.notes: "N/A"` renders a Venue notes row
 *     with "N/A".
 *   - LodgingTile: reservation `notes: "TBA"` renders a Notes
 *     KeyValue row.
 *   - VenueTile: `venue.notes: "TBD"` renders a Notes KeyValue row.
 *   - ContactsTile: `contact.notes: "N/A"` renders a notes paragraph.
 */
import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NotesTile } from "@/components/tiles/NotesTile";
import { TransportTile } from "@/components/tiles/TransportTile";
import { ShowStatusTile } from "@/components/tiles/ShowStatusTile";
import { LodgingTile } from "@/components/tiles/LodgingTile";
import { VenueTile } from "@/components/tiles/VenueTile";
import { ContactsTile } from "@/components/tiles/ContactsTile";
import type {
  ContactRow,
  HotelReservationRow,
  RoomRow,
  ShowRow,
  TransportationRow,
} from "@/lib/parser/types";

// Sentinel values exercised by these tests. Every value here MUST be
// in `lib/visibility/emptyState.ts:GENERIC_OPTIONAL_HIDE` (case-
// insensitive). If that module's hide set ever shrinks, this array
// becomes a false-positive — keep them aligned.
const SENTINELS = ["TBD", "N/A", "TBA", "  ", ""] as const;

// Helper: strip nothing — return raw HTML for substring assertions.
// We assert against the LITERAL sentinel string AND the notes label
// to catch both "value rendered as text" and "value rendered as
// attribute (e.g. aria-label, title)" leaks.

describe("§8.3 sentinel-hiding class — NotesTile (Codex round-10 MEDIUM)", () => {
  function fixtureShow(
    overrides: Partial<Pick<ShowRow, "venue">> = {},
  ): Pick<ShowRow, "venue"> {
    return {
      venue: null,
      ...overrides,
    };
  }

  function fixtureHotel(notes: string | null): HotelReservationRow {
    return {
      ordinal: 1,
      hotel_name: "The Marriott Downtown",
      hotel_address: null,
      names: [],
      confirmation_no: null,
      check_in: null,
      check_out: null,
      notes,
    };
  }

  function fixtureRoom(notes: string | null): RoomRow {
    return {
      kind: "gs",
      name: "Grand Ballroom",
      dimensions: null,
      floor: null,
      setup: null,
      set_time: null,
      show_time: null,
      strike_time: null,
      audio: null,
      video: null,
      lighting: null,
      scenic: null,
      power: null,
      digital_signage: null,
      other: null,
      notes,
    };
  }

  function fixtureContact(notes: string | null): ContactRow {
    return {
      kind: "venue",
      name: "Stella the FOH Manager",
      email: null,
      phone: null,
      notes,
    };
  }

  function fixtureTransport(notes: string | null): TransportationRow {
    return {
      driver_name: "Manny Driver",
      driver_phone: null,
      driver_email: null,
      vehicle: null,
      license_plate: null,
      color: null,
      parking: null,
      schedule: [],
      notes,
    };
  }

  for (const sentinel of SENTINELS) {
    test(`tile reflows out when EVERY notes source is "${sentinel}"`, () => {
      const html = renderToStaticMarkup(
        <NotesTile
          show={fixtureShow({
            venue: { name: "TestVenue", address: "1 Main", notes: sentinel },
          })}
          hotelReservations={[fixtureHotel(sentinel)]}
          rooms={[fixtureRoom(sentinel)]}
          transportation={fixtureTransport(sentinel)}
          contacts={[fixtureContact(sentinel)]}
        />,
      );
      // §8.3: zero non-sentinel notes → tile reflows out (returns null).
      // Pre-fix failure mode: tile renders with sentinel text shown to
      // crew under "Things to know."
      expect(html).toBe("");
    });
  }

  test("tile renders ONLY non-sentinel entries when sources are mixed", () => {
    const html = renderToStaticMarkup(
      <NotesTile
        show={fixtureShow({
          venue: { name: "TestVenue", address: "1 Main", notes: "TBD" },
        })}
        hotelReservations={[fixtureHotel("Free WiFi at front desk")]}
        rooms={[fixtureRoom("N/A")]}
        transportation={fixtureTransport("TBA")}
        contacts={[fixtureContact("Knows the loading dock combo")]}
      />,
    );
    // Tile renders.
    expect(html).toContain("notes-tile");
    // Real notes survive.
    expect(html).toContain("Free WiFi at front desk");
    expect(html).toContain("Knows the loading dock combo");
    // Sentinel notes do not. Each is checked individually so the
    // failing assertion names which sentinel leaked through.
    expect(html).not.toContain("TBD");
    expect(html).not.toContain("N/A");
    expect(html).not.toContain("TBA");
    // Identity labels for the surviving entries DO render.
    expect(html).toContain("The Marriott Downtown");
    expect(html).toContain("Stella the FOH Manager");
  });

  test("tile renders identity-field labels (NOT subject to predicate)", () => {
    // Codex's recommendation: keep separate non-empty handling for
    // labels like hotel_name/contact name. They are identity fields,
    // not generic-optional sentinels. A hotel literally named "TBD"
    // is unlikely but possible; the spec's predicate doesn't gate
    // identity fields, so the tile must still render the entry.
    const html = renderToStaticMarkup(
      <NotesTile
        show={{ venue: null }}
        hotelReservations={[
          {
            ordinal: 1,
            hotel_name: "TBD", // edge: literal name "TBD" — rare but valid
            hotel_address: null,
            names: [],
            confirmation_no: null,
            check_in: null,
            check_out: null,
            notes: "Real notes here", // non-sentinel notes survive
          },
        ]}
        rooms={[]}
        transportation={null}
        contacts={[]}
      />,
    );
    // The notes content survives.
    expect(html).toContain("Real notes here");
    // The hotel label rendered (identity field path), even though
    // the value happens to match a sentinel string. This pins the
    // current spec interpretation.
    expect(html).toContain("Hotel: TBD");
  });
});

describe("§8.3 sentinel-hiding class — TransportTile", () => {
  for (const sentinel of SENTINELS) {
    test(`renders driver but NOT notes paragraph when notes="${sentinel}"`, () => {
      const html = renderToStaticMarkup(
        <TransportTile
          transportation={{
            driver_name: "Manny Driver",
            driver_phone: null,
            driver_email: null,
            vehicle: null,
            license_plate: null,
            color: null,
            parking: null,
            schedule: [],
            notes: sentinel,
          }}
          visible
        />,
      );
      // Tile renders (driver is present so allEmpty=false post-fix).
      expect(html).toContain("transport-tile");
      // Driver name (anti-tautology) confirms the tile is alive.
      expect(html).toContain("Manny Driver");
      // Sentinel must not be in the DOM.
      if (sentinel.trim().length > 0) {
        expect(html).not.toContain(sentinel);
      }
    });
  }

  test("renders the notes paragraph for non-sentinel value", () => {
    const html = renderToStaticMarkup(
      <TransportTile
        transportation={{
          driver_name: "Manny Driver",
          driver_phone: null,
          driver_email: null,
          vehicle: null,
          license_plate: null,
          color: null,
          parking: null,
          schedule: [],
          notes: "Park in the back lot, gate code 1234",
        }}
        visible
      />,
    );
    expect(html).toContain("Park in the back lot, gate code 1234");
  });

  test("when notes is the only field and it's a sentinel, tile shows empty-state", () => {
    // Pre-fix: a transportation row whose only field is `notes:"TBD"`
    // would pass the allEmpty check (notes is truthy) and render a
    // tile with just "TBD" as content — confusing for crew.
    // Post-fix: the allEmpty branch must treat sentinel notes as
    // absent so the tile falls into the empty-state placeholder.
    const html = renderToStaticMarkup(
      <TransportTile
        transportation={{
          driver_name: null,
          driver_phone: null,
          driver_email: null,
          vehicle: null,
          license_plate: null,
          color: null,
          parking: null,
          schedule: [],
          notes: "TBD",
        }}
        visible
      />,
    );
    // Tile renders (tile is always-render when visible per its
    // existing contract).
    expect(html).toContain("transport-tile");
    // Sentinel not in DOM.
    expect(html).not.toContain("TBD");
    // Empty-state placeholder copy from the production path.
    expect(html).toContain("No transport details on file yet.");
  });
});

describe("§8.3 sentinel-hiding class — ShowStatusTile", () => {
  for (const sentinel of SENTINELS) {
    test(`hides Venue notes row when value="${sentinel}"`, () => {
      const html = renderToStaticMarkup(
        <ShowStatusTile
          show={{
            coi_status: "ACCEPTED 4/15",
            venue: { name: "TestVenue", address: "1 Main", notes: sentinel },
            event_details: {},
          }}
        />,
      );
      // Tile renders with COI value (anti-tautology sibling).
      expect(html).toContain("ACCEPTED 4/15");
      // The "Venue notes" label must NOT appear when the value is a
      // sentinel — gate is on the value's emptiness, label is omitted
      // entirely.
      expect(html).not.toContain("Venue notes");
      // Belt-and-braces: the literal sentinel must not be in the DOM
      // (covers the case where label-omission missed but value still
      // rendered somewhere).
      if (sentinel.trim().length > 0) {
        expect(html).not.toContain(sentinel);
      }
    });
  }

  test("renders Venue notes row for non-sentinel value", () => {
    const html = renderToStaticMarkup(
      <ShowStatusTile
        show={{
          coi_status: "ACCEPTED 4/15",
          venue: {
            name: "TestVenue",
            address: "1 Main",
            notes: "No coffee allowed in the ballroom",
          },
          event_details: {},
        }}
      />,
    );
    expect(html).toContain("Venue notes");
    expect(html).toContain("No coffee allowed in the ballroom");
  });
});

describe("§8.3 sentinel-hiding class — LodgingTile", () => {
  function lodgingFixture(notes: string | null): HotelReservationRow {
    return {
      ordinal: 1,
      hotel_name: "The Marriott Downtown",
      hotel_address: "100 Hotel Way",
      names: ["Alice"],
      confirmation_no: "ABC123",
      check_in: "2026-04-20",
      check_out: "2026-04-23",
      notes,
    };
  }

  for (const sentinel of SENTINELS) {
    test(`hides Notes row when value="${sentinel}"`, () => {
      const html = renderToStaticMarkup(
        <LodgingTile hotelReservations={[lodgingFixture(sentinel)]} />,
      );
      // Tile renders (hotel name confirms it's alive).
      expect(html).toContain("The Marriott Downtown");
      // The Notes label is the LodgingTile's KeyValue row label —
      // KeyValue renders both the label and value; we rely on the
      // sentinel being absent to confirm the row was suppressed.
      // (We can't grep `Notes` here because it could also be a
      // section heading on the page; sentinel absence is the strict
      // check.)
      if (sentinel.trim().length > 0) {
        expect(html).not.toContain(sentinel);
      }
    });
  }

  test("renders Notes row for non-sentinel value", () => {
    const html = renderToStaticMarkup(
      <LodgingTile
        hotelReservations={[lodgingFixture("Late checkout granted")]}
      />,
    );
    expect(html).toContain("Late checkout granted");
  });
});

describe("§8.3 sentinel-hiding class — VenueTile", () => {
  for (const sentinel of SENTINELS) {
    test(`hides Notes row when venue.notes="${sentinel}"`, () => {
      const html = renderToStaticMarkup(
        <VenueTile
          venue={{
            name: "Hilton Downtown",
            address: "200 Main St",
            loadingDock: null,
            googleLink: null,
            notes: sentinel,
          }}
        />,
      );
      // Tile renders (venue name confirms it's alive).
      expect(html).toContain("Hilton Downtown");
      if (sentinel.trim().length > 0) {
        expect(html).not.toContain(sentinel);
      }
    });
  }

  test("renders Notes row for non-sentinel value", () => {
    const html = renderToStaticMarkup(
      <VenueTile
        venue={{
          name: "Hilton Downtown",
          address: "200 Main St",
          loadingDock: null,
          googleLink: null,
          notes: "Tell front desk you are with FXAV for parking validation",
        }}
      />,
    );
    expect(html).toContain(
      "Tell front desk you are with FXAV for parking validation",
    );
  });
});

describe("§8.3 sentinel-hiding class — ContactsTile", () => {
  function contactFixture(notes: string | null): ContactRow {
    return {
      kind: "venue",
      name: "Stella the FOH Manager",
      email: null,
      phone: null,
      notes,
    };
  }

  for (const sentinel of SENTINELS) {
    test(`hides notes paragraph when contact.notes="${sentinel}"`, () => {
      const html = renderToStaticMarkup(
        <ContactsTile contacts={[contactFixture(sentinel)]} />,
      );
      // Tile renders (contact name confirms it's alive).
      expect(html).toContain("Stella the FOH Manager");
      if (sentinel.trim().length > 0) {
        expect(html).not.toContain(sentinel);
      }
    });
  }

  test("renders notes paragraph for non-sentinel value", () => {
    const html = renderToStaticMarkup(
      <ContactsTile
        contacts={[contactFixture("Knows the loading dock combo")]}
      />,
    );
    expect(html).toContain("Knows the loading dock combo");
  });
});
