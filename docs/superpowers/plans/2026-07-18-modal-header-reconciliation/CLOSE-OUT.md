# Modal Header Reconciliation — close-out (Task 10)

Branch `feat/modal-header-reconciliation`, merged with `origin/main` at `e5b706e00`.
Task 10 adds **no new assertions** — every behavioral assertion landed red-first in the task that produced it.

---

## §1 Task ledger

| # | Commit | Task |
| --- | --- | --- |
| 1 | `6e0e91d28` | optional `subHeader` band slot on `ReviewModalShell` + Step 3 baseline capture |
| 2 | `a274aece6` | delete `StatusStrip` `renderTitle` / `chrome` / `title` dead props |
| 3 | `6e3a992b1` | move the status strip into its own band |
| — | `404b404ed` | correct the `w-full` claim; record M2/M3 |
| 4 | `96791de5f` | client/date subline in the header |
| 5 | `a28f4920c` | alert badge → header pill; drop its strip disjunct |
| 6 | `fd2168be3` | `ShareLinkCopyButton` variant union + neutral outline arm |
| 7 | `baff006ab` | Re-sync → control strip as a ghost trigger with overlay results (merged task) |
| 8 | `9b9a452bc` | collapse the strip sync/edited stack to one line |
| 9 | `62abbc9bd` | three-band frame in the show-modal skeleton |
| — | `ad34d87e9` | merge `origin/main` |

## §2 T-TOKENS (source scan)

No raw hex in any changed component. The only `#`-match across the diff is a `#470` memory reference inside a comment. Every new color / radius / spacing resolves through a token class (`bg-warning-bg`, `text-warning-text`, `border-border-strong`, `text-text-subtle`, `bg-status-review`, `rounded-pill`, `size-tap-min`, `min-h-tap-min`).

The specific trap this catches — the mock's `:root` block is the live **dark-theme** runtime tokens byte-for-byte, so porting it verbatim would look correct in dark and break light entirely. It was not ported.

## §3 T-TRANSITIONS (source audit)

Every new transition uses a motion **token** (`duration-fast`). `app/globals.css:409` collapses all motion-token durations to `0ms` under `prefers-reduced-motion: reduce`, so no new motion bypasses the reduced-motion contract. No `AnimatePresence` was added; the Re-sync overlays and the alert pill mount/unmount instantly, as §9 declares.

## §4 T-COUNTS final (scanner-run, not reasoned)

| File | Literal | Heads |
| --- | --- | --- |
| `StatusStrip.tsx` | **7** | archived / control-divider / live / sync / edited / re-sync / copy-link |
| `PublishedReviewModal.tsx` | **4** | — |
| `OverviewSection.tsx` | **4 — UNCHANGED** | share / sheet-sync / open-sheet / archive-row |

## §5 Blast-radius sweep

`rg 'ReSyncButton|admin-resync|show-status-strip|strip-title|renderTitle|chrome=|overview-sheet-sync' tests/` → 18 files. 13 carry a disposition in `04-verification.md`'s index; 5 are comment-only matches needing none. The one live uncovered hit, `published-review-modal.interactions.spec.ts`, gained +283 lines of overlay interaction coverage in Task 7.

Stale-comment repair: `tests/components/atoms/AccentButton.test.tsx` still listed `ReSyncButton` among the migrated accent call sites. The line is accurate **history** (it was one at M5-D7), so a de-migration note was appended rather than rewriting the record.

## §6 Gate results (merged tree)

| Gate | Result |
| --- | --- |
| `pnpm test` | **14916 passed / 0 failed**, 56 skipped |
| `pnpm typecheck` | clean |
| `pnpm lint` | 0 errors (29 pre-existing warnings) |
| `pnpm format:check` | clean |
| `pnpm build` | clean |
| `pnpm test:e2e:modal-header` | 46/46 |
| `published-review-modal.layout` | 18/18 |
| impeccable detector | 0 findings across all 6 changed components |

The two `pg-cron-coverage` live-DB failures observed before the merge (an orphaned `cleanup-bootstrap-nonces` row in the shared local DB — this diff contains no SQL) are gone on the merged tree.

## §7 impeccable dual-gate (invariant 8)

> ⚠️ **DEGRADED: single-context** — both critique sub-agents (Assessment A design review, Assessment B detector/browser) idled instantly without executing, twice each, including after direct re-prompts. The skill mandates two isolated sub-agents and requires this banner when that is not achievable. Assessments were completed inline instead.

**Detector — a false clean was caught.** The first run printed `Warning: cannot access …`, exited 0, and returned `[]`: the `app/admin/show/[slug]/…` paths were being glob-expanded by the shell. The clean result was only trusted after feeding the detector a probe containing deliberate slop (gradient text, `border-l-4` side stripe), which it correctly flagged. Re-run on quoted component paths: **genuinely 0 findings**.

**Measurements** were taken from the committed real-browser suites rather than re-derived: tap targets (alert pill `before:-inset-y-3` ≈ 48px, clearing the 44px floor an earlier `-inset-y-2` draft would have missed at 40px), contrast (T-CONTRAST light + dark, ≥4.5:1 on real painted backdrops), the accent enumeration (T-NO-ORANGE, exact set per §4.2 state including the archived empty-set row), and band geometry (T-LAYOUT, skeleton D/E).

### Findings + dispositions

| # | Finding | Tier | Disposition |
| --- | --- | --- | --- |
| 1 | Control strip wraps to a second row at 390px (44px → 80px) | P2 | **DEFERRED** — `STRIP-MOBILE-WRAP-1` |
| 2 | Skeleton control band cannot match the loaded band at 390px (73px vs 149px) | P2 | **DEFERRED** — `STRIP-SKELETON-MOBILE-BAND-1` |
| 3 | Standalone real-browser specs ran in no CI job | P1 | **FIXED** — see §8 |
| 4 | `AccentButton.test.tsx` stale migrated-call-site comment | P3 | **FIXED** in the close-out commit |

No P0. Both P2s are the same root cause and are documented with concrete un-defer triggers and the actual lever (a deliberate mobile reflow via `basis-full`, not tightened spacing). Neither was "fixed" by widening a tolerance — the plan explicitly forbids that, and Task 9 reported the E@390 premise failure rather than absorbing it.

## §8 P1 — the real-browser assertions were dark in CI

`tests/e2e/standalone.config.ts` holds ~19 self-contained specs, and **no workflow invoked that config**; Playwright's default config matched none of those files under any project. The symptom was misleading: `pnpm exec playwright test <path>` reports `No tests found`, which reads as a bad path rather than a missing project. Every real-browser assertion this change produced — T-LAYOUT, T-COPY-FLUSH, T-TAP, T-OVERLAY, T-NO-ORANGE, T-CONTRAST, T-RESYNC-FOCUS-ORDER, T-STATUS-INLINE, skeleton A–E — would have gone green once and never run again. This is the #479 class repeating.

**Sibling pre-emption.** PR #493 landed the same fix for the published modal's own specs while this branch was mid-flight (workflow + `desktop-chromium` testMatch entry). Per the merge-and-extend rule, `modal-header-layout-e2e.yml` was narrowed to what #493 left dark — `skeletonBandParity`, `statusStripToggleLayout`, `step3-review-modal.layout` — and kept as a separate job because those three self-host (no server, no Supabase, ~15s) whereas #493's job boots the :3000 prod artifact plus a seeded database.

The remaining ~15 standalone specs are dark for the same pre-existing reason and are filed as `BL-STANDALONE-CONFIG-CI-DARK`, including the blocker that `packlist-rescan-recovery.spec.ts` fetches `esbuild` over the network at test time and cannot join a required job as-is. The backlog entry names the structural guard that would close the class permanently: a fails-by-default meta-test asserting every `tests/e2e/*.spec.ts` is both matched by some config and named in some workflow.

## §9 Findings reported rather than absorbed

- **M4 (Task 8)** — §4.5 trades height for **width**; the plan costed only height. Root cause of both P2s.
- **M5 (Task 9)** — the skeleton's E@390 premise does not survive the wrap, and the plan's nominated lever (bar heights) cannot close it because the wrap point is data-dependent. Overfitting the placeholders to one fixture was rejected.
- **Task 8 knock-on** — the wrap dropped `statusStripToggleLayout` invariant (b)'s card-vs-inline delta from 20+px to ~11px. Re-measured at ≥sm rather than widening the threshold: (b) claims toggle-weight compaction, and at 390px it had quietly become a wrap-count comparison. Precedent — invariant (a)'s CI-1b clause already measures at 800px in the same describe.
- **`w-full` (`404b404ed`)** — 22 spec review rounds asserted it was "the invariant that makes right-flush reachable." Measurement proved otherwise: the band is block-level non-flex, so the block-level flex row already fills it, and T-COPY-FLUSH passes without it. Kept as a genuine guard (it matters if the band ever becomes flex), with the claim corrected.
- **T-DIVIDER-ALERT-ONLY (Task 5)** — passed spuriously at strip level once `alertCount` left the strip fixture (`undefined > 0` is false). Moved to the modal, where it was genuinely red; the strip case survives demoted to a keep-green guard with a comment saying so.
- **T-CONTRAST (Task 6)** — first measured 1.04:1 in dark. Not a contrast bug: `transition-colors` means an immediate post-toggle read samples a mid-transition color. Fixed by awaiting `document.getAnimations()`. Worth recording because the natural response to 1.04:1 is lowering the threshold, which would permanently blind the assertion.

## §10 Declared non-red assertions

Per the plan's honest-declaration table (precedent: spec §11.2's baseline table): **T-STEP3-INVARIANT** (regression guard by construction), **T-TAP sheet-link clause** (already `size-tap-min`, ratified unchanged), **T-COPY-ACCENT-UNCHANGED** (invariance guard on the shared accent arm), and **T-STATUS-ERROR-BUCKET** (bucket behavior pre-exists; its red comes from the shared single-row structural clause).

## §11 Stage 4 — cross-model adversarial review (Codex, round 1)

**`VERDICT: APPROVE`** with two advisory findings. Both triaged below; advisory items are compatible with APPROVE, and no round 2 was required.

### MEDIUM — "Re-sync overlay can stale-cover unrelated modal content" — PARTLY REFUTED, remainder is ratified design

The finding has two halves.

**Cross-show half — refuted with evidence.** Codex reasoned that navigating to another `show` while the shell stays mounted would leave a stale success overlay attached to the new control band. It cannot: `app/admin/_showReviewModal.tsx:368` puts `key={showId}` on the `ShareTokenProvider` that wraps `<PublishedReviewModal>`, so the entire subtree — `ReSyncButton` included — remounts on a show change and `successMessage` resets to `null`. This is exactly the class of claim that looks right from a diff alone and is wrong against the mount tree, which is why it was checked rather than accepted.

**Within-show half — accurate, and intentional.** After a publish toggle or copy interaction the success overlay does persist. That is the ratified contract, not an oversight: nothing self-clears (`successMessage` is set on success and cleared only at the start of the next `post()`; there is no timer, and `router.refresh()` refreshes server data without touching local state), which is precisely *why* Task 7 Step 6 added explicit dismiss controls with branch-specific names. The overlay is height-capped (`max-h-[min(50vh,20rem)]` + `overflow-y-auto`) so it cannot grow to swallow the body, and `Esc` is deliberately not the mechanism because the shell binds it to closing the whole modal.

**Disposition:** no change. Half refuted, half ratified.

### LOW — "Alert pill accessible count is ambiguous past the cap" — ACCEPTED AS DESIGNED

At `alertCount > 99` the accessible name is `"99+ alerts (1200 open alerts)"`. Codex reads the two counts as ambiguous. The pairing is deliberate: the visible pill stays capped so the header cannot be pushed around by a four-digit count, while assistive tech still gets the exact number, which is the actionable figure. The construction is also load-bearing in a subtler way — the separator is its OWN visible text node because a leading space *inside* the `sr-only` span is trimmed during accessible-name computation, which would yield `"99+ alerts(1200 open alerts)"`. That is a previously-shipped bug class on this project (memory `#470`), and the current shape is the fix for it.

**Disposition:** no change. Recorded so a future reviewer does not re-derive it.

### Review mechanics

The companion app-server is blocked on this repo and a foreground `codex exec` is refused by a local guard, so the review ran backgrounded with the prompt passed as an argument and `< /dev/null` closing stdin (a documented hang otherwise). `~/.codex/models_cache.json` was cleared first to pre-empt the TTL wedge. Packet: 74KB of production-source diff with the test diff as `--stat` only, tools explicitly forbidden — past runs with tools enabled died mid-exploration returning zero findings.
