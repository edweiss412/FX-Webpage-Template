"use client";

/**
 * app/admin/show/[slug]/ShareChip.tsx
 *
 * Header share chip (surface A): the pill next to the show title showing the
 * crew-link path + a compact Copy button. Consumes ShareTokenProvider so a rotate
 * updates it instantly (previously it was server-rendered and refresh-lagged).
 * Renders nothing unless the show is crew-link-eligible AND a token is present.
 * Markup mirrors the prior inline chip in page.tsx.
 */

import { useShareToken } from "./ShareTokenContext";
import { resolveOrigin } from "./resolveOrigin";
import { ShareLinkCopyButton } from "./ShareLinkCopyButton";

export function ShareChip({ slug, isEligible }: { slug: string; isEligible: boolean }) {
  const { token } = useShareToken();
  if (!isEligible || token == null) return null;

  const url = `${resolveOrigin()}/show/${slug}/${token}`;
  const path = `/show/${slug}/${token}`;

  return (
    <div
      data-testid="admin-show-share-chip"
      title={url}
      className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-pill border border-border bg-surface px-2.5 py-1 text-xs text-text-subtle"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-3.5 shrink-0 text-text-subtle"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
      <code className="min-w-0 truncate font-mono text-text-strong">{path}</code>
      <ShareLinkCopyButton url={url} compact />
    </div>
  );
}
