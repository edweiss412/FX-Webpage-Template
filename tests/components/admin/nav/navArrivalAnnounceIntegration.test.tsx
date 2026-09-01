// @vitest-environment jsdom
/**
 * Task 3 of the nav badge arrival announcement: the join, and the announcement.
 *
 * Renders AdminNav inside the layout's own AdminAnnounceProvider, with REAL
 * hooks and controlled deferred promises, and asserts through the provider's
 * region. No spy on announce, no spy on navBadgeArrivalAnnouncement: the
 * expected text is stated from the counts the test resolved the promises with,
 * so the assertion fails if the join reads the wrong half or the copy builder
 * is bypassed.
 *
 * Also carries the transition audit (AC-20), which asserts the SOURCE shape the
 * behavioural cases cannot: that every conditional this arc adds under
 * components/admin/nav/ is accounted for in spec §3.8's inventory as instant.
 */
import "@testing-library/jest-dom/vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminAnnounceProvider } from "@/components/admin/AdminAnnounceProvider";
import { AdminNav } from "@/components/admin/nav/AdminNav";
import { premiseHolds } from "@/tests/_shared/premise";
import { stripCommentsForFile } from "@/tests/_shared/stripComments";
import type { BellCountResult } from "@/lib/admin/bellFeed";
import type { NeedsAttentionCountResult } from "@/lib/admin/needsAttentionCount";

let mockPathname = "/admin";
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));
vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({ removeChannel: vi.fn() }),
}));
vi.mock("@/lib/realtime/subscribeToBell", () => ({ subscribeToBell: vi.fn() }));
vi.mock("@/components/admin/BellPanel", () => ({
  BellPanel: ({ onOpened }: { onOpened: () => void }) => {
    onOpened();
    return <div data-testid="bell-panel-stub" />;
  },
}));

const COUNT_ENDPOINT = "/api/admin/alerts/bell/count";
const ATTENTION_ENDPOINT = "/api/admin/needs-attention-count";
const fetchSpy = vi.fn();

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function renderNav(props: {
  bellCountPromise?: Promise<BellCountResult> | null;
  attentionCountPromise?: Promise<NeedsAttentionCountResult> | null;
  bellCount?: BellCountResult | null;
  initialBadgeCount?: NeedsAttentionCountResult | null;
}) {
  return render(
    <AdminAnnounceProvider testId="admin-undo-status" label="Status updates">
      <AdminNav email="doug@example.com" viewerIsDeveloper={false} {...props} />
    </AdminAnnounceProvider>,
  );
}

/** Every entry the provider's region currently holds, in order. */
function entries(): string[] {
  const region = screen.getByTestId("admin-undo-status");
  return Array.from(region.querySelectorAll("span"))
    .map((el) => el.textContent?.trim() ?? "")
    .filter((text) => text.length > 0);
}

beforeEach(() => {
  mockPathname = "/admin";
  fetchSpy.mockReset();
  fetchSpy.mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the join announces once, when both halves have arrived", () => {
  it("AC-1: both counts nonzero, one entry, bell sentence first", async () => {
    const bell = deferred<BellCountResult>();
    const attention = deferred<NeedsAttentionCountResult>();
    renderNav({ bellCountPromise: bell.promise, attentionCountPromise: attention.promise });

    expect(entries()).toEqual([]);

    await act(async () => {
      bell.resolve({ kind: "ok", count: 3 });
      attention.resolve({ kind: "ok", count: 2 });
      await Promise.all([bell.promise, attention.promise]);
    });

    await waitFor(() => expect(entries()).toHaveLength(1));
    expect(entries()[0]).toBe("3 unseen notifications. 2 items need attention.");
  });

  it("AC-2: a zero half contributes no sentence", async () => {
    const bell = deferred<BellCountResult>();
    const attention = deferred<NeedsAttentionCountResult>();
    renderNav({ bellCountPromise: bell.promise, attentionCountPromise: attention.promise });

    await act(async () => {
      bell.resolve({ kind: "ok", count: 3 });
      attention.resolve({ kind: "ok", count: 0 });
      await Promise.all([bell.promise, attention.promise]);
    });

    await waitFor(() => expect(entries()).toHaveLength(1));
    expect(entries()[0]).toBe("3 unseen notifications.");
  });

  it("AC-3: both zero announces nothing at all", async () => {
    const bell = deferred<BellCountResult>();
    const attention = deferred<NeedsAttentionCountResult>();
    renderNav({ bellCountPromise: bell.promise, attentionCountPromise: attention.promise });

    await act(async () => {
      bell.resolve({ kind: "ok", count: 0 });
      attention.resolve({ kind: "ok", count: 0 });
      await Promise.all([bell.promise, attention.promise]);
    });

    await waitFor(() => expect(screen.getByTestId("admin-undo-status")).toBeInTheDocument());
    expect(entries()).toEqual([]);
  });

  it("AC-4: a failed bell half does not suppress the good attention half", async () => {
    const bell = deferred<BellCountResult>();
    const attention = deferred<NeedsAttentionCountResult>();
    renderNav({ bellCountPromise: bell.promise, attentionCountPromise: attention.promise });

    await act(async () => {
      bell.resolve({ kind: "infra_error" });
      attention.resolve({ kind: "ok", count: 2 });
      await Promise.all([bell.promise, attention.promise]);
    });

    await waitFor(() => expect(entries()).toHaveLength(1));
    expect(entries()[0]).toBe("2 items need attention.");
  });

  it("AC-4: a failed ATTENTION half still settles, and the bell sentence survives", async () => {
    // The load-bearing direction. useNeedsAttentionBadge commits null on
    // failure, which is also its pending value, so ONLY the promise can settle
    // this half. An implementation that never latches attention failure stalls
    // here and announces nothing, while still passing the row above.
    const bell = deferred<BellCountResult>();
    const attention = deferred<NeedsAttentionCountResult>();
    renderNav({ bellCountPromise: bell.promise, attentionCountPromise: attention.promise });

    await act(async () => {
      bell.resolve({ kind: "ok", count: 4 });
      attention.resolve({ kind: "infra_error" });
      await Promise.all([bell.promise, attention.promise]);
    });

    await waitFor(() => expect(entries()).toHaveLength(1));
    expect(entries()[0]).toBe("4 unseen notifications.");
  });

  it("AC-5: both halves failed announces nothing", async () => {
    const bell = deferred<BellCountResult>();
    const attention = deferred<NeedsAttentionCountResult>();
    renderNav({ bellCountPromise: bell.promise, attentionCountPromise: attention.promise });

    await act(async () => {
      bell.resolve({ kind: "infra_error" });
      attention.resolve({ kind: "infra_error" });
      await Promise.all([bell.promise, attention.promise]);
    });

    await waitFor(() => expect(screen.getByTestId("admin-undo-status")).toBeInTheDocument());
    expect(entries()).toEqual([]);
  });
});

describe("the announcement is terminal, whatever resolved it", () => {
  it("AC-6: a later count change appends nothing", async () => {
    const bell = deferred<BellCountResult>();
    const attention = deferred<NeedsAttentionCountResult>();
    const { rerender } = renderNav({
      bellCountPromise: bell.promise,
      attentionCountPromise: attention.promise,
    });

    await act(async () => {
      bell.resolve({ kind: "ok", count: 3 });
      attention.resolve({ kind: "ok", count: 2 });
      await Promise.all([bell.promise, attention.promise]);
    });
    await waitFor(() => expect(entries()).toHaveLength(1));

    fetchSpy.mockImplementation((url: string) =>
      url === COUNT_ENDPOINT ? Promise.resolve(okResponse({ count: 9 })) : new Promise(() => {}),
    );
    mockPathname = "/admin/shows";
    await act(async () => {
      rerender(
        <AdminAnnounceProvider testId="admin-undo-status" label="Status updates">
          <AdminNav
            email="doug@example.com"
            viewerIsDeveloper={false}
            bellCountPromise={bell.promise}
            attentionCountPromise={attention.promise}
          />
        </AdminAnnounceProvider>,
      );
    });

    await waitFor(() => expect(entries()).toHaveLength(1));
    expect(entries()).toHaveLength(1);
  });

  it("AC-6: a SILENT resolution also consumes the once-per-mount allowance", async () => {
    // The mutant this exists for: spokenRef set only when message !== null.
    // It passes every silence case above, then announces the first time a count
    // goes positive. Spec §3.2: silence is a resolution, and the mount is
    // marked spoken.
    const bell = deferred<BellCountResult>();
    const attention = deferred<NeedsAttentionCountResult>();
    const { rerender } = renderNav({
      bellCountPromise: bell.promise,
      attentionCountPromise: attention.promise,
    });

    await act(async () => {
      bell.resolve({ kind: "ok", count: 0 });
      attention.resolve({ kind: "ok", count: 0 });
      await Promise.all([bell.promise, attention.promise]);
    });
    await waitFor(() => expect(screen.getByTestId("admin-undo-status")).toBeInTheDocument());
    premiseHolds("the (0,0) resolution announced nothing", entries().length === 0);

    fetchSpy.mockImplementation((url: string) =>
      url === COUNT_ENDPOINT ? Promise.resolve(okResponse({ count: 5 })) : new Promise(() => {}),
    );
    mockPathname = "/admin/shows";
    await act(async () => {
      rerender(
        <AdminAnnounceProvider testId="admin-undo-status" label="Status updates">
          <AdminNav
            email="doug@example.com"
            viewerIsDeveloper={false}
            bellCountPromise={bell.promise}
            attentionCountPromise={attention.promise}
          />
        </AdminAnnounceProvider>,
      );
    });

    await waitFor(() => expect(screen.getByTestId("admin-notif-badge")).toHaveTextContent("5"));
    expect(entries()).toEqual([]);
  });

  it("AC-6: a resolution that FAILED both halves is terminal too", async () => {
    // The same terminality through the failure path rather than the zero path,
    // so the mutant cannot survive on one branch.
    const bell = deferred<BellCountResult>();
    const attention = deferred<NeedsAttentionCountResult>();
    const { rerender } = renderNav({
      bellCountPromise: bell.promise,
      attentionCountPromise: attention.promise,
    });

    await act(async () => {
      bell.resolve({ kind: "infra_error" });
      attention.resolve({ kind: "infra_error" });
      await Promise.all([bell.promise, attention.promise]);
    });
    premiseHolds("the failed resolution announced nothing", entries().length === 0);

    fetchSpy.mockImplementation((url: string) =>
      url === COUNT_ENDPOINT ? Promise.resolve(okResponse({ count: 4 })) : new Promise(() => {}),
    );
    mockPathname = "/admin/shows";
    await act(async () => {
      rerender(
        <AdminAnnounceProvider testId="admin-undo-status" label="Status updates">
          <AdminNav
            email="doug@example.com"
            viewerIsDeveloper={false}
            bellCountPromise={bell.promise}
            attentionCountPromise={attention.promise}
          />
        </AdminAnnounceProvider>,
      );
    });

    await waitFor(() => expect(entries()).toHaveLength(0));
    expect(entries()).toEqual([]);
  });
});

describe("settle ordering", () => {
  it("bell first, then attention: one entry, no early partial", async () => {
    const bell = deferred<BellCountResult>();
    const attention = deferred<NeedsAttentionCountResult>();
    renderNav({ bellCountPromise: bell.promise, attentionCountPromise: attention.promise });

    await act(async () => {
      bell.resolve({ kind: "ok", count: 3 });
      await bell.promise;
    });
    // The bell alone must NOT speak: the join waits for both halves.
    expect(entries()).toEqual([]);

    await act(async () => {
      attention.resolve({ kind: "ok", count: 2 });
      await attention.promise;
    });
    await waitFor(() => expect(entries()).toHaveLength(1));
    expect(entries()[0]).toBe("3 unseen notifications. 2 items need attention.");
  });

  it("attention first, then bell: one entry, no early partial", async () => {
    const bell = deferred<BellCountResult>();
    const attention = deferred<NeedsAttentionCountResult>();
    renderNav({ bellCountPromise: bell.promise, attentionCountPromise: attention.promise });

    await act(async () => {
      attention.resolve({ kind: "ok", count: 2 });
      await attention.promise;
    });
    expect(entries()).toEqual([]);

    await act(async () => {
      bell.resolve({ kind: "ok", count: 3 });
      await bell.promise;
    });
    await waitFor(() => expect(entries()).toHaveLength(1));
    expect(entries()[0]).toBe("3 unseen notifications. 2 items need attention.");
  });

  it("waits for the attention COMMIT, not merely a successful promise", async () => {
    // The batching mutant: a parent that latches attention whenever its promise
    // resolves, kind:"ok" included. Round 1 of the whole-diff review showed the
    // first version of this case could not tell them apart, because it left the
    // bell pending, and BOTH implementations are silent while the bell is
    // pending.
    //
    // What discriminates: settle the BELL first, then resolve the attention
    // promise successfully while its hook is prevented from committing. The
    // hook is claimed by a pathname change, so the resolving seed demotes to a
    // fetch that never settles here (useNeedsAttentionBadge's demote path), and
    // badgeCount stays null. A parent latching on promise success would now
    // have both halves latched and would announce; the correct parent stays
    // silent because attention never committed.
    const bell = deferred<BellCountResult>();
    const attention = deferred<NeedsAttentionCountResult>();
    const { rerender } = renderNav({
      bellCountPromise: bell.promise,
      attentionCountPromise: attention.promise,
    });

    await act(async () => {
      bell.resolve({ kind: "ok", count: 4 });
      await bell.promise;
    });
    await waitFor(() => expect(screen.getByTestId("admin-notif-badge")).toHaveTextContent("4"));

    // Claim the attention hook so its seed demotes instead of painting.
    mockPathname = "/admin/shows";
    await act(async () => {
      rerender(
        <AdminAnnounceProvider testId="admin-undo-status" label="Status updates">
          <AdminNav
            email="doug@example.com"
            viewerIsDeveloper={false}
            bellCountPromise={bell.promise}
            attentionCountPromise={attention.promise}
          />
        </AdminAnnounceProvider>,
      );
    });
    await act(async () => {
      attention.resolve({ kind: "ok", count: 3 });
      await attention.promise;
    });

    // The promise succeeded. The hook did not commit, so the attention tab
    // still carries the count-less name. Premise, so this cannot pass by the
    // attention half having quietly committed after all.
    premiseHolds(
      "the attention promise resolved ok but its hook did not commit",
      screen.getByTestId("admin-bottom-tab-attention").getAttribute("aria-label") ===
        "Needs attention",
    );
    expect(entries()).toEqual([]);
  });
});

describe("settlement is a latch, not a derived predicate", () => {
  it("a failed refetch after the attention half arrived does not un-settle it", async () => {
    // §3.2 says settlement is set once and never cleared. A DERIVED predicate is
    // not that: badgeCount returns to null on a failed read
    // (useNeedsAttentionBadge.ts:88), so a half that had already arrived would
    // un-settle, and the join would then wait forever on a half that already
    // answered. The mount would go permanently silent.
    //
    // The staging: attention arrives at 3. A pathname change refetches BOTH
    // hooks (it claims both, which is why the endpoints are mocked apart). The
    // attention fetch FAILS and nulls its count; the bell's fetch succeeds and
    // settles the bell at 4. So the bell settles strictly after attention
    // un-counts, which is the ordering that separates a latch from a predicate.
    //
    // With the latch: attention stays settled, the join completes, and the
    // sentence carries only the bell, because the VALUE is read live and
    // attention no longer has one. Without it: silence forever.
    const bell = deferred<BellCountResult>();
    const attention = deferred<NeedsAttentionCountResult>();
    const { rerender } = renderNav({
      bellCountPromise: bell.promise,
      attentionCountPromise: attention.promise,
    });

    await act(async () => {
      attention.resolve({ kind: "ok", count: 3 });
      await attention.promise;
    });
    await waitFor(() =>
      expect(screen.getByTestId("admin-bottom-tab-attention")).toHaveAttribute(
        "aria-label",
        "Needs attention, 3 items",
      ),
    );
    premiseHolds(
      "the attention half arrived before anything was announced",
      entries().length === 0,
    );

    fetchSpy.mockImplementation((url: string) => {
      if (url === ATTENTION_ENDPOINT) return Promise.reject(new Error("boom"));
      if (url === COUNT_ENDPOINT) return Promise.resolve(okResponse({ count: 4 }));
      return new Promise(() => {});
    });
    mockPathname = "/admin/shows";
    await act(async () => {
      rerender(
        <AdminAnnounceProvider testId="admin-undo-status" label="Status updates">
          <AdminNav
            email="doug@example.com"
            viewerIsDeveloper={false}
            bellCountPromise={bell.promise}
            attentionCountPromise={attention.promise}
          />
        </AdminAnnounceProvider>,
      );
    });

    // The attention count really was nulled: its name is count-less again.
    await waitFor(() =>
      expect(screen.getByTestId("admin-bottom-tab-attention")).toHaveAttribute(
        "aria-label",
        "Needs attention",
      ),
    );

    await waitFor(() => expect(entries()).toHaveLength(1));
    expect(entries()[0]).toBe("4 unseen notifications.");
  });
});

describe("compound transitions (spec §3.8)", () => {
  it("AC-11: the panel opens while the bell half is still pending", async () => {
    const bell = deferred<BellCountResult>();
    const attention = deferred<NeedsAttentionCountResult>();
    renderNav({ bellCountPromise: bell.promise, attentionCountPromise: attention.promise });

    await act(async () => {
      fireEvent.click(screen.getByTestId("admin-notif-bell"));
    });
    await act(async () => {
      attention.resolve({ kind: "ok", count: 2 });
      await attention.promise;
    });

    // zeroNow committed 0, so the bell contributes nothing while it stays 0.
    await waitFor(() => expect(entries()).toHaveLength(1));
    expect(entries()[0]).toBe("2 items need attention.");
  });

  it("AC-11: the panel opens AFTER the bell settles, before attention does", async () => {
    // The second of AC-11's two required timings.
    const bell = deferred<BellCountResult>();
    const attention = deferred<NeedsAttentionCountResult>();
    renderNav({ bellCountPromise: bell.promise, attentionCountPromise: attention.promise });

    await act(async () => {
      bell.resolve({ kind: "ok", count: 4 });
      await bell.promise;
    });
    await waitFor(() => expect(screen.getByTestId("admin-notif-badge")).toHaveTextContent("4"));

    await act(async () => {
      fireEvent.click(screen.getByTestId("admin-notif-bell"));
    });
    await act(async () => {
      attention.resolve({ kind: "ok", count: 3 });
      await attention.promise;
    });

    await waitFor(() => expect(entries()).toHaveLength(1));
    expect(entries()[0]).toBe("3 items need attention.");
  });

  it("AC-13: the bell degrades between settling and announcing", async () => {
    // The third compound transition. The count is retained but the degraded
    // branch displays no number, so the selector returns null and the bell
    // says nothing.
    const bell = deferred<BellCountResult>();
    const attention = deferred<NeedsAttentionCountResult>();
    const { rerender } = renderNav({
      bellCountPromise: bell.promise,
      attentionCountPromise: attention.promise,
    });

    await act(async () => {
      bell.resolve({ kind: "ok", count: 4 });
      await bell.promise;
    });
    await waitFor(() => expect(screen.getByTestId("admin-notif-badge")).toHaveTextContent("4"));

    // Degrade through the PROP, not a pathname change. A pathname change also
    // claims the attention hook, whose seed then demotes to a fetch that never
    // resolves here, so the attention half would never commit and the case
    // would pass for the wrong reason. An infra_error prop marks degraded and
    // leaves `count` untouched, which is exactly the retained-count-under-
    // degraded state this case is about.
    await act(async () => {
      rerender(
        <AdminAnnounceProvider testId="admin-undo-status" label="Status updates">
          <AdminNav
            email="doug@example.com"
            viewerIsDeveloper={false}
            bellCount={{ kind: "infra_error" }}
            bellCountPromise={bell.promise}
            attentionCountPromise={attention.promise}
          />
        </AdminAnnounceProvider>,
      );
    });
    await waitFor(() =>
      expect(screen.getByTestId("admin-notif-bell-degraded")).toBeInTheDocument(),
    );

    await act(async () => {
      attention.resolve({ kind: "ok", count: 3 });
      await attention.promise;
    });

    await waitFor(() => expect(entries()).toHaveLength(1));
    expect(entries()[0]).toBe("3 items need attention.");
  });
});

describe("AC-16: a restoration before the announcement is spoken", () => {
  it("the demoted seed's refetch restores a count, and THAT count is announced", async () => {
    // Both halves pending, the operator opens the bell, zeroNow commits 0, the
    // original seed resolves into an already-claimed hook and demotes to a
    // fetch that commits 2, then attention settles at 3. The utterance carries
    // 2, matching the badge and the accessible name at that instant.
    const bell = deferred<BellCountResult>();
    const attention = deferred<NeedsAttentionCountResult>();
    renderNav({ bellCountPromise: bell.promise, attentionCountPromise: attention.promise });

    fetchSpy.mockImplementation((url: string) =>
      url === COUNT_ENDPOINT ? Promise.resolve(okResponse({ count: 2 })) : new Promise(() => {}),
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("admin-notif-bell"));
    });
    await act(async () => {
      bell.resolve({ kind: "ok", count: 9 });
      await bell.promise;
    });
    await waitFor(() => expect(screen.getByTestId("admin-notif-badge")).toHaveTextContent("2"));

    await act(async () => {
      attention.resolve({ kind: "ok", count: 3 });
      await attention.promise;
    });

    await waitFor(() => expect(entries()).toHaveLength(1));
    // Not 9 (the seed the hook refused) and not 0 (the zero it passed through).
    expect(entries()[0]).toBe("2 unseen notifications. 3 items need attention.");
  });

  it("the reverse ordering: attention settles BEFORE the restoration, so no bell sentence", async () => {
    // Pins that the outcome follows the value at announce time rather than the
    // interaction: same gestures, different order, different correct answer.
    const bell = deferred<BellCountResult>();
    const attention = deferred<NeedsAttentionCountResult>();
    renderNav({ bellCountPromise: bell.promise, attentionCountPromise: attention.promise });

    await act(async () => {
      fireEvent.click(screen.getByTestId("admin-notif-bell"));
    });
    await act(async () => {
      attention.resolve({ kind: "ok", count: 3 });
      await attention.promise;
    });

    await waitFor(() => expect(entries()).toHaveLength(1));
    expect(entries()[0]).toBe("3 items need attention.");
  });

  it("the panel's own onOpened refetch is the second restoration route", async () => {
    // The route through NotifBell.tsx's onOpened={refetch}, isolated from the
    // demoted-seed route above: no seed is in flight here at all, so only the
    // panel's own refetch can restore the count.
    const attention = deferred<NeedsAttentionCountResult>();
    fetchSpy.mockImplementation((url: string) =>
      url === COUNT_ENDPOINT ? Promise.resolve(okResponse({ count: 6 })) : new Promise(() => {}),
    );
    renderNav({
      bellCount: { kind: "ok", count: 4 },
      attentionCountPromise: attention.promise,
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("admin-notif-bell"));
    });
    await waitFor(() => expect(screen.getByTestId("admin-notif-badge")).toHaveTextContent("6"));

    await act(async () => {
      attention.resolve({ kind: "ok", count: 3 });
      await attention.promise;
    });

    await waitFor(() => expect(entries()).toHaveLength(1));
    expect(entries()[0]).toBe("6 unseen notifications. 3 items need attention.");
  });
});

describe("AC-17: degraded clearing before the announcement", () => {
  it("the restored count is spoken once degraded clears", async () => {
    // Degraded clears on any ok result (useBellBadge.ts:112). The lever here is
    // the panel's own refetch, NOT a pathname change: a pathname change claims
    // BOTH hooks, so the attention seed would demote to a fetch that never
    // settles in this harness and the case would fail for a reason unrelated to
    // degraded. Opening the panel zeroes the count first, so a bell sentence
    // here can only come from the refetch's committed value.
    const attention = deferred<NeedsAttentionCountResult>();
    fetchSpy.mockImplementation((url: string) =>
      url === COUNT_ENDPOINT ? Promise.resolve(okResponse({ count: 5 })) : new Promise(() => {}),
    );
    renderNav({
      bellCount: { kind: "infra_error" },
      attentionCountPromise: attention.promise,
    });
    premiseHolds(
      "the bell started in its degraded branch",
      screen.queryByTestId("admin-notif-bell-degraded") !== null,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("admin-notif-bell-degraded"));
    });
    await waitFor(() => expect(screen.getByTestId("admin-notif-badge")).toHaveTextContent("5"));

    await act(async () => {
      attention.resolve({ kind: "ok", count: 3 });
      await attention.promise;
    });

    await waitFor(() => expect(entries()).toHaveLength(1));
    // A degraded LATCH would have suppressed the bell sentence forever.
    expect(entries()[0]).toBe("5 unseen notifications. 3 items need attention.");
  });
});

describe("AC-19: StrictMode announces exactly once", () => {
  it("effect replay does not double-announce", async () => {
    // React 19.2.4 replays mount effects without remounting the component or
    // recreating refs, so the spoken ref set by the first pass is still set on
    // the replay. A latch placed in the wrong scope would speak twice here.
    const bell = deferred<BellCountResult>();
    const attention = deferred<NeedsAttentionCountResult>();
    render(
      <StrictMode>
        <AdminAnnounceProvider testId="admin-undo-status" label="Status updates">
          <AdminNav
            email="doug@example.com"
            viewerIsDeveloper={false}
            bellCountPromise={bell.promise}
            attentionCountPromise={attention.promise}
          />
        </AdminAnnounceProvider>
      </StrictMode>,
    );

    await act(async () => {
      bell.resolve({ kind: "ok", count: 3 });
      attention.resolve({ kind: "ok", count: 2 });
      await Promise.all([bell.promise, attention.promise]);
    });

    await waitFor(() => expect(entries()).toHaveLength(1));
    expect(entries()).toEqual(["3 unseen notifications. 2 items need attention."]);
  });
});

describe("AC-12: the onboarding chrome announces nothing", () => {
  it("the onboarding branch renders OnboardingTopBar and no AdminNav", () => {
    // A source assertion, not a render: the onboarding branch is a server
    // component branch. Comments are stripped first because that file's prose
    // names both identifiers.
    const path = "app/admin/layout.tsx";
    const src = stripCommentsForFile(readFileSync(join(process.cwd(), path), "utf8"), path);
    const start = src.indexOf("if (inOnboarding) {");
    expect(start, "the onboarding branch should exist").toBeGreaterThan(-1);
    const branch = src.slice(start, src.indexOf("\n  }", start));

    expect(branch).toContain("OnboardingTopBar");
    expect(branch).not.toContain("<AdminNav");
  });
});

describe("AC-18: the attention name and the attention sentence carry the same number", () => {
  it("neither shows the 9+ pill cap at a count above nine", async () => {
    const attention = deferred<NeedsAttentionCountResult>();
    renderNav({ attentionCountPromise: attention.promise, bellCount: null });

    await act(async () => {
      attention.resolve({ kind: "ok", count: 12 });
      await attention.promise;
    });

    await waitFor(() => expect(entries()).toHaveLength(1));

    // Two reads, deliberately two places. Reading both off one container would
    // let a single shared string satisfy the pair and prove nothing about the
    // drift §3.11 names. The region text is taken after removing the nav
    // subtree from a clone, so the nav cannot supply the label the region is
    // being scanned for.
    const link = screen.getByTestId("admin-bottom-tab-attention");
    expect(link).toHaveAttribute("aria-label", "Needs attention, 12 items");
    expect(link.getAttribute("aria-label")).not.toContain("9+");

    const region = screen.getByTestId("admin-undo-status").cloneNode(true) as HTMLElement;
    region.querySelectorAll("nav").forEach((el) => el.remove());
    expect(region.textContent).toContain("12 items need attention.");
    expect(region.textContent).not.toContain("9+");
  });
});

describe("AC-20: the transition audit", () => {
  it("every conditional this arc adds is accounted for as instant", () => {
    // Derived from the merge-base diff, not hand-listed: a site added later is
    // in scope by default rather than outside a list nobody updated.
    const base = execFileSync("git", ["merge-base", "origin/main", "HEAD"], {
      encoding: "utf8",
    }).trim();
    const diff = execFileSync(
      "git",
      ["diff", `${base}...HEAD`, "--unified=0", "--", "components/admin/nav/"],
      { encoding: "utf8" },
    );

    // File-scoped, because the inventory is about EFFECT guards in the two
    // components. The first version of this audit counted every `if (...)
    // return` in the added lines, which swept in navArrivalAnnounce.ts's pure
    // selector guards and reached seven, so deleting the real effect guards
    // could leave it green. The whole-diff review probed exactly that.
    const perFile = new Map<string, string[]>();
    let current: string | null = null;
    for (const line of diff.split("\n")) {
      const header = /^\+\+\+ b\/(.+)$/.exec(line);
      if (header) {
        current = header[1]!;
        perFile.set(current, []);
        continue;
      }
      if (current && line.startsWith("+") && !line.startsWith("+++")) {
        perFile.get(current)!.push(line.slice(1));
      }
    }

    const addedEverywhere = [...perFile.values()].flat();
    premiseHolds("the diff carried added lines under components/admin/nav/", addedEverywhere.length > 0);

    // No animation surface is added, anywhere, and the audit is what keeps it so.
    expect(
      addedEverywhere.filter((l) => /\bAnimatePresence\b|\bexit=|\binitial=|\banimate=/.test(l)),
    ).toEqual([]);

    // No conditional RENDER is added: not a ternary render, not an `&&` render.
    // The one JSX conditional this arc touches, NotifBell's aria-label ternary,
    // is REMOVED rather than added, so it leaves the added set.
    const jsxConditionals = addedEverywhere.filter(
      (l) => /^\s*\{.*\?.*:/.test(l) || /^\s*\{[^}]*&&\s*</.test(l),
    );
    expect(jsxConditionals).toEqual([]);

    // The inventory: exactly two effect guards, one per component, and nothing
    // else. Asserted as EQUALITY per file, so a missing guard and an unlisted
    // extra both fail, and the pure module contributes none.
    // An EFFECT guard returns bare (`return;`); a pure function's guard returns
    // a VALUE (`return null;`). That is the discriminator, and it is why the
    // pure selector module contributes nothing here without being special-cased
    // by name. An earlier version matched any `if (...) return`, counted the
    // selector's two guards, reached seven, and could have stayed green with
    // the real effect guards deleted.
    const effectGuards = (file: string) =>
      (perFile.get(file) ?? []).filter((l) => /^\s*if \(.*\)\s*return\s*;\s*$/.test(l));

    // The inventory, named guard by guard so the numbers are checkable rather
    // than magic. All five are instant: none renders, none animates, and the
    // only DOM any of them reaches is an append to an sr-only region.
    //
    //   AdminNav (3): the attention-promise subscription's `!attentionCountPromise`
    //     bail; the announce effect's `spokenRef.current` terminality guard; and
    //     its `!bellSettled || !attentionSettled` both-halves guard.
    //   NotifBell (2): the report effect's `!onBellState` bail (the four existing
    //     call sites pass none) and its `lastReport.current === key` dedup.
    const inventory: Array<[string, number]> = [
      ["components/admin/nav/AdminNav.tsx", 3],
      ["components/admin/nav/NotifBell.tsx", 2],
    ];
    const observed = inventory.map(([file]) => [file, effectGuards(file).length] as const);
    premiseHolds(
      "the audit enumerated the announce effect",
      effectGuards("components/admin/nav/AdminNav.tsx").length > 0,
    );
    expect(Object.fromEntries(observed)).toEqual(Object.fromEntries(inventory));

    // The pure selector module contributes NO effect guard, by the bare-return
    // rule rather than by being excluded by name, so a future effect added
    // there would still be caught.
    expect(effectGuards("components/admin/nav/navArrivalAnnounce.ts")).toEqual([]);

    // Totality: every added bare-return guard in the whole diff is inside the
    // inventory, so none is unclassified in a file the table does not name.
    const inventoryTotal = inventory.reduce((sum, [, n]) => sum + n, 0);
    const allEffectGuards = [...perFile.keys()].flatMap((f) => effectGuards(f));
    expect(allEffectGuards).toHaveLength(inventoryTotal);
  });
});
