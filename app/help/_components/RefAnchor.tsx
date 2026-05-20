"use client";

import type { ReactNode } from "react";

const VALID_ID = /^(MI-\d+[a-z]?_)?[A-Z][A-Z0-9_]*$/;
const VALID_AS: Set<string> = new Set(["h2", "h3"]);

// r5 fix per D-r4 finding 1: RefAnchor defaults to h2 (Phase E uses it as
// section heading for help pages). /help/errors uses h3 for per-code entries
// beneath the page's own h1/h2; pass `as="h3"` for that case.
export function RefAnchor({
  id,
  as = "h2",
  children,
}: {
  id: string;
  as?: "h2" | "h3";
  children: ReactNode;
}) {
  if (!VALID_ID.test(id)) {
    throw new Error(
      `<RefAnchor id="${id}"> — id must match /^(MI-\\d+[a-z]?_)?[A-Z][A-Z0-9_]*$/ (catalog code shape: standard \`SCREAMING_SNAKE\` or MI-class \`MI-N[a-z]_BODY\`).`,
    );
  }
  if (!VALID_AS.has(as)) {
    throw new Error(
      `<RefAnchor as="${as}"> — as must be "h2" or "h3" (MDX call sites are not typechecked).`,
    );
  }
  const Tag = as;
  // h2 is larger; h3 smaller. Style accordingly.
  const className =
    as === "h2"
      ? "mt-10 mb-3 text-xl font-semibold text-text-strong group flex items-center gap-2"
      : "mt-8 mb-2 text-lg font-semibold text-text-strong group flex items-center gap-2";

  // Codex R2 MEDIUM fix: spec §6.2 / aria-label contract advertises copy-to-
  // clipboard. ADD navigator.clipboard.writeText; do NOT preventDefault so
  // the fragment navigation still fires (middle-click "open in new tab"
  // continues to work). Clipboard is gated on https/localhost, so wrap in
  // try/catch — fallback is the default <a href> navigation.
  const handleCopyClick = () => {
    try {
      const url = `${window.location.origin}${window.location.pathname}#${id}`;
      void navigator.clipboard?.writeText?.(url);
    } catch {
      // Clipboard unavailable; the default <a href> navigation still fires.
    }
  };

  return (
    <Tag id={id} className={className}>
      {children}
      <a
        href={`#${id}`}
        onClick={handleCopyClick}
        aria-label="Copy link to this section"
        className="inline-flex h-11 w-11 -my-2 items-center justify-center rounded text-text opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity text-sm"
      >
        🔗
      </a>
    </Tag>
  );
}
