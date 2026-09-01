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
import { readFileSync } from "node:fs";
import ts from "typescript";
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

/**
 * Every prop is passed EXPLICITLY with a default rather than spread, because the
 * project compiles with `exactOptionalPropertyTypes`: spreading an object whose
 * optional keys may be `undefined` is not assignable to a prop that accepts
 * `X | null` but not `undefined`.
 *
 * `initialBadgeCount` is `number | null` on AdminNav (`AdminNav.tsx:73`), NOT the
 * discriminated result its bell counterpart takes. No case passes one, so only
 * the compiler reading this signature could see the mismatch.
 */
function renderNav({
  bellCountPromise = null,
  attentionCountPromise = null,
  bellCount = null,
  initialBadgeCount = null,
}: {
  bellCountPromise?: Promise<BellCountResult> | null;
  attentionCountPromise?: Promise<NeedsAttentionCountResult> | null;
  bellCount?: BellCountResult | null;
  initialBadgeCount?: number | null;
}) {
  return render(
    <AdminAnnounceProvider testId="admin-undo-status" label="Status updates">
      <AdminNav
        email="doug@example.com"
        viewerIsDeveloper={false}
        bellCount={bellCount}
        bellCountPromise={bellCountPromise}
        initialBadgeCount={initialBadgeCount}
        attentionCountPromise={attentionCountPromise}
      />
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

    // BOTH endpoints move, per the plan's row. An earlier version resolved only
    // the bell and left attention pending, and its `waitFor(length === 1)` was
    // already true before the rerender, so it also passed if no later count
    // committed at all. The premise below is what makes the assertion mean
    // something: a change really did land, and still nothing was appended.
    fetchSpy.mockImplementation((url: string) => {
      if (url === COUNT_ENDPOINT) return Promise.resolve(okResponse({ count: 9 }));
      if (url === ATTENTION_ENDPOINT) return Promise.resolve(okResponse({ count: 7 }));
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

    await waitFor(() => expect(screen.getByTestId("admin-notif-badge")).toHaveTextContent("9"));
    await waitFor(() =>
      expect(screen.getByTestId("admin-bottom-tab-attention")).toHaveAttribute(
        "aria-label",
        "Needs attention, 7 items",
      ),
    );
    premiseHolds(
      "both counts really moved after the announcement",
      screen.getByTestId("admin-notif-badge").textContent === "9",
    );

    // Still exactly the original entry, unchanged.
    expect(entries()).toEqual(["3 unseen notifications. 2 items need attention."]);
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

    // Prove the restoration actually landed: without this the case asserts an
    // already-empty region and passes even if nothing ever committed.
    await waitFor(() => expect(screen.getByTestId("admin-notif-badge")).toHaveTextContent("4"));
    premiseHolds(
      "a positive count reached the bell after the silent resolution",
      screen.getByTestId("admin-notif-badge").textContent === "4",
    );
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
    // BOTH reads resolve, per the plan's row. An earlier version left the bell
    // promise pending forever, so it never exercised a bell seed arriving into
    // an already-zeroed hook, which is the interesting half of this case.
    await act(async () => {
      bell.resolve({ kind: "ok", count: 5 });
      attention.resolve({ kind: "ok", count: 2 });
      await Promise.all([bell.promise, attention.promise]);
    });

    // zeroNow claimed the hook, so the late seed demotes to a fetch rather than
    // painting 5, and the bell contributes nothing while it stays 0.
    premiseHolds(
      "the zeroed bell did not paint the late seed",
      screen.queryByTestId("admin-notif-badge") === null,
    );
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
  it("every conditional render and early return in the touched components is instant", () => {
    // DERIVED FROM THE TREE, not from git history. The first version shelled out
    // to `git merge-base origin/main HEAD` and diffed, which is non-portable by
    // construction: on a push to main those are the same commit, so the derived
    // set is empty and the premise fails, and any later branch that does not
    // touch these files fails it too. It went red in CI while passing locally.
    //
    // It also matched single diff LINES with regexes, so block-form guards,
    // `return null`, and multiline ternary or `&&` renders were invisible.
    // Both defects are fixed the same way: walk the AST of the whole file and
    // pin the FULL population. A membership change then surfaces as an ordinary
    // diff to this table rather than as a silently-empty derivation.
    const files = [
      "components/admin/nav/AdminNav.tsx",
      "components/admin/nav/NotifBell.tsx",
      "components/admin/nav/navArrivalAnnounce.ts",
    ];

    const census: Record<string, { jsxConditionals: number; earlyReturns: number }> = {};
    const animationProps: string[] = [];

    for (const rel of files) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      let jsxConditionals = 0;
      let earlyReturns = 0;

      const visit = (node: ts.Node): void => {
        // A conditional RENDER: a ternary or `&&` whose branches produce JSX,
        // counted wherever it appears rather than only as a JSX child. NotifBell
        // assigns one to a `const trigger` before rendering it, and a walk gated
        // on JsxExpression misses that entirely.
        //
        // Unwrap parentheses first. Every multiline JSX branch in these files is
        // written `? (\n  <span/>\n) : null`, so the branch is a
        // ParenthesizedExpression and a naive check sees no JSX at all. That is
        // exactly the multiline blindness the review probed.
        const unwrap = (n: ts.Node): ts.Node =>
          ts.isParenthesizedExpression(n) ? unwrap(n.expression) : n;
        const producesJsx = (n: ts.Node): boolean => {
          const u = unwrap(n);
          return ts.isJsxElement(u) || ts.isJsxSelfClosingElement(u) || ts.isJsxFragment(u);
        };
        if (
          ts.isConditionalExpression(node) &&
          (producesJsx(node.whenTrue) || producesJsx(node.whenFalse))
        ) {
          jsxConditionals += 1;
        }
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
          producesJsx(node.right)
        ) {
          jsxConditionals += 1;
        }
        // An early return under a condition, in BOTH spellings: `if (c) return;`
        // and `if (c) { return; }`, and whether it returns a value or not.
        if (ts.isIfStatement(node)) {
          const branch = node.thenStatement;
          const isReturn = (s: ts.Statement): boolean =>
            ts.isReturnStatement(s) ||
            (ts.isBlock(s) && s.statements.length > 0 && ts.isReturnStatement(s.statements[0]!));
          if (isReturn(branch)) earlyReturns += 1;
        }
        // The animation surface, which must stay empty.
        if (ts.isJsxAttribute(node)) {
          const name = node.name.getText();
          if (name === "exit" || name === "initial" || name === "animate") {
            animationProps.push(`${rel}: ${name}`);
          }
        }
        if (ts.isIdentifier(node) && node.text === "AnimatePresence") {
          animationProps.push(`${rel}: AnimatePresence`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
      census[rel] = { jsxConditionals, earlyReturns };
    }

    premiseHolds(
      "the walk parsed the components and found their conditionals",
      Object.values(census).some((c) => c.jsxConditionals + c.earlyReturns > 0),
    );

    // No animation surface anywhere in the three files. Spec §3.8's inventory is
    // three states whose every transition is instant, so this is the whole
    // animation claim and it is asserted as emptiness rather than as a count.
    expect(animationProps).toEqual([]);

    // The pinned population. Every entry is instant: the JSX conditionals are
    // text or badge swaps on already-mounted elements, and every early return is
    // an effect or selector guard that renders nothing. A change to any number
    // here is a real change to the component's branching and must be read
    // against §3.8 before this table is updated.
    // Each number was verified against the source, not copied from a first run.
    //
    //   AdminNav, 3 renders: the health indicator (`healthRollup ? ... : null`,
    //     AdminNav.tsx:269), the attention badge (`showBadge && ...`, :319), and
    //     the overflow tab (`overflow && ...`, :333). All three are pre-existing
    //     and this arc changes none of them. 3 early returns, all added here:
    //     the attention-promise subscription's bail and the announce effect's
    //     two guards.
    //   NotifBell, 3 renders: the degraded/normal trigger ternary assigned to
    //     `const trigger`, the badge pill, and the panel. 2 early returns, both
    //     added here: the report effect's `!onBellState` bail and its dedup.
    //   navArrivalAnnounce, 0 renders (no JSX) and 3 early returns: the pure
    //     selector's degraded and not-finite guards (:19, :20), plus the
    //     both-halves-present composition (:67). The third arrived when the
    //     array join was removed, and this census is what caught the change,
    //     which is the behaviour a pinned population is for.
    //
    // Every entry is instant: the renders are swaps on already-mounted chrome,
    // and no early return renders anything. §3.8's three states have no
    // animated transition, which the empty animation set above is the proof of.
    expect(census).toEqual({
      "components/admin/nav/AdminNav.tsx": { jsxConditionals: 3, earlyReturns: 3 },
      "components/admin/nav/NotifBell.tsx": { jsxConditionals: 3, earlyReturns: 2 },
      "components/admin/nav/navArrivalAnnounce.ts": { jsxConditionals: 0, earlyReturns: 3 },
    });
  });
});
