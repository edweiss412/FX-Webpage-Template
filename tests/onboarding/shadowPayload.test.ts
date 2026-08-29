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

  test("F1 — use_raw_decisions in the payload round-trips to parsed.useRawDecisions (existing-show shadow carry)", () => {
    // The F1 bug: Flow B deletes pending_syncs in Phase B, so finalize-cas re-reading the decisions
    // from pending_syncs at Phase D always got [] — an existing show published the parsed value
    // despite the admin toggle. The fix carries the decisions IN the shadow payload; this proves the
    // parse boundary surfaces them so applyShadow can feed them into the runPhase2 overlay.
    const decision = {
      code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
      contentHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      target: { kind: "rooms", name: "GENERAL SESSION" },
      preference: "raw",
      applied: false,
      decidedAt: "2026-07-11T00:00:00.000Z",
      decidedBy: "admin@example.com",
    };
    const parsed = parseShadowPayloadForApply(payload({ use_raw_decisions: [decision] }));
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) return;
    expect(parsed.useRawDecisions).toHaveLength(1);
    expect(parsed.useRawDecisions[0]).toMatchObject({
      code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
      contentHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      preference: "raw",
      applied: false,
    });
  });

  test("F1 — absent use_raw_decisions → [] (legacy/new-show shadows; overlay no-op, never a refusal)", () => {
    const parsed = parseShadowPayloadForApply(payload());
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) return;
    expect(parsed.useRawDecisions).toEqual([]);
  });

  test("F1 — malformed use_raw_decisions is tolerated → [] (never blocks an otherwise-valid publish)", () => {
    const parsed = parseShadowPayloadForApply(payload({ use_raw_decisions: "not-an-array" }));
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) return;
    expect(parsed.useRawDecisions).toEqual([]);
  });

  // ── wizard-warning-ignore-controls §2.7: staged ignore decisions ride the same channel ──
  // The route writer is private SQL and cannot be invoked from a unit, so these cases pin
  // the PARSER against the key set that writer emits. The two real-DB pipeline proofs in
  // tests/sync/stagedIgnoreCarry.test.ts are what actually prove the writer; these
  // supplement them, they do not replace them.
  test("ignored_warnings in the payload round-trips to parsed.ignoredWarnings", () => {
    const parsed = parseShadowPayloadForApply(
      payload({
        ignored_warnings: [
          { fingerprint: "fp-1", code: "UNKNOWN_FIELD", ignored_by: "doug@fxav.com" },
        ],
      }),
    );
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) return;
    expect(parsed.ignoredWarnings).toEqual([
      { fingerprint: "fp-1", code: "UNKNOWN_FIELD", ignored_by: "doug@fxav.com" },
    ]);
  });

  test("ignored_warnings sits beside use_raw_decisions in a full writer-shaped payload", () => {
    // The writer emits both in one jsonb_build_object; a parser that reads one key and
    // shadows the other would pass every single-key case above.
    const parsed = parseShadowPayloadForApply(
      payload({
        use_raw_decisions: [
          {
            code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
            contentHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
            target: { kind: "rooms", name: "GENERAL SESSION" },
            preference: "raw",
            applied: false,
            decidedAt: "2026-07-11T00:00:00.000Z",
            decidedBy: "admin@example.com",
          },
        ],
        source_anchors: {},
        pull_sheet_override: null,
        ignored_warnings: [
          { fingerprint: "fp-1", code: "UNKNOWN_FIELD", ignored_by: "doug@fxav.com" },
        ],
      }),
    );
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) return;
    expect(parsed.useRawDecisions).toHaveLength(1);
    expect(parsed.ignoredWarnings).toHaveLength(1);
  });

  test("absent ignored_warnings → [] (legacy shadows staged before this feature)", () => {
    const parsed = parseShadowPayloadForApply(payload());
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) return;
    expect(parsed.ignoredWarnings).toEqual([]);
  });

  test("malformed ignored_warnings is tolerated → [] (never blocks an otherwise-valid publish)", () => {
    const parsed = parseShadowPayloadForApply(payload({ ignored_warnings: "not-an-array" }));
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) return;
    expect(parsed.ignoredWarnings).toEqual([]);
  });

  test("MISSING triggered_review_items key is REFUSED, never coerced to [] (an MI-11 would apply ungated)", () => {
    const { triggered_review_items: _omit, ...rest } = payload();
    const parsed = parseShadowPayloadForApply(rest);
    expect(parsed).toEqual({
      ok: false,
      code: "STAGED_REVIEW_ITEMS_CORRUPT",
      reason: "review_items_invalid",
    });
  });

  test("corrupt items value (object, double-encoded garbage) is REFUSED via parseTriggeredReviewItems", () => {
    const parsed = parseShadowPayloadForApply(
      payload({ triggered_review_items: { not: "an array" } }),
    );
    expect(parsed).toEqual({
      ok: false,
      code: "STAGED_REVIEW_ITEMS_CORRUPT",
      reason: "review_items_invalid",
    });
  });

  // WM-R5: element-level validation — same class as the WM-R4 reviewer_choices fix, on
  // the item side. A bare array cast let `[null]` reach the mi11 filter's `item.invariant`
  // deref (and the core's deriveAuthSideEffects name derefs), turning one malformed
  // retained shadow into a batch-blocking ONBOARDING_FINALIZE_INTERNAL_ERROR instead of
  // the per-row STAGED_REVIEW_ITEMS_CORRUPT recovery path.
  test.each([
    ["null element", [null]],
    ["scalar element", ["x"]],
    ["empty object element", [{}]],
    [
      "missing id",
      [{ invariant: "MI-11", crew_name: "Ada", prior_email: null, new_email: "a@b.c" }],
    ],
    ["non-string invariant", [{ id: "i1", invariant: 7 }]],
    [
      "MI-11 missing crew_name",
      [{ id: "i1", invariant: "MI-11", prior_email: null, new_email: "a@b.c" }],
    ],
    ["MI-12 missing added_name", [{ id: "i1", invariant: "MI-12", removed_name: "Old" }]],
    ["MI-13-orphan-remove missing removed_name", [{ id: "i1", invariant: "MI-13-orphan-remove" }]],
    [
      "mixed valid + invalid",
      [
        { id: "i1", invariant: "MI-11", crew_name: "Ada", prior_email: null, new_email: "a@b.c" },
        null,
      ],
    ],
  ])(
    "malformed triggered_review_items element (%s) is REFUSED, never thrown on",
    (_label, items) => {
      const parsed = parseShadowPayloadForApply(payload({ triggered_review_items: items }));
      expect(parsed).toEqual({
        ok: false,
        code: "STAGED_REVIEW_ITEMS_CORRUPT",
        reason: "review_items_invalid",
      });
    },
  );

  test("unknown invariant string with string id/invariant is ACCEPTED (allowedActions is total; forward-compat)", () => {
    const parsed = parseShadowPayloadForApply(
      payload({ triggered_review_items: [{ id: "i9", invariant: "MI-99-future" }] }),
    );
    expect(parsed).toMatchObject({ ok: true });
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
      reason: "parse_result_absent",
    });
    expect(parseShadowPayloadForApply(payload({ parse_result: "not-decodable-{{{" }))).toEqual({
      ok: false,
      code: "STAGED_PARSE_RESULT_CORRUPT",
      reason: "parse_result_shape_invalid",
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
      reason: "parse_result_shape_invalid",
    });
    expect(parseShadowPayloadForApply(payload({ parse_result: { show: {} } }))).toEqual({
      ok: false,
      code: "STAGED_PARSE_RESULT_CORRUPT",
      reason: "parse_result_shape_invalid",
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
      reason: "parse_result_shape_invalid",
    });
    const { staged_modified_time: _b, ...noStaged } = payload();
    expect(parseShadowPayloadForApply(noStaged)).toEqual({
      ok: false,
      code: "STAGED_PARSE_RESULT_CORRUPT",
      reason: "parse_result_shape_invalid",
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
        reason: "parse_result_shape_invalid",
      });
    },
  );

  test("corrupt reviewer_choices (non-array object) is REFUSED, never re-stored raw", () => {
    expect(parseShadowPayloadForApply(payload({ reviewer_choices: { item_id: "x" } }))).toEqual({
      ok: false,
      code: "STAGED_PARSE_RESULT_CORRUPT",
      reason: "reviewer_choice_element_invalid",
    });
  });

  // WM-R4: an array-shaped reviewer_choices with malformed ELEMENTS used to pass the parser
  // (cast after only an is-array check) and reach applyStagedCore.validateReviewerChoices,
  // which dereferences choice.item_id → uncaught TypeError → route-level
  // ONBOARDING_FINALIZE_INTERNAL_ERROR — one malformed retained shadow blocked publish and
  // bypassed the per-row recovery contract. Element corruption refuses with the same posture
  // as the items field (STAGED_REVIEW_ITEMS_CORRUPT): nothing passing this parser may throw
  // inside validateReviewerChoices.
  test.each([
    ["null element", [null]],
    ["string element", ["x"]],
    ["empty object element (no item_id)", [{}]],
    ["missing item_id", [{ action: "apply" }]],
    ["non-string item_id", [{ item_id: 42, action: "apply" }]],
    ["action outside the ReviewerChoice union", [{ item_id: "i-mi11", action: "promote" }]],
    ["non-string action", [{ item_id: "i-mi11", action: null }]],
    ["non-string rename_value", [{ item_id: "i-mi11", action: "rename", rename_value: 42 }]],
    ["one bad element among valid ones", [{ item_id: "i-mi11", action: "apply" }, null]],
  ])(
    "reviewer_choices element corruption (%s) yields the typed REVIEW_ITEMS_CORRUPT refusal, never a throw",
    (_label, reviewerChoices) => {
      expect(parseShadowPayloadForApply(payload({ reviewer_choices: reviewerChoices }))).toEqual({
        ok: false,
        code: "STAGED_REVIEW_ITEMS_CORRUPT",
        reason: "reviewer_choice_element_invalid",
      });
    },
  );

  test("malformed pull_sheet_override object is REFUSED with reason override_snapshot_malformed", () => {
    // Present-but-malformed (missing fingerprint/acceptedBy/acceptedAt) trips the parser
    // AFTER parse_result/staged_id/staged_modified_time/triggered_review_items/base_modified_time/
    // reviewer_choices all validate clean (payload() base is fully valid), so this fixture
    // proves the reason maps to the pull_sheet_override branch specifically, not an earlier check.
    expect(parseShadowPayloadForApply(payload({ pull_sheet_override: { tabName: "T" } }))).toEqual({
      ok: false,
      code: "STAGED_PARSE_RESULT_CORRUPT",
      reason: "override_snapshot_malformed",
    });
  });

  test("malformed pull_sheet_override_applied object is REFUSED with reason override_snapshot_malformed", () => {
    // pull_sheet_override is left absent (legitimate null case, doesn't trip :234-236), so this
    // fixture isolates the pull_sheet_override_applied branch.
    expect(
      parseShadowPayloadForApply(payload({ pull_sheet_override_applied: { tabName: "T" } })),
    ).toEqual({
      ok: false,
      code: "STAGED_PARSE_RESULT_CORRUPT",
      reason: "override_snapshot_malformed",
    });
  });

  test("valid reviewer_choices shapes still parse: every action in the union, rename with string rename_value", () => {
    for (const choices of [
      [{ item_id: "i-mi11", action: "apply" }],
      [{ item_id: "i-mi11", action: "reject" }],
      [{ item_id: "i-mi11", action: "independent" }],
      [{ item_id: "i-mi11", action: "rename", rename_value: "Ada B" }],
    ]) {
      const parsed = parseShadowPayloadForApply(payload({ reviewer_choices: choices }));
      expect(parsed).toMatchObject({ ok: true });
      if (parsed.ok) expect(parsed.reviewerChoices).toEqual(choices);
    }
  });

  // ── source_anchors: the ONE tolerant field on this fail-closed boundary ──────
  // Deep-link anchors are cosmetic: a corrupt map must degrade to {} (which the Phase-D
  // call site turns into an OMITTED core arg, preserving whatever shows.source_anchors
  // holds), never refuse a whole shadow and block a publish. Spec §3.2 / §1.1.
  // Every case asserts ok:true explicitly — a fail-closed implementation must fail here.

  test("source_anchors: a populated map surfaces verbatim on parsed.sourceAnchors", () => {
    const anchors = {
      schedule: { title: "AGENDA", gid: 1490737099, a1: "A1:X999" },
      venue: { title: "INFO", gid: 0, a1: "A1:E10" },
    };
    const parsed = parseShadowPayloadForApply(payload({ source_anchors: anchors }));
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) return;
    expect(parsed.sourceAnchors).toEqual(anchors);
  });

  test("source_anchors: a legacy double-encoded JSON string decodes to the map", () => {
    const anchors = { venue: { title: "INFO", gid: 7, a1: "B2:C3" } };
    const parsed = parseShadowPayloadForApply(payload({ source_anchors: JSON.stringify(anchors) }));
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) return;
    expect(parsed.sourceAnchors).toEqual(anchors);
  });

  test("source_anchors: every unusable value degrades to {} WITHOUT refusing the shadow", () => {
    // The absent-key case comes first and is the legacy-shadow contract: a row staged
    // before this field existed must apply exactly as it did before.
    const unusable: Array<[string, Record<string, unknown>]> = [
      ["absent", {}],
      ["explicit null", { source_anchors: null }],
      ["array", { source_anchors: [] }],
      ["number scalar", { source_anchors: 42 }],
      ["unparseable string", { source_anchors: "not-json" }],
      ["string decoding to a non-object", { source_anchors: '"just a string"' }],
    ];
    for (const [label, override] of unusable) {
      const parsed = parseShadowPayloadForApply(payload(override));
      expect(parsed, `${label} must not refuse the shadow`).toMatchObject({ ok: true });
      if (!parsed.ok) continue;
      expect(parsed.sourceAnchors, `${label} must degrade to {}`).toEqual({});
    }
  });

  test("source_anchors: a malformed ENTRY passes through — no per-entry validation (spec §1.1)", () => {
    // Ratified: the only producer is extractSourceAnchors, and the read boundary
    // (buildSheetDeepLink) is where a bad entry is handled. Validating here would
    // diverge from Flow A and the cron path, which both pass entries through.
    const anchors = { schedule: { title: 5, gid: "nope" } };
    const parsed = parseShadowPayloadForApply(payload({ source_anchors: anchors }));
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) return;
    expect(parsed.sourceAnchors).toEqual(anchors);
  });
});
