// @vitest-environment jsdom
/**
 * T3: the fold itself. Non-viewer days collapse to a one-line row; the viewer's day is
 * expanded and marked; anything indeterminate expands everything.
 *
 * Every case names the failure mode it catches. Several exist because a probe or a review
 * round found the obvious assertion would have passed while preserving the bug.
 *
 * KNOWN LIMIT OF THIS FILE, measured rather than assumed: jsdom computes no CSS, so these
 * tests can prove the marker is in the tree but NOT that it is visible. Mutation-verified:
 * adding `hidden` (display:none) to the marker leaves all 11 assertions green. Visibility is
 * therefore a real-browser assertion, covered by the §5.1 dimension work in this same task,
 * which measures the marker's content box and so fails on a zero-width element. Do not add a
 * `toBeVisible()` here and think it closes the gap — in jsdom that matcher is vacuous.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { AgendaScheduleBlock } from "@/components/crew/AgendaScheduleBlock";
import type { ViewerAgendaDays } from "@/lib/crew/agendaViewerDays";

afterEach(cleanup);

const sess = (time = "9:00am") => ({
  time,
  title: "S",
  room: null,
  tracks: [] as { label: string; title: string | null; room: string | null }[],
  drift: null,
});

/** `date: null` on every day, as the live extractor writes it (spec §2.5 fact 1). */
const ext = (labels: string[], sessionsPerDay = 1) => ({
  confidence: "high" as const,
  corrections: 0,
  extractorVersion: 2,
  days: labels.map((dayLabel) => ({
    dayLabel,
    date: null,
    sessions: Array.from({ length: sessionsPerDay }, () => sess()),
  })),
});

function renderFold(labels: string[], viewerDays?: ViewerAgendaDays, sessionsPerDay = 1) {
  return render(
    <AgendaScheduleBlock
      extraction={ext(labels, sessionsPerDay)}
      {...(viewerDays ? { viewerDays } : {})}
    />,
  );
}

const subset = (...rows: number[]): ViewerAgendaDays => ({ kind: "subset", rows: new Set(rows) });

describe("AgendaScheduleBlock — the fold", () => {
  test("a viewer's day is expanded and marked; the others fold", () => {
    const { container } = renderFold(["Day A", "Day B", "Day C"], subset(1));
    const rows = container.querySelectorAll("details");
    expect(rows.length, "every day renders a <details>").toBe(3);
    expect((rows[1] as HTMLDetailsElement).open, "the viewer's day is open").toBe(true);
    expect((rows[0] as HTMLDetailsElement).open, "another day is folded").toBe(false);
    expect((rows[2] as HTMLDetailsElement).open).toBe(false);
    expect(container.querySelector('[data-testid="agenda-day-marker-1"]')).not.toBeNull();
    // Catches marking every row: the marker must appear ONLY on the viewer's day.
    expect(container.querySelector('[data-testid="agenda-day-marker-0"]')).toBeNull();
    expect(container.querySelector('[data-testid="agenda-day-marker-2"]')).toBeNull();
  });

  test("THE MARKER RULE, suppression case 1: a single day carries no marker", () => {
    const { container } = renderFold(["Only Day"], subset(0));
    expect(container.querySelector('[data-testid="agenda-day-marker-0"]')).toBeNull();
  });

  test("THE MARKER RULE, suppression case 2: EVERY day the viewer's carries no marker", () => {
    // The case the spec's first draft got wrong. A suite covering only case 1 would have
    // passed against that defective spec.
    const { container } = renderFold(["Day A", "Day B"], subset(0, 1));
    expect(container.querySelectorAll("[data-testid^='agenda-day-marker-']").length).toBe(0);
  });

  test("uniform markup: kind:all renders <details open> on every day, never plain rows", () => {
    const { container } = renderFold(["Day A", "Day B"], { kind: "all" });
    const rows = container.querySelectorAll("details");
    expect(rows.length, "kind:all still uses <details>, not plain divs").toBe(2);
    for (const r of rows) expect((r as HTMLDetailsElement).open).toBe(true);
    expect(container.querySelectorAll("[data-testid^='agenda-day-marker-']").length).toBe(0);
  });

  test("an EMPTY subset is treated as kind:all, not as fold-everything", () => {
    // The dangerous value. "Fold iff my index is absent" would fold every day including
    // the viewer's own.
    const { container } = renderFold(["Day A", "Day B"], { kind: "subset", rows: new Set() });
    for (const r of container.querySelectorAll("details")) {
      expect((r as HTMLDetailsElement).open).toBe(true);
    }
  });

  test("the admin preview passes no viewerDays and renders unchanged", () => {
    const { container } = renderFold(["Day A", "Day B"]);
    for (const r of container.querySelectorAll("details")) {
      expect((r as HTMLDetailsElement).open).toBe(true);
    }
    expect(container.querySelectorAll("[data-testid^='agenda-day-marker-']").length).toBe(0);
  });

  test("a folded day with zero sessions still renders its row and count", () => {
    const { container } = renderFold(["Day A", "Day B"], subset(0), 0);
    const count = container.querySelector('[data-testid="agenda-day-count-1"]');
    expect(count, "the folded row renders a count element").not.toBeNull();
    // Catches a silently empty fold: the row must say so rather than look like a bug.
    expect(count?.textContent).toMatch(/0\s+session/i);
  });

  test("an empty dayLabel still renders its row", () => {
    const { container } = renderFold(["", "Day B"], subset(1));
    // Catches a truthiness guard dropping the day entirely.
    expect(container.querySelectorAll("details").length).toBe(2);
    expect(container.querySelector('[data-testid="agenda-day-summary-0"]')).not.toBeNull();
  });

  test("no silent cap: a long day list renders every row", () => {
    const labels = Array.from({ length: 40 }, (_, i) => `Day ${i}`);
    const { container } = renderFold(labels, subset(7));
    // Derived from the fixture, so a smaller fixture cannot satisfy it.
    expect(container.querySelectorAll("details").length).toBe(labels.length);
  });

  test("the marker sits on the summary, so it survives the viewer collapsing their day", () => {
    const { container } = renderFold(["Day A", "Day B"], subset(1));
    const row = container.querySelector('[data-testid="agenda-day-1"]') as HTMLDetailsElement;
    row.open = false;
    const marker = container.querySelector('[data-testid="agenda-day-marker-1"]');
    // Catches putting the marker in the disclosure BODY, which deletes the only cue telling
    // the viewer which day is theirs the moment they fold it.
    expect(marker, "marker must remain in the tree while collapsed").not.toBeNull();
    expect(row.querySelector("summary")?.contains(marker!), "marker is inside <summary>").toBe(
      true,
    );
  });

  test("each day keeps a real heading, inside the summary", () => {
    // Impeccable audit P1: the fold replaced the per-day <h3> with a bare span, which removed
    // every day from the document outline. Heading navigation is how a screen-reader user
    // skims this section, and no dimension or role assertion would have noticed.
    const { container } = renderFold(["Day A", "Day B"], subset(0));
    const headings = container.querySelectorAll("summary h3");
    expect(headings.length, "one heading per day, inside its summary").toBe(2);
    expect(headings[0]?.textContent).toBe("Day A");
    // The disclosure still owns the interactive role; the heading is nested, not a replacement.
    expect(container.querySelectorAll("details > summary").length).toBe(2);
  });

  test("the row and summary test ids exist per row; the count is folded-rows-only", () => {
    const { container } = renderFold(["Day A", "Day B"], subset(0));
    for (const i of [0, 1]) {
      for (const id of ["agenda-day", "agenda-day-summary"]) {
        expect(
          container.querySelector(`[data-testid="${id}-${i}"]`),
          `${id}-${i} must exist`,
        ).not.toBeNull();
      }
    }
    // Row 0 is the viewer's and therefore open: its sessions are listed below, so a count
    // there would restate what is already visible. Row 1 is folded and the count is the only
    // signal of what the fold hides.
    expect(container.querySelector('[data-testid="agenda-day-count-0"]')).toBeNull();
    expect(container.querySelector('[data-testid="agenda-day-count-1"]')).not.toBeNull();
  });
});
