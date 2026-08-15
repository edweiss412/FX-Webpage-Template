# Crew chrome (footer band + header avatar menu) + wizard step connector

**Date:** 2026-08-09 · **Authoring branch:** `docs/quick-wins-2-specs` · **Implementation branches:** `feat/crew-chrome-footer-avatar` (§2), `feat/wizard-step-connector` (§3) · **Status:** spec-APPROVED (codex-guard R3 2026-08-09; R1-R2 findings repaired in-branch)

## §0 Scope and design source of record

The UI half of the quick-wins-2 pass (mech half: `2026-08-09-quick-wins-2-mech.md`). Three claimed entries (invariant 12, marked on `docs/quick-wins-2-specs`):

1. `BL-CREW-FOOTER-OBSCURED-BY-FIXED-BOTTOM-BAR` (MEDIUM) — archive on §2.
2. `BL-CREW-FOOTER-NOT-ANCHORED-SHORT-CONTENT` — archive on §2 (same root cause).
3. `BL-WIZARD-CONNECTOR-MAXW-INERT` — archive on §3.

**Design source of record:** the ratified mockup artifact (three iteration rounds with the user, 2026-08-09) at `https://claude.ai/code/artifact/32e30717-3fb5-4de6-b576-a7be54aba783`. Round 3 is the ratified state; this spec §1.1 restates every ratified decision in full so the artifact is corroborating, not load-bearing.

## §1.1 Resolved scope — do not relitigate

All ratified by the user 2026-08-09 via AskUserQuestion over the mockup rounds.

1. **Footer approach: Option A** — the footer clears the fixed mobile tab bar and anchors to the viewport bottom on short pages. Moving controls into the tab bar and hiding footer chrome were both rejected.
2. **Footer form: the one-line band** ("Design 2", round 2→3): a raised band (`--color-surface-raised` — whose DESIGN.md §1.1 role literally includes "footer pinned-to-bottom variant"), one row at phone width: fine-print run of mark · year · freshness on the left, a **symbol-only report button** on the right.
3. **Report control loses its visible copy** ("lets remove the 'Something looks wrong?' copy and just keep the symbol. Tapping symbol launch a popup modal"). The accessible name stays `Something looks wrong?`; tapping opens the existing ReportModal, unchanged. The discoverability cost (a symbol invites fewer reports than a written question) was surfaced in the mockup note and ratified anyway — do not relitigate it back into text.
4. **The theme switch leaves the footer at every width** ("theme toggle doesnt belong in this grouping") and moves to the crew page header, **hidden in a menu opened from an avatar** ("lets put the light/dark switch in the header but hide it in a menu from the avatar there on tap").
5. **Menu contents: Menu A** — identity header (name · role), the theme item, and `Not you? Switch person` all live in the avatar menu. The existing always-visible "Not you?" link is absorbed; its recovery flow becomes two taps, ratified with the tradeoff stated on the mockup.
6. **Wizard connector: render it** (user selected the mockup's draw-the-line option): the intended hairline between step groups becomes visible; deleting the dead constraint was rejected.
7. **Autonomy: both user review gates WAIVED** (grant 2026-08-09). Stop only for a genuinely NEW question.
8. **All AGENTS.md invariants bind**; both branches are UI surfaces — the impeccable dual gate (critique + audit) runs per branch on the affected diff.

## §2 Crew chrome — footer band, flex chain, header avatar menu

Code claims verified 2026-08-09 at `97e179d83`; anchors file + symbol, line numbers are drafting-time locators.

### §2.1 The broken flex chain (root cause both footer entries share)

`app/show/[slug]/layout.tsx` renders `page-shell` as `flex min-h-screen flex-col` (:38) precisely so the footer's `mt-auto` anchors (`components/layout/Footer.tsx` :20-23 comment, :118 `mt-auto`). The crew route interposes `<div data-testid="crew-shell">` (`app/show/[slug]/[shareToken]/_CrewShell.tsx` :461) — a classless block — so `mt-auto` resolves against a block parent and does nothing, and nothing pads the page above the fixed mobile bar (`components/crew/CrewSubNav.tsx` :155, `min-[720px]:hidden fixed inset-x-0 bottom-0 z-10`).

**Fix:** `crew-shell` joins the chain: `flex min-h-0 flex-1 flex-col` (Tailwind v4 does NOT default flex to stretch — DESIGN.md §7; the chain is stated explicitly per the dimensional-invariants rule). The footer's `mt-auto` then anchors on short pages with no further change.

### Dimensional Invariants

Each row verified by a real-browser assertion in the plan, never jsdom (§3's nav-to-connector relationship is restated in its own section):

| Parent → child | Guarantee |
| --- | --- |
| `page-shell` (`flex min-h-screen flex-col`) → `crew-shell` | `flex-1` on crew-shell: fills remaining viewport height |
| `crew-shell` (`flex flex-col`) → `page-footer` | `mt-auto` on the footer: bottom-anchored when content is short |
| `page-footer` BOX bottom vs fixed bar top, <720px | **bar clearance lives on `crew-shell` as bottom padding, BELOW the footer box** (`pb-[calc(var(--spacing-tap-min)+env(safe-area-inset-bottom)+…)] min-[720px]:pb-0`; exact calc pinned in the plan against the measured 53.3px bar + margin). Padding INSIDE the footer cannot lift the footer's own box above the bar (R1 F1) — the space must be under it. Assertion: `footer.bottom ≤ bar.top` at 390×844, scrolled to end, long AND short pages |

Because the shell now owns bar clearance, the `<main>` clearance recipe (`components/crew/CrewSections.tsx` :115) becomes double-padding at <720px; the plan reduces main's mobile bottom padding to the ordinary rhythm value in the same task, and the impeccable gate judges the resulting spacing. Short-page anchoring consequence: at <720px the anchored footer's bottom sits at `viewport.bottom − clearance` (the clearance strip shows page background behind the opaque bar); at ≥720px it sits at `viewport.bottom`.

### §2.2 The footer band

`components/layout/Footer.tsx` is crew-mounted only (`_CrewShell.tsx` is its sole importer — verified). The stacked mobile column (`flex-col items-start gap-3`, :119) becomes **one row at every width**:

- **Left — fine print in a wrapping cell (R1 F2: "one line" is the DEFAULT state's look, not a promise long copy can keep at 390px):** the band is a single-row flex — `[text cell, min-w-0, flex-1] [icon button, shrink-0]`, `items-center`. The text cell holds `FXAV · <year> · ` plus the freshness slot and WRAPS internally when the copy is long; no truncation, no ellipsis — stale-warning copy (e.g. the shipped "This page hasn't updated recently. Text Doug to check on it.", `lib/messages/catalog.ts` :2640 region) must stay fully readable. The freshness slot keeps its existing three states verbatim (guard conditions, from :121-138): `lastCheckedAt` present → `<StaleFooter>` (`components/shared/StaleFooter.tsx`, unchanged); else `asOf` present → "as of <time>"; else "syncing…". Typography per DESIGN.md: `text-xs`, `text-text-subtle`/`text-text-faint`, brand run keeps `tracking-eyebrow-strong` and tabular year. **Real-browser oracle (jsdom cannot prove layout):** an e2e case renders the band at 390px with the LONGEST catalog stale string active (constructed stale state per the existing stale-footer fixtures) and asserts no horizontal overflow, no overlap between text cell and icon (rects disjoint), and the icon's 44px floor intact.
- **Right — the report symbol:** the existing `ReportButton` (`components/shared/ReportButton.tsx`) gains an **icon variant** (new prop; default behavior of both existing variants unchanged): `min-h-tap-min min-w-tap-min` bordered `rounded-sm` icon button matching the shipped toggle recipe (`ThemeToggle.tsx` :132 class run is the visual precedent), lucide `MessageCircleWarning`-family glyph (exact glyph is an impeccable-gate call from the shipped icon set, DESIGN.md §8), `aria-label="Something looks wrong?"`; opens the existing ReportModal with unchanged props (`surface`, `surfaceId`, `showId`, autocapture). When `showId` is absent the button is absent (existing guard, :143).
- **Band surface:** `bg-surface-raised` with top hairline `border-border`; shadow via canonical `shadow-(--shadow-…)`-free utility — the mech arc (§2.2 there) makes `shadow-popover`/`shadow-tile` canonical; the band uses the token the impeccable pass ratifies or none.
- **Clearance: NOT the band's job (R2 F1 residue removed).** Bar clearance has exactly ONE owner — `crew-shell`'s bottom padding per §2.1. The band carries only its own ordinary internal padding at every width; a band that also carried bar clearance would ship silently oversized while the geometry AC still passed.
- **ThemeToggle is removed from the Footer at all widths** (§1.1 item 4). `Footer` drops the import; the toggle's owner becomes the header (§2.3).

**No fixed-bottom footer:** the band scrolls with the page (it is the page's end), exactly as today — only clearance and layout change. Desktop (`≥720px`, no fixed bar) renders the same single row with the existing `sm:` paddings.

### §2.3 The header avatar menu

`components/layout/Header.tsx` right slot (`page-header-right-slot`, :118) currently renders the text `IdentityChip` (`components/auth/IdentityChip.tsx`): name · role stack plus an always-visible `Not you?` button (aria-label `Switch crew member`, :85) driving the picker's `clearIdentity` flow (`lib/auth/picker/clearIdentity.ts`).

**Replacement (crew pages with an identity):** an **avatar button** — the person's initials on their deterministic swatch from `lib/crew/avatarColor.ts` (`AVATAR_PALETTE`/`avatarColor`, :11/:28; white initials, AA-guarded by `tests/crew/avatarColor.test.ts`) — `min-h-tap-min min-w-tap-min` circular target, `aria-haspopup="menu"`, `aria-expanded`, accessible name carrying the identity (constructed per the partial-identity rule in the guard conditions below; no em dash in copy per the mechanical UI gate). Tap opens a right-anchored popover menu:

| Menu row | Behavior |
| --- | --- |
| Identity header (name · role) | NOT a menu item: rendered inside the popover above the item list, outside the `role="menu"` element's item children; the menu's accessible name derives from it via `aria-labelledby`. Text treatment `text-text-strong`/`text-text-subtle`; the name/role separator keeps the shipped screen-reader-separator contract (`tests/components/identityChipSrSeparator.test.tsx` — real sr-only text node, never an aria-label) |
| Theme row | `role="menuitemcheckbox"` with `aria-checked` (checked = dark active) — the valid menu semantic for a stateful toggle (R1 F3; `aria-pressed` does not ride along on a menu item). Label "Dark mode" + glyph; activating it applies the relocated ThemeToggle behavior — same dataset/localStorage handshake and no-FOUC contract with `app/layout.tsx` (ThemeToggle.tsx header comments; SSR-stable Moon-first render) — flips `aria-checked`, and does NOT close the menu |
| `Not you? Switch person` | **the shipped server-action FORM boundary, preserved (R1 F4):** the row renders the same form the current control submits — hidden `slug`, `shareToken`, `showId` inputs + the typed `clearIdentity` action wrapper (`components/auth/IdentityChip.tsx` :25/:78 region) — with the submit button carrying `role="menuitem"` and the `Switch crew member` accessible-name semantics. Tests extend the pinned form-and-route-inputs contracts (the existing IdentityChip suites), never a bare invocation spy |

**Keyboard/focus contract (complete, R1 F3):** trigger click or Enter/Space/ArrowDown opens the menu and moves focus to the FIRST item; ArrowUp opens with focus on the LAST. Inside: ArrowDown/ArrowUp cycle with wrap; Home/End jump; focus is NOT trapped — Tab and Shift+Tab close the menu and move focus per the natural tab order; Escape closes and returns focus to the avatar; outside pointer-down closes without stealing focus. Items ≥44px, focus-visible rings per DESIGN tokens (`focus-ring` + container-matched offset).

Popover: `bg-surface-raised`, `border-border`, canonical popover shadow, `z-` above page content (the crew fixed bar is `z-10` and bottom-anchored; the menu anchors top-right — plan pins the value against the existing numeric bands, `BL-ADMIN-SEMANTIC-Z-INDEX-SCALE` stays untouched).

**Guard conditions:**

- `identityChip` prop absent (Header renders for states without a resolved identity, :41 optional): the right slot renders a **standalone theme icon button** (today's ThemeToggle recipe verbatim) so the switch never becomes unreachable; no avatar, no menu.
- Partial identity (a real state — R1 F6, completed per R2): the trigger's accessible name is CONSTRUCTED by joining the non-empty parts of [name, role, "account menu"] with ", " — so "Doug L., Lead, account menu"; name only → "Doug L., account menu"; role only → "Crew member, Lead, account menu" (the "Crew member" fallback substitutes for a blank name); both blank → "Crew member, account menu". No dangling punctuation can occur by construction. The identity HEADER renders only its non-empty parts with no separator when either is blank (the shipped separator contract's partial-data behavior, `tests/components/identityChipSrSeparator.test.tsx` :106 region, inherited not re-decided); when BOTH are blank the header is omitted entirely and the menu takes `aria-label="Account menu"` INSTEAD of `aria-labelledby` — an `aria-labelledby` pointing at an empty node would leave the menu unnamed. `avatarColor` blank-name slate fallback (DESIGN.md §1.4) and neutral initials glyph as before.
- Admin surfaces are untouched: `AdminNav` keeps its own ThemeToggle (`components/admin/nav/AdminNav.tsx` :188).

### Transition Inventory

The menu is the arc's one multi-state component; footer band states swap instantly per the shipped freshness contract:

| Pair | Treatment |
| --- | --- |
| closed → open | `duration-fast` fade/scale per DESIGN §5, `motion-reduce:` instant |
| open → closed (Escape / outside / navigate) | same, reversed; instant under reduced motion |
| theme flip while open | instant (existing toggle contract); menu stays open |
| open while page re-renders (realtime refresh) | menu unmounts only if its anchor unmounts; state is component-local |

### §2.4 Test surface impacts (enumerated so the plan budgets them)

- `tests/e2e/theme-toggle.spec.ts` — rewritten as TWO arms (R1 F5: the suite's admin-fixture sign-in renders `identityChip=null`, so it can only ever reach the standalone toggle): (a) the existing admin-fixture recipe drives the STANDALONE header toggle at 390px (the 760px workaround block at :175-197 is deleted with its reason — the bar no longer covers the control); (b) the avatar-menu arm establishes a CREW identity via the picker recipe `tests/e2e/picker-flow.spec.ts` already ships, then drives menu-open → theme item → dataset assertion at 390px.
- `tests/e2e/crew-page.spec.ts`: inv8 (:838) gains the footer clause (`page-footer` bottom ≤ bar top at 390px scrolled to end); the short-page constructed case asserts the anchored geometry per §2.1 (footer bottom at `viewport.bottom − clearance` under 720px); the DIRECT footer-toggle interaction at :1099 re-targets per the new chrome.
- Footer report-trigger assertions (:1518-1533) re-target the icon variant (accessible name unchanged — locators by role+name survive).
- Identity-chip surfaces (R1 F7): `tests/components/IdentityChip.test.tsx`, `tests/components/identityChipSrSeparator.test.tsx`, `tests/components/_metaPickerRoleChipContract.test.ts`, and `tests/components/Header.test.tsx` all pin the CURRENT text-chip rendering and are rewritten against the avatar + menu (the sr-separator and form-boundary contracts carry over, re-targeted); `tests/e2e/picker-flow.spec.ts`'s closed-menu identity-text assertions (:151 and its three siblings) re-target the avatar's accessible name / open-menu header.
- Screenshots (enumerated, not "any"): the six help WebPs `crew-preview-{today,gear,schedule}-mobile` × light/dark (`scripts/help-screenshots.manifest.ts` :95 region) re-capture per the byte-gate discipline (pinned image, `--platform linux/amd64`), pixel-diffed before re-baseline; the mobile-safari suite re-runs.
- New jsdom suites: ReportButton icon variant contract; avatar menu (roles incl. `menuitemcheckbox` state, keyboard contract, focus return, the FORM boundary with hidden route inputs); Footer band states (three freshness states × icon presence). Layout proofs stay in e2e per the jsdom-cannot-measure rule.

## §3 Wizard step connector — render the hairline

> **AMENDED 2026-08-10, owner-ratified, after measurement.** This section as
> originally written mandated a stretched nav (`flex-1 min-w-0`), a connector of
> `h-px max-w-confirm-box flex-1`, border-ramp state colours, and a `>0 ∧ ≤60`
> band. All four were implemented, measured, and then changed. The spec is
> canonical (invariant 7), so what shipped is recorded HERE rather than left to
> contradict the code:
>
> - **Fixed width, content-width nav.** The connectors measured EXACTLY 60.00px
>   in all twelve step × viewport × theme cells, so `flex-1` grew nothing and
>   only displaced trailing dead space (16-80px at 390px, 257.77px at 900px
>   step 3), with the rail resizing between steps 2 and 3 as the page container
>   changed. Shipped: connector `w-confirm-box`, nav content-width.
> - **Text-ramp colours, not border-ramp.** As a standalone 1px rule on the page,
>   `--color-border` measured 1.22:1 (light) / 1.35:1 (dark) and
>   `--color-border-strong` 1.52:1 / 1.70:1 — all under the 3:1 non-text floor —
>   and the two differed from EACH OTHER by 1.25:1, so the done/ahead state was
>   not perceivable. Shipped: `text-faint` ahead (3.16:1 / 4.22:1), `text-subtle`
>   done (6.5:1 / 6.8:1). The rule is generalized in DESIGN.md §1.2a.
> - **Equality, not a band.** A fixed contract is asserted as `width === 60`; the
>   band admitted a `max-w-8` mutant rendering done connectors at 32px.
> - **AC-U5 is superseded by AC-U5a below.**


`components/admin/OnboardingWizard.tsx` `StepIndicator` renders the connector (`wizard-step-connector`, :260) as `h-px max-w-confirm-box flex-1 rounded-full` with `bg-border`/`bg-border-strong` state colors already coded — it computes to 0×1 because the `<nav>` (:190-193, `flex items-center gap-2 sm:gap-3`) is a content-sized flex item inside a `justify-between` row (the entry's probe: 0×1 at 390px AND 900px).

**Fix:** the `justify-between gap-3` wrapper holds `<StepIndicator>` as its ONLY child (probed 2026-08-09, `components/admin/OnboardingWizard.tsx` :738-740 — `justify-between` is currently inert; there is no sibling, contra the entry's framing — R1 F8). The nav takes `flex-1 min-w-0`; its connectors' `flex-1` then distributes real free space; `max-w-confirm-box` clamps each at 60px (`--spacing-confirm-box: 60px`, `app/globals.css` :186). Existing state colors (done `bg-border-strong`, ahead `bg-border`) ship as-is — they were coded for exactly this render.

**Consequences, pinned:**

- `tests/e2e/canonical-class-dimensions.spec.ts` — the 0-width regression tripwire (:91-95 comment; keys `wizard-step-connector-0/1`) flips to a BAND assertion: width `> 0` and `≤ 60`, height 1. The band form (never exact-60) is deliberate: visible-label width varies by step state, so equality would pin an accident of one state (R1 F9).
- **Measurement states pinned (R1 F9):** the suite measures at BOTH `/admin?step=1` and `/admin?step=3` (the step renders from the URL hint — `pickStep`, `OnboardingWizard.tsx` :132 — and step 3 carries the longest visible label "Review & publish", the minimum-free-space case), each at 390px and 900px. The plan verifies the indicator renders at `?step=3` under the suite's fixture (if the step gate blanks the indicator there, the constructed case seeds `maxReachedStep` instead — either way the longest-label state IS measured, not assumed).
- `tests/e2e/__baselines__/canonical-dimensions.json` is a NUMERIC rect baseline asserted natively in CI (`.github/workflows/lifecycle-layout-e2e.yml` :11 classifies it as rect assertions, NOT a byte gate — R1 F9); it re-baselines through the suite's own native update path with tolerance, and the Docker `--platform linux/amd64` discipline applies only to the WebP screenshot gates enumerated in §2.4.
- Wizard-side rationale rot (R1 F7): `tests/e2e/step3-review-page.layout.spec.ts` (its fidelity transcription reproduces the unstretched nav), `tests/e2e/tap-target-floor.layout.spec.ts` (assertion rationale says connectors are 0px), and `tests/specLint/canonicalTokenIdentity.test.ts` (its browser-proof rationale says the connector is permanently zero-width) each get their transcription/rationale updated in the same task.
- Impeccable dual gate judges the rendered hairline (spacing, weight against the pills); any P0/P1 finding lands pre-merge per invariant 8.

**Dimensional invariants:** nav (`flex-1 min-w-0`, sole child of the `justify-between gap-3` row) → connectors (`flex-1 max-w-confirm-box`): connectors absorb only free space; pills and labels keep intrinsic size (`shrink-0` on pill targets already shipped, :187).

## §4 Documented limits

1. **Two-tap "Not you?"** is a ratified UX regression-in-exchange (§1.1 item 5); the picker flow itself is unchanged.
2. **Symbol-only report** may reduce report volume (§1.1 item 3) — ratified; the accessible name and modal copy keep the full invitation.
3. **Footer band is crew-scoped.** Admin/help surfaces have their own chrome; `Footer` has no second importer today, and this spec adds none.
4. **The wizard connector's sub-60px clamp at narrow widths** is accepted render behavior, pinned per-viewport rather than forced to 60.
5. **No native-app safe-area simulation in e2e** — `env(safe-area-inset-bottom)` is 0 in the harness browsers; clearance asserts the calc's non-inset floor (the bar itself is measured live).

## §5 Acceptance criteria

- **AC-U1:** at 390×844 on the seeded crew route, scrolled to end: `elementFromPoint` at the report button's centre hits the button; the `page-footer` BOX bottom ≤ bar top (clearance below the footer, per §2.1); both crew-footer entries' probe symptoms are un-reproducible.
- **AC-U2:** constructed short page: under 720px the footer anchors at `viewport.bottom − clearance` (within 0.5px) with `footer.bottom ≤ bar.top`; at ≥720px it anchors at `viewport.bottom` (entry's 501.5px dead-space case renders anchored in both regimes).
- **AC-U3:** footer band renders the three freshness states in the single-row [wrapping text cell][icon] structure; the longest catalog stale string at 390px produces no horizontal overflow, no cell/icon overlap, 44px icon floor intact (real-browser oracle); accessible name `Something looks wrong?`; modal opens unchanged.
- **AC-U4:** ThemeToggle absent from Footer at all widths; avatar menu delivers theme switch + person switch with the full a11y contract (roles, Escape, focus return, 44px items); identity-less pages keep a reachable standalone toggle; admin nav untouched.
- **AC-U5 (SUPERSEDED 2026-08-10 by AC-U5a):** wizard connectors measure >0 and ≤60px wide at `?step=1` AND `?step=3`, each at 390px and 900px; state colors render; the numeric rect baseline updates through its native path; the tripwire comment plus the three rationale-rot sites (§3 consequences) all describe the rendered state.
- **AC-U5a:** wizard connectors measure EXACTLY 60px × 1px at `?step=1`, `?step=2` AND `?step=3`, each at 390px and 900px. The done/ahead state renders as distinct tokens (`text-subtle` vs `text-faint`), and EACH connector clears the 3:1 non-text contrast floor against what is actually behind it — measured on the composited colour, including effective opacity, at every step in BOTH themes. The numeric rect baseline updates through its native path, and every rationale site describes the rendered state.
- **AC-U6:** impeccable critique + audit pass per branch (P0/P1 fixed or DEFERRED.md-dispositioned); full suite + typecheck + lint + format + real CI green; three archives land with markers stripped (invariant 12).

impeccable-gate: run — both branches are UI surfaces (crew chrome; admin wizard step indicator)
