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
  // main changed this scenario's monitoring count 2 -> 1 while this branch
  // changed the vocabulary; the resolution takes BOTH.
  it("pill: exactly '3 issues · 1 monitoring' on an interactive BUTTON", () => {
    mountScenario();
    const pill = screen.getByTestId("published-show-review-alert-pill");
    expect(visibleText(pill)).toBe("3 issues · 1 monitoring");
    expect(pill.tagName).toBe("BUTTON");
  });

  it("menu: two groups with headers, links, and enumerated monitoring rows", () => {
    mountScenario();
    const pill = screen.getByTestId("published-show-review-alert-pill");
    // §5.2 auto-open may have opened the menu already (actionable > 0); only
    // click if it is still closed.
    if (!screen.queryByTestId("published-show-review-attention-menu")) fireEvent.click(pill);
    const menu = screen.getByTestId("published-show-review-attention-menu");

    // merged needs-you group: ONE header (attention-index §2.1) over the hold
    // plus the two former needs-look rows.
    expect(within(menu).getByText("Needs you")).toBeInTheDocument();
    expect(within(menu).queryByText("Needs your confirmation")).toBeNull();
    expect(within(menu).queryByText("Needs a look")).toBeNull();
    // one merged group: the hold plus the two former needs-look rows
    expect(menu.querySelectorAll('[data-testid^="attention-menu-row-"]')).toHaveLength(3);

    // attention-index §2.2: the inner action links are GONE — the row itself is
    // the affordance, and the way out moved onto the card as a destination chip
    // (§2.3, covered by the AttentionBanner suite). Each row is asserted to be a
    // pressable button carrying NO link, scoped to its own testid so a link
    // rendered anywhere else in the menu could not satisfy it.
    for (const id of [
      "attention-menu-row-alert:t3-full-attention-split-alert-0",
      "attention-menu-row-alert:t3-full-attention-split-alert-1",
    ]) {
      const row = within(menu).getByTestId(id);
      expect(row.tagName).toBe("BUTTON");
      expect(row.querySelectorAll("a")).toHaveLength(0);
    }
    // the fix hints survive as the rows' second line
    expect(
      within(menu).getByText(/Re-share the sheet with the service account\./),
    ).toBeInTheDocument();
    // the two self-heal items must NOT get needs-look rows
    // the two sheet-fix rows are now ordinary needs-you rows (no inner links)
    expect(menu.querySelectorAll('[data-testid^="attention-needslook-row-"]')).toHaveLength(0);

    // monitoring group: "Monitoring" is the LAST group heading in document
    // order, and the rows are scoped to the group wrapper's own testid.
    const monHeading = within(menu).getByText("Monitoring");
    const follows = (a: Node, b: Node) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(within(menu).getByText("Needs you"), monHeading)).toBe(true);
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
    expect(selfHealCodes).toHaveLength(1);
    const rows = within(group).getAllByTestId(/attention-monitoring-row-/);
    expect(rows).toHaveLength(selfHealCodes.length);
    for (const [idx, code] of selfHealCodes.entries()) {
      const row = rows[idx]!;
      expect(within(row).getByText(messageFor(code as MessageCode).title!)).toBeInTheDocument();
      expect(within(row).getByText(autoResolveNote(code))).toBeInTheDocument();
    }
    // Membership proof: monitoring rows live in the Monitoring group ONLY —
    // no other group's heading inside the group wrapper.
    // Re-pointed at the SURVIVING heading (attention-index §2.1): asserting the
    // absence of retired strings would be vacuous — they exist nowhere now.
    expect(within(group).queryByText("Needs you")).toBeNull();
  });
});
