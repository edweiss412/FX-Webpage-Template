/**
 * app/api/realtime/subscriber-token/route.ts (M4 Task 4.16 routes)
 *
 * Mints a short-lived JWT that the client island
 * (`<ShowRealtimeBridge>` — Checkpoint B) passes to
 * supabase.realtime.setAuth(jwt) before opening the
 * `show:<id>:invalidation` Broadcast channel.
 *
 * Auth: resolveShowViewer (from request cookies + body.slug) is the FIRST
 * action.
 *   - denied    → 401 SHOW_REALTIME_BROADCAST_AUTH_FAILED
 *   - forbidden → 403 SHOW_REALTIME_CROSS_SHOW_FORBIDDEN
 *   - admin/crew_link/crew_google → mint + 200.
 *
 * JWT claim shape (EXACT, per plan 03-04-tiles.md:725-830):
 *   { show_id, sub, exp, iss, role: 'authenticated', viewer_kind }
 *
 * - sub = crew_member_id for crew_link/crew_google; '<admin>' for admin.
 *   The Realtime authorization layer reads `sub` for audit; the literal
 *   '<admin>' marker keeps admin sessions distinct from real crew rows.
 * - exp = now + 5 minutes (stored as seconds since epoch).
 * - iss = process.env.SUPABASE_REALTIME_ISS — the Realtime issuer.
 * - role = 'authenticated' (constant, required by Supabase Realtime).
 * - viewer_kind = 'admin' | 'crew_link' | 'crew_google' (informational).
 *
 * Signed with HS256 against process.env.SUPABASE_JWT_SECRET. Both env vars
 * are required; missing either → 500 (no JWT minted, no leak).
 *
 * Slug is read from the request body { slug }. POST is correct because the
 * route MINTS state (a new short-lived JWT bound to a session) — GET would
 * be cacheable + replayable, which is wrong for credentialed minting.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SignJWT } from "jose";
import { resolveShowViewer } from "@/lib/auth/resolveShowViewer";

const TOKEN_TTL_SECONDS = 5 * 60;

// HS256 (RFC 7518 §3.2) requires the HMAC key be at least as long as the
// hash output — 32 bytes / 256 bits. A shorter secret signs successfully but
// verifies weakly; we refuse to mint rather than emit a structurally-correct
// JWT against an under-strength key. The check is on UTF-8 byte length, not
// character length, since the secret is encoded as bytes via TextEncoder
// when handed to `jose`.
const MIN_HS256_SECRET_BYTES = 32;

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

  const viewer = await resolveShowViewer(request, slug);
  if (viewer.kind === "denied") {
    return NextResponse.json(
      { error: "SHOW_REALTIME_BROADCAST_AUTH_FAILED", reason: viewer.reason },
      { status: 401 },
    );
  }
  if (viewer.kind === "forbidden") {
    return NextResponse.json(
      { error: "SHOW_REALTIME_CROSS_SHOW_FORBIDDEN", reason: viewer.reason },
      { status: 403 },
    );
  }

  const secret = process.env.SUPABASE_JWT_SECRET;
  const issuer = process.env.SUPABASE_REALTIME_ISS;
  if (!secret || !issuer) {
    // Misconfigured server — refuse to mint. Don't leak which env var is
    // missing in the response body.
    return NextResponse.json(
      { error: "SHOW_REALTIME_TOKEN_MISCONFIGURED" },
      { status: 500 },
    );
  }
  if (Buffer.byteLength(secret, "utf8") < MIN_HS256_SECRET_BYTES) {
    // HS256 requires ≥32 bytes / 256 bits of secret material per RFC 7518
    // §3.2. A shorter SUPABASE_JWT_SECRET produces a weakly-verifiable JWT.
    // Log an internal error WITHOUT echoing the secret itself, then refuse
    // to mint with the same misconfiguration code (the client cannot
    // distinguish missing-env from short-secret — that's intentional;
    // operators see the full picture in logs).
    console.error(
      "[/api/realtime/subscriber-token] SUPABASE_JWT_SECRET is shorter than 32 bytes; refusing to mint HS256 JWT",
    );
    return NextResponse.json(
      { error: "SHOW_REALTIME_TOKEN_MISCONFIGURED" },
      { status: 500 },
    );
  }

  const showId = viewer.show_id;

  // Exhaustive switch over the success arms. Adding a 6th `ShowViewer` arm
  // would fail to assign the new variant to `_exhaustive: never` and break
  // the typecheck — preventing a silent regression where the new arm
  // either falls through to the 500 branch or, worse, gets handled by an
  // unrelated success arm via structural coincidence. Per Task 4.16
  // Checkpoint A code-quality review (Important 2).
  let sub: string;
  let viewerKind: "admin" | "crew_link" | "crew_google";
  switch (viewer.kind) {
    case "admin":
      sub = "<admin>";
      viewerKind = "admin";
      break;
    case "crew_link":
      sub = viewer.crew_member_id;
      viewerKind = "crew_link";
      break;
    case "crew_google":
      sub = viewer.crew_member_id;
      viewerKind = "crew_google";
      break;
    default: {
      const _exhaustive: never = viewer;
      void _exhaustive;
      return new Response("Unreachable subscriber-token viewer kind", {
        status: 500,
      });
    }
  }

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
