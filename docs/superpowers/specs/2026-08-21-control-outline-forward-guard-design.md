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

1. **Its population is enumerated or state-bound, so it fails OPEN on exactly the input the row names.** The row's ambition is "a future arc adds a NEW control at `border-border-strong`". Three harness shapes exist in this repository and none reaches it. A live entry mounts the components its author listed, with the props its author chose: `_tapTargetFloorLiveEntry.tsx` says of itself "EVERY MOUNT CARRIES THE STATE THAT MAKES ITS <summary> EXIST". A seeded-route pass (`playwright.config.ts`, `webServer` block; single worker, seeded Supabase) sees what that seed renders in that state: closed menus, unopened modals, conditional branches off. The third shape is the closest to derived and it is the one that settles the question: `tests/e2e/font-rendering-census.spec.ts` walks `app/` for every `page.{ts,tsx,mdx}` (`routeCensus`) and visits the result at two viewports, but it visits only `STATIC_ROUTES`, which subtracts a hand-listed `PARAMETERISED` map (`/admin/show/[slug]`, `/show/[slug]/[shareToken]`, four more, each with a reason) and a hand-listed `UNREACHABLE_HERE` map, at whatever state the signed-in seed renders. Measured against the twelve residue elements of §1.4.3 by their first-hop importers: the two settings toggles render at rest on `/admin/settings` and the two skip links on `/help` only under focus; `PublishedToggle`, `ShareHub` and `AttentionMenu` render only on `/admin/show/[slug]` (parameterised, excluded by the harness's own map), `KeyTimesStrip` on `/show/[slug]/[shareToken]` (excluded) or `/admin/dev/source-link-dim` (build-gated), `EventFilters` on `/admin/dev/telemetry` (build-gated), `BellPanel` and `RecentAutoAppliedStrip`'s divider branch only once a popover or panel is opened. So the most derived browser population in the repository reaches two of twelve residue elements at rest, and it reaches none of the five source mutations of §1.4.3, four of which live on `PublishedToggle` and the fifth in `UnignoreButton`, which the admin dashboard renders only beside an ignored-sheet row, a state the census seed does not carry. The static scanner sees 362 elements across every render alternative today; a browser pass sees a population bounded by the states its author enumerated, and here the enumeration's gap is the whole claim.
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

An element is **residue** when any readable class string, on any render alternative, paints a **weak outline** by the oracle of §3.2: Tailwind's own compiler, loaded from `app/globals.css`, classifies every token the element carries, and on some render alternative, in some variant state (rest, `focus:`, `max-sm:`, `hover:`, `aria-expanded:`, …), the cascade winner on some border side is a declaration that references `--color-border` or `--color-border-strong`, or one the oracle cannot classify (a literal in any notation, which is residue fail-closed, §3.2). The module models no spelling (§3.2); what the oracle does not reach is §6. The unclassified bucket is the guard doing design-system work rather than overhead: `DESIGN.md` makes outlines tokens, so a literal outline on a control SHOULD be a token, and the residue channel's first line for one is the repair (use a token), with a ledger-backed row as the priced exception (§1.5, `literal-outline`). `unresolved` does not exempt: an unresolved element whose readable strings carry a weak token is residue like any other, because the unread span can only add paint, never remove the token already seen.

The guard asserts one relation: **the multiset of residue elements, keyed by content, equals the registered census.** The key is `(file, tag, paint projection)`, where the paint projection of a render alternative is its sorted list of tokens that PAINT, painting decided by compiled declaration exactly as weakness is (§3.3: a token is in the key when a rule that targets the element declares a `border*` or `background*` property), and the element's key carries the projection of every alternative, sorted. No line number is part of the key. A row is a registered residue element plus a category and a reason, and the form of both is validated mechanically (§1.5).

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
| **C** | **nothing about structure. About paint, only what Tailwind's own compiler says an element's own tokens paint (§3.2); it decides whether the residue set changed.** | see §1.4.3: every escape is a set change |

The shape is the one this repository already ships for the tap-target floor: `tests/styles/tapTargetCensus.ts` (header: "A row here does NOT mean 'this control is too small'. It means the STATIC scanner could not prove a ≥ 44px height from the class string, and a human wrote down why that is acceptable ... The alternative to a row is a named suite failure, never a silent pass") with `tests/styles/_metaTapTargetFloor.test.ts` asserting equality in both directions (no unregistered unclear element; no stale row). That guard shipped under the `2026-08-14-ui-interactive-token-policy-design.md` spec, whose §5.3 names the pattern "reasons-required census, fail-by-default". C is that pattern applied to the weak-outline carriers, with two refinements taken from this batch's lessons: the key is content rather than a line number (a line number converts drift detection into a re-pin ritual; the browser-mutant registry's `from`-anchored ids are the in-repo precedent for content keys, `tests/mutation/browser/registry.ts`, `browserSiteId` comment "CONTENT-anchored, not positional"), and the exemption is keyed at the same granularity as the thing it exempts (one element and its exact paint tokens, never a file).

The `2026-08-16` spec's own note for the next arc is the boundary C stays inside: "a predicate over Tailwind class strings can decide token PRESENCE soundly and cannot decide EFFECTIVE PAINT soundly". C decides presence and set equality, and since spec round 5 it decides presence by asking the compiler rather than by a predicate over strings (§3.2): the one paint question it answers, which of an element's own utilities wins a border side, is answered by the engine that generates the cascade, which is the difference between a string predicate guessing at paint and the stylesheet's own order. That is the boundary the note draws, not a crossing of it: the note forbids a STRING predicate deciding paint, and the R3 escape is exactly a hand-built evaluator doing so. Where a claim lies beyond the compiler (a switch-track row's recorded OFF ratio against its ground), C refuses ambiguity instead of resolving it (§1.5: a track row whose path carries two fill tokens is rejected at validation, not evaluated).

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

R3 has no source mutation of its own: its escape is that exactness requires deciding which of two paint tokens wins, and the R2 input is that case. What R3 contributes to the acceptance floor is a CONTROL rather than a red: a guard that compared class strings for exactness would red on a token REORDER, which changes nothing (Tailwind resolves conflicting utilities by stylesheet order, never by class order), so the projection is order-insensitive (§3.3) and a reorder must stay GREEN. The file-registry column is the distinctness proof: the mechanism the table killed at R5 stays GREEN on all four escape mutants, exactly as the table says, and reds only on the new control. Each candidate red differs per mutant and names the asserted change, so each failed for the asserted reason.

**The acceptance floor, stated once and counted once.** TEN source mutations that must RED (draft, R1, R2, R5, new control, the four grammar mutants spec rounds 2 to 4 and the orchestrator's ruling of 2026-08-21 put on the floor: a new control at `!border-border-strong`, at `border-border-strong/50`, at `border-t-border-strong`, at `border-[#cfcdc7]`; and spec round 7's arbitrary property `![border-color:var(--color-border-strong)]` appended to a track's ON alternative) and TWO control edits that must stay GREEN (a padding-only edit to a track; a token reorder of a track's recipe). Twelve cases. Every later count in this spec refers back to this sentence. The shipped key (§3.3, the sorted paint projection) was then run on the first eleven under the oracle of §3.2, one fresh scratch root per case (§5.6), 2026-08-21, spec round 5; this run supersedes the grammar-predicate runs of rounds 1 to 4. The twelfth, round 7's arbitrary property on the ON alternative, is the `![border-color:…]` line of §3.3's probe: key changed, ON-alternative weak winner, form bar refusal. The four lines marked `(cascade)` are the multi-token probe the ruling required and are not floor cases; the two `planted defect` lines are AC-16:

```
live admitted 362 tokens classified 323 non-compiling 2 residue 12
[RED draft OFF fill->bg-surface] RED as expected ["PublishedToggle.tsx bg-accent border border-accent-edge || bg-surface border border-border-strong"] 
[RED R1 third branch] RED as expected ["PublishedToggle.tsx bg-accent border border-accent-edge || bg-surface border border-border-strong || bg-surface-sunken border border-border-strong"] 
[RED R2 tokens-include] RED as expected ["PublishedToggle.tsx bg-accent border border-accent-edge || bg-surface-sunken bg-warning-bg border border-border-strong"] 
[RED R5 nested span] RED as expected ["PublishedToggle.tsx bg-surface border border-border-strong"] 
[RED NEW control] RED as expected ["UnignoreButton.tsx bg-surface border border-border-strong"] winners: alt0:rest:top=border-border-strong alt0:rest:right=border-border-strong alt0:rest:bottom=border-border-strong alt0:rest:left=border-border-strong
[RED grammar: important] RED as expected ["UnignoreButton.tsx !border-border-strong bg-surface border"] winners: alt0:rest:top=!border-border-strong alt0:rest:right=!border-border-strong alt0:rest:bottom=!border-border-strong alt0:rest:left=!border-border-strong
[RED grammar: opacity] RED as expected ["UnignoreButton.tsx bg-surface border border-border-strong/50"] winners: alt0:rest:top=border-border-strong/50 alt0:rest:right=border-border-strong/50 alt0:rest:bottom=border-border-strong/50 alt0:rest:left=border-border-strong/50
[RED grammar: directional] RED as expected ["UnignoreButton.tsx bg-surface border border-t-border-strong"] winners: alt0:rest:top=border-t-border-strong
[RED grammar: arbitrary value] RED as expected ["UnignoreButton.tsx bg-surface border border-[#cfcdc7]"] winners: alt0:rest:top=border-[#cfcdc7] alt0:rest:right=border-[#cfcdc7] alt0:rest:bottom=border-[#cfcdc7] alt0:rest:left=border-[#cfcdc7]
[GREEN control: padding-only edit] GREEN as expected  
[GREEN control: R3 token reorder] GREEN as expected  
[cascade: strong then weak on one alternative] RED (cascade) ["UnignoreButton.tsx bg-surface border border-accent-edge border-border-strong"] winners: alt0:rest:top=border-border-strong alt0:rest:right=border-border-strong alt0:rest:bottom=border-border-strong alt0:rest:left=border-border-strong
[cascade: weak then strong on one alternative] RED (cascade) ["UnignoreButton.tsx bg-surface border border-accent-edge border-border-strong"] winners: alt0:rest:top=border-border-strong alt0:rest:right=border-border-strong alt0:rest:bottom=border-border-strong alt0:rest:left=border-border-strong
[cascade: weak important beside strong] RED (cascade) ["UnignoreButton.tsx !border-border-strong bg-surface border border-accent-edge"] winners: alt0:rest:top=!border-border-strong alt0:rest:right=!border-border-strong alt0:rest:bottom=!border-border-strong alt0:rest:left=!border-border-strong
[cascade: strong at rest, weak on focus] RED (cascade) ["UnignoreButton.tsx bg-surface border border-accent-edge focus:border-border-strong"] winners: alt0:focus:top=focus:border-border-strong alt0:focus:right=focus:border-border-strong alt0:focus:bottom=focus:border-border-strong alt0:focus:left=focus:border-border-strong
floor all as expected: true
planted defect, theme without --color-border-strong: residue 7 (census equality against 12 rows => RED); border-border-strong compiles: false
planted defect, oracle blind to the weak vars: residue 0 => RED
order sample: border-accent-edge=0 border-border-strong=1 border-t-border-strong=2 focus:border-border-strong=3
tailwind 4.2.4 total 5521 ms
```

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

Line numbers above are drafting-time locators only; the census keys on content. Two live tokens compile to nothing (`group` and `peer`, Tailwind's marker classes); a token that compiles to nothing paints nothing in production either, so the oracle's silence on it is the truth about that token, not a gap (§3.2, §6). The twelve are the three cover-visible switch tracks, the five dividers the `2026-08-18` arc already excludes by name, ShareHub's two fenced elements, and two skip links whose weak token is focus-only chrome (`app/help/layout.tsx`, comment "WCAG 2.4.1 ... Visually hidden until focused"). The population is clean: nothing rests at a weak outline that the two rulings did not already name.

The twelve cases ship in the suite as its acceptance floor (§5), so the table above is red-then-green under the shipped mechanism and not only under the prototype.

### 1.5 C's own failure direction, and the reason bar

Per the batch's guard-authoring rule (ask what the cheapest edit that satisfies the guard is, and whether it ever destroys evidence):

| Red | Cheapest green | Is it evidence-destruction? |
| --- | --- | --- |
| a new weak-outline element, or a literal outline in any notation | swap the token to `border-text-faint` (the ruling; for a literal, ANY theme token is the repair), OR add a row | no; a row must carry a category whose form is checkable, and three of six categories require a ledger ref that must exist |
| a registered element's paint tokens changed | update the row's paint strings and its reason | no; the row's category bar re-runs on the new strings (a `switch-track` row must still have exactly two paths, each with exactly one fill and one outline token) |
| a registered element disappeared (file deleted, element removed, token removed) | delete the row | correct: the residue shrank and the record follows it |

The residual hazard is the one the batch named: a lazy reason row. The guard therefore demands a FORM, not prose, and validates it: Throughout the table, a weak token is a token `classify` (§3.2) marks weak on some side; the bars never spell. The `literal-outline` bar, probed 2026-08-21 on the prototype against a constructed ledger text (an entry that mentions the id, the file and the value in ANOTHER entry's prose resolves to nothing, as for `filed-defect`):

```
refusal, echo-only reason, no backlogRef: ["components/admin/UnignoreButton.tsx: replace rgb(207 205 199) with a theme token, or file the literal as a BL-/DEF- entry and cite it (literal-outline requires backlogRef)"]
refusal, ref resolves only in another entry's prose: ["components/admin/UnignoreButton.tsx: backlogRef BL-LIT-9 does not resolve to a ledger heading"]
refusal, entry names the file, not the value: ["components/admin/UnignoreButton.tsx: backlogRef BL-LIT-1 resolves but its entry does not name the compiled value rgb(207 205 199)"]
refusal, entry names the value, not the file: ["components/admin/UnignoreButton.tsx: backlogRef BL-LIT-1 resolves but its entry does not name this file"]
refusal, literal under filed-defect: ["components/admin/UnignoreButton.tsx: replace rgb(207 205 199) with a theme token; a literal outline is registered only as literal-outline"]
acceptance, entry names file and value: []
```


| Category | Mechanical bar (`validateRow`) | Ledger ref |
| --- | --- | --- |
| `switch-track` | exactly two render alternatives; each alternative's projection carries exactly one fill token and exactly one outline-colour token, decided by compiled declaration (§3.3): a fill token's own rule sets `background-color` referencing a `--color-*` variable, an outline-colour token's own rule sets any `border*-color` (so `border`, `border-t` and `border-2` are neither, and an arbitrary property `![border-color:…]` beside `border-accent-edge` is a second outline token, refused by name: spec round 7's probe, `fills=1 outlines=2`); reason cites `DESIGN.md §1.2a`; reason carries the OFF ring's recorded ratio `n.nn:1 light / n.nn:1 dark`. The FORM bar lives in `validateRow`; the RATIO is recomputed by the suite from the two tokens against `app/globals.css` runtime values and compared within 0.01 (AC-5). Probed on the prototype: the R2 shape (two fills on one alternative) and the R5 shape (one alternative) are refused by the form bar; the draft shape (OFF fill moved to `bg-surface`) passes the form bar and is caught by the ratio compare, 1.59 against the recorded 1.43 | none |
| `side-divider` | ACCEPT-SET over the alternative's border tokens, default-denied: every `border*` token in an alternative that carries the weak token is either a side width `border-[tblr]` or `border-[tblr]-<n>` (so `last:border-b-0` passes) or THE weak colour token itself; anything else (a bare `border`, `border-2`, `border-x`, a second colour) refuses the row as an outline, not a divider; reason names the side utility. Probed: adding a bare `border` to BellPanel's `border-t border-border` is refused by name | none |
| `focus-state-chrome` | every weak token in the key carries a `focus:` or `focus-visible:` variant (a leading `!` is skipped before the chain is read); the same render alternative of EVERY live element sharing the key carries a `focus:ring-*` or `focus-visible:ring-*` token, read from each element's full class strings because ring tokens sit outside the paint projection by construction (§3.4); reason states what carries the focus indication | none |
| `responsive-skin-filed` | every weak token carries a `max-*:` or `sm:`-family responsive variant; `backlogRef` required, must resolve to a `^## <id>` heading in `BACKLOG.md` or `DEFERRED.md` (a mention in another entry's prose is not a declaration), AND that entry's body must NAME the row's file. Probed: a new `max-sm:border-border` control in another file citing `BL-CONTROL-OUTLINE-SHAREHUB-MOBILE-SKIN-WEIGHT` is refused ("resolves but its entry does not name this file"); ShareHub's own rows pass | required |
| `filed-defect` | `backlogRef` required, same resolution and same names-the-file rule; reason is non-blank. Probed: the new-control mutation citing the ShareHub entry is refused by name; a row citing a constructed entry that names its file is accepted | required |
| `literal-outline` | the row's residue comes from at least one UNCLASSIFIED border-colour value (§3.2: a literal in any notation, `currentColor`, a non-colour `var()`); `backlogRef` required, same `^## <id>` resolution as `filed-defect`, and the entry's body must name the row's file AND every unclassified value exactly as it compiles (`rgb(207 205 199)`, `currentcolor`). The reason text is free; the FORM is the ledger entry. What the bar guarantees is location, cost and linkage: the literal is recorded where the queue is read, under the ledger's own filing bar, naming the file and the value so the swap-back is trackable; and tokenising stays cheaper than filing. What no bar decides is whether the justification is GOOD: a ledger body that names the file and the value and says nothing else passes (spec round 7's probe), exactly as a false `switch-track` row passes its form bar (§6). Whether a token would do is a design ruling, review's class, and the guard's job is to make sure the ruling is asked for in the ledger rather than skipped in a className; a row-local why-not-a-token field was tried (spec round 6) and was the same echo one layer closer, which is why the form is the ledger and the limit is stated here. A literal under any other category is refused, and every refusal's first line is the intended repair (replace the literal with a theme token). The cheapest green is tokenising. Probed 2026-08-21 on the prototype (transcript below the table) | required; names file and value |

The category set is closed and default-denied: a row with any other category fails validation. A `filed-defect` row is the only way to register a genuine weak resting outline, and it costs a ledger entry that names the file and that the 2026-08-04 filing bar and the 2026-08-18 mint bar then govern, which is exactly where a design decision about a new weak-outline control belongs.

**Per-category counts are pinned as literals.** The suite asserts the seeded census holds exactly 3 `switch-track`, 5 `side-divider`, 2 `focus-state-chrome`, 2 `responsive-skin-filed` and 0 `filed-defect` rows, against literals, never against anything derived from the census. A new row of any category therefore costs two deliberate edits in one diff, the row and the literal, and the diff shows both.

**What the bars do not decide, stated so nobody reads them as a classifier.** A `switch-track` row for an element that is NOT a track but carries the exact ON/OFF recipe passes the form bar: `ScanElement` projects no role or structure, and trackness is a ruling (`DESIGN.md` §1.2a) rather than a property the scanner could read. Registering such a row costs the author a false citation of the ruling, a bump of the `switch-track` literal from 3, and a diff a reviewer reads; that is review's class and §6 records it as the limit. The bars make a lazy reason impossible to write by accident; they do not make a deliberately false one impossible to write.

Recomputing the `switch-track` ratio is the one place a number in a reason is derived rather than typed. It is sound here and not in general for the reason R3 gave: a path with exactly one fill and one outline token has no cascade to resolve. A path with two fill tokens is refused at validation with the R2 shape named in the message. That refusal, not an evaluator, is the guard's answer to "tokens include is not tokens are".

### 1.6 Pricing the new-member workflow against LOW severity

**Who pays, and when.** The author of the PR that adds a weak-outline interactive element, or changes the outline or fill tokens of a registered one, at the moment the suite reds. The failure message prints the row to paste (file, tag, paint strings) and the six categories with their bars; the author supplies category and reason. A `filed-defect` row additionally costs a ledger entry.

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

**When this cost argues for B instead.** If the residue grows past the point where a reviewer stops reading rows, the census has become a ritual and B is the honest close. The threshold is stated so it can be checked, and it is measured in ROWS, not commits (one commit can re-key nine rows): if the census holds more than thirty residue entries, or if more than eight entries were added or re-keyed in any rolling thirty-day window, the guard is re-evaluated against B. The row measure is a key diff through the module's own key function, never a commit count:

```
git show $(git rev-list -1 --before=<window start> HEAD):tests/styles/controlOutlineResidue.ts > /tmp/residue-then.ts
# count = |keys(then) ∆ keys(now)| where keys() maps each row to rowKey(row); a re-keyed row appears on both sides
```

The re-evaluation and its outcome are recorded in the ledger row's archive entry and in the module header, not in `DESIGN.md` (a `DESIGN.md` edit is a UI surface under invariant 8 and would pay the impeccable dual gate for a paragraph). Today's figures are 12 and 0.

### 1.7 Decision

**C ships.** A is rejected on §1.2's three grounds, with its one real advantage recorded as C's documented limit. B is the fallback under §1.6's stated threshold and stays the answer to the question C does not address (effective paint of a registered residue element is frozen by content and recorded by a human; it is not measured).

The row's two-outcome framing is therefore answered as: no new signal is needed for the forward claim as bounded in §2, because the claim can be delivered without deciding structure at all; and the documented-limit close is taken for the half of the ambition (measured effective paint) that would need the signal.

---

## 2. The claim, bounded

**Consequence bound.** For every element `scanInteractiveElements` admits under `app/` and `components/`: either no readable class string on any render alternative paints a weak outline under the oracle of §3.2 (Tailwind's compiler loaded from `app/globals.css`, the cascade winner resolved per border side in every variant state), or the element is a registered residue row whose content key matches and whose category bar passes, or the suite fails naming the element and printing its key. Every admitted element is handled correctly or signaled, never silently wrong; a worst case of a red plus a paste-ready row is the design, and a worst case of a conservative non-report plus a recorded limit is §6, not a finding. Conservative demotion already exists one layer down: an unreadable className is `unresolved`, counted by the shipped 13-pool equality, and if its readable strings carry a weak token it is residue here too.

**What the bound does not say, stated so it is not read into it.** It does not say the residue's effective paint is correct; it says the residue's paint tokens are frozen and reasoned. It does not say a control at a THIRD theme colour (a declaration referencing another `--color-*` variable) is caught (§6); it does not reach paint Tailwind did not compile (§6). It does not reach an `<input type="text">`, a `<textarea>`, a `<select>`, or an outline painted on a non-interactive child (§1.1, `BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER`).

**Probe domain.** The live `app/` + `components/` corpus as scanned (362 elements at `00beaf19e`), plus the twelve cases of §1.4.3's acceptance floor (ten source mutations and two control edits), each applied as a source edit to a copy of `components/admin/PublishedToggle.tsx` or `components/admin/UnignoreButton.tsx` exactly as in §1.4.3. A probe input outside this domain, or more than one ordinary edit away from an input in it, files to §6, not to a finding.

**Closed convergence criterion.** The acceptance floor of §1.4.3 holds under the shipped suite (ten source mutations red, two control edits green) and the unmutated corpus is green, with the suite's self-proofs (§5) passing; and the surface is enrolled in `tests/mutation/source/registry.ts` with its score and an empty unaccepted-survivor set stated in the round-1 diff brief. Never an open enumeration of spellings, tokens, or component shapes.

---

## 3. Design

### 3.1 Module and suite

- A new module `controlOutlineResidue` in `tests/styles/` (importable, no side effects at import, no `process.exit`): exports `loadOracle(cssPath)` (async: Tailwind's design system loaded from `app/globals.css` through `__unstable__loadDesignSystem`, with no literal list of any kind), `classify(oracle, tokens)` (per token: the border sides it paints and whether each is weak, the set of `border*`/`background*` properties its own rule declares (the key's membership, §3.3), its stylesheet order, its important flag; `null` when Tailwind compiles it to nothing), `weakSides(oracle, element, paint)` (the cascade winners of §3.2), `paintProjection(path, paint)` (compiled paint tokens only, §3.3), `residueKey(element, paint)`, `residueOf(rootDir, oracle)` (the derived population, as a `Map<key, count>` plus the element list for messages), `RESIDUE_CENSUS` (the rows), `RESIDUE_CATEGORIES`, `validateRow(row, element, oracle, css, ledgerText)` (the oracle because a row's weak tokens are whatever the oracle says they are, never a spelling; the live element because the focus-ring check reads its full strings; the ledger text because a `backlogRef` must resolve to a `^## <id>` heading whose body names the row's file), and `recordedRatio(outlineToken, fillToken, css)` for the `switch-track` recomputation. The contrast arithmetic reuses the WCAG relative-luminance form already in `tests/styles/secondary-action-contrast.test.ts`; the plan decides whether to lift it into a shared helper or replicate the six lines, and says why.
- A new suite `_metaControlOutlineResidue` beside it: the deciding suite (§5).

The module is a sibling of `tests/styles/controlOutlineScan.ts`, not an edit to it: that file's header says "DO NOT grow a predicate here", and this module carries no predicate over structure either, but a second concern in a file whose whole contract is "a list, and nothing else" would invite the growth its header forbids.

### 3.2 The weak-outline oracle (closed by construction)

**History, so the shape is not mistaken for taste.** Spec rounds 2, 3 and 4 each found a Tailwind spelling the weak-token grammar this section used to hold did not classify: the important marker (`!border-border-strong`), the opacity modifier (`border-border-strong/50`), then the directional family (`border-t-border-strong`, twenty forms, each with a modifier). Each repair was a class repair and each was correct, and a fourth corner existed before the third was closed (`border-[#cfcdc7]`, the arbitrary value, fenced to §6 only because no grammar could hold it). Three rounds on one axis is the signal the 2026-08-15 narrowing rule names, and the orchestrator's ruling of 2026-08-21 took the repair that ends the axis instead of the fourth grammar rule: the module models NO spelling. The instrument the reviewer used in all three rounds to produce the finding is the instrument the guard uses to classify, Tailwind's own compiler, which is the engine that paints production. This is not the R3 escape's cascade evaluator in a helper (`BACKLOG.md` row, table row 4): that was a hand-built evaluator deciding which of two strings wins; this calls the real one.

**The oracle.** `loadOracle` loads Tailwind v4's design system from the production stylesheet `app/globals.css` (`__unstable__loadDesignSystem` from the `tailwindcss` package, the same entry the PostCSS plugin and the CLI build on; `@import "tailwindcss"` resolved from `node_modules` by a `loadStylesheet` callback), so the theme is production's theme, and reads the literal light and dark values of `--color-border` and `--color-border-strong` from the same file (four hex values today). `classify` hands every whitespace-split token of every admitted element to `candidatesToCss` and `getClassOrder`. A token compiles to CSS or to nothing. From the CSS of the rules that paint the ELEMENT (§3.3's one selector rule, shared with the key: `&` is the subject, not followed by a combinator) the module reads every border-colour declaration, the shorthand and the directional and logical forms (`border-color`, `border-top-color`, `border-inline-color`, `border-block-start-color`, …), maps each to the physical sides it sets, and classifies each declaration's value into one of four classes, with no notation modelled: WEAK when it references `var(--color-border)` or `var(--color-border-strong)` in any form (`color-mix(…)` for an opacity modifier, `var(…)` for a CSS-variable form); STRONG when it references any other `--color-*` variable (a theme colour the rulings did not name); NONE when it is the keyword `transparent`, the one keyword read, because it paints nothing; UNCLASSIFIED otherwise, which is a literal in any notation (`#cfcdc7`, `rgb(207 205 199)`, `hsl(…)`, `oklch(…)`, `#000`), `currentColor`, or a `var()` to a property that is not a theme colour. Weak and unclassified are both residue: a literal outline is fail-closed, whatever its value, and costs the author a ledger-backed row (§1.5, `literal-outline`) or, the intended repair, a token (`DESIGN.md`: outlines are tokens). Spec round 5 is why there is no literal list: the oracle carried four hex strings for the arbitrary-value case, and Tailwind keeps an arbitrary value verbatim, so `border-[rgb(207_205_199)]` painted the weak colour and cleared; comparing colours would be a recognizer over CSS colour notation and reopen the axis at the next notation, while declining to classify a literal closes it. No token string is inspected by the module except to split it at whitespace and to read its variant chain for grouping.

**What wins, the cascade.** Per render alternative, tokens are grouped by variant chain (rest, `focus:`, `max-sm:`, …; the `variantsOf` walk §3.3 also uses). Within a group, for each side, the winner is the token Tailwind marked `!important`, else the token with the highest `getClassOrder` value, which is its position in the generated stylesheet; class-attribute order plays no part, which is the R3 control. An element is residue when any group on any alternative has a weak winner on any side. Probed 2026-08-21 (the `(cascade)` lines of §1.4.3): `border-accent-edge border-border-strong` and `border-border-strong border-accent-edge` both resolve to the weak token on all four sides (orders 0 and 1: the weak utility is later in the sheet, whichever is written first), `border-accent-edge !border-border-strong` resolves to the weak token by the important flag, and `border-accent-edge focus:border-border-strong` is strong at rest and weak in the `focus:` group, which is what the two live skip links are. Groups do not compete with each other: a `focus:` winner and a rest winner are two states, and either being weak is residue, the conservative direction (§6).

**Expected and actual come from different producers.** The actual side is the scanner over `app/` and `components/` times the compiler over `app/globals.css`; the expected side is `RESIDUE_CENSUS`, literal rows in the suite, authored from the printer. They share no code path, so a defect on either side turns rows red: AC-16 plants one in the theme (the `--color-border-strong` declaration removed: `border-border-strong` compiles to nothing, the live residue drops to the seven `border-border` elements, the census equality reds naming the five stale rows) and the plan's acceptance instruments plant one in the oracle (`isWeakValue` neutralised: residue 0, twelve stale rows), and in both runs the shipped `_metaControlOutlineFill` pins, which read no oracle, stay green, so the red is the new suite's and nothing else's.

**The Tailwind version is part of the classification, on purpose.** An upgrade that changes what a live token compiles to changes the residue, and the census equality reds with the element named. That is a design-system event surfacing through the guard built to surface it, and the suite must never absorb it: AC-17 pins the major, and a red after an upgrade means read the diff and re-decide the row, never re-seed it blind. The installed compiler at drafting time is `tailwindcss` 4.2.4, pinned by the lockfile.

**A token that compiles to nothing is a non-report, not a red.** Tailwind compiled two live tokens to nothing (`group` and `peer`, marker classes), and a typo (`border-borde`) joins them. A token that compiles to nothing paints nothing in production either, so the oracle's silence is the truth about that token; the one hypothetical left, a token that compiles, paints the weak colour, and references neither variable nor value, is §6 by the 2026-08-04 filing bar (none exists: a colour utility emits its variable, and anything else is unclassified and therefore residue).

Probed 2026-08-21 under the oracle, one fresh scratch root per form, each substituted for `border-text-faint` in a copy of `UnignoreButton.tsx`: the sixteen spellings rounds 2 and 3 raised, the two directional forms round 4 raised, the two arbitrary forms the ruling named, and two controls (a typo, and a strong colour at half alpha):

```
!border-border                 residue=true
border-border!                 residue=true
!border-border-strong          residue=true
border-border-strong!          residue=true
focus:!border-border           residue=true
focus:border-border!           residue=true
sm:border-border-strong        residue=true
[&:hover]:border-border        residue=true
border-border/50               residue=true
border-border-strong/50        residue=true
focus:border-border-strong/50  residue=true
max-sm:border-border/50        residue=true
!border-border-strong/50       residue=true
border-border-strong/50!       residue=true
border-border-strong/[.5]      residue=true
sm:!border-border/25           residue=true
border-t-border-strong         residue=true
border-x-border/50             residue=true
border-[#cfcdc7]               residue=true
border-(--color-border-strong) residue=true
border-borde                   residue=false (compiles to nothing)
border-text-faint/50           residue=false
```

And the value-class forms spec round 5 forced, probed the same way (`value=` is the compiled declaration, `class=` the oracle's class):

```
border-[rgb(207_205_199)]            residue=true  value=rgb(207 205 199)  class=unclassified
border-[rgb(207,205,199)]            residue=true  value=rgb(207,205,199)  class=unclassified
border-[hsl(40_8%_80%)]              residue=true  value=hsl(40 8% 80%)    class=unclassified
border-[oklch(0.5_0_0)]              residue=true  value=oklch(0.5 0 0)    class=unclassified
border-[#000]                        residue=true  value=#000              class=unclassified
border-current                       residue=true  value=currentcolor      class=unclassified
border-(--custom-thing)              residue=true  value=var(--custom-thing) class=unclassified
border-[var(--color-border-strong)]  residue=true  value=var(--color-border-strong) class=weak
border-transparent                   residue=false value=transparent       class=none
border-warning-text/60               residue=false value=color-mix(in oklab, var(--color-warning-text) 60%, transparent) class=strong
```


### 3.3 The paint projection (closed)

A render alternative's projection is the SORTED list of its tokens that PAINT, and painting is decided by the same instrument that decides weakness: a token is in the key when Tailwind compiles it to a declaration, in a rule that targets the element (the class rule itself, or a nested rule whose selector has `&` as its subject with no combinator after it: `&:hover`, `:where(*:hover) &` for `in-hover:`, `&:is(:where(.group):hover *)` for `group-hover:`, `&:has(…)`; a nested rule with a combinator after `&`, such as `:is(& > *)` for `*:`, `:is(& *)` for `**:`, `&>span` for `[&>span]:`, `:where(& > :not(:last-child))` for `divide-*`, paints a child or a descendant and is outside both the key and the oracle, which read this ONE rule; spec round 8 found a textual where()-exclusion dropping `in-hover:border-border-strong` from the key while the oracle still scanned it), whose property begins with `border` (every side, colour, width and style form; the radii excluded, since `border-radius` is shape, not paint) or `background` (the `classify` map of §3.2 records each token's paint properties; `paintProjection(path, paint)`). Spec round 7 is why the key is not a prefix test: `![border-color:var(--color-border-strong)]`, an arbitrary property, compiles to a weak `!important` border colour and begins with neither `border` nor `bg-`, so under a prefix key a track's ON alternative went weak with its key and its bar unchanged. The token is kept in its raw spelling, opacity modifier included, so `bg-surface` and `bg-surface/50` are different keys, while a token that compiles to nothing is outside the key, so a typo beside a live recipe changes no key and reds nothing, which is what §3.2 and §6 promise of it. The selector rule, probed 2026-08-21 on the ten variant forms appended to `PublishedToggle`'s ON alternative (`inKey` is the key's answer, `ON-alt weak` the oracle's; they agree on every row):

```
in-hover:border-border-strong        selector=:where(*:hover) &                        inKey=true  keyChanged=true  ON-alt weak=true
group-hover:border-border-strong     selector=&:is(:where(.group):hover *)             inKey=true  keyChanged=true  ON-alt weak=true
peer-checked:border-border-strong    selector=&:is(:where(.peer):checked ~ *)          inKey=true  keyChanged=true  ON-alt weak=true
hover:border-border-strong           selector=&:hover                                  inKey=true  keyChanged=true  ON-alt weak=true
*:border-border-strong               selector=:is(& > *)                               inKey=false keyChanged=false ON-alt weak=false
**:border-border-strong              selector=:is(& *)                                 inKey=false keyChanged=false ON-alt weak=false
divide-border                        selector=:where(& > :not(:last-child))            inKey=false keyChanged=false ON-alt weak=false
has-[:checked]:border-border-strong  selector=&:has(*:is(:checked))                    inKey=true  keyChanged=true  ON-alt weak=true
[&>span]:border-border-strong        selector=&>span                                   inKey=false keyChanged=false ON-alt weak=false
[&:hover]:border-border-strong       selector=&:hover                                  inKey=true  keyChanged=true  ON-alt weak=true
```

On the live corpus the declaration key and the old prefix key disagree on exactly one token, `sr-only` (`border-width: 0`, which IS paint: it removes the outline), which moves four live keys and no residue; probed 2026-08-21:

```
membership differs (prefix vs compiled-declaration, radii excluded): sr-only[border-width]
live residue 12 | residue keys identical under both projections: false | elements whose key differs: app/help/errors/page.tsx:70 app/help/layout.tsx:50 components/admin/wizard/Step3Review.tsx:732 components/admin/wizard/Step3SheetCard.tsx:110
live track, form bar by declaration: []
![border-color:var(--color-border-strong)] keyChanged(compiled)=true  ON-alt weak winner=true  form bar=["alternative must carry exactly one fill and one outline colour declaration, has fills=1 outlines=2 (![border-color:var(--color-border-strong)] bg-accent border border-accent-edge)"]
[border-top-color:#cfcdc7]                 keyChanged(compiled)=true  ON-alt weak winner=true  form bar=["alternative must carry exactly one fill and one outline colour declaration, has fills=1 outlines=2 ([border-top-color:#cfcdc7] bg-accent border border-accent-edge)"]
[background:red]                           keyChanged(compiled)=true  ON-alt weak winner=false form bar=[]
rounded-full                               keyChanged(compiled)=false ON-alt weak winner=false form bar=[]
sr-only                                    keyChanged(compiled)=true  ON-alt weak winner=false form bar=[]
```
 Probed 2026-08-21 on `PublishedToggle`'s OFF alternative (spec round 6 found the key changing on exactly these):

```
extra=border-borde             compiles=false keyChanged(compiled-only projection)=false  residue=true
extra=bg-bogus                 compiles=false keyChanged(compiled-only projection)=false  residue=true
extra=border-border-strong!!   compiles=false keyChanged(compiled-only projection)=false  residue=true
extra=bg-surface               compiles=true  keyChanged(compiled-only projection)=true  residue=true
extra=border-2                 compiles=true  keyChanged(compiled-only projection)=true  residue=true
```
 The projection keys on spelling because two spellings are two recipes a reviewer reads; the oracle of §3.2 decides weakness because spelling is not paint. Sorted, because Tailwind resolves two conflicting utilities by their order in the generated stylesheet and never by their order in the class attribute, so a reorder of class tokens is semantically null and must not red the guard (the R3 control of §1.4.3). Everything else is outside the key by construction: padding, gap, rings, shadows, opacity, text colour, transitions. The accept-set is two property families read off the compiled declaration, default-denied; a utility that paints the element's boundary through another property (`ring-*`, `outline-*`, `shadow-*`) or through a child rule (`divide-*`) compiles to no `border*`/`background*` declaration on the element's own rule (probed above) and is §6.

The projection does not classify its members; only the `switch-track` bar (§1.5) needs to tell a fill from an outline from a width, and it does so by the same compiled declarations: a fill is a token whose own rule sets `background-color` referencing a `--color-*` variable, an outline-colour token is one whose own rule sets any `border*-color`. No list of colour names and no prefix is typed into the module.

### 3.4 The row

```ts
export type ResidueCategory =
  | "switch-track" | "side-divider" | "focus-state-chrome" | "responsive-skin-filed" | "filed-defect" | "literal-outline";

export type ResidueRow = {
  readonly file: string;              // repo-relative, as the scanner reports it
  readonly tag: string;               // as the scanner reports it
  readonly paint: readonly string[];  // one entry per render alternative: that alternative's projection (tokens sorted) joined by " "; the array itself sorted
  readonly category: ResidueCategory;
  readonly reason: string;            // category-bound form, validated; never blank
  readonly backlogRef?: string;       // BL-/DEF- id; required for responsive-skin-filed, filed-defect and literal-outline (the last: entry names the file and every unclassified value)
};
```

Key equality is `(file, tag, paint)` with `paint` compared as a sorted array of strings. Two elements in one file with identical tags and projections are one key with multiplicity two, and the census carries that as two identical rows; the suite compares multisets. Because a key does not carry the tokens outside the projection, a row's bar is evaluated against EVERY live element that shares its key, never against the first one found: rows sharing a key must share a category, and a bar that reads the live element (the focus-ring check) must pass on each occurrence, with a failure naming the occurrence by line. Probed 2026-08-21: giving `app/help/errors/page.tsx`'s jump-list anchors (line 82) the skip link's exact paint plus `focus-visible:outline-none` and no ring produces a second element with the line-70 key; the per-occurrence evaluation reds it ("focus-state-chrome element lacks a focus ring token", line 82) where a `.find` by key would have validated line 70 twice.

### 3.5 Seed rows (derived, not typed)

The twelve rows in §1.4.3 are produced by running `residueOf` against the live tree and pasting the printed keys, then adding category and reason. The plan's seeding task records the command and its output; the spec does not transcribe the twelve paint strings because a transcription here would be a second copy that drifts (the `switch-track` strings alone run to several hundred characters each).

Categories as seeded: three `switch-track` (PublishedToggle, AutoPublishToggle, NotifyToggle; recorded ratio 1.43:1 light / 1.75:1 dark, recomputed by the suite), five `side-divider` (BellPanel `border-t`, RecentAutoAppliedStrip `border-b` on its open branch, AttentionMenu `border-b`, EventFilters `border-l` on its non-first segments, KeyTimesStrip `border-t`), two `responsive-skin-filed` (ShareHub, `BL-CONTROL-OUTLINE-SHAREHUB-MOBILE-SKIN-WEIGHT`), two `focus-state-chrome` (the help skip links; their focus indication is the `focus-visible:ring-2 focus-visible:ring-focus-ring` pair in the same string). Zero `filed-defect` rows and zero `literal-outline` rows: the population is clean (no admitted element carries an unclassified border-colour value, §1.4.3).

### 3.6 What the guard prints when it reds

For an unregistered key: the file and tag, the paint strings as a ready-to-paste `ResidueRow` literal with `category` and `reason` left as `TODO`, and one line per category naming its bar. When the residue comes from an unclassified value, the FIRST line is the intended repair, `replace <value> with a theme token`, the second is the priced alternative, `or file it as a BL-/DEF- entry naming this file and <value>, and cite it`, and the paste-ready row carries `category: "literal-outline"` and `backlogRef: TODO`, so the cheapest path a reader sees is tokenising. For a stale row: the row's file and tag, its registered paint strings, and the nearest live key in that file by tag (so a token edit reads as "this row moved" rather than "this row vanished"). The message is the guard's whole user interface; the plan's red for it is a constructed unregistered element and an asserted message, by equality on the derived fields, never by substring.

### 3.7 Relationship to the shipped pins

| Shipped pin | Stays | Why |
| --- | --- | --- |
| 57-row swap census (`CENSUS`) and its per-row assertions | unchanged | it answers "did the swaps stay swapped"; C answers "did anything new appear at a weak token". The two populations overlap at exactly ONE element, `components/admin/showpage/ShareHub.tsx` line 781 (census row 13), which carries both the swapped `border-text-faint` rest and the fenced `max-sm:border-border` skin; the suite asserts the overlap set equals that one row and that the row is a `responsive-skin-filed` residue row, so the two guards cannot disagree about it |
| unresolved-pool equality at 13 | unchanged, cited | the reported bucket stays in the population: C treats an unresolved element with a readable weak token as residue, and the 13-pool pins the rest |
| `DIVIDERS` five-row exclusion | unchanged | C registers the same five elements as `side-divider` rows; the plan adds one cross-assertion that every `DIVIDERS` row resolves to a `side-divider` residue row, so the two lists cannot disagree about an element |
| `TRACK_PATHS` source-presence check (five files) | unchanged | it is the only pin on the two nested-span tracks, which are outside the element cover; C registers the three cover-visible tracks by element |

### 3.8 Enrolment (precedes review)

`controlOutlineResidue` enrols in `tests/mutation/source/registry.ts` with the new suite as its only `suitePaths` entry, all six operators, a liveness control that detaches `residueKey` from its paint projection (`paint: projection(path)` → `paint: []`, which collapses every residue element to one key and is the failure a census reader can have), and `scoreFloor` set by the plan after the first scored run, with the aim of 1 as `controlOutlineScan` carries. Measured on the prototype module (`enumerateSites` over the §3 prototype, 2026-08-21): 149 sites across the two prototype files, the residue module 121 and the oracle 28: integer-literal 46, statement-removal 38, equality-flip 32, logical-connector 26, relational-boundary 7, regex-quantifier-bound 0; the plan decides whether the oracle ships inside the module or as a sibling, and enrols both if two (the grammar's regexes carry no bounded quantifier). `pnpm mutation:sites` on the shipped module is the authoritative figure; the plan runs it before round 1 and states the count; the second declaration (`EXPECTED_LEDGER_KINDS` in `tests/mutation/source/expectedLedgerKinds.ts`, which `tests/mutation/guardSurfaces.gates.test.ts` reconciles against the registry) is added in the same commit.

---

## 4. Acceptance criteria

Every criterion names the executable step that proves it and the channel the proof arrives on.

- **AC-1** The unmutated tree is green: `pnpm vitest run tests/styles/_metaControlOutlineResidue.test.ts` passes with the census at its seeded size and zero unregistered keys. Channel: the run's summary line.
- **AC-2** The twelve cases of §1.4.3's acceptance floor, applied to scratch copies of the corpus inside the suite: the ten source mutations each produce set inequality with the new key's `file` asserted by equality, and the two control edits each produce set equality. Channel: twelve `it` cases, one per case.
- **AC-3** The no-defect baseline for AC-2: the same scratch copy, unmutated, produces a residue equal to the live tree's. Channel: one `it` case, run before the twelve.
- **AC-4** Every category bar is proven in BOTH directions. Refusals, by equality on the message: a `switch-track` row with three alternatives; a `switch-track` row with two fills on one alternative (the R2 shape); a `side-divider` row carrying a bare `border` beside `border-t`; a `focus-state-chrome` row with a bare weak token; a `responsive-skin-filed` row whose `backlogRef` resolves to nothing; a `responsive-skin-filed` row whose `backlogRef` resolves to an entry that does not name its file; a `filed-defect` row with a blank reason; a `literal-outline` row with an echo-only reason and no `backlogRef`; a `literal-outline` row whose entry names the file but not the compiled value; a `literal-outline` row whose entry names the value but not the file; a row whose residue is `border-[rgb(207_205_199)]` registered as `filed-defect` (refused, the message's first line naming the token repair); a row with an unknown category. Acceptances, one per category, each one variable away from a refusal above: the three live tracks; AttentionMenu's divider with `last:border-b-0`; a skip link; ShareHub citing its own entry; a `filed-defect` row validated against a constructed ledger text whose entry names the row's file (the ledger is an input to `validateRow`, so the acceptance is attributable); a `literal-outline` row for a scratch `border-[rgb(207_205_199)]` control whose `backlogRef` resolves to a constructed entry naming both the file and `rgb(207 205 199)`. Channel: twelve refusal cases and six acceptance cases.
- **AC-5** The `switch-track` recorded ratio is recomputed: with the live `globals.css`, the three track rows' `1.43:1 / 1.75:1` reconcile within 0.01; a constructed row stating 1.59:1 against the same tokens is rejected. Channel: two `it` cases.
- **AC-6** Stale-row direction: a scratch copy with PublishedToggle's OFF fill moved to `bg-surface` (the draft escape) reds as BOTH an unregistered key and a stale row, and the stale-row message names the registered row. Channel: one `it` case asserting both lists by equality.
- **AC-11** Per-category counts: the seeded census holds exactly 3 / 5 / 2 / 2 / 0 / 0 rows by category, asserted against literals. Channel: one `it` case.
- **AC-12** The census-overlap pin of §3.7: `residue ∩ CENSUS` equals exactly the ShareHub line-781 row and that row's category is `responsive-skin-filed`. Channel: one `it` case.
- **AC-13** The projection's normaliser agrees with the shipped one, and the oracle classifies every spelling the grammar rounds raised: for every token of every live residue element, `utilityOf(token)` equals `normalizeToken(token)` from `tests/styles/_childlessGrowableScan.ts`; and each of the twenty-eight residue forms of §3.2's two tables (twenty weak spellings, the `var()` form, seven unclassified literals and keywords), substituted into a scratch copy of `UnignoreButton.tsx`, is residue, while the four controls (`border-borde`, `border-text-faint/50`, `border-transparent`, `border-warning-text/60`) are not; `classifyValue` returns the class each table states, by equality; and the three non-compiling paint-prefixed tokens of §3.3's probe (`border-borde`, `bg-bogus`, `border-border-strong!!`), each appended to `PublishedToggle`'s OFF alternative on its own scratch root, leave that element's key EQUAL to the live key while `bg-surface` appended changes it; and the ten variant tokens of §3.3's selector probe, each appended to the ON alternative on its own root, give `keyChanged` and `ON-alt weak` exactly as the table states (six in and weak, four out and not), by equality on both. Channel: five `it` cases, the second with thirty-two scratch roots, the fourth with four, the fifth with ten.
- **AC-14** Per-occurrence bar evaluation: a scratch copy giving `app/help/errors/page.tsx`'s jump-list anchor the skip link's paint plus `focus-visible:outline-none` and no ring produces a second element with the line-70 key, and the suite reds naming line 82 while line 70 passes. Channel: one `it` case asserting the problem list by equality.
- **AC-15** The oracle is alive and agrees with the ruling on the canonical forms, at module scope before any census case: `classify(oracle, ["border-border-strong", "border-accent-edge", "group"])` yields weak on all four sides, strong on all four sides, and `null` respectively. A design system that failed to load, or a theme missing the weak colours, fails here by name. Channel: a `premise` plus one `it` case asserting the three classifications by equality.
- **AC-16** Planted defect, different producer: an oracle loaded from a copy of `app/globals.css` with the `--color-border-strong` declaration removed compiles `border-border-strong` to nothing, and the live residue under it is exactly the seven `border-border` elements, asserted by name; the census equality against the twelve rows would red naming the five stale rows, asserted on the problem list. In the same run the shipped `_metaControlOutlineFill` pins stay green (they read no oracle). Channel: one `it` case with the CSS string as its input, plus the run log of 1.12's paired invocation.
- **AC-17** Tailwind-version coupling is a feature: a `premise` that `tailwindcss`'s installed major is 4, and a comment on the census naming the version the rows were classified under; a classification change after an upgrade reds the census by construction (AC-1's equality) and is re-decided row by row, never re-seeded. Channel: `premise` on the package version.
- **AC-7** Premise at module scope, unconditional: the live scan's element count exceeds a floor of 200 (the shipped pin measures 362); a scanner returning `[]` would make "zero unregistered keys" vacuous. Channel: `premise(...)` from `tests/_shared/premise.ts`, outside any `.each`.
- **AC-8** The `DIVIDERS` cross-assertion of §3.7 holds. Channel: one `it` case.
- **AC-9** Enrolment: the registry row and `EXPECTED_LEDGER_KINDS` entry exist, `pnpm mutation:sites` lists the surface with a non-zero site count, and the first scored run's score and unaccepted-survivor set are stated in the round-1 diff brief. Channel: the registry diff and the scored run's output.
- **AC-10** No file under `app/` or `components/` is in the diff: `git diff --name-only origin/main...HEAD -- app components` is empty. Channel: the command's output at closeout.

---

## 5. Verification and self-proofs

The suite proves things about itself before it proves anything about the corpus, following `2026-08-16` spec §5.3:

1. **Literal census size.** `RESIDUE_CENSUS.length` is asserted against the literal the seeding task produced (12), never against anything derived from the census. Deleting a row must red here even when every surviving row still resolves.
2. **Distinct rows.** The multiset of row keys equals the multiset of live residue keys in both directions; a duplicated row cannot stand in for a deleted one.
3. **Every row's category bar passes on EVERY live element sharing its key**, not on the row alone and not on the first match: `validateRow(row, element, css, ledgerText)` once per occurrence, failure naming the occurrence's line (§3.4). A row whose paint strings no longer match any live element is stale (direction 2) and never reaches the bar.
4. **Negative controls are expect-a-report, and every expect-clean case is paired.** The twelve floor cases of AC-2 and the eighteen bar cases of AC-4 each assert a produced value by equality. Every case that expects an element NOT to be residue lives in a fixture that also contains an element that IS residue, one variable away, and asserts both, with a `premise` that the fixture produced at least two elements; a fixture the scanner fails to parse therefore reds the premise instead of passing the negative. No case in the suite passes because something was absent.
5. **Pre-dispatch mutants (four, per `docs/agents/writing-plans.md`, string-presence guards).** Recorded in the seeding commit, each as a paired fixture per item 4: (a) `isWeakValue` neutralised to `false` (never an excision, so the module stays collectable), expected to red the ten inequality floor cases and the census equality with twelve stale rows, the two equality controls staying green (an empty residue equals an empty residue); (b) a typo (`border-borde`, which compiles to nothing) beside `border-border-strong/50`, expected NOT residue and residue respectively (the non-report and the report, one character apart); (c) the token present but not live: inside a comment, inside an attribute other than `className`, each beside a live `className` twin, expected NOT residue and residue; and behind a literal `false &&` branch, expected residue (the scanner reads both branches and the path model keeps the dead one; that is the conservative direction and is asserted, not assumed); (d) each discriminating parameter varied in a paired fixture: the variant chain present/absent, `unresolved` true/false, a `<div>` beside a `<button>` for the tag in and out of `isInScope`.
6. **Parse-cache hazard, pinned.** The AC-2 cases use a distinct scratch root per mutant, and one case asserts that two roots with different bytes at the same relative path produce different residues, so the `sourceCache` behaviour that corrupted the first probe run cannot silently return.

---

## 6. Documented limits

Each is a stated position, not an open gap. Per the 2026-08-04 filing bar, a hypothetical whose worst case is conservative behaviour plus a surfaced signal belongs here.

- **Effective paint is measured among Tailwind utilities on the element, and nowhere else.** The oracle resolves the cascade among the element's own tokens (§3.2). A `switch-track` row's recorded OFF ratio is recomputed from its two tokens; every other row's ratio is whatever the reason says. A registered element whose outline token is unchanged but whose ground changed by a mechanism outside the paint projection (an ancestor's background, a `bg-transparent` control moved onto a new ground, `opacity-*`) is not seen. This is the half of the row's ambition Outcome A would have bought (§1.2), taken as the documented-limit close (§1.7).
- **Weak means the two variables; a literal means a row.** A declaration is weak when it references `--color-border` or `--color-border-strong`, and UNCLASSIFIED, which is also residue, when it is anything but a theme-variable reference or `transparent` (§3.2): every literal notation, `currentColor`, a non-colour `var()`. No colour is ever compared, so no notation can slip past; a legitimate strong literal pays a ledger entry naming the file and the value, and that entry, under the ledger's own filing bar, is where why-a-token-would-not-do is argued; a row-local reason field was tried and is satisfiable by echoing the value (spec round 6), which is why the form is the ledger. A resting outline at a THIRD theme colour (`border-surface-raised`, `border-bg`, any other `--color-*`) is STRONG by the oracle and outside the question by design, as is a boundary painted by a property the oracle does not read (`outline-*`, `ring-*`, `divide-*` on a parent): the rulings name two colours and one property, and a third colour or another property is a new ruling, not a spelling. Re-file trigger: a third theme colour appearing as a resting outline on an interactive element, at which point it joins `WEAK_COLOURS` as a deliberate edit with its own seeded rows.
- **Non-Tailwind paint.** Inline `style`, CSS modules, and `globals.css` rules that target an element by selector are outside the scanner's projection entirely, as they are for every guard in `tests/styles/`.
- **The element cover.** Text-entry fields, `<select>`, and outlines on a non-interactive child are `BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER`. The two nested-span tracks (`AutoRefreshControl.tsx`, `DeveloperToggleButton.tsx`) are held only by the `TRACK_PATHS` source-presence check.
- **The unresolved pool.** Thirteen elements the scanner cannot read are counted, not classified; if one carries a readable weak token it is residue (none does today). An unreadable weak token on an unreadable path is invisible here and counted there.
- **Re-pin reflex.** A contributor who reds the guard by changing a track's OFF fill can re-register the row with the new strings; the `switch-track` bar then recomputes the ratio they must write down, and `DESIGN.md` §1.2a's recorded 1.43/1.75 will disagree with the row. The guard makes that disagreement visible in the diff; it does not prevent it. Review's class.
- **A content-free `literal-outline` entry.** A ledger entry that names the file and the compiled value and argues nothing passes the bar (spec round 7). The bar guarantees that a literal outline is filed where the queue is read, linked to its file and value, and costs more than tokenising; it does not grade the argument, which is review's class, as trackness is (next bullet). Stated here so the bar is not read as deciding it.
- **Key membership and weakness read ONE selector rule and ONE property set.** Both consumers read the rules whose subject is the element (§3.3); neither reads a rule that paints a child or a descendant (`*:`, `**:`, `[&>…]:`, `divide-*`), which is the element cover's limit (`BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER`), stated here so it is not read as a gap in the key alone. `border-radius` and its corner forms are shape, not paint, and are outside; a boundary painted through `ring-*`, `outline-*` or `shadow-*` declares no `border*`/`background*` property and is outside the key and the oracle alike (probed, §3.3). `sr-only` (`border-width: 0`) is inside, because removing the outline is paint. A second definition of either predicate would fork from the first (spec rounds 7 and 8 were both that fork); there is one.
- **A false `switch-track` row.** An element that is not a track but carries the exact ON/OFF recipe passes the form bar (§1.5). Registering it costs a false citation of the ruling, a bump of the pinned `switch-track` literal, and a diff that shows both. Trackness is a ruling, not a projected property; this is the one place the census trusts a reviewer rather than a bar, and it is stated here so the bar is not read as deciding it.
- **Token order is not a signal.** The projection is sorted, so a guard cannot see a reorder; by the stylesheet-order rule a reorder changes no paint, so nothing is lost.
- **Important markers.** The oracle reads Tailwind's `!important` and it wins the cascade (§3.2). A token with two markers, or a `!` inside a variant, compiles to nothing and is a non-report.
- **Logical sides are read as left-to-right physical sides.** `border-s-*` and `border-inline-start-color` map to left, `-e` to right; a right-to-left document swaps them, and since a weak winner on ANY side is residue, nothing is lost by the mapping.
- **Variant groups do not compete.** `hover:` and `focus:` are separate states and a compound chain (`focus:hover:`) is its own group; a weak winner in any group is residue. Tailwind's variant specificity stacking is not modelled between groups, which can only add residue, never clear it.
- **Tokens that compile to nothing.** `group`, `peer`, a typo: a non-report, justified in §3.2 (a token that compiles to nothing paints nothing in production either), and outside the paint projection (§3.3), so one added beside a live recipe changes no key. The suite never reds on them and never asks for a row. A token that compiles to nothing today and to paint after a Tailwind upgrade enters the key then, which is AC-17's event surfacing, not a contradiction.
- **Content-key multiplicity.** Two identical elements in one file are one key with count two. Adding a third identical one reds (count 3 ≠ 2); swapping which of two identical elements is which is invisible, by construction and harmlessly.
- **Cost threshold.** §1.6: more than thirty residue entries, or more than eight rows added or re-keyed in a rolling thirty days as measured by the key diff, re-opens the B close.
- **Variant semantics are not evaluated.** `max-sm:border-border` is keyed as a token; that it paints only below 640px is the reason's job, not the guard's. The `responsive-skin-filed` bar checks the variant's presence, not its breakpoint.

---

## 7. Threat fence and probe domain (for every review brief on this arc)

- **THREAT FENCE:** the guard defends against accidental authoring by an ordinary contributor: copying a pre-ruling recipe, adding a control at a weak token, refactoring a switch track so its outline lands on a different element, half-swapping a ternary, writing a lazy reason row, marking a token important, adding an opacity modifier. Adversarial obfuscation of a className (computed strings, dynamic token construction, third colours, non-Tailwind paint) is OUT of scope and files to §6. A probe outside this fence is a documented limit, never a finding.
- **PROBE DOMAIN:** the live `app/` + `components/` corpus as `scanInteractiveElements` reads it (362 elements at `00beaf19e`), and the twelve cases of §1.4.3's acceptance floor (ten source mutations, two control edits) applied to a copy of `components/admin/PublishedToggle.tsx` / `components/admin/UnignoreButton.tsx`, plus the thirty-two forms of §3.2's two tables, the twenty-one distinct tokens of §3.3's three probe tables, and the duplicate-key instance of §3.4. One ordinary edit away from one of those is admissible; a constructed component shape that occurs nowhere in the corpus is §6.
- **CONSEQUENCE BOUND:** §2, first paragraph, verbatim.
- **DO NOT RELITIGATE:** §1.1's table, the five-escape table in the `BACKLOG.md` row, the no-sixth-predicate fence as answered in §1.4.2, and the three-outcome framing ratified by `bl-orch` on 2026-08-21.
- **CLOSED CRITERION:** §2, last paragraph. A finding is admissible only with a probe from the domain showing a silent wrong clear (an element carrying a weak token that the suite neither registers nor reports) or a wrong red on the live corpus. A missing category, a hypothetical token, or a shape outside the fence is §6.

---

## 8. Dimensional invariants

N/A. No component is created or changed (§1.1, last row but two).

## 9. Transition inventory

N/A. No component state is created or changed.
