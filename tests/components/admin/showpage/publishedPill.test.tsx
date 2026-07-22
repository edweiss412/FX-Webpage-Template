// @vitest-environment jsdom
/**
 * Composite attention pill presence matrix
 * (spec 2026-07-21-attention-needs-attention-split §3.2, §11.5).
 *
 * Full 9-row matrix over (actionable, needsLook, selfHeal) presence. Counts
 * derive from fixture composition, never mirrored constants. Failure modes
 * caught: the second count vanishing when action items exist (the core bug);
 * a leading middot when actionable=0; monitoring hidden beside actionable;
 * dropped sr-only accessible expansion (inherited from #537).
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

describe("composite attention pill (spec §3.2 / §11.5 matrix)", () => {
  it("(3,4,2) all three segments; review + monitoring do NOT vanish", () => {
    const pill = renderPill(3, 4, 2);
    expect(pill.textContent).toMatch(/3 to confirm[\s\S]*4 to review[\s\S]*2 monitoring/);
  });

  it("(3,0,0) confirm only", () => {
    expect(renderPill(3, 0, 0).textContent).toMatch(/3 to confirm/);
  });

  it("(3,4,0) confirm + review", () => {
    expect(renderPill(3, 4, 0).textContent).toMatch(/3 to confirm[\s\S]*4 to review/);
  });

  it("(3,0,2) monitoring does NOT vanish beside actionable", () => {
    expect(renderPill(3, 0, 2).textContent).toMatch(/3 to confirm[\s\S]*2 monitoring/);
  });

  it("(0,4,0) review only, NO leading middot", () => {
    const t = (renderPill(0, 4, 0).textContent ?? "").trim();
    expect(t.startsWith("·")).toBe(false);
    expect(t).toMatch(/^4 to review/);
  });

  it("(0,4,2) review + monitoring, NO leading middot", () => {
    const t = (renderPill(0, 4, 2).textContent ?? "").trim();
    expect(t.startsWith("·")).toBe(false);
    expect(t).toMatch(/4 to review[\s\S]*2 monitoring/);
  });

  it("(0,0,1) monitoring-only is NON-interactive (no button role)", () => {
    const pill = renderPill(0, 0, 1);
    expect(pill.tagName).not.toBe("BUTTON");
    expect(pill.textContent).toMatch(/1 monitoring/);
  });

  it("(0,0,0) In sync", () => {
    expect(renderPill(0, 0, 0).textContent).toMatch(/In sync/);
  });

  it("degraded all-zero shows Alerts unavailable", () => {
    expect(renderPill(0, 0, 0, true).textContent).toMatch(/Alerts unavailable/);
  });

  it("monitoring segment carries the inherited sr-only expansion (visible terse)", () => {
    const pill = renderPill(0, 0, 2);
    const srOnly = pill.querySelector<HTMLElement>(".sr-only");
    expect(srOnly).not.toBeNull();
    expect(srOnly!.textContent).toBe("clearing on their own, no action needed");
    expect(pill.textContent).toBe("2 monitoring clearing on their own, no action needed");
  });

  it("clearing items WITHOUT clearingKind default fail-visible into the review count", () => {
    // legacy/unknown clearing item (no clearingKind) must be visible, not dropped (spec §2)
    renderPublishedModal([], { attentionItems: [clearingAlertItem("legacy")] });
    const pill = screen.getByTestId("published-show-review-alert-pill");
    expect(pill.textContent).toMatch(/1 to review/);
  });
});
