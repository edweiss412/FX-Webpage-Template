"use server";
import { revalidatePath } from "next/cache";
import { requireDeveloperIdentity } from "@/lib/auth/requireDeveloper";
import { setAdminDeveloper, AdminEmailsInfraError } from "@/lib/data/adminEmails";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";

export type SetDeveloperActionResult =
  | { kind: "ok"; email: string; isDeveloper: boolean }
  | { kind: "self_developer_demote_forbidden"; email: string }
  | { kind: "not_found"; email: string }
  | { kind: "invalid_email" }
  | { kind: "not_authorized" }
  | { kind: "infra_error" };

export async function setDeveloperAction(
  _prev: SetDeveloperActionResult | null,
  formData: FormData,
): Promise<SetDeveloperActionResult> {
  // Gate OUTSIDE the try (boundary-throw): a DeveloperInfraError propagates to
  // the catalog 500 boundary; the non-developer forbidden() digest propagates
  // too — mirrors addAdminAction (admins/actions.ts:76).
  const identity = await requireDeveloperIdentity();

  const rawEmail = formData.get("email");
  const isDeveloper = formData.get("is_developer") === "true";
  if (typeof rawEmail !== "string") return { kind: "invalid_email" };

  let outcome;
  try {
    outcome = await setAdminDeveloper({ rawEmail, isDeveloper });
  } catch (err) {
    if (err instanceof AdminEmailsInfraError) return { kind: "infra_error" };
    throw err;
  }
  if (outcome.kind === "ok") {
    revalidatePath("/admin/settings");
    revalidatePath("/admin/settings/admins");
    // Durable forensic telemetry: post-commit, success branch only (invariant 10, §5.2).
    await logAdminOutcome({
      code: "ADMIN_DEVELOPER_SET",
      source: "admin.settings.admins.developer",
      actorEmail: identity.email,
      result: outcome.isDeveloper ? "granted" : "revoked",
    });
  }
  return outcome;
}
