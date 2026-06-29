/**
 * lib/drive/agendaDrive.ts (agenda Phase B, Task 8 + Task 5 bounds)
 *
 * Real `DriveClient.downloadFileBytes` + `DriveClient.getAgendaChips`
 * implementations (spec §4.5.3). Built on the verified Drive/Sheets service
 * account (`lib/drive/client.ts` `getDriveAuth`). Wired into the production
 * `defaultDriveClient()` in `lib/sync/runScheduledCronSync.ts`.
 *
 * Invariant 9 (call-boundary discipline): every outcome is a discriminated union
 * so an infrastructure fault can NEVER collapse into "no data". `downloadFileBytes`
 * distinguishes `unavailable` (trashed/non-PDF/404/permission/byte-cap exceeded)
 * from `infra_error` (transient/5xx/network/stall/deadline); `getAgendaChips`
 * distinguishes `rows` from `infra_error`.
 *
 * Task 5 additions:
 *  - `downloadFileBytes` now switches to `responseType:'stream'` and wires:
 *    (a) `readBoundedNodeStream` byte cap (`AGENDA_PDF_MAX_BYTES`) → `unavailable`
 *    (b) idle stall guard (`createStallGuard`) — reset per chunk, fires on 30s idle
 *    (c) total-time deadline controller (NOT reset per chunk) → `infra_error`
 *    Signals are composed via `AbortSignal.any`.
 *  - `getAgendaChips` is now bounded: composed signal + per-request `timeout`, one
 *    transient retry; hang/abort/non-transient → `infra_error`.
 *  - Both functions accept optional `opts?: { signal?, deadlineMs? }` (backward-
 *    compatible — existing callers that omit `opts` compile and behave unchanged).
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
import { ByteLimitExceededError, readBoundedNodeStream } from "@/lib/sync/boundedBytes";
import { createStallGuard, DRIVE_ASSET_STALL_TIMEOUT_MS } from "@/lib/drive/stallGuard";
import { AGENDA_PDF_MAX_BYTES, AGENDA_PDF_DEADLINE_MS } from "@/lib/agenda/constants";
import { DRIVE_FILES_GET_TIMEOUT_MS } from "@/lib/drive/fetch";

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

/** Returns true for errors that are worth retrying (5xx, network). */
function isTransientDriveError(error: unknown): boolean {
  // Abort/deadline signals are not retryable.
  if (error instanceof Error) {
    const n = error.name;
    if (n === "AbortError" || n === "TimeoutError") return false;
  }
  const status = driveErrorStatus(error);
  if (status !== null) return status >= 500;
  // No status → network/connection error → transient.
  return true;
}

const DRIVE_CHIP_URI_RE = /\/d\/([\w-]+)/;

/**
 * Drive `files.get({ alt: 'media', supportsAllDrives: true })` streaming byte
 * download for an agenda PDF.
 *
 * Guards (Task 5):
 *   - Byte cap: `AGENDA_PDF_MAX_BYTES` via `readBoundedNodeStream`; exceeded → `unavailable`
 *   - Idle stall: `createStallGuard(DRIVE_ASSET_STALL_TIMEOUT_MS)`; reset per chunk
 *   - Total-time deadline: separate `AbortController` armed with
 *     `opts.deadlineMs ?? AGENDA_PDF_DEADLINE_MS` (NOT reset per chunk)
 *   - All three signals (+ optional caller signal) composed via `AbortSignal.any`
 *
 * 404/403 → `unavailable`; stall/deadline/other → `infra_error`.
 */
export async function downloadFileBytes(
  fileId: string,
  opts?: { signal?: AbortSignal; deadlineMs?: number },
): Promise<DownloadFileBytesResult> {
  const drive = google.drive({ version: "v3", auth: getDriveAuth() });

  // (a) idle stall guard — reset on every chunk
  const stallGuard = createStallGuard(DRIVE_ASSET_STALL_TIMEOUT_MS);

  // (b) total-time deadline — NOT reset on chunk
  const deadlineController = new AbortController();
  const deadlineMs = opts?.deadlineMs ?? AGENDA_PDF_DEADLINE_MS;
  const deadlineTimer = setTimeout(() => deadlineController.abort(), deadlineMs) as ReturnType<
    typeof setTimeout
  > & { unref?: () => void };
  deadlineTimer.unref?.();

  // (c) compose: stall + deadline + optional caller signal
  const composedSignal = AbortSignal.any(
    [stallGuard.signal, deadlineController.signal, opts?.signal].filter(
      (s): s is AbortSignal => s != null,
    ),
  );

  try {
    const { data } = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "stream", signal: composedSignal },
    );

    // Drive returns a Node Readable for responseType:'stream'. Destroy it on abort
    // so the `for await` in readBoundedNodeStream actually terminates (aborting the
    // gaxios request alone does not reliably interrupt an already-returned stream).
    const nodeStream = data as NodeJS.ReadableStream & { destroy?: (err?: Error) => void };
    const onAbort = () => nodeStream.destroy?.(new Error("agenda pdf download aborted"));
    composedSignal.addEventListener("abort", onAbort);
    // Cover the race: if the signal was already aborted in the gap between the
    // `drive.files.get` resolve and registering the listener, fire immediately.
    if (composedSignal.aborted) onAbort();

    try {
      const result = await readBoundedNodeStream(nodeStream, AGENDA_PDF_MAX_BYTES, {
        onChunk: () => stallGuard.reset(),
      });
      return { kind: "bytes", bytes: result.bytes };
    } catch (error) {
      if (error instanceof ByteLimitExceededError) return { kind: "unavailable" };
      throw error; // re-throw abort/network/stream errors → caught below
    } finally {
      composedSignal.removeEventListener("abort", onAbort);
    }
  } catch (error) {
    const status = driveErrorStatus(error);
    if (status === 404 || status === 403) return { kind: "unavailable" };
    return { kind: "infra_error" };
  } finally {
    stallGuard.clear();
    clearTimeout(deadlineTimer);
  }
}

/**
 * Sheets `spreadsheets.get` INFO-tab grid read. Returns every agenda-link row in
 * grid row order (the contract §4.5.1 ordinal correlation depends on). For each
 * row, scans for the label/value cell PAIR that satisfies the shared
 * `isAgendaLinkRow` predicate (content-based, not a fixed column — mirrors
 * `showDayTimeAnchors`), and reads the value cell's smart-chip uri (or null for a
 * plain-URL/text value).
 *
 * Task 5 bounds: composed signal + per-request `timeout`; one transient (5xx/
 * network) retry; abort/timeout/non-transient → `{ kind: "infra_error" }`.
 * Pre-aborted `opts.signal` fast-paths to `infra_error` without calling Sheets.
 */
export async function getAgendaChips(
  spreadsheetId: string,
  opts?: { signal?: AbortSignal; deadlineMs?: number },
): Promise<AgendaChipsResult> {
  // Fast-path: caller already cancelled.
  if (opts?.signal?.aborted) return { kind: "infra_error" };

  const sheets = google.sheets({ version: "v4", auth: getDriveAuth() });

  const timeoutMs = opts?.deadlineMs ?? DRIVE_FILES_GET_TIMEOUT_MS;

  // Total-time deadline controller (separate from the per-request gaxios timeout).
  const deadlineController = new AbortController();
  const deadlineTimer = setTimeout(() => deadlineController.abort(), timeoutMs) as ReturnType<
    typeof setTimeout
  > & { unref?: () => void };
  deadlineTimer.unref?.();

  const composedSignal = AbortSignal.any(
    [deadlineController.signal, opts?.signal].filter((s): s is AbortSignal => s != null),
  );

  const params = {
    spreadsheetId,
    ranges: ["INFO"],
    includeGridData: true,
    fields: "sheets(data(rowData(values(formattedValue,chipRuns(chip(richLinkProperties(uri)))))))",
  };

  // Wrap the gaxios call in a Promise.race against the composed signal so that
  // a hung request is interrupted even when the mock/real gaxios is not signal-aware.
  // The race promise is typed as `unknown` to sidestep googleapis overload-resolution
  // returning `void` for the last overload; `response.data.sheets` is accessed via
  // the same `as unknown[]` pattern used elsewhere in this repo (e.g. sheetGids.ts).
  function callSheets(): Promise<unknown> {
    return Promise.race([
      sheets.spreadsheets.get(params, {
        signal: composedSignal,
        timeout: timeoutMs,
      }) as unknown as Promise<unknown>,
      new Promise<never>((_, reject) => {
        if (composedSignal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        composedSignal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
    ]);
  }

  let attempt = 0;
  try {
    while (attempt < 2) {
      attempt++;
      try {
        const response = await callSheets();
        const sheetsData = (response as { data?: { sheets?: unknown[] } })?.data;

        type CellValue = {
          formattedValue?: string | null;
          chipRuns?: { chip?: { richLinkProperties?: { uri?: string } } }[];
        };
        type RowData = { values?: CellValue[] };
        type SheetData = { rowData?: RowData[] };
        type SheetEntry = { data?: SheetData[] };

        const rows: { label: string; chipFileId: string | null }[] = [];
        for (const sheet of (sheetsData?.sheets ?? []) as SheetEntry[]) {
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
                rows.push({ label: label.trim(), chipFileId }); // canonicalize-exempt: AGENDA LINK label text, not an email (invariant 3 N/A)
                break; // one agenda-link row per grid row
              }
            }
          }
        }
        return { kind: "rows", rows };
      } catch (error) {
        // Abort/timeout — no retry.
        if (composedSignal.aborted) return { kind: "infra_error" };
        // Transient 5xx / network — retry once.
        if (isTransientDriveError(error) && attempt < 2) continue;
        return { kind: "infra_error" };
      }
    }
    return { kind: "infra_error" }; // unreachable; satisfies TS
  } finally {
    clearTimeout(deadlineTimer);
  }
}
