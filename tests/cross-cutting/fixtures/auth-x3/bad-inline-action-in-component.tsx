export function Form() {
  async function action() {
    "use server";
    await supabase.from("shows_internal").select("*");
  }
  return <form action={action} />;
}
