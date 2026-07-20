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
| The show-name fix is one mechanism applied class-wide, not per-code authored copy. | User decision, this brainstorm. Realized as the `<show-prefix>` token (§3.1) after R1 killed the runtime-classifier form. |
| Nothing operates on rendered text. | §3.1. Rendered text contains user data; a regex over it can match a show name containing "In ". The token satisfies this trivially — there is no transform at all. |
| Which templates adopt the token is **authored**, not predicted. | §3.1–3.2, R1 findings 3/5/6. A runtime classifier cannot fail-by-default and cannot know a param's runtime value. |
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

## 3. Design — the `<show-prefix>` token

**Revision note (R1).** The first draft specified a runtime *classifier* that inspected each template and decided whether stripping left a grammatical sentence. Adversarial review R1 killed it on four counts, all correct: `deriveAlertMessageParams` returns params, not a template, so a template transform had no data path there (BLOCKING); a total classifier can never fail-by-default, because it returns an answer for every new template (HIGH); capitalization is not grammaticality, so an uppercase remainder can still be a fragment (HIGH); and a token's *name* says nothing about its runtime *value*, so `<crew-name>` resolving to an empty string still opens a sentence badly (HIGH).

The replacement removes the prediction problem instead of refining it. **Classification is authored into the template, once, by a human, and checked by the compiler and one grep-style meta-test.**

### 3.1 The token

The 3 templates that read well without their location prefix are rewritten to open with an explicit `<show-prefix>` token:

```
"In <sheet-name>, <role-changes><lead-hint>"     →  "<show-prefix><role-changes><lead-hint>"
```

`deriveAlertMessageParams` resolves `show-prefix` like any other param:

- global scope → `In 'Doug's Sheet', ` (the same sheet/show name the template used to interpolate, same quoting via `quoted`, trailing `", "` included)
- show scope → `""`

No template transform, no strip, no regex over templates or rendered text. The existing `interpolate()` path does all the work, and the ratified "never operate on rendered text" constraint holds trivially because nothing operates on rendered text at all.

The 2 templates whose remainder opens with a lowercase value (`AMBIGUOUS_EMAIL_BINDING`, `PICKER_SELECTION_RACE`) **keep their literal `In <sheet-name>, ` prefix** and do not adopt the token. They stay correct-but-redundant in the modal; rewording them is spec B copy work.

### 3.2 Which name does `show-prefix` use?

Per template, and authored — not inferred. Each adopting template declares its prefix source in the same place its other identity params come from:

| Code | Prefix source | Global rendering |
| --- | --- | --- |
| `ROLE_FLAGS_NOTICE` | `sheet-name` | `In 'II - RIA Investment Forum - Central 2025', ` |
| `PICKER_BOOTSTRAP_RPC_FAILED` | `show-name` | `In 'II - RIA Investment Forum - Central 2025', ` |
| `OAUTH_IDENTITY_CLAIMED` | `show-name` | `In 'II - RIA Investment Forum - Central 2025', ` |

R1 finding 5 asked whether `<sheet-name>` is genuinely redundant with the modal header or names a *distinct* input sheet. Verified: `ROLE_FLAGS_NOTICE` is raised per-show and its `sheet-name` resolves to the same show's spreadsheet, which the modal header already names (screenshot in §1 shows both strings identical). The redundancy is real, not apparent. Codes where the sheet is a *different* artifact than the open show do not adopt the token.

### 3.3 Guard conditions

`show-prefix` is a normal param and inherits the existing fallback chain (identity > context > fallback, `lib/adminAlerts/deriveMessageParams.ts:12-20`). Explicit behavior for every degenerate input:

| Input state | `show-prefix` (global) | `show-prefix` (show) |
| --- | --- | --- |
| identity resolves the name | `In '<name>', ` | `""` |
| identity null, context supplies the name | `In '<name>', ` | `""` |
| neither supplies a name | `""` — no dangling "In '', " | `""` |
| name resolves to whitespace-only | `""` (trimmed, then treated as absent) | `""` |

The absent-name case is why the token is strictly better than the strip: today a missing `sheet-name` renders the literal fallback phrase mid-prefix; with the token, an unresolvable name degrades to no prefix at all, which is the correct sentence either way.

R1 finding 6 (empty `<role-changes>` plus empty `<lead-hint>` in show scope yielding an empty body) is guarded by the pre-existing `ROLE_CHANGES_FALLBACK` (`lib/adminAlerts/deriveMessageParams.ts:27`), which guarantees `role-changes` is never empty. A test pins that specific composition — empty context, show scope — and asserts the body is non-empty.

R1 finding 7 (a template that is *entirely* the prefix) cannot arise: a template consisting only of `<show-prefix>` would render empty in show scope. The meta-test in §7.1 rejects any template whose non-prefix remainder is empty.

### 3.4 Result

`ROLE_FLAGS_NOTICE` in the show modal, with `lead-hint` empty:

> **Doug Larson was added with LEAD + V1.**

In the bell, unchanged:

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
/** Throws on a code absent from RESOLVE_INTENTS. There is no default. */
export function resolveActionIntent(code: string): ResolveIntent;
export function resolveActionLabels(code: string): { idle: string; pending: string };
```

- `"confirm"` → `{ idle: "Confirm", pending: "Confirming…" }`
- `"resolve"` → `{ idle: "Mark resolved", pending: "Resolving…" }`

**No default.** R1 finding 4 is right that defaulting unknown codes to `"resolve"` makes the coverage meta-test vacuous — every code would be "classified" without anyone classifying it. `RESOLVE_INTENTS` instead maps every resolve-eligible code explicitly (§7.2 defines that set as the 45 `ADMIN_ALERTS_CODES` minus the auto-resolving ones), and an unmapped code throws.

Throwing is safe here precisely because the set is closed and gated: a code can only reach a resolve button after being registered in `ADMIN_ALERTS_CODES`, and that registration now fails the §7.2 test until its intent is declared. The throw is a development-time backstop behind a CI gate, not a runtime risk on a live surface.

Codes are `"confirm"` when the admin is approving a deliberate change rather than clearing a fault — `ROLE_FLAGS_NOTICE` is the first member.

All three buttons in §1's table read this module, so one alert reads identically wherever it appears. The bell's "Dismiss" / "Dismissing…" is replaced by the same pair.

## 5.1 Copy that names the old label (§12.4 fan-out)

Renaming the button falsifies user-visible copy that quotes it. Two catalog rows quote "Mark resolved" verbatim:

- `lib/messages/catalog.ts:2189` (`ADMIN_ALERT_NOT_FOUND`) — "When you clicked Mark resolved, the server looked up that alert by id…"
- `lib/messages/catalog.ts:2192` (`ALERT_REQUIRES_SHOW_SCOPED_RESOLVE`) — same opening clause

Both become label-agnostic rather than intent-branched, so no error string has to know which label the user saw:

> "When you resolved that alert, the server looked up that alert by id and either didn't find it…"

These are §12.4 rows, so the edit lands as the **lockstep triple in one commit** (per AGENTS.md): master spec §12.4 prose at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`, `pnpm gen:spec-codes` regen of `lib/messages/__generated__/spec-codes.ts`, and the matching `lib/messages/catalog.ts` rows. The `x1-catalog-parity` gate (`tests/cross-cutting/codes.test.ts`, run by `pnpm test:audit:x1-catalog-parity`) blocks merge if any of the three drifts. The master spec carries one additional prose occurrence of the phrase; `pnpm prettier` is never run on the master spec.

## 6. Out of scope

- `DataQualityWarningControls.tsx:101` "Ignore" — parse warnings, different action, correct verb.
- `IgnoredSheetsDisclosure` / `StagedReviewCard` ignore flows — sheet-level, not alert-level.
- `ReSyncButton` / `BellPanel` overlay dismissals — UI chrome dismissing a transient result, not resolving a row.

## 7. Structural defenses

Two meta-tests plus one compiler guarantee. R1 findings 3 and 4 correctly identified that the first draft's defenses were vacuous — a total classifier and a defaulting label map both answer for every input, so neither can fail on a new row. Each defense below fails because something is *absent*, never because a predicate returned the wrong answer.

1. **No un-tokenized prefix.** Scans every `dougFacing` in `lib/messages/catalog.ts` for a template opening with the literal `In <sheet-name>, ` or `In <show-name>, `. Every hit must appear in an explicit `PREFIX_EXEMPT` registry with a written reason. The registry ships with exactly two rows (`AMBIGUOUS_EMAIL_BINDING`, `PICKER_SELECTION_RACE`, both "remainder opens with a lowercase value"). A new template written with a literal prefix fails until its author either adopts `<show-prefix>` or writes down why it cannot. Also asserts no adopting template's remainder is empty (§3.3).
2. **Resolve-intent completeness.** The resolve-eligible set is discoverable: `ADMIN_ALERTS_CODES` (`tests/adminAlerts/adminAlertCodes.fixture.ts:13`, 45 codes with production write sites) minus `AUTO_RESOLVING_CODES` (`lib/adminAlerts/audience.ts:52`, derived from `resolution: "auto"`). Every member must have an explicit row in the intent map — there is **no default**. `resolveActionIntent` throws on an unmapped code rather than falling back to `"resolve"`. A new alert producer already has to register its code in `ADMIN_ALERTS_CODES` (existing gate); doing so now also fails this test until the code's intent is declared. The same test asserts all three button components read their labels from the module rather than string literals.
3. **Scope argument — compiler, not test.** The required fourth parameter (§3.5) means an omitted scope is a type error. No scan, no registry, no discovery problem.

Spec B additionally introduces a meta-test forbidding `helpfulContext: null` when `helpHref` is set. Recorded here so the two specs do not both claim it.

Spec B additionally introduces a meta-test forbidding `helpfulContext: null` when `helpHref` is set. Recorded here so the two specs do not both claim it.

## 8. Testing

**Oracle policy.** R1 findings 9 and 10 are right that deriving expected strings from the catalog compares the implementation with itself: edit the template and both sides move together. The project's usual "derive, never hardcode" rule assumes the fixture is *input*; here the catalog is the **subject under test**, so the oracle must be independent of it. Every copy assertion below therefore uses a **frozen string literal written into the test**, and a template edit is expected to fail the test — that failure is the signal, and re-blessing is a deliberate edit.

- **Unit** — `deriveAlertMessageParams` for each of the 3 adopting codes under both scopes, asserting the fully interpolated message against a frozen literal. Global for `ROLE_FLAGS_NOTICE`: `"In 'II - RIA Investment Forum - Central 2025', Doug Larson was added with LEAD + V1. Lead changes must be confirmed in the show page."` Show: `"Doug Larson was added with LEAD + V1."`
- **Unit — guards (§3.3 table).** Each degenerate input: identity null with context name, neither supplying a name (asserting no dangling `In '', `), whitespace-only name, and the empty-`role-changes` + show-scope composition asserting a non-empty body.
- **Unit** — `resolveActionIntent` returns `"confirm"` for `ROLE_FLAGS_NOTICE`, `"resolve"` for a declared resolve-intent member, and **throws** for an unmapped code (pinning the no-default contract, not a fallback).
- **Component** — each of the three buttons renders the intent-correct idle and pending label. The assertion reads the button's own accessible name via its `data-testid` (`per-show-alert-resolve-<id>`, `health-alert-resolve-<id>`, `bell-resolve-<id>`), never a container query: the message body for this code contains the word "confirm," so a container-scoped `getByText(/confirm/i)` would pass with the button label still reading "Mark resolved."
- **Regression — frozen bell baseline.** The bell rendering for all 5 prefix-relevant codes is asserted against frozen literals captured from `main` *before* the change and committed as a fixture. R1 finding 10 is right that "byte-identical before and after" is meaningless without a stored baseline; the fixture is that baseline, and it is generated once from the pre-change tree, not from the post-change implementation.

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
