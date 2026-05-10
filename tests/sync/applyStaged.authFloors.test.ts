import { describe, expect, test, vi } from "vitest";
import { encodeSessionCookieValue, SESSION_COOKIE_NAME } from "@/lib/auth/cookies";
import type { TriggeredReviewItem } from "@/lib/parser/types";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";
import {
  applyStaged_unlocked,
  type ApplyStagedDeps,
  type PendingSyncForApply,
} from "@/lib/sync/applyStaged";
import { validateLinkSession } from "@/lib/auth/validateLinkSession";

type AuthRow = {
  current_token_version: number;
  max_issued_version: number;
  revoked_below_version: number;
};

const state = vi.hoisted(() => ({
  authRow: {
    current_token_version: 5,
    max_issued_version: 5,
    revoked_below_version: 0,
  } as AuthRow,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from(table: string) {
      const filters = new Map<string, unknown>();
      const builder = {
        select() {
          return builder;
        },
        update() {
          return {
            eq: () => ({ error: null }),
          };
        },
        delete() {
          return {
            eq: () => ({ error: null }),
          };
        },
        eq(column: string, value: unknown) {
          filters.set(column, value);
          return builder;
        },
        async single() {
          if (table === "app_settings") {
            return { data: { active_signing_key_id: "kid-1" }, error: null };
          }
          return { data: null, error: { message: `unexpected single ${table}` } };
        },
        async maybeSingle() {
          if (table === "link_sessions") {
            return {
              data: {
                token: filters.get("token"),
                show_id: "11111111-1111-4111-8111-111111111111",
                crew_member_id: "22222222-2222-4222-8222-222222222222",
                jwt_token_version: state.authRow.current_token_version,
                signing_key_id: "kid-1",
                expires_at: new Date(Date.now() + 60_000).toISOString(),
                last_active_at: new Date().toISOString(),
              },
              error: null,
            };
          }
          if (table === "crew_members") {
            return {
              data: {
                id: "22222222-2222-4222-8222-222222222222",
                show_id: "11111111-1111-4111-8111-111111111111",
                name: "Alice",
              },
              error: null,
            };
          }
          if (table === "crew_member_auth") {
            return {
              data: {
                current_token_version: state.authRow.current_token_version,
                revoked_below_version: state.authRow.revoked_below_version,
              },
              error: null,
            };
          }
          if (table === "revoked_links") {
            return { data: null, error: null };
          }
          return { data: null, error: { message: `unexpected maybeSingle ${table}` } };
        },
      };
      return builder;
    },
  }),
}));

function parseResult(): PendingSyncForApply["parseResult"] {
  return {
    show: {
      title: "Show",
      client_label: "Client",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: {
        travelIn: "2026-05-07",
        set: "2026-05-08",
        showDays: ["2026-05-09"],
        travelOut: "2026-05-10",
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
  };
}

function pending(triggeredReviewItems: TriggeredReviewItem[]): PendingSyncForApply {
  return {
    driveFileId: "drive-file-1",
    stagedId: "staged-live",
    sourceKind: "manual",
    wizardSessionId: null,
    baseModifiedTime: "2026-05-08T10:00:00.000Z",
    stagedModifiedTime: "2026-05-08T12:00:00.000Z",
    parseResult: parseResult(),
    triggeredReviewItems,
    priorLastSyncStatus: "ok",
    priorLastSyncError: null,
    warningSummary: "none",
  };
}

function lockedTx(): LockedShowTx<SyncPipelineTx> {
  return {
    async queryOne<T>(sql: string) {
      if (/from pg_locks/i.test(sql)) return { held: true } as T;
      if (/update public\.crew_member_auth/i.test(sql)) {
        const nextFloor = /current_token_version\s*\+\s*1/i.test(sql)
          ? state.authRow.current_token_version + 1
          : state.authRow.current_token_version;
        state.authRow.revoked_below_version = Math.max(
          state.authRow.revoked_below_version,
          nextFloor,
        );
        return { bumped: true } as T;
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  } as unknown as LockedShowTx<SyncPipelineTx>;
}

function deps(triggeredReviewItems: TriggeredReviewItem[]): ApplyStagedDeps {
  return {
    readLivePendingSyncForApply: vi.fn(async () => pending(triggeredReviewItems)),
    readShowForApply: vi.fn(async () => ({
      showId: "11111111-1111-4111-8111-111111111111",
      lastSeenModifiedTime: "2026-05-08T10:00:00.000Z",
      diagrams: { snapshot_revision_id: "rev-prior" },
    })),
    readWatchedFolderId: vi.fn(async () => "watched-folder"),
    fetchDriveFileMetadata: vi.fn(async () => ({
      driveFileId: "drive-file-1",
      name: "Show Sheet",
      mimeType: "application/vnd.google-apps.spreadsheet",
      modifiedTime: "2026-05-08T12:00:00.000Z",
      parents: ["watched-folder"],
      headRevisionId: "head-1",
      trashed: false,
    })),
    runPhase2: vi.fn(async () => ({
      outcome: "applied" as const,
      showId: "11111111-1111-4111-8111-111111111111",
    })),
    insertSyncAudit: vi.fn(async () => "audit-1"),
    deleteLivePendingSync: vi.fn(async () => undefined),
    restoreShowStatus: vi.fn(async () => undefined),
    upsertLivePendingIngestion: vi.fn(async () => undefined),
  };
}

function issueNewLinkOnce() {
  state.authRow.current_token_version = state.authRow.max_issued_version + 1;
  state.authRow.max_issued_version += 1;
}

describe("Apply reviewer auth floor bumps", () => {
  test("one Issue New Link after an MI-11 Apply produces a session that passes auth", async () => {
    state.authRow.current_token_version = 5;
    state.authRow.max_issued_version = 5;
    state.authRow.revoked_below_version = 0;
    const item: TriggeredReviewItem = {
      id: "mi-11-1",
      invariant: "MI-11",
      crew_name: "Alice",
      prior_email: "old@example.com",
      new_email: "new@example.com",
    };

    await expect(
      applyStaged_unlocked(
        lockedTx(),
        {
          driveFileId: "drive-file-1",
          sourceScope: "live",
          stagedId: "staged-live",
          reviewerChoices: [{ item_id: item.id, action: "apply" }],
          appliedByEmail: "doug@fxav.test",
        },
        deps([item]),
      ),
    ).resolves.toMatchObject({ outcome: "applied" });

    issueNewLinkOnce();
    const cookieValue = encodeSessionCookieValue({
      token: "33333333-3333-4333-8333-333333333333",
      show_id: "11111111-1111-4111-8111-111111111111",
    });
    const req = new Request("https://fxav.test/show/demo", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookieValue}` },
    });

    await expect(
      validateLinkSession(req, { showId: "11111111-1111-4111-8111-111111111111" }),
    ).resolves.toEqual({
      kind: "success",
      viewer: {
        kind: "crew",
        showId: "11111111-1111-4111-8111-111111111111",
        crewMemberId: "22222222-2222-4222-8222-222222222222",
      },
    });
  });
});
