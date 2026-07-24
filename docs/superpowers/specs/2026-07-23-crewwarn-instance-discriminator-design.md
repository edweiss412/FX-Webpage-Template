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

`emitFieldUnreadable` (`lib/parser/warnings.ts:76`) already receives `field: "phone" | "email"` from both call sites (`lib/parser/blocks/crew.ts:304` phone, `lib/parser/blocks/crew.ts:321` email) and uses it only for message wording. Change: store it on the warning's `blockRef` — the optional `field?: string` slot exists in the type (`lib/parser/types.ts:60`) and is already written by three OTHER codes (`ROOM_HEADER_SPLIT_AMBIGUOUS` `lib/parser/warnings.ts:188`, `HOTEL_GUEST_SPLIT_AMBIGUOUS` `lib/parser/warnings.ts:236-240`, `DATE_ORDER_SUGGESTS_DMY` `lib/parser/warnings.ts:317`); FIELD_UNREADABLE just becomes the fourth writer. Existing `blockRef.field` consumers are safe additively: `blockRefMatches` in the use-raw path compares `field` only when the caller's ref carries one (`lib/sync/useRawDecisionState.ts:46-53`), and FIELD_UNREADABLE emits no `resolution`, so it never enters use-raw flows; the wizard field-label reader keys off other codes.

```ts
blockRef: { kind: params.section, index: params.index, name: params.name, field: params.field },
```

- `emitFieldUnreadable`'s params type gains nothing — `field` is already a param.
- Additive on the jsonb-persisted shape (`shows_internal.parse_warnings`, `lib/parser/types.ts:90` comment); `blockRef` and `field` are both optional, so no fixture CASTs break.
- **Identity key fix (report-surface collision).** `warningIdentityKey` (`lib/dataQuality/warningIdentity.ts:9`) omits `blockRef.field`, and it feeds `buildReportSurfaceId` (`lib/dataQuality/warningFingerprint.ts:17-20`) whose surfaceId keys `ReportModal`'s sessionStorage draft/idempotency state (`components/shared/ReportModal.tsx` `fxav-report-attempt-${surfaceId}`). A member whose phone AND email cells hold the SAME unusable value (same normalized `rawSnippet`, same anchor a1, same index) would give both cards one identity — occurrence-suffixed React keys (`stableWarningKeys`) and a SHARED report surfaceId (one card's draft hydrates under the other). Fix in the same diff: fold `blockRef.field` into `warningIdentityKey` for `FIELD_UNREADABLE`, mirroring the existing `UNKNOWN_ROLE_TOKEN` `roleToken` fold (`lib/dataQuality/warningIdentity.ts:20-24`). Legacy warnings without `field` keep the fold-free key. Consequence: FIELD_UNREADABLE cards WITH `field` get new React keys and new report surfaceIds once, at the first sync after deploy — a one-time remount/draft-reset on a surface whose data changed anyway; within any session the key is stable (field never mutates), so ignore-refresh card stability is preserved. The IGNORE fingerprint (`warningFingerprint`, code + normalized snippet, `lib/dataQuality/warningFingerprint.ts:9-14`) is a separate function and stays untouched (§1.1 #5). **AMENDED 2026-07-24 (whole-diff review R1): the fold serialization is `\0F` + `JSON.stringify(field)`, never the raw field string — `blockRef.name` crosses the unvalidated jsonb boundary raw and a name carrying a literal NUL could forge a raw-concatenation presence marker, colliding two distinct (name, field) keys. JSON.stringify output contains no raw NUL, so the key's last raw NUL is always the fold delimiter; field-less legacy keys stay byte-identical.**
- **Dedup key fix (latent hidden-card bug).** The `operatorActionableWarnings` dedup key for anchored warnings is `(code, gid, a1[, index for FIELD_UNREADABLE])` (`lib/parser/dataGaps.ts:420-430`) — it contains NO content. FIELD_UNREADABLE anchors resolve per-ROW by `blockRef.name` to the member's crew-role cell (`lib/drive/showDayTimeAnchors.ts:146-154`), so phone + email for ONE member resolve to the SAME a1 and share the same `blockRef.index` — the second warning is dedup-collapsed and its card silently hidden whenever anchors resolve, violating the function's own "no actionable row is ever hidden" guarantee (`lib/parser/dataGaps.ts:398-399`). Fix in the same diff: fold `blockRef.field` into the FIELD_UNREADABLE `rowDisc` alongside `index` (`\0${index}\0${field}` when field present). Legacy warnings without `field` keep today's key (backward compatible). Both cards deep-link to the same crew-role cell — acceptable; the link's contract is "the member's row", per the region-fallback precedent in the same branch.

### 2.2 Card: FIELD_UNREADABLE detail band

In `PerShowActionableWarnings`, alongside the existing UNKNOWN_FIELD `rowLabel` band (mutually exclusive by code):

- **Normalization rule (one rule, all three inputs, closes the unvalidated-jsonb boundary):** a band segment input is USABLE iff `typeof v === "string" && v.trim().length > 0`, and it renders as its TRIMMED value. Any other value — absent, `null`, empty, whitespace-only, number, boolean, array, object (all reachable: persisted warnings are cast from jsonb with no closed `blockRef` validator, `components/admin/review/publishedAdapter.ts:98`) — makes that segment ABSENT. No `.trim()` call ever runs on a non-string (typeof guard first). This is the same shape as the existing `warningCardCopyFields` pick rule (`components/admin/PerShowActionableWarnings.tsx:43-45`).
- **Gate:** `w.code === "FIELD_UNREADABLE"` AND `blockRef.field` is USABLE. Otherwise no band (guard table §2.4).
- **Label** (uppercase eyebrow, same classes as "Sheet row" label at `PerShowActionableWarnings.tsx:207`): `Phone` when `field === "phone"`, `Email` when `field === "email"`, else the trimmed field value verbatim (future-proof; only these two are emitted today).
- **Name and value (AMENDED 2026-07-24, whole-diff review R2 — supersedes the original single joined value span; see the close-out doc §13):** name and value render in SEPARATE sibling spans, never one joined string — a joined string lets delimiter-bearing sheet data (a name or value containing ` · "` sequences) render two DISTINCT warnings identically. Structure inside the band wrapper:
  - **Name span** (full mode only, `condensed !== true`; USABLE `blockRef.name`): proportional prose classes `min-w-0 text-xs break-words text-text`, `data-testid="per-show-actionable-field-name"`. NOT mono, NOT break-all — the mono treatment is reserved for the junk value so the two stay typographically distinct.
  - **Separator span** (only when BOTH name and value present): `aria-hidden="true"`, middle dot `·`, `text-xs text-text-subtle` (decorative; precedent `components/auth/IdentityChip.tsx:49`).
  - **Value span** (USABLE `rawSnippet`): `font-mono text-xs break-all text-text`, `data-testid="per-show-actionable-field-label-value"`, renders exactly `"{value}"` (quoted trimmed value, nothing else).
  - **Condensed mode** (`condensed === true`, under-row): value span only — no name span, no separator.
- Separator is the middle dot `·` (em-dash ban, AGENTS.md pre-code mechanical gate). Quotes are straight double quotes, matching the producer's own message quoting (`lib/parser/warnings.ts:93`).
- `data-testid`: `per-show-actionable-field-label` (band), `per-show-actionable-field-name` (name span, amended R2), and `per-show-actionable-field-label-value` (value span), extending the row-label pair convention at `components/admin/PerShowActionableWarnings.tsx:205` and `components/admin/PerShowActionableWarnings.tsx:212`.
- Band is non-interactive text — no tap-target requirement.
- Long values: the band container is the existing `CompactAlertCard` detail band (`components/admin/CompactAlertCard.tsx:115-120`); BOTH the label span AND the value span get `break-all` so an arbitrarily long unusable cell value — or an arbitrarily long junk `blockRef.field` label from the unvalidated jsonb boundary — wraps inside the card instead of overflowing (cap behavior — no truncation, wrap; the known labels "Phone"/"Email" never wrap in practice). The name span (amended R2) is prose: `break-words` + `min-w-0` (break-words alone does not shrink a flex item below min-content; min-w-0 keeps a pathological unbroken name inside the card).

### 2.3 Surfaces affected (mode boundaries)

| Surface | Mode | Band content |
| --- | --- | --- |
| Under-row cards (published modal crew rows) | condensed | `PHONE · "value"` |
| Data-quality group list (per-show panel via `sectionWarningExtras.tsx:265`) | full | `PHONE · Jordan Ellis · "value"` |
| Ignored (muted) list | full | same as group list (band renders in muted tone context unchanged) |
| StagedReviewCard (`components/admin/StagedReviewCard.tsx:521`) | full | same as group list. The staged snapshot baseline (`tests/components/admin/stagedCardBaseline.test.tsx`) is expected UNCHANGED: its fixture `MAPPED_WARNINGS` contains only `UNKNOWN_ROLE_TOKEN` + `ROOM_HEADER_SPLIT_AMBIGUOUS` rows (`tests/helpers/warningSurfaceFixture.ts:88-91`), neither of which passes the FIELD_UNREADABLE band gate. Staged-surface band wiring is instead covered by a direct `StagedReviewCard` render test with a FIELD_UNREADABLE fixture (§3 test 5). |

### 2.4 Guard table (band inputs)

Every input is first classified by the §2.2 normalization rule: USABLE (string, non-empty after trim → rendered trimmed) or ABSENT (everything else: missing key, `null`, `""`, whitespace-only, number, boolean, array, object — the jsonb boundary is unvalidated, so all are in-domain). The table is total over {USABLE, ABSENT}³:

| `blockRef.field` | `blockRef.name` | `rawSnippet` | Renders |
| --- | --- | --- | --- |
| ABSENT | any | any | no band (legacy path, §1.1 #7) |
| USABLE | USABLE | USABLE | full: `Phone · name · "value"`; condensed: `Phone · "value"` |
| USABLE | ABSENT | USABLE | full: `Phone · "value"` (name segment dropped, no dangling separator); condensed unchanged |
| USABLE | USABLE | ABSENT | full: `Phone · name`; condensed: `Phone` — value segment + quotes dropped entirely, never `""` |
| USABLE | ABSENT | ABSENT | `Phone` alone (label only), both modes |

Label mapping for USABLE field: `"phone"` → `Phone`, `"email"` → `Email`, any other trimmed value → that trimmed value as-is (future-proof; only these two are emitted today). `blockRef.name` is the RAW name cell (pre-restriction-strip, `lib/parser/blocks/crew.ts:292-294`), rendered TRIMMED but otherwise unmodified (no restriction-strip, no case change) — it matches what Doug sees in the sheet.

### 2.5 Eyebrow wrap

`BulkIgnoreControls.tsx:161`: remove `truncate` from the eyebrow span (keep `min-w-0`). Label wraps to a second line at narrow widths; hairline rule + chip keep their flex row. Single call site (`components/admin/showpage/sectionWarningExtras.tsx:265`) — the DEFERRED entry's "wizard step3 groups" claim is stale; `rg -n "BulkIgnoreControls" app components` returns only `sectionWarningExtras.tsx` (verified 2026-07-23).

### 2.6 Transition inventory

**Band (3 states: absent / full / condensed).** All three are DATA-and-SURFACE determined, never toggled client-side: `condensed` is a fixed per-surface prop, and band presence changes only when server props change (sync/ignore → `router.refresh()` re-render). All pairs instant — no animation:

| Pair | Treatment |
| --- | --- |
| absent ↔ full | instant (server re-render; card content swap, no exit/enter animation exists on these cards) |
| absent ↔ condensed | instant (same) |
| full ↔ condensed | unreachable at runtime — no surface flips `condensed`; a card never migrates between surfaces without a full re-render |

Compound: band change while the ignore-refresh is in flight — the card list has no `AnimatePresence`/exit animations (`PerShowActionableWarnings` is a server component, plain `<ul>`), so there is no mid-transition state to compound with.

**Eyebrow row (`BulkIgnoreControls`: idle / armed / running / error — pre-existing states, per-group).** The wrap change adds NO state. Full pair table (treatments are the EXISTING behavior, restated per the inventory rule; the transition-audit suite `tests/components/admin/bulkIgnoreControlsTransitionAudit.test.tsx` remains the executable pin):

| Pair | Reachable? | Treatment |
| --- | --- | --- |
| idle ↔ armed | yes (click arm; 4s timer or cross-group re-arm reverts) | instant text/class morph; `transition-colors` (idle skin) / `transition-opacity` (armed skin) on hover only, no layout animation |
| armed → running | yes (confirm click) | instant ("Ignoring…" + disabled) |
| idle → running | no (running is entered only from armed; other groups' chips just disable) | n/a |
| running → idle | yes (all-ok completion) | instant (state reset before `router.refresh()`) |
| running → error | yes (partial/total failure) | instant; `role="alert"` notice mounts below cards, no animation |
| error → idle | indirect only: a CONFIRM on any group replaces the error state with `running` (`ignoreGroup` sets state unconditionally, `BulkIgnoreControls.tsx:86`); arming alone does not clear the notice | instant |
| error ↔ armed | yes (re-arm while a previous error notice is shown — the compound state: notice visible + chip armed) | instant morph; notice unaffected |
| idle ↔ error | covered by running → error and error → idle above; no direct idle → error edge exists | n/a |

One NEW geometric interaction from this spec: the armed morph lengthens the chip text ("Ignore all N" → "Confirm ignore all N", `BulkIgnoreControls.tsx:146-150`), which changes the row's width allocation and therefore the wrapped eyebrow's line count at 390px. The §3 browser assertion covers BOTH idle and armed chip states.

### 2.7 Dimensional invariants

None new — no fixed-dimension parent introduced. The band lives inside the existing flex-wrap detail band row; the eyebrow row keeps `flex items-center` with the rule as the flexible spacer.

## 3. Tests (TDD per task)

1. **Parser:** `emitFieldUnreadable` stores `blockRef.field` (`"phone"` and `"email"` branches); message + rawSnippet unchanged (extend `tests/parser/warnings.test.ts` / `tests/parser/blocks/crew.test.ts`).
1b. **Dedup:** same-member phone + email FIELD_UNREADABLE warnings with the SAME resolved `sourceCell` (a1) and index BOTH survive `operatorActionableWarnings` when `blockRef.field` differs (this test FAILS red today — it pins the hidden-card bug); legacy pair without `field` keeps today's collapse (extend `tests/parser/operatorActionableWarnings.test.ts`).
1c. **Identity:** `warningIdentityKey` differs for two FIELD_UNREADABLE warnings identical except `blockRef.field` (phone vs email, same normalized snippet/anchor/index) — so `buildReportSurfaceId` differs (no shared report draft) and `stableWarningKeys` needs no occurrence suffix; legacy field-less warnings keep the byte-identical key (extend the warningIdentity test suite).
2. **Component (full mode):** two FIELD_UNREADABLE items (phone + email, same member) render two bands with distinct label + value text; assert against the fixture's `blockRef.field`/`name`/`rawSnippet`, never hardcoded strings disconnected from the fixture (anti-tautology). Guard-table sweep over the §2.4 domain: for EACH of the three inputs, at least one ABSENT-class case from each category — missing key, `null`, `""`, whitespace-only, and one non-string (number `0` or object) — asserting the segment (or whole band) is absent, no dangling `·`, no empty `""` quotes, and no thrown render (the non-string case is the `.trim()`-crash regression guard). Unknown USABLE field string (e.g. `"fax"`) renders trimmed as-is.
3. **Component (condensed):** same fixtures with `condensed` ⇒ name absent from band text (assert band textContent does NOT contain the fixture name), value present.
4. **UNKNOWN_FIELD exclusivity:** UNKNOWN_FIELD card keeps its `Sheet row` band; FIELD_UNREADABLE never renders both bands.
5. **Staged surface:** `stagedCardBaseline` snapshot asserted UNCHANGED (fixture carries no FIELD_UNREADABLE — §2.3); NEW direct `StagedReviewCard` render test with a FIELD_UNREADABLE operatorActionable fixture asserts the full-mode band (field label + name + value) appears on the staged card.
6. **Eyebrow:** component assertion that the eyebrow span's class list has no `truncate`; real-browser layout assertion at 390px (standalone config, `tests/e2e/standalone.config.ts --project=standalone-chromium`, harness extended to mount `BulkIgnoreControls` — no existing e2e harness renders it; the new spec file must be added to that config's explicit `testMatch` allow-list) asserting, in BOTH chip states (idle "Ignore all N"; armed "Confirm ignore all N", entered by one real click): (a) eyebrow not ellipsized — `scrollWidth ≤ clientWidth` on the eyebrow span; (b) no row horizontal overflow — row `scrollWidth ≤ clientWidth`; (c) no overlap — pairwise `getBoundingClientRect` intersection between eyebrow span and chip button is empty (width or height of the intersection ≤ 0, with 0.5px tolerance); (d) full eyebrow text content equals the catalog title (proves wrap, not clip). jsdom cannot compute any of these.
6b. **Long junk field label:** component test — FIELD_UNREADABLE with a 200-char no-space `blockRef.field` renders a band whose label span carries the wrap class (`break-all`), no throw (pairs with the §2.4 unknown-field row; real overflow geometry is covered by the (b) row assertion pattern at the component-class level, not a new browser run).
7. **Meta-test inventory:** none created/extended — no new Supabase call boundary, no admin mutation surface, no advisory lock, no catalog code. The existing structural guards (x1/x2 code scanners) are unaffected: no new `code:` literal.

## 4. Out of scope

- Ignore fingerprint granularity (§1.1 #5).
- Any catalog/§12.4 copy change (§1.1 #6).
- Chip copy or wrap behavior (§1.1 #4).
- Backfill of persisted warnings (§1.1 #7).
