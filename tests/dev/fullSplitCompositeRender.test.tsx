// @vitest-environment jsdom
/**
 * RENDERED pin for the curated full-split composite (spec
 * docs/superpowers/specs/2026-07-22-attention-gallery-curated-composite.md §4.5).
 *
 * The derivation-level pins prove the classification and action objects; this
 * test proves the TAUGHT STATE — the scenario mounted through the REAL
 * PublishedReviewModal (the same component the gallery route renders), pill and
 * menu included. A component regression that changes what the gallery shows
 * fails here, not in a manual gallery visit.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

import {
  installModalDomStubs,
  renderPublishedModal,
} from "../components/admin/showpage/__fixtures__/publishedModalHarness";
import { scenarioById } from "@/lib/dev/attentionScenarios/index";
import { T3_FULL_SPLIT } from "@/lib/dev/attentionScenarios/tier3";
import { deriveScenarioAttention } from "@/lib/dev/deriveScenarioAttention";

beforeEach(installModalDomStubs);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

/** Sighted-user text: clone, drop sr-only nodes, normalize spaces. */
function visibleText(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement;
  for (const sr of clone.querySelectorAll(".sr-only")) sr.remove();
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

function mountScenario() {
  const s = scenarioById(T3_FULL_SPLIT);
  if (!s) throw new Error("composite missing from catalog");
  renderPublishedModal([], { attentionItems: deriveScenarioAttention(s) });
}

describe("t3-full-attention-split renders the full taught state", () => {
  it("pill: exactly '1 to confirm · 2 to review · 2 monitoring' on an interactive BUTTON", () => {
    mountScenario();
    const pill = screen.getByTestId("published-show-review-alert-pill");
    expect(visibleText(pill)).toBe("1 to confirm · 2 to review · 2 monitoring");
    expect(pill.tagName).toBe("BUTTON");
  });

  it("menu: all three groups with headers, links, and the monitoring summary", () => {
    mountScenario();
    const pill = screen.getByTestId("published-show-review-alert-pill");
    // §5.2 auto-open may have opened the menu already (actionable > 0); only
    // click if it is still closed.
    if (!screen.queryByTestId("published-show-review-attention-menu")) fireEvent.click(pill);
    const menu = screen.getByTestId("published-show-review-attention-menu");

    // confirmation group: header + exactly one actionable row (the hold)
    expect(within(menu).getByText("Needs your confirmation")).toBeInTheDocument();
    expect(
      menu.querySelectorAll('[data-testid^="attention-menu-row-"]'),
    ).toHaveLength(1);

    // needs-a-look group: heading + external sheet link + internal overview link
    expect(within(menu).getByText("Needs a look")).toBeInTheDocument();
    const sheetLink = within(menu).getByRole("link", { name: /Open in Sheet/ });
    expect(sheetLink).toHaveAttribute(
      "href",
      "https://docs.google.com/spreadsheets/d/gallery-fixture-file/edit#gid=0",
    );
    expect(sheetLink).toHaveAttribute("target", "_blank");
    expect(sheetLink.textContent).toContain("↗");
    const overviewLink = within(menu).getByRole("link", { name: /Go to Overview/ });
    expect(overviewLink).not.toHaveAttribute("target");
    expect(overviewLink.getAttribute("href")).toMatch(/#overview$/);

    // monitoring group: heading + exact summary copy, items NOT enumerated
    expect(within(menu).getByText("Monitoring")).toBeInTheDocument();
    expect(
      within(menu).getByText("2 clearing on their own, no action needed"),
    ).toBeInTheDocument();
  });
});
