<!-- spec-lint: not-ui — no UI surface: the diff is lib/admin loaders, two client-side wire modules, a route-adjacent projection, and meta-tests. The one components/ file, GlobalErrorListener.tsx, is declared `: null` and has one render return; it paints nothing, so there is no layout, token, dimension or visual state to inventory. impeccable-gate: N/A. -->

# Observe error telemetry: the dark loader branch, the lib/admin sweep, and the client wire's non-Error collapse

**Arc:** `fix/observe-error-telemetry` · **Filed:** 2026-08-26 · **Closes:** `BL-ADMIN-LOADER-INFRA-ERROR-TELEMETRY-SILENT`, `BL-REPORT-CLIENT-ERROR-NON-ERROR-MESSAGE-ONLY`

Two rows, one sentence apart in what they are about: a fault that arrives and leaves no record. Server-side it is an `infra_error` returned from a `lib/admin` loader with nothing written to `app_events`. Client-side it is a crash value that is not an `Error`, which the wire flattens to the string `"[object Object]"` and then, worse, dedups every subsequent one away.

Both rows were filed as class-sweep deferrals by arcs that repaired a sibling instance and left this one. This arc finishes both sweeps. Per Eric's directive of 2026-08-25 it files no new `BL-`/`DEF-` row of any facing: anything found is repaired here or recorded as a documented limit in §9.

---

## 1. Problem

### 1.1 Resolved scope — do not relitigate

Each of these is settled. A reviewer re-opening one is relitigating a merged arc or a ratified decision, and the citation is given so it can be verified rather than re-derived.

1. **Observing at the transport, at `debug`, is ratified.** PR #899 installed `lib/supabase/observeTransport.ts` on both server-side factories and chose `debug` deliberately; `lib/log/logger.ts:29` returns `false` for `debug` unconditionally, so the observer's records never reach `app_events` by design. The loader emit in §4 is the *persisted* record and the observer is the *job-log* record. They are different sinks on purpose. Arguing that the observer should persist, or that a persisting observer makes the loader emit redundant, re-opens #899.

2. **`serializeError`'s shape is ratified.** Its bounds (`DEPTH_MAX` 3, `KEYS_MAX` 32, `ITEMS_MAX` 32, `STR_MAX` 500, `NODES_MAX` 200 at `lib/log/serializeError.ts:14-19`), its marker vocabulary, its `String(value)`-for-primitives rule and its ten §4 limits were ratified 2026-08-16 (`docs/superpowers/specs/observability/2026-08-16-serialize-error-structure-design.md`). This arc REUSES the helper by its own module path. A second serializer, a `JSON.stringify` replacer, or a `sanitizeValue` variant re-proposes the alternatives that spec rejected at its §2.7.

3. **The two `CAPS` copies stay two copies.** `lib/observe/clientErrorTransport.ts:3-12` and `app/api/observe/client-error/route.ts:11-20` each carry the table so the client never imports server code and the server never trusts the client's slice. This arc changes neither table and adds no field to either. Unifying them through a shared import would pull one side into the other's bundle.

4. **Forensic codes are not §12.4 catalog codes.** `lib/messages/__internal__/stripLogEmissionCalls.ts:4-11` strips `log.*` spans before the producer scan, so a `code:` literal inside `log.error(...)` never reaches x1/x2. Their registry is `NEW_FORENSIC_CODES` (`tests/log/_auditableMutations.ts:601`). No §12.4 row, no `pnpm gen:spec-codes`, no `lib/messages/catalog.ts` edit is owed by any code this arc adds.

5. **#882's four emits are merged and reviewed.** `RECENT_AUTO_APPLIED_CLIENT_THREW`, `SHOW_CHANGE_LOG_READ_THREW`, `ROSTER_SHIFT_COUNTS_READ_RETURNED_ERROR`, `ROSTER_SHIFT_COUNTS_READ_THREW` are not re-argued here. Their absence from `NEW_FORENSIC_CODES` and from any test is a gap this arc fills.

6. **Row 1's own line citations anchor a file that no longer exists in that form.** §2 reconciles them once. They are not wrong; they are pre-#882. Cite §2 thereafter.

7. **The `admin.recentAutoApplied` / `admin.loadRecentAutoApplied` source split in one file is pre-existing and is not widened.** The four #882 emits use `admin.recentAutoApplied` (`lib/admin/loadRecentAutoApplied.ts:145`, `lib/admin/loadRecentAutoApplied.ts:181`, `lib/admin/loadRecentAutoApplied.ts:245`, `lib/admin/loadRecentAutoApplied.ts:263`); the corrupt-payload warn uses `admin.loadRecentAutoApplied` (`lib/admin/loadRecentAutoApplied.ts:217`). The new emit in §4 uses `admin.recentAutoApplied`, matching its four siblings. Unifying the two is a rename of a shipped source value and is not this arc's work.

8. **The Error path on the client wire is unchanged.** An `Error` crash keeps today's exact wire bytes: `message` from `.message`, `stack` from `.stack`, no `detail`. §6 changes only the non-`Error` arm. Extending structural capture to `Error` values would add bytes to the overwhelmingly common path for no row's benefit; `stack` already carries 8000 characters there.

### 1.2 Row 1 — the loader is dark on one branch

`BL-ADMIN-LOADER-INFRA-ERROR-TELEMETRY-SILENT` (`BACKLOG.md`, `## ` heading; grep the id) says `lib/admin/loadRecentAutoApplied.ts` imports `log` and none of its five `infra_error` return sites emits anything, so attributing app-e2e run 32528532727 required downloading the failure artifact instead of reading the job log.

That was true on 2026-08-24. It is false today by exactly one site. §2 has the reconciliation.

### 1.3 Row 2 — the client wire collapses non-`Error` values, twice

`BL-REPORT-CLIENT-ERROR-NON-ERROR-MESSAGE-ONLY` (`BACKLOG.md`, `### ` heading; grep the id) names one defect. There are two.

**The message defect, which the row names.** `toError` at `lib/observe/reportClientError.ts:11-14` returns `{ message: String(e) }` for any non-`Error` value. A plain object — the shape a PostgREST returned-error takes when a component throws it — becomes the literal string `"[object Object]"` on the wire and in `app_events`. The content of the crash is gone.

**The signature defect, which it does not.** `lib/observe/clientErrorTransport.ts:32` builds the dedup key as `` `${source}|${level}|${message}|${(input.stack ?? "").slice(0, 200)}` `` and `lib/observe/clientErrorTransport.ts:33-34` drops any repeat. A non-`Error` value has no `stack` (`reportClientError.ts:13` returns no `stack` key), so *every* plain-object crash in a page session shares the key `client.<area>|error|[object Object]|`. The first one reaches the wire and every crash after it is silently dropped. The message defect loses one crash's content; the signature defect loses every crash after the first.

The second defect is a consequence of the first, not a separate repair: give two distinct values two distinct messages and the signature discriminates again. That is why §6's projection is specified in terms of *discrimination*, not only legibility.

### 1.4 The same shape at a second wire site the row does not name

`components/observe/GlobalErrorListener.tsx:41-44` derives the `CLIENT_UNHANDLED_REJECTION` detail as `String(reason instanceof Error ? reason.message : (reason ?? ""))`. A promise rejected with a plain object persists `detail: "[object Object]"`. `tests/observe/globalErrorListener.test.tsx:42-53` pins only a string reason, so nothing catches it.

Class-sweep applies at round 1. Both wire-reaching sites are repaired here.

The other `clientLog` callers pass their value as `context` — `components/realtime/ShowRealtimeBridge.tsx:503`, `components/realtime/ShowRealtimeBridge.tsx:755`, `components/realtime/ShowRealtimeBridge.tsx:786`, `components/realtime/ShowRealtimeBridge.tsx:821` and `components/admin/dev/DevCaptureControl.tsx:126` — and `context` is console-only and never mirrored (`lib/observe/clientLog.ts:17-18`). They are outside the wire and outside this arc. §9 records that.

---

## 2. Reconciliation: what #882 already repaired

Row 1's five line numbers (145, 170, 176, 231, 241 — plain numbers here, deliberately, because they anchor a file shape that no longer exists) resolve against the pre-#882 file — `git show d9a039a94~1:lib/admin/loadRecentAutoApplied.ts`. PR #882 (`fix/admin-loader-ci-transient`, merged 2026-08-25 as `15e0b2d95`, the day after the row was filed) added four emits in two commits, and neither commit touched the row:

| commit | code added | site today |
| --- | --- | --- |
| `d9a039a94` | `ROSTER_SHIFT_COUNTS_READ_RETURNED_ERROR` | `loadRecentAutoApplied.ts:244-248`, rpc returned-error arm |
| `17357a05c` | `RECENT_AUTO_APPLIED_CLIENT_THREW` | `lib/admin/loadRecentAutoApplied.ts:144-148`, client construction catch |
| `17357a05c` | `SHOW_CHANGE_LOG_READ_THREW` | `lib/admin/loadRecentAutoApplied.ts:180-184`, table-read catch |
| `17357a05c` | `ROSTER_SHIFT_COUNTS_READ_THREW` | `lib/admin/loadRecentAutoApplied.ts:262-266`, rpc catch |

The comment `d9a039a94` left at `lib/admin/loadRecentAutoApplied.ts:241-243` states the rule this arc generalizes: *an infra fault is recorded where it arrives.*

**The one site still dark is the `show_change_log` returned-error branch at `lib/admin/loadRecentAutoApplied.ts:174-176`:**

```ts
if (error) {
  return { kind: "infra_error", message: `show_change_log read failed: ${error.message}` };
}
```

#882's title scopes it to the RPC boundary ("absorb the transient upstream 502 at the Supabase RPC boundary"); this branch is a `.from("show_change_log")` table read (`lib/admin/loadRecentAutoApplied.ts:162-173`). That is the most plausible reason it was missed, and there is no decision recorded anywhere that it should stay dark.

**#899 does not make this emit redundant, and the reason is the level.** The observer records every 5xx and every rejection from both server-side factories (`lib/supabase/observeTransport.ts`, installed at `lib/supabase/server.ts:107` under the retry wrapper and at `lib/supabase/server.ts:167` on the service-role factory) and emits at `debug`. `lib/log/logger.ts:29` returns `false` for `debug` unconditionally — pinned by `tests/log/logger.test.ts` — so those records reach the app-e2e job log and never `app_events`. Two consequences:

- A **502** on this read is visible in the job log after #899 and invisible to `pnpm observe events`.
- A **sub-500 returned error** — `42501` permission denied, `42P01` missing relation, a PostgREST schema-cache miss — is below the observer's 5xx threshold and today reaches nobody at any level.

The loader-level `log.error` is the persisted record for the first case and the *only* record for the second.

---

## 3. The class, derived rather than enumerated

### 3.1 The shape

> A function in `lib/admin/**` returns an `infra_error`-kind result on a path that emits no code-carrying record.

"Code-carrying" means a `log.error` / `log.warn` / `log.info` / `log.debug` call with a `code:` property, or a `logAdminOutcome(...)` call. A SHOUTY message alone is not a code; the persisted `code` column is (`lib/log/logger.ts:45`).

### 3.2 The derivation, and why it is a derivation

The population is the output of a walk, not a list in this document. A list copied into prose re-opens the moment someone adds a site, which is the enumeration failure `lib/supabase/observeTransport.ts` records having hit three times. The walker in §5 IS the derivation, and it runs in CI.

Measured 2026-08-26 on `26b99c4c0`, the raw grep the row itself used:

```
grep -rl 'kind: "infra_error"' lib/admin --include='*.ts' | grep -v '\.test\.'   # 20 files
grep -rn 'kind: "infra_error"' lib/admin --include='*.ts' | grep -v '\.test\.' | wc -l   # 105 matches
```

That 105 counts type-union members and pass-throughs, so it is not the population. The AST walk over `return` statements whose argument is an object literal with `kind: "infra_error"` gives, at authoring time:

| class | total | dark |
| --- | ---: | ---: |
| `catch` arm (thrown await) | 40 | 35 |
| `if (error)` arm (returned error) | 27 | 24 |
| integrity guard (`typeof count !== "number"`) | 6 | 6 |
| propagation (`sub.kind === "infra_error"`) | 4 | 4 |
| **total** | **77** | **69** |

The 8 sites that already emit are `lib/admin/loadAppEvents.ts:64` and `lib/admin/loadAppEvents.ts:82`, `lib/admin/loadCronHealth.ts:58` and `lib/admin/loadCronHealth.ts:69`, and the four #882 sites in the loader.

### 3.3 The sweep decision, and which way it went

**Every dark arrival site is repaired in this PR: 65 of the 69.** The four propagation sites are exempt by shape, not by allow-list — see §3.4.

bl-orch ruled the whole derived cover on 2026-08-26 (09:27 CDT, pane `wP:p1A`): the walker comes first, then every site it finds is repaired, and only a site whose repair is a *redesign* rather than an emit is deferred. That ruling was made against the raw file count (20). The derived site count is larger, and the ruling's logic survives it unchanged: one `log.error` per site is the marginal cost the class-sweep default already prices at near zero, and 65 near-zeros is still near zero while the review is already open on this code. The count was reported to bl-orch before the spec review.

Exception (c) — "the repair is a redesign, or spans enough sites to blow the review scope" — is not invoked. Each repair is three to six lines with no control-flow change, no new dependency, and no behavior change to any caller: the returned result is byte-identical before and after, and the only difference is a row in `app_events`.

**No site is deferred.** The walker's exemption list is empty at merge, and it is fail-closed: a new `lib/admin` file with a dark site fails on the day it lands, not at the next audit.

### 3.4 Why propagation sites must NOT emit

Four sites re-return an `infra_error` that arrived in a callee:

- `lib/admin/bellFeed.ts:256` — `if (pipeline.kind === "infra_error") return { kind: "infra_error" }`
- `lib/admin/bellFeed.ts:348` — the same guard on the count entry point
- `lib/admin/loadNeedsAttention.ts:307` — `if (holdsResult.kind === "infra_error")` re-wrapping with the callee's message
- `lib/admin/needsAttentionCount.ts:90` — `if (holds.kind === "infra_error") return { kind: "infra_error" }`

Emitting here would write a second `app_events` row for one fault, and an operator counting rows would over-count. The rule at `loadRecentAutoApplied.ts:241-243` is "recorded where it arrives", and these are not arrivals.

The exemption is only sound because the sweep is total: `runBellPipeline` and `loadOpenIdentityHolds` are themselves inside the cover, so after this PR the fault IS recorded at its arrival in the callee. A partial sweep would have made this exemption a hole.

---

## 4. Deliverable A — the loader

### 4.1 The new emit

At `lib/admin/loadRecentAutoApplied.ts:174-176`, matching its three siblings exactly:

```ts
if (error) {
  void log.error("show_change_log read returned error", {
    source: "admin.recentAutoApplied",
    code: "SHOW_CHANGE_LOG_READ_RETURNED_ERROR",
    error,
  });
  return { kind: "infra_error", message: `show_change_log read failed: ${error.message}` };
}
```

**The code name is derived, not invented.** The file already establishes the two axes: the boundary name, then the arm. `SHOW_CHANGE_LOG_READ_THREW` is this table's throw arm (`lib/admin/loadRecentAutoApplied.ts:182`); `ROSTER_SHIFT_COUNTS_READ_RETURNED_ERROR` is the rpc's returned arm (`lib/admin/loadRecentAutoApplied.ts:246`). `SHOW_CHANGE_LOG_READ_RETURNED_ERROR` is the fourth cell of that two-by-two, and the `_RETURNED_ERROR` / `_THREW` suffix pair is the convention two other `lib/admin` loaders reached independently: `APP_EVENTS_READ_RETURNED_ERROR` and `APP_EVENTS_READ_THREW` at `lib/admin/loadAppEvents.ts:61` and `lib/admin/loadAppEvents.ts:79`, `CRON_HEALTH_APP_EVENTS_READ_RETURNED_ERROR` and `CRON_HEALTH_APP_EVENTS_READ_THREW` at `lib/admin/loadCronHealth.ts:55` and `lib/admin/loadCronHealth.ts:66`.

**`error` is passed whole**, not `error.message`. `lib/log/logger.ts:38` runs `serializeError` on the `error` field, which since `fix/serialize-error-structure` captures a PostgREST returned-error's own `code`, `details` and `hint`. Those three fields are exactly what tells `42501` from `42P01` from a schema-cache miss, and `.message` discards them.

**The returned result does not change.** Its `message` still reads `show_change_log read failed: ${error.message}`, so `components/admin/RecentAutoAppliedStrip.tsx:23-24` and `components/admin/RecentAutoAppliedStrip.tsx:726-729` render the same fixed plain-language sentence and invariant 5 is untouched. No file under `app/` outside `app/api/**` changes.

### 4.2 The `.message` regression at `lib/admin/loadRecentAutoApplied.ts:247`

`ROSTER_SHIFT_COUNTS_READ_RETURNED_ERROR` passes `error: error.message` (`lib/admin/loadRecentAutoApplied.ts:247`) where its three siblings pass the value whole. That discards the PostgREST fields on the one arm most likely to carry them.

Repaired in-branch to `error` (the bare identifier). The pre-flatten guard at `tests/log/noDoubleSerializedLogError.test.ts:12-13` bans `String(e)` and `JSON.stringify(e)` in an `error:` initializer and does not see `.message`; §9 records that as that guard's documented limit rather than widening it under review pressure.

### 4.3 The five codes, pinned by one derived table

`tests/admin/loadRecentAutoApplied.test.ts:299-318` today is a four-way `test.each` over (`from`|`rpc`) × (`throwOn`|`errorOn`) asserting only `result.kind`. None of the four #882 codes is pinned anywhere under `tests/` — grepping `admin.recentAutoApplied` or any of the four code names returns nothing.

The replacement is one table with a row per `(surface, mode)`, each naming the code it expects, plus the client-construction row, driven through a log sink spy:

| surface | mode | expected code |
| --- | --- | --- |
| client construction | throws | `RECENT_AUTO_APPLIED_CLIENT_THREW` |
| `from` | `throwOn` | `SHOW_CHANGE_LOG_READ_THREW` |
| `from` | `errorOn` | `SHOW_CHANGE_LOG_READ_RETURNED_ERROR` |
| `rpc` | `throwOn` | `ROSTER_SHIFT_COUNTS_READ_THREW` |
| `rpc` | `errorOn` | `ROSTER_SHIFT_COUNTS_READ_RETURNED_ERROR` |

Coverage is **derived**, in the shape of `tests/auth/_metaInfraContract.test.ts:62-76` and its `afterAll` set-equality at `tests/auth/_metaInfraContract.test.ts:216-218`: each row records itself in a covered set as it runs, and an `afterAll` asserts that set equals the declared code set. A sixth return site added later without a row fails set-equality rather than passing silently.

The sink is `setLogSink` from `@/lib/log`, so the assertion reads the record *after* `buildRecord` has run `serializeError` on the `error` field (`lib/log/logger.ts:38`). That is what makes the next assertion possible.

**The assertion that catches a `.message` regression.** For both `errorOn` rows, the fake's error object carries a PostgREST `code` (the existing fake returns `{ message: "SIMULATED ... error" }` at `tests/admin/loadRecentAutoApplied.test.ts:78-81` and `tests/admin/loadRecentAutoApplied.test.ts:109`; it gains a `code` and a `details` field), and the test asserts `record.context.error` is an object carrying that `code` value read from the fixture. Passing `.message` makes `context.error` a string and the assertion fails. The expected value is read from the fixture constant, never written as a literal in the assertion.

### 4.4 `NEW_FORENSIC_CODES`

All five loader codes plus every code the §3.3 sweep introduces get a row in `NEW_FORENSIC_CODES` (`tests/log/_auditableMutations.ts:601`), in one edit with one comment block naming this arc. The set is consumed by the leak check at `tests/log/_metaAdminOutcomeContract.test.ts:87-91`, which asserts none of them ever appears in the §12.4 producer set. Registration is the assertion "this code must never become a catalog row"; omission is invisible, which is why the registration is explicit.

---

## 5. Deliverable B — the walker

### 5.1 Shape, and why this shape


<!-- spec-lint: ignore — this file is created by this spec's implementation and is not tracked yet -->
`tests/admin/infraEmitScan.ts` — pure functions of a source **string** — plus `tests/admin/_metaInfraEmitCover.test.ts`, which walks `lib/admin/**` from disk and applies them.

The split follows `tests/cross-cutting/replacementString/scan.ts:1-16`, which states the reason: the mutation overlay rewrites the module graph, so a check that reads its subject with `readFileSync` inside the assertion would read unmutated bytes and pass unconditionally. Taking the source as an argument is what would let a fixture suite kill mutants at all. This arc does not enroll the scanner (§8), but authoring it in the enrollable shape costs nothing and is the shape AGENTS.md requires of a guard surface from the start.

Walking the filesystem rather than reading a registry is what makes a new `lib/admin` file **fail by default** instead of being silently exempt.

### 5.2 Accept-set, keyed on structure

The scanner decides, for each `return` statement whose argument is an object literal with a `kind` property whose initializer is the string literal `"infra_error"`:

**Population.** Every such return in every `.ts`/`.tsx` file under `lib/admin/**` that is not a `.test.` file. Parenthesized, `as`, and `satisfies` wrappers are unwrapped before the object-literal test.

**Guard scope.** Walking outward from the return statement to the first of: an `if` consequent or alternate; a `catch` clause body; the enclosing function body. That block is the scope.

**Accepted (no emit required) — one form, keyed on structure:**

- The guard scope's nearest enclosing `if` test is a strict equality between a property access ending in `.kind` and the string literal `"infra_error"`. This is the propagation form of §3.4: the fault arrived elsewhere.

**Satisfied (emit present):** the scope contains, anywhere within it, a call to `logAdminOutcome`, or a call to `log.error` / `log.warn` / `log.info` / `log.debug` one of whose arguments is an object literal with a `code` property.

**Everything else is reported by name** — file, line, and the return's source text. That includes a form nobody has modelled yet: a `switch` arm, a ternary, a guard shape the walker cannot classify. A recognizer that cannot classify an input reports it; it does not accept it. This is the direction a static guard must fail in, and it is why the accept-set is one form rather than a list of rejected shapes.

`log.debug` counts as code-carrying deliberately. The contract this walker enforces is "the fault is attributable", not "the fault persists" — the persist decision belongs to `shouldPersist` (`lib/log/logger.ts:21-30`), and #899's transport observer is the ratified precedent for a code-carrying record at `debug`. Nothing in `lib/admin` uses `log.debug` on an infra path today; the arm exists so a future author who chooses `debug` for a noisy read is not forced into `error` by a guard.

### 5.3 Exemptions

`INFRA_EMIT_EXEMPTIONS` — a list of `{ file, line, reason }` entries — is **empty at merge**. It exists as the mechanism bl-orch's ruling names for a site whose repair would be a redesign rather than an emit. An entry names the site by file and the returned-message text (not by line number alone, which rots), and carries its reason on the same line.

### 5.4 The premise

A walker whose glob breaks finds zero sites and passes forever. The suite states its premise executably with `premise()` from `tests/_shared/premise.ts`: the walk must find more than 60 `infra_error` return sites across more than 10 files. Those floors sit below the measured 77 and 14 with room for ordinary churn, and far above zero. A premise failure reads "premise not met" and says explicitly that it is not a claim about the code under test.

A second premise guards the *classifier* rather than the walk: the propagation form must match at least one site, so a refactor that removes the last propagation site — or breaks the accept-set arm — is loud rather than silently permissive.

### 5.5 The positive control

The scanner's own unit suite feeds it source strings: a dark returned-error arm (reported), the same arm with a code-carrying `log.error` (satisfied), a `log.error` with no `code` property (reported — a SHOUTY message is not a code), a propagation guard (accepted), a `logAdminOutcome` call (satisfied), and a shape the accept-set does not model (reported). Every case is a string literal in the test file, so it is immune to both the disk and the module graph.

---

## 6. Deliverable C — the client wire projection

### 6.1 The module


<!-- spec-lint: ignore — this file is created by this spec's implementation and is not tracked yet -->
`lib/observe/describeClientValue.ts`, client-safe, importing exactly one thing:

```ts
import { serializeError } from "@/lib/log/serializeError";
export function describeClientValue(value: unknown): { message: string; detail: string };
```

`lib/log/serializeError.ts` has **no imports** — the file opens with a comment through `lib/log/serializeError.ts:12` and its first statement is `lib/log/serializeError.ts:14` — so importing it by its own path pulls in nothing else. Importing `@/lib/log` instead would pull the logger and the persist sink into the browser bundle, which is what `lib/observe/reportClientError.ts:1` forbids.

### 6.2 The projection

Let `s = serializeError(value)`, which is `string | Record<string, unknown> | unknown[]` (`lib/log/serializeError.ts:21`).

**`detail`** — the value's structure rendered as text:

- `s` is a string (every primitive, and any non-plain object whose `String()` form says more than `"[object Object]"`, per `serializeError.ts:97-103`) → `detail = s`.
- otherwise → `detail = JSON.stringify(s)`, and if that throws or returns `undefined`, `detail = ""`.

**`message`** — a string that must both read well and *discriminate*:

- `s` is a string → `message = s || "(no message)"`.
- `s` is an object or array → take its own `name`, `code` and `message` properties in that order, keep the ones that are non-empty strings, and join them with `": "`. If none survive, `message = detail` — the rendered structure, which is what makes two structurally different values produce two different dedup signatures.
- `message = "(no message)"` when the result is empty, matching the existing rule at `reportClientError.ts:12-13`.

Worked, from the done condition in §11: `{ code: "PGRST301", message: "planted" }` gives `message = "PGRST301: planted"` and `detail = '{"code":"PGRST301","message":"planted"}'`. `{ a: 1 }` and `{ b: 2 }` give `message = '{"a":1}'` and `'{"b":2}'` — different, so both reach the wire.

### 6.3 Guard conditions, every input

| input | `message` | `detail` |
| --- | --- | --- |
| `Error` | not routed here — `reportClientError` keeps its `Error` arm (§1.1 item 8) | — |
| plain object with `message` and `code` | `"<code>: <message>"` | JSON of the bounded structure |
| plain object with `name` only | `"<name>"` | JSON of the bounded structure |
| plain object with none of the three | JSON of the bounded structure | same JSON |
| `{}` | `"(no message)"` (`JSON.stringify({})` is `"{}"`, non-empty, so `message = "{}"`) | `"{}"` |
| array | JSON of the bounded array | same JSON |
| `null` | `"null"` | `"null"` |
| `undefined` | `"undefined"` | `"undefined"` |
| `""` | `"(no message)"` | `""` |
| `0`, `false` | `"0"`, `"false"` | `"0"`, `"false"` |
| `Map` / `Set` | `"[object Map]"` / `"[object Set]"` | same |
| a value whose serialization throws | `"[Unserializable]"` | `"[Unserializable]"` |

`Map` degrading to `"[object Map]"` is `serializeError` §4 limit 5, ratified 2026-08-16 and inherited by anything reusing the helper. It is a surfaced type name, not a silent loss, and §9 records it.

The `{}` row is worth reading twice: `JSON.stringify({})` is the two-character string `"{}"`, which is truthy, so `message` is `"{}"` and not `"(no message)"`. Two different empty objects still dedup to one wire POST, which is correct — they carry no distinguishing content.

### 6.4 How it rides the wire

**In `detail`, at the existing 500 cap. No new field, no `CAPS` change on either side.**

`clientErrorTransport` already accepts `detail?: string` (`lib/observe/clientErrorTransport.ts:27`) and caps it at `CAPS.detail` = 500 (`lib/observe/clientErrorTransport.ts:11`, `lib/observe/clientErrorTransport.ts:42`). The route already accepts, caps and persists it (`app/api/observe/client-error/route.ts:19`, `app/api/observe/client-error/route.ts:124`, `app/api/observe/client-error/route.ts:137`). `reportClientError` does not send `detail` today, so the field is free on the boundary path. Consequences, all of them good:

- No edit to either `CAPS` table, so §1.1 item 3 holds trivially.
- No new field on the route, so `tests/log/_metaMutationSurfaceObservability.test.ts` re-walks an unchanged file and `CLIENT_ERROR_MIRROR_RATE_CAPPED` at `app/api/observe/client-error/route.ts:106` is untouched. Invariant 10 needs nothing.
- Both wire sites — the boundary path and the rejection listener — land in the same field, so one `pnpm observe events --q` finds either.

`reportClientError`'s new shape:

```ts
function toWire(e: unknown): { message: string; stack?: string; detail?: string } {
  if (e instanceof Error) return { message: e.message || "(no message)", stack: e.stack };
  const { message, detail } = describeClientValue(e);
  return { message, ...(detail ? { detail } : {}) };
}
```

An empty `detail` is omitted rather than sent as `""`, matching the conditional-spread posture the file already uses at `lib/observe/reportClientError.ts:32-35` and the route's `cap()` at `app/api/observe/client-error/route.ts:51`, which treats an empty string as absent anyway.

### 6.5 Truncation: a plain slice, and it is a documented limit

`detail` is a JSON string that `clientErrorTransport.ts:42` slices to 500 characters. **A sliced JSON string is no longer JSON.** This arc keeps the plain slice and does not add a truncation marker.

The reason is not preference. The route independently re-caps `detail` at 500 with its own plain slice (`app/api/observe/client-error/route.ts:51`, `app/api/observe/client-error/route.ts:124`), so a marker the client appended at exactly 500 characters would be re-truncated server-side and would not survive end to end. Adding a marker would mean changing both caps in lockstep, which §1.1 item 3 fences. Every other field on this wire — `message`, `stack`, `code`, `componentStack` — is a plain slice, and one bespoke field would be the odd one out.

What an operator sees is a `detail` that starts with the value's own fields in JSON order and stops. `serializeError`'s own bounds (`KEYS_MAX` 32, `STR_MAX` 500, `NODES_MAX` 200) already keep most real payloads well under the cap; a PostgREST returned-error with `code`, `message`, `details` and `hint` renders in well under 500 characters. §9 records the limit against the module that owns it.

### 6.6 The second wire site

`components/observe/GlobalErrorListener.tsx:39-44`, non-`Error` arm only:

```ts
const onRejection = (event: PromiseRejectionEvent): void => {
  const reason = event.reason;
  const detail = (
    reason instanceof Error
      ? reason.message
      : reason == null
        ? ""
        : describeClientValue(reason).detail
  ).slice(0, DETAIL_CAP);
  ...
};
```

Three behaviors preserved exactly: an `Error` reason still yields `reason.message`; `null` and `undefined` still yield `""` (the current `?? ""`, kept as an explicit `== null` branch so the projection's `"null"` string never surfaces where an empty string does today); and the existing string-reason test at `tests/observe/globalErrorListener.test.tsx:42-53` passes unchanged, because `serializeError` on a string returns that string.

`DETAIL_CAP` stays 300 (`GlobalErrorListener.tsx:7`). Its cap is the listener's own and is stricter than the wire's 500; nothing about it changes. The window-error handler at `components/observe/GlobalErrorListener.tsx:27-37` is untouched — its detail is `filename:lineno`, which is already structural.

---

## 7. Tests

### 7.1 What is red before implementation, and what is a regression pin

Invariant 1 requires the distinction be stated, because a test that passes on the day it is written is not a red.

**Red first, fails before the implementation exists:**

- The `errorOn: "from"` row of §4.3's table asserting `SHOW_CHANGE_LOG_READ_RETURNED_ERROR` — there is no emit at that site today.
- The `errorOn: "rpc"` row's `context.error` object assertion — today `context.error` is the string from `.message`.
- Every `describeClientValue` case in §6.3 — the module does not exist.
- The `reportClientError` non-`Error` cases in §7.3 — today they all produce `"[object Object]"`.
- The plain-object-reason case beside `tests/observe/globalErrorListener.test.tsx:42-53`.
- `_metaInfraEmitCover` against the unrepaired tree — 65 reported sites.

**Regression pins, green on day one:**

- The four #882 rows of §4.3's table. They pin merged behavior that nothing currently asserts. The `afterAll` set-equality is what makes them more than decoration.
- The scanner's positive-control cases in §5.5 that assert *satisfied* and *accepted*.

### 7.2 Anti-tautology

- Expected codes in §4.3 come from the declared table, and the `afterAll` set-equality means a row that silently stops running fails the suite. An assertion that only proved "some emit happened" would pass against the wrong code; the row names the code.
- The `context.error` assertion reads the PostgREST `code` value from the fixture constant. A hardcoded `"42501"` would pass against a fake that stopped supplying it.
- `describeClientValue` expectations are derived from the fixture object: the test builds `{ code, message }` from local constants and asserts `message === \`${code}: ${message}\``, so a projection that dropped one field fails. No rendered string is written as a literal.
- The two-distinct-objects test asserts `fetch` was called **twice** and that the two bodies' `message` values differ, not merely that both are non-`"[object Object]"`. A projection that returned a constant non-empty string would satisfy the weaker form and fail this one.
- The detail-cap test asserts exact byte length against `CAPS.detail` read from the transport's behavior (a 5000-character field forced through), not against the literal 500 written twice.
- The scanner suite feeds source strings, never the disk, so it cannot pass because the repo happens to be clean.

### 7.3 `tests/observe/reportClientError.test.ts` additions

Five non-`Error` cases, none of which exists today (every case in that file constructs an `Error`): a plain object with `message` and `code`; a plain object with neither; a string; `null`; a `Map`. Each asserts the wire `message` is not `"[object Object]"` and asserts `detail` against the projection derived from the same fixture. Plus the two-POST discrimination test of §7.2 and an exact-bytes cap test.

### 7.4 Suites touched


<!-- spec-lint: ignore — this file is created by this spec's implementation and is not tracked yet -->
`tests/admin/loadRecentAutoApplied.test.ts`, `tests/admin/_metaInfraEmitCover.test.ts` (new), `tests/admin/infraEmitScan.test.ts` (new), `tests/observe/describeClientValue.test.ts` (new), `tests/observe/reportClientError.test.ts`, `tests/observe/globalErrorListener.test.tsx`, `tests/log/_auditableMutations.ts` (registry edit). Every `lib/admin` file the sweep touches keeps its existing suite; the sweep changes no return value, so no existing behavioral assertion moves.

---

## 8. Mutation scoring

`lib/log/serializeError.ts` **is not modified by this arc.** It is reused by import. `serializeErrorStructure` (`tests/mutation/source/registry.ts:3293-3313` — `scoreFloor: 0.95` at `tests/mutation/source/registry.ts:3305`, `accepted: []` at `tests/mutation/source/registry.ts:3312`) therefore needs no re-score, and this arc takes no `mutation` class lock.


<!-- spec-lint: ignore — this file is created by this spec's implementation and is not tracked yet -->
Nothing else in the diff is an enrolled surface: nothing under `lib/observe/` or `lib/admin/` appears in the registry. `lib/observe/describeClientValue.ts` is product code pinned by its own suite, not a guard surface. `tests/admin/infraEmitScan.ts` is a guard the registry could express, and it is authored in the enrollable shape (§5.1) so a later arc can enroll it without restructuring; enrolling it here would mean a fleet-wide class lock for a scanner whose positive-control suite already covers its six branches, and the enrolment decision belongs to whoever needs the score.

The round-1 diff brief states this in one line and carries no `GUARD SURFACE:` line.

---

## 9. Documented limits

Each is recorded on the surface that owns it, per Eric's directive. None becomes a ledger row.


<!-- spec-lint: ignore — this file is created by this spec's implementation and is not tracked yet -->
1. **`serializeError` §4 limit 5 travels with the helper.** A `Map`, `Set`, or any object with no own enumerable keys and no informative `String()` form degrades to its type name (`"[object Map]"`). Ratified 2026-08-16; a surfaced type name is not a silent loss. Recorded in the header of `lib/observe/describeClientValue.ts`.


<!-- spec-lint: ignore — this file is created by this spec's implementation and is not tracked yet -->
2. **A truncated `detail` is not parseable JSON.** §6.5 has the reasoning. Recorded in the header of `lib/observe/describeClientValue.ts` beside the cap it describes.

3. **`noDoubleSerializedLogError` does not see `.message`.** `tests/log/noDoubleSerializedLogError.test.ts:12-13` bans `String(e)` and `JSON.stringify(e)` in an `error:` initializer; `error: error.message` passes it while discarding exactly the fields the guard exists to preserve. §4.2 repairs the one live instance. Recorded as that guard's documented limit in its own header, with the re-run trigger: `grep -rn 'error: [a-zA-Z_]*\.message' lib/ app/`.


<!-- spec-lint: ignore — this file is created by this spec's implementation and is not tracked yet -->
4. **The cover is `lib/admin/**` and stops there.** Measured 2026-08-26: 165 raw `kind: "infra_error"` matches across 41 files outside `lib/admin/`, concentrated in `lib/notify/`, `lib/observe/query/`, `lib/appSettings/` and `lib/adminAlerts/`. The arc's PROBE DOMAIN fences the sweep to `lib/admin/**`, and `lib/sync/` already has its own emit guard (`tests/log/_metaAdminOutcomeContract.test.ts:59-73`, the `SYNC_INFRA_ERROR` window scan). Recorded in the header of `tests/admin/_metaInfraEmitCover.test.ts`, with the re-run trigger: point the scanner's root at another directory. The scanner takes its root as an argument precisely so that is a one-line change and not a rewrite.

5. **`context`-only `clientLog` callers are outside the wire.** `ShowRealtimeBridge.tsx:503`, `components/realtime/ShowRealtimeBridge.tsx:755`, `components/realtime/ShowRealtimeBridge.tsx:786`, `components/realtime/ShowRealtimeBridge.tsx:821` and `DevCaptureControl.tsx:126` pass their value as `context`, which `lib/observe/clientLog.ts:17-18` never mirrors. They cannot produce an `"[object Object]"` in `app_events` because they produce nothing in `app_events`. Recorded in row 2's archive entry.


<!-- spec-lint: ignore — this file is created by this spec's implementation and is not tracked yet -->
6. **The walker classifies syntax, not semantics.** A code-carrying emit anywhere in the guard scope satisfies it, including one that runs on a different branch within the same scope, and an emit reached through a helper function is not seen. The threat fence is an ordinary contributor adding a loader branch, not an author routing around a guard. Recorded in the header of `tests/admin/infraEmitScan.ts`.

---

## 10. Invariants

| invariant | disposition |
| --- | --- |
| **1** TDD per task | §7.1 states which assertions are red-first and which are regression pins. |
| **2** advisory lock | N/A — every surface here is a read or a client-side wire. No mutation of `shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, `pending_ingestions`. |
| **3** email canonicalization | N/A — no email boundary. |
| **4** no global cursor | N/A. |
| **5** no raw error codes in UI | Held and unchanged. `RecentAutoAppliedStrip.tsx:726-729` renders a fixed sentence with no code, and no returned `message` changes. Every code this arc adds lives inside a `log.*` span and is stripped before the producer scan (`stripLogEmissionCalls.ts:4-11`). No §12.4 row, no `gen:spec-codes`, no `catalog.ts` edit. |
| **6** commit per task | Conventional commits, one per plan task. |
| **7** spec is canonical | No amendment proposed. |
| **8** impeccable gate | §12. |
| **9** Supabase call-boundary discipline | The loader already destructures `{ data, error }` at every await and is registered at `tests/admin/_metaInfraContract.test.ts` (`loadRecentAutoApplied` row) and `tests/admin/_metaBoundedReads.test.ts:40`. Every file the sweep touches is checked for an existing `infraRegistry` row; a swept file without one gets its row in the same commit. The client wire files touch no Supabase client. The route uses `log` only. |
| **10** mutation-surface observability | `app/api/observe/client-error/route.ts` is unchanged (§6.4) and keeps `CLIENT_ERROR_MIRROR_RATE_CAPPED` at `app/api/observe/client-error/route.ts:106`. The loader and every swept `lib/admin` file is a read, not a mutation surface. |
| **11** worktree | `../FX-worktrees/observetelemetry` off the `origin/main` containing #899 (`df130e0a9`). |
| **12** ledger claims | Both rows marked `IN PROGRESS · Branch: fix/observe-error-telemetry`, pushed at Stage 0; markers removed in the PR's last commit. |

---

## 11. Done condition

Three numbers off `pnpm observe events` on the local stack, measured before and after, quoted in the readiness message. Default `--env local`; never `--env validation`.

**1. The loader fault appears in `app_events`.** Induce a sub-500 returned error on the `show_change_log` read without touching the shared local database: start the dev server with the service-role key replaced by the anon key — the factory reads `process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY` at `lib/supabase/server.ts:145`, and `show_change_log` is REVOKEd from `anon` (`lib/admin/loadRecentAutoApplied.ts:10-13`) — load `/admin/needs-attention`, then:

```
pnpm observe events --source admin.recentAutoApplied --since 1h
```

Before: **0** rows for the `show_change_log` read. After: **1** row carrying `SHOW_CHANGE_LOG_READ_RETURNED_ERROR`, whose `context.error` shows the PostgREST `code` field rather than a bare message. The env override is shell-scoped; `.env.local` is a symlink every worktree shares and is never edited.

**2. No client crash persists as `"[object Object]"`.** From a browser console on any crew page, `Promise.reject({ code: "PGRST301", message: "planted" })`, then:

```
pnpm observe events --source client.root --code CLIENT_UNHANDLED_REJECTION --since 1h
pnpm observe events --q '[object Object]' --since 24h
```

Before: `detail` is `[object Object]`. After: `detail` carries `planted` and `PGRST301`, and the literal query returns **0** rows.

**3. Two distinct plain-object crashes produce two rows.** Rejected back to back in one page session:

```
pnpm observe events --source client.crew --since 1h
```

Before **1** row (the dedup at `clientErrorTransport.ts:33-34` admitted one), after **2**.

Plus: the app-e2e job log still carries `SUPABASE_UPSTREAM_FAULT` lines on a forced 502. #899's capture step is unaffected — the loader emit sits beside it, not in place of it.

`pnpm observe events` filters are equality on `--source` and `--code` (`lib/observe/query/events.ts:83-85`) and `ilike` on `message` for `--q` (`lib/observe/query/events.ts:93`).

---

## 12. Close-out

**`impeccable-gate: N/A — no UI surface`**, under bl-orch's ruling (b) of 2026-08-26 09:27 CDT.

The proof the ruling requires: `components/observe/GlobalErrorListener.tsx` is declared `: null` (`components/observe/GlobalErrorListener.tsx:22`) and has exactly one `return` reachable from its body, `return null` at `components/observe/GlobalErrorListener.tsx:65`. The only other return in the file is the effect's cleanup function at `components/observe/GlobalErrorListener.tsx:58-62`, which returns nothing and is not a render path. The component paints nothing on every branch because it has one branch.

The marker line is confirmed against `tests/docs/_metaInvariant8Closeout.test.ts` before it is relied on. If that grammar rejects the N/A form for a `components/` touch, the dual gate runs on the diff instead and its (empty) findings are recorded — the marker grammar is not bent.

Twelve required checks by name: `quality`, `unit-suite`, `x1-catalog-parity`, `x2-no-raw-codes`, `x3-trust-domain`, `x4-no-global-cursor`, `x5-email-canonicalization`, `x6-pg-cron-pivot`, `validation-schema-parity`, `affordance-matrix-parity`, `postgrest-dml-lockdown`, `traceability-audit`. `mutation-harness` is not required and, per §8, is not run.

No migration, so no `supabase db push`, no `gen:schema-manifest`, no validation-project apply.

Both rows graduate to `BACKLOG-archive.md`. Row 1's entry records that #882 repaired four of five sites the day after filing (`d9a039a94`, `17357a05c`), names the fifth, states the level argument of §2 that makes the loader emit non-redundant with #899's observer, and records the §3.3 sweep decision with its derived count and the derivation. Row 2's entry records both wire sites, the signature defect the row did not name, the §6.2 projection, and limit 5 of §9. The carry-forward sentence at `BACKLOG-archive.md:2373` is left as the history it is.
