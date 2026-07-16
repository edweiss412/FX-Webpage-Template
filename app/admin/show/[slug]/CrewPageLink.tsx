"use client";

/**
 * app/admin/show/[slug]/CrewPageLink.tsx
 *
 * "Open crew page" link (surface B) in the Crew section. Consumes
 * ShareTokenProvider so the href tracks the current token instantly after a rotate.
 * Renders nothing unless crew-link-eligible AND a token is present. Markup mirrors
 * the prior inline anchor in page.tsx (opens the real crew URL in a new tab).
 */

import { useShareToken } from "./ShareTokenContext";
import { resolveOrigin } from "./resolveOrigin";

export function CrewPageLink({ slug, isEligible }: { slug: string; isEligible: boolean }) {
  const { token } = useShareToken();
  if (!isEligible || token == null) return null;

  const url = `${resolveOrigin()}/show/${slug}/${token}`;

  return (
    <a
      data-testid="admin-show-open-crew"
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label="Open crew page"
      className="inline-flex min-h-tap-min items-center text-sm font-semibold text-accent-on-bg underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
    >
      Open crew page →
    </a>
  );
}
