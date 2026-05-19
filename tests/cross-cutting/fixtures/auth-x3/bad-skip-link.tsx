export async function GET() {
  await requireAdmin();
  const admin = { kind: "success" as const };
  if (admin.kind === "success") return getShowForViewer("show-id", { kind: "admin" });
}
