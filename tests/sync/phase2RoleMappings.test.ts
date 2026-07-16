import { describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type { CrewMemberRow, ParseResult, ParseWarning, RoomRow } from "@/lib/parser/types";
import type { RoleTokenMapping } from "@/lib/sync/roleMappingOverlay";

// Integration test for the role-mapping overlay + delta gate wired into runPhase2
// (spec 2026-07-15-extend-role-scope-vocab §6/§10). Follows the FakePhase2Tx
// harness pattern in tests/sync/phase2.test.ts (copied, not a new harness): a
// structural in-memory tx that records the upserted crew + returns the prior
// crew snapshot the gate reads. Assertions derive from the fixture mapping rows.

type FakeShow = {
  id: string;
  driveFileId: string;
  lastSeenModifiedTime: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  crewNames: string[];
  crewMembers?: CrewMemberRow[];
};

type FakeCrewAuth = {
  current_token_version: number;
  max_issued_version: number;
  revoked_below_version: number;
};

function crew(
  name: string,
  roleFlags: CrewMemberRow["role_flags"] = [],
  role = "Drone Op",
): CrewMemberRow {
  return {
    name,
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    phone: null,
    role,
    role_flags: roleFlags,
    date_restriction: { kind: "none" },
    stage_restriction: { kind: "none" },
    flight_info: null,
  };
}

function room(name = "General Session"): RoomRow {
  return {
    kind: "gs",
    name,
    dimensions: null,
    floor: null,
    setup: null,
    set_time: null,
    show_time: null,
    strike_time: null,
    audio: null,
    video: null,
    lighting: null,
    scenic: null,
    power: null,
    digital_signage: null,
    other: null,
    notes: null,
  };
}

const MAPPING: RoleTokenMapping = {
  token: "DRONE OP",
  grants: ["A1"],
  decidedBy: "doug@fxav.com",
  decidedAt: "2026-07-16T00:00:00.000Z",
};

function unknownRoleWarning(name: string): ParseWarning {
  return {
    severity: "warn",
    code: "UNKNOWN_ROLE_TOKEN",
    message: `Unrecognized role "Drone Op"`,
    rawSnippet: "Drone Op",
    roleToken: "DRONE OP",
    blockRef: { kind: "crew", index: 0, name },
  };
}

function parseResult(overrides: Partial<ParseResult> = {}): ParseResult {
  return {
    show: {
      title: "Show Title",
      client_label: "Client",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: {
        travelIn: "2026-05-07",
        set: "2026-05-08",
        showDays: ["2026-05-09"],
        travelOut: "2026-05-10",
      },
      schedule_phases: {},
      event_details: {},
      agenda_links: [],
      coi_status: null,
      po: null,
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: [crew("Marcus Webb")],
    hotelReservations: [],
    rooms: [room()],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [unknownRoleWarning("Marcus Webb")],
    archivedPullSheetTabs: [],
    hardErrors: [],
    ...overrides,
  };
}

function fileMeta(modifiedTime: string): DriveListedFile {
  return {
    driveFileId: "file-1",
    name: "Show Sheet",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime,
    parents: ["folder-1"],
  };
}

class FakePhase2Tx {
  shows = new Map<string, FakeShow>();
  crewAuth = new Map<string, FakeCrewAuth>();
  hotelReservations: unknown[] = [];
  rooms: unknown[] = [];
  transportation: unknown = null;
  contacts: unknown[] = [];
  showsInternal: unknown = null;
  pendingIngestions = new Set<string>();
  operations: string[] = [];

  async applyShowSnapshot(args: {
    driveFileId: string;
    modifiedTime: string;
    staleGuard: "strict_less_than" | "less_than_or_equal";
    parseResult: ParseResult;
    slug: string;
  }) {
    this.operations.push(`applyShowSnapshot:${args.staleGuard}`);
    const show = this.shows.get(args.driveFileId);
    const incoming = Date.parse(args.modifiedTime);
    if (show?.lastSeenModifiedTime) {
      const current = Date.parse(show.lastSeenModifiedTime);
      const allowed =
        args.staleGuard === "strict_less_than" ? current < incoming : current <= incoming;
      if (!allowed) return { outcome: "stale" as const };
    }
    const nextShow: FakeShow = show ?? {
      id: "show-1",
      driveFileId: args.driveFileId,
      lastSeenModifiedTime: null,
      lastSyncStatus: null,
      lastSyncError: null,
      crewNames: [],
    };
    const previousCrewNames = [...nextShow.crewNames];
    const previousCrewMembers = nextShow.crewMembers
      ? nextShow.crewMembers.map((member) => ({ ...member, role_flags: [...member.role_flags] }))
      : previousCrewNames.map((name) => crew(name));
    nextShow.lastSeenModifiedTime = args.modifiedTime;
    nextShow.lastSyncStatus = "ok";
    nextShow.lastSyncError = null;
    this.shows.set(args.driveFileId, nextShow);
    return {
      outcome: "updated" as const,
      showId: nextShow.id,
      previousCrewNames,
      previousCrewMembers,
      priorRunOfShow: null,
    };
  }

  async applyDiagramSnapshot(_driveFileId: string, _diagrams: ParseResult["diagrams"]) {
    this.operations.push("applyDiagramSnapshot");
  }

  async deleteCrewMembersNotIn(showId: string, names: string[]) {
    this.operations.push(`deleteCrewMembersNotIn:${showId}:${names.join(",")}`);
    const show = [...this.shows.values()].find((row) => row.id === showId);
    if (show) show.crewNames = show.crewNames.filter((name) => names.includes(name));
  }

  async renameCrewMember(showId: string, removedName: string, addedName: string) {
    this.operations.push(`renameCrewMember:${showId}:${removedName}→${addedName}`);
  }

  async upsertCrewMembers(showId: string, members: CrewMemberRow[]) {
    this.operations.push(`upsertCrewMembers:${showId}`);
    const show = [...this.shows.values()].find((row) => row.id === showId);
    if (show) {
      show.crewNames = members.map((member) => member.name);
      show.crewMembers = members.map((member) => ({
        ...member,
        role_flags: [...member.role_flags],
      }));
    }
  }

  async provisionAddedCrewAuth(_showId: string, names: string[]) {
    this.operations.push(`provisionAddedCrewAuth:${names.join(",")}`);
  }

  async revokeRemovedCrewAuth(_showId: string, names: string[]) {
    this.operations.push(`revokeRemovedCrewAuth:${names.join(",")}`);
  }

  async replaceHotelReservations(_showId: string, rows: unknown[]) {
    this.operations.push("replaceHotelReservations");
    this.hotelReservations = rows;
  }

  async replaceRooms(_showId: string, rows: unknown[]) {
    this.operations.push("replaceRooms");
    this.rooms = rows;
  }

  async replaceTransportation(_showId: string, row: unknown) {
    this.operations.push("replaceTransportation");
    this.transportation = row;
  }

  async replaceContacts(_showId: string, rows: unknown[]) {
    this.operations.push("replaceContacts");
    this.contacts = rows;
  }

  async upsertShowsInternal(_showId: string, payload: unknown) {
    this.operations.push("upsertShowsInternal");
    this.showsInternal = payload;
  }

  async deleteLivePendingIngestion(driveFileId: string) {
    this.operations.push(`deleteLivePendingIngestion:${driveFileId}:wizard_session_id IS NULL`);
    this.pendingIngestions.delete(driveFileId);
  }

  crewFlags(name: string): string[] | undefined {
    const show = this.shows.get("file-1");
    return show?.crewMembers?.find((m) => m.name === name)?.role_flags;
  }
}

async function runWith(
  tx: FakePhase2Tx,
  overrides: {
    modifiedTime: string;
    roleTokenMappings?: RoleTokenMapping[];
    priorParseWarnings?: ParseWarning[];
    parseResult?: ParseResult;
  },
) {
  vi.resetModules();
  const { runPhase2 } = await import("@/lib/sync/phase2");
  const args = {
    driveFileId: "file-1",
    mode: "cron" as const,
    fileMeta: fileMeta(overrides.modifiedTime),
    binding: { bindingToken: "token-1", modifiedTime: overrides.modifiedTime },
    parseResult: overrides.parseResult ?? parseResult(),
    ...(overrides.roleTokenMappings ? { roleTokenMappings: overrides.roleTokenMappings } : {}),
    ...(overrides.priorParseWarnings ? { priorParseWarnings: overrides.priorParseWarnings } : {}),
  };
  return runPhase2(tx as never, args);
}

describe("runPhase2 role-mapping overlay + delta gate (spec §6/§10)", () => {
  // Stamp maintenance (staging-overlay spec 2026-07-16 §3.5 / §7 item 17): every apply
  // persists shows_internal.applied_role_mappings = that apply's consumed-token stamp.
  test("wizard-style apply (staged stamp inside parseResult, no threaded mappings) persists the staged stamp", async () => {
    const tx = new FakePhase2Tx();
    const pr = parseResult({ warnings: [] });
    pr.appliedRoleMappings = [{ token: "DRONE OP", grants: ["A1"] }]; // staged at prepare
    await runWith(tx, { modifiedTime: "2026-07-16T10:00:00.000Z", parseResult: pr });
    expect((tx.showsInternal as { applied_role_mappings: unknown }).applied_role_mappings).toEqual([
      { token: "DRONE OP", grants: ["A1"] },
    ]);
  });

  test("live apply (threaded mappings consume the warning) persists phase2's own consumption", async () => {
    const tx = new FakePhase2Tx();
    await runWith(tx, {
      modifiedTime: "2026-07-16T10:00:00.000Z",
      roleTokenMappings: [MAPPING],
    });
    expect((tx.showsInternal as { applied_role_mappings: unknown }).applied_role_mappings).toEqual([
      { token: MAPPING.token, grants: MAPPING.grants },
    ]);
  });

  test("nothing consumed anywhere → applied_role_mappings persists null", async () => {
    const tx = new FakePhase2Tx();
    await runWith(tx, {
      modifiedTime: "2026-07-16T10:00:00.000Z",
      parseResult: parseResult({ warnings: [] }),
    });
    expect((tx.showsInternal as { applied_role_mappings: unknown }).applied_role_mappings).toBe(
      null,
    );
  });

  test("first publish (no prior warnings): grant unioned onto crew, warning consumed, appliedRoleMappings emits once", async () => {
    const tx = new FakePhase2Tx();
    const result = await runWith(tx, {
      modifiedTime: "2026-05-08T12:00:00.000Z",
      roleTokenMappings: [MAPPING],
    });
    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied") throw new Error("expected applied");
    // Grant landed on the persisted crew row (derived from MAPPING.grants).
    expect(tx.crewFlags("Marcus Webb")).toEqual(MAPPING.grants);
    // Mapped warning consumed — no UNKNOWN_ROLE_TOKEN remains in the carried warnings.
    expect((result.parseWarnings ?? []).filter((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toEqual([]);
    // Gate emits exactly one grouped entry for the token, newMemberCount = 1.
    expect(result.appliedRoleMappings).toEqual([
      { token: MAPPING.token, grants: MAPPING.grants, newMemberCount: 1 },
    ]);
  });

  test("recognize-only first publish (grants []): warning consumed, appliedRoleMappings emits once despite real prior crew [] + undefined prior warnings", async () => {
    // The real first-publish shape: applyShowSnapshot returns previousCrewMembers: []
    // (defined, empty) and priorParseWarnings is omitted (undefined). A recognize-only
    // mapping exercises the gate's warning branch — which the grants-branch test above
    // never reaches — and must still emit (spec §10 point 2: absent prior ⇒ new ⇒ emit).
    const tx = new FakePhase2Tx();
    const recognizeOnly: RoleTokenMapping = { ...MAPPING, grants: [] };
    const result = await runWith(tx, {
      modifiedTime: "2026-05-08T12:00:00.000Z",
      roleTokenMappings: [recognizeOnly],
    });
    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied") throw new Error("expected applied");
    // Recognize-only: no flags added, but the warning is consumed off the crew row.
    expect(tx.crewFlags("Marcus Webb")).toEqual([]);
    expect((result.parseWarnings ?? []).filter((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toEqual([]);
    expect(result.appliedRoleMappings).toEqual([
      { token: recognizeOnly.token, grants: [], newMemberCount: 1 },
    ]);
  });

  test("steady state (second sync, prior flags already carry the grant): appliedRoleMappings is silent", async () => {
    const tx = new FakePhase2Tx();
    const first = await runWith(tx, {
      modifiedTime: "2026-05-08T12:00:00.000Z",
      roleTokenMappings: [MAPPING],
    });
    if (first.outcome !== "applied") throw new Error("expected applied");
    // Second sync: SAME fixture + mapping; prior crew now persisted with the grant,
    // and prior warnings threaded from the first run's carried warnings.
    const second = await runWith(tx, {
      modifiedTime: "2026-05-08T13:00:00.000Z",
      roleTokenMappings: [MAPPING],
      priorParseWarnings: first.parseWarnings ?? [],
    });
    if (second.outcome !== "applied") throw new Error("expected applied");
    // Grant still applied (recomputed-from-sheet), but the gate is silent — steady state.
    expect(tx.crewFlags("Marcus Webb")).toEqual(MAPPING.grants);
    expect((second.parseWarnings ?? []).filter((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toEqual([]);
    expect(second.appliedRoleMappings).toEqual([]);
  });

  test("no mappings supplied: warning survives, no flags added, appliedRoleMappings empty", async () => {
    const tx = new FakePhase2Tx();
    const result = await runWith(tx, { modifiedTime: "2026-05-08T12:00:00.000Z" });
    if (result.outcome !== "applied") throw new Error("expected applied");
    expect(tx.crewFlags("Marcus Webb")).toEqual([]);
    expect(
      (result.parseWarnings ?? []).filter((w) => w.code === "UNKNOWN_ROLE_TOKEN"),
    ).toHaveLength(1);
    expect(result.appliedRoleMappings).toEqual([]);
  });

  // ── §10 point 7 lifecycle: emission = one event per appliedRoleMappings entry ──

  test("grants edit [A1] → [A1,V1]: next sync emits exactly once (V1 newly present)", async () => {
    const tx = new FakePhase2Tx();
    const first = await runWith(tx, {
      modifiedTime: "2026-05-08T12:00:00.000Z",
      roleTokenMappings: [MAPPING], // grants ["A1"]
    });
    if (first.outcome !== "applied") throw new Error("expected applied");
    expect(tx.crewFlags("Marcus Webb")).toEqual(["A1"]);

    const edited: RoleTokenMapping = { ...MAPPING, grants: ["A1", "V1"] };
    const second = await runWith(tx, {
      modifiedTime: "2026-05-08T13:00:00.000Z",
      roleTokenMappings: [edited],
      priorParseWarnings: first.parseWarnings ?? [],
    });
    if (second.outcome !== "applied") throw new Error("expected applied");
    // Prior flags already had A1; V1 is the newly-present grant → exactly one gate-passing entry.
    expect(second.appliedRoleMappings).toEqual([
      { token: edited.token, grants: edited.grants, newMemberCount: 1 },
    ]);
    expect(tx.crewFlags("Marcus Webb")).toEqual(["A1", "V1"]);
  });

  test("delete: next sync reverts the flag, the UNKNOWN_ROLE_TOKEN warning returns, appliedRoleMappings empty", async () => {
    const tx = new FakePhase2Tx();
    const first = await runWith(tx, {
      modifiedTime: "2026-05-08T12:00:00.000Z",
      roleTokenMappings: [MAPPING],
    });
    if (first.outcome !== "applied") throw new Error("expected applied");
    expect(tx.crewFlags("Marcus Webb")).toEqual(["A1"]);

    // Mapping deleted → no roleTokenMappings threaded. Flags recompute-from-sheet (revert to []),
    // the consumed warning re-surfaces, and nothing is gate-passing.
    const second = await runWith(tx, {
      modifiedTime: "2026-05-08T13:00:00.000Z",
      priorParseWarnings: first.parseWarnings ?? [],
    });
    if (second.outcome !== "applied") throw new Error("expected applied");
    expect(tx.crewFlags("Marcus Webb")).toEqual([]);
    expect(
      (second.parseWarnings ?? []).filter((w) => w.code === "UNKNOWN_ROLE_TOKEN"),
    ).toHaveLength(1);
    expect(second.appliedRoleMappings).toEqual([]);
  });

  test("e2e delta (spec §13): mapping applied to an existing crew row emits a ROLE_FLAGS_NOTICE change", async () => {
    // First publish WITHOUT the mapping: Marcus persisted with role_flags [] and the
    // UNKNOWN_ROLE_TOKEN warning survives (nothing consumed it).
    const tx = new FakePhase2Tx();
    const first = await runWith(tx, { modifiedTime: "2026-05-08T12:00:00.000Z" });
    if (first.outcome !== "applied") throw new Error("expected applied");
    expect(tx.crewFlags("Marcus Webb")).toEqual([]);

    // Second sync WITH the mapping: the overlay grants A1 onto the existing row, so the
    // crew diff sees prior [] → new [A1] and phase2 surfaces a ROLE_FLAGS_NOTICE delta on
    // the change feed (the existing non-lead role-flag-change notice path). The consumed
    // warning is absent and the granted flag lands — the full §13 e2e assertion.
    const second = await runWith(tx, {
      modifiedTime: "2026-05-08T13:00:00.000Z",
      roleTokenMappings: [MAPPING],
      priorParseWarnings: first.parseWarnings ?? [],
    });
    if (second.outcome !== "applied") throw new Error("expected applied");
    expect(tx.crewFlags("Marcus Webb")).toEqual(MAPPING.grants);
    expect((second.parseWarnings ?? []).filter((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toEqual([]);
    // ROLE_FLAGS_NOTICE carries the []→grants delta for the mapped member (derived from MAPPING).
    expect(second.roleFlagsNotice).toEqual({
      showId: "show-1",
      code: "ROLE_FLAGS_NOTICE",
      context: {
        drive_file_id: "file-1",
        changes: [{ crew_name: "Marcus Webb", prior_flags: [], new_flags: MAPPING.grants }],
      },
    });
  });

  test("stale outcome carries NO appliedRoleMappings (rollback emits nothing — §10 point 7)", async () => {
    const tx = new FakePhase2Tx();
    const first = await runWith(tx, {
      modifiedTime: "2026-05-08T13:00:00.000Z",
      roleTokenMappings: [MAPPING],
    });
    if (first.outcome !== "applied") throw new Error("expected applied");

    // A stale (older modifiedTime) re-run short-circuits before the applied arm — only the applied
    // arm carries appliedRoleMappings, so the emit surface reads nothing.
    const stale = await runWith(tx, {
      modifiedTime: "2026-05-08T12:00:00.000Z",
      roleTokenMappings: [MAPPING],
    });
    expect(stale.outcome).toBe("stale");
    expect("appliedRoleMappings" in stale).toBe(false);
  });
});
