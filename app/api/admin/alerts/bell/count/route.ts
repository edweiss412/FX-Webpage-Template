// app/api/admin/alerts/bell/count/route.ts (bell notification center Task 9)
import { NextResponse } from "next/server";
import { AdminInfraError, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { isCurrentUserDeveloper } from "@/lib/auth/requireDeveloper";
import { loadBellUnseenCount } from "@/lib/admin/bellFeed";

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
  const result = await loadBellUnseenCount(email, viewerIsDeveloper);
  if (result.kind === "infra_error") {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  return NextResponse.json({ count: result.count }, { headers: { "Cache-Control": "no-store" } });
}
