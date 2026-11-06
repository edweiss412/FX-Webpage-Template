// @vitest-environment jsdom
/**
 * tests/components/show-panels/roomsBody.test.tsx
 * (crew page redesign PR C plan, Task 3; spec
 * docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md §6.1, §6.2
 * `rooms` row, line 309)
 *
 * The Rooms body is the room list of the admin's `RoomsBreakdown`, shared. The
 * admin rendering is pinned byte for byte by the goldens
 * (tests/components/admin/wizard/adminSectionDom.test.tsx) and asserted nowhere
 * else: every case here is about the body and its props, each rendered off and on
 * over a fixture that carries the field.
 *
 * The body is rendered by CALLING it, the way the crew page will (spec line 291).
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  hasContent as adminHasContent,
  roomHasScope as adminRoomHasScope,
} from "@/components/admin/wizard/step3ReviewSections";
import { RoomsBody, type RoomsBodyProps } from "@/components/show-panels/RoomsBody";
import { hasContent } from "@/components/show-panels/fieldRows";
import {
  ROOM_KIND_LABEL,
  ROOM_SCOPE,
  ROOM_SCOPE_UNSPECIFIED,
  YOUR_SCOPE,
  isDroppedScopeValue,
  roomHasScope,
  roomScopeRows,
  type RoomScopeKey,
} from "@/components/show-panels/roomScope";
import type { RoomRow } from "@/lib/parser/types";
import type { SearchEntry } from "@/lib/search/types";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { assertParity } from "@/tests/search/_parity";

afterEach(cleanup);

/** Every field a room can carry, none of them a sentinel. */
const FULL_ROOM: RoomRow = {
  kind: "gs",
  name: "Grand Ballroom",
  dimensions: "60 x 40 ft",
  floor: "Level 2",
  setup: "Classroom for 200",
  set_time: "10/20 @ 8a",
  show_time: "10/21 @ 9a",
  strike_time: "10/22 @ 6p",
  audio: "L-Acoustics K2 x 8",
  video: "Barco UDX x 2",
  lighting: "Twelve moving heads",
  scenic: "Step and repeat",
  power: "200A at the dock",
  digital_signage: "Lobby loop",
  other: "Two confidence monitors",
  notes: "Doors at 08:00",
};

const room = (over: Partial<RoomRow> = {}): RoomRow => ({ ...FULL_ROOM, ...over });

const PREFIX = "probe";

const body = (props: Partial<RoomsBodyProps> = {}): HTMLElement =>
  render(RoomsBody({ rooms: [FULL_ROOM], cap: null, testIdPrefix: PREFIX, ...props })).container;

const cards = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>("li[class*='shadow-tile']"),
];

const header = (root: HTMLElement, i = 0) => within(root).getByTestId(`${PREFIX}-room-${i}-header`);

const scopeList = (root: HTMLElement, i = 0) =>
  root.querySelector<HTMLElement>(`[data-testid="${PREFIX}-room-${i}-scope"]`);

const scopeRows = (root: HTMLElement, i = 0) => [
  ...(scopeList(root, i)?.querySelectorAll<HTMLElement>(":scope > li") ?? []),
];

const scopeLabels = (root: HTMLElement, i = 0) =>
  scopeRows(root, i).map((row) => within(row).getByTestId("room-scope-key").textContent);

/** A row's value: the cell after its key. */
const scopeValue = (row: HTMLElement) =>
  within(row).getByTestId("room-scope-key").nextElementSibling?.textContent;

const emphasizedLabels = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('[data-emphasis="you"]')].map(
    (row) => within(row).getByTestId("room-scope-key").textContent,
  );

/** The disciplines of a room, each given `value`. */
const allScope = (value: string | null): Partial<RoomRow> => ({
  audio: value,
  video: value,
  lighting: value,
  scenic: value,
  other: value,
});

describe("the moved names", () => {
  test("the surface copy reads as written", () => {
    expect(YOUR_SCOPE).toBe("Your scope");
    expect(ROOM_SCOPE_UNSPECIFIED).toBe("Not specified");
  });

  test("the admin's names are the shared functions, not copies", () => {
    expect(adminHasContent).toBe(hasContent);
    expect(adminRoomHasScope).toBe(roomHasScope);
  });

  test("hasContent keeps only a string with text", () => {
    expect(hasContent("x")).toBe(true);
    expect(hasContent("   ")).toBe(false);
    expect(hasContent("")).toBe(false);
    expect(hasContent(null)).toBe(false);
    expect(hasContent(7)).toBe(false);
  });

  test("roomHasScope counts a room with one real discipline and no other", () => {
    expect(roomHasScope(room(allScope(null)))).toBe(false);
    expect(roomHasScope(room(allScope("N/A")))).toBe(false);
    expect(roomHasScope(room({ ...allScope(null), other: "Two monitors" }))).toBe(true);
  });
});

describe("rooms and the cap", () => {
  const five = [1, 2, 3, 4, 5].map((n) => room({ name: `Room ${n}` }));
  const note = (total: number, cap: number) => `${total - cap} past ${cap}`;

  test.each([
    [2, "3 past 2"],
    [4, "1 past 4"],
  ])("a cap of %i shows that many rooms and the note follows the list", (cap, text) => {
    premise("the fixture runs past the cap", five.length, cap);
    const root = body({ rooms: five, cap, overflowNote: note });
    expect(cards(root)).toHaveLength(cap);
    expect(cards(root).at(-1)).toHaveTextContent(`Room ${cap}`);
    const list = cards(root)[0]?.parentElement;
    expect(list?.nextElementSibling).toHaveTextContent(text);
    expect(list?.nextElementSibling).toHaveClass("text-xs", "text-text-subtle");
  });

  test("no cap renders every room, and no note is asked for", () => {
    const asked = vi.fn(note);
    const root = body({ rooms: five, cap: null, overflowNote: asked });
    expect(cards(root)).toHaveLength(five.length);
    expect(asked).not.toHaveBeenCalled();
    expect(cards(root)[0]?.parentElement?.nextElementSibling).toBeNull();
  });

  test("a cap with no note function cuts the list and adds nothing", () => {
    const root = body({ rooms: five, cap: 2 });
    expect(cards(root)).toHaveLength(2);
    expect(cards(root)[0]?.parentElement?.nextElementSibling).toBeNull();
  });

  test("a note function that answers null adds nothing", () => {
    const root = body({ rooms: five, cap: 9, overflowNote: () => null });
    expect(cards(root)).toHaveLength(five.length);
    expect(cards(root)[0]?.parentElement?.nextElementSibling).toBeNull();
  });

  test("no rooms renders no list and no block", () => {
    expect(body({ rooms: [] })).toBeEmptyDOMElement();
  });

  test("a cap of zero renders no empty list, and the note still follows", () => {
    const root = body({ rooms: five, cap: 0, overflowNote: note });
    expect(root.querySelector("ul")).toBeNull();
    expect(root).toHaveTextContent("5 past 0");
  });
});

describe("the room card", () => {
  test("a room shows its name, kind, floor, times, setup and dimensions", () => {
    const head = header(body());
    expect(head).toHaveTextContent("Grand Ballroom");
    expect(head).toHaveTextContent(ROOM_KIND_LABEL.gs);
    expect(head).toHaveTextContent("Level 2");
    expect(head).toHaveTextContent("Classroom for 200");
    expect(head).toHaveTextContent("60 x 40 ft");
    const times = within(head).getByTestId(`${PREFIX}-room-0-times`);
    expect(times).toHaveTextContent("Set10/20 @ 8a");
    expect(times).toHaveTextContent("Show10/21 @ 9a");
    expect(times).toHaveTextContent("Strike10/22 @ 6p");
  });

  test.each([
    ["gs", "General session"],
    ["breakout", "Breakout"],
    ["additional", "Additional"],
  ] as const)("kind %s reads %s", (kind, label) => {
    expect(header(body({ rooms: [room({ kind })] }))).toHaveTextContent(label);
  });

  test("fields a room card never shows stay off it", () => {
    premiseHolds("the fixture carries the power field", hasContent(FULL_ROOM.power));
    const root = body();
    expect(root).not.toHaveTextContent(FULL_ROOM.power as string);
    expect(root).not.toHaveTextContent(FULL_ROOM.digital_signage as string);
    expect(root).not.toHaveTextContent(FULL_ROOM.notes as string);
  });

  test("the test ids take the prefix, and the scope key stays unprefixed", () => {
    const root = body({ testIdPrefix: "crew-panel" });
    expect(within(root).getByTestId("crew-panel-room-0-header")).toBeInTheDocument();
    expect(within(root).getByTestId("crew-panel-room-0-times")).toBeInTheDocument();
    expect(within(root).getByTestId("crew-panel-room-0-scope")).toBeInTheDocument();
    expect(root.querySelector(`[data-testid^="${PREFIX}"]`)).toBeNull();
    expect(within(root).getAllByTestId("room-scope-key")).toHaveLength(ROOM_SCOPE.length);
  });

  test("the room index keys each room's test ids", () => {
    const root = body({ rooms: [room(), room({ name: "Salon B" })] });
    expect(header(root, 1)).toHaveTextContent("Salon B");
  });
});

describe("a header field that holds no text", () => {
  const BLANK_FIELDS = [
    ["floor", "Level 2"],
    ["setup", "Setup"],
    ["dimensions", "Room Dimensions"],
    ["set_time", "Set1"],
    ["show_time", "Show1"],
    ["strike_time", "Strike1"],
  ] as const;

  test.each(BLANK_FIELDS)("a blank %s renders no line", (key, text) => {
    premiseHolds(
      "the full room shows the line",
      header(body()).textContent?.includes(text) === true,
    );
    for (const value of [null, "", "   "]) {
      expect(header(body({ rooms: [room({ [key]: value })] }))).not.toHaveTextContent(text);
      cleanup();
    }
  });

  test("a discipline that holds no text reads as the placeholder, not blank", () => {
    const root = body({ rooms: [room({ audio: "   " })] });
    const row = scopeRows(root).find((r) => r.textContent?.startsWith("Audio"));
    expect(row && scopeValue(row)).toBe(ROOM_SCOPE_UNSPECIFIED);
  });
});

describe("the rule under the room name", () => {
  const NO_BODY = {
    setup: null,
    dimensions: null,
    set_time: null,
    show_time: null,
    strike_time: null,
  };
  const nameRow = (root: HTMLElement) =>
    within(header(root)).getByText("Grand Ballroom").parentElement;

  test("a name with nothing under it has no rule", () => {
    expect(nameRow(body({ rooms: [room(NO_BODY)] }))).not.toHaveClass("border-b");
  });

  test.each([
    ["a time", { set_time: "10/20 @ 8a" }],
    ["a setup", { setup: "Classroom" }],
    ["dimensions", { dimensions: "60 x 40 ft" }],
  ])("%s alone is enough for the rule", (_name, field) => {
    expect(nameRow(body({ rooms: [room({ ...NO_BODY, ...field })] }))).toHaveClass("border-b");
  });
});

describe("roomName", () => {
  test("the default names a blank room Room", () => {
    const head = header(body({ rooms: [room({ name: "" })] }));
    expect(within(head).getByText("Room")).toHaveClass("text-text-strong");
    expect(head).not.toHaveTextContent("Grand Ballroom");
  });

  test("a given function names every room, the blank one included", () => {
    const roomName = (r: RoomRow) => `<${r.name || r.kind}>`;
    const root = body({ rooms: [room(), room({ name: "", kind: "breakout" })], roomName });
    expect(header(root, 0)).toHaveTextContent("<Grand Ballroom>");
    expect(header(root, 1)).toHaveTextContent("<breakout>");
  });
});

describe("nameAs", () => {
  const nameClasses = ["wrap-break-word", "text-sm", "font-semibold", "text-text-strong"];

  test("the default is a span, not a heading", () => {
    const root = body();
    expect(root.querySelector("h4")).toBeNull();
    expect(within(header(root)).getByText("Grand Ballroom").tagName).toBe("SPAN");
    expect(within(header(root)).getByText("Grand Ballroom")).toHaveClass(...nameClasses);
  });

  test('"h4" makes the name a heading with the same classes', () => {
    const name = within(body({ nameAs: "h4" })).getByRole("heading", { level: 4 });
    expect(name).toHaveTextContent("Grand Ballroom");
    expect(name).toHaveClass(...nameClasses);
  });
});

describe("navAnchors", () => {
  const two = [room(), room({ name: "Salon B" })];

  test("the default emits each room's index for the admin's room rail", () => {
    const list = cards(body({ rooms: two }));
    expect(list.map((c) => c.getAttribute("data-room-nav"))).toEqual(["0", "1"]);
  });

  test("off emits none", () => {
    const root = body({ rooms: two, navAnchors: false });
    premise("both rooms render", cards(root).length, 1);
    expect(root.querySelector("[data-room-nav]")).toBeNull();
  });
});

describe("sentinels", () => {
  const HEADER_FIELDS = [
    ["set_time", "Set"],
    ["show_time", "Show"],
    ["strike_time", "Strike"],
    ["setup", "Setup"],
    ["dimensions", "Room Dimensions"],
  ] as const;

  test.each(HEADER_FIELDS)('"show" keeps a %s of TBD as parsed', (key, label) => {
    const head = header(body({ rooms: [room({ [key]: "TBD" })] }));
    expect(head).toHaveTextContent(label);
    expect(head).toHaveTextContent("TBD");
  });

  test.each(HEADER_FIELDS)('"hide" omits a %s of TBD and keeps the rest', (key, label) => {
    const head = header(body({ rooms: [room({ [key]: "TBD" })], sentinels: "hide" }));
    expect(head).not.toHaveTextContent("TBD");
    expect(head.textContent).not.toMatch(new RegExp(`${label}(?![a-z ])`));
    for (const [otherKey, otherLabel] of HEADER_FIELDS) {
      if (otherKey === key) continue;
      expect(head).toHaveTextContent(otherLabel);
      expect(head).toHaveTextContent(FULL_ROOM[otherKey] as string);
    }
  });

  test('"show" keeps a floor of N/A, and "hide" omits it', () => {
    const rooms = [room({ floor: "N/A" })];
    expect(header(body({ rooms }))).toHaveTextContent("N/A");
    expect(header(body({ rooms, sentinels: "hide" }))).not.toHaveTextContent("N/A");
  });

  test.each(["TBD", "N/A", "TBA", "-", "—", " tbd "])('"hide" omits a setup of %j', (setup) => {
    const head = header(body({ rooms: [room({ setup })], sentinels: "hide" }));
    expect(head).not.toHaveTextContent("Setup");
  });

  test('"hide" keeps a time that only contains a sentinel, as written', () => {
    const rooms = [room({ show_time: "10/20 @ TBD" })];
    expect(header(body({ rooms, sentinels: "hide" }))).toHaveTextContent("Show10/20 @ TBD");
  });

  test('"hide" leaves the scope rows to dropEmpty', () => {
    const root = body({ rooms: [room({ audio: "TBD" })], sentinels: "hide" });
    expect(scopeLabels(root)).toContain("Audio");
  });

  test('with every header field a sentinel, "hide" leaves the name and no divider', () => {
    const rooms = [
      room({
        floor: "TBD",
        setup: "TBD",
        dimensions: "TBD",
        set_time: "TBD",
        show_time: "TBD",
        strike_time: "TBD",
      }),
    ];
    const root = body({ rooms, sentinels: "hide" });
    expect(root.querySelector(`[data-testid="${PREFIX}-room-0-times"]`)).toBeNull();
    const nameRow = within(header(root)).getByText("Grand Ballroom").parentElement;
    expect(nameRow).not.toHaveClass("border-b");
    expect(header(body({ rooms })).querySelector(".border-b")).not.toBeNull();
  });
});

describe("dropEmpty", () => {
  /** Each value a discipline can parse to that is not gear, with the arm that catches it. */
  const NOT_GEAR: ReadonlyArray<[string, string | null]> = [
    ["null", null],
    ["blank", ""],
    ["spaces", "   "],
    ["a sentinel only the crew's rule reads", "TBD"],
    ["a dash only the crew's rule reads", "-"],
    ["an em dash only the crew's rule reads", "—"],
    ["TBA, only the crew's rule", "TBA"],
    ["N/A, both rules", "N/A"],
    ["a parsed placeholder only the admin's rule reads", "Not specified"],
    ["the same with loose spacing and case", " not  specified "],
    ["NA, only the admin's rule", "NA"],
    ["lower case n/a", "n/a"],
  ];

  test.each(NOT_GEAR)("off keeps a row for %s", (_name, value) => {
    const root = body({ rooms: [room({ audio: value })] });
    expect(scopeLabels(root)).toContain("Audio");
  });

  test("off reads an unparsed discipline as the placeholder", () => {
    const root = body({ rooms: [room({ audio: null })] });
    const row = scopeRows(root).find((r) => r.textContent?.startsWith("Audio"));
    expect(row && scopeValue(row)).toBe(ROOM_SCOPE_UNSPECIFIED);
  });

  test.each(NOT_GEAR)("on removes a row for %s and keeps the real ones", (_name, value) => {
    const root = body({ rooms: [room({ audio: value })], dropEmpty: true });
    expect(scopeLabels(root)).toEqual(["Video", "Lighting", "Scenic", "Other"]);
    expect(root).not.toHaveTextContent(ROOM_SCOPE_UNSPECIFIED);
  });

  test("on keeps a real value, whatever it contains", () => {
    const root = body({
      rooms: [room({ audio: "N/A for the keynote, see Video" })],
      dropEmpty: true,
    });
    expect(scopeLabels(root)).toContain("Audio");
  });

  test.each(NOT_GEAR)("the one predicate drops %s", (_name, value) => {
    expect(isDroppedScopeValue(hasContent(value) ? value : null)).toBe(true);
  });

  test("the one predicate keeps gear", () => {
    expect(isDroppedScopeValue("Two wireless handhelds")).toBe(false);
  });

  describe("a room left with no scope", () => {
    const rooms = [room(allScope("Not specified"))];

    test("renders no list, and keeps the room's name and kind", () => {
      const root = body({ rooms, dropEmpty: true });
      expect(scopeList(root)).toBeNull();
      expect(header(root)).toHaveTextContent("Grand Ballroom");
      expect(header(root)).toHaveTextContent(ROOM_KIND_LABEL.gs);
    });

    test("its header drops the divider rows", () => {
      const root = body({ rooms, dropEmpty: true });
      expect(header(root).querySelector(".border-b")).toBeNull();
      expect(header(root).querySelector(".pb-2\\.5")).toBeNull();
    });

    test("off, the list and both dividers stay", () => {
      const root = body({ rooms });
      expect(scopeRows(root)).toHaveLength(ROOM_SCOPE.length);
      expect(header(root).querySelectorAll(".border-b")).toHaveLength(2);
    });

    test("a room that keeps one discipline keeps the list and both dividers", () => {
      const root = body({ rooms: [room({ ...allScope(null), other: "Gear" })], dropEmpty: true });
      expect(scopeLabels(root)).toEqual(["Other"]);
      expect(header(root).querySelectorAll(".border-b")).toHaveLength(2);
    });
  });
});

describe("scope order", () => {
  test("real gear sorts above the empty rows, each group in sheet order", () => {
    const root = body({ rooms: [room({ audio: "N/A", video: null, scenic: "Not specified" })] });
    expect(scopeLabels(root)).toEqual(["Lighting", "Other", "Audio", "Video", "Scenic"]);
  });
});

describe("chipTone", () => {
  /** A row's icon chip: the cell before its key. */
  const chip = (row: HTMLElement) =>
    within(row).getByTestId("room-scope-key").previousElementSibling as HTMLElement;

  test("the default gives each discipline its own hue, as the admin's review reads them", () => {
    const hues = scopeRows(body()).map((row) => chip(row).style.color);
    premise("the room renders disciplines", hues.length, 1);
    expect(new Set(hues).size).toBe(hues.length);
    for (const hue of hues) expect(hue).not.toBe("");
  });

  test("neutral drops every hue and rests at the subtle tone", () => {
    const rows = scopeRows(body({ chipTone: "neutral" }));
    premise("the room renders disciplines", rows.length, 1);
    for (const row of rows) {
      expect(chip(row).style.color, row.textContent ?? "").toBe("");
      expect(chip(row), row.textContent ?? "").toHaveClass("text-text-subtle");
    }
  });
});

describe("headerTone", () => {
  const setupValue = (root: HTMLElement) => within(header(root)).getByText(FULL_ROOM.setup!);
  const floor = (root: HTMLElement) => within(header(root)).getByText(FULL_ROOM.floor!);

  test("muted, the default: the admin's caption tone on the floor and the setup", () => {
    const root = body();
    expect(floor(root).className).toBe("ml-auto text-xs text-text-subtle");
    expect(setupValue(root).className).toBe("wrap-break-word text-xs text-text-subtle");
  });

  test("body: both clear the sunlight floor on the room's tint", () => {
    const root = body({ headerTone: "body" });
    expect(floor(root)).toHaveClass("text-text");
    expect(floor(root)).not.toHaveClass("text-text-subtle");
    expect(setupValue(root)).toHaveClass("text-text");
    expect(setupValue(root)).not.toHaveClass("text-text-subtle");
  });
});

describe("scopeLayout", () => {
  const FIXED_TRACKS = "grid-cols-[1.5rem_5rem_minmax(0,1fr)]";
  const valueOf = (row: HTMLElement) =>
    within(row).getByTestId("room-scope-key").nextElementSibling as HTMLElement;

  test("the default holds the three tracks on every row, whatever the width", () => {
    const root = body({ emphasize: new Set<RoomScopeKey>(["audio"]) });
    premise("the room renders disciplines", scopeRows(root).length, 1);
    for (const row of scopeRows(root)) {
      expect(row, row.textContent ?? "").toHaveClass(FIXED_TRACKS);
      expect(valueOf(row)).not.toHaveClass("col-span-full");
    }
    expect(root.innerHTML).not.toContain("@min-");
  });

  test("fluid puts chip and key on a line and the value under them until the crew split", () => {
    const root = body({ scopeLayout: "fluid", emphasize: new Set<RoomScopeKey>(["audio"]) });
    const rows = scopeRows(root);
    premise("the room renders disciplines", rows.length, 1);
    premiseHolds(
      "both row shapes render",
      rows.some((r) => r.hasAttribute("data-emphasis")) &&
        rows.some((r) => !r.hasAttribute("data-emphasis")),
    );
    for (const row of rows) {
      const at = row.textContent ?? "";
      expect(row, at).not.toHaveClass(FIXED_TRACKS);
      expect(row, at).toHaveClass("grid-cols-[1.5rem_minmax(0,1fr)]");
      expect(row, at).toHaveClass(`@min-crew-split:${FIXED_TRACKS}`);
      expect(valueOf(row), at).toHaveClass("col-span-full");
      expect(valueOf(row), at).toHaveClass("@min-crew-split:col-span-1");
    }
  });
});

describe("emphasize", () => {
  const owned = new Set<RoomScopeKey>(["lighting"]);

  test("the default labels nothing and keeps the sheet's order", () => {
    const root = body();
    expect(scopeLabels(root)).toEqual(ROOM_SCOPE.map((s) => s.label));
    expect(root).not.toHaveTextContent(YOUR_SCOPE);
    expect(root.querySelector("[data-emphasis]")).toBeNull();
    expect(root.querySelector(".border-l-accent-on-bg")).toBeNull();
  });

  test("an empty set is the default", () => {
    const root = body({ emphasize: new Set() });
    expect(root).not.toHaveTextContent(YOUR_SCOPE);
    expect(scopeLabels(root)).toEqual(ROOM_SCOPE.map((s) => s.label));
  });

  test("the viewer's discipline leads, labeled, and every discipline stays", () => {
    const others = ROOM_SCOPE.filter((s) => !owned.has(s.key));
    premise(
      "the fixture has a discipline the viewer does not own, with gear",
      others.filter((s) => hasContent(FULL_ROOM[s.key])).length,
      0,
    );
    const root = body({ emphasize: owned });
    expect(scopeLabels(root)).toEqual(["Lighting", "Audio", "Video", "Scenic", "Other"]);
    expect(emphasizedLabels(root)).toEqual(["Lighting"]);
    const [first, ...rest] = scopeRows(root);
    expect(first).toHaveTextContent(YOUR_SCOPE);
    expect(first).toHaveAttribute("data-emphasis", "you");
    expect(first).toHaveClass("border-l", "border-l-accent-on-bg");
    for (const row of rest) {
      expect(row).not.toHaveTextContent(YOUR_SCOPE);
      expect(row).not.toHaveAttribute("data-emphasis");
      expect(row).not.toHaveClass("border-l-accent-on-bg");
    }
  });

  test("the label sits above the row's own cells, in the row", () => {
    const [first] = scopeRows(body({ emphasize: owned }));
    expect(first?.firstElementChild).toHaveTextContent(YOUR_SCOPE);
    expect(first?.firstElementChild).toHaveClass("col-span-full", "text-accent-on-bg");
    expect(first?.children).toHaveLength(4);
  });

  test("the accent edge survives on the room's last row", () => {
    const only = room({ ...allScope(null), lighting: "Twelve moving heads" });
    const root = body({ rooms: [only], dropEmpty: true, emphasize: owned });
    const [row] = scopeRows(root);
    premiseHolds("the emphasized row is the only row", scopeRows(root).length === 1);
    expect(row?.className).not.toContain("last:border-0");
    expect(row).toHaveClass("last:border-b-0");
  });

  test("two owned disciplines keep the sheet's order, ahead of the rest", () => {
    const root = body({ emphasize: new Set<RoomScopeKey>(["video", "audio"]) });
    expect(scopeLabels(root)).toEqual(["Audio", "Video", "Lighting", "Scenic", "Other"]);
    expect(emphasizedLabels(root)).toEqual(["Audio", "Video"]);
  });

  test("the partition runs after the empty sort: an owned empty row still leads", () => {
    const rooms = [room({ lighting: "N/A" })];
    expect(scopeLabels(body({ rooms }))).toEqual(["Audio", "Video", "Scenic", "Other", "Lighting"]);
    expect(scopeLabels(body({ rooms, emphasize: owned }))).toEqual([
      "Lighting",
      "Audio",
      "Video",
      "Scenic",
      "Other",
    ]);
  });

  test("an owned discipline with no gear drops like any other", () => {
    const root = body({ rooms: [room({ lighting: "TBD" })], dropEmpty: true, emphasize: owned });
    expect(scopeLabels(root)).toEqual(["Audio", "Video", "Scenic", "Other"]);
    expect(root).not.toHaveTextContent(YOUR_SCOPE);
  });

  test("every room of the list is emphasized on its own", () => {
    const root = body({ rooms: [room(), room({ name: "Salon B" })], emphasize: owned });
    expect(scopeLabels(root, 0)[0]).toBe("Lighting");
    expect(scopeLabels(root, 1)[0]).toBe("Lighting");
  });
});

describe("roomScopeRows", () => {
  test("is the list the body renders, for any options", () => {
    const options = { dropEmpty: true, emphasize: new Set<RoomScopeKey>(["video"]) };
    const source = room({ audio: "TBD", scenic: "Not specified" });
    const root = body({ rooms: [source], ...options });
    expect(scopeLabels(root)).toEqual(roomScopeRows(source, options).map((r) => r.label));
    expect(roomScopeRows(source, options).map((r) => r.value)).toEqual([
      FULL_ROOM.video,
      FULL_ROOM.lighting,
      FULL_ROOM.other,
    ]);
    expect(roomScopeRows(source, options).map((r) => r.emphasized)).toEqual([true, false, false]);
  });
});

describe("targets", () => {
  const LINES = {
    name: "t-name",
    floor: "t-floor",
    set_time: "t-set",
    show_time: "t-show",
    strike_time: "t-strike",
    setup: "t-setup",
    dimensions: "t-dimensions",
    audio: "t-audio",
    video: "t-video",
    lighting: "t-lighting",
    scenic: "t-scenic",
    other: "t-other",
  } as const;

  const target = (root: HTMLElement, id: string) =>
    root.querySelector<HTMLElement>(`[data-search-target="${id}"]`);

  test("no marker renders without them, whatever the other crew props", () => {
    const root = body({
      sentinels: "hide",
      dropEmpty: true,
      emphasize: new Set<RoomScopeKey>(["audio"]),
      nameAs: "h4",
      navAnchors: false,
      cap: 0,
      overflowNote: () => "note",
    });
    expect(
      root.querySelector("[data-search-target],[data-search-skip],[data-search-group]"),
    ).toBeNull();
    const rendered = body({ emphasize: new Set<RoomScopeKey>(["audio"]) });
    expect(
      rendered.querySelector("[data-search-target],[data-search-skip],[data-search-group]"),
    ).toBeNull();
  });

  test("each line's element carries its id", () => {
    const root = body({ targets: [LINES] });
    expect(target(root, "t-name")).toHaveTextContent(/^Grand Ballroom$/);
    expect(target(root, "t-floor")).toHaveTextContent(/^Level 2$/);
    expect(target(root, "t-set")).toHaveTextContent(/^Set10\/20 @ 8a$/);
    expect(target(root, "t-show")).toHaveTextContent(/^Show10\/21 @ 9a$/);
    expect(target(root, "t-strike")).toHaveTextContent(/^Strike10\/22 @ 6p$/);
    expect(target(root, "t-setup")).toHaveTextContent(/^SetupClassroom for 200$/);
    expect(target(root, "t-dimensions")).toHaveTextContent(/^Room Dimensions60 x 40 ft$/);
    expect(target(root, "t-audio")).toHaveTextContent(/^AudioL-Acoustics K2 x 8$/);
    expect(target(root, "t-video")).toHaveTextContent(/^VideoBarco UDX x 2$/);
    expect(target(root, "t-lighting")).toHaveTextContent(/^LightingTwelve moving heads$/);
    expect(target(root, "t-scenic")).toHaveTextContent(/^ScenicStep and repeat$/);
    expect(target(root, "t-other")).toHaveTextContent(/^OtherTwo confidence monitors$/);
  });

  test("a room's targets go to that room, by its place in the list", () => {
    const root = body({
      rooms: [room(), room({ name: "Salon B" })],
      targets: [{ name: "first" }, { name: "second" }],
    });
    expect(target(root, "first")).toHaveTextContent("Grand Ballroom");
    expect(target(root, "second")).toHaveTextContent("Salon B");
  });

  test("the kind pill, the label and the note are skipped", () => {
    const root = body({
      rooms: [room(), room({ name: "Salon B" })],
      cap: 1,
      overflowNote: () => "one more",
      emphasize: new Set<RoomScopeKey>(["audio"]),
      targets: [LINES],
    });
    const skipped = [...root.querySelectorAll("[data-search-skip]")].map((s) => s.textContent);
    expect(skipped).toEqual(expect.arrayContaining([ROOM_KIND_LABEL.gs, YOUR_SCOPE, "one more"]));
    expect(skipped).toHaveLength(3);
  });

  test("a line with no id is skipped, so no text goes uncovered", () => {
    const root = body({ targets: [{ name: "t-name" }] });
    expect(root.querySelectorAll("[data-search-target]")).toHaveLength(1);
    const skipped = [...root.querySelectorAll("[data-search-skip]")].map((s) => s.textContent);
    expect(skipped).toContain("Level 2");
    expect(skipped).toContain("Set10/20 @ 8a");
    expect(skipped).toContain("SetupClassroom for 200");
    expect(skipped).toContain("AudioL-Acoustics K2 x 8");
  });

  test("a room past the end of the list has nothing to mark and is skipped", () => {
    const root = body({ rooms: [room(), room({ name: "Salon B" })], targets: [LINES] });
    expect(within(header(root, 1)).getByText("Salon B")).toHaveAttribute("data-search-skip");
  });

  test("the markers pass the parity harness, the viewer's scope carried as context", () => {
    const group = "Rooms & scope";
    const line = (
      id: string,
      label: string | null,
      value: string,
      context: string[],
    ): SearchEntry => ({ id, section: "rooms", group, label, value, context, copy: null });
    const name = FULL_ROOM.name;
    const entries: SearchEntry[] = [
      line(LINES.name, null, name, []),
      line(LINES.floor, null, FULL_ROOM.floor as string, [name]),
      line(LINES.set_time, "Set", FULL_ROOM.set_time as string, [name]),
      line(LINES.show_time, "Show", FULL_ROOM.show_time as string, [name]),
      line(LINES.strike_time, "Strike", FULL_ROOM.strike_time as string, [name]),
      line(LINES.setup, "Setup", FULL_ROOM.setup as string, [name]),
      line(LINES.dimensions, "Room Dimensions", FULL_ROOM.dimensions as string, [name]),
      line(LINES.audio, "Audio", FULL_ROOM.audio as string, [name, YOUR_SCOPE]),
      line(LINES.video, "Video", FULL_ROOM.video as string, [name]),
      line(LINES.lighting, "Lighting", FULL_ROOM.lighting as string, [name]),
      line(LINES.scenic, "Scenic", FULL_ROOM.scenic as string, [name]),
      line(LINES.other, "Other", FULL_ROOM.other as string, [name]),
    ];
    const { container } = render(
      <section>
        <div data-card-id="gear-room-details">
          <h3 data-search-group="">{group}</h3>
          {RoomsBody({
            rooms: [FULL_ROOM],
            cap: null,
            testIdPrefix: PREFIX,
            nameAs: "h4",
            sentinels: "hide",
            dropEmpty: true,
            navAnchors: false,
            emphasize: new Set<RoomScopeKey>(["audio"]),
            targets: [LINES],
          })}
        </div>
      </section>,
    );
    expect(assertParity(container.firstElementChild as Element, entries)).toEqual([]);
  });
});
