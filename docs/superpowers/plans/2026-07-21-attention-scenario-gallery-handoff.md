# Attention scenario gallery — close-out record

**Spec:** `docs/superpowers/specs/2026-07-20-attention-scenario-gallery-design.md`
**Plan:** `docs/superpowers/plans/2026-07-21-attention-scenario-gallery.md`
**Branch:** `feat/attention-scenario-gallery` (worktree `../FX-worktrees/attention-scenario-gallery`)
**Base:** `origin/main` @ `222c25bd7`

---

## 1. What shipped

Two capabilities over one catalog of synthetic scenarios:

1. **A gallery** at `/admin/dev/attention-gallery` rendering every alert, warning, and
   structural permutation the show modal can present, through the REAL derivation,
   routing, and card components. Build-gated out of production.
2. **Materialize**, a dev-panel card that writes a tier-3 composite onto a real show so
   the REAL modal shows the state, and removes it again.

The problem it solves: alert and warning states could previously only be evaluated by
getting a real sheet to misbehave into them.

---

## 2. Deviations from the spec and plan

Each was found by running code, not by reading it.

| # | Artifact claim | Reality | Resolution |
| --- | --- | --- | --- |
| D-A | Hold cleanup uses `LIKE '\_\_devScenario:%' ESCAPE '\'` | PostgREST has no ESCAPE clause, and unescaped `_` is a single-char wildcard | Constant `created_by = '__devScenario'` compared by equality. Proven necessary: see §4 |
| D-B | `bucketAttention` drops a card when Overview is unavailable | It resolves an unavailable section to `"overview"` unconditionally (`lib/admin/sectionAttention.ts:114-116`) — a structural no-drop guarantee | Spec corrected in Task 6; tests pin the real guarantee |
| D-C | An unavailable anchor falls back to the section top | `rooms`/`event` have no section-top consumer, so the card redirects to Overview (`sectionAttention.ts:127-134`) | Spec corrected; tier-2 axis asserts the redirect |
| D-D | Plan test bodies use `@testing-library/user-event` | Not a dependency of this repo | Rewritten to the established `fireEvent` + explicit `cleanup` idiom |
| D-E | `dev-build` (port 3001) already hosts the sibling dim harnesses | Those run on `desktop-chromium` (port 3000) | Still used `dev-build`: the plan's conclusion (isolated built artifact, no sibling-worktree pollution on 3000) holds even though its premise did not |
| D-G | Spec §1.1 says gallery controls are neutralized with `inert` | `inert` also kills the menu, the pill toggle, and every focus ring — precisely the things a reviewer opens the gallery to look at | Capture-phase `preventDefault` on the block root, ratified during plan review (R5d). Same guarantee (no action can fire), without disabling the surface under evaluation. Proven non-vacuous in §4.4 |
| D-F | Warning-card test asserts the literal synthetic message | The card prefers the catalog TITLE; the assertion passed only because `BLOCK_DISAPPEARED` has `title: null` | Test now asserts the contract: non-empty, identical across skins, never the bare code |

---

## 3. Defects found during implementation

Not review findings — these were caught by the compiler, the test runner, or a real browser.

1. **`useFormStatus` needs an ancestor form.** The submit buttons were hoisted out of
   their forms and wired with `form=`, which renders identically and makes `pending`
   permanently `false`: a double-submit guard that never guards.
2. **A bare `action={serverAction}` discards the return value.** `MaterializeResult` would
   never have reached the screen, making `lastResult` a zombie prop. Now carried back via
   `useActionState`.
3. **A function prop cannot cross the RSC boundary.** `onResolved={() => {}}` passed from
   the server page to `AttentionBanner` threw behind the admin error boundary — every
   Playwright test failed identically on a page that rendered nothing. Fixed with
   `GalleryCard`, a client wrapper owning the callback. **Only the real-browser run could
   surface this**; every jsdom test passed against the broken page.
4. **Four `exactOptionalPropertyTypes` violations**, all the same shape: an indexed-access
   type like `T["x"]["y"]` carries `| undefined` precisely because the property is
   optional, so it is not assignable back to the property it came from.
5. **`shows` has five NOT NULL columns with no default** (`client_label` and
   `template_version` beyond the obvious three).
6. **An unscoped `[aria-expanded]` locator matches the admin nav's notifications
   bell**, not the scenario pill. Clicking it opened the bell panel, whose backdrop then
   intercepted every subsequent click (`bell-panel-backdrop ... intercepts pointer
   events`). Both locators are now scoped inside `[data-testid="block-root"]`. A
   page-global attribute selector is unsafe on any surface that renders inside the admin
   chrome.
7. **`beforeEach` cannot reset via `clear()`** — circular, and wrong, since `clear()`
   correctly preserves untagged rows, so authentic seeds leaked between tests.

---

## 4. Evidence

### 4.1 Build-artifact gate (does NOT run in CI — recorded here per plan Task 10)

```
RUN_BUILD_ARTIFACT_GATE_TEST=1 pnpm vitest run tests/admin/build-artifact-gate.test.ts
  BEFORE registering the route:  1 failed | 1 passed
    AssertionError: expected .../server/app/admin/dev/attention-gallery to NOT exist;
    a dev-only /admin/dev surface leaked into the prod artifact
  AFTER registering the route:   2 passed
```

The red phase was a real leaking build, not an asserted expectation.

### 4.2 Wildcard safety proven non-vacuous

Reverting `run.ts` to a `LIKE '__devScenario%'` predicate and re-running the real-DB suite:

```
× a created_by that merely RESEMBLES the tag is never deleted
  AssertionError: expected 'imp-a_bdevScenario:real|...' to be 'imp-__devScenarioX|...'
```

The authentic row tagged `__devScenarioX` is **destroyed** under `LIKE`, because each
unescaped `_` matches any single character. A suite using only correctly-tagged fixtures
would never surface this.

### 4.3 Real-browser layout (Task 16)

```
playwright test tests/e2e/attention-gallery-layout.spec.ts --project=dev-build
  run 1: 5 failed  — every test timed out waiting for [data-testid="block-root"];
                     the page threw behind the admin error boundary (RSC function prop)
  run 2: 5 passed (3.8m) — after the GalleryCard fix
```

The `pb-104` reservation in `ScenarioBlock` held at both 320px and 1280px with no
adjustment needed, and the MENU_CAP-item menu did cross its scroll threshold, so the cap
reaches the state it claims to demonstrate.

Run 1 is the load-bearing evidence for defect 3 in §3: five identical timeouts on a page
that rendered nothing. No jsdom test could have produced that signal.

### 4.4 Submit interception proven non-vacuous

Removing the capture-phase `preventDefault` from `ScenarioBlock` fails
`a form submit inside the block never fires its action`, confirming the guard does the
work rather than jsdom never dispatching a submit.

---

## 5. Meta-tests created or extended

| Meta-test | Change |
| --- | --- |
| `tests/admin/dev/filesMembership.test.ts` | **CREATED.** Walks `app/admin/dev/` and requires every route module be registered in `with-admin-dev-flag.mjs`'s `FILES`. Fails by default for a new surface. Parses the array rather than string-searching, because the entries carry comments containing the very paths a substring check would match |
| `tests/log/_auditableMutations.ts` | Extended: 4 rows + 2 forensic codes |
| `tests/log/adminOutcomeBehavior.test.ts` | Extended: 7 behavioral tests |
| `tests/admin/build-artifact-gate.test.ts` | Extended: gallery route in both the flag-set and flag-unset assertions |

### Registries the feature had to join (found by the full suite, not by review)

Six structural registries failed on first full-suite run. Each was a real omission, and
they are recorded because the same fan-out will apply to the next comparable surface.

| Registry | Why it fired | Resolution |
| --- | --- | --- |
| `tests/messages/showScopedCopy.test.ts` | Task 1 moved the `"show"`-scoped `deriveAlertMessageParams` call OUT of `fetchPerShowAlerts.ts`, so the pin was scanning a file with zero calls | Pin follows the call to `deriveAlertRowFields.ts`. Its own length guard is what caught this |
| `tests/admin/_metaAttentionItemsTopology.test.ts` | `deriveAttentionItems` gained a second caller | Gallery ADMITTED with rationale: the rule guards against show-scoped copy leaking to a GLOBAL surface, and the gallery is a dev instrument whose job is to render exactly what the modal renders. A third caller still fails |
| `tests/messages/_metaAdminAlertProducer.test.ts` | Materialize writes `admin_alerts` by raw insert, not the `upsert_admin_alert` RPC | Allowlisted (the list existed and was empty). The RPC takes `(show_id, code, context)` and derives `occurrence_count` and `raised_at` itself, so it CANNOT express a scenario declaring `occurrence_count: 7` — reachable through the RPC only by raising the alert seven times, which is the state the gallery exists to show without waiting |
| `tests/auth/developerGatingContract.test.ts` | Four new exported actions; and the gate assertion rejected `requireDeveloperIdentity` | Registry rows added. The assertion was stricter than its own header comment (`requireDeveloper*()`); widened to accept the identity variant, which is the SAME function with its return kept (`lib/auth/requireDeveloper.ts:220-249`) so the posture guarantee is unchanged |
| `tests/cross-cutting/auth-chain-audit.test.ts` (x2) | New route unclassified | `TRUST_DOMAINS` row: `requireDeveloper`, same chokepoint as its sibling dev harnesses |

`filesMembership` closes self-found defect D8: the build gate's only proof was opt-in
behind an env var set in no workflow, so an unregistered dev route shipped with nothing
checking it.

---

## 6. Invariant compliance

| Invariant | Status |
| --- | --- |
| 1. TDD per task | Every task: failing test first, verified failing, then implementation |
| 2. Advisory lock | N/A — no path here mutates a locked table under a show lock |
| 3. Email canonicalization | N/A — no raw email enters the system |
| 4. No global cursor | N/A |
| 5. No raw error codes in UI | Honored, with the §1.1 dev-instrument exception: raw reasons appear only on a detail line, never as a headline |
| 6. Commit per task | One commit per task, conventional-commits style |
| 7. Spec canonical | Two spec claims corrected against live code (D-B, D-C) rather than silently coded around |
| 8. Impeccable dual-gate | See §7 |
| 9. Supabase call boundary | Every call destructures `{ data, error }`; thrown and returned errors funnel to one typed result; `infra_error` vs `partial` discriminated by what committed |
| 10. Mutation-surface observability | 4 registry rows, 7 behavioral proofs, post-commit emits outside any lock |
| 11. Isolated worktree | All work in `../FX-worktrees/attention-scenario-gallery` |

---

## 7. Impeccable dual-gate

Both halves run per invariant 8, each with the canonical v3 setup gates (`context.mjs`
context load, then the `product` register reference). Assessments A and B ran as two
isolated sub-agents; not degraded.

### critique

AI-slop verdict: **not slop**. Detector: **exit 0, zero rules fired**. Heuristics averaged
3.3/4; lowest was Help/documentation (2).

| Finding | Disposition |
| --- | --- |
| P2 menu open by default duplicates the cards below | **REJECTED — spec-ratified.** §4.0 requires `useState(true)` "so the menu is visible without a click"; the e2e readiness gate depends on it |
| P2 validation-confirm checkbox has no `min-h-tap-min` (native ~16px) | **FIXED.** DESIGN.md applies the 44px floor to all chrome and controls with no dev-tool carve-out |
| P3 15 scenarios on one scroll, `id`s that nothing links to | **FIXED.** Added a jump-list nav |
| P3 slug input has no example, forcing recall | **FIXED.** `placeholder="east-coast-2026"` |
| Inline `<a>` in prose missing tap-min | **REJECTED — false positive.** WCAG 2.5.5 inline exception, explicit in PRODUCT.md |
| Raw item id in the navigation readout | **ACCEPTED.** Within the §1.1 exception (routing readout, scenario ids) |

### audit

| Dimension | Score |
| --- | --- |
| Accessibility | 3/4 |
| Performance | 4/4 |
| Theming | 4/4 |
| Responsive | 3/4 |
| Anti-patterns | 4/4 |

| Finding | Disposition |
| --- | --- |
| P2 open menu overlays its OWN block's cards (`pb-104` only protects the NEXT block) | **FIXED.** Replaced trailing padding with an in-flow `h-120` spacer tied to `open`, plus two new real-browser assertions at 320px and 1280px |
| P2 result panel has no `role="status"`/`aria-live`, unlike every sibling async surface | **FIXED** |
| P3 h1 20px to h2 18px is a 1.11x step, below DESIGN.md's 1.25x floor | **FIXED** |
| P3 raw error text lacks `break-words`, overflow risk at 320px | **FIXED** |

Audit also independently **verified correct**: `useFormStatus` sits inside its own form
ancestor so pending genuinely fires; no em-dash in user-visible copy; all tap targets
≥44px; zero hardcoded colors.

### The audit's best catch

`pb-104` was bottom padding on the section, so it reserved space AFTER the block's own
content. The menu is absolutely positioned and open by default, so it rendered on top of
that block's own cards — worst at 320px, where the menu is nearly full width and hides
most of the first card. The Task-16 Playwright tests passed throughout, because they only
compared each menu against the NEXT block.

The fix reserves the space IN FLOW, immediately after the pill, so this block's content
starts below the menu and the next block is cleared by the same mechanism. Tied to `open`
so a closed block does not carry 480px of dead scroll. Two new browser assertions pin it
at both widths, each guarded against vacuity by requiring a group to exist.

## 8. Cross-model review

_Filled at close-out._

## 9. CI

_Filled at close-out._

---

## 10. Operational note for future runs in this repo

Playwright boots **every** `webServer` in `playwright.config.ts`, not only the ones a
selected `--project` needs. The `prod-build` and `prod-runtime-flip` servers build with
`ADMIN_DEV_PANEL_ENABLED` unset, which makes `scripts/with-admin-dev-flag.mjs` rename
`app/admin/dev/**` aside to `*.disabled-by-build-gate` for the duration of that build.

Any Vitest suite that reads those files from disk therefore fails while a Playwright run
is in flight:

```
Error: ENOENT: no such file or directory, open '.../app/admin/dev/actions.ts'
  tests/log/_auditableMutations.shape.test.ts
Error: Cannot find package '@/app/admin/dev/actions'
  tests/log/adminOutcomeBehavior.test.ts
```

This is environmental, not a defect: both suites pass when run on a settled tree. Do not
run the Vitest suite concurrently with a Playwright run, and do not chase these two
failures as real. `tests/admin/dev/filesMembership.test.ts` normalizes the suffix away
precisely so it is not subject to this race.
