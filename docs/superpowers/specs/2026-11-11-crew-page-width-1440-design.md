# Crew page desktop width: 1440px

**Status:** ratified by the product owner on 2026-11-11 from real renders at 1728px (<https://claude.ai/artifact/CKcEXCK4wshycFgKyYPcPC>), Option A. Shipped autonomously.

## 1. Why

The crew page stops at 1200px (`lib/crew/pageContainer.ts:17`, `max-w-300`), so on a 16-inch laptop at 1728px about 260px sits empty on each side and the content column is 864px. The owner chose to raise the limit to 1440px: the column grows to 1104px, rows stay easy to scan, and large monitors keep margins. Full width and a two-column section layout were shown and declined.

## 2.1 Resolved scope: do not relitigate

1440px, everywhere the crew page's own chrome lines up with its body: header, body, footer and the admin preview banners. A window 1200px wide or narrower renders exactly as today. Between 1200px and 1440px the rows fill the window, minus the same gutters, where today they stop at 1200px; above 1440px they stop at 1440px.

## 2. Change

Every crew page surface that today caps at 1200px moves to 1440px (`max-w-360`, 90rem), so their edges stay aligned:

| Surface | Today |
| --- | --- |
| Page body row | `lib/crew/pageContainer.ts:17` (`CREW_PAGE_CONTAINER`, read by `components/crew/CrewSections.tsx:947` and `components/crew/CrewLoadingSkeleton.tsx:137`) |
| Header | `components/layout/Header.tsx:130` (`max-w-[1200px]`) |
| Loading skeleton header | `components/crew/CrewLoadingSkeleton.tsx:79` (`max-w-[1200px]`) |
| Footer | `components/layout/Footer.tsx:133` (`max-w-300`) |
| Preview banner, its loading state, staged preview banner | `components/admin/PreviewBanner.tsx:77`, `app/admin/show/[slug]/preview/[crewId]/loading.tsx:30`, `components/admin/StagedPreviewBanner.tsx:106` (`max-w-300`) |

`--breakpoint-xl` (1200px, `app/globals.css:335`) is a breakpoint, not this limit, and does not change. `DESIGN.md:906` describes it as the container width, so its row is corrected to say the crew page's limit is 1440px.

The Rooms gallery declares its thumbnail size per width (`components/crew/sections/RoomsSection.tsx:52`): 200px from 1024px up. From 1024px the thumbnail is a quarter of what the wide column leaves after the nav, gutters, card padding and gallery gaps, so it grows with the window until the 1440px limit and stays at 260px above it. The declaration becomes `(min-width: 1440px) 260px, (min-width: 1024px) calc((100vw - 402px) / 4)`, then today's entries. The 402px was measured in Chromium on the seeded Waldorf show, the same at every width from 1024px to 1440px. Below 1024px, where phones and tablets are, the declaration does not change. The Gallery's own default (`components/diagrams/Gallery.tsx:119`) is not read by the crew page, which always passes its own; only its comment, which names the old limit, changes.

## 3. Acceptance criteria

- AC-1: at 1728px the header row, the body row, the footer row and the preview banner row are each 1440px wide and share a left edge within 0.5px.
- AC-2: at 1280px each row is the window's full width, its content inset by the same gutter, where today it stops at 1200px; at 1200px and 1024px each is as today.
- AC-3: the admin popup's goldens are unchanged, and nothing renders differently at 1200px or narrower.
- AC-4: the Rooms gallery's declared size is within 8px of the rendered thumbnail width at 1280px and at 1728px, and unchanged below 1024px.

## 4. Mode boundaries and dimensional invariants

Wide mode only, and only above 1200px. The relationships are AC-1 and AC-2, asserted with `getBoundingClientRect()` and computed padding in a real browser.

## 4.1 Transition Inventory

| From | To | Treatment |
| --- | --- | --- |
| Window at or under 1200px | Window between 1200px and 1440px | instant: static CSS, the rows fill the window |
| Window between 1200px and 1440px | Window over 1440px | instant: static CSS, the rows stop at 1440px |
| Window at or under 1200px | Window over 1440px | instant |

## 5. Documented limits

- The admin pages keep their own width; this is the crew page and its preview chrome only.
- Above 1440px the margins grow again; the owner chose that over full width.
