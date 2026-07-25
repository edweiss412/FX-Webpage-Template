/**
 * lib/adminAlerts/alertScope.ts
 *
 * Alert codes whose producers ALWAYS write `show_id: null`.
 *
 * `fetchPerShowAlerts` reads `admin_alerts` filtered by
 * `.eq("show_id", showId)` (lib/adminAlerts/fetchPerShowAlerts.ts:83), so a
 * NULL `show_id` can never match a real show — no per-show surface can receive
 * one of these codes. They surface on the global/bell surfaces instead.
 *
 * `lib/` must not import `tests/`, so the runtime list is declared here and
 * pinned set-equal to the `globalOnlyCodes()` projection over `PRODUCER_SCOPE`
 * by tests/adminAlerts/_metaGlobalScopeCodes.test.ts. That is the same
 * lib-declares / test-pins idiom `ATTENTION_ROUTES` uses
 * (lib/admin/attentionItems.ts:109, pinned by
 * tests/admin/_metaAttentionRoutes.test.ts) — a producer-scope reclassification
 * fails CI instead of drifting silently.
 *
 * A code carrying BOTH a global and a per-show producer row is deliberately
 * ABSENT: it can reach a show modal, so it is not global-only. That is the
 * fail-safe direction — a reachable code keeps its surface.
 *
 * NOT an audience list. Five of these nine are health-audience and are already
 * filtered upstream by `HEALTH_CODES`; scope and audience are orthogonal axes.
 */
export const GLOBAL_SCOPE_CODES: ReadonlySet<string> = new Set([
  "CALLBACK_CLAIM_THREW",
  "GITHUB_BOT_LOGIN_MISSING",
  "LIVE_ROW_CONFLICT",
  "ONBOARDING_SHEET_UNREADABLE",
  "PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED",
  "PICKER_BOOTSTRAP_RPC_FAILED",
  "SYNC_STALLED",
  "WATCH_CHANNEL_ORPHANED",
  "WEBHOOK_TOKEN_INVALID",
]);
