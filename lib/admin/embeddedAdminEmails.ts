import { listAdminEmails, AdminEmailsInfraError, type AdminEmailRow } from "@/lib/data/adminEmails";

export type EmbeddedAdminEmailsResult =
  | { kind: "ok"; rows: AdminEmailRow[] }
  | { kind: "infra_error" };

// not-subject-to-meta: wrapper of the throwing listAdminEmails() — no direct supabase.from await;
// the throw→typed mapping is pinned by the behavioral tests in tests/admin/embeddedAdminEmails.test.ts.
export async function fetchEmbeddedAdminEmails(): Promise<EmbeddedAdminEmailsResult> {
  try {
    const rows = await listAdminEmails();
    return { kind: "ok", rows };
  } catch (err) {
    // Narrow catch (invariant 9): ONLY a real infra fault maps to the typed in-section read failure.
    if (err instanceof AdminEmailsInfraError) return { kind: "infra_error" };
    throw err; // programmer bugs / Next control-flow digests / contract drift propagate to the route boundary
  }
}
