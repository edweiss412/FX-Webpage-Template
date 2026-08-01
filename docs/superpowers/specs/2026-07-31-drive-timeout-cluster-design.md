# Drive-timeout cluster — bound the app/api Drive calls and the GoogleAuth token fetch

**Date:** 2026-07-31 · **Branch:** `fix/drive-api-call-timeouts` · **Mode:** autonomous ship (consent via `/ship-feature`)

**Closes:** `BL-DRIVE-API-CALLS-UNBOUNDED-APP-ROUTES`, `BL-DRIVE-CREDENTIAL-FETCH-UNBOUNDED`, and — because the credential fetch was its only remaining residual — `BL-WATCH-DRIVE-CALL-TIMEOUT` (narrowed 2026-07-26 by the watch-renewal-lifecycle PR; see `docs/superpowers/specs/observability/2026-07-26-watch-renewal-lifecycle-design.md` §3.3.1a).

---

## 1. Problem, verified against the live tree

Two related unbounded-stall classes survive after the watch-renewal-lifecycle PR bounded everything under `lib/`:

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

`getDriveClient()` builds the client with no default timeout (`lib/drive/client.ts:35-39`; gaxios default is unbounded), so each of these can hold its route handler for as long as the platform allows. The onboarding-scan hang that motivated `DRIVE_EXPORT_TIMEOUT_MS` (`lib/drive/fetch.ts:80` doc comment: a silent socket stall that never throws, so no retry layer can help) is the observed production shape of this class.

A ninth match in the sweep output — `lib/drive/stallGuard.ts:14` — is a doc comment, not a call.

### 1.2 The GoogleAuth token fetch is unbounded, on every Drive caller

`getDriveAuth()` constructs `new google.auth.GoogleAuth({credentials, scopes})` with no transport options (`lib/drive/client.ts:41-46`). The token request that precedes every Drive API call runs on the auth client's own transporter, where no per-call `MethodOptions` applies. Verified against the installed `google-auth-library@10.6.2`:

- AuthClient constructor: this.transporter = opts.transporter ?? new Gaxios(opts.transporterOptions) — vendored build/src/auth/authclient.js line 68; transporterOptions?: GaxiosOptions is public API (authclient.d.ts line 88).
- The JWT access-token path threads that transporter into the token POST: createGToken() passes transporter: this.transporter (jwtclient.js lines 204-214), and gtoken uses it for the token request (gtoken/googleToken.js lines 36-37).
- GoogleAuth forwards clientOptions to the constructed auth client (googleauth.d.ts line 134).

(These anchors are inside node_modules/.pnpm/google-auth-library@10.6.2 — deliberately not backtick-cited so spec:lint does not resolve them against the repo tree; re-verify on any google-auth-library major bump.)

So a hung `oauth2.googleapis.com` (or any DNS/socket stall on the token path) stalls every caller of `getDriveClient()` / `getDriveAccessToken()` indefinitely — including the watch renewal loop that the watch-renewal-lifecycle PR otherwise bounded (its §3.3.1a documents exactly this reproduction and files it here).

### 1.3 No structural guard pins the class

The `lib/` sites were bounded one incident at a time (export hang → `DRIVE_EXPORT_TIMEOUT_MS`; metadata hang → `DRIVE_FILES_GET_TIMEOUT_MS`; watch calls → `DRIVE_CALL_TIMEOUT_MS`, `lib/drive/watchErrors.ts:35`). Nothing fails a NEW unbounded call site by default — which is how eight accumulated under `app/api/` while `lib/` was being swept. Per the class-sweep discipline (AGENTS.md, "Class-sweep before patching"), this diff ships the structural guard with the fix.

---

## 2. Resolved scope — do not relitigate

Ratified autonomously under the `/ship-feature` consent; alternatives recorded so review challenges the choice, not the inventory. Reviewers: verify these against their citations rather than re-deriving them; a challenge needs new evidence (a probe, a live-code contradiction), not a preference.

| # | Decision | Choice |
|---|----------|--------|
| D1 | Metadata sites S1, S2, S4, S5, S8 | Per-call `{ timeout: DRIVE_FILES_GET_TIMEOUT_MS, retry: false }` (8s; symbol exported from `lib/drive/fetch.ts`, doc comment adjacent to `DRIVE_EXPORT_TIMEOUT_MS`). NO `withDriveRetry` wrapper: these are request-scoped user/admin-facing reads where fail-fast beats a 3-attempt ≈34s worst case; the sync-path sites that DO wrap (`lib/sync/verifyReelOnApply.ts:84-90`) hold an advisory lock and own their retry budget — a different context. `retry: false` matches the repo-wide idiom (single retry layer; here that layer is "none"). |
| D2 | Stream sites S3, S6, S7 | Bound the AWAIT (connection + headers/first byte), not the body: `createStallGuard(DRIVE_ASSET_STALL_TIMEOUT_MS)` (`lib/drive/stallGuard.ts:32`, 30s), pass `signal: guard.signal` in the options arg, `guard.clear()` immediately after the await resolves (and in the catch). A gaxios `timeout` is wrong here: in gaxios 7 the timeout signal keeps ticking after headers and would abort a healthy long body transfer (a crew member's video seek, a slow PDF pull) mid-stream. The defect on record is the stalled AWAIT holding the route handler; that is what gets bounded. |
| D3 | Mid-body transfer bound for S3/S6/S7 | NOT bounded by this diff — documented limit (§6). After the await resolves the response is streaming to the client; byte caps (`ByteLimitExceededError` transforms) bound volume, client disconnect cancels the pull, and the platform route budget bounds worst-case wall clock. An idle guard wired to chunk progress would false-abort on CLIENT backpressure (a paused `<video>` stops the pull through the passthrough), which is routine, not a fault. |
| D4 | Credential fetch | `getDriveAuth()` passes `clientOptions: { transporterOptions: { timeout: GOOGLE_AUTH_TOKEN_TIMEOUT_MS } }`. New constant, `10_000`, defined in `lib/drive/client.ts` with a doc comment. Scope verified: the auth client's transporter serves the TOKEN path only — Drive API calls run on googleapis' own transport — so this cannot loosen or tighten any API-call budget. Blast radius is every `getDriveClient()`/`getDriveAuth()`/`getDriveAccessToken()` caller, and is strictly narrowing (unbounded → 10s). Healthy token round-trips are sub-second; 10s is ~10x headroom and well under the 15s the watch path budgets for a full Drive call (`lib/drive/watchErrors.ts:35`). |
| D5 | Timeout error surfacing — agenda/reel | No new codes. A fired guard/timeout rejects the await; the routes' existing catch tails already map unrecognized errors to `infraError("AGENDA_ASSET_LOOKUP_FAILED")` (`app/api/asset/agenda/[show]/[id]/route.ts:636`) / `infraError("REEL_ASSET_LOOKUP_FAILED")` (`app/api/asset/reel/[show]/route.ts:741-754` and the per-branch catches at `app/api/asset/reel/[show]/route.ts:365-378`, `app/api/asset/reel/[show]/route.ts:403-409`, `app/api/asset/reel/[show]/route.ts:490-500`). Both codes are shipped §12.4 rows; timeout classification helpers (`isNotFoundOrGone`, `isPermissionDenied`, `isRangeNotSatisfiable`) match on status and cannot misclassify a status-less timeout. No §12.4 lockstep is triggered. |
| D6 | Timeout error surfacing — scan | `defaultVerifyFolder`'s catch tail today maps any status-less error to `{status: 400, code: "OPERATOR_ERROR_INCOMPLETE_FOLDER_METADATA"}` (`app/api/admin/onboarding/scan/route.ts:127`) — with a timeout added, a Drive stall would be reported as the OPERATOR's mistake. Add a timeout branch ahead of it: gaxios-7 timeout (`err.name === "TimeoutError"`, the shape `lib/sync/applyStaged.ts:992-994` and `lib/geocoding/client.ts:57` already key on) → `{status: 504, code: "ONBOARDING_SCAN_FAILED"}`. `ONBOARDING_SCAN_FAILED` is an existing catalog row (`lib/messages/catalog.ts:2160`); no new codes, no lockstep. |
| D7 | Structural guard | New meta-test at tests/drive/_metaDriveCallBounds.test.ts (NEW file, hence not backtick-cited): TypeScript-AST walk (compiler API, no new dependency) over non-test `.ts` under `lib/` and `app/`, collecting call expressions whose callee chain traverses one of the API namespaces `files` / `channels` / `revisions` / `spreadsheets` (any depth, so `sheets.spreadsheets.get` and `sheetsClient.spreadsheets.values.get` both match) with a terminal method in {`get`, `list`, `watch`, `stop`, `create`, `update`, `export`, `copy`, `delete`, `batchGet`}. Each match must satisfy one of: (a) an options argument whose source text contains `timeout` or `signal`; (b) an inline `// drive-call-bound: <where>` comment on the call's first line naming the layer that bounds it (for wrapper-injected bounds the AST cannot see locally); (c) nothing else — no registry file, so a new site fails by default. AST, not lexical line-matching, because the calls span 5-15 lines and the `BL-SOUND-REDIRECT-GUARD` lesson caps spelling-chasing: matching the resolved property chain covers formatting variance in one construction. Honest ceiling stated in the module header: a drive client reached through an untyped alias that renames the namespace escapes; the guard proves "no known-shape unbounded call", not impossibility. |
| D8 | One branch, one PR | The cluster coheres (one defect class, one guard); the credential change is a few lines whose review the same adversarial pass covers. The backlog's "possibly second PR" hedge is resolved to one PR — commit-per-task per invariant 6. |
| D9 | BACKLOG.md dispositions in the same PR | Close `BL-DRIVE-API-CALLS-UNBOUNDED-APP-ROUTES` and `BL-DRIVE-CREDENTIAL-FETCH-UNBOUNDED` (move to `BACKLOG-archive.md` per the graduation convention); update `BL-WATCH-DRIVE-CALL-TIMEOUT` to CLOSED with a pointer here (its text already names the credential fetch as the only remaining half). |

---

## 3. Design

### 3.1 Metadata sites (S1, S2, S4, S5, S8)

Mechanical: add the second argument `{ timeout: DRIVE_FILES_GET_TIMEOUT_MS, retry: false }`, importing `DRIVE_FILES_GET_TIMEOUT_MS` from `@/lib/drive/fetch`. The agenda and reel routes call through locally-declared structural client types (`DriveClient` / `ReelDriveClient` interfaces defined in the route files); those type declarations gain the optional options parameter matching the shape the routes now pass (the runtime object is the real `drive_v3.Drive`, which already accepts `MethodOptions`).

Failure behavior (unchanged plumbing, new input): a stall now rejects at 8s with gaxios `TimeoutError` (no `.status`), which each existing catch maps as:

- S1/S2 → outer catch → `infraError("AGENDA_ASSET_LOOKUP_FAILED")` (500-class JSON).
- S4 → `infraError("REEL_ASSET_LOOKUP_FAILED")` via the enclosing try's catch (`app/api/asset/reel/[show]/route.ts:403-409`).
- S5 → outer catch → `infraError("REEL_ASSET_LOOKUP_FAILED")`.
- S8 → new `TimeoutError` branch in `defaultVerifyFolder` → `{status: 504, code: "ONBOARDING_SCAN_FAILED"}` (D6); the existing 403/404 branches are unaffected because a timeout carries no status.

### 3.2 Stream sites (S3, S6, S7)

Per site:

```ts
const guard = createStallGuard(DRIVE_ASSET_STALL_TIMEOUT_MS);
try {
  const res = await drive.files.get(params, { responseType: "stream", signal: guard.signal, ...headers });
  guard.clear();
  // ... existing stream handoff unchanged
} catch (err) {
  guard.clear();
  // existing mappings; a guard abort falls through to the infra-error tail
}
```

- `clear()` after the await disarms the guard before the body streams — the bound covers connect + headers only (D2/D3). `clear()` in the catch prevents a armed-but-orphaned timer (it is `unref`'d regardless, `lib/drive/stallGuard.ts:42`).
- No `reset()` wiring: with no resets, `createStallGuard` degenerates to a single total budget on the await, which is exactly the intended semantics; reusing it keeps one abort-guard implementation (its `timedOut()` discrimination and unref behavior come free) instead of introducing a second.
- S6's fallback structure: the guard for S6 clears before `chunkedHashFrom`/stream forwarding; S7 (inside S6's catch) arms its OWN guard. Two guards never overlap because S7 only starts after S6's catch ran `guard.clear()`.
- The options-argument types in the routes' structural client interfaces gain `signal?: AbortSignal`.

### 3.3 Credential fetch

`lib/drive/client.ts`:

```ts
/** Bounds the service-account token POST (gtoken → oauth2.googleapis.com). ... */
export const GOOGLE_AUTH_TOKEN_TIMEOUT_MS = 10_000;

export function getDriveAuth(
  overrides?: { tokenTimeoutMs?: number },
): InstanceType<typeof google.auth.GoogleAuth> {
  return new google.auth.GoogleAuth({
    credentials: readServiceAccountCredentials(),
    scopes: GOOGLE_DRIVE_SCOPES,
    clientOptions: {
      transporterOptions: { timeout: overrides?.tokenTimeoutMs ?? GOOGLE_AUTH_TOKEN_TIMEOUT_MS },
    },
  });
}
```

The `overrides` parameter exists for T6 only (a fast-firing timeout in tests; `AbortSignal.timeout` runs on native timers vitest's fake-timer layer cannot drive, so the test needs a real small budget rather than clock control). `getDriveClient()` and all production callers pass nothing.

Verified mechanism chain in §1.2. On timeout the token request rejects (`TimeoutError`), the awaiting Drive call rejects with it, and every caller's existing infra-fault path handles it — the same paths that today handle a `DriveConfigError` from missing credentials. No caller changes.

### 3.4 Structural guard

tests/drive/_metaDriveCallBounds.test.ts (NEW) per D7. Negative controls in the same file: feed the checker an inline source string containing (a) a bare `drive.files.get({fields})` — must FAIL; (b) a bounded call with the options on a later line — must PASS; (c) a `formData.files.map(...)` lookalike — must NOT match (terminal method + namespace chain rule). The checker is exported as a pure function over source text so the negative controls exercise the real implementation, not a copy.

Expected exemption inventory at ship time: zero `// drive-call-bound:` comments — every live site after this diff carries a literal `timeout`/`signal` in its options argument. (`lib/drive/fetch.ts:360` and friends pass `{ timeout: timeoutMs, retry: false }` — the text `timeout` is present, so wrapper sites satisfy (a) without comments.)

---

## 4. Test plan

TDD per task; each test states the failure mode it catches.

| Task | Test | Failure mode caught |
|------|------|---------------------|
| T1 agenda metadata (S1, S2) | Extend `tests/api/agenda-asset-route.test.ts`: drive stub records the options arg; assert `{timeout: DRIVE_FILES_GET_TIMEOUT_MS, retry: false}` on both metadata gets. Behavior: stub rejects `Object.assign(new Error("t"), {name: "TimeoutError"})` → response is the existing infra-error JSON (assert status + `code` field), NOT a hang, NOT `gone()`. | Bound silently dropped in a refactor; timeout misclassified as 404/410 (cache-poisoning a healthy asset as gone). |
| T2 agenda stream (S3) | Stub captures options: assert an `AbortSignal` present; assert guard cleared after success (`vi.getTimerCount()` delta 0 across the handler when the stub resolves). Behavior: stub never settles until `signal` aborts, then rejects with an abort error → infra-error JSON within fake-timer budget. | Signal not wired (await unbounded); timer leak per request. |
| T3 reel metadata (S4, S5) | Same shape as T1 in `tests/api/reel-asset-route.test.ts`. | Same as T1. |
| T4 reel streams (S6, S7) | Same shape as T2, plus: S6 rejects with a revision-fallback-eligible error → S7's call ALSO carries a signal (fallback not exempt from the bound). | Fallback path left unbounded — the exact "sweep missed the second site in the same function" shape. |
| T5 scan (S8) | Extend the onboarding scan route tests: options-arg assertion; `TimeoutError` rejection → 504 + `ONBOARDING_SCAN_FAILED`; a plain status-less error still → 400 `OPERATOR_ERROR_INCOMPLETE_FOLDER_METADATA` (regression pin on the existing tail). | Timeout blamed on the operator; existing mapping broken by the new branch. |
| T6 credential | New test file tests/drive/clientAuthTimeout.test.ts (NEW). A local-`http.Server` redirect is NOT possible: gtoken hardcodes the token endpoint (GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token', vendored google-auth-library 10.6.2 gtoken/getToken.js line 19) and ignores the credentials' `token_uri`. So the boundary mocked is global `fetch`, with pinned WHATWG semantics: the stall stub never settles, and rejects with `DOMException(..., "AbortError")` the moment its received `signal` fires — the platform contract, nothing of the stack under test. Ephemeral RSA key via `node:crypto generateKeyPairSync` (gtoken signs a real JWT before POSTing); env `GOOGLE_SERVICE_ACCOUNT_JSON` stubbed with those creds. Assertions: (1) `getDriveAuth({tokenTimeoutMs: 250}).getAccessToken()` rejects within a 5s test budget, with a timeout/abort-shaped error; (2) the stub observed a POST to the real token URL carrying a non-null `signal` — proving `transporterOptions` reached the token request rather than being dropped; (3) control: the same stub resolving a valid token body → `getAccessToken()` resolves. | `transporterOptions` not actually reaching the token POST (the exact claiming-closed-without-probe error §3.3.1a documents from the withdrawn design). |
| T7 guard | The meta-test itself + its negative controls (§3.4). | Future unbounded call sites. |

Anti-tautology notes: T1/T3/T5's options-arg assertions alone would be shape-only — each is paired with a behavioral rejection test whose asserted OUTPUT (status + code JSON) differs from the pre-diff behavior (hang / wrong code), so the tests fail against the unpatched routes. T6 is executable proof against a real socket, not a mock of the thing under test. T2/T4's "never settles" stub makes the unpatched code FAIL by timeout, satisfying failing-test-first without a real 30s wait (fake timers drive the guard).

Existing suites (`tests/api/agenda-asset-route.test.ts`, `tests/api/reel-asset-route.test.ts`, scan/onboarding suites, `tests/drive/*`) must stay green; the routes' structural client types changing shape will surface any stub drift at compile time.

---

## 5. Invariant compliance

- **Invariant 2 (advisory locks):** no touched code path mutates `shows`/`crew_members`/`crew_member_auth`/`pending_syncs`/`pending_ingestions`; no lock surface changes; zero holders added. The scan route's Drive call happens before any DB mutation and outside any lock; unchanged.
- **Invariant 5 / §12.4:** no new user-visible codes (D5, D6); both routes keep their shipped codes; scan reuses a shipped row.
- **Invariant 8 (UI gate):** no UI files touched — everything is `app/api/**` (explicitly excluded), `lib/`, `tests/`, docs.
- **Invariant 9 (Supabase call-boundary):** no Supabase call sites added or changed.
- **Invariant 10 (mutation-surface observability):** no new mutation surfaces; the scan POST route's instrumentation is untouched.
- **DB completeness:** no DDL, no migration — N/A.
- **Flag lifecycle:** no flags added.

## 6. Non-goals / documented limits

1. **Mid-body stream stalls (S3, S6, S7) stay unbounded by this diff** (D3): bounded instead by byte caps, client cancellation, and the platform route budget. Un-defer trigger: an observed wedged asset response with a connected client and no progress.
2. **No retry added to any route** (D1). Client-initiated refresh is the retry.
3. **The `lib/` bounded sites are untouched** — no constant re-tuning, no consolidation of `DRIVE_CALL_TIMEOUT_MS` vs `DRIVE_FILES_GET_TIMEOUT_MS` (deliberately different budgets, `lib/drive/watchErrors.ts:33-35` documents why).
4. **No watch-surface changes**; the watch design's ratified items (its §1.1a) are not reopened.
5. **The guard does not attempt alias-resolution soundness** (D7) — same honest ceiling as `BL-SOUND-REDIRECT-GUARD`, stated in the module header. Type-checker-backed resolution is that entry's follow-up, not this one.
6. **`getDriveAccessToken()`'s callers** (`lib/audit/authPrimitives.ts` region) get the token bound for free; their downstream fetches are out of scope (already bounded or separately tracked).

## 7. Acceptance criteria

- AC-1: All eight sites S1-S8 carry a literal `timeout` or `signal` in their options argument; the meta-test proves it and fails on removal of any one.
- AC-2: A stalled Drive metadata call on any of the five metadata sites rejects at `DRIVE_FILES_GET_TIMEOUT_MS` and surfaces the route's existing infra-error response (T1/T3) — except S8, which surfaces 504 `ONBOARDING_SCAN_FAILED` (T5).
- AC-3: A stalled stream-open on S3/S6/S7 rejects at `DRIVE_ASSET_STALL_TIMEOUT_MS`; a successful stream-open leaves zero armed guard timers (T2/T4).
- AC-4: A token-endpoint stall rejects `getAccessToken()` within the configured token timeout (production default `GOOGLE_AUTH_TOKEN_TIMEOUT_MS`), proven per T6 with the timeout demonstrably flowing through `transporterOptions` to the token POST.
- AC-5: A new unbounded Drive/Sheets namespace call (`files`, `channels`, `revisions`, `spreadsheets`) under `lib/` or `app/` fails CI by default (T7).
- AC-6: Backlog dispositions per D9 land in the same PR.
