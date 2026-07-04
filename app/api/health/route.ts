// app/api/health/route.ts
import { NextResponse } from "next/server";
import { getPersistHealth } from "@/lib/log/persistHealth";
export const dynamic = "force-dynamic";
export async function GET(): Promise<Response> {
  return NextResponse.json({
    ok: true,
    sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    builtEnv: process.env.VERCEL_ENV ?? null,
    // finding #9: the app_events durable-channel self-health probe. A climbing
    // `failed` with `ok` flat = the durable log channel is down (RLS regression,
    // key rotation, schema drift, quota). Per-instance counters (module-level).
    logging: getPersistHealth(),
  });
}
