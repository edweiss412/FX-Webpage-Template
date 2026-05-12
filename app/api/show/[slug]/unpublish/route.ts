import { NextResponse, type NextRequest } from "next/server";
import { unpublishShow } from "@/lib/sync/unpublishShow";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { slug } = await context.params;
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const result = await unpublishShow({ slug, token });
  if (result.outcome === "success") {
    return NextResponse.json({ ok: true, showId: result.showId }, { status: 200 });
  }
  if (result.outcome === "not_found") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  return NextResponse.json(
    { ok: false, code: result.code, showId: result.showId },
    { status: result.status },
  );
}
