/**
 * BL-MI11-REMOVAL-FALLBACK-STALE-OVERWRITE — the retain sources the member's
 * own live row.
 *
 * THE DEFECT. A held crew member drops off the sheet. The hold-aware planner
 * keeps their row alive and re-inserts `sync_holds.held_value`, and the
 * snapshot-replace engine upserts that across every column
 * (`lib/sync/runScheduledCronSync.ts:1701`). `held_value` is a copy of a PRIOR
 * live row — `writeMi11Holds` reads it from `liveCrewByName`, the pre-apply
 * snapshot (`lib/sync/phase2.ts:122`) — so every field edited since is
 * silently reverted.
 *
 * WHY THIS LAYER. These cases drive `applyParseResult` directly rather than
 * `runPhase2`, because the defect turns on what `previousCrewMembers` holds and
 * only this entry point puts that under the case's control: `applyParseResult`
 * reads it from its `snapshot` argument (`lib/sync/applyParseResult.ts:171-172`),
 * never from the database. A case that seeded a diverged DB row and drove
 * `runPhase2` would assert against a value the planner never sees. The
 * end-to-end reachability oracle lives in `capabilityLossReachability.probe.test.ts`.
 *
 * THE FIXTURE SHAPE, and why it is the real one. Each case writes the hold with
 * the PRODUCTION writer, passing the hold-era row as `liveCrewByName`, and then
 * hands `applyParseResult` a DIVERGED row as `previousCrewMembers`. That is the
 * actual sequence: the hold is written at sync N from the then-live row, the
 * sheet edits the member at N+1, the sheet drops them at N+2. Held and live
 * differ because time passed, not because the fixture forced them apart.
 *
 * Spec: docs/superpowers/specs/sync/2026-08-27-mi11-removal-fallback-live-row.md
 * Plan: docs/superpowers/plans/2026-08-27-mi11-removal-fallback-live-row.md Task 1
 */
import postgres, { type Sql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import type { CrewMemberRow } from "@/lib/parser/types";
import { applyParseResult } from "@/lib/sync/applyParseResult";
import { writeMi11Holds, type LiveCrewRow } from "@/lib/sync/holds/writeMi11Holds";
import { premiseHolds } from "@/tests/_shared/premise";

import {
  applyTx,
  crew,
  holdPort,
  parseResult,
  prevMember,
  readCrew,
  seedCrew,
  seedShow,
  snapshot,
} from "./_holdAwareTestkit";
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

const MT1 = "2026-06-08T12:00:00.000Z";
const MT2 = "2026-06-09T12:00:00.000Z";

/**
 * The non-identity fields, pinned to the TYPE in BOTH directions.
 *
 * A runtime tuple cannot enumerate the keys of an erased type, so "every tuple
 * entry has a case" would never notice a key ADDED to CrewMemberRow. These two
 * annotations resolve to `never` when the sets diverge, which makes adding OR
 * removing a field a typecheck failure rather than a silent escape. Vitest
 * strips types, so `pnpm typecheck` is where this fires — not this suite.
 */
const NON_IDENTITY = [
  "phone",
  "role",
  "role_flags",
  "date_restriction",
  "stage_restriction",
  "flight_info",
] as const;
type NonIdentityKey = Exclude<keyof CrewMemberRow, "name" | "email">;
type TupleKey = (typeof NON_IDENTITY)[number];
const _everyTypeKeyCovered: [NonIdentityKey] extends [TupleKey] ? true : never = true;
const _noStrayTupleEntry: [TupleKey] extends [NonIdentityKey] ? true : never = true;
void _everyTypeKeyCovered;
void _noStrayTupleEntry;

/** The hold-era row: what `held_value` will be a copy of. */
const HELD_ERA: Omit<CrewMemberRow, "name" | "email"> = {
  phone: "555-HELD",
  role: "A1",
  role_flags: ["A1"],
  date_restriction: { kind: "explicit", days: ["2026-05-09"] },
  stage_restriction: { kind: "explicit", stages: ["Show"] },
  flight_info: "AA-HELD",
};

/** The row as the sheet later left it: every field moved. */
const LIVE_NOW: Omit<CrewMemberRow, "name" | "email"> = {
  phone: "555-LIVE",
  role: "V1",
  role_flags: ["V1", "LEAD"],
  date_restriction: { kind: "explicit", days: ["2026-07-20"] },
  stage_restriction: { kind: "explicit", stages: ["Load In"] },
  flight_info: "BB-LIVE",
};

const asLiveCrewRow = (m: CrewMemberRow): LiveCrewRow => m as unknown as LiveCrewRow;

/**
 * Seed a held member, write its mi11 hold from `heldEra`, then apply a parse
 * that drops the member, with `liveNow` as the prior-crew snapshot.
 *
 * `previous` defaults to the seeded member and can be overridden to drive the
 * no-live-row cases.
 */
async function applyWithHeldMemberDropped(
  tx: Sql,
  args: {
    heldEra: CrewMemberRow;
    liveNow: CrewMemberRow;
    priorEmail?: string | null;
    previous?: "default" | "absent" | "empty" | "other-member";
  },
): Promise<{ showId: string; after: Awaited<ReturnType<typeof readCrew>>[number] | undefined }> {
  const { showId, driveFileId } = await seedShow(tx);
  const row = await seedCrew(tx, showId, args.liveNow);
  // A second member the sheet still lists, so the parse is a live roster rather
  // than an empty one — an empty parse is its own already-guarded shape.
  const staysLive = crew("Stays", { email: "stays@x" });
  const staysRow = await seedCrew(tx, showId, staysLive);

  await writeMi11Holds(holdPort(tx) as never, {
    showId,
    driveFileId,
    mi11Items: [
      {
        id: "1",
        invariant: "MI-11",
        crew_name: args.heldEra.name,
        prior_email: args.priorEmail ?? args.heldEra.email,
        new_email: "held@new",
      },
    ],
    liveCrewByName: new Map([[args.heldEra.name, asLiveCrewRow(args.heldEra)]]),
    baseModifiedTime: MT1,
  });

  const mode = args.previous ?? "default";
  const previousMembers =
    mode === "default"
      ? [prevMember(row, args.liveNow), prevMember(staysRow, staysLive)]
      : mode === "other-member"
        ? [prevMember(staysRow, staysLive)]
        : [];
  const snap = snapshot(showId, previousMembers);
  const withPrevious =
    mode === "absent" ? { showId: snap.showId, previousCrewNames: snap.previousCrewNames } : snap;

  await applyParseResult(applyTx(tx), {
    driveFileId,
    parseResult: parseResult([staysLive]),
    snapshot: withPrevious,
    holds: { port: holdPort(tx), baseModifiedTime: MT2 },
  });

  const rows = await readCrew(tx, showId);
  return { showId, after: rows.find((r) => r.name === args.heldEra.name) };
}

const held = (over: Partial<CrewMemberRow> = {}): CrewMemberRow => ({
  name: "Held",
  email: "held@old",
  ...HELD_ERA,
  ...over,
});
const live = (over: Partial<CrewMemberRow> = {}): CrewMemberRow => ({
  name: "Held",
  email: "held@old",
  ...LIVE_NOW,
  ...over,
});

describe("the mi11 genuine-removal retain sources the member's own live row", () => {
  it("(a) carries EVERY non-identity field from the live row, not the held snapshot", async () => {
    const { after } = await inRollback((tx) =>
      applyWithHeldMemberDropped(tx, { heldEra: held(), liveNow: live() }),
    );
    expect(after, "the held member must survive the sheet dropping them").toBeDefined();

    // The premise on this case's OWN inputs: every field it discriminates on
    // must actually differ between the two sources, or the assertion below is
    // satisfied by a coincidence rather than by the code.
    for (const key of NON_IDENTITY) {
      premiseHolds(
        `(a) live and held must differ on ${key} for that assertion to discriminate`,
        JSON.stringify(LIVE_NOW[key]) !== JSON.stringify(HELD_ERA[key]),
      );
    }

    // Asserted field by field, against the live fixture rather than a literal,
    // so a subset merge names the field it missed instead of failing opaquely.
    expect(after!.phone, "phone").toBe(LIVE_NOW.phone);
    expect(after!.role, "role").toBe(LIVE_NOW.role);
    expect(after!.role_flags, "role_flags").toEqual(LIVE_NOW.role_flags);
    expect(after!.date_restriction, "date_restriction").toEqual(LIVE_NOW.date_restriction);
    expect(after!.stage_restriction, "stage_restriction").toEqual(LIVE_NOW.stage_restriction);
    expect(after!.flight_info, "flight_info").toBe(LIVE_NOW.flight_info);

    // Identity stays pinned to the hold, which is the hold's whole job.
    expect(after!.email, "identity stays held").toBe("held@old");
  });

  /**
   * The empty shapes, one row per way a non-identity value can be "nothing".
   *
   * The retain is a SPREAD, never a field-by-field pick and never a falsey
   * coalesce, so a live value that is `null`, `""`, `[]` or a `kind: "none"`
   * restriction is carried as it stands. A member whose phone was cleared,
   * whose role cell went blank, or whose flags were emptied keeps it that way:
   * that is the operator's latest word too. A blank role cell is reachable —
   * the crew parser skips a row only for a blank NAME and persists the trimmed
   * role as it finds it (`lib/parser/blocks/crew.ts:189-195`).
   */
  const EMPTY_SHAPES: ReadonlyArray<{
    label: string;
    key: TupleKey;
    liveValue: unknown;
    heldValue: unknown;
  }> = [
    { label: "null phone", key: "phone", liveValue: null, heldValue: "555-HELD" },
    { label: "blank role", key: "role", liveValue: "", heldValue: "A1" },
    { label: "empty role_flags", key: "role_flags", liveValue: [], heldValue: ["A1"] },
    {
      label: "date_restriction kind:none",
      key: "date_restriction",
      liveValue: { kind: "none" },
      heldValue: { kind: "explicit", days: ["2026-05-09"] },
    },
    {
      label: "date_restriction explicit with NO days",
      key: "date_restriction",
      liveValue: { kind: "explicit", days: [] },
      heldValue: { kind: "explicit", days: ["2026-05-09"] },
    },
    {
      label: "stage_restriction kind:none",
      key: "stage_restriction",
      liveValue: { kind: "none" },
      heldValue: { kind: "explicit", stages: ["Show"] },
    },
    { label: "null flight_info", key: "flight_info", liveValue: null, heldValue: "AA-HELD" },
  ];

  it("(b) every non-identity field of the type has an empty-shape case", () => {
    // The table above is hand-written; this is what stops it drifting from the
    // type. The two type-level equalities at the top of this file catch a field
    // ADDED to CrewMemberRow at typecheck time; this catches a field that
    // reaches the tuple and never gets a shape.
    const covered = new Set(EMPTY_SHAPES.map((c) => c.key));
    expect(
      [...NON_IDENTITY].filter((k) => !covered.has(k)),
      "fields with no empty-shape case",
    ).toEqual([]);
  });

  it.each(EMPTY_SHAPES)("(c) an empty live $label survives the retain", async (shape) => {
    premiseHolds(
      `(c) ${shape.label}: live and held must differ, or the assertion cannot discriminate`,
      JSON.stringify(shape.liveValue) !== JSON.stringify(shape.heldValue),
    );
    const { after } = await inRollback((tx) =>
      applyWithHeldMemberDropped(tx, {
        heldEra: held({ [shape.key]: shape.heldValue } as Partial<CrewMemberRow>),
        liveNow: live({ [shape.key]: shape.liveValue } as Partial<CrewMemberRow>),
      }),
    );
    expect(after, "the held member must survive").toBeDefined();
    expect(
      (after as unknown as Record<string, unknown>)[shape.key],
      `${shape.label} must be carried from live, not coalesced back to the snapshot`,
    ).toEqual(shape.liveValue);
  });

  /**
   * DEFENSIVE, not a reachable-path claim — spec AC-7 says so and this comment
   * repeats it where someone reading the case will see it.
   *
   * Spec round 3 showed the null-held / non-null-live pair is not reachable
   * under the arc's threat fence: with a null `held.email` every parse-present
   * sync writes `email: pin.email`, which is null (`holdAwareApply.ts:391`), and
   * rejecting an email change does not mutate `crew_members`
   * (`20260608000002_mi11_gate_rpcs.sql:67`), so the live row's email is null
   * too by the time any retain runs. This case hand-seeds the inconsistent pair.
   * It is kept because re-imposing identity costs two words and the alternative
   * is a helper whose correctness depends on a coincidence between two tables.
   */
  it("(d) DEFENSIVE: a null held email is not overwritten by the live one", async () => {
    const { after } = await inRollback((tx) =>
      applyWithHeldMemberDropped(tx, {
        heldEra: held({ email: null }),
        liveNow: live({ email: "held@old" }),
        priorEmail: null,
      }),
    );
    expect(after, "the held member must survive").toBeDefined();
    expect(after!.email, "identity comes from the hold even when it is null").toBeNull();
  });

  /**
   * No live row for this member: the held snapshot is retained, exactly as
   * before this arc, and nothing throws. Spec L1.
   *
   * Three shapes rather than one. (e) and (f) differ at
   * `lib/sync/applyParseResult.ts:171-172`, whose conditional spread either
   * passes `previousCrewMembers` or omits the key entirely — they converge at
   * the planner, where `?? []` makes both an empty map, and that convergence is
   * the point: the caller has two ways to say nothing and neither may throw.
   * (g) is the genuinely different path, a non-empty prior list with no row for
   * this member, which is what `previousByName.get` returning undefined means
   * in production.
   */
  const NO_LIVE_ROW = [
    { label: "(e) previousCrewMembers omitted by the caller", previous: "absent" as const },
    { label: "(f) previousCrewMembers present but empty", previous: "empty" as const },
    {
      label: "(g) previousCrewMembers holds only OTHER members",
      previous: "other-member" as const,
    },
  ];

  /**
   * The `crew_email` reject branch (holdAwareApply.ts:466), which arc C
   * repaired to retain the LIVE row and which this arc finishes.
   *
   * Two defects on one line. (m) it retained the live row RAW under a
   * pinnedIdentity whose email may be null, so the build loop's
   * `pin?.email ?? row.email` fallback put the LIVE email onto a row the hold
   * pins to none. (n) the retain was guarded on `live`, so a member with no
   * live row got protectedNames and NO row — the exact shape that made arc C's
   * capability-loss notice report a live LEAD as lost.
   */
  async function applyCrewEmailReject(
    tx: Sql,
    args: { heldValue: Record<string, unknown>; liveNow: CrewMemberRow; withLiveRow: boolean },
  ) {
    const { showId, driveFileId } = await seedShow(tx);
    // `withLiveRow: false` seeds NO crew row and passes NO prior-crew entry, so
    // the two agree. Seeding the row while omitting it from the snapshot would
    // be a state production cannot produce -- previousCrewMembers is read from
    // the live crew -- and the assertion would then be about an upsert
    // overwriting a live row with a snapshot, which is not what this case is for.
    const row = args.withLiveRow ? await seedCrew(tx, showId, args.liveNow) : null;
    const stays = crew("Stays", { email: "stays@x" });
    const staysRow = await seedCrew(tx, showId, stays);
    await tx.unsafe(
      `insert into public.sync_holds
         (show_id, drive_file_id, domain, entity_key, held_value, proposed_value,
          base_modified_time, kind, created_by)
       values ($1,$2,'crew_email',$3,$4::jsonb,null,$5::timestamptz,'undo_override','system')`,
      [showId, driveFileId, args.liveNow.name, args.heldValue, MT1] as never,
    );
    const previous =
      args.withLiveRow && row
        ? [prevMember(row, args.liveNow), prevMember(staysRow, stays)]
        : [prevMember(staysRow, stays)];
    await applyParseResult(applyTx(tx), {
      driveFileId,
      parseResult: parseResult([stays]),
      snapshot: snapshot(showId, previous),
      holds: { port: holdPort(tx), baseModifiedTime: MT2 },
    });
    return (await readCrew(tx, showId)).find((r) => r.name === args.liveNow.name);
  }

  it("(m) DEFENSIVE: the crew_email branch does not leak the live email onto a null-pinned row", async () => {
    const heldValue = { name: "Held", email: null, ...HELD_ERA };
    const liveNow = live({ email: "held@old" });
    premiseHolds(
      "(m) the held email must be null AND the live one not, or the leak cannot show",
      heldValue.email === null && liveNow.email !== null,
    );
    const after = await inRollback((tx) =>
      applyCrewEmailReject(tx, { heldValue, liveNow, withLiveRow: true }),
    );
    expect(after, "the held member must survive").toBeDefined();
    expect(after!.email, "identity comes from the hold even when it is null").toBeNull();
  });

  it("(n) the crew_email branch retains the snapshot when there is no live row, rather than nothing", async () => {
    const heldValue = { name: "Held", email: "held@old", ...HELD_ERA };
    const after = await inRollback((tx) =>
      applyCrewEmailReject(tx, { heldValue, liveNow: live(), withLiveRow: false }),
    );
    // Asserted at the row itself, which is what the retain feeds through
    // plan.crewMembers and what every downstream reader indexes. Before this
    // arc the branch added protectedNames and NO retain, so with nothing in the
    // database and nothing in the applied list the member simply was not there.
    //
    // NOT asserted at the capability-loss notice: arm (c) iterates
    // previousCrewMembers, and this case's whole premise is that it holds no
    // row for the member, so the notice could not name them under ANY
    // implementation and that assertion would be tautological. The arc-C
    // symptom needs a live prior row to be reachable and this case has none.
    expect(after, "the snapshot retain must put the member back").toBeDefined();
    expect(after!.phone, "with no live row the snapshot is the best source there is").toBe(
      HELD_ERA.phone,
    );
  });

  it.each(NO_LIVE_ROW)("$label falls back to the held snapshot", async ({ previous }) => {
    const { after } = await inRollback((tx) =>
      applyWithHeldMemberDropped(tx, { heldEra: held(), liveNow: live(), previous }),
    );
    expect(after, "the held member must still survive the delete").toBeDefined();
    expect(after!.phone, "with no live row there is nothing better than the snapshot").toBe(
      HELD_ERA.phone,
    );
    expect(after!.role, "same for every other non-identity field").toBe(HELD_ERA.role);
  });
});
