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

**Goal:** the `field_changed` row names each auto-applied show-level field and shows its From→To, in one row, without new per-field rows and without touching undo/acknowledge semantics. The field-family invariant set is unchanged; the emission predicate is tightened only to stop writing a row for the held-only-MI-9 case that was never actually auto-applied (§3).

Three options were mocked (approved comparison artifact: the Option-B card). Decision:

| Option | What | Rejected because |
| --- | --- | --- |
| A — name only | Summary names fields, no values | Doug still can't see old→new; low payoff for near-same effort as B |
| **B — From→To in row (CHOSEN)** | One row lists each field + old→new | Delivers the value; reuses the reader's existing `DiffBlock` machinery; no undo/count change |
| C — per-field rows + stored before/after-image | One acknowledge row per field | **Rejected on the user's redundancy concern**: `field_changed` is non-undoable, so per-row granularity buys nothing actionable — it only multiplies dismissal taps for one sheet edit. The group's existing "Accept all" already clears the bucket. |

## 3. What triggers the row (predicate tightened — held-only no longer emits)

Today `writeAutoApplyChanges.ts:143-160` emits one `field_changed` row when **any** of `MI-8 | MI-8b | MI-8c | MI-9` is present in `triggeredItems`, **ignoring `heldNames`**. This spec's field-family set (which invariants can contribute) is unchanged, but the **emission predicate is tightened**: the row is emitted **iff at least one genuinely-applied field-change entry survives the per-item guards** (§3.1) — i.e. the post-guard `fieldChanges` list is non-empty.

The only case this flips: a sync whose sole field-family item(s) are **held MI-9** (§3.2). Today that writes a generic "A field changed on this sync" acknowledge row for a change that was **not** auto-applied (it is pending LEAD review); after this change, **no `field_changed` row is written** — the held change is surfaced through its own review/notify path (`sync_holds`, Phase 5), not the auto-applied acknowledge feed. MI-8/MI-8b/MI-8c always produce an entry (they are genuinely applied), so their row behavior is unchanged. This is a deliberate, spec-documented correctness fix (not a silent routing change; invariant 7 honored), and it directly serves the feature's goal: the auto-applied feed should not show a row for something that was not auto-applied.

### 3.1 Per-invariant enrichment matrix

For each triggering item present, the writer produces a structured **field-change entry**. Entry shape (new): `{ label: string; from: string | null; to: string | null; note: string | null }` — an entry is either a **From→To entry** (`from`/`to` set, `note` null) or a **note-only entry** (`note` set, `from`/`to` null).

| Invariant | Item shape (live: `lib/parser/types.ts`) | Entry produced | Guard |
| --- | --- | --- | --- |
| **MI-8** financial clear (`:537`) | `{ field: "po"\|"proposal"\|"invoice"\|"invoiceNotes" }` — **widened** to also carry `prior: string\|null; next: string\|null` | From→To: `label` = display name (see §3.3), `from` = prior value or `"(unknown)"` for legacy/absent (see §3.5), `to` = `"(cleared)"` sentinel (MI-8 only fires had-value→now-empty, `invariants.ts:447-451`) | none |
| **MI-8b** COI status (`:538`) | `{ prior: string\|null; next: string\|null }` (already carried) | From→To: `label` = `"COI status"`, `from` = prior or `"(none)"`, `to` = next or `"(none)"` | none |
| **MI-8c** pull-sheet regression (`:539`) | `{ mode: "collapse"\|"ambiguous_format"\|"halved"\|"case_dropped"; details? }` | Note-only: `label` = `"Pull sheet"`, `note` = the mode's descriptive sentence (§3.4). No clean from/to — established (AUTOAPPLIED-REDESIGN-3 "MI-8c stays a sentence"). | none |
| **MI-9** LEAD-bit role delta (`:545`) | `{ crew_name; prior_flags: RoleFlag[]; new_flags: RoleFlag[] }` | Note-only: `label` = crew name, `note` = `"role updated on this sync"` | **Skip if `crew_name ∈ heldNames`** (§3.2) |

**Ordering:** entries appended in the writer's evaluation order: all MI-8 (financial) first (in the `financialFields` array order — po, proposal, invoice, invoiceNotes), then MI-8b, then MI-8c entries, then MI-9. Deterministic, fixture-stable.

### 3.5 Legacy staged MI-8 compatibility (transitional-window, adversarial-review preempt)

`writeAutoApplyChanges` runs on two paths: the fresh cron/push parse (in-memory items — new shape) **and** the staged-apply path, where `notableItems` derive from `pending_syncs.triggered_review_items` — JSON staged possibly **before this deploy**. A pre-deploy MI-8 item is `{ id, invariant: "MI-8", field }` with **no `prior`/`next`**, and the staging guard `isStructurallyValidReviewItem` (`lib/staging/reviewPayloadGuards.ts:69`) does **not** require them (MI-8 is absent from `REVIEW_ITEM_REQUIRED_STRING_FIELDS`, `:53`), so such a row is valid and reaches the new writer. **Compatibility rule:** the MI-8 entry builder reads `from = typeof item.prior === "string" ? item.prior : "(unknown)"` — handling both `null` and **absent** — and always sets `to = "(cleared)"` (from `field`, which legacy carries). A legacy MI-8 therefore renders `"{field name}: (unknown) → (cleared)"` — informative and **never crashes, never emits `undefined`**. **Non-tightening rule:** MI-8 MUST NOT be added to `REVIEW_ITEM_REQUIRED_STRING_FIELDS` (requiring `prior`/`next` there would reject otherwise-valid staged rows and brick pending work). This is verified by a dedicated legacy-shape test (§9).

### 3.2 MI-9 held-vs-applied guard (correctness, adversarial-review preempt)

MI-9 fires on a **LEAD-bit set-membership delta** (`invariants.ts:530-544`). A LEAD change is **held for review** (catalog `MI-9_ROLE_FLAGS_DELTA` at `lib/messages/catalog.ts:866`: "we hold every LEAD toggle for review"); its feed entry comes from the review/notify path, not the auto-applied strip. Non-LEAD role_flags changes auto-apply via `ROLE_FLAGS_NOTICE` (`lib/sync/phase2.ts:522`), a **separate mechanism that does not emit an MI-9 item** and is out of scope here.

Today the writer's `field_changed` boolean check ignores `heldNames`, so a held MI-9 still contributes to the generic "A field changed" row. Enriching that to a specific role line would describe a **pending-review** change as applied — misleading. **Guard:** the MI-9 entry is emitted only when `crew_name ∉ args.heldNames` (already passed into the writer, `phase2.ts:464-480`). Combined with the tightened emission predicate (§3): if every field-family item in a sync is a held MI-9, `fieldChanges` is empty and **no `field_changed` row is written at all** (not a generic fallback) — the held change reaches Doug through its own review/notify path. The MI-9 entry deliberately does **not** print specific LEAD/flag values (avoids asserting a specific applied role state for a change that may be a hold artifact) — note-only.

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

**Cap/truncation:** a single sync realistically trips ≤ ~6 field entries (4 financial + COI + pull-sheet; MI-9 held-gated). Cap the rendered entry list at **8**; beyond 8, render the first 8 then a `"+N more"` note line. The `summary` sentence is capped at naming the first **3** fields then `"and N more"`.

**Transition inventory:** the `field_changed` row is static content inside the strip's existing group disclosure. The row's own content has **one visual state** (no intra-row toggles/animation) → no new transitions. The enclosing group expand/collapse and Accept/Undo button transitions are **unchanged** by this spec (no edits to `GroupSection` state machine). No `AnimatePresence` / ternary-render is added.

**Dimensional invariants:** the entries list is an auto-sized `grid`/flow inside the auto-height row card (`StripRow` `li`, `:150`) — no fixed-dimension parent, no flex-stretch dependency. (Not a layout-dimensions-task candidate; the existing `DiffBlock` From/To grid is auto-sized and unchanged.)

## 7. Guard conditions summary (every input)

- **MI-8 `prior` null / absent (legacy):** MI-8 only fires when prior had a value (`invariants.ts:447`), so `prior` is a non-empty string on the fresh path; if it is `null` OR absent (legacy staged row, §3.5), `from` renders `"(unknown)"` (never a blank cell, never `undefined`).
- **MI-8b both null:** cannot fire (fires only on `priorCoi !== nextCoi` after normalize, `invariants.ts:460`); if `prior`/`next` null, sentinels `"(none)"` apply.
- **Empty `fieldChanges` (e.g. held-only MI-9):** the writer writes **no `field_changed` row at all** (§3 tightened predicate) — never an empty structured row, never a generic fallback row. The held change is surfaced via its own review/notify path.
- **Malformed stored data / old rows:** reader falls through to `{ kind: "none" }` + summary sentence.

## 8. Non-goals

- No new per-field acknowledge rows (Option C rejected).
- No change to undo/acknowledge semantics, `individually_undoable`, `UNDOABLE_KINDS`, or the group count (still one row per sync).
- No change to the field-family invariant set; the emission *predicate* is tightened only to drop the held-only-MI-9 case (§3) — no other routing change.
- No migration, no new column, no new advisory-lock surface (rides the existing locked sync txn in `phase2.ts`), no new admin route/table, no new §12.4 error code.
- No enrichment of `crew_email_changed` (separate kind, out of scope; stays summary-sentence).
- MI-9 specific LEAD/flag values are not printed (§3.2).

## 9. Test surface (TDD)

- **`lib/parser/types.ts` + `invariants.ts`** — MI-8 widened to carry `prior`/`next`; existing MI-8 emit test updated to assert the new fields; `runInvariants` fixtures still green.
- **`lib/sync/changeLog/writeAutoApplyChanges.ts`** (new test file `tests/sync/changeLog/writeAutoApplyChanges.test.ts`) — for each MI variant: correct entry shape, ordering, sentinels; **held-only MI-9 → NO `field_changed` row written at all** (assert zero inserts — not a generic fallback; guards the §3 tightened predicate; failure mode: a pending-review LEAD change appearing in the auto-applied acknowledge feed); MI-8/8b/8c present alongside a held MI-9 → row written with the applied entries, MI-9 entry absent; mixed-invariant sync → ordered `fieldChanges` + capped summary. Assert `after_image.fieldChanges` structure against the **fixture-derived** expected (anti-tautology: derive from the input item values, not a hardcoded blob).
  - **Legacy MI-8 compat (§3.5):** an MI-8 item `{ id, invariant:"MI-8", field:"po" }` with **no `prior`/`next`** → entry `{ label:"PO number", from:"(unknown)", to:"(cleared)", note:null }`; no `undefined` in the stored JSON, no throw. Failure mode caught: a staged-before-deploy row bricking apply or emitting `undefined → (cleared)`.
- **`tests/staging/reviewPayloadGuards.test.ts`** — assert MI-8 stays **absent** from `REVIEW_ITEM_REQUIRED_STRING_FIELDS` (a legacy `{id, invariant:"MI-8", field}` item passes `isStructurallyValidReviewItem`). Failure mode caught: someone "fixing" the widen by requiring `prior`/`next` there, which would reject valid staged rows.
- **`tests/admin/loadRecentAutoApplied.test.ts`** — `deriveDiff` field_changed branch: well-formed → `{kind:"fields"}`; absent/`[]`/malformed → `{kind:"none"}`; pre-existing null-after_image row → `{kind:"none"}`.
- **`tests/components/admin/RecentAutoAppliedStrip.test.tsx`** — `DiffBlock` renders `fields` entries (From→To + note lines); cap at 8 + "+N more"; `none` fallback still renders summary. **`StripRow`-level:** a `field_changed` row with `diff.kind === "fields"` renders **no "Crew member" label** (guards the §6 `isCrew` narrowing); a `crew_renamed`/`crew_added` row still renders it. Failure mode caught: the `fields` variant tripping the diff-kind-based `isCrew` guard.
- **Digest parity** — confirm no monitor-digest test pins the literal "A field changed on this sync"; richer summary flows through.
- **Meta-tests:** no new mutation surface (writer already carries `// not-subject-to-meta`, `writeAutoApplyChanges.ts:182`); no new §12.4 code; no advisory-lock topology change. **Declared: this milestone creates/extends no structural meta-test** (no new registry surface) — the change is payload enrichment on an existing, already-registered writer and loader.

## 10. Do-not-relitigate (reviewer preempts)

1. **MI-8c stays a sentence** — no clean field/from-to exists; ratified in AUTOAPPLIED-REDESIGN-3.
2. **MI-9 note-only + held-gated, no LEAD values printed** — §3.2; deliberate, more correct than status quo.
3. **after_image jsonb storage, no migration** — §4; freeform column already read by the loader; telemetry never selects images.
4. **One aggregate row, no per-field rows** — Option C rejected on the non-undoable-redundancy argument (§2); user-approved.
5. **`summary` upgraded but not the structured source** — §5; structured truth is `fieldChanges`, summary is graceful-degradation fallback.
6. **`crew_email_changed` untouched** — separate kind, out of scope (§8).
7. **Legacy staged MI-8 → `"(unknown)"` fallback, guard NOT tightened** — §3.5; transitional-window compat, `REVIEW_ITEM_REQUIRED_STRING_FIELDS` deliberately unchanged.
8. **`isCrew` narrowed to `fromTo`/`single`** — §6; the live guard is diff-kind-based and MUST change so `fields` rows don't render "Crew member".
9. **Held-only MI-9 writes no row (predicate tightened)** — §3/§3.2; a not-auto-applied held LEAD change must not appear in the auto-applied acknowledge feed; the generic writer summary is retired (survives only on pre-existing DB rows).
