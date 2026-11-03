// @vitest-environment jsdom
/**
 * tests/components/show-panels/transportBody.test.tsx
 * (crew page redesign PR B plan, Task 8; spec
 * docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md §6.1 lines
 * 292-293, §6.2 `transport` row, line 308)
 *
 * The transport body is the admin's compact `TransportBody`, shared: the
 * Driver / Load out / Vehicle / Parking cells, the Route timeline of the
 * schedule legs, and the notes. A shared body never builds a `tel:` or
 * `mailto:` href itself (spec line 292): it takes `telHref` and `mailtoHref`,
 * and renders plain text when a builder returns null or the surface does not
 * linkify. It takes `hideDates` and the leg-time formatter, so each surface
 * words a leg's time line its own way: the admin joins `[date, time]` as it does
 * at 7e927e927 (components/admin/wizard/step3ReviewSections.tsx:1473); the crew
 * page's "leaves" line lands with its Transport section (plan Task 9).
 *
 * The admin rendering is pinned byte for byte by the Task 1 golden
 * (tests/components/admin/wizard/adminSectionDom.test.tsx) and asserted nowhere
 * else. The last block proves only that the admin renders THROUGH this body,
 * with the props that describe what it renders today.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { TransportBreakdown } from "@/components/admin/wizard/step3ReviewSections";
import {
  TransportBody,
  transportRouteLegs,
  type TransportBodyProps,
} from "@/components/show-panels/TransportBody";
import * as transportBodyModule from "@/components/show-panels/TransportBody";
import type { TransportationRow } from "@/lib/parser/types";
import { premise, premiseHolds } from "@/tests/_shared/premise";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Every field the body can show, each non-empty (the flags' premises read it). */
const TRANSPORT: TransportationRow = {
  driver_name: "Pat Rivera",
  driver_phone: "+1 (555) 010-2030",
  driver_email: "pat@example.com",
  loadout_name: "Sam Oduya",
  loadout_phone: "555.010.9988",
  loadout_email: "sam@example.com",
  vehicle: "Sprinter van",
  license_plate: "7ABC123",
  color: "White",
  parking: "Lot B, permit 4471",
  schedule: [
    { stage: "Load in", date: "2026-04-10", time: "7:00 AM", assigned_names: ["Pat Rivera"] },
    { stage: "Load out", date: "2026-04-12", time: "11:00 PM", assigned_names: [] },
  ],
  notes: "Call 30 min ahead",
};

const PHONES = [TRANSPORT.driver_phone, TRANSPORT.loadout_phone] as string[];
const EMAILS = [TRANSPORT.driver_email, TRANSPORT.loadout_email] as string[];

/** Probe builders: their output names its input, so an href is traceable to the builder. */
const probeTel = (phone: string): string => `tel:probe-${phone.replace(/\D/g, "")}`;
const probeMail = (email: string): string => `mailto:probe-${email}`;
const probeLegTime = (date: string | null, time: string | null): string =>
  `when[${date ?? "-"}|${time ?? "-"}]`;

const BASE: TransportBodyProps = {
  transport: TRANSPORT,
  telHref: probeTel,
  mailtoHref: probeMail,
  linkifyContacts: true,
  hideDates: false,
  legTime: probeLegTime,
  sentinels: "show",
};

/** The body called as a plain function (it is hook-free), then rendered. */
function body(over: Partial<TransportBodyProps> = {}): HTMLElement {
  const { container } = render(TransportBody({ ...BASE, ...over }));
  const root = container.firstElementChild;
  premiseHolds("the body rendered a root element", root instanceof HTMLElement);
  return root as HTMLElement;
}

const hrefs = (root: HTMLElement, scheme: string) =>
  [...root.querySelectorAll(`a[href^="${scheme}"]`)].map((a) => a.getAttribute("href"));

describe("TransportBody contact links (spec line 292)", () => {
  test("linkifyContacts: phones and emails are links only when the surface linkifies; their text stays", () => {
    premise("phones in the fixture", PHONES.length, 1);
    premise("emails in the fixture", EMAILS.length, 1);
    const on = body({ linkifyContacts: true });
    expect(hrefs(on, "tel:")).toHaveLength(2);
    expect(hrefs(on, "mailto:")).toHaveLength(2);
    cleanup();
    const off = body({ linkifyContacts: false });
    expect(off.querySelectorAll("a")).toHaveLength(0);
    for (const value of [...PHONES, ...EMAILS]) expect(off).toHaveTextContent(value);
  });

  test("telHref and mailtoHref: each href is the surface builder's output, never the body's", () => {
    const probe = body();
    expect(hrefs(probe, "tel:")).toEqual(PHONES.map(probeTel));
    expect(hrefs(probe, "mailto:")).toEqual(EMAILS.map(probeMail));
    cleanup();
    // A second pair of builders: the hrefs follow the prop.
    const other = body({
      telHref: (p) => `tel:other-${p.length}`,
      mailtoHref: (e) => `mailto:other-${e.length}`,
    });
    expect(hrefs(other, "tel:")).toEqual(PHONES.map((p) => `tel:other-${p.length}`));
    expect(hrefs(other, "mailto:")).toEqual(EMAILS.map((e) => `mailto:other-${e.length}`));
  });

  test("a builder returning null renders that value as plain text; the others stay links", () => {
    const root = body({
      telHref: (p) => (p === TRANSPORT.driver_phone ? null : probeTel(p)),
      mailtoHref: (e) => (e === TRANSPORT.loadout_email ? null : probeMail(e)),
    });
    expect(hrefs(root, "tel:")).toEqual([probeTel(TRANSPORT.loadout_phone as string)]);
    expect(hrefs(root, "mailto:")).toEqual([probeMail(TRANSPORT.driver_email as string)]);
    expect(root).toHaveTextContent(TRANSPORT.driver_phone as string);
    expect(root).toHaveTextContent(TRANSPORT.loadout_email as string);
  });
});

describe("TransportBody route legs: hideDates and the leg-time formatter", () => {
  const whenLines = (root: HTMLElement) =>
    [...root.querySelectorAll("ol > li")].map((li) => li.textContent);

  test("each leg's time line is the formatter's output for its date and time", () => {
    premise("legs in the fixture", TRANSPORT.schedule.length, 1);
    const root = body();
    const lines = whenLines(root);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("when[2026-04-10|7:00 AM]");
    expect(lines[1]).toContain("when[2026-04-12|11:00 PM]");
    cleanup();
    // A second formatter: the line follows the prop.
    const other = body({ legTime: (d, t) => `leaves ${d} at ${t}` });
    expect(whenLines(other)[0]).toContain("leaves 2026-04-10 at 7:00 AM");
  });

  test("hideDates: the formatter never receives a date, and no leg date renders", () => {
    premiseHolds(
      "every fixture leg carries a date",
      TRANSPORT.schedule.every((l) => l.date !== null),
    );
    const legTime = vi.fn(probeLegTime);
    const root = body({ hideDates: true, legTime });
    premise("formatter calls", legTime.mock.calls.length, 0);
    expect(legTime.mock.calls.map(([date]) => date)).toEqual([null, null]);
    expect(legTime.mock.calls.map(([, time]) => time)).toEqual(["7:00 AM", "11:00 PM"]);
    expect(root.outerHTML).not.toContain("2026-04-1");
    expect(whenLines(root)[0]).toContain("when[-|7:00 AM]");
    cleanup();
    const shown = vi.fn(probeLegTime);
    body({ hideDates: false, legTime: shown });
    expect(shown.mock.calls.map(([date]) => date)).toEqual(["2026-04-10", "2026-04-12"]);
  });

  test("a leg without a stage is not on the route, and transportRouteLegs lists exactly the rendered legs", () => {
    const transport: TransportationRow = {
      ...TRANSPORT,
      schedule: [
        ...TRANSPORT.schedule,
        { stage: "  ", date: "2026-04-11", time: null, assigned_names: [] },
      ],
    };
    const root = body({ transport });
    expect(whenLines(root)).toHaveLength(2);
    expect(root).not.toHaveTextContent("2026-04-11");
    for (const sentinels of ["show", "hide"] as const) {
      const legs = transportRouteLegs(transport, { ...BASE, sentinels });
      cleanup();
      expect(whenLines(body({ transport, sentinels })), sentinels).toHaveLength(legs.length);
    }
  });
});

describe("TransportBody sentinels (spec line 293)", () => {
  const SENTINEL: TransportationRow = {
    ...TRANSPORT,
    driver_phone: "TBD",
    loadout_email: "N/A",
    license_plate: "TBD",
    parking: "TBA",
    notes: "N/A",
    schedule: [
      { stage: "Load in", date: "TBD", time: "7:00 AM", assigned_names: ["TBD", "Pat Rivera"] },
      { stage: "TBD", date: "2026-04-12", time: null, assigned_names: [] },
    ],
  };

  test('"show" renders each sentinel as parsed, the plate and colour muted, as the admin does today', () => {
    const root = body({ transport: SENTINEL, sentinels: "show" });
    const plate = within(root).getByText("TBD", { selector: "span.text-text-faint" });
    expect(plate).toBeInTheDocument();
    expect(root).toHaveTextContent("TBA");
    expect(hrefs(root, "tel:")).toContain(probeTel("TBD"));
    expect(root.querySelectorAll("ol > li")).toHaveLength(2);
  });

  test('"hide" omits each sentinel field, sentinel-staged leg and sentinel rider, and keeps the real ones', () => {
    const legTime = vi.fn(probeLegTime);
    const root = body({ transport: SENTINEL, sentinels: "hide", legTime });
    for (const sentinel of ["TBD", "TBA", "N/A"]) expect(root).not.toHaveTextContent(sentinel);
    // The driver's sentinel phone is no link and no text; the load out's real one still links.
    expect(hrefs(root, "tel:")).toEqual([probeTel(TRANSPORT.loadout_phone as string)]);
    expect(hrefs(root, "mailto:")).toEqual([probeMail(TRANSPORT.driver_email as string)]);
    // The "TBD"-staged leg is off the route; the kept leg's sentinel date reaches the formatter as null.
    expect(root.querySelectorAll("ol > li")).toHaveLength(1);
    expect(legTime.mock.calls).toEqual([[null, "7:00 AM"]]);
    expect(root).toHaveTextContent("Pat Rivera");
    expect(root).toHaveTextContent("Sprinter van");
    expect(root).toHaveTextContent("White");
  });
});

describe("the admin renders transport through the shared body (spec line 289)", () => {
  test("TransportBreakdown calls TransportBody with today's admin props", () => {
    const spy = vi
      .spyOn(transportBodyModule, "TransportBody")
      .mockImplementation(() => <div data-testid="probe-transport" />);
    render(<TransportBreakdown dfid="drive-1" transportation={TRANSPORT} />);
    expect(screen.getByTestId("probe-transport")).toBeInTheDocument();
    premise("the body's call count", spy.mock.calls.length, 0);
    const p = spy.mock.calls[0]![0];
    expect(p.transport).toBe(TRANSPORT);
    expect(p).toMatchObject({ linkifyContacts: true, hideDates: false, sentinels: "show" });
    // ContactCell's digits-and-plus rule (step3ReviewSections.tsx:1526 at 7e927e927).
    expect(p.telHref("+1 (555) 010-2030")).toBe("tel:+15550102030");
    expect(p.telHref("555.010.9988 x12")).toBe("tel:555010998812");
    expect(p.mailtoHref("pat@example.com")).toBe("mailto:pat@example.com");
    // The admin's leg time: `[date, time]` joined, blanks dropped (step3ReviewSections.tsx:1473 at 7e927e927).
    expect(p.legTime("2026-04-10", "7:00 AM")).toBe("2026-04-10 7:00 AM");
    expect(p.legTime(null, "7:00 AM")).toBe("7:00 AM");
    expect(p.legTime("2026-04-10", "  ")).toBe("2026-04-10");
    expect(p.legTime(null, null)).toBe("");
  });

  test("TransportBreakdown's count reads the body's leg list (transportRouteLegs)", () => {
    const probeLegs = Array.from({ length: 5 }, (_, i) => ({
      stage: `Stage ${i}`,
      when: "",
      names: [],
    }));
    vi.spyOn(transportBodyModule, "transportRouteLegs").mockReturnValue(probeLegs);
    vi.spyOn(transportBodyModule, "TransportBody").mockImplementation(() => <div />);
    const onlyLegs: TransportationRow = {
      driver_name: null,
      driver_phone: null,
      driver_email: null,
      loadout_name: null,
      loadout_phone: null,
      loadout_email: null,
      vehicle: null,
      license_plate: null,
      color: null,
      parking: null,
      schedule: [],
      notes: null,
    };
    render(<TransportBreakdown dfid="drive-1" transportation={onlyLegs} />);
    // No field rows and no real legs: the count is the probe list's length alone.
    expect(screen.getByRole("heading", { level: 4 })).toHaveTextContent("Transport (5)");
  });
});

describe("TransportBody crew props (PR B Task 9: the crew keeps exactly the fields it shows today)", () => {
  const routeItems = (root: HTMLElement) =>
    [...root.querySelectorAll("ol > li")].map((li) => (li.textContent ?? "").trim());

  test("stagelessLegs keep: a leg with no stage stays on the route with its time line and riders, a leg with nothing does not; the default drops both", () => {
    const transport: TransportationRow = {
      ...TRANSPORT,
      schedule: [
        ...TRANSPORT.schedule,
        { stage: "", date: "2026-04-11", time: "9:00 AM", assigned_names: ["Ann Lee"] },
        { stage: "", date: null, time: null, assigned_names: [] },
      ],
    };
    // A formatter that writes nothing for a leg with neither date nor time, as both
    // surfaces' formatters do (the probe formatter always writes its brackets).
    const legTime = (d: string | null, t: string | null) => [d, t].filter(Boolean).join(" ");
    const keep = body({ transport, stagelessLegs: "keep", sentinels: "hide", legTime });
    const items = routeItems(keep);
    expect(items).toHaveLength(3);
    expect(items[2]).toBe("2026-04-11 9:00 AMAnn Lee");
    expect(
      transportRouteLegs(transport, { ...BASE, legTime, sentinels: "hide", stagelessLegs: "keep" }),
    ).toHaveLength(3);
    cleanup();
    expect(routeItems(body({ transport, sentinels: "hide", legTime }))).toHaveLength(2);
  });

  test("targets: each cell, leg and the notes carry their own target; the avatars and the Route eyebrow are skipped; without targets no marker", () => {
    const targets = {
      driver: "t-driver",
      loadout: "t-loadout",
      vehicle: "t-vehicle",
      parking: "t-parking",
      legs: ["t-leg-0", "t-leg-1"],
      notes: "t-notes",
    };
    const root = body({ targets });
    const at = (id: string) => root.querySelector(`[data-search-target="${id}"]`);
    expect(at("t-driver")).toHaveTextContent(TRANSPORT.driver_name!);
    expect(at("t-loadout")).toHaveTextContent(TRANSPORT.loadout_name!);
    expect(at("t-vehicle")).toHaveTextContent(TRANSPORT.vehicle!);
    expect(at("t-parking")).toHaveTextContent(TRANSPORT.parking!);
    expect(at("t-leg-0")).toHaveTextContent("Load in");
    expect(at("t-leg-1")).toHaveTextContent("Load out");
    expect(at("t-notes")).toHaveTextContent(TRANSPORT.notes!);
    // Every avatar (its initials are not sheet text) and the Route eyebrow are skipped.
    const avatars = [...root.querySelectorAll('[aria-hidden="true"]')].filter(
      (el) => (el.textContent ?? "").trim().length > 0,
    );
    premise("avatars with initials", avatars.length, 0);
    for (const a of avatars) expect(a.closest("[data-search-skip]")).not.toBeNull();
    const route = [...root.querySelectorAll("p")].find((p) => p.textContent === "Route");
    expect(route?.closest("[data-search-skip]")).not.toBeNull();
    cleanup();
    expect(
      body().querySelector("[data-search-target], [data-search-skip], [data-search-group]"),
    ).toBeNull();
  });
});

describe("TransportBody route line spacing (PR B Task 9)", () => {
  test("a leg's first line takes no top margin: a stage-less crew leg's time line and a riders-only leg's names start at the top", () => {
    const transport: TransportationRow = {
      ...TRANSPORT,
      schedule: [
        { stage: "Load in", date: "2026-04-10", time: "7:00 AM", assigned_names: ["Ann Lee"] },
        { stage: "", date: "2026-04-11", time: "9:00 AM", assigned_names: ["Bo Diaz"] },
        { stage: "", date: null, time: null, assigned_names: ["Cy Ng"] },
      ],
    };
    const legTime = (d: string | null, t: string | null) => [d, t].filter(Boolean).join(" ");
    const root = body({ transport, stagelessLegs: "keep", sentinels: "hide", legTime });
    const stacks = [...root.querySelectorAll("ol > li")].map(
      (li) => [...(li.lastElementChild?.children ?? [])] as HTMLElement[],
    );
    premise("route legs", stacks.length, 2);
    for (const [i, lines] of stacks.entries()) {
      premise(`leg ${i} lines`, lines.length, 0);
      expect(lines[0]!.className, `leg ${i}: the first line`).not.toMatch(/\bmt-/);
      for (const later of lines.slice(1))
        expect(later.className, `leg ${i}: a later line`).toMatch(/\bmt-0\.5\b/);
    }
  });
});

/**
 * PR B invariant-8 UI gate rows 1, 2, 3, 8 and 16: the crew's transport props.
 * Each defaults to what the admin renders, so the admin's DOM (pinned by the
 * golden) is the default's output; each case shows the prop changes the output.
 */
describe("TransportBody crew presentation props (gate rows 1, 2, 3, 8, 16)", () => {
  /** Every class token on the element and its descendants. */
  const tokens = (root: Element) =>
    [root, ...root.querySelectorAll("*")].flatMap((el) =>
      (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean),
    );
  /** A viewport variant: `sm:` to `2xl:`, or an arbitrary `min-[…]:` / `max-[…]:`. */
  const VIEWPORT_VARIANT = /^(?:sm|md|lg|xl|2xl|min-\[[^\]]+\]|max-\[[^\]]+\]):/;
  const route = (root: HTMLElement) => root.querySelector("ol");
  /** The route's drawn dots: the round, aria-hidden markers, one per leg. */
  const dots = (root: HTMLElement) =>
    [...root.querySelectorAll('ol > li span[aria-hidden="true"]')].filter((el) =>
      (el.getAttribute("class") ?? "").includes("rounded-pill"),
    );
  /** The route's connector lines: the aria-hidden lines that are not dots. */
  const connectors = (root: HTMLElement) =>
    [...root.querySelectorAll('ol span[aria-hidden="true"]')].filter(
      (el) => !(el.getAttribute("class") ?? "").includes("rounded-pill"),
    );

  test('layout "container": no viewport variant in the body; the cells go to three columns and the route to a rail at @min-crew-split, a vertical list below it', () => {
    const viewport = body();
    // POSITIVE CONTROL: the admin's default carries the viewport variant the crew must not.
    premiseHolds(
      "the default layout carries a viewport variant",
      tokens(viewport).some((t) => VIEWPORT_VARIANT.test(t)),
    );
    expect(route(viewport)?.className).not.toContain("flex-col");
    cleanup();

    const root = body({ layout: "container" });
    premise("route legs", root.querySelectorAll("ol > li").length, 1);
    expect(tokens(root).filter((t) => VIEWPORT_VARIANT.test(t))).toEqual([]);
    const grid = root.querySelector(".grid");
    expect(grid?.className.split(/\s+/)).toContain("@min-crew-split:grid-cols-3");
    // The contact cells hold the 44px phone and email chips: below the threshold each
    // takes the full row, so a phone number never breaks mid-token in a half cell
    // (a 320 phone's half cell is narrower than "917-331-4885"); the one-line cells
    // still pair up.
    const cells = [...grid!.children] as HTMLElement[];
    const contactCells = cells.filter((c) => c.querySelector("a[href^='tel:']"));
    premise("contact cells", contactCells.length, 0);
    for (const cell of contactCells)
      expect(cell.className.split(/\s+/)).toEqual(
        expect.arrayContaining(["col-span-2", "@min-crew-split:col-span-1"]),
      );
    const plainCells = cells.filter((c) => !contactCells.includes(c));
    premise("one-line cells", plainCells.length, 0);
    for (const cell of plainCells) expect(cell.className).not.toContain("col-span-2");
    // POSITIVE CONTROL: the admin's cells never span.
    cleanup();
    expect(body().querySelector(".grid")!.innerHTML).not.toContain("col-span-2");
    const again = body({ layout: "container" });
    const ol = route(again)!.className.split(/\s+/);
    expect(ol).toContain("flex-col");
    expect(ol).toContain("@min-crew-split:flex-row");
    for (const li of again.querySelectorAll("ol > li")) {
      const cls = li.className.split(/\s+/);
      // A row (dot, then the leg's lines) below the threshold; a column on the rail.
      expect(cls).not.toContain("flex-col");
      expect(cls).toContain("@min-crew-split:flex-col");
    }
  });

  test('routeMarkers "neutral": every dot is the same bordered neutral, none is accent, and every connector is a border, which forced colors keep, never a fill', () => {
    const alternating = body();
    // POSITIVE CONTROL: the admin's dots alternate, the first an accent fill.
    expect(dots(alternating)[0]?.className).toContain("bg-accent-on-bg");
    expect(connectors(alternating).some((c) => /\bbg-border\b/.test(c.className))).toBe(true);
    cleanup();

    for (const layout of ["viewport", "container"] as const) {
      const root = body({ routeMarkers: "neutral", layout });
      const drawn = dots(root);
      premise(`${layout}: dots`, drawn.length, 1);
      for (const dot of drawn) {
        const cls = dot.className.split(/\s+/);
        expect(cls, layout).not.toContain("bg-accent-on-bg");
        expect(cls, layout).toContain("border-2");
        expect(cls, layout).toContain("border-border-strong");
      }
      const lines = connectors(root);
      premise(`${layout}: connectors`, lines.length, 0);
      for (const line of lines) {
        expect(line.className, layout).not.toMatch(/(?:^|\s)bg-/);
        expect(line.className, layout).toMatch(/(?:^|\s)border-(?:t|l)-2(?:\s|$)/);
      }
      cleanup();
    }
  });

  test('riders "with": the riders line reads "With" and the names, at text-xs, the names in text-text and never faint; the default is the names alone', () => {
    const riderLeg = TRANSPORT.schedule[0]!;
    premise("riders on the first leg", riderLeg.assigned_names.length, 0);
    const names = riderLeg.assigned_names.join(", ");
    const ridersLine = (root: HTMLElement) =>
      [...root.querySelectorAll("ol > li span")].find(
        (el) => el.children.length <= 1 && (el.textContent ?? "").endsWith(names),
      );

    const plain = ridersLine(body());
    expect(plain?.textContent).toBe(names);
    expect(plain?.className).toContain("text-text-faint");
    cleanup();

    const line = ridersLine(body({ riders: "with" }));
    expect(line?.textContent).toBe(`With ${names}`);
    const cls = line!.className.split(/\s+/);
    expect(cls).toContain("text-xs");
    expect(cls).not.toContain("text-text-faint");
    const named = [...line!.querySelectorAll("span")].find((s) => s.textContent === names);
    expect(named?.className.split(/\s+/)).toContain("text-text");
  });

  test("a formatter's dated line renders its date and time in a <time dateTime>, the lead-in outside it; a plain line renders no <time>", () => {
    const legTime = (date: string | null, time: string | null) =>
      date === null ? `at ${time}` : { lead: "leaves ", text: `${date} ${time}`, dateTime: date };
    const root = body({ legTime });
    const times = [...root.querySelectorAll("ol > li time")];
    expect(times.map((t) => t.getAttribute("datetime"))).toEqual(["2026-04-10", "2026-04-12"]);
    expect(times[0]?.textContent).toBe("2026-04-10 7:00 AM");
    expect(times[0]?.parentElement?.textContent).toBe("leaves 2026-04-10 7:00 AM");
    // The leg list carries the line's full text, so the index and the count read it.
    expect(transportRouteLegs(TRANSPORT, { ...BASE, legTime }).map((l) => l.when)).toEqual([
      "leaves 2026-04-10 7:00 AM",
      "leaves 2026-04-12 11:00 PM",
    ]);
    cleanup();
    const hidden = body({ legTime, hideDates: true });
    expect(hidden.querySelectorAll("time")).toHaveLength(0);
    expect(hidden.querySelector("ol > li")?.textContent).toContain("at 7:00 AM");
  });
});
