// tests/show/pickerAffordance.test.tsx
// @vitest-environment jsdom
import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { PickerInterstitial } from "@/app/show/[slug]/[shareToken]/_PickerInterstitial";
import { messageFor } from "@/lib/messages/lookup";

const base = {
  slug: "s",
  shareToken: "t",
  showId: "sid",
  banner: null,
  staleCleanupHint: null,
} as const;
const affordance = messageFor("PICKER_NAME_NOT_LISTED").crewFacing!;
const roster = [
  { id: "1", name: "Doug Larson", role: "A1", role_flags: [], claimed_via_oauth_at: null },
];

describe("picker missing-name affordance (both modes)", () => {
  test("non-empty roster shows the affordance", () => {
    const { container } = render(<PickerInterstitial {...base} roster={roster} />);
    const el = container.querySelector('[data-testid="picker-name-not-listed"]');
    expect(el).not.toBeNull();
    expect(el?.textContent).toContain(affordance);
  });

  test("empty roster shows the affordance alongside PICKER_EMPTY_ROSTER copy", () => {
    const { container } = render(<PickerInterstitial {...base} roster={[]} />);
    expect(
      container.querySelector('[data-testid="picker-name-not-listed"]')?.textContent,
    ).toContain(affordance);
    expect(container.querySelector('[data-testid="picker-roster-empty"]')?.textContent).toContain(
      messageFor("PICKER_EMPTY_ROSTER").crewFacing!,
    );
  });
});

/**
 * Task 3 — the claimed row's pending affordance.
 *
 * The mechanism under test is deliberately NOT `useFormStatus`: the enclosing
 * form is a native GET, for which React never enters a pending state
 * (measured `NATIVE_GET=false` / `FUNCTION_ACTION=true`, spec §3.4/§3.6 P3).
 * Test 1 is the permanent guard on that — a `useFormStatus` implementation
 * leaves `pending` false forever and fails it.
 */
const claimedRoster = [
  {
    id: "claimed-1",
    name: "Alice Cooper",
    role: "A1",
    role_flags: [],
    claimed_via_oauth_at: "2026-08-01T00:00:00.000Z",
  },
  { id: "open-1", name: "Bob Marley", role: "LD", role_flags: [], claimed_via_oauth_at: null },
];

function claimedRowIn(container: HTMLElement): HTMLButtonElement {
  const row = container.querySelector<HTMLButtonElement>(
    '[data-testid="picker-roster-row"][data-claimed="true"]',
  );
  if (row === null) throw new Error("claimed row not rendered");
  return row;
}

describe("claimed-row pending affordance", () => {
  test("pending swaps lock for spinner, marks busy, and says Signing in…", () => {
    const { container } = render(<PickerInterstitial {...base} roster={claimedRoster} />);
    const row = claimedRowIn(container);

    const lock = row.querySelector('[data-testid="picker-row-lock"]');
    expect(lock).not.toBeNull();
    expect(row.querySelector('[data-testid="picker-row-spinner"]')).toBeNull();

    // The glyph must be decorative and the hint must ride a SIBLING: aria-label
    // on a span with an implicit generic role is dropped by AT (ARIA 1.2).
    // Asserting only that the glyph exists leaves both halves of that P1 free
    // to regress.
    expect(lock?.getAttribute("aria-hidden")).toBe("true");
    expect(lock?.getAttribute("aria-label")).toBeNull();
    const hint = row.querySelector(".sr-only");
    expect(hint?.textContent ?? "").not.toBe("");
    // SIBLING, not descendant: nested inside the aria-hidden glyph it is
    // hidden from AT too, and a bare querySelector cannot tell the difference.
    expect(lock?.contains(hint ?? null)).toBe(false);

    fireEvent.click(row);

    expect(row.querySelector('[data-testid="picker-row-spinner"]')).not.toBeNull();
    expect(row.querySelector('[data-testid="picker-row-lock"]')).toBeNull();
    expect(row.getAttribute("aria-disabled")).toBe("true");
    expect(row.getAttribute("aria-busy")).toBe("true");
    // Scoped to the claimed row's subtree: the unclaimed row renders a
    // picker-role-chip too, so an unscoped query would assert on the wrong node.
    expect(row.querySelector('[data-testid="picker-role-chip"]')?.textContent).toBe("Signing in…");
  });

  test("a claimed row with no role still shows the pending chip", () => {
    const { container } = render(
      <PickerInterstitial {...base} roster={[{ ...claimedRoster[0]!, role: "" }]} />,
    );
    const row = claimedRowIn(container);

    expect(row.querySelector('[data-testid="picker-role-chip"]')).toBeNull();

    fireEvent.click(row);

    expect(row.querySelector('[data-testid="picker-role-chip"]')?.textContent).toBe("Signing in…");
  });

  test("an unclaimed row never renders the spinner", () => {
    const { container } = render(<PickerInterstitial {...base} roster={claimedRoster} />);
    const unclaimed = container.querySelector<HTMLButtonElement>(
      '[data-testid="picker-roster-row"]:not([data-claimed="true"])',
    );
    if (unclaimed === null) throw new Error("unclaimed row not rendered");

    fireEvent.click(unclaimed);

    expect(unclaimed.querySelector('[data-testid="picker-row-spinner"]')).toBeNull();
  });

  test("a bfcache restore returns the row to idle", () => {
    const { container } = render(<PickerInterstitial {...base} roster={claimedRoster} />);
    const row = claimedRowIn(container);
    fireEvent.click(row);
    expect(row.getAttribute("aria-busy")).toBe("true");

    const restore = new Event("pageshow") as PageTransitionEvent;
    Object.defineProperty(restore, "persisted", { value: true });
    fireEvent(window, restore);

    expect(row.getAttribute("aria-busy")).toBeNull();
    expect(row.querySelector('[data-testid="picker-row-lock"]')).not.toBeNull();
  });

  test("pending self-clears so a hung sign-in does not leave the row inert", () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<PickerInterstitial {...base} roster={claimedRoster} />);
      const row = claimedRowIn(container);

      fireEvent.click(row);
      expect(row.getAttribute("aria-busy")).toBe("true");

      // Re-tapping WAS the recovery for a sign-in that never lands, and the
      // pending guard removes it. Without this timeout a hung hop leaves the
      // row permanently inert (impeccable critique P0).
      // Pinned from BOTH sides: advancing only to 8s would let a 1s-7s
      // timeout mutant pass, since it also ends idle.
      act(() => {
        vi.advanceTimersByTime(7_900);
      });
      expect(row.getAttribute("aria-busy"), "still pending just before 8s").toBe("true");

      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(row.getAttribute("aria-busy"), "idle just after 8s").toBeNull();
      expect(row.querySelector(String.raw`[data-testid="picker-row-lock"]`)).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("the pending state is announced, not just aria-busy", () => {
    const { container } = render(<PickerInterstitial {...base} roster={claimedRoster} />);
    const row = claimedRowIn(container);
    // OUTSIDE the button: ARIA lets AT ignore descendant changes while an
    // ancestor is aria-busy, and the button is exactly that (R2 P1).
    const live = container.querySelector(String.raw`[data-testid="picker-row-announcement"]`);
    expect(row.contains(live)).toBe(false);

    expect(live?.getAttribute("aria-live")).toBe("polite");
    expect(live?.textContent).toBe("");

    fireEvent.click(row);

    // aria-busy alone is weakly supported by assistive tech (audit P1 /
    // WCAG 2.2 SC 4.1.3), so the transition carries a live-region message.
    expect(live?.textContent).toContain("Alice Cooper");
  });

  test("a bfcache restore does not leave a timer that clears a later pending", () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<PickerInterstitial {...base} roster={claimedRoster} />);
      const row = claimedRowIn(container);

      fireEvent.click(row);
      act(() => {
        vi.advanceTimersByTime(3_000);
      });

      const restore = new Event("pageshow") as PageTransitionEvent;
      Object.defineProperty(restore, "persisted", { value: true });
      act(() => {
        fireEvent(window, restore);
      });
      expect(row.getAttribute("aria-busy")).toBeNull();

      // Re-activate. The FIRST timeout would have fired at 8s from the first
      // tap, i.e. 5s from here; if the restore did not clear it, that stale
      // callback drops this pending early (whole-diff R2 P1).
      fireEvent.click(row);
      act(() => {
        vi.advanceTimersByTime(5_100);
      });

      expect(row.getAttribute("aria-busy")).toBe("true");
    } finally {
      vi.useRealTimers();
    }
  });

  test("the pending chip does not inherit the idle chip fill", () => {
    const { container } = render(<PickerInterstitial {...base} roster={claimedRoster} />);
    const row = claimedRowIn(container);

    fireEvent.click(row);

    const chip = row.querySelector(String.raw`[data-testid="picker-role-chip"]`);
    const cls = chip?.className ?? "";
    // Composing the pending chip from chipClassName would carry these along,
    // and generated Tailwind order makes them win regardless of position —
    // the new fill would never render (whole-diff R2 P1).
    expect(cls).toContain("bg-accent-tint");
    expect(cls).not.toContain("bg-surface-sunken");
    expect(cls).not.toContain("text-text-subtle");
    // The fill alone is 1.02:1 against the row — the boundary is what makes
    // the chip a container, and the P1 disposition names both.
    expect(cls).toContain("border-accent-on-bg");

    // The right column reserves width so the name does not gain then lose
    // 94px at 360px when the chip swaps in. The browser oracle measures
    // height and the name's LEFT edge, neither of which moves when this is
    // deleted, so the reservation is pinned here.
    expect(chip?.parentElement?.className ?? "").toContain("min-w-24");
  });

  test("two pointer activations issue exactly one submit", () => {
    const { container } = render(<PickerInterstitial {...base} roster={claimedRoster} />);
    const row = claimedRowIn(container);
    const form = row.closest("form");
    if (form === null) throw new Error("claimed row is not inside a form");

    let submits = 0;
    form.addEventListener("submit", (event) => {
      submits += 1;
      event.preventDefault();
    });

    fireEvent.click(row);
    fireEvent.click(row);

    // Failure mode: an onClick that early-returns WITHOUT preventDefault.
    // aria-disabled does not block activation, so that ships a row which looks
    // busy and still double-submits — measured submits=2 (spec §3.6 P1/P2).
    expect(submits).toBe(1);
  });
});
