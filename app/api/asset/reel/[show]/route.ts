import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { getDriveClient } from "@/lib/drive/client";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import { validateGoogleSession } from "@/lib/auth/validateGoogleSession";
import { validateLinkSession } from "@/lib/auth/validateLinkSession";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  ByteLimitExceededError,
  boundedWebStreamFromNode,
  boundedPassThroughWeb,
  webStreamFromBytes,
  readBoundedNodeStream,
  readBoundedWebStream,
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

type AuthorizeResult =
  | { ok: true; isAdmin: boolean }
  | { ok: false; response: Response };

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

function md5Hex(bytes: Uint8Array): string {
  return createHash("md5").update(bytes).digest("hex");
}

function bytesFrom(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof data === "string") return new TextEncoder().encode(data);
  if (Buffer.isBuffer(data)) return new Uint8Array(data);
  return new Uint8Array();
}

async function boundedBytesFrom(data: unknown): Promise<Uint8Array> {
  if (data instanceof Readable) {
    return (await readBoundedNodeStream(data, MAX_REEL_FALLBACK_BYTES)).bytes;
  }
  if (data instanceof ReadableStream) {
    return (await readBoundedWebStream(data, MAX_REEL_FALLBACK_BYTES)).bytes;
  }
  return bytesFrom(data);
}

async function authorize(request: NextRequest, showId: string): Promise<AuthorizeResult> {
  const admin = await isAdminSession(request);
  if (admin.ok) return { ok: true, isAdmin: true };
  if (admin.reason === "infra_error") {
    return {
      ok: false,
      response: NextResponse.json({ error: "ADMIN_SESSION_LOOKUP_FAILED" }, { status: 500 }),
    };
  }

  const link = await validateLinkSession(request, { showId });
  if (link.kind === "success") {
    return link.viewer.showId === showId
      ? { ok: true, isAdmin: false }
      : { ok: false, response: new Response(null, { status: 403 }) };
  }
  if (link.kind === "terminal_failure") {
    return {
      ok: false,
      response: NextResponse.json({ error: link.code }, { status: link.status }),
    };
  }
  if (link.priorFailure?.status === 410) {
    return { ok: false, response: gone() };
  }

  const google = await validateGoogleSession(request, { showId });
  if (google.kind === "success") {
    return google.viewer.showId === showId
      ? { ok: true, isAdmin: false }
      : { ok: false, response: new Response(null, { status: 403 }) };
  }
  if (google.kind === "terminal_failure") {
    return {
      ok: false,
      response: NextResponse.json({ error: google.code }, { status: google.status }),
    };
  }

  return { ok: false, response: new Response(null, { status: 401 }) };
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
  return Boolean(
    current.trashed ||
    current.headRevisionId !== row.opening_reel_head_revision_id ||
    current.modifiedTime !== row.opening_reel_drive_modified_time,
  );
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
  const auth = await authorize(request, show);
  if (!auth.ok) return auth.response;

  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data: row, error } = (await supabase
      .from("shows")
      .select(
        "published,opening_reel_drive_file_id,opening_reel_drive_modified_time,opening_reel_head_revision_id,opening_reel_mime_type",
      )
      .eq("id", show)
      .maybeSingle()) as { data: ReelRow | null; error: unknown };
    // Codex R2 P1: Supabase returned-error must NOT be collapsed into the
    // benign-absence 410 path — surface as 500 with the cataloged code per
    // AGENTS.md §1.9.
    if (error) {
      return NextResponse.json({ error: "REEL_ASSET_LOOKUP_FAILED" }, { status: 500 });
    }
    if (!row) {
      return gone();
    }
    // Published gate: non-admin viewers cannot reach assets on unpublished
    // shows. Matches the page-level gate at app/show/[slug]/page.tsx.
    if (!auth.isAdmin && row.published !== true) {
      return gone();
    }
    if (!hasUsablePin(row)) {
      return gone();
    }

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
      // md5 fallback path: buffer is unavoidable (we must hash the body
      // before serving), but we no-copy the response by handing the
      // buffered Uint8Array to a ReadableStream wrapper instead of an
      // extra ArrayBuffer allocation.
      const bytes = await boundedBytesFrom(data);
      if (!current.md5Checksum || md5Hex(bytes) !== current.md5Checksum) {
        return gone();
      }
      return new Response(webStreamFromBytes(bytes), {
        headers: {
          "Cache-Control": CACHE_CONTROL,
          "Content-Type": row.opening_reel_mime_type,
          "Content-Length": String(bytes.byteLength),
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
  return webStreamFromBytes(bytesFrom(data));
}
