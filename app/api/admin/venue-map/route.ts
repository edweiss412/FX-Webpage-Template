import { AdminInfraError, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { buildStaticMapUrl } from "@/lib/maps/staticMap";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 8_000;
const MAX_RETRIES = 2;

/** Admin-gated, READ-ONLY (GET) proxy to Google Static Maps. Read-only → NOT a
 * mutation surface (AGENTS.md invariant 10 is mutation-scoped), so no telemetry
 * registry row. The Google key lives only here; the browser never sees it. Any
 * non-200 is a fail-open signal → the client's <img> onError shows the stripe. */
export async function GET(req: Request): Promise<Response> {
  try {
    await requireAdminIdentity();
  } catch (err) {
    if (err instanceof AdminInfraError) return new Response(null, { status: 503 });
    throw err; // forbidden()/notFound() control flow propagates to Next
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 512);
  if (!q) return new Response(null, { status: 400 });
  const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";

  const upstreamUrl = buildStaticMapUrl(q, theme);
  if (!upstreamUrl) return new Response(null, { status: 404 }); // no key configured

  for (let attempt = 0; ; attempt++) {
    const canRetry = attempt < MAX_RETRIES;
    let res: Response;
    try {
      res = await fetch(upstreamUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      if (canRetry) continue;
      return new Response(null, { status: 502 }); // network/timeout — no raw text
    }
    if ((res.status === 429 || res.status >= 500) && canRetry) continue;
    if (!res.ok) return new Response(null, { status: 502 }); // no upstream body echoed
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "private, max-age=3600",
      },
    });
  }
}
