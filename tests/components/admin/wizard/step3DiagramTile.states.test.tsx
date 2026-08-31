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
import { cleanup, render, within } from "@testing-library/react";

import { DiagramsBreakdown, DIAGRAM_TILE_CAP } from "@/components/admin/wizard/step3ReviewSections";
import type { EmbeddedImageStub, ParseResult } from "@/lib/parser/types";
import { premise } from "../../../_shared/premise";

const DFID = "drive-file-states";
const WSID = "wizard-session-states";
const SECTION = `wizard-step3-card-${DFID}-section-diagrams`;
const TILE = (i: number) => `wizard-step3-card-${DFID}-diagram-tile-${i}`;
const CELL = (i: number) => `wizard-step3-card-${DFID}-diagram-cell-${i}`;

afterEach(cleanup);

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
