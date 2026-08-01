# Drive-timeout cluster — bound the app/api Drive calls and the GoogleAuth token fetch

**Date:** 2026-07-31 · **Branch:** `fix/drive-api-call-timeouts` · **Mode:** autonomous ship (consent via `/ship-feature`) · **Revision:** R2 (post adversarial round 1 — all six findings addressed; probe transcripts inline)

**Closes:** `BL-DRIVE-API-CALLS-UNBOUNDED-APP-ROUTES`, `BL-DRIVE-CREDENTIAL-FETCH-UNBOUNDED`, and — because the credential fetch was its only remaining residual — `BL-WATCH-DRIVE-CALL-TIMEOUT` (narrowed 2026-07-26 by the watch-renewal-lifecycle PR; see `docs/superpowers/specs/observability/2026-07-26-watch-renewal-lifecycle-design.md` §3.3.1a).

---

## 1. Problem, verified against the live tree

Two related unbounded-stall classes survive after the watch-renewal-lifecycle PR bounded everything under `lib/`, plus one probe-surfaced misclassification.

### 1.1 Eight Drive/Sheets calls under `app/api/` carry no bound

Sweep procedure (per the BACKLOG.md method note): judge each call by its SECOND argument, via `grep -rnE '\.(files|channels|revisions|spreadsheets)\.[a-zA-Z]+\(' lib/ app/ --include='*.ts'`. Re-run 2026-07-31 on `origin/main` (ce9dc1e21): every `lib/` site is bounded (`{timeout, retry: false}`, a `signal`, or the export-path stall guard); exactly eight `app/api/` sites are not.

| # | Site | Call shape | Class |
|---|------|-----------|-------|
| S1 | `app/api/asset/agenda/[show]/[id]/route.ts:320` | `drive.files.get({fields})`, no 2nd arg | metadata |
| S2 | `app/api/asset/agenda/[show]/[id]/route.ts:481` | `drive.files.get({fields})`, no 2nd arg | metadata |
| S3 | `app/api/asset/agenda/[show]/[id]/route.ts:524` | `drive.files.get({alt:"media"}, {responseType:"stream", headers?})` — no timeout/signal | stream |
| S4 | `app/api/asset/reel/[show]/route.ts:397` | `drive.files.get({fields})`, no 2nd arg | metadata |
| S5 | `app/api/asset/reel/[show]/route.ts:527` | `drive.files.get({fields})`, no 2nd arg | metadata |
| S6 | `app/api/asset/reel/[show]/route.ts:568` | `drive.revisions.get({alt:"media"}, {responseType:"stream", headers?})` — no timeout/signal | stream |
| S7 | `app/api/asset/reel/[show]/route.ts:661` | `drive.files.get({alt:"media"}, {responseType:"stream"})` (md5 fallback) — no timeout/signal | stream |
| S8 | `app/api/admin/onboarding/scan/route.ts:109` | `drive.files.get({fields})` in `defaultVerifyFolder`, no 2nd arg | metadata |

`getDriveClient()` builds the client with no default timeout (`lib/drive/client.ts:35-39`; gaxios default is unbounded), so each of these can hold its route handler for as long as the platform allows. The onboarding-scan hang that motivated `DRIVE_EXPORT_TIMEOUT_MS` (doc comment in `lib/drive/fetch.ts`: a silent socket stall that never throws, so no retry layer can help) is the observed production shape of this class.

A ninth match in the sweep output — `lib/drive/stallGuard.ts:14` — is a doc comment, not a call.

### 1.2 The GoogleAuth token fetch is unbounded, on every Drive caller — and the naive fix is wrong

`getDriveAuth()` constructs `new google.auth.GoogleAuth({credentials, scopes})` with no transport options (`lib/drive/client.ts:41-46`). The token request that precedes every Drive API call runs on the auth client's own transporter. Verified against the installed `google-auth-library@10.6.2` (vendored paths under node_modules/.pnpm, deliberately not backtick-cited so spec:lint does not resolve them against the repo tree; re-verify on any major bump):

- AuthClient constructor: this.transporter = opts.transporter ?? new Gaxios(opts.transporterOptions) — build/src/auth/authclient.js line 68; clientOptions.transporter accepts a Gaxios instance (authclient.d.ts line 81).
- The JWT access-token path threads that transporter into the token POST: createGToken() passes transporter: this.transporter (jwtclient.js lines 204-214), and gtoken uses it for the token request (gtoken/googleToken.js lines 36-37). gtoken hardcodes the endpoint: GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token' (gtoken/getToken.js line 19); the credentials' token_uri is ignored on this path.
- GoogleAuth forwards clientOptions to the constructed auth client (googleauth.d.ts line 134).

**Adversarial R1 finding 1 (confirmed, load-bearing):** the SAME transporter also carries every authenticated API request — googleapis-common routes non-http2 calls through `authClient.request(options)` (vendored googleapis-common build/src/apirequest.js, `const res = await authClient.request(options)` in the else-branch near line 308), and OAuth2Client.request sends through this.transporter. So a flat `transporterOptions: { timeout }` would become the DEFAULT timeout for every Drive/Sheets request — aborting healthy stream BODIES (S3/S6/S7 and the existing `lib/` streams) at the token budget. An earlier draft of this spec proposed exactly that; it is withdrawn. The fix must be scoped to the token URL (§3.3).

So a hung `oauth2.googleapis.com` (or any DNS/socket stall on the token path) stalls every caller of `getDriveClient()` / `getDriveAccessToken()` indefinitely — including the watch renewal loop that the watch-renewal-lifecycle PR otherwise bounded (its §3.3.1a documents exactly this reproduction and files it here). Note the per-call bounds of §3.1/§3.2 do NOT cover this phase: the token fetch happens inside `authClient.request` BEFORE the API request options apply.

### 1.3 The shipped gaxios-timeout classification never fires (probe, 2026-07-31)

`lib/drive/fetch.ts:190` maps `code === "TimeoutError" | "ETIMEDOUT" | "ECONNABORTED"` to a transient 504 (so `withDriveRetry` retries a stalled `files.get`). Live probe against the installed gaxios@7.1.4 — stalled local `http.Server`, `new Gaxios().request({url, method: "POST", timeout: 300, retry: false})`:

```json
{"ctor":"GaxiosError","name":"Error","causeCtor":"AbortError","causeName":"AbortError","msg":"The operation was aborted."}
```

`code` is ABSENT; the timeout signature lives on `cause.name === "AbortError"` (gaxios in a window-less Node runtime uses its node-fetch adapter — adversarial R1 finding 3's probe, `gaxios/build/... gaxios.js` lines 520-525 — and node-fetch converts signal expiry to its own AbortError). Consequence: the shipped 504 mapping is dead code on the per-call-timeout path; a real timeout today surfaces as an unclassified `GaxiosError` (bounded, but not retried and not 504-typed). This diff corrects the classifier (§3.5) because both S8's error mapping and the D1 bounds depend on timeout classification being real.

### 1.4 No structural guard pins the class

The `lib/` sites were bounded one incident at a time. Nothing fails a NEW unbounded call site by default — which is how eight accumulated under `app/api/` while `lib/` was being swept. Per the class-sweep discipline (AGENTS.md, "Class-sweep before patching"), this diff ships the structural guard with the fix (§3.4).

---

## 2. Resolved scope — do not relitigate

Ratified autonomously under the `/ship-feature` consent; alternatives recorded so review challenges the choice, not the inventory. Reviewers: verify these against their citations rather than re-deriving them; a challenge needs new evidence (a probe, a live-code contradiction), not a preference.

| # | Decision | Choice |
|---|----------|--------|
| D1 | Metadata sites S1, S2, S4, S5, S8 | Per-call `{ timeout: DRIVE_FILES_GET_TIMEOUT_MS, retry: false }` (8s; symbol exported from `lib/drive/fetch.ts`). NO `withDriveRetry` wrapper: these are request-scoped user/admin-facing reads where fail-fast beats a 3-attempt ≈34s worst case; the sync-path sites that DO wrap (`lib/sync/verifyReelOnApply.ts:84-90`) hold an advisory lock and own their retry budget — a different context. `retry: false` matches the repo-wide idiom (single retry layer; here that layer is "none"). |
| D2 | Stream sites S3, S6, S7 | Bound the AWAIT (connection + headers/first byte), not the body: `createStallGuard(DRIVE_ASSET_STALL_TIMEOUT_MS)` (`lib/drive/stallGuard.ts:32`, 30s), pass `signal: guard.signal` in the options arg, `guard.clear()` immediately after the await resolves (and in the catch). A gaxios `timeout` is wrong here: the timeout signal keeps ticking after headers and would abort a healthy long body transfer mid-stream. The defect on record is the stalled AWAIT holding the route handler; that is what gets bounded. |
| D3 | Mid-body transfer bound for S3/S6/S7 | NOT bounded by this diff — documented limit (§6). Byte caps (`ByteLimitExceededError` transforms) bound volume, client disconnect cancels the pull, the platform route budget bounds worst-case wall clock. An idle guard wired to chunk progress would false-abort on CLIENT backpressure (a paused `<video>` stops the pull), which is routine, not a fault. |
| D4 | Credential fetch | A URL-SCOPED transporter, not a flat transport default (R1 finding 1). `getDriveAuth()` passes `clientOptions: { transporter: new TokenBoundGaxios(...) }` where `TokenBoundGaxios extends Gaxios` overrides `request()` to inject `timeout: GOOGLE_AUTH_TOKEN_TIMEOUT_MS` ONLY when the request URL's host is the token host (`oauth2.googleapis.com`) and the caller set no timeout of its own; every other request passes through untouched. This requires `gaxios` as a DIRECT dependency (pinned `^7.1.4`, the exact version already in the tree transitively via googleapis — no version fork in pnpm). New constant `GOOGLE_AUTH_TOKEN_TIMEOUT_MS = 10_000` in `lib/drive/client.ts`. API-call behavior is provably unchanged: the override injects nothing for non-token hosts (§4 T6 pins both directions). |
| D5 | Timeout error surfacing — agenda/reel | No new codes. A fired guard/timeout rejects the await; the routes' existing catch tails already map unrecognized errors to `infraError("AGENDA_ASSET_LOOKUP_FAILED")` (`app/api/asset/agenda/[show]/[id]/route.ts:636`) / `infraError("REEL_ASSET_LOOKUP_FAILED")` (`app/api/asset/reel/[show]/route.ts:741-754` and the per-branch catches at `app/api/asset/reel/[show]/route.ts:365-378`, `app/api/asset/reel/[show]/route.ts:403-409`, `app/api/asset/reel/[show]/route.ts:490-500`). The status-classification helpers (`isNotFoundOrGone`, `isPermissionDenied`, `isRangeNotSatisfiable`) match on numeric status and cannot misclassify a status-less timeout. No §12.4 lockstep is triggered. |
| D6 | Timeout error surfacing — scan | `defaultVerifyFolder`'s catch tail today maps any status-less error to `{status: 400, code: "OPERATOR_ERROR_INCOMPLETE_FOLDER_METADATA"}` (`app/api/admin/onboarding/scan/route.ts:127`) — with a timeout added, a Drive stall would be reported as the OPERATOR's mistake. Add a timeout branch ahead of it keyed on the PROBED shape via the new shared classifier `isDriveTimeoutShape` (§3.5) — NOT on `err.name === "TimeoutError"`, which the §1.3 probe refutes (R1 finding 2) — mapping to `{status: 504, code: "ONBOARDING_SCAN_FAILED"}`. `ONBOARDING_SCAN_FAILED` is an existing catalog row (`lib/messages/catalog.ts:2160`); no new codes, no lockstep. `FolderVerificationResult`'s failure branch currently types `status` as `400 | 403 | 404` and its code union excludes `ONBOARDING_SCAN_FAILED` (`app/api/admin/onboarding/scan/route.ts:28-39`) — the type widens as part of this change (R1 finding 5); its only consumers are this route file and its tests. |
| D7 | Structural guard | New meta-test at tests/drive/_metaDriveCallBounds.test.ts (NEW file, hence not backtick-cited): TypeScript-AST walk (compiler API, no new dependency) over non-test `.ts` under `lib/` and `app/`. Match rule REVISED per R1 finding 4: a call expression matches when its callee property chain contains one of the namespace segments `files` / `channels` / `revisions` / `spreadsheets` / `values` in NON-terminal position — with NO terminal-method allowlist (the installed clients expose `getByDataFilter`, `download`, `values.append`, `batchUpdate`, etc.; an allowlist is an open set and loses). False-positive control is a terminal-method BLOCKLIST of JS collection methods that are not API verbs (`map`, `filter`, `forEach`, `some`, `every`, `find`, `findIndex`, `includes`, `join`, `slice`, `splice`, `reduce`, `flat`, `flatMap`, `indexOf`, `keys`, `entries`, `sort`, `concat`, `push`, `pop`, `shift`, `unshift`) — blocklisting is fail-closed (a blocked name can never hide an API verb because no generated Drive/Sheets method carries those names). Bound rule REVISED: the options argument must contain a `timeout` property (any value), OR a `signal` property whose value expression contains neither `?` nor the token `undefined` (rejecting the `{signal: opts?.signal}` conditional-bound escape from R1 finding 4). Escape hatch: inline `// drive-call-bound: <where>` comment naming the layer that bounds it. No registry file — a new site fails by default. Honest ceiling stated in the module header: a drive client reached through an untyped alias that renames the namespace escapes; the guard proves "no known-shape unbounded call", not impossibility (same posture as `BL-SOUND-REDIRECT-GUARD`). |
| D8 | One branch, one PR | The cluster coheres (one defect class, one guard); commit-per-task per invariant 6. |
| D9 | BACKLOG.md dispositions in the same PR | Close `BL-DRIVE-API-CALLS-UNBOUNDED-APP-ROUTES` and `BL-DRIVE-CREDENTIAL-FETCH-UNBOUNDED` (move to `BACKLOG-archive.md` per the graduation convention); update `BL-WATCH-DRIVE-CALL-TIMEOUT` to CLOSED with a pointer here. |
| D10 | Classifier correction scope | §1.3's dead-code 504 mapping in `lib/drive/fetch.ts` is fixed IN THIS DIFF (shared cause-chain classifier, §3.5) because S8's mapping and the D1 bounds' retry semantics both depend on it. NOT in scope: any broader retry-policy change; `withDriveRetry` call sites and budgets are untouched. |

### 2.1 Guard mutation-family closure (per docs/agents/writing-plans.md, round-economy rule)

The D7 guard's mutation-operator families, enumerated as the closure set the review converges against:

- **MF1** — call with no options argument at all.
- **MF2** — options argument lacking both `timeout` and `signal`.
- **MF3** — conditional/optional bound: `{signal: x?.signal}`, ternaries, `?? undefined` (closed by the no-`?`/no-`undefined` value rule).
- **MF4** — any namespace verb outside a fixed method list, e.g. `getByDataFilter`, `download`, `values.append` (closed by dropping the terminal allowlist).
- **MF5** — aliased/renamed client indirection (helper-returned client, re-export, dynamic dispatch): DOCUMENTED CEILING, deliberately outside the closure set (BL-SOUND-REDIRECT-GUARD posture; type-aware resolution is that entry's follow-up).

A reviewer-proposed NEW family is admissible only with a live escaping mutant demonstrated against the shipped guard, not hypothesized.

---

## 3. Design

### 3.1 Metadata sites (S1, S2, S4, S5, S8)

Mechanical: add the second argument `{ timeout: DRIVE_FILES_GET_TIMEOUT_MS, retry: false }`, importing `DRIVE_FILES_GET_TIMEOUT_MS` from `@/lib/drive/fetch`. The agenda and reel routes call through locally-declared structural client types (`DriveClient` / `ReelDriveClient` interfaces defined in the route files); those declarations gain the optional options parameter matching the shape now passed (the runtime object is the real `drive_v3.Drive`, which accepts `MethodOptions`).

Failure behavior: a stall now rejects at 8s with the §1.3 probed shape (status-less `GaxiosError`, cause `AbortError`), which each existing catch maps as:

- S1/S2 → outer catch → `infraError("AGENDA_ASSET_LOOKUP_FAILED")`.
- S4 → `infraError("REEL_ASSET_LOOKUP_FAILED")` via the enclosing catch (`app/api/asset/reel/[show]/route.ts:403-409`).
- S5 → outer catch → `infraError("REEL_ASSET_LOOKUP_FAILED")`.
- S8 → new `isDriveTimeoutShape` branch in `defaultVerifyFolder` → `{status: 504, code: "ONBOARDING_SCAN_FAILED"}` (D6); the existing 403/404 branches are unaffected (a timeout carries no numeric status).

### 3.2 Stream sites (S3, S6, S7)

Per site:

```ts
const guard = createStallGuard(DRIVE_ASSET_STALL_TIMEOUT_MS);
try {
  const res = await drive.files.get(params, { responseType: "stream", signal: guard.signal });
  guard.clear();
  // ... existing stream handoff unchanged
} catch (err) {
  guard.clear();
  throw err; // existing per-route mappings run in the enclosing catch
}
```

- `clear()` after the await disarms the guard before the body streams — the bound covers connect + headers only (D2/D3). `clear()` in the catch prevents an armed-but-orphaned timer (`unref`'d regardless, `lib/drive/stallGuard.ts:42`).
- No `reset()` wiring: with no resets, `createStallGuard` degenerates to a single total budget on the await — exactly the intended semantics; one abort-guard implementation instead of two.
- S7 (inside S6's fallback catch) arms its OWN guard; the two never overlap because S7 starts only after S6's catch ran `clear()`.
- The routes' structural client option types gain `signal?: AbortSignal`.

### 3.3 Credential fetch — URL-scoped transporter

`lib/drive/client.ts`:

```ts
import { Gaxios } from "gaxios"; // direct dep, ^7.1.4 (same version as googleapis' transitive)

/** Bounds ONLY the service-account token POST; every other request passes through untouched. */
export const GOOGLE_AUTH_TOKEN_TIMEOUT_MS = 10_000;
const GOOGLE_TOKEN_HOST = "oauth2.googleapis.com";

export class TokenBoundGaxios extends Gaxios {
  constructor(
    private readonly tokenTimeoutMs: number,
    private readonly tokenHost: string = GOOGLE_TOKEN_HOST, // test seam (T6): a local stalled server
  ) { super(); }
  // override request(): if URL host === tokenHost AND the caller set no timeout,
  // re-issue with { timeout: this.tokenTimeoutMs }; else pass through unchanged.
}

export function getDriveAuth(): InstanceType<typeof google.auth.GoogleAuth> {
  return new google.auth.GoogleAuth({
    credentials: readServiceAccountCredentials(),
    scopes: GOOGLE_DRIVE_SCOPES,
    clientOptions: { transporter: new TokenBoundGaxios(GOOGLE_AUTH_TOKEN_TIMEOUT_MS) },
  });
}
```

Why this shape (R1 finding 1): the auth client's transporter carries BOTH the token POST (gtoken, §1.2) and every authenticated API request (googleapis-common → `authClient.request`). A flat default timeout would bound stream bodies; the URL-scoped override bounds exactly the token POST. Per-call `MethodOptions` from §3.1/§3.2 are unaffected either way — request-level options win over anything the transporter injects, and the override injects nothing for non-token hosts.

On timeout the token request rejects with the §1.3 shape; the awaiting Drive call rejects with it; every caller's existing infra-fault path handles it — the same paths that today handle a `DriveConfigError`. No caller changes.

### 3.4 Structural guard

tests/drive/_metaDriveCallBounds.test.ts (NEW) per D7 + §2.1. The checker is exported as a pure function over source text so negative controls exercise the real implementation. Negative controls (each a test case): (a) bare `drive.files.get({fields})` — FAIL; (b) bounded call with options on a later line — PASS; (c) `formData.files.map(...)` lookalike — no match (blocklist); (d) `{signal: opts?.signal}` — FAIL (MF3, R1 probe); (e) `sheets.spreadsheets.getByDataFilter({...})` unbounded — FAIL (MF4, R1 probe); (f) `// drive-call-bound:` exempted site — PASS.

Expected exemption inventory at ship time: zero comments — every live site after this diff carries a literal `timeout`/`signal` in its options argument.

### 3.5 Timeout-shape classifier correction

New export in `lib/drive/errorStatus.ts` (module keeps its no-imports contract):

```ts
/** True iff the error (or its bounded .cause chain, depth ≤ 4, cycle-guarded) carries a
 *  timeout/abort signature: name or code in {"TimeoutError","AbortError","ETIMEDOUT","ECONNABORTED"}. */
export function isDriveTimeoutShape(error: unknown): boolean { ... }
```

`lib/drive/fetch.ts`'s transient-mapping branch (`lib/drive/fetch.ts:190`) delegates to it — replacing the `code === "TimeoutError"` check the §1.3 probe shows never fires — so a per-call timeout maps to the transient 504 `withDriveRetry` already expects. The existing `.cause`-walk precedent for undici codes (`lib/drive/fetch.ts:206-222` region) stays; the classifier reuses its bounded-walk discipline. S8 (D6) imports the same classifier. Conflation risk (a client-initiated AbortError reading as timeout) is nil at the call sites in scope: none passes its own signal on the classified paths — the scan route passes none, and `withDriveRetry`-wrapped metadata calls pass only `{timeout, retry}`.

---

## 4. Test plan

TDD per task; each test states the failure mode it catches. Honest failing-first inventory (R1 finding 6): for T1/T3 the behavioral rejection tests are REGRESSION PINS (the routes' catch tails already map status-less rejections to infra codes pre-patch — `app/api/asset/agenda/[show]/[id]/route.ts:623-636`, `app/api/asset/reel/[show]/route.ts:741-758`); the failing-first element on those tasks is the options-argument assertion. T2/T4's stall test, T5's 504 mapping, T6, T7, and T8 fail against the unpatched tree outright.

| Task | Test | Failure mode caught |
|------|------|---------------------|
| T1 agenda metadata (S1, S2) | Extend `tests/api/agenda-asset-route.test.ts`: drive stub records the options arg; assert `{timeout: DRIVE_FILES_GET_TIMEOUT_MS, retry: false}` on both metadata gets (failing-first). Regression pin: stub rejects a probed-shape error (GaxiosError-like, cause AbortError, no status) → existing infra-error JSON (status + `code`), NOT `gone()`. | Bound dropped in a refactor; timeout misclassified as 404/410 (cache-poisoning a healthy asset as gone). |
| T2 agenda stream (S3) | Stub captures options: assert an `AbortSignal` present (failing-first). Behavior: stub settles only on `signal` abort, then rejects with an AbortError-caused error → infra-error JSON; pre-patch this test times out (no signal ever passed). Timer hygiene: `vi.getTimerCount()` delta 0 across a successful handler run. | Signal not wired (await unbounded); guard timer leak per request. |
| T3 reel metadata (S4, S5) | Same shape as T1 in `tests/api/reel-asset-route.test.ts`. | Same as T1. |
| T4 reel streams (S6, S7) | Same shape as T2, plus: S6 rejects with a revision-fallback-eligible error → S7's call ALSO carries a signal (fallback not exempt). | Fallback path left unbounded — "sweep missed the second site in the same function". |
| T5 scan (S8) | Extend the onboarding scan route tests: options-arg assertion (failing-first); PROBED-shape rejection (GaxiosError-like with cause AbortError — NOT a bare `{name:"TimeoutError"}`, R1 finding 2) → 504 + `ONBOARDING_SCAN_FAILED`; a plain status-less error still → 400 `OPERATOR_ERROR_INCOMPLETE_FOLDER_METADATA` (regression pin). | Timeout blamed on the operator; existing mapping broken by the new branch; classifier keyed on a shape production never produces. |
| T6 credential | New test file tests/drive/clientAuthTimeout.test.ts (NEW). Global-fetch stubbing does NOT intercept gaxios in the node test env (R1 finding 3's probe: gaxios loads node-fetch directly when no `window`), so the proof targets the transporter itself over a REAL socket: (1) live-stall — `new TokenBoundGaxios(250, "127.0.0.1:<port>")` against a local `http.Server` that accepts and never responds → `request({url})` rejects with the §1.3 timeout shape within a 5s test budget (real gaxios, real node-fetch, real socket; nothing of the stack mocked); (2) scope — a request to a NON-token host through the same transporter gets NO injected timeout (inspect via a captured-options subclass seam or a second local server that responds slowly-but-under-budget); (3) wiring — `getDriveAuth()`'s constructed client options carry a `TokenBoundGaxios` whose budget is `GOOGLE_AUTH_TOKEN_TIMEOUT_MS`. The gtoken threading (transporter → token POST) is vendored-verified in §1.2, cited not integration-tested: the endpoint is hardcoded upstream and cannot be redirected without mocking the layer under test. | `transporterOptions`-style flat default sneaking back (bounds API streams); token bound not actually firing on a stalled socket; wiring dropped. |
| T7 guard | The meta-test + its six negative controls (§3.4). | Future unbounded call sites; MF1–MF4 mutants. |
| T8 classifier | Extend `tests/drive/fetch.test.ts` (or sibling): `isDriveTimeoutShape` true for the probed shape (error with cause AbortError), true for legacy `code:"TimeoutError"` / `ETIMEDOUT`, false for plain errors and numeric-status errors; and the fetch.ts transient-mapping path returns 504 for the probed shape (failing today). Where practical, generate the input by ACTUALLY timing out a gaxios request against a stalled local server (the §1.3 probe as a test), not by hand-crafting the error. | Classifier drift from the real gaxios shape — the exact dead-code class §1.3 documents. |

Existing suites must stay green; the routes' structural client types changing shape surfaces stub drift at compile time.

---

## 5. Invariant compliance

- **Invariant 2 (advisory locks):** no touched code path mutates `shows`/`crew_members`/`crew_member_auth`/`pending_syncs`/`pending_ingestions`; no lock surface changes; zero holders added.
- **Invariant 5 / §12.4:** no new user-visible codes (D5, D6); scan reuses a shipped row.
- **Invariant 8 (UI gate):** no UI files touched — everything is `app/api/**` (explicitly excluded), `lib/`, `tests/`, docs, `package.json`.
- **Invariant 9 (Supabase call-boundary):** no Supabase call sites added or changed.
- **Invariant 10 (mutation-surface observability):** no new mutation surfaces; the scan POST route's instrumentation is untouched.
- **DB completeness:** no DDL, no migration — N/A.
- **Flag lifecycle:** no flags added. New dependency: `gaxios` (direct, version-matched to the existing transitive — no lockfile version fork).

## 6. Non-goals / documented limits

1. **Mid-body stream stalls (S3, S6, S7) stay unbounded by this diff** (D3). Un-defer trigger: an observed wedged asset response with a connected client and no progress.
2. **No retry added to any route** (D1). Client-initiated refresh is the retry.
3. **The `lib/` bounded sites keep their budgets** — no constant re-tuning, no consolidation of `DRIVE_CALL_TIMEOUT_MS` vs `DRIVE_FILES_GET_TIMEOUT_MS` (deliberately different, `lib/drive/watchErrors.ts:33-35`). §3.5 changes only WHICH errors classify as timeouts, not any budget or retry count.
4. **No watch-surface changes**; the watch design's ratified items (its §1.1a) are not reopened.
5. **The guard does not attempt alias-resolution soundness** (D7/MF5) — stated in the module header; type-aware resolution is BL-SOUND-REDIRECT-GUARD's follow-up.
6. **`getDriveAccessToken()`'s callers** get the token bound for free; their downstream fetches are out of scope (already bounded or separately tracked).
7. **http2 mode** (googleapis-common's `options.http2` branch) bypasses `authClient.request` for the API call but still uses gtoken for the token fetch via `getRequestHeaders`; this repo never sets `http2`, and the token bound holds either way.

## 7. Acceptance criteria

- AC-1: All eight sites S1-S8 carry a literal `timeout` or unconditional `signal` in their options argument; the meta-test proves it and fails on removal of any one.
- AC-2: A stalled Drive metadata call on any of the five metadata sites rejects at `DRIVE_FILES_GET_TIMEOUT_MS` and surfaces the route's existing infra-error response (T1/T3) — except S8, which surfaces 504 `ONBOARDING_SCAN_FAILED` (T5).
- AC-3: A stalled stream-open on S3/S6/S7 rejects at `DRIVE_ASSET_STALL_TIMEOUT_MS`; a successful stream-open leaves zero armed guard timers (T2/T4).
- AC-4: A token-host request through `TokenBoundGaxios` with a stalled socket rejects within the configured budget, and a non-token-host request gets no injected timeout — both proven over real sockets (T6); `getDriveAuth()` wires the transporter with `GOOGLE_AUTH_TOKEN_TIMEOUT_MS`.
- AC-5: A new unbounded Drive/Sheets namespace call (`files`, `channels`, `revisions`, `spreadsheets`, `values`) under `lib/` or `app/` fails CI by default, including the MF3/MF4 mutant shapes (T7).
- AC-6: `isDriveTimeoutShape` classifies the probed gaxios-7 shape; the fetch.ts transient-mapping returns 504 for it (T8).
- AC-7: Backlog dispositions per D9 land in the same PR.
