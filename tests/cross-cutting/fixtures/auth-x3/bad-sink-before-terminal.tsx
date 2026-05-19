export async function GET(req: Request) {
  await supabase.from("shows_internal").select("*");
  const link = await validateLinkSession(req, { showId: "show-id" });
  if (link.kind === "success") return null;
}
