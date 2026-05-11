import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { getDriveClient } from "@/lib/drive/client";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import { validateCrewAssetSession } from "@/lib/auth/validateCrewAssetSession";
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

type ReelDriveClient = {
  files: {
    get(
      args: { fileId: string; fields?: string; alt?: "media" },
      options?: { responseType: "stream" },
    ): Promise<{ data: unknown }>;
  };
  revisions: {
    get(
      args: {
        fileId: string;
        revisionId: string;
        alt: "media";
      },
      options?: { responseType: "stream" },
    ): Promise<{ data: unknown }>;
  };
};

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
    row.opening_reel_mime_type?.startsWith("video/"),
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
    const { data: current } = (await drive.files.get({
      fileId: row.opening_reel_drive_file_id,
      fields: "modifiedTime,trashed,headRevisionId,md5Checksum,size",
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

    try {
      const { data } = (await drive.revisions.get(
        {
          fileId: row.opening_reel_drive_file_id,
          revisionId: row.opening_reel_head_revision_id,
          alt: "media",
        },
        { responseType: "stream" },
      )) as { data: unknown };
      // Wrap in a bounded pass-through so even if Drive reports `size`
      // wrong (or omits it for an unusual content type), the worker
      // fails closed at the cap instead of streaming unbounded bytes.
      const stream = boundedStreamFrom(data);
      return new Response(stream, {
        headers: {
          "Cache-Control": CACHE_CONTROL,
          "Content-Type": row.opening_reel_mime_type,
        },
      });
    } catch (revisionsError) {
      if (!isRevisionFallbackAllowed(revisionsError)) throw revisionsError;
      const { data } = (await drive.files.get(
        {
          fileId: row.opening_reel_drive_file_id,
          alt: "media",
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
      return new Response(webStreamFromChunks(result.chunks), {
        headers: {
          "Cache-Control": CACHE_CONTROL,
          "Content-Type": row.opening_reel_mime_type,
          "Content-Length": String(result.totalBytes),
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
