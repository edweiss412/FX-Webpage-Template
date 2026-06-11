// lib/auth/rootSessionProbe.ts
//
// Session probe for the public root landing (spec §4.1). Three states,
// never collapsed (AGENTS.md invariant 9): returned missing-session
// errors are anonymous (the isAdminSession discipline,
// lib/auth/isAdminSession.ts:30-35); returned NON-missing errors and
// any throw are infra faults — the caller decides the render posture,
// this helper only classifies.
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAuthSessionMissingError } from "@/lib/auth/supabaseAuthError";

export type RootSessionProbeResult =
  | { kind: "authenticated" }
  | { kind: "anonymous" }
  | { kind: "infra_error"; message: string };

export async function rootSessionProbe(): Promise<RootSessionProbeResult> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    return {
      kind: "infra_error",
      message: `client construction threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      if (isAuthSessionMissingError(error)) return { kind: "anonymous" };
      return {
        kind: "infra_error",
        message: `getUser returned non-missing error: ${error.message ?? String(error)}`,
      };
    }
    if (data?.user) return { kind: "authenticated" };
    return { kind: "anonymous" };
  } catch (err) {
    return {
      kind: "infra_error",
      message: `getUser threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
