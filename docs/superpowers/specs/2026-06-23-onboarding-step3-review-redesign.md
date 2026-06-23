# Onboarding Wizard Step 3 — "Review & Publish your sheets" (redesign)

**Status:** DRAFT (autonomous build, approved 2026-06-23)
**Scope:** UI redesign of onboarding wizard step 3 + the publish/Held lifecycle that backs it, plus two new admin views (Unpublished, Ignored sheets).
**Owner:** Opus / Claude Code (UI is Opus per AGENTS.md routing; server/DB portions same milestone).
**Relationship to master spec:** This is a v1 pre-deployment UX milestone. It does not amend the three ratified amendments in `00-overview.md`; where it changes server behavior (finalize resolution gate, Held-show creation, ignore partition) it is a deliberate, spec'd evolution and §12.4 catalog edits follow the 3-part lockstep.

---

## 1. Problem & intent

Wizard step 3 ("Review your sheets") is supposed to be the *"review the parse before activating the folder"* gate. The master spec's own words: ONBOARDING_SCAN_REVIEW = _"review the parse before activating this folder … so you're not committing to data you haven't seen"_ (`lib/messages/catalog.ts:1002-1010`), and the routing rule _"Wizard discovery is explicitly a 'review what's in the folder before activating' flow — auto-applying contradicts the wizard's reason for existing"_ (master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1070`).

The implementation diverged from that intent:

1. **The per-sheet review surface shows nothing to review.** "Review and apply" (`components/admin/wizard/Step3Review.tsx:262-268`) links to `app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx`, which is the **finalize-failure recovery** surface (`page.tsx:5` docstring; queries `wizard_approved = FALSE` only, `page.tsx:130`). Its heading is hardcoded *"Re-apply this sheet / The last publish attempt could not finish this sheet"* (`page.tsx:260-264`) — false on a first review — and it deliberately omits any parse preview (`page.tsx:21-24`). The only control is a single apply-only radio (`ONBOARDING_SCAN_REVIEW`, single allowed action — `components/admin/StagedReviewCard.tsx:113-120`), which is a non-choice.
2. **"Apply" ≠ publish, but nothing says so.** Per-sheet "Apply" only sets `pending_syncs.wizard_approved = true` + manifest `applied` (`lib/sync/applyStaged.ts` wizard path). The show is created **unpublished** at finalize (`firstSeenPublished: false`, `app/api/admin/onboarding/finalize/route.ts:700`) and only made live by the terminal CAS step `publishAppliedWizardShows` flipping `published = true` (`app/api/admin/onboarding/finalize-cas/route.ts:446-481`). `published=false` means the show is invisible to crew (`lib/auth/picker/resolveShowPageAccess.ts:182` → crew route `app/show/[slug]/[shareToken]/page.tsx:94-95` `notFound()`).
3. **Vestigial actions.** "Retry on next sync" parks a row as `discard_retryable`, which *blocks* finish (`finalize/route.ts:293`), and there is no cron sync during onboarding (the folder is not watched until finish) — a dead end that looks like progress.

**Goal:** make step 3 do what the spec promises — show what was parsed, in honest language — and give every sheet a clear, reversible destination.

---

## 2. Resolved decisions (LOCKED)

| # | Decision |
|---|---|
| D1 | Step 3 becomes **inline expandable cards** in the list (no per-sheet navigation). Collapsed = summary; expand = structured breakdown rendered from `parse_result`. |
| D2 | Each cleanly-parsed sheet has a **publish checkbox** (default **unchecked**) on the collapsed card; the header has a list-level **Select all** (selects all clean/reviewable sheets). |
| D3 | Three outcomes map to existing show lifecycle states: **checked → Live** (published); **unchecked clean → Held** (created, `published=false`); **Ignore this sheet → no show** (durable skip). **Couldn't-read** sheets get their own group (Retry / Ignore). |
| D4 | The end button reads **"Publish N shows & finish setup"** (N = live checked count). If clean sheets are left unchecked, a soft confirm fires: _"N sheets won't be published — you'll find them under Unpublished. Continue?"_ |
| D5 | New **`/admin/unpublished`** view lists **Held** shows; **Publish** there reuses the existing `PublishShowButton` → `publish_show` RPC. |
| D6 | New **Ignored sheets** view lists durably-ignored sheets with an **un-ignore** action. |
| D7 | The staged detail page reverts to **failure-recovery only**: its failure heading becomes conditional, and Step3Review no longer links first-review through it. |
| D8 | Language: **Apply → Approve/Publish**, scoped **onboarding-only** (the shared `StagedReviewCard` label is gated on wizard mode; the live-show "Apply this change" surface is untouched). |
| D9 (fork) | **Apply→Approve rename is onboarding-only** (live-show staged "Apply this change" wording unchanged). |
| D10 (fork) | **Unchecked existing-show sheet** (re-run-setup) → **leave the live show untouched** (no shadow applied). Held is a first-seen-only concept. |
| D11 (fork) | **Add `deferred_ingestions.drive_file_name`** so the Ignored-sheets view can show a name (first-seen ignored sheets have no `shows` row to join). |
| OOS | **C-style full crew-page preview** (rendering `CrewShell` from staged `parse_result`) is **DEFERRED to BACKLOG**. An "unpublish back to Held" inverse is **out of scope** (no RPC exists; not needed here). |

---

## 3. The three-outcome model

| Per-sheet choice | Becomes | Home | Reverse via |
|---|---|---|---|
| ✅ Check to publish | Live show (`published=true, archived=false`) | Dashboard | Unpublish (existing) |
| ▫️ Leave unchecked (clean, first-seen) | **Held** show (`published=false, archived=false`, not finalize-owned) | `/admin/unpublished` (new) | one-tap **Publish** |
| 🚫 Ignore this sheet | no show; durable live ignore record | **Ignored sheets** (new) | **Un-ignore** (new) |
| ⚠️ Couldn't read (hard_failed) | no show | review queue / wizard group | **Retry** |

"Held" is an **existing** first-class state: the per-show admin page computes `isHeld = !published && !archived && !finalizeOwned` and renders a "Held — not published" pill (`app/admin/show/[slug]/page.tsx:290-291`), with a one-tap Publish (`PublishShowButton` → `publishShowAction` → `publish_show` RPC). Held shows **keep syncing** while unpublished (cron's live-show gate is `archived = false` only; `published` is not a gate — `lib/sync/runScheduledCronSync.ts:1606-1630`).

---

## 4. UI — Step 3 inline cards

### 4.1 Structure
- The list (`components/admin/wizard/Step3Review.tsx`) renders one card per `onboarding_scan_manifest` row.
- **Header:** eyebrow "Step 3 of 3", heading "Review & publish your sheets", intro copy, a **Select all** control, and a live count line ("N of M selected to publish").
- **Clean sheet card (manifest `staged`):** a publish **checkbox** + the **summary** (always visible) + an **expand** toggle revealing the **breakdown**. No navigation link.
- **Couldn't-read group (manifest `hard_failed`):** rendered as a distinct grouped section below the clean cards, each with **Retry** / **Ignore this sheet** (no checkbox — there is no show to publish).
- **Footer:** "Publish N shows & finish setup" (`FinalizeButton`), N = checked count; soft-confirm dialog if clean sheets remain unchecked.

### 4.2 Summary fields (always visible) — all from `parse_result` (already fetched; see §7.1)
| Field | Source | Empty/null/0 behavior |
|---|---|---|
| Show title | `parse_result.show.title` | fall back to `driveFileName`, else the drive id |
| Client | `parse_result.show.client_label` | omit the client line if null/empty |
| Dates | `parse_result.show.dates` (travelIn → showDays → travelOut) | render only the segments present; if no dates at all, show "Dates not found" |
| Crew count | `parse_result.crewMembers.length` | "0 crew" rendered (not hidden) — a 0 is a signal |
| Rooms count | `parse_result.rooms.length` | "0 rooms" |
| Hotels count | `parse_result.hotelReservations.length` | "0 hotels" |
| Schedule days | `Object.keys(parse_result.runOfShow ?? {}).length` (titled run-of-show) | "0 schedule days"; **see D-numeric below** |
| Diagrams | `diagrams.linkedFolder != null || diagrams.embeddedImages.length > 0` | badge "Diagrams ✓" / omit |
| Reel | `openingReel != null` | badge "Reel ✓" / omit |
| Warnings | `parse_result.warnings[]` (filtered to severity ≥ info) | a prominent warning chip with count; **always shown when > 0** |

**D-numeric (schedule-days source of truth):** schedule-day count uses `Object.keys(runOfShow ?? {}).length`. `runOfShow` is optional (`lib/parser/types.ts:357`, `?`); when absent the count is 0. `show.dates.showDays.length` is **not** used for the count (a bare-window day can have a `ScheduleDay` without a `showDays` entry); the spec fixes one source to avoid the M12 numeric-sweep divergence class.

### 4.3 Breakdown fields (expanded)
| Section | Source | Cap / truncation |
|---|---|---|
| Crew | `crewMembers[].{name, role, role_flags}` | show all; if `> 30`, show first 30 + "…and K more" |
| Schedule outline | `runOfShow` keys (ISO date) → per-day `entries[].{start, title}` | per day, first 6 entries + "…+K"; days capped at 14 + "…+K days" |
| Rooms | `rooms[].{kind, name}` | first 20 + "…+K" |
| Hotels | `hotelReservations[].{hotel_name, names, check_in, check_out}` | first 12 + "…+K" |

All list renders guard `undefined`/empty arrays explicitly (the JSONB is untyped on the wire and `parse_result` is cast — `OnboardingWizard.tsx:199`; every field gets a coercion + empty guard).

### 4.4 Dimensional invariants
The inline card is flex/grid inside a fixed-width list column. Per AGENTS.md (Tailwind v4 does not default `.flex` to `align-items: stretch`):
- The checkbox + summary header row: checkbox is `shrink-0`; the summary text block is `min-w-0 flex-1` so long titles truncate, not overflow.
- The expand region uses an explicit max-height/auto height transition (see 4.5), not an unbounded child, so the fixed-width card never horizontally overflows.
- Every documented `data-testid` (`wizard-step3-card-<dfid>`, `…-summary`, `…-breakdown`, `…-checkbox`) inside the card asserts `child.width <= parent.width` within 0.5px in the layout-dimensions test (real browser, jsdom insufficient).

### 4.5 Transition inventory
States per card: **collapsed**, **expanded**; orthogonal: **unchecked**, **checked**; plus **couldn't-read** (no checkbox/expand). Pairs:
| Transition | Treatment |
|---|---|
| collapsed → expanded / expanded → collapsed | height auto-morph (reduced-motion: instant) |
| unchecked → checked / checked → unchecked | checkbox state + count update; instant (no animation needed) |
| Select all toggled | each card's checkbox updates; instant; count morphs (tabular-nums, no layout shift) |
| compound: expand while toggling Select-all | independent — expand animates, checkbox flips instantly; no interaction |
| list length change (a card moves to Ignored/Retry resolves) | row removal: instant in v1 (no reorder animation) — declared instant |

### 4.6 Guard conditions (per the global spec self-review rule)
- `parse_result` null/corrupt → the card renders the summary header (title fallback) + a "We couldn't read the details of this sheet" note and **no checkbox** (treated like couldn't-read); never crashes on a missing field.
- `crewMembers`/`rooms`/`hotelReservations` undefined → treated as `[]` (count 0).
- `warnings` undefined → no warning chip.
- Checkbox disabled while a publish-intent write for that row is in flight (prevents double-toggle races).

---

## 5. UI — `/admin/unpublished` (Held shows)

- **New route** `app/admin/unpublished/page.tsx` (admin-gated by `app/admin/layout.tsx`), a **separate top-nav route** (not a third dashboard segment) to avoid active/archived count drift (the M12 numeric-sweep class).
- Reads Held shows: `archived = false AND published = false`, then excludes finalize-owned ("Publishing…") rows using the existing `readFinalizeOwned` fan-out (`components/admin/Dashboard.tsx:310-333`) so a transient Publishing… row is not mislabeled Held (do **not** use `requires_resync` as a proxy — `Dashboard.tsx:290-296` warns it's cleared by Unarchive catch-up).
- Renders the existing sortable `ShowsTable` (`components/admin/ShowsTable.tsx`) with the "Held — not published" pill (`:128-136`) plus a per-row **Publish** action bound to each row's slug (the `.bind(null, slug)` pattern from `app/admin/show/[slug]/page.tsx:458`), reusing `publishShowAction` → `publish_show` RPC unchanged.
- Empty state: "No unpublished shows. Sheets you leave unchecked during setup will appear here."
- **publish_show gate awareness:** `publish_show` refuses with `PUBLISH_BLOCKED_PENDING_REVIEW` when `requires_resync` OR any non-wizard pending row exists (`supabase/migrations/20260601000000_b2_show_lifecycle.sql:119-128`). The Held shows this milestone creates must **not** leave non-wizard pending rows behind (see §7.5); the view surfaces the existing refusal + Re-sync affordance for any show that is blocked.
- **Invariant compliance:** Publish flows only through the `publish_show` RPC (single advisory-lock holder; never a direct `.from('shows').update`).

---

## 6. UI — Ignored sheets view + Ignore/Un-ignore

### 6.1 Ignore (write path)
- "Ignore this sheet" (on clean and couldn't-read cards) writes a **durable LIVE** `deferred_ingestions` row: `wizard_session_id IS NULL`, `deferred_kind = 'permanent_ignore'`, `deferred_by_email = canonicalize(adminEmail)` (the CHECK `deferred_ingestions_deferred_by_scope_check` requires email when `wizard_session_id IS NULL` — `supabase/migrations/20260501001000_internal_and_admin.sql:259-261`), `drive_file_name` populated (D11), `deferred_at_modified_time = NULL` (permanent_ignore carries no modtime). This mirrors the existing live discard writer `app/api/admin/pending-ingestions/[id]/discard/route.ts:32-69` (`upsertLiveDeferral`). **Why live, not wizard-scoped:** wizard-scoped deferrals are purged at finalize (`lib/onboarding/sessionLifecycle.ts:164-169` `purgeWizardRows`; `app/api/admin/onboarding/finalize-cas/route.ts:555-562` `deleteWizardDeferrals`), so a wizard-scoped ignore would not survive (the sheet would re-surface). Cron's skip gate reads only the live partition (`lib/sync/perFileProcessor.ts:103-122`).
- The onboarding ignore route (`app/api/admin/onboarding/pending_ingestions/[id]/permanent_ignore/route.ts`, today delegating to the wizard-scoped `retry/route.ts` `handleAction`) is changed to write the live partition (plumb admin email through). It also removes the sheet from the wizard's manifest/pending so it leaves the step-3 list.
- **Advisory lock:** the write runs under `withPostgresSyncPipelineLock(driveFileId)` (single holder), consistent with the live discard route.

### 6.2 Un-ignore (new route)
- **New route** `app/api/admin/ignored-sheets/[driveFileId]/unignore/route.ts`: admin-gated; under `withPostgresSyncPipelineLock(driveFileId)`, `DELETE FROM public.deferred_ingestions WHERE drive_file_id = $1 AND wizard_session_id IS NULL` (the `deleteLiveDeferral` primitive — `lib/sync/runScheduledCronSync.ts:930-955`). On the next scan the file re-surfaces because the skip gate no longer matches.
- **Invariants:** single advisory-lock holder; server route only (PostgREST DML lockdown — never a client `.from('deferred_ingestions').delete()`); idempotent (deleting an absent row is a no-op success).

### 6.3 Ignored sheets view
- **New route** `app/admin/ignored-sheets/page.tsx` (admin-gated). Reads `deferred_ingestions WHERE wizard_session_id IS NULL AND deferred_kind = 'permanent_ignore'`. Columns available: `drive_file_id, drive_file_name (D11), deferred_at, deferred_by_email, reason` (`supabase/migrations/20260501001000_internal_and_admin.sql:250-264` + the new column).
- Renders sheet **name** (D11), when ignored, by whom; a per-row **Un-ignore** action (6.2).
- Strictly `permanent_ignore` rows (not `defer_until_modified`, which is a separate auto-expiring state).
- Empty state: "No ignored sheets."

### 6.4 D11 schema add
- `ALTER TABLE public.deferred_ingestions ADD COLUMN IF NOT EXISTS drive_file_name text;` (nullable — historical rows have none). Populated at ignore time from `pending_ingestions.drive_file_name` (`:188`) / the manifest name. **Migration→validation parity** applies: apply surgically to validation project `vzakgrxqwcalbmagufjh`, `pnpm gen:schema-manifest`, commit the manifest (the `validation-schema-parity` gate enforces it).

---

## 7. Server — Held creation, publish-intent, resolution gate, cleanup hazard, mode boundary

### 7.1 Preview data (no new query)
`fetchStep3Data` (`components/admin/OnboardingWizard.tsx:120`) already `SELECT`s `staged_id, drive_file_id, parse_result` (`:160`) and currently discards everything but `parse_result.show.title` (`:199`). The change: thread the full `parse_result` (guarded cast to `ParseResult | null`) into `Step3Row` so the card renders summary + breakdown. **No new column is required** for §4. `triggered_review_items` is added to the `SELECT` **only if** the card must surface the sentinel/MI holds — default: it does not (clean summary + warnings only).

### 7.2 Publish-intent flag lifecycle (the checkbox)
The checkbox is the durable **publish-intent** bit. It reuses the existing approval concept (renamed in copy to Approve/Publish):

| Aspect | Mechanism |
|---|---|
| **Storage** | `pending_syncs.wizard_approved` (boolean) during review; at finalize the intent is stamped onto the created show via a new **`shows.wizard_publish_intent`** boolean (written in the first-seen INSERT alongside `wizard_created_session_id`) so it survives the manifest TRUNCATE in `purgeWizardRows` (`sessionLifecycle.ts:167`). **This is a `shows` DDL add → migration→validation parity required** (apply surgically to validation `vzakgrxqwcalbmagufjh` + `pnpm gen:schema-manifest` + commit manifest; same as §6.4's `drive_file_name`). Default `false` so existing/live shows are unaffected. |
| **Write (check)** | checking a box → existing wizard approve path sets `wizard_approved = true` + manifest `applied`. For a clean `ONBOARDING_SCAN_REVIEW` sheet the only reviewer choice is the apply-default (no human pick). |
| **Write (uncheck)** | new small **un-approve** action reverts `wizard_approved = false` + manifest back to a non-blocking clean status (see §7.3). |
| **Read** | finalize publishes checked (`wizard_approved=true`) shows; creates Held for unchecked clean rows; the CAS flip (§7.4) reads `wizard_publish_intent` to decide which created shows to flip to `published=true`. |
| **Effect on output** | checked → Live; unchecked → Held. No zombie flag. |

> **Persistence rationale:** publish-intent must survive page refresh/navigation (Doug may work a long list over time), so it is written per-toggle (durable), not held client-side. The un-approve action is net-new (today only finalize's internal `demotePending` reverts approval).

### 7.3 Resolution-gate relaxation (CHECK/enum migration matrix)
Today an unchecked clean row is manifest status `staged`, which `unresolvedManifestCount` counts as **blocking** (`finalize/route.ts:293`; also enforced in `finalize-cas`). The gate must accept "unchecked clean = create as Held".

**Manifest status migration matrix** (`onboarding_scan_manifest.status` CHECK):
| status value | meaning | counts as unresolved? (today → after) |
|---|---|---|
| `staged` | reviewed-but-undecided | today: yes (blocks). After: a clean `staged` row left unchecked is treated as **resolvable-as-Held** at finalize — finalize creates it Held rather than 409'ing. |
| `applied` | checked-for-publish | no → no |
| `hard_failed` | couldn't parse | yes → yes (must Retry or Ignore) |
| `discard_retryable` | (vestigial in onboarding) | yes → **removed from onboarding card flow** (no "Retry on next sync") |
| `defer_until_modified` / `permanent_ignore` / `skipped_non_sheet` | resolved | no → no |
| **(option)** new `held` status | explicit "create as Held" | n/a → if introduced, idempotent `DROP ... IF EXISTS` + `ADD` CHECK; transitional window: inline `tables/` CHECK must accept both old and new before `migrations/` runs; apply-twice idempotent. |

**Decision:** prefer **not** adding a new status value. The finalize gate is relaxed to treat a clean `staged` row (parse_result present, not hard_failed/conflict) as a **valid finish input** that produces a Held show, rather than a blocker. This avoids a CHECK migration on `status`. (If implementation finds a status value unavoidable, the matrix above governs it: idempotent constraint, transitional dual-accept, apply-twice safe.)

### 7.4 Held creation at finalize + narrowed CAS flip
- `finalize/route.ts` must also process **unchecked clean** rows (not only `wizard_approved=true`): run the same first-seen apply core (`:683-704`, `firstSeenPublished:false`, `wizardCreatedSessionId`), writing `wizard_publish_intent = false` for unchecked, `true` for checked.
- `finalize-cas` `publishAppliedWizardShows` (`:446-481`) currently flips `published=true` for **all** session-created applied first-seen shows; it is **narrowed** to flip only `wizard_publish_intent = true` shows. Existing-show shadows already preserve `published` (the payload never carries it; the UPDATE arm never writes it — confirmed), so only the first-seen flip narrows.
- After `final_cas_done`, an unflipped Held show reads as stable "Held" (the `readfinalizeowned_b2` "Publishing…" gate keys only on checkpoint status `in_progress`/`all_batches_complete`).

### 7.5 Cleanup hazard fix (CRITICAL)
`cleanupAbandonedFinalize` deletes session-created first-seen shows by `created_show_id` provenance **with `s.published = false` as a belt-and-suspenders proxy** in **both** the non-terminal path (`sessionLifecycle.ts:406-412`) and the terminal orphan sweep (`:652-659`). An intentionally-Held show is provenance-matched **and** `published=false`, so both would delete it.

**Fix — net invariant:** *A `published=false` show that is a **deliberate Held outcome** (carries `wizard_publish_intent = false` and whose owning session reached `final_cas_done`) is **never** deleted by either cleanup sweep. A `published=false` interim show of a session that **never reached `final_cas_done`** (genuinely abandoned) remains deletable.* Implementation: both delete predicates (`sessionLifecycle.ts:406-412` and `:652-659`) add a guard excluding deliberate-Held rows — e.g. `AND NOT (s.wizard_publish_intent = false AND <owning session.status = 'final_cas_done'>)`. A structural test pins it: a Held show created by a **completed** session survives a subsequent `cleanupAbandonedFinalize`.

> **Implementation note for the plan:** the exact predicate placement (non-terminal vs terminal branch) is resolved in the plan against the live function; the invariant is *"deliberate Held shows (intent=false, session final_cas_done) are never deleted; abandoned interim shows still are."*

### 7.6 Mode boundary (D10)
"Unchecked → Held" applies **only to first-seen sheets**. An unchecked sheet that maps to an **already-live** show (re-run-setup; `showExists` true → `stageExistingShowShadow` path, `finalize/route.ts:666-670`) must **leave the live show untouched** — no shadow staged, no apply. The spec explicitly states: re-run-setup unchecked = no-op for that show. (v1 onboarding of a fresh folder is all first-seen; this boundary matters for re-run-setup on an existing watched folder.)

---

## 8. Copy & §12.4 lockstep; staged-page conditional heading

### 8.1 Language
- Component button "Apply" → "Approve"/"Publish" in the onboarding/wizard context only. `StagedReviewCard`'s `actionLabel` (`components/admin/StagedReviewCard.tsx:189`) and the Apply submit button (`:637`) are **gated on `isWizardMode`** (`:278`) so the live-show staged surface ("Apply this change") is unchanged (D9).
- Step3Review header/resolution copy (`Step3Review.tsx:337-366`) is rewritten for the new model (review & publish; held-aware; no "every row must be resolved").

### 8.2 §12.4 3-part lockstep (catalog prose only)
Any catalog-prose edit (the codes whose `dougFacing`/`helpfulContext` literally say "Apply"/"approve" tied to onboarding — e.g. `ONBOARDING_SCAN_REVIEW` `lib/messages/catalog.ts:1000`) lands as **one commit** with: (a) master spec §12.4 prose + the helpfulContext YAML appendix, (b) `pnpm gen:spec-codes` regen of `lib/messages/__generated__/spec-codes.ts`, (c) the matching `lib/messages/catalog.ts` row. The parity gate is **`tests/cross-cutting/codes.test.ts:76-99`** (run via `pnpm test:audit:x1-catalog-parity`) — it compares `dougFacing/crewFacing/followUp/helpfulContext` only. (AGENTS.md's `tests/messages/codes.test.ts:92` cite is **stale**; the real gate path is `tests/cross-cutting/codes.test.ts`.) Pure button labels are **not** catalog and need no lockstep.

### 8.3 Staged page conditional heading (D7)
`app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx:260-264`: gate the failure copy on `row.last_finalize_failure_code !== null` (already loaded, `:126`). Failure → "Re-apply this sheet / The last publish attempt could not finish…"; otherwise neutral "Re-review this sheet" copy. This is a **state page with no §12.4 code** (`page.tsx:66`), so no catalog work. Removing the Step3Review "Review and apply" link (§4.1) is what stops first-review traffic here.

---

## 9. Plan-wide invariant compliance

1. **TDD per task** — every task failing-test-first.
2. **Per-show advisory lock, single holder** — the new un-ignore route and the changed ignore route acquire `withPostgresSyncPipelineLock(driveFileId)` at exactly one layer (mirroring the live discard route); the finalize/CAS changes ride the existing holder (no new lock layer). Pinned by `tests/auth/advisoryLockRpcDeadlock.test.ts` if topology changes.
3. **Email canonicalization** — the live ignore write uses `canonicalize(adminEmail)`.
4. **No global sync cursor** — untouched.
5. **No raw error codes in UI** — `PUBLISH_BLOCKED_PENDING_REVIEW` and any new code surface through `lib/messages/lookup.ts`/`ErrorExplainer`.
6. **Commit per task** — conventional commits (`feat(onboarding|admin|db|sync):`).
7. **Spec canonical** — §12.4 edits via lockstep.
8. **UI quality gate** — every UI surface (Step3 cards, `/admin/unpublished`, Ignored-sheets view) passes `/impeccable critique` AND `/impeccable audit` (HIGH/CRITICAL fixed or DEFERRED), externally attested, before milestone close.
9. **Supabase call-boundary discipline** — every new Supabase call destructures `{ data, error }`, distinguishes thrown vs returned errors, surfaces typed `infra_error`; new helpers register in the relevant meta-test (`tests/admin/_metaInfraContract.test.ts`).

**PostgREST DML lockdown:** the new un-ignore route mutates `deferred_ingestions` server-side only under advisory lock; confirm `deferred_ingestions` INSERT/UPDATE/DELETE is REVOKEd from `authenticated`/`anon` (or add the registry row). `shows.published` flips only via `publish_show` RPC.

---

## 10. Meta-test inventory (CREATE / EXTEND)
- **EXTEND** `tests/auth/_metaInfraContract.test.ts` (or `tests/admin/_metaInfraContract.test.ts`) — new admin Supabase call sites (Unpublished view loader, Ignored-sheets loader).
- **EXTEND** `tests/db/postgrest-dml-lockdown.test.ts` registry — the un-ignore route's `deferred_ingestions` DML surface.
- **CREATE** a structural test pinning the cleanup-hazard invariant (§7.5): a Held show from a completed session survives `cleanupAbandonedFinalize`.
- **EXTEND** the advisory-lock topology test if the un-ignore route adds a new lock surface.
- Layout-dimensions test (real browser) for §4.4; transition-audit test for §4.5.

---

## 11. Out of scope / Backlog
- **BL-STEP3-FULL-CREW-PREVIEW** — C-style full crew-page preview (render `CrewShell` from staged `parse_result` via a `parse_result → ShowForViewer` adapter).
- **BL-UNPUBLISH-TO-HELD** — an "unpublish (back to Held)" inverse action (the existing M12.13 token-unpublish *archives*; no published→Held RPC exists).

---

## 12. Acceptance criteria
- AC1: Step 3 shows, per clean sheet, the summary (title/client/dates + counts + diagrams/reel/warnings) without navigation; expand reveals crew/schedule/rooms/hotels from `parse_result`. (Derived from fixture dimensions, not hardcoded.)
- AC2: A checked sheet becomes a Live (published) show after "Publish N shows & finish setup"; an unchecked clean first-seen sheet becomes a **Held** show, visible in `/admin/unpublished`, publishable one-tap there.
- AC3: An unchecked clean sheet does **not** block finish; a soft confirm appears when any remain unchecked.
- AC4: "Ignore this sheet" durably keeps the sheet out of sync (survives finish), shows in the Ignored-sheets view by name, and un-ignore returns it on next scan.
- AC5: A Held show created by a **completed** finalize session survives `cleanupAbandonedFinalize` (no deletion). (§7.5 structural test.)
- AC6: The staged detail page shows failure copy only when `last_finalize_failure_code` is set; first review no longer routes through it.
- AC7: The live-show staged "Apply this change" wording is unchanged (D9); onboarding uses Approve/Publish.
- AC8: An unchecked **existing-show** (re-run-setup) sheet leaves the live show untouched (D10).
- AC9: `published` flips only via `publish_show`; `deferred_ingestions` mutations only via server routes under advisory lock; new Supabase calls follow the call-boundary contract.
- AC10: All UI surfaces pass the impeccable critique + audit dual-gate (externally attested).

---

## 13. Existing-code citations (verified against `origin/main` @ afb90ba1)
- `components/admin/wizard/Step3Review.tsx` — list, `Review and apply` link `:262-268`, resolution copy `:337-366`.
- `components/admin/OnboardingWizard.tsx:120` `fetchStep3Data`, `:160` select, `:199` parse_result discard, `:234` allResolved.
- `components/admin/StagedReviewCard.tsx:113-120` `allowedActionsFor`, `:189` `actionLabel`, `:278` `isWizardMode`, `:637` Apply button, `:650` first-seen defer/ignore render.
- `app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx:21-24` no preview, `:66` no §12.4 code, `:126` select, `:130` `wizard_approved=false`, `:260-264` hardcoded failure heading, `:267-272` mode.
- `app/api/admin/onboarding/finalize/route.ts:293` unresolved gate, `:300-318` `selectApprovedRows`, `:666-670` existing-show shadow, `:683-704` first-seen apply core, `:700` `firstSeenPublished:false`, `:798-802` `ONBOARDING_NOT_RESOLVED`.
- `app/api/admin/onboarding/finalize-cas/route.ts:446-481` `publishAppliedWizardShows`, `:555-562` `deleteWizardDeferrals`.
- `lib/onboarding/sessionLifecycle.ts:164-169` `purgeWizardRows`, `:406-412` non-terminal first-seen delete (`published=false`), `:652-659` terminal orphan sweep.
- `lib/sync/runScheduledCronSync.ts:930-955` `readLiveDeferral`/`deleteLiveDeferral`, `:1159-1165` first-seen published INSERT, `:1606-1630` `listPostgresLiveShows` (archived-only gate).
- `lib/sync/perFileProcessor.ts:103-122` live-deferral skip gate.
- `app/api/admin/pending-ingestions/[id]/discard/route.ts:32-69` `upsertLiveDeferral` (reference impl).
- `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts:218-246` wizard-scoped deferral write (to be redirected to live).
- `supabase/migrations/20260501001000_internal_and_admin.sql:188` `pending_ingestions.drive_file_name`, `:250-264` `deferred_ingestions` DDL, `:259-261` scope CHECK.
- `supabase/migrations/20260601000000_b2_show_lifecycle.sql:8` `requires_resync`, `:119-128` `publish_show` gate (`PUBLISH_BLOCKED_PENDING_REVIEW`).
- `lib/auth/picker/resolveShowPageAccess.ts:182` unpublished access; `app/show/[slug]/[shareToken]/page.tsx:94-95` crew 404.
- `lib/messages/catalog.ts:1000` `ONBOARDING_SCAN_REVIEW`.
- `components/admin/Dashboard.tsx:124-167` active bucket, `:290-296` requires_resync warning, `:310-333` `readFinalizeOwned`, `:363` `finalizeOwned`.
- `components/admin/ShowsTable.tsx:128-136` Held pill.
- `app/admin/show/[slug]/page.tsx:290-291` `isHeld`, `:458` publish action bind.
- `lib/parser/types.ts:365` `ParseResult`, `:357` `runOfShow?`.
- Parity gate: `tests/cross-cutting/codes.test.ts:76-99` (`pnpm test:audit:x1-catalog-parity`).
