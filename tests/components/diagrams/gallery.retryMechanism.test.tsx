// @vitest-environment jsdom
/**
 * tests/components/diagrams/gallery.retryMechanism.test.tsx
 *
 * Task 2 of the diagram-failure-retry plan: the GALLERY's retry mechanism
 * (AC-4, AC-10, and the jsdom-observable half of AC-1). Scope is the gallery
 * only -- the lightbox gets its own copy in Task 5, whose red depends on this
 * one not reaching across.
 *
 * ANTI-TAUTOLOGY POSTURE.
 *   - Node identity (§4.0.5) is asserted by TAGGING the element before the
 *     retry and re-reading the same tag after. "An image is present" is
 *     satisfied by a remounted image, which is the exact defect the rule
 *     exists to prevent: the asset route sends `must-revalidate` with no
 *     validator, so a remount is a second unconditional GET and the user pays
 *     twice for one tap.
 *   - AC-4's attributes are asserted individually rather than as "the control
 *     is disabled", because the native `disabled` attribute would satisfy a
 *     loose reading while dropping focus to `<body>` -- the §7.1 defect.
 *   - AC-10 drives a SECOND failure through the component's own `onError`,
 *     not by re-rendering a failed fixture, because the defect is a ref that
 *     survives the round trip.
 */
import { afterEach, describe, expect, test } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { Gallery, type GalleryItem } from "@/components/diagrams/Gallery";
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

function failThumb(i: number): void {
  const img = imageIn(i);
  premiseHolds(`slot ${i} renders an image, so there is an onError to fire`, img !== null);
  act(() => {
    fireEvent.error(img as HTMLImageElement);
  });
}

/**
 * The IN-FLIGHT control specifically. A retrying cell holds two buttons -- the
 * image's own open button, which survives because the image does (§4.0.5), and
 * the overlay above it. `getByRole("button")` is therefore ambiguous, and
 * resolving that ambiguity by taking the first match would silently pin
 * whichever one the DOM happens to order first.
 */
function inFlightControl(i: number): HTMLElement {
  return within(slot(i)).getByTestId(`diagram-retrying-${i}`);
}

function tapRetry(i: number): void {
  const btn = within(slot(i)).getByTestId(`diagram-retry-${i}`);
  act(() => {
    fireEvent.click(btn);
  });
}

afterEach(() => cleanup());

describe("Task 2 — the gallery retry mechanism", () => {
  test("AC-4: the in-flight control is busy and aria-disabled, but NOT natively disabled", () => {
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);
    failThumb(0);
    tapRetry(0);

    const busy = inFlightControl(0);
    expect(busy.textContent).toContain("Retrying…");
    expect(busy.getAttribute("aria-busy"), "AC-4: aria-busy while in flight").toBe("true");
    expect(busy.getAttribute("aria-disabled"), "AC-4: aria-disabled while in flight").toBe("true");
    // Load-bearing, not pedantry: a natively disabled control is removed from
    // the tab order, and the browser drops focus to `<body>` -- outside any
    // dialog -- which is the §7.1 defect this arc also repairs.
    expect(busy.hasAttribute("disabled"), "AC-4: never the native disabled attribute").toBe(false);
  });

  test("AC-4: focus stays on the control across failed -> retrying", () => {
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);
    failThumb(0);

    const control = within(slot(0)).getByTestId("diagram-retry-0");
    act(() => control.focus());
    premiseHolds("the control held focus before the tap", document.activeElement === control);

    act(() => {
      fireEvent.click(control);
    });

    // NOT merely "focus is not on <body>": that passes trivially while the tap
    // does nothing at all, which is the state this test was written against.
    // The claim is that focus is on the control IN ITS IN-FLIGHT FORM, so the
    // assertion only holds once the transition actually happens.
    const focused = document.activeElement as HTMLElement | null;
    expect(
      focused,
      "focus never falls to <body> on a transition that changes the control",
    ).not.toBe(document.body);
    expect(
      focused?.getAttribute("aria-busy"),
      "the element still holding focus is the in-flight control itself",
    ).toBe("true");
    expect(slot(0).contains(focused), "and it is still the failed cell's own control").toBe(true);
  });

  test("§4.0.5: the image that loads is the SAME node the idle cell then shows", () => {
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);
    failThumb(0);
    tapRetry(0);

    const inFlight = imageIn(0);
    premiseHolds("the retrying cell mounts its image in final position", inFlight !== null);
    // Tag it. A remount produces a fresh element with no tag, so "an image is
    // present" cannot stand in for "the same image survived".
    inFlight!.dataset.identityProbe = "same-node";

    act(() => {
      fireEvent.load(inFlight as HTMLImageElement);
    });

    const settled = imageIn(0);
    expect(settled, "the cell still shows an image once loaded").not.toBeNull();
    expect(
      settled?.dataset.identityProbe,
      "the loaded node survives into idle: a remount would issue a second unconditional GET",
    ).toBe("same-node");
  });

  test("a retry that fails again returns to the failed control, not to a dead cell", () => {
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);
    failThumb(0);
    tapRetry(0);

    const inFlight = imageIn(0);
    premiseHolds("the retry mounted an image to fail", inFlight !== null);
    act(() => {
      fireEvent.error(inFlight as HTMLImageElement);
    });

    const again = within(slot(0)).getByTestId("diagram-retry-0");
    expect(again.textContent, "back to the offer, not stuck on Retrying…").toContain(
      "Tap to retry",
    );
    expect(again.getAttribute("aria-busy")).not.toBe("true");
    expect(
      within(slot(0)).queryByTestId("diagram-retrying-0"),
      "and the in-flight overlay is gone rather than layered under it",
    ).toBeNull();
  });

  test("AC-10: a SECOND failure after a successful retry still announces", () => {
    // The defect this pins is `pendingFailuresRef` surviving the round trip: the
    // id stays pending, so the next failure is discarded at the de-duplication
    // guard and the diagram breaks again in silence.
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);
    const region = screen.getByTestId("gallery-announce-log");
    const count = () => region.querySelectorAll("[data-announce-id]").length;

    failThumb(0);
    const afterFirst = count();
    premiseHolds("the first failure announced, so a silent second is a change", afterFirst > 0);

    tapRetry(0);
    const inFlight = imageIn(0);
    premiseHolds("the retry mounted an image", inFlight !== null);
    act(() => {
      fireEvent.load(inFlight as HTMLImageElement);
    });

    failThumb(0);

    expect(count(), "the second failure of a recovered item is announced, not swallowed").toBe(
      afterFirst + 1,
    );
  });
});
