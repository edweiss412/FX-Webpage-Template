export function Form() {
  async function action(req: Request) {
    "use server";
    if (!(await isAdminSession(req)).ok) {
      const link = await validateLinkSession(req, { showId: "show-id" });
      if (link.kind === "success") await supabase.from("shows_internal").select("*");
    }
  }
  return <form action={action} />;
}
