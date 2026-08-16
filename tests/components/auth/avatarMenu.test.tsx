// @vitest-environment jsdom
/**
 * tests/components/auth/avatarMenu.test.tsx
 *
 * Spec: docs/superpowers/specs/2026-08-09-crew-chrome-wizard-connector.md §2.3
 * Plan: docs/superpowers/plans/2026-08-09-quick-wins-2/plan.md, Task B3
 *
 * The crew header's identity control. What jsdom CAN settle is here — roles,
 * names, state, the keyboard map, the form boundary, and which classes are
 * present. What it cannot is layout: the 44px floor is asserted here as TOKEN
 * PRESENCE and in the real browser as GEOMETRY (tests/e2e/theme-toggle.spec.ts,
 * Task B4). A class assertion alone would pass on a control the cascade had
 * collapsed, so neither half is sufficient by itself and both ship.
 *
 * ANTI-TAUTOLOGY NOTE ON THE ACCESSIBLE NAME. The four partial-identity cases
 * assert EXACT strings rather than calling the exported builder: a test that
 * re-derives the name from the same function proves the function agrees with
 * itself. The builder is exported so production and this file cannot drift; the
 * strings below are the contract.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { AvatarMenu } from "@/components/auth/AvatarMenu";
import { avatarColor } from "@/lib/crew/avatarColor";
import type { ClearIdentityResult } from "@/lib/auth/picker/clearIdentity";
import { messageFor } from "@/lib/messages/lookup";

afterEach(cleanup);

const ROUTE = {
  slug: "east-coast",
  shareToken: "t".repeat(64),
  showId: "11111111-1111-1111-1111-111111111111",
};

/** A function action, so React renders the `javascript:` form boundary. */
const clearAction = async (): Promise<ClearIdentityResult> => ({ ok: true as const });

function renderMenu(name = "Doug L.", role = "Lead") {
  return render(<AvatarMenu name={name} role={role} {...ROUTE} clearAction={clearAction} />);
}

function openMenu(): void {
  act(() => {
    fireEvent.click(screen.getByTestId("avatar-menu-trigger"));
  });
}

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  window.localStorage.clear();
});

describe("the trigger", () => {
  it("is a menu button carrying the person's initials on their deterministic swatch", () => {
    renderMenu("Doug Larson", "Lead");
    const trigger = screen.getByTestId("avatar-menu-trigger");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("avatar-menu-initials").textContent).toBe("DL");
    // The swatch is derived from the NAME, so it is stable per person across
    // renders and sessions. Compared against the shipped deriver rather than a
    // hardcoded hex, which would pin the palette index instead of the rule.
    expect(trigger.style.backgroundColor).not.toBe("");
    expect(trigger).toHaveStyle({ backgroundColor: avatarColor("Doug Larson") });
    // …and a DIFFERENT person gets a different swatch, so the assertion above
    // cannot be satisfied by a constant.
    cleanup();
    renderMenu("Zara Quill", "A1");
    expect(screen.getByTestId("avatar-menu-trigger")).toHaveStyle({
      backgroundColor: avatarColor("Zara Quill"),
    });
  });

  it.each([
    ["Doug L.", "Lead", "Doug L., Lead, account menu"],
    ["Doug L.", "", "Doug L., account menu"],
    ["", "Lead", "Crew member, Lead, account menu"],
    ["", "", "Crew member, account menu"],
  ])("names itself from (%s / %s) as %s", (name, role, expected) => {
    renderMenu(name, role);
    expect(screen.getByTestId("avatar-menu-trigger")).toHaveAttribute("aria-label", expected);
    // No dangling punctuation in ANY partial case — the defect the construction
    // rule exists to make impossible.
    expect(expected).not.toMatch(/,\s*,/);
    expect(expected).not.toMatch(/^,|,\s*$/);
  });

  it("carries the tap-floor tokens", () => {
    renderMenu();
    const cls = screen.getByTestId("avatar-menu-trigger").className;
    expect(cls).toMatch(/\bmin-h-tap-min\b/);
    expect(cls).toMatch(/\bmin-w-tap-min\b/);
  });
});

describe("the popover", () => {
  it("names the menu from the identity header, which is NOT one of its items", () => {
    renderMenu("Doug L.", "Lead");
    openMenu();
    const header = screen.getByTestId("avatar-menu-identity");
    const menu = screen.getByRole("menu");
    // The header is a sibling of the menu, not a child: a non-item child of a
    // `menu` role is invalid ARIA, and a reader walking the items would meet
    // something that is not one.
    expect(menu.contains(header)).toBe(false);
    expect(menu).toHaveAttribute("aria-labelledby", header.id);
    expect(menu).not.toHaveAttribute("aria-label");
    // Both rows are items OF THIS MENU — queried by their real roles rather
    // than a pattern, so a row that lost its role fails here by name.
    expect(within(menu).getAllByRole("menuitemcheckbox")).toHaveLength(1);
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
  });

  it("falls back to aria-label when there is no identity to name it with", () => {
    // An `aria-labelledby` pointing at a node that renders nothing leaves the
    // menu UNNAMED, which is worse than the fallback.
    renderMenu("", "");
    openMenu();
    expect(screen.queryByTestId("avatar-menu-identity")).toBeNull();
    const menu = screen.getByRole("menu");
    expect(menu).toHaveAttribute("aria-label", "Account menu");
    expect(menu).not.toHaveAttribute("aria-labelledby");
  });

  it("flips aria-expanded on the trigger", () => {
    renderMenu();
    expect(screen.getByTestId("avatar-menu-trigger")).toHaveAttribute("aria-expanded", "false");
    openMenu();
    expect(screen.getByTestId("avatar-menu-trigger")).toHaveAttribute("aria-expanded", "true");
  });

  it("gives both rows the tap-floor token", () => {
    renderMenu();
    openMenu();
    for (const id of ["avatar-menu-theme", "avatar-menu-switch-person"]) {
      expect(screen.getByTestId(id).className, id).toMatch(/\bmin-h-tap-min\b/);
    }
  });
});

describe("the theme row", () => {
  it("is a menuitemcheckbox whose checked state tracks the applied theme", () => {
    document.documentElement.dataset.theme = "dark";
    renderMenu();
    openMenu();
    const row = screen.getByTestId("avatar-menu-theme");
    expect(row).toHaveAttribute("role", "menuitemcheckbox");
    // `aria-pressed` does not ride along on a menu item; `aria-checked` is the
    // valid state for a stateful one.
    expect(row).not.toHaveAttribute("aria-pressed");
    expect(row).toHaveAttribute("aria-checked", "true");
  });

  it("flips the theme through the shipped dataset + localStorage handshake, and does NOT close the menu", () => {
    document.documentElement.dataset.theme = "light";
    renderMenu();
    openMenu();
    const row = screen.getByTestId("avatar-menu-theme");
    expect(row).toHaveAttribute("aria-checked", "false");

    act(() => {
      fireEvent.click(row);
    });

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("fxav-theme")).toBe("dark");
    expect(screen.getByTestId("avatar-menu-theme")).toHaveAttribute("aria-checked", "true");
    // Still open — the switch is the kind of thing people flip, look at, and
    // flip back, and a menu that closed under them would make that two more taps.
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});

describe("the person row", () => {
  it("is the server-action FORM, with the route inputs that make the clear land on the right show", () => {
    renderMenu();
    openMenu();
    const row = screen.getByTestId("avatar-menu-switch-person");
    expect(row).toHaveAttribute("role", "menuitem");
    expect(row).toHaveAttribute("type", "submit");
    expect(row).toHaveAttribute("aria-label", "Switch crew member");

    const form = row.closest("form");
    expect(form, "the person row must submit a form, not invoke an action bare").not.toBeNull();
    // A function action renders with React's `javascript:` no-JS safety prefix;
    // a string action would render a plain URL. Reading that difference is what
    // makes this an assertion about the BOUNDARY rather than about markup.
    expect(form?.getAttribute("action") ?? "").toMatch(/^javascript:/);

    const value = (n: string): string | undefined =>
      (form?.querySelector(`input[name="${n}"]`) as HTMLInputElement | null)?.value;
    expect(value("slug")).toBe(ROUTE.slug);
    expect(value("shareToken")).toBe(ROUTE.shareToken);
    expect(value("showId")).toBe(ROUTE.showId);
  });
});

describe("the keyboard contract", () => {
  it("opens on Enter, Space and ArrowDown with focus on the FIRST item", () => {
    for (const key of ["Enter", " ", "ArrowDown"]) {
      cleanup();
      renderMenu();
      act(() => {
        fireEvent.keyDown(screen.getByTestId("avatar-menu-trigger"), { key });
      });
      expect(screen.getByRole("menu"), `key ${key} did not open the menu`).toBeInTheDocument();
      expect(document.activeElement, `key ${key} focused the wrong item`).toBe(
        screen.getByTestId("avatar-menu-theme"),
      );
    }
  });

  it("opens on ArrowUp with focus on the LAST item", () => {
    renderMenu();
    act(() => {
      fireEvent.keyDown(screen.getByTestId("avatar-menu-trigger"), { key: "ArrowUp" });
    });
    expect(document.activeElement).toBe(screen.getByTestId("avatar-menu-switch-person"));
  });

  it("cycles with wrap on ArrowDown/ArrowUp and jumps with Home/End", () => {
    renderMenu();
    openMenu();
    const menu = screen.getByRole("menu");
    const theme = screen.getByTestId("avatar-menu-theme");
    const person = screen.getByTestId("avatar-menu-switch-person");

    act(() => fireEvent.keyDown(menu, { key: "ArrowDown" }));
    expect(document.activeElement).toBe(person);
    // Wraps rather than stopping at the end — the assertion a non-wrapping
    // implementation fails.
    act(() => fireEvent.keyDown(menu, { key: "ArrowDown" }));
    expect(document.activeElement).toBe(theme);
    act(() => fireEvent.keyDown(menu, { key: "ArrowUp" }));
    expect(document.activeElement).toBe(person);
    act(() => fireEvent.keyDown(menu, { key: "Home" }));
    expect(document.activeElement).toBe(theme);
    act(() => fireEvent.keyDown(menu, { key: "End" }));
    expect(document.activeElement).toBe(person);
  });

  it("closes on Escape and returns focus to the trigger", () => {
    renderMenu();
    openMenu();
    act(() => fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId("avatar-menu-trigger"));
  });

  it("does NOT trap focus — Tab closes the menu and lets the browser move on", () => {
    renderMenu();
    openMenu();
    act(() => fireEvent.keyDown(screen.getByRole("menu"), { key: "Tab" }));
    expect(screen.queryByRole("menu")).toBeNull();
    // Focus lands on the TRIGGER, and that is forward movement rather than
    // backward. The old contract here asserted the opposite on the reasoning
    // that "restoring focus would send them backwards" — but the handler does
    // not preventDefault, so the browser still performs the Tab AFTER this,
    // moving from wherever focus now is. The question is only what the tab
    // ORIGIN is, and the item this closed is unmounted: review R2 measured
    // focus falling to `BODY`, which makes the next Tab restart from the top of
    // the document. jsdom does not perform the default Tab, so this asserts the
    // origin; the browser's forward step is exercised in the e2e arm.
    expect(document.activeElement).toBe(screen.getByTestId("avatar-menu-trigger"));
  });
});

describe("the transition inventory (spec §2.3)", () => {
  it("closed → open applies the duration-fast enter treatment, with a reduced-motion alternative", () => {
    renderMenu();
    openMenu();
    const cls = screen.getByTestId("avatar-menu-popover").className;
    // The pair is the contract: an enter treatment gated on `motion-safe`, and
    // an explicit `motion-reduce` alternative. A treatment with no reduced-motion
    // branch, or a reduced-motion branch with nothing to reduce, both fail here.
    expect(cls).toMatch(/motion-safe:animate-\[avatar-menu-in_var\(--duration-fast\)/);
    expect(cls).toMatch(/motion-reduce:animate-none/);
  });

  it("open → closed is an unmount, so the reverse needs no separate treatment", () => {
    // Stated executably rather than left implicit: the popover is conditionally
    // rendered, so "the reverse transition" is the node leaving the tree. If a
    // future refactor keeps it mounted and hides it, this assertion fails and
    // the inventory needs a real exit entry.
    renderMenu();
    openMenu();
    expect(screen.getByTestId("avatar-menu-popover")).toBeInTheDocument();
    act(() => fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" }));
    expect(screen.queryByTestId("avatar-menu-popover")).toBeNull();
  });

  it("COMPOUND: a theme flip mid-open leaves the menu open, and Escape still closes cleanly", () => {
    // The compound row from the inventory. Two states change in sequence, and
    // the second must not be affected by the first — the class of bug that only
    // appears when one transition lands while another is non-default.
    document.documentElement.dataset.theme = "light";
    renderMenu();
    openMenu();
    act(() => fireEvent.click(screen.getByTestId("avatar-menu-theme")));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("menu")).toBeInTheDocument();

    act(() => fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId("avatar-menu-trigger"));
    // …and the theme change SURVIVED the close, rather than being rolled back
    // with the menu state.
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

/**
 * The in-menu failure state (BL-IDENTITY-CLEAR-FAILURE-IS-SILENT).
 *
 * Spec: docs/superpowers/specs/2026-08-15-auth-picker-hardening-design.md §4.
 * The §2.3 probe measured this lifecycle on a Harness; these fold the same
 * assertions onto the shipped component.
 */
describe("the switch-person failure state", () => {
  // R2-F3: crewFacing is `string | null`, so coalesce for strict typecheck; the
  // non-empty assertion below then fails loudly if the catalog copy is emptied.
  const EXPECTED = messageFor("PICKER_SWITCH_FAILED").crewFacing ?? ""; // derive, never hardcode

  /** Clicking the trigger while open calls close() (AvatarMenu.tsx close path). */
  function closeMenu(): void {
    act(() => {
      fireEvent.click(screen.getByTestId("avatar-menu-trigger"));
    });
  }

  function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  }

  const renderWith = (action: (formData: FormData) => Promise<ClearIdentityResult>) =>
    render(<AvatarMenu name="Doug L." role="Lead" {...ROUTE} clearAction={action} />);

  it("EXPECTED copy is a non-empty catalog string (kills the empty-copy tautology)", () => {
    expect(EXPECTED.length).toBeGreaterThan(0); // an emptied catalog copy fails HERE, not silently
  });

  it("passes the route inputs (slug/shareToken/showId) to the clear action", async () => {
    // The mock param is typed so `.mock.calls[0]![0]` indexes the tuple [FormData].
    const action = vi.fn(async (_formData: FormData) => ({ ok: true as const }));
    renderWith(action);
    openMenu();
    // Submit the FORM so React builds FormData from the hidden inputs.
    act(() => {
      fireEvent.submit(screen.getByTestId("avatar-menu-switch-person").closest("form")!);
    });
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const received = action.mock.calls[0]![0];
    expect(received.get("slug")).toBe(ROUTE.slug); // a clearAction(new FormData()) mutant fails here
    expect(received.get("shareToken")).toBe(ROUTE.shareToken);
    expect(received.get("showId")).toBe(ROUTE.showId);
  });

  it("renders an in-menu alert on failure, as a sibling of role=menu, and keeps the menu open", async () => {
    const action = vi.fn(async () => ({
      ok: false as const,
      code: "PICKER_RESOLVER_LOOKUP_FAILED" as const,
    }));
    renderWith(action);
    openMenu();
    act(() => {
      fireEvent.click(screen.getByTestId("avatar-menu-switch-person"));
    });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent?.trim()).toBe(EXPECTED); // EXACT: a rendered suffix fails, unlike substring
    const menuEl = screen.getByRole("menu");
    const popover = screen.getByTestId("avatar-menu-popover");
    // The full §4.3 placement contract. `contains` alone would let a wrapped
    // alert, or an alert followed by another child, survive.
    expect(menuEl.contains(alert)).toBe(false); // not a child of role=menu
    expect(popover.contains(alert)).toBe(true); // inside the popover
    expect(menuEl.nextElementSibling).toBe(alert); // IMMEDIATELY after the menu
    expect(popover.lastElementChild).toBe(alert); // and the popover's LAST child
    expect(popover).toBeInTheDocument(); // stayed open
  });

  it("renders the alert for ANY ok:false code, not just one", async () => {
    // clearIdentity can return PICKER_INVALID_INPUT (malformed FormData or the
    // origin gate), not only PICKER_RESOLVER_LOOKUP_FAILED. A mutant narrowing
    // `if (!result.ok)` to one specific code survives every fixture using that
    // code; a DIFFERENT failure code catches it.
    const action = vi.fn(async () => ({
      ok: false as const,
      code: "PICKER_INVALID_INPUT" as const,
    }));
    renderWith(action);
    openMenu();
    act(() => {
      fireEvent.click(screen.getByTestId("avatar-menu-switch-person"));
    });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent?.trim()).toBe(EXPECTED); // same generic copy regardless of code
  });

  it("renders NO alert when the clear succeeds (awaits the transition before asserting absence)", async () => {
    const action = vi.fn(async () => ({ ok: true as const }));
    renderWith(action);
    openMenu();
    act(() => {
      fireEvent.click(screen.getByTestId("avatar-menu-switch-person"));
    });
    await waitFor(() => expect(action).toHaveBeenCalled()); // let the transition settle
    await act(async () => {
      await Promise.resolve();
    }); // flush the post-resolve microtask/commit
    expect(screen.queryByRole("alert")).toBeNull(); // a late alert would now be present
  });

  it("clears a stale error when the menu is reopened", async () => {
    const action = vi.fn(async () => ({
      ok: false as const,
      code: "PICKER_RESOLVER_LOOKUP_FAILED" as const,
    }));
    renderWith(action);
    openMenu();
    act(() => {
      fireEvent.click(screen.getByTestId("avatar-menu-switch-person"));
    });
    await screen.findByRole("alert");
    closeMenu();
    openMenu();
    expect(screen.queryByRole("alert")).toBeNull(); // reset-on-open, no stale error
  });

  it("close WHILE PENDING then resolve-failure: no throw, no alert; reopen stays clean", async () => {
    const d = deferred<ClearIdentityResult>();
    renderWith(() => d.promise);
    openMenu();
    act(() => {
      fireEvent.click(screen.getByTestId("avatar-menu-switch-person"));
    });
    closeMenu(); // close before the clear resolves
    await act(async () => {
      d.resolve({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
      await d.promise;
    });
    expect(screen.queryByRole("alert")).toBeNull(); // nothing rendered while closed, no throw
    openMenu();
    expect(screen.queryByRole("alert")).toBeNull(); // reopen is idle
  });

  it("reopen WHILE STILL PENDING: submit aria-disabled, no alert; failure then surfaces", async () => {
    const d = deferred<ClearIdentityResult>();
    renderWith(() => d.promise);
    openMenu();
    act(() => {
      fireEvent.click(screen.getByTestId("avatar-menu-switch-person"));
    });
    closeMenu();
    openMenu(); // reopen BEFORE the promise settles
    expect(screen.getByTestId("avatar-menu-switch-person").getAttribute("aria-disabled")).toBe(
      "true",
    ); // pending persists on the mounted parent
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => {
      d.resolve({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
      await d.promise;
    });
    expect(await screen.findByRole("alert")).toBeTruthy(); // failure surfaces in the open menu
    expect(screen.getByTestId("avatar-menu-switch-person").getAttribute("aria-disabled")).toBe(
      "false",
    ); // re-enabled
  });

  it("keyboard reaches the pending switch item by all four commands, and re-activation is a no-op", async () => {
    const action = vi.fn(() => new Promise<ClearIdentityResult>(() => {})); // never resolves
    renderWith(action);
    openMenu();
    act(() => {
      fireEvent.click(screen.getByTestId("avatar-menu-switch-person"));
    }); // one real activation → pending
    const submit = screen.getByTestId("avatar-menu-switch-person");
    const menu = screen.getByTestId("avatar-menu-popover");
    expect(submit.getAttribute("aria-disabled")).toBe("true");
    expect((submit as HTMLButtonElement).disabled).toBe(false); // NOT native disabled: that strands focus
    // `theme.focus()` fires onFocus → setActiveIndex(0), and that state MUST
    // commit before the key handler reads activeIndex, so focus and the keyDown
    // go in SEPARATE act() calls — batched, the handler sees the stale index.
    const fromFirst = (key: string): void => {
      act(() => {
        screen.getByTestId("avatar-menu-theme").focus();
      });
      act(() => {
        fireEvent.keyDown(menu, { key });
      });
    };
    // (a) ArrowDown from the first item lands on the pending switch item…
    fromFirst("ArrowDown");
    expect(document.activeElement).toBe(submit);
    // (b) in-menu ArrowUp from the FIRST item wraps to the last…
    fromFirst("ArrowUp");
    expect(document.activeElement).toBe(submit);
    // (c) End also lands on it…
    fromFirst("End");
    expect(document.activeElement).toBe(submit);
    // (d) reopen-with-ArrowUp opens the menu at the last item…
    closeMenu();
    act(() => {
      fireEvent.keyDown(screen.getByTestId("avatar-menu-trigger"), { key: "ArrowUp" });
    });
    expect(document.activeElement).toBe(screen.getByTestId("avatar-menu-switch-person"));
    // Re-activation while pending is a no-op.
    const calls = action.mock.calls.length;
    act(() => {
      fireEvent.click(screen.getByTestId("avatar-menu-switch-person"));
    });
    expect(action.mock.calls.length).toBe(calls); // onSwitchSubmit early-returns while pending
  });
});
