// @vitest-environment jsdom
/**
 * tests/components/diagrams/gallery.failureRecovery.test.tsx
 *
 * DIAGRAM-FAILURE-RECOVERY-1 (DEFERRED.md) — characterization.
 *
 * The prior arc made a runtime thumbnail failure LEGIBLE: focus relocates and
 * the event is announced by name (pinned in `gallery.failedItem.test.tsx`).
 * What it did not do is make the failure RECOVERABLE. `failedKeys` in
 * `components/diagrams/Gallery.tsx` is only ever added to, so one dropped
 * request on venue wifi costs that diagram until the page is reloaded, and the
 * cell it leaves behind is a non-interactive `<div>` offering no next step.
 *
 * This file pins that terminal behavior as it stands TODAY. It is deliberately
 * written as characterization rather than as the failing half of a red-green
 * pair, because the affordance itself is an unanswered product decision (retry
 * the clamped tier / retry regardless / no affordance at all). Whichever way
 * that lands, the facts below are the ones the repair has to move, and under a
 * "no affordance" answer they become the documented record of why the row was
 * closed without a code change.
 *
 * ANTI-TAUTOLOGY POSTURE. "The image did not come back" is satisfied by a
 * fixture that could never have shown an image in the first place, so every
 * terminality assertion here is paired with a positive control that DOES bring
 * the image back through a different route (a fresh mount). A test that only
 * ever observes the placeholder proves nothing about persistence; one that
 * observes the placeholder survive a re-render while a remount clears it is
 * measuring the state, which is the actual defect.
 */
import { afterEach, describe, expect, test } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { Gallery, type GalleryItem } from "@/components/diagrams/Gallery";
import { premise, premiseHolds } from "@/tests/_shared/premise";

const SHOW_ID = "11111111-1111-4111-8111-111111111111";
const REV = "22222222-2222-4222-8222-222222222222";

function item(i: number, overrides: Partial<GalleryItem> = {}): GalleryItem {
  return {
    id: `embedded:obj-${i}`,
    key: `embedded-obj-${i}.png`,
    alt: `Plot ${i}`,
    available: true,
    variants: [],
    ...overrides,
  };
}

/** The cell for a 0-based visible slot, placeholder or not. */
function slot(index: number): HTMLElement {
  return screen.getByTestId(`diagram-slot-${index}`);
}

/** The thumbnail image in a slot, or null once the slot has gone to placeholder. */
function imageIn(index: number): HTMLImageElement | null {
  return within(slot(index)).queryByRole("img") as HTMLImageElement | null;
}

/** Drive the component's own onError for a slot. */
function failThumb(index: number): void {
  const img = imageIn(index);
  premiseHolds(
    `slot ${index} renders an image before the failure is driven — without one there is no onError to fire and the assertion below would pass on an empty cell`,
    img !== null,
  );
  act(() => {
    fireEvent.error(img as HTMLImageElement);
  });
}

/**
 * Every element in a subtree a keyboard or pointer user could act on.
 *
 * Deliberately NOT `getAllByRole("button")`: the claim is that the cell offers
 * no next step of ANY kind, and a `<div role="link">`, an anchor, or a bare
 * `tabindex="0"` would each satisfy a button-only query while falsifying the
 * claim. The set is derived from the DOM rather than enumerated per element
 * type for the same reason.
 */
function interactiveWithin(root: HTMLElement): Element[] {
  return [
    ...root.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"], [role="link"]',
    ),
  ];
}

afterEach(() => cleanup());

describe("DIAGRAM-FAILURE-RECOVERY-1 — a failed thumbnail offers no next step", () => {
  test("the cell left behind holds NO interactive element of any kind", () => {
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);

    premise(
      "the healthy cell is interactive, so an empty result after the failure is a change and not the fixture's baseline",
      interactiveWithin(slot(0)).length,
      0,
    );

    failThumb(0);

    expect(
      interactiveWithin(slot(0)),
      "the failed cell is a dead end: nothing to click, nothing to tab to, no way to ask for the image again",
    ).toEqual([]);
    // The sibling is the control. If the whole grid went inert, the assertion
    // above would be measuring an unmount rather than the placeholder branch.
    expect(interactiveWithin(slot(1)).length).toBeGreaterThan(0);
  });

  test("the failure IS announced — the gap is the next step, not the signal", () => {
    // Stated here so the characterization cannot be misread as "nothing
    // happens". The prior arc's repair works; this row is about what comes
    // after it.
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);
    const region = screen.getByTestId("gallery-announce-log");
    const before = [...region.querySelectorAll("[data-announce-id]")].length;

    failThumb(0);

    const after = [...region.querySelectorAll("[data-announce-id]")].map((n) => n.textContent);
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1]).toContain("could not be loaded");
  });
});

describe("DIAGRAM-FAILURE-RECOVERY-1 — the failure outlives everything but a reload", () => {
  test("a re-render with IDENTICAL props leaves the cell failed", () => {
    const items = [item(1), item(2)];
    const view = render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={items} />);

    failThumb(0);
    premiseHolds(
      "the slot is in its failed state before the re-render, or the re-render is being asked to restore something that never broke",
      imageIn(0) === null,
    );

    // The parent re-rendering — a poll landing, a sibling tile updating, any
    // state change above the Gallery — is the cheapest thing that could plausibly
    // clear this, and it does not: `failedKeys` lives in the component.
    view.rerender(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={items} />);

    expect(
      imageIn(0),
      "the item is still `available: true` in props, and still shows a placeholder",
    ).toBeNull();
  });

  test("POSITIVE CONTROL: a fresh mount restores it, so the placeholder is session state and not the item", () => {
    const items = [item(1), item(2)];
    const view = render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={items} />);

    failThumb(0);
    premiseHolds("the slot is failed before the remount", imageIn(0) === null);

    // Unmount + mount is exactly what a page reload does, and it is the ONLY
    // route back. That is the cost the ledger row is about: the crew member has
    // no reason to suspect a reload would help, so in practice the diagram is
    // gone for the rest of the visit.
    view.unmount();
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={items} />);

    expect(
      imageIn(0),
      "the image comes back on a fresh mount — proving the assertions above measure retained state, not an unrenderable fixture",
    ).not.toBeNull();
  });

  test("a parse-time-unavailable item reaches the SAME placeholder, and is NOT the same case", () => {
    // Load-bearing for whatever repair lands: `!item.available` and a runtime
    // failure share one render branch (Gallery.tsx), but only the second has an
    // asset behind it. A retry affordance painted on the shared branch would
    // offer to re-fetch something that was never published.
    render(
      <Gallery
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={[item(1, { available: false }), item(2)]}
      />,
    );

    expect(imageIn(0)).toBeNull();
    expect(interactiveWithin(slot(0))).toEqual([]);
    // Indistinguishable from the failed cell in the DOM today. Any repair that
    // adds a control has to split them.
    expect(slot(0).getAttribute("data-unavailable")).toBe("true");
  });
});
