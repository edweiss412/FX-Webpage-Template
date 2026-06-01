/**
 * app/admin/settings/admins/page.tsx (M9 C9 / M2-D1; M12.2 B1 Task 6.2)
 *
 * Runtime-mutable admin allow-list deep link. The list/add/revoke UI is now
 * the shared presentational <AdministratorsSection> (extracted in Task 6.2 and
 * also embedded in /admin/settings). This page just reads the typed result +
 * actor identity and renders the section inside its <main> wrapper.
 *
 * Defense-in-depth: app/admin/layout.tsx already calls requireAdmin() before
 * this page renders; we re-read identity here for the actor's canonical email.
 * List-read infra faults render in-section via the typed wrapper
 * (fetchEmbeddedAdminEmails → { kind: "infra_error" }); any uncaught
 * route/session fault is caught by admins/error.tsx.
 */
import { fetchEmbeddedAdminEmails } from "@/lib/admin/embeddedAdminEmails";
import { canonicalize } from "@/lib/email/canonicalize";
import { requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { nowDate } from "@/lib/time/now";
import { AdministratorsSection } from "@/components/admin/settings/AdministratorsSection";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Administrators · FXAV",
};

export default async function AdminsPage() {
  const result = await fetchEmbeddedAdminEmails();
  const identity = await requireAdminIdentity();

  return (
    <main className="mx-auto max-w-2xl px-tile-pad pb-section-gap">
      <AdministratorsSection
        result={result}
        actorCanonicalEmail={canonicalize(identity.email) ?? ""}
        now={await nowDate()}
      />
    </main>
  );
}
