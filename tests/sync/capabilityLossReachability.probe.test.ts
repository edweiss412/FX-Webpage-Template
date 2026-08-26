/**
 * BL-CAPABILITY-LOSS-SURVIVING-ROW-FALSE-POSITIVE — the reachability probe (AC-A1).
 *
 * The entry self-declares `**Reachability:** INFERRED, NOT PROBED` and names its
 * own first step: "a probe per hold kind, not a patch". This is that probe.
 *
 * THE CLAIM UNDER TEST. `capabilityRoleChangesForNotice` arm (c)
 * (`lib/sync/phase2.ts:347-356`) reports a capability loss for any
 * `previousCrewMembers` entry absent from `nextByName` and absent from
 * `renamedAway`. `nextByName` is built from `appliedCrewMembers`, which is the
 * post-hold PARSE list (`lib/sync/applyParseResult.ts:189`), while
 * `deleteKeepNames` (`:178`) protects rows from deletion WITHOUT adding them to
 * that list. So a row can survive the apply with its capability flags intact and
 * still be reported as a loss.
 *
 * WHY END-TO-END, AND WHY THROUGH runPhase2. Survival is decided by
 * `deleteKeepNames` inside `applyParseResult`, which is a layer below
 * `planHoldAwareApply` and does not return that set; and arm (c) fires a layer
 * ABOVE, in `runPhase2`. A probe that stopped at the planner would be asserting
 * about the layer the defect is NOT in. `capabilityRoleChangesForNotice` is not
 * exported, so the real arm (c) is reached the only honest way — the notice
 * `runPhase2` actually produces — never a reimplementation of the predicate.
 *
 * THE ORACLE, per hold kind × domain × sub-shape:
 *   survived (row still in crew_members after the apply)
 *     AND reported (arm (c) named it in roleFlagsNotice)   → the defect is REACHABLE
 *   deleted AND reported                                    → a REAL loss, correctly reported
 *   survived AND not reported                               → correct suppression
 *
 * Every case seeds the hold as a PRIOR sync would have left it and then drives
 * the NEXT sync with a parse that omits the held name. That is not a contrived
 * shape: holds are long-lived by design (an mi11_pending hold sits open until an
 * admin resolves it) and the sheet is edited between syncs, so "an open hold
 * whose entity_key the sheet no longer lists" is ordinary traffic.
 *
 * ── RESULT, run 2026-08-04 against this tree ───────────────────────────────
 *
 *   hold kind / domain / sub-shape          survived  reported  verdict
 *   mi11_pending  / crew_email              yes       no        correct
 *   undo_override / crew_email              yes       YES       FALSE LOSS
 *   undo_override / crew_identity restore   yes       no        correct
 *   undo_override / crew_identity tombstone no        yes       real loss
 *
 * So the entry's premise holds, but for ONE of the four surviving-hold shapes,
 * not for holds in general — and the reason is a two-line asymmetry rather than
 * anything about arm (c)'s predicate. Every other branch that delete-protects a
 * name ALSO puts a row back: mi11_pending's genuine-removal fallback retains the
 * held row (`holdAwareApply.ts:322`), and the crew_identity restore branch
 * retains it (`:449`). `applyUndoOverrideToMaps`'s crew_email branch
 * (`:432-439`) adds `protectedNames` and `pinnedIdentity` and RETURNS — with no
 * `retainRows.set`. The retained rows are merged into `plan.crewMembers` at
 * `:390`, which is what reaches `appliedCrewMembers` and therefore `nextByName`.
 * A protected name with no retain row is exactly "survives the delete, absent
 * from the applied list", and arm (c) then reports a loss for a live LEAD.
 *
 * The three passing rows are pinned here alongside the failing one deliberately:
 * a fix that silences the false loss by loosening arm (c) would very likely also
 * silence the tombstone row's REAL loss, and this file is where that shows up.
 */
import postgres, { type Sql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import type { RoleFlag, TriggeredReviewItem } from "@/lib/parser/types";
import { runPhase2 } from "@/lib/sync/phase2";

import { crew, parseResult, phase2Tx, readCrew, seedCrew, seedShow } from "./_holdAwareTestkit";
import { premiseHolds } from "@/tests/_shared/premise";
import { assertLocalDbUrl } from "../db/_localDbUrl";

const DB_URL = assertLocalDbUrl(
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);
const sql: Sql = postgres(DB_URL, { max: 2, prepare: false });
afterAll(async () => {
  await sql.end({ timeout: 5 });
});

const ROLLBACK = Symbol("rollback");
async function inRollback<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
  let out: T;
  try {
    await sql.begin(async (tx) => {
      out = await fn(tx as unknown as Sql);
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
  return out!;
}

/** The prior sync's modified time; the hold's base. The apply below runs at MT2. */
const MT1 = "2026-06-08T12:00:00.000Z";
const MT2 = "2026-06-09T12:00:00.000Z";

/** Arm (c) only fires for a prior row carrying a capability flag (`lib/sync/phase2.ts:255`). */
const LEAD: RoleFlag[] = ["A1", "LEAD"];

function runArgs(driveFileId: string, next: ReturnType<typeof parseResult>) {
  return {
    driveFileId,
    mode: "cron" as const,
    fileMeta: {
      driveFileId,
      name: "Sheet",
      mimeType: "application/vnd.google-apps.spreadsheet",
      modifiedTime: MT2,
      parents: ["f"],
    },
    parseResult: next,
    binding: { bindingToken: "tok", modifiedTime: MT2 },
    verifyReelOnApply: false as const,
    notableItems: [] as TriggeredReviewItem[],
  };
}

async function seedHold(
  tx: Sql,
  args: {
    showId: string;
    driveFileId: string;
    kind: "mi11_pending" | "undo_override";
    domain: "crew_email" | "crew_identity";
    entityKey: string;
    heldValue: Record<string, unknown>;
    proposedValue?: Record<string, unknown> | null;
  },
) {
  await tx.unsafe(
    `insert into public.sync_holds
       (show_id, drive_file_id, domain, entity_key, held_value, proposed_value,
        base_modified_time, kind, created_by)
     values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::timestamptz,$8,'system')`,
    [
      args.showId,
      args.driveFileId,
      args.domain,
      args.entityKey,
      args.heldValue,
      args.proposedValue ?? null,
      MT1,
      args.kind,
    ] as never,
  );
}

/**
 * The two phones the `phoneAfter` oracle discriminates between.
 *
 * Annotated `string` rather than left as literal types on purpose: the premise
 * below compares them at RUNTIME, and with literal types TypeScript resolves
 * that comparison statically and rejects it as unintentional. A premise the
 * compiler can answer is not a premise — it has to be able to fail.
 */
const LIVE_PHONE: string = "555-NEW";
const HELD_PHONE: string = "555-OLD";

const heldRow = (name: string, email: string, extra: Record<string, unknown> = {}) => ({
  name,
  email,
  phone: HELD_PHONE,
  role: "A1",
  role_flags: LEAD,
  date_restriction: { kind: "none" },
  stage_restriction: { kind: "none" },
  flight_info: null,
  ...extra,
});

type Observation = {
  label: string;
  survived: boolean;
  reported: boolean;
  reportedFlags: string[] | null;
  /**
   * The surviving row's phone AFTER the apply, or null if it did not survive.
   *
   * This is the oracle that separates "retained the LIVE row" from "retained a
   * FROZEN SNAPSHOT of it". The live seed carries `555-NEW` while every
   * `heldValue` carries `555-OLD`, so the two are distinguishable — without that
   * divergence the testkit default and `heldRow` would both say `555-OLD` and
   * the assertion could not fail (arc C plan Q1 / R3 F1).
   */
  phoneAfter: string | null;
};

/**
 * One end-to-end case: seed a LEAD-flagged crew member and a surviving hold on
 * its name, then apply a parse that omits that name entirely.
 */
async function observe(
  tx: Sql,
  label: string,
  hold: {
    kind: "mi11_pending" | "undo_override";
    domain: "crew_email" | "crew_identity";
    heldValue: (name: string, email: string) => Record<string, unknown>;
    proposedValue?: Record<string, unknown> | null;
  },
): Promise<Observation> {
  const { showId, driveFileId } = await seedShow(tx);
  // `555-NEW` is the divergence the `phoneAfter` oracle rests on: every
  // `heldValue` below carries `555-OLD`, so a retain that reverts the row to
  // its frozen snapshot is observable rather than silent.
  const held = crew("Held", { email: "held@old", role_flags: LEAD, phone: LIVE_PHONE });
  await seedCrew(tx, showId, held);
  // A second member the sheet still lists, so the parse is a live roster rather
  // than an empty one — an empty parse is its own (already-guarded) shape and
  // would make the observation unattributable.
  await seedCrew(tx, showId, crew("Stays", { email: "stays@x" }));

  await seedHold(tx, {
    showId,
    driveFileId,
    kind: hold.kind,
    domain: hold.domain,
    entityKey: "Held",
    heldValue: hold.heldValue("Held", "held@old"),
    proposedValue: hold.proposedValue ?? null,
  });

  // The next sync: the sheet no longer lists Held.
  const next = parseResult([crew("Stays", { email: "stays@x" })]);
  const result = await runPhase2(phase2Tx(tx) as never, runArgs(driveFileId, next));

  const rows = await readCrew(tx, showId);
  const heldAfter = rows.find((r) => r.name === "Held");
  const survived = heldAfter !== undefined;

  // The oracle discriminates only while the live and held phones differ. Stated
  // here, unconditionally, rather than trusted: if a future fixture change makes
  // them equal, this fails by name instead of the phone assertions passing
  // vacuously.
  premiseHolds(
    `${label}: live seed phone must differ from the held snapshot phone`,
    LIVE_PHONE !== HELD_PHONE,
  );

  const notice = (
    result as {
      roleFlagsNotice?: {
        context: { changes: Array<{ crew_name: string; prior_flags: string[] }> };
      };
    }
  ).roleFlagsNotice;
  const change = notice?.context.changes.find((c) => c.crew_name === "Held");

  return {
    label,
    survived,
    reported: change !== undefined,
    reportedFlags: change ? change.prior_flags : null,
    phoneAfter: heldAfter ? ((heldAfter as { phone?: string | null }).phone ?? null) : null,
  };
}

describe("BL-CAPABILITY-LOSS-SURVIVING-ROW-FALSE-POSITIVE — reachability per hold kind", () => {
  it("mi11_pending / crew_email: protected AND retained, so no false loss fires", async () => {
    const o = await inRollback((tx) =>
      observe(tx, "mi11_pending/crew_email", {
        kind: "mi11_pending",
        domain: "crew_email",
        heldValue: (name, email) => heldRow(name, email),
        proposedValue: { name: "Held", email: "held@new" },
      }),
    );
    // `protectedNames.add(hold.entity_key)` is unconditional for a surviving
    // mi11_pending hold (`holdAwareApply.ts:237`), which is the half of the
    // shape the entry predicted. What the entry could not know without running
    // this: the genuine-removal fallback ALSO retains the held row (`:322`), so
    // the name is back in `plan.crewMembers` and arm (c) never sees an absence.
    expect(o, o.label).toEqual({
      label: "mi11_pending/crew_email",
      survived: true,
      reported: false,
      reportedFlags: null,
      // The genuine-removal fallback retains the FROZEN snapshot, so the live
      // phone is reverted. Not this arc's fix (filed as the sibling entry
      // BL-MI11-REMOVAL-FALLBACK-STALE-OVERWRITE); pinned here so the shape is
      // executable rather than described.
      phoneAfter: HELD_PHONE,
    });
  });

  it("undo_override / crew_email: protected but NOT retained — a live LEAD is reported as lost", async () => {
    const o = await inRollback((tx) =>
      observe(tx, "undo_override/crew_email", {
        kind: "undo_override",
        domain: "crew_email",
        heldValue: (name, email) => heldRow(name, email),
      }),
    );
    // THE DEFECT, pinned at CURRENT behaviour so a future fix has a failing case
    // waiting for it (same posture as the psql guard's KNOWN-miss pins). The
    // crew_email branch of `applyUndoOverrideToMaps` (`holdAwareApply.ts:432-439`)
    // adds protectedNames and pinnedIdentity and returns without a retain row,
    // unlike all three sibling branches. Held survives with its LEAD flag intact
    // and the operator is told it lost LEAD access.
    expect(o, o.label).toEqual({
      label: "undo_override/crew_email",
      survived: true,
      reported: false,
      reportedFlags: null,
      // The LIVE row is retained, not a snapshot of it — so the surviving row
      // still carries the phone the sheet last had. A frozen-snapshot retain
      // fails here by name.
      phoneAfter: LIVE_PHONE,
    });
  });

  it("undo_override / crew_identity, held-present: retained, so no false loss fires", async () => {
    const o = await inRollback((tx) =>
      observe(tx, "undo_override/crew_identity(restore)", {
        kind: "undo_override",
        domain: "crew_identity",
        heldValue: (name, email) => heldRow(name, email, { baseline: { kind: "delete" } }),
      }),
    );
    // The held-present branch adds protectedNames AND a retain row (`:447-449`).
    expect(o, o.label).toEqual({
      label: "undo_override/crew_identity(restore)",
      survived: true,
      reported: false,
      reportedFlags: null,
      // The restore branch retains `rowFromHeldValue(held)` by design — this IS
      // a resurrection of a deleted row, so the held snapshot is the right
      // source and the reverted phone is intended, not the Q1 defect.
      phoneAfter: HELD_PHONE,
    });
  });

  it("undo_override / crew_identity, tombstone: deleted, and the reported loss is REAL", async () => {
    const o = await inRollback((tx) =>
      observe(tx, "undo_override/crew_identity(tombstone)", {
        kind: "undo_override",
        domain: "crew_identity",
        heldValue: (name, email) => heldRow(name, email, { absent: true }),
      }),
    );
    // The tombstone branch adds ONLY suppressedNames and returns (`:442-445`),
    // so the name gets `heldNames` but never `protectedNames` — it is genuinely
    // deleted and the loss report is correct. This row is the counterweight: any
    // fix that suppresses arm (c) more aggressively must keep THIS one firing.
    expect(o, o.label).toEqual({
      label: "undo_override/crew_identity(tombstone)",
      survived: false,
      reported: true,
      reportedFlags: LEAD,
      // Genuinely deleted, so there is no row to carry a phone.
      phoneAfter: null,
    });
  });
});
