// @vitest-environment jsdom
/**
 * tests/components/show-panels/hotelCardBody.test.tsx
 * (crew page redesign PR B plan, Task 8; spec
 * docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md §6.1, §6.2
 * `hotels` row, line 307)
 *
 * The hotel card body is the admin's `HotelCard`, shared: the hotel name over
 * its address, the check-in / check-out date stub with its night count, and
 * the guest chips, plus the two fields only the crew page shows (the
 * confirmation number and the reservation's notes). Each surface turns its
 * fields on with a flag: admin `showConfirmation: false`, `showNotes: false`,
 * `showGuests: true`, `hideDates: false` (what `HotelCard` renders at
 * 7e927e927, components/admin/wizard/step3ReviewSections.tsx:2971-3102); the
 * crew page's flags land with its Hotels section (plan Task 9).
 *
 * The admin rendering is pinned byte for byte by the Task 1 golden
 * (tests/components/admin/wizard/adminSectionDom.test.tsx) and asserted nowhere
 * else. The last block here proves only that the admin renders THROUGH this
 * body, with the props that describe what it renders today: `HotelCard` keeps
 * its two `useId` calls and passes both ids in, and `HotelsBreakdown` keeps its
 * context read and `HOTELS_CAP`.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { HOTELS_CAP, HotelsBreakdown } from "@/components/admin/wizard/step3ReviewSections";
import {
  HotelCardBody,
  hotelCardLabel,
  type HotelCardBodyProps,
} from "@/components/show-panels/HotelCardBody";
import * as hotelCardBodyModule from "@/components/show-panels/HotelCardBody";
import type { HotelReservationRow } from "@/lib/parser/types";
import { premise, premiseHolds } from "@/tests/_shared/premise";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Every field the body can show, each non-empty (the flags' premises read it). */
const HOTEL: HotelReservationRow = {
  ordinal: 1,
  hotel_name: "Hotel Nikko",
  hotel_address: "222 Mason St, San Francisco",
  names: ["Ann Lee", "Bo Diaz"],
  confirmation_no: "HN-40812",
  check_in: "2026-04-10",
  check_out: "2026-04-13",
  notes: "Late arrival guaranteed",
};

const BASE: HotelCardBodyProps = {
  hotel: HOTEL,
  nameId: "hotel-name-id",
  guestsLabelId: "hotel-guests-id",
  showConfirmation: false,
  showNotes: false,
  showGuests: false,
  hideDates: false,
  sentinels: "show",
};

/** The body called as a plain function (it is hook-free), then rendered. */
function card(over: Partial<HotelCardBodyProps> = {}): HTMLElement {
  const { container } = render(HotelCardBody({ ...BASE, ...over }));
  const root = container.firstElementChild;
  premiseHolds("the body rendered a root element", root instanceof HTMLElement);
  return root as HTMLElement;
}

/** The value element of a labelled stay field ("Confirmation", "Notes"), or null. */
function stayValue(root: HTMLElement, label: string): HTMLElement | null {
  const term = [...root.querySelectorAll("dt")].find((dt) => dt.textContent === label);
  const value = term?.nextElementSibling;
  return value instanceof HTMLElement ? value : null;
}

describe("HotelCardBody flags (spec line 307): each one changes what renders", () => {
  test("showConfirmation: the confirmation number renders only when the surface shows it", () => {
    premise("the fixture's confirmation number length", (HOTEL.confirmation_no ?? "").length, 0);
    const on = card({ showConfirmation: true });
    const value = stayValue(on, "Confirmation");
    // Exact text and visible: an emptied, suffixed or hidden value fails.
    expect(value?.textContent).toBe("HN-40812");
    expect(value).toBeVisible();
    cleanup();
    // The value is the reservation's, not a constant: a second code renders as itself.
    const other = card({ showConfirmation: true, hotel: { ...HOTEL, confirmation_no: "ZX-77" } });
    expect(stayValue(other, "Confirmation")?.textContent).toBe("ZX-77");
    cleanup();
    const off = card({ showConfirmation: false });
    expect(stayValue(off, "Confirmation")).toBeNull();
    expect(off).not.toHaveTextContent("HN-40812");
  });

  test("showNotes: the reservation's notes render only when the surface shows them", () => {
    premise("the fixture's notes length", (HOTEL.notes ?? "").length, 0);
    const on = card({ showNotes: true });
    const value = stayValue(on, "Notes");
    expect(value?.textContent).toBe("Late arrival guaranteed");
    expect(value).toBeVisible();
    cleanup();
    const other = card({ showNotes: true, hotel: { ...HOTEL, notes: "Pool closed" } });
    expect(stayValue(other, "Notes")?.textContent).toBe("Pool closed");
    cleanup();
    const off = card({ showNotes: false });
    expect(stayValue(off, "Notes")).toBeNull();
    expect(off).not.toHaveTextContent("Late arrival guaranteed");
  });

  test("showGuests: one chip per guest under a labelled list only when the surface shows them", () => {
    premise("the fixture's guest count", HOTEL.names.length, 0);
    const on = card({ showGuests: true });
    const chips = within(on).getAllByTestId("hotel-guest-chip");
    expect(chips.map((c) => within(c).getByTestId("hotel-guest-name").textContent)).toEqual(
      HOTEL.names,
    );
    const list = within(on).getByRole("list");
    expect(list).toHaveAttribute("aria-labelledby", BASE.guestsLabelId);
    expect(on.querySelector(`#${BASE.guestsLabelId}`)?.textContent).toBe("Guests");
    cleanup();
    const off = card({ showGuests: false });
    expect(within(off).queryAllByTestId("hotel-guest-chip")).toHaveLength(0);
    expect(off).not.toHaveTextContent("Guests");
    for (const name of HOTEL.names) expect(off).not.toHaveTextContent(name);
  });

  test("hideDates: no check-in, check-out, night count or date reaches the card", () => {
    premiseHolds("the fixture carries both stay dates", !!HOTEL.check_in && !!HOTEL.check_out);
    const shown = card({ hideDates: false });
    expect(within(shown).getByTestId("hotel-stay-check-in")).toBeInTheDocument();
    expect(within(shown).getByTestId("hotel-stay-check-out")).toBeInTheDocument();
    expect(within(shown).getByTestId("hotel-stay-nights").textContent).toBe("3 nights");
    expect(shown.querySelector('time[datetime="2026-04-10"]')).not.toBeNull();
    cleanup();
    const hidden = card({ hideDates: true });
    expect(within(hidden).queryByTestId("hotel-stay-check-in")).toBeNull();
    expect(within(hidden).queryByTestId("hotel-stay-check-out")).toBeNull();
    expect(within(hidden).queryByTestId("hotel-stay-nights")).toBeNull();
    expect(hidden.querySelector("time")).toBeNull();
    expect(hidden.outerHTML).not.toContain("2026-04-1");
    expect(hidden).not.toHaveTextContent(/check in|check out|night/i);
    // The rest of the card stays.
    expect(hidden).toHaveTextContent("Hotel Nikko");
    expect(hidden).toHaveTextContent("222 Mason St, San Francisco");
  });
});

describe("HotelCardBody sentinels (spec line 293)", () => {
  const SENTINEL: HotelReservationRow = {
    ...HOTEL,
    hotel_address: "N/A",
    confirmation_no: "TBD",
    notes: "TBA",
    names: ["TBD", "Ann Lee"],
  };
  const all = { showConfirmation: true, showNotes: true, showGuests: true } as const;

  test('"show" renders a sentinel as parsed, as the admin does today', () => {
    const root = card({ ...all, hotel: SENTINEL, sentinels: "show" });
    expect(root).toHaveTextContent("N/A");
    expect(stayValue(root, "Confirmation")?.textContent).toBe("TBD");
    expect(stayValue(root, "Notes")?.textContent).toBe("TBA");
    expect(within(root).getAllByTestId("hotel-guest-chip")).toHaveLength(2);
  });

  test('"hide" omits each sentinel line and keeps the real ones', () => {
    const root = card({ ...all, hotel: SENTINEL, sentinels: "hide" });
    expect(root).not.toHaveTextContent("N/A");
    expect(stayValue(root, "Confirmation")).toBeNull();
    expect(stayValue(root, "Notes")).toBeNull();
    const chips = within(root).getAllByTestId("hotel-guest-chip");
    expect(chips.map((c) => c.textContent)).toEqual([expect.stringContaining("Ann Lee")]);
    // Control: the real values under the same flag render.
    cleanup();
    const real = card({ ...all, sentinels: "hide" });
    expect(real).toHaveTextContent("222 Mason St, San Francisco");
    expect(stayValue(real, "Confirmation")?.textContent).toBe("HN-40812");
  });

  test("the hotel name is never sentinel-gated: neither surface gates it today", () => {
    // Admin: `h.hotel_name || "Hotel"` (step3ReviewSections.tsx:2990 at 7e927e927);
    // crew: `res.hotel_name ? res.hotel_name : null` (components/crew/sections/travelRows.ts).
    const root = card({ hotel: { ...HOTEL, hotel_name: "TBD" }, sentinels: "hide" });
    expect(root.querySelector(`#${BASE.nameId}`)?.textContent).toBe("TBD");
  });
});

describe("HotelCardBody structure", () => {
  test("the card is a group named by its hotel name; a nameless hotel is named 'Hotel'", () => {
    const root = card();
    expect(root).toHaveAttribute("role", "group");
    expect(root).toHaveAttribute("aria-labelledby", BASE.nameId);
    expect(root.querySelector(`#${BASE.nameId}`)?.textContent).toBe("Hotel Nikko");
    cleanup();
    const nameless = card({ hotel: { ...HOTEL, hotel_name: null } });
    expect(nameless.querySelector(`#${BASE.nameId}`)?.textContent).toBe("Hotel");
    expect(hotelCardLabel({ ...HOTEL, hotel_name: null })).toBe("Hotel");
    expect(hotelCardLabel(HOTEL)).toBe("Hotel Nikko");
  });

  test("the marker slot renders above the hotel name, and nothing renders without it", () => {
    const root = card({ marker: <p data-testid="probe-marker">probe marker</p> });
    const marker = within(root).getByTestId("probe-marker");
    const name = root.querySelector(`#${BASE.nameId}`) as HTMLElement;
    expect(marker.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();
    expect(within(card()).queryByTestId("probe-marker")).toBeNull();
  });

  test("the card test id comes only from testIdPrefix, and the jump index only from jumpIndex", () => {
    expect(card({ testIdPrefix: "wizard-step3" })).toHaveAttribute(
      "data-testid",
      "wizard-step3-hotel-card",
    );
    cleanup();
    expect(card({ testIdPrefix: "crew-panel" })).toHaveAttribute(
      "data-testid",
      "crew-panel-hotel-card",
    );
    cleanup();
    const bare = card();
    expect(bare).not.toHaveAttribute("data-testid");
    expect(bare).not.toHaveAttribute("data-hotel-index");
    cleanup();
    expect(card({ jumpIndex: 3 })).toHaveAttribute("data-hotel-index", "3");
  });

  test("flat drops the card's own border; the default keeps it", () => {
    expect(card().className).toContain("rounded-md border border-border p-4");
    cleanup();
    expect(card({ flat: true }).className).not.toMatch(/\bborder\b/);
  });

  test("search markers: the body emits none (the admin passes none; the crew's land in Task 9)", () => {
    const root = card({ showConfirmation: true, showNotes: true, showGuests: true });
    expect(
      root.querySelector("[data-search-target], [data-search-skip], [data-search-group]"),
    ).toBe(null);
  });
});

describe("the admin renders hotel cards through the shared body (spec line 289)", () => {
  const SECOND: HotelReservationRow = { ...HOTEL, ordinal: 2, hotel_name: "Hyatt Regency" };

  test("HotelsBreakdown calls HotelCardBody once per card with today's admin props and HotelCard's two useId values", () => {
    const spy = vi
      .spyOn(hotelCardBodyModule, "HotelCardBody")
      .mockImplementation((p) => <div data-testid="probe-hotel-card">{p.hotel.hotel_name}</div>);
    render(<HotelsBreakdown dfid="drive-1" hotels={[HOTEL, SECOND]} />);
    expect(screen.getAllByTestId("probe-hotel-card").map((n) => n.textContent)).toEqual([
      "Hotel Nikko",
      "Hyatt Regency",
    ]);
    premise("the body's call count", spy.mock.calls.length, 1);
    const calls = spy.mock.calls.map(([p]) => p);
    calls.forEach((p, i) => {
      // What HotelCard renders at 7e927e927 (step3ReviewSections.tsx:2971-3102): no
      // confirmation, no notes, the guest chips, both stay dates, sentinels as parsed.
      expect(p).toMatchObject({
        showConfirmation: false,
        showNotes: false,
        showGuests: true,
        hideDates: false,
        sentinels: "show",
        testIdPrefix: "wizard-step3",
        jumpIndex: i,
        flat: false,
        marker: null,
      });
      expect(p.nameId).toMatch(/\S/);
      expect(p.guestsLabelId).toMatch(/\S/);
      expect(p.nameId).not.toBe(p.guestsLabelId);
    });
    // Each card's ids are its own: two cards never share one.
    expect(new Set(calls.flatMap((p) => [p.nameId, p.guestsLabelId])).size).toBe(4);
  });

  test("HotelsBreakdown still caps at HOTELS_CAP: the body is called for the shown cards only", () => {
    const many = Array.from({ length: HOTELS_CAP + 2 }, (_, i) => ({
      ...HOTEL,
      ordinal: i + 1,
      hotel_name: `Hotel ${i + 1}`,
    }));
    const spy = vi
      .spyOn(hotelCardBodyModule, "HotelCardBody")
      .mockImplementation(() => <div data-testid="probe-hotel-card" />);
    render(<HotelsBreakdown dfid="drive-1" hotels={many} />);
    expect(spy).toHaveBeenCalledTimes(HOTELS_CAP);
    expect(screen.getByText("…and 2 more hotels")).toBeInTheDocument();
  });
});
