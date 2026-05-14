// @vitest-environment jsdom
/**
 * tests/components/Header.test.tsx — page-header rebalance contract
 * (M9 C1 / M4-D3 shape brief §5.2).
 *
 * The header shrinks to a context strip: text-base/lg semibold title,
 * text-xs meta line, no orange hairline, FXAV wordmark in text-faint, and
 * tight vertical padding. The RightNowCard becomes the page's primary
 * visual moment unambiguously.
 *
 * Pre-rebalance (M4 catch-up critique Finding 5): title at text-2xl
 * sm:text-3xl font-bold competed with the RightNowCard for the hero spot;
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
    const wordmark = container.querySelector('p[aria-label="FXAV"]');
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
