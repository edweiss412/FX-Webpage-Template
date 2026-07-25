// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BulkIgnoreControls, type ActiveWarningGroup } from "@/components/admin/BulkIgnoreControls";
import { WarningAnnounceContext } from "@/components/admin/review/warningAnnounceContext";

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
  itemCount: 2,
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

// N≥2 no-bulk: keeps the eyebrow — carries the data-gap-label + invariant-5
// coverage the suppressed singleton pin used to hold (spec 2026-07-24 §4.2).
const pluralNoBulkGroup = (): ActiveWarningGroup => ({
  code: "BLOCK_DISAPPEARED",
  label: "removed section",
  itemCount: 2,
  bulk: null,
  cards: <ul data-testid="cards-BLOCK_DISAPPEARED" />,
});

// A singleton / non-ignorable group: itemCount 1, no bulk → row suppressed
// (spec 2026-07-24 §2.1). Distinct code so it can co-render with the plural
// BLOCK_DISAPPEARED fixture above.
const singletonGroup = (): ActiveWarningGroup => ({
  code: "BLOCK_DISAPPEARED_SOLO",
  label: "removed section",
  itemCount: 1,
  bulk: null,
  cards: <ul data-testid="cards-BLOCK_DISAPPEARED_SOLO" />,
});

describe("BulkIgnoreControls (grouped active list)", () => {
  test("renders nothing when there are no groups", () => {
    const { container } = render(<BulkIgnoreControls slug="rpas" groups={[]} />);
    expect(container.firstChild).toBeNull();
  });

  test("bulk-eligible and plural no-bulk groups keep the eyebrow; a lone singleton suppresses it (spec 2026-07-24 §2.1)", () => {
    render(
      <BulkIgnoreControls
        slug="rpas"
        groups={[bulkGroup(), pluralNoBulkGroup(), singletonGroup()]}
      />,
    );
    // eyebrow labels asserted on the EYEBROW subtree (dedicated testid), NOT the whole
    // group — the card slot would otherwise also carry the catalog title and mask a
    // missing eyebrow (anti-tautology; spec §5.4 / spec test-scope rule).
    // Kept row 1: bulk-eligible — label + chip.
    expect(screen.getByTestId("dq-group-label-UNKNOWN_FIELD").textContent).toBe(
      "Unrecognized row in sheet",
    );
    expect(screen.getByTestId("dq-group-label-UNKNOWN_FIELD").textContent).not.toContain(
      "UNKNOWN_FIELD",
    );
    expect(screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD")).toBeInTheDocument();
    // Kept row 2: plural no-bulk — data-gap label path, invariant 5, no chip.
    expect(screen.getByTestId("dq-group-label-BLOCK_DISAPPEARED").textContent).toBe(
      "removed section",
    );
    expect(screen.getByTestId("dq-group-label-BLOCK_DISAPPEARED").textContent).not.toContain(
      "BLOCK_DISAPPEARED",
    );
    expect(screen.queryByTestId("dq-bulk-ignore-BLOCK_DISAPPEARED")).toBeNull();
    // Suppressed: singleton (itemCount 1, no bulk) — no eyebrow label, and no
    // bare header row either: the group's wrapper starts directly with the cards.
    expect(screen.queryByTestId("dq-group-label-BLOCK_DISAPPEARED_SOLO")).toBeNull();
    const solo = screen.getByTestId("dq-active-group-BLOCK_DISAPPEARED_SOLO");
    expect(solo.querySelector(".h-px")).toBeNull(); // no hairline row
    // Structural pin (spec §4.1): the wrapper's FIRST child IS the cards slot — a
    // surviving empty header div (hairline stripped but row present) fails here.
    expect(solo.firstElementChild).toBe(within(solo).getByTestId("cards-BLOCK_DISAPPEARED_SOLO"));
    // cards slotted through on kept rows too
    expect(screen.getByTestId("cards-UNKNOWN_FIELD")).toBeInTheDocument();
    expect(screen.getByTestId("cards-BLOCK_DISAPPEARED")).toBeInTheDocument();
  });

  test("a group with one visible card but a live bulk chip keeps the eyebrow row (spec 2026-07-24 §2.1)", () => {
    // Count derived from this fixture array (anti-tautology): the chip's N is the
    // bulk item count, NOT the visible-card count.
    const bulkItems = [
      { code: "FIELD_UNREADABLE", rawSnippet: "Crew phone | ???" },
      { code: "FIELD_UNREADABLE", rawSnippet: "Hotel | ???" },
    ];
    render(
      <BulkIgnoreControls
        slug="rpas"
        groups={[
          {
            code: "FIELD_UNREADABLE",
            label: "Unreadable field",
            itemCount: 1, // one card left in the slot — the other moved under a crew row
            bulk: {
              code: "FIELD_UNREADABLE",
              label: "Unreadable field",
              items: bulkItems,
            },
            cards: <ul data-testid="cards-FIELD_UNREADABLE" />,
          },
        ]}
      />,
    );
    expect(screen.getByTestId("dq-group-label-FIELD_UNREADABLE").textContent).toBe(
      "Unreadable field",
    );
    // The count left the VISIBLE label (spec 2026-07-24-dq-eyebrow-divider §3.2); it
    // survives in the accessible name, asserted below.
    expect(screen.getByTestId("dq-bulk-ignore-FIELD_UNREADABLE").textContent).toBe("Ignore");
  });

  test("chip count derives from bulk.items — NOT from itemCount", () => {
    const g = bulkGroup(); // 2 distinct items
    // itemCount deliberately disagrees with items.length so a name read off the
    // wrong field cannot pass: the fixture's own 2 is otherwise indistinguishable.
    render(<BulkIgnoreControls slug="rpas" groups={[{ ...g, itemCount: 7 }]} />);
    const chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD");
    expect(chip.textContent).toBe("Ignore"); // visible label carries no count at all
    expect(chip.getAttribute("aria-label")).toBe("Ignore 2 · Unrecognized row in sheet");
  });

  test("chip accessible name TRACKS the visible text + appends the type (WCAG 2.5.3 across the morph)", () => {
    render(<BulkIgnoreControls slug="rpas" groups={[bulkGroup()]} />);
    const chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD");
    // idle: the visible "Ignore" is a prefix of the name, which restores the count
    // the label dropped plus the type context.
    expect(chip.textContent).toBe("Ignore");
    expect(chip.getAttribute("aria-label")).toBe("Ignore 2 · Unrecognized row in sheet");
    fireEvent.click(chip); // arm
    // armed: the name must lead with the NEW visible text "Are you sure?" (not a stale
    // "Ignore 2"); a fixed aria-label would fail Label-in-Name in this state.
    expect(chip.textContent).toBe("Are you sure?");
    expect(chip.getAttribute("aria-label")).toBe(
      "Are you sure? Ignore 2 · Unrecognized row in sheet",
    );
  });

  test("a plural group with NO label and NO chip suppresses the eyebrow row entirely", () => {
    // bulkGroupLabel() returns null for a code with neither a catalog title nor a
    // data-gap class label (lib/admin/sectionWarningModel.ts), and a non-ignorable
    // code has no chip — so this row would carry ONLY the decorative rule. Below
    // 480px that rule is display:none, leaving an EMPTY flex item that still charges
    // the parent's gap-2: the very phantom-gap class this change removes (DESIGN.md
    // §7a). The row must not render at all.
    render(
      <BulkIgnoreControls
        slug="rpas"
        groups={[
          {
            code: "UNCATALOGED_CODE",
            label: null,
            itemCount: 2,
            bulk: null,
            cards: <ul data-testid="cards-UNCATALOGED_CODE" />,
          },
        ]}
      />,
    );
    const group = screen.getByTestId("dq-active-group-UNCATALOGED_CODE");
    expect(group.querySelector(".h-px")).toBeNull(); // no rule, so no row carrying it
    // Structural pin: the wrapper's FIRST child IS the cards slot — a surviving empty
    // header div (rule stripped but row present) still charges the gap and fails here.
    expect(group.firstElementChild).toBe(within(group).getByTestId("cards-UNCATALOGED_CODE"));
  });

  test("armed chip goes full-width below 480px and stays inline at/above it; idle does neither", () => {
    render(<BulkIgnoreControls slug="rpas" groups={[bulkGroup()]} />);
    const chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD");
    // The chip and its role=status sibling share a fragment, so the button's parent
    // IS the eyebrow row. Pin that before reading the row's classes.
    const row = chip.parentElement!;
    expect(row.className).toContain("items-center");
    const idle = new Set(chip.className.split(/\s+/));
    expect(idle.has("w-full")).toBe(false);
    expect(new Set(row.className.split(/\s+/)).has("flex-wrap")).toBe(false);
    fireEvent.click(chip); // arm
    const armed = new Set(chip.className.split(/\s+/));
    // w-full without its min-[480px] counterpart would put a full-panel confirm bar
    // on desktop (spec §1.1 rejects that); flex-wrap without the armed guard would
    // push the IDLE chip to its own line (+18px per group at rest).
    expect(armed.has("w-full")).toBe(true);
    expect(armed.has("min-[480px]:w-auto")).toBe(true);
    expect(armed.has("justify-center")).toBe(true);
    expect(armed.has("min-[480px]:justify-start")).toBe(true);
    expect(new Set(row.className.split(/\s+/)).has("flex-wrap")).toBe(true);
  });

  test("arming does not move focus off the chip (same element, wrapped line)", () => {
    render(<BulkIgnoreControls slug="rpas" groups={[bulkGroup()]} />);
    const chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD") as HTMLButtonElement;
    chip.focus();
    fireEvent.click(chip);
    // A confirm rendered as a DIFFERENT element in a different parent would unmount
    // the focused node here and drop focus to <body>.
    expect(document.activeElement).toBe(chip);
    expect(chip.textContent).toBe("Are you sure?");
  });

  test("a group with no label still names the count (the label-less branch is not anonymous)", () => {
    render(
      <BulkIgnoreControls
        slug="rpas"
        groups={[
          {
            code: "UNKNOWN_FIELD",
            label: null,
            itemCount: 2,
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
    // No type context to append, but the count still has to reach assistive tech —
    // the visible label no longer carries it (spec §3.3, null-label column).
    expect(chip.getAttribute("aria-label")).toBe("Ignore 2");
    expect(chip.textContent).toBe("Ignore");
    fireEvent.click(chip); // arm
    expect(chip.getAttribute("aria-label")).toBe("Are you sure? Ignore 2");
    // no label → no eyebrow label span either
    expect(screen.queryByTestId("dq-group-label-UNKNOWN_FIELD")).toBeNull();
  });

  test("the bulk chip fires one POST per distinct item, then refreshes; chip re-enables", async () => {
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
      itemCount: 3,
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

    test("first tap arms: no fetch, confirm label + recipe classes", () => {
      vi.useFakeTimers();
      render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      const btn = screen.getByTestId(`dq-bulk-ignore-${groupX.code}`);
      fireEvent.click(btn);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(btn.textContent).toBe("Are you sure?");
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
      expect(btnX.textContent).toBe("Ignore");
      expect(btnY.textContent).toBe("Are you sure?");
      act(() => vi.advanceTimersByTime(2_500)); // past X's original window, only 2.5s from Y's arm
      expect(btnY.textContent).toContain("Are you sure?");
      act(() => vi.advanceTimersByTime(1_500)); // 4s from Y's arm → disarms Y
      expect(btnY.textContent).toBe("Ignore");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test("4s auto-revert restores the idle branch without firing", () => {
      vi.useFakeTimers();
      render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      const btn = screen.getByTestId(`dq-bulk-ignore-${groupX.code}`);
      const idleClass = btn.className;
      fireEvent.click(btn);
      expect(btn.textContent).toContain("Are you sure?");
      act(() => vi.advanceTimersByTime(4_000));
      expect(btn.textContent).toBe("Ignore");
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
      expect(btn.textContent).not.toContain("Are you sure?");
      fireEvent.click(btn);
      expect(btn.textContent).toBe("Are you sure?");
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

  describe("announce producer (announcer spec 2026-07-22 §2.3)", () => {
    function renderWithAnnounce(groups: ActiveWarningGroup[]) {
      const announce = vi.fn();
      render(
        <WarningAnnounceContext.Provider value={{ announce }}>
          <BulkIgnoreControls slug="rpas" groups={groups} />
        </WarningAnnounceContext.Provider>,
      );
      return announce;
    }

    test("all-ok bulk announces the derived count clause exactly once, BEFORE refresh", async () => {
      fetchMock.mockResolvedValue(okResponse());
      const g = bulkGroup();
      const announce = renderWithAnnounce([g]);
      const chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD");
      fireEvent.click(chip);
      fireEvent.click(chip);
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      const n = g.bulk!.items.length; // derived from the fixture, not hardcoded
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith(n === 1 ? "1 ignored." : `${n} ignored.`);
      // Announce-before-refresh ordering (plan-review R1 F4): a refresh-first
      // implementation can lose the announcement to a surface replacement.
      expect(announce.mock.invocationCallOrder[0]!).toBeLessThan(
        refresh.mock.invocationCallOrder[0]!,
      );
    });

    test("singular clause for a 1-item group", async () => {
      fetchMock.mockResolvedValue(okResponse());
      const g: ActiveWarningGroup = {
        code: "UNKNOWN_FIELD",
        label: "Unrecognized row in sheet",
        itemCount: 1,
        bulk: {
          code: "UNKNOWN_FIELD",
          label: "Unrecognized row in sheet",
          items: [{ code: "UNKNOWN_FIELD", rawSnippet: "Storage | dock" }],
        },
        cards: <ul data-testid="cards-UNKNOWN_FIELD" />,
      };
      const announce = renderWithAnnounce([g]);
      const chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD");
      fireEvent.click(chip);
      fireEvent.click(chip);
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith("1 ignored.");
    });

    test("partial fan-out failure announces nothing (R2 F7)", async () => {
      fetchMock
        .mockResolvedValueOnce(okResponse())
        .mockResolvedValueOnce({ ok: false, json: async () => ({}) } as unknown as Response);
      const announce = renderWithAnnounce([bulkGroup()]);
      const chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD");
      fireEvent.click(chip);
      fireEvent.click(chip);
      await screen.findByRole("alert");
      expect(announce).not.toHaveBeenCalled();
    });

    test("total failure and thrown fetch announce nothing (R2 F7)", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) } as unknown as Response);
      let announce = renderWithAnnounce([bulkGroup()]);
      let chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD");
      fireEvent.click(chip);
      fireEvent.click(chip);
      await screen.findByRole("alert");
      expect(announce).not.toHaveBeenCalled();
      cleanup();
      fetchMock.mockReset();
      fetchMock.mockRejectedValue(new Error("network down"));
      announce = renderWithAnnounce([bulkGroup()]);
      chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD");
      fireEvent.click(chip);
      fireEvent.click(chip);
      await screen.findByRole("alert");
      expect(announce).not.toHaveBeenCalled();
    });

    test("chip status region text only ever holds the armed prompt or empty, whole flow (R2 F5, R3 F4, R2 F6b)", async () => {
      fetchMock.mockResolvedValue(okResponse());
      const announce = renderWithAnnounce([bulkGroup()]);
      const chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD");
      const region = chip.nextElementSibling as HTMLElement;
      // Observer attached at INITIAL render, before any tap. Every value the
      // region's text EVER held is reconstructible from: the initial value,
      // every characterData oldValue, every inserted/removed Text node's data,
      // and the final value (a transient write leaves its trace as the next
      // mutation's oldValue).
      const observed = new Set<string>([region.textContent ?? ""]);
      const ingest = (rs: MutationRecord[]) => {
        for (const r of rs) {
          if (r.type === "characterData" && r.oldValue !== null) observed.add(r.oldValue);
          for (const n of [...Array.from(r.addedNodes), ...Array.from(r.removedNodes)]) {
            observed.add(n.textContent ?? "");
          }
        }
      };
      const mo = new MutationObserver(ingest);
      mo.observe(region, {
        childList: true,
        subtree: true,
        characterData: true,
        characterDataOldValue: true,
      });
      fireEvent.click(chip); // arm
      // Armed prompt asserted POSITIVELY (the ratified §1.1 item 2 behavior).
      expect(region.textContent).toBe("Tap again to confirm.");
      fireEvent.click(chip); // confirm
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      ingest(mo.takeRecords());
      mo.disconnect();
      observed.add(region.textContent ?? "");
      for (const v of observed) {
        expect(["", "Tap again to confirm."]).toContain(v);
      }
      expect(region.textContent).toBe("");
      expect(announce).toHaveBeenCalledTimes(1);
    });
  });
});

describe("eyebrow wrap (crewwarn-instance-discriminator §2.5)", () => {
  test("eyebrow label wraps instead of truncating (no truncate class)", () => {
    render(<BulkIgnoreControls slug="s" groups={[bulkGroup()]} />);
    const label = screen.getByTestId("dq-group-label-UNKNOWN_FIELD");
    expect(label.className).not.toContain("truncate");
    expect(label.className).toContain("min-w-0");
  });
});
