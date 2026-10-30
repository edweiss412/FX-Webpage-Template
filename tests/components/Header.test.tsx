// @vitest-environment jsdom
/**
 * tests/components/Header.test.tsx — page-header rebalance contract
 * (M9 C1 / M4-D3 shape brief §5.2).
 *
 * The header shrinks to a context strip: text-base/lg semibold title,
 * text-xs meta line, no orange hairline, FXAV wordmark in text-faint, and
 * tight vertical padding. The Today hero becomes the page's primary
 * visual moment unambiguously.
 *
 * Pre-rebalance (M4 catch-up critique Finding 5): title at text-2xl
 * sm:text-3xl font-bold competed with the Today hero for the hero spot;
 * the orange hairline fought the card's accent dot for the eye.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, within } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

import { Header } from "@/components/layout/Header";

const baseShow = {
  title: "Spring Tour 2026",
  client_label: "FXAV Client",
  dates: {
    set: "2026-04-17",
    travelIn: null,
    showDays: ["2026-04-17"],
    travelOut: null,
  } as never,
  venue: { name: "Hilton Anatole", timezone: "America/Chicago" } as never,
};

describe("Header rebalance (M4-D3)", () => {
  it("renders the title at text-base sm:text-lg font-semibold (was text-2xl sm:text-3xl font-bold)", () => {
    const { container } = render(<Header show={baseShow} />);
    const h1 = container.querySelector("h1");
    expect(h1).not.toBeNull();
    const cls = h1?.className ?? "";
    expect(cls).toContain("text-base");
    expect(cls).toContain("sm:text-lg");
    expect(cls).toContain("font-semibold");
    expect(cls).not.toContain("text-2xl");
    expect(cls).not.toContain("text-3xl");
    expect(cls).not.toContain("font-bold");
  });

  it("renders the date row at text-xs (was text-sm), the date alone now that the venue moved to the eyebrow", () => {
    // MIGRATED 2026-10-30 (crew page redesign spec §4.1, Task 7). This row was
    // "date · venue"; the venue joined the client in the eyebrow, so the row
    // carries the date alone. The size contract is unchanged, and the venue
    // must not render here as well as in the eyebrow.
    const { container } = render(<Header show={baseShow} />);
    const time = container.querySelector("time");
    expect(time).not.toBeNull();
    const metaRow = time?.parentElement;
    expect(metaRow?.tagName.toLowerCase()).toBe("p");
    const cls = metaRow?.className ?? "";
    expect(cls).toContain("text-xs");
    expect(cls).not.toContain("text-sm");
    expect(metaRow?.textContent).toBe("April 17, 2026");
  });

  it("does NOT render the orange hairline (bg-accent h-px divider)", () => {
    const { container } = render(<Header show={baseShow} />);
    const hairlines = container.querySelectorAll(".bg-accent");
    expect(hairlines.length).toBe(0);
  });

  it("renders the FXAV wordmark at text-text-faint (was text-text-subtle)", () => {
    const { container } = render(<Header show={baseShow} />);
    // Located by TESTID, not by `aria-label`: that attribute is prohibited on
    // `role=paragraph` (ARIA 1.2) and was redundant with the element's own text,
    // so it was removed (impeccable audit P3). The subject of this case is the
    // wordmark's COLOR token, which is unchanged.
    const wordmark = container.querySelector('[data-testid="page-header-fxav-wordmark"]');
    expect(wordmark).not.toBeNull();
    const cls = wordmark?.className ?? "";
    expect(cls).toContain("text-text-faint");
    expect(cls).not.toContain("text-text-subtle");
  });

  it("renders the eyebrow (client · venue) at text-text-subtle, not text-text-faint (AA 4.5:1 at 12px)", () => {
    // text-faint measures 3.21:1 light / 4.00:1 dark on --color-bg, an AA-large
    // floor (DESIGN.md §1.1); the client name is 12px information, not
    // decoration, so it takes text-subtle (6.47:1 / 6.75:1). Impeccable gate B1.
    // MIGRATED 2026-10-30 (spec §4.1, Task 7): the client shares ONE eyebrow
    // line with the venue now, so the line is found by its test id rather than
    // by the client's text alone. The venue, which used to read at text-subtle
    // in the date row, keeps that ratio here.
    const { getByTestId } = render(<Header show={baseShow} />);
    const cls = getByTestId("page-header-eyebrow").className;
    expect(cls).toContain("text-text-subtle");
    expect(cls).not.toContain("text-text-faint");
  });

  it("uses tight vertical padding (py-3 sm:py-4 — was pb-5 pt-7 sm:pb-6 sm:pt-9)", () => {
    const { container } = render(<Header show={baseShow} />);
    const inner = container.querySelector("header > div");
    expect(inner).not.toBeNull();
    const cls = inner?.className ?? "";
    expect(cls).toContain("py-3");
    expect(cls).toContain("sm:py-4");
    expect(cls).not.toContain("pt-7");
    expect(cls).not.toContain("pb-5");
    expect(cls).not.toContain("sm:pt-9");
    expect(cls).not.toContain("sm:pb-6");
  });

  it("still renders the page-header testid + show title + date + venue", () => {
    const { container } = render(<Header show={baseShow} />);
    const header = container.querySelector('[data-testid="page-header"]');
    expect(header).not.toBeNull();
    const scoped = within(header as HTMLElement);
    expect(scoped.getByText("Spring Tour 2026")).not.toBeNull();
    expect(scoped.getByText("April 17, 2026")).not.toBeNull();
    // MIGRATED 2026-10-30 (spec §4.1, Task 7): client and venue share ONE
    // eyebrow line now, so neither is an element of its own to find by exact
    // text. Both still render, in that line, once each.
    const eyebrow = scoped.getByTestId("page-header-eyebrow");
    expect(eyebrow.textContent).toContain("FXAV Client");
    expect(eyebrow.textContent).toContain("Hilton Anatole");
    expect((header?.textContent ?? "").split("Hilton Anatole")).toHaveLength(2);
  });

  it("omits the date row entirely when the show has no date", () => {
    const showNoMeta = {
      ...baseShow,
      dates: { set: null, travelIn: null, showDays: [], travelOut: null } as never,
      venue: null,
    };
    const { container } = render(<Header show={showNoMeta} />);
    expect(container.querySelector("time")).toBeNull();
    // Title still renders
    expect(container.querySelector("h1")?.textContent).toBe("Spring Tour 2026");
  });

  it("omits the date row when the show has no date, even with a venue (the venue no longer opens that row)", () => {
    // MIGRATED 2026-10-30 (spec §4.1, Task 7). The old row opened for a date OR
    // a venue; the venue left for the eyebrow, so a venue with no date must not
    // leave an empty date row under the title.
    const showVenueNoDate = {
      ...baseShow,
      dates: { set: null, travelIn: null, showDays: [], travelOut: null } as never,
    };
    const { container } = render(<Header show={showVenueNoDate} />);
    expect(container.querySelector("time")).toBeNull();
    const h1 = container.querySelector("h1");
    expect(h1?.nextElementSibling).toBeNull();
  });

  it("omits the eyebrow entirely when client and venue are both absent (R2 M2 — title carries alone)", () => {
    // MIGRATED 2026-10-30 (spec §4.1, Task 7): the eyebrow is "client · venue"
    // now, so it is absent only when BOTH parts are. The failure mode is
    // unchanged: no empty eyebrow above the title and no top margin reserved
    // for one.
    const showNoLabel = { ...baseShow, client_label: null as never, venue: null };
    const { container } = render(<Header show={showNoLabel} />);
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toBe("Spring Tour 2026");
    // No empty eyebrow <p> sits above the h1 — the title is the first
    // child of the inner div.
    const inner = container.querySelector("header > div > div");
    const firstChildTag = inner?.firstElementChild?.tagName.toLowerCase();
    expect(firstChildTag).toBe("h1");
    // h1 drops its mt-1 top margin when there's no eyebrow above it
    // (brief: shrink-to-context with no orphan whitespace).
    expect(h1?.className ?? "").not.toContain("mt-1");
  });

  it("omits the eyebrow entirely when client_label and the venue name are empty strings", () => {
    const showEmptyLabel = {
      ...baseShow,
      client_label: "",
      venue: { name: "", timezone: "America/Chicago" } as never,
    };
    const { container } = render(<Header show={showEmptyLabel} />);
    expect(container.querySelector("h1")?.textContent).toBe("Spring Tour 2026");
    const inner = container.querySelector("header > div > div");
    expect(inner?.firstElementChild?.tagName.toLowerCase()).toBe("h1");
  });
});

describe("Header identityChip slot (M11.5 §B Task C4)", () => {
  it("renders the FXAV wordmark AND a reachable theme toggle when no identityChip is provided", () => {
    const { queryByTestId } = render(<Header show={baseShow} />);
    expect(queryByTestId("page-header-fxav-wordmark")).not.toBeNull();
    // CHANGED 2026-08-09 (UI spec §2.3). The right slot used to be ABSENT
    // without an identity. It is present now and carries the STANDALONE theme
    // toggle: the switch left the footer at every width, so an identity-less
    // page would otherwise have no way to change theme at all. The slot is
    // marked `data-identity="none"` so this state stays distinguishable from
    // the avatar-menu one rather than the two collapsing into "slot exists".
    const slot = queryByTestId("page-header-right-slot");
    expect(slot).not.toBeNull();
    expect(slot?.getAttribute("data-identity")).toBe("none");
    expect(queryByTestId("theme-toggle")).not.toBeNull();
  });

  it("replaces the FXAV wordmark with the identityChip slot when provided", () => {
    const chip = <span data-testid="header-test-fixture-chip">Alice · Audio A1</span>;
    const { queryByTestId } = render(<Header show={baseShow} identityChip={chip} />);
    expect(queryByTestId("page-header-fxav-wordmark")).toBeNull();
    expect(queryByTestId("page-header-right-slot")).not.toBeNull();
    expect(queryByTestId("header-test-fixture-chip")?.textContent).toBe("Alice · Audio A1");
  });

  it("mounts the toggle as a DIRECT child of the right slot, with no wrapper around it, with and without an identity", () => {
    // The crew header is the third consumer of the standalone toggle. Until
    // 2026-08-26 `ThemeToggle` returned a `relative inline-flex` span around
    // its button to anchor the persist-failure bubble; the note was removed and
    // the wrapper went with it, which makes the button a direct flex child of
    // this row rather than a wrapped one.
    //
    // MIGRATED 2026-10-30 (crew page redesign spec §4.1, Task 7). The toggle
    // used to mount for identity-less viewers only; it now mounts for EVERY
    // crew-page viewer, just before the avatar menu when there is an identity
    // (the avatar stays at the row's right edge, where its `right-0` popover was
    // sized against the page gutter). So the structure is pinned in BOTH
    // branches, each by its own premise, and the children list names which
    // branch rendered.
    //
    // jsdom does not lay out, so this pins the STRUCTURE, which is the thing
    // that would silently change if someone reintroduced a wrapper. The
    // real-browser geometry for the OTHER two consumers is in
    // tests/e2e/theme-persistence-note.spec.ts; the crew header's toggle is
    // measured by tests/e2e/theme-toggle.spec.ts's tap-target case, and beside
    // a real identity chip by tests/e2e/crew-wide-nav.spec.ts's header case.
    const chip = <span data-testid="header-test-fixture-chip">Alice · Audio A1</span>;
    for (const [identityChip, identity, children] of [
      [undefined, "none", ["page-header-fxav-wordmark", "theme-toggle"]],
      [chip, null, ["theme-toggle", "header-test-fixture-chip"]],
    ] as const) {
      const { getByTestId, unmount } = render(
        <Header show={baseShow} identityChip={identityChip} />,
      );

      const slot = getByTestId("page-header-right-slot");
      const toggle = getByTestId("theme-toggle");

      // PREMISE: the branch under test is the one named. Without it the
      // assertions below could pass on the wrong slot.
      expect(slot.getAttribute("data-identity")).toBe(identity);

      expect(toggle.tagName).toBe("BUTTON");
      expect(toggle.parentElement).toBe(slot);
      expect([...slot.children].map((el) => el.getAttribute("data-testid"))).toEqual(children);
      unmount();
    }
  });

  it("does NOT hide the identityChip slot on mobile (no `hidden sm:block` class regression)", () => {
    const chip = <span data-testid="header-test-fixture-chip">Alice · Audio A1</span>;
    const { getByTestId } = render(<Header show={baseShow} identityChip={chip} />);
    // Crew on the mobile viewport rely on "Not you?" — the slot must NOT
    // inherit the FXAV wordmark's mobile-hidden treatment.
    const slot = getByTestId("page-header-right-slot");
    expect(slot.className).not.toContain("hidden");
    expect(slot.className).not.toContain("sm:block");
  });
});
