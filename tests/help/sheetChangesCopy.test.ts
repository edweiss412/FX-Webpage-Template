// Spec 2026-07-15 §5 — the per-show feed's Doug-facing name is "Sheet changes".
// Pins the help-copy rename so a later edit can't quietly revert to the old
// name or rename the stable #changes-feed anchor. Failure modes caught: stale
// "Changes feed" copy in any casing (e.g. the old h2 "The changes feed");
// anchor id renamed with the heading (breaking deep links); the new Accept
// affordance shipping undocumented.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dash = readFileSync("app/help/admin/dashboard/page.mdx", "utf8");
const panel = readFileSync("app/help/admin/per-show-panel/page.mdx", "utf8");
// Walk EVERY help page (whole-diff R2 F1: a third page, review-queues, carried
// the stale name in bold-split form — file-list pinning misses new/renamed
// pages, a walker fails-by-default on them).
const allHelpPages: Array<[string, string]> = readdirSync("app/help", { recursive: true })
  .map(String)
  .filter((p) => p.endsWith(".mdx"))
  .map((p) => [join("app/help", p), readFileSync(join("app/help", p), "utf8")]);

describe("help copy names the per-show feed 'Sheet changes' (spec 2026-07-15 §5)", () => {
  it("no stale 'changes feed' copy survives in ANY help page, any casing (only 'Sheet changes feed' is legal)", () => {
    // Normalize away markdown bold markers (so "**Changes** feed" is caught),
    // strip every legal occurrence, then forbid the phrase case-insensitively —
    // catches "Changes feed", "The changes feed" (the old per-show h2),
    // "changes feed", and bold-split variants like "**Changes** feed".
    const normalize = (t: string) => t.replaceAll("**", "").replaceAll(/sheet changes feed/gi, "");
    for (const [path, text] of allHelpPages) {
      expect(normalize(text), `stale feed name in ${path}`).not.toMatch(/changes feed/i);
    }
  });

  it("no standalone '**Changes.**' feed-section label survives in ANY help page (whole-diff R1 F1 class)", () => {
    // The parts-list label form ("- **Changes.** The show's feed…") names the
    // feed without the word "feed", dodging the phrase check above.
    for (const [path, text] of allHelpPages) {
      expect(text, `stale parts-list label in ${path}`).not.toMatch(/\*\*Changes\.\*\*/);
    }
  });

  it("both primary pages use the new name; the anchor id stays stable", () => {
    expect(dash).toMatch(/Sheet changes/);
    expect(panel).toMatch(/Sheet changes/);
    expect(panel).toContain('id="changes-feed"'); // anchor NEVER renamed
  });

  it("per-show panel documents the Accept affordance", () => {
    expect(panel).toMatch(/Accept all/);
    expect(panel).toMatch(/Accepted/);
  });
});
