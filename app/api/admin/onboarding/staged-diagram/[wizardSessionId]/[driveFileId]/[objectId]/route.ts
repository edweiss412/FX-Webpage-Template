import { NextResponse } from "next/server";
import postgres from "postgres";
import { fetchCurrentSheetXlsxBytes } from "@/lib/drive/fetch";
import {
  hasStagedPreviewSource,
  isRenderableDiagramStub,
  isTrustedDiagramContentUrl,
} from "@/lib/admin/stagedDiagramGuards";
import { snapshotFetchEmbeddedImageBytesTimed } from "@/lib/sync/defaultSnapshotAssetsForApply";
import type { SnapshotAssetBytes } from "@/lib/sync/snapshotAssets";
import type { EmbeddedImageStub } from "@/lib/parser/types";

// Spec §B1 (2026-07-03-step3-modal-followups): admin-only, READ-ONLY preview
// of a staged embedded-diagram image. No shows row exists pre-finalize, so
// bytes are live-fetched from Drive via the snapshot pipeline's injectable
// helper; every failure (stale contentUrl, corrupt staged JSONB, unknown
// objectId, superseded session) is a fail-soft 404 the <img> onError
// placeholder absorbs. Advisory lock: N/A — read-only path (invariant 2
// applies to mutations only; spec §B1 declares this explicitly).
// not-subject-to-meta: postgres.js deps-injected read-only route, no
// supabase-js client (spec §B1).

export const STAGED_DIAGRAM_CACHE_SECONDS = 300;
export const STAGED_DIAGRAM_OBJECT_ID_MAX = 256;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DRIVE_FILE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const OBJECT_ID_PATTERN = new RegExp(`^[A-Za-z0-9_-]{1,${STAGED_DIAGRAM_OBJECT_ID_MAX}}$`);
const RASTER_MIME_ALLOWLIST = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export type StagedDiagramRouteDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  queryOne?: <T>(sqlText: string, params: unknown[]) => Promise<T | null>;
  fetchImageBytes?: (
    stub: EmbeddedImageStub,
    ctx: { driveFileId: string },
  ) => Promise<SnapshotAssetBytes | null>;
};

// Default fetchImageBytes binding for XLSX-media stubs (contentUrl null, spec
// §A2/§A3): the helper re-fetches the CURRENT sheet export for the VALIDATED
// route-param driveFileId (never a JSONB-derived URL — SSRF trust boundary)
// and extracts+fingerprint-matches the requested media part.
export function defaultStagedDiagramFetchImageBytes(
  stub: EmbeddedImageStub,
  ctx: { driveFileId: string },
): Promise<SnapshotAssetBytes | null> {
  return snapshotFetchEmbeddedImageBytesTimed(stub, {
    fetchXlsxBytes: () => fetchCurrentSheetXlsxBytes(ctx.driveFileId, {}),
  });
}

type RouteContext = {
  params: Promise<{ wizardSessionId: string; driveFileId: string; objectId: string }>;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("staged-diagram route requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

let _pool: ReturnType<typeof postgres> | null = null;
function defaultQueryOne<T>(sqlText: string, params: unknown[]): Promise<T | null> {
  _pool ??= postgres(databaseUrl(), { prepare: false });
  return _pool.unsafe(sqlText, params as never[]).then((rows) => (rows[0] as T) ?? null);
}

async function defaultRequireAdminIdentity(): Promise<{ email: string }> {
  const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
  return await requireAdminIdentity();
}

// 404/400 bodies deliberately carry NO code: the consumer is an <img> whose
// onError shows the placeholder, and status-discriminator strings would trip
// the §12.4 producer scan (tests/messages/catalog.test.ts). Auth failures keep
// their existing §12.4 codes (ADMIN_FORBIDDEN / ADMIN_SESSION_LOOKUP_FAILED).
function jsonError(status: number, code?: string): Response {
  return NextResponse.json(code === undefined ? { ok: false } : { ok: false, code }, { status });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function handleStagedDiagramGet(
  _request: Request,
  context: RouteContext,
  routeDeps: StagedDiagramRouteDeps = {},
): Promise<Response> {
  const requireIdentity = routeDeps.requireAdminIdentity ?? defaultRequireAdminIdentity;
  const queryOne = routeDeps.queryOne ?? defaultQueryOne;
  const fetchImageBytes = routeDeps.fetchImageBytes ?? defaultStagedDiagramFetchImageBytes;

  // Auth FIRST, mirroring the sibling unapprove route (unapprove/route.ts:127-133).
  try {
    await requireIdentity();
  } catch (error) {
    const code =
      typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") return jsonError(500, code as string);
    return jsonError(403, "ADMIN_FORBIDDEN");
  }

  const { wizardSessionId, driveFileId, objectId: rawObjectId } = await context.params;

  // Param validation — after auth, before any route-owned DB query (spec §B1).
  // Malformed wizardSessionId/driveFileId → controlled 404 (never a Postgres
  // invalid-UUID 500); malformed objectId → 400 (§K7 shapes).
  if (!UUID_PATTERN.test(wizardSessionId)) return jsonError(404);
  if (!DRIVE_FILE_ID_PATTERN.test(driveFileId)) return jsonError(404);
  let objectId: string;
  try {
    objectId = decodeURIComponent(rawObjectId);
  } catch {
    return jsonError(400);
  }
  if (!OBJECT_ID_PATTERN.test(objectId)) return jsonError(400);

  // Row lookup — mirrors the unapprove route's active-session guard
  // (unapprove/route.ts:80-92): pending_syncs.wizard_session_id +
  // app_settings.pending_wizard_session_id (there is NO
  // pending_wizard_session_id column on pending_syncs).
  const row = await queryOne<{ parse_result: unknown }>(
    `
      select parse_result
        from public.pending_syncs
       where drive_file_id = $1
         and wizard_session_id = $2::uuid
         and exists (
           select 1 from public.app_settings
            where id = 'default'
              and pending_wizard_session_id = $2::uuid
         )
    `,
    [driveFileId, wizardSessionId],
  );
  if (!row) return jsonError(404);

  // parse_result is UNTRUSTED JSONB (legacy double-encoded/corrupt rows exist —
  // lib/sync/applyStaged.ts:443-459). Container-level shape checks; any
  // malformed container → 404, never a 500.
  const pr = row.parse_result;
  if (!isPlainObject(pr)) return jsonError(404);
  const diagrams = pr.diagrams;
  if (!isPlainObject(diagrams)) return jsonError(404);
  const images = diagrams.embeddedImages;
  if (!Array.isArray(images)) return jsonError(404);

  // Element-level: malformed elements are skipped during matching (an
  // unaddressable stub is a 404 like any unknown objectId). First match wins.
  const stub = images.find(
    (el): el is EmbeddedImageStub => isRenderableDiagramStub(el) && el.objectId === objectId,
  );
  if (!stub) return jsonError(404);

  // Raster allowlist — no SVG (inline-SVG XSS), checked before any Drive call.
  if (!RASTER_MIME_ALLOWLIST.has(stub.mimeType)) return jsonError(404);

  if (stub.contentUrl == null) {
    // XLSX-media entry: addressable only via mediaPartName + non-null fingerprint
    // (spec §A2 hasStagedPreviewSource); the helper re-fetches the current export
    // for the VALIDATED route-param driveFileId — no JSONB-derived URL is fetched
    // (spec §A3 trust boundary).
    if (!hasStagedPreviewSource(stub)) return jsonError(404);
  } else if (!isTrustedDiagramContentUrl(stub.contentUrl)) {
    return jsonError(404);
  }

  // Byte fetch: the helper returns null for non-ok/no-body/stall-timeout but
  // RETHROWS other errors (defaultSnapshotAssetsForApply.ts:60-77) — the route
  // maps ANY throw to 404 (fail-soft lives at the route boundary).
  let result: SnapshotAssetBytes | null;
  try {
    result = await fetchImageBytes(stub, { driveFileId });
  } catch {
    result = null;
  }
  if (result === null) return jsonError(404);
  // Union normalization: Uint8Array | BoundedByteResult (lib/sync/snapshotAssets.ts:30).
  const payload = result instanceof Uint8Array ? result : result.bytes;

  return new Response(Buffer.from(payload), {
    status: 200,
    headers: {
      "Content-Type": stub.mimeType,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Cache-Control": `private, max-age=${STAGED_DIAGRAM_CACHE_SECONDS}`,
      "Content-Length": String(payload.byteLength),
    },
  });
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return await handleStagedDiagramGet(request, context);
}
