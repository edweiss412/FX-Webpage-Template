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

- **The bell, the banner, and telemetry render byte-identical, emphasis-identical output.** `dougFacing` is untouched, so `<sheet-name>` still sits in the template where `renderCatalogEmphasis` expects it, and the `<role-changes>` split at `BellPanel.tsx:358` still works on the same string. R2 finding 2 cannot arise.
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

### 3.5 Scope argument — required, not defaulted

`deriveAlertMessageParams` gains a fourth parameter, **required**:

```ts
scope: AlertCopyScope // "global" | "show"
```

The first draft defaulted it to `"global"` to leave the two global callers untouched. R1 finding 2 is right that this fails open: a future show-scoped caller that forgets the argument silently renders global copy, and the §7.3 meta-test claiming every caller makes an "explicit scope decision" would be satisfied by callers that made none.

Required instead. All three existing callers are edited to pass their scope literally, and the compiler — not a test, not a scan — rejects any future caller that omits it. This also retires R1 finding 13: caller discovery through aliases, re-exports, or wrappers no longer matters, because there is no way to call the function without answering the question.

The scope value never reaches the renderer. It selects param values inside the derive layer, so render sites stay free of scope conditionals.

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

Three defenses. Each fails because something is **absent**, never because a predicate returned the wrong answer — the vacuity R1 findings 3/4 identified.

1. **No un-declared prefixed template.** Scans every `dougFacing` in `lib/messages/catalog.ts` for a literal `In <sheet-name>, ` / `In <show-name>, ` opening. Every hit must EITHER define `dougFacingShowScoped` OR carry a row in `PREFIX_EXEMPT` with a written reason. Ships with 3 adopters and 2 exempt rows (§3.3). A new template written with a literal prefix fails until its author picks one.
2. **Show-variant validity.** For every entry defining `dougFacingShowScoped`: it is non-empty after trim; it does NOT itself open with the literal prefix; and its placeholder set is a **subset** of `dougFacing`'s. The subset rule is what closes R2 finding 7 — a variant cannot introduce a token the global template never had, so it cannot reference a param the derive layer does not populate. No composition can yield an empty or malformed show message, because the fallback when a variant is absent is the shipping global string.
3. **Resolve-intent completeness.** The resolve-eligible set is derived independently of the map: `ADMIN_ALERTS_CODES` (`tests/adminAlerts/adminAlertCodes.fixture.ts:13`, 45 codes) minus `AUTO_RESOLVING_CODES` (`lib/adminAlerts/audience.ts:52`). Every member must have an explicit `RESOLVE_INTENTS` row. Registering a new alert producer already requires adding to `ADMIN_ALERTS_CODES`; doing so now fails this test until the intent is declared. The same test asserts each of the three button components imports the label module — and §8's cross-product assertions prove they actually *use* its result (R2 finding 8).

The scope argument needs no defense: it is a required parameter (§3.5), so omitting it is a type error.

R2 finding 4 asks what happens when a resolve-eligible code has no catalog entry. Existing behavior, unchanged and already pinned: `lib/messages/lookup.ts` returns its unknown-code fallback copy (`tests/messages/lookup-unknown-code.test.ts`), the row renders with generic text, and — per this spec — its button reads "Mark resolved". No path throws.

Spec B additionally introduces a meta-test forbidding `helpfulContext: null` when `helpHref` is set. Recorded once, here, so the two specs do not both claim it (R2 finding 11 flagged this paragraph appearing twice).

## 8. Testing

**Oracle policy.** R1 findings 9/10 are right that deriving expected strings from the catalog compares the implementation with itself. The project's usual "derive, never hardcode" rule assumes the fixture is *input*; here the catalog is the **subject under test**, so every copy assertion uses a **frozen string literal written into the test**. A template edit is expected to fail these tests; that failure is the signal, and re-blessing is a deliberate edit.

- **Unit — show variants.** For each of the 3 adopting codes, the fully interpolated message under both scopes against frozen literals. `ROLE_FLAGS_NOTICE` global: `"In 'II - RIA Investment Forum - Central 2025', Doug Larson was added with LEAD + V1. Lead changes must be confirmed in the show page."` Show: `"Doug Larson was added with LEAD + V1."`
- **Unit — non-adopters.** `AMBIGUOUS_EMAIL_BINDING` and `PICKER_SELECTION_RACE` render the SAME string under both scopes, pinning that absence of a variant means fallback, not empty.
- **Unit — guards.** Per-code, under show scope: identity null with context supplying the name, neither supplying it, whitespace-only name, and the empty-`role-changes` composition — each asserting a non-empty, prefix-free body.
- **Unit — label map.** `resolveActionIntent` returns `"confirm"` for `ROLE_FLAGS_NOTICE`, `"resolve"` for a declared resolve member, and `"resolve"` for an unmapped code (pinning the no-throw contract R2 finding 3 required).
- **Component — full cross-product (R2 finding 8).** All 3 buttons × both intents = 6 assertions, plus pending state for each. A component that hardcodes "Confirm", ignores its `code`, or calls the module and discards the result fails at least one cell. Each assertion reads the button's own accessible name via its `data-testid` (`per-show-alert-resolve-<id>`, `health-alert-resolve-<id>`, `bell-resolve-<id>`) — never a container query, since this code's message body contains the word "confirm" and a container-scoped `getByText(/confirm/i)` would pass with the label still reading "Mark resolved".
- **Regression — bell rendered output, not just its string.** R2 finding 2 is right that string baselines would have missed an emphasis regression. The bell assertion for all 5 prefix-relevant codes therefore checks the rendered tree: the show/sheet name is inside a `<strong>`, the `<ul>` split still occurs for multi-change `ROLE_FLAGS_NOTICE`, and the full text matches a frozen literal captured from `main` before the change. This is cheap insurance even though §3.1 makes the global path unreachable by this diff.

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
