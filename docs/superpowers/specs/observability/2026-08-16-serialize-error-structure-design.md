# serializeError structural non-Error branch — no diagnostic collapses to "[object Object]"

**Date:** 2026-08-16 · **Branch:** `fix/serialize-error-structure` · **Status:** draft
**Entry:** `BL-SERIALIZE-ERROR-NON-ERROR-BRANCH-STRINGIFIES` (BACKLOG.md, filed 2026-08-15) · **Effort:** M
**Plan:** authored beside this spec in the plan directory docs/superpowers/plans/ under the same date-topic stem (same PR)

## §0 Why

`lib/log/serializeError.ts` is the single canonical "unknown thrown value → loggable shape" helper (its own header comment, `lib/log/serializeError.ts:2-6`). Its whole body is:

```ts
return error instanceof Error
  ? { name: error.name, message: error.message, stack: error.stack }
  : String(error);
```

The non-`Error` branch collapses every plain object to the literal `"[object Object]"`. Supabase/PostgREST returned-errors are exactly that shape: `processResponse` in the installed postgrest-js package (version 2.105.1) builds the returned `error` as `JSON.parse(body)` (or hand-built `{ message, details, hint, code }` literals) and constructs a `PostgrestError` **class instance only on the `throwOnError` path** (its dist/index.cjs under node_modules, function `processResponse`: `error = JSON.parse(body)` … `if (error && _this2.shouldThrowOnError) throw new PostgrestError(error)`). Every `{ data, error }` destructure in this repo therefore receives a plain object, never an `Error`.

Probe (this worktree, 2026-08-16, `pnpm exec tsx` against the live helper):

```
plain object (Supabase) -> "[object Object]"
Error instance          -> {"name":"Error","message":"boom","stack":"Error: boom\n    at <anonymous> (/priv
```

Second probe — the class claim: `new PostgrestError({...})` in the installed package IS `instanceof Error` (own enumerable keys `["name","details","hint","code"]`), so the entry's "never Error instances" holds for the **returned-error** path this repo uses, and the Error branch's own field-discard (details/hint/code dropped) is a sibling loss this spec also closes (§2.3).

Live forwarding sites passing returned-errors straight to `log.*` `error:` fields (from the entry, re-verified on this tree):

- `lib/auth/picker/resolvePickerSelection.ts:56` — `...(detail === undefined ? {} : { error: detail })`
- `lib/auth/picker/resolveShowPageAccess.ts:75` — same shape
- `lib/log/emitIdentityLinkRenameUnlanded.ts:65` — `error: result.error`
- `lib/log/emitLeadRoleApplied.ts:76` — `error: result.error`

These four are instances, not the class: the defect is in the helper, and every `log.*` call whose `error:` can receive a non-`Error` is covered by fixing the helper once (`buildRecord` runs `serializeError(fields.error)` at `lib/log/logger.ts:38`, the single serialization chokepoint pinned by `tests/log/noDoubleSerializedLogError.test.ts`).

Measured operational cost (dated record): the changes-feed batch-flake investigation had to attribute a PostgREST 502 through a same-class witness 62 seconds later because the fatal log path rendered its PostgREST error as `'[object Object]'` (`tests/docs/_retiredIdentifiers.ts` reconciliation log, 2026-08-15 segment), and `lib/admin/readShowReviewSnapshot.ts` now hand-extracts `message`/`code`/`details`/`hint` into four separate fields to work around the helper (pinned at `tests/admin/readShowReviewSnapshot.test.ts:118-125`).

## §1.1 Resolved scope — do not relitigate

1. **PR #808's removal of the double-`serializeError` wrapper is correct and strictly non-regressive.** The entry measured it: a plain object produced `"[object Object]"` both before and after; an `Error` went from `"[object Object]"` to the full triple. The prior spec deliberately held the helper's behavior constant (`docs/superpowers/specs/observability/2026-08-15-sync-log-emit-guard-design.md` §2.2); this arc is the helper redesign that spec deferred. Findings re-arguing #808 are out of scope.
2. **The fix shape is pre-ratified in the entry:** a plain object serializes to its own enumerable fields, bounded depth, plain-slice truncation (the posture of the existing stack slice at `lib/observe/clientErrorTransport.ts:36`, `input.stack.slice(0, CAPS.stack)`), `String(value)` kept only for primitives. Alternatives to the structural approach (JSON.stringify with replacer; reusing `sanitizeValue`) are recorded rejected in §2.7 — re-proposing them is relitigation.
3. **The serialize-then-sanitize chokepoint order is unchanged.** `buildRecord` serializes (`lib/log/logger.ts:38`) then `sanitizeContext` redacts/JSON-safes the whole context (`lib/log/logger.ts:40`). Redaction stays in `sanitizeContext`; the helper stays pure (§2.4 carries the argument).
4. **No re-emit/queue, no `app_events` DDL.** `app_events.context` is unconstrained jsonb (`supabase/migrations/20260629000002_app_events.sql:14`); the shape change needs no migration, and no consumer parses `context.error` (probed §2.5).
5. **`lib/observe/reportClientError.ts` is out of this arc.** Its `toError` (`lib/observe/reportClientError.ts:11-14`) has the same defect shape (`String(e)` for non-`Error`), but it feeds a client wire protocol with its own CAPS, dedup signature, and server route — a redesign of a surface this PR does not otherwise touch (class-sweep deferral exception (c)). Filed as `BL-REPORT-CLIENT-ERROR-NON-ERROR-MESSAGE-ONLY` in this PR (§2.6).
6. **`lib/admin/readShowReviewSnapshot.ts`'s hand-extraction stays.** It is a correct site-local shape (four flat fields, greppable by `pgrstCode`), not a defect; only its *comment* citing the collapse behavior goes stale and is refreshed (§2.5). Migrating the site to raw-object passing is optional follow-up, not this arc.

## §2 Design

### §2.1 New contract

`serializeError(error: unknown)` returns `SerializedError = string | Record<string, unknown> | unknown[]`. It is a **total function: it never throws** (it runs inside `buildRecord` on every `log.*` call; a throw would take logging down with it — invariant-9 posture).

| Input class | Output |
| --- | --- |
| `Error` instance | `{ ...boundedOwnFields, name, message, stack, cause? }` — §2.3 |
| `null`, `undefined`, string, number, boolean, bigint, symbol, function | `String(value).slice(0, STR_MAX)` — the current behavior plus the string cap |
| Array | bounded structural array — §2.2 |
| Any other object | bounded structural object of its own enumerable string-keyed fields — §2.2; if that capture is `{}` **and** `String(value)` is not `"[object Object]"`, fall back to `String(value).slice(0, STR_MAX)` (covers `Date`, `RegExp`, `URL`, custom `toString`) |
| Anything whose traversal throws at the top | the literal string `"[Unserializable]"` (whole-helper backstop) |

Guard-condition table (every input has a defined output): `null` → `"null"`; `undefined` → `"undefined"`; `NaN` → `"NaN"`; `0` → `"0"`; `""` → `""`; `{}` → `{}` (empty object stays an empty object — its default stringification IS `"[object Object]"`, so the fallback clause does not fire); `[]` → `[]`.

### §2.2 Bounds and traversal mechanics

All bounds are module-level named constants in `lib/log/serializeError.ts` — single source; prose references them by name; tests use the dual posture defined once in §5 (literal contract pins + derived behavior fixtures):

- `DEPTH_MAX = 3` — the root object is depth 1; values at depth > `DEPTH_MAX` are replaced by the string `"[Truncated: depth]"`. (A Supabase returned-error is depth 1; an `Error` `cause` chain consumes one level per link.)
- `KEYS_MAX = 32` — per object, first `KEYS_MAX` own enumerable string keys in insertion order are kept; when any are dropped, one extra property `"~truncated": "<n> more keys"` is added.
- `ITEMS_MAX = 32` — per array, first `ITEMS_MAX` elements kept; when any are dropped, one final element `"[+<n> more]"` (string) is appended.
- `STR_MAX = 500` — every emitted string except `stack` is `.slice(0, STR_MAX)` (plain slice, no marker — the clientErrorTransport posture, and the value matches its `detail` cap at `lib/observe/clientErrorTransport.ts:3-12`).
- `STACK_MAX = 8000` — the Error branch's `stack` is `.slice(0, STACK_MAX)`, matching `CAPS.stack` (`lib/observe/clientErrorTransport.ts`).
- `NODES_MAX = 200` — a global visited-value budget across one `serializeError` call; once exhausted, every remaining value is replaced by `"[Truncated: budget]"`. This is the total-size bound: without it the per-level caps still admit ~`KEYS_MAX^DEPTH_MAX` nodes; with it the worst-case output is ~`NODES_MAX × STR_MAX` ≈ 100 KB, and the typical Supabase error is untouched (4 keys, depth 1).

Value handling inside structures: string → sliced; finite and non-finite numbers, booleans, `null` → as-is (`sanitizeContext` already stringifies non-finite numbers on the persisted path, `lib/log/sanitize.ts:16`); bigint → `String`; `undefined`, function, symbol **values** → dropped from objects, `null` at array positions (index-preserving, the `lib/log/sanitize.ts:26-30` posture); nested object/array → recurse.

Cycles: ancestor-only `WeakSet` with release after each subtree — the exact semantics of `lib/log/sanitize.ts:22-41` (sibling repeats are not flagged); a true ancestor cycle emits the string `"[Circular]"` (same vocabulary as `lib/log/sanitize.ts:22`).

Never-throws mechanics: keys are listed with `Object.keys` (does not invoke getters); each property is then read inside its own try/catch, a throwing getter becoming the string `"[Throwing getter]"`; the whole helper body sits in a try/catch returning `"[Unserializable]"` for anything that defeats the per-property guards (e.g. a revoked Proxy, where `Object.keys` itself throws). `toJSON` methods are deliberately never invoked (the capture is structural, not JSON.stringify — §4 limit 3).

### §2.3 Error branch: bounded own fields + `cause`, protocol triple wins

The `Error` branch becomes: bounded own-enumerable-field capture (same §2.2 mechanics, same budget) spread first, then `name`, `message` (sliced `STR_MAX`), `stack` (sliced `STACK_MAX`) written last so the protocol triple deterministically wins any collision (PostgrestError has an own enumerable `name`, probed §0). When `"cause" in error` and `error.cause !== undefined`, add `cause: <recursive serialization at child depth>` — `cause` is an own **non-enumerable** property on V8 `new Error(msg, { cause })`, so the enumerable spread alone would miss it, and `cause` is where Node fetch/system errors carry `ECONNREFUSED`-class detail. This closes the sibling loss: a Node `fs` error's `code`/`errno`/`path`, a `throwOnError` PostgrestError's `details`/`hint`/`code` all survive today's discard.

### §2.4 Redaction posture — no new path for secrets or emails

The helper stays **pure**: no redaction inside `serializeError`. The argument, per surface:

- **Persisted path (`app_events`):** `buildRecord` output flows through `sanitizeContext` (`lib/log/logger.ts:40`), whose `sanitizeValue` recurses every nested string VALUE and applies `redactEmails` (`lib/log/sanitize.ts:15`). Same for `persistAppEventStrict`, which sanitizes itself (`lib/log/persist.ts:67`).
- **Key-redaction repair (spec R1 F1, probed):** `sanitizeValue` copies object KEYS unchanged (`lib/log/sanitize.ts:33-35`, `out[k] = s`), so a plain-object error with an email-bearing key — `sanitizeContext("", { error: { "alice@example.com": "failed" } })` returned the key verbatim, probed live — would become a new unredacted path once structure is preserved. This arc therefore ships a one-line repair at the redaction chokepoint: the object branch writes `out[redactEmails(k)] = s`. Channel sweep of `sanitizeValue` (the class, not the instance): string values redacted (`lib/log/sanitize.ts:15`), message redacted (`sanitizeContext`, `lib/log/sanitize.ts:57`), keys repaired here, numbers/booleans/bigint cannot carry an email — no further channel. The repair applies to the WHOLE context (strictly more redaction); live call-site context keys are static identifiers (`crew_name`, `capability_changes`, …), so no legitimate key content is lost, and colliding post-redaction keys (two email keys in one object) last-write-win like any duplicate key — signaled shape, documented limit 9.
- **Console chokepoint (`defaultSink`):** prints `record.context` post-sanitize (`lib/log/logger.ts:71` prints the built record) — covered by the same pass.
- **The two direct console sites** (`lib/log/persist.ts:32` and `lib/log/persist.ts:38`) print `serializeError(...)` output with no sanitize. This is not a new path *class*: those sites already print raw `Error` `message`/`stack` unredacted today. The inputs that can newly surface there are the fields of a failed `app_events` insert's returned error, whose row values (`message`, `context`) were already redacted/sanitized before the insert (`lib/log/persist.ts:13` comment; `buildRecord` order). Documented limit 1 (§4) records the residual.
- **Invariant-10 secrets posture:** unchanged. The helper never had, and does not gain, access to anything a call site does not pass; the rule "secrets are never logged" binds call sites (e.g. `rotateShareToken` emits `epoch_<n>`), not the serializer. No key-based secret denylist is added — a denylist accepts whatever it did not model (accept-set discipline, `docs/agents/spec-self-review.md:38`), and it would dilute the single-chokepoint contract that `sanitizeContext` is THE sanitization pass.

### §2.5 Blast surface

- **`app_events.context.error` payload shape** — was `string | {name,message,stack}`; becomes `SerializedError` (§2.1). `app_events.context` is unconstrained jsonb (`supabase/migrations/20260629000002_app_events.sql:14`, `context jsonb not null default '{}'`). Probed consumers: `rg "context\.error|context\['error'\]" lib/observe/ app/admin/` → zero matches; `rg "'error'|\"error\"" lib/observe/query/` → zero matches. The observe CLI renders context generically. No mechanical consumer breaks; human readers get strictly more.
- **Superseded test pins — explicit, not silent.** `tests/log/serializeError.test.ts:18` pins `serializeError({ a: 1 })` → `"[object Object]"`, and the test name at `tests/log/serializeError.test.ts:13` claims "non-Error values → String(value)". This spec supersedes both: the object row becomes structural capture; primitive rows (`tests/log/serializeError.test.ts:14-17`) stay valid (plus the `STR_MAX` slice, invisible at those literals' lengths). The suite is rewritten to the §2.1 contract table.
- **Comment-refresh sweep — a DERIVATION, run at implementation close, not this enumeration (spec R1 F4: the drafted three-item list missed four living files the live probe found).** Procedure: `rg -ln "object Object" lib/ app/ components/ tests/`; every hit is dispositioned REFRESH (describes the helper's current collapse behavior — would become false), UNTOUCHED-DATED (dated historical record — never corrected, per the numeric-sweep rule), or UNTOUCHED-UNRELATED (generic object-stringification having nothing to do with this helper). Run on this tree 2026-08-16, 15 files:
  - REFRESH (8): `lib/sync/runScheduledCronSync.ts:2328-2331`; `lib/admin/readShowReviewSnapshot.ts:49-52`; `tests/sync/syncLogEmitGuard.test.ts:32-33` and `tests/sync/syncLogEmitGuard.test.ts:100-101`; `tests/sync/runPushSyncForShow.test.ts:289-292`; `tests/auth/isAdminSession-telemetry.test.ts:17-20`; `tests/admin/readShowReviewSnapshot.test.ts:117-121`; `tests/log/noDoubleSerializedLogError.test.ts` (all four spots: 5-7, 32-35, 57-59, 172-175 — one whole-file rationale pass). For the walker guard and the two sync suites: double-serialization is no longer *destructive* — an `Error` re-serialized now survives structurally — so the `toMatchObject` rows at `tests/sync/syncLogEmitGuard.test.ts:102` and `tests/sync/runPushSyncForShow.test.ts:292` stop discriminating the double-serialize mutant they cite; the ban's enforcement is the walker (static), and the refreshed comments say so (§4 limit 8).
  - UNTOUCHED-DATED (1): `tests/docs/_retiredIdentifiers.ts` (reconciliation log).
  - UNTOUCHED-UNRELATED (5): `tests/styles/_newTabScan.ts`, `tests/styles/_metaNewTabAnnouncement.test.ts` (DOM stringification of arbitrary objects); `tests/api/staged-diagram-route.test.ts` (byte-union rendering); `tests/ui/cn.test.ts` (classname operand rendering); `tests/sync/runScheduledCronSync.adapter.test.ts` (JSON.parse aside); `tests/components/admin/wizard/step3ReviewSections.test.tsx` (innerHTML guard).
  - REWRITTEN (1): `tests/log/serializeError.test.ts` (whole suite, §5).
  The count above is the at-authoring-time run; the implementation PR re-runs the derivation and dispositions any NEW hit by the same three-way rule.

### §2.6 Companion guard: no site-local pre-flattening

The residual regression vector after the helper fix is a call site collapsing structure *before* the helper sees it: `error: String(e)` or `error: JSON.stringify(e)`. `tests/log/noDoubleSerializedLogError.test.ts` already walks `lib/`, `app/`, `components/` for `log.*` call sites (`walkSourceFiles`, `tests/log/noDoubleSerializedLogError.test.ts:436`) and resolves the `error` property through spreads and transparent wrappers — the derived cover the entry names. The companion assertion extends that suite:

- **Claim (accept-set, structure-keyed, scoped to what the walker structurally sees):** at every walked `log.*` call site **whose fields argument is an object literal** (the suite's existing structural scope — non-literal second arguments are skipped at `tests/log/noDoubleSerializedLogError.test.ts:211`, and spread-resolved contributing literals are included), the `error` property's initializer subtree must not contain a call whose callee is the global identifier `String` or the property access `JSON.stringify`. Detection reuses the suite's existing subtree-mention predicate shape (`mentionsWrapper`, `tests/log/noDoubleSerializedLogError.test.ts:182-192`) — a closed question over a finite tree, not a grammar parse. A fields object carried through a local variable (live example: the `fields` const at `lib/cron/withCronRunSummary.ts:95`, probed spec R1 F3) is OUTSIDE the accept-set by the same narrowing the parent suite already applies to its own families — variable and interprocedural flow are that suite's documented limits (`tests/log/noDoubleSerializedLogError.test.ts:52-55`), and widening the recognizer to chase them is the one-corner-per-round ratchet both AGENTS.md and that suite's own header reject. Documented limit 10 records it.
- **Live count today: 0** (probed: `rg "error: String\(|error: JSON\.stringify" lib/ app/ components/` → zero matches; the AST predicate is the shipping form, the rg line is the draft-time probe).
- **Consequence bound:** every input is handled correctly or reported loudly; no silent-wrong path. A false positive (a `String` call in the subtree whose result does not reach `error`) is a loud test failure naming the site, resolved by hoisting or by filing to documented limits.
- **Threat-model fence:** ordinary authoring mistakes — a contributor flattening out of habit or copying an old shape. Obfuscation (aliasing `String`, `globalThis.String`, a local helper that stringifies then forwards, computed property names) is out of scope and files to documented limits.
- **Probe domain:** the walked `lib/`, `app/`, `components/` tree plus the suite's planted fixtures.
- Message-extraction shapes (`error: e.message`, the readShowReviewSnapshot four-field split) are **not** flagged — they are property reads, not `String`/`JSON.stringify` calls, and are legitimate site-local choices.

Same PR, ledger filing: `BL-REPORT-CLIENT-ERROR-NON-ERROR-MESSAGE-ONLY` — `lib/observe/reportClientError.ts:11-14` collapses non-`Error` boundary crashes to `String(e)` as the wire `message`; same defect shape, deferred with class-sweep exception (c) (client wire protocol + CAPS + server route = a surface this PR does not otherwise touch). Probe evidence: the cited `toError` source.

### §2.7 Approach chosen, alternatives rejected

- **Chosen: helper-local bounded structural serializer** (entry-ratified shape). One module, one importing suite, mutation-enrollable.
- **Rejected — `JSON.stringify` with replacer:** invokes `toJSON` (surprise shapes), throws on BigInt, throws on cycles unless the replacer carries state, depth-capping needs the same hand-rolled walker anyway.
- **Rejected — reuse `sanitizeValue` (`lib/log/sanitize.ts`):** it redacts; routing the persist.ts console sites through it would change their output contract, and merging "bound an error value" with "redact a whole context" couples two contracts whose call sites differ. The two walkers share *vocabulary* (`"[Circular]"`, drop-semantics) by specification here, not code — the coupling would cost more than the ~30 shared lines.

### §2.8 Mutation enrolment (convergence criterion)

`lib/log/serializeError.ts` is enrolled in `tests/mutation/source/registry.ts` (spec `docs/superpowers/specs/ci/2026-08-04-source-mutation-guard-gate.md`) in the implementation PR, before the diff review: `sourcePath: "lib/log/serializeError.ts"`, `suitePaths: ["tests/log/serializeError.test.ts"]`, operators `["relational-boundary", "equality-flip", "logical-connector", "integer-literal", "statement-removal"]`, `scoreFloor` per registry precedent (0.95 is the modal floor; plan fixes the number after the first `pnpm mutation:guards` run). The bounds logic (`DEPTH_MAX`/`KEYS_MAX`/`ITEMS_MAX`/`STR_MAX`/`NODES_MAX` comparisons) is exactly what `integer-literal` and `relational-boundary` mutants probe; a surviving unaccepted mutant, not an argued hypothetical, is the admissible form of "the suite does not pin what it claims."

## §3 Acceptance criteria

- **AC-1** `serializeError({ message: "gateway 502", code: "PGRST301", details: null, hint: null })` returns an object carrying all four fields — the entry's probe, inverted.
- **AC-2** Primitive rows of the §2.1 table hold: `"oops"` → `"oops"`, `42` → `"42"`, `null` → `"null"`, `undefined` → `"undefined"`; a string longer than `STR_MAX` is sliced to `STR_MAX`.
- **AC-3** Each bound fires with its marker, under the §5 dual posture: depth > `DEPTH_MAX` → `"[Truncated: depth]"`; > `KEYS_MAX` keys → `KEYS_MAX` kept + `"~truncated"` marker; > `ITEMS_MAX` elements → `ITEMS_MAX` kept + `"[+<n> more]"`; node budget exhaustion → `"[Truncated: budget]"` with total visited ≤ `NODES_MAX`.
- **AC-4** A self-referential object terminates with `"[Circular]"` at the cycle edge; a sibling-repeated (non-ancestor) object is captured twice, not flagged.
- **AC-5** Never throws: a throwing getter yields `"[Throwing getter]"` for that property with siblings intact; a revoked Proxy yields `"[Unserializable]"`; a throwing `toString` on a primitive-fallback object yields `"[Unserializable]"`.
- **AC-6** Error branch: `new TypeError("boom")` keeps the `{name, message, stack}` triple (stack sliced `STACK_MAX`); an Error with own enumerable `code`/`details` carries them; `new Error("x", { cause })` carries the recursively serialized `cause`; an own enumerable `name` collision loses to the protocol `name`.
- **AC-7** Integration: `log.error(msg, { source, error: <plain object with an email in a nested string VALUE and an email-bearing KEY> })` persists `context.error` structurally with both redacted (the `setLogSink` spy seam, `lib/log/index.ts`) — proving §2.4's serialize-then-sanitize composition including the key-redaction repair.
- **AC-8** Companion guard: planted fixtures with `error: String(e)` and `error: JSON.stringify(e)` (plus one transparent-wrapper variant) each produce exactly one finding; the live-tree walk produces zero.
- **AC-9** The §2.5 derivation re-run at implementation close reports zero REFRESH-class hits still asserting the collapse behavior; `tests/log/serializeError.test.ts` pins the §2.1 table.
- **AC-10** Registry row lands; `pnpm mutation:guards` meets the floor with an empty unaccepted-survivor set.

## §4 Documented limits

1. **The two persist.ts console sites print unredacted serialized errors.** Pre-existing class (raw `Error` message/stack already print there); inputs at those sites are pre-redacted rows' returned errors. Not this arc's to change.
2. **Symbol-keyed and prototype-inherited properties are invisible** (`Object.keys` own string-keyed enumerable only). Conservative omission, never wrong content.
3. **`toJSON` is deliberately ignored** — the capture is structural. An object relying on `toJSON` for its meaningful shape serializes as its raw fields.
4. **Marker collision:** an input object with an own `"~truncated"` key is ambiguous with the truncation marker. Signaled shape, never silent corruption.
5. **Non-plain objects with empty enumerable capture degrade to `String(value)`** — a `Map` becomes `"[object Map]"` (type name only, contents lost). Conservative demote plus a surfaced type name.
6. **Truncation is lossy by design.** Bounds are named constants; revisit by measurement (an observed truncated diagnostic), not by argument.
7. **Companion-guard fence:** aliased `String`, `globalThis.String`, stringify-and-forward helpers, computed property names are out of scope (§2.6). A probe demonstrating one files here, not into the recognizer.
8. **Double-serialization is no longer destructive, still banned.** The walker guard's consequence softens from "collapses to `[object Object]`" to "redundant + shape drift"; the guard stays, its prose updated (§2.5) — and the two sync-suite `toMatchObject` rows that cited the destructive mutant stop discriminating it; the walker is the ban's enforcement.
9. **Key-redaction edge:** two distinct email keys in one object redact to the same `[email-redacted]` key and last-write-win; a signaled shape (the marker key is visible), never silent leakage.
10. **Companion-guard scope:** a fields object carried through a local variable (`lib/cron/withCronRunSummary.ts:95` shape) is outside the accept-set, matching the parent suite's own variable/interprocedural limit (`tests/log/noDoubleSerializedLogError.test.ts:52-55`). A probe demonstrating a pre-flatten through one files here, not into a wider recognizer.

## §5 Test surface (plan owns the details)

`tests/log/serializeError.test.ts` rewritten to the §2.1 contract under a **dual posture** (spec R1 F2 — deriving BOTH fixture and expectation from the constants would let an `integer-literal` mutant on a constant move implementation and oracle together and survive): (a) **literal contract pins** — one assertion per constant pinning its spec value (one per §2.2 constant, literal in the test file; §2.2 is the single prose source of the values — this section deliberately repeats none of them), which kill every `integer-literal` mutant on a constant declaration; plus (b) **behavior fixtures derived from the constants** (`BOUND` and `BOUND + 1` pairs), which kill `relational-boundary` mutants on the comparisons independent of the constants' values. Integration case rides `tests/log/logger.test.ts`'s existing `setLogSink` pattern (its `serializes + redacts fields.error` case at `tests/log/logger.test.ts:41-47` is the template). Companion guard cases live in `tests/log/noDoubleSerializedLogError.test.ts` beside the existing families. RED validity: every new assertion fails on the live tree today (the object row returns `"[object Object]"`; the companion fixtures scan clean because the predicate does not exist).

## §6 Sequencing

One implementation PR: helper redesign + suite rewrite + companion guard + comment refresh + registry row + `BL-REPORT-CLIENT-ERROR-NON-ERROR-MESSAGE-ONLY` filing + ledger graduation of the entry. No migration, no UI surface (`impeccable-gate: N/A — no UI surface`), no lock topology change (invariant 2 untouched — the helper holds no locks), no new mutation surface under invariant 10 (the helper is not a mutating route/action).
