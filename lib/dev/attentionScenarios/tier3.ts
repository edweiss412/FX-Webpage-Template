// Tier-3 composites (spec §4.3, §5.0): whole realistic show states, and the ONLY
// materializable tier.
//
// Tiers 1 and 2 are gallery-only because their distinguishing inputs cannot
// exist as database state - `bucket` predicates are functions, `degraded` is a
// loader fault, and PICKER_EPOCH_RESET is cut in derive so a materialized row
// would render nothing and read as a bug.
import {
  withDefaultContext,
  DEFAULT_SHARED_EMAIL,
} from "@/lib/dev/attentionScenarios/defaultContext";
import type { AttentionScenario } from "./types";
import type { AlertIdentity } from "@/lib/adminAlerts/identityTypes";
import { buildWarning } from "./tier1";

const AT = "2026-07-01T12:00:00.000Z";

export const T3_SHEET_MISSING = "t3-sheet-missing-mid-parse";
export const T3_CREW_COLLISION = "t3-crew-collision-with-warnings";
export const T3_HOLD_AND_DRIFT = "t3-hold-pending-with-asset-drift";
export const T3_FULL_SPLIT = "t3-full-attention-split";

/** The canonical composite list. The index test asserts set-equality against it. */
export const T3_IDS: readonly string[] = [
  T3_SHEET_MISSING,
  T3_CREW_COLLISION,
  T3_HOLD_AND_DRIFT,
  T3_FULL_SPLIT,
];

export function tier3Scenarios(): AttentionScenario[] {
  return [
    {
      id: T3_SHEET_MISSING,
      tier: 3,
      label: "Sheet went missing mid-parse",
      alerts: [
        { code: "SHEET_UNAVAILABLE", context: {}, raised_at: AT, occurrence_count: 2 },
        {
          code: "PARSE_ERROR_LAST_GOOD",
          // Verified against PARSE_FAILURE_ALLOWLIST; readErrorCode drops
          // anything outside it, which would silently blank the reason line.
          context: { error_code: "MI-5_NO_ROOMS" },
          raised_at: AT,
          occurrence_count: 1,
        },
      ],
      holds: [],
      // warnings deliberately ABSENT: this composite leaves parse_warnings alone,
      // exercising the tri-state absent branch (§3.4).
    },
    {
      id: T3_CREW_COLLISION,
      tier: 3,
      label: "Crew email collision alongside parse warnings",
      alerts: [
        {
          code: "AMBIGUOUS_EMAIL_BINDING",
          context: withDefaultContext("AMBIGUOUS_EMAIL_BINDING", undefined),
          raised_at: AT,
          occurrence_count: 1,
          // Gallery-only. Materialize resolves the real identity from the target
          // show's crew rows instead, which is the one inherent divergence (§3.3).
          // The SHAPE still mirrors production: this code renders
          // Show · email · "N crew rows" and carries no crewName segment
          // (lib/adminAlerts/alertIdentityMap.ts:60-66), so the previous
          // Crew-only form demoed a card the resolver cannot produce.
          galleryIdentity: {
            segments: [
              { label: "Show", value: "Gallery Preview Show" },
              { label: null, value: DEFAULT_SHARED_EMAIL },
              { label: null, value: "2 crew rows" },
            ],
          } as unknown as AlertIdentity,
        },
      ],
      holds: [],
      warnings: [
        buildWarning("BLOCK_DISAPPEARED"),
        buildWarning("TYPO_NORMALIZED"),
        buildWarning("DAY_RESTRICTION_DOUBLE_LOCATION"),
      ],
    },
    {
      id: T3_HOLD_AND_DRIFT,
      tier: 3,
      label: "Pending identity hold alongside a drifted asset",
      alerts: [{ code: "EMBEDDED_ASSET_DRIFTED", context: {}, raised_at: AT, occurrence_count: 1 }],
      holds: [
        {
          drive_file_id: "gallery-fixture-file",
          domain: "crew_email",
          entity_key: "Sam Ito",
          held_value: { email: "sam.old@example.test", name: "Sam Ito" },
          proposed_value: {
            disposition: "email_change",
            name: "Sam Ito",
            email: "sam.new@example.test",
          },
          base_modified_time: AT,
          kind: "mi11_pending",
        },
      ],
      // Declares an EMPTY warnings array rather than omitting it: this composite
      // deliberately materializes zero warnings, which is a distinct state from
      // "does not control warnings" (§3.4).
      warnings: [],
    },
    {
      id: T3_FULL_SPLIT,
      tier: 3,
      label: "Everything at once: confirm, review, and monitoring",
      alerts: [
        {
          // needs-look WITH an external link: openSheet resolves the sheet id
          // from context.drive_file_id (the gallery passes no show-level id,
          // so this exercises the fallback in a rendered surface).
          code: "SHEET_UNAVAILABLE",
          context: { drive_file_id: "gallery-fixture-file" },
          raised_at: AT,
          occurrence_count: 1,
        },
        // needs-look with the internal Overview anchor.
        { code: "RESYNC_QUALITY_REGRESSED", context: {}, raised_at: AT, occurrence_count: 1 },
        // ONE self-healing code, because only one is per-show reachable:
        // SELF_HEALING_CODE_LIST has three members (lib/adminAlerts/audience.ts)
        // and two of them are global-scope, so a real show's Monitoring group
        // can never hold more than one distinct code. The former "2 monitoring"
        // pill was a state production cannot produce.
        //
        // The context comes from the default table so the surviving card renders
        // its real sheet name rather than placeholder copy.
        {
          code: "DRIVE_FETCH_FAILED",
          context: withDefaultContext("DRIVE_FETCH_FAILED", undefined),
          raised_at: AT,
          occurrence_count: 1,
        },
      ],
      holds: [
        {
          drive_file_id: "gallery-fixture-file",
          domain: "crew_email",
          entity_key: "ren-park",
          held_value: { email: "ren.old@example.test", name: "Ren Park" },
          proposed_value: {
            disposition: "email_change",
            name: "Ren Park",
            email: "ren.new@example.test",
          },
          base_modified_time: AT,
          kind: "mi11_pending",
        },
      ],
      // warnings deliberately ABSENT (tri-state "do not touch", like T3_SHEET_MISSING).
    },
  ];
}
