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
import {
  isAutoResolving,
  autoResolveNote,
  DOUG_EXCLUDED_CODES,
  isSelfHealing,
} from "@/lib/adminAlerts/audience";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import { messageFor, interpolate, type MessageParams } from "@/lib/messages/lookup";
import { GAP_CLASSES, type DataGapsSummary } from "@/lib/parser/dataGaps";

export type RoutedSectionId = SectionId | "overview" | "changes";

/** Content anchors within a section (attention-alert-routing §3.2/§3.3). */
export type AttentionAnchor = "diagrams" | "opening_reel";

/** Section-scoped route: anchors are declared per section, so an invalid pairing
 *  (e.g. crew + diagrams) is a COMPILE error, not a runtime drop (§3.2). rooms and
 *  event host attention cards ONLY through their content anchor (Diagrams sub-block
 *  / opening_reel field) — they have no section-top consumer — so the anchor is
 *  REQUIRED there: an anchorless `{ sectionId: "rooms" }` is a compile error, which
 *  structurally prevents a card from being routed to a consumerless section-top
 *  (Codex PR3 R2). Every other section is a section-top consumer and takes no anchor. */
export type AttentionRoute =
  | { sectionId: "rooms"; anchor: "diagrams" }
  | { sectionId: "event"; anchor: "opening_reel" }
  | { sectionId: Exclude<RoutedSectionId, "rooms" | "event">; anchor?: never };

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
  /** §6.2: id-matched crew fan-out target (AMBIGUOUS_EMAIL_BINDING only).
   *  OPTIONAL — spread-inserted only when derived; absent == no match. */
  crewMatch?: { crewMemberIds: string[]; expectedCount: number };
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

type AttentionItemBase = {
  id: string;
  tone: "critical" | "notice";
  sectionId: RoutedSectionId;
  crewKey: string | null;
  actionable: boolean;
  menuTitle: string;
  menuSubtitle: string | null;
  /** For non-actionable (clearing) alert items only: which clearing group.
   *  Absent on actionable items and holds. Spec 2026-07-21 §3.1. */
  clearingKind?: "self_heal" | "needs_look";
  /** §6.2: id-matched crew fan-out target, copied from the input row. OPTIONAL —
   *  present only on AMBIGUOUS_EMAIL_BINDING alert items with a derived match. */
  crewMatch?: { crewMemberIds: string[]; expectedCount: number };
};

/**
 * Discriminated by `kind` so an `alert` item ALWAYS carries its payload (Codex PR3
 * R3): `{ kind: "alert", alert: undefined }` — an item the pill/menu count but
 * bucketAttention silently skips and AttentionBanner renders null — is now a compile
 * error. A `hold` never carries a payload. Structural no-drop at the type level.
 */
export type AttentionItem =
  | (AttentionItemBase & { kind: "alert"; alert: AttentionAlertPayload })
  | (AttentionItemBase & { kind: "hold"; alert?: never });

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
  ASSET_RECOVERY_BYTES_EXCEEDED: { sectionId: "rooms", anchor: "diagrams" },
  ASSET_RECOVERY_REVISION_DRIFT: { sectionId: "overview" },
  ASSET_RECOVERY_DRIFT_COOLDOWN: { sectionId: "overview" },
  WATCH_CHANNEL_ORPHANED: { sectionId: "overview" },
  WEBHOOK_TOKEN_INVALID: { sectionId: "overview" },
  EMBEDDED_RECOVERY_REQUIRES_RESTAGE: { sectionId: "rooms", anchor: "diagrams" },
  LIVE_ROW_CONFLICT: { sectionId: "overview" },
  DRIVE_FETCH_FAILED: { sectionId: "overview" },
  PARSE_ERROR_LAST_GOOD: { sectionId: "warnings" },
  SHEET_UNAVAILABLE: { sectionId: "overview" },
  RESYNC_SHRINK_HELD: { sectionId: "overview" },
  RESYNC_QUALITY_REGRESSED: { sectionId: "warnings" },
  SYNC_STALLED: { sectionId: "overview" },
  EMAIL_DELIVERY_FAILED: { sectionId: "overview" },
  EMAIL_NOT_CONFIGURED: { sectionId: "overview" },
  SHOW_FIRST_PUBLISHED: { sectionId: "overview" },
  SHOW_UNPUBLISHED: { sectionId: "overview" },
  PENDING_SNAPSHOT_PROMOTE_STUCK: { sectionId: "overview" },
  PENDING_SNAPSHOT_ROLLBACK_STUCK: { sectionId: "overview" },
  PENDING_SNAPSHOT_DELETE_STUCK: { sectionId: "overview" },
  OPENING_REEL_PERMISSION_DENIED: { sectionId: "event", anchor: "opening_reel" },
  OPENING_REEL_NOT_VIDEO: { sectionId: "event", anchor: "opening_reel" },
  REEL_DRIFTED: { sectionId: "event", anchor: "opening_reel" },
  EMBEDDED_ASSET_DRIFTED: { sectionId: "rooms", anchor: "diagrams" },
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

// Read-layer defense: the reason belongs ONLY to PARSE_ERROR_LAST_GOOD, and only an
// allowlisted persisted code survives (attention-alert-routing §3.1). Gating on the
// alert code too prevents an unrelated alert whose context happens to carry an
// `error_code` from surfacing a parse reason on the wrong card.
function readErrorCode(code: string, context: Record<string, unknown> | null): string | null {
  if (code !== "PARSE_ERROR_LAST_GOOD") return null;
  const v = context?.error_code;
  return typeof v === "string" && PARSE_FAILURE_ALLOWLIST.has(v) ? v : null;
}

function toAlertItem(
  row: AttentionAlertInput,
  slug: string,
  driveFileId: string | null,
): AttentionItem {
  const actionable = !isInboxRouted(row.code) && !isAutoResolving(row.code);
  // clearingKind is set only on non-actionable (clearing) items; conditional spread
  // avoids assigning `undefined` (exactOptionalPropertyTypes). Spec §3.1.
  const clearingKindPatch: { clearingKind?: "self_heal" | "needs_look" } = actionable
    ? {}
    : { clearingKind: isSelfHealing(row.code) ? "self_heal" : "needs_look" };
  const autoClearNote = actionable
    ? null
    : isInboxRouted(row.code)
      ? INBOX_AUTOCLEAR_NOTE
      : autoResolveNote(row.code);
  const route = ATTENTION_ROUTES[row.code] ?? { sectionId: "overview" as const };
  const crewKey =
    route.sectionId === "crew" && row.crewName ? canonicalCrewKey(row.crewName) : null;
  // §6.2: carry the derived crew fan-out target onto the item. Spread-inserted so
  // an item without a match never gains an explicit `undefined` (exactOptional).
  const crewMatchPatch: { crewMatch?: { crewMemberIds: string[]; expectedCount: number } } =
    row.crewMatch ? { crewMatch: row.crewMatch } : {};
  return {
    id: `alert:${row.id}`,
    kind: "alert",
    tone: "notice",
    sectionId: route.sectionId,
    crewKey,
    actionable,
    ...clearingKindPatch,
    ...crewMatchPatch,
    menuTitle: alertTitle(row.code),
    menuSubtitle: row.identityText,
    alert: {
      alertId: row.id,
      code: row.code,
      template: safeDougFacingTemplate(row.code, row.messageParams),
      params: row.messageParams,
      action: resolveAlertAction(row.code, row.context, { slug, driveFileId }),
      helpHref: catalogHelpHref(row.code),
      raisedAt: row.raised_at,
      occurrenceCount: row.occurrence_count,
      autoClearNote,
      failedKeys: readFailedKeys(row.code, row.context),
      dataGaps: row.code === "SHOW_FIRST_PUBLISHED" ? readDataGapsDigest(row.context) : null,
      errorCode: readErrorCode(row.code, row.context),
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
  /** Show-level Google Drive file id, threaded to sheet-link action builders
   *  (spec 2026-07-21 §3.1/§4). Optional; production modal passes it, tests may omit. */
  driveFileId?: string | null;
  /** TEST SEAM (warning-surface-trim §5). Production callers pass nothing and
   *  get `DOUG_EXCLUDED_CODES`. It exists because only two set members carry an
   *  `ATTENTION_ROUTES` row today, so behavior over the live set cannot
   *  distinguish a set-driven filter from a two-code hand-list, and a source
   *  scan cannot distinguish it from one that slices the set's first two
   *  members. Injecting two disjoint sets can. Pinned test-only by
   *  tests/admin/attentionExclusionSet.test.ts. */
  excludedCodes?: readonly string[];
}): AttentionItem[] {
  const holdItems = (args.feed?.entries ?? [])
    .map(toHoldItem)
    .filter((i): i is AttentionItem => i !== null);
  // PICKER_EPOCH_RESET is cut from the attention surface (attention-alert-routing
  // §1.1): PickerResetControl already shows an inline success banner and
  // logAdminOutcome records the durable audit. Its ATTENTION_ROUTES row remains for
  // registry totality; the cut lives here so the row can stay.
  // warning-surface-trim §5: info-severity codes leave the attention surface.
  // `DOUG_EXCLUDED_CODES` is info-severity UNION health, ratified by
  // docs/superpowers/specs/alerts/2026-07-04-alert-audience-split.md §3 as
  // excluded from Doug's surfaces, and until now had zero production consumers:
  // the amber banner it governed (PerShowAlertSection) was replaced by this
  // surface and the exclusion silently stopped applying. The health arm is
  // already excluded upstream by fetchPerShowAlerts, so adding the whole set is
  // a no-op there rather than a second filter with different semantics.
  //
  // MODAL ONLY. The bell builds its entries from its own feed endpoint and
  // reads `dougFacing` through its own `rowCopy`, so nothing here can reach it;
  // the admin_alerts row and its audit trail are untouched.
  const excluded = new Set(args.excludedCodes ?? DOUG_EXCLUDED_CODES);
  const alertItems = args.alerts
    .filter((row) => row.code !== "PICKER_EPOCH_RESET" && !excluded.has(row.code))
    .map((row) => toAlertItem(row, args.slug, args.driveFileId ?? null));
  const actionableAlerts = alertItems.filter((i) => i.actionable);
  const clearing = alertItems.filter((i) => !i.actionable);
  // needs-a-look sorts before monitoring within the clearing tail (spec §3.1).
  const needsLook = clearing.filter((i) => i.clearingKind === "needs_look");
  const selfHeal = clearing.filter((i) => i.clearingKind === "self_heal");
  return [...holdItems, ...actionableAlerts, ...needsLook, ...selfHeal];
}
