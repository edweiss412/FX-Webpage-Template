// app/api/admin/needs-attention-count/route.ts
import { NextResponse } from "next/server";
import { AdminInfraError, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { loadNeedsAttentionCount } from "@/lib/admin/needsAttentionCount";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminIdentity();
  } catch (err) {
    if (err instanceof AdminInfraError) {
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }
    throw err; // forbidden()/notFound() control flow propagates to Next
  }
  const result = await loadNeedsAttentionCount();
  if (result.kind === "infra_error") {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  return NextResponse.json({ count: result.count }, { headers: { "Cache-Control": "no-store" } });
}
