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

import { premiseHolds } from "../_shared/premise";
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
   * C1 — the step-indicator connector. TWO elements, both measured, at every
   * step and both widths.
   *
   * THIS COMMENT HAS BEEN WRONG TWICE, so it now states only what is currently
   * true and dates it. It first described the connectors as 0×1 and the rect
   * keys as a non-discriminating tripwire; that was accurate until the nav
   * stopped being content-sized. It was then rewritten to describe a stretched
   * nav with `flex-1`; that was accurate for about an hour. Cross-model review
   * R1 caught the second version still contradicting production.
   *
   * TRUE AS OF 2026-08-10: the connector sets `w-confirm-box` (a fixed 60px)
   * and the nav is content-width. Measurement is what settled it — the
   * connectors landed on exactly 60.00px in all twelve step × viewport × theme
   * cells even while `flex-1` was on the nav, so the grow never fired and only
   * displaced dead space (16-80px at 390px, 257.77px at 900px step 3).
   *
   * The rect assertion is therefore DISCRIMINATING, not a tripwire: the width
   * is a fixed contract now, so it is asserted as equality rather than a band.
   * The colour and visibility oracles below cover what geometry cannot see.
   */
  const PROJECT_VIEWPORT = { width: 390, height: 844 };
  /** `--spacing-confirm-box`, the token `max-w-confirm-box` resolves to. */
  const CONFIRM_BOX_PX = 60;
  /** Both widths the band is proven at: the project's own, and a wide one. */
  const BAND_VIEWPORTS = [390, 900] as const;

  /**
   * A CSS custom property's value, NORMALISED THROUGH THE ENGINE rather than
   * string-compared. `getPropertyValue("--color-text-faint")` returns the token's
   * authored text (`oklch(…)`), and `getComputedStyle(el).backgroundColor`
   * returns a resolved `rgb(…)` — comparing those two as strings fails on a
   * correct implementation. Painting the token onto a probe and reading the
   * computed value back puts both sides in the same space.
   */
  async function resolvedToken(page: Page, token: string): Promise<string> {
    return page.evaluate((name) => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      const probe = document.createElement("div");
      probe.style.backgroundColor = raw;
      document.body.appendChild(probe);
      const out = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return out;
    }, token);
  }

  /**
   * The WCAG contrast ratio between an element's own background and the first
   * opaque thing behind it, computed IN THE PAGE from resolved colours.
   *
   * `strong !== plain` was the whole colour assertion, and review R1 showed
   * what that misses: set `--color-text-faint-runtime` to the page background
   * and the ahead connector goes invisible while the tokens still differ and
   * every assertion stays green. "The two tokens are not equal" is a much
   * weaker claim than "each line can be seen", and the second is the one
   * DESIGN.md §1.2a actually makes.
   */
  async function contrastAgainstBackdrop(page: Page, selector: string, nth: number) {
    return page.evaluate(
      ({ sel, index }) => {
        const parse = (c: string): [number, number, number] => {
          const m = c.match(/rgba?\(([^)]+)\)/);
          if (!m) return [0, 0, 0];
          const [r, g, b] = m[1]!.split(",").map((v) => parseFloat(v));
          return [r ?? 0, g ?? 0, b ?? 0];
        };
        const alphaOf = (c: string): number => {
          const m = c.match(/rgba\(([^)]+)\)/);
          if (!m) return 1;
          const parts = m[1]!.split(",");
          return parts.length > 3 ? parseFloat(parts[3]!) : 1;
        };
        const lum = (rgb: [number, number, number]): number => {
          const [r, g, b] = rgb.map((v) => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
          }) as [number, number, number];
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const el = document.querySelectorAll(sel)[index] as HTMLElement | undefined;
        if (!el) return null;
        // EFFECTIVE opacity, not just the nominal colour. Review R2's mutant:
        // `opacity-0` on the connector preserves the 60x1 rect, the resolved
        // token AND the computed `backgroundColor`, so every value the first
        // version of this helper looked at was unchanged while the line was
        // invisible in both themes. Alpha is part of "can this be seen", so it
        // is composited rather than ignored — and `visibility` is checked too,
        // since `visibility: hidden` also preserves the rect.
        let alpha = 1;
        let vis: HTMLElement | null = el;
        let hidden = false;
        while (vis) {
          const cs = getComputedStyle(vis);
          alpha *= parseFloat(cs.opacity || "1");
          if (cs.visibility === "hidden" || cs.visibility === "collapse") hidden = true;
          vis = vis.parentElement;
        }
        const fg = getComputedStyle(el).backgroundColor;
        // First ANCESTOR that actually paints — a transparent parent is not the
        // backdrop, and treating it as one would compare the line to nothing.
        let node: HTMLElement | null = el.parentElement;
        let bg = "rgba(0, 0, 0, 0)";
        while (node) {
          const c = getComputedStyle(node).backgroundColor;
          if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) {
            bg = c;
            break;
          }
          node = node.parentElement;
        }
        // Composite the line over its backdrop at its EFFECTIVE alpha: a fully
        // transparent line is its backdrop, which is a contrast of 1.0 with
        // itself — exactly what "invisible" should measure as.
        const fgRgb = parse(fg);
        const bgRgb = parse(bg);
        const fgAlpha = alphaOf(fg) * alpha;
        const composited: [number, number, number] = [
          fgRgb[0] * fgAlpha + bgRgb[0] * (1 - fgAlpha),
          fgRgb[1] * fgAlpha + bgRgb[1] * (1 - fgAlpha),
          fgRgb[2] * fgAlpha + bgRgb[2] * (1 - fgAlpha),
        ];
        const l1 = lum(composited);
        const l2 = lum(bgRgb);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        return {
          fg,
          bg,
          alpha: Math.round(fgAlpha * 100) / 100,
          hidden,
          // RAW, and rounded only for the message. Review R3: `#8a948e`
          // measures 2.997809:1, which `Math.round(x * 100) / 100` turns into
          // 3.0 — so a token BELOW the floor cleared the floor. Never round
          // before a threshold comparison.
          ratio,
          shown: Math.round(ratio * 1000) / 1000,
        };
      },
      { sel: selector, index: nth },
    );
  }

  type ConnectorSample = { rect: Rect; background: string };

  async function sampleConnectors(
    page: Page,
    step: 1 | 2 | 3,
    width: number,
  ): Promise<[ConnectorSample, ConnectorSample]> {
    await page.setViewportSize({ width, height: PROJECT_VIEWPORT.height });
    const response = await page.goto(`/admin?step=${step}`, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `/admin?step=${step} must render`).toBe(200);
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

    const read = async (n: 0 | 1): Promise<ConnectorSample> => ({
      rect: await rectOf(connectors.nth(n)),
      background: await connectors.nth(n).evaluate((el) => getComputedStyle(el).backgroundColor),
    });
    return [await read(0), await read(1)];
  }

  /**
   * C1 — the step-indicator connector. TWO elements, both measured, at every
   * step and at both widths.
   *
   * WHAT CHANGED. Until this arc the connectors were 0×1 at every viewport and
   * the rect comparison was a documented non-discriminating check: the <nav>
   * was a content-sized flex item, so a `flex-1` child had no free space to
   * claim and `max-w` never applied. The connector now sets `w-confirm-box`
   * directly, so it is a real box at the token width.
   *
   * EQUALITY, NOT A BAND. The first version asserted `> 0 ∧ ≤ 60`, which was
   * the right shape while `flex-1` made the width contested. It is the wrong
   * shape now, and review R1 supplied the mutant that proves it: capping done
   * connectors at `max-w-8` renders them 32px from step 2 on, and the band —
   * plus every colour and token-binding assertion — stayed green. A fixed
   * contract is asserted as an equality.
   *
   * BOTH WIDTHS still, because the width being INDEPENDENT of viewport is now
   * the claim: 390px and 900px must produce the same number.
   */
  for (const step of [1, 2, 3] as const) {
    for (const width of BAND_VIEWPORTS) {
      test(`C1 — both step connectors occupy a bounded band at ?step=${step}, ${width}px`, async ({
        page,
      }) => {
        const [first, second] = await sampleConnectors(page, step, width);
        const band = ([first, second] as const).map((s, i) => ({
          connector: i,
          width: s.rect.width,
          height: s.rect.height,
          // EXACTLY the token, not a band. The band (`> 0 ∧ ≤ 60`) was right
          // while the width was contested by `flex-1`; the connector now sets
          // `w-confirm-box` outright, so any width other than the token is a
          // defect. Review R1 supplied the mutant the band waved through:
          // `isDone ? "max-w-8 bg-text-subtle" : …` renders done connectors at
          // 32px from step 2 on, and every band, colour and token assertion
          // stayed green.
          inBand: s.rect.width === CONFIRM_BOX_PX && s.rect.height === 1,
        }));
        expect(
          band.filter((b) => !b.inBand),
          `each connector must be exactly the token width ` +
            `--spacing-confirm-box (${CONFIRM_BOX_PX}px) and exactly 1px tall. A 0 width means the ` +
            `connector is not rendering at all; any other width means something is competing ` +
            `for it. Measured: ${JSON.stringify(band)}`,
        ).toEqual([]);
      });
    }
  }

  /**
   * THE STATE ORACLE — the half the geometry cannot see.
   *
   * `isDone = n < step`, and connectors render for n = 1 and 2, so `?step=2` is
   * the ONLY step where the two differ: connector 1 is behind the cursor
   * (`bg-text-subtle`) and connector 2 is ahead of it (`bg-text-faint`). At
   * `?step=3` both are behind it. Geometry is identical in every one of those
   * cases, so a rect-only check would pass with the two colors swapped, both
   * stuck on one token, or the conditional deleted outright.
   *
   * The two tokens are REQUIRED TO DIFFER before the comparison is trusted: if
   * `--color-text-faint` and `--color-text-subtle` ever resolved to the same
   * color, every assertion below would pass on any implementation at all.
   *
   * DIFFERING IS NOT THE SAME AS VISIBLE, and this oracle cannot tell them
   * apart — swap one token to the page background and it stays green while the
   * line disappears (review R1's mutant). The contrast tests above are the
   * other half; neither replaces the other.
   */
  test("C1 — at ?step=2 the done connector and the ahead connector carry DIFFERENT tokens", async ({
    page,
  }) => {
    const [first, second] = await sampleConnectors(page, 2, PROJECT_VIEWPORT.width);
    const strong = await resolvedToken(page, "--color-text-subtle");
    const plain = await resolvedToken(page, "--color-text-faint");
    premiseHolds(
      `--color-text-subtle (${strong}) and --color-text-faint (${plain}) resolve to DIFFERENT ` +
        `colors; if they were equal this assertion would pass on any implementation`,
      strong !== plain && strong.length > 0,
    );
    expect(
      { connector1: first.background, connector2: second.background },
      `at step 2 the FIRST connector is behind the cursor (isDone, --color-text-subtle) and ` +
        `the SECOND is ahead of it (--color-text-faint). Equal values mean the isDone conditional ` +
        `is gone or inverted — geometry cannot see this.`,
    ).toEqual({ connector1: strong, connector2: plain });
  });

  /**
   * VISIBILITY, in both themes, which the token comparison above cannot prove.
   * DESIGN.md §1.2a claims each connector clears the 3:1 non-text floor; this
   * is that claim, asserted rather than asserted-about. Dark is exercised too —
   * the colour oracle only ever ran in the default theme, so a dark-only
   * regression had nothing watching it.
   */
  // THE FULL MATRIX, not a corner of it. Review R3: visibility ran only at
  // `?step=2`, so `step === 3 && "opacity-0"` was a surviving mutant — the
  // oracle simply never looked at the step where it applied. A partial matrix
  // is a guard that reports on the cases it happens to visit.
  for (const step of [1, 2, 3] as const) {
    for (const theme of ["light", "dark"] as const) {
      for (const width of BAND_VIEWPORTS) {
        test(`C1 — both connectors clear the 3:1 non-text floor at ?step=${step}, ${width}px, ${theme}`, async ({
          page,
        }) => {
          await sampleConnectors(page, step, width);
          await page.evaluate((t) => {
            document.documentElement.dataset.theme = t;
          }, theme);
          const measured = [];
          for (const n of [0, 1]) {
            const c = await contrastAgainstBackdrop(
              page,
              '[data-testid="wizard-step-connector"]',
              n,
            );
            premiseHolds(
              `connector ${n} and its backdrop both resolve to real colours in ${theme}`,
              c !== null && c.bg !== "rgba(0, 0, 0, 0)",
            );
            // Not folded into the ratio: `visibility: hidden` is not a low-contrast
            // line, it is an absent one, and reporting it as a contrast number
            // would name the wrong defect.
            premiseHolds(
              `connector ${n} is not hidden by \`visibility\` in ${theme}`,
              (c as { hidden: boolean }).hidden === false,
            );
            measured.push({
              connector: n,
              ...(c as { fg: string; bg: string; ratio: number; shown: number }),
            });
          }
          expect(
            measured.filter((m) => m.ratio < 3),
            `every connector must clear the 3:1 non-text contrast floor against what is behind ` +
              `it (DESIGN.md §1.2a). A token swapped toward the page background reads as "still a ` +
              `different token" to the colour oracle while being invisible on screen. Checked at ` +
              `EVERY viewport too — review R4 showed \`sm:opacity-0\` surviving because paint was ` +
              `only ever sampled at 390px. Measured at step ${step}, ${width}px, ${theme}: ` +
              `${JSON.stringify(measured)}`,
          ).toEqual([]);
        });
      }
    }
  }

  test("C1 — at ?step=3 BOTH connectors are done and carry the strong token", async ({ page }) => {
    const [first, second] = await sampleConnectors(page, 3, PROJECT_VIEWPORT.width);
    const strong = await resolvedToken(page, "--color-text-subtle");
    const plain = await resolvedToken(page, "--color-text-faint");
    premiseHolds(
      `--color-text-subtle (${strong}) and --color-text-faint (${plain}) resolve to DIFFERENT ` +
        `colors`,
      strong !== plain && strong.length > 0,
    );
    expect(
      { connector1: first.background, connector2: second.background },
      `at step 3 both connectors are behind the cursor (n < 3), so both carry ` +
        `--color-text-subtle. A --color-text-faint here means isDone is computed against the ` +
        `wrong step.`,
    ).toEqual({ connector1: strong, connector2: strong });
  });

  async function measureConnectors(page: Page): Promise<Record<string, Rect>> {
    const [first, second] = await sampleConnectors(page, 1, PROJECT_VIEWPORT.width);
    return {
      "wizard-step-connector-0": first.rect,
      "wizard-step-connector-1": second.rect,
    };
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

  test("rest-state rects match the committed baseline within 0.5px", async ({ page }, testInfo) => {
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
        "to get past a surprise: it is the committed record of what these surfaces measure, and " +
        "rewriting it to match a change erases the only evidence the change was safe. It was " +
        "recaptured ONCE, deliberately, when the step connectors went from 0-width to their " +
        "token width — a move the change intended and the band asserts independently.",
    ).toEqual([]);
  });
});
