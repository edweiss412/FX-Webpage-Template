# Step-3 Review Modal Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `Step3DetailsDialog` with the Variant-B two-pane review modal per the APPROVE'd spec `docs/superpowers/specs/step3-onboarding/2026-07-02-step3-review-modal-redesign.md` (12 adversarial rounds; the spec is the canonical contract — this plan cites it as §N and copies exact values; where plan and spec disagree, the spec wins).

**Architecture:** Three new pure/leaf modules (`step3SectionStatus`, `publishIntent`, `step3ReviewSections`) feed one new modal component (`Step3ReviewModal`), wired into `Step3SheetCard` (single checked-state controller) and `Step3Review` (result-bearing settlement with a waiter queue). CSS-only responsive modes; real-browser verification via the standalone Playwright harness.

**Tech Stack:** Next 16 / React 19 client components, Tailwind v4 tokens (`app/globals.css`), lucide-react 1.14, Vitest 4 (jsdom opt-in per file), Playwright standalone config (`tests/e2e/standalone.config.ts`) + `pnpm dlx @tailwindcss/cli@4.2.4` compile harness.

## Global Constraints

- TDD per task: failing test → minimal implementation → pass → commit (`--no-verify`, conventional commits, one task per commit). UI files = Opus-owned.
- Tokens only (DESIGN.md §10); interaction constants get the DESIGN.md §5 note (spec §6.3a disposition). No em dashes in UI copy (DESIGN.md:296). No raw codes in UI (invariant 5; spec §8 Warnings hardening).
- Spec mode names: `sheet` (<640), `popup` (640–<1024), `two-pane` (≥1024) — Tailwind `sm:`/`lg:` (spec §5).
- Constants (spec-exact): `SCROLL_SPY_OFFSET_PX = 90`, `DRAG_DISMISS_THRESHOLD_PX = 110`, `DRAG_SLOP_PX = 6`. Caps unchanged: CREW 30 / ROOMS 20 / HOTELS 12 / PL cases 12 / PL items 8 / SCHED days 14 / SCHED entries 6.
- Test commands: single file `pnpm test <path>`; full `pnpm test`; standalone e2e `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts <spec>`. jsdom tests start with `// @vitest-environment jsdom`.
- Test-ids: spec §4 inventory, all prefixed `wizard-step3-card-${dfid}` (`-review-modal`, `-review-backdrop`, `-review-close`, `-review-header`, `-review-chip`, `-review-main`, `-review-title`, `-review-sheetlink`, `-review-rail`, `-review-chiprail`, `-review-rail-item-<id>`, `-review-chip-item-<id>`, `-review-section-<id>`, `-review-footer`, `-review-note`, `-review-publish`, `-review-grab`). Existing `-breakdown-*` ids preserved.
- **Meta-test inventory (declared):** no Supabase client calls (the new `lib/admin/publishIntent.ts` is an internal Next API fetch — carries `// not-subject-to-meta: internal Next API fetch, not a Supabase client call`); sentinel-hiding registry walks `components/crew/` only — N/A; admin-alert catalog N/A; advisory locks N/A (no `pg_advisory*` touched). NEW structural tests added by this plan: no-duplicate-id sweep (Task 6), transition audit (Task 12), tap-target audit (Task 13).
- Anti-tautology: expectations derive from fixture data (e.g. flagged sections computed via the mapping lib; `sectionTops` fixture drives scroll-spy expectations); DOM label queries are container-scoped (never whole-document when twins exist).

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `lib/admin/step3SectionStatus.ts` | Create | Pure mapping + status derivation (spec §7) |
| `tests/admin/step3SectionStatus.test.ts` | Create | Unit tests (node env) |
| `lib/admin/publishIntent.ts` | Create | `postPublishIntent` POST helper (spec §4) |
| `tests/admin/publishIntent.test.ts` | Create | Unit tests |
| `components/admin/wizard/step3ReviewSections.tsx` | Create | Section registry + restyled bodies (moved from Step3SheetCard) + `reviewWarningTitle` (spec §6, §8) |
| `tests/components/admin/wizard/step3ReviewSections.test.tsx` | Create | Registry + warning-title matrix + restyle contracts |
| `components/admin/wizard/Step3ReviewModal.tsx` | Create | Modal shell, header, navs, scroll-spy, footer, drag (spec §5, §6.2–6.4, §9, §10) |
| `tests/components/admin/wizard/Step3ReviewModal.test.tsx` | Create | Shell/a11y/nav/footer jsdom tests |
| `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` | Create | Transition audit (spec §11) |
| `components/admin/wizard/Step3Review.tsx` | Modify | `toggleOne → Promise<boolean>`, waiter map, settlement + lifecycle effects (spec §9.2) |
| `tests/components/admin/wizard/step3PublishSettlement.test.tsx` | Create | Ordering cases a–e + lifecycle (spec §9.2.4/9.2.6) |
| `components/admin/wizard/Step3SheetCard.tsx` | Modify | Mount modal; `requestSetChecked`; PublishCheckbox pure-controlled; aria-live region; bodies removed |
| `components/admin/wizard/Step3DetailsDialog.tsx` | Delete | Superseded (spec §3.9) |
| `tests/components/admin/wizard/Step3DetailsDialog.test.tsx` | Delete | Replaced by Step3ReviewModal tests (mapping in Task 5) |
| `app/globals.css` | Modify | Rename `step3-details` attribute hooks → `step3-review` (keyframes reused) |
| `DESIGN.md` | Modify | §5 "Interaction constants" note (insert after line 246, before `## 6.` at 248) |
| `tests/e2e/step3-review-modal.layout.spec.ts` | Create | Static real-markup layout invariants (spec §5.1, §15/§16) |
| `tests/e2e/step3-review-modal.interactions.spec.ts` | Create | Bundled live-component drag/scroll-spy/nav tests |
| `tests/e2e/standalone.config.ts` | Modify | Register the two new specs |

**Shared fixture:** `tests/components/admin/wizard/_step3ReviewFixture.ts` (Task 1 creates) — one `ParseResult`-shaped fixture + `Step3Row` builders reused by unit, component, and e2e specs. Derive from the existing fixture in `tests/components/step3SheetCard.test.tsx` (import/copy its `FIX` shape; keep required fields).

---

### Task 1: Section-status mapping lib (spec §7)

**Files:**
- Create: `lib/admin/step3SectionStatus.ts`
- Create: `tests/admin/step3SectionStatus.test.ts`
- Create: `tests/components/admin/wizard/_step3ReviewFixture.ts`

**Interfaces (Produces):**
```ts
export type SectionId =
  | "venue" | "event" | "crew" | "contacts" | "schedule" | "agenda"
  | "hotels" | "transport" | "rooms" | "packlist" | "billing" | "warnings";
export function sectionForWarning(w: ParseWarning): SectionId | null;
export function deriveSectionStatuses(
  warnings: readonly ParseWarning[],
  renderedSections: ReadonlySet<SectionId>,
): { flagged: ReadonlySet<SectionId>; flaggedCount: number };
```

- [ ] **Step 1: failing tests.** Cover every §7 mapping row (one warning per `blockRef.kind`: `crew, travel, flights → crew`; `contacts, client → contacts`; `schedule, dates, strike, loadout → schedule`; `agenda → agenda`; `hotels, hotel_reservations → hotels`; `transportation → transport`; `rooms, gear_scope → rooms`; `pull_sheet, gear_packlist → packlist`; `venue → venue`; `details, event_details, dress → event`; `financials → billing`; `unknown_section` / missing blockRef / fabricated `"zzz_future"` → `null`). Then `deriveSectionStatuses`:
  - warn-severity mapped warning + rendered section → flagged contains that section only, count 1.
  - info-severity mapped warning → NOT flagged (§3.3).
  - agenda warn + `renderedSections` WITHOUT `agenda` → `flagged = {"warnings"}` (degrades to unmapped, then flags warnings — §7 no-false-clean).
  - warn-severity `unknown_section` → `flagged = {"warnings"}`, count 1.
  - warn mapped + warn unmapped → both the content section and `warnings` flagged (count 2; mapped does not double-flag warnings).
  - info-only unmapped → `flaggedCount = 0`.
  - empty warnings → empty set, 0.
  Build warnings via a local helper `warn(kind?: string, severity: "warn" | "info" = "warn")`; expectations reference the same kind constants (anti-tautology). Fixture file exports `buildParseResult()` / `stagedRow(pr)` mirroring `tests/components/step3SheetCard.test.tsx` shapes for later tasks.
- [ ] **Step 2:** `pnpm test tests/admin/step3SectionStatus.test.ts` → FAIL (module not found).
- [ ] **Step 3: implementation.**

```ts
// lib/admin/step3SectionStatus.ts
import type { ParseWarning } from "@/lib/parser/types";

const KIND_TO_SECTION: Record<string, Exclude<SectionId, "warnings">> = {
  crew: "crew", travel: "crew", flights: "crew",
  contacts: "contacts", client: "contacts",
  schedule: "schedule", dates: "schedule", strike: "schedule", loadout: "schedule",
  agenda: "agenda",
  hotels: "hotels", hotel_reservations: "hotels",
  transportation: "transport",
  rooms: "rooms", gear_scope: "rooms",
  pull_sheet: "packlist", gear_packlist: "packlist",
  venue: "venue",
  details: "event", event_details: "event", dress: "event",
  financials: "billing",
};

export function sectionForWarning(w: ParseWarning): SectionId | null {
  const kind = w.blockRef?.kind;
  if (!kind) return null;
  return KIND_TO_SECTION[kind] ?? null;
}

export function deriveSectionStatuses(
  warnings: readonly ParseWarning[],
  renderedSections: ReadonlySet<SectionId>,
): { flagged: ReadonlySet<SectionId>; flaggedCount: number } {
  const flagged = new Set<SectionId>();
  for (const w of warnings) {
    if (w.severity !== "warn") continue;
    const mapped = sectionForWarning(w);
    if (mapped !== null && renderedSections.has(mapped)) flagged.add(mapped);
    else flagged.add("warnings"); // unmapped or degraded → the always-rendered checks row (§7)
  }
  return { flagged, flaggedCount: flagged.size };
}
```
(Also export the `SectionId` type union above the map.)
- [ ] **Step 4:** `pnpm test tests/admin/step3SectionStatus.test.ts` → PASS.
- [ ] **Step 5:** `git add -A && git commit --no-verify -m "feat(admin): step-3 warning→section status mapping lib"`

### Task 2: publish-intent POST helper (spec §4)

**Files:** Create `lib/admin/publishIntent.ts`, `tests/admin/publishIntent.test.ts`.

**Interfaces (Produces):** `export async function postPublishIntent(wizardSessionId: string, driveFileId: string, next: boolean): Promise<boolean>`

- [ ] **Step 1: failing tests** (`vi.stubGlobal("fetch", …)` pattern from `tests/components/step3Checkbox.test.tsx:52-69`): (a) POSTs `/api/admin/onboarding/staged/W/D/approve` when `next=true`, `/unapprove` when false, method POST, returns true on 200 `{status:"approved"}`; (b) HTTP-200 `{ok:false}` → false (server refusal, `Step3Review.tsx:768-790` semantics); (c) `res.ok === false` → false; (d) fetch throws → false; (e) 200 with unparseable body → true.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implementation** — extract the body of `postApproval` (`Step3Review.tsx:768-790`) verbatim into the helper, parameterized; add header comment + `// not-subject-to-meta: internal Next API fetch, not a Supabase client call`.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `feat(admin): shared postPublishIntent helper with ok:false refusal semantics`.

### Task 3: step3ReviewSections — registry, warning-title hardening, moved bodies (spec §6.1, §8)

**Files:** Create `components/admin/wizard/step3ReviewSections.tsx`, `tests/components/admin/wizard/step3ReviewSections.test.tsx`; Modify `components/admin/wizard/Step3SheetCard.tsx` (remove moved bodies, import from the new module — card render output unchanged this task).

**Interfaces (Produces):**
```tsx
export type Step3SectionDef = {
  id: SectionId; label: string; group: string;
  Icon: LucideIcon;                       // per spec §6.1 table
  railCount: ((d: SectionData) => number) | null;
  render: (d: SectionData) => ReactNode;  // the restyled body
};
export const STEP3_SECTION_GROUPS: readonly string[]; // ["The show","People","Schedule","Logistics","Gear","Money","Checks"]
export function step3Sections(d: SectionData): Step3SectionDef[]; // agenda entry present iff d.agendaBaseline.length > 0 (§6.1)
export function reviewWarningTitle(w: ParseWarning): string;      // §8 hardening
export type SectionData = { pr: ParseResult; row: Step3Row; dfid: string; wizardSessionId: string;
  crewMembers: CrewMemberRow[]; rooms: RoomRow[]; hotels: HotelReservationRow[];
  pullSheet: PullSheetCase[]; ros: RunOfShow; warnings: ParseWarning[]; agendaBaseline: AdminAgendaItem[] };
```

- [ ] **Step 1: failing tests.**
  - `reviewWarningTitle` matrix (spec §8, 5 cases): cataloged code → catalog title (use a real cataloged code via `isMessageCode`); `{code:"OPENING_REEL_UNREADABLE", message:"OPENING_REEL_UNREADABLE"}` → generic fallback `"A parse issue was recorded for this sheet."`; message embedding the code mid-sentence → fallback; lowercase code as message → fallback; `"  OPENING_REEL_UNREADABLE  "` → fallback; human message w/ uncataloged code → passes through.
  - Registry: 12 defs when agenda baseline non-empty, 11 without; group order `The show, People, Schedule, Logistics, Gear, Money, Checks`; `railCount` non-null exactly for `crew, contacts, schedule, hotels, rooms, packlist, warnings` (§6.1 table); labels exact.
  - Bodies (jsdom render of `render(d)` per section from `buildParseResult()`): crew rows show `Avatar` (`data-testid="avatar"`), tel/mailto anchors present iff phone/email `hasContent`, anchors have `aria-label` `Call {name}` / `Email {name}` and class `size-tap-min`; empty-state copy preserved (render each body with emptied fixture: "No crew parsed." etc.); caps + overflow notes preserved (fixture with 31 crew → 30 rendered + "…and 1 more people"); warnings body renders both severities and the affirmative empty state `"No parse warnings for this sheet."` when empty (§3.10); raw code never appears in the rendered warnings panel (scoped `within(panel)` query).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implementation.** Move `BreakdownSection, ContactsBreakdown, VenueBreakdown, TransportBreakdown, OpsBreakdown, CrewBreakdown, ScheduleDayRow, ScheduleBreakdown, RoomsBreakdown, EventDetailsBreakdown, packItemLabel, PackListBreakdown, HotelsBreakdown, WarningsBreakdown` + cap constants + `FieldRowList/hasContent/contentRows/arr/overflowNote` from `Step3SheetCard.tsx` into the new file (exports where tests need them). **`AgendaBreakdown` moves too** — the entire agenda block (`AgendaBreakdown`, `AgendaItemRow`, `__resetAgendaThrottleForTests`, `acquireAgendaSlot` throttle machinery, `agendaSleep`, `parseRetryAfterMs`, `agendaOverflowNotes`, `agendaItemNote`, `AgendaState`, `AGENDA_CLIENT_*` caps, `Step3SheetCard.tsx:1073-1426`) relocates to `step3ReviewSections.tsx` so the card never imports agenda back from the registry module (no circular dependency; the card imports ONLY from the sections module). Update the two agenda test imports (`tests/components/admin/agendaBreakdown.test.tsx`, `agendaBreakdown.transitions.test.tsx` — both import `AgendaBreakdown`/`__resetAgendaThrottleForTests` from `Step3SheetCard`) to the new module path. Restyle per spec §8 table (field-list grid `grid-cols-[7.5rem_minmax(0,1fr)]`, crew avatar rows with the §8 anchor DOM — 44×44 `size-tap-min` anchor + nested `size-8` visual span, flush anchors; hotels/rooms/packlist chrome; schedule grid unchanged). `reviewWarningTitle`:

```tsx
export function reviewWarningTitle(w: ParseWarning): string {
  if (isMessageCode(w.code)) return messageFor(w.code).title;
  const msg = (w.message ?? "").trim();
  if (
    msg.length > 0 &&
    !msg.toLowerCase().includes(w.code.toLowerCase()) &&
    !/^[A-Z0-9_]{2,}$/.test(msg)
  ) return msg;
  return "A parse issue was recorded for this sheet.";
}
```
  `WarningsBreakdown` switches its title line to `reviewWarningTitle(w)` (keeping severity dot, `labelFromRawSnippet` line, `buildSheetDeepLink` "Open in Sheet ↗"). Registry table exactly per spec §6.1 (icons: MapPin, Sparkles, Users, Phone, CalendarDays, FileText, BedDouble, Truck, LayoutGrid, Package, Receipt, AlertTriangle). Update `Step3SheetCard.tsx` imports so the existing dialog children keep rendering (unchanged behavior until Task 8). Run existing suites: `pnpm test tests/components/step3SheetCard.test.tsx tests/components/step3SheetCard.bookends.test.tsx tests/components/step3SheetCard.transitions.test.tsx` — must stay green (restyle keeps `-breakdown-*` testids and copy).
- [ ] **Step 4:** run new + existing tests → PASS.
- [ ] **Step 5:** commit `feat(admin): step3 review section registry + hardened warning titles (bodies moved + restyled)`.

### Task 4: Step3ReviewModal shell + header + footer statics (spec §5, §9.1, §9.4, §15)

**Files:** Create `components/admin/wizard/Step3ReviewModal.tsx`, `tests/components/admin/wizard/Step3ReviewModal.test.tsx`; Modify `app/globals.css` (duplicate-then-rename hooks: add `[data-step3-review-scrim]` / `[data-step3-review-panel]` selectors alongside the existing `step3-details` ones — the old selectors are deleted in Task 8 with the old dialog).

**Interfaces (Produces):**
```tsx
export function Step3ReviewModal(props: {
  data: SectionData;              // from step3Sections
  checked: boolean;
  isDirtyRescan: boolean;
  onRequestSetChecked: (next: boolean) => Promise<boolean>;
  onClose: () => void;
}): ReactNode;
export const SCROLL_SPY_OFFSET_PX = 90;
export const DRAG_DISMISS_THRESHOLD_PX = 110;
export const DRAG_SLOP_PX = 6;
export function activeSectionFor(scrollTop: number, clientHeight: number, scrollHeight: number,
  sectionTops: ReadonlyArray<{ id: SectionId; top: number }>): SectionId; // §6.3a
```

- [ ] **Step 1: failing tests.** This suite REPLACES `tests/components/admin/wizard/Step3DetailsDialog.test.tsx` (deleted in Task 8); the complete retirement mapping — every old assertion must have its named replacement HERE, before the old file goes:
  | Retired assertion | Replacement in this suite |
  | --- | --- |
  | labelled modal dialog (label = show title) | "dialog accessible name is the plain title (linked)" + "(unlinked)" |
  | renders children in scrollable body | Task 5 section-panel tests (`-review-main` stub here) |
  | initial focus → close button | "initial focus lands on the close button" |
  | scrim pointer-only (tabIndex −1, not aria-hidden) | same assertion, `-review-backdrop` |
  | close button / scrim / Escape call onClose | same three assertions |
  | bottom-anchored mobile vs centered desktop | shell class assertions (`items-end sm:items-center`) + Task 10 real-browser |
  | CSS animation hooks on scrim/panel | `data-step3-review-scrim`/`-panel` attribute assertions |
  | body scroll lock + restore | same assertion |
  | (new, spec §15) focus TRAP cycle | "Tab from the last focusable wraps to the first (focus stays inside the panel)" |
  | (new, spec §15) restore-to-trigger | "focus a trigger button, mount, unmount → focus returns to the trigger" |

  Full list:
  - labelled modal dialog: `role="dialog"`, `aria-modal`, `aria-labelledby` → `<h2 data-testid …-review-title>` whose text is the PLAIN title (fixture title), even with a deep link (accessible name ≠ "Open the source sheet…"); with `buildSheetDeepLink` mocked null → no `-review-sheetlink`, name still the title (§9.1/§15 both-states).
  - `-review-sheetlink` when link resolvable: `<a target="_blank" rel="noopener noreferrer">` with `aria-label` `Open the source sheet for {title}` and class `size-tap-min`, OUTSIDE the h2.
  - header anatomy: eyebrow text `Review before publishing`; subline client entry omitted when `client_label` null; dates entry always present (`Dates not detected` on empty dates fixture) (§9.1 single rule).
  - overall chip `-review-chip`: fixture with computed `flaggedCount` N>1 → `"N need a look"`; N=1 fixture → `"1 needs a look"`; zero-warn fixture → `"All clean"` (compute N via `deriveSectionStatuses` in the test — anti-tautology).
  - initial focus on `-review-close`; focus-trap WRAP (jsdom caveat: `useDialogFocus` discovers focusables by `offsetParent`, which jsdom leaves null — stub it for this test: `Object.defineProperty(HTMLElement.prototype, "offsetParent", { get() { return this.parentElement; }, configurable: true })`, restore in `afterEach`; then focus the LAST focusable, dispatch Tab, assert `document.activeElement` === the FIRST focusable, and Shift+Tab on the first lands on the last — strict wrap, not merely "inside the panel"); the REAL-browser wrap re-check lives in Task 11's Tab audit; restore-to-trigger (render a `<button>` trigger, focus it, mount the modal, unmount → `document.activeElement` is the trigger again); Esc → `onClose`; scrim `-review-backdrop` `tabIndex=-1`, not `aria-hidden`, click → `onClose`; body scroll locked while open, restored on unmount.
  - `-review-title` element `tagName === "H2"` (heading contract §15; section `<h3>` levels pinned in Task 5).
  - footer `-review-footer`: note `-review-note` (`All clear to publish` / `{N} to review · publishing isn't blocked`); RescanSheetButton present (`Re-scan this sheet` label); publish button `-review-publish` labels `Publish this show` (unchecked) / `Selected to publish` (checked); `isDirtyRescan` → NO publish button, NO rescan button, review-required note + reapply link with `RescanReviewBanner`'s copy/target (mirror its href from `Step3SheetCard.tsx:1427-1449`).
  - publish click: `onRequestSetChecked` is called with EXACTLY `true` in BOTH the unchecked and the checked state (assert the mock's argument — spec §9.1: idempotent approve, never a toggle); resolves true → `onClose` called once; resolves false → modal stays (no `onClose`), footer error note `Couldn't update the publish selection. Try again.`; while pending → button `disabled` + `aria-busy` + label `Selecting…` (drive with a controllable deferred promise).
  - shell classes: panel has `max-h-[85vh] … sm:max-h-[80vh] sm:max-w-5xl` and `data-step3-review-panel`; scrim `bg-overlay-scrim` + `data-step3-review-scrim`; grab strip `-review-grab` exists with `min-h-tap-min` class and `aria-label "Drag down or tap to close"`; grab tap (click, no movement) → `onClose`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implementation.** Shell carried from `Step3DetailsDialog.tsx:78-143` (overlay/scrim/panel topology, `useDialogFocus`, Esc listener, scroll lock) with the spec §5 sizing classes; header per §9.1 (h2 + separate icon anchor via `buildSheetDeepLink(dfid)`); footer per §9.1/§9.2-consumer (`useState<"idle"|"pending"|"error">`); nav/content/scroll-spy/drag are stubbed placeholders this task (`<div data-testid …-review-main />` body) — Tasks 5–7 fill them. globals.css: extend the selector lists at `app/globals.css:591-613` to also match `[data-step3-review-scrim]` / `[data-step3-review-panel]` (comma-added selectors; same keyframes).
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `feat(admin): Step3ReviewModal shell, header, footer (a11y-safe title + result-bearing publish)`.

### Task 5: rail + chip rail + section panels (spec §6.2–6.4, §9.4)

**Files:** Modify `Step3ReviewModal.tsx`; extend `Step3ReviewModal.test.tsx`.

- [ ] **Step 1: failing tests.**
  - Two-pane body wrapper `-review-main` contains `-review-rail` (`<nav aria-label="Review sections">`, classes `hidden lg:flex w-60 shrink-0 overflow-y-auto`) AND `-review-chiprail` (classes `flex lg:hidden overflow-x-auto shrink-0`) — exact §9.4 mode classes asserted.
  - Rail items: one `-review-rail-item-<id>` per registry entry in group order with group eyebrow labels; each `min-h-tap-min`; rail count shown exactly for the §6.1 railCount sections (value from fixture lengths); status dot class `bg-status-review` on flagged (computed via mapping lib), `bg-status-positive` otherwise; warnings dot row-local rule: red iff any warn-severity warning exists (fixture with only-info → positive dot while count shows) (§6.2).
  - Chip items `-review-chip-item-<id>`: no counts, dot present, `min-h-tap-min`.
  - `aria-current="true"` present on the active item in BOTH navs (shared state); queries scoped `within(rail)` / `within(chiprail)` (§9.4).
  - No-duplicate-id sweep: render modal, collect `[id]` elements → all unique; no `id` attributes inside either nav (§9.4).
  - Content pane: one `-review-section-<id>` per registry entry, heading row (icon chip, label, existing count, "Needs a look" chip iff flagged), flagged panel `border-border-strong`, clean `border-border`; agenda section + rail entries absent when `agendaBaseline` empty; warnings section always present.
  - Heading levels (§15): every section heading element `tagName === "H3"` (query within each `-review-section-<id>`); the only `H2` in the modal is `-review-title`.
  - Rail/chip click calls scroll + sets active: assert `aria-current` moves to the clicked item (jsdom: `scrollTo` stubbed on the scroll container).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implementation** per spec §6.2 (item anatomy, active `bg-surface-sunken` + `w-1 rounded-r-pill bg-accent` indicator), §6.3 (chips), §6.4 (heading rows), §5.2 (panel chrome). `renderedSections` set derives from the registry output and feeds `deriveSectionStatuses` once per render (memo).
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `feat(admin): review modal rail + chip nav + section panels with status dots`.

### Task 6: scroll-spy (spec §6.3a)

**Files:** Modify `Step3ReviewModal.tsx`; extend tests.

- [ ] **Step 1: failing tests** for the pure rule `activeSectionFor` — fixture `sectionTops = [{id:"venue",top:0},{id:"crew",top:400},{id:"warnings",top:1200}]`, `clientHeight 600`, `scrollHeight 1800`: above-first (`scrollTop 0` when first top is 40 in a variant fixture) → first id; exactly at line (`scrollTop = 400 - 90`) → crew; between (`scrollTop 500`) → crew; tall-section span (`scrollTop 1100`, next top 1200 > 1100+90… pick values so venue→crew boundary is exercised); bottom clamp (`scrollTop = 1800-600` → last id even though its top > scrollTop+90 in the fixture). Derive every expectation by scanning the fixture array in the test itself (anti-tautology).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implementation** — pure function per §6.3a (last `top ≤ scrollTop+90`, first fallback, bottom clamp) + wiring: rAF-throttled passive scroll listener on the content pane; tops computed per pass via `getBoundingClientRect().top − scroller.getBoundingClientRect().top + scroller.scrollTop`; click override sets active immediately + `scrollTo({ top: sectionTop − 8 })` (no `behavior`; CSS `motion-safe:[scroll-behavior:smooth]` class on the scroller).
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `feat(admin): deterministic scroll-spy (pure rule + container-relative coords)`.

### Task 7: drag-to-dismiss + mode-boundary cleanup (spec §10, §11 C1–C6) + DESIGN.md note

**Files:** Modify `Step3ReviewModal.tsx`, `DESIGN.md`; extend tests.

- [ ] **Step 1: failing tests** (jsdom pointer events; capture stubs `setPointerCapture = vi.fn()`):
  - pointerdown+move dy=140+up on `-review-grab` → panel gets inline `translateY(100%)` transition state and `onClose` fires after the transitionend fallback timeout (use fake timers; the fallback timeout is `--duration-normal` = 220ms).
  - dy=60 release → transform cleared/reset to `""`, `onClose` NOT called, and the button's synthesized `click` after pointerup does NOT close (dispatch click after pointerup; `dragConsumedClick` suppression, `DRAG_SLOP_PX` boundary: dy=6 counts as tap → closes; dy=7 counts as drag → suppressed).
  - during drag: `transition === "none"` and `animation === "none"` (C1).
  - matchMedia cleanup: mock `matchMedia` (list of listeners); start drag, fire the `(min-width: 640px)` change with `matches:true` → inline transform/transition/animation cleared, drag ref reset (assert a subsequent pointermove is a no-op) (C6).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implementation** per spec §10 exactly (pointer handlers on the grab button; constants; `dragConsumedClick` ref cleared on next tick; one `matchMedia` listener registered on mount, removed on unmount). DESIGN.md: insert after line 246, before `## 6.`:

```markdown
### 5.5 Interaction constants

Behavioral gesture/scroll thresholds are JS module constants, not design tokens — they never paint a pixel. Current set (all in `components/admin/wizard/Step3ReviewModal.tsx`): `SCROLL_SPY_OFFSET_PX = 90` (scroll-spy activation line), `DRAG_DISMISS_THRESHOLD_PX = 110` (sheet drag release-to-dismiss), `DRAG_SLOP_PX = 6` (click-vs-drag discrimination). The §10 token contract's px ban targets rendered visual values; these are exempt but must be documented here when added or changed.
```
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `feat(admin): sheet drag-to-dismiss with slop discrimination and mode-boundary cleanup`.

### Task 8: settlement plumbing in Step3Review + card integration (spec §9.2, §9.3)

**Files:** Modify `Step3Review.tsx`, `Step3SheetCard.tsx`; Delete `Step3DetailsDialog.tsx` + `tests/components/admin/wizard/Step3DetailsDialog.test.tsx`; Modify `app/globals.css` (drop the old `step3-details` selector aliases + comment); Create `tests/components/admin/wizard/step3PublishSettlement.test.tsx`; update `tests/components/step3Checkbox.test.tsx` (pure-controlled contract) and any `step3SheetCard*.test.tsx` assertions that open the details dialog.

**Interfaces:**
- `Step3Review.tsx`: `toggleOne(driveFileId, next, serverApplied): Promise<boolean>` — pushes `{requestedValue: next, resolve}` into `waitersRef: Map<string, Array<{requestedValue: boolean; resolve: (ok: boolean) => void}>>`, then `setDesired` + `flush` as today; flush's settlement point (row leaves `sendingRef` with no newer desired intent, or overlay entry dropped without POST) computes `settledValue` and resolves EVERY waiter with `settledValue === requestedValue`, then clears the row's list (§9.2.1–3). Unmount cleanup effect resolves all waiters `false`; committed `useEffect` keyed on the reconciled rows resolves waiters for absent driveFileIds `false` (NEVER during render) (§9.2.6). `RowItem`/card prop type becomes `(next: boolean) => Promise<boolean>`.
- `Step3SheetCard.tsx`: `requestSetChecked(next): Promise<boolean>` — controlled: `onToggleChecked(next)`; uncontrolled: local optimistic state + `postPublishIntent` + revert (logic moved OUT of `PublishCheckbox.toggleSelf`); `PublishCheckbox` becomes pure-controlled (`checked` + `onToggle` required; `initialChecked`/internal POST removed); card renders `<span className="sr-only" role="status" aria-live="polite">` (FinalizeButton.tsx:411-413 pattern) announcing `Selected to publish` / `Couldn't update the publish selection.`; "More" mounts `<Step3ReviewModal …>` instead of `Step3DetailsDialog` (breakdown-grid/columns markup deleted; `AgendaBreakdown` now rendered by the registry's agenda section).

- [ ] **Step 1: failing tests** (`step3PublishSettlement.test.tsx`, jsdom, render `Step3Review` with 2-row fixture, fetch mocked):
  (a) single true → resolves true on 200; false on `{ok:false}` (and overlay reverts);
  (b) two overlapping true (fire both before letting fetch settle via deferred mock) → both resolve, same outcome;
  (c) true then false before settlement → true-waiter false, false-waiter true; final POST unapprove;
  (d) false then true → mirror;
  (e) unmount `Step3Review` with pending waiter → resolves false, no act warnings;
  (f) refresh-removes-row: rerender with rows missing the dfid → pending waiter resolves false via the committed effect;
  (g) idempotent no-op: row already `applied`, request `true` → `flush` sends NO POST (fetch mock not called) and the waiter still resolves `true` (settlement point "overlay entry dropped without a POST", §9.2.2 — this is the path the modal's already-checked publish button exercises).
  Plus card-level: modal publish success closes modal + live region announces; refusal keeps modal open + error note; checkbox click still fire-and-forget (no pending UI on the box).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implementation** as specified above. Update `step3Checkbox.test.tsx` to the controlled contract (optimistic/revert moves to the card: test via `Step3SheetCard` uncontrolled mount). Update existing card tests that referenced `-details-dialog` testids → `-review-modal` equivalents (grep `details-dialog|details-backdrop|details-close|breakdown-grid` across `tests/`). Delete the dialog + its test; drop old CSS aliases.
- [ ] **Step 4:** `pnpm test` (FULL unit suite) → PASS.
- [ ] **Step 5:** commit `feat(admin): result-bearing publish settlement + review modal wired into the card (Step3DetailsDialog retired)`.

### Task 9: transition audit test (spec §11)

**Files:** Create `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx`.

- [ ] **Step 1: failing test list** — enumerate every conditional render / animation hook in `Step3ReviewModal.tsx` and pin the FULL §11 table (all rows, none omitted): T1 entrance classes (`data-step3-review-panel`/`-scrim` attributes present — CSS keyframes own the animation); T2 close = instant unmount (no exit classes remain in DOM after close); T3–T5 drag states (covered in Task 7 — re-assert transition values here from the table); T6 nav active transition class `transition-colors duration-fast` on items; T7/T7b instant label swaps (no animation classes on the publish button); T8 re-scan pending swap instant (RescanSheetButton label + `aria-busy` change with no animation class — assert on the rendered footer); T9 pack-list chevron rotate class; T10 props change while open = instant re-render (rerender the mounted modal with an added warning → new row present immediately, no animation class on the warnings panel); C7 checked flips via the card while open (rerender with `checked=true` → footer label reads `Selected to publish` immediately, no animation class); declared-instant items carry a `// §11: instant — deliberate` comment (test greps the component source for the marker on each ternary/`&&` conditional that renders/unrenders an element — walk the file, assert every `{… ? … : null}` line either has the marker or an animation class).
- [ ] **Step 2–4:** run FAIL → add the source markers/classes → PASS.
- [ ] **Step 5:** commit `test(admin): transition audit for the review modal (§11 inventory)`.

### Task 10: real-browser layout spec (spec §5.1, §15, §16)

**Files:** Create `tests/e2e/step3-review-modal.layout.spec.ts`; Modify `tests/e2e/standalone.config.ts` (add spec to members).

Mechanism: render the REAL component to static markup inside the spec (`renderToStaticMarkup(<Step3ReviewModal …fixture…/>)` — precedent `tests/e2e/no-raw-codes.spec.ts:35-43`), inject into a full HTML page, compile CSS with the `step3-card-dimensions.spec.ts:114-127` harness (`@source` + `pnpm dlx @tailwindcss/cli@4.2.4`), serve via `node:http`, measure with `getBoundingClientRect`. **Router context (both e2e tasks):** the modal renders `RescanSheetButton`, which calls `useRouter()` — outside App Router that throws. Wrap the fixture in `next`'s app-router context with a stub: `import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime"` (exports `React.Context<AppRouterInstance | null>`, verified `app-router-context.shared-runtime.d.ts:54`) and render `<AppRouterContext.Provider value={stubRouter}>` where `stubRouter = { refresh(){}, push(){}, replace(){}, back(){}, forward(){}, prefetch(){}, hmrRefresh(){} } as unknown as AppRouterInstance`. The same wrapper module is shared by the Task 11 esbuild entry.

- [ ] **Step 1: write the spec (fails until measured contracts hold)** at viewports 390 / 800 / 1280 asserting the §5.1 invariants VERBATIM (the exact list, ±0.5px):
  1. `header.height + main.height + footer.height (+ grab.height at 390) === panel.height`; `panel.height ≤ 0.85 × viewport.height` (0.80 at 800/1280).
  2. (1280) `rail.height === main.height`; `content.height === main.height`; `rail.width === 240`; `rail.width + content.width === main.width`.
  3. (390/800) `chipRail.scrollHeight === chipRail.clientHeight`; `chipRail.width === main.width`.
  4. (390) `panel.width === viewport.width`.
  5. every `-review-section-<id>`: `section.getBoundingClientRect().width === content.clientWidth − parseFloat(cs.paddingLeft) − parseFloat(cs.paddingRight)` via `getComputedStyle(content)`.
  Plus: tap-target audit (`height ≥ 44` for grab, each visible chip, each visible rail item, footer buttons; `width ≥ 44 && height ≥ 44` on one crew tel anchor); exactly one nav visible per viewport (offsetParent/`getClientRects().length` check on rail vs chiprail); exactly one VISIBLE `[aria-current]`; header long-content case (long unbroken title fixture: close + chip visible, `panel.scrollWidth === panel.clientWidth`); sheet footer computed `paddingBottom ≥` the base token AND the stylesheet text contains `safe-area-inset-bottom` (§9.1).
- [ ] **Step 2:** `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/step3-review-modal.layout.spec.ts` → fix layout until PASS (expected first-run failures: missing `items-stretch`/`min-h-0` — DESIGN.md §7 class).
- [ ] **Step 3:** commit `test(admin): real-browser layout invariants for the review modal`.

### Task 11: real-browser interaction spec (drag, scroll-spy, Tab audit)

**Files:** Create `tests/e2e/step3-review-modal.interactions.spec.ts`; Modify `tests/e2e/standalone.config.ts`.

Mechanism: bundle a live entry (`createRoot(document.getElementById("root")).render(<Fixture/>)`) with `pnpm dlx esbuild@0.28.0 --bundle --format=iife --jsx=automatic --loader:.tsx=tsx --define:process.env.NODE_ENV='"production"'` (version pinned like the tailwind dlx; entry file written to the spec's temp dir importing the real `Step3ReviewModal` + fixture), same tailwind-CLI CSS + `node:http` serving.

- [ ] **Step 1: write the spec:** at 390: drag 140px → modal removed from DOM; drag 60px → stays open, unshifted, and no close from the synthesized click; drag started then viewport resized to 800 mid-drag → panel has no inline transform and close button works (C6). At 1280: `scrollTo` content to each section top → correct rail item `aria-current` (including bottom clamp on the last section); rail click on a far section → that section's container-relative top lands within 90px of the scroller top (§6.3a coordinate proof; content pane has nonzero padding by construction). Tab audit at 390 and 1280: tab from the close button through the modal — focus never lands inside the hidden nav (assert every focused element is visible) AND the cycle wraps (after visiting every focusable, the next Tab returns to the first — real-browser confirmation of the Task 4 jsdom wrap test).
- [ ] **Step 2:** run standalone config → iterate to PASS.
- [ ] **Step 3:** commit `test(admin): live-browser drag, scroll-spy, and nav-visibility interactions`.

### Task 12: full-suite regression + invariant-8 dual gate

- [ ] **Step 1:** `pnpm test` (full), `pnpm typecheck` (or `tsc --noEmit` per package.json), `pnpm lint`, plus both standalone e2e specs → all green (fix fallout; commit fixes as `fix(admin): …`).
- [ ] **Step 2:** `/impeccable critique` AND `/impeccable audit` on the affected diff (UI invariant 8; canonical v3 preflight gates). HIGH/CRITICAL findings fixed or DEFERRED.md-logged BEFORE cross-model review. Commit dispositions.
- [ ] **Step 3:** commit any gate fixes; record findings + dispositions in the plan dir (`impeccable.md`).

### Task 13: close-out (pipeline Stage 4)

- [ ] Whole-diff Codex adversarial review (fresh-eyes, REVIEWER ONLY) → iterate to APPROVE; class-sweep every finding.
- [ ] Push branch; open PR (merge commit convention); real CI green (check `mergeStateStatus == CLEAN`, pass PR number to `gh pr checks --watch`); `gh pr merge --merge`; fast-forward local main; verify `git rev-list --left-right --count main...origin/main` = `0 0`.

## Self-review notes (run before adversarial review)

- Spec coverage sweep: §5 (T4/T10), §6.1 (T3/T5), §6.2–6.4 (T5), §6.3a (T6/T11), §7 (T1/T5), §8 (T3), §9.1 (T4/T10), §9.2 (T2/T8), §9.3 (T8), §9.4 (T5/T10/T11), §10 (T7/T11), §11 (T7/T9), §12 (fixtures across T1/T3/T4), §13 (T3), §15 (T4/T5/T10), §16 (T10/T11), §17–19 (declarations; no tasks needed).
- Layout-dimensions task present (T10, real browser, exact invariant list). Transition-audit task present (T9, exact §11 table). Anti-tautology encoded per task.
