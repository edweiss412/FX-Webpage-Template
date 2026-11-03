// @vitest-environment jsdom
/**
 * tests/components/scheduleAgendaPlacement.test.tsx (Task 15).
 *
 * Pins the agenda RELOCATION contract (spec §4.6 / §4.8), as moved again by the
 * crew page redesign PR B, Task 10 (spec §6.2 `agenda` row):
 *   - the agenda affordance + structured schedule render in the AGENDA section,
 *     its own; the Schedule section renders neither (it kept its day cards);
 *   - the agenda is ABSENT from Venue/Diagrams;
 *   - a diagram-less + agenda-only show renders NO empty Diagrams block.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

// Avoid pulling react-pdf/pdfjs into jsdom when AgendaEmbed mounts.
vi.mock("@/components/agenda/AgendaPdfViewer", () => ({
  AgendaPdfViewer: ({ src }: { src: string }) => (
    <div data-testid="agenda-pdf-viewer-stub" data-src={src} />
  ),
}));

import { AgendaSection } from "@/components/crew/sections/AgendaSection";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { VenueSection } from "@/components/crew/sections/VenueSection";
import { DiagramsTile } from "@/components/crew/DiagramsBlock";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { ledgerProp } from "./crew/sections/_ledgerProp";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";
const VIEWER = { kind: "admin" } as const;

const HIGH_EXTRACTION = {
  confidence: "high" as const,
  corrections: 0,
  extractorVersion: 1,
  days: [
    {
      dayLabel: "Tuesday",
      date: "2026-05-14",
      sessions: [
        {
          time: "9:00 AM – 9:40 AM",
          title: "Welcome",
          room: "Mabel 1",
          tracks: [],
          drift: null,
        },
      ],
    },
  ],
};

const AGENDA_LINKS = [
  { label: "AGENDA LINK - RFI", fileId: "fileRFI", extracted: HIGH_EXTRACTION },
];

const DATES = {
  travelIn: null,
  set: null,
  showDays: ["2026-05-14", "2026-05-15"],
  travelOut: null,
};

afterEach(() => cleanup());

describe("agenda placement — its own section (Task 15, moved by PR B Task 10)", () => {
  test("Agenda renders the agenda affordance AND the structured schedule", () => {
    const { container } = render(
      <AgendaSection
        {...ledgerProp()}
        data={makeShowForViewer({ show: { dates: DATES, agenda_links: AGENDA_LINKS } })}
        viewer={VIEWER}
        today={TODAY}
        showId={SHOW_ID}
      />,
    );
    const section = container.querySelector('[data-testid="section-agenda"]')!;
    // Affordance present.
    expect(
      within(section as HTMLElement).getByRole("button", { name: /view agenda/i }),
    ).toBeTruthy();
    // Structured schedule present.
    expect(section.querySelector('[data-testid="agenda-schedule"]')).not.toBeNull();
  });

  test("Schedule renders no agenda, even when the show has one, and keeps its day-cards grid", () => {
    const { container } = render(
      <ScheduleSection
        {...ledgerProp()}
        data={makeShowForViewer({ show: { dates: DATES, agenda_links: AGENDA_LINKS } })}
        viewer={VIEWER}
        today={TODAY}
        showId={SHOW_ID}
      />,
    );
    const section = container.querySelector('[data-testid="section-schedule"]')!;
    expect(section.querySelector('[data-testid="schedule-grid"]')).not.toBeNull();
    expect(section.querySelector('[data-testid="agenda-schedule"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /view agenda/i })).toBeNull();
  });

  test("no agenda links → no agenda affordance or schedule in the Agenda section", () => {
    const { container } = render(
      <AgendaSection
        {...ledgerProp()}
        data={makeShowForViewer({ show: { dates: DATES, agenda_links: [] } })}
        viewer={VIEWER}
        today={TODAY}
        showId={SHOW_ID}
      />,
    );
    expect(container.querySelector('[data-testid="agenda-schedule"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /view agenda/i })).toBeNull();
  });
});

describe("agenda removed from Venue/Diagrams (Task 15)", () => {
  test("Venue does NOT render the agenda affordance", () => {
    render(
      <VenueSection
        {...ledgerProp()}
        data={makeShowForViewer({ show: { agenda_links: AGENDA_LINKS } })}
        viewer={VIEWER}
        today={TODAY}
        showId={SHOW_ID}
      />,
    );
    expect(screen.queryByRole("button", { name: /view agenda/i })).toBeNull();
  });

  test("agenda-only show (no diagrams) renders NO Diagrams block in Venue", () => {
    render(
      <VenueSection
        {...ledgerProp()}
        data={makeShowForViewer({ show: { agenda_links: AGENDA_LINKS }, diagrams: null })}
        viewer={VIEWER}
        today={TODAY}
        showId={SHOW_ID}
      />,
    );
    expect(screen.queryByTestId("diagrams-tile")).toBeNull();
    expect(screen.queryByTestId("venue-diagrams")).toBeNull();
  });

  test("DiagramsTile with no diagrams + agenda-only data → null (no empty block)", () => {
    const { container } = render(
      <DiagramsTile
        showId={SHOW_ID}
        diagrams={null}
        // @ts-expect-error agendaLinks was removed from DiagramsTileProps in Task 15
        agendaLinks={AGENDA_LINKS}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
