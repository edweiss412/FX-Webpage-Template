import { describe, expect, test } from "vitest";
import { accumulateAutoFixes } from "@/lib/notify/monitorDigest";

// Flow 6.2 §3 signal 2, §13.4 — sum the five *_AUTOCORRECTED classes across rows,
// skipping the leading non-warning payload object (no severity/code) and non-autofix
// warnings. Pure helper, tested directly on injected rows.
describe("accumulateAutoFixes", () => {
  test("counts only autocorrect classes across rows; skips leading payload object", () => {
    const rows = [
      {
        parse_warnings: [
          { kind: "delta", outcome: "applied", code: null }, // payload object — skipped
          { code: "STAGE_WORD_AUTOCORRECTED", severity: "warn", message: "a" },
          { code: "FIELD_UNREADABLE", severity: "warn", message: "gap" }, // not an autofix
        ],
      },
      {
        parse_warnings: [
          { code: "STAGE_WORD_AUTOCORRECTED", severity: "warn", message: "b" },
          { code: "ROLE_TOKEN_AUTOCORRECTED", severity: "warn", message: "c" },
        ],
      },
    ];
    const s = accumulateAutoFixes(rows);
    expect(s.total).toBe(3);
    expect(s.classes.STAGE_WORD_AUTOCORRECTED).toBe(2);
    expect(s.classes.ROLE_TOKEN_AUTOCORRECTED).toBe(1);
    expect(s.classes.FIELD_LABEL_AUTOCORRECTED).toBe(0);
  });

  test("empty rows → total 0", () => {
    expect(accumulateAutoFixes([]).total).toBe(0);
  });
});
