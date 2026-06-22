// @vitest-environment jsdom
/**
 * tests/components/crew/primitives.test.tsx (crew-redesign Task 3)
 *
 * The four §4.6/§4.8 presentational primitives — SectionCard, KeyValueRows,
 * DayCard, KeyTimesStrip — are PURE (props in, markup out). This suite pins
 * the §4.8 guard matrix: omit-when-absent for optional props, sentinel-hiding
 * for KeyValueRows rows, the `today` pinned-style hook on DayCard, and the
 * render-nothing / partial-present behavior of KeyTimesStrip.
 *
 * Expected values are derived from the fixtures below — never hardcoded.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { KeyTimeAnchors } from "@/lib/crew/resolveKeyTimes";
import { SectionCard } from "@/components/crew/primitives/SectionCard";
import { KeyValueRows } from "@/components/crew/primitives/KeyValueRows";
import { DayCard } from "@/components/crew/primitives/DayCard";
import { KeyTimesStrip } from "@/components/crew/primitives/KeyTimesStrip";

afterEach(cleanup);

describe("<SectionCard>", () => {
  const childText = "Section body content";

  test("with no icon/title/action props → none of those nodes render, children always render", () => {
    const { getByTestId, getByText } = render(
      <SectionCard>
        <p>{childText}</p>
      </SectionCard>,
    );
    const card = getByTestId("section-card");
    // children always present
    expect(getByText(childText)).toBeTruthy();
    // no title node, no action node, no icon node
    expect(card.querySelector('[data-slot="section-card-title"]')).toBeNull();
    expect(card.querySelector('[data-slot="section-card-action"]')).toBeNull();
    expect(card.querySelector('[data-slot="section-card-icon"]')).toBeNull();
  });

  test("with icon + title + action → each present plus children", () => {
    const title = "My schedule";
    const actionText = "Edit";
    const { getByTestId, getByText } = render(
      <SectionCard
        icon={<svg data-testid="my-icon" />}
        title={title}
        action={<button>{actionText}</button>}
      >
        <p>{childText}</p>
      </SectionCard>,
    );
    const card = getByTestId("section-card");
    expect(card.querySelector('[data-slot="section-card-icon"]')).not.toBeNull();
    const titleNode = card.querySelector('[data-slot="section-card-title"]');
    expect(titleNode).not.toBeNull();
    expect(titleNode!.textContent).toContain(title);
    const actionNode = card.querySelector('[data-slot="section-card-action"]');
    expect(actionNode).not.toBeNull();
    expect(actionNode!.textContent).toContain(actionText);
    expect(getByText(childText)).toBeTruthy();
  });
});

describe("<KeyValueRows>", () => {
  // Fixture: two present rows, two sentinel/empty rows that must be omitted.
  const rows = [
    { k: "Hotel", v: "Marriott Downtown", sub: "Confirmation #ABC123" },
    { k: "Room", v: "Room 412" },
    { k: "Checkout", v: "" }, // empty → OMITTED
    { k: "Parking", v: "TBD" }, // sentinel → OMITTED
  ];

  test("omits rows whose value is empty or a sentinel; renders present rows with k + v + sub", () => {
    const { getByTestId } = render(<KeyValueRows rows={rows} />);
    const container = getByTestId("key-value-rows");
    const text = container.textContent ?? "";

    // Present rows: labels + values + sub all present.
    expect(text).toContain("Hotel");
    expect(text).toContain("Marriott Downtown");
    expect(text).toContain("Confirmation #ABC123");
    expect(text).toContain("Room");
    expect(text).toContain("Room 412");

    // Omitted rows: neither the label nor a stray value leaks.
    expect(text).not.toContain("Checkout");
    expect(text).not.toContain("Parking");
    expect(text).not.toContain("TBD");

    // Present-row count derived from the fixture (rows whose v is non-sentinel).
    const presentCount = rows.filter(
      (r) => !["", "TBD", "N/A", "TBA"].includes(r.v.trim().toUpperCase()),
    ).length;
    expect(container.querySelectorAll("dt").length).toBe(presentCount);
  });

  test("default (no columns prop) → single-column flex stack, data-columns=1, no grid/col-span", () => {
    const { getByTestId } = render(<KeyValueRows rows={rows} />);
    const dl = getByTestId("key-value-rows");
    expect(dl.getAttribute("data-columns")).toBe("1");
    expect(dl.className).toContain("flex-col");
    expect(dl.className).not.toContain("grid-cols-2");
    expect(dl.innerHTML).not.toContain("col-span-2");
  });

  test("columns={2} → 2-up grid at >=720px (data-columns=2); a span:2 row spans both columns", () => {
    const gridRows = [
      { k: "Hotel", v: "Four Seasons", span: 2 as const },
      { k: "Check in", v: "2026-06-13" },
      { k: "Check out", v: "2026-06-15" },
    ];
    const { getByTestId } = render(<KeyValueRows rows={gridRows} columns={2} />);
    const dl = getByTestId("key-value-rows");
    expect(dl.getAttribute("data-columns")).toBe("2");
    // grid (not the default flex stack), gated to the crew >=720px breakpoint so
    // mobile keeps the single stacked column.
    expect(dl.className).toContain("min-[720px]:grid-cols-2");
    expect(dl.className).not.toContain("flex-col");
    // The span:2 row (Hotel headline) opts into full width; the short date rows do not.
    const dts = Array.from(dl.querySelectorAll("dt"));
    const hotelWrapper = dts.find((dt) => dt.textContent === "Hotel")!.parentElement!;
    const checkInWrapper = dts.find((dt) => dt.textContent === "Check in")!.parentElement!;
    expect(hotelWrapper.className).toContain("min-[720px]:col-span-2");
    expect(checkInWrapper.className).not.toContain("col-span-2");
  });
});

describe("<DayCard> — horizontal date badge", () => {
  // `day` is now an ISO date (YYYY-MM-DD); `phase` is the schedule phase union.
  const base = { day: "2026-06-13", phase: "Set" } as const;

  test("renders a stacked weekday + day-number badge from the ISO date (UTC)", () => {
    // 2026-06-12 is a Friday (UTC). The badge stacks the weekday over the day-num.
    const { getByTestId } = render(<DayCard day="2026-06-12" phase="Travel In" today={false} />);
    const badge = getByTestId("day-card-date");
    expect(badge.textContent).toContain("FRI");
    expect(badge.textContent).toContain("12");
  });

  test('today={true} → node carries data-today="true" + the Today pill', () => {
    const { getByTestId, getByText } = render(
      <DayCard day="2026-06-14" phase="Show" today={true} />,
    );
    expect(getByTestId("day-card").getAttribute("data-today")).toBe("true");
    expect(getByText("Today")).toBeTruthy();
  });

  test("today={false} → no data-today attr, no Today pill", () => {
    const { getByTestId, queryByText } = render(<DayCard {...base} today={false} />);
    expect(getByTestId("day-card").getAttribute("data-today")).not.toBe("true");
    expect(queryByText("Today")).toBeNull();
  });

  test("Show phase → accent tone dot (data-tone='show')", () => {
    const { getByTestId } = render(<DayCard day="2026-06-14" phase="Show" today={false} />);
    expect(getByTestId("day-card-phase-dot").getAttribute("data-tone")).toBe("show");
  });

  test("Set phase → set tone dot (data-tone='set')", () => {
    const { getByTestId } = render(<DayCard {...base} today={false} />);
    expect(getByTestId("day-card-phase-dot").getAttribute("data-tone")).toBe("set");
  });

  test("Travel In / Travel Out phases → travel tone dot (data-tone='travel')", () => {
    const tin = render(<DayCard day="2026-06-12" phase="Travel In" today={false} />);
    expect(tin.getByTestId("day-card-phase-dot").getAttribute("data-tone")).toBe("travel");
    cleanup();
    const tout = render(<DayCard day="2026-06-16" phase="Travel Out" today={false} />);
    expect(tout.getByTestId("day-card-phase-dot").getAttribute("data-tone")).toBe("travel");
  });

  test("the phase text renders next to the tone dot", () => {
    const { getByTestId } = render(<DayCard {...base} today={false} />);
    expect(getByTestId("day-card").textContent).toContain("Set");
  });

  test("meta={null} → no meta node", () => {
    const { getByTestId } = render(<DayCard {...base} today={false} meta={null} />);
    expect(getByTestId("day-card").querySelector('[data-slot="day-card-meta"]')).toBeNull();
  });

  test("meta present → meta node renders", () => {
    const meta = "Set 9:00 AM";
    const { getByTestId } = render(<DayCard {...base} today={false} meta={meta} />);
    const metaNode = getByTestId("day-card").querySelector('[data-slot="day-card-meta"]');
    expect(metaNode).not.toBeNull();
    expect(metaNode!.textContent).toContain(meta);
  });
});

describe("<KeyTimesStrip>", () => {
  test("all anchors absent ({}) → renders nothing (firstChild is null)", () => {
    const { container } = render(<KeyTimesStrip anchors={{}} />);
    expect(container.firstChild).toBeNull();
  });

  test("partial { set, strike } (no show) → exactly the present-key rows, no show row", () => {
    const anchors: KeyTimeAnchors = { set: "9:00 AM", strike: "8:00 PM" };
    const { getByTestId } = render(<KeyTimesStrip anchors={anchors} />);
    const strip = getByTestId("key-times-strip");

    // Present-row count derived from the fixture's present keys.
    const presentKeys = Object.keys(anchors).filter(
      (k) => anchors[k as keyof KeyTimeAnchors] != null,
    );
    const anchorNodes = strip.querySelectorAll("[data-anchor]");
    expect(anchorNodes.length).toBe(presentKeys.length); // = 2

    // The two present anchors are exactly set + strike; show is absent.
    expect(strip.querySelector('[data-anchor="set"]')).not.toBeNull();
    expect(strip.querySelector('[data-anchor="strike"]')).not.toBeNull();
    expect(strip.querySelector('[data-anchor="show"]')).toBeNull();

    // Present values render.
    expect(strip.textContent).toContain(anchors.set);
    expect(strip.textContent).toContain(anchors.strike);
  });

  test("all three present → three anchor rows, each with its data-anchor key", () => {
    const anchors: KeyTimeAnchors = { set: "9:00 AM", show: "7:00 PM", strike: "11:00 PM" };
    const { getByTestId } = render(<KeyTimesStrip anchors={anchors} />);
    const strip = getByTestId("key-times-strip");
    expect(strip.querySelectorAll("[data-anchor]").length).toBe(3);
    expect(strip.querySelector('[data-anchor="set"]')).not.toBeNull();
    expect(strip.querySelector('[data-anchor="show"]')).not.toBeNull();
    expect(strip.querySelector('[data-anchor="strike"]')).not.toBeNull();
  });

  test('default layout → vertical stack (data-layout="stack"), no horizontal row classes', () => {
    const anchors: KeyTimeAnchors = { set: "9:00 AM", show: "7:00 PM", strike: "11:00 PM" };
    const { getByTestId } = render(<KeyTimesStrip anchors={anchors} />);
    const strip = getByTestId("key-times-strip");
    expect(strip.getAttribute("data-layout")).toBe("stack");
    expect(strip.className).toContain("flex-col");
    expect(strip.className).not.toContain("flex-row");
  });

  test('layout="row" → horizontal N-across strip at >=720px (data-layout="row"); anchors + span order preserved', () => {
    const anchors: KeyTimeAnchors = { set: "9:00 AM", show: "7:00 PM", strike: "11:00 PM" };
    const { getByTestId } = render(<KeyTimesStrip anchors={anchors} layout="row" />);
    const strip = getByTestId("key-times-strip");
    expect(strip.getAttribute("data-layout")).toBe("row");
    expect(strip.className).toContain("min-[720px]:flex-row");
    expect(strip.className).toContain("min-[720px]:divide-x");
    // All three anchors still render; each row keeps label-span-first / value-span-last
    // (the e2e inv6 alignment contract reads span.first() / span.last()).
    expect(strip.querySelectorAll("[data-anchor]").length).toBe(3);
    const setRow = strip.querySelector('[data-anchor="set"]')!;
    const spans = setRow.querySelectorAll("span");
    expect(spans.length).toBe(2);
    expect(spans[0]!.textContent).toBe("Set");
    expect(spans[1]!.textContent).toBe(anchors.set);
  });

  test('layout="row" with all anchors absent → still renders nothing', () => {
    const { container } = render(<KeyTimesStrip anchors={{}} layout="row" />);
    expect(container.firstChild).toBeNull();
  });
});
