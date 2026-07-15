/**
 * app/admin/show/[slug]/CurrentShareLinkPanel.tsx
 *
 * Server shell for the "Current share-link" card: card chrome + heading +
 * description. The token-dependent body (URL / Copy / email / unavailable) and the
 * rotate + reset actions live in the client <ShareLinkBody>, which reads the token
 * from <ShareTokenProvider> (seeded server-side in page.tsx). This keeps the
 * admin-only token read on the server while letting a rotate update the URL
 * instantly across every crew-URL surface.
 *
 * Spec: docs/superpowers/specs/2026-07-10-share-link-instant-rotate-dedup-design.md §3.6.
 */
import type { ReactNode } from "react";

import { ShareLinkBody } from "./ShareLinkBody";

export function CurrentShareLinkPanel({
  slug,
  showId,
  crewEmails = [],
  showTitle = "",
  isCrewLinkActive = true,
  resetSlot,
}: {
  slug: string;
  showId: string;
  crewEmails?: readonly string[];
  showTitle?: string;
  isCrewLinkActive?: boolean;
  resetSlot?: ReactNode;
}) {
  return (
    <div
      data-testid="admin-current-share-link-panel"
      className="flex w-full max-w-md flex-col gap-2 rounded-sm border border-border bg-surface p-tile-pad"
    >
      <h3 className="text-sm font-semibold text-text-strong">Current share-link</h3>
      <p className="text-xs text-text-subtle">
        Send this URL to the crew. Rotate to mint a new one if it leaks.
      </p>
      <ShareLinkBody
        slug={slug}
        showId={showId}
        crewEmails={crewEmails}
        showTitle={showTitle}
        isCrewLinkActive={isCrewLinkActive}
        resetSlot={resetSlot}
      />
    </div>
  );
}
