// @vitest-environment jsdom
/**
 * The retry region's user-visible copy, PINNED per phase.
 *
 * WHY THIS EXISTS, and it is a measurement rather than a style preference.
 * U-1 was measured on 2026-09-01 (design spec §1.2): removing a mid-fetch
 * `<img>` does NOT abandon its request, and the replacement element carries an
 * identical URL, so the browser serves it from the request already in flight.
 * `attemptsAfterRestart: 2`, not 3. Restart therefore re-arms the thirty-second
 * watchdog, refreshes the copy and un-inerts the control, while the ONE original
 * request keeps running. It does not start a new download.
 *
 * The ruling that followed (2026-09-01) kept the affordance and made this the
 * documented limit, with one binding requirement on the copy: it must not
 * promise a NEW download. The request IS still trying, so a string that says so
 * is honest and a string that promises a fresh fetch is not.
 *
 * SO THIS PINS THE STRINGS RATHER THAN BANNING WORDS. A deny-list over
 * download-promising vocabulary fails OPEN on the first phrasing nobody thought
 * of, which is the wrong direction for a guard whose subject is an open set of
 * English sentences. The closed form is the exact rendered set: change the copy
 * and this test is where the change surfaces, to be judged against the paragraph
 * above rather than against a word list.
 *
 * Read from the RENDERED tree, not from source. The aria-labels are template
 * literals and the visible lines are separate spans; a source recognizer would
 * be asserting the spelling of the code rather than what a crew member reads.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { Gallery, type GalleryItem } from "@/components/diagrams/Gallery";
import { RETRY_CHECK_IN_MS } from "@/components/diagrams/GalleryLightbox";
import { premiseHolds } from "@/tests/_shared/premise";

const SHOW_ID = "11111111-1111-4111-8111-111111111111";
const REV = "22222222-2222-4222-8222-222222222222";

function item(i: number): GalleryItem {
  const key = `embedded-obj-${i}.png`;
  return {
    id: `embedded:obj-${i}`,
    key,
    alt: `Diagram ${i}`,
    available: true,
    variants: [{ width: 256, key: `${key}@256.webp` }],
  };
}

const slot = (i: number) => screen.getByTestId(`diagram-slot-${i}`);

/**
 * What a crew member reads and what a screen reader announces, together.
 *
 * Scoped to the retry region's OWN control by test id, not by role or by the
 * cell's text. The first draft queried `byRole("button", { name: /Diagram/ })`
 * and matched two: the overlay AND the inert thumbnail button beneath it, whose
 * accessible name is "Open Diagram 1". Reading the whole cell has the same
 * defect one level up, since the cell carries whatever sits under the overlay.
 * An oracle that cannot isolate its subject is the failure this arc has now
 * shipped four times.
 */
function copyOf(i: number): { visible: string; accessible: string } {
  const cell = slot(i);
  const control =
    within(cell).queryByTestId(`diagram-retrying-${i}`) ??
    within(cell).queryByTestId(`diagram-retry-${i}`);
  premiseHolds(`slot ${i} renders a retry-region control to read`, control !== null);
  return {
    visible: (control?.textContent ?? "").trim(),
    accessible: control?.getAttribute("aria-label") ?? "",
  };
}

describe("the retry region's copy, per phase", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  test("every phase reads exactly as ratified, and none promises a new download", () => {
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item(1), item(2)]} />);

    const img = within(slot(0)).queryByRole("img");
    premiseHolds("the cell rendered an image, so there is an onError to fire", img !== null);
    act(() => {
      fireEvent.error(img as HTMLImageElement);
    });

    expect(copyOf(0), "FAILED — the offer").toEqual({
      visible: "Tap to retry",
      accessible: "Diagram 1 could not be loaded. Tap to retry.",
    });

    act(() => {
      fireEvent.click(within(slot(0)).getByTestId("diagram-retry-0"));
    });
    expect(copyOf(0), "PENDING — in flight, and not an action").toEqual({
      visible: "Retrying…",
      accessible: "Diagram 1 could not be loaded. Retrying…",
    });

    act(() => {
      vi.advanceTimersByTime(RETRY_CHECK_IN_MS);
    });
    // The one phase the ruling constrains. "Still loading" is true of the
    // request, which is still running; "Restart" names what the control does to
    // the WATCHDOG and the copy, and neither line offers a new download.
    expect(copyOf(0), "CHECKED-IN — the check-in and its offer").toEqual({
      visible: "Still loadingRestart",
      accessible: "Diagram 1 is still loading. Restart.",
    });

    act(() => {
      fireEvent.click(within(slot(0)).getByTestId("diagram-retrying-0"));
    });
    // After Restart the copy returns to the in-flight line. Honest by the
    // measurement: the request never stopped, so "Retrying…" describes what is
    // happening rather than announcing a fetch that did not begin.
    expect(copyOf(0), "RESTARTED — back to in flight, on the SAME request").toEqual({
      visible: "Retrying…",
      accessible: "Diagram 1 could not be loaded. Retrying…",
    });
  });

  test("the unavailable placeholder is not an action and says so", () => {
    render(
      <Gallery
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={[{ ...item(1), available: false }, item(2)]}
      />,
    );
    expect(within(slot(0)).queryByRole("button"), "nothing to press").toBeNull();
    expect(slot(0).textContent?.trim()).toBe("Diagram 1, image unavailable");
  });
});
