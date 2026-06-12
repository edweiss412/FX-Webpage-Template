import { describe, expect, test } from "vitest";
import { parseShadowPayloadForApply } from "@/lib/onboarding/shadowPayload";

const BASE = "2026-06-09T00:00:00.000Z";
const STAGED = "2026-06-10T12:00:00.000Z";
const MI11_ITEM = {
  id: "i-mi11",
  invariant: "MI-11",
  crew_name: "Ada",
  prior_email: "ada@old.com",
  new_email: "ada@new.com",
};

// Minimally-valid ParseResult (every non-optional field, mirroring lib/parser/types) —
// parseShadowPayloadForApply validates the FULL shape via asParseResult at this boundary,
// so a bare `{ show: { title: "T" } }` stub no longer passes.
function minimalParseResult() {
  return {
    show: {
      title: "T",
      client_label: "CL",
      dates: { showDays: ["2026-05-09"], set: "2026-05-08" },
    },
    crewMembers: [],
    hotelReservations: [],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    hardErrors: [],
  };
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    parse_result: minimalParseResult(),
    staged_modified_time: STAGED,
    staged_id: "44444444-4444-4444-8444-444444444444",
    reviewer_choices: [{ item_id: "i-mi11", action: "apply" }],
    triggered_review_items: [MI11_ITEM],
    base_modified_time: BASE,
    ...overrides,
  };
}

describe("parseShadowPayloadForApply (fail-closed identity gate)", () => {
  test("complete payload parses: items, base, mi11 extraction", () => {
    const parsed = parseShadowPayloadForApply(payload());
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) return;
    expect(parsed.triggeredReviewItems).toHaveLength(1);
    expect(parsed.mi11Items.map((i) => i.crew_name)).toEqual(["Ada"]);
    expect(parsed.baseModifiedTime).toBe(BASE);
  });

  test("MISSING triggered_review_items key is REFUSED, never coerced to [] (an MI-11 would apply ungated)", () => {
    const { triggered_review_items: _omit, ...rest } = payload();
    const parsed = parseShadowPayloadForApply(rest);
    expect(parsed).toEqual({ ok: false, code: "STAGED_REVIEW_ITEMS_CORRUPT" });
  });

  test("corrupt items value (object, double-encoded garbage) is REFUSED via parseTriggeredReviewItems", () => {
    const parsed = parseShadowPayloadForApply(
      payload({ triggered_review_items: { not: "an array" } }),
    );
    expect(parsed).toEqual({ ok: false, code: "STAGED_REVIEW_ITEMS_CORRUPT" });
  });

  test("missing base_modified_time is REFUSED as outdated (cannot prove baseline currency)", () => {
    const { base_modified_time: _omit, ...rest } = payload();
    const parsed = parseShadowPayloadForApply(rest);
    expect(parsed).toEqual({ ok: false, code: "STAGED_PARSE_OUTDATED_AT_PHASE_D" });
  });

  test("explicit jsonb-null base_modified_time is LEGAL (show had a null watermark at staging)", () => {
    const parsed = parseShadowPayloadForApply(payload({ base_modified_time: null }));
    expect(parsed).toMatchObject({ ok: true, baseModifiedTime: null });
  });

  test("MISSING/corrupt parse_result is REFUSED, never consumed-as-OK (the legacy branch's silent-success bug)", () => {
    // Concrete failure mode: the legacy applyShadow consumed a parse_result-less shadow
    // (deleteAppliedShadowRow + OK) — the damaged shadow DISAPPEARS during finalize-cas,
    // leaving stale live data with no retry surface and a success report.
    const { parse_result: _omit, ...rest } = payload();
    expect(parseShadowPayloadForApply(rest)).toEqual({
      ok: false,
      code: "STAGED_PARSE_RESULT_CORRUPT",
    });
    expect(parseShadowPayloadForApply(payload({ parse_result: "not-decodable-{{{" }))).toEqual({
      ok: false,
      code: "STAGED_PARSE_RESULT_CORRUPT",
    });
  });

  test("object-shaped-but-invalid parse_result ({}, {show:{}}) is REFUSED here, not deferred downstream", () => {
    // Concrete failure mode (whole-milestone HIGH): coerceJsonbObject alone only checks
    // object-SHAPE, so `{}` / `{ show: {} }` passed ok:true and finalize-cas dereferenced
    // parsed.parseResult.show.title → uncaught TypeError → route-level
    // ONBOARDING_FINALIZE_INTERNAL_ERROR instead of the per-row retained-row refusal.
    // One corrupt shadow blocked final publish AND hid the recovery path.
    expect(parseShadowPayloadForApply(payload({ parse_result: {} }))).toEqual({
      ok: false,
      code: "STAGED_PARSE_RESULT_CORRUPT",
    });
    expect(parseShadowPayloadForApply(payload({ parse_result: { show: {} } }))).toEqual({
      ok: false,
      code: "STAGED_PARSE_RESULT_CORRUPT",
    });
    // Legacy double-encoded-but-VALID parse_result still parses (asParseResult decodes it).
    expect(
      parseShadowPayloadForApply(payload({ parse_result: JSON.stringify(minimalParseResult()) })),
    ).toMatchObject({ ok: true });
  });

  test("missing staged_id or staged_modified_time is REFUSED (audit row + holds binding require both)", () => {
    const { staged_id: _a, ...noId } = payload();
    expect(parseShadowPayloadForApply(noId)).toEqual({
      ok: false,
      code: "STAGED_PARSE_RESULT_CORRUPT",
    });
    const { staged_modified_time: _b, ...noStaged } = payload();
    expect(parseShadowPayloadForApply(noStaged)).toEqual({
      ok: false,
      code: "STAGED_PARSE_RESULT_CORRUPT",
    });
  });

  // shows_pending_changes.payload is unconstrained jsonb beyond NOT NULL, so top-level JSON
  // null / arrays / scalars are representable. Concrete failure mode: one corrupt shadow
  // turning the whole finalize into an uncaught 500 instead of retained-row per-row recovery.
  test.each([
    ["null", null],
    ["string", "i-am-a-jsonb-string-scalar"],
    ["number", 42],
    ["boolean", true],
    ["array", [{ parse_result: {} }]],
  ])(
    "top-level %s payload yields the typed corrupt result, never an exception",
    (_label, topLevel) => {
      expect(parseShadowPayloadForApply(topLevel)).toEqual({
        ok: false,
        code: "STAGED_PARSE_RESULT_CORRUPT",
      });
    },
  );

  test("corrupt reviewer_choices (non-array object) is REFUSED, never re-stored raw", () => {
    expect(parseShadowPayloadForApply(payload({ reviewer_choices: { item_id: "x" } }))).toEqual({
      ok: false,
      code: "STAGED_PARSE_RESULT_CORRUPT",
    });
  });
});
