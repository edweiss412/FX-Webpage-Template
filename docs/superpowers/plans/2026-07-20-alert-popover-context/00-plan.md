# Alert Popover Context Copy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author `helpfulContext` popover copy for the 45 admin alert codes that currently show the useless "More about this alert in the help pages." lead-in, and add a fails-by-default coverage gate so a new help-linked code without popover copy fails CI.

**Architecture:** Pure catalog-copy + one structural coverage gate built as a pure function (`checkPopoverContextCoverage`) proven by synthetic-input unit tests and applied to the live catalog. No component, DB, migration, advisory-lock, or render-path change. `helpfulContext` is already read by `buildHelpPopoverBody` (`components/admin/compactAlertHelp.tsx`) and already classified `rendered-prose` in the hygiene gate. `helpfulContext` is under the §12.4 catalog-parity contract, so each string lands as a lockstep triple (master-spec appendix + `gen:spec-codes` regen + catalog).

**Tech Stack:** TypeScript (strict: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest (`parallel` no-DB project auto-discovers `tests/messages/**`).

**Spec:** `docs/superpowers/specs/2026-07-20-alert-popover-context-design.md` (APPROVED, Codex R2). Copy is inlined below verbatim (source of truth: spec §3.2/§3.3).

## Global Constraints

- **§12.4 lockstep (spec §7.5):** every `helpfulContext` value change = master-spec appendix line (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3108-3325`) + `pnpm gen:spec-codes` regen of `lib/messages/__generated__/spec-codes.ts` + `lib/messages/catalog.ts` row, ALL in ONE commit (Task 1's commit). AC-X.1 (`tests/cross-cutting/codes.test.ts`) blocks merge otherwise. Never `prettier` the master spec. No later task may split this triple across commits — a parity-affecting fix AMENDS the Task 1 commit.
- **Copy hygiene:** no em-dash/en-dash, straight apostrophes/quotes, no markdown asterisks, ≤240 chars. Enforced by `tests/messages/_metaCatalogCopyHygiene.test.ts` (`helpfulContext` = `rendered-prose`).
- **Frozen-oracle discipline:** the catalog IS the subject under test, so expected strings are hardcoded in the copy test (inverting derive-never-hardcode), matching `_metaShowScopedTemplates` `PAIRED`.
- **`longExplanation` untouched.** Only `helpfulContext` changes.
- **Worktree-only, commit per task, `--no-verify` (autonomous run).**

---

### Task 1: Author the 45 `helpfulContext` strings (copy + §12.4 lockstep)

**Files:**
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Create: `tests/messages/popoverContextCopy.test.ts`
- Modify: `lib/messages/catalog.ts` (45 `helpfulContext: null` → authored string, block-scoped)
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (45 appendix lines, YAML fence 3108-3325)
- Modify (generated): `lib/messages/__generated__/spec-codes.ts` (via `pnpm gen:spec-codes`)

**Interfaces:**
- Consumes: `MESSAGE_CATALOG` (`lib/messages/catalog.ts`).
- Produces: 45 non-null `helpfulContext` values; a frozen `FROZEN` oracle of exactly 45 code→string pairs (all inlined below).

- [ ] **Step 1: Write the failing frozen-oracle copy test (with 45-closure).**

<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
Create `tests/messages/popoverContextCopy.test.ts` VERBATIM (all 45 pairs inlined; do not paraphrase):

```ts
/**
 * tests/messages/popoverContextCopy.test.ts
 * (spec 2026-07-20-alert-popover-context-design §6)
 * Frozen-literal oracle for the 45 authored popover helpfulContext strings.
 */
import { describe, it, expect } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

const FROZEN: Record<string, string> = {
  AMBIGUOUS_EMAIL_BINDING: "Usually a recent typo or paste dropped the same address into two email cells. Once you correct it, the next sync clears this on its own; you can also mark it resolved right away.",
  DRIVE_FETCH_FAILED: "Crew keep seeing the last synced version while this retries on its own. If it lasts over an hour, confirm the folder is still shared with FXAV and that the sheet hasn't been moved out of it.",
  SHEET_UNAVAILABLE: "Until the sheet is back in the watched folder, crew keep the last good version on file. Move or re-share it into the folder and the next sync brings the show back automatically.",
  PARSE_ERROR_LAST_GOOD: "The parse panel shows the exact line that failed to read. Fix it in the sheet and the next sync replaces the older version crew currently see; nothing else to do.",
  RESYNC_SHRINK_HELD: "The update was held so a bad edit can't silently wipe crew or a section. If the drop was intentional, re-sync to apply it; if not, fix the sheet and a clean sync clears this.",
  RESYNC_QUALITY_REGRESSED: "Fewer fields or sections came through than last time, so parts of the page thinned out even though the sync went through. The parse panel flags what dropped; fix the sheet and a clean sync restores it.",
  WIZARD_SESSION_SUPERSEDED_RACE: "Two wizard tabs for the same sheet overlapped; the newer one won and the older tab's action was cancelled before it could touch state. Its leftovers are inert and auto-cleaned. Informational only.",
  WATCH_CHANNEL_ORPHANED: "At worst, edits take a few minutes to appear instead of instantly, since the scheduled sync still runs. It reconnects on its own each hour, or use Retry now. Only worth attention if it keeps failing.",
  WEBHOOK_TOKEN_INVALID: "The bad token usually means a stale Drive subscription is still firing, occasionally a spoof attempt. The developer is notified and rotates it if needed; no admin action.",
  REEL_DRIFTED: "The video changed after you last reviewed the show, so crew see the text status without it. Any save to the sheet picks up the current reel on the next sync.",
  OPENING_REEL_NOT_VIDEO: "A Doc, image, or PDF can't play inline, so crew see the text status only. Point the opening-reel cell at an actual video file to turn playback back on.",
  OPENING_REEL_PERMISSION_DENIED: "The video's sharing changed or it moved somewhere FXAV can't read, so crew see the text status only. Re-share it with FXAV, or swap in a video you do share, to restore playback.",
  EMBEDDED_RECOVERY_REQUIRES_RESTAGE: "Crew see a placeholder because this diagram can't be recovered on its own. Save the sheet (any edit counts) and the next sync restores the image.",
  ASSET_RECOVERY_REVISION_DRIFT: "Recovery verified bytes against an older snapshot but a newer Apply landed first, so it aborted rather than attach stale assets to the current revision. The next run retries against the latest automatically.",
  ASSET_RECOVERY_DRIFT_COOLDOWN: "The prior attempt raced an Apply, so recovery backs off for this snapshot to bound retry storms while the show keeps changing. It resumes on its own after the cooldown.",
  ASSET_RECOVERY_BYTES_EXCEEDED: "The cap keeps one big gallery from blocking other shows' syncs. Crew see placeholders for the missing diagrams; trim the set under the limit, or ask the developer to raise the ceiling if this show genuinely needs it.",
  ROLE_FLAGS_NOTICE: "This fires only for LEAD or FINANCIALS, the roles that unlock internal financials and admin access, and every change is logged. Nothing to do unless it was a mistake; if so, correct it in the sheet or role mapping.",
  SHOW_FIRST_PUBLISHED: "It auto-published because the sheet came through clean. If it's the wrong sheet or bad timing, flip Published off on the show's page; crew lose access until you turn it back on, and the same link works again when you do.",
  SHOW_UNPUBLISHED: "Nothing was deleted and the sheet keeps syncing in the background, so republishing from the show's page brings the same link back exactly as it was.",
  LIVE_ROW_CONFLICT: "Setup stepped aside so it wouldn't clobber the live version already in flight. Apply or Discard that row from the dashboard, then re-run setup if you still need to.",
  ONBOARDING_SHEET_UNREADABLE: "These files never reach any crew page, so nothing is exposed. The usual cause is a missing or renamed section header; fix or remove them in Drive and the next sync clears this, or dismiss it now if they're meant to be skipped.",
  PENDING_SNAPSHOT_PROMOTE_STUCK: "It's stuck in the non-reclaimable promote-started state, so cleanup can't reclaim the prefix. The snapshot-promote repair tool reconciles the temp and canonical prefixes to finish it.",
  PENDING_SNAPSHOT_ROLLBACK_STUCK: "Assets are split across the temp and canonical prefixes after a half-finished rollback. The snapshot-rollback repair tool reconciles both and completes it so cleanup can continue.",
  BRANCH_PROTECTION_DRIFT: "Something drifted: a required check, a review requirement, admin enforcement, or a push or deletion restriction. Restore the settings so no PR can merge without the full audit suite.",
  BRANCH_PROTECTION_MONITOR_AUTH_FAILED: "Without auth the monitor can't prove the merge gate is still enforced, so drift would go unseen. Rotate the GitHub App token or fallback PAT within 24 hours and confirm the job succeeds.",
  SYNC_STALLED: "Already-published pages stay up; only new edits are waiting. It usually recovers on its own, but if it sticks the Drive connection may have lapsed, so re-run setup or check the connection.",
  EMAIL_DELIVERY_FAILED: "Retries continue on their own. A persistent failure usually points at the provider API key or the verified sending domain in settings.",
  EMAIL_NOT_CONFIGURED: "Email needs three settings before anything sends: provider API key, verified sending address, and the public site URL for links. Dashboard alerts and each show's Publish toggle keep working without it.",
  TILE_SERVER_RENDER_FAILED: "Only that one section crashed; the rest of the page rendered. It keeps retrying, so a refresh usually clears it. If it recurs, use Report so the developer gets the stack.",
  TILE_PROJECTION_FETCH_FAILED: "The failed data sources are listed in the alert detail; their sections fell back while the rest loaded. A refresh usually clears it; use Report if it keeps happening.",
  REPORT_ORPHANED_LOST_LEASE: "Two retries of the same report both created a GitHub issue in a lease race, so the duplicate was auto-closed. Click through to confirm; if it recurs, the lease window needs widening.",
  GITHUB_BOT_LOGIN_MISSING: "Recovery needs the bot's GitHub username to find issues from earlier attempts. Set GITHUB_BOT_LOGIN to that username and redeploy to restore full recovery coverage.",
  REPORT_LEASE_THRASHING: "Too many retries fire inside the lease window, usually because it's shorter than GitHub's current response time. Widening the lease window settles it.",
  EMBEDDED_ASSET_DRIFTED: "Crew keep the last good image and see a placeholder only for the one that changed. Save the sheet again to pick up the new version.",
  PENDING_SNAPSHOT_DELETE_STUCK: "A row marked for deletion never had its storage prefix reclaimed. Crew pages are unaffected; this is storage hygiene only. Reconcile and reclaim the prefix to clear it.",
  REPORT_DUPLICATE_LIVE_MATCHES: "More than one live issue carries the same report marker, so recovery fails closed instead of guessing a winner. Review the duplicates and close all but one to resume it.",
  REPORT_LOOKUP_INCONCLUSIVE: "Recovery couldn't reliably list recent issues for this report, so it refused to risk a duplicate. Usually a transient GitHub API blip that clears on the next retry.",
  REPORT_OPEN_ORPHAN_LABEL: "Orphan cleanup only labels closed 'not planned' issues, so an open one means it was reopened or GitHub returned an odd state. Re-close the issue or remove the label.",
  STALE_ORPHAN_REPORT: "The reservation aged past the 24-hour recovery horizon with an expired lease and was reaped before an issue existed. Repeats would point at a stuck submit path worth a look.",
  PICKER_EPOCH_RESET: "The share link itself didn't change, so crew just pick their name again on the next visit, and any open tabs re-prompt on refresh. Nothing to fix; this is a record of the reset.",
  PICKER_SELECTION_RACE: "A browser cleaned up a picker cookie whose epoch or crew member no longer matches the show, typically after a reset or roster change. Compare-and-delete touched only that stale entry. No action.",
  PICKER_BOOTSTRAP_RPC_FAILED: "The route had a valid Google session but the identity claim errored, so it returned a clean retry page instead of a redirect loop. Repeats on one show may point at a claim-path problem.",
  PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED: "It failed before any signed-in identity existed, so the alert carries no email or share token by design. The visitor saw a retry page and can open the link again.",
  OAUTH_IDENTITY_CLAIMED: "From now on that row skips the picker and goes straight through Google sign-in. Routine success record; no action needed.",
  CALLBACK_CLAIM_THREW: "The callback never mints picker cookies, so nothing is left half-claimed. Picker bootstrap retries the claim automatically on the visitor's next show visit.",
};

describe("popover helpfulContext copy (frozen oracle)", () => {
  it("the oracle is closed over exactly the 45 authored codes", () => {
    expect(Object.keys(FROZEN).length).toBe(45);
  });
  for (const [code, expected] of Object.entries(FROZEN)) {
    it(`${code} carries the authored popover copy`, () => {
      const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG];
      expect(entry, `${code} missing from catalog`).toBeDefined();
      expect(entry.helpfulContext).toBe(expected);
    });
  }
});
```

- [ ] **Step 2: Run — verify RED.** `pnpm vitest run tests/messages/popoverContextCopy.test.ts` → 45 failures (`helpfulContext` is null; the count assertion passes).

- [ ] **Step 3: Set catalog `helpfulContext` for the 45 (block-scoped).** For each of the 45 codes, within that code's object in `lib/messages/catalog.ts`, replace the single `helpfulContext: null,` line with two lines: `helpfulContext:` then `      "<value>",` where `<value>` is that code's exact string from the Step 1 `FROZEN` map (all 45 code→string pairs are listed verbatim in Step 1; this step introduces no new copy). Each code has EXACTLY one in-block `helpfulContext: null,` (verified), so a block-scoped transform is safe and a global sed is not. Reference transform — `AUTH` is the Step 1 `FROZEN` object pasted in as a Python dict (no external file); it parses the file into per-code blocks, replaces exactly one in-block occurrence per code, and aborts unless all 45 match:

```python
import re, sys
CAT='lib/messages/catalog.ts'
AUTH = {  # the Step 1 FROZEN object, verbatim (same 45 code -> string pairs); NOT an external file
    # "AMBIGUOUS_EMAIL_BINDING": "Usually a recent typo or paste dropped ...",
    # ... paste all 45 pairs from Step 1's FROZEN here ...
}
def esc(s): return s.replace('\\','\\\\').replace('"','\\"')
src=open(CAT).read()
parts=re.split(r'(\n  [A-Z][A-Z0-9_]+: \{)', src)
out=[parts[0]]; replaced=0; i=1
while i<len(parts):
    delim=parts[i]; body=parts[i+1] if i+1<len(parts) else ''
    name=re.match(r'\n  ([A-Z][A-Z0-9_]+): \{', delim).group(1)
    if name in AUTH:
        end=body.find('\n  },'); head=body if end==-1 else body[:end]; tail='' if end==-1 else body[end:]
        head,n=re.subn(r'\n    helpfulContext: null,', '\n    helpfulContext:\n      "%s",'%esc(AUTH[name]), head, count=1)
        if n!=1: sys.exit(f'ABORT {name} n={n}')
        replaced+=1; body=head+tail
    out.append(delim); out.append(body); i+=2
assert replaced==len(AUTH), replaced
open(CAT,'w').write(''.join(out))
```

- [ ] **Step 4: Add the 45 appendix lines to the master spec.** For each of the 45 codes, insert a line `<CODE>: "<value>"` (where `<value>` is the same Step 1 `FROZEN` string, byte-identical to the catalog value just written) into the YAML fence at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (before the closing ``` at line 3325). The strings carry apostrophes but no double-quotes, so no YAML escaping is needed. Do not reformat anything else in that file.

- [ ] **Step 5: Regenerate spec-codes.** `pnpm gen:spec-codes` → updates `lib/messages/__generated__/spec-codes.ts`.

- [ ] **Step 6: Run copy + parity + hygiene — verify GREEN.**

```
pnpm vitest run tests/messages/popoverContextCopy.test.ts \
  tests/cross-cutting/codes.test.ts \
  tests/cross-cutting/extract-spec-codes.test.ts \
  tests/messages/_metaCatalogCopyHygiene.test.ts
```
Expected: PASS (copy matches; catalog↔§12.4 parity holds; hygiene clean).

- [ ] **Step 7: Commit the ENTIRE lockstep triple + copy test in ONE commit.**

```bash
git add tests/messages/popoverContextCopy.test.ts lib/messages/catalog.ts \
  docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/__generated__/spec-codes.ts
git commit --no-verify -m "feat(messages): author helpfulContext popover copy for 45 alert codes"
```
If a later verification (Task 3) reveals the generated file or appendix is stale, `git commit --amend` the correction INTO this commit — never a separate commit (lockstep is atomic).

---

### Task 2: Coverage gate (pure checker + synthetic proofs + live assertion)

TDD-natural: the test imports `checkPopoverContextCoverage` before it exists, so it is RED until the checker is implemented. No manual break/revert of the live catalog — every rule is proven on synthetic fixtures.

**Files:**
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Create: `tests/messages/popoverContextExemptions.ts` (`POPOVER_CONTEXT_EXEMPT = []`)
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Create: `tests/messages/popoverContextCoverage.ts` (pure `checkPopoverContextCoverage`)
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Create: `tests/messages/_metaPopoverContextCoverage.test.ts` (live assertion + synthetic proofs)

- [ ] **Step 1: Create the empty ledger.**

<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
`tests/messages/popoverContextExemptions.ts`:

```ts
/** Ledger of codes whose "?" popover intentionally carries NO helpfulContext.
 *  Ships EMPTY: every popover-reachable code currently authors real copy. */
export const POPOVER_CONTEXT_EXEMPT: ReadonlyArray<{ code: string; reason: string }> = [];
```

- [ ] **Step 2: Write the meta-test + synthetic proofs FIRST (RED — checker absent).**

<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
Create `tests/messages/_metaPopoverContextCoverage.test.ts` VERBATIM:

```ts
/**
 * tests/messages/_metaPopoverContextCoverage.test.ts
 * (spec 2026-07-20-alert-popover-context-design §4)
 *
 * Fails-by-default coverage gate for the compact-alert "?" popover, plus
 * synthetic-input proofs of each rule. The live meta-assertion walks the real
 * catalog so a NEW help-linked code with no popover copy fails here. The
 * synthetic block exercises every rule/branch independently, including the
 * exemption branches the empty shipped ledger leaves un-exercised.
 */
import { describe, it, expect } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import type { MessageCatalogEntry } from "@/lib/messages/catalog";
import { HELP_ONLY_LEARN_MORE_LEAD_IN } from "@/components/admin/compactAlertHelp";
import { POPOVER_CONTEXT_EXEMPT } from "./popoverContextExemptions";
import {
  checkPopoverContextCoverage,
  type CoverageEntry,
  type ExemptRow,
} from "./popoverContextCoverage";

const liveEntries: CoverageEntry[] = Object.entries(
  MESSAGE_CATALOG as Record<string, MessageCatalogEntry>,
).map(([code, e]) => ({ code, helpHref: e.helpHref, helpfulContext: e.helpfulContext }));

describe("popover context coverage: live catalog is fully covered", () => {
  it("the shipped catalog + ledger produce zero coverage violations", () => {
    const violations = checkPopoverContextCoverage(liveEntries, POPOVER_CONTEXT_EXEMPT);
    expect(
      violations,
      `authored helpfulContext or add a POPOVER_CONTEXT_EXEMPT row: ${JSON.stringify(violations)}`,
    ).toEqual([]);
  });
});

describe("popover context coverage: synthetic proofs (each rule fails by construction)", () => {
  const ok: CoverageEntry = { code: "OK", helpHref: "/help/errors#OK", helpfulContext: "Real, useful context that a reader can act on." };
  const noExempt: readonly ExemptRow[] = [];

  it("rule 1: helpHref set + null context + not exempt => violation", () => {
    const v = checkPopoverContextCoverage(
      [{ code: "GAP", helpHref: "/help/errors#GAP", helpfulContext: null }],
      noExempt,
    );
    expect(v).toEqual([{ rule: 1, code: "GAP", detail: expect.any(String) }]);
  });

  it("rule 1: a valid exemption (null context + well-formed row) => NO violation", () => {
    const v = checkPopoverContextCoverage(
      [{ code: "EX", helpHref: "/help/errors#EX", helpfulContext: null }],
      [{ code: "EX", reason: "Learn-more-only popover by design." }],
    );
    expect(v).toEqual([]);
  });

  it("rule 1: helpHref null + null context => NOT reachable, NO violation", () => {
    const v = checkPopoverContextCoverage(
      [{ code: "NOHREF", helpHref: null, helpfulContext: null }],
      noExempt,
    );
    expect(v).toEqual([]);
  });

  it("rule 2: whitespace-only context => violation", () => {
    const v = checkPopoverContextCoverage(
      [{ code: "WS", helpHref: "/help/errors#WS", helpfulContext: "   " }],
      noExempt,
    );
    expect(v).toEqual([{ rule: 2, code: "WS", detail: expect.any(String) }]);
  });

  it("rule 2: the exact lead-in => violation", () => {
    const v = checkPopoverContextCoverage(
      [{ code: "LEAD", helpHref: "/help/errors#LEAD", helpfulContext: HELP_ONLY_LEARN_MORE_LEAD_IN }],
      noExempt,
    );
    expect(v).toEqual([{ rule: 2, code: "LEAD", detail: expect.any(String) }]);
  });

  it("rule 2: the lead-in PADDED with whitespace => violation (normalization is load-bearing)", () => {
    const v = checkPopoverContextCoverage(
      [{ code: "PAD", helpHref: "/help/errors#PAD", helpfulContext: `   ${HELP_ONLY_LEARN_MORE_LEAD_IN}   ` }],
      noExempt,
    );
    expect(v).toEqual([{ rule: 2, code: "PAD", detail: expect.any(String) }]);
  });

  it("rule 3: exempt AND authored => violation", () => {
    const v = checkPopoverContextCoverage(
      [{ code: "BOTH", helpHref: "/help/errors#BOTH", helpfulContext: "context" }],
      [{ code: "BOTH", reason: "should not both be authored and exempt" }],
    );
    expect(v).toEqual([{ rule: 3, code: "BOTH", detail: expect.any(String) }]);
  });

  it("rule 4: exempt code not in catalog => violation", () => {
    const v = checkPopoverContextCoverage([ok], [{ code: "GHOST", reason: "no such code" }]);
    expect(v).toEqual([{ rule: 4, code: "GHOST", detail: expect.any(String) }]);
  });

  it("rule 4: exempt code with helpHref null (never reaches popover) => violation", () => {
    const v = checkPopoverContextCoverage(
      [{ code: "NOHREF", helpHref: null, helpfulContext: null }],
      [{ code: "NOHREF", reason: "vacuous: never reaches a popover" }],
    );
    expect(v).toEqual([{ rule: 4, code: "NOHREF", detail: expect.any(String) }]);
  });

  it("rule 4: empty reason => violation", () => {
    const v = checkPopoverContextCoverage(
      [{ code: "EX", helpHref: "/help/errors#EX", helpfulContext: null }],
      [{ code: "EX", reason: "   " }],
    );
    expect(v).toEqual([{ rule: 4, code: "EX", detail: expect.any(String) }]);
  });

  it("rule 4: duplicate exemption rows => exactly one duplicate violation", () => {
    const v = checkPopoverContextCoverage(
      [{ code: "EX", helpHref: "/help/errors#EX", helpfulContext: null }],
      [
        { code: "EX", reason: "first" },
        { code: "EX", reason: "second" },
      ],
    );
    // Whole-array equality: the fixture is well-formed except for the duplicate,
    // so exactly one violation is emitted (the second occurrence).
    expect(v).toEqual([{ rule: 4, code: "EX", detail: "duplicate exemption row" }]);
  });

  it("a fully valid catalog + empty ledger => no violations", () => {
    expect(checkPopoverContextCoverage([ok], noExempt)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run — verify RED.** `pnpm vitest run tests/messages/_metaPopoverContextCoverage.test.ts` → fails to resolve `./popoverContextCoverage` (module/function absent).

- [ ] **Step 4: Implement the pure checker.**

<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
Create `tests/messages/popoverContextCoverage.ts` VERBATIM:

```ts
/**
 * tests/messages/popoverContextCoverage.ts
 * (spec 2026-07-20-alert-popover-context-design §4)
 *
 * Pure coverage checker for the compact-alert "?" popover. Returns a list of
 * violations of the four §4 rules. Two consumers: the live meta-test asserts
 * zero violations against the real catalog + shipped ledger; synthetic-input
 * unit tests exercise every rule/branch on hand-built fixtures (including the
 * exemption branches the empty ledger leaves un-exercised on the live catalog).
 */
import type { ReactNode } from "react";
import { renderEmphasis } from "@/components/messages/renderEmphasis";
import { HELP_ONLY_LEARN_MORE_LEAD_IN } from "@/components/admin/compactAlertHelp";

export type CoverageEntry = {
  code: string;
  helpHref: string | null;
  helpfulContext: string | null;
};
export type ExemptRow = { code: string; reason: string };
export type Violation = { rule: 1 | 2 | 3 | 4; code: string; detail: string };

/** Flatten renderEmphasis output (marker-free copy => [string]) to text. */
function renderedText(node: ReactNode): string {
  if (node === null || node === undefined || node === false || node === true) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(renderedText).join("");
  const props = (node as { props?: { children?: ReactNode } }).props;
  return props ? renderedText(props.children) : "";
}

export function checkPopoverContextCoverage(
  entries: readonly CoverageEntry[],
  exempt: readonly ExemptRow[],
): Violation[] {
  const violations: Violation[] = [];
  const exemptCodes = new Set(exempt.map((r) => r.code));
  const byCode = new Map(entries.map((e) => [e.code, e] as const));

  // Rule 4: ledger closed and non-vacuous.
  const seen = new Set<string>();
  for (const row of exempt) {
    if (seen.has(row.code))
      violations.push({ rule: 4, code: row.code, detail: "duplicate exemption row" });
    seen.add(row.code);
    const e = byCode.get(row.code);
    if (e === undefined) {
      violations.push({ rule: 4, code: row.code, detail: "exempt code not in catalog" });
      continue;
    }
    if (e.helpHref === null)
      violations.push({
        rule: 4,
        code: row.code,
        detail: "exempt code has no helpHref; it never reaches a popover",
      });
    if (row.reason.trim().length === 0)
      violations.push({ rule: 4, code: row.code, detail: "exemption reason is empty" });
  }

  // Rule 3: exemption and authored copy are mutually exclusive.
  for (const row of exempt) {
    const e = byCode.get(row.code);
    if (e !== undefined && e.helpfulContext !== null)
      violations.push({
        rule: 3,
        code: row.code,
        detail: "exempt code also authors helpfulContext; drop one",
      });
  }

  // Rules 1 and 2 over popover-reachable entries (helpHref != null).
  for (const e of entries) {
    if (e.helpHref === null) continue;
    const isExempt = exemptCodes.has(e.code);
    if (e.helpfulContext === null) {
      if (!isExempt)
        violations.push({
          rule: 1,
          code: e.code,
          detail: "helpHref set but helpfulContext null and not exempt",
        });
      continue;
    }
    // helpfulContext non-null. Rule 3 already flags exempt+authored; skip rule 2 there.
    if (isExempt) continue;
    // Mirror production: nonEmpty trims first, then renderEmphasis renders the trimmed value.
    const text = renderedText(renderEmphasis(e.helpfulContext.trim())).trim();
    if (text.length === 0)
      violations.push({ rule: 2, code: e.code, detail: "helpfulContext renders empty after trim" });
    else if (text === HELP_ONLY_LEARN_MORE_LEAD_IN)
      violations.push({ rule: 2, code: e.code, detail: "helpfulContext equals the fallback lead-in" });
  }

  return violations;
}
```

- [ ] **Step 5: Run — verify GREEN.** `pnpm vitest run tests/messages/_metaPopoverContextCoverage.test.ts` → PASS (live zero-violations because Task 1 completed the catalog; all 12 synthetic proofs pass).

- [ ] **Step 6: Typecheck.** `pnpm typecheck` → clean.

- [ ] **Step 7: Commit.**

```bash
git add tests/messages/popoverContextExemptions.ts tests/messages/popoverContextCoverage.ts \
  tests/messages/_metaPopoverContextCoverage.test.ts
git commit --no-verify -m "test(messages): fails-by-default popover-context coverage gate + synthetic proofs"
```

---

### Task 3: Pre-push verification gate (VERIFY only — no lockstep-splitting commits)

**Files:** none. Task 3 verifies; it does not repair by adding commits. A parity-affecting defect means a PRIOR task's commit is wrong → `git commit --amend` the fix into THAT commit (Task 1 for the §12.4 triple), never a new commit.

- [ ] **Step 1: Typecheck.** `pnpm typecheck` → clean (vitest strips types; a green test run is not a typecheck).
- [ ] **Step 2: Lint.** `pnpm lint` → clean.
- [ ] **Step 3: Format check.** `pnpm format:check` → clean. `--no-verify` bypasses prettier, so the new test files must be formatted. If prettier flags the master spec, hand-fix ONLY the added appendix lines — never reformat the rest of that file; if prettier insists on reformatting untouched master-spec content, leave it and note the deliberate exception.
- [ ] **Step 4: Full parallel (no-DB) suite.** `pnpm vitest run --project=parallel` → green (scoped runs miss registry suites; the full parallel project covers `tests/messages/**`, `tests/styles`, `tests/help`).
- [ ] **Step 5: Prove the committed generated file is NOT stale (F6).**

```bash
pnpm gen:spec-codes
git diff --exit-code lib/messages/__generated__/spec-codes.ts   # MUST be clean
pnpm vitest run tests/cross-cutting/codes.test.ts tests/cross-cutting/extract-spec-codes.test.ts
```
If `git diff --exit-code` is non-zero: the Task 1 commit shipped a stale generated file. Fix by `git commit --amend`-ing the regenerated `spec-codes.ts` into the Task 1 commit (rebase if intervening commits exist) — do NOT add a separate commit (§12.4 lockstep is atomic).

- [ ] **Step 6: Clean-tree gate before push (F7).** `git status --porcelain` shows no uncommitted tracked changes (the skip-worktree `.claude/ship-state.json` is excluded by construction). Any fix from Steps 1-4 is committed to the task that owns it (a parity fix amends Task 1). Only then push.
