// @vitest-environment jsdom
/**
 * THE DECIDING SUITE. It judges the check-in mechanism rather than describing it.
 *
 * The design spec names a consequence bound instead of an inventory: ANY code
 * running outside the render phase may observe a stale `retryPhase` snapshot,
 * and the mechanism must make that harmless. Three review rounds were spent on
 * inventories of readers, each refuted by the next round, so the contract is the
 * bound and these cases are what settles whether a mechanism honours it.
 *
 * WHY THE CALLBACK IS FIRED BY HAND. Every planted case drives a removal and
 * THEN invokes the pending timer callback directly. Advancing the clock instead
 * would prove nothing: a normally-flushed removal clears the timer before it
 * fires, so the callback never runs and the case passes against an unconditional
 * writer, which is precisely the mechanism it exists to catch. Capturing the
 * callback is the only way to put it in the state the bound is about.
 *
 * WHY THE THIRD ASSERTION IS ON THE NEXT RETRY. A stale phase write is invisible
 * while the item is gone. It surfaces when the item comes BACK: an entry that
 * inherits a `checked-in` phase checks in immediately instead of waiting its
 * window. So "nothing was written" is asserted where a write would be observable.
 *
 * WHAT IS DELIBERATELY NOT HERE, and each absence is reasoned rather than an
 * oversight:
 *   - Restart as a removal source. It is reachable only from `checked-in`, so a
 *     case that keeps the callback PENDING can never press it through the
 *     product. Restart's own stale-write case belongs with Restart.
 *   - Unmount as a "no stale write" row. Unmount destroys the phase map, so a
 *     stale write cannot poison a later retry and the assertion would pass
 *     against the broken mechanism too. Unmount's real obligation is timer
 *     cleanup, asserted below on `clearTimeout` instead, where it discriminates.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { Gallery, type GalleryItem } from "@/components/diagrams/Gallery";
import { RETRY_CHECK_IN_MS } from "@/components/diagrams/GalleryLightbox";
import { premiseHolds } from "@/tests/_shared/premise";

const SHOW_ID = "11111111-1111-4111-8111-111111111111";
const REV = "22222222-2222-4222-8222-222222222222";

function item(i: number, overrides: Partial<GalleryItem> = {}): GalleryItem {
  const key = `embedded-obj-${i}.png`;
  return {
    id: `embedded:obj-${i}`,
    key,
    alt: `Diagram ${i}`,
    available: true,
    variants: [
      { width: 256, key: `${key}@256.webp` },
      { width: 512, key: `${key}@512.webp` },
      { width: 1024, key: `${key}@1024.webp` },
    ],
    ...overrides,
  };
}

const slot = (i: number) => screen.getByTestId(`diagram-slot-${i}`);
const imageIn = (i: number) => within(slot(i)).queryByRole("img") as HTMLImageElement | null;

/** Check-in callbacks captured at schedule time, newest last. */
let pendingCheckIns: Array<() => void> = [];
/** The handles of the check-in timers only, so cleanup is asserted on identity. */
let checkInHandles: unknown[] = [];
let realSetTimeout: typeof globalThis.setTimeout;

function failThumb(i: number): void {
  const img = imageIn(i);
  premiseHolds(`slot ${i} renders an image, so there is an onError to fire`, img !== null);
  act(() => {
    fireEvent.error(img as HTMLImageElement);
  });
}

function tapRetry(i: number): void {
  act(() => {
    fireEvent.click(within(slot(i)).getByTestId(`diagram-retry-${i}`));
  });
}

function enterPending(i: number): void {
  failThumb(i);
  tapRetry(i);
}

async function loadImage(i: number): Promise<void> {
  const img = imageIn(i);
  premiseHolds(`slot ${i} has an image to load`, img !== null);
  await act(async () => {
    fireEvent.load(img as HTMLImageElement);
    await Promise.resolve();
  });
}

const checkedIn = (i: number): boolean =>
  (within(slot(i)).queryByTestId(`diagram-retrying-${i}`)?.textContent ?? "").includes(
    "Still loading",
  );

describe("the check-in mechanism, judged rather than described", () => {
  // ACCUMULATING. The announce log expires each message on its own timer, so a
  // snapshot read reports "nothing announced" for a message that was announced
  // and has since expired. Advancing the clock is exactly what these cases do,
  // so a snapshot oracle here would be measuring the log's retention rather than
  // the component's speech. Keyed by `data-announce-id` so one message counts
  // once however often it is sampled.
  const seen = new Map<string, string>();
  const announcements = (): string[] => {
    for (const n of screen
      .getByTestId("gallery-announce-log")
      .querySelectorAll("[data-announce-id]")) {
      const id = n.getAttribute("data-announce-id");
      if (id !== null) seen.set(id, n.textContent ?? "");
    }
    return [...seen.values()];
  };

  beforeEach(() => {
    pendingCheckIns = [];
    checkInHandles = [];
    seen.clear();
    // ORDER MATTERS. `useFakeTimers` installs its own `setTimeout`, so the
    // delegate has to be captured AFTER it: an earlier draft captured the REAL
    // one first and delegated there, which scheduled on the real clock where
    // `advanceTimersByTime` cannot reach it, and every capture came back empty.
    vi.useFakeTimers();
    realSetTimeout = globalThis.setTimeout;
    // Capture the check-in callback at SCHEDULE time. Keyed on the delay so an
    // unrelated timer cannot be mistaken for one, and the spy delegates rather
    // than replacing, so the component's own clearing still works.
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      fn: (...a: unknown[]) => void,
      ms?: number,
      ...rest: unknown[]
    ) => {
      const handle = (realSetTimeout as unknown as (...a: unknown[]) => unknown)(fn, ms, ...rest);
      if (ms === RETRY_CHECK_IN_MS) {
        pendingCheckIns.push(() => fn());
        // The HANDLE too, and it is what whole-diff review finding 2 turned on:
        // asserting that unmount cleared SOMETHING is satisfied by the announce
        // log's own TTL timer, so the assertion passed with both cleanup bodies
        // deleted (the reviewer's mutant ran 7 suites, 59/59 green).
        checkInHandles.push(handle);
      }
      return handle as unknown as ReturnType<typeof globalThis.setTimeout>;
    }) as unknown as typeof globalThis.setTimeout);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    cleanup();
  });

  const renderGallery = (items: GalleryItem[] = [item(1), item(2)]) =>
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={items} />);

  /**
   * Fire EVERY captured callback, after the removal under test.
   *
   * Not just the newest, and the difference decides whether this suite works at
   * all. React can mount an effect more than once, so several callbacks are
   * captured and only some are bound to the instance currently rendering; a
   * callback closed over a discarded instance updates nothing whatever the
   * mechanism does. Firing only the last one therefore proved nothing, and it
   * was measured: with the `prev.get(id) !== "pending"` guard DELETED, every
   * case in this file still passed. Firing all of them guarantees the live
   * instance receives the stale write, which is the event these cases are about.
   */
  function fireCapturedCheckIns(): void {
    premiseHolds(
      "a check-in callback was captured, so there is a stale firing to provoke",
      pendingCheckIns.length > 0,
    );
    act(() => {
      for (const fire of pendingCheckIns) fire();
    });
  }

  test("onLoad removes the item; a callback firing after it writes nothing", async () => {
    renderGallery();
    enterPending(0);
    premiseHolds(
      "the item is in flight with at least one check-in callback captured",
      pendingCheckIns.length > 0,
    );

    await loadImage(0);
    fireCapturedCheckIns();

    expect(checkedIn(0), "no check-in renders for a resolved item").toBe(false);
    expect(
      announcements().filter((m) => m.includes("still loading")),
      "nothing is announced for a resolved item",
    ).toEqual([]);

    // THE ASSERTION THAT MATTERS. A stale write is invisible until the next
    // entry inherits it, so the proof is that the next retry waits its FULL
    // window rather than checking in at once.
    enterPending(0);
    act(() => {
      vi.advanceTimersByTime(RETRY_CHECK_IN_MS - 1);
    });
    expect(checkedIn(0), "the next retry waits its own full window").toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(checkedIn(0), "and then checks in on time").toBe(true);
  });

  test("onError removes the item; a callback firing after it writes nothing", () => {
    renderGallery();
    enterPending(0);
    premiseHolds("a check-in callback was captured", pendingCheckIns.length > 0);

    failThumb(0); // the retry itself fails: pending -> failed
    fireCapturedCheckIns();

    expect(checkedIn(0), "a failed item shows no check-in").toBe(false);
    // `tapRetry`, not `enterPending`: the item is ALREADY failed, and the failed
    // branch renders no image, so there is nothing left to fire an onError at.
    tapRetry(0);
    act(() => {
      vi.advanceTimersByTime(RETRY_CHECK_IN_MS - 1);
    });
    expect(checkedIn(0), "the next retry waits its own full window").toBe(false);
  });

  test("the availability sweep removes the item; a late callback writes nothing", () => {
    const view = renderGallery();
    enterPending(0);
    premiseHolds("a check-in callback was captured", pendingCheckIns.length > 0);

    // The item goes unavailable, which is the sweep's own trigger.
    act(() => {
      view.rerender(
        <Gallery
          showId={SHOW_ID}
          snapshotRevisionId={REV}
          items={[item(1, { available: false }), item(2)]}
        />,
      );
    });
    fireCapturedCheckIns();

    act(() => {
      view.rerender(
        <Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />,
      );
    });
    expect(checkedIn(0), "an item that came back does not inherit a check-in").toBe(false);
  });

  test("a late success during the check-in wins, and says nothing after", async () => {
    renderGallery();
    enterPending(0);
    act(() => {
      vi.advanceTimersByTime(RETRY_CHECK_IN_MS);
    });
    premiseHolds("the item is checked in, so there is a late success to race", checkedIn(0));

    await loadImage(0);
    expect(checkedIn(0), "the image wins and the overlay is gone").toBe(false);
    const after = announcements().filter((m) => m.includes("still loading")).length;
    act(() => {
      vi.advanceTimersByTime(RETRY_CHECK_IN_MS);
    });
    expect(
      announcements().filter((m) => m.includes("still loading")).length,
      "nothing is announced after the image has loaded",
    ).toBe(after);
  });

  test("AC-1b: one item's window is not restarted by another item arriving", () => {
    renderGallery();
    enterPending(0);
    act(() => {
      vi.advanceTimersByTime(RETRY_CHECK_IN_MS - 1000);
    });

    // B enters and leaves while A is 1s from its deadline. On a single effect
    // whose cleanup clears every timer, A's window restarts here and A checks in
    // about a full window late. A COUNT of A's live timers cannot see that,
    // because A always has exactly one, which is why this asserts the TIMING.
    enterPending(1);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    failThumb(1);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(checkedIn(0), "A checks in on ITS OWN schedule, unaffected by B").toBe(true);
  });

  test("a RESOLVED retry retires its timer, so the NEXT retry waits its own full window", async () => {
    // The gallery's half of review round 3's High finding. The lightbox twin
    // lives in galleryLightbox.retryCheckIn.test.tsx; the reviewer measured the
    // defect class in BOTH components, so both get a case rather than one
    // standing in for the other.
    //
    // THE ONE-SECOND OFFSET IS THE MECHANISM. Retire and replace at the same
    // fake-clock instant and a reconciler that calls `timers.delete(id)` without
    // `clearTimeout(handle)` is indistinguishable from a correct one: the stale
    // callback fires exactly when the new one would have. Offset by a second and
    // it fires a second EARLY, which is observable.
    renderGallery();
    enterPending(0);
    // A DELTA, not an absolute. The gallery schedules more than one timer at this
    // delay (the probe read 2 after a single entry), so "exactly one handle"
    // would be asserting the fixture rather than the mechanism. What the
    // mechanism claims is that a NEW retry adds a watchdog of its own.
    premiseHolds("at least one check-in timer was scheduled", checkInHandles.length > 0);
    const afterFirstEntry = checkInHandles.length;

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    const img = imageIn(0);
    premiseHolds("the in-flight item has an image to resolve", img !== null);
    await act(async () => {
      fireEvent.load(img as HTMLImageElement);
      await Promise.resolve();
    });

    failThumb(0);
    tapRetry(0);
    expect(
      checkInHandles.length - afterFirstEntry,
      "the replacement retry scheduled a watchdog of its own",
    ).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(RETRY_CHECK_IN_MS - 1_000);
    });
    expect(
      checkedIn(0),
      "the next retry waits its own full window; a stale callback would check it in early",
    ).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(checkedIn(0), "and then the second window checks in").toBe(true);
  });

  test("unmount clears the timer, asserted on clearTimeout rather than on silence", () => {
    const cleared: unknown[] = [];
    const realClear = globalThis.clearTimeout;
    vi.spyOn(globalThis, "clearTimeout").mockImplementation(((h: unknown) => {
      cleared.push(h);
      return (realClear as unknown as (h: unknown) => void)(h);
    }) as unknown as typeof globalThis.clearTimeout);

    const view = renderGallery();
    enterPending(0);
    premiseHolds("a check-in timer was scheduled", pendingCheckIns.length > 0);
    const before = cleared.length;

    act(() => {
      view.unmount();
    });

    // React SILENTLY IGNORES a post-unmount state update, so "fire the callback
    // and assert nothing happened" passes whether or not the timer was cleared.
    // A cleanup that HAPPENED is observable; a state update that did not happen
    // is not. This is the case that had to change.
    // IDENTITY, not a count. `cleared.length > before` was the first version and
    // whole-diff review finding 2 showed it is satisfied by the announce log's
    // TTL timer alone: with BOTH components' mount-scoped cleanup bodies removed,
    // all seven component suites stayed green at 59/59. What has to be true is
    // that the check-in's OWN handles were the ones passed to clearTimeout.
    premiseHolds("a check-in handle was captured to look for", checkInHandles.length > 0);
    const missed = checkInHandles.filter((h) => !cleared.includes(h));
    expect(
      missed.length,
      `unmount left ${missed.length} of ${checkInHandles.length} check-in timers armed; ` +
        "a post-unmount setState is silently ignored by React, so only the CLEAR is observable",
    ).toBe(0);
    expect(cleared.length, "and the clear actually ran").toBeGreaterThan(before);
  });
});
