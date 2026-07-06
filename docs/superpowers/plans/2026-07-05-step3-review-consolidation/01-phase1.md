# Phase 1 — Data contract + unified read + display derivation

Runs behind the existing pre-finalize surface: no user-visible behavior change until Phase 3 wires checkpoints. Produces the derivation module + extended row + unified read that later phases consume.

---

### Task 1.1: Display-state derivation module (spec §4.2 total ordered algorithm)

The single source of truth for a row's display state. Pure function, no React, no I/O — exhaustively unit-tested over the §4.2.2 matrix. This is the structural defense for the display-derivation vector; every later display decision routes through it.

**Files:**
- Create: `lib/admin/step3DisplayState.ts`
- Test: `tests/admin/step3DisplayState.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Step3DisplayState =
    | "needs_review_other"      // rule 1
    | "needs_review_reapply"    // rule 2, well-formed parseResult
    | "needs_review_no_details" // rule 2, null/corrupt parseResult
    | "set_aside"               // rule 3a (permanent_ignore / defer_until_modified) — "Set aside for this setup"
    | "skipped"                 // rule 3b (skipped_non_sheet) — "Skipped (not a sheet)"
    | "live"                    // rule 4
    | "ready_to_publish"        // rule 5 (pre-CAS checked)
    | "held"                    // rule 6
    | "ready";                  // rule 7 (pre-finalize)

  export type DisplayDerivationInput = {
    status: Step3ManifestStatus;
    lastFinalizeFailureCode: string | null;
    hasWellFormedParseResult: boolean;
    // The row's linked show, resolved by the caller via BOTH the session-provenance
    // join AND the existing-show branch (§4.3). null when neither matches.
    linkedShow: { published: boolean; archived: boolean } | null;
    publishIntent: boolean; // manifest.publish_intent (default false pre-finalize)
    sessionLinked: boolean; // true iff linkedShow came from the session-provenance join
  };

  export function deriveStep3DisplayState(input: DisplayDerivationInput): Step3DisplayState;
  ```
- Consumes: `Step3ManifestStatus` (import type from `components/admin/wizard/Step3Review.tsx`).

- [ ] **Step 1: Write the failing test** — cover every §4.2.2 matrix cell + rule precedence.

`tests/admin/step3DisplayState.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { deriveStep3DisplayState, type DisplayDerivationInput } from "@/lib/admin/step3DisplayState";

const base: DisplayDerivationInput = {
  status: "staged",
  lastFinalizeFailureCode: null,
  hasWellFormedParseResult: true,
  linkedShow: null,
  publishIntent: false,
  sessionLinked: false,
};

describe("deriveStep3DisplayState", () => {
  it("rule 1: hard-block statuses outrank any linked show", () => {
    for (const status of ["hard_failed", "live_row_conflict", "discard_retryable"] as const) {
      expect(
        deriveStep3DisplayState({ ...base, status, linkedShow: { published: true, archived: false }, sessionLinked: true }),
      ).toBe("needs_review_other");
    }
  });

  it("rule 2: staged + failure code with well-formed parse → re-apply modal row", () => {
    expect(deriveStep3DisplayState({ ...base, status: "staged", lastFinalizeFailureCode: "RESCAN_REVIEW_REQUIRED" }))
      .toBe("needs_review_reapply");
  });

  it("rule 2: staged + failure code with null/corrupt parse → no-details recovery", () => {
    expect(deriveStep3DisplayState({ ...base, status: "staged", lastFinalizeFailureCode: "RESCAN_REVIEW_REQUIRED", hasWellFormedParseResult: false }))
      .toBe("needs_review_no_details");
  });

  it("rule 3a: permanent_ignore / defer → set_aside; rule 3b: skipped_non_sheet → skipped (distinct copy)", () => {
    for (const status of ["permanent_ignore", "defer_until_modified"] as const) {
      expect(deriveStep3DisplayState({ ...base, status })).toBe("set_aside");
    }
    expect(deriveStep3DisplayState({ ...base, status: "skipped_non_sheet" })).toBe("skipped");
  });

  it("rule 4: crew-visible linked show (session OR existing-show) → Live", () => {
    expect(deriveStep3DisplayState({ ...base, status: "applied", linkedShow: { published: true, archived: false }, sessionLinked: true }))
      .toBe("live");
    expect(deriveStep3DisplayState({ ...base, status: "applied", linkedShow: { published: true, archived: false }, sessionLinked: false }))
      .toBe("live");
  });

  it("rule 4 R6: archived linked show is NOT Live", () => {
    expect(deriveStep3DisplayState({ ...base, status: "applied", linkedShow: { published: true, archived: true }, sessionLinked: true }))
      .toBe("held");
  });

  it("rule 5 R8: pre-CAS session-linked published=false + publish_intent → Ready to publish", () => {
    expect(deriveStep3DisplayState({ ...base, status: "applied", linkedShow: { published: false, archived: false }, sessionLinked: true, publishIntent: true }))
      .toBe("ready_to_publish");
  });

  it("rule 6: session-linked published=false + no intent → Held", () => {
    expect(deriveStep3DisplayState({ ...base, status: "applied", linkedShow: { published: false, archived: false }, sessionLinked: true, publishIntent: false }))
      .toBe("held");
  });

  it("rule 7: no linked show, clean → Ready (pre-finalize)", () => {
    expect(deriveStep3DisplayState({ ...base, status: "staged" })).toBe("ready");
    expect(deriveStep3DisplayState({ ...base, status: "applied" })).toBe("ready");
  });

  it("existing-show (not session-linked) pre-CAS published=false is NOT ready_to_publish (rule 5 needs sessionLinked)", () => {
    // An external draft show: falls through to ready (no session link, not crew-visible).
    expect(deriveStep3DisplayState({ ...base, status: "staged", linkedShow: { published: false, archived: false }, sessionLinked: false }))
      .toBe("ready");
  });
});
```

- [ ] **Step 2: Run test — verify it fails** — `pnpm vitest run tests/admin/step3DisplayState.test.ts` → FAIL ("Cannot find module").

- [ ] **Step 3: Implement `lib/admin/step3DisplayState.ts`**

```ts
import type { Step3ManifestStatus } from "@/components/admin/wizard/Step3Review";

export type Step3DisplayState =
  | "needs_review_other"
  | "needs_review_reapply"
  | "needs_review_no_details"
  | "set_aside"
  | "skipped"
  | "live"
  | "ready_to_publish"
  | "held"
  | "ready";

export type DisplayDerivationInput = {
  status: Step3ManifestStatus;
  lastFinalizeFailureCode: string | null;
  hasWellFormedParseResult: boolean;
  linkedShow: { published: boolean; archived: boolean } | null;
  publishIntent: boolean;
  sessionLinked: boolean;
};

const HARD_BLOCK = new Set<Step3ManifestStatus>(["hard_failed", "live_row_conflict", "discard_retryable"]);
const SET_ASIDE = new Set<Step3ManifestStatus>(["permanent_ignore", "defer_until_modified"]);

// First-match-wins ordered algorithm (spec §4.2). Total: the final `ready`
// fallthrough guarantees exactly one state per row. Proven by the §4.2.2 matrix
// test above.
export function deriveStep3DisplayState(input: DisplayDerivationInput): Step3DisplayState {
  // 1. hard blocks outrank everything.
  if (HARD_BLOCK.has(input.status)) return "needs_review_other";
  // 2. re-apply blocked rows.
  if (input.status === "staged" && input.lastFinalizeFailureCode !== null) {
    return input.hasWellFormedParseResult ? "needs_review_reapply" : "needs_review_no_details";
  }
  // 3a. resolved / set aside; 3b. skipped (distinct copy, spec §4.2 rule 3).
  if (SET_ASIDE.has(input.status)) return "set_aside";
  if (input.status === "skipped_non_sheet") return "skipped";
  // 4. Live: any crew-visible linked show (session-provenance OR existing-show branch).
  const crewVisible = input.linkedShow?.published === true && input.linkedShow.archived === false;
  if (crewVisible) return "live";
  // 5. pre-CAS checked (session-linked only).
  if (input.sessionLinked && input.linkedShow && !input.linkedShow.published && !input.linkedShow.archived && input.publishIntent) {
    return "ready_to_publish";
  }
  // 6. Held: a session-linked show that is not Live and not Ready-to-publish.
  if (input.sessionLinked && input.linkedShow) return "held";
  // 7. Ready (pre-finalize): no linked show, clean row.
  return "ready";
}
```

- [ ] **Step 4: Run test — verify it passes** — `pnpm vitest run tests/admin/step3DisplayState.test.ts` → PASS.

- [ ] **Step 5: Typecheck** — `pnpm tsc --noEmit` (or `pnpm typecheck`) → no errors.

- [ ] **Step 6: Commit**
```bash
git add lib/admin/step3DisplayState.ts tests/admin/step3DisplayState.test.ts
git commit --no-verify -m "feat(admin): step-3 display-state derivation module (spec §4.2 ordered algorithm)"
```

---

### Task 1.2: Extend `Step3Row` + `fetchStep3Data` join for Live/Held (spec §4.3, §4.3.1)

Thread the fields the derivation + modal need, and compute the linked-show state server-side via the session-provenance join AND the existing-show branch.

**Files:**
- Modify: `components/admin/wizard/Step3Review.tsx:79-108` (`Step3Row` type)
- Modify: `components/admin/OnboardingWizard.tsx:219+` (`fetchStep3Data`)
- Test: `tests/admin/step3UnifiedRead.test.ts` (extended here, completed in Task 1.3)

**Interfaces:**
- Produces: `Step3Row` gains
  ```ts
  stagedId?: string;
  triggeredReviewItems?: TriggeredReviewItem[]; // populated ONLY when both validation levels pass
  reviewItemsCorrupt?: boolean;
  publishIntent?: boolean;
  createdShowId?: string | null;
  linkedShow?: { published: boolean; archived: boolean } | null; // resolved via §4.3 joins
  sessionLinked?: boolean;
  displayState?: Step3DisplayState; // computed by deriveStep3DisplayState in fetchStep3Data
  ```
- Consumes: `deriveStep3DisplayState` (Task 1.1), `parseTriggeredReviewItems` + `isStructurallyValidReviewItem` (`lib/staging/reviewPayloadGuards.ts`).
- **Candidate-selection contract (HIGH, plan-R1).** `buildStep3Row` takes the FULL list of `shows` candidates for the row's `drive_file_id` (not one pre-picked show), and resolves `linkedShow`/`sessionLinked` by this precedence — never a bare `created_show_id` trust:
  ```ts
  type ShowCandidate = { id: string; drive_file_id: string; published: boolean; archived: boolean; wizard_created_session_id: string | null };
  buildStep3Row(manifestRow, pendingRow, candidates: ShowCandidate[]): Step3Row
  ```
  1. **Session-provenance** (precedence): pick the candidate where `manifest.created_show_id === c.id && manifest.drive_file_id === c.drive_file_id && c.wizard_created_session_id === manifest.wizard_session_id` → `sessionLinked = true`.
  2. Else, **only if** `manifest.created_show_id === null`, **existing-show branch**: pick a candidate where `c.drive_file_id === manifest.drive_file_id && c.published === true && c.archived === false && c.wizard_created_session_id !== manifest.wizard_session_id` (null-safe distinct: a `null` session id is `!== manifest.wizard_session_id`) → `sessionLinked = false`. If multiple crew-visible candidates match, pick the first (a `drive_file_id` maps to one live show; the guard is `published && !archived`).
  3. Else `linkedShow = null`. A **non-null** `created_show_id` that matches NO candidate (forged/stale) yields `linkedShow = null` (session join fails; existing-show branch is gated on `created_show_id IS NULL`, so it cannot rescue a forged pointer) → falls to Ready/manifest status. This is the R2 safety.

- [ ] **Step 1: Write the failing test** — the two-level corrupt guard + Live/Held derivation from a joined show. Use a fake `fetchStep3Data` dependency-injection seam if `fetchStep3Data` reads Supabase directly; otherwise assert on a small extracted `buildStep3Row(manifestRow, pendingRow, joinedShow)` helper.

`tests/admin/step3UnifiedRead.test.ts` (partial — corrupt + join):
```ts
import { describe, expect, it } from "vitest";
import { buildStep3Row } from "@/components/admin/OnboardingWizard";

const manifest = { drive_file_id: "d1", status: "staged", publish_intent: false, created_show_id: null, wizard_session_id: "s1" };
const pending = { staged_id: "st1", parse_result: { show: { title: "X" } }, last_finalize_failure_code: null, triggered_review_items: null };

describe("buildStep3Row review-items two-level guard (spec §4.3.1, R6)", () => {
  it("[null] element → reviewItemsCorrupt, triggeredReviewItems empty", () => {
    const row = buildStep3Row({ ...manifest }, { ...pending, triggered_review_items: [null] }, []);
    expect(row.reviewItemsCorrupt).toBe(true);
    expect(row.triggeredReviewItems ?? []).toEqual([]);
  });
  it("missing-field element → reviewItemsCorrupt", () => {
    const row = buildStep3Row({ ...manifest }, { ...pending, triggered_review_items: [{ id: "x" }] }, []);
    expect(row.reviewItemsCorrupt).toBe(true);
  });
  it("valid items → not corrupt, populated", () => {
    const items = [{ id: "a", invariant: "MI-6", section: "sched" }];
    const row = buildStep3Row({ ...manifest }, { ...pending, triggered_review_items: items }, []);
    expect(row.reviewItemsCorrupt).toBe(false);
    expect(row.triggeredReviewItems?.length).toBe(1);
  });
});

describe("buildStep3Row Live/Held candidate selection (spec §4.3, plan-R1)", () => {
  const sessionShow = { id: "show1", drive_file_id: "d1", published: true, archived: false, wizard_created_session_id: "s1" };
  it("session-provenance join wins → Live, sessionLinked", () => {
    const row = buildStep3Row({ ...manifest, status: "applied", created_show_id: "show1" }, pending, [sessionShow]);
    expect(row.displayState).toBe("live");
    expect(row.sessionLinked).toBe(true);
  });
  it("existing-show branch, NULL provenance → Live, not sessionLinked", () => {
    const row = buildStep3Row({ ...manifest, created_show_id: null }, pending, [{ ...sessionShow, wizard_created_session_id: null }]);
    expect(row.displayState).toBe("live");
    expect(row.sessionLinked).toBe(false);
  });
  it("existing-show branch, PRIOR-session non-null id → Live (IS DISTINCT FROM, not IS NULL)", () => {
    const row = buildStep3Row({ ...manifest, created_show_id: null, wizard_session_id: "s2" }, pending, [{ ...sessionShow, wizard_created_session_id: "s1" }]);
    expect(row.displayState).toBe("live");
    expect(row.sessionLinked).toBe(false);
  });
  it("existing-show ARCHIVED prior-session show → falls to Ready (not Live, not Held)", () => {
    const row = buildStep3Row({ ...manifest, created_show_id: null, wizard_session_id: "s2" }, pending, [{ ...sessionShow, archived: true, wizard_created_session_id: "s1" }]);
    expect(row.displayState).toBe("ready");
  });
  it("session-provenance precedence over a same-drive existing candidate", () => {
    const other = { id: "showX", drive_file_id: "d1", published: true, archived: false, wizard_created_session_id: null };
    const row = buildStep3Row({ ...manifest, status: "applied", created_show_id: "show1" }, pending, [other, sessionShow]);
    expect(row.sessionLinked).toBe(true); // picked show1 via provenance, not showX
  });
  it("forged/stale non-null created_show_id matching NO candidate → not Live (R2 safety)", () => {
    const row = buildStep3Row({ ...manifest, status: "applied", created_show_id: "ghost" }, pending, [sessionShow]);
    expect(row.displayState).not.toBe("live");
    expect(row.linkedShow ?? null).toBeNull();
  });
});
```

- [ ] **Step 2: Run — verify fail** (`buildStep3Row` not exported yet).

- [ ] **Step 3: Implement.** In `Step3Review.tsx` add the new optional fields to `Step3Row`. In `OnboardingWizard.tsx`:
  1. Extend the `pending_syncs` select to include `triggered_review_items` (spec §4.3; current select at `:259-260`).
  2. Add a `public.shows` read selecting `id, drive_file_id, published, archived, wizard_created_session_id` for the session's `drive_file_id`s (destructure `{ data, error }`; infra fault → `{ kind: "infra_error" }`).
  3. Export a pure `buildStep3Row(manifestRow, pendingRow, candidates: ShowCandidate[])` that:
     - Coerces `triggered_review_items` via `parseTriggeredReviewItems`; sets `reviewItemsCorrupt = !(parsed.ok && parsed.items.every(isStructurallyValidReviewItem))`; populates `triggeredReviewItems` only when both pass.
     - Resolves `linkedShow` + `sessionLinked` per the **Candidate-selection contract** above (session-provenance first; existing-show branch only when `created_show_id IS NULL`; else null). The caller groups the `public.shows` read by `drive_file_id` and passes each row's candidate list.
     - Sets `hasWellFormedParseResult = !!(pending.parse_result && typeof pending.parse_result === "object" && pending.parse_result.show)`.
     - Computes `displayState = deriveStep3DisplayState({ ...signals, linkedShow, sessionLinked })`.

- [ ] **Step 4: Run — verify pass.**

- [ ] **Step 5: Typecheck.**

- [ ] **Step 6: Commit**
```bash
git add components/admin/wizard/Step3Review.tsx components/admin/OnboardingWizard.tsx tests/admin/step3UnifiedRead.test.ts
git commit --no-verify -m "feat(admin): thread staged/review-item/linked-show fields onto Step3Row (spec §4.3.1)"
```

---

### Task 1.3: Unified read across checkpoints + `checkpointStatus` + infra-footer contract (spec §4.3, R8)

Make `fetchStep3Data` run for ANY checkpoint (not just `null`) and surface `checkpointStatus` so the footer + page can render the unified surface. Guarantee an infra error preserves the checkpoint footer.

**Files:**
- Modify: `components/admin/OnboardingWizard.tsx` (`fetchStep3Data`, `Step3Container`, `Step3FetchResult`)
- Test: `tests/admin/step3UnifiedRead.test.ts` (finalize-state coverage)

**Interfaces:**
- Produces: `Step3FetchResult = { kind:"ok"; rows: Step3Row[]; finishable: boolean } | { kind:"infra_error"; message: string }` (unchanged shape); `Step3Container`/`OnboardingWizard` accept `checkpointStatus?: "in_progress" | "all_batches_complete" | null` and pass it to `Step3ReviewWithFinalize`.

- [ ] **Step 1: Write the failing test** — a `finalized` fixture (checkpoint `all_batches_complete`, a first-seen row with a session show `published=false, publish_intent=true`) yields `displayState==="ready_to_publish"`; a rows infra error still returns `{kind:"infra_error"}` (footer preservation is asserted in the component test 1.4/3.2). (Derive expectations from the fixture, not hardcoded.)

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement** — remove the `checkpoint === null` gating around `fetchStep3Data`; add the `checkpointStatus` param threaded to `Step3ReviewWithFinalize`. (The actual page rewire lands in Phase 3; here `fetchStep3Data` just becomes checkpoint-agnostic and accepts the param.)

- [ ] **Step 4: Run — verify pass.**  - [ ] **Step 5: Typecheck.**

- [ ] **Step 6: Commit**
```bash
git add components/admin/OnboardingWizard.tsx tests/admin/step3UnifiedRead.test.ts
git commit --no-verify -m "feat(admin): fetchStep3Data runs across checkpoints, threads checkpointStatus (spec §4.3)"
```

---

### Task 1.4: Row badge wired to derived state (behind pre-finalize surface)

Render the per-row badge from `row.displayState` (spec §4.2 table tones). No new checkpoint behavior yet — pre-finalize rows still render Ready/Needs-review exactly as before, but now via the derivation.

**Files:**
- Modify: `components/admin/wizard/Step3Review.tsx` (`badgeForStatus` → `badgeForDisplayState`)
- Test: `tests/components/admin/wizard/Step3ReviewModalResolution.test.tsx` (badge subset — full file in Phase 2) OR a focused `tests/components/admin/wizard/Step3RowBadge.test.tsx`.

- [ ] **Step 1: Write the failing test** — a `ready_to_publish` row renders the "Ready to publish" badge (positive tone); a `held` row renders "Held" (neutral); anti-tautology: assert against `row.displayState`, clone-strip sibling controls before scanning text.

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement** `badgeForDisplayState(state): { label, tone }` mapping per spec §4.2 table; render it in the row. Distinct copy per plan-R1: `set_aside` → "Set aside for this setup" (muted), `skipped` → "Skipped (not a sheet)" (muted), `ready_to_publish` → "Ready to publish" (positive), `held` → "Held" (neutral), `live` → "Live" (accent), `ready` → "Ready" (idle). The badge derives ONLY from `displayState` (which already encodes the status distinction), so it never reaches back to `row.status`. Keep `badgeForStatus` only if still referenced; otherwise replace.

- [ ] **Step 4: Run — verify pass.** - [ ] **Step 5: Typecheck.**

- [ ] **Step 6: Commit**
```bash
git add components/admin/wizard/Step3Review.tsx tests/components/admin/wizard/Step3RowBadge.test.tsx
git commit --no-verify -m "feat(admin): step-3 row badge from derived display state (spec §4.2)"
```
