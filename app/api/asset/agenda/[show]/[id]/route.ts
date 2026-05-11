/**
 * app/api/asset/agenda/[show]/[id]/route.ts (M7 Task 7.9, AC-7.1)
 *
 * Proxy route for agenda PDF bytes — the crew page's AgendaEmbed (PDF.js
 * viewer) fetches `/api/asset/agenda/<show>/<driveFileId>` and renders the
 * bytes inline. The route mirrors the diagram + reel routes' three-branch
 * auth chain and revalidation contract.
 *
 * Authorization: admin OR redeemed-link session bound to this show OR
 * Google session bound to this show. Cross-show viewer → 403. Revoked link
 * → 410. Otherwise 401.
 *
 * Published gate (Codex R1 P1): non-admin viewers cannot reach assets on
 * unpublished shows — same gate `app/show/[slug]/page.tsx` enforces before
 * running side-effecting validators. Admin viewers continue to see drafts.
 *
 * Drive boundary: ONLY proxies files explicitly listed in the show's
 * `agenda_links` (binds `[id]` to `shows.agenda_links[*].fileId`). A
 * leaked admin URL cannot proxy arbitrary Drive content. Non-PDF MIMEs
 * return 410 — crew falls back to the "Open in Drive" affordance.
 *
 * Streaming + byte ceiling (Codex R1 P2): bytes flow through Drive's
 * stream into the Response body. A 50MB ceiling guards against a
 * pathological or hostile upload exhausting the serverless memory budget;
 * crew never see a working PDF over that size at render time and the
 * route fails closed.
 *
 * Cache: `private, max-age=0, must-revalidate` so each fetch re-runs auth.
 */
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";

import { getDriveClient } from "@/lib/drive/client";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import { validateCrewAssetSession } from "@/lib/auth/validateCrewAssetSession";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  ByteLimitExceededError,
  boundedPassThroughWeb,
  boundedWebStreamFromNode,
  webStreamFromBytes,
} from "@/lib/sync/boundedBytes";

const CACHE_CONTROL = "private, max-age=0, must-revalidate";
const PDF_MIME = "application/pdf";
const MAX_AGENDA_BYTES = 50 * 1024 * 1024;

// Drive file IDs are URL-safe base64-ish: alphanumeric + `_` + `-`, typically
// 28-44 chars. The pattern blocks path-traversal, query strings, and stray
// punctuation so an attacker can't reach beyond a valid file-id substring.
const DRIVE_FILE_ID_RE = /^[A-Za-z0-9_-]{10,128}$/;

// Codex R16 P1 + R17 P2: single-range only. Two valid shapes:
//   - `bytes=<start>-<optional end>`
//   - `bytes=-<suffix>` (last N bytes; PDF.js may use this)
// Multi-range / malformed → 416.
const SINGLE_RANGE_RE = /^bytes=(?:\d+-\d*|-\d+)$/;

function pickStringHeader(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

type RouteContext = {
  params: Promise<{ show: string; id: string }>;
};

type AgendaShowRow = {
  id: string;
  published: boolean | null;
  agenda_links: { label?: string; fileId?: string; url?: string }[] | null;
};

type DriveMetadata = {
  mimeType?: string | null;
  trashed?: boolean | null;
  /**
   * Drive-reported file size in bytes (as a string per Drive v3 API).
   * Used for the pre-flight size gate so an oversized PDF never starts
   * streaming.
   */
  size?: string | null;
};

function bytesFromInputData(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Buffer.isBuffer(data)) return new Uint8Array(data);
  if (typeof data === "string") return new TextEncoder().encode(data);
  return new Uint8Array();
}

function pdfStreamFromInput(data: unknown): ReadableStream<Uint8Array> {
  if (data instanceof Readable) {
    return boundedWebStreamFromNode(data, MAX_AGENDA_BYTES);
  }
  if (data instanceof ReadableStream) {
    return boundedPassThroughWeb(data as ReadableStream<Uint8Array>, MAX_AGENDA_BYTES);
  }
  const bytes = bytesFromInputData(data);
  if (bytes.byteLength > MAX_AGENDA_BYTES) {
    throw new ByteLimitExceededError(MAX_AGENDA_BYTES);
  }
  return webStreamFromBytes(bytes);
}

function gone(): Response {
  return new Response(null, { status: 410, headers: { "Cache-Control": CACHE_CONTROL } });
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

function isNotFound(error: unknown): boolean {
  const candidate = error as { code?: unknown; status?: unknown };
  return candidate.code === 404 || candidate.status === 404;
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

// Mirrors the reel route's parser. Two valid shapes: `bytes=N-M?` and
// `bytes=-N`. Used for pre-flight size-aware unsatisfiability checks
// so a syntactically valid but out-of-range request returns 416
// BEFORE we call Drive (avoiding the Drive-416 → 500 mapping that
// Codex R18 flagged).
function parseSingleRangeAgenda(
  header: string,
  totalBytes: number,
): "unsatisfiable" | { start: number; end: number } | null {
  if (!SINGLE_RANGE_RE.test(header)) return null;
  const suffixMatch = header.match(/^bytes=-(\d+)$/);
  if (suffixMatch) {
    const suffix = Number(suffixMatch[1]);
    if (!Number.isFinite(suffix) || suffix <= 0) return "unsatisfiable";
    if (totalBytes === 0) return "unsatisfiable";
    return { start: Math.max(0, totalBytes - suffix), end: totalBytes - 1 };
  }
  const matched = header.match(/^bytes=(\d+)-(\d*)$/);
  if (!matched) return null;
  const start = Number(matched[1]);
  const end = matched[2] ? Number(matched[2]) : totalBytes - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= totalBytes) return "unsatisfiable";
  return { start, end: Math.min(end, totalBytes - 1) };
}

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { show, id } = await context.params;

  if (!DRIVE_FILE_ID_RE.test(id)) {
    return gone();
  }

  // Codex R4 P1: admin check FIRST (no side effects).
  const admin = await isAdminSession(request);
  if (!admin.ok && admin.reason === "infra_error") {
    return NextResponse.json({ error: "ADMIN_SESSION_LOOKUP_FAILED" }, { status: 500 });
  }
  const isAdmin = admin.ok;

  let supabase: ReturnType<typeof createSupabaseServiceRoleClient>;
  let lookup: { data: AgendaShowRow | null; error: unknown };
  try {
    supabase = createSupabaseServiceRoleClient();
    lookup = (await supabase
      .from("shows")
      .select("id,published,agenda_links")
      .eq("id", show)
      .maybeSingle()) as { data: AgendaShowRow | null; error: unknown };
  } catch {
    return NextResponse.json({ error: "AGENDA_ASSET_LOOKUP_FAILED" }, { status: 500 });
  }
  if (lookup.error) {
    return NextResponse.json({ error: "AGENDA_ASSET_LOOKUP_FAILED" }, { status: 500 });
  }
  const data = lookup.data;
  if (!data) {
    return gone();
  }
  // Codex R4 P1: published gate BEFORE link/google validators so an
  // unpublished-show request never refreshes link_sessions.last_active_at.
  if (!isAdmin && data.published !== true) {
    return gone();
  }
  if (!isAdmin) {
    const session = await validateCrewAssetSession(request, show);
    if (!session.ok) return session.response;
  }

  try {
    const matched = (data.agenda_links ?? []).some((entry) => entry.fileId === id);
    if (!matched) {
      return gone();
    }

    const drive = getDriveClient() as unknown as {
      files: {
        get(
          args: {
            fileId: string;
            fields?: string;
            alt?: "media";
            supportsAllDrives?: boolean;
          },
          options?: {
            responseType: "stream";
            headers?: Record<string, string>;
          },
        ): Promise<{
          data: unknown;
          status?: number;
          headers?: Record<string, string | string[] | undefined>;
        }>;
      };
    };

    // Codex R14 P1: `supportsAllDrives: true` so files in Shared Drives
    // (the same surface M6 sync uses for show sheets) resolve instead
    // of returning 404 here.
    const metaResult = (await drive.files.get({
      fileId: id,
      fields: "mimeType,trashed,size",
      supportsAllDrives: true,
    })) as { data: DriveMetadata };
    const meta = metaResult.data;
    if (meta.trashed || meta.mimeType !== PDF_MIME) {
      return gone();
    }
    // Codex R2 P1: pre-flight size gate before initiating the stream.
    // Drive reports `size` as a string on binary files; reject before
    // any byte fetch so an oversized PDF never starts flowing.
    const reportedSize = meta.size != null ? Number(meta.size) : NaN;
    if (Number.isFinite(reportedSize) && reportedSize > MAX_AGENDA_BYTES) {
      return gone();
    }

    // Codex R16 P1: parse + forward Range. PDF.js issues Range
    // requests for incremental loading; without 206, mobile clients
    // pull the full PDF on every load.
    const rangeHeader = request.headers.get("range");
    if (rangeHeader && !SINGLE_RANGE_RE.test(rangeHeader)) {
      return rangeNotSatisfiable(Number.isFinite(reportedSize) ? reportedSize : null);
    }
    // Codex R18 P1: pre-flight Range against the known size so a
    // syntactically valid but unsatisfiable range (`bytes=-0`,
    // start≥size, start>end) returns 416 BEFORE we call Drive — and
    // we don't end up mapping a Drive 416 into a 500.
    if (rangeHeader && Number.isFinite(reportedSize)) {
      const parsed = parseSingleRangeAgenda(rangeHeader, reportedSize);
      if (parsed === "unsatisfiable") {
        return rangeNotSatisfiable(reportedSize);
      }
    }

    try {
      const driveOpts: {
        responseType: "stream";
        headers?: Record<string, string>;
      } = { responseType: "stream" };
      if (rangeHeader) driveOpts.headers = { Range: rangeHeader };
      const bytesResult = await drive.files.get(
        { fileId: id, alt: "media", supportsAllDrives: true },
        driveOpts,
      );
      // Codex R2 P2: stream straight through with a bounded passthrough.
      // No buffering, no double-copy. The Response body is a Web stream
      // backed by the Drive Node stream wrapped in a byte-limit
      // transform; oversized payloads fail closed mid-stream.
      const stream = pdfStreamFromInput(bytesResult.data);
      const headers: Record<string, string> = {
        "Cache-Control": CACHE_CONTROL,
        "Content-Type": PDF_MIME,
        // Codex R8 P2: nosniff so the browser does NOT sniff the body
        // and reinterpret it as something other than application/pdf.
        // Parity with the diagram + reel asset routes.
        "X-Content-Type-Options": "nosniff",
        // Codex R16 P1: advertise Range support on every success
        // response so PDF.js + browser video clients know subsequent
        // fetches may use Range.
        "Accept-Ranges": "bytes",
      };
      // Drive's response carries Content-Range / Content-Length on 206
      // partials and Content-Length on full 200s. Forward verbatim
      // when present so the client knows the exact byte slice.
      const contentRange = pickStringHeader(bytesResult.headers, "content-range");
      const driveContentLength = pickStringHeader(bytesResult.headers, "content-length");
      if (contentRange) headers["Content-Range"] = contentRange;
      if (driveContentLength) {
        headers["Content-Length"] = driveContentLength;
      } else if (Number.isFinite(reportedSize)) {
        headers["Content-Length"] = String(reportedSize);
      }
      const driveStatus = typeof bytesResult.status === "number" ? bytesResult.status : 200;
      return new Response(stream, { status: driveStatus, headers });
    } catch (err) {
      if (err instanceof ByteLimitExceededError) return gone();
      // Codex R18 P1: Drive 416 means the requested Range is
      // unsatisfiable. Return 416 to the client (with size context if
      // we have it from the metadata pre-flight) — NOT a 500.
      if (isRangeNotSatisfiable(err)) {
        return rangeNotSatisfiable(Number.isFinite(reportedSize) ? reportedSize : null);
      }
      if (isNotFound(err) || isPermissionDenied(err)) return gone();
      throw err;
    }
  } catch (err) {
    if (err instanceof ByteLimitExceededError) return gone();
    if (isPermissionDenied(err)) return gone();
    if (isRangeNotSatisfiable(err)) {
      return rangeNotSatisfiable(null);
    }
    return NextResponse.json({ error: "AGENDA_ASSET_LOOKUP_FAILED" }, { status: 500 });
  }
}
