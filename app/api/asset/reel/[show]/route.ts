import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { getDriveClient } from "@/lib/drive/client";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import { validateGoogleSession } from "@/lib/auth/validateGoogleSession";
import { validateLinkSession } from "@/lib/auth/validateLinkSession";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const CACHE_CONTROL = "private, max-age=0, must-revalidate";

type RouteContext = {
  params: Promise<{ show: string }>;
};

type ReelRow = {
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
};

type UsableReelRow = {
  opening_reel_drive_file_id: string;
  opening_reel_drive_modified_time: string;
  opening_reel_head_revision_id: string;
  opening_reel_mime_type: string;
};

type ReelDriveClient = {
  files: {
    get(args: { fileId: string; fields?: string; alt?: "media" }): Promise<{ data: unknown }>;
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

function responseBody(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function streamBody(data: unknown): BodyInit {
  if (data instanceof Readable) return Readable.toWeb(data) as ReadableStream;
  if (data instanceof ReadableStream) return data;
  return responseBody(bytesFrom(data));
}

async function authorize(request: NextRequest, showId: string): Promise<Response | null> {
  const admin = await isAdminSession(request);
  if (admin.ok) return null;
  if (admin.reason === "infra_error") {
    return NextResponse.json({ error: "ADMIN_SESSION_LOOKUP_FAILED" }, { status: 500 });
  }

  const link = await validateLinkSession(request, { showId });
  if (link.kind === "success") {
    return link.viewer.showId === showId ? null : new Response(null, { status: 403 });
  }
  if (link.kind === "terminal_failure") {
    return NextResponse.json({ error: link.code }, { status: link.status });
  }
  if (link.priorFailure?.status === 410) {
    return gone();
  }

  const google = await validateGoogleSession(request, { showId });
  if (google.kind === "success") {
    return google.viewer.showId === showId ? null : new Response(null, { status: 403 });
  }
  if (google.kind === "terminal_failure") {
    return NextResponse.json({ error: google.code }, { status: google.status });
  }

  return new Response(null, { status: 401 });
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

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { show } = await context.params;
  const rejected = await authorize(request, show);
  if (rejected) return rejected;

  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data: row, error } = (await supabase
      .from("shows")
      .select(
        "opening_reel_drive_file_id,opening_reel_drive_modified_time,opening_reel_head_revision_id,opening_reel_mime_type",
      )
      .eq("id", show)
      .maybeSingle()) as { data: ReelRow | null; error: unknown };
    if (error || !row || !hasUsablePin(row)) {
      return gone();
    }

    const drive = getDriveClient() as unknown as ReelDriveClient;
    const { data: current } = (await drive.files.get({
      fileId: row.opening_reel_drive_file_id,
      fields: "modifiedTime,trashed,headRevisionId,md5Checksum",
    })) as { data: DriveMetadata };
    if (drifted(row, current)) {
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
      return new Response(streamBody(data), {
        headers: {
          "Cache-Control": CACHE_CONTROL,
          "Content-Type": row.opening_reel_mime_type,
        },
      });
    } catch {
      const { data } = (await drive.files.get({
        fileId: row.opening_reel_drive_file_id,
        alt: "media",
      })) as { data: unknown };
      const bytes = bytesFrom(data);
      if (current.md5Checksum && md5Hex(bytes) !== current.md5Checksum) {
        return gone();
      }
      return new Response(responseBody(bytes), {
        headers: {
          "Cache-Control": CACHE_CONTROL,
          "Content-Type": row.opening_reel_mime_type,
        },
      });
    }
  } catch {
    return NextResponse.json({ error: "REEL_ASSET_LOOKUP_FAILED" }, { status: 500 });
  }
}
