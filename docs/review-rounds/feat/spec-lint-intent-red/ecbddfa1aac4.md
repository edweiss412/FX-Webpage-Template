# Round-economy filing — feat/spec-lint-intent-red

## spec — 4 rounds

**Examined:** all four spec rounds (9 + 4 + 5 + 5 findings, every one accepted and repaired in-round; no refutations). The subject is itself a linter-design spec, so the reviewer productively probed the SHIPPED linter's behavior against the design's claims — three of the four rounds' sharpest findings (marker-span candidacy, capture-position citation findings, the spawnSync ETIMEDOUT+status:0 hybrid) came from live probes of `lib/specLint/` and `node:child_process`, not from prose reading.

**Mechanizable:** the round-2/round-4 corpus-count corrections (pathspec missing root-level plans; grep-vs-parser marker semantics) are exactly the class `BL-SPECLINT-PROSE-COUNT-PARITY` (owned by `feat/speclint-prose-count-parity`) mechanizes — a doc-quoted count command whose output the doc restates is verifiable at lint time. No new arm proposed here; the owning arc's design covers it.

**Judgment:** the dominant round-multiplier was repair-introduced surface: R3's five findings were consequences of R1 repairs (line-level exclusion, hard retired-target), R4's five of R3's (path-only form landed in one site instead of five; line-exclusion scope still wrong until narrowed to the capture span). The class-sweep discipline was applied per finding but the sweeps were enumerative rather than derived; the R4 repair finally replaced the enumerated line-exclusion scope with a derived rule (span-level, validity-global/presence-regional), which is the shape that should have shipped in R1's repair.

**Infra:** none — all four dispatches returned verdicts first-attempt through codex-guard with the lint arm present.
