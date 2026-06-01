// @vitest-environment jsdom
//
// M12.2 Phase B1 Task 5.4 — DriveConnectionPanel status-line copy.
//
// The load-bearing contract this pins: the status line NEVER starts with
// "Connected" unless health === "positive" (a static "Connected" prefix on a
// Warn/infra state contradicts the pill — the exact bug this task prevents).
// attentionCount (NOT syncingCount) drives the "{N} show(s) need attention"
// copy (1 stale among 501 active → "1 show needs attention", not 501). The
// infra copy is read from the catalog via getRequiredDougFacing, never a
// hardcoded literal (invariant 5). lastReadClause is null-guarded on EVERY
// branch so a never-synced (lastReadAt === null) warn/stale fleet renders
// " · Not synced yet", never "last read undefined/Invalid Date".
//
// Anti-tautology: expected copy is derived from the seeded health prop (and,
// for the infra case, from getRequiredDougFacing) — never copied from the
// component's own output.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { DriveConnectionPanel } from "@/components/admin/settings/DriveConnectionPanel";
import type { DriveConnectionHealth } from "@/lib/admin/driveConnectionHealth";
import { getRequiredDougFacing } from "@/lib/messages/lookup";
import { formatRelative } from "@/lib/time/relative";

afterEach(cleanup);

// Fixed deterministic clock; lastReadAt 2h before so formatRelative → "2 hr".
const NOW = new Date("2026-06-01T12:00:00.000Z");
const TWO_HR_AGO = new Date("2026-06-01T10:00:00.000Z").toISOString();
const REL_2HR = formatRelative(TWO_HR_AGO, NOW); // derive, never hardcode

function statusLine() {
  return screen.getByTestId("drive-connection-status-line").textContent ?? "";
}

describe("DriveConnectionPanel", () => {
  it("positive → 'Connected · N shows syncing · last read {rel}' + Healthy pill", () => {
    const health: DriveConnectionHealth = {
      health: "positive",
      folderName: "Show Sheets 2026",
      folderId: "abc123",
      syncingCount: 4,
      lastReadAt: TWO_HR_AGO,
    };
    render(<DriveConnectionPanel health={health} now={NOW} />);
    expect(statusLine()).toBe(`Connected · 4 shows syncing · last read ${REL_2HR}`);
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByTestId("status-dot-positive")).toBeInTheDocument();
  });

  it("warn/watch_inactive → 'Connection needs attention · last read {rel}', NEVER starts with 'Connected'; Warn pill", () => {
    const health: DriveConnectionHealth = {
      health: "warn",
      reason: "watch_inactive",
      code: "WATCH_CHANNEL_ORPHANED",
      folderName: "Show Sheets 2026",
      folderId: "abc123",
      syncingCount: 4,
      attentionCount: 4,
      lastReadAt: TWO_HR_AGO,
    };
    render(<DriveConnectionPanel health={health} now={NOW} />);
    expect(statusLine()).toBe(`Connection needs attention · last read ${REL_2HR}`);
    expect(statusLine().startsWith("Connected")).toBe(false);
    expect(screen.getByText("Warn")).toBeInTheDocument();
    expect(screen.getByTestId("status-dot-warn")).toBeInTheDocument();
  });

  it("warn/not_configured → 'Connection not set up', no 'Connected' prefix, no last-read clause", () => {
    const health: DriveConnectionHealth = {
      health: "warn",
      reason: "not_configured",
      code: "WATCH_CHANNEL_ORPHANED",
      folderName: null,
      folderId: null,
      syncingCount: 0,
      attentionCount: 0,
      lastReadAt: null,
    };
    render(<DriveConnectionPanel health={health} now={NOW} />);
    expect(statusLine()).toBe("Connection not set up");
    expect(statusLine().startsWith("Connected")).toBe(false);
  });

  it("warn/sync_* + stale_* → 'Syncing, but {attentionCount} show(s) need attention'; 1 stale among 501 → '1 show needs attention' (NOT 501)", () => {
    const health: DriveConnectionHealth = {
      health: "warn",
      reason: "stale_severe",
      code: "SYNC_DELAYED_SEVERE",
      folderName: "Show Sheets 2026",
      folderId: "abc123",
      syncingCount: 501,
      attentionCount: 1,
      lastReadAt: TWO_HR_AGO,
    };
    render(<DriveConnectionPanel health={health} now={NOW} />);
    expect(statusLine()).toBe(`Syncing, but 1 show needs attention · last read ${REL_2HR}`);
    expect(statusLine()).not.toContain("501");
    expect(statusLine().startsWith("Connected")).toBe(false);

    cleanup();
    const plural: DriveConnectionHealth = {
      health: "warn",
      reason: "sync_drive_error",
      code: "DRIVE_FETCH_FAILED",
      folderName: "Show Sheets 2026",
      folderId: "abc123",
      syncingCount: 501,
      attentionCount: 3,
      lastReadAt: TWO_HR_AGO,
    };
    render(<DriveConnectionPanel health={plural} now={NOW} />);
    expect(statusLine()).toBe(`Syncing, but 3 shows need attention · last read ${REL_2HR}`);
  });

  // B1-D2 (owner-ratified §3.1 amendment, option i): sync_unknown is a
  // developer-attention / data-integrity state, NOT routine staleness, so it
  // renders SYNC_STATUS_UNKNOWN's specific cataloged copy via
  // getRequiredDougFacing(health.code) instead of the generic group line.
  it("warn/sync_unknown → SYNC_STATUS_UNKNOWN developer-attention copy + last-read clause, NOT the generic 'shows need attention' line (B1-D2)", () => {
    const health: DriveConnectionHealth = {
      health: "warn",
      reason: "sync_unknown",
      code: "SYNC_STATUS_UNKNOWN",
      folderName: "Show Sheets 2026",
      folderId: "abc123",
      syncingCount: 501,
      attentionCount: 2,
      lastReadAt: TWO_HR_AGO,
    };
    render(<DriveConnectionPanel health={health} now={NOW} />);
    // Anti-tautology: assert against the catalog accessor, not a literal.
    const expected = getRequiredDougFacing("SYNC_STATUS_UNKNOWN");
    expect(statusLine()).toBe(`${expected} · last read ${REL_2HR}`);
    // The generic group line must be ABSENT for sync_unknown.
    expect(statusLine()).not.toContain("Syncing, but");
    expect(statusLine()).not.toContain("need attention");
    expect(statusLine().startsWith("Connected")).toBe(false);
    expect(screen.getByTestId("status-dot-warn")).toBeInTheDocument();
  });

  it("infra_error → 'Couldn't read sync status' via ADMIN_DRIVE_HEALTH_UNAVAILABLE (cataloged, not a literal); Warn pill", () => {
    const health: DriveConnectionHealth = { kind: "infra_error" };
    render(<DriveConnectionPanel health={health} now={NOW} />);
    const expected = getRequiredDougFacing("ADMIN_DRIVE_HEALTH_UNAVAILABLE");
    expect(statusLine()).toBe(expected);
    expect(statusLine().startsWith("Connected")).toBe(false);
    expect(screen.getByText("Warn")).toBeInTheDocument();
    expect(screen.getByTestId("status-dot-warn")).toBeInTheDocument();
  });

  it("0 shows → 'No shows syncing yet'; positive + lastReadAt null → 'Not synced yet'", () => {
    const health: DriveConnectionHealth = {
      health: "positive",
      folderName: "Show Sheets 2026",
      folderId: "abc123",
      syncingCount: 0,
      lastReadAt: null,
    };
    render(<DriveConnectionPanel health={health} now={NOW} />);
    expect(statusLine()).toBe("Connected · No shows syncing yet · Not synced yet");
  });

  it("warn/stale_severe + lastReadAt null (never-synced fleet) → status line ends ' · Not synced yet', NEVER 'last read undefined/Invalid Date'", () => {
    const health: DriveConnectionHealth = {
      health: "warn",
      reason: "stale_severe",
      code: "SYNC_DELAYED_SEVERE",
      folderName: "Show Sheets 2026",
      folderId: "abc123",
      syncingCount: 501,
      attentionCount: 501,
      lastReadAt: null,
    };
    render(<DriveConnectionPanel health={health} now={NOW} />);
    const line = statusLine();
    expect(line.endsWith(" · Not synced yet")).toBe(true);
    expect(line).not.toContain("undefined");
    expect(line).not.toContain("Invalid Date");
    expect(line).toBe("Syncing, but 501 shows need attention · Not synced yet");
  });

  it("folderName null → neutral fallback label 'Your show-sheets folder' + Open-folder link", () => {
    const health: DriveConnectionHealth = {
      health: "positive",
      folderName: null,
      folderId: "abc123",
      syncingCount: 2,
      lastReadAt: TWO_HR_AGO,
    };
    render(<DriveConnectionPanel health={health} now={NOW} />);
    expect(screen.getByText("Your show-sheets folder")).toBeInTheDocument();
    const open = screen.getByTestId("drive-connection-open-folder");
    expect(open).toHaveAttribute("href", "https://drive.google.com/drive/folders/abc123");
  });

  it("no folderId → Open-folder button hidden", () => {
    const health: DriveConnectionHealth = {
      health: "warn",
      reason: "not_configured",
      code: "WATCH_CHANNEL_ORPHANED",
      folderName: null,
      folderId: null,
      syncingCount: 0,
      attentionCount: 0,
      lastReadAt: null,
    };
    render(<DriveConnectionPanel health={health} now={NOW} />);
    expect(screen.queryByTestId("drive-connection-open-folder")).toBeNull();
  });

  it("Re-run setup submits rerunSetupServerAction (unchanged)", () => {
    const health: DriveConnectionHealth = {
      health: "positive",
      folderName: "Show Sheets 2026",
      folderId: "abc123",
      syncingCount: 2,
      lastReadAt: TWO_HR_AGO,
    };
    render(<DriveConnectionPanel health={health} now={NOW} />);
    const form = screen.getByTestId("drive-connection-rerun-setup-form");
    expect(form).toHaveAttribute("data-action", "rerunSetupServerAction");
    const button = within(form).getByRole("button", { name: "Re-run setup" });
    expect(button).toHaveAttribute("type", "submit");
  });
});
