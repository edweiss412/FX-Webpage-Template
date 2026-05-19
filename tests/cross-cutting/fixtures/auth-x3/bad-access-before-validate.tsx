export async function GET(req: Request) {
  const data = await getShowForViewer("show-id", { kind: "crew" });
  const link = await validateLinkSession(req, { showId: "show-id" });
  if (link.kind === "success") return data;
}
