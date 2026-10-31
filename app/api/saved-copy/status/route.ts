/**
 * app/api/saved-copy/status/route.ts
 *
 * GET /api/saved-copy/status?show=<showId>&epoch=<n>&viewer=<key>&saved=<savedAt>
 * (spec 2026-10-26-crew-offline-saved-copy §4.5). The service worker asks it
 * one question before serving a saved copy in `ended` mode: would the crew page,
 * if this show were still live, resolve this request to the crew member the
 * copy was saved for, and has nothing but an archive happened to the show since
 * the copy was saved?
 *
 *   200 {"state":"ended"}  every lifecycle and identity condition holds;
 *   200 {"state":"gone"}   anything else, including malformed parameters,
 *                          which never reach the database;
 *   500 {"error":"SAVED_COPY_STATUS_LOOKUP_FAILED"}  an infra fault. The worker
 *                          reads any 500 as "no verdict" and keeps the copy;
 *                          the code is a log and wire code only, never
 *                          rendered (invariant 5).
 *
 * Every response is `Cache-Control: no-store`.
 *
 * Order: the parameters; the show row (lib/offline/statusLifecycle.ts); then
 * the page's own access checks after its lifecycle gates, in the page's order:
 * the admin session (an admin is never this crew member), then
 * resolveCrewIdentity, the function the page itself calls, with the picker
 * entry's epoch compared to the saved epoch instead of the row's current one.
 * The route restates none of that identity logic; the parity suite
 * (tests/auth/picker/savedCopyIdentityParity.test.ts) pins it to the page.
 *
 * GET only, so not an invariant-10 mutation surface. It never logs or returns
 * the share token or a crew member id.
 */
import { timingSafeEqual } from "node:crypto";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import { resolveCrewIdentity } from "@/lib/auth/picker/resolveCrewIdentity";
import { log } from "@/lib/log";
import { isIsoUtc } from "@/lib/offline/marker";
import { lifecycleAllowsEnded, type LifecycleRow } from "@/lib/offline/statusLifecycle";
import { viewerKey } from "@/lib/offline/viewerKey";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EPOCH_RE = /^\d+$/;

type StatusQuery = { showId: string; epoch: number; viewer: string; savedAtMs: number };

function parseQuery(url: URL): StatusQuery | null {
  const showId = url.searchParams.get("show");
  const epochText = url.searchParams.get("epoch");
  const viewer = url.searchParams.get("viewer");
  const saved = url.searchParams.get("saved");
  if (showId === null || !UUID_RE.test(showId)) return null;
  if (epochText === null || !EPOCH_RE.test(epochText)) return null;
  const epoch = Number(epochText);
  if (!Number.isSafeInteger(epoch)) return null;
  if (viewer === null || viewer === "") return null;
  // `saved` is the copy's savedAt, which is the marker's `data-rendered-at`, so it
  // passes the marker's own check: ISO 8601 UTC, refusing the implementation-defined
  // forms Date.parse also takes ("1", "2026", "Oct 21"), and naming a real instant,
  // so a February 30 that Date.parse would roll over to March answers like a
  // malformed time.
  if (saved === null || !isIsoUtc(saved)) return null;
  const savedAtMs = Date.parse(saved);
  return { showId, epoch, viewer, savedAtMs };
}

function answer(body: Record<string, string>, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

const ended = (): Response => answer({ state: "ended" });
const gone = (): Response => answer({ state: "gone" });

function lookupFailed(showId: string, site: string, detail?: unknown): Response {
  void log.error("saved-copy status lookup failed", {
    source: "api.saved-copy.status",
    code: "SAVED_COPY_STATUS_LOOKUP_FAILED",
    showId,
    site,
    ...(detail === undefined ? {} : { error: detail }),
  });
  return answer({ error: "SAVED_COPY_STATUS_LOOKUP_FAILED" }, 500);
}

/** Constant time over equal lengths; unequal lengths are simply unequal. */
function sameViewerKey(expected: string, presented: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(new URL(request.url));
  if (query === null) return gone();
  const { showId, epoch, viewer, savedAtMs } = query;

  let serviceRole: ReturnType<typeof createSupabaseServiceRoleClient>;
  try {
    serviceRole = createSupabaseServiceRoleClient();
  } catch (err) {
    return lookupFailed(showId, "service_role_client", err);
  }

  let row: LifecycleRow | null;
  try {
    const { data, error } = (await serviceRole
      .from("shows")
      .select("archived, picker_epoch, unpublished_at")
      .eq("id", showId)
      .maybeSingle()) as { data: LifecycleRow | null; error: unknown };
    if (error) return lookupFailed(showId, "show_read", error);
    row = data;
  } catch (err) {
    return lookupFailed(showId, "show_read_threw", err);
  }
  if (!lifecycleAllowsEnded(row, epoch, savedAtMs)) return gone();

  const admin = await isAdminSession(request);
  if (admin.ok) return gone();
  if (admin.reason === "infra_error") return lookupFailed(showId, "admin_session");

  const identity = await resolveCrewIdentity({
    showId,
    req: request,
    epochCheck: { kind: "saved", epoch },
    serviceRole,
  });
  // resolveCrewIdentity already warned with the failing boundary; this names the route.
  if (identity.kind === "infra_error") return lookupFailed(showId, "crew_identity");
  // needs_picker_bootstrap included: the page would redirect rather than render this viewer.
  if (identity.kind !== "resolved") return gone();

  const expected = viewerKey(showId, identity.crewMemberId);
  // Unreachable once the picker resolved (it read the same key), but a missing key is a server
  // fault, not a verdict about this viewer.
  if (expected === null) return lookupFailed(showId, "viewer_key");
  return sameViewerKey(expected, viewer) ? ended() : gone();
}
