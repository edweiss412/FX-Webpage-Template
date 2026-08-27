"use client";

/**
 * components/admin/telemetry/TelemetryRetryButton.tsx
 *
 * The recourse half of every infra fallback on the telemetry page
 * (BL-TELEMETRY-FALLBACK-RETRY, #601 impeccable critique P1). Each of the three states
 * the cause and offers nothing to do about it, so the only way to re-read is a full page
 * reload. One of the three even says "Refresh in a moment.", instructing the reader to do
 * by hand what this button does.
 *
 * It is the manual-refresh idiom this page already carries: same rotate icon, same one-tap
 * contract, same `router.refresh()` (`AutoRefreshControl.tsx:19`). Deliberately NOT the
 * same border token. That button stands on `bg-surface`; all three fallbacks are
 * `bg-warning-bg`, where `text-faint` misses the 3:1 non-text floor in one theme, so
 * tinted plates get their own outline token (2026-08-25 ui-polish-class-sweep D2). That is
 * enforced: `tests/styles/tintedPlateOutline.test.ts` derives its subjects from the
 * ring-offset token, so this control enrols on arrival.
 *
 * No pending state, deliberately. `router.refresh()` returns no in-flight signal, the
 * control this mirrors has none either, and a disable would introduce the one piece of
 * state that could strand a surface whose entire defect is having no recourse.
 *
 * The status region is mounted WITH the button and filled on activation. A live region
 * inserted together with its text is never announced. The parity toggle is why a SECOND
 * failed attempt is heard at all: repeating an identical string into a live region is
 * silence (`components/admin/ShowRowActions.tsx:608` uses the same trick).
 *
 * `what` is a noun phrase naming the thing being re-read, and all three strings derive
 * from it, so a call site cannot spell the label and the announcement differently.
 */
import { RotateCw } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** The visible label, identical at every site: the button does the same thing everywhere,
 *  and the accessible name carries the site-specific half. */
export const TELEMETRY_RETRY_TEXT = "Try again";
/** Opens with the visible text (WCAG 2.5.3, label in name), then names what is being
 *  retried, for someone who lands on the control out of context. */
export const retryLabel = (what: string) => `${TELEMETRY_RETRY_TEXT} to load ${what}`;
export const retryAnnouncement = (what: string) => `Retrying ${what}`;

export function TelemetryRetryButton({ what, testId }: { what: string; testId: string }) {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);

  return (
    <>
      <button
        type="button"
        data-testid={testId}
        aria-label={retryLabel(what)}
        onClick={() => {
          setAttempts((n) => n + 1);
          router.refresh();
        }}
        className="inline-flex min-h-tap-min shrink-0 items-center justify-center gap-1.5 rounded-sm border border-control-outline-tinted bg-bg px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg"
      >
        <RotateCw className="size-4" aria-hidden />
        {TELEMETRY_RETRY_TEXT}
      </button>
      <span role="status" aria-live="polite" className="sr-only" data-testid={`${testId}-status`}>
        {attempts === 0
          ? ""
          : attempts % 2 === 1
            ? retryAnnouncement(what)
            : `${retryAnnouncement(what)}\u00A0`}
      </span>
    </>
  );
}
