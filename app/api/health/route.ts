// app/api/health/route.ts
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET(): Promise<Response> {
  return NextResponse.json({
    ok: true,
    sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    builtEnv: process.env.VERCEL_ENV ?? null,
  });
}
