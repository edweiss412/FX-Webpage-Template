export async function GET(req: Request) {
  if (!(await isAdminSession(req)).ok) {
    const google = await validateGoogleSession(req, { showId: "show-id" });
    if (google.kind === "success") return getShowForViewer("show-id", google.viewer);
  }
}
