import { log } from "@/lib/log";
import { runWithRequestContext, deriveRequestId } from "@/lib/log/requestContext";

const AREAS = new Set(["crew", "admin", "root"]);
const CAPS = { message: 1000, stack: 8000, componentStack: 8000, digest: 200, url: 2000 } as const;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const counters = new Map<string, { count: number; resetAt: number; warned: boolean }>();

export function __resetClientErrorStateForTests(): void {
  counters.clear();
}

// Swallow BOTH sync throws and async rejections from the best-effort log sink (log.* returns the
// emit promise, lib/log/logger.ts:82). Awaited so the route never returns before the write resolves
// AND a rejected persist can never become an unhandled rejection (spec §0.5 fail-open).
async function safeLog(fn: () => unknown): Promise<void> {
  try {
    await fn();
  } catch {
    /* ignore */
  }
}

// Accept if EITHER signal proves same-origin (spec §3 literal OR): the browser-stamped
// Sec-Fetch-Site is the primary check; Origin===site is the fallback for browsers that omit it.
// A real cross-site browser request fails both (cross-site stamp + foreign Origin) → rejected.
function sameOrigin(req: Request): boolean {
  const sfs = req.headers.get("sec-fetch-site");
  const origin = req.headers.get("origin");
  const site = process.env.NEXT_PUBLIC_SITE_ORIGIN;
  return sfs === "same-origin" || Boolean(origin && site && origin === site);
}

function cap(v: unknown, n: number): string | undefined {
  return typeof v === "string" && v.length > 0 ? v.slice(0, n) : undefined;
}

// Best-effort per-instance backstop. Returns { ok } and, on the FIRST drop of a window, { warn:true }
// so the caller emits exactly ONE rate-cap warning per window per area (spec §3 "logged once").
function allow(area: string, now: number): { ok: boolean; warn: boolean } {
  const c = counters.get(area);
  if (!c || now >= c.resetAt) {
    counters.set(area, { count: 1, resetAt: now + WINDOW_MS, warned: false });
    return { ok: true, warn: false };
  }
  if (c.count >= MAX_PER_WINDOW) {
    const warn = !c.warned;
    c.warned = true;
    return { ok: false, warn };
  }
  c.count += 1;
  return { ok: true, warn: false };
}

export async function handleClientError(req: Request): Promise<Response> {
  if (req.headers.get("content-type")?.includes("application/json") !== true) {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (!sameOrigin(req)) return Response.json({ ok: false }, { status: 403 });
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  // Reject non-object JSON (null, arrays, primitives) BEFORE field access — else `body.area` throws.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return Response.json({ ok: false }, { status: 400 });
  }
  const body = parsed as Record<string, unknown>;
  const area = body.area;
  const rawMessage = typeof body.message === "string" ? body.message.trim() : "";
  if (typeof area !== "string" || !AREAS.has(area) || rawMessage === "") {
    return Response.json({ ok: false }, { status: 400 });
  }
  // Best-effort per-instance backstop (acknowledged weak in serverless; client dedup is primary).
  const gate = allow(area, Date.now());
  if (!gate.ok) {
    if (gate.warn) {
      await runWithRequestContext({ requestId: deriveRequestId(req.headers) }, () =>
        safeLog(() =>
          log.warn("client-error mirror rate cap hit", { source: "observe.client-error", area }),
        ),
      );
    }
    return Response.json({ ok: true }, { status: 202 });
  }
  // AWAIT the write (log.error returns the emit promise) inside safeLog so a rejected sink/persist
  // is caught here and can never escape as an unhandled rejection (fail-open: never 5xx).
  await runWithRequestContext({ requestId: deriveRequestId(req.headers) }, () =>
    safeLog(() =>
      log.error(rawMessage.slice(0, CAPS.message), {
        source: `client.${area}`,
        stack: cap(body.stack, CAPS.stack),
        componentStack: cap(body.componentStack, CAPS.componentStack),
        digest: cap(body.digest, CAPS.digest),
        url: cap(body.url, CAPS.url),
      }),
    ),
  );
  return Response.json({ ok: true }, { status: 202 });
}

export async function POST(req: Request): Promise<Response> {
  return handleClientError(req);
}
