// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/step3DiagramTile.staged.test.tsx
 * (BL-ADMIN-DIAGRAM-NEXT-IMAGE, plan docs/superpowers/plans/2026-08-27-admin-diagram-next-image.md Task 1)
 *
 * The STAGED half of the wizard diagram tile. Staged stubs can never carry a
 * variant ladder — `variants` lives on the persisted entry types only
 * (lib/parser/types.ts:446-451) — so this suite's whole subject is the
 * originals-only branch: the browser is offered width-keyed candidates and
 * EVERY one of them is the staged preview route URL.
 *
 * Concrete failure modes:
 *  - A raw <img> offers no candidates at all, so the premise reds rather than
 *    the suite passing on an empty list.
 *  - Passing the URL as next/image's `src` makes the loader return its own
 *    input; next then warns "does not implement width" on every staged tile,
 *    and nothing else in the suite would notice.
 *  - The element swap silently dropping the anchor's accessible name, or the
 *    image ceasing to be decorative and announcing the name twice.
 *  - The runtime-error placeholder swap, which no suite covers today.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";

import {
  DIAGRAM_TILE_SIZES,
  DiagramsBreakdown,
} from "@/components/admin/wizard/step3ReviewSections";
import type { EmbeddedImageStub, ParseResult } from "@/lib/parser/types";
import { premise, premiseHolds } from "../../../_shared/premise";

const DFID = "drive-file-staged";
const WSID = "wizard-session-staged";
const SECTION = `wizard-step3-card-${DFID}-section-diagrams`;
const TILE = (i: number) => `wizard-step3-card-${DFID}-diagram-tile-${i}`;

afterEach(cleanup);

/** A servable staged stub. `alt` is explicit so the a11y row derives from it. */
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

/** Every case renders its OWN objectId. next dedupes through `warnOnce`, which is
 *  process-global and keyed on the message string, and the missing-loader-width
 *  message embeds `src` — so a shared id would let an earlier case consume the
 *  warning case 2 exists to observe. */
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

/** The URL the staged preview route serves this stub. Composed from the
 *  fixture's own values — never pasted — so a fixture edit moves the
 *  expectation with it. Mirrors the default `resolveSrc` builder. */
function stagedUrl(stub: EmbeddedImageStub): string {
  return `/api/admin/onboarding/staged-diagram/${WSID}/${DFID}/${encodeURIComponent(stub.objectId)}`;
}

/** jsdom resolves img.src against the document origin; compare paths, not URLs.
 *  (Precedent: tests/components/diagrams/Gallery.test.tsx:246-248.) */
function pathOf(url: string | null): string {
  return new URL(url ?? "", "http://localhost").pathname;
}

function srcsetCandidates(img: HTMLImageElement): string[] {
  return (img.getAttribute("srcset") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => pathOf(entry.split(/\s+/)[0]!));
}

describe("staged wizard diagram tile — every candidate is the staged preview route", () => {
  test("offers width-keyed candidates and every one is the staged original", () => {
    const stub = stagedStub();
    const { scoped } = renderStaged([stub]);
    const img = scoped.getByTestId(TILE(0)).querySelector("img");
    premiseHolds("an image element mounted for a servable staged stub", img !== null);
    const candidates = srcsetCandidates(img!);

    // Without candidates there is nothing to check and the row is vacuous — a
    // raw <img> emits no srcset at all, which is exactly the pre-change tree.
    premise("next/image emitted more than one srcset candidate", candidates.length, 1);

    const expected = stagedUrl(stub);
    expect(new Set(candidates)).toEqual(new Set([expected]));
    expect(candidates.some((c) => c.includes("@"))).toBe(false);
    expect(candidates.some((c) => c.includes("/_next/image"))).toBe(false);
    expect(candidates.some((c) => c.includes("/api/asset/diagram"))).toBe(false);
    expect(pathOf(img!.getAttribute("src"))).toBe(expected);
  });

  test("the next/image src identity is NOT the URL, so no missing-loader-width warning fires", () => {
    // The spy goes up BEFORE this case's own render, and the stub carries an
    // objectId used by no other case in this file. Both are required: without
    // either, `warnOnce` can have consumed the message during an earlier render
    // and the case passes for the exact implementation it targets.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      renderStaged([stagedStub({ objectId: "staged-obj-warnprobe" })]);
      const offending = warn.mock.calls.filter((call) =>
        call.some((arg) => typeof arg === "string" && arg.includes("does not implement width")),
      );
      expect(offending).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });

  test("the declared sizes constant reaches the element", () => {
    const stub = stagedStub({ objectId: "staged-obj-sizes" });
    const { scoped } = renderStaged([stub]);
    const img = scoped.getByTestId(TILE(0)).querySelector("img");
    premiseHolds("an image element mounted", img !== null);
    // Read from the module, never pasted: the e2e tier oracle reads the same
    // constant, so the DOM and the oracle cannot disagree about what shipped.
    expect(img!.getAttribute("sizes")).toBe(DIAGRAM_TILE_SIZES);
  });

  test("the anchor keeps its sole accessible name and the image stays decorative", () => {
    const stub = stagedStub({ objectId: "staged-obj-a11y" });
    const { scoped } = renderStaged([stub]);
    const anchor = scoped.getByTestId(TILE(0));
    expect(anchor.tagName).toBe("A");
    expect(anchor).toHaveAccessibleName(`${stub.alt} (opens in a new tab)`);
    expect(anchor.querySelector("img")!.getAttribute("alt")).toBe("");
  });

  test("the anchor still opens the full-resolution original in a new tab", () => {
    const stub = stagedStub({ objectId: "staged-obj-href" });
    const { scoped } = renderStaged([stub]);
    const anchor = scoped.getByTestId(TILE(0));
    expect(pathOf(anchor.getAttribute("href"))).toBe(stagedUrl(stub));
    expect(anchor.getAttribute("target")).toBe("_blank");
    expect(anchor.getAttribute("rel")).toBe("noopener noreferrer");
  });
});

describe("staged wizard diagram tile — transition inventory", () => {
  // Both shapes the STAGED predicate rejects (lib/admin/stagedDiagramGuards.ts:57-63).
  // The published-only inputs — snapshotPath, mimeType, snapshot_revision_id —
  // are asserted in the published suite, because this predicate never reads them.
  test.each([
    ["a restage-only stub (null contentUrl, no media pair)", { contentUrl: null }],
    ["an untrusted-host contentUrl", { contentUrl: "https://evil.example.com/img" }],
  ])("unavailable at mount (%s): placeholder, and NO image element ever mounts", (label, over) => {
    const { scoped, container } = renderStaged([
      stagedStub({ objectId: `staged-obj-unavailable-${label.length}`, ...over }),
    ]);
    const tile = scoped.getByTestId(TILE(0));
    expect(within(tile).getByText("Preview unavailable")).toBeTruthy();
    expect(container.querySelectorAll("img").length).toBe(0);
  });

  test("image -> placeholder on a runtime error, in one step and with no animation", () => {
    const { scoped, container } = renderStaged([stagedStub({ objectId: "staged-obj-error" })]);
    const img = container.querySelector("img");
    premiseHolds("an image element mounted, so the error has something to remove", img !== null);

    fireEvent.error(img!);

    const tile = scoped.getByTestId(TILE(0));
    expect(within(tile).getByText("Preview unavailable")).toBeTruthy();
    expect(container.querySelectorAll("img").length).toBe(0);
    expect(tile.tagName).toBe("SPAN");
  });

  test("COMPOUND: a runtime error AFTER a successful load still swaps to the placeholder", () => {
    // Distinct from the row above by its event trace, which is the whole point:
    // an earlier draft fired `error` with no preceding `load` in both cases and
    // so covered one state twice. This is the late-5xx-on-refetch path.
    const { scoped, container } = renderStaged([stagedStub({ objectId: "staged-obj-compound" })]);
    const img = container.querySelector("img");
    premiseHolds("an image element mounted before the compound case runs", img !== null);

    fireEvent.load(img!);
    premiseHolds(
      "the load left the image mounted, so the error has something to remove",
      img!.isConnected,
    );

    fireEvent.error(img!);
    const tile = scoped.getByTestId(TILE(0));
    expect(within(tile).getByText("Preview unavailable")).toBeTruthy();
    expect(container.querySelectorAll("img").length).toBe(0);
  });
});
