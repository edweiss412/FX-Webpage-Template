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

import { VenueBreakdown } from "@/components/admin/wizard/step3ReviewSections";
import type { ShowOverridesView } from "@/lib/overrides/loadShowOverrides";

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
