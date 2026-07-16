import { describe, expect, test } from "vitest";

import { renderRoleTokenMappedCopy, roleGrantsSummary } from "@/lib/messages/roleTokenMappedCopy";

// Spec 2026-07-15-extend-role-scope-vocab §10 point 6 (Codex R4 F2): the
// ROLE_TOKEN_MAPPED event copy renders the interpolated token AND a grants
// summary, and the empty-grants (recognize-only) branch resolves to
// "the standard show page" — never an empty join artifact. Assertions run
// against the RENDERED string (the real messageFor path + join helper), not the
// catalog literal.
describe("ROLE_TOKEN_MAPPED rendered copy (§10 point 6)", () => {
  test("grants summary joins discipline labels in pinned order", () => {
    expect(roleGrantsSummary(["A1"])).toBe("Audio details");
    expect(roleGrantsSummary(["A1", "V1"])).toBe("Audio and Video details");
    // Order-independent — stored/hand-edited order does not change the summary.
    expect(roleGrantsSummary(["V1", "A1"])).toBe("Audio and Video details");
    expect(roleGrantsSummary(["A1", "V1", "L1"])).toBe("Audio, Video and Lighting details");
    expect(roleGrantsSummary(["FINANCIALS"])).toBe("Financial details");
  });

  test("empty grants resolve to 'the standard show page' with no empty-join artifact", () => {
    const summary = roleGrantsSummary([]);
    expect(summary).toBe("the standard show page");
    expect(summary).not.toMatch(/\band details\b/);
    expect(summary).not.toMatch(/see \.$/);
  });

  test("renders the interpolated token and the grants summary (grants present)", () => {
    const output = renderRoleTokenMappedCopy({ token: "DRONE OP", grants: ["A1", "V1"] });
    expect(output).toContain("DRONE OP");
    expect(output).toContain("Audio and Video details");
    // The catalog placeholder was interpolated, not left raw.
    expect(output).not.toContain("<token>");
  });

  test("renders 'the standard show page' for recognize-only (empty grants), no artifact", () => {
    const output = renderRoleTokenMappedCopy({ token: "DRONE OP", grants: [] });
    expect(output).toContain("DRONE OP");
    expect(output).toContain("the standard show page");
    expect(output).not.toMatch(/\bsee \.\B|see \.$/);
    expect(output).not.toContain("<token>");
  });
});
