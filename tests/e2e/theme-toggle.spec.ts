/**
 * Playwright E2E suite for the footer theme toggle (impeccable v3 critique
 * Finding 4 wire-up). PRODUCT.md commits to a "clearly discoverable theme
 * toggle [that] respects `prefers-color-scheme` on first paint." This spec
 * proves the wire-up is real, not a flag-lifecycle violation:
 *
 *   1. The toggle in the footer flips `<html data-theme>` between
 *      "light" and "dark" on click.
 *   2. The new value is mirrored to `localStorage['fxav-theme']`.
 *   3. The choice survives a full page reload — no flash of incorrect
 *      theme — because the no-FOUC inline script in `app/layout.tsx`
 *      reads localStorage and stamps `data-theme` on `<html>` BEFORE
 *      React hydrates.
 *   4. `aria-pressed` reflects the CURRENT theme (true when dark).
 *      `aria-label` reflects the ACTION (what clicking does next).
 *
 * Slug source: same Waldorf seed used by crew-page.spec.ts. The toggle
 * is footer-chrome and renders on every /show/[slug] response, so we
 * only need the slug + a leadCrewId to satisfy the `?crew=` requirement.
 */
import { test, expect } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";

async function lookupSeed(): Promise<{ slug: string; leadCrewId: string }> {
  const showRes = await admin
    .from("shows")
    .select("id, slug")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (showRes.error || !showRes.data) {
    throw new Error(
      `theme-toggle.spec: seeded show not found (run \`pnpm db:seed\`). drive_file_id=${SEED_DRIVE_FILE_ID}, error=${showRes.error?.message ?? "no row"}`,
    );
  }
  const showId = showRes.data.id as string;

  const crewRes = await admin
    .from("crew_members")
    .select("id, role_flags")
    .eq("show_id", showId);
  if (crewRes.error || !crewRes.data?.length) {
    throw new Error(`theme-toggle.spec: no crew rows for show ${showId}.`);
  }
  const lead = crewRes.data.find(
    (c) =>
      Array.isArray(c.role_flags) &&
      (c.role_flags as string[]).includes("LEAD"),
  );
  if (!lead) throw new Error("theme-toggle.spec: no LEAD crew member.");

  return { slug: showRes.data.slug, leadCrewId: lead.id as string };
}

// TODO(M5 §B follow-up): migrate off ?crew=/?as=admin mock to signInAs(non-admin-crew-fixture).
// The dev-only mock surface was retired in Task 5.7 follow-up (Issue 4). The migration
// is non-trivial because each test renders as a SPECIFIC crew identity (often non-LEAD),
// which signInAs cannot easily reproduce — real Supabase auth ties to email, not crew_member_id.
// Each affected show needs a per-test crew row whose email matches NON_ADMIN_CREW_FIXTURE,
// plus per-test fixture seeding. See handoff §0.
test.describe.skip("theme toggle (critique Finding 4 — flag wired)", () => {
  test("flips data-theme + writes localStorage + survives reload", async ({
    page,
    context,
  }) => {
    const { slug, leadCrewId } = await lookupSeed();

    // Pin the system preference to LIGHT so the no-FOUC fallback path is
    // deterministic for the initial assertion. The toggle should still
    // override regardless of system setting.
    await page.emulateMedia({ colorScheme: "light" });
    // Clear cookies; localStorage is cleared explicitly below via
    // page.evaluate (clearCookies does NOT touch localStorage; Playwright
    // reuses contexts across tests within a file, and the toggle persists
    // theme via localStorage, so the explicit removeItem is the load-bearing
    // reset).
    await context.clearCookies();

    await page.goto(`/show/${slug}?crew=${leadCrewId}`);
    await page.evaluate(() => window.localStorage.removeItem("fxav-theme"));

    // Reload so the no-FOUC script runs against a clean localStorage.
    await page.reload();

    // Hide the Next.js dev-mode overlay (`<nextjs-portal>` injected by
    // `<script data-nextjs-dev-overlay>`). On the 390x844 mobile-safari
    // viewport its floating "N" indicator sits at the bottom-right and
    // intercepts pointer events on the footer's theme toggle. Hiding it
    // is dev-only — production builds don't ship the overlay — so this
    // doesn't mask any real-user regression.
    await page.addStyleTag({
      content: `nextjs-portal, [data-nextjs-dev-overlay] { display: none !important; pointer-events: none !important; }`,
    });

    const toggle = page.getByTestId("theme-toggle");
    await expect(toggle).toBeVisible();

    // Initial state: no stored preference + light system pref → light.
    // The button's aria-pressed reflects "is dark", which should be false.
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    // aria-label is the ACTION (what clicking does), not the current state.
    await expect(toggle).toHaveAttribute(
      "aria-label",
      "Switch to dark theme",
    );

    // Click → dark.
    await toggle.click();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(toggle).toHaveAttribute(
      "aria-label",
      "Switch to light theme",
    );
    expect(
      await page.evaluate(() => window.localStorage.getItem("fxav-theme")),
    ).toBe("dark");

    // Reload → the no-FOUC inline script must re-stamp data-theme=dark on
    // <html> BEFORE React hydrates. No flash, no reset to light.
    await page.reload();
    // Re-hide the dev overlay (style tag is per-page, lost on reload).
    await page.addStyleTag({
      content: `nextjs-portal, [data-nextjs-dev-overlay] { display: none !important; pointer-events: none !important; }`,
    });

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByTestId("theme-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Click again → back to light.
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(
      await page.evaluate(() => window.localStorage.getItem("fxav-theme")),
    ).toBe("light");
  });

  test("tap target ≥44×44px (DESIGN.md §3 --spacing-tap-min)", async ({
    page,
  }) => {
    const { slug, leadCrewId } = await lookupSeed();
    await page.goto(`/show/${slug}?crew=${leadCrewId}`);
    const box = await page.getByTestId("theme-toggle").boundingBox();
    expect(box, "theme-toggle must render with a bounding box").not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });
});
