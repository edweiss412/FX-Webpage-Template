// app/help/layout.tsx
import type { ReactNode } from "react";
import {
  AdminInfraError,
  requireAdmin,
} from "@/lib/auth/requireAdmin";
import { messageFor } from "@/lib/messages/lookup";

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

  // Phase A.4 + A.5 + A.6 will add the Sidebar / Header / Breadcrumb chrome
  // around children. Placeholder until those tasks land.
  return <div className="mx-auto max-w-4xl px-4 py-8">{children}</div>;
}
