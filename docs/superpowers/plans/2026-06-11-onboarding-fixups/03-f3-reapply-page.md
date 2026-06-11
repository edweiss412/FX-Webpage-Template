# Phase 3 — F3 re-apply page "already resolved" state (replaces notFound)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this phase task-by-task. Steps use checkbox (`- [ ]`) syntax. TDD: failing test → minimal implementation → passing test → commit.
>
> ⚠️ **UI WORK — OPUS ONLY.** Every file this phase touches is under `app/` outside `app/api/**` — per AGENTS.md "Hard rule: UI work is always Opus / Claude Code", the implementer MUST be Opus, regardless of who owns the rest of the milestone. If you are running under Codex: **stop and hand back to the orchestrator.**
>
> ⚠️ **Impeccable dual-gate applies (AGENTS.md invariant 8).** Before milestone close-out, `/impeccable critique` AND `/impeccable audit` must pass on this phase's diff, run by an EXTERNAL session (fresh subagent or user-invoked — self-attestation by the implementing session fails §1.8), with HIGH/CRITICAL findings fixed or deferred via `DEFERRED.md`. Findings + dispositions go in §12 of the milestone handoff doc. This fires again on any post-review fix commit that touches the UI.

**Spec:** `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-10-onboarding-fixups-design.md` §5 (F3), testing spine §10.5 + §10.9, preempt §8 ("F3 ships page copy, not a §12.4 code").

**Goal:** `app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx:123-126` calls `notFound()` when the `pending_syncs` row for `(wizardSessionId, driveFileId, wizard_approved = false)` is gone — but that is the NORMAL post-Apply state (stale tab / back-nav, observed 2026-06-10). Replace it with a rendered "already resolved" state page using the same layout shell as the page's existing infra-error state (page.tsx:104-121). Infra-error path unchanged. No new §12.4 code (invariant 5 satisfied vacuously — no codes render; if review disputes this, it is an explicit costed three-lockstep alternative per spec §8, never a silent change).

**Exact spec copy (verbatim — do not edit during implementation):**
- Heading: `This sheet is already taken care of.`
- Body: `It was applied or set aside — possibly from another tab. Nothing else is needed here.`
- Links: `Back to setup` → `/admin/onboarding` · `Go to dashboard` → `/admin`

**Pre-draft verification findings (live-code citation pass, 2026-06-11):**

1. **`/admin/onboarding` is not currently a routable page.** `app/admin/onboarding/` contains ONLY the `staged/` subtree (no `page.tsx`); the wizard renders at `/admin` via the dispatcher (`app/admin/page.tsx`). The spec's "Back to setup" → `/admin/onboarding` link would dead-end 404 — exactly the "build-gated routes are never fallback targets" class. The page's own existing back-nav already labels `/admin` as "← Back to setup" (page.tsx:152-160). **Resolution in this plan (Task 3.2):** add a 3-line redirect route `app/admin/onboarding/page.tsx` → `redirect("/admin")` so the spec-specified href is honored AND routable. Flag this in the phase's adversarial-review focus text as a plan-level resolution of a spec gap (alternative: change the spec's href to `/admin` — escalate only if the reviewer objects to the redirect).
2. **Malformed `wizardSessionId` currently lands in the INFRA-ERROR state, not 404:** `pending_syncs.wizard_session_id` is `uuid` (`supabase/migrations/20260501001000_internal_and_admin.sql:150`), so `.eq("wizard_session_id", "not-a-uuid")` makes PostgREST return a 400 → `fetchWizardStagedRow` returns `{ kind: "infra_error" }` (page.tsx:82-87) → "We could not load that staged sheet." The spec requires malformed/unknown ids to render the SAME resolved page (no row-existence leak). Implementation therefore needs a pre-query UUID-format guard. Convention: local `const UUID_RE = /^[0-9a-f]{8}-...$/i` per module (established at `lib/auth/picker/cookieEnvelope.ts:6`, `app/admin/actions.ts:35` — note: the comment at `app/admin/actions.ts:31` claiming `lib/auth/constants.ts` exports `UUID_RE` is stale; no such export exists, do not import from there). `driveFileId` is `text` — any string is queryable; unknown values fall into the normal `data: null` → resolved-page path, no guard needed.
3. **`fetchWizardStagedRow` is registered in the Supabase call-boundary meta-test** (`tests/admin/_metaInfraContract.test.ts:184,620-640`). F3 does NOT change that helper — only the page's handling of its `null` result — so the registry row stays valid as-is (invariant 9: no new call boundary, no new registry row needed). Do not move the UUID guard inside `fetchWizardStagedRow` (that would change the registered contract); guard in the page component before calling it.
4. The page doc-comment line "Row-not-found → 404 with STALE_DISCARD_REJECTED context" (page.tsx:15) becomes stale — update it in the same commit.

**Out of scope:** `components/admin/StagedReviewCard.tsx` and its wizard-mode client tests (`tests/components/admin/WizardStagedPage.test.tsx`) — the found-row path is unchanged. No layout-dimensions task: the resolved state is a statically stacked text page with no fixed-dimension parent containing flex/grid children (spec §5: jsdom OK, no layout assertions needed). No transition inventory: the page is a Server Component with exactly one state rendered per request — no client-side state transitions exist.

---

## Task 3.1 — Resolved-state page (TDD)

**Files:**
- New: `tests/components/admin/WizardStagedReapplyResolved.test.tsx`
- Modify: `app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx`

### Steps

- [ ] **1. Write the failing test** — `tests/components/admin/WizardStagedReapplyResolved.test.tsx`. Full async-Server-Component render with mocked data layer (pattern: `tests/app/admin/perShowPage.test.tsx`; `vi.hoisted` state + chainable supabase stub). Anti-tautology (spec §10.9): every copy/link assertion is scoped `within(...)` the resolved-state container so the sibling re-apply shell (which also contains "sheet" copy and a `/admin` link) cannot satisfy it; the found-row test additionally asserts the resolved container is ABSENT.

```tsx
// @vitest-environment jsdom
/**
 * tests/components/admin/WizardStagedReapplyResolved.test.tsx
 * (M-onboarding-fixups Phase 3 / F3 — spec §5)
 *
 * Pins the row-gone contract of the wizard re-apply page:
 * consumed/malformed → rendered "already resolved" state (NOT notFound());
 * infra error → unchanged; found row → unchanged (StagedReviewCard mounts).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, within } from "@testing-library/react";

const requireAdminMock = vi.fn(async () => undefined);
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: () => requireAdminMock(),
}));

// Sentinel: if the page ever calls notFound() again, the render throws and
// the resolved-state test fails loudly (concrete failure mode: regression to 404).
const notFoundMock = vi.fn((): never => {
  throw new Error("NEXT_NOT_FOUND_SENTINEL");
});
vi.mock("next/navigation", () => ({ notFound: () => notFoundMock() }));

// The found-row path mounts this client component; stub it (its own contract is
// pinned by tests/components/admin/WizardStagedPage.test.tsx).
vi.mock("@/components/admin/StagedReviewCard", () => ({
  StagedReviewCard: () => <div data-testid="staged-review-card-stub" />,
}));

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  queryError: null as { message: string } | null,
  clientThrows: false,
  queryCount: 0,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (state.clientThrows) throw new Error("client construction failed");
    return {
      from: () => {
        state.queryCount += 1;
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => ({ data: state.row, error: state.queryError }),
        };
        return builder;
      },
    };
  },
}));

import WizardStagedReapplyPage from "@/app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page";

const WSID = "11111111-1111-1111-1111-111111111111";
const DFID = "drive-consumed-1";

async function renderPage(wizardSessionId = WSID, driveFileId = DFID) {
  return render(
    await WizardStagedReapplyPage({
      params: Promise.resolve({ wizardSessionId, driveFileId }),
    }),
  );
}

beforeEach(() => {
  state.row = null;
  state.queryError = null;
  state.clientThrows = false;
  state.queryCount = 0;
  notFoundMock.mockClear();
});

afterEach(() => cleanup());

describe("F3 — already-resolved state (spec §5)", () => {
  test("consumed row renders the resolved page with exact copy + both links; never notFound()", async () => {
    // Failure modes: notFound() restored (sentinel throws); copy drift; a link
    // pointing at a non-routable target.
    const { getByTestId, queryByTestId } = await renderPage();
    const resolved = within(getByTestId("wizard-staged-reapply-resolved"));
    expect(
      resolved.getByRole("heading", { name: "This sheet is already taken care of." }),
    ).toBeTruthy();
    expect(
      resolved.getByText(
        "It was applied or set aside — possibly from another tab. Nothing else is needed here.",
      ),
    ).toBeTruthy();
    expect(
      resolved.getByRole("link", { name: "Back to setup" }).getAttribute("href"),
    ).toBe("/admin/onboarding");
    expect(
      resolved.getByRole("link", { name: "Go to dashboard" }).getAttribute("href"),
    ).toBe("/admin");
    expect(notFoundMock).not.toHaveBeenCalled();
    // The re-apply working shell must NOT render alongside the resolved state.
    expect(queryByTestId("wizard-staged-reapply-page")).toBeNull();
    expect(queryByTestId("staged-review-card-stub")).toBeNull();
  });

  test("malformed wizardSessionId renders the SAME resolved page WITHOUT querying", async () => {
    // Failure mode: a non-uuid hitting `.eq()` on the uuid column makes PostgREST
    // 400 → the page would render the INFRA-ERROR state ("We could not load…")
    // instead of the resolved page. The guard must short-circuit pre-query.
    const { getByTestId, queryByTestId } = await renderPage("not-a-uuid");
    expect(getByTestId("wizard-staged-reapply-resolved")).toBeTruthy();
    expect(queryByTestId("wizard-staged-reapply-infra-error")).toBeNull();
    expect(state.queryCount).toBe(0);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  test("unknown driveFileId (text column — query allowed) renders the resolved page", async () => {
    // driveFileId is text: indistinguishable-from-consumed by design (no
    // row-existence leak; copy stays generic — spec §5 guard conditions).
    const { getByTestId } = await renderPage(WSID, "no-such-file");
    expect(getByTestId("wizard-staged-reapply-resolved")).toBeTruthy();
    expect(state.queryCount).toBe(1);
  });

  test("infra error path is UNCHANGED: query error renders the infra-error state, not the resolved page", async () => {
    // Failure mode: over-broad refactor folds infra errors into "resolved" —
    // masking a real outage as success and stranding Doug with no retry cue.
    state.queryError = { message: "boom" };
    const { getByTestId, queryByTestId } = await renderPage();
    expect(getByTestId("wizard-staged-reapply-infra-error")).toBeTruthy();
    expect(queryByTestId("wizard-staged-reapply-resolved")).toBeNull();
  });

  test("client-construction failure also renders the infra-error state", async () => {
    state.clientThrows = true;
    const { getByTestId, queryByTestId } = await renderPage();
    expect(getByTestId("wizard-staged-reapply-infra-error")).toBeTruthy();
    expect(queryByTestId("wizard-staged-reapply-resolved")).toBeNull();
  });

  test("found row still renders the working re-apply shell (StagedReviewCard mounts)", async () => {
    // Failure mode: the resolved-state branch swallows the found-row path.
    state.row = {
      staged_id: "22222222-2222-2222-2222-222222222222",
      drive_file_id: DFID,
      staged_modified_time: "2026-06-10T12:00:00.000Z",
      base_modified_time: null,
      parse_result: { show: { title: "RPAS Central 2026" } },
      triggered_review_items: [],
      last_finalize_failure_code: null,
      source_kind: "onboarding_scan",
    };
    const { getByTestId, queryByTestId } = await renderPage();
    expect(getByTestId("wizard-staged-reapply-page")).toBeTruthy();
    expect(getByTestId("staged-review-card-stub")).toBeTruthy();
    expect(queryByTestId("wizard-staged-reapply-resolved")).toBeNull();
  });
});
```

- [ ] **2. Run it — fails:**

```bash
pnpm vitest run tests/components/admin/WizardStagedReapplyResolved.test.tsx
```

Expected: the first test fails with `NEXT_NOT_FOUND_SENTINEL` (current code calls `notFound()` on the null row); the malformed-id test fails on `queryCount` (current code queries and renders infra-error). Infra-error + found-row tests pass already (they pin the unchanged paths — keep them: they are the negative regressions for the refactor).

- [ ] **3. Minimal implementation** — in `app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx`:

  a. Drop the `notFound` import (it becomes unused — lint will enforce).
  b. Add the module-local UUID guard + the resolved-state component (same shell classes as the infra-error state at page.tsx:104-121; copy verbatim from the spec):

```tsx
// pending_syncs.wizard_session_id is uuid — a malformed id would 400 at PostgREST
// and surface as a FAKE infra error. Treat it as indistinguishable-from-consumed
// (spec §5 guard conditions; no row-existence leak). Local-const convention per
// lib/auth/picker/cookieEnvelope.ts:6.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// F3 (spec §5): the row being gone is the NORMAL post-Apply state (stale tab /
// back-nav) — render a calm resolved page, not a 404. State page, not an error
// code: no §12.4 row (invariant 5 vacuously satisfied).
function AlreadyResolvedState() {
  return (
    <main
      data-testid="wizard-staged-reapply-resolved"
      className="mx-auto flex max-w-2xl flex-col gap-section-gap"
    >
      <header className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-text-strong">
          This sheet is already taken care of.
        </h2>
        <p className="max-w-prose text-base text-text-subtle">
          It was applied or set aside — possibly from another tab. Nothing else
          is needed here.
        </p>
      </header>
      <nav aria-label="Wizard navigation" className="flex flex-wrap gap-x-6 gap-y-2">
        <Link
          href="/admin/onboarding"
          data-testid="wizard-staged-resolved-back-to-setup"
          className="inline-flex min-h-tap-min items-center text-sm text-text-subtle hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Back to setup
        </Link>
        <Link
          href="/admin"
          data-testid="wizard-staged-resolved-go-to-dashboard"
          className="inline-flex min-h-tap-min items-center text-sm text-text-subtle hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Go to dashboard
        </Link>
      </nav>
    </main>
  );
}
```

  c. In the default export, guard BEFORE the fetch and replace the `notFound()` branch:

```tsx
export default async function WizardStagedReapplyPage({ params }: PageProps) {
  await requireAdmin();
  const { wizardSessionId, driveFileId } = await params;

  // Malformed session id: indistinguishable from consumed without leaking row
  // existence — same state page, and never sent to PostgREST (uuid column).
  if (!UUID_RE.test(wizardSessionId)) {
    return <AlreadyResolvedState />;
  }

  const result = await fetchWizardStagedRow(wizardSessionId, driveFileId);

  if (result !== null && typeof result === "object" && "kind" in result && result.kind === "infra_error") {
    /* ...existing infra-error block UNCHANGED (page.tsx:104-121)... */
  }

  if (result === null) {
    // Row gone = applied or set aside (possibly another tab) — the normal
    // post-Apply state, not an error (F3, spec §5).
    return <AlreadyResolvedState />;
  }
  /* ...rest unchanged... */
}
```

  d. Update the stale doc-comment (page.tsx:15): `Row-not-found → 404 with STALE_DISCARD_REJECTED context.` → `Row-not-found / malformed session id → rendered "already resolved" state page (F3, onboarding-fixups spec §5) — the normal post-Apply state, not a 404.`

- [ ] **4. Run — passes:**

```bash
pnpm vitest run tests/components/admin/WizardStagedReapplyResolved.test.tsx tests/components/admin/WizardStagedPage.test.tsx tests/admin/_metaInfraContract.test.ts
```

Expected: all green — new suite passes; the existing wizard-mode client suite and the call-boundary registry (`fetchWizardStagedRow` rows at `tests/admin/_metaInfraContract.test.ts:184,620-640`) are untouched by the page-level change.

- [ ] **5. Commit:**

```
feat(onboarding): replace re-apply 404 with already-resolved state page (F3)
```

---

## Task 3.2 — `/admin/onboarding` redirect route (closes the dead-link gap; TDD)

**Files:**
- New: `tests/app/admin/onboardingRedirect.test.tsx`
- New: `app/admin/onboarding/page.tsx`

### Steps

- [ ] **1. Write the failing test** — `tests/app/admin/onboardingRedirect.test.tsx`:

```tsx
// @vitest-environment jsdom
/**
 * F3 companion (plan §pre-draft finding 1): the resolved page's "Back to setup"
 * href is /admin/onboarding per spec §5, but the wizard renders at /admin via the
 * dispatcher — without this redirect the spec-mandated link 404s (the
 * "build-gated routes are never fallback targets" class).
 */
import { describe, expect, test, vi } from "vitest";

const redirectMock = vi.fn((url: string): never => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirectMock(url) }));

describe("/admin/onboarding", () => {
  test("redirects to /admin (the wizard dispatcher)", async () => {
    const { default: OnboardingIndexPage } = await import(
      "@/app/admin/onboarding/page"
    );
    await expect(async () => OnboardingIndexPage()).rejects.toThrow(
      "NEXT_REDIRECT:/admin",
    );
    expect(redirectMock).toHaveBeenCalledWith("/admin");
  });
});
```

- [ ] **2. Run it — fails** — `pnpm vitest run tests/app/admin/onboardingRedirect.test.tsx`. Expected: module-not-found for `@/app/admin/onboarding/page`.

- [ ] **3. Minimal implementation** — `app/admin/onboarding/page.tsx`:

```tsx
/**
 * /admin/onboarding — routable alias for the wizard.
 *
 * The onboarding wizard renders at /admin via the dispatcher
 * (app/admin/page.tsx); this route exists so links that name
 * /admin/onboarding (F3 resolved page "Back to setup", spec §5) never
 * dead-end. Admin-gated by app/admin/layout.tsx like every sibling.
 */
import { redirect } from "next/navigation";

export default function OnboardingIndexPage(): never {
  redirect("/admin");
}
```

- [ ] **4. Run — passes** — `pnpm vitest run tests/app/admin/onboardingRedirect.test.tsx`.

- [ ] **5. Commit:**

```
feat(onboarding): route /admin/onboarding to the wizard dispatcher
```

---

## Task 3.3 — Phase verification + UI gates (no commit unless fixes emerge)

- [ ] **1. Full local gates on the touched surfaces:**

```bash
pnpm vitest run tests/components/admin tests/app/admin tests/admin
pnpm typecheck && pnpm lint
pnpm test:audit:x2-no-raw-codes
```

Expected: green. x2 matters here: the resolved page renders NO raw codes (it is a state page — spec §5/§8); a regression that prints a code literal must red x2.

- [ ] **2. Screenshot-baseline check:** confirm the re-apply route is NOT in the help-screenshot capture manifest (`grep -rn "onboarding/staged" playwright.screenshots.config.ts tests/help/ e2e/ 2>/dev/null` — expected: no captured-route hits; the screenshots-drift discipline only bites captured routes). If a hit appears, regen via the sanctioned amd64 Docker procedure and `git restore public/help/screenshots/` after local verification.

- [ ] **3. Manual real-browser sanity (prod build — local `next dev` hydration is broken in this sandbox per M12.5 memory):** `pnpm build && pnpm start`, sign in as admin, visit `/admin/onboarding/staged/<random-uuid>/<random-id>` → resolved page with both links working; `/admin/onboarding` → lands on `/admin`.

- [ ] **4. Impeccable dual-gate (EXTERNAL attestation)** — run `/impeccable critique` + `/impeccable audit` on this phase's diff via a fresh external session, with the canonical v3 preflight gates (PRODUCT.md → DESIGN.md → register → preflight signal). Record findings + dispositions in the milestone handoff doc §12. NOTE: critique dispositions are not authoritative against the spec — if critique proposes copy changes to the §5 verbatim strings, spec-check first and escalate as a costed alternative (spec §8), never apply silently.
