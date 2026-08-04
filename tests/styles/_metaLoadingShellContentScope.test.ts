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
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoadingShell } from "@/components/layout/Skeleton";

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
    // Walk the whole repo, not a hand-listed set of directories: a stylesheet
    // added anywhere else would otherwise be invisible to this guard, which is
    // the failure mode it exists to prevent.
    const sheets = walk(".", [".css", ".scss"]);
    expect(sheets.length, "no stylesheets discovered — the walk is wrong").toBeGreaterThan(0);

    const offenders = sheets.filter((f) => readFileSync(f, "utf8").includes(HOOK));
    expect(offenders, `${HOOK} must never be styled from a stylesheet`).toEqual([]);
  });

  it("is written by exactly one component, and only inside its <noscript>", () => {
    const sources = [...walk("app", [".tsx"]), ...walk("components", [".tsx"])];
    const writers = sources.filter((f) => readFileSync(f, "utf8").includes(HOOK));
    expect(writers.sort()).toEqual([OWNER]);

    // Assert against RENDERED markup, not source text: the component's docblock
    // discusses `<noscript>` and `<style>` in prose, so counting those strings
    // in the source counts comments too. The rendered output has no comments.
    const html = renderToStaticMarkup(
      LoadingShell({ children: null, testId: "scope-probe" }) as ReactElement,
    );
    const rule = `[${HOOK}]{display:none}`;

    const ruleHits = html.split(rule).length - 1;
    expect(ruleHits, "the hide rule must appear exactly once").toBe(1);

    // Exactly one <noscript>, and the rule lies strictly inside it. A second
    // identical <style> placed AFTER </noscript> would hide the fallback for
    // JS-on visitors on all nine routes; checking only the first occurrence, or
    // only that some occurrence is inside, passes straight through that.
    expect(html.split("<noscript>").length - 1).toBe(1);
    const open = html.indexOf("<noscript>");
    const close = html.indexOf("</noscript>");
    const at = html.indexOf(rule);
    expect(at).toBeGreaterThan(open);
    expect(at).toBeLessThan(close);
  });
});
