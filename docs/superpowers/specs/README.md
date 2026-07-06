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
| **Master spec** | [`2026-04-30-fxav-crew-pages-v1.md`](./2026-04-30-fxav-crew-pages-v1.md) | Core product spec. Three ratified body amendments in §13.2.3 (recovery contract, retention horizon, lease-holder protocol). 3769 lines. |
| **Amendment — M11** | [`v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.md`](./v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.md) | In-app `/help` wiki. Companion stakeholder HTML at [`2026-05-12-user-facing-docs-design.html`](./v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.html). |
| **Amendment — M11.5** | [`v1-pre-deployment-amendments/2026-05-23-crew-auth-pivot-show-link-picker.md`](./v1-pre-deployment-amendments/2026-05-23-crew-auth-pivot-show-link-picker.md) | Crew auth pivot — supersedes master §5.2 / §7.2 / §7.2.1 / §7.2.2 / §7.2.3 / §9.2 in full. The master spec's pre-amendment block remains as historical context. |
| **Amendment — M12** | [`v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md`](./v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md) | Solo-dev UX validation gate before launch. Includes M11.5 picker-pivot rebase (§15.26). |

## Master-spec patches

Live in [`master-spec-patches/`](./master-spec-patches/). These are surgical edits to the master spec body — sentence- or section-level fixes integrated by cross-reference rather than as standalone documents. Current entries:

- [`2026-05-12-catalog-agenda-codes.md`](./master-spec-patches/2026-05-12-catalog-agenda-codes.md)
- [`2026-05-14-admin-allowlist-runtime-mutable.md`](./master-spec-patches/2026-05-14-admin-allowlist-runtime-mutable.md)

Distinct from `v1-pre-deployment-amendments/`: those are full amendment-shaped specs (each has its own plan tree, AC table, adversarial-review log); the entries here patch existing master-spec content rather than standing alone. The earlier directory name was `amendments/` (renamed for clarity).

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

## Conventions

- **Markdown is canonical** for any spec read by agents or implementers. HTML companions are for non-technical stakeholders only (per [`../../CLAUDE.md`](../../CLAUDE.md)) — never the source of truth.
- **Cite specs by `file:line`** in plans, handoffs, commits, and adversarial-review findings. The path stability of these spec files is what makes citation discipline work.
- **Adversarial-review logs** live in the corresponding plan's directory, not next to the spec. Specs are the contract; logs are execution history.
