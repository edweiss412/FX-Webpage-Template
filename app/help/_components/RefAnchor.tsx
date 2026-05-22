"use client";

import type { ReactNode } from "react";

const VALID_ID = /^(MI-\d+[a-z]?_)?[A-Z][A-Z0-9_]*$/;
const VALID_AS: Set<string> = new Set(["h2", "h3"]);

/**
 * RefAnchor — catalog-code section headings with a copy-link affordance.
 *
 * **D.5 catalog-vs-chapter contract (ratified Phase D rounds R3–R6).** RefAnchor
 * is reserved for catalog-code-shaped ids only — SCREAMING_SNAKE_CASE or
 * MI-N[a-z]_BODY (per the §6.3 r15 amendment + Phase D Codex R3 fix `504b533`).
 * Chapter section anchors (kebab-case slugs like `staged-review-card`,
 * `active-shows`, `step-2`) live on plain `<h2 id="...">` elements with NO
 * copy-link affordance. The "expand the regex to accept kebab" path was offered
 * and RETIRED in Phase D r6 — do not widen `VALID_ID` further.
 *
 * Why the split: catalog codes are the surface that crew/admin SHARE via
 * deep-link (URL?code=… → /help/errors#CODE). Chapter sections are read in-page
 * during sequential walkthrough; they're not load-bearing as shareable anchors.
 * The copy-link 🔗 affordance is only earned where deep-linking is the use case.
 *
 * Structural enforcement: `tests/help/page-{review-queues,per-show-panel,
 * preview-as-crew}.test.tsx` assert raw `<h2 id="kebab-…">` on non-catalog
 * anchors; the H.1 anchor resolver (`tests/help/anchor-resolver.test.ts`)
 * accepts both shapes via `containsAnchor()`. If a new page needs a copy-link-
 * worthy anchor that isn't catalog-shaped, surface the design question rather
 * than relaxing `VALID_ID`.
 *
 * Defaults to `as="h2"` (Phase E section heading). `/help/errors` uses
 * `as="h3"` for per-code entries beneath the page's own h1/h2.
 */
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
        className="inline-flex size-11 -my-2 items-center justify-center rounded text-text md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:focus-visible:opacity-100 transition-opacity text-sm"
      >
        🔗
      </a>
    </Tag>
  );
}
