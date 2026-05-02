# FX Crew Pages — Design Vision

This is the human-readable companion to `PRODUCT.md` (which is the AI-config version of the same content, consumed by the impeccable plugin's design skills). If you're a designer, frontend engineer, or future maintainer trying to understand the _intent_ behind visual decisions in this codebase, start here.

For implementation-level specs (data model, auth chain, sync architecture), see [`docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md`](./superpowers/specs/2026-04-30-fxav-crew-pages-design.md). This document only covers the _visual and experiential_ decisions.

---

## Who this is for

**Doug Larson** runs shows for FX Audio Visual. He's a project manager who has been doing this for ~15 years. He's the only admin user — `/admin` is built for an audience of one. He's tech-comfortable but the surface must feel friendly and obvious; he could touch admin from his desk between events or from the venue floor mid-show on a phone, so the admin UI works at both contexts. No hover-only affordances. No tiny tap targets.

**Crew on the venue floor** are the audience for the public crew page (`/show/[slug]`). These are A1 audio, V1 video, L1 lighting, and lead engineers working indoor corporate events — hotel ballrooms, convention centers, the Marriott Marquis kind of room. They open the page on a personal phone, often one-handed, often mid-task, occasionally in direct sunlight on a loading dock. They came with a question and need it answered fast:

- **Set/strike day:** what's in the pack, where, what case?
- **Show day:** what's my call time, what room, where do I stand?
- **Any day:** my hotel, my transport, who else is on this show, is there a Zoom feed I need to factor in, are there client decks/playlists/video I need to know about?

The job is making this fast and beautiful — not surfacing every field on the underlying sheet. Edit ruthlessly toward the question being asked.

## Brand personality

**Three words: Professional · Bold-modern · Intuitive.**

The voice is direct, plain-language, respectful of the reader's time. No jargon, no error codes in user copy, no robotic "field undefined" placeholders — when a field is missing, the page says it like a person would.

The interface should feel like a confident, well-engineered tool made by someone who actually does this work. Not a template. Not a SaaS dashboard. Not a consumer app trying too hard to be friendly.

## Aesthetic direction

### One brand cue

FXAV's logo provides exactly one durable design cue: a saturated warm orange (roughly `#F79338`–`#FF8C1A`) used as an accent against high-contrast neutrals. That orange is the only piece of FXAV's existing visual identity worth carrying forward — the rest of their web presence is not a reference. Everything else is a clean slate.

### Tone

| Slider                | Position         | Why                                                                                                                             |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Minimal ↔ Bold        | **75% Bold**     | Type has presence, key data (call time, room, hotel) is large and confident. The page never reads as anonymous.                 |
| Elegant ↔ Utilitarian | **~55% Elegant** | Generous spacing, considered hierarchy — but never decorative for its own sake. Working tool, not portfolio.                    |
| Quiet ↔ Expressive    | **Balanced**     | Most surfaces are restrained; expressive moments reserved for the "Right Now" card, time-sensitive states, and key transitions. |

### What this is NOT

- **Not** a printed-paper / run-of-show skeuomorph (cream paper, ruled lines, serif body). The whole point is to _replace_ the spreadsheet aesthetic, not echo it.
- **Not** "enterprise SaaS dashboard" — no dense sidebar nav, no chart grids, no neutral-gray-on-neutral-gray.
- **Not** consumer playful — no bouncy mascots, no rounded-everything, no gradient-on-gradient.
- **Not** "techie" — even though the audience is an AV crew, the surface should feel like good consumer product design, not a developer tool.

### Light and dark, both first-class

Crew may open the page on a sunlit loading dock at noon (light mode wins) or backstage at midnight (dark mode wins). Both modes are designed deliberately — neither is a 90% inverse of the other. A clearly discoverable theme toggle lives in the UI; the first paint respects `prefers-color-scheme`.

- **Light mode:** near-white surface, deep neutral text. Built for daylight readability.
- **Dark mode:** deep warm-neutral surface (not pure black — pure black against the FXAV orange is harsh; aim for `#0E0E10`–`#141416`), soft off-white text. Built for backstage and late-night readability.

### Color system

- **Neutrals carry the page.** Foreground/background/border/divider are all in the neutral family.
- **One signature accent — FXAV orange.** Reserved for: the active/live indicator on the "Right Now" card, "today" pins on the schedule, primary CTAs, and the brand mark. Use sparingly so it stays meaningful — when orange appears, it means _this matters now._
- **No competing accent hue.** No blue, purple, or teal accent. The orange stands alone so it carries the brand.
- **Avoid red/green as primary semantic colors.** Always pair color with text or icon for state signals (stale sync, COI status, parse warning) — color-blind crew exist.

### Typography

- **One contemporary sans for UI.** Geometric or neo-grotesque, full weight range (400/500/600/700), strong tabular-figure variant. Pick one (Inter, Geist, or General Sans are all fine) and commit. Same family handles headlines and body — no display/body pairing in v1.
- **No serif body.** Serif would pull toward the paper-skeuomorph direction we explicitly rejected.
- **Tabular figures (`font-feature-settings: 'tnum'`)** on every time, date, count, and confirmation number — these read at a glance and shouldn't shift width as values change.

### Density and motion

- **Density:** comfortable, not cramped. Each tile breathes. Reference rhythm is closer to a well-set magazine spread than a Notion page.
- **Motion:** deliberate, never showy. The spec already enumerates compound transitions in §8.2 — those are the canonical motion moments. Everything else stays still. Always honor `prefers-reduced-motion`.

## Accessibility floor

- **WCAG AAA where cheap, AA as floor.** The full `audit` skill should pass clean.
- **Direct-sunlight readability is a hard requirement.** Light-mode body text must meet AAA contrast (≥7:1) against its surface; the orange accent must hit AA contrast in every context it's used as text or a target.
- **All interactive targets ≥44×44px.**
- **No information conveyed by color alone.**

## Five principles

1. **Replace the spreadsheet — don't reproduce it.** If a design move makes the page look or feel more like a Google Sheet, reject it.
2. **Glanceable on the floor.** Lead with the answer; bury the supporting fields. If something requires reading more than a phrase, it's probably the wrong default presentation.
3. **One accent, used sparingly.** FXAV orange means "this matters now." If everything is accented, nothing is.
4. **Both modes equally beautiful.** Each is designed against its own use case (sunlit ballroom vs. dim backstage), not auto-derived.
5. **Plain language, never technical chrome.** Empty states, errors, warnings, admin copy — all speak human. Error codes belong in the network tab, never the UI.
