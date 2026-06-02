/**
 * app/admin/settings/page.tsx (M10 §B / M12.2 B1 Task 4.2 + 6.2)
 *
 * Canonical post-onboarding settings surface. Body (top → bottom):
 *   - <DriveConnectionPanel> (Task 5.4) — Drive-connection health readout +
 *     its OWN "Re-run setup" button (subsumes the old standalone re-run-setup
 *     section).
 *   - <AdministratorsSection> (Task 6.2) — embedded admin allow-list (the old
 *     "Manage administrators" link is subsumed; the deep link
 *     /admin/settings/admins still renders the same section).
 *   - <AutoPublishToggle> (B2 Task 8.1) — the "Auto-publish clean new shows"
 *     Preferences toggle; reflects app_settings.auto_publish_clean_first_seen
 *     (read fail-closed here) and flips it via the admin-gated setAutoPublish
 *     server action.
 *   - <DevToolsRow> (Task 8.3) — gated on the build-time DEV_PANEL_PRESENT
 *     constant; renders null in normal builds (committed false), so it is the
 *     only "Preferences"-area content for B1 and is invisible by default.
 *
 * The layout gates admin access; we still re-call requireAdminIdentity here
 * defensively (matching app/admin/dev/page.tsx) and to source the actor's
 * canonical email for the embedded self-revoke policy.
 */
import { requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { canonicalize } from "@/lib/email/canonicalize";
import { nowDate } from "@/lib/time/now";
import { fetchDriveConnectionHealth } from "@/lib/admin/driveConnectionHealth";
import { fetchEmbeddedAdminEmails } from "@/lib/admin/embeddedAdminEmails";
import { AdminPageHeader } from "@/components/admin/nav/AdminPageHeader";
import { DriveConnectionPanel } from "@/components/admin/settings/DriveConnectionPanel";
import { AdministratorsSection } from "@/components/admin/settings/AdministratorsSection";
import {
  AutoPublishToggle,
  type AutoPublishInitial,
} from "@/components/admin/settings/AutoPublishToggle";
import { DevToolsRow } from "@/components/admin/settings/DevToolsRow";
import { getAutoPublishCleanFirstSeen } from "@/lib/appSettings/getAutoPublishCleanFirstSeen";
import { setAutoPublish } from "./_actions/setAutoPublish";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings · Admin · FXAV" };

export default async function AdminSettingsPage() {
  const identity = await requireAdminIdentity();
  const now = await nowDate();

  // Fail-closed read of the auto-publish toggle (infra_error → degraded control;
  // never a silent wrong/falsely-ON state — §4). Map the reader's
  // {autoPublish} shape onto the component's {on} prop.
  const autoPublishRead = await getAutoPublishCleanFirstSeen();
  const autoPublishInitial: AutoPublishInitial =
    autoPublishRead.kind === "value"
      ? { kind: "value", on: autoPublishRead.autoPublish }
      : { kind: "infra_error" };

  return (
    <main
      data-testid="admin-settings-page"
      className="mx-auto flex max-w-[740px] flex-col gap-section-gap"
    >
      <AdminPageHeader
        title="Settings"
        sub="Manage your Drive connection, who can administer, and how the app behaves."
      />

      <DriveConnectionPanel health={await fetchDriveConnectionHealth()} now={now} />

      <AdministratorsSection
        result={await fetchEmbeddedAdminEmails()}
        actorCanonicalEmail={canonicalize(identity.email) ?? ""}
        now={now}
      />

      <AutoPublishToggle initial={autoPublishInitial} setAutoPublish={setAutoPublish} />

      <DevToolsRow />
    </main>
  );
}
