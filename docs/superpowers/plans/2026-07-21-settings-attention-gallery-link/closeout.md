# Close-out — settings attention-gallery link

Feature: `feat/settings-attention-gallery-link` — spec
`docs/superpowers/specs/2026-07-21-settings-attention-gallery-link.md` (Codex
APPROVE R5), plan in this directory (Codex APPROVE R6).

## Evidence log

- Unit TDD: RED (exit=1, only the new test failing on missing
  `admin-dev-tools-gallery`) → implementation → GREEN (51/51 across the
  settings suites) + `pnpm typecheck` clean.
- e2e: RED on dev-build (fails exactly on the new gallery visibility
  assertion, `admin-dev.spec.ts:61`) → GREEN dev-build posture (every full
  run: 3 passed incl. both settings tests) + GREEN prod-build/prod-runtime-flip
  (4/4 via `--project=... --no-deps`).
- Full local gates: `pnpm test` 16204 passed / 0 failed; typecheck clean;
  eslint 0 errors (3 pre-existing warnings in untouched files); prettier clean
  after `style(admin)` reflow commit.

## Pre-existing failure disposition (not this diff)

`tests/e2e/attention-modal-gallery.spec.ts:183` ("Flight boundary + write
containment") fails intermittently under the full dev-gate run with
`mutation controls leaked writes: POST /api/observe/client-error`; passes in
isolation. Reproduced IDENTICALLY at merge-base `origin/main` (probe worktree
at #543, same command, same failure). Classification: pre-existing flake on an
untouched surface — the client-error telemetry beacon fires on a transient SSR
blip during scenario stepping (the spec's own history carries prior
stabilization commits for this class, e.g. "bounded reload-retry in
gotoScenario for transient SSR blips"). Not introduced, not fixed here.
Operational note: the dev-build project is a dependency of the prod posture
projects, and Playwright runs dependency projects UNFILTERED — so this test
cannot be excluded from a chained full run by file/grep filters; prod postures
were verified with `--no-deps`.

## 12. Impeccable findings & dispositions

Dual gate run 2026-07-22 on the diff scope (DevToolsRow.tsx + settings page
context). Critique: dual-agent (design review + deterministic detector),
snapshot `.impeccable/critique/2026-07-22T05-13-09Z__components-admin-settings-devtoolsrow-tsx.md`,
detector 0 findings, heuristics 24/28 scored. Audit: 19/20 (A11y 3, Perf 4,
Responsive 4, Theming 4, Anti-patterns 4); all styling via token classes,
44px floor + focus ring on both links, wrap-safe at both flex levels, no
anti-pattern hits. **0 P0, 0 P1** — invariant-8 gate passes with nothing to
fix or DEFERRED.md-defer.

| Tier | Finding | Disposition |
|------|---------|-------------|
| P2 | "Open" label ambiguous beside a named sibling (SR link-list context) | Deferred — renaming existing copy conflicts with spec §1.1 "row copy unchanged"; WCAG 2.4.4 satisfied by in-context row heading. Candidate for a follow-up copy pass. |
| P2 | Link label "Attention gallery" vs destination h1 "Attention modal gallery" | Deferred — label ratified in spec §1.1/§3 (user-approved). Destination h1 provides immediate confirmation; revisit only with a spec amendment. |
| P3 | `devLinkClass` lacks `transition-colors duration-fast` + `focus-visible:ring-offset-2` vs sibling secondary button (`DriveConnectionPanel.tsx:244`) | Deferred — pre-existing literal carried verbatim per spec §3 ("className identical to the Open link"); aligning both is a cross-component polish item. |
| P3 | Row description does not mention the gallery action | Deferred — spec §1.1 freezes row description copy. |
