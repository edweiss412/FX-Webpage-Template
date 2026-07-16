/**
 * Undo interplay with the role-mapping overlay (spec 2026-07-15-extend-role-scope-vocab §12 matrix
 * row / §13). The undo RPC rebuilds `role_flags` from the change-log JSONB snapshot
 * (`supabase/migrations/20260608000003_undo_change_rpc.sql:250`), and those snapshots are taken
 * AFTER the overlay runs — so undo restores overlay-applied grants consistently, and the next sync
 * re-applies the (unchanged) mapping and converges (steady state, no flag churn).
 *
 * DB-bound (follows the Phase-4 `_holdsHelpers` harness — COMMITS so the separate authed-admin undo
 * connection sees the row). The grant under test is `FINANCIALS`, which NO sheet content can ever
 * produce (§4.1) — so a restored row carrying it PROVES the flag came from the overlay snapshot, not
 * from re-parsing the sheet. Expected values derive from the mapping fixture, never hardcoded.
 */
import { afterAll, describe, expect, it } from "vitest";

import type { ParseResult, ParseWarning } from "@/lib/parser/types";
import type { RoleTokenMapping } from "@/lib/sync/roleMappingOverlay";
import { runPhase2 } from "@/lib/sync/phase2";
import {
  crew as crewRow,
  parseResult as buildParseResult,
  phase2Tx,
} from "@/tests/sync/_holdAwareTestkit";

import {
  callUndoAsAdmin,
  closeHoldsHelpers,
  holdsSql,
  readChangeLog,
  readCrewByName,
  runAutoApply,
  seedShowWithCrew,
} from "./_holdsHelpers";

afterAll(async () => {
  await holdsSql`delete from public.shows where drive_file_id like 'drv-%'`;
  await closeHoldsHelpers();
});

const TOKEN = "DRONE OP";
const GRANTS = ["FINANCIALS"] as const;

function mapping(): RoleTokenMapping {
  return {
    token: TOKEN,
    grants: [...GRANTS],
    decidedBy: "doug@fxav.com",
    decidedAt: "2026-07-16T00:00:00.000Z",
  };
}

/** An UNKNOWN_ROLE_TOKEN warning whose blockRef points at the crew row at `index`. */
function unknownWarning(name: string, index: number): ParseWarning {
  return {
    severity: "warn",
    code: "UNKNOWN_ROLE_TOKEN",
    message: `Unrecognized role "Drone Op"`,
    rawSnippet: "Drone Op",
    roleToken: TOKEN,
    blockRef: { kind: "crew", index, name },
  };
}

/**
 * Drive a real Phase-2 sync of `[{name, role_flags:[]}]` WITH the mapping threaded (the overlay path
 * `runAutoApply` doesn't expose). COMMITS. Returns the runPhase2 result so callers can assert the
 * delta gate. Sheet role_flags start empty, so the ONLY flag on the row comes from the overlay.
 */
async function syncWithMapping(
  driveFileId: string,
  name: string,
  modifiedTime: string,
  priorParseWarnings: ParseWarning[],
) {
  const base = buildParseResult([crewRow(name, { role_flags: [] })]);
  const next: ParseResult = { ...base, warnings: [unknownWarning(name, 0)] };
  return holdsSql.begin(async (tx) =>
    runPhase2(phase2Tx(tx as never) as never, {
      driveFileId,
      mode: "cron" as const,
      fileMeta: {
        driveFileId,
        name: "Sheet",
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime,
        parents: ["f"],
      },
      parseResult: next,
      binding: { bindingToken: "tok", modifiedTime },
      verifyReelOnApply: false as const,
      mi11Items: [] as never,
      notableItems: [],
      roleTokenMappings: [mapping()],
      priorParseWarnings,
    }),
  );
}

describe("role-mapping overlay ↔ undo interplay (§12)", () => {
  it("undo of a removal restores the overlay-granted flag; the next mapped sync converges (steady state)", async () => {
    // Seed the show with a placeholder crew member we immediately overwrite via the mapped sync
    // (seedShowWithCrew hard-codes role_flags ['A1']; the mapped sync re-derives from an empty sheet).
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Marcus Webb", email: "marcus.webb@example.com" },
    ]);

    // (1) Mapped sync: overlay unions FINANCIALS onto Marcus (sheet role_flags empty → only FINANCIALS).
    const applied = await syncWithMapping(
      driveFileId,
      "Marcus Webb",
      "2026-06-08T12:10:00.000Z",
      [],
    );
    if (applied.outcome !== "applied") throw new Error("expected applied");
    const afterApply = await readCrewByName(showId, "Marcus Webb");
    expect(afterApply!.role_flags).toEqual([...GRANTS]); // overlay-granted, impossible from the sheet

    // (2) A later sync REMOVES Marcus → crew_removed row whose before_image snapshots the POST-overlay
    // role_flags (FINANCIALS). runAutoApply doesn't thread the mapping — removal doesn't need it.
    await runAutoApply(driveFileId, { crew: [], modifiedTime: "2026-06-08T12:20:00.000Z" });
    expect(await readCrewByName(showId, "Marcus Webb")).toBeNull();
    const removed = await readChangeLog(showId, {
      change_kind: "crew_removed",
      entity_ref: "Marcus Webb",
    });
    // The snapshot carries the overlay grant — the crux of the §12 claim.
    expect(removed.before_image?.role_flags).toEqual([...GRANTS]);

    // (3) Undo the removal → Marcus restored FROM the snapshot, still carrying FINANCIALS.
    const undo = await callUndoAsAdmin(removed.id);
    expect(undo.ok).toBe(true);
    const restored = await readCrewByName(showId, "Marcus Webb");
    expect(restored!.role_flags).toEqual([...GRANTS]);

    // (4) The next mapped sync re-applies the unchanged mapping and CONVERGES: flags stay
    // [FINANCIALS] (grant not duplicated, not lost) and no ROLE_FLAGS_NOTICE fires (prior == next).
    const steady = await syncWithMapping(
      driveFileId,
      "Marcus Webb",
      "2026-06-08T12:30:00.000Z",
      [],
    );
    if (steady.outcome !== "applied") throw new Error("expected applied");
    const afterSteady = await readCrewByName(showId, "Marcus Webb");
    expect(afterSteady!.role_flags).toEqual([...GRANTS]);
    expect(steady.roleFlagsNotice).toBeUndefined();
  });
});
