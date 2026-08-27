# Closeout — fix/observe-error-telemetry

## 12. Invariant-8 UI quality gate

impeccable-gate: critique=RAN audit=RAN p0=0 p1=2 dispositions=recorded

**Unit:** `components/observe/GlobalErrorListener.tsx` — the only file under `components/` or `app/` (outside `app/api/**`) this arc touches. In scope with it, because the component's output flows through them: `lib/observe/describeClientValue.ts`, `lib/observe/clientErrorTransport.ts`.

### Provenance, stated because a silent degraded run is a failed run

- **Critique / Assessment A** ran as an isolated sub-agent. The first attempt died on a session limit mid-run; it was re-dispatched and reported.
- **Critique / Assessment B** was dispatched as an isolated sub-agent, went idle without reporting, and its work was then **re-run inline by the parent**. That is a partial degradation of the isolation guarantee: B's deterministic output was not produced independently of the synthesis context. Every B result below is a command and its literal output, so it is checkable rather than trusted.
- **Audit** ran as an isolated sub-agent. The parent independently settled the accessibility, responsive and lifecycle axes from the source while it ran; those are marked below.

### Why the gate ran at all, and why the N/A marker form was refused

Invariant 8 defines a UI surface **by path**: "any file under `components/`". This component renders nothing, but that is a fact about what the gate can find, not an exemption from running it. An earlier spec draft declared `impeccable-gate: N/A — no UI surface` on the strength of the null render. Plan review round 1 refuted it and was right: `tests/docs/_invariant8Closeout.ts` validates marker *grammar*, and a passing grammar check is not authorization to skip a gate.

The null render is recorded because it **bounds what the gate could find**, and it was verified rather than asserted:

| line | what it is |
| --- | --- |
| 23 | `export function GlobalErrorListener(): null` — the declared return type |
| 25 | `if (registered) return;` — early exit **inside** the `useEffect` callback |
| 82 | `return () => { … }` — the effect's **cleanup**, not a render path |
| 89 | `return null;` — **the only render return** |

One render path, returning `null`. No DOM node, no ref, no portal.

### Findings, and their dispositions

Four findings. **All four repaired in-branch; none deferred, and no ledger row filed** (Eric's directive, 2026-08-25).

| # | tier | finding | disposition |
| --- | --- | --- | --- |
| 1 | **P1** | The crew share token reached `app_events`. `/show/<slug>/<shareToken>` is the only secret-bearing route in the app; `clientErrorTransport` put `location.href` on the wire unmodified; `lib/log/sanitize.ts` redacts emails only. Any client crash on a crew page persisted a live token, which the developer telemetry console renders. AGENTS.md invariant 10: secrets are never logged. | **FIXED** `eb86ada0d` — `redactShareToken` keys on the route shape, not on token format; keeps `/show/<slug>`, masks the rest, drops query and fragment, fails safe on an extra segment, total on a malformed URL. |
| 2 | **P1** | `describeClientValue` could **throw**. `tag()` read `.constructor` unguarded; reading it invokes a getter, and a Proxy with a throwing `get` trap makes it throw. The throw escaped the projection and then the window listener that called it — losing the very crash the module exists to record and emitting an uncaught error on the way out. | **FIXED** `c78f59c1f` — `tag()` is total, like `serializeError`. Pinned against six hostile shapes; removing the guard fails two. |
| 3 | P2 | The window handler's `detail` led with `filename:lineno`. Both parts share one 300-char budget and a `data:`/`blob:`/webpack-eval filename routinely exceeds it alone, so the slice dropped exactly the thrown value the diff added. | **FIXED** `eb86ada0d` — the value leads; a 400-char-filename test fails under the old ordering. |
| 4 | P2 | The dedup `Set` was never evicted: one entry per distinct signature for the life of a page a crew member leaves open all show. Adding `detail` to the key makes strictly more signatures distinct, so this arc **accelerated** it and owns the repair. | **FIXED** `eb86ada0d` — bounded at 500 with a wholesale clear. No cheap LRU on a `Set`; re-sending a crash already sent is the conservative direction; the route rate-caps floods regardless. |

`p1=2` counts findings the gate **raised** at that tier. Both are repaired; `dispositions=recorded` says their dispositions are written down here.

### Axes that do not apply, with the reason each

Marked N/A rather than scored, because a fabricated score is worse than an honest N/A.

| axis | disposition |
| --- | --- |
| Detector (impeccable `detect.mjs`) | `[]`, exit 0 — on the file **and** on `components/observe/` |
| Browser visualization | **N/A** — no rendered output to overlay a detector on. No dev server was started, because nothing could be stated about what it would show. |
| em-dash ban in user-visible copy | **N/A** — 2 found, both in comments (lines 30, 53). The file has no user-visible copy. |
| apostrophe literals | **N/A** — 4 found, all in comments/JSDoc (13, 18, 32, 55) |
| 44px tap targets | **N/A** — no interactive target, no JSX |
| canonical type/token classes | **N/A** — zero `className` in the file |
| hardcoded colors / Tailwind | **N/A** — same |
| Responsive | **N/A** — nothing renders |
| Accessibility | **N/A**, verified directly: zero `preventDefault`, `focus`, `aria-`, `role=`, `tabIndex`; no DOM node created. It cannot move focus, alter a live region, or change default browser error behaviour. |
| Nielsen #1, #3–#8 | **N/A** — no user-facing surface |

Scored only against the `app_events` row a developer reads: **#9 diagnose errors 3** (docked for the truncation ordering, now fixed), **#2 match to real world 3** (type tags disambiguate but add noise), **#10 documentation 4**.

**AI-slop verdict: no.** 33 comment lines to 25 code lines is a high ratio, and each comment cites a spec limit or a rejected alternative rather than restating the code.

### One thing the gate corrected in this arc's own reasoning

The parent's first pass concluded these forensic codes surface to Doug in an admin telemetry console, and reasoned at length about whether that violated invariant 5. Assessment A refuted it: **there is no `app/admin/telemetry` route.** The only mounts of `EventRow` are `app/admin/dev/telemetry/page.tsx` and `app/admin/dev/telemetry-dim/page.tsx`, both behind `requireDeveloperIdentity`, and `requireDeveloper.ts` states developer ⟹ admin and not the converse — a plain admin is refused. Doug does not see these codes; a developer does, on the console where codes are the point (`EventFilters.tsx` offers `code` as a filter key).

The residual caveat is a roster fact rather than a code fact: if Doug is granted `is_developer`, he reaches that console — and it is still the developer console.

### Lifecycle, checked because a global listener is easy to get wrong

Registration is idempotent behind a module-level flag (`:15`, `:26`), and cleanup removes **both** listeners and resets the flag (`:89–:91`), so a remount re-registers exactly once. Under StrictMode's double-invoke, one uncaught error yields one telemetry record — pinned by `tests/observe/globalErrorListener.test.tsx`.
