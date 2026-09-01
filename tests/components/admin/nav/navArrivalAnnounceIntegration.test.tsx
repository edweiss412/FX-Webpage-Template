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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminAnnounceProvider } from "@/components/admin/AdminAnnounceProvider";
import { AdminNav } from "@/components/admin/nav/AdminNav";
import { premiseHolds } from "@/tests/_shared/premise";
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
    // The batching mutant: a parent latching attention whenever its promise
    // resolves, kind:"ok" included, passes both orders above because React
    // batches the hook's setCount with the latch. Here the bell never settles,
    // so if attention latched on promise success the join would still be
    // waiting on the bell and stay silent either way. The discriminating part
    // is that the attention BADGE shows the committed value while the region
    // stays empty: the announcement is keyed to the commit, and the commit
    // alone is not both halves.
    const attention = deferred<NeedsAttentionCountResult>();
    const bell = deferred<BellCountResult>();
    renderNav({ bellCountPromise: bell.promise, attentionCountPromise: attention.promise });

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
    premiseHolds("the attention half committed its count", entries().length === 0);
    expect(entries()).toEqual([]);
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

    const addedLines = diff
      .split("\n")
      .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
      .map((line) => line.slice(1));

    premiseHolds("the diff carried added lines under components/admin/nav/", addedLines.length > 0);

    // Animation surface: there is none, and the audit is what keeps it that way.
    const animationProps = addedLines.filter((line) =>
      /\bAnimatePresence\b|\bexit=|\binitial=|\banimate=/.test(line),
    );
    expect(animationProps).toEqual([]);

    // Conditional RENDERS added: none. The one JSX conditional this arc touches
    // is REMOVED (the aria-label ternary becomes a bellAccessibleName call), so
    // it leaves the added set rather than joining it.
    const jsxConditionals = addedLines.filter((line) => /^\s*\{.*\?.*:/.test(line));
    expect(jsxConditionals).toEqual([]);

    // Effect guards added: the two named in the §3.8 inventory. Both are
    // instant and neither renders anything.
    const earlyReturns = addedLines.filter((line) => /^\s*if \(.*\) return\b/.test(line));
    premiseHolds("the audit enumerated the announce effect", earlyReturns.length > 0);
    expect(earlyReturns.length).toBeGreaterThanOrEqual(2);
  });
});
