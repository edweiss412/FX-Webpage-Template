// @vitest-environment jsdom
/**
 * tests/components/show-panels/venueBody.test.tsx
 * (crew page redesign PR B plan, Task 5; spec
 * docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md §6.1, §6.2
 * `venue` row, line 301)
 *
 * The Venue body is the Where core of the admin's `VenueBreakdown`, shared: the
 * venue name, the address and the city lines, a map slot, and the loading-dock
 * band. The admin rendering is pinned byte for byte by the Task 1 golden
 * (tests/components/admin/wizard/adminSectionDom.test.tsx) and asserted nowhere
 * else: every case here is about the body itself or the crew page around it.
 *
 * Crew: the body sits in the crew panel card titled "Venue" (spec line 402) with
 * the `venue-where` card's actions, sentinels hidden, a search target per line,
 * and the "Open in Maps" link in the map slot only when the URL parses
 * (`isParseableUrl`). Facilities and Status stay the crew's own cards below it.
 * Also here: the body called inside its own `WrappedSection` (spec line 291),
 * the serialized props a viewer the transport gate excludes receives (AC-6), and
 * COI reaching a non-lead (spec §6.2 `venue` row, "Crew keeps").
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { VenueSection } from "@/components/crew/sections/VenueSection";
import {
  WHERE_CARD_ID,
  venueFactRows,
  venueTransportVisible,
  venueWhereProps,
} from "@/components/crew/sections/venueRows";
import { SECTION_ICON } from "@/components/crew/sectionIcon";
import { VenueBody } from "@/components/show-panels/VenueBody";
import * as venueBodyModule from "@/components/show-panels/VenueBody";
import { CREW_MOVED_IDS } from "@/lib/crew/crewSections";
import { createTileRenderLedger } from "@/lib/crew/tileRenderLedger";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import { showSection } from "@/lib/showSections/registry";
import { financialsVisible } from "@/lib/visibility/scopeTiles";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-venue";

/** The default fixture roster's one member: no flags, so not a lead. */
const CREW: Viewer = { kind: "crew", crewMemberId: "c1" };
const ADMIN: Viewer = { kind: "admin" };

const PARKING = "Lot B, permit 4471";

/** A transport row whose driver is nobody on the roster: the gate admits only an admin. */
const TRANSPORT: ShowForViewer["transportation"] = {
  driver_name: null,
  driver_phone: null,
  driver_email: null,
  vehicle: null,
  license_plate: null,
  color: null,
  loadout_name: null,
  loadout_phone: null,
  loadout_email: null,
  parking: PARKING,
  schedule: [],
  notes: null,
};

function show(venue: NonNullable<ShowForViewer["show"]["venue"]>, extra: object = {}) {
  return makeShowForViewer({ show: { venue, ...extra }, transportation: TRANSPORT });
}

function renderVenue(
  data: ShowForViewer,
  viewer: Viewer = CREW,
  ledger = createTileRenderLedger(),
) {
  return render(
    <VenueSection ledger={ledger} data={data} viewer={viewer} today={TODAY} showId={SHOW_ID} />,
  );
}

const where = () => screen.getByTestId("venue-where");

describe("VenueBody", () => {
  const LINES = { name: "Grand Hall", address: "350 Fifth Ave", city: "New York" };

  test("under sentinels: hide a sentinel line is not rendered; its neighbours are", () => {
    const { container } = render(
      VenueBody({ ...LINES, name: "TBD", dock: null, map: null, sentinels: "hide", bleed: false }),
    );
    expect(container).not.toHaveTextContent("TBD");
    expect(container).toHaveTextContent("350 Fifth Ave");
    expect(container).toHaveTextContent("New York");
    // Control: the same line with a real value renders, so the omission is the
    // sentinel's, not the line's.
    cleanup();
    const real = render(
      VenueBody({ ...LINES, dock: null, map: null, sentinels: "hide", bleed: false }),
    ).container;
    expect(real).toHaveTextContent("Grand Hall");
  });

  test("search markers come only from the target map", () => {
    const targets = { name: "t-name", address: "t-address", city: "t-city" };
    const { container } = render(
      VenueBody({ ...LINES, dock: null, map: null, sentinels: "hide", bleed: false, targets }),
    );
    const found = [...container.querySelectorAll("[data-search-target]")].map((el) => [
      el.getAttribute("data-search-target"),
      el.textContent,
    ]);
    expect(found).toEqual([
      ["t-name", "Grand Hall"],
      ["t-address", "350 Fifth Ave"],
      ["t-city", "New York"],
    ]);
    // The eyebrow repeats the card's title, so it is not a line of its own.
    const skipped = [...container.querySelectorAll("[data-search-skip]")].map(
      (el) => el.textContent,
    );
    expect(skipped).toEqual(["Venue"]);

    cleanup();
    const bare = render(
      VenueBody({ ...LINES, dock: null, map: null, sentinels: "hide", bleed: false }),
    ).container;
    expect(
      bare.querySelector("[data-search-target],[data-search-skip],[data-search-group]"),
    ).toBeNull();
  });
});

describe("crew Venue props", () => {
  test("each shown line carries a venue search target on the venue-where card; a sentinel line none", () => {
    const props = venueWhereProps({
      name: "TBD",
      address: "350 Fifth Ave, New York, NY 10118",
    });
    expect(props.name).toBe("TBD");
    expect(props.targets.name).toBeUndefined();
    premiseHolds("the fixture yields a street and a city", !!props.address && !!props.city);
    for (const key of ["address", "city"] as const) {
      expect(props.targets[key], key).toMatch(new RegExp(`^venue:${WHERE_CARD_ID}:`));
    }
  });

  test("AC-6: parking is absent from the props a viewer the transport gate excludes receives; an admin's hold it", () => {
    const data = show({ name: "Grand Hall", address: "350 Fifth Ave", loadingDock: "Dock 3" });
    const crewCtx = resolveViewerContext(CREW, data);
    const adminCtx = resolveViewerContext(ADMIN, data);
    premiseHolds(
      "the gate excludes the crew member and admits the admin",
      !venueTransportVisible(data, crewCtx.isAdmin) &&
        venueTransportVisible(data, adminCtx.isAdmin),
    );
    // Every input the Venue section's crew blocks receive: the body's lines and
    // the Facilities rows. Icons are elements; their plain fields are the data.
    const serialized = (isAdmin: boolean) =>
      JSON.stringify({
        where: venueWhereProps(data.show.venue),
        facilities: venueFactRows(data, {
          transportVisible: venueTransportVisible(data, isAdmin),
        }).map(({ k, v }) => ({ k, v })),
      });
    expect(serialized(crewCtx.isAdmin)).not.toContain(PARKING);
    expect(serialized(adminCtx.isAdmin)).toContain(PARKING);

    // And the rendered section, the same two viewers.
    expect(renderVenue(data, CREW).container).not.toHaveTextContent(PARKING);
    cleanup();
    expect(renderVenue(data, ADMIN).container).toHaveTextContent(PARKING);
  });
});

describe("VenueSection (crew)", () => {
  test('the Where card is the crew panel card titled with the registry label, "Venue" (spec line 402), with card id venue-where and its actions', () => {
    renderVenue(show({ name: "Grand Hall", address: "350 Fifth Ave" }));
    const card = where().querySelector('[data-testid="crew-panel-card"]');
    premiseHolds("the Where card renders the panel card", card !== null);
    expect(card).toHaveAttribute("data-card-id", WHERE_CARD_ID);
    // Exact text, and visible: a suffixed or hidden title fails, not only a missing one.
    const title = within(card as HTMLElement).getByRole("heading", { level: 3 });
    expect(title.textContent).toBe(showSection("venue").label);
    expect(title).toBeVisible();
    expect(showSection("venue").label).toBe("Venue");
    expect(card!.querySelector('[data-slot="section-card-action"]')).not.toBeNull();
    expect(card).toHaveTextContent("Grand Hall");
  });

  test("a sentinel venue name is hidden on the crew side", () => {
    renderVenue(show({ name: "TBD", address: "350 Fifth Ave" }));
    expect(where()).toHaveTextContent("350 Fifth Ave");
    expect(where()).not.toHaveTextContent("TBD");
  });

  test("an unparseable map URL renders no crew link; a parseable one renders it", () => {
    const UNPARSEABLE = "maps.google.com/?q=grand-hall";
    renderVenue(show({ name: "Grand Hall", address: "350 Fifth Ave", googleLink: UNPARSEABLE }));
    expect(within(where()).queryByText("Open in Maps")).toBeNull();
    expect(where().querySelector(`a[href="${UNPARSEABLE}"]`)).toBeNull();

    cleanup();
    const PARSEABLE = "https://maps.google.com/?q=grand-hall";
    renderVenue(show({ name: "Grand Hall", address: "350 Fifth Ave", googleLink: PARSEABLE }));
    const link = where().querySelector(`a[href="${PARSEABLE}"]`);
    expect(link).not.toBeNull();
    expect(link).toHaveTextContent("Open in Maps");
  });

  test("COI is rendered for a non-lead (a presence claim: who receives it)", () => {
    const data = show({ name: "Grand Hall", address: "350 Fifth Ave" }, { coi_status: "Received" });
    const ctx = resolveViewerContext(CREW, data);
    premiseHolds("the viewer is not a lead", !financialsVisible(ctx.viewerFlags, ctx.isAdmin));
    renderVenue(data, CREW);
    expect(screen.getByTestId("coi-status")).toHaveTextContent("Received");
  });

  test("venue is a moved section: its glyph is the registry's (decision 3)", () => {
    expect(CREW_MOVED_IDS).toContain("venue");
    expect(SECTION_ICON.venue).toBe(showSection("venue").icon);
  });
});

describe("error containment (spec line 291, line 507)", () => {
  test("a throw from VenueBody inside the crew WrappedSection renders the fallback, records crew:venue:where, and the other cards render", () => {
    const ledger = createTileRenderLedger();
    const spy = vi.spyOn(venueBodyModule, "VenueBody").mockImplementation(() => {
      throw new Error("planted venue body fault");
    });
    renderVenue(
      show({ name: "Grand Hall", address: "350 Fifth Ave", loadingDock: "Dock 3" }),
      CREW,
      ledger,
    );
    premiseHolds("the section called the body", spy.mock.calls.length > 0);
    expect(within(where()).getByTestId("tile-error-fallback")).toBeInTheDocument();
    expect(ledger.failed.get("crew:venue:where")?.message).toBe("planted venue body fault");
    expect(where()).not.toHaveTextContent("Grand Hall");
    premise(
      "the Facilities card still rendered",
      screen.getAllByTestId("venue-facilities").length,
      0,
    );
  });
});

/**
 * PR B invariant-8 UI gate rows 3, 7, 12 and 18: the crew's Venue presentation.
 * The body's props default to the admin's markup (pinned by the golden); each
 * case shows the crew prop changes the output.
 */
describe("Venue crew presentation (gate rows 3, 7, 12, 18)", () => {
  const LINES = { name: "Grand Hall", address: "350 Fifth Ave", city: "New York" };
  const classTokens = (root: Element) =>
    [root, ...root.querySelectorAll("*")].flatMap((el) =>
      (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean),
    );
  const VIEWPORT_VARIANT = /^(?:sm|md|lg|xl|2xl|min-\[[^\]]+\]|max-\[[^\]]+\]):/;

  test('layout "container": the text and map regions go side by side at @min-crew-split, never at a viewport width', () => {
    const viewport = render(
      VenueBody({ ...LINES, dock: null, map: null, sentinels: "hide", bleed: false }),
    ).container;
    // POSITIVE CONTROL: the admin's default switches on the viewport.
    expect(classTokens(viewport)).toContain("sm:flex-row");
    cleanup();
    const root = render(
      VenueBody({
        ...LINES,
        dock: null,
        map: null,
        sentinels: "hide",
        bleed: false,
        layout: "container",
      }),
    ).container;
    const classes = classTokens(root);
    expect(classes.filter((c) => VIEWPORT_VARIANT.test(c))).toEqual([]);
    expect(classes).toContain("@min-crew-split:flex-row");
  });

  test('addressTone "text": the address and city lines are body text, not subtle; the default stays subtle', () => {
    const block = (tone?: "subtle" | "text") => {
      const { container } = render(
        VenueBody({
          ...LINES,
          dock: null,
          map: null,
          sentinels: "hide",
          bleed: false,
          ...(tone === undefined ? {} : { addressTone: tone }),
        }),
      );
      const address = within(container).getByText(LINES.address);
      return address.parentElement!.className.split(/\s+/);
    };
    expect(block()).toContain("text-text-subtle");
    cleanup();
    const text = block("text");
    expect(text).toContain("text-text");
    expect(text).not.toContain("text-text-subtle");
  });

  test("the crew city line is dropped when the address already holds the city as a word, and kept when it does not", () => {
    // The corpus shape (9 of 10 shows): the city sits inside the address without its
    // own comma segment, so streetFromAddress cannot strip it.
    const inline = venueWhereProps({
      name: "Four Seasons Hotel",
      address: "120 E Delaware Pl Chicago, IL 60611",
      city: "Chicago",
    });
    expect(inline.address).toBe("120 E Delaware Pl Chicago, IL 60611");
    expect(inline.city).toBeNull();
    expect(inline.targets.city).toBeUndefined();
    // A comma segment is stripped from the street, so the city line stays.
    const segment = venueWhereProps({
      name: "Four Seasons Hotel",
      address: "120 E Delaware Pl, Chicago, IL 60611",
      city: "Chicago",
    });
    expect(segment.address).toBe("120 E Delaware Pl");
    expect(segment.city).toBe("Chicago");
    // A word that only contains the city is not the city: "Chicagoland" keeps it.
    const partial = venueWhereProps({
      name: "Expo Hall",
      address: "5555 N River Rd Chicagoland Plaza",
      city: "Chicago",
    });
    expect(partial.city).toBe("Chicago");
    // Case does not matter, and a two-word city matches as a phrase.
    expect(
      venueWhereProps({ name: "Hall", address: "4 Pier Rd new york NY", city: "New York" }).city,
    ).toBeNull();
  });

  test("the crew Where card renders its address as body text, reads its container, and underlines Open in Maps at rest", () => {
    const LINK = "https://maps.google.com/?q=grand-hall";
    renderVenue(show({ name: "Grand Hall", address: "350 Fifth Ave", googleLink: LINK }));
    const card = where();
    const classes = classTokens(card);
    expect(classes.filter((c) => VIEWPORT_VARIANT.test(c))).toEqual([]);
    expect(classes).toContain("@min-crew-split:flex-row");
    const address = within(card).getByText("350 Fifth Ave");
    expect(address.parentElement!.className.split(/\s+/)).toContain("text-text");
    const link = card.querySelector(`a[href="${LINK}"]`)!;
    premiseHolds("the Maps link rendered", link !== null);
    const linkClasses = link.className.split(/\s+/);
    expect(linkClasses).toContain("underline");
  });
});
