# Crew warning under-row polish — close-out

Branch `feat/crewwarn-underrow-polish` · spec `docs/superpowers/specs/2026-07-23-crewwarn-underrow-polish-design.md` (Codex APPROVE R5) · plan `docs/superpowers/plans/2026-07-23-crewwarn-underrow-polish.md` (Codex APPROVE R3). This is the single-PR equivalent of a milestone handoff; §12 is the invariant-8 findings ledger.

## §1 Shipped scope

1. **CREWWARN-UNDERROW-INDENT-1 (P1):** 24px half-indent (`pl-6`) per-node wrapper in `renderCrewUnderRowCards`; attention banners keep ratified full width (per-kind layout). Hop-by-hop real-browser width assertions for both stack subtrees (T-WARN-INDENT, T-WARN-CAP at 1280 + 390).
2. **CREWWARN-UNDERROW-COPY-CONDENSE-1 (P2):** `condensed` variant on `PerShowActionableWarnings` — catalog guidance joins the `?` popover BODY via `condensedPopoverSlots` (described set stays a superset of full mode in every slot row); instance autocorrect lines stay inline; no catalog/§12.4 edits; group/ignored/staged surfaces byte-unchanged.
3. **CREWWARN-CAP-FIXTURE-1 (P3):** `crewWarningsCapped` harness page (crew-keyed banner + 3 same-member warnings → banner + 1 indented card visible, "2 more" hidden) + layout assertions incl. native-details open state; visually inspected in both themes during the dual-gate.

Suites: unit 12/12 condensed + 7/7 indent/membership; layout spec 27/27 (standalone config); full local suite 16830 passed; typecheck/lint/format clean.

## §12 Impeccable dual-gate — findings + dispositions

Critique (dual-agent, 2026-07-23): **28/40 (Good)**, NOT slop, components detector-clean. Snapshot: `.impeccable/critique/2026-07-24T02-11-26Z__components-admin-showpage-crew-warning-underrow.md`. Audit (diff-scoped): **20/20**, zero P0-P3 findings.

| # | Finding (severity) | Disposition |
|---|---|---|
| 1 | Identical condensed titles for same-code instances; Report/Ignore fire on an indistinguishable target (P1) | **Deferred** → `DEFERRED.md` `CREWWARN-INSTANCE-DISCRIMINATOR-1`. Pre-existing grain (full-mode cards carry the same catalog title + generic guidance; row label is UNKNOWN_FIELD-only); needs its own copy/identity spec. |
| 2 | Guidance behind "?" reduces venue-floor glanceability (P2) | **Ratified decision** — Choice 2 (condensed), owner selection 2026-07-23 against the phone-width mockup; described-superset a11y preserved by construction. Not relitigated. |
| 3 | "?" trigger is 22px, half the tap floor (P2) | **Refuted** — trigger is `size-5` visual + `before:-inset-3` pseudo → 44px hit area (`components/admin/HoverHelp.tsx:542`); audit independently confirmed. |
| 4 | Under-row banner reads member-scoped / amber merge (P2) | **Refuted in part** — under-row banners ARE member-scoped by construction (`bucketAttention` byCrewKey, `lib/admin/sectionAttention.ts:122-126`); the harness's generic fake-alert title misled the reviewer. Banner full width is ratified published-show-alerts §5.4. |
| 5 | Banner consumes a cap slot (P3) | **Ratified** — spec §4 documents the merged-list cap (`nodes.slice(0,2)` over banners-first merge); measured deliberately by T-WARN-CAP. |
| 6 | Code comment claimed "name column" for the 24px indent (minor) | **Fixed in-branch** — comment corrected to "24px half-indent (ratified over the 52px name-column indent)". |

Recorded refutations from the review train (so future reviewers do not re-derive):

- Plan-R1 F5 sub-point "sibling Report modal compound untested": spec §5 declares that compound unaffected (native disclosure, no animation tree); no assertion exists by design.
- Detector page-level hits (flat-type-hierarchy, em-dash-overuse on all four pre-rendered harness pages): whole-page aggregates over full app chrome, not the diff surface; the cited 1.5:1 type ratio exceeds the rule's own 1.25 threshold. False positives.

Context notes (no action this PR): condensed intentionally demotes catalog guidance from inline warning-text (8.8:1) to popover text-subtle (6.8:1) — both AA+; the pre-existing "Ignored (N)" summary (`components/admin/showpage/sectionWarningExtras.tsx`, unchanged) lacks `min-h-tap-min` — flag if a later pass touches that surface.

## Deferral bookkeeping

Three CREWWARN entries graduated to `DEFERRED-archive.md` ("Crew warning under-row polish (2026-07-23)"); `CREWWARN-INCARD-MOBILE-EYEBROW-1` stays parked on its own trigger; `CREWWARN-INSTANCE-DISCRIMINATOR-1` newly recorded.
