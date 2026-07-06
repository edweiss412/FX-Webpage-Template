# Rooms & scope section cards — redesign mock snapshot

Source: claude.ai/design project **FXAV Crew Pages** → `Step 3 Review - Publish (B).html`
(project `33ee8c30-4eaa-48b3-9e3e-8fa642f7f3cd`, file `review/sections.jsx` +
`review/style.css`, screenshot `screenshots/rooms-redesign.png`).

Snapshotted verbatim below so the implementation (and any adversarial reviewer)
can check fidelity without re-fetching the design project. This supersedes the
flat-list rooms rendering that shipped with the step-3 modal (the `-detail`
"Room notes" inset from PR #295 §F).

## Target — per-room card

Each room becomes a self-contained bordered card:

- **Header** (accent-tinted panel, hairline-split):
  - top row: room **name** + a short **kind tag pill** + **floor** right-aligned.
  - meta row: **Set · Show · Strike** times inline, separated by thin neutral
    vertical dividers, with **Show emphasized** in the accent-on-bg color.
  - **Setup** row (label + free-text value).
  - **Room Dimensions** row.
- **Scope list**: Audio / Video / Lighting / Scenic / Other — each row a colored
  discipline icon chip + eyebrow key + parsed value.

## Field mapping → real `lib/parser/types.ts#RoomRow`

| Mock element                 | RoomRow field                              | Notes |
| ---------------------------- | ------------------------------------------ | ----- |
| room name                    | `name`                                     |       |
| kind tag pill                | `kind` (`gs`/`breakout`/`additional`)      | humanized: General session / Breakout / Additional (replaces today's raw-enum eyebrow) |
| floor (header top-right)     | `floor`                                    |       |
| Set / Show / Strike          | `set_time` / `show_time` / `strike_time`   | Show emphasized |
| Setup                        | `setup`                                    |       |
| Room Dimensions              | `dimensions`                               |       |
| Audio/Video/Lighting/Scenic/Other | `audio`/`video`/`lighting`/`scenic`/`other` | `power`/`digital_signage` stay out of scope (event_details surfaces them), matching the crew GearSection ordering |
| diagram-link icon            | — (no backing field)                       | **OMITTED** — no invented affordance (product register) |

## Confirmed decision (owner, 2026-07-04)

**Empty scope disciplines:** always render all 5 discipline rows; empty ones read
a muted **"Not specified"** (not the mock's literal "Not needed"). This keeps the
mock's consistent 5-row card while, on a parse-review surface, stating fact rather
than asserting an intentional decision — aligns with PRODUCT.md ("missing data is
a human sentence") and the repo's "review surface shows exactly what parsed"
philosophy.

## Token / ban adaptations for the repo

- Mock `--accent-tint` header bg → `bg-accent/[0.06]`; `--accent-wash` pill →
  `bg-accent/10 text-accent-on-bg`; `--sunken` icon chip → `bg-surface-sunken`.
- Mock's `.rm-item { border-left: 1px … }` Set/Show/Strike dividers are rendered
  as neutral vertical **divider `<span>`s** (`w-px … bg-border-strong`), NOT
  `border-left` — satisfies both the impeccable side-stripe ban and the repo's
  §F no-`border-l` rule.
- Per-discipline scope-icon colors kept as single mid-lightness OKLCH values
  (readable on the sunken chip in both light and dark).

Scope of this change: the **Step-3 review modal** `RoomsBreakdown` only
(`components/admin/wizard/step3ReviewSections.tsx`). The crew-page GearSection
"Room details" card is a separate surface and is untouched.
