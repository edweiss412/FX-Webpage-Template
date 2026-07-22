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
import { autoResolveNote } from "@/lib/adminAlerts/audience";
import { messageFor, type MessageCode } from "@/lib/messages/lookup";

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

  it("menu: all three groups with headers, links, and enumerated monitoring rows", () => {
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

    // monitoring group: "Monitoring" is the LAST group heading in document
    // order, and the rows are scoped to the group wrapper's own testid.
    const monHeading = within(menu).getByText("Monitoring");
    const follows = (a: Node, b: Node) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(within(menu).getByText("Needs your confirmation"), monHeading)).toBe(true);
    expect(follows(within(menu).getByText("Needs a look"), monHeading)).toBe(true);
    // monitoring-badge-expand §3.2: the summary is retired; the group
    // enumerates one row per self-heal item. Expected titles resolved
    // INDEPENDENTLY of the rendered props via the message catalog (the
    // scenario/fixture menuTitle feeds the render and would be tautological).
    expect(within(menu).queryByText(/clearing on their own, no action needed/)).toBeNull();
    const group = within(menu).getByTestId("attention-monitoring-group");
    expect(group.contains(monHeading)).toBe(true);
    const scenario = scenarioById(T3_FULL_SPLIT);
    if (!scenario) throw new Error("composite missing from catalog");
    const selfHealCodes = deriveScenarioAttention(scenario)
      .filter((i) => i.clearingKind === "self_heal")
      .map((i) => (i.kind === "alert" ? i.alert.code : "__none__"));
    expect(selfHealCodes).toHaveLength(2);
    const rows = within(group).getAllByTestId(/attention-monitoring-row-/);
    expect(rows).toHaveLength(2);
    for (const [idx, code] of selfHealCodes.entries()) {
      const row = rows[idx]!;
      expect(within(row).getByText(messageFor(code as MessageCode).title!)).toBeInTheDocument();
      expect(within(row).getByText(autoResolveNote(code))).toBeInTheDocument();
    }
    // Membership proof: monitoring rows live in the Monitoring group ONLY —
    // no other group's heading inside the group wrapper.
    expect(within(group).queryByText("Needs your confirmation")).toBeNull();
    expect(within(group).queryByText("Needs a look")).toBeNull();
  });
});
