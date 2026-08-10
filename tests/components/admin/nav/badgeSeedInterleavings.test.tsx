// @vitest-environment jsdom
/**
 * admin-nav-badge-streaming Task 2 (spec §3.2 interleaving table, AC-3/4/5).
 *
 * The layout stops awaiting the two badge loaders and hands each hook an
 * unresolved promise instead. That turns "the server prop is fresh at mount"
 * into "a value arrives at an arbitrary later instant", so every ordering of
 * (seed resolution) against (pathname refetch, zeroNow, a newer promise) needs
 * a pinned outcome. One named test per §3.2 / §3.7 row, both hooks where the
 * row applies.
 *
 * Concrete failure mode this file exists to catch: a LATE seed painting over a
 * NEWER value — the R4 probe's interleaving (seed issued while the count was 1,
 * a pathname refetch commits 2, the seed then resolves 1 and paints). Every
 * interleaving case therefore derives its expectation from the interleaving's
 * WINNING source, and asserts the losing seed value never appears in ANY
 * painted frame (not merely that it lost the final frame — a value that
 * flashes and is corrected is still a stale paint the user can see).
 */
import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useNeedsAttentionBadge } from "@/components/admin/nav/useNeedsAttentionBadge";
import { useBellBadge } from "@/components/admin/nav/useBellBadge";
import type { BellCountResult } from "@/lib/admin/bellFeed";
import type { NeedsAttentionCountResult } from "@/lib/admin/needsAttentionCount";

let mockPathname = "/admin";
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

const removeChannelMock = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({
    removeChannel: (...args: unknown[]) => removeChannelMock(...args),
  }),
}));

const subscribeToBellMock = vi.fn();
vi.mock("@/lib/realtime/subscribeToBell", () => ({
  subscribeToBell: (...args: unknown[]) => subscribeToBellMock(...args),
}));

const fetchSpy = vi.fn();

const COUNT_ENDPOINT = "/api/admin/alerts/bell/count";
const ATTENTION_ENDPOINT = "/api/admin/needs-attention-count";

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

/** A promise whose resolution instant the test owns. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Resolve a seed and let React flush the resulting commit. */
async function settle(fn?: () => void): Promise<void> {
  await act(async () => {
    fn?.();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockPathname = "/admin";
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  subscribeToBellMock.mockReset();
  removeChannelMock.mockReset();
  // Realtime's mount-once token POST stays pending — inert for these
  // prop/pathname/seed-scoped assertions (mirrors useBellBadge.test.tsx).
  fetchSpy.mockImplementation((url: string) => {
    if (url === "/api/admin/alerts/bell/token") return new Promise(() => {});
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
  subscribeToBellMock.mockReturnValue({ channel: {}, subscribed: new Promise(() => {}) });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Probes: record EVERY painted frame, so "never painted" is checkable across
// the whole timeline rather than only at the end.
// ---------------------------------------------------------------------------

type AttentionProbe = {
  paints: (number | null)[];
  rerender: (props: { seed: Promise<NeedsAttentionCountResult> | null }) => void;
};

function renderAttention(seed: Promise<NeedsAttentionCountResult> | null = null): AttentionProbe {
  const paints: (number | null)[] = [];
  function Probe({ seed: s }: { seed: Promise<NeedsAttentionCountResult> | null }) {
    const count = useNeedsAttentionBadge(null, s);
    paints.push(count);
    return null;
  }
  const view = render(<Probe seed={seed} />);
  return {
    paints,
    rerender: (props) => view.rerender(<Probe seed={props.seed} />),
  };
}

type BellFrame = { count: number | null; degraded: boolean };
type BellProbe = {
  paints: BellFrame[];
  zeroNow: () => void;
  refetch: () => void;
  rerender: (props: { seed: Promise<BellCountResult> | null }) => void;
};

function renderBell(seed: Promise<BellCountResult> | null = null): BellProbe {
  const paints: BellFrame[] = [];
  const api = { zeroNow: () => {}, refetch: () => {} };
  function Probe({ seed: s }: { seed: Promise<BellCountResult> | null }) {
    const bell = useBellBadge(null, s);
    paints.push({ count: bell.count, degraded: bell.degraded });
    api.zeroNow = bell.zeroNow;
    api.refetch = bell.refetch;
    return null;
  }
  const view = render(<Probe seed={seed} />);
  return {
    paints,
    zeroNow: () => api.zeroNow(),
    refetch: () => api.refetch(),
    rerender: (props) => view.rerender(<Probe seed={props.seed} />),
  };
}

/** Route the bell count endpoint to a queue of counts; everything else pends. */
function bellCountsInOrder(...counts: number[]): void {
  const queue = [...counts];
  fetchSpy.mockImplementation((url: string) => {
    if (url === COUNT_ENDPOINT) {
      const next = queue.shift();
      if (next === undefined) return new Promise(() => {});
      return Promise.resolve(okResponse({ count: next }));
    }
    if (url === "/api/admin/alerts/bell/token") return new Promise(() => {});
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

function attentionCountsInOrder(...counts: number[]): void {
  const queue = [...counts];
  fetchSpy.mockImplementation((url: string) => {
    if (url === ATTENTION_ENDPOINT) {
      const next = queue.shift();
      if (next === undefined) return new Promise(() => {});
      return Promise.resolve(okResponse({ count: next }));
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

const countFetches = () => fetchSpy.mock.calls.filter((c) => c[0] === COUNT_ENDPOINT).length;

// ---------------------------------------------------------------------------

/**
 * StrictMode replays every mount effect (dev, and Fast Refresh). A prop-sync
 * effect that detects "the mount run" with a first-run FLAG reads that replay as
 * a prop change and ingests the PENDING value — which claims the hook, so the
 * streamed seed is then dropped for the rest of the mount and the badge never
 * arrives at all.
 *
 * Found in a real browser, not here: the count route returned 8 and the chip
 * never rendered, because `render()` from RTL does not wrap in StrictMode. These
 * two cases are the standing guard, and each fails against the flag version.
 */
describe("StrictMode effect replay does not claim either hook", () => {
  it("attention: a seed resolving under StrictMode still commits", async () => {
    const seed = deferred<NeedsAttentionCountResult>();
    const paints: (number | null)[] = [];
    function Probe() {
      paints.push(useNeedsAttentionBadge(null, seed.promise));
      return null;
    }
    render(
      <React.StrictMode>
        <Probe />
      </React.StrictMode>,
    );
    await settle(() => seed.resolve({ kind: "ok", count: 8 }));
    expect(paints.at(-1)).toBe(8);
  });

  it("bell: a seed resolving under StrictMode still commits", async () => {
    const seed = deferred<BellCountResult>();
    const paints: BellFrame[] = [];
    function Probe() {
      const bell = useBellBadge(null, seed.promise);
      paints.push({ count: bell.count, degraded: bell.degraded });
      return null;
    }
    render(
      <React.StrictMode>
        <Probe />
      </React.StrictMode>,
    );
    await settle(() => seed.resolve({ kind: "ok", count: 6 }));
    expect(paints.at(-1)).toEqual({ count: 6, degraded: false });
  });
});

/**
 * A caller may hand a hook BOTH a synchronous count and a seed promise. The
 * layout does not (it passes promises only), but the props are independent and
 * AdminNav accepts both — and a synchronous count is a value that has already
 * COMMITTED. A seed created by the same server render is not newer than it, so
 * it must not overwrite it: the hook starts claimed whenever its initial prop
 * carries a real value, and the seed then takes the non-virgin path.
 *
 * Diff review R2 F1. Both fetches are left hanging, so "no stale paint" cannot
 * be satisfied by a corrective fetch landing.
 */
describe("a synchronous initial value claims the hook (R2 F1)", () => {
  it("attention: a later seed never overwrites a synchronous initial count", async () => {
    attentionCountsInOrder(); // any demoted fetch hangs
    const seed = deferred<NeedsAttentionCountResult>();
    const paints: (number | null)[] = [];
    function Probe() {
      paints.push(useNeedsAttentionBadge(5, seed.promise));
      return null;
    }
    render(<Probe />);
    expect(paints.at(-1)).toBe(5);

    await settle(() => seed.resolve({ kind: "ok", count: 1 }));

    expect(paints).not.toContain(1);
    expect(paints.at(-1)).toBe(5);
  });

  it("bell: a later seed never overwrites a synchronous initial count", async () => {
    bellCountsInOrder(); // any demoted fetch hangs
    const seed = deferred<BellCountResult>();
    const paints: BellFrame[] = [];
    function Probe() {
      const bell = useBellBadge({ kind: "ok", count: 5 }, seed.promise);
      paints.push({ count: bell.count, degraded: bell.degraded });
      return null;
    }
    render(<Probe />);
    expect(paints.at(-1)).toEqual({ count: 5, degraded: false });

    await settle(() => seed.resolve({ kind: "ok", count: 1 }));

    expect(paints.map((f) => f.count)).not.toContain(1);
    expect(paints.at(-1)?.count).toBe(5);
  });
});

describe("useNeedsAttentionBadge — async seed arm (AC-3, AC-5)", () => {
  it("mounts in the pending shape (null) while the seed is unresolved", () => {
    const seed = deferred<NeedsAttentionCountResult>();
    const probe = renderAttention(seed.promise);
    expect(probe.paints.at(-1)).toBeNull();
  });

  it("§3.2 row 1: seed resolves into virgin state → commits; a later navigation overwrites it", async () => {
    attentionCountsInOrder(9);
    const seed = deferred<NeedsAttentionCountResult>();
    const probe = renderAttention(seed.promise);

    await settle(() => seed.resolve({ kind: "ok", count: 5 }));
    expect(probe.paints.at(-1)).toBe(5);

    mockPathname = "/admin/settings";
    probe.rerender({ seed: seed.promise });
    await waitFor(() => expect(probe.paints.at(-1)).toBe(9));
  });

  it("§3.2 row 2: navigation commits FIRST → a later seed is DROPPED and never painted", async () => {
    attentionCountsInOrder(2);
    const seed = deferred<NeedsAttentionCountResult>();
    const probe = renderAttention(seed.promise);

    mockPathname = "/admin/settings";
    probe.rerender({ seed: seed.promise });
    await waitFor(() => expect(probe.paints.at(-1)).toBe(2));

    await settle(() => seed.resolve({ kind: "ok", count: 1 }));

    // Expectation derives from the WINNING source (the refetch), and the losing
    // seed value must appear in no frame at all.
    expect(probe.paints.at(-1)).toBe(2);
    expect(probe.paints).not.toContain(1);
  });

  it("seed resolving infra_error → null (chip hidden, fail-quiet D-4)", async () => {
    // Premise, on this case's own inputs: "still null" is the pending shape
    // too, so an unconsumed seed would satisfy the assertion vacuously. The
    // control proves the seed arm is live on an identically-shaped probe.
    const control = deferred<NeedsAttentionCountResult>();
    const controlProbe = renderAttention(control.promise);
    await settle(() => control.resolve({ kind: "ok", count: 5 }));
    expect(controlProbe.paints.at(-1)).toBe(5);

    const seed = deferred<NeedsAttentionCountResult>();
    const probe = renderAttention(seed.promise);
    await settle(() => seed.resolve({ kind: "infra_error" }));
    expect(probe.paints.at(-1)).toBeNull();
  });

  it("seed result shapes: 0 commits 0; a >9 count commits the raw value (the cap is a render concern)", async () => {
    const zero = deferred<NeedsAttentionCountResult>();
    const zeroProbe = renderAttention(zero.promise);
    await settle(() => zero.resolve({ kind: "ok", count: 0 }));
    expect(zeroProbe.paints.at(-1)).toBe(0);

    const many = deferred<NeedsAttentionCountResult>();
    const manyProbe = renderAttention(many.promise);
    await settle(() => many.resolve({ kind: "ok", count: 12 }));
    expect(manyProbe.paints.at(-1)).toBe(12);
  });

  it("§3.2 row 5: a seed that never resolves leaves the pending shape; the first pathname refetch repopulates", async () => {
    attentionCountsInOrder(7);
    const hung = new Promise<NeedsAttentionCountResult>(() => {});
    const probe = renderAttention(hung);
    expect(probe.paints.at(-1)).toBeNull();

    mockPathname = "/admin/settings";
    probe.rerender({ seed: hung });
    await waitFor(() => expect(probe.paints.at(-1)).toBe(7));
  });

  // The layout stopped passing a synchronous count, so the prop-sync path that
  // used to carry router.refresh's fresh value is dead on this surface: EVERY
  // post-mutation refresh now arrives as a new seed promise, into a hook that is
  // no longer virgin. Dropping it outright would leave the badge showing the
  // count from page load — stale exactly when Doug resolves an item and looks at
  // the badge to confirm it. Demote to a fresh fetch, as the bell already does:
  // the seed's own value is still never painted, and freshness survives.
  it("router.refresh path: a seed arriving into a non-virgin hook REFETCHES rather than going stale", async () => {
    attentionCountsInOrder(2);
    const first = deferred<NeedsAttentionCountResult>();
    const probe = renderAttention(first.promise);
    await settle(() => first.resolve({ kind: "ok", count: 5 }));
    expect(probe.paints.at(-1)).toBe(5);

    // router.refresh re-renders the layout: a NEW promise prop arrives, and the
    // server has since dropped to 2.
    const refreshed = deferred<NeedsAttentionCountResult>();
    probe.rerender({ seed: refreshed.promise });
    await settle(() => refreshed.resolve({ kind: "ok", count: 2 }));

    // The refetch — not the seed value — is what lands.
    await waitFor(() => expect(probe.paints.at(-1)).toBe(2));
    const attentionFetches = fetchSpy.mock.calls.filter((c) => c[0] === ATTENTION_ENDPOINT);
    expect(attentionFetches).toHaveLength(1);
  });

  // A seed carries its own KIND, and a failure is information the client already
  // has. Demoting an infra_error to "go fetch instead" defers the signal to a
  // request that can hang — and then a read the server told us FAILED is painted
  // as a healthy count, with nothing marking it. The failure posture applies
  // immediately; only an `ok` value (stale number, healthy read) demotes.
  it("non-virgin seed resolving infra_error applies the fail-quiet posture immediately", async () => {
    attentionCountsInOrder(); // any fetch would hang — the posture must not depend on one
    const first = deferred<NeedsAttentionCountResult>();
    const probe = renderAttention(first.promise);
    await settle(() => first.resolve({ kind: "ok", count: 5 }));
    expect(probe.paints.at(-1)).toBe(5);

    const failed = deferred<NeedsAttentionCountResult>();
    probe.rerender({ seed: failed.promise });
    await settle(() => failed.resolve({ kind: "infra_error" }));

    expect(probe.paints.at(-1)).toBeNull(); // chip hidden, ratified D-4
  });

  it("§3.7 compound: P1 resolves AFTER P2 arrives → P1 is ignored, only P2 reaches the hook", async () => {
    const p1 = deferred<NeedsAttentionCountResult>();
    const p2 = deferred<NeedsAttentionCountResult>();
    const probe = renderAttention(p1.promise);

    probe.rerender({ seed: p2.promise }); // router.refresh delivers a newer promise
    await settle(() => p1.resolve({ kind: "ok", count: 1 }));
    expect(probe.paints).not.toContain(1);
    expect(probe.paints.at(-1)).toBeNull(); // pending persists

    await settle(() => p2.resolve({ kind: "ok", count: 4 }));
    expect(probe.paints.at(-1)).toBe(4);
  });

  it("§3.7 compound: P2 HANGS after invalidating P1 → pending persists, the next refetch repopulates", async () => {
    attentionCountsInOrder(6);
    const p1 = deferred<NeedsAttentionCountResult>();
    const p2 = new Promise<NeedsAttentionCountResult>(() => {});
    const probe = renderAttention(p1.promise);

    probe.rerender({ seed: p2 });
    await settle(() => p1.resolve({ kind: "ok", count: 3 }));
    expect(probe.paints).not.toContain(3);
    expect(probe.paints.at(-1)).toBeNull();

    mockPathname = "/admin/settings";
    probe.rerender({ seed: p2 });
    await waitFor(() => expect(probe.paints.at(-1)).toBe(6));
  });
});

describe("useBellBadge — async seed arm (AC-4, AC-5)", () => {
  it("mounts in the pending shape (no count, not degraded) while the seed is unresolved", () => {
    const seed = deferred<BellCountResult>();
    const probe = renderBell(seed.promise);
    expect(probe.paints.at(-1)).toEqual({ count: null, degraded: false });
  });

  it("§3.2 row 1: seed resolves into virgin state → count commits, degraded stays false", async () => {
    const seed = deferred<BellCountResult>();
    const probe = renderBell(seed.promise);
    await settle(() => seed.resolve({ kind: "ok", count: 3 }));
    expect(probe.paints.at(-1)).toEqual({ count: 3, degraded: false });
  });

  it("§3.2 row 4: seed resolves infra_error → degraded (the existing `!` affordance), count untouched", async () => {
    const seed = deferred<BellCountResult>();
    const probe = renderBell(seed.promise);
    await settle(() => seed.resolve({ kind: "infra_error" }));
    expect(probe.paints.at(-1)).toEqual({ count: null, degraded: true });
  });

  it("§3.2 row 2: navigation commits FIRST → the late seed is DEMOTED to a fresh fetch, never painted", async () => {
    bellCountsInOrder(2, 4);
    const seed = deferred<BellCountResult>();
    const probe = renderBell(seed.promise);

    mockPathname = "/admin/settings";
    probe.rerender({ seed: seed.promise });
    await waitFor(() => expect(probe.paints.at(-1)?.count).toBe(2));
    const fetchesBeforeSeed = countFetches();

    await settle(() => seed.resolve({ kind: "ok", count: 1 }));

    // Demotion, not a direct commit: a NEW count fetch is issued and its server
    // truth is what lands. The seed's own value is painted in no frame.
    await waitFor(() => expect(countFetches()).toBe(fetchesBeforeSeed + 1));
    await waitFor(() => expect(probe.paints.at(-1)?.count).toBe(4));
    expect(probe.paints.map((p) => p.count)).not.toContain(1);
  });

  it("§3.2 row 3: zeroNow() before the seed resolves → the seed is demoted, the zero is not resurrected", async () => {
    bellCountsInOrder(0);
    const seed = deferred<BellCountResult>();
    const probe = renderBell(seed.promise);

    await act(async () => {
      probe.zeroNow();
    });
    expect(probe.paints.at(-1)?.count).toBe(0);
    const fetchesBeforeSeed = countFetches();

    await settle(() => seed.resolve({ kind: "ok", count: 6 }));

    await waitFor(() => expect(countFetches()).toBe(fetchesBeforeSeed + 1));
    expect(probe.paints.map((p) => p.count)).not.toContain(6);
  });

  it("§3.7 compound: opened+zeroed, restoring fetch commits 0, THEN the refresh seed resolves the pre-open count → never painted", async () => {
    bellCountsInOrder(0, 0);
    const seed = deferred<BellCountResult>();
    const probe = renderBell(seed.promise);

    // Open gesture zeroes client-side, then the panel's onOpened={refetch}
    // restores server truth (0 — nothing arrived post-snapshot).
    await act(async () => {
      probe.zeroNow();
    });
    await act(async () => {
      probe.refetch();
      await Promise.resolve();
    });
    await waitFor(() => expect(probe.paints.at(-1)?.count).toBe(0));

    // The refresh promise, issued BEFORE the open gesture, now resolves with
    // the pre-open count.
    await settle(() => seed.resolve({ kind: "ok", count: 5 }));

    expect(probe.paints.map((p) => p.count)).not.toContain(5);
    expect(probe.paints.at(-1)?.count).toBe(0);
  });

  it("§3.2 row 5: a seed that never resolves leaves the pending shape; the first pathname refetch repopulates", async () => {
    bellCountsInOrder(7);
    const hung = new Promise<BellCountResult>(() => {});
    const probe = renderBell(hung);
    expect(probe.paints.at(-1)).toEqual({ count: null, degraded: false });

    mockPathname = "/admin/settings";
    probe.rerender({ seed: hung });
    await waitFor(() => expect(probe.paints.at(-1)?.count).toBe(7));
  });

  // Twin of the attention case: an infra_error seed is a KNOWN failed read, so
  // the bell's ratified posture (keep the last-known count, mark it degraded)
  // applies at once rather than waiting on a demoted fetch that can hang.
  it("non-virgin seed resolving infra_error degrades immediately, keeping the last-known count", async () => {
    bellCountsInOrder(); // any demoted fetch would hang
    const first = deferred<BellCountResult>();
    const probe = renderBell(first.promise);
    await settle(() => first.resolve({ kind: "ok", count: 4 }));
    expect(probe.paints.at(-1)).toEqual({ count: 4, degraded: false });

    const failed = deferred<BellCountResult>();
    probe.rerender({ seed: failed.promise });
    await settle(() => failed.resolve({ kind: "infra_error" }));

    expect(probe.paints.at(-1)).toEqual({ count: 4, degraded: true });
  });

  it("§3.7 compound: P1 resolves AFTER P2 arrives → P1 is ignored, only P2 reaches the hook", async () => {
    const p1 = deferred<BellCountResult>();
    const p2 = deferred<BellCountResult>();
    const probe = renderBell(p1.promise);

    probe.rerender({ seed: p2.promise });
    await settle(() => p1.resolve({ kind: "ok", count: 1 }));
    expect(probe.paints.map((p) => p.count)).not.toContain(1);
    expect(probe.paints.at(-1)).toEqual({ count: null, degraded: false });

    await settle(() => p2.resolve({ kind: "ok", count: 4 }));
    expect(probe.paints.at(-1)?.count).toBe(4);
  });

  it("§3.7 compound: P2 HANGS after invalidating P1 → pending persists, the next refetch repopulates", async () => {
    bellCountsInOrder(6);
    const p1 = deferred<BellCountResult>();
    const p2 = new Promise<BellCountResult>(() => {});
    const probe = renderBell(p1.promise);

    probe.rerender({ seed: p2 });
    await settle(() => p1.resolve({ kind: "ok", count: 3 }));
    expect(probe.paints.map((p) => p.count)).not.toContain(3);
    expect(probe.paints.at(-1)?.count).toBeNull();

    mockPathname = "/admin/settings";
    probe.rerender({ seed: p2 });
    await waitFor(() => expect(probe.paints.at(-1)?.count).toBe(6));
  });
});
