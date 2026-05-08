#!/usr/bin/env node
/**
 * scripts/with-admin-dev-flag.mjs (M3 adversarial Round 1 Finding 1)
 *
 * Run a child command (next build / next start) with conditional
 * file-system gating of app/admin/dev/. When ADMIN_DEV_PANEL_ENABLED is NOT
 * the literal string 'true' at script invocation time, this script renames
 * app/admin/dev/page.tsx and app/admin/dev/actions.ts to .disabled BEFORE
 * spawning the child, then restores them when the child exits.
 *
 * The result: a `next build` invoked through this script sees no
 * page.tsx / actions.ts under app/admin/dev/, so the resulting build
 * artifact literally does NOT contain the route. Setting the env var to
 * 'true' at runtime cannot resurrect a route that was never compiled.
 *
 * This is the build-artifact gate Codex Round 1 Finding 1 demanded. The
 * runtime requireAdmin() gate inside lib/auth/requireAdmin.ts remains as
 * defense in depth for builds where the panel IS enabled (dev-build
 * project), but the build-artifact gate is the primary protection.
 *
 * Usage:
 *   node scripts/with-admin-dev-flag.mjs <child-command> [args...]
 *
 * The script propagates the child's exit code. SIGINT / SIGTERM are
 * forwarded so Playwright's webServer cleanup works correctly.
 */
import { spawn } from "node:child_process";
import { renameSync, existsSync, openSync, closeSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const FILES = ["app/admin/dev/page.tsx", "app/admin/dev/actions.ts"];
const DISABLED_SUFFIX = ".disabled-by-build-gate";

// File-system lock so concurrent Playwright webServer builds (dev-build,
// prod-build, prod-runtime-flip) don't race on the rename-away/restore cycle.
// Without this, one project's `next build` mid-disable can starve another's
// TypeScript validation phase that reads app/admin/dev/page.tsx.
const LOCK_FILE = join(ROOT, ".next-prod-flip", ".admin-dev-flag.lock");
const LOCK_DIR = join(ROOT, ".next-prod-flip");

function tryAcquireLock() {
  // Ensure parent dir exists for the lock; mkdir -p semantics.
  // existsSync + mkdirSync is safer than relying on the build's own dir setup.
  if (!existsSync(LOCK_DIR)) mkdirSync(LOCK_DIR, { recursive: true });
  try {
    // O_EXCL flag — atomic create; fails if file exists.
    const fd = openSync(LOCK_FILE, "wx");
    closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

function releaseLock() {
  try {
    if (existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE);
  } catch {
    // Best-effort; another process may have already cleaned up.
  }
}

async function acquireLockWithRetry(maxWaitMs = 240_000) {
  const start = Date.now();
  while (!tryAcquireLock()) {
    if (Date.now() - start > maxWaitMs) {
      console.error("[with-admin-dev-flag] lock acquisition timeout");
      process.exit(75);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

function disable() {
  for (const rel of FILES) {
    const src = join(ROOT, rel);
    const dst = src + DISABLED_SUFFIX;
    if (existsSync(src) && !existsSync(dst)) {
      renameSync(src, dst);
      console.log(`[with-admin-dev-flag] disabled: ${rel}`);
    }
  }
}

function restore() {
  // Restore in reverse order so dependent files come back together.
  for (const rel of [...FILES].reverse()) {
    const src = join(ROOT, rel);
    const dst = src + DISABLED_SUFFIX;
    if (existsSync(dst) && !existsSync(src)) {
      renameSync(dst, src);
      console.log(`[with-admin-dev-flag] restored: ${rel}`);
    }
  }
}

const enabled = process.env.ADMIN_DEV_PANEL_ENABLED === "true";

// Always acquire the lock — even when the flag is enabled — so concurrent
// builds don't observe a partial rename from another concurrent invocation.
// The enabled-flag wrapper holds the lock for the duration of its child too,
// which serializes ALL builds across all three Playwright webServer projects.
await acquireLockWithRetry();

if (!enabled) {
  disable();
}

// Always try to restore + release on exit so a Ctrl-C between build and start
// doesn't leave the working tree in the disabled state OR the lock orphaned.
const cleanup = () => {
  try {
    if (!enabled) restore();
  } catch (err) {
    console.error("[with-admin-dev-flag] restore failed:", err);
  }
  releaseLock();
};
process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

const [, , cmd, ...args] = process.argv;
if (!cmd) {
  console.error("usage: with-admin-dev-flag.mjs <command> [args...]");
  process.exit(2);
}

const child = spawn(cmd, args, { stdio: "inherit", shell: false });
child.on("exit", (code, signal) => {
  if (!enabled) restore();
  releaseLock();
  if (signal) {
    // Re-raise the signal we received so callers see the same termination.
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
child.on("error", (err) => {
  if (!enabled) restore();
  releaseLock();
  console.error("[with-admin-dev-flag] child failed:", err);
  process.exit(1);
});

// Forward SIGINT / SIGTERM to the child so it can clean up.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    if (!child.killed) child.kill(sig);
  });
}
