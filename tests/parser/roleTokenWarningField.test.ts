import { describe, expect, test } from "vitest";
import { extractRoleFlags } from "@/lib/parser/personalization";

describe("UNKNOWN_ROLE_TOKEN roleToken payload (spec §5.1)", () => {
  test("carries the canonical token, one warning per unknown token", () => {
    const { warnings } = extractRoleFlags("drone   op / A1 / grip");
    const unknown = warnings.filter((w) => w.code === "UNKNOWN_ROLE_TOKEN");
    expect(unknown.map((w) => w.roleToken).sort()).toEqual(["DRONE   OP", "GRIP"]);
  });

  test("absent on every other code (autocorrect keeps no roleToken)", () => {
    const { warnings } = extractRoleFlags("CONTENT CRETION");
    const auto = warnings.filter((w) => w.code === "ROLE_TOKEN_AUTOCORRECTED");
    expect(auto.length).toBe(1);
    expect(auto[0]!.roleToken).toBeUndefined();
    expect(warnings.filter((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toEqual([]);
  });
});
