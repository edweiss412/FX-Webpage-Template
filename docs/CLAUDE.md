# docs/ — format conventions

Scope: this file governs format choices for artifacts under `docs/`. It does not change any rule in the root `AGENTS.md` / `CLAUDE.md`.

## Markdown is canonical for agent-consumed artifacts

Anything an agent or a skilled human implementer reads to do work stays in markdown. Specifically:

- `docs/superpowers/specs/**` — specs reviewed and implemented by agents
- `docs/superpowers/plans/**` — milestone plans, task checklists, handoff docs
- Onboarding docs, watchpoints, routing tables, retrospectives, and any other text that downstream tooling (Codex, subagents, `superpowers:*` skills, `/codex:*` slash commands) parses or greps

Reason: these artifacts live in git, get diffed across review rounds, are loaded into agent context by name, and are cited by `file:line`. Markdown's grep-ability, low-noise diffs, and predictable structure are load-bearing for the review loop. HTML diffs are noisy and break that loop (see "version control" Q in the source post).

**Do not** re-render an existing markdown spec/plan as HTML. **Do not** maintain parallel HTML+markdown copies of the same artifact. The markdown file remains the single source of truth.

## HTML is an additional tool for human-facing communication

HTML is acceptable — and encouraged — and assumes the primary reader is a non-technical human (stakeholder, client, layperson, exec, designer reviewing a concept without touching code). It is an *addition* to the toolset, not a substitute for markdown.

Good fits for HTML in this repo:

- **Stakeholder-facing summaries** of what a milestone shipped, where a markdown handoff doc would be too dense
- **Visual explainers** of how a feature works (crew page flow, ingestion pipeline, auth sequence) — diagrams in SVG, color-coded states, annotated screenshots
- **Design exploration & comparison** — multiple variants side-by-side in a grid for a non-engineer reviewer
- **Reports for the project sponsor** (e.g., Doug Larson) — readable on phone, shareable as a single file, no markdown renderer required
- **Custom one-off editing interfaces** — throwaway HTML tools with sliders/forms/drag-and-drop that export structured data back as a paste-able prompt or JSON

These HTML artifacts are *net-new content* aimed at a different audience than the canonical markdown — not translations of it.

## Location & naming

- Put human-facing HTML under `docs/<topic>/` alongside any related markdown, or under a dedicated `docs/share/` if it's a polished deliverable meant to be uploaded/linked
- Name files for the audience and purpose, not the source markdown they relate to. `m8-report-pipeline-explainer.html` is good; `M8-PLAN.html` mirroring `M8-PLAN.md` is the anti-pattern this convention forbids
- A single self-contained file (inline CSS, inline SVG, no external deps) is preferred for shareability

## Use `impeccable` when authoring these HTML pages

HTML pages aimed at non-technical humans are UI surfaces. They get the same quality bar as the product UI:

- Run `/impeccable critique` and `/impeccable audit` on any non-trivial HTML deliverable in `docs/` before considering it shareable
- Follow the standard preflight gates (PRODUCT.md, DESIGN.md, the project's design tokens) so the doc reads as part of the FXAV crew-pages product family, not a generic Claude-default aesthetic
- HIGH/CRITICAL findings get fixed or explicitly deferred; this is the same dual-gate posture as invariant 8 in `AGENTS.md`, applied to docs

These HTML files are not gated by milestone close-out the way product UI is — but if you're going to send one to a stakeholder, run the gates first.

## What stays out of HTML

- Anything an agent needs to parse, grep, cite by `file:line`, or diff across review rounds
- Plan task checklists (subagents check off TDD steps in the markdown)
- Spec amendments, watchpoints, handoff §-numbered sections referenced by routing docs
- Any artifact where two-way edits between agent and human are expected — markdown wins on agent-edit friction

When in doubt: if a future Codex or Claude session will need to read this to do work, it's markdown. If a human will read it once to understand or decide, HTML is on the table.
