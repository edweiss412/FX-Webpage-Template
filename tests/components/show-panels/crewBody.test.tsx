// @vitest-environment jsdom
/**
 * tests/components/show-panels/crewBody.test.tsx
 * (crew page redesign PR B plan, Task 6; spec
 * docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md §6.1, §6.2
 * `crew` row, line 303, §9.2)
 *
 * The Crew roster body is the list of the admin's `CrewBreakdown`, shared. The
 * admin rendering is pinned byte for byte by the Task 1 golden
 * (tests/components/admin/wizard/adminSectionDom.test.tsx) and asserted nowhere
 * else: every case here is about the body itself or the crew page around it.
 *
 * Crew: the body sits in the crew panel card titled "Crew" (spec line 404) with
 * the `crew-roster` card's actions, capped at `CREW_INLINE_CAP` with the crew's
 * overflow copy, the "You", "Lead" and partial-attendance chips, Call and Text
 * only when the phone has digits and Email behind its sentinel gate (plan
 * decision 8), each a drawn icon (BL-CREW-SECTION-GLYPH-ICONS), and the role
 * line as the sheet writes it, wrapping rather than cut
 * (BL-CREW-ROLE-LINE-RAW-TRUNCATED; the laid-out half is the "crew" case in
 * tests/e2e/crew-page.spec.ts). Also here: the body called inside the
 * section's `WrappedSection` (spec line 291), and the props a viewer receives
 * (AC-6).
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CrewSection } from "@/components/crew/sections/CrewSection";
import {
  CREW_INLINE_CAP,
  ROSTER_CARD_ID,
  crewMailtoHref,
  crewSmsHref,
  crewTelHref,
  rosterPanel,
} from "@/components/crew/sections/crewRows";
import { SECTION_ICON } from "@/components/crew/sectionIcon";
import {
  CrewBody,
  type CrewBodyMember,
  type CrewBodyProps,
} from "@/components/show-panels/CrewBody";
import * as crewBodyModule from "@/components/show-panels/CrewBody";
import { CREW_MOVED_IDS } from "@/lib/crew/crewSections";
import { createTileRenderLedger } from "@/lib/crew/tileRenderLedger";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { showSection } from "@/lib/showSections/registry";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-crew";

type CrewMember = ShowForViewer["crewMembers"][number];

function member(id: string, over: Partial<CrewMember> = {}): CrewMember {
  return {
    id,
    name: `Member ${id}`,
    email: null,
    phone: null,
    role: "",
    roleFlags: [],
    dateRestriction: { kind: "none" },
    stageRestriction: { kind: "none" },
    ...over,
  };
}

function renderCrew(
  crewMembers: CrewMember[],
  viewer: Viewer = { kind: "admin" },
  ledger = createTileRenderLedger(),
) {
  return render(
    <CrewSection
      ledger={ledger}
      data={makeShowForViewer({ crewMembers, contacts: [] })}
      viewer={viewer}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
}

const rosterCard = () =>
  document.querySelector<HTMLElement>(
    `[data-testid="crew-panel-card"][data-card-id="${ROSTER_CARD_ID}"]`,
  );
const rows = () => [...document.querySelectorAll('[data-testid="crew-panel-crew-row"]')];

/** A plain body call: every required prop, the crew's builders, nothing else. */
function body(members: CrewBodyMember[], over: Partial<CrewBodyProps> = {}) {
  return CrewBody({
    members,
    cap: 8,
    overflow: (hidden) => <p data-testid="overflow">{`${hidden} hidden`}</p>,
    telHref: crewTelHref,
    smsHref: crewSmsHref,
    mailtoHref: crewMailtoHref,
    sentinels: "hide",
    partialAs: "chip",
    actionsPlacement: "below",
    ...over,
  });
}

function bodyMember(key: string, over: Partial<CrewBodyMember> = {}): CrewBodyMember {
  return {
    key,
    name: `Person ${key}`,
    avatarName: `Person ${key}`,
    role: null,
    partial: null,
    phone: null,
    email: null,
    ...over,
  };
}

describe("CrewBody", () => {
  test("the cap is a prop: the same members under two caps show that many rows, and the overflow gets the rest", () => {
    const members = Array.from({ length: 5 }, (_, i) => bodyMember(`m${i}`));
    for (const cap of [3, 4]) {
      const { container } = render(body(members, { cap }));
      expect(container.querySelectorAll("li"), `cap ${cap}`).toHaveLength(cap);
      expect(screen.getByTestId("overflow").textContent, `cap ${cap}`).toBe(
        `${members.length - cap} hidden`,
      );
      // The tail is cut, not the head.
      expect(container).toHaveTextContent(`Person m${cap - 1}`);
      expect(container).not.toHaveTextContent(`Person m${cap}`);
      cleanup();
    }
    // At the cap exactly, nothing is hidden and no overflow renders.
    render(body(members, { cap: members.length }));
    expect(screen.queryByTestId("overflow")).toBeNull();
  });

  test("under sentinels: hide a sentinel role is not rendered; under show it renders as parsed", () => {
    const m = [bodyMember("a", { role: "TBD" })];
    expect(render(body(m)).container).not.toHaveTextContent("TBD");
    cleanup();
    expect(render(body(m, { sentinels: "show" })).container).toHaveTextContent("TBD");
  });

  test("the role line renders the role as the sheet writes it, whole, and wraps rather than truncating (spec §9.2)", () => {
    const ROLE = "- Load In / Set / Strike / Load Out - LEAD / V1";
    const { container } = render(body([bodyMember("a", { role: ROLE })]));
    const line = [...container.querySelectorAll("span")].find((el) => el.textContent === ROLE);
    premiseHolds("the role renders as its own line", line !== undefined);
    // No case transform and no one-line cut: the classes that would uppercase it,
    // or truncate or clamp it, are absent, and the wrapping class is present.
    const classes = line!.className.split(/\s+/);
    for (const banned of ["uppercase", "truncate", "line-clamp-1", "whitespace-nowrap"]) {
      expect(classes, banned).not.toContain(banned);
    }
    expect(classes).toContain("wrap-break-word");
  });

  test("Call and Text use the digits-only builders and Email its sentinel builder; each is a drawn icon, never a glyph", () => {
    const { container } = render(
      body([bodyMember("a", { phone: "(646) 256-3148", email: "pat@example.com" })]),
    );
    const call = screen.getByRole("link", { name: "Call Person a" });
    const text = screen.getByRole("link", { name: "Text Person a" });
    const email = screen.getByRole("link", { name: "Email Person a" });
    expect(call).toHaveAttribute("href", "tel:6462563148");
    expect(text).toHaveAttribute("href", "sms:6462563148");
    expect(email).toHaveAttribute("href", "mailto:pat@example.com");
    for (const a of [call, text, email]) {
      expect(a.querySelector("svg"), a.getAttribute("aria-label")!).not.toBeNull();
      expect(a.textContent).toBe("");
    }
    expect(container.textContent).not.toMatch(/[☎✉]/);
  });

  test("a surface that passes no Text builder renders no Text action", () => {
    render(
      CrewBody({
        members: [bodyMember("a", { phone: "555 0100" })],
        cap: 8,
        overflow: () => null,
        telHref: crewTelHref,
        mailtoHref: crewMailtoHref,
        sentinels: "hide",
        partialAs: "chip",
        actionsPlacement: "below",
      }),
    );
    expect(screen.getByRole("link", { name: "Call Person a" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Text / })).toBeNull();
  });

  test("search markers come only from the target map", () => {
    const members = [bodyMember("a", { role: "A1", phone: "555 0100" })];
    const { container } = render(body(members, { targets: { a: "t-a" } }));
    const found = [...container.querySelectorAll("[data-search-target]")].map((el) => [
      el.getAttribute("data-search-target"),
      el.textContent,
    ]);
    expect(found).toEqual([["t-a", "Person aA1"]]);
    // The avatar's initials and the actions are not sheet text.
    expect(container.querySelectorAll("[data-search-skip]").length).toBe(2);

    cleanup();
    const bare = render(body(members)).container;
    expect(
      bare.querySelector("[data-search-target],[data-search-skip],[data-search-group]"),
    ).toBeNull();
  });
});

describe("crew roster props", () => {
  test("Call and Text are absent for a digit-less phone, and Email still renders", () => {
    renderCrew([member("c1", { name: "Pat", phone: "call the office", email: "pat@example.com" })]);
    const card = rosterCard();
    premiseHolds("the roster card rendered", card !== null);
    expect(within(card!).queryByRole("link", { name: /^Call / })).toBeNull();
    expect(within(card!).queryByRole("link", { name: /^Text / })).toBeNull();
    expect(within(card!).getByRole("link", { name: "Email Pat" })).toHaveAttribute(
      "href",
      "mailto:pat@example.com",
    );
    // Control: the same row with digits gets both.
    cleanup();
    renderCrew([member("c1", { name: "Pat", phone: "555 0100" })]);
    expect(within(rosterCard()!).getByRole("link", { name: "Call Pat" })).toHaveAttribute(
      "href",
      "tel:5550100",
    );
    expect(within(rosterCard()!).getByRole("link", { name: "Text Pat" })).toHaveAttribute(
      "href",
      "sms:5550100",
    );
  });

  test("a sentinel email renders no Email action", () => {
    renderCrew([member("c1", { name: "Pat", email: "N/A", phone: "555 0100" })]);
    expect(within(rosterCard()!).queryByRole("link", { name: /^Email / })).toBeNull();
    expect(within(rosterCard()!).getByRole("link", { name: "Call Pat" })).toBeInTheDocument();
  });

  test.each([
    ["crew", { kind: "crew", crewMemberId: "c2" } as Viewer, true],
    ["admin_preview", { kind: "admin_preview", crewMemberId: "c2" } as Viewer, true],
    ["admin", { kind: "admin" } as Viewer, false],
  ])("the viewer's own You chip renders for a %s viewer: %s", (_kind, viewer, expected) => {
    renderCrew([member("c1"), member("c2"), member("c3")], viewer);
    const you = rows().filter((r) => r.hasAttribute("data-you"));
    premise("the roster rendered its rows", rows().length, 2);
    if (expected) {
      expect(you).toHaveLength(1);
      expect(you[0]).toHaveTextContent("Member c2");
      expect(within(you[0] as HTMLElement).getByText("You")).toBeVisible();
    } else {
      expect(you).toHaveLength(0);
      expect(rosterCard()).not.toHaveTextContent(/\bYou\b/);
    }
  });

  test("the cap boundary: CREW_INLINE_CAP rows render with no overflow, one past it renders the cap and a +1 stub", () => {
    const roster = (n: number) => Array.from({ length: n }, (_, i) => member(`c${i}`));
    renderCrew(roster(CREW_INLINE_CAP));
    expect(rows()).toHaveLength(CREW_INLINE_CAP);
    expect(screen.queryByTestId("crew-overflow-stub")).toBeNull();
    cleanup();
    renderCrew(roster(CREW_INLINE_CAP + 1));
    expect(rows()).toHaveLength(CREW_INLINE_CAP);
    const stub = screen.getByTestId("crew-overflow-stub");
    expect(stub).toHaveAttribute("data-tile-show-more", "true");
    expect(stub.textContent).toBe("+1 more crew member on the source sheet");
  });

  test("the Lead and partial-attendance chips render beside the name, the partial label humanized", () => {
    renderCrew([
      member("c1", {
        name: "Calvin",
        role: "BO",
        roleFlags: ["LEAD"],
        dateRestriction: { kind: "explicit", days: ["2025-10-07", "2025-10-09"] },
      }),
    ]);
    const [row] = rows();
    expect(row).toHaveAttribute("data-lead", "true");
    expect(within(row as HTMLElement).getByText("Lead")).toBeVisible();
    const chip = (row as HTMLElement).querySelector("[data-partial]");
    expect(chip).not.toBeNull();
    expect(chip).toHaveTextContent("Oct 7 & 9 only");
  });

  test("AC-6: the props a crew viewer's roster receives carry each restriction as its rendered label, never the raw days", () => {
    const DAYS = ["2025-10-07", "2025-10-09"];
    const data = makeShowForViewer({
      crewMembers: [member("c1", { dateRestriction: { kind: "explicit", days: DAYS } })],
    });
    const serialized = JSON.stringify(rosterPanel(data, { kind: "crew", crewMemberId: "c1" }));
    // Positive control: the restriction reaches the props as the label it renders.
    expect(serialized).toContain("Oct 7 & 9 only");
    for (const day of DAYS) expect(serialized).not.toContain(day);
    expect(serialized).not.toContain("explicit");
  });
});

describe("CrewSection (crew)", () => {
  test('the roster is the crew panel card titled with the registry label, "Crew" (spec line 404), with card id crew-roster and its actions', () => {
    renderCrew([member("c1", { name: "Pat" })]);
    const card = rosterCard();
    premiseHolds("the roster renders the panel card", card !== null);
    // Exact text, and visible: a suffixed or hidden title fails, not only a missing one.
    const title = within(card!).getByRole("heading", { level: 3 });
    expect(title.textContent).toBe(showSection("crew").label);
    expect(title).toBeVisible();
    expect(showSection("crew").label).toBe("Crew");
    expect(card!.querySelector('[data-slot="section-card-action"]')).not.toBeNull();
    expect(card).toHaveTextContent("Pat");
  });

  test("crew is a moved section: its label and glyph are the registry's (decisions 2 and 3)", () => {
    expect(CREW_MOVED_IDS).toContain("crew");
    expect(SECTION_ICON.crew).toBe(showSection("crew").icon);
  });
});

describe("error containment (spec line 291, line 507)", () => {
  test("a throw from CrewBody inside the crew WrappedSection renders the fallback and records crew:crew:roster", () => {
    const ledger = createTileRenderLedger();
    const spy = vi.spyOn(crewBodyModule, "CrewBody").mockImplementation(() => {
      throw new Error("planted crew body fault");
    });
    renderCrew([member("c1", { name: "Pat" })], { kind: "admin" }, ledger);
    premiseHolds("the section called the body", spy.mock.calls.length > 0);
    expect(screen.getByTestId("tile-error-fallback")).toBeInTheDocument();
    expect(ledger.failed.get("crew:crew:roster")?.message).toBe("planted crew body fault");
    expect(screen.getByTestId("section-crew")).not.toHaveTextContent("Pat");
  });
});

/**
 * PR B invariant-8 UI gate rows 17 and 20: the crew roster's contact actions.
 * Both props default to the admin's markup (pinned by the golden).
 */
describe("CrewBody crew presentation (gate rows 17, 20)", () => {
  const withActions = [bodyMember("a", { phone: "215-555-0100", email: "a@example.com" })];
  /** Each action's drawn square: the visual inside the 44px anchor. */
  const squares = (root: Element) =>
    [...root.querySelectorAll("a[aria-label]")].map((a) => a.firstElementChild as HTMLElement);

  test('actionTone "text": the glyph is body text with the home "Who to call" hover (sunken plate, accent glyph); the default glyph stays subtle with no hover', () => {
    const plain = render(body(withActions)).container;
    const rest = squares(plain);
    premise("drawn actions", rest.length, 1);
    for (const sq of rest) {
      expect(sq.className).toContain("text-text-subtle");
      expect(sq.className).not.toMatch(/hover:/);
    }
    cleanup();
    const root = render(body(withActions, { actionTone: "text" })).container;
    const drawn = squares(root);
    premise("drawn actions", drawn.length, 1);
    for (const sq of drawn) {
      const cls = sq.className.split(/\s+/);
      expect(cls).toContain("text-text");
      expect(cls).not.toContain("text-text-subtle");
      expect(cls).toEqual(
        expect.arrayContaining(["group-hover:bg-surface-sunken", "group-hover:text-accent-on-bg"]),
      );
      // The hover is the anchor's (the 44px hit box), carried to the square by `group`.
      expect(sq.parentElement!.className.split(/\s+/)).toContain("group");
    }
  });

  test('actionsPlacement "below-until-split": the actions sit under the identity below @min-crew-split and close the row from it', () => {
    const root = render(body(withActions, { actionsPlacement: "below-until-split" })).container;
    const row = root.querySelector("li")!;
    const actions = row.querySelector("a[aria-label]")!.parentElement!;
    const column = actions.parentElement!;
    // Below the threshold: the identity, then the actions, in one column.
    expect(column.className.split(/\s+/)).toEqual(
      expect.arrayContaining([
        "flex-col",
        "@min-crew-split:flex-row",
        "@min-crew-split:items-center",
      ]),
    );
    expect(column.firstElementChild).toHaveTextContent("Person a");
    expect(column.lastElementChild).toBe(actions);
    // From it: the actions lose the column's hanging indent.
    expect(actions.className.split(/\s+/)).toContain("@min-crew-split:ml-0");
    // No viewport variant anywhere in the row.
    const classes = [row, ...row.querySelectorAll("*")].flatMap((el) =>
      (el.getAttribute("class") ?? "").split(/\s+/),
    );
    expect(classes.filter((c) => /^(?:sm|md|lg|xl|2xl|min-\[[^\]]+\]):/.test(c))).toEqual([]);
  });

  test("the crew roster passes both: its actions are drawn in body text and close the row from the threshold", () => {
    renderCrew([member("c1", { name: "Pat Rivera", phone: "215-555-0100" })]);
    const row = rows()[0]!;
    premiseHolds("the roster row rendered", row !== undefined);
    const square = row.querySelector("a[aria-label] > span")!;
    expect(square.className.split(/\s+/)).toContain("text-text");
    expect(row.querySelector("[class*='@min-crew-split:flex-row']")).not.toBeNull();
  });
});
