import { canonicalize } from "@/lib/email/canonicalize";
import type {
  CrewMemberRow,
  DateRestriction,
  RoleFlag,
  StageRestriction,
} from "@/lib/parser/types";
import type { PreviousCrewMember } from "@/lib/sync/applyParseResult";
import type { OverrideSideEffect } from "@/lib/sync/overrideShowHotel";

// §3.6 — the AUTHORITATIVE id-keyed parsed-identity crew reconciliation. PURE: it produces an
// ordered four-phase `CrewWritePlan` (the tx port executes it) plus the crew `admin_overrides`
// side-effects (sheet_value refresh / deactivation) that Stage B commits. Runs POST-HOLD inside
// `applyParseResult` (never in Stage A, which is pure show/hotel and hold-unaware). It replaces the
// legacy name-keyed `deleteCrewMembersNotIn`/`upsertCrewMembers` pair WHENEVER a crew override is
// active for the show; identity is tracked by the PARSED name and every rename is an id-keyed write,
// so an existing person's `crew_members.id` is never deleted, reinserted, or reassigned (R11).

/** An active `crew`-domain `admin_overrides` row (name or role) this reconciliation consumes. */
export type ActiveCrewOverride = {
  id: string;
  field: "name" | "role";
  /** The PARSED crew name (§5.2); a name override's output is `override_value`. */
  match_key: string;
  /** jsonb → a JS string (the name output or the role value). */
  override_value: unknown;
};

/**
 * The full mutable `crew_members` payload the id-keyed write carries (R29 — every column the legacy
 * upsert wrote, only `name`/`role` overridden, `email` canonicalized) plus the §4.4 `sheet_name`
 * visibility alias. `id`/`claimed_via_oauth_at`/`selections_reset_at`/`last_changed_at` are NOT here:
 * the id-keyed UPDATE never touches them (preserved from the live row / DB trigger), and an INSERT
 * lets the DB default them.
 */
export type FullCrewRow = {
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  role_flags: RoleFlag[];
  date_restriction: DateRestriction;
  stage_restriction: StageRestriction;
  flight_info: string | null;
  sheet_name: string | null;
};

/**
 * The ORDERED four-phase write set (R24). The executor MUST apply these in field order —
 * deletes → parks → inserts → finals — or it transiently violates `unique(show_id, name)`.
 */
export type CrewWritePlan = {
  /** genuine-removal `crew_members.id`s (frees the names they hold) — phase 1. */
  deletes: string[];
  /** surviving rows whose display name CHANGES this sync, parked at a sentinel — phase 2. */
  parks: { id: string }[];
  /** next-only (new) members; `sheet_name` is ALWAYS null (SYNC-5) — phase 3. */
  inserts: FullCrewRow[];
  /** every survivor's final id-keyed UPDATE (parked + name-unchanged alike) — phase 4. */
  finals: { id: string; row: FullCrewRow; sheetName: string | null }[];
};

export type ReconcileCrewOverridesArgs = {
  showId: string;
  /** the POST-HOLD raw write list (`planHoldAwareApply` output) — parsed names. */
  postHoldCrew: CrewMemberRow[];
  /** removal-suppressed held members (no parsed row) — retain-no-write (SYNC-4). */
  heldRetained: CrewMemberRow[];
  protectedNames: Set<string>;
  heldNames: Set<string>;
  previousCrewMembers: PreviousCrewMember[];
  activeCrewOverrides: ActiveCrewOverride[];
};

export type ReconcileCrewOverridesResult = {
  writes: CrewWritePlan;
  crewSideEffects: OverrideSideEffect[];
  /** final display name → its `sheet_name` (parsed name when a name override is active, else null). */
  sheetNameByFinal: Map<string, string | null>;
  /**
   * The post-hold crew list under the names/roles actually written (displayName / finalRole).
   * Symmetric with the LIVE `previousCrewMembers` the auto-apply change-log diffs against, so a
   * stable display-rename override is neither an add nor a remove (spec §3.6 line 150 / R3 G3).
   */
  appliedCrew: CrewMemberRow[];
};

type Desired = {
  parsedName: string;
  parsedRow: CrewMemberRow;
  /** active name override on this parsed identity; nulled when deactivated by a collision (step 1). */
  nameOverride: ActiveCrewOverride | null;
  roleOverride: ActiveCrewOverride | null;
  displayName: string;
  finalRole: string;
};

export function reconcileCrewOverrides(
  args: ReconcileCrewOverridesArgs,
): ReconcileCrewOverridesResult {
  const {
    postHoldCrew,
    heldRetained,
    protectedNames,
    heldNames,
    previousCrewMembers,
    activeCrewOverrides,
  } = args;

  // --- Partition the active crew overrides by field, keyed by parsed name (match_key). ---
  const nameOverrideByKey = new Map<string, ActiveCrewOverride>();
  const roleOverrideByKey = new Map<string, ActiveCrewOverride>();
  // A name override's OUTPUT → the override, used to recover a live row's parsed identity. The RPC
  // immediate-applies every name op to the live row (name = current output, §7.6), so a live/prev
  // row displaying an active override's output has that override's match_key as its parsed identity.
  const nameOverrideByOutput = new Map<string, ActiveCrewOverride>();
  for (const o of activeCrewOverrides) {
    if (o.field === "name") {
      nameOverrideByKey.set(o.match_key, o);
      nameOverrideByOutput.set(String(o.override_value), o);
    } else {
      roleOverrideByKey.set(o.match_key, o);
    }
  }

  // --- (1) prevByParsedIdentity: parsed name → {id, current live name}. ---
  const prevByParsedIdentity = new Map<string, { id: string; name: string }>();
  for (const p of previousCrewMembers) {
    const nameOv = nameOverrideByOutput.get(p.name);
    const parsedIdentity = nameOv ? nameOv.match_key : p.name;
    prevByParsedIdentity.set(parsedIdentity, { id: p.id, name: p.name });
  }

  // --- (2) desired next state: one entry per POST-HOLD member (NOT held-retained — SYNC-4). ---
  const desired: Desired[] = postHoldCrew.map((m) => {
    const nameOv = nameOverrideByKey.get(m.name) ?? null;
    const roleOv = roleOverrideByKey.get(m.name) ?? null;
    return {
      parsedName: m.name,
      parsedRow: m,
      nameOverride: nameOv,
      roleOverride: roleOv,
      displayName: nameOv ? String(nameOv.override_value) : m.name,
      finalRole: roleOv ? String(roleOv.override_value) : m.role,
    };
  });

  // --- (3) collision resolution (step 1): the OVERRIDE-derived output loses; if a whole colliding
  // group is override-derived (SYNC-6), ALL of them lose. Re-check until stable (bounded). ---
  const deactivatedNameConflict = new Set<string>();
  let changed = true;
  let guard = 0;
  while (changed && guard <= desired.length + 1) {
    changed = false;
    guard += 1;
    const byDisplay = new Map<string, Desired[]>();
    for (const d of desired) {
      const arr = byDisplay.get(d.displayName);
      if (arr) arr.push(d);
      else byDisplay.set(d.displayName, [d]);
    }
    for (const group of byDisplay.values()) {
      if (group.length < 2) continue;
      // The losers are every override-derived member in the group: when ≥1 non-override member
      // shares the name, the override(s) lose; when the whole group is override-derived (SYNC-6),
      // all lose and each falls back to its own (distinct) parsed name.
      const losers = group.filter((d) => d.nameOverride !== null);
      for (const loser of losers) {
        if (!loser.nameOverride) continue;
        deactivatedNameConflict.add(loser.nameOverride.id);
        loser.displayName = loser.parsedName; // fall back to own parsed name
        loser.nameOverride = null;
        changed = true;
      }
    }
  }

  // --- Build the retain set (held/protected parsed identities are never deleted/deactivated). ---
  const retainSet = new Set<string>();
  for (const n of protectedNames) retainSet.add(n);
  for (const n of heldNames) retainSet.add(n);
  for (const h of heldRetained) {
    const nameOv = nameOverrideByOutput.get(h.name);
    retainSet.add(nameOv ? nameOv.match_key : h.name);
  }

  const nextByParsedName = new Map<string, Desired>();
  for (const d of desired) nextByParsedName.set(d.parsedName, d);

  // --- (4) match & classify by id + (5) build the four-phase write plan. ---
  const deletes: string[] = [];
  const parks: { id: string }[] = [];
  const inserts: FullCrewRow[] = [];
  const finals: { id: string; row: FullCrewRow; sheetName: string | null }[] = [];
  const sheetNameByFinal = new Map<string, string | null>();

  for (const d of desired) {
    const prev = prevByParsedIdentity.get(d.parsedName);
    if (prev) {
      // parsedName in prev AND next → UPDATE by id (rename in place). sheet_name = match_key when a
      // name override is (still) active on this member, else null (§4.4).
      const sheetName = d.nameOverride ? d.nameOverride.match_key : null;
      const row: FullCrewRow = {
        name: d.displayName,
        email: canonicalize(d.parsedRow.email),
        phone: d.parsedRow.phone,
        role: d.finalRole,
        role_flags: d.parsedRow.role_flags,
        date_restriction: d.parsedRow.date_restriction,
        stage_restriction: d.parsedRow.stage_restriction,
        flight_info: d.parsedRow.flight_info,
        sheet_name: sheetName,
      };
      if (d.displayName !== prev.name) parks.push({ id: prev.id });
      finals.push({ id: prev.id, row, sheetName });
      sheetNameByFinal.set(d.displayName, sheetName);
    } else {
      // parsedName in next only → INSERT (new id). A next-only member is newly parsed and carries no
      // active name override (the RPC immediate-apply invariant means an active override always has a
      // live/prev row); it lands under its raw parsed name with sheet_name = NULL (SYNC-5).
      inserts.push({
        name: d.parsedName,
        email: canonicalize(d.parsedRow.email),
        phone: d.parsedRow.phone,
        role: d.parsedRow.role,
        role_flags: d.parsedRow.role_flags,
        date_restriction: d.parsedRow.date_restriction,
        stage_restriction: d.parsedRow.stage_restriction,
        flight_info: d.parsedRow.flight_info,
        sheet_name: null,
      });
      sheetNameByFinal.set(d.parsedName, null);
    }
  }

  // parsedName in prev only: retain (held/protected — no write) OR genuine removal (DELETE by id).
  for (const [parsedIdentity, prev] of prevByParsedIdentity) {
    if (nextByParsedName.has(parsedIdentity)) continue;
    if (retainSet.has(parsedIdentity)) continue; // R10 removal-hold: retain, override stays active
    deletes.push(prev.id);
  }

  // --- crew side-effects: name_conflict (collision) + sheet_value refresh / target_missing. ---
  const crewSideEffects: OverrideSideEffect[] = [];
  for (const id of deactivatedNameConflict) {
    crewSideEffects.push({ overrideId: id, deactivate: "name_conflict" });
  }
  for (const o of activeCrewOverrides) {
    if (o.field === "name" && deactivatedNameConflict.has(o.id)) continue; // already name_conflict
    const parsedIdentity = o.match_key;
    const survivor = nextByParsedName.get(parsedIdentity);
    const inPrev = prevByParsedIdentity.has(parsedIdentity);
    if (survivor && inPrev) {
      // Applied → refresh sheet_value with the pre-override parsed value (§5.2): the parsed name for
      // a name override (= match_key), the parsed role for a role override.
      const sheetValue = o.field === "name" ? parsedIdentity : survivor.parsedRow.role;
      crewSideEffects.push({ overrideId: o.id, sheetValue });
    } else if (inPrev && retainSet.has(parsedIdentity)) {
      // Held-retained → the override stays active untouched (no side-effect).
      continue;
    } else {
      // Genuine removal OR an orphaned target (R23 fail-closed — never silent re-key): deactivate
      // every override row for that member (name AND sibling role share the match_key — §5.2).
      crewSideEffects.push({ overrideId: o.id, deactivate: "target_missing" });
    }
  }

  // The FINAL applied crew list — each post-hold member under the name/role it was
  // actually written with (displayName / finalRole after collision resolution). This is
  // what now lives in crew_members, so the auto-apply change-log must diff against THIS
  // (not the raw parse): with a stable `Jon→John` override the applied name is "John",
  // matching the previous live row "John" — a pure display rename is then neither an add
  // nor a remove (spec §3.6 line 150 / R2 finding G3). Membership is identical to the raw
  // post-hold list (held-retained excluded, SYNC-4), so held/removal behavior is unchanged.
  const appliedCrew = desired.map((d) => ({
    ...d.parsedRow,
    name: d.displayName,
    role: d.finalRole,
  }));

  return {
    writes: { deletes, parks, inserts, finals },
    crewSideEffects,
    sheetNameByFinal,
    appliedCrew,
  };
}
