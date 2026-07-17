- [MEDIUM] `docs/superpowers/plans/2026-07-17-wizard-blocker-modal.md:168` contains invalid TypeScript in the implementation sketch: `export? function FinalizeBlockerModal`. The surrounding text says module-private, so this should be plain `function`; as written, copy-through implementation fails typecheck.

- [MEDIUM] The §6 “exactly one labelling element” requirement is under-tested. The planned test only checks that `aria-labelledby` resolves to a non-empty element (`docs/superpowers/plans/2026-07-17-wizard-blocker-modal.md:188-201`), but it does not assert a single id token or absence of competing `aria-label`. Spec requires exactly one labelling element (`docs/superpowers/specs/2026-07-17-wizard-blocker-modal-design.md:91-96`).

- [LOW] The `offsetParent` jsdom stub is global and unrestored (`docs/superpowers/plans/2026-07-17-wizard-blocker-modal.md:320`). Existing local precedent restores the descriptor around the focus test (`tests/components/admin/wizard/Step3ReviewModal.test.tsx:403-432`). Leaving it global can mask later focusability bugs in the same file.

- [LOW] One live-code citation is stale: the plan says BlockedRowResolver two-tap/POST is at `BlockedRowResolver.tsx:186-198,210` (`docs/superpowers/plans/2026-07-17-wizard-blocker-modal.md:57`), but the actual fetch/onResolved path is `components/admin/BlockedRowResolver.tsx:153-166`, guarded two-tap is `184-198`, and testid is `210`.

VERDICT: APPROVE