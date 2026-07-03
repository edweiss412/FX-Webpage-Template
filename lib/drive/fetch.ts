import type { drive_v3 } from "googleapis";
import { getDriveAccessToken, getDriveClient } from "@/lib/drive/client";
import { synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
import type { DriveListedFile } from "@/lib/drive/list";
import { snapshotCronInFlight, type CronInFlightSnapshot } from "@/lib/log/requestContext";

export const MARKDOWN_EXPORT_MIME_TYPE = "text/markdown";
export const XLSX_EXPORT_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const DRIVE_FILE_METADATA_FIELDS =
  "id, name, mimeType, modifiedTime, parents, trashed, headRevisionId, md5Checksum";
export const DRIVE_EXPORT_METADATA_FIELDS = `${DRIVE_FILE_METADATA_FIELDS}, exportLinks`;

export type DriveRetryOptions = {
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  random?: () => number;
};

export type DriveFetchOptions = {
  drive?: drive_v3.Drive;
  fetch?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  retry?: DriveRetryOptions;
  /**
   * Per-attempt wall-clock budget for the xlsx export round-trip (fetch + body
   * read). Defaults to {@link DRIVE_EXPORT_TIMEOUT_MS}. Tests pass a tiny value
   * to exercise the stall guard without waiting.
   */
  exportTimeoutMs?: number;
  /**
   * Per-attempt wall-clock budget for the `files.get` metadata reads (the
   * before/after binding gets + plain metadata fetches). Defaults to
   * {@link DRIVE_FILES_GET_TIMEOUT_MS}. Tests pass a tiny value to exercise the
   * stall guard without waiting.
   */
  metadataTimeoutMs?: number;
};

/**
 * Per-attempt wall-clock budget for the xlsx export round-trip (the `fetch` of
 * the export link plus reading its body).
 *
 * The Drive export endpoint renders the sheet to xlsx server-side and
 * INTERMITTENTLY stalls for heavy sheets. A reproduced onboarding-scan hang sat
 * on a single sheet whose export took 20.8s on one run and never returned on the
 * next: with `prepareOne` awaiting a `fetch()` that has no time bound, that
 * worker never settled and the whole scan wedged at "18 of 19" until the route's
 * 300s maxDuration killed it. `withDriveRetry` could not help — it only retries a
 * *thrown* 429/5xx, and a silent socket stall never throws.
 *
 * The stall guard aborts the export after this budget and surfaces the abort as a
 * transient `DriveFetchError(504)`, so `withDriveRetry` retries it with a fresh
 * budget; after the bounded retries it throws a typed error instead of hanging.
 * 45s clears the worst observed healthy-but-slow export (20.8s) with headroom;
 * worst-case bound is 45s * (1 + maxRetries) ≈ 180s + backoff, inside the 300s
 * route budget (and the prepare phase runs files concurrently, so one slow sheet
 * does not serialize the rest).
 *
 * Contract note: a guard that exhausts its retries throws — and the onboarding
 * prepare phase (`prepareOnboardingFiles`) runs files through fail-fast
 * `mapWithConcurrency`, so a PERSISTENTLY stalled sheet now fails the whole scan
 * fast (a bounded, typed error) rather than degrading that one sheet to a
 * per-file `hard_failed`. That is deliberate and consistent with the existing
 * no-per-file-isolation contract of `prepareOne` (any prepare-phase Drive read
 * error already aborts the scan); it converts an indefinite hang into a bounded
 * failure. A per-file-degradation variant of the prepare path, if ever wanted,
 * is a separate change — see DEFERRED.md DXT-1.
 */
export const DRIVE_EXPORT_TIMEOUT_MS = 45_000;

/**
 * Per-attempt wall-clock budget for a Drive `files.get` metadata read.
 *
 * `getDriveClient()` builds the gaxios client with NO timeout (gaxios default is
 * unbounded), so a silent socket stall on the before-`get`/after-`get` issued
 * around every sheet hangs `prepareOne` exactly like the export bug did — on the
 * SAME onboarding hot path (DXT-1 part C). Healthy gets are 165-255ms, so 8s is
 * ~30x headroom while still bounding a stall.
 *
 * A gaxios-7 per-call timeout fires via `AbortSignal.timeout`, throwing a
 * `GaxiosError` with `code === "TimeoutError"` (a string, not the gaxios-6/axios
 * `ECONNABORTED`/`ETIMEDOUT` shape). `driveErrorStatus` maps that — and the
 * low-level socket-timeout codes, defensively — to a transient 504 so the
 * already-wrapping `withDriveRetry` retries with a fresh budget, then throws a
 * typed error after the bounded retries (same bounded contract as the export
 * guard, not an indefinite hang). The gaxios call passes `retry: false` so
 * `withDriveRetry` is the SINGLE retry layer and the per-attempt budget is
 * exactly this many ms.
 *
 * Aggregate budget: the dominant per-sheet term is the EXPORT guard (45s *
 * (1+maxRetries) = 180s). The metadata budgets are deliberately small on top of
 * it — a single sheet's pathological all-stall-and-exhaust critical path is
 * roughly list(10s*4) + before-get(8s*4) + export(180s) + after-get(8s*4) ≈
 * 284s, which stays under the route's 300s `maxDuration`; even at the cap,
 * maxDuration termination is a BOUNDED failure (the original bug was an
 * *indefinite* hang). Realistic prepare is a few seconds — this is the
 * astronomically improbable worst case, not the expected one.
 */
export const DRIVE_FILES_GET_TIMEOUT_MS = 8_000;

export class DriveFetchError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "DriveFetchError";
    if (status !== undefined) this.status = status;
  }
}

/**
 * An empty/blank `fileId` reaching `drive.files.get` yields Google's opaque
 * `File not found: .` 404 with a minified googleapis stack. This typed subtype
 * (still an `instanceof DriveFetchError`, so existing Drive-fault handlers keep
 * classifying it) fails fast at the chokepoint with a stack pointing at the real
 * caller, so a detached/mystery empty-id call self-identifies. See
 * docs/superpowers/specs/2026-07-02-cron-empty-id-throw-attribution-design.md.
 */
export class InvalidDriveFileIdError extends DriveFetchError {
  readonly rawFileId: string;
  constructor(received: unknown) {
    const raw = (() => {
      try {
        return (JSON.stringify(received) ?? String(received)).slice(0, 80); // jsonb-text-exempt: forensic raw-value capture for the error MESSAGE, never a postgres.js jsonb param
      } catch {
        return String(received).slice(0, 80);
      }
    })();
    super(`Drive files.get called with an empty or blank fileId (received ${raw})`);
    this.name = "InvalidDriveFileIdError";
    this.rawFileId = raw;
  }
}

/** Throws InvalidDriveFileIdError unless `fileId` is a non-empty, non-whitespace string. */
export function assertNonEmptyDriveFileId(fileId: unknown): asserts fileId is string {
  // `/\S/` ("contains a non-whitespace char") rejects "" and whitespace-only WITHOUT
  // `.trim()`, which the no-inline-email-normalization structural guard forbids here.
  if (typeof fileId !== "string" || !/\S/.test(fileId)) {
    throw new InvalidDriveFileIdError(fileId);
  }
}

// BL-ONBOARDING-SCAN-TRANSIENT-THROTTLE-RETRY: a single transient Drive failure
// (rate limit / gateway / server error) otherwise aborts the whole onboarding
// folder scan — and a cron / manual sync pass. Retry those (and ONLY those) with
// bounded exponential backoff; non-transient errors (revision races, omitted
// metadata, 4xx other than 429) propagate immediately so callers still fail fast.
const TRANSIENT_DRIVE_STATUSES = new Set([429, 500, 502, 503, 504]);
// Low-level socket/network error codes that a native-fetch (undici) failure
// surfaces on the nested `.cause` of a `TypeError: fetch failed`. Treated as
// transient so a single-blip connection reset is retried, not fatal.
const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "EPIPE",
  "ECONNABORTED",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);
const DEFAULT_MAX_DRIVE_RETRIES = 3;

export function driveErrorStatus(error: unknown): number | null {
  if (error instanceof DriveFetchError) {
    return typeof error.status === "number" ? error.status : null;
  }
  // A gaxios-7 request timeout (per-call `timeout` -> AbortSignal.timeout) throws
  // a GaxiosError with `code === "TimeoutError"` (string) and NO numeric status.
  // Treat that — plus the low-level socket-timeout codes, defensively — as a
  // transient 504 so withDriveRetry retries a stalled files.get instead of
  // failing it on the first attempt. (gaxios 7 is the native-fetch rewrite, so
  // its own per-call-timeout path ALWAYS yields "TimeoutError";
  // ECONNABORTED/ETIMEDOUT are the older gaxios-6/axios shapes, retained only for
  // a low-level undici/socket cause whose .code gaxios copies through — never
  // from gaxios-7's timeout path itself.)
  const code = (error as { code?: unknown })?.code;
  if (code === "TimeoutError" || code === "ETIMEDOUT" || code === "ECONNABORTED") {
    return 504;
  }
  // gaxios / googleapis error shapes: response.status, status, or numeric code.
  const candidate =
    (error as { response?: { status?: unknown } })?.response?.status ??
    (error as { status?: unknown })?.status ??
    (error as { code?: unknown })?.code;
  if (typeof candidate === "number") return candidate;

  // undici double-wrap: gaxios 7 uses native fetch, which throws a bare
  // `TypeError: fetch failed` whose OWN `.code` is undefined — the real socket
  // error code (ECONNRESET/ENOTFOUND/…) is nested one (or more) `.cause` levels
  // down (undici wraps the socket Error, and gaxios may wrap that again). None of
  // the top-level checks above see it, so a transient socket blip would classify
  // null and withDriveRetry would rethrow WITHOUT retrying — aborting the whole
  // sync/scan pass on a single hiccup. Walk the bounded `.cause` chain (starting
  // BELOW the top-level error, so a bare top-level string `code` keeps its
  // existing non-retry contract — only the timeout codes above map top-level)
  // looking for a code in the transient-network set, and map it to 503 (a
  // TRANSIENT_DRIVE_STATUSES value) so withDriveRetry retries it.
  for (
    let node: unknown = (error as { cause?: unknown })?.cause, depth = 0;
    node != null && depth < 5;
    depth += 1
  ) {
    const nodeCode = (node as { code?: unknown }).code;
    if (typeof nodeCode === "string" && TRANSIENT_NETWORK_CODES.has(nodeCode)) {
      return 503;
    }
    const cause = (node as { cause?: unknown }).cause;
    if (cause === node) break; // cycle guard
    node = cause;
  }
  return null;
}

/**
 * Run a single Drive operation, retrying ONLY transient (429 / 5xx) failures with
 * bounded exponential backoff + jitter. Used to wrap the raw `files.get` and xlsx
 * export calls so every caller (onboarding scan + cron + manual sync) survives a
 * transient throttle instead of aborting the whole pass.
 */
export async function withDriveRetry<T>(
  op: () => Promise<T>,
  options: DriveRetryOptions = {},
): Promise<T> {
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const random = options.random ?? Math.random;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_DRIVE_RETRIES;
  let attempt = 0;
  for (;;) {
    try {
      return await op();
    } catch (error) {
      const status = driveErrorStatus(error);
      if (status === null || !TRANSIENT_DRIVE_STATUSES.has(status) || attempt >= maxRetries) {
        throw error;
      }
      attempt += 1;
      // 250ms, 500ms, 1000ms exponential backoff + up to 250ms jitter.
      const delayMs = 250 * 2 ** (attempt - 1) + Math.floor(random() * 250);
      await sleep(delayMs);
    }
  }
}

/**
 * Fetch the xlsx export bytes for an already-resolved export URL, bounded by a
 * per-attempt stall-guard timeout and wrapped in `withDriveRetry`.
 *
 * One `AbortController` covers BOTH the header fetch and the body read, so a
 * stall at either point aborts the attempt. The abort is surfaced as a transient
 * `DriveFetchError(504)` (an HTTP-export failure shape `withDriveRetry` already
 * treats as transient), so a stalled export is retried with a fresh budget rather
 * than hanging forever; after the bounded retries it propagates as a typed error.
 * The timer is `clearTimeout`'d in `finally` (and `unref`'d defensively) so a
 * resolved export never leaves a dangling timer holding the event loop open.
 */
async function fetchXlsxExportBytes(
  exportUrl: string,
  accessToken: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  retry?: DriveRetryOptions,
): Promise<ArrayBuffer> {
  return withDriveRetry(async () => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs) as ReturnType<typeof setTimeout> & { unref?: () => void };
    timer.unref?.();
    try {
      const response = await fetchImpl(exportUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: XLSX_EXPORT_MIME_TYPE,
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        // Carry the status so withDriveRetry can retry a transient (429/5xx) export.
        throw new DriveFetchError(
          `Drive revision xlsx export failed with HTTP ${response.status}`,
          response.status,
        );
      }
      return await response.arrayBuffer();
    } catch (error) {
      if (timedOut) {
        // The stall guard fired. Surface it as a transient 504 so withDriveRetry
        // retries with a fresh budget; after the bounded retries this propagates
        // as a typed DriveFetchError instead of an indefinite hang. `timedOut`
        // (our own flag) — not the abort error's name — is the source of truth.
        throw new DriveFetchError(`Drive xlsx export timed out after ${timeoutMs}ms`, 504);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }, retry);
}

// Raw Drive files.get with transient-retry. A NAMED helper (not an inline arrow)
// so the single-sheet scope-check contract attributes the .files.get to one
// exemptable site (callers that PROCESS sheets still scope-check the result).
/**
 * Attach an immutable cron attribution snapshot (captured at Drive-call time) to a
 * thrown error as `syncRunContext`, WITHOUT clobbering one already present (the
 * richer runScheduledCronSync S1 attach wins if the error later traverses it). Lets
 * runCronRoute attribute a DETACHED Drive rejection to the operation that created
 * it, immune to later mutation of the shared ALS (audit #4 PR-1, whole-diff R1).
 */
function attachCronContext<T>(err: T, ctx: CronInFlightSnapshot | undefined): T {
  if (ctx && err !== null && typeof err === "object" && !("syncRunContext" in err)) {
    (err as { syncRunContext?: unknown }).syncRunContext = ctx;
  }
  return err;
}

function driveFilesGet(
  drive: drive_v3.Drive,
  params: drive_v3.Params$Resource$Files$Get,
  retry?: DriveRetryOptions,
  timeoutMs: number = DRIVE_FILES_GET_TIMEOUT_MS,
) {
  // Named thunk so the single-sheet scope-check attributes the .files.get to one
  // specific exempt site (driveFilesGetCall) rather than an anonymous arrow.
  // supportsAllDrives is set HERE (inline, on the params/1st arg) so the
  // shared-Drive-support contract sees it on the one real .files.get call site.
  // The per-call gaxios `timeout` bounds the stall; `retry: false` keeps
  // withDriveRetry as the single retry layer (so the budget is exactly timeoutMs
  // per attempt, not multiplied by gaxios's own internal retry).
  //
  // Snapshot the in-flight cron context NOW — synchronously, at call time = the
  // correct operation — and attach it to any error, so a detached rejection that
  // surfaces after the shared ALS has advanced is still attributed to THIS call
  // rather than the stale ALS read at throw time (whole-diff R1).
  const cronAtCall = snapshotCronInFlight();
  // Fail fast on an empty/blank fileId (before spending any retry budget) so it
  // never reaches Google as an opaque `File not found: .` 404 (audit #4 PR-1).
  try {
    assertNonEmptyDriveFileId((params as { fileId?: unknown }).fileId);
  } catch (err) {
    throw attachCronContext(err, cronAtCall);
  }
  const driveFilesGetCall = () =>
    drive.files.get({ ...params, supportsAllDrives: true }, { timeout: timeoutMs, retry: false });
  return withDriveRetry(driveFilesGetCall, retry).catch((err: unknown) => {
    throw attachCronContext(err, cronAtCall);
  });
}

function toDriveFileMetadata(file: drive_v3.Schema$File): DriveListedFile {
  if (!file.id || !file.name || !file.mimeType || !file.modifiedTime) {
    throw new DriveFetchError("Drive files.get response omitted required metadata");
  }

  const metadata: DriveListedFile = {
    driveFileId: file.id,
    name: file.name,
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime,
    parents: file.parents ?? [],
  };
  if (typeof file.trashed === "boolean") metadata.trashed = file.trashed;
  if (file.headRevisionId) metadata.headRevisionId = file.headRevisionId;
  if (file.md5Checksum) metadata.md5Checksum = file.md5Checksum;
  return metadata;
}

function bindingToken(file: drive_v3.Schema$File | DriveListedFile): string {
  const token = file.headRevisionId ?? file.modifiedTime;
  if (!token) {
    const fileId = "driveFileId" in file ? file.driveFileId : file.id;
    throw new DriveFetchError(`Drive files.get response omitted revision token for ${fileId}`);
  }
  return token;
}

async function fetchFileForExport(
  driveFileId: string,
  drive: drive_v3.Drive,
  retry?: DriveRetryOptions,
  metadataTimeoutMs?: number,
): Promise<drive_v3.Schema$File> {
  const response = await driveFilesGet(
    drive,
    { fileId: driveFileId, fields: DRIVE_EXPORT_METADATA_FIELDS, supportsAllDrives: true },
    retry,
    metadataTimeoutMs,
  );
  if (
    !response.data.id ||
    !response.data.name ||
    !response.data.mimeType ||
    !response.data.modifiedTime
  ) {
    throw new DriveFetchError("Drive files.get response omitted required metadata");
  }
  return response.data;
}

export async function fetchDriveFileMetadata(
  driveFileId: string,
  options: DriveFetchOptions = {},
): Promise<DriveListedFile> {
  const drive = options.drive ?? getDriveClient();
  const response = await driveFilesGet(
    drive,
    { fileId: driveFileId, fields: DRIVE_FILE_METADATA_FIELDS, supportsAllDrives: true },
    options.retry,
    options.metadataTimeoutMs,
  );

  return toDriveFileMetadata(response.data);
}

/**
 * @internal: tests only. Production sync paths must call
 * fetchSheetAsMarkdownAtRevision with a binding token captured before parsing.
 */
export async function fetchSheetAsMarkdown(
  driveFileId: string,
  options: DriveFetchOptions = {},
): Promise<string> {
  const drive = options.drive ?? getDriveClient();
  const metadata = await fetchDriveFileMetadata(driveFileId, { ...options, drive });
  return fetchSheetAsMarkdownAtRevision(driveFileId, bindingToken(metadata), {
    ...options,
    drive,
  });
}

export async function fetchSheetAsMarkdownAtRevision(
  driveFileId: string,
  revisionId: string,
  options: DriveFetchOptions = {},
): Promise<string> {
  const { markdown } = await fetchSheetMarkdownAndBytesAtRevision(driveFileId, revisionId, options);
  return markdown;
}

/**
 * Task 5: fetch the XLSX bytes ONCE and return both the synthesized markdown and the raw
 * bytes in a single Drive export, using the same before/after binding-token race guard as
 * fetchSheetAsMarkdownAtRevision. Callers that need both artifacts (markdown for parsing,
 * bytes for extractSourceAnchors) use this to avoid a second Drive export.
 */
export async function fetchSheetMarkdownAndBytesAtRevision(
  driveFileId: string,
  revisionId: string,
  options: DriveFetchOptions = {},
): Promise<{ markdown: string; bytes: ArrayBuffer }> {
  const drive = options.drive ?? getDriveClient();
  const before = await fetchFileForExport(
    driveFileId,
    drive,
    options.retry,
    options.metadataTimeoutMs,
  );
  const beforeToken = bindingToken(before);
  if (beforeToken !== revisionId) {
    throw new DriveFetchError(
      `Drive bound revision token for ${driveFileId} changed before xlsx export`,
    );
  }

  const exportUrl = before.exportLinks?.[XLSX_EXPORT_MIME_TYPE];
  if (!exportUrl) {
    throw new DriveFetchError(
      `Drive revision token ${revisionId} for ${driveFileId} did not include an xlsx export link`,
    );
  }
  const accessToken = await (options.getAccessToken ?? getDriveAccessToken)();
  const fetchImpl = options.fetch ?? fetch;
  const bytes = await fetchXlsxExportBytes(
    exportUrl,
    accessToken,
    fetchImpl,
    options.exportTimeoutMs ?? DRIVE_EXPORT_TIMEOUT_MS,
    options.retry,
  );
  const after = await fetchFileForExport(
    driveFileId,
    drive,
    options.retry,
    options.metadataTimeoutMs,
  );
  const afterToken = bindingToken(after);
  if (afterToken !== revisionId) {
    throw new DriveFetchError(`Drive revision token for ${driveFileId} changed during xlsx export`);
  }

  return { markdown: synthesizeMarkdownFromXlsx(bytes), bytes };
}

/**
 * Export the CURRENT xlsx bytes of a sheet (no caller-supplied revision token).
 * Mirrors {@link fetchSheetMarkdownAndBytesAtRevision} minus the pinned-revision
 * check and the markdown synthesis. Used at Apply/recovery to re-produce embedded
 * DIAGRAMS-image bytes: the before/after binding-token guard protects against a
 * mid-export edit; correctness of "these are the approved bytes" is enforced
 * downstream by the embeddedFingerprint content-hash re-verify, not by pinning
 * a revision (native-Sheet revisions.list ids are a different token space than
 * the export binding token — see spec §8.3).
 */
export async function fetchCurrentSheetXlsxBytes(
  driveFileId: string,
  options: DriveFetchOptions = {},
): Promise<ArrayBuffer> {
  const drive = options.drive ?? getDriveClient();
  const before = await fetchFileForExport(driveFileId, drive, options.retry, options.metadataTimeoutMs);
  const token = bindingToken(before);
  const exportUrl = before.exportLinks?.[XLSX_EXPORT_MIME_TYPE];
  if (!exportUrl) {
    throw new DriveFetchError(
      `Drive revision token ${token} for ${driveFileId} did not include an xlsx export link`,
    );
  }
  const accessToken = await (options.getAccessToken ?? getDriveAccessToken)();
  const fetchImpl = options.fetch ?? fetch;
  const bytes = await fetchXlsxExportBytes(
    exportUrl,
    accessToken,
    fetchImpl,
    options.exportTimeoutMs ?? DRIVE_EXPORT_TIMEOUT_MS,
    options.retry,
  );
  const after = await fetchFileForExport(driveFileId, drive, options.retry, options.metadataTimeoutMs);
  if (bindingToken(after) !== token) {
    throw new DriveFetchError(`Drive revision token for ${driveFileId} changed during xlsx export`);
  }
  return bytes;
}

/**
 * Fetch a sheet as markdown AND capture its binding in one pass, using the
 * export's before-`get` as the binding source. Equivalent to capturing a
 * binding then calling fetchSheetAsMarkdownAtRevision, but ONE files.get cheaper
 * per sheet (2 gets — before + after — instead of 3) because the separate
 * binding-capture get is folded into the export's before-`get`. No TOCTOU
 * widening: the binding token IS the before-`get` revision, and the after-`get`
 * still aborts if the revision changes mid-export.
 *
 * For first-seen onboarding only — the cron/manual sync paths capture the
 * binding separately on purpose (its token feeds the revision-race cooldown in
 * runScheduledCronSync), so they must NOT use this.
 */
export async function fetchSheetMarkdownWithBinding(
  driveFileId: string,
  options: DriveFetchOptions = {},
): Promise<{
  binding: { bindingToken: string; modifiedTime: string };
  markdown: string;
  // The raw xlsx bytes the markdown was synthesized from — returned so the
  // onboarding scan can compute exact-cell deep-link anchors WITHOUT a second
  // Drive export.
  bytes: ArrayBuffer;
}> {
  const drive = options.drive ?? getDriveClient();
  const before = await fetchFileForExport(
    driveFileId,
    drive,
    options.retry,
    options.metadataTimeoutMs,
  );
  const token = bindingToken(before);
  const modifiedTime = before.modifiedTime;
  if (!modifiedTime) {
    // Unreachable: fetchFileForExport already validates modifiedTime is present.
    throw new DriveFetchError(`Drive files.get for ${driveFileId} omitted modifiedTime`);
  }

  const exportUrl = before.exportLinks?.[XLSX_EXPORT_MIME_TYPE];
  if (!exportUrl) {
    throw new DriveFetchError(
      `Drive revision token ${token} for ${driveFileId} did not include an xlsx export link`,
    );
  }
  const accessToken = await (options.getAccessToken ?? getDriveAccessToken)();
  const fetchImpl = options.fetch ?? fetch;
  const bytes = await fetchXlsxExportBytes(
    exportUrl,
    accessToken,
    fetchImpl,
    options.exportTimeoutMs ?? DRIVE_EXPORT_TIMEOUT_MS,
    options.retry,
  );
  const after = await fetchFileForExport(
    driveFileId,
    drive,
    options.retry,
    options.metadataTimeoutMs,
  );
  if (bindingToken(after) !== token) {
    throw new DriveFetchError(`Drive revision token for ${driveFileId} changed during xlsx export`);
  }

  return {
    binding: { bindingToken: token, modifiedTime },
    markdown: synthesizeMarkdownFromXlsx(bytes),
    bytes,
  };
}
