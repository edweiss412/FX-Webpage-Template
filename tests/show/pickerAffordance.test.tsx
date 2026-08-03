// tests/show/pickerAffordance.test.tsx
// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
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

    expect(row.querySelector('[data-testid="picker-row-lock"]')).not.toBeNull();
    expect(row.querySelector('[data-testid="picker-row-spinner"]')).toBeNull();

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
