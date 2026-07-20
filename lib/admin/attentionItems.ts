// lib/admin/attentionItems.ts
//
// Published Show Alerts (spec docs/superpowers/specs/2026-07-19-published-show-alerts.md §3-§4).
// ONE pure derivation feeds the modal's four attention surfaces (header pill+menu,
// nav dots/badges, inline banners, clearing footer) so counts can never drift.
// Client-safe: no I/O, no Date.now, catalog-only imports.
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { FeedEntry } from "@/lib/sync/holds/types";
import { resolveAlertAction, type AlertActionLink } from "@/lib/adminAlerts/alertActions";
import { isInboxRouted } from "@/lib/messages/adminSurface";
import { PARSE_FAILURE_ALLOWLIST } from "@/lib/messages/parseFailureReason";
import { isAutoResolving, autoResolveNote } from "@/lib/adminAlerts/audience";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import { messageFor, interpolate, type MessageParams } from "@/lib/messages/lookup";
import { GAP_CLASSES, type DataGapsSummary } from "@/lib/parser/dataGaps";

export type RoutedSectionId = SectionId | "overview" | "changes";

export type AttentionRoute = { sectionId: Extract<RoutedSectionId, "crew" | "overview"> };

/** Structural input row — lib/adminAlerts/fetchPerShowAlerts' AdminAlertRow satisfies this. */
export type AttentionAlertInput = {
  id: string;
  code: string;
  context: Record<string, unknown> | null;
  raised_at: string;
  occurrence_count: number;
  identityText: string | null;
  messageParams: MessageParams;
  crewName: string | null;
};

export type AttentionAlertPayload = {
  alertId: string;
  code: string;
  template: string | null;
  params: MessageParams;
  action: AlertActionLink | null;
  helpHref: string | null;
  raisedAt: string;
  occurrenceCount: number;
  autoClearNote: string | null;
  failedKeys: string[] | null;
  dataGaps: DataGapsSummary | null;
  /** Allowlisted parse-failure invariant code for PARSE_ERROR_LAST_GOOD, else null
   *  (attention-alert-routing §3.1). Resolved to operator copy by parseFailureReasonTitle. */
  errorCode: string | null;
};

export type AttentionItem = {
  id: string;
  kind: "alert" | "hold";
  tone: "critical" | "notice";
  sectionId: RoutedSectionId;
  crewKey: string | null;
  actionable: boolean;
  menuTitle: string;
  menuSubtitle: string | null;
  alert?: AttentionAlertPayload;
};

// The exact PerShowAlertSection fallback line (spec §5.4; invariant 5).
export const ATTENTION_FALLBACK_TITLE = "Something needs your attention on this show.";
// Inbox-routed auto-clear copy (PerShowAlertSection parity).
const INBOX_AUTOCLEAR_NOTE = "Clears automatically once the sheet is back or re-parses.";

/**
 * Full-production-registry routing (spec §4): keys are SET-EQUAL to
 * tests/messages/adminAlertsRegistry.ts ADMIN_ALERTS_CODES — pinned by
 * tests/admin/_metaAttentionRoutes.test.ts (lib/ must not import tests/, so the
 * list is declared here and equality-checked there). Unregistered runtime codes
 * fall back to overview.
 */
export const ATTENTION_ROUTES: Record<string, AttentionRoute> = {
  // crew-domain (spec §4 row 1)
  AMBIGUOUS_EMAIL_BINDING: { sectionId: "crew" },
  OAUTH_IDENTITY_CLAIMED: { sectionId: "crew" },
  ROLE_FLAGS_NOTICE: { sectionId: "crew" },
  // everything else registered → overview (spec §4 row 2)
  PICKER_BOOTSTRAP_RPC_FAILED: { sectionId: "overview" },
  PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED: { sectionId: "overview" },
  CALLBACK_CLAIM_THREW: { sectionId: "overview" },
  PICKER_SELECTION_RACE: { sectionId: "overview" },
  PICKER_EPOCH_RESET: { sectionId: "overview" },
  ASSET_RECOVERY_BYTES_EXCEEDED: { sectionId: "overview" },
  ASSET_RECOVERY_REVISION_DRIFT: { sectionId: "overview" },
  ASSET_RECOVERY_DRIFT_COOLDOWN: { sectionId: "overview" },
  WATCH_CHANNEL_ORPHANED: { sectionId: "overview" },
  WEBHOOK_TOKEN_INVALID: { sectionId: "overview" },
  EMBEDDED_RECOVERY_REQUIRES_RESTAGE: { sectionId: "overview" },
  LIVE_ROW_CONFLICT: { sectionId: "overview" },
  DRIVE_FETCH_FAILED: { sectionId: "overview" },
  PARSE_ERROR_LAST_GOOD: { sectionId: "overview" },
  SHEET_UNAVAILABLE: { sectionId: "overview" },
  RESYNC_SHRINK_HELD: { sectionId: "overview" },
  RESYNC_QUALITY_REGRESSED: { sectionId: "overview" },
  SYNC_STALLED: { sectionId: "overview" },
  EMAIL_DELIVERY_FAILED: { sectionId: "overview" },
  EMAIL_NOT_CONFIGURED: { sectionId: "overview" },
  SHOW_FIRST_PUBLISHED: { sectionId: "overview" },
  SHOW_UNPUBLISHED: { sectionId: "overview" },
  PENDING_SNAPSHOT_PROMOTE_STUCK: { sectionId: "overview" },
  PENDING_SNAPSHOT_ROLLBACK_STUCK: { sectionId: "overview" },
  PENDING_SNAPSHOT_DELETE_STUCK: { sectionId: "overview" },
  OPENING_REEL_PERMISSION_DENIED: { sectionId: "overview" },
  OPENING_REEL_NOT_VIDEO: { sectionId: "overview" },
  REEL_DRIFTED: { sectionId: "overview" },
  EMBEDDED_ASSET_DRIFTED: { sectionId: "overview" },
  REPORT_ORPHANED_LOST_LEASE: { sectionId: "overview" },
  REPORT_LOOKUP_INCONCLUSIVE: { sectionId: "overview" },
  GITHUB_BOT_LOGIN_MISSING: { sectionId: "overview" },
  REPORT_DUPLICATE_LIVE_MATCHES: { sectionId: "overview" },
  REPORT_OPEN_ORPHAN_LABEL: { sectionId: "overview" },
  REPORT_LEASE_THRASHING: { sectionId: "overview" },
  STALE_ORPHAN_REPORT: { sectionId: "overview" },
  TILE_SERVER_RENDER_FAILED: { sectionId: "overview" },
  TILE_PROJECTION_FETCH_FAILED: { sectionId: "overview" },
  BRANCH_PROTECTION_DRIFT: { sectionId: "overview" },
  BRANCH_PROTECTION_MONITOR_AUTH_FAILED: { sectionId: "overview" },
  WIZARD_SESSION_SUPERSEDED_RACE: { sectionId: "overview" },
  ONBOARDING_SHEET_UNREADABLE: { sectionId: "overview" },
};

const UNRESOLVED_PLACEHOLDER_RE = /<[a-zA-Z_][a-zA-Z0-9_-]*>/;

/**
 * The raw catalog template when the alert's params fully interpolate it, else
 * null (the retired PerShowAlertSection's safeDougFacingTemplate rule —
 * guards uncataloged codes AND unresolved <placeholder> tokens so a leaked token
 * never reaches the UI; invariant 5).
 *
 * SHOW-SCOPED BY CONSTRUCTION: this prefers `dougFacingShowScoped` when the
 * entry defines one. It needs no scope parameter because it is reachable from
 * exactly one place — `deriveAttentionItems` below, whose only caller is the
 * show modal (app/admin/_showReviewModal.tsx). The bell reads `dougFacing`
 * directly through its own `rowCopy` (components/admin/BellPanel.tsx), so
 * global rendering cannot see the variant. That topology is pinned by
 * tests/admin/_metaAttentionItemsTopology.test.ts, so a second caller fails
 * CI rather than silently inheriting show-scoped copy.
 *
 * Spec docs/superpowers/specs/2026-07-20-show-scoped-alert-copy-design.md §3.5.
 */
export function safeDougFacingTemplate(
  code: string,
  params: MessageParams | undefined,
): string | null {
  if (!(code in MESSAGE_CATALOG)) return null;
  const entry = messageFor(code as MessageCode);
  const template = entry.dougFacingShowScoped ?? entry.dougFacing;
  if (!template) return null;
  // Validate the SELECTED template, not the global one, so a variant that
  // fails to interpolate is rejected by the same guard.
  const interpolated = interpolate(template, params);
  if (!interpolated || UNRESOLVED_PLACEHOLDER_RE.test(interpolated)) return null;
  return template;
}

/** Catalog longform education link for the code, else null. */
export function catalogHelpHref(code: string): string | null {
  if (!(code in MESSAGE_CATALOG)) return null;
  return messageFor(code as MessageCode).helpHref;
}

/**
 * SHOW_FIRST_PUBLISHED data-gaps digest off untyped jsonb context (the retired
 * section's readDataGapsDigest rule): well-formed summary with total>0, else
 * null. Old 3-key contexts default missing gap classes to 0; the persisted
 * total is kept as-is (point-in-time snapshot).
 */
export function readDataGapsDigest(
  context: Record<string, unknown> | null,
): DataGapsSummary | null {
  const raw = context?.data_gaps;
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { total?: unknown; classes?: unknown };
  if (typeof candidate.total !== "number" || candidate.total <= 0) return null;
  const classes = candidate.classes;
  if (!classes || typeof classes !== "object") return null;
  const c = classes as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    total: candidate.total,
    classes: Object.fromEntries(
      GAP_CLASSES.map((g) => [g.code, num(c[g.code])]),
    ) as DataGapsSummary["classes"],
  };
}

/** Relative "Raised …" label (client-safe: caller supplies now). */
export function formatRelativeRaisedAt(iso: string, now: Date): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  const minutes = Math.floor((now.getTime() - parsed) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function canonicalCrewKey(name: string): string {
  return name.trim().toLowerCase();
}

function alertTitle(code: string): string {
  if (!(code in MESSAGE_CATALOG)) return ATTENTION_FALLBACK_TITLE;
  const title = messageFor(code as MessageCode).title;
  return title && title.length > 0 ? title : ATTENTION_FALLBACK_TITLE;
}

function readFailedKeys(code: string, context: Record<string, unknown> | null): string[] | null {
  if (code !== "TILE_PROJECTION_FETCH_FAILED" || !Array.isArray(context?.failedKeys)) return null;
  return (context.failedKeys as unknown[]).filter((k): k is string => typeof k === "string");
}

// Read-layer defense: only an allowlisted persisted code reaches the payload, so a
// context value outside the allowlist renders no reason (attention-alert-routing §3.1).
function readErrorCode(context: Record<string, unknown> | null): string | null {
  const v = context?.error_code;
  return typeof v === "string" && PARSE_FAILURE_ALLOWLIST.has(v) ? v : null;
}

function toAlertItem(row: AttentionAlertInput, slug: string): AttentionItem {
  const actionable = !isInboxRouted(row.code) && !isAutoResolving(row.code);
  const autoClearNote = actionable
    ? null
    : isInboxRouted(row.code)
      ? INBOX_AUTOCLEAR_NOTE
      : autoResolveNote(row.code);
  const route = ATTENTION_ROUTES[row.code] ?? { sectionId: "overview" as const };
  const crewKey =
    route.sectionId === "crew" && row.crewName ? canonicalCrewKey(row.crewName) : null;
  return {
    id: `alert:${row.id}`,
    kind: "alert",
    tone: "notice",
    sectionId: route.sectionId,
    crewKey,
    actionable,
    menuTitle: alertTitle(row.code),
    menuSubtitle: row.identityText,
    alert: {
      alertId: row.id,
      code: row.code,
      template: safeDougFacingTemplate(row.code, row.messageParams),
      params: row.messageParams,
      action: resolveAlertAction(row.code, row.context, { slug }),
      helpHref: catalogHelpHref(row.code),
      raisedAt: row.raised_at,
      occurrenceCount: row.occurrence_count,
      autoClearNote,
      failedKeys: readFailedKeys(row.code, row.context),
      dataGaps: row.code === "SHOW_FIRST_PUBLISHED" ? readDataGapsDigest(row.context) : null,
      errorCode: readErrorCode(row.context),
    },
  };
}

function toHoldItem(entry: FeedEntry): AttentionItem | null {
  if (entry.status !== "pending" || entry.action !== "approve_reject" || !entry.gate) return null;
  return {
    id: `hold:${entry.gate.holdId}`,
    kind: "hold",
    tone: "critical",
    sectionId: "changes",
    crewKey: null,
    actionable: true,
    menuTitle: entry.summary,
    menuSubtitle: "Pick what happens in Changes",
  };
}

/**
 * Spec §3.1 ordering: actionable before auto-clearing; critical before notice
 * (holds are the only critical tier); alerts keep raised_at DESC fetch order;
 * holds keep feed order.
 */
export function deriveAttentionItems(args: {
  alerts: AttentionAlertInput[];
  feed: { entries: FeedEntry[] } | null;
  slug: string;
}): AttentionItem[] {
  const holdItems = (args.feed?.entries ?? [])
    .map(toHoldItem)
    .filter((i): i is AttentionItem => i !== null);
  const alertItems = args.alerts.map((row) => toAlertItem(row, args.slug));
  const actionableAlerts = alertItems.filter((i) => i.actionable);
  const clearing = alertItems.filter((i) => !i.actionable);
  return [...holdItems, ...actionableAlerts, ...clearing];
}
