# Spec confirmation R5a - MATERIALIZE (section 5)

## Your role: REVIEWER ONLY

Do not fix issues, do not propose patches, do not imply changes you will make. Surface findings only. Do NOT run shell commands or tools; the artifact is inlined. Do NOT invoke any nested review.

## Context

A DEV-ONLY instrument in a Next.js 16 + Supabase admin app: it renders every alert/warning state of an admin "show modal" without waiting for live data to raise the row. One catalog, two consumers - a build-gated gallery route (renders states, no DB) and a "materialize" dev-panel card (writes tagged rows into a local or validation Supabase so the real modal shows the state for real).

Scenario rows are authored in the DB's own column names. Alerts carry { code, context, raised_at, occurrence_count } plus a gallery-only declared identity. Holds carry sync_holds columns. Warnings are tri-state: absent = do not touch the column, [] = deliberately write zero, non-empty = write it.

## THIS IS THE SECOND CONFIRMATION ROUND

Four prior rounds ran. Every P0 and P1 was repaired. The prior round's findings were narrow and precision-level, not mechanism-level.

Settled - verify internal consistency, do NOT re-argue direction:

- Materialize accepts T3 only; T1/T2 are gallery-only.
- Apply replaces alerts and holds (tag-scoped) except collision skips, which leave the AUTHENTIC row; warnings are declared-only and do not reconcile across scenarios.
- Warnings are never written on validation (no cleanup path exists there).
- Environments gate on the URL the client actually uses: local must be loopback; validation must satisfy projectRefFromUrl(url) === VALIDATION_PROJECT_REF, with the separate env var demoted to a cross-check.
- Clear is scenario-independent and never blocked by an Apply-only guard.
- Tag predicates are presence-shaped, catalog-independent, and the sync_holds LIKE pattern escapes its underscores.
- Authentic-row immunity is convention plus a source check, explicitly NOT proven; the environment gate is load-bearing.
- Invariant 5 has a ratified, scope-enumerated dev-instrument exception.
- The artifact-level build check is a manual close-out step; the CI-enforced half is a FILES-membership meta-test.

## Binding project invariants (abbreviated)

- Inv 2: per-show advisory lock held at EXACTLY ONE layer.
- Inv 9: every Supabase call destructures { data, error }; infra faults surface as typed discriminable results; every new call site is registered in a structural meta-test OR carries an inline `// not-subject-to-meta: <reason>`.
- Inv 10: every mutating server action needs a registry row plus executable success-branch behavioral proof; emits post-commit, outside any lock.
- Every prop/input needs stated behavior for null, empty, zero, malformed.

## What I need from you

Confirm the repairs hold and are internally consistent, and catch anything the repairs themselves introduced. This document is close to done; if the section is sound, say so and APPROVE. Do NOT manufacture findings to appear thorough, and do not restate settled decisions as findings.

## Output format

Per finding: `SEVERITY (P0/P1/P2/P3) - <claim> - <section> - <why it fails, concretely>`.

End with a final line exactly: `VERDICT: APPROVE` or `VERDICT: NEEDS-ATTENTION` or `VERDICT: BLOCKING`

## ARTIFACT - section 5

## 5. Materialize

**Where:** a card on the existing `/admin/dev` panel (`app/admin/dev/page.tsx`), already `requireDeveloper`-gated and build-gated. Controls: scenario select, target show slug, target environment, Apply, Clear.

### 5.0 Only T3 scenarios are materializable

R1 #15 found §5 and §5.1a contradicting each other. Resolved: **the selector lists T3 scenarios only.** T1 and T2 are gallery-only, because their distinguishing inputs cannot exist as database state — `bucket` predicates are functions, `degraded` is a loader fault, and `PICKER_EPOCH_RESET` is cut in derive so a materialized row would render nothing and read as a bug. A T1/T2 id submitted directly is refused (§5.3).

### 5.1 Apply

Apply makes the target show's synthetic state **equal to** the selected scenario — a replacement, not an accumulation (R1 #2, which correctly showed the previous asymmetry made sequential applies a union/first-wins/last-wins mixture):

1. Delete **every** `__devScenario`-tagged `admin_alerts` row for the show — any scenario, not only the selected one.
2. Delete every `__devScenario`-tagged `sync_holds` row for the show, same scope.
3. Insert `scenario.alerts` (skipping collisions, §5.1a) and `scenario.holds` (skipping `(domain, entity_key)` collisions, §3.0a).
4. If and only if `scenario.warnings` is present **and the target is local**, overwrite `shows_internal.parse_warnings` (§3.4). **On validation, warnings are never written**, and Apply reports `warnings_skipped_validation`.

   The asymmetry is deliberate (R3b): `parse_warnings` is untagged, and validation Clear does not regenerate (§5.5), so a validation warning write would have **no cleanup path at all** and would accumulate permanently. Refusing the write is the only way to keep Clear's guarantee honest on validation. Alerts and holds are unaffected — they are tag-scoped and fully cleanable in both environments.

**Scope of the replacement guarantee** (R3a: the unqualified claim was false when `warnings` is omitted):

- **Alerts and holds — replacing, up to collisions.** They are tag-scoped, so steps 1 and 2 remove every synthetic row regardless of which scenario wrote it. Applying A then B leaves B's alerts and holds **except** any that were skipped for colliding with an authentic row (§5.1a, §3.0a). A skipped code or `(domain, entity_key)` leaves the **authentic** row in place, whose context and other columns may differ from B's authored row. So the guarantee is "no residue from A, plus B minus its skips" — not literally "exactly B" (R4a). The skips are named in the result, so the difference is always visible rather than silent.
- **Warnings — declared-only, NOT reconciling.** `parse_warnings` is an untagged jsonb column (§3.4), so Apply cannot tell a synthetic warning from an authentic one and does not try. If B omits `warnings`, **A's warnings remain**. This is stated rather than silently true.

Operator remedy, and the reason this is acceptable: run Clear (local) before applying a scenario that does not declare warnings. The card's copy says so at the point of use. A scenario that _does_ declare `warnings` overwrites unconditionally, so the mixed state only arises on the declared→omitted transition.

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

Deletion uses the **presence** predicate on both tables, not a current-catalog-id match (R3a: matching only ids still in the catalog stranded rows written by a since-renamed or since-deleted scenario, and the two tables used inconsistent predicates — alerts narrow, holds a `LIKE` prefix):

| Table          | Delete predicate                                                                       |
| -------------- | -------------------------------------------------------------------------------------- |
| `admin_alerts` | `context ? '__devScenario'` — the jsonb key exists, whatever its value                 |
| `sync_holds`   | `created_by LIKE '\_\_devScenario:%' ESCAPE '\'` — **the underscores must be escaped** |

Both are presence-shaped and neither depends on the catalog's current contents, so a renamed or removed scenario cannot strand rows.

**The escape is load-bearing, not cosmetic** (R4a P1). In SQL `LIKE`, `_` is a single-character wildcard, so the unescaped `'__devScenario:%'` also matches `xxdevScenario:anything` — meaning both Apply and Clear could delete **authentic** hold rows whose `created_by` merely happened to fit that shape. The pattern must escape both underscores so they are literal. §12 carries a regression test asserting a row with `created_by = 'xxdevScenario:real'` survives both verbs; without it this defect is invisible in every test that only uses correctly-tagged fixtures.

**Reservation, and its honest limit** (R3a): `__devScenario` is a reserved key. A test asserts no catalog scenario's authored `context` contains it, and that the **only** source emitter is the materialize action itself — walking `lib/` and `app/` with `app/admin/dev/actions.ts` as the single declared exception. (R4a: stated without that exception, the assertion would reject the very code that must write the tag, or silently enforce something weaker than the prose claimed.) That check cannot cover database-side writers, other source trees, rows already stored before this feature existed, or a value propagated at runtime into a context this instrument never authored. **The immunity of authentic rows is therefore enforced by convention plus a source-level check, not proven.** Accepted because the blast radius is bounded to a developer instrument that (a) cannot target production at all (§5.5), and (b) writes only on a loopback or validation database. A production-reachable version of this feature would need a provably-reserved column instead, and that is why §5.5's gate is the load-bearing control rather than this one.

### 5.2 Clear

1. Delete every tagged `admin_alerts` row for the show (any scenario).
2. Delete every tagged `sync_holds` row for the show.
3. **Local target only:** call `runManualSyncForShow(driveFileId, "manual")` (`lib/sync/runManualSyncForShow.ts:297`) to re-parse from source and regenerate authentic `parse_warnings`. **Validation target: skipped**, reported as `warnings_regeneration_skipped` — a policy outcome, distinct from the `warnings_regeneration_failed` infra fault a local re-sync can return (§5.3).

Clear reports per-step outcomes. Its destructive scope is **all synthetic rows for the show**, not only the selected scenario; the card's confirmation copy says exactly that, since the selector sits beside it (R1 #27).

### 5.3 Guards

**Cleanup is never blocked.** Every guard below is marked Apply-only or both. Clear carries the minimum set that can refuse it, because a guard that prevents cleanup can strand synthetic state permanently (R3a: the previous revision applied one shared table to both verbs, so a show materialized and then archived could never be cleaned).

Clear is scenario-independent (§5.2 deletes every tagged row), so **no scenario-related guard applies to it**: an unknown, malformed, T1/T2, or since-deleted scenario id does not prevent a Clear. Clear needs only a resolvable show and a permitted environment.

#### Input normalization, applied before any guard

Form values arrive as `string | string[] | undefined`. Normalization is uniform: `undefined` and the empty array are absent; an array takes its first element; every value is trimmed. A value that is absent, empty after trim, or non-string where a string is required is a refusal, never a silent default. This covers the null, non-string, repeated, and zero-valued forms uniformly rather than enumerating them per field (R3a).

| Condition                                                                                                                                              | Applies to     | Behavior                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slug absent, empty after trim, or unresolvable                                                                                                         | both           | refuse, no writes                                                                                                                                                                                                                                                                             |
| Show archived                                                                                                                                          | **Apply only** | refuse. Clear proceeds on archived shows — cleanup must always be available                                                                                                                                                                                                                   |
| Show archived between precheck and write                                                                                                               | Apply          | the write stands. Archival does not corrupt synthetic state, and Clear remains available afterward because it does not check archival                                                                                                                                                         |
| Scenario id absent, empty, unknown, or naming a T1/T2 scenario                                                                                         | **Apply only** | refuse (§5.0)                                                                                                                                                                                                                                                                                 |
| Scenario carries duplicate alert codes or duplicate hold `(domain, entity_key)`                                                                        | Apply          | refuse before any write, naming the duplicate (§3.6 rejects this at catalog level; this is the runtime backstop)                                                                                                                                                                              |
| Scenario has no alerts and no holds, and either declares no `warnings` **or** the target is validation (where warnings are never written, §5.1 step 4) | Apply          | refuse — nothing would be materialized. The guard is **environment-aware** (R4a): a warnings-only scenario is materializable on local but is a no-op on validation, and without this it would pass, delete prior tagged state, write nothing, and report only a skipped warning               |
| Show already has real unresolved alerts                                                                                                                | Apply          | non-colliding codes inserted; colliding codes skipped and named (§5.1a). Real rows untouched                                                                                                                                                                                                  |
| Target environment absent or not `local` \| `validation`                                                                                               | both           | refuse                                                                                                                                                                                                                                                                                        |
| `local` selected but the client URL host is not loopback                                                                                               | both           | refuse (§5.5)                                                                                                                                                                                                                                                                                 |
| `validation` selected without confirmation, or the confirmation value is empty, false, or not the expected token                                       | both           | refuse                                                                                                                                                                                                                                                                                        |
| Validation triple incomplete, its URL's derived ref ≠ `VALIDATION_PROJECT_REF`, or `VALIDATION_SUPABASE_PROJECT_REF` disagrees with the derived ref    | both           | refuse (§5.5)                                                                                                                                                                                                                                                                                 |
| Validation URL syntactically complete but unparseable by `projectRefFromUrl`                                                                           | both           | refuse — a null derived ref never equals the constant, so this falls out of the §5.5 rule rather than needing its own branch                                                                                                                                                                  |
| Validation secret present but rejected by the server                                                                                                   | both           | `{ kind: "infra_error" }`, not a refusal — the distinction matters at the Supabase boundary (invariant 9)                                                                                                                                                                                     |
| Partial failure mid-Apply                                                                                                                              | Apply          | completed writes stand; the result names which steps committed and the outcome is `partial` (§7.1). The next Apply or Clear fully repairs alerts and holds. **Warnings are not tag-scoped**, so an interrupted Apply that already overwrote them is repaired only by a successful local Clear |
| Zero tagged rows at Clear                                                                                                                              | Clear          | succeed, report "nothing to clear", still attempt step 3 on local                                                                                                                                                                                                                             |
| Local re-sync unreachable                                                                                                                              | Clear          | `warnings_regeneration_failed` — an infra fault (§5.2)                                                                                                                                                                                                                                        |
| Validation target                                                                                                                                      | Clear          | `warnings_regeneration_skipped` — a policy decision, deliberately a **different** outcome from the fault above (R3a: conflating an intentional skip with an infrastructure failure destroys the discriminable-fault semantics invariant 9 requires)                                           |

#### Concurrency

The single-operator posture is stated, not defended, and the enumeration is now complete for the executable pairs (R3a — the previous revision described only Apply-vs-Apply):

| Pair                         | Outcome                                                                                                                                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apply vs Apply               | delete/insert is not atomic; a concurrent pair can interleave, and the partial unique index can fail one insert outright rather than "last writer wins"                                                                                                         |
| Apply vs Clear               | Clear's deletes can land before Apply's inserts, leaving tagged rows after Clear reported success. A second Clear resolves it                                                                                                                                   |
| Clear vs Clear               | benign; both issue the same presence-scoped deletes and the second finds nothing. The re-sync step is idempotent                                                                                                                                                |
| Apply vs cron or manual sync | **local only**: both write `parse_warnings` and either may win. **On validation this pair cannot occur** — Apply never writes warnings there (§5.1 step 4), so only the cron writes the column                                                                  |
| Clear vs cron or manual sync | **local**: benign, both converge on authentic warnings. **Validation**: Clear does not touch or regenerate warnings at all, so there is no interaction — the cron is the only writer, which is why validation warning state is the cron's responsibility (§5.5) |

The card disables its submit while a request is in flight, which removes double-submit only. It does **not** serialize separate tabs, two operators, a direct server-action invocation, or background sync, and is not claimed to.

### 5.4 Why `parse_warnings` is overwritten rather than backed up

A backup needs durable storage — a new column or table, i.e. a migration plus the `validation-schema-parity` checklist. Re-sync already regenerates the column authentically. The cost is the unreachable-Drive and validation edges above, accepted explicitly.

### 5.5 Environment targeting

**Both branches are gated on the URL the client will actually use** (R3a P0: the previous revision gated `local` on nothing at all, and gated `validation` on a _separate_ `VALIDATION_SUPABASE_PROJECT_REF` string — so a production URL and production secret paired with the expected ref value passed the gate).

The rule, mirroring `destructiveResetAllowed`'s documented precedent that the guard must read the same variable the client reads (`lib/admin/validationDeployment.ts:19-26`):

| Target       | Gate — evaluated on the exact URL passed to the client                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local`      | the URL's host must be loopback (`127.0.0.1`, `localhost`, or `[::1]`). Any other host, including a `*.supabase.co` host, is **refused**. "Local" is verified, never assumed from the absence of a selection.                                                                                                                                                                                                                                                                 |
| `validation` | `projectRefFromUrl(VALIDATION_SUPABASE_URL) === VALIDATION_PROJECT_REF` (`lib/admin/validationDeployment.ts:7`, against the constant at `lib/admin/validationDeployment.ts:1`). The ref is **derived from the URL**, never read from `VALIDATION_SUPABASE_PROJECT_REF`. That variable must still be present and must _agree_ with the derived value — a disagreement is a refusal, since it signals a misconfigured environment — but it is a cross-check, not the authority. |

`projectRefFromUrl` uses a strict host-boundary regex (`lib/admin/validationDeployment.ts:5`) that rejects branch-preview hosts, suffixed hosts, and trailing garbage, so a lookalike host cannot satisfy it.

Validation additionally requires an explicit confirmation and a complete `VALIDATION_SUPABASE_URL` + `VALIDATION_SUPABASE_SECRET_KEY` + `VALIDATION_SUPABASE_PROJECT_REF` triple, resolved exclusively from that triple with no fallback to ambient `SUPABASE_URL` / `SUPABASE_SECRET_KEY`.

**Production is therefore unreachable by construction:** there is no code path that hands the action a client whose URL is neither loopback nor the validation ref.

**The re-sync is a direct function call, not an HTTP request.** `POST /api/admin/sync/[slug]` is a thin wrapper: it authenticates, resolves the slug to a `drive_file_id`, and calls `runManualSyncForShow(resolved.driveFileId, "manual", ...)` (`app/api/admin/sync/[slug]/route.ts:94`). Clear calls that same function directly. A server action fetching its own route would need an absolute origin and forwarded session cookies — the auth-and-cookie-propagation design R1 #5 correctly flagged as unspecified — and all of it is avoidable, since the callable unit is already exported.

This preserves §7.2: `runManualSyncForShow` acquires the per-show advisory lock itself, and its `_unlocked` variant asserts the lock is held (`lib/sync/runManualSyncForShow.ts:286`), so the holder remains exactly one layer deep and a nested acquisition would fail loudly rather than deadlock.

**Clear still does not re-sync on validation** (R1 #5). The reason is no longer the HTTP boundary but the pipeline's inputs: `runManualSyncForShow` reads Drive through ambient credentials and writes through the ambient client, so pointing it at a validation database would mean threading an environment through the whole sync pipeline. Validation Clear performs steps 1–2 and reports `warnings_regeneration_skipped`. Regenerating validation warnings is the validation cron's job or a reseed.
