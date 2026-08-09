/**
 * tests/e2e/canonical-class-dimensions.spec.ts — AC-11.
 *
 * Spec: docs/superpowers/specs/2026-08-07-classname-array-join-cn.md §9.4
 * Plan: docs/superpowers/plans/2026-08-07-classname-array-join-cn.md, Task 5
 *
 * WHAT THIS PROVES, AND WHY A ONE-SIDED BOUND WOULD NOT. Two of the six stage-2
 * canonicalizations touch a SIZING utility rather than a shorthand:
 *
 *   C1  OnboardingWizard  `max-w-[60px]` → `max-w-confirm-box`
 *   C5  RightNowHero      `min-h-(--spacing-right-now-min-h)` → `min-h-right-now-min-h`
 *
 * Both are claimed equivalent because the token carries the same value. That claim is
 * only checkable against a measurement taken BEFORE the fix lands: "width ≤ token" passes
 * on a box that went 45px → 55px, and "height ≥ token" passes on 200px → 176px. So the
 * harness and the capture are their own task, and the canonicalization that must not
 * disturb them comes second.
 *
 * The tree at capture time is MIGRATED but NOT canonicalized. Stage 1 changed no class
 * token (spec §4), so the geometry recorded here is identical to base — which is what
 * makes it a valid baseline for a change that lands after it.
 *
 * CAPTURE/VERIFY IS FAIL-CLOSED IN BOTH DIRECTIONS, because a baseline the verifier can
 * write is an oracle the verifier can bless:
 *
 *   - VERIFY (the default, and the only mode CI ever runs). Baseline present → compare
 *     every recorded rect within 0.5px, and fail on a missing key, an extra key, or a
 *     count mismatch, not only on a moved rect. Baseline MISSING → hard fail naming the
 *     capture command. Never measure-and-write, never skip: a deleted or never-committed
 *     oracle is a loud red, not a silent regeneration.
 *   - CAPTURE (`CAPTURE_CANONICAL_DIMENSIONS=1`, explicit, local-only). Measure, write
 *     the JSON, then FAIL THE RUN ANYWAY. Failing on capture is what makes self-blessing
 *     impossible even if the variable ever leaked into CI: a capture run can never report
 *     green, so no pipeline can both regenerate the oracle and pass on it in one
 *     execution. The workflow invocation sets no such variable.
 *
 * REST-STATE RECTS ONLY — the mid-crossfade sampler is DESCOPED, deliberately (plan
 * Task 5). C5 changes no value by construction: `min-h-(--spacing-right-now-min-h)` and
 * `min-h-right-now-min-h` are two spellings of the SAME `@theme` token
 * (`app/globals.css`), with no arithmetic between them and nothing for a transition to
 * expose. What replaces the sampler is stronger for the risk that actually exists — that
 * a canonical utility resolves to a different value than the form it replaced — and that
 * is a token question, answered deterministically in `tests/specLint/canonicalTokenIdentity.test.ts`.
 *
 * NAME. It must not substring-match an existing `testMatch` alternative: `layout-dimensions`
 * appears in BOTH projects' regexes (`playwright.config.ts`), so `canonical-layout-dimensions`
 * would silently match both and mobile-safari-only execution could not then be established.
 * `canonical-class-dimensions` matches neither, and an explicit alternative is added to the
 * mobile-safari project only. The config's own comment warns that "a spec absent from this
 * regex runs NOWHERE and silently proves nothing."
 */
import fs from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { enterWizardAdminState } from "./helpers/dashboardState";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { admin } from "./helpers/supabaseAdmin";
import { TEST_AUTH_SECRET } from "./helpers/testAuthConfig";

const BASELINE_PATH = path.join(process.cwd(), "tests/e2e/__baselines__/canonical-dimensions.json");
const CAPTURE = process.env.CAPTURE_CANONICAL_DIMENSIONS === "1";
const TOLERANCE_PX = 0.5;

const CAPTURE_COMMAND =
  "CAPTURE_CANONICAL_DIMENSIONS=1 pnpm exec playwright test --project=mobile-safari " +
  "tests/e2e/canonical-class-dimensions.spec.ts";

/**
 * The seeded show, and the show-day-1 instant the SERVER clock is pinned to. Both are
 * replicated from `tests/e2e/crew-layout-dimensions.spec.ts` rather than imported: that
 * file's `lookupSeededShow`, `lookupShareToken`, `SHOW_DAY_1_INSTANT`, and `gotoSection`
 * are all MODULE-PRIVATE, and editing it to export them would put a file outside this
 * arc's declared delta (plan C4 step 4.3) under a second writer. The replicas copy the
 * BEHAVIOR — query, guards, error-message shape — parameterized where the originals close
 * over suite state, with each Supabase call written in invariant-9 form.
 */
const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";
const SHOW_DAY_1_INSTANT = "2026-04-21T12:00:00Z";

/** One `getBoundingClientRect()` box, rounded to the tolerance's precision. */
type Rect = { x: number; y: number; width: number; height: number };
type Baseline = Record<string, Rect>;

/**
 * The measured targets. Cardinality is part of the contract, not an implementation
 * detail: the step connector renders after each of steps 1 and 2
 * (`components/admin/OnboardingWizard.tsx`, `n < 3`), so
 * `[data-testid=wizard-step-connector]` matches TWO elements and both carry the C1 class
 * string. A singular locator would either fail strict-mode or silently verify one
 * connector and leave the other's geometry unproven.
 */
const KEYS = ["wizard-step-connector-0", "wizard-step-connector-1", "right-now-hero-card"] as const;

async function rectOf(locator: Locator): Promise<Rect> {
  const box = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  return box;
}

function readBaseline(): Baseline | null {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as Baseline;
}

/**
 * Every compared field must be a FINITE NUMBER, checked at runtime.
 *
 * The JSON was previously cast to `Baseline` and trusted. That fails OPEN in the worst
 * possible way: a missing `width` yields `undefined`, `Math.abs(measured - undefined)` is
 * `NaN`, and `NaN > 0.5` is FALSE — so a baseline of three correctly-named EMPTY objects
 * passes the key-set assertion and then silently accepts any geometry at all. A numeric
 * string coerces the same way. An oracle that cannot be read is a loud failure, not a pass.
 */
function malformedRectFields(baseline: Baseline): string[] {
  const bad: string[] = [];
  for (const key of KEYS) {
    const rect = baseline[key] as Record<string, unknown> | undefined;
    if (rect === undefined || rect === null || typeof rect !== "object") {
      bad.push(`${key}: not an object`);
      continue;
    }
    for (const axis of ["x", "y", "width", "height"] as const) {
      const value = rect[axis];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        bad.push(`${key}.${axis}: ${JSON.stringify(value)} is not a finite number`);
      }
    }
  }
  return bad;
}

/** invariant-9 form; replicated from crew-layout-dimensions.spec.ts (module-private there). */
async function lookupSeededShow(): Promise<{ slug: string; showId: string }> {
  // not-subject-to-meta: e2e test scaffolding — a returned error is converted to an
  // immediate throw that aborts the spec, so there is no infra-vs-benign ambiguity left to
  // type; the thrown message carries the query context and the db:seed remedy.
  const { data, error } = await admin
    .from("shows")
    .select("id, slug")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (error || !data) {
    throw new Error(
      `canonical-class-dimensions.spec: seeded show not found (run \`pnpm db:seed\` first). ` +
        `drive_file_id=${SEED_DRIVE_FILE_ID}, error=${error?.message ?? "no row"}`,
    );
  }
  return { slug: data.slug as string, showId: data.id as string };
}

/** invariant-9 form; replicated from crew-layout-dimensions.spec.ts (module-private there). */
async function lookupShareToken(showId: string): Promise<string> {
  // not-subject-to-meta: e2e test scaffolding — see the waiver on lookupSeededShow above.
  const { data, error } = await admin
    .from("show_share_tokens")
    .select("share_token")
    .eq("show_id", showId)
    .limit(1)
    .maybeSingle();
  if (error || !data?.share_token) {
    throw new Error(
      `canonical-class-dimensions.spec: no share_token for show ${showId} (run \`pnpm db:seed\`). ` +
        `error=${error?.message ?? "no row"}`,
    );
  }
  return data.share_token as string;
}

test.describe("canonical-class sizing deltas do not move geometry (AC-11)", () => {
  // Cold render of the crew shell and the admin wizard both touch wide module graphs.
  test.setTimeout(180_000);

  let restoreAdminState: (() => Promise<void>) | null = null;
  let slug = "";
  let shareToken = "";

  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return; // single-writer: mobile-safari only
    // `/admin` renders the wizard only when `watched_folder_id` is NULL, and the seed sets
    // it. Without this the connector is absent and there is nothing to measure.
    restoreAdminState = await enterWizardAdminState();
    const seeded = await lookupSeededShow();
    slug = seeded.slug;
    shareToken = await lookupShareToken(seeded.showId);
  });

  test.afterAll(async ({}, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    if (restoreAdminState) await restoreAdminState();
  });

  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
    // Pin the SERVER's `today` to show-day-1 — TodaySection reads the server-supplied
    // `today`, NOT a browser clock. The :3000 webServer carries ENABLE_TEST_AUTH=true and
    // this exact TEST_AUTH_SECRET, so nowDate() honors the frozen-now header.
    await page.setExtraHTTPHeaders({
      "X-Screenshot-Frozen-Now": SHOW_DAY_1_INSTANT,
      Authorization: `Bearer ${TEST_AUTH_SECRET}`,
    });
  });

  /**
   * C1 — the step-indicator connector rule. TWO elements, both measured.
   *
   * DOCUMENTED LIMIT, MEASURED AND PINNED RATHER THAN LEFT SILENT: `max-w-[60px]` is
   * INERT on this surface, so the rect comparison for these two keys is a REGRESSION
   * TRIPWIRE, not a discriminating check for C1.
   *
   * Measured 2026-08-08: both connectors are 0×1 at every viewport, and the reason is
   * structural rather than a viewport threshold. `StepIndicator`'s `<nav>` is
   * `flex items-center gap-2`, and it sits inside `<div className="flex items-center
   * justify-between gap-3">` (`components/admin/OnboardingWizard.tsx`) — a ROW flex
   * container, in which the nav is a flex ITEM with the default `flex: 0 1 auto` and
   * therefore sizes to its CONTENT. A content-sized flex container has no free space to
   * distribute, so the connector's `flex-1` resolves to 0 and its `max-w` upper bound
   * never applies. Widening the viewport does not change that; the nav simply stays as
   * wide as its pills and labels.
   *
   * So an equality assertion on these rects is 0 == 0 both before and after the
   * canonicalization. Per this repo's anti-tautology rule, that is surfaced here instead
   * of being shipped as a check that "passes": C1's DISCRIMINATING proof is the
   * deterministic token assertion in `tests/specLint/canonicalTokenIdentity.test.ts`
   * (`--spacing-confirm-box` is exactly the `60px` the bracket literal encoded), which is
   * the same substitution the plan already made when it descoped the mid-crossfade
   * sampler — a canonical utility resolving to a different value is a TOKEN question, and
   * a token question is answered deterministically, not in a browser.
   *
   * The tripwire still earns its place: it fails the moment the connector becomes
   * non-degenerate (someone stretches the nav), which is exactly when `max-w` becomes
   * live and this target would need to become a real check again.
   *
   * The hero (C5) is different and IS discriminating: `min-h` is a LOWER bound that binds
   * at every width, and 176px is its whole contract.
   */
  const PROJECT_VIEWPORT = { width: 390, height: 844 };

  async function measureConnectors(page: Page): Promise<Record<string, Rect>> {
    await page.setViewportSize(PROJECT_VIEWPORT);
    const response = await page.goto("/admin", { waitUntil: "domcontentloaded" });
    expect(response?.status(), "/admin must render").toBe(200);
    await expect(page.getByTestId("onboarding-wizard")).toBeVisible();

    const connectors = page.getByTestId("wizard-step-connector");
    // Reachability premise: a measurement on an absent element is the failure this exists
    // to prevent, and a singular assumption is a strict-mode failure waiting to happen.
    await expect(
      connectors,
      "the wizard renders a connector after each of steps 1 and 2 (n < 3), so exactly TWO " +
        "must be present. Zero means /admin did not take the wizard branch — check that " +
        "enterWizardAdminState() ran and that app_settings.watched_folder_id is NULL.",
    ).toHaveCount(2);
    // Attached, NOT visible: a 0-width box is `hidden` to Playwright, which is itself the
    // measured limit documented above rather than a defect in this locator.
    await expect(connectors.nth(0)).toBeAttached();

    const first = await rectOf(connectors.nth(0));
    const second = await rectOf(connectors.nth(1));

    // THE LIMIT, STATED EXECUTABLY AND IN THE DIRECTION IT IS ACTUALLY TRUE. This is not a
    // premise the rect comparison needs — it is the reason that comparison cannot
    // discriminate, pinned so it cannot rot into a silent tautology. If the connector ever
    // becomes non-degenerate, `max-w` has gone live, this target upgrades from tripwire to
    // real check, and spec §9.4 needs revisiting — which is what this failure says.
    expect(
      { first: first.width, second: second.width },
      "the step connectors are no longer 0-width. `max-w-[60px]` was INERT when this spec " +
        "was written — StepIndicator's <nav> is a content-sized flex item inside a row flex " +
        "container, so its `flex-1` connectors get no free space and the max-width upper " +
        "bound never applies. A non-zero width means that layout changed and `max-w` is now " +
        "live: re-derive spec §9.4, and turn these two keys back into a discriminating check " +
        "for C1 instead of the regression tripwire they are today.",
    ).toEqual({ first: 0, second: 0 });

    return { "wizard-step-connector-0": first, "wizard-step-connector-1": second };
  }

  /** C5 — the RightNowHero card on the seeded crew route, at the project's own viewport. */
  async function measureHero(page: Page): Promise<Record<string, Rect>> {
    await page.setViewportSize(PROJECT_VIEWPORT);
    const response = await page.goto(`/show/${slug}/${shareToken}?s=today`, {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status(), `crew route /show/${slug}/${shareToken}?s=today must render`).toBe(
      200,
    );
    await expect(page.getByTestId("crew-shell")).toBeVisible();
    await expect(page.getByTestId("section-today")).toBeVisible();

    const hero = page.getByTestId("right-now-hero");
    await expect(hero).toBeVisible();

    // READINESS GATE — never `networkidle` alone, and never an immediate read.
    // CrewSectionTransition wraps the section body in a framer `motion.div` with
    // `initial={{opacity:0,y:4}}`, so a read taken at the pre-commit frame catches the
    // subtree at height 0 — and a rect assertion then passes TAUTOLOGICALLY against a
    // baseline captured the same way. Wait for a real laid-out height before measuring.
    await expect
      .poll(async () => (await rectOf(hero)).height, { timeout: 15_000 })
      .toBeGreaterThan(1);
    // And for the height to STOP moving, so the sample is a rest state rather than a
    // frame of the enter animation.
    let previous = -1;
    await expect
      .poll(
        async () => {
          const height = (await rectOf(hero)).height;
          const settled = Math.abs(height - previous) < 0.01 && height > 1;
          previous = height;
          return settled;
        },
        { timeout: 15_000 },
      )
      .toBe(true);

    return { "right-now-hero-card": await rectOf(hero) };
  }

  test("rest-state rects match the pre-canonicalization baseline within 0.5px", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;

    const measured: Baseline = {
      ...(await measureConnectors(page)),
      ...(await measureHero(page)),
    };

    // Premise: the measurement produced every key the contract names. Without this, a
    // navigation that silently rendered the wrong surface would compare an empty object
    // against an empty baseline and pass.
    expect(
      Object.keys(measured).sort(),
      "the measurement did not produce the declared target set",
    ).toEqual([...KEYS].sort());

    if (CAPTURE) {
      fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
      fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(measured, null, 2)}\n`, "utf8");
      // FAIL ON CAPTURE, deliberately. A capture run can never report green, so no
      // pipeline can both regenerate the oracle and pass on it in one execution.
      throw new Error(
        `baseline captured to ${path.relative(process.cwd(), BASELINE_PATH)} — re-run WITHOUT ` +
          "CAPTURE_CANONICAL_DIMENSIONS=1 to verify against it.\n" +
          JSON.stringify(measured, null, 2),
      );
    }

    const baseline = readBaseline();
    expect(
      baseline,
      `baseline ${path.relative(process.cwd(), BASELINE_PATH)} is MISSING. This spec never ` +
        "regenerates it on the fly — a verifier that can write its own oracle proves nothing. " +
        `Capture it deliberately, against a tree that is migrated but NOT yet canonicalized:\n  ${CAPTURE_COMMAND}`,
    ).not.toBeNull();
    const oracle = baseline as Baseline;

    // Fail on a missing key, an extra key, or a count mismatch — not only on a moved rect.
    expect(
      Object.keys(oracle).sort(),
      "the committed baseline's key set does not match the measured target set",
    ).toEqual([...KEYS].sort());

    // ...and on a key whose rect is present but unreadable. Without this the comparison
    // below fails open: NaN never exceeds the tolerance.
    expect(
      malformedRectFields(oracle),
      `the committed baseline at ${path.relative(process.cwd(), BASELINE_PATH)} has fields that ` +
        "are not finite numbers. Every comparison against them would silently pass. Re-capture " +
        `it deliberately:\n  ${CAPTURE_COMMAND}`,
    ).toEqual([]);

    const drifted: string[] = [];
    for (const key of KEYS) {
      const measuredRect = measured[key];
      const baselineRect = oracle[key];
      // Both key-set assertions above already guarantee these; this is the typechecker's
      // share of the same claim, and it fails loudly rather than skipping a target.
      expect(measuredRect, `measured rect missing for ${key}`).toBeDefined();
      expect(baselineRect, `baseline rect missing for ${key}`).toBeDefined();
      if (measuredRect === undefined || baselineRect === undefined) continue;

      // COMPARED: width and height. RECORDED BUT NOT COMPARED: x and y.
      //
      // C1 is a `max-w` and C5 is a `min-h` — both are SIZE constraints, so width/height
      // is the whole of the claim "the canonicalization did not change the rendered
      // geometry." Position is a different claim (nothing above these elements changed
      // size), already carried for all 18 files by the operand-parity script and the
      // token-identity test.
      //
      // And position is the axis that does not travel. This baseline is captured on a dev
      // machine and verified on the Linux CI runner, and x/y here are downstream of text
      // metrics — the connector's x is the width of the pills and labels to its left
      // (130.09375px), the hero's y is everything stacked above it (159.859375px). Both
      // are exactly the sub-pixel, font-rendering-dependent values this repo's
      // byte-comparison lesson says not to pin across environments. width/height by
      // contrast land on token-clamped values (the hero is exactly its 176px `min-h`),
      // which is what makes them portable AND what makes them the discriminating axes.
      // They stay in the JSON because a diagnostic is cheap and a re-derivation is not.
      for (const axis of ["width", "height"] as const) {
        const delta = Math.abs(measuredRect[axis] - baselineRect[axis]);
        if (delta > TOLERANCE_PX) {
          drifted.push(
            `${key}.${axis}: baseline ${baselineRect[axis]}, measured ${measuredRect[axis]} (Δ${delta.toFixed(3)}px)`,
          );
        }
      }
    }

    expect(
      drifted,
      "a canonicalization moved real geometry. Spec §6 claims C1 and C5 are value-identical " +
        "(`--spacing-confirm-box: 60px` is exactly what `max-w-[60px]` encoded; " +
        "`min-h-right-now-min-h` is the same token the arrow form referenced). A drift here " +
        "means that claim is wrong — re-derive spec §6 and §9.4. Do NOT recapture the baseline " +
        "to get past this: the baseline is the pre-change measurement, and rewriting it erases " +
        "the only evidence the change was safe.",
    ).toEqual([]);
  });
});
