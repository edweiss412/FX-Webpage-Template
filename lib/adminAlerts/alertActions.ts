import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";
import { driveFolderUrl } from "@/lib/drive/driveFolderUrl";

/**
 * Per-code action links for admin alert rows
 * (spec docs/superpowers/specs/alerts/2026-07-04-alert-action-links.md §3-§4).
 *
 * Keyed by its own exact literal union, NOT `AdminAlertCode`: three of these
 * codes are raw-SQL/script producers deliberately outside that union (see
 * NON_UPSERT_ADMIN_ALERTS_PRODUCERS in tests/messages/_metaAdminAlertCatalog).
 * All guards are fail-quiet: malformed context → null → no link renders.
 */
export const ALERT_ACTION_CODES = [
  "SHOW_FIRST_PUBLISHED",
  "PICKER_EPOCH_RESET",
  "PICKER_SELECTION_RACE",
  "ROLE_FLAGS_NOTICE",
  "LIVE_ROW_CONFLICT",
  "WIZARD_SESSION_SUPERSEDED_RACE",
  "REPORT_ORPHANED_LOST_LEASE",
  "BRANCH_PROTECTION_DRIFT",
  "BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
  "RESYNC_SHRINK_HELD",
  "ONBOARDING_SHEET_UNREADABLE",
] as const;

export type AlertActionCode = (typeof ALERT_ACTION_CODES)[number];

export type AlertActionLink = { label: string; href: string; external: boolean };

export type AlertActionBuilder = (
  context: Record<string, unknown> | null,
  opts: { slug: string | null; driveFileId?: string | null },
) => AlertActionLink | null;

// context is untyped JSON — a field is usable only as a non-empty string.
function str(context: Record<string, unknown> | null, key: string): string | null {
  if (!context) return null;
  const value = context[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function shareAccess(label: string): AlertActionBuilder {
  return (_context, opts) => {
    const slug = typeof opts.slug === "string" ? opts.slug.trim() : "";
    if (!slug) return null;
    return {
      label,
      href: `/admin?show=${encodeURIComponent(slug)}#share-access`,
      external: false,
    };
  };
}

const openSheet: AlertActionBuilder = (context) => {
  const href = buildSheetDeepLink(str(context, "drive_file_id"));
  return href ? { label: "Open in Sheet", href, external: true } : null;
};

// GitHub owner: alphanumerics + hyphen only. Repo name: adds _ and ., but a
// pure dot segment (`.`/`..`) URL-normalizes away from the intended path, and
// the producer defaults missing GITHUB_REPOSITORY to the literal "owner/repo"
// (scripts/verify-branch-protection.ts:49-50) — both fail quiet.
const branchSettings: AlertActionBuilder = (context) => {
  const repo = str(context, "repo");
  if (!repo || repo === "owner/repo") return null;
  const segments = repo.split("/");
  if (segments.length !== 2) return null;
  const [owner, name] = segments;
  if (!owner || !/^[A-Za-z0-9-]+$/.test(owner)) return null;
  if (!name || !/^[A-Za-z0-9_.-]+$/.test(name) || name === "." || name === "..") return null;
  return {
    label: "Open branch settings",
    href: `https://github.com/${repo}/settings/branches`,
    external: true,
  };
};

export const ALERT_ACTIONS: Record<AlertActionCode, AlertActionBuilder> = {
  SHOW_FIRST_PUBLISHED: shareAccess("Go to Published toggle"),
  PICKER_EPOCH_RESET: shareAccess("Go to Share & access"),
  PICKER_SELECTION_RACE: shareAccess("Go to Share & access"),
  ROLE_FLAGS_NOTICE: openSheet,
  LIVE_ROW_CONFLICT: (context) => {
    const sheet = buildSheetDeepLink(str(context, "drive_file_id"));
    if (sheet) return { label: "Open in Sheet", href: sheet, external: true };
    const folder = driveFolderUrl(str(context, "folder_id"));
    if (folder) return { label: "Open Drive folder", href: folder, external: true };
    return null;
  },
  WIZARD_SESSION_SUPERSEDED_RACE: () => ({
    label: "Go to setup wizard",
    href: "/admin/onboarding",
    external: false,
  }),
  REPORT_ORPHANED_LOST_LEASE: (context) => {
    const url = str(context, "orphan_url");
    if (!url || !url.startsWith("https://github.com/")) return null;
    return { label: "Open GitHub issue", href: url, external: true };
  },
  BRANCH_PROTECTION_DRIFT: branchSettings,
  BRANCH_PROTECTION_MONITOR_AUTH_FAILED: branchSettings,
  // Re-sync quality gate (audit #3): link the held-shrink alert to the ReSyncButton so the admin
  // can review the shrink counts and accept the reduced version (or wait for Doug's fix).
  // admin-show-modal D7: #resync never had a DOM id (dead fragment); the sheet/sync block lives
  // inside the Overview section of the review modal, so the link targets #overview.
  RESYNC_SHRINK_HELD: (_context, opts) => {
    const slug = typeof opts.slug === "string" ? opts.slug.trim() : "";
    if (!slug) return null; // fail-quiet when slug missing (registry contract)
    return {
      label: "Review & re-sync",
      href: `/admin?show=${encodeURIComponent(slug)}#overview`,
      external: false,
    };
  },
  // Setup-scan hard-fail folder alert (global, showId null). The card names the
  // failed sheets; this link jumps to the Drive folder where they live so the
  // admin can fix the layout or remove the file — the condition then self-heals
  // (hybrid lifecycle, PR #414). Only folder_id is in context (many files fail
  // at once, so there is no single drive_file_id to deep-link). Fail-quiet.
  ONBOARDING_SHEET_UNREADABLE: (context) => {
    const folder = driveFolderUrl(str(context, "folder_id"));
    return folder ? { label: "Open Drive folder", href: folder, external: true } : null;
  },
};

const REGISTERED = new Set<string>(ALERT_ACTION_CODES);

export function resolveAlertAction(
  code: string,
  context: Record<string, unknown> | null,
  opts: { slug: string | null; driveFileId?: string | null },
): AlertActionLink | null {
  if (!REGISTERED.has(code)) return null;
  return ALERT_ACTIONS[code as AlertActionCode](context, opts);
}

/**
 * Ordered action list for surfaces that can render more than one link (bell
 * panel — spec 2026-07-17 §3.4). resolveAlertAction keeps its single-link
 * signature untouched for its other callers (HealthAlertsPanel). Every code
 * delegates to the single resolver — the ROLE_FLAGS_NOTICE show-page review
 * link that used to lead this list is retired (spec §4.1): the bell's
 * per-row chevron now carries show-page nav for every row with a slug, so
 * duplicating that link here would be redundant.
 */
export function resolveAlertActions(
  code: string,
  context: Record<string, unknown> | null,
  opts: { slug: string | null; driveFileId?: string | null },
): AlertActionLink[] {
  const single = resolveAlertAction(code, context, opts);
  return single ? [single] : [];
}
