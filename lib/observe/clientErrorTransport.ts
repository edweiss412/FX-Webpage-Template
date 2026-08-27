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
export const CAPS = {
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
/**
 * Shortest token prefix worth scrubbing. A cut leaves a prefix, and a 16-character
 * exact run of a known secret is the secret rather than a coincidence; below that
 * the odds of a false hit on ordinary text stop being negligible.
 */
const TOKEN_PREFIX_FLOOR = 16;

/** The current page's share token, when the page is a crew page. "" otherwise. */
function currentShareToken(): string {
  try {
    if (typeof location === "undefined") return "";
    const parts = location.pathname.split("/"); // ["", "show", slug, token, ...]
    // ONE expression, both conditions. An earlier form guarded the length
    // separately first, which the shape test then made redundant — and a redundant
    // guard is one whose mutants nothing can kill, since no input reaches it that
    // the test below does not already settle. Position AND shape, together.
    const seg = parts[3] ?? "";
    return parts[1] === "show" && SHARE_TOKEN_SHAPE.test(seg) ? seg : "";
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
/**
 * The share token's shape, and the DB is the authority for it:
 * `check (share_token ~ '^[0-9a-f]{64}$')`,
 * supabase/migrations/20260523000002_show_share_tokens.sql:41, generated as
 * `encode(gen_random_bytes(32), 'hex')`.
 *
 * Matching on the shape is a NARROWING of what used to be "any segment in the
 * third position", and it had to be: `/show/<slug>/unpublish` is a real STATIC
 * route (app/show/[slug]/unpublish/page.tsx:7-10), so the loose form redacted the
 * literal word "unpublish" out of every message on that page and rewrote its URL
 * into a crew-token URL that does not exist. That is corruption of ordinary
 * payloads, not a leak — the opposite failure, and the reason the repair
 * direction here is narrowing rather than another pattern.
 */
const SHARE_TOKEN_SHAPE = /^[0-9a-f]{64}$/;
const SHOW_TOKEN_RE = /(\/|%2F)show(\/|%2F)([^/?#&%\s]+)((?:\/|%2F)[0-9a-f]{64})/gi;

/** Total: never throws. Scrubs the known literal everywhere, then the route shape. */
export function scrubShareTokens(text: string): string {
  try {
    let out = text;
    const tok = currentShareToken();
    // `currentShareToken` returns the empty string or a shape-valid token and
    // nothing in between, so this is an emptiness test rather than a length
    // comparison. Written without the numeral for that reason.
    if (tok !== "") {
      // Every occurrence, raw and encoded — a second copy in a query parameter or a
      // fragment is the same literal, which is exactly what the pattern pass missed.
      out = out.split(tok).join(REDACTED_TOKEN);
      // NO ENCODED-FORM PASS. There was one, and it was carried for two rounds as
      // defence in depth with an honest label saying no fixture isolated it. The
      // shape narrowing settles it: every character of a shape-valid token is a hex
      // digit, and `encodeURIComponent` leaves those untouched, so the encoded form
      // IS the raw form and the pass could never fire. A branch that cannot execute
      // is not defence in depth, it is a claim nobody can check.
      // A truncation UPSTREAM of this call can cut the token in half, and half a
      // secret is still a secret. Whatever survives a cut is a PREFIX of the known
      // literal, so the prefixes are what we look for — longest first, still exact
      // matching against a value we hold, with no pattern to widen. The floor
      // keeps a short coincidental run from being mistaken for the secret.
      // EVERY length, not the longest one only. This loop used to stop at the
      // first prefix it found, which is wrong whenever one value carries copies cut
      // at DIFFERENT points — a 48-character prefix in `stack`, a 32-character one
      // in `detail`, a 20-character one in `message`. Diff review R4 reproduced it
      // in all seven caller-controlled fields: the longest went and the shorter
      // copies stayed. Descending order matters, so the longest match wins at each
      // position and a shorter prefix cannot bite a piece out of a longer one.
      for (let n = tok.length - 1; n >= TOKEN_PREFIX_FLOOR; n--) {
        const pre = tok.slice(0, n);
        if (out.includes(pre)) out = out.split(pre).join(REDACTED_TOKEN);
      }
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
    // The SHAPE, matching currentShareToken. Position alone rewrote
    // /show/<slug>/unpublish — a real static route — into a crew-token URL that
    // does not exist, and dropped that page's query string on a claim about a
    // token it never carried (diff review R4 P2).
    if (parts[1] === "show" && SHARE_TOKEN_SHAPE.test(parts[3] ?? "")) {
      u.pathname = `/show/${parts[2]}/${REDACTED_TOKEN}`;
      u.search = "";
      u.hash = "";
      return u.href;
    }
    // Not a crew URL. The query string can still carry a secret, so it is scrubbed
    // rather than dropped — the removal above is a stronger action taken only where
    // the page is known to be token-bearing.
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
    // SCRUB FIRST, THEN CAP. Capping first cut the token into a fragment that
    // neither the exact nor the encoded pass could match — three consecutive
    // review rounds produced a P0 on this axis and this was the third: not a
    // missing spelling, an ORDER OF OPERATIONS. Every field below follows the same
    // order for the same reason.
    const message = scrubShareTokens(input.message).slice(0, CAPS.message);
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
    if (input.stack) payload.stack = scrubShareTokens(input.stack).slice(0, CAPS.stack);
    if (input.componentStack)
      payload.componentStack = scrubShareTokens(input.componentStack).slice(0, CAPS.componentStack);
    if (input.digest) payload.digest = scrubShareTokens(input.digest).slice(0, CAPS.digest);
    if (input.tileId) payload.tileId = scrubShareTokens(input.tileId).slice(0, CAPS.tileId);
    if (input.code) payload.code = scrubShareTokens(input.code).slice(0, CAPS.code);
    if (input.detail) payload.detail = scrubShareTokens(input.detail).slice(0, CAPS.detail);
    if (typeof location !== "undefined") {
      payload.url = redactShareToken(location.href).slice(0, CAPS.url);
    }
    // NO FINAL SWEEP. There was one, re-scrubbing every field after the fact as a
    // backstop against a later edit adding a field without a scrub. `payload` is
    // `Record<string, string>` and every assignment above already scrubs, so the
    // sweep was a no-op on every reachable input — which the mutation score made
    // visible rather than obvious: its `typeof v === "string"` guard survived an
    // equality flip because no payload value has ever been anything else.
    // Untestable dead code is a worse backstop than a test, so the guarantee moved
    // to one: a case in the suite walks `Object.keys` of the POSTed body and
    // asserts no field carries the token, which fails for a field added later
    // without a scrub and does not depend on anyone remembering this comment.
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
