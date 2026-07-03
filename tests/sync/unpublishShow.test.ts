import { describe, expect, test } from "vitest";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import type { UnpublishShowTx } from "@/lib/sync/unpublishShow";
import { mintIdFor, recipientBindingFor } from "@/lib/sync/unpublishBinding";

type ShowRow = {
  id: string;
  driveFileId: string;
  slug: string;
  title: string;
  createdAt: string;
  unpublishToken: string | null;
  unpublishTokenExpiresAt: string | null;
  archived: boolean;
  published: boolean;
};

class FakeUnpublishTx implements UnpublishShowTx {
  operations: string[] = [];
  alerts: Array<{ showId: string | null; code: string; context: Record<string, unknown> }> = [];
  broadcasts: string[] = [];

  constructor(
    readonly show: ShowRow | null,
    readonly held = true,
    readonly adminEmails: Array<{ email: string }> = [],
    readonly finalizeOwned = false,
  ) {}

  async queryOne<T>(sql: string): Promise<T> {
    if (/pg_(?:try_)?advisory_xact_lock/i.test(sql)) {
      throw new Error("unpublishShowViaEmailedLink_unlocked must not acquire advisory locks");
    }
    if (/first_seen_owned/i.test(sql)) {
      // readFinalizeOwnershipGuard_unlocked's two-EXISTS predicate (runManualSyncForShow.ts).
      this.operations.push("finalizeCheck");
      return { first_seen_owned: false, existing_show_owned: this.finalizeOwned } as T;
    }
    if (/pg_locks/i.test(sql)) return { held: this.held } as T;
    return { held: this.held } as T;
  }

  async readShowForUnpublish(slug: string): Promise<ShowRow | null> {
    this.operations.push(`read:${slug}`);
    return this.show?.slug === slug ? this.show : null;
  }

  async readActiveAdminEmailsForShare(): Promise<Array<{ email: string }>> {
    this.operations.push("readAdminEmailsForShare");
    return this.adminEmails;
  }

  async clearUnpublishToken(showId: string): Promise<void> {
    this.operations.push(`clearToken:${showId}`);
    if (this.show?.id === showId) {
      this.show.unpublishToken = null;
      this.show.unpublishTokenExpiresAt = null;
    }
  }

  async unpublishAndConsumeUnpublishToken(showId: string, token: string): Promise<boolean> {
    this.operations.push(`unpublishConsume:${showId}`);
    if (this.show?.id !== showId || this.show.unpublishToken !== token) return false;
    // Pure unpublish (published-toggle D1): published=false; archived UNTOUCHED.
    this.show.published = false;
    this.show.unpublishToken = null;
    this.show.unpublishTokenExpiresAt = null;
    return true;
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
    published: true,
    ...overrides,
  };
}

// M12.13 spec §3 ("Atomic recipient re-validation" + "Consumed-token contract",
// R12/R18/R19): the emailed-link wrapper re-validates the recipient binding
// INSIDE the locked tx, immediately after the show read and BEFORE every
// token-state branch. The FOR-SHARE admin read is observable on the tx mock as
// "readAdminEmailsForShare"; the exact-operations assertions below pin both
// the neutrality contract (zero mutations on binding failure) and the ordering
// (binding read precedes compare/expiry/consume).
describe("unpublishShowViaEmailedLink_unlocked", () => {
  const STORED_TOKEN = "11111111-1111-4111-8111-111111111111";
  const ADMIN = "doug@example.com";
  const mintId = mintIdFor(STORED_TOKEN);
  const validR = recipientBindingFor(ADMIN, "show-1", mintId);
  const activeAdmins = [{ email: ADMIN }, { email: "amy@example.com" }];

  test("binding valid + live token PURE-unpublishes + consumes with the same outcome shape as unpublishShow", async () => {
    const tx = new FakeUnpublishTx(show(), true, activeAdmins) as LockedShowTx<FakeUnpublishTx>;
    const { unpublishShowViaEmailedLink_unlocked } = await import("@/lib/sync/unpublishShow");

    await expect(
      unpublishShowViaEmailedLink_unlocked(tx, {
        slug: "client-show",
        token: STORED_TOKEN,
        r: validR,
        now: new Date("2026-05-08T13:00:00.000Z"),
      }),
    ).resolves.toEqual({ outcome: "success", status: 200, showId: "show-1" });

    expect(tx.show?.archived).toBe(false); // D1: pure unpublish never archives
    expect(tx.show?.published).toBe(false);
    expect(tx.show?.unpublishToken).toBeNull();
    expect(tx.alerts).toEqual([
      {
        showId: "show-1",
        code: "SHOW_UNPUBLISHED",
        context: { drive_file_id: "drive-file-1", sheet_name: "Client Show" },
      },
    ]);
    expect(tx.broadcasts).toEqual(["show-1"]);
    // Ordering pin: FOR-SHARE binding read directly after the show read; finalize guard
    // (JS mirror predicate via queryOne — NEVER the admin-gated RPC, R8) before consume.
    expect(tx.operations).toEqual([
      "read:client-show",
      "readAdminEmailsForShare",
      "finalizeCheck",
      "unpublishConsume:show-1",
      "alert:SHOW_UNPUBLISHED",
      "broadcast:show-1",
    ]);
  });

  test("binding valid + finalize-owned show → finalize_owned 409; token intact (busy contract)", async () => {
    const tx = new FakeUnpublishTx(
      show(),
      true,
      activeAdmins,
      true,
    ) as LockedShowTx<FakeUnpublishTx>;
    const { unpublishShowViaEmailedLink_unlocked } = await import("@/lib/sync/unpublishShow");

    await expect(
      unpublishShowViaEmailedLink_unlocked(tx, {
        slug: "client-show",
        token: STORED_TOKEN,
        r: validR,
        now: new Date("2026-05-08T13:00:00.000Z"),
      }),
    ).resolves.toEqual({ outcome: "finalize_owned", status: 409, showId: "show-1" });

    expect(tx.show?.unpublishToken).toBe(STORED_TOKEN);
    expect(tx.show?.published).toBe(true);
    expect(tx.alerts).toEqual([]);
    expect(tx.operations).toEqual(["read:client-show", "readAdminEmailsForShare", "finalizeCheck"]);
  });

  test("binding INVALID + live token → neutral, token untouched, ZERO mutations (R18)", async () => {
    const tx = new FakeUnpublishTx(show(), true, activeAdmins) as LockedShowTx<FakeUnpublishTx>;
    const { unpublishShowViaEmailedLink_unlocked } = await import("@/lib/sync/unpublishShow");

    await expect(
      unpublishShowViaEmailedLink_unlocked(tx, {
        slug: "client-show",
        token: STORED_TOKEN,
        r: "0123456789abcdef",
        now: new Date("2026-05-08T13:00:00.000Z"),
      }),
    ).resolves.toEqual({ outcome: "not_found", status: 404 });

    expect(tx.show?.unpublishToken).toBe(STORED_TOKEN);
    expect(tx.show?.archived).toBe(false);
    expect(tx.alerts).toEqual([]);
    expect(tx.operations).toEqual(["read:client-show", "readAdminEmailsForShare"]);
  });

  test("binding INVALID + EXPIRED token → neutral with NO expired-clear side effect (R18)", async () => {
    const tx = new FakeUnpublishTx(show(), true, activeAdmins) as LockedShowTx<FakeUnpublishTx>;
    const { unpublishShowViaEmailedLink_unlocked } = await import("@/lib/sync/unpublishShow");

    await expect(
      unpublishShowViaEmailedLink_unlocked(tx, {
        slug: "client-show",
        token: STORED_TOKEN,
        r: recipientBindingFor("revoked@example.com", "show-1", mintId),
        now: new Date("2026-05-09T12:00:01.000Z"), // past expiry
      }),
    ).resolves.toEqual({ outcome: "not_found", status: 404 });

    // Token state untouched and unlearned: expired-clear must NOT have fired.
    expect(tx.show?.unpublishToken).toBe(STORED_TOKEN);
    expect(tx.show?.unpublishTokenExpiresAt).toBe("2026-05-09T12:00:00.000Z");
    expect(tx.operations).toEqual(["read:client-show", "readAdminEmailsForShare"]);
  });

  test("binding INVALID + MISMATCHED submitted token → neutral; FOR-SHARE read still precedes the compare (ordering pin)", async () => {
    const tx = new FakeUnpublishTx(show(), true, activeAdmins) as LockedShowTx<FakeUnpublishTx>;
    const { unpublishShowViaEmailedLink_unlocked } = await import("@/lib/sync/unpublishShow");

    await expect(
      unpublishShowViaEmailedLink_unlocked(tx, {
        slug: "client-show",
        token: "22222222-2222-4222-8222-222222222222",
        r: "0123456789abcdef",
        now: new Date("2026-05-08T13:00:00.000Z"),
      }),
    ).resolves.toEqual({ outcome: "not_found", status: 404 });

    // If the binding check ran AFTER the token compare, the compare would have
    // short-circuited to not_found and the FOR-SHARE read would be absent.
    expect(tx.operations).toEqual(["read:client-show", "readAdminEmailsForShare"]);
    expect(tx.show?.unpublishToken).toBe(STORED_TOKEN);
  });

  test("consumed/null token + ANY r → neutral; mint underivable so binding read never fires (R19)", async () => {
    const { unpublishShowViaEmailedLink_unlocked } = await import("@/lib/sync/unpublishShow");
    const consumedShow = () =>
      show({ unpublishToken: null, unpublishTokenExpiresAt: null, published: false });

    // r from the PRIOR mint (a real recipient's stale link after consumption)…
    const txPriorMint = new FakeUnpublishTx(
      consumedShow(),
      true,
      activeAdmins,
    ) as LockedShowTx<FakeUnpublishTx>;
    await expect(
      unpublishShowViaEmailedLink_unlocked(txPriorMint, {
        slug: "client-show",
        token: STORED_TOKEN,
        r: validR,
        now: new Date("2026-05-08T13:00:00.000Z"),
      }),
    ).resolves.toEqual({ outcome: "not_found", status: 404 });
    expect(txPriorMint.operations).toEqual(["read:client-show"]);

    // …and garbage r: identical neutral exit, zero token-state branches.
    const txGarbage = new FakeUnpublishTx(
      consumedShow(),
      true,
      activeAdmins,
    ) as LockedShowTx<FakeUnpublishTx>;
    await expect(
      unpublishShowViaEmailedLink_unlocked(txGarbage, {
        slug: "client-show",
        token: STORED_TOKEN,
        r: "ffffffffffffffff",
        now: new Date("2026-05-08T13:00:00.000Z"),
      }),
    ).resolves.toEqual({ outcome: "not_found", status: 404 });
    expect(txGarbage.operations).toEqual(["read:client-show"]);
  });

  test("missing slug → neutral not_found before any binding read", async () => {
    const tx = new FakeUnpublishTx(null, true, activeAdmins) as LockedShowTx<FakeUnpublishTx>;
    const { unpublishShowViaEmailedLink_unlocked } = await import("@/lib/sync/unpublishShow");
    await expect(
      unpublishShowViaEmailedLink_unlocked(tx, {
        slug: "missing",
        token: STORED_TOKEN,
        r: validR,
        now: new Date("2026-05-08T13:00:00.000Z"),
      }),
    ).resolves.toEqual({ outcome: "not_found", status: 404 });
    expect(tx.operations).toEqual(["read:missing"]);
  });

  test("binding valid + expired token → EXPIRED outcome with the plain path's expired-clear behavior", async () => {
    const tx = new FakeUnpublishTx(show(), true, activeAdmins) as LockedShowTx<FakeUnpublishTx>;
    const { unpublishShowViaEmailedLink_unlocked } = await import("@/lib/sync/unpublishShow");

    await expect(
      unpublishShowViaEmailedLink_unlocked(tx, {
        slug: "client-show",
        token: STORED_TOKEN,
        r: validR,
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
    expect(tx.operations).toEqual([
      "read:client-show",
      "readAdminEmailsForShare",
      "clearToken:show-1",
    ]);
  });

  test("binding valid + submitted token mismatch → not_found without consuming (shared compare semantics)", async () => {
    const tx = new FakeUnpublishTx(show(), true, activeAdmins) as LockedShowTx<FakeUnpublishTx>;
    const { unpublishShowViaEmailedLink_unlocked } = await import("@/lib/sync/unpublishShow");

    await expect(
      unpublishShowViaEmailedLink_unlocked(tx, {
        slug: "client-show",
        token: "22222222-2222-4222-8222-222222222222",
        r: validR,
        now: new Date("2026-05-08T13:00:00.000Z"),
      }),
    ).resolves.toEqual({ outcome: "not_found", status: 404 });

    expect(tx.show?.unpublishToken).toBe(STORED_TOKEN);
    expect(tx.operations).toEqual(["read:client-show", "readAdminEmailsForShare"]);
  });

  test("missing slug → neutral not_found", async () => {
    const { unpublishShowViaEmailedLink_unlocked } = await import("@/lib/sync/unpublishShow");
    await expect(
      unpublishShowViaEmailedLink_unlocked(
        new FakeUnpublishTx(null, true, activeAdmins) as LockedShowTx<FakeUnpublishTx>,
        {
          slug: "missing",
          token: STORED_TOKEN,
          r: validR,
          now: new Date("2026-05-08T13:00:00.000Z"),
        },
      ),
    ).resolves.toEqual({ outcome: "not_found", status: 404 });
  });
});
