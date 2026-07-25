/**
 * tests/adminAlerts/alertIdentityMatrix.test.ts (spec §9.1, Task-4 brief Step
 * 1b — Codex P11)
 *
 * The exhaustive code x context table test: for each of the 42
 * `admin_alerts` codes, a fixture using the REAL raise site's context shape
 * (verified by grep against the producer at the cited file:line — never a
 * synthetic key a producer never emits) is projected through
 * `projectIdentityContext` and resolved through `resolveAlertIdentities`
 * against a seeded crew/show lookup. Names in assertions are read back from
 * the seeded lookup fixture, never hardcoded (anti-tautology).
 *
 * A helper cross-check (`assertMapReadsAtLeastOneFixtureKey`) proves every
 * non-global code's fixture supplies >=1 key the identity map actually
 * reads for that code — the WATCH_CHANNEL_ORPHANED trap: a code marked
 * entity-bearing whose producer writes no map-readable key would otherwise
 * silently render nothing and still pass.
 */
import { describe, expect, it } from "vitest";
import { resolveAlertIdentities, type ResolverRow } from "@/lib/adminAlerts/resolveAlertIdentities";
import { describeAlert } from "@/lib/adminAlerts/describeAlert";
import { projectIdentityContext } from "@/lib/adminAlerts/projectIdentityContext";
import { ALERT_IDENTITY_MAP, type SegmentSpec } from "@/lib/adminAlerts/alertIdentityMap";
import { ADMIN_ALERTS_CODES } from "./adminAlertCodes.fixture";
import {
  PRODUCER_CONTEXT_LIST,
  type ProducerContextEntry,
  CREW_ID,
  OTHER_SHOW_CREW_ID,
  SHOW_ID,
  DRIVE_FILE_ID,
  CREW_NAME,
} from "./producerContexts";

const SHOW_TITLE = "Seeded Show Title";

function fakeSupabase() {
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            in(col: string, ids: string[]) {
              return {
                async limit() {
                  if (table === "crew_members") {
                    const rows = [
                      { id: CREW_ID, show_id: SHOW_ID, name: CREW_NAME },
                      {
                        id: OTHER_SHOW_CREW_ID,
                        show_id: "cccccccc-0000-4000-8000-000000000002",
                        name: "Wrong Show Crew",
                      },
                    ].filter((r) => ids.includes(r.id));
                    return { data: rows, error: null };
                  }
                  if (col === "id") {
                    const rows = [{ id: SHOW_ID, title: SHOW_TITLE, slug: "seeded" }].filter((r) =>
                      ids.includes(r.id),
                    );
                    return { data: rows, error: null };
                  }
                  const rows = [
                    { drive_file_id: DRIVE_FILE_ID, title: SHOW_TITLE, slug: "seeded" },
                  ].filter((r) => ids.includes(r.drive_file_id));
                  return { data: rows, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
  return client;
}

type Fixture = ProducerContextEntry;

// Single source (spec §3): the per-code producer contexts moved to
// producerContexts.ts so the gallery scenario catalog reads the SAME
// description of what each producer writes. This binding keeps every
// array-based assertion below unchanged.
const FIXTURES: Fixture[] = PRODUCER_CONTEXT_LIST;

function assertMapReadsAtLeastOneFixtureKey(fixture: Fixture, entry: { segments: SegmentSpec[] }) {
  const readableKeys = new Set<string>();
  // A showName/sheetName segment can be satisfied by the row's OWN show_id
  // COLUMN (the common case — most producers pass `showId` directly to
  // upsertAdminAlert, e.g. ASSET_RECOVERY_*/PENDING_SNAPSHOT_*/REPORT_*),
  // not just a context key — the resolver's "effective show" precedence
  // (spec §3.2) checks `row.show_id` FIRST.
  if (fixture.showId) readableKeys.add("__row.show_id__");
  for (const seg of entry.segments) {
    if (seg.kind === "crewName") readableKeys.add(seg.key);
    if (seg.kind === "contextField") readableKeys.add(seg.key);
    if (seg.kind === "count") readableKeys.add(seg.key);
    if (seg.kind === "showName" || seg.kind === "sheetName") {
      readableKeys.add("show_id");
      readableKeys.add("drive_file_id");
    }
    if (seg.kind === "email") {
      readableKeys.add("email");
      readableKeys.add("user_email");
    }
  }
  const contextKeys = new Set(Object.keys(fixture.context));
  const overlap = [...readableKeys].some((k) => k === "__row.show_id__" || contextKeys.has(k));
  expect(
    overlap,
    `${fixture.code}: fixture supplies no key the identity map reads (${[...readableKeys].join(",")})`,
  ).toBe(true);
}

// Derives, from the fixture's OWN context/showId shape (never from the
// resolver's implementation), which literal substrings a correctly-working
// resolver MUST surface for a non-global, entity-bearing fixture. Used to
// assert against the rendered describeAlert() string so a regression that
// drops ALL resolved segments (e.g. resolveShowSegment/resolveCrewSegment
// always returning null) fails this test — an empty string trivially
// clears `not.toContain`, so that assertion alone cannot catch this class.
function deriveExpectedTokens(fixture: Fixture, entry: { segments: SegmentSpec[] }): string[] {
  const ctx = fixture.context;
  const tokens: string[] = [];
  for (const seg of entry.segments) {
    if (seg.kind === "showName" || seg.kind === "sheetName") {
      const showIdCtx = typeof ctx.show_id === "string" ? ctx.show_id : undefined;
      const driveFileIdCtx = typeof ctx.drive_file_id === "string" ? ctx.drive_file_id : undefined;
      if (fixture.showId === SHOW_ID || showIdCtx === SHOW_ID || driveFileIdCtx === DRIVE_FILE_ID) {
        tokens.push(SHOW_TITLE);
      }
    } else if (seg.kind === "crewName") {
      if (ctx[seg.key] === CREW_ID) tokens.push(CREW_NAME);
    } else if (seg.kind === "contextField") {
      if (seg.key === "role_change_crew_names" && Array.isArray(ctx.changes)) {
        const names = ctx.changes
          .map((c) =>
            c && typeof c === "object" ? (c as Record<string, unknown>).crew_name : undefined,
          )
          .filter((n): n is string => typeof n === "string")
          .slice(0, 3);
        if (names.length > 0) tokens.push(names.join(", "));
      } else if (seg.key === "failed_sheet_names" && Array.isArray(ctx.failed_sheet_names)) {
        const names = ctx.failed_sheet_names
          .filter((n): n is string => typeof n === "string")
          .slice(0, 3);
        if (names.length > 0) tokens.push(names.join(", "));
      } else {
        const raw = ctx[seg.key];
        if (typeof raw === "string") tokens.push(raw);
      }
    } else if (seg.kind === "count") {
      // Mirrors formatCount's label convention (resolveAlertIdentities.ts:108-115)
      // closely enough for a substring match — exact pluralization is
      // covered by the dedicated ROLE_FLAGS_NOTICE test.
      if (seg.key === "role_change_count" && Array.isArray(ctx.changes)) {
        tokens.push(`${ctx.changes.length} role change`);
      }
      if (seg.key === "crew_member_count" && Array.isArray(ctx.crew_member_ids)) {
        tokens.push(`${ctx.crew_member_ids.length} crew row`);
      }
    } else if (seg.kind === "email") {
      // Mirrors resolveAlertIdentities.ts:70-72 EMAIL_FIELD_BY_CODE: OAuth
      // email is authoritative only for OAUTH_IDENTITY_CLAIMED.
      const field = fixture.code === "OAUTH_IDENTITY_CLAIMED" ? "user_email" : "email";
      const raw = ctx[field];
      if (typeof raw === "string") tokens.push(raw);
    }
  }
  return tokens;
}

describe("ALERT_IDENTITY_MAP x context (spec §9.1 exhaustive matrix)", () => {
  it("covers exactly the 45 registered codes (numeric-sweep anchor)", () => {
    expect(FIXTURES.map((f) => f.code).sort()).toEqual([...ADMIN_ALERTS_CODES].sort());
  });

  it("every non-global fixture supplies >=1 key the identity map reads (the WATCH_CHANNEL_ORPHANED trap)", () => {
    for (const fixture of FIXTURES) {
      const entry = ALERT_IDENTITY_MAP[fixture.code];
      if (!entry || "kind" in entry) continue;
      assertMapReadsAtLeastOneFixtureKey(fixture, entry);
    }
  });

  it.each(FIXTURES)("$code produces the identity its map entry declares", async (fixture) => {
    const entry = ALERT_IDENTITY_MAP[fixture.code];
    expect(entry, `missing map entry for ${fixture.code}`).toBeDefined();

    const identityContext = projectIdentityContext(fixture.context, { includePii: true });
    const row: ResolverRow = {
      id: `row-${fixture.code}`,
      code: fixture.code,
      show_id: fixture.showId,
      occurrence_count: fixture.occurrenceCount ?? 1,
      identityContext,
    };

    const result = await resolveAlertIdentities([row], fakeSupabase(), { includePii: true });
    expect(result.kind).toBe("ok");
    const identity = result.identities.get(row.id)!;

    if (!entry || "kind" in entry) {
      expect(identity.global).toBe(true);
      expect(identity.segments).toEqual([]);
      expect(describeAlert(identity)).toBeNull();
      return;
    }

    expect(identity.global).toBe(false);
    // Invariant 5 (no raw diagnostics): no segment ever contains a raw
    // error code / SQLSTATE / error-class name / free-form error message.
    const rendered = describeAlert(identity) ?? "";
    for (const banned of ["42501", "PGRST116", "TypeError", "rpc_error", "error_name", "reason"]) {
      expect(rendered).not.toContain(banned);
    }

    // Anti-tautology armor (Finding 1): every non-global fixture above
    // supplies resolvable context, so a regression that silently drops all
    // resolved segments must fail here, not pass because an empty string
    // trivially clears `not.toContain`.
    expect(
      identity.segments.length,
      `${fixture.code}: expected >=1 resolved segment for this entity-bearing fixture`,
    ).toBeGreaterThan(0);
    expect(
      rendered.length,
      `${fixture.code}: expected a non-empty rendered identity`,
    ).toBeGreaterThan(0);
    const expectedTokens = deriveExpectedTokens(fixture, entry);
    for (const token of expectedTokens) {
      expect(
        rendered,
        `${fixture.code}: rendered output missing expected token "${token}" (derived from the fixture, not the implementation)`,
      ).toContain(token);
    }
  });

  it("WIZARD_SESSION_SUPERSEDED_RACE: missing file_name drops the Sheet segment, Action still renders", async () => {
    const fixture = FIXTURES.find((f) => f.code === "WIZARD_SESSION_SUPERSEDED_RACE")!;
    const identityContext = projectIdentityContext(fixture.context, { includePii: true });
    const row: ResolverRow = {
      id: "wizard-row",
      code: fixture.code,
      show_id: fixture.showId,
      occurrence_count: 1,
      identityContext,
    };
    const result = await resolveAlertIdentities([row], fakeSupabase(), { includePii: true });
    const identity = result.identities.get("wizard-row")!;
    expect(identity.segments).toEqual([{ label: "Action", value: "retry" }]);
  });

  it("WIZARD_SESSION_SUPERSEDED_RACE with file_name present (post-§5c producer shape) renders Sheet + Action, no shows row needed", async () => {
    const identityContext = projectIdentityContext(
      { file_name: "Onboarding Sheet.xlsx", attempted_action: "apply" },
      { includePii: true },
    );
    const row: ResolverRow = {
      id: "wizard-row-2",
      code: "WIZARD_SESSION_SUPERSEDED_RACE",
      show_id: null,
      occurrence_count: 1,
      identityContext,
    };
    const result = await resolveAlertIdentities([row], fakeSupabase(), { includePii: true });
    const identity = result.identities.get("wizard-row-2")!;
    expect(identity.segments).toEqual([
      { label: "Sheet", value: "Onboarding Sheet.xlsx" },
      { label: "Action", value: "apply" },
    ]);
    expect(describeAlert(identity)).toBe("Sheet: Onboarding Sheet.xlsx · Action: apply");
  });

  it("PICKER_BOOTSTRAP_RPC_FAILED: show resolves via identityContext.show_id even though the row.show_id column is null (§5b)", async () => {
    const fixture = FIXTURES.find((f) => f.code === "PICKER_BOOTSTRAP_RPC_FAILED")!;
    const identityContext = projectIdentityContext(fixture.context, { includePii: true });
    const row: ResolverRow = {
      id: "bootstrap-row",
      code: fixture.code,
      show_id: null,
      occurrence_count: 1,
      identityContext,
    };
    const result = await resolveAlertIdentities([row], fakeSupabase(), { includePii: true });
    const identity = result.identities.get("bootstrap-row")!;
    expect(identity).toEqual({ segments: [{ label: "Show", value: SHOW_TITLE }], global: false });
  });

  it("ROLE_FLAGS_NOTICE: nested changes[] projects to role_change_crew_names + role_change_count, never raw flags", async () => {
    const fixture = FIXTURES.find((f) => f.code === "ROLE_FLAGS_NOTICE")!;
    const identityContext = projectIdentityContext(fixture.context, { includePii: true });
    expect(identityContext.display).not.toHaveProperty("changes");
    const row: ResolverRow = {
      id: "role-flags-row",
      code: fixture.code,
      show_id: fixture.showId,
      occurrence_count: 1,
      identityContext,
    };
    const result = await resolveAlertIdentities([row], fakeSupabase(), { includePii: true });
    const identity = result.identities.get("role-flags-row")!;
    expect(identity.segments).toEqual([
      { label: "Sheet", value: SHOW_TITLE },
      { label: "Crew", value: CREW_NAME },
      { label: null, value: "1 role change" },
    ]);
    const rendered = describeAlert(identity) ?? "";
    expect(rendered).not.toMatch(/LEAD/);
  });
});
