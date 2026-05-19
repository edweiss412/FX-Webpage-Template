import { isAdminSession } from "@/lib/auth/isAdminSession";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { validateGoogleSession } from "@/lib/auth/validateGoogleSession";
import { validateLinkSession } from "@/lib/auth/validateLinkSession";

export async function GET(req: Request) {
  const admin = await isAdminSession(req);
  if (!admin.ok) {
    const link = await validateLinkSession(req, { showId: "show-id" });
    if (link.kind === "continue") {
      const google = await validateGoogleSession(req, { showId: "show-id" });
      if (google.kind === "continue") {
        const required = await requireAdmin();
        const final = { kind: "success" as const, required };
        if (final.kind === "success") return getShowForViewer("show-id", { kind: "admin" });
      }
    }
  }
  return null;
}
