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
  ParseWarning,
} from "@/lib/parser/types";
import { sha256Base64Url } from "@/lib/crypto/sha256";

export const MAX_TOTAL_DIAGRAM_ITEMS = 60;

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

export type SpreadsheetEmbeddedObject = {
  objectId: string;
  mimeType: string;
  alt?: string;
  contentUrl?: string | null;
};

export type SpreadsheetSheet = {
  title: string;
  sheetId?: number;
  embeddedObjects?: SpreadsheetEmbeddedObject[];
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
  getEmbeddedImageBytes?: (
    spreadsheetId: string,
    objectId: string,
    contentUrl?: string,
  ) => Promise<Uint8Array | null>;
  /**
   * Sheets API `spreadsheets.get` projection used to resolve the DIAGRAMS tab
   * and its floating embedded objects. Optional so older tests/mocks can omit
   * it and get the honest "no embedded images" state.
   */
  listSpreadsheetSheets?: (spreadsheetId: string) => Promise<SpreadsheetSheet[]>;
  /**
   * Drive revision lookup for the spreadsheet itself. Called only after at
   * least one embedded image-like object is resolved.
   */
  getSpreadsheetRevisionId?: (spreadsheetId: string) => Promise<string | null>;
}

export type EnrichContext = {
  /** The Drive file ID of the show sheet itself. */
  driveFileId: string;
  /** Pre-fetched metadata for the show sheet (typically the cron loop already
   *  fetched this before calling parseSheet, so we pass it through). */
  fileMeta: DriveFileMeta;
  /**
   * Pre-fetched sheet list (Task 5: exactly-once ownership). When present,
   * `extractEmbeddedImages` uses this list instead of calling
   * `driveClient.listSpreadsheetSheets` again, keeping the Sheets API call
   * count at one per sync pass.
   */
  sheets?: SpreadsheetSheet[];
};

function warning(code: string, message: string): ParseWarning {
  return { severity: "warn", code, message };
}

function isImageLike(object: SpreadsheetEmbeddedObject): boolean {
  return object.mimeType.startsWith("image/");
}

function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

async function extractEmbeddedImages(
  parsed: ParsedSheet,
  driveClient: DriveClient,
  ctx: EnrichContext,
  warnings: ParseWarning[],
): Promise<EmbeddedImageStub[]> {
  if (!ctx.sheets && !driveClient.listSpreadsheetSheets) return [];

  const sheets =
    ctx.sheets ??
    (await driveClient.listSpreadsheetSheets!(ctx.driveFileId));
  const diagramsSheet = sheets.find(
    (sheet) => sheet.title.localeCompare("diagrams", undefined, { sensitivity: "accent" }) === 0,
  );
  if (!diagramsSheet) {
    warnings.push(warning("DIAGRAMS_TAB_MISSING", "No DIAGRAMS tab was found in the spreadsheet."));
    return [];
  }

  const imageObjects = (diagramsSheet.embeddedObjects ?? []).filter(isImageLike);
  if (imageObjects.length === 0) {
    if (!parsed.diagrams.linkedFolder) {
      warnings.push(
        warning(
          "DIAGRAMS_EMBEDDED_NONE_FOUND",
          "DIAGRAMS tab was found, but no embedded images or linked folder were found.",
        ),
      );
    }
    return [];
  }

  const keptObjects = imageObjects.slice(0, MAX_TOTAL_DIAGRAM_ITEMS);
  const droppedCount = imageObjects.length - keptObjects.length;
  if (droppedCount > 0) {
    warnings.push(
      warning(
        "DIAGRAMS_EMBEDDED_CAP_EXCEEDED",
        `DIAGRAMS tab has ${imageObjects.length} embedded images; dropped ${droppedCount} over the ${MAX_TOTAL_DIAGRAM_ITEMS} item cap.`,
      ),
    );
  }

  const sheetsRevisionId = await driveClient.getSpreadsheetRevisionId?.(ctx.driveFileId);
  if (!sheetsRevisionId) {
    warnings.push(
      warning(
        "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
        "Embedded diagrams were found, but the spreadsheet revision token was unavailable.",
      ),
    );
    return [];
  }

  const embeddedImages: EmbeddedImageStub[] = [];
  for (const object of keptObjects) {
    let bytes: Uint8Array | null = null;
    if (object.contentUrl && driveClient.getEmbeddedImageBytes) {
      bytes = await driveClient.getEmbeddedImageBytes(
        ctx.driveFileId,
        object.objectId,
        object.contentUrl,
      );
    }

    if (!bytes) {
      warnings.push(
        warning(
          "DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE",
          `Embedded diagram ${object.objectId} could not be downloaded.`,
        ),
      );
    }

    embeddedImages.push({
      sheetTab: diagramsSheet.title,
      objectId: object.objectId,
      mimeType: object.mimeType,
      ...(object.alt ? { alt: object.alt } : {}),
      contentUrl: object.contentUrl ?? null,
      sheetsRevisionId,
      embeddedFingerprint: bytes ? sha256Base64Url(bytes) : null,
      recovery_disposition: bytes ? "normal" : "restage_required",
      snapshotPath: null,
    });
  }

  return embeddedImages;
}

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
  const warnings = [...parsed.warnings];

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

  const embeddedImages = await extractEmbeddedImages(parsed, driveClient, ctx, warnings);

  let linkedFolderItems: LinkedFolderItemStub[] = [];
  if (parsed.diagrams.linkedFolder) {
    const listing = await driveClient.listFolder(parsed.diagrams.linkedFolder.driveFolderId);
    const residualBudget = Math.max(0, MAX_TOTAL_DIAGRAM_ITEMS - embeddedImages.length);
    const imageFiles = listing.files
      .filter((file) => isImageMimeType(file.mimeType))
      .toSorted((a, b) => (a.name ?? a.driveFileId).localeCompare(b.name ?? b.driveFileId));
    const keptFiles = imageFiles.slice(0, residualBudget);
    const droppedCount = imageFiles.length - keptFiles.length;
    if (droppedCount > 0) {
      warnings.push(
        warning(
          "LINKED_FOLDER_OVERFLOW_TRUNCATED",
          `Linked DIAGRAMS folder has ${imageFiles.length} images; dropped ${droppedCount} over the ${MAX_TOTAL_DIAGRAM_ITEMS} item combined cap.`,
        ),
      );
    }

    linkedFolderItems = keptFiles.map((f) => ({
      driveFileId: f.driveFileId,
      mimeType: f.mimeType,
      ...(f.name ? { alt: f.name } : {}),
      drive_modified_time: f.modifiedTime,
      headRevisionId: f.headRevisionId,
      md5Checksum: f.md5Checksum,
      snapshotPath: null,
    }));
  }

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
    warnings,
    hardErrors: parsed.hardErrors,
    ...(parsed.runOfShow !== undefined ? { runOfShow: parsed.runOfShow } : {}),
  };
}
