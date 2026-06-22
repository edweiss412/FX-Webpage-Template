/**
 * components/admin/ReadyToPublish.tsx (M10 §B Task 10.1 §B / Phase 2)
 *
 * Rendered by app/admin/page.tsx when wizard_finalize_checkpoints.status
 * is 'all_batches_complete' AND last_processed_at > now() - 24h (the
 * "fresh" branch). The only forward path is Phase D's "Publish all"
 * (cleanup at this stage would discard fully-approved shows seconds
 * from publication, so NO cleanup affordance per plan §M10 Task 10.1
 * finding 2).
 */
import { RunFinalCASButton } from "@/components/admin/RunFinalCASButton";

type ReadyToPublishProps = { sessionId: string };

export function ReadyToPublish({ sessionId }: ReadyToPublishProps) {
  return (
    <main
      data-testid="admin-ready-to-publish"
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
          Ready to publish. One click makes your shows live.
        </h2>
        <p className="max-w-prose text-base text-text-subtle">
          All sheets have been processed. Click Publish to flip them visible to crew and connect
          your folder for ongoing syncs.
        </p>
      </header>

      <section className="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad">
        <RunFinalCASButton sessionId={sessionId} />
      </section>
    </main>
  );
}
