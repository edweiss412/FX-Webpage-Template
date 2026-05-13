# Phase I — Close-out

**Scope:** The required quality gates before M12 ships. `/impeccable critique` + `/impeccable audit` on every `/help/*` page (AGENTS.md invariant #8). Cross-CLI adversarial review of the assembled M12 work (per AGENTS.md writing-plans additions). Final M12 handoff doc capturing findings + dispositions.

**Prereqs:** Phases A – H complete. All 17 unit/integration tests + the CI drift gate pass green.

**Tasks:** I.1 → I.3 (3 tasks). I.1 must complete before I.2 (impeccable findings inform what the cross-model reviewer focuses on); I.2 must complete before I.3 (handoff doc records both).

---

### Task I.1: impeccable v3 critique + audit per page

**Files:**
- Modify: any `/help/*` page or component that impeccable surfaces a HIGH or CRITICAL finding on.
- Modify: `handoffs/M12-help.md` (Phase I.3 creates this; Task I.1 logs findings + dispositions in §12 per the project's handoff convention).

Per AGENTS.md invariant #8 — every UI surface goes through `/impeccable critique` + `/impeccable audit` before milestone close-out. **Both commands are required, not one or the other.** Run with the canonical v3 preflight gates (PRODUCT.md / DESIGN.md / register identification / preflight signal).

For M12, the relevant pages and components:

- 13 `/help/*` pages from Phase E
- 8 components: `Sidebar`, `Header`, `Breadcrumb`, `Callout`, `Step`, `Screenshot`, `RefAnchor`, `TipFromSheets`
- The chrome composition in `app/help/layout.tsx`
- The §5.6 affordance-matrix retrofits (testids + Learn-more links inside existing M3/M9/M10 components — those should already have impeccable run for their owning milestones, but the M12 retrofit may introduce new visual elements that warrant a re-pass)

- [ ] **Step 1: Run `/impeccable critique` on the `/help/*` surfaces**

Use the impeccable v3 slash command. Example invocation:

```
/impeccable critique
```

Scope: the diff produced by Phases A – H. Cache the critique output in `handoffs/M12-help.md` §12 — list findings by severity.

- [ ] **Step 2: Run `/impeccable audit`**

```
/impeccable audit
```

Same scope. Cache the audit output in `handoffs/M12-help.md` §12 alongside the critique findings.

- [ ] **Step 3: Address every HIGH and CRITICAL finding**

For each finding:
- **Fix it inline.** Commit per fix with `fix(help): <impeccable finding summary> (Task I.1)`.
- **OR explicitly defer via `DEFERRED.md`** (matching the existing crew-pages plan's `DEFERRED.md` pattern at `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/DEFERRED.md`). For M12, the canonical deferral file path is `docs/superpowers/plans/2026-05-12-user-facing-docs/DEFERRED.md` (mirror the crew-pages pattern under the M12 plan directory). Acceptable for findings that are real but better-scoped to a follow-up milestone.

LOW and MEDIUM findings: implementer discretion. Default to fix-now unless it adds scope creep.

- [ ] **Step 4: Re-run BOTH commands to verify no regressions**

After all HIGH/CRITICAL findings are addressed or deferred, re-run `/impeccable critique` and `/impeccable audit`. The second pass should show zero HIGH/CRITICAL findings (or only ones already in `DEFERRED.md`).

- [ ] **Step 5: Commit handoff doc updates**

```bash
git add docs/superpowers/plans/2026-05-12-user-facing-docs/handoffs/M12-help.md docs/superpowers/plans/2026-05-12-user-facing-docs/DEFERRED.md
git commit -m "docs(handoff): M12 impeccable critique + audit findings (Task I.1)"
```

---

### Task I.2: Cross-CLI adversarial review

**Files:**
- Modify: `handoffs/M12-help.md` (record convergence log)

Per AGENTS.md writing-plans additions: cross-CLI adversarial review is **mandatory** between self-review and execution handoff. For this plan, the execution-handoff has already happened (Phase A – H is the execution); I.2 retroactively reviews the assembled M12 work against the canonical spec.

**Invocation (r2 fix per I-r1 finding 2 — pin the milestone base SHA so the final APPROVE attests to the full M12 diff, not just the latest fix):**

```bash
# 1. Capture the M12 base SHA — the commit BEFORE M12's first plan scaffold
#    landed. The first M12 commit is `b30f522` ("M12 plan scaffold — README
#    + overview + Phase A foundation"), so the base is its parent:
M12_BASE=$(git rev-parse b30f522^)
echo "M12 base: $M12_BASE"

# r3 fix per I-r2 finding 1: GUARD the capture. The earlier grep-based
# command produced empty when oneline history didn't contain "Phase A.1".
# Always verify the resolved SHA exists before invoking the reviewer:
test -n "$M12_BASE" && git rev-parse --verify "$M12_BASE^{commit}" >/dev/null \
  || { echo "FATAL: M12_BASE empty or invalid — fix the SHA above"; exit 1; }

# 2. Invoke with --base AND --scope branch so every round reviews the FULL
#    M12 diff (not the previous-round fix-base, which would hide drift
#    outside the latest fix surface — see memory note "Adversarial review
#    must keep full-milestone scope, not narrow per-round").
/codex:adversarial-review --wait --base "$M12_BASE" --scope branch \
  "M12 Phase I final fresh-eyes review: audit the entire M12 plan + implementation against spec r14, all 17 §7.1 tests, AC-12.1 through AC-12.39, and every plan-wide invariant from AGENTS.md. Return verdict + findings."

# 3. Each retry MUST keep the same --base so the cumulative APPROVE attests
#    to the complete milestone. If M12's first commit SHA changes (e.g.,
#    history rewrite), update `b30f522` above to the new first-M12-commit
#    SHA before re-running.
```

See also: memory note "Adversarial review canonical invocation" in `~/.claude/projects/-Users-ericweiss-FX-Webpage-Template/memory/`.

The reviewer should anchor on the spec's watchpoints + the 9-round spec review history. Specific watchpoints for the M12 *implementation* review:

1. **Catalog drift class:** every code master-spec §12.4 marks admin-log-only has `dougFacing: null` in the live catalog post-B.2 + B.5.
2. **Clock pipeline class:** every render-side `new Date()` / `Date.now()` reachable from a screenshot manifest route uses `lib/time/now.ts` (or carries a per-line waiver). Mid-test the assertion by capturing the same surface at two `frozenClockInstant` values 60+ seconds apart.
3. **Affordance retrofit completeness:** every concrete row in `AFFORDANCE_MATRIX` has its testid in the live component.
4. **Render-side gate preview exception:** the preview-as-crew render emits no `Learn more →` links inside the previewed crew content (only the sticky banner is admin-context).
5. **`/help/errors` trailing CTA:** "If this keeps happening, tell Eric →" — NOT a self-linking "Learn more →".
6. **`<picture>` contract on every captured surface:** every WebP pair (light + dark) exists; `<Screenshot>` emits the prefers-color-scheme `<source>`.
7. **invariant #5 compliance:** `/help/errors` shows codes only as anchor fragments; the visible heading is `entry.title`, never the raw code.

- [ ] **Step 1: Run the cross-CLI review**

Follow the project's canonical adversarial-review invocation. Capture output to `handoffs/M12-help.md` §10 (Convergence Log).

- [ ] **Step 2: Iterate fix → review → fix → review until APPROVE**

Per memory note "Iterate adversarial review until APPROVE" — keep iterating; the round-3 cap is for finding-disagreement loops, NOT for halting when each round surfaces new bugs. Pause only on tooling failures or genuine value-judgment ambiguity.

For every round's findings: address them in the codebase (NOT in the spec — the spec is canonical at the current r14 revision (which incorporates r11-r14 amendments). Implementers fix code, not spec, except when an explicit ratified amendment is needed — see I.3 amendment log), commit per fix, then re-trigger the review.

- [ ] **Step 3: Commit handoff doc convergence-log updates after each round**

```bash
git add docs/superpowers/plans/2026-05-12-user-facing-docs/handoffs/M12-help.md
git commit -m "docs(handoff): M12 adversarial-review round N findings + fixes (Task I.2)"
```

- [ ] **Step 4: Final APPROVE**

When the reviewer returns APPROVE, mark Task I.2 complete and proceed to I.3.

---

### Task I.3: M12 handoff doc

**Files:**
- Create or finalize: `docs/superpowers/plans/2026-05-12-user-facing-docs/handoffs/M12-help.md`

The handoff doc is the canonical record of M12's execution. Mirror the existing handoff pattern at `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/handoffs/`.

**r3 fix per I-r2 finding 2 (MEDIUM):** when copying `HANDOFF-TEMPLATE.md` to `handoffs/M12-help.md`, IMMEDIATELY update the template's Spec version line. The template (post-r3) shows r14 + the r11-r14 amendment lineage but still requires the implementer to fill in the actual r14 commit SHA via:

```bash
SPEC_SHA=$(git log -n1 --format="%h" -- docs/superpowers/specs/2026-05-12-user-facing-docs-design.md)
echo "Spec r14 commit: $SPEC_SHA"
# Then edit handoffs/M12-help.md's Spec version line to replace the
# placeholder with this SHA.
```

Without this step the handoff records a stale-or-undefined spec SHA, and the final close-out attests to nothing.

Required sections (per the project's HANDOFF-TEMPLATE.md):

1. **Spec sections in scope** — list every §X reference the M12 work touched
2. **AC list** — every AC-12.* with PASS / DEFERRED / N/A annotation
3. **Amendments in scope** — none for M12 (spec r14 is canonical (incorporating r11/r12/r13/r14 amendments: STALE_MANUAL_REPLAY_ABORTED classification, parser canonical-derivation, predicate single source of truth, Screenshot `name` prop). Plan-amendments documented inline per task; aggregate list in 00-overview if needed)
4. **Test commands** — exact commands to verify each test class, with expected output
5. **Convergence log** — round-by-round adversarial-review record (from Task I.2)
6. **Watchpoints** — class-vector reminders for the next milestone or for follow-up: catalog drift, clock pipeline, affordance retrofit, preview exception
7. **Linked content** — any `/help` content drafts deferred (e.g., crew-facing pages → phase 2)
8. **Impeccable findings + dispositions** — full list from Task I.1
9. **Performance & bundle impact** — `pnpm build` artifact size delta vs. pre-M12 baseline; any concern with the new @next/mdx + sharp deps
10. **Convergence log** — round-by-round (from Task I.2)
11. **Routing decision update** — confirm M12 is in `ROUTING.md` with Opus as implementer + Codex as reviewer
12. **Sign-off** — implementer + reviewer + date

- [ ] **Step 1: Run all tests + final production build + capture output**

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm screenshot:help && git diff --exit-code public/help/screenshots/
# r10 (round-9 finding 1): final `pnpm build` against the FULL post-content
# state proves AC-12.1 — every page compiles to RSC chunks. Phase A's stub-
# era build was only against placeholders; a real MDX/RSC build failure
# introduced by Phase E content would not be caught until ship without this.
pnpm build
```

Expected: all green; `pnpm build` completes without errors. This is the AC-12.1 post-content build proof, distinct from Phase A.1's stub-era build.

- [ ] **Step 2: Write `handoffs/M12-help.md`**

Use HANDOFF-TEMPLATE.md (in the plan dir) as a template. Fill in every section.

- [ ] **Step 3: Update `ROUTING.md`**

Add the M12 row to the project's main `ROUTING.md`:

```
| M12 | User-facing /help docs | Opus / Claude Code | Codex (cross-CLI) | UI surface — invariant #8 (impeccable v3 gate); UI-always-Opus rule |
```

- [ ] **Step 4: Commit + close-out announcement**

```bash
git add docs/superpowers/plans/2026-05-12-user-facing-docs/handoffs/M12-help.md docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/ROUTING.md
git commit -m "docs(handoff): M12 final handoff doc + routing update (Task I.3 — milestone close-out)"
```

---

## Phase I close-out

After I.1 – I.3 commits land:

- [ ] `/impeccable critique` + `/impeccable audit` both pass with zero un-deferred HIGH/CRITICAL findings
- [ ] Cross-CLI adversarial review returns APPROVE
- [ ] `handoffs/M12-help.md` is complete with all 12 sections filled
- [ ] `ROUTING.md` includes M12
- [ ] **M12 ships.**

Phase I introduces commits proportional to the number of impeccable + adversarial findings + the handoff doc.

---

## Full milestone close-out checklist

When all 9 phase files are complete, verify the entire milestone:

- [ ] All 13 `/help/*` pages render
- [ ] **`pnpm build` succeeds against the post-content state** (AC-12.1 final proof; r10 — distinct from Phase A.1's stub-era build)
- [ ] `pnpm dev` + visit `/help` as admin → see Header + Sidebar + Breadcrumb + content; theme toggle works (if Phase D wired one)
- [ ] `pnpm dev` + visit `/help` unauth → 403
- [ ] All 17 unit/integration tests + CI drift gate green
- [ ] CI drift gate exits 0 on `git diff --exit-code public/help/screenshots/`
- [ ] No `<ScreenshotPlaceholder>` references in MDX
- [ ] §9.0.1 affordances on `/admin/*` carry their documented testids and emit `Learn more →` links
- [ ] Catalog admin-log-only codes have `dougFacing: null` and are no longer surfaced by AlertBanner
- [ ] M12 handoff doc complete + routing updated
- [ ] M12 marked closed in `ROUTING.md`
