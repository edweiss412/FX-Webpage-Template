# AGENDA_LINK_NOT_CLICKABLE — Implementation Plan

> **For agentic workers:** TDD per task (failing test → minimal impl → passing test → commit). Steps use `- [ ]`.

**Goal:** Add a user-facing §12.4 warning `AGENDA_LINK_NOT_CLICKABLE`, pushed to `result.warnings` only for a bare-filename / non-http agenda link; the forensic `AGENDA_LINK_UNRESOLVED` stays broad.

**Spec:** `docs/superpowers/specs/2026-07-03-agenda-link-not-clickable-design.md` (Codex-APPROVE'd, 2 rounds).

**Architecture:** One emit-site change in `enrichAgenda` guarded by a case-insensitive http-scheme discriminator, plus the §12.4 three-way lockstep (spec prose + regen'd spec-codes.ts + catalog.ts, one commit) + a presence-pin extension.

## Global Constraints
- New Doug-facing §12.4 code → **three-way lockstep in ONE commit**: master-spec §12.4 table row + YAML appendix, regen'd `lib/messages/__generated__/spec-codes.ts` (`pnpm gen:spec-codes`), and `lib/messages/catalog.ts` row. x1-catalog-parity enforces the match.
- Discriminator regex is case-**insensitive**: `HTTP_URL_PREFIX = /^https?:\/\//i`.
- Copy is single-sourced (spec §5): the dougFacing string is identical in the §12.4 table and catalog; helpfulContext identical in the YAML appendix and catalog.
- **Never `prettier --write` the master spec** (mangles §12.4 cells → x1 divergence). Edit §12.4 by hand.
- Commits: `--no-verify`, conventional-commits. **Before push: `pnpm typecheck` AND `pnpm format:check`** (`--no-verify` bypasses the prettier hook).
- Local Supabase up (not needed — enrichAgenda tests use `setLogSink` + fixture clients, no DB).

---

### Task 1: AGENDA_LINK_NOT_CLICKABLE — emit change + §12.4 lockstep + presence pin (ONE task, ONE commit)

This is ONE atomic unit of work (per AGENTS.md invariants 1 + 6 "commit per task / don't batch tasks"): the enrichAgenda code literal `"AGENDA_LINK_NOT_CLICKABLE"` and its `SPEC_CODES`/catalog entry MUST land in the same commit — x1's orphan check (`codes.test.ts:122-126`) fails if the literal exists without a SPEC_CODES key, and x1 key-parity fails if the catalog/spec-codes entry exists without... so emit + lockstep are inseparable → one task → one commit.

**Files:**
- Modify: `lib/sync/enrichAgenda.ts` (`if (!link.fileId)` block ~`:137`); `lib/parser/index.ts` (share `HTTP_URL_PREFIX`)
- Modify: `tests/sync/enrichAgenda-telemetry.test.ts` (4-case emit test); `tests/messages/agendaCodes.test.ts` (presence pin)
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 table + YAML appendix)
- Regen: `lib/messages/__generated__/spec-codes.ts`, `lib/messages/__generated__/internal-code-enums.ts`
- Modify: `lib/messages/catalog.ts`

- [ ] **Step 1 — write the emit test (RED).** In `tests/sync/enrichAgenda-telemetry.test.ts` (reuse its `capture()` log-sink + `makeResult`/`makeClient` helpers), add `describe("AGENDA_LINK_NOT_CLICKABLE")` with 4 cases, asserting against the RETURNED `result.warnings` and the forensic sink:
  1. bare filename `makeResult([{ label: "Day 1 Agenda", url: "agenda_final.pdf" }])` → `result.warnings` has one `{ severity: "warn", code: "AGENDA_LINK_NOT_CLICKABLE" }` AND sink has `AGENDA_LINK_UNRESOLVED`.
  2. http URL `{ label: "Day 1 Agenda", url: "https://example.com/agenda" }` → `result.warnings` has NO `AGENDA_LINK_NOT_CLICKABLE` AND sink STILL has `AGENDA_LINK_UNRESOLVED`.
  3. uppercase scheme `{ label: "Day 1 Agenda", url: "HTTPS://example.com/agenda" }` → NO `AGENDA_LINK_NOT_CLICKABLE` AND sink has `AGENDA_LINK_UNRESOLVED`.
  4. undefined url `{ label: "Day 1 Agenda" }` → HAS `AGENDA_LINK_NOT_CLICKABLE` AND sink has `AGENDA_LINK_UNRESOLVED`.
  `enrichAgenda(makeResult(...))` returns the ParseResult; assert its `.warnings`. Run `pnpm vitest run tests/sync/enrichAgenda-telemetry.test.ts` → the **bare-filename (1) and undefined-url (4) cases FAIL** (they expect the not-yet-emitted `AGENDA_LINK_NOT_CLICKABLE`); the http (2) and uppercase (3) negative cases pass trivially (the code isn't emitted yet, forensic already fires). The new `describe` block is RED overall. Do NOT commit.
- [ ] **Step 2 — implement the discriminator + push.** In `lib/sync/enrichAgenda.ts`, inside the `if (!link.fileId)` block (~`:137`), before the existing `continue` (~`:152`) and outside the forensic try/catch, add:
  ```ts
  const hasClickableTarget = typeof link.url === "string" && HTTP_URL_PREFIX.test(link.url);
  if (!hasClickableTarget) {
    warnings.push(
      warn(
        "AGENDA_LINK_NOT_CLICKABLE",
        `The agenda link "${link.label}" isn't a link crew can open, so they can't reach the agenda.`,
      ),
    );
  }
  ```
  Define `const HTTP_URL_PREFIX = /^https?:\/\//i;` (case-insensitive). Preferred: export it from a shared spot (e.g. `lib/parser/index.ts` or a small const module) and import in both `enrichAgenda` and `parseAgendaLinks` (`index.ts:303`, switching its `/^https?:\/\//` to the shared const is a behavior no-op). If sharing is awkward, define the identical case-insensitive literal locally in `enrichAgenda` with a comment citing `index.ts:303`. Do NOT touch the forensic `AGENDA_LINK_UNRESOLVED` (`:141-151`).
- [ ] **Step 3 — emit test GREEN.** `pnpm vitest run tests/sync/enrichAgenda-telemetry.test.ts` → all pass (incl. the pre-existing `AGENDA_LINK_UNRESOLVED` test). (x1 orphan check is satisfied once the §12.4/catalog entries land in steps 4-7 of THIS commit.)
- [ ] **Step 4 — §12.4 table row (by hand, NO prettier).** In `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`, after the `AGENDA_SCHEDULE_TIME_ADJUSTED` row (~`:2900`, keeping the AGENDA codes grouped as the last of that cluster), insert:
  ```
  | `AGENDA_LINK_NOT_CLICKABLE` | an agenda-link cell has no clickable target — a bare file name or descriptive text rather than a Drive file or an http(s) URL (scheme match is case-insensitive) | "The agenda link on _<sheet-name>_ isn't a link crew can open — it's a file name, note, or other text rather than a working web link or a Drive file. Update the cell to a working link (or a Drive file), or let us know if it keeps happening." | — | Doug → check agenda link |
  ```
- [ ] **Step 5 — YAML appendix entry (by hand).** After the `AGENDA_SCHEDULE_TIME_ADJUSTED:` YAML line (~`:3216`), add:
  ```
  AGENDA_LINK_NOT_CLICKABLE: "An agenda-link cell held text with no clickable target — a file name, note, or an unsupported link type instead of a working web link or Drive file — so there was nothing for crew to open. Replace it with a working link (or the Drive file) so crew can reach the agenda; if the cell already looks like a link and this keeps appearing, let us know and we'll take a look."
  ```
- [ ] **Step 6 — catalog row.** In `lib/messages/catalog.ts`, after the `AGENDA_PDF_UNREADABLE` row (`:1234-1246`), add (severity omitted, matching the template):
  ```ts
  AGENDA_LINK_NOT_CLICKABLE: {
    code: "AGENDA_LINK_NOT_CLICKABLE",
    dougFacing:
      "The agenda link on _<sheet-name>_ isn't a link crew can open — it's a file name, note, or other text rather than a working web link or a Drive file. Update the cell to a working link (or a Drive file), or let us know if it keeps happening.",
    crewFacing: null,
    followUp: "Doug → check agenda link",
    helpfulContext:
      "An agenda-link cell held text with no clickable target — a file name, note, or an unsupported link type instead of a working web link or Drive file — so there was nothing for crew to open. Replace it with a working link (or the Drive file) so crew can reach the agenda; if the cell already looks like a link and this keeps appearing, let us know and we'll take a look.",
    title: "Agenda link isn't clickable",
    longExplanation:
      "An agenda-link cell held text with no clickable target — a file name, note, or unsupported link type rather than a working web link or Drive file — so crew had nothing to open. Update it to a working link or the Drive file; if it already looks right and this persists, let us know and we'll take a look.",
    helpHref: "/help/errors#AGENDA_LINK_NOT_CLICKABLE",
  },
  ```
  The `dougFacing` must be BYTE-identical to the §12.4 table cell[2] (step 4) and `helpfulContext` byte-identical to the YAML appendix (step 5) — x1 deep-matches them.
- [ ] **Step 7 — regen.** `pnpm gen:spec-codes` → updates `lib/messages/__generated__/spec-codes.ts` (new `AGENDA_LINK_NOT_CLICKABLE` entry). `pnpm gen:internal-code-enums` → `internal-code-enums.ts` (expect NO delta; commit if any). If `gen:spec-codes` THROWS "missing YAML appendix entry", step 5 is wrong — fix and re-run.
- [ ] **Step 8 — extend the presence pin.** In `tests/messages/agendaCodes.test.ts`, add `"AGENDA_LINK_NOT_CLICKABLE"` to the `test.each([...])` list (`:14-18`).
- [ ] **Step 9 — run the §12.4 gates.** `pnpm test:audit:x1-catalog-parity` (key-parity + deep-match) → PASS. `pnpm test:audit:x2-no-raw-codes` → PASS. `pnpm vitest run tests/messages/agendaCodes.test.ts tests/messages/_metaErrorCatalogDocs.test.ts tests/help/errors-grouping.test.tsx` → PASS. `pnpm vitest run tests/sync/enrichAgenda-telemetry.test.ts` → PASS (orphan check now satisfied: the code literal resolves to a SPEC_CODES key).
- [ ] **Step 10 — commit (ONE commit for the whole atomic task).** `git add -A && git commit --no-verify -m "feat(messages): AGENDA_LINK_NOT_CLICKABLE user-facing warning for non-clickable agenda links (§12.4 lockstep)"`

---

### Task 2: Full verification

- [ ] **Step 1 — typecheck (triggers the `pretypecheck` gen hooks).** `pnpm typecheck`. `pretypecheck` auto-runs `gen:admin-tables` + `gen:watermark-symbols` + `gen:email-boundaries` + `gen:traceability`. Typecheck itself must be clean.
- [ ] **Step 2 — generated-file drift check (CRITICAL).** After step 1's pre-hooks fire, run `git status`. Adding a §12.4 code row keys on none of those generators (traceability keys on AC-IDs/§sections, not §12.4 code rows), so expect **NO** drift in `**/__generated__/**` or traceability output. If any generated file IS dirty, the committed copy is stale → `test:audit:traceability` (and siblings) would fail CI: commit the regenerated file(s) (`chore(gen): regenerate <file> for AGENDA_LINK_NOT_CLICKABLE`). Do NOT leave a dirty generated file.
- [ ] **Step 3 — full suite.** `pnpm vitest run` → note any pre-existing env-bound failures vs merge-base (the live-project / auth-gate / pg-cron tests fail locally without validation creds — env, not this change); all catalog/code/agenda/help tests + enrichAgenda tests PASS.
- [ ] **Step 4 — format check.** `pnpm format:check` → clean (else `prettier --write` the changed NON-SPEC files, re-verify, commit `style(...)`). Never prettier the master spec.

---

### Task 3: Whole-diff review + ship

- [ ] **Step 1 — whole-diff Codex adversarial-review to APPROVE.** Bounded prompt (inline the diff; ban repo-wide greps). Iterate to `===CDXV=== APPROVE`.
- [ ] **Step 2 — push + PR.** Confirm `pnpm typecheck` + `pnpm format:check` clean FIRST, then `git push -u origin fix/agenda-link-not-clickable`; `gh pr create`.
- [ ] **Step 3 — real CI green.** Monitor (count `bucket=="fail"`, emit on all terminal states); confirm `mergeStateStatus==CLEAN`. The x1-catalog-parity + x2-no-raw-codes jobs must be green.
- [ ] **Step 4 — merge + ff.** `gh pr merge --merge`; verify server-side merged; ff local main; `rev-list --left-right --count main...origin/main` == `0 0`; remove worktree + delete branch.

---

## Self-review checklist
- Spec coverage: §3 emit + discriminator → Task 1 steps 1-3; §4 lockstep → Task 1 steps 4-7 (ONE commit); §5 copy → Task 1 steps 4-6; §6 gates → Task 1 step 9 + Task 2; §7 tests → Task 1 step 1 (4 cases) + step 8 (presence pin). ✓
- TDD + commit-per-task (invariants 1+6): the emit change + §12.4 lockstep are ONE atomic task = ONE commit (the code literal and its SPEC_CODES/catalog entry are inseparable per x1's orphan check). Emit test RED (bare + undefined cases) before impl; the whole task lands GREEN in one commit. ✓
- §12.4 three-way in ONE commit (table + YAML + spec-codes.ts + catalog.ts). ✓
- Never prettier the master spec (§12.4 by hand). ✓
- Discriminator case-insensitive (`i` flag) + uppercase-scheme test. ✓
- Meta-test inventory: EXTENDS agendaCodes.test.ts + enrichAgenda-telemetry.test.ts. ✓
- No admin_alerts / route / _families edit (AGENDA prefix pre-exists). ✓
