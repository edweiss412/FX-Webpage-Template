// @vitest-environment jsdom
/**
 * tests/components/admin/ArchiveShowButton.test.tsx (M12.2 Phase B2 Task 7.2)
 *
 * Two-tap Archive control (spec §2.2). Contract:
 *   - resting: a single [Archive] button.
 *   - tap 1 → morphs the SAME box to the links-dead confirm copy (no dispatch).
 *   - tap 2 (Confirm) → dispatches the form action exactly once.
 *   - one tap alone does NOT dispatch.
 *   - 4s idle reverts armed → resting (no dispatch).
 *   - the submit button disables on useFormStatus().pending, NOT synchronously
 *     in its own onClick — the React 19 form-action cancel lesson (B1 revoke
 *     hang): a self-disabling submit cancels the dispatch (0 POSTs). We assert
 *     the dispatch fires (action called) AND that the button has no synchronous
 *     onClick-disable.
 *   - on a successful action result → router.refresh().
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ArchiveShowButton } from "@/components/admin/ArchiveShowButton";

const CONFIRM_COPY =
  "Confirm archive: crew links stop working now and won't come back until you re-publish and issue a new link.";

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Shared rendered assertion (destructive-confirm plan): the C1 recipe signature.
function expectDestructiveRecipe(el: HTMLElement) {
  const tokens = el.className.split(/\s+/);
  for (const t of ["bg-warning-text", "text-warning-bg", "font-semibold", "hover:opacity-90"]) {
    expect(tokens).toContain(t);
  }
  for (const t of ["bg-accent", "bg-surface", "bg-bg"]) {
    expect(tokens).not.toContain(t);
  }
  expect(
    tokens
      .filter((t) => t.split(":").slice(0, -1).includes("hover"))
      .filter((t) => t.split(":").at(-1)!.startsWith("bg-")),
  ).toEqual([]);
}

// ── ROW VARIANT (owner-ratified 2026-07-20; amends destructive-confirm-pass
// §R7 and m12.2-phase-b2 §2.2). `compact` + `rowLabel` renders the idiom the
// sibling rotate row already uses in the same popover: short trigger, the
// consequence carried as prose, explicit Cancel instead of a 4s timer the
// operator cannot finish reading in.
describe("ArchiveShowButton — row variant (hub popover)", () => {
  const renderRow = (action = vi.fn(async () => ({ ok: true }) as const)) => ({
    action,
    ...render(
      <ArchiveShowButton
        archiveAction={action}
        compact
        rowLabel="Archive show"
        rowDescription="Crew links stop working immediately"
      />,
    ),
  });

  it("resting: titled row + SHORT trigger; the consequence is not crammed into the button", () => {
    const { getByTestId, getByText } = renderRow();
    const trigger = getByTestId("archive-show-button");
    expect(trigger.textContent).toBe("Archive");
    // The long sentence must not be the label — that is the whole point of the
    // amendment (it wrapped to ~4 lines of inverted amber in a 308px popover).
    expect(trigger.textContent).not.toMatch(/stop working/i);
    expect(getByText("Archive show")).toBeTruthy();
    expect(getByText("Crew links stop working immediately")).toBeTruthy();
    // Short label still needs a full accessible name.
    expect(trigger.getAttribute("aria-label")).toBe("Archive show");
  });

  it("armed: consequence renders as PROSE the confirm points at, and the label stays short", async () => {
    const { getByTestId } = renderRow();
    fireEvent.click(getByTestId("archive-show-button"));
    const confirm = getByTestId("archive-show-confirm-button");
    expect(confirm.textContent).toBe("Confirm archive");
    const describedBy = confirm.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const prose = document.getElementById(describedBy!)!;
    expect(prose.textContent).toMatch(
      /Crew links stop working now and won’t come back until you re-publish and issue a new link\./,
    );
    // Prose, not a button: it must not be inside the confirm's own label.
    expect(confirm.contains(prose)).toBe(false);
  });

  it("armed: Cancel returns to resting WITHOUT dispatching (the timer is gone here)", async () => {
    vi.useFakeTimers();
    try {
      const { getByTestId, queryByTestId, action } = renderRow();
      fireEvent.click(getByTestId("archive-show-button"));
      expect(getByTestId("archive-show-confirm-button")).toBeTruthy();

      // The 4s auto-revert must NOT fire in this variant — reading the
      // consequence prose is allowed to take longer than the timer did.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(getByTestId("archive-show-confirm-button")).toBeTruthy();

      fireEvent.click(getByTestId("archive-show-cancel-button"));
      expect(queryByTestId("archive-show-confirm-button")).toBeNull();
      expect(getByTestId("archive-show-button")).toBeTruthy();
      expect(action).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("armed confirm keeps the destructive recipe and the 44px floor", () => {
    const { getByTestId } = renderRow();
    fireEvent.click(getByTestId("archive-show-button"));
    const confirm = getByTestId("archive-show-confirm-button");
    expectDestructiveRecipe(confirm);
    expect(confirm.className).toContain("min-h-tap-min");
    expect(getByTestId("archive-show-cancel-button").className).toContain("min-h-tap-min");
  });

  // C3 / C5 (DESIGN.md:419, spec §15). The morphing-button exemption does not
  // apply here: the armed row has a SEPARATE safe control, so the focus rules
  // the rotate row implements apply to this one too.
  it("C3: arming focuses CANCEL, not the destructive confirm", () => {
    const { getByTestId } = renderRow();
    const trigger = getByTestId("archive-show-button");
    trigger.focus();
    fireEvent.click(trigger);
    // Confirm precedes Cancel in DOM order, so a dropped focus would put the
    // next Tab/Enter on the destructive control — the stray-second-Enter vector.
    expect(document.activeElement).toBe(getByTestId("archive-show-cancel-button"));
    expect(document.activeElement).not.toBe(getByTestId("archive-show-confirm-button"));
    expect(document.activeElement).not.toBe(document.body);
  });

  it("C5: Cancel restores focus to the re-mounted trigger", () => {
    const { getByTestId } = renderRow();
    fireEvent.click(getByTestId("archive-show-button"));
    fireEvent.click(getByTestId("archive-show-cancel-button"));
    expect(document.activeElement).toBe(getByTestId("archive-show-button"));
  });

  it("Cancel is disabled while the confirm is in flight", async () => {
    // Live, it would unmount the form mid-dispatch: the mutation still lands,
    // its outcome banner is lost, and the host's dismissal gate is released by
    // the unmount cleanup — the gate exists precisely to prevent that.
    let settle: ((v: { ok: true }) => void) | null = null;
    const action = vi.fn(
      () =>
        new Promise<{ ok: true }>((res) => {
          settle = res;
        }),
    );
    const { getByTestId } = render(
      <ArchiveShowButton
        archiveAction={action}
        compact
        rowLabel="Archive show"
        rowDescription="Crew links stop working immediately"
      />,
    );
    fireEvent.click(getByTestId("archive-show-button"));
    await act(async () => {
      fireEvent.click(getByTestId("archive-show-confirm-button"));
    });
    const cancel = getByTestId("archive-show-cancel-button") as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    expect(cancel.getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      settle?.({ ok: true });
    });
  });

  it("busy is reported to the host for the row confirm too", async () => {
    const seen: boolean[] = [];
    let settle: ((v: { ok: true }) => void) | null = null;
    const action = vi.fn(
      () =>
        new Promise<{ ok: true }>((res) => {
          settle = res;
        }),
    );
    const { getByTestId } = render(
      <ArchiveShowButton
        archiveAction={action}
        compact
        rowLabel="Archive show"
        onBusyChange={(b) => seen.push(b)}
      />,
    );
    fireEvent.click(getByTestId("archive-show-button"));
    await act(async () => {
      fireEvent.click(getByTestId("archive-show-confirm-button"));
    });
    expect(seen).toContain(true);
    await act(async () => {
      settle?.({ ok: true });
    });
  });

  it("tap 2 dispatches the action", async () => {
    const { getByTestId, action } = renderRow();
    fireEvent.click(getByTestId("archive-show-button"));
    await act(async () => {
      fireEvent.click(getByTestId("archive-show-confirm-button"));
    });
    expect(action).toHaveBeenCalledTimes(1);
  });
});

describe("ArchiveShowButton — two-tap, isPending-safe (Task 7.2)", () => {
  it("resting shows [Archive]; tap 1 morphs to the links-dead confirm copy WITHOUT dispatching", async () => {
    const action = vi.fn(async () => ({ ok: true }) as const);
    const { getByTestId } = render(<ArchiveShowButton archiveAction={action} />);

    expect(getByTestId("archive-show-button").textContent).toContain("Archive");

    await act(async () => {
      fireEvent.click(getByTestId("archive-show-button"));
    });

    const confirm = getByTestId("archive-show-confirm-button");
    // Curly apostrophe per DESIGN typography; normalize for the assertion.
    expect((confirm.textContent ?? "").replace(/’/g, "'")).toContain(
      CONFIRM_COPY.replace(/’/g, "'"),
    );
    expect(action).not.toHaveBeenCalled();
  });

  it("tap 2 (Confirm) dispatches the action exactly once and refreshes on success", async () => {
    const action = vi.fn(async () => ({ ok: true }) as const);
    const { getByTestId } = render(<ArchiveShowButton archiveAction={action} />);

    await act(async () => {
      fireEvent.click(getByTestId("archive-show-button"));
    });
    await act(async () => {
      fireEvent.click(getByTestId("archive-show-confirm-button"));
    });

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("4s idle reverts armed → resting and never dispatches", async () => {
    vi.useFakeTimers();
    const action = vi.fn(async () => ({ ok: true }) as const);
    const { getByTestId, queryByTestId } = render(<ArchiveShowButton archiveAction={action} />);

    fireEvent.click(getByTestId("archive-show-button"));
    expect(getByTestId("archive-show-confirm-button")).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });

    expect(queryByTestId("archive-show-confirm-button")).toBeNull();
    expect(getByTestId("archive-show-button")).not.toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it("the confirm submit button has NO synchronous self-disabling onClick (React 19 dispatch safety)", async () => {
    // Negative-regression for the B1 revoke-hang: if the confirm button
    // setState-disabled itself in its own onClick, the form-action dispatch
    // would be cancelled and `action` would never run. We prove the dispatch
    // fires (covered above) AND that the resting button is type=button while
    // the confirm button is type=submit (the dispatch vector).
    const action = vi.fn(async () => ({ ok: true }) as const);
    const { getByTestId } = render(<ArchiveShowButton archiveAction={action} />);

    expect((getByTestId("archive-show-button") as HTMLButtonElement).type).toBe("button");
    fireEvent.click(getByTestId("archive-show-button"));
    expect((getByTestId("archive-show-confirm-button") as HTMLButtonElement).type).toBe("submit");
  });

  // ---- Destructive-confirm pass (spec 2026-07-16-destructive-confirm-pass R7) ----
  // Morph surfaces are C3/C5-exempt (no focus changes); only the fill changes:
  // soft amber (border-status-warn bg-warning-bg) → the C1 recipe.

  it("full variant: armed confirm carries the destructive recipe, not the soft-amber fill (R7)", () => {
    const action = vi.fn(async () => ({ ok: true }) as const);
    const { getByTestId } = render(<ArchiveShowButton archiveAction={action} />);
    fireEvent.click(getByTestId("archive-show-button"));
    const confirm = getByTestId("archive-show-confirm-button");
    expectDestructiveRecipe(confirm);
    const tokens = confirm.className.split(/\s+/);
    for (const t of ["border-status-warn", "bg-warning-bg", "hover:bg-warning-bg"]) {
      expect(tokens).not.toContain(t);
    }
  });

  it("compact variant: armed confirm carries the destructive recipe, not the soft-amber fill (R7)", () => {
    const action = vi.fn(async () => ({ ok: true }) as const);
    const { getByTestId } = render(<ArchiveShowButton archiveAction={action} compact />);
    fireEvent.click(getByTestId("archive-show-button"));
    const confirm = getByTestId("archive-show-confirm-button");
    expectDestructiveRecipe(confirm);
    const tokens = confirm.className.split(/\s+/);
    for (const t of ["border-status-warn", "bg-warning-bg", "hover:bg-warning-bg"]) {
      expect(tokens).not.toContain(t);
    }
  });

  // M12.5 — the compact footer variant must still honor the 44px tap-target
  // floor (DESIGN.md) on BOTH the resting and armed confirm buttons; the
  // adversarial review flagged the first compact pass for dropping it.
  it("compact variant keeps the 44px tap-target floor on resting + confirm buttons", () => {
    const action = vi.fn(async () => ({ ok: true }) as const);
    const { getByTestId } = render(<ArchiveShowButton archiveAction={action} compact />);
    const resting = getByTestId("archive-show-button");
    expect(resting.className).toContain("min-h-tap-min");
    expect(resting.className).toContain("min-w-tap-min");
    fireEvent.click(resting);
    const confirm = getByTestId("archive-show-confirm-button");
    expect(confirm.className).toContain("min-h-tap-min");
    expect(confirm.className).toContain("min-w-tap-min");
  });
});

describe("ArchiveShowButton — two-tier focus contract on the non-row variants (spec 2026-07-23-sharehub-focus-pass §3.1 items 6-7)", () => {
  // These branches have no live render site (the hub popover uses the row
  // variant), so the popover suite cannot see them. Without these assertions
  // the four non-row class edits could be silently omitted — or the bare
  // `ring-offset-2` white-halo defect could return — with every other gate
  // green.
  const TIER1 = ["focus-visible:ring-2", "focus-visible:ring-focus-ring"] as const;
  const OFFSET_PAIR = ["focus-visible:ring-offset-2", "focus-visible:ring-offset-surface"] as const;
  const ANY_OFFSET = /^focus-visible:ring-offset-/;
  const tokensOf = (el: Element) =>
    new Set(el.getAttribute("class")?.split(/\s+/).filter(Boolean) ?? []);
  const expectTier = (el: Element, tier: 1 | 2) => {
    const t = tokensOf(el);
    for (const c of TIER1) expect([...t], `missing token ${c}`).toContain(c);
    if (tier === 2) {
      for (const c of OFFSET_PAIR) expect([...t], `missing token ${c}`).toContain(c);
    } else {
      expect(
        [...t].filter((x) => ANY_OFFSET.test(x)),
        "tier-1 control must carry no focus offset token",
      ).toEqual([]);
    }
  };

  for (const compact of [false, true]) {
    const label = compact ? "compact" : "full";
    it(`${label} variant: arming trigger is tier 1; armed confirm is tier 2`, () => {
      const action = vi.fn(async () => ({ ok: true }) as const);
      const { getByTestId } = render(
        compact ? (
          <ArchiveShowButton archiveAction={action} compact />
        ) : (
          <ArchiveShowButton archiveAction={action} />
        ),
      );
      const trigger = getByTestId("archive-show-button");
      expectTier(trigger, 1);
      fireEvent.click(trigger);
      expectTier(getByTestId("archive-show-confirm-button"), 2);
    });
  }
});
