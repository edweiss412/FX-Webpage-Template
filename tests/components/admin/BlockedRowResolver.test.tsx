// @vitest-environment jsdom
/**
 * tests/components/admin/BlockedRowResolver.test.tsx (Task 11 — UI)
 *
 * Pins the contract of <BlockedRowResolver> (in-wizard blocker resolution):
 *   - Per-code render: SHOW_ARCHIVED_IMMUTABLE → "Unarchive & retry";
 *     STAGED_REVIEW_ITEMS_CORRUPT/STAGED_PARSE_RESULT_CORRUPT → "Discard & rebuild"
 *     (or escalation copy when rebuildExhausted/escalated); any other code
 *     (freshness etc.) renders nothing.
 *   - Two-tap arm/confirm mirrors RescanSheetButton's idiom (4s auto-revert,
 *     sr-only "Tap again to confirm.", aria-busy while pending).
 *   - POST { wizardSessionId, driveFileId, code, action } to
 *     /api/admin/onboarding/resolve-blocker; onResolved() fires ONLY on
 *     { ok: true, status: "resolved" }.
 *   - Route-returned { status: "escalated" } renders escalation copy
 *     immediately — never a silent revert to idle (F1).
 *   - Code-less statuses render PLAIN_COPY, not the generic fallback (F2).
 *
 * Anti-tautology: the posted body and rendered copy are asserted
 * independently; the no-raw-code scan clones the container and strips the
 * HelpAffordance subtree first so its own accessible disclosure (which may
 * reference the code for its own internal wiring) can't satisfy the
 * assertion by accident.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { BlockedRowResolver } from "@/components/admin/BlockedRowResolver";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/onboarding",
}));

const fetchMock = vi.fn<typeof fetch>();

const DFID = "drive-blocked-row-1";
const WSID = "11111111-1111-1111-1111-111111111111";
const ARCHIVED = "SHOW_ARCHIVED_IMMUTABLE";
const CORRUPT_A = "STAGED_REVIEW_ITEMS_CORRUPT";
const FRESHNESS = "STAGED_PARSE_OUTDATED_AT_PHASE_D";

function mockJsonResponse(body: unknown, init: { status?: number } = {}) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

// Anti-tautology helper (per brief): clone the container and strip the
// HelpAffordance subtree BEFORE scanning text content, so the assertion
// proves the code isn't leaking into the dougFacing copy path itself —
// not merely that HelpAffordance's own internals happen not to echo it.
function textWithoutHelpAffordance(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[data-testid="help-affordance"]').forEach((el) => el.remove());
  return clone.textContent ?? "";
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => cleanup());

describe("BlockedRowResolver — per-code render", () => {
  test("SHOW_ARCHIVED_IMMUTABLE renders 'Unarchive & retry'", () => {
    const { getByTestId } = render(
      <BlockedRowResolver
        driveFileId={DFID}
        wizardSessionId={WSID}
        code={ARCHIVED}
        onResolved={vi.fn()}
      />,
    );
    expect(getByTestId(`blocked-row-resolver-${DFID}`).textContent).toBe("Unarchive & retry");
  });

  test("two taps (arm then confirm) POSTs { wizardSessionId, driveFileId, code, action: 'unarchive' }", async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ ok: true, status: "resolved" }));
    const { getByTestId } = render(
      <BlockedRowResolver
        driveFileId={DFID}
        wizardSessionId={WSID}
        code={ARCHIVED}
        onResolved={vi.fn()}
      />,
    );
    const btn = getByTestId(`blocked-row-resolver-${DFID}`);
    fireEvent.click(btn); // arm
    await act(async () => {
      fireEvent.click(btn); // confirm
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/admin/onboarding/resolve-blocker");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      wizardSessionId: WSID,
      driveFileId: DFID,
      code: ARCHIVED,
      action: "unarchive",
    });
  });

  test("STAGED_REVIEW_ITEMS_CORRUPT, rebuildExhausted: false renders 'Discard & rebuild'; posts action: 'rebuild'", async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ ok: true, status: "resolved" }));
    const { getByTestId } = render(
      <BlockedRowResolver
        driveFileId={DFID}
        wizardSessionId={WSID}
        code={CORRUPT_A}
        rebuildExhausted={false}
        onResolved={vi.fn()}
      />,
    );
    const btn = getByTestId(`blocked-row-resolver-${DFID}`);
    expect(btn.textContent).toBe("Discard & rebuild");
    fireEvent.click(btn); // arm
    await act(async () => {
      fireEvent.click(btn); // confirm
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      wizardSessionId: WSID,
      driveFileId: DFID,
      code: CORRUPT_A,
      action: "rebuild",
    });
  });

  test("STAGED_REVIEW_ITEMS_CORRUPT, rebuildExhausted: true renders escalation copy on first paint, NO button", () => {
    const { getByTestId, container } = render(
      <BlockedRowResolver
        driveFileId={DFID}
        wizardSessionId={WSID}
        code={CORRUPT_A}
        rebuildExhausted={true}
        onResolved={vi.fn()}
      />,
    );
    const escalated = getByTestId(`blocked-row-escalated-${DFID}`);
    expect(escalated).not.toBeNull();
    // Impeccable P0: the unrecoverable state announces to screen readers (role="alert"
    // reliably fires on this conditionally-mounted branch) and wears the warning-card idiom.
    expect(escalated.getAttribute("role")).toBe("alert");
    expect(escalated.className).toContain("bg-warning-bg");
    expect(container.querySelector('[role="button"]')).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });

  test("freshness code (STAGED_PARSE_OUTDATED_AT_PHASE_D) renders nothing", () => {
    const { container } = render(
      <BlockedRowResolver
        driveFileId={DFID}
        wizardSessionId={WSID}
        code={FRESHNESS}
        onResolved={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("BlockedRowResolver — two-tap arm/confirm mechanics", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("armed state auto-reverts after 4000ms", () => {
    vi.useFakeTimers();
    const { getByTestId } = render(
      <BlockedRowResolver
        driveFileId={DFID}
        wizardSessionId={WSID}
        code={ARCHIVED}
        onResolved={vi.fn()}
      />,
    );
    const btn = getByTestId(`blocked-row-resolver-${DFID}`);
    const idleLabel = btn.textContent;
    fireEvent.click(btn);
    expect(btn.textContent).not.toBe(idleLabel);
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(btn.textContent).toBe(idleLabel);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("disabled: true while armed disarms back to idle (no click)", () => {
    vi.useFakeTimers();
    const { getByTestId, rerender } = render(
      <BlockedRowResolver
        driveFileId={DFID}
        wizardSessionId={WSID}
        code={ARCHIVED}
        onResolved={vi.fn()}
      />,
    );
    const btn = getByTestId(`blocked-row-resolver-${DFID}`);
    const idleLabel = btn.textContent;
    fireEvent.click(btn); // arm
    expect(btn.textContent).not.toBe(idleLabel);
    rerender(
      <BlockedRowResolver
        driveFileId={DFID}
        wizardSessionId={WSID}
        code={ARCHIVED}
        disabled={true}
        onResolved={vi.fn()}
      />,
    );
    expect(getByTestId(`blocked-row-resolver-${DFID}`).textContent).toBe(idleLabel);
  });

  test("unmount while armed clears the revert timer", () => {
    vi.useFakeTimers();
    const { getByTestId, unmount } = render(
      <BlockedRowResolver
        driveFileId={DFID}
        wizardSessionId={WSID}
        code={ARCHIVED}
        onResolved={vi.fn()}
      />,
    );
    fireEvent.click(getByTestId(`blocked-row-resolver-${DFID}`));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    // No post-unmount state update: advancing timers must not throw/warn.
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(4_000);
      });
    }).not.toThrow();
  });
});

describe("BlockedRowResolver — onResolved fires only on resolved", () => {
  async function armAndConfirm(getByTestId: (id: string) => HTMLElement) {
    const btn = getByTestId(`blocked-row-resolver-${DFID}`);
    fireEvent.click(btn); // arm
    await act(async () => {
      fireEvent.click(btn); // confirm
    });
  }

  test("fires on { ok: true, status: 'resolved' }", async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ ok: true, status: "resolved" }));
    const onResolved = vi.fn();
    const { getByTestId } = render(
      <BlockedRowResolver
        driveFileId={DFID}
        wizardSessionId={WSID}
        code={ARCHIVED}
        onResolved={onResolved}
      />,
    );
    await armAndConfirm(getByTestId);
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
  });

  test("does NOT fire on { ok: false, status: 'escalated' }", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: false, status: "escalated", code: CORRUPT_A }),
    );
    const onResolved = vi.fn();
    const { getByTestId } = render(
      <BlockedRowResolver
        driveFileId={DFID}
        wizardSessionId={WSID}
        code={CORRUPT_A}
        onResolved={onResolved}
      />,
    );
    await armAndConfirm(getByTestId);
    await waitFor(() => expect(getByTestId(`blocked-row-escalated-${DFID}`)).not.toBeNull());
    expect(onResolved).not.toHaveBeenCalled();
  });

  test("does NOT fire on a network throw (error)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const onResolved = vi.fn();
    const { getByTestId } = render(
      <BlockedRowResolver
        driveFileId={DFID}
        wizardSessionId={WSID}
        code={ARCHIVED}
        onResolved={onResolved}
      />,
    );
    await armAndConfirm(getByTestId);
    await waitFor(() =>
      expect(
        getByTestId(`blocked-row-resolver-${DFID}`).parentElement?.textContent ?? "",
      ).toContain("Something went wrong. Refresh and try again."),
    );
    expect(onResolved).not.toHaveBeenCalled();
  });
});

describe("BlockedRowResolver — route-returned escalated (F1)", () => {
  test("a rebuild click whose fetch resolves { ok: false, status: 'escalated', code } renders escalation copy immediately; trigger button is gone", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: false, status: "escalated", code: CORRUPT_A }),
    );
    const { getByTestId, queryByTestId } = render(
      <BlockedRowResolver
        driveFileId={DFID}
        wizardSessionId={WSID}
        code={CORRUPT_A}
        rebuildExhausted={false}
        onResolved={vi.fn()}
      />,
    );
    const btn = getByTestId(`blocked-row-resolver-${DFID}`);
    fireEvent.click(btn); // arm
    await act(async () => {
      fireEvent.click(btn); // confirm — fetch resolves escalated
    });
    await waitFor(() => expect(getByTestId(`blocked-row-escalated-${DFID}`)).not.toBeNull());
    // The click never silently returns to idle — the trigger is gone entirely.
    expect(queryByTestId(`blocked-row-resolver-${DFID}`)).toBeNull();
  });
});

describe("BlockedRowResolver — code-less statuses get plain copy (F2)", () => {
  const PLAIN_CASES: Array<{ status: string; copy: string }> = [
    {
      status: "superseded",
      copy: "This setup was replaced by a newer run. Refresh and try again.",
    },
    {
      status: "no_active_session",
      copy: "Setup isn't running right now. Refresh the page and try again.",
    },
    { status: "not_found", copy: "This show is no longer part of this setup." },
    {
      status: "not_currently_blocked",
      copy: "This sheet isn't blocking publish anymore. Refresh to see its current state.",
    },
    { status: "wrong_action", copy: "Refresh and try again." },
  ];

  test.each(PLAIN_CASES)(
    "status '$status' renders exact PLAIN_COPY line (not the generic fallback)",
    async ({ status, copy }) => {
      fetchMock.mockResolvedValueOnce(mockJsonResponse({ ok: false, status }));
      const { getByTestId } = render(
        <BlockedRowResolver
          driveFileId={DFID}
          wizardSessionId={WSID}
          code={ARCHIVED}
          onResolved={vi.fn()}
        />,
      );
      const btn = getByTestId(`blocked-row-resolver-${DFID}`);
      fireEvent.click(btn); // arm
      await act(async () => {
        fireEvent.click(btn); // confirm
      });
      await waitFor(() => expect(btn.parentElement?.textContent ?? "").toContain(copy));
      expect(btn.parentElement?.textContent ?? "").not.toContain(
        "Something went wrong. Refresh and try again.",
      );
    },
  );

  test("needs_attention status renders messageFor(code).dougFacing", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: false, status: "needs_attention", code: ARCHIVED }),
    );
    const { getByTestId } = render(
      <BlockedRowResolver
        driveFileId={DFID}
        wizardSessionId={WSID}
        code={ARCHIVED}
        onResolved={vi.fn()}
      />,
    );
    const btn = getByTestId(`blocked-row-resolver-${DFID}`);
    fireEvent.click(btn); // arm
    await act(async () => {
      fireEvent.click(btn); // confirm
    });
    await waitFor(() =>
      expect(btn.parentElement?.textContent ?? "").toContain(
        MESSAGE_CATALOG.SHOW_ARCHIVED_IMMUTABLE.dougFacing!,
      ),
    );
  });

  test("only a network throw renders GENERIC_ERROR", async () => {
    fetchMock.mockRejectedValueOnce(new Error("boom"));
    const { getByTestId } = render(
      <BlockedRowResolver
        driveFileId={DFID}
        wizardSessionId={WSID}
        code={ARCHIVED}
        onResolved={vi.fn()}
      />,
    );
    const btn = getByTestId(`blocked-row-resolver-${DFID}`);
    fireEvent.click(btn); // arm
    await act(async () => {
      fireEvent.click(btn); // confirm
    });
    await waitFor(() =>
      expect(btn.parentElement?.textContent ?? "").toContain(
        "Something went wrong. Refresh and try again.",
      ),
    );
  });
});

describe("BlockedRowResolver — HelpAffordance gating (BLOCKRES-2, spec §3.6)", () => {
  test("code-less status (wrong_action) renders plain copy with NO HelpAffordance", async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ ok: false, status: "wrong_action" }));
    const { getByTestId, container } = render(
      <BlockedRowResolver
        driveFileId={DFID}
        wizardSessionId={WSID}
        code={ARCHIVED}
        onResolved={vi.fn()}
      />,
    );
    const btn = getByTestId(`blocked-row-resolver-${DFID}`);
    fireEvent.click(btn); // arm
    await act(async () => {
      fireEvent.click(btn); // confirm
    });
    await waitFor(() =>
      expect(btn.parentElement?.textContent ?? "").toContain("Refresh and try again."),
    );
    // code-less branch is self-explanatory — no §12.4 disclosure (mirrors RescanSheetButton's info branch).
    expect(container.querySelector('[data-testid="help-affordance"]')).toBeNull();
  });

  test("needs_attention renders HelpAffordance keyed to the RESPONSE code (not the row code)", async () => {
    // Response code differs from the row code: help must follow the response's cataloged code,
    // matching the dougFacing copy source (spec §3.6: same code drives copy + disclosure).
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: false, status: "needs_attention", code: CORRUPT_A }),
    );
    const { getByTestId, container } = render(
      <BlockedRowResolver
        driveFileId={DFID}
        wizardSessionId={WSID}
        code={ARCHIVED}
        onResolved={vi.fn()}
      />,
    );
    const btn = getByTestId(`blocked-row-resolver-${DFID}`);
    fireEvent.click(btn); // arm
    await act(async () => {
      fireEvent.click(btn); // confirm
    });
    await waitFor(() =>
      expect(btn.parentElement?.textContent ?? "").toContain(
        MESSAGE_CATALOG.STAGED_REVIEW_ITEMS_CORRUPT.dougFacing!,
      ),
    );
    expect(container.querySelector('[data-testid="help-affordance"]')).not.toBeNull();
    // The disclosure body is the RESPONSE code's helpfulContext, not the row (archived) code's.
    expect(container.querySelector('[data-testid="help-affordance-body"]')?.textContent ?? "").toBe(
      MESSAGE_CATALOG.STAGED_REVIEW_ITEMS_CORRUPT.helpfulContext!,
    );
  });
});

describe("BlockedRowResolver — escalated HelpAffordance (BLOCKRES-1)", () => {
  test("escalation branch renders a HelpAffordance disclosure for the row code, still NO button", () => {
    const { getByTestId, container } = render(
      <BlockedRowResolver
        driveFileId={DFID}
        wizardSessionId={WSID}
        code={CORRUPT_A}
        rebuildExhausted={true}
        onResolved={vi.fn()}
      />,
    );
    expect(getByTestId(`blocked-row-escalated-${DFID}`)).not.toBeNull();
    expect(container.querySelector('[data-testid="help-affordance"]')).not.toBeNull();
    // The escalated "no clickable trigger" contract is about action buttons — a disclosure
    // <summary>/<a> is neither a <button> nor role="button".
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector('[role="button"]')).toBeNull();
  });
});

describe("BlockedRowResolver — invariant 5: no raw code in visible DOM text", () => {
  test("SHOW_ARCHIVED_IMMUTABLE never appears as literal visible text (HelpAffordance subtree stripped first)", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: false, status: "needs_attention", code: ARCHIVED }),
    );
    const { getByTestId, container } = render(
      <BlockedRowResolver
        driveFileId={DFID}
        wizardSessionId={WSID}
        code={ARCHIVED}
        onResolved={vi.fn()}
      />,
    );
    const btn = getByTestId(`blocked-row-resolver-${DFID}`);
    fireEvent.click(btn); // arm
    await act(async () => {
      fireEvent.click(btn); // confirm
    });
    await waitFor(() =>
      expect(btn.parentElement?.textContent ?? "").toContain(
        MESSAGE_CATALOG.SHOW_ARCHIVED_IMMUTABLE.dougFacing!,
      ),
    );
    expect(textWithoutHelpAffordance(container)).not.toContain(ARCHIVED);
  });

  test("STAGED_REVIEW_ITEMS_CORRUPT never appears as literal visible text (escalation branch)", () => {
    const { container } = render(
      <BlockedRowResolver
        driveFileId={DFID}
        wizardSessionId={WSID}
        code={CORRUPT_A}
        rebuildExhausted={true}
        onResolved={vi.fn()}
      />,
    );
    expect(textWithoutHelpAffordance(container)).not.toContain(CORRUPT_A);
  });
});
