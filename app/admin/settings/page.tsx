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
import { NotifyToggle, type NotifyToggleInitial } from "@/components/admin/settings/NotifyToggle";
import { DevToolsRow } from "@/components/admin/settings/DevToolsRow";
import { HoverHelp } from "@/components/admin/HoverHelp";
import { ReapStaleSessionsButton } from "@/components/admin/ReapStaleSessionsButton";
import { MaintenanceResetButtons } from "@/components/admin/MaintenanceResetButtons";
import { destructiveResetAllowed } from "@/lib/admin/validationDeployment";
import { Bell, Sparkles, ShieldCheck, Trash2 } from "lucide-react";
import { getSettingsPageFlags } from "@/lib/appSettings/getSettingsPageFlags";
import { getAutoPublishCleanFirstSeen } from "@/lib/appSettings/getAutoPublishCleanFirstSeen";
import { getAlertOnSyncProblems } from "@/lib/appSettings/getAlertOnSyncProblems";
import { getDailyReviewDigest } from "@/lib/appSettings/getDailyReviewDigest";
import { getAlertOnAutoPublish } from "@/lib/appSettings/getAlertOnAutoPublish";
import { setAutoPublish } from "./_actions/setAutoPublish";
import { setAlertOnSyncProblems } from "./_actions/setAlertOnSyncProblems";
import { setDailyReviewDigest } from "./_actions/setDailyReviewDigest";
import { setAlertOnAutoPublish } from "./_actions/setAlertOnAutoPublish";

/** Map a fail-closed toggle read ({kind:'value',enabled} | infra_error) onto the
 * NotifyToggle's {kind:'value',on} | infra_error prop shape (degraded → OFF). */
function toNotifyInitial(
  read: { kind: "value"; enabled: boolean } | { kind: "infra_error" },
): NotifyToggleInitial {
  return read.kind === "value" ? { kind: "value", on: read.enabled } : { kind: "infra_error" };
}

/** Map a fail-closed auto-publish read ({kind:'value',autoPublish} | infra_error)
 * onto the AutoPublishToggle's {kind:'value',on} | infra_error prop shape. */
function toAutoPublishInitial(
  read: { kind: "value"; autoPublish: boolean } | { kind: "infra_error" },
): AutoPublishInitial {
  return read.kind === "value" ? { kind: "value", on: read.autoPublish } : { kind: "infra_error" };
}

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings · Admin · FXAV" };

export default async function AdminSettingsPage() {
  const identity = await requireAdminIdentity();
  const now = await nowDate();

  // Validation-only maintenance affordances (Task 7): render-gated to the
  // validation deployment with the destructive-reset flag set. Never shown on
  // production/staging. Computed once here; the component carries no secret prop.
  const canReset = destructiveResetAllowed();

  // Nav-perf Phase 1 (A3): one app_settings read for all four toggle initials,
  // run in PARALLEL with the two independent top-level loaders. The happy path
  // is a single round-trip (getSettingsPageFlags) instead of four sequential
  // getter awaits. All reads are fail-closed: an infra_error degrades the
  // affected control to OFF — never a silent wrong/falsely-ON state (§4/§7.2).
  const [flags, driveHealth, adminEmails] = await Promise.all([
    getSettingsPageFlags(),
    fetchDriveConnectionHealth(),
    fetchEmbeddedAdminEmails(),
  ]);

  let autoPublishInitial: AutoPublishInitial;
  let alertOnSyncProblemsInitial: NotifyToggleInitial;
  let dailyReviewDigestInitial: NotifyToggleInitial;
  let alertOnAutoPublishInitial: NotifyToggleInitial;

  if (flags.kind === "value") {
    // Happy path: derive every toggle initial from the single read.
    autoPublishInitial = { kind: "value", on: flags.autoPublishCleanFirstSeen };
    alertOnSyncProblemsInitial = { kind: "value", on: flags.alertOnSyncProblems };
    dailyReviewDigestInitial = { kind: "value", on: flags.dailyReviewDigest };
    alertOnAutoPublishInitial = { kind: "value", on: flags.alertOnAutoPublish };
  } else {
    // Fallback with PER-TOGGLE ISOLATION: the combined read failed, so consult
    // the four single getters in parallel and map EACH independently. A single
    // failing column degrades only its own toggle; the rest render real values.
    const [autoPublishRead, syncRead, digestRead, autoPublishAlertRead] = await Promise.all([
      getAutoPublishCleanFirstSeen(),
      getAlertOnSyncProblems(),
      getDailyReviewDigest(),
      getAlertOnAutoPublish(),
    ]);
    autoPublishInitial = toAutoPublishInitial(autoPublishRead);
    alertOnSyncProblemsInitial = toNotifyInitial(syncRead);
    dailyReviewDigestInitial = toNotifyInitial(digestRead);
    alertOnAutoPublishInitial = toNotifyInitial(autoPublishAlertRead);
  }

  return (
    <main data-testid="admin-settings-page" className="flex w-full flex-col">
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
        <DriveConnectionPanel health={driveHealth} now={now} />

        <AdministratorsSection
          result={adminEmails}
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
            <HoverHelp
              label="Help: Preferences"
              testId="prefs-help"
              rootTestId="help-affordance--settings-preferences--tooltip"
              learnMore={{ href: "/help/admin/settings#preferences" }}
            >
              <p>
                Account-wide settings: email alerts, auto-publishing clean shows, and developer
                tools.
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

            <NotifyToggle
              testId="alert-on-auto-publish"
              title="Email me when a show publishes itself"
              ariaLabel="Email me when a show publishes itself"
              description="When auto-publish puts a clean show live on its own, email me a link to undo it within the 24-hour window."
              initial={alertOnAutoPublishInitial}
              action={setAlertOnAutoPublish}
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

        {/* Onboarding-fixups F4 (Task 4.6): maintenance affordance for the
          session-scoped stale-debris reap. Lives here (not on the wizard
          re-entry surfaces) because stale-session leftovers exist regardless
          of the CURRENT wizard state — the reap only ever touches sessions
          that are not the active one. */}
        <section
          data-testid="admin-settings-maintenance-section"
          aria-labelledby="admin-settings-maintenance-heading"
          className="flex flex-col gap-3"
        >
          <div className="flex items-center gap-2">
            <h2
              id="admin-settings-maintenance-heading"
              className="text-lg font-semibold text-text-strong"
            >
              Maintenance
            </h2>
            <HoverHelp
              label="Help: Maintenance"
              testId="maintenance-help"
              rootTestId="help-affordance--settings-maintenance--tooltip"
              learnMore={{ href: "/help/admin/settings#maintenance" }}
            >
              <p>
                Housekeeping actions. Cleaning up old setup leftovers removes staging data from
                setup sessions abandoned more than a day ago. It never touches your current setup or
                live shows.
              </p>
            </HoverHelp>
          </div>

          <div
            data-testid="admin-settings-maintenance-card"
            className="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad"
          >
            <div className="flex items-start gap-3">
              {/* Icon box matches the sibling Preferences rows
                (NotifyToggle.tsx:74): 20px lucide glyph, not 16px. */}
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-text-subtle [&>svg]:size-5">
                <Trash2 aria-hidden />
              </span>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-text-strong">Old setup leftovers</p>
                <p className="text-sm text-text-subtle">
                  If a setup run was abandoned partway, its staging data can linger. This sweeps
                  anything older than a day from sessions that are no longer active.
                </p>
              </div>
            </div>
            <ReapStaleSessionsButton />
            {canReset && <MaintenanceResetButtons />}
          </div>
        </section>
      </div>
    </main>
  );
}
