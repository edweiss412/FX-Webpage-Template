# Spec — Narrow `ROLE_FLAGS_NOTICE` to LEAD-only + reclassify `audience: health → doug`

**Date:** 2026-07-17
**Slug:** `role-flags-notice-lead-only-doug`
**Branch:** `fix/role-flags-notice-lead-doug`
**Class:** UX / alert-audience reconciliation (auth-audit-adjacent — LEAD grants admin/ops/financials)
**Owner decision (2026-07-17, post-ship review of #439):** Seeing the shipped `ROLE_FLAGS_NOTICE` bell alert live, the owner ratified: (a) the bell nudge should fire **only for LEAD gain/loss**, not routine non-LEAD department/scope swaps; (b) it is a **Doug-facing operator audit nudge**, not a developer/health concern, so it should be **dismissible**, render a **calm non-alarming tone (not the red critical it shows today)**, and deep-link to the **sheet** (not dev telemetry). The precise tone is the **info/accent tone** (the design's orange accent, `data-tone="info"`) — semantically correct for an `info`-severity notice and calmer than the amber/warn `notice` tone; "amber" in the original framing meant "not red", now pinned precisely to the info/accent tone (Round 1, Codex F2). Forcing the warn/amber `notice` tone on an `info`-severity code would require a per-code `rowTone` special-case (the exact hack the catalog-derived cascade avoids), so it is rejected. This **supersedes `mi9-lead-autoapply-fyi` §7.2** (which ratified `audience: "health"` for minimal fanout). The durable `LEAD_ROLE_APPLIED` app_event — the authoritative, non-losable dev/forensic record — is **unchanged**; this spec reduces feed noise and re-homes the operator nudge, it does not weaken the audit.

---

## 1. Problem

`ROLE_FLAGS_NOTICE` (`lib/messages/catalog.ts:866-883`) is `audience: "health"`, `healthWeight: "notice"`, `severity: "info"`, `resolution: "manual"`. It was reused as a Doug-facing LEAD audit FYI by #439 (`mi9-lead-autoapply-fyi`) but kept its older `health` classification from the 2026-07-04 audience-split sweep. That classification, applied to a Doug-directed message, produces three incoherences (all catalog-derived, no per-code hardcoding):

1. **Not dismissible.** Both resolve routes 403 any health code:
   - `app/api/admin/admin-alerts/[id]/resolve/route.ts:117-118` → `ALERT_HEALTH_RESOLVE_FORBIDDEN`
   - `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts:123-124` → same

   `BellPanel.tsx:275` gates the Dismiss button on `!isHealth`, and `isHealth = HEALTH_CODES.includes(code)` (`lib/admin/bellFeed.ts:126`). So a health row shows only "View in telemetry" and never clears — and `ROLE_FLAGS_NOTICE` is not auto-resolving (`resolution: "manual"`, absent from `AUTO_RESOLVING_CODES`), so it has no lifecycle to ever leave the feed.

2. **Renders red critical.** `rowTone` (`BellPanel.tsx:128-132`) short-circuits `if (entry.isHealth) return "critical"` **before** consulting severity/weight, so a `notice`-weight, `info`-severity FYI paints as a red `CircleAlert` — contradicting the health rollup's own amber treatment of the same code (`healthRollup` reduces `notice` → amber, `degraded` → red).

3. **Dev-directed action.** `isHealth` rows render the "View in telemetry" link → `/admin/dev/telemetry` (dev-gated), instead of the `openSheet` action the code already carries in `ALERT_ACTION_CODES` (`lib/adminAlerts/alertActions.ts:85`).

Separately, the **producer fires for every applied role_flags change, LEAD or not.** `roleFlagChangesForNotice` (`lib/sync/phase2.ts:250-296`) pushes a change entry for any existing-crew role_flags diff (`:287-292`) — non-LEAD department swaps (A1 → V1), additive flags (BO), etc. Only the new-crew branch is LEAD-gated (`:278`). Non-LEAD role changes have **zero security value** (they change only which tile a crew member sees on their own page) yet generate the same permanent, red, non-dismissible bell alert. This is the "notified every time roles change" noise.

**Dev is already independently covered** by the durable `LEAD_ROLE_APPLIED` app_event (`lib/log/emitLeadRoleApplied.ts`, queryable via `pnpm observe events --code LEAD_ROLE_APPLIED`), which is LEAD-only. The bell nudge is redundant for dev and, as classified, mis-serves Doug.

## 2. Fix (producer narrow + change-log coverage + audience reclassify)

### 2.1 Producer — narrow the notice to LEAD-only

In `roleFlagChangesForNotice` (`lib/sync/phase2.ts:250`), guard the **existing-crew** push (`:287-292`) so it only fires when the LEAD bit toggles:

```ts
if (roleFlagsEqual(priorMember.role_flags, nextMember.role_flags)) continue;
if (hasLead(priorMember.role_flags) === hasLead(nextMember.role_flags)) continue; // NEW: non-LEAD swap → no notice
changes.push({ crew_name: nextMember.name, prior_flags: [...], new_flags: [...] });
```

The new-crew branch (`:278`) already gates on `hasLead(nextMember.role_flags)` — unchanged. Rename the function `roleFlagChangesForNotice` → `leadRoleChangesForNotice` (it now returns LEAD-only) and sweep its single caller (`:547`) + the comment block (`:245-249`).

**Scope isolation (verified, load-bearing):** the LEAD-only `leadRoleChangesForNotice`/`roleFlagsNotice` list feeds **only** the alert (`upsertAdminAlert`) and the durable event (`emitLeadRoleApplied`). The durable `LEAD_ROLE_APPLIED` event is already LEAD-only (`emitLeadRoleApplied.ts:39` skips entries where `hasLead(prior) === hasLead(new)`), so it is **behaviorally unchanged** — its input now already contains only LEAD entries, a strict simplification. **The change-log rows (§2.4) are a SEPARATE, FULL role diff** (LEAD + non-LEAD) computed by `writeRoleChangeLogRows` at the same `runPhase2` point — do NOT reuse the narrowed LEAD-only notice list for the change log, or non-LEAD rows would be lost. Two distinct derivations from the same applied lists: LEAD-only → alert+event; all-role → change-log.

**Non-LEAD audit gap this exposes (owner-decided: close it — §2.4).** Contrary to a naive reading, a non-LEAD-only role_flags change on an existing crew member does **NOT** produce a `show_change_log` row today. The `field_changed` change-log row (`writeAutoApplyChanges.ts:142-160`) is gated on the **MI-9 invariant, which is LEAD-specific** (`lib/parser/invariants.ts:530` — "LEAD-bit set-membership delta"; MI-10 `:547-561` is also a LEAD safety net). A pure non-LEAD change (A1 → V1) fires no MI-9/MI-10 and matches no `crew_added/removed/renamed` roster change, so it gets **no change-log row** — its only current structured trace is the `ROLE_FLAGS_NOTICE` alert we are narrowing away. Left as-is, narrowing would leave non-LEAD swaps with **only** the live `crew_members.role_flags` value and no history. The owner elected to **preserve change-log coverage** (§2.4) so non-LEAD swaps remain auditable in the change log without the bell nag.

### 2.2 Reclassify audience `health → doug`

In `lib/messages/catalog.ts` ROLE_FLAGS_NOTICE (`:866-883`):
- `audience: "health"` → `audience: "doug"`
- **remove** `healthWeight: "notice"` (`:870`) — the audience contract forbids `healthWeight` on non-health codes (`_metaAlertAudienceContract.test.ts:87-91` asserts `doug` codes have no `healthWeight`).
- **remove** `dougSummary` (`:871-872`) — the same contract asserts `doug` codes have `dougSummary == null` (`:89`); `dougSummary` is the health-popover line, dead once out of the rollup.
- `severity: "info"` — **unchanged** (keeps it out of Doug's amber banner + count via `DOUG_EXCLUDED_CODES`' info arm, `lib/adminAlerts/audience.ts:34-39`).
- `resolution: "manual"` — **unchanged**.

**Cascade (all catalog-derived — no per-code UI/route code changes):**

| Consumer | Mechanism | Result after reclassify |
|---|---|---|
| Resolve routes | `HEALTH_CODES.includes(row.code)` 403 gate | not in `HEALTH_CODES` → no 403 → resolve succeeds (200) |
| `BellPanel` Dismiss | gated on `!isHealth` (`:275`) | `isHealth` false → **Dismiss renders** |
| `BellPanel` tone | `rowTone` isHealth short-circuit (`:129`) | not health → `severity: "info"` → `data-tone="info"` → **info/accent tone (orange), not red critical** (`TONE.info` = `bg-accent-on-bg`/`text-accent-on-bg`, `BellPanel:151`) |
| `BellPanel` action | `isHealth ? telemetry : action` (`:246-264`) | not health → `openSheet` action link (**sheet deep-link**) |
| `healthRollup` | `.in("code", HEALTH_CODES)` | drops out — dev keeps `LEAD_ROLE_APPLIED` |
| `PerShowAlertSection` | excludes `HEALTH_CODES` (`:152-154`) | now **included** → per-show LEAD audit note, dismissible |
| Amber banner + count | excludes `DOUG_EXCLUDED_CODES` (info ∪ health) | still excluded (via info arm) → **no banner spam** |

**Meta-test + doc reconciliation:**
- `tests/messages/_metaAlertAudienceContract.test.ts`: move `"ROLE_FLAGS_NOTICE"` from the `NOTICE` array (`:52`) to the `DOUG` array; update the partition-count test (`:71-76`) from `19 doug + 26 health = 45; 16 degraded + 10 notice` → **`20 doug + 25 health = 45; 16 degraded + 9 notice`**.
- `tests/messages/_metaAdminAlertCatalog.test.ts`: `ROLE_FLAGS_NOTICE: { class: "event-manual" }` (`:475`) — **unchanged** (still manual). The producer-pattern row (`:130-133`, `upsertAdminAlert(result.roleFlagsNotice)`) — **unchanged** (still emitted). The severity test (`:618-623`) — **unchanged** (still `info`).
- Audience-split spec doc (`docs/superpowers/specs/alerts/2026-07-04-alert-audience-split.md`): this historical doc's inline count (`42 = 16 doug + 26 health`, §3.2) is **already stale** vs the live meta-test (45) and is NOT CI-enforced. Do NOT reconcile the stale 42. Add a dated one-line amendment note at §3.2 that `ROLE_FLAGS_NOTICE` moved to `audience: "doug"` per this spec (superseding), pointing to this file. The **enforced numeric authority is the meta-test**, updated above.

### 2.4 Change-log coverage for role changes — IDENTIFIABLE per-member rows

**Write from the SHARED `runPhase2` point so BOTH apply paths are covered (Round 3, Codex F5).** The row is written by a shared helper `writeRoleChangeLogRows(port, previousCrewMembers, appliedCrewMembers, renames, heldNames)` invoked inside `runPhase2` at the point role changes are known (`phase2.ts:~547`, where `roleFlagChanges` is already computed, INSIDE the locked tx via `port`), **unconditional of `feedPolicy`** — NOT inside `writeAutoApplyChanges` (which is skipped on the staged path via `feedPolicy: { kind: "none" }`, `applyStaged.ts:1400`). `runPhase2` is the shared apply core for BOTH the cron auto-apply path AND the staged-apply path (`applyStagedCore` → `runPhase2`), so a single write there covers every path with no per-path branching.

**Source is `auto_apply` on every path — accurate, no CHECK migration.** A `role_flags` change is NEVER individually held: only MI-11 email changes gate; a role change always auto-applies via Phase 2 UPSERT, even when the *sync* was triggered by a staged approval of a co-occurring held item. So labeling its change-log row `source: 'auto_apply'` is correct on both paths (the role change WAS auto-applied), it needs no new `show_change_log.source` value (CHECK `20260608000001_show_change_log.sql:26` = `('auto_apply','mi11_approve','mi11_reject','undo')` is untouched), and it correctly surfaces in the auto-applied "Earlier" feed + acknowledge/badge (Doug SHOULD see an auto-applied role change there). This fully closes the staged non-LEAD gap — every role change, on every path, gets one identifiable row; §2.5 records why there is no residual.

**(Round 1, Codex F1.)** A generic notification-only `field_changed` row (`entityRef: null`, summary "A field changed on this sync", null images) is NOT auditable — an operator cannot tell *which* crew member changed or *what* the role went from/to. The change-log feed (`readShowChangeFeed.ts`) and `observe changes` (`queryChangeLog`) render the **`summary`** (feed selects `summary, entity_ref, change_kind, …` at `:225`; `queryChangeLog` deliberately never selects `before_image`/`after_image`), so identifiability MUST live in `entity_ref` + `summary`, not in images.

**Coverage principle (Round 4 comprehensive re-analysis, Codex F5 vector — 3rd surface: held folds).** The writer emits one identifiable row for **every `role_flags` delta between `previousCrewMembers` and `appliedCrewMembers` (rename-resolved), with NO ad-hoc exclusions** — it MIRRORS `leadRoleChangesForNotice` exactly (which itself does NOT skip held names). Anything the LEAD notice/event catches, the change-log row catches; the only difference is LEAD-vs-all scope. There is no held-skip, no path-skip, no invariant gate — the applied-list diff IS the complete, defensible rule:

```ts
// writeRoleChangeLogRows(port, previousCrewMembers, appliedCrewMembers, renames, occurredAt)
const prevByName = new Map(previousCrewMembers.map((m) => [m.name, m]));
const priorNameForAdded = new Map(renames.map((r) => [r.added, r.prior]));
for (const next of appliedCrewMembers) {
  const priorName = priorNameForAdded.get(next.name) ?? next.name;      // applied rename → map added→prior
  const prior = prevByName.get(priorName);
  if (!prior) continue;                                                 // genuinely new crew → crew_added (+ notice/event if LEAD)
  if (roleFlagsSetEqual(prior.role_flags, next.role_flags)) continue;   // no delta → no row
  // insert show_change_log: source 'auto_apply', change_kind 'field_changed',
  //   entity_ref = next.name, before_image = after_image = null,
  //   summary = `Crew member ${next.name} role assignment changed: ${fmt(prior.role_flags)} → ${fmt(next.role_flags)}`.
}
```

- **NO held-name skip (Round 4, Codex F5 3rd surface).** An MI-11 email hold pins the *identity* but applies non-identity fields — including `role_flags` — onto the RETAINED row (`applied` list, mi9 §3.1). `leadRoleChangesForNotice` deliberately does NOT skip held names so a **held-fold LEAD change** is caught; the change-log writer MUST match, or a **held-fold non-LEAD role change** commits with neither the (narrowed) bell alert NOR a change-log row — the exact gap. The retained held row appears under its name in `appliedCrewMembers`, so the plain name diff catches it (no rename map needed; a held rename SUPPRESSES the new name, retaining the old). The `sync_holds` entry is identity-focused and does NOT carry the prior/new role delta, so it is NOT a substitute.
- **Identity-row vs field-row asymmetry (intentional).** `writeAutoApplyChanges` skips held names for `crew_added/removed/renamed` (IDENTITY changes surfaced separately via `sync_holds`). The role-`field` row is NOT an identity change and is NOT surfaced by `sync_holds`, so it is emitted regardless of hold status. Different concerns, different rules — documented so a reviewer does not "restore" a held-skip by analogy to the identity rows.
- `fmt` renders the flag array as a readable token list (`A1` / `A1, BO` / `none` for `[]`). Role tokens are crew-domain data (like the crew name already in `crew_added` summaries), NOT error/invariant codes — invariant 5 holds.
- **SUBSUMES the MI-9 arm of the generic `field_changed` block in `writeAutoApplyChanges.ts`** (`:142-160`): remove `MI-9` from that arm (keep `MI-8`/`MI-8b`/`MI-8c`) so a LEAD change no longer emits the anonymous "A field changed" row — the shared writer emits its identifiable row instead PLUS the durable `LEAD_ROLE_APPLIED` event. No double-emit: role rows come ONLY from the shared writer. Because the writer runs unconditionally in `runPhase2` (not gated by `feedPolicy`), removing the MI-9 arm does not lose the LEAD change-log row on the staged path — it gains it.
- **Undo safety (verified):** `field_changed` is NOT in `UNDOABLE_CHANGE_KINDS` (`lib/sync/holds/types.ts:46` = `["crew_added","crew_removed","crew_renamed"]`) and `isCrewDomainChangeKind` (`readShowChangeFeed.ts:63-67`) is that same set, so a `field_changed` row with a non-null `entity_ref` is neither individually-undoable nor a supersession target. Setting `entity_ref` is purely a label.
- **Applied rename + role co-change → TWO rows:** `crew_renamed` (entity_ref = old name, from `writeAutoApplyChanges`, only for APPLIED — non-held — renames) AND the `field_changed` role row (entity_ref = new name). Genuinely-new crew emit no role row (a `crew_added`, not a *change*; a new LEAD member still covered by notice + event).
- **Multiple changed members → multiple rows** (one per member) — intentional; the feed paginates.
- `roleFlagsEqual` is private to `phase2.ts`; if the shared writer lives in its own module, add a small **local** `roleFlagsSetEqual` helper (avoid a cross-module cycle). Reuses the SAME applied lists the notice producer diffs (`snapshot.previousCrewMembers`, `applyOutcome.appliedCrewMembers`, `phase2.ts:502-506`); `renames` derive from `args.notableItems` (APPLIED renames only), already in `runPhase2` scope.
- **Emit-topology note:** the writer is a change-log WRITE inside the locked tx (like `writeAutoApplyChanges`), NOT a post-commit tail emit — no invariant-10 interaction. It rides `runPhase2`, the single shared point every apply path funnels through.

### 2.5 Staged-apply coverage — fully closed, no residual (Codex F5, Round 3)

Because the identifiable role-change row is written from the shared `runPhase2` point (§2.4), a role_flags change that rides a **staged apply** (same sync also carries an MI-11 hold Doug approves) gets the SAME identifiable `field_changed` change-log row (entity_ref = member, summary = prior → new flags, source `auto_apply` — accurate, since the role change auto-applied un-gated). So:

- **LEAD via staged apply:** identifiable change-log row (shared writer) + durable `LEAD_ROLE_APPLIED` app_event (staged tail, unchanged mi9 topology). Doubly covered.
- **Non-LEAD via staged apply:** identifiable change-log row (shared writer). No longer relies on the batch-level `sync_audit` — the per-member delta (who + prior/new flags) is a discrete row, satisfying §2.4's own auditability standard.

There is **no residual**: because the writer emits a row for **every** `previousCrewMembers` → `appliedCrewMembers` role_flags delta with no exclusions (§2.4 coverage principle), every applied role change — LEAD or non-LEAD, auto-apply or staged, **held-fold or clean** — has a discrete, identifiable per-member audit row. The audit set is exactly the set of role_flags deltas that actually committed. The `sync_audit` record remains as batch-level "Doug applied this" attribution but is no longer load-bearing for per-member role auditability. No `staged_apply` source, no CHECK migration.

### 2.3 Copy — keep TRUTHFUL for both LEAD and legacy non-LEAD rows (version-skew safe) — §12.4 lockstep

**(Round 2, Codex F3 — version skew.)** `ROLE_FLAGS_NOTICE` coalesces by `(show_id, code)`, so on deploy there can be **active, unresolved legacy rows whose `context.changes` are non-LEAD-only** (A1 → V1, +BO — created by the pre-this-change producer, which fired for any role delta). The catalog `dougFacing`/`helpfulContext` is **static copy applied to every unresolved row, legacy included** — it is NOT re-derived per row. Therefore the copy MUST NOT assert that a LEAD change happened, or every legacy non-LEAD row would render a lie ("A crew member gained or lost LEAD status") after deploy.

Keep the copy **conditional/truthful for both cases** — essentially the current shipped `dougFacing` (`catalog.ts:874-875`), which already reads correctly for a non-LEAD row. Only tighten `helpfulContext` to REMOVE the now-stale "department swap (A1 → V1) / additive flag like BO" enumeration WITHOUT asserting every row is LEAD:

- `dougFacing`: **unchanged** — "A crew member's role flags changed and were applied automatically — this entry is here for your audit. **If** the change included LEAD status (which grants admin/ops/financials access), confirm it was intentional." (Truthful for a legacy non-LEAD row AND a new LEAD-only row.)
- `helpfulContext`: drop the department-swap/BO examples; state that role_flags changes auto-apply (a sheet edit is deliberate), that a **LEAD** change grants admin/ops/financials access and is worth confirming, and that a durable audit record also exists. Do NOT claim the specific row IS a LEAD change.

**Legacy rows become dismissible (a strict improvement).** After reclassify, the stuck legacy health rows (LEAD or non-LEAD) become `doug`/dismissible, so Doug can finally clear the backlog — the exact "no way to clear" defect that motivated this spec. **No data migration is required** (considered and declined): the conditional copy is truthful for legacy rows, and they are now clearable by hand. An optional one-shot auto-resolve of legacy non-LEAD rows is deferrable to `BACKLOG.md` (nicety, not correctness).

Because `helpfulContext` is a §12.4-catalog row, the three-way lockstep applies (§4) for its edit. `dougFacing` is unchanged, so its §12.4 prose is untouched — but re-run `gen:spec-codes` regardless so parity is proven.

## 3. Non-goals

- **No producer routing change.** LEAD still auto-applies; `phase1.ts` untouched. mi9 do-not-relitigate #1 stands (a LEAD sheet edit is deliberate, bumps no auth floor).
- **No change to the durable `LEAD_ROLE_APPLIED` app_event** (`emitLeadRoleApplied`) — code, emission topology (both cron/manual `processOneFile` tail and staged-apply tail), and failure-visibility policy all unchanged. It was already LEAD-only.
- **No new advisory-lock surface, no schema migration, no new route, no new catalog code, no new admin-alert code.**
- **No broad `rowTone` refactor beyond the optional class fix (§5).**
- No change to non-LEAD role_flags application — non-LEAD changes still apply and update live `role_flags`; they stop generating a bell alert but gain a `field_changed` change-log row (§2.4, closing the pre-existing gap).

## 4. Canonical master-spec reconciliation + §12.4 lockstep

**(Round 2, Codex F6.)** Invariant 7 makes the master spec canonical — leaving its normative rows saying "every `role_flags` change emits `ROLE_FLAGS_NOTICE`" while the producer is narrowed to LEAD-only is a self-contradiction. The implementation commit MUST update EVERY normative master-spec/plan reference, not just the §12.4 copy row. Enumerated (all in `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` unless noted):

1. **§6.8 MI-9 row (`:1624`)** — currently "Every applied `role_flags` change emits an info-severity `ROLE_FLAGS_NOTICE` feed alert" + lists non-LEAD dept-swap examples as "auto-apply with the `ROLE_FLAGS_NOTICE` feed alert only." Rewrite: **only a LEAD-bit gain/loss emits the `ROLE_FLAGS_NOTICE` feed alert** (+ durable `LEAD_ROLE_APPLIED` event); non-LEAD `role_flags` deltas auto-apply and are recorded via an **identifiable `field_changed` change-log row** (auto-apply path) — NOT the bell alert. Keep the LEAD/non-LEAD examples but re-label the non-LEAD ones as "change-log row, no bell alert."
2. **§6.8 MI-10 row (`:1629`)** — currently "Non-LEAD `role_flags` deltas … emit the same info-severity `ROLE_FLAGS_NOTICE`." Rewrite to the change-log-row treatment for non-LEAD; keep LEAD → alert + event.
3. **§6.8.2 auth-floor/action table (`:1713`)** — same non-LEAD sentence ("emit the same `ROLE_FLAGS_NOTICE`"); rewrite identically.
4. **§12.4 `ROLE_FLAGS_NOTICE` row (`:2863`)** — currently "any auto-applied `role_flags` change — department / scope / additive flag change AND … a LEAD-bit gain/loss." Narrow the trigger prose to **LEAD-bit gain/loss (+ new crew with LEAD)** only; note non-LEAD → identifiable change-log row. Keep `dougFacing` truthful/conditional per §2.3.
5. **Help copy (`:3157`)** — the `ROLE_FLAGS_NOTICE:` help string enumerates "a department swap (A1 → V1), an additive flag like BO, or a LEAD-status gain/loss"; de-example to LEAD framing (mirrors the `helpfulContext` change, §2.3) without asserting every row is LEAD.
6. **`00-overview.md` amendment 8 (`:163,:170`)** — "All `role_flags` deltas auto-apply via Phase 2 UPSERT and emit a `ROLE_FLAGS_NOTICE` entry to `admin_alerts`" → the alert is now LEAD-only; non-LEAD deltas auto-apply and land an identifiable change-log row. Cross-reference this spec as the superseding decision (post-#439 owner re-decision).

**§12.4 three-way lockstep** (AGENTS.md §12.4 rule): the §12.4 row edit (item 4) + `helpfulContext` (§2.3) land together with (a) master spec §12.4 prose, (b) `pnpm gen:spec-codes` → regen `lib/messages/__generated__/spec-codes.ts`, (c) the `lib/messages/catalog.ts` row. Enforced by `tests/messages/codes.test.ts` (x1 parity) + `tests/cross-cutting/codes.test.ts`. `audience`/`healthWeight`/`dougSummary` are NOT §12.4 prose fields (catalog-only metadata governed by the audience meta-test) but land in the same commit for atomicity. **NEVER run prettier on the master spec** (mangles §12.4 → x1 fails). Numeric-sweep the reconciled rows so no stale "every role_flags change" phrasing survives.

## 5. Optional — fix the `rowTone` class bug

The `isHealth → "critical"` short-circuit (`BellPanel.tsx:129`) is wrong for **every** `notice`-weight health code, not just this one (they all render red despite the rollup treating them amber). This becomes moot for `ROLE_FLAGS_NOTICE` after reclassify but stays latent for the other 8 notice-weight health codes. Fix in the same pass (2 lines, principled):

```ts
function rowTone(entry: BellEntry): RowTone {
  if (entry.isHealth) return DEGRADED_HEALTH_CODES.includes(entry.code) ? "critical" : "notice";
  const severity = isMessageCode(entry.code) ? messageFor(entry.code).severity : undefined;
  return severity === "info" ? "info" : "notice";
}
```

`DEGRADED_HEALTH_CODES` / `NOTICE_HEALTH_CODES` already exist (`lib/adminAlerts/audience.ts:19-26`). This is a UI-code change (`components/**`) → **invariant 8 (impeccable dual-gate) applies**. If the impeccable overhead outweighs the value for this pass, defer via a `DEFERRED.md` / `BACKLOG.md` row instead — decide at plan time. Ship-default: include it (correct + tiny), gate it.

## 6. Guard conditions

- `prior_flags`/`new_flags` are always arrays (existing invariant, `phase2.ts` guards). The new LEAD-toggle guard reads `hasLead(...)` on both — a pure array membership check, safe on `[]`.
- Identical applied role set → `roleFlagsEqual` skip (`:287`) stays first, so no-op changes still emit nothing.
- Held-identity crew (MI-11 rename/fold) whose role_flags applied to the retained row: the applied-list diff (`applyOutcome.appliedCrewMembers`, `:549`) still catches a **LEAD** change on the retained row; a folded **non-LEAD** change now correctly emits nothing. F2 identity-link rename mapping (`:263-265`) unchanged.
- New crew with LEAD → still emits (prior `[]` → LEAD); new crew without LEAD → still no notice (covered by `crew_added`).
- Reclassify guard: `severity: "info"` MUST remain to keep the code in `DOUG_EXCLUDED_CODES` — otherwise a `doug` + non-info code would re-enter the amber banner. Pinned by the unchanged severity test (`_metaAdminAlertCatalog.test.ts:618-623`).

## 7. Tests (TDD)

- **`tests/sync/phase2.test.ts`** (existing `roleFlagsNotice` block): ADD a **non-LEAD** case (`["A1"] → ["V1"]`, and an additive `["A1"] → ["A1","BO"]`) asserting **NO** `roleFlagsNotice` is produced. KEEP/confirm the LEAD-gain (`["A1"] → ["A1","LEAD"]`) and LEAD-loss (`["LEAD","A1"] → ["A1"]`) cases assert the notice IS produced. Assert identical set → no notice. Failure mode caught: the new LEAD-toggle guard also suppressing a real LEAD change, or failing to suppress a non-LEAD swap.
- **Held-fold regression:** a crew member under an open MI-11 rename who **loses** LEAD via fold → notice fires (retained name, prior/new flags); a member whose fold changes only a **non-LEAD** flag → no notice, but the committed `role_flags` still reflects it. Failure mode caught: the applied-list diff regressing, or the LEAD guard mis-scoping folds.
- **New-crew:** new crew with LEAD → notice (`prior_flags: []`); new crew without LEAD → no notice. (Unchanged behavior; pin it.)
- **Identifiable change-log coverage (§2.4, Codex F1):** an existing crew member with a **non-LEAD** applied role_flags delta (A1 → V1) → **no** `ROLE_FLAGS_NOTICE` alert AND **no** `LEAD_ROLE_APPLIED` event, BUT a `field_changed` `show_change_log` row IS written whose **`entity_ref` equals the crew name** and whose **`summary` names the member and contains both the prior and new flag tokens** (assert the actual member + `A1`/`V1` substrings, derived from the fixture — anti-tautology: not just "a row exists"). A **LEAD** change → exactly ONE identifiable `field_changed` row (entity_ref = member, summary shows `→ …, LEAD`) AND the durable `LEAD_ROLE_APPLIED` event; assert the anonymous "A field changed on this sync" row is NOT emitted for the LEAD change (MI-9 arm removed). Two members changing in one sync → two rows, each naming its member. Failure mode caught: unidentifiable audit rows or MI-9 double-emit.
- **Held-fold role change (§2.4, Codex F5 3rd surface) — load-bearing:** a member under an open MI-11 email hold whose `role_flags` fold onto the RETAINED row (identity pinned, non-identity fields applied) → an identifiable `field_changed` change-log row IS written (entity_ref = retained name, summary carries prior → new flags), for BOTH a **non-LEAD** held fold (row present, NO `ROLE_FLAGS_NOTICE`, NO `LEAD_ROLE_APPLIED`) and a **LEAD** held fold (row present AND `LEAD_ROLE_APPLIED`). Assert the writer does NOT skip held names. Failure mode caught: a held fold committing a role change with no audit row (the held-skip bug).
- **Rename + role change co-occurrence (§2.4, Codex F4):** a member with an APPLIED (non-held) rename (old → new) who also has a **non-LEAD** role_flags delta → a `crew_renamed` row (entity_ref = old name) AND an identifiable `field_changed` role row (entity_ref = **new** name, prior resolved through the rename map). A member renamed AND **LEAD-toggled** → the same two rows PLUS `LEAD_ROLE_APPLIED`. Anti-tautology: assert the role row's entity_ref is the successor name and the summary carries prior/new tokens from the fixture. Failure mode caught: a rename hiding a same-sync role change from the audit.
- **Legacy-row copy truthfulness (§2.3, Codex F3):** render `ROLE_FLAGS_NOTICE` `dougFacing` against a NON-LEAD `context.changes` (A1 → V1) and assert the copy does NOT assert a LEAD change occurred (no unconditional "gained or lost LEAD"); the conditional "if the change included LEAD" phrasing stays truthful. Failure mode caught: a copy tightening that lies on legacy/coalesced non-LEAD rows.
- **Coverage-parity structural pin (§2.4 principle, same-vector structural defense):** a property-style test over several `(previousCrewMembers, appliedCrewMembers)` fixtures asserting the SET of member-names that get a `field_changed` role change-log row equals the SET of names whose `role_flags` actually changed between the two lists (rename-resolved) — i.e., identical to what an UNFILTERED `leadRoleChangesForNotice` (LEAD filter removed) would flag. This pins "no ad-hoc exclusions" (no held-skip, no path-skip, no invariant gate) so a future edit re-introducing an exclusion fails by default. Include a held-fold and a rename fixture in the set. Failure mode caught: any narrowing of the change-log coverage below the actual applied-delta set.
- **Durable event unchanged:** a LEAD change still emits `LEAD_ROLE_APPLIED` (assert code + crew_name + prior/new flags + direction); a non-LEAD change emits **no** `LEAD_ROLE_APPLIED` (already true — pin it).
- **Staged-apply coverage (§2.4/§2.5, Codex F5) — the load-bearing test:** a role change applied via the **staged-apply** path (a sync carrying an MI-11 hold Doug approves, PLUS a role_flags change) writes an identifiable `field_changed` `show_change_log` row (entity_ref = member, summary carries prior → new flags, source `auto_apply`). Cover BOTH a **non-LEAD** staged role change (row present; NO `ROLE_FLAGS_NOTICE` alert; NO `LEAD_ROLE_APPLIED`) and a **LEAD** staged role change (row present AND `LEAD_ROLE_APPLIED` emitted). Anti-tautology: assert the member name + both flag tokens in the row, derived from the fixture. Failure mode caught: the change-log write living in `writeAutoApplyChanges` (skipped on staged via `feedPolicy:none`) instead of the shared `runPhase2` point, leaving staged role changes with no discrete audit row.
- **Resolve route (reclassify):** a `ROLE_FLAGS_NOTICE` `admin_alerts` row → the global resolve route returns **200** (resolved), NOT 403 `ALERT_HEALTH_RESOLVE_FORBIDDEN`. A still-health code (e.g. `SYNC_STALLED`) still 403s. Failure mode caught: reclassify not removing it from `HEALTH_CODES`.
- **Audience contract:** `_metaAlertAudienceContract.test.ts` — ROLE_FLAGS_NOTICE now in DOUG, counts `20 doug + 25 health; 9 notice`, and it carries no `healthWeight`/`dougSummary`. (These assertions are the reclassify's fail-by-default guard.)
- **Tone (this code):** a `ROLE_FLAGS_NOTICE` bell row renders `data-tone="info"` (info/accent, orange) — NOT `"critical"` (red). Assert on `bell-sev-*` `data-tone`. This is the concrete fix for the owner's "not red" requirement.
- **rowTone class fix (if §5 included):** a notice-weight health code renders `data-tone="notice"` (amber/warn), a degraded health code renders `data-tone="critical"` (red), an info non-health code renders `data-tone="info"` (accent). Real-component/jsdom render assertion on `bell-sev-*` `data-tone`.
- **x1 parity + `_metaAdminAlertCatalog`:** regen `gen:spec-codes`, confirm catalog ↔ §12.4 parity after the copy tighten; `_metaAdminAlertCatalog` severity/class rows still green.
- Grep tests asserting a non-LEAD role change emits `ROLE_FLAGS_NOTICE` (pre-#439 M6 behavior) and flip them to assert no-notice.
- Grep `writeAutoApplyChanges` tests (and any phase2/apply DB tests) asserting an MI-9 LEAD change produces the anonymous `field_changed` "A field changed on this sync" row; update them to assert the new identifiable per-member row (entity_ref = member, summary names member + flags) and the absence of the anonymous row for a role-only change. MI-8/8b/8c financial-change tests are unaffected (that arm is unchanged).

## 8. Do-not-relitigate (reviewer preempts)

1. **This supersedes `mi9-lead-autoapply-fyi` §7.2** — the owner ratified `audience: "health"` there for minimal fanout; seeing it live, the owner (2026-07-17) re-decided it is a Doug operator nudge → `audience: "doug"`. This is a new owner decision, not a review relitigation.
2. **Narrowing to LEAD-only is intentional, not a regression** — non-LEAD role changes are tile-visibility-only (zero security value). They remain auditable via an **identifiable** `field_changed` change-log row that names the member + prior/new flags (§2.4, a NET-NEW improvement — today non-LEAD-only changes get NO change-log row because MI-9 is LEAD-specific) + live `role_flags`. The bell is an operator attention surface, not the audit of record. (Do not "restore" the non-LEAD bell alert — its removal is the owner's explicit intent.)
2a. **Change-log rows for role changes are now identifiable (entity_ref + summary), images stay null** — this is deliberate: `field_changed` is not undoable and `queryChangeLog` never selects images, so identity lives in `entity_ref`/`summary`. Do not add structured before/after images (would imply undoability that the change-kind doesn't have).
2b. **Tone is info/accent (orange), not warn/amber** — pinned in §2.2; forcing warn/amber on an `info` code would need a per-code `rowTone` hack. The owner's requirement was "not red"; info/accent satisfies it. Do not relitigate to amber.
2c. **Copy stays conditional ("if LEAD…"), NOT LEAD-assertive** — deliberate version-skew safety (§2.3): legacy coalesced non-LEAD rows share the static catalog copy, so asserting LEAD would lie on them. No data migration; legacy rows are now dismissible. Do not relitigate to LEAD-assertive copy or demand a migration.
2d. **Rename + role co-change emits a role row keyed to the successor name** (§2.4) — the loop resolves the prior through the rename map rather than skipping renamed members, so no same-sync role change is hidden by a rename. Do not relitigate the two-row (crew_renamed + field_changed) outcome.
2e. **The identifiable change-log row covers EVERY applied role delta — both paths, held or clean — written from the shared `runPhase2` point** (§2.4, §2.5). Role_flags changes auto-apply un-gated on every path, so the row is `source: 'auto_apply'` on both (accurate, no CHECK migration). The writer diffs `previousCrewMembers` → `appliedCrewMembers` with NO exclusions, mirroring `leadRoleChangesForNotice` — so held MI-11 folds and staged applies are all covered. Do NOT relitigate to a `staged_apply` source / CHECK migration / "sync_audit is sufficient", and do NOT re-add a held-name skip (the identity-row skip in `writeAutoApplyChanges` is a DIFFERENT concern — §2.4).
2f. **Master-spec normative rows are reconciled in the impl commit** (§4) — MI-9/MI-10/§6.8.2/§12.4/help/amendment-8 all move to "LEAD → alert+event, non-LEAD → change-log row." Do not treat the narrowed producer as contradicting canon; the canon is updated in lockstep.
3. **The audit of record is untouched** — `LEAD_ROLE_APPLIED` (durable, failure-visible, non-coalescing) is unchanged; a mistaken LEAD grant is always recoverable via `observe events`. The `ROLE_FLAGS_NOTICE` alert remains a best-effort operator heads-up.
4. **`severity: "info"` stays** — it is load-bearing for banner exclusion; reclassifying audience without keeping info would re-spam the amber banner. Pinned by the severity meta-test.
6. **Digest + bell badge are unaffected** — the notify digest uses a fixed 3-code Doug allowlist (`DRIVE_FETCH_FAILED`/`PARSE_ERROR_LAST_GOOD`/`SHEET_UNAVAILABLE`, `lib/notify/runNotify.ts`); `ROLE_FLAGS_NOTICE` was never in it and is not added. The bell badge counts unread active alerts regardless of audience — it already counted this code; reclassify only makes it dismissible. The amber banner/count still excludes it via the `info`-severity arm of `DOUG_EXCLUDED_CODES`.
7. **The stale `42` in the audience-split doc is out of scope** — that doc drifted before this change (live is 45); the enforced authority is `_metaAlertAudienceContract`. This spec updates the test, not the historical doc's stale count.
