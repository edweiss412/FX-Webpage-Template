import { loadShow } from "./helpers";

export async function GET(req: Request) {
  const show = await loadShow();
  const link = await validateLinkSession(req, { showId: "show-id" });
  if (link.kind === "success") return show;
}
