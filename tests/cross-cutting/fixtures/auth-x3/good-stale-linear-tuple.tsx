export async function GET(req: Request) {
  if (!(await isAdminSession(req)).ok) {
    const link = await validateLinkSession(req, { showId: "show-id" });
    if (link.kind === "continue") {
      const google = await validateGoogleSession(req, { showId: "show-id" });
      if (google.kind === "continue") {
        const admin = await requireAdmin();
        const ok = { kind: "success" as const, admin };
        if (ok.kind === "success") await supabase.from("shows").select("*");
      }
    }
  }
}
