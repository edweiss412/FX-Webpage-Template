import { NextResponse, type NextRequest } from "next/server";

export function rejectUnauthorizedCron(request: NextRequest): Response | null {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization");

  if (!expected || provided !== `Bearer ${expected}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  return null;
}
