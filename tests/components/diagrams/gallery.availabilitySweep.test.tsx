// @vitest-environment jsdom
/**
 * tests/components/diagrams/gallery.availabilitySweep.test.tsx
 * (spec 2026-08-29-diagram-failure-retry §9.1; plan Task 7 — AC-11, AC-14)
 *
 * An item that goes unavailable and comes back must return to `idle`, holding
 * none of the session state its earlier life accumulated.
 *
 * THE ORACLE IS THE DOM, NOT THE REGISTRY. `perItemStateRegistry.ts` guarantees
 * the LIST is complete and that every member carries a decision; it has no setup
 * hook and no observation hook, so a test cannot iterate it to seed or inspect
 * private state. What this file guarantees is the other half -- that the
 * behaviour matches the decision, member by member, through what the component
 * actually renders. That split is documented limit 7 in the spec, and it exists
 * because a `swept: true` recorded an intention rather than a behaviour once
 * already (plan review R5, the Reset chip).
 *
 * EVERY CASE ASSERTS THE SETTLED RENDER and says so. An earlier draft promised
 * the FIRST render after the flip; review R5 refuted that with an executed React
 * probe, because Testing Library's `rerender` only ever observes the settled
 * state. What closes the single-frame hazard is the PREDICATE, not the
 * assertion.
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

afterEach(() => cleanup());

describe("Task 7 — the gallery's availability sweep (AC-11)", () => {
  test("`failedKeys`: an item that goes unavailable and returns is idle, not failed", () => {
    const view = render(
      <Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />,
    );
    failThumb(0);
    premiseHolds(
      "the item really failed first, or the return proves nothing",
      within(slot(0)).queryByTestId("diagram-retry-0") !== null,
    );

    // Away and back. The prop flip is the round trip the crew member sees when a
    // sync removes a diagram and the next one restores it.
    view.rerender(
      <Gallery
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={[item(1, { available: false }), item(2)]}
      />,
    );
    view.rerender(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);

    expect(
      within(slot(0)).queryByTestId("diagram-retry-0"),
      "no retained control: the failure did not survive the round trip",
    ).toBeNull();
    expect(imageIn(0), "and the image is back").not.toBeNull();
  });

  test("`retrying`: an item that goes unavailable MID-FLIGHT does not return holding an overlay", () => {
    // The nastier half. A stranded `Retrying…` is worse than a stranded failure:
    // it claims a request is in flight for an item whose request was abandoned
    // when the slide unmounted, so the cell lies indefinitely.
    const view = render(
      <Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />,
    );
    failThumb(0);
    act(() => {
      fireEvent.click(within(slot(0)).getByTestId("diagram-retry-0"));
    });
    premiseHolds(
      "the item really was in flight before it went away",
      within(slot(0)).queryByTestId("diagram-retrying-0") !== null,
    );

    view.rerender(
      <Gallery
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={[item(1, { available: false }), item(2)]}
      />,
    );
    view.rerender(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);

    expect(
      within(slot(0)).queryByTestId("diagram-retrying-0"),
      "no stranded in-flight overlay on the returning item",
    ).toBeNull();
    expect(imageIn(0)).not.toBeNull();
  });

  test("an item REMOVED from items, then restored, is also idle", () => {
    // Keyed on the rendered id SET rather than on `item.available`, because an
    // item removed from `items` never flips that prop -- it simply stops being
    // rendered. A sweep watching only the flag would miss this path entirely
    // (spec §9.1).
    const view = render(
      <Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />,
    );
    failThumb(0);
    premiseHolds(
      "the item failed before removal",
      within(slot(0)).queryByTestId("diagram-retry-0") !== null,
    );

    view.rerender(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(2)]} />);
    view.rerender(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);

    expect(
      within(slot(0)).queryByTestId("diagram-retry-0"),
      "a removed-and-restored item is not still failed",
    ).toBeNull();
    expect(imageIn(0)).not.toBeNull();
  });

  test("POSITIVE CONTROL: an item that never leaves KEEPS its failure", () => {
    // Without this the sweep could clear on every render and all three cases
    // above would still pass, while the retry control vanished under the user
    // between one parent render and the next.
    const view = render(
      <Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />,
    );
    failThumb(0);

    view.rerender(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);

    expect(
      within(slot(0)).queryByTestId("diagram-retry-0"),
      "an ordinary re-render does not sweep anything",
    ).not.toBeNull();
  });
});
