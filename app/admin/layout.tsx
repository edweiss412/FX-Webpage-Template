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
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { AlertBanner } from "@/components/admin/AlertBanner";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  // FIRST LINE — gates every admin route (404 if build-time flag off, 403
  // if not admin). Per Next 16 App Router semantics, this runs before any
  // child page render, so the gate covers /admin/dev and any future
  // /admin/* additions automatically.
  await requireAdmin();

  return (
    <div data-testid="admin-layout" className="mx-auto max-w-4xl p-6">
      <header className="mb-section-gap">
        <h1 className="text-xl font-semibold" data-testid="admin-header">
          Admin
        </h1>
      </header>

      {/* AlertBanner is async — it self-fetches admin_alerts and renders
          null when the queue is empty, so this slot is invisible in
          clean state. */}
      <AlertBanner />

      {children}
    </div>
  );
}
