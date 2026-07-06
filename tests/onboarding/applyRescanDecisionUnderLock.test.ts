import { describe, expect, test } from "vitest";

import { applyRescanDecisionUnderLock } from "@/lib/onboarding/applyRescanDecisionUnderLock";
import type { PostgresTransaction } from "@/lib/sync/runOnboardingScan";
import type { OnboardingScanResult, PreparedOnboardingFile } from "@/lib/sync/runOnboardingScan";
import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult, ParseWarning } from "@/lib/parser/types";

// Minimal valid v4 ParseResult fixture (mirrors tests/onboarding/rescanDecision.test.ts).
// crew + warnings are the only fields the rescan decision diffs against.
function makeParse(
  crew: Array<{ name: string; email: string }>,
  warnings: ParseWarning[] = [],
): ParseResult {
  return {
    show: {
      title: "Decision Fixture",
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
      po: "PO-1",
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: crew.map(({ name, email }) => ({
      name,
      email,
      phone: null,
      role: "A1",
      role_flags: [],
      date_restriction: { kind: "none" },
      stage_restriction: { kind: "none" },
      flight_info: null,
    })),
    hotelReservations: [],
    rooms: [
      {
        kind: "ballroom",
        name: "Main",
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
    warnings,
    hardErrors: [],
  } as unknown as ParseResult;
}

const WIZARD = "11111111-1111-1111-1111-111111111111";
const DRIVE = "D_SHEET";
const FOLDER = "F_PENDING";
const PRIOR_MODTIME = "2026-05-01T00:00:00.000Z";
const FRESH_MODTIME = "2026-05-02T00:00:00.000Z"; // differs from prior → `changed: true`
const SENTINEL_ID = "sentinel-item-abc"; // fresh blinded item id minted by the restage

// The prior parse the operator previously approved (one crew member, no gaps).
const PRIOR_PARSE = makeParse([{ name: "Ada Lovelace", email: "ada@x.example" }]);

function preparedFor(parse: ParseResult): Extract<PreparedOnboardingFile, { kind: "sheet" }> {
  return {
    file: { driveFileId: DRIVE, name: "sheet", modifiedTime: FRESH_MODTIME } as DriveListedFile,
    kind: "sheet",
    binding: {} as never,
    parseResult: parse,
    sourceAnchors: {},
  };
}

type Captured = { sql: string; params: unknown[] };

// Fake tx: records every executed SQL and answers the two SELECTs the core issues
// under the lock (prior-state capture + fresh-staged read-back). Every write returns [].
function makeTx(priorRow: Record<string, unknown>): { tx: PostgresTransaction; calls: Captured[] } {
  const calls: Captured[] = [];
  const tx: PostgresTransaction = {
    async unsafe(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (/select\s+wizard_approved/i.test(sql) && /pending_syncs/i.test(sql)) {
        return [priorRow];
      }
      if (/select\s+staged_modified_time,\s*triggered_review_items/i.test(sql)) {
        return [
          {
            staged_modified_time: FRESH_MODTIME,
            triggered_review_items: [{ id: SENTINEL_ID, invariant: "MI-2" }],
          },
        ];
      }
      if (/select\s+last_error_code/i.test(sql)) return [];
      return [];
    },
  };
  return { tx, calls };
}

// Injected restage: reports the single file staged cleanly WITHOUT touching the fake
// tx (real staging is exercised by the .db.test.ts suite; here we isolate the decision).
const stagedScan: (typeof import("@/lib/sync/runOnboardingScan"))["scanOnboardingPreparedFiles"] =
  (async () =>
    ({
      outcome: "completed",
      processed: [{ driveFileId: DRIVE, outcome: "staged" }],
    }) satisfies OnboardingScanResult) as never;

describe("applyRescanDecisionUnderLock", () => {
  // Failure mode: the extracted core writing app_settings / wizard_finalize_checkpoints /
  // acquiring an advisory lock would cross-transaction-deadlock finalize's outer tx
  // (which holds both FOR UPDATE on a separate connection) — spec §4.2.
  test("issues no app_settings / checkpoint / advisory-lock SQL (lock-safety invariant)", async () => {
    const { tx, calls } = makeTx({
      wizard_approved: true,
      wizard_approved_by_email: "ada@x.example",
      parse_result: PRIOR_PARSE,
      staged_modified_time: PRIOR_MODTIME,
    });
    await applyRescanDecisionUnderLock(
      tx,
      {
        wizardSessionId: WIZARD,
        driveFileId: DRIVE,
        pendingFolderId: FOLDER,
        prepared: preparedFor(PRIOR_PARSE),
        refreshedParse: PRIOR_PARSE,
        isBlockerHeal: false,
      },
      { scanOnboardingPreparedFiles: stagedScan },
    );
    expect(
      calls.some((c) => /app_settings|wizard_finalize_checkpoints|pg_advisory/i.test(c.sql)),
    ).toBe(false);
  });

  // Failure mode: a content-identical re-parse of a previously-approved row silently
  // dropping approval (should auto-keep) OR keeping stale choices keyed to deleted
  // item ids (EXTRA_REVIEWER_CHOICE 500 at finalize). Choices MUST be regenerated
  // from the FRESH sentinel item id, not hardcoded.
  test("clean + previously-ready → clean_restamped, re-stamps wizard_approved=true with regenerated choices", async () => {
    const { tx, calls } = makeTx({
      wizard_approved: true,
      wizard_approved_by_email: "ada@x.example",
      parse_result: PRIOR_PARSE,
      staged_modified_time: PRIOR_MODTIME,
    });
    const out = await applyRescanDecisionUnderLock(
      tx,
      {
        wizardSessionId: WIZARD,
        driveFileId: DRIVE,
        pendingFolderId: FOLDER,
        prepared: preparedFor(PRIOR_PARSE),
        refreshedParse: PRIOR_PARSE, // content-identical → CLEAN
        isBlockerHeal: false,
      },
      { scanOnboardingPreparedFiles: stagedScan },
    );
    expect(out).toEqual({ kind: "clean_restamped", changed: true });

    const restamp = calls.find(
      (c) =>
        /update\s+public\.pending_syncs/i.test(c.sql) && /wizard_approved\s*=\s*true/i.test(c.sql),
    );
    expect(restamp, "expected a wizard_approved=true re-stamp write").toBeTruthy();
    // choices are the $4 jsonb param — regenerated from the FRESH sentinel id (derived,
    // not hardcoded to a literal choice array).
    const choices = restamp!.params[3] as Array<{ item_id: string; action: string }>;
    expect(choices).toEqual([{ item_id: SENTINEL_ID, action: "apply" }]);
    // approver carried over from the prior row (non-null payload for the CHECK).
    expect(restamp!.params[2]).toBe("ada@x.example");
  });

  // Failure mode (whole-diff R2 MEDIUM): a previously-ready row (Flow B shadows
  // hardcode priorReady=true off a NULLABLE applied_by_email; a corrupt/legacy row
  // is the shape) whose approver email is NULL. Re-stamping wizard_approved=true with
  // a null approver violates pending_syncs_approved_requires_full_payload → the clean
  // re-scan 500s instead of a controlled outcome. The core must demote such a row to
  // RESCAN_REVIEW_REQUIRED (unattributable approval cannot be auto-restored).
  test("clean + previously-ready but NULL approver → dirty_demoted (no CHECK-violating re-stamp)", async () => {
    const { tx, calls } = makeTx({
      wizard_approved: true,
      wizard_approved_by_email: null, // ready but unattributed (corrupt/legacy)
      parse_result: PRIOR_PARSE,
      staged_modified_time: PRIOR_MODTIME,
    });
    const out = await applyRescanDecisionUnderLock(
      tx,
      {
        wizardSessionId: WIZARD,
        driveFileId: DRIVE,
        pendingFolderId: FOLDER,
        prepared: preparedFor(PRIOR_PARSE),
        refreshedParse: PRIOR_PARSE, // content-identical → would be CLEAN if attributable
        isBlockerHeal: false,
      },
      { scanOnboardingPreparedFiles: stagedScan },
    );
    expect(out).toEqual({ kind: "dirty_demoted", changed: true });
    // MUST NOT attempt an approved=true write with a null approver (the CHECK would 500).
    expect(
      calls.some((c) => /wizard_approved\s*=\s*true/i.test(c.sql)),
      "null-approver row must not be re-stamped approved=true",
    ).toBe(false);
    // Demotes with RESCAN_REVIEW_REQUIRED instead.
    const demote = calls.find(
      (c) =>
        /update\s+public\.pending_syncs/i.test(c.sql) &&
        (c.params as unknown[]).includes("RESCAN_REVIEW_REQUIRED"),
    );
    expect(demote, "expected a RESCAN_REVIEW_REQUIRED demotion").toBeTruthy();
  });

  // Failure mode: a decision-requiring crew change (MI-12 rename) being auto-kept.
  // Must demote to unapproved + RESCAN_REVIEW_REQUIRED so the operator re-reviews.
  test("dirty (MI-12 rename vs prior) → dirty_demoted, writes RESCAN_REVIEW_REQUIRED", async () => {
    const { tx, calls } = makeTx({
      wizard_approved: true,
      wizard_approved_by_email: "ada@x.example",
      parse_result: PRIOR_PARSE,
      staged_modified_time: PRIOR_MODTIME,
    });
    // same canonical email, changed name → MI-12 "probable rename" (multi-action → DIRTY).
    const dirtyParse = makeParse([{ name: "Ada L.", email: "ada@x.example" }]);
    const out = await applyRescanDecisionUnderLock(
      tx,
      {
        wizardSessionId: WIZARD,
        driveFileId: DRIVE,
        pendingFolderId: FOLDER,
        prepared: preparedFor(dirtyParse),
        refreshedParse: dirtyParse,
        isBlockerHeal: false,
      },
      { scanOnboardingPreparedFiles: stagedScan },
    );
    expect(out).toEqual({ kind: "dirty_demoted", changed: true });

    const demote = calls.find(
      (c) =>
        /update\s+public\.pending_syncs/i.test(c.sql) &&
        /wizard_approved\s*=\s*false/i.test(c.sql) &&
        (c.params as unknown[]).includes("RESCAN_REVIEW_REQUIRED"),
    );
    expect(demote, "expected a demote write carrying RESCAN_REVIEW_REQUIRED").toBeTruthy();
    // never re-stamps approval on the dirty path.
    expect(
      calls.some((c) => /wizard_approved\s*=\s*true/i.test(c.sql)),
      "dirty path must not re-stamp wizard_approved=true",
    ).toBe(false);
  });
});
