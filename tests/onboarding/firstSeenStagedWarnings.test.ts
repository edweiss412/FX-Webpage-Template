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

    // warningSummary is built from the DATA-QUALITY warnings array (data source),
    // NOT the hardcoded "" and NOT the pre-joined persisted string (R1 [high]).
    // FIELD_UNREADABLE is operator-actionable-anchored, so it renders via
    // operatorActionable (titled card + deep link) and is EXCLUDED from this flat
    // summary line (audit idx90/#154 — no double-render). Only the non-actionable
    // data-gap (BLOCK_DISAPPEARED) remains in the summary.
    expect(staged.warningSummary).toBe("Hotel block vanished");
    // dataGaps derives from the SEEDED warnings array (the data source), not the card,
    // and is UNCHANGED by the summary exclusion (it still counts FIELD_UNREADABLE).
    expect(staged.dataGaps).toEqual(summarizeDataGaps(warnings));
    expect(staged.dataGaps?.total).toBe(2);
  });

  // audit idx90/#154: FIELD_UNREADABLE is in BOTH the data-gap set AND
  // OPERATOR_ACTIONABLE_ANCHORED. It surfaces as a titled actionable card (with a
  // deep link) via `operatorActionable`; it must therefore be EXCLUDED from the flat
  // `warningSummary` line so the staged card does not double-render it. Mirrors the
  // per-show digest at app/admin/show/[slug]/page.tsx (isDataQualityWarning &&
  // !OPERATOR_ACTIONABLE_ANCHORED.has(code)).
  test("excludes operator-actionable codes (FIELD_UNREADABLE) from warningSummary; they surface only via operatorActionable", () => {
    const warnings: ParseWarning[] = [
      { severity: "warn", code: "FIELD_UNREADABLE", message: "Crew phone unreadable" },
      { severity: "warn", code: "BLOCK_DISAPPEARED", message: "Hotel block vanished" },
    ];
    const staged = stagedRowFromLiveFirstSeen(
      liveRow({ parse_result: { show: { title: "X" }, warnings } }),
    );
    // FIELD_UNREADABLE is surfaced ONCE, via the actionable list (titled card + link).
    expect(staged.operatorActionable?.some((w) => w.code === "FIELD_UNREADABLE")).toBe(true);
    // …and NOT also in the flat summary line (no double-render).
    expect(staged.warningSummary).not.toContain("Crew phone unreadable");
    // A non-actionable data-gap (BLOCK_DISAPPEARED) still appears in the summary.
    expect(staged.warningSummary).toContain("Hotel block vanished");
    // The data-gap COUNT is unchanged (still counts FIELD_UNREADABLE).
    expect(staged.dataGaps?.total).toBe(2);
  });

  // Whole-diff review R1 [high] class-sweep: the staged card must NOT surface a raw
  // §12.4 code. The pre-joined phase1 `warning_summary` can contain a non-DQ warn
  // warning whose .message IS the raw code (asset reelWarning()); we ignore that string
  // and build only from the DATA-QUALITY warnings, so no raw code can leak (invariant 5).
  test("ignores the persisted warning_summary and excludes a non-DQ raw-code warning", () => {
    const warnings: ParseWarning[] = [
      // A non-actionable DQ code (survives the summary) is the control here — the
      // former FIELD_UNREADABLE control now renders only via operatorActionable
      // (audit idx90/#154), so use BLOCK_DISAPPEARED to isolate the raw-code check.
      { severity: "warn", code: "BLOCK_DISAPPEARED", message: "Hotel block vanished" },
      // reelWarning() shape: non-DQ, message === code.
      { severity: "warn", code: "OPENING_REEL_UNREADABLE", message: "OPENING_REEL_UNREADABLE" },
    ];
    const staged = stagedRowFromLiveFirstSeen(
      liveRow({
        parse_result: { show: { title: "X" }, warnings },
        // A persisted summary that DOES contain the raw code — must be ignored.
        warning_summary: "Hotel block vanished; OPENING_REEL_UNREADABLE",
      }),
    );
    expect(staged.warningSummary).toBe("Hotel block vanished");
    expect(staged.warningSummary).not.toContain("OPENING_REEL_UNREADABLE");
    expect(staged.dataGaps?.total).toBe(1);
  });

  // Flow 6 6.4 [whole-diff R3 HIGH]: VENUE_GEOCODE_UNRESOLVED is a non-actionable
  // DQ gap code, so it DOES surface in warningSummary — via its PLAIN message, never
  // the raw §12.4 code literal (invariant 5).
  test("surfaces VENUE_GEOCODE_UNRESOLVED as plain language, never the raw code", () => {
    const warnings: ParseWarning[] = [
      {
        severity: "warn",
        code: "VENUE_GEOCODE_UNRESOLVED",
        message: "Couldn't look up the venue city from its address",
      },
    ];
    const staged = stagedRowFromLiveFirstSeen(
      liveRow({ parse_result: { show: { title: "X" }, warnings } }),
    );
    expect(staged.warningSummary).toBe("Couldn't look up the venue city from its address");
    expect(staged.warningSummary).not.toContain("VENUE_GEOCODE_UNRESOLVED");
    expect(staged.dataGaps?.total).toBe(1);
  });

  // audit idx45/#217: the staged surface must route its operator-actionable read
  // through selectActionableForDisplay (which applies stripLegacyUnknownFieldAnchors
  // BEFORE filter+dedup), matching the per-show surface. Two LEGACY UNKNOWN_FIELD
  // warnings carrying a stale block-RANGE anchor (a1 contains ":") would, via the bare
  // operatorActionableWarnings path, collapse to ONE row (shared a1 dedup) AND keep the
  // wrong block-header deep link. The shim clears the stale anchor so both distinct rows
  // survive (count corrects) and neither carries a wrong link.
  test("routes operatorActionable through the legacy-anchor shim (selectActionableForDisplay)", () => {
    const legacyAnchor = { title: "INFO", gid: 7, a1: "A1:D5" }; // block RANGE (contains ":")
    const warnings: ParseWarning[] = [
      {
        severity: "warn",
        code: "UNKNOWN_FIELD",
        message: "Unrecognized INFO row label: 'Podium'",
        rawSnippet: "Podium | (2)",
        sourceCell: legacyAnchor,
      },
      {
        severity: "warn",
        code: "UNKNOWN_FIELD",
        message: "Unrecognized INFO row label: 'Riser'",
        rawSnippet: "Riser | (1)",
        sourceCell: legacyAnchor,
      },
    ];
    const staged = stagedRowFromLiveFirstSeen(
      liveRow({ parse_result: { show: { title: "X" }, warnings } }),
    );
    // Shim strips the stale block-range anchor → both distinct legacy rows survive
    // (bare operatorActionableWarnings would dedup them to ONE by their shared a1).
    expect(staged.operatorActionable).toHaveLength(2);
    // …and neither keeps the wrong block-header deep link (sourceCell cleared to null).
    expect(staged.operatorActionable?.every((w) => w.sourceCell == null)).toBe(true);
  });

  test("no warnings → empty warningSummary and total:0 dataGaps (no chip)", () => {
    const staged = stagedRowFromLiveFirstSeen(liveRow());
    expect(staged.warningSummary).toBe("");
    expect(staged.dataGaps?.total).toBe(0);
  });

  test("builds from the warning array even when warning_summary is empty", () => {
    // A row whose warning_summary wasn't persisted still surfaces the DQ messages
    // (we always build from the warnings array), so a first-seen gap never disappears.
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
