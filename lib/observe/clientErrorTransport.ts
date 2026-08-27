// Client-safe shared transport for the app_events mirror. NO server imports.
const seen = new Set<string>();
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
  code?: string;
  detail?: string;
}): void {
  try {
    if (typeof fetch === "undefined") return;
    const message = input.message.slice(0, CAPS.message);
    // `detail` is in the key, and that is the second half of the repair. A
    // non-`Error` value has no stack, so before this the key reduced to
    // `source|level|message` — and `message` is a LABEL: two crashes with the same
    // name/code/message but different contents share it, and the rejection
    // listener sends a fixed message for every rejection it ever handles. Sliced at
    // 200 to match the `stack` term beside it and to bound a Set that lives as long
    // as the page.
    //
    // The `Error` path's key gains a trailing separator over an empty term. That is
    // constant across every Error call, so no two previously-distinct keys merge
    // and no two previously-equal keys split: the BEHAVIOUR is preserved even
    // though the bytes are not.
    const signature = `${input.source}|${input.level}|${message}|${(input.stack ?? "").slice(0, 200)}|${(input.detail ?? "").slice(0, 200)}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    const payload: Record<string, string> = { source: input.source, level: input.level, message };
    if (input.stack) payload.stack = input.stack.slice(0, CAPS.stack);
    if (input.componentStack)
      payload.componentStack = input.componentStack.slice(0, CAPS.componentStack);
    if (input.digest) payload.digest = input.digest.slice(0, CAPS.digest);
    if (input.tileId) payload.tileId = input.tileId.slice(0, CAPS.tileId);
    if (input.code) payload.code = input.code.slice(0, CAPS.code);
    if (input.detail) payload.detail = input.detail.slice(0, CAPS.detail);
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
