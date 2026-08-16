# Preamble fidelity-claim classification (diff review R1 F1)

Spec §1.1.6 keys on the verbatim CLAIM "in ANY spelling". The first implementation
pass matched only the literal word `verbatim` and left four preambles making a
preservation claim in other words false. Repaired as a CLASS over the finite domain,
all 43 demoted headings, not at the four named sites.

**The line drawn.** A fidelity claim asserts the preserved entry is UNCHANGED
(`verbatim`, `unedited`, `nothing else is edited`); a heading demotion falsifies it, so
it gains the annotation. A locator only says where the entry sits (`Original entry
below.`, `Original entry (provenance):`); a heading-mark change leaves it true, so
annotating it would add noise rather than truth.

**Result: 13 of 43 are fidelity claims**, the 9 the first pass caught plus the 4 below.
The remaining 30 are locators, bare survivor headings, or ordinary resolution prose.

Newly annotated in this round:

| Id | File:line | Claim |
|---|---|---|
| BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP | BACKLOG-archive.md:3003 | "Nothing else is edited." |
| BL-IDENTITYLINK-LANDED-VS-REQUESTED | BACKLOG-archive.md:3046 | "Nothing else is edited." |
| BL-UNDO-SELECTIONS-RESET-AT-DROP | BACKLOG-archive.md:3088 | "Nothing else is edited." |
| BL-MODAL-REALTIME-UPDATED-CUE | BACKLOG-archive.md:3228 | "The original entry, unedited, follows." |

Full 43-row classification of the shipped tree, re-derivable by re-running the sweep:

```
BACKLOG-archive.md:2764	BL-RATE-LIMIT-SNAPSHOT-DURABILITY	FIDELITY (already annotated)
BACKLOG-archive.md:2812	BL-LEDGER-MDAST-SHARED-HOME	FIDELITY (already annotated)
BACKLOG-archive.md:2861	BL-AGENDA-PERLINK-COMPLETENESS	FIDELITY (already annotated)
BACKLOG-archive.md:2923	BL-FITWITHINCLIP-CLIP-SCROLL-STALE	FIDELITY (already annotated)
BACKLOG-archive.md:3003	BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP	FIDELITY (already annotated)
BACKLOG-archive.md:3046	BL-IDENTITYLINK-LANDED-VS-REQUESTED	FIDELITY (already annotated)
BACKLOG-archive.md:3088	BL-UNDO-SELECTIONS-RESET-AT-DROP	FIDELITY (already annotated)
BACKLOG-archive.md:3139	BL-ADMIN-NOJS-LOADING-CONFLICT	no fidelity claim
BACKLOG-archive.md:3228	BL-MODAL-REALTIME-UPDATED-CUE	FIDELITY (already annotated)
BACKLOG-archive.md:3240	BL-ONBOARDING-CAS-SOURCE-ANCHORS	no fidelity claim
BACKLOG-archive.md:3272	BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT	no fidelity claim
BACKLOG-archive.md:3280	BL-ADMIN-PARSEPANEL-ORPHANED	no fidelity claim
BACKLOG-archive.md:3286	BL-HELP-STRIP-COPYLINK-STALE	no fidelity claim
BACKLOG-archive.md:3296	BL-UNPUBLISH-TO-HELD	no fidelity claim
BACKLOG-archive.md:3308	BL-VERSION-AMBIGUOUS-V1-OVERRIDE	no fidelity claim
BACKLOG-archive.md:3540	BL-CI-STATIC-ENV-INJECTION	no fidelity claim
BACKLOG-archive.md:3554	BL-DANGLING-CITATIONS-RETIRED-WORKFLOW	no fidelity claim
BACKLOG-archive.md:3584	BL-MASTERSPEC-FINANCIALS-VOCAB	no fidelity claim
BACKLOG-archive.md:3596	BL-SOUND-REDIRECT-GUARD	no fidelity claim
BACKLOG-archive.md:3610	BL-CI-GITHUB-ENV-CROSS-STEP-STATE	no fidelity claim
BACKLOG-archive.md:3622	BL-PG-CRON-PER-CASE-QUERY-ATTRIBUTION	no fidelity claim
BACKLOG-archive.md:3644	BL-LEDGER-GUARD-MDAST-REWRITE	no fidelity claim
BACKLOG-archive.md:5027	BL-ARCHIVE-PENDING-REALTIME-SWAP-RACE	no fidelity claim
BACKLOG-archive.md:5037	BL-ARCHIVE-REPEAT-TELEMETRY-DEDUP	no fidelity claim
BACKLOG-archive.md:5276	BL-INVARIANT8-CLOSEOUT-ENFORCEMENT	no fidelity claim
BACKLOG-archive.md:5407	BL-SHAREHUB-BACKDROP-COVERS-TRIGGERS	no fidelity claim
BACKLOG-archive.md:5423	BL-ATTENTION-MENU-PANEL-CLIP	no fidelity claim
BACKLOG-archive.md:5439	BL-PUBLISHED-TOGGLE-OVERLAY-CLIP	no fidelity claim
BACKLOG-archive.md:5451	BL-SHAREHUB-CONFIRM-NAMES-SHOW	no fidelity claim
BACKLOG-archive.md:5467	BL-SHAREHUB-OPEN-TIMER-LEAK	no fidelity claim
BACKLOG-archive.md:5481	BL-POPOVER-SHARED-RAF-COALESCER	no fidelity claim
BACKLOG-archive.md:5641	BL-WIZARD-RESTAGE-FETCH-BEFORE-LOCK	FIDELITY (already annotated)
BACKLOG-archive.md:5755	BL-CONCURRENT-RETRY-DB-TIMEOUT-FLAKE	no fidelity claim
BACKLOG-archive.md:5778	BL-PARSER-VENUE-TYPO-GENERATOR-SEED-FLAKE	no fidelity claim
BACKLOG-archive.md:5807	BL-KNOWN-SECTIONS-WALKER	no fidelity claim
BACKLOG-archive.md:5841	BL-LEDGER-GUARD-TERMINAL-CLAIM-BLIND	no fidelity claim
BACKLOG-archive.md:6128	BL-NEEDS-ATTENTION-HOLDS-ROLLUP	no fidelity claim
DEFERRED-archive.md:410	NEWTAB-GUARD-UNDECIDABLE-2	FIDELITY (already annotated)
DEFERRED-archive.md:468	DESTRUCT-ARM-ANNOUNCE-1	FIDELITY (already annotated)
DEFERRED-archive.md:505	PSQL-GUARD-RECALL-RESIDUAL	FIDELITY (already annotated)
DEFERRED-archive.md:585	PSQL-STARTUP-FILE-NO-X-CLASSWIDE	FIDELITY (already annotated)
DEFERRED-archive.md:1761	USE-RAW-FULL-LIST-1	no fidelity claim
DEFERRED-archive.md:1816	CASP-2	no fidelity claim
```
