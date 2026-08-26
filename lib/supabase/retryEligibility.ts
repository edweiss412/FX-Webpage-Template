/**
 * lib/supabase/retryEligibility.ts
 *
 * Decides whether a Supabase request may be RETRIED. Nothing here performs a retry; this
 * module is the predicate alone, in its own file, for two reasons that both matter:
 *
 *   1. Its defect class is silent-wrong. A predicate that wrongly returns true retries a
 *      request that may have already committed a write, and nothing errors.
 *   2. The source-mutation runner overlays a target only when a Vitest suite imports it, so
 *      the predicate is importable rather than inlined in the fetch wrapper.
 *
 * not-subject-to-meta: this is transport-shaped policy, not an auth helper that gates a trust
 * decision, so it takes no row in tests/auth/_metaInfraContract.test.ts (invariant 9).
 */

/**
 * RPCs that may be retried, because the database can prove they cannot have written.
 *
 * Membership is guarded in BOTH directions by
 * tests/supabase/_metaRetryableRpcVolatility.test.ts: every name here must be non-VOLATILE in
 * the live catalog AND must complete inside a READ ONLY transaction. Volatility alone is
 * necessary and NOT sufficient — a STABLE function can still write through a VOLATILE callee,
 * which is why the second arm exists (spec §4.2).
 */
export const RETRYABLE_RPCS: ReadonlySet<string> = new Set([
  "admin_alert_summary",
  "admin_event_stats_24h",
  "admin_read_share_token",
  "auth_email_canonical",
  "get_admin_show_review_snapshot",
  "is_admin",
  "is_developer",
  "is_session_live",
  "my_share_tokens_for_email",
  "readfinalizeowned_b2",
  "resolve_show_by_slug_and_token",
  "roster_shift_counts",
  "viewer_version_token",
]);

/**
 * PostgREST serves RPCs under this exact prefix. The `/rpc/` segment is LOAD-BEARING: a table
 * insert is `POST /rest/v1/<table>`, the same method as an RPC and one segment shallower, so a
 * rule keyed on the trailing path segment would retry a write into any table sharing a name
 * with a retryable function.
 */
/**
 * The PostgREST RPC path, located ANYWHERE in the URL's path rather than anchored at its root.
 *
 * Anchoring at `^` was wrong and round-4 review probed it with a real client: a Supabase base URL
 * carrying a path, `http://host/proxy/`, produces `/proxy/rest/v1/rpc/is_admin`, which the anchored
 * form rejected. The consequences ran in BOTH directions — a prefixed retryable RPC POST was passed
 * through unretried (the arc's own fault, unabsorbed: `calls=1 emits=0 status=502`), while a
 * prefixed PostgREST GET was treated as ours and multiplied with PostgREST's loop (`calls=12`).
 *
 * The leading slash is load-bearing: `/myrest/v1/rpc/x` must NOT match, and it does not, because
 * the character before `rest` is `y` rather than `/`.
 */
/**
 * The PostgREST mount path for a given Supabase base URL, "" when it sits at the root.
 *
 * Ownership is decided against THIS, never against a pattern that scans the path. Round 3 widened
 * the match to "anywhere preceded by a slash" so a proxied deployment would be recognised, and
 * round 4 showed what that costs: a Storage object may legitimately be NAMED
 * `rest/v1/rpc/is_admin`, so `POST /storage/v1/object/bucket/rest/v1/rpc/is_admin` matched, the
 * wrapper claimed a WRITE, and a lost response produced a second delivery — probed at two calls
 * for Storage upload/update/uploadToSignedUrl and Functions invoke. A recognizer that guesses from
 * path shape cannot tell a mount point from a file name; the client's own base URL can, and it is
 * known where the wrapper is constructed.
 */
export function basePathOf(baseUrl: string | undefined): string {
  // One condition, not two. The original read `baseUrl === undefined || baseUrl === ""`, and the
  // gate showed the `||` flipping to `&&` with nothing observable changing: `new URL("")` throws
  // and the catch already answers "" for it, so the empty-string half was dead. The undefined half
  // is NOT dead — it narrows the type for `new URL` — so it stays, now as the only test here, and
  // flipping its `===` reds the base-path case rather than surviving.
  if (baseUrl === undefined) return "";
  try {
    const p = new URL(baseUrl).pathname.replace(/\/+$/, "");
    return p === "/" ? "" : p;
  } catch {
    return "";
  }
}

/** `<basePath>/rest/v1/rpc/<fn>` → `<fn>`. Exact prefix, single segment, else undefined. */
export function rpcFunctionName(path: string, basePath = ""): string | undefined {
  const prefix = `${basePath}/rest/v1/rpc/`;
  if (!path.startsWith(prefix)) return undefined;
  const rest = path.slice(prefix.length);
  return rest.length > 0 && !rest.includes("/") ? rest : undefined;
}

/** The PostgREST mount point, located the same way and for the same reason. */
const POSTGREST_PREFIX = "/rest/v1/";

/** Methods that are idempotent by HTTP contract, so a non-RPC request under one is a read. */
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD"]);

/**
 * True when this request may be retried.
 *
 * An RPC takes its answer from RETRYABLE_RPCS regardless of METHOD, because PostgREST serves
 * `GET /rest/v1/rpc/<fn>` for non-volatile functions and HTTP idempotency is a claim about the
 * method rather than about what the function can do (spec §4.2).
 *
 * The method rule applies ONLY under this client's PostgREST mount. Spec §4's "non-RPC GET is
 * retry-eligible by method" is written throughout over PostgREST traffic — its worked example is
 * `GET /rest/v1/shows` and its eligibility table lists only `/rest/v1/` requests. But this wrapper
 * is installed as the WHOLE client's fetch, so it also sees Auth, Storage and Functions, which that
 * rule never contemplated. Auth's `reauthenticate()` is the proof: a GET that SENDS a nonce, so a
 * retry delivers a second one and hands the caller success where a bare client surfaced the 502
 * (probed at calls=2). Restricting the method rule to the mount implements what §4 says rather than
 * changing it, and it settles the whole class — Auth, Storage and Functions at once — instead of
 * excluding one function name and waiting for the next.
 *
 * DOCUMENTED LIMIT: a 502 on a non-PostgREST idempotent request is not absorbed. Nothing absorbed
 * it before this arc either, so the behaviour is unchanged rather than lost.
 */
/**
 * How many path segments a record may carry when the target is not an RPC.
 *
 * THREE, derived rather than chosen: it is the smallest bound that keeps `/rest/v1/<table>`
 * intact. A record that cannot say WHICH table faulted is not worth writing, and every shape past
 * the third segment is an identifier rather than a name.
 */
const MAX_TARGET_SEGMENTS = 3;

/**
 * The name a transport emit may record for a request. `<base>/rest/v1/rpc/<fn>` becomes `<fn>`;
 * anything else becomes a BOUNDED prefix of its path.
 *
 * It lives here, beside `rpcFunctionName` and `basePathOf`, because it is built from both and
 * because ONE describer is the point. Two emits name a target -- the retry wrapper's `RetryEmit`
 * and the observer's `TransportObservation` -- and both reach a log sink, the retry wrapper's
 * through `log.warn`, which PERSISTS. Each had its own copy returning the whole pathname on the
 * non-RPC branch.
 *
 * Round-1 review probed the consequence against ordinary service-role Storage traffic, not a
 * constructed URL: `/storage/v1/object/diagram-snapshots/show_123/rev_7/private-diagram.png`
 * carries a show id, a revision and a private object key, and dropping the query string leaves
 * every one of them. The retry wrapper's own copy was bounded only by what `isRetryEligible`
 * happens to admit today, which is a coincidence rather than a guarantee: widen eligibility and
 * the leak appears with nothing to notice it. Sharing the describer makes the bound a property of
 * the EMIT instead.
 *
 * The query string is dropped on every branch, including the unparseable one, which answers a
 * constant carrying no request data at all.
 */
export function describeTransportTarget(url: string, basePath = ""): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return "unparseable-url";
  }

  const fn = rpcFunctionName(path, basePath);
  if (fn !== undefined) return fn;

  // The mount prefix is stripped BEFORE counting, or a proxied deployment spends its whole budget
  // on its own prefix and every record truncates to the mount.
  const mounted = basePath !== "" && path.startsWith(basePath) ? path.slice(basePath.length) : path;
  const segments = mounted.split("/").filter((seg) => seg.length > 0);
  if (segments.length <= MAX_TARGET_SEGMENTS) return `/${segments.join("/")}`;
  return `/${segments.slice(0, MAX_TARGET_SEGMENTS).join("/")}/…`;
}

export function isRetryEligible(
  url: string,
  method: string | undefined,
  basePath = "",
  schema?: string,
): boolean {
  // RETRYABLE_RPCS is a statement about functions in `public`, because that is the only schema the
  // volatility scan reads. A request naming any other schema targets a DIFFERENT function that
  // happens to share a name, so its safety is unverified and we decline rather than inherit.
  if (schema !== undefined && schema !== "public") return false;

  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    // An unparseable URL is not something to reason about; refuse rather than guess.
    return false;
  }

  const fn = rpcFunctionName(path, basePath);
  if (fn !== undefined) return RETRYABLE_RPCS.has(fn);

  // Outside the mount we own nothing, whatever the method.
  if (!path.startsWith(`${basePath}${POSTGREST_PREFIX}`)) return false;

  return IDEMPOTENT_METHODS.has((method ?? "GET").toUpperCase());
}

/**
 * PostgREST's OWN retry contract, mirrored so this wrapper can decline what that layer owns.
 *
 * `@supabase/postgrest-js` enables retries BY DEFAULT (`PostgrestBuilder.ts` — `retryEnabled = true`)
 * and there is no client-level switch: `.retry(false)` is a per-QUERY builder method, so disabling it
 * at every call site would silently regress the moment someone adds one.
 *
 * Round-2 diff review measured the consequence. Two retrying layers MULTIPLY: PostgREST's four
 * attempts each invoke this wrapper's three, so a 503 on a GET became TWELVE transport calls against
 * a ratified budget of three, and only eight of the eleven transitions emitted a record, because
 * PostgREST's own retries never reach `onRetry`.
 *
 * The repair is NARROWING, which is the direction this project's convergence rule prescribes: the
 * wrapper declines exactly the cases PostgREST already retries, so every (method, failure) pair has
 * exactly ONE retrying layer. That is the same single-holder reasoning invariant 2 applies to
 * advisory locks — nested holders do not add safety, they multiply.
 *
 * The arc's own fault is untouched: PostgREST does not retry 502, so an upstream gateway 502 is still
 * absorbed here, which is the whole point of the wrapper.
 *
 * These MIRROR `node_modules/@supabase/postgrest-js/src/types/common/common.ts` and are not importable
 * from the package entrypoint. `tests/supabase/postgrestRetryContract.test.ts` reads the installed
 * source and fails if a version bump moves either set, so the mirror cannot drift silently.
 */
export const POSTGREST_RETRYABLE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);
export const POSTGREST_RETRYABLE_STATUSES: ReadonlySet<number> = new Set([520, 503]);

/**
 * Whether PostgREST's OWN retry loop will handle this REQUEST.
 *
 * Keyed on the request, not on an outcome, and that is the whole point. Round-2 review found two
 * layers multiplying and this declined per (method, status) pair — which round 3 then showed does
 * not bound anything, because a REQUEST is a SEQUENCE of outcomes. A 502 we retried followed by a
 * 503 we declined composed both loops right back to twelve calls, and the caller's final error
 * stopped matching what an unwrapped call would have produced.
 *
 * Deciding once, before the first attempt, makes the layers exclusive by construction: either this
 * wrapper owns every failure of the request or it touches none of them.
 *
 * The path test is load-bearing and its absence was a real defect. This wrapper is installed as the
 * WHOLE CLIENT's fetch, so it also sees Auth traffic — and PostgREST's retry loop lives in
 * PostgrestBuilder, which only ever runs for `/rest/v1/` requests. Declining an Auth GET handed it
 * to a layer that is not in its call chain at all, so the request simply died: measured at
 * `calls=1 emits=0` on `auth.getUser()` for 503, 520 and a network rejection.
 */
export function postgrestWillRetry(
  url: string,
  method: string | undefined,
  basePath = "",
): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    // Unparseable: assume PostgREST is NOT involved, so we keep ownership rather than orphaning.
    return false;
  }
  // Exact prefix against the client's OWN mount, for the same reason `rpcFunctionName` is: a
  // Storage or Functions URL can contain `/rest/v1/` in a caller-chosen object name, and an
  // `includes` test read those as PostgREST. Under a base path both this and the mount move
  // together, so prefixed PostgREST reads are still recognised.
  if (!path.startsWith(`${basePath}${POSTGREST_PREFIX}`)) return false;
  return POSTGREST_RETRYABLE_METHODS.has((method ?? "GET").toUpperCase());
}
