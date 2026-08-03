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
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import React from "react";
import {
  ROW_TOKENS,
  WRAPPER_CLASSES,
  NO_BORDER,
  NO_REST_BACKGROUND,
  expectClasses,
  expectRowText,
  expectRowBoundary,
  expectNoDescriptionNode,
  tokensOf,
} from "./showpage/_rowAssertions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }), usePathname: () => "/admin" }));

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

  it("resting: ONE §4.1 menu row - full token set, icon+column topology, bound name (spec §2.1)", () => {
    const { getByTestId, container } = renderRow();
    const trigger = getByTestId("archive-show-button");
    expect(trigger.tagName).toBe("BUTTON");
    expectClasses(trigger, {
      exactly: ROW_TOKENS,
      forbids: [NO_BORDER, NO_REST_BACKGROUND, /(?:^|:)focus-visible:ring-offset-/],
    });
    // One call covers containment, exact text, uniqueness, typography, stacking
    // order, and row topology for BOTH strings (§7.0).
    expectRowText(trigger, container, {
      label: "Archive show",
      description: "Crew links stop working immediately",
    });
    const icon = trigger.querySelector("svg")!;
    expect(icon.getAttribute("width")).toBe("16");
    expect(icon.getAttribute("height")).toBe("16");
    expectClasses(icon, { has: ["shrink-0", "text-text-subtle", "lucide-archive"] });
    // The OLD shape must be GONE, not merely joined by the new one: no button
    // whose accessible name is the bare short label.
    expect(within(container).queryByRole("button", { name: "Archive" })).toBeNull();
    expectRowBoundary(trigger, {
      scope: container,
      descriptionId: trigger.getAttribute("aria-describedby"),
      container,
    });
  });

  it("aria-label is PROP-bound, not hardcoded (R1-3 anti-tautology)", () => {
    const { getByTestId, container } = render(
      <ArchiveShowButton
        archiveAction={vi.fn(async () => ({ ok: true }) as const)}
        compact
        rowLabel="Retire this show"
        rowDescription="Crew links stop working immediately"
      />,
    );
    const trigger = getByTestId("archive-show-button");
    expect(trigger.getAttribute("aria-label")).toBe("Retire this show");
    expect(within(container).getByRole("button", { name: "Retire this show" })).toBe(trigger);
    // A kept-hardcoded aria-label="Archive show" or leftover literal fails here.
    expect(container.textContent).not.toContain("Archive show");
  });

  it("absent description: no carrier node at all (§3 guard)", () => {
    const { getByTestId, container } = render(
      <ArchiveShowButton
        archiveAction={vi.fn(async () => ({ ok: true }) as const)}
        compact
        rowLabel="Archive show"
      />,
    );
    expectNoDescriptionNode(getByTestId("archive-show-button"), container, "Archive show");
  });

  it.each(["", "   "])(
    "blank rowLabel %j: legacy compact render, never an unnamed row (§2.1 gate)",
    (blank) => {
      const { getByTestId, container } = render(
        <ArchiveShowButton
          archiveAction={vi.fn(async () => ({ ok: true }) as const)}
          compact
          rowLabel={blank}
          rowDescription="Crew links stop working immediately"
        />,
      );
      // Legacy compact button: self-named by visible text.
      expect(within(container).getByRole("button", { name: "Archive show" })).toBe(
        getByTestId("archive-show-button"),
      );
      // No §4.1 wrapper anywhere (the row variant did not render).
      const wrapperHits = [...container.querySelectorAll("div")].filter(
        (d) => [...tokensOf(d)].sort().join(" ") === [...WRAPPER_CLASSES].sort().join(" "),
      );
      expect(wrapperHits).toEqual([]);
    },
  );

  it("both states keep the wrapper at exactly WRAPPER_CLASSES; armed group keeps its own py-3 (§1.1 spacing ratification)", () => {
    const { getByTestId } = renderRow();
    const idleWrapper = getByTestId("archive-show-button").parentElement!;
    expectClasses(idleWrapper, { exactly: WRAPPER_CLASSES });
    fireEvent.click(getByTestId("archive-show-button"));
    const armedGroup = getByTestId("archive-show-confirm-row");
    expectClasses(armedGroup, { exactly: ["flex", "flex-col", "gap-2", "py-3"] });
    expectClasses(armedGroup.parentElement!, { exactly: WRAPPER_CLASSES });
  });

  it("pending → idle on refusal: banner mounts as wrapper sibling, busy released, trigger back (§6 item 1a)", async () => {
    const onBusyChange = vi.fn();
    let settle: ((v: { ok: false; code: string }) => void) | null = null;
    const action = vi.fn(() => new Promise<{ ok: false; code: string }>((res) => (settle = res)));
    const { getByTestId, queryByTestId } = render(
      <ArchiveShowButton
        archiveAction={action}
        compact
        onBusyChange={onBusyChange}
        rowLabel="Archive show"
        rowDescription="Crew links stop working immediately"
      />,
    );
    fireEvent.click(getByTestId("archive-show-button"));
    await act(async () => {
      fireEvent.click(getByTestId("archive-show-confirm-button"));
    });
    await act(async () => {
      settle?.({ ok: false, code: "FINALIZE_OWNED_SHOW" });
    });
    expect(queryByTestId("archive-show-confirm-button")).toBeNull();
    expect(getByTestId("archive-show-error")).toBeTruthy();
    expect(getByTestId("archive-show-button")).toBeTruthy();
    // Banner is a WRAPPER sibling (not nested in the row button).
    expect(getByTestId("archive-show-error").parentElement).toBe(
      getByTestId("archive-show-button").parentElement,
    );
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it("rejecting action: reaches the boundary, busy gate never wedges (§6 item 1b)", async () => {
    const onBusyChange = vi.fn();
    class Boundary extends React.Component<{ children: React.ReactNode }, { caught: boolean }> {
      override state = { caught: false };
      static getDerivedStateFromError() {
        return { caught: true };
      }
      override render() {
        return this.state.caught ? (
          <p data-testid="boundary-caught">caught</p>
        ) : (
          this.props.children
        );
      }
    }
    const action = vi.fn(async (): Promise<{ ok: true }> => {
      throw new Error("transport down");
    });
    const { getByTestId, findByTestId } = render(
      <Boundary>
        <ArchiveShowButton
          archiveAction={action}
          compact
          onBusyChange={onBusyChange}
          rowLabel="Archive show"
          rowDescription="Crew links stop working immediately"
        />
      </Boundary>,
    );
    fireEvent.click(getByTestId("archive-show-button"));
    await act(async () => {
      fireEvent.click(getByTestId("archive-show-confirm-button"));
    });
    expect(await findByTestId("boundary-caught")).toBeTruthy();
    // The unmount cleanup must have released a still-pending busy level.
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
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
  // green. SET EQUALITY over the focus-visible ring-family token set: forbid
  // lists cannot stop variant-prefixed offset riders or a competing ring
  // width/color from overriding the ratified treatment.
  const TIER1_RING = ["focus-visible:ring-2", "focus-visible:ring-focus-ring"] as const;
  const OFFSET_PAIR = ["focus-visible:ring-offset-2", "focus-visible:ring-offset-surface"] as const;
  const ringTokens = (el: Element) =>
    (el.getAttribute("class") ?? "")
      .split(/\s+/)
      .filter((t) => t.includes("focus-visible:ring"))
      .sort();
  const expectTier = (el: Element, tier: 1 | 2) => {
    const expected = tier === 2 ? [...TIER1_RING, ...OFFSET_PAIR] : [...TIER1_RING];
    expect(ringTokens(el)).toEqual(expected.sort());
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

// Arm-expiry announcement (spec 2026-08-01-announce-a11y-pass §3.2 row 6,
// §3.3/§5.1): the morph variants announce BOTH the arm (they had no live
// region and no focus move — the one fully silent arm in the family) and the
// auto-revert close. The row variant has no timer: nothing may ever expire.
describe("arm-expiry announcement — ArchiveShowButton", () => {
  const EXPIRY = "Confirm window closed. Nothing was changed.";

  afterEach(() => {
    vi.useRealTimers();
  });

  function region(container: HTMLElement): HTMLElement {
    const el = container.querySelector<HTMLElement>('span[role="status"].sr-only');
    expect(el, "persistent sr-only status region").not.toBeNull();
    return el as HTMLElement;
  }

  it("morph: arm announces, auto-revert announces expiry in the SAME node", async () => {
    vi.useFakeTimers();
    const action = vi.fn(async () => ({ ok: true }) as const);
    const { container, getByTestId } = render(<ArchiveShowButton archiveAction={action} />);
    const before = region(container);
    expect(before.textContent).toBe("");
    fireEvent.click(getByTestId("archive-show-button")); // arm
    expect(before.textContent).toBe("Tap again to confirm.");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    const after = region(container);
    expect(after, "region node must survive the expire transition").toBe(before);
    expect(after.textContent).toBe(EXPIRY);
    expect(action).not.toHaveBeenCalled();
  });

  it("morph: confirm dispatch never announces expiry, even past the timer horizon", async () => {
    vi.useFakeTimers();
    const action = vi.fn(async () => ({ ok: true }) as const);
    const { container, getByTestId } = render(<ArchiveShowButton archiveAction={action} />);
    fireEvent.click(getByTestId("archive-show-button")); // arm
    await act(async () => {
      fireEvent.click(getByTestId("archive-show-confirm-button")); // dispatch
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_100);
    });
    expect(region(container).textContent).not.toBe(EXPIRY);
  });

  it("morph: re-arm after expiry is audible both ways", async () => {
    vi.useFakeTimers();
    const action = vi.fn(async () => ({ ok: true }) as const);
    const { container, getByTestId } = render(<ArchiveShowButton archiveAction={action} />);
    fireEvent.click(getByTestId("archive-show-button"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(region(container).textContent).toBe(EXPIRY);
    fireEvent.click(getByTestId("archive-show-button")); // re-arm
    expect(region(container).textContent).toBe("Tap again to confirm.");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(region(container).textContent).toBe(EXPIRY);
  });

  it("row variant: the expiry copy never appears at any horizon (no timer exists)", async () => {
    vi.useFakeTimers();
    const { container, getByTestId } = render(
      <ArchiveShowButton
        archiveAction={vi.fn(async () => ({ ok: true }) as const)}
        compact
        rowLabel="Archive show"
        rowDescription="Crew links stop working."
      />,
    );
    fireEvent.click(getByTestId("archive-show-button")); // arm (Cancel-dismiss idiom)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(container.textContent).not.toContain(EXPIRY);
    // The confirm row is still up — reading time is not budgeted in this idiom.
    expect(getByTestId("archive-show-confirm-button")).toBeTruthy();
  });
});

/**
 * Self-describing armed confirm (spec §5.1/§5.2, BL-SHAREHUB-CONFIRM-NAMES-SHOW).
 *
 * Owner-ratified copy, pinned BYTE-EXACT in both directions: with a name, and
 * with the three blank shapes that must render exactly today's strings. Curly
 * quotes (U+201C/U+201D) and the existing curly apostrophe per the repo
 * apostrophe/em-dash invariants.
 */
describe("ArchiveShowButton — armed confirm names the show (§5.2)", () => {
  const NAMED_PROSE =
    "Crew links for “Spring Gala” stop working now and won’t come back until you re-publish and issue a new link.";
  const UNNAMED_PROSE =
    "Crew links stop working now and won’t come back until you re-publish and issue a new link.";
  const NAMED_LABEL = "Confirm archiving “Spring Gala”";
  const UNNAMED_LABEL = "Confirm archiving this show";

  const renderNamed = (showName?: string) =>
    render(
      <ArchiveShowButton
        archiveAction={vi.fn(async () => ({ ok: true }) as const)}
        compact
        rowLabel="Archive show"
        rowDescription="Crew links stop working immediately"
        {...(showName === undefined ? {} : { showName })}
      />,
    );

  /** Arms the row and returns the prose node the confirm points at. */
  function armAndRead(view: ReturnType<typeof renderNamed>) {
    fireEvent.click(view.getByTestId("archive-show-button"));
    const confirm = view.getByTestId("archive-show-confirm-button");
    const prose = document.getElementById(confirm.getAttribute("aria-describedby")!)!;
    const group = view.getByTestId("archive-show-confirm-row");
    return { confirm, prose, group };
  }

  it("with a showName: prose and group label name the show, button label unchanged", () => {
    const view = renderNamed("Spring Gala");
    const { confirm, prose, group } = armAndRead(view);
    expect(prose.textContent).toBe(NAMED_PROSE);
    expect(group.getAttribute("aria-label")).toBe(NAMED_LABEL);
    // The consequence lives in the prose the button is describedby-bound to;
    // the label itself stays short.
    expect(confirm.textContent).toBe("Confirm archive");
  });

  it.each([
    ["absent", undefined],
    ["empty", ""],
    ["whitespace", "   "],
  ])("with a %s showName: both strings are byte-identical to today", (_label, showName) => {
    const view = renderNamed(showName);
    const { confirm, prose, group } = armAndRead(view);
    expect(prose.textContent).toBe(UNNAMED_PROSE);
    expect(group.getAttribute("aria-label")).toBe(UNNAMED_LABEL);
    expect(confirm.textContent).toBe("Confirm archive");
  });

  it("a pathological title appears COMPLETE and wraps — never truncated (§10)", () => {
    // show.title is parser-derived with no application-level length cap, so a
    // long one is reachable. Truncating context on a DESTRUCTIVE decision is the
    // failure mode: the operator would be confirming against an elided name.
    const long =
      "Aurora Fall Tour Twenty Twenty Six Northeast Regional Leg With The Extended Production Crew And Guests";
    expect(long.length).toBeGreaterThan(100);
    const view = renderNamed(long);
    const { prose } = armAndRead(view);
    expect(prose.textContent).toContain(long);
    for (const banned of [
      "truncate",
      "line-clamp",
      "overflow-hidden",
      "whitespace-nowrap",
      "text-ellipsis",
    ]) {
      expect(prose.className, `prose must wrap, not ${banned}`).not.toContain(banned);
    }
  });

  it("mode boundary: the MORPH variants ignore showName entirely", () => {
    const MORPH_LABEL =
      "Confirm archive: crew links stop working now and won’t come back until you re-publish and issue a new link.";
    for (const compact of [true, false]) {
      const { getByTestId, unmount } = render(
        <ArchiveShowButton
          archiveAction={vi.fn(async () => ({ ok: true }) as const)}
          showName="Spring Gala"
          {...(compact ? { compact: true } : {})}
        />,
      );
      fireEvent.click(getByTestId("archive-show-button"));
      expect(getByTestId("archive-show-confirm-button").textContent).toBe(MORPH_LABEL);
      unmount();
    }
  });
});

/**
 * post-failure → armed (spec §8 transition inventory row).
 *
 * The live suite proves refusal → resting-with-banner and Cancel-from-ordinary-
 * armed, but not RE-ARM after a refusal with the banner cleared: an operator who
 * retries must not be looking at the previous attempt's error while deciding.
 */
describe("ArchiveShowButton — re-arm after a refusal clears the banner", () => {
  it("refusal → re-arm shows the armed group with NO stale banner, and Cancel returns clean", async () => {
    let settle: ((v: { ok: false; code: string }) => void) | null = null;
    const action = vi.fn(() => new Promise<{ ok: false; code: string }>((res) => (settle = res)));
    const { getByTestId, queryByTestId } = render(
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
    await act(async () => {
      settle?.({ ok: false, code: "FINALIZE_OWNED_SHOW" });
    });
    expect(getByTestId("archive-show-error")).toBeTruthy();

    // Re-arm.
    fireEvent.click(getByTestId("archive-show-button"));
    expect(getByTestId("archive-show-confirm-row")).toBeTruthy();
    expect(
      queryByTestId("archive-show-error"),
      "the previous attempt's refusal is still on screen while re-deciding",
    ).toBeNull();

    fireEvent.click(getByTestId("archive-show-cancel-button"));
    expect(queryByTestId("archive-show-confirm-row")).toBeNull();
    expect(queryByTestId("archive-show-error")).toBeNull();
  });
});
