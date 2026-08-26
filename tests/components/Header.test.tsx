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

  it("renders meta row (date · venue) at text-xs (was text-sm)", () => {
    const { container } = render(<Header show={baseShow} />);
    const time = container.querySelector("time");
    expect(time).not.toBeNull();
    const metaRow = time?.parentElement;
    expect(metaRow?.tagName.toLowerCase()).toBe("p");
    const cls = metaRow?.className ?? "";
    expect(cls).toContain("text-xs");
    expect(cls).not.toContain("text-sm");
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
    expect(scoped.getByText("FXAV Client")).not.toBeNull();
    expect(scoped.getByText("April 17, 2026")).not.toBeNull();
    expect(scoped.getByText("Hilton Anatole")).not.toBeNull();
  });

  it("omits the meta row entirely when date and venue are both null", () => {
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

  it("omits the client-label eyebrow entirely when client_label is null (R2 M2 — title carries alone)", () => {
    const showNoLabel = { ...baseShow, client_label: null as never };
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

  it("omits the client-label eyebrow entirely when client_label is empty string", () => {
    const showEmptyLabel = { ...baseShow, client_label: "" };
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

  it("mounts the toggle as a DIRECT child of the right slot, with no wrapper around it", () => {
    // The crew header is the third consumer of the standalone toggle and the
    // only one whose branch is conditional (no resolved identity). Until
    // 2026-08-26 `ThemeToggle` returned a `relative inline-flex` span around
    // its button to anchor the persist-failure bubble; the note was removed and
    // the wrapper went with it, which makes the button a direct flex child of
    // this row rather than a wrapped one.
    //
    // jsdom does not lay out, so this pins the STRUCTURE, which is the thing
    // that would silently change if someone reintroduced a wrapper. The
    // real-browser geometry for the OTHER two consumers is in
    // tests/e2e/theme-persistence-note.spec.ts; this branch has no e2e of its
    // own, and that is a stated limit rather than an oversight — reaching it
    // needs a seeded show, a share token, and no picked identity.
    const { getByTestId } = render(<Header show={baseShow} />);

    const slot = getByTestId("page-header-right-slot");
    const toggle = getByTestId("theme-toggle");

    // PREMISE: this is the no-identity branch, the only one that renders the
    // standalone toggle. Without it the assertions below would pass on the
    // wrong slot.
    expect(slot.getAttribute("data-identity")).toBe("none");

    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle.parentElement).toBe(slot);
    expect([...slot.children].map((el) => el.getAttribute("data-testid"))).toEqual([
      "page-header-fxav-wordmark",
      "theme-toggle",
    ]);
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
