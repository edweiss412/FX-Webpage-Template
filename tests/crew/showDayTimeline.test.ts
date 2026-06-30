import { describe, expect, test } from "vitest";
import { buildShowDayTimeline, type TimelineItem } from "@/lib/crew/showDayTimeline";
import type { AgendaEntry } from "@/lib/parser/types";
import type { AgendaSession } from "@/lib/agenda/types";

const crew = (start: string, title: string, kind?: AgendaEntry["kind"]): AgendaEntry => ({
  start,
  title,
  ...(kind ? { kind } : {}),
});
const ag = (time: string, title: string | null = "S"): AgendaSession => ({
  time,
  title,
  room: null,
  tracks: [],
  drift: null,
});
const titleOf = (i: TimelineItem) => (i.source === "crew" ? i.entry.title : i.session.title);

describe("buildShowDayTimeline", () => {
  test("interleave order — non-sorted input, CONSTANT expected ascending order", () => {
    // Input deliberately out of order; a descending or input-order impl fails.
    const out = buildShowDayTimeline(
      [crew("10:00 AM", "Set"), crew("8:00 AM", "LoadIn")],
      [ag("9:00 AM – 9:40 AM", "Keynote")],
    );
    expect(out.map(titleOf)).toEqual(["LoadIn", "Keynote", "Set"]);
    expect(out.map((i) => i.source)).toEqual(["crew", "agenda", "crew"]);
  });
  test("dedup exact (crew wins) — same minute + same normalized title → 1 crew item", () => {
    const out = buildShowDayTimeline(
      [crew("9:00 AM", "Keynote")],
      [ag("9:00 AM – 9:40 AM", "Keynote")],
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toBe("crew");
  });
  test("dedup near-miss — different minute OR title → both shown", () => {
    expect(
      buildShowDayTimeline([crew("9:00 AM", "Keynote")], [ag("9:05 AM", "Keynote")]),
    ).toHaveLength(2);
    expect(
      buildShowDayTimeline([crew("9:00 AM", "Keynote")], [ag("9:00 AM", "Keynote Q&A")]),
    ).toHaveLength(2);
  });
  test("ties — crew before agenda at the same minute (different titles, not deduped)", () => {
    const out = buildShowDayTimeline([crew("9:00 AM", "X")], [ag("9:00 AM", "Y")]);
    expect(out.map((i) => i.source)).toEqual(["crew", "agenda"]);
  });
  test("crew with unparseable start sorts LAST in original order", () => {
    const out = buildShowDayTimeline(
      [crew("TBD", "Late"), crew("8:00 AM", "Early")],
      [ag("9:00 AM", "Mid")],
    );
    expect(out.map(titleOf)).toEqual(["Early", "Mid", "Late"]);
  });
  test("agenda with unparseable time dropped (defensive)", () => {
    const out = buildShowDayTimeline([crew("8:00 AM", "A")], [ag("TBD", "drop")]);
    expect(out.map(titleOf)).toEqual(["A"]);
  });
  test("crew-vs-crew duplicates NOT deduped (sheet errors preserved)", () => {
    expect(buildShowDayTimeline([crew("9:00 AM", "Dup"), crew("9:00 AM", "Dup")], [])).toHaveLength(
      2,
    );
  });
});
