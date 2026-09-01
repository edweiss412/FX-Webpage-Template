// @vitest-environment jsdom
/**
 * The gallery's 30-second check-in: copy, semantics, and the announcement.
 *
 * The races that DECIDE the mechanism live in retryCheckInRaces.test.tsx. This
 * file covers what a crew member sees and hears, which is the other half.
 *
 * ANTI-TAUTOLOGY POSTURE.
 *   - Every clock advance derives from the imported RETRY_CHECK_IN_MS. A literal
 *     30000 here would pass while the constant moved, asserting the test's
 *     opinion instead of the product's.
 *   - The announcement is read from the LOG REGION the component renders
 *     (`gallery-announce-log`, one node per announcement), which is the oracle
 *     the shipped gallery suites already use. An earlier draft of this file
 *     asserted through an `onAnnounce` prop; `Gallery` has no such prop, it has
 *     an internal `routeAnnouncement`, and inventing the seam would have made
 *     the suite unrunnable rather than wrong. Reading the region is what lets
 *     the "nothing was announced" assertions mean anything.
 *   - `aria-busy` is asserted on the SAME node before and after the check-in.
 *     Re-querying could match a different element and read as continuity.
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
const inFlight = (i: number) => within(slot(i)).getByTestId(`diagram-retrying-${i}`);

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

/** Drive one item to `pending`: fail it, then tap its retry control. */
function enterPending(i: number): void {
  failThumb(i);
  tapRetry(i);
}

/** Cross the deadline. Derived from the constant, never a literal. */
function crossDeadline(): void {
  act(() => {
    vi.advanceTimersByTime(RETRY_CHECK_IN_MS);
  });
}

describe("the gallery check-in at RETRY_CHECK_IN_MS", () => {
  // ACCUMULATING, not a snapshot, and the difference is load-bearing. The
  // announce log sets a per-message expiry timer (`components/admin/announceLog`,
  // beside its cap), so advancing fake timers past that budget empties the
  // region. A snapshot oracle then reports "nothing was announced" for a message
  // that WAS announced and has since expired — which an earlier draft of this
  // file did, reading [] and calling it a missing announcement. Keyed by
  // `data-announce-id`, so one message counts once however often it is sampled.
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
    vi.useFakeTimers();
    seen.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  const renderGallery = () =>
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);

  test("before the deadline the overlay is the shipped in-flight control, unchanged", () => {
    renderGallery();
    enterPending(0);
    const control = inFlight(0);
    premiseHolds("the item reached the in-flight state", control !== null);

    act(() => {
      vi.advanceTimersByTime(RETRY_CHECK_IN_MS - 1);
    });
    expect(control.getAttribute("aria-busy")).toBe("true");
    expect(control.getAttribute("aria-disabled")).toBe("true");
    expect(control.textContent).toContain("Retrying");
    expect(control.textContent).not.toContain("Still loading");
  });

  test("at the deadline the SAME node changes copy and un-inerts, keeping aria-busy", () => {
    renderGallery();
    enterPending(0);
    const before = inFlight(0);
    expect(before.getAttribute("aria-disabled")).toBe("true");

    crossDeadline();

    // The same element, deliberately: the overlay is one node across every
    // in-flight phase so focus never moves (AC-10). Re-querying would pass on a
    // design that unmounted and remounted it.
    const after = inFlight(0);
    expect(after, "the check-in renders in the SAME element").toBe(before);
    expect(after.textContent).toContain("Still loading");
    expect(after.textContent).toContain("Restart");
    expect(
      after.getAttribute("aria-busy"),
      "aria-busy stays true: the request IS still in flight, and dropping it would announce a completion that has not happened",
    ).toBe("true");
    expect(
      after.hasAttribute("aria-disabled"),
      "aria-disabled is gone, because the control now does something",
    ).toBe(false);
  });

  test("the check-in announces once per entry, and says nothing before the deadline", () => {
    renderGallery();
    enterPending(0);
    act(() => {
      vi.advanceTimersByTime(RETRY_CHECK_IN_MS - 1);
    });
    expect(
      announcements().filter((m) => m.includes("still loading")),
      "nothing is announced before the deadline",
    ).toEqual([]);

    crossDeadline();
    const first = announcements().filter((m) => m.includes("still loading"));
    expect(first, "exactly one check-in announcement").toHaveLength(1);
    expect(first[0]).toContain("Diagram 1");

    // A re-render must not speak again. The latch is per ENTRY, not per commit.
    act(() => {
      vi.advanceTimersByTime(RETRY_CHECK_IN_MS);
    });
    expect(
      announcements().filter((m) => m.includes("still loading")),
      "a later tick does not re-announce the same entry",
    ).toHaveLength(1);
  });

  test("Restart mounts a DIFFERENT image node, and the check-in kept the SAME one", () => {
    renderGallery();
    enterPending(0);
    const duringPending = imageIn(0);
    premiseHolds("the in-flight cell renders an image to identify", duringPending !== null);

    crossDeadline();
    // AC-5 and AC-8 are OPPOSITE ON PURPOSE and share this test, because a repair
    // satisfying one by breaking the other is the failure mode. Across the
    // CHECK-IN the node must survive; across RESTART it must not.
    expect(
      imageIn(0),
      "AC-5: the check-in does not remount the image, so one tap stays one request",
    ).toBe(duringPending);

    act(() => {
      fireEvent.click(inFlight(0));
    });

    const afterRestart = imageIn(0);
    expect(afterRestart, "AC-8: Restart mounts an image again").not.toBeNull();
    expect(
      afterRestart,
      "AC-8: and it is a DIFFERENT node, which is where the fresh request comes from. A presence check would pass on a design that never remounted and so never re-fetched",
    ).not.toBe(duringPending);
  });

  test("AC-8b: the replacement request gets its own full window", () => {
    renderGallery();
    enterPending(0);
    crossDeadline();
    premiseHolds(
      "the item is checked in, so Restart is reachable",
      inFlight(0).textContent?.includes("Still loading") === true,
    );

    act(() => {
      fireEvent.click(inFlight(0));
    });
    // Back to `pending`: the copy reverts, which is the observable proof the
    // phase moved rather than the label alone changing.
    expect(inFlight(0).textContent).toContain("Retrying");

    act(() => {
      vi.advanceTimersByTime(RETRY_CHECK_IN_MS - 1);
    });
    expect(
      inFlight(0).textContent?.includes("Still loading"),
      "the replacement waits a FULL window, not the remainder of the old one",
    ).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(inFlight(0).textContent).toContain("Still loading");
  });

  test("the check-in after Restart announces AGAIN, because it is a new window", () => {
    renderGallery();
    enterPending(0);
    crossDeadline();
    const spoken = () => announcements().filter((m) => m.includes("is still loading")).length;
    premiseHolds(
      "the first check-in announced, so a second one has something to differ from",
      spoken() === 1,
    );

    act(() => {
      fireEvent.click(inFlight(0));
    });
    crossDeadline();

    // AC-8b already pins that the replacement gets its OWN full window. A window
    // of its own ends in a check-in of its own, and a check-in nobody is told
    // about is a control that silently becomes actionable: the sighted user
    // watches the copy change, the screen-reader user hears nothing. The
    // announced-set is keyed to the CURRENT checked-in occupancy, not to the
    // lifetime of the id, which is why passing through `restarting` clears it.
    expect(inFlight(0).textContent, "the second window really did check in").toContain(
      "Still loading",
    );
    expect(spoken(), "and it was announced, exactly once more").toBe(2);
  });

  test("AC-10: no committed frame during Restart shows the failed control, and focus never moves", () => {
    renderGallery();
    enterPending(0);
    crossDeadline();
    const control = inFlight(0);
    act(() => {
      control.focus();
    });
    premiseHolds("the overlay holds focus before the press", document.activeElement === control);

    // A MutationObserver records mutation FACTS and LIVE node references, not a
    // snapshot per commit, so `record.target.getAttribute(...)` yields the
    // CURRENT value. Only `addedNodes` is preserved, so element PRESENCE is the
    // thing this can honestly assert.
    const addedFailedControls: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        for (const node of r.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches?.("[data-testid^='diagram-retry-']")) addedFailedControls.push("self");
          if (node.querySelector?.("[data-testid^='diagram-retry-']"))
            addedFailedControls.push("descendant");
        }
      }
    });
    observer.observe(slot(0), {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
    });

    // Focus needs its OWN instrument: a MutationObserver records no focus at
    // all, and sampling activeElement before and after passes when one commit
    // moves focus and the next restores it. An EMPTY event log is the only
    // evidence focus never moved, as opposed to moved and came back.
    const focusEvents: string[] = [];
    const onFocusOut = () => focusEvents.push("focusout");
    const onFocusIn = () => focusEvents.push("focusin");
    slot(0).addEventListener("focusout", onFocusOut);
    slot(0).addEventListener("focusin", onFocusIn);

    act(() => {
      fireEvent.click(control);
    });
    observer.takeRecords();
    observer.disconnect();
    slot(0).removeEventListener("focusout", onFocusOut);
    slot(0).removeEventListener("focusin", onFocusIn);

    expect(
      addedFailedControls,
      "the failed control is never committed during Restart. Asserted by TESTID, not by the phrase 'could not be loaded', because the in-flight name legitimately contains it",
    ).toEqual([]);
    expect(focusEvents, "focus never left the overlay, not even for one commit").toEqual([]);
    expect(document.activeElement, "and it still holds focus after").toBe(control);
  });

  test("a second item checked in at the same time is independent", () => {
    renderGallery();
    enterPending(0);
    enterPending(1);
    crossDeadline();
    for (const i of [0, 1]) {
      expect(inFlight(i).textContent, `slot ${i} checked in on its own timer`).toContain(
        "Still loading",
      );
    }
    expect(announcements().filter((m) => m.includes("still loading"))).toHaveLength(2);
  });
});
