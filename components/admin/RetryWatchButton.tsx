"use client";

/**
 * components/admin/RetryWatchButton.tsx (Task 10 — spec §3.4.2)
 *
 * Single-tap retry for WATCH_CHANNEL_ORPHANED. No two-tap confirm — retry is
 * safe/idempotent (unlike ResolveAlertButton's destructive Dismiss). Pending
 * derives ONLY from useFormStatus (child-of-form; M9-D-C4-1) — there is NO local
 * flag, so the button re-enables automatically when the Server Action returns,
 * even on a failure path that skips revalidatePath. Labels are UI chrome
 * (uncataloged, like "Dismiss"/"Details"; spec §6 chrome-vs-catalog).
 *
 * Reused by two surfaces via props: the AlertBanner action slot uses the
 * defaults ("Retry now" / testId "admin-alert-retry-button", spec §3.4.2), and
 * the Settings Drive panel (Task 12) passes idleLabel="Retry connection" +
 * testId="drive-connection-retry-button" (spec §3.6). Both wrap this island in a
 * <form action={retryWatchSubscriptionFormAction}>.
 */
import { useFormStatus } from "react-dom";
import { AccentButton, type AccentButtonRingOffset } from "@/components/shared/AccentButton";

export function RetryWatchButton({
  idleLabel = "Retry now",
  pendingLabel = "Retrying…",
  testId = "admin-alert-retry-button",
  ringOffset = "warning-bg",
}: {
  idleLabel?: string;
  pendingLabel?: string;
  testId?: string;
  // Focus ring-offset must match the surface the button sits on (the
  // AccentButton contract): warning-bg on the alert banner, surface on the
  // Settings Drive panel card.
  ringOffset?: AccentButtonRingOffset;
}) {
  const { pending } = useFormStatus();
  return (
    <AccentButton
      type="submit"
      data-testid={testId}
      disabled={pending}
      aria-busy={pending}
      fontWeight="medium"
      minWidthTap
      ringOffset={ringOffset}
    >
      {pending ? pendingLabel : idleLabel}
    </AccentButton>
  );
}
