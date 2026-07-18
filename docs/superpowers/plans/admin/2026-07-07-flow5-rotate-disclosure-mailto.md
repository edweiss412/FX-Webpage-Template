# Flow 5 — Rotate Re-pick Disclosure + Mailto Re-send Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement spec `docs/superpowers/specs/2026-07-07-flow5-rotate-disclosure-mailto.md` — rotate-confirm re-pick disclosure (audit 5.1) + capped, chunked mailto re-send anchors on the rotate success banner and CurrentShareLinkPanel (audit 5.2).

**Architecture:** One new pure helper module (`crewLinkMailto.ts`) owns filtering/encoding/chunking and all length constants; two existing components render its output; `page.tsx` threads bounded, fail-closed roster emails into both. All admin-only UI; no DB writes, no migrations, no new error codes, no new mutation surfaces.

**Tech Stack:** Next.js 16 app router, React, TypeScript, Vitest + @testing-library/react (jsdom), Tailwind v4 tokens.

## Global Constraints

- All copy strings, constants, and contracts come verbatim from the spec (§2.1–§2.5). Do not improvise copy.
- `MAX_MAILTO_HREF_CHARS = 1900`, `MAILTO_TITLE_MAX_CHARS = 80`, `CREW_ROSTER_READ_CAP = 500` — defined ONCE in `app/admin/show/[slug]/crewLinkMailto.ts`, imported everywhere else (tests included — never re-hardcode).
- Email-shape validator: `/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/` AND length ≤ 254.
- Every emitted mailto href ≤ `MAX_MAILTO_HREF_CHARS`, no exceptions; no recipient silently dropped — all-batched-or-nothing.
- Overflow (> `CREW_ROSTER_READ_CAP` crew rows) fails closed EVERYWHERE visibly: `{ crew: [], crewLookupFailed: true }` + `crewEmails: []`.
- Invariant 9: the widened crew read keeps its `{ data, error }` destructure + try/catch; do NOT insert a comment between `supabase` and `.from` (the `_metaInfraContract` scanner is format-sensitive), and avoid `;` inside comments near Supabase chains (the `_metaBoundedReads` scanner splits statements on `;`).
- Invariant 8: impeccable critique + audit run in Task 5 before cross-model review.
- UI files touched are Opus-owned (this plan's implementer).
- Commits: conventional-commits, one task per commit, `--no-verify` (worktree), each ending with the session trailer already used on this branch.
- No `pg_advisory*` touched — advisory-lock holder topology N/A.

**Meta-test inventory (declared per writing-plans rule):**
- EXTENDS `tests/admin/_metaBoundedReads.test.ts` — adds `app/admin/show/[slug]/page.tsx` to `READ_MODULES` (Task 4). Scanner accepts only `.limit`/`.range`/`count:'exact'`/parent-`.in` as bounds; `.maybeSingle()` does NOT count, so the `shows` lookup gains `.limit(1)`.
- No new `_metaInfraContract` registry row (no new Supabase call site; existing row for this surface at `tests/admin/_metaInfraContract.test.ts:393` stays accurate).
- No `_metaMutationSurfaceObservability` entry (no new mutation surface).
- Layout-dimensions task: N/A — no fixed-dimension parent introduced (intrinsic-height flex rows only, spec §4).
- Transition-audit task: N/A — no new visual states or animations (spec §4: anchors appear/disappear with the existing success banner, instant, like the existing Copy button).

---

### Task 1: `crewLinkMailto.ts` helper + unit tests

**Files:**
- Create: `app/admin/show/[slug]/crewLinkMailto.ts`
- Test: `tests/admin/crewLinkMailto.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces (later tasks import these exactly):
  - `export const MAX_MAILTO_HREF_CHARS = 1900`
  - `export const MAILTO_TITLE_MAX_CHARS = 80`
  - `export const CREW_ROSTER_READ_CAP = 500`
  - `export type CrewLinkMailto = { href: string; batch: number; batchCount: number }`
  - `export function buildCrewLinkMailtos(opts: { emails: readonly string[]; url: string; showTitle: string }): CrewLinkMailto[]`

- [ ] **Step 1: Write the failing test**

Create `tests/admin/crewLinkMailto.test.ts`:

```ts
/**
 * tests/admin/crewLinkMailto.test.ts
 *
 * Pins the mailto builder contract (spec 2026-07-07-flow5-rotate-disclosure-mailto §2.2):
 * shape filter (adversarial R5), dedupe, BCC encoding, deterministic chunking under
 * MAX_MAILTO_HREF_CHARS (R1), unconditional cap via title ladder (R4), [] floor.
 * Failure modes caught: corrupted/injected recipients, silent recipient drops,
 * over-cap hrefs from unbounded titles, affordance rendered with zero recipients.
 */
import { describe, expect, test } from "vitest";

import {
  buildCrewLinkMailtos,
  MAILTO_TITLE_MAX_CHARS,
  MAX_MAILTO_HREF_CHARS,
} from "@/app/admin/show/[slug]/crewLinkMailto";

const URL = "https://crew.fxav.show/show/sample-show/" + "a".repeat(64);
const TITLE = "RPAS Central";

function bccOf(href: string): string {
  const m = href.match(/^mailto:\?bcc=([^&]*)&/);
  expect(m, `href missing bcc: ${href.slice(0, 80)}`).not.toBeNull();
  return m![1]!;
}
function recipientsOf(href: string): string[] {
  return bccOf(href).split(",").map(decodeURIComponent);
}

describe("buildCrewLinkMailtos — filter + dedupe (R5 shape validator)", () => {
  test("empty input → []", () => {
    expect(buildCrewLinkMailtos({ emails: [], url: URL, showTitle: TITLE })).toEqual([]);
  });

  test("all-invalid input → []", () => {
    expect(
      buildCrewLinkMailtos({ emails: ["", "   ", "no-at-sign.com"], url: URL, showTitle: TITLE }),
    ).toEqual([]);
  });

  test.each([
    ["space", "a b@example.com"],
    ["comma", "a,b@example.com"],
    ["CR", "a\rb@example.com"],
    ["LF", "a\nb@example.com"],
    ["question mark", "a?b@example.com"],
    ["ampersand", "a&b@example.com"],
    ["double quote", 'a"b@example.com'],
    ["angle bracket", "a<b@example.com"],
    ["no TLD", "a@localhost"],
    ["over 254 chars", `${"a".repeat(250)}@example.com`],
  ])("rejects %s", (_label, bad) => {
    const out = buildCrewLinkMailtos({
      emails: [bad, "good@example.com"],
      url: URL,
      showTitle: TITLE,
    });
    expect(out).toHaveLength(1);
    expect(recipientsOf(out[0]!.href)).toEqual(["good@example.com"]);
  });

  test("local-part % survives the filter and appears only as %25 in the href", () => {
    const out = buildCrewLinkMailtos({
      emails: ["oc%to@example.com"],
      url: URL,
      showTitle: TITLE,
    });
    expect(out).toHaveLength(1);
    expect(bccOf(out[0]!.href)).toBe("oc%25to%40example.com");
  });

  test("dedupes exact duplicates preserving first-seen order", () => {
    const out = buildCrewLinkMailtos({
      emails: ["b@example.com", "a@example.com", "b@example.com"],
      url: URL,
      showTitle: TITLE,
    });
    expect(recipientsOf(out[0]!.href)).toEqual(["b@example.com", "a@example.com"]);
  });
});

describe("buildCrewLinkMailtos — subject/body encoding", () => {
  test("non-blank title in subject and body; body carries the raw URL exactly once", () => {
    const out = buildCrewLinkMailtos({
      emails: ["a@example.com"],
      url: URL,
      showTitle: TITLE,
    });
    const href = out[0]!.href;
    const subject = decodeURIComponent(href.match(/&subject=([^&]*)/)![1]!);
    const body = decodeURIComponent(href.match(/&body=([^&]*)$/)![1]!);
    expect(subject).toBe(`Crew link — ${TITLE}`);
    expect(body).toBe(
      `Here's the link to your crew page for ${TITLE}:\n\n${URL}\n\nOpen it and pick your name to see your schedule.`,
    );
    expect(body.split(URL)).toHaveLength(2);
  });

  test("blank title → fallback subject, body drops the 'for' fragment", () => {
    const out = buildCrewLinkMailtos({ emails: ["a@example.com"], url: URL, showTitle: "  " });
    const href = out[0]!.href;
    const subject = decodeURIComponent(href.match(/&subject=([^&]*)/)![1]!);
    const body = decodeURIComponent(href.match(/&body=([^&]*)$/)![1]!);
    expect(subject).toBe("Crew link");
    expect(body.startsWith("Here's the link to your crew page:\n\n")).toBe(true);
  });
});

describe("buildCrewLinkMailtos — chunking (R1) and title budget (R4)", () => {
  // Long-but-valid addresses derived so batch boundaries come from the exported
  // constant, never a hardcoded magic count (anti-tautology rule).
  const longAddress = (i: number) => `${"a".repeat(60)}${String(i).padStart(4, "0")}@example.com`;
  const bigRoster = Array.from({ length: 60 }, (_, i) => longAddress(i));

  test("typical roster (40 × ~25 chars) yields exactly one batch", () => {
    const roster = Array.from({ length: 40 }, (_, i) => `crew${String(i).padStart(3, "0")}@example.com`);
    const out = buildCrewLinkMailtos({ emails: roster, url: URL, showTitle: TITLE });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ batch: 1, batchCount: 1 });
    expect(recipientsOf(out[0]!.href)).toEqual(roster);
  });

  test("threshold-crossing roster: >1 batch, every href ≤ cap, every recipient in exactly one batch, consistent batch/batchCount", () => {
    const out = buildCrewLinkMailtos({ emails: bigRoster, url: URL, showTitle: TITLE });
    expect(out.length).toBeGreaterThan(1);
    const seen: string[] = [];
    out.forEach((m, i) => {
      expect(m.href.length).toBeLessThanOrEqual(MAX_MAILTO_HREF_CHARS);
      expect(m.batch).toBe(i + 1);
      expect(m.batchCount).toBe(out.length);
      seen.push(...recipientsOf(m.href));
    });
    expect(seen).toEqual(bigRoster); // complete, in order, no dupes across batches
  });

  test("overlong title is truncated with … in subject AND body; hrefs stay ≤ cap; zero recipients dropped", () => {
    const hugeTitle = "T".repeat(MAILTO_TITLE_MAX_CHARS * 4);
    const out = buildCrewLinkMailtos({ emails: bigRoster, url: URL, showTitle: hugeTitle });
    expect(out.length).toBeGreaterThan(0);
    const truncated = `${"T".repeat(MAILTO_TITLE_MAX_CHARS)}…`;
    const collected: string[] = [];
    for (const m of out) {
      expect(m.href.length).toBeLessThanOrEqual(MAX_MAILTO_HREF_CHARS);
      const subject = decodeURIComponent(m.href.match(/&subject=([^&]*)/)![1]!);
      const body = decodeURIComponent(m.href.match(/&body=([^&]*)$/)![1]!);
      expect(subject).toBe(`Crew link — ${truncated}`);
      expect(body).toContain(` for ${truncated}:`);
      collected.push(...recipientsOf(m.href));
    }
    expect(collected).toEqual(bigRoster);
  });

  test("non-BMP code point AT the truncation boundary: no throw, code-point-safe cut, hrefs ≤ cap (plan R1)", () => {
    // The 80th code point is an emoji (2 code units). A code-UNIT slice(0, 80)
    // would cut the surrogate pair in half and crash encodeURIComponent; a
    // code-POINT slice keeps it whole. Mostly-ASCII so the truncated-title rung
    // stays under the cap and the truncation itself is observable.
    const mixedTitle = `${"T".repeat(MAILTO_TITLE_MAX_CHARS - 1)}😀${"T".repeat(40)}`;
    const out = buildCrewLinkMailtos({ emails: ["a@example.com"], url: URL, showTitle: mixedTitle });
    expect(out).toHaveLength(1);
    expect(out[0]!.href.length).toBeLessThanOrEqual(MAX_MAILTO_HREF_CHARS);
    const subject = decodeURIComponent(out[0]!.href.match(/&subject=([^&]*)/)![1]!);
    expect(subject).toBe(`Crew link — ${"T".repeat(MAILTO_TITLE_MAX_CHARS - 1)}😀…`);
  });

  // Plan adversarial R2 — the MIDDLE ladder rung: truncated title still blows the
  // cap (80 emoji encode to ~12 chars each, ~2000 chars across subject+body), but
  // the blank-title rebuild fits. An implementation that skips the blank rung and
  // returns [] must fail here.
  test("blank-title fallback rung: heavy truncated title exceeds cap, blank title succeeds with all recipients", () => {
    const heavyTitle = "😀".repeat(MAILTO_TITLE_MAX_CHARS + 20);
    const roster = ["a@example.com", "b@example.com", "c@example.com"];
    const out = buildCrewLinkMailtos({ emails: roster, url: URL, showTitle: heavyTitle });
    expect(out.length).toBeGreaterThan(0);
    const collected: string[] = [];
    for (const m of out) {
      expect(m.href.length).toBeLessThanOrEqual(MAX_MAILTO_HREF_CHARS);
      const subject = decodeURIComponent(m.href.match(/&subject=([^&]*)/)![1]!);
      const body = decodeURIComponent(m.href.match(/&body=([^&]*)$/)![1]!);
      expect(subject).toBe("Crew link");
      expect(body.startsWith("Here's the link to your crew page:\n\n")).toBe(true);
      collected.push(...recipientsOf(m.href));
    }
    expect(collected).toEqual(roster);
  });

  test("lone-surrogate title input: no URIError, surrogate replaced with U+FFFD (plan R1)", () => {
    const out = buildCrewLinkMailtos({
      emails: ["a@example.com"],
      url: URL,
      showTitle: "bad\uD800title",
    });
    expect(out).toHaveLength(1);
    const subject = decodeURIComponent(out[0]!.href.match(/&subject=([^&]*)/)![1]!);
    expect(subject).toBe("Crew link — bad\uFFFDtitle");
  });

  test("pathological url that cannot fit one blank-title recipient under the cap → []", () => {
    const monsterUrl = `https://crew.fxav.show/show/x/${"a".repeat(MAX_MAILTO_HREF_CHARS)}`;
    const out = buildCrewLinkMailtos({
      emails: ["a@example.com"],
      url: monsterUrl,
      showTitle: TITLE,
    });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/admin/crewLinkMailto.test.ts`
Expected: FAIL — `Cannot find module '@/app/admin/show/[slug]/crewLinkMailto'` (or equivalent resolve error).

- [ ] **Step 3: Write minimal implementation**

Create `app/admin/show/[slug]/crewLinkMailto.ts`:

```ts
/**
 * app/admin/show/[slug]/crewLinkMailto.ts
 *
 * Pure client-safe builder for the "Email crew the link" affordance
 * (spec docs/superpowers/specs/2026-07-07-flow5-rotate-disclosure-mailto.md §2.2).
 *
 * Contract: every emitted href is ≤ MAX_MAILTO_HREF_CHARS, no exceptions, and
 * no recipient is ever silently dropped — either all filtered recipients are
 * batched under the cap or nothing renders ([]).
 */

export const MAX_MAILTO_HREF_CHARS = 1900;
export const MAILTO_TITLE_MAX_CHARS = 80;
// Completeness bound for the page's crew_members read: a distribution list must
// be provably complete or absent, never silently partial (spec §2.5).
export const CREW_ROSTER_READ_CAP = 500;

const MAX_EMAIL_CHARS = 254;
// Conservative practical email shape (adversarial R5). Rejects whitespace,
// control characters, commas, '?', '&', quotes, angle brackets. '%' is legal in
// the local part and is neutralized by encodeURIComponent ('%' → '%25').
const EMAIL_SHAPE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// Unpaired surrogates (external sheet text can carry them) would make
// encodeURIComponent throw "URI malformed" — replace with U+FFFD first.
const UNPAIRED_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export type CrewLinkMailto = { href: string; batch: number; batchCount: number };

function subjectFor(title: string): string {
  return title.length > 0 ? `Crew link — ${title}` : "Crew link";
}

function bodyFor(title: string, url: string): string {
  const forFragment = title.length > 0 ? ` for ${title}` : "";
  return `Here's the link to your crew page${forFragment}:\n\n${url}\n\nOpen it and pick your name to see your schedule.`;
}

function hrefFor(encodedBcc: string, title: string, url: string): string {
  const subject = encodeURIComponent(subjectFor(title));
  const body = encodeURIComponent(bodyFor(title, url));
  return `mailto:?bcc=${encodedBcc}&subject=${subject}&body=${body}`;
}

export function buildCrewLinkMailtos({
  emails,
  url,
  showTitle,
}: {
  emails: readonly string[];
  url: string;
  showTitle: string;
}): CrewLinkMailto[] {
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const raw of emails) {
    if (!raw || raw.length > MAX_EMAIL_CHARS || !EMAIL_SHAPE.test(raw)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    recipients.push(raw);
  }
  if (recipients.length === 0) return [];

  const trimmed = showTitle.replace(UNPAIRED_SURROGATE, "\uFFFD").trim();
  // Truncate by CODE POINT, not code unit — a .slice() cutting a surrogate
  // pair would itself mint a lone surrogate and crash the encoder.
  const codePoints = Array.from(trimmed);
  const effectiveTitle =
    codePoints.length > MAILTO_TITLE_MAX_CHARS
      ? `${codePoints.slice(0, MAILTO_TITLE_MAX_CHARS).join("")}…`
      : trimmed;

  // Title ladder (adversarial R4): truncated title → blank title → [].
  // A rung is viable only if EVERY recipient fits a single-recipient href under
  // the cap — that guarantee makes the greedy packer below cap-safe per batch.
  for (const title of [effectiveTitle, ""]) {
    const worstSingle = recipients.reduce(
      (max, r) => Math.max(max, hrefFor(encodeURIComponent(r), title, url).length),
      0,
    );
    if (worstSingle > MAX_MAILTO_HREF_CHARS) {
      if (title === "") return [];
      continue;
    }
    const batches: string[][] = [];
    let current: string[] = [];
    for (const r of recipients) {
      const candidate = [...current, r];
      const href = hrefFor(candidate.map(encodeURIComponent).join(","), title, url);
      if (href.length <= MAX_MAILTO_HREF_CHARS) {
        current = candidate;
      } else {
        batches.push(current);
        current = [r];
      }
    }
    batches.push(current);
    return batches.map((batch, i) => ({
      href: hrefFor(batch.map(encodeURIComponent).join(","), title, url),
      batch: i + 1,
      batchCount: batches.length,
    }));
  }
  return [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/admin/crewLinkMailto.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add app/admin/show/\[slug\]/crewLinkMailto.ts tests/admin/crewLinkMailto.test.ts
git commit --no-verify -m "feat(admin): crewLinkMailto builder — capped chunked BCC mailto for crew link re-send"
```

---

### Task 2: RotateShareTokenButton — disclosure copy + mailto anchors

**Files:**
- Modify: `app/admin/show/[slug]/RotateShareTokenButton.tsx`
- Test: `tests/components/RotateShareTokenButton.test.tsx`

**Interfaces:**
- Consumes: `buildCrewLinkMailtos`, `CrewLinkMailto` from Task 1.
- Produces: `RotateShareTokenButton` accepts new optional props `crewEmails?: readonly string[]` (default `[]`) and `showTitle?: string` (default `""`). New testid `admin-rotate-share-token-email-button` (one element per batch).

- [ ] **Step 1: Write the failing tests**

Append to `tests/components/RotateShareTokenButton.test.tsx` (inside the file, after the existing describes; reuse the existing `idleBtn`/`confirmBtn` helpers and mocks). Also add the helper import at the top of the file with the other imports:

```ts
import { buildCrewLinkMailtos } from "@/app/admin/show/[slug]/crewLinkMailto";
```

```ts
// Flow 5 (audit 5.1 + 5.2) — re-pick disclosure + mailto re-send anchors.
// Spec docs/superpowers/specs/2026-07-07-flow5-rotate-disclosure-mailto.md §2.1/§2.3/§6.2.
describe("RotateShareTokenButton — Flow 5 disclosure + email crew anchors", () => {
  const CREW_EMAILS = ["a@example.com", "b@example.com"];
  const SHOW_TITLE = "RPAS Central";

  const mockRotateOk = () => {
    (rotateShareToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      new_share_token: NEW_TOKEN,
      new_epoch: 4,
    });
  };
  const clickThroughToSuccess = async () => {
    fireEvent.click(idleBtn());
    await act(async () => {
      fireEvent.click(confirmBtn());
      vi.useRealTimers();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => screen.getByTestId("admin-rotate-share-token-ok"));
  };

  test("confirm warning discloses the re-pick consequence (audit 5.1)", () => {
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} />);
    fireEvent.click(idleBtn());
    const warning = document.getElementById("admin-rotate-share-token-warning");
    expect(warning?.textContent).toBe(
      "The existing show URL will stop working. Every crew member will need the new URL and will have to re-pick their name.",
    );
  });

  test("success banner lead line includes the re-pick reminder", async () => {
    mockRotateOk();
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} />);
    await clickThroughToSuccess();
    expect(screen.getByTestId("admin-rotate-share-token-ok").textContent).toContain(
      "the old link no longer works and everyone will re-pick their name",
    );
  });

  test("success: renders one 'Email crew' anchor whose href equals the helper output (data-source assertion)", async () => {
    mockRotateOk();
    render(
      <RotateShareTokenButton
        showId={SHOW_ID}
        slug={SLUG}
        crewEmails={CREW_EMAILS}
        showTitle={SHOW_TITLE}
      />,
    );
    await clickThroughToSuccess();
    const url = screen.getByTestId("admin-rotate-share-token-url").textContent!;
    const expected = buildCrewLinkMailtos({ emails: CREW_EMAILS, url, showTitle: SHOW_TITLE });
    expect(expected).toHaveLength(1);
    const anchors = screen.getAllByTestId("admin-rotate-share-token-email-button");
    expect(anchors).toHaveLength(1);
    expect(anchors[0]!.getAttribute("href")).toBe(expected[0]!.href);
    expect(anchors[0]!.textContent).toContain("Email crew");
    expect(anchors[0]!.textContent).not.toMatch(/\(\d+ of \d+\)/);
  });

  // Adversarial R2 — an implementation rendering only mailtos[0] must fail.
  test("multi-batch roster: anchor count, (N of M) labels, and hrefs match every helper batch", async () => {
    const bigRoster = Array.from(
      { length: 60 },
      (_, i) => `${"a".repeat(60)}${String(i).padStart(4, "0")}@example.com`,
    );
    mockRotateOk();
    render(
      <RotateShareTokenButton
        showId={SHOW_ID}
        slug={SLUG}
        crewEmails={bigRoster}
        showTitle={SHOW_TITLE}
      />,
    );
    await clickThroughToSuccess();
    const url = screen.getByTestId("admin-rotate-share-token-url").textContent!;
    const expected = buildCrewLinkMailtos({ emails: bigRoster, url, showTitle: SHOW_TITLE });
    expect(expected.length).toBeGreaterThan(1);
    const anchors = screen.getAllByTestId("admin-rotate-share-token-email-button");
    expect(anchors).toHaveLength(expected.length);
    expected.forEach((m, i) => {
      expect(anchors[i]!.getAttribute("href")).toBe(m.href);
      expect(anchors[i]!.textContent).toContain(`Email crew (${m.batch} of ${m.batchCount})`);
    });
  });

  test("no crewEmails prop → no email anchor", async () => {
    mockRotateOk();
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} />);
    await clickThroughToSuccess();
    expect(screen.queryByTestId("admin-rotate-share-token-email-button")).toBeNull();
  });

  test("crewEmails=[] → no email anchor", async () => {
    mockRotateOk();
    render(
      <RotateShareTokenButton showId={SHOW_ID} slug={SLUG} crewEmails={[]} showTitle={SHOW_TITLE} />,
    );
    await clickThroughToSuccess();
    expect(screen.queryByTestId("admin-rotate-share-token-email-button")).toBeNull();
  });

  test("inactive crew link (isCrewLinkActive=false) → rotated-inactive message, no email anchor", async () => {
    mockRotateOk();
    render(
      <RotateShareTokenButton
        showId={SHOW_ID}
        slug={SLUG}
        isCrewLinkActive={false}
        crewEmails={CREW_EMAILS}
        showTitle={SHOW_TITLE}
      />,
    );
    fireEvent.click(idleBtn());
    await act(async () => {
      fireEvent.click(confirmBtn());
      vi.useRealTimers();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => screen.getByTestId("admin-rotate-share-token-ok-inactive"));
    expect(screen.queryByTestId("admin-rotate-share-token-email-button")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm vitest run tests/components/RotateShareTokenButton.test.tsx`
Expected: the new describe FAILS (warning text mismatch; `admin-rotate-share-token-email-button` not found). All pre-existing tests still PASS.

- [ ] **Step 3: Implement**

In `app/admin/show/[slug]/RotateShareTokenButton.tsx`:

(a) Imports — add `Mail` to the lucide import and import the helper:

```ts
import { AlertTriangle, Mail, RotateCcw } from "lucide-react";

import { buildCrewLinkMailtos } from "./crewLinkMailto";
```

(b) Props — extend the signature (after `rowDescription` in both the destructure and the type):

```ts
export function RotateShareTokenButton({
  showId,
  slug,
  isCrewLinkActive = true,
  compact = false,
  rowLabel,
  rowDescription,
  crewEmails = [],
  showTitle = "",
}: {
  // ...existing prop types unchanged...
  /**
   * Flow 5 (audit 5.2) — validated roster emails for the post-rotate
   * "Email crew" re-send anchors. Empty/omitted hides the affordance.
   */
  crewEmails?: readonly string[];
  showTitle?: string;
}) {
```

(c) Derive batches — directly after the `newUrl` const (`RotateShareTokenButton.tsx:160-163`):

```ts
  const emailMailtos = newUrl
    ? buildCrewLinkMailtos({ emails: crewEmails, url: newUrl, showTitle })
    : [];
```

(d) Copy change — success banner lead line (currently line 220):

```tsx
            New share-link ready. Send the URL below to crew; the old link no longer works and
            everyone will re-pick their name.
```

(e) Anchors — inside the success banner `div` (`data-testid="admin-rotate-share-token-ok"`), directly after the URL/Copy row's closing `</div>` and before the sr-only copy-announce span:

```tsx
          {emailMailtos.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {emailMailtos.map((m) => (
                <a
                  key={m.batch}
                  href={m.href}
                  data-testid="admin-rotate-share-token-email-button"
                  className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center gap-1.5 rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  <Mail aria-hidden="true" size={14} />
                  {m.batchCount === 1 ? "Email crew" : `Email crew (${m.batch} of ${m.batchCount})`}
                </a>
              ))}
            </div>
          )}
```

(f) Copy change — confirm warning paragraph (currently lines 296-298; keep the id):

```tsx
    <p id="admin-rotate-share-token-warning" className="text-sm text-text-subtle">
      The existing show URL will stop working. Every crew member will need the new URL and will
      have to re-pick their name.
    </p>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/components/RotateShareTokenButton.test.tsx`
Expected: PASS (new + all pre-existing).

- [ ] **Step 5: Commit**

```bash
git add app/admin/show/\[slug\]/RotateShareTokenButton.tsx tests/components/RotateShareTokenButton.test.tsx
git commit --no-verify -m "feat(admin): rotate re-pick disclosure + post-rotate Email-crew anchors (Flow 5.1/5.2)"
```

---

### Task 3: CurrentShareLinkPanel — persistent mailto anchors

**Files:**
- Modify: `app/admin/show/[slug]/CurrentShareLinkPanel.tsx`
- Test: `tests/components/CurrentShareLinkPanel.test.tsx`

**Interfaces:**
- Consumes: `buildCrewLinkMailtos` from Task 1.
- Produces: `CurrentShareLinkPanel` accepts new optional props `crewEmails?: readonly string[]` (default `[]`) and `showTitle?: string` (default `""`). New testid `admin-current-share-link-email-button` (one element per batch).

- [ ] **Step 1: Write the failing tests**

Append to `tests/components/CurrentShareLinkPanel.test.tsx` (reuse existing mocks/constants; add the helper import next to the existing imports):

```ts
import { buildCrewLinkMailtos } from "@/app/admin/show/[slug]/crewLinkMailto";
```

```ts
// Flow 5 (audit 5.2) — persistent "Email this link to crew" anchors.
// Spec docs/superpowers/specs/2026-07-07-flow5-rotate-disclosure-mailto.md §2.4/§6.3.
describe("<CurrentShareLinkPanel> — email-crew anchors", () => {
  const CREW_EMAILS = ["a@example.com", "b@example.com"];
  const SHOW_TITLE = "RPAS Central";

  test("token + emails → single anchor with helper-derived href", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
    const { getAllByTestId } = render(
      await CurrentShareLinkPanel({
        showId: SHOW_ID,
        slug: SLUG,
        token: TOKEN,
        crewEmails: CREW_EMAILS,
        showTitle: SHOW_TITLE,
      }),
    );
    const url = `https://crew.fxav.show/show/${SLUG}/${TOKEN}`;
    const expected = buildCrewLinkMailtos({ emails: CREW_EMAILS, url, showTitle: SHOW_TITLE });
    expect(expected).toHaveLength(1);
    const anchors = getAllByTestId("admin-current-share-link-email-button");
    expect(anchors).toHaveLength(1);
    expect(anchors[0]!.getAttribute("href")).toBe(expected[0]!.href);
    expect(anchors[0]!.textContent).toContain("Email this link to crew");
    expect(anchors[0]!.textContent).not.toMatch(/\(\d+ of \d+\)/);
  });

  // Adversarial R2 — an implementation rendering only mailtos[0] must fail.
  test("multi-batch roster: anchor count, (N of M) labels, hrefs match every helper batch", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
    const bigRoster = Array.from(
      { length: 60 },
      (_, i) => `${"a".repeat(60)}${String(i).padStart(4, "0")}@example.com`,
    );
    const { getAllByTestId } = render(
      await CurrentShareLinkPanel({
        showId: SHOW_ID,
        slug: SLUG,
        token: TOKEN,
        crewEmails: bigRoster,
        showTitle: SHOW_TITLE,
      }),
    );
    const url = `https://crew.fxav.show/show/${SLUG}/${TOKEN}`;
    const expected = buildCrewLinkMailtos({ emails: bigRoster, url, showTitle: SHOW_TITLE });
    expect(expected.length).toBeGreaterThan(1);
    const anchors = getAllByTestId("admin-current-share-link-email-button");
    expect(anchors).toHaveLength(expected.length);
    expected.forEach((m, i) => {
      expect(anchors[i]!.getAttribute("href")).toBe(m.href);
      expect(anchors[i]!.textContent).toContain(
        `Email this link to crew (${m.batch} of ${m.batchCount})`,
      );
    });
  });

  test("token + no emails → no anchor", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
    const { queryByTestId } = render(
      await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG, token: TOKEN, crewEmails: [] }),
    );
    expect(queryByTestId("admin-current-share-link-email-button")).toBeNull();
  });

  test("unavailable branch (token null) → no anchor even with emails", async () => {
    const { queryByTestId, getByTestId } = render(
      await CurrentShareLinkPanel({
        showId: SHOW_ID,
        slug: SLUG,
        token: null,
        crewEmails: CREW_EMAILS,
        showTitle: SHOW_TITLE,
      }),
    );
    expect(getByTestId("admin-current-share-link-unavailable")).toBeTruthy();
    expect(queryByTestId("admin-current-share-link-email-button")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm vitest run tests/components/CurrentShareLinkPanel.test.tsx`
Expected: new describe FAILS (`admin-current-share-link-email-button` not found); pre-existing tests PASS.

- [ ] **Step 3: Implement**

In `app/admin/show/[slug]/CurrentShareLinkPanel.tsx`:

(a) Imports — add next to the `resolveOrigin` import:

```ts
import { Mail } from "lucide-react";

import { buildCrewLinkMailtos } from "./crewLinkMailto";
```

(b) Props — extend the signature:

```ts
export async function CurrentShareLinkPanel({
  showId,
  slug,
  token: tokenProp,
  actions,
  crewEmails = [],
  showTitle = "",
}: {
  // ...existing prop types unchanged...
  /**
   * Flow 5 (audit 5.2) — validated roster emails for the persistent
   * "Email this link to crew" anchors. Empty/omitted hides the affordance.
   */
  crewEmails?: readonly string[];
  showTitle?: string;
}) {
```

(c) In the token-present branch, after `const url = ...` (line 93):

```ts
  const emailMailtos = buildCrewLinkMailtos({ emails: crewEmails, url, showTitle });
```

(d) Render — directly after the URL/Copy row `div` (lines 104-112) and before `{actions}`:

```tsx
      {emailMailtos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {emailMailtos.map((m) => (
            <a
              key={m.batch}
              href={m.href}
              data-testid="admin-current-share-link-email-button"
              className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center gap-1.5 rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <Mail aria-hidden="true" size={14} />
              {m.batchCount === 1
                ? "Email this link to crew"
                : `Email this link to crew (${m.batch} of ${m.batchCount})`}
            </a>
          ))}
        </div>
      )}
```

The token-unavailable branch is untouched (no anchor there by construction).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/components/CurrentShareLinkPanel.test.tsx`
Expected: PASS (new + pre-existing).

- [ ] **Step 5: Commit**

```bash
git add app/admin/show/\[slug\]/CurrentShareLinkPanel.tsx tests/components/CurrentShareLinkPanel.test.tsx
git commit --no-verify -m "feat(admin): persistent Email-this-link-to-crew anchors on share-link panel (Flow 5.2)"
```

---

### Task 4: page.tsx threading — widened bounded crew read, fail-closed overflow, prop threading, meta-test registration

**Files:**
- Modify: `app/admin/show/[slug]/page.tsx`
- Modify: `tests/admin/_metaBoundedReads.test.ts` (READ_MODULES entry)
- Test: `tests/app/admin/perShowPage.test.tsx`

**Interfaces:**
- Consumes: `CREW_ROSTER_READ_CAP` from Task 1; the Task 2/3 props (`crewEmails`, `showTitle`).
- Produces: page-level guarantee — both components receive fixture-derived non-null emails + `show.title`, or `[]` when the roster read failed/overflowed.

- [ ] **Step 1: Write the failing tests**

In `tests/app/admin/perShowPage.test.tsx`:

(a) Mock builder — record AND apply the limit like PostgREST would (plan adversarial R1: a passthrough would let a wrong `.limit(N)` pass; the mock must truncate). Add `limitByTable: {} as Record<string, number>` to the `state` object (and reset it to `{}` in the same `beforeEach` that resets `selectColsByTable`), then beside the other builder methods (around line 123):

```ts
      builder.limit = (n: number) => {
        state.limitByTable[table] = n;
        return builder;
      };
```

and in the builder's `then` resolver, make `crew_members` respect the recorded limit exactly as PostgREST truncates:

```ts
        const data =
          table === "crew_members"
            ? state.crew.slice(
                0,
                state.limitByTable[table] === undefined ? state.crew.length : state.limitByTable[table],
              )
            : // ...existing branches unchanged...
```

(b) Extend the `CurrentShareLinkPanel` stub (around line 52) so prop threading is observable — replace the stub factory's component with:

```ts
    CurrentShareLinkPanel: (props: {
      actions?: React.ReactNode;
      crewEmails?: readonly string[];
      showTitle?: string;
    }) =>
      React.createElement(
        "div",
        {
          "data-testid": "admin-current-share-link-panel",
          "data-crew-emails": JSON.stringify(props.crewEmails ?? null),
          "data-show-title": props.showTitle ?? "",
        },
        props.actions,
      ),
```

(c) Add a `RotateShareTokenButton` stub (new `vi.mock`, next to the panel stub). It keeps the real testid so every existing presence/absence assertion still exercises the page's gating, and exposes the two new props as data attributes (adversarial R3 — component-level tests cannot catch the page forgetting to pass them):

```ts
vi.mock("@/app/admin/show/[slug]/RotateShareTokenButton", async () => {
  const React = await import("react");
  return {
    RotateShareTokenButton: (props: {
      crewEmails?: readonly string[];
      showTitle?: string;
    }) =>
      React.createElement("button", {
        "data-testid": "admin-rotate-share-token-button",
        "data-crew-emails": JSON.stringify(props.crewEmails ?? null),
        "data-show-title": props.showTitle ?? "",
      }),
  };
});
```

(d) New describe (place near the existing crew-lookup tests):

```ts
// Flow 5 (audit 5.2) — crew-email threading into the share-link surfaces.
// Spec docs/superpowers/specs/2026-07-07-flow5-rotate-disclosure-mailto.md §2.5/§6.4.
describe("per-show page — crew email threading (Flow 5)", () => {
  it("crew_members select is widened to include email", async () => {
    await renderPage();
    expect(state.selectColsByTable.crew_members).toBe("id, name, role, email");
  });

  // Plan adversarial R1 — pin the EXACT bound: .limit(CREW_ROSTER_READ_CAP) or
  // .limit(1) would truncate in production and silently skip the overflow branch.
  it("crew_members read requests exactly CREW_ROSTER_READ_CAP + 1 rows", async () => {
    await renderPage();
    expect(state.limitByTable.crew_members).toBe(CREW_ROSTER_READ_CAP + 1);
  });

  it("threads fixture-derived non-null emails + show.title into BOTH share surfaces (null emails dropped)", async () => {
    state.crew = [
      { id: "c1", name: "Ann", role: "A1", email: "ann@example.com" },
      { id: "c2", name: "Bob", role: "A2", email: null },
      { id: "c3", name: "Cal", role: "V1", email: "cal@example.com" },
    ];
    await renderPage();
    const expectedEmails = state.crew
      .map((c) => c.email)
      .filter((e): e is string => typeof e === "string");
    const rotate = screen.getByTestId("admin-rotate-share-token-button");
    expect(JSON.parse(rotate.getAttribute("data-crew-emails")!)).toEqual(expectedEmails);
    expect(rotate.getAttribute("data-show-title")).toBe(String(baseShow.title));
    const panel = screen.getByTestId("admin-current-share-link-panel");
    expect(JSON.parse(panel.getAttribute("data-crew-emails")!)).toEqual(expectedEmails);
    expect(panel.getAttribute("data-show-title")).toBe(String(baseShow.title));
  });

  // Adversarial R6/R7 — row-cap overflow fails closed EVERYWHERE, visibly.
  it("roster over CREW_ROSTER_READ_CAP → visible crew-unavailable alert, empty crewEmails on both surfaces", async () => {
    // Seed MORE than the requested bound so the PostgREST-faithful mock returns
    // exactly CREW_ROSTER_READ_CAP + 1 rows (the truncated page) and the
    // overflow branch must fire on rows.length > CREW_ROSTER_READ_CAP.
    state.crew = Array.from({ length: CREW_ROSTER_READ_CAP + 50 }, (_, i) => ({
      id: `c${i}`,
      name: `Crew ${i}`,
      role: "A1",
      email: `crew${i}@example.com`,
    }));
    await renderPage();
    expect(screen.getByTestId("per-show-crew-lookup-failed")).toBeInTheDocument();
    const rotate = screen.getByTestId("admin-rotate-share-token-button");
    expect(JSON.parse(rotate.getAttribute("data-crew-emails")!)).toEqual([]);
    const panel = screen.getByTestId("admin-current-share-link-panel");
    expect(JSON.parse(panel.getAttribute("data-crew-emails")!)).toEqual([]);
  });

  it("crew lookup returned-error still yields empty crewEmails (existing fail path unchanged)", async () => {
    state.errorOnFromTable = "crew_members";
    await renderPage();
    const rotate = screen.getByTestId("admin-rotate-share-token-button");
    expect(JSON.parse(rotate.getAttribute("data-crew-emails")!)).toEqual([]);
  });
});
```

Add the import at the top of the file:

```ts
import { CREW_ROSTER_READ_CAP } from "@/app/admin/show/[slug]/crewLinkMailto";
```

(e) `tests/admin/_metaBoundedReads.test.ts` — add to `READ_MODULES` (after the bell route entry, with a one-line comment):

```ts
  // Flow 5 — per-show page: crew_members roster read feeds the mailto
  // distribution list, bounded by CREW_ROSTER_READ_CAP + 1 (fail-closed on
  // overflow) and the shows lookup carries .limit(1)
  "app/admin/show/[slug]/page.tsx",
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm vitest run tests/app/admin/perShowPage.test.tsx tests/admin/_metaBoundedReads.test.ts`
Expected: the new page describe FAILS (select cols mismatch, missing data attrs); `_metaBoundedReads` FAILS on `from("shows")` and `from("crew_members")` reads having no bound. Pre-existing page tests PASS (stubs preserve testids).

- [ ] **Step 3: Implement**

In `app/admin/show/[slug]/page.tsx`:

(a) Import (with the other local imports):

```ts
import { CREW_ROSTER_READ_CAP } from "./crewLinkMailto";
```

(b) `CrewMemberRow` (lines 96-100) gains the column:

```ts
type CrewMemberRow = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
};
```

(c) `shows` lookup (lines 167-172): add `.limit(1)` immediately before `.maybeSingle<ShowLookupRow>()` (semantic no-op; required because the bounded-reads scanner does not count `.maybeSingle()` as a bound).

(d) `readCrew` (lines 244-276): change the declared return type from `PerShowCrewRow[]` to `CrewMemberRow[]`, widen the select, bound it, and fail closed on overflow. The full replacement body:

```ts
  const readCrew = async (): Promise<{ crew: CrewMemberRow[]; crewLookupFailed: boolean }> => {
    try {
      const { data, error } = await supabase
        .from("crew_members")
        .select("id, name, role, email")
        .eq("show_id", show.id)
        .order("name", { ascending: true })
        .limit(CREW_ROSTER_READ_CAP + 1)
        .returns<CrewMemberRow[]>();
      if (error) {
        void log.error("crew_members lookup failed:", {
          source: "admin.show",
          code: "ADMIN_SHOW_CREW_LOOKUP_FAILED",
          slug,
          showId: show.id,
          error: error.message,
        });
        return { crew: [], crewLookupFailed: true };
      }
      const rows = data ?? [];
      if (rows.length > CREW_ROSTER_READ_CAP) {
        // Flow 5 adversarial R6/R7 — the roster MAY be incomplete at the
        // PostgREST row cap. A distribution list must be provably complete or
        // absent, and the display must never be silently partial: reuse the
        // existing visible crew-unavailable state.
        void log.error("crew_members roster exceeded read cap:", {
          source: "admin.show",
          code: "ADMIN_SHOW_CREW_LOOKUP_FAILED",
          slug,
          showId: show.id,
          error: `roster > CREW_ROSTER_READ_CAP (${CREW_ROSTER_READ_CAP})`,
        });
        return { crew: [], crewLookupFailed: true };
      }
      return { crew: rows, crewLookupFailed: false };
    } catch (err) {
      void log.error("crew_members lookup threw:", {
        source: "admin.show",
        code: "ADMIN_SHOW_CREW_LOOKUP_THREW",
        slug,
        showId: show.id,
        error: err,
      });
      return { crew: [], crewLookupFailed: true };
    }
  };
```

(e) Derive the distribution list once, next to where `crew` is destructured from `readCrew`'s result:

```ts
  const crewEmails = crew
    .map((c) => c.email)
    .filter((e): e is string => e !== null && e.includes("@"));
```

(f) Thread props (lines 787-806): add to `<CurrentShareLinkPanel …>`:

```tsx
              crewEmails={crewEmails}
              showTitle={show.title}
```

and to `<RotateShareTokenButton …>`:

```tsx
                    crewEmails={crewEmails}
                    showTitle={show.title}
```

`PickerResetControl` keeps receiving `crew` unchanged (`CrewMemberRow` is a structural superset of `PerShowCrewRow`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/app/admin/perShowPage.test.tsx tests/admin/_metaBoundedReads.test.ts tests/admin/_metaInfraContract.test.ts`
Expected: ALL PASS (including the infra-contract meta-test — the widened read keeps its destructure/try-catch shape).

- [ ] **Step 5: Commit**

```bash
git add app/admin/show/\[slug\]/page.tsx tests/app/admin/perShowPage.test.tsx tests/admin/_metaBoundedReads.test.ts
git commit --no-verify -m "feat(admin): thread bounded fail-closed crew emails into share-link surfaces (Flow 5.2)"
```

---

### Task 5: Repo gates — full suite, typecheck, lint, format, impeccable dual-gate

**Files:**
- None created; fixes land where gates point.

- [ ] **Step 1: Full test suite**

Run: `pnpm test`
Expected: PASS (memory lesson: scoped gates miss shared-chokepoint regressions). Fix anything red before proceeding.

- [ ] **Step 2: Typecheck + lint + format**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: all clean (vitest strips types — typecheck is not optional; CI `quality` runs eslint incl. `better-tailwindcss/enforce-canonical-classes`; `--no-verify` bypassed prettier so `format:check` must run).

- [ ] **Step 3: Impeccable dual-gate (invariant 8)**

Run `/impeccable critique` AND `/impeccable audit` on the affected diff (UI files: `RotateShareTokenButton.tsx`, `CurrentShareLinkPanel.tsx`, `page.tsx`). HIGH/CRITICAL findings fixed or deferred via `DEFERRED.md` entry. Findings + dispositions recorded for the PR body.

- [ ] **Step 4: Commit any gate fixes**

```bash
git add -A && git commit --no-verify -m "fix(admin): impeccable/gate findings for Flow 5 share-link surfaces"
```

(Skip if no findings required changes.)

---

## Self-review notes

- **Spec coverage:** §2.1 → Task 2 (d)/(f); §2.2 → Task 1; §2.3 → Task 2 (e); §2.4 → Task 3; §2.5 → Task 4; §3 guard table → Tasks 1-4 tests; §6 tests 1-4 → Tasks 1-4 step 1; §7 meta inventory → Task 4 (e); §8 → Task 5.
- **Anti-tautology:** component hrefs assert against `buildCrewLinkMailtos` output (the data source), whose own encoding/chunking is pinned independently in Task 1; batch fixtures derive from exported constants; page threading asserts fixture-derived expected arrays.
- **Type consistency:** `crewEmails?: readonly string[]` + `showTitle?: string` identical across Tasks 2/3/4; `CrewLinkMailto` produced in Task 1 and consumed by name in Tasks 2/3.
