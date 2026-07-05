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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { NotifBell } from "@/components/admin/nav/NotifBell";
import { getRequiredDougFacing } from "@/lib/messages/lookup";
import type { BellCountResult } from "@/lib/admin/bellFeed";

const refetchMock = vi.fn();
vi.mock("@/components/admin/nav/useBellBadge", () => ({
  useBellBadge: (initial: BellCountResult) => ({
    count: initial.kind === "ok" ? initial.count : null,
    degraded: initial.kind === "infra_error",
    refetch: refetchMock,
  }),
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

  it("count 0 → no badge node (guard row, spec §12)", () => {
    const { queryByTestId, getByTestId } = renderBell({ kind: "ok", count: 0 });
    expect(getByTestId("admin-notif-bell")).toBeTruthy();
    expect(queryByTestId("admin-notif-badge")).toBeNull();
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
});
