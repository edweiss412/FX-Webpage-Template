// M12.2 Phase B1 Task 5.4 — DriveConnectionPanel (spec §3.1).
//
// Read-only Drive-connection health readout for /admin/settings. SERVER
// component: it RECEIVES the DriveConnectionHealth result as a prop (the
// settings page calls fetchDriveConnectionHealth() and passes it down — that
// wiring is Phase 6, not this task) plus `now: Date` for deterministic
// relative time (mirrors StaleFooter's required `now`).
//
// Load-bearing contracts (settled over review rounds):
//   - The status line NEVER starts with "Connected" unless health === "positive".
//     A static "Connected" prefix on a Warn/infra state contradicts the pill —
//     that is the exact bug this component prevents.
//   - lastReadClause is null-guarded and shared by EVERY branch that shows a
//     last-read time, so a null lastReadAt on a warn/stale branch renders
//     " · Not synced yet", never "last read undefined". stale_severe is reached
//     precisely when last_synced_at IS NULL for the never-synced fleet, so warn
//     branches MUST guard null exactly like positive.
//   - The "{N} show(s) need attention" copy uses attentionCount (the failing-row
//     count), NOT syncingCount (whole-fleet). 1 stale among 501 → "1 show needs
//     attention".
//   - Infra copy comes from the catalog via getRequiredDougFacing (invariant 5),
//     never a hardcoded literal.
//
// Tokens only (no inline hex/px — token discipline §10). The middot " · " is
// U+00B7, the intended separator (NOT an em dash).

import { FolderOpen, ExternalLink, RotateCcw } from "lucide-react";
import type { DriveConnectionHealth } from "@/lib/admin/driveConnectionHealth";
import { driveFolderUrl } from "@/lib/drive/driveFolderUrl";
import { getRequiredDougFacing } from "@/lib/messages/lookup";
import { formatRelative } from "@/lib/time/relative";
import { StatusIndicator } from "@/components/admin/StatusIndicator";
import { rerunSetupServerAction } from "@/lib/onboarding/serverActions";

function deriveStatusLine(health: DriveConnectionHealth, now: Date): string {
  if ("kind" in health) {
    // infra_error → cataloged copy, never "Connected".
    return getRequiredDougFacing("ADMIN_DRIVE_HEALTH_UNAVAILABLE");
  }

  // Shared, null-guarded last-read clause — used by every branch that shows it.
  const lastReadClause = health.lastReadAt
    ? ` · last read ${formatRelative(health.lastReadAt, now)}`
    : " · Not synced yet";

  if (health.health === "positive") {
    const syncingLabel =
      health.syncingCount === 0
        ? "No shows syncing yet"
        : `${health.syncingCount} shows syncing`;
    return `Connected · ${syncingLabel}${lastReadClause}`;
  }

  // Warn branches. NEVER prefixed with "Connected".
  switch (health.reason) {
    case "not_configured":
      // No folder → no last-read clause.
      return "Connection not set up";
    case "watch_inactive":
    case "watch_expired":
      return `Connection needs attention${lastReadClause}`;
    case "sync_unknown":
      // B1-D2 (owner-ratified §3.1 amendment, option i): sync_unknown is a
      // developer-attention / data-integrity state (enum drift or a corrupt
      // row), categorically distinct from routine staleness — render
      // SYNC_STATUS_UNKNOWN's specific cataloged copy via the carried code,
      // NOT the generic group line. health.code === "SYNC_STATUS_UNKNOWN".
      return `${getRequiredDougFacing(health.code)}${lastReadClause}`;
    default: {
      // sync_* | stale_* → failing-row count drives the generic group line.
      const noun = health.attentionCount === 1 ? "show needs" : "shows need";
      return `Syncing, but ${health.attentionCount} ${noun} attention${lastReadClause}`;
    }
  }
}

export function DriveConnectionPanel({
  health,
  now,
}: {
  health: DriveConnectionHealth;
  now: Date;
}) {
  const isPositive = !("kind" in health) && health.health === "positive";
  const folderName = "kind" in health ? null : health.folderName;
  const folderId = "kind" in health ? null : health.folderId;
  const folderUrl = driveFolderUrl(folderId);
  const statusLine = deriveStatusLine(health, now);

  return (
    <section
      data-testid="admin-settings-drive-connection-section"
      aria-labelledby="admin-settings-drive-connection-heading"
      className="flex flex-col gap-3"
    >
      {/* M12.3 item 12b: section title sits OUTSIDE/above the card. */}
      <h2
        id="admin-settings-drive-connection-heading"
        className="text-lg font-semibold text-text-strong"
      >
        Drive connection
      </h2>

      <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
      {/* Info ⟷ pill row — wraps on narrow widths. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <FolderOpen
            aria-hidden="true"
            className="size-5 shrink-0 text-text-subtle"
          />
          <div className="flex flex-col">
            <span className="text-base font-medium text-text-strong">
              {folderName ?? "Your show-sheets folder"}
            </span>
            <span
              data-testid="drive-connection-status-line"
              className="text-sm text-text-subtle"
            >
              {statusLine}
            </span>
          </div>
        </div>
        <StatusIndicator
          status={isPositive ? "positive" : "warn"}
          label={isPositive ? "Healthy" : "Warn"}
        />
      </div>

      <hr className="border-border" />

      {/* M12.3 item 8: helper text LEFT, both buttons grouped RIGHT in one row
          (wraps on narrow widths). "Re-run setup" is a NEUTRAL/outline button,
          not orange/accent. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-text-subtle">
          Need to switch folders? Re-run setup. Your current shows keep syncing
          the whole time.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {folderUrl && (
            <a
              data-testid="drive-connection-open-folder"
              href={folderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-tap-min items-center justify-center gap-2 rounded-sm border border-border-strong bg-bg px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              <FolderOpen aria-hidden="true" className="size-4 shrink-0" />
              Open folder
              <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
            </a>
          )}
          <form
            data-testid="drive-connection-rerun-setup-form"
            data-action="rerunSetupServerAction"
            action={rerunSetupServerAction}
            className="flex"
          >
            <button
              type="submit"
              data-testid="drive-connection-rerun-setup-button"
              className="inline-flex min-h-tap-min items-center justify-center gap-2 rounded-sm border border-border-strong bg-surface px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              <RotateCcw aria-hidden="true" className="size-4 shrink-0" />
              Re-run setup
            </button>
          </form>
        </div>
      </div>
      </div>
    </section>
  );
}
