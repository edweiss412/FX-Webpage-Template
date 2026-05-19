export default async function Me(req: Request) {
  const identity = await validateGoogleIdentity(req);
  if (identity.kind === "success") return listShowsForCrew(identity);
}
