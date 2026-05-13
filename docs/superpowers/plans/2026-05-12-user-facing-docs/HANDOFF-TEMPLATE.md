# M12 Handoff — Template

Copy this template to `handoffs/M12-help.md` (or per-session `handoffs/M12-help-<YYYY-MM-DD>.md` if execution spans multiple sessions) and fill in every section.

---

## §1 Session metadata

- **Session date(s):**
- **Implementer:** Opus / Claude Code (per AGENTS.md UI-always-Opus rule)
- **Reviewer:** Codex (cross-CLI per ROUTING.md)
- **Base branch:** main at commit `<SHA>`
- **Plan version:** `docs/superpowers/plans/2026-05-12-user-facing-docs/` r1 (commit `<SHA>`)
- **Spec version:** `docs/superpowers/specs/2026-05-12-user-facing-docs-design.md` r10 (commit `fc26d8b`)

---

## §2 Phases completed in this session

- [ ] Phase A — Foundation (01-foundation.md)
- [ ] Phase B — Catalog extension (02-catalog-extension.md)
- [ ] Phase C — Time utility (03-time-utility.md)
- [ ] Phase D — MDX components (04-components.md)
- [ ] Phase E — Content authoring (05-content.md)
- [ ] Phase F — Screenshot harness (06-screenshot-harness.md)
- [ ] Phase G — Affordance retrofit (07-affordance-retrofit.md)
- [ ] Phase H — Auth integration (08-auth-integration.md)
- [ ] Phase I — Close-out (09-close-out.md)

---

## §3 Spec sections in scope

List every spec §X reference touched in this session:

- §3.2 Pipeline choice — Phase A
- §3.4 Rendering posture & auth — Phase A
- §3.5 Auth gating — Phase A
- §3.6 Screenshot harness — Phase F
- §4 Content inventory — Phase E
- §5.1 MessageCatalogEntry schema extension — Phase B
- §5.2 Render-side gate — Phase G
- §5.6 Affordance matrix — Phase G
- §6 Components — Phase D
- §7 Tests — every phase
- §13 ACs — every phase

---

## §4 Acceptance criteria

| AC | Status | Notes |
| --- | --- | --- |
| AC-12.1 | PASS / DEFERRED / N/A | |
| AC-12.2 | | |
| AC-12.3 | | |
| ... (every AC-12.* through AC-12.39) | | |

---

## §5 Amendments in scope

**None for M12** at plan-write time. Any amendments ratified during execution land here per the project's existing amendment pattern (`docs/superpowers/specs/amendments/`).

---

## §6 Watchpoints (class-vectors carried forward)

Per AGENTS.md "Same-vector recurrence" rule, record any class-vector that surfaced during this session so the next milestone is pre-loaded:

- **Catalog drift** — master-spec §12.4 admin-log-only enumeration evolves; M12's `_metaCatalogAdminLogOnlyAlignment` test (#17) catches future drift, but downstream catalog adds need to flag admin-log-only entries explicitly.
- **Clock pipeline** — every new render-side `Date.now()`/`new Date()` must consume `lib/time/now.ts` or carry a per-line waiver. Test #16 grep guard catches additions; new screenshot manifest entries widen the scan.
- **Affordance retrofit** — every new `?` tooltip / "Take the tour" / "Learn more →" affordance in `/admin/*` MUST add a matrix row in the same PR. Test #13 reverse-direction check catches violations.

---

## §7 Test commands

```bash
# Unit + integration (vitest):
pnpm test

# E2E (Playwright):
pnpm test:e2e

# E2E — screenshots-help project only:
pnpm test:e2e --project screenshots-help

# Screenshot capture + drift check:
pnpm screenshot:help
git diff --exit-code public/help/screenshots/

# Typecheck:
pnpm typecheck

# Lint:
pnpm lint
```

Expected: all green at session close.

---

## §8 Convergence log (adversarial review)

| Round | Date | Verdict | Findings (sev, summary) | Resolution commit | Notes |
| --- | --- | --- | --- | --- | --- |
| R1 | | | | | |
| R2 | | | | | |
| ... | | | | | |
| Final | | APPROVE | — | — | M12 ships |

---

## §9 Impeccable findings + dispositions

Per Task I.1.

| Finding | Severity | File:line | Disposition | Commit |
| --- | --- | --- | --- | --- |
| | CRITICAL / HIGH / MEDIUM / LOW | | FIXED / DEFERRED (link to DEFERRED.md) | |

---

## §10 Performance & bundle impact

Capture baseline `pnpm build` artifact sizes before Phase A starts, then compare after Phase I close-out:

- `next build` bundle size delta:
- `pnpm install` size delta (new deps: `@next/mdx`, `@mdx-js/loader`, `@mdx-js/react`, `sharp`):
- Per-route static analysis if available:

---

## §11 Linked content deferred

Any content authored as a stub or explicitly deferred to a later milestone:

- Crew-facing pages (`/help/crew/*`) — phase 2; not in M12 scope per spec §1.1
- Other deferrals:

---

## §12 Sign-off

- [ ] Implementer (Opus / Claude Code): __ date __
- [ ] Reviewer (Codex cross-CLI): APPROVE on date __
- [ ] User review: __ date __

M12 marked **closed** in `ROUTING.md`.
