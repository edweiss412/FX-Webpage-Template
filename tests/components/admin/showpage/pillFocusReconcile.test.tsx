// @vitest-environment jsdom
/**
 * Menu-open → pill-non-interactive state reconciliation
 * (split spec §6/§6a/§8 case 2/§11.5a, amended by monitoring-badge-expand §3.3:
 * monitoring-only is now a fourth INTERACTIVE entry shape; the exit set is C/D
 * only, and interactive→monitoring-only STAYS OPEN).
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

// ENTRY: every interactive shape incl. monitoring-only [0,0] (selfHeal=1 boot).
// EXIT: every non-interactive target (C degraded, D in-sync) — B monitoring-only
// left the exit set (monitoring-badge-expand §3.3: it is interactive now).
const ENTRY: Array<[number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [0, 0],
];
const EXIT = [
  { label: "C degraded", selfHeal: 0, degraded: true },
  { label: "D in-sync", selfHeal: 0, degraded: false },
] as const;
const cells = ENTRY.flatMap(([a, n]) => EXIT.map((x) => ({ a, n, x })));

describe("menu-open → non-interactive reconciliation (§11.5a, generated product)", () => {
  it("covers exactly 8 cells (a shrunk product fails here)", () => {
    expect(cells.length).toBe(8);
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

    // non-interactive blip (monitoring-badge-expand: (0,0,1) is interactive
    // now, so the blip target is D in-sync)... (menu unmounts, close scheduled)
    rerender(publishedModalElement([], { attentionItems: items(0, 0, 0) }));
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

// ---------------------------------------------------------------------------
// monitoring-badge-expand §3.3 / §5 item 5: stays-open matrices, rescue
// generality, node identity. jsdom tier — the e2e probes are authoritative for
// browser removal-focus semantics; these pin the mechanism's generality.
// ---------------------------------------------------------------------------

const NL_ACTION = { label: "Open in Sheet", href: "https://example.com/sheet", external: true };

function itemsWithLink(nA: number, nNeed: number, nSelf: number) {
  return [
    ...Array.from({ length: nA }, (_, i) => actionableAlertItem(`a${i}`)),
    ...Array.from({ length: nNeed }, (_, i) => needsLookAlertItem(`n${i}`, NL_ACTION)),
    ...Array.from({ length: nSelf }, (_, i) => selfHealAlertItem(`s${i}`)),
  ];
}

const WARNING_SWEEP = (pill: HTMLElement) =>
  [pill, ...pill.querySelectorAll("*")].filter((el) =>
    /warning/.test(el.getAttribute("class") ?? ""),
  );

describe("interactive → monitoring-only STAYS OPEN (forward matrix, 6 origins)", () => {
  for (const [a, n] of [
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const) {
    for (const s0 of [0, 1] as const) {
      it(`open [a=${a},n=${n},s=${s0}] → (0,0,1): menu open, monitoring rows ${s0 === 0 ? "INSERTED" : "visible"}, quiet pill, focus rescued`, async () => {
        const { rerender } = renderPublishedModal([], { attentionItems: itemsWithLink(a, n, s0) });
        const pill = screen.getByTestId("published-show-review-alert-pill");
        fireEvent.click(pill);
        const menu = screen.getByTestId("published-show-review-attention-menu");
        // pre-focus a to-be-removed element: needs-look <a> for [0,1], the
        // actionable row button otherwise (removal makes rescue non-vacuous)
        const target =
          a === 0
            ? menu.querySelector<HTMLElement>("a")
            : menu.querySelector<HTMLElement>('[data-testid^="attention-menu-row-"]');
        expect(target).not.toBeNull();
        target!.focus();

        rerender(publishedModalElement([], { attentionItems: itemsWithLink(0, 0, 1) }));

        expect(screen.getByTestId("published-show-review-attention-menu")).toBeInTheDocument();
        expect(screen.getAllByTestId(/attention-monitoring-row-/).length).toBeGreaterThan(0);
        const pillAfter = screen.getByTestId("published-show-review-alert-pill");
        expect(pillAfter.getAttribute("aria-expanded")).toBe("true");
        expect(pillAfter.className.split(/\s+/)).toContain("bg-surface-sunken");
        expect(WARNING_SWEEP(pillAfter)).toHaveLength(0);
        // settled focus: rescued to the pill (dep-less post-commit effect)
        await waitFor(() => expect(document.activeElement).toBe(pillAfter));
        expect(document.activeElement).not.toBe(document.body);
      });
    }
  }

  it("monitoring-only entry: clicking the quiet pill opens the menu", () => {
    renderPublishedModal([], { attentionItems: items(0, 0, 1) });
    const pill = screen.getByTestId("published-show-review-alert-pill");
    expect(pill.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(pill);
    expect(pill.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("published-show-review-attention-menu")).toBeInTheDocument();
  });

  it("jsdom node identity: the SAME pill button survives forward and reverse palette flips", () => {
    const { rerender } = renderPublishedModal([], { attentionItems: itemsWithLink(1, 0, 0) });
    const before = screen.getByTestId("published-show-review-alert-pill");
    fireEvent.click(before);
    rerender(publishedModalElement([], { attentionItems: itemsWithLink(0, 0, 1) }));
    expect(screen.getByTestId("published-show-review-alert-pill")).toBe(before);
    rerender(publishedModalElement([], { attentionItems: itemsWithLink(1, 0, 0) }));
    expect(screen.getByTestId("published-show-review-alert-pill")).toBe(before);
  });
});

describe("rescue generality (b2): removed-focused-row rescue at NON-monitoring destinations", () => {
  it("(2,0,0) → (1,0,0): focused a1 row removed, a0 remains — menu open, focus on pill", async () => {
    const { rerender } = renderPublishedModal([], { attentionItems: items(2, 0, 0) });
    const pill = screen.getByTestId("published-show-review-alert-pill");
    fireEvent.click(pill);
    const rowA1 = screen.getByTestId("attention-menu-row-alert:a1");
    rowA1.focus();
    rerender(publishedModalElement([], { attentionItems: [actionableAlertItem("a0")] }));
    expect(screen.queryByTestId("attention-menu-row-alert:a1")).toBeNull();
    expect(screen.getByTestId("attention-menu-row-alert:a0")).toBeInTheDocument();
    expect(screen.getByTestId("published-show-review-attention-menu")).toBeInTheDocument();
    const pillAfter = screen.getByTestId("published-show-review-alert-pill");
    await waitFor(() => expect(document.activeElement).toBe(pillAfter));
  });

  it("(1,1,0) → (0,1,0): focused actionable row removed, needs-look remains — menu open, focus on pill", async () => {
    const { rerender } = renderPublishedModal([], { attentionItems: itemsWithLink(1, 1, 0) });
    const pill = screen.getByTestId("published-show-review-alert-pill");
    fireEvent.click(pill);
    screen.getByTestId("attention-menu-row-alert:a0").focus();
    rerender(publishedModalElement([], { attentionItems: itemsWithLink(0, 1, 0) }));
    expect(screen.getByTestId("published-show-review-attention-menu")).toBeInTheDocument();
    const pillAfter = screen.getByTestId("published-show-review-alert-pill");
    await waitFor(() => expect(document.activeElement).toBe(pillAfter));
  });

  it("(1,1,0) → (1,0,0): focused needs-look link removed, actionable remains — menu open, focus on pill", async () => {
    const { rerender } = renderPublishedModal([], { attentionItems: itemsWithLink(1, 1, 0) });
    const pill = screen.getByTestId("published-show-review-alert-pill");
    fireEvent.click(pill);
    const link = screen
      .getByTestId("published-show-review-attention-menu")
      .querySelector<HTMLElement>("a");
    expect(link).not.toBeNull();
    link!.focus();
    rerender(publishedModalElement([], { attentionItems: itemsWithLink(1, 0, 0) }));
    expect(screen.getByTestId("published-show-review-attention-menu")).toBeInTheDocument();
    const pillAfter = screen.getByTestId("published-show-review-alert-pill");
    await waitFor(() => expect(document.activeElement).toBe(pillAfter));
  });

  it("(e2) FOCUS-STEAL CONSTRAINT: a rerender that keeps the focused row mounted must NOT move focus", async () => {
    const { rerender } = renderPublishedModal([], { attentionItems: itemsWithLink(2, 0, 1) });
    fireEvent.click(screen.getByTestId("published-show-review-alert-pill"));
    const rowA0 = screen.getByTestId("attention-menu-row-alert:a0");
    rowA0.focus();
    // a1 leaves; a0 (focused) stays mounted
    rerender(
      publishedModalElement([], {
        attentionItems: [actionableAlertItem("a0"), selfHealAlertItem("s0")],
      }),
    );
    const rowAfter = screen.getByTestId("attention-menu-row-alert:a0");
    expect(rowAfter).toBe(rowA0);
    // give the dep-less effect a beat; focus must remain on the row
    await waitFor(() => expect(document.activeElement).toBe(rowAfter));
  });
});

describe("quiet → warning REVERSE matrix (6 cells): menu stays open, amber positive pins", () => {
  for (const [a, n] of [
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const) {
    for (const s1 of [0, 1] as const) {
      it(`(0,0,1) open → [a=${a},n=${n},s=${s1}]: groups reconcile, aria-expanded retained, amber root`, () => {
        const { rerender } = renderPublishedModal([], { attentionItems: items(0, 0, 1) });
        const pill = screen.getByTestId("published-show-review-alert-pill");
        fireEvent.click(pill);
        expect(screen.getByTestId("published-show-review-attention-menu")).toBeInTheDocument();

        rerender(publishedModalElement([], { attentionItems: itemsWithLink(a, n, s1) }));

        expect(screen.getByTestId("published-show-review-attention-menu")).toBeInTheDocument();
        if (a > 0) expect(screen.getAllByTestId(/^attention-menu-row-/).length).toBeGreaterThan(0);
        if (n > 0)
          expect(screen.getAllByTestId(/attention-needslook-row-/).length).toBeGreaterThan(0);
        if (s1 === 1) expect(screen.getAllByTestId(/attention-monitoring-row-/).length).toBe(1);
        else expect(screen.queryByTestId(/attention-monitoring-row-/)).toBeNull();
        const pillAfter = screen.getByTestId("published-show-review-alert-pill");
        expect(pillAfter.getAttribute("aria-expanded")).toBe("true");
        const classes = pillAfter.className.split(/\s+/);
        expect(classes).toContain("bg-warning-bg");
        expect(classes).toContain("text-warning-text");
        expect(classes).toContain("hover:bg-warning-bg/80");
        expect(classes).not.toContain("bg-surface-sunken");
      });
    }
  }
});
