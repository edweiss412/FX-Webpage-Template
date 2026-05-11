import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { getDriveClient } from "@/lib/drive/client";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import { validateCrewAssetSession } from "@/lib/auth/validateCrewAssetSession";
import { isAllowedReelMime } from "@/lib/data/openingReel";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  ByteLimitExceededError,
  boundedWebStreamFromNode,
  boundedPassThroughWeb,
  webStreamFromBytes,
  webStreamFromChunks,
  readChunkedHashBoundedNodeStream,
  type ChunkedHashResult,
} from "@/lib/sync/boundedBytes";

const CACHE_CONTROL = "private, max-age=0, must-revalidate";
const MAX_REEL_FALLBACK_BYTES = 512 * 1024 * 1024;

type RouteContext = {
  params: Promise<{ show: string }>;
};

type ReelRow = {
  published: boolean | null;
  opening_reel_drive_file_id: string | null;
  opening_reel_drive_modified_time: string | null;
  opening_reel_head_revision_id: string | null;
  opening_reel_mime_type: string | null;
};

type DriveMetadata = {
  modifiedTime?: string | null;
  trashed?: boolean | null;
  headRevisionId?: string | null;
  md5Checksum?: string | null;
  /**
   * Drive-reported file size in bytes (as a string per the Drive v3 API).
   * Used for the pre-flight size gate so an oversized reel never starts
   * streaming.
   */
  size?: string | null;
};

type UsableReelRow = ReelRow & {
  opening_reel_drive_file_id: string;
  opening_reel_drive_modified_time: string;
  opening_reel_head_revision_id: string;
  opening_reel_mime_type: string;
};

type ReelDriveOptions = {
  responseType: "stream";
  headers?: Record<string, string>;
};

type ReelDriveResponse = {
  data: unknown;
  status?: number;
  headers?: Record<string, string | string[] | undefined>;
};

type ReelDriveClient = {
  files: {
    get(
      args: {
        fileId: string;
        fields?: string;
        alt?: "media";
        supportsAllDrives?: boolean;
      },
      options?: ReelDriveOptions,
    ): Promise<ReelDriveResponse>;
  };
  revisions: {
    get(
      args: {
        fileId: string;
        revisionId: string;
        alt: "media";
        supportsAllDrives?: boolean;
      },
      options?: ReelDriveOptions,
    ): Promise<ReelDriveResponse>;
  };
};

// Single-range only. Two valid shapes per RFC 7233:
//   - `bytes=<start>-<optional end>` — explicit start, optional end
//   - `bytes=-<suffix>` — last N bytes (suffix range; common for
//     video clients fetching trailing metadata)
// Multi-range (`bytes=0-100,200-300`) and other shapes are rejected.
const SINGLE_RANGE_RE = /^bytes=(?:\d+-\d*|-\d+)$/;

type ParsedRange = { start: number; end: number };

function parseSingleRange(
  header: string,
  totalBytes: number,
): ParsedRange | "unsatisfiable" | null {
  if (!SINGLE_RANGE_RE.test(header)) return null;
  // Suffix range: `bytes=-N` = last N bytes.
  const suffixMatch = /^bytes=-(\d+)$/.exec(header);
  if (suffixMatch) {
    const suffix = Number(suffixMatch[1]);
    if (!Number.isFinite(suffix) || suffix <= 0) return "unsatisfiable";
    if (totalBytes === 0) return "unsatisfiable";
    const start = Math.max(0, totalBytes - suffix);
    return { start, end: totalBytes - 1 };
  }
  const match = /^bytes=(\d+)-(\d*)$/.exec(header);
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : totalBytes - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= totalBytes) return "unsatisfiable";
  return { start, end: Math.min(end, totalBytes - 1) };
}

function sliceChunks(chunks: Uint8Array[], start: number, end: number): Uint8Array[] {
  const result: Uint8Array[] = [];
  let cursor = 0;
  for (const chunk of chunks) {
    const chunkStart = cursor;
    const chunkEnd = cursor + chunk.byteLength;
    cursor = chunkEnd;
    if (chunkEnd <= start) continue;
    if (chunkStart > end) break;
    const localStart = Math.max(0, start - chunkStart);
    const localEnd = Math.min(chunk.byteLength, end - chunkStart + 1);
    if (localEnd > localStart) {
      result.push(chunk.subarray(localStart, localEnd));
    }
  }
  return result;
}

function pickStringHeader(headers: ReelDriveResponse["headers"], name: string): string | null {
  if (!headers) return null;
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

function gone(): Response {
  return new Response(null, {
    status: 410,
    headers: { "Cache-Control": CACHE_CONTROL },
  });
}

function bytesFrom(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof data === "string") return new TextEncoder().encode(data);
  if (Buffer.isBuffer(data)) return new Uint8Array(data);
  return new Uint8Array();
}

async function chunkedHashFrom(data: unknown): Promise<ChunkedHashResult> {
  if (data instanceof Readable) {
    return readChunkedHashBoundedNodeStream(data, MAX_REEL_FALLBACK_BYTES);
  }
  if (data instanceof ReadableStream) {
    // Convert Web → Node so we can reuse the chunked-hash helper without
    // double-buffering through `readBoundedWebStream`'s finalize step.
    // The cross-realm cast is required because `node:stream`'s
    // `Readable.fromWeb` expects the Node-flavored web ReadableStream
    // type rather than lib.dom's, but they're structurally identical.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeStream = Readable.fromWeb(data as any);
    return readChunkedHashBoundedNodeStream(nodeStream, MAX_REEL_FALLBACK_BYTES);
  }
  // Non-stream input (test fixture, or a runtime adapter that ignores
  // `responseType: "stream"`): wrap as a single-chunk result. Codex R6
  // P1: the byte ceiling MUST hold here too — without it, a runtime
  // that returns a buffered Uint8Array would let an oversized reel
  // slip past the cap.
  const bytes = bytesFrom(data);
  if (bytes.byteLength > MAX_REEL_FALLBACK_BYTES) {
    throw new ByteLimitExceededError(MAX_REEL_FALLBACK_BYTES);
  }
  const md5 = createHash("md5").update(bytes).digest("hex");
  const sha256 = createHash("sha256").update(bytes).digest("base64url");
  return {
    chunks: bytes.byteLength > 0 ? [bytes] : [],
    totalBytes: bytes.byteLength,
    md5Hex: md5,
    sha256Base64Url: sha256,
  };
}

function hasUsablePin(row: ReelRow): row is UsableReelRow {
  return Boolean(
    row.opening_reel_drive_file_id &&
    row.opening_reel_drive_modified_time &&
    row.opening_reel_head_revision_id &&
    row.opening_reel_mime_type &&
    // Codex R8 P1 + R10 P2: shared allowlist from `lib/data/openingReel.ts`
    // so the page projection (`projectOpeningReelHasVideo`) and this
    // route never drift on which MIMEs are renderable. Without the
    // unified gate, a persisted `video/x-flv` would make the page emit
    // <video> while this route 410s — a broken player with no admin
    // warning.
    isAllowedReelMime(row.opening_reel_mime_type),
  );
}

function drifted(row: UsableReelRow, current: DriveMetadata): boolean {
  if (current.trashed) return true;
  if (current.headRevisionId !== row.opening_reel_head_revision_id) return true;
  // Codex R7 P1: modtime comparison must be instant-equal, not string-
  // equal. Postgres normalizes the persisted `::timestamptz` value
  // (often `+00:00` suffix), while Drive returns `.000Z`. Both
  // represent the same instant but are byte-distinct strings — a
  // strict string compare yields a false-positive drift.
  if (!current.modifiedTime) return true;
  const driveMs = Date.parse(current.modifiedTime);
  const pinMs = Date.parse(row.opening_reel_drive_modified_time);
  if (!Number.isFinite(driveMs) || !Number.isFinite(pinMs)) return true;
  return driveMs !== pinMs;
}

function isPermissionDenied(error: unknown): boolean {
  const candidate = error as {
    code?: unknown;
    status?: unknown;
    errors?: Array<{ reason?: unknown }>;
  };
  return (
    candidate.code === 403 ||
    candidate.status === 403 ||
    (candidate.errors ?? []).some((entry) => entry.reason === "permissionDenied")
  );
}

function isRevisionFallbackAllowed(error: unknown): boolean {
  const candidate = error as { code?: unknown; status?: unknown };
  return (
    candidate.code === 404 ||
    candidate.status === 404 ||
    candidate.code === 410 ||
    candidate.status === 410
  );
}

function isRangeNotSatisfiable(error: unknown): boolean {
  const candidate = error as { code?: unknown; status?: unknown };
  return candidate.code === 416 || candidate.status === 416;
}

function rangeNotSatisfiable(totalBytes: number | null): Response {
  const headers: Record<string, string> = {
    "Accept-Ranges": "bytes",
    "Cache-Control": CACHE_CONTROL,
  };
  if (totalBytes !== null) headers["Content-Range"] = `bytes */${totalBytes}`;
  return new Response(null, { status: 416, headers });
}

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { show } = await context.params;

  // Codex R4 P1: admin check FIRST (no side effects).
  const admin = await isAdminSession(request);
  if (!admin.ok && admin.reason === "infra_error") {
    return NextResponse.json({ error: "ADMIN_SESSION_LOOKUP_FAILED" }, { status: 500 });
  }
  const isAdmin = admin.ok;

  let supabase: ReturnType<typeof createSupabaseServiceRoleClient>;
  let lookup: { data: ReelRow | null; error: unknown };
  try {
    supabase = createSupabaseServiceRoleClient();
    lookup = (await supabase
      .from("shows")
      .select(
        "published,opening_reel_drive_file_id,opening_reel_drive_modified_time,opening_reel_head_revision_id,opening_reel_mime_type",
      )
      .eq("id", show)
      .maybeSingle()) as { data: ReelRow | null; error: unknown };
  } catch {
    return NextResponse.json({ error: "REEL_ASSET_LOOKUP_FAILED" }, { status: 500 });
  }
  // Codex R2 P1: Supabase returned-error must NOT be collapsed into the
  // benign-absence 410 path — surface as 500 per AGENTS.md §1.9.
  if (lookup.error) {
    return NextResponse.json({ error: "REEL_ASSET_LOOKUP_FAILED" }, { status: 500 });
  }
  const row = lookup.data;
  if (!row) {
    return gone();
  }
  // Codex R4 P1: published gate BEFORE link/google validators so an
  // unpublished-show request never refreshes link_sessions.last_active_at.
  if (!isAdmin && row.published !== true) {
    return gone();
  }
  if (!isAdmin) {
    const session = await validateCrewAssetSession(request, show);
    if (!session.ok) return session.response;
  }
  if (!hasUsablePin(row)) {
    return gone();
  }

  try {

    const drive = getDriveClient() as unknown as ReelDriveClient;
    // Codex R14 P1: `supportsAllDrives: true` so reels in Shared
    // Drives resolve instead of 404ing on the metadata + media calls.
    const { data: current } = (await drive.files.get({
      fileId: row.opening_reel_drive_file_id,
      fields: "modifiedTime,trashed,headRevisionId,md5Checksum,size",
      supportsAllDrives: true,
    })) as { data: DriveMetadata };
    if (drifted(row, current)) {
      return gone();
    }
    // Codex R2 P1: pre-flight size gate. Drive reports `size` as a string
    // on binary files; reject before initiating any stream so a 1GB reel
    // can never start flowing through the worker.
    const reportedSize = current.size != null ? Number(current.size) : NaN;
    if (Number.isFinite(reportedSize) && reportedSize > MAX_REEL_FALLBACK_BYTES) {
      return gone();
    }

    // Codex R14 P1: parse + forward Range request. `<video preload=
    // "metadata">` and any user-initiated seek issues `Range: bytes=
    // start-end`; without 206 + Content-Range, every seek pulls a
    // full-object transfer. Single-range only; multi-range / malformed
    // ranges → 416.
    const rangeHeader = request.headers.get("range");
    if (rangeHeader && !SINGLE_RANGE_RE.test(rangeHeader)) {
      return rangeNotSatisfiable(Number.isFinite(reportedSize) ? reportedSize : null);
    }
    // Codex R18 P1: pre-flight Range against the known size so a
    // syntactically valid but unsatisfiable range (`bytes=-0`,
    // start≥size, start>end) returns 416 BEFORE we call Drive — and
    // we don't end up mapping a Drive 416 into a 500.
    if (rangeHeader && Number.isFinite(reportedSize)) {
      const parsed = parseSingleRange(rangeHeader, reportedSize);
      if (parsed === "unsatisfiable") {
        return rangeNotSatisfiable(reportedSize);
      }
    }

    try {
      const revOpts: ReelDriveOptions = { responseType: "stream" };
      if (rangeHeader) revOpts.headers = { Range: rangeHeader };
      const revRes = (await drive.revisions.get(
        {
          fileId: row.opening_reel_drive_file_id,
          revisionId: row.opening_reel_head_revision_id,
          alt: "media",
          supportsAllDrives: true,
        },
        revOpts,
      )) as ReelDriveResponse;
      // Wrap in a bounded pass-through so even if Drive reports `size`
      // wrong (or omits it for an unusual content type), the worker
      // fails closed at the cap instead of streaming unbounded bytes.
      const stream = boundedStreamFrom(revRes.data);
      // Drive returns 200 (full body) or 206 (partial). Forward verbatim.
      const driveStatus = typeof revRes.status === "number" ? revRes.status : 200;
      const responseHeaders: Record<string, string> = {
        "Cache-Control": CACHE_CONTROL,
        "Content-Type": row.opening_reel_mime_type,
        // Codex R8 P1: nosniff so the browser does NOT sniff the
        // bytes and infer a different MIME than the allowlisted
        // video type we asserted at `hasUsablePin`.
        "X-Content-Type-Options": "nosniff",
        // Codex R14 P1: advertise Range support on every response so
        // clients know they may issue Range on subsequent fetches
        // (e.g., `<video>` seeks).
        "Accept-Ranges": "bytes",
      };
      const contentRange = pickStringHeader(revRes.headers, "content-range");
      const contentLength = pickStringHeader(revRes.headers, "content-length");
      if (contentRange) responseHeaders["Content-Range"] = contentRange;
      if (contentLength) responseHeaders["Content-Length"] = contentLength;
      return new Response(stream, { status: driveStatus, headers: responseHeaders });
    } catch (revisionsError) {
      // Codex R18 P1: Drive 416 means the requested Range is
      // unsatisfiable (e.g., past the end of the file). Return 416 to
      // the client — NOT a generic 500. Surface size context when
      // metadata gave it.
      if (isRangeNotSatisfiable(revisionsError)) {
        return rangeNotSatisfiable(Number.isFinite(reportedSize) ? reportedSize : null);
      }
      if (!isRevisionFallbackAllowed(revisionsError)) throw revisionsError;
      const { data } = (await drive.files.get(
        {
          fileId: row.opening_reel_drive_file_id,
          alt: "media",
          supportsAllDrives: true,
        },
        { responseType: "stream" },
      )) as { data: unknown };
      // Codex R3 P1: md5 fallback must hash before serving, but
      // `readBoundedNodeStream` finalized a 2nd contiguous Uint8Array
      // for every chunk it had already buffered — 2x in-memory cost.
      // `readChunkedHashBoundedNodeStream` retains a single chunk[]
      // reference, computes the hash during the read, and hands the
      // chunks straight to `webStreamFromChunks` for the Response —
      // residency stays at 1x the body size.
      const result = await chunkedHashFrom(data);
      if (!current.md5Checksum || result.md5Hex !== current.md5Checksum) {
        return gone();
      }
      // Codex R15 P1: the fallback path now serves Range too. Native
      // <video preload="metadata"> issues Range on every load; without
      // Range support on this branch a reel that depends on the
      // fallback (Pattern A revision GC'd / 404) would fail to load
      // entirely. After md5 verify, slice the already-buffered chunks
      // to satisfy the requested range and return 206.
      if (rangeHeader) {
        const parsed = parseSingleRange(rangeHeader, result.totalBytes);
        if (parsed === "unsatisfiable") {
          return new Response(null, {
            status: 416,
            headers: {
              "Accept-Ranges": "bytes",
              "Cache-Control": CACHE_CONTROL,
              "Content-Range": `bytes */${result.totalBytes}`,
            },
          });
        }
        if (parsed) {
          const sliced = sliceChunks(result.chunks, parsed.start, parsed.end);
          const sliceLength = parsed.end - parsed.start + 1;
          return new Response(webStreamFromChunks(sliced), {
            status: 206,
            headers: {
              "Cache-Control": CACHE_CONTROL,
              "Content-Type": row.opening_reel_mime_type,
              "Content-Length": String(sliceLength),
              "Content-Range": `bytes ${parsed.start}-${parsed.end}/${result.totalBytes}`,
              "X-Content-Type-Options": "nosniff",
              "Accept-Ranges": "bytes",
            },
          });
        }
        // Range header was present but failed the format gate. The
        // route-level malformed-range check already 416'd before this
        // branch; reaching here means the parsed gate disagreed — fall
        // through to the full-body response.
      }
      return new Response(webStreamFromChunks(result.chunks), {
        headers: {
          "Cache-Control": CACHE_CONTROL,
          "Content-Type": row.opening_reel_mime_type,
          "Content-Length": String(result.totalBytes),
          // Codex R8 P1: nosniff parity with the exact-revision branch.
          "X-Content-Type-Options": "nosniff",
          // Codex R14 P1: advertise Range support so subsequent
          // client seeks may try a Range request (Pattern A handles
          // those; this fallback path doesn't support Range, but
          // signaling the capability is correct here).
          "Accept-Ranges": "bytes",
        },
      });
    }
  } catch (caught) {
    if (caught instanceof ByteLimitExceededError) return gone();
    if (isPermissionDenied(caught)) return gone();
    return NextResponse.json({ error: "REEL_ASSET_LOOKUP_FAILED" }, { status: 500 });
  }
}

function boundedStreamFrom(data: unknown): ReadableStream<Uint8Array> {
  if (data instanceof Readable) {
    return boundedWebStreamFromNode(data, MAX_REEL_FALLBACK_BYTES);
  }
  if (data instanceof ReadableStream) {
    return boundedPassThroughWeb(data as ReadableStream<Uint8Array>, MAX_REEL_FALLBACK_BYTES);
  }
  // Codex R6 P1: a runtime adapter that ignores `responseType: "stream"`
  // and hands back buffered bytes (Uint8Array / ArrayBuffer / Buffer /
  // string) must still respect the byte ceiling. Without this check,
  // an oversized buffered reel would slip past `boundedStreamFrom` and
  // be served unbounded.
  const bytes = bytesFrom(data);
  if (bytes.byteLength > MAX_REEL_FALLBACK_BYTES) {
    throw new ByteLimitExceededError(MAX_REEL_FALLBACK_BYTES);
  }
  return webStreamFromBytes(bytes);
}
