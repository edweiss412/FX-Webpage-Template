# Timing scan: resolve an identifier delay against its BINDING, not its spelling

**Date:** 2026-08-16 · **Arc branch:** `fix/timing-scan-scope-resolution` · **Entry:** `BL-TIMING-SCAN-NAME-VS-BINDING` (BACKLOG.md, filed 2026-08-15, effort M) · **Status:** draft

## §0 Why

`scripts/scan-interaction-timings.ts` is the derived population behind `DESIGN.md` §5.5. Its delay half claims totality: every `setTimeout` / `setInterval` delay argument is a numeric literal, resolves to a covered constant, or is reported `unclassified` and fails `tests/docs/_metaInteractionTimingInventory.test.ts` until someone dispositions it.

Resolution is done by SPELLING. `scanRepo` collects `coveredNames` — a `Set` of the identifier text of every `named-constant` site anywhere in the universe — and drops any `unclassified` site whose `name` is in that set (the `coveredNames` / `resolved` pair inside `scanRepo`, `scripts/scan-interaction-timings.ts`; lines 636-642 of the version on `origin/fix/scanner-scope-totality`, which is what this spec is written against — see §1.1 item 5, and note that the file on `origin/main` is still the shorter pre-#827 one, so a line anchor into it will not match). So any binding anywhere carrying the same spelling counts as coverage, and a local one that shadows it is suppressed:

```ts
// alongside the real lib/ui/copyFeedback.ts export
const COPY_FEEDBACK_RESET_MS = readDelayFromRuntimeConfig();
setTimeout(fn, COPY_FEEDBACK_RESET_MS);
```

Before resolution that site is correctly `unclassified`; the name filter then removes it, and it appears in neither §5.5 nor the unclassified list. The delay half's own totality claim is therefore false — and it is the half the scanner header advertises as complete.

**Reachability: PROBED BUT CONSTRUCTED. No live shadowing instance exists in the tree today** (§3, probe P1: one covered name is declared in two files, `SUCCESS_DISMISS_MS`, and both of its uses are same-file; zero shadows). The consequence today is bounded in two ways: the shadowing value in the constructed case is a runtime one, so no FIXED timing is hidden; and nothing in the live tree is being hidden at all. What this arc repairs is the guard's claim, before an ordinary refactor — extracting a helper, renaming a local, copying a component — makes the claim's falsity load-bearing. The repair is also a NARROWING: it deletes the name set rather than growing a recognizer (§2.1).

## §1.1 Resolved scope — do not relitigate

1. **The repair direction is fixed by the entry: resolve against the binding, not the name.** "Resolve identifiers against the binding IN SCOPE (the TypeScript checker already models this) instead of a name set" (BACKLOG.md, `BL-TIMING-SCAN-NAME-VS-BINDING`, **Scope if promoted**). This spec takes the checker option. The entry's alternative — narrow the name set per file and report every cross-file identifier `unclassified` — is REJECTED with evidence, not preference: 17 of the 35 live resolutions are cross-file imports (§3, probe P2), so per-file narrowing would file 17 correct resolutions as residuals and force 17 disposition rows for constants that already carry their own §5.5 rows. `EXPLICIT_INCLUDES` exists precisely so `lib/ui/copyFeedback.ts` resolves (`scripts/scan-interaction-timings.ts`, the `EXPLICIT_INCLUDES` entry's reason: "Without this include the delay resolves to nothing scanned and both call sites report `unclassified`").
2. **This arc does NOT widen what counts as a timing site.** No new form, no new key predicate, no change to `TIMING_NAME` or `isBoundaryTimingKey`, no change to the universe or its fences. The only behavior that changes is which already-recognized sites RESOLVE. A finding that proposes recognizing a new syntactic position is out of scope by construction.
3. **Property values are in scope for this arc, and that is the ratified handoff, not scope creep.** The 2026-08-15 scanner-scope-totality spec fenced property-value resolution to this row explicitly: "`duration: SOME_CONSTANT` reports `unclassified` … its disposition row (or the `BL-TIMING-SCAN-NAME-VS-BINDING` fix, when that lands with scope-aware resolution) is the path to a resolved row" (`docs/superpowers/specs/ci/2026-08-15-scanner-scope-totality-design.md` §4 item 2; §1.1 item 2 and §2.2 same document). Both positions ride the ONE filter this arc deletes, so repairing one and not the other would need extra code, not less.
4. **Autonomy:** user grant 2026-08-16 (Eric) for the BL-mediums batch; both user review gates WAIVED. Spec + plan are this session's segment; implementation is a separate session.
5. **Base-version sequencing is settled.** PR #827 (`fix/scanner-scope-totality`) edits this same file and had not merged when this spec was written. This spec is written against the LANDED design on `origin/fix/scanner-scope-totality`, not against `origin/main`, and the implementation branch merges `origin/main` and re-verifies every citation before its first task. Line anchors in this document are drafting-time locators against that ref; the durable anchors are the symbol names.

## §1.2 Convergence criteria (AGENTS.md, "Convergence criterion, not just admissibility")

- **CONSEQUENCE BOUND.** Every timer delay argument and every timing-named property value in the probe domain is a numeric literal, resolves to the DECLARATION that produced a covered `named-constant` row, or is reported `unclassified` BY NAME and fails the inventory test until dispositioned. No site is silently dropped, and resolution never depends on spelling: two distinct bindings that share a name never resolve to each other. The default on every uncertainty — no symbol, an unresolvable alias, a declaration outside the scanned universe, a declaration that is not a covered row — is to REPORT. A conservative report plus a surfaced name is a DOCUMENTED LIMIT (§4), not a finding.
- **PROBE DOMAIN:** the scan universe on this tree — `app/**` + `components/**` minus `app/api/**`, plus `EXPLICIT_INCLUDES` (311 files, §3) — plus the nine constructed shapes in probe P5, each of which is one ordinary edit away from a live file (a local const, an inner-scope const, a parameter, a direct import, an aliased import, a barrel re-export, a property value). A probe drawn from outside that domain — an invented module-graph corner, a construct written to defeat resolution — files to §4, not to a round.
- **THREAT FENCE.** This guard defends against ordinary authoring and refactors by a contributor who is not trying to defeat the scanner: a local constant that happens to share a name, an extracted helper, a copied component, a rename. Deliberately adversarial shadowing — a module that re-exports under a colliding name to make a runtime value look like a covered constant — is OUT OF SCOPE and files to documented limits.
- **MUTATION SCORE.** `scripts/scan-interaction-timings.ts` is ALREADY ENROLLED in the source-mutation registry (`interactionTimingScan`, all six operators, `scoreFloor: 0.95`, suites `tests/docs/_metaInteractionTimingInventory.test.ts` + `tests/docs/interactionTimingScan.test.ts`; `tests/mutation/source/registry.ts:1142-1155`). The diff-stage convergence criterion is therefore the score plus an empty unaccepted-survivor set, both machine-computed: a "the guard does not pin what it claims" finding is admissible only with the surviving mutant that demonstrates it, from the declared operator set. Accepted-survivor `siteId`s are LINE-keyed and this edit shifts them, so the accepted set is RE-DERIVED with `enumerateSites`, never hand-adjusted (the registry row's own comment mandates this).

## §2 Design

### §2.1 What is deleted

`scanRepo`'s `coveredNames` set and the `resolved` filter that consults it. In their place: a set of covered DECLARATION KEYS — `${file}:${line}` of the identifier that produced each `named-constant` site, which is already exactly what `pushNamed` records (`lineOf(name)`) — and a resolver that maps a reference to the declaration its identifier actually binds to.

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

`noResolve` is load-bearing rather than an optimization: it keeps the program at the 311 universe roots instead of the 3121 source files that following imports into `node_modules` pulls in (§3, probes P3/P4 — 7.3-9.2 s across three option sets that follow imports, versus 254-502 ms), and it is SAFE for exactly the reason it is fast: a covered binding is by definition declared in a scanned file, so it is already a root. An import whose target is outside the universe does not resolve, which is the conservative direction (report), and is the same answer the name filter gives today for a constant with no `named-constant` site.

**Resolution rule.** For a reference identifier `id`:

1. `symbol = checker.getSymbolAtLocation(id)`; if the symbol carries `SymbolFlags.Alias`, follow `checker.getAliasedSymbol(symbol)` (guarded — a non-alias throw leaves the original symbol).
2. RESOLVED iff SOME declaration of that symbol has a `${file}:${line}` key in the covered-declaration set. Shadowing produces two distinct SYMBOLS, so "some declaration" cannot smuggle a shadow in; declaration MERGING produces one symbol with several declarations of the SAME binding, and resolving it is correct because the value is that binding's. Probed rather than argued (§3, probe P8): `export const TTL_MS = 500` beside `export type TTL_MS = number` yields ONE symbol with a `VariableDeclaration` and a `TypeAliasDeclaration`, so the stricter "EXACTLY one declaration" rule would report a covered constant as unclassified on an ordinary shape.
3. Every other outcome — no symbol, zero declarations, a declaration elsewhere — is `unclassified`, reported by name, exactly as today's residual path renders it.

`baseUrl` + `paths` are pinned in code rather than read from `tsconfig.json`, so a synthetic-root scan (the temp-tree tests, and any caller passing a root that has no tsconfig) resolves identically to a repo scan. A structural test pins the assumption against the real `tsconfig.json` (`compilerOptions.paths` is `{"@/*": ["./*"]}`, `tsconfig.json:25-27`), so an alias change fails loudly instead of silently un-resolving imports.

### §2.3 The scan-side change

`scanTimingSites` gains one additive field on `TimingSite`: the absolute position of the reference identifier for an `unclassified` site whose delay argument or property value IS a bare identifier (`refPos`), and `null`/absent everywhere else. That is what lets the resolver ask the checker about the exact node rather than re-finding it by name — re-finding by name inside the resolver would reintroduce the defect one layer down.

Two same-shaped branches collapse while this lands, and the collapse is the same narrowing: the delay path's `ts.isIdentifier(delay) && TIMING_NAME.test(delay.text)` branch and its generic `else` currently differ only in how they spell `name`, and for a bare identifier both produce the identifier's text. The `TIMING_NAME` gate is dropped from the DELAY-reference path — resolution decides, not spelling. Live effect: zero (§3, probe P7 — the three bare-identifier delays that do not match `TIMING_NAME` today, `ttlMs` / `ms` / `delay`, resolve to non-covered bindings and stay `unclassified` with byte-identical `name` text).

`scanTimingSites` keeps its signature, stays checker-free, and stays independently testable; the program is created by `scanRepo` only.

### §2.4 Cost (measured, §3)

| phase | before | after |
| --- | --- | --- |
| `scanRepo` file walk + parse | ~900 ms cold (tsx) | unchanged |
| resolver program, first call in a process | — | 254-502 ms |
| resolver program, subsequent calls | — | ~160-220 ms |
| the two suites' seven whole-repo `scanRepo` calls | — | +1.5 s total |

Seven is the count of whole-repo calls on the landed branch — six `scanRepo(REPO_ROOT)` in `tests/docs/_metaInteractionTimingInventory.test.ts` plus one `scanRepo(process.cwd())` in `tests/docs/interactionTimingScan.test.ts`; the synthetic-root calls build programs over a handful of files each and are not a material cost.

The mutation harness runs both suites per mutant, so the gate pays that delta per mutant; the implementation measures the harness wall clock and records it in closeout. If the measured harness cost exceeds the plan's stated budget, the fallback is a memo keyed on the exact `(file list, contents)` the scan just read — correct by construction because that key IS the scan's input — not a weaker resolver.

### §2.5 Failure modes and their default

Every uncertainty defaults to REPORT; nothing degrades back to name matching.

| condition | behavior |
| --- | --- |
| a universe file is unreadable | skipped by the existing `readFileSync` guard in `scanRepo`; unchanged |
| a universe root is missing | unchanged — the inventory test's premise assertion catches an empty population |
| a file does not parse cleanly | TypeScript's error recovery still binds it; a reference that fails to resolve reports `unclassified` |
| the reference's symbol has zero declarations | `unclassified` |
| the reference resolves to a declaration in a file outside the program | `unclassified` (§4 item 1) |
| `ts.createProgram` throws | the scan throws. A guard that cannot resolve must not silently fall back to the mechanism this arc deletes; a loud failure is the correct end state. |

## §3 Probe record

Full scripts and transcripts: `docs/superpowers/specs/ci/probes/2026-08-16-timing-scan-binding-probes.md`. Every number in this spec comes from that record; prose here references it rather than restating derivations.

**Wall-clock numbers are per-run, and the table says which run.** P3 and P4 both timed the full-tsconfig program and got 9.2 s and 7.3 s in separate processes; the table reports each under its own probe rather than averaging them or quietly keeping one. The load-bearing comparison survives that spread by an order of magnitude — every import-following configuration is seconds, the pinned one is a quarter of a second — and the design would not change anywhere inside it.

| probe | question | result |
| --- | --- | --- |
| **P1** | What does the global name filter suppress today? | 311 files, 76 raw sites, 24 `named-constant` sites over 23 distinct names; **35 suppressed sites** — 33 bare-identifier timer delays plus 2 `ttlMs:` property values. Covered names declared in more than one file: **1** (`SUCCESS_DISMISS_MS`, both uses same-file). Zero live shadows. |
| **P2** | Of the 35, how many are cross-file? | 18 same-file, **17 imported** — and all 17 specifiers (`@/…` and relative) resolve to the file that declares the covered constant. Zero namespace imports, zero default imports, zero aliased imports, zero re-export chains, zero unresolvable specifiers. |
| **P3** | Does the checker reproduce today's answer? | 36 bare-identifier delays: 33 resolve to a covered declaration, 3 to a non-covered binding (`ttlMs`, `ms`, `delay` — the three already `unclassified`), 0 unresolved. Full-tsconfig program cost 9.2 s. |
| **P4** | Can the program be made cheap? | full tsconfig 7.3 s / `noLib` 8.3 s / `noLib`+`types:[]` 8.2 s / **`noResolve`+`noLib` 502 ms** — all four give the identical 33/3/0 answer; `noResolve` cuts the program from 3121 source files to 311. |
| **P5** | Nine constructed shapes | Module-level shadow, inner-scope shadow, parameter shadow, and property-value shadow are all REPORTED; the same file's unshadowed use, a legit local, a direct import, an aliased import, and a barrel re-export all RESOLVE. Under the landed scanner the four shadow sites are silently absent from the scan entirely. |
| **P6** | Repeated cost in one process | 7 programs: 414, 217, 184, 173, 173, 191, 160 ms (1512 ms total). Per-file programs: 33 ms for 24 files (the rejected alternative, §4 item 5). |
| **P7** | Zero live delta under the PINNED options | 367 identifier references (every timer delay + every identifier property value in the universe, including keys the scanner never treats as timings — a deliberate SUPERSET of the 35 sites at issue): 35 resolve to a covered declaration, 292 to another binding, 40 unresolved — and **0 deltas** against the name filter. Program 254 ms. |

| **P8** | Module-graph and merging shapes | `export *` resolves through to the declaring file; a type-only import beside a value import does not disturb resolution; a namespace member assigned to a local resolves to that LOCAL binding and therefore REPORTS; a declaration merge yields one symbol with two declarations, which is the evidence behind §2.2's SOME-declaration rule. |

The probe scripts import a copy of the landed scanner (`git show origin/fix/scanner-scope-totality:scripts/scan-interaction-timings.ts`) and mutate nothing; they were run from the arc worktree with `pnpm exec tsx`.

## §4 Documented limits

1. **A binding outside the scan universe does not resolve.** A delay imported from a `lib/**` file with no `EXPLICIT_INCLUDES` row reports `unclassified`. Identical to today's behavior (such a constant produces no `named-constant` site, so it is not in `coveredNames` either), conservative, and the existing `EXPLICIT_INCLUDES` mechanism is the fix when such a constant is genuinely interaction timing.
2. **Adversarial re-export/aliasing is out of the fence.** A module that deliberately re-exports an unrelated runtime value under a covered constant's name resolves through the alias and suppresses. Ordinary aliasing is exactly why alias-following is correct — a named re-export (P5), an `export *` (P8), and an aliased import (P5) all resolve to the declaring file, which is the answer a reader wants; defeating it requires intent, which §1.2's fence excludes.
3. **Non-identifier expressions are not resolved, by design.** `duration: fallbackMs + BUFFER_MS`, `emblaDuration(x)`, a ternary — every non-identifier value stays `unclassified` and keeps its disposition row. This arc resolves REFERENCES, it does not evaluate expressions.
4. **A member expression is not a reference this arc resolves.** `setTimeout(fn, TIMINGS.CLOSE_MS)` is `unclassified` today by form (the delay is not an identifier) and stays so. One hop of indirection behaves the same way and was probed: `const DELAY_MS = C.COPY_FEEDBACK_RESET_MS` followed by `setTimeout(fn, DELAY_MS)` resolves to the LOCAL binding, which is not a covered row, so the site reports (P8). Widening to property accesses is a recognizer change, which §1.1 item 2 fences out.
5. **The rejected cheaper resolver, recorded so it is not re-proposed as a finding.** A per-file program plus a hand-rolled one-hop import resolution costs ~33 ms instead of ~250 ms (probe P6) but reports barrel re-exports as `unclassified` and puts a hand-written module-resolution hop in a file whose whole defect class is hand-written resolution. The whole-universe program is chosen because it delegates scope AND module semantics to the compiler: this arc models no scope of its own.
6. **`noResolve` means the program never type-checks.** No diagnostic from it is read or reported; it is a binder, not a checker of types. A file with a type error still binds, so resolution is unaffected — and the repo's own `pnpm typecheck` is the surface that owns type errors.
7. **Resolution is not valuation, and a reassigned binding is valued by its initializer.** `let RETRY_MS = 100` later reassigned from config is a `named-constant` worth 100, and a delay referencing it resolves to that binding and suppresses — correctly as RESOLUTION, while §5.5 carries the initializer rather than the runtime value. Probed (§3, P9) with **zero live instances** on this tree, pre-existing form-2 behavior that this arc neither creates nor changes, and filed as `BL-TIMING-SCAN-VALUATION-VS-REASSIGNMENT`. It is named here because it is the one shape where a correct resolution still yields a §5.5 row a reader could act on wrongly, and because widening this arc into the valuation axis is the ratchet the round-economy rules exist to stop.
8. **Supersedes limit 2 of the 2026-08-15 spec.** `docs/superpowers/specs/ci/2026-08-15-scanner-scope-totality-design.md` §4 item 2 ("property values are not name-resolved") records the state this arc closes; that document is historical and is not edited.

### Dimensional Invariants

No rendered component, no fixed-dimension parent, no box-model change: the diff is scanner code, fixtures, tests, ledger prose, and this spec. `DESIGN.md` is byte-identical (§6 AC-6). If implementation contradicts that, the task adds the relationship here plus the real-browser assertion the writing-plans layout rule requires.

### Transition Inventory

No visual state is added or changed — no `AnimatePresence`, no exit/initial/animate props, no conditional render. The timing values themselves are read, never edited.

## §5 Meta-test / registry inventory

- **CREATES:** fixture rows in `tests/docs/interactionTimingScan.test.ts` for the P5 shapes (four fires halves, five stays-quiet halves); a structural pin that the resolver's `paths` assumption matches `tsconfig.json`.
- **EXTENDS:** `scripts/scan-interaction-timings.ts` (`TimingSite.refPos`, `scanRepo`'s resolution step, the header paragraph that documents the hole); `tests/mutation/source/registry.ts` (`interactionTimingScan` accepted-survivor set re-derived — line-keyed, so re-derivation is mandatory).
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
- **AC-10 (cost).** The two-suite wall clock and the `mutation:guards` wall clock are measured before and after and recorded in closeout; the pair's delta is ≤ 2 s locally, or the §2.4 memo fallback lands with its own measurement.
- **AC-11 (ledger).** `BL-TIMING-SCAN-NAME-VS-BINDING` graduates to `BACKLOG-archive.md` with its in-progress marker stripped inside the archiving move (invariant 12), and the arc's review-round corpus rows are committed.

impeccable-gate: N/A — no UI surface
