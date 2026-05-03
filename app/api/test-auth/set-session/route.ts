/**
 * app/api/test-auth/set-session/route.ts (M3 Task 3.1)
 *
 * Test-only endpoint that mints a real Supabase auth session for the requested
 * fixture email and returns Set-Cookie headers so the Playwright browser
 * context can be authenticated for subsequent /admin/dev requests.
 *
 * GATING (defense in depth):
 *   - process.env.ENABLE_TEST_AUTH must be the literal string 'true'
 *   - The handler returns 404 in any other environment
 *
 * NODE_ENV is NOT used as the gate — `next start` forces NODE_ENV=production
 * regardless of the ambient environment, so a NODE_ENV check would never
 * match in either Playwright webServer build. ENABLE_TEST_AUTH is a
 * dedicated server-only env var (no NEXT_PUBLIC_ prefix) set inline by both
 * Playwright webServer commands and NEVER set in real production builds.
 *
 * The endpoint is intentionally NOT gated on ADMIN_DEV_PANEL_ENABLED — the
 * prod-build Playwright project sets ENABLE_TEST_AUTH=true (so we can sign
 * in admin to prove /admin/dev still returns 404 even with admin auth),
 * but does NOT set the dev-panel flag. M5 replaces this with the real OAuth
 * flow; ENABLE_TEST_AUTH stays as the test-only escape hatch.
 *
 * Flow:
 *   1. Service-role client: auth.admin.createUser (idempotent — ignore "already exists")
 *   2. Service-role client: auth.admin.updateUserById to set known password
 *      and stamp app_metadata.role = 'admin' if isAdmin: true
 *   3. Cookie-bound client: signInWithPassword → @supabase/ssr writes
 *      Set-Cookie via the response cookies adapter
 */
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// A long, well-known password used by all fixture sign-ins. The test-auth
// endpoint is gated on ENABLE_TEST_AUTH so this never reaches production.
const TEST_FIXTURE_PASSWORD = "fxav-test-fixture-password-2026";

export async function POST(request: Request): Promise<Response> {
  // Gate: ENABLE_TEST_AUTH must be set explicitly. NODE_ENV is unreliable
  // because `next start` forces NODE_ENV=production regardless of the
  // ambient environment, so we use a dedicated server-only env var instead.
  // Production builds NEVER set ENABLE_TEST_AUTH; both Playwright webServer
  // commands set it inline so the helper is reachable in both build artifacts.
  if (process.env.ENABLE_TEST_AUTH !== "true") {
    return new NextResponse("Not Found", { status: 404 });
  }

  let body: { email?: string; isAdmin?: boolean };
  try {
    body = (await request.json()) as { email?: string; isAdmin?: boolean };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "email_required" }, { status: 400 });
  }
  const isAdmin = body.isAdmin === true;

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

  // 1. Create user (idempotent). createUser returns "User already registered"
  //    on second call — treat as success and continue.
  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password: TEST_FIXTURE_PASSWORD,
    email_confirm: true,
    app_metadata: isAdmin ? { role: "admin" } : {},
  });

  let userId = created?.user?.id;
  if (createErr && !/already registered|already been registered|already exists/i.test(createErr.message)) {
    return NextResponse.json(
      { error: "create_user_failed", detail: createErr.message },
      { status: 500 },
    );
  }

  if (!userId) {
    // Already-existing user: look it up to get the ID.
    const { data: list, error: listErr } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) {
      return NextResponse.json(
        { error: "list_users_failed", detail: listErr.message },
        { status: 500 },
      );
    }
    const found = list?.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (!found) {
      return NextResponse.json({ error: "user_not_found_after_create" }, { status: 500 });
    }
    userId = found.id;
  }

  // 2. Reset the password and re-stamp app_metadata so the test is
  //    deterministic regardless of prior state.
  const { error: updateErr } = await adminClient.auth.admin.updateUserById(userId, {
    password: TEST_FIXTURE_PASSWORD,
    app_metadata: isAdmin ? { role: "admin" } : {},
    email_confirm: true,
  });
  if (updateErr) {
    return NextResponse.json(
      { error: "update_user_failed", detail: updateErr.message },
      { status: 500 },
    );
  }

  // 3. Sign in with password via cookie-bound client. The SSR client will
  //    write Set-Cookie via the cookies() adapter.
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
    email,
    password: TEST_FIXTURE_PASSWORD,
  });
  if (signInErr) {
    return NextResponse.json(
      { error: "sign_in_failed", detail: signInErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, email, isAdmin });
}

export async function GET(): Promise<Response> {
  // Gate: ENABLE_TEST_AUTH must be set explicitly. NODE_ENV is unreliable
  // because `next start` forces NODE_ENV=production regardless of the
  // ambient environment, so we use a dedicated server-only env var instead.
  // Production builds NEVER set ENABLE_TEST_AUTH; both Playwright webServer
  // commands set it inline so the helper is reachable in both build artifacts.
  if (process.env.ENABLE_TEST_AUTH !== "true") {
    return new NextResponse("Not Found", { status: 404 });
  }
  return NextResponse.json({ ok: true, gate: "ENABLE_TEST_AUTH=true" });
}
