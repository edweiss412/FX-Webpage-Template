// @vitest-environment node
/**
 * tests/components/shared/staleFooter-now-prop.test.ts (M11 Phase C Task C.2 / AC-11.38)
 *
 * Deterministic-output contract for <StaleFooter>. With the caller passing
 * `now={await nowDate()}`, the rendered HTML must be byte-identical across
 * a 61-second wall-clock advance.
 *
 * The verify-red proof requires the OLD `now ?? new Date()` default branch
 * to drift between renders, proving the test catches the wall-clock-bound
 * failure mode. After Option A migration (`now` required, default removed),
 * the StaleFooter source MUST NOT contain `now ?? new Date()` anywhere.
 *
 * Also scans every <StaleFooter ... /> JSX usage under `app/` and
 * `components/` to confirm callers thread the `now` prop explicitly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { StaleFooter } from "@/components/shared/StaleFooter";

const FROZEN_ISO = "2026-03-24T15:00:00.000Z";
const LAST_SYNCED_AT = "2026-03-24T14:59:30.000Z";

describe("StaleFooter — required `now` prop + deterministic-output contract (AC-11.38)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("byte-identical output across a 61s wall-clock advance when `now` is pinned", () => {
    vi.setSystemTime(new Date(FROZEN_ISO));
    const first = renderToStaticMarkup(
      StaleFooter({
        lastSyncedAt: LAST_SYNCED_AT,
        lastSyncStatus: "ok",
        now: new Date(FROZEN_ISO),
      }) as React.ReactElement,
    );

    vi.setSystemTime(new Date("2026-03-24T15:01:01.000Z"));
    const second = renderToStaticMarkup(
      StaleFooter({
        lastSyncedAt: LAST_SYNCED_AT,
        lastSyncStatus: "ok",
        now: new Date(FROZEN_ISO),
      }) as React.ReactElement,
    );

    expect(second).toBe(first);
  });

  it("StaleFooter source no longer contains the `now ?? new Date()` default branch", () => {
    const src = readFileSync(
      join(process.cwd(), "components/shared/StaleFooter.tsx"),
      "utf8",
    );
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
    expect(stripped).not.toMatch(/\bnow\s*\?\?\s*new Date\s*\(/);
  });

  it("every <StaleFooter ... /> JSX usage under app/ and components/ threads the `now` prop", () => {
    const violations: string[] = [];
    const scanRoots = [
      join(process.cwd(), "app"),
      join(process.cwd(), "components"),
    ];

    function walk(dir: string): string[] {
      const out: string[] = [];
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return out;
      }
      for (const entry of entries) {
        const full = join(dir, entry);
        let st;
        try {
          st = statSync(full);
        } catch {
          continue;
        }
        if (st.isDirectory()) {
          if (entry === "node_modules" || entry === ".next") continue;
          out.push(...walk(full));
        } else if (full.endsWith(".tsx") || full.endsWith(".ts")) {
          out.push(full);
        }
      }
      return out;
    }

    const files = scanRoots.flatMap(walk);
    const openerRe = /<StaleFooter\b([^>]*?)\/?>/g;

    for (const file of files) {
      if (file.endsWith("StaleFooter.tsx")) continue;
      const raw = readFileSync(file, "utf8");
      // Strip block + line comments so JSDoc mentions of <StaleFooter ...>
      // don't false-positive the JSX-opener scan. Naive but sufficient here:
      // the file's real code does not contain "//" inside string literals
      // that would survive this pass (verified by C.4 lexer in Task C.4).
      const src = raw
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .map((line) => line.replace(/\/\/.*$/, ""))
        .join("\n");
      let m: RegExpExecArray | null;
      while ((m = openerRe.exec(src)) !== null) {
        const attrs = m[1] ?? "";
        if (!/\bnow\s*=/.test(attrs)) {
          violations.push(
            `${file} — <StaleFooter ${attrs.trim().slice(0, 80)}> omits required now prop`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
