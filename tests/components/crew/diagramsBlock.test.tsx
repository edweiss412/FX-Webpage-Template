// @vitest-environment jsdom
/**
 * tests/components/crew/diagramsBlock.test.tsx (relocated from
 * tests/components/tiles/DiagramsTile.test.tsx) (M7 Task 7.9 / AC-7.2 /
 * AC-7.2b / AC-7.4 / AC-7.7).
 *
 * DiagramsTile composes the Gallery into the standard tile frame and is
 * responsible for (the agenda PDF relocated to the Schedule section, §4.6):
 *
 *   - AC-7.2b ordering: embedded entries come BEFORE linked-folder
 *     entries in the gallery.
 *   - AC-7.7 availability flag: items with `snapshotPath === null`
 *     map to `available: false` so the Gallery renders a placeholder
 *     slot, not a hidden slot.
 *   - Asset-key derivation: the gallery URL's `<key>` segment is the
 *     last path segment of the stored `snapshotPath` so the tile's
 *     emitted URLs literal-equality match what the diagram-route's
 *     `findAsset()` compares against.
 *   - Whole-tile-missing reflow: returns `null` when there are no
 *     available diagrams.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { premise } from "@/tests/_shared/premise";
import { cleanup, render, screen } from "@testing-library/react";

// Stub the leaf client components — they're exercised in their own
// suites; here we want to inspect the props the tile passes down.
vi.mock("@/components/diagrams/Gallery", () => ({
  Gallery: ({
    items,
    snapshotRevisionId,
    showId,
  }: {
    items: { id: string; key: string; alt: string; available: boolean }[];
    snapshotRevisionId: string;
    showId: string;
  }) => (
    <div
      data-testid="gallery-stub"
      data-show={showId}
      data-rev={snapshotRevisionId}
      data-items={JSON.stringify(items)}
    />
  ),
}));

import { DiagramsTile } from "@/components/crew/DiagramsBlock";
import type { PersistedDiagrams } from "@/lib/parser/types";

const SHOW_ID = "11111111-1111-4111-8111-111111111111";
const REV = "22222222-2222-4222-8222-222222222222";

function diagrams(overrides: Partial<PersistedDiagrams> = {}): PersistedDiagrams {
  return {
    snapshot_revision_id: REV,
    snapshot_status: "complete",
    linkedFolder: null,
    embeddedImages: [],
    linkedFolderItems: [],
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("DiagramsTile", () => {
  test("returns null when no diagrams (whole-tile-missing)", () => {
    const { container } = render(<DiagramsTile showId={SHOW_ID} diagrams={null} />);
    expect(container.firstChild).toBeNull();
  });

  test("returns null with empty diagrams payload", () => {
    const { container } = render(<DiagramsTile showId={SHOW_ID} diagrams={diagrams()} />);
    // No diagram content → null (the agenda moved to Schedule, §4.6).
    expect(container.firstChild).toBeNull();
  });

  test("AC-7.2b: embedded entries come before linked-folder entries in the gallery", () => {
    render(
      <DiagramsTile
        showId={SHOW_ID}
        diagrams={diagrams({
          embeddedImages: [
            {
              sheetTab: "DIAGRAMS",
              objectId: "obj-1",
              mimeType: "image/png",
              sheetsRevisionId: "sheet-rev-1",
              embeddedFingerprint: "fingerprint",
              recovery_disposition: "normal",
              snapshotPath: `diagram-snapshots/shows/${SHOW_ID}/${REV}/embedded-obj-1.png`,
            },
            {
              sheetTab: "DIAGRAMS",
              objectId: "obj-2",
              mimeType: "image/png",
              sheetsRevisionId: "sheet-rev-1",
              embeddedFingerprint: "fp-2",
              recovery_disposition: "normal",
              snapshotPath: `diagram-snapshots/shows/${SHOW_ID}/${REV}/embedded-obj-2.png`,
            },
          ],
          linkedFolderItems: [
            {
              driveFileId: "drv-1",
              mimeType: "image/jpeg",
              drive_modified_time: "2026-04-30T12:00:00Z",
              headRevisionId: "head-1",
              md5Checksum: "md5-1",
              snapshotPath: `diagram-snapshots/shows/${SHOW_ID}/${REV}/folder-drv-1.jpg`,
            },
          ],
        })}
      />,
    );
    const stub = screen.getByTestId("gallery-stub");
    const items = JSON.parse(stub.getAttribute("data-items") ?? "[]") as {
      id: string;
      key: string;
      available: boolean;
    }[];
    expect(items.map((i) => i.key)).toEqual([
      "embedded-obj-1.png",
      "embedded-obj-2.png",
      "folder-drv-1.jpg",
    ]);
    // React/failed-tracking id is source-prefixed from the parser-side id —
    // distinct from `key`, and list-unique (embedded ids never collide with
    // linked ids) so a shared asset `key` can't produce a React key clash.
    expect(items.map((i) => i.id)).toEqual(["embedded:obj-1", "embedded:obj-2", "linked:drv-1"]);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(stub.getAttribute("data-rev")).toBe(REV);
    expect(stub.getAttribute("data-show")).toBe(SHOW_ID);
  });

  test("AC-7.7: items with snapshotPath=null map to available:false (placeholder slot)", () => {
    render(
      <DiagramsTile
        showId={SHOW_ID}
        diagrams={diagrams({
          embeddedImages: [
            {
              sheetTab: "DIAGRAMS",
              objectId: "obj-1",
              mimeType: "image/png",
              sheetsRevisionId: "sheet-rev-1",
              embeddedFingerprint: "fp",
              recovery_disposition: "normal",
              snapshotPath: `diagram-snapshots/shows/${SHOW_ID}/${REV}/embedded-obj-1.png`,
            },
            {
              sheetTab: "DIAGRAMS",
              objectId: "obj-2",
              mimeType: "image/png",
              sheetsRevisionId: "sheet-rev-1",
              embeddedFingerprint: null,
              recovery_disposition: "restage_required",
              snapshotPath: null,
            },
          ],
        })}
      />,
    );
    const items = JSON.parse(
      screen.getByTestId("gallery-stub").getAttribute("data-items") ?? "[]",
    ) as { id: string; key: string; available: boolean }[];
    expect(items).toEqual([
      // `variants: []` is now part of every mapped item (spec §6): the loader
      // takes an array, and an absent field would read as "not yet mapped".
      {
        id: "embedded:obj-1",
        key: "embedded-obj-1.png",
        alt: "Diagram 1",
        available: true,
        variants: [],
      },
      // null snapshotPath → asset `key` falls back to the bare parser id,
      // but `id` stays source-prefixed and unique for React reconciliation.
      { id: "embedded:obj-2", key: "obj-2", alt: "Diagram 2", available: false, variants: [] },
    ]);
  });

  test("renders Section with stable testid and Diagrams heading", () => {
    render(
      <DiagramsTile
        showId={SHOW_ID}
        diagrams={diagrams({
          embeddedImages: [
            {
              sheetTab: "DIAGRAMS",
              objectId: "obj-1",
              mimeType: "image/png",
              sheetsRevisionId: "sheet-rev-1",
              embeddedFingerprint: "fp",
              recovery_disposition: "normal",
              snapshotPath: `diagram-snapshots/shows/${SHOW_ID}/${REV}/embedded-obj-1.png`,
            },
          ],
        })}
      />,
    );
    const diaTile = screen.getByTestId("diagrams-tile");
    expect(diaTile).toBeTruthy();
    // Mock `map` glyph parity: the Site-diagrams card carries a leading icon in
    // the Section primitive's headingIcon slot (this block uses Section, not
    // SectionCard).
    expect(diaTile.querySelector("header svg")).not.toBeNull();
  });

  test("no diagrams → null (agenda relocated to Schedule, §4.6 — no empty block)", () => {
    // A diagram-less show no longer renders a Diagrams block just because it
    // has an agenda PDF — the agenda lives in the Schedule section now.
    const { container } = render(<DiagramsTile showId={SHOW_ID} diagrams={null} />);
    expect(container.firstChild).toBeNull();
  });

  test("Codex R13 P1: persisted SVG entry maps to available:false (no <img>, placeholder instead)", () => {
    render(
      <DiagramsTile
        showId={SHOW_ID}
        diagrams={diagrams({
          embeddedImages: [
            {
              sheetTab: "DIAGRAMS",
              objectId: "obj-1",
              mimeType: "image/svg+xml",
              sheetsRevisionId: "sheet-rev-1",
              embeddedFingerprint: "fp",
              recovery_disposition: "normal",
              snapshotPath: `diagram-snapshots/shows/${SHOW_ID}/${REV}/embedded-obj-1.svg`,
            },
            {
              sheetTab: "DIAGRAMS",
              objectId: "obj-2",
              mimeType: "image/png",
              sheetsRevisionId: "sheet-rev-1",
              embeddedFingerprint: "fp",
              recovery_disposition: "normal",
              snapshotPath: `diagram-snapshots/shows/${SHOW_ID}/${REV}/embedded-obj-2.png`,
            },
          ],
        })}
      />,
    );
    const items = JSON.parse(
      screen.getByTestId("gallery-stub").getAttribute("data-items") ?? "[]",
    ) as { key: string; available: boolean }[];
    // SVG entry MUST be unavailable (proxy would 410); raster entry
    // stays available. Tile + route use the unified MIME allowlist at
    // lib/data/diagrams.ts:isAllowedDiagramMime.
    expect(items[0]?.available).toBe(false);
    expect(items[1]?.available).toBe(true);
  });

  test("crew DOM emitted by the tile contains NO drive.google.com substring", () => {
    const { container } = render(
      <DiagramsTile
        showId={SHOW_ID}
        diagrams={diagrams({
          embeddedImages: [
            {
              sheetTab: "DIAGRAMS",
              objectId: "obj-1",
              mimeType: "image/png",
              sheetsRevisionId: "sheet-rev-1",
              embeddedFingerprint: "fp",
              recovery_disposition: "normal",
              snapshotPath: `diagram-snapshots/shows/${SHOW_ID}/${REV}/embedded-obj-1.png`,
            },
          ],
        })}
      />,
    );
    expect(container.innerHTML).not.toContain("drive.google.com");
    expect(container.innerHTML).not.toContain("docs.google.com");
  });
});

// ---------------------------------------------------------------------------
// §4 field plumbing through the REAL mapper (spec §6).
//
// Gallery.test.tsx constructs GalleryItem objects directly, so the mapper could
// drop every one of these fields and that suite would still pass. This is the
// only place the manifest-entry → GalleryItem carry is actually exercised.
// ---------------------------------------------------------------------------

describe("DiagramsTile — §4 manifest fields reach GalleryItem", () => {
  const variants = [
    { width: 256, key: "embedded-obj-1.png@256.webp" },
    { width: 512, key: "embedded-obj-1.png@512.webp" },
  ];
  const blurDataURL = "data:image/webp;base64,UklGRhIAAABXRUJQ";

  function manifest(overrides: {
    embedded?: Record<string, unknown>;
    linked?: Record<string, unknown>;
  }): PersistedDiagrams {
    return {
      snapshot_revision_id: REV,
      snapshot_status: "complete",
      linkedFolder: null,
      embeddedImages: [
        {
          sheetTab: "DIAGRAMS",
          objectId: "obj-1",
          mimeType: "image/png",
          sheetsRevisionId: "sheet-rev-1",
          embeddedFingerprint: "fp",
          recovery_disposition: "normal",
          snapshotPath: `diagram-snapshots/shows/${SHOW_ID}/${REV}/embedded-obj-1.png`,
          ...overrides.embedded,
        },
      ],
      linkedFolderItems: [
        {
          driveFileId: "linked-1",
          mimeType: "image/jpeg",
          drive_modified_time: "2026-05-01T00:00:00.000Z",
          headRevisionId: "rev-1",
          md5Checksum: "a".repeat(32),
          snapshotPath: `diagram-snapshots/shows/${SHOW_ID}/${REV}/folder-linked-1.jpg`,
          ...overrides.linked,
        },
      ],
    } as unknown as PersistedDiagrams;
  }

  type CapturedItem = Record<string, unknown>;

  function capturedItems(diagrams: PersistedDiagrams): CapturedItem[] {
    render(<DiagramsTile showId={SHOW_ID} diagrams={diagrams} />);
    const raw = screen.getByTestId("gallery-stub").getAttribute("data-items");
    return JSON.parse(raw ?? "[]") as CapturedItem[];
  }

  test("variants, blur and intrinsic dims carry from BOTH entry types", () => {
    const linkedVariants = [{ width: 256, key: "folder-linked-1.jpg@256.webp" }];
    const items = capturedItems(
      manifest({
        embedded: { variants, blurDataURL, intrinsicWidth: 1600, intrinsicHeight: 900 },
        linked: {
          variants: linkedVariants,
          blurDataURL,
          intrinsicWidth: 800,
          intrinsicHeight: 600,
        },
      }),
    );

    premise("both entry types produced items to inspect", items.length, 1);
    expect(items[0]).toMatchObject({
      variants,
      blurDataURL,
      intrinsicWidth: 1600,
      intrinsicHeight: 900,
    });
    expect(items[1]).toMatchObject({
      variants: linkedVariants,
      blurDataURL,
      intrinsicWidth: 800,
      intrinsicHeight: 600,
    });
  });

  test("absent manifest fields map to absent item fields, never to nulls", () => {
    const items = capturedItems(manifest({}));

    for (const item of items) {
      expect("blurDataURL" in item).toBe(false);
      expect("intrinsicWidth" in item).toBe(false);
      expect("intrinsicHeight" in item).toBe(false);
      // `variants` is always present on the item (the loader takes an array),
      // but it must be EMPTY rather than a fabricated ladder.
      expect(item.variants).toEqual([]);
    }
  });
});
