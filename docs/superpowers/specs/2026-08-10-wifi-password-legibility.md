# Wi-Fi password transcription affordance + trailing-prose row closure

**Date:** 2026-08-10 · **Branch:** `feat/wifi-password-legibility` · **Closes:** `BL-VENUE-WIFI-PASSWORD-TRANSCRIPTION-LEGIBILITY` (ships the affordance), `BL-WIFI-FLATTENED-TRAILING-PROSE` (closes as documented limit on probe evidence)
**Class:** UX/a11y (UI surface, invariant 8 applies) · **Effort:** S

## 1.1 Resolved scope — do not relitigate

- **The affordance decision is ratified by the user, 2026-08-10 (decision round, mockup artifact): disambiguated type PLUS tap-to-copy.** Between "type treatment only" and "type + copy control," the user chose the larger option. Do not propose dropping the copy control to shrink the diff.
- **The type treatment is `.code-value`, not a monospace face.** `app/globals.css:740` is the product's canonical transcription-disambiguation class (Inter with `ss04` + `tnum` + `zero` — I/l/1 disambiguated, slashed zero), with its rationale and pixel-oracle history documented in the class comment and `DESIGN.md:187`. `components/crew/primitives/KeyValueRows.tsx:120` already ships the per-row `code === true → "code-value"` flag pattern this spec mirrors. Introducing an actual `ui-monospace` family would bypass the design system's established answer; do not.
- **`BL-WIFI-FLATTENED-TRAILING-PROSE` closes with NO parser change.** Its own filing states that if the probe finds no instances, the row "closes as a permanent documented limit" (the crew-field-enrichment spec §6.7 already carries the limit text). The probe (§3) found none. Any recognizer/cap proposal for trailing prose is out of scope — the filing itself rejects calibrating on zero instances, and the probe found a THIRD genuine multi-token SSID making any word-count cap a misparse engine.
- **Scope is the `venue-wifi-password` row only.** The SSID row (`venue-wifi-network`) stays untouched: an SSID is picked from the phone's visible network list, not transcribed character-by-character, so the transcription rationale does not extend to it. Other FactRows consumers opt in only when their own arc argues it.
- **Impeccable dual gate owed** (crew UI surface under invariant 8).

## 2. Problem

The Wi-Fi split renders `event_details.internet` passwords as their own fact row: `components/crew/sections/VenueSection.tsx:262` pushes `{ k: "Wi-Fi password", v: wifi.password, testId: "venue-wifi-password" }` into `FactRows`, whose value span renders `text-sm font-semibold text-text` proportional type (`components/crew/primitives/FactRows.tsx:86`). A password is transcribed by hand into a phone's Wi-Fi dialog, often in a dim ballroom mid-task; proportional Inter does not disambiguate `O`/`0`, `l`/`1`/`I`, `rn`/`m`. Two live-show passwords reach this row today (probed 2026-08-09, backlog filing): `FITS2025` and `ORDTG.` — the latter's trailing period is part of the password (`lib/crew/wifiDisplay.ts:39` documents why it is preserved) and is indistinguishable from a sentence end in proportional type.

## 3. Corpus probe — trailing-prose row is closed, not fixed (2026-08-10)

The full corpus sweep the `BL-WIFI-FLATTENED-TRAILING-PROSE` filing asked for was run against the shipped `lib/crew/wifiDisplay.ts` parser: 23 fixture files → 12 `event_details.internet` cells (8 distinct values), plus the validation-project DB (7 rows — the synced values of the live sheets) and the local seeded stack (12 shows, 5 with internet). Every DB value is a subset of the 8 fixture shapes. Results:

- **trailing-prose-after-credential: 0 instances** (the class the row exists for)
- **credential-with-no-accepted-syntax: 0 instances** (the folded class)
- multi-token-value-then-label: 1 instance — `Wifi for Polling Network: Institutional Investor Passcode: Investor2025` → parses CORRECTLY (`ssid: "Institutional Investor"`, `password: "Investor2025"`, `notes: "Wifi for Polling"`); it is the benign §6.8 shape, not the misparse shape
- prose-before-labels → notes: 3 (correct); prose-only raw fallback: 4 (no secrets present); clean pair: 1

A third genuine multi-token SSID was found in the non-harvested corpus (`Network: Four Seasons Meeting`), so any word-count or position cap would now misparse **two observed families** rather than one — strengthening the filing's own do-not-fix reasoning. Residual gap: the live Google Sheets were not read directly this round; their synced DB values were. **Disposition: the entry graduates to the archive as a permanent documented limit** (the crew-field-enrichment spec §6.7/§6.8 already carry the limit text); the archive entry records this probe.

## 4. Design

### 4.1 `FactRows` API (mirrors the existing `KeyValueRows` flag pattern)

`FactRow` (`components/crew/primitives/FactRows.tsx:42` region) gains two optional flags:

- `code?: boolean` — value span additionally carries `code-value` (the class is self-contained per its own comment: it binds the family, so it works on the span as-is).
- `copyLabel?: string` — when present AND non-empty, the row renders a copy control after the value; the string is the accessible name material (e.g. `"Copy the Wi-Fi password"`). Absent/empty → no control, no layout change. This is the whole lifecycle of both flags: set at exactly one site today (§4.3), read in `FactRows`, no storage.

Guard conditions: `v` empty/whitespace → the push site already omits the row (`wifiDisplay` returns `null` rather than half pairs, `lib/crew/wifiDisplay.ts:42`); `copyLabel` set while `v` is empty cannot occur at the only call site, and `FactRows` renders no control when `v` is empty regardless. `code` on a non-string node: flags apply only to string `v` rows; the type stays `string` for `v` at this site.

### 4.2 Copy control

- `<button type="button">` after the value span inside the `<dd>`; visual: the repo's standard copy glyph pair (copy → check, swap on success) at `size-3.5`, inside a visible `size-7` rounded tile matching the `dt` icon tile treatment (`FactRows.tsx:76`); the **hit target reaches 44×44 via padding + negative margin** (`-m-*` cancellation), the step3-a11y recipe — the painted box stays small, the row's visual rhythm is untouched.
- Behavior clones `app/admin/show/[slug]/ShareLinkCopyButton.tsx:95` (the ratified clipboard pattern): `try { await navigator.clipboard.writeText(v) }`, copied state with a 2 s reset timeout, silent catch — on clipboard unavailability the password is still on screen for manual transcription, which is exactly the §4.1 type treatment's job. No stale-value race exists here (the value is render-constant), so the requested-vs-current guard is not carried over.
- **Announcement:** success announces "Copied." through the shared announce implementation (`components/admin/announceLog.tsx` — `useAnnounceLog` + `AnnounceLogRegion`, `DESIGN.md:502`); `role="status"` shape (the text cannot legitimately recur back-to-back within the 2 s window, and repeat copies re-announce after the state reset). No announcement on failure (nothing changed; the value remains visible).
- `aria-label` = `copyLabel`; when copied, the accessible name is unchanged (state is conveyed by the announcement, not a label swap).

### 4.3 Call site

`components/crew/sections/VenueSection.tsx:262` becomes `{ k: "Wi-Fi password", v: wifi.password, testId: "venue-wifi-password", code: true, copyLabel: "Copy the Wi-Fi password" }`. No other row changes.

## Dimensional Invariants

- The copy control's hit target is ≥44×44 (`--spacing-tap-min`, `app/globals.css:179`) via padding/negative-margin cancellation; its painted tile is `size-7` — asserted with a real-browser `getBoundingClientRect()` check, not jsdom.
- The row (`FactRows.tsx:63`, `flex items-center justify-between … py-3`) must not grow taller when the control is present: the `-m-*` cancellation keeps the control's margin box at the painted size. Real-browser assertion: row height with the control === row height of a sibling row without it, within 0.5px.
- The value span keeps `min-w-0 wrap-break-word` (`FactRows.tsx:86`); with the control present the `<dd>` remains a flex row whose value span may shrink — long passwords wrap rather than pushing the control out of the row (assert control stays within the row box at 390px with a 40-char password).

## Transition Inventory

States: idle, copied (2 s), back to idle. Pairs: idle→copied — instant glyph swap (copy→check), no animation (matches ShareLinkCopyButton); copied→idle — instant swap back on timeout. Compound: re-tap while copied — timeout resets (clearReset pattern), state stays copied, a fresh "Copied." announcement appends/re-announces per the `role="status"` swap semantics. No other visual states; no animation anywhere (`prefers-reduced-motion` moot).

## 6. Verification

- **Unit/component (red first):** FactRows renders `code-value` on the value span when `code: true` and not otherwise; renders the copy control only when `copyLabel` is non-empty; clipboard success path sets copied state + emits the announcement (sink-spy on the announce hook); clipboard rejection leaves state idle and announces nothing. Anti-tautology: assert against the value span's own class list scoped by `data-testid="venue-wifi-password"`, not a container innerHTML match; derive the copied-state assertion from a mocked `navigator.clipboard` promise, both resolve and reject branches.
- **Real-browser (Playwright):** the three Dimensional Invariants above at 390px, mobile-safari.
- **Existing suites:** `VenueSection` render tests extend for the new row fields; no other consumer of `FactRows` changes output (assert a control-free consumer renders byte-identical DOM).
- **Impeccable critique + audit** on the diff (invariant 8).

## 7. Documented limits

- Trailing-prose-after-credential and no-accepted-syntax credential prose: permanently documented limits per §3's zero-instance probe; text renders in full under an imperfect row label, never dropped (crew-field-enrichment spec §6.7/§6.8).
- Clipboard-API absence (non-HTTPS dev, lockdown browsers): the control silently no-ops; the disambiguated type remains the affordance. Same accepted posture as `ShareLinkCopyButton.tsx:110`.
- `ORDTG.`'s trailing period remains visually ambiguous at a glance; `.code-value` reduces but cannot eliminate it (a period is a period). The copy control is the complete answer for that case.

## 8. Acceptance criteria

- **AC-1:** `venue-wifi-password` value renders with `code-value`; SSID row unchanged.
- **AC-2:** Copy control present on exactly that row, 44×44 target, row height unchanged, copies the exact password bytes (including trailing punctuation), announces "Copied." via the shared region.
- **AC-3:** Clipboard-unavailable path: no crash, no state change, value still selectable.
- **AC-4:** `BL-VENUE-WIFI-PASSWORD-TRANSCRIPTION-LEGIBILITY` and `BL-WIFI-FLATTENED-TRAILING-PROSE` graduate (the latter with the §3 probe recorded in its archive entry); IN PROGRESS markers off in the PR's last commit (invariant 12).
- **AC-5:** Impeccable dual gate passes on the diff.

impeccable-gate: pending — critique + audit due at implementation close-out (UI surface: components/crew/**, FactRows + VenueSection)
