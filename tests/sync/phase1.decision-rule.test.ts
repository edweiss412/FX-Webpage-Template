/**
 * Phase 2 Task 2.1 — decision rule: route to auto-apply UNLESS MI-11 present.
 *
 * The old "stage if any MI fires" rule is narrowed: only the onboarding_scan
 * sentinel + the clean-first-seen FIRST_SEEN_REVIEW injection + hard_fail still
 * stage. Every other invariant (MI-6..MI-14 except MI-11) AND asset drift fall
 * through to pass/auto_publish_ready (notifications, never staged). An MI-11
 * item routes to the new `auto_apply_with_holds` outcome.
 */
import { describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type { CrewMemberRow, ParseResult } from "@/lib/parser/types";

type FakeShowRow = {
  showId?: string | null;
  driveFileId: string;
  lastSeenModifiedTime: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  priorParseResult: ParseResult;
  priorParseWarningsRaw: ParseResult["warnings"] | null;
};

function crew(name: string, overrides: Partial<CrewMemberRow> = {}): CrewMemberRow {
  return {
    name,
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    phone: null,
    role: "A1",
    role_flags: ["A1"],
    date_restriction: { kind: "none" },
    stage_restriction: { kind: "none" },
    flight_info: null,
    ...overrides,
  };
}

function room(name = "General Session") {
  return {
    kind: "gs" as const,
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

function hotel(ordinal: number) {
  return {
    ordinal,
    hotel_name: `Hotel ${ordinal}`,
    hotel_address: null,
    names: [],
    confirmation_no: null,
    check_in: null,
    check_out: null,
    notes: null,
  };
}

function contact(name: string) {
  return {
    kind: "venue" as const,
    name,
    email: `${name.toLowerCase()}@venue.example`,
    phone: null,
    notes: null,
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
      coi_status: "Pending",
      po: "PO-1",
      proposal: "Proposal-1",
      invoice: "Invoice-1",
      invoice_notes: "Notes",
    },
    crewMembers: [crew("Alice")],
    hotelReservations: [hotel(1)],
    rooms: [room()],
    transportation: null,
    contacts: [contact("Kurt")],
    pullSheet: [{ caseLabel: "A", items: [{ qty: 1, cat: null, subCat: null, item: "Cable" }] }],
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    hardErrors: [],
    ...overrides,
  };
}

function fileMeta(): DriveListedFile {
  return {
    driveFileId: "file-1",
    name: "Show Sheet",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    parents: ["folder-1"],
  };
}

class FakePhase1Tx {
  shows = new Map<string, FakeShowRow>();
  operations: string[] = [];
  shrinkHeldCalls: Array<{ driveFileId: string; payload: { message: string } }> = [];

  async readShowForPhase1(driveFileId: string) {
    this.operations.push(`readShow:${driveFileId}`);
    return this.shows.get(driveFileId) ?? null;
  }
  async readLivePendingSync() {
    this.operations.push(`readLivePendingSync`);
    return null;
  }
  async upsertLivePendingIngestion() {
    this.operations.push(`upsertLivePendingIngestion`);
  }
  async deleteLivePendingIngestion() {
    this.operations.push(`deleteLivePendingIngestion`);
  }
  async upsertLivePendingSync() {
    this.operations.push(`upsertLivePendingSync`);
    return { stagedId: "staged-1" };
  }
  async updateShowParseError() {
    this.operations.push(`updateShowParseError`);
  }
  async updateShowShrinkHeld(driveFileId: string, payload: { message: string }) {
    this.operations.push(`updateShowShrinkHeld`);
    this.shrinkHeldCalls.push({ driveFileId, payload });
  }
  async updateShowPendingReview() {
    this.operations.push(`updateShowPendingReview`);
  }
  async deleteWizardPendingSyncsExcept() {
    this.operations.push(`deleteWizardPendingSyncsExcept`);
  }
}

const baseArgs = {
  driveFileId: "file-1",
  mode: "cron" as const,
  fileMeta: fileMeta(),
  // modifiedTime is OLD (>MI8 debounce window in the past) so the debounce never fires.
  binding: { bindingToken: "token-1", modifiedTime: "2026-05-08T12:00:00.000Z" },
};

type FlagResult = { kind: "value"; autoPublish: boolean } | { kind: "infra_error" };
async function runWith(
  tx: FakePhase1Tx,
  next: ParseResult,
  overrides = {},
  deps: { getAutoPublishCleanFirstSeen?: () => Promise<FlagResult> } = {
    getAutoPublishCleanFirstSeen: async () => ({ kind: "value", autoPublish: true }),
  },
) {
  vi.resetModules();
  const { runPhase1 } = await import("@/lib/sync/phase1");
  return runPhase1(tx as never, { ...baseArgs, parseResult: next, ...overrides }, deps);
}

function seedPriorShow(tx: FakePhase1Tx, prior: ParseResult) {
  tx.shows.set("file-1", {
    showId: "show-1",
    driveFileId: "file-1",
    lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
    lastSyncStatus: "ok",
    lastSyncError: null,
    priorParseResult: prior,
    priorParseWarningsRaw: null,
  });
}

// N distinct crew rows (counts derived from array length, never a hardcoded magic total).
function crewList(count: number): CrewMemberRow[] {
  return Array.from({ length: count }, (_, i) => crew(`Crew ${i + 1}`));
}
// N distinct room rows (kind gs, distinct names → MI-7b keyable).
function roomList(count: number) {
  return Array.from({ length: count }, (_, i) => room(`Room ${i + 1}`));
}

describe("Phase 2 Task 2.1 — decision rule", () => {
  test("FYI-only parse (asset drift) routes to pass/auto-apply, never stages (PF34)", async () => {
    const tx = new FakePhase1Tx();
    seedPriorShow(tx, parseResult());
    // Both linked-folder drift + reel drift warnings → asset-drift review items via syncLayerReviewItems.
    const next = parseResult({
      warnings: [
        {
          severity: "warn",
          code: "DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING",
          message: "Linked folder drift detected",
        },
        {
          severity: "warn",
          code: "REEL_DRIFT_PENDING",
          message: "Reel drift detected",
        },
      ] as ParseResult["warnings"],
      openingReel: {
        driveFileId: "reel-1",
        drive_modified_time: "2026-05-08T10:00:00.000Z",
        headRevisionId: "rev-1",
        mimeType: "video/mp4",
      } as ParseResult["openingReel"],
    });

    const result = await runWith(tx, next);

    // Asset drift auto-applies — existing show → pass; never stages.
    expect(result.outcome).toBe("pass");
    expect(tx.operations).not.toContain("upsertLivePendingSync");
  });

  test("a parse containing an MI-11 item routes to auto_apply_with_holds, not whole-parse stage", async () => {
    const tx = new FakePhase1Tx();
    seedPriorShow(tx, parseResult({ crewMembers: [crew("Alice", { email: "alice@old" })] }));
    const next = parseResult({ crewMembers: [crew("Alice", { email: "alice@new" })] });

    const result = await runWith(tx, next);

    expect(result.outcome).toBe("auto_apply_with_holds");
    if (result.outcome !== "auto_apply_with_holds") throw new Error("unreachable");
    expect(result.mi11Items).toHaveLength(1);
    expect(result.mi11Items[0]).toMatchObject({
      invariant: "MI-11",
      crew_name: "Alice",
      prior_email: "alice@old",
      new_email: "alice@new",
    });
    expect(tx.operations).not.toContain("upsertLivePendingSync");
  });

  test("mixed MI-11 + benign FYI (asset drift): FYI auto-applies, MI-11 held, never wholesale-staged", async () => {
    // NB: a SECTION SHRINK is no longer a benign FYI — the re-sync quality gate now HOLDS on MI-7
    // (see the "material-shrink hold" suite below). This test uses asset drift (a genuine FYI) so
    // it still proves MI-11 partitions from a non-shrink notification → auto_apply_with_holds.
    const tx = new FakePhase1Tx();
    seedPriorShow(tx, parseResult({ crewMembers: [crew("Alice", { email: "alice@old" })] }));
    // MI-11 email change + benign asset-drift FYI (DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING).
    const next = parseResult({
      crewMembers: [crew("Alice", { email: "alice@new" })],
      warnings: [
        {
          severity: "warn",
          code: "DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING",
          message: "Linked folder drift detected",
        },
      ] as ParseResult["warnings"],
    });

    const result = await runWith(tx, next);

    expect(result.outcome).toBe("auto_apply_with_holds");
    if (result.outcome !== "auto_apply_with_holds") throw new Error("unreachable");
    // exactly the MI-11 items — the asset-drift FYI is NOT in mi11Items.
    expect(result.mi11Items.every((i) => i.invariant === "MI-11")).toBe(true);
    expect(result.mi11Items).toHaveLength(1);
    expect(tx.operations).not.toContain("upsertLivePendingSync");
  });

  test("first-seen sheet cannot stage on MI-11 (no prior snapshot); auto_publish_ready preserved", async () => {
    const tx = new FakePhase1Tx();
    // show=null (no seed). A first-seen sheet has no prior so MI-11 cannot fire.
    const next = parseResult({ crewMembers: [crew("Alice", { email: "alice@new" })] });

    const result = await runWith(tx, next);

    expect(result.outcome).toBe("auto_publish_ready");
    expect(tx.operations).not.toContain("upsertLivePendingSync");
  });

  test("clean-first-seen with auto-publish OFF still stages FIRST_SEEN_REVIEW (sentinel path intact)", async () => {
    const tx = new FakePhase1Tx();
    const next = parseResult();
    const result = await runWith(
      tx,
      next,
      {},
      {
        getAutoPublishCleanFirstSeen: async () => ({ kind: "value", autoPublish: false }),
      },
    );
    expect(result.outcome).toBe("stage");
    expect(tx.operations).toContain("upsertLivePendingSync");
  });

  test("onboarding_scan still stages via sentinel", async () => {
    const tx = new FakePhase1Tx();
    const result = await runWith(tx, parseResult(), {
      mode: "onboarding_scan",
      wizardSessionId: "22222222-2222-4222-8222-222222222222",
    });
    expect(result.outcome).toBe("stage");
    expect(tx.operations).toContain("upsertLivePendingSync");
  });
});

// Re-sync quality gate (audit finding #3): count-based MATERIAL shrinkage (MI-6 crew, MI-7 section)
// on an EXISTING published show HOLDS last-good instead of auto-clobbering. PF34 previously dropped
// MI-6/MI-7 to `pass` and applyParseResult full-replaced live rows; these assert the hold intercepts
// BEFORE pass, retains last-good (updateShowShrinkHeld only — no stage/apply), and reports the ACTUAL
// prior→next counts (not a generic "crew reduced"). Counts are derived from fixture array lengths.
describe("re-sync quality gate — material-shrink hold", () => {
  test("MI-6 crew shrink (cron) → shrink_held with real prior→next counts", async () => {
    const tx = new FakePhase1Tx();
    const prior = parseResult({ crewMembers: crewList(5) });
    seedPriorShow(tx, prior);
    const next = parseResult({ crewMembers: crewList(2) }); // crewDrop = 3 > 1 → MI-6

    const res = await runWith(tx, next);

    expect(res.outcome).toBe("shrink_held");
    if (res.outcome !== "shrink_held") throw new Error("unreachable");
    expect(res.heldModifiedTime).toBe(baseArgs.binding.modifiedTime);
    expect(res.showId).toBe("show-1");
    // Derived from fixture dimensions: prior.crewMembers.length → next.crewMembers.length ("5→2").
    expect(res.message).toContain(`${prior.crewMembers.length}→${next.crewMembers.length}`);
    expect(res.message.toLowerCase()).toContain("crew");
    expect(res.shrinkItems.some((i) => i.invariant === "MI-6")).toBe(true);
    // Retain last-good: only the hold write, never a stage/apply.
    expect(tx.operations).not.toContain("upsertLivePendingSync");
    expect(tx.shrinkHeldCalls).toEqual([
      { driveFileId: "file-1", payload: { message: res.message } },
    ]);
  });

  test("MI-7 section shrink (cron) → shrink_held; message carries the section's counts", async () => {
    const tx = new FakePhase1Tx();
    seedPriorShow(tx, parseResult({ rooms: roomList(4) }));
    const next = parseResult({ rooms: roomList(1) }); // nc(1) < pc(4)/2 → MI-7 rooms

    const res = await runWith(tx, next);

    expect(res.outcome).toBe("shrink_held");
    if (res.outcome !== "shrink_held") throw new Error("unreachable");
    expect(res.message).toContain("4→1"); // rooms prior_count→new_count from the MI-7 item
  });

  test("hold is mode-independent; only a VERSION-BOUND accept bypasses it", async () => {
    const prior = parseResult({ crewMembers: crewList(5) });
    const next = parseResult({ crewMembers: crewList(2) });

    // (a) manual, no accept → still holds (generic manual re-sync can't one-click-clobber).
    const txA = new FakePhase1Tx();
    seedPriorShow(txA, prior);
    expect((await runWith(txA, next, { mode: "manual" })).outcome).toBe("shrink_held");

    // (b) accept + matching expectedModifiedTime → applies (bypass).
    const txB = new FakePhase1Tx();
    seedPriorShow(txB, prior);
    const applied = await runWith(txB, next, {
      mode: "manual",
      acceptShrink: true,
      expectedModifiedTime: baseArgs.binding.modifiedTime,
    });
    expect(["pass", "auto_apply_with_holds"]).toContain(applied.outcome);
    expect(txB.shrinkHeldCalls).toEqual([]);

    // (c) accept + MISSING expectedModifiedTime → holds.
    const txC = new FakePhase1Tx();
    seedPriorShow(txC, prior);
    expect((await runWith(txC, next, { mode: "manual", acceptShrink: true })).outcome).toBe(
      "shrink_held",
    );

    // (d) accept + MISMATCHED (stale) expectedModifiedTime → holds with fresh counts.
    const txD = new FakePhase1Tx();
    seedPriorShow(txD, prior);
    const stale = await runWith(txD, next, {
      mode: "manual",
      acceptShrink: true,
      expectedModifiedTime: baseArgs.binding.modifiedTime,
      binding: { bindingToken: "token-2", modifiedTime: "2026-05-09T12:00:00.000Z" },
    });
    expect(stale.outcome).toBe("shrink_held");
  });

  test("MI-6 + MI-11 (cron) → shrink_held (no apply → no clobber, no ungated email)", async () => {
    const tx = new FakePhase1Tx();
    seedPriorShow(
      tx,
      parseResult({
        crewMembers: [
          crew("Alice", { email: "old@x" }),
          crew("Crew 2"),
          crew("Crew 3"),
          crew("Crew 4"),
          crew("Crew 5"),
        ],
      }),
    );
    const next = parseResult({
      crewMembers: [crew("Alice", { email: "new@x" }), crew("Crew 2")], // MI-6 + MI-11
    });

    const res = await runWith(tx, next);

    expect(res.outcome).toBe("shrink_held");
    expect(tx.operations).not.toContain("upsertLivePendingSync");
    expect(tx.operations).toContain("updateShowShrinkHeld");
  });

  test("benign drift unchanged: MI-11-only grows → auto_apply_with_holds; crewDrop==1 applies", async () => {
    // (a) MI-11 only + crew growth (5→6) → auto_apply_with_holds, NOT held.
    const txGrow = new FakePhase1Tx();
    seedPriorShow(
      txGrow,
      parseResult({
        crewMembers: [
          crew("Alice", { email: "old@x" }),
          crew("Crew 2"),
          crew("Crew 3"),
          crew("Crew 4"),
          crew("Crew 5"),
        ],
      }),
    );
    const grow = await runWith(
      txGrow,
      parseResult({
        crewMembers: [
          crew("Alice", { email: "new@x" }),
          crew("Crew 2"),
          crew("Crew 3"),
          crew("Crew 4"),
          crew("Crew 5"),
          crew("Crew 6"),
        ],
      }),
    );
    expect(grow.outcome).toBe("auto_apply_with_holds");
    expect(txGrow.shrinkHeldCalls).toEqual([]);

    // (b) crewDrop == 1 (5→4) → applies (drop is not > 1).
    const txDrop1 = new FakePhase1Tx();
    seedPriorShow(txDrop1, parseResult({ crewMembers: crewList(5) }));
    const drop1 = await runWith(txDrop1, parseResult({ crewMembers: crewList(4) }));
    expect(["pass", "auto_apply_with_holds"]).toContain(drop1.outcome);
    expect(txDrop1.shrinkHeldCalls).toEqual([]);
  });
});
