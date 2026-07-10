# Step 1 "Share your show folder" — design mock snapshot

**Source:** claude.ai/design project `85fe76d1-46d4-46f6-9f2b-ba90968554c4`, file `Share folder screen.dc.html`, imported 2026-07-09 via the design MCP (`/design-login`).

`Share folder screen.dc.html` is the fetched artifact, **verbatim except one sanitization**: a personal email address that the design tool auto-populated into the mock's out-of-scope top-bar chrome was replaced with the neutral placeholder `you@example.com`, so no personal identifier persists in repo history. Everything in the step body is unmodified. Visual grounding for the redesign of `components/admin/wizard/Step1Share.tsx`. It renders as a full onboarding page (top bar, step indicator, sticky footer) because the design tool exports the whole screen; only the **step body** is in scope for this change (the chrome already exists in the shell and matches).

## Adopt LAYOUT, not copy

The mock's text is **not** authoritative — spec §9.0 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2535-2544`) is. Per plan-wide invariant 7 (spec is canonical), the implementation keeps spec-mandated copy where the mock drifts:

| Mock text | Ship (spec §9.0) | Why |
| --- | --- | --- |
| "Why this email?" disclosure summary | **"What's this email?"** | §9.0:2544 names the disclosure "What's this email?" |
| Reworded explainer body | The **live shipped body verbatim** (`Step1Share.tsx:186-190`) — unchanged text | §9.0-approved shipped copy; this redesign relocates/restyles the disclosure, it does not re-open the wording |

What the mock **does** contribute (and what we adopt): the two inline-nested disclosures, the orange underlined "Don't have a folder yet?" summary, the chevron-rotates-on-open affordance, and removal of the standalone bordered `<details>` boxes.

## Colors are illustrative

Every hex in the mock maps 1:1 to an existing `app/globals.css` `@theme` token (dark values). The implementation uses the tokens; no new token is introduced. See the spec's token-mapping table.
