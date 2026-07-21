// @vitest-environment jsdom
/**
 * tests/components/admin/compactAlertCompoundTransitions.test.tsx
 * (spec 2026-07-20-show-alert-compact §6.2)
 *
 * The popover is an ORTHOGONAL axis to the resolve state machine, not a peer
 * state — so the interesting cases are compounds: what happens to an OPEN
 * popover while a resolve request runs, fails, retries, and finally swaps.
 *
 * The source-scanning transition audit cannot prove any of this. It reads
 * markup for motion libraries; it cannot see that clicking resolve leaves the
 * popover alone, or that a failed retry keeps it open. Shared state or a stray
 * key/remount would sail straight past it, which is why these are behavioral.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AttentionBanner } from "@/components/admin/review/AttentionBanner";
import type { AttentionItem } from "@/lib/admin/attentionItems";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(""),
}));

const NOW = new Date("2026-07-20T12:00:00Z");

function alertItem(): AttentionItem {
  return {
    id: "alert:c1",
    kind: "alert",
    tone: "notice",
    sectionId: "crew",
    crewKey: null,
    actionable: true,
    menuTitle: "Needs confirming",
    menuSubtitle: null,
    alert: {
      alertId: "c1",
      code: "TEST_FAKE_CODE_FOR_BANNER",
      template: "Something changed in **the sheet**.",
      params: {},
      action: null,
      // A helpHref guarantees the trigger renders (§3.2), so the popover axis exists.
      helpHref: "/help/errors#x",
      raisedAt: "2026-07-20T10:00:00Z",
      occurrenceCount: 1,
      autoClearNote: null,
      failedKeys: null,
      dataGaps: null,
      errorCode: null,
    },
  };
}

function renderBanner(onResolved = vi.fn()) {
  render(
    <AttentionBanner
      item={alertItem()}
      slug="test-show"
      now={NOW}
      highlighted={false}
      onResolved={onResolved}
    />,
  );
  return { onResolved };
}

/** Open the popover and assert it actually opened (state, not presence — §9.1). */
async function openPopover() {
  const trigger = screen.getByTestId("attention-banner-help-c1-trigger");
  fireEvent.click(trigger);
  await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "true"));
  return trigger;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("compact alert: popover × resolve compounds (§6.2)", () => {
  test("resolve request runs with the popover OPEN, and the popover stays open", async () => {
    // Never-resolving fetch: the request stays in flight for the assertion.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderBanner();
    const trigger = await openPopover();

    fireEvent.click(screen.getByTestId("per-show-alert-resolve-c1"));

    // Failure mode: shared state (or a remount keyed on request status) that
    // collapses the popover whenever an unrelated action fires.
    await waitFor(() => expect(screen.getByTestId("per-show-alert-resolve-c1")).toBeDisabled());
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  test("a FAILED resolve leaves the popover open and surfaces the inline error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    renderBanner();
    const trigger = await openPopover();

    fireEvent.click(screen.getByTestId("per-show-alert-resolve-c1"));

    await waitFor(() =>
      expect(screen.getByTestId("per-show-alert-resolve-error-c1")).toBeInTheDocument(),
    );
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  test("retry after a failure (Ep → Rp → C) swaps to Confirmed and unmounts the popover", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) throw new Error("network down");
        return {
          json: async () => ({
            status: "resolved",
            id: "c1",
            resolved_at: "2026-07-20T12:01:00Z",
          }),
        };
      }),
    );
    const { onResolved } = renderBanner();
    await openPopover();

    fireEvent.click(screen.getByTestId("per-show-alert-resolve-c1"));
    await waitFor(() =>
      expect(screen.getByTestId("per-show-alert-resolve-error-c1")).toBeInTheDocument(),
    );

    // Retry re-enters the request and this time succeeds.
    fireEvent.click(screen.getByTestId("per-show-alert-resolve-c1"));
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith("alert:c1"));

    expect(screen.getByTestId("attention-banner-confirmed-c1")).toBeInTheDocument();
    // The whole body swapped, so trigger and popover are gone...
    expect(screen.queryByTestId("attention-banner-help-c1-trigger")).toBeNull();
    // ...while the anchor stays MOUNTED, so an in-flight flash timer still has
    // a live node to target (R11).
    expect(document.querySelector('[data-attention-anchor="alert:c1"]')).not.toBeNull();
  });

  test("closing the popover mid-request does not disturb the request", async () => {
    let resolveFetch: ((value: unknown) => void) | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    const { onResolved } = renderBanner();
    const trigger = await openPopover();

    fireEvent.click(screen.getByTestId("per-show-alert-resolve-c1"));
    // Close the popover while the request is still in flight.
    fireEvent.click(trigger);
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));

    resolveFetch!({
      json: async () => ({ status: "resolved", id: "c1", resolved_at: "2026-07-20T12:01:00Z" }),
    });

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith("alert:c1"));
    expect(screen.getByTestId("attention-banner-confirmed-c1")).toBeInTheDocument();
  });
});
