# Show-scoped alert copy — design

**Date:** 2026-07-20
**Status:** draft
**Scope:** mechanisms only. Bulk copy authoring is spec B (catalog plain-language audit), tracked separately.

---

## 1. Problem

An `admin_alerts` row renders in three surfaces with one message string and three different action labels. Two defects follow.

**Redundant show name.** The show modal already names the show in its header, then the alert body repeats it: _"In 'II - RIA Investment Forum - Central 2025', Doug Larson was added with LEAD + V1."_ The same string in the global bell needs that name — nothing else there says which show.

**Self-referential hint.** `LEAD_HINT` (`lib/adminAlerts/deriveMessageParams.ts:26`) reads _" Lead changes must be confirmed in the show page."_ Read inside the show page, with the confirm button visible in the same card, it points at itself.

**Inconsistent action label.** One resolve action, three labels:

| Surface | File | Current label |
| --- | --- | --- |
| Show modal | `components/admin/PerShowAlertResolveButton.tsx:88` | "Mark resolved" |
| Developer telemetry | `components/admin/telemetry/HealthAlertResolveButton.tsx:28` | "Mark resolved" |
| Bell row | `components/admin/BellPanel.tsx:336` | "Dismiss" |

"Mark resolved" is also wrong on `ROLE_FLAGS_NOTICE` specifically: nothing is broken, the admin is approving a capability change. The catalog's own `longExplanation` for that code says the change is "worth a quick confirm."

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| **AMENDED (R2).** The show-name fix is per-code **authored** show-scoped templates, not a class-wide mechanical transform. | Originally ratified as "class-wide, mechanical" by user decision. Amended after two mechanical designs were killed in review (§3 revision note) and the exhaustive scan showed the adopting set is **3 codes, not ~45** — the cost that made authored variants unattractive does not exist. The class-wide part survives as the §7.1 meta-test, which forces every future prefixed template to declare a variant or an exemption. |
| The **global** rendering path does not change. | §3.1. This is what retires the bold-loss, missing-name, and empty-composition classes at once, rather than guarding each. |
| Nothing operates on rendered text, or on templates. | §3.1. There is no transform of any kind; lookup selects between two authored strings. |
| `lead-hint` resolves to `""` in show scope; the bell keeps the current sentence verbatim. | User decision, this brainstorm. |
| Action label is chosen by **alert intent**, not by surface. All three buttons read the same map. | User decision, this brainstorm. |
| `components/admin/DataQualityWarningControls.tsx:101` "Ignore" is out of scope — it acts on parse warnings, not `admin_alerts`, and "ignore" is its correct verb. | §6. |
| Bulk `helpfulContext` authoring (45 codes) and whole-catalog plain-language audit are **spec B**, not this spec. | User decision, this brainstorm. |
| `helpfulContext: null` on codes that also set `helpHref` is a defect to be fixed in spec B, NOT a ratified #472 outcome to preserve. | §7. |
| Mid-sentence `<show-name>` / `<sheet-name>` occurrences do NOT adopt the token. | §3.2. |

## 2. Current mechanism (verified)

`deriveAlertMessageParams(code, context, identity)` — `lib/adminAlerts/deriveMessageParams.ts:285-289`. Three callers, all passing the same three arguments:

- `lib/adminAlerts/fetchPerShowAlerts.ts:170` — show-scoped alerts (excludes `HEALTH_CODES`, `lib/adminAlerts/fetchPerShowAlerts.ts:104`)
- `lib/admin/bellFeed.ts:293` — global bell feed
- `components/admin/telemetry/HealthAlertsPanel.tsx:78` — developer telemetry

Show-scoped and global already resolve through **separate callers**. That is the seam; no new plumbing is needed to tell them apart.

`lead-hint` is set at `lib/adminAlerts/deriveMessageParams.ts:358` from `leadHintParam` (`lib/adminAlerts/deriveMessageParams.ts:282`). The `ROLE_FLAGS_NOTICE` template is `dougFacing: "In <sheet-name>, <role-changes><lead-hint>"` (`lib/messages/catalog.ts:855`).

## 3. Design — authored show-scoped templates

**Revision note (R1, R2).** Two mechanisms have now been killed by review, and the second failure is the informative one.

R1 killed a runtime *classifier* that predicted whether stripping a template's location prefix left a grammatical sentence: `deriveAlertMessageParams` returns params, not a template, so the transform had no data path (BLOCKING); and a total classifier can never fail-by-default, because it answers for every new template.

R2 killed the replacement, a `<show-prefix>` param carrying the fragment `In 'X', `. The decisive finding was one this spec's own author had independently confirmed against the code: `BellPanel.tsx:362` renders the pre-`<role-changes>` template segment through `renderCatalogEmphasis(..., BELL_BOLD_IDENTITY_TOKENS)`, and that set (`lib/adminAlerts/deriveMessageParams.ts:55-59`) bolds `sheet-name` / `show-name` so the operator can spot **which show** an alert belongs to. A template that replaces `<sheet-name>` with `<show-prefix>` either loses that bold entirely, or — if the prefix token joins the bold set — bolds the preposition and comma along with the name. R2 also correctly noted the frozen bell baselines are *string* comparisons, so they would have passed while the rendered emphasis silently regressed.

Both dead mechanisms share one root cause: **they changed the global rendering path in order to serve the show-scoped surface.** Every subsequent finding (bold loss, prefix-source completeness, missing-name ambiguity in the bell, empty-remainder compositions) descends from that. Per the project's three-round prose cap on design-correctness vectors, the third design does not guard those failures — it removes the possibility of them.

**The global path does not change. At all.**

### 3.1 A second authored template

The catalog entry gains one optional field:

```ts
/** Show-scoped variant of `dougFacing`, used only when the alert renders
    inside the show it belongs to. Falls back to `dougFacing` when absent. */
dougFacingShowScoped?: string;
```

Message lookup selects by scope: `"global"` reads `dougFacing`, unchanged; `"show"` reads `dougFacingShowScoped ?? dougFacing`.

Consequences, each of which retires a class of finding rather than guarding it:

- **The bell and telemetry render byte-identical, emphasis-identical output.** `dougFacing` is untouched, so `<sheet-name>` still sits in the template where `renderCatalogEmphasis` expects it, and the `<role-changes>` split at `BellPanel.tsx:358` still works on the same string. R2 finding 2 cannot arise.
- **Missing identity degrades exactly as it does today** in the global path, because it *is* today's path. R2 finding 5 (global copy changing when a name fails to resolve) cannot arise.
- **The fallback is always safe.** A code with no show variant renders its global text: redundant, never wrong, never empty. R2 findings 3, 4, and 7 lose their blast radius — there is no composition that can produce an empty or malformed show-scoped message, because the worst case is the string that ships today.
- **No new param, no sentence fragment in a value, no prefix-source selection.** R2 findings 1 and 6 cannot arise; there is nothing to select and nothing to compose.

The cost is one authored string per adopting code. That was the option originally priced at ~45 strings and set aside; the exhaustive scan in §3.3 found the real adopting set is **3**, so the objection no longer holds.

### 3.2 The three authored variants

| Code | `dougFacing` (global, unchanged) | `dougFacingShowScoped` (new) |
| --- | --- | --- |
| `ROLE_FLAGS_NOTICE` | `In <sheet-name>, <role-changes><lead-hint>` | `<role-changes><lead-hint>` |
| `PICKER_BOOTSTRAP_RPC_FAILED` | `In <show-name>, Google picker bootstrap couldn't claim the signed-in user's crew identity, and they saw a retry page. If it keeps happening for the same show, contact the developer.` | `Google picker bootstrap couldn't claim the signed-in user's crew identity, and they saw a retry page. If it keeps happening, contact the developer.` |
| `OAUTH_IDENTITY_CLAIMED` | `In <show-name>, <crew-name> was claimed through Google sign-in as <email>. Future picker attempts for that row will route through Google sign-in.` | `<crew-name> was claimed through Google sign-in as <email>. Future picker attempts for that row will route through Google sign-in.` |

R2 finding 9 is right that the first draft showed only one code's rendering. All three are above in full, and each show variant is a complete sentence under every parameter state: `role-changes` is guaranteed non-empty by `ROLE_CHANGES_FALLBACK` (`lib/adminAlerts/deriveMessageParams.ts:27`); `PICKER_BOOTSTRAP_RPC_FAILED` carries no params at all in its remainder; `crew-name` and `email` in `OAUTH_IDENTITY_CLAIMED` resolve through the same identity>context>fallback chain that already protects the global string, and the sentence opens with a proper noun in every case.

Note the `PICKER_BOOTSTRAP_RPC_FAILED` variant also drops "for the same show" — inside one show's modal, "if it keeps happening" already means that show. This is the kind of edit only an author can make, and is the reason the authored form beats any mechanical transform.

### 3.3 Adopting set (3 of 250 codes)

Exhaustive scan of all 250 `dougFacing` templates for a literal `In <sheet-name>, ` / `In <show-name>, ` opening returns exactly 5:

| Code | Adopts variant | Reason |
| --- | --- | --- |
| `ROLE_FLAGS_NOTICE` | yes | remainder is a complete sentence |
| `PICKER_BOOTSTRAP_RPC_FAILED` | yes | remainder is a complete sentence |
| `OAUTH_IDENTITY_CLAIMED` | yes | remainder opens with a proper noun |
| `AMBIGUOUS_EMAIL_BINDING` | no | remainder opens `<email> is shared by…` (lowercase); rewording is spec B |
| `PICKER_SELECTION_RACE` | no | remainder opens `a stale picker selection…` (lowercase); rewording is spec B |

The two non-adopters render their global string in the modal: the show name is redundant there but the sentence is correct.

Templates carrying `<show-name>` mid-sentence are untouched — grammatical either way, and rewriting them is spec B.

### 3.4 Result

`ROLE_FLAGS_NOTICE` in the show modal, with `lead-hint` empty:

> **Doug Larson was added with LEAD + V1.**

In the bell — the same string, the same bold, the same `<ul>` split as today:

> **In 'II - RIA Investment Forum - Central 2025', Doug Larson was added with LEAD + V1.** Lead changes must be confirmed in the show page.

### 3.5 The data path (verified end-to-end)

R1, R2, R3, and R4 each found a defect on this vector. The call chain has now been read end-to-end, and the result is smaller than every design that preceded it: **the two surfaces already use completely disjoint template sources.** No scope argument is needed for template selection at all.

| Surface | Template source | Reaches `dougFacingShowScoped`? |
| --- | --- | --- |
| Show modal | `safeDougFacingTemplate` (`lib/admin/attentionItems.ts:128-138`), called only from `deriveAttentionItems` (`lib/admin/attentionItems.ts:221`), whose only caller is `app/admin/_showReviewModal.tsx` | **yes** |
| Bell | `rowCopy` (`components/admin/BellPanel.tsx:124-127`), which reads `entry.dougFacing` directly | no — cannot, by construction |
| Telemetry | `HealthAlertsPanel.tsx:78` params + its own catalog read | no |

So `safeDougFacingTemplate` **is** the show-scoped selector. It selects `entry.dougFacingShowScoped ?? entry.dougFacing` unconditionally, with no new parameter and no threading:

```ts
const entry = messageFor(code as MessageCode);
const template = entry.dougFacingShowScoped ?? entry.dougFacing;
```

The existing unresolved-placeholder validation at `lib/admin/attentionItems.ts:135-136` then runs on **whichever template was selected**, so a variant that fails to interpolate returns `null` through the guard that already protects the global string.

R4's finding 2 asked how scope reaches line 221 and warned that `ROLE_FLAGS_NOTICE` could reach template selection without `"show"`. It cannot: there is no other path to that line. What the finding correctly identified is that a *future* global caller of `deriveAttentionItems` would silently receive show copy — so that assumption is pinned rather than assumed:

**Structural defense 6 (§7).** A meta-test asserts `safeDougFacingTemplate` has exactly one caller (`deriveAttentionItems`) and `deriveAttentionItems` exactly one caller (`app/admin/_showReviewModal.tsx`). A second caller fails the test, forcing whoever adds it to make the scope decision explicitly at that moment. This is the same fail-by-default shape as the other defenses: it breaks on *arrival* of the ambiguity, not on a guess about it.

`deriveAlertMessageParams` is genuinely shared — three callers, verified in §2 — so it keeps a **required** `scope` parameter, used only for `lead-hint` (§4). Two functions, two different problems; conflating them is what produced three dead designs.

### 3.6 Scope of the "global is untouched" claim

R3 finding 2 is right that "the global path does not change, at all" was an overclaim. Precisely:

- **Unchanged:** every `dougFacing` string; `rowCopy`; the bell's split, emphasis, and rendering; `interpolate`; the telemetry read.
- **Changed additively:** the catalog entry type gains one optional field; `safeDougFacingTemplate` prefers that field when present; `deriveAlertMessageParams` gains a required `scope` parameter and its three call sites pass it literally.

The surviving claim is narrower and still load-bearing: **no bell or telemetry render can select a different string than it does today**, because neither reads the new field. §8's rendered-tree regression verifies rather than assumes it.

## 4. Design — lead-hint scope override

In `"show"` scope, `params["lead-hint"]` is set to `""` regardless of `leadDelta`. `leadHintParam` (`lib/adminAlerts/deriveMessageParams.ts:282`) is unchanged; the override lives at the assignment site (`lib/adminAlerts/deriveMessageParams.ts:358`), so the derivation stays pure and independently testable.

## 5. Design — intent-driven action label

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->

New pure module `lib/adminAlerts/resolveActionLabel.ts`:

```ts
export type ResolveIntent = "confirm" | "resolve";
/** Returns "resolve" for a code absent from RESOLVE_INTENTS. Never throws. */
export function resolveActionIntent(code: string): ResolveIntent;
export function resolveActionLabels(code: string): { idle: string; pending: string };
```

- `"confirm"` → `{ idle: "Confirm", pending: "Confirming…" }`
- `"resolve"` → `{ idle: "Mark resolved", pending: "Resolving…" }`

**No default in the map; a safe default at runtime.** R1 finding 4 is right that a defaulting *map* makes a coverage test vacuous. R2 finding 3 is right that a *throwing* accessor is unsafe on a live surface: `ADMIN_ALERTS_CODES` enumerates current production write sites, not the rows already sitting in `admin_alerts`, so a historic row, a deploy-version skew, or a code retired from the producer registry can still reach a button and would take down all three admin surfaces on render.

Both hold at once, because they concern different objects:

- `RESOLVE_INTENTS` has **no default entry**. Completeness is asserted against an independently derived set (§7.2), so the meta-test cannot pass vacuously — it consults the map, not the accessor.
- `resolveActionIntent(code)` **returns `"resolve"` for an unmapped code** and never throws. "Mark resolved" is the correct conservative label for an unrecognized alert: it describes clearing a row, which is what the button does regardless of intent.

The gate catches authoring mistakes at CI time; the runtime fallback catches everything CI cannot see. Neither depends on the other being complete.

Codes are `"confirm"` when the admin is approving a deliberate change rather than clearing a fault — `ROLE_FLAGS_NOTICE` is the first member.

All three buttons in §1's table read this module, so one alert reads identically wherever it appears. The bell's "Dismiss" / "Dismissing…" is replaced by the same pair.

## 5.1 Copy that names the old label (§12.4 fan-out)

Renaming the button falsifies user-visible copy that quotes it. Two catalog rows quote "Mark resolved" verbatim:

- `lib/messages/catalog.ts:2189` (`ADMIN_ALERT_NOT_FOUND`) — "When you clicked Mark resolved, the server looked up that alert by id…"
- `lib/messages/catalog.ts:2192` (`ALERT_REQUIRES_SHOW_SCOPED_RESOLVE`) — same opening clause

Both become label-agnostic rather than intent-branched, so no error string has to know which label the user saw. The replacement also stops asserting success on what is by definition a failed attempt (R2 finding 10):

> "When you tried to resolve that alert, the server looked it up by id and either didn't find it…"

These are §12.4 rows, so the edit lands as the **lockstep triple in one commit** (per AGENTS.md): master spec §12.4 prose at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`, `pnpm gen:spec-codes` regen of `lib/messages/__generated__/spec-codes.ts`, and the matching `lib/messages/catalog.ts` rows. The `x1-catalog-parity` gate (`tests/cross-cutting/codes.test.ts`, run by `pnpm test:audit:x1-catalog-parity`) blocks merge if any of the three drifts. The master spec carries one additional prose occurrence of the phrase; `pnpm prettier` is never run on the master spec.

## 6. Out of scope

- `DataQualityWarningControls.tsx:101` "Ignore" — parse warnings, different action, correct verb.
- `IgnoredSheetsDisclosure` / `StagedReviewCard` ignore flows — sheet-level, not alert-level.
- `ReSyncButton` / `BellPanel` overlay dismissals — UI chrome dismissing a transient result, not resolving a row.

## 7. Structural defenses

Six defenses. Each fails because something is **absent** or **rendered wrong**, never because a predicate guessed.

1. **No un-declared prefixed template.** Scans every `dougFacing` for a literal `In <sheet-name>, ` / `In <show-name>, ` opening. Every hit must EITHER define `dougFacingShowScoped` OR carry a `PREFIX_EXEMPT` row with a written reason. Ships with 3 adopters, 2 exempt (§3.3).
2. **Variant validity is asserted on RENDERED output, not template text.** R3 finding 3 is right that a template-level check is vacuous: `dougFacingShowScoped: "<lead-hint>"` is non-blank, prefix-free, and placeholder-subset-clean, yet renders empty because show scope resolves `lead-hint` to `""`. The test therefore **interpolates every variant under a worst-case param fixture** — null identity, empty context, show scope, so every conditionally-empty token resolves to its emptiest legal value — and asserts the result is non-empty after trim and carries no unresolved `<placeholder>`. Template-level checks (no literal prefix, placeholder set a subset of the global's) are kept as cheap additional guards, not as the primary one.
3. **Paired-string drift.** R3 finding 4 is right that two authored strings drift silently. A fixture holds **both** strings for each adopting code, frozen; editing `dougFacing` fails the fixture with a message naming the paired variant, so the global string cannot be re-blessed without reading the show one. R4 finding 3 is right that the fixture's *membership* also needs pinning: the test asserts the fixture's key set **equals** the set of catalog entries defining `dougFacingShowScoped`. A new variant that skips the fixture fails on arrival rather than drifting later. This does not prove semantic agreement — nothing mechanical can — but it removes every silent path.

4. **Single source for labels, enforced by source scan.** R3 finding 5 is right that an import assertion is vacuous: a component can import the module, ignore it, and reimplement the conditional locally. The test instead **scans the three component sources for the literal strings** `"Mark resolved"`, `"Confirm"`, `"Dismiss"`, `"Resolving…"`, `"Confirming…"`, `"Dismissing…"` and fails on any hit. The labels exist in exactly one module; a local reimplementation cannot avoid writing one of those literals.
5. **Resolve-intent completeness and lifecycle.** Completeness: `ADMIN_ALERTS_CODES` (`tests/messages/adminAlertsRegistry.ts:9` — the registry production code cites at `lib/admin/attentionItems.ts:65`; `tests/adminAlerts/adminAlertCodes.fixture.ts:13` is a verified-identical 45-code copy) minus `AUTO_RESOLVING_CODES` (`lib/adminAlerts/audience.ts:52`); every member needs an explicit `RESOLVE_INTENTS` row.

   Lifecycle (R3 f6 → R4 f4 → R5 f1 → R6 f1). Three same-tree oracles were tried and all three failed, and R6 identified why in general:

   - "assert no code disappears across the diff" — a test sees only the final tree.
   - key-only superset against a baseline — an unbaselined code can be added then deleted, and a baselined code's intent can be flipped.
   - exact pair-equality against a baseline — **one commit can edit the map and the baseline together**, so equality still passes while the pair changes or vanishes.

   R6 finding 1 is correct, and it generalizes: **no assertion computed from a single tree can enforce an append-only property**, because the "previous" state it must compare against is not present in that tree. Any in-tree baseline is just a second file the same commit can edit. Continuing to refine the equality is the wrong move; the oracle needs a different input.

   **The check is history-aware.** It reads the previous baseline from git rather than from the working tree:

   ```
   prev = git show origin/main:tests/adminAlerts/resolveIntentsBaseline.ts
   assert: for every (code, intent) in prev  →  RESOLVE_INTENTS has code with the SAME intent
   ```

   A commit can now edit both files freely and still fail, because `prev` comes from a tree that commit cannot rewrite. Deleting a row, flipping an intent, or dropping a code alongside its producer all fail against `origin/main`. Adding is unrestricted.

   Two-layer availability, following the `validation-schema-parity` precedent in this repo:

   - **Layer 1 (always):** current-tree consistency — `RESOLVE_INTENTS` and the committed baseline agree exactly. Runs everywhere, catches the ordinary mistake of updating one and not the other.
   - **Layer 2 (history):** the `origin/main` comparison above. **Required in CI**, where full history is fetched.

   Layer 2's three outcomes are explicit, because R7 finding 1 correctly showed the first draft had no valid behavior on its own introducing PR:

   | Condition | Behavior |
   | --- | --- |
   | `origin/main` reachable, baseline file **exists** there | Compare. Every historical pair must still resolve identically. |
   | `origin/main` reachable, baseline file **absent** there | **Pass, vacuously.** There are no historical pairs to preserve. This is the bootstrap case — the PR that introduces the baseline — and it is a correct pass, not a skip. |
   | `origin/main` **unreachable** (no remote-tracking ref; shallow clone without it) | Skip, with the reason logged. |

   The skip condition is precisely "the `origin/main` ref cannot be resolved" — **not** "HEAD is detached." R7 finding 1 is right that CI commonly runs detached while `origin/main` remains perfectly reachable; treating detachment as a skip would disable the layer exactly where it is required. Detached HEAD with a reachable `origin/main` takes the compare path like any other.

   Retiring a producer means setting `retired: true`, which preserves both key and intent, so persisted historical rows keep rendering "Confirm".

   **Residual risk, stated honestly:** an author who deliberately edits the map, the baseline, and force-pushes over `origin/main` history defeats this, as they defeat every CI gate. That is out of scope for a test; it is what review is for. What the gate closes is the realistic failure — retiring a producer and cleaning up "unused" map entries without realizing persisted rows still render them.

6. **Single-caller topology.** Asserts `safeDougFacingTemplate` has exactly one caller (`deriveAttentionItems`) and `deriveAttentionItems` exactly one caller (`app/admin/_showReviewModal.tsx`), per §3.5. A second caller fails immediately, forcing an explicit scope decision instead of silently inheriting show copy.

The `deriveAlertMessageParams` scope parameter needs no defense: it is required, so omission is a type error (§3.5).

**Unknown-code behavior through the new branch (R3 finding 7).** `safeDougFacingTemplate` returns `null` for a code absent from `MESSAGE_CATALOG` before touching either field (`lib/admin/attentionItems.ts:132`), so the show branch cannot dereference a missing entry. A test exercises an uncataloged code under `"show"` specifically, rather than relying on the existing global-scope test to cover a new branch.

Spec B additionally introduces a meta-test forbidding `helpfulContext: null` when `helpHref` is set. Recorded once, here.

## 8. Testing

**Oracle policy.** R1 findings 9/10: deriving expected copy from the catalog compares the implementation with itself. The usual "derive, never hardcode" rule assumes the fixture is *input*; here the catalog is the **subject under test**, so every copy assertion uses a **frozen literal**. A template edit is meant to fail these tests.

- **Unit — per-code, both scopes.** Each of the 3 adopting codes, fully interpolated, against frozen literals. `ROLE_FLAGS_NOTICE` global: `"In 'II - RIA Investment Forum - Central 2025', Doug Larson was added with LEAD + V1. Lead changes must be confirmed in the show page."` Show: `"Doug Larson was added with LEAD + V1."`
- **Unit — non-adopters.** `AMBIGUOUS_EMAIL_BINDING` and `PICKER_SELECTION_RACE` render the same string under both scopes, pinning that an absent variant means fallback, not empty.
- **Unit — guards, per code and specific (R3 finding 8).** The first draft's guard list applied identity-null and whitespace-name cases uniformly, but `PICKER_BOOTSTRAP_RPC_FAILED`'s variant has **no** placeholders and `ROLE_FLAGS_NOTICE`'s is the only one carrying `role-changes`. Each code gets the guards its own params can actually exercise: `ROLE_FLAGS_NOTICE` — empty `role-changes` (asserting the `ROLE_CHANGES_FALLBACK` text, not merely non-empty), `lead-hint` empty in show scope; `OAUTH_IDENTITY_CLAIMED` — identity null with context-supplied `crew-name`, whitespace-only `crew-name`, missing `email`, each asserting the **expected fallback text** rather than non-emptiness; `PICKER_BOOTSTRAP_RPC_FAILED` — asserts the variant is param-free and byte-stable across every param fixture.
- **Unit — `params === undefined` (R4 finding 5).** `safeDougFacingTemplate` accepts `undefined` params, and every other guard case supplies an object with fallbacks, so an absent-params regression could return a raw variant with live tokens. Each adopting code is called with `undefined` and asserted to return `null` (the unresolved-placeholder guard firing) rather than a template containing `<crew-name>` or `<email>`. `PICKER_BOOTSTRAP_RPC_FAILED`, whose variant is param-free, is asserted to return its template unchanged — proving the guard rejects for the right reason rather than rejecting everything.
- **Unit — label map.** `"confirm"` for `ROLE_FLAGS_NOTICE`, `"resolve"` for a declared resolve member, `"resolve"` for an unmapped code (the no-throw contract R2 finding 3 required).
- **Component — full cross-product.** 3 buttons × 2 intents × {idle, pending} . A component that hardcodes a label, ignores its `code`, or discards the module's result fails at least one cell. Each assertion reads the button's accessible name via `data-testid` (`per-show-alert-resolve-<id>`, `health-alert-resolve-<id>`, `bell-resolve-<id>`), never a container query — this code's message body contains "confirm", so a container-scoped `getByText(/confirm/i)` passes with the label still wrong.
- **Regression — bell rendered tree, not its string.** R2 finding 2: string baselines miss emphasis regressions. For all 5 prefix-relevant codes, assert the show/sheet name sits inside `<strong>`, the `<ul>` split still occurs for multi-change `ROLE_FLAGS_NOTICE`, and the text matches a literal frozen from `main` before the change.

## 9. Dimensional Invariants

None introduced. This spec adds no fixed-dimension parent and no new flex or grid child relationship; it changes text inside three existing buttons and the message string inside an existing card.

One existing relationship is nonetheless disturbed and must be verified rather than assumed: **"Confirm" is shorter than "Mark resolved," and "Confirming…" is shorter than "Resolving…"** The bell row's change is larger still ("Dismiss" → "Confirm"). Where a button sits in a row that reserves space for it, a narrower label can change the row's distribution.

| Parent | Child | Invariant | Guaranteed by |
| --- | --- | --- | --- |
| `CompactAlertCard` footer row | `PerShowAlertResolveButton` | button stays right-aligned; footer height unchanged across both label pairs | existing `ml-auto` on the footer (per the #509 compact-card contract) — verified, not introduced |
| `BellPanel` row | resolve button | row height unchanged across the label swap | asserted in the layout test below |

Verification is a real-browser `getBoundingClientRect()` assertion, not jsdom.

**The comparison must hold message content constant.** R1 finding 11 is right that rendering a confirm-intent code beside a resolve-intent code confounds the test: the two codes carry different message bodies, so a row-height difference could come from body wrapping rather than button width, and equal heights could mask a real button-driven change. The test therefore renders **one fixed alert row** and varies **only the label**, injecting the label pair directly rather than selecting it by code. Assertions:

- footer/row height is identical across both label pairs (isolates the button as the only variable)
- the button's right edge stays flush with its container's content edge within 0.5px in both
- the button's own width *does* differ between pairs — a negative control proving the harness actually swapped the label and the test is not passing because nothing changed

## 10. Transition Inventory

R1 finding 12 is right that the first draft called this a two-state control while listing a third state, and omitted a required pair. The control has **three** states — `idle`, `pending`, `removed` — so the inventory owes all 3×2/2 = 3 pairs, in both directions where both directions are reachable.

| From | To | Reachable | Trigger | Treatment |
| --- | --- | --- | --- | --- |
| idle | pending | yes | click | instant — text swap inside a button disabled on the same tick |
| pending | idle | yes | resolve fails, error surfaces | instant — existing behavior |
| pending | removed | yes | resolve succeeds | inherits the existing card exit animation; unchanged by this spec |
| removed | pending | no | — | terminal state; the row is gone from the feed |
| idle | removed | yes | another surface resolves the same alert, or a refresh drops the row | inherits the same card exit animation. **This is the pair the first draft omitted.** It is reachable because the modal and the bell can both be open on the same alert |
| removed | idle | no | — | a returning row is a fresh mount, not a transition |

**Compound cases.**

- *Label swap during another card's exit.* `resolveActionIntent` is a pure function of `code`, so a card's label is fixed for its whole lifetime; no card re-reads a different label mid-transition. R1 finding 12 is right that resolving two cards quickly does not by itself *prove* this — so the audit asserts it directly: it renders two cards of differing intent, captures each button's text at mount, resolves both in quick succession, and asserts each captured label never changed before its card unmounted.
- *`idle → removed` while a sibling is mid-exit.* Asserted by resolving card A, then dropping card B from the feed while A's exit animation is still running, checking B leaves via the same exit treatment rather than disappearing instantly.

## 11. UI gate

Touches `components/**`. Invariant 8 applies: `/impeccable critique` and `/impeccable audit` on the diff before close-out, findings and dispositions recorded in the handoff.

## 12. Follow-on (spec B)

Catalog plain-language audit against a sheet-in/page-out rubric: the reader knows the sheet is input and the page is output, nothing about the parser or internal vocabulary. Covers all 250 codes' user-visible fields, includes authoring the 45 `helpfulContext: null` + `helpHref` rows, and includes the approved `ROLE_FLAGS_NOTICE` popover copy:

> LEAD and FINANCIALS are the two flags that unlock private info: budgets, invoices, and the admin side of the app. Someone's flags changed in the sheet, so we're asking you to confirm it was intended.

Phased by surface — show modal, then bell, then telemetry.
