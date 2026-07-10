# Step 1 "Share your show folder" Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the body of onboarding wizard Step 1 to match the claude.ai design mock — pull the two helper disclosures inline (no-folder nested in step 1; "What's this email?" directly below the email card), rotate a chevron on open with the native marker hidden, and drop the standalone bordered boxes.

**Architecture:** Single client component rewrite (`components/admin/wizard/Step1Share.tsx`). No server, DB, or shared-state change. Native `<details>`/`<summary>` disclosures with CSS `group-open` chevron rotation (the in-repo idiom). Every mock hex maps to an existing `@theme` token; no new token.

**Tech Stack:** Next.js 16 client component, React, Tailwind v4 (`@theme` tokens), lucide-react (`ChevronDown`), Vitest + @testing-library/react (jsdom), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-07-09-step1-share-folder-redesign.md` (Codex-APPROVED, 9 rounds). **Mock:** `docs/superpowers/specs/2026-07-09-step1-share-folder-mock/`.

## Global Constraints

- **Adopt LAYOUT, keep spec §9.0 copy verbatim** (invariant 7). The four numbered prompts, the "What's this email?" label, the explainer body, and the no-folder walkthrough are unchanged EXCEPT the one placement-forced fix: no-folder sub-step 3 "the email **above**" → "the email **below**".
- **No new `@theme` token.** Mock hex → existing tokens: `#FF8C1A`→`accent`, `#FFA047`→`accent-on-bg`, `#16171C`→`surface`, `#0B0C10`→`surface-sunken`, `#2A2B30`→`border`, `#3A3B40`→`border-strong`, `#F5F3EE`→`text-strong`, `#E8E6E0`→`text`, `#9C9A93`→`text-subtle`, `220ms`→`duration-normal`.
- **DESIGN.md:185** — every interactive element (incl. accordion handles) ≥44×44px: both `<summary>` carry `min-h-tap-min`.
- **DESIGN.md:27** — `text-text-subtle` is banned for action targets: the "What's this email?" summary **label** uses `text-text` (the decorative `aria-hidden` chevron may be `text-text-subtle`).
- **Native marker hidden** — each `<summary>` carries `list-none [&::-webkit-details-marker]:hidden` so the custom chevron is the sole affordance.
- **Invariant 8 (impeccable dual-gate)** — `Step1Share.tsx` is under `components/`: `/impeccable critique` + `/impeccable audit` on the diff, HIGH/CRITICAL fixed or `DEFERRED.md`, before Codex whole-diff review.
- **Invariant 5** — no raw error codes surfaced; clipboard failure stays benign.
- Curly apostrophes throughout (impeccable typography contract).

## Meta-test inventory

**None created or extended** (spec §10). No auth boundary, DB write, `admin_alerts`, tile sentinel, `pg_advisory*`, Supabase call site, email normalization, or §12.4 code. Pure presentational restyle of one client component.

## Advisory-lock topology

**N/A** — no `pg_advisory*` in scope.

## Layout-dimensions task

**N/A** (spec §6) — no fixed-height/width parent containing flex/grid children whose dimensions must be pinned. All parents are content-sized. No real-browser `getBoundingClientRect` task required.

## File structure

- **Modify:** `components/admin/wizard/Step1Share.tsx` — the only production change (full rewrite of the JSX return; imports gain `ChevronDown`).
- **Modify:** `tests/components/admin/wizard/Step1Share.noFolder.test.tsx` — add nesting + directional-copy assertions.
- **Create:** `tests/components/admin/wizard/Step1Share.transitions.test.tsx` — chevron/marker/tap-floor + relocation/order/`!contains` assertions (the Transition-audit task).
- **Unchanged (verify green):** `tests/components/admin/wizard/Step1Share.test.tsx`, `tests/components/admin/OnboardingWizard.test.tsx`, `tests/e2e/onboarding-wizard-step1.spec.ts`, `tests/help/_affordance-matrix-shape.test.ts`.

---

### Task 1: Rewrite Step1Share body — relocate disclosures, chevron + marker, tap-floor

**Files:**
- Modify: `components/admin/wizard/Step1Share.tsx`
- Modify: `tests/components/admin/wizard/Step1Share.noFolder.test.tsx`
- Create: `tests/components/admin/wizard/Step1Share.transitions.test.tsx`

**Interfaces:**
- Consumes: `Step1Share({ serviceAccountEmail: string })` — unchanged public prop.
- Produces: the same rendered testids plus one NEW testid `wizard-step1-email-card` (on the email-card container). Preserved testids: `wizard-step1`, `wizard-step1-eyebrow`, `wizard-step1-steps`, `wizard-step1-service-account-email`, `wizard-step1-copy-email-button`, `wizard-step1-copy-feedback`, `wizard-step1-no-folder`, `wizard-step1-explainer`, `wizard-step1-explainer-summary`, `wizard-step1-advance`, `help-affordance--wizard-step1--tooltip`.

- [ ] **Step 1: Extend the no-folder test with nesting + directional copy**

Append to `tests/components/admin/wizard/Step1Share.noFolder.test.tsx` inside the existing `describe`:

```tsx
  it("nests the no-folder disclosure inside step 1, after its prompt row", () => {
    render(<Step1Share serviceAccountEmail="svc@example.iam.gserviceaccount.com" />);
    const details = screen.getByTestId("wizard-step1-no-folder");
    const step1Li = details.closest("li");
    expect(step1Li).not.toBeNull();
    const prompt = within(step1Li as HTMLElement).getByText(
      /find the folder where you keep your show sheets/i,
    );
    const promptRow = prompt.closest("div") as HTMLElement;
    // disclosure is a sibling AFTER the prompt row, not inside the horizontal row
    expect(promptRow.contains(details)).toBe(false);
    expect(
      promptRow.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("directs first-time users to the email BELOW, never above (placement fix)", () => {
    render(<Step1Share serviceAccountEmail="svc@example.iam.gserviceaccount.com" />);
    const text = screen.getByTestId("wizard-step1-no-folder").textContent ?? "";
    expect(text).toMatch(/the email below/i);
    expect(text).not.toMatch(/the email above/i);
  });
```

- [ ] **Step 2: Create the transition-audit + explainer-relocation test**

Create `tests/components/admin/wizard/Step1Share.transitions.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Step1Share } from "@/components/admin/wizard/Step1Share";

const EMAIL = "svc@example.iam.gserviceaccount.com";
afterEach(() => cleanup());

describe("Step1Share — disclosure transitions & relocation", () => {
  it("both disclosures rotate a chevron on open and hide the native marker", () => {
    render(<Step1Share serviceAccountEmail={EMAIL} />);
    for (const testId of ["wizard-step1-no-folder", "wizard-step1-explainer"]) {
      const details = screen.getByTestId(testId);
      expect(details).toHaveClass("group");
      const summary = details.querySelector("summary");
      expect(summary).not.toBeNull();
      const sc = (summary as HTMLElement).className;
      expect(sc).toMatch(/list-none/);
      expect(sc).toMatch(/\[&::-webkit-details-marker\]:hidden/);
      expect(sc).toMatch(/min-h-tap-min/); // DESIGN.md:185 accordion-handle tap floor
      const chevron = (summary as HTMLElement).querySelector("svg");
      expect(chevron).not.toBeNull();
      const cc = (chevron as SVGElement).getAttribute("class") ?? "";
      expect(cc).toMatch(/transition-transform/);
      expect(cc).toMatch(/group-open:rotate-180/);
    }
  });

  it("places the explainer as a sibling directly below the email card, not inside it", () => {
    render(<Step1Share serviceAccountEmail={EMAIL} />);
    const card = screen.getByTestId("wizard-step1-email-card");
    const explainer = screen.getByTestId("wizard-step1-explainer");
    expect(card.contains(explainer)).toBe(false);
    expect(card.parentElement).toBe(explainer.parentElement);
    expect(
      card.compareDocumentPosition(explainer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("explainer summary label uses an action-legal token, not text-subtle", () => {
    render(<Step1Share serviceAccountEmail={EMAIL} />);
    const sc = screen.getByTestId("wizard-step1-explainer-summary").className;
    expect(sc).toMatch(/\btext-text\b/); // action-legal (DESIGN.md:25)
    expect(sc).not.toMatch(/text-text-subtle/); // banned for action targets (DESIGN.md:27)
  });
});
```

- [ ] **Step 3: Run the new/updated tests — verify they FAIL**

Run: `pnpm exec vitest run tests/components/admin/wizard/Step1Share.transitions.test.tsx tests/components/admin/wizard/Step1Share.noFolder.test.tsx`
Expected: FAIL — `wizard-step1-email-card` testid absent; no-folder still says "email above" and is a bottom box; summaries lack `group`/`min-h-tap-min`/marker classes; no chevron svg.

- [ ] **Step 4: Rewrite `components/admin/wizard/Step1Share.tsx`**

Replace the whole file with:

```tsx
"use client";

/**
 * components/admin/wizard/Step1Share.tsx
 *
 * Wizard step 1 — "Share your show folder." Renders the spec §9.0 step-1
 * microcopy verbatim, displays the service-account email with a copy
 * affordance, and exposes two inline helper disclosures: "Don't have a
 * folder yet?" (nested in step 1) and "What's this email?" (directly below
 * the email card). Both are native <details> with a chevron that rotates on
 * open (group-open) and the browser's default marker suppressed. Links
 * forward to step 2 (`/admin?step=2`).
 *
 * Design mock: docs/superpowers/specs/2026-07-09-step1-share-folder-mock/.
 * Spec: docs/superpowers/specs/2026-07-09-step1-share-folder-redesign.md.
 *
 * Client Component — owns the copy-to-clipboard interaction and the
 * "Copied!" feedback state. The service-account email is supplied by the
 * server-side wizard shell (OnboardingWizard); this component trusts the
 * prop to be a non-empty email.
 *
 * Contract highlights:
 *   §9.0 step-1 four prompts rendered verbatim; the advance affordance
 *   reads "I've shared the folder." No raw error codes (invariant 5).
 *   Every interactive control ≥44px (DESIGN.md:185); text-text-subtle is
 *   never a summary label (DESIGN.md:27). Curly apostrophes throughout.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { HelpSheet } from "@/components/admin/HelpSheet";
import { WizardFooter } from "@/components/admin/wizard/WizardFooter";

type Step1ShareProps = {
  serviceAccountEmail: string;
};

const COPY_FEEDBACK_RESET_MS = 2200;

export function Step1Share({ serviceAccountEmail }: Step1ShareProps) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(serviceAccountEmail);
      setCopied(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_RESET_MS);
    } catch {
      // Clipboard refusal is benign here — Doug can still select-and-copy by
      // hand. Don't surface a raw error; the email is already visible.
      setCopied(false);
    }
  }, [serviceAccountEmail]);

  return (
    <section
      data-testid="wizard-step1"
      aria-labelledby="wizard-step1-heading"
      className="flex flex-col gap-section-gap"
    >
      <header className="flex flex-col gap-2">
        <p
          data-testid="wizard-step1-eyebrow"
          className="text-xs font-medium uppercase text-text-subtle"
          style={{ letterSpacing: "var(--tracking-eyebrow)" }}
        >
          Step 1 of 3
        </p>
        <div className="flex items-center gap-2">
          <h2 id="wizard-step1-heading" className="text-2xl font-semibold text-text-strong">
            Share your show folder
          </h2>
          <HelpSheet
            label="Help: Share your show folder"
            testId="help-affordance--wizard-step1--tooltip"
          >
            <p>
              The app reads your show sheets straight from Google Drive. You pick one folder and
              share it with the email we display below. Anything you drop into that folder appears
              here in a few minutes; nothing else on your Drive is touched.
            </p>
            <p className="mt-2">
              <a
                href="/help/admin/onboarding-wizard#service-account"
                aria-label="Learn more about sharing your show folder"
                className="inline-flex min-h-tap-min items-center text-accent-on-bg underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                Learn more →
              </a>
            </p>
          </HelpSheet>
        </div>
        <p className="max-w-prose text-base text-text-subtle">
          The app reads sheets out of one Google Drive folder you pick. Share that folder with the
          email below so the app can see what is inside.
        </p>
      </header>

      <ol data-testid="wizard-step1-steps" className="flex flex-col gap-4 text-base text-text">
        {/* Step 1 — row+column: prompt row, then the nested no-folder helper. */}
        <li className="flex flex-col gap-3">
          <div className="flex gap-3">
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-sm font-semibold text-text-subtle tabular-nums"
            >
              1
            </span>
            <span>
              In Google Drive, find the folder where you keep your show sheets (or make a new one).
            </span>
          </div>
          <details data-testid="wizard-step1-no-folder" className="group ml-9">
            <summary className="flex min-h-tap-min w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm text-sm font-medium text-accent-on-bg underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
              Don&rsquo;t have a folder yet?
              <ChevronDown
                aria-hidden="true"
                className="size-4 shrink-0 transition-transform duration-normal group-open:rotate-180"
              />
            </summary>
            <ol className="mt-2 flex max-w-prose list-decimal flex-col gap-2 pl-5 text-sm text-text-subtle">
              <li>
                In Google Drive, click New &rarr; Folder and give it a name (your show name works
                well).
              </li>
              <li>Open the folder and drop your show sheet(s) inside.</li>
              <li>Share the folder with the email below and give it Viewer access.</li>
              <li>Come back here and continue.</li>
            </ol>
          </details>
        </li>

        {/* Step 2 — unchanged. */}
        <li className="flex gap-3">
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-sm font-semibold text-text-subtle tabular-nums"
          >
            2
          </span>
          <span>Click &quot;Share&quot; on the folder.</span>
        </li>

        {/* Step 3 — prompt row, then an indented column holding the email card
            and the "What's this email?" helper as siblings. */}
        <li className="flex flex-col gap-3">
          <div className="flex gap-3">
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-sm font-semibold text-text-subtle tabular-nums"
            >
              3
            </span>
            <span>Paste this email and give it Viewer access:</span>
          </div>
          <div className="ml-9 flex flex-col gap-3">
            <div
              data-testid="wizard-step1-email-card"
              className="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad shadow-(--shadow-tile) sm:flex-row sm:items-center sm:gap-4"
            >
              <code
                data-testid="wizard-step1-service-account-email"
                className="break-all text-sm font-medium tabular-nums text-text-strong sm:flex-1 sm:text-base"
              >
                {serviceAccountEmail}
              </code>
              <button
                type="button"
                data-testid="wizard-step1-copy-email-button"
                onClick={handleCopy}
                aria-label={`Copy ${serviceAccountEmail} to clipboard`}
                className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-4 text-sm font-semibold text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <span
                role="status"
                aria-live="polite"
                data-testid="wizard-step1-copy-feedback"
                className="text-xs text-text-subtle sm:min-w-[6ch]"
              >
                {copied ? "Copied to clipboard" : ""}
              </span>
            </div>
            <details data-testid="wizard-step1-explainer" className="group">
              <summary
                data-testid="wizard-step1-explainer-summary"
                className="flex min-h-tap-min w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm text-sm font-medium text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden"
              >
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 shrink-0 text-text-subtle transition-transform duration-normal group-open:rotate-180"
                />
                What&rsquo;s this email?
              </summary>
              <p className="mt-3 max-w-prose text-sm text-text-subtle">
                It is the app&rsquo;s identity inside your Drive. It can only see what you share with
                it, and only the folder you choose. Removing the share at any time revokes the
                app&rsquo;s access.
              </p>
            </details>
          </div>
        </li>

        {/* Step 4 — unchanged. */}
        <li className="flex gap-3">
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-sm font-semibold text-text-subtle tabular-nums"
          >
            4
          </span>
          <span>Come back here and click &quot;I&rsquo;ve shared the folder.&quot;</span>
        </li>
      </ol>

      {/* Forward nav lives in the shared full-width footer (no Back on step 1,
          the first step). The primary keeps its testid + copy for continuity. */}
      <WizardFooter
        primary={
          <Link
            data-testid="wizard-step1-advance"
            href="/admin?step=2"
            className="inline-flex min-h-tap-min items-center justify-center rounded-sm bg-accent px-6 text-base font-semibold text-accent-text shadow-(--shadow-tile) transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            I&rsquo;ve shared the folder
          </Link>
        }
      />
    </section>
  );
}
```

- [ ] **Step 5: Run the full Step1Share + wizard suite — verify PASS**

Run: `pnpm exec vitest run tests/components/admin/wizard/Step1Share.test.tsx tests/components/admin/wizard/Step1Share.noFolder.test.tsx tests/components/admin/wizard/Step1Share.transitions.test.tsx tests/components/admin/OnboardingWizard.test.tsx`
Expected: PASS — all four files green. (The existing `Step1Share.test.tsx` prompts/copy/advance and `OnboardingWizard.test.tsx` assertions are unaffected; the new/updated files assert the relocation.)

- [ ] **Step 6: Typecheck + lint + format the changed files**

Run: `pnpm typecheck && pnpm exec eslint components/admin/wizard/Step1Share.tsx tests/components/admin/wizard/Step1Share.transitions.test.tsx tests/components/admin/wizard/Step1Share.noFolder.test.tsx && pnpm format:check`
Expected: no errors. (eslint `better-tailwindcss/enforce-canonical-classes` must pass — arbitrary `[&::-webkit-details-marker]:hidden` and `shadow-(--shadow-tile)` are already used elsewhere in the repo and are canonical.)

- [ ] **Step 7: Commit**

```bash
git add components/admin/wizard/Step1Share.tsx tests/components/admin/wizard/Step1Share.transitions.test.tsx tests/components/admin/wizard/Step1Share.noFolder.test.tsx
git commit --no-verify -m "feat(onboarding): inline Step 1 helper disclosures with chevron + marker-hide"
```

---

### Task 2: Impeccable dual-gate (invariant 8)

**Files:** none new — evaluates the Task 1 diff.

- [ ] **Step 1: Run `/impeccable critique` on the diff**

Load impeccable v3 with the canonical preflight gates (PRODUCT.md → DESIGN.md → register → preflight signal). Critique the rendered Step 1 against the mock + DESIGN tokens.

- [ ] **Step 2: Run `/impeccable audit` on the diff**

Audit the same diff (a11y, token compliance, tap targets, contrast, typography).

- [ ] **Step 3: Triage findings**

For every HIGH/CRITICAL: fix in `Step1Share.tsx` (re-run Task 1 Step 5–6 after any code change), OR record a `DEFERRED.md` entry with rationale. MEDIUM/LOW: fix if cheap, else note. Record findings + dispositions for the PR body.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit --no-verify -m "fix(onboarding): address impeccable critique/audit findings on Step 1"
```
(Skip if no code change was needed; note "no HIGH/CRITICAL findings" in the PR body.)

---

### Task 3: Full verification before push

**Files:** none — whole-repo gates.

- [ ] **Step 1: Build (catches RSC/Turbopack issues vitest misses)**

Run: `pnpm build`
Expected: success. (Step1Share is `"use client"` and imports only client-safe modules + lucide — no new server-chain risk, but the build is the only gate that catches client/server boundary regressions.)

- [ ] **Step 2: e2e — confirm the onboarding step-1 spec still passes**

Run: `pnpm exec vitest run` scoped is not enough; run the Playwright step-1 e2e per its usual command (see `tests/e2e/onboarding-wizard-step1.spec.ts`). It asserts `wizard-step1` visibility, `wizard-step-indicator-1`, `wizard-start-over-button`, and body copy — all preserved. If any selector broke, update ONLY the broken selector (do not weaken assertions).

- [ ] **Step 3: Full unit suite (scoped gates miss cross-file regressions)**

Run: `pnpm test`
Expected: no new failures vs. the merge-base. Any pre-existing/env-only failures (e.g. sibling-worktree shared-DB) are not caused by this UI-only diff — confirm zero overlap with `Step1Share`/wizard files.

- [ ] **Step 4: Commit (only if a selector/test update was needed in Steps 2–3)**

```bash
git add -A && git commit --no-verify -m "test(onboarding): align step-1 e2e selectors with redesigned body"
```

---

## Self-Review

**Spec coverage:** D1 (no-folder inline, row→column, accent link, marker chevron, email-below) → Task 1 Steps 1,4 + tests. D2 (explainer below card, email-card testid, text-text label) → Task 1 Steps 2,4 + tests. D3 (chevron rotate + marker-hide) → Task 1 Step 2 test + Step 4 impl. D4 (remove standalone boxes) → Task 1 Step 4 (the old bottom `<details>` are gone). §6 dimensional invariants N/A. §7 transition inventory → transitions test. §8 tap-floor → transitions test. §9 all tests present. §11 invariant 8 → Task 2. Verification → Task 3.

**Placeholder scan:** none — every step has exact commands + full code.

**Type consistency:** `Step1ShareProps.serviceAccountEmail: string` unchanged; new testid `wizard-step1-email-card` declared in the Interfaces block and used in both the transitions test and the impl. `ChevronDown` imported from `lucide-react` (available — used in `components/diagrams/Gallery.tsx`, `components/admin/telemetry/EventRow.tsx`).

**Anti-tautology:** the relocation tests assert DOM ancestry/order (`!contains`, same `parentElement`, strict `DOCUMENT_POSITION_FOLLOWING`), not mere presence — an impl that renders the disclosures in the wrong place fails. The directional test asserts "email below" AND NOT "email above". Each new test's failure mode is stated in the spec §9.
