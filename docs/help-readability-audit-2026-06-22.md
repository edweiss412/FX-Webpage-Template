# /help Help-Center — Layout, Formatting, Content & Readability Audit

_2026-06-22 · all 14 help surfaces (`app/help/**`) · audience: "Doug," the admin/producer_

## 0. Method

- Read every help source: 13 `.mdx` pages + the generated `errors/page.tsx`, plus the layout, the six custom MDX components, `mdx-components.tsx`, `next.config.mjs` (MDX setup), and the full `globals.css` token surface.
- **Rendered the real compiled `globals.css` against the actual help markup in a real browser** (Tailwind v4 CLI compile → static harness reproducing `app/help/layout.tsx` chrome + onboarding-wizard MDX output → Playwright at 1280px and 390px) and read back computed styles + line length. This is what turns "looks like a wall of text" into measured fact.
- Fanned out a per-page content/readability audit (one reader per surface) + a cross-page synthesis.

There are **two distinct root causes**, and they must be fixed in that order.

---

## 1. Executive summary

**The dominant cause is not the writing — it's that the `/help` prose has no typographic layer at all.** The MDX pipeline is "vanilla" (no `@tailwindcss/typography`, no `@plugin`, no base-element CSS in `globals.css`, and no prose wrapper around `{children}` in `app/help/layout.tsx`). `mdx-components.tsx` maps only the custom components — so Tailwind v4 preflight strips every base element. Measured in a real browser at 1280px:

| Element | Renders as (measured) | Effect |
|---|---|---|
| `# h1` ("Onboarding wizard") | **16px / weight 400 / margin 0** | identical to a paragraph |
| `## h2` ("Step 1: …") | **16px / weight 400 / margin 0** | identical to a paragraph |
| `- / 1.` lists | **`list-style: none`, `padding-left: 0`** | no bullets/numbers, no indent — reads as more body text |
| inline `[link]` | **body color, `text-decoration: none`** | invisible as a link |
| `paragraph` | **margin 0** | consecutive paragraphs run together |
| `` `code` `` | monospace, no background/padding | barely reads as code |
| line length (desktop) | **~113 ch** (856px column) | nearly 1.5× the readable max |

The only styled prose headings anywhere are `RefAnchor` (catalog codes). The **only** visual structure on a typical page comes from the two custom components — the orange `Step` badges and `Callout` boxes — which is why the pages have occasional punctuation but the connective prose, headings, lists and links are all flat 16px text. The `errors` page even wraps itself in `prose prose-neutral max-w-none`, but the plugin isn't installed, so **those classes are inert** — it's unstyled too. (Before-state screenshot: `scratchpad/audit/help-current-desktop-1280.png`.)

**The second cause** is genuine content debt that good typography won't fix: lookup content (sync-status catalogs, Apply/Discard decisions, onboarding badge states) buried in run-on prose that should be **tables**; dense multi-idea intro paragraphs with **no at-a-glance summary**; and **insider/anxious tone** ("MI-class code," "that's an Eric-side problem," "tell Eric" repeated under every error). The heaviest content debt clusters on five pages — `review-queues`, `per-show-panel`, `preview-as-crew`, `onboarding-wizard`, `settings` — plus the structurally-broken `errors` index.

The single highest-leverage action is the global typography fix (P0): it de-walls all 14 pages at once and is the prerequisite for judging (and shipping the tables behind) the content work.

---

## 2. P0 — Systemic typography layer (do this first, ship alone)

**Recommendation: a scoped `.help-prose` base-element ruleset in `globals.css` using existing `@theme` tokens, applied via one wrapper class in `app/help/layout.tsx`.** (Not `@tailwindcss/typography`: this is a strict token-driven system with an eslint arbitrary-value ban and a `DESIGN.md` token contract. The plugin ships its own color/spacing/measure scale that must each be remapped back to tokens — *more* code than the ~35 lines below, plus a new build dependency, plus it would silently activate the currently-inert `prose` classes on the errors page.)

The heading scale below is chosen to match **both** `DESIGN.md §2.2` (text-2xl = page title, text-xl = section header, text-lg = sub-headline) **and** the existing `RefAnchor` component (h2 = text-xl, h3 = text-lg) — so plain `##` headings will finally match the only headings that are styled today. The 70ch measure satisfies `DESIGN.md §2.5` (cap 65–75ch); `max-w-prose` (Tailwind's 65ch, already used across `app/admin/**`) is the no-arbitrary-value alternative.

```css
/* /help long-form prose — restores the token-driven reading hierarchy that
   Tailwind v4 preflight strips (no typography plugin in this project).
   Wrap {children} in app/help/layout.tsx with <div className="help-prose">. */
.help-prose { max-width: 70ch; }                               /* DESIGN.md §2.5 */

.help-prose h1 {
  font-size: var(--text-2xl); line-height: var(--text-2xl--line-height);
  letter-spacing: var(--text-2xl--letter-spacing);
  font-weight: var(--font-weight-bold); color: var(--color-text-strong);
  margin: 0 0 var(--spacing-tile-gap);                         /* 0 / 16px */
}
.help-prose h2 {                                               /* matches RefAnchor h2 + DESIGN.md "section header" */
  font-size: var(--text-xl); line-height: var(--text-xl--line-height);
  letter-spacing: var(--text-xl--letter-spacing);
  font-weight: var(--font-weight-semibold); color: var(--color-text-strong);
  margin: var(--spacing-section-gap) 0 var(--spacing-tile-gap);/* 32px / 16px — top space is the section cue */
}
.help-prose h3 {                                               /* matches RefAnchor h3 */
  font-size: var(--text-lg); line-height: var(--text-lg--line-height);
  font-weight: var(--font-weight-semibold); color: var(--color-text-strong);
  margin: var(--spacing-tile-pad) 0 0.5rem;
}
.help-prose p { margin: 0 0 var(--spacing-tile-gap); }
.help-prose :is(ul, ol) { padding-inline-start: 1.5rem; margin: 0 0 var(--spacing-tile-gap); }
.help-prose ul { list-style: disc; }
.help-prose ol { list-style: decimal; }
.help-prose li { margin-bottom: 0.5rem; }
.help-prose :is(p,li,dd,td) a {                                /* underline = affordance; inherits AA-safe body text color */
  text-decoration: underline; text-underline-offset: 2px;       /* accent (4.11:1) only on :hover — see BL-ACCENT-ON-BG-AA-CONTRAST */
}
.help-prose code {
  background: var(--color-surface-sunken); padding: 0.1em 0.35em;
  border-radius: var(--radius-sm); font-size: 0.9em;
}
/* tables — needed for the P1 status/decision-table conversions; ship in this pass */
.help-prose table { width: 100%; border-collapse: collapse; margin: 0 0 var(--spacing-tile-gap); }
.help-prose :is(th, td) { border: 1px solid var(--color-border); padding: 0.5rem 0.75rem; text-align: start; vertical-align: top; }
.help-prose th { background: var(--color-surface-sunken); font-weight: var(--font-weight-semibold); }
```

**Two implementation notes:**
1. Scope so the component-local margins win: author the rules with `:where(...)` (zero specificity) or reset margins inside `Callout`/`Step`/`TipFromSheets` so base-element `<p>`/`<ul>` rules don't double-space inside those boxes. `RefAnchor` keeps its own utility-class styling (higher specificity) and already matches the scale.
2. **Errors-page cleanup:** delete `prose prose-neutral max-w-none` from `app/help/errors/page.tsx` and let it inherit the layout wrapper like every other page.

**Acceptance (real browser, per project layout-gate discipline — jsdom is insufficient):** at 1280px + 390px assert `h2` font-size > `p` and weight 600; `ul` has `list-style: disc` + non-zero `padding-inline-start`; prose `a` has `text-decoration: underline` + accent color; consecutive `p` have a non-zero gap; content column ≤ 70ch on desktop. Run the invariant-8 impeccable critique + audit dual-gate on the diff.

---

## 3. P1 — Cross-page content themes

**A. No at-a-glance summary on consult-not-read pages.** dashboard (L3), review-queues (L1–9), per-show-panel (L1–3), preview-as-crew (L1–3), onboarding-wizard (L3–7), settings (L1–3), errors (L30–33). → One bold lead line under the H1 ("what this screen is / when you act"); for hubs add a short "what's on this page" map. Put reassurance ("all green = nothing to do") in the lead.

**B. Lookup content trapped in prose that should be a TABLE** (the most-consulted content). dashboard sync-status (L21–27); review-queues Apply-vs-Discard (L57–69) + two-queue defs (L3–9); onboarding-wizard Step-3 badge catalog (L77–84); settings health-badge catalog (L19–25); preview-as-crew "hidden or broken?" (L27–29). → `Status | What it means | What to do` tables, or side-by-side decision tables. Depends on P0 table styling.

**C. Over-long, multi-idea paragraphs.** /help (L3, 50w run-on); getting-started (L3); parse-warnings (L3); per-show-panel (L3, L7, both ~95w); preview-as-crew (L3 95w, L12); dashboard (L37 ~85w); onboarding-wizard (L3–7 ~190w); settings (L13, L36 ~110w bullet); sharing-links (L31). → Split into lead + support; option-sets become nested lists; mechanics/caveats move into a `Callout(note)`.

**D. Sequential procedures rendered as unordered bullets (should be Steps).** parse-warnings "What to do" (L11–15); per-show-panel sync-failure recovery (L19); review-queues "Review and apply" (L31–34). → `<Step n={…}>`.

**E. Enumerations buried in prose that should be LISTS.** /help Callout (L7–12); per-show-panel anatomy (L3) + staged-card contents (L7) + share controls (L31); preview-as-crew use-cases (L3) + exit options (L12); sharing-links fields (L31); settings administrators (L9); onboarding scan-summary counts (L51–55); tour controls (L93).

**F. Anxious / insider / Eric-side tone.** daily-rhythm "parse warning / structural difference" (L8); parse-warnings "an MI-class code" (L13); per-show-panel "send … to Eric" (L19); onboarding-wizard "that's an Eric-side problem" + "that's a bug, not a feature" (L62–69); settings "a hiccup on our side … send … to Eric" (L27); review-queues "(or that Doug told you about)" third-person (L60); errors "tell Eric" under every entry (L40–52). → Plain outcome language + a neutral "support contact"; escalation CTA **once** per page.

**G. Redundancy / duplicated links and re-explanations.** /help Callout duplicates Start-here links (L7–18); getting-started during-vs-after stated 3× (L17–20, L37); daily-rhythm badge 3× (L7/L9/L13); dashboard "Changes to review" 3× (L24/L39/L49–51); preview-as-crew role-filter 3× (L3/L22/L27–29); onboarding "Start over"/"Re-run setup" 3× (L5/L31/L107) + folder-URL instruction verbatim 2× (L40–42, L59); settings undo-window dup (L35/L36). → State once at the authoritative spot; later mentions become a one-line cross-reference.

**H. Missing visual anchors (Screenshots) on the action surface.** getting-started Drive Share dialog (L5–9); daily-rhythm dashboard (L5–9); whats-different yellow badge (L25–29); dashboard needs-attention cards (L33); per-show-panel staged-review card (L5–9); onboarding-wizard all three steps (esp. review table); settings health badge (L17–19); review-queues staged-review surface (L29–34).

---

## 4. P2 — Per-page punch list (worst first)

| Page | Verdict | Top actions (line-cited) |
|---|---|---|
| `review-queues` | needs-work | TL;DR two-queue table (L1–9); Apply/Discard → side-by-side table (L57–69); pull trigger catalog out of the L27 parenthetical |
| `per-show-panel` | needs-work | Page-anatomy + staged-card → lists (L3, L7); sync-recovery → Steps + neutralize "Eric" (L19) |
| `preview-as-crew` | needs-work | Split 95-word intro → lead + use-case list + reassurance Callout (L3); "hidden or broken?" → if/then Callout (L27–29) |
| `onboarding-wizard` | needs-work | Step-3 badge catalog → two tables (L77–84); cut ~190-word triple intro → lead + note (L3–7); de-Eric misconfig Callout (L62–69) |
| `settings` | needs-work | Health-badge catalog → 3-col table (L19–25); 110-word Auto-publish bullet → core toggle + undo Callout (L36) |
| `errors` | needs-work | Group by code-family h2 + jump-list/filter (L34–54); "tell Eric" CTA once not per entry (L40–52); print the code visibly under each title |
| `dashboard` | minor-polish | Sync-status catalog → 3-col table (L21–27); split 85-word bullet (L37); add TL;DR (L3) |
| `parse-warnings` | minor-polish | Split 54-word intro + reassurance Callout (L3); fix singular-vs-"each section" over-promise (L5); Steps for the fix (L11–15) |
| `getting-started` | minor-polish | Split promise vs reference pointer (L3); umbrella heading over the 3 Steps (L5–21) |
| `whats-different` | minor-polish | Point lead at the 3 sections + drop duplicate "edit the same way" (L3); vague closer → tip Callout (L37) |
| `tour` | minor-polish | Fix "one-paragraph" claim contradicting the card grid (L3); cut simile padding (L34); resolve ambiguous "min" badges (L11) |
| `sharing-links` | minor-polish | Split "What crew see" run-on → field list (L31); trim duplicated access-block effects (L39–43) |
| `daily-rhythm` | good | Dashboard screenshot under "What to glance at" (L5–9); drop self-admitted-redundant L9 bullet; de-jargon L8 |
| `/help` | good | Split 50-word opening (L3); two-idea Callout → 2-item list / drop duplicate links (L7–12) |

---

## 5. Highest-impact rewrites

**1 · review-queues L57–69 — Apply/Discard prose → decision table** (the core decision of the page)
```
## Apply or Discard?
| Apply when | Discard when |
| --- | --- |
| The change is intentional and you want crew to see it. | You spot a typo, paste accident, or a row you didn't mean to touch. |
| The flagged items match edits you remember making.      | A crew row vanished and you can't account for it. |
| The diff next to each item lines up with the sheet.     | You started an edit you aren't ready to publish yet. |
<Callout type="tip">Not sure? Discard. Your sheet stays put, and the next sync surfaces the same review again.</Callout>
```

**2 · settings L19–25 — health-badge catalog → 3-col table** → `| Status line | What it means | What to do |`, e.g. `| Connection needs attention | The link to your folder lapsed; new edits may not sync | Tap Re-run setup — existing shows keep their data |`.

**3 · onboarding-wizard L77–84 — Step-3 badge catalog → table** → `| Badge | What it means | Your options |`, e.g. `| Couldn't parse | Something didn't read (usually an unknown column or a bad date cell) | Retry now · Defer until modified · Permanently ignore |`.

**4 · dashboard L21–27 — sync-status catalog → table** → `| Status | What it means | What to do |`; the action column makes "do I need to do anything?" answerable at a glance.

**5 · preview-as-crew L3 — 95-word run-on → lead + use-case list**
```
**Open any show as a specific crew member — exactly what they see on their phone, without sending a link or changing their page.**
Start from the *Preview as a crew member* section on the per-show panel. Each row is one crew member; tap **Preview as**.
Reach for it when you want to:
- Confirm a fix landed for a specific person
- Spot-check role-based filtering before a tour day
- Sanity-check call times and hotel info after a sheet edit
```

**6 · errors L40–52 — per-entry "tell Eric" CTA → rendered once** → one `<Callout type="note">` at the top/bottom ("Still stuck after reading the explanation? Email Eric and include the error code."), removing dozens of duplicate mailto lines.

**7 · onboarding-wizard L62–69 — de-Eric the misconfig warning** → `<Callout type="warning">Rarely, the app's own setup is off and you'll see "Something is wrong on our end — the developer has been notified." There's nothing to fix on your side; the wizard waits until it's resolved.</Callout>` (and delete the self-referential "that's a bug, not a feature").

**8 · per-show-panel L19 — sync-recovery run-on → Steps + neutral escalation** → three `<Step>` (open in Drive / fix the cell / Re-sync from Drive) + `<Callout type="note">If there's no obvious cause in the sheet, send the page link and the error text to your support contact.</Callout>`.

---

## 6. Suggested sequencing (discrete shippable chunks)

1. **Typography layer (P0) — ship alone, first.** `.help-prose` in `globals.css` + wrapper in `layout.tsx` + remove inert errors-page classes. Real-browser acceptance + impeccable dual-gate. Prerequisite: ships the table styling later chunks need, and makes every page legible so content edits can be judged honestly.
2. **Reference-table conversions (Theme B).** dashboard sync-status, settings health-badge, onboarding Step-3, review-queues Apply/Discard — the screens Doug consults under pressure. Highest content leverage per edit.
3. **The four "needs-work" prose pages.** review-queues, per-show-panel, preview-as-crew, onboarding-wizard — intros/lists/Steps + tone (Themes A, C, D, E, F).
4. **errors index structure.** Family grouping + jump-list/filter + visible codes + single CTA (a component change, isolated from prose chunks).
5. **minor-polish sweep.** /help, getting-started, daily-rhythm, whats-different, tour, sharing-links, parse-warnings, dashboard residuals.
6. **Screenshots (Theme H).** Batched last — they need capture + the amd64-docker baseline regeneration workflow (byte-comparison CI discipline), so copy/structure work isn't blocked on image generation.
