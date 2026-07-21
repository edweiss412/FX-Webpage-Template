# Alert popover context copy (spec B) — design

**Date:** 2026-07-20
**Status:** Draft for autonomous ship. Supersedes nothing; extends the compact-alert help affordance (`components/admin/compactAlertHelp.tsx`) with authored copy.
**Depends on:** the `helpfulContext` field (`lib/messages/catalog.ts:50`) and the compact-card popover (`components/admin/compactAlertHelp.tsx:64-82`), both already shipped. No new mechanism, component, or render-path change.

<!-- spec-lint: not-ui — copy + meta-test only; no layout, component, token, or dimensional change -->

---

## 1. Summary

The compact alert card renders a quiet "?" help popover whose body is the catalog entry's `helpfulContext`, rendered through `renderEmphasis` (`components/admin/compactAlertHelp.tsx:80`). When `helpfulContext` is `null` but a `helpHref` is present and passes the Learn-more route gate, the popover falls back to a fixed lead-in string, `HELP_ONLY_LEARN_MORE_LEAD_IN = "More about this alert in the help pages."` (`components/admin/compactAlertHelp.tsx:46`, selected at `components/admin/compactAlertHelp.tsx:80`).

Exactly **45 catalog codes** carry a non-null `helpHref` with a null `helpfulContext`, so their popover shows only that useless lead-in. This spec authors a `helpfulContext` string for all 45, and adds a fails-by-default meta-test so a future code with a help link but no context fails CI rather than silently regressing to the lead-in.

Split: 20 codes are Doug-audience (`audience: "doug"` — show modal / notification bell), 25 are developer-audience (`audience: "health"` — developer telemetry panel).

## 1.1 Resolved scope — do not relitigate

Each decision below is ratified. Verify the citation; do not re-derive.

- **`longExplanation` is NOT touched.** It is the `/help/errors` destination behind the "Learn more →" link (`app/help/errors/page.tsx:93`). Slimming it would make the Learn-more link redundant with the popover. Only `helpfulContext` (the popover field) is authored. (User decision, 2026-07-20.)
- **All 45 are in scope, in two registers.** Doug's 20: non-technical, "sheet in / UI out", must carry the resolution lever (fix at source / judge intentional / escalate). Developer's 25: technical, names the subsystem + first triage move. (User decision — "All 45".)
- **The 13 `dougFacingShowScoped` show-modal BODY rewrites (`docs/superpowers/plans/2026-07-20-show-scoped-alert-copy/specB-input.md`) are OUT of scope.** Different field (`dougFacingShowScoped`, not `helpfulContext`), different surface (alert body, not popover). They are a separate future spec. (User decision — "Keep separate".)
- **The popover must not restate the alert body it sits under.** The card already renders `dougFacing`; the popover adds only what the body does not say. Every string was authored and run through `impeccable clarify` against this rule. (Design decision, 2026-07-20.)
- **The exemption ledger `POPOVER_CONTEXT_EXEMPT` ships EMPTY.** All 45 get real copy, so no code needs an exemption at ship time. The ledger exists only so a legitimately context-free popover (Learn-more-only, a real design state per `buildHelpPopoverBody`) has a declared escape hatch later. The gate is therefore pure-additive.
- **No UI code changes.** `lib/messages/catalog.ts` is `lib/`, not `app/`/`components/`; no component, token, `DESIGN.md`, or `tailwind` edit. The invariant-8 impeccable dual-gate is not triggered (clarify was run on the copy regardless).
- **No DB, no migrations, no advisory-lock paths.** Copy + one static meta-test only.

## 2. Problem and mechanism

`buildHelpPopoverBody` (`components/admin/compactAlertHelp.tsx:64-82`) selects the popover body:

```
const body = context ? renderEmphasis(context) : HELP_ONLY_LEARN_MORE_LEAD_IN;
```

where `context = nonEmpty(input.helpfulContext)`. So an entry with `helpfulContext: null` and a gate-passing `helpHref` renders the lead-in. The lead-in is a legitimate state for an entry that intentionally has only a Learn-more link, but for these 45 it is an authoring gap, not a design intent.

`helpHref != null` is the gate's static **contract** signal, not a claim of exact runtime reachability. It over-approximates: `buildHelpPopoverBody` renders the trigger only when it returns non-null, which for a null-context entry additionally requires the per-route Learn-more gate to pass (`shouldEmitLearnMore`, `components/admin/compactAlertHelp.tsx:71-72`), and that gate is a per-render property with no catalog-layer equivalent. The over-approximation is **intentional**: a code that carries a `/help/errors` link but no glanceable popover copy is a defect regardless of which routes currently render it, so the contract is "carry a help link ⟹ carry popover copy (or a declared exemption)." `catalogDocsValidator.ts:22` guarantees a `helpHref != null` entry is a predicate entry (`title` + `longExplanation` also non-null), so the universe is well-formed. No audience or route reasoning is needed at the catalog layer.

`helpfulContext` is already classified `"rendered-prose"` in the copy-hygiene meta-test (`tests/messages/_metaCatalogCopyHygiene.test.ts:202`), so the em-dash ban, curly-quote ban, and markdown-asterisk-leak checks already apply to the new strings. No new field classification.

## 3. Authored copy

Visual companion (before/after, in the real compact-card + popover chrome): `docs/superpowers/specs/2026-07-20-alert-popover-context-copy-now-vs-proposed.html`. Approved by the owner 2026-07-20.

### 3.1 Register rules

**Doug's 20** (`audience: "doug"`):
- 1–2 sentences, ≤240 characters (rendered length; all ship ≤226).
- Frames what Doug sees + the resolution lever: fix at source (sheet / Drive / role mapping), judge-intentional, or escalate to the developer.
- Does not name parser/app internals (no "re-stage", "advances the version", "reviewed parse", "previously approved bytes", "re-fetch"). It MAY name a UI surface Doug already sees and that the companion `dougFacing` body already references — specifically the per-show **parse panel** (`components/admin/ParsePanel.tsx`; `PARSE_ERROR_LAST_GOOD`/`RESYNC_QUALITY_REGRESSED` bodies already point Doug there) — because that is an actionable place to go, not exposed machinery.
- Does not restate the visible `dougFacing` body.

**Developer's 25** (`audience: "health"`):
- Same length ceiling and hygiene rules.
- Technical register: may name the subsystem (advisory lock, snapshot prefix, lease window). States meaning + first triage move, not a full runbook (that is `longExplanation`).

**Both:** no em-dash / en-dash, straight apostrophes and quotes only, no markdown asterisks (emphasis is via `renderEmphasis`, but these strings use none). Enforced by `_metaCatalogCopyHygiene`.

### 3.2 Doug's 20

| # | Code | `helpfulContext` (authored) |
| --- | --- | --- |
| 1 | `AMBIGUOUS_EMAIL_BINDING` | Usually a recent typo or paste dropped the same address into two email cells. Once you correct it, the next sync clears this on its own; you can also mark it resolved right away. |
| 2 | `DRIVE_FETCH_FAILED` | Crew keep seeing the last synced version while this retries on its own. If it lasts over an hour, confirm the folder is still shared with FXAV and that the sheet hasn't been moved out of it. |
| 3 | `SHEET_UNAVAILABLE` | Until the sheet is back in the watched folder, crew keep the last good version on file. Move or re-share it into the folder and the next sync brings the show back automatically. |
| 4 | `PARSE_ERROR_LAST_GOOD` | The parse panel shows the exact line that failed to read. Fix it in the sheet and the next sync replaces the older version crew currently see; nothing else to do. |
| 5 | `RESYNC_SHRINK_HELD` | The update was held so a bad edit can't silently wipe crew or a section. If the drop was intentional, re-sync to apply it; if not, fix the sheet and a clean sync clears this. |
| 6 | `RESYNC_QUALITY_REGRESSED` | Fewer fields or sections came through than last time, so parts of the page thinned out even though the sync went through. The parse panel flags what dropped; fix the sheet and a clean sync restores it. |
| 7 | `WATCH_CHANNEL_ORPHANED` | At worst, edits take a few minutes to appear instead of instantly, since the scheduled sync still runs. It reconnects on its own each hour, or use Retry now. Only worth attention if it keeps failing. |
| 8 | `REEL_DRIFTED` | The video changed after you last reviewed the show, so crew see the text status without it. Any save to the sheet picks up the current reel on the next sync. |
| 9 | `OPENING_REEL_NOT_VIDEO` | A Doc, image, or PDF can't play inline, so crew see the text status only. Point the opening-reel cell at an actual video file to turn playback back on. |
| 10 | `OPENING_REEL_PERMISSION_DENIED` | The video's sharing changed or it moved somewhere FXAV can't read, so crew see the text status only. Re-share it with FXAV, or swap in a video you do share, to restore playback. |
| 11 | `EMBEDDED_RECOVERY_REQUIRES_RESTAGE` | Crew see a placeholder because this diagram can't be recovered on its own. Save the sheet (any edit counts) and the next sync restores the image. |
| 12 | `ASSET_RECOVERY_BYTES_EXCEEDED` | The cap keeps one big gallery from blocking other shows' syncs. Crew see placeholders for the missing diagrams; trim the set under the limit, or ask the developer to raise the ceiling if this show genuinely needs it. |
| 13 | `ROLE_FLAGS_NOTICE` | This fires only for LEAD or FINANCIALS, the roles that unlock internal financials and admin access, and every change is logged. Nothing to do unless it was a mistake; if so, correct it in the sheet or role mapping. |
| 14 | `SHOW_FIRST_PUBLISHED` | It auto-published because the sheet came through clean. If it's the wrong sheet or bad timing, flip Published off on the show's page; crew lose access until you turn it back on, and the same link works again when you do. |
| 15 | `SHOW_UNPUBLISHED` | Nothing was deleted and the sheet keeps syncing in the background, so republishing from the show's page brings the same link back exactly as it was. |
| 16 | `LIVE_ROW_CONFLICT` | Setup stepped aside so it wouldn't clobber the live version already in flight. Apply or Discard that row from the dashboard, then re-run setup if you still need to. |
| 17 | `ONBOARDING_SHEET_UNREADABLE` | These files never reach any crew page, so nothing is exposed. The usual cause is a missing or renamed section header; fix or remove them in Drive and the next sync clears this, or dismiss it now if they're meant to be skipped. |
| 18 | `SYNC_STALLED` | Already-published pages stay up; only new edits are waiting. It usually recovers on its own, but if it sticks the Drive connection may have lapsed, so re-run setup or check the connection. |
| 19 | `EMBEDDED_ASSET_DRIFTED` | Crew keep the last good image and see a placeholder only for the one that changed. Save the sheet again to pick up the new version. |
| 20 | `PICKER_EPOCH_RESET` | The share link itself didn't change, so crew just pick their name again on the next visit, and any open tabs re-prompt on refresh. Nothing to fix; this is a record of the reset. |

### 3.3 Developer's 25

| # | Code | `helpfulContext` (authored) |
| --- | --- | --- |
| 1 | `WIZARD_SESSION_SUPERSEDED_RACE` | Two wizard tabs for the same sheet overlapped; the newer one won and the older tab's action was cancelled before it could touch state. Its leftovers are inert and auto-cleaned. Informational only. |
| 2 | `WEBHOOK_TOKEN_INVALID` | The bad token usually means a stale Drive subscription is still firing, occasionally a spoof attempt. The developer is notified and rotates it if needed; no admin action. |
| 3 | `ASSET_RECOVERY_REVISION_DRIFT` | Recovery verified bytes against an older snapshot but a newer Apply landed first, so it aborted rather than attach stale assets to the current revision. The next run retries against the latest automatically. |
| 4 | `ASSET_RECOVERY_DRIFT_COOLDOWN` | The prior attempt raced an Apply, so recovery backs off for this snapshot to bound retry storms while the show keeps changing. It resumes on its own after the cooldown. |
| 5 | `PENDING_SNAPSHOT_PROMOTE_STUCK` | It's stuck in the non-reclaimable promote-started state, so cleanup can't reclaim the prefix. The snapshot-promote repair tool reconciles the temp and canonical prefixes to finish it. |
| 6 | `PENDING_SNAPSHOT_ROLLBACK_STUCK` | Assets are split across the temp and canonical prefixes after a half-finished rollback. The snapshot-rollback repair tool reconciles both and completes it so cleanup can continue. |
| 7 | `BRANCH_PROTECTION_DRIFT` | Something drifted: a required check, a review requirement, admin enforcement, or a push or deletion restriction. Restore the settings so no PR can merge without the full audit suite. |
| 8 | `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` | Without auth the monitor can't prove the merge gate is still enforced, so drift would go unseen. Rotate the GitHub App token or fallback PAT within 24 hours and confirm the job succeeds. |
| 9 | `EMAIL_DELIVERY_FAILED` | Retries continue on their own. A persistent failure usually points at the provider API key or the verified sending domain in settings. |
| 10 | `EMAIL_NOT_CONFIGURED` | Email needs three settings before anything sends: provider API key, verified sending address, and the public site URL for links. Dashboard alerts and each show's Publish toggle keep working without it. |
| 11 | `TILE_SERVER_RENDER_FAILED` | Only that one section crashed; the rest of the page rendered. It keeps retrying, so a refresh usually clears it. If it recurs, use Report so the developer gets the stack. |
| 12 | `TILE_PROJECTION_FETCH_FAILED` | The failed data sources are listed in the alert detail; their sections fell back while the rest loaded. A refresh usually clears it; use Report if it keeps happening. |
| 13 | `REPORT_ORPHANED_LOST_LEASE` | Two retries of the same report both created a GitHub issue in a lease race, so the duplicate was auto-closed. Click through to confirm; if it recurs, the lease window needs widening. |
| 14 | `GITHUB_BOT_LOGIN_MISSING` | Recovery needs the bot's GitHub username to find issues from earlier attempts. Set GITHUB_BOT_LOGIN to that username and redeploy to restore full recovery coverage. |
| 15 | `REPORT_LEASE_THRASHING` | Too many retries fire inside the lease window, usually because it's shorter than GitHub's current response time. Widening the lease window settles it. |
| 16 | `PENDING_SNAPSHOT_DELETE_STUCK` | A row marked for deletion never had its storage prefix reclaimed. Crew pages are unaffected; this is storage hygiene only. Reconcile and reclaim the prefix to clear it. |
| 17 | `REPORT_DUPLICATE_LIVE_MATCHES` | More than one live issue carries the same report marker, so recovery fails closed instead of guessing a winner. Review the duplicates and close all but one to resume it. |
| 18 | `REPORT_LOOKUP_INCONCLUSIVE` | Recovery couldn't reliably list recent issues for this report, so it refused to risk a duplicate. Usually a transient GitHub API blip that clears on the next retry. |
| 19 | `REPORT_OPEN_ORPHAN_LABEL` | Orphan cleanup only labels closed 'not planned' issues, so an open one means it was reopened or GitHub returned an odd state. Re-close the issue or remove the label. |
| 20 | `STALE_ORPHAN_REPORT` | The reservation aged past the 24-hour recovery horizon with an expired lease and was reaped before an issue existed. Repeats would point at a stuck submit path worth a look. |
| 21 | `PICKER_SELECTION_RACE` | A browser cleaned up a picker cookie whose epoch or crew member no longer matches the show, typically after a reset or roster change. Compare-and-delete touched only that stale entry. No action. |
| 22 | `PICKER_BOOTSTRAP_RPC_FAILED` | The route had a valid Google session but the identity claim errored, so it returned a clean retry page instead of a redirect loop. Repeats on one show may point at a claim-path problem. |
| 23 | `PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED` | It failed before any signed-in identity existed, so the alert carries no email or share token by design. The visitor saw a retry page and can open the link again. |
| 24 | `OAUTH_IDENTITY_CLAIMED` | From now on that row skips the picker and goes straight through Google sign-in. Routine success record; no action needed. |
| 25 | `CALLBACK_CLAIM_THREW` | The callback never mints picker cookies, so nothing is left half-claimed. Picker bootstrap retries the claim automatically on the visitor's next show visit. |

## 4. The fails-by-default reachability gate

<!-- spec-lint: ignore — new files created by this spec; not yet tracked -->
New meta-test: `tests/messages/_metaPopoverContextCoverage.test.ts`. New ledger: `tests/messages/popoverContextExemptions.ts` exporting `POPOVER_CONTEXT_EXEMPT: ReadonlyArray<{ code: string; reason: string }>` (ships `[]`).

Four assertions, all walking the LIVE catalog so a new code fails by default:

1. **Completeness.** For every `MessageCatalogEntry` with `helpHref != null`: `helpfulContext != null`, OR its `code` appears in `POPOVER_CONTEXT_EXEMPT`. A new help-linked code with neither fails here.
2. **Per-string validity.** For every entry that satisfies rule 1 via `helpfulContext` (not via exemption): the string is **normalized the same way production does** — trimmed (mirroring `nonEmpty`, `components/admin/compactAlertHelp.tsx:54-58`) and rendered through `renderEmphasis` under a worst-case empty-parameter fixture — and the resulting text is non-empty AND is not equal to `HELP_ONLY_LEARN_MORE_LEAD_IN`. Normalizing before comparison is load-bearing: a whitespace-only string, or the lead-in padded with whitespace, would pass a naive raw-string check yet trims in production to an absent context or the exact fallback. Catches an author pasting (or padding) the lead-in to pass rule 1.
3. **Exemption and authored copy are mutually exclusive.** An exempt `code` MUST have `helpfulContext == null`. A code cannot be both exempt and authored. Without this, a stale exemption outlives authored copy, and an exempt entry carrying whitespace or the lead-in could bypass rule 2 (rule 2 skips exempt codes). Enforcing exclusivity keeps "exempt" meaning exactly "intentionally context-free."
4. **Ledger is closed and non-vacuous.** Every `code` in `POPOVER_CONTEXT_EXEMPT` exists in the catalog, has `helpHref != null` (else the row is vacuous — the code never carries a help link, so it needs no exemption), and carries a non-empty `reason`. No duplicate rows.

The gate imports `HELP_ONLY_LEARN_MORE_LEAD_IN` and `renderEmphasis` from their shipped modules (no copy of the constant). It is structurally a sibling of `_metaShowScopedTemplates.test.ts` (`tests/messages/_metaShowScopedTemplates.test.ts:45-118`), whose defense-2 "valid as RENDERED output" and defense-3 "key set EQUALS declaring set" patterns this mirrors.

## 5. Guard conditions and edge cases

- **Empty-string or padded-lead-in `helpfulContext`.** `nonEmpty` (`components/admin/compactAlertHelp.tsx:54-58`) trims and treats `""`/whitespace as absent, so in production an all-whitespace string renders the lead-in, and `"  <lead-in>  "` renders the exact fallback. Rule 2 mirrors that normalization (trim before render/compare), so a whitespace-only string fails the non-empty check and a whitespace-padded lead-in fails the not-equal check. Authored strings are all substantive.
- **Worst-case empty params.** Popover strings contain NO `<placeholder>` tokens (unlike `dougFacing`), so `renderEmphasis` output does not depend on interpolation params; the empty-param fixture is the true worst case.
- **A code loses its `helpHref` later.** It drops out of the gate universe automatically (universe is computed from the live catalog), and its `helpfulContext`, if any, becomes inert but harmless. No stale-gate failure.
- **A new code adds `helpHref` + `helpfulContext` together.** Passes rules 1 and 2 with no ledger touch. This is the intended happy path.
- **`longExplanation` predicate coupling.** Unaffected: `lib/messages/catalogDocsValidator.ts:22` never references `helpfulContext`; adding it to an already-predicate entry keeps the entry predicate.

## 6. Testing

- **Copy correctness** — extend the existing catalog copy test surface: assert each of the 45 codes now has a non-null `helpfulContext` equal to the frozen authored string (frozen-literal oracle: the catalog is the subject under test, so the expected strings are hardcoded, inverting the usual derive-never-hardcode rule — same posture as `_metaShowScopedTemplates` `PAIRED`).
- **Gate meta-test** — `_metaPopoverContextCoverage` (§4), verified fails-by-default by temporarily nulling one code's `helpfulContext` and one string set to the lead-in during development (proof recorded in the plan, not shipped).
- **Hygiene** — `_metaCatalogCopyHygiene` already covers em-dash / curly / asterisk on `helpfulContext`; the 45 additions are exercised by its existing walk.
- **No render/component test** — no component changed; `buildHelpPopoverBody`'s context-vs-lead-in branch is already covered by its existing tests.

## 7. Out of scope

- `longExplanation` edits (§1.1).
- The 13 `dougFacingShowScoped` body rewrites (§1.1) — separate spec.
- Any component, token, route, or `/help/errors` page change.
- The 25 health codes' telemetry-panel styling (copy only).
- The stale committed `.claude/ship-state.json` on `origin/main` (pre-existing pollution from PR #529; out of scope for this feature).

## 7.5 §12.4 lockstep (mandatory — one commit)

`helpfulContext` is under the §12.4 catalog-parity contract: the AC-X.1 gate (`tests/cross-cutting/codes.test.ts:87-90`) deep-compares `catalogRow.helpfulContext` to `specRow.helpfulContext`, where `specRow` is generated from the master spec's `<!-- §12.4 helpfulContext appendix -->` YAML block (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3108-3325`) by `pnpm gen:spec-codes` (`scripts/extract-spec-codes.ts`). Absent appendix key ⟹ `specRow.helpfulContext === null`. So setting a catalog `helpfulContext` without the matching appendix entry FAILS x1 and blocks merge.

Therefore each of the 45 codes requires THREE edits landing in ONE commit (the plan-wide §12.4-lockstep rule):

1. **Master-spec appendix prose:** add `CODE: "<string>"` to the YAML fence (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3108`), byte-identical to the catalog string. All 45 have non-null `dougFacing` (eligible; the appendix omits only `dougFacing: —` codes). None of the 45 is in `CARD_SURFACED_LOG_ONLY` (verified) — no exemption conflict. This also completes the documented-but-unenforced §12.4 invariant "every non-null-`dougFacing` code has non-null `helpfulContext`" (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2768`).
2. **Regen:** `pnpm gen:spec-codes` → refresh `lib/messages/__generated__/spec-codes.ts`; commit the regenerated file.
3. **Catalog:** the `lib/messages/catalog.ts` edits (below).

Do NOT reformat (`prettier`) the master spec; edit only the appendix lines. Strings carry apostrophes but no double-quotes, so no YAML escaping is needed.

## 8. File manifest

- **Modify:** `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` — add 45 `CODE: "..."` lines to the §12.4 `helpfulContext` appendix (§7.5). Appendix-only; no other prose touched.
- **Modify (generated):** `lib/messages/__generated__/spec-codes.ts` — regenerated by `pnpm gen:spec-codes`; never hand-edited.
- **Modify:** `lib/messages/catalog.ts` — set `helpfulContext` on 45 entries (the 20 + 25 above). No other field touched.
<!-- spec-lint: ignore — new files created by this spec; not yet tracked -->
- **Create (new, untracked):** `tests/messages/popoverContextExemptions.ts` (`POPOVER_CONTEXT_EXEMPT = []`) and `tests/messages/_metaPopoverContextCoverage.test.ts` (the §4 gate).
<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->
- **Create (new, untracked):** `tests/messages/popoverContextCopy.test.ts` — frozen-oracle per-code copy test for the 45 (§6).
