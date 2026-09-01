// @vitest-environment jsdom
/**
 * tests/components/diagrams/galleryTileFit.test.tsx
 * (DIAGRAMTILE-OBJECT-COVER-CROPS-1 / the crew half of the border restyle,
 *  plan docs/superpowers/plans/2026-08-31-diagram-tile-states.md Tasks 4 and 5)
 *
 * Nothing under `tests/` pinned the crew gallery THUMBNAIL's chrome before this
 * file. The one existing `object-contain` assertion in the corpus is on the
 * LIGHTBOX image (GalleryLightboxPinchZoom.test.tsx:1012), a different element,
 * so both the fit ruling and the border restyle could have been reverted here
 * without a single assertion noticing.
 *
 * Task 5 opens the file with the border pin; Task 4 adds the fit pin to it.
 *
 * Concrete failure modes:
 *  - The cell's stroke reverted to `border-border`, 1.22-1.27:1 against its own
 *    sunken ground and under the 3:1 non-text floor.
 *  - An assertion that reads the LIGHTBOX's chrome and reports on the
 *    thumbnail's, which a document-wide search would happily do.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { Gallery, type GalleryItem } from "@/components/diagrams/Gallery";
import { premise, premiseHolds } from "@/tests/_shared/premise";

const SHOW_ID = "11111111-1111-4111-8111-111111111111";
const REV = "22222222-2222-4222-8222-222222222222";

function items(n: number): GalleryItem[] {
  return Array.from({ length: n }, (_v, i) => ({
    id: `embedded-obj-${i + 1}`,
    key: `embedded-obj-${i + 1}.png`,
    alt: `Diagram ${i + 1}`,
    available: true,
    variants: [],
  }));
}

afterEach(cleanup);

/** Class tokens of an element, matched per TOKEN so a substring cannot satisfy
 *  a claim about a utility (the boundary bug the admin chrome suite records). */
function tokens(el: Element): Set<string> {
  return new Set(el.className.split(/\s+/).filter(Boolean));
}

describe("crew gallery thumbnail chrome", () => {
  test("the cell's stroke is the control-edge token, not the hairline (AC-8, crew half)", () => {
    const { container } = render(
      <Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={items(3)} />,
    );

    // Scoped to the SLOT, never the document: the lightbox renders its own
    // chrome, and a document-wide search would let it satisfy a claim about the
    // thumbnail's.
    const slots = container.querySelectorAll('[data-testid^="diagram-slot-"]');
    premise("the gallery rendered thumbnail slots", slots.length, 0);
    expect(slots.length).toBe(3);

    for (const slot of Array.from(slots)) {
      const id = slot.getAttribute("data-testid");
      premiseHolds(
        `slot ${id} holds an image, so it is a live thumbnail`,
        slot.querySelector("img") !== null,
      );
      const have = tokens(slot);
      expect(have.has("border-text-faint"), `slot ${id} carries border-text-faint`).toBe(true);
      expect(have.has("border-border"), `slot ${id} no longer carries border-border`).toBe(false);
    }
  });

  test("the thumbnail letterboxes rather than cropping (AC-12, crew half)", () => {
    const { container } = render(
      <Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={items(3)} />,
    );

    const slots = container.querySelectorAll('[data-testid^="diagram-slot-"]');
    premise("the gallery rendered thumbnail slots", slots.length, 0);

    // The scope cannot silently widen: with the lightbox CLOSED, every image in
    // the tree is a thumbnail, so a slot-scoped count that matches the
    // document-wide count proves this case is not quietly reading some other
    // element's fit. The corpus's only other `object-contain` assertion is on
    // the lightbox image, a different element entirely.
    const slotImages = container.querySelectorAll('[data-testid^="diagram-slot-"] img');
    premiseHolds(
      "the lightbox is closed, so every rendered image IS a thumbnail",
      container.querySelectorAll("img").length === slotImages.length,
    );
    expect(slotImages.length).toBe(slots.length);

    for (const img of Array.from(slotImages)) {
      const have = tokens(img);
      // Letterbox, not crop. Eric's ruling of 2026-08-31 is product-wide: a
      // thumbnail that crops shows the reviewer a diagram that is not the
      // diagram, and the plate it letterboxes against already exists.
      expect(have.has("object-contain"), "the thumbnail letterboxes").toBe(true);
      expect(have.has("object-cover"), "the thumbnail does not crop").toBe(false);
    }
  });
});
