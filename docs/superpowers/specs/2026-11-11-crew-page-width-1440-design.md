# Crew page desktop width: 1440px

**Status:** ratified by the product owner on 2026-11-11 from real renders at 1728px (<https://claude.ai/artifact/CKcEXCK4wshycFgKyYPcPC>), Option A. Shipped autonomously.

## 1. Why

The crew page stops at 1200px (`lib/crew/pageContainer.ts:17`, `max-w-300`), so on a 16-inch laptop at 1728px about 260px sits empty on each side and the content column is 864px. The owner chose to raise the limit to 1440px: the column grows to 1104px, rows stay easy to scan, and large monitors keep margins. Full width and a two-column section layout were shown and declined.

## 2.1 Resolved scope: do not relitigate

1440px, everywhere the crew page's own chrome lines up with its body: header, body, footer and the admin preview banners. Phones, tablets and anything below 1440px wide render exactly as today, because the limit only binds above it.

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

The Rooms gallery declares its thumbnail size per width (`components/crew/sections/RoomsSection.tsx:52`). Above 1440px a thumbnail grows to about 264px, so the declaration gains a `(min-width: 1440px) 264px` entry, measured in a browser, and a phone still fetches what it does today. The Gallery's own default (`components/diagrams/Gallery.tsx:119`) is not read by the crew page, which always passes its own; only its comment, which names the old limit, changes.

## 3. Acceptance criteria

- AC-1: at 1728px the header row, the body row, the footer row and the preview banner row are each 1440px wide and share a left edge within 0.5px.
- AC-2: at 1280px each is the window's full width, as today.
- AC-3: the admin popup's goldens and every crew surface below 1440px are unchanged.
- AC-4: the Rooms gallery's declared size at 1728px is within 8px of the rendered thumbnail width.

## 4. Mode boundaries and dimensional invariants

Wide mode only, and only above 1440px. The relationships are AC-1 and AC-2, asserted with `getBoundingClientRect()` in a real browser.

## 4.1 Transition Inventory

| From | To | Treatment |
| --- | --- | --- |
| Window under 1440px | Window over 1440px | instant: the limit is static CSS, as it is at 1200px today |

## 5. Documented limits

- The admin pages keep their own width; this is the crew page and its preview chrome only.
- Above 1440px the margins grow again; the owner chose that over full width.
