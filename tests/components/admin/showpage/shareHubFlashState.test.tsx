// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/shareHubFlashState.test.tsx
 *
 * The crew-URL cue's ATTRIBUTE LIFECYCLE (spec §9.1 N2-N5/N7, §6.1's rule).
 * jsdom applies no CSS, so nothing here asserts that anything visibly animates —
 * that would be vacuous. The motion it triggers is pinned by the source scan in
 * shareHubFlashTransitions, and the resolved paint by the browser spec.
 *
 * §6.1 is a three-branch rule, not a row table, so the cases below are grouped
 * by branch:
 *   1. target not visible after the transition  → absent, any live cue cleared
 *   2. token changed, both non-null, visible    → present, block remounts, timer (re)armed
 *   3. otherwise                                → unchanged from the prior render
 *
 * Branch 3 is the one a naive implementation gets wrong: during a live cue the
 * component re-renders constantly (busy flips, banner mounts, placement passes),
 * every one of them with an unchanged token. Clearing on "the token did not
 * change" kills the cue within about a frame.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rotateMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/picker/rotateShareToken", () => ({ rotateShareToken: rotateMock }));
vi.mock("@/lib/auth/picker/resetPickerEpoch", () => ({ resetPickerEpoch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ShareHub, SHARE_LINK_FLASH_MS } from "@/components/admin/showpage/ShareHub";
import { ShareTokenProvider, useShareToken } from "@/app/admin/show/[slug]/ShareTokenContext";

const SLUG = "sample-show";
const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const T1 = "a".repeat(64);
const T2 = "b".repeat(64);
const T3 = "c".repeat(64);

const FLASH = "data-share-link-flash";
const url = () => screen.queryByTestId("admin-current-share-link-url");
const row = () => screen.queryByTestId("admin-current-share-link-row");
const copyBtn = () => screen.queryByTestId("admin-current-share-link-copy-button");
const panel = () => screen.queryByTestId("share-hub-popover");
const flashed = () => document.querySelectorAll(`[${FLASH}]`);

const originalOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  if (originalOrigin === undefined) delete process.env.NEXT_PUBLIC_SITE_ORIGIN;
  else process.env.NEXT_PUBLIC_SITE_ORIGIN = originalOrigin;
});

function hubProps(over: Partial<React.ComponentProps<typeof ShareHub>> = {}) {
  return {
    slug: SLUG,
    showId: SHOW_ID,
    published: true,
    archived: false,
    finalizeOwned: false,
    crewEmails: [],
    showTitle: "Sample Show",
    pickerCrew: [],
    archiveAction: async () => ({ ok: true }) as const,
    unarchiveAction: async () => {},
    ...over,
  };
}

/** Scripted remote rotations, driven by clicking. Rendering a button per step
 *  keeps `applyRotated` inside the component tree: capturing it into a
 *  module-level holder is what the React Compiler lint forbids, and a callback
 *  prop would need its own effect to fire. */
const STEPS: ReadonlyArray<{ token: string; epoch: number }> = [
  { token: T2, epoch: 6 },
  { token: T3, epoch: 7 },
  { token: "STALE", epoch: 4 },
];

function Probe() {
  const { applyRotated, remoteTokenChanges } = useShareToken();
  return (
    <>
      {STEPS.map((s, i) => (
        <button
          key={s.token}
          type="button"
          data-testid={`apply-${i}`}
          onClick={() => applyRotated(s.token, s.epoch)}
        />
      ))}
      <output data-testid="remote-changes">{remoteTokenChanges}</output>
    </>
  );
}

function renderHub(
  props: Partial<React.ComponentProps<typeof ShareHub>> = {},
  epoch = 5,
  seed: string | null = T1,
) {
  const tree = (
    seedToken: string | null,
    seedEpoch: number,
    over: Partial<React.ComponentProps<typeof ShareHub>>,
  ) => (
    <ShareTokenProvider initialToken={seedToken} initialEpoch={seedEpoch}>
      <ShareHub {...hubProps({ ...props, ...over })} />
      <Probe />
    </ShareTokenProvider>
  );
  const view = render(tree(seed, epoch, {}));
  const rerenderWith = (next: Partial<React.ComponentProps<typeof ShareHub>>) =>
    view.rerender(tree(seed, epoch, next));
  /** Re-seed the PROVIDER, which is the remote/server-refresh path. */
  const reseed = (nextToken: string | null, nextEpoch: number) =>
    view.rerender(tree(nextToken, nextEpoch, {}));
  return { ...view, rerenderWith, reseed };
}

function openPanel() {
  fireEvent.click(screen.getByTestId("share-hub-primary"));
}

/** A remote rotation: the provider accepts it through the real epoch gate. */
function remoteRotate(step: number) {
  fireEvent.click(screen.getByTestId(`apply-${step}`));
}

describe("branch 2 — an accepted token change cues", () => {
  it("marks the URL block, and EXACTLY that element", () => {
    renderHub();
    openPanel();
    expect(url()).not.toHaveAttribute(FLASH);

    remoteRotate(0);

    expect(url()).toHaveAttribute(FLASH, "");
    // N3. Without this an implementation may also mark the wrapper and pass
    // every other row here.
    expect(flashed()).toHaveLength(1);
    expect(flashed()[0]).toBe(url());
  });

  it("remounts the URL block and NOTHING else (N4)", () => {
    renderHub();
    openPanel();
    const before = { url: url(), row: row(), copy: copyBtn(), panel: panel() };

    remoteRotate(0);

    // The block is replaced, which is what restarts the animation.
    expect(url()).not.toBe(before.url);
    // Its neighbours are not. Keying the ROW instead would fail here, because
    // the Copy button would re-resolve to a new object.
    expect(row()).toBe(before.row);
    expect(copyBtn()).toBe(before.copy);
    expect(panel()).toBe(before.panel);
  });

  it("clears at exactly SHARE_LINK_FLASH_MS, not before", () => {
    vi.useFakeTimers();
    renderHub();
    openPanel();
    remoteRotate(0);
    expect(url()).toHaveAttribute(FLASH);

    // The middle checkpoint is what rejects a wrong constant: a 1000ms timer
    // passes a present/absent pair sampled only at 0 and 1600.
    act(() => void vi.advanceTimersByTime(SHARE_LINK_FLASH_MS - 1));
    expect(url()).toHaveAttribute(FLASH);

    act(() => void vi.advanceTimersByTime(1));
    expect(url()).not.toHaveAttribute(FLASH);
  });

  it("re-arms on a second change so the later cue runs its full window", () => {
    vi.useFakeTimers();
    renderHub();
    openPanel();
    remoteRotate(0);
    act(() => void vi.advanceTimersByTime(800));

    remoteRotate(1);
    // Still up at the FIRST change's deadline — a boolean would have cleared.
    act(() => void vi.advanceTimersByTime(800));
    expect(url()).toHaveAttribute(FLASH);

    act(() => void vi.advanceTimersByTime(800));
    expect(url()).not.toHaveAttribute(FLASH);
  });
});

describe("branch 3 — everything else leaves the attribute alone", () => {
  it("no cue on first render or first open", () => {
    renderHub();
    openPanel();
    expect(url()).not.toHaveAttribute(FLASH);
    expect(flashed()).toHaveLength(0);
  });

  it("a live cue SURVIVES unrelated re-renders", () => {
    vi.useFakeTimers();
    const { rerenderWith } = renderHub();
    openPanel();
    remoteRotate(0);
    expect(url()).toHaveAttribute(FLASH);

    // Unrelated prop churn, token untouched. An implementation that clears
    // whenever the token did not change kills the cue here.
    act(() => rerenderWith({ showTitle: "Renamed Show" }));
    act(() => void vi.advanceTimersByTime(100));
    act(() => rerenderWith({ finalizeOwned: true }));

    expect(url()).toHaveAttribute(FLASH);
  });

  it("null becoming a token does NOT cue", () => {
    // The both-non-null GUARD's load-bearing direction. A read fault recovering,
    // an unarchive, or a republish restoring eligibility all arrive here with
    // `linkActive` turning TRUE, so the visibility predicate does not suppress
    // anything — the guard is the only thing standing between this and a cue
    // for a rotation that never happened.
    //
    // Added because the adversary matrix found nothing rejecting a bump-on-any-
    // change implementation: every other row starts from a token that already
    // exists, so none of them can reach this transition.
    const { reseed } = renderHub({}, 5, null);
    openPanel();
    expect(url()).toBeNull();

    act(() => reseed(T2, 6));

    expect(url()).not.toBeNull();
    expect(url()).not.toHaveAttribute(FLASH);
    expect(flashed()).toHaveLength(0);
  });

  it("a STRICTLY LOWER epoch is rejected, so nothing cues", () => {
    renderHub();
    openPanel();
    remoteRotate(2);
    expect(url()?.textContent).toContain(T1);
    expect(flashed()).toHaveLength(0);
  });

  it("expiry does NOT remount anything (N5) — a text selection survives it", () => {
    vi.useFakeTimers();
    renderHub();
    openPanel();
    remoteRotate(0);
    const during = { url: url(), row: row(), copy: copyBtn() };

    act(() => void vi.advanceTimersByTime(SHARE_LINK_FLASH_MS));

    expect(url()).not.toHaveAttribute(FLASH);
    // key={flash} would remount here and destroy a selection mid-copy.
    expect(url()).toBe(during.url);
    expect(row()).toBe(during.row);
    expect(copyBtn()).toBe(during.copy);
  });
});

describe("branch 1 — the target leaving the screen clears the cue", () => {
  it("a change while the panel is CLOSED never reaches the DOM", () => {
    renderHub();
    remoteRotate(0);
    openPanel();
    expect(url()).not.toHaveAttribute(FLASH);
  });

  it("closing mid-cue clears it, so reopening inside the window is clean", () => {
    vi.useFakeTimers();
    renderHub();
    openPanel();
    remoteRotate(0);
    expect(url()).toHaveAttribute(FLASH);

    fireEvent.click(screen.getByTestId("share-hub-primary"));
    act(() => void vi.advanceTimersByTime(200));
    openPanel();

    expect(url()).not.toHaveAttribute(FLASH);
  });

  it("an UNPUBLISH mid-cue clears it even though the token never changed", async () => {
    // The leak this closes: `published` flips without a rotation
    // (20260701000000_published_toggle_unpublish_show.sql:2 puts rotation and
    // the epoch bump explicitly out of scope), so a clear written over token
    // nullity alone would leave the cue alive across the unmount.
    //
    // The BUSY hold is what makes this reachable: without it the lifecycle
    // effect closes the popover on the flip and `!open` clears the cue anyway,
    // so the row would pass against the very bug it targets.
    vi.useFakeTimers();
    let settle: ((v: { ok: false; code: string }) => void) | undefined;
    rotateMock.mockReturnValue(
      new Promise<{ ok: false; code: string }>((res) => {
        settle = res;
      }),
    );

    const { rerenderWith } = renderHub();
    openPanel();
    remoteRotate(0);
    expect(url()).toHaveAttribute(FLASH);

    // Hold busy with an in-flight rotate.
    fireEvent.click(screen.getByTestId("admin-rotate-share-token-button"));
    fireEvent.click(screen.getByTestId("admin-rotate-share-token-confirm-button"));
    await act(async () => {
      await Promise.resolve();
    });

    // Unpublish: deferred close (busy), so the panel stays open.
    act(() => rerenderWith({ published: false }));
    expect(panel()).not.toBeNull();
    expect(url()).toBeNull();

    // Republish while STILL busy. Holding busy across BOTH lifecycle flips is
    // required, not incidental: the republish is itself a transition, so
    // releasing busy first would let it close the popover and the assertions
    // below would pass against a target that simply no longer exists.
    act(() => rerenderWith({ published: true }));
    expect(panel()).not.toBeNull();

    // Settle as a FAILURE so no token change rides along. The deferred close is
    // CANCELLED on busy clearing (ShareHub.tsx:517-520), so the panel remains.
    await act(async () => {
      settle?.({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
      await Promise.resolve();
    });

    // The target is BACK, and carries nothing. The token never changed, so a
    // cue here would announce a rotation that did not happen.
    expect(panel()).not.toBeNull();
    expect(url()).not.toBeNull();
    expect(url()).not.toHaveAttribute(FLASH);
    expect(flashed()).toHaveLength(0);
  });

  it("archiving clears it (the whole share half goes)", () => {
    vi.useFakeTimers();
    const { rerenderWith } = renderHub();
    openPanel();
    remoteRotate(0);
    expect(url()).toHaveAttribute(FLASH);

    act(() => rerenderWith({ archived: true }));
    expect(url()).toBeNull();
    expect(flashed()).toHaveLength(0);
  });
});

describe("teardown", () => {
  it("unmounting mid-cue clears the CUE's timer", () => {
    vi.useFakeTimers();
    const { unmount } = renderHub();
    openPanel();

    // Baseline AFTER opening, deliberately. Opening the panel arms a timer that
    // is not the cue's and that survives unmount, so asserting a global count of
    // zero would measure that timer rather than this cleanup.
    //
    // ROOT CAUSE, measured and closed 2026-08-02 (spec
    // 2026-08-01-admin-popover-overlay-cluster §2.3/§6, BL-SHAREHUB-OPEN-TIMER-LEAK):
    // it is a jsdom ARTIFACT, not a product leak. The open-focus effect
    // (ShareHub.tsx, `panelRef.current?.focus()` when the popover opens) makes
    // jsdom run Selection._associateRange, which arms a `setTimeout(0)` of its
    // own. Under fake timers that pending macrotask is never drained, so it
    // shows up in getTimerCount(); in a real browser there is no such timer.
    // No component change was warranted, and the delta style STAYS — a global
    // zero-count assertion is unusable in jsdom by construction. Recorded here
    // so the next reader does not re-bisect it.
    const baseline = vi.getTimerCount();

    remoteRotate(0);
    // TWO, not one, since SHARELINK-CUE-VISIBILITY-1: the cue arms its flash
    // timer AND schedules the scroll frame. Vitest's fake timers fake
    // requestAnimationFrame too, so the pending frame counts here. Both have
    // cleanup, which is what the post-unmount assertion below now proves for
    // both of them.
    expect(vi.getTimerCount()).toBe(baseline + 2);

    unmount();

    // Reds against a timer effect with no cleanup, which would leave
    // baseline + 1. React 19 emits no setState-after-unmount warning, so a
    // warning-based pin would be vacuous.
    expect(vi.getTimerCount()).toBeLessThanOrEqual(baseline);
  });
});

// remoteTokenChanges counter (spec 2026-08-01-announce-a11y-pass §4.1): bumps
// once per SEED-driven accepted non-null-to-non-null token change; never on
// applyRotated (local), stale seeds, epoch-only advances, or null transitions.
describe("ShareTokenContext.remoteTokenChanges", () => {
  const count = () => Number(screen.getByTestId("remote-changes").textContent);

  it("a seed-driven token change bumps exactly once", () => {
    const { reseed } = renderHub();
    expect(count()).toBe(0);
    reseed(T2, 6); // remote rotation arrives via router.refresh seed
    expect(count()).toBe(1);
  });

  it("a local applyRotated (+ its equal-token follow-up seed) never bumps", () => {
    const { reseed } = renderHub();
    remoteRotate(0); // applyRotated(T2, 6) — the LOCAL instant path
    expect(count()).toBe(0);
    reseed(T2, 6); // the follow-up server seed carries the SAME pair
    expect(count()).toBe(0);
  });

  it("a stale (lower-epoch) seed is rejected and never bumps", () => {
    const { reseed } = renderHub();
    reseed("STALE", 4); // held epoch is 5
    expect(count()).toBe(0);
  });

  it("a same-token higher-epoch seed (reset_picker_epoch_atomic shape) never bumps", () => {
    const { reseed } = renderHub();
    reseed(T1, 9); // epoch advanced, token unchanged
    expect(count()).toBe(0);
  });

  it("null transitions never bump (token loss, token appearance)", () => {
    const { reseed } = renderHub();
    reseed(null, 9); // token -> null (authoritative loss)
    expect(count()).toBe(0);
    reseed(T2, 10); // null -> token (eligibility restored, nothing died)
    expect(count()).toBe(0);
  });
});

// ShareHub remote-rotation live region (spec 2026-08-01-announce-a11y-pass
// §4.2/§5.3): mirrors the flash predicate — announces a seed-driven token
// change only while open with a live link; local rotations stay silent; the
// region is a persistent popover-root node, not nested under the link branch.
describe("ShareHub remote-rotation announcement", () => {
  const COPY = "Crew link changed. The earlier link no longer works.";
  const region = () => screen.getByTestId("share-hub-remote-rotate-announce");

  it("a remote change while open + link active announces the ratified copy", () => {
    const { reseed } = renderHub();
    openPanel();
    const before = region();
    expect(before.textContent).toBe("");
    reseed(T2, 6); // remote rotation via the server seed
    expect(region()).toBe(before); // same pre-existing node — no insert-time mount
    expect(region().textContent).toBe(COPY);
  });

  it("a remote change while CLOSED never announces, and reopening is not retroactive", () => {
    const { reseed } = renderHub();
    reseed(T2, 6); // popover closed
    openPanel();
    expect(region().textContent).toBe("");
  });

  it("a bump while open with an INACTIVE link stays silent, with no retroactive announce", () => {
    const { reseed, rerenderWith } = renderHub({ published: false });
    openPanel();
    // Paused state: the region node still EXISTS (popover-root placement), empty.
    expect(region().textContent).toBe("");
    reseed(T2, 6); // accepted token change; linkActive is false
    expect(region().textContent).toBe("");
    // Republishing closes the popover (the §4 lifecycle-close contract); the
    // no-retroactive claim is asserted on the reopened panel.
    act(() => rerenderWith({ published: true }));
    openPanel();
    expect(region().textContent).toBe("");
  });

  it("linkActive dropping false while the popover STAYS open clears the announcement", async () => {
    vi.useFakeTimers();
    let settle: ((v: { ok: false; code: string }) => void) | undefined;
    rotateMock.mockReturnValue(
      new Promise<{ ok: false; code: string }>((res) => {
        settle = res;
      }),
    );
    const { reseed, rerenderWith } = renderHub();
    openPanel();
    reseed(T2, 6);
    expect(region().textContent).toBe(COPY);
    // Hold busy so the unpublish flip cannot close the popover (the flash
    // suite's busy-held pattern) — a clear keyed only to !open fails here.
    fireEvent.click(screen.getByTestId("admin-rotate-share-token-button"));
    fireEvent.click(screen.getByTestId("admin-rotate-share-token-confirm-button"));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => rerenderWith({ published: false }));
    expect(panel()).not.toBeNull(); // still open
    expect(region().textContent).toBe("");
    await act(async () => {
      settle?.({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
      await Promise.resolve();
    });
    vi.useRealTimers();
  });

  it("a LOCAL rotation (applyRotated + its equal follow-up seed) stays silent", () => {
    const { reseed } = renderHub();
    openPanel();
    remoteRotate(0); // applyRotated(T2, 6): the local instant path
    expect(region().textContent).toBe("");
    reseed(T2, 6); // equal-pair follow-up seed
    expect(region().textContent).toBe("");
  });

  it("stale, epoch-only, and null-transition seeds stay silent", () => {
    const { reseed } = renderHub();
    openPanel();
    reseed("STALE", 4); // stale — rejected
    expect(region().textContent).toBe("");
    reseed(T1, 9); // same token, higher epoch (picker-reset shape)
    expect(region().textContent).toBe("");
    reseed(null, 10); // token -> null
    expect(region().textContent).toBe("");
    reseed(T2, 11); // null -> token
    expect(region().textContent).toBe("");
  });

  it("closing the popover clears the announcement (clean reopen)", () => {
    const { reseed } = renderHub();
    openPanel();
    reseed(T2, 6);
    expect(region().textContent).toBe(COPY);
    fireEvent.click(screen.getByTestId("share-hub-primary")); // close
    openPanel();
    expect(region().textContent).toBe("");
  });
});

// ── SHARELINK-CUE-VISIBILITY-1: the cue scrolls itself into view ─────────────
//
// The URL block sits at the TOP of the popover's scroller and the rotate control
// is below it, so on a phone the operator has scrolled past the block by the
// time they confirm — the cue can fire entirely above the fold. The scroll is
// what makes the cue reachable at all.
//
// The compound cases are HERE, in the RED, rather than in a later audit pass:
// the rAF bookkeeping they pin (cancel-then-reschedule, cleanup-on-unmount) is
// implementation the GREEN has to carry, so writing them afterwards would be
// writing tests to match code.
//
// ANTI-TAUTOLOGY on the behavior strings: the test sets the media state and
// hardcodes the expected literal per state. Deriving the expectation from the
// same map the implementation reads would assert nothing — this is the
// data-source side of the assertion.
describe("SHARELINK-CUE-VISIBILITY-1 — the flash edge scrolls the URL row into view", () => {
  let rafQueue: Array<{ id: number; cb: FrameRequestCallback } | null> = [];
  let nextRafId = 0;
  let scrollSpy: ReturnType<typeof vi.fn>;

  /** Hand-driven rAF, so "before the frame fires" is an observable state. */
  function installRaf() {
    rafQueue = [];
    nextRafId = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      const id = ++nextRafId;
      rafQueue.push({ id, cb });
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      const i = rafQueue.findIndex((e) => e !== null && e.id === id);
      if (i >= 0) rafQueue[i] = null;
    });
  }

  function pendingFrames() {
    return rafQueue.filter((e) => e !== null).length;
  }

  function flushRaf() {
    const q = rafQueue;
    rafQueue = [];
    act(() => {
      for (const e of q) e?.cb(0);
    });
  }

  function mockReducedMotion(reduce: boolean) {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }

  beforeEach(() => {
    installRaf();
    mockReducedMotion(false);
    scrollSpy = vi.fn();
    // jsdom implements no layout and therefore no scrollIntoView; production
    // guards on exactly that, so the spy is also what makes the guard passable.
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      value: scrollSpy,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
  });

  /** Every call's target, resolved to its testid. */
  function scrolledTestIds() {
    return scrollSpy.mock.instances.map((el) => (el as Element).getAttribute?.("data-testid"));
  }

  it("fires on the null -> non-null flash edge, targeting the URL ROW", () => {
    renderHub();
    openPanel();
    expect(scrollSpy).not.toHaveBeenCalled();
    remoteRotate(0);
    flushRaf();
    expect(scrolledTestIds()).toEqual(["admin-current-share-link-row"]);
    expect(scrollSpy.mock.calls[0]?.[0]).toMatchObject({ block: "nearest" });
  });

  it("fires AGAIN on n -> n+1 (a second rotation inside the same open panel)", () => {
    // A re-rotation is a new cue and needs a new scroll: the operator may have
    // scrolled away again between the two.
    renderHub();
    openPanel();
    remoteRotate(0);
    flushRaf();
    remoteRotate(1);
    flushRaf();
    expect(scrollSpy).toHaveBeenCalledTimes(2);
    expect(new Set(scrolledTestIds())).toEqual(new Set(["admin-current-share-link-row"]));
  });

  it("does NOT fire on re-renders that change no token", () => {
    // The failure mode: an effect keyed on `token` (or on nothing) scrolls the
    // popover out from under the operator on every busy flip and banner mount.
    const { rerenderWith } = renderHub();
    openPanel();
    rerenderWith({ showTitle: "Renamed Show" });
    rerenderWith({ finalizeOwned: true });
    flushRaf();
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it.each([
    [false, "smooth"],
    [true, "auto"],
  ])("reduced-motion %s -> behavior %s", (reduce, expected) => {
    mockReducedMotion(reduce);
    renderHub();
    openPanel();
    remoteRotate(0);
    flushRaf();
    expect(scrollSpy.mock.calls[0]?.[0]).toMatchObject({ behavior: expected });
  });

  it("COMPOUND: a double bump before the frame fires yields exactly ONE scroll", () => {
    // Two rotations inside one frame must not stack two rAFs racing the same
    // target; un-cancelled scheduling is the classic version of this bug.
    renderHub();
    openPanel();
    remoteRotate(0);
    remoteRotate(1);
    expect(pendingFrames()).toBe(1);
    flushRaf();
    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });

  it("COMPOUND: closing the popover before the frame fires yields NO scroll and no throw", () => {
    // The rAF would otherwise run against a detached node. Production also
    // guards the node's absence, but the effect cleanup is what stops the frame.
    renderHub();
    openPanel();
    remoteRotate(0);
    fireEvent.click(screen.getByTestId("share-hub-primary")); // close
    expect(() => flushRaf()).not.toThrow();
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it("COMPOUND: the flash timer expiring neither cancels a delivered scroll nor re-fires one", () => {
    // The highlight clears while the glide may still be in flight. Nothing
    // should observe scroll end, and clearing is not itself a cue.
    // Fake timers must come FIRST: vitest fakes requestAnimationFrame along
    // with the clock, so enabling them after the stub would silently replace it
    // and the hand-driven queue would sit empty.
    vi.useFakeTimers();
    installRaf();
    renderHub();
    openPanel();
    remoteRotate(0);
    flushRaf();
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(SHARE_LINK_FLASH_MS + 50);
    });
    flushRaf();
    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });
});
