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
import { revalidateShow } from "@/lib/data/showCacheTag";
import { log } from "@/lib/log";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";

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
  } catch (error) {
    // Fail-open (explicit wrap at the callsite): a logger throw must never change the
    // 503 the caller already gets. Forensic-only (inside a log span → strip-exempt).
    try {
      await log.error("unpublish link consume threw", {
        source: "api.show.unpublish",
        code: "UNPUBLISH_INFRA_FAILED",
        error,
      });
    } catch {
      /* best-effort */
    }
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  if (result.outcome === "success") {
    // nav-perf tag-caching (Task 9): the consume archived the show (published=false) — gates crew
    // visibility (getShowForViewer.ts:291). unpublishShowViaEmailedLink owns its lock/tx and has
    // committed by the time it resolves, so revalidateShow here is POST-COMMIT.
    revalidateShow(result.showId);
    // POST-COMMIT durable outcome (#218) — the consume has committed. Public/emailed-link
    // leg: no admin identity, so no actorEmail. Fail-open: a logger throw must not turn a
    // committed unpublish into a 5xx.
    try {
      await logAdminOutcome({
        code: "SHOW_UNPUBLISHED_VIA_EMAILED_LINK",
        source: "api.show.unpublish",
        showId: result.showId,
      });
    } catch {
      /* best-effort */
    }
    return NextResponse.json({ ok: true, showId: result.showId }, { status: 200 });
  }
  if (result.outcome === "expired") {
    return NextResponse.json({ ok: false, code: result.code }, { status: 400 });
  }
  return NextResponse.json({ ok: false }, { status: 404 });
}
