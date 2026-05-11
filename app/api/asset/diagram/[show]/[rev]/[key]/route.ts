import { NextResponse, type NextRequest } from "next/server";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import { validateGoogleSession } from "@/lib/auth/validateGoogleSession";
import { validateLinkSession } from "@/lib/auth/validateLinkSession";
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

type DiagramsPayload = PersistedDiagrams | { current?: PersistedDiagrams | null; pending?: unknown };

type ShowRow = {
  id: string;
  diagrams: DiagramsPayload | null;
};

type AssetEntry = {
  snapshotPath: string | null;
  mimeType: string;
};

function gone(): Response {
  return new Response(null, { status: 410 });
}

function currentDiagrams(diagrams: DiagramsPayload | null): PersistedDiagrams | null {
  if (!diagrams) return null;
  if ("snapshot_revision_id" in diagrams) return diagrams;
  return diagrams.current ?? null;
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
  const { show, rev, key } = await context.params;

  if (rev.includes("=") || !UUID_RE.test(rev)) {
    return gone();
  }

  const rejected = await authorize(request, show);
  if (rejected) return rejected;

  let showResult: { data: ShowRow | null; error: unknown };
  try {
    const supabase = createSupabaseServiceRoleClient();
    showResult = (await supabase
      .from("shows")
      .select("id,diagrams")
      .eq("id", show)
      .maybeSingle()) as { data: ShowRow | null; error: unknown };

    if (showResult.error || !showResult.data) {
      return gone();
    }

    const diagrams = currentDiagrams(showResult.data.diagrams);
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
    if (error || !data) {
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
