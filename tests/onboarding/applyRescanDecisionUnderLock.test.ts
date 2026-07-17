import { describe, expect, test, vi } from "vitest";

import { applyRescanDecisionUnderLock } from "@/lib/onboarding/applyRescanDecisionUnderLock";
import {
  PRIOR_APPROVER_UNATTRIBUTABLE,
  PRIOR_PARSE_UNREADABLE,
} from "@/lib/onboarding/rescanReviewCode";
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
function makeTx(
  priorRow: Record<string, unknown>,
  opts: { stagedReadbackEmpty?: boolean } = {},
): { tx: PostgresTransaction; calls: Captured[] } {
  const calls: Captured[] = [];
  const tx: PostgresTransaction = {
    async unsafe(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (/select\s+wizard_approved/i.test(sql) && /pending_syncs/i.test(sql)) {
        return [priorRow];
      }
      if (/select\s+staged_modified_time,\s*triggered_review_items/i.test(sql)) {
        // R4 MEDIUM: model a scan that reported 'staged' but whose row is no longer
        // readable (e.g. a superseding cleanup removed it) — the readback is empty.
        if (opts.stagedReadbackEmpty) return [];
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
      processed: [{ driveFileId: DRIVE, name: "rescan-file.xlsx", outcome: "staged" }],
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
    // Whole-diff R5 consistency pin: the SAME clean-restamp writes the manifest back to
    // 'applied' (for a non-blocker-heal), so wizard_approved=true and Step-3-checked
    // (manifest='applied') are set together under the lock — never a checked-but-unapproved
    // mismatch.
    const manifestApplied = calls.find(
      (c) =>
        /update\s+public\.onboarding_scan_manifest/i.test(c.sql) &&
        /status\s*=\s*'applied'/i.test(c.sql),
    );
    expect(manifestApplied, "clean restamp must also restore manifest='applied'").toBeTruthy();
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
    expect(out).toEqual({
      kind: "dirty_demoted",
      changed: true,
      reviewCodes: [PRIOR_APPROVER_UNATTRIBUTABLE],
    });
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

  // Failure mode (whole-diff R4 MEDIUM): the restage reports 'staged' but the row is
  // not readable back (a superseding cleanup removed it). The old `one(rows)` returned
  // `rows[0]!` — undefined on an empty set — so the next deref threw an uncaught
  // TypeError → empty 500. Must fail closed with a discriminated outcome instead.
  test("scan staged but row not readable back → not_staged (no uncaught throw)", async () => {
    const { tx } = makeTx(
      {
        wizard_approved: true,
        wizard_approved_by_email: "ada@x.example",
        parse_result: PRIOR_PARSE,
        staged_modified_time: PRIOR_MODTIME,
      },
      { stagedReadbackEmpty: true },
    );
    const out = await applyRescanDecisionUnderLock(
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
    expect(out).toEqual({ kind: "not_staged", code: expect.any(String) });
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
    expect(out).toEqual({ kind: "dirty_demoted", changed: true, reviewCodes: ["MI-12"] });

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

  // Failure mode: a future refactor that moves the shows_pending_changes delete without
  // moving the hook call, or that fires the hook on a retained-shadow path (would
  // double-consume the rebuild cap on a non-destructive outcome).
  test("onShadowDeleted fires once, on tx, for hard_failed (shadow-deleting outcome)", async () => {
    const { tx } = makeTx({
      wizard_approved: true,
      wizard_approved_by_email: "ada@x.example",
      parse_result: PRIOR_PARSE,
      staged_modified_time: PRIOR_MODTIME,
    });
    const onShadowDeleted = vi.fn(async (calledTx: PostgresTransaction) => {
      expect(calledTx).toBe(tx);
    });
    const hardFailedScan = (async () => ({
      outcome: "completed",
      processed: [{ driveFileId: DRIVE, outcome: "hard_failed" }],
    })) as never;
    await applyRescanDecisionUnderLock(
      tx,
      {
        wizardSessionId: WIZARD,
        driveFileId: DRIVE,
        pendingFolderId: FOLDER,
        prepared: preparedFor(PRIOR_PARSE),
        refreshedParse: PRIOR_PARSE,
        isBlockerHeal: true,
      },
      { scanOnboardingPreparedFiles: hardFailedScan, onShadowDeleted },
    );
    expect(onShadowDeleted).toHaveBeenCalledTimes(1);
  });

  // Failure mode: same as above, but for the main (dirty/clean) delete site — the three
  // dirty_demoted/clean_restamped/clean_unchecked outcomes all branch AFTER a single shared
  // shows_pending_changes delete, so this representative clean_restamped case covers the
  // shared call site for all three.
  test("onShadowDeleted fires once, on tx, for clean_restamped (main delete site)", async () => {
    const { tx } = makeTx({
      wizard_approved: true,
      wizard_approved_by_email: "ada@x.example",
      parse_result: PRIOR_PARSE,
      staged_modified_time: PRIOR_MODTIME,
    });
    const onShadowDeleted = vi.fn(async (calledTx: PostgresTransaction) => {
      expect(calledTx).toBe(tx);
    });
    const out = await applyRescanDecisionUnderLock(
      tx,
      {
        wizardSessionId: WIZARD,
        driveFileId: DRIVE,
        pendingFolderId: FOLDER,
        prepared: preparedFor(PRIOR_PARSE),
        refreshedParse: PRIOR_PARSE,
        isBlockerHeal: false,
      },
      { scanOnboardingPreparedFiles: stagedScan, onShadowDeleted },
    );
    expect(out).toEqual({ kind: "clean_restamped", changed: true });
    expect(onShadowDeleted).toHaveBeenCalledTimes(1);
  });

  // Failure mode: firing the hook on a shadow-RETAINING outcome would double-consume the
  // rebuild cap for a row whose pending_ingestions/onboarding_scan_manifest shadow row is
  // never deleted by this core.
  test("onShadowDeleted does NOT fire for schema_missing (shadow retained)", async () => {
    const { tx } = makeTx({
      wizard_approved: true,
      wizard_approved_by_email: "ada@x.example",
      parse_result: PRIOR_PARSE,
      staged_modified_time: PRIOR_MODTIME,
    });
    const onShadowDeleted = vi.fn();
    const schemaMissingScan = (async () => ({
      outcome: "schema_missing",
      code: "STAGED_PARSE_FAILED",
    })) as never;
    await applyRescanDecisionUnderLock(
      tx,
      {
        wizardSessionId: WIZARD,
        driveFileId: DRIVE,
        pendingFolderId: FOLDER,
        prepared: preparedFor(PRIOR_PARSE),
        refreshedParse: PRIOR_PARSE,
        isBlockerHeal: true,
      },
      { scanOnboardingPreparedFiles: schemaMissingScan, onShadowDeleted },
    );
    expect(onShadowDeleted).not.toHaveBeenCalled();
  });

  test("onShadowDeleted does NOT fire for superseded (shadow retained)", async () => {
    const { tx } = makeTx({
      wizard_approved: true,
      wizard_approved_by_email: "ada@x.example",
      parse_result: PRIOR_PARSE,
      staged_modified_time: PRIOR_MODTIME,
    });
    const onShadowDeleted = vi.fn();
    const supersededScan = (async () => ({ outcome: "superseded" })) as never;
    await applyRescanDecisionUnderLock(
      tx,
      {
        wizardSessionId: WIZARD,
        driveFileId: DRIVE,
        pendingFolderId: FOLDER,
        prepared: preparedFor(PRIOR_PARSE),
        refreshedParse: PRIOR_PARSE,
        isBlockerHeal: true,
      },
      { scanOnboardingPreparedFiles: supersededScan, onShadowDeleted },
    );
    expect(onShadowDeleted).not.toHaveBeenCalled();
  });

  test("onShadowDeleted does NOT fire for not_staged (readback empty, shadow retained)", async () => {
    const { tx } = makeTx(
      {
        wizard_approved: true,
        wizard_approved_by_email: "ada@x.example",
        parse_result: PRIOR_PARSE,
        staged_modified_time: PRIOR_MODTIME,
      },
      { stagedReadbackEmpty: true },
    );
    const onShadowDeleted = vi.fn();
    const out = await applyRescanDecisionUnderLock(
      tx,
      {
        wizardSessionId: WIZARD,
        driveFileId: DRIVE,
        pendingFolderId: FOLDER,
        prepared: preparedFor(PRIOR_PARSE),
        refreshedParse: PRIOR_PARSE,
        isBlockerHeal: false,
      },
      { scanOnboardingPreparedFiles: stagedScan, onShadowDeleted },
    );
    expect(out).toEqual({ kind: "not_staged", code: expect.any(String) });
    expect(onShadowDeleted).not.toHaveBeenCalled();
  });
});

// Telemetry cause (spec 2026-07-17 §4.2): every dirty_demoted carries `reviewCodes` naming
// the CAUSAL driver(s) — crew invariant(s), regressed gap class(es), and/or the corrupt-prior
// reasons — deduped, sentinels EXCLUDED. This is what makes a false "Sheet changed" demote
// diagnosable from `pnpm observe` instead of a DB probe.
describe("applyRescanDecisionUnderLock — dirty_demoted reviewCodes", () => {
  const archivedTab: ParseWarning[] = [
    { severity: "warn", code: "PULL_SHEET_ON_ARCHIVED_TAB", message: "pull sheet on OLD tab" },
  ];
  const reviewCodesOf = (out: unknown): string[] => {
    expect(out).toMatchObject({ kind: "dirty_demoted" });
    return (out as { reviewCodes: string[] }).reviewCodes;
  };

  // Failure mode: a gap-driven demote with no machine-readable cause (the exact PR #410
  // shape when the baseline IS present). Also proves sentinels are NOT a reviewCodes cause:
  // makeTx's staged readback always carries a sentinel MI-2, which must NOT appear.
  test("gap regression (present baseline, PULL_SHEET_ON_ARCHIVED_TAB 0→1) → gap class, sentinel excluded", async () => {
    const { tx } = makeTx({
      wizard_approved: true,
      wizard_approved_by_email: "ada@x.example",
      parse_result: PRIOR_PARSE, // present baseline, this class at 0
      staged_modified_time: PRIOR_MODTIME,
    });
    const refreshed = makeParse([{ name: "Ada Lovelace", email: "ada@x.example" }], archivedTab);
    const out = await applyRescanDecisionUnderLock(
      tx,
      {
        wizardSessionId: WIZARD,
        driveFileId: DRIVE,
        pendingFolderId: FOLDER,
        prepared: preparedFor(refreshed),
        refreshedParse: refreshed,
        isBlockerHeal: false,
      },
      { scanOnboardingPreparedFiles: stagedScan },
    );
    const rc = reviewCodesOf(out);
    expect(rc).toContain("PULL_SHEET_ON_ARCHIVED_TAB");
    expect(rc).not.toContain("MI-2"); // sentinel — persisted, but NOT a cause
  });

  // Failure mode: a corrupt-prior demote (previously-ready, prior parse unreadable) with no
  // cause token — indistinguishable in telemetry from a content regression.
  test("corrupt prior (priorReady + null parse) → PRIOR_PARSE_UNREADABLE", async () => {
    const { tx } = makeTx({
      wizard_approved: true, // priorReady
      wizard_approved_by_email: "ada@x.example", // attributable → only the parse clause fires
      parse_result: null, // unreadable prior
      staged_modified_time: PRIOR_MODTIME,
    });
    const refreshed = makeParse([{ name: "Ada Lovelace", email: "ada@x.example" }]);
    const out = await applyRescanDecisionUnderLock(
      tx,
      {
        wizardSessionId: WIZARD,
        driveFileId: DRIVE,
        pendingFolderId: FOLDER,
        prepared: preparedFor(refreshed),
        refreshedParse: refreshed,
        isBlockerHeal: false,
      },
      { scanOnboardingPreparedFiles: stagedScan },
    );
    expect(reviewCodesOf(out)).toEqual([PRIOR_PARSE_UNREADABLE]);
  });

  // Union + dedup: a crew change (MI-11 email) AND a gap regression co-occur → both named,
  // once each. Proves reviewCodes is a real union, not a single-cause overwrite.
  test("MI-11 email change + gap regression → both causes, deduped", async () => {
    const { tx } = makeTx({
      wizard_approved: true,
      wizard_approved_by_email: "ada@x.example",
      parse_result: PRIOR_PARSE,
      staged_modified_time: PRIOR_MODTIME,
    });
    const refreshed = makeParse([{ name: "Ada Lovelace", email: "ada-new@x.example" }], archivedTab);
    const out = await applyRescanDecisionUnderLock(
      tx,
      {
        wizardSessionId: WIZARD,
        driveFileId: DRIVE,
        pendingFolderId: FOLDER,
        prepared: preparedFor(refreshed),
        refreshedParse: refreshed,
        isBlockerHeal: false,
      },
      { scanOnboardingPreparedFiles: stagedScan },
    );
    const rc = reviewCodesOf(out);
    expect(rc).toContain("MI-11");
    expect(rc).toContain("PULL_SHEET_ON_ARCHIVED_TAB");
    expect(rc).toHaveLength(2); // no duplicates, no sentinel
  });
});
