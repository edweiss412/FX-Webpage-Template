export async function GET(req: Request) {
  if (!(await isAdminSession(req)).ok) {
    const r = await validateLinkSession(req, { showId: "show-id" });
    void r.viewer;
    return getShowForViewer("show-id", { kind: "crew" });
  }
}
