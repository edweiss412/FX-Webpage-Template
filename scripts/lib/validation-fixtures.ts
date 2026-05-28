// scripts/lib/validation-fixtures.ts — M12 Phase 0.C Task 0.C.3.
//
// Canonical fixture mapping per master spec §3.3 + §3.3.1. Materializes
// 16 combos × 9 (R) or 1 (SW) crew_members = 96 alias_map leaves total.
// Per spec §3.3 R-combo + SW-state tables; predictable identities so check-
// seed predicates resolve deterministically.
//
// R13 commit 30 + R15 commit 35 amendment — combo R1's alias_5a_lead.email
// reads from process.env.VALIDATION_J3_CLAIM_EMAIL (canonicalized via
// lib/email/canonicalize.ts per AGENTS.md invariant 3). The fixture-build
// aborts if the env var is unset OR matches the canonical rejected set
// (RFC 2606 + RFC 6761 + mDNS RFC 6762 + project-conventional). Google
// OAuth cannot authenticate against any of these domains — the J3 walk
// would be unwalkable.
import { canonicalize } from "@/lib/email/canonicalize";
import type {
  DateRestriction,
  StageRestriction,
  WorkPhase,
} from "@/lib/parser/types";

// =============================================================================
// Canonical enums per spec §3.3 + §3.3.1.
// =============================================================================

export const R_COMBOS = [
  "R1",
  "R2",
  "R3",
  "R4",
  "R5",
  "R6",
  "R7a",
  "R7b",
  "R8a",
  "R8b",
] as const;
export type RCombo = (typeof R_COMBOS)[number];

export const SW_COMBOS = [
  "SW-PRE_TRAVEL",
  "SW-TRAVEL_IN",
  "SW-SHOW_1",
  "SW-SHOW_INTERIOR",
  "SW-SHOW_LAST",
  "SW-POST_SHOW",
] as const;
export type SWCombo = (typeof SW_COMBOS)[number];

export type Combo = RCombo | SWCombo;

// 9 role-variant aliases per spec §3.2. Each R-combo seeds 9 crew_members,
// one per alias. SW-states seed only alias_5a_lead.
export const ROLE_VARIANT_ALIASES = [
  { alias: "alias_5a_lead", roleFlags: ["LEAD"] },
  { alias: "alias_5b_lead_a1", roleFlags: ["LEAD", "A1"] },
  { alias: "alias_5c_bo_lead", roleFlags: ["BO", "LEAD"] },
  { alias: "alias_6a_a1", roleFlags: ["A1"] },
  { alias: "alias_6b_v1", roleFlags: ["V1"] },
  { alias: "alias_6c_l1", roleFlags: ["L1"] },
  { alias: "alias_6d_bo", roleFlags: ["BO"] },
  { alias: "alias_6e_a1_l1", roleFlags: ["A1", "L1"] },
  { alias: "alias_6f_empty", roleFlags: [] },
] as const;

// =============================================================================
// J3-claim-email guard — R13 commit 30 + R15 commit 35.
// =============================================================================
// Canonical rejected-domain set (single source of truth, mirrored by check-
// seed predicate (k) + mint RPC defense-in-depth at plan 03 Task 0.C.4).
// RFC 2606 + RFC 6761 + mDNS RFC 6762 + project-conventional dev.
const REJECTED_DOMAIN_RX =
  /@(example\.com|example\.org|example\.net|[^@\s]+\.test|[^@\s]+\.invalid|localhost|[^@\s]+\.localhost|[^@\s]+\.local|dev\.local)$/i;

function resolveR1ClaimEmail(): string {
  const raw = process.env.VALIDATION_J3_CLAIM_EMAIL;
  if (!raw || REJECTED_DOMAIN_RX.test(raw)) {
    throw new Error(
      "VALIDATION_J3_CLAIM_EMAIL must be set to your real Google account email — " +
        "Google OAuth cannot authenticate against placeholder/dev-only reserved domains " +
        "(example.com/.org/.net per RFC 2606; *.test/*.invalid/*.localhost/localhost per RFC 6761; " +
        "*.local/dev.local per mDNS RFC 6762 + project-conventional). " +
        "See spec §3.3 step 5 R13-amendment paragraph + .env.local.example. " +
        `Got: ${raw ?? "<unset>"}`,
    );
  }
  const canonical = canonicalize(raw);
  if (canonical === null) {
    throw new Error(
      "VALIDATION_J3_CLAIM_EMAIL canonicalized to null — value is whitespace-only or empty",
    );
  }
  return canonical;
}

// =============================================================================
// Fixture types.
// =============================================================================

// Re-export the canonical parser/runtime types so fixture consumers
// (selectRightNowState, check-seed predicate (o), Phase 1 walk scripts)
// type-check against the same shape. R17-F1 fix.
export type { DateRestriction, StageRestriction };

export type FixtureDates = {
  travelIn: string | null;
  set: string | null;
  showDays: string[];
  travelOut: string | null;
};

export type FixtureCrewMember = {
  alias: string;
  name: string;
  email: string;
  roleFlags: string[];
};

// Codex Phase 0.C R8-F2 — minimal non-empty pull_sheet pinned on every
// validation show so PackListTile renders for pack-list-visible combos
// (R2/R3/R7a/R8a per spec §3.3). PackListTile returns null when
// pull_sheet is null OR empty. Mirrored in the mint RPC's INSERT body;
// predicate (o.pull_sheet) compares against this constant.
export const VALIDATION_PULL_SHEET = [
  {
    caseLabel: "Validation Case 1",
    items: [
      { qty: 1, cat: "Mic", subCat: "Wireless", item: "Validation Mic" },
    ],
  },
] as const;

export type FixtureRow = {
  combo: Combo;
  showName: string;
  drive_file_id: string;
  slug: string;
  dateRestriction: DateRestriction;
  stageRestriction: StageRestriction;
  dates: FixtureDates;
  expectedTodayState: string;
  crewMembers: FixtureCrewMember[];
};

// =============================================================================
// Date helpers.
// =============================================================================

function isoOffset(today: string, deltaDays: number): string {
  // Parse ISO YYYY-MM-DD as UTC midnight + add delta days. This is TZ-stable
  // (always UTC) so cross-day offsets don't drift across the script's timezone.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    throw new Error(`isoOffset: today must be ISO YYYY-MM-DD, got ${today}`);
  }
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

// =============================================================================
// Per-combo restriction + dates shape per spec §3.3 table.
// =============================================================================

function buildRCombo(combo: RCombo, today: string): {
  dateRestriction: DateRestriction;
  stageRestriction: StageRestriction;
  dates: FixtureDates;
  expectedTodayState: string;
} {
  const yesterday = isoOffset(today, -1);
  const tomorrow = isoOffset(today, 1);
  switch (combo) {
    case "R1":
      // Default — no restrictions, today=set day.
      return {
        dateRestriction: { kind: "none" },
        stageRestriction: { kind: "none" },
        dates: {
          travelIn: yesterday,
          set: today,
          showDays: [today, tomorrow],
          travelOut: isoOffset(today, 2),
        },
        expectedTodayState: "viewer_assigned_today",
      };
    case "R2":
      // Explicit date_restriction including today.
      return {
        dateRestriction: { kind: "explicit", days: [today, tomorrow] },
        stageRestriction: { kind: "none" },
        dates: {
          travelIn: yesterday,
          set: today,
          showDays: [today, tomorrow],
          travelOut: isoOffset(today, 2),
        },
        expectedTodayState: "viewer_assigned_today",
      };
    case "R3":
      // Explicit date_restriction excluding today (off-day).
      return {
        dateRestriction: { kind: "explicit", days: [yesterday, tomorrow] },
        stageRestriction: { kind: "none" },
        dates: {
          travelIn: isoOffset(today, -2),
          set: yesterday,
          showDays: [yesterday, tomorrow],
          travelOut: isoOffset(today, 2),
        },
        expectedTodayState: "viewer_off_day",
      };
    case "R4":
      // unknown_asterisk — viewer_unconfirmed regardless of show-wide state.
      return {
        dateRestriction: { kind: "unknown_asterisk", days: null },
        stageRestriction: { kind: "none" },
        dates: {
          travelIn: yesterday,
          set: today,
          showDays: [today, tomorrow],
          travelOut: isoOffset(today, 2),
        },
        expectedTodayState: "viewer_unconfirmed",
      };
    case "R5":
      // Today before first assigned day (pre-show).
      return {
        dateRestriction: {
          kind: "explicit",
          days: [isoOffset(today, 3), isoOffset(today, 4)],
        },
        stageRestriction: { kind: "none" },
        dates: {
          travelIn: isoOffset(today, 2),
          set: isoOffset(today, 3),
          showDays: [isoOffset(today, 3), isoOffset(today, 4)],
          travelOut: isoOffset(today, 5),
        },
        expectedTodayState: "viewer_off_day_pre",
      };
    case "R6":
      // Today after last assigned day (post-show).
      return {
        dateRestriction: {
          kind: "explicit",
          days: [isoOffset(today, -4), isoOffset(today, -3)],
        },
        stageRestriction: { kind: "none" },
        dates: {
          travelIn: isoOffset(today, -5),
          set: isoOffset(today, -4),
          showDays: [isoOffset(today, -4), isoOffset(today, -3)],
          travelOut: isoOffset(today, -2),
        },
        expectedTodayState: "viewer_after_last_day",
      };
    case "R7a":
      // No date restriction; stage=Load In/Set; today=set day.
      return {
        dateRestriction: { kind: "none" },
        stageRestriction: { kind: "explicit", stages: ["Load In", "Set"] },
        dates: {
          travelIn: yesterday,
          set: today,
          showDays: [today, tomorrow],
          travelOut: isoOffset(today, 2),
        },
        expectedTodayState: "viewer_assigned_today",
      };
    case "R7b":
      // No date restriction; stage=Load In/Set; today=strike day.
      // Codex Phase 0.C R8-F1 — Strike is the LAST showDays entry; the
      // travelOut day is Load Out, not Strike. So today must be on
      // showDays[last], not travelOut.
      return {
        dateRestriction: { kind: "none" },
        stageRestriction: { kind: "explicit", stages: ["Load In", "Set"] },
        dates: {
          travelIn: isoOffset(today, -3),
          set: isoOffset(today, -2),
          showDays: [isoOffset(today, -2), isoOffset(today, -1), today],
          travelOut: isoOffset(today, 1),
        },
        expectedTodayState: "viewer_assigned_today",
      };
    case "R8a":
      // No date restriction; stage=Load Out/Strike; today=strike day.
      // R8-F1 — same Strike-day pinning as R7b above.
      return {
        dateRestriction: { kind: "none" },
        stageRestriction: {
          kind: "explicit",
          stages: ["Load Out", "Strike"],
        },
        dates: {
          travelIn: isoOffset(today, -3),
          set: isoOffset(today, -2),
          showDays: [isoOffset(today, -2), isoOffset(today, -1), today],
          travelOut: isoOffset(today, 1),
        },
        expectedTodayState: "viewer_assigned_today",
      };
    case "R8b":
      // No date restriction; stage=Load Out/Strike; today=set day.
      return {
        dateRestriction: { kind: "none" },
        stageRestriction: {
          kind: "explicit",
          stages: ["Load Out", "Strike"],
        },
        dates: {
          travelIn: yesterday,
          set: today,
          showDays: [today, tomorrow],
          travelOut: isoOffset(today, 2),
        },
        expectedTodayState: "viewer_assigned_today",
      };
  }
}

function buildSWCombo(combo: SWCombo, today: string): {
  dateRestriction: DateRestriction;
  stageRestriction: StageRestriction;
  dates: FixtureDates;
  expectedTodayState: string;
} {
  // SW combos exercise show-wide state transitions. The dates anchor today
  // at the targeted show-wide phase; date_restriction + stage_restriction
  // stay at `none` so the LEAD baseline carries through.
  switch (combo) {
    case "SW-PRE_TRAVEL":
      return {
        dateRestriction: { kind: "none" },
        stageRestriction: { kind: "none" },
        dates: {
          travelIn: isoOffset(today, 3),
          set: isoOffset(today, 4),
          showDays: [isoOffset(today, 4), isoOffset(today, 5)],
          travelOut: isoOffset(today, 6),
        },
        expectedTodayState: "show_pre_travel",
      };
    case "SW-TRAVEL_IN":
      return {
        dateRestriction: { kind: "none" },
        stageRestriction: { kind: "none" },
        dates: {
          travelIn: today,
          set: isoOffset(today, 1),
          showDays: [isoOffset(today, 1), isoOffset(today, 2)],
          travelOut: isoOffset(today, 3),
        },
        expectedTodayState: "show_travel_in",
      };
    case "SW-SHOW_1":
      // Codex Phase 0.C R13-F1 — set day MUST be before today so the
      // runtime selector's `set_day` branch (lib/time/rightNow.ts:334-348,
      // evaluated BEFORE `show_day_n`) doesn't claim today. Pre-R13 the
      // fixture set `set = today AND showDays[0] = today`, so the
      // runtime returned set_day and never reached show_day_1 —
      // check-seed reported green while the show_day_1 walk branch
      // was unreachable.
      return {
        dateRestriction: { kind: "none" },
        stageRestriction: { kind: "none" },
        dates: {
          travelIn: isoOffset(today, -2),
          set: isoOffset(today, -1),
          showDays: [today, isoOffset(today, 1), isoOffset(today, 2)],
          travelOut: isoOffset(today, 3),
        },
        expectedTodayState: "show_day_1",
      };
    case "SW-SHOW_INTERIOR":
      return {
        dateRestriction: { kind: "none" },
        stageRestriction: { kind: "none" },
        dates: {
          travelIn: isoOffset(today, -2),
          set: isoOffset(today, -1),
          showDays: [
            isoOffset(today, -1),
            today,
            isoOffset(today, 1),
          ],
          travelOut: isoOffset(today, 2),
        },
        expectedTodayState: "show_day_interior",
      };
    case "SW-SHOW_LAST":
      return {
        dateRestriction: { kind: "none" },
        stageRestriction: { kind: "none" },
        dates: {
          travelIn: isoOffset(today, -3),
          set: isoOffset(today, -2),
          showDays: [isoOffset(today, -2), isoOffset(today, -1), today],
          travelOut: isoOffset(today, 1),
        },
        expectedTodayState: "show_day_last",
      };
    case "SW-POST_SHOW":
      return {
        dateRestriction: { kind: "none" },
        stageRestriction: { kind: "none" },
        dates: {
          travelIn: isoOffset(today, -5),
          set: isoOffset(today, -4),
          showDays: [isoOffset(today, -4), isoOffset(today, -3)],
          travelOut: isoOffset(today, -2),
        },
        expectedTodayState: "show_post_show",
      };
  }
}

// =============================================================================
// Public API.
// =============================================================================

/**
 * Build the canonical FIXTURES array for the given UTC-pinned today.
 *
 * Aborts if VALIDATION_J3_CLAIM_EMAIL is unset OR matches the canonical
 * rejected-domain set (R13 commit 30 + R15 commit 35 amendment). The dev's
 * real Google account email lands as combo R1's alias_5a_lead.email
 * (canonicalized via lib/email/canonicalize.ts per AGENTS.md invariant 3).
 *
 * @param today  UTC ISO date (YYYY-MM-DD). Use
 *               `new Date().toISOString().slice(0, 10)` for the canonical
 *               script value.
 */
export function buildFixtures(today: string): FixtureRow[] {
  const r1ClaimEmail = resolveR1ClaimEmail();
  const out: FixtureRow[] = [];

  for (const combo of R_COMBOS) {
    const { dateRestriction, stageRestriction, dates, expectedTodayState } =
      buildRCombo(combo, today);
    out.push({
      combo,
      showName: `M12 Validation — ${combo}`,
      drive_file_id: `validation_${combo}`,
      slug: `validation-${combo.toLowerCase().replace(/_/g, "-")}`,
      dateRestriction,
      stageRestriction,
      dates,
      expectedTodayState,
      crewMembers: ROLE_VARIANT_ALIASES.map(({ alias, roleFlags }) => {
        // R1.alias_5a_lead is the J3-claim email exception (canonicalized).
        // Every other alias uses the synthesized example.com format.
        const email =
          combo === "R1" && alias === "alias_5a_lead"
            ? r1ClaimEmail
            : synthesizeEmail(combo, alias);
        return {
          alias,
          name: `${combo}_${alias}`,
          email,
          roleFlags: [...roleFlags],
        };
      }),
    });
  }

  for (const combo of SW_COMBOS) {
    const { dateRestriction, stageRestriction, dates, expectedTodayState } =
      buildSWCombo(combo, today);
    out.push({
      combo,
      showName: `M12 Validation — ${combo}`,
      drive_file_id: `validation_${combo}`,
      // SW slugs preserve the SW- prefix for traceability while lowercasing
      // the suffix half. Underscores → dashes for URL-friendliness.
      slug: `validation-${combo.toLowerCase().replace(/_/g, "-")}`,
      dateRestriction,
      stageRestriction,
      dates,
      expectedTodayState,
      crewMembers: [
        {
          alias: "alias_5a_lead",
          name: `${combo}_alias_5a_lead`,
          email: synthesizeEmail(combo, "alias_5a_lead"),
          roleFlags: ["LEAD"],
        },
      ],
    });
  }

  return out;
}

function synthesizeEmail(combo: Combo, alias: string): string {
  // Lowercase + replace _ with - per .env.local.example convention; preserve
  // SW- prefix (canonical separator). Plus-alias keeps lower(trim()) canonical.
  const suffix = `${combo}-${alias.replace(/^alias_/, "")}`
    .toLowerCase()
    .replace(/_/g, "-");
  const synthesized = `validation+${suffix}@example.com`;
  const canonical = canonicalize(synthesized);
  if (canonical === null) {
    throw new Error(
      `Synthesized email for ${combo}.${alias} canonicalized to null — bug in synthesizeEmail`,
    );
  }
  return canonical;
}
