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
 * The crew share token is a SECRET, and it travels further than the address bar.
 *
 * `/show/<slug>/<shareToken>` is the only share-token-bearing route, but the token
 * appears in at least three shapes on the wire:
 *   - the crew page's own `location.href`;
 *   - percent-encoded inside `/auth/sign-in?next=…`, which
 *     `lib/auth/picker/selectIdentity.ts` generates on every gated crew visit;
 *   - inside any FIELD a crash carries — a thrown `{ url: location.href }` lands in
 *     `detail`, a referrer lands in `message`, a component stack can carry either.
 *
 * A first version redacted the pathname of `payload.url` only. It missed both of
 * the other two, which is the whole class: a secret does not respect the field you
 * expected it in. So the scrub is applied to EVERY string on the wire, and it
 * matches the token wherever it sits in the text rather than only at a path
 * position.
 *
 * AGENTS.md invariant 10: secrets are never logged — `rotateShareToken` emits
 * `epoch_<n>` for exactly this reason — and `lib/log/sanitize.ts` redacts emails
 * only, so nothing downstream catches this.
 */
const REDACTED_TOKEN = "[share-token-redacted]";

/**
 * `/show/<slug>/<token>` in raw or percent-encoded form, anywhere in a string.
 *
 * Keyed on the ROUTE SHAPE, never on what a token looks like: a shape rule fails
 * open the day the token format changes. The slug is kept because it is what makes
 * the row diagnosable; everything after it in that path position is replaced.
 * `%2F` covers the encoded form the sign-in redirect produces.
 */
const SHOW_TOKEN_RE = /(\/|%2F)show(\/|%2F)([^/?#&%\s]+)((?:\/|%2F)[^?#&\s]*)/gi;

/** Total: never throws, returns the input unchanged when there is nothing to scrub. */
export function scrubShareTokens(text: string): string {
  try {
    return text.replace(
      SHOW_TOKEN_RE,
      (_m, a, b, slug) => `${a}show${b}${slug}${b}${REDACTED_TOKEN}`,
    );
  } catch {
    return REDACTED_TOKEN;
  }
}

/**
 * The address-bar case, kept as its own function because it can also drop the
 * query and fragment wholesale rather than scrubbing them — on the crew route
 * itself there is nothing in either worth keeping.
 */
export function redactShareToken(href: string): string {
  try {
    const u = new URL(href);
    const parts = u.pathname.split("/"); // ["", "show", slug, token, ...]
    if (parts[1] === "show" && parts.length > 3) {
      u.pathname = `/show/${parts[2]}/${REDACTED_TOKEN}`;
      u.search = "";
      u.hash = "";
      return u.href;
    }
    return scrubShareTokens(u.href);
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
    // Every string on the wire, not just `url`. A secret does not respect the
    // field you expected it in: a thrown `{ url: location.href }` reaches `detail`,
    // a referrer reaches `message`, a component stack can carry either.
    for (const k of Object.keys(payload)) {
      const v = payload[k];
      if (typeof v === "string") payload[k] = scrubShareTokens(v);
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
