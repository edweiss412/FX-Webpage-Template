// app/api/admin/alerts/bell/feed/route.ts (bell notification center Task 9)
import { NextResponse } from "next/server";
import { AdminInfraError, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { isCurrentUserDeveloper } from "@/lib/auth/requireDeveloper";
import { loadBellFeed } from "@/lib/admin/bellFeed";

export const dynamic = "force-dynamic";

export async function GET() {
  let email: string;
  try {
    ({ email } = await requireAdminIdentity());
  } catch (err) {
    if (err instanceof AdminInfraError) {
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }
    throw err; // forbidden()/notFound() control flow propagates to Next
  }
  const viewerIsDeveloper = await isCurrentUserDeveloper();
  const result = await loadBellFeed(email, viewerIsDeveloper);
  if (result.kind === "infra_error") {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const { kind: _kind, ...body } = result;
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
