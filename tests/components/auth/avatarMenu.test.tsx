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
import { Component, type ReactNode } from "react";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

/** A promise whose settlement the test controls. */
function deferredPending<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
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

describe("no persist-failure note (removed 2026-08-26)", () => {
  // Product ruling 2026-08-26, ratified in spec 2026-08-15-theme-persistence-note
  // §2.2 "Amendment, 2026-08-26": persisting the theme choice is a convenience,
  // not a failure mode the user acknowledges. Both of this menu's note nodes are
  // gone — the aria-hidden visible paragraph AND the root-level sr-only
  // announcer whose only content was that same sentence.
  //
  // REWRITTEN after diff review r2 finding 1. The first version asserted the
  // absence of two `data-testid` values, which is the SAME defect round 1 caught
  // in the hook suite wearing different clothes: it pinned the identifier the
  // deletion happened to remove rather than the PROPERTY the ruling requires.
  // Two ordinary regressions walked straight through it — restore the visible
  // copy under a different testid, or add a second announcer without the old
  // one — and every assertion still passed.
  //
  // So the assertions below are structural and copy-independent. The menu keeps
  // one legitimate `role="status"` (the switch-person announcer), so the pin is
  // that the status regions are EXACTLY that one, and that the popover's own
  // children are exactly the identity block and the menu. A reworded note under
  // a fresh testid fails both.
  const EXPECTED_STATUS_TESTIDS = ["avatar-menu-switch-announcer"];
  const EXPECTED_POPOVER_CHILD_TESTIDS = ["avatar-menu-identity", "avatar-menu-items"];

  function blockWrites(): void {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
  }

  function flipTheme(): void {
    act(() => {
      fireEvent.click(screen.getByTestId("avatar-menu-theme"));
    });
  }

  /** Every live region in the tree, by testid, so an EXTRA one cannot hide. */
  function statusRegionIds(): (string | null)[] {
    return screen
      .queryAllByRole("status", { hidden: true })
      .map((el) => el.getAttribute("data-testid"));
  }

  /** The popover's own element children, so a restored note cannot hide either. */
  function popoverChildIds(): (string | null)[] {
    const popover = screen.getByTestId("avatar-menu-popover");
    return [...popover.children].map((el) => el.getAttribute("data-testid"));
  }

  /**
   * Every character the popover renders.
   *
   * The structural pins above (live-region set, direct-child set) are necessary
   * and NOT sufficient: diff review r3 finding 1 planted visible note copy
   * INSIDE the existing `avatar-menu-items` element, and both arrays stayed
   * identical while the forbidden sentence rendered. That was the third
   * appearance of one shape — an assertion covering a specific LOCATION rather
   * than the PROPERTY "no note copy renders anywhere" — so this one is the
   * property. Any added copy, at any depth, under any testid, changes this
   * string.
   *
   * A legitimate label change fails here too, and that is correct: a census is
   * supposed to make anyone editing this menu's copy look at this test.
   */
  function popoverText(): string {
    return screen.getByTestId("avatar-menu-popover").textContent ?? "";
  }

  /**
   * Every character the WHOLE COMPONENT renders, not just the popover.
   *
   * Diff review r4 finding 1: the popover census was still scoped to a
   * location. A note added as a root SIBLING of the popover left all three
   * previous assertions byte-identical while rendering the forbidden sentence.
   * That is the fourth consecutive round in which my repair was one level
   * narrower than the property, so this one is scoped to the render root —
   * there is no enclosing element left for a note to hide outside of.
   */
  function rootText(container: HTMLElement): string {
    return container.textContent ?? "";
  }

  /** Captured from the live render, fixture name "Doug L." and role "Lead". */
  const EXPECTED_POPOVER_TEXT = "Doug L.,  · LeadDark modeNot you? Switch person";
  /** "DL" is the trigger's initials, which render whether the menu is open or not. */
  const EXPECTED_ROOT_TEXT_CLOSED = "DL";
  const EXPECTED_ROOT_TEXT_OPEN = "DL" + EXPECTED_POPOVER_TEXT;

  it("renders no extra live region and no extra popover child on a blocked write", () => {
    document.documentElement.dataset.theme = "light";
    blockWrites();
    const { container } = renderMenu();
    openMenu();

    flipTheme();

    // PREMISE: the flip did real work through the throwing write. Without it,
    // every absence assertion below would also pass on a menu that never rendered.
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("menu")).toBeInTheDocument();

    // The property, not the identifier: a restored announcer fails this whatever
    // testid it carries, or none.
    expect(statusRegionIds()).toEqual(EXPECTED_STATUS_TESTIDS);
    // Same for the visible note, which used to sit between the identity block
    // and the menu as a popover child of its own.
    expect(popoverChildIds()).toEqual(EXPECTED_POPOVER_CHILD_TESTIDS);
    // And the property the two structural pins do not cover: no copy anywhere.
    expect(popoverText()).toBe(EXPECTED_POPOVER_TEXT);
    // And outside the popover, which is where r4 found the escape.
    expect(rootText(container)).toBe(EXPECTED_ROOT_TEXT_OPEN);
  });

  it("mounts no extra live region before the menu is even opened", () => {
    blockWrites();
    const { container } = renderMenu();

    // The old shape mounted the theme announcer at the component ROOT, outside
    // the popover, so it existed before any interaction. An empty region left
    // behind would be dead a11y surface rather than a harmless leftover.
    expect(statusRegionIds()).toEqual(EXPECTED_STATUS_TESTIDS);

    // Closed, the whole component renders only the trigger's initials. A note
    // mounted at the root would show up here even before any interaction.
    expect(rootText(container)).toBe(EXPECTED_ROOT_TEXT_CLOSED);

    openMenu();
    expect(statusRegionIds()).toEqual(EXPECTED_STATUS_TESTIDS);
    expect(popoverChildIds()).toEqual(EXPECTED_POPOVER_CHILD_TESTIDS);
    expect(popoverText()).toBe(EXPECTED_POPOVER_TEXT);
    expect(rootText(container)).toBe(EXPECTED_ROOT_TEXT_OPEN);
  });

  it("keeps the UNRELATED switch-person announcer working, not merely present", () => {
    blockWrites();
    renderMenu();

    // Naming the survivor is what stops the removal from being satisfied by
    // deleting the wrong `role="status"`. Asserting its ROLE and its live text
    // is what stops it from being satisfied by leaving an inert shell.
    const survivor = screen.getByTestId("avatar-menu-switch-announcer");
    expect(survivor).toHaveAttribute("role", "status");
    expect(survivor.textContent).toBe("");
    expect(statusRegionIds()).toEqual(EXPECTED_STATUS_TESTIDS);
  });

  it("stays silent across repeated blocked writes and on recovery", () => {
    document.documentElement.dataset.theme = "light";
    blockWrites();
    const { container } = renderMenu();
    openMenu();

    flipTheme();
    expect(document.documentElement.dataset.theme).toBe("dark");
    flipTheme();
    expect(document.documentElement.dataset.theme).toBe("light");

    expect(statusRegionIds()).toEqual(EXPECTED_STATUS_TESTIDS);
    expect(popoverChildIds()).toEqual(EXPECTED_POPOVER_CHILD_TESTIDS);
    expect(popoverText()).toBe(EXPECTED_POPOVER_TEXT);
    expect(rootText(container)).toBe(EXPECTED_ROOT_TEXT_OPEN);
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

  it("announces the pending switch: aria-busy on the item, a polite status region OUTSIDE the menu (impeccable P1)", async () => {
    // The clear now signs the device out, so the pending window holds a network
    // round trip; dimming alone announced nothing (WCAG 2.1 4.1.3).
    const d = deferred<ClearIdentityResult>();
    renderWith(() => d.promise);
    // Always mounted, text empty before any tap: the BL-ANNOUNCE-REGION-UNMOUNT-CLASS shape.
    const region = screen.getByTestId("avatar-menu-switch-announcer");
    expect(region.getAttribute("role")).toBe("status");
    expect(region.textContent).toBe("");
    openMenu();
    const item = screen.getByTestId("avatar-menu-switch-person");
    expect(item.getAttribute("aria-busy")).toBeNull();
    act(() => {
      fireEvent.click(item);
    });
    expect(item.getAttribute("aria-busy")).toBe("true");
    expect(region.textContent).toBe("Switching person");
    // Outside role=menu: a status is not a menu item, and AT may ignore
    // descendant changes under an aria-busy ancestor.
    expect(screen.getByRole("menu").contains(region)).toBe(false);
    await act(async () => {
      d.resolve({ ok: true });
      await d.promise;
    });
    expect(item.getAttribute("aria-busy")).toBeNull();
    expect(region.textContent).toBe("");
  });

  it("keyboard reaches the pending switch item by all four commands, and re-activation is a no-op", async () => {
    // Held open by a deferred, and RESOLVED at the end of this test. A promise
    // that never settles leaves an async transition permanently in flight, and
    // React tracks that beyond the unmounted component: every later test in
    // this file then saw its own transition never retire, so the pending
    // guard swallowed their submits and they failed for a reason that had
    // nothing to do with them. Measured while adding the retry cases below.
    // (The guard now reads the component's own phase in `beginSwitch`; the
    // leak this records predates that and is why every case retires its own.)
    const held = deferredPending<ClearIdentityResult>();
    const action = vi.fn(() => held.promise); // pending until this test ends
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
    expect(action.mock.calls.length).toBe(calls); // beginSwitch preventDefaults while busy
    // Settle the held transition so it cannot leak into later tests.
    await act(async () => {
      held.resolve({ ok: true });
      await held.promise;
    });
  });
});

/**
 * Retry out of Open-error — spec §4.6's Open-error↔Open-pending and
 * Open-error→Open-idle pairs, which round 1 of the diff review found
 * unexercised. Two mutants survived without these: removing the
 * `setSwitchStatus("idle")` at the head of `beginSwitch` (a retry that
 * SUCCEEDS leaves the stale alert on screen), and a stale-closure read of the
 * status (a retry that FAILS AGAIN leaves the menu idle with no alert at all,
 * so the second failure reads as success).
 *
 * Each attempt is driven by its own deferred and resolved inside `act`, the
 * same shape the close/reopen lifecycle cases use. An immediately-resolved mock
 * is NOT interchangeable here: the phase is still `pending` when the alert
 * first paints, and `beginSwitch` preventDefaults while it is, so the retry
 * would be silently swallowed and the test would pass for the wrong reason.
 */
describe("retrying out of the failure state", () => {
  const EXPECTED = messageFor("PICKER_SWITCH_FAILED").crewFacing ?? "";

  function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  }

  const submit = (): void => {
    act(() => {
      fireEvent.click(screen.getByTestId("avatar-menu-switch-person"));
    });
  };

  /**
   * Retires the in-flight transition before the next submit.
   *
   * Resolving the action's promise inside `act` commits the state update, but
   * the phase has NOT returned to idle by that alone in jsdom — measured here:
   * right after the resolve the alert is on screen while the submit still
   * reads `aria-disabled="true"`. Since `beginSwitch`
   * early-returns while pending, retrying on the alert's paint would silently
   * drop the retry and the test would pass for the wrong reason. Extra
   * microtask turns inside `act` retire it; the assertion below is what proves
   * the wait actually worked rather than assuming it.
   */
  const settled = async (): Promise<void> => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByTestId("avatar-menu-switch-person").getAttribute("aria-disabled")).toBe(
        "false",
      ),
    );
  };

  /** Renders with a queue of deferreds, one per attempt, in call order. */
  const renderWithQueue = (queue: Array<Promise<ClearIdentityResult>>) => {
    let call = 0;
    const action = vi.fn(() => queue[call++]!);
    render(<AvatarMenu name="Doug L." role="Lead" {...ROUTE} clearAction={action} />);
    return action;
  };

  it("clears the alert when the retry SUCCEEDS (kills the missing-reset mutant)", async () => {
    // The menu never closes between the two attempts, so reset-on-open cannot
    // be what clears the alert, only the reset inside beginSwitch can.
    const first = deferred<ClearIdentityResult>();
    const second = deferred<ClearIdentityResult>();
    const action = renderWithQueue([first.promise, second.promise]);
    openMenu();
    submit();
    await act(async () => {
      first.resolve({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
      await first.promise;
    });
    expect(await screen.findByRole("alert")).toBeTruthy(); // Open-error
    // Let the first attempt fully retire before retrying: beginSwitch
    // preventDefaults while the phase is pending, and the alert paints before
    // the phase returns to idle, so submitting on the paint alone silently
    // drops the retry.
    await settled();
    submit(); // Open-error → Open-pending, menu still open
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    await act(async () => {
      second.resolve({ ok: true });
      await second.promise;
    });
    expect(screen.queryByRole("alert")).toBeNull(); // Open-idle: no stale alert survives
  });

  it("keeps the alert when the retry FAILS AGAIN (kills the stale-status mutant)", async () => {
    const first = deferred<ClearIdentityResult>();
    const second = deferred<ClearIdentityResult>();
    const action = renderWithQueue([first.promise, second.promise]);
    openMenu();
    submit();
    await act(async () => {
      first.resolve({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
      await first.promise;
    });
    await screen.findByRole("alert");
    await settled();
    submit();
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    await act(async () => {
      second.resolve({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
      await second.promise;
    });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent?.trim()).toBe(EXPECTED); // a second failure still says so
    expect(screen.getByTestId("avatar-menu-popover")).toBeInTheDocument();
  });
});

describe("the switch-person watchdog (BL-AVATAR-MENU-SWITCH-PENDING-WATCHDOG)", () => {
  const NOTICE = "Still switching. Try again.";
  /**
   * The window these cases step over, as a LITERAL. Deliberately not the
   * imported constant: a case that reads the constant cannot tell it from a
   * component-local copy of the same number, so it would pass by coincidence
   * while claiming to pin linkage (round 2 F4), and importing a module the
   * GREEN step creates is what made the declared RED unreproducible in TDD
   * order (round 2 F3). One definition is pinned by the DERIVED inventory guard
   * instead, which can actually tell the difference.
   */
  const PENDING_WINDOW_MS = 8_000;

  /**
   * Every deferred this describe hands out, retired after the case whatever the
   * case did. A FAILING assertion returns before its own resolve, and the
   * transition it leaves in flight is tracked past unmount, so the next case's
   * submit is swallowed by the pending guard and it fails for a reason that is
   * not its own. That is measured, not feared: it is the same leak the file
   * already records against the pending guard at
   * tests/components/auth/avatarMenu.test.tsx:675-681, and the first draft of
   * this describe reproduced it (one red case turned the unchanged-behaviour
   * case red too, which would have made a harness artifact look like the
   * implementation's absence).
   */
  const outstanding: ((value: ClearIdentityResult) => void)[] = [];

  function held() {
    const d = deferredPending<ClearIdentityResult>();
    outstanding.push(d.resolve);
    return d;
  }

  /** A deferred this describe can REJECT, for the rejection cases. */
  function rejectable() {
    let reject!: (reason: unknown) => void;
    let resolve!: (value: ClearIdentityResult) => void;
    const promise = new Promise<ClearIdentityResult>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    outstanding.push(resolve);
    return { promise, reject };
  }

  afterEach(async () => {
    const pending = outstanding.splice(0);
    // Resolve BEFORE the file-level cleanup unmounts, which is why this hook
    // sits in the inner describe: an inner afterEach runs first.
    await act(async () => {
      for (const resolve of pending) resolve({ ok: true });
      await Promise.resolve();
    });
    vi.useRealTimers();
  });

  /** The menu, open, plus the two nodes every case reads. */
  function mount(action: (formData: FormData) => Promise<ClearIdentityResult>) {
    render(<AvatarMenu name="Doug L." role="Lead" {...ROUTE} clearAction={action} />);
    openMenu();
    return {
      item: screen.getByTestId("avatar-menu-switch-person"),
      region: screen.getByTestId("avatar-menu-switch-announcer"),
    };
  }

  /** Two attempts, in order, for every case that drives a retry. */
  function twoAttempts() {
    const first = held();
    const second = held();
    const action = vi
      .fn<(formData: FormData) => Promise<ClearIdentityResult>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    return { first, second, action };
  }

  it("re-enables the row at the timeout and says so, pinned from both sides (AC-1)", () => {
    vi.useFakeTimers();
    const first = held();
    const action = vi.fn(() => first.promise);
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    // Premise: the case only discriminates if the tap actually started a clear.
    // An action never called would end idle too, and every assertion below
    // would hold for the wrong reason.
    expect(action, "the tap reached clearAction").toHaveBeenCalledTimes(1);
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(region.textContent).toBe("Switching person");

    act(() => {
      vi.advanceTimersByTime(7_900);
    });
    // A 1s-to-7s timeout mutant also ends enabled, so the window is pinned from
    // BOTH sides, the sibling's idiom at tests/show/pickerAffordance.test.tsx:153.
    expect(item.getAttribute("aria-disabled"), "still busy just before 8s").toBe("true");
    expect(item.getAttribute("aria-busy"), "still busy just before 8s").toBe("true");
    expect(region.textContent, "still announcing just before 8s").toBe("Switching person");

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(item.getAttribute("aria-disabled"), "re-enabled just after 8s").toBe("false");
    expect(item.getAttribute("aria-busy"), "not busy just after 8s").toBeNull();
    expect(region.textContent).toBe(NOTICE);
  });

  it("admits a retry after the timeout, on a fresh window (AC-2)", () => {
    vi.useFakeTimers();
    const { action } = twoAttempts();
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    // Premise, stated so that no other state satisfies it: busy first, then the
    // TIMEOUT NOTICE. Asserting only "enabled" would be equally true of
    // ordinary idle, which is the round-1 F3 defect swept across every case.
    expect(item.getAttribute("aria-disabled"), "busy before the window elapses").toBe("true");
    act(() => {
      vi.advanceTimersByTime(8_100);
    });
    expect(region.textContent, "timed out, not merely idle").toBe(NOTICE);

    act(() => {
      fireEvent.click(item);
    });
    expect(action, "the second tap reached clearAction").toHaveBeenCalledTimes(2);
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(region.textContent).toBe("Switching person");

    // A FRESH window, not the remainder of the old one: 7,900ms past the retry
    // is 16,000ms past the first tap.
    act(() => {
      vi.advanceTimersByTime(7_900);
    });
    expect(item.getAttribute("aria-disabled"), "the retry has its own 8s").toBe("true");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(item.getAttribute("aria-disabled"), "and it expires on schedule").toBe("false");
  });

  it("a clear that settles inside the window is untouched by the watchdog (AC-3)", async () => {
    vi.useFakeTimers();
    const first = held();
    const action = vi.fn(() => first.promise);
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // Premise: the clear ran and is still inside the window at the moment it
    // settles, so this case is the ordinary path and not a disguised timeout.
    expect(action, "the tap reached clearAction").toHaveBeenCalledTimes(1);
    expect(item.getAttribute("aria-busy"), "settling inside the window").toBe("true");
    await act(async () => {
      first.resolve({ ok: true });
      await first.promise;
    });
    expect(item.getAttribute("aria-disabled")).toBe("false");
    expect(item.getAttribute("aria-busy")).toBeNull();
    expect(region.textContent).toBe("");
    expect(document.body.textContent).not.toContain(NOTICE);

    // …and the notice does not arrive late, once the old timer's moment passes.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(region.textContent).toBe("");
  });

  it("COMPOUND C1: the stale settle empties the region and does not re-disable the row (AC-4)", async () => {
    vi.useFakeTimers();
    const first = held();
    const action = vi.fn(() => first.promise);
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(region.textContent, "timed out, waiting on the stale settle").toBe(NOTICE);

    await act(async () => {
      first.resolve({ ok: true });
      await first.promise;
    });
    expect(region.textContent).toBe("");
    expect(item.getAttribute("aria-disabled")).toBe("false");
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("COMPOUND C3: a superseded failure paints no alert, but the live one still does (AC-5)", async () => {
    vi.useFakeTimers();
    const { first, second, action } = twoAttempts();
    const { item } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    act(() => {
      vi.advanceTimersByTime(8_100);
    });
    act(() => {
      fireEvent.click(item);
    });
    // Premise: there really are two attempts in flight, so "no alert" below is
    // the ordinal dropping a superseded result and not an absent one.
    expect(action, "two attempts in flight").toHaveBeenCalledTimes(2);

    await act(async () => {
      first.resolve({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
      await first.promise;
    });
    expect(screen.queryByRole("alert"), "the superseded failure is dropped").toBeNull();
    expect(item.getAttribute("aria-disabled"), "the live retry keeps the row busy").toBe("true");

    // The component has NOT stopped reporting failures: the LIVE attempt's
    // failure still paints. Without this half, a mutant that never sets the
    // error state at all would pass the assertion above.
    await act(async () => {
      second.resolve({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
      await second.promise;
    });
    // getBy, not findBy: findBy polls on REAL timers and this case holds fake
    // ones, so it would sit until vitest's 30s deadline. Measured.
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("COMPOUND C4: the window expires while the menu is CLOSED (AC-6)", () => {
    // Round 3 F3. The earlier version timed out BEFORE closing, which proves
    // only that a timed-out phase survives a close: it cannot tell a live
    // watchdog from one the close cancelled or that was conditioned on `open`.
    // Here the menu is closed while PENDING and the clock crosses the window
    // with it still closed. The announcer sits outside the popover, so the flip
    // is observable without reopening, and that is the independence claim.
    vi.useFakeTimers();
    const first = held();
    const action = vi.fn(() => first.promise);
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    expect(action, "the tap reached clearAction").toHaveBeenCalledTimes(1);
    expect(region.textContent, "pending, not yet timed out, before the close").toBe(
      "Switching person",
    );

    act(() => {
      fireEvent.click(screen.getByTestId("avatar-menu-trigger")); // close, still pending
    });
    expect(screen.queryByTestId("avatar-menu-popover"), "the menu really is closed").toBeNull();
    expect(
      screen.getByTestId("avatar-menu-switch-announcer").textContent,
      "still pending while closed",
    ).toBe("Switching person");

    act(() => {
      vi.advanceTimersByTime(8_100);
    });
    // The whole case: the watchdog ran while the menu was closed, and the
    // always-mounted announcer says so without anyone reopening it.
    expect(
      screen.getByTestId("avatar-menu-switch-announcer").textContent,
      "the watchdog fired while closed",
    ).toBe(NOTICE);

    openMenu();
    expect(screen.getByTestId("avatar-menu-switch-person").getAttribute("aria-disabled")).toBe(
      "false",
    );
    expect(screen.getByTestId("avatar-menu-switch-announcer").textContent).toBe(NOTICE);
  });

  it("COMPOUND C6: the RETRY settles ok while the first is still hung (AC-9)", async () => {
    // Round 1 F1. React entangles pending across transitions from one hook, so
    // a busy flag derived from it stays true here and the row would sit
    // disabled until a SECOND watchdog fired. The phase is this component's
    // own, so it does not.
    vi.useFakeTimers();
    const { first, second, action } = twoAttempts();
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    act(() => {
      vi.advanceTimersByTime(8_100);
    });
    act(() => {
      fireEvent.click(item);
    });
    expect(action, "two attempts in flight, the older one hung").toHaveBeenCalledTimes(2);
    expect(item.getAttribute("aria-disabled"), "busy on the retry").toBe("true");

    await act(async () => {
      second.resolve({ ok: true });
      await second.promise;
    });
    expect(item.getAttribute("aria-disabled"), "the retry settling ends the busy state").toBe(
      "false",
    );
    expect(region.textContent).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();

    // The older attempt is still hung. Its window would have expired long ago;
    // nothing may come back on screen.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(item.getAttribute("aria-disabled")).toBe("false");
    expect(region.textContent).toBe("");

    await act(async () => {
      first.resolve({ ok: true });
      await first.promise;
    });
    expect(item.getAttribute("aria-disabled")).toBe("false");
    expect(region.textContent).toBe("");
  });

  it("COMPOUND C6: the RETRY fails while the first is still hung (AC-9)", async () => {
    vi.useFakeTimers();
    const { first, second, action } = twoAttempts();
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    act(() => {
      vi.advanceTimersByTime(8_100);
    });
    act(() => {
      fireEvent.click(item);
    });
    expect(action, "two attempts in flight, the older one hung").toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
      await second.promise;
    });
    expect(screen.getByRole("alert")).toBeTruthy(); // getBy: fake timers, see AC-5
    expect(screen.queryAllByRole("alert")).toHaveLength(1);
    expect(item.getAttribute("aria-disabled"), "a reported failure is not a busy row").toBe(
      "false",
    );
    expect(region.textContent).toBe("");

    // Past the moment the retry's own window would have closed. A phase that
    // never returned to idle would paint the timeout notice over the alert.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(region.textContent, "no late timeout notice on top of the alert").toBe("");
    expect(screen.queryAllByRole("alert")).toHaveLength(1);

    await act(async () => {
      first.resolve({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
      await first.promise;
    });
    expect(screen.queryAllByRole("alert"), "the stale failure adds nothing").toHaveLength(1);
  });

  it("COMPOUND C8: a settle and a due watchdog in one flush leave the alert standing alone (AC-12)", async () => {
    // Round 2 F1. The callback is already QUEUED when the settle schedules its
    // update, and clearTimeout cannot unfire it. Probed without the callback's
    // the guard: phase=timedout status=error, the combination §4.6 forbids.
    vi.useFakeTimers();
    const first = held();
    const action = vi.fn(() => first.promise);
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    expect(action, "the tap reached clearAction").toHaveBeenCalledTimes(1);
    expect(item.getAttribute("aria-disabled"), "busy before the boundary").toBe("true");

    // Resolve OUTSIDE act so the transition update is scheduled but not yet
    // committed, then let the due timer fire before that commit. This exact
    // interleaving is what reproduces the fault; resolving inside act does not.
    first.resolve({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
    await Promise.resolve();
    await Promise.resolve();
    await act(async () => {
      vi.advanceTimersByTime(PENDING_WINDOW_MS);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(region.textContent, "no timeout notice over a settled clear").toBe("");
    expect(item.getAttribute("aria-disabled"), "settled, not timed out").toBe("false");
    expect(screen.getByRole("alert")).toBeTruthy(); // getBy: fake timers, see AC-5
  });

  it("COMPOUND C5: a theme flip while TIMED OUT leaves the row and the notice alone (AC-16)", () => {
    // Round 2 F5: C5 was declared with no case that ever enters timed-out. The
    // existing compound at tests/components/auth/avatarMenu.test.tsx:305 runs
    // from open-idle.
    vi.useFakeTimers();
    document.documentElement.dataset.theme = "light";
    const first = held();
    const action = vi.fn(() => first.promise);
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    act(() => {
      vi.advanceTimersByTime(PENDING_WINDOW_MS + 100);
    });
    // Premise on this case's own inputs: genuinely timed out before the flip.
    expect(action, "the tap reached clearAction").toHaveBeenCalledTimes(1);
    expect(region.textContent, "timed out before the theme flip").toBe(NOTICE);

    act(() => {
      fireEvent.click(screen.getByTestId("avatar-menu-theme"));
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("menu"), "the menu stays open").toBeInTheDocument();
    expect(screen.getByTestId("avatar-menu-switch-person").getAttribute("aria-disabled")).toBe(
      "false",
    );
    expect(screen.getByTestId("avatar-menu-switch-announcer").textContent).toBe(NOTICE);
  });
  /**
   * The rejection cases render the menu inside an error boundary, because
   * "did the component rethrow" is only answerable by asking what the boundary
   * caught. Round 3 F2: calling `unstable_rethrow` directly in the test asserts
   * Next's classifier rather than this component, and letting a control-flow
   * rejection escape a bare `act` fails the case instead of proving anything.
   */
  class CatchBoundary extends Component<{ children: ReactNode }, { caught: boolean }> {
    // `override` on both: this repo's tsconfig sets noImplicitOverride, and
    // without it typecheck fails TS4114 while vitest passes, which is the
    // strip-types trap the writing-plans rule exists for.
    override state = { caught: false };
    static getDerivedStateFromError() {
      return { caught: true };
    }
    override render() {
      return this.state.caught ? <div data-testid="switch-boundary" /> : this.props.children;
    }
  }

  /** Reject one clear with `thrown`, and report what the boundary saw. */
  async function rejectWith(thrown: unknown) {
    const attempt = rejectable();
    const action = vi.fn(() => attempt.promise);
    render(
      <CatchBoundary>
        <AvatarMenu name="Doug L." role="Lead" {...ROUTE} clearAction={action} />
      </CatchBoundary>,
    );
    openMenu();
    act(() => {
      fireEvent.click(screen.getByTestId("avatar-menu-switch-person"));
    });
    expect(action, "the tap reached clearAction").toHaveBeenCalledTimes(1);
    // React logs a caught boundary error; silence it so a PASSING case is quiet.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await act(async () => {
        attempt.reject(thrown);
        await attempt.promise.catch(() => {});
      });
    } catch {
      // A rethrown control-flow error surfaces here. That it surfaced is not
      // the assertion; what the boundary caught is.
    }
    logged.mockRestore();
    return { caught: screen.queryByTestId("switch-boundary") !== null };
  }

  it("COMPOUND C7: a transport rejection with no digest reports inline (AC-10)", async () => {
    const { caught } = await rejectWith(new Error("network"));
    expect(caught, "not framework control flow, so nothing reaches the boundary").toBe(false);
    expect(screen.queryByTestId("avatar-menu"), "the component is still mounted").not.toBeNull();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("avatar-menu-switch-person").getAttribute("aria-disabled")).toBe(
      "false",
    );
    expect(screen.getByTestId("avatar-menu-switch-announcer").textContent).toBe("");
  });

  it("COMPOUND C10: an OPAQUE server digest reports inline, it does not reach the boundary (AC-14)", async () => {
    // "3693416880" is the shape the installed Next produced for an ORDINARY
    // server failure. The digest test round 2 refuted would send this one to
    // the boundary, which is the fault the catch exists to prevent.
    const { caught } = await rejectWith(
      Object.assign(new Error("server"), { digest: "3693416880" }),
    );
    expect(caught, "an opaque digest is not control flow").toBe(false);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("avatar-menu-switch-person").getAttribute("aria-disabled")).toBe(
      "false",
    );
  });

  it("COMPOUND C9: a timer left over from a settled attempt does not end the next one's window (AC-13)", async () => {
    // What the effect cleanup is FOR, and the case exists because deleting the
    // cleanup reds nothing else in this file. Attempt 1 settles well inside its
    // window, so its timer is still armed; the retry then starts before that
    // timer is due, and the stale callback would find the phase at "pending",
    // which is the NEW attempt's, and end a window that is not its own.
    vi.useFakeTimers();
    const { first, second, action } = twoAttempts();
    const { item } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    await act(async () => {
      first.resolve({ ok: true });
      await first.promise;
    });
    // Premise on this case's own inputs: attempt 1 really settled, and it did so
    // with its timer still armed, which is the only situation this case is about.
    expect(item.getAttribute("aria-disabled"), "attempt 1 settled inside its window").toBe("false");

    act(() => {
      vi.advanceTimersByTime(100);
      fireEvent.click(item);
    });
    expect(action, "attempt 2 started").toHaveBeenCalledTimes(2);

    // t = 8,100 from the first tap, so attempt 1's timer was due 100ms ago.
    // Attempt 2 is only 7,500ms into its own window and must still be busy.
    act(() => {
      vi.advanceTimersByTime(7_500);
    });
    expect(item.getAttribute("aria-disabled"), "attempt 2's window is its own").toBe("true");

    await act(async () => {
      second.resolve({ ok: true });
      await second.promise;
    });
  });

  it("the timeout is VISIBLE, not only announced, and does not double-announce (AC-17)", () => {
    // Impeccable critique P1. A sighted person otherwise watches the row
    // silently un-dim after eight seconds with nothing saying why. The note is
    // aria-hidden so the always-mounted status region stays the single channel
    // to assistive tech; two nodes carrying this sentence would announce twice.
    vi.useFakeTimers();
    const first = held();
    const action = vi.fn(() => first.promise);
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    expect(action, "the tap reached clearAction").toHaveBeenCalledTimes(1);
    expect(
      screen.queryByTestId("avatar-menu-switch-timeout-note"),
      "no note while merely pending",
    ).toBeNull();

    act(() => {
      vi.advanceTimersByTime(8_100);
    });
    const note = screen.getByTestId("avatar-menu-switch-timeout-note");
    expect(note.textContent).toBe(NOTICE);
    expect(note.getAttribute("aria-hidden"), "hidden from AT, seen by eyes").toBe("true");
    // A sibling of role=menu, never a child: a non-item child of a menu role is
    // invalid ARIA, the same reason the alert sits outside it.
    expect(screen.getByRole("menu").contains(note)).toBe(false);
    // And exactly ONE node speaks: the sr-only region.
    expect(region.textContent).toBe(NOTICE);
    expect(region.getAttribute("aria-hidden")).toBeNull();
  });

  it("COMPOUND C10: a NEXT_REDIRECT digest DOES reach the boundary (AC-14)", async () => {
    // The other direction, and the pair is the point: a case that only ever
    // rejects a bare Error passes under the refuted digest test and under
    // `unstable_rethrow` alike, and so distinguishes nothing.
    //
    // GREEN BEFORE AND AFTER: today there is no catch at all, so control flow
    // reaches the boundary by default. This case is the invariant that the
    // repair must not break, and it is mutant-directed against a catch that
    // swallows everything, which is mandated below.
    const { caught } = await rejectWith(
      Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/x;307;" }),
    );
    expect(caught, "real control flow is rethrown untouched").toBe(true);
    expect(screen.queryByTestId("avatar-menu-switch-person"), "the row went with it").toBeNull();
  });
});
