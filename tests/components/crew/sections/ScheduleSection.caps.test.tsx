// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { ScheduleSection, RUN_OF_SHOW_DISPLAY_CAP } from "@/components/crew/sections/ScheduleSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { AgendaEntry } from "@/lib/parser/types";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";
const D1 = "2026-05-14";
const DATES = { travelIn: null, set: null, showDays: [D1], travelOut: null };
const VIEWER = { kind: "admin" } as const;

function renderEntries(entries: AgendaEntry[]) {
  return render(
    <ScheduleSection
      data={makeShowForViewer({ show: { dates: DATES }, runOfShow: { [D1]: entries } })}
      viewer={VIEWER}
      today={TODAY}
      showId={SHOW_ID}
    />,
  ).container;
}
const mkEntries = (n: number): AgendaEntry[] =>
  Array.from({ length: n }, (_, i) => ({ start: `${i}:00`, title: `Session ${String(i + 1).padStart(2, "0")}` }));

describe("Schedule run-of-show — display cap + 80-char title truncation (test 7a)", () => {
  test(`cap+1 (${RUN_OF_SHOW_DISPLAY_CAP + 1}) → exactly cap rows + stub count = length − cap (tail-trim)`, () => {
    const n = RUN_OF_SHOW_DISPLAY_CAP + 1;
    const expectedOverflow = n - RUN_OF_SHOW_DISPLAY_CAP; // derived
    const c = renderEntries(mkEntries(n));
    expect(c.querySelectorAll('[data-testid="agenda-entry"]').length).toBe(RUN_OF_SHOW_DISPLAY_CAP);
    const stub = c.querySelector('[data-testid="agenda-overflow-stub"]');
    expect(stub).not.toBeNull();
    expect(stub!.textContent).toContain(`+${expectedOverflow}`);
    // Tail-trim: last shown present, first overflowed absent. Positive presence is
    // SCOPED to the run-of-show list (anti-tautology); the absence check on the
    // whole container is strictly stronger.
    const list = c.querySelector(`[data-testid="run-of-show-${D1}"]`)!;
    expect(list.textContent ?? "").toContain(`Session ${String(RUN_OF_SHOW_DISPLAY_CAP).padStart(2, "0")}`);
    expect(c.textContent ?? "").not.toContain(`Session ${String(RUN_OF_SHOW_DISPLAY_CAP + 1).padStart(2, "0")}`);
  });

  test(`exactly cap (${RUN_OF_SHOW_DISPLAY_CAP}) → all rows, NO stub (no +0 at >= cap)`, () => {
    const c = renderEntries(mkEntries(RUN_OF_SHOW_DISPLAY_CAP));
    expect(c.querySelectorAll('[data-testid="agenda-entry"]').length).toBe(RUN_OF_SHOW_DISPLAY_CAP);
    expect(c.querySelector('[data-testid="agenda-overflow-stub"]')).toBeNull();
    expect(c.textContent ?? "").not.toContain("+0");
  });

  test("title > 80 chars → <details> with truncated summary + full body", () => {
    const long = "Z".repeat(81);
    const c = renderEntries([{ start: "9:00", title: long }]);
    const details = c.querySelector('[data-testid="agenda-title-truncated"]');
    expect(details).not.toBeNull();
    expect(details!.querySelector("summary")!.textContent).toContain("…");
    expect(details!.textContent).toContain(long); // full body preserved in <details>
  });

  test("title ≤ 80 chars → plain span, NO <details> (boundary: exactly 80 is not truncated)", () => {
    const c = renderEntries([{ start: "9:00", title: "Z".repeat(80) }]);
    expect(c.querySelector('[data-testid="agenda-title-truncated"]')).toBeNull();
  });
});
