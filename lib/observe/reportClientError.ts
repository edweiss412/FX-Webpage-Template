// Client-safe. NO server imports. Best-effort mirror of boundary crashes to /api/observe/client-error.
type Area = "crew" | "admin" | "root";
const seen = new Set<string>();
// Client-side caps mirror the server caps (spec §3) so we never send oversized bodies on the wire.
const CAPS = { message: 1000, stack: 8000, componentStack: 8000, digest: 200, url: 2000 } as const;

function toError(e: unknown): { message: string; stack?: string | undefined } {
  if (e instanceof Error) return { message: e.message || "(no message)", stack: e.stack };
  return { message: String(e) || "(no message)" };
}

export function __resetReportDedupForTests(): void {
  seen.clear();
}

export function reportClientError(input: {
  error: unknown;
  area: Area;
  componentStack?: string;
  digest?: string;
}): void {
  try {
    if (typeof fetch === "undefined") return;
    const { message, stack } = toError(input.error);
    const signature = `${input.area}|${message}|${(stack ?? "").slice(0, 200)}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    const payload: Record<string, string> = { area: input.area, message: message.slice(0, CAPS.message) };
    if (stack) payload.stack = stack.slice(0, CAPS.stack);
    if (input.componentStack) payload.componentStack = input.componentStack.slice(0, CAPS.componentStack);
    if (input.digest) payload.digest = input.digest.slice(0, CAPS.digest);
    if (typeof location !== "undefined") payload.url = location.href.slice(0, CAPS.url);
    void fetch("/api/observe/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* fail-open: never throw into a boundary effect */
  }
}
