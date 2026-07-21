import { describe, expect, test } from "vitest";
import { validateScenario } from "@/lib/dev/attentionScenarios/validate";
import type { AttentionScenario } from "@/lib/dev/attentionScenarios/types";

/**
 * The catalog guard contract is EXECUTABLE, not prose (spec §3.6). Two review
 * rounds reported "guards enumerated incompletely" against a prose table; a
 * third prose enumeration would have failed the same way, so the rules live here
 * and a malformed scenario simply cannot reach either consumer.
 */
function base(over: Partial<AttentionScenario> = {}): AttentionScenario {
  return {
    id: "alert-sync-stalled",
    tier: 1,
    label: "Sync stalled",
    alerts: [],
    holds: [],
    ...over,
  };
}

const AT = "2026-07-01T12:00:00.000Z";

function alertRow(over: Partial<AttentionScenario["alerts"][number]> = {}) {
  return { code: "SYNC_STALLED", context: {}, raised_at: AT, occurrence_count: 1, ...over };
}

function holdRow(over: Partial<AttentionScenario["holds"][number]> = {}) {
  return {
    drive_file_id: "file-1",
    domain: "crew_email" as const,
    entity_key: "dana-reed",
    held_value: { email: "old@example.test" },
    proposed_value: {
      disposition: "email_change" as const,
      name: "Dana Reed",
      email: "new@example.test",
    },
    base_modified_time: AT,
    kind: "mi11_pending" as const,
    ...over,
  };
}

describe("validateScenario - identity and shape", () => {
  test("a minimal scenario is valid", () => {
    expect(validateScenario(base())).toEqual([]);
  });

  test("rejects ids that are not the canonical slug shape", () => {
    for (const id of ["Bad_Id", "-leading", "ab", "UPPER", "has space", "", "x".repeat(49)]) {
      expect(validateScenario(base({ id })), id).not.toEqual([]);
    }
  });

  test("accepts a maximal-length valid id", () => {
    expect(validateScenario(base({ id: `a${"b".repeat(46)}` }))).toEqual([]);
  });

  test("rejects a blank or whitespace-only label", () => {
    for (const label of ["", "   "]) {
      expect(validateScenario(base({ label })), JSON.stringify(label)).not.toEqual([]);
    }
  });

  test("rejects a tier outside 1..3", () => {
    expect(validateScenario(base({ tier: 4 as unknown as 1 }))).not.toEqual([]);
  });

  test("rejects non-array alerts or holds", () => {
    expect(validateScenario(base({ alerts: null as unknown as [] }))).not.toEqual([]);
    expect(validateScenario(base({ holds: undefined as unknown as [] }))).not.toEqual([]);
  });
});

describe("validateScenario - tier-scoped fields", () => {
  test("rejects bucket or degraded outside tier 2, independently", () => {
    expect(validateScenario(base({ tier: 1, degraded: true }))).not.toEqual([]);
    expect(validateScenario(base({ tier: 3, degraded: true }))).not.toEqual([]);
    expect(validateScenario(base({ tier: 1, bucket: {} }))).not.toEqual([]);
    expect(validateScenario(base({ tier: 3, bucket: {} }))).not.toEqual([]);
  });

  test("accepts bucket and degraded on tier 2", () => {
    expect(validateScenario(base({ tier: 2, degraded: true, bucket: {} }))).toEqual([]);
  });

  test("rejects a non-boolean degraded and a non-object bucket", () => {
    expect(validateScenario(base({ tier: 2, degraded: "yes" as unknown as boolean }))).not.toEqual(
      [],
    );
    expect(validateScenario(base({ tier: 2, bucket: 7 as unknown as object }))).not.toEqual([]);
  });
});

describe("validateScenario - alert rows", () => {
  test("rejects a malformed or empty alert code", () => {
    for (const code of ["", "lower_case", "1LEADING", "has space"]) {
      expect(validateScenario(base({ alerts: [alertRow({ code })] })), code).not.toEqual([]);
    }
  });

  test("rejects a context that is null, an array, or not an object", () => {
    for (const context of [null, [], "x", 7]) {
      expect(
        validateScenario(base({ alerts: [alertRow({ context: context as never })] })),
        JSON.stringify(context),
      ).not.toEqual([]);
    }
  });

  test("rejects a context carrying the reserved __devScenario key", () => {
    expect(
      validateScenario(base({ alerts: [alertRow({ context: { __devScenario: "x" } })] })),
    ).not.toEqual([]);
  });

  test("rejects an unparseable raised_at", () => {
    for (const raised_at of ["", "not-a-date", "2026-13-45T00:00:00Z"]) {
      expect(validateScenario(base({ alerts: [alertRow({ raised_at })] })), raised_at).not.toEqual(
        [],
      );
    }
  });

  test("rejects occurrence_count that is zero, negative, fractional, or non-finite", () => {
    for (const n of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        validateScenario(base({ alerts: [alertRow({ occurrence_count: n })] })),
        String(n),
      ).not.toEqual([]);
    }
  });

  test("rejects duplicate alert codes within one scenario", () => {
    expect(validateScenario(base({ alerts: [alertRow(), alertRow()] }))).not.toEqual([]);
  });

  test("rejects a malformed galleryIdentity but accepts null or absent", () => {
    expect(validateScenario(base({ alerts: [alertRow({ galleryIdentity: null })] }))).toEqual([]);
    expect(
      validateScenario(base({ alerts: [alertRow({ galleryIdentity: 7 as never })] })),
    ).not.toEqual([]);
    expect(
      validateScenario(base({ alerts: [alertRow({ galleryIdentity: { segments: 7 } as never })] })),
    ).not.toEqual([]);
  });
});

describe("validateScenario - per-code context contracts", () => {
  test("TILE_PROJECTION_FETCH_FAILED needs a string-array failedKeys", () => {
    const code = "TILE_PROJECTION_FETCH_FAILED";
    expect(validateScenario(base({ alerts: [alertRow({ code })] }))).not.toEqual([]);
    expect(
      validateScenario(base({ alerts: [alertRow({ code, context: { failedKeys: [1] } })] })),
    ).not.toEqual([]);
    expect(
      validateScenario(base({ alerts: [alertRow({ code, context: { failedKeys: ["a"] } })] })),
    ).toEqual([]);
  });

  test("SHOW_FIRST_PUBLISHED needs data_gaps with a positive total", () => {
    const code = "SHOW_FIRST_PUBLISHED";
    expect(validateScenario(base({ alerts: [alertRow({ code })] }))).not.toEqual([]);
    expect(
      validateScenario(
        base({ alerts: [alertRow({ code, context: { data_gaps: { total: 0, classes: {} } } })] }),
      ),
    ).not.toEqual([]);
    expect(
      validateScenario(
        base({ alerts: [alertRow({ code, context: { data_gaps: { total: 2, classes: {} } } })] }),
      ),
    ).toEqual([]);
  });

  test("PARSE_ERROR_LAST_GOOD needs an allowlisted error_code", () => {
    const code = "PARSE_ERROR_LAST_GOOD";
    expect(validateScenario(base({ alerts: [alertRow({ code })] }))).not.toEqual([]);
    expect(
      validateScenario(
        base({ alerts: [alertRow({ code, context: { error_code: "NOT_ALLOWLISTED" } })] }),
      ),
    ).not.toEqual([]);
  });

  test("ROLE_FLAGS_NOTICE needs exactly one named change", () => {
    const code = "ROLE_FLAGS_NOTICE";
    expect(validateScenario(base({ alerts: [alertRow({ code })] }))).not.toEqual([]);
    expect(
      validateScenario(
        base({
          alerts: [
            alertRow({ code, context: { changes: [{ crew_name: "A" }, { crew_name: "B" }] } }),
          ],
        }),
      ),
    ).not.toEqual([]);
    expect(
      validateScenario(
        base({ alerts: [alertRow({ code, context: { changes: [{ crew_name: "Dana Reed" }] } })] }),
      ),
    ).toEqual([]);
  });

  test("identity-dependent codes need a crew_member_id and one Crew segment", () => {
    for (const code of ["AMBIGUOUS_EMAIL_BINDING", "OAUTH_IDENTITY_CLAIMED"]) {
      expect(validateScenario(base({ alerts: [alertRow({ code })] })), code).not.toEqual([]);
      const ok = base({
        alerts: [
          alertRow({
            code,
            context: { crew_member_id: "3f8c1e2a-5b6d-4c7e-8f90-1a2b3c4d5e6f" },
            galleryIdentity: {
              segments: [{ label: "Crew", value: "Sam Ito" }],
            } as never,
          }),
        ],
      });
      expect(validateScenario(ok), code).toEqual([]);
    }
  });
});

describe("validateScenario - hold rows", () => {
  test("accepts a well-formed hold", () => {
    expect(validateScenario(base({ holds: [holdRow()] }))).toEqual([]);
  });

  test("rejects a domain or kind outside the CHECK sets", () => {
    expect(validateScenario(base({ holds: [holdRow({ domain: "nope" as never })] }))).not.toEqual(
      [],
    );
    expect(
      validateScenario(base({ holds: [holdRow({ kind: "undo_override" as never })] })),
    ).not.toEqual([]);
  });

  test("rejects blank entity_key or drive_file_id", () => {
    expect(validateScenario(base({ holds: [holdRow({ entity_key: "  " })] }))).not.toEqual([]);
    expect(validateScenario(base({ holds: [holdRow({ drive_file_id: "" })] }))).not.toEqual([]);
  });

  test("rejects a non-object held_value", () => {
    expect(validateScenario(base({ holds: [holdRow({ held_value: null as never })] }))).not.toEqual(
      [],
    );
  });

  test("rejects an unparseable base_modified_time", () => {
    expect(
      validateScenario(base({ holds: [holdRow({ base_modified_time: "nope" })] })),
    ).not.toEqual([]);
  });

  test("validates every Disposition variant, accepting valid and rejecting partial", () => {
    // valid
    expect(
      validateScenario(base({ holds: [holdRow({ proposed_value: { disposition: "removal" } })] })),
    ).toEqual([]);
    expect(
      validateScenario(
        base({
          holds: [
            holdRow({ proposed_value: { disposition: "rename", name: "Dana", email: null } }),
          ],
        }),
      ),
    ).toEqual([]);
    // invalid: email_change missing name
    expect(
      validateScenario(
        base({
          holds: [
            holdRow({ proposed_value: { disposition: "email_change", email: null } as never }),
          ],
        }),
      ),
    ).not.toEqual([]);
    // invalid: unknown disposition
    expect(
      validateScenario(
        base({ holds: [holdRow({ proposed_value: { disposition: "nope" } as never })] }),
      ),
    ).not.toEqual([]);
  });

  test("rejects a malformed reservation_collisions entry", () => {
    expect(
      validateScenario(
        base({ holds: [holdRow({ reservation_collisions: [{ name: 1 } as never] })] }),
      ),
    ).not.toEqual([]);
  });

  test("rejects duplicate (domain, entity_key) within one scenario", () => {
    expect(validateScenario(base({ holds: [holdRow(), holdRow()] }))).not.toEqual([]);
    // different entity_key is fine
    expect(
      validateScenario(base({ holds: [holdRow(), holdRow({ entity_key: "sam-ito" })] })),
    ).toEqual([]);
  });
});

describe("validateScenario - warnings", () => {
  test("accepts an absent and an empty warnings array, which mean different things", () => {
    expect(validateScenario(base())).toEqual([]);
    expect(validateScenario(base({ warnings: [] }))).toEqual([]);
  });

  test("rejects a blank code, a non-warn severity, or a blank message", () => {
    expect(
      validateScenario(base({ warnings: [{ severity: "warn", code: "", message: "x" }] })),
    ).not.toEqual([]);
    expect(
      validateScenario(base({ warnings: [{ severity: "info", code: "A_CODE", message: "x" }] })),
    ).not.toEqual([]);
    expect(
      validateScenario(base({ warnings: [{ severity: "warn", code: "A_CODE", message: "  " }] })),
    ).not.toEqual([]);
  });

  test("rejects a message containing its own raw code", () => {
    // Warnings materialize VERBATIM, so a code embedded here reaches the real
    // modal and escapes the §1.1 exception scope entirely.
    expect(
      validateScenario(
        base({
          warnings: [
            { severity: "warn", code: "BLOCK_DISAPPEARED", message: "BLOCK_DISAPPEARED happened" },
          ],
        }),
      ),
    ).not.toEqual([]);
    expect(
      validateScenario(
        base({
          warnings: [
            {
              severity: "warn",
              code: "BLOCK_DISAPPEARED",
              message: "Synthetic warning for gallery review.",
            },
          ],
        }),
      ),
    ).toEqual([]);
  });
});
