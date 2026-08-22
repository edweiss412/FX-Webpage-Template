# Control-outline forward guard: the signal decision, and what ships

**Ledger row:** `BL-CONTROL-OUTLINE-FORWARD-GUARD` (`BACKLOG.md`, heading `## BL-CONTROL-OUTLINE-FORWARD-GUARD`). Severity LOW, effort L as filed.
**Branch:** `docs/control-outline-forward-guard`. This arc delivers a spec and a plan; a separate implementation pane executes the plan.
**Predecessors:** `docs/superpowers/specs/2026-08-16-control-outline-surface-fills-design.md` §5.2 and §6 (the kill and the filing), `docs/superpowers/specs/2026-08-18-control-outline-border-token-design.md` (the `border-border` ruling, "No forward guard" at its §6), `docs/review-rounds/fix/control-outline-surface-fills/119895a7c756.md` (the eight spec rounds that produced the five-escape table).

This spec is the row's "first scheduled step" executed: decide whether a forward guard needs a signal `scanInteractiveElements` does not produce. §1 is that decision and is the whole spec; §§2 to 7 are what follows from it.

---

## 1. The signal decision

### 1.0 The question, as the row states it

> decide whether the guard needs a signal the scanner does not currently produce — a rendered-structure or effective-paint input, e.g. a real-browser computed-style pass over a seeded admin route — rather than a sixth predicate over the same projection. If the answer is no, close this entry as a documented limit instead of attempting a sixth mechanism.

Three outcomes were argued, not two. The orchestrator ruled (2026-08-21, `bl-orch`, after reading the §1.4.3 probe) that a third outcome is admissible on one condition: the mechanism must be shown to be a different class from the five recognizers, with the burden on this spec, and every outcome's losing side must state its failure mode. §1.2, §1.3 and §1.4 are the three; §1.7 is the decision.

### 1.1 Resolved scope, do not relitigate

| Decision | Where ratified |
| --- | --- |
| The five escapes are CLOSED. No review round re-attempts the accent-branch predicate, the existential ON/OFF predicate, the universal accept-set, exactness-as-cascade, or the file registry. | `BACKLOG.md` row table (the five rows under "The forward guard was attempted in five forms"); `2026-08-16` spec §5.2 |
| No sixth predicate over the scanner's projection that DECIDES structure. A static mechanism is admissible only if §1.4.2 carries its burden. | `BACKLOG.md` row, paragraph beginning "The reason, stated once" |
| Switch tracks keep their recipe in both states and their OFF ring is a documented limit at 1.43:1 light / 1.75:1 dark. A guard does not move them and does not decide what a switch track is. | `DESIGN.md` §1.2a, paragraph "Two families are OUT" (ruled 2026-08-16) |
| Dividers are OUT in both directions; nobody widens the carve-out into a claim about which elements are "really" controls. | `DESIGN.md` §1.2a, paragraph "Dividers are OUT, in both directions" |
| Text-entry fields and outlines painted on a nested child are outside the element-level cover in both directions and are owned by `BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER`. This spec does not widen the scanner's element vocabulary. | `BACKLOG.md` heading `## BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER`; `2026-08-16` spec §3.2 |
| ShareHub's two `max-sm:border-border` elements are fenced by a ratified decision and a shipped pin; they are recorded, not repaired. | `BACKLOG.md` heading `## BL-CONTROL-OUTLINE-SHAREHUB-MOBILE-SKIN-WEIGHT`; `tests/styles/_metaControlOutlineFill.test.ts`, case "keeps max-sm:border-border on BOTH ShareHub ternary arms" |
| The 57-row swap pin and the 13-element unresolved-pool equality stay exactly as shipped. This spec adds beside them and deletes nothing from them. | `tests/styles/_metaControlOutlineFill.test.ts`, cases "holds exactly 57 rows" and "leaves the scanner's unresolved pool at 13" |
| No file under `app/` or `components/` changes. The deliverable is a guard surface. If the guard needed a UI edit the design would be wrong. | Kickoff brief for `arc-ctloutline`, 2026-08-21, "Hard constraints" (briefs live outside the repository, under the worktrees root) |
| Threat fence: accidental authoring by an ordinary contributor. Adversarial obfuscation files to documented limits. | §7 of this spec; same fence as the `2026-08-18` spec §6 "THREAT FENCE" |
| Round cap 4 per stage; two consecutive same-axis single-finding rounds are an orchestrator disposition call. | Kickoff brief; batch-3 common brief §5 (same location) |

### 1.1.1 Self-review sections that are N/A here, and why

- Dimensional invariants, transition inventory, mode boundaries, rendered-vs-conceptual: no component is created or changed. §8 and §9 below say so in one line each so the reviewer does not look for them.
- Tier × domain matrix, CHECK/enum matrix, flag lifecycle: no database, no config flag.
- Cap/truncation: the only list is the residue census, and its growth is the subject of §1.6.

### 1.2 Outcome A: a rendered-structure / effective-paint signal

**What it would be.** A real-browser pass that mounts controls, reads `getComputedStyle(el).borderColor` and `backgroundColor`, walks ancestors to the first opaque ground, and computes the outline ratio in both themes. The machinery exists in pieces: the standalone harness (`tests/e2e/standalone.config.ts`), a live-entry bundle that mounts REAL components (`tests/e2e/_tapTargetFloorLiveEntry.tsx`, header "LIVE ENTRY, NOT TRANSCRIBED MARKUP"), `getComputedStyle` reads in `tests/e2e/tap-target-floor.layout.spec.ts` (the `transitionDuration` and `color` helpers), and a browser-mutant registry that can score a Playwright surface with hand-enumerated mutants (`tests/mutation/browser/registry.ts`, type `BrowserGuardSurface`).

**What it would settle.** Exactly the two halves the five escapes could not see. Effective paint: which of two tokens on one branch wins is read off the engine instead of inferred (closes the R2/R3 shape). Rendered structure: an outline painted on a nested `<span>` is measured where it paints (closes the R5 shape, and would reach `BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER` family B).

**Why it loses, with the failure mode stated so it is not re-argued.**

1. **Its population is enumerated or state-bound, so it fails OPEN on exactly the input the row names.** The row's ambition is "a future arc adds a NEW control at `border-border-strong`". A live entry mounts the components its author listed, with the props its author chose: `_tapTargetFloorLiveEntry.tsx` says of itself "EVERY MOUNT CARRIES THE STATE THAT MAKES ITS <summary> EXIST". A seeded-route pass (`playwright.config.ts`, `webServer` block; single worker, seeded Supabase) sees what that seed renders in that state: closed menus, unopened modals, conditional branches off. A new control added anywhere outside the mounted or rendered set is absent from the measurement and the suite stays green. The static scanner sees 362 elements across every render alternative today (§1.4.3); no browser pass sees a population it did not enumerate. An enumerated cover is the shape `AGENTS.md`'s class-sweep rule forbids, and here the enumeration's gap is the whole claim.
2. **The exemption question survives into the rendered domain unchanged.** The switch tracks are exempt BY RULING (`DESIGN.md` §1.2a), not by any measurable property: in a browser their OFF ring measures 1.43:1 and fails the same 3:1 floor every other control is held to. A rendered pass still needs to know which measured element is a track. Keying that on `role="switch"` or on a two-state render (background differs between the ON and OFF mounts) is a recognizer over a new projection, and the first ordinary edit that breaks it is already in the repository: `components/admin/telemetry/AutoRefreshControl.tsx` paints its track on a 34×20 `<span>` inside a 44×44 `<button>`, so "the outline on the child whose box equals the control's box" is false for a live track. Outcome A relocates the five-round classification problem; it does not remove it.
3. **Cost against a LOW row.** The first browser-mutant surface runs 20 to 30 minutes nightly, off the merge path, not a required check (`.github/workflows/mutation-browser.yml` header; `2026-08-15-mutation-browser-mode.md` §8, "Runtime is minutes, not seconds"). Every mutant is a hand-written component edit. A Playwright surface is enrolable only in that mode; the source-mutation registry cannot express it (`2026-08-09-quick-wins-2-mech.md` §2.4, the tap-target re-disposition). The row is severity LOW with zero shipped defects and a clean population today (§1.4.3). A nightly 25-minute gate that fails open on the new control is the wrong purchase.

**What A buys that nothing else does, recorded rather than dropped.** Measured effective paint of the residue elements themselves: a track whose OFF fill drifted from `bg-surface-sunken` to `bg-surface` would be caught by A as a ratio moving from 1.43 to 1.59, while C (§1.4) catches it as a content change and relies on a human to re-record the ratio. That difference is a documented limit of C (§6, "effective paint is frozen, not measured"), not an argument for A.

### 1.3 Outcome B: close the row as a documented limit

**What it delivers.** Honesty at zero cost. The row's own analysis already says where a sixth static predicate ends, and the two predecessor specs already record, in their limits sections, that no forward guard ships. Closing the row adds a paragraph to `DESIGN.md` §1.2a saying the population is kept correct by the invariant-8 gate and by the census re-run a future outline arc performs, and archives the row.

**What it leaves open, stated as the failure mode.** A contributor who copies an old recipe (`border border-border-strong bg-surface`, which twenty-one elements carried until 2026-08-16) ships a 1.59:1 resting outline, and the only signal is the impeccable dual gate's judgment half on that PR. That gate measured this exact class once already as a P1 on a different element (`DESIGN.md` §1.2a, "What did not move with the 21"), so it is a real signal, not a fiction. The cost of the miss is a single control at the pre-ruling weight until someone re-runs the census. That is why the row is LOW.

**When B wins.** B is the correct close if C cannot carry its burden (§1.4.2), or if C's standing cost (§1.6) turns out higher than the severity justifies. Both conditions are stated with numbers so a later reader can check them rather than re-argue them.

### 1.4 Outcome C: a content-keyed, reasons-required residue census

#### 1.4.1 The mechanism

The derived population is the one the two predecessor arcs already use: every element `scanInteractiveElements` admits (`tests/styles/interactiveScanCore.ts`, `isInScope`: `button`, `a`, `summary`, `Link`, the allowlisted floor component, `<input type="checkbox"|"radio">`, `role="button"`, any element with `onClick`).

An element is **residue** when any readable class string, on any render alternative, carries a **weak outline token**: a utility whose final segment is exactly `border-border` or `border-border-strong`, under any variant chain (`focus:`, `max-sm:`, `hover:`, `aria-expanded:`, `before:`, …). Two tokens, named; everything else is outside the accept-set (§6). `unresolved` does not exempt: an unresolved element whose readable strings carry a weak token is residue like any other, because the unread span can only add paint, never remove the token already seen.

The guard asserts one relation: **the multiset of residue elements, keyed by content, equals the registered census.** The key is `(file, tag, paint projection)`, where the paint projection of a render alternative is its ordered list of tokens whose utility (after any variant chain) begins with `border` or `bg-`, and the element's key carries the projection of every alternative, sorted. No line number is part of the key. A row is a registered residue element plus a category and a reason, and the form of both is validated mechanically (§1.5).

Three consequences, each the thing a predecessor escape exploited:

- **A new weak-outline element anywhere in the cover is a new key.** Set inequality; the suite reds naming the element and prints a paste-ready row.
- **Any change to a registered element's outline or fill tokens is a new key.** The row is stale; the suite reds naming the old row and the new key. Re-registering requires editing the row's paint strings AND its reason, and the reason's form is category-bound (§1.5).
- **A registered element whose token set is unchanged but whose padding, gap, or ring changed is the same key.** No re-pin. The cost of the guard lands only on edits to the tokens it is about.

Nothing in the mechanism asks whether an element is a switch track, a divider, or a control. It asks whether the set of weak-outline carriers changed, and when it did, it demands a human reason in a form a test can check.

#### 1.4.2 Burden of proof: why this is not the sixth member of the family

The row states the family's defining move: "every mechanism above tried to recover structure from that projection". Here is each of the five beside C, on the one axis that matters, what the mechanism DECIDES:

| Mechanism | What it decided from class strings | How it was escaped |
| --- | --- | --- |
| draft: some branch carries `border-accent-edge` | "this element is a track" (by a token the tracks happen to share) | a track's OFF fill moved; the token was also on non-toggles |
| R1: has an ON branch AND an OFF branch | "this element is a track" (by branch existence) | a third branch appended |
| R2: EVERY branch is an ON or an OFF | "this element is a track" (by branch membership) | a branch that INCLUDES the recipe plus a winning token |
| R3: exactness | "this branch's effective paint is the OFF recipe" | deciding which of two paint tokens wins is the cascade |
| R5: five-row FILE registry | "this element is exempt" (by file membership) | a new element in a registered file |
| **C** | **nothing about structure or paint. It decides whether the residue set changed.** | see §1.4.3: every escape is a set change |

The shape is the one this repository already ships for the tap-target floor: `tests/styles/tapTargetCensus.ts` (header: "A row here does NOT mean 'this control is too small'. It means the STATIC scanner could not prove a ≥ 44px height from the class string, and a human wrote down why that is acceptable ... The alternative to a row is a named suite failure, never a silent pass") with `tests/styles/_metaTapTargetFloor.test.ts` asserting equality in both directions (no unregistered unclear element; no stale row). That guard shipped under the `2026-08-14-ui-interactive-token-policy-design.md` spec, whose §5.3 names the pattern "reasons-required census, fail-by-default". C is that pattern applied to the weak-outline carriers, with two refinements taken from this batch's lessons: the key is content rather than a line number (a line number converts drift detection into a re-pin ritual; the browser-mutant registry's `from`-anchored ids are the in-repo precedent for content keys, `tests/mutation/browser/registry.ts`, `browserSiteId` comment "CONTENT-anchored, not positional"), and the exemption is keyed at the same granularity as the thing it exempts (one element and its exact paint tokens, never a file).

The `2026-08-16` spec's own note for the next arc is the boundary C stays inside: "a predicate over Tailwind class strings can decide token PRESENCE soundly and cannot decide EFFECTIVE PAINT soundly". C decides presence and set equality. Where it needs a paint claim (a switch-track row's recorded OFF ratio), it refuses ambiguity instead of resolving it (§1.5: a track row whose path carries two fill tokens is rejected at validation, not evaluated).

What a reviewer can still say, and the answer fixed in advance: "the residue set is a denylist in disguise." It is not: a denylist exempts what it lists; this census REPORTS what it lists and requires each listed member to carry a reason whose form is checked. The measured failure direction of a denylist is silence on the unlisted; the failure direction of this census is a red on the unlisted (§1.5 for what happens at the cheapest green).

#### 1.4.3 The evidence: five escapes executed, not argued

Probe run 2026-08-21 on `docs/control-outline-forward-guard` at `00beaf19e` (main `0ba72c237` plus the ledger marker), with a prototype of §1.4.1 (`residue(root)` keyed on `(file, tag, sorted paths)`; the shipped key projects each path to its paint tokens, which only removes non-paint tokens from the key and cannot turn any of the reds below green, since every mutant below changes a `border`/`bg-` token). The corpus was copied to a scratch root (`app`, `components`, `lib`, `tsconfig.json`) and each mutant applied to its own copy; the scanner caches parsed files by absolute path (`interactiveScanCore.ts`, `sourceCache`), so one reused root returns the first mutant's result for every later one, which the first run of this probe did and which its per-mutant diff line exposed.

```
baseline residue rows: 12 (multiset total 12)
baseline file registry: [PublishedToggle.tsx, AutoPublishToggle.tsx, NotifyToggle.tsx]

[draft: move a track's OFF fill to bg-surface]
  candidate (content-keyed residue census): RED  new rows: ["PublishedToggle.tsx border border-accent-edge bg-accent || border border-border-strong bg-surface"]
  R5 file registry:                          GREEN
[R1 F2: append a third branch border-border-strong bg-surface]
  candidate: RED  new rows: ["PublishedToggle.tsx ... bg-accent || border border-border-strong bg-surface || border border-border-strong bg-surface-sunken"]
  R5 file registry:                          GREEN
[R2 F1: tokens-include: OFF branch gains bg-warning-bg]
  candidate: RED  new rows: ["PublishedToggle.tsx ... || border border-border-strong bg-surface-sunken bg-warning-bg"]
  R5 file registry:                          GREEN
[R5 F1: track moves to a nested span; outer control becomes plain border-border-strong bg-surface]
  candidate: RED  new rows: ["PublishedToggle.tsx border border-border-strong bg-surface"]
  R5 file registry:                          GREEN
[NEW CONTROL: a contributor adds a button at border-border-strong bg-surface]
  candidate: RED  new rows: ["UnignoreButton.tsx border border-border-strong bg-surface"]
  R5 file registry:                          RED

no-defect baseline equal: true
ALL FIVE RED under candidate: true
```

R3 is not a separate mutant: it is the property of the R2 mechanism that exactness requires the cascade, and the R2 input covers it. The file-registry column is the distinctness proof: the mechanism the table killed at R5 stays GREEN on all four escape mutants, exactly as the table says, and reds only on the new control. Each candidate red differs per mutant and names the asserted change, so each failed for the asserted reason.

Population facts from the same run, on the live corpus:

```
universe 362   unresolved 13   residue 12   distinct content keys 12   residue that is unresolved 0
components/admin/PublishedToggle.tsx:292            button   paths=2  ["border-border-strong"]
components/admin/settings/AutoPublishToggle.tsx:123 button   paths=2  ["border-border-strong"]
components/admin/settings/NotifyToggle.tsx:131      button   paths=2  ["border-border-strong"]
components/admin/BellPanel.tsx:1213                 a        paths=1  ["border-border"]
components/admin/RecentAutoAppliedStrip.tsx:447     button   paths=2  ["border-border"]
components/admin/showpage/AttentionMenu.tsx:189     button   paths=1  ["border-border"]
components/admin/telemetry/EventFilters.tsx:85      button   paths=4  ["border-border"]
components/crew/primitives/KeyTimesStrip.tsx:191    summary  paths=1  ["border-border"]
components/admin/showpage/ShareHub.tsx:781          button   paths=4  ["max-sm:border-border"]
components/admin/showpage/ShareHub.tsx:817          button   paths=4  ["max-sm:border-border"]
app/help/errors/page.tsx:70                         a        paths=1  ["focus:border-border-strong"]
app/help/layout.tsx:50                              a        paths=1  ["focus:border-border-strong"]
```

Line numbers above are drafting-time locators only; the census keys on content. The twelve are the three cover-visible switch tracks, the five dividers the `2026-08-18` arc already excludes by name, ShareHub's two fenced elements, and two skip links whose weak token is focus-only chrome (`app/help/layout.tsx`, comment "WCAG 2.4.1 ... Visually hidden until focused"). The population is clean: nothing rests at a weak outline that the two rulings did not already name.

The five mutants ship in the suite as its acceptance floor (§5), so the table above is red-then-green under the shipped mechanism and not only under the prototype.

### 1.5 C's own failure direction, and the reason bar

Per the batch's guard-authoring rule (ask what the cheapest edit that satisfies the guard is, and whether it ever destroys evidence):

| Red | Cheapest green | Is it evidence-destruction? |
| --- | --- | --- |
| a new weak-outline element | swap the token to `border-text-faint` (the ruling), OR add a row | no; a row must carry a category whose form is checkable, and three of five categories require a ledger ref that must exist |
| a registered element's paint tokens changed | update the row's paint strings and its reason | no; the row's category bar re-runs on the new strings (a `switch-track` row must still have exactly two paths, each with exactly one fill and one outline token) |
| a registered element disappeared (file deleted, element removed, token removed) | delete the row | correct: the residue shrank and the record follows it |

The residual hazard is the one the batch named: a lazy reason row. The guard therefore demands a FORM, not prose, and validates it:

| Category | Mechanical bar (`validateRow`) | Ledger ref |
| --- | --- | --- |
| `switch-track` | exactly two render alternatives; each alternative's projection carries exactly one fill token and exactly one outline-colour token, where a fill token is `bg-<c>` and an outline-colour token is `border-<c>` for a `<c>` such that `--color-<c>` is declared in `app/globals.css` (derived from the stylesheet, so `border`, `border-t` and `border-2` are neither); reason cites `DESIGN.md §1.2a`; reason carries the OFF ring's recorded ratio `n.nn:1 light / n.nn:1 dark`, and the suite RECOMPUTES that ratio from the two tokens against `app/globals.css` runtime values and asserts it within 0.01 | none |
| `side-divider` | every alternative that carries the weak token also carries a side utility `border-t`, `border-b`, `border-l` or `border-r` (with the same variant chain as the weak token, or none); reason names that utility | none |
| `focus-state-chrome` | every weak token in the key carries a `focus:` or `focus-visible:` variant; reason states what carries the focus indication instead (for the two skip links, the `focus-visible:ring-*` tokens, which must be present in the same alternative) | none |
| `responsive-skin-filed` | every weak token carries a `max-*:` or `sm:`-family responsive variant; `backlogRef` required and must resolve to a heading in `BACKLOG.md` or `DEFERRED.md` | required |
| `filed-defect` | `backlogRef` required and must resolve; reason is non-blank | required |

The category set is closed and default-denied: a row with any other category fails validation. A `filed-defect` row is the only way to register a genuine weak resting outline, and it costs a ledger entry that the 2026-08-04 filing bar and the 2026-08-18 mint bar then govern, which is exactly where a design decision about a new weak-outline control belongs.

Recomputing the `switch-track` ratio is the one place a number in a reason is derived rather than typed. It is sound here and not in general for the reason R3 gave: a path with exactly one fill and one outline token has no cascade to resolve. A path with two fill tokens is refused at validation with the R2 shape named in the message. That refusal, not an evaluator, is the guard's answer to "tokens include is not tokens are".

### 1.6 Pricing the new-member workflow against LOW severity

**Who pays, and when.** The author of the PR that adds a weak-outline interactive element, or changes the outline or fill tokens of a registered one, at the moment the suite reds. The failure message prints the row to paste (file, tag, paint strings) and the five categories with their bars; the author supplies category and reason. A `filed-defect` row additionally costs a ledger entry.

**How often, measured.** The last change to each residue element's weak-token fragment (`git log -1 -S'<fragment>' -- <file>`, run 2026-08-21):

```
2026-07-17  PublishedToggle.tsx           border-border-strong bg-surface-sunken
2026-06-02  AutoPublishToggle.tsx         border-border-strong bg-surface-sunken
2026-06-02  NotifyToggle.tsx              border-border-strong bg-surface-sunken
2026-07-06  BellPanel.tsx                 border-t border-border pt-3
2026-08-15  RecentAutoAppliedStrip.tsx    border-border
2026-07-24  AttentionMenu.tsx             border-b border-border
2026-07-24  ShareHub.tsx                  max-sm:border-border
2026-07-06  EventFilters.tsx              border-l border-border
2026-07-17  KeyTimesStrip.tsx             border-t border-border
2026-08-15  app/help/errors/page.tsx      focus:border-border-strong
2026-06-10  app/help/layout.tsx           focus:border-border-strong
```

Eight of the eleven fragments last moved in the sixty days before this spec, several of them births rather than edits. Read as a rate, that is roughly one row event per week across the whole residue, each costing one paste-and-reason edit. That is the standing cost of C. Set against it: C's red fires on exactly the class of edit (a weak outline appearing or changing) that the two rulings say must be a deliberate design event, so the row edit is not overhead on top of the intended review, it IS the intended review made unskippable.

**When this cost argues for B instead.** If the residue grows past the point where a reviewer stops reading rows, the census has become a ritual and B is the honest close. The threshold is stated so it can be checked: if the census holds more than thirty residue entries, or if more than eight entries were added or re-keyed in any rolling thirty-day window (`git log --since=<date> -- tests/styles/controlOutlineResidue.ts` counting row-touching commits), the guard is re-evaluated against B and the outcome is recorded in `DESIGN.md` §1.2a. Today's figures are 12 and 0.

### 1.7 Decision

**C ships.** A is rejected on §1.2's three grounds, with its one real advantage recorded as C's documented limit. B is the fallback under §1.6's stated threshold and stays the answer to the question C does not address (effective paint of a registered residue element is frozen by content and recorded by a human; it is not measured).

The row's two-outcome framing is therefore answered as: no new signal is needed for the forward claim as bounded in §2, because the claim can be delivered without deciding structure at all; and the documented-limit close is taken for the half of the ambition (measured effective paint) that would need the signal.

---

## 2. The claim, bounded

**Consequence bound.** For every element `scanInteractiveElements` admits under `app/` and `components/`: either no readable class string on any render alternative carries `border-border` or `border-border-strong` under any variant chain, or the element is a registered residue row whose content key matches and whose category bar passes, or the suite fails naming the element and printing its key. Every admitted element is handled correctly or signaled, never silently wrong; a worst case of a red plus a paste-ready row is the design, and a worst case of a conservative non-report plus a recorded limit is §6, not a finding. Conservative demotion already exists one layer down: an unreadable className is `unresolved`, counted by the shipped 13-pool equality, and if its readable strings carry a weak token it is residue here too.

**What the bound does not say, stated so it is not read into it.** It does not say the residue's effective paint is correct; it says the residue's paint tokens are frozen and reasoned. It does not say a control at a THIRD weak token is caught (§6). It does not reach an `<input type="text">`, a `<textarea>`, a `<select>`, or an outline painted on a non-interactive child (§1.1, `BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER`).

**Probe domain.** The live `app/` + `components/` corpus as scanned (362 elements at `00beaf19e`), plus the five escape mutations from the `BACKLOG.md` row table, each applied as a source edit to a copy of `components/admin/PublishedToggle.tsx` exactly as in §1.4.3, plus the one "new control" mutation. A probe input outside this domain, or more than one ordinary edit away from an input in it, files to §6, not to a finding.

**Closed convergence criterion.** The five mutations plus the new-control mutation are red under the shipped suite and the unmutated corpus is green, with the suite's self-proofs (§5) passing; and the surface is enrolled in `tests/mutation/source/registry.ts` with its score and an empty unaccepted-survivor set stated in the round-1 brief. Never an open enumeration of spellings, tokens, or component shapes.

---

## 3. Design

### 3.1 Module and suite

- A new module `controlOutlineResidue` in `tests/styles/` (importable, no side effects at import, no `process.exit`): exports `isWeakOutlineToken(token)`, `paintProjection(path)`, `residueKey(element)`, `residueOf(rootDir)` (the derived population, as a `Map<key, count>` plus the element list for messages), `RESIDUE_CENSUS` (the rows), `RESIDUE_CATEGORIES`, `validateRow(row, element, css)`, and `recordedRatio(outlineToken, fillToken, css)` for the `switch-track` recomputation. The contrast arithmetic reuses the WCAG relative-luminance form already in `tests/styles/secondary-action-contrast.test.ts`; the plan decides whether to lift it into a shared helper or replicate the six lines, and says why.
- A new suite `_metaControlOutlineResidue` beside it: the deciding suite (§5).

The module is a sibling of `tests/styles/controlOutlineScan.ts`, not an edit to it: that file's header says "DO NOT grow a predicate here", and this module carries no predicate over structure either, but a second concern in a file whose whole contract is "a list, and nothing else" would invite the growth its header forbids.

### 3.2 The weak-token grammar (closed)

A token is weak when, after stripping a variant chain (zero or more `<variant>:` prefixes, where a variant is any run of non-whitespace characters ending in a colon, including bracketed arbitrary variants), the remainder is exactly `border-border` or `border-border-strong`. Whole-token match only: `border-border-strong-x` and `border-borderline` are not matches. Tokens are the whitespace-split pieces of each readable class string, the same split `tests/styles/_metaControlOutlineFill.test.ts` uses.

### 3.3 The paint projection (closed)

A render alternative's projection is the ordered list of its tokens whose post-variant utility begins with `border` or `bg-`. Everything else is outside the key by construction: padding, gap, rings, shadows, opacity, text colour, transitions. The accept-set is two prefixes, default-denied; a utility family outside it that affects effective paint is §6.

The projection does not classify its members; only the `switch-track` bar (§1.5) needs to tell a colour token from a width or side utility, and it does so by derivation: `border-<c>` or `bg-<c>` is a colour token exactly when `--color-<c>` is declared in `app/globals.css`. No list of colour names is typed into the module.

### 3.4 The row

```ts
export type ResidueCategory =
  | "switch-track" | "side-divider" | "focus-state-chrome" | "responsive-skin-filed" | "filed-defect";

export type ResidueRow = {
  readonly file: string;              // repo-relative, as the scanner reports it
  readonly tag: string;               // as the scanner reports it
  readonly paint: readonly string[];  // one entry per render alternative: that alternative's projection joined by " ", sorted
  readonly category: ResidueCategory;
  readonly reason: string;            // category-bound form, validated; never blank
  readonly backlogRef?: string;       // BL-/DEF- id; required for responsive-skin-filed and filed-defect
};
```

Key equality is `(file, tag, paint)` with `paint` compared as a sorted array of strings. Two elements in one file with identical tags and projections are one key with multiplicity two, and the census carries that as two identical rows; the suite compares multisets.

### 3.5 Seed rows (derived, not typed)

The twelve rows in §1.4.3 are produced by running `residueOf` against the live tree and pasting the printed keys, then adding category and reason. The plan's seeding task records the command and its output; the spec does not transcribe the twelve paint strings because a transcription here would be a second copy that drifts (the `switch-track` strings alone run to several hundred characters each).

Categories as seeded: three `switch-track` (PublishedToggle, AutoPublishToggle, NotifyToggle; recorded ratio 1.43:1 light / 1.75:1 dark, recomputed by the suite), five `side-divider` (BellPanel `border-t`, RecentAutoAppliedStrip `border-b` on its open branch, AttentionMenu `border-b`, EventFilters `border-l` on its non-first segments, KeyTimesStrip `border-t`), two `responsive-skin-filed` (ShareHub, `BL-CONTROL-OUTLINE-SHAREHUB-MOBILE-SKIN-WEIGHT`), two `focus-state-chrome` (the help skip links; their focus indication is the `focus-visible:ring-2 focus-visible:ring-focus-ring` pair in the same string). Zero `filed-defect` rows: the population is clean.

### 3.6 What the guard prints when it reds

For an unregistered key: the file and tag, the paint strings as a ready-to-paste `ResidueRow` literal with `category` and `reason` left as `TODO`, and one line per category naming its bar. For a stale row: the row's file and tag, its registered paint strings, and the nearest live key in that file by tag (so a token edit reads as "this row moved" rather than "this row vanished"). The message is the guard's whole user interface; the plan's red for it is a constructed unregistered element and an asserted message, by equality on the derived fields, never by substring.

### 3.7 Relationship to the shipped pins

| Shipped pin | Stays | Why |
| --- | --- | --- |
| 57-row swap census (`CENSUS`) and its per-row assertions | unchanged | it answers "did the swaps stay swapped"; C answers "did anything new appear at a weak token"; different questions, and C's residue is disjoint from `CENSUS` by construction (every census row carries `border-text-faint` and no weak token) |
| unresolved-pool equality at 13 | unchanged, cited | the reported bucket stays in the population: C treats an unresolved element with a readable weak token as residue, and the 13-pool pins the rest |
| `DIVIDERS` five-row exclusion | unchanged | C registers the same five elements as `side-divider` rows; the plan adds one cross-assertion that every `DIVIDERS` row resolves to a `side-divider` residue row, so the two lists cannot disagree about an element |
| `TRACK_PATHS` source-presence check (five files) | unchanged | it is the only pin on the two nested-span tracks, which are outside the element cover; C registers the three cover-visible tracks by element |

### 3.8 Enrolment (precedes review)

`controlOutlineResidue` enrols in `tests/mutation/source/registry.ts` with the new suite as its only `suitePaths` entry, all six operators, a liveness control that detaches `residueKey` from its paint projection (`paint: projection(path)` → `paint: []`, which collapses every residue element to one key and is the failure a census reader can have), and `scoreFloor` set by the plan after the first scored run, with the aim of 1 as `controlOutlineScan` carries. Sites the enumerator will find, by construction of §3.1: the weak-token and variant-chain regexes (`regex-quantifier-bound`), `paths.length === 2` and the one-fill-one-outline counts in `validateRow` (`equality-flip`, `relational-boundary`, `integer-literal`), the category dispatch (`logical-connector`, `statement-removal`). The plan runs the enumerator before round 1 and states the count; the second declaration (`EXPECTED_LEDGER_KINDS` in `tests/mutation/source/expectedLedgerKinds.ts`, which `tests/mutation/guardSurfaces.gates.test.ts` reconciles against the registry) is added in the same commit.

---

## 4. Acceptance criteria

Every criterion names the executable step that proves it and the channel the proof arrives on.

- **AC-1** The unmutated tree is green: `pnpm vitest run tests/styles/_metaControlOutlineResidue.test.ts` passes with the census at its seeded size and zero unregistered keys. Channel: the run's summary line.
- **AC-2** Each of the five escape mutations and the new-control mutation, applied to a scratch copy of the corpus inside the suite, produces set inequality, and the failure names the mutated element's file. Channel: six `it` cases, one per mutant, each asserting the new key's `file` by equality.
- **AC-3** The no-defect baseline for AC-2: the same scratch copy, unmutated, produces a residue equal to the live tree's. Channel: one `it` case, run before the six.
- **AC-4** A row whose category bar fails is rejected by name: one constructed row per category, each violating its bar in one way (a `switch-track` row with three paths; a `side-divider` row whose weak-token path has no side utility; a `focus-state-chrome` row with a bare weak token; a `responsive-skin-filed` row with a `backlogRef` that resolves to nothing; a `filed-defect` row with a blank reason), plus a row with an unknown category. Channel: six `it` cases asserting `validateRow` returns the named problem, by equality on the message.
- **AC-5** The `switch-track` recorded ratio is recomputed: with the live `globals.css`, the three track rows' `1.43:1 / 1.75:1` reconcile within 0.01; a constructed row stating 1.59:1 against the same tokens is rejected. Channel: two `it` cases.
- **AC-6** Stale-row direction: a scratch copy with PublishedToggle's OFF fill moved to `bg-surface` (the draft escape) reds as BOTH an unregistered key and a stale row, and the stale-row message names the registered row. Channel: one `it` case asserting both lists by equality.
- **AC-7** Premise at module scope, unconditional: the live scan's element count exceeds a floor of 200 (the shipped pin measures 362); a scanner returning `[]` would make "zero unregistered keys" vacuous. Channel: `premise(...)` from `tests/_shared/premise.ts`, outside any `.each`.
- **AC-8** The `DIVIDERS` cross-assertion of §3.7 holds. Channel: one `it` case.
- **AC-9** Enrolment: the registry row and `EXPECTED_LEDGER_KINDS` entry exist, `pnpm mutation:sites` lists the surface with a non-zero site count, and the first scored run's score and unaccepted-survivor set are stated in the round-1 diff brief. Channel: the registry diff and the scored run's output.
- **AC-10** No file under `app/` or `components/` is in the diff: `git diff --name-only origin/main...HEAD -- app components` is empty. Channel: the command's output at closeout.

---

## 5. Verification and self-proofs

The suite proves things about itself before it proves anything about the corpus, following `2026-08-16` spec §5.3:

1. **Literal census size.** `RESIDUE_CENSUS.length` is asserted against the literal the seeding task produced (12), never against anything derived from the census. Deleting a row must red here even when every surviving row still resolves.
2. **Distinct rows.** The multiset of row keys equals the multiset of live residue keys in both directions; a duplicated row cannot stand in for a deleted one.
3. **Every row's category bar passes on the LIVE element**, not on the row alone: `validateRow(row, liveElement, css)`. A row whose paint strings no longer match any live element is stale (direction 2) and never reaches the bar.
4. **Negative controls are expect-a-report.** The six mutation cases of AC-2 and the six bar cases of AC-4 each assert a produced value by equality. No case in the suite passes because something was absent.
5. **Pre-dispatch mutants (four, per `docs/agents/writing-plans.md`, string-presence guards).** Recorded in the seeding commit: (a) the weak-token regex emptied; (b) a weak token with a suffix (`border-border-strong-x`) in a fixture, expected NOT residue; (c) the token present but not live: inside a comment, inside an attribute other than `className`, and behind a literal `false &&` branch, expected NOT residue for the first two and residue for the third (the scanner reads both branches of a conditional and the path model keeps the dead branch; that is the conservative direction and is asserted, not assumed); (d) each discriminating parameter varied: the variant chain present/absent, `unresolved` true/false, the tag in and out of `isInScope`.
6. **Parse-cache hazard, pinned.** The AC-2 cases use a distinct scratch root per mutant, and one case asserts that two roots with different bytes at the same relative path produce different residues, so the `sourceCache` behaviour that corrupted the first probe run cannot silently return.

---

## 6. Documented limits

Each is a stated position, not an open gap. Per the 2026-08-04 filing bar, a hypothetical whose worst case is conservative behaviour plus a surfaced signal belongs here.

- **Effective paint is frozen, not measured.** A `switch-track` row's recorded OFF ratio is recomputed from its two tokens; every other row's ratio is whatever the reason says. A registered element whose outline token is unchanged but whose ground changed by a mechanism outside the paint projection (an ancestor's background, a `bg-transparent` control moved onto a new ground, `opacity-*`) is not seen. This is the half of the row's ambition Outcome A would have bought (§1.2), taken as the documented-limit close (§1.7).
- **Two tokens only.** `border-border` and `border-border-strong` are the tokens the two rulings name and the two the swap arcs moved. A resting outline at a third weak token (`border-surface-raised`, `border-bg`, an arbitrary value `border-[#cfcdc7]`, a CSS-variable form `border-(--color-border-strong)`, `outline-*` or `ring-*` used as a boundary, `divide-*` on a parent) is outside the accept-set. Re-file trigger: a third token appearing on an interactive element in a census re-run, at which point it joins the grammar as a deliberate edit with its own seeded rows.
- **Non-Tailwind paint.** Inline `style`, CSS modules, and `globals.css` rules that target an element by selector are outside the scanner's projection entirely, as they are for every guard in `tests/styles/`.
- **The element cover.** Text-entry fields, `<select>`, and outlines on a non-interactive child are `BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER`. The two nested-span tracks (`AutoRefreshControl.tsx`, `DeveloperToggleButton.tsx`) are held only by the `TRACK_PATHS` source-presence check.
- **The unresolved pool.** Thirteen elements the scanner cannot read are counted, not classified; if one carries a readable weak token it is residue (none does today). An unreadable weak token on an unreadable path is invisible here and counted there.
- **Re-pin reflex.** A contributor who reds the guard by changing a track's OFF fill can re-register the row with the new strings; the `switch-track` bar then recomputes the ratio they must write down, and `DESIGN.md` §1.2a's recorded 1.43/1.75 will disagree with the row. The guard makes that disagreement visible in the diff; it does not prevent it. Review's class.
- **Content-key multiplicity.** Two identical elements in one file are one key with count two. Adding a third identical one reds (count 3 ≠ 2); swapping which of two identical elements is which is invisible, by construction and harmlessly.
- **Cost threshold.** §1.6: more than thirty residue entries, or more than eight entry events in a rolling thirty days, re-opens the B close.
- **Variant semantics are not evaluated.** `max-sm:border-border` is keyed as a token; that it paints only below 640px is the reason's job, not the guard's. The `responsive-skin-filed` bar checks the variant's presence, not its breakpoint.

---

## 7. Threat fence and probe domain (for every review brief on this arc)

- **THREAT FENCE:** the guard defends against accidental authoring by an ordinary contributor: copying a pre-ruling recipe, adding a control at a weak token, refactoring a switch track so its outline lands on a different element, half-swapping a ternary. Adversarial obfuscation of a className (computed strings, dynamic token construction, arbitrary values, third tokens, non-Tailwind paint) is OUT of scope and files to §6. A probe outside this fence is a documented limit, never a finding.
- **PROBE DOMAIN:** the live `app/` + `components/` corpus as `scanInteractiveElements` reads it (362 elements at `00beaf19e`), and the six source mutations of §1.4.3 applied to a copy of `components/admin/PublishedToggle.tsx` / `components/admin/UnignoreButton.tsx`. One ordinary edit away from one of those is admissible; a constructed component shape that occurs nowhere in the corpus is §6.
- **CONSEQUENCE BOUND:** §2, first paragraph, verbatim.
- **DO NOT RELITIGATE:** §1.1's table, the five-escape table in the `BACKLOG.md` row, the no-sixth-predicate fence as answered in §1.4.2, and the three-outcome framing ratified by `bl-orch` on 2026-08-21.
- **CLOSED CRITERION:** §2, last paragraph. A finding is admissible only with a probe from the domain showing a silent wrong clear (an element carrying a weak token that the suite neither registers nor reports) or a wrong red on the live corpus. A missing category, a hypothetical token, or a shape outside the fence is §6.

---

## 8. Dimensional invariants

N/A. No component is created or changed (§1.1, last row but two).

## 9. Transition inventory

N/A. No component state is created or changed.
