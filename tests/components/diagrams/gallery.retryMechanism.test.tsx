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

/**
 * Drive a successful load THROUGH next/image's own path.
 *
 * next/image does not use the img's `onLoad` attribute -- it installs a ref
 * handler and routes through `handleLoading`, which calls `img.decode()` and
 * resolves the caller's `onLoad` in a `.then()` (next/dist/client/image-component.js:30,
 * :51). That is a microtask, so a synchronous `act()` returns before the
 * component has seen the load at all. Awaiting is not tidiness here: without it
 * every assertion about the settled state reads the in-flight state instead.
 */
async function loadImage(i: number): Promise<void> {
  const img = imageIn(i);
  premiseHolds(`slot ${i} has an image to load`, img !== null);
  await act(async () => {
    fireEvent.load(img as HTMLImageElement);
    await Promise.resolve();
  });
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

  test("§4.0.5: the image that loads is the SAME node the idle cell then shows", async () => {
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);
    failThumb(0);
    tapRetry(0);

    const inFlight = imageIn(0);
    premiseHolds("the retrying cell mounts its image in final position", inFlight !== null);
    // Tag it. A remount produces a fresh element with no tag, so "an image is
    // present" cannot stand in for "the same image survived".
    inFlight!.dataset.identityProbe = "same-node";

    await loadImage(0);

    // The cell REALLY reached idle. Without this the identity assertion below is
    // a tautology: the image is present in `retrying` too, so a load that never
    // registered would satisfy it just as well.
    expect(
      within(slot(0)).queryByTestId("diagram-retrying-0"),
      "the overlay cleared, so this is the settled state and not the in-flight one",
    ).toBeNull();

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

  test("AC-6: a retry that fails while the OVERLAY holds focus does not drop to body", () => {
    // Found by a surviving mutant, not by reading. Removing the focus hand-off
    // entirely left every other case green, because React REUSES the thumbnail's
    // DOM node when the failed control replaces it -- same <button>, new
    // attributes, so focus never actually moves and the hand-off is dead on that
    // path.
    //
    // This path is different. The in-flight overlay is a SEPARATE element, and it
    // is where focus sits after a tap. When the retry fails, that element
    // unmounts and there is no node to inherit focus, so it falls to <body> --
    // outside the gallery, on a page whose diagram just broke twice.
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);
    failThumb(0);

    const control = within(slot(0)).getByTestId("diagram-retry-0");
    act(() => control.focus());
    act(() => {
      fireEvent.click(control);
    });

    const overlay = inFlightControl(0);
    premiseHolds(
      "the overlay holds focus after the tap, or this case is not exercising the hand-off",
      document.activeElement === overlay,
    );

    const inFlight = imageIn(0);
    premiseHolds("the retry mounted an image to fail", inFlight !== null);
    act(() => {
      fireEvent.error(inFlight as HTMLImageElement);
    });

    expect(document.activeElement, "focus never reaches <body> (AC-6)").not.toBe(document.body);
    expect(
      document.activeElement,
      "it lands on the offer to try again, which is the cell's remaining next step",
    ).toBe(within(slot(0)).getByTestId("diagram-retry-0"));
  });

  test("a retrying cell exposes ONE tab stop, not a phantom under the overlay", () => {
    // Found by the invariant-8 audit. The image's open button survives beneath
    // the opaque overlay -- covered to a pointer, but still in the tab order and
    // still opening the lightbox for the very diagram that is failing. A
    // keyboard user Shift+Tabs onto a control they cannot see, for a thing that
    // is not there.
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);
    failThumb(0);
    tapRetry(0);
    premiseHolds(
      "the cell is really in flight, or there is no overlay to hide anything",
      within(slot(0)).queryByTestId("diagram-retrying-0") !== null,
    );

    // The oracle is what the focus trap's own collector would take
    // (lib/a11y/dialogFocus.ts): tabIndex >= 0. A button with tabIndex={-1} is
    // still clickable programmatically but is NOT a tab stop, which is the
    // defect -- a keyboard user landing on an invisible control.
    const reachable = [
      ...slot(0).querySelectorAll<HTMLElement>("a[href],button,input,select,textarea,[tabindex]"),
    ].filter((el) => !el.hasAttribute("disabled") && el.tabIndex >= 0);

    expect(
      reachable.map((el) => el.dataset.testid ?? el.getAttribute("aria-label")),
      "exactly one reachable control while retrying: the in-flight one",
    ).toEqual(["diagram-retrying-0"]);
  });

  test("AC-3: a successful retry announces by name", async () => {
    // Task 2's onLoad clears the retrying set and says nothing, so the cell goes
    // from "Retrying…" to a picture in silence. A screen-reader user who tapped
    // and heard nothing has no way to know whether it worked.
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);
    const region = screen.getByTestId("gallery-announce-log");
    const messages = () =>
      [...region.querySelectorAll("[data-announce-id]")].map((n) => n.textContent ?? "");

    failThumb(0);
    const afterFailure = messages().length;

    tapRetry(0);
    await loadImage(0);

    const after = messages();
    expect(after.length, "the success is announced, not just rendered").toBe(afterFailure + 1);
    // Derived from the fixture, never typed out: a constant would pass against a
    // component that announces the same string for every item.
    expect(after[after.length - 1]).toBe(`${item(1).alt} loaded.`);
  });

  test("AC-3: a retry that fails again announces the SECOND outcome, distinctly", () => {
    // The two outcomes must be distinguishable. An implementation that reused
    // the first-failure copy would leave the user unable to tell a retry that
    // failed from the original failure.
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);
    const region = screen.getByTestId("gallery-announce-log");
    const messages = () =>
      [...region.querySelectorAll("[data-announce-id]")].map((n) => n.textContent ?? "");

    failThumb(0);
    const firstFailure = messages()[messages().length - 1];

    tapRetry(0);
    const inFlight = imageIn(0);
    premiseHolds("the retry mounted an image to fail", inFlight !== null);
    act(() => {
      fireEvent.error(inFlight as HTMLImageElement);
    });

    const last = messages()[messages().length - 1];
    expect(last).toBe(`${item(1).alt} still could not be loaded.`);
    expect(last, "the retry failure reads differently from the first one").not.toBe(firstFailure);
  });

  test("AC-10: a SECOND failure after a successful retry still announces", async () => {
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
    await loadImage(0);
    // Measured AFTER the success, not after the first failure: Task 3 gave the
    // successful retry its own announcement, so anchoring on the earlier count
    // would fold two events into one expectation and pass for the wrong reason.
    const afterSuccess = count();
    expect(afterSuccess, "the success announced, so the baseline moved").toBe(afterFirst + 1);

    failThumb(0);

    expect(count(), "the second failure of a recovered item is announced, not swallowed").toBe(
      afterSuccess + 1,
    );
  });
});

/**
 * Whole-diff review R1, finding 1: focus is lost on control-removal paths.
 *
 * The arc's own tests covered retry ENTRY (failed control -> in-flight overlay)
 * and repeated FAILURE (overlay -> failed control), because both replace one
 * control with another and the hand-off refs have a destination to land on.
 * SUCCESS has no replacement control -- the cell returns to a plain image
 * button -- so the hand-off had nowhere to go and nothing noticed.
 *
 * The assertion is WHERE FOCUS IS after the commit, not which ref was written:
 * a ref-written assertion passes on exactly the code that drops focus to
 * `<body>`, which is the defect. Verified by the reviewer with a direct DOM
 * probe.
 */
describe("R1 finding 1: a control removed under focus relocates it", () => {
  test("a SUCCESSFUL retry does not strand focus on <body>", async () => {
    render(<Gallery showId={SHOW_ID} rev={REV} items={[item(1), item(2)]} />);
    failThumb(1);
    const control = within(slot(1)).getByTestId("diagram-retry-1");
    act(() => control.focus());
    premiseHolds(
      "the retry control really held focus before the tap",
      document.activeElement === control,
    );

    tapRetry(1);
    const overlay = within(slot(1)).getByTestId("diagram-retrying-1");
    act(() => overlay.focus());
    premiseHolds("the in-flight overlay really held focus", document.activeElement === overlay);

    // The retry succeeds. The overlay unmounts with focus on it.
    await loadImage(1);

    expect(document.activeElement, "focus never falls to <body>").not.toBe(document.body);
    const list = screen.getByRole("list");
    expect(
      list.contains(document.activeElement),
      "and it lands somewhere inside the gallery list",
    ).toBe(true);
  });

  test("an item going unavailable under focus does not strand it either", () => {
    const { rerender } = render(<Gallery showId={SHOW_ID} rev={REV} items={[item(1), item(2)]} />);
    failThumb(1);
    const control = within(slot(1)).getByTestId("diagram-retry-1");
    act(() => control.focus());
    premiseHolds(
      "the retry control held focus before the item went away",
      document.activeElement === control,
    );

    // Availability is the OTHER removal path, and it removes the control with
    // no user action at all.
    rerender(
      <Gallery showId={SHOW_ID} rev={REV} items={[item(1, { available: false }), item(2)]} />,
    );

    expect(document.activeElement, "focus never falls to <body>").not.toBe(document.body);
    // Not-body is too weak on its own: focus sitting on a DETACHED node also
    // reads as not-body while being just as broken, and jsdom will happily
    // report it. Connectedness is the property that actually matters.
    expect(
      document.activeElement?.isConnected,
      "and focus is on a node still in the document",
    ).toBe(true);
  });
});
