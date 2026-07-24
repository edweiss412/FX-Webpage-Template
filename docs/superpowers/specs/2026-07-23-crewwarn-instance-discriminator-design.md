# CREWWARN instance discriminator + group eyebrow wrap — design

**Date:** 2026-07-23
**Branch:** `feat/crewwarn-instance-discriminator`
**Resolves:** `DEFERRED.md` `CREWWARN-INSTANCE-DISCRIMINATOR-1` (P1) + `CREWWARN-INCARD-MOBILE-EYEBROW-1` (P2)
**Origin:** impeccable critique of `feat/crewwarn-underrow-polish` (dispositions: `docs/superpowers/plans/2026-07-23-crewwarn-underrow-polish-closeout.md` §12)

## 1. Problem

**P1 — indistinguishable same-code cards.** A crew member with BOTH an unreadable phone and an unreadable email produces two `FIELD_UNREADABLE` warnings. `PerShowActionableWarnings` renders the catalog title ("Phone or email we couldn't use", `lib/messages/catalog.ts:1767`) which displaces the instance-specific `.message` (invariant 5; `components/admin/PerShowActionableWarnings.tsx:139`), and the detail-band row label is gated to `UNKNOWN_FIELD` only (`components/admin/PerShowActionableWarnings.tsx:199`). The two cards are byte-identical; Report/Ignore fire on a target Doug cannot visually distinguish. Pre-existing grain on the full-mode group list too (two different members' unreadable phones are equally identical there).

**P2 — eyebrow truncation at 390px.** The data-quality group eyebrow (`components/admin/BulkIgnoreControls.tsx:161`) carries `min-w-0 truncate`; inside the padded panel card at 390px it ellipsizes ("PHONE OR EMAIL WE COUL…").

### 1.1 Resolved scope — do not relitigate

1. **Discriminator = Option B, context-aware detail band** (owner-ratified 2026-07-23 via mockup review, this session): field label + unusable value; member name added ONLY on surfaces where cards from different members mix. NOT Option C (inline instance sentence) — it fights the just-shipped condensed variant (spec `2026-07-23-crewwarn-underrow-polish` §3).
2. **Under-row (condensed) band omits the member name** (owner-ratified same session): under-row cards are member-scoped (rendered under the member's crew row via `renderCrewUnderRowCards` in `components/admin/showpage/PublishedReviewModal.tsx` / `sectionWarningExtras.tsx`), so the name would duplicate the row heading directly above.
3. **Eyebrow fix = wrap, not shorter catalog title** (owner-ratified same session): drop `truncate`; the title is shared catalog copy and a rename would fan out through the §12.4 lockstep (three-surface rule, AGENTS.md).
4. **The "Ignore all N" chip may still wrap to two lines at 390px.** Accepted in the original deferral ("no overlap, still legible", `DEFERRED.md` line 19). `whitespace-nowrap` is NOT added: the armed morph "Confirm ignore all N" (`BulkIgnoreControls.tsx:149`) needs wrap headroom at 390px.
5. **Shared ignore fingerprint stays content-only.** The IGNORE fingerprint is `{code, rawSnippet}` by design (`lib/dataQuality/warningIdentity.ts:15` "the IGNORE fingerprint stays content-only by design"; POST body at `BulkIgnoreControls.tsx:94`). Two members with the SAME unreadable value share a fingerprint; one Ignore clears both cards. The new band makes this pre-existing grain visible but does NOT change it — a fingerprint change is its own future spec.
6. **No catalog / §12.4 edits.** Band labels are UI chrome (same class as the existing "Sheet row" label, `PerShowActionableWarnings.tsx:207`), not catalog copy; the frozen copy table (`tests/messages/warningCardCopyRegistry.ts`) is untouched.
7. **Legacy persisted warnings without `blockRef.field` render no band** (graceful absence, no worse than today). Warnings are regenerated on every sync/parse, so the band appears after the next sync; no backfill.

## 2. Design

### 2.1 Producer: persist the field discriminator

`emitFieldUnreadable` (`lib/parser/warnings.ts:76`) already receives `field: "phone" | "email"` from both call sites (`lib/parser/blocks/crew.ts:304` phone, `lib/parser/blocks/crew.ts:321` email) and uses it only for message wording. Change: store it on the warning's `blockRef` — the optional `field?: string` slot already exists in the type (`lib/parser/types.ts:60`) with zero current writers.

```ts
blockRef: { kind: params.section, index: params.index, name: params.name, field: params.field },
```

- `emitFieldUnreadable`'s params type gains nothing — `field` is already a param.
- Additive on the jsonb-persisted shape (`shows_internal.parse_warnings`, `lib/parser/types.ts:90` comment); `blockRef` and `field` are both optional, so no fixture CASTs break.
- `warningIdentityKey` (`lib/dataQuality/warningIdentity.ts:9`) does not read `blockRef.field`, so React keys are unchanged — no remount of surviving cards on ignore-refresh.
- **Dedup key fix (latent hidden-card bug).** The `operatorActionableWarnings` dedup key for anchored warnings is `(code, gid, a1[, index for FIELD_UNREADABLE])` (`lib/parser/dataGaps.ts:420-430`) — it contains NO content. FIELD_UNREADABLE anchors resolve per-ROW by `blockRef.name` to the member's crew-role cell (`lib/drive/showDayTimeAnchors.ts:146-154`), so phone + email for ONE member resolve to the SAME a1 and share the same `blockRef.index` — the second warning is dedup-collapsed and its card silently hidden whenever anchors resolve, violating the function's own "no actionable row is ever hidden" guarantee (`lib/parser/dataGaps.ts:398-399`). Fix in the same diff: fold `blockRef.field` into the FIELD_UNREADABLE `rowDisc` alongside `index` (`\0${index}\0${field}` when field present). Legacy warnings without `field` keep today's key (backward compatible). Both cards deep-link to the same crew-role cell — acceptable; the link's contract is "the member's row", per the region-fallback precedent in the same branch.

### 2.2 Card: FIELD_UNREADABLE detail band

In `PerShowActionableWarnings`, alongside the existing UNKNOWN_FIELD `rowLabel` band (mutually exclusive by code):

- **Gate:** `w.code === "FIELD_UNREADABLE"` AND `blockRef.field` is a non-empty string after trim. Absent/empty/whitespace field ⇒ no band (guard table §2.4).
- **Label** (uppercase eyebrow, same classes as "Sheet row" label at `PerShowActionableWarnings.tsx:207`): `Phone` when `field === "phone"`, `Email` when `field === "email"`, else the trimmed field value verbatim (future-proof; only these two are emitted today).
- **Value** (same classes as the row-label value at `components/admin/PerShowActionableWarnings.tsx:211`, `font-mono text-xs text-text`):
  - **Full mode** (`condensed !== true`): `{name} · "{value}"` — name = `blockRef.name` trimmed; value = `rawSnippet` trimmed.
  - **Condensed mode** (`condensed === true`, under-row): `"{value}"` only.
- Separator is the middle dot `·` (em-dash ban, AGENTS.md pre-code mechanical gate). Quotes are straight double quotes, matching the producer's own message quoting (`lib/parser/warnings.ts:93`).
- `data-testid`: `per-show-actionable-field-label` (band) and `per-show-actionable-field-label-value` (value span), mirroring the row-label pair at `components/admin/PerShowActionableWarnings.tsx:205` and `components/admin/PerShowActionableWarnings.tsx:212`.
- Band is non-interactive text — no tap-target requirement.
- Long values: the band container is the existing `CompactAlertCard` detail band (`components/admin/CompactAlertCard.tsx:115-120`); the value span gets `break-all` so an arbitrarily long unusable cell value wraps inside the card instead of overflowing (cap behavior — no truncation, wrap).

### 2.3 Surfaces affected (mode boundaries)

| Surface | Mode | Band content |
| --- | --- | --- |
| Under-row cards (published modal crew rows) | condensed | `PHONE · "value"` |
| Data-quality group list (per-show panel via `sectionWarningExtras.tsx:265`) | full | `PHONE · Jordan Ellis · "value"` |
| Ignored (muted) list | full | same as group list (band renders in muted tone context unchanged) |
| StagedReviewCard (`components/admin/StagedReviewCard.tsx:521`) | full | same as group list — the staged snapshot baseline (`tests/components/admin/stagedCardBaseline.test.tsx`) changes DELIBERATELY; snapshots updated in the same task |

### 2.4 Guard table (band inputs)

| `blockRef.field` | `blockRef.name` | `rawSnippet` | Renders |
| --- | --- | --- | --- |
| absent/empty/ws | any | any | no band (legacy path, §1.1 #7) |
| `"phone"`/`"email"` | non-empty | non-empty | full: `Phone · name · "value"`; condensed: `Phone · "value"` |
| `"phone"`/`"email"` | absent/empty/ws | non-empty | full: `Phone · "value"` (name segment dropped, no dangling separator); condensed unchanged |
| `"phone"`/`"email"` | any | absent/empty/ws | `Phone · name` (full) / `Phone` (condensed) — value segment + quotes dropped entirely, never `""` |
| other non-empty string | per above | per above | label = trimmed value verbatim, same segment rules |

`blockRef.name` is the RAW name cell (pre-restriction-strip, `lib/parser/blocks/crew.ts:292-294`) — displayed verbatim; it matches what Doug sees in the sheet.

### 2.5 Eyebrow wrap

`BulkIgnoreControls.tsx:161`: remove `truncate` from the eyebrow span (keep `min-w-0`). Label wraps to a second line at narrow widths; hairline rule + chip keep their flex row. Single call site (`components/admin/showpage/sectionWarningExtras.tsx:265`) — the DEFERRED entry's "wizard step3 groups" claim is stale; `rg -n "BulkIgnoreControls" app components` returns only `sectionWarningExtras.tsx` (verified 2026-07-23).

### 2.6 Transition inventory

None — the band and eyebrow are static text; no new visual states, no animation. Explicit: all renders instant.

### 2.7 Dimensional invariants

None new — no fixed-dimension parent introduced. The band lives inside the existing flex-wrap detail band row; the eyebrow row keeps `flex items-center` with the rule as the flexible spacer.

## 3. Tests (TDD per task)

1. **Parser:** `emitFieldUnreadable` stores `blockRef.field` (`"phone"` and `"email"` branches); message + rawSnippet unchanged (extend `tests/parser/warnings.test.ts` / `tests/parser/blocks/crew.test.ts`).
1b. **Dedup:** same-member phone + email FIELD_UNREADABLE warnings with the SAME resolved `sourceCell` (a1) and index BOTH survive `operatorActionableWarnings` when `blockRef.field` differs (this test FAILS red today — it pins the hidden-card bug); legacy pair without `field` keeps today's collapse (extend `tests/parser/operatorActionableWarnings.test.ts`).
2. **Component (full mode):** two FIELD_UNREADABLE items (phone + email, same member) render two bands with distinct label + value text; assert against the fixture's `blockRef.field`/`name`/`rawSnippet`, never hardcoded strings disconnected from the fixture (anti-tautology). Guard rows: absent field ⇒ no band; empty name ⇒ no dangling `·`; empty rawSnippet ⇒ no empty quotes.
3. **Component (condensed):** same fixtures with `condensed` ⇒ name absent from band text (assert band textContent does NOT contain the fixture name), value present.
4. **UNKNOWN_FIELD exclusivity:** UNKNOWN_FIELD card keeps its `Sheet row` band; FIELD_UNREADABLE never renders both bands.
5. **Snapshot:** `stagedCardBaseline` snapshots updated deliberately (band now present on staged cards with `blockRef.field`).
6. **Eyebrow:** component assertion that the eyebrow span's class list has no `truncate`; real-browser layout assertion at 390px on the capped harness route (standalone config, `tests/e2e/standalone.config.ts --project=standalone-chromium`) that the full eyebrow text is not ellipsized (scrollWidth ≤ clientWidth) — jsdom cannot compute this.
7. **Meta-test inventory:** none created/extended — no new Supabase call boundary, no admin mutation surface, no advisory lock, no catalog code. The existing structural guards (x1/x2 code scanners) are unaffected: no new `code:` literal.

## 4. Out of scope

- Ignore fingerprint granularity (§1.1 #5).
- Any catalog/§12.4 copy change (§1.1 #6).
- Chip copy or wrap behavior (§1.1 #4).
- Backfill of persisted warnings (§1.1 #7).
