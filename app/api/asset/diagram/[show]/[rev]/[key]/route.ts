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

export async function GET(
  request: NextRequest,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
  const { show, rev, key } = await context.params;

  if (rev.includes("=") || !UUID_RE.test(rev)) {
    return gone();
  }

  // Codex R4 P1: admin check FIRST (no side effects).
  const admin = await isAdminSession(request);
  if (!admin.ok && admin.reason === "infra_error") {
    return NextResponse.json({ error: "ADMIN_SESSION_LOOKUP_FAILED" }, { status: 500 });
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
    return NextResponse.json({ error: "DIAGRAM_ASSET_LOOKUP_FAILED" }, { status: 500 });
  }
  if (showResult.error) {
    return NextResponse.json({ error: "DIAGRAM_ASSET_LOOKUP_FAILED" }, { status: 500 });
  }
  if (!showResult.data) {
    return gone();
  }
  // Codex R4 P1: published gate BEFORE link/google validators so an
  // unpublished-show request never refreshes link_sessions.last_active_at.
  if (!isAdmin && showResult.data.published !== true) {
    return gone();
  }
  if (!isAdmin) {
    const session = await validateCrewAssetSession(request, show);
    if (!session.ok) return session.response;
  }

  try {
    const diagrams = resolveCurrentDiagrams(showResult.data.diagrams);
    if (!diagrams || diagrams.snapshot_revision_id !== rev) {
      return gone();
    }

    const expectedPath = canonicalPath(show, rev, key);
    const asset = findAsset(diagrams, expectedPath);
    const path = asset?.snapshotPath ? objectPath(asset.snapshotPath) : null;
    if (!asset || !path) {
      return gone();
    }
    // Codex R6 P1 + R13 P1: shared allowlist from `lib/data/diagrams.ts`
    // so the page tile projection (DiagramsTile) and this route never
    // drift on which MIMEs are renderable. SVG (and any non-raster
    // image MIME) is rejected so the proxy cannot become a same-origin
    // active-content surface for a malicious Drive file.
    if (!isAllowedDiagramMime(asset.mimeType)) {
      return gone();
    }

    // Codex R11 P1: do NOT use `supabase.storage.from(...).download()` —
    // that materializes the whole Blob in memory BEFORE the byte
    // ceiling can run. Instead mint a short-lived signed URL (the
    // ledger row stays auth-gated by the route's own admin / link /
    // google chain above) and fetch it streaming so the byte ceiling
    // enforces during the fetch via `boundedPassThroughWeb`.
    const signed = await supabase.storage
      .from(DIAGRAM_BUCKET)
      .createSignedUrl(path, 60);
    if (signed.error) {
      if (isStorageNotFound(signed.error)) return gone();
      return NextResponse.json({ error: "DIAGRAM_ASSET_LOOKUP_FAILED" }, { status: 500 });
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
      return NextResponse.json({ error: "DIAGRAM_ASSET_LOOKUP_FAILED" }, { status: 500 });
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
    // Codex R21 P1: on a 206 response, `content-length` is only the
    // slice size — the FULL object size lives in `Content-Range: bytes
    // <s>-<e>/<total>`. Without this gate, a 60MB diagram could be
    // fetched 5MB at a time through repeated Range requests, defeating
    // the route-level 50MB cap. Parse the total and reject when it
    // exceeds the cap regardless of slice size.
    if (fetchRes.status === 206) {
      const cr = fetchRes.headers.get("content-range");
      if (cr) {
        const match = cr.match(/^bytes \d+-\d+\/(\d+)$/);
        if (match) {
          const total = Number(match[1]);
          if (Number.isFinite(total) && total > MAX_DIAGRAM_BYTES) {
            await fetchRes.body.cancel().catch(() => undefined);
            return gone();
          }
        }
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
    return NextResponse.json({ error: "DIAGRAM_ASSET_LOOKUP_FAILED" }, { status: 500 });
  }
}
