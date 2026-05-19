export async function generateMetadata(req: Request) {
  if (!(await isAdminSession(req)).ok) {
    const link = await validateLinkSession(req, { showId: "show-id" });
    if (link.kind === "success") return getShowForViewer("show-id", link.viewer);
  }
}
