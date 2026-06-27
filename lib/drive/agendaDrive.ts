/**
 * lib/drive/agendaDrive.ts (agenda Phase B, Task 8)
 *
 * Real `DriveClient.downloadFileBytes` + `DriveClient.getAgendaChips`
 * implementations (spec §4.5.3). Built on the verified Drive/Sheets service
 * account (`lib/drive/client.ts` `getDriveAuth`). Wired into the production
 * `defaultDriveClient()` in `lib/sync/runScheduledCronSync.ts`.
 *
 * Invariant 9 (call-boundary discipline): every outcome is a discriminated union
 * so an infrastructure fault can NEVER collapse into "no data". `downloadFileBytes`
 * distinguishes `unavailable` (trashed/non-PDF/404/permission) from `infra_error`
 * (transient/5xx/network); `getAgendaChips` distinguishes `rows` from `infra_error`.
 *
 * The mime/revision gate is owned by `enrichAgenda` (via `getFile`) — this byte
 * downloader is deliberately bytes-only and does NOT re-check mime/trashed (Codex
 * plan-R3: do not duplicate the gate).
 */
// Invariant 9: these are googleapis Drive/Sheets call sites (NOT Supabase), so they
// belong to the SYNC-domain infra-contract registry, not the auth one — both
// helpers are registered in tests/sync/_metaInfraContract.test.ts and covered
// behaviorally by tests/drive/agendaDrive.test.ts. The discipline lives structurally
// in their discriminated-union return types (bytes/unavailable/infra_error;
// rows/infra_error) so an infra fault can never collapse into "no data".
import { google } from "googleapis";
import { getDriveAuth } from "@/lib/drive/client";
import { isAgendaLinkRow } from "@/lib/parser/agendaLinkRow";

export type DownloadFileBytesResult =
  | { kind: "bytes"; bytes: Uint8Array }
  | { kind: "unavailable" }
  | { kind: "infra_error" };

export type AgendaChipsResult =
  | { kind: "rows"; rows: { label: string; chipFileId: string | null }[] }
  | { kind: "infra_error" };

/** Map a googleapis/gaxios error to its numeric HTTP status (or null). */
function driveErrorStatus(error: unknown): number | null {
  const candidate =
    (error as { response?: { status?: unknown } })?.response?.status ??
    (error as { status?: unknown })?.status ??
    (error as { code?: unknown })?.code;
  return typeof candidate === "number" ? candidate : null;
}

const DRIVE_CHIP_URI_RE = /\/d\/([\w-]+)/;

/**
 * Drive `files.get({ alt: 'media', supportsAllDrives: true })`. Bytes-only.
 * 404/403 (trashed / permission / not-found) → `unavailable`; everything else
 * (5xx, network, timeout) → `infra_error` (retried next sync, never cached).
 */
export async function downloadFileBytes(fileId: string): Promise<DownloadFileBytesResult> {
  const drive = google.drive({ version: "v3", auth: getDriveAuth() });
  try {
    const response = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" },
    );
    return { kind: "bytes", bytes: new Uint8Array(response.data as ArrayBuffer) };
  } catch (error) {
    const status = driveErrorStatus(error);
    if (status === 404 || status === 403) return { kind: "unavailable" };
    return { kind: "infra_error" };
  }
}

/**
 * Sheets `spreadsheets.get` INFO-tab grid read. Returns every agenda-link row in
 * grid row order (the contract §4.5.1 ordinal correlation depends on). For each
 * row, scans for the label/value cell PAIR that satisfies the shared
 * `isAgendaLinkRow` predicate (content-based, not a fixed column — mirrors
 * `showDayTimeAnchors`), and reads the value cell's smart-chip uri (or null for a
 * plain-URL/text value). A thrown Sheets-API fault → `infra_error`.
 */
export async function getAgendaChips(spreadsheetId: string): Promise<AgendaChipsResult> {
  const sheets = google.sheets({ version: "v4", auth: getDriveAuth() });
  try {
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: ["INFO"],
      includeGridData: true,
      fields:
        "sheets(data(rowData(values(formattedValue,chipRuns(chip(richLinkProperties(uri)))))))",
    });

    const rows: { label: string; chipFileId: string | null }[] = [];
    for (const sheet of response.data.sheets ?? []) {
      for (const data of sheet.data ?? []) {
        for (const rowData of data.rowData ?? []) {
          const values = rowData.values ?? [];
          for (let i = 0; i < values.length; i++) {
            const label = values[i]?.formattedValue ?? "";
            const valueCell = values[i + 1];
            const value = valueCell?.formattedValue ?? "";
            if (!isAgendaLinkRow(label, value)) continue;

            let chipFileId: string | null = null;
            for (const run of valueCell?.chipRuns ?? []) {
              const uri = run.chip?.richLinkProperties?.uri ?? undefined;
              const match = uri?.match(DRIVE_CHIP_URI_RE);
              if (match?.[1]) {
                chipFileId = match[1];
                break;
              }
            }
            rows.push({ label: label.trim(), chipFileId });
            break; // one agenda-link row per grid row
          }
        }
      }
    }
    return { kind: "rows", rows };
  } catch {
    return { kind: "infra_error" };
  }
}
