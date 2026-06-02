import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Typed result of a lifecycle RPC caller. `code` is a known §12.4 code or `infra_error`. */
export type LifecycleResult = { ok: true } | { ok: false; code: string };

/** Shape of the injectable RPC dependency (matches the supabase-js `.rpc()` return contract). */
export type LifecycleRpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

/** Known RPC RAISE messages mapped to typed refusals; anything else is an infra fault (never silent). */
const KNOWN = [
  "FINALIZE_OWNED_SHOW",
  "SHOW_ARCHIVED_IMMUTABLE",
  "PUBLISH_BLOCKED_PENDING_REVIEW",
  "ADMIN_LINK_SHOW_NOT_FOUND",
];

/**
 * Default RPC binding: the SESSION-bound server client (the admin user's JWT), NOT service_role.
 * The lifecycle RPCs are granted ONLY to `authenticated` and gate on `is_admin()` (which reads the
 * caller's JWT email/role) — a service-role caller is both un-granted AND not-admin, so it would fail
 * every action with infra_error. These callers only ever run from admin server actions AFTER
 * requireAdmin(), so the session client (authenticated, admin email) is the correct, authorized caller.
 * (invariant 9 — destructure {data,error}.)
 */
export const defaultRpc = (): LifecycleRpc => async (fn, args) => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(fn, args);
  return { data, error };
};

/** Map a {data,error} RPC result to a typed LifecycleResult. */
export function mapRpcResult(error: { message?: string } | null): LifecycleResult {
  if (!error) return { ok: true };
  const msg = error.message ?? "";
  const code = KNOWN.find((c) => msg.includes(c));
  return { ok: false, code: code ?? "infra_error" };
}

/**
 * The single chokepoint every lifecycle caller uses to invoke its RPC. Maps BOTH the returned `{error}`
 * (via mapRpcResult) AND a THROWN fault — client construction (defaultRpc's `await
 * createSupabaseServerClient()`), network, or the `.rpc()` chain rejecting — to a typed
 * `{ ok:false, code:"infra_error" }` (AGENTS.md invariant 9). Without the catch a thrown Supabase fault
 * would reject the server action outright, bypassing the infra_error retry copy the lifecycle buttons
 * render. Routing all callers through here is the structural defense (R7): the only way to invoke a
 * lifecycle RPC is through this wrapper. Pinned by tests/showLifecycle/callers.test.ts.
 */
export async function callLifecycleRpc(
  rpc: LifecycleRpc,
  fn: string,
  args: Record<string, unknown>,
): Promise<LifecycleResult> {
  try {
    const { error } = await rpc(fn, args);
    return mapRpcResult(error);
  } catch {
    return { ok: false, code: "infra_error" };
  }
}
