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
import { cleanup, fireEvent, screen } from "@testing-library/react";

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
    [0, 0, 1, "1 monitoring", true],
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
    expect(pill.querySelector('[class~="border-status-positive"]')).not.toBeNull();
  });

  it("monitoring-only pill keeps its hollow dot and no solid review dot", () => {
    const pill = renderPill(0, 0, 1);
    expect(pill.querySelector('[class~="border-status-positive"]')).not.toBeNull();
    expect(pill.querySelector('[class~="bg-status-review"]')).toBeNull();
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

describe("monitoring-only quiet interactive pill (monitoring-badge-expand §3.1)", () => {
  it("(0,0,2) quiet button: opens menu, positive root pins, zero warning classes root-inclusive, positive subtle descendants, no leading middot", () => {
    const pill = renderPill(0, 0, 2);
    expect(pill.tagName).toBe("BUTTON");
    expect(pill).toHaveAttribute("aria-expanded", "false");
    // impeccable critique P1 (2026-07-22): the quiet BUTTON must be visually
    // separable from the non-interactive gray spans (In sync / Alerts
    // unavailable) - it carries a border the spans lack, and hover feedback
    // moves the border (not a fade toward the page bg).
    for (const cls of [
      "bg-surface-sunken",
      "text-text-subtle",
      "border",
      "border-border",
      "hover:border-border-strong",
    ]) {
      expect(pill.className.split(/\s+/)).toContain(cls);
    }
    expect(pill.className.split(/\s+/)).not.toContain("hover:bg-surface-sunken/80");
    // getAttribute("class") - SVG className is SVGAnimatedString, .className would miss it
    expect(
      [pill, ...pill.querySelectorAll("*")].filter((el) =>
        /warning/.test(el.getAttribute("class") ?? ""),
      ),
    ).toHaveLength(0);
    // positive descendant tone pins (spec §5.1): segment wrapper + chevron carry text-text-subtle
    const seg = pill.querySelector('[data-testid="attention-pill-monitoring-segment"]');
    expect((seg?.getAttribute("class") ?? "").split(/\s+/)).toContain("text-text-subtle");
    const chev = pill.querySelector("svg");
    expect((chev?.getAttribute("class") ?? "").split(/\s+/)).toContain("text-text-subtle");
    expect(visibleText(pill)).toBe("2 monitoring"); // no leading middot
    fireEvent.click(pill);
    expect(pill).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("published-show-review-attention-menu")).toBeInTheDocument();
  });

  it("(0,0,1) keeps the title attribute and the hit-band classes (§10 T-TAP inheritance)", () => {
    const pill = renderPill(0, 0, 1);
    expect(pill).toHaveAttribute("title", "1 monitoring, clearing on their own, no action needed");
    for (const cls of ["before:absolute", "before:inset-x-0", "before:-inset-y-3"]) {
      expect(pill.className.split(/\s+/)).toContain(cls);
    }
  });

  it("composite pill keeps the amber positive pins (root warning trio present)", () => {
    const pill = renderPill(1, 0, 1);
    for (const cls of ["bg-warning-bg", "text-warning-text", "hover:bg-warning-bg/80"]) {
      expect(pill.className.split(/\s+/)).toContain(cls);
    }
    expect(pill.className.split(/\s+/)).not.toContain("bg-surface-sunken");
  });
});

describe("pill-side treatment tripwires (monitoring-badge-expand §3.4, both palettes)", () => {
  for (const [a, n, s2, label] of [
    [1, 0, 1, "composite/amber"],
    [0, 0, 1, "monitoring-only/quiet"],
  ] as const) {
    it(`(${a},${n},${s2}) ${label}: root cross-fades, descendants transition-free, chevron transform-only`, () => {
      const pill = renderPill(a, n, s2);
      const rootClasses = pill.className.split(/\s+/);
      expect(rootClasses).toContain("transition-colors");
      expect(rootClasses).toContain("duration-fast");
      const seg = pill.querySelector('[data-testid="attention-pill-monitoring-segment"]');
      expect(seg).not.toBeNull();
      const dots = [...pill.querySelectorAll('[class*="rounded-pill"]')].filter(
        (el) => el !== pill,
      );
      const middots = [...pill.querySelectorAll("span")].filter(
        (el) => (el.textContent ?? "").trim() === "·",
      );
      for (const el of [seg!, ...dots, ...middots]) {
        const cls = el.getAttribute("class") ?? "";
        expect(cls, `transition class on ${cls}`).not.toMatch(/transition/);
        expect(cls, `animate class on ${cls}`).not.toMatch(/animate/);
        const st = (el as HTMLElement).style;
        expect(st.transition ?? "").toBe("");
        expect(st.transitionProperty ?? "").toBe("");
        expect(st.transitionDuration ?? "").toBe("");
        expect(st.animation ?? "").toBe("");
      }
      const chev = pill.querySelector("svg");
      // allowed set: the rotation transition + its motion-reduce DISABLER —
      // any other transition spelling (colors, all, arbitrary) fails.
      const chevTransitions = (chev?.getAttribute("class") ?? "")
        .split(/\s+/)
        .filter((c) => c.includes("transition") && c !== "motion-reduce:transition-none");
      expect(chevTransitions).toEqual(["transition-transform"]);
    });
  }
});
