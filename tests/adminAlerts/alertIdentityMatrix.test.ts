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

const CREW_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_SHOW_CREW_ID = "aaaaaaaa-0000-4000-8000-000000000099";
const SHOW_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const DRIVE_FILE_ID = "1N1PKmhcvLAn5UwHLn4Rplm1yeVeYMvwfL3eOzB4McnY";

const CREW_NAME = "Seeded Crew Member";
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

type Fixture = {
  code: string;
  showId: string | null;
  /** The exact context shape the code's real producer writes (cited below). */
  context: Record<string, unknown>;
  occurrenceCount?: number;
};

// Every fixture below cites the raise site it mirrors. Codes declared
// `global` in ALERT_IDENTITY_MAP carry whatever the real producer writes
// (or a minimal realistic shape) since no segment is ever expected.
const FIXTURES: Fixture[] = [
  // 1. lib/auth/validateGoogleSession.ts:36-44 upsertAmbiguousEmailAlert
  {
    code: "AMBIGUOUS_EMAIL_BINDING",
    showId: SHOW_ID,
    context: { email: "shared@gmail.com", crew_member_ids: [CREW_ID, OTHER_SHOW_CREW_ID] },
  },
  // 2. app/auth/callback/route.ts:134-142
  {
    code: "OAUTH_IDENTITY_CLAIMED",
    showId: SHOW_ID,
    context: {
      crew_member_id: CREW_ID,
      show_id: SHOW_ID,
      claimed_at_millis: 1,
      user_email: "jane@gmail.com",
    },
  },
  // 3. app/api/auth/picker-bootstrap/route.ts:95-104 (§5b: show_id lives in context, row stays null-scoped)
  {
    code: "PICKER_BOOTSTRAP_RPC_FAILED",
    showId: null,
    context: {
      show_id: SHOW_ID,
      attempted_email_hash: "h",
      rpc_error_code: "42501",
      rpc_error_message: "boom",
      route: "picker-bootstrap",
    },
  },
  // 4. app/api/auth/picker-bootstrap/route.ts:72-82 — global (no resolvable show)
  {
    code: "PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED",
    showId: null,
    context: {
      stage: "resolve_show",
      slug: "some-slug",
      rpc_error_code: "PGRST116",
      rpc_error_message: "not found",
      route: "picker-bootstrap",
    },
  },
  // 5. app/auth/callback/route.ts:161-166 — global
  { code: "CALLBACK_CLAIM_THREW", showId: null, context: { error_name: "TypeError" } },
  // 6. lib/auth/picker/cleanupStaleEntry.ts:105-113
  {
    code: "PICKER_SELECTION_RACE",
    showId: SHOW_ID,
    context: { show_id: SHOW_ID, stale_epoch: 1, stale_crew_member_id: CREW_ID },
  },
  // 7. lib/auth/picker/resetPickerEpoch.ts:27-34
  {
    code: "PICKER_EPOCH_RESET",
    showId: SHOW_ID,
    context: { show_id: SHOW_ID, new_epoch: 2, admin_email_hash: "h" },
  },
  // 8. lib/sync/assetRecovery.ts:500-504 — showId is the row column
  {
    code: "ASSET_RECOVERY_BYTES_EXCEEDED",
    showId: SHOW_ID,
    context: { snapshotRevisionId: "rev-1" },
  },
  // 9. lib/sync/assetRecovery.ts:518-524
  {
    code: "ASSET_RECOVERY_REVISION_DRIFT",
    showId: SHOW_ID,
    context: { snapshotRevisionId: "rev-1", currentSnapshotRevisionId: "rev-2" },
  },
  // 10. lib/sync/assetRecovery.ts:481-485
  {
    code: "ASSET_RECOVERY_DRIFT_COOLDOWN",
    showId: SHOW_ID,
    context: { snapshotRevisionId: "rev-1" },
  },
  // 11. lib/drive/watch.ts:443-449 markWatchOrphanedWithTx — global
  {
    code: "WATCH_CHANNEL_ORPHANED",
    showId: null,
    context: {
      watched_folder_id: "folder-1",
      channel_id: "chan-1",
      reason: "watch_create_failed",
      error_class: "drive_api",
      error_message: "timeout",
    },
  },
  // 12. app/api/drive/webhook/route.ts:297-301 — global
  {
    code: "WEBHOOK_TOKEN_INVALID",
    showId: null,
    context: { channel_id: "chan-1", reason: "token_mismatch" },
  },
  // 13. lib/sync/assetRecovery.ts:589-592 — showId is the row column
  {
    code: "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
    showId: SHOW_ID,
    context: { snapshotRevisionId: "rev-1" },
  },
  // 14. lib/sync/runOnboardingScan.ts:829-840
  {
    code: "LIVE_ROW_CONFLICT",
    showId: null,
    context: {
      drive_file_id: DRIVE_FILE_ID,
      file_name: "Onboarding Sheet.xlsx",
      folder_id: "folder-1",
      wizard_session_id: "wiz-1",
      sqlstate: "23505",
      kind: "duplicate",
    },
  },
  // 15. lib/sync/phase2.ts:423-432 — showId is the RoleFlagsNotice.showId (the row column)
  {
    code: "ROLE_FLAGS_NOTICE",
    showId: SHOW_ID,
    context: {
      drive_file_id: DRIVE_FILE_ID,
      changes: [{ crew_name: CREW_NAME, prior_flags: ["LEAD"], new_flags: [] }],
    },
  },
  // 16. lib/sync/runManualSyncForShow.ts:228-237
  {
    code: "DRIVE_FETCH_FAILED",
    showId: SHOW_ID,
    context: {
      drive_file_id: DRIVE_FILE_ID,
      failure_code: "SYNC_INFRA_ERROR",
      previous_last_seen_modified_time: null,
      sheet_name: "My Sheet",
    },
  },
  // 17. global — already SPECIFIC in copy
  {
    code: "PARSE_ERROR_LAST_GOOD",
    showId: SHOW_ID,
    context: { drive_file_id: DRIVE_FILE_ID, sheet_name: "My Sheet" },
  },
  // 18. global — already SPECIFIC in copy
  {
    code: "SHEET_UNAVAILABLE",
    showId: SHOW_ID,
    context: { drive_file_id: DRIVE_FILE_ID, sheet_name: "My Sheet" },
  },
  // 18b. global — already SPECIFIC in copy
  {
    code: "RESYNC_SHRINK_HELD",
    showId: SHOW_ID,
    context: { drive_file_id: DRIVE_FILE_ID, sheet_name: "My Sheet" },
  },
  // 19. lib/notify/detect/stall.ts:15 — global
  { code: "SYNC_STALLED", showId: null, context: {} },
  // 20. lib/notify/deliver.ts:380-384 — showId is the row column, context often {}
  { code: "EMAIL_DELIVERY_FAILED", showId: SHOW_ID, context: {} },
  // 21. lib/notify/detect/emailDeliveryFailed.ts:306 — global
  { code: "EMAIL_NOT_CONFIGURED", showId: null, context: {} },
  // 22. lib/sync/runScheduledCronSync.ts:2017-2024 — global (already SPECIFIC in copy)
  {
    code: "SHOW_FIRST_PUBLISHED",
    showId: SHOW_ID,
    context: {
      drive_file_id: DRIVE_FILE_ID,
      sheet_name: "My Sheet",
      crew_count: 4,
      show_date: "2026-08-01",
    },
  },
  // 23. lib/sync/unpublishShow.ts:238-245 — global (already SPECIFIC in copy)
  {
    code: "SHOW_UNPUBLISHED",
    showId: SHOW_ID,
    context: { drive_file_id: DRIVE_FILE_ID, sheet_name: "My Sheet" },
  },
  // 24. lib/sync/diagramGc.ts:301-309 emitStuckAlerts — showId is the row column
  {
    code: "PENDING_SNAPSHOT_PROMOTE_STUCK",
    showId: SHOW_ID,
    context: { snapshot_revision_id: "rev-1", promote_started_at: "2026-01-01T00:00:00Z" },
  },
  // 25. lib/sync/promoteSnapshot.ts:139-153 emitRollbackStuckAlert — showId is the row column
  {
    code: "PENDING_SNAPSHOT_ROLLBACK_STUCK",
    showId: SHOW_ID,
    context: { snapshot_revision_id: "rev-1", error: "storage timeout" },
  },
  // 26. lib/sync/diagramGc.ts:318-326 — showId is the row column
  {
    code: "PENDING_SNAPSHOT_DELETE_STUCK",
    showId: SHOW_ID,
    context: { snapshot_revision_id: "rev-1", delete_started_at: "2026-01-01T00:00:00Z" },
  },
  // 27-30. lib/sync/applyStaged.ts:1856-1862 — showId is result.showId (the row column); context is
  // always exactly { drive_file_id } for this whole family (verifyReelOnApply.ts warning codes).
  {
    code: "OPENING_REEL_PERMISSION_DENIED",
    showId: SHOW_ID,
    context: { drive_file_id: DRIVE_FILE_ID },
  },
  { code: "OPENING_REEL_NOT_VIDEO", showId: SHOW_ID, context: { drive_file_id: DRIVE_FILE_ID } },
  { code: "REEL_DRIFTED", showId: SHOW_ID, context: { drive_file_id: DRIVE_FILE_ID } },
  { code: "EMBEDDED_ASSET_DRIFTED", showId: SHOW_ID, context: { drive_file_id: DRIVE_FILE_ID } },
  // 31. lib/reports/submit.ts resolveStateGatedAlert family — showId is reports.show_id (the row column)
  { code: "REPORT_ORPHANED_LOST_LEASE", showId: SHOW_ID, context: { idempotency_key: "idem-1" } },
  { code: "REPORT_LOOKUP_INCONCLUSIVE", showId: SHOW_ID, context: { code: "LOOKUP_FAILED" } },
  { code: "GITHUB_BOT_LOGIN_MISSING", showId: null, context: { code: "BOT_LOGIN_MISSING" } },
  {
    code: "REPORT_DUPLICATE_LIVE_MATCHES",
    showId: SHOW_ID,
    context: { code: "DUPLICATE_LIVE_MATCHES" },
  },
  {
    code: "REPORT_OPEN_ORPHAN_LABEL",
    showId: SHOW_ID,
    context: { code: "OPEN_ISSUE_WITH_ORPHAN_LABEL" },
  },
  // lib/reports/submit.ts:846-856 — showId is the row column
  {
    code: "REPORT_LEASE_THRASHING",
    showId: SHOW_ID,
    context: { idempotency_key: "idem-1", depth: 3 },
  },
  // app/api/cron/report-reaper/route.ts:72-86 — showId is the row column
  {
    code: "STALE_ORPHAN_REPORT",
    showId: SHOW_ID,
    context: {
      report_id: "report-1",
      idempotency_key: "idem-1",
      created_at: "2026-01-01T00:00:00Z",
      lease_holder: "lease-1",
    },
  },
  // 38-39. global — already SPECIFIC in copy
  {
    code: "TILE_SERVER_RENDER_FAILED",
    showId: SHOW_ID,
    context: { drive_file_id: DRIVE_FILE_ID, sheet_name: "My Sheet", section: "budget" },
  },
  {
    code: "TILE_PROJECTION_FETCH_FAILED",
    showId: SHOW_ID,
    context: { drive_file_id: DRIVE_FILE_ID, sheet_name: "My Sheet" },
  },
  // 40-41. scripts/verify-branch-protection.ts:262-268/322-328 — global (system-wide, no show)
  {
    code: "BRANCH_PROTECTION_DRIFT",
    showId: null,
    context: { failures: ["+required_pr_review"], repo: "org/repo", ts: "2026-01-01T00:00:00Z" },
  },
  {
    code: "BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
    showId: null,
    context: { status: "auth_failed", repo: "org/repo" },
  },
  // 42. Current real raise-site shape (app/api/admin/onboarding/*/route.ts, all 4 emitters) —
  // `file_name` is NOT yet in context (that is the separate §5c producer-edit task); this
  // fixture proves the guard "missing context key -> Sheet segment dropped, Action still renders".
  {
    code: "WIZARD_SESSION_SUPERSEDED_RACE",
    showId: null,
    context: {
      attempted_action: "retry",
      superseded_session_id: "sess-old",
      current_session_id: "sess-new",
      pending_ingestion_id: "pi-1",
      drive_file_id: DRIVE_FILE_ID,
    },
  },
];

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
  it("covers exactly the 43 registered codes (numeric-sweep anchor)", () => {
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
