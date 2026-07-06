# Phase 4 — Redirect + staged-page delete (spec §4.6)

Only now (after Phase 3 made `/admin` the unified surface) is it safe to delete the standalone staged page and redirect its URL.

---

### Task 4.1: `next.config.ts` staged-URL 307 redirect + test (spec §4.6)

**Files:**
- Modify: `next.config.ts:46-75` (`redirects()`)
- Test: `tests/config/step3StagedRedirect.test.ts`

- [ ] **Step 1: Write the failing test** — import the config, find the redirect entry, assert `source` matches the staged path pattern, `destination === "/admin"`, `permanent === false` (307). Mirror `tests/config/rootRedirect.test.ts`.
```ts
import { describe, expect, it } from "vitest";
import config from "@/next.config";

describe("staged-URL redirect (spec §4.6)", () => {
  it("307s /admin/onboarding/staged/:wizardSessionId/:driveFileId to /admin", async () => {
    const redirects = await (config as any).redirects();
    const entry = redirects.find((r: any) => r.source.includes("/admin/onboarding/staged/"));
    expect(entry).toBeTruthy();
    expect(entry.destination).toBe("/admin");
    expect(entry.permanent).toBe(false);
  });
});
```

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement** — add to the `redirects()` array:
```ts
{
  // The standalone /admin/onboarding/staged/[session]/[file] recovery page was
  // folded into the unified Step-3 review surface (spec §4.6). 307 (permanent:false)
  // — reversible; Step-3 is the session's home and the row is surfaced there.
  source: "/admin/onboarding/staged/:wizardSessionId/:driveFileId",
  destination: "/admin",
  permanent: false,
},
```

- [ ] **Step 4: Run — verify pass.** - [ ] **Step 5: Typecheck.**

- [ ] **Step 6: Commit**
```bash
git add next.config.ts tests/config/step3StagedRedirect.test.ts
git commit --no-verify -m "feat(routing): 307 redirect old staged URL to /admin (spec §4.6)"
```

---

### Task 4.2: Delete staged page + remove link renderers + trustDomains entry (spec §4.6)

**Files:**
- Delete: `app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx`
- Modify: `components/admin/wizard/Step3ReviewModal.tsx:1087`, `components/admin/wizard/Step3SheetCard.tsx:183`, `components/admin/FinalizeButton.tsx:513-539` (race-row link) — remove/repoint the staged-page links (the ResumeFinalizeButton renderer was already deleted in Phase 3).
- Modify: `lib/audit/trustDomains.ts:60-62` (drop staged page entry; keep API entries `:154-170`, `:110-126`).

- [ ] **Step 1: Write the failing test** — extend `tests/admin/step3DeletionSafety.test.ts` (Task 5.2) or add here: assert no source file under `components/`/`app/` contains an in-app `<Link href="/admin/onboarding/staged/...">` literal; assert `trustDomains` no longer lists the staged page path but still lists the API routes. (This test is finalized in Task 5.2; add the link-literal assertion here first so it drives the removals.)

- [ ] **Step 2: Run — verify fail** (links still present).

- [ ] **Step 3: Implement** — delete the page file; remove the `Step3ReviewModal:1087` staged link + `Step3SheetCard:183` link; repoint/remove the `FinalizeButton` race-row link (its `re_apply_url` is covered by the Task 4.1 redirect — leave the link pointing at `re_apply_url` which now 307s to `/admin`, OR remove it; per spec §4.6 the redirect coverage is the minimum). Remove the `trustDomains.ts:60-62` staged page entry.

- [ ] **Step 4: Run — verify pass** + `pnpm tsc --noEmit`.

- [ ] **Step 5: Commit**
```bash
git rm "app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx"
git add components/admin/wizard/Step3ReviewModal.tsx components/admin/wizard/Step3SheetCard.tsx components/admin/FinalizeButton.tsx lib/audit/trustDomains.ts tests/admin/step3DeletionSafety.test.ts
git commit --no-verify -m "feat(admin): delete standalone staged page; remove link-outs + trustDomains entry (spec §4.6)"
```
