import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Regression test for the verified adversarial HIGH: the cross-build
 * serialization lock in scripts/with-admin-dev-flag.mjs used to live at
 * `.next-prod-flip/.admin-dev-flag.lock`. The prod-runtime-flip Playwright
 * project builds with `NEXT_DIST_DIR=.next-prod-flip`, and Next cleans the
 * distDir at build start with `recursiveDeleteSyncWithAsyncRetries(distDir,
 * /^(cache|dev|lock)/)` — an ANCHORED regex that PRESERVES only entries whose
 * name starts with cache/dev/lock. `.admin-dev-flag.lock` (leading `.`) does
 * NOT match, so the clean deleted the held lock mid-build → two builds raced.
 *
 * The fix moved the lock to `.build-locks/admin-dev-flag.lock`, which is never
 * a distDir and therefore never cleaned. This test pins both facts.
 */

const SCRIPT = join(process.cwd(), "scripts/with-admin-dev-flag.mjs");

// The EXACT regex Next uses to decide which distDir entries survive the clean.
// Verified against node_modules/next/dist/build/index.js (recursiveDelete call).
// `recursiveDeleteSyncWithAsyncRetries(distDir, /^(cache|dev|lock)/)` PRESERVES
// entries matching the regex; everything else is deleted.
const NEXT_PRESERVE_REGEX = /^(cache|dev|lock)/;

describe("with-admin-dev-flag lock location (adversarial HIGH regression)", () => {
  const src = readFileSync(SCRIPT, "utf8");

  it("LOCK_DIR / LOCK_FILE are anchored to .build-locks/, never a .next distDir", () => {
    const lockDir = /const LOCK_DIR\s*=\s*join\(ROOT,\s*"([^"]+)"\)/.exec(src);
    const lockFile = /const LOCK_FILE\s*=\s*join\(LOCK_DIR,\s*"([^"]+)"\)/.exec(src);

    expect(lockDir, "LOCK_DIR declaration shape changed").not.toBeNull();
    expect(lockFile, "LOCK_FILE declaration shape changed").not.toBeNull();

    const lockDirName = lockDir![1];
    const lockFileName = lockFile![1];

    // (a) The lock path must NOT contain `.next` — i.e. it cannot regress back
    // under any Next distDir (`.next`, `.next-prod-flip`, etc.). Assert against
    // the captured CONSTANT values, not the whole source (the doc comment
    // legitimately names the old location to explain why the lock moved).
    expect(lockDirName).not.toContain(".next");
    expect(lockFileName).not.toContain(".next");
    // Hard fail if either constant regresses back to the old broken names.
    expect(lockDirName).not.toBe(".next-prod-flip");
    expect(lockFileName).not.toBe(".admin-dev-flag.lock");

    // Pin the deterministic, shared-across-wrappers location exactly.
    expect(lockDirName).toBe(".build-locks");
    expect(lockFileName).toBe("admin-dev-flag.lock");
  });

  it("teeth: WHY it had to move — the lock basename is NOT preserved by Next's clean regex", () => {
    // The basename does not start with cache/dev/lock, so if it lived inside a
    // distDir, Next's clean would delete it mid-build. This is the root cause.
    expect(NEXT_PRESERVE_REGEX.test("admin-dev-flag.lock")).toBe(false);
    // The historical name had the same fate (leading `.`), confirming the bug.
    expect(NEXT_PRESERVE_REGEX.test(".admin-dev-flag.lock")).toBe(false);
    // Sanity: a name Next WOULD preserve, proving the regex is wired right.
    expect(NEXT_PRESERVE_REGEX.test("cache")).toBe(true);
  });

  it("teeth: a real .build-locks/ lock survives a simulated Next distDir clean", () => {
    const sandbox = join(tmpdir(), `fxav-lock-loc-${process.pid}-${Date.now()}`);
    const buildLocks = join(sandbox, ".build-locks");
    const distDir = join(sandbox, ".next-prod-flip");
    try {
      mkdirSync(buildLocks, { recursive: true });
      mkdirSync(distDir, { recursive: true });

      const realLock = join(buildLocks, "admin-dev-flag.lock");
      writeFileSync(realLock, String(process.pid));

      // A copy of the lock placed INSIDE the distDir (the old, broken layout).
      const inDistLock = join(distDir, "admin-dev-flag.lock");
      writeFileSync(inDistLock, String(process.pid));

      // Simulate Next's clean: delete every distDir entry NOT matching the
      // preserve regex. We only iterate the distDir — never .build-locks/.
      for (const entry of readdirSync(distDir)) {
        if (!NEXT_PRESERVE_REGEX.test(entry)) {
          rmSync(join(distDir, entry), { recursive: true, force: true });
        }
      }

      // The in-distDir copy is gone (proves the clean has teeth)...
      expect(existsSync(inDistLock)).toBe(false);
      // ...but the real lock under .build-locks/ is untouched (proves the fix).
      expect(existsSync(realLock)).toBe(true);
      expect(readFileSync(realLock, "utf8")).toBe(String(process.pid));
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
