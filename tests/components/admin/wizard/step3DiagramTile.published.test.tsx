// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/step3DiagramTile.published.test.tsx
 * (BL-ADMIN-DIAGRAM-NEXT-IMAGE, plan docs/superpowers/plans/2026-08-27-admin-diagram-next-image.md Task 2)
 *
 * The PUBLISHED half of the wizard diagram tile: the site that has a manifest
 * and therefore a variant ladder. Every expected URL is composed from the
 * fixture's own showId / snapshot_revision_id / snapshotPath / variants rows,
 * so a fixture edit extends the cover instead of stranding it.
 *
 * Concrete failure modes:
 *  - The site keeps the staged-shaped constant loader after Task 1, so the
 *    ladder never reaches the browser and every candidate is the original.
 *  - A hand-rolled loader that falls through to the ORIGINAL above the ladder,
 *    which is precisely what makeDiagramLoader deliberately does not do
 *    (lib/images/diagramLoader.ts:1-8) and which ships original bytes to
 *    high-DPR viewports while every status-shaped assertion still passes.
 *  - A malformed manifest row selected over a usable sibling, or a throw at a
 *    render boundary reading untrusted persisted JSONB.
 *  - The anchor's full-resolution href drifting when the inline URL template is
 *    replaced by the shared builder.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";

import { PublishedDiagramsBreakdown } from "@/components/admin/wizard/step3ReviewSections";
import { premise, premiseHolds } from "../../../_shared/premise";

const SHOW_ID = "33333333-3333-4333-8333-333333333333";
const REV = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const DRIVE_FILE_ID = "DRIVE_PUB";
// A Slides-style object id: `:` is legal after the first character and IS in the
// minted-key alphabet (lib/images/diagramKey.ts:25), so this is the strongest
// in-domain input for the href row below.
const OBJECT_ID = "g123abc:4";
const ASSET_KEY = `embedded-${OBJECT_ID}.png`;
const SECTION = `wizard-step3-card-${DRIVE_FILE_ID}-section-diagrams`;
const TILE0 = `wizard-step3-card-${DRIVE_FILE_ID}-diagram-tile-0`;
/** The CELL holds the box and the caption both; the message is a sibling of the
 *  box now. The `img` assertions beside these are the positive discriminators
 *  and stay as they are. */
const CELL0 = `wizard-step3-card-${DRIVE_FILE_ID}-diagram-cell-0`;

afterEach(cleanup);

/** The ladder the ingest stage writes (lib/sync/diagramVariants.ts:13 emits a
 *  tier only when strictly narrower than the original), as manifest rows. */
function ladder() {
  return [
    { width: 256, key: `${ASSET_KEY}@256.webp` },
    { width: 512, key: `${ASSET_KEY}@512.webp` },
  ];
}

/** The `{ current, pending }` wrapper the column really carries, so the render
 *  goes through resolveCurrentDiagrams rather than bypassing it. */
function diagramsColumn(entryOverrides: Record<string, unknown> = {}) {
  return {
    current: {
      snapshot_revision_id: REV,
      snapshot_status: "complete",
      linkedFolder: null,
      embeddedImages: [
        {
          sheetTab: "DIAGRAMS",
          objectId: OBJECT_ID,
          mimeType: "image/png",
          sheetsRevisionId: "sr-1",
          embeddedFingerprint: "fp-1",
          recovery_disposition: "normal",
          snapshotPath: `diagram-snapshots/shows/${SHOW_ID}/${REV}/${ASSET_KEY}`,
          variants: ladder(),
          ...entryOverrides,
        },
      ],
      linkedFolderItems: [],
    },
    pending: null,
  };
}

function renderPublished(entryOverrides: Record<string, unknown> = {}) {
  const utils = render(
    <PublishedDiagramsBreakdown
      showId={SHOW_ID}
      driveFileId={DRIVE_FILE_ID}
      diagrams={diagramsColumn(entryOverrides)}
    />,
  );
  return { ...utils, scoped: within(utils.getByTestId(SECTION)) };
}

function pathOf(url: string | null): string {
  return new URL(url ?? "", "http://localhost").pathname;
}

function assetUrl(key: string): string {
  return `/api/asset/diagram/${SHOW_ID}/${REV}/${key}`;
}

function tileImage(scoped: ReturnType<typeof within>): HTMLImageElement {
  const img = scoped.getByTestId(TILE0).querySelector("img");
  premiseHolds("an image element mounted for a servable published entry", img !== null);
  return img!;
}

function srcsetCandidates(img: HTMLImageElement): string[] {
  return (img.getAttribute("srcset") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => pathOf(entry.split(/\s+/)[0]!));
}

describe("published wizard diagram tile — the manifest ladder reaches the browser", () => {
  test("every srcset candidate is a VARIANT URL; the original appears in none", () => {
    const rows = ladder();
    // Without this the row is satisfiable by a one-tier fixture: "every
    // candidate is a variant" would hold with a single candidate, and the
    // set-equality would not exercise snapping at all.
    premise("the fixture ladder holds more than one serving row", rows.length, 1);
    premiseHolds(
      "no fixture row names the original, so the ladder is genuinely selectable",
      rows.every((row) => row.key !== ASSET_KEY),
    );
    const { scoped } = renderPublished();
    const candidates = srcsetCandidates(tileImage(scoped));
    premise("next/image emitted more than one srcset candidate", candidates.length, 1);

    // Snapping collapses next's device-width candidates onto the ladder, so
    // this is an EQUALITY: a loader that fell through to the original above the
    // ladder would add the original URL and fail here while a containment
    // assertion still passed.
    expect(new Set(candidates)).toEqual(new Set(ladder().map((row) => assetUrl(row.key))));
    expect(candidates).not.toContain(assetUrl(ASSET_KEY));
    expect(candidates.every((url) => url.includes("@"))).toBe(true);
    expect(candidates.some((url) => url.includes("/_next/image"))).toBe(false);
    expect(candidates.some((url) => url.includes("/api/admin/onboarding/"))).toBe(false);
  });

  test("no ladder: the original is served at every candidate", () => {
    const { scoped } = renderPublished({ variants: undefined });
    const candidates = srcsetCandidates(tileImage(scoped));
    premise("next/image emitted more than one srcset candidate", candidates.length, 1);
    expect(new Set(candidates)).toEqual(new Set([assetUrl(ASSET_KEY)]));
  });

  test.each([
    ["an empty array", []],
    ["a non-array", 42],
    ["an array of malformed rows", [{}, { width: "big", key: 5 }, null]],
    ["a row naming the original itself", [{ width: 256, key: ASSET_KEY }]],
  ])("malformed variants (%s): the original, and no throw", (_label, variants) => {
    const { scoped } = renderPublished({ variants });
    const candidates = srcsetCandidates(tileImage(scoped));
    premise("next/image emitted more than one srcset candidate", candidates.length, 1);
    expect(new Set(candidates)).toEqual(new Set([assetUrl(ASSET_KEY)]));
  });

  test("rerender absent -> ladder: the SAME mounted image moves from original to variants", () => {
    const { scoped, rerender } = renderPublished({ variants: undefined });
    const before = tileImage(scoped);
    expect(new Set(srcsetCandidates(before))).toEqual(new Set([assetUrl(ASSET_KEY)]));

    rerender(
      <PublishedDiagramsBreakdown
        showId={SHOW_ID}
        driveFileId={DRIVE_FILE_ID}
        diagrams={diagramsColumn()}
      />,
    );

    // The tile key is stable (`${stub.objectId}-${i}`), so this must be the same
    // element moving, not a remount. Catches a loader memoised on mount, which
    // would strand every already-open review on original bytes after the show's
    // next snapshot lands a ladder.
    premiseHolds("the image element survived the rerender", before.isConnected);
    expect(new Set(srcsetCandidates(before))).toEqual(
      new Set(ladder().map((row) => assetUrl(row.key))),
    );
  });

  test("rerender ladder -> absent: the SAME mounted image falls back to the original", () => {
    const { scoped, rerender } = renderPublished();
    const before = tileImage(scoped);
    expect(new Set(srcsetCandidates(before))).toEqual(
      new Set(ladder().map((row) => assetUrl(row.key))),
    );

    rerender(
      <PublishedDiagramsBreakdown
        showId={SHOW_ID}
        driveFileId={DRIVE_FILE_ID}
        diagrams={diagramsColumn({ variants: undefined })}
      />,
    );

    // A regenerated snapshot whose variant stage failed, or a GIF: the element
    // must stop pointing at variant keys the new revision never wrote.
    premiseHolds("the image element survived the rerender", before.isConnected);
    expect(new Set(srcsetCandidates(before))).toEqual(new Set([assetUrl(ASSET_KEY)]));
  });

  // Round 2 moved these here from the staged suite: the published gate reads
  // snapshotPath and mimeType (step3ReviewSections.tsx:4036-4039), and the
  // staged predicate reads neither.
  test.each([
    ["a null snapshotPath", { snapshotPath: null }],
    ["a MIME outside the allowed set", { mimeType: "application/pdf" }],
  ])("published servability gate (%s): placeholder, and NO image element", (_label, over) => {
    const { scoped, container } = renderPublished(over);
    expect(within(scoped.getByTestId(CELL0)).getByText("Preview unavailable")).toBeTruthy();
    expect(container.querySelectorAll("img").length).toBe(0);
  });

  test("an empty snapshot_revision_id renders the placeholder, never a doubled-slash URL", () => {
    // Round 3 finding 2 probed the earlier answer and it was wrong:
    // diagramAssetUrl(show, "", key) yields /api/asset/diagram/<show>//<key>,
    // which the consequence bound calls malformed. A row whose revision did not
    // survive the resolver gate has no fetchable bytes at any width, so the
    // published servability gate refuses it and the tile stops asking.
    const column = diagramsColumn();
    column.current.snapshot_revision_id = "";
    const { container, getByTestId } = render(
      <PublishedDiagramsBreakdown showId={SHOW_ID} driveFileId={DRIVE_FILE_ID} diagrams={column} />,
    );
    expect(within(getByTestId(CELL0)).getByText("Preview unavailable")).toBeTruthy();
    expect(container.querySelectorAll("img").length).toBe(0);
    // And nothing anywhere in the rendered tree carries the doubled slash.
    const urlBearing = Array.from(container.querySelectorAll("[src],[href]"))
      .flatMap((el) => [el.getAttribute("src"), el.getAttribute("href")])
      .filter((v): v is string => typeof v === "string");
    expect(urlBearing.filter((u) => u.includes("//api") || u.includes(`${SHOW_ID}//`))).toEqual([]);
  });

  test("the anchor's full-resolution href does not drift when the shared builder replaces the inline template", () => {
    const { scoped } = renderPublished();
    const anchor = scoped.getByTestId(TILE0);
    // `:` is in the minted-key alphabet and encodeKeySegment decodes it back,
    // so the shared builder is byte-identical to the template it replaces on
    // every key the ingest ladder actually writes. This row pins that
    // neutrality; the encoder's out-of-domain behaviour is the shipped loader's
    // own contract and is not what this arc claims.
    expect(pathOf(anchor.getAttribute("href"))).toBe(assetUrl(ASSET_KEY));
    expect(anchor.getAttribute("target")).toBe("_blank");
  });

  test("failed, then a ladder arrives THROUGH the real buildSourceKey: the tile recovers", () => {
    // Round 4's finding 3, made executable. Task 2 proves the TILE reconciles on
    // `sourceKey`; nothing proved the published caller puts the LADDER into it.
    // A contributor could implement buildSourceKey as the asset key alone and
    // every other case here still passes — cases 4 and 5 keep the image healthy,
    // so they never exercise recovery — while a failed published tile silently
    // never recovers when the show's next snapshot lands variants.
    const { scoped, rerender } = renderPublished({ variants: undefined });
    const img = tileImage(scoped);
    premiseHolds("the no-ladder render mounted an image to fail", img !== null);
    fireEvent.error(img);
    premiseHolds(
      "the tile is failed, so recovery is what is being observed",
      scoped.getByTestId(TILE0).querySelector("img") === null,
    );

    rerender(
      <PublishedDiagramsBreakdown
        showId={SHOW_ID}
        driveFileId={DRIVE_FILE_ID}
        diagrams={diagramsColumn()}
      />,
    );

    // Serving variants exist. A tile still on the placeholder renders none of
    // them, which the consequence bound forbids in its own words.
    const after = scoped.getByTestId(TILE0).querySelector("img");
    expect(after).not.toBeNull();
    expect(within(scoped.getByTestId(CELL0)).queryByText("Preview unavailable")).toBeNull();
    expect(new Set(srcsetCandidates(after!))).toEqual(
      new Set(ladder().map((row) => assetUrl(row.key))),
    );
  });
});
