// @vitest-environment jsdom
/**
 * tests/components/diagrams/gallery.transitions.test.tsx
 * (spec 2026-08-29-diagram-failure-retry §9; plan Task 9 — AC-6)
 *
 * THIS IS A GUARD, NOT A RED-GREEN PAIR, and the plan says so after three wrong
 * attempts to claim otherwise. By the time this task runs the implementation is
 * already correct, so there is no natural defect for a new assertion to catch.
 * The red was PLANTED: make the failed -> retrying swap animate, observe this
 * same command red, revert, observe green. Recorded in the commit, because a
 * reader cannot otherwise tell a discriminating guard from a decorative one.
 *
 * Every row of §9's inventory is asserted, not sampled. The rows are mostly
 * "instant, no animation", and the way to assert an ABSENCE of animation without
 * a tautology is to assert the positive fact that makes it true: the node
 * survives the transition (so nothing can animate in or out), and no
 * presence-wrapper is introduced around the swapping element.
 */
import { afterEach, describe, expect, test } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
    variants: [{ width: 256, key: `${key}@256.webp` }],
    ...overrides,
  };
}

const slot = (i: number) => screen.getByTestId(`diagram-slot-${i}`);
const imageIn = (i: number) => within(slot(i)).queryByRole("img") as HTMLImageElement | null;

function failThumb(i: number): void {
  const img = imageIn(i);
  premiseHolds(`slot ${i} renders an image to fail`, img !== null);
  act(() => {
    fireEvent.error(img as HTMLImageElement);
  });
}

async function loadImage(i: number): Promise<void> {
  const img = imageIn(i);
  premiseHolds(`slot ${i} has an image to load`, img !== null);
  await act(async () => {
    fireEvent.load(img as HTMLImageElement);
    await Promise.resolve();
  });
}

afterEach(() => cleanup());

describe("Task 9 — §9's transition inventory, every row", () => {
  test("idle → failed: instant swap, and the SAME node carries it", () => {
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);
    const before = within(slot(0)).getByRole("button");

    failThumb(0);

    // React reuses the button rather than swapping elements, which is what makes
    // the swap instant by construction: there is no exit for anything to animate.
    const after = within(slot(0)).getByTestId("diagram-retry-0");
    expect(after, "the transition happens within one node").toBe(before);
  });

  test("failed → retrying: instant label swap, image mounts in the SAME commit", () => {
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);
    failThumb(0);

    act(() => {
      fireEvent.click(within(slot(0)).getByTestId("diagram-retry-0"));
    });

    // Both halves of the row, in one commit: the overlay is up AND the image is
    // already mounted beneath it. If the image arrived a commit later the user
    // would see the overlay over an empty cell.
    expect(within(slot(0)).queryByTestId("diagram-retrying-0")).not.toBeNull();
    expect(imageIn(0), "the image mounts beneath the overlay, not after it").not.toBeNull();
  });

  test("retrying → idle: the overlay unmounts and the image is revealed in one commit", async () => {
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);
    failThumb(0);
    act(() => {
      fireEvent.click(within(slot(0)).getByTestId("diagram-retry-0"));
    });
    const during = imageIn(0);

    await loadImage(0);

    expect(within(slot(0)).queryByTestId("diagram-retrying-0"), "overlay gone").toBeNull();
    expect(imageIn(0), "and the SAME image is what remains").toBe(during);
  });

  test("retrying → failed: instant label swap back, same node", () => {
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);
    failThumb(0);
    act(() => {
      fireEvent.click(within(slot(0)).getByTestId("diagram-retry-0"));
    });
    const inFlight = imageIn(0);
    premiseHolds("the retry mounted an image to fail", inFlight !== null);

    act(() => {
      fireEvent.error(inFlight as HTMLImageElement);
    });

    expect(within(slot(0)).queryByTestId("diagram-retrying-0")).toBeNull();
    expect(within(slot(0)).queryByTestId("diagram-retry-0"), "back to the offer").not.toBeNull();
  });

  test("idle → retrying is UNREACHABLE by construction, not merely untested", () => {
    // The row says unreachable, so the assertion is about the code rather than
    // about a rendered state: `retrying` is entered from exactly one place, and a
    // future edit adding a second entry point should fail here rather than
    // silently making the inventory wrong.
    const src = readFileSync(join(process.cwd(), "components/diagrams/Gallery.tsx"), "utf8");
    premiseHolds("the component source was read", src.includes("export function Gallery"));
    // A raw count of writer sites was the first version of this and it was both
    // wrong and weak: wrong because there are several (entry, two exits, the
    // sweep's clear), and weak because the row's claim is not "how many writes"
    // but "how many ENTRIES". So the oracle counts the writes that ADD a phase,
    // which is what entering an in-flight phase means.
    //
    // The setter is `setRetryPhase` and the container is a Map since the check-in
    // work folded that dimension into the retry state itself. This recognizer
    // keyed on the literal source form, so it stopped matching at the rename and
    // reported ZERO entries rather than failing loudly: a recognizer over source
    // text is only ever as durable as the spelling it was written against, which
    // is worth knowing before writing the next one.
    const writes = [...src.matchAll(/setRetryPhase\(\(prev\) => \{[\s\S]*?\n {4}\}\);/g)].map(
      (m) => m[0],
    );
    premiseHolds("the setRetryPhase writes were located at all", writes.length >= 2);
    // ENTRY, not "any write that sets a phase". Since the check-in landed there
    // are two writers calling `next.set(`: the tap handler, which ENTERS the
    // in-flight state at `pending`, and the timer callback, which moves an item
    // ALREADY in it to `checked-in`. The row's claim is about reaching the
    // in-flight state from outside, so the oracle keys on the entry phase. An
    // earlier version counted both and reported two entry points, which would
    // have made this row read as violated by a transition that is not an entry.
    const adders = writes.filter((w) => w.includes('next.set(item.id, "pending")'));
    expect(
      adders.length,
      "`retrying` has exactly ONE entry point, so idle -> retrying cannot be reached",
    ).toBe(1);
    expect(
      adders[0],
      "and that entry is the tap handler's, guarded on the item already being failed",
    ).toContain("prev.has(item.id)");
  });

  test("session state ↔ unavailable is instant BOTH ways, and does not remount the cell", () => {
    const view = render(
      <Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />,
    );
    const cellBefore = slot(0);
    failThumb(0);

    view.rerender(
      <Gallery
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={[item(1, { available: false }), item(2)]}
      />,
    );
    expect(slot(0), "the cell itself survives the flip").toBe(cellBefore);

    view.rerender(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);
    expect(slot(0), "and survives the flip back").toBe(cellBefore);
  });

  test("no AnimatePresence wraps the cell's own state swap", () => {
    // The absence claim, made against the source because it is a claim about
    // STRUCTURE. Review R3 refuted an earlier reading of this: the only
    // AnimatePresence in the file wraps the LIGHTBOX, not the cell ternary, and
    // this pins that it stays that way.
    const src = readFileSync(join(process.cwd(), "components/diagrams/Gallery.tsx"), "utf8");
    const presences = [...src.matchAll(/<AnimatePresence/g)].length;
    expect(presences, "exactly one presence wrapper, and it is the lightbox's").toBe(1);
    const afterPresence = src.slice(src.indexOf("<AnimatePresence"));
    expect(
      afterPresence.slice(0, 400),
      "the presence wrapper's subject is the dialog, not a gallery cell",
    ).toContain("GalleryLightbox");
  });
});

describe("Task 9 — the compound transitions §9 names", () => {
  test("a sibling failing while this cell retries disturbs neither", () => {
    render(
      <Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2), item(3)]} />,
    );
    failThumb(0);
    act(() => {
      fireEvent.click(within(slot(0)).getByTestId("diagram-retry-0"));
    });

    failThumb(1);

    expect(within(slot(0)).queryByTestId("diagram-retrying-0"), "still in flight").not.toBeNull();
    expect(
      within(slot(1)).queryByTestId("diagram-retry-1"),
      "sibling offers its own",
    ).not.toBeNull();
  });

  test("a DOUBLE TAP issues one retry, not two", () => {
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);
    failThumb(0);
    const control = within(slot(0)).getByTestId("diagram-retry-0");

    act(() => {
      fireEvent.click(control);
      fireEvent.click(control);
    });

    // The second tap lands on a control that is already gone: the branch swapped
    // on the first. What must NOT happen is two overlays or a re-entered state.
    expect(within(slot(0)).queryAllByTestId("diagram-retrying-0")).toHaveLength(1);
  });

  test("a retry succeeding for an item that went unavailable meanwhile strands nothing", async () => {
    const view = render(
      <Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />,
    );
    failThumb(0);
    act(() => {
      fireEvent.click(within(slot(0)).getByTestId("diagram-retry-0"));
    });

    view.rerender(
      <Gallery
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={[item(1, { available: false }), item(2)]}
      />,
    );
    view.rerender(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);

    expect(within(slot(0)).queryByTestId("diagram-retrying-0"), "no stranded overlay").toBeNull();
    expect(within(slot(0)).queryByTestId("diagram-retry-0"), "and no stranded offer").toBeNull();
  });
});
