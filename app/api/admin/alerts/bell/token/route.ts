/**
 * app/api/admin/alerts/bell/token/route.ts (bell notification center Task 12)
 *
 * Mints a short-lived JWT for the admin bell badge's private Realtime
 * channel (`admin:alerts`, spec §5.2/§5.3). Sibling of
 * app/api/realtime/subscriber-token/route.ts's mint core (SignJWT block,
 * secret-length check, env guards), but ADMIN-ONLY: no slug/show
 * resolution, no picker path, and NO show_id claim — the bell is a single
 * global admin surface, unscoped to any show.
 *
 * Auth: requireAdminIdentity(). AdminInfraError → 503 (mirrors
 * app/api/admin/alerts/bell/count/route.ts's contract exactly);
 * forbidden()/notFound() control flow propagates to Next untouched.
 *
 * JWT claim shape (spec §5.3, EXACT — no show_id):
 *   { sub, exp, iat, iss, role: 'authenticated', viewer_kind: 'admin' }
 * sub = the admin's own email (requireAdminIdentity's resolved identity —
 * unlike the subscriber-token route's literal '<admin>', the bell has no
 * show-scoped viewer to disambiguate against).
 *
 * Signed HS256 against SUPABASE_JWT_SECRET (≥32 bytes, RFC 7518 §3.2) with
 * issuer SUPABASE_REALTIME_ISS. Both env vars are required; missing either,
 * or a too-short secret, → 500 SHOW_REALTIME_TOKEN_MISCONFIGURED — the SAME
 * status/code as the subscriber-token route's mint-config contract (a
 * DIFFERENT failure class from the 503 auth-infra contract above; ops
 * shouldn't need two vocabularies for the same misconfiguration).
 *
 * `iat` is set explicitly (rather than left to jose's default, which is no
 * claim at all) and `exp` is derived from the SAME captured timestamp so
 * `exp - iat` is deterministically TOKEN_TTL_SECONDS, never off-by-one on a
 * second boundary.
 *
 * Mutation-surface note (invariant 10): this POST mints a token and writes
 * no state — registered as a read-only exemption in
 * tests/log/mutationSurface/exemptions.ts rather than going through the
 * AUDITABLE_MUTATIONS registry + behavioral-proof path.
 */
import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { AdminInfraError, requireAdminIdentity } from "@/lib/auth/requireAdmin";

const TOKEN_TTL_SECONDS = 5 * 60;

// HS256 (RFC 7518 §3.2) requires the HMAC key be at least as long as the
// hash output — 32 bytes / 256 bits. Byte length (not character length),
// since the secret is encoded via TextEncoder when handed to `jose`.
const MIN_HS256_SECRET_BYTES = 32;

export async function POST(): Promise<Response> {
  let email: string;
  try {
    ({ email } = await requireAdminIdentity());
  } catch (err) {
    if (err instanceof AdminInfraError) {
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }
    throw err; // forbidden()/notFound() control flow propagates to Next
  }

  const secret = process.env.SUPABASE_JWT_SECRET;
  const issuer = process.env.SUPABASE_REALTIME_ISS;
  if (!secret || !issuer) {
    // Misconfigured server — refuse to mint. Don't leak which env var is
    // missing in the response body.
    return NextResponse.json({ error: "SHOW_REALTIME_TOKEN_MISCONFIGURED" }, { status: 500 });
  }
  if (Buffer.byteLength(secret, "utf8") < MIN_HS256_SECRET_BYTES) {
    return NextResponse.json({ error: "SHOW_REALTIME_TOKEN_MISCONFIGURED" }, { status: 500 });
  }

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + TOKEN_TTL_SECONDS;

  // Claim shape MUST match spec §5.3 exactly — no show_id, no extra
  // app-level claims.
  const jwt = await new SignJWT({
    role: "authenticated",
    viewer_kind: "admin",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuer(issuer)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));

  return NextResponse.json({ jwt, exp });
}
