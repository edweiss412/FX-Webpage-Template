import { describe, expect, test } from "vitest";
import {
  SignedLinksInfraError,
  type IssueLinkOutcome,
  type RevokeAllLinksOutcome,
} from "@/lib/data/signedLinks";

describe("M9.5 signed-links data layer scaffold", () => {
  test("SignedLinksInfraError extends Error with correct name", () => {
    const err = new SignedLinksInfraError("test");

    expect(err.name).toBe("SignedLinksInfraError");
    expect(err.message).toBe("test");
    expect(err).toBeInstanceOf(Error);
  });

  test("outcome unions include all expected kinds", () => {
    const issue: IssueLinkOutcome[] = [
      {
        kind: "ok",
        row: {
          current_token_version: 2,
          max_issued_version: 2,
          revoked_below_version: 0,
        },
      },
      { kind: "show_not_found" },
      { kind: "crew_member_not_found" },
    ];
    const revoke: RevokeAllLinksOutcome[] = [
      {
        kind: "ok",
        row: {
          current_token_version: 2,
          max_issued_version: 2,
          revoked_below_version: 2,
        },
      },
      { kind: "no_live_link" },
      { kind: "show_not_found" },
      { kind: "crew_member_not_found" },
    ];

    expect(issue.length).toBe(3);
    expect(revoke.length).toBe(4);
  });
});
