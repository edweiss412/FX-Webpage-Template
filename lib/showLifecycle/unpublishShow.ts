import {
  callLifecycleRpc,
  defaultRpc,
  type LifecycleRpc,
  type LifecycleResult,
} from "@/lib/showLifecycle/_shared";

export type { LifecycleResult } from "@/lib/showLifecycle/_shared";

/**
 * Admin server-action backing for unpublish_show (the Published toggle's OFF path). The RPC
 * self-locks + gates atomically (archived / finalize-owned refusals, idempotent no-op).
 *
 * Deliberate name twin of lib/sync/unpublishShow.ts's token-flow export (published-toggle spec
 * §3.2): different module, different path — this one is the admin RPC caller; that one is the
 * emailed-link consume engine.
 */
export async function unpublishShow(
  showId: string,
  deps?: { rpc?: LifecycleRpc },
): Promise<LifecycleResult> {
  const rpc = deps?.rpc ?? defaultRpc();
  return (await callLifecycleRpc(rpc, "unpublish_show", { p_show_id: showId })).result;
}
