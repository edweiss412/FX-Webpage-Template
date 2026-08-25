/**
 * lib/supabase/server.ts (M3 minimal scaffold)
 *
 * Server-side Supabase client factory used by /admin/dev page + actions and
 * by lib/auth/requireAdmin. Cookie-bound so RLS policies + is_admin() see the
 * authenticated user's session JWT.
 *
 * M5 will refactor to add explicit middleware-based session refresh; for M3
 * we use the simpler getAll/setAll wrapper around Next.js's `cookies()`. The
 * exported function name `createSupabaseServerClient()` stays stable.
 */
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

import { makeRetryingFetch } from "./retryingFetch";

const SUPABASE_PKCE_VERIFIER_COOKIE_RE = /^sb-[^-]+-auth-token-code-verifier(?:\.\d+)?$/;

function hardenSupabaseCookieOptions(
  name: string,
  options: Parameters<Awaited<ReturnType<typeof cookies>>["set"]>[2],
): Parameters<Awaited<ReturnType<typeof cookies>>["set"]>[2] {
  if (!SUPABASE_PKCE_VERIFIER_COOKIE_RE.test(name)) {
    return options;
  }
  return {
    ...options,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  };
}

/**
 * Test-only, production-gated injector for AC-5's deterministic proof.
 *
 * Gated exactly as `maybeForceTestInfraFail` is (lib/auth/requireAdmin.ts): ENABLE_TEST_AUTH,
 * a TEST_AUTH_SECRET of real length, the matching Bearer header, and a request-scoped header
 * naming how many faults to inject. It cannot fire in production, where ENABLE_TEST_AUTH is
 * unset and the Bearer gate would stop it anyway.
 *
 * It WRAPS the real fetch and DELEGATES after N. It must never short-circuit the wrapper: if it
 * returned success directly, AC-5 could pass without a retry ever running, which is the
 * tautology the acceptance criterion exists to avoid.
 */
async function maybeForceUpstreamFaults(inner: typeof fetch): Promise<typeof fetch> {
  if (process.env.ENABLE_TEST_AUTH !== "true") return inner;
  const secret = process.env.TEST_AUTH_SECRET;
  if (secret === undefined || secret.length < 16) return inner;

  let requested: string | null = null;
  try {
    const h = await headers();
    if (h.get("authorization") !== `Bearer ${secret}`) return inner;
    requested = h.get("x-test-force-upstream-502");
  } catch {
    return inner; // no request scope (build, background) — nothing to force
  }
  const remaining = Number(requested ?? "");
  if (!Number.isInteger(remaining) || remaining <= 0) return inner;

  let left = remaining;
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (left > 0) {
      left -= 1;
      return new Response(
        JSON.stringify({ message: "An invalid response was received from the upstream server" }),
        { status: 502, headers: { "content-type": "application/json" } },
      );
    }
    return inner(input, init);
  }) as typeof fetch;
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  if (!url || !publishableKey) {
    throw new Error(
      "createSupabaseServerClient: SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set",
    );
  }
  return createServerClient(url, publishableKey, {
    // Absorbs the transient upstream 502 this gateway produces, bounded twice: only requests
    // the database has proven cannot write are retried, and each attempt carries a stall guard.
    // Installed HERE and nowhere else — the service-role client is deliberately excluded, and
    // spec §6.1's recursion fence depends on that exclusion, because the durable log sink
    // writes through it.
    global: { fetch: makeRetryingFetch(await maybeForceUpstreamFaults(fetch)) },
    cookies: {
      getAll() {
        return cookieStore.getAll().map((c) => ({ name: c.name, value: c.value }));
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            const hardenedOptions = hardenSupabaseCookieOptions(name, options);
            if (hardenedOptions === undefined) {
              cookieStore.set(name, value);
            } else {
              cookieStore.set(name, value, hardenedOptions);
            }
          });
        } catch {
          // Cookie writes from a Server Component are forbidden; the middleware/
          // action that holds a writable cookie store will pick up refreshes
          // on the next request. Swallow per @supabase/ssr docs.
        }
      },
    },
  });
}

/**
 * Service-role client for write paths inside server actions that need to
 * bypass RLS (e.g. writing to dev.* after requireAdmin() has already gated
 * the request at the application layer). Never expose this to client code.
 *
 * Falls back to local-Supabase service-role-key default so tests work without
 * extra env config.
 */
export function createSupabaseServiceRoleClient() {
  const url = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
  const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey && process.env.NODE_ENV === "production") {
    throw new Error(
      "createSupabaseServiceRoleClient: SUPABASE_SECRET_KEY must be set in production",
    );
  }
  const resolvedServiceKey =
    serviceKey ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
  return createClient(url, resolvedServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
