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
| Show-name strip is class-wide and mechanical, not per-code authored templates. | User decision, this brainstorm. |
| Strip operates on the **template**, before interpolation — never on rendered text. | §3.1 below. Rendered text contains user data; a regex over it can match a show name containing "In ". |
| `lead-hint` resolves to `""` in show scope; the bell keeps the current sentence verbatim. | User decision, this brainstorm. |
| Action label is chosen by **alert intent**, not by surface. All three buttons read the same map. | User decision, this brainstorm. |
| `components/admin/DataQualityWarningControls.tsx:101` "Ignore" is out of scope — it acts on parse warnings, not `admin_alerts`, and "ignore" is its correct verb. | §6. |
| Bulk `helpfulContext` authoring (45 codes) and whole-catalog plain-language audit are **spec B**, not this spec. | User decision, this brainstorm. |
| `helpfulContext: null` on codes that also set `helpHref` is a defect to be fixed in spec B, NOT a ratified #472 outcome to preserve. | §7. |
| Mid-sentence `<show-name>` / `<sheet-name>` occurrences are NOT stripped. | §3.3. |

## 2. Current mechanism (verified)

`deriveAlertMessageParams(code, context, identity)` — `lib/adminAlerts/deriveMessageParams.ts:285-289`. Three callers, all passing the same three arguments:

- `lib/adminAlerts/fetchPerShowAlerts.ts:170` — show-scoped alerts (excludes `HEALTH_CODES`, `lib/adminAlerts/fetchPerShowAlerts.ts:104`)
- `lib/admin/bellFeed.ts:293` — global bell feed
- `components/admin/telemetry/HealthAlertsPanel.tsx:78` — developer telemetry

Show-scoped and global already resolve through **separate callers**. That is the seam; no new plumbing is needed to tell them apart.

`lead-hint` is set at `lib/adminAlerts/deriveMessageParams.ts:358` from `leadHintParam` (`lib/adminAlerts/deriveMessageParams.ts:282`). The `ROLE_FLAGS_NOTICE` template is `dougFacing: "In <sheet-name>, <role-changes><lead-hint>"` (`lib/messages/catalog.ts:855`).

## 3. Design — show-scoped prefix strip

### 3.1 Scope argument

`deriveAlertMessageParams` gains a fourth parameter:

```ts
scope: "global" | "show" = "global"
```

Defaulted, so the two global callers are untouched and cannot regress. `fetchPerShowAlerts.ts:170` passes `"show"`.

The scope value does not reach the template renderer. It selects the template variant and overrides `lead-hint` — both inside the derive layer, which keeps the render sites free of scope conditionals.

### 3.2 Classified strip

The strip matches the literal template prefix `In <sheet-name>, ` or `In <show-name>, `. It is applied only when the remainder still opens a grammatical sentence:

- remainder begins with an uppercase letter or a digit → **strip**
- remainder begins with `<crew-name>`, `<sheet-name>`, `<show-name>`, or `<role-changes>` → **strip** (proper nouns and the change list, all sentence-safe)
- anything else → **keep the prefix**

Correct copy beats short copy. A blind strip would open a sentence with a lowercase email.

### 3.3 Current classification (5 of 250 codes)

| Code | Remainder | Disposition |
| --- | --- | --- |
| `ROLE_FLAGS_NOTICE` | `<role-changes><lead-hint>` | strip |
| `PICKER_BOOTSTRAP_RPC_FAILED` | `Google picker bootstrap couldn't…` | strip |
| `OAUTH_IDENTITY_CLAIMED` | `<crew-name> was claimed through…` | strip |
| `AMBIGUOUS_EMAIL_BINDING` | `<email> is shared by…` | keep — would open lowercase |
| `PICKER_SELECTION_RACE` | `a stale picker selection for…` | keep — would open lowercase |

The two keep-cases could be reworded to strip cleanly. That is copy work and belongs to spec B; this spec leaves them correct-but-redundant.

Templates carrying `<show-name>` mid-sentence (e.g. `"A diagram snapshot promotion for <show-name> has been stuck…"`) are untouched — they are grammatical either way, and rewriting them is spec B.

### 3.4 Result

`ROLE_FLAGS_NOTICE` in the show modal, with `lead-hint` empty:

> **Doug Larson was added with LEAD + V1.**

In the bell, unchanged:

> **In 'II - RIA Investment Forum - Central 2025', Doug Larson was added with LEAD + V1.** Lead changes must be confirmed in the show page.

## 4. Design — lead-hint scope override

In `"show"` scope, `params["lead-hint"]` is set to `""` regardless of `leadDelta`. `leadHintParam` (`lib/adminAlerts/deriveMessageParams.ts:282`) is unchanged; the override lives at the assignment site (`lib/adminAlerts/deriveMessageParams.ts:358`), so the derivation stays pure and independently testable.

## 5. Design — intent-driven action label

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->

New pure module `lib/adminAlerts/resolveActionLabel.ts`:

```ts
export type ResolveIntent = "confirm" | "resolve";
export function resolveActionIntent(code: string): ResolveIntent;
export function resolveActionLabels(code: string): { idle: string; pending: string };
```

- `"confirm"` → `{ idle: "Confirm", pending: "Confirming…" }`
- `"resolve"` → `{ idle: "Mark resolved", pending: "Resolving…" }`

Default is `"resolve"`. Codes are `"confirm"` when the admin is approving a deliberate change rather than clearing a fault — `ROLE_FLAGS_NOTICE` is the first member.

All three buttons in §1's table read this module, so one alert reads identically wherever it appears. The bell's "Dismiss" / "Dismissing…" is replaced by the same pair.

## 6. Out of scope

- `DataQualityWarningControls.tsx:101` "Ignore" — parse warnings, different action, correct verb.
- `IgnoredSheetsDisclosure` / `StagedReviewCard` ignore flows — sheet-level, not alert-level.
- `ReSyncButton` / `BellPanel` overlay dismissals — UI chrome dismissing a transient result, not resolving a row.

## 7. Structural defenses

Three meta-tests, each fails-by-default on new rows (per AGENTS.md structural-defense calibration — they ship in the first implementation commit, not after a review round finds drift).

1. **Prefix classification.** Walks every `dougFacing` in `lib/messages/catalog.ts`, finds every template matching the prefix pattern, asserts each is classified strip/keep by §3.2's rule and that the strip result opens grammatically. A new prefixed template fails until classified.
<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->

2. **Resolve-label coverage.** Asserts every catalog code reachable by a resolve button resolves to a declared intent, and that all three button components source their labels from `lib/adminAlerts/resolveActionLabel.ts` rather than string literals.
3. **Scope-argument discipline.** Asserts `fetchPerShowAlerts.ts` passes `"show"` and that no additional `deriveAlertMessageParams` caller exists without an explicit scope decision.

Spec B additionally introduces a meta-test forbidding `helpfulContext: null` when `helpHref` is set. Recorded here so the two specs do not both claim it.

## 8. Testing

- **Unit** — `deriveAlertMessageParams` under both scopes: strip cases, keep cases, `lead-hint` emptied in show scope and present in global. Expected strings derived from the catalog template, not hardcoded, so a template edit fails the test rather than silently passing.
- **Unit** — `resolveActionIntent` default and confirm-member behavior; `resolveActionLabels` pairing.
- **Component** — each of the three buttons renders the intent-correct idle and pending label. Assertion scopes to the button's own accessible name, not a container that also renders the message body (which contains the word "confirm" for this code — a container-scoped query would pass tautologically).
- **Regression** — the bell path's rendered string for `ROLE_FLAGS_NOTICE` is byte-identical before and after, pinning that global copy did not move.

## 9. Dimensional Invariants

None introduced. This spec adds no fixed-dimension parent and no new flex or grid child relationship; it changes text inside three existing buttons and the message string inside an existing card.

One existing relationship is nonetheless disturbed and must be verified rather than assumed: **"Confirm" is shorter than "Mark resolved," and "Confirming…" is shorter than "Resolving…"** The bell row's change is larger still ("Dismiss" → "Confirm"). Where a button sits in a row that reserves space for it, a narrower label can change the row's distribution.

| Parent | Child | Invariant | Guaranteed by |
| --- | --- | --- | --- |
| `CompactAlertCard` footer row | `PerShowAlertResolveButton` | button stays right-aligned; footer height unchanged across both label pairs | existing `ml-auto` on the footer (per the #509 compact-card contract) — verified, not introduced |
| `BellPanel` row | resolve button | row height unchanged across the label swap | asserted in the layout test below |

Verification is a real-browser `getBoundingClientRect()` assertion, not jsdom: render each surface with a `"confirm"`-intent code and a `"resolve"`-intent code, assert the footer/row height is identical between the two and that the button's right edge stays flush with its container's content edge within 0.5px.

## 10. Transition Inventory

The label pair is a two-state control per surface, and the idle↔pending swap is the only transition this spec touches.

| From | To | Trigger | Treatment |
| --- | --- | --- | --- |
| idle ("Confirm" / "Mark resolved") | pending ("Confirming…" / "Resolving…") | click | instant — no animation. Matches the existing button behavior; the swap is a text change inside a button that is already disabled on the same tick. |
| pending | removed from DOM | resolve succeeds, row disappears | inherits the existing card exit animation; unchanged by this spec. |
| pending | idle | resolve fails, error surfaces | instant — no animation. Existing behavior. |

Compound case: a label swap can occur while the card is mid-exit if a second alert resolves during the first card's exit animation. The intent map is a pure function of `code`, so the label is stable for a given card across its whole lifetime — no card ever re-reads a different label mid-transition. The transition audit asserts this by rendering two cards of differing intent and resolving both in quick succession.

## 11. UI gate

Touches `components/**`. Invariant 8 applies: `/impeccable critique` and `/impeccable audit` on the diff before close-out, findings and dispositions recorded in the handoff.

## 12. Follow-on (spec B)

Catalog plain-language audit against a sheet-in/page-out rubric: the reader knows the sheet is input and the page is output, nothing about the parser or internal vocabulary. Covers all 250 codes' user-visible fields, includes authoring the 45 `helpfulContext: null` + `helpHref` rows, and includes the approved `ROLE_FLAGS_NOTICE` popover copy:

> LEAD and FINANCIALS are the two flags that unlock private info: budgets, invoices, and the admin side of the app. Someone's flags changed in the sheet, so we're asking you to confirm it was intended.

Phased by surface — show modal, then bell, then telemetry.
