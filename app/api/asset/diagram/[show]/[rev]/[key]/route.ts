import { NextResponse, type NextRequest } from "next/server";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import { validateCrewAssetSession } from "@/lib/auth/validateCrewAssetSession";
import { resolveCurrentDiagrams } from "@/lib/data/diagrams";
import type { PersistedDiagrams } from "@/lib/parser/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { boundedPassThroughWeb, ByteLimitExceededError } from "@/lib/sync/boundedBytes";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CACHE_CONTROL = "private, max-age=0, must-revalidate";
const DIAGRAM_BUCKET = "diagram-snapshots";
// Codex R4 P2 close-out: route-level cap on the Storage object served.
// Diagrams persisted via Apply / asset_recovery already have per-asset
// caps upstream; this is defense-in-depth so a bucket drift / manual
// upload to the canonical prefix can never let an oversized object
// reach the client. 50MB is comfortably above the typical 1-5MB
// embedded image while still bounding worker memory.
const MAX_DIAGRAM_BYTES = 50 * 1024 * 1024;
// Codex R6 P1 close-out: same-origin active-content gate. SVG (and any
// XML/script-bearing image MIME) renders as a script surface when
// loaded as a top-level same-origin document. Drive can hand back any
// `image/*` MIME if a linked-folder file or embedded object is an SVG;
// whitelist only inert raster formats here. The persisted MIME is
// reflected into the Response — so we MUST reject before reflecting.
const ALLOWED_DIAGRAM_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

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
    // Codex R6 P1: MIME allowlist BEFORE serving. SVG (and any non-raster
    // image MIME) is rejected so the proxy cannot become a same-origin
    // active-content surface for a malicious Drive file.
    if (!ALLOWED_DIAGRAM_MIMES.has(asset.mimeType.toLowerCase())) {
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

    const fetchRes = await fetch(signed.data.signedUrl);
    if (!fetchRes.ok || !fetchRes.body) {
      if (fetchRes.status === 404) return gone();
      return NextResponse.json({ error: "DIAGRAM_ASSET_LOOKUP_FAILED" }, { status: 500 });
    }
    // Codex R4 P2 + R11 P1: route-level byte ceiling. Reject oversized
    // objects from the `Content-Length` pre-flight (still bounds before
    // any bytes flow) AND wrap the body stream in a bounded pass-
    // through so an oversized object whose size header is missing /
    // wrong still fails closed at the cap mid-stream.
    const declaredSize = Number(fetchRes.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_DIAGRAM_BYTES) {
      return gone();
    }
    const boundedBody = boundedPassThroughWeb(
      fetchRes.body as ReadableStream<Uint8Array>,
      MAX_DIAGRAM_BYTES,
    );
    return new Response(boundedBody, {
      headers: {
        "Cache-Control": CACHE_CONTROL,
        "Content-Type": asset.mimeType,
        // Defense-in-depth: browsers MUST NOT sniff the body and infer
        // a different MIME than the allowlisted raster type we asserted
        // above. Without this header a `.png` whose bytes look like
        // SVG could still be interpreted as XML.
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (caught) {
    if (caught instanceof ByteLimitExceededError) return gone();
    return NextResponse.json({ error: "DIAGRAM_ASSET_LOOKUP_FAILED" }, { status: 500 });
  }
}
