# Admin Field Overrides — Impeccable v3 dual-gate report (§12)

**Invariant 8 UI-evaluation gate** for the P6 UI diff (Tasks 13–16): the shared
`<OverrideableField>` widget, both edit surfaces (Surface A wizard widgets in
`step3ReviewSections.tsx`; Surface B `ShowOverrideBlocks.tsx` on
`app/admin/show/[slug]/page.tsx`), and the crew visibility-alias sections.

Run: `/impeccable critique` + `/impeccable audit`, both against the canonical v3
preflight (PRODUCT.md / DESIGN.md / register=product). Two **independent,
isolated** assessments per command (design-director LLM review + deterministic
detector for critique; a code-level technical scan for audit). External
attestation (subagent-run, not self-attested) per the dual-gate contract.

## Gate verdict

| Gate | Score | Detector | CRITICAL/P0 |
|---|---|---|---|
| critique | 25/40 (competent, needs-work — dragged by the two P1s below, both now dispositioned) | `[]` (0 new findings) | 0 |
| audit | 18/20 (strong) | — | 0 |

Deterministic detector: the single hit (`<img>` at `step3ReviewSections.tsx:3109`)
is a **false positive for this diff** — it belongs to prior commit `b0d347e7a`
(diagrams thumbnail grid, a documented raw-`<img>` revert mirroring
`components/diagrams/Gallery.tsx`), NOT in `origin/main...HEAD`. Zero new tells.

Contrast (computed from `app/globals.css` tokens): chip `text-text-subtle` on
`bg-info-bg` = 5.65:1 light / 5.88:1 dark; error `text-warning-text` = ~9.4:1 /
13.0:1. All pairs clear WCAG AA. No contrast finding.

Invariant-5 check (no raw error code in DOM): `errorCopyFor`
(`OverrideableField.tsx`) routes cataloged codes via `getDougFacing`, the three
uncataloged RPC status codes via a local `OVERRIDE_RPC_COPY` table, else
`GENERIC_ERROR`. No path renders a raw `OVERRIDE_*` / `FIELD_OVERRIDE_*` string.
PASS.

## FIXED in-branch (this commit)

- **[critique P1 / audit P3] Sheet value was hover-only.** `OverrideChip`
  buried `sheet says "X"` in a `title=` attribute — unreachable by keyboard and
  touch (Doug's primary device is a phone; PRODUCT.md bans hover-only
  affordances; spec §8.5 specifies a **visible** "sheet says «X»"). Fixed: a
  visible muted `Sheet: "X"` line (`override-sheet-value-<domain>-<field>`) for
  scalar-valued fields (crew name/role, hotel name/address — the meaningful text
  comparisons), plus a chip `aria-label` carrying the same for screen readers
  (title is not reliably announced; the `title` attribute is gone). Object-valued
  fields (show dates/venue) have no clean one-liner, so the chip `aria-label` +
  the already-visible override value cell convey the state. Null sheet value →
  visible "Sheet has no value".
- **[audit P2] Error live region was polite.** `role="status"`
  (`aria-live="polite"`) queued a save-failure behind other SR speech. Changed to
  `role="alert"` (assertive) — a failed action should interrupt.
- **[critique P2 / audit P2] Em dashes in rendered copy.** Impeccable absolute
  ban + PRODUCT.md copy rule. Removed from all 5 rendered strings: the two
  `OVERRIDE_RPC_COPY` stale-review messages, the chip no-value text (now aria),
  the stale "Override paused" note, and the wizard `OVERRIDE_UNAVAILABLE_HINT`.
  (The `—` no-data glyph placeholder in the value cell is a glyph, not prose —
  retained.)

Tests updated in lockstep (copy + role + the new visible sheet line):
`OverrideableField.test.tsx`, `OverrideableField.transitions.test.tsx`. All
`tests/components/overrides/` green (14); Task-16 real-browser layout spec still
green (the new sheet line sits below the measured value/chip row).

## Deferred / accepted

See `DEFERRED.md` → "Admin field overrides — impeccable gate (2026-07-09)":
OVR-1 destructive-confirm (P1→deferred), OVR-2 post-save confirmation
(P2→deferred), OVR-3 nested card in ShowOverrideBlocks (P3→deferred), OVR-4
repoint-input aria jargon (P3→deferred). None is CRITICAL/P0; each carries a
concrete un-defer trigger.

## Clean dimensions (no action)

Performance 4/4 (all state changes are plain conditional renders; no
framer-motion/AnimatePresence anywhere; only `transition-colors` on hover — the
spec's all-instant contract holds). Theming 4/4 (every token real + dual-mode;
zero hex; no `#fff`/`#000`). Responsive 4/4 (buttons + input carry
`min-h-tap-min` = 44px; `min-w-0 wrap-break-word` + `flex-wrap shrink-0`; no
fixed widths). Cognitive load: max 2 visible options per decision point (all ≤4);
progressive disclosure present (Edit reveals the input).
