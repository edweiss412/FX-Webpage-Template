/**
 * lib/admin/watchRetryError.ts (Task 9)
 *
 * Typed throw for retryWatchSubscriptionFormAction (invariant 9: discriminable,
 * never a bare Error). Lives outside app/admin/actions.ts because that file
 * carries a top-level "use server" directive — Next.js's Server Actions
 * compiler only allows async-function exports from such a file, so a class
 * export there trips the build. Defining it here keeps the action file
 * export-clean while the action still throws this exact type.
 */
export class WatchRetryInfraError extends Error {
  readonly kind = "watch_retry_infra_error" as const;

  constructor(readonly operation: "folder_read") {
    super(`watch retry: ${operation} failed (infra)`);
    this.name = "WatchRetryInfraError";
  }
}
