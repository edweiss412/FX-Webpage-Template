import { describe, it, expect } from "vitest";
import {
  resolveActionIntent,
  resolveActionLabels,
  RESOLVE_INTENTS,
} from "@/lib/adminAlerts/resolveActionLabel";

describe("resolveActionIntent", () => {
  it("ROLE_FLAGS_NOTICE is a confirmation, not a fault to clear", () => {
    expect(resolveActionIntent("ROLE_FLAGS_NOTICE")).toBe("confirm");
  });

  it("an operational fault stays a resolve", () => {
    expect(resolveActionIntent("AMBIGUOUS_EMAIL_BINDING")).toBe("resolve");
  });

  it("an unmapped code falls back to resolve and NEVER throws", () => {
    // Throwing on a live admin surface was rejected in review: ADMIN_ALERTS_CODES
    // enumerates current production write sites, not the rows already sitting in
    // admin_alerts, so a historic row whose producer was retired must still render.
    expect(() => resolveActionIntent("RETIRED_OR_UNKNOWN_CODE")).not.toThrow();
    expect(resolveActionIntent("RETIRED_OR_UNKNOWN_CODE")).toBe("resolve");
  });
});

describe("resolveActionLabels", () => {
  it("pairs confirm labels", () => {
    expect(resolveActionLabels("ROLE_FLAGS_NOTICE")).toEqual({
      idle: "Confirm",
      pending: "Confirming…",
    });
  });

  it("pairs resolve labels", () => {
    expect(resolveActionLabels("AMBIGUOUS_EMAIL_BINDING")).toEqual({
      idle: "Mark resolved",
      pending: "Resolving…",
    });
  });

  it("the map is not empty and every value is a legal intent", () => {
    const values = Object.values(RESOLVE_INTENTS).map((r) => r.intent);
    expect(values.length).toBeGreaterThan(0);
    expect(values.every((v) => v === "confirm" || v === "resolve")).toBe(true);
  });
});
