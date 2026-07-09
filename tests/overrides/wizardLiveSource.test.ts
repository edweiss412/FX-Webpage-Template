// @vitest-environment jsdom
//
// Task 15 (spec §8.3, R18 + R15) — the review-wizard override widgets source
// their CAS inputs (currentValue / expectedCurrentValue / override state) from the
// LIVE admin-override loader, NEVER from the pending, not-yet-applied parse.
//
// Anti-tautology: the fixture is built so the PENDING parse venue DIFFERS from the
// LIVE show venue. A widget that mistakenly sourced the pending parse would render
// the pending name and send the pending value as CAS-B — both assertions below
// would then fail. So the test can only pass when the widget is genuinely
// LIVE-sourced (the whole point of R18).
//
// R15 gate: a genuinely first-seen show (no `shows` row → liveOverrides === null)
// renders a read-only (disabled) widget plus the publish-first hint.
//
// Rendered via React Testing Library (jsdom). VenueMapTile is stubbed (it renders a
// browser map and is irrelevant to the data-plane assertions), and the server
// action is mocked so we can observe the exact CAS params the widget sends.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { createElement as h } from "react";

const { onSaveSpy } = vi.hoisted(() => ({
  onSaveSpy: vi.fn(
    async (_params: unknown) => ({ ok: true, value: null }) as { ok: true; value: unknown },
  ),
}));

// The real onSave passed by the wizard (§8.3 / §8.4). Direct-ref import in the
// component; here we intercept it to observe the CAS-B payload.
vi.mock("@/app/admin/show/[slug]/_actions/overrides", () => ({
  setFieldOverrideAction: (params: unknown) => onSaveSpy(params),
}));

// VenueMapTile mounts a map (irrelevant to the data plane, unsafe in jsdom).
vi.mock("@/components/admin/wizard/VenueMapTile", () => ({
  VenueMapTile: () => h("div", { "data-testid": "venue-map-stub" }),
}));

import {
  VenueBreakdown,
  CrewBreakdown,
  HotelsBreakdown,
} from "@/components/admin/wizard/step3ReviewSections";
import type { ShowOverridesView } from "@/lib/overrides/loadShowOverrides";
import type { CrewMemberRow, HotelReservationRow } from "@/lib/parser/types";
import {
  HOTEL_DISAMBIGUATOR_SEP,
  computeHotelDisambiguator,
} from "@/lib/overrides/hotelDisambiguator";

const PENDING_VENUE = {
  name: "PENDING HALL",
  address: "1 Pending Rd",
  city: "Pendtown",
  loadingDock: null,
  googleLink: null,
};

// The LIVE show row — deliberately different from the pending parse above.
const LIVE_VENUE = {
  name: "LIVE ARENA",
  address: "9 Live Ave",
  city: "Livecity",
  loadingDock: null,
  googleLink: null,
};

// A live-show loader view: an ACTIVE venue override whose CAS-B (expectedCurrentValue)
// is the RAW live venue jsonb (R17), never the pending parse.
function liveView(): ShowOverridesView {
  return {
    show: {
      dates: { currentValue: "", expectedCurrentValue: null, override: null },
      venue: {
        currentValue: JSON.stringify(LIVE_VENUE),
        expectedCurrentValue: LIVE_VENUE,
        override: {
          overrideValue: LIVE_VENUE,
          sheetValue: LIVE_VENUE,
          active: true,
          deactivationCode: null,
          version: 7,
        },
      },
    },
    crew: [],
    hotels: [],
  };
}

beforeEach(() => {
  onSaveSpy.mockClear();
  cleanup();
});

describe("wizard override widgets — LIVE source (R18)", () => {
  it("sources the value display + CAS-B from the LIVE loader, not the pending parse", async () => {
    render(
      h(VenueBreakdown, {
        dfid: "dfid-live",
        venue: PENDING_VENUE,
        liveOverrides: liveView(),
      }),
    );

    // (1) The widget's value cell shows the LIVE venue, never the pending parse.
    const valueCell = screen.getByTestId("override-value-show-venue");
    expect(valueCell.textContent).toContain("LIVE ARENA");
    expect(valueCell.textContent).not.toContain("PENDING HALL");

    // (2) Editing sends the LIVE field as CAS-B (p_expected_current_value), NOT the
    // pending value — a widget sourcing the pending parse would send PENDING_VENUE.
    fireEvent.click(screen.getByTestId("override-edit-show-venue"));
    fireEvent.click(screen.getByTestId("override-save-show-venue"));

    await waitFor(() => expect(onSaveSpy).toHaveBeenCalledTimes(1));
    const params = onSaveSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(params.p_domain).toBe("show");
    expect(params.p_field).toBe("venue");
    expect(params.p_op).toBe("upsert");
    expect(params.p_expected_current_value).toEqual(LIVE_VENUE);
    expect(params.p_expected_current_value).not.toEqual(PENDING_VENUE);
  });
});

describe("wizard override widgets — first-seen gate (R15)", () => {
  it("renders read-only (disabled) + the publish-first hint when no live show exists", () => {
    render(
      h(VenueBreakdown, {
        dfid: "dfid-first-seen",
        venue: PENDING_VENUE,
        // null = the show has no `shows` row yet (first-seen, pre-publish).
        liveOverrides: null,
      }),
    );

    // The field renders, but disabled: no Edit affordance.
    expect(screen.getByTestId("overrideable-field-show-venue")).toBeTruthy();
    expect(screen.queryByTestId("override-edit-show-venue")).toBeNull();

    // The publish-first hint is present.
    expect(screen.getByTestId("override-unavailable-show-venue").textContent).toContain(
      "Overrides become available after you publish this show",
    );
  });
});

// Adversarial R2 (Codex round 2, HIGH): the wizard matched crew rows by the live
// DISPLAY value, not the parsed key. With an active `Jon→John` override the live view
// renders currentValue="John" while matchKey stays "Jon" and the pending parse still
// emits name="Jon" — a currentValue match MISSES the live row, disables the controls,
// and hides the active chip. Must match on matchKey (§8.2a).
describe("wizard crew widget — matches the PARSED key under an active rename (R2)", () => {
  function crewMember(name: string): CrewMemberRow {
    return {
      name,
      email: null,
      phone: null,
      role: "A1",
      role_flags: [],
      date_restriction: { kind: "none" },
      stage_restriction: { kind: "none" },
      flight_info: null,
    };
  }
  function liveCrewView(): ShowOverridesView {
    return {
      show: {
        dates: { currentValue: "", expectedCurrentValue: null, override: null },
        venue: { currentValue: "", expectedCurrentValue: null, override: null },
      },
      crew: [
        {
          id: "crew-1",
          matchKey: "Jon", // durable parsed key
          name: {
            currentValue: "John", // live display AFTER the active rename
            expectedCurrentValue: "John",
            override: {
              overrideValue: "John",
              sheetValue: "Jon",
              active: true,
              deactivationCode: null,
              version: 4,
            },
          },
          role: { currentValue: "A1", expectedCurrentValue: "A1", override: null },
        },
      ],
      hotels: [],
    };
  }

  it("resolves the live view (edit enabled, active chip) and saves under matchKey='Jon'", async () => {
    render(
      h(CrewBreakdown, {
        dfid: "dfid-live",
        // Pending parse still emits the parsed name "Jon" (stable-parse re-sync).
        members: [crewMember("Jon")],
        liveOverrides: liveCrewView(),
      }),
    );
    // The widget resolved to the live row → the Edit affordance is present (NOT disabled)
    // and the active "Overridden" chip shows. Under the old currentValue match both fail.
    expect(screen.getByTestId("override-chip-crew-name")).toBeTruthy();
    const edit = screen.getByTestId("override-edit-crew-name");
    fireEvent.click(edit);
    fireEvent.click(screen.getByTestId("override-save-crew-name"));
    await waitFor(() => expect(onSaveSpy).toHaveBeenCalledTimes(1));
    const p = onSaveSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(p.p_match_key).toBe("Jon"); // the parsed key, not "John"
  });
});

// Adversarial R2 (Codex round 2, HIGH): the wizard matched hotels by
// currentLiveHotelName, so two same-name reservations both resolved to the FIRST
// live view — editing the 2nd would send the 1st reservation's matchKey and mutate the
// WRONG hotel. Must match by the parsed name + §5.3 disambiguator.
describe("wizard hotel widget — duplicate names bind to the correct reservation (R2)", () => {
  function hotel(name: string, checkIn: string, conf: string): HotelReservationRow {
    return {
      ordinal: 1,
      hotel_name: name,
      hotel_address: "addr",
      names: [],
      confirmation_no: conf,
      check_in: checkIn,
      check_out: null,
      notes: null,
    };
  }
  const resA = hotel("Grand Marriott", "2026-07-01", "AAA");
  const resB = hotel("Grand Marriott", "2026-08-01", "BBB");
  const keyA = `Grand Marriott${HOTEL_DISAMBIGUATOR_SEP}${computeHotelDisambiguator(resA)}`;
  const keyB = `Grand Marriott${HOTEL_DISAMBIGUATOR_SEP}${computeHotelDisambiguator(resB)}`;

  function liveHotelView(): ShowOverridesView {
    const nameField = (mk: string) => ({
      id: mk,
      matchKey: mk,
      currentLiveHotelName: "Grand Marriott",
      currentOrdinal: 1,
      hotel_name: {
        currentValue: "Grand Marriott",
        expectedCurrentValue: "Grand Marriott",
        override: null,
      },
      hotel_address: { currentValue: "addr", expectedCurrentValue: "addr", override: null },
    });
    return {
      show: {
        dates: { currentValue: "", expectedCurrentValue: null, override: null },
        venue: { currentValue: "", expectedCurrentValue: null, override: null },
      },
      crew: [],
      hotels: [nameField(keyA), nameField(keyB)],
    };
  }

  it("editing the SECOND duplicate reservation saves under ITS OWN matchKey, not the first's", async () => {
    render(
      h(HotelsBreakdown, {
        dfid: "dfid-live",
        hotels: [resA, resB],
        liveOverrides: liveHotelView(),
      }),
    );
    // Two hotel_name widgets share a testid (DOM order = [A, B]). Open the SECOND one.
    const editButtons = screen.getAllByTestId("override-edit-hotel-hotel_name");
    expect(editButtons.length).toBe(2);
    fireEvent.click(editButtons[1]!);
    fireEvent.click(screen.getByTestId("override-save-hotel-hotel_name"));
    await waitFor(() => expect(onSaveSpy).toHaveBeenCalledTimes(1));
    const p = onSaveSpy.mock.calls[0]![0] as Record<string, unknown>;
    // The crux: reservation B's OWN key — the old code sent keyA (first view) for both.
    expect(p.p_match_key).toBe(keyB);
    expect(p.p_match_key).not.toBe(keyA);
  });
});
