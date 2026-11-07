"use client";
/**
 * components/shared/ReportQueueStatus.tsx
 *
 * The reports this phone is holding, shown beside the crew report button, and
 * the page's sender for them (crew offline spec 2026-10-26 §5.1).
 *
 * Counts are for this show. The sender is phone-wide: any crew page can send any
 * held report, because the record carries the whole request, so the 60-second
 * timer runs while anything on the phone is queued, not just this show's.
 *
 * The status region is mounted from the first render and only its text changes,
 * because a screen reader announces a mutation, not an insertion. The visible
 * waiting line is hidden from readers for that reason, and the failed count sits
 * outside the region because a live region must not hold a control.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { ReportModal } from "@/components/shared/ReportModal";
import { listReports, subscribeQueue, type QueuedReport } from "@/lib/reports/offlineQueue";
import { reportSender } from "@/lib/reports/offlineSender";

/** How often a page tries again while any report is queued (spec 5.1). */
const QUEUE_SEND_INTERVAL_MS = 60_000;

function waitingLabel(count: number): string {
  return count === 1 ? "1 report waiting for signal" : `${count} reports waiting for signal`;
}

function failedLabel(count: number): string {
  return count === 1 ? "1 report couldn't be sent" : `${count} reports couldn't be sent`;
}

export function ReportQueueStatus({
  showId,
  onReturnFocus,
}: {
  showId: string;
  /** Where focus goes when the failed count it came from is gone. */
  onReturnFocus?: () => void;
}): ReactNode {
  const [reports, setReports] = useState<readonly QueuedReport[]>([]);
  const [resending, setResending] = useState<QueuedReport | null>(null);
  const [ready, setReady] = useState(false);
  const failedButton = useRef<HTMLButtonElement | null>(null);

  // A monotonic ordinal: two reads can settle out of order, and the older list
  // must not paint over the newer one.
  const lastRead = useRef(0);
  const refresh = useCallback(async (): Promise<void> => {
    lastRead.current += 1;
    const read = lastRead.current;
    const next = await listReports();
    if (read !== lastRead.current) return;
    setReports(next);
    reportSender.noteQueued(next.filter((report) => report.status === "queued").length);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeQueue(() => void refresh());
    const sendNow = (): void => {
      void reportSender.send();
    };
    const onVisibility = (): void => {
      if (document.visibilityState !== "visible") return;
      void refresh();
      sendNow();
    };
    window.addEventListener("online", sendNow);
    document.addEventListener("visibilitychange", onVisibility);
    void refresh().then(() => setReady(true));
    sendNow();
    return () => {
      unsubscribe();
      window.removeEventListener("online", sendNow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const anyQueued = reports.some((report) => report.status === "queued");
  useEffect(() => {
    if (!anyQueued) return;
    const timer = setInterval(() => {
      void refresh();
      void reportSender.send();
    }, QUEUE_SEND_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [anyQueued, refresh]);

  const here = reports.filter((report) => report.showId === showId);
  const waiting = here.filter((report) => report.status === "queued").length;
  const failed = here.filter((report) => report.status === "failed");

  /**
   * The modal puts focus back on the failed count as it closes. If that count is
   * about to disappear, focus would fall to the page, so it moves on first.
   */
  const closeResend = async (): Promise<void> => {
    setResending(null);
    const next = await listReports();
    const stillFailed = next.some(
      (report) => report.showId === showId && report.status === "failed",
    );
    if (!stillFailed) {
      onReturnFocus?.();
      return;
    }
    // A refused resend can recreate the count, so the node the modal returned
    // focus to may be gone: focus the one on screen now, if focus fell.
    const active = document.activeElement;
    if (active === null || active === document.body) failedButton.current?.focus();
  };

  const announcement = [
    waiting > 0 ? waitingLabel(waiting) : null,
    failed.length > 0 ? failedLabel(failed.length) : null,
  ]
    .filter((line) => line !== null)
    .join(". ");

  return (
    <>
      <p
        role="status"
        data-testid="report-queue-region"
        data-queue-ready={ready ? "true" : undefined}
        className="sr-only"
      >
        {announcement}
      </p>
      {waiting > 0 || failed.length > 0 ? (
        <div className="order-last flex min-w-0 basis-full flex-wrap items-center gap-2 md:order-0 md:shrink-0 md:basis-auto md:flex-col md:items-end md:gap-1">
          {waiting > 0 ? (
            <span
              aria-hidden="true"
              data-testid="report-queue-waiting"
              className="rounded-pill bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning-text"
            >
              {waitingLabel(waiting)}
            </span>
          ) : null}
          {failed[0] ? (
            <button
              ref={failedButton}
              type="button"
              aria-haspopup="dialog"
              data-testid="report-queue-failed"
              onClick={() => setResending(failed[0] ?? null)}
              className="inline-flex min-h-tap-min items-center gap-1.5 rounded-sm border border-warning-text bg-warning-bg px-2.5 text-sm font-semibold text-warning-text transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3l9.5 17h-19z" />
                <path d="M12 10v4M12 17.5v.01" />
              </svg>
              {failedLabel(failed.length)}
            </button>
          ) : null}
        </div>
      ) : null}
      {resending ? (
        <ReportModal
          open
          onOpenChange={(open) => {
            if (!open) void closeResend();
          }}
          surface="crew"
          surfaceId={resending.surfaceId}
          showId={resending.showId}
          failedReport={resending}
        />
      ) : null}
    </>
  );
}
