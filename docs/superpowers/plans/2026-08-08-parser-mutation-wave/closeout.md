# Parser mutation-hardening wave — closeout

impeccable-gate: N/A — no UI surface

Wave closes when all five branches are merged, AC-W1..W3 (see [00-overview.md](./00-overview.md)) verified, and every `BL-MUTATION-*` row is archived with its residue note. The wave's ONLY UI-surface touch is the help-family rows in `app/help/errors/_families.ts` (spec §1.1.8 as amended by the 2026-08-08 retro cross-model review): the impeccable dual-gate runs once, on the /help/errors diff, at `feat/mutation-column-shift` close-out — that branch replaces the interim `N/A` marker line below with the filled `critique=RAN audit=RAN …` form. Until then the line reflects the not-yet-touched state.

Per-branch close: PR-head `mutation-harness` workflow verified green (procedural gate, spec §2.2), ledger marker removed in the PR's last commit, `git rev-list --left-right --count main...origin/main` = `0  0` after merge.

Review record: spec approved via substitute adversarial review (3 rounds: 8 → 1 → 0 findings) while Codex was quota-limited; implementation branches use the same substitute mechanism until the quota resets (overview "Review mechanism"), then revert to codex-guard.
