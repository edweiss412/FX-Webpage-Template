// @vitest-environment jsdom
/**
 * The viewer matrix's CONTENT cases reach the content they exist to produce
 * (plan Task 5, tests/search/_viewerMatrix.ts).
 *
 * The parity suite proves "index equals render" for every case. That proof is
 * vacuous for a line the matrix never makes render: a fixture with no Wi-Fi
 * password row passes parity on the password row trivially. So each content
 * case is rendered here, through the section component it exists for, with the
 * props `CrewShell` passes, and asserted to show its content. A case whose
 * fixture drifts away from its content fails here, not silently in parity.
 *
 * Expected values are read from each case's own data and from the exported
 * constants and helpers the sections use, never typed.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import type { JSX } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BudgetSection } from "@/components/crew/sections/BudgetSection";
import { CrewSection } from "@/components/crew/sections/CrewSection";
import { GearSection } from "@/components/crew/sections/GearSection";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { TodaySection } from "@/components/crew/sections/TodaySection";
import { TravelSection } from "@/components/crew/sections/TravelSection";
import { VenueSection } from "@/components/crew/sections/VenueSection";
import { buildCardReportContext } from "@/lib/crew/cardReportContext";
import { parseDressCodeLines } from "@/lib/crew/dressCodeLines";
import { CREW_TECH_SPEC_KEYS, EVENT_DETAILS_LABELS } from "@/lib/crew/eventDetailsSpecs";
import type { SectionId } from "@/lib/crew/resolveActiveSection";
import { createTileRenderLedger } from "@/lib/crew/tileRenderLedger";
import { parseWifiValue } from "@/lib/crew/wifiDisplay";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import { CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";
import { stripOpeningReelText } from "@/lib/visibility/openingReelText";
import { todayIsoInShowTimezone } from "@/lib/visibility/packList";
import * as matrix from "@/tests/search/_viewerMatrix";
import {
  ALL_CASES,
  fullContent,
  modeAToday,
  wifiNotes,
  wifiRaw,
  wifiSplit,
  type ViewerCase,
} from "@/tests/search/_viewerMatrix";

const SHOW_ID = "matrix-show";

beforeEach(() => {
  // RightNowHero (inside Today) reads matchMedia on mount; jsdom has none.
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
  vi.unstubAllGlobals();
});

/** Renders one section with the props `CrewShell` (_CrewShell.tsx `renderOne`) passes. */
function renderSection(id: SectionId, c: ViewerCase): HTMLElement {
  const ctx = resolveViewerContext(c.viewer, c.data);
  const props = {
    data: c.data,
    viewer: c.viewer,
    today: c.today,
    showId: SHOW_ID,
    ledger: createTileRenderLedger(),
    cardReport: c.staticPreview
      ? null
      : buildCardReportContext(c.viewer, ctx.viewerName, ctx.viewerCrew?.role ?? null),
  };
  const byId: Record<SectionId, () => JSX.Element> = {
    today: () => <TodaySection {...props} />,
    schedule: () => <ScheduleSection {...props} />,
    venue: () => <VenueSection {...props} />,
    travel: () => <TravelSection {...props} />,
    crew: () => <CrewSection {...props} />,
    gear: () => <GearSection {...props} />,
    budget: () => <BudgetSection {...props} />,
  };
  return render(byId[id]()).container;
}

function byTestId(root: ParentNode, id: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (el === null) throw new Error(`no [data-testid="${id}"] rendered`);
  return el;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

function internetOf(c: ViewerCase): string {
  const raw = c.data.show.event_details["internet"];
  if (raw === undefined || raw === null) throw new Error(`${c.name} has no internet cell`);
  return raw.trim();
}

describe("ALL_CASES", () => {
  test("lists every exported case exactly once", () => {
    const exported = Object.values(matrix).filter(
      (v): v is ViewerCase =>
        typeof v === "object" && v !== null && "name" in v && "data" in v && "viewer" in v,
    );
    expect(exported.length).toBeGreaterThan(0);
    expect(new Set(ALL_CASES.map((c) => c.name)).size).toBe(ALL_CASES.length);
    expect([...ALL_CASES].sort((a, b) => a.name.localeCompare(b.name))).toEqual(
      [...exported].sort((a, b) => a.name.localeCompare(b.name)),
    );
  });

  test("every case carries the request clock as a Date", () => {
    for (const c of ALL_CASES) expect(c.today).toBeInstanceOf(Date);
  });
});

describe("Wi-Fi forms (VenueSection)", () => {
  test("wifiSplit renders the network and password rows, no notes and no raw row", () => {
    const split = parseWifiValue(internetOf(wifiSplit));
    expect(split?.password).toBeTruthy();
    expect(split?.notes).toBeNull();

    const root = renderSection("venue", wifiSplit);
    expect(byTestId(root, "venue-wifi-ssid")).toHaveTextContent(split!.ssid);
    expect(byTestId(root, "venue-wifi-password")).toHaveTextContent(split!.password!);
    expect(root.querySelector('[data-testid="venue-wifi-notes"]')).toBeNull();
    expect(byTestId(root, "venue-facilities")).not.toHaveTextContent("Crew Wi-Fi");
  });

  test("wifiRaw renders the raw Crew Wi-Fi row and no split rows", () => {
    const raw = internetOf(wifiRaw);
    expect(parseWifiValue(raw)).toBeNull();

    const root = renderSection("venue", wifiRaw);
    for (const id of ["venue-wifi-ssid", "venue-wifi-password", "venue-wifi-notes"]) {
      expect(root.querySelector(`[data-testid="${id}"]`)).toBeNull();
    }
    const facilities = byTestId(root, "venue-facilities");
    expect(facilities).toHaveTextContent("Crew Wi-Fi");
    expect(squash(facilities.textContent ?? "")).toContain(squash(raw));
  });

  test("wifiNotes renders the split rows plus the Internet notes row", () => {
    const split = parseWifiValue(internetOf(wifiNotes));
    expect(split?.notes).toBeTruthy();

    const root = renderSection("venue", wifiNotes);
    expect(byTestId(root, "venue-wifi-ssid")).toHaveTextContent(split!.ssid);
    expect(byTestId(root, "venue-wifi-notes")).toHaveTextContent(split!.notes!);
  });
});

describe("modeAToday (TodaySection)", () => {
  test("renders Mode A: the bare key times strip and the merged run-of-show timeline", () => {
    const todayIso = todayIsoInShowTimezone(modeAToday.data.show, modeAToday.today);
    const root = renderSection("today", modeAToday);

    byTestId(root, "today-mode-a-grid");
    const card = byTestId(root, "today-run-of-show");
    const timeline = byTestId(card, `show-day-timeline-${todayIso}`);
    expect(timeline.querySelectorAll('[data-testid="agenda-entry"]').length).toBeGreaterThan(0);
    expect(
      timeline.querySelectorAll('[data-testid="timeline-agenda-session"]').length,
    ).toBeGreaterThan(0);

    const strips = [...root.querySelectorAll('[data-testid="key-times-strip"]')];
    expect(strips.filter((s) => s.closest("[data-card-id]") === null)).toHaveLength(1);
  });

  test("renders the dress code as one paragraph (the unparsed form)", () => {
    const dress = modeAToday.data.show.event_details["dress_code"];
    expect(dress).toBeTruthy();
    expect(parseDressCodeLines(dress!)).toBeNull();

    const card = byTestId(renderSection("today", modeAToday), "today-dress");
    expect(card.querySelector("dl")).toBeNull();
    expect(squash(card.textContent ?? "")).toContain(squash(dress!));
  });
});

describe("fullContent", () => {
  const ed = fullContent.data.show.event_details;
  const venueNotes = fullContent.data.show.venue?.notes ?? null;

  test("Today: Mode A with the plain run-of-show list, a long title and a long note folded", () => {
    const todayIso = todayIsoInShowTimezone(fullContent.data.show, fullContent.today);
    const root = renderSection("today", fullContent);

    const card = byTestId(root, "today-run-of-show");
    byTestId(card, `run-of-show-${todayIso}`);
    expect(card.querySelector('[data-testid="agenda-title-truncated"]')).not.toBeNull();

    const notes = byTestId(root, "today-notes");
    const longNote = notes.querySelector<HTMLElement>('li[data-truncated="true"]');
    expect(longNote).not.toBeNull();
    const details = longNote!.querySelector("details");
    expect(details).not.toBeNull();
    expect(venueNotes).toBeTruthy();
    expect(squash(details!.textContent ?? "")).toContain(squash(venueNotes!));
  });

  test("Today: the dress code renders as phase lines (the parsed form)", () => {
    const lines = parseDressCodeLines(ed["dress_code"] ?? "");
    expect(lines).not.toBeNull();
    const card = byTestId(renderSection("today", fullContent), "today-dress");
    expect(card.querySelectorAll("dt")).toHaveLength(lines!.length);
  });

  test("Schedule: the agenda area, every agenda block and label, day cards and a folded title", () => {
    const fileLinks = fullContent.data.show.agenda_links.filter((l) => Boolean(l.fileId));
    expect(fileLinks.length).toBeGreaterThan(1);
    const root = renderSection("schedule", fullContent);

    const agenda = byTestId(root, "agenda-area");
    expect(agenda.querySelectorAll('[data-testid="agenda-schedule"]')).toHaveLength(
      fileLinks.length,
    );
    expect(agenda.querySelectorAll('[data-testid="agenda-schedule-label"]')).toHaveLength(
      fileLinks.length,
    );
    expect(agenda.querySelector('[data-testid="agenda-session"]')).not.toBeNull();
    expect(agenda.querySelector('[data-testid="agenda-track"]')).not.toBeNull();

    expect(root.querySelectorAll('[data-testid="day-card"]').length).toBeGreaterThanOrEqual(
      fullContent.data.show.dates.showDays.length,
    );
    expect(root.querySelector('[data-testid="agenda-title-truncated"]')).not.toBeNull();
    expect(root.querySelector('[data-card-id="schedule-call-times"]')).not.toBeNull();
  });

  test("Venue: COI, venue notes and power", () => {
    const root = renderSection("venue", fullContent);
    expect(byTestId(root, "coi-status")).toHaveTextContent(fullContent.data.show.coi_status!);
    expect(squash(byTestId(root, "venue-status").textContent ?? "")).toContain(squash(venueNotes!));
    expect(byTestId(root, "venue-facilities")).toHaveTextContent(ed["power"]!);
  });

  test("Gear: one scope card per discipline, pack list, tech specs, room details, keynote, reel", () => {
    const root = renderSection("gear", fullContent);

    const scopeCards = Object.keys(CARD_REGION_MAP).filter((k) => k.startsWith("gear-scope-"));
    expect(scopeCards.length).toBeGreaterThan(0);
    for (const id of scopeCards) byTestId(root, id);

    const pack = byTestId(root, "gear-pack-list");
    expect(pack.querySelectorAll('[data-testid="gear-pack-list-case"]')).toHaveLength(
      fullContent.data.pullSheet!.length,
    );

    const specs = byTestId(root, "gear-tech-specs");
    for (const key of CREW_TECH_SPEC_KEYS) {
      expect(specs).toHaveTextContent(EVENT_DETAILS_LABELS[key]);
      expect(specs).toHaveTextContent(ed[key]!);
    }

    const details = byTestId(root, "gear-room-details");
    for (const room of fullContent.data.rooms) byTestId(details, `gear-room-detail-${room.id}`);

    expect(byTestId(root, "gear-keynote")).toHaveTextContent(ed["keynote_requirements"]!);
    const reel = stripOpeningReelText(ed["opening_reel"] ?? null);
    expect(reel.length).toBeGreaterThan(0);
    expect(byTestId(root, "gear-opening-reel")).toHaveTextContent(reel);
  });
});
