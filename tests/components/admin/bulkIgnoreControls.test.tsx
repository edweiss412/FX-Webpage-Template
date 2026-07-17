// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BulkIgnoreControls, type ActiveWarningGroup } from "@/components/admin/BulkIgnoreControls";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

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

// A bulk-eligible group (2 distinct contents) + a card slot marker.
const bulkGroup = (): ActiveWarningGroup => ({
  code: "UNKNOWN_FIELD",
  label: "Unrecognized row in sheet",
  bulk: {
    code: "UNKNOWN_FIELD",
    label: "Unrecognized row in sheet",
    items: [
      { code: "UNKNOWN_FIELD", rawSnippet: "Storage | dock" },
      { code: "UNKNOWN_FIELD", rawSnippet: "Floor Plan | link" },
    ],
  },
  cards: <ul data-testid="cards-UNKNOWN_FIELD" />,
});

// A singleton / non-ignorable group: no bulk → no chip.
const singletonGroup = (): ActiveWarningGroup => ({
  code: "BLOCK_DISAPPEARED",
  label: "removed section",
  bulk: null,
  cards: <ul data-testid="cards-BLOCK_DISAPPEARED" />,
});

describe("BulkIgnoreControls (grouped active list)", () => {
  test("renders nothing when there are no groups", () => {
    const { container } = render(<BulkIgnoreControls slug="rpas" groups={[]} />);
    expect(container.firstChild).toBeNull();
  });

  test("every group renders an eyebrow with its label + its cards; only bulk-eligible groups get a chip", () => {
    render(<BulkIgnoreControls slug="rpas" groups={[bulkGroup(), singletonGroup()]} />);
    // eyebrow labels asserted on the EYEBROW subtree (dedicated testid), NOT the whole
    // group — the card slot would otherwise also carry the catalog title and mask a
    // missing eyebrow (anti-tautology; spec §5.4 / spec test-scope rule).
    expect(screen.getByTestId("dq-group-label-UNKNOWN_FIELD").textContent).toBe(
      "Unrecognized row in sheet",
    );
    expect(screen.getByTestId("dq-group-label-BLOCK_DISAPPEARED").textContent).toBe(
      "removed section",
    );
    // invariant 5: the raw code is never printed in the eyebrow
    expect(screen.getByTestId("dq-group-label-UNKNOWN_FIELD").textContent).not.toContain(
      "UNKNOWN_FIELD",
    );
    expect(screen.getByTestId("dq-group-label-BLOCK_DISAPPEARED").textContent).not.toContain(
      "BLOCK_DISAPPEARED",
    );
    // cards slotted through
    expect(screen.getByTestId("cards-UNKNOWN_FIELD")).toBeInTheDocument();
    expect(screen.getByTestId("cards-BLOCK_DISAPPEARED")).toBeInTheDocument();
    // chip only on the bulk-eligible group
    expect(screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD")).toBeInTheDocument();
    expect(screen.queryByTestId("dq-bulk-ignore-BLOCK_DISAPPEARED")).toBeNull();
  });

  test("chip count derives from the group's distinct-content items", () => {
    const g = bulkGroup();
    render(<BulkIgnoreControls slug="rpas" groups={[g]} />);
    const chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD");
    expect(chip.textContent).toBe(`Ignore all ${g.bulk!.items.length}`); // no "· label" suffix now
  });

  test("chip accessible name TRACKS the visible text + appends the type (WCAG 2.5.3 across the morph)", () => {
    render(<BulkIgnoreControls slug="rpas" groups={[bulkGroup()]} />);
    const chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD");
    // idle: accessible name mirrors the visible "Ignore all 2" AND carries the type context.
    expect(chip.getAttribute("aria-label")).toBe("Ignore all 2 · Unrecognized row in sheet");
    fireEvent.click(chip); // arm
    // armed: the name must contain the NEW visible text "Confirm ignore all 2" (not a stale
    // "Ignore all 2"); a fixed aria-label would fail Label-in-Name in this state.
    expect(chip.textContent).toBe("Confirm ignore all 2");
    expect(chip.getAttribute("aria-label")).toBe(
      "Confirm ignore all 2 · Unrecognized row in sheet",
    );
  });

  test("a group with no label omits aria-label (visible chip text is the accessible name)", () => {
    render(
      <BulkIgnoreControls
        slug="rpas"
        groups={[
          {
            code: "UNKNOWN_FIELD",
            label: null,
            bulk: {
              code: "UNKNOWN_FIELD",
              label: null,
              items: [
                { code: "UNKNOWN_FIELD", rawSnippet: "a | 1" },
                { code: "UNKNOWN_FIELD", rawSnippet: "b | 2" },
              ],
            },
            cards: <ul data-testid="cards-UNKNOWN_FIELD" />,
          },
        ]}
      />,
    );
    const chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD");
    expect(chip.getAttribute("aria-label")).toBeNull();
    expect(chip.textContent).toBe("Ignore all 2");
    // no label → no eyebrow label span either
    expect(screen.queryByTestId("dq-group-label-UNKNOWN_FIELD")).toBeNull();
  });

  test("Ignore all N fires one POST per distinct item, then refreshes; chip re-enables", async () => {
    fetchMock.mockResolvedValue(okResponse());
    render(<BulkIgnoreControls slug="rpas" groups={[bulkGroup()]} />);
    const chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD") as HTMLButtonElement;
    fireEvent.click(chip); // arm
    fireEvent.click(chip); // confirm → fires
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const bodies = fetchMock.mock.calls.map((c) =>
      JSON.parse((c[1] as RequestInit).body as string),
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
    await waitFor(() => expect(chip.disabled).toBe(false));
  });

  test("partial fan-out failure reports 'Ignored X of N' INSIDE the acting group and does NOT refresh", async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) } as unknown as Response);
    render(<BulkIgnoreControls slug="rpas" groups={[bulkGroup(), singletonGroup()]} />);
    fireEvent.click(screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD"));
    fireEvent.click(screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Ignored 1 of 2/);
    expect(refresh).not.toHaveBeenCalled();
    // the notice lives in the acting group's wrapper, below its cards — not at panel top
    const group = screen.getByTestId("dq-active-group-UNKNOWN_FIELD");
    expect(within(group).getByRole("alert")).toBe(alert);
    expect(
      within(group).getByTestId("cards-UNKNOWN_FIELD").compareDocumentPosition(alert) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("total fan-out failure shows the generic retry copy", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) } as unknown as Response);
    render(<BulkIgnoreControls slug="rpas" groups={[bulkGroup()]} />);
    fireEvent.click(screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD"));
    fireEvent.click(screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Couldn't ignore those warnings/);
    expect(refresh).not.toHaveBeenCalled();
  });

  describe("G4 two-tap armed-state guard (single-armed panel-wide)", () => {
    const groupX = bulkGroup(); // UNKNOWN_FIELD, 2 items
    const groupY: ActiveWarningGroup = {
      code: "FIELD_UNREADABLE",
      label: "Unreadable field",
      bulk: {
        code: "FIELD_UNREADABLE",
        label: "Unreadable field",
        items: [
          { code: "FIELD_UNREADABLE", rawSnippet: "Crew phone | ???" },
          { code: "FIELD_UNREADABLE", rawSnippet: "Hotel | ???" },
          { code: "FIELD_UNREADABLE", rawSnippet: "Venue | ???" },
        ],
      },
      cards: <ul data-testid="cards-FIELD_UNREADABLE" />,
    };
    const twoGroups = [groupX, groupY];

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
      for (const t of ["bg-accent", "bg-surface", "bg-bg"]) expect(tokens).not.toContain(t);
    }

    afterEach(() => vi.useRealTimers());

    test("first tap arms: no fetch, Confirm label + recipe classes", () => {
      vi.useFakeTimers();
      render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      const btn = screen.getByTestId(`dq-bulk-ignore-${groupX.code}`);
      fireEvent.click(btn);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(btn.textContent).toBe(`Confirm ignore all ${groupX.bulk!.items.length}`);
      expectDestructiveRecipe(btn);
    });

    test("second tap on the armed group fires once and clears the pending disarm timer", () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue(okResponse());
      render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      const btn = screen.getByTestId(`dq-bulk-ignore-${groupX.code}`);
      fireEvent.click(btn);
      fireEvent.click(btn);
      expect(fetchMock).toHaveBeenCalledTimes(groupX.bulk!.items.length);
      expect(vi.getTimerCount()).toBe(0);
    });

    test("tapping Y while X is armed re-arms Y with a restarted timer; X reverts (single-armed)", () => {
      vi.useFakeTimers();
      render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      const btnX = screen.getByTestId(`dq-bulk-ignore-${groupX.code}`);
      const btnY = screen.getByTestId(`dq-bulk-ignore-${groupY.code}`);
      fireEvent.click(btnX);
      act(() => vi.advanceTimersByTime(2_000));
      fireEvent.click(btnY);
      expect(btnX.textContent).toBe(`Ignore all ${groupX.bulk!.items.length}`);
      expect(btnY.textContent).toBe(`Confirm ignore all ${groupY.bulk!.items.length}`);
      act(() => vi.advanceTimersByTime(2_500)); // past X's original window, only 2.5s from Y's arm
      expect(btnY.textContent).toContain("Confirm");
      act(() => vi.advanceTimersByTime(1_500)); // 4s from Y's arm → disarms Y
      expect(btnY.textContent).toBe(`Ignore all ${groupY.bulk!.items.length}`);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test("4s auto-revert restores the idle branch without firing", () => {
      vi.useFakeTimers();
      render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      const btn = screen.getByTestId(`dq-bulk-ignore-${groupX.code}`);
      const idleClass = btn.className;
      fireEvent.click(btn);
      expect(btn.textContent).toContain("Confirm");
      act(() => vi.advanceTimersByTime(4_000));
      expect(btn.textContent).toBe(`Ignore all ${groupX.bulk!.items.length}`);
      expect(btn.className).toBe(idleClass);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test("per-group sr-only status region announces arming and clears on auto-revert", () => {
      vi.useFakeTimers();
      render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      const btnX = screen.getByTestId(`dq-bulk-ignore-${groupX.code}`);
      const btnY = screen.getByTestId(`dq-bulk-ignore-${groupY.code}`);
      const regionX = btnX.nextElementSibling as HTMLElement;
      const regionY = btnY.nextElementSibling as HTMLElement;
      for (const region of [regionX, regionY]) {
        expect(region.getAttribute("role")).toBe("status");
        expect(region.className.split(/\s+/)).toContain("sr-only");
        expect(region.textContent).toBe("");
      }
      fireEvent.click(btnX);
      expect(regionX.textContent).toBe("Tap again to confirm.");
      expect(regionY.textContent).toBe("");
      act(() => vi.advanceTimersByTime(4_000));
      expect(btnX.nextElementSibling).toBe(regionX); // never unmounted
      expect(regionX.textContent).toBe("");
    });

    test("running disables ALL chips and clears armed", async () => {
      const resolvers: Array<(r: Response) => void> = [];
      fetchMock.mockImplementation(
        () => new Promise<Response>((resolve) => resolvers.push(resolve)),
      );
      render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      const btnX = screen.getByTestId(`dq-bulk-ignore-${groupX.code}`) as HTMLButtonElement;
      const btnY = screen.getByTestId(`dq-bulk-ignore-${groupY.code}`) as HTMLButtonElement;
      fireEvent.click(btnX);
      fireEvent.click(btnX);
      await waitFor(() => expect(btnX.textContent).toContain("Ignoring…"));
      expect(btnX.disabled).toBe(true);
      expect(btnY.disabled).toBe(true);
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
      fireEvent.click(btn);
      fireEvent.click(btn);
      await screen.findByRole("alert");
      expect(btn.textContent).not.toContain("Confirm");
      fireEvent.click(btn);
      expect(btn.textContent).toBe(`Confirm ignore all ${groupX.bulk!.items.length}`);
      expect(fetchMock).toHaveBeenCalledTimes(groupX.bulk!.items.length);
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
