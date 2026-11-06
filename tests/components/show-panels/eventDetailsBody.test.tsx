// @vitest-environment jsdom
/**
 * tests/components/show-panels/eventDetailsBody.test.tsx
 * (crew page redesign PR C plan, Task 2; spec
 * docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md §6.1, §6.2
 * `event` row, line 302)
 *
 * The Event details body is the grouped field list of the admin's
 * `EventDetailsBreakdown`, shared. The admin rendering is pinned byte for byte by
 * the goldens (tests/components/admin/wizard/adminSectionDom.test.tsx) and
 * asserted nowhere else: every case here is about the body and its props, each
 * rendered off and on over a fixture that carries the field.
 *
 * The body is rendered by CALLING it, the way the crew page will (spec line 291).
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const dressLines = vi.hoisted(() => ({ throwOnParse: false }));
vi.mock("@/lib/crew/dressCodeLines", async (original) => {
  const actual = await original<typeof import("@/lib/crew/dressCodeLines")>();
  return {
    ...actual,
    parseDressCodeLines: (value: string) => {
      if (dressLines.throwOnParse) throw new Error("planted dress code fault");
      return actual.parseDressCodeLines(value);
    },
  };
});

import { EVENT_DETAIL_GROUPS as ADMIN_EVENT_DETAIL_GROUPS } from "@/components/admin/wizard/step3ReviewSections";
import {
  EventDetailsBody,
  eventDetailGroups,
  type EventDetailsBodyProps,
} from "@/components/show-panels/EventDetailsBody";
import {
  EVENT_DETAIL_GROUPS,
  EVENT_DETAILS_LABELS,
  crewEventGroups,
  type EventDetailKey,
} from "@/lib/crew/eventDetailsSpecs";
import type { SearchEntry } from "@/lib/search/types";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { assertParity } from "@/tests/search/_parity";

afterEach(() => {
  cleanup();
  dressLines.throwOnParse = false;
});

/** Every label key with a real value, none of them a sentinel. */
const EVERY_FIELD: Record<EventDetailKey, string> = {
  stage_size: "32x16 ft",
  podium_type: "Acrylic",
  polling: "Yes",
  led: "Two 12x7 walls",
  scenic: "Step and repeat",
  gooseneck: "Two at the podium",
  digital_signage: "Lobby loop",
  test_pattern: "Bars at 07:00",
  fonts: "Brand Sans",
  equipment_storage: "Dock cage",
  staff_office_room: "Room 214",
  record: "No",
  virtual_speaker: "Yes",
  virtual_audience: "Possibly hybrid",
  notes: "Doors at 08:00",
  keynote_requirements: "Clicker and confidence monitor",
  opening_reel: "Loop until doors",
  internet: "Hardline at FOH",
  power: "200A at the dock",
  dress_code: "Set/Strike: Blacks\nShow: Business",
};

const body = (props: Partial<EventDetailsBodyProps> = {}): HTMLElement =>
  render(EventDetailsBody({ groups: eventDetailGroups(EVERY_FIELD), ...props })).container;

/** The body's group blocks, in order. */
const groupsIn = (container: HTMLElement): Element[] => [
  ...(container.firstElementChild?.children ?? []),
];
/** A group block's title element: the first child of its header row. */
const titleOf = (group: Element): Element => group.firstElementChild?.firstElementChild as Element;
const titles = (container: HTMLElement): (string | null)[] =>
  groupsIn(container).map((g) => titleOf(g).textContent);

/** A field's label element. Labels are unique in the fixture, values never equal one. */
const labelEl = (container: HTMLElement, key: EventDetailKey): HTMLElement =>
  within(container).getByText(EVENT_DETAILS_LABELS[key]);
/** A field's row: the element holding its label and its value. */
const rowOf = (container: HTMLElement, key: EventDetailKey): HTMLElement =>
  labelEl(container, key).parentElement as HTMLElement;

const MARKERS = "[data-search-target],[data-search-group],[data-search-skip]";

describe("eventDetailGroups", () => {
  test("null, undefined and an empty object read as no fields", () => {
    expect(eventDetailGroups(null)).toEqual([]);
    expect(eventDetailGroups(undefined)).toEqual([]);
    expect(eventDetailGroups({})).toEqual([]);
  });

  test("a value is coerced and trimmed, and a blank one drops", () => {
    const groups = eventDetailGroups({
      stage_size: 40,
      polling: true,
      led: "  LED wall  ",
      scenic: "   ",
      gooseneck: null,
    });
    const fields = groups.flatMap((g) => g.fields);
    expect(fields.map((f) => [f.key, f.value])).toEqual([
      ["stage_size", "40"],
      ["led", "LED wall"],
      ["polling", "true"],
    ]);
  });

  test("the reel loses its URLs, and a reel that is only a URL drops", () => {
    const url = "https://drive.google.com/file/d/abc123/view";
    const mixed = eventDetailGroups({ opening_reel: `YES - ${url}` });
    expect(mixed.flatMap((g) => g.fields).map((f) => f.value)).toEqual(["YES"]);
    expect(eventDetailGroups({ opening_reel: url })).toEqual([]);
    // Only the reel is stripped: the same text in another field stays as parsed.
    const other = eventDetailGroups({ notes: `YES - ${url}` });
    expect(other.flatMap((g) => g.fields).map((f) => f.value)).toEqual([`YES - ${url}`]);
  });

  test("a key outside the labels never renders", () => {
    expect(eventDetailGroups({ crew_rate: "$900" })).toEqual([]);
  });

  test("every label key is in exactly one group, each field carrying its label", () => {
    const fields = eventDetailGroups(EVERY_FIELD).flatMap((g) => g.fields);
    expect(fields.map((f) => f.key).sort()).toEqual(Object.keys(EVENT_DETAILS_LABELS).sort());
    for (const f of fields) expect(f.label).toBe(EVENT_DETAILS_LABELS[f.key]);
  });

  test("keys narrows the fields, an emptied group disappears, and order stays the groups'", () => {
    const every = eventDetailGroups(EVERY_FIELD);
    premise("the fixture fills every group", every.length, EVENT_DETAIL_GROUPS.length - 1);

    const narrowed = eventDetailGroups(EVERY_FIELD, ["polling", "scenic", "stage_size"]);
    expect(narrowed.map((g) => g.title)).toEqual(["Stage & scenic", "Production"]);
    expect(narrowed.flatMap((g) => g.fields).map((f) => f.key)).toEqual([
      "stage_size",
      "scenic",
      "polling",
    ]);
    expect(eventDetailGroups(EVERY_FIELD, [])).toEqual([]);
  });

  test("the admin's name is the one definition, re-exported", () => {
    expect(ADMIN_EVENT_DETAIL_GROUPS).toBe(EVENT_DETAIL_GROUPS);
  });
});

describe("EventDetailsBody: the groups", () => {
  test("keys narrows what renders and an emptied group draws no title", () => {
    const all = body();
    premise("the fixture renders every group", titles(all).length, 4);
    expect(titles(all)).toEqual(EVENT_DETAIL_GROUPS.map((g) => g.title));
    cleanup();

    const narrowed = body({ groups: eventDetailGroups(EVERY_FIELD, ["stage_size", "fonts"]) });
    expect(titles(narrowed)).toEqual(["Stage & scenic", "Display & content"]);
    expect(narrowed).toHaveTextContent(EVERY_FIELD.fonts);
    expect(narrowed).not.toHaveTextContent(EVERY_FIELD.podium_type);
  });

  test("nothing to show renders nothing, no empty block", () => {
    expect(body({ groups: [] })).toBeEmptyDOMElement();
    cleanup();
    const onlySentinels = eventDetailGroups({ stage_size: "TBD" });
    premise("the sentinel reaches the body", onlySentinels.length, 0);
    expect(body({ groups: onlySentinels, sentinels: "hide" })).toBeEmptyDOMElement();
  });

  test("the body's pieces run while it is called, so a throw lands in the caller's catch", () => {
    dressLines.throwOnParse = true;
    expect(() =>
      EventDetailsBody({ groups: eventDetailGroups({ dress_code: "Show: Business" }) }),
    ).toThrow("planted dress code fault");
  });
});

describe("EventDetailsBody: sentinels", () => {
  const SENTINELS = {
    ...EVERY_FIELD,
    scenic: "TBD",
    polling: "TBD",
    record: "N/A",
    virtual_speaker: "-",
    virtual_audience: "TBA",
  };

  test('"show" keeps a sentinel row, muted', () => {
    const container = body({ groups: eventDetailGroups(SENTINELS) });
    const value = rowOf(container, "scenic").lastElementChild;
    expect(value).toHaveTextContent("TBD");
    expect(value).toHaveClass("text-text-subtle");
    expect(value).not.toHaveClass("text-text");
    const real = rowOf(container, "led").lastElementChild;
    expect(real).toHaveClass("text-text");
    expect(titles(container)).toContain("Production");
  });

  test('"hide" omits a sentinel row and a group left empty, and keeps the rest', () => {
    const groups = eventDetailGroups(SENTINELS);
    premise(
      "the fixture's Production group holds only sentinels",
      groups.find((g) => g.title === "Production")?.fields.length ?? 0,
      3,
    );
    const container = body({ groups, sentinels: "hide" });
    expect(within(container).queryByText(EVENT_DETAILS_LABELS.scenic)).toBeNull();
    expect(titles(container)).not.toContain("Production");
    expect(within(container).getByText(EVENT_DETAILS_LABELS.led)).toBeInTheDocument();
    expect(titles(container)).toContain("Stage & scenic");
  });

  test("each key hides on its own rule: a reel of N/A stays, in plain text; a reel of TBD goes", () => {
    const stays = body({
      groups: eventDetailGroups({ opening_reel: "N/A", scenic: "N/A" }),
      sentinels: "hide",
    });
    expect(within(stays).queryByText(EVENT_DETAILS_LABELS.scenic)).toBeNull();
    const value = rowOf(stays, "opening_reel").lastElementChild;
    expect(value).toHaveTextContent("N/A");
    expect(value).toHaveClass("text-text");
    expect(value).not.toHaveClass("text-text-subtle");
    cleanup();

    const goes = body({ groups: eventDetailGroups({ opening_reel: "TBD" }), sentinels: "hide" });
    expect(goes).toBeEmptyDOMElement();
  });
});

describe("EventDetailsBody: chips", () => {
  test("on, a Yes field is a chip beside the group's rows, with its glyph", () => {
    const container = body();
    premiseHolds("the fixture carries a Yes field", EVERY_FIELD.polling === "Yes");
    const chip = rowOf(container, "polling");
    expect(chip).toHaveClass("bg-surface-sunken");
    expect(chip.querySelector("svg")).not.toBeNull();
    expect(chip).toHaveTextContent("Yes");
  });

  test("off, the same field is a plain row in key order and no glyph draws", () => {
    const container = body({ chips: false });
    const row = rowOf(container, "polling");
    expect(row).not.toHaveClass("bg-surface-sunken");
    expect(row).toHaveClass("grid-cols-[8rem_minmax(0,1fr)]");
    expect(row.lastElementChild).toHaveTextContent("Yes");
    expect(container.querySelector("svg")).toBeNull();

    const production = groupsIn(container).find((g) => titleOf(g).textContent === "Production");
    expect(production?.textContent).toContain(
      `${EVENT_DETAILS_LABELS.polling}${EVERY_FIELD.polling}${EVENT_DETAILS_LABELS.record}${EVERY_FIELD.record}`,
    );
  });

  test("a value neither yes nor no shows as parsed in the chip", () => {
    const chip = rowOf(body(), "virtual_audience");
    premiseHolds("the fixture's value is neither", !/^(y|n)/i.test(EVERY_FIELD.virtual_audience));
    expect(chip).toHaveTextContent(EVERY_FIELD.virtual_audience);
    expect(chip.querySelector("svg")).toBeNull();
  });
});

describe("EventDetailsBody: reelCards", () => {
  test("off, no wrapper; on, the cards sit under the reel inside it", () => {
    const off = body();
    expect(within(off).queryByTestId("event-opening-reel")).toBeNull();
    cleanup();

    const on = body({ reelCards: [<p key="a">Reel asset card</p>] });
    const wrapper = within(on).getByTestId("event-opening-reel");
    expect(wrapper).toContainElement(labelEl(on, "opening_reel"));
    expect(within(wrapper).getByText("Reel asset card")).toBeInTheDocument();
    expect(wrapper).not.toHaveTextContent(EVERY_FIELD.fonts);
  });
});

describe("EventDetailsBody: titleAs and groupTitle", () => {
  test('titleAs "h4" makes a heading with the eyebrow\'s classes and style', () => {
    const plain = body();
    const span = titleOf(groupsIn(plain)[0] as Element);
    expect(span.tagName).toBe("SPAN");
    expect(within(plain).queryAllByRole("heading")).toEqual([]);
    const spanClass = span.getAttribute("class");
    const spanStyle = span.getAttribute("style");
    premiseHolds("the eyebrow has classes and a style", Boolean(spanClass) && Boolean(spanStyle));
    cleanup();

    const headed = body({ titleAs: "h4" });
    const headings = within(headed).getAllByRole("heading", { level: 4 });
    expect(headings.map((h) => h.textContent)).toEqual(EVENT_DETAIL_GROUPS.map((g) => g.title));
    expect(headings[0]).toHaveAttribute("class", spanClass);
    expect(headings[0]).toHaveAttribute("style", spanStyle);
  });

  test("groupTitle changes the title and nothing else", () => {
    const from = "Wardrobe & key moments";
    const to = "Dress code & key moments";
    const base = body().innerHTML;
    premiseHolds("the fixture renders the title", base.includes("Wardrobe &amp; key moments"));
    cleanup();

    const mapped = body({ groupTitle: (title) => (title === from ? to : title) });
    expect(titles(mapped)).toContain(to);
    expect(titles(mapped)).not.toContain(from);
    expect(
      mapped.innerHTML.replace("Dress code &amp; key moments", () => from.replace("&", "&amp;")),
    ).toBe(base);
  });
});

describe("EventDetailsBody: fieldCards", () => {
  const actions = (name: string): ReactNode => <button type="button">{name}</button>;

  test("off, no card id and no action slot", () => {
    const container = body();
    expect(container.querySelector("[data-card-id]")).toBeNull();
    expect(container.querySelector('[data-slot="section-card-action"]')).toBeNull();
  });

  test("on, the wrapper holds exactly its row, and the slot's nearest card is that field's", () => {
    const container = body({
      chips: false,
      fieldCards: {
        keynote_requirements: { cardId: "gear-keynote", actions: actions("Keynote actions") },
        opening_reel: { cardId: "gear-opening-reel", actions: actions("Reel actions") },
        dress_code: { cardId: "today-dress", actions: actions("Dress actions") },
      },
    });
    const slots = [...container.querySelectorAll('[data-slot="section-card-action"]')];
    expect(slots.map((s) => s.textContent)).toEqual([
      "Reel actions",
      "Keynote actions",
      "Dress actions",
    ]);
    expect(slots.map((s) => s.closest("[data-card-id]")?.getAttribute("data-card-id"))).toEqual([
      "gear-opening-reel",
      "gear-keynote",
      "today-dress",
    ]);

    const keynote = container.querySelector('[data-card-id="gear-keynote"]') as HTMLElement;
    expect(keynote).toHaveTextContent(EVERY_FIELD.keynote_requirements);
    expect(keynote).toContainElement(labelEl(container, "keynote_requirements"));
    expect(keynote).not.toHaveTextContent("Blacks");
    expect(keynote).not.toHaveTextContent(EVERY_FIELD.notes);

    const dress = container.querySelector('[data-card-id="today-dress"]') as HTMLElement;
    expect(dress).toHaveTextContent("Blacks");
    expect(dress).not.toHaveTextContent(EVERY_FIELD.keynote_requirements);

    // A row with no entry keeps the plain markup.
    expect(rowOf(container, "stage_size").closest("[data-card-id]")).toBeNull();
  });

  test("a field that does not render draws no card", () => {
    const container = body({
      groups: eventDetailGroups({ stage_size: "32x16 ft" }),
      fieldCards: { dress_code: { cardId: "today-dress", actions: actions("Dress actions") } },
    });
    expect(container.querySelector("[data-card-id]")).toBeNull();
  });
});

describe("EventDetailsBody: rowLayout", () => {
  const FIXED = "grid grid-cols-[8rem_minmax(0,1fr)] items-baseline gap-x-4";
  const LONG_FORM: readonly EventDetailKey[] = [
    "dress_code",
    "keynote_requirements",
    "notes",
    "opening_reel",
  ];
  /** Every key that renders as a row here, the booleans included: `chips: false`. */
  const rowKeys = Object.keys(EVERY_FIELD) as EventDetailKey[];

  test("the default holds the 8rem track on every row, whatever the width", () => {
    const container = body({ chips: false });
    for (const key of rowKeys) expect(rowOf(container, key).className, key).toBe(FIXED);
    expect(container.innerHTML).not.toContain("@min-");
  });

  test("fluid stacks a long-form row until the crew split", () => {
    const container = body({ chips: false, rowLayout: "fluid" });
    premise("the fixture renders the long-form keys", LONG_FORM.length, 3);
    for (const key of LONG_FORM) {
      const { classList } = rowOf(container, key);
      expect(classList.contains("grid-cols-1"), key).toBe(true);
      expect(classList.contains("@min-crew-split:grid-cols-[8rem_minmax(0,1fr)]"), key).toBe(true);
      expect(classList.contains("grid-cols-[8rem_minmax(0,1fr)]"), key).toBe(false);
    }
  });

  test("fluid keeps a short fact in two columns until the container cannot hold it", () => {
    const container = body({ chips: false, rowLayout: "fluid" });
    const short = rowKeys.filter((key) => !LONG_FORM.includes(key));
    premise("the fixture renders short facts", short.length, 3);
    for (const key of short) {
      const { classList } = rowOf(container, key);
      expect(classList.contains("grid-cols-1"), key).toBe(true);
      expect(classList.contains("@min-[280px]:grid-cols-[8rem_minmax(0,1fr)]"), key).toBe(true);
      expect(classList.contains("@min-crew-split:grid-cols-[8rem_minmax(0,1fr)]"), key).toBe(false);
    }
  });

  test("a sentinel stays muted under either layout", () => {
    const groups = eventDetailGroups({ ...EVERY_FIELD, led: "TBD" });
    for (const rowLayout of ["fixed", "fluid"] as const) {
      const container = body({ groups, chips: false, rowLayout });
      expect(rowOf(container, "led").lastElementChild, rowLayout).toHaveClass("text-text-subtle");
      cleanup();
    }
  });
});

describe("EventDetailsBody: reelPlayer", () => {
  const player = <div data-testid="reel-player">player</div>;

  test("off, no player and no bare label", () => {
    const container = body({ groups: eventDetailGroups({ stage_size: "32x16 ft" }) });
    expect(within(container).queryByTestId("reel-player")).toBeNull();
    expect(within(container).queryByText(EVENT_DETAILS_LABELS.opening_reel)).toBeNull();
  });

  test.each([null, undefined, false])("a %s player is no player", (none) => {
    const container = body({
      groups: eventDetailGroups({ stage_size: "32x16 ft" }),
      reelPlayer: none,
    });
    expect(within(container).queryByText(EVENT_DETAILS_LABELS.opening_reel)).toBeNull();
    expect(titles(container)).toEqual(["Stage & scenic"]);
  });

  test("with reel text, the player follows the reel's row, in one block", () => {
    const container = body({ reelPlayer: player });
    const row = rowOf(container, "opening_reel");
    const shown = within(container).getByTestId("reel-player");
    expect(row.nextElementSibling).toBe(shown);
    expect(row.lastElementChild).toHaveTextContent(EVERY_FIELD.opening_reel);
    expect(within(container).getAllByText(EVENT_DETAILS_LABELS.opening_reel)).toHaveLength(1);
  });

  test("with no reel text, the label sits over the player alone, in the reel's place in its group", () => {
    const groups = eventDetailGroups(EVERY_FIELD, ["digital_signage", "fonts"]);
    premise("the group is otherwise present", groups.length, 0);
    const container = body({ groups, reelPlayer: player });
    expect(titles(container)).toEqual(["Display & content"]);

    const label = labelEl(container, "opening_reel");
    expect(label.nextElementSibling).toBe(within(container).getByTestId("reel-player"));
    const text = groupsIn(container)[0]?.textContent ?? "";
    expect(text.indexOf(EVENT_DETAILS_LABELS.digital_signage)).toBeLessThan(
      text.indexOf(EVENT_DETAILS_LABELS.opening_reel),
    );
    expect(text.indexOf(EVENT_DETAILS_LABELS.opening_reel)).toBeLessThan(
      text.indexOf(EVENT_DETAILS_LABELS.fonts),
    );
  });

  test("the group is created in its place when the keys left it empty", () => {
    const groups = eventDetailGroups(EVERY_FIELD, ["stage_size", "polling"]);
    premiseHolds(
      "the keys leave Display & content empty",
      !groups.some((g) => g.title === "Display & content"),
    );
    const container = body({ groups, reelPlayer: player });
    expect(titles(container)).toEqual(["Stage & scenic", "Display & content", "Production"]);
    expect(within(groupsIn(container)[1] as HTMLElement).getByTestId("reel-player")).toBeTruthy();
  });

  describe("over the crew's order", () => {
    const CREW_ORDER = crewEventGroups(EVERY_FIELD).map((g) => g.title);
    const crewBody = (keys: readonly EventDetailKey[]) =>
      body({
        groups: crewEventGroups(Object.fromEntries(keys.map((key) => [key, EVERY_FIELD[key]]))),
        reelPlayer: player,
      });

    test("the given groups keep their order, with the reel in its group", () => {
      const container = crewBody(["dress_code", "stage_size", "digital_signage", "polling"]);
      premise(
        "the crew's order leads with another group",
        CREW_ORDER.indexOf("Display & content"),
        0,
      );
      expect(titles(container)).toEqual([
        "Wardrobe & key moments",
        "Stage & scenic",
        "Display & content",
        "Production",
      ]);
    });

    test("a group the reel creates takes its place among them, the dress code still first", () => {
      expect(titles(crewBody(["dress_code", "stage_size", "polling"]))).toEqual([
        "Wardrobe & key moments",
        "Stage & scenic",
        "Display & content",
        "Production",
      ]);
      cleanup();
      expect(titles(crewBody(["dress_code", "polling"]))).toEqual([
        "Wardrobe & key moments",
        "Display & content",
        "Production",
      ]);
      cleanup();
      expect(titles(crewBody(["dress_code"]))).toEqual([
        "Wardrobe & key moments",
        "Display & content",
      ]);
    });
  });

  test("no groups at all still shows the player under its label", () => {
    const container = body({ groups: [], reelPlayer: player });
    expect(titles(container)).toEqual(["Display & content"]);
    expect(labelEl(container, "opening_reel").nextElementSibling).toBe(
      within(container).getByTestId("reel-player"),
    );
  });

  test("a hidden reel cell leaves the label over the player", () => {
    const container = body({
      groups: eventDetailGroups({ opening_reel: "TBD" }),
      sentinels: "hide",
      reelPlayer: player,
    });
    expect(within(container).queryByText("TBD")).toBeNull();
    expect(labelEl(container, "opening_reel").nextElementSibling).toBe(
      within(container).getByTestId("reel-player"),
    );
  });

  test("a field card on the reel holds the player, with or without text", () => {
    const card = { cardId: "gear-opening-reel", actions: <button type="button">Reel</button> };
    const withText = body({ reelPlayer: player, fieldCards: { opening_reel: card } });
    const shown = within(withText).getByTestId("reel-player");
    expect(shown.closest("[data-card-id]")).toHaveAttribute("data-card-id", "gear-opening-reel");
    cleanup();

    const bare = body({ groups: [], reelPlayer: player, fieldCards: { opening_reel: card } });
    const cardEl = bare.querySelector('[data-card-id="gear-opening-reel"]') as HTMLElement;
    expect(within(cardEl).getByTestId("reel-player")).toBeInTheDocument();
    expect(within(cardEl).getByText(EVENT_DETAILS_LABELS.opening_reel)).toBeInTheDocument();
    expect(cardEl.querySelector('[data-slot="section-card-action"]')).toHaveTextContent("Reel");
  });
});

describe("EventDetailsBody: targets", () => {
  const CREW_KEYS: EventDetailKey[] = [
    "stage_size",
    "polling",
    "keynote_requirements",
    "opening_reel",
    "dress_code",
  ];
  const groups = eventDetailGroups(EVERY_FIELD, CREW_KEYS);
  const skipped = (name: string): ReactNode => <span data-search-skip="">{name}</span>;
  const fieldCards = {
    keynote_requirements: { cardId: "gear-keynote", actions: skipped("Keynote actions") },
    opening_reel: { cardId: "gear-opening-reel", actions: skipped("Reel actions") },
    dress_code: { cardId: "today-dress", actions: skipped("Dress actions") },
  };
  const targets = {
    stage_size: ["t-stage"],
    polling: ["t-polling"],
    keynote_requirements: ["t-keynote"],
    opening_reel: ["t-reel"],
    dress_code: ["t-dress-set", "t-dress-show"],
  };

  test("no marker renders without them, whatever the other crew props", () => {
    const container = body({
      groups,
      chips: false,
      sentinels: "hide",
      titleAs: "h4",
      fieldCards,
      reelPlayer: <div>player</div>,
    });
    // The actions' own skip spans are the caller's, so read everything else.
    const own = [...container.querySelectorAll(MARKERS)].filter(
      (el) => el.closest('[data-slot="section-card-action"]') === null,
    );
    expect(own).toEqual([]);
  });

  test("a row carries its target, and its label and value are the target's text", () => {
    const container = body({ groups, chips: false, targets });
    const row = rowOf(container, "stage_size");
    expect(row).toHaveAttribute("data-search-target", "t-stage");
    expect(row).toHaveTextContent(`${EVENT_DETAILS_LABELS.stage_size}${EVERY_FIELD.stage_size}`);
    expect(rowOf(container, "polling")).toHaveAttribute("data-search-target", "t-polling");
  });

  test("the dress code puts a target on each phase line, and on the paragraph when unphased", () => {
    const phased = body({ groups, chips: false, targets });
    const ids = [...phased.querySelectorAll("dl [data-search-target]")].map((el) =>
      el.getAttribute("data-search-target"),
    );
    expect(ids).toEqual(["t-dress-set", "t-dress-show"]);
    cleanup();

    const plain = body({
      groups: eventDetailGroups({ dress_code: "Business casual" }),
      targets: { dress_code: ["t-dress"] },
    });
    expect(within(plain).getByText("Business casual")).toHaveAttribute(
      "data-search-target",
      "t-dress",
    );
  });

  test("group titles are skipped, and a field card's label is its region's group heading", () => {
    const container = body({ groups, chips: false, fieldCards, targets });
    for (const group of groupsIn(container)) {
      expect(titleOf(group)).toHaveAttribute("data-search-skip", "");
    }
    expect(labelEl(container, "keynote_requirements")).toHaveAttribute("data-search-group", "");
    expect(labelEl(container, "dress_code")).toHaveAttribute("data-search-group", "");
    // A panel row's label is plain text inside its target.
    expect(labelEl(container, "stage_size")).not.toHaveAttribute("data-search-group");
  });

  test("a label outside any target and any card is skipped, so no text is uncovered", () => {
    const container = body({
      groups: eventDetailGroups({ dress_code: "Show: Business" }),
      targets: { dress_code: ["t-dress"] },
    });
    expect(labelEl(container, "dress_code")).toHaveAttribute("data-search-skip", "");
    cleanup();

    const bare = body({ groups: [], reelPlayer: <div>player</div>, targets: {} });
    expect(labelEl(bare, "opening_reel")).toHaveAttribute("data-search-skip", "");
  });

  test("the markers satisfy the search parity harness over a panel and its field cards", () => {
    const entry = (
      id: string,
      group: string,
      label: string | null,
      value: string,
      context: string[] = [],
    ): SearchEntry => ({ id, section: "event", group, label, value, context, copy: null });
    const entries = [
      entry("t-stage", "Event details", EVENT_DETAILS_LABELS.stage_size, EVERY_FIELD.stage_size),
      entry("t-polling", "Event details", EVENT_DETAILS_LABELS.polling, EVERY_FIELD.polling),
      entry("t-keynote", "Keynote", null, EVERY_FIELD.keynote_requirements, ["Keynote"]),
      entry("t-reel", "Opening reel", null, EVERY_FIELD.opening_reel, ["Opening reel"]),
      entry("t-dress-set", "Dress code", "Set/Strike", "Blacks"),
      entry("t-dress-show", "Dress code", "Show", "Business"),
    ];
    const { container } = render(
      <section data-card-id="gear-tech-specs">
        <h3 data-search-group="">Event details</h3>
        {EventDetailsBody({
          groups,
          chips: false,
          sentinels: "hide",
          titleAs: "h4",
          fieldCards,
          targets,
        })}
      </section>,
    );
    expect(assertParity(container.firstElementChild as Element, entries)).toEqual([]);
  });
});
