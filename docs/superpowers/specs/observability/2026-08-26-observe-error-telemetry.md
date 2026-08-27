<!-- spec-lint: not-ui — waives the Dimensional Invariants and Transition Inventory sections only. The one components/ file, GlobalErrorListener.tsx, is declared `: null` with one render return, so there is no fixed-dimension parent, no flex or grid child, and no visual state pair to inventory. This is NOT an invariant-8 exemption: the impeccable dual gate runs on that file, per §12. -->

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

**The two defects need two repairs, and an earlier draft of this spec claimed one would do.** Fixing the message does not fix the signature, for two independent reasons. A label built from an object's `name`/`code`/`message` collides across ordinary values (§6.2), and the rejection listener does not send a value-derived message at all — its message is the fixed string `"unhandled promise rejection"` (`components/observe/GlobalErrorListener.tsx:48`), which no projection can make discriminating. So §6.2 makes `message` legible and §6.4 makes the *signature* discriminating by giving it `detail`.

### 1.4 The same shape at two more wire sites the row does not name

`components/observe/GlobalErrorListener.tsx:41-44` derives the `CLIENT_UNHANDLED_REJECTION` detail as `String(reason instanceof Error ? reason.message : (reason ?? ""))`. A promise rejected with a plain object persists `detail: "[object Object]"`. `tests/observe/globalErrorListener.test.tsx:42-53` pins only a string reason, so nothing catches it.

The same component's window-error handler is a third site and fails differently: `components/observe/GlobalErrorListener.tsx:27-37` never reads `event.error` at all, so a non-`Error` window throw does not collapse to `"[object Object]"` — its fields are simply absent. §6.7 has both.

Class-sweep applies at round 1. All three wire-reaching sites are repaired here.

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

**The population is what the code CONSTRUCTS as an `infra_error`, and that is a semantic question, not a syntactic one.** An earlier draft of this spec keyed it on `return` statements whose argument is an object literal. That rule looks complete and is not: three files in the cover return a module-level constant instead, and all 23 of those sites were invisible to it.

```
lib/admin/driveConnectionHealth.ts:95   const INFRA_ERROR: DriveConnectionHealth = { kind: "infra_error" };   15 returns
lib/admin/loadAlertSummary.ts:7         const FAIL = { kind: "infra_error" } as const;                         4 returns
lib/admin/loadTelemetryStats.ts:6       const FAIL = { kind: "infra_error", message: "..." } as const;         4 returns
```

The repair is not another syntactic case. It is to ask the TypeScript checker: a site is a return whose expression is an object literal carrying `kind: "infra_error"`, **or** an identifier whose symbol resolves to a variable declaration whose initializer is such a literal. Anything else whose type mentions an `infra_error` member and which the resolver cannot classify is **reported**, not skipped — so `return makeFail()` or a shape nobody has written yet surfaces on the day it lands instead of joining a silent tail.

**A type-mention test alone over-collects, which is why the rule says "constructs".** `lib/admin/driveConnectionHealth.ts` has a local `warn(...)` helper declared to return the whole `DriveConnectionHealth` union (`lib/admin/driveConnectionHealth.ts:298-305`); eleven returns call it. Its body constructs `{ health: "warn", ... }` and never the infra arm (`lib/admin/driveConnectionHealth.ts:306-307`), so a type-mention rule reports eleven sites that cannot produce the fault. A call-produced value is judged by the propagation rule (§3.4), never by the construction rule.

Measured 2026-08-26 on `26b99c4c0`, with the raw grep the row itself used for contrast:

```
grep -rl 'kind: "infra_error"' lib/admin --include='*.ts' | grep -v '\.test\.'   # 20 files
grep -rn 'kind: "infra_error"' lib/admin --include='*.ts' | grep -v '\.test\.' | wc -l   # 105 matches
```

Neither figure is the population: the grep counts type-union members and misses every `return FAIL`. The checker-backed walk gives:

| | count |
| --- | ---: |
| constructions (the population) | 100 |
| — of them, object literals | 77 |
| — of them, const aliases | 23 |
| files holding at least one | 19 |
| files parsed | 61 |
| already satisfied (code **and** whole `error`) | 9 |
| exempt as propagation | 4 |
| **reported, and repaired by this PR** | **87** |

The nine satisfied sites are `lib/admin/loadAppEvents.ts:64` and `lib/admin/loadAppEvents.ts:82`, `lib/admin/loadCronHealth.ts:58` and `lib/admin/loadCronHealth.ts:69`, `lib/admin/loadAlertSummary.ts:54`, `lib/admin/loadTelemetryStats.ts:57`, and three of the four #882 emits in the loader.

**The fourth #882 emit is reported, and that is the predicate proving itself.** `lib/admin/loadRecentAutoApplied.ts:249` carries a code but passes `error: error.message` (§4.2), so it fails the whole-fault half of the bound. The walker finds it without being told about it, which is the difference between a guard and a checklist.

Every count in this table is a measurement dated to the day, not a pinned contract. The walker's output at implementation time is the number that governs; §7 states no count as an expected constant.

### 3.3 The sweep decision, and which way it went

**Every reported site is repaired in this PR: 87 of the 100.** Nine already satisfy the bound and four are exempt by shape (§3.4).

bl-orch ruled the whole derived cover on 2026-08-26 (09:27 CDT, pane `wP:p1A`): the walker comes first, then every site it finds is repaired, and only a site whose repair is a *redesign* rather than an emit is deferred. That ruling was made against a raw file count of 20 and was reconfirmed at 65; the checker-backed derivation then raised the figure to 87, which was reported before this round's review. The ruling's logic survives the change unaltered, because it turns on the shape of the repair rather than its multiplicity: one `log.error` per site, no control-flow change, no new dependency, and a returned result that is byte-identical before and after. The only difference at any of the 87 is a row in `app_events`.

Exception (c) — "the repair is a redesign, or spans enough sites to blow the review scope" — is not invoked. **No site is deferred.** The walker's exemption list is empty at merge, and it is fail-closed: a new `lib/admin` file with a dark site fails on the day it lands.

### 3.4 Why propagation sites must NOT emit

Four sites re-return an `infra_error` that arrived in a callee:

- `lib/admin/bellFeed.ts:256` — `if (pipeline.kind === "infra_error") return { kind: "infra_error" }`
- `lib/admin/bellFeed.ts:348` — the same guard on the count entry point
- `lib/admin/loadNeedsAttention.ts:307` — `if (holdsResult.kind === "infra_error")` re-wrapping with the callee's message
- `lib/admin/needsAttentionCount.ts:90` — `if (holds.kind === "infra_error") return { kind: "infra_error" }`

Emitting here would write a second `app_events` row for one fault, and an operator counting rows would over-count. The rule at `loadRecentAutoApplied.ts:241-243` is "recorded where it arrives", and these are not arrivals.

**The exemption is narrower than "the guard tests `.kind === \"infra_error\"`", because that rule accepts two things it must not.**

First, it must accept only a return in the **consequent**. A return in the `else` arm of that same test is a locally created fault, not a propagated one:

```ts
if (sub.kind === "infra_error") {
  return { kind: "ok" };
} else {
  return { kind: "infra_error" }; // dark, and nothing propagated it
}
```

Second, the producer must resolve into the cover. Two of the four sites read `await (opts.loadHolds ?? loadOpenIdentityHolds)()` (`lib/admin/loadNeedsAttention.ts:305`, `lib/admin/needsAttentionCount.ts:89`), so the callee is an injection seam, not a fixed import. The exemption therefore accepts a producer that is a call to an imported identifier inside the cover, **or** a `??` fallback whose right operand is such an identifier — the arm production always takes. `loadOpenIdentityHolds` (`lib/admin/identityHolds.ts`) and `runBellPipeline` (`lib/admin/bellFeed.ts`) are both inside the cover, so every production propagation records at its arrival.

The injected arm is a test seam and nothing else: `grep -rn 'loadHolds' --include='*.ts' .` outside those two modules returns only `tests/admin/needsAttentionCount.test.ts` and `tests/admin/loadNeedsAttention.test.ts`. A test double that returns `infra_error` without emitting is not an unobserved fault, because it is not a fault. §9 records it as a limit rather than pretending the walker proves something about it.

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

Repaired in-branch by passing `error` itself, whose type is the PostgREST error object rather than a `string` — the condition §5.4's predicate states. The pre-flatten guard at `tests/log/noDoubleSerializedLogError.test.ts:12-13` bans `String(e)` and `JSON.stringify(e)` in an `error:` initializer and does not see `.message`; §9 records that as that guard's documented limit rather than widening it under review pressure.

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

Coverage is **derived**, in the shape of `tests/auth/_metaInfraContract.test.ts:62-76` and its `afterAll` set-equality at `tests/auth/_metaInfraContract.test.ts:216-218`: each row records itself in a covered set as it runs, and an `afterAll` asserts that set equals the declared code set.

**What that set-equality does and does not catch, stated precisely, because the obvious claim is false.** It catches a declared row that stops running — a renamed code, a deleted case, a tap that no longer fires. It does **not** catch a sixth return site added to the loader, because that site is not in the declared set and nothing in this table walks production source. The auth precedent has the same boundary: its comment at `tests/auth/_metaInfraContract.test.ts:67-69` says a producer added to `INFRA_PRODUCERS` without a matching `assertEmits` breaks the equality, which is a claim about the declared list, not about `lib/auth/**`.

The thing that catches a sixth return site is the walker in §5, which reads `lib/admin/**` from disk. The two guards are complementary and neither substitutes for the other: the walker proves every site has an emit, the table proves the five named emits carry the code and the payload they claim.

The sink is `setLogSink` from `@/lib/log`, so the assertion reads the record *after* `buildRecord` has run `serializeError` on the `error` field (`lib/log/logger.ts:38`). That is what makes the next assertion possible.

**The assertion that catches a `.message` regression.** For both `errorOn` rows, the fake's error object carries a PostgREST `code` (the existing fake returns `{ message: "SIMULATED ... error" }` at `tests/admin/loadRecentAutoApplied.test.ts:78-81` and `tests/admin/loadRecentAutoApplied.test.ts:109`; it gains a `code` and a `details` field), and the test asserts `record.context.error` is an object carrying that `code` value read from the fixture. Passing `.message` makes `context.error` a string and the assertion fails. The expected value is read from the fixture constant, never written as a literal in the assertion.

### 4.4 `NEW_FORENSIC_CODES`

All five loader codes plus every code the §3.3 sweep introduces get a row in `NEW_FORENSIC_CODES` (`tests/log/_auditableMutations.ts:601`), in one edit with one comment block naming this arc. The set is consumed by the leak check at `tests/log/_metaAdminOutcomeContract.test.ts:87-91`, which asserts none of them ever appears in the §12.4 producer set. Registration is the assertion "this code must never become a catalog row"; omission is invisible, which is why the registration is explicit.

---

## 5. Deliverable B — the walker

### 5.1 Shape, and why this shape

Two layers, because the walker asks two different kinds of question.


<!-- spec-lint: ignore — this file is created by this spec's implementation and is not tracked yet -->
**`tests/admin/infraEmitScan.ts`** — the syntactic core. Pure functions over a parsed source file: guard-scope resolution, the emit predicate, and the shape tests. Every one of them is a function of text, so the positive control in §5.7 drives them with string literals and never touches the disk.


<!-- spec-lint: ignore — this file is created by this spec's implementation and is not tracked yet -->
**`tests/admin/_metaInfraEmitCover.test.ts`** — the resolving layer. It builds a `ts.Program` over `lib/admin/**` and supplies the two answers the syntax cannot give: does this identifier resolve to a construction, and does this callee's declaration live inside the cover. Then it applies the core to every site.

The split follows `tests/cross-cutting/replacementString/scan.ts:1-16`, which states the reason: the mutation overlay rewrites the module graph, so a check that reads its subject with `readFileSync` inside the assertion would read unmutated bytes and pass unconditionally.

**The honest limit of that precedent here.** The resolving layer needs a whole-program checker, so it cannot be a pure function of one source string. §8's enrollability claim therefore covers the core only; the resolving layer is pinned by the premises in §5.4, which compare it against two independent derivations rather than by mutation score. Saying the whole scanner is enrollable would be the symbolic-enrolment mistake `docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md` §1.1.4 records.

Walking the filesystem rather than reading a registry is what makes a new `lib/admin` file **fail by default** instead of being silently exempt.

### 5.2 Accept-set, keyed on structure and on symbol

For every `return` statement in every `.ts`/`.tsx` file under `lib/admin/**` that is not a `.test.` file:

**In the population** if the returned expression, with `()`/`as`/`satisfies` wrappers stripped, is either

- an object literal with a `kind` property initialized to the string literal `"infra_error"`, or
- an identifier whose symbol resolves to a variable declaration whose initializer is such an object literal.

A returned expression that is neither, but whose type mentions an `infra_error` member, is **reported as unclassifiable** unless the propagation form below accepts it. A construction the resolver cannot see is a report, never a skip.

**Guard scope.** Walking outward from the return to the first of: an `if` consequent, an `if` alternate, a `catch` clause body, or the enclosing function body.

**Accepted — one form, the propagation form:**

- The return is in the **consequent** of an `if` whose test is a strict equality between a property access ending in `.kind` and `"infra_error"`, **and** the object that property is read from is bound from a call whose callee symbol's declaration lives inside `lib/admin/**`.

  Both halves are load-bearing, and each was wrong in an earlier draft. Without the consequent requirement the `else` arm is exempted while creating the fault locally. And "inside the cover" must be resolved from the callee's **declaration file**, not from whether the name was imported: `runBellPipeline` is a local function in `lib/admin/bellFeed.ts:191`, so an imported-only rule reported the two sites at `lib/admin/bellFeed.ts:256` and `lib/admin/bellFeed.ts:348` that §3.4 requires be exempt. The `??` form is covered by the same resolution — `await (opts.loadHolds ?? loadOpenIdentityHolds)()` resolves through the right operand, the arm production always takes.

**Satisfied (emit present):** the scope contains, lexically before the return and not inside a nested function body, a call to `log.error` / `log.warn` / `log.info` / `log.debug` one of whose arguments is an object literal carrying **both**:

- a `code` property, and
- an `error` property whose expression's **type is an object type** — every constituent of it, if a union — and which is not absent. Scalars (`string`, `number`, `boolean`, `bigint`, `symbol`, `null`, `undefined`, `void`, `never`, enums) and callables are rejected; `unknown` is accepted, because a `catch` binding is the whole thrown value.

**Everything else is reported by name** — file, line, and the reason it was reported.

### 5.3 Why `logAdminOutcome` is not a sink here, and the code-only hole it would reopen

An earlier draft accepted a preceding `logAdminOutcome(...)` call without inspecting its arguments. That is the code-only predicate wearing a different name: a contributor writes a categorised admin event with no fault payload and the guard reports green, which is exactly the escape the `error` clause above exists to close.

The clause is dropped rather than extended, because extending it would mean modelling a second call signature to close a hole that has no live instance. `grep -rn 'logAdminOutcome' lib/admin --include='*.ts'` returns one line, and it is a comment (`lib/admin/attentionItems.ts:360`). No `lib/admin` read calls it, and these surfaces are reads — `logAdminOutcome` is the admin-mutation sink (invariant 10). A guard that models a sink its cover never uses is surface for the next round to attack.

If a `lib/admin` read ever does need `logAdminOutcome`, the walker reports it and the author adds the arm with the payload requirement attached. Reporting an unmodelled sink is the correct failure direction.

### 5.4 The `error` clause asks the type system, and what it can honestly prove

A predicate that asks only for `code` accepts both of these:

```
flattened   code present, error: error.message   -> payload discarded
codeOnly    code present, no error field         -> payload never captured
```

The first is live at `lib/admin/loadRecentAutoApplied.ts:247` and at three more sites in the cover (§9 limit 3). The second is what an author writes when they add a code and forget the payload. Both leave the operator with a categorised event and no `code`/`details`/`hint`.

**Two earlier drafts narrowed this the wrong way, and each left a hole one line wide.** The first required `error` to be a bare identifier — but `const error = raw.message` is a bare identifier. The second required its type not to be `string` — but `error: raw.status` is a number, and sails through. Rejecting `.message`, then `String(...)`, then a destructured binding, then a status code is a case per round, which is the widening this repo's round-economy rules exist to refuse.

**The rule is the type CATEGORY, not a list of rejected members: the payload must be an object.** A fault worth recording is a structure; every way of flattening one — a member access, a `String()` call, a template, a destructured field, a status code, a boolean flag — produces a scalar, whatever the spelling. One question closes the whole family, and a scalar type nobody has thought of is rejected by the same rule rather than needing a new clause.

Measured at `docs/superpowers/specs/observability/probes/2026-08-26-emit-payload-predicate.ts` over seventeen fixtures — two whole forms, fourteen flattenings, and one absent field:

```
node --import tsx docs/superpowers/specs/observability/probes/2026-08-26-emit-payload-predicate.ts
...
string-only predicate wrong on 13/17; object-rule predicate wrong on 1/17
```

**What the predicate proves, stated honestly, because "whole fault" overstates it.** It proves the payload is an object rather than a scalar. It cannot prove the object is the *entire* fault: `error: { message: raw.message }` is a reconstructed partial, it is an object, and no static rule distinguishes it from the real thing. That is the one fixture the object rule still gets wrong, it is in the probe under its own name, and §9 limit 11 records it. Under the threat fence — an ordinary contributor adding a loader branch — reconstructing a partial object by hand is not a mistake anyone makes by accident; flattening to `.message` is, and that is closed.

This is why the resolving layer exists (§5.1): the question needs a checker, and the syntactic core cannot answer it alone.

### 5.5 Exemptions

`INFRA_EMIT_EXEMPTIONS` — a list of `{ file, message, reason }` entries — is **empty at merge**. It exists as the mechanism bl-orch's ruling names for a site whose repair would be a redesign rather than an emit. An entry names the site by file and by the returned-message text rather than by line number, which rots.

### 5.6 The premises

A walker whose reach breaks finds nothing and passes forever. The suite states its premises executably with `premise()` and `premiseHolds()` from `tests/_shared/premise.ts`.

**Two earlier drafts of this section were both too weak, in the same direction, and it is worth saying how.** The first put a floor on the number of findings; drop `lib/admin/identityHolds.ts` from discovery and the count still cleared it while four live returns vanished. The second put set equality on the files *parsed*; that proves the walk opened every file and says nothing about whether the resolving layer ever handed a site to the core. If the resolver silently produced no sites, the core's string tests stay green, every file-level premise stays true, and `_metaInfraEmitCover` reports an empty finding set — a clean pass over a population of zero, which is precisely the failure this section exists to prevent.

A premise on reach must therefore be a premise on the **population the core was given**, not on the files the walk opened. Four, each checked against something the resolving layer does not compute:

1. **The population is non-empty and covers the files that textually hold a construction.** An independent `readFileSync` scan finds every `lib/admin/**` file whose text contains both `kind: "infra_error"` and the word `return`. Every such file must contribute at least one site to the population. A resolver that stops emitting sites fails here on the first file, and the failure names it.
2. **Both construction shapes are witnessed.** The population must contain at least one `literal` site and at least one `const-alias` site. These are the two arms of the construction rule, and the const-alias arm is the one that resolves through a symbol — the arm that goes quiet if the checker stops answering. This is a claim about the classifier's arms, not a list of files: whichever site happens to carry the shape satisfies it.
3. **Both classification arms are witnessed.** At least one site classified `exempt-propagation`, and at least one classified `satisfied`. The first exercises the callee resolution, the second the type-based emit predicate. A checker that silently fails to resolve turns every site into an unclassifiable report rather than a false pass, but a `satisfied` witness proves it is answering rather than erroring.
4. **The program built.** `program.getSourceFile()` returned non-null for every path handed in, and `getTypeChecker()` answered a type query. Stated separately from 2 and 3 so a wholesale program failure reads as "premise not met" rather than as 100 real findings.

Premise 1 is the one that closes the zero-population hole, because it is the only one whose evidence is derived from file *text* rather than from the resolver's own output. Premises 2 and 3 close the narrower version where the resolver works for one shape and not the other.

A premise failure reads "premise not met" and says explicitly that it is not a claim about the code under test.

### 5.7 The positive control

The core's own suite feeds it source strings. Every case is a string literal in the test file, so it is immune to both the disk and the module graph. Eighteen cases, of which fourteen expect a report:

| case | expected |
| --- | --- |
| dark returned-error arm | reported |
| `log.error` with a message but no `code` | reported — a SHOUTY message is not a code |
| `log.error({ code, error: error.message })` | reported — the flattened payload |
| `const error = raw.message` then `log.error({ code, error })` | reported — a bare identifier of scalar type |
| `const error = String(raw)` | reported — same rule, different spelling |
| `const { message: error } = raw` | reported — a destructured scalar |
| ``const error = `${raw.code}` `` | reported — a template literal is a string |
| `log.error({ code, error: raw.status })` | reported — a number is a scalar |
| `const error = raw` then `log.error({ code, error })` | satisfied — the alias is the object |
| `log.error({ code })` with no `error` field | reported — categorised but empty |
| emit lexically **after** the return | reported — unreachable |
| emit inside a nested closure in the scope | reported — does not run on this path |
| propagation guard, return in the **`else`** arm | reported — locally created |
| propagation guard, callee resolves outside the cover | reported |
| `logAdminOutcome(...)` before the return | reported — not a sink here (§5.3) |
| `log.error({ code, error })` before the return | satisfied |
| propagation guard, consequent, callee inside the cover | accepted |
| propagation guard, consequent, `opts.x ?? coverFn` callee | accepted |

Fourteen of eighteen assert a *report*. That ratio is the point: the accept-set is two forms and everything else is named. The cases that need symbol or type resolution are driven through a stub resolver the core takes as a parameter, so the core stays a function of text and the resolving layer is exercised separately by §5.6's premises. They mirror fixtures in `docs/superpowers/specs/observability/probes/2026-08-26-emit-payload-predicate.ts`, where the same predicate runs against a real checker over all seventeen forms.

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

**`detail`** — the value rendered as text, **tagged with its runtime type when the rendering alone is ambiguous**:

- `s` is an object or array (a structure) → `detail = render(s)`; if that throws, `detail = ""`. No tag: a rendered structure starts with `{` or `[` and cannot be confused with a tagged primitive.

  `render` is a small recursive writer, **not `JSON.stringify`**, and not a second serializer: it formats `serializeError`'s already-bounded output rather than deciding what to capture. Strings are quoted, arrays and objects bracket their rendered members, and **every other leaf goes through `String()`**. That one rule at every leaf is the whole of it.

  The reason it cannot be `JSON.stringify` is that JSON's number grammar has no `NaN` and no infinities, so it writes all three as `null` — destroying distinctions `serializeError` deliberately preserved one layer up. `{ a: NaN }` and `{ a: null }` become the same text, and the second crash is dropped. `String()` writes `NaN`, `Infinity` and `-Infinity` as themselves.
- otherwise (`s` is a string, which is every primitive and every object `serializeError` degraded to its `String()` form) → `detail` is the tag, a space, then `s` — `` `${tag(value)} ${s}` ``.

`tag(value)` is derived from the runtime, never enumerated: `typeof value`, except that `null` tags as `"null"` and an object tags as its constructor name when it has one. Deriving rather than listing is what makes the rule closable — a type nobody has thought of gets its own tag rather than falling into a default that collides.

**Why the tag exists, and it is not hypothetical.** Without it, `serializeError`'s `String()`-for-primitives rule (ratified, §1.1 item 2) maps structurally different ordinary values onto identical text. Measured against the live helper:

| pair | untagged `detail` | tagged |
| --- | --- | --- |
| `0` / `"0"` | `0` / `0` | `number 0` / `string 0` |
| `false` / `"false"` | `false` / `false` | `boolean false` / `string false` |
| `null` / `"null"` | `null` / `null` | `null null` / `string null` |
| `1n` / `1` | `1` / `1` | `bigint 1` / `number 1` |
| `NaN` / `"NaN"` | `NaN` / `NaN` | `number NaN` / `string NaN` |
| `Symbol("x")` / `"Symbol(x)"` | `Symbol(x)` / `Symbol(x)` | `symbol Symbol(x)` / `string Symbol(x)` |
| `new Date(t)` / its ISO string | same text | `Date <iso>` / `string <iso>` |
| `/re/` / `"/re/"` | `/re/` | `RegExp /re/` / `string /re/` |

Each pair is two crashes, and untagged the second is dropped by the dedup. These are ordinary values a component can throw; none is constructed to defeat the serializer, so none is a `serializeError` §4 limit. The tag is one derived token, not a widening list of special cases.

**This design is measured, not argued, because the vector survived three review rounds.** `docs/agents/spec-self-review.md` caps a design-correctness vector at three prose rounds: past that, build it and probe it. The projection above is implemented at `docs/superpowers/specs/observability/probes/2026-08-26-client-value-projection.ts` and run against every collision pair a reviewer has actually constructed — four families from round 1, ten cross-type pairs from round 2, eight structured-numeric pairs from round 3.

```
node --import tsx docs/superpowers/specs/observability/probes/2026-08-26-client-value-projection.ts
...
COLLISIONS: 4 of 25 pairs
```

The four are `{ a: -0 }` against `{ a: 0 }`, `[-0]` against `[0]`, two `Date`s inside the same second, and two `RegExp`s differing only in `lastIndex`.

**All four lose their distinguishing information before this projection sees it, and §9 records each.** `String(-0)` is `"0"` and so is `JSON.stringify(-0)`; only `Object.is` or `1 / x` separates them, and neither survives a JSON wire body. `Date` and `RegExp` reach the projection as strings already, because `serializeError` degrades an object with no own enumerable keys to `String(value)` — its ratified §4 limit 5 — and `String()` is second-resolution for a `Date` and ignores `lastIndex` for a `RegExp`. Two `Date`s a full second apart do discriminate, which is the probe's own control on that claim.

Chasing them would mean a precision rule per built-in type: `toISOString()` for `Date`, then `lastIndex` for `RegExp`, then the next one. That is the case-per-round widening this arc has refused three times, and it would mean changing what the ratified helper captures (§1.1 item 2). The worst case is one row where two crashes occurred, both indistinguishable to the person reading the row.

**`message`** — a human-legible label, and **nothing more**:

- `s` is a string → `message = s || "(no message)"`. Untagged: the message is what a human reads in `pnpm observe events`, and the tag lives in `detail` where the discrimination happens.
- `s` is an object or array → take its own `name`, `code` and `message` properties in that order, keep the non-empty strings, join with `": "`. If none survive, `message = "(no message)"`.

Worked: `{ code: "PGRST301", message: "planted" }` gives `message = "PGRST301: planted"` and `detail = '{"code":"PGRST301","message":"planted"}'`.

**`message` is deliberately NOT the discriminator, and an earlier draft made it one.** A label built from three fields collides in at least four ordinary ways:

| collision family | example pair |
| --- | --- |
| same triple, different other fields | `{code:"E",message:"m",a:1}` / `{code:"E",message:"m",b:2}` |
| different field identity, same text | `{name:"SAME"}` / `{code:"SAME"}` |
| ambiguous `": "` join | `{name:"A",code:"B"}` / `{name:"A: B"}` |
| divergence past the 1000-char message cap | two long values sharing a prefix |

Any repair that keeps `message` as the discriminator is a longer label — a bigger target for the next collision. The repair is to stop asking it to. §6.4 moves discrimination to `detail`, which carries the content and now carries the type.

### 6.3 Guard conditions, every input

| input | `message` | `detail` |
| --- | --- | --- |
| `Error` | not routed here — `reportClientError` keeps its `Error` arm (§1.1 item 8) | — |
| plain object with `message` and `code` | `"<code>: <message>"` | `{"code":"PGRST301","message":"planted"}` |
| plain object with `name` only | `"<name>"` | the rendered structure |
| plain object with none of the three | `"(no message)"` | the rendered structure |
| `{}` | `"(no message)"` — no `name`/`code`/`message` survives | `"{}"` |
| array | `"(no message)"` | `[1,2]` for `[1, 2]` |
| `"x"` | `"x"` | `"string x"` |
| `""` | `"(no message)"` | `"string "` |
| `0`, `false` | `"0"`, `"false"` | `"number 0"`, `"boolean false"` |
| `NaN` | `"NaN"` | `"number NaN"` |
| `1n` | `"1"` | `"bigint 1"` |
| `null` | `"null"` | `"null null"` |
| `undefined` | `"undefined"` | `"undefined undefined"` |
| `Symbol("x")` | `"Symbol(x)"` | `"symbol Symbol(x)"` |
| `Map` / `Set` | `"[object Map]"` / `"[object Set]"` | `"Map [object Map]"` / `"Set [object Set]"` |
| `Date` | its `String()` form | `"Date <that form>"` |
| a value whose serialization throws | `"(no message)"` | `"<tag> [Unserializable]"` |
| `{ a: NaN }` | `"(no message)"` | `{"a":NaN}` — **not** `{"a":null}` |
| `{ a: Infinity }` | `"(no message)"` | `{"a":Infinity}` |
| `[NaN]` | `"(no message)"` | `[NaN]` |

`Map` degrading to `"[object Map]"` is `serializeError` §4 limit 5, ratified 2026-08-16 and inherited by anything reusing the helper. It is a surfaced type name, not a silent loss, and the tag now also separates a `Map` from the string `"[object Map]"`. §9 records it.

Every row where `message` is `"(no message)"` still carries a distinct `detail`, and after §6.4 that is what separates them on the wire. Two `{}` values genuinely collapse to one POST, which is correct: they carry no distinguishing content.

### 6.4 The dedup signature gains `detail`

`lib/observe/clientErrorTransport.ts:32` builds the key from `source`, `level`, `message` and the first 200 characters of `stack`. A non-`Error` has no `stack`, so the key reduces to `source | level | message` — and §6.2 has just established that `message` is a label that collides. The transport already receives `detail`, and already puts it on the wire at `lib/observe/clientErrorTransport.ts:42`. It simply does not consult it:

```ts
const signature = `${input.source}|${input.level}|${message}|${(input.stack ?? "").slice(0, 200)}|${(input.detail ?? "").slice(0, 200)}`;
```

One line, one field the function already holds. What it buys:

- Every §6.2 collision family separates, because in each pair the two values have different `detail` bytes.
- **The `GlobalErrorListener` rejection path separates too**, and nothing else in this arc could have fixed it. That handler sends the fixed message `"unhandled promise rejection"` (`components/observe/GlobalErrorListener.tsx:48`) for every rejection, so before this change two rejections with different reasons share one signature no matter how good the projection is. A probe against the shipped transport with details `{"a":1}` and `{"b":2}` posts **once**.
- The `Error` path is unaffected: `detail` is absent there, the new term is the empty string, and the key is byte-identical to today's.

**Why 200 characters and not the full 500.** It matches the `stack` term beside it, and the two terms are doing the same job — enough bytes to discriminate, not so many that the key grows without bound in a `Set` that lives as long as the page. Two values identical for their first 200 `detail` characters and their first 1000 `message` characters dedup to one POST. That is a conservative degrade with no silent corruption — one crash recorded instead of two, never a wrong one — and §9 records it.

This is the second half of row 2, the half the row did not name (§1.3). The message defect and the signature defect are one repair only if both halves land.

### 6.5 How it rides the wire

**In `detail`, at the existing 500 cap. No new field, no `CAPS` change on either side.**

`clientErrorTransport` already accepts `detail?: string` (`lib/observe/clientErrorTransport.ts:27`) and caps it at `CAPS.detail` = 500 (`lib/observe/clientErrorTransport.ts:11`, `lib/observe/clientErrorTransport.ts:42`). The route already accepts, caps and persists it (`app/api/observe/client-error/route.ts:19`, `app/api/observe/client-error/route.ts:124`, `app/api/observe/client-error/route.ts:137`). `reportClientError` does not send `detail` today, so the field is free on the boundary path. Consequences, all of them good:

- No edit to either `CAPS` table, so §1.1 item 3 holds trivially.
- No new field on the route, so `tests/log/_metaMutationSurfaceObservability.test.ts` re-walks an unchanged file and `CLIENT_ERROR_MIRROR_RATE_CAPPED` at `app/api/observe/client-error/route.ts:106` is untouched. Invariant 10 needs nothing.
- All three wire sites land in the same field, so one `--code` query per code reaches any of them. Note that `--q` does **not**: it is `ilike` on `message` only (`lib/observe/query/events.ts:93`), so it finds a value that rode in `message` (the boundary path) and never one that rode in `detail` (the two listener paths). §11 uses the right query for each.

`reportClientError`'s new shape:

```ts
function toWire(e: unknown): { message: string; stack?: string; detail?: string } {
  if (e instanceof Error) return { message: e.message || "(no message)", stack: e.stack };
  const { message, detail } = describeClientValue(e);
  return { message, ...(detail ? { detail } : {}) };
}
```

An empty `detail` is omitted rather than sent as `""`, matching the conditional-spread posture the file already uses at `lib/observe/reportClientError.ts:32-35` and the route's `cap()` at `app/api/observe/client-error/route.ts:51`, which treats an empty string as absent anyway.

### 6.6 Truncation: a plain slice, and it is a documented limit

`detail` is a JSON string that `clientErrorTransport.ts:42` slices to 500 characters. **A sliced JSON string is no longer JSON.** This arc keeps the plain slice and does not add a truncation marker.

The reason is not preference. The route independently re-caps `detail` at 500 with its own plain slice (`app/api/observe/client-error/route.ts:51`, `app/api/observe/client-error/route.ts:124`), so a marker the client appended at exactly 500 characters would be re-truncated server-side and would not survive end to end. Adding a marker would mean changing both caps in lockstep, which §1.1 item 3 fences. Every other field on this wire — `message`, `stack`, `code`, `componentStack` — is a plain slice, and one bespoke field would be the odd one out.

What an operator sees is a `detail` that starts with the value's own fields in JSON order and stops. `serializeError`'s own bounds (`KEYS_MAX` 32, `STR_MAX` 500, `NODES_MAX` 200) already keep most real payloads well under the cap; a PostgREST returned-error with `code`, `message`, `details` and `hint` renders in well under 500 characters. §9 records the limit against the module that owns it.

### 6.7 The other two wire sites in that component

**The rejection handler** (`components/observe/GlobalErrorListener.tsx:39-44`), non-`Error` arm only:

```ts
const detail = (
  reason instanceof Error
    ? reason.message
    : reason == null
      ? ""
      : describeClientValue(reason).detail
).slice(0, DETAIL_CAP);
```

Two behaviors preserved exactly: an `Error` reason still yields `reason.message`, and `null` and `undefined` still yield `""` (the current `?? ""`, kept as an explicit `== null` branch so the projection's `"null"` string never surfaces where an empty string does today).

**A string reason's `detail` changes, and an earlier draft of this spec wrongly claimed it did not.** `"promise blew up"` now persists as `string promise blew up`, because §6.2 tags every non-structural value with its runtime type and that tag is what separates the string `"0"` from the number `0`. Two existing assertions move with it, and they are updated rather than worked around:

| test | today | after |
| --- | --- | --- |
| `tests/observe/globalErrorListener.test.tsx:42-53` | `detail === reason` | `detail === \`string ${reason}\`` |
| `tests/observe/globalErrorListener.test.tsx:56-64` | `detail === reason.slice(0, 300)` | `detail === \`string ${reason}\`.slice(0, 300)` — the tag occupies the first 7 characters, so 293 of the reason survive |

Both expectations stay derived from the fixture rather than written as literals, so the cap assertion still fails if the cap moves. The cost is seven characters of a 300-character budget; the benefit is that a rejection with `0` and a rejection with `"0"` stop sharing a row.

Its message stays the fixed `"unhandled promise rejection"`. That is what makes §6.4 load-bearing rather than optional: without `detail` in the signature, this handler posts once per page session no matter what the projection produces.

**The window-error handler is a third dark site, and the row named neither it nor the rejection one.** `components/observe/GlobalErrorListener.tsx:27-37` builds its detail from `event.filename` and `event.lineno` and never reads `event.error`, which is where the DOM puts the thrown value. `rg -n 'event\.error|event\.reason' components/observe/GlobalErrorListener.tsx` returns only `event.reason`. So a non-`Error` window throw loses its fields completely — not collapsed to `"[object Object]"` like the other two, simply absent.

Class-sweep applies: three wire-reaching sites in this class, three repaired here. The handler appends the projection's detail when `event.error` is a non-`Error` value, keeping the file/line prefix that makes an ordinary `Error` throw locatable:

```ts
const where = `${event.filename ?? ""}:${event.lineno ?? ""}`;
const from =
  event.error == null || event.error instanceof Error
    ? ""
    : describeClientValue(event.error).detail;
const detail = (from ? `${where} ${from}` : where).slice(0, DETAIL_CAP);
```

An `Error` thrown at the window keeps today's exact detail bytes, because its own `message` is already the `clientLog` message at `components/observe/GlobalErrorListener.tsx:32`. `DETAIL_CAP` stays 300 (`components/observe/GlobalErrorListener.tsx:7`); its cap is the listener's own and is stricter than the wire's 500.

## 7. Tests

### 7.1 What is red before implementation, and what is a regression pin

Invariant 1 requires the distinction be stated, because a test that passes on the day it is written is not a red.

**Red first, fails before the implementation exists:**

- The `errorOn: "from"` row of §4.3's table asserting `SHOW_CHANGE_LOG_READ_RETURNED_ERROR` — there is no emit at that site today.
- The `errorOn: "rpc"` row's `context.error` object assertion — today `context.error` is the string from `.message`.
- Every `describeClientValue` case in §6.3 — the module does not exist.
- The `reportClientError` non-`Error` cases in §7.3, though **not all for the same reason**, and the test asserts the right one per case. Measured against the shipped wire today: a plain object and `{}` produce `"[object Object]"`; a string produces its own text; `null` produces `"null"`; a `Map` produces `"[object Map]"`. The first two are red on `message`. The last three are red on `detail`, which the boundary path does not send at all today, and on the type tag that separates them from their string forms.
- The plain-object-reason case beside `tests/observe/globalErrorListener.test.tsx:42-53`, and the non-`Error` `event.error` case on the window handler (nothing reads that field today).
- The two-distinct-rejections test asserting two POSTs — one today, because the fixed message plus a `detail`-blind signature collapses them.
- The scanner's flattening cases: `error: error.message`, the aliased `.message`, `String(...)`, a destructured field, a template literal, a scalar `raw.status`, and `error`-absent. A code-only predicate passes all of them; a bare-identifier predicate still passes five; a string-only predicate still passes the numeric one (§5.4).
- The scanner's `else`-arm, after-return, nested-closure and out-of-cover-callee cases.
- `_metaInfraEmitCover` against the unrepaired tree. The test asserts the reported set is **empty**; it pins no expected count, because the walker's output is the derivation and a pinned number is a second source that goes stale. §3.2's table is a dated measurement, not a contract the suite enforces.

**Regression pins, green on day one:**

- The four #882 rows of §4.3's table. They pin merged behavior that nothing currently asserts. The `afterAll` set-equality is what makes them more than decoration.
- The scanner's positive-control cases in §5.7 that assert *satisfied* and *accepted*.

### 7.2 Anti-tautology

- Expected codes in §4.3 come from the declared table, and the `afterAll` set-equality means a row that silently stops running fails the suite. An assertion that only proved "some emit happened" would pass against the wrong code; the row names the code.
- The `context.error` assertion reads the PostgREST `code` value from the fixture constant. A hardcoded `"42501"` would pass against a fake that stopped supplying it.
- `describeClientValue` expectations are derived from the fixture object: the test builds `{ code, message }` from local constants and asserts `message === \`${code}: ${message}\``, so a projection that dropped one field fails. No rendered string is written as a literal.
- The two-distinct-objects test asserts `fetch` was called **twice** and that the two bodies differ in `detail`, not merely that both are non-`"[object Object]"`. A projection that returned a constant non-empty string would satisfy the weaker form and fail this one.
- The signature test drives `clientErrorTransport` directly with two inputs sharing `source`, `level` and `message` and differing only in `detail`, which is the §6.2 collision shape reduced to its essentials. Asserting only through `reportClientError` would let a lucky `message` difference pass a broken signature.
- The scanner's report cases assert the reported **reason**, not merely that something was reported, so a scanner that reported everything for the wrong cause would fail. Fourteen of the eighteen §5.7 cases expect a report.
- The premise test compares file **sets** and prints the symmetric difference. A count comparison passes when one file is dropped and another added, which is the failure the reviewer constructed against the earlier floor.
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
Nothing else in the diff is an enrolled surface: nothing under `lib/observe/` or `lib/admin/` appears in the registry. `lib/observe/describeClientValue.ts` is product code pinned by its own suite, not a guard surface. `tests/admin/infraEmitScan.ts` is a guard the registry could express, and it is authored in the enrollable shape (§5.1), with the resolving-layer caveat that section states so a later arc can enroll it without restructuring; enrolling it here would mean a fleet-wide class lock for a scanner whose positive-control suite already covers every arm of its accept-set and its two report families (§5.7), and the enrolment decision belongs to whoever needs the score.

The round-1 diff brief states this in one line and carries no `GUARD SURFACE:` line.

---

## 9. Documented limits

Each is recorded on the surface that owns it, per Eric's directive. None becomes a ledger row.


<!-- spec-lint: ignore — this file is created by this spec's implementation and is not tracked yet -->
1. **`serializeError` §4 limit 5 travels with the helper.** A `Map`, `Set`, or any object with no own enumerable keys and no informative `String()` form degrades to its type name (`"[object Map]"`). Ratified 2026-08-16; a surfaced type name is not a silent loss. Recorded in the header of `lib/observe/describeClientValue.ts`.


<!-- spec-lint: ignore — this file is created by this spec's implementation and is not tracked yet -->
2. **A truncated `detail` is not parseable JSON.** §6.6 has the reasoning. Recorded in the header of `lib/observe/describeClientValue.ts` beside the cap it describes.

3. **`noDoubleSerializedLogError` does not see `.message`, and the class is bigger than the loader.** `tests/log/noDoubleSerializedLogError.test.ts:12-13` bans `String(e)` and `JSON.stringify(e)` in an `error:` initializer; `error: error.message` passes it while discarding exactly the fields the guard exists to preserve.

   The prescribed grep finds **nine** live instances, not one. Four are inside the cover and are repaired in this PR, and the walker in §5 finds all four on its own — `lib/admin/loadRecentAutoApplied.ts:247`, `lib/admin/readShowReviewSnapshot.ts:62`, `lib/admin/loadAlertSummary.ts:22`, `lib/admin/loadTelemetryStats.ts:18`.

   Five are outside `lib/admin/**` and outside the probe domain: `app/admin/_showReviewModal.tsx` (three), `app/api/show/[slug]/version/route.ts:145`, and `lib/log/emitDiagramVariantFailures.ts:36` (which passes `row.message` from a data row, not a caught error, and may well be correct). They are the documented limit, recorded in the header of `tests/log/noDoubleSerializedLogError.test.ts`, with the re-run trigger being the grep itself: `grep -rn 'error: [a-zA-Z_][a-zA-Z0-9_]*\.message' lib/ app/ --include='*.ts' --include='*.tsx' | grep -v '\.test\.'`. Widening that guard to see `.message` is the mechanical repair and it belongs to whoever owns the guard, not to this arc's cover.


<!-- spec-lint: ignore — this file is created by this spec's implementation and is not tracked yet -->
4. **The cover is `lib/admin/**` and stops there.** Measured 2026-08-26: 165 raw `kind: "infra_error"` matches across 41 files outside `lib/admin/`, concentrated in `lib/notify/`, `lib/observe/query/`, `lib/appSettings/` and `lib/adminAlerts/`. The arc's PROBE DOMAIN fences the sweep to `lib/admin/**`, and `lib/sync/` already has its own emit guard (`tests/log/_metaAdminOutcomeContract.test.ts:59-73`, the `SYNC_INFRA_ERROR` window scan). Recorded in the header of `tests/admin/_metaInfraEmitCover.test.ts`, with the re-run trigger: point the scanner's root at another directory. The scanner takes its root as an argument precisely so that is a one-line change and not a rewrite.


<!-- spec-lint: ignore — this file is created by this spec's implementation and is not tracked yet -->
5. **An injected `loadHolds` test double is not covered, and is not a fault.** `lib/admin/loadNeedsAttention.ts:305` and `lib/admin/needsAttentionCount.ts:89` read `await (opts.loadHolds ?? loadOpenIdentityHolds)()`. The walker's propagation exemption accepts the `??` default arm, which production always takes and which is inside the cover. A test that injects a double returning `infra_error` without emitting (`tests/admin/loadNeedsAttention.test.ts:614`, `tests/admin/needsAttentionCount.test.ts:174`) produces no record, correctly: a fixture is not a fault. Recorded in the header of `tests/admin/infraEmitScan.ts`, with the re-run trigger: `grep -rn 'loadHolds' --include='*.ts' .` — a non-test injector appearing there is the signal to revisit.


<!-- spec-lint: ignore — this file is created by this spec's implementation and is not tracked yet -->
6. **`-0` and `0` share a row, and no textual rendering can separate them.** `String(-0)` is `"0"` and `JSON.stringify(-0)` is `"0"`; only `Object.is` or `1 / x` distinguishes the two, and neither survives a JSON wire body. So `{ a: -0 }` and `{ a: 0 }` — and `[-0]` against `[0]` — produce one row where two crashes occurred. These are the only two of the 22 pairs in `docs/superpowers/specs/observability/probes/2026-08-26-client-value-projection.ts` that collide; every `NaN`, `Infinity` and `-Infinity` pair discriminates, because `render` writes leaves with `String()` rather than JSON's number grammar (§6.2). Recorded in the header of `lib/observe/describeClientValue.ts`, with the re-run trigger being the probe itself.


<!-- spec-lint: ignore — this file is created by this spec's implementation and is not tracked yet -->
7. **Two crashes identical for their first 200 `detail` characters and first 1000 `message` characters dedup to one POST.** The §6.4 signature slices `detail` at 200 to match the `stack` term beside it and to bound a `Set` that lives as long as the page. The worst case is one row where two were due — a conservative degrade, never a wrong row. Recorded in the header of `lib/observe/describeClientValue.ts`.

8. **`null` and `undefined` rejection reasons collapse to one row.** Both produce `detail = ""` at `components/observe/GlobalErrorListener.tsx`, so they share a signature. Distinguishing them would mean sending `"null"` and `"undefined"` as detail text, which changes behavior the row does not ask about and which reads worse in `app_events` than an empty field. Recorded beside the `== null` branch.

9. **`context`-only `clientLog` callers are outside the wire.** `ShowRealtimeBridge.tsx:503`, `components/realtime/ShowRealtimeBridge.tsx:755`, `components/realtime/ShowRealtimeBridge.tsx:786`, `components/realtime/ShowRealtimeBridge.tsx:821` and `DevCaptureControl.tsx:126` pass their value as `context`, which `lib/observe/clientLog.ts:17-18` never mirrors. They cannot produce an `"[object Object]"` in `app_events` because they produce nothing in `app_events`. Recorded in row 2's archive entry.


<!-- spec-lint: ignore — this file is created by this spec's implementation and is not tracked yet -->
11. **A reconstructed partial object passes the emit predicate.** `error: { message: raw.message }` is an object, so §5.4's rule accepts it while `code`, `details` and `hint` are gone. No static rule separates a hand-built partial from the real fault, and the probe carries the fixture under its own name (`partial object literal (DOCUMENTED LIMIT)`), which is why its score reads 1/17 rather than 0/17. Under the threat fence this is not an accident an ordinary contributor has; flattening to `.message` is, and that is closed. Recorded in the header of `tests/admin/infraEmitScan.ts`, re-run trigger being the probe.


<!-- spec-lint: ignore — this file is created by this spec's implementation and is not tracked yet -->
12. **The walker resolves types and symbols, but not values.** It proves an emit's `error` expression is not a `string` and that a propagation's callee is declared inside the cover. It does not prove the emit runs on the returning branch when both sit in one scope, and it does not follow a fault through a helper that emits on the caller's behalf. The threat fence is an ordinary contributor adding a loader branch, not an author routing around a guard. A code-carrying emit anywhere in the guard scope satisfies it, including one that runs on a different branch within the same scope, and an emit reached through a helper function is not seen. The threat fence is an ordinary contributor adding a loader branch, not an author routing around a guard. Recorded in the header of `tests/admin/infraEmitScan.ts`.

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
| **10** mutation-surface observability | `app/api/observe/client-error/route.ts` is unchanged (§6.5) and keeps `CLIENT_ERROR_MIRROR_RATE_CAPPED` at `app/api/observe/client-error/route.ts:106`. The loader and every swept `lib/admin` file is a read, not a mutation surface. |
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

**2. No client crash persists as `"[object Object]"`.** Two paths, and they need two different checks, because `--q` is `ilike` on `message` only (`lib/observe/query/events.ts:93`) and cannot see `context.detail`.

*Boundary path*, where the literal used to be the message. From a browser console on a crew page, throw a plain object inside a component so an error boundary catches it:

```
pnpm observe events --q '[object Object]' --since 24h
```

Before: **1** row total, whatever the number of distinct boundary crashes, its `message` the literal — the dedup admits the first and drops the rest. After: **0** rows. This query is valid here precisely because `reportClientError` puts the projection in `message`; it would find nothing on either listener path, where the value rides in `detail`.

*Listener path*, where the message is fixed and the value rides in `detail`. `Promise.reject({ code: "PGRST301", message: "planted" })`, then:

```
pnpm observe events --source client.root --code CLIENT_UNHANDLED_REJECTION --since 1h
```

`--source` and `--code` are equality filters (`lib/observe/query/events.ts:83-85`), so this returns the row and the check is on its `detail` field, read from the output. Before: `detail` is `[object Object]`. After: `detail` carries `planted` and `PGRST301`. A `--q` query would not have found either state, which is why it is not used for this half.

**3. Two distinct crashes produce two rows, on both paths.** The trigger is stated because the two paths have different sources and different mechanisms.

*Listener path* — two rejections back to back in one page session, `Promise.reject({a:1})` then `Promise.reject({b:2})`:

```
pnpm observe events --source client.root --code CLIENT_UNHANDLED_REJECTION --since 1h
```

Before **1** row: the message is the fixed `"unhandled promise rejection"` and the pre-§6.4 signature ignores `detail`, so the second is dropped at `lib/observe/clientErrorTransport.ts:33-34`. After **2**.

*Boundary path* — two component throws with structurally different plain objects, caught by the crew boundary:

```
pnpm observe events --source client.crew --since 1h
```

Before **1** row (both collapse to the `"[object Object]"` message and one signature). After **2**.

Plus: the app-e2e job log still carries `SUPABASE_UPSTREAM_FAULT` lines on a forced 502. #899's capture step is unaffected — the loader emit sits beside it, not in place of it.

`pnpm observe events` filters are equality on `--source` and `--code` (`lib/observe/query/events.ts:83-85`) and `ilike` on `message` for `--q` (`lib/observe/query/events.ts:93`).

---

## 12. Close-out

**`impeccable-gate: critique+audit run on components/observe/GlobalErrorListener.tsx, dispositions recorded`** — the affirmative form, and the earlier N/A declaration in this spec was wrong.

Invariant 8 defines a UI surface by PATH: "any file under `components/`" (`AGENTS.md:20`). It is a syntactic test, and whether the component paints pixels does not change it. `tests/docs/_metaInvariant8Closeout.test.ts` validates the marker's grammar; a passing grammar check is not an authorization to skip the gate, so the argument this spec made from it does not hold.

bl-orch's ruling of 2026-08-26 was conditional — verify the null render, take N/A *if* the grammar admits it, otherwise "run the dual gate on the diff instead and record the (empty) findings; do not bend the marker grammar." This spec takes the second branch of that ruling. The dual gate on one null-rendering component is cheap, and running it removes the argument entirely rather than winning it. The findings, empty or not, are recorded in the close-out prose beside the marker.

The null-render fact stays on the record because it bounds what the gate can find, not because it exempts anything: `components/observe/GlobalErrorListener.tsx` is declared `: null` (`components/observe/GlobalErrorListener.tsx:22`) with one render return, `return null` (`components/observe/GlobalErrorListener.tsx:65`); the only other return is the effect cleanup (`components/observe/GlobalErrorListener.tsx:58-62`), which is not a render path.

Twelve required checks by name: `quality`, `unit-suite`, `x1-catalog-parity`, `x2-no-raw-codes`, `x3-trust-domain`, `x4-no-global-cursor`, `x5-email-canonicalization`, `x6-pg-cron-pivot`, `validation-schema-parity`, `affordance-matrix-parity`, `postgrest-dml-lockdown`, `traceability-audit`. `mutation-harness` is not required and, per §8, is not run.

No migration, so no `supabase db push`, no `gen:schema-manifest`, no validation-project apply.

Both rows graduate to `BACKLOG-archive.md`. Row 1's entry records that #882 repaired four of five sites the day after filing (`d9a039a94`, `17357a05c`), names the fifth, states the level argument of §2 that makes the loader emit non-redundant with #899's observer, and records the §3.3 sweep decision with its derived count and the derivation. Row 2's entry records all three wire sites, the signature defect the row did not name and its repair at §6.4, the §6.2 projection, and limits 5 through 8 of §9. The carry-forward sentence at `BACKLOG-archive.md:2373` is left as the history it is.
