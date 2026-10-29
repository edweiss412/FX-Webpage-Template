/**
 * app/api/show/[slug]/search-miss/route.ts
 *
 * Records a crew show search that found nothing (crew show search spec §7.2). Telemetry only: the
 * one write is an app_events row through `log.info`, nothing here reaches the UI, and every
 * well-formed request answers 204 whatever happened, so the response tells the caller nothing
 * about the show or the viewer.
 *
 * Order, per spec §7.2:
 *   1. same-origin check;
 *   2. rate limit, BEFORE any parsing or database work. Every request that gets past it can reach
 *      the database, and so can every warning this route or the access helpers emit, so the
 *      limiter is what bounds both;
 *   3. JSON content type, then the body read with a 2 KB limit before parsing;
 *   4. the query, trimmed, 2 to 100 characters, longer cut to 100 code points;
 *   5. access, in the version route's order (app/api/show/[slug]/version/route.ts): the slug maps
 *      to a show id, an admin session is admitted and NOT logged, otherwise the picker cookie must
 *      resolve to a selection for this show. Only that crew viewer is logged;
 *   6. the emit: code, show id and query. No viewer identity, picker id, IP or user agent.
 *
 * The limiter is in-memory per server instance (spec §12 L7): one fixed 60 s window holds both
 * buckets, 120 admitted requests across all shows and 30 per slug. A slug gains a key only when a
 * request for it is admitted, and the map is dropped with the window, so it never holds more than
 * 120 keys. The window also carries the once-per-window flags for the two warnings.
 */
import type { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import { resolvePickerSelection } from "@/lib/auth/picker/resolvePickerSelection";
import { sameOrigin } from "@/lib/http/sameOrigin";
import { log } from "@/lib/log";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { bytesFromWebStream } from "@/lib/sync/boundedBytes";

const WINDOW_MS = 60_000;
const MAX_ADMITTED_PER_WINDOW = 120;
const MAX_ADMITTED_PER_SLUG_PER_WINDOW = 30;
const MAX_BODY_BYTES = 2048;
const MIN_QUERY_CHARS = 2;
const MAX_QUERY_CHARS = 100;

type RateWindow = {
  resetAt: number;
  admitted: number;
  admittedBySlug: Map<string, number>;
  cappedWarned: boolean;
  infraWarned: boolean;
};

let rateWindow: RateWindow | null = null;

export function __resetSearchMissStateForTests(): void {
  rateWindow = null;
}

function currentWindow(now: number): RateWindow {
  if (!rateWindow || now >= rateWindow.resetAt) {
    rateWindow = {
      resetAt: now + WINDOW_MS,
      admitted: 0,
      admittedBySlug: new Map(),
      cappedWarned: false,
      infraWarned: false,
    };
  }
  return rateWindow;
}

/** Admits the request into both buckets, or names the bucket it is over. A refused request
 * consumes neither bucket. */
function admit(rate: RateWindow, slug: string): "admitted" | "global" | "slug" {
  if (rate.admitted >= MAX_ADMITTED_PER_WINDOW) return "global";
  const forSlug = rate.admittedBySlug.get(slug) ?? 0;
  if (forSlug >= MAX_ADMITTED_PER_SLUG_PER_WINDOW) return "slug";
  rate.admitted += 1;
  rate.admittedBySlug.set(slug, forSlug + 1);
  return "admitted";
}

// Swallow both sync throws and async rejections from the best-effort log sink, awaited so the
// route never answers before the write resolves (the client-error route's pattern).
async function safeLog(fn: () => unknown): Promise<void> {
  try {
    await fn();
  } catch {
    /* ignore */
  }
}

function noContent(): Response {
  return new Response(null, { status: 204 });
}

function pickerCookieFromRequest(request: Request): string | undefined {
  const raw = request.headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === "__Host-fxav_picker") return valueParts.join("=");
  }
  return undefined;
}

/** Reads the body with the 2 KB limit and returns the trimmed, capped query, or null for anything
 * that is not a well-formed request. */
async function readQuery(request: Request): Promise<string | null> {
  if (request.headers.get("content-type")?.includes("application/json") !== true) return null;
  if (!request.body) return null;
  let text: string;
  try {
    // Throws ByteLimitExceededError past the limit, and a stream error on an aborted body; both
    // are a request this route will not read.
    text = new TextDecoder().decode(await bytesFromWebStream(request.body, MAX_BODY_BYTES));
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const raw = (parsed as Record<string, unknown>).query;
  if (typeof raw !== "string") return null;
  const query = raw.trim();
  if (query.length < MIN_QUERY_CHARS) return null;
  // Cut by code points, not UTF-16 units: a unit cut through an astral character leaves a lone
  // surrogate, which Postgres jsonb refuses.
  const codePoints = Array.from(query);
  return codePoints.length > MAX_QUERY_CHARS
    ? codePoints.slice(0, MAX_QUERY_CHARS).join("")
    : query;
}

type ShowLookup =
  | { kind: "found"; showId: string }
  | { kind: "unknown" }
  | { kind: "infra_error"; error: unknown };

async function showIdFromSlug(slug: string): Promise<ShowLookup> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = (await supabase
      .from("shows")
      .select("id")
      .eq("slug", slug)
      .maybeSingle()) as { data: { id: string } | null; error: unknown };
    if (error) return { kind: "infra_error", error };
    return data ? { kind: "found", showId: data.id } : { kind: "unknown" };
  } catch (error) {
    return { kind: "infra_error", error };
  }
}

type Access =
  | { kind: "crew"; showId: string }
  | { kind: "not_logged" }
  | { kind: "infra_error"; stage: "show_lookup" | "admin_session" | "picker"; error?: unknown };

async function resolveAccess(request: Request, slug: string): Promise<Access> {
  const show = await showIdFromSlug(slug);
  if (show.kind === "infra_error") {
    return { kind: "infra_error", stage: "show_lookup", error: show.error };
  }
  if (show.kind === "unknown") return { kind: "not_logged" };

  const admin = await isAdminSession(request);
  if (admin.ok) return { kind: "not_logged" };
  if (admin.reason === "infra_error") return { kind: "infra_error", stage: "admin_session" };

  const picker = await resolvePickerSelection({
    showId: show.showId,
    cookie: pickerCookieFromRequest(request),
  });
  if (picker.kind === "resolved") return { kind: "crew", showId: show.showId };
  if (picker.kind === "infra_error") return { kind: "infra_error", stage: "picker" };
  return { kind: "not_logged" };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });

  const { slug } = await context.params;
  const current = currentWindow(Date.now());
  const admission = admit(current, slug);
  if (admission !== "admitted") {
    if (!current.cappedWarned) {
      current.cappedWarned = true;
      await safeLog(() =>
        log.warn("crew search miss rate cap hit", {
          source: "crew-search-miss",
          code: "CREW_SEARCH_MISS_RATE_CAPPED",
          bucket: admission,
        }),
      );
    }
    return noContent();
  }

  const query = await readQuery(request);
  if (query === null) return new Response(null, { status: 400 });

  const access = await resolveAccess(request, slug);
  if (access.kind === "infra_error") {
    if (!current.infraWarned) {
      current.infraWarned = true;
      await safeLog(() =>
        log.warn("crew search miss access lookup failed", {
          source: "crew-search-miss",
          code: "CREW_SEARCH_MISS_INFRA_ERROR",
          stage: access.stage,
          ...(access.error !== undefined ? { error: access.error } : {}),
        }),
      );
    }
    return noContent();
  }
  if (access.kind === "not_logged") return noContent();

  await safeLog(() =>
    log.info("crew search found nothing", {
      source: "crew-search-miss",
      code: "CREW_SEARCH_NO_RESULTS",
      showId: access.showId,
      query,
    }),
  );
  return noContent();
}
