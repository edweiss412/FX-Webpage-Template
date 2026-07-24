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

  test("feedTruncated is tier-2-only and boolean", () => {
    expect(
      validateScenario(base({ tier: 1, feedTruncated: true } as Partial<AttentionScenario>)),
    ).toContainEqual(expect.stringContaining("feedTruncated"));
    expect(
      validateScenario(base({ tier: 3, feedTruncated: true } as Partial<AttentionScenario>)),
    ).toContainEqual(expect.stringContaining("feedTruncated"));
    expect(
      validateScenario(base({ tier: 2, feedTruncated: "yes" as unknown as boolean })),
    ).toContainEqual(expect.stringContaining("feedTruncated"));
    expect(validateScenario(base({ tier: 2, feedTruncated: true }))).toEqual([]);
  });
});

// ── Modal-state-coverage fields (plan Task 2; spec §3.0/§4) ──────────────────
import { validateScenario as vs } from "@/lib/dev/attentionScenarios/validate";
import type {
  AttentionScenario as MSCScenario,
  ScenarioChangeLogRow,
} from "@/lib/dev/attentionScenarios/types";

const mscBase = (over: Partial<MSCScenario>): MSCScenario => ({
  id: "t2-guard-x",
  tier: 2,
  label: "guard",
  alerts: [],
  holds: [],
  ...over,
});

const logRow = (over: Partial<ScenarioChangeLogRow> = {}): ScenarioChangeLogRow => ({
  occurred_at: "2026-07-01T11:00:00.000Z",
  status: "applied",
  summary: "A change",
  entity_ref: null,
  change_kind: "field_changed",
  individually_undoable: false,
  source: "auto_apply",
  acknowledged_at: null,
  ...over,
});

describe("validateScenario - modal-state fields: shape checks", () => {
  test("changeLog container and row shapes", () => {
    expect(vs(mscBase({ changeLog: "nope" as never }))).not.toEqual([]);
    expect(vs(mscBase({ changeLog: ["nope" as never] }))).not.toEqual([]);
    expect(vs(mscBase({ changeLog: [logRow({ summary: "  " })] }))).not.toEqual([]);
    expect(vs(mscBase({ changeLog: [logRow({ entity_ref: 7 as never })] }))).not.toEqual([]);
    expect(
      vs(mscBase({ changeLog: [logRow({ individually_undoable: "yes" as never })] })),
    ).not.toEqual([]);
    expect(vs(mscBase({ changeLog: [logRow({ status: "exploded" as never })] }))).not.toEqual([]);
    expect(vs(mscBase({ changeLog: [logRow({ source: "gremlin" as never })] }))).not.toEqual([]);
    expect(vs(mscBase({ changeLog: [logRow({ change_kind: "  " })] }))).not.toEqual([]);
    expect(vs(mscBase({ changeLog: [logRow({ occurred_at: "not-a-date" })] }))).not.toEqual([]);
    expect(vs(mscBase({ changeLog: [logRow({ acknowledged_at: "not-a-date" })] }))).not.toEqual([]);
    expect(vs(mscBase({ changeLog: [logRow({ change_kind: "use_raw_stale" })] }))).toEqual([]);
  });
  test("changeLog longer than the production page limit (50) is rejected", () => {
    const rows = Array.from({ length: 51 }, () => logRow());
    expect(vs(mscBase({ changeLog: rows }))).not.toEqual([]);
    expect(vs(mscBase({ changeLog: rows.slice(0, 50) }))).toEqual([]);
  });
  test("feedNull must be boolean; fixture/empty/volumes/share container shapes", () => {
    expect(vs(mscBase({ feedNull: "yes" as never }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: "nope" as never }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { empty: "crew" as never } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { volumes: "big" as never } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { share: "yes" as never } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { archived: "yes" as never } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { lastSyncStatus: 7 as never } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { empty: ["basement" as never] } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { volumes: { schedule: "big" as never } } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { volumes: { agenda: "big" as never } } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { volumes: { packlist: { cases: 13 } as never } } }))).not.toEqual(
      [],
    );
    expect(
      vs(mscBase({ fixture: { share: { linkActive: false as never, crewEmails: 3 } } })),
    ).not.toEqual([]);
    expect(vs(mscBase({ ignoreWarningIndexes: 1 as never }))).not.toEqual([]);
    expect(vs(mscBase({ ignoreWarningIndexes: [0.5] }))).not.toEqual([]);
  });
});

describe("validateScenario - modal-state fields: tier and cross-field guards", () => {
  test("all five fields are tier-2 only", () => {
    for (const [over, name] of [
      [{ changeLog: [logRow()] }, "changeLog"],
      [{ feedNull: true }, "feedNull"],
      [{ fixture: { archived: true, published: false } }, "fixture"],
      [{ ignoreWarningIndexes: [0] }, "ignoreWarningIndexes"],
      [{ landing: "overview" as const }, "landing"],
    ] as const) {
      // Assert the SPECIFIC tier-2-only message: any unrelated tier/ID error
      // would satisfy a bare non-empty assertion (review B P1).
      expect(vs({ ...mscBase(over as Partial<MSCScenario>), tier: 1 })).toContainEqual(
        expect.stringContaining(`${name}: tier 2 only`),
      );
      expect(vs({ ...mscBase(over as Partial<MSCScenario>), tier: 3 })).toContainEqual(
        expect.stringContaining(`${name}: tier 2 only`),
      );
    }
  });
  test("feedNull entry-exclusivity: emptiness equals absence", () => {
    expect(vs(mscBase({ feedNull: true, changeLog: [logRow()] }))).not.toEqual([]);
    expect(vs(mscBase({ feedNull: true, feedTruncated: true }))).not.toEqual([]);
    // The third exclusivity arm — HOLDS also contradict a null feed (review B P1
    // pinned each arm independently).
    expect(vs(mscBase({ feedNull: true, holds: [holdRow()] }))).toContainEqual(
      expect.stringContaining("feedNull: holds"),
    );
    expect(vs(mscBase({ feedNull: true, changeLog: [] }))).toEqual([]);
    expect(vs(mscBase({ feedNull: true }))).toEqual([]);
  });
  test("unknown fixture and volume keys are hard errors, never silent no-ops (review B P1)", () => {
    expect(vs(mscBase({ fixture: { typo: true } as never }))).toContainEqual(
      expect.stringContaining("fixture: unknown key typo"),
    );
    expect(vs(mscBase({ fixture: { volumes: { typo: 1 } } as never }))).toContainEqual(
      expect.stringContaining("fixture.volumes: unknown key typo"),
    );
  });
  test("empty hotels contradicts volumes.hotelGuests (review B P1)", () => {
    expect(
      vs(mscBase({ fixture: { empty: ["hotels"], volumes: { hotelGuests: 7 } } })),
    ).toContainEqual(expect.stringContaining("empty hotels contradicts volumes.hotelGuests"));
  });
  test("no-op knobs are rejected", () => {
    expect(vs(mscBase({ fixture: {} }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { empty: [] } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { volumes: {} } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { archived: false } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { published: true } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { lastSyncStatus: "ok" } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { neverSynced: false } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { alertFlash: false } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { volumes: { crew: 6 } } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { volumes: { rooms: 3 } } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { volumes: { hotels: 2 } } }))).not.toEqual([]);
  });
  test("volumes must be positive integers; empty×volumes contradictions", () => {
    expect(vs(mscBase({ fixture: { volumes: { crew: 0 } } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { volumes: { rooms: -2 } } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { volumes: { hotels: 1.5 } } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { empty: ["crew"], volumes: { crew: 31 } } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { empty: ["crew", "crew"] } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { volumes: { crew: 31 } } }))).toEqual([]);
  });
  test("lifecycle contradictions", () => {
    // Assert the SPECIFIC contradiction message: archived+published:true also
    // fails the base-default no-op guard, so a bare non-empty assertion would
    // survive deletion of the lifecycle guard (review B P1 tautology note).
    expect(vs(mscBase({ fixture: { archived: true, published: true } }))).toContainEqual(
      expect.stringContaining("atomically unpublished"),
    );
    // archived without an explicit published is its own error arm.
    expect(vs(mscBase({ fixture: { archived: true } }))).toContainEqual(
      expect.stringContaining("requires explicit published: false"),
    );
    expect(
      vs(mscBase({ fixture: { archived: true, published: false, finalizeOwned: true } })),
    ).not.toEqual([]);
    expect(vs(mscBase({ fixture: { isLive: true, published: false } }))).not.toEqual([]);
    expect(
      vs(mscBase({ fixture: { isLive: true, archived: true, published: false } })),
    ).not.toEqual([]);
    expect(vs(mscBase({ fixture: { isLive: true, datesAbsent: true } }))).not.toEqual([]);
    expect(
      vs(mscBase({ fixture: { datesAbsent: true, volumes: { schedule: "overflow" } } })),
    ).not.toEqual([]);
    expect(vs(mscBase({ fixture: { archived: true, published: false } }))).toEqual([]);
    expect(vs(mscBase({ fixture: { isLive: true } }))).toEqual([]);
  });
  test("sync shadow guards", () => {
    expect(vs(mscBase({ fixture: { neverSynced: true, lastSyncStatus: null } }))).not.toEqual([]);
    expect(
      vs(mscBase({ fixture: { neverSynced: true, lastSyncStatus: "drive_error" } })),
    ).not.toEqual([]);
    expect(vs(mscBase({ fixture: { neverSynced: true, checkedAbsent: true } }))).not.toEqual([]);
    expect(
      vs(mscBase({ fixture: { checkedAbsent: true, lastSyncStatus: "drive_error" } })),
    ).not.toEqual([]);
    expect(vs(mscBase({ fixture: { checkedAbsent: true, lastSyncStatus: null } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { neverSynced: true } }))).toEqual([]);
    expect(vs(mscBase({ fixture: { checkedAbsent: true } }))).toEqual([]);
  });
  test("agenda knob exclusivity", () => {
    expect(
      vs(mscBase({ fixture: { empty: ["agenda"], volumes: { agenda: "overflow" } } })),
    ).not.toEqual([]);
    expect(
      vs(mscBase({ fixture: { empty: ["agenda"], volumes: { agendaLinks: 7 } } })),
    ).not.toEqual([]);
    expect(
      vs(mscBase({ fixture: { volumes: { agenda: "overflow", agendaLinks: 7 } } })),
    ).not.toEqual([]);
  });
  test("diagramImages requires a diagrams-anchored alert", () => {
    expect(vs(mscBase({ fixture: { volumes: { diagramImages: 13 } } }))).not.toEqual([]);
    const anchored = mscBase({
      alerts: [
        {
          code: "EMBEDDED_ASSET_DRIFTED",
          context: {},
          raised_at: "2026-07-01T11:00:00.000Z",
          occurrence_count: 1,
        },
      ],
      fixture: { volumes: { diagramImages: 13 } },
    });
    expect(vs(anchored)).toEqual([]);
  });
  test("ignoreWarningIndexes guards", () => {
    const warn = (rawSnippet: string, code = "TYPO_NORMALIZED") => ({
      severity: "warn" as const,
      code,
      message: "m",
      rawSnippet,
    });
    expect(vs(mscBase({ warnings: [warn("a")], ignoreWarningIndexes: [1] }))).not.toEqual([]);
    expect(vs(mscBase({ warnings: [warn("a")], ignoreWarningIndexes: [0, 0] }))).not.toEqual([]);
    expect(vs(mscBase({ warnings: [warn("   ")], ignoreWarningIndexes: [0] }))).not.toEqual([]);
    // fingerprint collision: ignored and active share code + normalized snippet
    expect(
      vs(mscBase({ warnings: [warn("same"), warn("same")], ignoreWarningIndexes: [1] })),
    ).not.toEqual([]);
    expect(
      vs(mscBase({ warnings: [warn("aaa"), warn("bbb")], ignoreWarningIndexes: [1] })),
    ).toEqual([]);
  });
  test("share guards", () => {
    const share = (crewEmails: number) => ({ linkActive: true as const, crewEmails });
    expect(vs(mscBase({ fixture: { share: share(-1) } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { share: share(1.5) } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { share: share(501) } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { share: share(1), empty: ["crew"] } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { share: share(0), empty: ["crew"] } }))).toEqual([]);
    expect(vs(mscBase({ fixture: { share: share(40), volumes: { crew: 31 } } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { share: share(1), volumes: { crew: 501 } } }))).not.toEqual([]);
    expect(vs(mscBase({ fixture: { share: share(1), published: false } }))).not.toEqual([]);
    expect(
      vs(mscBase({ fixture: { share: share(1), archived: true, published: false } })),
    ).not.toEqual([]);
    expect(vs(mscBase({ fixture: { share: share(60) } }))).toEqual([]);
  });
  test("alertFlash requires a surviving derived alert item", () => {
    expect(vs(mscBase({ fixture: { alertFlash: true } }))).not.toEqual([]);
    const cutOnly = mscBase({
      alerts: [
        {
          code: "PICKER_EPOCH_RESET",
          context: {},
          raised_at: "2026-07-01T11:00:00.000Z",
          occurrence_count: 1,
        },
      ],
      fixture: { alertFlash: true },
    });
    expect(vs(cutOnly)).not.toEqual([]);
    const surviving = mscBase({
      alerts: [
        {
          code: "SHEET_UNAVAILABLE",
          context: {},
          raised_at: "2026-07-01T11:00:00.000Z",
          occurrence_count: 1,
        },
      ],
      fixture: { alertFlash: true },
    });
    expect(vs(surviving)).toEqual([]);
  });
  test("landing must be a GROUP_ORDER member", () => {
    expect(vs(mscBase({ landing: "attic" as never }))).not.toEqual([]);
    expect(vs(mscBase({ landing: "changes", changeLog: [logRow()] }))).toEqual([]);
  });
});

describe("validateScenario - actionOutcomes", () => {
  const warn = (rawSnippet: string, code = "TYPO_NORMALIZED") => ({
    severity: "warn" as const,
    code,
    message: "m",
    rawSnippet,
  });

  test("tier 2 only", () => {
    const s = {
      ...mscBase({}),
      tier: 1,
      actionOutcomes: { resync: { kind: "pending" } },
    } as MSCScenario;
    expect(vs(s)).toContainEqual(expect.stringContaining("actionOutcomes: tier 2 only"));
  });

  test("empty object is a no-op script", () => {
    expect(vs(mscBase({ actionOutcomes: {} }))).toContainEqual(
      expect.stringContaining("actionOutcomes: empty object is a no-op"),
    );
  });

  test("unknown keys and bad kinds are hard errors", () => {
    expect(vs(mscBase({ actionOutcomes: { typo: { kind: "pending" } } as never }))).toContainEqual(
      expect.stringContaining("actionOutcomes: unknown key typo"),
    );
    expect(
      vs(mscBase({ actionOutcomes: { setPublished: { kind: "nope" } } as never })),
    ).toContainEqual(expect.stringContaining("actionOutcomes.setPublished: kind"));
  });

  test("error codes must be non-blank; resync codes closed-union", () => {
    expect(
      vs(mscBase({ actionOutcomes: { setPublished: { kind: "error", code: "  " } } })),
    ).toContainEqual(
      expect.stringContaining("actionOutcomes.setPublished: error code must be non-blank"),
    );
    expect(
      vs(mscBase({ actionOutcomes: { resync: { kind: "error", code: "MADE_UP" } } as never })),
    ).toContainEqual(expect.stringContaining("actionOutcomes.resync: code must be one of"));
    expect(
      vs(mscBase({ actionOutcomes: { resync: { kind: "shrink_held", detail: " " } } })),
    ).toContainEqual(expect.stringContaining("shrink_held detail must be non-blank"));
  });

  test("feed-arm reachability uses the real shaper, not raw status", () => {
    // status:"pending" row is NOT acceptable (acceptable = auto_apply + applied + unacknowledged)
    expect(
      vs(
        mscBase({
          changeLog: [logRow({ status: "pending" })],
          actionOutcomes: { accept: { kind: "pending" } },
        }),
      ),
    ).toContainEqual(expect.stringContaining("actionOutcomes.accept: unreachable"));
    // default logRow IS acceptable
    expect(
      vs(
        mscBase({
          changeLog: [logRow()],
          actionOutcomes: { accept: { kind: "pending" }, acceptAll: { kind: "pending" } },
        }),
      ),
    ).toEqual([]);
    // acceptable-but-not-undoable row cannot script undo
    expect(
      vs(
        mscBase({
          changeLog: [logRow({ change_kind: "use_raw_stale" })],
          actionOutcomes: { undo: { kind: "pending" } },
        }),
      ),
    ).toContainEqual(expect.stringContaining("actionOutcomes.undo: unreachable"));
    // undo-armed row can
    expect(
      vs(
        mscBase({
          changeLog: [logRow({ change_kind: "crew_added", individually_undoable: true })],
          actionOutcomes: { undo: { kind: "pending" } },
        }),
      ),
    ).toEqual([]);
  });

  test("approve/reject need a pending hold; resolve needs an ACTIONABLE item", () => {
    expect(vs(mscBase({ actionOutcomes: { approve: { kind: "pending" } } }))).toContainEqual(
      expect.stringContaining("actionOutcomes.approve: unreachable"),
    );
    expect(vs(mscBase({ actionOutcomes: { resolve: { kind: "pending" } } }))).toContainEqual(
      expect.stringContaining("actionOutcomes.resolve: unreachable"),
    );
  });

  test("bulkIgnore needs a >=2 distinct-content group; okCount in range", () => {
    // identical snippets collapse to one fingerprint -> group size 1 -> unreachable
    expect(
      vs(
        mscBase({
          warnings: [warn("same"), warn("same")],
          actionOutcomes: { bulkIgnore: { kind: "fail" } },
        }),
      ),
    ).toContainEqual(expect.stringContaining("actionOutcomes.bulkIgnore: unreachable"));
    expect(
      vs(
        mscBase({
          warnings: [warn("a"), warn("b"), warn("c")],
          actionOutcomes: { bulkIgnore: { kind: "partial", okCount: 3 } },
        }),
      ),
    ).toContainEqual(expect.stringContaining("okCount"));
    expect(
      vs(
        mscBase({
          warnings: [warn("a"), warn("b"), warn("c")],
          actionOutcomes: { bulkIgnore: { kind: "partial", okCount: 2 } },
        }),
      ),
    ).toEqual([]);
  });

  test("lifecycle + share reachability", () => {
    expect(
      vs(mscBase({ fixture: { archived: true }, actionOutcomes: { resync: { kind: "pending" } } })),
    ).toContainEqual(expect.stringContaining("actionOutcomes.resync: unreachable"));
    expect(
      vs(
        mscBase({
          fixture: { finalizeOwned: true },
          actionOutcomes: { setPublished: { kind: "pending" } },
        }),
      ),
    ).toContainEqual(expect.stringContaining("actionOutcomes.setPublished: unreachable"));
    expect(
      vs(
        mscBase({
          fixture: { volumes: { crew: 40 } },
          actionOutcomes: { crewReset: { kind: "pending" } },
        }),
      ),
    ).toContainEqual(expect.stringContaining("actionOutcomes.crewReset: unreachable"));
    expect(vs(mscBase({ actionOutcomes: { rotate: { kind: "error" } } }))).toContainEqual(
      expect.stringContaining("actionOutcomes.rotate: unreachable"),
    );
    expect(
      vs(
        mscBase({
          fixture: { share: { linkActive: true, crewEmails: 3 } },
          actionOutcomes: {
            rotate: { kind: "success" },
            everyoneReset: { kind: "success" },
            crewReset: { kind: "success" },
          },
        }),
      ),
    ).toEqual([]);
  });
});

describe("validateScenario - actionOutcomes (whole-diff R1 repairs)", () => {
  test("archive is unreachable while finalize-owned (lifecycle section omitted)", () => {
    expect(
      vs(mscBase({ fixture: { finalizeOwned: true }, actionOutcomes: { archive: { kind: "error", code: "FINALIZE_OWNED_SHOW" } } })),
    ).toContainEqual(expect.stringContaining("actionOutcomes.archive: unreachable"));
  });
  test("resolve requires an ACTIONABLE ALERT item - actionable holds do not mount the button", () => {
    const holdRow = {
      drive_file_id: "df", domain: "crew_email" as const, entity_key: "Casey",
      held_value: {}, proposed_value: { disposition: "email_change", name: "Casey", email: "c@x.test" },
      base_modified_time: "2026-07-01T10:00:00.000Z", kind: "mi11_pending" as const,
    };
    expect(
      vs(mscBase({ holds: [holdRow as never], actionOutcomes: { resolve: { kind: "pending" } } })),
    ).toContainEqual(expect.stringContaining("actionOutcomes.resolve: unreachable"));
  });
  test("resync success outcome outside the closed union is rejected", () => {
    expect(
      vs(mscBase({ actionOutcomes: { resync: { kind: "success", outcome: "exploded" } } as never })),
    ).toContainEqual(expect.stringContaining("success outcome must be one of"));
  });
  test("malformed payloads report kind errors without throwing in reachability", () => {
    expect(() =>
      vs(mscBase({ actionOutcomes: { bulkIgnore: null } as never })),
    ).not.toThrow();
    expect(
      vs(mscBase({ actionOutcomes: { bulkIgnore: null } as never })),
    ).toContainEqual(expect.stringContaining("actionOutcomes.bulkIgnore: kind"));
  });
});
