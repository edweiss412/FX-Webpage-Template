// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/step3DiagramTile.states.test.tsx
 * (DIAGRAMTILE-FAILURE-STATE-COPY-1 / DIAGRAMTILE-LIVE-TILE-UNLABELLED-1,
 *  plan docs/superpowers/plans/2026-08-31-diagram-tile-states.md Tasks 1-3)
 *
 * Task 1 opens this file with AC-9 alone: the wrapper element and the handle
 * the cap assertion depends on. Tasks 2 and 3 add the caption cases and the
 * copy cases as their own production changes land.
 *
 * Concrete failure modes AC-9 catches:
 *  - The wrapper given a testid DERIVED from the tile's, which a prefix
 *    selector then counts AS a tile. That defect shipped once and read 24 tiles
 *    where 12 was correct, at every breakpoint
 *    (components/admin/wizard/step3ReviewSections.tsx:4166-4172).
 *  - The testid moved off the box onto the wrapper, which would silently
 *    re-point every geometry assertion in the corpus at a different element.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";

import {
  DiagramsBreakdown,
  DiagramTile,
  DIAGRAM_TILE_CAP,
} from "@/components/admin/wizard/step3ReviewSections";
import { DIAGRAM_TILE_SIZES } from "@/components/admin/wizard/diagramTileGeometry";
import type { EmbeddedImageStub, ParseResult } from "@/lib/parser/types";
import { premise, premiseHolds } from "../../../_shared/premise";

const DFID = "drive-file-states";
const WSID = "wizard-session-states";
const SECTION = `wizard-step3-card-${DFID}-section-diagrams`;
const TILE = (i: number) => `wizard-step3-card-${DFID}-diagram-tile-${i}`;
const CELL = (i: number) => `wizard-step3-card-${DFID}-diagram-cell-${i}`;

afterEach(cleanup);

/** The name node is selected by its `title`, never by a testid: a testid derived
 *  from the tile's own would be counted AS a tile by the cap's prefix selector.
 *  Scoped to the CELL, which holds the box and the caption both. */
function nameNodeIn(cell: HTMLElement): HTMLElement | null {
  return cell.querySelector<HTMLElement>("[title]");
}

/** A servable staged stub: `hasPreviewSource` resolves true, so an <img> mounts. */
function liveStub(overrides: Partial<EmbeddedImageStub> = {}): EmbeddedImageStub {
  return {
    sheetTab: "DIAGRAMS",
    objectId: "states-obj-1",
    mimeType: "image/png",
    contentUrl: "https://lh3.googleusercontent.com/states-1",
    sheetsRevisionId: "rev-1",
    embeddedFingerprint: "fp-1",
    recovery_disposition: "normal",
    snapshotPath: null,
    alt: "Stage plot",
    ...overrides,
  };
}

/** `contentUrl: null` is the ABSENT seed: no source resolves, so no <img> mounts
 *  and `onError` is unreachable. */
function absentStub(overrides: Partial<EmbeddedImageStub> = {}): EmbeddedImageStub {
  return liveStub({ objectId: "states-obj-absent", contentUrl: null, ...overrides });
}

function renderTiles(stubs: EmbeddedImageStub[]) {
  const utils = render(
    <DiagramsBreakdown
      dfid={DFID}
      wizardSessionId={WSID}
      diagrams={
        {
          linkedFolder: null,
          embeddedImages: stubs,
          linkedFolderItems: [],
        } as ParseResult["diagrams"]
      }
    />,
  );
  return { ...utils, scoped: within(utils.getByTestId(SECTION)) };
}

describe("the cell wrapper and the handle the cap depends on", () => {
  test("AC-9: the testid is on the box, the cell carries its own, and the cap still counts 12", () => {
    const stubs = Array.from({ length: DIAGRAM_TILE_CAP + 3 }, (_v, i) =>
      liveStub({ objectId: `states-obj-${i}` }),
    );
    const { container, scoped } = renderTiles(stubs);

    // Premise: more stubs than the cap, or a count of 12 proves nothing about
    // capping — it would just be counting everything that was rendered.
    premise("more stubs were rendered than the cap", stubs.length, DIAGRAM_TILE_CAP);

    const tiles = container.querySelectorAll(
      `[data-testid^="wizard-step3-card-${DFID}-diagram-tile-"]`,
    );
    expect(tiles.length).toBe(DIAGRAM_TILE_CAP);

    // The cell is NOT counted by the tile prefix, which is the whole reason its
    // segment is `-diagram-cell-`: five prefix consumers in the corpus require
    // the literal `-diagram-tile-`, and a derived id would be counted as a tile.
    const cells = container.querySelectorAll(
      `[data-testid^="wizard-step3-card-${DFID}-diagram-cell-"]`,
    );
    expect(cells.length).toBe(DIAGRAM_TILE_CAP);

    // The box, not the wrapper, keeps the tile id: the box is what every
    // geometry assertion in the corpus measures.
    const box = scoped.getByTestId(TILE(0));
    const cell = scoped.getByTestId(CELL(0));
    expect(cell.contains(box)).toBe(true);
    expect(box.contains(cell)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TASK 2. Its production change is the caption leaving the box: the name line
// renders in every state, outside the `overflow-hidden` box, and the message
// becomes addressable. AC-7 and AC-7b are the browser halves and live in
// tests/e2e/step3-review-modal.layout.spec.ts.
// ---------------------------------------------------------------------------
describe("the caption, once, outside the box", () => {
  test("AC-3: the live tile renders its name as visible text, aria-hidden", () => {
    const stub = liveStub();
    const { scoped } = renderTiles([stub]);
    const cell = scoped.getByTestId(CELL(0));
    const box = scoped.getByTestId(TILE(0));

    premiseHolds("the tile is on the LIVE branch, the branch under test", box.tagName === "A");
    premiseHolds("an image mounted, so it really is live", box.querySelector("img") !== null);

    const name = nameNodeIn(cell);
    expect(name).not.toBeNull();
    expect(name!.textContent).toBe(stub.alt);
    expect(name!.getAttribute("title")).toBe(stub.alt);
    // VISIBLE text, not an aria-label: shipping this as a label change would be
    // a no-op, because the anchor's label is already correct.
    expect(name!).toBeVisible();
    // The caption is OUTSIDE the box, which is what lets it be as tall as its
    // content without touching the box's 4:3.
    expect(box.contains(name)).toBe(false);
    // Announced ONCE. The anchor already carries the name, so here and only
    // here the caption is decorative.
    expect(name!).toHaveAttribute("aria-hidden", "true");
  });

  // Annotated, not inferred: an unannotated heterogeneous table widens the
  // parameter to `string | EmbeddedImageStub`, which will not assign to
  // `renderTiles`.
  const failedCases: [label: string, stub: EmbeddedImageStub][] = [
    ["absent", absentStub()],
    ["load-failed", liveStub({ objectId: "states-obj-err" })],
  ];

  test.each(failedCases)("AC-4: the %s tile names itself and does NOT hide it", (state, stub) => {
    const { scoped } = renderTiles([stub]);
    if (state === "load-failed") {
      const img = scoped.getByTestId(TILE(0)).querySelector("img");
      premiseHolds("an image mounted, so a real error event is reachable", img !== null);
      fireEvent.error(img!);
    }
    const cell = scoped.getByTestId(CELL(0));
    const box = scoped.getByTestId(TILE(0));
    premiseHolds("the tile is on a FAILED branch, the branch under test", box.tagName !== "A");

    const name = nameNodeIn(cell);
    expect(name).not.toBeNull();
    expect(name!.textContent).toBe(stub.alt);
    expect(box.contains(name)).toBe(false);
    // No anchor here, so the caption is the ONLY accessible text and must stay
    // announced. An unconditional aria-hidden silences it.
    expect(name!).not.toHaveAttribute("aria-hidden");
  });

  // AC-5 constructs DiagramTile DIRECTLY, because the grid can never hand it an
  // empty alt: the call site falls back to `Diagram from ${sheetTab}`
  // (step3ReviewSections.tsx:4414, widened from ?? to || after an impeccable
  // audit P2 on nameless links), and there is exactly ONE <DiagramTile> call
  // site in the repo. So this guards DEFENSIVE component-level behaviour rather
  // than a reachable app state, and going through the grid would render a name
  // line and fail the case for a reason unrelated to the component.
  test.each([
    ["empty", ""],
    ["whitespace", "   "],
  ])("AC-5: with an %s alt, no name line renders and the label still falls back", (_kind, alt) => {
    for (const hasPreviewSource of [true, false]) {
      const { getByTestId, unmount } = render(
        <DiagramTile
          testId="noname-tile"
          cellTestId="noname-cell"
          href="/api/admin/onboarding/staged-diagram/w/d/o"
          sourceKey="/api/admin/onboarding/staged-diagram/w/d/o"
          loader={({ src }) => src}
          sizes={DIAGRAM_TILE_SIZES}
          alt={alt}
          hasPreviewSource={hasPreviewSource}
        />,
      );
      expect(nameNodeIn(getByTestId("noname-cell"))).toBeNull();
      const box = getByTestId("noname-tile");
      if (box.tagName === "A") {
        expect(box).toHaveAttribute("aria-label", "Staged diagram (opens in a new tab)");
      }
      unmount();
    }
  });

  test("the message is addressable, and it is outside the box too", () => {
    const { scoped } = renderTiles([absentStub()]);
    const cell = scoped.getByTestId(CELL(0));
    const box = scoped.getByTestId(TILE(0));
    // Addressed by its OWN attribute, never by its text: the sentence is the
    // thing under test in Task 3, so an oracle keyed to it could not fail when
    // it is wrong. `[data-attention-anchor]` in this same file is the precedent.
    const message = cell.querySelector("[data-diagram-message]");
    expect(message).not.toBeNull();
    expect(box.contains(message)).toBe(false);
  });
});
