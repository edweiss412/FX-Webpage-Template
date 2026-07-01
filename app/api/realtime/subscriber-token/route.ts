/**
 * app/api/realtime/subscriber-token/route.ts (M4 Task 4.16 routes)
 *
 * Mints a short-lived JWT that the client island
 * (`<ShowRealtimeBridge>` — Checkpoint B) passes to
 * supabase.realtime.setAuth(jwt) before opening the
 * `show:<id>:invalidation` Broadcast channel.
 *
 * Auth: derive show_id from body.slug, then authorize via admin session or
 * picker cookie.
 *   - denied    → 401 SHOW_REALTIME_BROADCAST_AUTH_FAILED
 *   - forbidden → 403 SHOW_REALTIME_CROSS_SHOW_FORBIDDEN
 *   - admin → mint + 200.
 *
 * JWT claim shape (EXACT, per plan 03-04-tiles.md:725-830):
 *   { show_id, sub, exp, iss, role: 'authenticated', viewer_kind }
 *
 * - sub = '<admin>' for admin. Picker-auth D-series routes replace the old
 *   crew-session mint path.
 * - exp = now + 5 minutes (stored as seconds since epoch).
 * - iss = process.env.SUPABASE_REALTIME_ISS — the Realtime issuer.
 * - role = 'authenticated' (constant, required by Supabase Realtime).
 * - viewer_kind = 'admin' (informational).
 *
 * Signed with HS256 against process.env.SUPABASE_JWT_SECRET. Both env vars
 * are required; missing either → 500 (no JWT minted, no leak).
 *
 * Slug is read from the request body { slug }. POST is correct because the
 * route MINTS state (a new short-lived JWT bound to a session) — GET would
 * be cacheable + replayable, which is wrong for credentialed minting.
 */
import { NextResponse, type NextRequest } from "next/server";
import { log } from "@/lib/log";
import { SignJWT } from "jose";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import { resolvePickerSelection } from "@/lib/auth/picker/resolvePickerSelection";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const TOKEN_TTL_SECONDS = 5 * 60;

// HS256 (RFC 7518 §3.2) requires the HMAC key be at least as long as the
// hash output — 32 bytes / 256 bits. A shorter secret signs successfully but
// verifies weakly; we refuse to mint rather than emit a structurally-correct
// JWT against an under-strength key. The check is on UTF-8 byte length, not
// character length, since the secret is encoded as bytes via TextEncoder
// when handed to `jose`.
const MIN_HS256_SECRET_BYTES = 32;

type ApiViewer =
  | { ok: true; showId: string; sub: string; viewerKind: "admin" | "crew" }
  | { ok: false; status: 401 | 410 | 500; error: string; reason?: string };

function pickerCookieFromRequest(request: Request): string | undefined {
  const raw = request.headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === "__Host-fxav_picker") return valueParts.join("=");
  }
  return undefined;
}

async function showIdFromSlug(slug: string): Promise<"infra_error" | string | null> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = (await supabase
      .from("shows")
      .select("id")
      .eq("slug", slug)
      .maybeSingle()) as { data: { id: string } | null; error: unknown };
    if (error) return "infra_error";
    return data?.id ?? null;
  } catch {
    return "infra_error";
  }
}

async function resolveRealtimeViewer(request: NextRequest, slug: string): Promise<ApiViewer> {
  const showId = await showIdFromSlug(slug);
  if (showId === "infra_error") {
    return { ok: false, status: 500, error: "ADMIN_SESSION_LOOKUP_FAILED" };
  }
  if (!showId) {
    return {
      ok: false,
      status: 401,
      error: "SHOW_REALTIME_BROADCAST_AUTH_FAILED",
      reason: "unknown_slug",
    };
  }

  const admin = await isAdminSession(request);
  if (admin.ok) return { ok: true, showId, sub: "<admin>", viewerKind: "admin" };
  if (admin.reason === "infra_error") {
    return { ok: false, status: 500, error: "ADMIN_SESSION_LOOKUP_FAILED" };
  }

  const picker = await resolvePickerSelection({
    showId,
    cookie: pickerCookieFromRequest(request),
  });
  switch (picker.kind) {
    case "resolved":
      return { ok: true, showId, sub: picker.crewMemberId, viewerKind: "crew" };
    case "show_unavailable":
      return { ok: false, status: 410, error: "PICKER_SHOW_UNAVAILABLE" };
    case "identity_invalidated":
      return {
        ok: false,
        status: 410,
        error: "PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER",
        reason: picker.reason,
      };
    case "infra_error":
      return { ok: false, status: 500, error: picker.code };
    case "no_selection":
    case "epoch_stale":
    case "removed_from_roster":
      return {
        ok: false,
        status: 401,
        error: "SHOW_REALTIME_BROADCAST_AUTH_FAILED",
        reason: picker.kind,
      };
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: { slug?: unknown };
  try {
    body = (await request.json()) as { slug?: unknown };
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (typeof body.slug !== "string" || body.slug.length === 0) {
    return NextResponse.json({ error: "SLUG_REQUIRED" }, { status: 400 });
  }
  const slug = body.slug;

  const viewer = await resolveRealtimeViewer(request, slug);
  if (!viewer.ok) {
    return NextResponse.json(
      { error: viewer.error, reason: viewer.reason },
      { status: viewer.status },
    );
  }

  const secret = process.env.SUPABASE_JWT_SECRET;
  const issuer = process.env.SUPABASE_REALTIME_ISS;
  if (!secret || !issuer) {
    // Misconfigured server — refuse to mint. Don't leak which env var is
    // missing in the response body.
    return NextResponse.json({ error: "SHOW_REALTIME_TOKEN_MISCONFIGURED" }, { status: 500 });
  }
  if (Buffer.byteLength(secret, "utf8") < MIN_HS256_SECRET_BYTES) {
    // HS256 requires ≥32 bytes / 256 bits of secret material per RFC 7518
    // §3.2. A shorter SUPABASE_JWT_SECRET produces a weakly-verifiable JWT.
    // Log an internal error WITHOUT echoing the secret itself, then refuse
    // to mint with the same misconfiguration code (the client cannot
    // distinguish missing-env from short-secret — that's intentional;
    // operators see the full picture in logs).
    log.error("SUPABASE_JWT_SECRET is shorter than 32 bytes; refusing to mint HS256 JWT", {
      source: "api.realtime.subscriberToken",
    });
    return NextResponse.json({ error: "SHOW_REALTIME_TOKEN_MISCONFIGURED" }, { status: 500 });
  }

  const showId = viewer.showId;
  const sub = viewer.sub;
  const viewerKind = viewer.viewerKind;

  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;

  // Claim shape MUST match the plan exactly. No extra app-level claims (a
  // future regression that adds fields would silently expand the JWT
  // surface; the unit tests pin the shape via property-by-property checks).
  const jwt = await new SignJWT({
    show_id: showId,
    role: "authenticated",
    viewer_kind: viewerKind,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuer(issuer)
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));

  return NextResponse.json({ jwt, exp });
}
