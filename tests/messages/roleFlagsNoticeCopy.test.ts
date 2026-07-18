import { describe, expect, it } from "vitest";
import { messageFor, lookupHelpfulContext, plainCatalogText } from "@/lib/messages/lookup";

describe("ROLE_FLAGS_NOTICE condensed copy (spec 2026-07-17 §3.1)", () => {
  it("has the inline-context template, real title, and no helpfulContext", () => {
    const entry = messageFor("ROLE_FLAGS_NOTICE");
    expect(entry.title).toBe("Role change applied");
    expect(entry.dougFacing).toBe("In <sheet-name>, <role-changes><lead-hint>");
    expect(lookupHelpfulContext("ROLE_FLAGS_NOTICE")).toBeNull();
  });

  it("interpolates fully with derived params (no unresolved placeholder)", () => {
    const text = plainCatalogText(messageFor("ROLE_FLAGS_NOTICE").dougFacing ?? "", {
      "sheet-name": "'II - RIA Investment Forum'",
      "role-changes": "Doug Larson's role changed from A1 to A1 + LEAD.",
      "lead-hint": " Lead changes must be confirmed in the show page.",
    });
    expect(text).toBe(
      "In 'II - RIA Investment Forum', Doug Larson's role changed from A1 to A1 + LEAD. Lead changes must be confirmed in the show page.",
    );
    expect(text).not.toMatch(/<[a-zA-Z_][a-zA-Z0-9_-]*>/);
  });
});
