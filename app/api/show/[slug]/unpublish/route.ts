// app/api/show/[slug]/unpublish/route.ts — M12.13 contract change (spec §3
// R8): the route REMAINS as a surface but must not survive as a binding
// bypass. It now requires `token` AND `r` and consumes EXCLUSIVELY via the
// locked wrapper `unpublishShowViaEmailedLink` (in-transaction FOR-SHARE
// binding re-validation — a pre-check + plain unpublishShow would leave the
// check-then-consume race on this leg, R15). Bare slug+token POSTs are
// rejected with the neutral 404 WITHOUT consuming and WITHOUT a code in the
// body. Safe contract change: the route shipped with B2 but had NO consumer
// until this milestone — the confirm page is its first.
//
// Outcome → JSON mapping (spec §5 POST outcomes mirrored):
//   success  → 200 { ok:true, showId }
//   expired  → 400 { ok:false, code: "UNPUBLISH_TOKEN_EXPIRED" } (binding-
//              validated — the stored token still exists, so r was derivable)
//   consumed → 404 { ok:false } — R19/R20: with the mint gone r is
//              underivable; UNPUBLISH_TOKEN_CONSUMED never returns on any
//              public leg (the wrapper exits neutral before that branch; this
//              arm is defensive depth)
//   not_found→ 404 { ok:false } (covers unknown slug, invalid/revoked/stale
//              r, token mismatch, post-consumption token+old-r)
//   thrown   → 503 { ok:false } — infra fault, discriminable from the
//              neutral 404, no code in the body (invariant 9)
import { NextResponse, type NextRequest } from "next/server";
import { unpublishShowViaEmailedLink } from "@/lib/sync/unpublishShow";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { slug } = await context.params;
  const token = request.nextUrl.searchParams.get("token");
  const r = request.nextUrl.searchParams.get("r");
  if (!token || !r) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  let result;
  try {
    result = await unpublishShowViaEmailedLink({ slug, token, r });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  if (result.outcome === "success") {
    return NextResponse.json({ ok: true, showId: result.showId }, { status: 200 });
  }
  if (result.outcome === "expired") {
    return NextResponse.json({ ok: false, code: result.code }, { status: 400 });
  }
  return NextResponse.json({ ok: false }, { status: 404 });
}
