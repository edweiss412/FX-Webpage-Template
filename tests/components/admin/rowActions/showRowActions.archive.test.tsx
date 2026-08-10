// @vitest-environment jsdom
/**
 * admin-dashboard-row-actions Task 5 — row Archive + the destructive contract.
 *
 * Spec §3.8 / AC-5 / AC-6. Archive rotates the crew link dead immediately, so
 * the in-menu confirm carries the full destructive treatment: consequence prose
 * that NAMES the show, the inverted-amber confirm recipe, initial focus on the
 * SAFE control, and focus restoration on cancel.
 *
 * Every reachable failure renders SOME copy: the two lowercase non-catalog
 * sentinels (`show_not_found`, `infra_error`) get their generic branches and
 * `FINALIZE_OWNED_SHOW` gets catalog copy read FROM the catalog. An empty error
 * region is a failing assertion by specification.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

const archiveActionMock = vi.fn();
vi.mock("@/app/admin/show/[slug]/_actions/archive", () => ({
  archiveShowAction: (slug: string) => archiveActionMock(slug),
}));

import { ShowRowActions } from "@/components/admin/ShowRowActions";
import {
  ARCHIVE_GENERIC_ERROR_COPY,
  ARCHIVE_NOT_FOUND_COPY,
  archiveConsequenceProse,
} from "@/lib/admin/archiveCopy";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import type { ActiveShowRow } from "@/lib/admin/showDisplay";
import { premise, premiseHolds } from "../../../_shared/premise";

beforeEach(() => {
  refreshMock.mockReset();
  archiveActionMock.mockReset();
  archiveActionMock.mockResolvedValue({ ok: true });
});
afterEach(() => cleanup());

function row(over: Partial<ActiveShowRow> & { slug: string }): ActiveShowRow {
  return {
    id: `id-${over.slug}`,
    title: "Spring Gala",
    showDateStart: "2026-06-01",
    showDateEnd: "2026-06-05",
    crewCount: 1,
    crew: [{ id: "c1", name: "Ada Lovelace" }],
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

const q = <T extends HTMLElement>(testid: string) =>
  document.body.querySelector<T>(`[data-testid="${testid}"]`);
const openMenu = (slug: string) => {
  fireEvent.click(q<HTMLButtonElement>(`row-actions-trigger-${slug}`)!);
  return q<HTMLElement>(`row-actions-menu-${slug}`)!;
};
const enterConfirm = (slug: string) => {
  fireEvent.click(q(`row-action-archive-${slug}`)!);
  return q<HTMLElement>(`row-actions-archive-confirm-${slug}`)!;
};

describe("Archive — destructive confirm contract (AC-5, §3.8)", () => {
  test("the item swaps in place to a confirm that names the show and focuses the SAFE control", () => {
    const r = row({ slug: "gala" });
    // PREMISE (own inputs): "names the show" is only observable when the row
    // HAS a title — a null-titled fixture would silently test the fallback.
    premiseHolds("the fixture row carries a title", Boolean(r.title));
    render(<ShowRowActions row={r} />);
    openMenu("gala");
    const confirm = enterConfirm("gala");
    expect(confirm).not.toBeNull();
    // The Archive item is REPLACED (in-place swap, §3.5), not duplicated.
    expect(q("row-action-archive-gala")).toBeNull();
    // Prose derived from the shared copy source — EXACTLY, on its own node, so
    // neither an appended sentence nor a neighbouring label can satisfy it —
    // and it must carry the show's name.
    expect(q("row-actions-archive-consequence-gala")!.textContent).toBe(
      archiveConsequenceProse(r.title),
    );
    expect(q("row-actions-archive-consequence-gala")!.textContent).toContain(r.title!);
    // Safe-control focus: Cancel, never Confirm.
    expect(document.activeElement).toBe(q("row-actions-archive-cancel-gala"));
  });

  test("the confirm-go carries the inverted-amber destructive recipe", () => {
    render(<ShowRowActions row={row({ slug: "rec" })} />);
    openMenu("rec");
    enterConfirm("rec");
    const go = q<HTMLElement>("row-actions-archive-go-rec")!;
    const tokens = go.className.split(/\s+/);
    for (const t of ["bg-warning-text", "text-warning-bg", "font-semibold", "hover:opacity-90"]) {
      expect(tokens).toContain(t);
    }
    for (const t of ["bg-accent", "bg-surface", "bg-bg"]) expect(tokens).not.toContain(t);
    // No competing hover fill (the C1 rule the registry meta-test enforces).
    expect(
      tokens
        .filter((t) => t.split(":").slice(0, -1).includes("hover"))
        .filter((t) => t.split(":").at(-1)!.startsWith("bg-")),
    ).toEqual([]);
  });

  test("cancel restores the menu AND focus to the Archive item, and archives nothing", () => {
    render(<ShowRowActions row={row({ slug: "can" })} />);
    openMenu("can");
    enterConfirm("can");
    fireEvent.click(q("row-actions-archive-cancel-can")!);
    expect(q("row-actions-archive-confirm-can")).toBeNull();
    const item = q("row-action-archive-can");
    expect(item).not.toBeNull();
    expect(document.activeElement).toBe(item);
    expect(archiveActionMock).not.toHaveBeenCalled();
  });

  test("confirm calls archiveShowAction with the SLUG, exactly once", async () => {
    const r = row({ slug: "east-coast" });
    // The shipped action resolves the show itself via resolveShowBySlug: passing
    // row.id would return show_not_found without archiving anything.
    premiseHolds("the fixture's id and slug differ", r.id !== r.slug);
    render(<ShowRowActions row={r} />);
    openMenu("east-coast");
    enterConfirm("east-coast");
    fireEvent.click(q("row-actions-archive-go-east-coast")!);
    await waitFor(() => expect(archiveActionMock).toHaveBeenCalled());
    expect(archiveActionMock).toHaveBeenCalledTimes(1);
    expect(archiveActionMock).toHaveBeenCalledWith("east-coast");
  });

  test("success refreshes BEFORE closing, and announces on the persistent region", async () => {
    const seen: string[] = [];
    refreshMock.mockImplementation(() => {
      seen.push(q("row-actions-menu-ok") ? "menu-open-at-refresh" : "menu-closed-at-refresh");
    });
    render(<ShowRowActions row={row({ slug: "ok" })} />);
    openMenu("ok");
    enterConfirm("ok");
    fireEvent.click(q("row-actions-archive-go-ok")!);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(seen).toEqual(["menu-open-at-refresh"]);
    await waitFor(() => expect(q("row-actions-menu-ok")).toBeNull());
    // The menu is gone, so the announcement lives on the persistent region.
    expect(q("row-actions-announce-ok")!.textContent).toContain("Spring Gala");
  });
});

describe("Archive — every reachable failure renders copy (AC-5, AC-6)", () => {
  const cases = [
    { code: "show_not_found", expected: ARCHIVE_NOT_FOUND_COPY, label: "not-found sentinel" },
    { code: "infra_error", expected: ARCHIVE_GENERIC_ERROR_COPY, label: "infra sentinel" },
    {
      code: "FINALIZE_OWNED_SHOW",
      expected: MESSAGE_CATALOG.FINALIZE_OWNED_SHOW.dougFacing!,
      label: "catalog code",
    },
  ] as const;

  test.each(cases.map((c) => [c.label, c.code, c.expected]))(
    "%s (%s) renders its own copy in an alert, keeps the menu open, leaks no raw code",
    async (_label, code, expected) => {
      // PREMISE: comparing against empty copy would make every assertion below
      // vacuous — the branch must HAVE something to say.
      premise("the expected copy is non-empty", expected.length, 0);
      archiveActionMock.mockResolvedValue({ ok: false, code });
      render(<ShowRowActions row={row({ slug: "f" })} />);
      openMenu("f");
      enterConfirm("f");
      fireEvent.click(q("row-actions-archive-go-f")!);
      const region = await waitFor(() => {
        const el = q<HTMLElement>("row-actions-archive-error-f");
        expect(el).not.toBeNull();
        return el!;
      });
      expect(region.getAttribute("role")).toBe("alert");
      expect(region.textContent ?? "").toContain(expected);
      // Not empty, and never the raw sentinel/code itself (invariant 5).
      expect((region.textContent ?? "").trim().length).toBeGreaterThan(0);
      expect(document.body.textContent ?? "").not.toContain(code);
      // …and not another branch's copy: a stale region is its own bug.
      for (const other of cases.filter((c) => c.code !== code)) {
        expect(region.textContent ?? "").not.toContain(other.expected);
      }
      // The menu stays open so the admin can read the refusal, and nothing
      // was optimistically moved.
      expect(q("row-actions-menu-f")).not.toBeNull();
      expect(refreshMock).not.toHaveBeenCalled();
    },
  );
});

describe("Archive — transition inventory rows owned by this task (§3.5)", () => {
  test("open → confirm-step and confirm-step → open are instant (no animation wrapper)", () => {
    render(<ShowRowActions row={row({ slug: "t" })} />);
    openMenu("t");
    const confirm = enterConfirm("t");
    const classes = confirm.className.split(/\s+/);
    premiseHolds("the confirm block rendered with classes to inspect", classes.length > 0);
    expect(classes.filter((c) => c.startsWith("transition-") || c.startsWith("animate-"))).toEqual(
      [],
    );
    fireEvent.click(q("row-actions-archive-cancel-t")!);
    // Synchronously back, in the same tick: nothing awaits an exit.
    expect(q("row-actions-archive-confirm-t")).toBeNull();
    expect(q("row-action-archive-t")).not.toBeNull();
  });
});

// ── impeccable critique P0 (keyboard reachability of the confirm) ────────────
// A confirm step is not a menu. Its Cancel/Confirm pair are plain buttons, not
// role="menuitem", so the menu's own key grammar strands a keyboard user on the
// safe control: Arrow keys jump back to the menu items and Tab closes the whole
// surface, leaving "Confirm archive" unreachable (WCAG 2.1.1). Found by the
// impeccable critique on the shipped implementation; these pin the repair.
describe("Archive confirm — the menu grammar yields to the sub-panel", () => {
  test("the confirm-go is in the tab order and enabled, so Tab can reach it", () => {
    render(<ShowRowActions row={row({ slug: "kb" })} />);
    openMenu("kb");
    enterConfirm("kb");
    const go = q<HTMLButtonElement>("row-actions-archive-go-kb")!;
    const cancel = q<HTMLButtonElement>("row-actions-archive-cancel-kb")!;
    // PREMISE: focus starts on the SAFE control, which is the whole reason the
    // other control has to be reachable from there.
    premiseHolds("focus starts on Cancel", document.activeElement === cancel);
    for (const el of [go, cancel]) {
      expect(el.getAttribute("tabindex")).toBeNull(); // never -1
      expect(el.disabled).toBe(false);
      expect(el.getAttribute("aria-hidden")).toBeNull();
    }
  });

  test("Tab does NOT close the menu while the confirm owns the surface", () => {
    render(<ShowRowActions row={row({ slug: "tab" })} />);
    const menu = openMenu("tab");
    enterConfirm("tab");
    fireEvent.keyDown(menu, { key: "Tab" });
    // Before the repair this closed the entire menu, so Tab could never move
    // from Cancel to Confirm.
    expect(q("row-actions-archive-confirm-tab")).not.toBeNull();
    expect(q("row-actions-menu-tab")).not.toBeNull();
  });

  test("Arrow keys do NOT yank focus back into the menu items", () => {
    render(<ShowRowActions row={row({ slug: "arr" })} />);
    const menu = openMenu("arr");
    enterConfirm("arr");
    const cancel = q("row-actions-archive-cancel-arr");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(cancel);
  });

  test("Escape cancels ONE level: back to the menu, not out of it", () => {
    render(<ShowRowActions row={row({ slug: "esc" })} />);
    const menu = openMenu("esc");
    enterConfirm("esc");
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(q("row-actions-archive-confirm-esc")).toBeNull();
    expect(q("row-actions-menu-esc")).not.toBeNull();
    expect(document.activeElement).toBe(q("row-action-archive-esc"));
    expect(archiveActionMock).not.toHaveBeenCalled();
  });
});
