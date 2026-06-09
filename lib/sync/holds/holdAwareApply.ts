import type { CrewMemberRow, ParseResult } from "@/lib/parser/types";
import {
  canonEmail,
  deleteHold,
  setReservationCollisions,
  updateHoldProposedValue,
  type HoldPort,
  type OpenHoldRow,
} from "@/lib/sync/holds/holdPort";

/**
 * Hold-aware apply engine (Tasks 2.4 / 2.5 / 2.6 / 2.7 / 2.8 / 2.8b).
 *
 * Runs inside the locked sync txn. Ordering (PF12 — documented so a later edit can't move
 * release back after apply):
 *   read ALL holds → release-eval PRE-apply (delete released + omit from maps)
 *   → build pin/suppress maps from surviving holds → fold (2.5/2.6) + reservation (2.7)
 *   → produce the transformed crew list + delete-protected names → (caller applies)
 *   → POST-apply mi11_pending re-target/fold only (2.8).
 *
 * The engine returns a PLAN the caller uses to drive the existing snapshot-replace engine
 * (delete-suppression via protected names; identity pin + folds via the transformed crew list;
 * suppressed names removed from the upsert/add sets). Hold mutations (release/re-target/
 * reservation) are applied via the HoldPort as side effects, in the documented order.
 */

export type CrewLike = CrewMemberRow;

export type HoldAwarePlan = {
  /** Crew rows to upsert (identity-pinned for held crew; suppressed rows removed). */
  crewMembers: CrewMemberRow[];
  /** Names that must NOT be deleted even if absent from the parse (delete-suppression). */
  protectedNames: Set<string>;
  /** Names excluded from added/removed auth churn (held crew are neither). */
  heldNames: Set<string>;
};

function canonRow(email: string | null | undefined): string | null {
  return canonEmail(email);
}

/** Synthesize a crew upsert row from a held_value prior-crew snapshot (identity + non-identity). */
function rowFromHeldValue(held: Record<string, unknown>): CrewMemberRow {
  return {
    name: String(held.name ?? ""),
    email: (held.email as string | null) ?? null,
    phone: (held.phone as string | null) ?? null,
    role: String(held.role ?? ""),
    role_flags: (held.role_flags as CrewMemberRow["role_flags"]) ?? [],
    date_restriction: (held.date_restriction as CrewMemberRow["date_restriction"]) ?? {
      kind: "none",
    },
    stage_restriction: (held.stage_restriction as CrewMemberRow["stage_restriction"]) ?? {
      kind: "none",
    },
    flight_info: (held.flight_info as string | null) ?? null,
  };
}

type Baseline =
  | { kind: "removal" }
  | { kind: "rename"; suppressed_added?: { name: string; email: string | null } }
  | { kind: "add"; added?: { name: string; email: string | null } };

function baselineOf(held: Record<string, unknown>): Baseline | null {
  const b = held.baseline as Baseline | undefined;
  return b ?? null;
}

/**
 * Decide whether an `undo_override` hold's release condition is met by the incoming parse.
 * General rule (PF13 / resolution #16): release iff the incoming parse would NO LONGER reproduce
 * the undone change (NOT "differs from held_value").
 */
function undoOverrideReleased(
  hold: OpenHoldRow,
  parseByName: Map<string, CrewMemberRow>,
): boolean {
  const held = hold.held_value;
  if (hold.domain === "crew_email") {
    // Reject (email override): release when the sheet reverted the email to held_value.email.
    const sheet = parseByName.get(hold.entity_key);
    if (!sheet) return false; // crew absent → can't have reverted to the held email
    return canonRow(sheet.email) === canonRow(held.email as string | null);
  }
  // crew_identity
  if ((held as Record<string, unknown>).absent === true) {
    // Tombstone (undone add): release when the sheet stops adding it OR lists a different identity.
    const sheet = parseByName.get(String((held as Record<string, unknown>).name ?? ""));
    if (!sheet) return true; // no longer adding it
    return canonRow(sheet.email) !== canonRow((held as Record<string, unknown>).email as string | null);
  }
  const baseline = baselineOf(held);
  if (baseline?.kind === "removal") {
    // Undo-of-removal: release when the parse CONTAINS entity_key again (removal not reproduced).
    return parseByName.has(hold.entity_key);
  }
  if (baseline?.kind === "rename") {
    // Undo-of-rename: release when entity_key present again OR the suppressed_added entity is
    // gone/changed. Match suppressed_added by name+email (resolution #16): a re-named replacement
    // carrying the same email still reproduces the undone rename, so it must NOT release. Released
    // only when NO sheet row carries the suppressed email (under any name) AND no row carries the
    // suppressed name with that email.
    if (parseByName.has(hold.entity_key)) return true;
    const sa = baseline.suppressed_added;
    if (!sa) return true;
    const saEmail = canonRow(sa.email);
    // still reproducing the rename iff some sheet row matches by email (any name) or by name+email.
    const stillReproduced =
      saEmail != null
        ? [...parseByName.values()].some((m) => canonRow(m.email) === saEmail)
        : (() => {
            const byName = parseByName.get(sa.name);
            return byName != null && canonRow(byName.email) === saEmail;
          })();
    return !stillReproduced;
  }
  return false;
}

/** mi11_pending releases when the sheet reconciles back to held_value (§4.3, Task 2.8). */
function mi11Reconciled(hold: OpenHoldRow, parseByName: Map<string, CrewMemberRow>): boolean {
  const sheet = parseByName.get(hold.entity_key);
  if (!sheet) return false;
  const held = hold.held_value;
  return (
    canonRow(sheet.email) === canonRow(held.email as string | null) &&
    sheet.name === String(held.name ?? "")
  );
}

export type HoldAwareApplyArgs = {
  port: HoldPort;
  showId: string;
  parseResult: ParseResult;
  openHolds: OpenHoldRow[];
  /** The current sheet's modifiedTime — the staleness anchor for re-evaluated proposed_value. */
  baseModifiedTime: string;
  /**
   * Prior live-crew names (P2-F4): reservation may only SUPPRESS an ADDED row colliding with a held
   * proposed identity. A PRE-EXISTING live crew member that owns the reserved email/name must stay
   * live (the conflict is resolved at Approve time by Phase 3's collision graph). Defaults to empty
   * (treat all parse rows as added) when the snapshot is unavailable.
   */
  previousCrewNames?: string[];
};

/**
 * PRE-apply pass: evaluate release conditions, delete released holds, return the survivors +
 * the transformed plan. The caller then drives the snapshot-replace engine with this plan.
 */
export async function planHoldAwareApply(
  args: HoldAwareApplyArgs,
): Promise<{ plan: HoldAwarePlan; survivingHolds: OpenHoldRow[] }> {
  const { port, parseResult, openHolds } = args;
  const parseByName = new Map(parseResult.crewMembers.map((m) => [m.name, m]));
  const parseByEmail = new Map<string, CrewMemberRow>();
  for (const m of parseResult.crewMembers) {
    const e = canonRow(m.email);
    if (e) parseByEmail.set(e, m);
  }

  // ---- PRE-apply release evaluation ----
  const survivingHolds: OpenHoldRow[] = [];
  for (const hold of openHolds) {
    let released = false;
    if (hold.kind === "undo_override") {
      released = undoOverrideReleased(hold, parseByName);
    } else if (hold.kind === "mi11_pending") {
      released = mi11Reconciled(hold, parseByName);
    }
    if (released) {
      await deleteHold(port, hold.id);
    } else {
      survivingHolds.push(hold);
    }
  }

  // ---- build pin/suppress maps from SURVIVING holds ----
  const protectedNames = new Set<string>();
  const heldNames = new Set<string>();
  // pinned identity per entity_key: { name, email } the upsert must force.
  const pinnedIdentity = new Map<string, { name: string; email: string | null }>();
  // names to suppress entirely (drop from upsert + add set).
  const suppressedNames = new Set<string>();
  // emails to suppress (reservation / tombstone collisions) keyed by canonical email.
  const suppressedEmails = new Set<string>();
  // Rows consumed by a rename/removal fold (the held crew's OWN target, NOT a different-entity
  // collision). P2-F1: these must be EXCLUDED from reservation_collisions — a folded row is the
  // hold's own rename target, so recording it would make Phase-3 Approve reject IDENTITY_WOULD_COLLIDE
  // on the valid fold. WM-F1: this is PER-HOLD — a name consumed by hold A's fold is still a valid
  // reservation_collision for a DIFFERENT hold B that proposes the same identity. Keyed by hold.id →
  // set of parse-row names that hold's OWN fold consumed. (A global set let hold A's folded target
  // suppress hold B's collision, stranding B's identity gate.)
  const foldConsumedByHold = new Map<string, Set<string>>();
  // held_value rows to retain/re-insert even if the parse drops them.
  const retainRows = new Map<string, CrewMemberRow>();
  // non-identity field overrides to apply onto a pinned held row (from a folded rename row).
  const nonIdentityOverride = new Map<string, CrewMemberRow>();

  // Per-hold in-place mutations to perform POST-plan (re-target/fold + reservation), collected here.
  type HoldMutation =
    | { kind: "retarget"; holdId: string; proposed: Record<string, unknown>; baseModifiedTime: string }
    | { kind: "reservation"; holdId: string; collisions: Array<{ name: string; email: string | null }> };
  const mutations: HoldMutation[] = [];

  for (const hold of survivingHolds) {
    heldNames.add(hold.entity_key);

    if (hold.kind === "undo_override") {
      applyUndoOverrideToMaps(hold, parseByName, parseByEmail, {
        protectedNames,
        suppressedNames,
        suppressedEmails,
        retainRows,
        pinnedIdentity,
      });
      continue;
    }

    // mi11_pending — pin old identity (email + name).
    const held = hold.held_value;
    pinnedIdentity.set(hold.entity_key, {
      name: String(held.name ?? hold.entity_key),
      email: (held.email as string | null) ?? null,
    });
    protectedNames.add(hold.entity_key);

    // Detect a held-crew rename (F8, Task 2.5): entity_key absent from the parse AND an added row
    // whose canonical email matches the hold's held/proposed email → fold into proposed_value=rename.
    const sheetForEntity = parseByName.get(hold.entity_key);
    const heldEmail = canonRow(held.email as string | null);
    const proposedEmail = canonRow(
      (hold.proposed_value as Record<string, unknown> | null)?.email as string | null,
    );
    if (!sheetForEntity) {
      // Held entity is missing from the parse. Rename fold first, then removal fold (2.6).
      let folded = false;
      // Find an added row matching the held/proposed email (rename of the held crew).
      let renameRow: CrewMemberRow | undefined;
      for (const m of parseResult.crewMembers) {
        if (m.name === hold.entity_key) continue;
        const e = canonRow(m.email);
        if (e && (e === heldEmail || (proposedEmail && e === proposedEmail))) {
          renameRow = m;
          break;
        }
      }
      if (renameRow) {
        // Suppress the added row; fold proposed_value → rename; apply its non-identity onto pinned old row.
        suppressedNames.add(renameRow.name);
        // P2-F1 / WM-F1: record under THIS hold's id — the hold's own target, not a collision.
        // Keyed per-hold so it only excludes from THIS hold's reservation_collisions, never another's.
        let consumed = foldConsumedByHold.get(hold.id);
        if (!consumed) {
          consumed = new Set<string>();
          foldConsumedByHold.set(hold.id, consumed);
        }
        consumed.add(renameRow.name);
        nonIdentityOverride.set(hold.entity_key, renameRow);
        retainRows.set(hold.entity_key, rowFromHeldValue(held));
        mutations.push({
          kind: "retarget",
          holdId: hold.id,
          proposed: {
            disposition: "rename",
            name: renameRow.name,
            email: canonRow(renameRow.email),
          },
          baseModifiedTime: proposedBaseTime(args),
        });
        folded = true;
      }
      if (!folded) {
        // Genuine removal (2.6): keep old row pinned/retained, fold proposed_value → removal.
        retainRows.set(hold.entity_key, rowFromHeldValue(held));
        mutations.push({
          kind: "retarget",
          holdId: hold.id,
          proposed: { disposition: "removal" },
          baseModifiedTime: proposedBaseTime(args),
        });
      }
    } else {
      // Held entity still present — keep email pinned; non-identity follows the sheet (F17).
      // Re-evaluate proposed_value: if the sheet's email changed again, re-target email_change (2.8).
      const sheetEmail = canonRow(sheetForEntity.email);
      if (sheetEmail !== heldEmail && sheetEmail !== proposedEmail) {
        mutations.push({
          kind: "retarget",
          holdId: hold.id,
          proposed: {
            disposition: "email_change",
            name: hold.entity_key,
            email: sheetEmail,
          },
          baseModifiedTime: proposedBaseTime(args),
        });
      }
    }
  }

  // P2-F1: reservations must reserve the EFFECTIVE (post-fold/retarget) proposed identity, not the
  // stale DB proposed_value. Build the effective proposed per hold from this apply's retarget
  // mutations; holds with no retarget keep their current proposed_value.
  const effectiveProposed = new Map<string, Record<string, unknown> | null>();
  for (const mut of mutations) {
    if (mut.kind === "retarget") effectiveProposed.set(mut.holdId, mut.proposed);
  }

  // ---- Reservation (Task 2.7): reserve every surviving hold's proposed email+name; suppress
  // DIFFERENT-entity rows colliding with a reservation; record them in reservation_collisions. ----
  computeReservations(survivingHolds, parseResult, {
    suppressedNames,
    suppressedEmails,
    foldConsumedByHold,
    effectiveProposed,
    priorCrewNames: new Set(args.previousCrewNames ?? []),
    mutations,
    baseModifiedTime: proposedBaseTime(args),
  });

  // ---- Build the transformed crew list ----
  const crewMembers: CrewMemberRow[] = [];
  const seen = new Set<string>();
  for (const m of parseResult.crewMembers) {
    if (suppressedNames.has(m.name)) continue;
    const eCanon = canonRow(m.email);
    if (eCanon && suppressedEmails.has(eCanon) && !heldNames.has(m.name)) continue;
    const pin = pinnedIdentity.get(m.name);
    if (pin) {
      // Identity pinned: force email = held email, keep name = entity_key (old name). Non-identity
      // follows the sheet (this is the sheet row for the held crew).
      crewMembers.push({ ...m, name: pin.name, email: pin.email });
      seen.add(pin.name);
    } else {
      crewMembers.push(m);
      seen.add(m.name);
    }
  }
  // Retained held rows missing from the parse (delete-suppressed). Apply non-identity overrides.
  for (const [name, row] of retainRows) {
    if (seen.has(name)) continue;
    const override = nonIdentityOverride.get(name);
    const pin = pinnedIdentity.get(name);
    const base = override ? { ...override, name, email: pin?.email ?? row.email } : row;
    crewMembers.push({ ...base, name, email: pin?.email ?? base.email });
    seen.add(name);
  }

  // ---- Apply hold mutations (re-target / reservation) in order ----
  for (const mut of mutations) {
    if (mut.kind === "retarget") {
      await updateHoldProposedValue(port, mut.holdId, mut.proposed, mut.baseModifiedTime);
    } else {
      await setReservationCollisions(port, mut.holdId, mut.collisions);
    }
  }

  return {
    plan: { crewMembers, protectedNames, heldNames },
    survivingHolds,
  };
}

function proposedBaseTime(args: HoldAwareApplyArgs): string {
  return args.baseModifiedTime;
}

function applyUndoOverrideToMaps(
  hold: OpenHoldRow,
  parseByName: Map<string, CrewMemberRow>,
  _parseByEmail: Map<string, CrewMemberRow>,
  maps: {
    protectedNames: Set<string>;
    suppressedNames: Set<string>;
    suppressedEmails: Set<string>;
    retainRows: Map<string, CrewMemberRow>;
    pinnedIdentity: Map<string, { name: string; email: string | null }>;
  },
): void {
  const held = hold.held_value;
  if (hold.domain === "crew_email") {
    // Reject: pin old email TERMINALLY (no proposed_value, no pending UI).
    maps.protectedNames.add(hold.entity_key);
    maps.pinnedIdentity.set(hold.entity_key, {
      name: String(held.name ?? hold.entity_key),
      email: (held.email as string | null) ?? null,
    });
    return;
  }
  // crew_identity
  if ((held as Record<string, unknown>).absent === true) {
    // Tombstone: suppress the upsert/add of held_value.name.
    maps.suppressedNames.add(String((held as Record<string, unknown>).name ?? ""));
    return;
  }
  // Held-present (restore): retain/re-insert the held row + exclude from delete.
  maps.protectedNames.add(hold.entity_key);
  maps.retainRows.set(hold.entity_key, rowFromHeldValue(held));
  const baseline = baselineOf(held);
  if (baseline?.kind === "rename" && baseline.suppressed_added) {
    // Suppress the replacement by name AND email (resolution #16): a re-named replacement carrying
    // the same email must still be suppressed, so add BOTH the name and the canonical email.
    maps.suppressedNames.add(baseline.suppressed_added.name);
    const e = canonRow(baseline.suppressed_added.email);
    if (e) maps.suppressedEmails.add(e);
    void parseByName;
  }
}

function computeReservations(
  survivingHolds: OpenHoldRow[],
  parseResult: ParseResult,
  out: {
    suppressedNames: Set<string>;
    suppressedEmails: Set<string>;
    foldConsumedByHold: Map<string, Set<string>>;
    effectiveProposed: Map<string, Record<string, unknown> | null>;
    priorCrewNames: Set<string>;
    mutations: Array<
      | { kind: "retarget"; holdId: string; proposed: Record<string, unknown>; baseModifiedTime: string }
      | { kind: "reservation"; holdId: string; collisions: Array<{ name: string; email: string | null }> }
    >;
    baseModifiedTime: string;
  },
): void {
  for (const hold of survivingHolds) {
    if (hold.kind !== "mi11_pending") {
      // undo_override reservations are handled via suppressedNames above; no collision recording.
      continue;
    }
    // P2-F1: reserve the EFFECTIVE (post-fold/retarget) proposed identity, not the stale DB value.
    const proposed = out.effectiveProposed.has(hold.id)
      ? out.effectiveProposed.get(hold.id)!
      : (hold.proposed_value as Record<string, unknown> | null);
    if (!proposed) {
      out.mutations.push({ kind: "reservation", holdId: hold.id, collisions: [] });
      continue;
    }
    const reservedEmail = canonEmail((proposed.email as string | null) ?? null);
    const reservedName = (proposed.name as string | null) ?? null;
    const collisions: Array<{ name: string; email: string | null }> = [];
    for (const m of parseResult.crewMembers) {
      // A different-entity row (not the held crew itself) colliding with the reserved email or name.
      if (m.name === hold.entity_key) continue;
      // P2-F1 / WM-F1: a row consumed by THIS hold's OWN rename/removal fold is the hold's own
      // target, not a different-entity collision — never record it for THIS hold. Keyed per-hold so
      // a name consumed by ANOTHER hold's fold is still a valid collision for this one.
      if (out.foldConsumedByHold.get(hold.id)?.has(m.name)) continue;
      const e = canonEmail(m.email);
      const emailCollides = reservedEmail != null && e === reservedEmail;
      const nameCollides = reservedName != null && m.name === reservedName;
      if (emailCollides || nameCollides) {
        // P2-F4: only an ADDED row (not present in the prior live snapshot) may be SUPPRESSED.
        // A PRE-EXISTING live crew member that owns the reserved email/name must STAY LIVE — never
        // delete an unrelated live person because a held crew's proposed identity collides with it.
        // The pre-existing-owner conflict is resolved at Approve time by Phase 3's collision graph.
        const isAddedRow = !out.priorCrewNames.has(m.name);
        if (isAddedRow) {
          out.suppressedNames.add(m.name);
          if (reservedEmail != null && e === reservedEmail) out.suppressedEmails.add(reservedEmail);
        }
        // Record either way (belt-and-suspenders so Phase 3 Approve sees the conflict).
        collisions.push({ name: m.name, email: e });
      }
    }
    // Fresh-each-apply: always set (empty when no collision → releases the Phase-3 block).
    out.mutations.push({ kind: "reservation", holdId: hold.id, collisions });
  }
}
