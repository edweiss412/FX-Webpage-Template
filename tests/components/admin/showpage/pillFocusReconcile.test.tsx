// @vitest-environment jsdom
/**
 * Menu-open → pill-non-interactive state reconciliation
 * (spec 2026-07-21-attention-needs-attention-split §6, §6a, §8 compound case 2, §11.5a).
 *
 * The transition set is the GENERATED cartesian ENTRY × EXIT product — never a
 * hand-listed table (hand lists dropped cells in review rounds R5/R6). For each
 * cell: open the menu at an interactive entry state, move focus into it, drive
 * live data to a non-interactive exit, and assert the §6 OUTCOME: menu closed,
 * no stale aria-expanded, focus NOT dropped to <body>.
 *
 * jsdom tier of the §6a probe: it verifies the state reconciliation + focus
 * fallback logic. The real-browser Playwright probe remains the ratification
 * for paint-order/focus-race behavior jsdom cannot observe.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

import {
  actionableAlertItem,
  needsLookAlertItem,
  selfHealAlertItem,
  installModalDomStubs,
  publishedModalElement,
  renderPublishedModal,
} from "./__fixtures__/publishedModalHarness";

beforeEach(installModalDomStubs);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function items(nA: number, nNeed: number, nSelf: number) {
  return [
    ...Array.from({ length: nA }, (_, i) => actionableAlertItem(`a${i}`)),
    ...Array.from({ length: nNeed }, (_, i) => needsLookAlertItem(`n${i}`)),
    ...Array.from({ length: nSelf }, (_, i) => selfHealAlertItem(`s${i}`)),
  ];
}

// ENTRY: every interactive [actionable, needsLook] shape. EXIT: every
// non-interactive target (B monitoring-only, C degraded, D in-sync).
const ENTRY: Array<[number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
];
const EXIT = [
  { label: "B monitoring-only", selfHeal: 1, degraded: false },
  { label: "C degraded", selfHeal: 0, degraded: true },
  { label: "D in-sync", selfHeal: 0, degraded: false },
] as const;
const cells = ENTRY.flatMap(([a, n]) => EXIT.map((x) => ({ a, n, x })));

describe("menu-open → non-interactive reconciliation (§11.5a, generated product)", () => {
  it("covers exactly 9 cells (a shrunk product fails here)", () => {
    expect(cells.length).toBe(9);
  });

  for (const { a, n, x } of cells) {
    it(`open [a=${a},n=${n}] → ${x.label}: menu closes, no stale aria-expanded, focus not on body`, async () => {
      const { rerender } = renderPublishedModal([], {
        attentionItems: items(a, n, 1),
      });
      // open the menu and move focus INTO it
      const pill = screen.getByTestId("published-show-review-alert-pill");
      fireEvent.click(pill);
      const menu = screen.getByTestId("published-show-review-attention-menu");
      const focusable = menu.querySelector<HTMLElement>("button, a");
      // needs-look-only menus may have no interactive descendant when the action
      // did not resolve; focus the pill itself then (still inside the subtree).
      (focusable ?? pill).focus();
      expect(document.activeElement).not.toBe(document.body);

      // drive live data to the non-interactive exit state
      rerender(
        publishedModalElement([], {
          attentionItems: items(0, 0, x.selfHeal),
          alertsDegraded: x.degraded,
        }),
      );

      // §6 outcome contract — the unmount is same-render (derived open state +
      // render-phase flag reconciliation); waitFor also covers the post-commit
      // focus-rescue effect.
      await waitFor(() => {
        expect(screen.queryByTestId("published-show-review-attention-menu")).toBeNull();
      });
      expect(document.querySelector('[aria-expanded="true"]')).toBeNull();
      // The rescue contract targets the dialog ROOT specifically (tabindex is
      // ensured, then focus()); "any dialog descendant" would also pass a
      // rescue that never ran when focus started inside the subtree.
      expect(document.activeElement, "focus not on the dialog root").toBe(
        document.querySelector('[role="dialog"]'),
      );
    });
  }

  it("rebound: interactive flips false -> true before the frame; the close still completes", async () => {
    // Whole-diff review 2026-07-22: with a deferred (rAF) flag cleanup, a
    // 1-frame interactivity rebound cancelled the pending close and the stale
    // menuOpen=true remounted the menu (worse: re-armed §5.2 auto-open).
    // Render-phase reconciliation closes the flag in the SAME render.
    const { rerender } = renderPublishedModal([], { attentionItems: items(1, 0, 1) });
    const pill = screen.getByTestId("published-show-review-alert-pill");
    fireEvent.click(pill);
    expect(screen.getByTestId("published-show-review-attention-menu")).toBeInTheDocument();

    // non-interactive blip... (menu unmounts, close scheduled)
    rerender(publishedModalElement([], { attentionItems: items(0, 0, 1) }));
    // ...and the rebound BEFORE any frame elapses
    rerender(publishedModalElement([], { attentionItems: items(1, 0, 1) }));

    // the render-phase reconciliation closed the flag SYNCHRONOUSLY on the
    // blip render — the rebound render finds menuOpen already false, so
    // there is nothing to resurrect and no auto-open re-fire (one-shot was
    // consumed while the menu was open).
    expect(screen.queryByTestId("published-show-review-attention-menu")).toBeNull();
    expect(
      screen.getByTestId("published-show-review-alert-pill").getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.queryByTestId("published-show-review-attention-menu")).toBeNull();

    // and a REAL user reopen still works afterwards
    fireEvent.click(screen.getByTestId("published-show-review-alert-pill"));
    expect(screen.getByTestId("published-show-review-attention-menu")).toBeInTheDocument();
  });
});
