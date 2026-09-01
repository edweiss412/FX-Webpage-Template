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
import type { ReactElement } from "react";

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

/** The grid element, factored out so a transition case can re-render the SAME
 *  tree with moved stubs. */
function gridOf(stubs: EmbeddedImageStub[], wizardSessionId: string = WSID) {
  return (
    <DiagramsBreakdown
      dfid={DFID}
      wizardSessionId={wizardSessionId}
      diagrams={
        {
          linkedFolder: null,
          embeddedImages: stubs,
          linkedFolderItems: [],
        } as ParseResult["diagrams"]
      }
    />
  );
}

function renderTiles(stubs: EmbeddedImageStub[]) {
  const utils = render(gridOf(stubs));
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

// ---------------------------------------------------------------------------
// TASK 3. Its production change is the state UNION: one boolean `failed`
// becomes "live" | "absent" | "load-failed", and the two failed states stop
// sharing one sentence and one glyph.
//
// The anti-tautology constraint the reconcile suite already established and
// this block inherits: a case that moves a tile's SOURCE must not move its
// `objectId`, because the objectId IS the React key (`${objectId}-${i}` at the
// call site). Varying it remounts, the state seeds fresh for free, and the case
// passes against a component with no reconcile in it at all. Node identity is
// likewise not the proof: a placeholder is a <span> and a live tile an <a>, so
// they are necessarily different nodes.
// ---------------------------------------------------------------------------

/**
 * The two ratified sentences, written as literals rather than imported from the
 * component. Importing the shipped constant would assert each string against
 * itself, and a wrong sentence would ship green.
 *
 * Ratified 2026-08-28 (DEFERRED.md DIAGRAMTILE-FAILURE-STATE-COPY-1). The
 * apostrophes are STRAIGHT because the ratified strings are: the corpus holds
 * both forms, no guard decides it, and the spec settles it explicitly rather
 * than leaving it to whoever types the string next.
 */
const ABSENT_COPY = "Not captured. Won't appear on the crew page.";
const LOAD_FAILED_COPY = "Preview couldn't load. The diagram will still publish.";

type TileState = "live" | "absent" | "load-failed";

/** Every signal a case needs to name the landing state, read in ONE pass so no
 *  two assertions compare different renders. */
function readTile(section: HTMLElement, i = 0) {
  const scoped = within(section);
  const cell = scoped.getByTestId(CELL(i));
  const box = scoped.getByTestId(TILE(i));
  return {
    cell,
    box,
    isAnchor: box.tagName === "A",
    img: box.querySelector("img"),
    message: cell.querySelector<HTMLElement>("[data-diagram-message]"),
    absentGlyph: box.querySelector("svg.lucide-triangle-alert"),
    loadFailedGlyph: box.querySelector("svg.lucide-image-off"),
  };
}

/** Asserts the tile landed in exactly one state, in BOTH directions: the
 *  landing state's sentence and glyph present, the other state's absent. A
 *  one-directional check passes against a split that threads the state and
 *  still renders one string. */
function expectState(section: HTMLElement, state: TileState, i = 0) {
  const t = readTile(section, i);
  if (state === "live") {
    expect(t.isAnchor).toBe(true);
    expect(t.img).not.toBeNull();
    expect(t.message).toBeNull();
    expect(t.cell.textContent).not.toContain(ABSENT_COPY);
    expect(t.cell.textContent).not.toContain(LOAD_FAILED_COPY);
    return;
  }
  expect(t.isAnchor).toBe(false);
  expect(t.message).not.toBeNull();
  if (state === "absent") {
    expect(t.message!.textContent).toBe(ABSENT_COPY);
    expect(t.cell.textContent).not.toContain(LOAD_FAILED_COPY);
    expect(t.absentGlyph).not.toBeNull();
    expect(t.loadFailedGlyph).toBeNull();
  } else {
    expect(t.message!.textContent).toBe(LOAD_FAILED_COPY);
    expect(t.cell.textContent).not.toContain(ABSENT_COPY);
    expect(t.loadFailedGlyph).not.toBeNull();
    expect(t.absentGlyph).toBeNull();
  }
}

describe("three states, two sentences, two glyphs", () => {
  test("AC-1: the absent tile says it was not captured, and not the other sentence", () => {
    const { getByTestId } = renderTiles([absentStub()]);
    const section = getByTestId(SECTION);
    const t = readTile(section);

    premiseHolds("the tile is on a failed branch, the branch under test", !t.isAnchor);
    // What makes this the ABSENT state and not a load failure: no image ever
    // mounted, so no request was made and nothing could have failed.
    premiseHolds("no image mounted, so nothing could have failed to load", t.img === null);

    expectState(section, "absent");
  });

  test("AC-2: a REAL error on a mounted image says the preview could not load", () => {
    const { getByTestId } = renderTiles([liveStub()]);
    const section = getByTestId(SECTION);
    const img = readTile(section).img;

    // Reached by a real error event on a mounted image, never by seeding a
    // load-failed prop: a seed-only case passes against a seed-only
    // implementation, which is the one shape that cannot ship.
    premiseHolds("an image mounted, so a real error event is reachable", img !== null);
    premiseHolds("the tile was LIVE before the error", readTile(section).isAnchor);
    fireEvent.error(img!);

    expectState(section, "load-failed");
  });

  test("the glyph carries the state, and both carry the same weight", () => {
    const absent = renderTiles([absentStub()]);
    const absentGlyph = readTile(absent.getByTestId(SECTION)).absentGlyph;
    expect(absentGlyph).not.toBeNull();
    expect(absentGlyph!.getAttribute("aria-hidden")).toBe("true");
    expect(absentGlyph!.getAttribute("class")).toContain("size-4");
    expect(absentGlyph!.getAttribute("class")).toContain("text-text-subtle");
    cleanup();

    const failed = renderTiles([liveStub()]);
    const section = failed.getByTestId(SECTION);
    fireEvent.error(readTile(section).img!);
    const failedGlyph = readTile(section).loadFailedGlyph;
    expect(failedGlyph).not.toBeNull();
    expect(failedGlyph!.getAttribute("aria-hidden")).toBe("true");
    // Same size and same ramp in both states: the GLYPH distinguishes them, not
    // colour or weight. A state told apart by colour alone is invisible to
    // anyone who cannot see the difference.
    expect(failedGlyph!.getAttribute("class")).toContain("size-4");
    expect(failedGlyph!.getAttribute("class")).toContain("text-text-subtle");
  });
});

// ---------------------------------------------------------------------------
// AC-6: three states, six ordered transitions. Every one is INSTANT — this
// component animates nothing — so each case asserts the landing state, and the
// unreachable one asserts that its DRIVER does not exist rather than that it
// does nothing.
// ---------------------------------------------------------------------------
describe("AC-6: every ordered transition", () => {
  /** Held fixed across every re-render in this block. It IS the React key. */
  const OBJ = "states-obj-transition";

  const fail = (section: HTMLElement) => {
    const img = readTile(section).img;
    premiseHolds("an image mounted, so the onError driver is reachable", img !== null);
    fireEvent.error(img!);
  };

  /** `arrive` is separate from `drive` on purpose. Two of the five start from
   *  `load-failed`, which is only ever reachable by a real error event, so a
   *  case that folded the arrival into the transition would assert its FROM
   *  premise one render too early and pass while sitting in `live`. That is
   *  exactly what the first draft of this table did. */
  const reachable: {
    from: TileState;
    to: TileState;
    start: EmbeddedImageStub;
    arrive?: (section: HTMLElement) => void;
    drive: (section: HTMLElement, rerender: (ui: ReactElement) => void) => void;
  }[] = [
    {
      from: "live",
      to: "absent",
      start: liveStub({ objectId: OBJ }),
      drive: (_s, rerender) => rerender(gridOf([liveStub({ objectId: OBJ, contentUrl: null })])),
    },
    {
      from: "live",
      to: "load-failed",
      start: liveStub({ objectId: OBJ }),
      drive: (section) => fail(section),
    },
    {
      from: "absent",
      to: "live",
      start: absentStub({ objectId: OBJ }),
      drive: (_s, rerender) => rerender(gridOf([liveStub({ objectId: OBJ })])),
    },
    {
      from: "load-failed",
      to: "absent",
      start: liveStub({ objectId: OBJ }),
      arrive: (section) => fail(section),
      drive: (_s, rerender) => rerender(gridOf([liveStub({ objectId: OBJ, contentUrl: null })])),
    },
  ];

  test.each(reachable.map((t) => [`${t.from} to ${t.to}`, t] as const))(
    "%s",
    (_label, transition) => {
      const { getByTestId, rerender } = renderTiles([transition.start]);
      transition.arrive?.(getByTestId(SECTION));

      // The FROM state is a premise, not a comment: a transition case that
      // never occupied its starting state is asserting about one render.
      expectState(getByTestId(SECTION), transition.from);
      transition.drive(getByTestId(SECTION), rerender);
      expectState(getByTestId(SECTION), transition.to);
    },
  );

  test("load-failed to live, when a moved source arrives for the same diagram", () => {
    const stub = liveStub({ objectId: OBJ });
    const { getByTestId, rerender } = renderTiles([stub]);
    const hrefBefore = readTile(getByTestId(SECTION)).box.getAttribute("href");

    fail(getByTestId(SECTION));
    expectState(getByTestId(SECTION), "load-failed");

    // The SESSION moves and the objectId does not. On the staged path the href
    // and the sourceKey are both built from the session id, while `contentUrl`
    // feeds only `hasPreviewSource` — so moving `contentUrl` between two
    // resolving values moves NOTHING the reconcile compares, and an earlier
    // draft of this case failed for exactly that reason. The objectId is the
    // React key, so moving it would remount, seed `live` for free, and pass
    // against a component with no reconcile in it at all. Corpus precedent for
    // moving the session instead: step3DiagramTile.reconcile.test.tsx:111-123.
    rerender(gridOf([stub], "wizard-session-states-moved"));

    const hrefAfter = readTile(getByTestId(SECTION)).box.getAttribute("href");
    premiseHolds(
      "the rerender actually moved the href the reconcile compares",
      hrefBefore !== null && hrefAfter !== null && hrefBefore !== hrefAfter,
    );
    expectState(getByTestId(SECTION), "live");
  });

  test("absent to load-failed is UNREACHABLE, and the reason is that no image mounts", () => {
    const { getByTestId } = renderTiles([absentStub({ objectId: OBJ })]);
    const section = getByTestId(SECTION);
    expectState(section, "absent");

    // The driver for this transition is `onError` on a mounted image. In the
    // absent state the component renders no image at all, in the cell or
    // anywhere under it, so there is nothing that could fire it. Asserted on
    // the CELL rather than the box: an image moved out of the box but still in
    // the tile would keep the transition reachable.
    expect(readTile(section).cell.querySelectorAll("img").length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The two compound cases: a state change while ANOTHER state is non-default.
// ---------------------------------------------------------------------------
describe("compound transitions", () => {
  test("a reconcile does not clobber a sibling that is already load-failed", () => {
    const tileA = liveStub({ objectId: "compound-a", alt: "Plot A" });
    const tileB = liveStub({ objectId: "compound-b", alt: "Plot B" });
    const { getByTestId, rerender } = renderTiles([tileA, tileB]);
    const section = getByTestId(SECTION);

    // Tile 1 fails by its own error event.
    fireEvent.error(readTile(section, 1).img!);
    expectState(section, "load-failed", 1);
    expectState(section, "live", 0);

    // Tile 0 then flips by RECONCILE, in a render that also re-runs tile 1's
    // reconcile check. A reconcile that re-seeds on every render rather than on
    // a moved source would reset tile 1 to live here, and only a two-tile case
    // can see that.
    rerender(gridOf([{ ...tileA, contentUrl: null }, tileB]));

    const after = getByTestId(SECTION);
    expectState(after, "absent", 0);
    expectState(after, "load-failed", 1);
    // Both boxes still hold the 4:3 the browser oracle measures. The end state
    // of both, never a single batched frame, which nothing here guarantees.
    for (const i of [0, 1]) {
      expect(readTile(after, i).box.getAttribute("class")).toContain("aspect-4/3");
    }
  });

  test("live to load-failed while the anchor HOLDS focus still relocates focus first", () => {
    const { getByTestId } = renderTiles([
      liveStub({ objectId: "compound-focus-a", alt: "Plot A" }),
      liveStub({ objectId: "compound-focus-b", alt: "Plot B" }),
    ]);
    const section = getByTestId(SECTION);
    const first = readTile(section, 0).box as HTMLAnchorElement;
    const second = readTile(section, 1).box as HTMLAnchorElement;

    first.focus();
    premiseHolds("the failing tile HELD focus before the flip", document.activeElement === first);

    fireEvent.error(readTile(section, 0).img!);

    // Existing behaviour, asserted unchanged under the union: a tile that flips
    // while HOLDING focus still hands the caret to a sibling rather than to
    // <body>.
    //
    // What this case does NOT pin, measured rather than assumed: swapping
    // `onFailure` and the state write survives against this file. React batches
    // both updates inside one event handler, so the anchor is still connected
    // either way and the relocation still happens. The order IS pinned, by
    // step3DiagramTile.reconcile.test.tsx, whose "available -> unavailable" and
    // "stays failed across an unrelated parent re-render" cases both fail
    // against the swap. Saying so here rather than leaving a comment that
    // claims coverage this file has not got.
    const after = getByTestId(SECTION);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(second);
    expectState(after, "load-failed", 0);
    expectState(after, "live", 1);
  });
});
