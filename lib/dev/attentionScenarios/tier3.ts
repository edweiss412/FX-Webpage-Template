// Tier-3 composites (spec §4.3, §5.0): whole realistic show states, and the ONLY
// materializable tier.
//
// Tiers 1 and 2 are gallery-only because their distinguishing inputs cannot
// exist as database state - `bucket` predicates are functions, `degraded` is a
// loader fault, and PICKER_EPOCH_RESET is cut in derive so a materialized row
// would render nothing and read as a bug.
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
          context: { crew_member_id: "3f8c1e2a-5b6d-4c7e-8f90-1a2b3c4d5e6f" },
          raised_at: AT,
          occurrence_count: 1,
          // Gallery-only. Materialize resolves the real identity from the target
          // show's crew rows instead, which is the one inherent divergence (§3.3).
          galleryIdentity: {
            segments: [{ label: "Crew", value: "Dana Reed" }],
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
          entity_key: "sam-ito",
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
        // two genuinely self-healing codes -> the Monitoring summary reads "2".
        { code: "SYNC_STALLED", context: {}, raised_at: AT, occurrence_count: 3 },
        { code: "DRIVE_FETCH_FAILED", context: {}, raised_at: AT, occurrence_count: 1 },
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
