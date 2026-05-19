export async function GET(req: Request) {
  if (!(await isAdminSession(req)).ok) {
    const link = await validateLinkSession(req, { showId: "show-id" });
    if (link.kind === "success") return supabase.from("shows").select("*");
  }
}
