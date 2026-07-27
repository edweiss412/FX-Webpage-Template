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

/**
 * The three REFRESH behaviours spec §5.2 requires and plan:250 specified. Review R9 (MEDIUM) was
 * right that they never landed: the audit above never passes `viewerDays`, and the browser specs
 * toggle native <details> without re-rendering, so nothing pinned what happens when the server
 * re-renders underneath a user's toggle.
 *
 * These are React reconciliation facts, established by probe before being written down: React
 * diffs the `open` prop against ITS OWN last rendered value, not against the live DOM. So an
 * unchanged prop leaves a user's toggle alone, while a changed prop overwrites it. That is the
 * behaviour the fold depends on across `router.refresh()`, and it is why the fold can be a Server
 * Component with no client state at all.
 */
describe("agenda fold — refresh reconciliation (spec §5.2)", () => {
  const days = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      dayLabel: `Day ${i}`,
      date: null,
      sessions: [{ time: "9am", title: "S", room: null, tracks: [], drift: null }],
    }));
  const ext = (n: number) => ({
    confidence: "high" as const,
    corrections: 0,
    extractorVersion: 2,
    days: days(n),
  });
  const subset = (...rows: number[]) => ({ kind: "subset" as const, rows: new Set(rows) });
  const openStates = (c: HTMLElement) =>
    [...c.querySelectorAll("details")].map((d) => (d as HTMLDetailsElement).open);

  it("a user toggle SURVIVES a same-props refresh", () => {
    const { container, rerender } = render(
      <AgendaScheduleBlock extraction={ext(3)} viewerDays={subset(0)} />,
    );
    expect(openStates(container)).toEqual([true, false, false]);

    // The viewer opens a folded row themselves.
    (container.querySelectorAll("details")[2] as HTMLDetailsElement).open = true;
    expect(openStates(container)).toEqual([true, false, true]);

    // router.refresh() with identical data must not close it again.
    rerender(<AgendaScheduleBlock extraction={ext(3)} viewerDays={subset(0)} />);
    expect(openStates(container), "an unchanged prop leaves the user's toggle alone").toEqual([
      true,
      false,
      true,
    ]);
  });

  it("a CHANGED assignment moves `open` to the new row", () => {
    const { container, rerender } = render(
      <AgendaScheduleBlock extraction={ext(3)} viewerDays={subset(0)} />,
    );
    expect(openStates(container)).toEqual([true, false, false]);

    // The crew member's dates change; the server re-renders with a different viewer row.
    rerender(<AgendaScheduleBlock extraction={ext(3)} viewerDays={subset(2)} />);
    expect(openStates(container), "a changed prop overwrites the DOM state").toEqual([
      false,
      false,
      true,
    ]);
    // ...and the marker moves with it.
    expect(container.querySelector('[data-testid="agenda-day-marker-2"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="agenda-day-marker-0"]')).toBeNull();
  });

  it("a user toggle plus a now-AGREEING server value does not conflict", () => {
    const { container, rerender } = render(
      <AgendaScheduleBlock extraction={ext(3)} viewerDays={subset(0)} />,
    );
    // The viewer opens row 1 by hand, then their assignment catches up to include it.
    (container.querySelectorAll("details")[1] as HTMLDetailsElement).open = true;
    rerender(<AgendaScheduleBlock extraction={ext(3)} viewerDays={subset(0, 1)} />);
    expect(openStates(container), "agreement is not a conflict; the row stays open").toEqual([
      true,
      true,
      false,
    ]);
    // Both halves of the compound state, not just the open flags (review R11, LOW): row 1 is now
    // the viewer's, so it must GAIN its marker while staying open. Asserting open state alone
    // would pass on a render that moved `open` correctly and left the marker behind.
    expect(container.querySelector('[data-testid="agenda-day-marker-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="agenda-day-marker-0"]')).not.toBeNull();
  });

  it("EVERY row collapsed still renders every row, with no empty state", () => {
    // Review R10 (MEDIUM) caught the first version of this test asserting nothing it claimed:
    // it passed `{ kind: "all" }`, which OPENS every row, then checked only the row count and
    // the absence of markers -- so it never created the all-collapsed state and stayed green
    // even with every row forced open. The name described one state and the fixture built the
    // opposite.
    //
    // All-collapsed is reachable only by the USER: the viewer's row starts open, and they close
    // it. What must hold then is that the section still shows every day with its label and
    // count, rather than collapsing to something that looks broken or empty.
    const { container } = render(
      <AgendaScheduleBlock extraction={ext(3)} viewerDays={subset(0)} />,
    );
    const rows = [...container.querySelectorAll("details")] as HTMLDetailsElement[];
    expect(openStates(container)).toEqual([true, false, false]);

    rows.forEach((r) => (r.open = false));
    expect(openStates(container), "the user can close every row").toEqual([false, false, false]);

    // Every row is still present, labelled, and counted -- nothing vanishes when nothing is open.
    expect(container.querySelectorAll("details")).toHaveLength(3);
    expect(container.querySelectorAll("summary h3")).toHaveLength(3);
    for (const i of [0, 1, 2]) {
      const c = container.querySelector(`[data-testid="agenda-day-count-${i}"]`);
      expect(c, `row ${i} keeps its count while collapsed`).not.toBeNull();
      // Presence alone is too weak: `hidden` leaves the node in the DOM and jsdom computes no
      // visibility, so a mutation adding `hidden={!isOpen(di)}` passed a presence-only check.
      // The attribute IS observable here; actual painted visibility is asserted in the browser
      // spec, which is the division of labour this repo uses for every jsdom/CSS boundary.
      expect(c!.hasAttribute("hidden"), `row ${i} count is not hidden while collapsed`).toBe(false);
    }
    // The viewer's row is still identifiable even though it is now closed.
    expect(container.querySelector('[data-testid="agenda-day-marker-0"]')).not.toBeNull();
  });
});
