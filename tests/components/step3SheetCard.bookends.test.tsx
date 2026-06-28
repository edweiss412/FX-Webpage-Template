// @vitest-environment jsdom
/**
 * tests/components/step3SheetCard.bookends.test.tsx
 * (schedule SET/strike/load-out inference — Task 14)
 *
 * The admin Step-3 ScheduleBreakdown is the operator's review surface — it shows
 * ALL kinds (no per-viewer transport gate). It must:
 *   - render the SET Load In/Setup, per-room Strike, and Load-Out entries;
 *   - mark synthetic entries with data-entry-kind + a muted title treatment INSIDE
 *     the 1fr title cell (no 3rd grid column, no redundant kind-word badge);
 *   - exempt synthetic entries from the per-day SCHEDULE_ENTRIES_CAP (a same-day
 *     load-out is visible WITHOUT clicking "Show all");
 *   - exempt synthetic-bearing DAYS from SCHEDULE_DAYS_CAP, and count the
 *     "…and N more days" note on dropped NON-synthetic days only.
 *
 * Anti-tautology: cap-exemption is proven behaviorally (the synthetic title cell's
 * data-entry-kind marker is present in the COLLAPSED state); the day-note count
 * derives from the fixture's day structure.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, fireEvent, within } from "@testing-library/react";
import type { AgendaEntry, ParseResult, RunOfShow, ShowRow } from "@/lib/parser/types";
import { Step3SheetCard } from "@/components/admin/wizard/Step3SheetCard";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => cleanup());

const DFID = "drive-abc-123";
const WSID = "00000000-1111-4222-8333-444444444444";
const SCHEDULE_DAYS_CAP = 14; // mirrors Step3SheetCard (private const)

function show(overrides: Partial<ShowRow> = {}): ShowRow {
  return {
    title: "Asset Mgmt Summit",
    client_label: "Acme Capital",
    client_contact: null,
    template_version: "v4",
    venue: null,
    dates: { travelIn: null, set: null, showDays: ["2026-04-10"], travelOut: null },
    schedule_phases: {},
    event_details: {},
    agenda_links: [],
    coi_status: null,
    po: null,
    proposal: null,
    invoice: null,
    invoice_notes: null,
    ...overrides,
  };
}

function parseResult(overrides: Partial<ParseResult> = {}): ParseResult {
  return {
    show: show(),
    crewMembers: [],
    hotelReservations: [],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    runOfShow: {},
    hardErrors: [],
    ...overrides,
  };
}

function stagedRow(pr: ParseResult): Step3Row {
  return {
    driveFileId: DFID,
    driveFileName: "asset-mgmt-summit.sheet",
    status: "staged",
    parseResult: pr,
  };
}

function renderCard(pr: ParseResult): { el: HTMLElement; region: ReturnType<typeof within> } {
  const q = render(<Step3SheetCard row={stagedRow(pr)} wizardSessionId={WSID} />);
  fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-expand`));
  const el = q.getByTestId(`wizard-step3-card-${DFID}-breakdown-schedule`);
  return { el, region: within(el) };
}

// The synthetic marker is now data-entry-kind ON the 1fr title cell (no badge).
const kindCell = (el: HTMLElement, kind: string) =>
  el.querySelector(
    `[data-testid="wizard-step3-card-${DFID}-sched-title"][data-entry-kind="${kind}"]`,
  );

describe("Step3SheetCard ScheduleBreakdown — SET/strike/load-out (Task 14)", () => {
  test("renders SET Load In, strike, and load-out; synthetic title cells carry the muted data-entry-kind marker", () => {
    const ros: RunOfShow = {
      "2026-04-09": {
        entries: [
          { start: "7:00 PM", title: "Load In" },
          { start: "8:30 PM", title: "Setup" },
        ],
        showStart: null,
        window: null,
      },
      "2026-04-10": {
        entries: [
          { start: "9:00 AM", title: "Registration" },
          { start: "5:00 PM", title: "Strike — GS", kind: "strike" },
          { start: "6:00 PM", title: "Load Out", kind: "loadout" },
        ],
        showStart: null,
        window: null,
      },
    };
    const { el, region } = renderCard(parseResult({ runOfShow: ros }));
    // SET entries (plain agenda) render.
    expect(region.getByText("Load In")).toBeTruthy();
    // Synthetic titles render the title text itself; the synthetic marker is the
    // title cell's data-entry-kind (NOT a redundant kind-word badge).
    expect(region.getByText("Strike — GS")).toBeTruthy();
    expect(region.getByText("Load Out")).toBeTruthy();
    expect(kindCell(el, "strike")?.getAttribute("data-entry-kind")).toBe("strike");
    expect(kindCell(el, "strike")?.textContent).toBe("Strike — GS");
    expect(kindCell(el, "loadout")?.getAttribute("data-entry-kind")).toBe("loadout");
    expect(kindCell(el, "loadout")?.textContent).toBe("Load Out");
    // The redundant uppercase kind-word badge is gone; synthetic cells are muted.
    expect(
      el.querySelector(`[data-testid="wizard-step3-card-${DFID}-sched-kind-badge"]`),
    ).toBeNull();
    expect(kindCell(el, "strike")?.className).toContain("text-text-subtle");
  });

  test("synthetic marker lives ON the 1fr sched-title cell (no 3rd grid column, no badge)", () => {
    const ros: RunOfShow = {
      "2026-04-10": {
        entries: [{ start: "6:00 PM", title: "Load Out", kind: "loadout" }],
        showStart: null,
        window: null,
      },
    };
    const { region } = renderCard(parseResult({ runOfShow: ros }));
    // Exactly one time cell + one title cell (two-track grid preserved).
    expect(region.getAllByTestId(`wizard-step3-card-${DFID}-sched-time`).length).toBe(1);
    const titleCells = region.getAllByTestId(`wizard-step3-card-${DFID}-sched-title`);
    expect(titleCells.length).toBe(1);
    // The synthetic marker is on the title cell itself (the 1fr track), not a
    // sibling third column; the title text leads with the kind word — that's the
    // marker, so no separate badge element exists.
    expect(titleCells[0]!.getAttribute("data-entry-kind")).toBe("loadout");
    expect(titleCells[0]!.textContent).toBe("Load Out");
    expect(region.queryByTestId(`wizard-step3-card-${DFID}-sched-kind-badge`)).toBeNull();
  });

  test("entry cap-exemption: a load-out is visible WITHOUT 'Show all' even when agenda exceeds the cap", () => {
    // 9 agenda entries (> the 6 cap) + 1 load-out.
    const agenda: AgendaEntry[] = Array.from({ length: 9 }, (_, i) => ({
      start: `${8 + i}:00 AM`,
      title: `Session ${i + 1}`,
    }));
    const ros: RunOfShow = {
      "2026-04-10": {
        entries: [...agenda, { start: "6:00 PM", title: "Load Out", kind: "loadout" }],
        showStart: null,
        window: null,
      },
    };
    const { el, region } = renderCard(parseResult({ runOfShow: ros }));
    // Collapsed state: the "Show all" button exists (agenda overflowed)…
    expect(region.getByText(/Show all \d+ times/)).toBeTruthy();
    // …yet the load-out cell is ALREADY visible (cap-exempt, not behind "Show all").
    expect(kindCell(el, "loadout")).not.toBeNull();
    expect(region.getByText("Load Out")).toBeTruthy();
  });

  test("day cap-exemption: a synthetic-bearing day past the day cap is still rendered; note counts dropped non-synthetic days only", () => {
    const ros: RunOfShow = {};
    const totalDays = SCHEDULE_DAYS_CAP + 2; // two days past the cap
    for (let d = 0; d < totalDays; d++) {
      const iso = `2026-05-${String(d + 1).padStart(2, "0")}`;
      const isLastSynthetic = d === totalDays - 1; // the FINAL day carries a load-out
      ros[iso] = {
        entries: isLastSynthetic
          ? [{ start: "6:00 PM", title: "LoadOutMarker", kind: "loadout" }]
          : [{ start: "9:00 AM", title: `PlainDay${d}` }],
        showStart: null,
        window: null,
      };
    }
    const { region } = renderCard(parseResult({ runOfShow: ros }));
    // The synthetic-bearing day past the cap is rendered (its marker title shows).
    expect(region.getByText("LoadOutMarker")).toBeTruthy();
    // The non-synthetic day past the cap (index 14, "PlainDay14") is dropped.
    expect(region.queryByText("PlainDay14")).toBeNull();
    // Dropped NON-synthetic days = totalDays - cap - (synthetic days past cap) = 1.
    const droppedNonSynthetic = totalDays - SCHEDULE_DAYS_CAP - 1;
    expect(region.getByText(`…and ${droppedNonSynthetic} more days`)).toBeTruthy();
  });
});
