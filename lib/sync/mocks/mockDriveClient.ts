/**
 * lib/sync/mocks/mockDriveClient.ts (M3)
 *
 * Fixture-driven Drive client stub used by the /admin/dev panel and by the
 * Vitest sync-routing tests. Returns deterministic, well-typed metadata so
 * the pipeline-parity assertions are reproducible.
 *
 * The corpus fixtures (fixtures/shows/raw/*.md) are sanitized — they do NOT
 * contain real Drive file IDs. When the parser doesn't find a URL, the
 * pipeline routes `openingReel: null` / `linkedFolder: null` and the mock
 * is never asked to resolve those IDs. For tests that need to exercise the
 * "enrichment populated something" path, we expose a marker through
 * `mockMarker` and a default-by-prefix metadata generator.
 */
import type {
  DriveClient,
  DriveFileMeta,
  DriveFolderListing,
} from "@/lib/sync/enrichWithDrivePins";

/** Marker string the page surfaces in its enrichment summary so the
 *  pipeline-parity test can assert the mock actually ran (anti-tautology
 *  per AGENTS.md "anti-tautology rule for tests"). */
export const MOCK_MARKER = "mock-drive-client-v1";

// ── Agenda Drive method fixtures (spec §4.5.3) ────────────────────────────────
// Sentinel IDs that steer the mock's two agenda methods down their non-default
// (infra_error / unavailable) branches so enrichAgenda's unit tests and the dev
// preview path can exercise every union member deterministically.
export const MOCK_AGENDA_SPREADSHEET_INFRA = "mock-agenda-sheet-infra";
export const MOCK_AGENDA_FILE_UNAVAILABLE = "mock-agenda-file-unavailable";
export const MOCK_AGENDA_FILE_INFRA = "mock-agenda-file-infra";

type AgendaChipsResult = Awaited<ReturnType<NonNullable<DriveClient["getAgendaChips"]>>>;
type DownloadFileBytesResult = Awaited<ReturnType<NonNullable<DriveClient["downloadFileBytes"]>>>;

/** Per-spreadsheet chip-recovery fixtures; any unlisted id gets the default. */
const AGENDA_CHIP_FIXTURES: Record<string, AgendaChipsResult> = {
  [MOCK_AGENDA_SPREADSHEET_INFRA]: { kind: "infra_error" },
};
const DEFAULT_AGENDA_CHIPS: AgendaChipsResult = {
  kind: "rows",
  rows: [{ label: "AGENDA LINK - RFI", chipFileId: "mock-agenda-rfi-file" }],
};

/** Per-fileId byte-download fixtures; any unlisted id gets the default bytes. */
const DOWNLOAD_FIXTURES: Record<string, DownloadFileBytesResult> = {
  [MOCK_AGENDA_FILE_UNAVAILABLE]: { kind: "unavailable" },
  [MOCK_AGENDA_FILE_INFRA]: { kind: "infra_error" },
};
/** A tiny deterministic "%PDF" stub — extractAgendaSchedule degrades it to a
 *  low-confidence empty extraction, which is the honest dev-preview outcome. */
const DEFAULT_AGENDA_PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

/**
 * Generate deterministic metadata for any Drive file ID. Used as a fallback
 * when a fixture references a Drive ID that the mock doesn't have a hand-coded
 * entry for. Keeps the mock from throwing during fixture upload tests.
 */
function syntheticMeta(driveFileId: string, mimeType: string = "video/mp4"): DriveFileMeta {
  // Stable hex prefix derived from the file ID so the headRevisionId is
  // deterministic but distinguishable across files.
  const stableSuffix = driveFileId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16) || "default";
  return {
    driveFileId,
    headRevisionId: `mock-rev-${stableSuffix}`,
    md5Checksum: `mock-md5-${stableSuffix}`.padEnd(32, "0").slice(0, 32),
    mimeType,
    modifiedTime: "2026-05-02T00:00:00.000Z",
    name: `mock-${stableSuffix}`,
  };
}

/** Hand-coded folder listings keyed by folder ID so specific dev-panel
 *  fixtures get well-known content. */
const FOLDER_FIXTURES: Record<string, DriveFolderListing> = {
  // Empty default — a folder with no children is a valid Phase-1 outcome.
  "mock-empty-folder": { folderId: "mock-empty-folder", files: [] },
};

export const mockDriveClient: DriveClient = {
  async getFile(fileId: string): Promise<DriveFileMeta> {
    return syntheticMeta(fileId);
  },
  async listFolder(folderId: string): Promise<DriveFolderListing> {
    const fixture = FOLDER_FIXTURES[folderId];
    if (fixture) return fixture;
    // Default: a folder with one synthetic image so the dev panel's
    // "linkedFolderItems" rendering shows non-zero output.
    return {
      folderId,
      files: [syntheticMeta(`${folderId}-item-1`, "image/png")],
    };
  },
  async getEmbeddedImageBytes(): Promise<Uint8Array | null> {
    // M7 implements real Sheets-API byte capture; M3 returns null which
    // forces restage-only recovery per the EmbeddedImageStub contract.
    return null;
  },
  async getAgendaChips(spreadsheetId: string): Promise<AgendaChipsResult> {
    return AGENDA_CHIP_FIXTURES[spreadsheetId] ?? DEFAULT_AGENDA_CHIPS;
  },
  async downloadFileBytes(fileId: string): Promise<DownloadFileBytesResult> {
    return DOWNLOAD_FIXTURES[fileId] ?? { kind: "bytes", bytes: DEFAULT_AGENDA_PDF_BYTES };
  },
};
