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

### Task 1: Emit-site change + discriminator + emit tests (RED → GREEN)

**Files:**
- Modify: `lib/sync/enrichAgenda.ts` (the `if (!link.fileId)` block ~`:137`)
- Modify: `lib/parser/index.ts` (share `HTTP_URL_PREFIX` — optional, see step 2)
- Modify: `tests/sync/enrichAgenda-telemetry.test.ts` (add the 4-case emit test)

**Interfaces produced:** the `warnings.push(warn("AGENDA_LINK_NOT_CLICKABLE", …))` entry on `result.warnings`.

- [ ] **Step 1 — write the emit test (RED).** In `tests/sync/enrichAgenda-telemetry.test.ts` (reuse its `capture()` log-sink + `makeResult`/`makeClient` helpers), add a `describe("AGENDA_LINK_NOT_CLICKABLE")` with 4 cases, asserting against the RETURNED `result.warnings` and the forensic sink:
  1. bare filename `makeResult([{ label: "Day 1 Agenda", url: "agenda_final.pdf" }])` → `result.warnings` has one `{ severity: "warn", code: "AGENDA_LINK_NOT_CLICKABLE" }` AND sink has `AGENDA_LINK_UNRESOLVED`.
  2. http URL `{ label: "Day 1 Agenda", url: "https://example.com/agenda" }` → `result.warnings` has NO `AGENDA_LINK_NOT_CLICKABLE` AND sink STILL has `AGENDA_LINK_UNRESOLVED`.
  3. uppercase scheme `{ label: "Day 1 Agenda", url: "HTTPS://example.com/agenda" }` → NO `AGENDA_LINK_NOT_CLICKABLE` AND sink has `AGENDA_LINK_UNRESOLVED`.
  4. undefined url `{ label: "Day 1 Agenda" }` → HAS `AGENDA_LINK_NOT_CLICKABLE` AND sink has `AGENDA_LINK_UNRESOLVED`.
  `enrichAgenda(makeResult(...)).warnings` is the assertion source (capture the returned ParseResult; the helper returns `result.warnings` initialized `[]`). Run `pnpm vitest run tests/sync/enrichAgenda-telemetry.test.ts` → the 4 new tests FAIL (code not emitted yet). Do NOT commit RED.
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
  Define `const HTTP_URL_PREFIX = /^https?:\/\//i;` (case-insensitive). Preferred: export it from a shared spot (e.g. `lib/parser/index.ts` or a small const module) and import in both `enrichAgenda` and `parseAgendaLinks` (`index.ts:303`, switching its `/^https?:\/\//` to the shared const is a behavior no-op). If sharing is awkward, define the identical case-insensitive literal locally in `enrichAgenda` with a comment citing `index.ts:303` as the classification source of truth. Do NOT touch the forensic `AGENDA_LINK_UNRESOLVED` (`:141-151`).
- [ ] **Step 3 — GREEN.** `pnpm vitest run tests/sync/enrichAgenda-telemetry.test.ts` → all pass (including the pre-existing `AGENDA_LINK_UNRESOLVED` test). This RED→GREEN is one unit; commit happens after the catalog lockstep (Task 2) so the branch is never red on the code side. (The emit test references the code literal which x1's orphan check requires in SPEC_CODES — landed in Task 2's same push.)
- [ ] **Step 4 — DEFER commit to Task 2** (the §12.4 lockstep + this emit change land together so the branch has no window where the code literal exists without its catalog entry, and vice versa). Proceed to Task 2 without committing.

---

### Task 2: §12.4 three-way lockstep + presence pin (ONE commit with Task 1)

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 table ~`:2897` + YAML appendix ~`:3214`)
- Regen: `lib/messages/__generated__/spec-codes.ts`, `lib/messages/__generated__/internal-code-enums.ts`
- Modify: `lib/messages/catalog.ts` (new row after `AGENDA_PDF_UNREADABLE` ~`:1246`)
- Modify: `tests/messages/agendaCodes.test.ts` (extend the `test.each` list)

- [ ] **Step 1 — §12.4 table row (by hand, NO prettier).** After the `AGENDA_SCHEDULE_TIME_ADJUSTED` row (~`:2900`), insert:
  ```
  | `AGENDA_LINK_NOT_CLICKABLE` | an agenda-link cell has no clickable target — a bare file name or descriptive text rather than a Drive file or an http(s) URL (scheme match is case-insensitive) | "The agenda link on _<sheet-name>_ isn't a link crew can open — it's a file name, note, or other text rather than a working web link or a Drive file. Update the cell to a working link (or a Drive file), or let us know if it keeps happening." | — | Doug → check agenda link |
  ```
- [ ] **Step 2 — YAML appendix entry (by hand).** After the `AGENDA_SCHEDULE_TIME_ADJUSTED:` YAML line (~`:3216`), add:
  ```
  AGENDA_LINK_NOT_CLICKABLE: "An agenda-link cell held text with no clickable target — a file name, note, or an unsupported link type instead of a working web link or Drive file — so there was nothing for crew to open. Replace it with a working link (or the Drive file) so crew can reach the agenda; if the cell already looks like a link and this keeps appearing, let us know and we'll take a look."
  ```
- [ ] **Step 3 — catalog row.** In `lib/messages/catalog.ts`, after the `AGENDA_PDF_UNREADABLE` row (`:1234-1246`), add (severity omitted, matching the template):
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
  The `dougFacing` must be BYTE-identical to the §12.4 table cell[2] (step 1) and `helpfulContext` byte-identical to the YAML appendix (step 2) — x1 deep-matches them.
- [ ] **Step 4 — regen.** `pnpm gen:spec-codes` → updates `lib/messages/__generated__/spec-codes.ts` (new `AGENDA_LINK_NOT_CLICKABLE` entry). `pnpm gen:internal-code-enums` → `internal-code-enums.ts` (expect NO delta; commit if any). If `gen:spec-codes` THROWS "missing YAML appendix entry", step 2 is wrong — fix and re-run.
- [ ] **Step 5 — extend the presence pin.** In `tests/messages/agendaCodes.test.ts`, add `"AGENDA_LINK_NOT_CLICKABLE"` to the `test.each([...])` list (`:14-18`).
- [ ] **Step 6 — run the §12.4 gates.** `pnpm test:audit:x1-catalog-parity` (key-parity + deep-match) → PASS. `pnpm test:audit:x2-no-raw-codes` → PASS. `pnpm vitest run tests/messages/agendaCodes.test.ts tests/messages/_metaErrorCatalogDocs.test.ts tests/help/errors-grouping.test.tsx` → PASS. `pnpm vitest run tests/sync/enrichAgenda-telemetry.test.ts` → PASS (orphan check now satisfied: the code literal resolves to a SPEC_CODES key).
- [ ] **Step 7 — commit (single, Task 1 + Task 2 together).** `git add -A && git commit --no-verify -m "feat(messages): AGENDA_LINK_NOT_CLICKABLE user-facing warning for non-clickable agenda links (§12.4 lockstep)"`

---

### Task 3: Full verification

- [ ] **Step 1 — typecheck.** `pnpm typecheck` → clean.
- [ ] **Step 2 — full suite.** `pnpm vitest run` → note any pre-existing env-bound failures vs merge-base (the live-project / auth-gate / pg-cron tests fail locally without validation creds — env, not this change); all catalog/code/agenda/help tests + enrichAgenda tests PASS.
- [ ] **Step 3 — format check.** `pnpm format:check` → clean (else `prettier --write` the changed NON-SPEC files, re-verify, commit `style(...)`). Never prettier the master spec.
- [ ] **Step 4 — spec traceability (if the repo has gen:traceability).** If a `gen:traceability` script exists and §12.4/AC edits require it, run + commit. (Check `package.json`; skip if absent.)

---

### Task 4: Whole-diff review + ship

- [ ] **Step 1 — whole-diff Codex adversarial-review to APPROVE.** Bounded prompt (inline the diff; ban repo-wide greps). Iterate to `===CDXV=== APPROVE`.
- [ ] **Step 2 — push + PR.** Confirm `pnpm typecheck` + `pnpm format:check` clean FIRST, then `git push -u origin fix/agenda-link-not-clickable`; `gh pr create`.
- [ ] **Step 3 — real CI green.** Monitor (count `bucket=="fail"`, emit on all terminal states); confirm `mergeStateStatus==CLEAN`. The x1-catalog-parity + x2-no-raw-codes jobs must be green.
- [ ] **Step 4 — merge + ff.** `gh pr merge --merge`; verify server-side merged; ff local main; `rev-list --left-right --count main...origin/main` == `0 0`; remove worktree + delete branch.

---

## Self-review checklist
- Spec coverage: §3 emit + discriminator → Task 1; §4 lockstep → Task 2 (one commit); §5 copy → Task 2 steps 1-3; §6 gates → Task 2 step 6 + Task 3; §7 tests → Task 1 step 1 (4 cases) + Task 2 step 5 (presence pin). ✓
- TDD: Task 1 emit test RED before impl; the code+catalog land in one commit so the branch never has the code literal without its SPEC_CODES entry (x1 orphan check) or vice versa. ✓
- §12.4 three-way in ONE commit (table + YAML + spec-codes.ts + catalog.ts). ✓
- Never prettier the master spec (§12.4 by hand). ✓
- Discriminator case-insensitive (`i` flag) + uppercase-scheme test. ✓
- Meta-test inventory: EXTENDS agendaCodes.test.ts + enrichAgenda-telemetry.test.ts. ✓
- No admin_alerts / route / _families edit (AGENDA prefix pre-exists). ✓
