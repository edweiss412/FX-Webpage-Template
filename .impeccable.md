## Design Context

### Users

**Doug Larson (admin, single primary user of `/admin`).** Late 30s / early 40s, project manager at FX Audio Visual. Tech-comfortable from a decade in AV, but the app must not *feel* technical — it has to slide into his existing Google-Sheets-driven workflow with as little friction as possible. He'll touch the admin UI from two physical contexts: a quiet desk between shows, and the venue floor mid-show on a phone. The admin UX must work in both — no hover-only affordances, no tiny click targets, no five-step modals.

**Crew on the venue floor (the audience for `/show/[slug]`).** Indoor corporate event environments — hotel ballrooms and convention center halls. Lighting ranges from house-lights-up bright to dim-stage backstage. Devices are personal phones (Safari/Chrome, ~390px), occasionally pulled up at a loading dock in direct sunlight. Crew are glancing, often one-handed, often mid-task. They came to the page with one of these questions and need it answered in under five seconds:

- **Set/strike days:** what's in the pack, where is it, which case do I open?
- **Show days:** what's my call time, where am I standing, what room?
- **All days:** my hotel, my transport, who else is on this crew, is there a Zoom feed I need to factor in, is there client content (decks, video, playlists) I need to know about?

The page replaces a dense spreadsheet. The job is making that information beautifully presentable and fast to navigate, *not* surfacing every field.

### Brand Personality

**Three words: Professional · Bold-modern · Intuitive.**

Voice is direct, plain-language, and respectful of the reader's time. No jargon, no error codes in user copy, no "field undefined" — when data is missing, the copy is a human sentence. The interface should feel like a confident, well-engineered tool made by someone who actually does this work — not a template, not a SaaS dashboard, not a consumer app trying too hard to be friendly.

**Emotional goal:** when a crew member taps the link and the page loads, they should feel *that's exactly what I needed.* Calm competence. The page works. Doug looks good for sharing it.

### Aesthetic Direction

**Anchor.** FXAV's logo gives one durable brand cue: a saturated warm orange (in the `#F79338`–`#FF8C1A` range) used as an accent against a high-contrast neutral. That orange is the only inherited brand asset worth carrying forward — the rest of FXAV's existing web presence is not a design reference. Everything else is a clean slate.

**Visual tone.**
- **Bold over minimal (75% bold).** Typography has presence, key numbers (call times, room names, dates) are large and confident, and the page never reads as cautious or anonymous.
- **Slightly elegant over utilitarian (~55% elegant).** Generous spacing, considered type pairing, and intentional hierarchy — but never decorative for its own sake. This is a working tool, not a portfolio piece.
- **Balanced quiet/expressive.** Restrained palette and chrome; expressive moments reserved for the hero "Right Now" card, time-sensitive states, and key transitions.

**Anti-references — what this is NOT.**
- Not a printed paper / run-of-show skeuomorph (cream paper, ruled lines, serif body). The whole point is to *replace* the spreadsheet aesthetic, not echo it.
- Not "enterprise SaaS dashboard" — no dense sidebar nav, no chart-grid density, no neutral-gray-on-neutral-gray.
- Not consumer playful — no bouncy mascots, no rounded-everything, no gradient-on-gradient.
- Not "techie" — even though the audience is an AV crew, the surface should feel like good consumer product design, not a developer tool.

**Light AND dark, both first-class.** Crew may open the page on a sunlit loading dock at noon (light mode wins) or backstage at midnight before a 6am call (dark mode wins). Both modes are designed deliberately, not auto-derived from each other. A clearly discoverable theme toggle lives in the UI; respect `prefers-color-scheme` on first paint.

**Color system.**
- **Neutrals carry the page.** Light mode: near-white surface with deep neutral text. Dark mode: deep warm-neutral surface (not pure black — black against the FXAV orange is harsh; aim for a slightly warm `#0E0E10`–`#141416` range) with soft off-white text.
- **One signature accent — FXAV orange.** Reserved for: the active/live indicator on the Right Now card, the "today" pin on the schedule, primary CTAs, and the brand mark. Use it sparingly so it stays meaningful — when orange appears, it means *this matters now.*
- **Avoid red/green as primary semantic colors.** Color-blind crew exist; pair color with text or icon for any state signal (stale sync, COI status, parse warning).
- **Permitted secondary tones:** muted slate / desaturated neutrals for borders, dividers, secondary text. No competing accent hue (no blue, no purple) — the orange stays alone so it carries the brand.

**Typography.**
- **One contemporary sans for UI.** Geometric or neo-grotesque, with a confident range of weights (400/500/600/700) and a strong tabular-figure variant for times, dates, and quantities. Inter, Geist, or General Sans are all fine starting points; pick one and commit. The same family handles headlines and body — no display/body pairing in v1.
- **No serif body.** Serif would pull toward the paper-skeuomorph direction the user explicitly rejected.
- **Tabular figures (`font-feature-settings: 'tnum'`) on every time, date, count, and confirmation number** — these read at a glance and shouldn't shift width as values change.

**Density and rhythm.** Comfortable, not cramped. Each tile breathes. The 2/3/4-column grid (per spec §8.4) sets the rhythm; tile internal padding, line-height, and inter-section spacing should make the page feel calm to scan even when fully populated. Reference rhythm: closer to a well-set magazine spread than a Notion page.

**Motion.** Deliberate, never showy. The spec already enumerates compound-transition contracts in §8.2 — those are the canonical motion moments. Everything else stays still. Always honor `prefers-reduced-motion`.

**Accessibility floor.** WCAG AAA where it's cheap, AA as the absolute floor — the full `audit` skill should pass clean. Direct-sunlight readability is a hard requirement: light-mode body text must meet AAA contrast against its surface (≥7:1 for body), and the orange accent must hit AA contrast in every context it appears as text or as a target. All interactive targets ≥44×44px.

### Design Principles

1. **Replace the spreadsheet — don't reproduce it.** If a design move makes the page look or feel more like a Google Sheet, reject it. This is a clean, modern reading surface for crew, not a prettier table.
2. **Glanceable on the floor.** Every screen is judged by how fast a crew member can answer their question while walking. Lead with the answer; bury the supporting fields. If something requires reading more than a phrase, it's probably the wrong default presentation.
3. **One accent, used sparingly.** FXAV orange means "this matters now." If everything is accented, nothing is. Default surfaces are neutral; orange earns its appearances.
4. **Both modes equally beautiful.** Dark mode is not a 90% inverse of light. Each is designed against its own use case (sunlit ballroom vs. dim backstage) and should feel intentional.
5. **Plain language, never technical chrome.** Empty states, errors, warnings, and admin copy all speak human. Error codes belong in the network tab, never the UI. Doug shouldn't have to know what RLS or a token is, ever.
