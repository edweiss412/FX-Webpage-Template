// @vitest-environment jsdom
/**
 * components/crew/sections/EventSection.tsx (crew page redesign PR C Task 5; spec
 * §6.2 `event` row, line 302; line 316, the Dress code card; AC-13).
 *
 * The Event details section is the crew panel card titled with the registry label
 * "Event details", card id `gear-tech-specs`, around the shared Event details body
 * (components/show-panels/EventDetailsBody.tsx) with the crew props: the crew keys
 * (`CREW_EVENT_KEYS`), sentinels hidden, rows in place of chips, `h4` titles, the
 * crew's title map, a field card for the keynote, the reel and the dress code, and
 * the proxied player in the reel's slot. Its own wrapper is `crew:event:details`
 * (plan decision 5).
 *
 * The Tech specs, keynote and reel cases moved here from Gear's suites
 * (gearTechSpecs.test.tsx, GearSection.test.tsx) and the Dress code cases from the
 * home's (HomeSection.test.tsx), each with the defect it catches. The reel's full
 * URL-strip matrix stays in tests/components/tiles/OpeningReelTile.test.tsx,
 * retargeted here. Expected values are read back from the fixture.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { EventSection } from "@/components/crew/sections/EventSection";
import * as eventDetailsBodyModule from "@/components/show-panels/EventDetailsBody";
import { EVENT_DETAILS_LABELS } from "@/lib/crew/eventDetailsSpecs";
import { createTileRenderLedger, type TileRenderLedger } from "@/lib/crew/tileRenderLedger";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { buildSheetDeepLink, CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";
import { showSection } from "@/lib/showSections/registry";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { ledgerProp } from "./_ledgerProp";

const SHOW_ID = "show-event";
const TODAY = new Date("2026-05-14T15:00:00Z");
const CREW: Viewer = { kind: "crew", crewMemberId: "c1" };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderEvent(
  data: ShowForViewer,
  viewer: Viewer = CREW,
  ledger?: TileRenderLedger,
): HTMLElement {
  const { container } = render(
    <EventSection
      {...(ledger === undefined ? ledgerProp() : { ledger })}
      data={data}
      viewer={viewer}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  return container;
}

function withDetails(
  eventDetails: Record<string, unknown>,
  over: Partial<Parameters<typeof makeShowForViewer>[0]> = {},
): ShowForViewer {
  return makeShowForViewer({
    show: { event_details: eventDetails as ShowForViewer["show"]["event_details"] },
    ...over,
  });
}

/** The card with this id, or null. */
function card(root: HTMLElement, id: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-card-id="${id}"]`);
}

/** The action slots whose nearest card is `el`, so a nested field card's slot never counts. */
function ownActionSlots(el: HTMLElement): Element[] {
  return [...el.querySelectorAll('[data-slot="section-card-action"]')].filter(
    (slot) => slot.closest("[data-card-id]") === el,
  );
}

describe("event details: the section", () => {
  test("event details: the panel carries the registry label and glyph, card id gear-tech-specs and its own actions", () => {
    const root = renderEvent(withDetails({ stage_size: "8' x 24'" }));
    const section = root.querySelector<HTMLElement>('[data-testid="section-event"]');
    expect(section).not.toBeNull();
    const panel = card(section!, "gear-tech-specs");
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute("data-testid", "crew-panel-card");
    expect(
      within(panel!).getByRole("heading", { level: 3, name: showSection("event").label }),
    ).toBeInTheDocument();
    expect(panel!.querySelector('[data-slot="panel-card-chip"] svg')).not.toBeNull();
    expect(ownActionSlots(panel!)).toHaveLength(1);
  });

  test("event details: real specs render, sentinels hide, Wi-Fi and power stay in Venue, a non-string value coerces", () => {
    const data = withDetails({
      stage_size: "8' x 24' x 2'",
      podium_type: "(2) Acrylic",
      polling: "YES",
      record: "N/A", // a sentinel: its row is omitted
      internet: "SSID: Hall", // Venue's
      power: "100-amp 3 phase", // Venue's
      test_pattern: 169, // a bad non-string JSONB value
    });
    const root = renderEvent(data);
    const panel = within(card(root, "gear-tech-specs")!);
    // Real specs: label and value.
    expect(panel.getByText(EVENT_DETAILS_LABELS.stage_size)).toBeInTheDocument();
    expect(panel.getByText("8' x 24' x 2'")).toBeInTheDocument();
    expect(panel.getByText(EVENT_DETAILS_LABELS.podium_type)).toBeInTheDocument();
    expect(panel.getByText(EVENT_DETAILS_LABELS.polling)).toBeInTheDocument();
    // A sentinel.
    expect(panel.queryByText(EVENT_DETAILS_LABELS.record)).toBeNull();
    // Venue's two fields, with the value as well as the label: spec line 302.
    expect(panel.queryByText(EVENT_DETAILS_LABELS.power)).toBeNull();
    expect(panel.queryByText(EVENT_DETAILS_LABELS.internet)).toBeNull();
    expect(root).not.toHaveTextContent("100-amp 3 phase");
    expect(root).not.toHaveTextContent("SSID: Hall");
    // A non-string value renders, and nothing threw.
    expect(panel.getByText("169")).toBeInTheDocument();
  });

  test("event details: a Yes field reads as a row, never the admin's chip", () => {
    const root = renderEvent(withDetails({ polling: "YES" }));
    // The value as parsed, not the chip's own "Yes".
    expect(within(root).getByText("YES")).toBeInTheDocument();
    expect(within(root).queryByText("Yes")).toBeNull();
  });

  test("event details: the group title reads Dress code & key moments and Wardrobe appears nowhere", () => {
    const root = renderEvent(
      withDetails({
        dress_code: "Show blacks",
        notes: "Bring a jacket",
        keynote_requirements: "x",
      }),
    );
    expect(
      within(root).getByRole("heading", { level: 4, name: "Dress code & key moments" }),
    ).toBeInTheDocument();
    expect(root.textContent ?? "").not.toMatch(/wardrobe/i);
  });

  test("event details: each group title is an h4 under the panel's h3", () => {
    const root = renderEvent(withDetails({ stage_size: "8'", polling: "YES" }));
    const titles = within(root)
      .getAllByRole("heading", { level: 4 })
      .map((h) => h.textContent);
    expect(titles).toEqual(["Stage & scenic", "Production"]);
  });

  test("event details: with nothing to show the section shows its empty state and no panel", () => {
    for (const [name, data] of [
      ["no fields", withDetails({})],
      ["every field a sentinel", withDetails({ stage_size: "N/A", podium_type: "TBD", notes: "" })],
      ["only Venue's fields", withDetails({ internet: "SSID: Hall", power: "100-amp" })],
      ["a null event_details", withDetails(null as unknown as Record<string, unknown>)],
    ] as const) {
      const root = renderEvent(data);
      const empty = root.querySelector('[data-testid="section-empty"]');
      expect(empty, name).not.toBeNull();
      expect(empty?.textContent, name).toBe("No event details on file yet.");
      expect(card(root, "gear-tech-specs"), name).toBeNull();
      cleanup();
    }
  });

  test("event details: a throw from the body is contained and recorded under crew:event:details", () => {
    const ledger = createTileRenderLedger();
    const spy = vi.spyOn(eventDetailsBodyModule, "EventDetailsBody").mockImplementation(() => {
      throw new Error("planted event body fault");
    });
    const root = renderEvent(withDetails({ stage_size: "8' x 24'" }), CREW, ledger);
    premise("the section called the body", spy.mock.calls.length, 0);
    expect(within(root).getByTestId("tile-error-fallback")).toBeInTheDocument();
    expect(ledger.failed.get("crew:event:details")?.message).toBe("planted event body fault");
    expect(root).not.toHaveTextContent("8' x 24'");
  });

  test("event details: a healthy render attempts crew:event:details and records no failure", () => {
    const ledger = createTileRenderLedger();
    renderEvent(withDetails({ stage_size: "8' x 24'" }), CREW, ledger);
    expect(ledger.attempted.has("crew:event:details")).toBe(true);
    expect(ledger.failed.has("crew:event:details")).toBe(false);
  });
});

describe("event details: the keynote card", () => {
  test("event details: the keynote is a field card with its own id and actions, inside the panel", () => {
    const root = renderEvent(withDetails({ keynote_requirements: "Confidence monitor + clicker" }));
    const keynote = card(root, "gear-keynote");
    expect(keynote).not.toBeNull();
    expect(within(keynote!).getByText("Confidence monitor + clicker")).toBeInTheDocument();
    expect(ownActionSlots(keynote!)).toHaveLength(1);
    expect(card(root, "gear-tech-specs")!.contains(keynote)).toBe(true);
  });

  test("event details: a sentinel keynote renders no card", () => {
    const root = renderEvent(withDetails({ keynote_requirements: "TBD", stage_size: "8'" }));
    premiseHolds("the panel rendered", card(root, "gear-tech-specs") !== null);
    expect(card(root, "gear-keynote")).toBeNull();
  });
});

describe("event details: the opening reel card", () => {
  test("event details: the reel is text only (no Drive URL) and the player reads the showId prop", () => {
    const cell = "YES - https://drive.google.com/file/d/abc/view";
    premiseHolds("the seeded cell carries a URL", cell.includes("https://"));
    const root = renderEvent(withDetails({ opening_reel: cell }, { openingReelHasVideo: true }));
    for (const leak of ["https://", "drive.google.com", "docs.google.com"]) {
      expect(root.innerHTML).not.toContain(leak);
    }
    const reel = card(root, "gear-opening-reel");
    expect(reel).not.toBeNull();
    expect(reel!.querySelector(`video[src="/api/asset/reel/${SHOW_ID}"]`)).not.toBeNull();
    expect(within(reel!).getByText("YES")).toBeInTheDocument();
    expect(ownActionSlots(reel!)).toHaveLength(1);
  });

  test("event details: a pure-URL reel with no video renders no card, and the empty state shows", () => {
    const root = renderEvent(
      withDetails(
        { opening_reel: "https://drive.google.com/file/d/abc/view" },
        { openingReelHasVideo: false },
      ),
    );
    expect(card(root, "gear-opening-reel")).toBeNull();
    expect(root.querySelector('[data-testid="section-empty"]')).not.toBeNull();
  });

  test("event details: the reel's tap overlays grow down, clear of the player, and the other cards' up", () => {
    const root = renderEvent(
      withDetails(
        { opening_reel: "YES", keynote_requirements: "Clicker", dress_code: "Show blacks" },
        { openingReelHasVideo: true },
      ),
    );
    const direction = (id: string) =>
      ownActionSlots(card(root, id)!)[0]!
        .querySelector('[data-slot="card-header-actions"]')!
        .getAttribute("data-hit-direction");
    expect(direction("gear-opening-reel")).toBe("down");
    for (const id of ["gear-tech-specs", "gear-keynote", "today-dress"]) {
      expect(direction(id), id).toBe("up");
    }
  });

  test('event details: a reel of "N/A" still renders, on the reel\'s own hide rule', () => {
    const root = renderEvent(withDetails({ opening_reel: "N/A" }));
    const reel = card(root, "gear-opening-reel");
    expect(reel).not.toBeNull();
    expect(within(reel!).getByText("N/A")).toBeInTheDocument();
    // Plain text under "hide": the admin's sentinel mute is the "show" treatment.
    expect(within(reel!).getByText("N/A")).toHaveClass("text-text");
  });

  test("event details: a playable video with a hidden cell shows the label over the player, in Display & content", () => {
    const root = renderEvent(withDetails({}, { openingReelHasVideo: true }));
    const reel = card(root, "gear-opening-reel");
    expect(reel).not.toBeNull();
    expect(within(reel!).getByText(EVENT_DETAILS_LABELS.opening_reel)).toBeInTheDocument();
    expect(reel!.querySelector("video")).not.toBeNull();
    expect(
      within(root).getByRole("heading", { level: 4, name: "Display & content" }),
    ).toBeInTheDocument();
    expect(root.querySelector('[data-testid="section-empty"]')).toBeNull();
  });
});

describe("event details: the dress code card", () => {
  const PHASED =
    "Set/Strike: Black Pants, Black Polo Shirt, Black Footwear\n" +
    "Show: Black Pants, Black Long Sleeve Button Down Shirt, Black Footwear";

  test("event details: the dress code card keeps today-dress and its actions, inside the panel", () => {
    const root = renderEvent(withDetails({ dress_code: "Business casual" }));
    const dress = card(root, "today-dress");
    expect(dress).not.toBeNull();
    expect(within(dress!).getByText("Business casual")).toBeInTheDocument();
    expect(within(dress!).getByText(EVENT_DETAILS_LABELS.dress_code)).toBeInTheDocument();
    expect(ownActionSlots(dress!)).toHaveLength(1);
    expect(card(root, "gear-tech-specs")!.contains(dress)).toBe(true);
  });

  test("event details: the dress code card renders each phase as a term over its attire", () => {
    const root = renderEvent(withDetails({ dress_code: PHASED }));
    const dress = within(card(root, "today-dress")!);
    expect(dress.getAllByRole("term").map((el) => el.textContent)).toEqual(["Set/Strike", "Show"]);
    expect(dress.getAllByRole("definition")[1]?.textContent).toBe(
      "Black Pants, Black Long Sleeve Button Down Shirt, Black Footwear",
    );
  });

  test("event details: a card's source link goes to its own region, and the dress code's to dress", () => {
    const data = withDetails(
      { dress_code: "Business casual", stage_size: "8'" },
      {
        driveFileId: "DRIVE123",
        sourceAnchors: {
          details: { title: "INFO", gid: 5 },
          dress: { title: "INFO", gid: 6 },
        },
      },
    );
    const root = renderEvent(data);
    for (const id of ["gear-tech-specs", "today-dress"] as const) {
      const el = card(root, id)!;
      const slot = ownActionSlots(el)[0]!;
      expect(slot.querySelector('a[data-slot="source-link"]')?.getAttribute("href"), id).toBe(
        buildSheetDeepLink(data.driveFileId, data.sourceAnchors[CARD_REGION_MAP[id]]),
      );
    }
  });
});
