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
