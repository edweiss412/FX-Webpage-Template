// Structural guard: `[data-loading-shell-content]` must be styled ONLY from the
// <noscript>-scoped rule inside LoadingShell.
//
// Why this exists. The hide rule works because a browser with JavaScript enabled
// never parses <noscript> contents. If the same selector ever appeared anywhere a
// JS-on browser DOES read — app/globals.css, a component <style>, a Tailwind
// @layer block — it would hide the loading fallback on all nine loading.tsx
// routes for every visitor, and nothing would catch it: the component test asserts
// the rule's presence inside <noscript> and the wrapper's attributes, and the e2e
// checks the notice and the no-JS branch. Neither observes a second rule arriving
// from somewhere else. Surfaced as a MEDIUM in the whole-diff cross-model review.
//
// Filesystem-walked rather than a fixed file list, so a NEW stylesheet or a new
// component that styles the hook fails by default instead of shipping dark.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Recursively collect files under `dir` whose name ends with any of `exts`. */
function walk(dir: string, exts: readonly string[]): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

const HOOK = "data-loading-shell-content";

/** The single legitimate occurrence: the noscript-scoped rule in LoadingShell. */
const OWNER = "components/layout/Skeleton.tsx";

describe("[data-loading-shell-content] is scoped to the noscript rule", () => {
  it("appears in no stylesheet a JavaScript-enabled browser parses", () => {
    const sheets = [
      ...walk("app", [".css"]),
      ...walk("components", [".css"]),
      ...walk("styles", [".css"]),
    ];
    expect(sheets.length, "no stylesheets discovered — the glob is wrong").toBeGreaterThan(0);

    const offenders = sheets.filter((f) => readFileSync(f, "utf8").includes(HOOK));
    expect(offenders, `${HOOK} must never be styled from a stylesheet`).toEqual([]);
  });

  it("is written by exactly one component, inside a <noscript>", () => {
    const sources = [...walk("app", [".tsx"]), ...walk("components", [".tsx"])];
    const writers = sources.filter((f) => readFileSync(f, "utf8").includes(HOOK));
    expect(writers.sort()).toEqual([OWNER]);

    const owner = readFileSync(OWNER, "utf8");
    const open = owner.indexOf("<noscript>");
    const close = owner.indexOf("</noscript>");
    expect(open, "LoadingShell has no <noscript> block").toBeGreaterThanOrEqual(0);

    // The `display:none` rule must sit inside the <noscript>; the wrapper
    // attribute itself sits outside it, which is the whole point.
    const rule = owner.indexOf(`[${HOOK}]{display:none}`);
    expect(rule, "the hide rule is missing").toBeGreaterThanOrEqual(0);
    expect(rule).toBeGreaterThan(open);
    expect(rule).toBeLessThan(close);
  });
});
