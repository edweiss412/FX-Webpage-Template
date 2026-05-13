# Phase E — Content authoring (13 pages)

**Scope:** Author the 13 v1 pages: 4 adoption-track + 7 capability-reference + `/help/tour` + `/help/errors`. Each page is a separate task following a shared pattern. Smoke tests assert each page renders without error and contains the documented section structure.

**Prereqs:** Phase D complete (strict sequential per 00-overview.md — implies A + B + C also complete). MDX pipeline + layout from A; catalog schema extended in B; time utility from C; all six MDX components from D.

**Tasks:** E.1 → E.13 (13 tasks). Order is flexible; the recommended order is the reading order (adoption track first, then reference, then tour + errors). E.13 (`/help/errors`) is a TSX file (iterates catalog); the other 12 are `.mdx`.

**Shared page pattern (applies to every E.N task):**

1. Write a failing test in `tests/help/page-<slug>.test.tsx` that asserts: the page renders, contains expected section headings, includes the required component usages (e.g., at least one `<Callout>`).
2. Run the test — fails (Phase A.7 created a single-line stub; the test asserts on the real content shape that doesn't exist yet).
3. **Replace the stub content** at `app/help/<slug>/page.mdx` (or `page.tsx` for E.13) with the page structure + content brief implemented. The file already exists from Phase A.7; E.N edits in place rather than creating new files. (r4 change — earlier draft had Phase E creating files, which conflicted with Phase A.7's stub-creation step.)
4. **For the 7 admin-reference pages (E.5 – E.11):** also populate `title` / `longExplanation` / `helpHref` on the corresponding catalog entries (per Phase B.4's catalog-meta-test forced-fixture coverage; the LIVE-catalog biconditional assertion runs in Phase H Task H.6). Edit `lib/messages/catalog.ts` to set these three fields on every entry that points to this page via `helpHref`. Most pages cover a class of error codes; populate accordingly.
5. Run the test — passes.
6. Run `pnpm dev`, visit the page as admin, do a sanity scan — content reads cleanly, no dev-only artifacts.
7. Commit.

**Content-quality acceptance for every page:**

- Tone matches PRODUCT.md ("Professional · Bold-modern · Intuitive" — plain language, no jargon, no error codes in visible text, glanceable on mobile)
- All time + date references use the existing tabular-figures pattern (`tabular-nums` class) when shown in tile-style components
- Every `<Screenshot key="...">` reference resolves to a manifest entry (Phase F will add these; until then, use `<ScreenshotPlaceholder>` and convert during Phase F.11)
- No `<ScreenshotPlaceholder>` references at v1 close-out (Phase H.4 lint enforces)
- Page mobile-first; sections separated by appropriate spacing tokens

---

### Task E.1: `app/help/page.mdx` — landing

**Files:**
- Modify: `app/help/page.mdx` (replace Phase A's placeholder)

**Content brief:** Elevator pitch + three jump buttons into the next three adoption pages.

**Page structure:**

1. H1: "What this app does for you"
2. 1–2 paragraphs covering: the app turns your show sheets into per-crew-member pages crew can read on their phones; your sheet stays the source of truth; the app handles sync + distribution
3. `<Callout type="note">` summarizing the one-time setup + the daily rhythm (one sentence each)
4. Three navigation cards/links into: "First-time setup" (`/help/getting-started`), "Your new daily rhythm" (`/help/daily-rhythm`), "What's different from Sheets" (`/help/whats-different`)
5. Footer link to `/help/tour` ("Take the tour")

- [ ] **Step 1: Write the failing test**

Create `tests/help/page-landing.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "app/help/page.mdx"), "utf8");

describe("/help landing page (E.1)", () => {
  it("has the canonical H1", () => {
    expect(src).toMatch(/^# What this app does for you\b/m);
  });

  it("contains at least one Callout", () => {
    expect(src).toMatch(/<Callout/);
  });

  it("links to all three adoption-track pages", () => {
    expect(src).toContain("/help/getting-started");
    expect(src).toContain("/help/daily-rhythm");
    expect(src).toContain("/help/whats-different");
  });

  it("links to the tour", () => {
    expect(src).toContain("/help/tour");
  });

  it("does NOT reference <ScreenshotPlaceholder> (v1 ships real screenshots — Phase H.4 lint enforces)", () => {
    expect(src).not.toContain("<ScreenshotPlaceholder");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/help/page-landing.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write the page content**

Replace `app/help/page.mdx` with content that satisfies the structure brief. Reference template:

```mdx
# What this app does for you

Your show sheets in Google Sheets stay the way you know them. This app reads your sheets and turns each one into a per-crew-member webpage your team can open on their phones — replacing the dense spreadsheet view with something they can read in five seconds while walking the venue floor.

You still edit your sheets the same way. The app handles syncing, generating signed links for each crew member, and showing each person only the fields they need.

<Callout type="note">
Two things to know: (1) the **one-time setup** is sharing your Drive show folder with the app's email (see [First-time setup](/help/getting-started)). (2) Your **daily rhythm** changes slightly — you'll glance at the admin dashboard for any items needing your attention (see [Your new daily rhythm](/help/daily-rhythm)).
</Callout>

## Start here

- **[First-time setup →](/help/getting-started)** — share your Drive folder; sheets start syncing within minutes.
- **[Your new daily rhythm →](/help/daily-rhythm)** — what to check in the admin dashboard, and when.
- **[What's different from Sheets →](/help/whats-different)** — same workflow, three small new habits.

Want a one-page overview of every admin surface? Take the **[tour →](/help/tour)**.
```

- [ ] **Step 4: Run test**

Run: `pnpm test tests/help/page-landing.test.tsx`
Expected: PASS.

- [ ] **Step 5: Manual review (`pnpm dev` + visit `/help` as admin)**

Confirm: H1 renders, Callout renders with note styling, links navigate. No dev-only artifacts visible.

- [ ] **Step 6: Commit**

```bash
git add app/help/page.mdx tests/help/page-landing.test.tsx
git commit -m "feat(help): /help landing page content (Task E.1)"
```

---

### Task E.2: `app/help/getting-started/page.mdx` — first-time setup

**Files:**
- Create: `app/help/getting-started/page.mdx`

**Content brief:** Mirror master spec §9.0 onboarding wizard. 3-step procedural walkthrough using `<Step>`. Include `<TipFromSheets>` linking the new "share a folder" idea to Doug's existing Drive-folder habits.

**Page structure:**

1. H1: "First-time setup"
2. Intro paragraph: this happens once, then you're done
3. `<Step n={1}>` Share your Drive folder with the service-account email (reference master-spec §9.0 Step 1)
4. `<Step n={2}>` Return to `/admin` and click "I've shared the folder"
5. `<Step n={3}>` Wait ~5 minutes; sheets appear in the dashboard
6. `<TipFromSheets>` aside explaining the analogy to the Drive folders Doug already manages
7. `<Callout type="note">` answering "What's this email I'm sharing with?"
8. Brief troubleshooting list: 2–3 common gotchas (folder shared with wrong account, sheet not appearing, etc.) — each with the action to take

- [ ] **Step 1: Write the failing test**

```tsx
// tests/help/page-getting-started.test.tsx
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "app/help/getting-started/page.mdx"), "utf8");

describe("/help/getting-started (E.2)", () => {
  it("has the canonical H1", () => {
    expect(src).toMatch(/^# First-time setup\b/m);
  });

  it("uses Step components numbered 1, 2, 3", () => {
    expect(src).toMatch(/<Step n=\{?\s*1\s*\}?/);
    expect(src).toMatch(/<Step n=\{?\s*2\s*\}?/);
    expect(src).toMatch(/<Step n=\{?\s*3\s*\}?/);
  });

  it("includes a TipFromSheets analogy", () => {
    expect(src).toContain("<TipFromSheets>");
  });

  it("includes a Callout (what's-the-email)", () => {
    expect(src).toContain("<Callout");
  });

  it("does NOT reference <ScreenshotPlaceholder>", () => {
    expect(src).not.toContain("<ScreenshotPlaceholder");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/help/page-getting-started.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write the page**

Reference template (implementer adapts the exact prose to Doug's voice and PRODUCT.md tone):

```mdx
# First-time setup

You do this once. After that, every new show sheet you drop into your folder shows up in the admin dashboard within about five minutes.

<Step n={1}>
**In Google Drive, find or make the folder where you keep your show sheets.** Then click **Share** on that folder and paste the app's service-account email (shown on `/admin` when no folder is configured yet) into the "Add people and groups" field. Give it **Viewer** access.
</Step>

<Step n={2}>
**Return to `/admin` and click "I've shared the folder."** The app polls the folder every minute or so; manual click just speeds it up.
</Step>

<Step n={3}>
**Wait ~5 minutes.** Sheets in the folder will appear in the dashboard's Active Shows list. If a sheet's parse hits something unusual, it'll appear in the "Sheets we couldn't auto-apply" panel — that's normal for first-seen sheets; click "Review and Apply."
</Step>

<TipFromSheets>
You're already used to organizing your shows in a Drive folder. This step just gives the app *read-only* access to that same folder — nothing changes about how you organize your sheets.
</TipFromSheets>

<Callout type="note">
**What's the email I'm sharing with?** It's the app's identity in your Drive. It can only see what you share with it, and only the folder you choose. It's not a person — it's a robot account used solely to read your sheets.
</Callout>

## If something doesn't appear

- **Sheet doesn't show up in the dashboard:** confirm the folder is shared with the service-account email (not your personal email), and the sheet is *inside* that folder (not a sibling).
- **Sheet appears but parse fails:** open it from the "Sheets we couldn't auto-apply" panel and click "Review and Apply." Doug-facing parse warnings explain exactly what to fix.
- **Need to start over:** unshare the folder, then re-share it. The app re-scans automatically.
```

- [ ] **Step 4: Run test + manual review**

Run: `pnpm test tests/help/page-getting-started.test.tsx`
Expected: PASS.

Visit `/help/getting-started` as admin. Confirm Steps render with numbered badges, TipFromSheets renders with accent styling, Callout renders.

- [ ] **Step 5: Commit**

```bash
git add app/help/getting-started/page.mdx tests/help/page-getting-started.test.tsx
git commit -m "feat(help): /help/getting-started page content (Task E.2)"
```

---

### Task E.3: `app/help/daily-rhythm/page.mdx` — daily rhythm

**Files:**
- Create: `app/help/daily-rhythm/page.mdx`

**Content brief:** Mirror master spec §9.1 + §9.1.1. Explain the dashboard scan routine: glance, address yellow, move on.

**Page structure:**

1. H1: "Your new daily rhythm"
2. Intro paragraph: short, normal-day walkthrough
3. H2 "What to glance at" — bulleted list of: Active Shows panel (last-sync badge), staged-changes badge, "Sheets we couldn't auto-apply" panel
4. H2 "When something is yellow" — `<Callout type="warning">` summarizing what "Review staged changes" means + linking to `/help/admin/review-queues`
5. H2 "Sharing a new sheet with crew" — short paragraph + link to `/help/admin/sharing-links`
6. H2 "What hasn't changed" — bulleted list of things Doug still does the same way (editing the sheet, COI tracking, transport spreadsheets, etc.)

- [ ] **Step 1: Write the failing test**

```tsx
// tests/help/page-daily-rhythm.test.tsx
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "app/help/daily-rhythm/page.mdx"), "utf8");

describe("/help/daily-rhythm (E.3)", () => {
  it("has the canonical H1", () => {
    expect(src).toMatch(/^# Your new daily rhythm\b/m);
  });

  it("includes a warning Callout for yellow-state guidance", () => {
    expect(src).toMatch(/<Callout type=["']warning["']/);
  });

  it("links to review-queues and sharing-links pages", () => {
    expect(src).toContain("/help/admin/review-queues");
    expect(src).toContain("/help/admin/sharing-links");
  });

  it("does NOT reference <ScreenshotPlaceholder>", () => {
    expect(src).not.toContain("<ScreenshotPlaceholder");
  });
});
```

- [ ] **Step 2: Run test to verify it fails, write content, re-run, commit**

Follow the shared pattern. Reference structure:

```mdx
# Your new daily rhythm

Most days, you open the admin dashboard, glance at it for a few seconds, and move on. The app handles the heavy lifting; you handle anything yellow.

## What to glance at

- **Active Shows** — each row shows the show name, dates, crew count, and a last-sync indicator. A green check means the last sync succeeded; a yellow "Review staged changes" badge means the app held back your latest sheet edits for your review.
- **Sheets we couldn't auto-apply** — brand-new sheets that the app couldn't fully process yet (parse error, or a structural difference the app wants your sign-off on).
- **Staged-changes badge** on any active show row — same idea as the panel, but for sheets the app already published once.

## When something is yellow

<Callout type="warning">
**Yellow means "Doug, take a look."** A yellow Review-staged-changes badge means new edits in your sheet are waiting for your approval before the app publishes them to crew. Read [Review queues](/help/admin/review-queues) for what to look at and when to Apply vs. Discard.
</Callout>

## Sharing a new sheet with crew

Once a show appears in Active Shows, each crew member has a personalized page. Send each their link from the show's preview-links list. Details and rules at [Sharing crew links](/help/admin/sharing-links).

## What hasn't changed

- You still **edit your sheet** the same way. The app reads from it; it doesn't write back.
- **COI tracking, hotel rosters, transport sheets** — anything that lives outside the show template — stays in whatever tools you already use.
- **Crew communication** outside the page itself — texts, calls, last-minute changes — keeps flowing through your usual channels.
```

- [ ] **Step 3: Commit**

```bash
git add app/help/daily-rhythm/page.mdx tests/help/page-daily-rhythm.test.tsx
git commit -m "feat(help): /help/daily-rhythm page content (Task E.3)"
```

---

### Task E.4: `app/help/whats-different/page.mdx` — what's different

**Files:**
- Create: `app/help/whats-different/page.mdx`

**Content brief:** Explicit Sheets-vs-FXAV diff: same / automated / new.

**Page structure:**

1. H1: "What's different from Sheets"
2. Intro: short — three small habits change, the rest stays.
3. H2 "Same as before" — bulleted list
4. H2 "Now automated" — bulleted list (sync, signed-link generation, role-based filtering)
5. H2 "New habits" — three `<Step>` items: glance at the dashboard, handle yellow items, share signed links instead of sheet links
6. Footer link: `/help/admin/review-queues` for the deepest of the three new habits

- [ ] **Step 1–3: Test + content + commit following the shared pattern**

```tsx
// tests/help/page-whats-different.test.tsx
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "app/help/whats-different/page.mdx"), "utf8");

describe("/help/whats-different (E.4)", () => {
  it("has the canonical H1", () => {
    expect(src).toMatch(/^# What's different from Sheets\b/m);
  });

  it("uses Step components for new habits", () => {
    expect(src).toMatch(/<Step n=/);
  });

  it("does NOT reference <ScreenshotPlaceholder>", () => {
    expect(src).not.toContain("<ScreenshotPlaceholder");
  });
});
```

Page content follows the structure brief. Implementer writes prose matching the tone.

Commit: `feat(help): /help/whats-different page content (Task E.4)`

---

### Task E.5: `app/help/admin/dashboard/page.mdx` — reading the dashboard

**Files:**
- Create: `app/help/admin/dashboard/page.mdx`
- Modify: `lib/messages/catalog.ts` (if any error codes get `/help/admin/dashboard` as their `helpHref`, populate `title` / `longExplanation` / `helpHref` per Phase B.4 biconditional)

**Content brief:** Mirror master spec §9.1 + §9.1.1. Explain the two panels (Active Shows, Sheets-we-couldnt-auto-apply) and the badge/icon meanings.

**Page structure:**

1. H1: "Reading the dashboard"
2. `<Screenshot key="dashboard-overview" alt="...">` showing the dashboard at a normal state (Phase F populates the WebP)
3. H2 "The Active Shows panel" — `<RefAnchor id="ACTIVE_SHOWS">` (the §5.6 matrix says the `?` tooltip on this header links here)
   - Per-column explanation
   - What status badges mean (green, yellow, red — but never use color alone per PRODUCT.md a11y floor)
4. H2 "The Sheets-we-couldn't-auto-apply panel" — `<RefAnchor id="PENDING_INGESTION">`
   - When sheets land here (first-seen + parse failure)
   - Retry vs. Discard
5. H2 "Staged-changes review" — short pointer to `/help/admin/review-queues#re-stage`

Smoke test:

```tsx
// tests/help/page-dashboard.test.tsx
const src = /* readFileSync(...) */;
describe("/help/admin/dashboard (E.5)", () => {
  it("has the canonical H1", () => expect(src).toMatch(/^# Reading the dashboard\b/m));
  it("uses RefAnchor for the two panel anchors", () => {
    expect(src).toMatch(/<RefAnchor id=["']ACTIVE_SHOWS["']/);
    expect(src).toMatch(/<RefAnchor id=["']PENDING_INGESTION["']/);
  });
  it("links to /help/admin/review-queues", () =>
    expect(src).toContain("/help/admin/review-queues"));
});
```

Commit: `feat(help): /help/admin/dashboard page + relevant catalog title/longExplanation/helpHref (Task E.5)`

---

### Task E.6: `app/help/admin/review-queues/page.mdx` — review queues

**Files:**
- Create: `app/help/admin/review-queues/page.mdx`
- Modify: `lib/messages/catalog.ts` (populate `title` / `longExplanation` / `helpHref` for codes whose `helpHref` lands here — implementer derives the set by grepping the M9 review-queues components for `messageFor(` call sites and listing each code rendered through them; for each such code where `severity !== "info"` and `dougFacing != null`, set `helpHref` to `/help/admin/review-queues#<code>` and add a matching `<RefAnchor id={code}>` to the page)

**Content brief:** Mirror master spec §9.1 + §9.1.1 + §5.2 routing. First-seen vs. re-stage; Apply vs. Discard; what each action does irrevocably.

**Page structure:**

1. H1: "Review queues"
2. Intro: two queues, two reasons for queueing
3. H2 `<RefAnchor id="FIRST_SEEN">` "First-seen review" — when, what you're looking at, Apply vs. Discard semantics (Apply mints `shows` row + Discard leaves no slug); `<Callout type="warning">` about Discard being irreversible only in that it deletes the staged data — the sheet itself is fine
4. H2 `<RefAnchor id="RE_STAGE">` "Re-stage review" — your edits to an already-published show that the app paused for review (link to master spec §9.1.1 explanation of triggers via plain language)
5. H2 "When to Apply" — short bullet list
6. H2 "When to Discard" — short bullet list
7. `<Screenshot key="review-queues-side-by-side" alt="...">`

Smoke test (similar shape to E.5).

Commit: `feat(help): /help/admin/review-queues page + catalog deep-link backfill (Task E.6)`

---

### Task E.7: `app/help/admin/parse-warnings/page.mdx` — parse warnings

**Files:**
- Create: `app/help/admin/parse-warnings/page.mdx`
- Modify: `lib/messages/catalog.ts` (populate `title` / `longExplanation` / `helpHref` for every parse-warning code where `dougFacing != null`; their `helpHref` is `/help/admin/parse-warnings#<code>`)

**Content brief:** **This page is the largest content task.** One `<RefAnchor>` section per parse-warning code in §12.4 that surfaces to Doug. Each section explains in plain language what triggered the warning + what to do (usually "edit the sheet to fix X").

**Page structure:**

1. H1: "Parse warnings"
2. Intro: what parse warnings are (sheet looked right enough to publish, but something specific is missing or unusual) and how to read them
3. **For every parse-warning code that surfaces to Doug** (derive from `lib/messages/catalog.ts` after Phase B.2 alignment — every entry with `severity ?? "warning"` non-info AND `dougFacing != null` AND a "WARN_" or parse-related code-name pattern):
   - `<RefAnchor id={CODE}>` — the visible heading is `entry.title`
   - Paragraph explaining the cause in plain language
   - Paragraph or bulleted list explaining what to do
4. Footer: `<Callout type="note">` directing Doug to "Tell Eric" if something doesn't look right after he's tried the suggested fix

**Catalog backfill:** for every `<RefAnchor id={CODE}>` section, set the catalog entry's:
- `title` — a short heading (e.g., "Day flag on crew row doesn't match a column")
- `longExplanation` — the same paragraph that appears on the page, condensed if necessary
- `helpHref` — `"/help/admin/parse-warnings#" + CODE`

Test #2 (catalog meta-test, Phase B.4) verifies all three are non-null on every applicable code. Test #1 (anchor resolver, Phase H — to be added) verifies every `helpHref` resolves to a real anchor on this page.

Smoke test:

```tsx
// tests/help/page-parse-warnings.test.tsx
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

const src = readFileSync(/* ... */);
const warningCodes = Object.values(MESSAGE_CATALOG).filter(
  (e) => e.helpHref?.startsWith("/help/admin/parse-warnings#"),
);

describe("/help/admin/parse-warnings (E.7)", () => {
  it("has the canonical H1", () => expect(src).toMatch(/^# Parse warnings\b/m));

  for (const entry of warningCodes) {
    it(`has a <RefAnchor id="${entry.code}"> section`, () => {
      expect(src).toMatch(new RegExp(`<RefAnchor id=["']${entry.code}["']`));
    });
  }
});
```

Commit: `feat(help): /help/admin/parse-warnings + catalog backfill for every Doug-facing warning code (Task E.7)`

---

### Task E.8: `app/help/admin/per-show-panel/page.mdx` — per-show panel

**Files:**
- Create: `app/help/admin/per-show-panel/page.mdx`

**Content brief:** Mirror master spec §9.2 — what's on `/admin/show/<slug>`. Four sub-sections (staged-review card, sync health, parse warnings, crew preview links).

**Page structure:**

1. H1: "Per-show panel"
2. Intro: one paragraph
3. H2 `<RefAnchor id="STAGED_REVIEW_CARD">` (if entry exists; otherwise plain H2) — explains when the yellow card appears + links to `/help/admin/review-queues#re-stage`
4. H2 `<RefAnchor id="sync-health">` "Sync health" — last 5 sync attempts, manual re-sync, what to do if syncs keep failing
5. H2 "Parse warnings" — short pointer to `/help/admin/parse-warnings`
6. H2 "Crew preview links" — what these are + how to use Preview as Crew

(Note: anchor IDs that are NOT catalog codes are kebab-case per the RefAnchor regex — actually the RefAnchor regex requires `^[A-Z][A-Z0-9_]*$`. For non-catalog section anchors, EITHER expand the regex or use plain heading IDs. Plan choice: use plain `<h2 id="sync-health">` for non-catalog anchors; reserve `<RefAnchor>` for catalog code IDs. **Update D.5 regex or use plain h2 — implementer chooses.**)

Smoke test similar to E.5.

Commit: `feat(help): /help/admin/per-show-panel page (Task E.8)`

---

### Task E.9: `app/help/admin/preview-as-crew/page.mdx` — preview as crew

**Files:**
- Create: `app/help/admin/preview-as-crew/page.mdx`

**Content brief:** Mirror master spec §9.3 + §7.4 (role-based field hiding). How impersonation works; what to check; why role-based hiding matters.

**Page structure:**

1. H1: "Preview as crew"
2. Intro: what impersonation is and why it exists
3. `<Screenshot key="preview-as-crew-banner" alt="...">` showing the sticky banner
4. H2 `<RefAnchor id="impersonation-banner">` — the banner UX (sticky, yellow, Exit button) — note this is the `?` icon target per §5.6 matrix
5. H2 "What to verify" — bulleted checklist (call time correct, hotel info present, role-restricted info hidden as expected)
6. H2 "Why some fields are hidden" — short explanation of role-based filtering; reassures Doug that not-seeing-a-field is correct behavior, not a bug

Smoke test similar to E.5.

Commit: `feat(help): /help/admin/preview-as-crew page (Task E.9)`

---

### Task E.10: `app/help/admin/sharing-links/page.mdx` — sharing crew links

**Files:**
- Create: `app/help/admin/sharing-links/page.mdx`

**Content brief:** Mirror master spec §7.2 (signed link format) + §7.4 (role-based filtering). How signed links work, how to send them, what crew see when they tap.

**Page structure:**

1. H1: "Sharing crew links"
2. Intro
3. H2 "How to send a link" — `<Step n={1..3}>` walkthrough (open preview-links list, copy each member's link, send via text/email/whatever channel Doug uses)
4. H2 "What crew see" — short explanation
5. H2 "If a link gets shared with the wrong person" — what happens (whose responsibility), how to issue a new link, "Issue new link" action
6. H2 "Link expiry + revocation" — link lifetime, what triggers revocation, what crew see when an expired link is opened

Commit: `feat(help): /help/admin/sharing-links page (Task E.10)`

---

### Task E.11: `app/help/admin/onboarding-wizard/page.mdx` — onboarding wizard reference

**Files:**
- Create: `app/help/admin/onboarding-wizard/page.mdx`

**Content brief:** Mirror master spec §9.0. Mostly historical (Doug runs the wizard once). Useful for re-runs and successor onboarding.

**Page structure:**

1. H1: "Onboarding wizard"
2. Intro: when you see the wizard (first-time visit, or post-cleanup)
3. H2 `<RefAnchor id="service-account">` — Step 1 (matches §5.6 testid `help-affordance--wizard-step1--tooltip`)
4. H2 `<RefAnchor id="step-2">` — Step 2 (matches §5.6 testid for step2)
5. H2 `<RefAnchor id="step-3">` — Step 3 (matches §5.6 testid for step3)

Anchors are lowercase-with-hyphen here, which doesn't match the RefAnchor regex. **Decision:** for these onboarding-wizard anchors, use plain `<h2 id="step-2">` not `<RefAnchor>`. Reserve `<RefAnchor>` for catalog codes only. Update the smoke test to look for plain `id="step-2"` etc.

Smoke test:

```tsx
const src = /* ... */;
describe("/help/admin/onboarding-wizard (E.11)", () => {
  it("has the canonical H1", () => expect(src).toMatch(/^# Onboarding wizard\b/m));
  it("has anchored sections matching §5.6 matrix testids", () => {
    expect(src).toMatch(/id=["']service-account["']/);
    expect(src).toMatch(/id=["']step-2["']/);
    expect(src).toMatch(/id=["']step-3["']/);
  });
});
```

Commit: `feat(help): /help/admin/onboarding-wizard page (Task E.11)`

---

### Task E.12: `app/help/tour/page.mdx` — tour

**Files:**
- Create: `app/help/tour/page.mdx`

**Content brief:** One-paragraph-per-surface tour. Linked from `/help` landing footer and from the §9.0.1 dashboard-footer "Take the tour" affordance.

**Page structure:**

1. H1: "Tour"
2. Intro: one paragraph
3. **One H2 per operator-facing surface**, each with one paragraph and a "Read more →" link to the relevant detail page:
   - Dashboard → /help/admin/dashboard
   - Review queues → /help/admin/review-queues
   - Parse warnings → /help/admin/parse-warnings
   - Per-show panel → /help/admin/per-show-panel
   - Preview as crew → /help/admin/preview-as-crew
   - Sharing crew links → /help/admin/sharing-links
   - Onboarding wizard → /help/admin/onboarding-wizard

Smoke test asserts links to all 7 admin-reference pages.

Commit: `feat(help): /help/tour page (Task E.12)`

---

### Task E.13: `app/help/errors/page.tsx` — TSX iterating §12.4 catalog

**Files:**
- Create: `app/help/errors/page.tsx`

Per spec §4.3 / AC-12.11. This is the ONE page that's TSX (not MDX) because it iterates the catalog. Each entry matching the AC-12.6 predicate becomes a `<RefAnchor id={code}>` section with `entry.title` heading + `entry.longExplanation` body + a "If this keeps happening, tell Eric →" trailing CTA (NOT a Learn-more link per AC-12.11 r10 correction).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/help/page-errors.test.tsx
import { describe, it, expect } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "app/help/errors/page.tsx"), "utf8");

const renderableCodes = Object.values(MESSAGE_CATALOG).filter(
  (e) => e.severity !== "info" && e.dougFacing !== null,
);

describe("/help/errors (E.13)", () => {
  it("imports MESSAGE_CATALOG", () => {
    expect(src).toMatch(/MESSAGE_CATALOG/);
  });

  it("iterates entries server-side (no useEffect / useState client patterns)", () => {
    expect(src).not.toContain("useState");
    expect(src).not.toContain('"use client"');
  });

  it("trailing CTA is 'tell Eric' (NOT 'Learn more') per AC-12.11 r10", () => {
    expect(src).toMatch(/tell Eric/i);
    expect(src).not.toMatch(/Learn more/i); // the destination page never self-links
  });

  it("rendered output contains every renderable code as an anchor id (smoke-render via Next test renderer)", async () => {
    // Use Next.js' app-router test renderer or @testing-library/react with the
    // page component directly.
    const Page = (await import("@/app/help/errors/page")).default;
    const html = renderToStaticMarkup(<Page />);
    for (const entry of renderableCodes) {
      expect(html).toContain(`id="${entry.code}"`);
      expect(html).toContain(entry.title!);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/help/page-errors.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `app/help/errors/page.tsx`**

```tsx
// app/help/errors/page.tsx
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";
import { RefAnchor } from "@/app/help/_components/RefAnchor";

// AC-12.6 predicate: severity !== "info" AND dougFacing != null AND all three M12 fields non-null.
function isRenderable(entry: MessageCatalogEntry): boolean {
  return (
    entry.severity !== "info" &&
    entry.dougFacing !== null &&
    entry.title !== null &&
    entry.longExplanation !== null &&
    entry.helpHref !== null
  );
}

export default function ErrorsPage() {
  const entries = (Object.values(MESSAGE_CATALOG) as MessageCatalogEntry[])
    .filter(isRenderable)
    .sort((a, b) => a.code.localeCompare(b.code));

  return (
    <article className="prose prose-neutral max-w-none">
      <h1>Errors</h1>
      <p>
        Every error this app surfaces has a plain-language explanation here.
        If you see one in <code>/admin</code> and want more context, look up
        the code below.
      </p>
      {entries.map((entry) => (
        <section key={entry.code} className="mt-6">
          <RefAnchor id={entry.code}>{entry.title}</RefAnchor>
          <p>{entry.longExplanation}</p>
          <p className="text-sm text-text-subtle">
            <a href="/admin/bug-report" className="underline underline-offset-2">
              If this keeps happening, tell Eric →
            </a>
          </p>
        </section>
      ))}
    </article>
  );
}
```

- [ ] **Step 4: Run test + manual review**

Run: `pnpm typecheck && pnpm test tests/help/page-errors.test.tsx`
Expected: PASS for entries that have been content-authored. If catalog entries that should render exist but lack `title` / `longExplanation` / `helpHref`, Phase B.4's biconditional meta-test will catch them — they're not yet content-authored. The errors-page smoke renders only the ones that are.

- [ ] **Step 5: Extend the catalog meta-test with the LIVE biconditional assertion (r6 — folds in the work B.4 deferred)**

Per r6 fix to round-5 finding 3: B.4 committed only forced fixtures because the live-catalog biconditional fails until every Doug-facing entry is backfilled. E.13 is the genuinely-last Phase E task; by E.13 time every E.5–E.11 backfill has landed. E.13 ADDS the live assertion (red just before this commit; green after) as part of the same TDD red-green-commit loop as the errors page itself.

Append to `tests/messages/_metaErrorCatalogDocs.test.ts`:

```ts
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

describe("Catalog meta-test (test #2 — live-catalog biconditional, added in E.13 per r6)", () => {
  it("every live entry satisfies the biconditional", () => {
    const violations: string[] = [];
    const HELP_HREF_RE = /^\/help\/.+/;
    for (const [code, entry] of Object.entries(MESSAGE_CATALOG)) {
      const lhs = entry.severity !== "info" && entry.dougFacing !== null;
      const rhs =
        entry.title !== null && entry.longExplanation !== null && entry.helpHref !== null;
      if (lhs !== rhs) {
        violations.push(`${code}: predicate=${lhs}, M12 fields non-null=${rhs}`);
      }
      if (rhs && entry.helpHref && !HELP_HREF_RE.test(entry.helpHref)) {
        violations.push(`${code}: helpHref invalid: ${entry.helpHref}`);
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
```

- [ ] **Step 6: Run the test**

Run: `pnpm test tests/messages/_metaErrorCatalogDocs.test.ts`

If the biconditional FAILS for any entry: a Phase E backfill missed an entry. Fix the backfill in `lib/messages/catalog.ts` AS PART OF THIS COMMIT (not a follow-up — E.13 is the consolidation step that closes any gaps). Re-run until PASS.

This is the TDD red→implementation→green→commit loop the reviewer required: the live biconditional assertion is the failing test; the implementation is any final backfill that makes it pass; the commit ships both together.

- [ ] **Step 7: Commit**

```bash
git add app/help/errors/page.tsx tests/help/page-errors.test.tsx tests/messages/_metaErrorCatalogDocs.test.ts lib/messages/catalog.ts
git commit -m "feat(help): /help/errors TSX + live-catalog biconditional (Task E.13 — closes B.4 deferral per r6)"
```

---

## Phase E close-out

After E.1 – E.13 commits land:

- [ ] All 13 v1 pages exist; each renders without error
- [ ] Test #5 (nav consistency, scaffolded in A.7) now PASSES
- [ ] Test #2 (catalog biconditional) PASSES for every Doug-facing entry with `helpHref` populated
- [ ] No `<ScreenshotPlaceholder>` references on any page (Phase H.4 lint enforces; Phase F will replace any placeholders that snuck in during content-authoring with real `<Screenshot>` references)
- [ ] All in-page anchored sections render with correct IDs
- [ ] `pnpm dev` + visit every `/help/*` URL as admin: pages render with chrome + content
- [ ] **Hand off to Phase F** ([06-screenshot-harness.md](06-screenshot-harness.md))

Phase E introduces ~13 commits + catalog backfill for every Doug-facing admin entry with a `helpHref` pointing into the new pages.
