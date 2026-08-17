# Surface discovery — unnameable action forms become nameable units (BL-SURFACE-DISCOVERY-UNNAMEABLE-ACTION-FORMS)

**Date:** 2026-08-17 · **Branch:** `fix/surface-discovery-unnameable-forms` · **Severity:** high ·
**Subject:** the shared invariant-10 discovery engine `tests/log/mutationSurface/enumerate.ts`.

## 1. Problem

`collectSurfaceUnits` (`tests/log/mutationSurface/enumerate.ts`, symbol `collectSurfaceUnits`)
models specific export and action forms, and Next registers several it does not. Nine escape
families are pinned as live fixtures in `tests/auth/_metaServerActionOriginGate.test.ts` (const
`ESCAPES`), each behind a `premiseHolds` guard asserting the engine STILL fails to discover the
form. A Server Action written in any of those forms is invisible to BOTH consumers of the engine:

- the same-origin sweep (`tests/auth/_metaServerActionOriginGate.test.ts`) closed its own exposure
  with a fail-closed tripwire (`undiscoverableConstructs`, private to that file) — such a form now
  FAILS BY NAME there;
- the invariant-10 observability walk (`tests/log/_metaMutationSurfaceObservability.test.ts`, test
  "every discovered mutation surface unit is accounted for") has NO such tripwire. A mutating
  action in an unmodeled form produces zero units, so it is a **dark mutation surface**: not merely
  ungated but uninstrumented, and the meta-test reports nothing because the unit never exists. This
  breaks invariant 10's stated contract ("static discovery, filesystem-walked so a NEW surface
  fails-by-default", `AGENTS.md` invariant 10).

The origin-sweep spec ratified the handoff: "The residual is that discovery itself stays
incomplete, which is the invariant-10 engine's contract to fix rather than this arc's"
(`docs/superpowers/specs/2026-08-16-server-action-origin-sweep-design.md` §7, "Discovery is not
total" bullet). This arc is that fix.

**What "fixed" means (the consequence bound):** after this arc, every construct in the walked
corpus that Next would register as a Server Action endpoint is either (a) discovered as a keyed
`SurfaceUnit` — and therefore subject to the invariant-10 accounting and the origin sweep — or
(b) refused BY NAME at the offending file with a diagnostic that says what to rewrite. Nothing is
silently absent from both sides. A named refusal is the designed outcome for the residue, not a
gap: it is how an unnameable form "becomes a nameable unit" — the contributor gives it a name.

## 1.1 Resolved scope — do not relitigate

1. **Repair direction is totality-by-construction over two derived domains, plus a fail-closed
   residue — not per-form recognizer growth.** The two domains (§3.1) are the same two the origin
   arc's tripwire proved total across five review rounds
   (`docs/review-rounds/fix/server-action-origin-sweep/daa53759a953.md`, diff §: counters "total
   over their domain… fails BY NAME on any surplus"). The origin arc declined to widen discovery
   because the engine was shared infrastructure that arc did not own and casual widening is the
   direction `AGENTS.md` warns against ("Repair direction under same-axis recurrence"); the ledger
   entry filed the redesign under class-sweep exception (c) precisely so it could be done
   deliberately, here, once, against a derived cover. Findings proposing to enumerate additional
   individual forms — or to decline the redesign because widening is banned — relitigate this.
2. **Anonymous actions are refused by name, never given synthesized names.** Precedent already in
   the engine: a default-exported action is banned because "a default-exported action would be an
   un-named surface that evades per-function keying" (`moduleDefaultExports`,
   `tests/log/mutationSurface/enumerate.ts`, symbol `moduleDefaultExports`; ratified at origin
   spec §7 "A default-exported Server Action is closed upstream"). Synthesized ordinal names
   (`F#action-1`) silently re-key on any edit that reorders the file, dangling
   `AUDITABLE_MUTATIONS` / exemption rows keyed on `file + fn` — the drift class invariant 10
   exists to prevent. The rewrite demanded of the contributor is one ordinary edit: bind the
   action to a named `const` or named function.
3. **Statically unresolvable exported initializers are refused by name.** `export const x =
   withFoo(async () => {...})` (higher-order call), a conditional, or any initializer the resolver
   of §3.2 cannot reduce to a function body is a named refusal, not a unit — the body that would
   need scanning cannot be located statically. Documented limit (§7), same fail-closed posture.
4. **The totality tripwire becomes engine-owned and single-sourced.** The origin test's private
   `undiscoverableConstructs` / `exportedValueNames` / `inlineDirectiveBearingCount` copies are
   replaced by imports of the shared engine exports (§3.5); two copies of the totality contract
   would drift. The origin test keeps its own assertions and fixtures; only the helpers move.
5. **Instrumentation semantics are untouched.** `scanBody`, `importBindingOk`, admin
   classification rules (path-based for routes, `scanBody(...).adminGated` for actions), the
   exemption registries, and `evaluateUnit` in the observability test change only insofar as newly
   discovered units flow through them. No change to invariant 10's emit contract.
6. **Route discovery is out of scope.** `routeMutatingMethods` already covers the route export
   forms; no escape family touches routes (all nine are action forms).
7. **The walked corpus stays `app/`, `lib/`, `components/` with `.ts`/`.tsx`** (default of
   `walkSourceFiles`, `lib/messages/__internal__/walkSourceFiles.ts`, symbol `walkSourceFiles`).
   Root/extension widening is a repo-structure event, ratified out of scope by origin spec §7
   ("The walk covers `app/`, `lib/`, `components/`").
8. **Enrolment precedes review.** `tests/log/mutationSurface/enumerate.ts` is an importable module
   with referring Vitest suites, therefore source-mutation-registry expressible (registry rows
   already target `tests/` paths, e.g. `tests/mutation/source/premiseScan.ts` in
   `tests/mutation/source/registry.ts`, const `GUARD_SURFACES`). The plan front-loads enrolment;
   the implementation arc's round-1 diff brief states the mutation score and unaccepted-survivor
   set per `AGENTS.md` convergence-criterion bullet 4.

## 2. Background — probed, not theorized

- **The nine escape families are pinned executable, not described.** `ESCAPES` in
  `tests/auth/_metaServerActionOriginGate.test.ts` holds one fixture per family with an `actions`
  count and a premise that reds the moment the engine starts discovering the form. The reviewer's
  original probe ran the real Next 16.3 transformer over form-variants of live files
  (`CROSS_SITE_UNGATED_MUTATIONS=8/8`, recorded in the ledger entry) and was reproduced against
  the committed engine. This spec adds no new claim about what Next registers — it inherits the
  probed set.
- **The live tree contains zero instances of any escape form.** The origin sweep's live-tree
  totality test ("discovery is TOTAL over this tree, or the walk fails by name",
  `tests/auth/_metaServerActionOriginGate.test.ts`) is green on `origin/main`, and it ranges over
  the same roots with the same counters. Consequence: widening discovery changes NO live unit set
  beyond what exists today, and the observability live floor
  (`tests/log/_metaMutationSurfaceObservability.test.ts`, "live discovery — zero unaccounted
  surfaces") stays green without new registry rows. Any divergence from this prediction during
  implementation is itself a finding (a live escape-form action was dark) and is dispositioned
  through the normal invariant-10 mechanisms, not silently absorbed.
- **Engine consumers (complete, from `grep -rln "mutationSurface/enumerate"`):**
  `tests/log/mutationSurface/enumerate.test.ts`, `tests/log/_metaMutationSurfaceObservability.test.ts`,
  `tests/log/adminOutcomeBehavior.test.ts` (line ~4575, filters `u.admin` over the live walk),
  `tests/log/_auditableMutations.shape.test.ts` (imports `parse`, `routeMutatingMethods` only),
  `tests/auth/_metaServerActionOriginGate.test.ts`.

## 3. Design

### 3.1 The accept-set: two total domains

Discovery ranges over exactly two domains, each computed by a deliberately dumb TOTAL reader that
inspects names and directive prologues, never initializer shapes:

- **D1 — module-action names:** every exported VALUE name of a file whose module prologue contains
  `"use server"` (`moduleHasUseServer`). Computed by the recursive `BindingName` walk + export-list
  reader the origin arc proved total (today `exportedValueNames` in the origin test; moves into the
  engine per §3.5). Type-only exports excluded. Re-exports with a module specifier excluded
  (checked where declared — existing contract, `collectModuleActions` doc comment).
- **D2 — inline-action bodies:** every function-like node (`ts.isFunctionLike` — total over kinds,
  including ones TypeScript grows later) whose block body's leading string-literal run contains
  `"use server"` (today `inlineDirectiveBearingCount` in the origin test; moves into the engine).
  Counted in EVERY file, including files that are themselves `"use server"` modules.

**Accept-set statement:** discovery ACCEPTS a D1 member when its name resolves through §3.2 to a
function body, and a D2 member when §3.3 derives a name for it. Everything else in D1 ∪ D2 is
REJECTED BY NAME via §3.4. There is no third outcome. The domains are keyed on structure (export
name lists, directive prologues), not on spelling of initializers — a form nobody modeled lands in
a domain by construction and, if unresolvable/unnameable, surfaces as a refusal rather than
vanishing.

### 3.2 Module-action resolution (D1 → units)

For each D1 name, resolve to the declaration whose body is the checkable scope. The resolver is a
small closed set of reductions, applied recursively with a visited-set (cycle-safe) and no depth
beyond module top-level statements:

1. **Export-modified `FunctionDeclaration`** — the declaration itself (existing).
2. **Export-modified `VariableStatement`, identifier binding** — the initializer, reduced by:
   - **paren unwrap:** `ts.isParenthesizedExpression` → its expression, repeatedly
     (closes R1 "paren-wrapped");
   - **arrow / function expression** → that node (existing);
   - **identifier alias** → the local declaration of that identifier (function declaration, or
     `const`/`let` initializer, reduced recursively) (closes R1 "aliased through an intermediate
     binding" when combined with 4);
   - anything else → **unresolvable** (refusal, §3.4).
3. **Export-modified `VariableStatement`, binding pattern** (`export const { doIt } = bag`,
   `export const [doIt] = arr`): resolve the pattern element against the initializer ONLY when the
   initializer (after paren/alias reduction) is an object/array LITERAL whose matching
   property/element is itself reducible to a function body (closes both R2 binding-pattern forms).
   Computed member names, spreads, defaults, or non-literal initializers → unresolvable.
4. **Local export list** `export { local as name }` — resolve `local` per rules 2–3's reductions
   (today `findLocalDeclNode` handles only direct function/arrow declarations; it gains the same
   reduction set).

Unit: `{ file, fn: exportedName, kind: "module-action", node: resolvedBody, admin:
scanBody(resolved, { descend: false }).adminGated }` — unchanged shape
(`tests/log/mutationSurface/enumerate.ts`, type `SurfaceUnit`).

The resolver is a CLOSED reduction set, not a grammar: adding a reduction is a spec change. Its
totality obligation is discharged not by resolving everything but by the reconciliation (§3.5):
`resolved + refused === |D1|` per file, by name.

### 3.3 Inline-action collection (D2 → units)

`collectInlineActions` changes in three ways, each closing pinned escapes:

1. **Runs for every file** — the `moduleHasUseServer` early-return in `collectFileSurfaceUnits`
   no longer skips inline collection (closes R2 "nested inside a file-level `use server` module").
   **Dedupe by node identity:** a node already emitted as a module-action (or reachable as one via
   §3.2 resolution) is not additionally an inline-action unit; each D2 body maps to exactly one
   unit or one refusal.
2. **Predicate widens to `ts.isFunctionLike`** with a block body — replacing the three-way
   `FunctionDeclaration | FunctionExpression | ArrowFunction` check (closes R1 "object method" and
   R2 "static class method"; getters/setters/constructors and future kinds covered without naming
   them). Directive detection stays `functionBodyHasUseServer` — its `leadingDirective` already
   reads the whole prologue run (closes nothing new; R2's prologue fixture failed on anonymity,
   not the prologue).
3. **Naming (`inlineName`) widens to the nearest named context, as a closed list:**
   - own name (named function declaration/expression — existing);
   - `VariableDeclaration` identifier (existing);
   - `PropertyAssignment` identifier/string name (existing);
   - **`MethodDeclaration` / accessor with identifier or string-literal name** → that member name
     (new; covers object methods and class members, `static` included);
   - no context matches → **unnameable** (refusal, §3.4; this is the anonymous-JSX-`action` form
     and the anonymous prologue form).

   The name is the bare member/binding name (no qualification) — consistent with existing keying.
   Collision safety comes from §3.4's uniqueness rule, not from qualified names.

### 3.4 Refusals and uniqueness — the fail-closed residue

A new engine export (working name `discoveryGaps(roots, units): string[]`; final naming is plan
detail) reconciles both domains against produced units, per file, and returns one message per
offender, empty when discovery was total. It subsumes the origin test's `undiscoverableConstructs`
and adds:

- **D1 refusal (PER-KIND, not pooled):** an exported value name of a `"use server"` module with no
  unit **of kind `module-action` produced by that file's §3.2 resolution** — message names the
  file, the export, and the rewrite ("bind `<name>` directly to an async function declaration
  or arrow — discovery cannot statically locate the body behind this initializer"). Matching D1
  names against the pooled all-kinds name set is a ratified DEFECT, not a simplification: an
  inline-action unit that happens to share the unresolved export's name masks the refusal (spec
  review R1, probe: one unresolvable export named `nested` added to the R2 nested fixture — D1
  `["nested","outer"]`, module units `["outer"]`, inline units `["nested"]`, pooled set satisfied,
  zero refusals, zero duplicate keys). The committed private tripwire
  (`undiscoverableConstructs`, origin test) carries exactly this pooled-kind collision — it reads
  `found.map((u) => u.fn)` over ALL of the file's units — and the move into the engine (§3.5)
  repairs it: D1 reconciles against module-action units only, D2 against inline-action units only
  (the D2 side is already per-kind today).
- **D2 refusal:** more directive-bearing bodies than the inline-action units plus module-action
  units whose resolved node is a D2 body — message names the file and the rewrite ("bind this
  action to a named const/function; anonymous actions cannot be keyed" — wording per family where
  distinguishable).
- **Duplicate key:** two units in one file sharing `fn` — message demands a rename. (Two units
  with one `file+fn` key would let one satisfy the other's registry row; refusing is cheaper and
  total, versus qualified-name schemes that re-key existing registries.)

Every diagnostic states the fix, per §12.4-adjacent messaging discipline for developer-facing
failures (these are test-failure messages, not user-visible UI — invariant 5 does not apply).

### 3.5 Single-sourcing and API

- `exportedValueNames`, the D2 counter, and the reconciliation move INTO the engine (either
  `enumerate.ts` itself, or a new sibling module in the same directory importing enumerate's
  helpers — plan decides the split; one module owns the contract either way).
- `tests/auth/_metaServerActionOriginGate.test.ts` deletes its private copies and imports the
  engine's; its live-tree totality test and fixture self-tests keep their assertions.
- `collectSurfaceUnits` keeps its signature and return type (five consumers, §2). The
  reconciliation is a separate export so read-only consumers (`adminOutcomeBehavior`,
  `_auditableMutations.shape`) are untouched.

### 3.6 Consumer + fixture disposition matrix

Escape-family fixtures (`ESCAPES`, origin test) — every premise there reds when discovery widens,
so this table lands in the SAME change as the engine:

| # | Family (fixture label) | Post-repair outcome | New pin |
|---|---|---|---|
| 1 | R1 paren-wrapped module export | unit `wrapped`, module-action | positive discovery pin (name, kind, body scanned) |
| 2 | R1 aliased intermediate binding | unit `doIt`, module-action, node = `impl` body | positive pin |
| 3 | R1 anonymous JSX `action={...}` | REFUSED by name (D2 refusal) | refusal-message pin |
| 4 | R1 inline object method | unit `doIt`, inline-action | positive pin |
| 5 | R2 object binding-pattern export | unit `doIt`, module-action | positive pin |
| 6 | R2 array binding-pattern export | unit `doIt`, module-action | positive pin |
| 7 | R2 nested inline in `"use server"` module | units `outer` (module) + `nested` (inline) | positive pin, both units |
| 8 | R2 directive prologue, anonymous | REFUSED by name (D2 refusal) | refusal-message pin |
| 9 | R2 static class method | unit `doIt`, inline-action | positive pin |

Positive pins assert unit `fn`/`kind` AND that the unit is live for instrumentation purposes
(e.g. `scanBody` sees the fixture's write builder). Refusal pins assert the exact family appears
in `discoveryGaps` output and that units for that file are absent — fail-closed both directions.
The negative fixtures (quiet on ordinary code) are retained as-is.

Suite-level dispositions:

| Consumer | Change |
|---|---|
| `enumerate.test.ts` | new cases per §3.2/§3.3/§3.4 (TDD red-first) |
| `_metaMutationSurfaceObservability.test.ts` | NEW live assertion: `discoveryGaps(["app","lib","components"], units)` is empty — invariant-10 parity with the origin sweep |
| `_metaServerActionOriginGate.test.ts` | helper imports swap (§3.5); ESCAPES matrix above; live totality test now consumes shared export |
| `adminOutcomeBehavior.test.ts`, `_auditableMutations.shape.test.ts` | no change (verified: import surface untouched) |

### 3.7 Mutation-registry enrolment

`tests/log/mutationSurface/enumerate.ts` (and the totality sibling if split out) is enrolled in
`GUARD_SURFACES` (`tests/mutation/source/registry.ts`), suite = `enumerate.test.ts` at minimum
(plan decides whether the observability suite joins `suitePaths`; the origin test's live walk
makes it expensive — ~whole-tree parse per run). Control mutant, operators, and score floor per
registry contract (`tests/mutation/source/registry.ts`, type `GuardSurface`). Scored via
`pnpm mutation:guards` BEFORE the implementation arc's first diff-review dispatch; unaccepted
survivors empty or dispositioned in the round-1 brief. Per the lessons file: score in the
foreground, before holding a mergeable PR.

## 4. Acceptance criteria

- **AC-1:** each of the nine `ESCAPES` families lands per the §3.6 matrix — seven discovered with
  the stated `fn`/`kind`, two refused by name — proven by executable pins in the committed suites.
- **AC-2:** `discoveryGaps` is exported from the engine (or sibling), the origin test's private
  helper copies are deleted, and both consumers assert live-tree emptiness.
- **AC-3:** the observability meta-test fails (by name, with remediation text) on a fixture tree
  containing any refusal-class construct — the invariant-10 dark-surface hole is closed.
- **AC-4:** the live tree yields an unchanged unit set (±the zero predicted by §2) and all five
  consumer suites are green without new exemption/registry rows.
- **AC-5:** the engine is enrolled and scored; score + survivor set stated in the implementation
  round-1 diff brief.
- **AC-6:** duplicate `file+fn` keys refuse by name (new fixture proving it).
- **AC-7:** the cross-domain collision fixture (the spec-review R1 probe: an unresolvable D1
  export sharing its name with a distinct D2 inline unit in one file) REFUSES the D1 name — a
  pin proving reconciliation is per-kind, in both the engine suite and the origin test's fixture
  self-tests.

## 5. Plan-wide invariants touched

Invariant 10 (the subject — its fail-by-default contract is what totality restores). Invariant 1
(TDD per task). Invariant 6 (commit style; `test(log)` / `fix(log)` scopes expected). No UI
surface. No DB surface. No advisory-lock surface.

impeccable-gate: N/A — no UI surface

### 5.1 Dimensional Invariants

N/A — no rendered component.

### 5.2 Transition Inventory

N/A — no visual states.

## 6. Testing strategy

TDD per task: every §3.2/§3.3 reduction and §3.4 refusal gets a red fixture first (the ESCAPES
fixtures are the round-1 reds for seven of them — spliced into engine-local suites, then the
origin-test premises flipped in the same task that greens them). Anti-tautology: positive pins
assert against the unit's resolved node behavior (`scanBody` sees the fixture's write builder),
not merely unit count; refusal pins assert message content naming the family, not just non-empty
arrays; premise guards (`tests/_shared/premise.ts`, `premiseHolds`) carry over so a fixture that
stops exercising its branch reds instead of passing vacuously. Mutation gate per §3.7 is the
mechanical convergence backstop.

## 7. Documented limits (round 0)

- **Higher-order-wrapped exports refuse rather than resolve** (`export const x = withFoo(impl)`).
  The body behind the wrapper is not statically locatable; the refusal names the export. Live
  corpus contains zero instances (origin totality test green). Revisit only if a live pattern
  demands it — as a spec change adding a reduction, never an inline widening.
- **Binding-pattern resolution requires a literal initializer** (§3.2 rule 3). `export const
  { doIt } = makeBag()` refuses by name.
- **Anonymous actions refuse rather than synthesize** (§1.1.2). The rewrite is one ordinary edit.
- **`.ts`/`.tsx` under `app/ lib/ components/` only** (§1.1.7). A `.js` action or a novel root
  evades both walks equally; repo-structure event, inherited limit.
- **Re-exports with a module specifier are checked where declared** (existing contract). A
  `"use server"` module re-exporting another module's action is that module's unit.
- **The engine decides discoverability, not mutation-ness.** Whether a discovered body mutates
  remains `scanBody`'s bounded model + the registries — inherited posture, origin spec §7 ("No
  predicate in this design decides whether a body can mutate").
- **Adversarial obfuscation is out of scope** (threat fence, §8). A contributor determined to hide
  an action from static analysis (eval, codegen, dynamic import tricks) defeats any static walk;
  the defense is review, not this engine.

## 8. Review contract (for every brief on this arc)

- **Consequence bound:** every construct in the walked corpus is discovered as a keyed unit OR
  refused by name — never silently absent from both sides. A conservative refusal plus a named
  diagnostic is a DOCUMENTED LIMIT, not a finding.
- **Probe domain:** the committed fixture corpora (`ESCAPES` and negatives in
  `tests/auth/_metaServerActionOriginGate.test.ts`, fixtures in `tests/log/**`), and the live
  corpus `app/ lib/ components/`. An admissible probe is drawn from that set or is one ordinary
  edit away from a member, executed against the real engine (or the real Next transformer). A
  constructed grammar corner outside it files to §7.
- **Threat fence:** accidental authoring by an ordinary contributor. Adversarial obfuscation files
  to §7, never to a round.
- **Score (implementation stage):** mutation score + empty unaccepted-survivor set for the
  enrolled engine (§3.7) — machine-computed. A "discovery misses X" finding is admissible only
  with a probe from the domain above; a "the guard does not pin what it claims" finding is
  admissible only with a surviving mutant from the declared operator set.
