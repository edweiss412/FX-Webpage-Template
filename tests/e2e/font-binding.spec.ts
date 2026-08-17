/**
 * Font binding — does the app actually RENDER the family it commits to?
 *
 * `DESIGN.md:133` commits the product to Inter, "single contemporary sans for
 * all UI", declared as a committed `@font-face` in `app/fonts.css`, which supplies an
 * explicit `weight: "100 900"` range and whose generated family is `inter`
 * (lowercased from the loader's variable name — the google loader emitted the
 * literal `Inter`, which is why every assertion below reads the family out of
 * `--font-inter` rather than comparing a spelled literal). `app/globals.css`
 * applies `font-family: var(--font-sans)` at `html`, and `--font-sans` reads the
 * family out of `--font-inter` rather than naming one, falling back to the
 * literals only where that token is undefined. Nothing in that chain proves the
 * loaded face is actually available — a missing loader degrades silently to the next
 * entry in the stack, which is what `BL-HEADER-FONT-FALLBACK-WRAP` measured.
 *
 * THE ORACLE IS WIDTH, NOT `document.fonts.check()`. Measured 2026-08-03 on the
 * admin tree, where no Inter face is registered at all, `check('16px "Inter"')`
 * returned `true` — it answers "can this be handled", not "is this face here".
 * A test built on it passes on a tree with no font loaded, which is precisely
 * the state this file exists to catch. Comparing the width of text rendered
 * under the page's own cascade against the same text forced onto `"Inter"` and
 * onto `sans-serif` cannot be fooled that way: if the cascade resolves to a
 * system face, its metric differs from Inter's and the comparison fails.
 *
 * Spec: docs/superpowers/specs/2026-08-03-app-wide-font-binding.md
 */
import { expect, test, type Page } from "@playwright/test";
import { settleDashboardAdminState } from "./helpers/dashboardState";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { deleteSeededShow, seedShowWithCrew } from "./helpers/seedShowWithCrew";
import { signInAs } from "./helpers/signInAs";
import { openShowReviewModal } from "./helpers/openShowReviewModal";

/** The label `BL-HEADER-FONT-FALLBACK-WRAP` measured wrapping under a wide
 *  fallback. Reused here so the probe measures the product's own worst string,
 *  not a synthetic one. */
const PROBE_TEXT = "Wardrobe & key moments";

type FontReport = {
  inherited: number;
  forcedInter: number;
  forcedSansSerif: number;
  faces: { family: string; status: string; style: string; weight: string; unicodeRange: string }[];
  /** Elements whose INLINE style touches the guarded font properties. */
  inlineOverrides: string[];
  /**
   * Elements carrying a class the static guard EXEMPTED on the grounds that
   * nothing applies it. Non-empty means the exemption's premise is false.
   */
  exemptedVariantClasses: string[];
  htmlFontFamily: string;
  fontInterToken: string;
  /** The family `--font-inter` names first — what the loader actually generated. */
  loaderFamily: string;
  /** Its second entry — the metric-matched companion declared beside the face. */
  companionFamily: string;
};

/**
 * Build three probe spans, measure, remove — all inside ONE `page.evaluate`, so
 * nothing is left mounted for a later call to auto-wait on (detach safety).
 * The spans differ ONLY in `font-family`; every other property that can move a
 * text advance (size, weight, letter-spacing, wrapping) is pinned identically,
 * so a width difference can come from nothing but the resolved face.
 */
async function measureFonts(page: Page): Promise<FontReport> {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate((text: string) => {
    // BOTH families `--font-inter` names, unquoted: [0] the real face, [1]
    // the metric-matched companion. Both are READ rather than
    // spelled literally — review R16 showed that deriving only the first left
    // every companion assertion hardcoded, so a future Next emitting
    // `__Inter_ab12` / `__Inter_Fallback_ab12` would keep the app correctly
    // bound through this same token while CI reported a regression.
    const tokenFamilies = (
      getComputedStyle(document.documentElement).getPropertyValue("--font-inter") || ""
    )
      .split(",")
      .map((f) => f.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
    const loaderFamily = tokenFamilies[0] ?? "";
    const companionFamily = tokenFamilies[1] ?? "";

    const measure = (fontFamily: string | null): number => {
      const el = document.createElement("span");
      el.textContent = text;
      el.style.cssText =
        "position:absolute;left:-9999px;top:0;white-space:nowrap;" +
        "font-size:16px;font-weight:400;letter-spacing:normal;";
      if (fontFamily !== null) el.style.fontFamily = fontFamily;
      document.body.appendChild(el);
      const width = el.getBoundingClientRect().width;
      el.remove();
      return Math.round(width * 100) / 100;
    };
    return {
      // `null` = inherit the page's real cascade. This is the value under test.
      inherited: measure(null),
      // The family the LOADER exposes, read from `--font-inter` rather than
      // hardcoded. `--font-sans` consumes that token, so this is the family the
      // app is contracted to render — whatever the stylesheet decides to call it.
      // Hardcoding `"Inter"` made the suite fail on a future Next that hashes
      // the generated family name, even though the app would still be correctly
      // bound through the same token indirection (review R15).
      forcedInter: measure(loaderFamily ? `"${loaderFamily}"` : '"Inter"'),
      forcedSansSerif: measure("sans-serif"),
      // `.ordinal` is exempted statically because Tailwind emits it from a JS
      // parameter name, not from a className — a claim that goes stale silently
      // the moment someone writes `className="ordinal"`, since the compiled CSS
      // would not change at all. Round 21. So the claim is VERIFIED here, on the
      // rendered page, instead of being asserted in a comment.
      exemptedVariantClasses: Array.from(document.querySelectorAll(".ordinal")).map(
        (el) => el.tagName.toLowerCase() + "." + el.className,
      ),
      inlineOverrides: Array.from(document.querySelectorAll("[style]"))
        .filter((el) => {
          const style = el.getAttribute("style") || "";
          // `font-family` is here for the reason round 17 found: swapping the
          // ACTIVE FACE beneath a valid feature declaration makes the features
          // inert without touching them — the same failure the impeccable audit
          // measured on a bare <code>, reachable again through an inline override.
          // Every font-variant longhand, the face, AND the tokens the face
          // resolves through — round 23 landed `style={{ "--font-sans":
          // "ui-monospace" }}` on a `.code-value`, which swaps the active face
          // without ever naming `font-family`.
          return /font-feature-settings|font-variant(-[a-z]+)?|font-family|--font-sans|--font-inter|(^|;)\s*(font|all)\s*:/i.test(
            style,
          );
        })
        .map((el) => el.tagName.toLowerCase() + '[style="' + el.getAttribute("style") + '"]'),
      faces: Array.from(document.fonts).map((f) => ({
        family: f.family,
        status: f.status,
        // The full face IDENTITY. Two loaders for the SAME family produce
        // duplicate tuples, which a set of family NAMES cannot see.
        style: f.style,
        weight: f.weight,
        unicodeRange: f.unicodeRange,
      })),
      htmlFontFamily: getComputedStyle(document.documentElement).fontFamily,
      // The `--font-inter` token the loader is asked to expose. Read at
      // `<html>`, which is where the generated `.variable` class is applied.
      fontInterToken: getComputedStyle(document.documentElement)
        .getPropertyValue("--font-inter")
        .trim(),
      loaderFamily,
      companionFamily,
    };
  }, PROBE_TEXT);
}

function assertRendersInter(report: FontReport, surface: string): void {
  // (0) NON-VACUITY, asserted BEFORE anything reads as a pass. If the host
  //     resolved `"Inter"` and `sans-serif` to the same face, every comparison
  //     below is satisfiable by a tree with no font loaded at all. Fail loudly
  //     rather than green-wash.
  expect(
    Math.abs(report.forcedInter - report.forcedSansSerif),
    `${surface}: the probe can tell Inter from the generic sans (forcedInter=` +
      `${report.forcedInter}, forcedSansSerif=${report.forcedSansSerif}) — ` +
      `equal widths mean the measurement proves nothing`,
  ).toBeGreaterThan(1);

  // (1) THE RED ASSERTION. The cascade resolves to the same face as an explicit
  //     `"Inter"`. Fails today on the admin tree (measured: inherited 185.53 vs
  //     forcedInter 167.14, an 18.39px gap, because no Inter face exists there
  //     and the forced value falls back to the default serif metric).
  expect(
    Math.abs(report.inherited - report.forcedInter),
    `${surface}: rendered text matches Inter's metric (inherited=${report.inherited}, ` +
      `forcedInter=${report.forcedInter}, html font-family=${report.htmlFontFamily})`,
  ).toBeLessThan(0.5);

  // (2) And is NOT the generic fallback. Assertion (1) alone would also pass on
  //     a host that happens to ship Inter as a SYSTEM font while the app loads
  //     nothing — a green read that would not reproduce for any other user.
  expect(
    Math.abs(report.inherited - report.forcedSansSerif),
    `${surface}: rendered text is NOT the generic sans fallback ` +
      `(inherited=${report.inherited}, forcedSansSerif=${report.forcedSansSerif})`,
  ).toBeGreaterThan(1);

  // (3) The face is actually LOADED by the document, not merely resolvable from
  //     the host — keyed on the token-derived family, so a hashed generated name
  //     passes. What it catches is a machine that happens to have the family
  //     installed as a SYSTEM font while the app loads nothing: the width checks
  //     would pass there, this one would not.
  const loadedInter = report.faces.filter(
    (f) => f.family === report.loaderFamily && f.status === "loaded",
  );
  expect(
    loadedInter.length,
    `${surface}: the document loaded an Inter face (registered families: ` +
      `${report.faces.map((f) => `${f.family}:${f.status}`).join(", ") || "none"})`,
  ).toBeGreaterThanOrEqual(1);

  // (4) EXACTLY ONE FAMILY — runtime CORROBORATION of "is there a second
  //     loader?", and the reason the static guard in
  //     tests/assets/singleFontLoader.test.ts is a tripwire rather than the
  //     oracle. Two adversarial rounds each produced new SYNTACTIC forms that
  //     escaped a source-parsing check (`(0, Inter)(…)`, `Inter.call(…)`,
  //     `fonts["Roboto"](…)`, and six more), which is the signature of an
  //     unbounded space rather than an incomplete list. This observes what the
  //     browser actually registered, so no syntax evades it: a second loader
  //     for a DIFFERENT family shows up as a second family name here, whatever
  //     shape its call site took.
  //
  //     `Inter Fallback` is the size-adjusted companion declared beside it, and
  //     `__nextjs-*` faces belong to the dev-mode error overlay, not the app.
  const appFaces = report.faces.filter(
    (f) => !f.family.startsWith("__nextjs-") && f.family !== report.companionFamily,
  );
  expect(report.loaderFamily, `${surface}: --font-inter names a family`).toBeTruthy();
  const appFamilies = new Set(appFaces.map((f) => f.family));
  expect(
    [...appFamilies].sort(),
    `${surface}: the document registers exactly one font family — a second ` +
      `second @font-face for a DIFFERENT family would add one, however it is declared`,
  ).toEqual([report.loaderFamily]);

  // (5) NO DUPLICATE FACES. Review R4 showed (4) alone cannot see the case the
  //     whole guard exists to prevent: a second loader for the SAME family adds
  //     more Inter faces, and a set of family NAMES still reduces to ["Inter"].
  //     Face IDENTITY is the discriminating signal — a duplicate loader emits
  //     exact duplicate (family, style, weight, unicodeRange) tuples.
  // EXACT FACE COUNT. This was `toBeGreaterThan(1)` while the family came from
  // a seven-subset delivery, which emitted one face per unicode-range slice —
  // seven of them, so "more than one" was both true and the non-vacuity guard
  // for the duplicate check below. The vendored local font is a SINGLE file with
  // no unicode-range splitting, so the browser registers exactly one app face
  // and the old bound was false on every route (verified: expected > 1,
  // received 1, on admin, auth and crew alike).
  //
  // Asserting the exact count is STRONGER than the bound it replaces, not a
  // loosening: one local `src` must produce one face, and any second face is
  // either a duplicate loader or an unnoticed config change. It also keeps the
  // duplicate check below non-vacuous, since a duplicate loader takes this to 2
  // and fails here first. `inter Fallback` is excluded above as the companion.
  expect(
    appFaces.length,
    `${surface}: exactly one app @font-face — one local src emits one face, so a ` +
      `second means a duplicate loader or a changed font config`,
  ).toBe(1);
  const identity = (f: (typeof appFaces)[number]) =>
    `${f.family}|${f.style}|${f.weight}|${f.unicodeRange}`;
  const seen = new Map<string, number>();
  for (const face of appFaces) seen.set(identity(face), (seen.get(identity(face)) ?? 0) + 1);
  const duplicated = [...seen.entries()].filter(([, n]) => n > 1);
  expect(
    duplicated,
    `${surface}: no @font-face is registered twice — a duplicate tuple means a ` +
      `second loader for the same family, which no family-name check can see`,
  ).toEqual([]);

  // (6) ONE WEIGHT DESCRIPTOR ACROSS EVERY FACE. Review R5 showed (5) alone
  //     still misses a second loader configured DIFFERENTLY for the same family
  //     — `weight: "400"` alongside the variable `100 900` yields distinct
  //     tuples, so nothing duplicates and nothing is caught. One `Inter()` call
  //     with `variable` and no `weight` emits the variable face at `100 900`
  //     for every unicode-range slice, so a second descriptor value in this set
  //     means a second, differently-configured call.
  const descriptors = [...new Set(appFaces.map((f) => `${f.weight} / ${f.style}`))];
  expect(
    descriptors,
    `${surface}: every app face shares ONE weight+style descriptor pair — a ` +
      `second pair means a second loader configured differently for the same ` +
      `family, which the family-name and duplicate-tuple checks both miss`,
  ).toEqual(["100 900 / normal"]);
}

/**
 * `--font-inter` is the token `app/fonts.css` defines on :root, and it
 * IS what binds the font. The generated family name is not stable across
 * mechanisms: the Google loader emitted the literal `Inter`, the local loader
 * emits `inter`, lowercased from the loader module's variable name. So every
 * assertion here reads the family OUT of this token rather than comparing a
 * spelled literal — a test that hard-coded `Inter` would have broken on a
 * change that altered nothing a user can see.
 *
 * Asserted separately from the width checks because a loader that silently
 * stopped emitting `variable:` would still pass them while the documented token
 * vanished.
 */
function assertExposesFontInterToken(report: FontReport, surface: string): void {
  expect(
    report.fontInterToken,
    `${surface}: <html> exposes --font-inter (the loader's \`variable\` option)`,
  ).not.toBe("");

  // THE METRIC-MATCHED FALLBACK IS IN THE CASCADE. app/fonts.css declares a
  // companion face with size-adjust/ascent-override so the `display: "swap"`
  // window reflows FAR LESS — not zero, since metric overrides narrow the
  // mismatch without equalising per-string advances (DESIGN.md §2.1). This
  // assertion checks cascade MEMBERSHIP, not geometry; nothing here measures the
  // residual shift. An earlier version of this change
  // named the literal `"Inter"` in `--font-sans`, which skipped that face
  // entirely: first paint used a system font at native metrics and then snapped
  // ~10% once Inter arrived (measured 187.28px against 168.91px on a real
  // string) — worst on a 390px phone, where a label can unwrap from two lines to
  // one and shift everything below it mid-glance. Impeccable critique P1.
  expect(
    report.companionFamily,
    `${surface}: --font-inter names a metric-matched companion as its second entry ` +
      `(token: ${report.fontInterToken})`,
  ).toBeTruthy();
  expect(
    report.htmlFontFamily,
    `${surface}: the resolved cascade names the metric-matched companion ` +
      `(got: ${report.htmlFontFamily})`,
  ).toContain(report.companionFamily);

  // The cascade STRING is not enough on its own — computed style preserves a
  // family name whether or not any face answers to it, so the check above
  // passes against a cascade naming a face that was never registered. Review R5
  // was right that this was the whole of the assertion. The face must actually
  // exist in the document.
  // (7) NO INLINE OVERRIDE ON THIS ROUTE. The static scan reads source and cannot
  //     decide a dynamically constructed inline style (spec §12.13). This asks
  //     the DOM instead — and it lives HERE, inside the per-surface helper, so it
  //     runs on every tree this suite visits (admin, public auth, seeded crew)
  //     rather than on a hardcoded subset. Review R14 caught the earlier version
  //     claiming "every route the suite visits" while checking three of them.
  expect(
    report.inlineOverrides,
    `${surface}: inline styles overriding or resetting the font features`,
  ).toEqual([]);

  // (8) THE STATIC EXEMPTION'S PREMISE, CHECKED. `.ordinal` requests `ordn`,
  //     which this font lacks; the static guard tolerates the emitted rule only
  //     because nothing applies the class. If something does, the exemption is
  //     wrong and the element is rendering a feature that does not exist.
  expect(
    report.exemptedVariantClasses,
    `${surface}: elements carry \`.ordinal\`, but the static guard exempts that ` +
      `utility on the grounds that nothing applies it — the exemption is now false, ` +
      `and these elements request an OpenType feature the font does not have`,
  ).toEqual([]);

  const fallbackFaces = report.faces.filter((f) => f.family === report.companionFamily);
  expect(
    fallbackFaces.length,
    `${surface}: a "${report.companionFamily}" @font-face is actually registered, not just ` +
      `named in the cascade (registered: ` +
      `${report.faces.map((f) => f.family).join(", ") || "none"})`,
  ).toBeGreaterThanOrEqual(1);
}

test.describe("font binding", () => {
  // Every route below is asserted to return 200 AND to be the page it claims.
  // A route that quietly 404s still renders the ROOT layout, so a font probe on
  // the not-found shell reads as a plausible pass for a surface that was never
  // visited — measured 2026-08-03, when `/sign-in` (which does not exist; the
  // real route is `/auth/sign-in`) returned a 404 shell to exactly this test.

  test("the admin tree renders Inter", async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
    const res = await page.goto("/admin", { waitUntil: "load" });
    expect(res?.status(), "/admin renders for an admin").toBe(200);
    // Page identity by a testid OWNED BY the layout under test, not a generic
    // element. `admin-layout` is rendered by `app/admin/layout.tsx:157`/`:179`,
    // so this cannot be satisfied by a 200 from some other shell — which is the
    // exact class that made an earlier draft measure a 404 page.
    await expect(page.getByTestId("admin-layout")).toBeVisible();
    // And NOT the layout's infra-error branch (`app/admin/layout.tsx:92`),
    // which renders admin chrome without the page it claims to be measuring.
    await expect(page.getByTestId("admin-layout-infra-error")).toHaveCount(0);
    const report = await measureFonts(page);
    assertRendersInter(report, "admin (/admin)");
    assertExposesFontInterToken(report, "admin (/admin)");
  });

  test("the public auth tree renders Inter", async ({ page }) => {
    const res = await page.goto("/auth/sign-in", { waitUntil: "load" });
    expect(res?.status(), "/auth/sign-in renders").toBe(200);
    // Identity by a testid owned by this page (`tests/e2e/sign-in-page.spec.ts:74`
    // pins the same one), so a 200 from a different shell cannot satisfy it.
    await expect(page.getByTestId("sign-in-page")).toBeVisible();
    const report = await measureFonts(page);
    assertRendersInter(report, "auth (/auth/sign-in)");
    assertExposesFontInterToken(report, "auth (/auth/sign-in)");
  });

  test("the crew tree renders Inter", async ({ page }) => {
    const seeded = await seedShowWithCrew();
    try {
      const res = await page.goto(`/show/${seeded.slug}/${seeded.shareToken}`, {
        waitUntil: "load",
      });
      expect(res?.status(), "crew route renders").toBe(200);
      await expect(page.getByTestId("page-shell")).toBeVisible();
      const report = await measureFonts(page);
      assertRendersInter(report, "crew (/show/[slug]/[shareToken])");
      assertExposesFontInterToken(report, "crew (/show/[slug]/[shareToken])");
    } finally {
      // Teardown: the seeded show carries a random drive_file_id, so without
      // this every run leaves a row behind.
      await deleteSeededShow(seeded.driveFileId);
    }
  });
});

/**
 * The row `BL-HEADER-FONT-FALLBACK-WRAP` actually measured.
 *
 * Under a wide fallback the event-detail group title "Wardrobe & key moments"
 * fills the narrowest real row unaided and wraps to two lines (CI measured
 * 33.59px against 16.8px), leaving no room for the decorative rule beside it.
 * Under the loaded font it fits. This asserts the row on a LIVE Next-rendered
 * surface, which is only worth anything now that the live surface renders the
 * font the design commits to.
 *
 * REACHABILITY, established by navigation rather than assumed: the group is
 * rendered by `EventDetailsBreakdown` (`components/admin/wizard/step3ReviewSections.tsx:4155`),
 * which reaches a live route through `step3Sections()` in `ShowReviewSurface`
 * (`components/admin/review/ShowReviewSurface.tsx:259`), mounted by
 * `PublishedReviewModal` (`components/admin/showpage/PublishedReviewModal.tsx:957`),
 * which `/admin?show=<slug>` opens from the query param. Empty groups are
 * filtered out before render (`components/admin/wizard/step3ReviewSections.tsx:2216-2221`),
 * so `event_details` has to carry at least one of that group's three keys —
 * `seedShowWithCrew` does not set the column, so this seeds it directly.
 */
test.describe("font binding — the measured row", () => {
  const GROUP_TITLE = "Wardrobe & key moments";
  let seeded: Awaited<ReturnType<typeof seedShowWithCrew>>;
  let restoreDashboardState: (() => Promise<void>) | null = null;

  test.beforeAll(async () => {
    // The modal mounts only on the SETTLED dashboard branch — wizard-mode
    // ignores `?show` entirely, so without this the modal never appears.
    restoreDashboardState = await settleDashboardAdminState();
    seeded = await seedShowWithCrew({
      title: "Font Binding Row E2E Show",
      // One key from the group under test, kept SHORT so the group's own TITLE,
      // not a long value, is what has to fit the row.
      //
      // Set through the helper's own INSERT rather than a follow-up write from
      // here. A direct PostgREST write against a lock-governed table would be a
      // new unlocked mutation path (invariant 2) and a new Supabase call
      // boundary (invariant 9); adding a column to an insert the helper already
      // performs is neither. `tests/help/walker-routes.test.ts` enforces this
      // for every e2e spec — and note it text-scans, so do not spell the banned
      // call shape out even in a comment explaining why you avoided it (that
      // exact mistake failed CI here once).
      eventDetails: { keynote_requirements: "TBD" },
    });
  });

  test.afterAll(async () => {
    if (seeded) await deleteSeededShow(seeded.driveFileId);
    if (restoreDashboardState) await restoreDashboardState();
  });

  test("the event-detail group title occupies ONE line at the narrowest viewport", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await page.emulateMedia({ reducedMotion: "reduce" });
    // 320px is the narrowest supported viewport; the row the title lands in is
    // whatever the modal gives it there, and is MEASURED below rather than
    // assumed to be 240px (that figure is hard-coded by the standalone harness
    // at tests/e2e/section-header-layout.layout.spec.ts:72-76, not produced by
    // any viewport).
    await page.setViewportSize({ width: 320, height: 844 });
    // The Suspense SKELETON shares the shell testid and both frames transiently
    // coexist during the streaming swap, so wait on the LOADED frame (the
    // skeleton renders no title node) rather than a selector both match — the
    // established contract at tests/e2e/published-review-modal.interactions.spec.ts:53-60.
    // Waiting on the shared one is a strict-mode violation ~half the time.
    await openShowReviewModal(page, seeded.slug, { timeoutMs: 30_000 });
    await expect(page.locator('[data-testid="published-show-review-modal"]')).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready);

    const measured = await page.evaluate((title: string) => {
      // The non-vacuity probe widens the text by a FIXED, font-independent
      // amount rather than swapping in a system face.
      //
      // The face approach was tried and it failed in CI, which is exactly the
      // bug class this whole change is about. Measured on this 238px row:
      // "Courier New", serif, fantasy and monospace all still FIT (190-210px),
      // and `cursive` reached 212px and wrapped ON MACOS — but the same
      // `cursive` on the Ubuntu runner rendered 210px and did NOT wrap, so the
      // check went red on a correct tree. Any oracle keyed to a system font's
      // metrics is host-dependent by construction.
      //
      // `letter-spacing` adds a constant per character whatever the face, so
      // 0.4em over a 22-character title adds ~0.4 x 12px x 22 = ~105px on top
      // of the ~205px natural width. That overflows a 238px row on every host,
      // by arithmetic rather than by luck.
      const WIDE_PROBE_SPACING = "0.4em";
      const label = Array.from(document.querySelectorAll("span, h3, h4")).find(
        (el) => (el.textContent ?? "").trim() === title,
      );
      if (!(label instanceof HTMLElement)) return { error: "group title not rendered" };
      // Line count from the TEXT NODE's own client rects, never the element
      // box: a box reports one line even when its text wraps, if a sibling
      // inflates it (the technique at
      // tests/e2e/section-header-layout.layout.spec.ts:381-391).
      const textNode = Array.from(label.childNodes).find(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "",
      );
      if (!textNode) return { error: "group title has no text node" };
      const countLines = () => {
        const range = document.createRange();
        range.selectNodeContents(textNode);
        return Array.from(range.getClientRects()).filter((r) => r.width > 0.5).length;
      };
      const lines = countLines();
      const row = label.parentElement;
      const rowWidth =
        row instanceof HTMLElement ? Math.round(row.getBoundingClientRect().width) : 0;

      // NON-VACUITY, measured rather than asserted: force the label onto a
      // deliberately WIDE face and confirm the same measurement then reports a
      // wrap. Without this, `lines === 1` is satisfied by any row roomy enough
      // that no font could ever wrap it — which would make the assertion above
      // prove nothing about the font. 'Courier New' is present on macOS,
      // Windows and the Ubuntu runner (or resolves to a monospace of similar
      // advance), and is wider per character than any UI sans.
      const authored = label.style.letterSpacing;
      label.style.letterSpacing = WIDE_PROBE_SPACING;
      void label.offsetWidth;
      const linesUnderWideFont = countLines();
      const widthUnderWideFont = Math.round(label.getBoundingClientRect().width);
      label.style.letterSpacing = authored;
      void label.offsetWidth;

      return {
        error: null,
        lines,
        linesUnderWideFont,
        linesRestored: countLines(),
        rowWidth,
        widthUnderWideFont,
        fontSize: getComputedStyle(label).fontSize,
        whiteSpace: getComputedStyle(label).whiteSpace,
        labelWidth: Math.round(label.getBoundingClientRect().width),
        fontFamily: getComputedStyle(label).fontFamily,
      };
    }, GROUP_TITLE);

    expect(measured.error, "the group under test actually rendered").toBeNull();
    if (measured.error !== null) return;

    // Anti-vacuity: a zero-width row means the group rendered collapsed and the
    // line count below would be meaningless.
    expect(measured.rowWidth, "the row has a real width").toBeGreaterThan(0);

    // The measurement can SEE a wrap at this row width. Asserted before the
    // real assertion, so a row too roomy to ever wrap fails loudly here rather
    // than green-washing the one below.
    expect(
      measured.linesUnderWideFont,
      `the row wraps this title once it is widened by a fixed amount (row ` +
        `${measured.rowWidth}px, label ${measured.widthUnderWideFont}px when ` +
        `letter-spaced) — otherwise "stays on one line" is unfalsifiable here`,
    ).toBeGreaterThan(1);
    expect(measured.linesRestored, "the probe restored the authored spacing").toBe(measured.lines);

    // THE ASSERTION. Under the font the app actually loads, the title fits.
    expect(
      measured.lines,
      `"${GROUP_TITLE}" stays on one line (row ${measured.rowWidth}px, ` +
        `label ${measured.labelWidth}px, font ${measured.fontFamily}; ` +
        `at ${measured.fontSize}/${measured.whiteSpace}; the same row wraps to ` +
        `${measured.linesUnderWideFont} lines when the text is widened)`,
    ).toBe(1);
  });
});

/**
 * THE FEATURES ACTUALLY CHANGE WHAT IS DRAWN.
 *
 * Everything above proves the FAMILY is bound. None of it proves the OpenType
 * features `app/globals.css` declares do anything — and that distinction is the
 * entire reason this branch exists. `"cv11" 1` sat in the tabular rule from
 * 78662acb5 (2026-05-03) until 2026-08-03 against a Google-served Inter with the
 * character variants stripped, rendering nothing on every route for three
 * months. A test asserting the CSS string is present would have passed
 * throughout. Only a test that looks at rendered output can tell the difference.
 *
 * tests/styles/fontFeatureAvailability.test.ts is the cheap static half (does the
 * loaded binary CONTAIN the tags?). This is the expensive half: does the browser
 * APPLY them?
 */
/**
 * Is `tag` ENABLED in a computed `font-feature-settings` value?
 *
 * `String.includes(tag)` is not the same question, and whole-diff review round 2
 * demonstrated the gap: `"ss04" 0` contains "ss04" while DISABLING the feature.
 * fontkit measured the real corruption — enabled shapes 111 glyphs at advance
 * 5868, disabled 94 at 4184 — so a substring check passes while the product
 * renders wrong. Per spec an omitted value means 1; `0` and `off` mean off.
 */
function featureEnabled(computed: string, tag: string): boolean {
  const m = new RegExp(`["']${tag}["']\\s*(on|off|-?\\d+)?`).exec(computed);
  if (!m) return false;
  const raw = (m[1] ?? "").trim().toLowerCase();
  return raw !== "0" && raw !== "off";
}

test.describe("font binding — the features render", () => {
  /** Two spans, identical but for one `font-feature-settings` declaration. */
  async function renderPair(page: Page, text: string, feature: string) {
    await page.goto("/auth/sign-in", { waitUntil: "load" });
    await page.evaluate(
      ({ text, feature }) => {
        const make = (id: string, settings: string) => {
          const el = document.createElement("div");
          el.id = id;
          el.textContent = text;
          // Inline, absolute, off-flow: identical box, identical position, so the
          // ONLY difference between the two renders is the feature setting.
          el.style.cssText =
            `position:fixed;left:0;top:${id === "probe-off" ? 0 : 200}px;` +
            `margin:0;padding:0;border:0;background:#fff;color:#000;` +
            `font-size:64px;line-height:1.2;white-space:pre;` +
            `font-feature-settings:${settings};`;
          document.body.appendChild(el);
          return el;
        };
        make("probe-off", "normal");
        make("probe-on", `"${feature}" 1`);
      },
      { text, feature },
    );
    await page.evaluate(() => document.fonts.ready);
    return {
      off: page.locator("#probe-off"),
      on: page.locator("#probe-on"),
    };
  }

  test("`zero` actually slashes the zero — proven by pixels, not width", async ({ page }) => {
    // A WIDTH oracle cannot see this feature and never will. Laying `0` through
    // the vendored font: default glyph 1341 (zero) and `"zero" 1` glyph 1353
    // (zero.slash) have the SAME xAdvance of 1292 units, because a slashed zero
    // must stay tabular. getBoundingClientRect().width is therefore identical
    // whether the feature works or is inert — a width assertion would start red
    // and stay red forever. The slash is drawn INSIDE the advance, so the only
    // signal is the drawn pixels.
    const { off, on } = await renderPair(page, "000000", "zero");

    // Same box: if these differed, a pixel difference would prove nothing.
    const [boxOff, boxOn] = [await off.boundingBox(), await on.boundingBox()];
    expect(boxOff?.width).toBeCloseTo(boxOn?.width ?? -1, 1);
    expect(boxOff?.height).toBeCloseTo(boxOn?.height ?? -1, 1);

    // NOT the byte-comparison discipline in AGENTS.md: there is no committed
    // baseline and no cross-environment comparison. Both images come from the
    // same browser, in the same run, milliseconds apart, differing only in CSS.
    const [pixelsOff, pixelsOn] = [await off.screenshot(), await on.screenshot()];
    expect(
      pixelsOff.equals(pixelsOn),
      `the "zero" feature changed nothing on screen — the declaration in ` +
        `app/globals.css is inert, which is exactly how the dead cv11 looked`,
    ).toBe(false);
  });

  test("`ss04` actually disambiguates I and l — proven by width", async ({ page }) => {
    // Unlike `zero`, ss04 DOES move metrics: I widens 550 -> 903 units and l
    // widens 496 -> 564, because serifs and a tail need room. So for this
    // feature a width comparison is a valid and much cheaper oracle.
    const { off, on } = await renderPair(page, "IIIIllll", "ss04");
    const [boxOff, boxOn] = [await off.boundingBox(), await on.boundingBox()];
    expect(
      boxOn?.width ?? 0,
      `"ss04" left I and l at their default widths, so the feature is inert ` +
        `(off: ${boxOff?.width}, on: ${boxOn?.width})`,
    ).toBeGreaterThan(boxOff?.width ?? Number.POSITIVE_INFINITY);
  });

  test("ordinary prose gets ss04 — the root grants it, not just the opt-in classes", async ({
    page,
  }) => {
    // Whole-diff review round 1, finding 2: every other assertion here samples an
    // opt-in class (`.tabular-nums`, `.code-value`) or an inline specimen, so the
    // `html` declaration could vanish and all of them would stay green while
    // ordinary prose — most of the product — silently lost disambiguation.
    // This samples the root itself, and a real paragraph under it.
    await page.goto("/auth/sign-in", { waitUntil: "load" });
    const resolved = await page.evaluate(() => {
      // Sample REAL rendered elements, deep in the tree, not a node appended to
      // <body>. Round 2's mutant used `body > :not(p)` precisely so an injected
      // direct child would dodge the reset it applied to everything else.
      const deepest = [...document.querySelectorAll("main *")]
        .filter((el) => (el.textContent ?? "").trim().length > 0)
        .pop();
      return {
        root: getComputedStyle(document.documentElement).fontFeatureSettings,
        deep: deepest ? getComputedStyle(deepest).fontFeatureSettings : null,
        deepTag: deepest?.tagName ?? null,
      };
    });
    expect(featureEnabled(resolved.root, "ss04"), `html: ${resolved.root}`).toBe(true);
    expect(resolved.deep, "there is a real rendered element to sample").not.toBeNull();
    expect(
      featureEnabled(resolved.deep ?? "", "ss04"),
      `a real <${resolved.deepTag}> deep in the page resolved to ${resolved.deep} — ` +
        `ordinary product text is not getting ss04`,
    ).toBe(true);
  });

  test("the tabular rule keeps ss04 that the html rule grants", async ({ page }) => {
    // The inheritance trap, end to end. `font-feature-settings` inherits as a
    // WHOLE VALUE, so the tabular rule REPLACES the root's `ss04` rather than
    // adding to it. If someone drops the repeat, a `.tabular-nums` span holding
    // letters — `A1 - Audio Lead`, a stage label — silently loses the
    // disambiguation everything around it keeps. Static coverage lives in
    // tests/styles/fontFeatureAvailability.test.ts; this proves it in a browser.
    await page.goto("/auth/sign-in", { waitUntil: "load" });
    const settings = await page.evaluate(() => {
      const el = document.createElement("span");
      el.className = "tabular-nums";
      el.textContent = "A1";
      // Mounted under <main>, not <body>. Every real surface carrying these
      // classes is inside <main>, and round 3's mutant scoped its reset to
      // `main .code-value` precisely so a probe hanging off <body> would miss it.
      (document.querySelector("main") ?? document.body).appendChild(el);
      return getComputedStyle(el).fontFeatureSettings;
    });
    expect(
      featureEnabled(settings, "ss04"),
      `.tabular-nums resolved to ${settings}, which does not ENABLE ss04 — a ` +
        `number span containing letters would lose disambiguation`,
    ).toBe(true);
    // And NOT the slashed zero. `.tabular-nums` sits on whole prose sentences in
    // this codebase (the Right Now hero's 30px bold <h2>, the footer year), so a
    // slash here lands mid-sentence and reads as a terminal readout. Impeccable
    // critique P1 — it shipped that way for one round. `.code-value` is where
    // `zero` belongs, asserted below.
    expect(
      featureEnabled(settings, "zero"),
      `.tabular-nums resolved to ${settings}, which slashes zeros — that reaches ` +
        `running prose; move it to .code-value`,
    ).toBe(false);
  });

  test("the code-value class DOES slash zeros", async ({ page }) => {
    await page.goto("/auth/sign-in", { waitUntil: "load" });
    const settings = await page.evaluate(() => {
      const el = document.createElement("span");
      el.className = "code-value";
      el.textContent = "45846091";
      (document.querySelector("main") ?? document.body).appendChild(el);
      return getComputedStyle(el).fontFeatureSettings;
    });
    // Where a crew member reads a confirmation number off the screen and types it
    // back, 0-vs-O costs a failed check-in.
    expect(featureEnabled(settings, "zero"), `.code-value resolved to ${settings}`).toBe(true);
    expect(featureEnabled(settings, "ss04"), "and it keeps what it inherits").toBe(true);
  });

  test("code-value works on a <code> element, not only where it inherits the UI font", async ({
    page,
  }) => {
    // Tailwind preflight gives <code>/<kbd>/<samp>/<pre> a `ui-monospace` default.
    // `.code-value` shipped WITHOUT declaring a family, so on the one <code>
    // element it was applied to (the wizard's service-account address) it
    // resolved to a mono face carrying none of these features and rendered
    // nothing — the same silent dead declaration this whole change exists to
    // kill, reintroduced by its own fix. Impeccable audit P1.
    //
    // Asserting the resolved FAMILY rather than the feature string is the point:
    // a feature declaration is inert unless the face beneath it can honor it, and
    // the static guard cannot see which element a class lands on.
    await page.goto("/auth/sign-in", { waitUntil: "load" });
    const resolved = await page.evaluate(() => {
      const loaderFamily = getComputedStyle(document.documentElement)
        .getPropertyValue("--font-inter")
        .split(",")[0]
        ?.trim()
        .replace(/^["']|["']$/g, "");
      const el = document.createElement("code");
      el.className = "code-value";
      el.textContent = "45846091";
      (document.querySelector("main") ?? document.body).appendChild(el);
      const style = getComputedStyle(el);
      return {
        loaderFamily,
        fontFamily: style.fontFamily,
        settings: style.fontFeatureSettings,
      };
    });
    expect(
      resolved.fontFamily,
      `.code-value on a <code> resolved to ${resolved.fontFamily}, which is not ` +
        `the loaded family — its font-feature-settings render nothing there`,
    ).toContain(resolved.loaderFamily ?? "\u0000");
    expect(featureEnabled(resolved.settings, "zero"), `resolved: ${resolved.settings}`).toBe(true);
  });
});
