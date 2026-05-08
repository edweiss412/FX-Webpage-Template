/**
 * lib/sync/enrichWithDrivePins.ts (M3 minimal scaffold)
 *
 * Sync-layer Phase-1 enrichment step. Takes a pure ParsedSheet from
 * lib/parser, calls a DriveClient to pin reel + linked-folder items + extract
 * embedded images, and emits the sync-ready ParseResult.
 *
 * The DriveClient interface is intentionally minimal in M3. M6 (Tasks 7.1-7.4)
 * swaps in a real `googleapis` Drive client behind the same interface. M7
 * extends with embedded-image byte capture via the Sheets API.
 *
 * Pipeline contract (per plan 03-04-tiles.md:23):
 *   parseSheet → enrichWithDrivePins(parsed, mockDriveClient) → runInvariants → phase1
 *
 * The dev panel calls this with `mockDriveClient`; production sync calls
 * the real client. Skipping this step in the dev panel was the bug that the
 * "pipeline parity" guard rule explicitly forbids.
 */
import type {
  ParsedSheet,
  ParseResult,
  OpeningReelPinned,
  LinkedFolderItemStub,
  EmbeddedImageStub,
} from "@/lib/parser/types";

/**
 * Drive file metadata returned by DriveClient.getFile() and listFolder().
 *
 * `headRevisionId` + `md5Checksum` form the immutable TOCTOU fence for Apply
 * (per types.ts:241-256). M3's mock returns deterministic values; M6/M7 wrap
 * `googleapis` calls.
 */
export type DriveFileMeta = {
  driveFileId: string;
  headRevisionId: string;
  md5Checksum: string;
  mimeType: string;
  modifiedTime: string; // ISO 8601
  name?: string;
};

export type DriveFolderListing = {
  folderId: string;
  files: DriveFileMeta[];
};

export interface DriveClient {
  /** Drive `files.get` — returns metadata for a single file by ID. */
  getFile(fileId: string): Promise<DriveFileMeta>;
  /** Drive `files.list` filtered to a folder. */
  listFolder(folderId: string): Promise<DriveFolderListing>;
  /**
   * Sheets API + Drive `image.contentUrl` byte fetch. Returns null when bytes
   * are unavailable (forces restage-only recovery per types.ts:215-217).
   * M3 mock returns null; M7 implements real byte capture.
   */
  getEmbeddedImageBytes?: (spreadsheetId: string, objectId: string) => Promise<Uint8Array | null>;
}

export type EnrichContext = {
  /** The Drive file ID of the show sheet itself. */
  driveFileId: string;
  /** Pre-fetched metadata for the show sheet (typically the cron loop already
   *  fetched this before calling parseSheet, so we pass it through). */
  fileMeta: DriveFileMeta;
};

/**
 * Phase-1 enrichment.
 *
 * Pass-through cases:
 *  - `parsed.openingReel === null` → output's `openingReel: null` (no enrichment needed)
 *  - `parsed.diagrams.linkedFolder === null` → empty `linkedFolderItems`
 *  - Embedded-image byte capture is M7's job; M3 ships `embeddedImages: []`.
 *
 * MIME-type gate (per types.ts:275): the reel is enriched only when its Drive
 * file mimeType starts with 'video/'. Non-video → `openingReel: null`.
 */
export async function enrichWithDrivePins(
  parsed: ParsedSheet,
  driveClient: DriveClient,
  ctx: EnrichContext,
): Promise<ParseResult> {
  let openingReel: OpeningReelPinned | null = null;
  if (parsed.openingReel) {
    const reelMeta = await driveClient.getFile(parsed.openingReel.driveFileId);
    if (reelMeta.mimeType.startsWith("video/")) {
      openingReel = {
        driveFileId: reelMeta.driveFileId,
        drive_modified_time: reelMeta.modifiedTime,
        headRevisionId: reelMeta.headRevisionId,
        mimeType: reelMeta.mimeType,
      };
    }
  }

  let linkedFolderItems: LinkedFolderItemStub[] = [];
  if (parsed.diagrams.linkedFolder) {
    const listing = await driveClient.listFolder(parsed.diagrams.linkedFolder.driveFolderId);
    linkedFolderItems = listing.files.map((f) => ({
      driveFileId: f.driveFileId,
      mimeType: f.mimeType,
      drive_modified_time: f.modifiedTime,
      headRevisionId: f.headRevisionId,
      md5Checksum: f.md5Checksum,
      snapshotPath: null,
    }));
  }

  // M3 ships embeddedImages: []. M7 (Task 7.1) populates this via Sheets API
  // + drive.images.contentUrl byte capture. Anti-pattern guard: do NOT
  // synthesize embedded images here; an empty list is the honest M3 state.
  const embeddedImages: EmbeddedImageStub[] = [];

  // Acknowledge ctx so it's wired through the pipeline; M6/M7 will use
  // ctx.driveFileId/ctx.fileMeta to populate fields the parser cannot know
  // (e.g. the show's own headRevisionId for the parse_result audit).
  void ctx;

  return {
    show: parsed.show,
    crewMembers: parsed.crewMembers,
    hotelReservations: parsed.hotelReservations,
    rooms: parsed.rooms,
    transportation: parsed.transportation,
    contacts: parsed.contacts,
    pullSheet: parsed.pullSheet,
    diagrams: {
      linkedFolder: parsed.diagrams.linkedFolder,
      embeddedImages,
      linkedFolderItems,
    },
    openingReel,
    raw_unrecognized: parsed.raw_unrecognized,
    warnings: parsed.warnings,
    hardErrors: parsed.hardErrors,
  };
}
