import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Typed result of a lifecycle RPC caller. `code` is a known §12.4 code or `infra_error`.
 *  `performed` is the RPC's discriminator: true iff THIS call performed the state transition,
 *  false on an idempotent no-op (race-cluster spec §4) — admin actions gate forensic telemetry
 *  on it so a repeat submit cannot duplicate a SHOW_* event for a transition that did not occur. */
export type LifecycleResult = { ok: true; performed: boolean } | { ok: false; code: string };

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
  // Publish freshness gate (staging-overlay spec 2026-07-16 §3.5 call site 3): publish_show
  // RAISEs this when a consumed role mapping was deleted/narrowed after staging; the setPublished
  // action renders it via lib/messages/lookup.ts (invariant 5). Heal = manual sync, then publish.
  "ROLE_MAPPINGS_OUTDATED_AT_PUBLISH",
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

/** Map a {data,error} RPC result to a typed LifecycleResult. `performed` is fail-closed
 *  (`data === true` exactly): a void-RPC transitional window or malformed payload suppresses
 *  one telemetry emission rather than fabricating a transition. Thrown faults never reach this
 *  mapping — callLifecycleRpc's catch owns them (infra_error, invariant 9). */
export function mapRpcResult(error: { message?: string } | null, data: unknown): LifecycleResult {
  if (!error) return { ok: true, performed: data === true };
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
): Promise<{ result: LifecycleResult; data: unknown }> {
  try {
    const { data, error } = await rpc(fn, args);
    return { result: mapRpcResult(error, data), data };
  } catch {
    return { result: { ok: false, code: "infra_error" }, data: null };
  }
}
