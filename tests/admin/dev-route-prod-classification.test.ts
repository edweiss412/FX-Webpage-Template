/**
 * tests/admin/dev-route-prod-classification.test.ts (Part-A §2.1a STRUCTURAL DEFENSE)
 *
 * Closes the "prod-under-/admin/dev whack-a-mole" class at CI time. Historically
 * EVERYTHING under /admin/dev/** was build-gated out of prod (the dev panel + dim
 * harnesses). Part A introduced the FIRST prod-available exception:
 * /admin/dev/telemetry (developer-gated at RUNTIME, not build-gated). That broke
 * the repo-wide "all of /admin/dev is dev-only-build" assumption encoded in many
 * gates (build-artifact-gate, no-raw-codes, PROTECTED_ROUTES, the e2e link
 * predicates …).
 *
 * This test forces a CONSCIOUS decision for every /admin/dev route: it must be
 * EITHER build-gated (its page.tsx is in the with-admin-dev-flag disable list) OR
 * explicitly prod-available (in the PROD_AVAILABLE_DEV_ROUTES allowlist below).
 * A future dev who adds app/admin/dev/foo/page.tsx and forgets to do either
 * fails this test — forcing the §2.1a gate-inventory review rather than silently
 * leaking (or silently 404-ing) a new surface.
 *
 * Anti-tautology: the walked set is derived from the real filesystem
 * (readdirSync), NOT a hardcoded list, and the current tree is pinned to classify
 * cleanly (telemetry ∈ allowlist; dev panel + source-link-dim + telemetry-dim ∈
 * dev-only).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = process.cwd();
const DEV_ROOT = "app/admin/dev";

// Prod-available exceptions. Each entry is a route dir under app/admin/dev that
// deliberately ships to production (developer-gated at RUNTIME, NOT build-gated).
// Adding an entry here is the conscious §2.1a decision this test forces.
const PROD_AVAILABLE_DEV_ROUTES = ["app/admin/dev/telemetry"];

// The dev-only set — parse the FILES array (the build-gate disable list) out of
// scripts/with-admin-dev-flag.mjs. These page.tsx files are renamed aside on a
// flag-UNSET build so they never reach the prod artifact.
function parseDisableList(): string[] {
  const src = readFileSync(join(ROOT, "scripts/with-admin-dev-flag.mjs"), "utf8");
  const body = src.match(/const FILES = \[([\s\S]*?)\];/)?.[1];
  if (!body) throw new Error("could not locate the FILES array in with-admin-dev-flag.mjs");
  const paths: string[] = [];
  for (const m of body.matchAll(/"([^"]+)"/g)) {
    if (m[1]) paths.push(m[1]);
  }
  return paths;
}

describe("every /admin/dev/* route is classified dev-only OR prod-available", () => {
  const disableList = parseDisableList();
  const isDevOnly = (pagePath: string) => disableList.includes(pagePath);
  const isProdAvailable = (routeDir: string) => PROD_AVAILABLE_DEV_ROUTES.includes(routeDir);

  // Anti-tautology: derive the walked set from the real filesystem.
  const entries = readdirSync(join(ROOT, DEV_ROOT), { withFileTypes: true });
  const routeDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  test("the dev panel (app/admin/dev/page.tsx) is build-gated (dev-only)", () => {
    expect(
      isDevOnly("app/admin/dev/page.tsx"),
      "app/admin/dev/page.tsx must be in the with-admin-dev-flag FILES disable list",
    ).toBe(true);
  });

  test.each(routeDirs)("app/admin/dev/%s is classified (not unclassified)", (dirName) => {
    const routeDir = `${DEV_ROOT}/${dirName}`;
    const pagePath = `${routeDir}/page.tsx`;
    // Only route dirs (those containing a page.tsx) need a classification.
    if (!existsSync(join(ROOT, pagePath))) return;

    const devOnly = isDevOnly(pagePath);
    const prodAvailable = isProdAvailable(routeDir);

    expect(
      devOnly || prodAvailable,
      `${routeDir} is an UNCLASSIFIED /admin/dev route. Either build-gate it (add "${pagePath}" to the FILES array in scripts/with-admin-dev-flag.mjs) OR, after a §2.1a gate-inventory review, mark it prod-available (add "${routeDir}" to PROD_AVAILABLE_DEV_ROUTES).`,
    ).toBe(true);

    // A route cannot be BOTH build-gated and prod-available.
    expect(
      devOnly && prodAvailable,
      `${routeDir} is BOTH build-gated (disable list) AND allowlisted — contradictory classification.`,
    ).toBe(false);
  });

  test("current tree pins: telemetry ∈ allowlist; source-link-dim + telemetry-dim ∈ dev-only", () => {
    expect(isProdAvailable("app/admin/dev/telemetry")).toBe(true);
    expect(isDevOnly("app/admin/dev/telemetry/page.tsx")).toBe(false);
    expect(isDevOnly("app/admin/dev/source-link-dim/page.tsx")).toBe(true);
    expect(isDevOnly("app/admin/dev/telemetry-dim/page.tsx")).toBe(true);
  });
});
