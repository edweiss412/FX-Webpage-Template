/**
 * tests/adminAlerts/resolveAlertIdentities.test.ts (spec §3.2 / §9.2)
 *
 * Batched, read-only resolution: ALERT_IDENTITY_MAP + a row's projected
 * IdentityContext -> a rendered AlertIdentity, via at most 3 batched
 * `.select().in(...).limit(...)` Supabase reads. Fixtures build
 * `identityContext` through the REAL `projectIdentityContext` (Task 2) so
 * these tests exercise the full pipeline, not a hand-rolled shortcut.
 */
import { describe, expect, it } from "vitest";
import { resolveAlertIdentities, type ResolverRow } from "@/lib/adminAlerts/resolveAlertIdentities";
import { describeAlert } from "@/lib/adminAlerts/describeAlert";
import { projectIdentityContext } from "@/lib/adminAlerts/projectIdentityContext";

type CrewFixture = { id: string; show_id: string | null; name: string | null };
type ShowFixture = {
  id?: string;
  drive_file_id?: string;
  title: string | null;
  slug: string | null;
};

type FakeOpts = {
  crewRows?: CrewFixture[];
  showByIdRows?: ShowFixture[];
  showByDriveFileIdRows?: ShowFixture[];
  errorOn?: "crew_members" | "shows_by_id" | "shows_by_drive_file_id";
  rejectOn?: "crew_members" | "shows_by_id" | "shows_by_drive_file_id";
};

type RecordedCall = { table: string; cols: string; inCol: string; inIds: string[]; limit: number };

function keyFor(
  table: string,
  inCol: string,
): "crew_members" | "shows_by_id" | "shows_by_drive_file_id" {
  if (table === "crew_members") return "crew_members";
  return inCol === "id" ? "shows_by_id" : "shows_by_drive_file_id";
}

function makeFakeSupabase(opts: FakeOpts) {
  const calls: RecordedCall[] = [];
  const client = {
    from(table: string) {
      return {
        select(cols: string) {
          return {
            in(inCol: string, ids: string[]) {
              return {
                async limit(n: number) {
                  calls.push({ table, cols, inCol, inIds: ids, limit: n });
                  const key = keyFor(table, inCol);
                  if (opts.rejectOn === key) throw new Error(`SIMULATED ${key} rejection`);
                  if (opts.errorOn === key) {
                    return { data: null, error: { message: `SIMULATED ${key} error` } };
                  }
                  if (key === "crew_members") return { data: opts.crewRows ?? [], error: null };
                  if (key === "shows_by_id") return { data: opts.showByIdRows ?? [], error: null };
                  return { data: opts.showByDriveFileIdRows ?? [], error: null };
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

function row(partial: Partial<ResolverRow> & Pick<ResolverRow, "id" | "code">): ResolverRow {
  return {
    show_id: null,
    occurrence_count: 1,
    identityContext: projectIdentityContext(null, { includePii: true }),
    ...partial,
  };
}

describe("resolveAlertIdentities", () => {
  it("OAUTH_IDENTITY_CLAIMED end-to-end: crew name + email + show, names derived from the lookup fixture", async () => {
    const crewId = "11111111-1111-1111-1111-111111111111";
    const showId = "22222222-2222-2222-2222-222222222222";
    const crewFixture: CrewFixture = { id: crewId, show_id: showId, name: "Jane Doe" };
    const showFixture: ShowFixture = {
      id: showId,
      title: "II — FinTech Forum CTO Summit 2026",
      slug: "fintech",
    };
    const { client } = makeFakeSupabase({ crewRows: [crewFixture], showByIdRows: [showFixture] });

    const identityContext = projectIdentityContext(
      { crew_member_id: crewId, show_id: showId, user_email: "jane@gmail.com" },
      { includePii: true },
    );
    const rows = [
      row({ id: "alert-1", code: "OAUTH_IDENTITY_CLAIMED", show_id: showId, identityContext }),
    ];

    const result = await resolveAlertIdentities(rows, client, { includePii: true });
    expect(result.kind).toBe("ok");
    const identity = result.identities.get("alert-1");
    expect(identity).toEqual({
      segments: [
        { label: "Crew", value: crewFixture.name },
        { label: null, value: "jane@gmail.com", pii: true },
        { label: "Show", value: showFixture.title },
      ],
      global: false,
    });
    expect(describeAlert(identity!)).toBe(
      `Crew: ${crewFixture.name} · jane@gmail.com · Show: ${showFixture.title}`,
    );
  });

  it("legacy OAUTH row (no user_email) shows crew + show, no email segment", async () => {
    const crewId = "33333333-3333-3333-3333-333333333333";
    const showId = "44444444-4444-4444-4444-444444444444";
    const { client } = makeFakeSupabase({
      crewRows: [{ id: crewId, show_id: showId, name: "Legacy Crew" }],
      showByIdRows: [{ id: showId, title: "Legacy Show", slug: "legacy" }],
    });

    const identityContext = projectIdentityContext(
      { crew_member_id: crewId, show_id: showId, user_email_hash: "deadbeef" },
      { includePii: true },
    );
    const rows = [
      row({ id: "alert-legacy", code: "OAUTH_IDENTITY_CLAIMED", show_id: showId, identityContext }),
    ];

    const result = await resolveAlertIdentities(rows, client, { includePii: true });
    const identity = result.identities.get("alert-legacy")!;
    expect(identity.segments.some((s) => s.value.includes("@"))).toBe(false);
    expect(identity.segments).toEqual([
      { label: "Crew", value: "Legacy Crew" },
      { label: "Show", value: "Legacy Show" },
    ]);
    expect(describeAlert(identity)).toBe("Crew: Legacy Crew · Show: Legacy Show");
  });

  it("show-scoped crew resolution: a crew row from a DIFFERENT show yields no crew segment", async () => {
    const crewId = "55555555-5555-5555-5555-555555555555";
    const alertShowId = "66666666-6666-6666-6666-666666666666";
    const otherShowId = "77777777-7777-7777-7777-777777777777";
    const { client } = makeFakeSupabase({
      crewRows: [{ id: crewId, show_id: otherShowId, name: "Other Show Crew" }],
      showByIdRows: [{ id: alertShowId, title: "The Right Show", slug: "right" }],
    });

    const identityContext = projectIdentityContext(
      { show_id: alertShowId, stale_crew_member_id: crewId },
      { includePii: true },
    );
    const rows = [
      row({
        id: "alert-race",
        code: "PICKER_SELECTION_RACE",
        show_id: alertShowId,
        identityContext,
      }),
    ];

    const result = await resolveAlertIdentities(rows, client, { includePii: true });
    const identity = result.identities.get("alert-race")!;
    expect(identity.segments.some((s) => s.value.includes("Other Show Crew"))).toBe(false);
    expect(identity.segments).toEqual([{ label: "Show", value: "The Right Show" }]);
  });

  it("show-scoped crew resolution: matching show renders the crew segment", async () => {
    const crewId = "88888888-8888-8888-8888-888888888888";
    const showId = "99999999-9999-9999-9999-999999999999";
    const { client } = makeFakeSupabase({
      crewRows: [{ id: crewId, show_id: showId, name: "Matching Crew" }],
      showByIdRows: [{ id: showId, title: "Matching Show", slug: "match" }],
    });

    const identityContext = projectIdentityContext(
      { show_id: showId, stale_crew_member_id: crewId },
      { includePii: true },
    );
    const rows = [
      row({ id: "alert-race-2", code: "PICKER_SELECTION_RACE", show_id: showId, identityContext }),
    ];

    const result = await resolveAlertIdentities(rows, client, { includePii: true });
    const identity = result.identities.get("alert-race-2")!;
    expect(identity.segments).toEqual([
      { label: "Show", value: "Matching Show" },
      { label: "Crew", value: "Matching Crew" },
    ]);
  });

  it("resolved DB names are sanitized: email/token/bidi in crew_members.name and shows.title", async () => {
    const crewId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const showId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const token = "a".repeat(40);
    const dirtyCrewName = `Jane‮leaked jane@corp.com token:${token}`;
    const dirtyShowTitle = `Show token:${token} contact leaker@corp.com`;
    const { client } = makeFakeSupabase({
      crewRows: [{ id: crewId, show_id: showId, name: dirtyCrewName }],
      showByIdRows: [{ id: showId, title: dirtyShowTitle, slug: "dirty" }],
    });

    // PICKER_SELECTION_RACE's map entry reads `stale_crew_member_id` for its
    // crewName segment (spec §4 row 6) — the real raise site's context shape.
    const identityContext = projectIdentityContext(
      { stale_crew_member_id: crewId, show_id: showId },
      { includePii: false },
    );
    const rows = [
      row({ id: "alert-dirty", code: "PICKER_SELECTION_RACE", show_id: showId, identityContext }),
    ];

    const withPiiOff = await resolveAlertIdentities(rows, client, { includePii: false });
    const identityOff = withPiiOff.identities.get("alert-dirty")!;
    const showSegOff = identityOff.segments.find((s) => s.label === "Show")!;
    const crewSegOff = identityOff.segments.find((s) => s.label === "Crew")!;
    expect(showSegOff.value).toContain("[redacted-token]");
    expect(showSegOff.value).toContain("[redacted-email]");
    expect(showSegOff.value).not.toContain(token);
    expect(showSegOff.value).not.toContain("leaker@corp.com");
    expect(crewSegOff.value).not.toContain("‮");
    expect(crewSegOff.value).toContain("[redacted-email]");

    const withPiiOn = await resolveAlertIdentities(rows, client, { includePii: true });
    const identityOn = withPiiOn.identities.get("alert-dirty")!;
    const crewSegOn = identityOn.segments.find((s) => s.label === "Crew")!;
    // Token redaction is NEVER lifted by includePii — only email substrings are.
    expect(crewSegOn.value).toContain("[redacted-token]");
    expect(crewSegOn.value).toContain("jane@corp.com");
  });

  it("coalescing: occurrence_count > 1 appends a disclosure segment; ==1 does not; global never does", async () => {
    const crewId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const showId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
    const { client } = makeFakeSupabase({
      crewRows: [{ id: crewId, show_id: showId, name: "Coalesced Crew" }],
      showByIdRows: [{ id: showId, title: "Coalesced Show", slug: "coalesced" }],
    });

    const identityContext = projectIdentityContext(
      { crew_member_id: crewId, show_id: showId, user_email: "coalesced@gmail.com" },
      { includePii: true },
    );
    const rows = [
      row({
        id: "alert-n2",
        code: "OAUTH_IDENTITY_CLAIMED",
        show_id: showId,
        occurrence_count: 2,
        identityContext,
      }),
      row({
        id: "alert-n1",
        code: "OAUTH_IDENTITY_CLAIMED",
        show_id: showId,
        occurrence_count: 1,
        identityContext,
      }),
      row({
        id: "alert-global",
        code: "SYNC_STALLED",
        occurrence_count: 5,
        identityContext: projectIdentityContext({}, { includePii: true }),
      }),
    ];

    const result = await resolveAlertIdentities(rows, client, { includePii: true });
    const n2 = result.identities.get("alert-n2")!;
    const n1 = result.identities.get("alert-n1")!;
    const global = result.identities.get("alert-global")!;

    expect(n2.segments.at(-1)).toEqual({ label: null, value: "(most recent of 2)" });
    expect(n1.segments.some((s) => s.value.startsWith("(most recent"))).toBe(false);
    expect(global).toEqual({ segments: [], global: true });
  });

  it("infra_error: a RETURNED error on one read yields kind infra_error but a partial map", async () => {
    const crewId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    const showId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    const { client } = makeFakeSupabase({
      errorOn: "crew_members",
      showByIdRows: [{ id: showId, title: "Still Resolves", slug: "still" }],
    });

    const identityContext = projectIdentityContext(
      { crew_member_id: crewId, show_id: showId },
      { includePii: true },
    );
    const rows = [
      row({ id: "alert-err", code: "OAUTH_IDENTITY_CLAIMED", show_id: showId, identityContext }),
    ];

    const result = await resolveAlertIdentities(rows, client, { includePii: true });
    expect(result.kind).toBe("infra_error");
    const identity = result.identities.get("alert-err")!;
    // Crew lookup failed -> crew segment dropped; show lookup succeeded -> still renders.
    expect(identity.segments.some((s) => s.label === "Crew")).toBe(false);
    expect(identity.segments.some((s) => s.label === "Show" && s.value === "Still Resolves")).toBe(
      true,
    );
  });

  it("infra_error: a THROWN error on a read also yields kind infra_error with a partial map", async () => {
    const showId = "10101010-1010-1010-1010-101010101010";
    const { client } = makeFakeSupabase({ rejectOn: "shows_by_id" });

    const identityContext = projectIdentityContext({ show_id: showId }, { includePii: true });
    const rows = [
      row({ id: "alert-throw", code: "PICKER_EPOCH_RESET", show_id: showId, identityContext }),
    ];

    const result = await resolveAlertIdentities(rows, client, { includePii: true });
    expect(result.kind).toBe("infra_error");
    expect(result.identities.get("alert-throw")).toEqual({ segments: [], global: false });
  });

  it("a clean run with no faults returns kind ok", async () => {
    const { client } = makeFakeSupabase({});
    const rows = [
      row({
        id: "alert-clean",
        code: "SYNC_STALLED",
        identityContext: projectIdentityContext({}, { includePii: true }),
      }),
    ];
    const result = await resolveAlertIdentities(rows, client, { includePii: true });
    expect(result.kind).toBe("ok");
  });

  it("drive_file_id resolves a show when neither row.show_id nor identityContext.show_id is present", async () => {
    const driveFileId = "1N1PKmhcvLAn5UwHLn4Rplm1yeVeYMvwfL3eOzB4McnY";
    const { client } = makeFakeSupabase({
      showByDriveFileIdRows: [
        { drive_file_id: driveFileId, title: "Resolved Via Drive File", slug: "via-drive" },
      ],
    });

    const identityContext = projectIdentityContext(
      { drive_file_id: driveFileId },
      { includePii: true },
    );
    const rows = [
      row({
        id: "alert-drive",
        code: "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
        show_id: null,
        identityContext,
      }),
    ];

    const result = await resolveAlertIdentities(rows, client, { includePii: true });
    expect(result.kind).toBe("ok");
    expect(result.identities.get("alert-drive")).toEqual({
      segments: [{ label: "Sheet", value: "Resolved Via Drive File" }],
      global: false,
    });
  });

  it("global code -> describeAlert returns null", async () => {
    const { client } = makeFakeSupabase({});
    const rows = [
      row({
        id: "alert-global-2",
        code: "EMAIL_NOT_CONFIGURED",
        identityContext: projectIdentityContext({}, { includePii: true }),
      }),
    ];
    const result = await resolveAlertIdentities(rows, client, { includePii: true });
    const identity = result.identities.get("alert-global-2")!;
    expect(identity.global).toBe(true);
    expect(describeAlert(identity)).toBeNull();
  });

  describe("batching invariants (§3.2/§9.2 — Codex P12)", () => {
    it("a mixed batch issues at most 3 reads, one per distinct table+column", async () => {
      const crewId = "20202020-2020-2020-2020-202020202020";
      const showId = "30303030-3030-3030-3030-303030303030";
      const driveFileId = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
      const { client, calls } = makeFakeSupabase({
        crewRows: [{ id: crewId, show_id: showId, name: "Crew" }],
        showByIdRows: [{ id: showId, title: "Show", slug: "show" }],
        showByDriveFileIdRows: [{ drive_file_id: driveFileId, title: "Sheet", slug: "sheet" }],
      });

      const rows = [
        row({
          id: "a1",
          code: "OAUTH_IDENTITY_CLAIMED",
          show_id: showId,
          identityContext: projectIdentityContext(
            { crew_member_id: crewId, show_id: showId, user_email: "x@y.com" },
            { includePii: true },
          ),
        }),
        row({
          id: "a2",
          code: "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
          show_id: null,
          identityContext: projectIdentityContext(
            { drive_file_id: driveFileId },
            { includePii: true },
          ),
        }),
        row({
          id: "a3",
          code: "BRANCH_PROTECTION_DRIFT",
          identityContext: projectIdentityContext({ repo: "org/repo" }, { includePii: true }),
        }),
      ];

      const result = await resolveAlertIdentities(rows, client, { includePii: true });
      expect(result.kind).toBe("ok");
      expect(calls).toHaveLength(3);
      const tables = calls.map((c) => `${c.table}:${c.inCol}`).sort();
      expect(tables).toEqual(["crew_members:id", "shows:drive_file_id", "shows:id"]);
    });

    it("an empty id-set skips its query entirely (0 reads for a batch with no resolvable ids)", async () => {
      const { client, calls } = makeFakeSupabase({});
      const rows = [
        row({
          id: "b1",
          code: "SYNC_STALLED",
          identityContext: projectIdentityContext({}, { includePii: true }),
        }),
        row({
          id: "b2",
          code: "BRANCH_PROTECTION_DRIFT",
          identityContext: projectIdentityContext({ repo: "org/repo" }, { includePii: true }),
        }),
      ];
      await resolveAlertIdentities(rows, client, { includePii: true });
      expect(calls).toHaveLength(0);
    });

    it("every issued read carries a .limit(...)", async () => {
      const crewId = "40404040-4040-4040-4040-404040404040";
      const showId = "50505050-5050-5050-5050-505050505050";
      const { client, calls } = makeFakeSupabase({
        crewRows: [{ id: crewId, show_id: showId, name: "Crew" }],
        showByIdRows: [{ id: showId, title: "Show", slug: "show" }],
      });
      const rows = [
        row({
          id: "c1",
          code: "OAUTH_IDENTITY_CLAIMED",
          show_id: showId,
          identityContext: projectIdentityContext(
            { crew_member_id: crewId, show_id: showId },
            { includePii: true },
          ),
        }),
      ];
      await resolveAlertIdentities(rows, client, { includePii: true });
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(typeof call.limit).toBe("number");
        expect(call.limit).toBeGreaterThan(0);
      }
    });
  });
});
