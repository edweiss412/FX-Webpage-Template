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
 * M12.3 (items 6/7/8/12/14): the page is LEFT-ALIGNED (no mx-auto); each section
 * title ("Drive connection", "Administrators", "Preferences") sits OUTSIDE/above
 * its card; the four Preferences rows (two notify toggles, auto-publish, gated
 * dev-tools) are grouped into ONE bordered divide-y card, each with a leading
 * lucide icon; "Add admin" is a heading-row trigger that discloses the add form.
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
import {
  NotifyToggle,
  type NotifyToggleInitial,
} from "@/components/admin/settings/NotifyToggle";
import { DevToolsRow } from "@/components/admin/settings/DevToolsRow";
import { HoverHelp } from "@/components/admin/HoverHelp";
import { Bell, Sparkles, ShieldCheck } from "lucide-react";
import { getAutoPublishCleanFirstSeen } from "@/lib/appSettings/getAutoPublishCleanFirstSeen";
import { getAlertOnSyncProblems } from "@/lib/appSettings/getAlertOnSyncProblems";
import { getDailyReviewDigest } from "@/lib/appSettings/getDailyReviewDigest";
import { setAutoPublish } from "./_actions/setAutoPublish";
import { setAlertOnSyncProblems } from "./_actions/setAlertOnSyncProblems";
import { setDailyReviewDigest } from "./_actions/setDailyReviewDigest";

/** Map a fail-closed toggle read ({kind:'value',enabled} | infra_error) onto the
 * NotifyToggle's {kind:'value',on} | infra_error prop shape (degraded → OFF). */
function toNotifyInitial(
  read: { kind: "value"; enabled: boolean } | { kind: "infra_error" },
): NotifyToggleInitial {
  return read.kind === "value" ? { kind: "value", on: read.enabled } : { kind: "infra_error" };
}

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

  // Fail-closed reads of the two notification toggles (infra_error → degraded
  // control; never a silent wrong/falsely-ON state — §7.2).
  const alertOnSyncProblemsInitial = toNotifyInitial(await getAlertOnSyncProblems());
  const dailyReviewDigestInitial = toNotifyInitial(await getDailyReviewDigest());

  return (
    <main
      data-testid="admin-settings-page"
      className="flex w-full flex-col"
    >
      {/* M12.6: the page header (and its full-bleed divider) spans the FULL
          content width; only the settings cards below are constrained to a
          readable column (max-w-3xl, left-aligned) — matching the design. */}
      <AdminPageHeader
        title="Settings"
        sub="Manage your Drive connection, who can administer, and how the app behaves."
      />

      <div
        data-testid="admin-settings-content"
        className="flex w-full max-w-3xl flex-col gap-section-gap"
      >
      <DriveConnectionPanel health={await fetchDriveConnectionHealth()} now={now} />

      <AdministratorsSection
        result={await fetchEmbeddedAdminEmails()}
        actorCanonicalEmail={canonicalize(identity.email) ?? ""}
        now={now}
      />

      {/* M12.3 items 6/7/12b: "Preferences" heading OUTSIDE the card; the three
          toggle rows + the (gated) Developer-tools row live in ONE bordered
          card with internal dividers; each row carries a leading lucide icon. */}
      <section
        data-testid="admin-settings-preferences-section"
        aria-labelledby="admin-settings-preferences-heading"
        className="flex flex-col gap-3"
      >
        <div className="flex items-center gap-2">
          <h2
            id="admin-settings-preferences-heading"
            className="text-lg font-semibold text-text-strong"
          >
            Preferences
          </h2>
          <HoverHelp label="Help: Preferences" testId="prefs-help">
            <p>
              Account-wide settings: email alerts, auto-publishing clean shows,
              and developer tools.
            </p>
          </HoverHelp>
        </div>

        <div
          data-testid="admin-settings-preferences-card"
          className="divide-y divide-border rounded-md border border-border bg-surface"
        >
          <NotifyToggle
            testId="alert-on-sync-problems"
            title="Alert me about sync problems"
            ariaLabel="Alert me about sync problems"
            description="Email me when a sheet stops syncing or fails to parse for more than an hour."
            initial={alertOnSyncProblemsInitial}
            action={setAlertOnSyncProblems}
            icon={<Bell aria-hidden />}
          />

          <NotifyToggle
            testId="daily-review-digest"
            title="Daily review digest"
            ariaLabel="Daily review digest"
            description="A once-a-day email summarizing sheets that need your review, grouped by show. Nothing waiting means no email."
            initial={dailyReviewDigestInitial}
            action={setDailyReviewDigest}
            icon={<Bell aria-hidden />}
          />

          <AutoPublishToggle
            initial={autoPublishInitial}
            setAutoPublish={setAutoPublish}
            icon={<Sparkles aria-hidden />}
          />

          <DevToolsRow icon={<ShieldCheck aria-hidden />} />
        </div>
      </section>
      </div>
    </main>
  );
}
