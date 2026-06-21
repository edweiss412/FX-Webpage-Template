import { describe, expect, test, vi } from "vitest";

type CrewAuthRow = {
  current_token_version: number;
  max_issued_version: number;
  revoked_below_version: number;
};

const calls = vi.hoisted(() => ({
  crewAuth: new Map<string, CrewAuthRow>(),
  sql: [] as string[],
  txAdminAlerts: [] as Array<{
    showId: string | null;
    code: string;
    context: Record<string, unknown>;
  }>,
  defaultAdminAlerts: [] as Array<unknown>,
}));

vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({
  upsertAdminAlert: vi.fn(async (input: unknown) => {
    calls.defaultAdminAlerts.push(input);
    throw new Error("default upsertAdminAlert must not run inside sync pipeline transaction");
  }),
}));

vi.mock("postgres", () => ({
  default: vi.fn(() => {
    const unsafe = async (sql: string, params: unknown[] = []) => {
      calls.sql.push(sql);
      if (/pg_try_advisory_xact_lock/i.test(sql)) return [{ locked: true }];
      if (/from pg_locks/i.test(sql)) return [{ held: true }];
      if (/select archived from public\.shows/i.test(sql)) return [{ archived: false }]; // DEF-4 in-lock probe
      if (/from public\.deferred_ingestions/i.test(sql)) return [];
      if (/from public\.revision_race_cooldowns/i.test(sql)) return [];
      if (/delete from public\.revision_race_cooldowns/i.test(sql)) return [];
      if (/update public\.admin_alerts/i.test(sql)) return [{ resolved: true }];
      if (/select id from public\.shows where drive_file_id/i.test(sql)) return [];
      if (/select public\.upsert_admin_alert/i.test(sql)) {
        // The `$3::jsonb` context param is passed as a RAW object now (postgres.js
        // serializes it once via the cast); the prior code double-encoded it with
        // JSON.stringify. Mirror production: consume the object directly, not via
        // JSON.parse (which would choke on "[object Object]").
        const [showId, code, context] = params as [string | null, string, Record<string, unknown>];
        calls.txAdminAlerts.push({ showId, code, context });
        return [{ id: "tx-alert-1" }];
      }

      throw new Error(`unexpected SQL: ${sql}`);
    };

    return {
      unsafe,
      begin: async <T>(
        fn: (tx: { unsafe: (sql: string, params?: unknown[]) => Promise<unknown[]> }) => Promise<T>,
      ) =>
        await fn({
          unsafe,
        }),
      end: async () => undefined,
    };
  }),
}));

const { processOneFile, withPostgresSyncPipelineLock } =
  await import("@/lib/sync/runScheduledCronSync");

describe("Postgres sync pipeline adapter", () => {
  test("legacy auth provisioning hook is a no-op after picker auth pivot", async () => {
    calls.crewAuth.clear();
    calls.sql.length = 0;

    await withPostgresSyncPipelineLock(
      "drive-file-1",
      async (tx) => {
        await tx.provisionAddedCrewAuth("show-1", ["New Crew"]);
        return null;
      },
      { tryOnly: true },
    );

    expect(calls.crewAuth.has("show-1:New Crew")).toBe(false);
    expect(calls.sql.join("\n")).not.toMatch(/crew_member_/i);
  });

  test("production cron shape auto-wires first-published alerts to the transaction client", async () => {
    calls.sql.length = 0;
    calls.txAdminAlerts.length = 0;
    calls.defaultAdminAlerts.length = 0;

    const result = await processOneFile(
      "drive-file-first-seen",
      "cron",
      {
        driveFileId: "drive-file-first-seen",
        name: "First Seen Sheet",
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: "2026-05-08T12:00:00.000Z",
        parents: ["folder-1"],
        headRevisionId: "head-1",
      },
      {
        perFileProcessor: async () => ({ outcome: "proceed", mode: "cron" }),
        captureBinding: async () => ({
          bindingToken: "head-1",
          modifiedTime: "2026-05-08T12:00:00.000Z",
        }),
        fetchMarkdownAtRevision: async () => "# v4\nShow",
        parseSheet: () => ({
          show: {
            title: "Show",
            client_label: "Client",
            client_contact: null,
            template_version: "v4",
            venue: null,
            dates: {
              travelIn: null,
              set: null,
              showDays: ["2026-05-09"],
              travelOut: null,
            },
            schedule_phases: {},
            event_details: {},
            agenda_links: [],
            coi_status: null,
            po: null,
            proposal: null,
            invoice: null,
            invoice_notes: null,
          },
          crewMembers: [],
          hotelReservations: [],
          rooms: [],
          transportation: null,
          contacts: [],
          pullSheet: null,
          diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
          openingReel: null,
          raw_unrecognized: [],
          warnings: [],
          hardErrors: [],
        }),
        enrichWithDrivePins: async (parsed) => ({
          ...parsed,
          diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
          openingReel: null,
        }),
        runPhase1: async () => ({ outcome: "auto_publish_ready" }),
        runPhase2: async (_tx, args) => {
          expect(args.autoPublishFirstSeen).toEqual({
            unpublishToken: "11111111-1111-4111-8111-111111111111",
            unpublishTokenExpiresAt: "2026-05-09T12:00:00.000Z",
          });
          return { outcome: "applied", showId: "show-1" };
        },
        createUnpublishToken: () => "11111111-1111-4111-8111-111111111111",
        now: () => new Date("2026-05-08T12:00:00.000Z"),
      },
    );

    expect(result).toEqual({ outcome: "applied", showId: "show-1", parseWarnings: [] });
    expect(calls.defaultAdminAlerts).toEqual([]);
    expect(calls.txAdminAlerts).toEqual([
      {
        showId: "show-1",
        code: "SHOW_FIRST_PUBLISHED",
        context: {
          drive_file_id: "drive-file-first-seen",
          sheet_name: "First Seen Sheet",
          crew_count: 0,
          show_date: "2026-05-09",
          // M12.13: the raw bearer secret no longer persists in alert context; expiry stays.
          unpublish_token_expires_at: "2026-05-09T12:00:00.000Z",
        },
      },
    ]);
    // M12.13: assert the secret is absent (toEqual above pins exact shape, but be explicit).
    expect(calls.txAdminAlerts[0]!.context).not.toHaveProperty("unpublish_token");
  });
});
