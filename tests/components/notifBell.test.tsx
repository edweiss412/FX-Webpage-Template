// @vitest-environment jsdom
/**
 * NotifBell — badge/degraded rendering + panel trigger (bell notification
 * center Task 13, spec §7.1). jsdom + RTL.
 *
 * `useBellBadge` is mocked to a deterministic stand-in that mirrors the real
 * hook's initial-prop derivation (spec §4/§5 — ok→count, infra_error→degraded)
 * without its realtime/pathname fetch machinery. The hook itself is covered by
 * tests/components/useBellBadge.test.tsx. `global.fetch` is stubbed so the
 * BellPanel that mounts on open does not hit the network.
 */
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { NotifBell } from "@/components/admin/nav/NotifBell";
import { getRequiredDougFacing } from "@/lib/messages/lookup";
import type { BellCountResult } from "@/lib/admin/bellFeed";

const refetchMock = vi.fn();
// Stateful stand-in for the real hook: it derives the initial count from the
// prop (spec §4/§5 — ok→count, infra_error→degraded) AND exposes a working
// `zeroNow` so the immediate-zero-on-open contract (spec §7.2) is observable at
// the NotifBell boundary. The real hook's race-safe machinery is covered by
// tests/components/useBellBadge.test.tsx.
vi.mock("@/components/admin/nav/useBellBadge", () => ({
  useBellBadge: (initial: BellCountResult) => {
    const [count, setCount] = useState<number | null>(initial.kind === "ok" ? initial.count : null);
    return {
      count,
      degraded: initial.kind === "infra_error",
      refetch: refetchMock,
      zeroNow: () => setCount(0),
      pingSignal: 0,
    };
  },
}));

const fetchMock = vi.fn();

beforeEach(() => {
  refetchMock.mockReset();
  fetchMock.mockReset();
  // BellPanel's feed fetch stays pending — the panel mounts in its loading
  // shell, which is all the trigger/focus tests need.
  fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderBell(initialCount: BellCountResult, viewerIsDeveloper = false) {
  return render(<NotifBell initialCount={initialCount} viewerIsDeveloper={viewerIsDeveloper} />);
}

describe("NotifBell — badge (spec §7.1 / §12 guards)", () => {
  it("count > 0 → badge shows the count", () => {
    const { getByTestId } = renderBell({ kind: "ok", count: 3 });
    expect(getByTestId("admin-notif-badge").textContent).toBe("3");
  });

  it("count > 9 → badge caps at '9+'", () => {
    const { getByTestId } = renderBell({ kind: "ok", count: 42 });
    expect(getByTestId("admin-notif-badge").textContent).toBe("9+");
  });

  it("count 9 → NOT capped (boundary, carried over from the pre-rewrite suite)", () => {
    const { getByTestId } = renderBell({ kind: "ok", count: 9 });
    expect(getByTestId("admin-notif-badge").textContent).toBe("9");
  });

  it("count 0 → no badge node (guard row, spec §12)", () => {
    const { queryByTestId, getByTestId } = renderBell({ kind: "ok", count: 0 });
    expect(getByTestId("admin-notif-bell")).toBeTruthy();
    expect(queryByTestId("admin-notif-badge")).toBeNull();
  });
});

describe("NotifBell — aria-label (unseen-count semantics, Finding 2)", () => {
  // The badge counts UNSEEN entries (it clears on open), so the label must speak
  // to unseen notifications — NOT "unresolved alerts", which stays false for a
  // screen reader after the panel is opened while active alerts remain.
  it("count > 0 → label reads unseen notifications, not 'unresolved alerts'", () => {
    const { getByTestId } = renderBell({ kind: "ok", count: 3 });
    const bell = getByTestId("admin-notif-bell");
    expect(bell.getAttribute("aria-label")).toBe("Notifications — 3 unseen");
    expect(bell.getAttribute("aria-label")).not.toContain("unresolved");
  });

  it("count 0 → label reads 'Notifications' (no false 'unresolved alerts')", () => {
    const { getByTestId } = renderBell({ kind: "ok", count: 0 });
    const bell = getByTestId("admin-notif-bell");
    expect(bell.getAttribute("aria-label")).toBe("Notifications");
  });
});

describe("NotifBell — degraded (spec §7.1 / §12)", () => {
  it("initial infra_error → degraded bell with '!' chip and catalog-derived aria-label", () => {
    const { getByTestId, queryByTestId } = renderBell({ kind: "infra_error" });
    const bell = getByTestId("admin-notif-bell-degraded");
    // Catalog-derived label, not a hardcoded literal.
    expect(bell.getAttribute("aria-label")).toBe(getRequiredDougFacing("ADMIN_ALERT_COUNT_FAILED"));
    expect(bell.textContent).toContain("!");
    // The healthy bell/badge nodes are not rendered in the degraded branch.
    expect(queryByTestId("admin-notif-badge")).toBeNull();
  });
});

describe("NotifBell — panel trigger (spec §7.1/§7.2)", () => {
  it("click toggles aria-expanded and mounts the panel; Esc closes it and restores focus to the trigger", async () => {
    const { getByTestId, queryByTestId } = renderBell({ kind: "ok", count: 2 });
    const trigger = getByTestId("admin-notif-bell");
    // jsdom does not move focus to a button on click (unlike a real browser),
    // so focus it explicitly to model the user having focused the trigger —
    // that is the element useDialogFocus must restore to on close.
    trigger.focus();

    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(queryByTestId("bell-panel")).toBeNull();

    fireEvent.click(trigger);
    expect(getByTestId("admin-notif-bell").getAttribute("aria-expanded")).toBe("true");
    expect(getByTestId("bell-panel")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(queryByTestId("bell-panel")).toBeNull());
    // Focus restored to the trigger (useDialogFocus restore; async → waitFor).
    await waitFor(() => expect(document.activeElement).toBe(getByTestId("admin-notif-bell")));
  });

  it("R4 Finding 2: clicking the bell zeroes the badge immediately — before any fetch settles — and flips the aria-label to the zero state (spec §7.2)", () => {
    // The feed fetch stays pending (beforeEach), so nothing has settled when we
    // assert: the badge must be gone and the label must read the zero-count
    // wording purely from the synchronous client-side zero.
    const { getByTestId, queryByTestId } = renderBell({ kind: "ok", count: 3 });
    const bell = getByTestId("admin-notif-bell");
    expect(getByTestId("admin-notif-badge").textContent).toBe("3");
    expect(bell.getAttribute("aria-label")).toBe("Notifications — 3 unseen");

    fireEvent.click(bell);

    // Immediate zero: badge node gone, label back to the plain zero-state copy.
    expect(queryByTestId("admin-notif-badge")).toBeNull();
    expect(getByTestId("admin-notif-bell").getAttribute("aria-label")).toBe("Notifications");
    // The panel still opened in the same gesture.
    expect(getByTestId("bell-panel")).toBeTruthy();
  });
});
