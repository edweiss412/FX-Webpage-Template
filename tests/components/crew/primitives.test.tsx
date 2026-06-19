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
});

describe("<DayCard>", () => {
  const base = { day: "Day 2", phase: "Show day 2 of 3" };

  test('today={true} → node carries data-today="true"', () => {
    const { getByTestId } = render(<DayCard {...base} today={true} meta={null} />);
    expect(getByTestId("day-card").getAttribute("data-today")).toBe("true");
  });

  test('today={false} → node does NOT carry data-today="true"', () => {
    const { getByTestId } = render(<DayCard {...base} today={false} meta={null} />);
    expect(getByTestId("day-card").getAttribute("data-today")).not.toBe("true");
  });

  test("meta={null} → phase line renders with no meta node", () => {
    const { getByTestId } = render(<DayCard {...base} today={false} meta={null} />);
    const card = getByTestId("day-card");
    expect(card.textContent).toContain(base.phase);
    expect(card.querySelector('[data-slot="day-card-meta"]')).toBeNull();
  });

  test("meta present → meta node renders", () => {
    const meta = "Set 9:00 AM";
    const { getByTestId } = render(<DayCard {...base} today={false} meta={meta} />);
    const card = getByTestId("day-card");
    const metaNode = card.querySelector('[data-slot="day-card-meta"]');
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
});
