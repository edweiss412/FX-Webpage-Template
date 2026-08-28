// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/step3DiagramTile.failureFocus.test.tsx
 *
 * A runtime image failure REMOVES an interactive element. Two things break if
 * it is removed silently, and both were live on this surface before this suite:
 *
 *   1. focus falls to `<body>` when the failing tile held it, so a keyboard
 *      user is dropped to the top of the document mid-review;
 *   2. nothing tells a screen-reader user why a tile they could open a moment
 *      ago is now inert.
 *
 * Surfaced by the whole-diff review with its own probe, which read
 * `{ before: 'A', after: 'BODY', liveRegions: 0 }` on BOTH the staged and the
 * published path. The repair is the crew gallery's shipped recipe
 * (`components/diagrams/Gallery.tsx:276-293`): move focus to a successor BEFORE
 * the state update that unmounts the anchor, then announce by name.
 *
 * Concrete failure modes these catch, none of which the existing error-path
 * cases can see (they assert the placeholder swap and never touch focus):
 *  - announcing but not relocating focus (case 1 reds, case 2 stays green);
 *  - relocating but not announcing (case 2 reds);
 *  - relocating AFTER `setFailed`, so the successor lookup runs against a tree
 *    where the anchor is already gone (case 1 reds on `BODY`);
 *  - stealing focus from wherever the user actually is when an unfocused tile
 *    fails (case 4);
 *  - a single-tile grid with no sibling to receive focus (case 3).
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";

import {
  DiagramsBreakdown,
  PublishedDiagramsBreakdown,
} from "@/components/admin/wizard/step3ReviewSections";
import type { EmbeddedImageStub, ParseResult } from "@/lib/parser/types";
import { premiseHolds } from "../../../_shared/premise";

const DFID = "drive-file-focus";
const WSID = "wizard-session-focus";
const SECTION = `wizard-step3-card-${DFID}-section-diagrams`;
const TILE = (i: number) => `wizard-step3-card-${DFID}-diagram-tile-${i}`;

const SHOW_ID = "44444444-4444-4444-8444-444444444444";
const REV = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const PUB_DFID = "DRIVE_FOCUS";
const PUB_SECTION = `wizard-step3-card-${PUB_DFID}-section-diagrams`;
const PUB_TILE = (i: number) => `wizard-step3-card-${PUB_DFID}-diagram-tile-${i}`;

afterEach(cleanup);

function stagedStub(overrides: Partial<EmbeddedImageStub> = {}): EmbeddedImageStub {
  return {
    sheetTab: "DIAGRAMS",
    objectId: "focus-obj-1",
    mimeType: "image/png",
    contentUrl: "https://lh3.googleusercontent.com/focus-1",
    sheetsRevisionId: "rev-1",
    embeddedFingerprint: "fp-1",
    recovery_disposition: "normal",
    snapshotPath: null,
    alt: "Stage plot",
    ...overrides,
  };
}

function renderStaged(stubs: EmbeddedImageStub[]) {
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

function publishedEntry(objectId: string, alt: string) {
  const assetKey = `embedded-${objectId}.png`;
  return {
    sheetTab: "DIAGRAMS",
    objectId,
    mimeType: "image/png",
    sheetsRevisionId: "sr-1",
    embeddedFingerprint: `fp-${objectId}`,
    recovery_disposition: "normal",
    alt,
    snapshotPath: `diagram-snapshots/shows/${SHOW_ID}/${REV}/${assetKey}`,
    variants: [
      { width: 256, key: `${assetKey}@256.webp` },
      { width: 512, key: `${assetKey}@512.webp` },
    ],
  };
}

function renderPublished(entries: ReturnType<typeof publishedEntry>[]) {
  const utils = render(
    <PublishedDiagramsBreakdown
      showId={SHOW_ID}
      driveFileId={PUB_DFID}
      diagrams={{
        current: {
          snapshot_revision_id: REV,
          snapshot_status: "complete",
          linkedFolder: null,
          embeddedImages: entries,
          linkedFolderItems: [],
        },
        pending: null,
      }}
    />,
  );
  return { ...utils, scoped: within(utils.getByTestId(PUB_SECTION)) };
}

/** Every live region inside the rendered container, by the two roles that
 *  actually announce. Scoped to the container so a region another surface
 *  renders can never satisfy this. */
function announcements(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[role="status"], [role="alert"], [aria-live]'))
    .map((node) => (node.textContent ?? "").trim())
    .filter(Boolean);
}

function failTile(scoped: ReturnType<typeof within>, testId: string): void {
  const img = scoped.getByTestId(testId).querySelector("img");
  premiseHolds(`an image mounted for ${testId}`, img !== null);
  fireEvent.error(img!);
}

describe("a failing diagram tile keeps focus in the grid and says so", () => {
  test("staged: focus moves to a sibling tile, never to body", () => {
    const { scoped } = renderStaged([
      stagedStub({ objectId: "focus-obj-1", alt: "Stage plot" }),
      stagedStub({ objectId: "focus-obj-2", alt: "Backdrop" }),
    ]);
    const first = scoped.getByTestId(TILE(0)) as HTMLAnchorElement;
    const second = scoped.getByTestId(TILE(1)) as HTMLAnchorElement;
    first.focus();
    premiseHolds(
      "the tile under test held focus before the failure",
      document.activeElement === first,
    );

    failTile(scoped, TILE(0));

    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(second);
  });

  test("staged: the failure is announced by the diagram's own name", () => {
    const { container, scoped } = renderStaged([
      stagedStub({ objectId: "focus-obj-1", alt: "Stage plot" }),
      stagedStub({ objectId: "focus-obj-2", alt: "Backdrop" }),
    ]);
    premiseHolds("nothing was announced before the failure", announcements(container).length === 0);

    failTile(scoped, TILE(0));

    const said = announcements(container);
    expect(said.length).toBeGreaterThan(0);
    expect(said.join(" ")).toContain("Stage plot");
  });

  test("staged: a lone failing tile still does not drop focus to body", () => {
    const { scoped } = renderStaged([stagedStub({ objectId: "focus-obj-1", alt: "Stage plot" })]);
    const only = scoped.getByTestId(TILE(0)) as HTMLAnchorElement;
    only.focus();
    premiseHolds("the lone tile held focus before the failure", document.activeElement === only);

    failTile(scoped, TILE(0));

    expect(document.activeElement).not.toBe(document.body);
  });

  test("staged: a failure elsewhere does not steal focus from the user", () => {
    // THREE tiles, and the focused one is deliberately NOT tile 0's successor.
    // At two tiles this case is vacuous: the successor of tile 0 IS tile 1, so
    // relocating unconditionally lands focus back where it already was and the
    // assertion passes either way. Measured — the mutant that deletes the
    // `document.activeElement === node` gate survived the two-tile form and
    // fails this one.
    const { scoped } = renderStaged([
      stagedStub({ objectId: "focus-obj-1", alt: "Stage plot" }),
      stagedStub({ objectId: "focus-obj-2", alt: "Backdrop" }),
      stagedStub({ objectId: "focus-obj-3", alt: "Truss plot" }),
    ]);
    const third = scoped.getByTestId(TILE(2)) as HTMLAnchorElement;
    third.focus();
    premiseHolds(
      "focus started on a tile that is neither the failing one nor its successor",
      document.activeElement === third,
    );

    failTile(scoped, TILE(0));

    expect(document.activeElement).toBe(third);
  });

  test("published: focus moves to a sibling tile and the failure is announced", () => {
    const { container, scoped } = renderPublished([
      publishedEntry("pub-obj-1", "Stage plot"),
      publishedEntry("pub-obj-2", "Backdrop"),
    ]);
    const first = scoped.getByTestId(PUB_TILE(0)) as HTMLAnchorElement;
    const second = scoped.getByTestId(PUB_TILE(1)) as HTMLAnchorElement;
    first.focus();
    premiseHolds(
      "the published tile held focus before the failure",
      document.activeElement === first,
    );

    failTile(scoped, PUB_TILE(0));

    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(second);
    expect(announcements(container).join(" ")).toContain("Stage plot");
  });
});
