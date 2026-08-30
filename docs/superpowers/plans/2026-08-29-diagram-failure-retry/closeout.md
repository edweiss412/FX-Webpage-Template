# Close-out — diagram failure retry

## 12. Invariant-8 UI quality gate

Both halves ran on `components/diagrams/Gallery.tsx` and
`components/diagrams/GalleryLightbox.tsx`, each with the canonical v3 setup gates
(`context.mjs` load of PRODUCT.md + DESIGN.md, then the product-register reference — this is app
UI serving the product, not a marketing surface).

`/impeccable critique` and `/impeccable audit` were both run. Neither degraded: each ran its
assessments as isolated sub-agents rather than inline, which the critique reference makes a hard
invariant.

impeccable-gate: critique=RAN audit=RAN p0=4 p1=4 dispositions=recorded

### What the gate caught that the suite did not

All four P0s were mine, and none would have surfaced from my own testing: the last full-suite run
predated all nine feature tasks, so three repo-wide guards had never seen the new controls.

| # | finding | disposition |
|---|---|---|
| P0 | `_metaSubtleOnInteractive` red — all three new controls rested at `text-text-subtle`, which DESIGN.md §1.1a forbids for an action target | FIXED. The colour, not a registry row: the carve-out families are owner-ratified, not extendable here. Gallery retry now `text-accent-on-bg`, matching the lightbox's; in-flight overlays rest at `text-text` |
| P0 | `_metaTapTargetFloor` red — line-keyed census rows pointing at `setFailedKeys((prev) => {` and a bare `}` | FIXED. Re-keyed 354→530 and 622→715 after checking each moved element still matches its row's reason |
| P0 | `controlOutlineScan` red — same class, reset chip row stale by ~95 lines | FIXED. Re-keyed 728→821. Third line-keyed registry to drift on this arc |
| P0 | `focusRetryTargetRef` written on both lightbox transitions and **read by nothing** — focus fell to `<body>` outside a still-trapping `aria-modal` dialog | FIXED. Readers wired on both transitions, and the fix exposed a second defect it had been masking (below) |
| P1 | Gallery and lightbox offered the same action in two visual languages, grey vs accent | FIXED by the §1.1a repair above. Two isolated assessments converged on this independently |
| P1 | In-flight overlay's `bg-surface-sunken/80` composited its label against arbitrary diagram content — measured worst case 3.80:1, under the 4.5:1 floor | FIXED. Opaque, so the ratio is a property of the tokens rather than the image |
| P1 | Phantom tab stop: the image button stayed a tab stop beneath the opaque overlay, still opening the lightbox for the failing diagram | FIXED with `tabIndex={-1}`. NOT `aria-hidden` — that also hides the nested `<Image>` from the accessibility tree, collateral the defect does not call for, and five tests caught it |
| P1 | `Retrying…` stranded after "Show fewer" — the sweep keyed on `items`, but collapsing unmounts a cell without removing its item | FIXED. `retrying` is now swept against RENDERED ids while `failedKeys` stays keyed on the item: a request belongs to a mounted element, a failure belongs to the diagram |
| P2 | No deadline on a hung retry | DEFERRED — `DIAGRETRY-NO-RETRY-DEADLINE-1` in `DEFERRED.md`, class-sweep exception (a). Every repair needs a number nobody has chosen, and a wrong deadline kills a slow-but-working 50 MB fetch, which is the failure §3.1 was ratified to allow |
| P3 | Duplicated comment paragraph; a predicate comment overstating what it gates | FIXED, both as comments. No new code: a second gate nothing could observe is the shape this arc has removed three times |

### Refuted, recorded so a later reviewer does not re-derive it

**"A retry resolving for a swiped-away slide announces for an off-screen diagram."** It does not.
The announcing handler is the ACTIVE branch's (`GalleryLightbox.tsx:1171`); a swiped-away slide
renders through the inactive branch (`:1373`), which only adds to `failedKeys` and never calls
`onAnnounce`. Verified with a case whose premise asserts the abandoned image IS still mounted, so
the result is a refutation rather than a vacuous pass. The case ships as a guard against someone
later wiring announcements into the inactive branch.

### The pattern worth carrying forward

Three times on this arc a mechanism read as load-bearing while nothing observed it: the `attempts`
remount counter, the gallery's thumbnail focus hand-off, and `focusRetryTargetRef`. The first two
were harmless — the counter because the branch already remounted, the hand-off because React reuses
the thumbnail's DOM node. The third was a P0. "It looks wired up" was true in all three cases and
sufficient in none, and only mutation probing told them apart.
