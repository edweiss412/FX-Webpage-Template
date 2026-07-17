# Spec — Structured field-level From→To for the auto-applied `field_changed` row

**Date:** 2026-07-17
**Slug:** `autoapplied-field-structured-diff`
**Backlog:** `BL-AUTOAPPLIED-FIELD-STRUCTURED-DIFF` · **Deferral:** `DEFERRED.md` AUTOAPPLIED-REDESIGN-3 (P2)
**Branch:** `feat/autoapplied-field-structured-diff`
**Chosen option:** B — "From→To in the row" (structured summary; one aggregate row, no per-field row split, no undo/count semantics change). Options A (name-only) and C (per-field rows + before/after-image snapshots) were rejected — see §2.

---

## 1. Problem

On the admin dashboard's "Recently auto-applied" strip (`components/admin/RecentAutoAppliedStrip.tsx`), a `field_changed` change renders a single generic sentence — **"A field changed on this sync"** (`lib/sync/changeLog/writeAutoApplyChanges.ts:156`). Doug accepts (acknowledges) the change without seeing *which* field changed or its old→new value (impeccable critique P2). The strip is an **acknowledge feed**, not an approval queue: the change is already applied to the DB during sync; "Accept" sets `acknowledged_at` (dismiss from feed) and `field_changed` is **never undoable** (`lib/admin/loadRecentAutoApplied.ts:70`, F17). So the only thing Doug does on the row is confirm he saw it — but today he cannot see what "it" was.

## 2. Goal & option analysis

**Goal:** the `field_changed` row names each auto-applied show-level field and shows its From→To, in one row, without new per-field rows and without touching undo/acknowledge semantics. The field-family invariant set and the set of syncs that emit a row are unchanged (§3); every field-family invariant (MI-8/8b/8c/9) auto-applies (§3.2), so the enrichment describes only genuinely-applied changes.

Three options were mocked (approved comparison artifact: the Option-B card). Decision:

| Option | What | Rejected because |
| --- | --- | --- |
| A — name only | Summary names fields, no values | Doug still can't see old→new; low payoff for near-same effort as B |
| **B — From→To in row (CHOSEN)** | One row lists each field + old→new | Delivers the value; reuses the reader's existing `DiffBlock` machinery; no undo/count change |
| C — per-field rows + stored before/after-image | One acknowledge row per field | **Rejected on the user's redundancy concern**: `field_changed` is non-undoable, so per-row granularity buys nothing actionable — it only multiplies dismissal taps for one sheet edit. The group's existing "Accept all" already clears the bucket. |

## 3. What triggers the row (predicate restated — behavior-preserving)

This spec governs only the **Phase-2 writer** `writeAutoApplyChanges` (`writeAutoApplyChanges.ts:143-160`), which today emits one `field_changed` row when **any** of `MI-8 | MI-8b | MI-8c | MI-9` is present in the `triggeredItems`/`notableItems` it receives. **The set of items the writer receives is unchanged by this spec**, and every item the writer receives has already passed Phase-1 admission — i.e. it represents a genuinely-applied change. Two Phase-1 gates run **before** the writer and are preserved untouched:

- **MI-8/MI-8b unstable-modifiedTime debounce** (`mi8DebounceReason`, `phase1.ts:278-292`): when Drive `modifiedTime` is still unstable and the only review items are MI-8/MI-8b, Phase-1 returns `defer` — the parse does **not** apply and the writer is **never reached** that pass, so **no `field_changed` row is written** for a deferred sync. An MI-8/MI-8b item can therefore exist in a pass that writes no row; this spec does not change that.
- **MI-11 hold gating** (`phase1.ts:504-507`): MI-11 is the ONLY hold-gated invariant; every other MI-6..MI-14 item (including MI-9, §3.2) auto-applies once Phase-1 admits apply.

The writer's implementation shape: build the per-item `fieldChanges` entries (§3.1) from the items it receives, then **emit the row iff `fieldChanges` is non-empty**. Because each MI-8/8b/8c/9 item the writer receives yields exactly one entry, this is **behavior-preserving vs. today** — the writer emits a row in exactly the same passes as today. The `iff non-empty` form is a **defensive invariant** (never write an empty structured row), not a routing change (invariant 7 honored). **Do not** weaken or bypass the Phase-1 debounce to "reach" the writer.

### 3.1 Per-invariant enrichment matrix

For each triggering item present, the writer produces a structured **field-change entry**. Entry shape (new): `{ label: string; from: string | null; to: string | null; note: string | null }` — an entry is either a **From→To entry** (`from`/`to` set, `note` null) or a **note-only entry** (`note` set, `from`/`to` null).

| Invariant | Item shape (live: `lib/parser/types.ts`) | Entry produced | Guard |
| --- | --- | --- | --- |
| **MI-8** financial clear (`:537`) | `{ field: "po"\|"proposal"\|"invoice"\|"invoiceNotes" }` — **widened** to also carry `prior: string\|null; next: string\|null` | From→To: `label` = display name (see §3.3), `from` = prior value or `"(unknown)"` for legacy/absent (see §3.5), `to` = `"(cleared)"` sentinel (MI-8 only fires had-value→now-empty, `invariants.ts:447-451`) | none |
| **MI-8b** COI status (`:538`) | `{ prior: string\|null; next: string\|null }` (already carried) | From→To: `label` = `"COI status"`, `from` = prior or `"(none)"`, `to` = next or `"(none)"` | none |
| **MI-8c** pull-sheet regression (`:539`) | `{ mode: "collapse"\|"ambiguous_format"\|"halved"\|"case_dropped"; details? }` | Note-only: `label` = `"Pull sheet"`, `note` = the mode's descriptive sentence (§3.4). No clean from/to — established (AUTOAPPLIED-REDESIGN-3 "MI-8c stays a sentence"). | none |
| **MI-9** LEAD-bit role delta (`:545`) | `{ crew_name; prior_flags: RoleFlag[]; new_flags: RoleFlag[] }` | Note-only: `label` = crew name, `note` = `"role updated on this sync"` | none — MI-9 auto-applies (§3.2); **no `heldNames` gate** |

**Ordering:** entries appended in the writer's evaluation order: all MI-8 (financial) first (in the `financialFields` array order — po, proposal, invoice, invoiceNotes), then MI-8b, then MI-8c entries, then MI-9. Deterministic, fixture-stable.

### 3.5 Legacy staged MI-8 compatibility (transitional-window, adversarial-review preempt)

`writeAutoApplyChanges` receives its items from two writer-reaching paths:

1. **Fresh cron/push parse** — in-memory items, **new shape** (`prior`/`next` present).
2. **Choice-aware staged apply** — `applyStagedCore.ts:578` calls `choiceAwareFeedItems(args.triggeredReviewItems, choices)` and forwards the result as `notableItems` **only when `feedPolicy.kind === "choice_aware"`** (`:600-605`); those items are the **stored** `pending.triggeredReviewItems` JSON (`applyStaged.ts:1386`), possibly staged **before this deploy**. (Note: the **dashboard** staged-apply caller uses `feedPolicy: { kind: "none" }`, `applyStaged.ts:1397-1399`, so it does **not** reach the writer — the concern is the choice-aware path only.)

MI-8 **can** be in a staged set — it is tiered for the wizard review UI (`lib/admin/step3ReviewItemTiers.ts:65`) — so a pre-deploy staged MI-8 is `{ id, invariant: "MI-8", field }` with **no `prior`/`next`**, and the staging guard `isStructurallyValidReviewItem` (`lib/staging/reviewPayloadGuards.ts:69`) does **not** require them (MI-8 is absent from `REVIEW_ITEM_REQUIRED_STRING_FIELDS`, `:53`), so it is valid and can reach the writer via path 2.

**Compatibility rule:** the MI-8 entry builder reads `from = typeof item.prior === "string" ? item.prior : "(unknown)"` — handling both `null` and **absent** — and always sets `to = "(cleared)"` (from `field`, which legacy carries). A legacy MI-8 therefore renders `"{field name}: (unknown) → (cleared)"` — informative and **never crashes, never emits `undefined`**. This is **backward-JSON tolerance at the writer**, not a routing change. **Non-tightening rule:** MI-8 MUST NOT be added to `REVIEW_ITEM_REQUIRED_STRING_FIELDS` (requiring `prior`/`next` there would reject otherwise-valid staged rows and brick pending work). Verified by a direct writer test (§9); a full choice-aware integration test is out of scope (routing is unchanged — the writer's input tolerance is the unit under change).

### 3.2 MI-9 is APPLIED, not held (corrected — live-routing verified)

MI-9 fires on a **LEAD-bit set-membership delta** (`invariants.ts:530-544`). **It auto-applies.** The live decision rule (`phase1.ts:504-507`) partitions **MI-11 as the ONLY hold-gated invariant** — it alone routes to per-crew `sync_holds`; "Every other invariant (MI-6..MI-14 except MI-11) … auto-apply and become Phase-2/Phase-5 feed rows." So the LEAD-bit change **is written to the DB on this sync**. (The catalog copy `MI-9_ROLE_FLAGS_DELTA` "we hold every LEAD toggle for review" describes the **admin-alert/notify** surface that additionally flags the LEAD change for a human to eyeball — it is **not** a `sync_holds` stage; the row still auto-applies. Do not conflate the alert with a hold.)

**Consequence for this feature:** naming an applied MI-9 change is **correct, not misleading** — the prior spec draft's `heldNames` suppression guarded a state that cannot occur (`heldNames` is populated only from `sync_holds`, `phase2.ts:464-468`, which only ever holds MI-11) and asserted a false "held" property. **The `heldNames` gate is removed for MI-9.** MI-9 produces a **note-only** entry: `label` = crew name, `note` = `"role updated on this sync"`. It deliberately does not format specific `RoleFlag[]` values (YAGNI — a note conveys the applied fact without a role-vocabulary formatter; the exact LEAD/flag detail lives on the companion admin alert). A crew member whose **identity** is concurrently MI-11-held still gets this note: `phase1.ts:580-584` — "MI-11 present → the rest of the parse still auto-applies; only the flagged crew's identity (email) holds" — so the role_flags change applied regardless of the email hold. (`ROLE_FLAGS_NOTICE`, `phase2.ts:522`, is the separate non-LEAD path and emits no MI-9 item — out of scope.)

### 3.3 Field display names (single source of truth)

Financial field → display name map (new constant, colocated with the writer):
`po` → `"PO number"`, `proposal` → `"Proposal"`, `invoice` → `"Invoice"`, `invoiceNotes` → `"Invoice notes"`. No raw enum token reaches the DOM (invariant 5 spirit; these are field names, not error codes).

### 3.4 MI-8c mode sentences

`collapse` → `"lost all rows"`; `ambiguous_format` → `"format became ambiguous"`; `halved` → `"lost more than half its cases"`; `case_dropped` → `"a case was dropped"`. Rendered as `"Pull sheet {sentence}"` in the note. (Descriptive English, no codes — invariant 5.)

## 4. Storage (Resolved Decision — no migration)

The structured entries are stored on the existing `show_change_log.after_image` **jsonb** column (`supabase/migrations/20260608000001_show_change_log.sql:17`; freeform, no CHECK — **no migration required**), as `after_image = { fieldChanges: FieldChangeEntry[] }`. `before_image` stays **null** (field_changed is non-undoable — no snapshot needed; consistent with today).

**Why after_image, and why this is PII-safe:**
- `show_change_log` is REVOKEd from `authenticated` and read only by the service-role loader (`loadRecentAutoApplied.ts:10-13`); the table already carries crew PII (name/email/phone) in crew-domain images.
- The stored values are **show-level business fields** (PO/invoice/proposal numbers, COI status) plus, for MI-9 note-only, a crew name (already shown elsewhere in the strip). No email/phone. `canonImage` (`writeAutoApplyChanges.ts:204`) only touches a top-level `email` key — `fieldChanges` has none, so canonicalization is a correct no-op.
- The telemetry read-core **never selects `before_image`/`after_image`** (`lib/observe/query/changeLog.ts`, AGENTS.md telemetry §), so `fieldChanges` never reaches the observe CLI. No new PII surface.
- `undo_change` reads `after_image` only for `crew_added` (`undo_change_rpc.sql:39`); `field_changed` is never undoable, so the RPC never reads these rows. `cleanup_superseded_before_images` touches crew-domain rows only. **No write-path conflict.**

Rejected alternatives: (a) a new dedicated column — needs a migration + validation-parity round for no benefit over the freeform jsonb already read by the loader; (b) encoding into the `summary` string and re-parsing in the reader — brittle, forbidden shape-in-string. The `summary` string is **also** upgraded to a plain-English one-line fallback (§5) but is not the structured source of truth.

## 5. Read path

`lib/admin/loadRecentAutoApplied.ts`:
- Extend `AutoAppliedDiff` (`:24`) with a new variant: `| { kind: "fields"; entries: FieldChangeEntry[] }`.
- `deriveDiff` (`:83`) gains a `field_changed` branch: read `after_image.fieldChanges`; if it is a non-empty array of well-formed entries, return `{ kind: "fields", entries }`; otherwise fall through to `{ kind: "none" }` (renders the summary sentence — back-compat for pre-existing rows written before this change).
- The loader's strict `readName`-only posture is preserved for crew kinds; the new branch reads only the controlled `fieldChanges` shape (label/from/to/note strings), never arbitrary image fields.

**Summary (writer, going forward):** whenever the writer emits a `field_changed` row it now sets `summary` to a plain-English one-liner naming the fields (e.g. `"COI status and PO number changed on this sync"`; capped — see §6). Because the row is only written when `fieldChanges` is non-empty (§3), the writer **no longer emits the generic "A field changed on this sync" string at all** — a meaningful summary always accompanies a written row. Consumers that show `summary` (monitor digest via `STRIP_KINDS`, `loadRecentAutoApplied.ts:63`; any client without the `fields` variant) therefore degrade gracefully and are strictly more informative than today. Digest parity: the digest reads `summary` only, so the richer sentence flows through with no digest code change (verify no digest test pins the old literal).

**Reader back-compat:** the generic `"A field changed on this sync"` sentence survives only as data on **pre-existing** rows already in the DB (written before this deploy, `after_image = null`). The reader renders those via the `{ kind:"none" }` → summary path (§5 below). No new row ever carries it.

## 6. UI (Option-B render — impeccable dual-gate, invariant 8)

`components/admin/RecentAutoAppliedStrip.tsx` `DiffBlock` (`:104`) gains a `d.kind === "fields"` branch rendering the entries as a compact list: each entry a `label` + either a `from → to` (reusing the existing From/To caption + line-through-old / strong-new treatment, `:113-133`) or the `note` text. Exact styling, spacing, and the pill/count treatment are **finalized by a dedicated Claude/impeccable design session** (kickoff handed off after this spec is approved); the approved Option-B comparison artifact is the interim visual reference.

**`isCrew` entity-label guard (MUST change — adversarial-review preempt):** the live `StripRow` computes `const isCrew = row.diff.kind !== "none"` (`:151`) — keyed on diff-kind, not change-kind. Adding the non-`none` `fields` variant would make `field_changed` rows render the **"Crew member"** entity label (`:159`), a user-visible misclassification on the exact surface this spec improves. The guard MUST be narrowed to the crew diff kinds explicitly: `const isCrew = row.diff.kind === "fromTo" || row.diff.kind === "single"` (crew_renamed = `fromTo`; crew_added/removed = `single`; `fields` and `none` are non-crew → no entity label). Verified by a `StripRow`-level test (§9), not only `DiffBlock`.

**Guard conditions (render):**
- `after_image.fieldChanges` absent / null / `[]` / malformed → loader returns `{ kind: "none" }` → summary sentence renders (no crash, no empty block).
- An entry with `note` set → render the note line; with `from`/`to` set → render the From→To line. An entry may not have both (writer invariant); reader renders `note` if present else From→To.
- `from`/`to`/`note`/`label` are always strings when their branch is taken (never null in that branch); the `"(cleared)"` / `"(none)"` sentinels cover empty source values so no blank cell renders.

**Cap/truncation:** a single sync realistically trips a handful of field entries (≤4 financial + COI + pull-sheet + per-crew MI-9). MI-9 is per-crew, so in a pathological large-roster LEAD sweep the list could be longer. Cap the rendered entry list at **8**; beyond 8, render the first 8 then a `"+N more"` note line. The `summary` sentence is capped at naming the first **3** fields then `"and N more"`. Both caps apply to the same ordered `fieldChanges` (§3.1).

**Transition inventory:** the `field_changed` row is static content inside the strip's existing group disclosure. The row's own content has **one visual state** (no intra-row toggles/animation) → no new transitions. The enclosing group expand/collapse and Accept/Undo button transitions are **unchanged** by this spec (no edits to `GroupSection` state machine). No `AnimatePresence` / ternary-render is added.

**Dimensional invariants:** the entries list is an auto-sized `grid`/flow inside the auto-height row card (`StripRow` `li`, `:150`) — no fixed-dimension parent, no flex-stretch dependency. (Not a layout-dimensions-task candidate; the existing `DiffBlock` From/To grid is auto-sized and unchanged.)

## 7. Guard conditions summary (every input)

- **MI-8 `prior` null / absent (legacy):** MI-8 only fires when prior had a value (`invariants.ts:447`), so `prior` is a non-empty string on the fresh path; if it is `null` OR absent (legacy staged row, §3.5), `from` renders `"(unknown)"` (never a blank cell, never `undefined`).
- **MI-8b both null:** cannot fire (fires only on `priorCoi !== nextCoi` after normalize, `invariants.ts:460`); if `prior`/`next` null, sentinels `"(none)"` apply.
- **Empty `fieldChanges`:** the writer writes **no `field_changed` row at all** (§3 defensive predicate) — never an empty structured row. Every field-family item the writer receives (MI-8/8b/8c/9) yields an entry, so this branch does not fire for any pass that fires today (behavior-preserving); it is a guard against a future item type that produces no entry.
- **Deferred MI-8/MI-8b (unstable modifiedTime):** Phase-1 `mi8DebounceReason` returns `defer` before the writer runs (§3), so the writer is never reached and **no `field_changed` row** is written that pass — unchanged from today. This spec must not weaken that debounce.
- **Malformed stored data / old rows:** reader falls through to `{ kind: "none" }` + summary sentence.

## 8. Non-goals

- No new per-field acknowledge rows (Option C rejected).
- No change to undo/acknowledge semantics, `individually_undoable`, `UNDOABLE_KINDS`, or the group count (still one row per sync).
- No change to the field-family invariant set and **no routing change** — the emission predicate is behavior-preserving (§3); MI-9 auto-applies (§3.2), so no sync that fires today stops firing.
- No migration, no new column, no new advisory-lock surface (rides the existing locked sync txn in `phase2.ts`), no new admin route/table, no new §12.4 error code.
- No enrichment of `crew_email_changed` (separate kind, out of scope; stays summary-sentence).
- MI-9 specific LEAD/`RoleFlag[]` values are not formatted/printed — note-only (§3.2).

## 9. Test surface (TDD)

- **`lib/parser/types.ts` + `invariants.ts`** — MI-8 widened to carry `prior`/`next`; existing MI-8 emit test updated to assert the new fields; `runInvariants` fixtures still green.
- **`lib/sync/changeLog/writeAutoApplyChanges.ts`** (extend the existing writer test `tests/sync/writeChangeLog.autoApply.test.ts`, `describe("writeAutoApplyChanges (Task 2.9)")`) — for each MI variant: correct entry shape, ordering, sentinels; **MI-9 is applied → always produces a note-only entry `{ label: crew_name, note:"role updated on this sync", from:null, to:null }`** (no `heldNames` dependency — the writer must not suppress MI-9 based on `heldNames`; failure mode caught: re-introducing a held-suppression that hides an applied LEAD change from the feed); mixed-invariant sync → ordered `fieldChanges` + capped summary; a sync with an MI-9 for a crew that is **also** MI-11-held → the MI-9 note **still** appears (grounded in `phase1.ts:580-584`). Assert `after_image.fieldChanges` structure against the **fixture-derived** expected (anti-tautology: derive from the input item values, not a hardcoded blob).
- **Real-path routing assertion (Codex R3):** a phase1/phase2-level test (extend `tests/sync/phase1.test.ts` or a phase2 apply test) proving an **MI-9 LEAD delta auto-applies** (reaches `writeAutoApplyChanges` as an applied item and lands a `field_changed` row) rather than routing to `sync_holds` — pins the `phase1.ts:504-507` contract this feature's MI-9 treatment relies on, so the writer unit test is not the only evidence. Failure mode caught: a future change routing MI-9 into holds would silently make the note describe a non-applied change.
- **Debounce regression (Codex R4):** a Phase-1 test asserting that a sync whose only field-family items are **MI-8/MI-8b with an unstable Drive `modifiedTime`** returns `defer` (`mi8DebounceReason`) and therefore **writes no `field_changed` row** (the writer is not reached). Pins that this feature does not weaken the debounce; if `tests/sync/phase1.test.ts` already covers the defer outcome, add the "no change-log row written" assertion. Failure mode caught: enriching the writer while accidentally bypassing the pre-Phase-2 defer, logging a field change for a sync that did not apply.
  - **Legacy MI-8 backward-JSON tolerance (§3.5):** at the writer, an MI-8 item `{ id, invariant:"MI-8", field:"po" }` with **no `prior`/`next`** (the pre-deploy staged shape that reaches the writer via the choice-aware path) → entry `{ label:"PO number", from:"(unknown)", to:"(cleared)", note:null }`; no `undefined` in the stored JSON, no throw. This is a direct writer unit test (routing unchanged; no new choice-aware integration test). Failure mode caught: a staged-before-deploy row emitting `undefined → (cleared)` or throwing on apply.
- **`tests/staging/reviewPayloadGuards.test.ts`** — assert MI-8 stays **absent** from `REVIEW_ITEM_REQUIRED_STRING_FIELDS` (a legacy `{id, invariant:"MI-8", field}` item passes `isStructurallyValidReviewItem`). Failure mode caught: someone "fixing" the widen by requiring `prior`/`next` there, which would reject valid staged rows.
- **`tests/admin/loadRecentAutoApplied.test.ts`** — `deriveDiff` field_changed branch: well-formed → `{kind:"fields"}`; absent/`[]`/malformed → `{kind:"none"}`; pre-existing null-after_image row → `{kind:"none"}`.
- **`tests/components/admin/RecentAutoAppliedStrip.test.tsx`** — `DiffBlock` renders `fields` entries (From→To + note lines); cap at 8 + "+N more"; `none` fallback still renders summary. **`StripRow`-level:** a `field_changed` row with `diff.kind === "fields"` renders **no "Crew member" label** (guards the §6 `isCrew` narrowing); a `crew_renamed`/`crew_added` row still renders it. Failure mode caught: the `fields` variant tripping the diff-kind-based `isCrew` guard.
- **Digest parity** — confirm no monitor-digest test pins the literal "A field changed on this sync"; richer summary flows through.
- **Meta-tests:** no new mutation surface (writer already carries `// not-subject-to-meta`, `writeAutoApplyChanges.ts:182`); no new §12.4 code; no advisory-lock topology change. **Declared: this milestone creates/extends no structural meta-test** (no new registry surface) — the change is payload enrichment on an existing, already-registered writer and loader.

## 10. Do-not-relitigate (reviewer preempts)

1. **MI-8c stays a sentence** — no clean field/from-to exists; ratified in AUTOAPPLIED-REDESIGN-3.
2. **MI-9 is APPLIED (not held), note-only, no LEAD values printed, no `heldNames` gate** — §3.2; verified against `phase1.ts:504-507` (MI-11 is the only hold-gated invariant). The catalog "hold every LEAD" copy is the alert/notify surface, not a `sync_holds` stage.
3. **after_image jsonb storage, no migration** — §4; freeform column already read by the loader; telemetry never selects images.
4. **One aggregate row, no per-field rows** — Option C rejected on the non-undoable-redundancy argument (§2); user-approved.
5. **`summary` upgraded but not the structured source** — §5; structured truth is `fieldChanges`, summary is graceful-degradation fallback.
6. **`crew_email_changed` untouched** — separate kind, out of scope (§8).
7. **Legacy staged MI-8 → `"(unknown)"` writer tolerance, guard NOT tightened, routing unchanged** — §3.5; the choice-aware staged path (`applyStagedCore.ts:578`) can forward a pre-deploy MI-8 lacking `prior`/`next`; the writer tolerates it (backward-JSON), `REVIEW_ITEM_REQUIRED_STRING_FIELDS` deliberately unchanged, no staged-feed routing change. The dashboard `feedPolicy:"none"` path does not reach the writer.
8. **`isCrew` narrowed to `fromTo`/`single`** — §6; the live guard is diff-kind-based and MUST change so `fields` rows don't render "Crew member".
9. **Emission predicate is behavior-preserving; generic writer summary retired** — §3/§5; the writer emits a row in exactly the same passes as today (every field-family item it receives yields an entry), and the generic "A field changed" string survives only as reader fallback on pre-existing DB rows.
10. **Phase-1 MI-8/MI-8b debounce preserved** — §3/§7/§9; the spec governs the Phase-2 writer only; deferred (unstable-modifiedTime) MI-8/MI-8b never reach it and write no row, unchanged. Do not weaken the debounce.
