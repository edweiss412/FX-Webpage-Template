# `docs/superpowers/specs/` — Project Spec Catalog

Canonical specs for the FXAV crew-pages project. Organized by **release era** to mirror [`../plans/`](../plans/README.md).

## Release model

- **v1** = pre-deployment effort to put a dev-approved app in Doug/crew hands.
- **v1.X+** = post-deployment, feedback-driven changes. Each post-deployment release lands as a top-level peer here.
- **v2** = reserved; no work scheduled.

Per AGENTS.md invariant #7: the spec is canonical. Plans implement specs; they don't override them.

## v1 release bundle

| Role | Path | Notes |
| --- | --- | --- |
| **Master spec** | [`2026-04-30-fxav-crew-pages-v1.md`](./2026-04-30-fxav-crew-pages-v1.md) | Core product spec. Three ratified body amendments in §13.2.3 (recovery contract, retention horizon, lease-holder protocol). 4027 lines. |
| **Amendment — M11** | [`v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.md`](./v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.md) | In-app `/help` wiki. Companion stakeholder HTML at [`2026-05-12-user-facing-docs-design.html`](./v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.html). |
| **Amendment — M11.5** | [`v1-pre-deployment-amendments/2026-05-23-crew-auth-pivot-show-link-picker.md`](./v1-pre-deployment-amendments/2026-05-23-crew-auth-pivot-show-link-picker.md) | Crew auth pivot — supersedes master §5.2 / §7.2 / §7.2.1 / §7.2.2 / §7.2.3 / §9.2 in full. The master spec's pre-amendment block remains as historical context. |
| **Amendment — M12** | [`v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md`](./v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md) | Solo-dev UX validation gate before launch. Includes M11.5 picker-pivot rebase (§15.26). |

## Master-spec patches

Live in [`master-spec-patches/`](./master-spec-patches/). These are surgical edits to the master spec body — sentence- or section-level fixes integrated by cross-reference rather than as standalone documents. Current entries:

- [`2026-05-12-catalog-agenda-codes.md`](./master-spec-patches/2026-05-12-catalog-agenda-codes.md)
- [`2026-05-14-admin-allowlist-runtime-mutable.md`](./master-spec-patches/2026-05-14-admin-allowlist-runtime-mutable.md)

Distinct from `v1-pre-deployment-amendments/`: those are full amendment-shaped specs (each has its own plan tree, AC table, adversarial-review log); the entries here patch existing master-spec content rather than standing alone. The earlier directory name was `amendments/` (renamed for clarity).

## Cross-corpus amendments

Specs whose primary effect is to **amend already-ratified contracts across several v1 documents** (master spec + amendment bundle) rather than add a subsystem feature. They are listed here because the documents they amend link back to them by pointer, so this is the reverse index.

| Spec | Date | Amends |
| --- | --- | --- |
| [`2026-08-09-task-enrollment-multi-region-design.md`](./2026-08-09-task-enrollment-multi-region-design.md) | 2026-08-09 | Task enrollment becomes sequential multi-region: supersedes the pre-review-gate-arms spec's §3.2 exactly-one-region rule, its §3.4/§3.4.1 catalog and table rows, and AC-26/29/30/32/45; closes its §6 items 6-7 (`BL-TASK-ENROLLMENT-SINGLE-DEPTH`). |
| [`2026-08-07-projection-financials-viewer-independent-design.md`](./2026-08-07-projection-financials-viewer-independent-design.md) | 2026-08-07 | The lead-gated financials **fetch** contract: the `shows_internal.financials` read now issues on every cache fill for every viewer (entitlement gates the RETURNED value), so a financials fetch failure is alertable viewer-independently. Amends master spec §4.4/§7.4/§8, phase-1 §4.13, phase-2 agenda, nav-perf phase-1, and the role-scope vocab spec (census in its §3). |

## v1.X+ post-deployment specs — grouped by subsystem

Feedback-driven specs created after the v1 bundle are grouped into **subsystem folders** (dates stay in each filename, so chronology is preserved within a folder). Pick the folder that matches the surface you're touching:

| Folder | Scope |
| --- | --- |
| [`parser/`](./parser/) | Sheet parsing & fidelity — typo tolerance, gear/flight/hotel/room/set-cell, deep-links, INFO/FORM-tab, unknown labels |
| [`step3-onboarding/`](./step3-onboarding/) | Onboarding wizard & Step-3 review — scan progress, review modal/page, publish streaming, source anchors, rescan |
| [`observability/`](./observability/) | Telemetry & logging — centralized logging, Sentry, coverage, mutation-surface, cron attribution, forensic codes |
| [`alerts/`](./alerts/) | Admin alerts — action links, audience split, at-a-glance identity, resolve-truthing, auto-resolution, bell center |
| [`schedule/`](./schedule/) | Show-day schedule & agenda — key times, show-day labels, unified timeline, agenda PDF, strike/loadout, bookend days |
| [`nav-perf/`](./nav-perf/) | Navigation performance — data/auth, UI feedback, tag caching |
| [`ci/`](./ci/) | CI pipeline — merge queue, matrix/shard, PR speedup |
| [`data-quality/`](./data-quality/) | Data-quality & resync — badge warn-class, resync gate, version-detection, empty-drive, finalize races |
| [`crew/`](./crew/) | Crew page — picker, partial-attendance chip, client-section toggle, transport, redesigns |
| [`admin/`](./admin/) | Admin surfaces — developer tier, dev-gate, shows status/table, published toggle, validation reset |

Each folder has its own `README.md` index listing every entry. The `v1-pre-deployment-amendments/` subdir is frozen at v1 launch; it's a historical artifact of the launch bundle, distinct from these subsystem folders.

## Repo-tooling specs

Specs for the tooling agents run against this corpus rather than for product surfaces. They sit at
the root of this directory alongside the dated product specs.

| Spec | Scope |
| --- | --- |
| [`2026-07-19-spec-lint.md`](./2026-07-19-spec-lint.md) | `pnpm spec:lint` — the governing spec: citations, numerics, copy, sections, task contract. |
| [`2026-08-09-task-enrollment-multi-region-design.md`](./2026-08-09-task-enrollment-multi-region-design.md) | Multi-region task enrollment — amends the task-region grammar. |
| [`2026-08-15-spec-lint-intent-red-arms.md`](./2026-08-15-spec-lint-intent-red-arms.md) | Citation-intent tiers with relocation hints, and the declared red-contract grammar plus `--exec-red`. |
| [`2026-08-16-control-outline-surface-fills-design.md`](./2026-08-16-control-outline-surface-fills-design.md) | DESIGN §1.2a's control-outline predicate becomes fill-equals-container; 21 controls swap to `border-text-faint`, switch tracks stay out. |
| [`2026-08-16-orchestrator-pane-compaction-design.md`](./2026-08-16-orchestrator-pane-compaction-design.md) | `pnpm panes:compact` — an orchestrator classifies the panes under its purview by context pressure and arc position, then drives a probe-verified checkpoint-then-compact protocol. |
| [`2026-08-17-spec-lint-red-verdict-capability.md`](./2026-08-17-spec-lint-red-verdict-capability.md) | A `red=` must be CAPABLE of a verdict: `sh -nc` parse checks on every plan-kind invocation, and `vitest list` collection probes under `--exec-red`. |
| [`2026-08-18-planlint-fixture-satisfiability.md`](./2026-08-18-planlint-fixture-satisfiability.md) | A plan's embedded test block declares itself with ``<!-- fixture: why=`…` -->`` and `--exec-red` RUNS it: a stated premise that did not hold is reported, a block the report carries no test case for is surfaced, and nothing is ever certified. |
| [`2026-08-21-control-outline-forward-guard-design.md`](./2026-08-21-control-outline-forward-guard-design.md) | `BL-CONTROL-OUTLINE-FORWARD-GUARD`'s signal decision: rendered-signal rejected (fails open on an unmounted control), documented-limit close taken for measured paint, and a content-keyed reasons-required residue census ships, with the five closed escapes executed red as its acceptance floor. |
| [`2026-08-21-pane-compaction-send-authorization.md`](./2026-08-21-pane-compaction-send-authorization.md) | Unfences `--checkpoint`/`--compact`/`--resume`: one read-once pass per authorization (a literally atomic snapshot is unobtainable, and the spec says so), addressed payloads, the six probe chains as the acceptance floor. |
| [`2026-08-24-replacement-string-class-sweep.md`](./2026-08-24-replacement-string-class-sweep.md) | A repo-wide AST judge for `String.replace`'s second argument: a runtime value there is parsed as a substitution grammar, not inserted. 56 offender sites swept, the gate ships `fail`. |
| [`2026-08-25-review-modal-strip-dock.md`](./2026-08-25-review-modal-strip-dock.md) | Docks the review-modal StatusStrip to the panel bottom so the Published switch is reachable at 375x667, gives the refusal banner a measured upward arm, and closes `BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED` with the first real-surface number for that anchor. |
| [`2026-08-25-ui-polish-class-sweep-design.md`](./2026-08-25-ui-polish-class-sweep-design.md) | Eleven product-facing `BL-` rows, each blocked on a design decision nobody had taken. Takes all eleven decisions, ships the repairs, and states each choice so it can be overridden at review. Adds `--color-control-outline-tinted`; sweeps the alert-pill ladder and the marker-suppressing `<summary>` family. |
| [`2026-08-26-nearmiss-candidate-render.md`](./2026-08-26-nearmiss-candidate-render.md) | The near-miss detector computes the matched vocabulary label on all 65 live emissions and no surface reads it. Renders it as a detail band on the per-show card and a plain sibling line on wizard step 3, guarded so a warning without one shows no suggestion, and rewrites every catalog string that asserted a near-miss occurred. |
| [`2026-08-26-speclint-dispatch-gates-design.md`](./2026-08-26-speclint-dispatch-gates-design.md) | `codex-guard` refuses a spec/plan dispatch whose artifact carries hard `spec:lint` failures, and requires one to be named; the task-contract AC check gains the declared-but-unclaimed direction behind an opt-in `ac-declared` region, the corpus having ruled out every body grammar at 60 of 100 plans. |

## Conventions

- **Markdown is canonical** for any spec read by agents or implementers. HTML companions are for non-technical stakeholders only (per [`../../CLAUDE.md`](../../CLAUDE.md)) — never the source of truth.
- **Cite specs by `file:line`** in plans, handoffs, commits, and adversarial-review findings. The path stability of these spec files is what makes citation discipline work.
- **Adversarial-review logs** live in the corresponding plan's directory, not next to the spec. Specs are the contract; logs are execution history.
