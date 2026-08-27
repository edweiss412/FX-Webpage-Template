// Client-safe shared transport for the app_events mirror. NO server imports.
const seen = new Set<string>();
/**
 * The dedup set lives as long as the page, and a crew page stays open for a whole
 * show. Nothing evicted it: one entry per distinct signature, forever. Adding
 * `detail` to the key (below) makes strictly MORE signatures distinct — which is
 * the repair, and which also makes this grow faster, so bounding it is this
 * change's own consequence rather than an unrelated tidy-up.
 *
 * Clearing wholesale rather than evicting the oldest: a Set has no cheap LRU, and
 * the failure mode of clearing is re-sending a crash already sent. That is the
 * conservative direction, and the route rate-caps at 20/min/source anyway
 * (app/api/observe/client-error/route.ts), so a flood is bounded server-side no
 * matter what this does.
 */
const SEEN_MAX = 500;
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

/**
 * The crew page's URL carries a SECRET in its path: `/show/<slug>/<shareToken>`
 * is the only share-token-bearing route in the app. `location.href` went onto the
 * wire unmodified, so any client crash on a crew page persisted that token
 * verbatim into `app_events`, where the developer telemetry console renders it.
 * AGENTS.md invariant 10 is explicit that secrets are never logged — `rotateShareToken`
 * emits `epoch_<n>` precisely so the token itself never appears — and
 * `lib/log/sanitize.ts` redacts emails only, so nothing downstream was going to
 * catch this.
 *
 * Keyed on the route shape rather than on what a token looks like: guessing at
 * token SHAPE is a recognizer that fails open on the next format. This keeps
 * `/show/<slug>` — which is what makes the row diagnosable — and masks every
 * segment after it. It fails SAFE: an unexpected extra segment is masked too.
 *
 * Total function. A malformed URL returns the input's origin-less path or "", never throws.
 */
export function redactShareToken(href: string): string {
  try {
    const u = new URL(href);
    const parts = u.pathname.split("/"); // ["", "show", slug, token, ...]
    if (parts[1] === "show" && parts.length > 3) {
      u.pathname = `/show/${parts[2]}/[share-token-redacted]`;
      u.search = "";
      u.hash = "";
    }
    return u.href;
  } catch {
    return "";
  }
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
    if (seen.size >= SEEN_MAX) seen.clear();
    seen.add(signature);
    const payload: Record<string, string> = { source: input.source, level: input.level, message };
    if (input.stack) payload.stack = input.stack.slice(0, CAPS.stack);
    if (input.componentStack)
      payload.componentStack = input.componentStack.slice(0, CAPS.componentStack);
    if (input.digest) payload.digest = input.digest.slice(0, CAPS.digest);
    if (input.tileId) payload.tileId = input.tileId.slice(0, CAPS.tileId);
    if (input.code) payload.code = input.code.slice(0, CAPS.code);
    if (input.detail) payload.detail = input.detail.slice(0, CAPS.detail);
    if (typeof location !== "undefined") {
      payload.url = redactShareToken(location.href).slice(0, CAPS.url);
    }
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
