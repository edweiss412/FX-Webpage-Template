import { defaultRpc, mapRpcResult, type LifecycleRpc, type LifecycleResult } from "@/lib/showLifecycle/_shared";

export type { LifecycleResult } from "@/lib/showLifecycle/_shared";

/** Admin server-action backing for publish_show. The RPC self-locks + gates atomically. */
export async function publishShow(
  showId: string,
  deps?: { rpc?: LifecycleRpc },
): Promise<LifecycleResult> {
  const rpc = deps?.rpc ?? defaultRpc();
  const { error } = await rpc("publish_show", { p_show_id: showId });
  return mapRpcResult(error);
}
