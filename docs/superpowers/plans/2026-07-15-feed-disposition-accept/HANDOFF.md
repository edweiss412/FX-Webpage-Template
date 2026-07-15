# Feed Disposition (Accept / Accepted) — Close-out Handoff

**Branch:** `feat/feed-disposition-accept` (worktree off `origin/main` @ b6de03fde)
**Spec:** `docs/superpowers/specs/2026-07-15-feed-disposition-accept.md` — Codex adversarial APPROVE R2 (R1: 3 blocking, fixed).
**Plan:** `docs/superpowers/plans/2026-07-15-feed-disposition-accept/00-overview.md` — Codex adversarial APPROVE R4 (R1: 2 blocking + 1 advisory; R2: 2 blocking; R3: 1 blocking + 1 advisory; all fixed).

## Delivered

- `FeedEntry.acceptable` / `acknowledgedAt` (readShowChangeFeed selects `source, acknowledged_at`; predicate mirrors `acknowledge_changes` RPC WHERE).
- `acceptChangeAction` / `acceptAllAction` in `app/admin/show/[slug]/_actions/feed.ts` — lock-free, dual revalidate (`/admin/show/[slug]` + `/admin`), post-commit `CHANGES_ACKNOWLEDGED` (sources `admin.show.feed.accept` / `.acceptAll`), invariant-10 registry rows + behavioral proof.
- `ChangeFeedEntry`: Accept button (reused `AcceptChangeButton`, payload `{showId, changeLogId: entry.id}`) + "Accepted" tag (total rule: tag ⟺ `acknowledgedAt !== null`, survives undo).
- `ChangesFeed`: "Accept all (N)" header control (derived from rendered acceptable ids); heading "Changes" → **"Sheet changes"** (ids/testids/anchors stable).
- Help copy rename + Accept documentation, pinned by `tests/help/sheetChangesCopy.test.ts` (casing/bold-variant-proof).

## Local verification

- Diff-relevant suites green: feed DB suite (11), action units (8), behavioral+meta (134), components (27), help (601), page-level (73). `pnpm typecheck` / `pnpm build` / `pnpm lint` (0 errors) / `pnpm format:check` green.
- FULL `pnpm test` locally red in env-bound suites ONLY (validation seed / pg_cron / shared-DB FK residue from sibling worktrees incl. `feat/structural-transform-use-raw`'s `use_raw_decisions` migration; `email-canonicalization` audit failure REPRODUCES AT MERGE-BASE b6de03fde in the clean main checkout — pre-existing, not this branch). Real CI (fresh DB) is the arbiter per AGENTS.md sibling-worktree discipline.

## §12 Impeccable dual-gate findings + dispositions

_Scope: components/admin/ChangeFeedEntry.tsx, components/admin/ChangesFeed.tsx, app/admin/show/[slug]/page.tsx (wiring), app/help/admin/dashboard/page.mdx, app/help/admin/per-show-panel/page.mdx._

### critique

⚠️ DEGRADED: single-context (both critique subagents unresponsive after ~12 min; detector + design review run inline sequentially per skill fallback).

Detector (`detect.mjs --json` on ChangesFeed/ChangeFeedEntry/AcceptChangeButton): **clean** (`[]`, exit 0).

| Finding | Severity | Disposition |
| --- | --- | --- |
| "Accept all (N)" count rendered without tabular figures — PRODUCT.md mandates `tnum` on every count | P2 | **FIXED** — `tabular-nums` added to `AcceptChangeButton` submit button (also benefits strip labels) |
| Repeated identical "Accept" accessible names on multi-acceptable pages (SR users cycling buttons hear "Accept" ×N) | P3 | **Accepted precedent** — the dashboard strip shipped per-row "Accept" through the Flow-4 impeccable gate with the same naming; row context (summary in same list item) disambiguates; revisit if SR feedback surfaces |
| Accept + Undo co-render on acceptable crew rows (two secondary buttons) | P3 | **Intentional** — spec §4.1; identical affordance vocabulary (same button shape/tokens), mirrors strip rows |

Strengths: exact affordance-vocabulary reuse (Accept ≡ Undo button shape); "Accepted" tag joins the existing muted badge family (`bg-surface-sunken`/`text-text-subtle`); count + ids derived from rendered acceptable subset, never hardcoded; plain-language `title` copy.

### audit

Scores (0-4): A11y **3** · Performance **4** · Theming **4** · Responsive **4** · Anti-patterns **4**.

- A11y: real `<button>`s with text names + `aria-busy` pending + `focus-visible` ring; h2/`aria-labelledby` wiring unchanged; tag is text + `title`, never color-only. Contrast: tag #5a5b62 on #f4f3f1 ≈ 6.1:1 (light), #9c9a93 on #0b0c10 ≈ 6.7:1 (dark) — AA pass; not AAA, matching the pre-existing `undone`/`superseded` badge family (precedent). Minor gap = repeated "Accept" names (P3 above).
- Responsive: header row `flex-wrap`; Accept meets 44px via `min-h-tap-min`/`min-w-tap-min` tokens; no fixed widths; no horizontal overflow vector.
- Theming: 100% tokens, both modes via runtime token indirection; zero hardcoded colors.
- Perf: no animation added; O(entries≤50) filter/map per render; per-row `useActionState` instances are independent and cheap.
- Anti-patterns: detector clean; no bans triggered.

P0: none. P1: none. → Gate PASSES (P2 fixed in-diff; P3s dispositioned above).
