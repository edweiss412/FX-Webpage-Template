"use client";

/**
 * app/admin/show/[slug]/ShareLinkBody.tsx
 *
 * Body of the "Current share-link" card (surface C). Consumes ShareTokenProvider
 * so the URL / Copy / "Email crew" affordances reflect the current token instantly
 * after a rotate (and stay sound under refresh reordering via the epoch gate).
 * Renders the rotate row (wired to the shared cache via onRotated) and the
 * server-passed reset control. The card chrome + heading live in the server
 * CurrentShareLinkPanel shell.
 */

import type { ReactNode } from "react";
import { Mail } from "lucide-react";

import { useShareToken } from "./ShareTokenContext";
import { resolveOrigin } from "./resolveOrigin";
import { buildCrewLinkMailtos } from "./crewLinkMailto";
import { ShareLinkCopyButton } from "./ShareLinkCopyButton";
import { RotateShareTokenButton } from "./RotateShareTokenButton";

export function ShareLinkBody({
  slug,
  showId,
  crewEmails = [],
  showTitle = "",
  isCrewLinkActive,
  resetSlot,
}: {
  slug: string;
  showId: string;
  crewEmails?: readonly string[];
  showTitle?: string;
  isCrewLinkActive: boolean;
  resetSlot: ReactNode;
}) {
  const { token, applyRotated } = useShareToken();
  const url = token ? `${resolveOrigin()}/show/${slug}/${token}` : null;
  const emailMailtos = url ? buildCrewLinkMailtos({ emails: crewEmails, url, showTitle }) : [];

  return (
    <>
      {url ? (
        <>
          <div className="flex items-start gap-2">
            <code
              data-testid="admin-current-share-link-url"
              className="min-w-0 flex-1 break-all rounded-sm bg-surface-sunken px-2 py-1 text-xs text-text-strong"
            >
              {url}
            </code>
            <ShareLinkCopyButton url={url} />
          </div>
          {emailMailtos.length > 1 && (
            <p
              data-testid="admin-current-share-link-email-note"
              className="text-xs text-text-subtle"
            >
              Your crew list needs {emailMailtos.length} separate emails. Send each one; addresses go
              in Bcc.
            </p>
          )}
          {emailMailtos.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {emailMailtos.map((m) => (
                <a
                  key={m.batch}
                  href={m.href}
                  data-testid="admin-current-share-link-email-button"
                  className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center gap-1.5 rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  <Mail aria-hidden="true" size={14} />
                  {m.batchCount === 1
                    ? "Email this link to crew"
                    : `Email this link to crew (${m.batch} of ${m.batchCount})`}
                </a>
              ))}
            </div>
          )}
        </>
      ) : (
        <p
          data-testid="admin-current-share-link-unavailable"
          role="status"
          className="text-sm text-text-subtle"
        >
          The share-link is unavailable right now. Refresh the page; if the problem repeats, rotate
          to mint a new link.
        </p>
      )}
      <div className="flex flex-col divide-y divide-border border-t border-border">
        <RotateShareTokenButton
          showId={showId}
          slug={slug}
          isCrewLinkActive={isCrewLinkActive}
          onRotated={applyRotated}
          compact
          rowLabel="Rotate share link"
          rowDescription="Mint a new link; the old one stops working immediately."
        />
        {resetSlot}
      </div>
    </>
  );
}
