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
 * The crew share token is a SECRET, and scrubbing it by PATTERN does not converge.
 *
 * Two review rounds produced a P0 on this one axis. The first version redacted the
 * pathname of `payload.url`, and missed `/auth/sign-in?next=%2Fshow%2F…` — a route
 * `lib/auth/picker/selectIdentity.ts` generates on every gated crew visit — plus
 * every field that is not `url`. The second matched the route shape anywhere in a
 * string, and missed a second copy of the same token in a query parameter or a
 * fragment. A third would miss the next spelling. That is a recognizer over an open
 * input space, and this repo's round-economy rule says to narrow rather than widen
 * it again.
 *
 * So the PRIMARY mechanism is not a pattern at all: on a crew page the browser
 * already knows the token — it is a path segment of `location` — so the exact
 * literal is scrubbed from every string, in raw and percent-encoded form. Exact
 * replacement over a known value has no grammar to get wrong and nothing left to
 * widen.
 *
 * The route-shape pass is kept only as a BACKSTOP for a crew URL belonging to some
 * OTHER show appearing in free text, where the literal is unknowable. Its residual
 * gap is a documented limit rather than a defect to chase: see the header note on
 * `scrubShareTokens`.
 *
 * AGENTS.md invariant 10: secrets are never logged.
 */
const REDACTED_TOKEN = "[share-token-redacted]";

/** The current page's share token, when the page is a crew page. "" otherwise. */
function currentShareToken(): string {
  try {
    if (typeof location === "undefined") return "";
    const parts = location.pathname.split("/"); // ["", "show", slug, token, ...]
    return parts[1] === "show" && parts.length > 3 ? (parts[3] ?? "") : "";
  } catch {
    return "";
  }
}

/**
 * `/show/<slug>/<token>` in raw or percent-encoded form. BACKSTOP ONLY.
 *
 * DOCUMENTED LIMIT: this catches a token at a path position. A token belonging to a
 * DIFFERENT crew page, copied into free text somewhere that is not a path position
 * — a query parameter of a foreign URL, say — is not matched, because its literal
 * value is unknowable from this page. The exact-literal pass below covers the token
 * of the page the crash actually happened on, which is the one that appears in that
 * page's own URLs and stack frames.
 */
const SHOW_TOKEN_RE = /(\/|%2F)show(\/|%2F)([^/?#&%\s]+)((?:\/|%2F)[^?#&\s]*)/gi;

/** Total: never throws. Scrubs the known literal everywhere, then the route shape. */
export function scrubShareTokens(text: string): string {
  try {
    let out = text;
    const tok = currentShareToken();
    if (tok.length > 0) {
      // Every occurrence, raw and encoded — a second copy in a query parameter or a
      // fragment is the same literal, which is exactly what the pattern pass missed.
      out = out.split(tok).join(REDACTED_TOKEN);
      const enc = encodeURIComponent(tok);
      if (enc !== tok) out = out.split(enc).join(REDACTED_TOKEN);
    }
    return out.replace(
      SHOW_TOKEN_RE,
      (_m, a, b, slug) => `${a}show${b}${slug}${b}${REDACTED_TOKEN}`,
    );
  } catch {
    return REDACTED_TOKEN;
  }
}

/**
 * The address-bar case. Drops query and fragment wholesale on the crew route —
 * on that route there is nothing in either worth keeping — then scrubs whatever
 * remains.
 */
export function redactShareToken(href: string): string {
  try {
    const u = new URL(href);
    const parts = u.pathname.split("/");
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
