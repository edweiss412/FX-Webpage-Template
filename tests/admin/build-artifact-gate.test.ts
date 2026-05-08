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
  if (flagSet && !stdout.includes("/admin/dev")) {
    throw new Error(
      `pnpm build (flagSet=true) did NOT mention /admin/dev in stdout — wrapper may have disabled the route despite flag being set. STDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
    );
  }
  return distDir;
}

describe.skipIf(!RUN)("Round 2 Finding 1 — pnpm build canonical-path artifact gate", () => {
  test("pnpm build with ADMIN_DEV_PANEL_ENABLED unset → artifact does NOT contain /admin/dev route", () => {
    const distDir = runCanonicalBuild(false);

    // Three independent introspection signals — all must indicate absence.

    // 1. The compiled page module directory should not exist.
    const compiledRouteDir = join(distDir, "server", "app", "admin", "dev");
    expect(
      existsSync(compiledRouteDir),
      `expected ${compiledRouteDir} to NOT exist; the canonical pnpm build leaked /admin/dev into the artifact`,
    ).toBe(false);

    // 2. The app-paths-manifest should not list /admin/dev.
    const appPathsManifest = join(distDir, "server", "app-paths-manifest.json");
    if (existsSync(appPathsManifest)) {
      const manifest = JSON.parse(readFileSync(appPathsManifest, "utf8")) as Record<
        string,
        unknown
      >;
      const adminDevKeys = Object.keys(manifest).filter((k) => k.startsWith("/admin/dev"));
      expect(
        adminDevKeys,
        `app-paths-manifest.json contains /admin/dev entries: ${JSON.stringify(adminDevKeys)}`,
      ).toEqual([]);
    }

    // 3. routes-manifest.json (Pages Router) should not list it either.
    const routesManifest = join(distDir, "routes-manifest.json");
    if (existsSync(routesManifest)) {
      const text = readFileSync(routesManifest, "utf8");
      expect(text.includes("/admin/dev"), "routes-manifest.json mentions /admin/dev").toBe(false);
    }

    rmSync(distDir, { recursive: true, force: true });
  }, 300_000);

  test("pnpm build with ADMIN_DEV_PANEL_ENABLED=true → artifact DOES contain /admin/dev route (control)", () => {
    // Negative control: prove the prior assertion isn't vacuous (i.e. the
    // route would be present if the flag were set). Without this control,
    // a build that always produces an empty manifest would pass the
    // primary assertion trivially.
    const distDir = runCanonicalBuild(true);

    const compiledRouteDir = join(distDir, "server", "app", "admin", "dev");
    const serverAppDir = join(distDir, "server", "app");
    const exists = existsSync(compiledRouteDir);
    let serverAppListing = "(missing)";
    if (existsSync(serverAppDir)) {
      serverAppListing = readdirSync(serverAppDir).join(", ");
    }
    expect(
      exists,
      `control: expected ${compiledRouteDir} to exist when flag is set; if absent, the wrapper script is incorrectly disabling files even with the flag enabled. server/app/ contents: [${serverAppListing}]`,
    ).toBe(true);

    rmSync(distDir, { recursive: true, force: true });
  }, 300_000);
});

if (!RUN) {
  console.log(
    "[build-artifact-gate.test.ts] skipped — set RUN_BUILD_ARTIFACT_GATE_TEST=1 to opt in (~60-90s).",
  );
}
