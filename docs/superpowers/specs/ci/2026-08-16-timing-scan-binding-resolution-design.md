# Timing scan: resolve an identifier delay against its BINDING, not its spelling

**Date:** 2026-08-16 · **Arc branch:** `fix/timing-scan-scope-resolution` · **Entry:** `BL-TIMING-SCAN-NAME-VS-BINDING` (BACKLOG.md, filed 2026-08-15, effort M) · **Status:** spec-APPROVED by SUBSTITUTE review — see §7

## §7 Review posture — what gated this spec, and what did not

**Cross-MODEL review was unavailable; independent review was not.** The round-1 dispatch went out through `codex-guard` (`--stage spec --round 1`; brief and wrapper output under the gitignored `.review/` directory, both paths in the corpus row) and returned `status: "no_verdict"`, `failureReason: "attempts_exhausted"` on all three attempts, each ending `You have hit your usage limit … try again at Aug 22nd, 2026 4:09 PM`. Infrastructure fault, never a finding count.

Four independent fresh-eyes reviewers were spawned as the substitute — two on the spec, one on the plan, one terse pass over both. **Every one of them went idle without delivering, and every one of them had already written its report.** The delivery path failed, not the review: the reports were recovered verbatim from `~/.claude/projects/<workspace>/<sessionId>/subagents/agent-a*.jsonl` by scraping each transcript's last assistant message. **Recover before degrading** is the rule that saved this round; degrading first would have discarded 26 findings, two of them BLOCKING.

Round-1 verdicts: BLOCKING (mechanism lens), NEEDS-ATTENTION (discipline lens), NEEDS-ATTENTION (plan lens), APPROVE with zero findings (terse lens). What they cost the design:

- **The declaration identity was wrong, and three of the four found it independently.** The draft keyed the covered set `${file}:${line}`; two bindings on one line share that key, so a delay referencing the non-timing one resolved into the constant's coverage and vanished — this arc's own defect class, reintroduced by the repair, and a REGRESSION against the name filter, which reports that site correctly. The mechanism reviewer demonstrated it one ordinary edit from `components/admin/wizard/step3ReviewSections.tsx` and `components/shared/ReportModal.tsx`, Prettier-stable at this repo's print width, and noted every AC passed while it shipped. Repaired before their reports were recovered, by this session's own probe P10; the reports confirm the repair and AC-12 pins it.
- **Every wall-clock figure in the draft was from a run the record does not contain.** The probes were re-run when their transcripts were captured for the record, and the prose kept the first run's numbers. All cost figures are now quoted from the committed transcripts (§3), and the correctness counts — which both reviewers verified independently — were right throughout.
- **`noResolve`'s safety argument was false as stated** (§4 item 1), the shorthand property form needs an API `getSymbolAtLocation` does not provide (§2.3), `refPos` rested on an unstated text identity (§2.3), and §4 item 2 described a hole the design does not have. Each is repaired below and attributed where it landed.

**What this still does NOT establish:** no OPPOSING MODEL has read this spec — every reviewer was another Opus instance, sharing this one's blind spots by construction. The implementation arc's diff review therefore carries the cross-model gate for the design as well as the diff, and its round-1 brief cites this section to say so.

## §0 Why

`scripts/scan-interaction-timings.ts` is the derived population behind `DESIGN.md` §5.5. Its delay half claims totality: every `setTimeout` / `setInterval` delay argument is a numeric literal, resolves to a covered constant, or is reported `unclassified` and fails `tests/docs/_metaInteractionTimingInventory.test.ts` until someone dispositions it.

Resolution is done by SPELLING. `scanRepo` collects `coveredNames` — a `Set` of the identifier text of every `named-constant` site anywhere in the universe — and drops any `unclassified` site whose `name` is in that set (the `coveredNames` / `resolved` pair inside `scanRepo`, `scripts/scan-interaction-timings.ts`; lines 636-642 of the version on `origin/fix/scanner-scope-totality`, which is what this spec is written against — see §1.1 item 5, and note that the file on `origin/main` is still the shorter pre-#827 one, so a line anchor into it will not match). So any binding anywhere carrying the same spelling counts as coverage, and a local one that shadows it is suppressed:

```ts
// alongside the real lib/ui/copyFeedback.ts export
const COPY_FEEDBACK_RESET_MS = readDelayFromRuntimeConfig();
setTimeout(fn, COPY_FEEDBACK_RESET_MS);
```

Before resolution that site is correctly `unclassified`; the name filter then removes it, and it appears in neither §5.5 nor the unclassified list. The delay half's own totality claim is therefore false. The header is not the over-claimer — it discloses the hole verbatim and names this ledger row; the sentence that goes too far is the one after it, "Every timer delay in the universe is therefore literal, resolved, or reported BY NAME. None passes silently."

**Reachability: PROBED BUT CONSTRUCTED. No live shadowing instance exists in the tree today** (§3, probe P1: one covered name is declared in two files, `SUCCESS_DISMISS_MS`, and both of its uses are same-file; zero shadows). The consequence today is bounded in two ways: the shadowing value in the constructed case is a runtime one, so no FIXED timing is hidden; and nothing in the live tree is being hidden at all. What this arc repairs is the guard's claim, before an ordinary refactor — extracting a helper, renaming a local, copying a component — makes the claim's falsity load-bearing. The repair is also a NARROWING: it deletes the name set rather than growing a recognizer (§2.1).

## §1.1 Resolved scope — do not relitigate

1. **The repair direction is fixed by the entry: resolve against the binding, not the name.** "Resolve identifiers against the binding IN SCOPE (the TypeScript checker already models this) instead of a name set" (BACKLOG.md, `BL-TIMING-SCAN-NAME-VS-BINDING`, **Scope if promoted**). This spec takes the checker option. The entry's alternative — narrow the name set per file and report every cross-file identifier `unclassified` — is REJECTED with evidence, not preference: 17 of the 35 live resolutions are cross-file imports (§3, probe P2), so per-file narrowing would file 17 correct resolutions as residuals and force 17 disposition rows for constants that already carry their own §5.5 rows. `EXPLICIT_INCLUDES` exists precisely so `lib/ui/copyFeedback.ts` resolves (`scripts/scan-interaction-timings.ts`, the `EXPLICIT_INCLUDES` entry's reason: "Without this include the delay resolves to nothing scanned and both call sites report `unclassified`").
2. **This arc does NOT widen what counts as a timing site.** No new form, no new key predicate, no change to `TIMING_NAME` or `isBoundaryTimingKey`, no change to the universe or its fences. The only behavior that changes is which already-recognized sites RESOLVE. A finding that proposes recognizing a new syntactic position is out of scope by construction.
3. **Property values are in scope for this arc, and that is the ratified handoff, not scope creep.** The 2026-08-15 scanner-scope-totality spec fenced property-value resolution to this row explicitly: "`duration: SOME_CONSTANT` reports `unclassified` … its disposition row (or the `BL-TIMING-SCAN-NAME-VS-BINDING` fix, when that lands with scope-aware resolution) is the path to a resolved row" (`docs/superpowers/specs/ci/2026-08-15-scanner-scope-totality-design.md` §4 item 2; §1.1 item 2 and §2.2 same document). Both positions ride the ONE filter this arc deletes, so repairing one and not the other would need extra code, not less.
4. **Autonomy:** user grant 2026-08-16 (Eric) for the BL-mediums batch; both user review gates WAIVED. Spec + plan are this session's segment; implementation is a separate session.
5. **Base-version sequencing is settled.** PR #827 (`fix/scanner-scope-totality`) edits this same file and had not merged when this spec was written. This spec is written against the LANDED design on `origin/fix/scanner-scope-totality`, not against `origin/main`, and the implementation branch merges `origin/main` and re-verifies every citation before its first task. Line anchors in this document are drafting-time locators against that ref; the durable anchors are the symbol names.

## §1.2 Convergence criteria (AGENTS.md, "Convergence criterion, not just admissibility")

- **CONSEQUENCE BOUND.** Every timer delay argument and every timing-named property value in the probe domain is a numeric literal, resolves to the DECLARATION that produced a covered `named-constant` row, or is reported `unclassified` BY NAME and fails the inventory test until dispositioned. No site is silently dropped, and resolution never depends on spelling: within the probe domain, two distinct bindings that share a name never resolve to each other. The default on every uncertainty — no symbol, an unresolvable alias, a declaration outside the scanned universe, a declaration that is not a covered row — is to REPORT. A conservative report plus a surfaced name is a DOCUMENTED LIMIT (§4), not a finding.
- **PROBE DOMAIN:** the scan universe on this tree — `app/**` + `components/**` minus `app/api/**`, plus `EXPLICIT_INCLUDES` (311 files, §3) — plus the nine constructed shapes in probe P5, each of which is one ordinary edit away from a live file (a local const, an inner-scope const, a parameter, a direct import, an aliased import, a barrel re-export, a property value). A probe drawn from outside that domain — an invented module-graph corner, a construct written to defeat resolution — files to §4, not to a round.
- **THREAT FENCE.** This guard defends against ordinary authoring and refactors by a contributor who is not trying to defeat the scanner: a local constant that happens to share a name, an extracted helper, a copied component, a rename. Deliberately adversarial shadowing — a module that re-exports under a colliding name to make a runtime value look like a covered constant — is OUT OF SCOPE and files to documented limits.
- **MUTATION SCORE.** `scripts/scan-interaction-timings.ts` is ALREADY ENROLLED in the source-mutation registry (`interactionTimingScan`, all six operators, `scoreFloor: 0.95`, suites `tests/docs/_metaInteractionTimingInventory.test.ts` + `tests/docs/interactionTimingScan.test.ts`; `tests/mutation/source/registry.ts:1142-1155`). The diff-stage convergence criterion is therefore the score plus an empty unaccepted-survivor set, both machine-computed: a "the guard does not pin what it claims" finding is admissible only with the surviving mutant that demonstrates it, from the declared operator set. Accepted-survivor `siteId`s are LINE-keyed and this edit shifts them, so the accepted set is RE-DERIVED with `enumerateSites`, never hand-adjusted (the registry row's own comment mandates this).

## §2 Design

### §2.1 What is deleted

`scanRepo`'s `coveredNames` set and the `resolved` filter that consults it. In their place: a set of covered DECLARATION KEYS — `${file}:${startOffset}` of the identifier that produced each `named-constant` site — and a resolver that maps a reference to the declaration its identifier actually binds to.

**Two details the key depends on, both of which the draft got wrong by generalizing.** The offset is the DECLARATION NAME node's start on both sides: `scanTimingSites` records `declPos` from the name it pushed, and the resolver takes `ts.getNameOfDeclaration(decl) ?? decl` rather than special-casing `VariableDeclaration` — the string-literal-named class property (form 2d) has no identifier name and pushes its site from the property NODE, so a name-only reading and a node-only reading disagree on exactly that form. And the key's file half is the repo-relative POSIX path `TimingSite.file` carries, so the resolver normalizes `declaration.getSourceFile().fileName`, which is absolute, before comparing.

**The key is a start OFFSET, not a line, and that is a probed correction rather than a stylistic one.** The first draft of this spec keyed on `${file}:${line}`, reusing what `pushNamed` already records. A line is not an identity: `const CLOSE_DELAY_MS = 220, other = readConfig();` declares two bindings on one line, and a delay referencing `other` then resolves to a key the covered set holds and is SUPPRESSED — one binding wearing another's coverage, the very class this arc closes, reintroduced by the repair. Today's name filter reports that site correctly, so the line-keyed design would have been a regression. Probe P10 is the counter-example and the offsets it prints (6 versus 67) are why the offset key has no ambiguity to resolve.

The class sweep behind that deletion is a derivation, not a list: there is exactly ONE name-based resolution step in the module, and every position that resolves — timer delays and timing-named property values alike — flows through it. Removing it repairs both positions at once; no enumeration of call sites can go stale.

### §2.2 The resolver

One `ts.Program` over the universe files, built once per `scanRepo` call:

```ts
const RESOLVER_OPTIONS: ts.CompilerOptions = {
  noEmit: true,
  noResolve: true,     // roots only: nothing outside the universe enters the program
  noLib: true,         // no lib.d.ts; the callee is never resolved, only the delay
  types: [],
  allowJs: false,
  target: ts.ScriptTarget.Latest,
  jsx: ts.JsxEmit.Preserve,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  baseUrl: repoRoot,
  paths: { "@/*": ["./*"] },
};
```

`noResolve` is load-bearing rather than an optimization: it keeps the program at the 311 universe roots instead of the 3121 source files that following imports into `node_modules` pulls in (§3, probes P3/P4 — 6.3-8.0 s across the four import-following option sets, against 211 ms for the pinned one in that same process).

**It is not free, and the earlier draft's safety argument was too strong.** "A covered binding is a root, so nothing legitimate is lost" is false: the PATH to the declaration must also be in the program. A covered constant re-exported through an intermediate module OUTSIDE the universe — a component importing from a `lib/` barrel that re-exports `lib/ui/copyFeedback.ts` — resolves under a full program and yields an unknown symbol with zero declarations under `noResolve`, so the site REPORTS. Today's name filter suppresses it, so that shape is a new residual rather than an unchanged answer. The direction is conservative and the shape is absent from the tree (all 17 live cross-file resolutions import the declaring module directly, §3 P2), so it is accepted with its cost stated in §4 item 1 rather than argued away.

**Resolution rule.** For a reference identifier `id`:

1. `symbol = checker.getSymbolAtLocation(id)`; if the symbol carries `SymbolFlags.Alias`, follow `checker.getAliasedSymbol(symbol)` (guarded — a non-alias throw leaves the original symbol).
2. RESOLVED iff SOME declaration of that symbol has a `${file}:${startOffset}` key in the covered-declaration set, where the offset is that declaration's NAME node start (§2.1). Shadowing produces two distinct SYMBOLS, so "some declaration" cannot smuggle a shadow in; declaration MERGING produces one symbol with several declarations of the SAME binding, and resolving it is correct because the value is that binding's. Probed rather than argued (§3, probe P8): `export const TTL_MS = 500` beside `export type TTL_MS = number` yields ONE symbol with a `VariableDeclaration` and a `TypeAliasDeclaration`, so the stricter "EXACTLY one declaration" rule would report a covered constant as unclassified on an ordinary shape.
3. Every other outcome — no symbol, zero declarations, a declaration elsewhere — is `unclassified`, reported by name, exactly as today's residual path renders it.

`baseUrl` + `paths` are pinned in code rather than read from `tsconfig.json`, so a synthetic-root scan (the temp-tree tests, and any caller passing a root that has no tsconfig) resolves identically to a repo scan. A structural test pins the assumption against the real `tsconfig.json` (`compilerOptions.paths` is `{"@/*": ["./*"]}`, `tsconfig.json:25-27`), so an alias change fails loudly instead of silently un-resolving imports.

### §2.3 The scan-side change

`scanTimingSites` gains two additive positional fields on `TimingSite`, both absolute offsets into the file it was given: `refPos`, the reference identifier's start; and `declPos`, the declaration name node's start, recorded on every `named-constant` site so the covered set can be keyed by identity rather than by line (§2.1). Both are absent — not `undefined` — on the paths that have neither.

**Which producers get a `refPos`, enumerated rather than implied.** `scanTimingSites` emits `unclassified` from five places, and the deleted name filter served all five, so a form left without a `refPos` becomes a permanent residual:

| producer | gets `refPos` | resolved through |
| --- | --- | --- |
| timer delay, bare identifier (both branches) | yes | `getSymbolAtLocation` |
| `PropertyAssignment` with an identifier initializer (`{ ttlMs: ANNOUNCE_LOG_TTL_MS }`) | yes | `getSymbolAtLocation` |
| `JsxAttribute` whose expression container holds a bare identifier (`<Thing ttlMs={ANNOUNCE_LOG_TTL_MS} />`) | yes | `getSymbolAtLocation` |
| `ShorthandPropertyAssignment` (`{ duration }`) | yes, on the property NAME | `getShorthandAssignmentValueSymbol` — see below |
| any non-identifier value (a sum, a call, a ternary) | no | not resolved; stays `unclassified` (§4 item 3) |

**The shorthand needs a different checker call, and missing that would have regressed a live-adjacent shape.** For `{ duration }`, `getSymbolAtLocation(name)` returns the SHORTHAND PROPERTY's own symbol — declared at the property, not at the value binding — so the covered key never matches and the site reports forever. `checker.getShorthandAssignmentValueSymbol(node)` returns the value binding. The 2026-08-15 arc made shorthand an unclassified-producing form and relied on the name filter to auto-resolve it, so deleting that filter without this call converts a resolving shorthand into a residual (round-1 discipline finding 3, probed). `components/crew/CrewSectionTransition.tsx` carries a live `{ duration }` one rename from the shape.

**`refPos` anchors into the text the SCAN read, so the resolver must read the same text.** The program is built with a `CompilerHost` serving the `(path, text)` pairs `scanRepo` already read, not a host that re-reads from disk: two reads of a file being edited mid-scan would mis-anchor the token and could resolve a DIFFERENT identifier — the wrong-binding direction, not the reporting one. The resolver additionally asserts that the node at `refPos` is an `Identifier` whose text equals the site's `name`, and treats a mismatch as `unclassified` (§2.5). Serving the already-read text also makes the existing unreadable-file case (a universe file chmod'd `0o000`) behave exactly as it does today, since the resolver never touches the filesystem. That is what lets the resolver ask the checker about the exact node rather than re-finding it by name — re-finding by name inside the resolver would reintroduce the defect one layer down.

Two same-shaped branches collapse while this lands, and the collapse is the same narrowing: the delay path's `ts.isIdentifier(delay) && TIMING_NAME.test(delay.text)` branch and its generic `else` currently differ only in how they spell `name`, and for a bare identifier both produce the identifier's text. The `TIMING_NAME` gate is dropped from the DELAY-reference path — resolution decides, not spelling. Live effect: zero (§3, probe P7 — the three bare-identifier delays that do not match `TIMING_NAME` today, `ttlMs` / `ms` / `delay`, resolve to non-covered bindings and stay `unclassified` with byte-identical `name` text).

`scanTimingSites` keeps its signature, stays checker-free, and stays independently testable; the program is created by `scanRepo` only.

### §2.4 Cost (measured, §3)

| phase | before | after |
| --- | --- | --- |
| `scanRepo` file walk + parse | 277 ms (P3) | unchanged |
| resolver program, first call in a process | — | 211 ms (P4), 269 ms (P7), 369 ms (P5) — three fresh processes |
| resolver program, subsequent calls | — | 167-214 ms (P6) |
| the two suites' seven whole-repo `scanRepo` calls | — | +1476 ms total (P6) |

Seven is the count of whole-repo calls on the landed branch — six `scanRepo(REPO_ROOT)` in `tests/docs/_metaInteractionTimingInventory.test.ts` plus one `scanRepo(process.cwd())` in `tests/docs/interactionTimingScan.test.ts`; the synthetic-root calls build programs over a handful of files each and are not a material cost.

The mutation harness runs both suites per mutant, so the gate pays that delta per mutant; the implementation measures the harness wall clock and records it in closeout. If the measured harness cost exceeds the plan's stated budget, the fallback is a memo keyed on the exact `(file list, contents)` the scan just read — correct by construction because that key IS the scan's input — not a weaker resolver.

### §2.5 Failure modes and their default

Every uncertainty defaults to REPORT; nothing degrades back to name matching.

| condition | behavior |
| --- | --- |
| a universe file is unreadable | skipped by the existing `readFileSync` guard in `scanRepo`; unchanged |
| a listed universe file does not exist (every synthetic-root scan, where `EXPLICIT_INCLUDES` are absent) | `ts.createProgram` records a diagnostic and omits it; the design reads no diagnostics, so nothing is resolved on its behalf and nothing is suppressed (probe P11, ~10 ms for a fixture universe) |
| a universe root is missing | unchanged — the inventory test's premise assertion catches an empty population |
| a file does not parse cleanly | TypeScript's error recovery still binds it; a reference that fails to resolve reports `unclassified` |
| the node at `refPos` is not an `Identifier`, or its text is not the site's `name` | `unclassified` — the anchor is not trusted, and a mis-anchored token is the one path that could resolve a DIFFERENT binding (§2.3) |
| the reference's symbol has zero declarations | `unclassified` |
| the reference resolves to a declaration in a file outside the program | `unclassified` (§4 item 1) |
| `ts.createProgram` throws | the scan throws. A guard that cannot resolve must not silently fall back to the mechanism this arc deletes; a loud failure is the correct end state. |

## §3 Probe record

Full scripts and transcripts: `docs/superpowers/specs/ci/probes/2026-08-16-timing-scan-binding-probes.md`. Every number in this spec comes from that record; prose here references it rather than restating derivations.

**Every wall-clock figure below is quoted from the committed transcript that produced it, and the spread across runs is stated rather than smoothed.** The pinned configuration was timed in three separate fresh processes at 211 ms, 269 ms and 369 ms; the full-tsconfig program at 6846 ms (P3) and 6634 ms (P4). An earlier interactive run of the same probes produced different figures, and the numbers here were re-derived from the record after review caught the drift — the record is the authority, not the drafting session's memory. The load-bearing comparison survives the spread by more than an order of magnitude: every import-following configuration is seconds, the pinned one is a fifth to a third of a second.

| probe | question | result |
| --- | --- | --- |
| **P1** | What does the global name filter suppress today? | 311 files, 76 raw sites, 24 `named-constant` sites over 23 distinct names; **35 suppressed sites** — 33 bare-identifier timer delays plus 2 `ttlMs:` property values. Covered names declared in more than one file: **1** (`SUCCESS_DISMISS_MS`, both uses same-file). Zero live shadows. |
| **P2** | Of the 35, how many are cross-file? | 18 same-file, **17 imported** — and all 17 specifiers (`@/…` and relative) resolve to the file that declares the covered constant. Zero namespace imports, zero default imports, zero aliased imports, zero re-export chains, zero unresolvable specifiers. |
| **P3** | Does the checker reproduce today's answer? | 36 bare-identifier delays: 33 resolve to a covered declaration, 3 to a non-covered binding (`ttlMs`, `ms`, `delay` — the three already `unclassified`), 0 unresolved. In that process: `scanRepo` 277 ms, full-tsconfig program 6846 ms, resolution of every delay 22 ms. |
| **P4** | Can the program be made cheap? | Five variants, one process: full tsconfig 6634 ms / `noLib` 8020 ms / `noLib`+`types:[]` 6581 ms / `+skipLibCheck` 6339 ms / **`noResolve`+`noLib` 211 ms**. All five give the identical 33/3/0 answer; `noResolve` cuts the program from 3121 source files to 311. |
| **P5** | Nine constructed shapes | Module-level shadow, inner-scope shadow, parameter shadow, and property-value shadow are all REPORTED; the same file's unshadowed use, a legit local, a direct import, an aliased import, and a barrel re-export all RESOLVE. Under the landed scanner the four shadow sites are silently absent from the scan entirely. |
| **P6** | Repeated cost in one process | 7 programs: 367, 214, 176, 177, 182, 193, 167 ms (1476 ms total). Per-file programs: 34 ms for 24 files (the rejected alternative, §4 item 5). |
| **P7** | Zero live delta under the PINNED options | 367 identifier references (every timer delay + every identifier property value in the universe, including keys the scanner never treats as timings — a deliberate SUPERSET of the 35 sites at issue): 35 resolve to a covered declaration, 292 to another binding, 40 unresolved — and **0 deltas** against the name filter. Program 269 ms. |

| **P9** | Is a resolved binding also VALUED correctly? | A `let` with a literal initializer that is later reassigned is inventoried at the initializer; the delay referencing it resolves correctly and suppresses. Zero live instances of the shape. Filed as `BL-TIMING-SCAN-VALUATION-VS-REASSIGNMENT`; §4 item 7. |
| **P11** | Does a nonexistent program root break the fixture-tree tests? | No. `ts.createProgram` omits it with a diagnostic the design never reads; a synthetic universe costs ~10 ms. This matters because `universeFiles` appends the `EXPLICIT_INCLUDES` paths to EVERY scan, including temp roots where they do not exist. |
| **P10** | Is a LINE a declaration identity? | No — and this one changed the design. Two bindings on one line share a line key, so the draft's line-keyed rule suppressed a site referencing the non-timing one, a regression against today's behavior. The covered set is now keyed on the declaration name node's start offset (§2.1). |
| **P8** | Module-graph and merging shapes | `export *` resolves through to the declaring file; a type-only import beside a value import does not disturb resolution; a namespace member assigned to a local resolves to that LOCAL binding and therefore REPORTS; a declaration merge yields one symbol with two declarations, which is the evidence behind §2.2's SOME-declaration rule. |

The probe scripts import a copy of the landed scanner (`git show origin/fix/scanner-scope-totality:scripts/scan-interaction-timings.ts`) and mutate nothing; they were run from the arc worktree with `pnpm exec tsx`.

## §4 Documented limits

1. **A binding the program cannot REACH does not resolve, and that is broader than "a binding outside the universe".** Two cases, and they differ:
   - A delay imported from a `lib/**` file with no `EXPLICIT_INCLUDES` row reports `unclassified`. Identical to today (such a constant produces no `named-constant` site, so it is not in `coveredNames` either), and `EXPLICIT_INCLUDES` is the existing fix when it is genuinely interaction timing.
   - A COVERED constant reached through an intermediate re-export module outside the universe reports `unclassified` where today it is suppressed — a NEW residual on an ordinary import-path refactor, because `noResolve` never adds the intermediate file and the alias dies there (round-1 mechanism finding 2, probed). Absent from the tree today: all 17 live cross-file resolutions import the declaring module directly (§3 P2). The failure direction is a surfaced name someone dispositions, and the fix if it ever lands is an `EXPLICIT_INCLUDES` row for the barrel — not switching module resolution back on, which costs the 30× the pinned options buy.
2. **Adversarial aliasing is out of the fence — and narrower than the draft claimed.** Re-exporting an unrelated RUNTIME value under a covered constant's name does NOT suppress: the alias lands on that value's declaration, which produced no `named-constant` site (the numeric-initializer gate in `pushNamed`), so its key is absent and the site reports (round-1 discipline finding 4). What defeating the scanner actually takes is aliasing one COVERED constant's name onto a DIFFERENT covered constant's declaration, which suppresses under a row that states the other constant's value. Ordinary aliasing is why alias-following is correct — a named re-export (P5), an `export *` (P8), and an aliased import (P5) all resolve to the declaring file, which is the answer a reader wants — and the remaining abuse requires intent, which §1.2's fence excludes.
3. **Non-identifier expressions are not resolved, by design.** `duration: fallbackMs + BUFFER_MS`, `emblaDuration(x)`, a ternary — every non-identifier value stays `unclassified` and keeps its disposition row. This arc resolves REFERENCES, it does not evaluate expressions.
4. **A member expression is not a reference this arc resolves.** `setTimeout(fn, TIMINGS.CLOSE_MS)` is `unclassified` today by form (the delay is not an identifier) and stays so. One hop of indirection behaves the same way and was probed: `const DELAY_MS = C.COPY_FEEDBACK_RESET_MS` followed by `setTimeout(fn, DELAY_MS)` resolves to the LOCAL binding, which is not a covered row, so the site reports (P8). Widening to property accesses is a recognizer change, which §1.1 item 2 fences out.
5. **The rejected cheaper resolver, recorded so it is not re-proposed as a finding.** A per-file program plus a hand-rolled one-hop import resolution costs 34 ms for 24 files instead of ~200-370 ms for the whole universe (probe P6) but reports barrel re-exports as `unclassified` and puts a hand-written module-resolution hop in a file whose whole defect class is hand-written resolution. The whole-universe program is chosen because it delegates scope AND module semantics to the compiler: this arc models no scope of its own.
6. **`noResolve` means the program never type-checks.** No diagnostic from it is read or reported; it is a binder, not a checker of types. A file with a type error still binds, so resolution is unaffected — and the repo's own `pnpm typecheck` is the surface that owns type errors.
7. **Resolution is not valuation, and a reassigned binding is valued by its initializer.** `let RETRY_MS = 100` later reassigned from config is a `named-constant` worth 100, and a delay referencing it resolves to that binding and suppresses — correctly as RESOLUTION, while §5.5 carries the initializer rather than the runtime value. Probed (§3, P9) with **zero live instances** on this tree, pre-existing form-2 behavior that this arc neither creates nor changes, and filed as `BL-TIMING-SCAN-VALUATION-VS-REASSIGNMENT`. It is named here because it is the one shape where a correct resolution still yields a §5.5 row a reader could act on wrongly, and because widening this arc into the valuation axis is the ratchet the round-economy rules exist to stop.
8. **The covered key crosses two parses, and disagreement fails toward reporting.** `declPos` comes from `scanTimingSites`, which parses every file as `ts.ScriptKind.TSX`; the resolver's declaration offset comes from the program, which parses a `.ts` file as TS. The two agree on an identifier's text position for every ordinary declaration, and the only constructs that parse differently between the modes (a `.ts` type assertion `<T>x` versus JSX) are not declaration names. If they ever disagree, the key does not match and the site is REPORTED — the conservative direction, and the reason this is a limit rather than a hazard.
9. **Supersedes limit 2 of the 2026-08-15 spec.** `docs/superpowers/specs/ci/2026-08-15-scanner-scope-totality-design.md` §4 item 2 ("property values are not name-resolved") records the state this arc closes; that document is historical and is not edited.

### Dimensional Invariants

No rendered component, no fixed-dimension parent, no box-model change: the diff is scanner code, fixtures, tests, ledger prose, and this spec. `DESIGN.md` is byte-identical (§6 AC-6). If implementation contradicts that, the task adds the relationship here plus the real-browser assertion the writing-plans layout rule requires.

### Transition Inventory

No visual state is added or changed — no `AnimatePresence`, no exit/initial/animate props, no conditional render. The timing values themselves are read, never edited.

## §5 Meta-test / registry inventory

- **CREATES:** fixture rows in `tests/docs/interactionTimingScan.test.ts` for the P5 shapes plus the P10 same-line neighbour — six fires halves (module-level shadow, inner-scope shadow, parameter shadow, aliased import, same-line neighbour, and the property-value shadow) and five stays-quiet halves (the unshadowed peer, a legit local, a direct import, a barrel re-export, and the live-shaped `ttlMs` pass-through); a structural pin that the resolver's `paths` assumption matches `tsconfig.json`. The plan's task tables are the single source for that split.
- **EXTENDS:** `scripts/scan-interaction-timings.ts` (`TimingSite.refPos` and `TimingSite.declPos`, the resolver, `scanRepo`'s resolution step, the header paragraph that documents the hole); `tests/mutation/source/registry.ts` (`interactionTimingScan` accepted-survivor set re-derived — its `siteId`s are line-keyed, so re-derivation is mandatory rather than optional).
- **UNCHANGED:** `DESIGN.md` §5.5, `UNCLASSIFIED_DISPOSITIONS`, `EXPLICIT_INCLUDES`, `EXCLUDED_PREFIXES`, `UNIVERSE_ROOTS`, `TIMING_NAME`, `isBoundaryTimingKey`, `inventoryRows`, `scripts/scan-interaction-timings.cli.ts`.
- No Supabase call site, no invariant-10 mutation surface (tooling and test code only), no advisory lock, no §12.4 row, no UI surface.

## §6 Acceptance criteria

- **AC-1 (RED first).** A synthetic universe whose component declares a module-level `const COPY_FEEDBACK_RESET_MS = <non-literal>` beside a scanned file exporting the same name, and calls `setTimeout(fn, COPY_FEEDBACK_RESET_MS)`, yields an `unclassified` site naming it. On the unfixed scanner the same fixture yields NO site for that file at all — the executable RED, and the entry's own probe.
- **AC-2 (precision, not blanket reporting).** In one file that imports the covered constant AND shadows it inside a function, the shadowed call reports `unclassified` while the unshadowed call in the same file stays resolved. A repair that reported both would pass AC-1 and fail here.
- **AC-3.** A parameter shadowing a covered constant reports `unclassified`.
- **AC-4 (the second position, same mechanism).** A timing-named PROPERTY whose value is a shadowing identifier (`{ ttlMs: SHADOW }`) reports `unclassified` carrying its `propertyKey`; the two live `ttlMs: ANNOUNCE_LOG_TTL_MS` pass-throughs stay resolved.
- **AC-5 (stays quiet).** A legit same-file constant, a direct import, an ALIASED import, and an import through a barrel re-export all resolve — no new `unclassified` row from any of them. The aliased-import case is a fires-to-quiet change: it reports `unclassified` under the name filter today and resolves after.
- **AC-6 (zero live delta).** `pnpm vitest run tests/docs/` green with `DESIGN.md` byte-identical and `scanRepo(REPO_ROOT).unclassified` still empty. §5.5 parity is asserted in BOTH directions by the existing meta-test, so a lost resolution (new residual) and a wrongly-gained one (missing row) each fail it.
- **AC-7.** The resolver's `paths`/`baseUrl` assumption is pinned against `tsconfig.json` by a structural test that fails if the alias mapping changes.
- **AC-8 (gate).** `pnpm heavy pnpm mutation:guards` for `interactionTimingScan`: score ≥ `scoreFloor` 0.95 with the accepted set RE-DERIVED via `enumerateSites`, unaccepted-survivor set empty. Score and survivor set are stated in the round-1 diff brief per the guard-surface dispatch rule.
- **AC-9 (header honesty).** The scanner header's TOTALITY IS PER-FORM paragraph — the one whose text wraps as "… with one / hole: an identifier delay resolves by NAME, not by binding …" and ends by naming `BL-TIMING-SCAN-NAME-VS-BINDING` as the carrier — is rewritten to the closed contract in the same commit that closes it. (The sentence spans a comment line wrap, so grep it with `rg -U` or by the phrase `resolves by NAME`.)
- **AC-10 (cost).** Two budgets, separately measured and separately falsifiable, both recorded in closeout with their before/after numbers: (a) the two suites run together gain **≤ 2 s** wall clock, the arithmetic being seven whole-repo programs at 167-369 ms each (§2.4); (b) `pnpm heavy pnpm mutation:guards` for this surface gains **≤ 25%** wall clock, since the harness pays one program per mutant and a fixed second-per-mutant budget would be a different claim at every mutant count. Breaching (a) or (b) lands the §2.4 memo fallback with its own before/after measurement; neither is waived by the other passing.
- **AC-12 (declaration identity, not proximity).** A file declaring `const CLOSE_DELAY_MS = 220, other = readConfig();` and calling `setTimeout(fn, other)` reports `other` as `unclassified`. This case fails on a line-keyed covered set (probe P10) and passes on the offset-keyed one, so it is the assertion that pins the identity choice rather than restating AC-1.
- **AC-11 (ledger).** `BL-TIMING-SCAN-NAME-VS-BINDING` graduates to `BACKLOG-archive.md` with its in-progress marker stripped inside the archiving move (invariant 12), and the arc's review-round corpus rows are committed.

impeccable-gate: N/A — no UI surface
