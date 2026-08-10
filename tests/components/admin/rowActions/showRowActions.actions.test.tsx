// @vitest-environment jsdom
/**
 * admin-dashboard-row-actions Task 4 — Preview-as submenu + row Re-sync.
 *
 * Spec §3.2 (crew source + cap), §3.4 (result surfacing), §3.4a (the
 * `shrink_held` two-phase decision), AC-3/AC-4/AC-6/AC-7.
 *
 * The load-bearing branch is `shrink_held`: the route returns it as `ok: true`,
 * and treating it as a success closes the menu while the reduced version is
 * silently discarded. The Accept path must carry the destructive treatment AND
 * fire a SECOND version-bound POST; Keep must fire none.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, createEvent, fireEvent, render, waitFor, within } from "@testing-library/react";

const refreshMock = vi.fn();
let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => mockSearchParams,
}));

const archiveActionMock = vi.fn();
vi.mock("@/app/admin/show/[slug]/_actions/archive", () => ({
  archiveShowAction: (slug: string) => archiveActionMock(slug),
}));

import { ShowRowActions } from "@/components/admin/ShowRowActions";
import { buildShowModalHref } from "@/lib/admin/showModalParams";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { CREW_SUBMENU_CAP } from "@/components/admin/ShowRowActions";
import { SYNC_GENERIC_ERROR_COPY } from "@/lib/admin/syncRequest";
import type { ActiveShowRow, CrewMemberRef } from "@/lib/admin/showDisplay";
import { premise, premiseHolds } from "../../../_shared/premise";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  refreshMock.mockReset();
  fetchMock.mockReset();
  archiveActionMock.mockReset();
  archiveActionMock.mockResolvedValue({ ok: true });
  mockSearchParams = new URLSearchParams();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => cleanup());

function row(over: Partial<ActiveShowRow> & { slug: string }): ActiveShowRow {
  return {
    id: over.slug,
    title: `Title ${over.slug}`,
    showDateStart: "2026-06-01",
    showDateEnd: "2026-06-05",
    crewCount: 2,
    crew: [
      { id: "c1", name: "Ada Lovelace" },
      { id: "c2", name: "Grace Hopper" },
    ],
    lastSyncedAt: null,
    lastSyncStatus: null,
    lastCheckedAt: null,
    published: true,
    isLive: false,
    finalizeOwned: false,
    archivedAt: null,
    ...over,
  };
}

const TAP_FLOOR = "min-h-tap-min";
// Every UPPERCASE code the sync route can return to this surface (route
// branches at app/api/admin/sync/[slug]/route.ts:75-129 plus the client's own
// transport-fault code). Each must resolve to catalog copy — and to ITS OWN.
const SYNC_FAILURE_CODES = ["FINALIZE_OWNED_SHOW", "SHOW_BUSY_RETRY", "SYNC_INFRA_ERROR"] as const;
const q = <T extends HTMLElement>(testid: string) =>
  document.body.querySelector<T>(`[data-testid="${testid}"]`);
const menuOf = (slug: string) => q<HTMLElement>(`row-actions-menu-${slug}`)!;
const openMenu = (slug: string) => {
  fireEvent.click(q<HTMLButtonElement>(`row-actions-trigger-${slug}`)!);
  return menuOf(slug);
};
const openSubmenu = (slug: string) => {
  fireEvent.click(q<HTMLElement>(`row-action-preview-${slug}`)!);
  return q<HTMLElement>(`row-action-preview-menu-${slug}`)!;
};

// Held-then-settle response helpers. `json` is read once per call, matching the
// component's single `res.json()`.
const jsonResponse = (payload: unknown) => ({ json: async () => payload }) as unknown as Response;
const HELD_PAYLOAD = {
  ok: true,
  result: {
    outcome: "shrink_held",
    detail: "crew drops from 12 to 3",
    heldModifiedTime: "2026-08-09T12:00:00.000Z",
  },
};

describe("Preview as… submenu (AC-3, AC-7)", () => {
  test("lists the row's crew, each linking its own preview route, each at the 44px floor", () => {
    const crew: CrewMemberRef[] = [
      { id: "c1", name: "Ada Lovelace" },
      { id: "c2", name: "Grace Hopper" },
    ];
    premise("the fixture carries more than one crew member", crew.length, 1);
    render(<ShowRowActions row={row({ slug: "east", crew, crewCount: crew.length })} />);
    openMenu("east");
    // A row WITH crew is neither disabled nor apologising: the empty-state hint
    // belongs to the empty case alone. (Without this, an implementation that
    // renders the hint unconditionally passes every other assertion here —
    // mutant (d) of the four-mutant pass survived until this line existed.)
    const previewItem = q<HTMLElement>("row-action-preview-east")!;
    expect(previewItem.getAttribute("aria-disabled")).toBeNull();
    expect(q("row-action-preview-empty-hint-east")).toBeNull();
    const submenu = openSubmenu("east");
    expect(submenu.getAttribute("role")).toBe("menu");
    for (const member of crew) {
      const item = within(submenu).getByTestId(`row-action-preview-crew-${member.id}`);
      expect(item.getAttribute("role")).toBe("menuitem");
      expect(item.className.split(/\s+/)).toContain(TAP_FLOOR);
      // Derived from the fixture + the shipped route shape, never hand-written.
      expect(item.getAttribute("href")).toBe(
        `/admin/show/${encodeURIComponent("east")}/preview/${encodeURIComponent(member.id)}`,
      );
    }
  });

  test("a null crew name renders the established Unnamed fallback, and a real name is untouched", () => {
    const crew: CrewMemberRef[] = [
      { id: "c9", name: null },
      { id: "c8", name: "Grace Hopper" },
    ];
    // PREMISE (own inputs): the fallback needs a null name to fire, AND a
    // named member to prove the fallback is not applied indiscriminately.
    premiseHolds("the fixture carries a null-named crew member", crew[0]!.name === null);
    premiseHolds("the fixture also carries a NAMED crew member", crew[1]!.name !== null);
    render(<ShowRowActions row={row({ slug: "s", crew, crewCount: crew.length })} />);
    openMenu("s");
    const submenu = openSubmenu("s");
    // Exact, and scoped to the item itself: a label rendered elsewhere cannot
    // satisfy it, and a longer string containing it is not the fallback.
    expect(within(submenu).getByTestId("row-action-preview-crew-c9").textContent).toBe("Unnamed");
    expect(within(submenu).getByTestId("row-action-preview-crew-c8").textContent).toBe(
      crew[1]!.name,
    );
  });

  test(`caps the list at ${CREW_SUBMENU_CAP} and offers an overflow item that opens the show`, () => {
    mockSearchParams = new URLSearchParams("bucket=active");
    const crew: CrewMemberRef[] = Array.from({ length: CREW_SUBMENU_CAP + 5 }, (_u, i) => ({
      id: `c${i}`,
      name: `Crew ${i}`,
    }));
    // PREMISE: the fixture must EXCEED the cap, or an uncapped implementation
    // passes this assertion unchanged.
    premise("the fixture crew exceeds the submenu cap", crew.length, CREW_SUBMENU_CAP);
    render(<ShowRowActions row={row({ slug: "big", crew, crewCount: crew.length })} />);
    openMenu("big");
    const submenu = openSubmenu("big");
    const crewItems = Array.from(
      submenu.querySelectorAll('[data-testid^="row-action-preview-crew-"]'),
    );
    expect(crewItems).toHaveLength(CREW_SUBMENU_CAP);
    const more = within(submenu).getByTestId("row-action-preview-more-big");
    expect(more.className.split(/\s+/)).toContain(TAP_FLOOR);
    expect(more.textContent).toContain(String(crew.length - CREW_SUBMENU_CAP));
    // The overflow item uses the SAME param-preserving modal href as Open.
    expect(more.getAttribute("href")).toBe(
      buildShowModalHref("big", new URLSearchParams("bucket=active")),
    );
  });

  test("no crew: the item is disabled, says why, and opens nothing", () => {
    render(<ShowRowActions row={row({ slug: "empty", crew: [], crewCount: 0 })} />);
    openMenu("empty");
    const item = q<HTMLElement>("row-action-preview-empty")!;
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(q("row-action-preview-empty-hint-empty")!.textContent).toBe("No crew on this show yet.");
    fireEvent.click(item);
    expect(q("row-action-preview-menu-empty")).toBeNull();
  });

  test("ArrowRight opens the submenu and moves focus into it; ArrowLeft closes back to the parent item", () => {
    render(<ShowRowActions row={row({ slug: "kb" })} />);
    const menu = openMenu("kb");
    const preview = q<HTMLElement>("row-action-preview-kb")!;
    preview.focus();
    fireEvent.keyDown(menu, { key: "ArrowRight" });
    const submenu = q<HTMLElement>("row-action-preview-menu-kb")!;
    expect(submenu).not.toBeNull();
    expect(preview.getAttribute("aria-expanded")).toBe("true");
    expect(submenu.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(submenu, { key: "ArrowLeft" });
    expect(q("row-action-preview-menu-kb")).toBeNull();
    expect(document.activeElement).toBe(preview);
    expect(preview.getAttribute("aria-expanded")).toBe("false");
  });

  test("Escape inside the submenu returns to the parent item without closing the menu", () => {
    render(<ShowRowActions row={row({ slug: "esc" })} />);
    openMenu("esc");
    const submenu = openSubmenu("esc");
    fireEvent.keyDown(submenu, { key: "Escape" });
    expect(q("row-action-preview-menu-esc")).toBeNull();
    expect(menuOf("esc")).not.toBeNull(); // the parent menu survives
    expect(document.activeElement).toBe(q("row-action-preview-esc"));
  });

  test("submenu ArrowDown/ArrowUp wrap across its own items", () => {
    const crew: CrewMemberRef[] = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
    ];
    premise("the submenu has enough items for wrap to differ from clamp", crew.length, 1);
    render(<ShowRowActions row={row({ slug: "wrap", crew, crewCount: crew.length })} />);
    openMenu("wrap");
    const submenu = openSubmenu("wrap");
    const items = Array.from(submenu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(submenu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items.at(-1));
    fireEvent.keyDown(submenu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
  });
});

describe("Re-sync — plain path (AC-4)", () => {
  test("fires EXACTLY one POST to the show's sync route", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, result: { outcome: "applied" } }));
    render(<ShowRowActions row={row({ slug: "my-show" })} />);
    openMenu("my-show");
    fireEvent.click(q("row-action-resync-my-show")!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/admin/sync/my-show");
    expect(init.method).toBe("POST");
    // The plain click carries NO accept body — only the confirm does (§3.4a).
    expect(init.body).toBeUndefined();
  });

  test("pending disables the sibling items and swaps the item to its pending label", async () => {
    let release: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>((res) => {
        release = res;
      }),
    );
    render(<ShowRowActions row={row({ slug: "pend" })} />);
    const menu = openMenu("pend");
    fireEvent.click(q("row-action-resync-pend")!);
    await waitFor(() => expect(q("row-action-resync-pend")!.textContent).toContain("Syncing…"));
    const siblings = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(
      (el) => el.dataset["testid"] !== "row-action-resync-pend",
    );
    // PREMISE: "siblings are disabled" is only observable when siblings exist.
    premise("the menu has sibling items to disable", siblings.length, 0);
    for (const s of siblings) expect(s.getAttribute("aria-disabled")).toBe("true");
    release(jsonResponse({ ok: true, result: { outcome: "applied" } }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  test("success refreshes BEFORE the menu closes, and announces the outcome", async () => {
    const seen: string[] = [];
    refreshMock.mockImplementation(() => {
      seen.push(menuOf("ok1") ? "menu-open-at-refresh" : "menu-closed-at-refresh");
    });
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, result: { outcome: "applied" } }));
    render(<ShowRowActions row={row({ slug: "ok1" })} />);
    openMenu("ok1");
    fireEvent.click(q("row-action-resync-ok1")!);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    // The inventory's ordering row: close happens AFTER router.refresh() ran.
    expect(seen).toEqual(["menu-open-at-refresh"]);
    await waitFor(() => expect(q("row-actions-menu-ok1")).toBeNull());
    // The menu is gone, so the announcement cannot live inside it: the
    // persistent region carries it (BL-ANNOUNCE-REGION-UNMOUNT-CLASS).
    const announce = q("row-actions-announce-ok1")!;
    expect(announce.getAttribute("role")).toBe("status");
    expect(announce.textContent).toContain("Synced. Changes applied.");
  });

  test.each(SYNC_FAILURE_CODES.map((c) => [c]))(
    "an %s failure renders catalog copy in an alert, keeps the menu open, and leaks no raw code",
    async (code) => {
      const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG];
      // PREMISE: the assertion compares against catalog copy, so the row must
      // HAVE Doug-facing copy — a null would make `toContain("")` vacuous.
      premiseHolds(`${code} has dougFacing copy in the catalog`, Boolean(entry.dougFacing));
      fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: code }));
      render(<ShowRowActions row={row({ slug: "err" })} />);
      openMenu("err");
      fireEvent.click(q("row-action-resync-err")!);
      const region = await waitFor(() => {
        const el = q<HTMLElement>("row-actions-error-err");
        expect(el).not.toBeNull();
        return el!;
      });
      // Same alert semantics as the shipped ReSyncButton reference: a role="group"
      // wrapper naming an inner role="alert" message node.
      expect(region.getAttribute("role")).toBe("group");
      const alert = region.querySelector('[role="alert"]')!;
      expect(alert).not.toBeNull();
      expect(region.textContent ?? "").toContain(entry.dougFacing!);
      // …and ONLY this code's copy: a region still showing the previous
      // failure's message is the stale-result bug this negative catches.
      for (const other of SYNC_FAILURE_CODES.filter((c) => c !== code)) {
        expect(region.textContent ?? "").not.toContain(
          MESSAGE_CATALOG[other as keyof typeof MESSAGE_CATALOG].dougFacing!,
        );
      }
      // No empty region, and no raw code anywhere in the rendered menu.
      expect((region.textContent ?? "").trim().length).toBeGreaterThan(0);
      expect(document.body.textContent ?? "").not.toContain(code);
      // Failure keeps the menu open so the admin can read it.
      expect(menuOf("err")).not.toBeNull();
      expect(refreshMock).not.toHaveBeenCalled();
    },
  );
});

describe("Re-sync — shrink_held decision (§3.4a, AC-4)", () => {
  test("held renders the prompt instead of closing, focuses the SAFE control, and disables items", async () => {
    fetchMock.mockResolvedValue(jsonResponse(HELD_PAYLOAD));
    render(<ShowRowActions row={row({ slug: "held" })} />);
    const menu = openMenu("held");
    fireEvent.click(q("row-action-resync-held")!);
    const confirm = await waitFor(() => {
      const el = q<HTMLElement>("row-actions-shrink-confirm-held");
      expect(el).not.toBeNull();
      return el!;
    });
    // Consequence prose quotes the server's own detail — never a generic line.
    expect(confirm.textContent).toContain(HELD_PAYLOAD.result.detail);
    // Safe-control focus (§3.8): Keep, never Apply.
    expect(document.activeElement).toBe(q("row-actions-keep-current-held"));
    // Held is NOT success: the menu stayed open and nothing refreshed.
    expect(menu).not.toBeNull();
    expect(refreshMock).not.toHaveBeenCalled();
    for (const item of Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'))) {
      expect(item.getAttribute("aria-disabled")).toBe("true");
    }
  });

  test("Accept carries the destructive recipe and fires a SECOND version-bound POST", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(HELD_PAYLOAD));
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, result: { outcome: "applied" } }));
    render(<ShowRowActions row={row({ slug: "acc" })} />);
    openMenu("acc");
    fireEvent.click(q("row-action-resync-acc")!);
    const accept = await waitFor(() => {
      const el = q<HTMLElement>("row-actions-accept-shrink-acc");
      expect(el).not.toBeNull();
      return el!;
    });
    // §3.8 tier-2 destructive recipe (C1): inverted amber, no competing fill.
    const tokens = accept.className.split(/\s+/);
    for (const t of ["bg-warning-text", "text-warning-bg", "font-semibold", "hover:opacity-90"]) {
      expect(tokens).toContain(t);
    }
    for (const t of ["bg-accent", "bg-surface", "bg-bg"]) expect(tokens).not.toContain(t);

    fireEvent.click(accept);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, init] = fetchMock.mock.calls[1]! as [string, RequestInit];
    // Version-bound: a stale confirm must re-hold rather than clobber last-good.
    expect(JSON.parse(String(init.body))).toEqual({
      acceptShrink: true,
      expectedModifiedTime: HELD_PAYLOAD.result.heldModifiedTime,
    });
  });

  test("Keep fires ZERO further requests and restores focus to the Re-sync item", async () => {
    fetchMock.mockResolvedValue(jsonResponse(HELD_PAYLOAD));
    render(<ShowRowActions row={row({ slug: "keep" })} />);
    openMenu("keep");
    fireEvent.click(q("row-action-resync-keep")!);
    const keep = await waitFor(() => {
      const el = q<HTMLElement>("row-actions-keep-current-keep");
      expect(el).not.toBeNull();
      return el!;
    });
    const callsBefore = fetchMock.mock.calls.length;
    premise("the held prompt arrived from a real request", callsBefore, 0);
    fireEvent.click(keep);
    await waitFor(() => expect(q("row-actions-shrink-confirm-keep")).toBeNull());
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    expect(refreshMock).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(q("row-action-resync-keep"));
  });

  test("the held prompt arrival is announced on the persistent region", async () => {
    fetchMock.mockResolvedValue(jsonResponse(HELD_PAYLOAD));
    render(<ShowRowActions row={row({ slug: "ann" })} />);
    openMenu("ann");
    fireEvent.click(q("row-action-resync-ann")!);
    await waitFor(() =>
      expect(q("row-actions-announce-ann")!.textContent).toContain(HELD_PAYLOAD.result.detail),
    );
    // The interactive prompt itself must NOT be a live region — a reader would
    // otherwise hear its buttons as part of the announcement.
    const confirm = q<HTMLElement>("row-actions-shrink-confirm-ann")!;
    expect(confirm.getAttribute("role")).not.toBe("status");
    expect(confirm.getAttribute("role")).not.toBe("alert");
    expect(confirm.getAttribute("aria-live")).toBeNull();
  });
});

// ── impeccable critique P0, held-prompt half ────────────────────────────────
describe("shrink_held prompt — the menu grammar yields to the sub-panel", () => {
  test("Tab keeps the prompt open and Escape returns to the menu", async () => {
    fetchMock.mockResolvedValue(jsonResponse(HELD_PAYLOAD));
    render(<ShowRowActions row={row({ slug: "kbh" })} />);
    const menu = openMenu("kbh");
    fireEvent.click(q("row-action-resync-kbh")!);
    const accept = await waitFor(() => {
      const el = q<HTMLButtonElement>("row-actions-accept-shrink-kbh");
      expect(el).not.toBeNull();
      return el!;
    });
    // The destructive control must be reachable from the safe one.
    expect(accept.getAttribute("tabindex")).toBeNull();
    expect(accept.disabled).toBe(false);
    fireEvent.keyDown(menu, { key: "Tab" });
    expect(q("row-actions-shrink-confirm-kbh")).not.toBeNull();
    expect(q("row-actions-menu-kbh")).not.toBeNull();
    const callsBefore = fetchMock.mock.calls.length;
    fireEvent.keyDown(menu, { key: "Escape" });
    // Escape dismisses the DECISION (keeping the current version) and returns
    // to the menu — it never silently accepts, and never fires a request.
    expect(q("row-actions-shrink-confirm-kbh")).toBeNull();
    expect(q("row-actions-menu-kbh")).not.toBeNull();
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    expect(document.activeElement).toBe(q("row-action-resync-kbh"));
  });
});

// ── whole-diff review R1 repairs (findings 1, 2, 4) ─────────────────────────
describe("Re-sync — every reachable failure speaks, and a request owns the surface", () => {
  // The route can return codes the §12.4 catalog does not carry at all, and
  // codes whose row has `dougFacing: null`. ErrorExplainer renders NOTHING for
  // either, so trusting it alone paints an empty alert.
  const SILENT_CODES = ["MI-2_EMPTY_TITLE", "STAGED_PARSE_REVISION_RACE"] as const;

  test.each(SILENT_CODES.map((c) => [c]))(
    "%s has no renderable catalog copy, so the alert falls back to plain language",
    async (code) => {
      const entry = (MESSAGE_CATALOG as Record<string, { dougFacing?: string | null }>)[code];
      // PREMISE (own inputs): this case only tests the fallback if the code
      // genuinely has nothing to render. A code that GAINS copy later must move
      // to the catalog-copy suite, not silently pass here.
      premiseHolds(
        `${code} has no dougFacing copy in the catalog`,
        !entry || typeof entry.dougFacing !== "string" || entry.dougFacing.trim() === "",
      );
      fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: code }));
      render(<ShowRowActions row={row({ slug: "silent" })} />);
      openMenu("silent");
      fireEvent.click(q("row-action-resync-silent")!);
      const region = await waitFor(() => {
        const el = q<HTMLElement>("row-actions-error-silent");
        expect(el).not.toBeNull();
        return el!;
      });
      expect(region.textContent ?? "").toContain(SYNC_GENERIC_ERROR_COPY);
      // Never empty, and never the raw code (invariant 5).
      expect((region.textContent ?? "").trim().length).toBeGreaterThan(0);
      expect(document.body.textContent ?? "").not.toContain(code);
    },
  );

  test("a pending request refuses every dismissal path, so its outcome cannot land on a closed menu", async () => {
    let release: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>((res) => {
        release = res;
      }),
    );
    render(<ShowRowActions row={row({ slug: "hold" })} />);
    const menu = openMenu("hold");
    fireEvent.click(q("row-action-resync-hold")!);
    await waitFor(() => expect(q("row-action-resync-hold")!.textContent).toContain("Syncing…"));

    // Escape …
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(q("row-actions-menu-hold")).not.toBeNull();

    // … Tab, which must ALSO be prevented: refusing to close while letting the
    // native Tab through walks focus out of a menu that deliberately stayed
    // open. `fireEvent.keyDown` performs no native focus move, so the contract
    // is read off the event itself.
    const tab = createEvent.keyDown(menu, { key: "Tab" });
    fireEvent(menu, tab);
    expect(tab.defaultPrevented, "the native Tab must be refused too").toBe(true);
    expect(q("row-actions-menu-hold")).not.toBeNull();

    // … the backdrop …
    fireEvent.click(q("row-actions-backdrop-hold")!);
    expect(q("row-actions-menu-hold")).not.toBeNull();

    // … a real page scroll (the dismiss the portal wires to `onDismiss`) …
    fireEvent.scroll(document);
    expect(q("row-actions-menu-hold")).not.toBeNull();

    // … and the trigger itself, which is a dismissal when the menu is open.
    fireEvent.click(q("row-actions-trigger-hold")!);
    expect(q("row-actions-menu-hold")).not.toBeNull();

    // …and the failure it was holding open for is visible.
    release(jsonResponse({ ok: false, error: "SHOW_BUSY_RETRY" }));
    await waitFor(() => expect(q("row-actions-error-hold")).not.toBeNull());
    expect(q("row-actions-error-hold")!.textContent ?? "").toContain(
      MESSAGE_CATALOG.SHOW_BUSY_RETRY.dougFacing!,
    );
  });

  test("a pending request also holds a SUB-PANEL open: Escape there cancels nothing", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(HELD_PAYLOAD));
    let release: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((res) => {
        release = res;
      }),
    );
    render(<ShowRowActions row={row({ slug: "sub" })} />);
    const menu = openMenu("sub");
    fireEvent.click(q("row-action-resync-sub")!);
    const accept = await waitFor(() => {
      const el = q<HTMLElement>("row-actions-accept-shrink-sub");
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.click(accept); // second, version-bound POST — now in flight
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    fireEvent.keyDown(menu, { key: "Escape" });
    // Cancelling here would unmount the region the outcome is about to land in.
    expect(q("row-actions-shrink-confirm-sub")).not.toBeNull();

    release(jsonResponse({ ok: false, error: "SHOW_BUSY_RETRY" }));
    await waitFor(() => expect(q("row-actions-error-sub")).not.toBeNull());
  });

  test("the Re-sync item never claims a request it did not fire", async () => {
    // One shared `pending` boolean made the Re-sync item announce aria-busy and
    // swap to "Syncing…" while the ARCHIVE confirm said "Archiving…" beside it.
    let release: (v: unknown) => void = () => {};
    archiveActionMock.mockReturnValue(
      new Promise((res) => {
        release = res;
      }),
    );
    render(<ShowRowActions row={row({ slug: "kinds" })} />);
    openMenu("kinds");
    fireEvent.click(q("row-action-archive-kinds")!);
    fireEvent.click(q("row-actions-archive-go-kinds")!);
    await waitFor(() =>
      expect(q("row-actions-archive-go-kinds")!.textContent).toContain("Archiving…"),
    );
    const resync = q("row-action-resync-kinds")!;
    expect(resync.textContent).toContain("Re-sync");
    expect(resync.textContent).not.toContain("Syncing…");
    expect(resync.getAttribute("aria-busy")).toBe("false");
    // No sync request was ever fired.
    expect(fetchMock).not.toHaveBeenCalled();
    release({ ok: true });
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  test("a FAILED Accept returns focus to the Re-sync item rather than dropping it on <body>", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(HELD_PAYLOAD));
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false, error: "SHOW_BUSY_RETRY" }));
    render(<ShowRowActions row={row({ slug: "af" })} />);
    openMenu("af");
    fireEvent.click(q("row-action-resync-af")!);
    const accept = await waitFor(() => {
      const el = q<HTMLElement>("row-actions-accept-shrink-af");
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.click(accept);
    await waitFor(() => expect(q("row-actions-error-af")).not.toBeNull());
    // The prompt (and the focused button) unmounted; focus must not be on body.
    expect(q("row-actions-shrink-confirm-af")).toBeNull();
    expect(document.activeElement).toBe(q("row-action-resync-af"));
  });
});

// ── whole-diff review R10 ───────────────────────────────────────────────────
// A background refresh changes the ROSTER, not just publication state, and the
// submenu's focus reconciliation was keyed only on `submenuOpen`.
describe("Preview submenu — a roster refresh under an open submenu", () => {
  test("an emptied roster closes the submenu and returns focus to its item", () => {
    const r = row({ slug: "empty-flip" });
    const { rerender } = render(<ShowRowActions row={r} />);
    openMenu("empty-flip");
    openSubmenu("empty-flip");
    premiseHolds(
      "the submenu is open before the roster changes",
      q("row-action-preview-menu-empty-flip") !== null,
    );

    rerender(<ShowRowActions row={{ ...r, crew: [], crewCount: 0 }} />);

    // Left open, `submenuOpen` would stay true with nothing in it: focus falls
    // to <body>, and crew returning later reopens a menu nobody asked for.
    expect(q("row-action-preview-menu-empty-flip")).toBeNull();
    expect(document.activeElement).toBe(q("row-action-preview-empty-flip"));
  });

  test("removing the FOCUSED member keeps the submenu open and moves focus to a live item", () => {
    const r = row({
      slug: "swap",
      crew: [
        { id: "a", name: "Ada" },
        { id: "b", name: "Grace" },
      ],
      crewCount: 2,
    });
    const { rerender } = render(<ShowRowActions row={r} />);
    openMenu("swap");
    const submenu = openSubmenu("swap");
    const first = q("row-action-preview-crew-a")!;
    premiseHolds(
      "focus starts on the member about to be removed",
      document.activeElement === first,
    );

    rerender(<ShowRowActions row={{ ...r, crew: [{ id: "b", name: "Grace" }], crewCount: 1 }} />);

    expect(q("row-action-preview-crew-a")).toBeNull();
    expect(q("row-action-preview-menu-swap")).not.toBeNull();
    // Not <body>: the surface is still open, so focus belongs inside it.
    expect(submenu.contains(document.activeElement)).toBe(true);
  });
});
