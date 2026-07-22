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
    expect(menu.querySelectorAll('[data-testid^="attention-menu-row-"]')).toHaveLength(1);

    // needs-a-look group: heading present, and each link asserted INSIDE its
    // OWN row (whole-diff R1 P2: a menu-wide query would pass with the links
    // rendered under a different group).
    expect(within(menu).getByText("Needs a look")).toBeInTheDocument();
    const sheetRow = within(menu).getByTestId(
      "attention-needslook-row-alert:t3-full-attention-split-alert-0",
    );
    const sheetLink = within(sheetRow).getByRole("link", { name: /Open in Sheet/ });
    expect(sheetLink).toHaveAttribute(
      "href",
      "https://docs.google.com/spreadsheets/d/gallery-fixture-file/edit#gid=0",
    );
    expect(sheetLink).toHaveAttribute("target", "_blank");
    expect(sheetLink.textContent).toContain("↗");
    const overviewRow = within(menu).getByTestId(
      "attention-needslook-row-alert:t3-full-attention-split-alert-1",
    );
    const overviewLink = within(overviewRow).getByRole("link", { name: /Go to Overview/ });
    expect(overviewLink).not.toHaveAttribute("target");
    expect(overviewLink.getAttribute("href")).toMatch(/#overview$/);
    // the two self-heal items must NOT get needs-look rows
    expect(menu.querySelectorAll('[data-testid^="attention-needslook-row-"]')).toHaveLength(2);

    // monitoring group, scoped WITHOUT structural assumptions (whole-diff R2:
    // closest/parentElement depends on incidental nesting). Conclusive form:
    // (a) "Monitoring" is the LAST group heading in document order, (b) the
    // summary FOLLOWS it, and (c) the summary is inside no other group's row —
    // together the summary can only live in the Monitoring section.
    const monHeading = within(menu).getByText("Monitoring");
    const summary = within(menu).getByText("2 clearing on their own, no action needed");
    const follows = (a: Node, b: Node) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(within(menu).getByText("Needs your confirmation"), monHeading)).toBe(true);
    expect(follows(within(menu).getByText("Needs a look"), monHeading)).toBe(true);
    expect(follows(monHeading, summary)).toBe(true);
    for (const row of menu.querySelectorAll(
      '[data-testid^="attention-menu-row-"], [data-testid^="attention-needslook-row-"]',
    )) {
      expect(row.contains(summary)).toBe(false);
    }
    // Membership proof (whole-diff R3): the NEAREST COMMON ANCESTOR of the
    // summary and the Monitoring heading must contain NO other group's
    // heading. In-group placement makes the NCA the group wrapper (other
    // headings absent); ANY misplacement — another group, a footer after all
    // groups — widens the NCA to a container that also holds the other
    // headings, and the assertion fails. No structural nesting assumed beyond
    // groups being disjoint subtrees, which is what "grouped" means.
    let scope: HTMLElement = summary.parentElement as HTMLElement;
    while (!scope.contains(monHeading)) scope = scope.parentElement as HTMLElement;
    expect(within(scope).queryByText("Needs your confirmation")).toBeNull();
    expect(within(scope).queryByText("Needs a look")).toBeNull();
  });
});
