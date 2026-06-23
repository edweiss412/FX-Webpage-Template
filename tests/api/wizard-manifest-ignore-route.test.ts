import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  handleWizardManifestIgnore,
  type WizardManifestIgnoreRouteTx,
} from "@/app/api/admin/onboarding/manifest/[wizardSessionId]/[driveFileId]/ignore/route";

/**
 * DS3-1 — manifest-keyed in-wizard permanent_ignore route (mocked tx).
 *
 * These `live_row_conflict` / `discard_retryable` rows have NO pending_ingestions
 * and NO pending_syncs row, so the only durable key is
 * (wizard_session_id, drive_file_id) + onboarding_scan_manifest.name. The route:
 *   1. admin-gates (403 / 500),
 *   2. reads the manifest row FOR UPDATE under the single show lock,
 *   3. status-gates (only live_row_conflict / discard_retryable; else 409
 *      INVALID_REVIEWER_ACTION),
 *   4. writes the LIVE deferred_ingestions permanent_ignore (incl. drive_file_name)
 *      BEFORE the manifest transition,
 *   5. flips the manifest status via the reused transitionManifestRow; a CAS miss
 *      (false) THROWS so the already-written deferral is rolled back.
 *
 * The transaction stub records statement order and lets each test program the
 * row outcomes; a "supersession-between-writes" stub returns the deferral upsert
 * then a 0-row transition, and the test asserts the whole tx threw (rollback).
 */

const WSID = "11111111-2222-4333-8444-555555555555";
const DFID = "drive-file-ds31";
const SHEET_NAME = "Conflicting Show.gsheet";
const ADMIN_EMAIL = "Doug.Larson@FXAV.com";

type QueryStub = (sql: string, params: unknown[]) => unknown;

function makeTx(queryStub: QueryStub): {
  tx: WizardManifestIgnoreRouteTx;
  calls: Array<{ sql: string; params: unknown[] }>;
} {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const tx = {
    async queryOne<T>(sql: string, params: unknown[]): Promise<T> {
      calls.push({ sql, params });
      return queryStub(sql, params) as T;
    },
  } as unknown as WizardManifestIgnoreRouteTx;
  return { tx, calls };
}

function context() {
  return { params: Promise.resolve({ wizardSessionId: WSID, driveFileId: DFID }) };
}

function req() {
  return new Request(
    `https://crew.fxav.test/api/admin/onboarding/manifest/${WSID}/${DFID}/ignore`,
    { method: "POST" },
  );
}

const okAdmin = async () => ({ email: ADMIN_EMAIL });

/** Default stub: manifest read returns a blocking row, deferral upserts, transition succeeds. */
function happyStub(status: string): QueryStub {
  return (sql) => {
    if (/from public\.onboarding_scan_manifest/i.test(sql) && /for update/i.test(sql)) {
      return { name: SHEET_NAME, status };
    }
    if (/insert into public\.deferred_ingestions/i.test(sql)) {
      return { upserted: true };
    }
    if (/update public\.onboarding_scan_manifest/i.test(sql)) {
      return { updated: true };
    }
    return null;
  };
}

let lastTxCalls: Array<{ sql: string; params: unknown[] }> = [];

function withRowTx(queryStub: QueryStub) {
  return async <R>(
    _driveFileId: string,
    fn: (tx: WizardManifestIgnoreRouteTx) => Promise<R> | R,
  ): Promise<R> => {
    const { tx, calls } = makeTx(queryStub);
    lastTxCalls = calls;
    return await fn(tx);
  };
}

describe("DS3-1 — POST manifest-keyed permanent_ignore route (mocked tx)", () => {
  beforeEach(() => {
    lastTxCalls = [];
  });

  test("admin-gate: thrown non-lookup error → 403 ADMIN_FORBIDDEN", async () => {
    const response = await handleWizardManifestIgnore(req(), context(), {
      requireAdminIdentity: async () => {
        throw new Error("not admin");
      },
      withRowTx: withRowTx(happyStub("live_row_conflict")),
    });
    expect(response.status).toBe(403);
    expect((await response.json()) as { code: string }).toMatchObject({ code: "ADMIN_FORBIDDEN" });
  });

  test("admin-gate: ADMIN_SESSION_LOOKUP_FAILED → 500", async () => {
    const response = await handleWizardManifestIgnore(req(), context(), {
      requireAdminIdentity: async () => {
        throw { code: "ADMIN_SESSION_LOOKUP_FAILED" };
      },
      withRowTx: withRowTx(happyStub("live_row_conflict")),
    });
    expect(response.status).toBe(500);
    expect((await response.json()) as { code: string }).toMatchObject({
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    });
  });

  test.each(["live_row_conflict", "discard_retryable"] as const)(
    "happy path (%s): writes LIVE permanent_ignore deferral (w/ canonical email + sheet name) then flips manifest",
    async (status) => {
      const response = await handleWizardManifestIgnore(req(), context(), {
        requireAdminIdentity: okAdmin,
        withRowTx: withRowTx(happyStub(status)),
      });
      expect(response.status).toBe(200);
      expect((await response.json()) as Record<string, unknown>).toEqual({
        status: "ignored",
        drive_file_id: DFID,
        wizard_session_id: WSID,
      });

      const insert = lastTxCalls.find((c) =>
        /insert into public\.deferred_ingestions/i.test(c.sql),
      );
      expect(insert, "deferral insert ran").toBeTruthy();
      // wizard_session_id IS NULL partition + permanent_ignore + drive_file_name written
      expect(insert!.sql).toMatch(/'permanent_ignore'/i);
      expect(insert!.sql).toMatch(/drive_file_name/i);
      expect(insert!.sql).toMatch(/on conflict \(drive_file_id\) where wizard_session_id is null/i);
      // The canonical (lowercased) email is bound as a PARAM, not computed in SQL.
      expect(insert!.params).toContain(ADMIN_EMAIL.toLowerCase());
      expect(insert!.params).toContain(SHEET_NAME);
      expect(insert!.sql).not.toMatch(/canonicalize\s*\(/i);

      // Statement ORDER: the deferral upsert precedes the manifest transition.
      const insertIdx = lastTxCalls.findIndex((c) =>
        /insert into public\.deferred_ingestions/i.test(c.sql),
      );
      const updateIdx = lastTxCalls.findIndex((c) =>
        /update public\.onboarding_scan_manifest/i.test(c.sql),
      );
      expect(insertIdx).toBeGreaterThanOrEqual(0);
      expect(updateIdx).toBeGreaterThan(insertIdx);

      // No pending_ingestions / pending_syncs touch.
      expect(
        lastTxCalls.some((c) => /pending_ingestions|pending_syncs/i.test(c.sql)),
      ).toBe(false);
    },
  );

  test("status-gate: a non-target status (staged) → 409 INVALID_REVIEWER_ACTION, no writes", async () => {
    const response = await handleWizardManifestIgnore(req(), context(), {
      requireAdminIdentity: okAdmin,
      withRowTx: withRowTx(happyStub("staged")),
    });
    expect(response.status).toBe(409);
    expect((await response.json()) as { code: string }).toMatchObject({
      code: "INVALID_REVIEWER_ACTION",
    });
    expect(
      lastTxCalls.some((c) => /insert into public\.deferred_ingestions/i.test(c.sql)),
    ).toBe(false);
  });

  test("supersession: manifest read returns null → 409 WIZARD_SESSION_SUPERSEDED, no writes", async () => {
    const stub: QueryStub = (sql) => {
      if (/from public\.onboarding_scan_manifest/i.test(sql) && /for update/i.test(sql)) {
        return null;
      }
      return null;
    };
    const response = await handleWizardManifestIgnore(req(), context(), {
      requireAdminIdentity: okAdmin,
      withRowTx: withRowTx(stub),
      upsertAdminAlert: async () => null,
      readCurrentWizardSessionId: async () => null,
    });
    expect(response.status).toBe(409);
    expect((await response.json()) as { code: string }).toMatchObject({
      code: "WIZARD_SESSION_SUPERSEDED",
    });
    expect(
      lastTxCalls.some((c) => /insert into public\.deferred_ingestions/i.test(c.sql)),
    ).toBe(false);
  });

  test("supersession BETWEEN the deferral write and the transition: transition false → 409 + the deferral is rolled back", async () => {
    // The deferral upsert succeeds, but the manifest transition CAS returns 0
    // rows (false) — a supersession landed between the two writes. The route MUST
    // throw WizardSessionSupersededRollbackError so withRowTx aborts the tx and the
    // already-written deferral is discarded. We prove rollback by asserting the
    // ENTIRE tx callback threw out of withRowTx (a plain return would COMMIT).
    let txCallbackThrew = false;
    const stub: QueryStub = (sql) => {
      if (/from public\.onboarding_scan_manifest/i.test(sql) && /for update/i.test(sql)) {
        return { name: SHEET_NAME, status: "live_row_conflict" };
      }
      if (/insert into public\.deferred_ingestions/i.test(sql)) {
        return { upserted: true }; // the orphan-able write
      }
      if (/update public\.onboarding_scan_manifest/i.test(sql)) {
        return null; // CAS MISS → false
      }
      return null;
    };
    const throwingWithRowTx = async <R>(
      _driveFileId: string,
      fn: (tx: WizardManifestIgnoreRouteTx) => Promise<R> | R,
    ): Promise<R> => {
      const { tx, calls } = makeTx(stub);
      lastTxCalls = calls;
      try {
        return await fn(tx);
      } catch (error) {
        txCallbackThrew = true; // rollback signal: a real tx aborts here
        throw error;
      }
    };

    const response = await handleWizardManifestIgnore(req(), context(), {
      requireAdminIdentity: okAdmin,
      withRowTx: throwingWithRowTx,
      upsertAdminAlert: async () => null,
      readCurrentWizardSessionId: async () => null,
    });

    expect(txCallbackThrew, "the tx callback threw → the deferral write is rolled back").toBe(true);
    expect(response.status).toBe(409);
    expect((await response.json()) as { code: string }).toMatchObject({
      code: "WIZARD_SESSION_SUPERSEDED",
    });
    // The deferral upsert DID run inside the (now-aborted) tx — its effect is gone
    // because the tx threw, but the statement was issued (proving the ordering risk).
    expect(
      lastTxCalls.some((c) => /insert into public\.deferred_ingestions/i.test(c.sql)),
    ).toBe(true);
  });
});
