# Design mock snapshot — Modal Header Reconciliation

Source: Claude Design project `0745bdc0-0da6-45dd-be68-93ffc1e285cd`,
file `Modal Header Reconciliation.dc.html` (fetched 2026-07-18 via the
`claude_design` MCP / `DesignSync` tool).

`mock.html` is a standalone-renderable transcription of that file: the design
canvas's `<x-dc>` / `<helmet>` wrapper and its `support.js` runtime shim have
been unwrapped into a plain document so the mock opens in any browser without
the canvas runtime. **Every style value, class-free inline style, copy string,
SVG path, and dimension inside the mock bodies is verbatim from the source.**

Why this file exists: per the "commit design-mock snapshots for subagents" rule,
a UI dispatch to a subagent (impeccable critique/audit, adversarial reviewer,
implementer) cannot reach the Claude Design project — it can only read the repo.
The mock must be in-tree before any such dispatch.

## What the mock contains

Three modal-header renderings at a fixed 1024px panel width:

1. **Locked — published header in the wizard's frame** (`#1a`) — the target.
   Header band (title + sheet-link icon, client/date subline, alert pill, close)
   over a separate bordered control strip (Published toggle, inline sync/edit
   status, ghost "Re-sync", right-flushed neutral "Copy crew link").
2. **Wizard · Step 3 review** — faithful recreation of today's Step 3 header,
   labelled in-mock as "the target language". This is the shape (1) is being
   reconciled toward; it is NOT changing.
3. **Published show** — faithful recreation of today's published-modal header,
   labelled in-mock as "the one that doesn't gel". This is what (1) replaces.

The two reference recreations are deliberately retained: reviewers need the
before/after adjacency to judge whether the reconciliation actually landed.

## Token mapping

The mock uses raw hex in a `:root` block because the design canvas has no access
to the app's Tailwind v4 `@theme`. The spec is responsible for mapping each to
its live token; do not port the hex values into component source.

| Mock var         | Hex       | Live token (verify in `app/globals.css` during the citation pass) |
| ---------------- | --------- | ----------------------------------------------------------------- |
| `--bg`           | `#0f1014` | modal panel background                                            |
| `--surface`      | `#16171c` | `bg-surface` — header + control strip                             |
| `--text`         | `#e8e6e0` | `text-text`                                                       |
| `--strong`       | `#f5f3ee` | `text-text-strong` — title, "Published" label                     |
| `--subtle`       | `#9c9a93` | `text-text-subtle` — subline, status line, icon buttons           |
| `--faint`        | `#74736d` | mock chrome only (section labels) — not used inside a header      |
| `--border`       | `#2a2b30` | `border-border` — band seams                                      |
| `--border-strong`| `#3a3b40` | `border-border-strong` — Copy outline, 3px bullet separators      |
| `--accent`       | `#ff8c1a` | publish toggle ON fill — the ONLY orange in the header region     |
| `--warning-bg`   | `#3a2e14` | alert pill background                                             |
| `--warning-text` | `#ffd68a` | alert pill label                                                  |
| `--review`       | `#e0b84e` | alert pill dot                                                    |
| `--positive`     | `#4fc9be` | synced dot                                                        |

## Design-linter findings on `mock.html` — all false positives

The impeccable write hook flags four findings in `mock.html`
(`overused-font` ×2 on Inter, `single-font`, `em-dash-overuse`). All four are
false positives and are deliberately left unfixed:

- The file is a **verbatim transcription of an externally-authored document**.
  Its value is fidelity to the source; editing its typography or prose to
  satisfy a linter would destroy the only property that makes it useful as a
  reference.
- Inter and the em-dash cadence belong to the source mock, not to this repo.
  Neither is a typeface or copy decision this project is making.
- `docs/**` is **not a UI surface** under AGENTS.md invariant 8, which scopes
  the dual-gate to `app/` (minus `app/api/**`), `components/`, `app/globals.css`
  `@theme` blocks, `DESIGN.md`, and `tailwind.config.*`.

No ignore-rule / ignore-file entry was persisted — a config change to the shared
linter is not warranted for a single documentation artifact.

## Revision history

- **2026-07-18 initial** — header band + control strip, no Re-sync control.
- **2026-07-18 revision** — adds a ghost "Re-sync" button to the control strip,
  between the status line and the right-flushed Copy (no border, no background,
  `--subtle` text at 13px, refresh glyph). This is the ONLY change between the
  two revisions; everything else is byte-identical. It carries a real cost — see
  the spec's ratified §4 amendment, because resync was deliberately placed in the
  Overview rail section by the earlier consolidated-admin-show-page spec.

## Known intentional divergences from the mock

- **Sheet-link icon hit area.** The mock draws the locked option's sheet-link
  slot at 24x24. Live code and Step 3 both use 44px (`w-tap-min`); the
  implementation keeps 44px. The visual glyph stays 16px either way, so the
  rendered result is indistinguishable from the mock — only the hit rect grows.
  Ratified by the user 2026-07-18; do not relitigate.
- Panel width is pinned to 1024px in the mock purely to stage the comparison.
  The real modal is responsive; the mock says nothing about breakpoint behavior.
- Mock body content below each header is a bare 96px spacer, not real content.
