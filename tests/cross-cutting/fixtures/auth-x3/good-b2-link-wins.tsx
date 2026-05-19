import { isAdminSession } from "@/lib/auth/isAdminSession";
import { validateLinkSession } from "@/lib/auth/validateLinkSession";

export async function GET(req: Request) {
  const admin = await isAdminSession(req);
  if (!admin.ok) {
    const link = await validateLinkSession(req, { showId: "show-id" });
    if (link.kind === "success") {
      return getShowForViewer("show-id", link.viewer);
    }
  }
  return null;
}
