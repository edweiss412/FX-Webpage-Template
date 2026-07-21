# Spec review R3a - MATERIALIZE (section 5 only)

## Your role: REVIEWER ONLY

Do not fix issues, do not propose patches, do not imply changes you will make. Surface findings only. Do NOT run shell commands or tools; the artifact is inlined. Do NOT invoke any nested review.

## Context

A DEV-ONLY instrument in a Next.js 16 + Supabase admin app. It renders every alert/warning state of an admin "show modal" without waiting for live data to raise the row. One catalog, two consumers: a build-gated gallery route (renders states, no DB) and a "materialize" dev-panel card (writes tagged rows into a local or validation Supabase so the real modal shows the state for real).

Scenario rows are authored in the DB's own column names. Alerts carry { code, context, raised_at, occurrence_count } plus a gallery-only declared identity. Holds carry sync_holds columns. Warnings are tri-state: absent = do not touch the column, [] = deliberately write zero, non-empty = write it.

Two prior rounds ran; all P0/P1 findings were repaired. This round reviews the repaired document.

## Binding project invariants (abbreviated)

- Inv 2: mutations of shows/crew_members/crew_member_auth/pending_syncs/pending_ingestions run inside a per-show advisory lock held at EXACTLY ONE layer; nested holders deadlock.
- Inv 5: no raw error codes in user-visible UI. A scoped dev-instrument exception is ratified in 1.1 - verify its scope is coherent, do not re-argue that it exists.
- Inv 9: every Supabase call destructures { data, error }; infra faults surface as typed discriminable results.
- Inv 10: every mutating server action needs a registry row plus executable success-branch behavioral proof; emits post-commit, outside any lock.
- Dev routes under app/admin/dev/ are gated BUILD-TIME by a script that renames registered files aside before `next build`.
- Every prop/input needs stated behavior for null, empty, zero, malformed.

## Output format

Per finding: `SEVERITY (P0/P1/P2/P3) - <claim> - <section> - <why it fails, concretely>`.
Enumerate ALL instances of each defect class in THIS round; dripping one instance per round is a review defect.

End with a final line exactly: `VERDICT: APPROVE` or `VERDICT: NEEDS-ATTENTION` or `VERDICT: BLOCKING`

## SCOPE: section 5 ONLY

Review the materialize action: Apply/Clear semantics, DB constraint handling, tagging and cleanup scoping, guards, and environment targeting. Sections 6-13 are reviewed separately. Judge whether Apply/Clear can strand rows, delete authentic data, or leave a show unrecoverable; whether the guard table is complete; and whether the stated concurrency posture matches the described call sequence.

## ARTIFACT

## 5. Materialize

**Where:** a card on the existing `/admin/dev` panel (`app/admin/dev/page.tsx`), already `requireDeveloper`-gated and build-gated. Controls: scenario select, target show slug, target environment, Apply, Clear.

### 5.0 Only T3 scenarios are materializable

R1 #15 found §5 and §5.1a contradicting each other. Resolved: **the selector lists T3 scenarios only.** T1 and T2 are gallery-only, because their distinguishing inputs cannot exist as database state — `bucket` predicates are functions, `degraded` is a loader fault, and `PICKER_EPOCH_RESET` is cut in derive so a materialized row would render nothing and read as a bug. A T1/T2 id submitted directly is refused (§5.3).

### 5.1 Apply

Apply makes the target show's synthetic state **equal to** the selected scenario — a replacement, not an accumulation (R1 #2, which correctly showed the previous asymmetry made sequential applies a union/first-wins/last-wins mixture):

1. Delete **every** `__devScenario`-tagged `admin_alerts` row for the show — any scenario, not only the selected one.
2. Delete every `__devScenario`-tagged `sync_holds` row for the show, same scope.
3. Insert `scenario.alerts` (skipping collisions, §5.1a) and `scenario.holds` (skipping `(domain, entity_key)` collisions, §3.0a).
4. If and only if `scenario.warnings` is present, overwrite `shows_internal.parse_warnings` (§3.4).

Apply is therefore idempotent **and** replacing: applying A then B leaves exactly B's synthetic rows.

#### 5.1a The one-unresolved-alert-per-code constraint

`admin_alerts` carries a partial unique index (`supabase/migrations/20260501001000_internal_and_admin.sql`):

```sql
create unique index admin_alerts_one_unresolved_idx
  on public.admin_alerts (coalesce(show_id::text, ''), code) where resolved_at is null;
```

At most one unresolved row per (show, code). Therefore:

1. A scenario may not carry two alert rows of the same code — rejected before any write, asserted across the whole catalog by a test (§12).
2. A code with a pre-existing **real** unresolved row is **skipped** and named in the result: `skipped: [{ code, reason: "unresolved_row_present" }]`. Apply never resolves, deletes, or overwrites an untagged row — the promise is kept by declining, not clobbering.

#### 5.1b The tag, and why it cannot hit real data

| Table          | Tag                                                                                                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin_alerts` | `context.__devScenario = "<scenario id>"`                                                                                                                                                                                  |
| `sync_holds`   | `created_by = "__devScenario:<scenario id>"` — `created_by text not null` (`supabase/migrations/20260608000000_sync_holds.sql:18`) is a real column, so no jsonb-path or unknown-key-preservation question arises (R1 #11) |

Reservation (R1 #12): `__devScenario` is a **reserved key**. A test asserts no catalog scenario's authored `context` contains it, and that no production emitter writes it (grep over `lib/` and `app/`). Deletion matches the exact shape written — `context->>'__devScenario'` equal to a known catalog id, and `created_by` matching `__devScenario:%` — never merely "the key is set", so a null, empty, non-string, or foreign value is not swept up.

### 5.2 Clear

1. Delete every tagged `admin_alerts` row for the show (any scenario).
2. Delete every tagged `sync_holds` row for the show.
3. **Local target only:** call `runManualSyncForShow(driveFileId, "manual")` (`lib/sync/runManualSyncForShow.ts:297`) to re-parse from source and regenerate authentic `parse_warnings`. **Validation target: skipped**, reported as `warnings_not_regenerated` (§5.5).

Clear reports per-step outcomes. Its destructive scope is **all synthetic rows for the show**, not only the selected scenario; the card's confirmation copy says exactly that, since the selector sits beside it (R1 #27).

### 5.3 Guards

| Condition                                                                        | Behavior                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slug empty, whitespace, or not found                                             | refuse, no writes                                                                                                                                                                                                                                                                                                                                                                                              |
| Show archived                                                                    | refuse                                                                                                                                                                                                                                                                                                                                                                                                         |
| Show archived between precheck and write                                         | the write proceeds; archival does not corrupt state, and re-checking inside a transaction is not available without a lock this design declines to take (§7.2). Stated, not defended.                                                                                                                                                                                                                           |
| Scenario id unknown, empty, or whitespace                                        | refuse                                                                                                                                                                                                                                                                                                                                                                                                         |
| Scenario id names a T1/T2 scenario                                               | refuse — not materializable (§5.0)                                                                                                                                                                                                                                                                                                                                                                             |
| Scenario carries duplicate alert codes, or duplicate hold `(domain, entity_key)` | refuse before any write, naming the duplicate                                                                                                                                                                                                                                                                                                                                                                  |
| Show already has real unresolved alerts                                          | non-colliding codes inserted; colliding codes skipped and named (§5.1a). Real rows untouched.                                                                                                                                                                                                                                                                                                                  |
| Target environment value not `local` or `validation`                             | refuse                                                                                                                                                                                                                                                                                                                                                                                                         |
| Validation selected without confirmation, or confirmation field repeated         | refuse                                                                                                                                                                                                                                                                                                                                                                                                         |
| Validation triple incomplete, or its project ref ≠ `VALIDATION_PROJECT_REF`      | refuse (§5.5)                                                                                                                                                                                                                                                                                                                                                                                                  |
| Apply of a scenario with no alerts, no holds, and no `warnings`                  | refuse — nothing to materialize                                                                                                                                                                                                                                                                                                                                                                                |
| Partial failure mid-Apply                                                        | the completed writes stand; the result names which steps committed and the overall outcome is `partial` (§7.1). The next Apply or Clear fully repairs alerts and holds, since both are tag-scoped. **Warnings are not tag-scoped**, so an interrupted Apply that already overwrote them is repaired only by a successful local Clear — stated plainly rather than claimed safe (R1 #14).                       |
| Zero tagged rows at Clear                                                        | succeed, report "nothing to clear", still run step 3 on local                                                                                                                                                                                                                                                                                                                                                  |
| Re-sync unreachable                                                              | `warnings_not_regenerated`; deletions still committed. Escape hatch is a reseed.                                                                                                                                                                                                                                                                                                                               |
| Two Applies race                                                                 | the delete/insert sequence is not atomic, so a concurrent pair can leave a mixture, and the unique index can fail one insert outright rather than "last writer wins" (R1 #13 — the previous revision's race claim was wrong). Not defended against: this is a single-operator dev instrument. The card disables its submit while a request is in flight, which removes double-submit, the only realistic case. |

### 5.4 Why `parse_warnings` is overwritten rather than backed up

A backup needs durable storage — a new column or table, i.e. a migration plus the `validation-schema-parity` checklist. Re-sync already regenerates the column authentically. The cost is the unreachable-Drive and validation edges above, accepted explicitly.

### 5.5 Environment targeting

Default **local**. Validation requires an explicit confirmation **and** a complete `VALIDATION_SUPABASE_URL` + `VALIDATION_SUPABASE_SECRET_KEY` + `VALIDATION_SUPABASE_PROJECT_REF` triple, resolved exclusively from that triple with no fallback to ambient `SUPABASE_URL` / `SUPABASE_SECRET_KEY` — the observe CLI's guardrail shape.

**Production cannot be reached** (R1 #4 — build-artifact absence is not a database-target guarantee, which was the previous revision's error). The concrete gate: the resolved project ref must equal `VALIDATION_PROJECT_REF` (`lib/admin/validationDeployment.ts:1` — `"vzakgrxqwcalbmagufjh"`). Any other ref, including a syntactically valid one, is refused. This is an equality check against a known constant, not a shape check.

**The re-sync is a direct function call, not an HTTP request.** `POST /api/admin/sync/[slug]` is a thin wrapper: it authenticates, resolves the slug to a `drive_file_id`, and calls `runManualSyncForShow(resolved.driveFileId, "manual", ...)` (`app/api/admin/sync/[slug]/route.ts:94`). Clear calls that same function directly. A server action fetching its own route would need an absolute origin and forwarded session cookies — the auth-and-cookie-propagation design R1 #5 correctly flagged as unspecified — and all of it is avoidable, since the callable unit is already exported.

This preserves §7.2: `runManualSyncForShow` acquires the per-show advisory lock itself, and its `_unlocked` variant asserts the lock is held (`lib/sync/runManualSyncForShow.ts:286`), so the holder remains exactly one layer deep and a nested acquisition would fail loudly rather than deadlock.

**Clear still does not re-sync on validation** (R1 #5). The reason is no longer the HTTP boundary but the pipeline's inputs: `runManualSyncForShow` reads Drive through ambient credentials and writes through the ambient client, so pointing it at a validation database would mean threading an environment through the whole sync pipeline. Validation Clear performs steps 1–2 and reports `warnings_not_regenerated`. Regenerating validation warnings is the validation cron's job or a reseed.
