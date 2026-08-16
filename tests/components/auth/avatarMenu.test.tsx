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
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { AvatarMenu } from "@/components/auth/AvatarMenu";
import { avatarColor } from "@/lib/crew/avatarColor";

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
const clearAction = (): void => {};

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

describe("the persist-failure note", () => {
  // theme-persistence-note Task N3 (spec §2.2; AC-1 / AC-4 / AC-6). The menu's
  // theme row writes through the same hook the standalone toggle uses, so a
  // device that cannot remember the choice has to say so HERE too — a note on
  // one control only would leave the other silent for the identical failure.
  function blockWrites(): void {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
  }

  function allowWrites(): void {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      /* a working device */
    });
  }

  function flipTheme(): void {
    act(() => {
      fireEvent.click(screen.getByTestId("avatar-menu-theme"));
    });
  }

  const note = () => screen.getByTestId("theme-persist-note");

  it("mounts the status region empty when the menu opens, before any failure (AC-4)", () => {
    blockWrites();
    renderMenu();
    openMenu();

    // Present BEFORE the failing activation. A region inserted at failure time
    // announces nothing — the ReSyncButton trap, pinned.
    expect(note()).toBeInTheDocument();
    expect(note()).toHaveAttribute("role", "status");
    expect(note().textContent).toBe("");
  });

  it("renders the note on a blocked write and leaves the menu open (AC-1)", () => {
    blockWrites();
    renderMenu();
    openMenu();

    flipTheme();

    expect(note().textContent).toBe("This device won't remember this choice.");
    // The absorb holds: the theme still applied, and the row did not close the menu.
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("keeps the note OUT of the role=menu element and its owned children (AC-6)", () => {
    blockWrites();
    renderMenu();
    openMenu();
    flipTheme();

    const menu = screen.getByRole("menu");
    expect(menu.contains(note())).toBe(false);
    // `role="menu"` constrains what it owns; the note is a popover sibling.
    expect(within(menu).queryByRole("status")).toBeNull();
    expect(
      [
        ...within(menu).getAllByRole("menuitemcheckbox"),
        ...within(menu).getAllByRole("menuitem"),
      ].map((el) => el.getAttribute("data-testid")),
    ).toEqual(["avatar-menu-theme", "avatar-menu-switch-person"]);
  });

  it("re-renders the note when the popover is closed and re-opened", () => {
    blockWrites();
    renderMenu();
    openMenu();
    flipTheme();
    expect(note().textContent).toBe("This device won't remember this choice.");

    act(() => fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" }));
    expect(screen.queryByTestId("theme-persist-note")).toBeNull();

    openMenu();
    // Hook state lives on the component, not the popover: the device has not
    // started remembering just because the menu closed.
    expect(note().textContent).toBe("This device won't remember this choice.");
  });

  it("keeps the note through a repeated failure and clears it on recovery (AC-1, AC-3)", () => {
    blockWrites();
    renderMenu();
    openMenu();

    flipTheme();
    flipTheme();
    expect(note().textContent).toBe("This device won't remember this choice.");

    allowWrites();
    flipTheme();
    expect(note().textContent).toBe("");
  });
});
