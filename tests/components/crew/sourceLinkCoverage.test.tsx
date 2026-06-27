// @vitest-environment jsdom
/**
 * tests/components/crew/sourceLinkCoverage.test.tsx (tile-source-deeplinks Task 9)
 *
 * The FIELD-AWARE COVERAGE WALKER (design spec §8 / §12). It renders all seven
 * crew §9 sections with a FULLY-POPULATED `makeShowForViewer` fixture (every
 * region carries a non-empty `{title:"INFO", gid, a1}` anchor in
 * `data.sourceAnchors`), discovers every element tagged `data-card-id`, and
 * asserts the source-link coverage contract WITHOUT a hardcoded card list:
 *
 *   (a) Every rendered card whose id is a key of `CARD_REGION_MAP` carries an
 *       `<a>` source link IN ITS HEADER whose `href` EQUALS
 *       `buildSheetDeepLink(driveFileId, sourceAnchors[CARD_REGION_MAP[id]])`.
 *       Anti-tautology: the expected href is computed from the SAME helper the
 *       component uses (never a string literal), and is scoped to the card's
 *       header `[data-slot="section-card-action"]` / the card subtree — never the
 *       whole document (so a sibling card's link can't satisfy a different card).
 *
 *   (b) Every rendered card whose id is in `OUT_OF_SCOPE_CARDS` carries NO `<a>`
 *       source link (`[data-slot="source-link"]`) — §8.3 "nothing visible is
 *       silently link-less, and the deliberately-link-less are documented".
 *
 *   (c) Every `REGION_ID` is referenced by ≥1 entry in `CARD_REGION_MAP` (the
 *       §8.1 ↔ §8.2 no-zombie-region parity — a static map check).
 *
 * Because it WALKS discovered `data-card-id` cards (not a fixed list), a new
 * SectionCard fails this test until it is classified — given a `data-card-id`
 * that is either a CARD_REGION_MAP key (→ must carry the helper-derived link) or
 * an OUT_OF_SCOPE_CARDS id (→ must carry no link).
 *
 * The seven sections are rendered REAL (synchronous Server Components resolved by
 * a synchronous render — WrappedSection invokes its `render()` inline). Only the
 * RightNowHero client island needs matchMedia, which jsdom lacks — stub it
 * (mirrors crewShellSections.test.tsx).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { CrewSection } from "@/components/crew/sections/CrewSection";
import { TravelSection } from "@/components/crew/sections/TravelSection";
import { VenueSection } from "@/components/crew/sections/VenueSection";
import { GearSection } from "@/components/crew/sections/GearSection";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { BudgetSection } from "@/components/crew/sections/BudgetSection";
import { TodaySection } from "@/components/crew/sections/TodaySection";
import {
  buildSheetDeepLink,
  CARD_REGION_MAP,
  type CardId,
  OUT_OF_SCOPE_CARDS,
  REGION_ANCHOR_SPEC,
  REGION_IDS,
  type RegionId,
  type SourceAnchor,
} from "@/lib/sheet-links/buildSheetDeepLink";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

// `getShowForViewer`/`getShowForViewer`-adjacent `upsertAdminAlert` (via
// WrappedSection's throw arm) must be a no-op even though no section throws on
// the populated fixture.
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({ upsertAdminAlert: vi.fn() }));

const DRIVE_FILE_ID = "drive-file-walker-1";

// A populated fixture that makes EVERY source-backed card render. Today renders
// Mode A (run-of-show present) so the `today-run-of-show` card mounts: the show
// day equals the frozen `today` ISO and runOfShow[todayIso] has a displayable
// entry. Every region id gets a distinct, non-empty INFO anchor so a wrong
// region lookup would yield a different (failing) href.
const TODAY_ISO = "2026-05-14";
const FROZEN_TODAY = new Date("2026-05-14T15:00:00Z");

function fullSourceAnchors(): Record<string, SourceAnchor> {
  const anchors: Record<string, SourceAnchor> = {};
  REGION_IDS.forEach((region, idx) => {
    // Distinct a1 per region so two regions never collide on the same href —
    // that keeps assertion (a) able to detect a wrong-region link.
    anchors[region] = { title: "INFO", gid: 0, a1: `A${idx + 1}:B${idx + 2}` };
  });
  return anchors;
}

function fullFixture(): ShowForViewer {
  return makeShowForViewer({
    driveFileId: DRIVE_FILE_ID,
    sourceAnchors: fullSourceAnchors(),
    show: {
      dates: {
        travelIn: "2026-05-12",
        set: "2026-05-13",
        showDays: [TODAY_ISO, "2026-05-15"],
        travelOut: "2026-05-16",
      },
      venue: {
        name: "Center Arena",
        address: "5 Avenue, Springfield",
        notes: "Use the north dock.",
        loadingDock: "North dock",
        googleLink: "https://maps.example/venue",
      },
      coi_status: "Approved",
      event_details: {
        internet: "SSID crew / pw 1234",
        power: "200A 3-phase",
        keynote_requirements: "Clicker + confidence monitor",
        opening_reel: "Plays from house",
        dress_code: "Black tie",
      },
      // A fileId-bearing agenda link satisfies VenueSection's `hasDiagrams`
      // predicate so the out-of-scope `venue-diagrams` block renders, without
      // hand-constructing a full PersistedDiagrams snapshot.
      agenda_links: [{ label: "Floor plan", fileId: "drive-pdf-1" }],
    },
    rooms: [
      {
        id: "r1",
        kind: "gs",
        name: "Main",
        audio: "2x SM58",
        video: "1x PTZ",
        lighting: "8x par",
        set_time: "08:00",
        show_time: "10:00",
        strike_time: "18:00",
      },
    ],
    hotelReservations: [
      {
        ordinal: 0,
        hotel_name: "Grand Hyatt",
        hotel_address: "1 Hotel Rd",
        check_in: "2026-05-13",
        check_out: "2026-05-16",
        names: [],
        confirmation_no: "CONF-9",
        notes: "Late checkout approved.",
      },
    ],
    transportation: {
      driver_name: "Pat Driver",
      driver_phone: "555-222-3333",
      driver_email: null,
      vehicle: "Sprinter van",
      license_plate: "ABC-123",
      color: "Black",
      parking: "Lot C",
      schedule: [],
      notes: "Curbside at door 4.",
    },
    contacts: [
      {
        kind: "venue",
        name: "Sam Venue",
        phone: "555-111-2222",
        email: null,
        notes: "Ask for Sam.",
      },
    ],
    pullSheet: [
      { caseLabel: "Case 1", items: [{ item: "Mixer", qty: 1, cat: null, subCat: null }] },
    ],
    openingReelHasVideo: false,
    runOfShow: {
      [TODAY_ISO]: {
        entries: [{ start: "09:00", title: "Doors open" }],
        showStart: "09:00",
        window: null,
      },
    },
    financials: { po: "PO-7", proposal: "Prop", invoice: "Inv", invoice_notes: "Notes" },
    viewerFlightInfo: "UA123 11:29am 5/13 | UA456 5:00pm 5/16",
  });
}

const adminViewer: Viewer = { kind: "admin" };

function renderSection(node: React.ReactNode) {
  return render(<>{node}</>);
}

/** Render all seven sections into ONE container so the walker sees every card. */
function renderAllSections(data: ShowForViewer) {
  return renderSection(
    <>
      <CrewSection data={data} viewer={adminViewer} today={FROZEN_TODAY} showId="show-1" />
      <TravelSection data={data} viewer={adminViewer} today={FROZEN_TODAY} showId="show-1" />
      <VenueSection data={data} viewer={adminViewer} today={FROZEN_TODAY} showId="show-1" />
      <GearSection data={data} viewer={adminViewer} today={FROZEN_TODAY} showId="show-1" />
      <ScheduleSection data={data} viewer={adminViewer} today={FROZEN_TODAY} showId="show-1" />
      <BudgetSection data={data} viewer={adminViewer} today={FROZEN_TODAY} showId="show-1" />
      <TodaySection data={data} viewer={adminViewer} today={FROZEN_TODAY} showId="show-1" />
    </>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("source-link field-aware coverage walker (§8 / §12)", () => {
  // `client` is the first WARNING-ANCHOR-ONLY region: it is consumed ONLY by the
  // FIELD_LABEL_AUTOCORRECTED deep-link path (lib/drive/showDayTimeAnchors.ts:146), NOT a crew
  // card — §30 forbids ever rendering client_contact to crew — so it has no CARD_REGION_MAP entry
  // by design. It still must be a real anchorable region (asserted in (c2)).
  const WARNING_ANCHOR_ONLY = new Set<string>(["client"]);

  it("(c) every REGION_ID is referenced by ≥1 entry in CARD_REGION_MAP (warning-anchor-only regions exempt)", () => {
    const referenced = new Set(Object.values(CARD_REGION_MAP));
    for (const region of REGION_IDS) {
      if (WARNING_ANCHOR_ONLY.has(region)) continue;
      expect(referenced.has(region), `region "${region}" has no card in CARD_REGION_MAP`).toBe(
        true,
      );
    }
  });

  it("(c2) warning-anchor-only regions are real anchorable regions (header-block)", () => {
    for (const region of WARNING_ANCHOR_ONLY) {
      expect(REGION_ANCHOR_SPEC[region as RegionId]).toBeDefined();
    }
    expect(REGION_ANCHOR_SPEC.client.strategy).toBe("header-block");
  });

  it("(a)+(b) every rendered data-card-id card is classified and links correctly", () => {
    const data = fullFixture();
    const { container } = renderAllSections(data);

    const cards = Array.from(container.querySelectorAll<HTMLElement>("[data-card-id]"));
    // Sanity: the populated fixture must exercise a broad set of cards (not a
    // near-empty render that trivially passes). Both classes must appear.
    expect(cards.length, "no data-card-id cards were discovered").toBeGreaterThan(8);

    const outOfScope = new Set<string>(OUT_OF_SCOPE_CARDS);
    let sourceBackedSeen = 0;
    let outOfScopeSeen = 0;

    for (const card of cards) {
      const id = card.getAttribute("data-card-id")!;
      const isMapped = Object.prototype.hasOwnProperty.call(CARD_REGION_MAP, id);
      const isOutOfScope = outOfScope.has(id);

      // Every rendered card MUST be classified — mapped OR out-of-scope. A new,
      // unclassified SectionCard fails here.
      expect(
        isMapped || isOutOfScope,
        `card "${id}" is neither in CARD_REGION_MAP nor OUT_OF_SCOPE_CARDS`,
      ).toBe(true);

      // Scope the link search to THIS card's header action slot so a sibling
      // card's link can never satisfy a different card (anti-tautology).
      const actionSlot = card.querySelector('[data-slot="section-card-action"]');
      const sourceLink =
        actionSlot?.querySelector<HTMLAnchorElement>('a[data-slot="source-link"]') ?? null;

      if (isMapped) {
        sourceBackedSeen += 1;
        // `id` is a verified key of CARD_REGION_MAP (isMapped guard above), so the
        // CardId cast is sound; the lookup then yields a non-undefined RegionId.
        const region = CARD_REGION_MAP[id as CardId];
        const expectedHref = buildSheetDeepLink(data.driveFileId, data.sourceAnchors[region]);
        expect(expectedHref, `helper returned null for region "${region}"`).not.toBeNull();
        expect(
          sourceLink,
          `card "${id}" (region "${region}") has no source link in its header`,
        ).not.toBeNull();
        expect(sourceLink!.getAttribute("href"), `card "${id}" links to the wrong region`).toBe(
          expectedHref,
        );
      }

      if (isOutOfScope) {
        outOfScopeSeen += 1;
        // No source link anywhere in the out-of-scope card.
        expect(
          card.querySelector('a[data-slot="source-link"]'),
          `out-of-scope card "${id}" must NOT carry a source link`,
        ).toBeNull();
      }
    }

    // The populated fixture must have exercised BOTH classes — otherwise the
    // assertions above are vacuously satisfied.
    expect(sourceBackedSeen, "no source-backed cards were rendered").toBeGreaterThan(8);
    expect(outOfScopeSeen, "no out-of-scope cards were rendered").toBeGreaterThan(0);
  });
});
