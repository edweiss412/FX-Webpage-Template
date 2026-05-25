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

export function ShareLinkCopyButton({ url }: { url: string }) {
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
    <button
      type="button"
      onClick={() => void onClick()}
      data-testid="admin-current-share-link-copy-button"
      aria-live="polite"
      aria-label={copied ? "URL copied to clipboard" : "Copy URL"}
      className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-3 py-1.5 text-sm font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
