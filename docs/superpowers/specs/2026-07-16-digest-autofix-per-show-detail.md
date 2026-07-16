# Spec — Digest autofix sub-block: per-show detail + fingerprint dedupe

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

- Rebuild the digest model's `autofix` signal per show from **all** in-window applied `sync_log` rows, **fingerprint-deduped** per show (same correction reported once regardless of how many syncs repeat it, distinct corrections all retained), carrying show title/slug and the autofix warning **messages**.
- Deterministic ordering: `ORDER BY occurred_at DESC` on the query; shows grouped in that stream order (most recently synced show first), stable under caps.
- Render sub-block 2 grouped by show, mirroring sub-block 1's structure (linked show title, bulleted messages, same caps/overflow).
- Flow 6.2 spec pointer notes at §3 signal 2 and §8 sub-block 2.

### Out of scope

- Any change to signals 1 (auto-applied), 3 (drift), 4 (new-show gaps), windowing/watermark (§4), wiring (§5), or subject lines (§8).
- Any DB change (read-path only; no DDL, no CHECK, no migration — §6/§7 of Flow 6.2 untouched).
- Admin UI autofix chip (`formatAutoFixBreakdown`, `lib/parser/dataGaps.ts:152-165`; consumer `components/admin/ShowsTable.tsx`) — unchanged; it summarizes a single parse, no inflation class there.
- The two agenda benign-warn codes (documented follow-on in `lib/parser/dataGaps.ts:100-107` comment) — still out.

## 3. Data derivation (amendment to Flow 6.2 §3 signal 2)

**Old:** separate query `select sl.parse_warnings from sync_log sl join shows s ... where s.published and sl.status='applied' and sl.occurred_at > :windowStart`; `accumulateAutoFixes` sums `summarizeAutoFixes(row.parse_warnings).classes` over all rows (`lib/notify/monitorDigest.ts:75-84,200-208`).

**New:** the standalone autofix query stays (event semantics: every correction applied in the window reports, even if a later in-window sync no longer carries it), extended to select attribution and an ordering key:

```sql
select sl.drive_file_id, s.slug, s.title, sl.parse_warnings, sl.occurred_at
  from public.sync_log sl
  join public.shows s on s.drive_file_id = sl.drive_file_id
 where s.published = true
   and sl.status = 'applied'
   and sl.occurred_at > :windowStart
 order by sl.occurred_at desc, sl.drive_file_id asc, sl.id asc
```

(`sync_log.id` is a random uuid (`supabase/migrations/20260501001000_internal_and_admin.sql:221-231`) — not monotonic, but a STABLE per-row tiebreak: same rows always return in the same order, including multiple same-show rows sharing an `occurred_at`. `drive_file_id` orders tied rows across shows and is non-null on every joined row since `shows.drive_file_id` is `not null unique`; `id` orders tied rows within a show.)

New pure function in `lib/notify/monitorDigest.ts`:

```ts
export function computeAutofixShows(rows: AutofixRow[]): { total: number; shows: MonitorShowGroup[] }
```

- Per row: extract autofix items via a new `listAutoFixItems(warnings)` helper in `lib/parser/dataGaps.ts` (see §4), each `{ code, item }`.
- **Fingerprint dedupe per show:** within a show (keyed by `drive_file_id`), an item is kept only the first time its fingerprint `` `${code} ${item}` `` is seen. Repeated syncs re-emitting the same warning collapse to one item (the reported inflation bug); distinct corrections across different in-window rows ALL survive (a 09:00 correction still reports even if the 10:00 sync no longer carries it — the section is "applied since your last digest", an event digest). Two genuinely identical corrections producing byte-identical messages also collapse — acceptable: identical text is indistinguishable to the reader anyway.
- **Ordering (deterministic under caps):** rows arrive `occurred_at desc, drive_file_id asc, id asc` (query `ORDER BY` above — fully deterministic for a fixed row set, including same-show timestamp ties). Shows are grouped in first-seen stream order — most recently synced shows first — so the 12-show cap keeps the most recent activity. Items within a show keep stream order (newest row's warnings first, in-array order preserved), so the 5-item cap is likewise deterministic.
- `shows`: `MonitorShowGroup[]` (`{ showTitle, slug, items }`, existing type at `lib/notify/monitorDigest.ts:27`); a show with zero autofix items is omitted.
- `total` = sum of `items.length` across ALL shows (pre-cap SOURCE total; = count of distinct fingerprints).

`accumulateAutoFixes` and the `WarningsRow` type are deleted (replaced by `computeAutofixShows` + `AutofixRow`). `MonitorDigestModel.autofix` changes from `AutoFixSummary` to `{ total: number; shows: MonitorShowGroup[] }`. The `AutoFixSummary` type and `summarizeAutoFixes` stay in `lib/parser/dataGaps.ts` (still used by `formatAutoFixBreakdown` + the admin chip).

**Semantics change (intentional, the point of the fix):** `autofix.total` now means "distinct autofix corrections applied in the window per show," not "sum over every applied row." Repetition across syncs no longer inflates the count; no real correction is dropped.

**Empty/overall-empty check:** `buildMonitorDigestModel`'s empty gate keeps using `autofix.total === 0` (`lib/notify/monitorDigest.ts:232-239`) — unchanged shape.

## 4. New helper — `listAutoFixItems` (in `lib/parser/dataGaps.ts`)

```ts
export function listAutoFixItems(
  warnings: readonly ParseWarning[] | null | undefined,
): { code: AutoFixCode; item: string }[]
```

- Same iteration/gating posture as `summarizeAutoFixes` (`lib/parser/dataGaps.ts:130-144`): skip `severity === "info"`, skip codes not in `AUTO_FIX_CODES`, tolerate `null`/`undefined`/`[]` (→ `[]`), tolerate non-warning leading payload objects (no `severity`/`code` — the `sync_log.parse_warnings` array's first element is a payload row per Flow 6.2 §3.2, not a `ParseWarning`).
- `item` is the warning's `message` when it is a non-empty string that is NOT raw-code-shaped; otherwise the class label from `AUTO_FIX_CLASSES` (`lib/parser/dataGaps.ts:108-115`). **Raw-code-shaped** = the trimmed message equals the warning's `code` or matches `/^[A-Z][A-Z0-9_]*$/` (a SHOUTY catalog-token — invariant 5: a jsonb row like `{ code: "STAGE_WORD_AUTOCORRECTED", message: "STAGE_WORD_AUTOCORRECTED" }` must never render a raw code in the email; the label substitutes). `ParseWarning.message` is typed required (`lib/parser/types.ts:48-51`), but rows arrive from jsonb — defensive fallback, never an empty or code-shaped item.
- `code` is the matched `AutoFixCode` — the caller's dedupe fingerprint is `` `${code} ${item}` `` (§3), so a label fallback in one class can never collapse with the same label text in another class.
- **Normalization (bounded items; messages quote arbitrary sheet cells):** before the raw-code-shaped check, the message is normalized with the same code-point contract as `sanitizeIdentityString` step 1 (`lib/adminAlerts/sanitizeIdentityString.ts:1-33,45`): zero-width/bidi format chars (U+200B-200D, U+FEFF, U+202A-202E, U+2066-2069) REMOVED; C0/C1 controls incl. `\n`/`\t` → space; whitespace collapsed; trimmed. No token/email redaction step (sub-block 1 `summary` strings already render un-redacted in this admin-only email — same posture). If the normalized result is empty or raw-code-shaped → label fallback. Finally the item is length-capped at 200 chars with `…` appended (cap AFTER the shape check so a truncated prefix can't dodge it; fingerprint dedupe operates on the final capped item). Whether implementation shares code with `sanitizeIdentityString` or replicates the two range tables is a plan-level choice; the ranges above are the contract.
- One returned entry per counted warning, so `listAutoFixItems(w).length === summarizeAutoFixes(w).total` for any input (property pinned by a test).

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
| message raw-code-shaped (`message === code` or SHOUTY token) | class label substituted upstream (§4); raw codes never render (invariant 5) |
| message multiline / control chars / zero-width-bidi chars | normalized upstream (§4): format chars removed, controls→space, whitespace collapsed — one visual line per item |
| message overlong (bad sheet cell) | length-capped at 200 chars + `…` upstream (§4); digest size stays bounded (12 shows × 5 items × ≤201 chars) |
| show count > 12 / items > 5 | cap + overflow note (SOURCE-derived counts) |
| N === 1 | `value` singular in the intro line |

**Subject lines:** unchanged (`templates/digest.ts:178-181`).

**`context.monitor_totals`:** keys unchanged (`{ autoAppliedShows, autoAppliedRows, autofixTotal, driftShows }`, `lib/notify/deliver.ts:722-725`); `autofixTotal` carries the new deduped total. Counts only, no PII — unchanged posture.

## 6. Invariant compliance

- **Inv 2 (advisory locks):** untouched — builder is read-only; no lock surface. No `pg_advisory*` in the diff.
- **Inv 3 (email canonicalization):** no raw emails handled.
- **Inv 5 (no raw codes in UI):** messages are plain language; fallback is the `AUTO_FIX_CLASSES` label, never `.code`.
- **Inv 9 (Supabase call-boundary):** `buildMonitorDigestModel` keeps its existing typed-result posture (`ok`/`empty`/`infra_error`) and its existing registration in `tests/notify/_metaInfraContract.test.ts:23` (postgres.js direct SQL); the autofix query is modified in place, no query added or removed from the registered surface. No new registry row needed. Run `tests/notify/_metaInfraContract.test.ts` after editing `lib/notify/monitorDigest.ts` (scanner is comment/format-fragile).
- **Inv 10 (mutation surface observability):** no new mutation surface; digest send path untouched.
- **PR #395 N=1 byte-parity:** untouched — that contract pins `realtimeProblem` batch templates and idempotency keys (`tests/notify/realtimeProblemBatchTemplate.test.ts`, `tests/notify/idempotencyKey.test.ts`), not digest body copy. The digest-scoped parity pin is `deliver.test.ts:676` ("monitor absent → context byte-identical"), which this change preserves (no context shape change).

## 7. Tier × domain matrix / CHECK matrix / flag lifecycle / dimensional invariants / transition inventory

- **DB matrix:** N/A — read-path-only change; no DDL, no CHECK, no RPC, no trigger, no cleanup, no migration.
- **CHECK/enum matrix:** N/A — no CHECK or enum touched.
- **Flag lifecycle:** N/A — no new flag/toggle.
- **Dimensional invariants / transition inventory:** N/A — email markup, no fixed-dimension layout, no interactive states.

## 8. Meta-test inventory

- `tests/notify/_metaInfraContract.test.ts`: **no change** — `lib/notify/monitorDigest.ts` already registered (`:23`); the autofix query is modified in place, no registry change (aligns §6/§9). Run it after every edit to `monitorDigest.ts`.
- No other registry applies (no tiles, no admin alerts, no advisory locks, no email-normalization surfaces touched). Declared: none created, none extended.

## 9. Test plan (anti-tautology; failure mode per test)

Existing files to update:

1. `tests/notify/monitorDigest.autofix.test.ts` — rewrite for `computeAutofixShows` + `listAutoFixItems`. Cases: payload-object skip; non-autofix-code skip; info-severity skip; item fallback to label (message absent / empty / non-string / raw-code-shaped — incl. `message === code` and an unrelated SHOUTY token, asserting no `_AUTOCORRECTED` substring in any emitted item); normalization (multiline message → single line; zero-width/bidi chars removed; 500-char message → 200 chars + `…`; overlong SHOUTY-token message → label fallback, proving the shape check runs pre-cap); property `listAutoFixItems(w).length === summarizeAutoFixes(w).total` over the fixture set; fingerprint dedupe (same code+message across two rows of one show → 1 item; two DIFFERENT messages across two rows → 2 items, both retained; same message text under two different codes → 2 items); show ordering + cap (13 shows with distinct `occurred_at` → the 12 most recent survive the cap, expected set derived from fixture timestamps). *Catches: helper counting/emitting divergence, fallback regressions, raw-code leak (invariant 5), dedupe collapse of distinct corrections, event-semantics drop, nondeterministic cap.*
2. `tests/notify/monitorDigest.autofix.db.test.ts` — currently seeds 2 in-window applied rows for ONE show and expects `total === 2` (`:73-74`), i.e. it PINS the inflation bug. Rewrite: same-show two rows carrying the SAME autofix warning → `total === 1`; same-show two rows carrying DIFFERENT warnings → both survive (`total === 2`) even though only one is the latest row; second show grouped separately with title/slug; rows returned newest-first (assert show order from fixture `occurred_at`); same-show rows with IDENTICAL `occurred_at` and >5 distinct items → identical rendered item set across two consecutive builder calls (pins the `sl.id asc` tiebreak). *Catches: dedupe regression to sum-over-rows (the exact reported bug), latest-row-only regression (dropping real corrections), title/slug drop, ORDER BY removal, tied-row nondeterminism under the item cap.*
3. `tests/notify/renderDigest.monitor.test.ts` — sub-block 2 assertions: heading, intro line singular/plural, per-show link href derived from fixture slug, message `<li>`s HTML-escaped (fixture message containing `<` & `'`), caps/overflow with fixture sizes exceeding 12/5 (expected overflow counts derived from fixture lengths, not hardcoded), absent when `total === 0`. Assert against the model fixture values, not by re-deriving from the rendered container. *Catches: template regression, escaping, cap math.*
4. `tests/notify/deliver.test.ts` — `monitor_totals.autofixTotal` still emitted from `input.monitor.autofix.total`; `:676` byte-parity case unchanged-green. *Catches: context shape drift.*
5. `tests/parser/dataGaps.test.ts` — `listAutoFixItems` unit cases live here if the helper's tests fit the file's existing structure; otherwise in (1). No changes to existing `summarizeAutoFixes` cases.

Structural: run `tests/notify/_metaInfraContract.test.ts` after editing `lib/notify/monitorDigest.ts` (comment/format-fragile scanner; registration at `:23`).

## 10. Disagreement-loop preempts (do not relitigate)

- **`autofixTotal` semantics change is intentional** — it is the bug being fixed (§1.2, §3). Not a silent behavior drift.
- **Dropping the per-class parenthetical is intentional** — per-show messages strictly dominate; class labels remain the fallback and the admin chip (`formatAutoFixBreakdown`) is untouched.
- **Fingerprint dedupe (not latest-row-only) is the ratified round-1 resolution** — latest-row-only was rejected in adversarial round 1 (high finding: drops a real 09:00 correction when the 10:00 sync no longer carries it). Event semantics stand: every distinct in-window correction reports once. Byte-identical messages collapsing (two identical typos in different sheet rows within the window) is the accepted residual — indistinguishable to the reader.
- **The autofix query stays separate from the drift query** — drift needs latest-row baseline/current pairs; autofix needs ALL in-window rows for fingerprint dedupe. Different row sets, one query each.
- **Raw-cell content in messages is accepted** — same class as sub-block 1 summaries (Flow 6.2 §8 guard table row on `summary`); admin-only recipient list.
- **Flow 6.2 §8 "No per-show breakdown in v1" is superseded by this amendment** — that sentence gets the pointer note.

## 11. Watchpoints

- `sync_log.parse_warnings` rows on the cron path exist only post Flow 6.2 §3.2 sink fix — already landed; no dependency here.
- Local DB tests share the sibling-worktree Postgres — real CI is arbiter on `monitorDigest.autofix.db.test.ts` (memory: sibling-worktree shared-DB pollution).
- Never run prettier on the master spec; this spec and Flow 6.2 pointer notes are normal markdown (safe), but do not let format sweeps touch `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`.
