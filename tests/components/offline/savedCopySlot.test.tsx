/**
 * <SavedCopySlot> (spec 4.3, 4.7.2, 4.8): the server component CrewShell
 * renders directly after its header. It renders the crew shell's one marker:
 * `save` for a crew viewer, carrying the show, the render time CrewShell passes
 * in, the picker epoch, the viewer key and the server-built asset list; `purge`
 * naming the show for an admin or admin-preview viewer (the staged preview
 * passes an admin-preview viewer too).
 *
 * Each case reads the rendered HTML with the worker's own reader, so a marker
 * that renders but would not parse fails here.
 */
import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/show/demo-show/abc123" }));
vi.mock("@/lib/offline/viewerKey", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/offline/viewerKey")>();
  return { viewerKey: vi.fn(actual.viewerKey) };
});
// Wrapped, so one case can make the build throw; every other case runs the real list.
vi.mock("@/lib/offline/assetList", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/offline/assetList")>();
  return { savedCopyAssetUrls: vi.fn(actual.savedCopyAssetUrls) };
});

import { SavedCopySlot, type SavedCopySlotProps } from "@/components/offline/SavedCopySlot";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { savedCopyAssetUrls } from "@/lib/offline/assetList";
import { MARKER_ID, readMarker, type Marker } from "@/lib/offline/marker";
import { viewerKey } from "@/lib/offline/viewerKey";
import type { PersistedDiagrams } from "@/lib/parser/types";
import { premise } from "@/tests/_shared/premise";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

const SHOW = "3f2b8c1e-9d4a-4e6b-8a57-1c2d3e4f5a6b";
const REV = "9a7c1d20-5b3e-4f18-9c64-0e2b7a8d1f35";
const CREW = "7c1e0d42-2b6f-4a39-9e81-5f3a2c4b6d70";
const RENDERED_AT = "2026-10-27T06:03:26.123Z";

const DIAGRAMS: PersistedDiagrams = {
  snapshot_revision_id: REV,
  snapshot_status: "complete",
  linkedFolder: null,
  embeddedImages: [
    {
      sheetTab: "DIAGRAMS",
      objectId: "obj-1",
      mimeType: "image/png",
      sheetsRevisionId: "sheet-rev-1",
      embeddedFingerprint: "fp-1",
      recovery_disposition: "normal",
      snapshotPath: `diagram-snapshots/shows/${SHOW}/${REV}/embedded-obj-1.png`,
      variants: [{ width: 256, key: "embedded-obj-1.png@256.webp" }],
    },
  ],
  linkedFolderItems: [],
};

const AGENDA_URL = `/api/asset/agenda/${SHOW}/1Agenda`;

const BASE = makeShowForViewer({
  show: { agenda_links: [{ label: "AGENDA LINK", fileId: "1Agenda" }] },
});

/** The viewer's own crew row is CREW, unrestricted unless a case says otherwise. */
const DATA: ShowForViewer = {
  ...BASE,
  diagrams: DIAGRAMS,
  crewMembers: BASE.crewMembers.map((member) => ({ ...member, id: CREW })),
};

const CREW_VIEWER: Viewer = { kind: "crew", crewMemberId: CREW };

function props(overrides: Partial<SavedCopySlotProps> = {}): SavedCopySlotProps {
  return {
    viewer: CREW_VIEWER,
    showId: SHOW,
    data: DATA,
    slug: "demo-show",
    shareToken: "abc123",
    renderedAt: RENDERED_AT,
    epoch: 4,
    ...overrides,
  };
}

const keyFor = vi.mocked(viewerKey);
const buildAssets = vi.mocked(savedCopyAssetUrls);

const realModule =
  await vi.importActual<typeof import("@/lib/offline/viewerKey")>("@/lib/offline/viewerKey");

afterEach(() => {
  keyFor.mockClear();
  buildAssets.mockClear();
});

function renderSlot(overrides: Partial<SavedCopySlotProps> = {}): string {
  return renderToStaticMarkup(<SavedCopySlot {...props(overrides)} />);
}

/** The one marker in the slot's HTML, as the worker reads it. */
function markerIn(html: string): Marker {
  expect(html.split(`id="${MARKER_ID}"`)).toHaveLength(2);
  const read = readMarker(html);
  if (read.kind !== "valid") throw new Error(`expected a valid marker, read ${read.kind}`);
  return read.marker;
}

describe("SavedCopySlot", () => {
  test("a crew viewer gets a save marker with every attribute the worker needs", () => {
    const assets = savedCopyAssetUrls(SHOW, DATA, CREW_VIEWER);
    // The list must reach both kinds of asset, or the equality below is weak.
    premise("the fixture lists more than one asset", assets.length, 1);
    expect(assets).toContain(AGENDA_URL);

    expect(markerIn(renderSlot())).toEqual({
      disposition: "save",
      showId: SHOW,
      renderedAt: RENDERED_AT,
      epoch: 4,
      viewer: realModule.viewerKey(SHOW, CREW),
      assets,
    });
    expect(keyFor).toHaveBeenCalledWith(SHOW, CREW);
  });

  test.each<[string, Viewer]>([
    ["admin", { kind: "admin" }],
    ["admin_preview", { kind: "admin_preview", crewMemberId: CREW }],
  ])("an %s viewer gets a purge marker naming the show", (_kind, viewer) => {
    const html = renderSlot({ viewer });

    expect(markerIn(html)).toEqual({ disposition: "purge", showId: SHOW });
    expect(html).not.toContain("data-viewer");
    expect(html).not.toContain("data-assets");
    expect(keyFor).not.toHaveBeenCalled();
  });

  test("a crew viewer with no epoch falls back to purge naming the show", () => {
    expect(markerIn(renderSlot({ epoch: undefined }))).toEqual({
      disposition: "purge",
      showId: SHOW,
    });
  });

  test("a crew viewer whose viewer key is unavailable falls back to purge naming the show", () => {
    keyFor.mockReturnValueOnce(null);

    expect(markerIn(renderSlot())).toEqual({ disposition: "purge", showId: SHOW });
  });

  test("a crew viewer whose days are withheld saves no agenda", () => {
    const data: ShowForViewer = {
      ...DATA,
      crewMembers: DATA.crewMembers.map((member) => ({
        ...member,
        dateRestriction: { kind: "unknown_asterisk", days: null },
      })),
    };

    const marker = markerIn(renderSlot({ data }));
    if (marker.disposition !== "save") throw new Error(`expected save, read ${marker.disposition}`);
    premise("the diagram is still saved", marker.assets.length, 0);
    expect(marker.assets).not.toContain(AGENDA_URL);
  });

  test("a throw while building the asset list saves with no assets instead of failing the page", () => {
    buildAssets.mockImplementationOnce(() => {
      throw new Error("asset list failed");
    });

    expect(markerIn(renderSlot())).toMatchObject({ disposition: "save", showId: SHOW, assets: [] });
    expect(buildAssets).toHaveBeenCalledTimes(1);
  });

  test("malformed agenda data degrades to a save with no assets", () => {
    // getShowForViewer casts the jsonb column, so a non-array can reach the page.
    const data = {
      ...DATA,
      show: { ...DATA.show, agenda_links: {} as ShowForViewer["show"]["agenda_links"] },
    };

    expect(markerIn(renderSlot({ data }))).toMatchObject({ disposition: "save", assets: [] });
  });

  test("is synchronous, so the CrewShell render suites can mount it", () => {
    expect(SavedCopySlot.constructor.name).not.toBe("AsyncFunction");
    const element = SavedCopySlot(props());
    expect(element).not.toBeInstanceOf(Promise);
    expect(isValidElement(element)).toBe(true);
  });
});
