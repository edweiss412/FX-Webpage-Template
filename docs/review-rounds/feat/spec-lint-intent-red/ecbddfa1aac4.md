# Round-economy filing — feat/spec-lint-intent-red

## spec — 8 rounds

**Examined:** all eight spec rounds (9 + 4 + 5 + 5 + 1 + 2 + 1 + 0 findings — APPROVE at R8; every finding accepted and repaired in-round, zero refutations). The subject is itself a linter-design spec, so the reviewer productively probed the SHIPPED linter's behavior against the design's claims — three of the four rounds' sharpest findings (marker-span candidacy, capture-position citation findings, the spawnSync ETIMEDOUT+status:0 hybrid) came from live probes of `lib/specLint/` and `node:child_process`, not from prose reading.

**Mechanizable:** the round-2/round-4 corpus-count corrections (pathspec missing root-level plans; grep-vs-parser marker semantics) are exactly the class `BL-SPECLINT-PROSE-COUNT-PARITY` (owned by `feat/speclint-prose-count-parity`) mechanizes — a doc-quoted count command whose output the doc restates is verifiable at lint time. No new arm proposed here; the owning arc's design covers it.

**Judgment:** the dominant round-multiplier was repair-introduced surface: R3's five findings were consequences of R1 repairs (line-level exclusion, hard retired-target), R4's five of R3's (path-only form landed in one site instead of five; line-exclusion scope still wrong until narrowed to the capture span). The class-sweep discipline was applied per finding but the sweeps were enumerative rather than derived; the R4 repair finally replaced the enumerated line-exclusion scope with a derived rule (span-level, validity-global/presence-regional), which is the shape that should have shipped in R1's repair. Rounds 5-7 each converged on a single residual wording contradiction left by the prior repair (validity-scope sentence, execution-population sentence, transcript sentence) — the tail cost of sweeping enumeratively; the round-6 fence held and R8 confirmed at zero.

**Infra:** none — all eight dispatches returned verdicts first-attempt through codex-guard with the lint arm present.

## plan — 6 rounds

**Examined:** all six plan rounds (13 + 7 + 9 + 3 + 1 + 0 findings — APPROVE at R6; every finding accepted and repaired in-round, zero refutations). Round 1 caught structural defects (an invalid regression-only RED, a test-derived oracle, grammar ownership split across two modules); rounds 2-4 were test-shape elaboration — premise-contract parity, per-consumer matching pairs, seam plumbing (cwd on the spawn seam), and the runLint-vs-CLI halves of the spec's wiring bullet.

**Mechanizable:** the round-2 EXPECTED_ENV_TOUCHING parity miss is already mechanized (the meta-test itself is the gate; the plan simply had not named the edit). The round-4 "which suite owns the spawning tests" ambiguity dissolved by construction — real-CLI cases consolidated into the unenrolled cli.test.ts, so enrolled suites stay env-count 0; no new tooling proposed.

**Judgment:** the reviewer's strongest catches came from probing the live meta-tests the plan enrolls into (`_metaPremiseContract` exact key parity, `cli.test.ts` helper default cwd) — the same probe-the-shipped-code pattern that dominated the spec stage. The plan's oracle table and the committed tier keys ended the round-1 class of test-derived expectations outright.

**Infra:** none — all six dispatches returned verdicts first-attempt; the round-3 result.json parsed findingCount 3 against a declared FINDINGS: 9 (the terminal message is authoritative; noted here so the corpus row's count is read with that caveat).
