// app/help/layout.tsx
import type { ReactNode } from "react";
import { AdminInfraError, requireAdmin } from "@/lib/auth/requireAdmin";
import { messageFor } from "@/lib/messages/lookup";
import { Header } from "./_components/Header";
import { Sidebar } from "./_components/Sidebar";
import { Breadcrumb } from "./_components/Breadcrumb";

// Spec §3.2 / §3.4: requireAdmin runs Supabase queries per request, so
// the /help tree is dynamic, not statically prerendered. Explicit flag
// makes this visible to Next.js and to readers.
export const dynamic = "force-dynamic";

export default async function HelpLayout({ children }: { children: ReactNode }) {
  // Mirrors app/admin/layout.tsx:47-71 verbatim. Phase H Task H.1/H.2 verifies
  // both arms (admin OK, unauth/crew 403, infra-stub 500-class surface).
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AdminInfraError) {
      const entry = messageFor(err.code as never);
      return (
        <div
          data-testid="help-layout-infra-error"
          className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-page-pad-mobile sm:p-page-pad-desktop text-center"
        >
          <h1 className="text-2xl font-semibold">Help unavailable</h1>
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
    <div className="mx-auto max-w-6xl px-4 py-6 md:py-8">
      {/* M11-A-D2 — WCAG 2.4.1: first focusable element jumps keyboard users
          past the Header + Sidebar chrome. Visually hidden until focused. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:inline-flex focus:min-h-tap-min focus:items-center focus:rounded-md focus:border focus:border-border-strong focus:bg-surface-raised focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-text-strong focus:shadow-tile focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        Skip to content
      </a>
      <Header />
      <div className="md:flex md:gap-6">
        <Sidebar />
        {/* tabIndex={-1}: older Safari/VoiceOver combos don't move focus on
            fragment navigation without it (impeccable dual-gate LOW). */}
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus-visible:outline-none">
          <Breadcrumb />
          {children}
        </main>
      </div>
    </div>
  );
}
