import { NextResponse, type NextRequest } from "next/server";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import { validateGoogleSession } from "@/lib/auth/validateGoogleSession";
import { validateLinkSession } from "@/lib/auth/validateLinkSession";
import { resolveCurrentDiagrams } from "@/lib/data/diagrams";
import type { PersistedDiagrams } from "@/lib/parser/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CACHE_CONTROL = "private, max-age=0, must-revalidate";
const DIAGRAM_BUCKET = "diagram-snapshots";

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

type AuthorizeResult =
  | { ok: true; isAdmin: boolean }
  | { ok: false; response: Response };

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

export async function GET(
  request: NextRequest,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
  const { show, rev, key } = await context.params;

  if (rev.includes("=") || !UUID_RE.test(rev)) {
    return gone();
  }

  const auth = await authorize(request, show);
  if (!auth.ok) return auth.response;

  let showResult: { data: ShowRow | null; error: unknown };
  try {
    const supabase = createSupabaseServiceRoleClient();
    showResult = (await supabase
      .from("shows")
      .select("id,published,diagrams")
      .eq("id", show)
      .maybeSingle()) as { data: ShowRow | null; error: unknown };

    if (showResult.error) {
      return NextResponse.json({ error: "DIAGRAM_ASSET_LOOKUP_FAILED" }, { status: 500 });
    }
    if (!showResult.data) {
      return gone();
    }
    // Published gate: non-admin viewers cannot reach assets on unpublished
    // shows. Matches the page-level gate at app/show/[slug]/page.tsx.
    if (!auth.isAdmin && showResult.data.published !== true) {
      return gone();
    }

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

    const { data, error } = await supabase.storage.from(DIAGRAM_BUCKET).download(path);
    if (error) {
      if (isStorageNotFound(error)) return gone();
      return NextResponse.json({ error: "DIAGRAM_ASSET_LOOKUP_FAILED" }, { status: 500 });
    }
    if (!data) {
      return gone();
    }

    return new Response(data, {
      headers: {
        "Cache-Control": CACHE_CONTROL,
        "Content-Type": asset.mimeType,
      },
    });
  } catch {
    return NextResponse.json({ error: "DIAGRAM_ASSET_LOOKUP_FAILED" }, { status: 500 });
  }
}
