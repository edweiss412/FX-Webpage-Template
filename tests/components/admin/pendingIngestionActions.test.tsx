// @vitest-environment jsdom
/**
 * tests/components/admin/pendingIngestionActions.test.tsx (M12.12 Task 10)
 *
 * Pending-ingestion action-button contracts, MIGRATED from the deleted
 * tests/components/admin/DashboardPanels.test.tsx (whose host, the dead
 * PendingPanel, was removed by the M12.12 affordance-matrix realignment).
 * The live host is NeedsAttentionInbox (M12.2 Phase A), which renders the
 * SAME PendingPanelRetryButton / PendingPanelDiscardButtons client islands
 * for `pending_ingestion` items.
 *
 * Contracts pinned (unchanged from the original):
 *   - Retry button POSTs to /api/admin/pending-ingestions/[id]/retry
 *   - Defer-until-modified POSTs discard with kind=defer_until_modified
 *   - Permanently-ignore POSTs discard with kind=permanent_ignore
 *     (behind the G1 two-tap guard — spec 2026-07-16-destructive-confirm-pass §4)
 *   - 409 LIVE_ROW_REQUIRED surfaces Doug-facing copy via messageFor and
 *     never leaks the raw code (AGENTS.md invariant 5)
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { NeedsAttentionInbox } from "@/components/admin/NeedsAttentionInbox";
import { PendingPanelDiscardButtons } from "@/components/admin/PendingPanelDiscardButtons";
import type { NeedsAttentionItem } from "@/lib/admin/needsAttention";

// Shared destructive-recipe assertion (spec §3 C1; plan "Shared rendered assertion").
// This surface's idle skin carries `border border-border-strong`, so the armed
// morph compensates with `border border-transparent` — no 2px layout shift.
function expectDestructiveRecipe(el: HTMLElement) {
  const tokens = el.className.split(/\s+/);
  for (const t of [
    "bg-warning-text",
    "text-warning-bg",
    "font-semibold",
    "hover:opacity-90",
    "border",
    "border-transparent",
  ]) {
    expect(tokens).toContain(t);
  }
  for (const t of ["bg-accent", "bg-surface", "bg-bg"]) {
    expect(tokens).not.toContain(t);
  }
  expect(
    tokens
      .filter((t) => t.includes("hover:") && /(^|:)bg-/.test(t.slice(t.indexOf("hover:"))))
      .filter((t) => t !== "hover:opacity-90"),
  ).toEqual([]);
}

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
  usePathname: () => "/",
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  refreshMock.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => cleanup());

function mockJsonResponse(body: unknown, init: { status?: number } = {}) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

const NOW = new Date("2026-06-01T12:00:00.000Z");
const GENERIC = MESSAGE_CATALOG.SHEET_PROCESS_FAILED.dougFacing!;

function pendingItem(id: string): NeedsAttentionItem {
  return {
    variant: "pending_ingestion",
    key: `ingestion:${id}`,
    id,
    driveFileId: `drive-${id}`,
    driveFileName: `Broken-${id}.gsheet`,
    copy: GENERIC,
    activityAt: new Date("2026-06-01T11:00:00.000Z").toISOString(),
  };
}

function renderInbox(items: NeedsAttentionItem[]) {
  return render(
    <NeedsAttentionInbox
      items={items}
      totalCount={items.length}
      renderedCount={items.length}
      overflowCount={0}
      now={NOW}
    />,
  );
}

describe("pending-ingestion action buttons (live host: NeedsAttentionInbox)", () => {
  test("Retry button POSTs to /api/admin/pending-ingestions/[id]/retry", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        status: "parsed_pending_review",
        stagedId: "staged-x",
      }),
    );
    const { getByTestId } = renderInbox([pendingItem("pi-1")]);
    await act(async () => {
      fireEvent.click(getByTestId("admin-pending-retry-pi-1"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/admin/pending-ingestions/pi-1/retry");
  });

  test("Defer-until-modified POSTs discard with kind=defer_until_modified", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        status: "discarded",
        kind: "defer_until_modified",
      }),
    );
    const { getByTestId } = renderInbox([pendingItem("pi-2")]);
    await act(async () => {
      fireEvent.click(getByTestId("admin-pending-defer-pi-2"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/admin/pending-ingestions/pi-2/discard");
    expect(JSON.parse(init.body as string)).toMatchObject({
      kind: "defer_until_modified",
    });
  });

  test("Permanently-ignore POSTs discard with kind=permanent_ignore (second tap of the G1 guard)", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        status: "discarded",
        kind: "permanent_ignore",
      }),
    );
    const { getByTestId } = renderInbox([pendingItem("pi-3")]);
    // G1 two-tap guard: first click arms, second fires. Mouse clicks carry no key
    // repeat, so no clock manipulation is needed — an earlier revision simulated a
    // 350ms dwell, which was replaced by an `event.repeat` check (test [13]).
    fireEvent.click(getByTestId("admin-pending-ignore-pi-3"));
    await act(async () => {
      fireEvent.click(getByTestId("admin-pending-ignore-pi-3"));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/admin/pending-ingestions/pi-3/discard");
    expect(JSON.parse(init.body as string)).toMatchObject({
      kind: "permanent_ignore",
    });
  });

  test("on 409 LIVE_ROW_REQUIRED surfaces Doug-facing copy via messageFor", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: false, code: "LIVE_ROW_REQUIRED" }, { status: 409 }),
    );
    const { getByTestId, container } = renderInbox([pendingItem("pi-4")]);
    await act(async () => {
      fireEvent.click(getByTestId("admin-pending-retry-pi-4"));
    });
    await waitFor(() => {
      expect(getByTestId("admin-pending-retry-error-pi-4").textContent ?? "").toContain(
        MESSAGE_CATALOG.LIVE_ROW_REQUIRED.dougFacing!,
      );
    });
    expect(container.textContent ?? "").not.toContain("LIVE_ROW_REQUIRED");
  });
});

// G1 (spec 2026-07-16-destructive-confirm-pass §4): the "Permanently ignore"
// button is a two-tap morph — first tap arms (recipe fill + confirm label,
// 4s auto-revert), second tap fires the EXISTING discard POST unchanged. The
// sibling "Defer until modified" stays one-tap (§7 exemption).
describe("G1 two-tap guard — Permanently ignore (PendingPanelDiscardButtons)", () => {
  const ID = "pi-g1";
  const ARMED_LABEL = "Confirm ignore";

  /* Ignore keeps every label variant mounted so its width cannot change on arm
   * (see IgnoreLabelStack). `textContent` therefore concatenates all three; the
   * label a user actually sees is the one variant left out of the a11y tree's
   * hidden set. jsdom applies no CSS, so `invisible` means nothing here and
   * `aria-hidden` is the discriminator that survives both engines. */
  function shownLabel(btn: HTMLElement): string {
    const shown = Array.from(btn.querySelectorAll("[data-ignore-label]:not([aria-hidden])"));
    expect(shown, "exactly one Ignore label variant is shown").toHaveLength(1);
    return shown[0]?.textContent ?? "";
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderButtons() {
    return render(<PendingPanelDiscardButtons pendingIngestionId={ID} />);
  }

  test("first click arms: no fetch, label + recipe classes morph; Defer sibling untouched", () => {
    vi.useFakeTimers();
    const { getByTestId } = renderButtons();
    const btn = getByTestId(`admin-pending-ignore-${ID}`);
    const deferBefore = getByTestId(`admin-pending-defer-${ID}`);
    const deferLabel = deferBefore.textContent;
    const deferClass = deferBefore.className;
    fireEvent.click(btn);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(shownLabel(btn)).toBe(ARMED_LABEL);
    expectDestructiveRecipe(btn);
    // Sibling one-tap defer button is untouched by arming (§7).
    expect(getByTestId(`admin-pending-defer-${ID}`).textContent).toBe(deferLabel);
    expect(getByTestId(`admin-pending-defer-${ID}`).className).toBe(deferClass);
  });

  test("second click fires the discard POST exactly once and clears the pending disarm timer", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ status: "discarded", kind: "permanent_ignore" }),
    );
    const { getByTestId } = renderButtons();
    const btn = getByTestId(`admin-pending-ignore-${ID}`);
    fireEvent.click(btn); // arm
    await act(async () => {
      fireEvent.click(btn); // confirm — fires
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(`/api/admin/pending-ingestions/${ID}/discard`);
    expect(JSON.parse(init.body as string)).toMatchObject({ kind: "permanent_ignore" });
    // The fire path killed the pending disarm timer (real observable).
    expect(vi.getTimerCount()).toBe(0);
    // Advancing past the old window changes nothing and produces no act warning.
    await act(async () => {
      vi.advanceTimersByTime(4_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("[13] a HELD Enter cannot confirm, however long it is held", async () => {
    const { getByTestId } = renderButtons();
    const btn = getByTestId(`admin-pending-ignore-${ID}`);

    // Real auto-repeat: the FIRST keydown is repeat:false, every subsequent one is
    // repeat:true, and each synthesises a click. Whole-diff review R1 F3 showed a
    // time threshold only throttles this — the repeat after the window looks exactly
    // like a deliberate press — so the guard keys on `event.repeat` instead.
    fireEvent.keyDown(btn, { key: "Enter", repeat: false });
    fireEvent.click(btn); // arms
    for (let i = 0; i < 12; i++) {
      fireEvent.keyDown(btn, { key: "Enter", repeat: true });
      fireEvent.click(btn); // every one of these must be ignored
    }
    expect(fetchMock, "a held Enter must never confirm").not.toHaveBeenCalled();

    // Release and press again — a real decision — and it fires.
    fireEvent.keyUp(btn, { key: "Enter" });
    await act(async () => {
      fireEvent.keyDown(btn, { key: "Enter", repeat: false });
      fireEvent.click(btn);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("[14] a fast deliberate double-click still confirms (no throttle)", async () => {
    // The rejected time-threshold design also broke this: a legitimate fast
    // double-click needed a third activation. Mouse clicks carry no key repeat.
    const { getByTestId } = renderButtons();
    const btn = getByTestId(`admin-pending-ignore-${ID}`);
    fireEvent.click(btn);
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("[16] the repeat flag cannot strand: a fresh press always clears it", async () => {
    // Hold Enter, then lose the keyup (alt-tab while holding). Without clearing on a
    // fresh keydown the flag stays true and the button can never confirm again.
    const { getByTestId } = renderButtons();
    const btn = getByTestId(`admin-pending-ignore-${ID}`);
    fireEvent.keyDown(btn, { key: "Enter", repeat: false });
    fireEvent.click(btn); // arms
    fireEvent.keyDown(btn, { key: "Enter", repeat: true }); // held
    fireEvent.click(btn); // ignored
    expect(fetchMock).not.toHaveBeenCalled();
    // No keyUp — it went to another window. A fresh deliberate press must still work.
    await act(async () => {
      fireEvent.keyDown(btn, { key: "Enter", repeat: false });
      fireEvent.click(btn);
    });
    expect(fetchMock, "a lost keyup must not permanently disable confirm").toHaveBeenCalledTimes(1);
  });

  test("[15] audit contracts survive: ring-offset-surface, aria-busy, consequence line", async () => {
    // Whole-diff review R1 F6: these three landed from the impeccable audit with no
    // regression assertion, so they could vanish silently.
    const { getByTestId, queryByTestId } = renderButtons();
    const ignore = getByTestId(`admin-pending-ignore-${ID}`);
    const defer = getByTestId(`admin-pending-defer-${ID}`);
    for (const el of [ignore, defer]) {
      expect(el.className.split(/\s+/), "DESIGN.md:40 forbids a bare ring-offset-2").toContain(
        "focus-visible:ring-offset-surface",
      );
      expect(el.getAttribute("aria-busy")).toBeNull(); // idle
    }
    expect(queryByTestId(`admin-pending-ignore-consequence-${ID}`)).toBeNull();
    fireEvent.click(ignore); // arm
    const consequence = getByTestId(`admin-pending-ignore-consequence-${ID}`);
    expect(consequence.textContent).toContain("permanently");

    // Whole-diff R2 MEDIUM: asserting aria-busy is ABSENT when idle passes even if
    // both props are deleted. The RUNNING state is the one that carries the contract.
    fetchMock.mockImplementation(() => new Promise(() => {})); // never resolves
    await act(async () => {
      fireEvent.click(getByTestId(`admin-pending-ignore-${ID}`)); // confirm -> running
    });
    /* R11 F1: "Ignoring…" is a third label variant and nothing asserted it was ever the
     * shown one. Because all three variants stay mounted for the width reservation, a
     * running state that failed to select its variant would keep the idle word on screen
     * with every layout and aria-busy assertion still green. */
    expect(
      shownLabel(getByTestId(`admin-pending-ignore-${ID}`)),
      "the running state must show its own label, not the idle one",
    ).toBe("Ignoring…");
    for (const testid of [`admin-pending-ignore-${ID}`, `admin-pending-defer-${ID}`]) {
      expect(getByTestId(testid).getAttribute("aria-busy"), `${testid} must report busy`).toBe(
        "true",
      );
    }
    const region = document.querySelector('[role="status"]') as HTMLElement;
    expect(region.textContent, "the live region must announce progress").toBe("Working…");
  });

  test("clicking the Defer sibling while permanent-ignore is armed disarms it (whole-diff R2)", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ status: "discarded", kind: "defer_until_modified" }),
    );
    const { getByTestId } = renderButtons();
    const ignoreBtn = getByTestId(`admin-pending-ignore-${ID}`);
    fireEvent.click(ignoreBtn); // arm permanent-ignore
    expect(shownLabel(ignoreBtn)).toBe(ARMED_LABEL);
    await act(async () => {
      fireEvent.click(getByTestId(`admin-pending-defer-${ID}`)); // sibling one-tap mutation
    });
    // The armed state must not survive into/past another mutation.
    expect(shownLabel(getByTestId(`admin-pending-ignore-${ID}`))).not.toBe(ARMED_LABEL);
    expect(vi.getTimerCount()).toBe(0);
    // Only the defer POST fired — the armed guard did not.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)).toMatchObject({
      kind: "defer_until_modified",
    });
  });

  test("4s auto-revert restores the idle branch without firing", () => {
    vi.useFakeTimers();
    const { getByTestId } = renderButtons();
    const btn = getByTestId(`admin-pending-ignore-${ID}`);
    const idleClass = btn.className;
    fireEvent.click(btn);
    expect(shownLabel(btn)).toBe(ARMED_LABEL);
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(shownLabel(btn)).toBe("Permanently ignore");
    expect(btn.className).toBe(idleClass);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("unmount while armed clears the timer", () => {
    vi.useFakeTimers();
    const { getByTestId, unmount } = renderButtons();
    fireEvent.click(getByTestId(`admin-pending-ignore-${ID}`));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("persistent sr-only status region announces arming and clears on auto-revert", () => {
    vi.useFakeTimers();
    const { getByTestId } = renderButtons();
    const btn = getByTestId(`admin-pending-ignore-${ID}`);
    // The live region is no longer Ignore's next sibling: the reorder puts Defer
    // between them. Address it by role, which is unambiguous (exactly one exists).
    const region = btn
      .closest("div")!
      .parentElement!.querySelector('[role="status"]') as HTMLElement;
    expect(region).not.toBeNull();
    expect(region.getAttribute("role")).toBe("status");
    expect(region.className.split(/\s+/)).toContain("sr-only");
    expect(region.textContent).toBe("");
    fireEvent.click(btn); // arm
    expect(region.textContent).toBe("Tap again to stop tracking this sheet permanently.");
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    // Same persistently-mounted element, emptied — never unmounted.
    expect(btn.closest("div")!.parentElement!.querySelector('[role="status"]')).toBe(region);
    expect(region.textContent).toBe("");
  });
});

// DESTRUCT-1's guarantee — the armed morph must not relocate the confirm hit-target —
// SURVIVES the reorder, but is now bought structurally rather than with `basis-full`:
// Ignore is the first flex item and reserves its widest label variant, so arming
// cannot change the island's width at all. The real-browser proof is D4 in
// tests/e2e/pendingDiscardReal.layout.spec.ts.
// D7. `basis-full sm:basis-auto` forced both buttons full-width below `sm`, which made
// the pair ALWAYS stack there. The reorder deletes it so the row wraps on available
// width instead — stacking only where the pair genuinely does not fit.
describe("D7: the responsive-stack basis is GONE (reorder design)", () => {
  const ID = "pi-d7";
  function renderButtons() {
    return render(<PendingPanelDiscardButtons pendingIngestionId={ID} />);
  }
  function tokens(el: HTMLElement) {
    return el.className.split(/\s+/);
  }

  test("neither discard button carries basis-full or sm:basis-auto, idle OR armed", () => {
    const { getByTestId } = renderButtons();
    const defer = getByTestId(`admin-pending-defer-${ID}`);
    const ignore = getByTestId(`admin-pending-ignore-${ID}`);
    for (const el of [defer, ignore]) {
      expect(tokens(el)).not.toContain("basis-full");
      expect(tokens(el)).not.toContain("sm:basis-auto");
    }
    fireEvent.click(ignore); // arm
    expect(tokens(getByTestId(`admin-pending-ignore-${ID}`))).not.toContain("basis-full");
  });

  test("[2] Ignore precedes Defer in the DOM, so a wrap puts the safe action lower", () => {
    // The whole fix. jsdom has no layout, so this pins ORDER; the geometry that
    // follows from it is proven in tests/e2e/pendingDiscardReal.layout.spec.ts.
    const { getByTestId } = renderButtons();
    const defer = getByTestId(`admin-pending-defer-${ID}`);
    const ignore = getByTestId(`admin-pending-ignore-${ID}`);
    const rel = ignore.compareDocumentPosition(defer);
    expect(rel & Node.DOCUMENT_POSITION_FOLLOWING, "Ignore must come first").toBeTruthy();
  });

  test("[6] exactly one role=status live region, and it survives the reorder", () => {
    const { container, getByTestId } = renderButtons();
    const regions = container.querySelectorAll('[role="status"]');
    expect(regions.length).toBe(1);
    const region = regions[0] as HTMLElement;
    expect(region.className.split(/\s+/)).toContain("sr-only");
    expect(region.textContent).toBe("");
    fireEvent.click(getByTestId(`admin-pending-ignore-${ID}`));
    expect(region.textContent).toBe("Tap again to stop tracking this sheet permanently.");
  });
});
