/**
 * tests/db/isSessionLive.test.ts (nav-perf phase 1, Task 3 / B1.5)
 *
 * NON-TAUTOLOGICAL DB integration test for `public.is_session_live()`.
 *
 * After requireAdmin's getClaims() verifies the admin JWT locally (no
 * Auth-server round-trip), it must still confirm the SESSION ROW still
 * exists in auth.sessions so a signed-out / globally-revoked / deleted
 * session is cut off IMMEDIATELY rather than valid until token TTL.
 *
 * This test exercises the REAL GoTrue revocation path (empirically
 * verified 2026-06-22): a signed-in access token carries a `session_id`
 * claim, and BOTH `anon.auth.signOut()` AND `admin.auth.admin.deleteUser()`
 * DELETE the matching auth.sessions row. So `is_session_live()` flips
 * true → false the moment the session is revoked.
 *
 * The RPC is invoked THROUGH PostgREST via a client authed with
 * `Authorization: Bearer <real access_token>` (so auth.jwt() inside the
 * SECURITY DEFINER body sees the live session_id claim) and an
 * `apikey` = local publishable key (Supabase-issued, gateway-accepted —
 * the gateway validates apikey separately from PostgREST's Bearer JWT).
 *
 * TDD: this test is written + run FIRST and observed RED with
 * `function public.is_session_live() does not exist` before the migration
 * is written.
 */
import { afterEach, describe, expect, test } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
// Local-dev keys: read from env, falling back to the universal Supabase
// local-demo JWTs (PUBLIC, not secret — the same non-flagged fallback used by
// tests/data/getShowForViewer.test.ts). NEVER hardcode sb_secret_*/sb_publishable_*
// literals — GitHub push-protection flags them (Supabase Secret Key).
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const createdUserIds: string[] = [];

async function createConfirmedUser(): Promise<{ email: string; password: string; userId: string }> {
  const email = `is-session-live-${crypto.randomUUID()}@example.com`;
  const password = `Pw-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  createdUserIds.push(data.user.id);
  return { email, password, userId: data.user.id };
}

// Minimal structural view of a Supabase client for this test — sidesteps the
// SupabaseClient generic's exactOptionalPropertyTypes friction; we only call
// rpc() and auth.signOut().
type TestClient = {
  rpc: (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>;
  auth: { signOut: () => Promise<{ error: { message: string } | null }> };
};

function authedClient(accessToken: string): TestClient {
  // A fresh anon client carrying the real session token as the Bearer JWT
  // (so auth.jwt() sees the session_id) and the publishable key as apikey
  // (gateway-accepted). persistSession:false so we don't pollute storage.
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  }) as unknown as TestClient;
}

/**
 * Signs in and returns BOTH the access token AND the session-holding client.
 * Critical: `signOut()` is a no-op on a client that has no session in memory
 * (verified 2026-06-22 — a fresh client carrying only a Bearer header but no
 * stored session does NOT delete the auth.sessions row). To exercise the REAL
 * revocation path the test must call `signOut()` on the SAME client that holds
 * the signed-in session, which is exactly what GoTrue deletes server-side.
 */
async function signIn(
  email: string,
  password: string,
): Promise<{ token: string; sessionClient: TestClient }> {
  const sessionClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await sessionClient.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`signIn failed: ${error?.message}`);
  return {
    token: data.session.access_token,
    sessionClient: sessionClient as unknown as TestClient,
  };
}

/**
 * GoTrue's session-row DELETE (sign-out / user deletion) is committed
 * asynchronously relative to the API response — verified 2026-06-22: a
 * direct DB read after a 300ms settle (and the RPC itself after the same
 * settle) consistently shows the row gone, but an RPC issued in the SAME
 * tick as the revocation call can still observe the pre-delete snapshot.
 * In production this is a non-issue: requireAdmin runs on the NEXT request,
 * long after the delete has committed. For the test, poll the RPC briefly
 * until it flips false. The assertion is NON-tautological: it still REQUIRES
 * is_session_live() to reach `false` — it never asserts "false" by waiting
 * out a true. If the row never gets deleted, this returns the last `true`
 * and the test fails (correctly).
 */
async function pollSessionLive(authed: TestClient, expected: boolean): Promise<boolean> {
  let last: unknown = !expected;
  for (let i = 0; i < 20; i += 1) {
    const { data, error } = await authed.rpc("is_session_live");
    if (error) throw new Error(`is_session_live RPC error: ${error.message}`);
    last = data;
    if (data === expected) return data as boolean;
    await new Promise((r) => setTimeout(r, 100));
  }
  return last as boolean;
}

afterEach(async () => {
  while (createdUserIds.length > 0) {
    const id = createdUserIds.pop()!;
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
});

describe("public.is_session_live()", () => {
  test("live session → true; after signOut() (real revocation) → false", async () => {
    const { email, password } = await createConfirmedUser();
    const { token, sessionClient } = await signIn(email, password);
    const authed = authedClient(token);

    const live = await authed.rpc("is_session_live");
    expect(live.error).toBeNull();
    expect(live.data).toBe(true);

    // REAL revocation: signOut on the session-holding client deletes the
    // auth.sessions row server-side (GoTrue).
    const { error: signOutError } = await sessionClient.auth.signOut();
    expect(signOutError).toBeNull();

    // Cut off immediately on the next request (poll past GoTrue's async
    // session-row DELETE — see pollSessionLive doc).
    expect(await pollSessionLive(authed, false)).toBe(false);
  });

  test("live session → true; after admin.deleteUser (cascades sessions) → false", async () => {
    const { email, password, userId } = await createConfirmedUser();
    const { token } = await signIn(email, password);
    const authed = authedClient(token);

    const live = await authed.rpc("is_session_live");
    expect(live.error).toBeNull();
    expect(live.data).toBe(true);

    // REAL revocation arm 2: deleting the user removes auth.sessions rows.
    const { error: delError } = await admin.auth.admin.deleteUser(userId);
    expect(delError).toBeNull();
    // Already deleted — drop from cleanup list so afterEach doesn't re-delete.
    const idx = createdUserIds.indexOf(userId);
    if (idx >= 0) createdUserIds.splice(idx, 1);

    expect(await pollSessionLive(authed, false)).toBe(false);
  });
});
