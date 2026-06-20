// @vitest-environment jsdom
/**
 * tests/components/crew/diagramsBlock.test.tsx (relocated from
 * tests/components/tiles/DiagramsTile.test.tsx) (M7 Task 7.9 / AC-7.2 /
 * AC-7.2b / AC-7.4 / AC-7.7).
 *
 * DiagramsTile composes the Gallery + AgendaEmbed into the standard tile
 * frame and is responsible for:
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
 *     available diagrams AND no agenda PDF.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// Stub the leaf client components — they're exercised in their own
// suites; here we want to inspect the props the tile passes down.
vi.mock("@/components/diagrams/Gallery", () => ({
  Gallery: ({
    items,
    snapshotRevisionId,
    showId,
  }: {
    items: { key: string; alt: string; available: boolean }[];
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

vi.mock("@/components/agenda/AgendaEmbed", () => ({
  AgendaEmbed: ({
    showId,
    agendaLinks,
  }: {
    showId: string;
    agendaLinks: { label?: string; fileId?: string; url?: string }[];
  }) => (
    <div
      data-testid="agenda-stub"
      data-show={showId}
      data-links={JSON.stringify(agendaLinks)}
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
  test("returns null when no diagrams + no agenda PDFs (whole-tile-missing)", () => {
    const { container } = render(
      <DiagramsTile showId={SHOW_ID} diagrams={null} agendaLinks={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  test("returns null with empty diagrams payload + no agenda PDFs", () => {
    const { container } = render(
      <DiagramsTile
        showId={SHOW_ID}
        diagrams={diagrams()}
        agendaLinks={[{ label: "Url only", url: "https://example.com/x" }]}
      />,
    );
    // No fileId-bearing agenda link AND no diagrams → null.
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
        agendaLinks={[]}
      />,
    );
    const stub = screen.getByTestId("gallery-stub");
    const items = JSON.parse(stub.getAttribute("data-items") ?? "[]") as {
      key: string;
      available: boolean;
    }[];
    expect(items.map((i) => i.key)).toEqual([
      "embedded-obj-1.png",
      "embedded-obj-2.png",
      "folder-drv-1.jpg",
    ]);
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
        agendaLinks={[]}
      />,
    );
    const items = JSON.parse(
      screen.getByTestId("gallery-stub").getAttribute("data-items") ?? "[]",
    ) as { key: string; available: boolean }[];
    expect(items).toEqual([
      { key: "embedded-obj-1.png", alt: "Diagram 1", available: true },
      { key: "obj-2", alt: "Diagram 2", available: false },
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
        agendaLinks={[]}
      />,
    );
    const diaTile = screen.getByTestId("diagrams-tile");
    expect(diaTile).toBeTruthy();
    // Mock `map` glyph parity: the Site-diagrams card carries a leading icon in
    // the Section primitive's headingIcon slot (this block uses Section, not
    // SectionCard).
    expect(diaTile.querySelector("header svg")).not.toBeNull();
  });

  test("renders agenda when at least one agenda_links has fileId, even with no diagrams", () => {
    render(
      <DiagramsTile
        showId={SHOW_ID}
        diagrams={null}
        agendaLinks={[{ label: "Run of show", fileId: "1abc-AGENDA-fileId" }]}
      />,
    );
    const tile = screen.getByTestId("diagrams-tile");
    expect(tile).toBeTruthy();
    expect(screen.getByTestId("agenda-stub").getAttribute("data-show")).toBe(SHOW_ID);
    // No diagrams → Gallery stub NOT rendered.
    expect(screen.queryByTestId("gallery-stub")).toBeNull();
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
        agendaLinks={[]}
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
        agendaLinks={[{ label: "Run of show", fileId: "1abc-AGENDA-fileId" }]}
      />,
    );
    expect(container.innerHTML).not.toContain("drive.google.com");
    expect(container.innerHTML).not.toContain("docs.google.com");
  });
});
