import { describe, expect, test, vi } from "vitest";
import type {
  LiveStagedRouteDeps,
  LiveStagedRouteTx,
} from "@/app/api/admin/show/staged/[stagedId]/apply/route";
import type { LiveStagedDiscardRouteDeps } from "@/app/api/admin/show/staged/[stagedId]/discard/route";
import { handleLiveStagedApply } from "@/app/api/admin/show/staged/[stagedId]/apply/route";
import { handleLiveStagedDiscard } from "@/app/api/admin/show/staged/[stagedId]/discard/route";

const STAGED = "22222222-2222-4222-8222-222222222222";

class FakeLiveStagedTx {
  driveFileId: string | null = "file-1";
  slug = "first-seen-show";
  async queryOne<T>(sql: string, params: unknown[]) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (/pg_locks/i.test(normalized)) return { held: true } as T;
    if (normalized.startsWith("select drive_file_id")) {
      return (this.driveFileId ? { drive_file_id: this.driveFileId } : null) as T;
    }
    if (normalized.startsWith("select slug")) return { slug: this.slug } as T;
    throw new Error(`Unhandled live staged SQL: ${normalized} ${JSON.stringify(params)}`);
  }
}

function deps(
  tx: FakeLiveStagedTx,
  overrides: Partial<LiveStagedRouteDeps> = {},
): LiveStagedRouteDeps & LiveStagedDiscardRouteDeps {
  return {
    requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
    withRowTx: vi.fn(async (_driveFileId, fn) => fn(tx as unknown as LiveStagedRouteTx)),
    readDriveFileIdForStagedId: vi.fn(async () => tx.driveFileId),
    readShowSlug: vi.fn(async () => tx.slug),
    applyStaged: vi.fn(async () => ({ outcome: "applied" as const, showId: "show-1", syncAuditId: null, derivedSideEffects: { revokeFloorForNames: [] } })),
    discardStaged: vi.fn(async () => ({ outcome: "discarded" as const, variant: "defer_until_modified" as const })),
    ...overrides,
  };
}

const context = { params: Promise.resolve({ stagedId: STAGED }) };

function req(body: Record<string, unknown> = {}): Request {
  return new Request("https://crew.fxav.test/api/admin/show/staged/id/action", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function json(response: Response): Promise<unknown> {
  return await response.json();
}

describe("live first-seen staged apply/discard", () => {
  test("apply delegates to applyStaged with sourceScope live and returns slug", async () => {
    const tx = new FakeLiveStagedTx();
    const routeDeps = deps(tx);

    const response = await handleLiveStagedApply(
      req({ reviewer_choices: [] }),
      context,
      routeDeps,
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ slug: "first-seen-show" });
    expect(routeDeps.applyStaged).toHaveBeenCalledWith(
      {
        sourceScope: "live",
        driveFileId: "file-1",
        stagedId: STAGED,
        reviewerChoices: [],
        appliedByEmail: "doug@example.com",
      },
      expect.any(Object),
    );
  });

  test("discard delegates to discardStaged with live scope", async () => {
    const tx = new FakeLiveStagedTx();
    const routeDeps = deps(tx);

    const response = await handleLiveStagedDiscard(
      req({ kind: "defer_until_modified" }),
      context,
      routeDeps,
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: "discarded", variant: "defer_until_modified" });
    expect(routeDeps.discardStaged).toHaveBeenCalledWith(
      {
        sourceScope: "live",
        driveFileId: "file-1",
        stagedId: STAGED,
        discardedByEmail: "doug@example.com",
        variant: "defer_until_modified",
      },
      expect.any(Object),
    );
  });

  test("never returns an empty 500 — an unexpected throw in applyStaged becomes a typed JSON error (Codex R5)", async () => {
    // Structural backstop: a corrupt parse_result that slips past the coercer's
    // shape gate (or any DB fault) would throw inside applyStaged; the route must
    // return a typed JSON body, not a body-less 500 that breaks the client's
    // response.json() (the M12 Phase 0.F smoke-3 empty-500 class).
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const tx = new FakeLiveStagedTx();
    const response = await handleLiveStagedApply(req({ reviewer_choices: [] }), context, {
      ...deps(tx),
      applyStaged: vi.fn(async () => {
        throw new Error("kaboom: corrupt parse_result deref");
      }),
    });
    expect(response.status).toBe(500);
    expect(await json(response)).toEqual({ ok: false, code: "SYNC_INFRA_ERROR" });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test("an infra fault in readDriveFileIdForStagedId (before applyStaged) is a typed 500, not an empty body (Codex R6)", async () => {
    // The pre-applyStaged DB lookup opens postgres.js; a DB outage / bad UUID cast
    // there must NOT bypass the never-empty-500 wrapper.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const tx = new FakeLiveStagedTx();
    const response = await handleLiveStagedApply(req({ reviewer_choices: [] }), context, {
      ...deps(tx),
      readDriveFileIdForStagedId: vi.fn(async () => {
        throw new Error("kaboom: DB outage resolving staged_id");
      }),
    });
    expect(response.status).toBe(500);
    expect(await json(response)).toEqual({ ok: false, code: "SYNC_INFRA_ERROR" });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test("missing live staged row returns STALE_DISCARD_REJECTED", async () => {
    const tx = new FakeLiveStagedTx();
    tx.driveFileId = null;

    const response = await handleLiveStagedApply(req({ reviewerChoices: [] }), context, deps(tx));

    expect(response.status).toBe(404);
    expect(await json(response)).toEqual({ ok: false, code: "STALE_DISCARD_REJECTED" });
  });

  test("apply preserves staged parse superseded errors from applyStaged", async () => {
    const tx = new FakeLiveStagedTx();

    const response = await handleLiveStagedApply(
      req({ reviewer_choices: [] }),
      context,
      deps(tx, {
        applyStaged: vi.fn(async () => ({
          outcome: "superseded" as const,
          code: "STAGED_PARSE_SUPERSEDED" as const,
        })),
      }),
    );

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ ok: false, code: "STAGED_PARSE_SUPERSEDED" });
  });

  test("apply maps reviewer-choice engine validation to 400", async () => {
    const tx = new FakeLiveStagedTx();

    const response = await handleLiveStagedApply(
      req({ reviewer_choices: [] }),
      context,
      deps(tx, {
        applyStaged: vi.fn(async () => ({
          outcome: "invalid_request" as const,
          code: "MISSING_REVIEWER_CHOICE" as const,
        })),
      }),
    );

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ ok: false, code: "MISSING_REVIEWER_CHOICE" });
  });
});
