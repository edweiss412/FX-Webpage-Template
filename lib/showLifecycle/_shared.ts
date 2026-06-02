import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

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

/** Default RPC binding: the service-role client (invariant 9 — destructure {data,error}). */
export const defaultRpc = (): LifecycleRpc => async (fn, args) => {
  const { data, error } = await createSupabaseServiceRoleClient().rpc(fn, args);
  return { data, error };
};

/** Map a {data,error} RPC result to a typed LifecycleResult. */
export function mapRpcResult(error: { message?: string } | null): LifecycleResult {
  if (!error) return { ok: true };
  const msg = error.message ?? "";
  const code = KNOWN.find((c) => msg.includes(c));
  return { ok: false, code: code ?? "infra_error" };
}
