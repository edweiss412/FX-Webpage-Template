# Spec — Digest autofix sub-block: per-show detail + latest-row dedupe

**Date:** 2026-07-16
**Status:** Draft (autonomous-ship pipeline; user gates waived)
**Amends:** Flow 6.2 monitor digest spec (`docs/superpowers/specs/2026-07-08-flow6.2-monitor-digest.md`) — §3 signal-2 derivation and §8 sub-block 2. This spec is the ratified amendment; the Flow 6.2 spec gets pointer notes at both amended clauses in the same commit that lands this spec (rule 7: spec is canonical, amendments are explicit).

---

## 1. Intent

Today's digest autofix line is an aggregate with no context: `We automatically corrected 4 values (corrected stage word: 4).` — no show, no corrected values. User feedback (2026-07-16, live digest email): "not enough context to be useful."

Two defects:

1. **No attribution/detail.** `renderMonitorSection` sub-block 2 (`lib/notify/templates/digest.ts:66-74`) renders only `autofix.total` + per-class counts from `AUTO_FIX_CLASSES` labels. The underlying `ParseWarning.message` strings already carry full human-readable detail (e.g. `Read likely-misspelled stage word(s) 'Sage' as 'Stage' in role cell: '...'`, `lib/parser/blocks/crew.ts:346-348`), and the autofix query already joins `shows` — but selects only `sl.parse_warnings`, dropping `s.title`/`s.slug` (`lib/notify/monitorDigest.ts:200-207`).
2. **Count inflation.** `accumulateAutoFixes` sums `summarizeAutoFixes` over **every** applied `sync_log` row in the window (`lib/notify/monitorDigest.ts:75-84`, query at `:200-207`). A show that syncs 4 times in the window with the same recurring stage-word warning reports "corrected 4 values" when the sheet carries 1 corrected value. The sibling drift query already dedupes to the latest row per show/phase via `row_number() ... rn = 1` (`lib/notify/monitorDigest.ts:212-228`); the autofix query does not.

## 2. Scope

### In scope

- Rebuild the digest model's `autofix` signal per show from each show's **latest** in-window applied `sync_log` row (dedupe), carrying show title/slug and the autofix warning **messages**.
- Render sub-block 2 grouped by show, mirroring sub-block 1's structure (linked show title, bulleted messages, same caps/overflow).
- Delete the now-redundant standalone autofix query (`lib/notify/monitorDigest.ts:200-207`) — the drift query's `phase = 'current'` `rn = 1` rows ARE the latest in-window applied row per published show; derive autofix from those rows.
- Flow 6.2 spec pointer notes at §3 signal 2 and §8 sub-block 2.

### Out of scope

- Any change to signals 1 (auto-applied), 3 (drift), 4 (new-show gaps), windowing/watermark (§4), wiring (§5), or subject lines (§8).
- Any DB change (read-path only; no DDL, no CHECK, no migration — §6/§7 of Flow 6.2 untouched).
- Admin UI autofix chip (`formatAutoFixBreakdown`, `lib/parser/dataGaps.ts:152-165`; consumer `components/admin/ShowsTable.tsx`) — unchanged; it summarizes a single parse, no inflation class there.
- The two agenda benign-warn codes (documented follow-on in `lib/parser/dataGaps.ts:100-107` comment) — still out.

## 3. Data derivation (amendment to Flow 6.2 §3 signal 2)

**Old:** separate query `select sl.parse_warnings from sync_log sl join shows s ... where s.published and sl.status='applied' and sl.occurred_at > :windowStart`; `accumulateAutoFixes` sums `summarizeAutoFixes(row.parse_warnings).classes` over all rows (`lib/notify/monitorDigest.ts:75-84,200-208`).

**New:** no standalone autofix query. Reuse the existing drift query's result rows (`lib/notify/monitorDigest.ts:212-228`): its `phase = 'current'`, `rn = 1` rows are exactly "the latest applied `sync_log` row per published show with `occurred_at > windowStart`" — the drift CTE partitions by `(drive_file_id, phase)` ordered `occurred_at desc`, and `current` is defined as `occurred_at > :windowStart`. Those rows already select `drive_file_id, slug, title, phase, parse_warnings`.

New pure function in `lib/notify/monitorDigest.ts`:

```ts
export function computeAutofixShows(rows: DriftRow[]): { total: number; shows: MonitorShowGroup[] }
```

- Considers only `phase === "current"` rows (one per show by the query's `rn = 1`; the function itself takes the first row seen per `drive_file_id` so a malformed input can't double-count).
- Per row: extract autofix messages via a new `listAutoFixMessages(warnings)` helper in `lib/parser/dataGaps.ts` (see §4). Empty result → show omitted.
- `shows`: `MonitorShowGroup[]` (`{ showTitle, slug, items }`, existing type at `lib/notify/monitorDigest.ts:27`), `items` = the messages. Show order = first-seen input-row order (Map insertion) — the outer drift select has no `ORDER BY`, so DB row order is technically unspecified; this matches `computeDrift`'s existing posture (`lib/notify/monitorDigest.ts:101-132`, same Map-insertion order), and tests control order via fixtures.
- `total` = sum of `items.length` across ALL shows (pre-cap SOURCE total).

`accumulateAutoFixes` and the `WarningsRow` type are deleted. `MonitorDigestModel.autofix` changes from `AutoFixSummary` to `{ total: number; shows: MonitorShowGroup[] }`. The `AutoFixSummary` type and `summarizeAutoFixes` stay in `lib/parser/dataGaps.ts` (still used by `formatAutoFixBreakdown` + the admin chip).

**Semantics change (intentional, the point of the fix):** `autofix.total` now means "autofix corrections present in each published show's latest in-window applied parse," not "sum over every applied row." A show whose latest row carries no autofix warnings contributes 0 even if earlier in-window rows did — correct: the correction is no longer present.

**Empty/overall-empty check:** `buildMonitorDigestModel`'s empty gate keeps using `autofix.total === 0` (`lib/notify/monitorDigest.ts:232-239`) — unchanged shape.

## 4. New helper — `listAutoFixMessages` (in `lib/parser/dataGaps.ts`)

```ts
export function listAutoFixMessages(warnings: readonly ParseWarning[] | null | undefined): string[]
```

- Same iteration/gating posture as `summarizeAutoFixes` (`lib/parser/dataGaps.ts:130-144`): skip `severity === "info"`, skip codes not in `AUTO_FIX_CODES`, tolerate `null`/`undefined`/`[]` (→ `[]`), tolerate non-warning leading payload objects (no `severity`/`code` — the `sync_log.parse_warnings` array's first element is a payload row per Flow 6.2 §3.2, not a `ParseWarning`).
- Returns the warning's `message` when it is a non-empty string; otherwise falls back to the class label from `AUTO_FIX_CLASSES` (`lib/parser/dataGaps.ts:108-115`). `ParseWarning.message` is typed required (`lib/parser/types.ts:48-51`), but rows arrive from jsonb — defensive fallback, never an empty item.
- One returned string per counted warning, so `listAutoFixMessages(w).length === summarizeAutoFixes(w).total` for any input (property pinned by a test).

## 5. Email content (amendment to Flow 6.2 §8 sub-block 2)

Sub-block 2 becomes structurally identical to sub-block 1, with an intro line:

**Heading (HTML `<h3>` / text line):** `Autocorrects applied`
**Intro line (`<p>` / text):** `We automatically corrected N values.` (`value` when N === 1; N = `autofix.total`, the SOURCE total). The per-class parenthetical is dropped — the per-show messages carry strictly more information.
**Per show** (same markup as sub-block 1, `lib/notify/templates/digest.ts:38-63`): `<h4>` linked title (`showHref` — `${origin}/admin/show/${slug}`, or `${origin}/admin` when slug null; `Untitled show` when title null) + `<ul>` of message strings, HTML-escaped.
**Caps:** `DIGEST_MAX_SHOWS` (12) shows, `DIGEST_MAX_ITEMS_PER_SHOW` (5) items/show (`lib/notify/constants.ts:16-17`); overflow `+N more on this show` / `+M more shows` linking `${origin}/admin`, counts derived from SOURCE totals — exactly the sub-block-1 pattern.

Messages are parser-authored plain language (`Read likely-misspelled … 'X' as 'Y' …` — all nine emit sites surveyed across `lib/parser/blocks/*.ts`); no raw codes (invariant 5); the label fallback (§4) covers malformed rows. Messages may quote raw sheet cell content (role cells, headers) — same exposure class as sub-block 1's `show_change_log.summary` strings (crew names), already accepted for this admin-only email (Flow 6.2 §8).

**Sub-block order** unchanged: auto-applied, autocorrects, drift, new shows.

### Guard conditions

| Input | Behavior |
|---|---|
| `monitor` absent | section absent; output byte-identical to pre-6.2 (unchanged) |
| `autofix.total === 0` | sub-block 2 entirely absent (heading + intro + groups) |
| `autofix.total > 0`, a show's `items` `[]` | cannot occur — `computeAutofixShows` omits empty shows; template renders what the model carries |
| `showTitle` null | `Untitled show` (mirrors `templates/digest.ts:40`) |
| `slug` null | link `${origin}/admin` (existing `showHref`, `templates/digest.ts:16-18`) |
| message missing/empty/non-string in jsonb | class label substituted upstream (§4); item never empty |
| show count > 12 / items > 5 | cap + overflow note (SOURCE-derived counts) |
| N === 1 | `value` singular in the intro line |

**Subject lines:** unchanged (`templates/digest.ts:178-181`).

**`context.monitor_totals`:** keys unchanged (`{ autoAppliedShows, autoAppliedRows, autofixTotal, driftShows }`, `lib/notify/deliver.ts:722-725`); `autofixTotal` carries the new deduped total. Counts only, no PII — unchanged posture.

## 6. Invariant compliance

- **Inv 2 (advisory locks):** untouched — builder is read-only; no lock surface. No `pg_advisory*` in the diff.
- **Inv 3 (email canonicalization):** no raw emails handled.
- **Inv 5 (no raw codes in UI):** messages are plain language; fallback is the `AUTO_FIX_CLASSES` label, never `.code`.
- **Inv 9 (Supabase call-boundary):** `buildMonitorDigestModel` keeps its existing typed-result posture (`ok`/`empty`/`infra_error`) and its existing registration (postgres.js direct SQL, header comment `lib/notify/monitorDigest.ts:22`); one query DELETED, none added. No new registry row needed.
- **Inv 10 (mutation surface observability):** no new mutation surface; digest send path untouched.
- **PR #395 N=1 byte-parity:** untouched — that contract pins `realtimeProblem` batch templates and idempotency keys (`tests/notify/realtimeProblemBatchTemplate.test.ts`, `tests/notify/idempotencyKey.test.ts`), not digest body copy. The digest-scoped parity pin is `deliver.test.ts:676` ("monitor absent → context byte-identical"), which this change preserves (no context shape change).

## 7. Tier × domain matrix / CHECK matrix / flag lifecycle / dimensional invariants / transition inventory

- **DB matrix:** N/A — read-path-only change; no DDL, no CHECK, no RPC, no trigger, no cleanup, no migration.
- **CHECK/enum matrix:** N/A — no CHECK or enum touched.
- **Flag lifecycle:** N/A — no new flag/toggle.
- **Dimensional invariants / transition inventory:** N/A — email markup, no fixed-dimension layout, no interactive states.

## 8. Meta-test inventory

- `tests/auth/_metaInfraContract.test.ts`: **no change** — `monitorDigest.ts` already registered (header comment cites it); surface count of Supabase/postgres call sites decreases by one query in the same function.
- No other registry applies (no tiles, no admin alerts, no advisory locks, no email-normalization surfaces touched). Declared: none created, none extended.

## 9. Test plan (anti-tautology; failure mode per test)

Existing files to update:

1. `tests/notify/monitorDigest.autofix.test.ts` — rewrite for `computeAutofixShows` + `listAutoFixMessages`. Cases: payload-object skip; non-autofix-code skip; info-severity skip; message fallback to label (message absent / empty / non-string); property `listAutoFixMessages(w).length === summarizeAutoFixes(w).total` over the fixture set. *Catches: helper counting/emitting divergence, fallback regressions.*
2. `tests/notify/monitorDigest.autofix.db.test.ts` — currently seeds 2 in-window applied rows for ONE show and expects `total === 2` (`:73-74`), i.e. it PINS the inflation bug. Rewrite: same-show two rows with 1 autofix warning each → `total === 1` and the message from the LATER row only; second show with its own row → grouped separately with title/slug. *Catches: dedupe regression to sum-over-rows (the exact reported bug), and title/slug drop.*
3. `tests/notify/renderDigest.monitor.test.ts` — sub-block 2 assertions: heading, intro line singular/plural, per-show link href derived from fixture slug, message `<li>`s HTML-escaped (fixture message containing `<` & `'`), caps/overflow with fixture sizes exceeding 12/5 (expected overflow counts derived from fixture lengths, not hardcoded), absent when `total === 0`. Assert against the model fixture values, not by re-deriving from the rendered container. *Catches: template regression, escaping, cap math.*
4. `tests/notify/deliver.test.ts` — `monitor_totals.autofixTotal` still emitted from `input.monitor.autofix.total`; `:676` byte-parity case unchanged-green. *Catches: context shape drift.*
5. `tests/parser/dataGaps.test.ts` — `listAutoFixMessages` unit cases live here if the helper's tests fit the file's existing structure; otherwise in (1). No changes to existing `summarizeAutoFixes` cases.

Structural: run `tests/auth/_metaInfraContract.test.ts` after editing `monitorDigest.ts` (comment/format-fragile scanner — memory: `_metaInfraContract` catch-window).

## 10. Disagreement-loop preempts (do not relitigate)

- **`autofixTotal` semantics change is intentional** — it is the bug being fixed (§1.2, §3). Not a silent behavior drift.
- **Dropping the per-class parenthetical is intentional** — per-show messages strictly dominate; class labels remain the fallback and the admin chip (`formatAutoFixBreakdown`) is untouched.
- **Coupling autofix to the drift query is intentional** — the drift `current` rows are definitionally the dedupe target ("latest in-window applied row per published show"); a second query would re-implement the same CTE (class-sweep: one dedupe implementation, not two). Drift's own guards (baseline-required) do NOT apply to autofix: `computeAutofixShows` uses current-phase rows regardless of baseline presence, so a first-seen show's autofixes still report (unlike drift §3.1 guard 1 — different signal, different rule, both stated here).
- **Raw-cell content in messages is accepted** — same class as sub-block 1 summaries (Flow 6.2 §8 guard table row on `summary`); admin-only recipient list.
- **Flow 6.2 §8 "No per-show breakdown in v1" is superseded by this amendment** — that sentence gets the pointer note.

## 11. Watchpoints

- `sync_log.parse_warnings` rows on the cron path exist only post Flow 6.2 §3.2 sink fix — already landed; no dependency here.
- Local DB tests share the sibling-worktree Postgres — real CI is arbiter on `monitorDigest.autofix.db.test.ts` (memory: sibling-worktree shared-DB pollution).
- Never run prettier on the master spec; this spec and Flow 6.2 pointer notes are normal markdown (safe), but do not let format sweeps touch `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`.
