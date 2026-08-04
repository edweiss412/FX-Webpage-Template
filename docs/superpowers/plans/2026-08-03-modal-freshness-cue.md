# Plan — published review modal freshness cue

**Spec:** `docs/superpowers/specs/2026-08-03-modal-freshness-cue.md` (canonical; section numbers below refer to it).
**Branch:** `feat/modal-freshness-cue`. **Backlog entry:** `BL-MODAL-REALTIME-UPDATED-CUE`.

Every task is one commit and carries its own RED and GREEN inside that commit (invariant 1). No task commits a failing test on its own.

---

## 0. Pre-draft verification pass

Run before drafting, per `docs/agents/writing-plans.md:7`. Every name below was grepped against the live tree on this branch and matches.

| Named thing | Verified at |
|---|---|
| `buildPublishedSectionData(snapshot, { slug })` | `components/admin/review/publishedAdapter.ts:43` |
| `PublishedSectionData` fields | `components/admin/review/sectionData.ts:81-97` over `SectionCore` `sectionData.ts:25-60` |
| `renderedSectionIds(d)` | `components/admin/review/sectionInclusion.ts:54` |
| That module is client-safe, not merely server-safe: it has no `"use client"` directive, imports only types, and the `"use client"` module `step3ReviewSections.tsx` already imports from it | `components/admin/wizard/step3ReviewSections.tsx:99`, `components/admin/review/sectionInclusion.ts:19-20` |
| `includesAgenda(d)` gating the agenda id on `agendaBaseline.length > 0` | `components/admin/review/sectionInclusion.ts:27-29` |
| `Step3SectionChrome` type, `exactOptionalPropertyTypes` discipline stated in-type | `components/admin/wizard/step3ReviewSections.tsx:449`, `step3ReviewSections.tsx:465-467` |
| `Step3SectionChromeContext` | `components/admin/wizard/step3ReviewSections.tsx:558` |
| `ModalSectionChrome`, exported for test | `components/admin/wizard/step3ReviewSections.tsx:874` |
| Panel-card div and its conditional testid | `components/admin/wizard/step3ReviewSections.tsx:1036-1044` |
| Per-section chrome provider value | `components/admin/review/ShowReviewSurface.tsx:1068-1158` |
| Section wrapper keyed by rail id | `components/admin/review/ShowReviewSurface.tsx:1047-1056` |
| Scroll container carrying `scrollerRef` | `components/admin/review/ShowReviewSurface.tsx:1036` |
| Modal open-time `router.refresh()` ref-guarded once per instance | `components/admin/showpage/PublishedReviewModal.tsx:174-193` |
| `SHARE_LINK_FLASH_MS` and its render-phase-state idiom | `components/admin/showpage/ShareHub.tsx:138`, `ShareHub.tsx:470-497` |
| ShareHub sr-only announce region shape | `components/admin/showpage/ShareHub.tsx:836-841` |
| Share-link keyframes and reduced-motion override | `app/globals.css:912-937` |
| Contrast harness `MODES`, `tokenIn`, floors | `tests/styles/status-token-contrast.test.ts:64-82` |
| Share-link ring contrast row (the shape to mirror) | `tests/styles/status-token-contrast.test.ts:248-261` |
| CSS-vs-constant drift pin (the shape to mirror) | `tests/components/admin/showpage/shareHubFlashTransitions.test.ts:91-95` |
| Flash attribute lifecycle suite (the shape to mirror) | `tests/components/admin/showpage/shareHubFlashState.test.tsx:167-176` |
| Published modal test harness | `tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx` |
| Realtime e2e spec, its skip gate and its broadcast call | `tests/e2e/published-review-modal.realtime.spec.ts:60-63`, `published-review-modal.realtime.spec.ts:248` |
| That spec's CI run line | `.github/workflows/published-modal-e2e.yml:149` |
| Real-browser dimension spec to extend | `tests/e2e/admin-layout-dimensions.spec.ts` |
| e2e wiring guard | `tests/ci/_metaE2eWorkflowCoverage.test.ts` |
| DESIGN.md interaction-constants section | `DESIGN.md:278-299` |
| DESIGN.md announcement pattern | `DESIGN.md:479` |
| DESIGN.md em-dash ban | `DESIGN.md:381` |

Two `tsconfig` settings shape every snippet below: `noUncheckedIndexedAccess` (so `arr[i]` is `T | undefined`) and `exactOptionalPropertyTypes` (so an optional field is inserted by spread, never assigned `undefined`). Snippets are written to satisfy both.

---

## 1. Meta-test inventory

Declared before tasks, per `docs/agents/writing-plans.md:16`.

| Meta-test | Action |
|---|---|
| `tests/components/admin/review/sectionFreshnessCss.test.ts (new)` | **CREATES.** Pins the constant against its declaration, the normative CSS block byte for byte, the two keyframe names, the `-1` and `-2` bodies being identical apart from name, the reduced-motion override, and the staged surface emitting nothing. |
| `tests/styles/status-token-contrast.test.ts` | **EXTENDS.** Rows for the outline against both grounds it touches. The `--color-accent-tint` background this row once named was cut on design review before implementation; the cue animates `outline-color` only. |
| `tests/ci/_metaE2eWorkflowCoverage.test.ts` | **RUNS, does not extend.** Both e2e additions land in specs that already have a `testMatch` row and a workflow. Running it is the proof of that claim, not an assumption. It is NOT sufficient on its own, for the reason in T5: it treats a `grep`-narrowed invocation as still covering the spec (`tests/ci/_metaE2eWorkflowCoverage.test.ts:207-208`), so coverage at spec granularity does not imply coverage at case granularity. |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | **N/A.** No `pg_advisory` call is added or touched; no SQL of any kind is in the diff. |
| `tests/auth/_metaInfraContract.test.ts` | **N/A.** No Supabase client call site is added or touched. |
| `tests/log/_metaMutationSurfaceObservability.test.ts` | **N/A.** No route handler, no server action, no mutation surface (spec §9). |
| `tests/docs/_metaLedgerInProgress.test.ts` | **RUNS.** The ledger marker is already live from Stage 0 and is removed at Stage 4.4. |
| `tests/docs/_metaInvariant8Closeout.test.ts` | **RUNS.** §12 is reserved and the marker lands with the closeout commit, for the reason recorded there. |

Advisory-lock holder topology: N/A, no lock key is touched.

---

## 2. Task list

- [x] T1 — the detector module and its unit suite
- [x] T2 — the normative CSS, DESIGN.md, contrast rows, structural pins
- [x] T3 — threading the flashing id set to the panel card
- [x] T4 — the state machine and the announcement region
- [x] T5 — real-browser dimension assertion (plus its own CI step)
- [x] T6 — e2e coverage of a real broadcast
- [x] T7 — backlog graduation
- [ ] Self-review
- [ ] Adversarial review (cross-model)
- [ ] Invariant-8 dual gate (both halves, per §12)
- [ ] Execution handoff / merge

---

## T1 — the detector module and its unit suite

**Creates:** `components/admin/review/sectionFreshness.ts (new)`, `tests/components/admin/review/sectionFreshness.test.ts (new)`, and a snapshot fixture builder beside it under `tests/components/admin/review/__fixtures__/`.

**RED first.** Write the suite against a module that does not exist yet; it fails to import. Then implement.

The module exports:

```ts
export const SECTION_FRESHNESS_FLASH_MS = 1600;
export const SECTION_FRESHNESS_MAX_CUES = 3;

export type SectionSignatures = ReadonlyMap<SectionId, string>;

export function buildSectionSignatures(input: {
  data: PublishedSectionData;
  bySection: SectionWarningRecord;
}): SectionSignatures;

export function changedSectionIds(prev: SectionSignatures, next: SectionSignatures): SectionId[];

export function freshnessAnnouncement(
  changed: readonly SectionId[],
  stillRendered: ReadonlySet<SectionId>,
): string;
```

`buildSectionSignatures` walks the spec §4.1 projection table, restricted to `renderedSectionIds(data)`. It takes `bySection` as well as `data` because a section's content includes the warnings routed to it, the use-raw decision attached to each of those, and the section's own source anchor: all three render inside the panel card and all three change independently of the section's own fields. The use-raw match goes through the canonical `findUseRawDecision` (`components/admin/wizard/step3ReviewSections.tsx:580`) rather than a reimplementation, and the anchor through `SECTION_REGION_MAP` (`lib/admin/step3SectionStatus.ts:53-68`).

`changedSectionIds` diffs over the UNION of both maps' keys, so a section that DISAPPEARED is reported. Results are sorted by registry order so the announcement reads in document order rather than hash order. `freshnessAnnouncement` implements the §4.6 copy table over `changed` intersected with `stillRendered`, and returns the surface sentence when that intersection is empty but `changed` is not.

The hash is TWO independent rolling lanes over the normalized JSON form, joined with the string length. One 32-bit djb2 plus a length had a constructible same-length collision (round-3 review built one: two crew payloads rendering different HTML, hashing identically, which is a MISSED cue). A comment records why it is not `node:crypto`: this module is imported by a client component, and a collision costs one missed cue on content that is already correct on screen.

**Tests D1 through D8** exactly as spec §11.1, built from an RPC-shaped snapshot fed through the real `buildPublishedSectionData`. Never a hand-written `PublishedSectionData` literal: a literal would prove the hash function hashes, not that it isolates a real edit through the real adapter.

Concrete failure each catches:

| Id | Catches |
|---|---|
| D1 | the cue firing on every modal open, because the open-time refresh re-serialises identical content |
| D2 | the cue firing because a row set arrived in a different order |
| D3 | an over-broad projection where one field lands in two sections' hashes, so editing a crew role also lights Contacts |
| D4 | the cue firing on a cron poll that changed nothing, contradicting the Synced readout |
| D5 | a lifecycle toggle leaking into content and lighting every section |
| D6 | a projection that silently drops a section, which would make D3 pass vacuously |
| D7 | cueing a section that is not rendered, so the announcement names something the reader cannot find |
| D8 | spurious cues from guard-condition values (`null`, `undefined`, `[]`, `{}`, nested `NaN`) |
| D2b | a spec asserting one ordering mechanism for row sets that have two: hotels are not adapter-sorted and rely on the RPC |
| D9 | a warn routed to Crew leaving the Crew card silent while only Sheet warnings flashes |
| D10 | a use-raw decision change flashing the wrong card |
| D11 | pack list gaining or losing archived-tab offer cards with no cue |
| D12 | a persisted crew row id swap that changes what the row actions target while reading identically |
| D13 | an anchor move going uncued, and its over-correction of hashing the whole anchor map into every section |
| D14 | a diff that iterates the new map alone and silently drops removals |

D6 and D14 are the anti-tautology partners of D3 and D9: D3 alone passes if the projection returns one entry, and D9 alone passes if the diff never reports removals. D9 through D14 all came from the round-1 review, which probed the routing and found the original own-fields-only projection silently missing five classes of visible change.

**Fixture discipline.** The base snapshot is built once by a helper and deep-cloned per case, so a case that mutates cannot leak into the next. Expected section id lists are derived from `renderedSectionIds` on the fixture, and D13's expectation from `SECTION_REGION_MAP`, never hardcoded.

**Why this task builds its own fixture rather than widening the modal harness's.** The published-modal harness has an RPC-shaped snapshot builder, but it is module-private and carries one crew row, empty `rooms`, `hotel_reservations`, `transportation` and `contacts`, and empty `source_anchors`. D6 needs every section populated, D2b needs two hotel rows, D12 needs two crew rows with swappable ids, and D13 needs real anchors. Widening the harness's builder would change the inputs of every test already using it. So the detector suite owns a richer builder under its own fixtures directory and T4 reuses the harness as-is plus additive opts. Two fixtures with two jobs, not duplication: one exercises the projection across every section, the other exercises the component's state machine through the real pipeline.

Warning routing in both is driven by `blockRef`, which is what lets D9 place a warn inside Crew without touching `crewMembers`; the existing example of that shape is `unknownFieldWarn` at `tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx:37-45`.

**GREEN:** `pnpm vitest run tests/components/admin/review/sectionFreshness.test.ts`.

**Mutation results (run at implementation time, recorded so the anti-tautology claim is evidence rather than assertion).** Six deliberate mutants against the shipped detector, all killed: dropping `previewRoster` from crew, dropping routed warnings, dropping routed decisions, dropping the anchor, dropping `archivedTabOffer`, and deleting the removal half of the union diff. The routed-warnings mutant SURVIVED the first time — adding a warning also grows the routed-decision array from empty to one null, and that incidental signal was carrying D9. D9b was added to hold the warning count fixed and edit the text instead, so only the routed warnings themselves can satisfy it. This is exactly the accidental pass the anti-tautology rule exists to catch, and it was invisible until the mutant ran.

---

## T2 — the normative CSS, DESIGN.md, contrast rows, structural pins

**Touches:** `app/globals.css`, `DESIGN.md`, `tests/styles/status-token-contrast.test.ts`; **creates** `tests/components/admin/review/sectionFreshnessCss.test.ts (new)`.

CSS-only, so it lands before any JS wiring and the structural pins can go RED against an unedited stylesheet.

**RED:** N1 through N6 of spec §11.3 fail against the current `app/globals.css` (no such keyframes) and the current module (no such constant reference in the CSS). C1 through C4 fail only if a token is below floor; they are measured, and if any is below floor the design changes rather than the floor.

Then add the spec §4.5 block verbatim to `app/globals.css`, immediately after the share-link block so the three one-shot flashes read as a family.

Then `DESIGN.md` §5.5 gains the entry in the animation-durations list: name, owning module, both keyframes, the reduced-motion posture, and the four measured ratios, in the shape the `SHARE_LINK_FLASH_MS` entry already uses at `DESIGN.md:295`.

**Anti-tautology note on N2.** Comparing the stylesheet against the spec's fenced block is only meaningful if the fence is located by content rather than by index; the test extracts the fence following the §4.5 heading and asserts the block sits at brace depth zero in `app/globals.css` with an end-of-file balance self-check, mirroring `tests/components/admin/showpage/shareHubFlashTransitions.test.ts`.

**N4 is the load-bearing one.** The `-1` and `-2` keyframes exist solely so `animation-name` changes on a re-arm (spec §4.7). If their bodies drift, one re-arm paints differently from the other and the bug is invisible in every other test. N4 strips the names and compares the remainder byte for byte.

**GREEN:** `pnpm vitest run tests/components/admin/review/sectionFreshnessCss.test.ts tests/styles/status-token-contrast.test.ts`.

N7 and N8 are deferred to T3, where the code they pin exists.

---

## T3 — threading the flashing id set to the panel card

**Touches:** `components/admin/review/ShowReviewSurface.tsx`, `components/admin/wizard/step3ReviewSections.tsx`; **extends** the T2 structural suite `sectionFreshnessCss.test.ts (new)` with N7 and N8.

`ShowReviewSurface` gains one optional prop:

```tsx
freshSectionIds?: ReadonlySet<SectionId>;
```

It is threaded into the per-section chrome value the component already builds, by SPREAD so the field is ABSENT rather than `undefined` under `exactOptionalPropertyTypes`:

```tsx
...(freshSectionIds?.has(s.id) === true ? { freshnessFlash: freshnessAttrValue } : {}),
```

`Step3SectionChrome` gains the matching optional field, and `ModalSectionChrome` spreads the attribute onto the panel-card div under the SAME `chrome.sectionId !== undefined` guard the panel-card testid already uses. The guard is not incidental: the Diagrams sub-block renders this chrome at `headingLevel` four with no `sectionId`, and without the guard a Rooms change would paint two nested flashes.

The alternating value (spec §4.7) is computed in `PublishedReviewModal` and passed alongside the id set, so the surface stays a pure conduit and the restart mechanism has exactly one owner.

**Tests.** N7 pins `SECTION_FRESHNESS_MAX_CUES` as a value and asserts the consuming component imports it rather than repeating a literal. N8 renders the STAGED surface through the wizard's own harness with a fixture that would light every section if the feature were mode-blind, and asserts zero `data-section-freshness-flash` attributes anywhere in the tree. N8 is the blast-radius guard for a shared component and its concrete failure mode is a staged wizard that starts flashing during a re-parse.

**GREEN:** `pnpm vitest run tests/components/admin/review/ tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` plus `pnpm typecheck`.

---

## T4 — the state machine and the announcement region

**Touches:** `components/admin/showpage/PublishedReviewModal.tsx`, `tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx`; **creates** `tests/components/admin/showpage/publishedModalFreshnessCue.test.tsx (new)`.

Implements spec §4.2 verbatim: the memoised signature, the FOUR-branch render-phase adjustment (including the mount-baseline branch that keeps a stale prefetched open from flashing everything that changed while the modal was shut), the per-section arming map with its per-batch timers registered in a ref and cleared only on unmount, the per-section attribute value flip, and the §4.6 announcement region as a key-stable sibling of `StatusStrip` in the shell's `subHeader` slot with `key="freshness-announce"`, its inner text node keyed by batch.

Three details are easy to get subtly wrong and each has a test aimed at it:

- The per-batch expiry effect must NOT return a cleanup, or arming batch N+1 cancels batch N and batch N's cards stay lit forever. What makes that safe rather than leaky is the per-batch replacement: the effect clears any handle already registered for ITS OWN batch before registering the new one, so a double-invoked effect leaves one timer, not two. The unmount-only effect clears whatever is left (S10, which asserts both halves).
- The attribute value flips PER SECTION, read out of that section's own arming entry, not from a global parity counter that would flip a section nobody re-armed (S5, S14).
- The announcement's inner node is keyed by batch, not by text. Reconciling an identical string onto the same node is not a DOM mutation and is silent to a screen reader (S16).

The memo is keyed on the `data` prop identity, not on a serialisation of it, so the stringify cost is paid once per RSC pass. A client-only re-render (the close transition, a nav click, the scroll spy) reuses the same props object and therefore the same memo, which is what makes branch 1 of the state machine reachable at all.

**Tests S1 through S17** exactly as spec §11.2, on the existing harness, mirroring `tests/components/admin/showpage/shareHubFlashState.test.tsx`.

The harness fits without redesign and that was verified rather than assumed: a `publishedModalElement` export exists precisely so a test can drive live transitions through RTL `rerender` (`tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx:149`), and `baseProps` builds `data` and `bySection` from raw rows through the REAL adapter and the REAL warning model (`tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx:99-106`). Re-rendering with different raw rows is therefore a genuine content delta through the production pipeline, not a poked prop, which is what keeps S3 and S14 from being tautologies.

**One harness extension is required and this task owns it.** `HarnessOpts` (`tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx:93-97`) exposes only `ignoredFingerprints`, `attentionItems` and `alertsDegraded`; `lastSyncedAt`, `lastCheckedAt` and `lastSyncStatus` are hardcoded in `baseProps`. The component-level twin of D4, a refresh that moves only the sync stamps, cannot be expressed without overrides, so `HarnessOpts` gains them as optional fields with the current values as defaults. Additive and default-preserving, so no existing test changes.

**Transition audit** (mandatory per `docs/agents/writing-plans.md:9`). The spec's §6 inventory is the checklist. Every conditional render and every ternary in the changed region is enumerated and each is either covered by an S-row or is explicitly instant:

| Site | Treatment |
|---|---|
| the attribute spread on the panel card | animated, S3 / S4 / S5 |
| the announcement region's text swap | instant by design, and S11 asserts the region itself never unmounts, because a region that mounts with its text is unreliably announced |
| the expiry timer | S4 at the boundary and S4 at boundary-minus-one |
| a re-arm inside the window | S5, the compound case the alternating value exists for |
| a content-equal refresh mid-flash | S6, the branch-3 compound case |
| a DIFFERENT section changing mid-flash | S14, and it asserts the first card is NOT truncated |
| the announcement region's child remount on a repeat | S16, asserted by node identity because text equality holds in both the working and the broken implementation |
| crossing the cap from rest | S7 |
| crossing the cap from a LIVE cue | S15 |
| unmount mid-flash | S10 |

S13 covers the sub-block case from T3 at the component level. S14 through S17 came from the round-1 review and each closes a state the earlier table left unfalsifiable: a different section changing mid-flash, an under-cap cue crossing to over-cap, a repeat cue with identical copy, and a section that disappears.

**Anti-tautology.** S3 clones the rendered tree and removes the announcement region before counting attribute-bearing nodes, so it cannot pass on the region's own text. S9 captures a DOM node reference before the change and asserts identity after, which is the only assertion that distinguishes reconcile from remount. Expected section ids come from the fixture through the real detector, never hardcoded.

**GREEN:** `pnpm vitest run tests/components/admin/showpage/publishedModalFreshnessCue.test.tsx`.

---

## T5 — real-browser dimension assertion

**Touches:** `tests/e2e/admin-layout-dimensions.spec.ts`, `.github/workflows/phantom-gap-e2e.yml`.

Mandatory per `docs/agents/writing-plans.md:8`, and pointed at spec §7's dimensional invariants:

- the panel card's `getBoundingClientRect()` width and height are unchanged, to 0.5px, between attribute-absent and attribute-present;
- the same holds after expiry;
- the scroll container's `scrollHeight` is unchanged across both.

jsdom cannot make this claim: it computes no layout, so a `border`-based implementation that shifted every card by 2px would pass every unit test in T2 through T4. That is the concrete failure mode this task catches.

**CI wiring is NOT free here, and the plan was wrong about it before this pass.** `tests/e2e/admin-layout-dimensions.spec.ts` is matched by a playwright project and IS referenced by `.github/workflows/phantom-gap-e2e.yml`, but only through two grep-filtered steps: `-g "T-NOPHANTOM"` at `.github/workflows/phantom-gap-e2e.yml:173` and `-g "width chain"` at `.github/workflows/phantom-gap-e2e.yml:183`. A new case whose title matches neither runs NOWHERE in CI, which is the exact failure that workflow's own header comment documents at `.github/workflows/phantom-gap-e2e.yml:16-21` and that its second step exists to avoid. The spec-granularity coverage guard cannot see it, because the spec is wired.

So this task ALSO adds a third run step to that workflow, filtered on the new cases' title tag, and does not rely on the added cases being picked up implicitly. That workflow already path-filters on the broad components glob and on the stylesheet, so every file this diff touches triggers it and no path filter changes. Verification for the claim is a real run, not a reading: the workflow carries `workflow_dispatch`, or gains it, so close-out can fire it with `gh workflow run` rather than waiting for the next PR event.

**Harness readiness** (mandatory per `docs/agents/writing-plans.md:23`): the spec's existing boot mechanism and readiness gate are reused unchanged, never `networkidle` alone. The attribute is applied through a test-only hook that sets it directly on the card rather than by driving a broadcast, because this task measures geometry, not the detector; T6 is what proves the detector drives it.

**GREEN:** the spec's existing run command, scoped to the added cases, plus the new workflow step present and grep-matching them.

---

## T6 — e2e coverage of a real broadcast

**Touches:** `tests/e2e/published-review-modal.realtime.spec.ts`.

Adds E1 and E2 from spec §11.6 to the spec that already drives a real broadcast through `publish_show_invalidation`, behind the same skip gate, already wired into the `playwright` run line at `.github/workflows/published-modal-e2e.yml:149`.

- **E1** writes a change to exactly one section, sends the broadcast, and asserts the matching panel card wears the attribute while no other card does, then that it is gone after the flash duration.
- **E2** sends a broadcast with no content change and asserts no card ever wears it.

**Detach-safety and the sampling problem.** E2 cannot be a poll: checking the DOM after the fact cannot distinguish "never armed" from "armed and already expired", so E2 would pass against a completely broken implementation. It arms a `MutationObserver` on the content pane BEFORE sending the broadcast, records every attribute mutation, and asserts the record is empty. The observer is disconnected in a `finally`, so a sampler cannot outlive its element and hang Playwright's auto-wait. E1 uses the same observer to capture the arming moment rather than racing it.

Run `pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts` in this task to prove the no-new-wiring claim rather than assume it.

**GREEN:** `MODAL_REALTIME_E2E=1` plus the spec's existing run line, scoped to the added cases.

---

## T7 — backlog graduation

**Touches:** `BACKLOG.md`, `BACKLOG-archive.md`.

Moves the whole `BL-MODAL-REALTIME-UPDATED-CUE` entry to `BACKLOG-archive.md` at its terminal state, carrying (a) the corrected premise from spec §1.1 R1, replacing the entry's false "the spec ratifies the silent-by-design posture" sentence, and (b) the user's decision as the record of why it shipped. The IN PROGRESS marker leaves with it, which invariant 12 requires by construction since archives may not hold in-flight work.

Adds a new leading segment to the `Last reconciled:` line at the top of `BACKLOG.md`. **A rebase conflict on that line is expected** because sibling panes edit it; resolve by keeping BOTH sides, since the entries are disjoint and the line concatenates.

**GREEN:** `pnpm vitest run tests/docs/`.

---

## 11. Verification

Full local gate before the whole-diff review: `pnpm typecheck`, `pnpm lint`, `pnpm vitest run`, then the two e2e run lines above. Real CI green is a separate gate from local green and is required before merge.

## 12. Invariant-8 closeout

Both halves of the invariant-8 dual gate ran on this diff: `/impeccable critique` and `/impeccable audit`, with the canonical v3 setup gates (the skill's context load over PRODUCT.md and DESIGN.md, then the **product** register reference, since this is app UI).

**Provenance.** Assessment A (design review) and Assessment B (detector plus mechanical evidence) each ran as its OWN isolated sub-agent, neither able to see the other's output. They ran sequentially rather than concurrently, which the reference permits and in fact requires in one direction: Assessment A must finish before detector findings reach the synthesis context, so judgment is not anchored by deterministic output. No degradation banner applies; sub-agents were used for both.

**Findings and dispositions.**

| # | Tier | Finding | Disposition |
|---|---|---|---|
| 1 | P1 | The accent-tint wash overspends the accent. PRODUCT.md reserves orange for "this matters now" and spends it sparingly; a background reconcile is informational, and a full-card wash on a 390px phone can be the entire viewport. | **FIXED.** The wash is gone; the cue is the outline alone. |
| 2 | P1 | The wash was occluded unevenly. Cards hold opaque children, so a sparse section washed fully while a dense one showed colour only in the gaps, making the SAME event read at very different loudness. | **FIXED** by the same change. The outline renders identically on every card. |
| 3 | P1 | Over the cap the cue inverted its own signal: the largest possible change produced no visual evidence at all, so a sighted reader learned nothing precisely when the most had moved, while a screen reader still heard the surface sentence. | **FIXED.** The sub-header band now carries a calm whole-surface cue over the cap, which is the visual equivalent of the sentence. |
| 4 | P2 | `joinLabels` produced "Crew, Rooms & scope and Hotels" because a registry label can itself contain an ampersand, so the list read as four items rather than three. | **FIXED.** Commas only, no trailing conjunction. |
| 5 | P2 | The orange outline stacks outside a flagged card's `border-strong`, giving two concentric strokes. | **ACCEPTED, not deferred.** They are different weights in different tones and read as border-plus-marker rather than an artifact; the outline is transient by construction. Revisit if a flagged section is ever cued in practice and it reads wrong. |
| 6 | P2 | Prettier failed on 7 files. | **FIXED.** `prettier --write` over the whole diff; `--check` now clean. |
| 7 | **P0** | The audit half caught that my own CSS block replacement had TRUNCATED `app/globals.css`, deleting the whole `@layer base` `.help-prose` block. `/help` would have lost heading scale, list markers, link underlines and its measure. Proven executable, not inferred: `tests/help/help-prose-layer.test.ts` failed 2 of 5. | **FIXED.** Restored from HEAD and the swap re-applied surgically; the file is back to 1198 lines with `help-prose` present, and the help suite passes. This is the single most valuable thing either gate produced, and it was found by the half I nearly skipped. |
| 8 | P2 | `attentionBySection` keyed its memo on the raw `attentionItems` prop, but the grouping is built from `actionable`, which also folds in locally resolved ids. A local resolve changed the real grouping without recomputing, and the next unrelated refresh reported that stale delta as a change and cued a section whose server content had not moved. | **FIXED.** Keyed on `actionable`. `effectiveSectionId` is deliberately excluded: it is a fresh closure per render, and including it recomputed the map every render, which consumed the mount baseline on the first one. |
| 9 | P2 | A sighted `prefers-reduced-motion` user now gets NO signal at all, since the outline is the whole cue and reduced motion removes it. The share-link precedent had a secondary cue; here it is the feature. | **ACCEPTED with the reasoning stated.** A one-shot signal has no correct steady state, which is the ratified posture (R5), and a permanent outline would assert something no longer true. The announcement carries it. Filed as a documented limit in the spec rather than silently accepted. |
| 10 | — | Detector reported one `broken-image` warning at `components/admin/wizard/step3ReviewSections.tsx`. | **NOT INTRODUCED BY THIS DIFF.** Pre-existing `DiagramTile` raw `<img>`, comment-documented as a deliberate revert. Untouched. |

Assessment B verified independently: the reduced-motion override sets both `animation: none` and `outline-color: transparent`; the two keyframe bodies are byte-identical apart from their names; the CSS durations match the JS constant; the diff adds no interactive element, so the 44px floor has no new surface; the announcement copy carries no em dash and no apostrophe; and the outline is not clipped on either axis, with 20px of `tile-pad` clearance against a 2px outline.

Assessment A's remaining P2/P3 observations (no replay of a missed cue, no jump-to-changed affordance, nothing that teaches the cue on first encounter) are real and out of scope for a one-shot transition signal. They are the shape of a persistent change-record feature, not a defect in this one, and are not deferred rows because nothing here promises them.

**Post-gate CI finding, recorded here because it belongs to the same story.** The freshness-geometry case this plan added FAILED in real CI on `armed: top moved`, while the outline was doing nothing at all: the modal is Suspense-streamed, so sections above the measured card were still arriving between the baseline and the armed sample. The readiness ladder stopped at "one section is attached", which does not imply the column has stopped growing; it now polls until the card's top and the pane's `scrollHeight` are both unchanged across consecutive samples.

Worth stating plainly: this is the local-passes-CI-fails class, and it is the exact reason T5 shipped its own workflow step instead of trusting a spec-granularity coverage guard. Without that step the case would have run nowhere, the harness defect would have stayed invisible, and the geometry claim would have been decorative.

impeccable-gate: critique=RAN audit=RAN p0=1 p1=3 dispositions=recorded

**Why the gate was not re-run after the round-3 and round-4 sweeps.** Invariant 8
scopes the dual gate to UI surfaces, and "any file under `components/`" is one of
its triggers, so the question is fair and worth answering here rather than
leaving a later reviewer to re-derive it. The sweep's only `components/` file is
`components/admin/review/sectionFreshness.ts`, and it renders nothing: a `.ts`
module, no React import, no JSX, no `"use client"`. Everything else in those
commits is a test, a test fixture, or this plan and the spec. `app/globals.css`
— the file that actually carries the cue's paint — is byte-identical to what the
gate reviewed, and `N2` pins it against the spec's normative block, so a silent
drift there is not possible. No rendered output, no token, and no class changed,
so there is nothing for a visual critique or an accessibility audit to see that
they did not already see.

Round 4 touched one MORE file under `components/`, and it is a real rendering
component, so it is named rather than folded into the sentence above:
`components/admin/review/AttentionBanner.tsx`. `FAILED_KEYS_CAP` and
`usableFailedKeys` moved to `components/admin/review/attentionBannerPaint.ts`
and are re-imported, so the detector applies the SAME cap and the SAME
key-dropping the banner renders under instead of re-typing either. No JSX, no
class, no token, no copy, and no control flow moved.

Round 5 does the same thing twice more, for the same reason, and the same
disposition holds. `components/crew/AgendaScheduleBlock.tsx` gives up its
private `driftNote`, and `components/admin/wizard/step3ReviewSections.tsx` its
private `agendaOverflowNotes`; both move VERBATIM to the React-free
`lib/agenda/agendaPaint.ts` and are re-imported at their original call sites.
The detector now calls the shipped derivation rather than a second copy of it —
which is the whole finding that forced round 5, since a re-typed derivation is
what let the agenda projection hash a raw drift string the renderer never
paints. Each function's body is unchanged character for character; what moved is
the file it lives in.

A critique looks at what a surface shows and an audit at how it behaves.
Across rounds 4 and 5 the rendered output of every one of these components is
byte-identical before and after — the extractions are provably paint-neutral,
and the component tests over both files pass untouched. Neither gate has new
material to evaluate.
