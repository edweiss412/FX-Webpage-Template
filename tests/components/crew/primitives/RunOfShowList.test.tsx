// @vitest-environment jsdom
/**
 * tests/components/crew/primitives/RunOfShowList.test.tsx (schedule bookends Task 11)
 *
 * The crew per-day run-of-show list must:
 *   - mark synthetic entries (kind:"strike"/"loadout") with data-entry-kind on the
 *     row + a DISTINCT muted title treatment (text-text-subtle vs the agenda row's
 *     text-text-strong) — NOT a redundant kind-word badge that repeats the title's
 *     own leading word;
 *   - cap ONLY the agenda group at RUN_OF_SHOW_DISPLAY_CAP and ALWAYS render the
 *     synthetic entries after it (cap-exempt), so a same-day load-out is never
 *     hidden behind the cap;
 *   - count the "+N more agenda items" overflow stub on the AGENDA group only.
 *
 * Anti-tautology: synthetic presence is scoped to the row's data-entry-kind, not
 * the title text ("Strike — GS"/"Load Out") which independently contains those
 * words; the muted-tone assertion compares the synthetic title span class against
 * the agenda title span class. Cap counts derive from RUN_OF_SHOW_DISPLAY_CAP,
 * never a hardcoded numeral.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import { RunOfShowList } from "@/components/crew/primitives/RunOfShowList";
import { RUN_OF_SHOW_DISPLAY_CAP } from "@/lib/crew/agendaDisplay";
import type { AgendaEntry } from "@/lib/parser/types";

afterEach(() => cleanup());

const ISO = "2025-05-14";
const mkAgenda = (n: number): AgendaEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    start: `${i}:00`,
    title: `Sess${String(i).padStart(2, "0")}`,
  }));

describe("RunOfShowList — synthetic muted-title marker + cap-exemption (Task 11)", () => {
  test("strike/loadout entries carry data-entry-kind + a DISTINCT muted title tone (no kind-word badge)", () => {
    const entries: AgendaEntry[] = [
      { start: "9:00", title: "Registration" },
      { start: "5 PM", title: "Strike — GS", kind: "strike" },
      { start: "6 PM", title: "Load Out", kind: "loadout" },
    ];
    const { container } = render(<RunOfShowList entries={entries} isoDate={ISO} />);
    const rows = [...container.querySelectorAll('[data-testid="agenda-entry"]')];
    expect(rows.length).toBe(3);
    // Exactly the two synthetic rows carry data-entry-kind; the agenda row does not.
    expect(rows[0]!.getAttribute("data-entry-kind")).toBeNull();
    expect(rows[1]!.getAttribute("data-entry-kind")).toBe("strike");
    expect(rows[2]!.getAttribute("data-entry-kind")).toBe("loadout");
    expect(container.querySelectorAll("[data-entry-kind]").length).toBe(2);
    // The redundant uppercase kind-word badge is GONE (it duplicated the title's
    // own leading word, "STRIKE" + "Strike — …").
    expect(container.querySelector('[data-testid="agenda-entry-kind-badge"]')).toBeNull();
    // Synthetic titles render the title text itself and carry the DISTINCT muted
    // tone (text-text-subtle), vs the agenda row's text-text-strong — scoped to
    // each title span so neither assertion is satisfied by the wrong row.
    const strikeTitle = within(rows[1] as HTMLElement).getByText("Strike — GS");
    const loadoutTitle = within(rows[2] as HTMLElement).getByText("Load Out");
    const agendaTitle = within(rows[0] as HTMLElement).getByText("Registration");
    expect(strikeTitle.className).toContain("text-text-subtle");
    expect(loadoutTitle.className).toContain("text-text-subtle");
    expect(agendaTitle.className).toContain("text-text-strong");
  });

  test("synthetic entries are cap-exempt: agenda capped, load-out still shown after", () => {
    const overAgenda = RUN_OF_SHOW_DISPLAY_CAP + 1; // one past the agenda cap
    const expectedOverflow = overAgenda - RUN_OF_SHOW_DISPLAY_CAP; // derived
    const agenda = mkAgenda(overAgenda);
    const entries: AgendaEntry[] = [
      ...agenda,
      { start: "6 PM", title: "Load Out", kind: "loadout" },
    ];
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
      container.querySelector('[data-testid="agenda-entry"][data-entry-kind="loadout"]'),
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
    expect(rows[0]!.getAttribute("data-entry-kind")).toBeNull();
    expect(rows[1]!.getAttribute("data-entry-kind")).toBe("loadout");
  });
});
