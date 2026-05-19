import { validateLinkSession } from "@/lib/auth/validateLinkSession";

export async function GET() {
  void validateLinkSession;
  return getShowForViewer("show-id", { kind: "crew" });
}
