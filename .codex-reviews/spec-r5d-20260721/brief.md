# Spec review R5d - GALLERY (section 4)

## Your role: REVIEWER ONLY

Do not fix issues, do not propose patches, do not imply changes you will make. Surface findings only. Do NOT run shell commands or tools; the artifact is inlined. Do NOT invoke any nested review.

## Context

A DEV-ONLY instrument in a Next.js 16 + Supabase admin app: it renders every alert/warning state of an admin "show modal" without waiting for live data to raise the row. One catalog, two consumers - a build-gated gallery route (renders states, no DB) and a "materialize" dev-panel card (writes tagged rows into a local or validation Supabase so the real modal shows the state for real). Sections 5-13, covering materialize and the invariants, were reviewed separately and are APPROVED.

## Settled - verify consistency, do NOT re-argue direction

- Gallery renders tier 1 (one scenario per code) and tier 2 (a structural matrix) only; tier 3 composites are materialize-only.
- No completeness gate: no screenshot byte-comparison, no meta-test asserting the catalog covers every code. Catalog VALIDITY is tested; coverage is not.
- Scenarios declare storable DB-shaped rows, never derived read-model shapes; the two consumers share one derivation function so they cannot diverge.
- Identity resolution needs real crew rows, so the gallery declares an identity where materialize resolves one. This divergence is inherent and is labelled in the UI.
- Action controls in the gallery render but are neutralized with `inert`.
- Bucketing runs on the server because BucketOpts holds predicate functions; ScenarioBlock receives serializable groups.
- Invariant 5 has a ratified, scope-enumerated dev-instrument exception.

## Binding project invariants (abbreviated)

- Inv 5: no raw error codes in user-visible UI, except the ratified scope above.
- Every prop/input needs stated behavior for null, empty, zero, malformed. The catalog's guard contract is executable (a validateScenario function) rather than prose.
- Tailwind v4 here does NOT default .flex to align-items:stretch; fixed-dimension parents with flex/grid children need explicit dimensional invariants verified in a real browser.
- Components with multiple visual states need a transition inventory covering every state pair and compound transitions.

## What I need from you

This document is near final. Confirm these sections are internally consistent and that their claims about rendering, derivation, and guards hold. If sound, say so and APPROVE. Do NOT manufacture findings to appear thorough, and do not restate settled decisions as findings.

## Output format

Per finding: `SEVERITY (P0/P1/P2/P3) - <claim> - <section> - <why it fails, concretely>`.

End with a final line exactly: `VERDICT: APPROVE` or `VERDICT: NEEDS-ATTENTION` or `VERDICT: BLOCKING`

## ARTIFACT - section 4

## 4. Gallery

**Route:** `app/admin/dev/attention-gallery/page.tsx (new)` — Server Component, `export const dynamic = "force-dynamic"`, `requireDeveloper()` at the top, matching `app/admin/dev/source-link-dim/page.tsx` and `app/admin/dev/telemetry-dim/page.tsx`.

### 4.0 The client boundary

R1 #6 is correct: `AttentionMenu` requires `pillRef: RefObject<HTMLButtonElement | null>`, `onClose: () => void`, and `onNavigate: (item) => void` (`components/admin/showpage/AttentionMenu.tsx:30-34`). None can be created in or passed from a Server Component.

**Bucketing runs on the server** (R2a): `BucketOpts` holds predicate _functions_, which cannot cross the RSC boundary. The page calls `bucketAttention(items, opts)` itself — it has the scenario's `bucket` predicates in scope — and passes the **resulting groups** down. `ScenarioBlock` never receives `BucketOpts` and never calls `bucketAttention`.

Resolution: the page (server) computes derived items, buckets them, and renders **one client component per scenario**, `ScenarioBlock` (`components/admin/dev/ScenarioBlock.tsx (new)`, `"use client"`). Its complete prop surface:

```ts
type ScenarioBlockProps = {
  scenarioId: string; // DOM anchor
  label: string;
  items: AttentionItem[]; // derived, serializable
  groups: Array<{ sectionId: RoutedSectionId; items: AttentionItem[] }>; // server-bucketed
  holdItems: AttentionItem[]; // kind: "hold", excluded from groups by bucketAttention
  readout: ReadoutRow[]; // plain strings, section 4.1 step 2
  warnings: ParseWarning[] | null; // null = scenario does not declare warnings (3.4)
  degraded: boolean;
  maxWidthPx: number | null; // null = unconstrained
};
```

Every field is serializable. `AttentionItem` is a plain discriminated union of scalars, arrays, and objects (`lib/admin/attentionItems.ts:79-81`) with no functions. Absent behavior: `warnings: null` renders no warning cards and no muted duplicate; `maxWidthPx: null` applies no wrapper constraint; empty `items`, `groups`, and `holdItems` render their respective empty states.

`ScenarioBlock` owns:

- the pill `<button>` and its ref (the ref target R1 #6 said was unidentified),
- `open` as real `useState`, defaulting to **true** so the menu is visible without a click, with a working `onClose` and a re-open control. This makes §4.4's "menu open/close is genuinely live" true rather than contradicted by a no-op,
- `onNavigate` as a no-op that records the item id into visible on-page text, so navigation intent is observable without a router.

**Menu positioning — measured, not hedged** (R2a correctly attacked the previous "if it turns out to be" wording). `AttentionMenu`'s root is `absolute top-[calc(100%+8px)] right-0 z-20 w-[min(400px,calc(100vw-32px))]` with an inner `max-h-96 overflow-y-auto` list (`components/admin/showpage/AttentionMenu.tsx:99` and `components/admin/showpage/AttentionMenu.tsx:108`). No portal, no `position: fixed`. Three consequences the previous revision got wrong:

1. It is **absolutely positioned, therefore out of flow** — it does not "stack vertically," it **overlays whatever follows**. Each block wraps the pill in a `relative` element (establishing the containing block) and, while its menu is open, reserves bottom space of at least the menu's maximum height (`24rem` list + header/footer + the `8px` offset). Adjacent open menus then cannot intersect, which §8 asserts in a real browser rather than assuming.
2. Its width is `min(400px, 100vw - 32px)` — sized off the **viewport**, not the container. The `w` control (§4.5) therefore does **not** narrow the menu. `w` narrows the cards and the block; menu width is a viewport property and cannot be simulated by a wrapper.
3. The scroll threshold is the list's `max-h-96` (384px). `MENU_CAP` = 12 rows, each `min-h-tap-min` (44px) plus padding, clears it comfortably — but §8 measures it rather than relying on this arithmetic.

`degraded: true` renders the same degraded pill and Overview notice the loader produces (`app/admin/_showReviewModal.tsx:304-310`), from the same components the modal uses, not a lookalike (R1 #17).

### 4.1 What a scenario block renders

Actual DOM, in order:

1. **Heading** — `<h2 id="<scenario id>">` with the label.
2. **Routing readout** — a `<dl>` per derived item: `code`, `kind`, `tone`, `sectionId`, `anchor` (or `—`), `actionable`, `autoClearNote` (or `—`), `template` resolved-vs-fallback, `identity: declared (gallery)`, and the `usePathname()` value passed to the card (§4.4). Wrong routing is legible as text, not merely a card in the wrong place.
3. **Pill + `AttentionMenu`** — per §4.0.
4. **Bucketed banners** — `bucketAttention(items, opts)` with `renderCard` = `AttentionBanner`, one labelled group per section.
5. **Hold rows** — rendered separately and labelled, because `bucketAttention` deliberately excludes `kind: "hold"` (`lib/admin/sectionAttention.ts:93-97`); holds belong to the Changes feed via `Mi11GateActions`. Omitting them would misread as a drop.
6. **`PerShowActionableWarnings`** — only when the scenario declares `warnings` (§3.4), rendered twice: `tone="warning"` and `tone="muted"` (the collapsed "Ignored (N)" skin, which has its own contrast posture). The double render is driven by the presence of the field, which is the declaration R1 #17 found missing.

### 4.2 T2 structural axes

`BucketOpts` (`lib/admin/sectionAttention.ts:30-39`) exposes the fallback predicates as injectable functions, so T2 drives them with no fake show. Each row states the exact predicate and the expected outcome (R1 #17):

| Axis                           | Exact mechanism                                                                                           | Expected outcome                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routed section absent          | `sectionAvailable: (s) => s === "overview"` — Overview stays available, so the fallback has a destination | banner falls back to Overview                                                                                                                                                                                                                                                                                                                                                           |
| Overview also absent           | `sectionAvailable: () => false`                                                                           | **the card is dropped** — `bucketAttention` has no destination, so the item appears in the pill count and the menu but in no section group. The readout names it `dropped: no available section`, and §12 asserts exactly this rather than accepting whatever renders (R2a: a row that delegates its outcome to observation cannot distinguish an intended drop from an accidental one) |
| Anchor slot absent             | `anchorAvailable: () => false`, `sectionAvailable: () => true`                                            | anchored card falls back to its section top                                                                                                                                                                                                                                                                                                                                             |
| Crew key unrendered            | `crewKeyRendered: () => false`                                                                            | crew banner goes to the crew section top                                                                                                                                                                                                                                                                                                                                                |
| Alert vs hold                  | scenario carries only `alerts` / only `holds`                                                             | hold appears in the hold group, never a banner                                                                                                                                                                                                                                                                                                                                          |
| Auto-clearing, inbox-routed    | one code with `isInboxRouted` true                                                                        | resolve control absent; `autoClearNote` = the inbox line (`lib/admin/attentionItems.ts:86`)                                                                                                                                                                                                                                                                                             |
| Auto-clearing, auto-resolving  | one code with `isAutoResolving` true                                                                      | resolve control absent; `autoClearNote` = `autoResolveNote(code)`                                                                                                                                                                                                                                                                                                                       |
| Actionable                     | one code that is neither                                                                                  | resolve control present                                                                                                                                                                                                                                                                                                                                                                 |
| Occurrence 1 vs N              | `occurrence_count: 1` / `7`                                                                               | repeat-count affordance                                                                                                                                                                                                                                                                                                                                                                 |
| Identity present/absent        | `galleryIdentity` set / null                                                                              | `menuSubtitle` present / absent                                                                                                                                                                                                                                                                                                                                                         |
| Uncataloged code               | a code absent from both `MESSAGE_CATALOG` and `ATTENTION_ROUTES`                                          | `ATTENTION_FALLBACK_TITLE` (`lib/admin/attentionItems.ts:84`); routes to Overview via the `?? { sectionId: "overview" }` fallback (`lib/admin/attentionItems.ts:254`)                                                                                                                                                                                                                   |
| Unresolved placeholder         | context leaving a `<token>` uninterpolated                                                                | `template` null, card falls back                                                                                                                                                                                                                                                                                                                                                        |
| Alert count 0 / 1 / `MENU_CAP` | the **alert** list length; holds and warnings are separately axed                                         | empty state, single, and a menu long enough to cross its scroll threshold                                                                                                                                                                                                                                                                                                               |
| Degraded alert read            | `degraded: true`                                                                                          | §4.0                                                                                                                                                                                                                                                                                                                                                                                    |

`MENU_CAP` is a named constant (§2), not a bare literal. Whether it actually crosses the production scroll threshold at every `w` is asserted by the layout task (§8), not assumed (R1 #28).

### 4.3 Tier boundaries

- **T1** — one scenario per alert code (`N_ALERT_CODES`, of which `N_ALERT_RENDERABLE` render) and one per warning code (`N_WARN_CODES`).
- **T2** — the §4.2 matrix.
- **T3** — composites, **rendered by materialize only**. The gallery lists them by id and label with a pointer to the dev panel.

### 4.4 Interactivity boundary

Live for real: menu open/close (§4.0), `?` help popovers, expand/collapse, hover, focus.

**Server actions are neutralized structurally, not by having fake ids** (R2a — the previous revision claimed synthetic ids made the actions inert, which was false: the resolve control still rendered and still submitted, so a click would run authorization, parsing, the Supabase call, the error path, and telemetry, and a non-UUID id against a `uuid` column throws before it can be a harmless no-match).

The mechanism: `ScenarioBlock` renders its banners inside a container with `inert` applied to the **action controls only** — the resolve form and any other submit — leaving the rest of the card interactive. `inert` removes them from the tab order and suppresses click and submit events at the platform level, so no action can fire regardless of what id it carries. The disabled controls stay **visible**, because their presence, placement, and label are exactly what the sweep exists to evaluate; only their activation is suppressed.

A standing note at the top of the page states that action controls are display-only here and points at the dev panel. The `gallery:<id>:<n>` ids of §3.0 remain useful as stable React keys and readout identifiers — they are simply no longer load-bearing for safety.

**Known fidelity caveat:** `AttentionBanner` reads `usePathname()` (`components/admin/review/AttentionBanner.tsx:101`) for a route-gated Learn-more link. Under the gallery that value is the gallery path, so the gate evaluates differently than in production. The readout prints the value (§4.1 item 2), making the difference explicit rather than silently misleading.

### 4.5 Controls

Query params only.

| Param      | Accepted                 | Effect                                                 | Default       |
| ---------- | ------------------------ | ------------------------------------------------------ | ------------- |
| `tier`     | `1`, `2`, `3`            | restrict to that tier; `3` renders the T3 list of §4.3 | all           |
| `scenario` | a scenario id            | restrict to that one scenario                          | all           |
| `w`        | integer in `[320, 1280]` | sets `max-width` on each block wrapper                 | unconstrained |

**Guards** (R1 #24):

- `scenario` **wins over** `tier` when both are present, including when the named scenario is not in the named tier. Precedence is stated because it is otherwise undefined.
- **`searchParams` shape.** A Next.js 16 App Router page receives an awaited `searchParams` whose values are `string | string[] | undefined` — not a `URLSearchParams` instance (R2a: the previous revision cited `.get()` semantics, which do not apply). Normalization is explicit: `undefined` means absent; an **array** takes its first element; an empty array is treated as absent.
- **`w` parsing, single rule, no overlap.** Trim, then require a full match of `^\d+$` (digits only — this already excludes empty, whitespace, signed, decimal, exponent, `NaN`, and `Infinity`, so those never reach the numeric stage). Parse with `Number.parseInt`. Then: if the result is not a finite integer — the digits-only-but-astronomically-long case R2a identified — treat as **absent**. Otherwise **clamp** into `[320, 1280]`. A negative value cannot reach the clamp because `-` fails the regex, which removes the previous revision's contradiction between "signed falls back" and "out-of-range clamps".
- `tier` outside `{1,2,3}`, empty, or whitespace → all tiers.
- Unknown `scenario` → an explicit "no such scenario" line listing valid ids, never a blank page.

`w` sets `max-width`, not a fixed width: it narrows the column the way a narrower viewport would, but it is **not** a viewport emulator (media queries still see the real viewport). §8 depends on this being `max-width`; §4.5 and §8 previously disagreed (R1 #21).
