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
import { loadShowShareToken } from "@/lib/data/loadShowShareToken";

import { ShareLinkCopyButton } from "./ShareLinkCopyButton";

// Exported (M12.2 Phase A Task 9/10) so the per-show header share chip AND
// RotateShareTokenButton's active-success URL build the crew URL from the SAME
// canonical NEXT_PUBLIC_SITE_ORIGIN — never window.location.origin (R28).
export function resolveOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_ORIGIN;
  if (!raw) return "http://localhost:3000";
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:3000";
  }
}

export async function CurrentShareLinkPanel({
  showId,
  slug,
}: {
  showId: string;
  slug: string;
}) {
  let token: string | null;
  try {
    token = await loadShowShareToken(showId);
  } catch {
    token = null;
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
    </div>
  );
}
