# Spec — MI-9 LEAD-bit change: reconcile canon to auto-apply + close the silent-audit gap

**Date:** 2026-07-17
**Slug:** `mi9-lead-autoapply-fyi`
**Backlog:** `BL-MI9-LEAD-ROUTING-DIVERGENCE` · **Branch:** `fix/mi9-lead-staging`
**Class:** SECURITY / AUDIT (auth-sensitive) + canonical-spec reconciliation
**Owner decision (2026-07-17):** Option **B** — a LEAD-bit change is a deliberate sheet edit (Doug typing/removing `LEAD` in the source sheet), not a parser guess, and does not sever access (no auth-floor bump). It **auto-applies**; the canonical spec is reconciled to match, and the currently-**silent** LEAD change gains an **info-severity audit FYI**.

---

## 1. Problem (two parts)

**1a. Security/audit gap (the real defect).** When a crew member gains or loses the `LEAD` role flag via a sheet edit (MI-9), the change **auto-applies** (`lib/sync/phase1.ts` "Phase 2 decision rule" — MI-11 is the only gated invariant) but emits **no code-carrying admin_alert / audit signal**. `nonLeadRoleFlagChanges` (`lib/sync/phase2.ts:245`) at `:257` does `if (hasLead(prior) !== hasLead(next)) continue;` — it explicitly **skips** the LEAD toggle, so the info-severity `ROLE_FLAGS_NOTICE` alert (`phase2.ts:518-528`) never fires for a LEAD change. `MI-9_ROLE_FLAGS_DELTA` (`lib/messages/catalog.ts:866`, `spec-codes.ts:581`) exists in the catalog but **no live code path emits it** — it is dead. Net: LEAD (an ops + `shows_internal` financial access grant/loss) auto-applies **silently**. A mistaken LEAD grant on the wrong crew member takes effect on their next page load with no audit entry for Doug to catch.

**1b. Canonical-spec divergence.** The master spec (§6.8 `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1624`, §12.4 `:2862`, help `:3155`) and ratified amendment 8 (`plans/…/00-overview.md:158-175`) say MI-9 LEAD **"Stage for approval."** The live code auto-applies it, per the **2026-06-08 sync-changes-feed-identity-gate** amendment (`plans/…/02-decision-rule-and-hold-aware-apply.md:39,42,50`) which is **not in the `00-overview` ratified list**. Per invariant 7 the spec is canonical, so today's code contradicts it. Owner ratifies the auto-apply behavior (option B) — the canon must be updated to match, and the 2026-06-08 amendment recorded as governing.

## 2. Non-goals

- **No sync-routing change.** MI-9 keeps auto-applying; `phase1.ts` is untouched. `phase1.test.ts:847` (MI-9 → `"pass"`) and `phase1.decision-rule.test.ts:42` stay correct.
- No new advisory-lock surface, no schema migration, no new admin route.
- No change to non-LEAD role_flags handling beyond the copy/helper-name broadening described here.
- No change to MI-11/12/13/14 (they still stage/hold — they bump auth floors / kill links; MI-9 does neither, §6.8.2:1713).

## 3. Fix — wire the LEAD FYI (design (a): reuse `ROLE_FLAGS_NOTICE`)

`ROLE_FLAGS_NOTICE` is already `severity: "info"`, `audience: "health"`, `healthWeight: "notice"`, `resolution: "manual"` (`catalog.ts:879`) and fully wired through every consumer (alert union, identity map, actions/openSheet, health, banner-exclude, audience contract). Reuse it for LEAD — **zero new catalog code**, minimal fanout.

**3.1 Producer.** In `nonLeadRoleFlagChanges` (`phase2.ts:245-262`): **remove the LEAD-skip at `:257`** so a LEAD-bit toggle also produces a `roleFlagChanges` entry → the existing `roleFlagsNotice` emission (`phase2.ts:518-528`) fires with `context.changes = [{ crew_name, prior_flags, new_flags }]`. **Rename** the now-misnamed helper `nonLeadRoleFlagChanges` → `roleFlagChangesForNotice` (or `applyableRoleFlagChanges`); sweep call sites (`phase2.ts:245` def + its single caller ~`:515`). The `roleFlagsEqual` no-op skip (`:258`) stays — an identical role set emits nothing.

**Guard conditions:** `prior_flags`/`new_flags` are always arrays (from parsed crew); an added crew member (`!priorMember`) is skipped (`:256`) — a LEAD grant on a *new* crew member surfaces via `crew_added`, not this notice (unchanged). A removed crew member never reaches `nextCrewMembers`. Empty `roleFlagChanges` → no alert (unchanged).

**3.2 Copy (must broaden — currently LEAD-false).** `ROLE_FLAGS_NOTICE.dougFacing` (`catalog.ts:887`) currently says *"The LEAD bit is unchanged, so the change was applied automatically."* — this becomes **false**. Rewrite to cover both cases and carry the confirm-intent nuance for LEAD, e.g.:
> `dougFacing`: "A crew member's role flags changed and were applied automatically — this entry is here for your audit. If the change included LEAD status (which grants admin/ops/financials access), confirm it was intentional."

Update `helpfulContext` (`catalog.ts:890`) and `dougSummary` (`catalog.ts:884`) to drop the "doesn't affect LEAD" claim and note LEAD toggles are included (auto-applied because a sheet edit is deliberate; still logged for audit). **These are §12.4-catalog rows → the lockstep in §5 applies.**

**3.3 Retire the dead code.** `MI-9_ROLE_FLAGS_DELTA` has no producer under B. Retire it (strikethrough / retired-row, mirroring the retired `FIRST_SEEN_REVIEW` precedent) in both §12.4 prose and `catalog.ts:866` so the two agree. Do NOT delete the code identifier where a generated enum or historical reference needs it to remain resolvable — mark retired, not removed, unless the generators tolerate removal (verify against `gen:internal-code-enums`).

## 4. Canonical-spec + amendment reconciliation

- **§6.8 MI-9 row** (`:1624`) and **MI-10 row** (`:1629`): change the outcome from **"Stage for approval"** → **"Auto-apply; emit info `ROLE_FLAGS_NOTICE` for audit"**; keep the examples but relabel the "stage" examples as auto-apply + FYI. Update the rationale prose (LEAD is a deliberate sheet edit; no auth-floor bump; the FYI is the audit trail).
- **§6.8.2 derivation** (`:1713`): already "none — LEAD propagates via Phase 2 UPSERT"; add that it auto-applies with the `ROLE_FLAGS_NOTICE` FYI (not staged).
- **§12.4** (`:2862` `MI-9_ROLE_FLAGS_DELTA` → retired-strikethrough, `dougFacing` `—`); broaden **`ROLE_FLAGS_NOTICE`** prose (`:2863`) to include LEAD.
- **Help copy** (`:3155`/`:3157`/`:3158`): drop "we hold every LEAD toggle for review"; state LEAD changes auto-apply with an audit FYI (confirm-intent).
- **`00-overview.md` amendment 8** (`:158-175`): edit "Phase 1's MI-9 check **stages**…" → "…**auto-applies** with an info `ROLE_FLAGS_NOTICE`"; adjust the amendment **count** at `:25`. **Add** the 2026-06-08 sync-changes-feed-identity-gate amendment to the ratified list as the governing decision for MI-9 auto-apply, cross-referencing `02-decision-rule-and-hold-aware-apply.md`.
- **NEVER run prettier on the master spec** (mangles §12.4 → x1 fails).

## 5. §12.4 catalog lockstep (one commit; CI gate `x1-catalog-parity`)

Any §12.4 row edit lands three updates together (AGENTS.md §12.4 rule): (a) master spec §12.4 prose; (b) `pnpm gen:spec-codes` → regen `lib/messages/__generated__/spec-codes.ts`; (c) the matching `lib/messages/catalog.ts` row. Enforced by `tests/cross-cutting/codes.test.ts` (+ `extract-spec-codes.test.ts`) — drift blocks merge. Applies to BOTH the `ROLE_FLAGS_NOTICE` copy broadening AND the `MI-9_ROLE_FLAGS_DELTA` retirement. Also re-run any code-enum generators that enumerate `MI-9_ROLE_FLAGS_DELTA` (`gen:internal-code-enums`) and confirm help `_families`, `TRUST_DOMAINS`, observe `codes`, and the digest no longer treat it as a live staged code.

## 6. Tests (TDD)

- **`tests/sync/phase2.test.ts`** (existing `roleFlagsNotice` block ~`:594-646`, currently only non-LEAD cases): ADD a **LEAD-gain** case (`["A1"] → ["A1","LEAD"]`) and a **LEAD-loss** case (`["LEAD","A1"] → ["A1"]`) asserting `roleFlagsNotice` **IS** produced with the correct `context.changes` (crew_name + prior/new flags). Failure mode caught: the `:257` skip leaving a LEAD change silent. Also assert an identical role set still produces **no** notice.
- **DB / apply-path test** (`runScheduledCronSync` or `applyStaged` DB test): a LEAD-bit auto-apply upserts a `ROLE_FLAGS_NOTICE` `admin_alerts` row (the end-to-end audit signal exists). Anti-tautology: derive the expected crew/flags from the fixture diff.
- **`tests/messages/codes.test.ts` / x1 parity**: regenerate + confirm catalog↔§12.4 parity after the `ROLE_FLAGS_NOTICE` copy change and the `MI-9_ROLE_FLAGS_DELTA` retirement.
- **`tests/messages/_metaAdminAlertCatalog.test.ts`**: reconcile — `ROLE_FLAGS_NOTICE` unchanged in shape (still info/health); if `MI-9_ROLE_FLAGS_DELTA` is retired, drop/adjust its registry rows.
- **Alert-contract meta-tests** (`_metaAlertActionsContract.test.ts:42`, `_metaAlertAudienceContract.test.ts:52`): confirm the (unchanged) `ROLE_FLAGS_NOTICE` emission shape + audience still pass with LEAD now triggering it.
- **`mi.test.ts:984-1057`** (invariant-level MI-9 → item emitted): **unchanged** — `runInvariants` still emits the MI-9 item; only phase1's routing (unchanged) and phase2's alerting (fixed) matter.
- Grep for any test asserting a LEAD change emits nothing / is silent — flip it.

## 7. Do-not-relitigate (reviewer preempts)

1. **MI-9 auto-applies — ratified by the owner (option B, 2026-07-17)** — a LEAD change is a deliberate sheet edit, not a parser guess, and bumps no auth floor (§6.8.2:1713). It is NOT MI-11 (email changes kill links → MI-11 stays held). No sync-routing change; `phase1.ts` untouched.
2. **Reuse `ROLE_FLAGS_NOTICE`, retire `MI-9_ROLE_FLAGS_DELTA`** — §3; design (a), minimal fanout (no new code). A distinct LEAD-specific FYI code (design (b)) was considered and deferred as higher-churn; can be a follow-up if Doug wants LEAD changes visually distinct from dept swaps.
3. **The security value is the audit FYI, not a pre-review gate** — the owner accepts that an intentional LEAD sheet edit auto-applies; the FYI closes the silent-audit gap so a mistaken grant is catchable post-hoc.
4. **Canon reconciliation is mandatory, not optional** — leaving §6.8/§12.4 saying "stage" while the code auto-applies is the original divergence; §4 fixes it, with the 2026-06-08 amendment recorded as governing.
