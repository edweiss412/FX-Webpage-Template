"use client";

/**
 * app/admin/show/[slug]/ShareLinkCopyButton.tsx (M11.5 §B Task F2.5)
 *
 * Isolated 'use client' Copy button for the crew-link row in the ShareHub
 * popover. It stays the smallest possible client island so the surrounding
 * share surface keeps its server-rendered chrome. (It was written for
 * CurrentShareLinkPanel, which the share-hub consolidation removed.)
 *
 * Watchpoints (kickoff brief):
 *   - The token is sensitive. Do NOT log it; do NOT hang it on a global.
 *     The URL only lives in the closed-over `url` prop + the clipboard.
 *   - `navigator.clipboard` may be unavailable (no HTTPS in dev, locked-down
 *     browser, lab environment). On failure, the visible URL is still
 *     selectable for manual copy — no destructive consequence.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/ui/cn";
import { COPY_FEEDBACK_RESET_MS } from "@/lib/ui/copyFeedback";

/**
 * Style axis (modal-header-reconciliation §6.4). Replaces the former boolean
 * `compact`: three styles cannot be spelled by two boolean states, and two
 * spellings for one axis is the defect being fixed — so the boolean is
 * REPLACED, not kept as a deprecated alias.
 *
 *   - "accent"  — the default fill. The ONLY variant with a live call site
 *                 today: the ShareHub popover's crew-link row.
 *   - "compact" — icon-only. Its call site (a per-show header pill) was deleted
 *                 with the orphaned chip; retained with test-only coverage.
 *   - "outline" — neutral bordered. Its call site (the status strip's copy-link)
 *                 was retired when the share hub absorbed it; likewise retained
 *                 with test-only coverage.
 *
 * Keeping the two call-site-less variants is deliberate, not drift: removing
 * either is a decision about this component's API, out of scope for the
 * milestones that removed their consumers.
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

  // A rotate inside the 2s confirmation window invalidates what was copied: the
  // clipboard holds the OLD url, which is already dead for the whole crew. Left
  // alone, the button keeps asserting "Copied" while the block two pixels away
  // cues that the link just changed — the confirmation and the cue contradicting
  // each other. Reset on any url change.
  //
  // Render-phase, matching how the hub derives its own cue state: an effect
  // would paint one frame of the stale label first.
  //
  // The pending reset timer is deliberately NOT cleared here — touching a ref
  // during render is forbidden, and it would be redundant anyway: the timer only
  // sets `copied` false, which this already did, and `onClick` clears it before
  // arming a new one, so a later copy cannot inherit it.
  const [seenUrl, setSeenUrl] = useState(url);
  if (seenUrl !== url) {
    setSeenUrl(url);
    if (copied) setCopied(false);
  }

  // Read by the async handler to tell "still the url I wrote" from "rotated
  // under me". Written in a LAYOUT effect, which React flushes synchronously
  // after commit and before paint — a passive `useEffect` runs after paint, and
  // round-2 review showed a promise resolving in that window compares against
  // the stale ref, wins, and re-announces "Copied" beside the new url. The
  // render-phase reset above cannot undo it, because `seenUrl` already holds the
  // new url by then.
  //
  // Not writable during render: the compiler forbids touching a ref there.
  const urlRef = useRef(url);
  useLayoutEffect(() => {
    urlRef.current = url;
  }, [url]);

  const onClick = async () => {
    // Capture the url this request is FOR. `writeText` is async, so a rotate can
    // land between the call and its resolution: without this the old promise
    // resolves, sets `copied`, and announces success next to a url the clipboard
    // does not contain — the dead one, already unusable for the whole crew.
    // The render-phase reset above only handles copies that had already
    // completed, so it cannot see this one.
    const requested = url;
    try {
      await navigator.clipboard.writeText(requested);
      if (requested !== urlRef.current) return;
      setCopied(true);
      clearReset();
      // Shared with the crew page's CopyFactValue: two clipboard controls in
      // one product should confirm for the same length of time, and a literal
      // in each is how they drift (lib/ui/copyFeedback.ts).
      resetRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_RESET_MS);
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
    compact: cn(
      "inline-flex min-h-tap-min min-w-tap-min shrink-0 items-center justify-center rounded-sm text-text-subtle transition-colors duration-fast hover:bg-surface-sunken hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
    ),
    accent: cn(
      "inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-3 py-1.5 text-sm font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
    ),
    // Neutral bordered arm (§6.4). `min-w-34` (34 x 0.25rem = 8.5rem) reserves the WIDER of
    // "Copy crew link" / "Copied" so the idle→copied swap cannot shift the
    // button's left edge — it sits at the strip row's `ml-auto` end, where a
    // width change would visibly jump. Same discipline as the Re-sync trigger.
    // The border carries NO contrast obligation (§7.1): it measures ~1.6:1 in
    // both themes and the visible label does the identifying work.
    outline: cn(
      "inline-flex min-h-tap-min min-w-34 items-center justify-center gap-1.5 rounded-sm border border-border-strong bg-transparent px-3 py-1.5 text-sm font-semibold text-text transition-colors duration-fast hover:border-border-strong hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
    ),
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
