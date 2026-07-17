# Spec — Structured field-level From→To for the auto-applied `field_changed` row

**Date:** 2026-07-17
**Slug:** `autoapplied-field-structured-diff`
**Backlog:** `BL-AUTOAPPLIED-FIELD-STRUCTURED-DIFF` · **Deferral:** `DEFERRED.md` AUTOAPPLIED-REDESIGN-3 (P2)
**Branch:** `feat/autoapplied-field-structured-diff`
**Chosen option:** B — "From→To in the row" (structured summary; one aggregate row, no per-field row split, no undo/count semantics change). Options A (name-only) and C (per-field rows + before/after-image snapshots) were rejected — see §2. **Retention invariant (one story, §4):** no `TriggeredReviewItem` shape is widened and **no old financial value is ever persisted**; the newly-retained data is a bounded structured payload in `show_change_log.after_image` (COI old→new + constant labels/notes; MI-9 out of scope, §3.2) — a classified, accepted new retention surface, admin-only and telemetry-excluded.

---

## 1. Problem

On the admin dashboard's "Recently auto-applied" strip (`components/admin/RecentAutoAppliedStrip.tsx`), a `field_changed` change renders a single generic sentence — **"A field changed on this sync"** (`lib/sync/changeLog/writeAutoApplyChanges.ts:156`). Doug accepts (acknowledges) the change without seeing *which* field changed or its old→new value (impeccable critique P2). The strip is an **acknowledge feed**, not an approval queue: the change is already applied to the DB during sync; "Accept" sets `acknowledged_at` (dismiss from feed) and `field_changed` is **never undoable** (`lib/admin/loadRecentAutoApplied.ts:70`, F17). So the only thing Doug does on the row is confirm he saw it — but today he cannot see what "it" was.

## 2. Goal & option analysis

**Goal:** the `field_changed` row **names each auto-applied show-level field** (and shows old→new where the value is safe and available), in one row, without new per-field rows and without touching undo/acknowledge semantics. The field-family invariant set and the set of syncs that emit a row are unchanged (§3); every field-family invariant (MI-8/8b/8c/9) auto-applies (§3.2), so the enrichment describes only genuinely-applied changes. **Fidelity per field is what is safely derivable without persisting sensitive values** (§3.1): COI shows old→new; a financial *clear* (MI-8) is named + "cleared" (the old number is neither shown nor stored — §4); structural/role changes are named. (The bounded structured payload IS newly retained in `after_image` — §4.)

Three options were mocked (approved comparison artifact: the Option-B card). Decision:

| Option | What | Rejected because |
| --- | --- | --- |
| A — name only | Summary names fields, no values | Doug still can't see old→new; low payoff for near-same effort as B |
| **B — From→To in row (CHOSEN)** | One row names each field + shows old→new where safe (COI) / "cleared" for a financial clear | Delivers the value; reuses the reader's existing `DiffBlock` machinery; no undo/count change; no item-shape widening (only a bounded `after_image` payload is newly retained — §4) |
| C — per-field rows + stored before/after-image | One acknowledge row per field | **Rejected on the user's redundancy concern**: `field_changed` is non-undoable, so per-row granularity buys nothing actionable — it only multiplies dismissal taps for one sheet edit. The group's existing "Accept all" already clears the bucket. |

## 3. What triggers the row (predicate restated — behavior-preserving)

This spec governs only the **Phase-2 writer** `writeAutoApplyChanges` (`writeAutoApplyChanges.ts:143-160`), which today emits one `field_changed` row when **any** of `MI-8 | MI-8b | MI-8c | MI-9` is present in the `triggeredItems`/`notableItems` it receives. **The set of items the writer receives, and which items emit a row, are unchanged by this spec.** The structured enrichment covers **MI-8/MI-8b/MI-8c** — show-level fields that unambiguously auto-apply once Phase-1 admits apply; **MI-9 is excluded** (§3.2, contested routing) and its contribution is left as-is. Two Phase-1 gates run **before** the writer and are preserved untouched:

- **MI-8/MI-8b unstable-modifiedTime debounce** (`mi8DebounceReason`, `phase1.ts:278-292`): when Drive `modifiedTime` is still unstable and the only review items are MI-8/MI-8b, Phase-1 returns `defer` — the parse does **not** apply and the writer is **never reached** that pass, so **no `field_changed` row is written** for a deferred sync. An MI-8/MI-8b item can therefore exist in a pass that writes no row; this spec does not change that.
- **MI-9 out of scope** (§3.2): its LEAD-bit routing (auto-apply vs stage) is a contested code-vs-ratified-plan discrepancy; this feature does not enrich MI-9 and does not change its existing behavior. MI-9 still counts toward row-presence (a MI-9-only sync yields the generic row, as today) but never a structured entry.

The writer's implementation shape (fully **behavior-preserving** — a row appears in exactly the same passes as today):

1. Build the validated `fieldChanges` entries (§3.1, §3.6), tracking `skippedCount` (malformed items dropped).
2. **If ≥1 valid entry** → write the **structured** row (`after_image = { fieldChanges }`, `summary` names the fields, §5). If `skippedCount > 0`, `fieldChanges` also carries one **incompleteness marker** entry (§3.6) so the row never presents a partial list as complete.
3. **Else if `skippedCount > 0`** (a field-family item was present but every entry was malformed) → write the **generic fallback** row (`summary = "A field changed on this sync"`, `after_image = null`) — preserving the acknowledge trail exactly as today.
4. **Else** (no field-family item) → no row (same as today).

So the row-emission predicate is identical to today's ("a row iff ≥1 field-family item present"); only the row's *content* is enriched when entries validate. The generic summary is **not** retired — it remains the fallback for the (pathological) all-malformed case (step 3) and for pre-existing DB rows. **Do not** weaken or bypass the Phase-1 debounce to "reach" the writer.

### 3.1 Per-invariant enrichment matrix

For each triggering item present, the writer produces a structured **field-change entry**. Entry shape (new): `{ label: string; from: string | null; to: string | null; note: string | null }` — an entry is either a **From→To entry** (`from`/`to` set, `note` null) or a **note-only entry** (`note` set, `from`/`to` null).

| Invariant | Item shape (live: `lib/parser/types.ts`) | Entry produced | Guard |
| --- | --- | --- | --- |
| **MI-8** financial clear (`:537`) | `{ field: "po"\|"proposal"\|"invoice"\|"invoiceNotes" }` — **shape UNCHANGED** (not widened) | **Note-only**: `label` = display name (§3.3), `note` = `"cleared on this sync"`. MI-8 only fires had-value→now-empty (`invariants.ts:447-451`), so the change direction is fully conveyed without the old value. The old financial number is **deliberately not shown or persisted** (§4, privacy). | field enum valid (§3.6) |
| **MI-8b** COI status (`:538`) | `{ prior: string\|null; next: string\|null }` (already carried) | From→To: `label` = `"COI status"`, `from`/`to` via the **trim-aware** normalizer (§3.6): non-empty-after-trim value else `"(none)"` | none |
| **MI-8c** pull-sheet regression (`:539`) | `{ mode: "collapse"\|"ambiguous_format"\|"halved"\|"case_dropped"; details? }` | Note-only: `label` = `"Pull sheet"`, `note` = the mode's descriptive sentence (§3.4). No clean from/to — established (AUTOAPPLIED-REDESIGN-3 "MI-8c stays a sentence"). | none |
| **MI-9** LEAD-bit role delta (`:545`) | `{ crew_name; prior_flags; new_flags }` | **No entry — OUT OF SCOPE** (§3.2, contested routing). Counts toward row-presence only; never a structured entry or marker. | n/a |

**Ordering:** entries appended in the writer's evaluation order: all MI-8 (financial) first (in the `financialFields` array order — po, proposal, invoice, invoiceNotes), then MI-8b, then MI-8c entries. (MI-9 produces no entry — §3.2.) Deterministic, fixture-stable.

### 3.5 No item-shape widening — no new triggered-item persistence (privacy, adversarial-review preempt)

_(The `after_image.fieldChanges` payload IS newly retained — that is the separate, classified surface in §4. This section is only about NOT widening `TriggeredReviewItem`.)_

`TriggeredReviewItem` values are persisted at multiple surfaces: `pending_syncs.triggered_review_items` (staged; **read by `pnpm observe staged --full`**), `sync_audit.triggered_review_items` (`applyStagedCore.ts:258`), and forwarded to the writer via the choice-aware staged path (`applyStagedCore.ts:578`, `:600-605`). **Therefore this spec does NOT widen any `TriggeredReviewItem` shape.** In particular MI-8 stays `{ id, invariant, field }` — carrying old PO/proposal/invoice/`invoiceNotes` values on the item would deposit internal financial values into `pending_syncs`, `sync_audit`, and the observe `staged` surface, all outside the `after_image` analysis in §4. Because MI-8 becomes **note-only** ("cleared on this sync", §3.1), no old financial value is ever read, shown, or stored anywhere new. MI-8b already carries `{ prior, next }` (COI status — low-sensitivity, already persisted today, no new footprint). This also means there is **no legacy-vs-new item shape** — staged MI-8 items (pre- or post-deploy) are identical, so no transitional-window handling is needed. (COI values on MI-8b are the only field-value old→new shown; §4 covers where they render.)

### 3.6 Malformed stored-item validation + value bounding (writer, fail-safe)

Because stored items reaching the writer (§3.5) are guarded only for `id`/`invariant` (`reviewPayloadGuards.ts:53,74`), the structured writer MUST NOT assume any other field is present or well-typed. The prior generic writer never dereferenced `field`/`crew_name`/`prior`/`next`, so a corrupt/forward-schema stored item was harmless; the new writer dereferences them and must **fail safe, never `undefined`, never throw**. Per-entry runtime validation (at the writer, before building each entry) — **a validation failure skips the entry entirely, never producing a placeholder/fake entry** (an all-malformed sync then falls back to the generic row, §3 step 3):

- **MI-8:** `item.field` must be one of `po | proposal | invoice | invoiceNotes`; otherwise **skip** (no partial/`undefined` label). Note-only entry — no value dereference.
- **MI-8c:** `item.mode` must be one of `collapse | ambiguous_format | halved | case_dropped`; otherwise **skip**.
- **MI-9:** produces no structured entry at all (§3.2, out of scope) — nothing to validate; it is not counted in `skippedCount` (it is out-of-scope, not malformed).
- **MI-8b:** requires `prior` and `next` keys that are each `string | null`; then normalize both trim-aware (`x = typeof x === "string" && x.trim() !== "" ? x.trim() : "(none)"`). **Skip if the shape is invalid OR the two normalized values are equal** — this drops a corrupt `{ id, invariant:"MI-8b" }` (both → `"(none)"`, equal → skipped, **no fake `(none)→(none)` row**) and mirrors the live fire condition `priorCoi !== nextCoi` (`invariants.ts:460`). Otherwise emit From→To with the normalized values (never a blank cell).
- **Universal (trim-aware):** every string placed in an entry (`label`/`from`/`to`/`note`) is coerced through `typeof x === "string" && x.trim() !== "" ? x.trim() : <sentinel>` (`<sentinel>` = `"(none)"` for MI-8b values) so the stored JSON never contains `undefined`, `null`, `""`, or whitespace-only in a taken branch — upholding the "no blank cell" guarantee (§7). (`label` values are writer-controlled constants and always non-empty.)

**Mixed valid + malformed → incompleteness marker (Codex R12).** The writer tracks a `skippedCount` (field-family items skipped by the validation above). A partial list must never be presented as complete on a whole-row-Accept feed:
- **≥1 valid entry AND `skippedCount > 0`** → after the valid entries, append **one bounded marker entry** `{ label: "Other changes", note: "<skippedCount> other field change(s) on this sync — details unavailable", from: null, to: null }`. The acknowledged row then shows the known changes AND signals that more occurred — not a partial list masquerading as complete.
- **0 valid entries AND `skippedCount > 0`** (all malformed) → the **generic fallback row** (§3 step 3: `summary = "A field changed on this sync"`, `after_image = null`).
- **0 valid AND 0 skipped** (no field-family item) → no row.

The marker/fallback is an **in-band data signal** (not telemetry): the writer runs inside the sync advisory-lock txn, so per invariant 10 it emits no `log.*`/`logAdminOutcome` — the marker entry (and the generic-fallback row) carry the "something was omitted" signal in the persisted row itself. This is strictly fail-closed — never a throw that bricks staged apply/finalize, never a silent loss.

**Value bounding (storage + render):** each stored **`label`/`from`/`to`/`note`** string is **truncated at the writer** to **120 chars** with a trailing `…` when longer. With MI-9 out of scope (§3.2), the only user-sourced strings are MI-8b COI status (`from`/`to`); all labels/notes are writer constants (`"PO number"`, `"COI status"`, `"Pull sheet …"`, the marker note) already short. The cap is still applied to every string (defence-in-depth, incl. `label`) so no path is unbounded. This bounds `after_image` size and, combined with the render wrapping contract (§6), prevents one field row from dominating or breaking Doug's mobile-first dashboard.

### 3.2 MI-9 is OUT OF SCOPE for structured enrichment (contested routing — Codex R13)

**MI-9 is deliberately excluded from this feature's structured field enrichment.** MI-9 fires on a **LEAD-bit set-membership delta** (`invariants.ts:530-544`), which is **auth-sensitive** (LEAD grants access to the internal ops surface and `shows_internal` financials — `00-overview.md:151`). Its auto-apply-vs-stage routing is **contested between two authoritative sources**:

- **Ratified plan amendment #8** (`00-overview.md:158-175`): "Phase 1's MI-9 check **stages** … when the LEAD-bit set membership differs" — tests (a)/(d) assert a LEAD-bit delta **stages** with `MI-9_ROLE_FLAGS_DELTA`.
- **Live "Phase 2 decision rule" code + passing tests** (`phase1.ts:504-511`; `tests/sync/phase1.test.ts:807-808` — "MI-11 routes to auto_apply_with_holds, **every other invariant auto-applies**", parametrized over MI-9 LEAD-gain and LEAD-loss): MI-9 **auto-applies**.

This is an unresolved code-vs-ratified-plan discrepancy on an auth-sensitive event, and resolving it is **out of scope for this read/enrichment feature** (it is a pre-existing divergence, surfaced separately — see §11). Building rendered "role updated (applied)" detail on MI-9's contested applied-status would be wrong under either resolution: if the ratified plan wins, MI-9 stages and never auto-applies (so it must not appear in an *auto-applied* strip); if the code wins, MI-9 has its own dedicated `MI-9_ROLE_FLAGS_DELTA` surface.

**Therefore:** the structured `fieldChanges` enrichment covers **MI-8, MI-8b, MI-8c only**. **MI-9's contribution to the `field_changed` row is left exactly as today** (untouched): its presence still counts toward the row-emission predicate (§3), so a sync containing MI-9 still produces a row — but MI-9 yields **no structured entry and no incompleteness marker** (it is out-of-scope, not malformed). If MI-9 is the only field-family item present, the row is the **generic fallback** (`"A field changed on this sync"`), identical to today. This feature neither asserts MI-9 is auto-applied nor changes its routing, its `heldNames` treatment, or its existing writer branch. (`ROLE_FLAGS_NOTICE`, `phase2.ts:522`, the separate non-LEAD role path, emits no MI-9 item and is likewise out of scope.)

### 3.3 Field display names (single source of truth)

Financial field → display name map (new constant, colocated with the writer):
`po` → `"PO number"`, `proposal` → `"Proposal"`, `invoice` → `"Invoice"`, `invoiceNotes` → `"Invoice notes"`. No raw enum token reaches the DOM (invariant 5 spirit; these are field names, not error codes).

### 3.4 MI-8c mode sentences

`collapse` → `"lost all rows"`; `ambiguous_format` → `"format became ambiguous"`; `halved` → `"lost more than half its cases"`; `case_dropped` → `"a case was dropped"`. Rendered as `"Pull sheet {sentence}"` in the note. (Descriptive English, no codes — invariant 5.)

## 4. Storage (Resolved Decision — no migration)

The structured entries are stored on the existing `show_change_log.after_image` **jsonb** column (`supabase/migrations/20260608000001_show_change_log.sql:17`; freeform, no CHECK — **no migration required**), as `after_image = { fieldChanges: FieldChangeEntry[] }`. `before_image` stays **null** (field_changed is non-undoable — no snapshot needed; consistent with today).

**New retention surface — classified (Codex R10).** `after_image.fieldChanges` **is a new retained copy** of the enriched change data on `show_change_log`, on **both** the live cron/manual path (in-memory `notableItems`) and the staged path. Today a `field_changed` row's `after_image` is `null`; this feature persists a bounded structured payload there. The retained data is deliberately minimized:
- **No old financial value.** MI-8 is note-only (§3.1) and MI-9 is out of scope (§3.2) — the only user-sourced retained string is **MI-8b COI status old→new**. Everything else (labels, notes, marker) is a writer constant. **No PO/invoice/proposal numbers, no `invoiceNotes` content, no crew names, no email/phone.**
- **COI carve-out (accepted).** COI status (`pending`/`received`/`expired`-style operational status) is low-sensitivity — not financial, not PII. Retaining its old→new value in this admin-only log is the minimal way to honor the user-approved Option B (show old→new); making MI-8b note-only too would collapse the feature to the rejected Option A (names only). **Decision: accept COI old→new retention here.**

**Access + telemetry posture:**
- `show_change_log` is REVOKEd from `authenticated` and read only by the service-role loader (`loadRecentAutoApplied.ts:10-13`); the table already carries crew PII (name/email/phone) in crew-domain images — this adds no new PII class.
- The telemetry read-core **never selects `before_image`/`after_image`** (`lib/observe/query/changeLog.ts`, AGENTS.md telemetry §), so `fieldChanges` never reaches the observe CLI. Because no `TriggeredReviewItem` is widened (§3.5), no value enters `pending_syncs`/`sync_audit`/`observe staged`. So the **only** new retention surface is `show_change_log.after_image` (admin-only, telemetry-excluded, bounded per §3.6 + §5).
- `canonImage` (`writeAutoApplyChanges.ts:204`) only touches a top-level `email` key — `fieldChanges` has none, so canonicalization is a correct no-op.
- `undo_change` reads `after_image` only for `crew_added` (`undo_change_rpc.sql:39`); `field_changed` is never undoable, so the RPC never reads these rows. `cleanup_superseded_before_images` touches crew-domain rows only. **No write-path conflict.**

Rejected alternatives: (a) a new dedicated column — needs a migration + validation-parity round for no benefit over the freeform jsonb already read by the loader; (b) encoding into the `summary` string and re-parsing in the reader — brittle, forbidden shape-in-string. The `summary` string is **also** upgraded to a plain-English one-line fallback (§5) but is not the structured source of truth.

## 5. Read path

`lib/admin/loadRecentAutoApplied.ts`:
- Extend `AutoAppliedDiff` (`:24`) with a new variant: `| { kind: "fields"; entries: FieldChangeEntry[] }`.
- `deriveDiff` (`:83`) gains a `field_changed` branch that reads `after_image.fieldChanges` and **re-validates + re-bounds at read time** (defence-in-depth — the loader must not trust the stored payload, which could be a corrupt, manually-repaired, tampered, or future-bug service-role row):
  - Each entry must be an object with a non-empty string `label` and a valid `note` XOR (`from`+`to`); malformed entries are dropped. Each string re-truncated to **120** chars.
  - **Corruption/DoS ceiling — not a legit-data truncation:** `READ_FIELDS_ENTRY_CAP = 500`. The **writer** only ever emits the *real* count of applied field-family entries in a sync — with MI-9 out of scope (§3.2), that is ≤4 financial + COI + pull-sheet + a marker (≤7); well under 500. So the cap is unreachable by any legitimate writer output — **it never truncates a legit change** and only fires on external corruption/tampering.
  - **Non-silent fallback:** a payload with >500 entries → `{ kind: "none" }` so the row renders its `summary` instead of an unbounded list. Because the `summary` is **count-bearing** (names the first 3 fields then `"and N more"`, §6), the *magnitude* of the change is still visible on Accept — it is not a silently-hidden change — and the loader emits a `code:`-carrying `log.warn` flagging the over-cap/invalid payload for investigation.
  - If ≥1 valid bounded entry remains (≤500) → `{ kind: "fields", entries }`. **If the reader dropped any malformed entry** (stored count > kept count), it appends the same **incompleteness marker** entry (`{ label:"Other changes", note:"some changes could not be displayed" }`) so a read-side drop also never presents a partial list as complete. If no valid entry remains → `{ kind: "none" }` (summary — back-compat for pre-existing null-after_image rows and generic-fallback rows).
  - The read-side `log.warn` on an over-cap/invalid payload runs in the admin **read** path (`loadRecentAutoApplied`, not inside a sync lock), so it is a permitted emit — distinct from the writer, which stays telemetry-free inside the lock (§3.6, invariant 10).
- Combined with the writer caps (§3.6), both write and read sides are bounded. The read cap protects the JSONB select + DOM from a pathological row without capping any real sync (writer output ≪ 500).
- The loader's strict `readName`-only posture is preserved for crew kinds; the new branch reads only the controlled `fieldChanges` shape (label/from/to/note strings), never arbitrary image fields.

**Summary (writer):** when the writer emits a **structured** row (§3 step 2) it sets `summary` to a plain-English one-liner naming the fields (e.g. `"COI status and PO number changed on this sync"`; capped — see §6). When it emits the **generic fallback** row (§3 step 3, all-malformed) it keeps the legacy `"A field changed on this sync"`. Either way a `summary` accompanies every row; consumers that show `summary` (monitor digest via `STRIP_KINDS`, `loadRecentAutoApplied.ts:63`; any client without the `fields` variant) degrade gracefully and are at least as informative as today. Digest parity: the digest reads `summary` only, so the richer sentence flows through with no digest code change (verify no digest test pins the old literal as the *only* possible value).

**Reader back-compat:** the `{ kind:"none" }` → summary path renders both the generic-fallback rows (§3 step 3) and **pre-existing** DB rows (written before this deploy, `after_image = null`). The structured `{ kind:"fields" }` path renders new well-formed rows.

## 6. UI (Option-B render — impeccable dual-gate, invariant 8)

`components/admin/RecentAutoAppliedStrip.tsx` `DiffBlock` (`:104`) gains a `d.kind === "fields"` branch rendering the entries as a compact list: each entry a `label` + either a `from → to` (reusing the existing From/To caption + line-through-old / strong-new treatment, `:113-133`) or the `note` text. Exact styling, spacing, and the pill/count treatment are **finalized by a dedicated Claude/impeccable design session** (kickoff handed off after this spec is approved); the approved Option-B comparison artifact is the interim visual reference.

**Text wrapping contract (mobile-first — Doug's primary surface):** every rendered `label`/`from`/`to`/`note` string carries `wrap-break-word` (mirroring the existing summary `<p>` at `:107`, which the current From/To grid spans lack). Combined with the writer's 120-char per-value cap (§3.6), a long or unbroken value (e.g. a long `invoiceNotes`, an unspaced token) **wraps within the card and cannot force horizontal overflow** or let one row dominate the dashboard. No fixed-width parent is introduced; the entries flow in the auto-height card.

**`isCrew` entity-label guard (MUST change — adversarial-review preempt):** the live `StripRow` computes `const isCrew = row.diff.kind !== "none"` (`:151`) — keyed on diff-kind, not change-kind. Adding the non-`none` `fields` variant would make `field_changed` rows render the **"Crew member"** entity label (`:159`), a user-visible misclassification on the exact surface this spec improves. The guard MUST be narrowed to the crew diff kinds explicitly: `const isCrew = row.diff.kind === "fromTo" || row.diff.kind === "single"` (crew_renamed = `fromTo`; crew_added/removed = `single`; `fields` and `none` are non-crew → no entity label). Verified by a `StripRow`-level test (§9), not only `DiffBlock`.

**Guard conditions (render):**
- `after_image.fieldChanges` absent / null / `[]` / malformed → loader returns `{ kind: "none" }` → summary sentence renders (no crash, no empty block).
- An entry with `note` set → render the note line; with `from`/`to` set → render the From→To line. An entry may not have both (writer invariant); reader renders `note` if present else From→To.
- `from`/`to`/`note`/`label` are always strings when their branch is taken (never null in that branch); the `"(cleared)"` / `"(none)"` sentinels cover empty source values so no blank cell renders.

**No hidden entries within a real sync; a corrupt-row sanity cap at the reader (Codex R7 + R10).** The `fields` list renders **all** entries `deriveDiff` returns — no `"+N more"` truncation. Accept dismisses the whole row, so hiding any entry behind an overflow collapse would let Doug acknowledge an applied field change he never saw — contradicting the goal. A real sync's entries are few — with MI-9 out of scope (§3.2), at most 4 financial + COI + pull-sheet + at most one incompleteness marker (≈ ≤7) — and each is short + bounded (120-char cap, §3.6) and wraps, so the list never overflows. The **only** cap is the read-side `READ_FIELDS_ENTRY_CAP = 500` corruption/DoS ceiling (§5): the writer's output count is far under it, so the cap never truncates a legitimate change — a row exceeding it is corrupt/tampered and falls back to the count-bearing `summary` (magnitude still visible, plus an invalid-payload warning), never a silently partial render. The **`summary` sentence** (the degraded one-line fallback, §5) still names the first **3** fields then `"and N more"`. No new disclosure/expansion control is introduced (keeps the transition inventory empty).

**Transition inventory:** the `field_changed` row is static content inside the strip's existing group disclosure. The row's own content has **one visual state** (no intra-row toggles/animation) → no new transitions. The enclosing group expand/collapse and Accept/Undo button transitions are **unchanged** by this spec (no edits to `GroupSection` state machine). No `AnimatePresence` / ternary-render is added.

**Dimensional invariants:** the entries list is an auto-sized `grid`/flow inside the auto-height row card (`StripRow` `li`, `:150`) — no fixed-dimension parent, no flex-stretch dependency. (Not a layout-dimensions-task candidate; the existing `DiffBlock` From/To grid is auto-sized and unchanged.)

## 7. Guard conditions summary (every input)

- **MI-8 (financial):** note-only ("cleared on this sync") — no value dereference, no old number shown/stored (§3.1); a bad/absent `field` enum → entry skipped (§3.6).
- **MI-8b `prior`/`next` null / empty / whitespace:** fires only on `priorCoi !== nextCoi` after normalize (`invariants.ts:460`), but the raw stored value can be `null`, `""`, or whitespace on a real change (`"" → "received"`); the **trim-aware** normalizer (§3.6) maps any of these to `"(none)"` — never a blank cell.
- **Malformed stored item (bad/absent `field`, `crew_name`, `mode`, `prior`/`next`):** writer skips that entry (§3.6) — never `undefined`, never throws. **Mixed** valid + malformed → the valid entries render PLUS one bounded **incompleteness marker** ("N other field change(s)… details unavailable"), so a partial list is never shown as complete (§3.6). **All** malformed → **generic fallback** row (§3 step 3). Never silent loss.
- **Over-long value:** writer truncates each stored `label`/`from`/`to`/`note` to 120 chars + `…` (§3.6); reader wraps via `wrap-break-word` (§6) — no horizontal overflow on mobile. (Only MI-8b COI is user-sourced; MI-9 out of scope.)
- **`fieldChanges` empty but a field-family item present:** generic fallback row (§3 step 3). Empty `fieldChanges` with **no** field-family item present → no row (same as today).
- **Deferred MI-8/MI-8b (unstable modifiedTime):** Phase-1 `mi8DebounceReason` returns `defer` before the writer runs (§3), so the writer is never reached and **no `field_changed` row** is written that pass — unchanged from today. This spec must not weaken that debounce.
- **Malformed stored data / old rows (reader side):** loader falls through to `{ kind: "none" }` + summary sentence.

## 8. Non-goals

- No new per-field acknowledge rows (Option C rejected).
- No change to undo/acknowledge semantics, `individually_undoable`, `UNDOABLE_KINDS`, or the group count (still one row per sync).
- No change to the field-family invariant set and **no routing change** — the emission predicate is behavior-preserving (§3); every sync that emits a row today still emits one (MI-9 still counts toward row-presence, §3.2).
- **MI-9 routing (auto-apply vs stage) is NOT resolved or changed here** — §3.2/§11; MI-9 is excluded from structured enrichment and its existing behavior is untouched.
- No migration, no new column, no new advisory-lock surface (rides the existing locked sync txn in `phase2.ts`), no new admin route/table, no new §12.4 error code.
- **No `TriggeredReviewItem` shape widening** (§3.5) — no new value in `pending_syncs`/`sync_audit`/`observe staged`. (`show_change_log.after_image` IS a new retained copy — classified + accepted in §4.)
- **Old financial values (PO/proposal/invoice/`invoiceNotes`) are never shown or stored** — MI-8 is note-only ("cleared on this sync"); only COI status (MI-8b) shows old→new (§3.1, §4).
- No product change to Accept/overflow semantics — a corrupt over-cap row falls back to the summary (§5), it does not introduce a new "overflow" Accept state.
- No enrichment of `crew_email_changed` (separate kind, out of scope; stays summary-sentence).
- MI-9 is not enriched at all (no structured entry, no rendered role detail) — §3.2.

## 9. Test surface (TDD)

- **No parser/type change** — `TriggeredReviewItem` shapes are unchanged (§3.5); no `lib/parser/types.ts`/`invariants.ts` edit, no MI-8 emit-test change.
- **`lib/sync/changeLog/writeAutoApplyChanges.ts`** (extend the existing writer test `tests/sync/writeChangeLog.autoApply.test.ts`, `describe("writeAutoApplyChanges (Task 2.9)")`) — per MI variant: correct entry shape, ordering; **MI-8 → note-only `{ label:"PO number"|…, note:"cleared on this sync", from:null, to:null }`** (no old value stored — assert `after_image` contains no PO/invoice value); **MI-8b → From→To** with trim-aware normalized COI; **MI-8c → note**; **MI-9 → NO structured entry** (out of scope, §3.2) — a sync whose only field-family item is MI-9 → the **generic fallback row** (`"A field changed on this sync"`, `after_image = null`), identical to today (failure mode: accidentally enriching MI-9 and asserting its contested applied-status); a sync with MI-8b + MI-9 → the row shows the COI entry only, no MI-9 entry, no marker for MI-9 (it is out-of-scope, not malformed). Mixed valid+malformed (MI-8/8b/8c) → ordered `fieldChanges` + marker + capped summary. Assert `after_image.fieldChanges` structure against the **fixture-derived** expected (anti-tautology: derive from the input item values, not a hardcoded blob).
- **Debounce regression (Codex R4):** a Phase-1 test asserting that a sync whose only field-family items are **MI-8/MI-8b with an unstable Drive `modifiedTime`** returns `defer` (`mi8DebounceReason`) and therefore **writes no `field_changed` row** (the writer is not reached). Pins that this feature does not weaken the debounce; if `tests/sync/phase1.test.ts` already covers the defer outcome, add the "no change-log row written" assertion. Failure mode caught: enriching the writer while accidentally bypassing the pre-Phase-2 defer, logging a field change for a sync that did not apply.
  - **Malformed stored items (§3.6):** MI-8 with `field` missing / not an allowed enum, MI-8c with an unknown `mode`, **MI-8b missing `prior`/`next` or with equal normalized values** → each **skipped** (no partial/fake entry, no `undefined` in `after_image.fieldChanges`, no throw); **a sync of only-malformed field-family items → the generic fallback row IS written** (`summary = "A field changed on this sync"`, `after_image = null`), never zero rows (Codex R9); **a MIXED valid+malformed sync (e.g. one valid MI-8b + one corrupt MI-8c) → the structured row includes the valid entry AND one incompleteness marker entry ("1 other field change on this sync — details unavailable"), never a partial list presented as complete** (Codex R12). Failure modes caught: a corrupt item dereferenced into an `undefined` label or bricking apply; **a corrupt `{id, invariant:"MI-8b"}` emitting a fake `(none)→(none)` row** (Codex R8); an applied change vanishing entirely (all-malformed) or being silently omitted from an otherwise-complete-looking row (mixed).
  - **Value bounding (§3.6):** an MI-8b COI value > 120 chars (long unbroken token) → stored value truncated to 120 + `…`. Failure mode caught: an unbounded value bloating `after_image` / breaking mobile layout.
  - **MI-8b empty/whitespace COI (§3.6, Codex R7):** items with `prior` = `null`, `""`, and `"   "` (each vs a real `next`) → `from` = `"(none)"` (never blank); plus the symmetric `next`-empty case; **and `prior`==`next` after normalize → skipped** (no fake row). Failure modes caught: a valid COI change rendering a blank From/To cell; a no-op COI change emitting a row.
- **`tests/admin/loadRecentAutoApplied.test.ts`** — `deriveDiff` field_changed branch: well-formed → `{kind:"fields"}`; absent/`[]`/malformed → `{kind:"none"}`; pre-existing null-after_image row → `{kind:"none"}`. **Read-side hardening (Codex R10/R11):** a stored payload with **>500 entries** → `{kind:"none"}` (summary fallback) + an invalid-payload `log.warn` (assert the warn fired); **exactly 500 valid entries → all render (`kind:"fields"`)** — pins that the ceiling never truncates a plausible sync (boundary test at 500 and 501); an entry with a malformed shape among valid ones → that entry dropped, valid ones kept; a stored string >120 chars → re-truncated at read. Failure modes caught: a corrupt/tampered/future-bug row forcing an unbounded JSONB select + DOM render; a legit large sweep being hidden by too-low a cap.
- **`tests/components/admin/RecentAutoAppliedStrip.test.tsx`** — `DiffBlock` renders `fields` entries (From→To + note lines, incl. the incompleteness marker note); `none` fallback still renders summary. **`StripRow`-level:** a `field_changed` row with `diff.kind === "fields"` renders **no "Crew member" label** (guards the §6 `isCrew` narrowing); a `crew_renamed`/`crew_added` row still renders it. **Long-value:** an entry whose `from`/`note` is a long unbroken string renders with `wrap-break-word` and does not overflow its container (assert the class / the truncated content). **Read-cap fallback:** a >500-entry payload renders the summary, not an unbounded list. Failure modes caught: the `fields` variant tripping the diff-kind-based `isCrew` guard; an unbounded value breaking the mobile card.
- **Digest parity** — confirm no monitor-digest test pins the literal "A field changed on this sync"; richer summary flows through.
- **Meta-tests:** no new mutation surface (writer already carries `// not-subject-to-meta`, `writeAutoApplyChanges.ts:182`); no new §12.4 code; no advisory-lock topology change. **Declared: this milestone creates/extends no structural meta-test** (no new registry surface) — the change is payload enrichment on an existing, already-registered writer and loader.

## 10. Do-not-relitigate (reviewer preempts)

1. **MI-8c stays a sentence** — no clean field/from-to exists; ratified in AUTOAPPLIED-REDESIGN-3.
2. **MI-9 is OUT OF SCOPE — not enriched, behavior unchanged** — §3.2/§11; its auto-apply-vs-stage routing is a contested code-vs-ratified-plan discrepancy (amendment #8 says stage; `phase1.test.ts:807` says auto-apply), so this read/enrichment feature does not build on MI-9's applied-status. MI-9 still counts toward row-presence (generic row if alone), never a structured entry. The divergence is flagged for separate resolution (§11), not resolved here.
3. **after_image jsonb storage, no migration; a classified new retention surface** — §4; freeform column already read by the loader, telemetry never selects images. It IS a new retained copy (live + staged); COI old→new retention is explicitly accepted (low-sensitivity; dropping it would collapse to the rejected Option A). Read + write both bounded (§3.6/§5).
4. **One aggregate row, no per-field rows** — Option C rejected on the non-undoable-redundancy argument (§2); user-approved.
5. **`summary` upgraded but not the structured source** — §5; structured truth is `fieldChanges`, summary is graceful-degradation fallback.
6. **`crew_email_changed` untouched** — separate kind, out of scope (§8).
7. **No item-shape widening → no new triggered-item persistence; MI-8 note-only** — §3.5/§4; MI-8 stays `{field}`, so old financial values never enter `pending_syncs`/`sync_audit`/`observe staged`. This dissolves any legacy-staged-shape concern (shapes identical pre/post-deploy). The only new retention is the bounded `show_change_log.after_image` payload (§4, classified + accepted).
8. **`isCrew` narrowed to `fromTo`/`single`** — §6; the live guard is diff-kind-based and MUST change so `fields` rows don't render "Crew member".
9. **Emission predicate is behavior-preserving; generic summary is the malformed/pre-existing fallback** — §3/§5; a row appears in exactly the same passes as today (row iff ≥1 field-family item present); content is structured when entries validate, else the generic "A field changed" row (all-malformed, Codex R9) — never zero rows for an applied change.
10. **Phase-1 MI-8/MI-8b debounce preserved** — §3/§7/§9; the spec governs the Phase-2 writer only; deferred (unstable-modifiedTime) MI-8/MI-8b never reach it and write no row, unchanged. Do not weaken the debounce.
11. **Writer fails safe on malformed stored items; per-value 120-char cap** — §3.6; the structured writer validates `field`/`mode`/`prior`+`next`, skips malformed entries (never `undefined`/throw, never a fake `(none)→(none)` row), and truncates long values.
12. **Trim-aware sentinel (no blank cell)** — §3.6; `null`/`""`/whitespace COI values map to `"(none)"` (MI-8b normalizes with trim, so raw empties reach the writer).
13. **No hidden entries in a real sync; reader-side 500-entry corruption/DoS ceiling** — §5/§6; a whole-row Accept must not dismiss changes hidden behind an overflow collapse, so real syncs render in full. The writer's output count = the real applied-item count (roster-bounded, ≪ 500), so the ceiling never truncates a legit change; an over-ceiling row is corrupt/tampered and falls back to the **count-bearing** summary (magnitude still visible) + a warn — never a silent partial render.
14. **Read-side re-validation + bounds (defence-in-depth)** — §5; `deriveDiff` does not trust stored `after_image`, re-validating shape, re-truncating strings, capping entry count, and falling back to summary + warning on a pathological payload.
15. **Partial corruption never presents a complete-looking row** — §3.6/§5; any skipped/dropped field-family item (write or read side) appends a bounded "N other field change(s)… details unavailable" marker (or, if none valid, the generic fallback row), so a whole-row Accept never dismisses a silently-omitted applied change. In-band data signal (writer stays telemetry-free inside the lock, invariant 10).

## 11. Flagged pre-existing divergence (not resolved by this feature)

**MI-9 LEAD-bit routing: code contradicts the ratified plan.** This feature surfaced (but does not resolve) a discrepancy on an **auth-sensitive** event:

- **Ratified plan amendment #8** (`docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/00-overview.md:158-175`, 2026-05): a LEAD-bit set-membership change **stages** for admin approval (LEAD grants ops/`shows_internal` financial access); tests (a)/(d) assert `stage`.
- **Live code + passing tests** (`lib/sync/phase1.ts:504-511`; `tests/sync/phase1.test.ts:807-808`, parametrized over MI-9 LEAD-gain/LEAD-loss under "every other invariant auto-applies"): a LEAD-bit change **auto-applies**.

If the code is authoritative, an auth-sensitive LEAD promotion/demotion currently **auto-applies without staged review**, contrary to the ratified security rationale — a potential security-relevant regression. If the plan is authoritative, the code has drifted. **This spec takes no position and changes nothing about MI-9** (§3.2); it flags the divergence for the owner to resolve separately (ratify the auto-apply behavior as a superseding amendment, or restore staging). Recommended tracking: a `BL-MI9-LEAD-ROUTING-DIVERGENCE` backlog entry. This is out of scope for a read-side `field_changed` enrichment and must not gate it.
