/**
 * app/api/test-auth/set-session/route.ts (M3 Task 3.1)
 *
 * Test-only endpoint that mints a real Supabase auth session for the requested
 * fixture email and returns Set-Cookie headers so the Playwright browser
 * context can be authenticated for subsequent /admin/dev requests.
 *
 * GATING — multiple LAYERED defenses (Round 1 Finding 3 hardening). All FIVE
 * must hold or the endpoint refuses to mint a session. A single env-var
 * misconfiguration in production is no longer enough to enable the bypass:
 *
 *   1. process.env.ENABLE_TEST_AUTH === 'true'         (mounts the route)
 *   2. process.env.TEST_AUTH_SECRET set AND
 *      Authorization: Bearer <TEST_AUTH_SECRET> matches (per-run secret)
 *   3. Host header matches localhost / 127.0.0.1       (host allowlist)
 *   4. body.email is in FIXTURE_ALLOWLIST              (no arbitrary emails)
 *   5. Email's auth.users row does NOT already exist   (create-only;
 *      mutations of existing users return 410 Gone)
 *
 * isAdmin is DERIVED from the allowlist entry — never client-controlled.
 *
 * NODE_ENV is NOT used as a gate — `next start` forces NODE_ENV=production
 * regardless of the ambient environment, so a NODE_ENV check would never
 * match in either Playwright webServer build.
 *
 * Production builds NEVER set ENABLE_TEST_AUTH or TEST_AUTH_SECRET. The
 * Playwright dev-build / prod-build webServer commands set both inline so
 * tests work; the prod-build runtime-flip Playwright project additionally
 * verifies the dev-panel build-artifact gate (Round 1 Finding 1).
 *
 * The endpoint is intentionally NOT gated on ADMIN_DEV_PANEL_ENABLED — the
 * prod-build Playwright project needs to sign in admin (so we can prove
 * /admin/dev still returns 404 even with admin auth), but does NOT set the
 * dev-panel flag. M5 replaces this with the real OAuth flow.
 *
 * Flow (when all gates pass):
 *   1. Service-role client: auth.admin.createUser
 *      - if "already exists" → 410 Gone (create-only enforcement)
 *   2. Cookie-bound client: signInWithPassword → @supabase/ssr writes
 *      Set-Cookie via the cookies() adapter
 */
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// A long, well-known password used by all fixture sign-ins. The test-auth
// endpoint is gated on ENABLE_TEST_AUTH + TEST_AUTH_SECRET + host allowlist
// + email allowlist + create-only, so this never reaches production.
const TEST_FIXTURE_PASSWORD = "fxav-test-fixture-password-2026";

/**
 * Email allowlist — the ONLY emails this endpoint will mint sessions for.
 * isAdmin is derived from this map (NOT from any client-supplied field) so
 * the bypass surface is bounded to two well-known fixture identities even
 * if every other gate above somehow fails simultaneously.
 *
 * The admin email here matches the public.is_admin() Postgres helper's
 * hard-coded allowlist at supabase/migrations/20260501002000_rls_policies.sql:30-37
 * so end-to-end auth flows work without custom JWT claims.
 */
const FIXTURE_ALLOWLIST: Readonly<Record<string, { isAdmin: boolean }>> = Object.freeze({
  "edweiss412@gmail.com": { isAdmin: true },
  "crew-non-admin@fxav.test": { isAdmin: false },
});

/**
 * Host allowlist — only localhost / 127.0.0.1 origins may hit this endpoint.
 * If somehow the env vars are set in a non-local environment, the host
 * header (Next.js sets `host` to the request authority) provides one more
 * line of defense before the email allowlist takes over.
 */
const ALLOWED_HOST_RE = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

function reject(status: number, code: string, detail?: string): Response {
  return NextResponse.json(detail ? { error: code, detail } : { error: code }, { status });
}

/**
 * Single chokepoint that runs ALL five gates in order. Returns null when
 * the request is allowed, or a Response when any gate rejects. The order
 * deliberately puts the cheapest checks first (env vars → headers) before
 * any database round-trip.
 */
function runGates(request: Request): Response | null {
  // Gate 1: ENABLE_TEST_AUTH must be the literal string 'true'.
  if (process.env.ENABLE_TEST_AUTH !== "true") {
    return new NextResponse("Not Found", { status: 404 });
  }

  // Gate 2: TEST_AUTH_SECRET must be set AND match the Authorization header.
  // Without this, ENABLE_TEST_AUTH=true alone is not sufficient.
  const expected = process.env.TEST_AUTH_SECRET;
  if (!expected || expected.length < 16) {
    // Misconfigured server: refuse to operate even with the right header.
    return reject(503, "test_auth_secret_unset");
  }
  const auth = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(auth);
  // Constant-time comparison via length check + per-char accumulator. JS does
  // not expose timingSafeEqual on Edge runtime, so we approximate by always
  // doing the same number of operations regardless of mismatch position.
  const presented = match?.[1] ?? "";
  let diff = presented.length === expected.length ? 0 : 1;
  const len = Math.max(presented.length, expected.length);
  for (let i = 0; i < len; i++) {
    diff |= (presented.charCodeAt(i) ^ expected.charCodeAt(i)) || 0;
  }
  if (diff !== 0) {
    return reject(401, "unauthorized");
  }

  // Gate 3: Host header must match the localhost allowlist.
  const host = request.headers.get("host") ?? "";
  if (!ALLOWED_HOST_RE.test(host)) {
    return reject(403, "host_not_allowed");
  }

  return null;
}

export async function POST(request: Request): Promise<Response> {
  const gateResp = runGates(request);
  if (gateResp) return gateResp;

  let body: { email?: unknown };
  try {
    body = (await request.json()) as { email?: unknown };
  } catch {
    return reject(400, "invalid_json");
  }

  const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!rawEmail) {
    return reject(400, "email_required");
  }

  // Gate 4: email must be in the allowlist. isAdmin is DERIVED from the
  // allowlist entry — any client-supplied isAdmin field in the body is
  // silently ignored.
  const allowEntry = FIXTURE_ALLOWLIST[rawEmail];
  if (!allowEntry) {
    return reject(400, "email_not_allowlisted");
  }
  const isAdmin = allowEntry.isAdmin;

  const supabaseUrl = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
  const anonKey =
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Gate 5: create-only. createUser returns an "already exists" error on a
  // duplicate email; we treat that as 410 Gone and refuse to mutate the row.
  // This means a stale prior-test user must be deleted (via service-role)
  // before re-creating — the Playwright + Vitest setup hooks do this with
  // adminClient.auth.admin.deleteUser before each test.
  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email: rawEmail,
    password: TEST_FIXTURE_PASSWORD,
    email_confirm: true,
    app_metadata: isAdmin ? { role: "admin" } : {},
  });

  if (createErr) {
    if (/already registered|already been registered|already exists/i.test(createErr.message)) {
      return reject(410, "user_exists_create_only");
    }
    return reject(500, "create_user_failed", createErr.message);
  }
  if (!created?.user?.id) {
    return reject(500, "create_user_returned_no_id");
  }

  // Sign in with password via cookie-bound client. The SSR client will write
  // Set-Cookie via the cookies() adapter.
  const cookieStore = await cookies();
  const ssrClient = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map((c) => ({ name: c.name, value: c.value }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  const { error: signInErr } = await ssrClient.auth.signInWithPassword({
    email: rawEmail,
    password: TEST_FIXTURE_PASSWORD,
  });
  if (signInErr) {
    return reject(500, "sign_in_failed", signInErr.message);
  }

  return NextResponse.json({ ok: true, email: rawEmail, isAdmin });
}

export async function GET(request: Request): Promise<Response> {
  // GET is idempotent — only Gate 1 (ENABLE_TEST_AUTH) applies. Useful as a
  // probe for test setup ("is the test-auth endpoint mounted?") without
  // requiring the secret.
  if (process.env.ENABLE_TEST_AUTH !== "true") {
    return new NextResponse("Not Found", { status: 404 });
  }
  // Don't leak the secret value or the host gate from the GET probe; just
  // confirm the endpoint is mounted.
  void request;
  return NextResponse.json({ ok: true, gate: "ENABLE_TEST_AUTH=true" });
}

/**
 * Helper exported for test-setup hooks (NOT exposed via the route — Next.js
 * only honors the HTTP-method exports above). Tests use this via the
 * adminClient.auth.admin.deleteUser API directly; it is documented here so
 * the create-only contract is discoverable from the route's source.
 *
 * Pre-test cleanup recipe:
 *   const allUsers = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
 *   for (const u of allUsers.data?.users ?? []) {
 *     if (FIXTURE_EMAILS.has(u.email?.toLowerCase() ?? '')) {
 *       await admin.auth.admin.deleteUser(u.id);
 *     }
 *   }
 *
 * This re-creates a clean baseline before each test that calls signInAs().
 */
export const FIXTURE_EMAILS = new Set(Object.keys(FIXTURE_ALLOWLIST));
