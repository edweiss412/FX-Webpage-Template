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

  test("`retrying` does not survive the cell UNMOUNTING via Show fewer", () => {
    // Found by the invariant-8 audit. The sweep keys on `items`, but collapsing
    // the grid unmounts a cell without removing its item, so a retry in flight
    // when the user collapses comes back on re-expand still claiming `Retrying…`
    // with `aria-busy="true"` -- for a request the unmount abandoned. The cell
    // lies about work that is not happening.
    //
    // `retrying` is tied to a MOUNTED ELEMENT; `failedKeys` is tied to the ITEM.
    // That is the distinction the fix rests on, and the next case pins the other
    // half of it.
    // The retried item must be one that COLLAPSING actually unmounts, i.e. past
    // INITIAL_VISIBLE (12). An item inside the first twelve is on screen either
    // way, so collapsing would not exercise the unmount at all -- the first
    // version of this case retried slot 0 and proved nothing.
    const many = Array.from({ length: 14 }, (_v, i) => item(i + 1));
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={many} />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /show all/i }));
    });
    failThumb(13);
    act(() => {
      fireEvent.click(within(slot(13)).getByTestId("diagram-retry-13"));
    });
    premiseHolds(
      "the item is really in flight before the collapse",
      within(slot(13)).queryByTestId("diagram-retrying-13") !== null,
    );

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /show fewer/i }));
    });
    premiseHolds(
      "the collapse really unmounted that cell, or there is no abandonment to test",
      screen.queryByTestId("diagram-slot-13") === null,
    );
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /show all/i }));
    });

    expect(
      within(slot(13)).queryByTestId("diagram-retrying-13"),
      "no stale in-flight claim for a request the unmount abandoned",
    ).toBeNull();
  });

  test("`failedKeys` DOES survive Show fewer, because it is about the item", () => {
    // The other half. Without this the fix above could clear both sets on any
    // collapse, losing a real failure the user should still see offered.
    const many = Array.from({ length: 14 }, (_v, i) => item(i + 1));
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={many} />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /show all/i }));
    });
    failThumb(13);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /show fewer/i }));
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /show all/i }));
    });

    expect(
      within(slot(13)).queryByTestId("diagram-retry-13"),
      "the failure is a fact about the diagram, not about whether it was on screen",
    ).not.toBeNull();
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

/**
 * Whole-diff review R2, findings 1 and 2 — both RECURRENCES of R1 classes at
 * sites the R1 repair did not reach. Recorded plainly because the lesson is
 * mine: R1 named two instances, I repaired those two instances, and the next
 * round found the same two classes elsewhere. The repair below is therefore one
 * mechanism per class rather than two more per-site patches.
 */
describe("R2: removal paths, swept as classes rather than as instances", () => {
  test("finding 2: an in-flight retry collapsed away returns as FAILED, not idle", () => {
    const many = Array.from({ length: 14 }, (_, i) => item(i + 1));
    render(<Gallery showId={SHOW_ID} rev={REV} items={many} />);

    // Expand so item 13 is rendered, fail it, and start a retry.
    // The toggle carries no testid; it is found by its accessible name, which
    // is also what a user has.
    const toggle = () => screen.getByRole("button", { name: /Show all|Show fewer/ });
    act(() => fireEvent.click(toggle()));
    const img = within(screen.getByTestId("diagram-slot-13")).queryByRole("img");
    premiseHolds("item 13 is rendered once expanded, so it can fail", img !== null);
    act(() => fireEvent.error(img as HTMLImageElement));
    act(() =>
      fireEvent.click(
        within(screen.getByTestId("diagram-slot-13")).getByTestId("diagram-retry-13"),
      ),
    );
    premiseHolds(
      "the retry is genuinely in flight before we collapse",
      within(screen.getByTestId("diagram-slot-13")).queryByTestId("diagram-retrying-13") !== null,
    );

    // "Show fewer" unmounts the cell, abandoning the request; re-expand returns.
    act(() => fireEvent.click(toggle()));
    act(() => fireEvent.click(toggle()));

    const slot = screen.getByTestId("diagram-slot-13");
    expect(
      within(slot).queryByTestId("diagram-retrying-13"),
      "the abandoned request does not come back claiming to be in flight",
    ).toBeNull();
    // The half that was broken: it came back IDLE, mounting a fresh request for
    // a diagram known to have failed, instead of offering the retry again.
    expect(
      within(slot).queryByTestId("diagram-retry-13"),
      "and the known failure is restored, so the user still has a next step",
    ).not.toBeNull();
  });

  test("finding 1: a prop-driven removal under focus does not strand it on <body>", () => {
    const { rerender } = render(<Gallery showId={SHOW_ID} rev={REV} items={[item(1), item(2)]} />);
    const img = within(screen.getByTestId("diagram-slot-1")).queryByRole("img");
    premiseHolds("slot 1 renders an image to fail", img !== null);
    act(() => fireEvent.error(img as HTMLImageElement));
    const control = within(screen.getByTestId("diagram-slot-1")).getByTestId("diagram-retry-1");
    act(() => control.focus());
    premiseHolds(
      "the retry control held focus before the prop change",
      document.activeElement === control,
    );

    // The item leaves `items` entirely — no availability flag involved.
    rerender(<Gallery showId={SHOW_ID} rev={REV} items={[item(2)]} />);

    expect(document.activeElement, "focus never falls to <body>").not.toBe(document.body);
    expect(document.activeElement?.isConnected, "and lands on a connected node").toBe(true);
  });
});

describe("R2 finding 1: the exact variants the reviewer probed", () => {
  const rerenderWith = (view: ReturnType<typeof render>, items: GalleryItem[]) =>
    view.rerender(<Gallery showId={SHOW_ID} rev={REV} items={items} />);

  test("a focused RETRYING OVERLAY followed by available:false", () => {
    const view = render(<Gallery showId={SHOW_ID} rev={REV} items={[item(1), item(2)]} />);
    const img = within(screen.getByTestId("diagram-slot-1")).queryByRole("img");
    premiseHolds("slot 1 renders an image", img !== null);
    act(() => fireEvent.error(img as HTMLImageElement));
    act(() =>
      fireEvent.click(within(screen.getByTestId("diagram-slot-1")).getByTestId("diagram-retry-1")),
    );
    const overlay = within(screen.getByTestId("diagram-slot-1")).getByTestId("diagram-retrying-1");
    act(() => overlay.focus());
    premiseHolds("the overlay held focus", document.activeElement === overlay);

    rerenderWith(view, [item(1, { available: false }), item(2)]);

    expect(document.activeElement, "focus never falls to <body>").not.toBe(document.body);
    expect(document.activeElement?.isConnected, "and lands on a connected node").toBe(true);
  });

  test("a focused FAILED control followed by available:false", () => {
    const view = render(<Gallery showId={SHOW_ID} rev={REV} items={[item(1), item(2)]} />);
    const img = within(screen.getByTestId("diagram-slot-1")).queryByRole("img");
    premiseHolds("slot 1 renders an image", img !== null);
    act(() => fireEvent.error(img as HTMLImageElement));
    const control = within(screen.getByTestId("diagram-slot-1")).getByTestId("diagram-retry-1");
    act(() => control.focus());
    premiseHolds("the control held focus", document.activeElement === control);

    rerenderWith(view, [item(1, { available: false }), item(2)]);

    expect(document.activeElement, "focus never falls to <body>").not.toBe(document.body);
    expect(document.activeElement?.isConnected, "and lands on a connected node").toBe(true);
  });
});
