import { describe, expect, test, vi } from "vitest";
import type {
  WizardStagedRouteDeps,
  WizardStagedRouteTx,
} from "@/app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route";
import type { WizardDiscardRouteDeps } from "@/app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route";
import { handleWizardStagedApply } from "@/app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route";
import { handleWizardStagedDiscard } from "@/app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route";

const W1 = "11111111-1111-4111-8111-111111111111";
const STAGED = "22222222-2222-4222-8222-222222222222";

function applyRequest(body: Record<string, unknown> = {}): Request {
  return new Request(`https://crew.fxav.test/api/admin/onboarding/staged/${W1}/file-1/apply`, {
    method: "POST",
    body: JSON.stringify({
      stagedId: STAGED,
      reviewerChoicesVersion: 1,
      reviewerChoices: [],
      ...body,
    }),
    headers: { "content-type": "application/json" },
  });
}

function discardRequest(body: Record<string, unknown> = {}): Request {
  return new Request(`https://crew.fxav.test/api/admin/onboarding/staged/${W1}/file-1/discard`, {
    method: "POST",
    body: JSON.stringify({
      stagedId: STAGED,
      kind: "try_again_next_sync",
      ...body,
    }),
    headers: { "content-type": "application/json" },
  });
}

class FakeWizardStagedTx {
  lockedDriveIds: string[] = [];
  async queryOne<T>(sql: string, params: unknown[]) {
    if (/pg_locks/i.test(sql)) return { held: true } as T;
    this.lockedDriveIds.push(params[0] as string);
    return { locked: true } as T;
  }
}

function deps(
  tx: FakeWizardStagedTx,
  overrides: Partial<WizardStagedRouteDeps> = {},
): WizardStagedRouteDeps & WizardDiscardRouteDeps {
  return {
    requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
    withRowTx: vi.fn(async (_driveFileId, fn) => fn(tx as unknown as WizardStagedRouteTx)),
    applyStagedUnlocked: vi.fn(async () => ({
      outcome: "wizard_applied" as const,
      wizardSessionId: W1,
      stagedId: STAGED,
    })),
    discardStagedUnlocked: vi.fn(async () => ({ outcome: "discarded" as const, variant: "try_again" as const })),
    ...overrides,
  };
}

const context = {
  params: Promise.resolve({ wizardSessionId: W1, driveFileId: "file-1" }),
};

async function json(response: Response): Promise<unknown> {
  return await response.json();
}

describe("wizard-scoped staged apply/discard routes", () => {
  test("apply delegates to applyStaged_unlocked with sourceScope wizard inside the row lock", async () => {
    const tx = new FakeWizardStagedTx();
    const routeDeps = deps(tx);

    const response = await handleWizardStagedApply(applyRequest(), context, routeDeps);

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      status: "reapplied",
      wizard_session_id: W1,
      drive_file_id: "file-1",
    });
    expect(routeDeps.withRowTx).toHaveBeenCalledWith("file-1", expect.any(Function));
    expect(routeDeps.applyStagedUnlocked).toHaveBeenCalledWith(
      tx,
      {
        sourceScope: "wizard",
        wizardSessionId: W1,
        driveFileId: "file-1",
        stagedId: STAGED,
        reviewerChoices: [],
        appliedByEmail: "doug@example.com",
      },
      expect.any(Object),
    );
  });

  test("apply preserves superseded parse errors from applyStaged_unlocked", async () => {
    const response = await handleWizardStagedApply(
      applyRequest(),
      context,
      deps(new FakeWizardStagedTx(), {
        applyStagedUnlocked: vi.fn(async () => ({
          outcome: "superseded" as const,
          code: "STAGED_PARSE_SUPERSEDED" as const,
        })),
      }),
    );

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ ok: false, code: "STAGED_PARSE_SUPERSEDED" });
  });

  test("apply rejects unsupported reviewer choice versions before locking", async () => {
    const routeDeps = deps(new FakeWizardStagedTx());
    const response = await handleWizardStagedApply(
      applyRequest({ reviewerChoicesVersion: 2 }),
      context,
      routeDeps,
    );

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({
      ok: false,
      code: "WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED",
    });
    expect(routeDeps.withRowTx).not.toHaveBeenCalled();
  });

  test("discard delegates to discardStaged_unlocked with wizard scope and mapped variant", async () => {
    const tx = new FakeWizardStagedTx();
    const routeDeps = deps(tx);

    const response = await handleWizardStagedDiscard(
      discardRequest({ kind: "defer_until_modified" }),
      context,
      routeDeps,
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      status: "discarded",
      wizard_session_id: W1,
      drive_file_id: "file-1",
      variant: "defer_until_modified",
    });
    expect(routeDeps.discardStagedUnlocked).toHaveBeenCalledWith(
      tx,
      {
        sourceScope: "wizard",
        wizardSessionId: W1,
        driveFileId: "file-1",
        stagedId: STAGED,
        variant: "defer_until_modified",
      },
      expect.any(Object),
    );
  });
});
