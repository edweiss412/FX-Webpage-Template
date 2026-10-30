// @vitest-environment jsdom
/**
 * savedCopyAssetUrls (spec 4.8): the asset list a crew `save` marker carries,
 * built on the server from the same show data and URL shapes the crew
 * components use, so nothing is scraped from HTML and an unopened agenda or a
 * diagram past "Show all" is still saved.
 *
 * The spec pins the list to the components "by a shared helper, or by a test
 * that renders both and compares". The diagram items come from the helper
 * DiagramsTile itself uses (components/crew/diagramItems.ts); this file adds
 * the rendering comparison for both diagrams and agendas: DiagramsTile and
 * AgendaEmbed render in jsdom with real next/image, and every URL they put in
 * the DOM must be listed. The reverse direction (every listed diagram URL is one
 * the Gallery or the lightbox could request) is checked against makeDiagramLoader
 * output, since the lightbox's pinned original is not in the closed gallery's
 * markup.
 */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import { afterEach, describe, expect, test, vi } from "vitest";

// jsdom cannot run pdf.js; the sheet's own `data-pdf-src` is what is compared.
vi.mock("@/components/agenda/AgendaPdfViewer", () => ({ AgendaPdfViewer: () => null }));

import { AgendaEmbed } from "@/components/agenda/AgendaEmbed";
import { DiagramsTile } from "@/components/crew/DiagramsBlock";
import { INITIAL_VISIBLE } from "@/components/diagrams/galleryLimits";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import { makeDiagramLoader } from "@/lib/images/diagramLoader";
import { savedCopyAssetUrls } from "@/lib/offline/assetList";
import type {
  PersistedDiagrams,
  PersistedEmbeddedImage,
  PersistedLinkedFolderItem,
} from "@/lib/parser/types";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

const SHOW = "11111111-1111-4111-8111-111111111111";
const REV = "22222222-2222-4222-8222-222222222222";
const DIAGRAM_PREFIX = `/api/asset/diagram/${SHOW}/${REV}/`;
const AGENDA_PREFIX = `/api/asset/agenda/${SHOW}/`;

/** Every width next/image can put in a srcset under the configuration Vitest runs with. */
const NEXT_WIDTHS = [...imageConfigDefault.deviceSizes, ...imageConfigDefault.imageSizes];

function ladder(key: string): { width: number; key: string }[] {
  return [256, 512, 1024].map((width) => ({ width, key: `${key}@${width}.webp` }));
}

function snapshotPath(name: string): string {
  return `diagram-snapshots/shows/${SHOW}/${REV}/${name}`;
}

function embedded(
  objectId: string,
  overrides: Partial<PersistedEmbeddedImage> = {},
): PersistedEmbeddedImage {
  return {
    sheetTab: "DIAGRAMS",
    objectId,
    mimeType: "image/png",
    sheetsRevisionId: "sheet-rev-1",
    embeddedFingerprint: `fp-${objectId}`,
    recovery_disposition: "normal",
    snapshotPath: snapshotPath(`embedded-${objectId}.png`),
    ...overrides,
  };
}

function linked(
  driveFileId: string,
  overrides: Partial<PersistedLinkedFolderItem> = {},
): PersistedLinkedFolderItem {
  return {
    driveFileId,
    mimeType: "image/jpeg",
    drive_modified_time: "2026-10-20T12:00:00Z",
    headRevisionId: `head-${driveFileId}`,
    md5Checksum: `md5-${driveFileId}`,
    snapshotPath: snapshotPath(`folder-${driveFileId}.jpg`),
    ...overrides,
  };
}

/**
 * The available entries, with the asset key each is stored under, written out
 * here rather than derived, so the reverse check does not read the code it checks.
 */
const AVAILABLE = [
  { key: "embedded-obj-1.png", variants: ladder("embedded-obj-1.png") },
  { key: "embedded-obj-2.png", variants: [] },
  { key: "folder-drv-1.jpg", variants: ladder("folder-drv-1.jpg") },
  { key: "folder-drv-2.jpg", variants: [] },
];

const DIAGRAMS: PersistedDiagrams = {
  snapshot_revision_id: REV,
  snapshot_status: "partial_failure",
  linkedFolder: null,
  embeddedImages: [
    embedded("obj-1", { alt: "Stage plot", variants: ladder("embedded-obj-1.png") }),
    embedded("obj-2"),
    // Unavailable: the asset route refuses SVG, and a null path never downloaded.
    embedded("obj-svg", {
      mimeType: "image/svg+xml",
      snapshotPath: snapshotPath("embedded-obj-svg.svg"),
    }),
    embedded("obj-missing", { snapshotPath: null }),
  ],
  linkedFolderItems: [linked("drv-1", { variants: ladder("folder-drv-1.jpg") }), linked("drv-2")],
};

const AGENDA_LINKS: ShowForViewer["show"]["agenda_links"] = [
  { label: "AGENDA LINK", fileId: "1AgendaFileA_abc-123" },
  { label: "AGENDA LINK - Day 2", url: "https://example.test/agenda-day-2" },
  { label: "AGENDA LINK - Breakouts", fileId: "1AgendaFileB_def-456" },
  { label: "AGENDA", fileId: "" },
];

function showData(overrides: { diagrams?: PersistedDiagrams | null } = {}): ShowForViewer {
  const data = makeShowForViewer({ show: { agenda_links: AGENDA_LINKS } });
  return { ...data, diagrams: overrides.diagrams === undefined ? DIAGRAMS : overrides.diagrams };
}

/** jsdom may report an origin-qualified URL; the list holds same-origin paths. */
function pathOf(url: string): string {
  const parsed = new URL(url, "http://localhost");
  return `${parsed.pathname}${parsed.search}`;
}

/** Every URL in a `src` or `srcset` attribute under `root`, with the largest srcset seen. */
function requestedUrls(root: ParentNode): { urls: Set<string>; widestSrcset: number } {
  const urls = new Set<string>();
  let widestSrcset = 0;
  for (const element of root.querySelectorAll("[src], [srcset]")) {
    const src = element.getAttribute("src");
    if (src) urls.add(pathOf(src));
    const srcset = new Set(
      (element.getAttribute("srcset") ?? "")
        .split(",")
        .map((candidate) => candidate.trim().split(/\s+/)[0] ?? "")
        .filter((url) => url.length > 0)
        .map(pathOf),
    );
    widestSrcset = Math.max(widestSrcset, srcset.size);
    for (const url of srcset) urls.add(url);
  }
  return { urls, widestSrcset };
}

afterEach(() => cleanup());

describe("savedCopyAssetUrls: diagrams", () => {
  test("lists every URL the rendered Gallery requests", () => {
    const data = showData();
    const { container } = render(
      createElement(DiagramsTile, { showId: SHOW, diagrams: data.diagrams }),
    );
    const { urls, widestSrcset } = requestedUrls(container);
    // The comparison must see the variant ladder, not only single-URL originals.
    premise("a rendered srcset offered two or more distinct candidates", widestSrcset, 1);

    const listed = new Set(savedCopyAssetUrls(SHOW, data));
    expect([...urls].filter((url) => !listed.has(url))).toEqual([]);
  });

  test("every listed diagram URL is one the Gallery or the lightbox could request", () => {
    const couldRequest = new Set<string>();
    for (const { key, variants } of AVAILABLE) {
      const args = { showId: SHOW, rev: REV, key, variants };
      couldRequest.add(makeDiagramLoader({ ...args, pinOriginal: true })({ src: key, width: 1 }));
      const loader = makeDiagramLoader(args);
      for (const width of NEXT_WIDTHS) couldRequest.add(loader({ src: key, width }));
    }

    const diagramUrls = savedCopyAssetUrls(SHOW, showData()).filter((url) =>
      url.startsWith("/api/asset/diagram/"),
    );
    premise("the fixture lists diagram URLs", diagramUrls.length, 0);
    expect(diagramUrls.filter((url) => !couldRequest.has(url))).toEqual([]);
  });

  test("lists the original of every available item, which the lightbox pins on zoom", () => {
    const listed = savedCopyAssetUrls(SHOW, showData());

    for (const { key } of AVAILABLE) expect(listed).toContain(`${DIAGRAM_PREFIX}${key}`);
  });

  test("lists each variant tier of a laddered item", () => {
    const listed = savedCopyAssetUrls(SHOW, showData());

    for (const { key } of ladder("embedded-obj-1.png")) {
      expect(listed).toContain(`${DIAGRAM_PREFIX}${key}`);
    }
  });

  test("lists nothing for an unavailable item", () => {
    const listed = savedCopyAssetUrls(SHOW, showData());

    expect(listed.filter((url) => url.includes("obj-svg") || url.includes("obj-missing"))).toEqual(
      [],
    );
  });

  test("lists items past the gallery's first page, which only Show all renders", () => {
    const many = Array.from({ length: INITIAL_VISIBLE + 2 }, (_v, i) => embedded(`many-${i + 1}`));
    const listed = savedCopyAssetUrls(
      SHOW,
      showData({ diagrams: { ...DIAGRAMS, embeddedImages: many, linkedFolderItems: [] } }),
    );

    for (let i = 1; i <= INITIAL_VISIBLE + 2; i += 1) {
      expect(listed).toContain(`${DIAGRAM_PREFIX}embedded-many-${i}.png`);
    }
  });

  test("lists each URL once", () => {
    const listed = savedCopyAssetUrls(SHOW, showData());

    expect(new Set(listed).size).toBe(listed.length);
  });

  test("a show with no diagrams lists only its agendas", () => {
    const listed = savedCopyAssetUrls(SHOW, showData({ diagrams: null }));

    premise("the fixture still has agendas", listed.length, 0);
    expect(listed.every((url) => url.startsWith(AGENDA_PREFIX))).toBe(true);
  });
});

describe("savedCopyAssetUrls: agendas", () => {
  test("lists every agenda URL AgendaEmbed opens, and no other", () => {
    render(createElement(AgendaEmbed, { showId: SHOW, agendaLinks: AGENDA_LINKS }));
    const buttons = screen.getAllByRole("button", { name: /view agenda/i });
    premise("AgendaEmbed rendered more than one agenda", buttons.length, 1);

    const opened = new Set<string>();
    for (const button of buttons) {
      fireEvent.click(button);
      const src = screen.getByTestId("agenda-sheet").getAttribute("data-pdf-src");
      premiseHolds("the open sheet names its pdf", src !== null);
      opened.add(src ?? "");
    }

    const listed = savedCopyAssetUrls(SHOW, showData()).filter((url) =>
      url.startsWith("/api/asset/agenda/"),
    );
    expect(new Set(listed)).toEqual(opened);
  });

  test("an agenda entry without a fileId is not listed", () => {
    const listed = savedCopyAssetUrls(SHOW, showData({ diagrams: null }));

    expect(listed).toEqual([
      `${AGENDA_PREFIX}1AgendaFileA_abc-123`,
      `${AGENDA_PREFIX}1AgendaFileB_def-456`,
    ]);
    expect(listed.some((url) => url.includes("example.test"))).toBe(false);
  });
});
