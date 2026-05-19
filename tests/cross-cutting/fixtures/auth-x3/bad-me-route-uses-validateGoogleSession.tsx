export default async function Me(req: Request) {
  const google = await validateGoogleSession(req, { showId: "show-id" });
  if (google.kind === "success") return listShowsForCrew(google.viewer);
}
