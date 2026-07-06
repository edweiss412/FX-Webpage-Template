# Spec — Guard the `parseSheet` call site (edge-case audit rec-6 / finding #17)

**Date:** 2026-07-06
**Slug:** `parse-sheet-call-site-guard`
**Source:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/edge-case-preparedness-audit-2026-07-04.md` §3 Tier-3 finding #17, §5 recommendation 6 ("guard the `parseSheet` call site").
**Type:** defense-in-depth hardening of the ingestion pipeline. No UI, no DB migration, no advisory-lock topology change.

> **Implementation amendment (2026-07-06, caught by the full-suite gate).** The original design below minted a distinct non-catalog `ParseError.code` of `PARSE_THREW` and extended `runInvariants` to route it to `hard_fail`. During implementation the full test suite (`tests/cross-cutting/codes.test.ts` → `codeProducerLiterals()`, `lib/messages/__internal__/codeProducers.ts:14`) revealed that **every `code:` producer literal in `app/`+`lib/` MUST be a §12.4-cataloged code** — existing parser hardError codes like `MI-1_VERSION_DETECTION_FAILED` are all cataloged. A new `code: "PARSE_THREW"` literal is therefore an orphan and fails CI. The spec's "non-catalog hardError code" premise was wrong for a `code:` literal.
>
> **Resolution (implemented):** drop `PARSE_THREW` entirely. `buildThrownParsedSheet` reuses the already-cataloged `MI-1_VERSION_DETECTION_FAILED` hardError code — a caught throw is treated as the MI-1 "could not parse into a known version" outcome, which routes to `hard_fail` via the *existing* `invariants.ts:111` gate with **no `runInvariants` change** (§2.3 below is not implemented). The forensic "it was a THROW, not a genuinely-unrecognized sheet" distinction lives solely in the `PARSE_SHEET_THREW` app_events log (which IS legitimately non-catalog: `log.*` emission spans are stripped from the producer scan by `stripLogEmissionCalls`, provided the `log.error(` token is written contiguous — a multi-line `log\n.error(` is NOT recognized). Net effect on the observable outcome (retain last-good + `PARSE_ERROR_LAST_GOOD` for existing; `pending_ingestions` for first-seen; never crash the sync) is **identical** to the original design. Read §2.1–§2.3 as superseded by this amendment; §2.4/§2.5/§3/§4 stand except that every `PARSE_THREW` hardError code is now `MI-1_VERSION_DETECTION_FAILED`.

---

## 1. Problem

`prepareProcessOneFile` calls the parser unwrapped:

```ts
// lib/sync/runScheduledCronSync.ts:2775
const parsed = (deps.parseSheet ?? parseMarkdownSheet)(markdown, fileMeta.name);
```

The parser is contractually **non-throwing** — it degrades to a minimal `ParsedSheet` + `hardErrors[]` on every anticipated failure (`lib/parser/index.ts:516`, `parseSheet` never `throw`s by design; audit §2). But "never throws by design" is a design promise, not an enforced invariant. A novel show-bible structure that hits an *unanticipated* code path could throw at runtime. Today that throw:

- propagates out of `prepareProcessOneFile` (called at `runScheduledCronSync.ts:2542`, **before** the per-show lock at `:2568-2578`),
- is **not** one of the caught/classified failure kinds (`prepareProcessOneFile` only try/catches the enrich step `:2815` and binding reverify `:2864` — the parse call itself is bare),
- so it aborts the file's processing and, depending on the caller's loop handling, can fail the sync run instead of the graceful fail-closed handling every other parse failure gets.

This is a **Tier-3 signal gap**: the failure happens, but the pipeline crashes loudly-in-the-wrong-way (aborts the run) rather than routing to the established fail-closed path (retain last-good + admin alert for an existing show; stage for review for a first-seen show).

### What the established fail-closed path is (mirror target)

A normal parse hardError (e.g. MI-1) flows as data, not as an exception:

1. `parseSheet` returns a minimal `ParsedSheet` with `hardErrors: [{ code: "MI-1_VERSION_DETECTION_FAILED", ... }]` via `buildMinimalParsedSheet("v4", hardErrors)` (`lib/parser/index.ts:481-529`).
2. It flows through enrich (`:2803`) and into `runPhase1_unlocked` (`:2955`).
3. `runInvariants` maps the hardError to `hard_fail` (`lib/parser/invariants.ts:108-118, 231-233` — `versionFailed` fires on the `MI-1_VERSION_DETECTION_FAILED` code; any `failedCodes.length > 0` returns `{ outcome: "hard_fail" }`).
4. `processOneFile_unlocked` handles `phase1.outcome === "hard_fail"` (`runScheduledCronSync.ts:2970-3000`): for an **existing** show it `logSync`s the result, and — because Phase-1 already retained last-good — upserts a `PARSE_ERROR_LAST_GOOD` admin alert (`:2985-2992`). For a **first-seen** show (no existing `shows` row) `runInvariants`→`hard_fail` writes a `pending_ingestions` row via `upsertLivePendingIngestion` (`lib/sync/phase1.ts:369-379`) carrying `lastErrorCode`/`lastErrorMessage`/`lastWarnings`; **no `shows` row is written** (`showId` stays null), so nothing auto-publishes (fail-closed default; audit §2; `getAutoPublishCleanFirstSeen.ts:8`). The distinction is "no `shows` row," not "nothing written" — the pending_ingestions row is the first-seen review surface.

**Goal:** a caught throw at the parse call site produces the *same* observable outcome as a normal parse hardError, plus a distinct forensic signal that a throw (not an ordinary degrade) occurred.

---

## 2. Design

Three surgical changes. The parser stays pure (no `lib/log` import); the sync layer owns telemetry.

### 2.1 New non-catalog `ParseError.code`: `PARSE_THREW`

`ParseError` is `{ code: string; message: string; blockRef?: {...} }` (`lib/parser/types.ts:22`) — `code` is a **free string**, not the §12.4 admin-alert catalog. So `PARSE_THREW` needs **no** `gen:spec-codes` / `catalog.ts` / master-spec §12.4 lockstep. It is a forensic marker inside `hardErrors[]`, distinguishing "the parser crashed" from "not a sheet" (`MI-1_VERSION_DETECTION_FAILED`) and "ambiguous version" (`VERSION_AMBIGUOUS`).

### 2.2 Parser: exported minimal-sheet builder for the thrown case

`buildMinimalParsedSheet` is a private helper in `lib/parser/index.ts:481`. Add an exported thin wrapper so the sync layer constructs the *exact* same minimal `ParsedSheet` shape the parser itself uses (DRY — the shape stays owned by the parser, never hand-rolled in the sync layer):

```ts
// lib/parser/index.ts
export function buildThrownParsedSheet(message: string): ParsedSheet {
  return buildMinimalParsedSheet("v4", [
    { code: "PARSE_THREW", message },
  ]);
}
```

- `"v4"` placeholder mirrors the MI-1 stub (version genuinely unknown; Phase-1 gates on `hardErrors`, per the existing `:528` comment).
- Pure function — safe for parser unit tests, no side effects.
- `message` is caller-supplied (the extracted error message), so the thrown sheet carries the real diagnostic.

### 2.3 Invariants: route `PARSE_THREW` to `hard_fail`

Extend the existing MI-1 `versionFailed` predicate so a thrown-parse sheet hard-fails identically. **Reuse the `MI-1_VERSION_DETECTION_FAILED` failedCode** (already cataloged / rendered / routed via `lib/messages/lookup.ts`) — no new §12.4 code enters the routed/rendered path.

```ts
// lib/parser/invariants.ts — extend the versionFailed block (currently :108-118)
const parserThrew = next.hardErrors.some((e) => e.code === "PARSE_THREW");
const versionFailed =
  !validVersions.has(next.show.template_version) ||
  next.hardErrors.some((e) => e.code === "MI-1_VERSION_DETECTION_FAILED") ||
  parserThrew;

if (versionFailed) {
  failedCodes.push("MI-1_VERSION_DETECTION_FAILED");
  messages.push(
    parserThrew
      ? "Parser error: the sheet could not be parsed (unexpected internal error)."
      : `Version detection failed: got '${next.show.template_version}', expected v1/v2/v4`,
  );
}
```

- The routed/rendered code stays `MI-1_VERSION_DETECTION_FAILED` (cataloged); the operator-facing `messages` string is crash-specific so `last_error_message` reads honestly.
- `PARSE_THREW` never reaches `failedCodes[]` → never reaches any UI surface as a raw code → invariant 5 preserved.

### 2.4 Sync: guard the call site + forensic log

Wrap the parse call. Catch → forensic `log.error` with a durable `code:` (wires this previously-silent channel per audit rec-4 theme) → synthesize the thrown sheet → continue the pipeline unchanged.

```ts
// lib/sync/runScheduledCronSync.ts, replacing :2775
let parsed: ParsedSheet;
try {
  parsed = (deps.parseSheet ?? parseMarkdownSheet)(markdown, fileMeta.name);
} catch (error) {
  // The parser is contractually non-throwing (degrades to hardErrors). A throw here means a
  // novel structure hit an unanticipated path. Route it to the SAME fail-closed handling as a
  // parse hardError (retain last-good + PARSE_ERROR_LAST_GOOD for existing; stage for first-seen)
  // instead of aborting the sync. Audit rec-6 / finding #17.
  // Message extraction is itself guarded: a pathological throw value (an object with a throwing
  // `toString`/`valueOf`, or an Error whose `message` is a throwing getter) would make
  // `String(error)` or `.message` throw and re-break the guard. Fall back to a fixed string so
  // synthesis ALWAYS proceeds. (Note: `String(Symbol())` does NOT throw — it returns "Symbol()".)
  let message: string;
  try {
    message = error instanceof Error ? error.message : String(error);
  } catch {
    message = "unknown parser error (unstringifiable throw value)";
  }
  // Synthesize the fail-closed sheet FIRST — the guard must not depend on logging succeeding.
  parsed = buildThrownParsedSheet(message);
  // Forensic, best-effort: never let a logging fault (rejecting sink) break the guard or leak
  // an unhandled rejection. `log.error` returns a Promise (emit is async); swallow its rejection.
  void log
    .error("Parser threw on sheet parse; routing to hard_fail", {
      source: "sync",                 // LogFields.source is REQUIRED (lib/log/types.ts:5)
      code: "PARSE_SHEET_THREW",
      driveFileId,                     // canonical correlation field (lib/log/types.ts:8), NOT drive_file_id
      error,                           // raw error → serializeError handles Error / non-Error
    })
    .catch(() => {});
}
```

- The try/catch wraps the **injection seam** `(deps.parseSheet ?? parseMarkdownSheet)(...)`, so both the real parser and any test-injected `deps.parseSheet` are guarded (this is the test seam).
- **`parsed` is assigned before the log call**, so even a throwing/rejecting log sink (installed via `setLogSink`, `lib/log/logger.ts:90`) cannot prevent the fail-closed synthesis. The `.catch(() => {})` prevents an unhandled rejection (memory: unhandled rejections fail CI with all tests passing).
- `source: "sync"` is mandatory (`LogFields` requires `source`, `lib/log/types.ts:5`); `driveFileId` (camelCase) is the reserved correlation field mapped to `LogRecord.driveFileId` (`logger.ts:12,48`) — using `drive_file_id` would misfile the ID as free context, not the app_events join column.
- `PARSE_SHEET_THREW` is a **log-only forensic code** (free string on `log.error`'s second arg), distinct from the `PARSE_THREW` hardError code and from any §12.4 catalog code. The runtime logger persists ONLY the top-level `code` of the second argument (`lib/log/logger.ts:46`), so the code is placed as a top-level key of `args[1]` (as written above). **No existing meta-test structurally pins this call:** `tests/sync/_metaInfraContract.test.ts` is a Supabase infra-failure registry (does not parse `log.*` calls); the AST log-code guard `findLogErrorWarnCalls` lives in `tests/log/_metaAdminOutcomeContract.test.ts:307` but is scoped to a hardcoded admin-outcome registry, and the mutation-surface scanner (`tests/log/mutationSurface/enumerate.ts`) only covers route/action surfaces — `prepareProcessOneFile` is an internal sync function, out of both scopes. Correctness of the emit is therefore proved behaviorally by the §4.2 "forensic log emitted with correct fields" test (capturing the record via `setLogSink`), not by a static registry row.
- Downstream is byte-identical to a normal MI-1 flow: `parsed.show.agenda_links?.length` (`:2784`) is `[]` → skipped; `enrichWithDrivePins` already tolerates the minimal sheet (MI-1 already flows through it today); `runPhase1_unlocked` → `hard_fail`.

### 2.5 Advisory-lock invariant (invariant 2)

**Unchanged.** `prepareProcessOneFile` runs **before** the per-show lock (`:2542` is outside the `lock(...)` wrapper at `:2568`). The guard adds no `pg_advisory*` call, acquires no lock, and does not move any work across the lock boundary. No holder-topology change; `tests/auth/advisoryLockRpcDeadlock.test.ts` is untouched and unaffected.

---

## 3. Guard conditions

| Input / state | Behavior |
|---|---|
| `error` is an `Error` | `message = error.message` |
| `error` is a string / number / `undefined` / `null` (non-Error throw) | `message = String(error)` |
| `error` is unstringifiable (object with throwing `toString`/`valueOf`, or Error with throwing `message` getter) | message-extraction try/catch → fixed fallback string; synthesis still proceeds |
| Thrown on an **existing** show | `hard_fail` → last-good retained by Phase-1 → `PARSE_ERROR_LAST_GOOD` upserted (`:2985`) |
| Thrown on a **first-seen** show (no existing `shows` row) | `hard_fail` → `pending_ingestions` row written via `upsertLivePendingIngestion` (`phase1.ts:369`), **no `shows` row**, no auto-publish (fail-closed) — identical to a normal first-seen MI-1 hard_fail |
| Forensic `log.error` sink throws/rejects | `parsed` already synthesized → guard still routes to `hard_fail`; rejection swallowed, no unhandled rejection |
| Parser returns normally (no throw) | Unchanged — existing MI-1 / VERSION_AMBIGUOUS / pass paths untouched |
| Parser returns a normal MI-1 hardError | Unchanged — `PARSE_THREW` absent, `versionFailed` fires on the MI-1 code exactly as today |

---

## 4. Test plan (TDD)

Each test states the concrete failure mode it catches (anti-tautology rule).

### 4.1 Parser unit — `tests/parser/`
- **`buildThrownParsedSheet` shape.** Returns a minimal `ParsedSheet` with `hardErrors === [{ code: "PARSE_THREW", message }]`, empty `crewMembers`/`rooms`, `template_version === "v4"`. *Catches:* a future refactor that drops the `PARSE_THREW` code or changes the stub shape so it no longer routes to `hard_fail`.
- **`runInvariants` routes `PARSE_THREW` → `hard_fail`.** Feed a sheet carrying a `PARSE_THREW` hardError; assert `outcome === "hard_fail"` and `failedCodes` includes `MI-1_VERSION_DETECTION_FAILED` and `messages` includes the crash-specific string (not the "Version detection failed: got 'v4'" string). *Catches:* the OR-clause being dropped, which would let a thrown parse fall through to `pass` and auto-apply an empty sheet — the exact silent-data-loss vector this rec closes.

### 4.2 Sync e2e — `tests/sync/`
Use the `deps.parseSheet` injection to supply a parser that throws.
- **Sync survives the throw.** `prepareProcessOneFile` (and `processOneFile_unlocked`) with a throwing `deps.parseSheet` resolves without propagating the exception. *Catches:* the bare call site (no guard) — the injected throw aborts the call. This is the finding #17 regression test.
- **Existing show → retain last-good + alert.** With a throwing parser and a prior published show, assert `outcome === "hard_fail"`, the show's last-good data is retained (not clobbered), and a `PARSE_ERROR_LAST_GOOD` admin alert is upserted. *Catches:* a guard that catches the throw but fails to route to the hard_fail branch (e.g. synthesizing a `pass`-able sheet), silently overwriting live data.
- **First-seen → fail-closed pending_ingestions, no `shows` row.** With a throwing parser and no prior show, assert the outcome is `hard_fail`, a `pending_ingestions` row is written (`lastErrorCode === "MI-1_VERSION_DETECTION_FAILED"`), and **no `shows` row is published** (`showId` null) — mirroring a normal first-seen MI-1 hard_fail exactly. *Catches:* a first-seen throw leaking into auto-publish, AND a mis-assertion that "nothing is written" (a normal first-seen hard_fail DOES write pending_ingestions — `phase1.ts:369`, `phase1.test.ts:585`).
- **Forensic log emitted with correct fields.** Assert a `log.error` carrying `source: "sync"`, `code: "PARSE_SHEET_THREW"`, and `driveFileId` (the reserved field, mapped to `LogRecord.driveFileId`) is emitted on the throw path — capture via `setLogSink`. *Catches:* the channel going silent, and the ID being misfiled as free context instead of the join column.
- **Logging fault does not break the guard.** Install a `setLogSink` that throws/rejects, drive a parser throw, and assert the guard STILL routes to `hard_fail` (last-good retained / pending_ingestions written) with no unhandled rejection. *Catches:* a regression that awaits the log before synthesizing `parsed`, letting a logger fault re-break the sync (R1 finding-3 vector).
- **Pathological throw value does not break the guard.** Inject a `deps.parseSheet` that throws a value whose stringification genuinely fails — a non-Error object with a throwing `toString` (`{ toString() { throw new Error("boom"); } }`, which makes `String(error)` throw) AND/OR an `Error` subclass with a throwing `message` getter (`Object.defineProperty(err, "message", { get() { throw ...; } })`, which makes `error.message` throw). Do **not** use `throw Symbol()` — `String(Symbol())` returns `"Symbol()"` and does not throw, so it would leave the extraction catch unexercised (vacuous test). Assert the guard still synthesizes the thrown sheet and routes to `hard_fail`. *Catches:* the message-extraction line itself throwing before `parsed` is assigned (R2 finding-2 vector).

### 4.3 Meta / regression
- **No new structural meta-test is created or required.** `prepareProcessOneFile` is an internal sync function (not a route/action mutation surface), so `tests/log/_metaMutationSurfaceObservability.test.ts` does not cover it, and the AST log-code guard in `tests/log/_metaAdminOutcomeContract.test.ts` is scoped to a hardcoded admin-outcome registry that this call is not a member of. Correctness of the `log.error` fields is proved behaviorally (§4.2), not statically.
- Re-run `tests/sync/_metaInfraContract.test.ts` after the edit only to confirm the **Supabase call-boundary** scan is unaffected (the change adds no new Supabase call; this is a regression check, not a log-code assertion).
- Run the full parser + sync suites (`pnpm test`) — the change touches a shared chokepoint (`runInvariants`), so scoped gates are insufficient (memory: full-suite-before-push).

---

## 5. Out of scope
- Other rec-6 sub-items (MI-1 e2e gap-fill, known-sections walker, dims/address/date widening) — separate PRs.
- Adding `PARSE_THREW` / `PARSE_SHEET_THREW` to the §12.4 catalog — deliberately avoided; both are free-string codes, not admin-alert catalog codes. A future decision to surface a dedicated crew/admin-facing code for parser crashes is a separate §12.4 change.
- Enforcing non-throwing at the parser boundary for *all* callers (e.g. a `parseSheetSafe` wrapper every call site must use) — this spec guards the one production sync call site named in finding #17. Other `parseSheet` callers (tests, one-off scripts) are not live ingestion paths.

---

## 6. Watchpoints (disagreement-loop preempts)
- **Why not a new §12.4 code for the crash?** `ParseError.code` and `log.*` codes are free strings (`types.ts:22`); only the admin-alert catalog (`lib/messages/catalog.ts` ↔ master-spec §12.4) triggers the 3-way lockstep + `x1-catalog-parity` gate. The routed/rendered code stays `MI-1_VERSION_DETECTION_FAILED` (already cataloged). No §12.4 surface is touched. Deliberate; do not relitigate as "missing catalog row."
- **Why reuse the MI-1 failedCode instead of a distinct routed code?** To keep the crash out of any raw-code UI path (invariant 5) with zero catalog work. Forensic distinction lives in `hardErrors[].code === "PARSE_THREW"` and the `PARSE_SHEET_THREW` app-event, not in the routed code.
- **Advisory lock:** guard is pre-lock, adds no lock (§2.5). Not a topology change.
- **Parser purity:** the parser gains only a pure exported builder; `lib/log` stays out of `lib/parser/**`. Telemetry is emitted by the sync layer where `log` already lives (`runScheduledCronSync.ts:17`).
