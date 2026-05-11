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
import { validateGoogleSession } from "@/lib/auth/validateGoogleSession";
import { validateLinkSession } from "@/lib/auth/validateLinkSession";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  ByteLimitExceededError,
  readBoundedNodeStream,
  readBoundedWebStream,
} from "@/lib/sync/boundedBytes";

const CACHE_CONTROL = "private, max-age=0, must-revalidate";
const PDF_MIME = "application/pdf";
const MAX_AGENDA_BYTES = 50 * 1024 * 1024;

// Drive file IDs are URL-safe base64-ish: alphanumeric + `_` + `-`, typically
// 28-44 chars. The pattern blocks path-traversal, query strings, and stray
// punctuation so an attacker can't reach beyond a valid file-id substring.
const DRIVE_FILE_ID_RE = /^[A-Za-z0-9_-]{10,128}$/;

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
};

type AuthorizeResult =
  | { ok: true; isAdmin: boolean }
  | { ok: false; response: Response };

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

async function bytesFromStream(data: unknown): Promise<Uint8Array> {
  if (data instanceof Readable) {
    return (await readBoundedNodeStream(data, MAX_AGENDA_BYTES)).bytes;
  }
  if (data instanceof ReadableStream) {
    return (await readBoundedWebStream(data, MAX_AGENDA_BYTES)).bytes;
  }
  if (data instanceof Uint8Array) {
    if (data.byteLength > MAX_AGENDA_BYTES) {
      throw new ByteLimitExceededError(MAX_AGENDA_BYTES);
    }
    return data;
  }
  if (data instanceof ArrayBuffer) {
    if (data.byteLength > MAX_AGENDA_BYTES) {
      throw new ByteLimitExceededError(MAX_AGENDA_BYTES);
    }
    return new Uint8Array(data);
  }
  if (Buffer.isBuffer(data)) {
    if (data.byteLength > MAX_AGENDA_BYTES) {
      throw new ByteLimitExceededError(MAX_AGENDA_BYTES);
    }
    return new Uint8Array(data);
  }
  if (typeof data === "string") {
    const bytes = new TextEncoder().encode(data);
    if (bytes.byteLength > MAX_AGENDA_BYTES) {
      throw new ByteLimitExceededError(MAX_AGENDA_BYTES);
    }
    return bytes;
  }
  return new Uint8Array();
}

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { show, id } = await context.params;

  if (!DRIVE_FILE_ID_RE.test(id)) {
    return gone();
  }

  const auth = await authorize(request, show);
  if (!auth.ok) return auth.response;

  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = (await supabase
      .from("shows")
      .select("id,published,agenda_links")
      .eq("id", show)
      .maybeSingle()) as { data: AgendaShowRow | null; error: unknown };
    if (error) {
      return NextResponse.json({ error: "AGENDA_ASSET_LOOKUP_FAILED" }, { status: 500 });
    }
    if (!data) {
      return gone();
    }
    // Published gate: non-admin viewers cannot reach assets on unpublished
    // shows. Matches the page-level gate at app/show/[slug]/page.tsx so
    // an admin draft never leaks through a still-valid crew cookie.
    if (!auth.isAdmin && data.published !== true) {
      return gone();
    }
    const matched = (data.agenda_links ?? []).some((entry) => entry.fileId === id);
    if (!matched) {
      return gone();
    }

    const drive = getDriveClient() as unknown as {
      files: {
        get(
          args: { fileId: string; fields?: string; alt?: "media" },
          options?: { responseType: "stream" },
        ): Promise<{ data: unknown }>;
      };
    };

    const metaResult = (await drive.files.get({
      fileId: id,
      fields: "mimeType,trashed",
    })) as { data: DriveMetadata };
    const meta = metaResult.data;
    if (meta.trashed || meta.mimeType !== PDF_MIME) {
      return gone();
    }

    try {
      const bytesResult = (await drive.files.get(
        { fileId: id, alt: "media" },
        { responseType: "stream" },
      )) as { data: unknown };
      const bytes = await bytesFromStream(bytesResult.data);
      if (bytes.byteLength === 0) {
        return gone();
      }
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      return new Response(buffer, {
        headers: {
          "Cache-Control": CACHE_CONTROL,
          "Content-Type": PDF_MIME,
          "Content-Length": String(bytes.byteLength),
        },
      });
    } catch (err) {
      if (err instanceof ByteLimitExceededError) return gone();
      if (isNotFound(err) || isPermissionDenied(err)) return gone();
      throw err;
    }
  } catch (err) {
    if (err instanceof ByteLimitExceededError) return gone();
    if (isPermissionDenied(err)) return gone();
    return NextResponse.json({ error: "AGENDA_ASSET_LOOKUP_FAILED" }, { status: 500 });
  }
}
