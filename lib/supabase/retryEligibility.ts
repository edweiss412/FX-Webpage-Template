/**
 * lib/supabase/retryEligibility.ts
 *
 * Decides whether a Supabase request may be RETRIED. Nothing here performs a retry; this
 * module is the predicate alone, in its own file, for two reasons that both matter:
 *
 *   1. Its defect class is silent-wrong. A predicate that wrongly returns true retries a
 *      request that may have already committed a write, and nothing errors.
 *   2. The source-mutation runner overlays a target only when a Vitest suite imports it, so
 *      the predicate is importable rather than inlined in the fetch wrapper.
 *
 * not-subject-to-meta: this is transport-shaped policy, not an auth helper that gates a trust
 * decision, so it takes no row in tests/auth/_metaInfraContract.test.ts (invariant 9).
 */

/**
 * RPCs that may be retried, because the database can prove they cannot have written.
 *
 * Membership is guarded in BOTH directions by
 * tests/supabase/_metaRetryableRpcVolatility.test.ts: every name here must be non-VOLATILE in
 * the live catalog AND must complete inside a READ ONLY transaction. Volatility alone is
 * necessary and NOT sufficient — a STABLE function can still write through a VOLATILE callee,
 * which is why the second arm exists (spec §4.2).
 */
export const RETRYABLE_RPCS: ReadonlySet<string> = new Set([
  "admin_alert_summary",
  "admin_event_stats_24h",
  "admin_read_share_token",
  "auth_email_canonical",
  "get_admin_show_review_snapshot",
  "is_admin",
  "is_developer",
  "is_session_live",
  "my_share_tokens_for_email",
  "readfinalizeowned_b2",
  "resolve_show_by_slug_and_token",
  "roster_shift_counts",
  "viewer_version_token",
]);

/**
 * PostgREST serves RPCs under this exact prefix. The `/rpc/` segment is LOAD-BEARING: a table
 * insert is `POST /rest/v1/<table>`, the same method as an RPC and one segment shallower, so a
 * rule keyed on the trailing path segment would retry a write into any table sharing a name
 * with a retryable function.
 */
const RPC_PATH = /^\/rest\/v1\/rpc\/([^/]+)$/;

/** Methods that are idempotent by HTTP contract, so a non-RPC request under one is a read. */
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD"]);

/**
 * True when this request may be retried.
 *
 * An RPC takes its answer from RETRYABLE_RPCS regardless of METHOD, because PostgREST serves
 * `GET /rest/v1/rpc/<fn>` for non-volatile functions and HTTP idempotency is a claim about the
 * method rather than about what the function can do (spec §4.2). Everything else is eligible
 * only when its method is idempotent.
 */
export function isRetryEligible(url: string, method: string | undefined): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    // An unparseable URL is not something to reason about; refuse rather than guess.
    return false;
  }

  const rpc = RPC_PATH.exec(path);
  if (rpc !== null) return RETRYABLE_RPCS.has(rpc[1]!);

  return IDEMPOTENT_METHODS.has((method ?? "GET").toUpperCase());
}
