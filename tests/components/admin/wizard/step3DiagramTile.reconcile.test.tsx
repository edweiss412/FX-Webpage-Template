// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx
 * (BL-ADMIN-DIAGRAM-NEXT-IMAGE, plan Task 2 — the mandatory transition-audit task)
 *
 * `const [failed, setFailed] = useState(!hasPreviewSource)` initialises once and
 * the only later write is `setFailed(true)`, while the tile key is stable
 * (`${stub.objectId}-${i}`). So every input the tile derives state from can move
 * under one component instance and none of them is reconciled today.
 *
 * Two anti-tautology constraints, both of which an earlier draft got wrong:
 *  - a case that moves the href must NOT move the objectId, because the objectId
 *    IS the key: varying it remounts, `failed` resets for free, and the case
 *    passes against the unrepaired component;
 *  - node identity is not the proof for the availability rows. The placeholder is
 *    a <span> and the live tile is an <a>, so they are necessarily different
 *    nodes. The proof is that the swap happens at all.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";

import { DiagramTile, DiagramsBreakdown } from "@/components/admin/wizard/step3ReviewSections";
import type { ImageLoader } from "next/image";
import type { EmbeddedImageStub, ParseResult } from "@/lib/parser/types";
import { premiseHolds } from "../../../_shared/premise";

const DFID = "drive-file-staged";
const WSID = "wizard-session-staged";
const TILE = (i: number) => `wizard-step3-card-${DFID}-diagram-tile-${i}`;

afterEach(cleanup);

function stagedStub(overrides: Partial<EmbeddedImageStub> = {}): EmbeddedImageStub {
  return {
    sheetTab: "DIAGRAMS",
    objectId: "staged-obj-1",
    mimeType: "image/png",
    contentUrl: "https://lh3.googleusercontent.com/staged-1",
    sheetsRevisionId: "rev-1",
    embeddedFingerprint: "fp-1",
    recovery_disposition: "normal",
    snapshotPath: null,
    alt: "Stage plot",
    ...overrides,
  };
}

describe("staged wizard diagram tile — failure state reconciles under a stable key", () => {
  // The tile key is `${stub.objectId}-${i}`, so a prop change rerenders the SAME
  // element. `useState(!hasPreviewSource)` initialises once and the only later
  // write is `setFailed(true)`, so all three of these are broken today.
  function renderOne(stub: EmbeddedImageStub, wizardSessionId: string = WSID) {
    return (
      <DiagramsBreakdown
        dfid={DFID}
        wizardSessionId={wizardSessionId}
        diagrams={
          {
            linkedFolder: null,
            embeddedImages: [stub],
            linkedFolderItems: [],
          } as ParseResult["diagrams"]
        }
      />
    );
  }

  test("unavailable -> available: the placeholder yields to a live image", () => {
    const id = "staged-obj-recover-avail";
    const { container, rerender, getByTestId } = render(
      renderOne(stagedStub({ objectId: id, contentUrl: null })),
    );
    premiseHolds("the tile started on the placeholder", container.querySelector("img") === null);

    rerender(renderOne(stagedStub({ objectId: id })));

    // The placeholder and the live tile are necessarily different DOM nodes (a
    // <span> and an <a>), so node identity proves nothing here. What proves the
    // reconciliation is that the swap happened AT ALL: the tile key is stable,
    // so React keeps the component instance, and `failed` starts true and is
    // only ever set true. Without a reset this render is still the placeholder.
    expect(container.querySelectorAll("img").length).toBe(1);
    expect(within(getByTestId(TILE(0))).queryByText("Preview unavailable")).toBeNull();
  });

  test("available -> unavailable: the image yields immediately, not on a failed fetch", () => {
    const id = "staged-obj-recover-unavail";
    const { container, rerender, getByTestId } = render(renderOne(stagedStub({ objectId: id })));
    premiseHolds("the tile started with an image", container.querySelector("img") !== null);

    rerender(renderOne(stagedStub({ objectId: id, contentUrl: null })));

    expect(container.querySelectorAll("img").length).toBe(0);
    expect(within(getByTestId(TILE(0))).getByText("Preview unavailable")).toBeTruthy();
  });

  test("failed on source A -> a good source B clears the failure", () => {
    // The href must move while the KEY does not. The tile key is
    // `${stub.objectId}-${i}`, so varying objectId would remount and clear the
    // state with no reconciliation at all — the case would pass against the
    // unrepaired component. Varying the wizard session moves only the URL:
    // same objectId, same key, same testid, different href.
    const stub = stagedStub({ objectId: "staged-obj-source-stable" });
    const { container, rerender, getByTestId } = render(renderOne(stub, "wizard-session-A"));
    const img = container.querySelector("img");
    premiseHolds("source A mounted an image to fail", img !== null);
    const hrefA = getByTestId(TILE(0)).getAttribute("href");
    fireEvent.error(img!);
    premiseHolds("source A is now failed", container.querySelector("img") === null);

    rerender(renderOne(stub, "wizard-session-B"));

    // The failure belongs to the source that failed, not to the slot.
    expect(container.querySelectorAll("img").length).toBe(1);
    const hrefB = getByTestId(TILE(0)).getAttribute("href");
    premiseHolds("the rerender actually moved the href", hrefA !== hrefB && hrefB !== null);
    expect(within(getByTestId(TILE(0))).queryByText("Preview unavailable")).toBeNull();
  });

  test("failed, then the loader changes under a stable source: the tile recovers", () => {
    // The tile-level half of the loader-only transition. Task 3 carries the
    // caller-level half (a real ladder arriving through `buildSourceKey`), which
    // is what stops `buildSourceKey` being implemented as the asset key alone.
    // Split deliberately: this case proves the TILE reconciles on `sourceKey`,
    // that one proves the published caller puts the ladder INTO it.
    //
    // Driven through DiagramTile directly, because `sourceKey` is the prop under
    // test and no breakdown-level fixture can move it without also moving the
    // href or the availability, which the three cases above already cover.
    const original = "/api/asset/diagram/show/rev/plan.png";
    const variant = "/api/asset/diagram/show/rev/plan.png@256.webp";
    const tile = (sourceKey: string, loader: ImageLoader) => (
      <DiagramTile
        href={original}
        sourceKey={sourceKey}
        loader={loader}
        sizes="100px"
        alt="Stage plot"
        testId="reconcile-loader"
        cellTestId="reconcile-loader-cell"
        hasPreviewSource={true}
      />
    );

    const { container, rerender, getByTestId } = render(tile("plan.png", () => original));
    const img = container.querySelector("img");
    premiseHolds("the no-ladder render mounted an image to fail", img !== null);
    fireEvent.error(img!);
    premiseHolds("the tile is now failed", container.querySelector("img") === null);

    // Same href, same availability: ONLY the manifest-derived source key moves.
    rerender(tile("plan.png|256:plan.png@256.webp", () => variant));

    // Serving variants now exist. A tile that stays on the placeholder renders
    // none of them, which the consequence bound forbids in its own words.
    expect(container.querySelectorAll("img").length).toBe(1);
    expect(within(getByTestId("reconcile-loader")).queryByText("Preview unavailable")).toBeNull();
    expect(new URL(container.querySelector("img")!.src, document.baseURI).pathname).toBe(variant);
  });

  test("a failed tile stays failed across an unrelated parent re-render", () => {
    // The other half of the reconciliation contract, and the one that says what
    // must NOT reset. A parent re-render builds a fresh loader closure for every
    // tile, so any comparison that includes the loader would clear a genuine
    // fetch failure on every unrelated render of the breakdown — the tile would
    // silently retry a broken image forever, flickering, with no state change
    // that explains it. Pinned on its own merits: "a failure survives until its
    // SOURCE changes" is the contract, and nothing else here observes it.
    const stub = stagedStub({ objectId: "staged-obj-parent-rerender" });
    const { container, rerender, getByTestId } = render(renderOne(stub));
    const img = container.querySelector("img");
    premiseHolds("the tile mounted an image to fail", img !== null);
    fireEvent.error(img!);
    premiseHolds("the tile is failed", container.querySelector("img") === null);

    // Same stub, same session: nothing about the SOURCE moves, but the parent
    // renders again and hands the tile a new loader closure.
    rerender(renderOne(stub));

    expect(container.querySelectorAll("img").length).toBe(0);
    expect(within(getByTestId(TILE(0))).getByText("Preview unavailable")).toBeTruthy();
  });
});
