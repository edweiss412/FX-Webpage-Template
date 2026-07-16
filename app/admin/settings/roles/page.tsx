/**
 * app/admin/settings/roles/page.tsx (spec 2026-07-15 §8.2)
 *
 * The durable home for roles Doug taught the app from warnings. Server component:
 * reads the mapping list (typed result — infra faults render an explicit failure
 * state, never a masked empty state, invariant 9) and the actor's canonical email
 * (to render the decider identity as "You" when it is the current admin), then
 * hands both to the presentational <RolesSettingsView>.
 *
 * Defense-in-depth: app/admin/layout.tsx already calls requireAdmin() before this
 * page renders; the auth-chain audit pins this route to the requireAdmin chain
 * (lib/audit/trustDomains.ts). We re-read identity here only for the actor's email.
 */
import { listRoleTokenMappings } from "@/lib/admin/roleTokenMappings";
import { requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { canonicalize } from "@/lib/email/canonicalize";
import { RolesSettingsView } from "@/app/admin/settings/roles/RolesSettingsView";
import * as COPY from "@/components/admin/roleRecognizeCopy";

export const dynamic = "force-dynamic";
export const metadata = {
  title: `${COPY.SETTINGS_TITLE} · FXAV`,
};

export default async function RolesSettingsPage() {
  const result = await listRoleTokenMappings();
  const identity = await requireAdminIdentity();

  return (
    <main className="mx-auto max-w-2xl px-tile-pad pb-section-gap">
      <RolesSettingsView result={result} actorEmail={canonicalize(identity.email) ?? ""} />
    </main>
  );
}
