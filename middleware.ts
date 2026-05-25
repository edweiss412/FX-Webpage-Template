import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

export function middleware(_request: NextRequest): NextResponse {
  return NextResponse.next();
}
