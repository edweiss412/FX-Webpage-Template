import { log } from "@/lib/log";
import { runWithRequestContext, deriveRequestId } from "@/lib/log/requestContext";

const ALLOWED_SOURCES = new Set([
  "client.crew",
  "client.admin",
  "client.root",
  "client.tile",
  "client.realtime",
]);
const CAPS = {
  message: 1000,
  stack: 8000,
  componentStack: 8000,
  digest: 200,
  url: 2000,
  tileId: 200,
  code: 80,
  detail: 500,
} as const;
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
// so the caller emits exactly ONE rate-cap warning per window per source (spec §3 "logged once").
function allow(source: string, now: number): { ok: boolean; warn: boolean } {
  const c = counters.get(source);
  if (!c || now >= c.resetAt) {
    counters.set(source, { count: 1, resetAt: now + WINDOW_MS, warned: false });
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
  const source = body.source;
  const level = body.level === undefined ? "error" : body.level;
  const rawMessage = typeof body.message === "string" ? body.message.trim() : "";
  if (
    typeof source !== "string" ||
    !ALLOWED_SOURCES.has(source) ||
    (level !== "warn" && level !== "error") ||
    rawMessage === ""
  ) {
    return Response.json({ ok: false }, { status: 400 });
  }
  // Best-effort per-instance backstop (acknowledged weak in serverless; client dedup is primary).
  const gate = allow(source, Date.now()); // rate-key by source (was area)
  if (!gate.ok) {
    if (gate.warn) {
      await runWithRequestContext({ requestId: deriveRequestId(req.headers) }, () =>
        safeLog(() =>
          log.warn("client-error mirror rate cap hit", {
            source: "observe.client-error",
            capped: source,
          }),
        ),
      );
    }
    return Response.json({ ok: true }, { status: 202 });
  }
  // Conditional spreads so an absent optional never materializes as `{ stack: undefined }`
  // (exactOptionalPropertyTypes); `cap()` returns string | undefined.
  const s = cap(body.stack, CAPS.stack);
  const cs = cap(body.componentStack, CAPS.componentStack);
  const dg = cap(body.digest, CAPS.digest);
  const u = cap(body.url, CAPS.url);
  const ti = cap(body.tileId, CAPS.tileId);
  // `code` stays a variable (cap(body.code)) — never a literal — so the code-scanner's
  // dotted-log-call strip doesn't reach it (log[level] is a computed member).
  const code = cap(body.code, CAPS.code);
  const detail = cap(body.detail, CAPS.detail);
  // AWAIT the write (log.* returns the emit promise) inside safeLog so a rejected sink/persist
  // is caught here and can never escape as an unhandled rejection (fail-open: never 5xx).
  await runWithRequestContext({ requestId: deriveRequestId(req.headers) }, () =>
    safeLog(() =>
      log[level](rawMessage.slice(0, CAPS.message), {
        source,
        ...(s ? { stack: s } : {}),
        ...(cs ? { componentStack: cs } : {}),
        ...(dg ? { digest: dg } : {}),
        ...(u ? { url: u } : {}),
        ...(ti ? { tileId: ti } : {}),
        ...(code ? { code } : {}),
        ...(detail ? { detail } : {}),
      }),
    ),
  );
  return Response.json({ ok: true }, { status: 202 });
}

export async function POST(req: Request): Promise<Response> {
  return handleClientError(req);
}
