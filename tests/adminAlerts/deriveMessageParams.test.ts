import { describe, expect, it } from "vitest";
import {
  deriveAlertMessageParams,
  IDENTITY_PARAM_TOKENS,
  BELL_BOLD_IDENTITY_TOKENS,
} from "@/lib/adminAlerts/deriveMessageParams";
import type { AlertIdentity } from "@/lib/adminAlerts/identityTypes";

const identity = (segments: Array<{ label: string | null; value: string }>): AlertIdentity => ({
  segments,
  global: false,
});

const change = (crew_name: string, prior_flags: string[], new_flags: string[]) => ({
  crew_name,
  prior_flags,
  new_flags,
});

describe("deriveAlertMessageParams — identity params", () => {
  it("quotes the Sheet segment into sheet-name and Show into show-name", () => {
    const p = deriveAlertMessageParams(
      "REPORT_LEASE_THRASHING",
      null,
      identity([
        { label: "Sheet", value: "II - East Coast 2026" },
        { label: "Show", value: "II - East Coast 2026" },
      ]),
    );
    expect(p["sheet-name"]).toBe("'II - East Coast 2026'");
    expect(p["show-name"]).toBe("'II - East Coast 2026'");
  });

  it("falls back to unquoted phrases when identity is null or segment missing", () => {
    const p = deriveAlertMessageParams("REPORT_LEASE_THRASHING", null, null);
    expect(p["sheet-name"]).toBe("this sheet");
    expect(p["show-name"]).toBe("this show");
  });

  it("passes context scalars through unmodified", () => {
    const p = deriveAlertMessageParams(
      "BRANCH_PROTECTION_DRIFT",
      { repo: "edweiss412/FX-Webpage-Template" },
      null,
    );
    expect(p.repo).toBe("edweiss412/FX-Webpage-Template");
  });

  // Fix Round 1 (param priority): identity-resolved value > context-derived
  // value > fallback phrase. Fallback applies ONLY when neither identity nor
  // context supplies the value — a resolved identity value must still win
  // over a conflicting context value (real anti-spoof), but identity being
  // null must NOT clobber a context-supplied value down to the fallback
  // (that was the SHEET_UNAVAILABLE regression: Task 8 swapped
  // PerShowAlertSection.tsx from raw context passthrough to this function,
  // and identity resolution for that alert is null, so the old
  // unconditional-override wiped out context.sheet_name).
  describe("priority chain: identity > context > fallback", () => {
    it("show-name: identity wins over a conflicting context value", () => {
      const p = deriveAlertMessageParams(
        "BRANCH_PROTECTION_DRIFT",
        { "show-name": "context-supplied" },
        identity([{ label: "Show", value: "II - East Coast 2026" }]),
      );
      expect(p["show-name"]).toBe("'II - East Coast 2026'");
    });

    it("sheet-name: identity null, context sheet_name present → context value wins (SHEET_UNAVAILABLE shape)", () => {
      const p = deriveAlertMessageParams(
        "SHEET_UNAVAILABLE",
        { sheet_name: "Validation — Normal day (R1)" },
        null,
      );
      expect(p["sheet-name"]).toBe("Validation — Normal day (R1)");
    });

    it("sheet-name: identity null, context missing → fallback phrase", () => {
      const p = deriveAlertMessageParams("SHEET_UNAVAILABLE", null, null);
      expect(p["sheet-name"]).toBe("this sheet");
    });

    it("show-name: identity null, context show_name present → context value wins", () => {
      const p = deriveAlertMessageParams(
        "REPORT_LEASE_THRASHING",
        { show_name: "II - RIA Investment Forum" },
        null,
      );
      expect(p["show-name"]).toBe("II - RIA Investment Forum");
    });

    it("repo (Task 9 param): identity has no repo segment, so context always wins over fallback when present — unaffected by the chain fix", () => {
      const p = deriveAlertMessageParams(
        "BRANCH_PROTECTION_DRIFT",
        { repo: "edweiss412/FX-Webpage-Template" },
        identity([{ label: "Show", value: "unrelated" }]),
      );
      expect(p.repo).toBe("edweiss412/FX-Webpage-Template");
    });
  });

  // Task 9 (spec 2026-07-17 §4.2): the telemetry health panel has no
  // unresolved-placeholder guard (§4.3 guard is bell/per-show only), so
  // EVERY placeholder these three codes' dougFacing templates use must
  // always resolve here too — not just sheet-name/show-name.
  it("repo falls back to a generic phrase when context is missing/null (BRANCH_PROTECTION_*)", () => {
    const p = deriveAlertMessageParams("BRANCH_PROTECTION_DRIFT", null, null);
    expect(p.repo).toBe("this repository");
  });

  it("file_name falls back to 'this sheet' when context is missing/null (WIZARD_SESSION_SUPERSEDED_RACE)", () => {
    const p = deriveAlertMessageParams("WIZARD_SESSION_SUPERSEDED_RACE", null, null);
    expect(p.file_name).toBe("this sheet");
  });

  it("attempted_action falls back to a generic phrase when context is missing/null (WIZARD_SESSION_SUPERSEDED_RACE)", () => {
    const p = deriveAlertMessageParams("WIZARD_SESSION_SUPERSEDED_RACE", null, null);
    expect(p.attempted_action).toBe("a setup action");
  });

  it("does not override repo/file_name/attempted_action when context supplies them", () => {
    const p = deriveAlertMessageParams(
      "WIZARD_SESSION_SUPERSEDED_RACE",
      { file_name: "II - East Coast 2026", attempted_action: "retry" },
      null,
    );
    expect(p.file_name).toBe("II - East Coast 2026");
    expect(p.attempted_action).toBe("retry");
  });
});

describe("deriveAlertMessageParams — identity-segment param mapping (full sweep)", () => {
  it("exports IDENTITY_PARAM_TOKENS with exactly the 9 identity-derived tokens", () => {
    expect(IDENTITY_PARAM_TOKENS).toEqual(
      new Set([
        "sheet-name",
        "show-name",
        "repo",
        "file-name",
        "role-changes",
        "crew-name",
        "email",
        "crew-row-count",
        "failed-sheet-names",
      ]),
    );
  });

  it("BELL_BOLD_IDENTITY_TOKENS is a name-only subset that excludes structured/prose tokens", () => {
    for (const t of BELL_BOLD_IDENTITY_TOKENS) expect(IDENTITY_PARAM_TOKENS.has(t)).toBe(true);
    expect([...BELL_BOLD_IDENTITY_TOKENS].sort()).toEqual(["crew-name", "sheet-name", "show-name"]);
    for (const t of [
      "role-changes",
      "email",
      "repo",
      "file-name",
      "crew-row-count",
      "failed-sheet-names",
    ]) {
      expect(BELL_BOLD_IDENTITY_TOKENS.has(t)).toBe(false);
    }
  });

  describe("crew-name", () => {
    it("identity Crew segment wins over conflicting context", () => {
      const identity: AlertIdentity = {
        global: false,
        segments: [{ label: "Crew", value: "Doug Larson" }],
      };
      const p = deriveAlertMessageParams(
        "OAUTH_IDENTITY_CLAIMED",
        { crew_name: "Wrong Name" },
        identity,
      );
      expect(p["crew-name"]).toBe("'Doug Larson'");
    });

    it("context wins when identity null", () => {
      expect(
        deriveAlertMessageParams("OAUTH_IDENTITY_CLAIMED", { crew_name: "Ann" }, null)["crew-name"],
      ).toBe("Ann");
    });

    it("fallback when both absent", () => {
      expect(deriveAlertMessageParams("OAUTH_IDENTITY_CLAIMED", null, null)["crew-name"]).toBe(
        "a crew member",
      );
    });

    it("does not conflate ROLE_FLAGS_NOTICE's Crew-labeled contextField (role_change_crew_names) with the crewName kind", () => {
      // alertIdentityMap.ts:149 declares a `contextField` spec labeled "Crew"
      // for ROLE_FLAGS_NOTICE — a DIFFERENT SegmentSpec kind than `crewName`.
      // Only `crewName`-kind segments may populate crew-name; label alone is
      // not sufficient (the ordered walk keys off spec.kind).
      const identity: AlertIdentity = {
        global: false,
        segments: [
          { label: "Sheet", value: "II - RIA Investment Forum" },
          { label: "Crew", value: "Doug Larson, Jane Doe" },
          { label: null, value: "2 role changes" },
        ],
      };
      const p = deriveAlertMessageParams("ROLE_FLAGS_NOTICE", null, identity);
      expect(p["crew-name"]).toBe("a crew member");
    });
  });

  describe("email", () => {
    it("identity-supplied (non-pii) label-less email-shaped segment wins over context", () => {
      const identity: AlertIdentity = {
        global: false,
        segments: [{ label: null, value: "doug@example.com" }],
      };
      const p = deriveAlertMessageParams(
        "OAUTH_IDENTITY_CLAIMED",
        { email: "wrong@example.com" },
        identity,
      );
      expect(p["email"]).toBe("doug@example.com");
    });

    it("context wins when identity lacks the segment", () => {
      expect(
        deriveAlertMessageParams("OAUTH_IDENTITY_CLAIMED", { email: "ann@example.com" }, null)[
          "email"
        ],
      ).toBe("ann@example.com");
    });

    it("fallback when both absent", () => {
      expect(deriveAlertMessageParams("OAUTH_IDENTITY_CLAIMED", null, null)["email"]).toBe(
        "an email address",
      );
    });

    it("pii segment never surfaces the raw value — falls through to context, then fallback", () => {
      const identity: AlertIdentity = {
        global: false,
        segments: [{ label: null, value: "doug@example.com", pii: true }],
      };
      const withContext = deriveAlertMessageParams(
        "OAUTH_IDENTITY_CLAIMED",
        { email: "context@example.com" },
        identity,
      );
      expect(withContext["email"]).toBe("context@example.com");
      expect(withContext["email"]).not.toContain("doug@example.com");

      const withoutContext = deriveAlertMessageParams("OAUTH_IDENTITY_CLAIMED", null, identity);
      expect(withoutContext["email"]).toBe("an email address");
    });
  });

  describe("crew-row-count", () => {
    it("identity-supplied count segment wins over context (unquoted numeric phrase)", () => {
      const identity: AlertIdentity = {
        global: false,
        segments: [
          { label: "Show", value: "II - East Coast 2026" },
          { label: null, value: "doug@example.com" },
          { label: null, value: "2 crew rows" },
        ],
      };
      const p = deriveAlertMessageParams(
        "AMBIGUOUS_EMAIL_BINDING",
        { crew_row_count: "wrong" },
        identity,
      );
      expect(p["crew-row-count"]).toBe("2 crew rows");
    });

    it("context wins when identity lacks the segment", () => {
      expect(
        deriveAlertMessageParams(
          "AMBIGUOUS_EMAIL_BINDING",
          { crew_row_count: "3 crew rows" },
          null,
        )["crew-row-count"],
      ).toBe("3 crew rows");
    });

    it("fallback when both absent", () => {
      expect(
        deriveAlertMessageParams("AMBIGUOUS_EMAIL_BINDING", null, null)["crew-row-count"],
      ).toBe("two or more crew rows");
    });

    it("ordered-walk-with-skips: absent Show segment does not shift email/count onto the wrong param", () => {
      // AMBIGUOUS_EMAIL_BINDING declares [showName, email, count]. With the
      // Show segment unresolved, resolveAlertIdentities only pushes the
      // email + count segments it could build — a naive positional zip would
      // pair spec[0]=showName with segments[0]=email (wrong) and
      // spec[1]=email with segments[1]=count (wrong), losing the count
      // entirely. The cursor walk must skip the absent showName spec and
      // still land email/count on the correct segments.
      const identity: AlertIdentity = {
        global: false,
        segments: [
          { label: null, value: "doug@example.com" },
          { label: null, value: "2 crew rows" },
        ],
      };
      const p = deriveAlertMessageParams("AMBIGUOUS_EMAIL_BINDING", null, identity);
      expect(p["email"]).toBe("doug@example.com");
      expect(p["crew-row-count"]).toBe("2 crew rows");
    });
  });

  describe("failed-sheet-names", () => {
    it("identity-supplied Sheet-labeled contextField segment wins over context", () => {
      const identity: AlertIdentity = {
        global: false,
        segments: [{ label: "Sheet", value: "Sheet1, Sheet2 +1 more" }],
      };
      const p = deriveAlertMessageParams(
        "ONBOARDING_SHEET_UNREADABLE",
        { failed_sheet_names: "wrong" },
        identity,
      );
      expect(p["failed-sheet-names"]).toBe("Sheet1, Sheet2 +1 more");
    });

    it("context wins when identity lacks the segment", () => {
      expect(
        deriveAlertMessageParams(
          "ONBOARDING_SHEET_UNREADABLE",
          { failed_sheet_names: "Sheet3" },
          null,
        )["failed-sheet-names"],
      ).toBe("Sheet3");
    });

    it("fallback when both absent", () => {
      expect(
        deriveAlertMessageParams("ONBOARDING_SHEET_UNREADABLE", null, null)["failed-sheet-names"],
      ).toBe("some sheets");
    });
  });

  describe("crew-count (no identity segments — plain context ?? fallback)", () => {
    it("context wins when present", () => {
      expect(
        deriveAlertMessageParams("SHOW_FIRST_PUBLISHED", { crew_count: "5" }, null)["crew-count"],
      ).toBe("5");
    });

    it("fallback when absent, even with an (irrelevant) identity present", () => {
      const identity: AlertIdentity = { global: true, segments: [] };
      expect(deriveAlertMessageParams("SHOW_FIRST_PUBLISHED", null, identity)["crew-count"]).toBe(
        "some",
      );
    });

    // Codex whole-diff MEDIUM: the SHOW_FIRST_PUBLISHED producer writes
    // crew_count as a NUMBER (lib/sync/runScheduledCronSync.ts:2369 —
    // `crew_count: args.parseResult.crewMembers.length`), not a string. The
    // string-only gate in contextStringValue silently degraded real counts to
    // the "some" fallback.
    it("context wins when crew_count is a finite number (real producer shape)", () => {
      expect(
        deriveAlertMessageParams("SHOW_FIRST_PUBLISHED", { crew_count: 5 }, null)["crew-count"],
      ).toBe("5");
    });

    it("context wins when crew_count is zero (falsy-but-valid number)", () => {
      expect(
        deriveAlertMessageParams("SHOW_FIRST_PUBLISHED", { crew_count: 0 }, null)["crew-count"],
      ).toBe("0");
    });

    it("falls back when crew_count is NaN", () => {
      expect(
        deriveAlertMessageParams("SHOW_FIRST_PUBLISHED", { crew_count: NaN }, null)["crew-count"],
      ).toBe("some");
    });

    it("falls back when crew_count is a non-scalar object (dropped by the context-scalar filter before reaching the param resolver)", () => {
      expect(
        deriveAlertMessageParams(
          "SHOW_FIRST_PUBLISHED",
          { crew_count: { nested: true } } as unknown as Record<string, unknown>,
          null,
        )["crew-count"],
      ).toBe("some");
    });
  });

  describe("show-date (no identity segments — plain context ?? fallback)", () => {
    it("context wins when present", () => {
      expect(
        deriveAlertMessageParams("SHOW_FIRST_PUBLISHED", { show_date: "Aug 1" }, null)["show-date"],
      ).toBe("Aug 1");
    });

    it("fallback when absent", () => {
      expect(deriveAlertMessageParams("SHOW_FIRST_PUBLISHED", null, null)["show-date"]).toBe(
        "an upcoming date",
      );
    });
  });
});

describe("deriveAlertMessageParams — ROLE_FLAGS_NOTICE", () => {
  const sheetIdentity = identity([{ label: "Sheet", value: "II - RIA Investment Forum" }]);

  it("single modified member reads as one sentence", () => {
    const p = deriveAlertMessageParams(
      "ROLE_FLAGS_NOTICE",
      { changes: [change("Doug Larson", ["A1"], ["A1", "LEAD"])] },
      sheetIdentity,
    );
    expect(p["role-changes"]).toBe("Doug Larson's role changed from A1 to A1 + LEAD.");
    expect(p["lead-hint"]).toBe(" Lead changes must be confirmed in the show page.");
  });

  it("single added member (empty prior)", () => {
    const p = deriveAlertMessageParams(
      "ROLE_FLAGS_NOTICE",
      { changes: [change("Jane Doe", [], ["FINANCIALS"])] },
      sheetIdentity,
    );
    expect(p["role-changes"]).toBe("Jane Doe was added with FINANCIALS.");
    expect(p["lead-hint"]).toBe("");
  });

  it("single removed member (empty new)", () => {
    const p = deriveAlertMessageParams(
      "ROLE_FLAGS_NOTICE",
      { changes: [change("Sam Roe", ["LEAD"], [])] },
      sheetIdentity,
    );
    expect(p["role-changes"]).toBe("Sam Roe (LEAD) was removed from the crew.");
    expect(p["lead-hint"]).toBe(" Lead changes must be confirmed in the show page.");
  });

  it("multi renders header + bullets, exact composition", () => {
    const p = deriveAlertMessageParams(
      "ROLE_FLAGS_NOTICE",
      {
        changes: [
          change("Doug Larson", ["A1"], ["A1", "LEAD"]),
          change("Jane Doe", [], ["FINANCIALS"]),
          change("Sam Roe", ["LEAD"], []),
        ],
      },
      sheetIdentity,
    );
    expect(p["role-changes"]).toBe(
      "3 role changes:\n• Doug Larson: A1 → A1 + LEAD\n• Jane Doe: added with FINANCIALS\n• Sam Roe: LEAD → (removed)",
    );
  });

  it("caps at 3 lines with an overflow line at 4+", () => {
    const p = deriveAlertMessageParams(
      "ROLE_FLAGS_NOTICE",
      {
        changes: [
          change("A", ["A1"], ["LEAD", "A1"]),
          change("B", ["V1"], ["FINANCIALS", "V1"]),
          change("C", [], ["LEAD"]),
          change("D", ["FINANCIALS"], []),
          change("E", ["A1"], ["A1", "FINANCIALS"]),
        ],
      },
      sheetIdentity,
    );
    const lines = String(p["role-changes"]).split("\n");
    expect(lines[0]).toBe("5 role changes:");
    expect(lines).toHaveLength(5); // header + 3 bullets + overflow
    expect(lines[4]).toBe("+2 more — see show page.");
  });

  it("FINANCIALS-only delta yields no lead hint", () => {
    const p = deriveAlertMessageParams(
      "ROLE_FLAGS_NOTICE",
      { changes: [change("Jane Doe", ["A1"], ["A1", "FINANCIALS"])] },
      sheetIdentity,
    );
    expect(p["lead-hint"]).toBe("");
  });

  it("LEAD loss (not just gain) yields the hint", () => {
    const p = deriveAlertMessageParams(
      "ROLE_FLAGS_NOTICE",
      { changes: [change("Doug Larson", ["LEAD", "A1"], ["A1"])] },
      sheetIdentity,
    );
    expect(p["lead-hint"]).toBe(" Lead changes must be confirmed in the show page.");
  });

  it.each([
    ["missing changes", {}],
    ["non-array changes", { changes: "nope" }],
    ["empty array", { changes: [] }],
    ["all entries malformed", { changes: [{ crew_name: 7, prior_flags: "x", new_flags: null }] }],
    ["null context", null],
  ])("falls back on %s", (_label, context) => {
    const p = deriveAlertMessageParams(
      "ROLE_FLAGS_NOTICE",
      context as Record<string, unknown> | null,
      sheetIdentity,
    );
    expect(p["role-changes"]).toBe("a crew member's role flags changed — see the show page.");
    expect(p["lead-hint"]).toBe("");
  });

  it("skips malformed entries but keeps well-formed ones", () => {
    const p = deriveAlertMessageParams(
      "ROLE_FLAGS_NOTICE",
      {
        changes: [
          { crew_name: "", prior_flags: ["A1"], new_flags: ["LEAD"] }, // empty name → skipped
          change("Doug Larson", ["A1"], ["A1", "LEAD"]),
        ],
      },
      sheetIdentity,
    );
    expect(p["role-changes"]).toBe("Doug Larson's role changed from A1 to A1 + LEAD.");
  });

  it("non-ROLE_FLAGS codes get no role-changes/lead-hint params", () => {
    const p = deriveAlertMessageParams("REPORT_LEASE_THRASHING", { changes: [] }, null);
    expect(p["role-changes"]).toBeUndefined();
    expect(p["lead-hint"]).toBeUndefined();
  });
});
