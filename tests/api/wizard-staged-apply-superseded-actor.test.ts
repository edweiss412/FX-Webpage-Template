import { describe, expect, test } from "vitest";

import { WizardSessionSupersededRollbackError } from "@/lib/sync/wizardSessionRollback";
import { hashForLog } from "@/lib/email/hashForLog";
import type { UpsertAdminAlertInput } from "@/lib/adminAlerts/upsertAdminAlert";
import { handleWizardStagedApply } from "@/app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route";

// S2: the WIZARD_SESSION_SUPERSEDED_RACE admin_alert emitted when applyStaged throws an
// in-apply supersession previously omitted actor attribution. admin.email is in scope, so
// the alert context now carries a HASHED actor (actor_email_hash = hashForLog(admin.email))
// — never the raw email (PII-safe). The alert code and the typed 409 are unchanged.

const wizardSessionId = "33333333-3333-4333-8333-333333333333";
const driveFileId = "drive-file-2";
const adminEmail = "doug@fxav.test"; // canonical (as requireAdminIdentity returns)
const currentSessionId = "44444444-4444-4444-8444-444444444444";

function request(body: unknown) {
  return new Request("https://crew.fxav.test/api/admin/onboarding/staged/w/d/apply", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function ctx() {
  return { params: Promise.resolve({ wizardSessionId, driveFileId }) };
}

const validBody = {
  stagedId: "22222222-2222-4222-8222-222222222222",
  reviewerChoices: [],
  reviewerChoicesVersion: 1,
};

describe("wizard staged apply — superseded-race actor attribution (S2)", () => {
  test("alert context carries hashed actor; code + 409 unchanged", async () => {
    let captured: UpsertAdminAlertInput | null = null;
    const response = await handleWizardStagedApply(request(validBody), ctx(), {
      requireAdminIdentity: async () => ({ email: adminEmail }),
      applyStaged: async () => {
        throw new WizardSessionSupersededRollbackError({
          attemptedAction: "apply",
          supersededSessionId: wizardSessionId,
          driveFileId,
        });
      },
      upsertAdminAlert: async (input) => {
        captured = input;
        return "alert-id";
      },
      readCurrentWizardSessionId: async () => currentSessionId,
    });

    // Typed 409 is byte-preserved.
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "WIZARD_SESSION_SUPERSEDED",
    });

    // The alert fired with its unchanged code + the NEW hashed-actor field.
    expect(captured).not.toBeNull();
    const alert = captured as unknown as UpsertAdminAlertInput;
    expect(alert.code).toBe("WIZARD_SESSION_SUPERSEDED_RACE");
    const context = alert.context as Record<string, unknown>;
    expect(context.actor_email_hash).toBe(hashForLog(adminEmail));
    // Never the raw email — it is a hash (PII-safe).
    expect(context.actor_email_hash).not.toBe(adminEmail);
    expect(typeof context.actor_email_hash).toBe("string");
    // Pre-existing context fields are still present (not clobbered).
    expect(context.attempted_action).toBe("apply");
    expect(context.drive_file_id).toBe(driveFileId);
    expect(context.current_session_id).toBe(currentSessionId);
  });
});
