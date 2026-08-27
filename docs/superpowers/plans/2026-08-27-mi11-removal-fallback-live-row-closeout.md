# Closeout — the mi11 retain arc

Plan: `docs/superpowers/plans/2026-08-27-mi11-removal-fallback-live-row.md`. Spec: `docs/superpowers/specs/sync/2026-08-27-mi11-removal-fallback-live-row.md`. Branch `fix/mi11-removal-fallback-live-row`.

## 12. Invariant 8 — the impeccable dual gate

impeccable-gate: critique=RAN audit=RAN p0=0 p1=1 dispositions=recorded

**Why this arc has a UI surface at all.** The behaviour change made two shipped operator help pages wrong: they promised that a held crew member's "prior details stay in effect", which described the silent data revert this arc removes as if it were a feature. `app/help/**` is under `app/`, so repairing them makes this a UI surface under invariant 8. Ruled by the orchestrator: copy an arc makes wrong is that arc's defect, and deferring it merges main with false help.

**Scope of the gate.** Two sentences of MDX prose inside existing paragraphs — `app/help/admin/review-queues/page.mdx:59` and `app/help/admin/per-show-panel/page.mdx:20`. No component, no color token, no layout, no motion. Both halves were run against that diff, each as two isolated sub-agents per the critique's own hard invariants (a design review and a detector/mechanical pass that do not see each other's output before synthesis).

### Critique — 32/40, good, upper end of the typical 20-32 band

Method: dual-agent. The run's own snapshot lives under the gitignored `.impeccable/critique/` directory, stamped 2026-08-27T17-37-24Z for the review-queues slug; the dispositions below are the durable copy, since that directory is not tracked.

AI-slop verdict: no. Detector `[]` exit 0 on the two files and again across the whole 30-file `app/help` tree.

| Finding | Tier | Disposition |
| --- | --- | --- |
| review-queues:59 chained four clauses through a colon, an "and" and a semicolon | P1 | **FIXED in-round** (`3a3e4215b`). Split after the Approve/Reject clause, which also restores parallelism with per-show-panel, where a sentence boundary already sat there. Dense prose is a real cost for the reader PRODUCT.md describes: a project manager on a venue floor holding a phone. |
| "identity" is never spelled out as name-and-email | P2 | **REJECTED, with evidence.** "identity" is house vocabulary across 12 help files and `components/admin/IdentityHoldDisclosure.tsx`, and the house convention glosses it in place. Both changed sentences already carry that gloss — "(usually an email)" / "(usually an email change, sometimes a rename or removal)" — in the same sentence. Restating it would be redundant, and swapping the house term for an ad-hoc phrase costs more consistency than it buys. |
| the semicolon costs a phone reader a parsing beat | P3 | **REJECTED.** Semicolons joining two independent clauses are established house style; `app/help/admin/dashboard/page.mdx` does exactly this. A false positive against convention. |
| review-queues drops the old copy's "until you decide" | P3 | **MOSTLY FALSE.** That line still ends "until you decide"; the phrase attaches to the inbox clause rather than the identity clause. Left as-is. |

Two of four findings were false positives against house convention, which is the expected shape of a critique on a two-sentence diff into well-established pages.

### Audit — 20/20, excellent

Method: sub-agent, read-only, no dev server and no build (the machine sat at load average ~15 with nine other work streams on it), and no screenshot capture (this is an arm64 host and the baselines are x64-Linux).

| Dimension | Score | Note |
| --- | --- | --- |
| Accessibility | 4 | Scored on the diff. The sentence sits inside the existing `<li>`; no heading misuse, no new bold used as a pseudo-heading. Both pages are h1 then h2 with no level skips. The semicolon-joined clause reads linearly for a screen-reader listener, who cannot skim. |
| Performance | 4 | Scored on the PAGE — the diff does not exercise it. Only lightweight `Callout` / `Step` / `Screenshot` / `HelpTable` components; no heavy MDX embeds. |
| Theming | 4 | Scored on the PAGE. `Callout.tsx` uses design tokens only (`bg-info-bg`, `border-warning-text`); no hard-coded colors in either `.mdx`. |
| Responsive | 4 | Scored on the diff, and the dimension that actually mattered here given the venue-floor phone reader. New sentence 106 characters, longest word 9; wraps normally with no long-token overflow at 390px. |
| Anti-patterns | 4 | Detector exit 0, `[]`. Every ban is N/A to plain prose. The `<Step n={n}>` list is a functional troubleshooting sequence, not numbered scaffolding. |

Anti-patterns verdict: PASS, no tells. **Zero P0, zero P1.**

**One P3, PRE-EXISTING and explicitly not this arc's to fix:** `app/help/admin/review-queues/page.mdx` mixes `## Heading` markdown with raw `<h2 id="...">` tags (lines 20/29/51/63). Renders identically; a maintenance-consistency nit that predates this change.

**Two corrections the audit made to its own brief, recorded because they matter for anyone re-running this.** The brief asserted both pages contain tables; per-show-panel has none. And review-queues' two tables are 2-column and deliberately excluded from `HelpTable`'s stacking transform, with a code comment at `app/help/_components/HelpTable.tsx:24-28` stating they "fit acceptably at 390px" — pre-existing and untouched.

**Sequencing, stated plainly rather than glossed.** The audit ran against `9901215fa`, before the critique's P1 repair landed at `3a3e4215b`. The only change between them is a period replacing ", and" — no element added, no attribute changed, and the resulting sentences are SHORTER, so every dimension the audit scored holds a fortiori. The detector was re-run against the final state and returned `[]` again.

## Mechanical evidence

- The impeccable detector: `[]`, exit 0, on the two files and on the whole `app/help` tree (30 `.mdx` files). Re-run after the P1 repair: still `[]`.
- Em dashes in the new copy: none. Apostrophes: straight literals, matching both files' existing convention (18/0 and 24/0 straight/curly).
- No raw error codes in the new copy (invariant 5).
- `prettier --check`: clean. `pnpm vitest run tests/help/`: 72 files, 901 tests, all passing.
- **Screenshot baselines: nothing moves.** Every `route:` in `scripts/help-screenshots.manifest.ts` targets `/admin`, `/admin/needs-attention`, or an `/admin/show/.../preview` variant. None targets a `/help/` page, so no committed capture frames either paragraph. Nothing was regenerated, which also means no arm64 bytes from this host went near the x64-Linux baselines.

## Carried forward, recorded rather than filed

Per the 2026-08-27 arc directive this arc files no ledger row of any facing. One thing a later reader should know:

**`.mdx` is not linted by ESLint in this repo.** `pnpm exec eslint` on either page exits 0 with "File ignored because no matching configuration was supplied", so an eslint pass on an `.mdx` file is a no-op rather than coverage. Prettier does check these files, and the project's own help-copy suites do the real work. Surfaced by the audit's mechanical pass; out of scope for a two-sentence copy arc.
