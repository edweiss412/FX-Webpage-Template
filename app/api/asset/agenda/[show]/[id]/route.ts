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
 * Drive boundary: ONLY proxies files explicitly listed in the show's
 * `agenda_links` (binds `[id]` to `shows.agenda_links[*].fileId`). A
 * leaked admin URL cannot proxy arbitrary Drive content. Non-PDF MIMEs
 * return 410 — crew falls back to the "Open in Drive" affordance.
 *
 * Cache: `private, max-age=0, must-revalidate` so each fetch re-runs auth.
 */
import { NextResponse, type NextRequest } from "next/server";

import { getDriveClient } from "@/lib/drive/client";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import { validateGoogleSession } from "@/lib/auth/validateGoogleSession";
import { validateLinkSession } from "@/lib/auth/validateLinkSession";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const CACHE_CONTROL = "private, max-age=0, must-revalidate";
const PDF_MIME = "application/pdf";

// Drive file IDs are URL-safe base64-ish: alphanumeric + `_` + `-`, typically
// 28-44 chars. The pattern blocks path-traversal, query strings, and stray
// punctuation so an attacker can't reach beyond a valid file-id substring.
const DRIVE_FILE_ID_RE = /^[A-Za-z0-9_-]{10,128}$/;

type RouteContext = {
  params: Promise<{ show: string; id: string }>;
};

type AgendaShowRow = {
  id: string;
  agenda_links: { label?: string; fileId?: string; url?: string }[] | null;
};

type DriveMetadata = {
  mimeType?: string | null;
  trashed?: boolean | null;
};

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

function toUint8(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Buffer.isBuffer(data)) return new Uint8Array(data);
  if (typeof data === "string") return new TextEncoder().encode(data);
  return new Uint8Array();
}

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { show, id } = await context.params;

  if (!DRIVE_FILE_ID_RE.test(id)) {
    return gone();
  }

  const rejected = await authorize(request, show);
  if (rejected) return rejected;

  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = (await supabase
      .from("shows")
      .select("id,agenda_links")
      .eq("id", show)
      .maybeSingle()) as { data: AgendaShowRow | null; error: unknown };
    if (error) {
      return NextResponse.json({ error: "AGENDA_ASSET_LOOKUP_FAILED" }, { status: 500 });
    }
    if (!data) {
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
      const bytesResult = (await drive.files.get({ fileId: id, alt: "media" })) as {
        data: unknown;
      };
      const bytes = toUint8(bytesResult.data);
      if (bytes.byteLength === 0) {
        return gone();
      }
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return new Response(copy.buffer, {
        headers: {
          "Cache-Control": CACHE_CONTROL,
          "Content-Type": PDF_MIME,
        },
      });
    } catch (err) {
      if (isNotFound(err) || isPermissionDenied(err)) return gone();
      throw err;
    }
  } catch (err) {
    if (isPermissionDenied(err)) return gone();
    return NextResponse.json({ error: "AGENDA_ASSET_LOOKUP_FAILED" }, { status: 500 });
  }
}
