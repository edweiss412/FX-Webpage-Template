# Adversarial spec review R2b - MATERIALIZE + INVARIANTS + TESTS (sections 5-13)

## Your role: REVIEWER ONLY

Do not fix issues, do not propose patches, do not imply changes you will make. Surface findings only. Do NOT run shell commands or tools; the artifact is inlined. Do NOT invoke any nested review.

## Posture

Fresh eyes on a spec for a DEV-ONLY instrument in a Next.js 16 + Supabase admin app. It renders every alert/warning state of an admin "show modal" without waiting for live data to raise the row. Two consumers of one catalog: a build-gated gallery route (renders states, no DB) and a "materialize" dev-panel card (writes tagged rows to a local or validation Supabase so the real modal shows the state for real).

Round 1 already ran and returned 29 findings; all P0/P1 were repaired. This is round 2 on the revision.

## Binding project invariants (abbreviated)

- Inv 2: mutations of shows/crew_members/crew_member_auth/pending_syncs/pending_ingestions run inside a per-show advisory lock held at EXACTLY ONE layer.
- Inv 5: no raw error codes in user-visible UI; copy resolves via lib/messages/lookup.ts. (The spec ratifies a scoped dev-instrument exception in 1.1 - verify the scope is coherent, do not re-argue that it exists.)
- Inv 9: every Supabase call destructures { data, error }; infra faults surface as typed discriminable results.
- Inv 10: every mutating server action needs an AUDITABLE_MUTATIONS registry row plus executable success-branch behavioral proof; emits post-commit, outside any lock.
- Dev routes under app/admin/dev/ are gated BUILD-TIME by a script that renames registered files aside before `next build`.
- Tailwind v4 here does NOT default .flex to align-items:stretch; fixed-dimension parents with flex/grid children need explicit dimensional invariants verified in a real browser.
- Every prop/input needs stated behavior for null, empty, zero, malformed.

## Output format

Per finding: `SEVERITY (P0/P1/P2/P3) - <claim> - <section> - <why it fails, concretely>`.
Enumerate ALL instances of each defect class you identify in THIS round; dripping one instance per round is a review defect.

End with a final line exactly: `VERDICT: APPROVE` or `VERDICT: NEEDS-ATTENTION` or `VERDICT: BLOCKING`

## SCOPE OF THIS REVIEW

You are reviewing sections 5 through 13 ONLY: the materialize action (Apply/Clear semantics, DB constraint handling, tagging, guards, environment targeting), the build-time gate proof, invariant compliance, dimensional/transition inventories, and the test plan. Sections 1-4 are reviewed separately; sections 1.1 (resolved scope) and 2 (canonical numbers) and 3.0/3.4 (row shapes and the warnings tri-state) are included below as context you need.

## CONTEXT: sections 1.1, 2, 3.0, 3.4

## 1.1 Resolved scope — do not relitigate

Decided during brainstorming, or ratified in R1 triage. Cite the ratification before re-opening.

| Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Ratification              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Gallery renders **T1 + T2 only**; T3 composites are materialize-only. Mounting the whole surface against a synthetic snapshot fixture was considered and rejected as a drift liability.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | §4.3, §5.0                |
| **No CI gate.** No screenshot byte-comparison, no catalog-completeness meta-test. Totality on the alert axis is achieved structurally instead (§3.1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | §3.1, §12                 |
| **No migration.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | §5.4                      |
| **No new advisory-lock holder.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | §7.2                      |
| Gallery server actions are inert by design (synthetic ids).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | §4.4                      |
| The gallery route is dev-only and absent from the production artifact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | §6                        |
| **Invariant 5 carries a scoped exception for this instrument, ratified here.** The gallery and the materialize card display raw `code` strings, scenario ids, and result codes. Invariant 5 protects _operators_ from raw codes in the product UI; these two surfaces are developer instruments behind `requireDeveloper`, renamed out of the production artifact at build time (§6), whose entire subject matter **is** the code catalog. A gallery that hid codes could not perform its function. Scope of the exception is exactly: the routing readout (§4.1), scenario ids, the `PICKER_EPOCH_RESET` non-render row, the unknown-scenario id list, the materialize selector, and the §5.3 result codes. Everywhere else — including all rendered card copy — codes resolve through `lib/messages/lookup.ts` as normal. (Codex R1 #1: correct that R1 asserted an exception §1.1 had not ratified. Ratified now rather than argued.) | this row                  |
| **Validation targeting stays**, but Clear on validation does **not** re-sync (§5.5). The user chose local + validation; R1 #5 showed the re-sync step cannot be made env-correct cheaply, so that one step is dropped on validation rather than the whole capability.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | §5.5                      |
| `attention-gallery-full.png` (an earlier ad-hoc screenshot at the repo root) is discarded, not folded in.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | user decision, 2026-07-20 |

## 2. Canonical numbers

Every count in this document resolves here. Later sections reference this table; they do not restate values.

| Name                 | Value | Source (verified 2026-07-20)                                                                                      |
| -------------------- | ----- | ----------------------------------------------------------------------------------------------------------------- |
| `N_ALERT_CODES`      | 45    | `lib/admin/attentionItems.ts:95-143` — `ATTENTION_ROUTES` entries                                                 |
| `N_ALERT_RENDERABLE` | 44    | `N_ALERT_CODES` minus `PICKER_EPOCH_RESET`, cut in `deriveAttentionItems` (`lib/admin/attentionItems.ts:315-317`) |
| `N_ROUTES_OVERVIEW`  | 34    | `ATTENTION_ROUTES` `sectionId: "overview"`                                                                        |
| `N_ROUTES_CREW`      | 3     | `ATTENTION_ROUTES` `sectionId: "crew"`                                                                            |
| `N_ROUTES_EVENT`     | 3     | `ATTENTION_ROUTES` `sectionId: "event"` (all anchored `opening_reel`)                                             |
| `N_ROUTES_ROOMS`     | 3     | `ATTENTION_ROUTES` `sectionId: "rooms"` (all anchored `diagrams`)                                                 |
| `N_ROUTES_WARNINGS`  | 2     | `ATTENTION_ROUTES` `sectionId: "warnings"`                                                                        |
| `N_ANCHORED`         | 6     | `N_ROUTES_EVENT` + `N_ROUTES_ROOMS`                                                                               |
| `N_WARN_ENUM`        | 39    | `lib/messages/__generated__/internal-code-enums.ts` entries with `source: "parse_warnings.code"`                  |
| `N_WARN_GAP`         | 4     | §3.2 — parse-warning codes the generator's scan heuristic misses                                                  |
| `N_WARN_CODES`       | 43    | `N_WARN_ENUM` + `N_WARN_GAP`                                                                                      |
| `MENU_CAP`           | 12    | §4.2 — item count for the "many" scenario                                                                         |

`N_ROUTES_OVERVIEW + N_ROUTES_CREW + N_ROUTES_EVENT + N_ROUTES_ROOMS + N_ROUTES_WARNINGS = N_ALERT_CODES` (34+3+3+3+2 = 45).

Cross-check: `ADMIN_ALERTS_CODES` (`tests/messages/adminAlertsRegistry.ts:9`) also has 45 entries and is pinned set-equal to `ATTENTION_ROUTES` by `tests/admin/_metaAttentionRoutes.test.ts`.

## 3. Catalog

**Module (new file):** `lib/dev/attentionScenarios.ts (new)`

A scenario declares **storable inputs** — shapes that exist in the database — never pre-built `AttentionItem`s and never derived read-model shapes (§3.3).

```ts
export type AttentionScenario = {
  id: string; // ^[a-z0-9][a-z0-9-]{2,47}$ - DOM anchor and DB tag
  tier: 1 | 2 | 3;
  label: string; // non-empty
  alerts: ScenarioAlertRow[];
  holds: ScenarioHoldRow[];
  warnings?: ParseWarning[]; // TRI-STATE, see 3.4
  bucket?: Partial<BucketOpts>; // T2 only
  degraded?: boolean; // T2 only
};
```

### 3.0 Alert and hold row shapes

The catalog is authored in the DB's own column names, so the mapping to an insert is identity plus three injected fields. This removes the camel/snake conversion boundary R1 #8 found undefined.

```ts
export type ScenarioAlertRow = {
  code: string;
  context: Record<string, unknown>; // NOT NULL in DDL - {} never null
  raised_at: string; // ISO 8601
  occurrence_count: number; // integer >= 1
  galleryIdentity?: AlertIdentity | null; // GALLERY-ONLY, never inserted (3.3)
};

export type ScenarioHoldRow = {
  drive_file_id: string;
  domain: "crew_email" | "crew_identity";
  entity_key: string;
  held_value: Record<string, unknown>; // NOT NULL
  proposed_value: Disposition; // NOT NULL for mi11_pending
  base_modified_time: string; // NOT NULL for mi11_pending
  kind: "mi11_pending"; // see 3.0a
  reservation_collisions?: Array<{ name: string; email: string | null }>;
};
```

**Injected at materialize time, never authored:** `id` (DB default `gen_random_uuid()`), `show_id` (the target show), the `__devScenario` tag (§5.1b). **`id` is likewise injected in the gallery** — a deterministic synthetic `gallery:<scenario id>:<index>` — which is what §4.4's "synthetic ids" refers to. (R1 #8.)

#### 3.0a Every scenario hold must satisfy the `sync_holds` CHECK constraints

`supabase/migrations/20260608000000_sync_holds.sql:29-37` constrains `mi11_pending` rows: `proposed_value` NOT NULL, `base_modified_time` NOT NULL, and `proposed_value->>'disposition' in ('email_change','rename','removal')`. `domain` is constrained to `crew_email | crew_identity` (line 21-23).

`kind` is fixed to `"mi11_pending"` in the type because it is the only kind that becomes an attention item: `toHoldItem` (`lib/admin/attentionItems.ts:284-286`) returns null unless `status === "pending"` and `action === "approve_reject"`, which only an open `mi11_pending` hold produces. An `undo_override` row is expressible in the DB but is dead weight here, so the type forbids it.

**`unique (show_id, domain, entity_key)`** (line 39-41) is the hold analogue of the alert unique index. It is handled identically to §5.1a: a scenario may not carry two holds sharing `(domain, entity_key)`, and a collision with a pre-existing real hold causes a skip-and-report, never an overwrite. (R1 #11 correctly noted this constraint analysis was missing.)

Both are behavior-preserving extractions on production read paths (see §13 — this design **does** touch production code, contrary to the previous revision's claim).

**The one inherent divergence:** identity _resolution_ needs real crew rows, which synthetic alerts lack. The gallery takes a declared `galleryIdentity` where materialize resolves the real thing. Stated, not hidden: the routing readout labels it `identity: declared (gallery)`.

### 3.4 `warnings` is tri-state

R1 #3: a required `warnings: []` on an alert-only scenario silently erased authentic warnings, because §5.1 overwrote the column unconditionally. The field is now optional and carries three distinct meanings:

| Value                | Gallery                          | Materialize                                                                |
| -------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| `undefined` (absent) | renders no warning cards         | **does not touch** `shows_internal.parse_warnings`                         |
| `[]`                 | renders the empty-warnings state | overwrites the column with `[]` — deliberate "this show has zero warnings" |
| non-empty            | renders the cards                | overwrites the column with the array                                       |

Every T1 alert scenario and every alert-only or hold-only T3 composite omits the field. Only a scenario that deliberately controls warnings sets it.

## ARTIFACT UNDER REVIEW (sections 5-13)

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
3. **Local target only:** trigger the re-sync (§5.5) to regenerate authentic `parse_warnings`. **Validation target: skipped**, reported as `warnings_not_regenerated`.

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

**Clear does not re-sync on validation** (R1 #5). The re-sync is `POST /api/admin/sync/[slug]`, an application route bound to the ambient database and the caller's session; it has no target-environment parameter, and giving it one would mean a cross-environment HTTP call with its own auth and cookie-propagation design. Rather than build that, validation Clear performs steps 1–2 and reports `warnings_not_regenerated`. Regenerating validation warnings is the validation cron's job or a reseed.

## 6. Build-vs-runtime gate

Build-time, not runtime. `scripts/with-admin-dev-flag.mjs` renames the files in its `FILES` array (`scripts/with-admin-dev-flag.mjs:43-55`) to `.disabled-by-build-gate` before `next build` whenever `ADMIN_DEV_PANEL_ENABLED` is not the literal `"true"`, so the artifact does not contain the route. `requireDeveloper()` remains runtime defense in depth.

**Added to `FILES`:** `app/admin/dev/attention-gallery/page.tsx (new)`. The materialize card lives inside the already-registered `app/admin/dev/page.tsx` and `actions.ts`.

**Gate proof at both flag states** (R1 #20 — the previous revision proved only the unset state, and "no reference" was ambiguous):

| Flag     | Assertion                                                                     | Meaning of the claim                                                                                                                     |
| -------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| unset    | the built route manifest contains no entry for `/admin/dev/attention-gallery` | **route-manifest absence**, the load-bearing claim — a source-text grep is weaker and a 404 probe tests routing rather than the artifact |
| `"true"` | the manifest **does** contain it                                              | proves the gate is a gate and not a permanent deletion                                                                                   |

Plus the existing `FILES`-membership assertion in `tests/admin/withAdminDevFlagDevPanelPresent.test.ts`.

## 7. Invariant compliance

### 7.1 Invariant 10 — mutation surface observability

Four exported mutation surfaces, each needing executable success-branch proof (R1 #7 — the previous revision registered four but promised proof for two):

| Surface                            | Code                   | Proof                                                                                                                                                           |
| ---------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applyAttentionScenario`           | `DEV_SCENARIO_APPLIED` | registry row + behavioral proof                                                                                                                                 |
| `clearAttentionScenario`           | `DEV_SCENARIO_CLEARED` | registry row + behavioral proof                                                                                                                                 |
| `applyAttentionScenarioFormAction` | `DEV_SCENARIO_APPLIED` | registry row + behavioral proof (transitive, driving the wrapper — the `parseAndStageFormAction` pattern at `tests/log/adminOutcomeBehavior.test.ts:1157-1171`) |
| `clearAttentionScenarioFormAction` | `DEV_SCENARIO_CLEARED` | registry row + behavioral proof, same pattern                                                                                                                   |

No wrapper exemptions are claimed.

**Partial-success emission** (R1 #7): Apply has no transaction, so "post-commit" needs defining. The emitted `result` is `applied` when every intended write succeeded, `partial` when at least one succeeded and at least one failed, and **nothing is emitted** when the first write failed and no state changed. The emit carries the per-step counts, so a `partial` is diagnosable from telemetry alone. It fires after the last write attempt, outside any lock.

**These codes do not take the §12.4 lockstep.** `logAdminOutcome`'s `code` is a free SHOUTY_SNAKE_CASE string (`lib/log/logAdminOutcome.ts:9`), not a `MessageCode`. `DEV_PARSE_STAGED` and `DEV_SCHEMA_RESET` appear only in `app/admin/dev/actions.ts` and the two test registries — no master-spec §12.4 row, no `lib/messages/catalog.ts` entry. Adding one would put a non-message code in the message catalog and risk `x1-catalog-parity` rather than satisfy it.

### 7.2 Invariant 2 — advisory locks

Materialize writes `admin_alerts`, `sync_holds`, and `shows_internal.parse_warnings`. None is in the guarded set (`shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, `pending_ingestions`). The local Clear's re-sync acquires the per-show lock **inside existing code** behind `POST /api/admin/sync/[slug]`. **No new holder at any layer.**

### 7.3 Invariant 5

Scoped exception ratified in §1.1, enumerated there. All rendered card copy still resolves through the catalog. The materialize card's own outcomes are `lib/messages/lookup.ts`-resolved for operator-facing text; the raw result codes of §5.3 appear only in the developer readout.

### 7.4 Invariant 8 — UI quality gate

Gallery route, `ScenarioBlock`, and the dev-panel card are UI. `/impeccable critique` and `/impeccable audit` both run before close-out; P0/P1 fixed or deferred via `DEFERRED.md`.

### 7.5 Invariant 9 — Supabase call boundary

Every materialize call destructures `{ data, error }`, distinguishes returned from thrown errors, and returns a typed discriminated result:

```ts
type MaterializeResult =
  | {
      kind: "ok";
      alerts: number;
      holds: number;
      warnings: "written" | "untouched";
      skipped: Skip[];
    }
  | { kind: "partial"; committed: StepCounts; failedStep: Step; message: string }
  | { kind: "refused"; reason: RefusalCode }
  | { kind: "infra_error"; message: string };
```

**Registry treatment is decided here, not left to the implementer** (R1 #19): these call sites get rows in the invariant-9 registry meta-test, not inline exemptions — they are ordinary service-role table calls with no exempting property. §12 names the registry being extended.

## 8. Dimensional invariants

`w` sets `max-width` (§4.5), which constrains width only and imposes no parent→child height relationship, so the mandatory fixed-dimension analysis does not apply to the wrapper.

One real-browser assertion **is** required, for a claim §4.2 makes rather than a stretch invariant: that a `MENU_CAP`-item menu actually crosses its scroll threshold, and that simultaneously-open menus stack without overlapping (R1 #6, #28). The plan carries a Playwright task reading `getBoundingClientRect()` on adjacent open menus at the narrowest and widest `w`, asserting no intersection.

## 9. Transition inventory

The gallery adds no animated component; transitions inside `AttentionMenu`, `AttentionBanner`, and `CompactAlertCard` are pre-existing and covered (`tests/components/admin/compactAlertCompoundTransitions.test.tsx`, `transitionAudit.test.tsx`). The gallery's own filter changes are server navigations — instant, no animation.

The **materialize card** has a state model of its own, omitted from the previous revision (R1 #22):

| From                    | To                                                    | Treatment                                                                                                 |
| ----------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| idle                    | submitting (Apply or Clear)                           | instant — controls disable, in-flight text appears                                                        |
| submitting              | result (`ok` / `partial` / `refused` / `infra_error`) | instant                                                                                                   |
| result                  | idle                                                  | instant, on any control change                                                                            |
| target local            | target validation                                     | instant; reveals the confirmation control                                                                 |
| validation, unconfirmed | validation, confirmed                                 | instant                                                                                                   |
| any result              | submitting again                                      | instant; the prior result clears before the request fires, so a stale result never sits beside a live one |

Compound: changing scenario, show, or environment **while a request is in flight** is prevented — the controls are disabled for the duration, which is also the double-submit guard of §5.3. Changing them while a _result_ is displayed clears the result, per the row above.

## 10. Flag lifecycle

| Flag / field                 | Storage                 | Write path     | Read path                         | Effect                                    |
| ---------------------------- | ----------------------- | -------------- | --------------------------------- | ----------------------------------------- |
| `ADMIN_DEV_PANEL_ENABLED`    | env at build invocation | operator / CI  | `scripts/with-admin-dev-flag.mjs` | not `"true"` → route absent from artifact |
| `tier`, `scenario`, `w`      | URL query               | user           | gallery page                      | §4.5                                      |
| `scenario.degraded`          | catalog literal         | catalog author | `ScenarioBlock`                   | degraded pill + Overview notice           |
| `scenario.warnings` presence | catalog literal         | catalog author | both consumers                    | tri-state, §3.4                           |
| `context.__devScenario`      | `admin_alerts.context`  | Apply          | Apply + Clear                     | scopes deletion                           |
| `sync_holds.created_by`      | column                  | Apply          | Apply + Clear                     | scopes deletion                           |
| target environment           | form field              | user           | materialize action                | local vs validation client (§5.5)         |

No empty column; no zombie flag.

## 11. DB completeness matrix

| Layer                   | `admin_alerts`                   | `sync_holds`                                                                   | `shows_internal.parse_warnings` |
| ----------------------- | -------------------------------- | ------------------------------------------------------------------------------ | ------------------------------- |
| DDL / CHECK / migration | none — no schema change          | none                                                                           | none                            |
| Constraints honored     | partial unique index (§5.1a)     | `unique (show_id, domain, entity_key)` + domain/kind/kind_shape CHECKs (§3.0a) | none                            |
| RPC read path           | unchanged (`fetchPerShowAlerts`) | unchanged (`readShowChangeFeed`)                                               | unchanged (snapshot RPC)        |
| Write path              | service-role insert/delete       | service-role insert/delete                                                     | service-role update             |
| Cleanup                 | tag-scoped                       | tag-scoped                                                                     | local re-sync only (§5.2)       |
| Frontend                | gallery + card                   | gallery hold group + card                                                      | `PerShowActionableWarnings`     |
| Tests                   | §12                              | §12                                                                            | §12                             |

## 12. Meta-test inventory

**Extends:** `tests/log/_auditableMutations.ts` (four rows), `tests/log/adminOutcomeBehavior.test.ts` (four behavioral proofs), the invariant-9 call-boundary registry (§7.5), `tests/admin/withAdminDevFlagDevPanelPresent.test.ts` and `tests/admin/build-artifact-gate.test.ts` (§6).

**Creates:** none.

**Declined:** a catalog-completeness meta-test (§1.1). The alert axis needs none; the warning axis has an enumerated residue whose closure is a backlog item.

**Known harness gap:** the shared Supabase mock `chainResult` (`tests/log/adminOutcomeBehavior.test.ts:77-86`) stubs only `eq/is/not/select/update/insert/delete/single/limit`. Any builder method materialize uses beyond that set must be added in the same task, or the behavioral test throws on an undefined method.

**Behavioral tests.** Each states the failure mode it catches; none passes merely by the function being called.

| Test                                                                                                                                                                                                                                            | Catches                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| No scenario carries duplicate alert codes or duplicate hold `(domain, entity_key)`, asserted across the whole catalog                                                                                                                           | a catalog addition that renders fine and fails the unique constraint the first time it is materialized                                   |
| Apply skips a colliding code: seed a real unresolved alert of code C, apply a scenario with C and D; assert D inserted, C in `skipped`, and the pre-existing C row **byte-identical** (same id, `raised_at`, `occurrence_count`, `resolved_at`) | an Apply that "handles" the collision by resolving or overwriting a real alert                                                           |
| Apply A then Apply B leaves exactly B's synthetic rows and none of A's                                                                                                                                                                          | the union/first-wins/last-wins mixture of R1 #2                                                                                          |
| Apply with `warnings` absent leaves `parse_warnings` byte-identical; with `[]` writes `[]`                                                                                                                                                      | the destructive-erase of R1 #3                                                                                                           |
| Apply → Clear leaves **zero** tagged rows, counted directly against the DB, not from the action's own report                                                                                                                                    | a Clear that strands rows while reporting success                                                                                        |
| Apply twice yields the same row count as once                                                                                                                                                                                                   | non-idempotent accumulation                                                                                                              |
| Guards: unknown/empty/whitespace slug, archived show, unknown scenario id, T1/T2 id, unknown environment, unconfirmed validation, wrong project ref, empty scenario — each commits **no writes**, asserted by before/after row counts           | a guard that returns an error after having already written                                                                               |
| Reserved-key test: no catalog `context` contains `__devScenario`; no production emitter writes it                                                                                                                                               | Clear deleting authentic rows (R1 #12)                                                                                                   |
| Fidelity: derived fields the gallery computes equal those `fetchPerShowAlerts` returns for the same row and identity, compared across the two call paths rather than to a hand-written expectation                                              | the gallery and the real modal rendering different copy — the failure that makes the instrument misleading rather than merely incomplete |
| Hold shaping: a scenario hold inserted and read back through `readShowChangeFeed` yields the same `FeedEntry` the gallery shaped                                                                                                                | drift between the two shaping call sites                                                                                                 |
| `PICKER_EPOCH_RESET` produces no derived item, and is refused by materialize                                                                                                                                                                    | the cut silently becoming a rendered card                                                                                                |
| T2: each §4.2 row asserts its stated outcome                                                                                                                                                                                                    | a fallback predicate that no longer routes as documented                                                                                 |
| Build gate at both flag states (§6)                                                                                                                                                                                                             | a gate that permanently deletes, or one that leaks                                                                                       |
| Query-param guards and `scenario`-over-`tier` precedence (§4.5)                                                                                                                                                                                 | the self-contradictory clamp of R1 #24                                                                                                   |
| Layout: adjacent open menus do not intersect at min and max `w` (§8)                                                                                                                                                                            | overlapping portals invalidating the sweep                                                                                               |

**Not covered, deliberately:** live `resolveAlertIdentities` behavior against real crew rows (the inherent divergence of §3.3, labelled in the UI), and validation-target writes (exercised by hand, not in CI, since CI has no validation credentials).

## 13. Out of scope

- Screenshot regression gate and the Docker/arch pinning it requires (§1.1).
- Rendering T3 composites in the gallery (§4.3).
- Materializing T1/T2 scenarios (§5.0).
- Widening the internal-code-enum generator's scan heuristic (§3.2, backlog).
- Making gallery server actions functional (§4.4).
- Env-aware re-sync for validation Clear (§5.5).

**Explicitly in scope, contrary to the previous revision** (R1 #23): this design **does** modify production code. §3.3 extracts a pure function out of `fetchPerShowAlerts` and another out of `readShowChangeFeed`, both of which feed the production show modal. The extractions are behavior-preserving and the existing tests for both paths must pass unchanged, but claiming "no production render path is touched" was false and the regression risk is real.
