// Scenario row types for the dev attention gallery (spec
// docs/superpowers/specs/2026-07-20-attention-scenario-gallery-design.md §3.0).
//
// Scenarios declare STORABLE inputs - the shapes that actually live in the
// database - never pre-built AttentionItems and never derived read-model shapes.
// That is the load-bearing constraint of the whole design: a field the gallery
// honors but materialize cannot reproduce would teach the operator a state that
// does not exist (§3.3).
import type { AlertIdentity } from "@/lib/adminAlerts/identityTypes";
import type { Disposition } from "@/lib/sync/holds/types";
import type { ParseWarning } from "@/lib/parser/types";
import type { BucketOpts } from "@/lib/admin/sectionAttention";
import type { ScenarioGroupId } from "@/lib/dev/galleryModalTypes";

/**
 * The base gallery fixture's collection sizes (lib/dev/publishedModalFixture.ts).
 * validate.ts rejects `volumes` equal to these as no-ops; the fixture-knobs test
 * pins the real fixture lengths against this constant so drift is loud.
 */
export const GALLERY_BASE_COUNTS = { crew: 6, rooms: 3, hotels: 2 } as const;

/**
 * Storable show_change_log columns as `readShowChangeFeed` selects them
 * (ChangeLogRow at lib/sync/feed/shapeChangeFeed.ts), minus `id` (synthesized
 * like alert/hold ids). `change_kind` is deliberately an open string: the DB
 * carries no CHECK and production also writes e.g. "use_raw_stale"; undo gating
 * keys only off the crew-domain set inside the shaper.
 */
export type ScenarioChangeLogRow = {
  occurred_at: string;
  status: "applied" | "pending" | "rejected" | "undone" | "superseded";
  summary: string;
  entity_ref: string | null;
  change_kind: string;
  individually_undoable: boolean;
  source: "auto_apply" | "mi11_approve" | "mi11_reject" | "undo";
  acknowledged_at: string | null;
};

/**
 * Gallery-render-only fixture shaping (spec 2026-07-22 modal-state-coverage
 * §3.0/§3.2). Tier 2 only. Every knob must be semantically effective — explicit
 * base-default values, empty containers, and volumes equal to
 * GALLERY_BASE_COUNTS are validation errors, so "fixture present" always means
 * "renders something the base does not".
 */
export type ScenarioFixture = {
  /** archived: true FORCES published false + finalizeOwned false in the applied
   *  output (archive is atomically archived+unpublished; the loader forces
   *  finalize ownership false when archived, app/admin/_showReviewModal.tsx:300).
   *  Explicit contradictions are validation errors. */
  archived?: boolean;
  published?: boolean;
  finalizeOwned?: boolean;
  /** Requires published not false, archived not true, datesAbsent not true; the
   *  applied output reshapes snapshot dates to span GALLERY_NOW so the badge is
   *  date-consistent with production's published && isShowLiveOnDate derivation. */
  isLive?: boolean;
  /** null = "Not synced yet" posture (with a non-null sync timestamp). */
  lastSyncStatus?: string | null;
  /** true → lastSyncedAt AND lastCheckedAt null → the sync element is absent.
   *  Shadow guards: contradicts any explicit lastSyncStatus and checkedAbsent. */
  neverSynced?: boolean;
  /** true → lastCheckedAt null while lastSyncedAt is kept (the sync-age badge
   *  falls back). Contradicts any explicit lastSyncStatus other than "ok". */
  checkedAbsent?: boolean;
  /** true → modal title override null (production converts empty adapter title
   *  to null); snapshot show.title "". Header AND StatusStrip fall back to slug. */
  titleAbsent?: boolean;
  /** true → snapshot dates all null/empty → "Dates not detected" + empty
   *  run-of-show. */
  datesAbsent?: boolean;
  /** true → snapshot client_label "" (NOT null — the DDL is NOT NULL; the
   *  adapter maps the stored empty string to the absent UI state). */
  clientAbsent?: boolean;
  /** true → data.alertId = the synthetic id of the first alert whose DERIVED
   *  item survives the modal cut (validated via derivation probe). */
  alertFlash?: boolean;
  /** Snapshot collections emptied. `agenda` removes the Agenda SECTION
   *  (includesAgenda keys off agenda_links); `billing` nulls coi_status. */
  empty?: Array<
    "crew" | "venue" | "rooms" | "hotels" | "transport" | "contacts" | "billing" | "agenda"
  >;
  /** Deterministic synthetic rows generated past the render caps. */
  volumes?: {
    crew?: number;
    rooms?: number;
    hotels?: number;
    /** 15 pure-agenda ros days × 8 agenda-kind entries + 1 synthetic-only day. */
    schedule?: "overflow";
    /** Full PersistedEmbeddedImage rows on the diagrams anchor; requires a
     *  diagrams-anchored alert. */
    diagramImages?: number;
    packlist?: { cases: number; itemsPerCase: number };
    /** Base agenda link gains an extraction overflowing the preview caps. */
    agenda?: "overflow";
    /** N grammar-conforming agenda links ("AGENDA <n> - <suffix>"). */
    agendaLinks?: number;
    /** Names on hotel 1 (the avatar-stack cap is 5). */
    hotelGuests?: number;
  };
  /** Active crew link: threads a synthetic share token to the switcher's
   *  ShareTokenProvider and reshapes the snapshot roster so exactly
   *  `crewEmails` members carry an email; the modal's crewEmails prop is
   *  DERIVED from the reshaped snapshot the way the production loader derives
   *  it (app/admin/_showReviewModal.tsx:358-362). */
  share?: { linkActive: true; crewEmails: number };
};

/**
 * Exactly the columns `fetchPerShowAlerts` selects
 * (lib/adminAlerts/fetchPerShowAlerts.ts:100), plus the identity the gallery
 * cannot resolve for synthetic rows.
 *
 * `context` is NOT NULL in the DDL, so it is `{}` and never null - a null
 * default would be gallery-legal but un-insertable, diverging exactly where the
 * fidelity contract forbids.
 */
export type ScenarioAlertRow = {
  code: string;
  context: Record<string, unknown>;
  raised_at: string;
  occurrence_count: number;
  /** GALLERY-ONLY. Never inserted; materialize resolves the real identity (§3.3). */
  galleryIdentity?: AlertIdentity | null;
  /** GALLERY-ONLY id-matched crew fan-out declaration (spec §6.2). Mirrors the
   *  production-derived shape so a gallery scenario can demo the fan-out placement
   *  without a live roster; threaded onto the derived alert input by
   *  deriveScenarioAttention. Validated: UUID members, expectedCount ===
   *  deduped id count. Absent → the banner stays section-top. */
  crewMatch?: { crewMemberIds: string[]; expectedCount: number };
};

/**
 * The storable `sync_holds` shape, not the derived FeedEntry. `kind` is fixed to
 * `mi11_pending` because it is the only kind that becomes an attention item:
 * `toHoldItem` (lib/admin/attentionItems.ts:284-286) returns null unless the
 * entry is pending + approve_reject + gated, which only an open mi11 hold
 * produces.
 */
export type ScenarioHoldRow = {
  drive_file_id: string;
  domain: "crew_email" | "crew_identity";
  entity_key: string;
  held_value: Record<string, unknown>;
  proposed_value: Disposition;
  base_modified_time: string;
  kind: "mi11_pending";
  reservation_collisions?: Array<{ name: string; email: string | null }>;
};

export type PropActionOutcome =
  | { kind: "success" }
  | { kind: "error"; code: string }
  | { kind: "pending" };

/** The only error codes the re-sync route emits (app/api/admin/sync/[slug]/route.ts:76-106). */
export const RESYNC_ERROR_CODES = [
  "SYNC_INFRA_ERROR",
  "PENDING_SYNC_NOT_FOUND",
  "FINALIZE_OWNED_SHOW",
  "SHOW_BUSY_RETRY",
] as const;

/** Per-control scripted outcomes (spec 2026-07-23-gallery-action-outcomes §3.0). */
export type ScenarioActionOutcomes = {
  setPublished?: PropActionOutcome;
  archive?: PropActionOutcome | { kind: "not_found" };
  undo?: PropActionOutcome;
  accept?: PropActionOutcome;
  acceptAll?: PropActionOutcome;
  approve?: PropActionOutcome;
  reject?: PropActionOutcome;
  resync?:
    | { kind: "success"; outcome?: "applied" | "stage" | "skipped" | "asset_recovery" }
    | { kind: "shrink_held"; detail: string }
    | { kind: "error"; code: (typeof RESYNC_ERROR_CODES)[number] }
    | { kind: "pending" };
  resolve?: { kind: "success" } | { kind: "error"; code: string } | { kind: "pending" };
  bulkIgnore?: { kind: "partial"; okCount: number } | { kind: "fail" } | { kind: "pending" };
  crewReset?: { kind: "success" } | { kind: "not_found" } | { kind: "error" } | { kind: "pending" };
  rotate?: { kind: "success" } | { kind: "error" } | { kind: "pending" };
  everyoneReset?: { kind: "success" } | { kind: "error" } | { kind: "pending" };
};

export type AttentionScenario = {
  /** ^[a-z0-9][a-z0-9-]{2,47}$ - DOM anchor, query value, synthetic id prefix, DB tag. */
  id: string;
  tier: 1 | 2 | 3;
  label: string;
  alerts: ScenarioAlertRow[];
  holds: ScenarioHoldRow[];
  /**
   * TRI-STATE (§3.4). Absent: do not touch shows_internal.parse_warnings.
   * Empty array: deliberately write zero warnings. Non-empty: write them.
   */
  warnings?: ParseWarning[];
  /** Tier 2 only - predicate functions, so they never cross the RSC boundary. */
  bucket?: Partial<BucketOpts>;
  /** Tier 2 only - a loader fault, not reproducible from stored rows. */
  degraded?: boolean;
  /** Tier 2 only - a read-model condition (feed page cap), not reproducible from stored rows. */
  feedTruncated?: boolean;
  /** Tier 2 only - storable show_change_log rows shaped by the REAL feed shaper
   *  (shapeChangeFeed). Max 50 rows (the production reader's page limit). */
  changeLog?: ScenarioChangeLogRow[];
  /** Tier 2 only - renders the ChangesSection feed-infra-error notice: the
   *  modal-data builder passes an explicit `feed: null` override. Exclusive with
   *  ENTRIES (holds, non-empty changeLog, feedTruncated: true); empty arrays and
   *  absent flags are legal beside it (emptiness equals absence). */
  feedNull?: boolean;
  /** Tier 2 only - gallery-render-only fixture shaping. */
  fixture?: ScenarioFixture;
  /** Tier 2 only - indexes into `warnings` marked as ignored (content-keyed).
   *  Each target needs a non-blank rawSnippet, and its fingerprint must not
   *  collide with an ACTIVE warning's fingerprint. */
  ignoreWarningIndexes?: number[];
  /** Tier 2 only - nav group used when the scenario derives no attention items
   *  and no warning sections (fixture/feed-only states). Ignored when real
   *  sections exist. */
  landing?: ScenarioGroupId;
  /** Tier 2 only - scripts the outcome each modal control's action resolves to.
   *  Click-driven: nothing fires on mount. Absent key = current default
   *  (NOOP success for prop closures; GalleryWriteGuard 403 for writes). */
  actionOutcomes?: ScenarioActionOutcomes;
};
