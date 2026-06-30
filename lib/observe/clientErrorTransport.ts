// Client-safe shared transport for the app_events mirror. NO server imports.
const seen = new Set<string>();
const CAPS = {
  message: 1000,
  stack: 8000,
  componentStack: 8000,
  digest: 200,
  url: 2000,
  tileId: 200,
} as const;

export function __resetClientTransportDedupForTests(): void {
  seen.clear();
}

export function clientErrorTransport(input: {
  source: string;
  level: "warn" | "error";
  message: string;
  stack?: string;
  componentStack?: string;
  digest?: string;
  tileId?: string;
}): void {
  try {
    if (typeof fetch === "undefined") return;
    const message = input.message.slice(0, CAPS.message);
    const signature = `${input.source}|${input.level}|${message}|${(input.stack ?? "").slice(0, 200)}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    const payload: Record<string, string> = { source: input.source, level: input.level, message };
    if (input.stack) payload.stack = input.stack.slice(0, CAPS.stack);
    if (input.componentStack)
      payload.componentStack = input.componentStack.slice(0, CAPS.componentStack);
    if (input.digest) payload.digest = input.digest.slice(0, CAPS.digest);
    if (input.tileId) payload.tileId = input.tileId.slice(0, CAPS.tileId);
    if (typeof location !== "undefined") payload.url = location.href.slice(0, CAPS.url);
    void fetch("/api/observe/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* fail-open */
  }
}
