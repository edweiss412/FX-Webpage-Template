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
};
