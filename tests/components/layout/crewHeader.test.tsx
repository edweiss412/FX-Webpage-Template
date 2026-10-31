// @vitest-environment jsdom
/**
 * The crew page header, crew page redesign Task 7.
 *
 * Spec: docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md §4.1,
 * §1.2, §3.2 and §9.4. Plan: docs/superpowers/plans/2026-10-26-crew-page-redesign-pr-a.md,
 * Task 7.
 *
 * What changes, and the failure each block below catches:
 *
 *   - The eyebrow is ONE line, "client · venue", each part hidden when it is a
 *     sentinel (`shouldHideGenericOptional`), the separator only between two
 *     present parts. Before this task the client rendered alone above the title
 *     and the venue rendered in the date row, so a venue appearing anywhere but
 *     the eyebrow, or a separator with nothing on one side of it, is the defect.
 *   - The theme switch shows for EVERY crew-page viewer. Before this task an
 *     identified viewer got only the avatar menu checkbox; the header switch
 *     mounted for identity-less viewers alone. With both mounted, the shared
 *     theme store (Task 1) is what keeps them agreeing, so the case flips each
 *     control in turn and reads both.
 *   - The search slot renders the node it is given and no element at all when
 *     given none (spec §6A L6). Search (PR #981) already passes its field; the
 *     slot keeps search's own `page-header-search` test id. Its per-mode
 *     placement is a layout claim jsdom cannot make: the browser cases are
 *     "header: …" in tests/e2e/crew-wide-nav.spec.ts (wide) and
 *     tests/e2e/crew-section-toggle.spec.ts (compact).
 *   - A status slot, an empty element directly after the header bar, for the
 *     offline project (§1.2) to fill.
 *
 * Copy is derived from the fixture constants, never typed as a second literal,
 * so a case cannot pass on an example string that happens to match.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { AvatarMenu } from "@/components/auth/AvatarMenu";
import { Header } from "@/components/layout/Header";
import type { ClearIdentityResult } from "@/lib/auth/picker/clearIdentity";

type HeaderShow = Parameters<typeof Header>[0]["show"];

const TITLE = "Northwind Annual Gala";
const CLIENT = "Northwind Bank";
const VENUE = "Hotel Aurelia";
const SEPARATOR = "·";

function showWith(client: string | null, venue: string | null): HeaderShow {
  return {
    title: TITLE,
    client_label: client as string,
    dates: { set: "2026-06-13", travelIn: null, showDays: ["2026-06-14"], travelOut: null },
    venue:
      venue === null
        ? null
        : { name: venue, address: "1 Harbour Way", googleLink: null, notes: null },
  };
}

const clearAction = async (): Promise<ClearIdentityResult> => ({ ok: true as const });

function identityNode() {
  return (
    <AvatarMenu
      name="Dana Ortiz"
      role="A1"
      slug="northwind-gala"
      shareToken={"t".repeat(64)}
      showId="11111111-1111-1111-1111-111111111111"
      clearAction={clearAction}
    />
  );
}

function searchProbe() {
  return <input type="search" aria-label="Search this show" data-testid="probe-search" />;
}

function headerEl(): HTMLElement {
  return screen.getByTestId("page-header");
}

/**
 * Visible text of a node: the copy a sighted reader sees, with screen-reader-only
 * spans removed. `textContent` alone would also count the SR-only comma.
 */
function visibleText(node: Element): string {
  const clone = node.cloneNode(true) as Element;
  for (const sr of clone.querySelectorAll(".sr-only")) sr.remove();
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Spoken text of a node: `aria-hidden` subtrees removed, SR-only spans kept. */
function spokenText(node: Element): string {
  const clone = node.cloneNode(true) as Element;
  for (const hidden of clone.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.dataset.theme = "light";
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("crew header eyebrow (spec §4.1)", () => {
  it("eyebrow: client and venue both present render as one line, client · venue, read as client, venue", () => {
    render(<Header show={showWith(CLIENT, VENUE)} />);
    const eyebrow = screen.getByTestId("page-header-eyebrow");
    const h1 = within(headerEl()).getByRole("heading", { level: 1 });

    expect(visibleText(eyebrow)).toBe(`${CLIENT} ${SEPARATOR} ${VENUE}`);
    // The dot is visual punctuation; a screen reader hears the comma instead,
    // the pattern the avatar menu's identity line uses.
    expect(spokenText(eyebrow)).toBe(`${CLIENT}, ${VENUE}`);
    // The eyebrow sits above the title.
    expect(eyebrow.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // ONE line: the venue renders nowhere else in the header (it used to sit in
    // the date row), and the client renders once.
    expect(countOccurrences(headerEl().textContent ?? "", VENUE)).toBe(1);
    expect(countOccurrences(headerEl().textContent ?? "", CLIENT)).toBe(1);
  });

  it.each([null, "", "  ", "TBD", "n/a", " TBA ", "-"])(
    "eyebrow: client only when the venue is %j, with no separator",
    (venue) => {
      render(<Header show={showWith(CLIENT, venue)} />);
      const eyebrow = screen.getByTestId("page-header-eyebrow");
      expect(visibleText(eyebrow)).toBe(CLIENT);
      expect(spokenText(eyebrow)).toBe(CLIENT);
      // The sentinel itself never reaches the page.
      if (venue !== null && venue.trim() !== "") {
        expect(headerEl().textContent ?? "").not.toContain(venue.trim());
      }
    },
  );

  it.each([null, "", "  ", "TBD", "N/A", " tba ", "-"])(
    "eyebrow: venue only when the client is %j, with no separator",
    (client) => {
      render(<Header show={showWith(client, VENUE)} />);
      const eyebrow = screen.getByTestId("page-header-eyebrow");
      expect(visibleText(eyebrow)).toBe(VENUE);
      expect(spokenText(eyebrow)).toBe(VENUE);
      if (client !== null && client.trim() !== "") {
        expect(headerEl().textContent ?? "").not.toContain(client.trim());
      }
    },
  );

  // Every row carries at least one sentinel STRING: a null-only row would pass
  // before this task too (a null client never rendered), so it could not be
  // observed red. Null parts are covered by the one-part rows above.
  it.each([
    ["TBD", "N/A"],
    ["  ", "-"],
    [null, "TBA"],
    ["n/a", null],
  ])(
    "eyebrow: neither part (client %j, venue %j) renders no eyebrow and no stray separator",
    (client, venue) => {
      render(<Header show={showWith(client, venue)} />);
      expect(screen.queryByTestId("page-header-eyebrow")).toBeNull();
      // No sentinel reaches the page, in the eyebrow or anywhere else.
      for (const part of [client, venue]) {
        if (part !== null && part.trim() !== "") {
          expect(headerEl().textContent ?? "", `sentinel ${part}`).not.toContain(part.trim());
        }
      }
      const h1 = within(headerEl()).getByRole("heading", { level: 1 });
      // The title carries alone: the first thing in its block is the title (or
      // its title row), with no top margin reserved for an absent eyebrow.
      const block = screen.getByTestId("page-header-title-block");
      const first = block.firstElementChild;
      expect(first === h1 || first?.contains(h1)).toBe(true);
      expect(first?.className ?? "").not.toContain("mt-1");
      expect(h1.className).not.toContain("mt-1");
      expect(headerEl().textContent ?? "").not.toContain(SEPARATOR);
    },
  );
});

describe("crew header theme switch (spec §4.1, §9.4)", () => {
  it("theme switch: an identified viewer sees the header switch and the avatar menu checkbox, and they agree after either is used", () => {
    render(<Header show={showWith(CLIENT, VENUE)} identityChip={identityNode()} />);
    const slot = screen.getByTestId("page-header-right-slot");

    // Both controls are mounted for an identified viewer.
    const toggle = within(slot).getByTestId("theme-toggle");
    expect(within(slot).getByTestId("avatar-menu-trigger")).toBeInTheDocument();
    // PREMISE: the page starts light, so the first flip is a real transition.
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    act(() => {
      fireEvent.click(screen.getByTestId("avatar-menu-trigger"));
    });
    expect(screen.getByTestId("avatar-menu-theme")).toHaveAttribute("aria-checked", "false");

    // The header switch flips the theme; the open menu's checkbox follows.
    act(() => {
      fireEvent.click(toggle);
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("avatar-menu-theme")).toHaveAttribute("aria-checked", "true");

    // The checkbox flips it back; the header switch follows.
    act(() => {
      fireEvent.click(screen.getByTestId("avatar-menu-theme"));
    });
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("avatar-menu-theme")).toHaveAttribute("aria-checked", "false");
  });

  it("theme switch: the header control is the unchanged ThemeToggle, a button named Dark mode whose aria-pressed reports dark, with and without an identity", () => {
    for (const identity of [undefined, identityNode()]) {
      document.documentElement.dataset.theme = "dark";
      const { unmount } = render(<Header show={showWith(CLIENT, VENUE)} identityChip={identity} />);
      const arm = identity === undefined ? "without an identity" : "with an identity";
      const named = within(headerEl()).queryByRole("button", { name: "Dark mode" });
      expect(named, arm).not.toBeNull();
      expect(named, arm).toBe(within(headerEl()).getByTestId("theme-toggle"));
      expect(named, arm).toHaveAttribute("aria-pressed", "true");
      // One switch in the header, not one per branch.
      expect(within(headerEl()).getAllByTestId("theme-toggle"), arm).toHaveLength(1);
      unmount();
    }
  });
});

describe("crew header row (spec §3.2)", () => {
  it("header row: the title, the theme switch and the search slot render in one header that no mode hides", () => {
    render(
      <Header
        show={showWith(CLIENT, VENUE)}
        identityChip={identityNode()}
        search={searchProbe()}
      />,
    );
    const header = headerEl();
    const pieces = [
      within(header).getByRole("heading", { level: 1 }),
      within(header).getByTestId("theme-toggle"),
      within(header).getByTestId("probe-search"),
    ];
    // Both modes share one DOM (spec §3.2): none of these, nor anything between
    // them and the header, carries a class that hides it at some width.
    const MODE_HIDE = /(^|\s)([a-z0-9-]+:)*hidden(\s|$)/;
    for (const piece of pieces) {
      for (
        let el: Element | null = piece;
        el && el !== header.parentElement;
        el = el.parentElement
      ) {
        expect(el.getAttribute("class") ?? "", `${el.tagName} above ${piece.tagName}`).not.toMatch(
          MODE_HIDE,
        );
      }
    }
  });
});

describe("crew header title (audit P2-3, critique F8)", () => {
  it("title: the h1 carries the full show title as `title`, with and without a status pill", () => {
    // One-line truncation stays the wide header's fallback (DESIGN.md §9); the
    // attribute is how a cut title can still be read whole.
    for (const statusPill of [undefined, <span key="p">Show day 1 of 2</span>]) {
      const { unmount } = render(
        <Header show={showWith(CLIENT, VENUE)} {...(statusPill ? { statusPill } : {})} />,
      );
      const h1 = within(headerEl()).getByRole("heading", { level: 1 });
      expect(h1).toHaveAttribute("title", h1.textContent!);
      expect(h1.textContent!.length).toBeGreaterThan(0);
      unmount();
    }
  });
});

describe("crew header eyebrow (UI-gate re-run, critique N7)", () => {
  it("eyebrow: carries client and venue whole as `title`, since from 1024px the status pill shares its line and a long one truncates", () => {
    render(<Header show={showWith(CLIENT, VENUE)} statusPill={<span>Show day 1 of 2</span>} />);
    const eyebrow = within(headerEl()).getByTestId("page-header-eyebrow");
    expect(eyebrow).toHaveAttribute("title", `${CLIENT} · ${VENUE}`);
    // PREMISE: the line renders both parts.
    expect(eyebrow.textContent).toContain(CLIENT);
    expect(eyebrow.textContent).toContain(VENUE);
  });
});

describe("crew header search slot (spec §4.1, §1.2)", () => {
  it("search slot: renders the node it is given inside the header, after the title and before the identity chip, in neither the title block nor the right slot", () => {
    render(
      <Header
        show={showWith(CLIENT, VENUE)}
        identityChip={identityNode()}
        search={searchProbe()}
      />,
    );
    const header = headerEl();
    const field = within(header).getByTestId("probe-search");
    const slot = screen.getByTestId("page-header-search");
    const h1 = within(header).getByRole("heading", { level: 1 });
    const chip = within(header).getByTestId("avatar-menu-trigger");
    expect(slot).toContainElement(field);
    // DOM order is the wide order: title, search, identity chip.
    expect(h1.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(field.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Its own item of the header row: a sibling of the title block and the
    // right slot, inside neither.
    const titleBlock = screen.getByTestId("page-header-title-block");
    const rightSlot = screen.getByTestId("page-header-right-slot");
    expect(titleBlock.contains(field)).toBe(false);
    expect(rightSlot.contains(field)).toBe(false);
    expect(slot.parentElement).toBe(titleBlock.parentElement);
    expect(slot.parentElement).toBe(rightSlot.parentElement);
  });

  it("search slot: renders nothing, no wrapper, when given none", () => {
    const withSearch = render(<Header show={showWith(CLIENT, VENUE)} search={searchProbe()} />);
    // The wrapper, whatever it is: the field's parent.
    const wrapper = screen.getByTestId("probe-search").parentElement!;
    const wrapperSignature = `${wrapper.tagName}|${wrapper.getAttribute("class") ?? ""}|${
      wrapper.getAttribute("data-testid") ?? ""
    }`;
    // PREMISE: the wrapper is not one of the header's always-present pieces, or
    // the absence check below could never fail.
    expect(wrapper.getAttribute("data-testid")).toBe("page-header-search");
    const elementsWith = withSearch.container.querySelectorAll("*").length;
    withSearch.unmount();

    const withoutSearch = render(<Header show={showWith(CLIENT, VENUE)} />);
    const omitted = withoutSearch.container.innerHTML;
    for (const el of withoutSearch.container.querySelectorAll("*")) {
      const signature = `${el.tagName}|${el.getAttribute("class") ?? ""}|${
        el.getAttribute("data-testid") ?? ""
      }`;
      expect(signature, "the search slot's wrapper renders with no node to hold").not.toBe(
        wrapperSignature,
      );
    }
    // Exactly the field and its one wrapper are gone, nothing else.
    expect(withoutSearch.container.querySelectorAll("*").length).toBe(elementsWith - 2);
    withoutSearch.unmount();

    // `null` is the same as omitting it.
    const nullSearch = render(<Header show={showWith(CLIENT, VENUE)} search={null} />);
    expect(nullSearch.container.innerHTML).toBe(omitted);
  });
});

describe("crew header status slot (spec §4.1, §1.2)", () => {
  it.each([
    ["without an identity", undefined],
    ["with an identity", "identified"],
  ] as const)(
    "status slot: an empty element immediately after the header bar, %s",
    (_label, identity) => {
      render(
        <Header
          show={showWith(CLIENT, VENUE)}
          identityChip={identity === "identified" ? identityNode() : undefined}
          search={searchProbe()}
        />,
      );
      const header = headerEl();
      const next = header.nextElementSibling;
      expect(next, "an element follows the header bar").not.toBeNull();
      expect(next).toBe(screen.getByTestId("page-header-status-slot"));
      // Empty: no element, no text. The offline project fills it.
      expect(next!.childNodes).toHaveLength(0);
      // Under the bar, not inside it.
      expect(header.contains(next)).toBe(false);
    },
  );
});
