// scripts/validation-smoke.ts — agent smoke test of the DEPLOYED validation app.
//
// `pnpm validation:smoke` lets an automated agent exercise the deployed
// validation admin without a human OAuth session: it mints the AGENT fixture
// (`agent@fxav.test`, app_metadata role:"admin" — the JWT-role arm of
// public.is_admin(), no DB allowlist row) through the test-auth endpoint's
// Gate-3 extra-host extension, then drives a headless browser through the
// dashboard + published review modal and checks the served CSS is fresh.
//
// Why the CSS check exists: #492 shipped dev-green + CI-green while its CSS
// was INERT on the deployed build (Vercel build cache + Turbopack FS cache
// emitted a stale compiled-globals chunk under the new JS). "✓ Ready" + the
// right SHA proves nothing about per-chunk freshness — only reading the
// deployed artifact does.
//
// Deployed-side prerequisites (Vercel validation project env, all three):
//   ENABLE_TEST_AUTH=true
//   TEST_AUTH_SECRET=<strong random — mirrored locally as VALIDATION_TEST_AUTH_SECRET>
//   TEST_AUTH_ALLOWED_EXTRA_HOST=fxav-crew-pages-validation.vercel.app
//
// Local prerequisites (.env.local, loaded via loadValidationEnv — .env.local
// ONLY, same wrong-database posture as validation-reseed):
//   VALIDATION_SUPABASE_URL / VALIDATION_SUPABASE_SECRET_KEY /
//   VALIDATION_SUPABASE_PROJECT_REF   (delete-agent-user cycle; ref-guarded)
//   VALIDATION_TEST_AUTH_SECRET       (Bearer for the mint request)
//   VALIDATION_SMOKE_BASE_URL         (optional; defaults to the validation app)
//
// Safety posture: the ONLY mutation this script ever performs is deleting and
// re-creating the agent fixture's auth user (Gate 5 is create-only, so each
// run must clear the previous run's user). The email is a constant — it can
// never target a human account — and the Supabase target is ref-guarded.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadValidationEnv } from "./lib/validation-env";
import {
  assertProdEquivalentTarget,
  assertSupabaseTargetMatchesProjectRef,
} from "./lib/validation-target";
import { assertValidationSmokeBaseUrl } from "./lib/validation-smoke-target";

const AGENT_EMAIL = "agent@fxav.test";
const DEFAULT_BASE_URL = "https://fxav-crew-pages-validation.vercel.app";
const TB = "published-show-review";
const MODAL_ANY = `[data-testid="${TB}-modal"]`;
const MODAL_LOADED = `${MODAL_ANY}:has([data-testid="${TB}-title"])`;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    process.stderr.write(
      `[validation-smoke] FAIL — required env var ${name} is unset (.env.local).\n`,
    );
    process.exit(1);
  }
  return v;
}

function pass(label: string): void {
  process.stdout.write(`[validation-smoke] PASS — ${label}\n`);
}

function fail(label: string): never {
  process.stderr.write(`[validation-smoke] FAIL — ${label}\n`);
  process.exit(1);
}

async function deleteAgentUser(supabaseUrl: string, secretKey: string): Promise<void> {
  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // Paginated scan for the fixture user (validation's auth table is small).
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`listUsers page ${page}: ${error.message}`);
    const users = data?.users ?? [];
    const agent = users.find((u) => u.email?.toLowerCase() === AGENT_EMAIL);
    if (agent) {
      const { error: delErr } = await admin.auth.admin.deleteUser(agent.id);
      if (delErr) fail(`deleteUser(${AGENT_EMAIL}): ${delErr.message}`);
      pass(`cleared previous agent user (${agent.id})`);
      return;
    }
    if (users.length < 200) break;
  }
  pass("no previous agent user to clear");
}

async function main(): Promise<void> {
  loadValidationEnv();
  const supabaseUrl = requireEnv("VALIDATION_SUPABASE_URL");
  const secretKey = requireEnv("VALIDATION_SUPABASE_SECRET_KEY");
  const projectRef = requireEnv("VALIDATION_SUPABASE_PROJECT_REF");
  // Codex R2-F1: both established guards, same as the other validation CLIs —
  // assertProdEquivalentTarget rejects localhost AND plaintext http (the
  // service key travels on every call); the ref binding alone does neither.
  assertProdEquivalentTarget(supabaseUrl, false);
  assertSupabaseTargetMatchesProjectRef(supabaseUrl, projectRef, false);
  const testAuthSecret = requireEnv("VALIDATION_TEST_AUTH_SECRET");
  const baseURL = process.env.VALIDATION_SMOKE_BASE_URL || DEFAULT_BASE_URL;
  // Codex R1-F1: the bearer below travels to this URL — pin it to the
  // validation project (production alias or its own preview deployments)
  // before anything else touches the network.
  assertValidationSmokeBaseUrl(baseURL);

  await deleteAgentUser(supabaseUrl, secretKey);

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    // Mint the agent session through the browser context's request stack so
    // Set-Cookie lands on the same cookie jar the page navigations use.
    const mint = await context.request.post("/api/test-auth/set-session", {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testAuthSecret}`,
      },
      data: { email: AGENT_EMAIL },
    });
    if (mint.status() !== 200) {
      fail(`set-session returned ${mint.status()}: ${await mint.text()}`);
    }
    pass("agent session minted (set-session 200)");

    // Dashboard reachable as admin.
    await page.goto("/admin");
    await page
      .locator('[data-testid="shows-table"]')
      .waitFor({ state: "visible", timeout: 30_000 })
      .catch(() => fail("dashboard shows-table not visible — admin session or deploy broken"));
    pass("dashboard renders for the agent identity");

    // Published review modal opens and the #492 in-place-swap contract holds.
    const row = page.locator('[data-testid^="shows-table-row-"]').first();
    const rowCount = await page.locator('[data-testid^="shows-table-row-"]').count();
    if (rowCount === 0) fail("no show rows on the dashboard — nothing to smoke");
    const slug = (await row.getAttribute("data-testid"))!.replace("shows-table-row-", "");
    await page.goto(`/admin?show=${slug}`);
    await page
      .locator(MODAL_LOADED)
      .waitFor({ state: "visible", timeout: 30_000 })
      .catch(() => fail(`review modal for ${slug} did not stream in`));
    const modal = await page.evaluate((sel) => {
      const panel = document.querySelector(`${sel} [data-review-modal-panel]`);
      return panel
        ? {
            entranceAttr: panel.getAttribute("data-review-modal-entrance"),
            animationName: getComputedStyle(panel).animationName,
          }
        : null;
    }, MODAL_LOADED);
    if (!modal) fail("loaded modal panel not found");
    if (modal.entranceAttr !== "none") {
      fail(`loaded panel entrance attr is ${JSON.stringify(modal.entranceAttr)} — expected "none"`);
    }
    if (modal.animationName !== "none") {
      fail(
        `loaded panel computed animation is ${modal.animationName} — the entrance-suppression CSS is not in the served stylesheet (stale deploy?)`,
      );
    }
    pass(`review modal (${slug}) opens with the in-place swap contract intact`);

    // Served-CSS freshness marker (the #492 stale-chunk class): the
    // suppression rules must exist in a stylesheet the page actually loads.
    const cssHrefs = await page.evaluate(() =>
      [...document.styleSheets].map((s) => s.href).filter((h): h is string => Boolean(h)),
    );
    let markerFound = false;
    for (const href of cssHrefs) {
      const res = await context.request.get(href);
      if (res.ok() && (await res.text()).includes("review-modal-entrance")) {
        markerFound = true;
        break;
      }
    }
    if (!markerFound) {
      fail(
        `no linked stylesheet contains the review-modal-entrance marker (checked ${cssHrefs.length}) — stale CSS chunk (set VERCEL_FORCE_NO_BUILD_CACHE=1 and redeploy)`,
      );
    }
    pass("served CSS carries the current entrance-suppression rules (deploy fresh)");

    // Close contract: Esc strips the URL and unmounts every modal frame.
    await page.keyboard.press("Escape");
    await page
      .waitForURL((u) => u.searchParams.get("show") === null, { timeout: 30_000 })
      .catch(() => fail("Esc did not strip ?show from the URL"));
    const remaining = await page.locator(MODAL_ANY).count();
    if (remaining !== 0) fail(`${remaining} modal frame(s) still mounted after close`);
    pass("Esc closes the modal and strips the URL");

    process.stdout.write("[validation-smoke] ALL CHECKS PASSED\n");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  process.stderr.write(`[validation-smoke] FAIL — unhandled: ${e?.stack ?? e}\n`);
  process.exit(1);
});
