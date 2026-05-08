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
import { cookies } from "next/headers";

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
