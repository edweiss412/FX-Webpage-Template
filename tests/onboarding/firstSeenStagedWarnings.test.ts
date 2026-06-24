/**
 * tests/onboarding/firstSeenStagedWarnings.test.ts
 * (parse-data-quality-warnings Task 7 — P2 staged-review card surfacing)
 *
 * The live first-seen staged page hardcoded `warningSummary: ""` at the
 * StagedRow build site, hiding first-seen parse warnings (§6.1, R1 F1). This
 * pins the FIX: the row builder populates `warningSummary` + a structured
 * `dataGaps` summary from the staged row's `parse_result.warnings` /
 * `warning_summary`.
 *
 * Anti-tautology: the expected counts are DERIVED from the seeded warning array,
 * not the rendered card — `dataGaps` is asserted against `summarizeDataGaps` over
 * the same input the builder receives, and `warningSummary` against the
 * persisted `warning_summary` string.
 */
import { describe, expect, test } from "vitest";
import { stagedRowFromLiveFirstSeen } from "@/app/admin/show/staged/[stagedId]/page";
import { summarizeDataGaps } from "@/lib/parser/dataGaps";
import type { ParseWarning } from "@/lib/parser/types";

const STAGED = "33333333-3333-4333-8333-333333333333";

function liveRow(overrides: Record<string, unknown> = {}) {
  return {
    staged_id: STAGED,
    drive_file_id: "df-1",
    staged_modified_time: "2026-06-23T10:00:00.000Z",
    base_modified_time: null,
    parse_result: { show: { title: "Asset Mgmt Summit" }, warnings: [] as ParseWarning[] },
    warning_summary: "",
    triggered_review_items: [],
    source_kind: "cron" as const,
    ...overrides,
  };
}

describe("stagedRowFromLiveFirstSeen — P2 data-gap surfacing", () => {
  test("populates warningSummary + dataGaps from the staged row's parse warnings", () => {
    const warnings: ParseWarning[] = [
      { severity: "warn", code: "FIELD_UNREADABLE", message: "Crew phone unreadable" },
      { severity: "warn", code: "BLOCK_DISAPPEARED", message: "Hotel block vanished" },
    ];
    const row = liveRow({
      parse_result: { show: { title: "Asset Mgmt Summit" }, warnings },
      warning_summary: "Crew phone unreadable; Hotel block vanished",
    });

    const staged = stagedRowFromLiveFirstSeen(row);

    // warningSummary is the persisted joined string, NOT the hardcoded "".
    expect(staged.warningSummary).toBe("Crew phone unreadable; Hotel block vanished");
    // dataGaps derives from the SEEDED warnings array (the data source), not the card.
    expect(staged.dataGaps).toEqual(summarizeDataGaps(warnings));
    expect(staged.dataGaps?.total).toBe(2);
  });

  test("no warnings → empty warningSummary and total:0 dataGaps (no chip)", () => {
    const staged = stagedRowFromLiveFirstSeen(liveRow());
    expect(staged.warningSummary).toBe("");
    expect(staged.dataGaps?.total).toBe(0);
  });

  test("falls back to the warning array when warning_summary is empty but warnings exist", () => {
    // Defensive: a row whose warning_summary wasn't persisted still surfaces the
    // messages so a first-seen warning never silently disappears.
    const warnings: ParseWarning[] = [
      {
        severity: "warn",
        code: "UNKNOWN_SECTION_HEADER",
        message: "Unrecognized section CATERING",
      },
    ];
    const staged = stagedRowFromLiveFirstSeen(
      liveRow({
        parse_result: { show: { title: "X" }, warnings },
        warning_summary: "",
      }),
    );
    expect(staged.warningSummary).toContain("Unrecognized section CATERING");
    expect(staged.dataGaps?.total).toBe(1);
  });

  test("excludes severity:'info' warnings from the dataGaps count", () => {
    const warnings: ParseWarning[] = [
      { severity: "info", code: "FIELD_UNREADABLE", message: "info-only" },
      { severity: "warn", code: "FIELD_UNREADABLE", message: "real gap" },
    ];
    const staged = stagedRowFromLiveFirstSeen(
      liveRow({ parse_result: { show: { title: "X" }, warnings }, warning_summary: "real gap" }),
    );
    expect(staged.dataGaps?.total).toBe(1);
  });
});
