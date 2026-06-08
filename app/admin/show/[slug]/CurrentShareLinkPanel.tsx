/**
 * app/admin/show/[slug]/CurrentShareLinkPanel.tsx (M11.5 §B Task F2.5)
 *
 * Read-only admin surface displaying the current share-link URL for a show,
 * with a Copy button. The token itself is admin-only data (R41 P-R17 Fix-2:
 * `show_share_tokens` is REVOKE'd from `authenticated` and only exposed via
 * the `admin_read_share_token` SECURITY DEFINER RPC, which gates on
 * `public.is_admin()` reading the cookie-bound JWT).
 *
 * Server Component shell calls `loadShowShareToken(showId)`; on null OR
 * thrown error, renders an "unavailable" notice rather than a broken
 * `/show/<slug>/null` URL (kickoff brief watchpoint).
 *
 * The Copy interaction is isolated in `<ShareLinkCopyButton>` (a sibling
 * 'use client' component) so the rest of the panel remains server-rendered.
 *
 * Spec: docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-23-crew-auth-pivot-show-link-picker.md:3580
 *   - F2.5 component contract (admin-only, post-rotate revalidate flow).
 *   - lib/data/loadShowShareToken.ts:13 (cookie-bound RPC caller).
 *
 * Update-after-rotate flow: `<RotateShareTokenButton>` triggers
 * `router.refresh()` on success; Next re-renders the admin show page from
 * the server, this panel re-reads the new token, and the displayed URL
 * updates without a hard navigation. The previous URL displayed inside
 * Rotate's own success banner is the authoritative "what to copy now" — this
 * panel is the persistent reminder that shows the same thing on next visit.
 */
import type { ReactNode } from "react";
import { loadShowShareToken } from "@/lib/data/loadShowShareToken";

import { ShareLinkCopyButton } from "./ShareLinkCopyButton";
// resolveOrigin moved to a standalone client-safe module (Task 10) so the
// client RotateShareTokenButton can share it without importing this server
// module's loadShowShareToken into the client bundle.
import { resolveOrigin } from "./resolveOrigin";

export async function CurrentShareLinkPanel({
  showId,
  slug,
  token: tokenProp,
  actions,
}: {
  showId: string;
  slug: string;
  /**
   * M12.5 — optional management actions (Rotate share link, Reset name picker)
   * rendered INSIDE this card as a divider-separated block, both when a token
   * exists and when it's unavailable (rotate must stay reachable after a failed
   * token read — spec §6 R1/R27). Omit for standalone read-only use.
   */
  actions?: ReactNode;
  /**
   * M12.2 Phase A (Codex R2) — single render-scoped token snapshot. When the
   * caller has ALREADY read the share token (the per-show page reads it once
   * for the header chip), it passes that exact value here so the header and
   * this panel can never render two different token snapshots from a
   * concurrent rotation. When omitted (`undefined`), the panel falls back to
   * reading it itself (standalone use). `null` means "read failed / no token".
   */
  token?: string | null;
}) {
  let token: string | null;
  if (tokenProp !== undefined) {
    token = tokenProp;
  } else {
    try {
      token = await loadShowShareToken(showId);
    } catch {
      token = null;
    }
  }

  if (!token) {
    return (
      <div
        data-testid="admin-current-share-link-panel"
        className="flex w-full max-w-md flex-col gap-2 rounded-sm border border-border bg-surface p-tile-pad"
      >
        <h3 className="text-sm font-semibold text-text-strong">
          Current share-link
        </h3>
        <p
          data-testid="admin-current-share-link-unavailable"
          role="status"
          className="text-sm text-text-subtle"
        >
          The share-link is unavailable right now. Refresh the page; if the
          problem repeats, rotate to mint a new link.
        </p>
        {actions}
      </div>
    );
  }

  const url = `${resolveOrigin()}/show/${slug}/${token}`;

  return (
    <div
      data-testid="admin-current-share-link-panel"
      className="flex w-full max-w-md flex-col gap-2 rounded-sm border border-border bg-surface p-tile-pad"
    >
      <h3 className="text-sm font-semibold text-text-strong">
        Current share-link
      </h3>
      <p className="text-xs text-text-subtle">
        Send this URL to the crew. Rotate to mint a new one if it leaks.
      </p>
      <div className="flex items-start gap-2">
        <code
          data-testid="admin-current-share-link-url"
          className="min-w-0 flex-1 break-all rounded-sm bg-surface-sunken px-2 py-1 text-xs text-text-strong"
        >
          {url}
        </code>
        <ShareLinkCopyButton url={url} />
      </div>
      {actions}
    </div>
  );
}
