import { NextResponse, type NextRequest } from "next/server";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import { validateCrewAssetSession } from "@/lib/auth/validateCrewAssetSession";
import { isAllowedDiagramMime, resolveCurrentDiagrams } from "@/lib/data/diagrams";
import type { PersistedDiagrams } from "@/lib/parser/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { boundedPassThroughWeb, ByteLimitExceededError } from "@/lib/sync/boundedBytes";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CACHE_CONTROL = "private, max-age=0, must-revalidate";
const DIAGRAM_BUCKET = "diagram-snapshots";
// Codex R17 P1: single-range only. Two valid shapes (RFC 7233):
//   - `bytes=<start>-<optional end>`
//   - `bytes=-<suffix>` (last N bytes)
// Multi-range / malformed → 416.
const SINGLE_RANGE_RE = /^bytes=(?:\d+-\d*|-\d+)$/;
// Codex R4 P2 close-out: route-level cap on the Storage object served.
// Diagrams persisted via Apply / asset_recovery already have per-asset
// caps upstream; this is defense-in-depth so a bucket drift / manual
// upload to the canonical prefix can never let an oversized object
// reach the client. 50MB is comfortably above the typical 1-5MB
// embedded image while still bounding worker memory.
const MAX_DIAGRAM_BYTES = 50 * 1024 * 1024;
type RouteParams = {
  show: string;
  rev: string;
  key: string;
};

type ShowRow = {
  id: string;
  published: boolean | null;
  diagrams: unknown;
};

type AssetEntry = {
  snapshotPath: string | null;
  mimeType: string;
};

function gone(): Response {
  return new Response(null, { status: 410, headers: { "Cache-Control": CACHE_CONTROL } });
}

// Codex R23 P2: every error shape carries the same private-revalidate
// Cache-Control as success/410 — auth and infra failures MUST NOT be
// cached by a private intermediary (browser HTTP cache, service worker).
function infraError(code: string): Response {
  return NextResponse.json(
    { error: code },
    { status: 500, headers: { "Cache-Control": CACHE_CONTROL } },
  );
}

function canonicalPath(showId: string, rev: string, key: string): string {
  return `${DIAGRAM_BUCKET}/shows/${showId}/${rev}/${key}`;
}

function objectPath(storagePath: string): string | null {
  const prefix = `${DIAGRAM_BUCKET}/`;
  if (!storagePath.startsWith(prefix)) return null;
  return storagePath.slice(prefix.length);
}

function findAsset(diagrams: PersistedDiagrams, expectedPath: string): AssetEntry | null {
  for (const entry of [...diagrams.embeddedImages, ...diagrams.linkedFolderItems]) {
    if (entry.snapshotPath === expectedPath) {
      return { snapshotPath: entry.snapshotPath, mimeType: entry.mimeType };
    }
  }
  return null;
}

function isStorageNotFound(error: unknown): boolean {
  const candidate = error as { statusCode?: unknown; status?: unknown; message?: unknown };
  return (
    candidate.statusCode === 404 ||
    candidate.status === 404 ||
    (typeof candidate.message === "string" &&
      /not found|not exist|no such/i.test(candidate.message))
  );
}

type DiagramAuthSuccess = {
  ok: true;
  asset: AssetEntry;
  storageObjectPath: string;
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>;
};

// Codex R23 P2: auth + lookup phase shared between GET and the explicit
// HEAD handler so HEAD returns the same admin/link/google decisions as
// GET would, without falling through to Next's default
// HEAD-via-GET implementation (which would open the upstream Supabase
// Storage media stream just to discard the body). The function does NOT
// call createSignedUrl — that's GET-only since HEAD has no body.
async function authorizeDiagramRequest(
  request: NextRequest,
  params: RouteParams,
): Promise<DiagramAuthSuccess | { ok: false; response: Response }> {
  const { show, rev, key } = params;
  if (rev.includes("=") || !UUID_RE.test(rev)) {
    return { ok: false, response: gone() };
  }

  const admin = await isAdminSession(request);
  if (!admin.ok && admin.reason === "infra_error") {
    return { ok: false, response: infraError("ADMIN_SESSION_LOOKUP_FAILED") };
  }
  const isAdmin = admin.ok;

  let supabase: ReturnType<typeof createSupabaseServiceRoleClient>;
  let showResult: { data: ShowRow | null; error: unknown };
  try {
    supabase = createSupabaseServiceRoleClient();
    showResult = (await supabase
      .from("shows")
      .select("id,published,diagrams")
      .eq("id", show)
      .maybeSingle()) as { data: ShowRow | null; error: unknown };
  } catch {
    return { ok: false, response: infraError("DIAGRAM_ASSET_LOOKUP_FAILED") };
  }
  if (showResult.error) {
    return { ok: false, response: infraError("DIAGRAM_ASSET_LOOKUP_FAILED") };
  }
  if (!showResult.data) {
    return { ok: false, response: gone() };
  }
  if (!isAdmin && showResult.data.published !== true) {
    return { ok: false, response: gone() };
  }
  if (!isAdmin) {
    const session = await validateCrewAssetSession(request, show);
    if (!session.ok) return { ok: false, response: session.response };
  }

  const diagrams = resolveCurrentDiagrams(showResult.data.diagrams);
  if (!diagrams || diagrams.snapshot_revision_id !== rev) {
    return { ok: false, response: gone() };
  }
  const expectedPath = canonicalPath(show, rev, key);
  const asset = findAsset(diagrams, expectedPath);
  const storageObjectPath = asset?.snapshotPath ? objectPath(asset.snapshotPath) : null;
  if (!asset || !storageObjectPath) {
    return { ok: false, response: gone() };
  }
  if (!isAllowedDiagramMime(asset.mimeType)) {
    return { ok: false, response: gone() };
  }

  return { ok: true, asset, storageObjectPath, supabase };
}

// Codex R23 P2: explicit HEAD handler. Without this, Next's App Router
// auto-implements HEAD by running GET and stripping the body — which
// runs the full Supabase Storage signed-URL + fetch + stream open just
// to discard the bytes. HEAD now returns metadata-only headers after
// the same auth chain.
export async function HEAD(
  request: NextRequest,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
  const params = await context.params;
  const authz = await authorizeDiagramRequest(request, params);
  if (!authz.ok) return authz.response;

  // RFC 9110 §14.1.2: malformed Range MAY be ignored (treated as full),
  // but route policy is to reject so GET and HEAD behave identically.
  const rangeHeader = request.headers.get("range");
  if (rangeHeader && !SINGLE_RANGE_RE.test(rangeHeader)) {
    return new Response(null, {
      status: 416,
      headers: {
        "Accept-Ranges": "bytes",
        "Cache-Control": CACHE_CONTROL,
      },
    });
  }

  return new Response(null, {
    status: 200,
    headers: {
      "Cache-Control": CACHE_CONTROL,
      "Content-Type": authz.asset.mimeType,
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "bytes",
      Vary: "Range",
    },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
  const params = await context.params;
  const authz = await authorizeDiagramRequest(request, params);
  if (!authz.ok) return authz.response;
  const { asset, storageObjectPath, supabase } = authz;

  try {
    const signed = await supabase.storage
      .from(DIAGRAM_BUCKET)
      .createSignedUrl(storageObjectPath, 60);
    if (signed.error) {
      if (isStorageNotFound(signed.error)) return gone();
      return infraError("DIAGRAM_ASSET_LOOKUP_FAILED");
    }
    if (!signed.data?.signedUrl) {
      return gone();
    }

    // Codex R17 P1: parse + forward Range. Crew clients may issue
    // Range for resumable downloads of large diagram bytes; the prior
    // implementation always returned 200, defeating the proxy's Range
    // discipline pinned for reel + agenda.
    const rangeHeader = request.headers.get("range");
    if (rangeHeader && !SINGLE_RANGE_RE.test(rangeHeader)) {
      return new Response(null, {
        status: 416,
        headers: { "Accept-Ranges": "bytes", "Cache-Control": CACHE_CONTROL },
      });
    }

    const fetchHeaders: HeadersInit = rangeHeader ? { Range: rangeHeader } : {};
    const fetchRes = await fetch(signed.data.signedUrl, { headers: fetchHeaders });
    if (!fetchRes.ok || !fetchRes.body) {
      // Codex R13 P1: cancel the upstream body on early return so the
      // Supabase Storage socket is released instead of left to GC.
      await fetchRes.body?.cancel().catch(() => undefined);
      if (fetchRes.status === 404) return gone();
      if (fetchRes.status === 416) {
        // Codex R20 P2: forward upstream Content-Range on 416. Clients
        // use `bytes */N` to recover from stale / overlarge range
        // requests; dropping it forces them to re-request a full
        // object just to learn the byte count.
        const upstreamRange = fetchRes.headers.get("content-range");
        const headers: Record<string, string> = {
          "Accept-Ranges": "bytes",
          "Cache-Control": CACHE_CONTROL,
        };
        if (upstreamRange) headers["Content-Range"] = upstreamRange;
        return new Response(null, { status: 416, headers });
      }
      return infraError("DIAGRAM_ASSET_LOOKUP_FAILED");
    }
    // Codex R4 P2 + R11 P1: route-level byte ceiling. Reject oversized
    // objects from the `Content-Length` pre-flight (still bounds before
    // any bytes flow) AND wrap the body stream in a bounded pass-
    // through so an oversized object whose size header is missing /
    // wrong still fails closed at the cap mid-stream.
    const declaredSize = Number(fetchRes.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_DIAGRAM_BYTES) {
      // Codex R13 P1: cancel upstream body when oversized pre-flight
      // rejects — no bytes have flowed yet but the response was opened.
      await fetchRes.body.cancel().catch(() => undefined);
      return gone();
    }
    // Codex R21 P1 + R23 P1: on a 206 response, `content-length` is
    // only the slice size — the FULL object size lives in
    // `Content-Range: bytes <s>-<e>/<total>`. Without this gate, a 60MB
    // diagram could be fetched 5MB at a time through repeated Range
    // requests, defeating the route-level 50MB cap.
    //
    // R23 P1 hardening: the original guard only rejected when
    // Content-Range matched the numeric-total regex AND total > cap.
    // RFC 7233 / 9110 §14.4 allows `Content-Range: bytes <s>-<e>/*`
    // (unknown total), and a misbehaving upstream may omit the header
    // entirely or send a malformed value — in any of those cases the
    // old code silently fell through and served the slice. For a
    // route-level cap to be a real ceiling, fail-closed unless we can
    // affirmatively prove total <= cap. Cancel the upstream body to
    // release the socket and return 410.
    if (fetchRes.status === 206) {
      const cr = fetchRes.headers.get("content-range");
      const match = cr ? cr.match(/^bytes \d+-\d+\/(\d+)$/) : null;
      const total = match ? Number(match[1]) : NaN;
      if (!Number.isFinite(total) || total > MAX_DIAGRAM_BYTES) {
        await fetchRes.body.cancel().catch(() => undefined);
        return gone();
      }
    }
    const boundedBody = boundedPassThroughWeb(
      fetchRes.body as ReadableStream<Uint8Array>,
      MAX_DIAGRAM_BYTES,
    );
    // Pass through upstream status (200 or 206) and the Content-Range /
    // Content-Length headers Supabase Storage emits on partial responses.
    const responseHeaders: Record<string, string> = {
      "Cache-Control": CACHE_CONTROL,
      "Content-Type": asset.mimeType,
      // Defense-in-depth: browsers MUST NOT sniff the body and infer
      // a different MIME than the allowlisted raster type we asserted
      // above. Without this header a `.png` whose bytes look like
      // SVG could still be interpreted as XML.
      "X-Content-Type-Options": "nosniff",
      // Codex R17 P1: advertise Range support on every success so
      // clients know subsequent fetches may use Range.
      "Accept-Ranges": "bytes",
      // Codex R23 P2: same URL serves both 200 and 206 depending on
      // the `Range` request header; an HTTP cache (even a private
      // one) MUST key responses on Range to avoid serving a 206 slice
      // to a later request that did NOT send Range. Per RFC 9111 §4.1.
      Vary: "Range",
    };
    const upstreamContentRange = fetchRes.headers.get("content-range");
    const upstreamContentLength = fetchRes.headers.get("content-length");
    if (upstreamContentRange) responseHeaders["Content-Range"] = upstreamContentRange;
    if (upstreamContentLength) responseHeaders["Content-Length"] = upstreamContentLength;
    return new Response(boundedBody, {
      status: fetchRes.status === 206 ? 206 : 200,
      headers: responseHeaders,
    });
  } catch (caught) {
    if (caught instanceof ByteLimitExceededError) return gone();
    return infraError("DIAGRAM_ASSET_LOOKUP_FAILED");
  }
}
