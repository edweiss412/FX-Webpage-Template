/**
 * app/admin/layout.tsx (M5 §B Task 5.9 — Doug's portion)
 *
 * Wraps every route under /admin/* (currently /admin/dev; future:
 * /admin/alerts, /admin/reports, etc.). Two responsibilities:
 *
 *   1. Mounts <AlertBanner /> at the top of the admin section so any
 *      unresolved row in `public.admin_alerts` is surfaced to Doug
 *      immediately, before the per-page chrome.
 *
 *   2. Calls requireAdmin() at the layout level. Next 16 App Router runs
 *      layouts before child pages, so the build-time + auth gates apply
 *      to every admin route — defense-in-depth on top of the per-page
 *      requireAdmin() call already inside /admin/dev/page.tsx (which
 *      stays for the same reason every Server Action also gates: a
 *      direct page-render path could otherwise bypass the layout in
 *      future routing changes).
 *
 * Visual chrome (DESIGN.md §1):
 *   - Centered max-width container, p-6 outer padding.
 *   - Header: "Admin" wordmark in font-semibold, mb-section-gap below.
 *
 * Server Component (no 'use client').
 */
import type { ReactNode } from "react";
import { AdminInfraError, requireAdmin } from "@/lib/auth/requireAdmin";
import { AlertBanner } from "@/components/admin/AlertBanner";
import { messageFor } from "@/lib/messages/lookup";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // FIRST LINE — gates every admin route (404 if build-time flag off, 403
  // if not admin). Per Next 16 App Router semantics, this runs before any
  // child page render, so the gate covers /admin/dev and any future
  // /admin/* additions automatically.
  //
  // R18 #2 (round-17 §A+§B HIGH): R17 #1 made requireAdmin throw
  // AdminInfraError on infra failure (was forbidden() for everything
  // pre-R17 — auth-deny and infra-fault collapsed). The layout used
  // to await requireAdmin without a catch + had no app/admin/error.tsx,
  // so AdminInfraError fell into Next's generic error path. Catch it
  // here and render a cataloged failure surface so admins see a real
  // 500-class error with retry guidance instead of an opaque framework
  // error. notFound() / forbidden() throws still propagate (those are
  // Next navigation control flow with NEXT_HTTP_ERROR_FALLBACK digest).
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AdminInfraError) {
      const entry = messageFor(err.code as never);
      return (
        <div
          data-testid="admin-layout-infra-error"
          className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-page-pad-mobile sm:p-page-pad-desktop text-center"
        >
          <h1 className="text-2xl font-semibold">Admin session unavailable</h1>
          <p className="mt-4 text-base text-text-subtle">
            {entry.dougFacing ?? entry.crewFacing ?? "Please try again in a moment."}
          </p>
          <a
            href="/admin"
            className="mt-section-gap inline-flex min-h-tap-min items-center px-4 py-2 text-base text-text-strong underline underline-offset-2"
          >
            Try again
          </a>
        </div>
      );
    }
    throw err;
  }

  return (
    <div
      data-testid="admin-layout"
      className="mx-auto max-w-4xl p-page-pad-mobile sm:p-page-pad-desktop"
    >
      <header className="mb-section-gap">
        <h1 className="text-xl font-semibold" data-testid="admin-header">
          Admin
        </h1>
      </header>

      {/* AlertBanner is async — it self-fetches admin_alerts and renders
          null when the queue is empty, so this slot is invisible in
          clean state. The wrapping `<div id="alerts">` is the scroll
          target for the AlertBanner queue-chip's `/admin#alerts`
          fragment (R16 final-review fix; the chip used to point at a
          section on the admin LANDING which would scroll the banner
          itself off-screen — the anchor is now on the banner's own
          wrapper so the fragment lands precisely where Doug expects). */}
      <div id="alerts">
        <AlertBanner />
      </div>

      {children}
    </div>
  );
}
