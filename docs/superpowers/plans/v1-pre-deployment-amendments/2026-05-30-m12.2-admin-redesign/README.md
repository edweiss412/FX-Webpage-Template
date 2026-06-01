# M12.2 — Admin redesign (v1 pre-deployment amendment)

Pre-launch admin UI overhaul spawned by the M12 UX-validation walk's band-A findings. A full admin redesign was produced in Claude Design (all four admin surfaces, on the existing token system) and reconciled against the live codebase; owner decisions are in `.validation-local/design-admin/RECONCILIATION.md §E` (Opus-local, gitignored). Supersedes master spec §9.1/§9.2 on layout/chrome via the main plan's amendment ledger `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/00-overview.md` (the ledger stays with the main v1 plan it amends; this folder holds the workstream's specs/plans). **Amendment 10 (Phase A) is RATIFIED** (Phase A merged). **Amendment 11 (B1) is RATIFIED** (2026-05-31 — B1 spec adversarial review APPROVEd, Codex 27 rounds; owner signed off) — it supersedes master spec §9 on the B1 nav/chrome + settings-layout surfaces.

## Phases

| Phase | Scope | Spec | Plan | Status |
|---|---|---|---|---|
| **A** | Dashboard + per-show reskin (stat strip, shows table, needs-attention inbox, per-show two-col, status tokens, real Live-now, `<sheet-name>` fix) | `…/specs/v1-pre-deployment-amendments/2026-05-31-m12.2-phase-a-admin-dashboard-per-show-design.md` | `./M12.2-phase-a-admin-redesign.md` | ✅ **MERGED** to `main` 2026-06-01 (`b77d7c3`). Handoff: `./handoffs/`. |
| **B1** | Persistent nav shell + settings shell (read-only Drive-connection health panel + Administrators + revoke-hang fix + build-gated dev-tools row) + AlertBanner/NotifBell | `…/specs/v1-pre-deployment-amendments/2026-05-31-m12.2-phase-b1-admin-nav-settings-design.md` | `./M12.2-phase-b1-admin-nav-settings.md` ✅ APPROVED (Codex 13 rounds, 2026-06-01) | ✅ spec APPROVED (Codex 27 rounds + owner sign-off, 2026-05-31) |
| **B2** | Show lifecycle — archive/unarchive + auto-publish-clean-first-seen + unpublish/undo + spec §16 DEF-1/2/3 mutation guards | _(not yet specced)_ | — | planned |
| **B3** | Email-delivery notification subsystem + "Alert me about sync problems" toggle | _(not yet specced)_ | — | planned |

## Routing
UI is Opus-owned (UI hard rule). B1 is pure UI + reads → Opus. B2/B3 are split-routed (Opus UI + Codex backend). Cross-CLI use is limited to adversarial review.

## Notes
- `.validation-local/` (the design prototype + RECONCILIATION) is **non-authoritative provenance** and is unreadable by CI/Codex. Each phase spec is self-contained + authoritative; tracked reference screenshots live under `…/specs/v1-pre-deployment-amendments/assets/`.
- Deferrals: DEF-1/2/3 are logged in the main plan's `DEFERRED.md` (M12.2-A-DEF-1/2/3).
