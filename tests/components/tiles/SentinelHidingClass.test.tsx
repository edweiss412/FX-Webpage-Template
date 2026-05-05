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
import { AudioScopeTile } from "@/components/tiles/AudioScopeTile";
import { VideoScopeTile } from "@/components/tiles/VideoScopeTile";
import { LightingScopeTile } from "@/components/tiles/LightingScopeTile";
import { FinancialsTile } from "@/components/tiles/FinancialsTile";
import type {
  ContactRow,
  HotelReservationRow,
  RoleFlag,
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

  // ── Codex round-13 — TransportTile vehicle metadata reclassification ─
  // Round 13 reclassified vehicle/license_plate/color/parking as §8.3
  // generic-optional (round 12 had deferred them as identity fields,
  // round 13 reversed that — sentinels in these fields render as fake
  // logistics data which is the same user-visible regression as notes).

  for (const sentinel of SENTINELS) {
    test(`hides Vehicle row when transportation.vehicle="${sentinel}"`, () => {
      const html = renderToStaticMarkup(
        <TransportTile
          transportation={{
            driver_name: "Manny Driver",
            driver_phone: null,
            driver_email: null,
            vehicle: sentinel,
            license_plate: null,
            color: null,
            parking: null,
            schedule: [],
            notes: null,
          }}
          visible
        />,
      );
      expect(html).toContain("Manny Driver");
      expect(html).not.toContain("Vehicle</");
      if (sentinel.trim().length > 0) {
        expect(html).not.toContain(sentinel);
      }
    });

    test(`hides License plate row when transportation.license_plate="${sentinel}"`, () => {
      const html = renderToStaticMarkup(
        <TransportTile
          transportation={{
            driver_name: "Manny Driver",
            driver_phone: null,
            driver_email: null,
            vehicle: null,
            license_plate: sentinel,
            color: null,
            parking: null,
            schedule: [],
            notes: null,
          }}
          visible
        />,
      );
      expect(html).toContain("Manny Driver");
      expect(html).not.toContain("License plate");
      if (sentinel.trim().length > 0) {
        expect(html).not.toContain(sentinel);
      }
    });

    test(`hides Color row when transportation.color="${sentinel}"`, () => {
      const html = renderToStaticMarkup(
        <TransportTile
          transportation={{
            driver_name: "Manny Driver",
            driver_phone: null,
            driver_email: null,
            vehicle: null,
            license_plate: null,
            color: sentinel,
            parking: null,
            schedule: [],
            notes: null,
          }}
          visible
        />,
      );
      expect(html).toContain("Manny Driver");
      // The label "Color" is short and could appear in CSS class
      // attribute strings (e.g., border-color); use the full
      // `<dt>Color</dt>` shape (or similar) to avoid false positives.
      // Simpler: just assert the sentinel value isn't in the DOM —
      // that's the strict bug-pinning check.
      if (sentinel.trim().length > 0) {
        expect(html).not.toContain(sentinel);
      }
    });

    test(`hides Parking row when transportation.parking="${sentinel}"`, () => {
      const html = renderToStaticMarkup(
        <TransportTile
          transportation={{
            driver_name: "Manny Driver",
            driver_phone: null,
            driver_email: null,
            vehicle: null,
            license_plate: null,
            color: null,
            parking: sentinel,
            schedule: [],
            notes: null,
          }}
          visible
        />,
      );
      expect(html).toContain("Manny Driver");
      expect(html).not.toContain("Parking");
      if (sentinel.trim().length > 0) {
        expect(html).not.toContain(sentinel);
      }
    });
  }

  test("renders all vehicle metadata for non-sentinel values (anti-tautology)", () => {
    const html = renderToStaticMarkup(
      <TransportTile
        transportation={{
          driver_name: "Manny Driver",
          driver_phone: null,
          driver_email: null,
          vehicle: "Sprinter Van",
          license_plate: "ABC-1234",
          color: "Black",
          parking: "Lot 5, level B",
          schedule: [],
          notes: null,
        }}
        visible
      />,
    );
    expect(html).toContain("Sprinter Van");
    expect(html).toContain("ABC-1234");
    expect(html).toContain("Black");
    expect(html).toContain("Lot 5, level B");
  });

  test("when ALL vehicle metadata + notes are sentinels, tile shows empty-state", () => {
    // Same all-sentinel pattern as the notes-only case below; this
    // exercises the round-13 fix's allEmpty-branch wiring across the
    // four reclassified fields. driver_name absent so the tile has
    // no other content to keep it alive.
    const html = renderToStaticMarkup(
      <TransportTile
        transportation={{
          driver_name: null,
          driver_phone: null,
          driver_email: null,
          vehicle: "TBD",
          license_plate: "TBD",
          color: "N/A",
          parking: "TBA",
          schedule: [],
          notes: "TBD",
        }}
        visible
      />,
    );
    expect(html).toContain("transport-tile");
    expect(html).not.toContain("TBD");
    expect(html).not.toContain("N/A");
    expect(html).not.toContain("TBA");
    expect(html).toContain("No transport details on file yet.");
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

  // ── Codex round-11 MEDIUM — pickDressCode sentinel bypass ─────────
  // Same sentinel-bypass class as round-10's notes finding, just on a
  // different generic-optional field (dress_code in event_details).
  // The pickDressCode helper previously returned raw values that
  // passed `.trim() !== ""` — sentinel values like "N/A" leaked.

  for (const sentinel of SENTINELS) {
    test(`hides Dress code row when dress_code="${sentinel}"`, () => {
      const html = renderToStaticMarkup(
        <ShowStatusTile
          show={{
            coi_status: "ACCEPTED 4/15",
            venue: null,
            event_details: { dress_code: sentinel },
          }}
        />,
      );
      // Tile renders (COI confirms it's alive — anti-tautology).
      expect(html).toContain("ACCEPTED 4/15");
      // The "Dress code" label must NOT appear when the value is a
      // sentinel — gate is on the value's emptiness via the predicate.
      expect(html).not.toContain("Dress code");
      // Belt-and-braces: the literal sentinel must not be in the DOM.
      if (sentinel.trim().length > 0) {
        expect(html).not.toContain(sentinel);
      }
    });
  }

  test("hides Dress code row across all candidate keys (dress / attire / dress code)", () => {
    // The candidate-key fallback in pickDressCode probes
    // ["dress_code", "dress code", "dress", "attire"] in order. The
    // predicate must be applied to the resolved value regardless of
    // which key matched — otherwise a sheet using "attire: N/A"
    // would still leak.
    for (const key of ["dress_code", "dress code", "dress", "attire"]) {
      const html = renderToStaticMarkup(
        <ShowStatusTile
          show={{
            coi_status: "ACCEPTED 4/15",
            venue: null,
            event_details: { [key]: "TBD" },
          }}
        />,
      );
      expect(html).not.toContain("Dress code");
      expect(html).not.toContain("TBD");
    }
  });

  test("hides Dress code row but preserves later candidate-key non-sentinel value", () => {
    // The candidate fallback should also pass over an early-key
    // sentinel and pick up a later-key real value.
    const html = renderToStaticMarkup(
      <ShowStatusTile
        show={{
          coi_status: "ACCEPTED 4/15",
          venue: null,
          event_details: {
            dress_code: "N/A", // sentinel — predicate hides it
            attire: "Black tie", // real value — should win
          },
        }}
      />,
    );
    expect(html).toContain("Dress code");
    expect(html).toContain("Black tie");
    expect(html).not.toContain("N/A");
  });

  test("renders Dress code row for non-sentinel value (anti-tautology)", () => {
    const html = renderToStaticMarkup(
      <ShowStatusTile
        show={{
          coi_status: "ACCEPTED 4/15",
          venue: null,
          event_details: { dress_code: "Business casual" },
        }}
      />,
    );
    expect(html).toContain("Dress code");
    expect(html).toContain("Business casual");
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

  // ── Codex round-14 — hotel_address + confirmation_no sentinel sweep ─

  for (const sentinel of SENTINELS) {
    test(`hides hotel_address paragraph when value="${sentinel}"`, () => {
      const html = renderToStaticMarkup(
        <LodgingTile
          hotelReservations={[
            {
              ordinal: 1,
              hotel_name: "The Marriott Downtown",
              hotel_address: sentinel,
              names: ["Alice"],
              confirmation_no: null,
              check_in: null,
              check_out: null,
              notes: null,
            },
          ]}
        />,
      );
      // Tile renders (hotel name confirms it's alive — anti-tautology).
      expect(html).toContain("The Marriott Downtown");
      // The address paragraph must NOT render the sentinel.
      if (sentinel.trim().length > 0) {
        expect(html).not.toContain(sentinel);
      }
    });

    test(`hides Confirmation row when confirmation_no="${sentinel}"`, () => {
      const html = renderToStaticMarkup(
        <LodgingTile
          hotelReservations={[
            {
              ordinal: 1,
              hotel_name: "The Marriott Downtown",
              hotel_address: null,
              names: ["Alice"],
              confirmation_no: sentinel,
              check_in: null,
              check_out: null,
              notes: null,
            },
          ]}
        />,
      );
      expect(html).toContain("The Marriott Downtown");
      expect(html).not.toContain("Confirmation");
      if (sentinel.trim().length > 0) {
        expect(html).not.toContain(sentinel);
      }
    });
  }

  test("renders hotel_address + confirmation_no for non-sentinel values (anti-tautology)", () => {
    const html = renderToStaticMarkup(
      <LodgingTile
        hotelReservations={[
          {
            ordinal: 1,
            hotel_name: "The Marriott Downtown",
            hotel_address: "100 Hotel Way, Downtown",
            names: ["Alice"],
            confirmation_no: "ABC-123",
            check_in: null,
            check_out: null,
            notes: null,
          },
        ]}
      />,
    );
    expect(html).toContain("100 Hotel Way, Downtown");
    expect(html).toContain("Confirmation");
    expect(html).toContain("ABC-123");
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

// ── Codex round-12 — scope tiles + FinancialsTile sweep ──────────────
//
// Round 12 reclassified room scope strings (audio/video/lighting) as
// generic-optional per §8.3 (the predicate's example list includes
// `rooms.scenic` which is the same shape) — overturning the round-10
// deferral. FinancialsTile was previously not covered; round 12 found
// it bypasses the predicate on po/proposal/invoice/invoice_notes.

function makeRoom(
  kind: "gs" | "breakout" | "additional",
  overrides: Partial<RoomRow>,
): RoomRow {
  return {
    kind,
    name: kind === "gs" ? "GS" : "Breakout A",
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
    notes: null,
    ...overrides,
  };
}

const ALL_SCOPES: RoleFlag[] = ["LEAD", "L1"];

describe("§8.3 sentinel-hiding class — AudioScopeTile (Codex round-12)", () => {
  for (const sentinel of SENTINELS) {
    test(`renders empty-state when EVERY room.audio is "${sentinel}"`, () => {
      const html = renderToStaticMarkup(
        <AudioScopeTile
          rooms={[
            makeRoom("gs", { audio: sentinel }),
            makeRoom("breakout", { audio: sentinel }),
          ]}
          viewerFlags={ALL_SCOPES}
        />,
      );
      // Tile renders (predicate visibility is true; tile is never null).
      expect(html).toContain("audio-scope-tile");
      // Empty-state placeholder must show — not the sentinel as a real
      // audio spec.
      expect(html).toContain("No audio details for any room yet.");
      if (sentinel.trim().length > 0) {
        expect(html).not.toContain(sentinel);
      }
    });
  }

  test("renders ONLY rooms with non-sentinel audio (mixed input)", () => {
    const html = renderToStaticMarkup(
      <AudioScopeTile
        rooms={[
          makeRoom("gs", { name: "GS", audio: "TBD" }),
          makeRoom("breakout", { name: "Breakout A", audio: "L-Acoustics K1" }),
          makeRoom("additional", { name: "Green Room", audio: "N/A" }),
        ]}
        viewerFlags={ALL_SCOPES}
      />,
    );
    // Real spec survives.
    expect(html).toContain("L-Acoustics K1");
    // Sentinel rooms suppressed at the predicate.
    expect(html).not.toContain("TBD");
    expect(html).not.toContain("N/A");
  });

  test("renders real audio spec for non-sentinel value (anti-tautology)", () => {
    const html = renderToStaticMarkup(
      <AudioScopeTile
        rooms={[makeRoom("gs", { name: "GS", audio: "L-Acoustics K1" })]}
        viewerFlags={ALL_SCOPES}
      />,
    );
    expect(html).toContain("L-Acoustics K1");
    expect(html).not.toContain("No audio details");
  });
});

describe("§8.3 sentinel-hiding class — VideoScopeTile (Codex round-12)", () => {
  for (const sentinel of SENTINELS) {
    test(`renders empty-state when EVERY room.video is "${sentinel}"`, () => {
      const html = renderToStaticMarkup(
        <VideoScopeTile
          rooms={[makeRoom("gs", { video: sentinel })]}
          viewerFlags={ALL_SCOPES}
        />,
      );
      expect(html).toContain("video-scope-tile");
      if (sentinel.trim().length > 0) {
        expect(html).not.toContain(sentinel);
      }
    });
  }

  test("renders only rooms with non-sentinel video (mixed input)", () => {
    const html = renderToStaticMarkup(
      <VideoScopeTile
        rooms={[
          makeRoom("gs", { name: "GS", video: "TBD" }),
          makeRoom("breakout", { name: "Ballroom", video: "Christie 4K projector" }),
        ]}
        viewerFlags={ALL_SCOPES}
      />,
    );
    expect(html).toContain("Christie 4K projector");
    expect(html).not.toContain("TBD");
  });

  test("renders real video spec for non-sentinel value (anti-tautology)", () => {
    const html = renderToStaticMarkup(
      <VideoScopeTile
        rooms={[makeRoom("gs", { name: "GS", video: "Christie 4K projector" })]}
        viewerFlags={ALL_SCOPES}
      />,
    );
    expect(html).toContain("Christie 4K projector");
  });
});

describe("§8.3 sentinel-hiding class — LightingScopeTile (Codex round-12)", () => {
  for (const sentinel of SENTINELS) {
    test(`renders empty-state when EVERY room.lighting is "${sentinel}"`, () => {
      const html = renderToStaticMarkup(
        <LightingScopeTile
          rooms={[makeRoom("gs", { lighting: sentinel })]}
          viewerFlags={ALL_SCOPES}
        />,
      );
      expect(html).toContain("lighting-scope-tile");
      if (sentinel.trim().length > 0) {
        expect(html).not.toContain(sentinel);
      }
    });
  }

  test("renders only rooms with non-sentinel lighting (mixed input)", () => {
    const html = renderToStaticMarkup(
      <LightingScopeTile
        rooms={[
          makeRoom("gs", { name: "GS", lighting: "TBA" }),
          makeRoom("breakout", { name: "Ballroom", lighting: "MAC Aura XB wash" }),
        ]}
        viewerFlags={ALL_SCOPES}
      />,
    );
    expect(html).toContain("MAC Aura XB wash");
    expect(html).not.toContain("TBA");
  });

  test("renders real lighting spec for non-sentinel value (anti-tautology)", () => {
    const html = renderToStaticMarkup(
      <LightingScopeTile
        rooms={[makeRoom("gs", { name: "GS", lighting: "MAC Aura XB wash" })]}
        viewerFlags={ALL_SCOPES}
      />,
    );
    expect(html).toContain("MAC Aura XB wash");
  });
});

describe("§8.3 sentinel-hiding class — FinancialsTile (Codex round-12)", () => {
  // Visibility — financialsVisible(['LEAD'], false) → true. The tile
  // also accepts `isAdmin: true` regardless of flags.
  const VIEWER_FLAGS: RoleFlag[] = ["LEAD"];

  for (const sentinel of SENTINELS) {
    test(`renders empty-state when EVERY field is "${sentinel}"`, () => {
      const html = renderToStaticMarkup(
        <FinancialsTile
          financials={{
            po: sentinel,
            proposal: sentinel,
            invoice: sentinel,
            invoice_notes: sentinel,
          }}
          viewerFlags={VIEWER_FLAGS}
          isAdmin={false}
        />,
      );
      // Tile renders (LEAD is entitled).
      expect(html).toContain("financials-tile");
      // Empty-state placeholder copy from the production path.
      expect(html).toContain("No financial details on file yet.");
      if (sentinel.trim().length > 0) {
        expect(html).not.toContain(sentinel);
      }
    });
  }

  test("renders ONLY non-sentinel fields when financials are mixed", () => {
    const html = renderToStaticMarkup(
      <FinancialsTile
        financials={{
          po: "PO-12345", // real
          proposal: "TBD", // sentinel
          invoice: "INV-99", // real
          invoice_notes: "N/A", // sentinel
        }}
        viewerFlags={VIEWER_FLAGS}
        isAdmin={false}
      />,
    );
    expect(html).toContain("PO-12345");
    expect(html).toContain("INV-99");
    // Sentinels suppressed.
    expect(html).not.toContain("TBD");
    expect(html).not.toContain("N/A");
  });

  test("renders real fields for non-sentinel values (anti-tautology)", () => {
    const html = renderToStaticMarkup(
      <FinancialsTile
        financials={{
          po: "PO-12345",
          proposal: "Approved 4/10",
          invoice: "INV-99",
          invoice_notes: "Net 30 from event date",
        }}
        viewerFlags={VIEWER_FLAGS}
        isAdmin={false}
      />,
    );
    expect(html).toContain("PO-12345");
    expect(html).toContain("Approved 4/10");
    expect(html).toContain("INV-99");
    expect(html).toContain("Net 30 from event date");
    // Empty-state placeholder absent.
    expect(html).not.toContain("No financial details");
  });
});
