// @vitest-environment jsdom
/**
 * Composite attention pill presence matrix
 * (spec 2026-07-21-attention-needs-attention-split §3.2, §11.5).
 *
 * Full 9-row matrix over (actionable, needsLook, selfHeal) presence. Counts
 * derive from fixture composition, never mirrored constants. Assertions use
 * EXACT visible text (sr-only stripped) so a dropped middot separator, a
 * leaked sr-only expansion, or a vanished segment all fail — regex
 * `[\s\S]*` matching passed with no separator at all (whole-diff review
 * 2026-07-22). Every row also pins the trigger element type (BUTTON vs
 * SPAN), not just one cell.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

import {
  actionableAlertItem,
  clearingAlertItem,
  needsLookAlertItem,
  selfHealAlertItem,
  installModalDomStubs,
  renderPublishedModal,
} from "./__fixtures__/publishedModalHarness";

beforeEach(installModalDomStubs);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function renderPill(nA: number, nNeed: number, nSelf: number, degraded = false) {
  const attentionItems = [
    ...Array.from({ length: nA }, (_, i) => actionableAlertItem(`a${i}`)),
    ...Array.from({ length: nNeed }, (_, i) => needsLookAlertItem(`n${i}`)),
    ...Array.from({ length: nSelf }, (_, i) => selfHealAlertItem(`s${i}`)),
  ];
  renderPublishedModal([], { attentionItems, alertsDegraded: degraded });
  return screen.getByTestId("published-show-review-alert-pill");
}

/** Sighted-user text: clone the pill, drop sr-only nodes, normalize spaces. */
function visibleText(pill: HTMLElement): string {
  const clone = pill.cloneNode(true) as HTMLElement;
  for (const el of clone.querySelectorAll(".sr-only")) el.remove();
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** sr-only-only text (what AT hears beyond the visible string). */
function srText(pill: HTMLElement): string {
  return Array.from(pill.querySelectorAll<HTMLElement>(".sr-only"))
    .map((el) => el.textContent ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("composite attention pill (spec §3.2 / §11.5 matrix, exact visible text)", () => {
  // [a, n, s, expected visible text, interactive]
  const MATRIX: Array<[number, number, number, string, boolean]> = [
    [3, 4, 2, "3 to confirm · 4 to review · 2 monitoring", true],
    [3, 0, 0, "3 to confirm", true],
    [3, 4, 0, "3 to confirm · 4 to review", true],
    [3, 0, 2, "3 to confirm · 2 monitoring", true],
    [0, 4, 0, "4 to review", true],
    [0, 4, 2, "4 to review · 2 monitoring", true],
    [0, 0, 1, "1 monitoring", false],
    [0, 0, 0, "In sync", false],
  ];

  for (const [a, n, s, expected, interactive] of MATRIX) {
    it(`(${a},${n},${s}) visible text is exactly "${expected}"; ${
      interactive ? "BUTTON" : "not a button"
    }`, () => {
      const pill = renderPill(a, n, s);
      expect(visibleText(pill)).toBe(expected);
      if (interactive) expect(pill.tagName).toBe("BUTTON");
      else expect(pill.tagName).not.toBe("BUTTON");
    });
  }

  it("degraded all-zero shows Alerts unavailable (non-interactive)", () => {
    const pill = renderPill(0, 0, 0, true);
    expect(visibleText(pill)).toBe("Alerts unavailable");
    expect(pill.tagName).not.toBe("BUTTON");
  });

  it("composite monitoring segment carries the hollow status dot (spec §3.2)", () => {
    const pill = renderPill(3, 0, 2);
    // solid review dot leads the pill; the appended monitoring segment gets its
    // own HOLLOW positive-tone dot, matching the monitoring-only pill's cue.
    expect(pill.querySelector('[class*="border-status-positive"]')).not.toBeNull();
  });

  it("monitoring-only pill keeps its hollow dot and no solid review dot", () => {
    const pill = renderPill(0, 0, 1);
    expect(pill.querySelector('[class*="border-status-positive"]')).not.toBeNull();
    expect(pill.querySelector('[class*="bg-status-review"]')).toBeNull();
  });

  it("monitoring segment carries the inherited sr-only expansion (visible terse)", () => {
    const pill = renderPill(0, 0, 2);
    expect(visibleText(pill)).toBe("2 monitoring");
    expect(srText(pill)).toBe("clearing on their own, no action needed");
  });

  it("clearing items WITHOUT clearingKind default fail-visible into the review count", () => {
    // legacy/unknown clearing item (no clearingKind) must be visible, not dropped (spec §2)
    renderPublishedModal([], { attentionItems: [clearingAlertItem("legacy")] });
    const pill = screen.getByTestId("published-show-review-alert-pill");
    expect(visibleText(pill)).toBe("1 to review");
  });
});

describe("99+ caps: EVERY pill count path caps visibly and keeps the exact count for AT", () => {
  it("(0,120,0) review segment caps; sr-only carries the exact count", () => {
    const pill = renderPill(0, 120, 0);
    expect(visibleText(pill)).toBe("99+ to review");
    expect(srText(pill)).toContain("(120 to review)");
  });

  it("(3,0,150) composite monitoring caps; sr-only carries the exact count", () => {
    const pill = renderPill(3, 0, 150);
    expect(visibleText(pill)).toBe("3 to confirm · 99+ monitoring");
    expect(srText(pill)).toContain("(150 monitoring)");
  });

  it("(0,0,150) monitoring-only pill caps; sr-only + title carry the exact count", () => {
    const pill = renderPill(0, 0, 150);
    expect(visibleText(pill)).toBe("99+ monitoring");
    expect(srText(pill)).toContain("(150 monitoring)");
    expect(pill.getAttribute("title")).toContain("150 monitoring");
  });
});

describe("mistagged actionable item (spec §3.3 boundary guard)", () => {
  it("an actionable item wrongly tagged self_heal counts ONLY as confirm, never monitoring", () => {
    const rogue = { ...actionableAlertItem("rogue"), clearingKind: "self_heal" as const };
    renderPublishedModal([], { attentionItems: [rogue] });
    const pill = screen.getByTestId("published-show-review-alert-pill");
    expect(visibleText(pill)).toBe("1 to confirm");
  });
});
