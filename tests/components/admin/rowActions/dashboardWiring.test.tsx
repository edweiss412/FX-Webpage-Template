// @vitest-environment jsdom
/**
 * admin-dashboard-row-actions Task 6 — the wiring (spec §1.6, AC-1).
 *
 * `Dashboard` is an async SERVER component and `ShowsTable` is `"use client"`,
 * so the existing `rowAction?: (row) => ReactNode` prop cannot carry this
 * feature: a render function is not serializable across that boundary. The
 * mechanism is a BOOLEAN — `showRowActions` — and ShowsTable mounts
 * ShowRowActions itself at the existing slot position.
 *
 * The archived bucket is out of scope (§1.4): it renders ArchivedShowRow, not
 * ShowsTable, and must expose no row-action trigger at all.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

// The row menu imports the archive server action; in jsdom the real module
// would pull next/cache + a server Supabase client at import time.
vi.mock("@/app/admin/show/[slug]/_actions/archive", () => ({
  archiveShowAction: vi.fn(),
}));

import { ShowsTable } from "@/components/admin/ShowsTable";
import type { ActiveShowRow } from "@/lib/admin/showDisplay";
import { premise } from "../../../_shared/premise";

afterEach(() => cleanup());
beforeEach(() => vi.clearAllMocks());

const now = new Date("2026-06-03T12:00:00.000Z");

function row(over: Partial<ActiveShowRow> & { slug: string }): ActiveShowRow {
  return {
    id: over.slug,
    title: `Title ${over.slug}`,
    showDateStart: "2026-06-01",
    showDateEnd: "2026-06-05",
    crewCount: 1,
    crew: [{ id: "c1", name: "Ada Lovelace" }],
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

const triggers = () =>
  Array.from(document.body.querySelectorAll('[data-testid^="row-actions-trigger-"]'));

describe("ShowsTable.showRowActions (spec §1.6)", () => {
  const rows = [row({ slug: "a" }), row({ slug: "b" })];

  test("off by default: today's dashboard render is unchanged", () => {
    render(<ShowsTable rows={rows} now={now} activeCount={rows.length} overflowCount={0} />);
    expect(triggers()).toHaveLength(0);
  });

  test("on: every row gains a trigger, inside the row's action slot", () => {
    // PREMISE: one row cannot distinguish "per row" from "once per table".
    premise("the fixture renders more than one row", rows.length, 1);
    render(
      <ShowsTable
        rows={rows}
        now={now}
        activeCount={rows.length}
        overflowCount={0}
        showRowActions
      />,
    );
    expect(triggers()).toHaveLength(rows.length);
    for (const r of rows) {
      const slot = document.body.querySelector(`[data-testid="shows-row-action-${r.slug}"]`);
      expect(slot, `row ${r.slug} renders its action slot`).not.toBeNull();
      expect(
        slot!.querySelector(`[data-testid="row-actions-trigger-${r.slug}"]`),
        `row ${r.slug}'s trigger sits in its OWN slot`,
      ).not.toBeNull();
    }
  });

  test("the trigger is a SIBLING of the row link, never nested inside the anchor", () => {
    render(
      <ShowsTable
        rows={rows}
        now={now}
        activeCount={rows.length}
        overflowCount={0}
        showRowActions
      />,
    );
    const link = document.body.querySelector('[data-testid="shows-table-row-a"]')!;
    const trigger = document.body.querySelector('[data-testid="row-actions-trigger-a"]')!;
    // An interactive control inside an <a> is invalid HTML and steals the row
    // link's own click target — the reason the slot exists at all.
    expect(link.contains(trigger)).toBe(false);
  });

  test("the boolean carries the feature — no render-function prop crosses the boundary", () => {
    // §1.6: `rowAction` stays for CLIENT callers and is untouched; a server
    // component cannot pass it. Both may not be needed at once.
    render(
      <ShowsTable
        rows={[row({ slug: "z" })]}
        now={now}
        activeCount={1}
        overflowCount={0}
        showRowActions
        rowAction={(r) => <span data-testid={`legacy-action-${r.slug}`}>legacy</span>}
      />,
    );
    // The legacy slot still renders its caller's node…
    expect(document.body.querySelector('[data-testid="legacy-action-z"]')).not.toBeNull();
    // …and the boolean still mounts the menu, in the same slot.
    expect(document.body.querySelector('[data-testid="row-actions-trigger-z"]')).not.toBeNull();
  });
});
