import { describe, expect, test } from "vitest";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import type { UnpublishShowTx } from "@/lib/sync/unpublishShow";

type ShowRow = {
  id: string;
  driveFileId: string;
  slug: string;
  title: string;
  createdAt: string;
  unpublishToken: string | null;
  unpublishTokenExpiresAt: string | null;
  archived: boolean;
};

class FakeUnpublishTx implements UnpublishShowTx {
  operations: string[] = [];
  alerts: Array<{ showId: string | null; code: string; context: Record<string, unknown> }> = [];
  broadcasts: string[] = [];
  auth = new Map<string, { current: number; max: number; revokedBelow: number }>();
  sessions: Array<{ showId: string; createdAt: string; deleted: boolean }> = [];

  constructor(readonly show: ShowRow | null, readonly held = true) {}

  async queryOne<T>(sql: string): Promise<T> {
    if (/pg_(?:try_)?advisory_xact_lock/i.test(sql)) {
      throw new Error("unpublishShow_unlocked must not acquire advisory locks");
    }
    if (/pg_locks/i.test(sql)) return { held: this.held } as T;
    return { held: this.held } as T;
  }

  async readShowForUnpublish(slug: string): Promise<ShowRow | null> {
    this.operations.push(`read:${slug}`);
    return this.show?.slug === slug ? this.show : null;
  }

  async clearUnpublishToken(showId: string): Promise<void> {
    this.operations.push(`clearToken:${showId}`);
    if (this.show?.id === showId) {
      this.show.unpublishToken = null;
      this.show.unpublishTokenExpiresAt = null;
    }
  }

  async archiveAndConsumeUnpublishToken(showId: string, token: string): Promise<boolean> {
    this.operations.push(`archiveConsume:${showId}`);
    if (this.show?.id !== showId || this.show.unpublishToken !== token) return false;
    this.show.archived = true;
    this.show.unpublishToken = null;
    this.show.unpublishTokenExpiresAt = null;
    return true;
  }

  async revokeIssuedLinksForShow(showId: string, issuedSince: string): Promise<void> {
    this.operations.push(`revokeLinks:${showId}:${issuedSince}`);
    for (const [crewName, row] of this.auth) {
      void crewName;
      const nextVersion = row.current + 1;
      row.revokedBelow = Math.max(row.revokedBelow, row.current);
      row.current = nextVersion;
      row.max = Math.max(row.max, nextVersion);
    }
    for (const session of this.sessions) {
      if (session.showId === showId && session.createdAt >= issuedSince) {
        session.deleted = true;
      }
    }
  }

  async upsertAdminAlert(input: {
    showId: string | null;
    code: string;
    context: Record<string, unknown>;
  }): Promise<string | null> {
    this.operations.push(`alert:${input.code}`);
    this.alerts.push(input);
    return "alert-1";
  }

  async publishShowInvalidation(showId: string): Promise<void> {
    this.operations.push(`broadcast:${showId}`);
    this.broadcasts.push(showId);
  }
}

function show(overrides: Partial<ShowRow> = {}): ShowRow {
  return {
    id: "show-1",
    driveFileId: "drive-file-1",
    slug: "client-show",
    title: "Client Show",
    createdAt: "2026-05-08T12:00:00.000Z",
    unpublishToken: "11111111-1111-4111-8111-111111111111",
    unpublishTokenExpiresAt: "2026-05-09T12:00:00.000Z",
    archived: false,
    ...overrides,
  };
}

describe("unpublishShow_unlocked", () => {
  test("valid token archives, consumes token, revokes links, alerts, and broadcasts under caller lock", async () => {
    const tx = new FakeUnpublishTx(show()) as LockedShowTx<FakeUnpublishTx>;
    tx.auth.set("Alice", { current: 3, max: 3, revokedBelow: 0 });
    tx.auth.set("Bob", { current: 1, max: 2, revokedBelow: 0 });
    tx.sessions = [
      { showId: "show-1", createdAt: "2026-05-08T12:30:00.000Z", deleted: false },
      { showId: "other-show", createdAt: "2026-05-08T12:30:00.000Z", deleted: false },
    ];
    const { unpublishShow_unlocked } = await import("@/lib/sync/unpublishShow");

    await expect(
      unpublishShow_unlocked(tx, {
        slug: "client-show",
        token: "11111111-1111-4111-8111-111111111111",
        now: new Date("2026-05-08T13:00:00.000Z"),
      }),
    ).resolves.toEqual({ outcome: "success", status: 200, showId: "show-1" });

    expect(tx.show?.archived).toBe(true);
    expect(tx.show?.unpublishToken).toBeNull();
    expect(tx.auth.get("Alice")).toEqual({ current: 4, max: 4, revokedBelow: 3 });
    expect(tx.auth.get("Bob")).toEqual({ current: 2, max: 2, revokedBelow: 1 });
    expect(tx.sessions).toEqual([
      { showId: "show-1", createdAt: "2026-05-08T12:30:00.000Z", deleted: true },
      { showId: "other-show", createdAt: "2026-05-08T12:30:00.000Z", deleted: false },
    ]);
    expect(tx.alerts).toEqual([
      {
        showId: "show-1",
        code: "SHOW_UNPUBLISHED",
        context: {
          drive_file_id: "drive-file-1",
          sheet_name: "Client Show",
        },
      },
    ]);
    expect(tx.broadcasts).toEqual(["show-1"]);
    expect(tx.operations).toEqual([
      "read:client-show",
      "archiveConsume:show-1",
      "revokeLinks:show-1:2026-05-08T12:00:00.000Z",
      "alert:SHOW_UNPUBLISHED",
      "broadcast:show-1",
    ]);
  });

  test("expired matching token clears token and returns UNPUBLISH_TOKEN_EXPIRED without alert", async () => {
    const tx = new FakeUnpublishTx(show()) as LockedShowTx<FakeUnpublishTx>;
    const { unpublishShow_unlocked } = await import("@/lib/sync/unpublishShow");

    await expect(
      unpublishShow_unlocked(tx, {
        slug: "client-show",
        token: "11111111-1111-4111-8111-111111111111",
        now: new Date("2026-05-09T12:00:01.000Z"),
      }),
    ).resolves.toEqual({
      outcome: "expired",
      status: 400,
      code: "UNPUBLISH_TOKEN_EXPIRED",
      showId: "show-1",
    });

    expect(tx.show?.unpublishToken).toBeNull();
    expect(tx.alerts).toEqual([]);
    expect(tx.operations).toEqual(["read:client-show", "clearToken:show-1"]);
  });

  test("already-cleared token returns UNPUBLISH_TOKEN_CONSUMED idempotently", async () => {
    const tx = new FakeUnpublishTx(
      show({ unpublishToken: null, unpublishTokenExpiresAt: null, archived: true }),
    ) as LockedShowTx<FakeUnpublishTx>;
    const { unpublishShow_unlocked } = await import("@/lib/sync/unpublishShow");

    await expect(
      unpublishShow_unlocked(tx, {
        slug: "client-show",
        token: "11111111-1111-4111-8111-111111111111",
        now: new Date("2026-05-08T13:00:00.000Z"),
      }),
    ).resolves.toEqual({
      outcome: "consumed",
      status: 400,
      code: "UNPUBLISH_TOKEN_CONSUMED",
      showId: "show-1",
    });

    expect(tx.operations).toEqual(["read:client-show"]);
  });

  test("missing slug or mismatched live token returns 404 not_found", async () => {
    const { unpublishShow_unlocked } = await import("@/lib/sync/unpublishShow");

    await expect(
      unpublishShow_unlocked(new FakeUnpublishTx(null) as LockedShowTx<FakeUnpublishTx>, {
        slug: "missing",
        token: "11111111-1111-4111-8111-111111111111",
        now: new Date("2026-05-08T13:00:00.000Z"),
      }),
    ).resolves.toEqual({ outcome: "not_found", status: 404 });

    await expect(
      unpublishShow_unlocked(new FakeUnpublishTx(show()) as LockedShowTx<FakeUnpublishTx>, {
        slug: "client-show",
        token: "22222222-2222-4222-8222-222222222222",
        now: new Date("2026-05-08T13:00:00.000Z"),
      }),
    ).resolves.toEqual({ outcome: "not_found", status: 404 });
  });

  test("concurrent race loser observes consumed token after winner clears it", async () => {
    const sharedShow = show();
    const tx = new FakeUnpublishTx(sharedShow) as LockedShowTx<FakeUnpublishTx>;
    const { unpublishShow_unlocked } = await import("@/lib/sync/unpublishShow");

    await unpublishShow_unlocked(tx, {
      slug: "client-show",
      token: "11111111-1111-4111-8111-111111111111",
      now: new Date("2026-05-08T13:00:00.000Z"),
    });

    await expect(
      unpublishShow_unlocked(tx, {
        slug: "client-show",
        token: "11111111-1111-4111-8111-111111111111",
        now: new Date("2026-05-08T13:00:01.000Z"),
      }),
    ).resolves.toEqual({
      outcome: "consumed",
      status: 400,
      code: "UNPUBLISH_TOKEN_CONSUMED",
      showId: "show-1",
    });
    expect(tx.alerts).toHaveLength(1);
  });
});
