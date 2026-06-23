/**
 * tests/help/help-prose-pages.test.ts (audit Chunk 3 — the four "needs-work"
 * prose pages: review-queues, per-show-panel, preview-as-crew, onboarding-wizard)
 *
 * Chunk 3 split run-on intros into a lead + TL;DR/lists, turned procedures into
 * <Step>s, and de-jargoned the tone (Theme F). These source-level guards pin the
 * highest-value, regression-prone outcomes so the walls of text / insider tone
 * can't creep back. (Per-page render + anchors are covered by the page-*.test.tsx
 * smokes; em-dash bans by those pages' own tests.)
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, `app/help/admin/${rel}/page.mdx`), "utf8");

/** Shell-free recursive walk for *.mdx / page.tsx under a dir. */
function helpSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...helpSourceFiles(full));
    else if (entry.name.endsWith(".mdx") || entry.name === "page.tsx") out.push(full);
  }
  return out;
}

describe("Chunk 3 — needs-work prose pages", () => {
  it("no insider / anxious meta-tone anywhere in /help (Theme F)", () => {
    // These framings make Doug parse the dev's mental model instead of his task.
    // (Note: a plain "tell Eric / send to Eric" support pointer is fine and
    // matches the ratified errors-page CTA — it's the *-side framing + the
    // "bug not a feature" meta that's banned.)
    const banned = [/Eric-side/i, /Doug-side/i, /bug,?\s+not a feature/i];
    const files = helpSourceFiles(join(ROOT, "app/help"));
    expect(files.length, "should scan the /help source tree").toBeGreaterThan(5);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const re of banned) {
        expect(re.test(src), `${f} contains banned insider/anxious tone ${re}`).toBe(false);
      }
    }
  });

  it("per-show-panel: sync-failure recovery is Steps, and the page opens with a 'what you'll see' list", () => {
    const src = read("per-show-panel");
    expect(src, "recovery procedure is <Step>s, not a run-on sentence").toMatch(
      /<Step n=\{1\}>Open the sheet directly in Google Drive\./,
    );
    expect(src, "intro is a scannable anatomy list").toMatch(/What you'll see, top to bottom:/);
    // The old 5-sentence run-on intro is gone.
    expect(src).not.toContain("The panel stacks three sections");
  });

  it("preview-as-crew: intro is a lead + use-case list, and a hidden-vs-missing tip replaces the prose diagnosis", () => {
    const src = read("preview-as-crew");
    expect(src, "use-case list").toMatch(/Reach for it when you want to:/);
    expect(src, "hidden-vs-missing diagnosis is a tip Callout").toMatch(
      /<Callout type="tip">[\s\S]*Hidden on purpose, or missing\?/,
    );
    // The old 95-word run-on intro sentence is gone.
    expect(src).not.toContain("without sending them a link and without changing what they see");
  });

  it("onboarding-wizard: intro condensed to lead + note, Start-over stated once", () => {
    const src = read("onboarding-wizard");
    // The old ~190-word triple intro is gone (its 2nd paragraph in particular).
    expect(src).not.toContain("no shows in the database");
    // Start-over is explained once, in a Callout (the end-of-page duplicate was removed).
    expect(src).not.toContain("If you ever want to abandon a wizard run completely");
    const startOverMentions = (src.match(/Start over/g) ?? []).length;
    expect(startOverMentions, "Start over explained once, not duplicated").toBeLessThanOrEqual(1);
  });

  it("review-queues: a two-queue TL;DR table replaces the prose definition, and the buried trigger parenthetical is gone", () => {
    const src = read("review-queues");
    expect(src, "two-queue at-a-glance table").toMatch(/\|\s*Queue\s*\|\s*Catches\s*\|/);
    // The 95-word L27 sentence with the inline trigger parenthetical is gone.
    expect(src).not.toContain("a LEAD status that toggled");
    expect(src).not.toContain("Two queues exist for the cases where the app cannot publish");
  });
});
