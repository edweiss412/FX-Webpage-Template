// @vitest-environment jsdom
/**
 * admin-dashboard-row-actions Task 3 — ShowRowActions menu shell.
 *
 * Pins the trigger/menu ARIA contract (spec §3.1, AC-1/AC-2/AC-7) and the
 * keyboard contract inherited from the tree's real kebab menu,
 * components/admin/wizard/CrewRowActions.tsx: focus into the menu on open,
 * ArrowUp/ArrowDown wrap, Home/End, Escape closes and restores trigger focus,
 * Tab closes.
 *
 * AC-2 is the load-bearing hide rule: Held/Publishing rows (`published===false`)
 * expose Open ONLY, for BOTH `finalizeOwned` values — the pill differs between
 * them, the menu rule does not.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";

let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => mockSearchParams,
}));

import { ShowRowActions } from "@/components/admin/ShowRowActions";
import { buildShowModalHref } from "@/lib/admin/showModalParams";
import type { ActiveShowRow } from "@/lib/admin/showDisplay";
import { premise, premiseHolds } from "../../../_shared/premise";

afterEach(() => {
  cleanup();
  mockSearchParams = new URLSearchParams();
});

function row(over: Partial<ActiveShowRow> & { slug: string }): ActiveShowRow {
  return {
    id: over.slug,
    title: `Title ${over.slug}`,
    showDateStart: "2026-06-01",
    showDateEnd: "2026-06-05",
    crewCount: 3,
    crew: [
      { id: "c1", name: "Ada Lovelace" },
      { id: "c2", name: "Grace Hopper" },
      { id: "c3", name: null },
    ],
    lastSyncedAt: "2026-06-03T10:00:00.000Z",
    lastSyncStatus: "ok",
    lastCheckedAt: "2026-06-03T10:05:00.000Z",
    published: true,
    isLive: false,
    finalizeOwned: false,
    archivedAt: null,
    ...over,
  };
}

const TAP_FLOOR = "min-h-tap-min";
// testid suffix → the visible label, per master spec §9.1's action names.
const ITEM_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["open", "Open"],
  ["preview", "Preview as…"],
  ["resync", "Re-sync"],
  ["archive", "Archive"],
];
const menuNode = (slug: string) =>
  document.body.querySelector<HTMLElement>(`[data-testid="row-actions-menu-${slug}"]`);
const triggerNode = (slug: string) =>
  document.body.querySelector<HTMLButtonElement>(`[data-testid="row-actions-trigger-${slug}"]`);
const openMenu = (slug: string) => {
  fireEvent.click(triggerNode(slug)!);
  return menuNode(slug)!;
};
const itemsOf = (menu: HTMLElement) =>
  Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));

describe("ShowRowActions — trigger contract (AC-1, AC-7)", () => {
  test("trigger is a 44px menu button whose name follows the show title", () => {
    render(<ShowRowActions row={row({ slug: "east-coast" })} />);
    const trigger = triggerNode("east-coast")!;
    expect(trigger).not.toBeNull();
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-label")).toBe("Actions for Title east-coast");
    const classes = trigger.className.split(/\s+/);
    expect(classes).toContain("min-h-tap-min");
    expect(classes).toContain("min-w-tap-min");
  });

  test("a null title falls the accessible name back to the slug (guard condition)", () => {
    const r = row({ slug: "no-title", title: null });
    // PREMISE (own inputs): the fallback is only observable when the title is
    // actually absent AND the slug differs from the default title string.
    premiseHolds("the fixture row has a null title", r.title === null);
    render(<ShowRowActions row={r} />);
    expect(triggerNode("no-title")!.getAttribute("aria-label")).toBe("Actions for no-title");
  });

  test.each([
    ["an empty title", ""],
    ["a whitespace-only title", "   "],
  ])("%s falls back to the slug, exactly as null does", (_label, title) => {
    const r = row({ slug: "blank-title", title });
    // PREMISE (own inputs): `?? ` already handles null, so the case only tests
    // anything if the title is present-but-blank.
    premiseHolds("the fixture title is present but blank", r.title !== null && !r.title!.trim());
    render(<ShowRowActions row={r} />);
    // Not "Actions for " — a control whose name trails off is unusable.
    expect(triggerNode("blank-title")!.getAttribute("aria-label")).toBe("Actions for blank-title");
  });

  test("aria-expanded tracks BOTH states", () => {
    render(<ShowRowActions row={row({ slug: "s1" })} />);
    expect(triggerNode("s1")!.getAttribute("aria-expanded")).toBe("false");
    openMenu("s1");
    expect(triggerNode("s1")!.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(menuNode("s1")!, { key: "Escape" });
    expect(triggerNode("s1")!.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("ShowRowActions — item set (AC-1, AC-2)", () => {
  test("a published row exposes all four actions, labelled, each at the 44px floor", () => {
    render(<ShowRowActions row={row({ slug: "pub" })} />);
    const menu = openMenu("pub");
    expect(menu.getAttribute("role")).toBe("menu");
    // The copy contract (master spec §9.1's action names). Each label is read
    // from its OWN item node, never the menu container, so a label rendered by
    // a sibling item cannot satisfy another item's assertion.
    for (const [kind, label] of ITEM_LABELS) {
      const item = within(menu).getByTestId(`row-action-${kind}-pub`);
      expect(item.getAttribute("role")).toBe("menuitem");
      expect(item.className.split(/\s+/)).toContain(TAP_FLOOR);
      expect(item.textContent?.trim()).toBe(label);
    }
    // Exactly four — an extra item would silently widen the surface.
    expect(itemsOf(menu)).toHaveLength(4);
  });

  test.each([
    ["finalize-owned (Publishing…)", true],
    ["not finalize-owned (Held)", false],
  ])("an unpublished row — %s — exposes Open ONLY", (_label, finalizeOwned) => {
    const slug = finalizeOwned ? "publishing" : "held";
    const r = row({ slug, published: false, finalizeOwned });
    premiseHolds("the fixture row is unpublished", r.published === false);
    render(<ShowRowActions row={r} />);
    const menu = openMenu(slug);
    expect(within(menu).getByTestId(`row-action-open-${slug}`)).toBeInTheDocument();
    expect(within(menu).queryByTestId(`row-action-preview-${slug}`)).toBeNull();
    expect(within(menu).queryByTestId(`row-action-resync-${slug}`)).toBeNull();
    expect(within(menu).queryByTestId(`row-action-archive-${slug}`)).toBeNull();
    expect(itemsOf(menu)).toHaveLength(1);
  });

  test("Open uses the SAME param-preserving modal href the row link uses", () => {
    mockSearchParams = new URLSearchParams("bucket=active&q=east&alert_id=abc");
    // PREMISE: params must be non-empty AND carry a param that survives, or
    // "preserves the params" is indistinguishable from "ignores them".
    premise("the ambient params are non-empty", Array.from(mockSearchParams.keys()).length, 1);
    render(<ShowRowActions row={row({ slug: "east-coast" })} />);
    const menu = openMenu("east-coast");
    const open = within(menu).getByTestId("row-action-open-east-coast");
    // Derived from the shared helper, never a hand-written URL.
    expect(open.getAttribute("href")).toBe(
      buildShowModalHref("east-coast", new URLSearchParams("bucket=active&q=east&alert_id=abc")),
    );
  });
});

describe("ShowRowActions — keyboard + focus contract (AC-7)", () => {
  test("opening moves focus INTO the menu (first item)", () => {
    render(<ShowRowActions row={row({ slug: "k1" })} />);
    const menu = openMenu("k1");
    expect(document.activeElement).toBe(itemsOf(menu)[0]);
  });

  test("ArrowDown / ArrowUp wrap around the item list", () => {
    render(<ShowRowActions row={row({ slug: "k2" })} />);
    const menu = openMenu("k2");
    const items = itemsOf(menu);
    // PREMISE: wrapping is only observable with more than one item.
    premise("the menu has enough items for wrap to differ from clamp", items.length, 1);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    // Walk to the last item, then wrap forward to the first.
    for (let i = 1; i < items.length - 1; i += 1) fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items.at(-1));
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
    // ArrowUp from the first wraps backwards to the last.
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items.at(-1));
  });

  test("Home / End jump to the ends", () => {
    render(<ShowRowActions row={row({ slug: "k3" })} />);
    const menu = openMenu("k3");
    const items = itemsOf(menu);
    premise("the menu has distinct first and last items", items.length, 1);
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(items.at(-1));
    fireEvent.keyDown(menu, { key: "Home" });
    expect(document.activeElement).toBe(items[0]);
  });

  test("Escape closes and restores focus to the trigger", () => {
    render(<ShowRowActions row={row({ slug: "k4" })} />);
    const menu = openMenu("k4");
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(menuNode("k4")).toBeNull();
    expect(document.activeElement).toBe(triggerNode("k4"));
  });

  test("Tab closes the menu (APG menu-button) without trapping focus", () => {
    render(<ShowRowActions row={row({ slug: "k5" })} />);
    const menu = openMenu("k5");
    fireEvent.keyDown(menu, { key: "Tab" });
    expect(menuNode("k5")).toBeNull();
  });

  test("an outside click closes the menu", () => {
    render(<ShowRowActions row={row({ slug: "k6" })} />);
    openMenu("k6");
    const backdrop = document.body.querySelector<HTMLElement>(
      '[data-testid="row-actions-backdrop-k6"]',
    );
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(menuNode("k6")).toBeNull();
  });
});

describe("ShowRowActions — transition inventory rows owned by this task (§3.5)", () => {
  test("closed → open and open → closed are INSTANT: the menu mounts and unmounts, never fades", () => {
    render(<ShowRowActions row={row({ slug: "t1" })} />);
    expect(menuNode("t1")).toBeNull();
    const menu = openMenu("t1");
    // Instant per the inventory (popover-primitive default): no exit animation
    // wrapper holds the node alive, and no opacity/transition class governs the
    // open state — the node's PRESENCE is the state. Inspect the PANEL, which
    // carries the surface's chrome; the role="menu" element inside it is a bare
    // list and would satisfy this vacuously.
    const panel = document.body.querySelector<HTMLElement>('[data-testid="row-actions-panel-t1"]')!;
    expect(panel).not.toBeNull();
    const classes = panel.className.split(/\s+/);
    premiseHolds("the menu rendered with at least one class to inspect", classes.length > 0);
    expect(classes.filter((c) => c.startsWith("transition-") || c.startsWith("animate-"))).toEqual(
      [],
    );
    fireEvent.keyDown(menu, { key: "Escape" });
    // Synchronously gone in the same tick: nothing is awaiting an exit.
    expect(menuNode("t1")).toBeNull();
  });
});

// ── impeccable audit P2: the ARIA menu content model ────────────────────────
// `role="menu"` accepts menuitem / separator / group children — not an error
// region, not a decision prompt, not a confirm step. Those surfaces live in the
// PANEL beside the menu, and the panel (not the menu) owns key handling so they
// still reach it.
describe("ShowRowActions — the menu element holds only menu content", () => {
  // BOTH crew states, because they render DIFFERENT children: the empty roster
  // adds the described-by hint, and a crew-populated fixture alone never sees
  // it — which is exactly how this claim was true in the test and false in the
  // reachable case until whole-diff R5 probed it.
  test.each([
    ["with crew", [{ id: "c1", name: "Ada Lovelace" }]],
    ["with an empty roster", []],
  ] as const)("every child of role=menu is menu content (%s)", (_label, crew) => {
    const r = row({ slug: "aria", crew: [...crew], crewCount: crew.length });
    render(<ShowRowActions row={r} />);
    const menu = openMenu("aria");
    const kids = Array.from(menu.children);
    premise("the menu rendered children to inspect", kids.length, 0);
    for (const kid of kids) {
      expect(
        // `none` is the ARIA escape hatch, not a loophole: the empty-crew hint
        // is a <p> that must sit visually under the item it explains, and
        // role="none" removes it from the accessibility tree entirely, so the
        // menu's CHILDREN as assistive tech sees them are still only items and
        // separators. The `aria-describedby` reference reaches it regardless.
        ["menuitem", "separator", "none"],
        `unexpected role="${kid.getAttribute("role")}" child of role="menu"`,
      ).toContain(kid.getAttribute("role"));
    }
  });

  test("the Preview submenu names itself and owns no generic child", () => {
    render(<ShowRowActions row={row({ slug: "sub" })} />);
    openMenu("sub");
    fireEvent.click(document.body.querySelector('[data-testid="row-action-preview-sub"]')!);
    const submenu = document.body.querySelector<HTMLElement>(
      '[data-testid="row-action-preview-menu-sub"]',
    )!;
    expect(submenu).not.toBeNull();
    // An sr-only label span inside the menu is a GENERIC child, which the menu
    // content model does not own. The menu carries its own name instead.
    expect(submenu.getAttribute("aria-label")).toBe("Preview Title sub as");
    for (const kid of Array.from(submenu.children)) {
      expect(
        ["menuitem", "separator", "none"],
        `unexpected role="${kid.getAttribute("role")}" child of the submenu`,
      ).toContain(kid.getAttribute("role"));
    }
  });

  test("the empty-crew hint is the ONLY presentational child, and it is described-by-referenced", () => {
    const r = row({ slug: "hint", crew: [], crewCount: 0 });
    premiseHolds("the fixture has an empty roster", (r.crew ?? []).length === 0);
    render(<ShowRowActions row={r} />);
    const menu = openMenu("hint");
    const presentational = Array.from(menu.children).filter(
      (k) => k.getAttribute("role") === "none",
    );
    expect(presentational).toHaveLength(1);
    const hint = presentational[0]!;
    expect(hint.getAttribute("data-testid")).toBe("row-action-preview-empty-hint-hint");
    // It is not orphaned: the item it explains points at it.
    const item = document.body.querySelector('[data-testid="row-action-preview-hint"]')!;
    expect(item.getAttribute("aria-describedby")).toBe(hint.id);
  });

  test("a separator precedes the destructive item — required, not merely permitted", () => {
    render(<ShowRowActions row={row({ slug: "sep" })} />);
    const menu = openMenu("sep");
    const kids = Array.from(menu.children);
    const archiveAt = kids.findIndex(
      (k) => k.getAttribute("data-testid") === "row-action-archive-sep",
    );
    premise("the menu renders the Archive item", archiveAt, 0);
    // The permissive content-model check above accepts a menu with NO separator
    // at all, which is how this was lost once already: §12 recorded it fixed
    // while the ARIA restructure had removed it.
    expect(
      kids[archiveAt - 1]?.getAttribute("role"),
      "the destructive item must be separated from Re-sync",
    ).toBe("separator");
  });

  test("the Archive confirm renders OUTSIDE the menu element, inside the panel", () => {
    render(<ShowRowActions row={row({ slug: "outside" })} />);
    const menu = openMenu("outside");
    fireEvent.click(document.body.querySelector('[data-testid="row-action-archive-outside"]')!);
    const confirm = document.body.querySelector(
      '[data-testid="row-actions-archive-confirm-outside"]',
    )!;
    const panel = document.body.querySelector('[data-testid="row-actions-panel-outside"]')!;
    expect(confirm).not.toBeNull();
    expect(menu.contains(confirm)).toBe(false);
    expect(panel.contains(confirm)).toBe(true);
  });
});
