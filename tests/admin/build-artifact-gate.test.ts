/**
 * tests/admin/build-artifact-gate.test.ts (M3 adversarial Round 2 Finding 1)
 *
 * Belt-and-suspenders sanity assertion that the CANONICAL `pnpm build`
 * command — the same one CI / Vercel / local devs use — produces an
 * artifact that does NOT contain the /admin/dev route when
 * ADMIN_DEV_PANEL_ENABLED is unset.
 *
 * Codex Round 2 Finding 1: prior fix wired with-admin-dev-flag.mjs into
 * the Playwright webServer commands but `package.json:build` still ran raw
 * `next build`. CI / Vercel / local builds bypassed the gate. This test
 * runs the canonical command and asserts the route is absent from the
 * resulting build output's route manifest. If a future change reverts
 * package.json's build script (or mistakenly removes the wrapper), this
 * test breaks.
 *
 * The test is gated on opt-in via env (RUN_BUILD_ARTIFACT_GATE_TEST=1)
 * because a full `next build` takes ~30-60s and shouldn't run on every
 * `pnpm test` invocation. CI sets the env var; local devs can opt in.
 *
 * For routine `pnpm test` runs (when the env is absent) the suite skips
 * with a console message documenting how to opt in. The Playwright
 * prod-runtime-flip project (which DOES go through `pnpm build`) provides
 * the runtime-behavior proof on every CI run; this test is the static
 * artifact-introspection proof.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = process.cwd();
const RUN = process.env.RUN_BUILD_ARTIFACT_GATE_TEST === "1";

/**
 * Run `pnpm build` with the requested ADMIN_DEV_PANEL_ENABLED env value
 * and an isolated NEXT_DIST_DIR. Returns the dist dir path.
 *
 * NEXT_DIST_DIR is isolated so this test doesn't clobber the .next
 * artifact a developer may have built locally for `pnpm dev` etc.
 */
function runCanonicalBuild(flagSet: boolean): string {
  // IMPORTANT: NEXT_DIST_DIR must be RELATIVE to the project root. Next.js's
  // `distDir` config treats absolute paths as relative-to-cwd-anyway,
  // resulting in artifacts at cwd/<absolute-path> (e.g. /repo/repo/...).
  // Pass the relative form; resolve absolute for filesystem assertions.
  const RELATIVE_DIST = ".next-build-artifact-gate-test";
  const distDir = join(ROOT, RELATIVE_DIST);
  // Pre-clean: remove our isolated dist + the default .next/ to avoid stale
  // .next/types/validator.ts files from a prior (route-included) build
  // tripping TypeScript's tsconfig include during this build's compile phase.
  // tsconfig.json's exclude covers our isolated dist; .next/ may have stale
  // state from a developer's prior `pnpm dev` etc.
  if (existsSync(distDir)) rmSync(distDir, { recursive: true, force: true });
  const defaultNext = join(ROOT, ".next");
  if (existsSync(defaultNext)) rmSync(defaultNext, { recursive: true, force: true });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NEXT_DIST_DIR: RELATIVE_DIST,
  };
  if (flagSet) {
    env.ADMIN_DEV_PANEL_ENABLED = "true";
  } else {
    delete env.ADMIN_DEV_PANEL_ENABLED;
  }
  // CANONICAL invocation — the exact command CI / Vercel / a release
  // engineer would run. If this command produces an artifact containing
  // /admin/dev when the flag is unset, the gate is broken.
  let stdout = "";
  let stderr = "";
  try {
    const out = execFileSync("pnpm", ["build"], {
      cwd: ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    stdout = out.toString("utf8");
  } catch (err) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
    stdout = e.stdout?.toString("utf8") ?? "";
    stderr = e.stderr?.toString("utf8") ?? "";
    throw new Error(
      `pnpm build failed (flagSet=${flagSet}, exit=${e.status ?? "?"}):\n` +
        `--- STDOUT ---\n${stdout}\n--- STDERR ---\n${stderr}`,
    );
  }
  // Even when the build succeeds (exit 0), assert that the route table
  // line for /admin/dev is present-or-absent as expected. This catches the
  // case where the build succeeds with NO routes (e.g. wrapper disabled
  // app/ entirely or NEXT_DIST_DIR pointed somewhere unexpected).
  // Check a DEV-ONLY route (source-link-dim), NOT the bare "/admin/dev" prefix:
  // /admin/dev/telemetry is now always present (prod-available), so "/admin/dev"
  // would match even if the flag failed to restore the dev panel/harnesses.
  if (flagSet && !stdout.includes("/admin/dev/source-link-dim")) {
    throw new Error(
      `pnpm build (flagSet=true) did NOT mention /admin/dev/source-link-dim in stdout — wrapper may have disabled the dev-only routes despite the flag being set. STDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
    );
  }
  return distDir;
}

describe.skipIf(!RUN)("Round 2 Finding 1 — pnpm build canonical-path artifact gate", () => {
  test("pnpm build with ADMIN_DEV_PANEL_ENABLED unset → artifact does NOT contain /admin/dev route", () => {
    const distDir = runCanonicalBuild(false);

    // Three independent introspection signals. /admin/dev/telemetry is the
    // deliberate PROD-available exception (developer-gated at RUNTIME, not
    // build-gated); the dev panel + its two dim harnesses stay build-gated OUT of
    // prod. So each signal asserts telemetry PRESENT + the dev-only trio ABSENT.

    // 1. The compiled telemetry page dir must exist; the dev-only trio must not.
    const adminDevDir = join(distDir, "server", "app", "admin", "dev");
    const telemetryDir = join(adminDevDir, "telemetry");
    expect(
      existsSync(telemetryDir),
      `expected ${telemetryDir} to EXIST; the prod-available /admin/dev/telemetry route was not compiled into the canonical build`,
    ).toBe(true);
    for (const devOnly of ["page.js", "source-link-dim", "telemetry-dim"]) {
      const leaked = join(adminDevDir, devOnly);
      expect(
        existsSync(leaked),
        `expected ${leaked} to NOT exist; a dev-only /admin/dev surface leaked into the prod artifact`,
      ).toBe(false);
    }

    // 2. The app-paths-manifest may list /admin/dev/telemetry but NO other
    //    /admin/dev route (panel or harness).
    const appPathsManifest = join(distDir, "server", "app-paths-manifest.json");
    if (existsSync(appPathsManifest)) {
      const manifest = JSON.parse(readFileSync(appPathsManifest, "utf8")) as Record<
        string,
        unknown
      >;
      const adminDevKeys = Object.keys(manifest).filter(
        (k) => k.startsWith("/admin/dev") && !k.startsWith("/admin/dev/telemetry"),
      );
      expect(
        adminDevKeys,
        `app-paths-manifest.json contains non-telemetry /admin/dev entries: ${JSON.stringify(adminDevKeys)}`,
      ).toEqual([]);
    }

    // 3. routes-manifest.json: strip the prod-available telemetry route, then
    //    assert NO other /admin/dev route (dev panel/harness) remains.
    const routesManifest = join(distDir, "routes-manifest.json");
    if (existsSync(routesManifest)) {
      const text = readFileSync(routesManifest, "utf8");
      const withoutTelemetry = text.split("/admin/dev/telemetry").join("");
      expect(
        withoutTelemetry.includes("/admin/dev"),
        "routes-manifest.json mentions a non-telemetry /admin/dev route (dev panel/harness leaked)",
      ).toBe(false);
    }

    rmSync(distDir, { recursive: true, force: true });
  }, 300_000);

  test("pnpm build with ADMIN_DEV_PANEL_ENABLED=true → artifact DOES contain /admin/dev route (control)", () => {
    // Negative control: prove the prior assertion isn't vacuous (i.e. the
    // route would be present if the flag were set). Without this control,
    // a build that always produces an empty manifest would pass the
    // primary assertion trivially.
    const distDir = runCanonicalBuild(true);

    const adminDevDir = join(distDir, "server", "app", "admin", "dev");
    const serverAppDir = join(distDir, "server", "app");
    let serverAppListing = "(missing)";
    if (existsSync(serverAppDir)) {
      serverAppListing = readdirSync(serverAppDir).join(", ");
    }
    // Non-vacuous control: /admin/dev/telemetry is ALWAYS present (prod-available),
    // so `existsSync(server/app/admin/dev)` alone proves nothing now. Assert the
    // DEV-ONLY surfaces (the panel page + BOTH dim harnesses) — the exact set the
    // flag-unset primary test asserts ABSENT — ARE compiled back in when the flag
    // is set. If any is missing, the wrapper is disabling dev routes despite the flag.
    for (const devOnly of ["page.js", "source-link-dim", "telemetry-dim"]) {
      const restored = join(adminDevDir, devOnly);
      expect(
        existsSync(restored),
        `control: expected ${restored} to EXIST when ADMIN_DEV_PANEL_ENABLED=true; the wrapper is disabling a dev-only /admin/dev surface even with the flag set. server/app/ contents: [${serverAppListing}]`,
      ).toBe(true);
    }

    rmSync(distDir, { recursive: true, force: true });
  }, 300_000);
});

if (!RUN) {
  console.log(
    "[build-artifact-gate.test.ts] skipped — set RUN_BUILD_ARTIFACT_GATE_TEST=1 to opt in (~60-90s).",
  );
}
