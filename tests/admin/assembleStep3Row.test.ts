/**
 * tests/admin/assembleStep3Row.test.ts
 *
 * Pins the FULL per-row Step-3 assembly — `buildStep3Row` plus the two
 * enrichment branches the wizard loop used to inline (clean-row parse/title,
 * hard-fail ingestion). The extraction exists so the seeded state gallery
 * (tests/admin/step3StateGallery.test.ts) can exercise the same executable
 * seam production renders from; `buildStep3Row` alone returns BEFORE both
 * enrichments, so a gallery assertion over it would be vacuous.
 *
 * Concrete failure mode caught: enrichment logic diverging from the
 * pre-extraction behavior — a parse attached to a non-clean row, or an
 * ingestion id attached without `hard_failed` (phantom blocking controls:
 * Step3Review.tsx renders HardFailedActions/HelpAffordance off
 * `row.pendingIngestionId`).
 */
import { describe, expect, test } from "vitest";
import { assembleStep3Row, type StagedPreviewForRow } from "@/lib/admin/assembleStep3Row";
import type { ParseResult } from "@/lib/parser/types";
import type { Step3ManifestStatus } from "@/components/admin/wizard/Step3Review";

const mani = (over: Partial<{ status: Step3ManifestStatus }> & Record<string, unknown> = {}) => ({
  drive_file_id: "dfid-1",
  status: "staged" as Step3ManifestStatus,
  name: "Mani Name",
  publish_intent: null,
  created_show_id: null,
  wizard_session_id: "00000000-0000-0000-0000-000000000001",
  ...over,
});

// Shape mirrors the stagedByDfid value type verbatim (OnboardingWizard.tsx:534-546):
// stagedId + lastFinalizeFailureCode are REQUIRED; sourceAnchors is a non-null
// Record (empty object, never null).
const stagedFor = (title: string, stagedId: string): StagedPreviewForRow => ({
  stagedId,
  title,
  parseResult: { show: { title }, warnings: [] } as unknown as ParseResult,
  sourceAnchors: {},
  adminAgendaPreview: [],
  agendaStateKey: "k",
  lastFinalizeFailureCode: null,
  useRawDecisions: [],
  ignoredWarnings: null,
});

describe("assembleStep3Row (mechanical extraction of the OnboardingWizard loop body)", () => {
  test("clean staged row gets parseResult + stagedShowTitle enrichment", () => {
    const staged = stagedFor("Parsed Title", "st-1");
    const row = assembleStep3Row(mani({}), null, [], staged, undefined, "s1");
    expect(row.parseResult).toBe(staged.parseResult);
    expect(row.stagedShowTitle).toBe("Parsed Title");
    expect(row.agendaStateKey).toBe("k");
  });

  test("applied row is a clean review row too (checked card keeps its preview)", () => {
    const staged = stagedFor("Applied Title", "st-a");
    const row = assembleStep3Row(mani({ status: "applied" }), null, [], staged, undefined, "s1");
    expect(row.parseResult).toBe(staged.parseResult);
    expect(row.stagedShowTitle).toBe("Applied Title");
  });

  test("hard_failed row gets pendingIngestionId + errorCode", () => {
    const row = assembleStep3Row(
      mani({ status: "hard_failed" }),
      null,
      [],
      undefined,
      { id: "ing-1", code: "STAGED_PARSE_FAILED" },
      "s1",
    );
    expect(row.pendingIngestionId).toBe("ing-1");
    expect(row.errorCode).toBe("STAGED_PARSE_FAILED");
  });

  test("hard_failed row WITHOUT ingestion stays bare (no phantom controls)", () => {
    const row = assembleStep3Row(
      mani({ status: "hard_failed" }),
      null,
      [],
      undefined,
      undefined,
      "s1",
    );
    expect(row.pendingIngestionId).toBeUndefined();
    expect(row.errorCode).toBeUndefined();
  });

  test("NEGATIVE GATE: clean row ignores a supplied ingestion; hard_failed ignores supplied staged", () => {
    // Kills the attach-everything mutant the positive cases cannot see.
    const staged = stagedFor("T", "st-2");
    const clean = assembleStep3Row(mani(), null, [], staged, { id: "ing-x", code: null }, "s1");
    expect(clean.pendingIngestionId).toBeUndefined(); // ingestion gated to hard_failed only
    const hard = assembleStep3Row(
      mani({ status: "hard_failed" }),
      null,
      [],
      staged,
      { id: "ing-1", code: null },
      "s1",
    );
    expect(hard.parseResult).toBeUndefined(); // parse enrichment gated to clean rows only
    expect(hard.pendingIngestionId).toBe("ing-1");
    expect(hard.errorCode).toBeUndefined(); // a null ingestion code attaches nothing
  });

  test("manifest with a null wizard_session_id falls back to the session argument", () => {
    // Pins the coercion the wizard loop performed at its call site
    // (OnboardingWizard.tsx:611) so the linked-show session-provenance join keeps
    // comparing against a real session id, never null.
    const row = assembleStep3Row(
      mani({ wizard_session_id: null, created_show_id: "show-1" }),
      null,
      [
        {
          id: "show-1",
          drive_file_id: "dfid-1",
          published: true,
          archived: false,
          wizard_created_session_id: "s1",
        },
      ],
      undefined,
      undefined,
      "s1",
    );
    expect(row.sessionLinked).toBe(true);
    expect(row.linkedShow).toEqual({ published: true, archived: false });
  });
});

/**
 * wizard-warning-ignore-controls spec §2.1 Phase A — Task 3.
 *
 * The enrichment pass (Phase B) forks on `linkedShowRef`: present means the row
 * reads durable ignores through the slug-keyed routes, absent means it reads the
 * staged column. A candidate whose `slug` is missing must therefore degrade to
 * the staged arm rather than mint a route target that 404s (spec §3, the
 * "candidate without a usable string slug" guard row).
 */
describe("assembleStep3Row — linked-show identity capture (§2.1 Phase A)", () => {
  const candidate = (over: Record<string, unknown> = {}) => ({
    id: "show-1",
    drive_file_id: "dfid-1",
    published: true,
    archived: false,
    wizard_created_session_id: "s1",
    slug: "east-coast-2026",
    ...over,
  });

  test("session-provenance branch captures the winning candidate's id and slug", () => {
    const row = assembleStep3Row(
      mani({ wizard_session_id: null, created_show_id: "show-1" }),
      null,
      [candidate()],
      undefined,
      undefined,
      "s1",
    );
    expect(row.sessionLinked).toBe(true);
    expect(row.linkedShowRef).toEqual({ id: "show-1", slug: "east-coast-2026" });
  });

  test("existing-show branch captures the same identity", () => {
    const row = assembleStep3Row(
      mani({ created_show_id: null }),
      null,
      [candidate({ id: "show-2", wizard_created_session_id: "some-other-session", slug: "rpas" })],
      undefined,
      undefined,
      "s1",
    );
    expect(row.sessionLinked).toBe(false);
    expect(row.linkedShowRef).toEqual({ id: "show-2", slug: "rpas" });
  });

  test.each([
    ["null slug", { slug: null }],
    ["missing slug", { slug: undefined }],
    ["empty slug", { slug: "" }],
    ["whitespace-only slug", { slug: "   " }],
    ["non-string slug", { slug: 7 as unknown as string }],
  ])("a matched candidate with a %s yields no linkedShowRef", (_label, over) => {
    const row = assembleStep3Row(
      mani({ wizard_session_id: null, created_show_id: "show-1" }),
      null,
      [candidate(over)],
      undefined,
      undefined,
      "s1",
    );
    // The candidate still WON resolution — the row is linked, only the ref is absent.
    expect(row.linkedShow).toEqual({ published: true, archived: false });
    expect(row.linkedShowRef ?? null).toBeNull();
  });

  test("no matching candidate yields no linkedShowRef", () => {
    const row = assembleStep3Row(mani({}), null, [], undefined, undefined, "s1");
    expect(row.linkedShow).toBeNull();
    expect(row.linkedShowRef ?? null).toBeNull();
  });
});

describe("assembleStep3Row — staged ignored_warnings pass-through (§2.1 Phase B input)", () => {
  const RAW = [{ fingerprint: "x", code: "C", ignored_by: "a@b.c" }];

  test("a clean row carries the raw column value through untouched", () => {
    const staged = stagedFor("Parsed Title", "st-1");
    const row = assembleStep3Row(
      mani({}),
      null,
      [],
      { ...staged, ignoredWarnings: RAW },
      undefined,
      "s1",
    );
    // Reference identity: the assembly must NOT normalize here — normalization is
    // enrichment's job (Task 4), and a copy made at this hop could drift from it.
    expect(row.stagedIgnoredWarnings).toBe(RAW);
  });

  test("a malformed column value passes through un-coerced (no throw at this hop)", () => {
    const staged = stagedFor("Parsed Title", "st-1");
    const row = assembleStep3Row(
      mani({}),
      null,
      [],
      { ...staged, ignoredWarnings: "not-an-array" },
      undefined,
      "s1",
    );
    expect(row.stagedIgnoredWarnings).toBe("not-an-array");
  });
});
