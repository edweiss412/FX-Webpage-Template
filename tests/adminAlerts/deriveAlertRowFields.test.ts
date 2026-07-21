import { describe, expect, test } from "vitest";
import { deriveAlertRowFields } from "@/lib/adminAlerts/deriveAlertRowFields";
import type { AlertIdentity } from "@/lib/adminAlerts/identityTypes";

/**
 * The DB-independent tail of fetchPerShowAlerts, extracted so the dev gallery and
 * the production read path derive identical fields (spec §3.3). These tests pin
 * the split that spec §3.1 documents: ROLE_FLAGS_NOTICE resolves crewName from
 * CONTEXT alone, while the identity-dependent codes read the resolved identity's
 * single "Crew" segment.
 *
 * Failure mode caught: a refactor that changes which source crewName reads for
 * either class of code. That is exactly the divergence the fidelity contract
 * exists to prevent, and it is invisible to any test that supplies both a
 * context and an identity that happen to agree.
 */
/**
 * NOTE: `describeAlert` returns null when `identity.global` is TRUTHY
 * (lib/adminAlerts/describeAlert.ts:10) - a global-scoped alert has no per-row
 * identity text. An earlier version of this fixture set `global: {}`, which is
 * truthy, and silently made every identityText assertion vacuous.
 */
function identityWithCrew(...values: string[]): AlertIdentity {
  return {
    segments: values.map((value) => ({ label: "Crew", value, pii: false })),
  } as unknown as AlertIdentity;
}

describe("deriveAlertRowFields", () => {
  test("ROLE_FLAGS_NOTICE takes crewName from context alone, with no identity", () => {
    const out = deriveAlertRowFields(
      {
        code: "ROLE_FLAGS_NOTICE",
        // projectIdentityContext derives role_change_crew_names and
        // role_change_count from ctx.changes[].crew_name
        // (lib/adminAlerts/projectIdentityContext.ts:88-97), NOT from top-level
        // role_change_* keys.
        context: { changes: [{ crew_name: "Dana Reed" }] },
      },
      undefined,
    );
    expect(out.crewName).toBe("Dana Reed");
  });

  test("ROLE_FLAGS_NOTICE yields null when the count is not exactly one", () => {
    const out = deriveAlertRowFields(
      {
        code: "ROLE_FLAGS_NOTICE",
        context: { changes: [{ crew_name: "Dana Reed" }, { crew_name: "Sam Ito" }] },
      },
      undefined,
    );
    expect(out.crewName).toBeNull();
  });

  test("ROLE_FLAGS_NOTICE ignores a resolved identity entirely", () => {
    const out = deriveAlertRowFields(
      { code: "ROLE_FLAGS_NOTICE", context: {} },
      identityWithCrew("Should Not Be Used"),
    );
    expect(out.crewName).toBeNull();
  });

  test("an identity-dependent code takes crewName from the resolved Crew segment", () => {
    const out = deriveAlertRowFields(
      { code: "AMBIGUOUS_EMAIL_BINDING", context: {} },
      identityWithCrew("Sam Ito"),
    );
    expect(out.crewName).toBe("Sam Ito");
  });

  test("an identity-dependent code yields null crewName when identity is absent", () => {
    const out = deriveAlertRowFields({ code: "AMBIGUOUS_EMAIL_BINDING", context: {} }, undefined);
    expect(out.crewName).toBeNull();
  });

  test("two Crew segments are ambiguous and yield null", () => {
    const out = deriveAlertRowFields(
      { code: "OAUTH_IDENTITY_CLAIMED", context: {} },
      identityWithCrew("A", "B"),
    );
    expect(out.crewName).toBeNull();
  });

  test("a blank Crew segment value yields null rather than an empty name", () => {
    const out = deriveAlertRowFields(
      { code: "OAUTH_IDENTITY_CLAIMED", context: {} },
      identityWithCrew("   "),
    );
    expect(out.crewName).toBeNull();
  });

  test("identityText is null without an identity and non-null with one", () => {
    expect(
      deriveAlertRowFields({ code: "SYNC_STALLED", context: {} }, undefined).identityText,
    ).toBeNull();
    expect(
      deriveAlertRowFields({ code: "SYNC_STALLED", context: {} }, identityWithCrew("Sam Ito"))
        .identityText,
    ).not.toBeNull();
  });

  test("messageParams is always an object, including for a null context", () => {
    const out = deriveAlertRowFields({ code: "SYNC_STALLED", context: null }, undefined);
    expect(out.messageParams).toBeTypeOf("object");
    expect(out.messageParams).not.toBeNull();
  });
});
