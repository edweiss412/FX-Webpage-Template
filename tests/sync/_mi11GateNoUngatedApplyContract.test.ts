/**
 * STRUCTURAL / runtime-invariant meta-test (P2-F6 → P2-F7 fail-open class closure).
 *
 * Invariant: no LIVE apply entry point may apply an MI-11-bearing parse without EITHER writing
 * holds (the hold-aware path) OR failing closed. The fail-open class recurred twice (runPhase2 in
 * P2-F6; applyStaged_unlocked in P2-F7), so this pins it for ALL current live-apply entry points.
 *
 * Concrete failure mode caught: a future/edited apply path drops mi11Items (or forgets the MI-11
 * residue guard) and silently applies the identity change — bypassing the milestone's gate.
 *
 * Two layers:
 *  (1) Static: enumerate the live-apply entry points (those that invoke runPhase2 on a live,
 *      non-wizard parse). Each must reference a fail-closed signal (Phase2GateBypassError) OR thread
 *      mi11Items into runPhase2. A new entry point that does neither must be added here deliberately.
 *  (2) Runtime: drive BOTH entry points with a real MI-11 parse and assert neither applies ungated
 *      (each throws Phase2GateBypassError; runPhase2's crew-mutating apply never runs).
 */
import { readFileSync } from "node:fs";

import { describe, expect, test, vi } from "vitest";

import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult, TriggeredReviewItem } from "@/lib/parser/types";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import {
  applyStaged_unlocked,
  type ApplyStagedDeps,
  type PendingSyncForApply,
} from "@/lib/sync/applyStaged";
import { Phase2GateBypassError, runPhase2, type Phase2Tx } from "@/lib/sync/phase2";

// ---- (1) Static enumeration of live-apply entry points ----
// Each file below contains a live (non-wizard) apply that reaches runPhase2. The invariant: the
// file must either thread `mi11Items` into runPhase2 (→ runPhase2's own fail-closed guard fires on
// a missing holdPort) OR fail closed on an MI-11 item in triggeredReviewItems. runPhase2 itself is
// the gate enforcer (it throws Phase2GateBypassError); the OTHER live-apply callers must not
// silently strip the gate.
const LIVE_APPLY_ENTRY_POINTS = [
  // runScheduledCronSync: the cron/push path. Threads mi11Items into runPhase2 (phase1
  // auto_apply_with_holds → mi11Items) so runPhase2's guard enforces the hold port.
  { file: "lib/sync/runScheduledCronSync.ts", mustReference: ["mi11Items"] },
  // applyStaged: the legacy live whole-parse staged-apply path. Fails closed on MI-11 residue.
  { file: "lib/sync/applyStaged.ts", mustReference: ["Phase2GateBypassError"] },
];

describe("MI-11 gate — no live-apply entry point applies ungated (P2-F6/F7 class)", () => {
  test("runPhase2 is the gate enforcer (throws Phase2GateBypassError on MI-11 without a hold port)", () => {
    const src = readFileSync("lib/sync/phase2.ts", "utf8");
    expect(src).toMatch(/class Phase2GateBypassError/);
    expect(src).toMatch(/throw new Phase2GateBypassError\(\)/);
    // The guard keys on mi11Items presence + missing holdPort.
    expect(src).toMatch(/mi11Items[\s\S]*holdPort/);
  });

  test("each enumerated live-apply entry point references a fail-closed signal or threads mi11Items", () => {
    for (const { file, mustReference } of LIVE_APPLY_ENTRY_POINTS) {
      const src = readFileSync(file, "utf8");
      const ok = mustReference.some((needle) => src.includes(needle));
      expect(
        ok,
        `${file} must either thread mi11Items into runPhase2 or fail closed via ` +
          `Phase2GateBypassError on an MI-11 item — otherwise it can apply an identity change ungated. ` +
          `If you add a NEW live-apply entry point, register it here with its gate strategy.`,
      ).toBe(true);
    }
  });
});

// ---- (2) Runtime: drive BOTH entry points with an MI-11 parse; neither may apply ungated ----

function emptyShow(): ParseResult["show"] {
  return {
    title: "T",
    client_label: "c",
    client_contact: null,
    template_version: "v4",
    venue: null,
    dates: { travelIn: "2026-05-07", set: "2026-05-08", showDays: ["2026-05-09"], travelOut: "2026-05-10" },
    schedule_phases: {},
    event_details: {},
    agenda_links: [],
    coi_status: "Pending",
    po: null,
    proposal: null,
    invoice: null,
    invoice_notes: null,
  };
}

function parseWith(crewMembers: ParseResult["crewMembers"]): ParseResult {
  return {
    show: emptyShow(),
    crewMembers,
    hotelReservations: [],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: [],
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    hardErrors: [],
  };
}

const ALICE = {
  name: "Alice",
  email: "a@new",
  phone: null,
  role: "A1",
  role_flags: ["A1"] as ParseResult["crewMembers"][number]["role_flags"],
  date_restriction: { kind: "none" } as ParseResult["crewMembers"][number]["date_restriction"],
  stage_restriction: { kind: "none" } as ParseResult["crewMembers"][number]["stage_restriction"],
  flight_info: null,
};

const MI11_ITEM: TriggeredReviewItem = {
  id: "mi11-1",
  invariant: "MI-11",
  crew_name: "Alice",
  prior_email: "a@old",
  new_email: "a@new",
};

describe("MI-11 gate — runtime: both live-apply entry points fail closed on MI-11", () => {
  test("runPhase2 (cron/push entry): MI-11 items + no holdPort → throws, never upserts crew", async () => {
    let crewUpserted = false;
    // A Phase2Tx WITHOUT holdPort (the unsafe direction P2-F6 closed).
    const tx = {
      async applyShowSnapshot() {
        return { outcome: "updated" as const, showId: "show-1", previousCrewNames: [], previousCrewMembers: [] };
      },
      async deleteCrewMembersNotIn() {},
      async upsertCrewMembers() {
        crewUpserted = true;
      },
      async provisionAddedCrewAuth() {},
      async revokeRemovedCrewAuth() {},
      async replaceHotelReservations() {},
      async replaceRooms() {},
      async replaceTransportation() {},
      async replaceContacts() {},
      async upsertShowsInternal() {},
      async deleteLivePendingIngestion() {},
    } as unknown as Phase2Tx;

    await expect(
      runPhase2(tx, {
        driveFileId: "drive-1",
        mode: "cron",
        fileMeta: { driveFileId: "drive-1", name: "s", mimeType: "x", modifiedTime: "2026-06-08T12:00:00.000Z", parents: ["f"] } as DriveListedFile,
        parseResult: parseWith([ALICE]),
        binding: { bindingToken: "t", modifiedTime: "2026-06-08T12:00:00.000Z" },
        verifyReelOnApply: false,
        mi11Items: [MI11_ITEM] as never,
      }),
    ).rejects.toBeInstanceOf(Phase2GateBypassError);
    expect(crewUpserted).toBe(false);
  });

  test("applyStaged_unlocked (staged entry): MI-11 residue → throws, never runs Phase 2", async () => {
    const runPhase2Mock = vi.fn(async () => ({ outcome: "applied" as const, showId: "show-1" }));
    const pending: PendingSyncForApply = {
      driveFileId: "drive-file-1",
      stagedId: "staged-live",
      sourceKind: "manual",
      wizardSessionId: null, // LIVE (non-wizard)
      baseModifiedTime: "2026-05-08T10:00:00.000Z",
      stagedModifiedTime: "2026-05-08T12:00:00.000Z",
      parseResult: parseWith([ALICE]),
      triggeredReviewItems: [MI11_ITEM],
      reviewItemsCorrupt: false,
      parseResultCorrupt: false,
      priorLastSyncStatus: "ok",
      priorLastSyncError: null,
      warningSummary: "none",
    };
    const tx = {
      operations: [] as string[],
      async queryOne(sql: string) {
        if (/pg_locks/i.test(sql)) return { held: true };
        if (/select archived from public\.shows/i.test(sql)) return { archived: false };
        throw new Error(`unexpected SQL: ${sql}`);
      },
    } as unknown as LockedShowTx<never>;

    const deps = {
      readLivePendingSyncForApply: vi.fn(async () => pending),
      readShowForApply: vi.fn(async () => ({
        showId: "show-1",
        lastSeenModifiedTime: "2026-05-08T10:00:00.000Z",
        diagrams: { snapshot_revision_id: "rev-prior" },
      })),
      readWatchedFolderId: vi.fn(async () => "watched-folder"),
      fetchDriveFileMetadata: vi.fn(async () => ({
        driveFileId: "drive-file-1",
        name: "Show Sheet",
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: "2026-05-08T12:00:00.000Z",
        parents: ["watched-folder"],
        headRevisionId: "head-1",
        trashed: false,
      })),
      liveDriveReverify: { outcome: "ok" as const, metadata: { parents: ["watched-folder"] } as DriveListedFile },
      liveAssetReviewEffects: { parseResult: parseWith([ALICE]), adminAlertCode: null, skipDiagramsWrite: false },
      runPhase2: runPhase2Mock,
      insertSyncAudit: vi.fn(async () => "audit-1"),
      deleteLivePendingSync: vi.fn(async () => undefined),
      restoreShowStatus: vi.fn(async () => undefined),
      upsertLivePendingIngestion: vi.fn(async () => undefined),
      bumpReviewerAuthFloors: vi.fn(async () => undefined),
      upsertAdminAlert: vi.fn(async () => undefined),
    } as unknown as ApplyStagedDeps;

    await expect(
      applyStaged_unlocked(
        tx,
        {
          driveFileId: "drive-file-1",
          sourceScope: "live",
          stagedId: "staged-live",
          reviewerChoices: [{ item_id: "mi11-1", action: "apply" }],
          appliedByEmail: "doug@fxav.test",
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(Phase2GateBypassError);
    expect(runPhase2Mock).not.toHaveBeenCalled();
  });
});
