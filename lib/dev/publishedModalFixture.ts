/**
 * lib/dev/publishedModalFixture.ts
 * (spec 2026-07-21-attention-modal-switcher-gallery §3.1)
 *
 * The base modal-data fixture for the switcher gallery, lifted from the real
 * `baseProps` helper (tests/components/admin/showpage/publishedReviewModal.test.tsx)
 * MINUS the 8 action functions (client-owned) — using the SAME real builders the
 * production loader uses (`buildPublishedSectionData`), so the gallery never
 * hand-rolls a modal shape. `buildGallerySnapshot` optionally populates the
 * rooms/event anchors so an anchored alert lands in its true section.
 */
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
// SERVER-SAFE section inclusion — NOT the `"use client"` `step3Sections`. This
// fixture builder runs inside the server route, and calling a client function
// server-side throws ("Attempted to call step3Sections() from the server").
// `renderedSectionIds` from sectionInclusion is the crypto/client-free walker
// production uses at app/admin/_showReviewModal.tsx:326.
import { renderedSectionIds as includedSectionIds } from "@/components/admin/review/sectionInclusion";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import type { ParseWarning } from "@/lib/parser/types";
import type { PublishedSectionData } from "@/components/admin/review/sectionData";
import { GALLERY_NOW, GALLERY_SLUG, type GalleryModalData } from "@/lib/dev/galleryModalTypes";

const GALLERY_SHOW_ID = "99999999-9999-4999-8999-999999999999";
const GALLERY_DRIVE_FILE_ID = "DRIVE_GALLERY";
const GALLERY_TITLE = "Gallery Preview Show";
const GALLERY_SHEET_HREF = `https://docs.google.com/spreadsheets/d/${GALLERY_DRIVE_FILE_ID}/edit`;

export type AnchorFlags = { diagrams?: boolean; openingReel?: boolean };

/**
 * A `PersistedDiagrams` value that passes `hasDiagramSignal`
 * (`diagrams != null && (linkedFolder != null || images/items > 0)`), wrapped in
 * the post-M7 `{ current }` envelope `resolveCurrentDiagrams` expects.
 */
function diagramsWithSignal() {
  return {
    current: {
      snapshot_revision_id: "gallery-diagrams-rev",
      snapshot_status: "complete" as const,
      linkedFolder: {
        driveFolderId: "gallery-folder",
        driveFolderUrl: "https://drive.google.com/drive/folders/gallery",
      },
      embeddedImages: [],
      linkedFolderItems: [],
    },
  };
}

/**
 * The gallery's storable show snapshot. Base has no anchors (`diagrams: null`,
 * `event_details: null`); `opts.anchors` populates them so `anchorsForData`
 * yields the corresponding anchor and an anchored alert lands in rooms/event.
 */
export function buildGallerySnapshot(
  warnings: ParseWarning[] = [],
  opts: { anchors?: AnchorFlags } = {},
): ShowReviewSnapshot {
  const anchors = opts.anchors ?? {};
  return {
    show: {
      id: GALLERY_SHOW_ID,
      title: GALLERY_TITLE,
      client_label: "Gallery Client",
      client_contact: null,
      dates: {
        travelIn: "2026-05-01",
        set: null,
        showDays: ["2026-05-02"],
        travelOut: "2026-05-03",
      },
      venue: { name: "Gallery Hall", address: "1 Preview St" },
      event_details: anchors.openingReel ? { opening_reel: "Gallery opening reel content" } : null,
      agenda_links: [],
      coi_status: "received",
      diagrams: anchors.diagrams ? diagramsWithSignal() : null,
      pull_sheet: [],
      source_anchors: {},
      drive_file_id: GALLERY_DRIVE_FILE_ID,
      archived: false,
      published: true,
    },
    internal: {
      financials: null,
      parse_warnings: warnings,
      raw_unrecognized: null,
      run_of_show: {},
      use_raw_decisions: [],
      show_id: GALLERY_SHOW_ID,
    },
    crew_members: [
      { id: "cccccccc-0000-4000-8000-000000000001", name: "Gallery Crew", role: "PM" },
    ],
    rooms: [],
    hotel_reservations: [],
    transportation: [],
    contacts: [],
  };
}

/** Rendered section ids for the warning model — the server-safe section walker. */
function renderedSectionIds(data: PublishedSectionData) {
  return new Set(includedSectionIds(data));
}

/**
 * The base data half of `PublishedReviewModalProps` (no action functions).
 * `over` overrides top-level keys last (a caller varies `data`/`bySection`/
 * `attentionItems`/`alertsDegraded`). `data` is ALWAYS a complete
 * `PublishedSectionData` from the real builder — never a nested partial.
 */
export function buildGalleryModalData(over: Partial<GalleryModalData> = {}): GalleryModalData {
  const data = buildPublishedSectionData(buildGallerySnapshot([]), { slug: GALLERY_SLUG });
  const bySection = buildSectionWarningModel({
    slug: GALLERY_SLUG,
    warnings: data.warnings,
    ignoredFingerprints: new Set<string>(),
    renderedSectionIds: renderedSectionIds(data),
  });
  return {
    data,
    bySection,
    slug: GALLERY_SLUG,
    showId: GALLERY_SHOW_ID,
    title: GALLERY_TITLE,
    archived: false,
    published: true,
    finalizeOwned: false,
    isLive: false,
    lastSyncedAt: "2026-07-01T17:48:00.000Z",
    lastCheckedAt: "2026-07-01T17:58:00.000Z",
    lastSyncStatus: "ok",
    now: GALLERY_NOW,
    attentionItems: [],
    alertsDegraded: false,
    openSheetHref: GALLERY_SHEET_HREF,
    crewEmails: [],
    pickerCrew: [],
    feed: { entries: [], truncated: false },
    alertId: null,
    ...over,
  };
}
