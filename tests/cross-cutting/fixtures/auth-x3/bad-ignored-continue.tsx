export async function GET(req: Request) {
  if (!(await isAdminSession(req)).ok) {
    await validateLinkSession(req, { showId: "show-id" });
    return getShowForViewer("show-id", { kind: "crew" });
  }
}
