/**
 * Field-override teardown (Task 4) — the sync-path override overlay is gone. `applyParseResult`
 * must ALWAYS commit the raw parse via the full-replace crew path (deleteCrewMembersNotIn +
 * upsertCrewMembers) and NEVER route through an id-keyed override reconciliation or return crew
 * override side-effects. This pins that the overlay cannot silently return: even when a caller
 * supplies stray override-shaped input, it is ignored and the full-replace path runs verbatim.
 *
 * Pure in-memory tx-port fake (shape ref: tests/sync/overrideApply.test.ts) — no DB dependency.
 * Expected crew is DERIVED from the fixture (anti-tautology), never hardcoded against the assertion.
 */
import { describe, expect, it } from "vitest";

import { applyParseResult, type ApplyParseResultArgs } from "@/lib/sync/applyParseResult";

import { crew, parseResult, snapshot } from "./_holdAwareTestkit";
import type { ParseResult } from "@/lib/parser/types";

const SHOW_ID = "00000000-0000-0000-0000-0000000000aa";
const DRIVE_FILE_ID = "drv-teardown";

/** A minimal ApplyParseResultTx recording the full-replace crew calls; non-crew methods are no-ops. */
function recordingTx() {
  const deleteCalls: Array<{ showId: string; names: string[] }> = [];
  const upsertCalls: Array<{ showId: string; members: ParseResult["crewMembers"] }> = [];
  const tx = {
    async deleteCrewMembersNotIn(showId: string, names: string[]) {
      deleteCalls.push({ showId, names });
    },
    async upsertCrewMembers(showId: string, members: ParseResult["crewMembers"]) {
      upsertCalls.push({ showId, members });
    },
    async provisionAddedCrewAuth() {},
    async revokeRemovedCrewAuth() {},
    async replaceHotelReservations() {},
    async replaceRooms() {},
    async replaceTransportation() {},
    async replaceContacts() {},
    async upsertShowsInternal() {},
    async deleteLivePendingIngestion() {},
  };
  return { tx, deleteCalls, upsertCalls };
}

describe("applyParseResult — raw parse commits via unconditional full-replace (override overlay removed)", () => {
  it("drives deleteCrewMembersNotIn + upsertCrewMembers with the parsed members verbatim, ignoring override input, and returns no crew side-effects", async () => {
    const members = [
      crew("Alice", { role: "A1" }),
      crew("Bob", { role: "V1" }),
    ];
    const parsed = parseResult(members);
    const expectedNames = members.map((m) => m.name);

    const { tx, deleteCalls, upsertCalls } = recordingTx();

    // Stray override-shaped input: on the (removed) overlay this would route to the id-keyed
    // reconciliation and require the four-phase tx methods the fake omits — throwing. Post-teardown
    // it is ignored and the full-replace path runs. Cast tolerates the field in both worlds.
    const args = {
      driveFileId: DRIVE_FILE_ID,
      parseResult: parsed,
      snapshot: snapshot(SHOW_ID, []),
      activeCrewOverrides: [
        { id: "o1", field: "name", match_key: "Alice", override_value: "Alicia" },
      ],
    } as unknown as ApplyParseResultArgs;

    const outcome = await applyParseResult(tx, args);

    // Full-replace path ran exactly once with the parsed identities verbatim.
    expect(deleteCalls).toEqual([{ showId: SHOW_ID, names: expectedNames }]);
    expect(upsertCalls).toEqual([{ showId: SHOW_ID, members }]);

    // The applied crew is the raw parse; no override reconciliation view.
    expect(outcome.appliedCrewMembers).toEqual(members);
    // No override side-effects are ever returned.
    expect("crewSideEffects" in outcome).toBe(false);
  });
});
