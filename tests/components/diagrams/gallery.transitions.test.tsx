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
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Gallery, type GalleryItem } from "@/components/diagrams/Gallery";
import { RETRY_CHECK_IN_MS } from "@/components/diagrams/GalleryLightbox";
import { premiseHolds } from "@/tests/_shared/premise";

import { phaseWriters, phasesGuardedOn, phasesWritten } from "./phaseWriters";

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

/**
 * TASK 6 — the check-in's half of the audit (design 2026-08-31 §8 and §8.1).
 *
 * Six render states now, so fifteen unordered pairs. The describe above holds
 * the four-state rows that shipped 2026-08-29 and they are unchanged; this one
 * holds every row `checked-in` and `restarting` introduce, plus §8.1's ten
 * compound cases. Where a §8 row and a §8.1 case are the same event, ONE test
 * carries both labels rather than a second test manufactured to hit a count.
 *
 * THE RED WAS PLANTED, because Tasks 3 to 5 already shipped and every case here
 * is green on arrival. Recorded in the commit, per the cycle
 * tests/e2e/diagram-retry-dimensions.spec.ts:9-16 documents for its own sibling.
 *
 * The unreachable half-rows are not asserted one prose claim at a time. They all
 * read off ONE table: the closed set of phase writers, each with the phases it
 * writes and the phases it guards on. "`restarting` is entered only from
 * `checked-in`" is then a property of that table rather than eight separate
 * opinions about what no code does, and a ninth transition added later fails the
 * table instead of quietly making the inventory wrong.
 */
describe("Task 6 — §8's rows the check-in adds, and §8.1's compound cases", () => {
  const GALLERY = "components/diagrams/Gallery.tsx";
  const LIGHTBOX = "components/diagrams/GalleryLightbox.tsx";

  // ACCUMULATING, not a snapshot. The announce log expires each message on its
  // own timer, so advancing fake timers past that budget empties the region and
  // a snapshot oracle reports "nothing was announced" for a message that WAS.
  // Keyed by `data-announce-id`, so one message counts once however often the
  // region is sampled. Same defect, same repair, as gallery.retryCheckIn.
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

  const inFlight = (i: number) => within(slot(i)).getByTestId(`diagram-retrying-${i}`);
  const overlayOrNull = (i: number) => within(slot(i)).queryByTestId(`diagram-retrying-${i}`);
  const offerOrNull = (i: number) => within(slot(i)).queryByTestId(`diagram-retry-${i}`);

  function tapRetry(i: number): void {
    act(() => {
      fireEvent.click(within(slot(i)).getByTestId(`diagram-retry-${i}`));
    });
  }
  function enterPending(i: number): void {
    failThumb(i);
    tapRetry(i);
  }
  /** Every advance derives from the constant. A literal would assert the test's
   *  opinion of the deadline while the product's moved. */
  function advance(ms: number): void {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }
  function enterCheckedIn(i: number): void {
    enterPending(i);
    advance(RETRY_CHECK_IN_MS);
    premiseHolds(
      `slot ${i} reached the check-in`,
      inFlight(i).textContent?.includes("Still loading") === true,
    );
  }
  /** Press the check-in's Restart. The layout effect promotes `restarting` back
   *  to `pending` inside this same act, before paint. */
  function restart(i: number): void {
    act(() => {
      fireEvent.click(inFlight(i));
    });
  }

  const items = (n: number) => Array.from({ length: n }, (_, k) => item(k + 1));
  const renderGallery = (n = 2, overrides: Partial<GalleryItem> = {}) =>
    render(
      <Gallery
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(n).map((it, k) => (k === 0 ? { ...it, ...overrides } : it))}
      />,
    );

  test("§8 row 1, the idle ← failed direction: `failed` renders no image, so no onLoad can fire", () => {
    renderGallery();
    premiseHolds("the cell rendered an image to begin with", imageIn(0) !== null);

    failThumb(0);

    // The row's claim is not "onLoad is ignored from failed", it is that the
    // event has no source. A repair that kept the <img> mounted under the failed
    // control would make the row false without changing a single handler.
    expect(imageIn(0), "the failed branch mounts no image at all").toBeNull();
  });

  test("§8 row 5, idle ↔ unavailable: instant both ways, same cell, and no state to sweep", () => {
    const view = renderGallery();
    const cell = slot(0);

    view.rerender(
      <Gallery
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={[item(1, { available: false }), item(2)]}
      />,
    );
    expect(slot(0), "the cell survives the flip, so nothing can animate in or out").toBe(cell);
    expect(slot(0).getAttribute("data-unavailable")).toBe("true");
    expect(overlayOrNull(0), "an idle cell had no in-flight state to strand").toBeNull();
    expect(offerOrNull(0), "and no failure to offer a retry for").toBeNull();

    view.rerender(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);
    expect(slot(0)).toBe(cell);
    expect(slot(0).getAttribute("data-unavailable"), "and it returns to idle").toBeNull();
    expect(imageIn(0), "with its image back").not.toBeNull();
  });

  test("§8 row 9, failed ↔ unavailable: the sweep clears the failure, so the flip back is idle", () => {
    const view = renderGallery();
    failThumb(0);
    premiseHolds("the item is failed before the flip", offerOrNull(0) !== null);

    view.rerender(
      <Gallery
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={[item(1, { available: false }), item(2)]}
      />,
    );
    view.rerender(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);

    // The row's second direction, and the assertion that makes it mean something:
    // the cell comes back IDLE, not failed. A sweep that kept `failedKeys` would
    // return the offer for a request nobody made.
    expect(offerOrNull(0), "the failure did not survive the round trip").toBeNull();
    expect(imageIn(0), "the cell is idle again").not.toBeNull();
  });

  test("§8 row 10, retrying → checked-in: instant, in the SAME node, and nothing else moves", () => {
    renderGallery();
    enterPending(0);
    const overlay = inFlight(0);
    const img = imageIn(0);
    premiseHolds("the retry mounted an image that must survive the check-in", img !== null);

    advance(RETRY_CHECK_IN_MS);

    // Instant is asserted as the positive fact that makes it true: one node, so
    // there is no exit for anything to animate, and the copy swap happens inside
    // it. The image is the second half — the check-in must not disturb the
    // in-flight request, and a remounted <img> would issue a fresh GET.
    expect(inFlight(0), "the copy swaps inside the node that was already there").toBe(overlay);
    expect(imageIn(0), "and the in-flight request is untouched").toBe(img);
    expect(overlay.textContent).toContain("Still loading");
    expect(overlay.getAttribute("aria-busy"), "still in flight, and still says so").toBe("true");
  });

  test("§8 rows 13 and 11, checked-in → restarting → retrying: one node, one commit, a NEW image", () => {
    renderGallery();
    enterCheckedIn(0);
    const overlay = inFlight(0);
    const staleImg = imageIn(0);
    premiseHolds("there is an original request to replace", staleImg !== null);

    restart(0);

    // `restarting` is never a painted state: the layout effect promotes it back
    // to `pending` before paint, inside this same act. So the observable of row
    // 11's B-to-A direction is the REMOUNT — a different <img> element, which is
    // where the replacement ELEMENT comes from (the request is not new: U-1).
    expect(inFlight(0), "the overlay survives Restart, so focus never moves").toBe(overlay);
    expect(overlay.textContent, "and it is back to the plain in-flight copy").toContain("Retrying");
    expect(overlay.textContent).not.toContain("Still loading");
    expect(
      imageIn(0),
      "a DIFFERENT image node. The element is new; the REQUEST is not, per U-1",
    ).not.toBe(staleImg);
    expect(imageIn(0)).not.toBeNull();
  });

  test("§8 row 3 and §8.1 case 1: the image loads during the check-in, and wins in one commit", async () => {
    renderGallery();
    enterCheckedIn(0);
    const img = imageIn(0);
    premiseHolds("the check-in has an in-flight image to resolve", img !== null);

    await loadImage(0);

    // No intermediate frame: the id leaves the phase map on the same render that
    // reveals the image, so the overlay unmounts in that commit rather than in a
    // later one. The image identity is the other half — the cell reveals the
    // node that was already loading, not a remount.
    expect(overlayOrNull(0), "the overlay is gone with the check-in").toBeNull();
    expect(offerOrNull(0), "and no failed control appears on the way out").toBeNull();
    expect(imageIn(0), "the SAME image is what remains").toBe(img);
    expect(announcements()).toContain("Diagram 1 loaded.");
  });

  test("§8 row 7 and §8.1 case 2: the image errors during the check-in, and the copy does not persist", () => {
    renderGallery();
    enterCheckedIn(0);
    const img = imageIn(0);
    premiseHolds("the check-in has an in-flight image to fail", img !== null);

    act(() => {
      fireEvent.error(img as HTMLImageElement);
    });

    expect(overlayOrNull(0), "the in-flight overlay is gone").toBeNull();
    const offer = offerOrNull(0);
    expect(offer, "and the failed control is offered again").not.toBeNull();
    expect(offer?.textContent, "the check-in copy does not leak into it").not.toContain(
      "Still loading",
    );
    expect(announcements()).toContain("Diagram 1 still could not be loaded.");
  });

  test("§8 row 14 and §8.1 case 3: unavailable during the check-in, and the flip back is idle", () => {
    const view = renderGallery();
    enterCheckedIn(0);

    view.rerender(
      <Gallery
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={[item(1, { available: false }), item(2)]}
      />,
    );
    expect(overlayOrNull(0), "the placeholder renders immediately").toBeNull();
    expect(slot(0).getAttribute("data-unavailable")).toBe("true");

    view.rerender(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);
    expect(overlayOrNull(0), "the abandoned request is not resumed").toBeNull();
    expect(offerOrNull(0), "and nothing was stranded on the way through").toBeNull();
  });

  test("§8 row 12, retrying ↔ unavailable: the phase and its timer go together", () => {
    const view = renderGallery();
    enterPending(0);
    premiseHolds("the item is in flight before the flip", overlayOrNull(0) !== null);

    view.rerender(
      <Gallery
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={[item(1, { available: false }), item(2)]}
      />,
    );
    expect(overlayOrNull(0)).toBeNull();

    // The timer is the half a render assertion cannot see. If the sweep dropped
    // the phase but left the handle, this advance would fire a callback into a
    // component that has moved on; the assertion is that the cell stays idle
    // through the whole window rather than that nothing threw.
    view.rerender(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);
    advance(RETRY_CHECK_IN_MS * 2);
    expect(overlayOrNull(0), "no check-in for a request whose state is gone").toBeNull();
    expect(offerOrNull(0), "and the cell is idle, not failed").toBeNull();
    expect(announcements(), "and nothing was said about it").not.toContain(
      "Diagram 1 is still loading.",
    );
  });

  test("every UNREACHABLE half-row in §8 reads off ONE closed writer table", () => {
    // The table, per surface. `writes` is what a body puts INTO the map;
    // `guards` is what it compares against. The distinction is the whole content
    // of these rows: `restarting` is guarded on in two places and written in
    // one, and a recognizer that conflated them would report two entries into a
    // state that has one.
    for (const file of [GALLERY, LIGHTBOX]) {
      const writers = phaseWriters(file);
      premiseHolds(`${file}: the walk found phase writers at all`, writers.length > 0);
      const table = writers.map((w) => ({
        at: `${w.file}:${w.line}`,
        writes: phasesWritten(w.body),
        guards: phasesGuardedOn(w.body),
      }));

      const writesRestarting = table.filter((r) => r.writes.includes("restarting"));
      expect(
        writesRestarting.map((r) => r.at),
        `${file}: \`restarting\` has exactly one entry`,
      ).toHaveLength(1);
      expect(
        writesRestarting[0]?.guards,
        `${file}: and it is entered only from \`checked-in\`, which closes idle/restarting, ` +
          "failed/restarting and retrying/restarting in the A-to-B direction",
      ).toEqual(["checked-in"]);

      const guardsRestarting = table.filter((r) => r.guards.includes("restarting"));
      expect(
        guardsRestarting.map((r) => r.at),
        `${file}: exactly one writer acts on \`restarting\``,
      ).toHaveLength(1);
      expect(
        guardsRestarting[0]?.writes,
        `${file}: and its only exit is \`pending\`, which closes the B-to-A direction of ` +
          "idle/restarting, failed/restarting and checked-in/restarting",
      ).toEqual(["pending"]);

      const writesCheckedIn = table.filter((r) => r.writes.includes("checked-in"));
      expect(
        writesCheckedIn.map((r) => r.at),
        `${file}: \`checked-in\` has exactly one entry`,
      ).toHaveLength(1);
      expect(
        writesCheckedIn[0]?.guards,
        `${file}: and it is reached only from \`pending\`, which closes idle/checked-in and ` +
          "failed/checked-in in the A-to-B direction",
      ).toEqual(["pending"]);

      const guardsCheckedIn = table.filter((r) => r.guards.includes("checked-in"));
      expect(
        guardsCheckedIn[0]?.writes,
        `${file}: the only move out of \`checked-in\` short of leaving the map is \`restarting\`, ` +
          "which closes retrying ← checked-in",
      ).toEqual(["restarting"]);
    }
  });

  test("§8 row 15: the availability sweep discriminates no phase, on either surface", () => {
    // Rows 12, 14 and 15 each say "same three members, same two mechanisms". That
    // is one fact about the sweep, not three about the phases: it keys on
    // liveness alone. A sweep that special-cased `restarting` would leave the
    // layout effect an id to promote after the branch had gone.
    for (const file of [GALLERY, LIGHTBOX]) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      const at = src.indexOf("sweptRetryPhase");
      premiseHolds(`${file}: the swept phase map was located`, at > 0);
      const marker = file === GALLERY ? "const sweptRetryPhase = (() => {" : "const sweepPhases =";
      const start = src.indexOf(marker);
      premiseHolds(`${file}: the sweep body was located`, start > 0);
      const body = src.slice(start, src.indexOf("\n  };", start) + 5 || start + 600);
      for (const phase of ["pending", "checked-in", "restarting"]) {
        expect(body, `${file}: the sweep must not read the phase it is sweeping`).not.toContain(
          `"${phase}"`,
        );
      }
    }
  });

  test("§8.1 case 4: an item that leaves the rendered set while checked in loses the retry, not the failure", () => {
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={items(14)} />);
    const toggle = screen.getByRole("button", { name: /Show all 14 diagrams/ });
    act(() => {
      fireEvent.click(toggle);
    });
    premiseHolds(
      "expanding revealed the thirteenth cell",
      screen.queryByTestId("diagram-slot-12") !== null,
    );

    enterCheckedIn(12);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Show fewer/ }));
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Show all 14 diagrams/ }));
    });

    // The rendered-ID sweep abandons the retry and restores the failure, so what
    // comes back on re-expand is the OFFER. A resurrected check-in would be a
    // countdown for a request the component stopped tracking.
    expect(offerOrNull(12), "the cell offers its retry control again").not.toBeNull();
    expect(overlayOrNull(12), "and not a check-in for a request nobody is waiting on").toBeNull();
  });

  test("§8.1 case 5: the lightbox's check-in is gated on the slide being active", () => {
    // The behavioral case — enter the check-in, swipe away, swipe back, and get
    // the failed control — is decided in galleryLightbox.retryCheckIn.test.tsx
    // against a controlled Embla, because the real one only emits `select` after
    // a layout jsdom never performs. What this audit adds is the render gate
    // that makes it true: an inactive slide renders no check-in even while it
    // still holds a phase, which is why swiping away can abandon rather than
    // strand.
    const src = readFileSync(join(process.cwd(), LIGHTBOX), "utf8");
    expect(src, "the in-flight overlay renders only on the active slide").toContain(
      "isRetrying && isActive ?",
    );
  });

  test("§8.1 case 6: the original request completing during the staging commit changes nothing", () => {
    renderGallery();
    enterCheckedIn(0);
    const staleImg = imageIn(0) as HTMLImageElement;

    restart(0);
    const fresh = imageIn(0);
    premiseHolds(
      "Restart mounted a replacement to distinguish from the original",
      fresh !== staleImg,
    );

    // The old <img> is out of the document and React's root delegation cannot see
    // it, so neither handler fires. Asserted on the OUTCOME rather than on a spy:
    // the phase is untouched and nothing was announced.
    act(() => {
      fireEvent.load(staleImg);
    });

    expect(inFlight(0).textContent, "still in flight on the replacement").toContain("Retrying");
    expect(imageIn(0), "and the replacement is still the mounted request").toBe(fresh);
    expect(announcements(), "the abandoned request cannot report success").not.toContain(
      "Diagram 1 loaded.",
    );
  });

  test("§8.1 case 7 (AC-1b): Restart leaves ANOTHER item's window running to its own deadline", () => {
    renderGallery(3);
    enterPending(0);
    advance(1000);
    enterPending(1);

    // Item 0 reaches its deadline with item 1 one second short of its own.
    advance(RETRY_CHECK_IN_MS - 1000);
    premiseHolds("item 0 checked in", inFlight(0).textContent?.includes("Still loading") === true);
    premiseHolds(
      "and item 1 is still short of its deadline",
      inFlight(1).textContent?.includes("Still loading") !== true,
    );

    restart(0);

    advance(1000);
    expect(
      inFlight(1).textContent,
      "the neighbour's window is measured from ITS entry, and Restart did not touch it",
    ).toContain("Still loading");
    expect(
      inFlight(0).textContent,
      "while the replacement waits a fresh window of its own",
    ).not.toContain("Still loading");

    advance(RETRY_CHECK_IN_MS - 1000);
    expect(inFlight(0).textContent, "which expires a full window after the Restart").toContain(
      "Still loading",
    );
  });

  test("§8.1 case 8: Restart with the item going unavailable in the same tick moves nothing", () => {
    const view = renderGallery();
    enterCheckedIn(0);

    act(() => {
      fireEvent.click(inFlight(0));
      view.rerender(
        <Gallery
          showId={SHOW_ID}
          snapshotRevisionId={REV}
          items={[item(1, { available: false }), item(2)]}
        />,
      );
    });

    // The sweep drops the id, so the `restarting` branch is gone on that render
    // and the layout effect finds nothing to promote. The failure mode this rules
    // out is a promotion that re-adds a swept id, which would mount a request for
    // an object that is not published.
    expect(overlayOrNull(0), "no overlay for a cell that is unavailable").toBeNull();
    expect(imageIn(0), "and no request was mounted on the way through").toBeNull();

    view.rerender(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);
    advance(RETRY_CHECK_IN_MS * 2);
    expect(overlayOrNull(0), "and none arrives a window later either").toBeNull();
  });

  test("§8.1 case 9: the timer firing in the same tick as onLoad is inert, in either order", async () => {
    renderGallery();
    enterPending(0);
    advance(RETRY_CHECK_IN_MS - 1);
    const img = imageIn(0);
    premiseHolds("the item is one millisecond from its deadline", img !== null);

    await act(async () => {
      fireEvent.load(img as HTMLImageElement);
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    // §3.1's claim, which is why no ordering guarantee is needed: the timer's
    // write reads the live `prev`, and by the time it runs the id is gone.
    expect(overlayOrNull(0), "the load wins").toBeNull();
    expect(announcements()).toContain("Diagram 1 loaded.");
    expect(announcements(), "and no check-in was ever announced").not.toContain(
      "Diagram 1 is still loading.",
    );
  });

  test("§8.1 case 10: two items checked in at once are independent", () => {
    renderGallery(3);
    enterPending(0);
    enterPending(1);

    advance(RETRY_CHECK_IN_MS);

    expect(inFlight(0).textContent).toContain("Still loading");
    expect(inFlight(1).textContent).toContain("Still loading");

    // Independence is the claim, so the discriminating move is to disturb one and
    // read the other. Restarting item 0 must leave item 1 exactly where it was.
    restart(0);
    expect(inFlight(1).textContent, "the neighbour is untouched").toContain("Still loading");
    expect(inFlight(0).textContent, "and only the restarted one went back in flight").toContain(
      "Retrying",
    );
  });
});
