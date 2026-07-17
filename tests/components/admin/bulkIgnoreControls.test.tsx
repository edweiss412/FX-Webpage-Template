// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BulkIgnoreControls } from "@/components/admin/BulkIgnoreControls";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => cleanup());

function okResponse(): Response {
  return { ok: true, json: async () => ({ status: "ignored" }) } as unknown as Response;
}

const groups = [
  {
    code: "UNKNOWN_FIELD",
    label: "Unrecognized row in sheet",
    items: [
      { code: "UNKNOWN_FIELD", rawSnippet: "Storage | dock" },
      { code: "UNKNOWN_FIELD", rawSnippet: "Floor Plan | link" },
    ],
  },
];

describe("BulkIgnoreControls", () => {
  test("renders nothing when there are no groups", () => {
    const { container } = render(<BulkIgnoreControls slug="rpas" groups={[]} />);
    expect(container.firstChild).toBeNull();
  });

  test("Ignore all N fires one ignore POST per distinct item, then refreshes", async () => {
    fetchMock.mockResolvedValue(okResponse());
    render(<BulkIgnoreControls slug="rpas" groups={groups} />);
    const btn = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD") as HTMLButtonElement;
    expect(btn.textContent).toMatch(/Ignore all 2/);
    // the type label disambiguates when several code groups are shown
    expect(btn.textContent).toContain("Unrecognized row in sheet");
    // G4 two-tap guard: first click arms, second click fires.
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    // one precise per-fingerprint insert per distinct item (NOT a coarse code-level ignore)
    const bodies = fetchMock.mock.calls.map(
      (c) => JSON.parse((c[1] as RequestInit).body as string) as unknown,
    );
    expect(bodies).toEqual([
      { code: "UNKNOWN_FIELD", rawSnippet: "Storage | dock" },
      { code: "UNKNOWN_FIELD", rawSnippet: "Floor Plan | link" },
    ]);
    for (const c of fetchMock.mock.calls) {
      expect(c[0]).toBe("/api/admin/show/rpas/data-quality/ignore");
      expect((c[1] as RequestInit).method).toBe("POST");
    }
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    // Stuck-disabled guard (audit P1): router.refresh() is a soft refresh that keeps this
    // client state, so on success the component must reset to idle — the button re-enables
    // rather than staying disabled forever when other code groups remain.
    await waitFor(() => expect(btn.disabled).toBe(false));
  });

  test("partial fan-out failure reports 'Ignored X of N' honestly and does NOT refresh", async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) } as unknown as Response);
    render(<BulkIgnoreControls slug="rpas" groups={groups} />);
    // G4 two-tap guard: first click arms, second click fires.
    fireEvent.click(screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD"));
    fireEvent.click(screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD"));
    const alert = await screen.findByRole("alert");
    // The succeeded insert IS committed, so the copy must not imply total failure.
    expect(alert.textContent).toMatch(/Ignored 1 of 2/);
    expect(refresh).not.toHaveBeenCalled();
  });

  test("total fan-out failure shows the generic retry copy", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) } as unknown as Response);
    render(<BulkIgnoreControls slug="rpas" groups={groups} />);
    // G4 two-tap guard: first click arms, second click fires.
    fireEvent.click(screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD"));
    fireEvent.click(screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Couldn't ignore those warnings/);
    expect(refresh).not.toHaveBeenCalled();
  });

  // G4 (spec 2026-07-16-destructive-confirm-pass §4): armedCode state model —
  // exactly one group armed at a time, single shared 4s timer, second tap on the
  // armed group runs the EXISTING ignoreGroup(group) unchanged.
  describe("G4 two-tap armed-state guard", () => {
    const groupX = groups[0]!; // UNKNOWN_FIELD, 2 items
    const groupY = {
      code: "FIELD_UNREADABLE",
      label: "Unreadable field",
      items: [
        { code: "FIELD_UNREADABLE", rawSnippet: "Crew phone | ???" },
        { code: "FIELD_UNREADABLE", rawSnippet: "Hotel | ???" },
        { code: "FIELD_UNREADABLE", rawSnippet: "Venue | ???" },
      ],
    };
    const twoGroups = [groupX, groupY];

    // Armed morph compensates the idle `border border-border-strong` with
    // `border border-transparent` — no 2px layout shift on arm/auto-revert.
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

    afterEach(() => {
      vi.useRealTimers();
    });

    test("first tap arms: no fetch, Confirm label + recipe classes; · label span stays, font-normal, no text-text-subtle", () => {
      vi.useFakeTimers();
      render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      const btn = screen.getByTestId(`dq-bulk-ignore-${groupX.code}`);
      fireEvent.click(btn);
      expect(fetchMock).not.toHaveBeenCalled();
      // N derived from the fixture, never hardcoded.
      expect(btn.textContent).toContain(`Confirm: ignore all ${groupX.items.length}`);
      expectDestructiveRecipe(btn);
      // The group-identifying span remains while armed, but without the
      // text-text-subtle override (it inherits the recipe's text-warning-bg).
      const span = btn.querySelector("span")!;
      expect(span.textContent).toBe(`· ${groupX.label}`);
      expect(span.className.split(/\s+/)).toContain("font-normal");
      expect(span.className.split(/\s+/)).not.toContain("text-text-subtle");
    });

    test("second tap on the armed group fires ignoreGroup once and clears the pending disarm timer", async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue(okResponse());
      render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      const btn = screen.getByTestId(`dq-bulk-ignore-${groupX.code}`);
      fireEvent.click(btn); // arm
      fireEvent.click(btn); // confirm — fires
      // One POST per distinct item, derived from the fixture.
      expect(fetchMock).toHaveBeenCalledTimes(groupX.items.length);
      // The fire path killed the pending disarm timer (real observable).
      expect(vi.getTimerCount()).toBe(0);
      await act(async () => {
        vi.advanceTimersByTime(4_000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(groupX.items.length);
    });

    test("tapping Y while X is armed re-arms Y with a restarted timer; X reverts silently", () => {
      vi.useFakeTimers();
      render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      const btnX = screen.getByTestId(`dq-bulk-ignore-${groupX.code}`);
      const btnY = screen.getByTestId(`dq-bulk-ignore-${groupY.code}`);
      fireEvent.click(btnX); // arm X at t=0
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      fireEvent.click(btnY); // re-arm: Y armed at t=2000, X reverts
      expect(btnX.textContent).toContain(`Ignore all ${groupX.items.length}`);
      expect(btnX.textContent).not.toContain("Confirm");
      expect(btnY.textContent).toContain(`Confirm: ignore all ${groupY.items.length}`);
      expect(fetchMock).not.toHaveBeenCalled();
      // Advancing only X's remainder (to t=4500 — past X's original 4s window,
      // but only 2.5s from Y's arm) must NOT disarm Y — stale-timer proof.
      act(() => {
        vi.advanceTimersByTime(2_500);
      });
      expect(btnY.textContent).toContain(`Confirm: ignore all ${groupY.items.length}`);
      // Advancing to 4s from Y's arm disarms Y.
      act(() => {
        vi.advanceTimersByTime(1_500);
      });
      expect(btnY.textContent).not.toContain("Confirm");
      expect(btnY.textContent).toContain(`Ignore all ${groupY.items.length}`);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test("4s auto-revert restores the idle branch without firing", () => {
      vi.useFakeTimers();
      render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      const btn = screen.getByTestId(`dq-bulk-ignore-${groupX.code}`);
      const idleClass = btn.className;
      fireEvent.click(btn);
      expect(btn.textContent).toContain("Confirm: ignore all");
      act(() => {
        vi.advanceTimersByTime(4_000);
      });
      expect(btn.textContent).toContain(`Ignore all ${groupX.items.length}`);
      expect(btn.textContent).not.toContain("Confirm");
      expect(btn.className).toBe(idleClass);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test("per-group persistent sr-only status regions announce arming and clear on auto-revert", () => {
      vi.useFakeTimers();
      render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      const btnX = screen.getByTestId(`dq-bulk-ignore-${groupX.code}`);
      const btnY = screen.getByTestId(`dq-bulk-ignore-${groupY.code}`);
      const regionX = btnX.nextElementSibling as HTMLElement;
      const regionY = btnY.nextElementSibling as HTMLElement;
      for (const region of [regionX, regionY]) {
        expect(region).not.toBeNull();
        expect(region.getAttribute("role")).toBe("status");
        expect(region.className.split(/\s+/)).toContain("sr-only");
        expect(region.textContent).toBe("");
      }
      fireEvent.click(btnX); // arm X — only X's region announces
      expect(regionX.textContent).toBe("Tap again to confirm.");
      expect(regionY.textContent).toBe("");
      act(() => {
        vi.advanceTimersByTime(4_000);
      });
      // Same persistently-mounted elements, emptied — never unmounted.
      expect(btnX.nextElementSibling).toBe(regionX);
      expect(regionX.textContent).toBe("");
      expect(regionY.textContent).toBe("");
    });

    test("running disables ALL group buttons and no group stays armed", async () => {
      const resolvers: Array<(r: Response) => void> = [];
      fetchMock.mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolvers.push(resolve);
          }),
      );
      render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      const btnX = screen.getByTestId(`dq-bulk-ignore-${groupX.code}`) as HTMLButtonElement;
      const btnY = screen.getByTestId(`dq-bulk-ignore-${groupY.code}`) as HTMLButtonElement;
      fireEvent.click(btnX); // arm
      fireEvent.click(btnX); // confirm — running
      await waitFor(() => expect(btnX.textContent).toContain("Ignoring…"));
      expect(btnX.disabled).toBe(true);
      expect(btnY.disabled).toBe(true);
      // Entering running clears armedCode: no button renders a Confirm label.
      expect(btnX.textContent).not.toContain("Confirm");
      expect(btnY.textContent).not.toContain("Confirm");
      await act(async () => {
        for (const r of resolvers) r(okResponse());
      });
      await waitFor(() => expect(btnX.disabled).toBe(false));
    });

    test("error outcome leaves no group armed; a fresh tap re-arms cleanly", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) } as unknown as Response);
      render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      const btn = screen.getByTestId(`dq-bulk-ignore-${groupX.code}`);
      fireEvent.click(btn); // arm
      fireEvent.click(btn); // confirm — fires, total failure
      await screen.findByRole("alert");
      // Entering error clears armedCode: nothing renders armed.
      expect(btn.textContent).not.toContain("Confirm");
      // The state machine is sane afterward: one tap arms again.
      fireEvent.click(btn);
      expect(btn.textContent).toContain(`Confirm: ignore all ${groupX.items.length}`);
      // Only the first fire's fan-out hit the network (re-arming never fetches).
      expect(fetchMock).toHaveBeenCalledTimes(groupX.items.length);
    });

    test("unmount while armed clears the timer", () => {
      vi.useFakeTimers();
      const { unmount } = render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      fireEvent.click(screen.getByTestId(`dq-bulk-ignore-${groupX.code}`));
      expect(vi.getTimerCount()).toBe(1);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
