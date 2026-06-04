"use client";

/**
 * app/admin/show/[slug]/ShareLinkCopyButton.tsx (M11.5 §B Task F2.5)
 *
 * Isolated 'use client' Copy button for <CurrentShareLinkPanel>. The parent
 * panel is a Server Component; this button is the smallest possible client
 * island so the share-link surface keeps server-rendering chrome.
 *
 * Watchpoints (kickoff brief):
 *   - The token is sensitive. Do NOT log it; do NOT hang it on a global.
 *     The URL only lives in the closed-over `url` prop + the clipboard.
 *   - `navigator.clipboard` may be unavailable (no HTTPS in dev, locked-down
 *     browser, lab environment). On failure, the visible URL is still
 *     selectable for manual copy — no destructive consequence.
 */
import { useEffect, useRef, useState } from "react";

export function ShareLinkCopyButton({
  url,
  compact = false,
}: {
  url: string;
  /**
   * #16 compact crew-chip variant: a small icon-only copy button that fits the
   * pill chip in the per-show header. Default (false) keeps the labelled
   * "Copy"/"Copied" button used by CurrentShareLinkPanel. Behavior (clipboard
   * write + sr-only announce) is identical across both variants.
   */
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearReset = () => {
    if (resetRef.current !== null) {
      clearTimeout(resetRef.current);
      resetRef.current = null;
    }
  };

  useEffect(() => () => clearReset(), []);

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearReset();
      resetRef.current = setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Clipboard unavailable — URL is still visible for manual selection.
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void onClick()}
        data-testid="admin-current-share-link-copy-button"
        aria-label={copied ? "URL copied to clipboard" : "Copy URL"}
        className={
          compact
            ? "inline-flex min-h-tap-min min-w-tap-min shrink-0 items-center justify-center rounded-sm text-text-subtle transition-colors duration-fast hover:bg-surface-sunken hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            : "inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-3 py-1.5 text-sm font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        }
      >
        {compact ? (
          copied ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )
        ) : copied ? (
          "Copied"
        ) : (
          "Copy"
        )}
      </button>
      <span
        role="status"
        aria-live="polite"
        className="sr-only"
        data-testid="admin-current-share-link-copy-announce"
      >
        {copied ? "URL copied to clipboard" : ""}
      </span>
    </>
  );
}
