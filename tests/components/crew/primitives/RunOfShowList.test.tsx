// @vitest-environment jsdom
/**
 * tests/components/crew/primitives/RunOfShowList.test.tsx (schedule bookends Task 11)
 *
 * The crew per-day run-of-show list must:
 *   - badge synthetic entries (kind:"strike"/"loadout") with a DISTINCT uppercase
 *     eyebrow ("STRIKE" / "LOAD OUT") INSIDE the title cell (not a new column);
 *   - cap ONLY the agenda group at RUN_OF_SHOW_DISPLAY_CAP and ALWAYS render the
 *     synthetic entries after it (cap-exempt), so a same-day load-out is never
 *     hidden behind the cap;
 *   - count the "+N more agenda items" overflow stub on the AGENDA group only.
 *
 * Anti-tautology: the synthetic badge label ("STRIKE"/"LOAD OUT") is scoped via
 * its own data-testid so the assertion can't be satisfied by the entry's title
 * text ("Strike — GS"/"Load Out"), which independently contains those words.
 * Cap counts derive from RUN_OF_SHOW_DISPLAY_CAP, never a hardcoded numeral.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import { RunOfShowList } from "@/components/crew/primitives/RunOfShowList";
import { RUN_OF_SHOW_DISPLAY_CAP } from "@/lib/crew/agendaDisplay";
import type { AgendaEntry } from "@/lib/parser/types";

afterEach(() => cleanup());

const ISO = "2025-05-14";
const mkAgenda = (n: number): AgendaEntry[] =>
  Array.from({ length: n }, (_, i) => ({ start: `${i}:00`, title: `Sess${String(i).padStart(2, "0")}` }));

describe("RunOfShowList — synthetic kind badge + cap-exemption (Task 11)", () => {
  test("strike/loadout entries render a DISTINCT uppercase badge inside the title cell", () => {
    const entries: AgendaEntry[] = [
      { start: "9:00", title: "Registration" },
      { start: "5 PM", title: "Strike — GS", kind: "strike" },
      { start: "6 PM", title: "Load Out", kind: "loadout" },
    ];
    const { container } = render(<RunOfShowList entries={entries} isoDate={ISO} />);
    const badges = container.querySelectorAll('[data-testid="agenda-entry-kind-badge"]');
    // Exactly one badge per synthetic entry (the agenda entry gets none).
    expect(badges.length).toBe(2);
    const byKind = (kind: string) =>
      container.querySelector(`[data-testid="agenda-entry-kind-badge"][data-agenda-kind="${kind}"]`);
    // Badge text scoped to the badge element (NOT the title), so "Strike — GS"
    // can't satisfy a "STRIKE" assertion by accident.
    expect(byKind("strike")?.textContent).toBe("STRIKE");
    expect(byKind("loadout")?.textContent).toBe("LOAD OUT");
    // The badge is uppercase + reuses the av-badge surface token.
    expect(byKind("strike")?.className).toContain("uppercase");
    expect(byKind("strike")?.className).toContain("bg-surface-sunken");
    // The agenda row carries NO kind badge.
    const rows = container.querySelectorAll('[data-testid="agenda-entry"]');
    expect(rows.length).toBe(3);
    expect(
      within(rows[0] as HTMLElement).queryByTestId("agenda-entry-kind-badge"),
    ).toBeNull();
  });

  test("synthetic entries are cap-exempt: agenda capped, load-out still shown after", () => {
    const overAgenda = RUN_OF_SHOW_DISPLAY_CAP + 1; // one past the agenda cap
    const expectedOverflow = overAgenda - RUN_OF_SHOW_DISPLAY_CAP; // derived
    const agenda = mkAgenda(overAgenda);
    const entries: AgendaEntry[] = [...agenda, { start: "6 PM", title: "Load Out", kind: "loadout" }];
    const { container } = render(<RunOfShowList entries={entries} isoDate={ISO} />);

    // Rendered rows = capped agenda (RUN_OF_SHOW_DISPLAY_CAP) + the synthetic.
    const rows = container.querySelectorAll('[data-testid="agenda-entry"]');
    expect(rows.length).toBe(RUN_OF_SHOW_DISPLAY_CAP + 1);

    // The capped-out agenda entry (the (cap+1)th, padded title) is NOT shown…
    const droppedTitle = `Sess${String(overAgenda - 1).padStart(2, "0")}`;
    expect(container.textContent ?? "").not.toContain(droppedTitle);
    // …yet the synthetic load-out IS shown despite agenda exceeding the cap.
    expect(container.textContent ?? "").toContain("Load Out");
    expect(
      container.querySelector('[data-testid="agenda-entry-kind-badge"][data-agenda-kind="loadout"]'),
    ).not.toBeNull();

    // Overflow stub counts the AGENDA group only.
    const stub = container.querySelector('[data-testid="agenda-overflow-stub"]');
    expect(stub).not.toBeNull();
    expect(stub!.textContent).toContain(`+${expectedOverflow}`);
    expect(stub!.textContent).toContain("agenda item");
  });

  test("synthetic entries render AFTER the agenda group", () => {
    const entries: AgendaEntry[] = [
      { start: "9:00", title: "Opening" },
      { start: "6 PM", title: "Load Out", kind: "loadout" },
    ];
    const { container } = render(<RunOfShowList entries={entries} isoDate={ISO} />);
    const rows = [...container.querySelectorAll('[data-testid="agenda-entry"]')];
    // Last row is the synthetic; first is the agenda.
    expect(within(rows[0] as HTMLElement).queryByTestId("agenda-entry-kind-badge")).toBeNull();
    expect(within(rows[1] as HTMLElement).queryByTestId("agenda-entry-kind-badge")).not.toBeNull();
  });
});
