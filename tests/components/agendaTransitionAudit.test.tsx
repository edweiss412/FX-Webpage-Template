// @vitest-environment jsdom
/**
 * tests/components/agendaTransitionAudit.test.tsx (Task 17 — spec §6 transition inventory).
 *
 * The agenda area has three visual states (§6):
 *   (a) embed-only       — a fileId link with no high-confidence extraction
 *   (b) embed + schedule — a high-confidence extraction renders AgendaScheduleBlock
 *   (c) nothing          — no fileId links
 *
 * All three are SERVER-RENDERED, CONTENT-DRIVEN (they depend on stored data, not
 * an interactive toggle), so each is an INSTANT render — no animation needed. The
 * only interactive transition in the whole area is opening/closing the PDF sheet,
 * which reuses the existing AgendaSheet open/close (a plain conditional render in
 * AgendaEmbed — no motion library).
 *
 * This audit pins: (1) AgendaScheduleBlock carries NO AnimatePresence / motion /
 * exit-initial-animate props; (2) AgendaEmbed's sheet toggle is a conditional
 * render, not a framer transition; (3) toggling the input data across the three
 * states swaps cleanly with NO orphaned animating node (the absence of
 * AnimatePresence means an outgoing render is gone immediately, never retained).
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const AGENDA_SCHEDULE_BLOCK = "components/crew/AgendaScheduleBlock.tsx";
const AGENDA_EMBED = "components/agenda/AgendaEmbed.tsx";

// Avoid pulling react-pdf/pdfjs into jsdom when AgendaEmbed's sheet opens.
vi.mock("@/components/agenda/AgendaPdfViewer", () => ({
  AgendaPdfViewer: ({ src: s }: { src: string }) => (
    <div data-testid="agenda-pdf-viewer-stub" data-src={s} />
  ),
}));

import { AgendaScheduleBlock } from "@/components/crew/AgendaScheduleBlock";
import { AgendaEmbed } from "@/components/agenda/AgendaEmbed";

const HIGH = {
  confidence: "high" as const,
  corrections: 0,
  extractorVersion: 1,
  days: [
    {
      dayLabel: "Tuesday",
      date: "2026-05-14",
      sessions: [{ time: "9:00 AM", title: "Welcome", room: "Mabel 1", tracks: [], drift: null }],
    },
  ],
};
const LOW = { confidence: "low" as const, corrections: 0, extractorVersion: 1, days: [] };
const MALFORMED = {};

afterEach(() => cleanup());

describe("agenda transition audit — static enumeration (§6: instant, content-driven)", () => {
  it("AgendaScheduleBlock imports NO motion library and uses NO AnimatePresence / <motion.*>", () => {
    const s = src(AGENDA_SCHEDULE_BLOCK);
    expect(s, "AgendaScheduleBlock is static server-render — no motion library").not.toMatch(
      /framer-motion|motion\/react/,
    );
    expect(s, "AgendaScheduleBlock must NOT use AnimatePresence").not.toMatch(/AnimatePresence/);
    expect(s, "AgendaScheduleBlock must NOT render a <motion.*> element").not.toMatch(/<motion\./);
  });

  it("AgendaScheduleBlock carries NO exit / initial / animate motion props (nothing to animate)", () => {
    const s = src(AGENDA_SCHEDULE_BLOCK);
    for (const prop of ["exit=", "initial=", "animate="]) {
      expect(s, `AgendaScheduleBlock must NOT carry a ${prop} motion prop`).not.toContain(prop);
    }
  });

  it("AgendaEmbed has NO motion library / AnimatePresence — the sheet toggle is a conditional render", () => {
    const s = src(AGENDA_EMBED);
    expect(s, "AgendaEmbed sheet open/close is a conditional render, not framer").not.toMatch(
      /framer-motion|motion\/react/,
    );
    expect(s, "AgendaEmbed must NOT use AnimatePresence").not.toMatch(/AnimatePresence/);
    expect(s, "AgendaEmbed must NOT render a <motion.*> element").not.toMatch(/<motion\./);
    // The transition is the existing useState-driven conditional `{openDoc ? <AgendaSheet/> : null}`.
    expect(s, "AgendaEmbed sheet toggle is conditional JSX").toMatch(/openDoc \? \(/);
  });
});

describe("agenda transition audit — content-driven swap is instant (no orphaned node)", () => {
  it("toggling AgendaScheduleBlock high → low → high swaps cleanly with no retained schedule", () => {
    const { container, rerender } = render(<AgendaScheduleBlock extraction={HIGH} />);
    // (b) embed + schedule.
    expect(container.querySelector('[data-testid="agenda-schedule"]')).not.toBeNull();

    // → (a) embed-only / (c) nothing: the schedule is gone IMMEDIATELY (no
    //   AnimatePresence retaining an exiting copy).
    rerender(<AgendaScheduleBlock extraction={LOW} />);
    expect(container.querySelector('[data-testid="agenda-schedule"]')).toBeNull();
    expect(container.firstChild).toBeNull();

    // → back to (b): re-render is instant, exactly one schedule (no duplicate
    //   from a lingering previous render).
    rerender(<AgendaScheduleBlock extraction={HIGH} />);
    expect(container.querySelectorAll('[data-testid="agenda-schedule"]').length).toBe(1);

    // → malformed jsonb: also instant-empty.
    rerender(<AgendaScheduleBlock extraction={MALFORMED} />);
    expect(container.firstChild).toBeNull();
  });

  it("AgendaEmbed sheet open/close is an instant conditional render (mount/unmount, not animated)", () => {
    render(
      <AgendaEmbed showId="show-x" agendaLinks={[{ label: "AGENDA LINK - RFI", fileId: "f1" }]} />,
    );
    // Closed: no sheet in the tree.
    expect(screen.queryByTestId("agenda-sheet")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /view agenda/i }));
    // Open: sheet mounts immediately.
    expect(screen.getByTestId("agenda-sheet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /close agenda/i }));
    // Closed again: sheet unmounts immediately (no exit animation node lingers).
    expect(screen.queryByTestId("agenda-sheet")).toBeNull();
  });
});
