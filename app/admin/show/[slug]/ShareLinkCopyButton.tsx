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

/**
 * Style axis (modal-header-reconciliation §6.4). Replaces the former boolean
 * `compact`: three styles cannot be spelled by two boolean states, and two
 * spellings for one axis is the defect being fixed — so the boolean is
 * REPLACED, not kept as a deprecated alias.
 *
 *   - "accent"  — the default fill. `CurrentShareLinkPanel` via ShareLinkBody.
 *   - "compact" — icon-only, for the per-show `ShareChip` pill.
 *   - "outline" — neutral bordered, for the published modal's control strip.
 *
 * Behavior (clipboard write, 2s reset, sr-only announce) is identical across
 * all three; only presentation and accessible-name strategy differ.
 */
export type ShareLinkCopyButtonVariant = "accent" | "compact" | "outline";

export function ShareLinkCopyButton({
  url,
  variant = "accent",
}: {
  url: string;
  variant?: ShareLinkCopyButtonVariant;
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

  const checkGlyph = (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
  const copyGlyph = (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );

  const className: Record<ShareLinkCopyButtonVariant, string> = {
    compact:
      "inline-flex min-h-tap-min min-w-tap-min shrink-0 items-center justify-center rounded-sm text-text-subtle transition-colors duration-fast hover:bg-surface-sunken hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
    accent:
      "inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-3 py-1.5 text-sm font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
    // Neutral bordered arm (§6.4). `min-w-[8.5rem]` reserves the WIDER of
    // "Copy crew link" / "Copied" so the idle→copied swap cannot shift the
    // button's left edge — it sits at the strip row's `ml-auto` end, where a
    // width change would visibly jump. Same discipline as the Re-sync trigger.
    // The border carries NO contrast obligation (§7.1): it measures ~1.6:1 in
    // both themes and the visible label does the identifying work.
    outline:
      "inline-flex min-h-tap-min min-w-[8.5rem] items-center justify-center gap-1.5 rounded-sm border border-border-strong bg-transparent px-3 py-1.5 text-sm font-semibold text-text transition-colors duration-fast hover:border-border-strong hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void onClick()}
        data-testid="admin-current-share-link-copy-button"
        // The outline arm has a VISIBLE label, so it must NOT carry an
        // aria-label — that would override and contradict what the user reads
        // (§6.4). The copied state still reaches assistive tech through the
        // sr-only live region below.
        {...(variant === "outline"
          ? {}
          : { "aria-label": copied ? "URL copied to clipboard" : "Copy URL" })}
        className={className[variant]}
      >
        {variant === "compact" ? (
          copied ? (
            checkGlyph
          ) : (
            copyGlyph
          )
        ) : variant === "outline" ? (
          <>
            {copied ? checkGlyph : copyGlyph}
            {copied ? "Copied" : "Copy crew link"}
          </>
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
