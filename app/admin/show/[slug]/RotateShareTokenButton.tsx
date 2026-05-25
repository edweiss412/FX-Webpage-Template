"use client";

/**
 * app/admin/show/[slug]/RotateShareTokenButton.tsx (M11.5 §B Task F3)
 *
 * Section-level admin action that rotates the show's share-token via
 * Pin-2's `rotateShareToken({ showId })` Server Action. The RPC also
 * bumps shows.picker_epoch atomically (R40), so existing devices'
 * picker cookies and the old URL go stale together — Doug re-shares
 * the new URL.
 *
 * UX:
 *   - Two-tap state machine (idle → confirm → resolving → idle).
 *   - Confirm copy WARNS that the existing URL will stop working.
 *   - On success: render the new full URL with a Copy button.
 *   - On failure: generic refused banner (the typed code surfaces
 *     to admin_alerts via the action body, not to the UI).
 */

import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { rotateShareToken } from "@/lib/auth/picker/rotateShareToken";

const AUTO_REVERT_MS = 3_000;

type UiState = "idle" | "confirm" | "resolving";
type Result =
  | { ok: true; new_share_token: string; new_epoch: number }
  | { ok: false; code: string }
  | null;

export function RotateShareTokenButton({
  showId,
  slug,
}: {
  showId: string;
  slug: string;
}) {
  const router = useRouter();
  const [ui, setUi] = useState<UiState>("idle");
  const [result, setResult] = useState<Result>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const autoRevertRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoRevert = () => {
    if (autoRevertRef.current !== null) {
      clearTimeout(autoRevertRef.current);
      autoRevertRef.current = null;
    }
  };
  const clearCopyReset = () => {
    if (copyResetRef.current !== null) {
      clearTimeout(copyResetRef.current);
      copyResetRef.current = null;
    }
  };

  useEffect(
    () => () => {
      clearAutoRevert();
      clearCopyReset();
    },
    [],
  );

  useEffect(() => {
    if (!isPending && result !== null && ui === "resolving") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUi("idle");
    }
  }, [isPending, result, ui]);

  const onRotateClick = () => {
    clearAutoRevert();
    setUi("confirm");
    autoRevertRef.current = setTimeout(() => {
      setUi((prev) => (prev === "confirm" ? "idle" : prev));
    }, AUTO_REVERT_MS);
  };

  const onCancelClick = () => {
    clearAutoRevert();
    setUi("idle");
  };

  const onConfirmClick = () => {
    clearAutoRevert();
    setUi("resolving");
    setCopied(false);
    startTransition(async () => {
      const r = await rotateShareToken({ showId });
      setResult(r);
      if (r.ok) {
        // Re-render the admin show page server-side so
        // <CurrentShareLinkPanel> re-reads the new share token. Rotate's
        // own success banner shows the new URL directly; this keeps the
        // persistent panel in sync without a hard navigation.
        router.refresh();
      }
    });
  };

  const onCopyClick = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearCopyReset();
      copyResetRef.current = setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Clipboard unavailable — the URL is still visible for manual
      // selection; no destructive consequence.
    }
  };

  const newUrl =
    result?.ok && typeof window !== "undefined"
      ? `${window.location.origin}/show/${slug}/${result.new_share_token}`
      : null;
  const refusedMessage =
    result && result.ok === false
      ? "Couldn't rotate the share-token. Please try again."
      : null;
  const isResolving = ui === "resolving" || isPending;

  if (ui === "idle") {
    return (
      <div className="flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={onRotateClick}
          data-testid="admin-rotate-share-token-button"
          className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center gap-2 rounded-sm border border-warning-text/60 bg-surface px-4 py-2 font-medium text-warning-text transition-colors duration-fast hover:bg-warning-bg/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <AlertTriangle aria-hidden="true" size={16} />
          Rotate share-token
        </button>
        {newUrl && (
          <div
            data-testid="admin-rotate-share-token-ok"
            role="status"
            aria-live="polite"
            className="flex w-full max-w-md flex-col gap-1 rounded-sm bg-surface-raised px-2 py-1"
          >
            <p className="text-sm text-text-strong">
              <span
                aria-hidden="true"
                className="mr-1 font-semibold text-accent"
              >
                ✓
              </span>
              New share-link ready. Send the URL below to crew; the old
              link no longer works.
            </p>
            <div className="flex items-center gap-2">
              <code
                data-testid="admin-rotate-share-token-url"
                title={newUrl}
                className="min-w-0 flex-1 truncate rounded-sm bg-surface px-2 py-1 text-xs text-text-strong"
              >
                {newUrl}
              </code>
              <button
                type="button"
                onClick={() => void onCopyClick(newUrl)}
                data-testid="admin-rotate-share-token-copy-button"
                aria-live="polite"
                aria-label={copied ? "URL copied to clipboard" : "Copy URL"}
                className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-3 py-1.5 text-sm font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}
        {refusedMessage && (
          <p
            data-testid="admin-rotate-share-token-refused"
            role="alert"
            className="rounded-sm bg-warning-bg px-2 py-1 text-sm text-warning-text"
          >
            <span className="font-medium">Last attempt:</span> {refusedMessage}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="admin-rotate-share-token-confirm-row"
      role="group"
      aria-label="Confirm rotating the share-token for this show"
      className="flex flex-col items-end gap-2"
    >
      <p className="text-sm text-text-subtle">
        The existing show URL will stop working. Crew need the new URL to
        reach the page.
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onConfirmClick}
          disabled={isResolving}
          aria-busy={isResolving}
          data-testid="admin-rotate-share-token-confirm-button"
          className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-4 py-2 font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isResolving ? "Rotating…" : "Confirm rotate"}
        </button>
        <button
          type="button"
          onClick={onCancelClick}
          disabled={isResolving}
          data-testid="admin-rotate-share-token-cancel-button"
          className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm border border-border bg-surface px-4 py-2 text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
