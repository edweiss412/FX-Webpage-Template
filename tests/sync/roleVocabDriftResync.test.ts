/**
 * Role-vocab mapping convergence (spec 2026-07-16-role-vocab-mapping-convergence).
 * Task 3 covers the threading layer: the drift-eligibility set flows through
 * ProcessOneFileDeps → prepareProcessOneFile → the gate opts, and the gate's
 * `driftResync` proceed flag is carried onto the "ready" prepared variant.
 *
 * Later tasks (in-lock recheck, Phase 2 stale guard, tick wiring, DB-bound e2e)
 * append their own top-level `describe` blocks to this file.
 */
import { describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type { ParsedSheet, ParseResult } from "@/lib/parser/types";
import type { Phase1Binding } from "@/lib/sync/phase1";
import type { PerFileProcessorResult, SyncMode } from "@/lib/sync/perFileProcessor";
import { prepareProcessOneFile, type ProcessOneFileDeps } from "@/lib/sync/runScheduledCronSync";

function fileMeta(id: string, modifiedTime = "2026-05-08T12:00:00.000Z"): DriveListedFile {
  return {
    driveFileId: id,
    name: `${id} Sheet`,
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime,
    parents: ["folder-1"],
    headRevisionId: "head-1",
  };
}

function parsedSheet(): ParsedSheet {
  return {
    show: {
      title: "Show",
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
    crewMembers: [
      {
        name: "Alice",
        email: "alice@example.com",
        phone: null,
        role: "A1",
        role_flags: ["A1"],
        date_restriction: { kind: "none" },
        stage_restriction: { kind: "none" },
        flight_info: null,
      },
    ],
    hotelReservations: [],
    rooms: [
      {
        kind: "gs",
        name: "General Session",
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
      },
    ],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    archivedPullSheetTabs: [],
    hardErrors: [],
  };
}

function parseResult(): ParseResult {
  return {
    ...parsedSheet(),
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
  };
}

/**
 * Minimal injected pipeline that carries `prepareProcessOneFile` to a "ready" result without any
 * Drive/DB I/O. `gate` stands in for `perFileProcessor`; the drift cases inject a gate that mirrors
 * Task 2's real behavior (cron + eligible → proceed with `driftResync`).
 */
function pipelineStubs(
  gate: (
    driveFileId: string,
    mode: SyncMode,
    fileMeta: DriveListedFile,
    opts?: { roleVocabDriftEligible?: boolean },
  ) => Promise<PerFileProcessorResult>,
): ProcessOneFileDeps {
  const binding: Phase1Binding = {
    bindingToken: "token-1",
    modifiedTime: "2026-05-08T12:00:00.000Z",
  };
  return {
    perFileProcessor: gate,
    captureBinding: vi.fn(async () => binding),
    fetchMarkdownAtRevision: vi.fn(async () => "# v4\nShow"),
    parseSheet: vi.fn(() => parsedSheet()),
    enrichWithDrivePins: vi.fn(async () => parseResult()),
    readShowPullSheetOverride: vi.fn(async () => null),
  };
}

/** Mirrors the shipped gate (perFileProcessor): cron + eligible + at-watermark → drift rescue. */
function driftAwareGate() {
  return vi.fn(
    async (
      _driveFileId: string,
      mode: SyncMode,
      _meta: DriveListedFile,
      opts?: { roleVocabDriftEligible?: boolean },
    ): Promise<PerFileProcessorResult> => {
      if (mode === "cron" && opts?.roleVocabDriftEligible === true) {
        return { outcome: "proceed", mode: "cron", driftResync: true };
      }
      return { outcome: "proceed", mode: mode === "push" ? "push" : mode };
    },
  );
}

describe("role-vocab drift resync threading (prepareProcessOneFile)", () => {
  test("cron: eligible set → gate receives roleVocabDriftEligible:true and ready carries driftResync", async () => {
    const gate = driftAwareGate();
    const prepared = await prepareProcessOneFile(
      "file-1",
      "cron",
      fileMeta("file-1"),
      { ...pipelineStubs(gate), roleVocabDriftEligibleIds: new Set(["file-1"]) },
      async () => null, // readCooldown: keep the cron cooldown check DB-free
    );

    expect(gate).toHaveBeenCalledWith("file-1", "cron", expect.anything(), {
      roleVocabDriftEligible: true,
    });
    expect(prepared.kind).toBe("ready");
    expect(prepared).toMatchObject({ kind: "ready", driftResync: true });
  });

  test("cron: file NOT in the set → gate receives roleVocabDriftEligible:false and no driftResync", async () => {
    const gate = driftAwareGate();
    const prepared = await prepareProcessOneFile(
      "file-1",
      "cron",
      fileMeta("file-1"),
      { ...pipelineStubs(gate), roleVocabDriftEligibleIds: new Set(["other-file"]) },
      async () => null,
    );

    expect(gate).toHaveBeenCalledWith("file-1", "cron", expect.anything(), {
      roleVocabDriftEligible: false,
    });
    expect(prepared.kind).toBe("ready");
    expect(prepared).not.toHaveProperty("driftResync");
  });

  test("cron: deps omits the set entirely → gate receives roleVocabDriftEligible:false, no driftResync", async () => {
    const gate = driftAwareGate();
    const prepared = await prepareProcessOneFile(
      "file-1",
      "cron",
      fileMeta("file-1"),
      pipelineStubs(gate),
      async () => null,
    );

    expect(gate).toHaveBeenCalledWith("file-1", "cron", expect.anything(), {
      roleVocabDriftEligible: false,
    });
    expect(prepared.kind).toBe("ready");
    expect(prepared).not.toHaveProperty("driftResync");
  });

  test.each(["manual", "push", "onboarding_scan"] as const)(
    "%s caller never marks driftResync even if a set is (defensively) present",
    async (mode) => {
      const gate = driftAwareGate();
      const prepared = await prepareProcessOneFile(
        "file-1",
        mode,
        fileMeta("file-1"),
        // A non-cron caller would never populate this, but even if it leaked in, the gate
        // ignores eligibility outside cron — the flag is computed and passed, driftResync stays off.
        { ...pipelineStubs(gate), roleVocabDriftEligibleIds: new Set(["file-1"]) },
        async () => null,
      );

      expect(gate).toHaveBeenCalledWith("file-1", mode, expect.anything(), {
        roleVocabDriftEligible: true,
      });
      expect(prepared.kind).toBe("ready");
      expect(prepared).not.toHaveProperty("driftResync");
    },
  );
});
