// @vitest-environment jsdom
/**
 * components/crew/sections/AgendaSection.tsx (crew page redesign PR B, Task 10):
 * the agenda leaves the Schedule section for a section of its own, on the
 * shared agenda block (spec §6.2 `agenda` row: "wrapper unchanged (`AgendaEmbed`
 * + viewer days)", "Hidden for suppressed viewers").
 *
 * - The crew panel card titled with the registry label holds the "View agenda"
 *   embed and the structured schedule; it has no card id and no header actions
 *   (the agenda has none today).
 * - The day headings stay `h4`, one level under the card's `h3`.
 * - With no agenda link carrying a file the section shows its empty state: an
 *   entitled viewer reaches it by a deep link or a refresh (plan decision 1).
 * - A throw from the derivation or from the shared block is contained by the
 *   section's own wrapper and recorded under `crew:agenda:schedule`.
 * - A date-suppressed viewer has neither the section nor any agenda line in what
 *   the shell hands the client (props and search index), with an unsuppressed
 *   viewer of the same show as the positive control (harness rule "Client props
 *   and payloads").
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AgendaSection } from "@/components/crew/sections/AgendaSection";
import * as agendaRowsModule from "@/components/crew/sections/agendaRows";
import * as blockModule from "@/components/show-panels/AgendaScheduleBlock";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import type { SectionId } from "@/lib/crew/resolveActiveSection";
import { createTileRenderLedger, type TileRenderLedger } from "@/lib/crew/tileRenderLedger";
import type { DateRestriction } from "@/lib/parser/types";
import type { SearchIndex } from "@/lib/search/types";
import { showSection } from "@/lib/showSections/registry";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { expectUntitledPanel } from "@/tests/components/show-panels/_panelCardAssert";

// Avoid pulling react-pdf/pdfjs into jsdom when AgendaEmbed mounts.
vi.mock("@/components/agenda/AgendaPdfViewer", () => ({
  AgendaPdfViewer: ({ src }: { src: string }) => (
    <div data-testid="agenda-pdf-viewer-stub" data-src={src} />
  ),
}));

// ---- The shell's seams, for the payload case: what it hands the client ------
const captured = vi.hoisted(
  () =>
    ({ sections: null, index: null }) as {
      sections: {
        initialSection: SectionId;
        sections: ReadonlyArray<{ id: string; label: string; peek: string | null }>;
        sectionNodes: Partial<Record<SectionId, ReactNode>>;
        [key: string]: unknown;
      } | null;
      index: SearchIndex | null;
    },
);
vi.mock("@/components/crew/CrewSections", () => ({
  CrewSections: (props: NonNullable<typeof captured.sections>) => {
    captured.sections = props;
    return null;
  },
}));
vi.mock("@/components/crew/search/CrewSearchProvider", () => ({
  CrewSearchProvider: ({ index, children }: { index: SearchIndex; children: ReactNode }) => {
    captured.index = index;
    return <>{children}</>;
  },
}));
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({ upsertAdminAlert: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/time/now", () => ({
  nowDate: async () => new Date("2026-05-14T15:00:00Z"),
  now: async () => "2026-05-14T15:00:00Z",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/show/acme-2026/tok",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/layout/Header", () => ({ Header: () => <header /> }));
vi.mock("@/components/auth/IdentityChip", () => ({ IdentityChip: () => null }));
vi.mock("@/components/realtime/ShowRealtimeBridge", () => ({ ShowRealtimeBridge: () => null }));
vi.mock("@/components/layout/Footer", () => ({ Footer: () => <footer /> }));

beforeEach(() => {
  captured.sections = null;
  captured.index = null;
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const TODAY = new Date("2026-05-14T15:00:00Z");
const CREW: Viewer = { kind: "crew", crewMemberId: "c1" };
const ADMIN: Viewer = { kind: "admin" };
const SUPPRESSED: DateRestriction = { kind: "unknown_asterisk", days: null };

/** Two agenda days, each with sessions whose text is distinctive enough to search for. */
const DAYS = [
  {
    dayLabel: "Thursday, May 14, 2026",
    date: null,
    sessions: [
      {
        time: "9:00 AM",
        title: "Quillon opening keynote",
        room: "Quillon Hall",
        tracks: [],
        drift: null,
      },
      { time: "10:30 AM", title: "Marrow panel", room: null, tracks: [], drift: null },
    ],
  },
  {
    dayLabel: "Friday, May 15, 2026",
    date: null,
    sessions: [
      {
        time: "9:00 AM",
        title: "Tessellate closing",
        room: "Tessel Room",
        tracks: [],
        drift: null,
      },
    ],
  },
];
const LINKS: ShowForViewer["show"]["agenda_links"] = [
  {
    label: "AGENDA LINK - RFI",
    fileId: "agenda-file-rfi",
    extracted: { confidence: "high", corrections: 0, extractorVersion: 2, days: DAYS },
  },
  { label: "AGENDA LINK - PCF", fileId: "agenda-file-pcf" },
];
/** Every agenda line a viewer could be handed: day labels, session titles and rooms. */
const AGENDA_TEXT = DAYS.flatMap((d) => [
  d.dayLabel,
  ...d.sessions.flatMap((s) => [s.title, s.room ?? ""]),
]).filter((t) => t !== "");

function show(
  links: ShowForViewer["show"]["agenda_links"],
  restriction: DateRestriction = { kind: "none" },
): ShowForViewer {
  const base = makeShowForViewer({
    show: {
      dates: {
        travelIn: null,
        set: null,
        showDays: ["2026-05-14", "2026-05-15"],
        travelOut: null,
      },
      agenda_links: links,
    },
  });
  return {
    ...base,
    crewMembers: base.crewMembers.map((m) =>
      m.id === "c1" ? { ...m, dateRestriction: restriction } : m,
    ),
  };
}

function renderAgenda(
  data: ShowForViewer,
  viewer: Viewer = CREW,
  ledger: TileRenderLedger = createTileRenderLedger(),
): HTMLElement | null {
  const { container } = render(
    <AgendaSection data={data} viewer={viewer} today={TODAY} showId="show-1" ledger={ledger} />,
  );
  return container.querySelector<HTMLElement>('[data-testid="section-agenda"]');
}

describe("agenda: the section on the shared agenda block (spec line 306)", () => {
  test("agenda: the panel card, untitled under the section heading, holds the embed and the structured schedule, with no card id and no header actions", () => {
    const root = renderAgenda(show(LINKS));
    premiseHolds("the section rendered", root instanceof HTMLElement);
    const card = within(root!).getByTestId("crew-panel-card");
    expectUntitledPanel(card, showSection("agenda").label);
    expect(card).not.toHaveAttribute("data-card-id");
    expect(card.querySelector('[data-slot="section-card-action"]')).toBeNull();
    // One "View agenda" per link with a file, one structured block per extraction.
    expect(within(card).getAllByRole("button", { name: /view agenda/i })).toHaveLength(
      LINKS.length,
    );
    expect(card.querySelectorAll('[data-testid="agenda-schedule"]')).toHaveLength(1);
    for (const session of DAYS.flatMap((d) => d.sessions)) {
      expect(card).toHaveTextContent(session.title);
    }
  });

  test("agenda: the day headings are h3s, one level under the section's h2", () => {
    const root = renderAgenda(show(LINKS))!;
    expect(root.querySelectorAll("h4")).toHaveLength(0);
    const h3s = [...root.querySelectorAll("h3")];
    expect(h3s.map((h) => h.textContent)).toEqual(DAYS.map((d) => d.dayLabel));
    // Each day heading lives in its own disclosure's summary.
    for (const h3 of h3s) expect(h3.closest("summary"), h3.textContent ?? "").not.toBeNull();
  });

  test('agenda: with no agenda link carrying a file the section says "No agenda on file yet." and draws no card', () => {
    for (const links of [[], [{ label: "AGENDA", url: "https://example.test/agenda" }]]) {
      const root = renderAgenda(show(links))!;
      // The exact sentence, so a suffixed or reworded copy fails (AC-13).
      expect(within(root).getByTestId("section-empty").textContent).toBe("No agenda on file yet.");
      expect(root.querySelectorAll('[data-testid="section-empty"]')).toHaveLength(1);
      expect(within(root).queryByTestId("crew-panel-card")).toBeNull();
      expect(within(root).queryByRole("button", { name: /view agenda/i })).toBeNull();
      cleanup();
    }
    // Positive control: the same section with a file link draws the card and no empty state.
    const root = renderAgenda(show(LINKS))!;
    expect(within(root).queryByTestId("section-empty")).toBeNull();
  });

  test("agenda: a date-suppressed viewer is handed no agenda line, even rendered directly", () => {
    const { container } = render(
      <AgendaSection
        data={show(LINKS, SUPPRESSED)}
        viewer={CREW}
        today={TODAY}
        showId="show-1"
        ledger={createTileRenderLedger()}
      />,
    );
    for (const text of AGENDA_TEXT) expect(container.innerHTML, text).not.toContain(text);
    // Positive control: the same show for an admin, whose dates are never suppressed.
    cleanup();
    const { container: open } = render(
      <AgendaSection
        data={show(LINKS, SUPPRESSED)}
        viewer={ADMIN}
        today={TODAY}
        showId="show-1"
        ledger={createTileRenderLedger()}
      />,
    );
    for (const text of AGENDA_TEXT) expect(open.innerHTML, text).toContain(text);
  });
});

describe("agenda: error containment (spec line 291)", () => {
  test("agenda: a throw from the agenda derivation renders the fallback and records crew:agenda:schedule", () => {
    const ledger = createTileRenderLedger();
    const spy = vi.spyOn(agendaRowsModule, "agendaPanel").mockImplementation(() => {
      throw new Error("planted agenda derivation fault");
    });
    const root = renderAgenda(show(LINKS), CREW, ledger)!;
    premise("the section called the derivation", spy.mock.calls.length, 0);
    expect(within(root).getByTestId("tile-error-fallback")).toBeInTheDocument();
    expect(ledger.failed.get("crew:agenda:schedule")?.message).toBe(
      "planted agenda derivation fault",
    );
  });

  test("agenda: a throw from the shared AgendaScheduleBlock is contained the same way", () => {
    const ledger = createTileRenderLedger();
    const spy = vi.spyOn(blockModule, "AgendaScheduleBlock").mockImplementation(() => {
      throw new Error("planted agenda block fault");
    });
    const root = renderAgenda(show(LINKS), CREW, ledger)!;
    premise("the section called the block", spy.mock.calls.length, 0);
    expect(within(root).getByTestId("tile-error-fallback")).toBeInTheDocument();
    expect(ledger.failed.get("crew:agenda:schedule")?.message).toBe("planted agenda block fault");
    expect(root).not.toHaveTextContent(DAYS[0]!.sessions[0]!.title);
  });
});

describe("agenda: what the shell hands the client (harness rule, AC-6)", () => {
  /** Everything the shell gives the client for this viewer: props, bodies and the index. */
  async function payloadFor(data: ShowForViewer, viewer: Viewer, rawSection?: string) {
    const { CrewShell } = await import("@/app/show/[slug]/[shareToken]/_CrewShell");
    render(await CrewShell({ data, viewer, showId: "show-1", rawSection, slug: "acme-2026" }));
    const props = captured.sections;
    if (props === null) throw new Error("CrewShell rendered no CrewSections");
    const { sectionNodes, ...rest } = props;
    const bodies = Object.values(sectionNodes)
      .map((node) => renderToStaticMarkup(<>{node}</>))
      .join("\n");
    return {
      keys: Object.keys(sectionNodes),
      listed: props.sections.map((s) => s.id),
      text: [bodies, JSON.stringify(rest), JSON.stringify(captured.index)].join("\n"),
    };
  }

  test("agenda: a date-suppressed viewer has neither the Agenda section nor any agenda line in the props, the bodies or the index", async () => {
    const suppressed = await payloadFor(show(LINKS, SUPPRESSED), CREW, "agenda");
    // PREMISE: the page was built for this viewer, so a missing line is withheld.
    expect(suppressed.keys).toContain("schedule");
    expect(suppressed.keys).not.toContain("agenda");
    expect(suppressed.listed).not.toContain("agenda");
    expect(AGENDA_TEXT.filter((t) => suppressed.text.includes(t))).toEqual([]);

    // POSITIVE CONTROL: the same show for a viewer whose dates are confirmed.
    cleanup();
    captured.sections = null;
    captured.index = null;
    const open = await payloadFor(show(LINKS), CREW, "agenda");
    expect(open.keys).toContain("agenda");
    expect(open.listed).toContain("agenda");
    expect(AGENDA_TEXT.filter((t) => !open.text.includes(t))).toEqual([]);
  });
});
