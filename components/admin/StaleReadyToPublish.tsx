/**
 * components/admin/StaleReadyToPublish.tsx (M10 §B Task 10.1 §B / Phase 2)
 *
 * Rendered by app/admin/page.tsx when wizard_finalize_checkpoints.status
 * is 'all_batches_complete' AND last_processed_at <= now() - 24h (the
 * "stale" branch). Either Phase D has been failing OR the operator
 * abandoned the wizard between batch-complete and Publish. Surface
 * exposes BOTH "Publish all" (retry Phase D) AND "Discard this setup
 * and start over" (cleanup) per plan §M10 Task 10.1 finding 3.
 *
 * Render-time staleness check is informational only. The destructive
 * cleanup action is gated by the helper's DB-clock CAS (Task 10.1
 * finding 1 helper guards 3 + 4); app-vs-DB clock skew can flicker the
 * rendered surface between <ReadyToPublish /> and <StaleReadyToPublish />
 * at the 24h boundary, but cannot authorize a destructive action
 * against a fresh checkpoint.
 */
import { RunFinalCASButton } from "@/components/admin/RunFinalCASButton";
import { CleanupAbandonedFinalizeButton } from "@/components/admin/CleanupAbandonedFinalizeButton";

type StaleReadyToPublishProps = { sessionId: string };

export function StaleReadyToPublish({ sessionId }: StaleReadyToPublishProps) {
  return (
    <main
      data-testid="admin-stale-ready-to-publish"
      className="mx-auto flex max-w-2xl flex-col gap-section-gap"
    >
      <header className="flex flex-col gap-2">
        <p
          className="text-xs font-medium uppercase text-text-subtle"
          style={{ letterSpacing: "var(--tracking-eyebrow)" }}
        >
          Admin
        </p>
        <h2 className="text-2xl font-semibold text-text-strong">
          Setup is paused. Your shows are ready but have not gone live yet.
        </h2>
        <p className="max-w-prose text-base text-text-subtle">
          All sheets have been processed and are waiting to be published. You
          can finish publishing them now, or, if something has changed and you
          would rather start over, discard this setup and run it again.
        </p>
      </header>

      <section
        aria-labelledby="stale-ready-to-publish-publish-heading"
        className="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad"
      >
        <h3
          id="stale-ready-to-publish-publish-heading"
          className="text-lg font-semibold text-text-strong"
        >
          Finish publishing
        </h3>
        <p className="max-w-prose text-sm text-text-subtle">
          Retry the final publish step. If it succeeded this time, your
          shows go live and the setup wizard closes.
        </p>
        <RunFinalCASButton sessionId={sessionId} />
      </section>

      <section
        aria-labelledby="stale-ready-to-publish-discard-heading"
        className="flex flex-col gap-3 rounded-md border border-border bg-surface-sunken p-tile-pad"
      >
        <h3
          id="stale-ready-to-publish-discard-heading"
          className="text-lg font-semibold text-text-strong"
        >
          Discard and start fresh
        </h3>
        <p className="max-w-prose text-sm text-text-subtle">
          If something has changed and you would rather start over, you can
          discard this setup. The shows from this wizard run are deleted; any
          shows you already had live are not touched.
        </p>
        <CleanupAbandonedFinalizeButton sessionId={sessionId} />
      </section>
    </main>
  );
}
