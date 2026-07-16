# Notify Email Batching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Batch same-group realtime notify candidates into one email per recipient per cron tick, per the approved spec `docs/superpowers/specs/2026-07-16-notify-email-batching.md`.

**Architecture:** Recipient-first restructure of `deliverRealtimeCandidates` (`lib/notify/deliver.ts`): per-candidate eligibility collects members into three groups (published / sync_problems / stuck_files), one provider send per non-empty group with a membership-derived idempotency key, per-member ledger rows sharing the `provider_message_id`. The whole pass is single-flight behind `pg_try_advisory_xact_lock(hashtext('notify:realtime-delivery'))` on a dedicated lock client with a heartbeat before each send. N=1 renders existing single templates and provider keys byte-identical.

**Tech Stack:** TypeScript, postgres.js, Resend, Vitest.

## Global Constraints (from spec + AGENTS.md)

- TDD per task: failing test → minimal implementation → green → commit (`<type>(<scope>): <summary>`, scope `notify` unless noted; `--no-verify` on commits in this worktree).
- N=1 byte-parity: single-member batches must render today's exact templates and produce today's exact idempotency keys — existing `tests/notify/` template/idempotency expectations stay green UNMODIFIED.
- No raw error codes in email copy — every problem line goes through `messageFor`/`plainCatalogText`/`resolveIngestionCopy` (invariant 5).
- Per-member `email_deliveries` rows keep today's exact shape; unique key `(kind, dedup_key, recipient)`; no schema change.
- Advisory-lock single-holder: hashkey `notify:realtime-delivery` has exactly ONE holder (JS-side, `deliverRealtimeCandidates`), transaction-scoped, dedicated lock client. No other layer may acquire it.
- `BATCH_EMAIL_MAX_ITEMS = 20`, display-only truncation.
- Counts (`sent`/`failed`/`skipped`/`retryLater`) stay per member; `failed` counts only LANDED failed-row writes; guard-suppressed writes count `skipped`.
- Raw bearer tokens never persist; per-recipient rendering only after canonicalization + active check (R17).

**Meta-test inventory (declared):** No new registries created or extended, EXCEPT a new structural single-holder scan test for the advisory-lock key (Task 6) — modeled on the walker style of `tests/auth/advisoryLockRpcDeadlock.test.ts` but scoped to the new key (the show:* topology test is untouched; namespaces are disjoint). After every `lib/notify/deliver.ts` edit, re-run `pnpm vitest run tests/notify/_metaInfraContract.test.ts tests/notify/resend-dep.test.ts` (structural meta-tests are comment/format fragile).

**Advisory-lock holder topology (mandatory declaration):** `rg "pg_advisory|pg_try_advisory" lib/ supabase/` today shows only `show:<drive_file_id>`-keyed holders (JS wrapper + RPC layer) — zero holders of `notify:realtime-delivery`. New code introduces exactly one: the `lockSql.begin` block in `deliverRealtimeCandidates`. `deliverDigest` and all other notify code MUST NOT acquire it.

---

### Task 1: `combinedDedupKey` helper

**Files:**
- Modify: `lib/notify/idempotencyKey.ts`
- Test: `tests/notify/idempotencyKey.test.ts`

**Interfaces:**
- Produces: `combinedDedupKey(dedupKeys: string[]): string` — sorted copy joined with `"|"`. Callers pass the result as the `dedupKey` argument of the existing `baseKey`/`reissueKey`.

- [ ] **Step 1: Write the failing tests** (append to `tests/notify/idempotencyKey.test.ts`)

```ts
import { baseKey, combinedDedupKey } from "@/lib/notify/idempotencyKey";

describe("combinedDedupKey (batching spec §2.2)", () => {
  test("single member is the identity — N=1 provider key is byte-identical to today's", () => {
    const member = "show-1:SHEET_UNAVAILABLE:1780000000123000";
    expect(combinedDedupKey([member])).toBe(member);
    expect(baseKey("realtime_problem", combinedDedupKey([member]), "doug@fxav.net")).toBe(
      baseKey("realtime_problem", member, "doug@fxav.net"),
    );
  });

  test("membership order does not matter (sort determinism)", () => {
    const a = ["k-b", "k-a", "k-c"];
    const b = ["k-c", "k-a", "k-b"];
    expect(combinedDedupKey(a)).toBe(combinedDedupKey(b));
    expect(combinedDedupKey(a)).toBe("k-a|k-b|k-c");
  });

  test("does not mutate its input", () => {
    const keys = ["k-b", "k-a"];
    combinedDedupKey(keys);
    expect(keys).toEqual(["k-b", "k-a"]);
  });

  test("provider key length is constant at any N (25 members)", () => {
    const members = Array.from({ length: 25 }, (_, i) => `show-${i}:CODE:17800000${i}`);
    const key = baseKey("realtime_problem", combinedDedupKey(members), "doug@fxav.net");
    expect(key).toMatch(/^fxav:realtime_problem:[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run tests/notify/idempotencyKey.test.ts` → FAIL (`combinedDedupKey` not exported).

- [ ] **Step 3: Implement** (append to `lib/notify/idempotencyKey.ts`)

```ts
/** Batch membership identity (batching spec §2.2): sorted member dedup keys joined
 * with "|" (no member key can contain "|"). A single member is the identity, so an
 * N=1 batch's provider key is byte-identical to the historical per-candidate key. */
export function combinedDedupKey(dedupKeys: string[]): string {
  return [...dedupKeys].sort().join("|");
}
```

- [ ] **Step 4: Run to verify pass** — same command → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit --no-verify -m "feat(notify): combinedDedupKey batch identity helper"`

---

### Task 2: `BATCH_EMAIL_MAX_ITEMS` constant

**Files:**
- Modify: `lib/notify/constants.ts`
- Test: `tests/notify/constants-values.test.ts`

**Interfaces:**
- Produces: `BATCH_EMAIL_MAX_ITEMS = 20` (display cap for batch emails).

- [ ] **Step 1: Failing test** (append to the existing values suite in `tests/notify/constants-values.test.ts`, matching its assertion style)

```ts
test("BATCH_EMAIL_MAX_ITEMS is 20 (batching spec §2.4)", () => {
  expect(BATCH_EMAIL_MAX_ITEMS).toBe(20);
});
```
(add `BATCH_EMAIL_MAX_ITEMS` to the file's import from `@/lib/notify/constants`.)

- [ ] **Step 2: Verify fail** — `pnpm vitest run tests/notify/constants-values.test.ts`
- [ ] **Step 3: Implement** — append to `lib/notify/constants.ts`:

```ts
/** Batch emails render at most this many member items; the rest collapse into an
 * overflow line (batching spec §2.4 — display-only, ledger covers ALL members). */
export const BATCH_EMAIL_MAX_ITEMS = 20;
```

- [ ] **Step 4: Verify pass.**
- [ ] **Step 5: Commit** — `feat(notify): BATCH_EMAIL_MAX_ITEMS display cap`

---

### Task 3: Undo batch template

**Files:**
- Modify: `lib/notify/templates/autoPublishUndo.ts`
- Test: `tests/notify/autoPublishUndoBatchTemplate.test.ts` (new)

**Interfaces:**
- Consumes: `renderAutoPublishUndo` (unchanged), `recipientBindingFor(email, showId, mintId)` (`lib/sync/unpublishBinding.ts:29`), `escapeHtml`, `BATCH_EMAIL_MAX_ITEMS`.
- Produces:

```ts
export type AutoPublishUndoBatchShow = {
  slug: string; showTitle: string; showId: string;
  token: string; mintId: string; expiresAt: Date;
};
export type AutoPublishUndoBatchInput = {
  origin: string; shows: AutoPublishUndoBatchShow[]; recipient: string; now?: Date;
};
export function renderAutoPublishUndoBatch(input: AutoPublishUndoBatchInput): RenderedEmail;
```

- [ ] **Step 1: Failing tests** (new file `tests/notify/autoPublishUndoBatchTemplate.test.ts`)

```ts
import { describe, expect, test } from "vitest";
import {
  renderAutoPublishUndo,
  renderAutoPublishUndoBatch,
  type AutoPublishUndoBatchShow,
} from "@/lib/notify/templates/autoPublishUndo";
import { recipientBindingFor } from "@/lib/sync/unpublishBinding";

const NOW = new Date("2026-07-16T05:20:00.000Z");
const RECIPIENT = "doug@fxav.net";

function show(i: number, overrides: Partial<AutoPublishUndoBatchShow> = {}): AutoPublishUndoBatchShow {
  return {
    slug: `show-${i}`,
    showTitle: `Show ${i}`,
    showId: `00000000-0000-0000-0000-0000000000${String(i).padStart(2, "0")}`,
    token: `token-${i}`,
    mintId: `mint${i}`,
    expiresAt: new Date("2026-07-17T06:15:00.000Z"),
    ...overrides,
  };
}

describe("renderAutoPublishUndoBatch (batching spec §2.4)", () => {
  test("N=1 is byte-identical to the single template", () => {
    const s = show(1);
    const single = renderAutoPublishUndo({
      origin: "https://fxav.example", slug: s.slug, showTitle: s.showTitle, showId: s.showId,
      token: s.token, mintId: s.mintId, expiresAt: s.expiresAt, recipient: RECIPIENT, now: NOW,
    });
    const batch = renderAutoPublishUndoBatch({
      origin: "https://fxav.example", shows: [s], recipient: RECIPIENT, now: NOW,
    });
    expect(batch).toEqual(single);
  });

  test("N=2: pluralized subject, one block per show, each with its OWN recipient-bound r", () => {
    const shows = [show(1), show(2)];
    const batch = renderAutoPublishUndoBatch({
      origin: "https://fxav.example", shows, recipient: RECIPIENT, now: NOW,
    });
    expect(batch.subject).toBe("FXAV: 2 shows published themselves");
    for (const s of shows) {
      const r = recipientBindingFor(RECIPIENT, s.showId, s.mintId);
      const href = `https://fxav.example/show/${s.slug}/unpublish?token=${s.token}&r=${r}`;
      expect(batch.text).toContain(href);
      expect(batch.html).toContain(`href="${href}"`);
    }
    const r1 = recipientBindingFor(RECIPIENT, shows[0]!.showId, shows[0]!.mintId);
    const r2 = recipientBindingFor(RECIPIENT, shows[1]!.showId, shows[1]!.mintId);
    expect(r1).not.toBe(r2); // capability must not leak across shows
    // shared explainer appears exactly once
    expect(batch.text.match(/Undoing takes the show offline/g)).toHaveLength(1);
  });

  test("N=21: 20 rendered + overflow line naming the correct remainder", () => {
    const shows = Array.from({ length: 21 }, (_, i) => show(i + 1));
    const batch = renderAutoPublishUndoBatch({
      origin: "https://fxav.example", shows, recipient: RECIPIENT, now: NOW,
    });
    expect(batch.subject).toBe("FXAV: 21 shows published themselves");
    expect(batch.text).toContain(`token=${shows[19]!.token}`);
    expect(batch.text).not.toContain(`token=${shows[20]!.token}`);
    expect(batch.text).toContain("and 1 more — manage shows from the dashboard: https://fxav.example/admin");
  });

  test("HTML-escapes titles; raw title never appears unescaped in html", () => {
    const s = show(1, { showTitle: "Danger <x> & Co" });
    const batch = renderAutoPublishUndoBatch({
      origin: "https://fxav.example", shows: [s, show(2)], recipient: RECIPIENT, now: NOW,
    });
    expect(batch.html).toContain("Danger &lt;x&gt; &amp; Co");
    expect(batch.html).not.toContain("Danger <x>");
  });

  test.each([2, 21])("text mirrors html paragraph-for-paragraph at N=%i (spec §2.4)", (n) => {
    const shows = Array.from({ length: n }, (_, i) => show(i + 1));
    const batch = renderAutoPublishUndoBatch({
      origin: "https://fxav.example", shows, recipient: RECIPIENT, now: NOW,
    });
    const htmlParagraphs = (batch.html.match(/<p>/g) ?? []).length;
    expect(batch.text.split("\n\n")).toHaveLength(htmlParagraphs);
    if (n === 21) {
      const overflowLine = "…and 1 more — manage shows from the dashboard: https://fxav.example/admin";
      expect(batch.text).toContain(overflowLine);
      expect(batch.html).toContain("and 1 more");
    }
  });
});
```

- [ ] **Step 2: Verify fail** — `pnpm vitest run tests/notify/autoPublishUndoBatchTemplate.test.ts` → FAIL (`renderAutoPublishUndoBatch` not exported).

- [ ] **Step 3: Implement** — in `lib/notify/templates/autoPublishUndo.ts`: extract the shared copy strings to module consts and add the batch renderer. The single renderer's OUTPUT must not change (it now reads the consts):

```ts
import { BATCH_EMAIL_MAX_ITEMS } from "@/lib/notify/constants";

const WHAT_UNDO_DOES =
  "Undoing takes the show offline; crew links pause until Published is turned back on from the show's page.";
const IGNORING = "If everything looks right, ignore this email and the show stays live.";
const LINK_LABEL = "Take this show offline";
```

(replace the three inline locals in `renderAutoPublishUndo` with these consts — same strings verbatim), then:

```ts
export type AutoPublishUndoBatchShow = {
  slug: string;
  showTitle: string;
  showId: string;
  token: string;
  mintId: string;
  expiresAt: Date;
};

export type AutoPublishUndoBatchInput = {
  origin: string;
  shows: AutoPublishUndoBatchShow[];
  recipient: string;
  now?: Date;
};

/** Batch variant (batching spec §2.4). N=1 delegates to the single template so a
 * lone publish renders byte-identically to the historical email. Every show keeps
 * its OWN recipient-bound r — the binding never spans shows. */
export function renderAutoPublishUndoBatch(input: AutoPublishUndoBatchInput): RenderedEmail {
  const first = input.shows[0];
  if (input.shows.length === 1 && first) {
    return renderAutoPublishUndo({
      origin: input.origin,
      recipient: input.recipient,
      // exactOptionalPropertyTypes: only pass now when supplied
      ...(input.now ? { now: input.now } : {}),
      ...first,
    });
  }
  const now = input.now ?? new Date();
  const shown = input.shows.slice(0, BATCH_EMAIL_MAX_ITEMS);
  const overflow = input.shows.length - shown.length;

  const subject = `FXAV: ${input.shows.length} shows published themselves`;
  const intro = `${input.shows.length} shows published themselves and are now live for the crew.`;

  const blocks = shown.map((show) => {
    const r = recipientBindingFor(input.recipient, show.showId, show.mintId);
    const href = `${input.origin}/show/${show.slug}/unpublish?token=${show.token}&r=${r}`;
    const window = `The undo window closes ${closesAtAbsolute(show.expiresAt)} (${aboutHours(
      show.expiresAt,
      now,
    )} from now).`;
    return { title: show.showTitle, window, href };
  });
  const overflowLine =
    overflow > 0
      ? `…and ${overflow} more — manage shows from the dashboard: ${input.origin}/admin`
      : null;
  const closing = `${WHAT_UNDO_DOES} ${IGNORING}`;

  const text = [
    intro,
    ...blocks.map((b) => `${b.title}\n${b.window}\n${LINK_LABEL}: ${b.href}`),
    ...(overflowLine ? [overflowLine] : []),
    closing,
  ].join("\n\n");
  const html =
    `<p>${escapeHtml(intro)}</p>` +
    blocks
      .map(
        (b) =>
          `<p><strong>${escapeHtml(b.title)}</strong><br>${escapeHtml(b.window)}<br>` +
          `<a href="${escapeHtml(b.href)}">${escapeHtml(LINK_LABEL)}</a></p>`,
      )
      .join("") +
    (overflowLine ? `<p>${escapeHtml(overflowLine)}</p>` : "") +
    `<p>${escapeHtml(closing)}</p>`;

  return { subject, html, text };
}
```

- [ ] **Step 4: Verify pass AND single-template regression** — `pnpm vitest run tests/notify/autoPublishUndoBatchTemplate.test.ts tests/notify/autoPublishUndoTemplate.test.ts` → all PASS.
- [ ] **Step 5: Commit** — `feat(notify): auto-publish-undo batch email template`

---

### Task 4: Problem batch templates

**Files:**
- Modify: `lib/notify/templates/realtimeProblem.ts`
- Test: `tests/notify/realtimeProblemBatchTemplate.test.ts` (new)

**Interfaces:**
- Consumes: `RealtimeInput`, `RenderedEmail`, catalog resolvers already imported by the file, `BATCH_EMAIL_MAX_ITEMS`.
- Produces:

```ts
export type RealtimeBatchGroup = "sync_problems" | "stuck_files";
export function renderRealtimeProblemBatch(
  group: RealtimeBatchGroup, origin: string, members: RealtimeInput[],
): RenderedEmail;
```

- [ ] **Step 1: Failing tests** (new file `tests/notify/realtimeProblemBatchTemplate.test.ts`)

```ts
import { describe, expect, test } from "vitest";
import {
  renderRealtimeProblem,
  renderRealtimeProblemBatch,
  type RealtimeInput,
} from "@/lib/notify/templates/realtimeProblem";

const ORIGIN = "https://fxav.example";

function showMember(i: number, overrides: Partial<Extract<RealtimeInput, { kind: "show" }>> = {}): RealtimeInput {
  return {
    kind: "show", origin: ORIGIN, slug: `show-${i}`, showTitle: `Show ${i}`,
    code: "SHEET_UNAVAILABLE", contextSheetName: `Sheet ${i}`, ...overrides,
  };
}
function ingestionMember(i: number): RealtimeInput {
  return { kind: "ingestion", origin: ORIGIN, driveFileName: `File ${i}`, lastErrorCode: "SHEET_PROCESS_FAILED" };
}

describe("renderRealtimeProblemBatch (batching spec §2.4)", () => {
  test("N=1 is byte-identical to the single template (show, global, ingestion)", () => {
    const cases: RealtimeInput[] = [showMember(1), { kind: "global", origin: ORIGIN }, ingestionMember(1)];
    for (const member of cases) {
      const group = member.kind === "ingestion" ? "stuck_files" : "sync_problems";
      expect(renderRealtimeProblemBatch(group, ORIGIN, [member])).toEqual(renderRealtimeProblem(member));
    }
  });

  test("sync_problems N=3 (2 shows + global): count subject, one catalog line per member, ONE dashboard link", () => {
    const members: RealtimeInput[] = [showMember(1), showMember(2), { kind: "global", origin: ORIGIN }];
    const batch = renderRealtimeProblemBatch("sync_problems", ORIGIN, members);
    expect(batch.subject).toBe("FXAV: sync problems on 3 shows");
    expect(batch.text).toContain("Show 1");
    expect(batch.text).toContain("Show 2");
    // per-member copy is catalog copy — never a raw code (invariant 5)
    expect(batch.text).not.toContain("SHEET_UNAVAILABLE");
    expect(batch.html).not.toContain("SHEET_UNAVAILABLE");
    expect(batch.text.match(/Open the dashboard: https:\/\/fxav\.example\/admin/g)).toHaveLength(1);
  });

  test("stuck_files N=2: count subject, per-file resolver copy, no raw code", () => {
    const batch = renderRealtimeProblemBatch("stuck_files", ORIGIN, [ingestionMember(1), ingestionMember(2)]);
    expect(batch.subject).toBe("FXAV: 2 new sheets need attention");
    expect(batch.text).toContain("File 1");
    expect(batch.text).toContain("File 2");
    expect(batch.text).not.toContain("SHEET_PROCESS_FAILED");
  });

  test("N=21 caps at 20 lines + overflow line with correct remainder", () => {
    const members = Array.from({ length: 21 }, (_, i) => showMember(i + 1));
    const batch = renderRealtimeProblemBatch("sync_problems", ORIGIN, members);
    expect(batch.text).toContain("Show 20");
    expect(batch.text).not.toContain("Show 21:");
    expect(batch.text).toContain("…and 1 more — open the dashboard: https://fxav.example/admin");
  });

  test("HTML-escapes member titles", () => {
    const batch = renderRealtimeProblemBatch("sync_problems", ORIGIN, [
      showMember(1, { showTitle: "Danger <x> & Co", contextSheetName: null }),
      showMember(2),
    ]);
    expect(batch.html).toContain("Danger &lt;x&gt; &amp; Co");
    expect(batch.html).not.toContain("Danger <x>");
  });

  test.each([2, 21])("text mirrors html paragraph-for-paragraph at N=%i (spec §2.4)", (n) => {
    const members = Array.from({ length: n }, (_, i) => showMember(i + 1));
    const batch = renderRealtimeProblemBatch("sync_problems", ORIGIN, members);
    const htmlParagraphs = (batch.html.match(/<p>/g) ?? []).length;
    expect(batch.text.split("\n\n")).toHaveLength(htmlParagraphs);
    if (n === 21) {
      const overflowLine = "…and 1 more — open the dashboard: https://fxav.example/admin";
      expect(batch.text).toContain(overflowLine);
      expect(batch.html).toContain("and 1 more");
    }
  });
});
```

- [ ] **Step 2: Verify fail** — `pnpm vitest run tests/notify/realtimeProblemBatchTemplate.test.ts`

- [ ] **Step 3: Implement** — in `lib/notify/templates/realtimeProblem.ts`, extract the per-member label+body resolution from `renderRealtimeProblem`'s branches into a private helper (the single renderer keeps producing byte-identical output by calling it), then add the batch renderer:

```ts
import { BATCH_EMAIL_MAX_ITEMS } from "@/lib/notify/constants";

type MemberLine = { label: string; bodyText: string };

function memberLine(input: RealtimeInput): MemberLine {
  if (input.kind === "show") {
    guardTemplate(input.code);
    const sheetName = input.contextSheetName ?? input.showTitle ?? "this show";
    const template = messageFor(input.code as MessageCode).dougFacing;
    const bodyText = template
      ? plainCatalogText(template, { sheet_name: sheetName })
      : `${input.showTitle ?? "a show"} has a sync problem.`;
    return { label: input.showTitle ?? "a show", bodyText };
  }
  if (input.kind === "ingestion") {
    return {
      label: input.driveFileName ?? "a new sheet",
      bodyText: resolveIngestionCopy({ code: input.lastErrorCode, driveFileName: input.driveFileName }),
    };
  }
  guardTemplate("SYNC_STALLED");
  const stalled = MESSAGE_CATALOG.SYNC_STALLED.dougFacing;
  return { label: "Syncing", bodyText: stalled ? plainCatalogText(stalled) : "Syncing is stalled." };
}
```

Refactor `renderRealtimeProblem` to use `memberLine` for its `bodyText` (subject construction unchanged: it still derives `subjectShow`/`href` exactly as today — only the body-text duplication is removed). Then:

```ts
export type RealtimeBatchGroup = "sync_problems" | "stuck_files";

/** Batch variant (batching spec §2.4). N=1 delegates to the single template. Every
 * member line is catalog/resolver copy — raw codes never render (invariant 5). */
export function renderRealtimeProblemBatch(
  group: RealtimeBatchGroup,
  origin: string,
  members: RealtimeInput[],
): RenderedEmail {
  const first = members[0];
  if (members.length === 1 && first) return renderRealtimeProblem(first);

  const shown = members.slice(0, BATCH_EMAIL_MAX_ITEMS);
  const overflow = members.length - shown.length;
  const subject =
    group === "sync_problems"
      ? `FXAV: sync problems on ${members.length} shows`
      : `FXAV: ${members.length} new sheets need attention`;
  const lines = shown.map(memberLine);
  const overflowLine =
    overflow > 0 ? `…and ${overflow} more — open the dashboard: ${origin}/admin` : null;
  const href = `${origin}/admin`;

  const text = [
    ...lines.map((line) => `${line.label}: ${line.bodyText}`),
    ...(overflowLine ? [overflowLine] : []),
    `Open the dashboard: ${href}`,
  ].join("\n\n");
  const html =
    lines
      .map((line) => `<p><strong>${escapeHtml(line.label)}</strong>: ${escapeHtml(line.bodyText)}</p>`)
      .join("") +
    (overflowLine ? `<p>${escapeHtml(overflowLine)}</p>` : "") +
    `<p><a href="${escapeHtml(href)}">Open the dashboard</a></p>`;
  return { subject, html, text };
}
```

- [ ] **Step 4: Verify pass AND single-template regression** — `pnpm vitest run tests/notify/realtimeProblemBatchTemplate.test.ts tests/notify/templates.test.ts` → all PASS.
- [ ] **Step 5: Commit** — `feat(notify): sync-problem and stuck-files batch email templates`

---

### Task 5: Recipient-first batch delivery loop

**Files:**
- Modify: `lib/notify/deliver.ts`
- Test: `tests/notify/deliverBatch.test.ts` (new); existing `tests/notify/deliver.test.ts`, `tests/notify/deliver-auto-publish-undo.test.ts` keep every EXPECTATION unchanged. One mechanical harness addition is permitted in those two files at Task 6 (inject a shared fake lock client via `deps.lockSql`) — no assertion may change.

**Empty-input fast path (pins the exact-shape contract at `tests/notify/deliver.test.ts:389-401`):** `deliverRealtimeCandidates` returns `{kind:"ok", sent:0, failed:0, skipped:0, retryLater:0}` (NO `lockSkipped` key — the existing test uses exact `toEqual`) immediately when `input.candidates.length === 0 || input.recipients.length === 0`, BEFORE constructing the work connection or (Task 6) the lock client. Non-contended passes likewise return `{kind:"ok", ...counts}` with no `lockSkipped` key; the key appears ONLY on the contended arm.

**Interfaces:**
- Consumes: `combinedDedupKey` (Task 1), batch templates (Tasks 3-4), existing helpers (`existingLedger`, `isRecipientActive`, `isCandidateCurrent`, `upsertSent`, `upsertFailed`, `contextFor`, `triggeredCode`, `showIdFor`).
- Produces (internal to `deliver.ts`, no export-surface change beyond `DeliveryResult`):
  - `type BatchGroup = "published" | "sync_problems" | "stuck_files"`; `groupFor(candidate): BatchGroup` (`auto_publish_undo`→published, `ingestion`→stuck_files, `show`/`global`→sync_problems).
  - `deliverBatch({ sql, send, alert, clock, makeReissueKey, kind, members, email, recipient, counts, heartbeat? })` — one provider send for all members; heartbeat (if provided) awaited immediately before the send and allowed to THROW (propagates); per-member ledger writes.
  - `DeliveryResult` ok arm gains OPTIONAL `lockSkipped?: boolean` (Task 6 sets it; declare now).
  - `DeliveryDeps` gains OPTIONAL `lockSql?: LockClient` where `type LockClient = { begin<T>(fn: (sql: DeliverySql) => Promise<T>): Promise<T>; end?: (options?: { timeout?: number }) => Promise<void> }` (Task 6 uses it; declare now so the deps type changes once).
- Loop order contract: `for recipient → (canonicalize; active-check once) → for group in [published, sync_problems, stuck_files] → per-candidate currentness+ledger → deliverBatch`. Skips count per member exactly as spec §2.1/§2.3.

- [ ] **Step 1: Failing tests** (new file `tests/notify/deliverBatch.test.ts`; reuse the `fakeSql`/candidate-factory patterns from `tests/notify/deliver.test.ts` — copy the `showCandidate`/`ingestionCandidate` factories and the `fakeSql` harness, extending `fakeSql` so `existingLedger` state is keyed per `(kind, dedup_key, recipient)` as it already is)

Test list (each with the concrete assertion):
1. **One send per group per recipient:** 3 undo candidates + 2 show candidates + 1 ingestion candidate, 1 recipient → `send` called exactly 3 times; subjects: `FXAV: 3 shows published themselves`, `FXAV: sync problems on 2 shows`, and (N=1 single-template form) `FXAV · Pending Sheet: sync problem`. Assert per-call `idempotencyKey === baseKey(kind, combinedDedupKey(memberKeys), recipient)`.
2. **Per-member ledger rows share provider_message_id:** undo batch of 2 → `sentRows` records 2 inserts, both containing the same `messageId` value and each member's own `dedup_key`.
3. **Mixed eligibility:** member A has ledger `sent`, member B fresh → send called once with B only (idempotency key = `baseKey(kind, "B-key", recipient)` — N=1 identity), counts `{sent:1, skipped:1}`.
4. **Capped member drops out:** A failed at `SEND_RETRY_CAP` attempts, B fresh → batch = {B}; counts `{sent:1, skipped:1}`.
5. **Batch failure → per-member failed rows + alerts:** batch of 2, send returns `{ok:false, kind:"infra_error", message:"boom"}` (the real `SendResult` failed arm — `lib/notify/send.ts:13-17` allows only `idempotency_conflict` | `infra_error`) → 2 `failedRows`, `upsertAdminAlert` spy called twice with each member's `contextFor` recipe, counts `{failed:2}`.
6. **Guard-suppressed failed write counts skipped:** batch of 2 fails; fakeSql returns `failedUpsertRows: []` (zero-row guard) for member A only → counts `{failed:1, skipped:1}`, exactly 1 alert.
7. **retry_later:** counts `{retryLater: members.length}`, zero ledger writes.
8. **Inactive recipient skips all candidates with ONE active check:** `active:false` → counts.skipped = candidates.length; assert the `admin_emails` select ran once for the recipient (fakeSql call count on that pattern).
9. **Undo batch renders per-recipient after canonicalization:** recipient `" Doug@FXAV.net "` → rendered hrefs bind `r` for `doug@fxav.net` (compute expected via `recipientBindingFor("doug@fxav.net", showId, mintId)`).
10. **Post-accept persistence failure (spec §2.1b residual):** batch of 3, send ok, fakeSql throws on the SECOND `upsertSent` insert → result `{kind:"infra_error"}`, exactly 1 sent row persisted, send called exactly once.

- [ ] **Step 2: Verify fail** — `pnpm vitest run tests/notify/deliverBatch.test.ts` → FAIL (send called once per candidate today; subjects single-form).

- [ ] **Step 3: Implement** — restructure `deliverRealtimeCandidates` in `lib/notify/deliver.ts`:

```ts
type BatchGroup = "published" | "sync_problems" | "stuck_files";
const GROUP_ORDER: readonly BatchGroup[] = ["published", "sync_problems", "stuck_files"];

function groupFor(candidate: RealtimeCandidate): BatchGroup {
  if (candidate.kind === "auto_publish_undo") return "published";
  if (candidate.kind === "ingestion") return "stuck_files";
  return "sync_problems";
}

function kindFor(candidate: RealtimeCandidate): DeliveryKind {
  return candidate.kind === "auto_publish_undo" ? "auto_publish_undo" : "realtime_problem";
}

function toRealtimeInput(candidate: RealtimeCandidate, origin: string): RealtimeInput {
  if (candidate.kind === "show") {
    return {
      kind: "show", origin, slug: candidate.slug, showTitle: candidate.showTitle,
      code: candidate.code, contextSheetName: candidate.contextSheetName,
    };
  }
  if (candidate.kind === "ingestion") {
    return {
      kind: "ingestion", origin,
      driveFileName: candidate.driveFileName, lastErrorCode: candidate.lastErrorCode,
    };
  }
  return { kind: "global", origin };
}
```

`deliverBatch` (replaces the send/outcome half of `deliverOneRecipient`; the eligibility half moves into the caller loop):

```ts
type BatchMember = {
  dedupKey: string;
  showId: string | null;
  triggeredCodes: string[];
  context: Record<string, unknown>;
};

async function deliverBatch(input: {
  sql: DeliverySql;
  send: (args: SendArgs) => Promise<SendResult>;
  alert: typeof upsertAdminAlert;
  clock: () => Date;
  makeReissueKey: (kind: string, dedupKey: string, recipient: string) => string;
  kind: DeliveryKind;
  members: BatchMember[];
  email: EmailSource;
  recipient: string; // canonical + active-verified by caller
  counts: DeliveryCounts;
  heartbeat?: () => Promise<void>; // lock-liveness (spec §2.1b); throws abort the pass
}): Promise<void> {
  const combined = combinedDedupKey(input.members.map((m) => m.dedupKey));
  const email =
    input.email.mode === "per-recipient" ? input.email.render(input.recipient) : input.email.content;

  await input.heartbeat?.();
  const first = await input.send({
    ...email,
    to: input.recipient,
    idempotencyKey: baseKey(input.kind, combined, input.recipient),
  });
  const outcome =
    first.ok === false && first.kind === "idempotency_conflict"
      ? await input.send({
          ...email,
          to: input.recipient,
          idempotencyKey: input.makeReissueKey(input.kind, combined, input.recipient),
        })
      : first;

  if (outcome.ok === true) {
    for (const member of input.members) {
      await upsertSent(
        input.sql,
        { kind: input.kind, dedupKey: member.dedupKey, showId: member.showId,
          triggeredCodes: member.triggeredCodes, context: member.context },
        input.recipient, outcome.messageId, input.clock(),
      );
      input.counts.sent += 1;
    }
    return;
  }
  if (outcome.ok === "retry_later" || outcome.kind === "idempotency_conflict") {
    input.counts.retryLater += input.members.length;
    return;
  }
  for (const member of input.members) {
    const landed = await upsertFailed(
      input.sql,
      { kind: input.kind, dedupKey: member.dedupKey, showId: member.showId,
        triggeredCodes: member.triggeredCodes, context: member.context },
      input.recipient, outcome.message,
    );
    if (!landed) {
      input.counts.skipped += 1;
      continue;
    }
    await input.alert({ showId: member.showId, code: "EMAIL_DELIVERY_FAILED", context: member.context });
    input.counts.failed += 1;
  }
}
```

New `deliverRealtimeCandidates` body (inside the existing try/catch/finally; Task 6 adds the lock wrapper around this loop — write it now as a private `runDeliveryPass(...)` so Task 6 only wraps it):

```ts
async function runDeliveryPass(input: {
  candidates: RealtimeCandidate[];
  recipients: string[];
  origin: string;
  sql: DeliverySql;
  send: (args: SendArgs) => Promise<SendResult>;
  alert: typeof upsertAdminAlert;
  clock: () => Date;
  makeReissueKey: (kind: string, dedupKey: string, recipient: string) => string;
  counts: DeliveryCounts;
  heartbeat?: () => Promise<void>;
}): Promise<void> {
  for (const rawRecipient of input.recipients) {
    const recipient = canonicalize(rawRecipient);
    if (!recipient) {
      input.counts.skipped += input.candidates.length;
      continue;
    }
    const active = await isRecipientActive(input.sql, recipient);
    if (!active) {
      input.counts.skipped += input.candidates.length;
      continue;
    }
    for (const group of GROUP_ORDER) {
      const members: RealtimeCandidate[] = [];
      for (const candidate of input.candidates) {
        if (groupFor(candidate) !== group) continue;
        const current = await isCandidateCurrent(candidate, input.sql);
        if (!current) {
          input.counts.skipped += 1;
          continue;
        }
        const ledger = await existingLedger(input.sql, kindFor(candidate), candidate.dedupKey, recipient);
        if (
          ledger?.status === "sent" ||
          (ledger?.status === "failed" && ledger.attempt_count >= SEND_RETRY_CAP)
        ) {
          input.counts.skipped += 1;
          continue;
        }
        members.push(candidate);
      }
      if (members.length === 0) continue;

      const email: EmailSource =
        group === "published"
          ? {
              mode: "per-recipient",
              render: (canonicalRecipient) =>
                renderAutoPublishUndoBatch({
                  origin: input.origin,
                  recipient: canonicalRecipient,
                  now: input.clock(),
                  shows: members.map((m) => {
                    const undo = m as Extract<RealtimeCandidate, { kind: "auto_publish_undo" }>;
                    return {
                      slug: undo.slug, showTitle: undo.showTitle, showId: undo.showId,
                      token: undo.token, mintId: undo.mintId, expiresAt: undo.expiresAt,
                    };
                  }),
                }),
            }
          : {
              mode: "static",
              content: renderRealtimeProblemBatch(
                group,
                input.origin,
                members.map((m) => toRealtimeInput(m, input.origin)),
              ),
            };

      await deliverBatch({
        sql: input.sql, send: input.send, alert: input.alert, clock: input.clock,
        makeReissueKey: input.makeReissueKey,
        kind: kindFor(members[0]!),
        members: members.map((m) => ({
          dedupKey: m.dedupKey, showId: showIdFor(m),
          triggeredCodes: [triggeredCode(m)], context: contextFor(m),
        })),
        email, recipient, counts: input.counts, heartbeat: input.heartbeat,
      });
    }
  }
}
```

`deliverRealtimeCandidates` calls `runDeliveryPass` (Task 6 wraps it in the lock). `deliverDigest` switches from `deliverOneRecipient` to the same primitives: canonicalize + `existingLedger` + `isRecipientActive` checks (unchanged order), then `deliverBatch` with a single member `{dedupKey, showId:null, triggeredCodes:[], context}` and its static email — delete `deliverOneRecipient` and the now-unused `rendered()` (its three branches live in `toRealtimeInput` + the batch/single templates). Digest provider key is unchanged by the N=1 identity.

The old `EmailSource` semantics and the R17 comment carry over: per-recipient rendering happens inside `deliverBatch` AFTER the caller's canonicalize + active check.

- [ ] **Step 4: Verify** — `pnpm vitest run tests/notify/` → new suite PASS, ALL existing notify suites PASS unmodified (N=1 parity is what keeps `deliver.test.ts` / `deliver-auto-publish-undo.test.ts` green; if any existing assertion fails, the implementation — not the test — is wrong).
- [ ] **Step 5: Commit** — `feat(notify): batch same-group realtime candidates into one email per recipient`

---

### Task 6: Single-flight lock + heartbeat

**Files:**
- Modify: `lib/notify/deliver.ts`
- Test: `tests/notify/singleFlightLock.test.ts` (new, unit + structural), `tests/notify/singleFlightLock-real-db.test.ts` (new, `test.skipIf(!process.env.TEST_DATABASE_URL)` like `tests/notify/deliver-real-db.test.ts:7-10`)

**Interfaces:**
- Consumes: `runDeliveryPass`, `LockClient` type (declared Task 5).
- Produces: `deliverRealtimeCandidates` wraps the pass in `lockSql.begin` + `pg_try_advisory_xact_lock(hashtext('notify:realtime-delivery'))`; ok-arm `lockSkipped?: true` when the lock is contended; heartbeat = `select 1` on the lock transaction before each batch send, thrown failure → `infra_error`.

- [ ] **Step 1: Failing tests**

`tests/notify/singleFlightLock.test.ts` (unit, fake lock client):

```ts
import { describe, expect, test, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
// plus the fakeSql + candidate factories copied per Task 5's harness note

function fakeLockSql(options: { locked?: boolean; heartbeatFailsAt?: number } = {}) {
  let heartbeats = 0;
  const begin = vi.fn(async (fn: (sql: unknown) => Promise<unknown>) => {
    const tx = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = String.raw(strings, ...values.map((_v, i) => `$${i + 1}`));
      if (/pg_try_advisory_xact_lock/i.test(text)) {
        return Promise.resolve([{ locked: options.locked ?? true }]);
      }
      heartbeats += 1;
      if (options.heartbeatFailsAt !== undefined && heartbeats >= options.heartbeatFailsAt) {
        return Promise.reject(new Error("lock connection lost"));
      }
      return Promise.resolve([]);
    };
    return fn(tx);
  });
  return { begin, end: vi.fn(async () => {}), heartbeatCount: () => heartbeats };
}
```

Tests:
1. **Contended lock skips everything:** `locked:false` → result `{kind:"ok", sent:0, failed:0, skipped:0, retryLater:0, lockSkipped:true}`, `send` never called, zero ledger writes.
2. **Heartbeat cadence — one per attempted batch send:** 2 undo + 1 show candidate, 1 recipient → 2 batch sends → `heartbeatCount() === 2`.
3. **Heartbeat failure aborts:** two groups pending, `heartbeatFailsAt: 2` → result `{kind:"infra_error"}`, `send` called exactly once (first batch), first batch's ledger rows persisted, second group untouched.
4. **Structural single-holder pin:** walk BOTH `lib/` (filter `.ts`) AND `supabase/` (filter `.sql`) recursively (`fs.readdirSync` with `{recursive:true}`), assert the substring `notify:realtime-delivery` appears in EXACTLY one scanned file (`lib/notify/deliver.ts`), that within it `pg_try_advisory_xact_lock(hashtext('notify:realtime-delivery'` appears exactly once, and that `pg_advisory_lock(`/`pg_advisory_unlock(` combined with the key appear nowhere in either tree (fails-by-default if a second holder — JS, RPC, or SECURITY DEFINER — or a session-level variant lands).

`tests/notify/singleFlightLock-real-db.test.ts`:
1. **Concurrency:** competing `postgres(DB_URL,{max:1})` connection runs `begin` + `select pg_try_advisory_xact_lock(hashtext('notify:realtime-delivery'))` (assert true) and HOLDS the tx open; then `deliverRealtimeCandidates` with one seeded candidate + recipient → `lockSkipped:true`, sendEmail spy not called; competitor commits.
2. **Release on completion AND on thrown pass:** run a pass to completion (and a second run where the work `sql` throws mid-pass → `infra_error`); after each, a fresh connection's `begin` + try-lock returns true (lock free).

- [ ] **Step 2: Verify fail** — `pnpm vitest run tests/notify/singleFlightLock.test.ts` (structural test fails: key absent from lib/).

- [ ] **Step 3: Implement** — in `deliverRealtimeCandidates`, AFTER the empty-input fast path (so unit tests with empty inputs and the production zero-work case never construct a lock client):

```ts
if (input.candidates.length === 0 || input.recipients.length === 0) {
  return { kind: "ok", sent: 0, failed: 0, skipped: 0, retryLater: 0 };
}
const lockSql: LockClient =
  deps.lockSql ??
  (postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false }) as unknown as LockClient);
const ownsLock = !deps.lockSql;
```

**Existing-test harness addition (mechanical, no assertion changes):** export the Task 6 `fakeLockSql` from a small shared helper `tests/notify/fakeLockSql.ts`; in `tests/notify/deliver.test.ts` and `tests/notify/deliver-auto-publish-undo.test.ts`, add `lockSql: fakeLockSql().client` to every `deliverRealtimeCandidates` deps object that passes a fake `sql` with non-empty inputs (the empty-input test needs nothing — the fast path returns first). Every existing expectation stays byte-identical; if any assertion needs changing, the implementation is wrong.

and wrap the pass:

```ts
try {
  const passResult = await lockSql.begin(async (ltx) => {
    const rows = await ltx<{ locked: boolean }>`
      select pg_try_advisory_xact_lock(hashtext('notify:realtime-delivery')) as locked
    `;
    if (!rows[0]?.locked) return { lockSkipped: true as const };
    // Lock-liveness heartbeat (spec §2.1b): one statement on the LOCK transaction
    // immediately before each batch send bounds its idle interval to a single
    // send + one batch's ledger writes; a failed heartbeat means the lock
    // connection (and thus the xact lock) is gone — abort by rethrowing.
    const heartbeat = async () => {
      await ltx`select 1`;
    };
    await runDeliveryPass({ candidates: input.candidates, recipients: input.recipients,
      origin: input.origin, sql, send, alert, clock, makeReissueKey, counts, heartbeat });
    return { lockSkipped: false as const };
  });
  if (passResult.lockSkipped) {
    return { kind: "ok", sent: 0, failed: 0, skipped: 0, retryLater: 0, lockSkipped: true };
  }
  return { kind: "ok", ...counts };
} catch {
  return { kind: "infra_error" };
} finally {
  if (ownsConnection) await sql.end?.({ timeout: 5 });
  if (ownsLock) await lockSql.end?.({ timeout: 5 });
}
```

- [ ] **Step 4: Verify** — `pnpm vitest run tests/notify/singleFlightLock.test.ts tests/notify/deliverBatch.test.ts tests/notify/deliver.test.ts` PASS; with local DB up, `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm vitest run tests/notify/singleFlightLock-real-db.test.ts` PASS.
- [ ] **Step 5: Commit** — `feat(notify): single-flight advisory guard with lock-liveness heartbeat`

---

### Task 7: Full verification sweep

**Files:** none new.

- [ ] **Step 1:** `pnpm test` — FULL suite (scoped gates miss regressions; shared-chokepoint lesson). Expected: green. Pay attention to `tests/notify/run-notify.test.ts`, `tests/notify/notify-route.test.ts`, real-DB notify suites, `tests/notify/_metaInfraContract.test.ts`, `tests/log/` meta-tests.
- [ ] **Step 2:** `pnpm typecheck` (vitest strips types; tsc is the gate).
- [ ] **Step 3:** `pnpm lint` (canonical Tailwind rule irrelevant here but the gate runs repo-wide).
- [ ] **Step 4:** `pnpm format:check` — `--no-verify` commits bypassed prettier; fix with `pnpm prettier --write <files>` if red (NEVER the master spec).
- [ ] **Step 5:** `pnpm build` (catches client/server boundary + type issues vitest misses; no RSC wiring changed, still mandatory pre-push).
- [ ] **Step 6:** Commit any formatting deltas — `chore(notify): format sweep` (only if needed).

---

### Task 8: Adversarial review (cross-model), push, CI, merge

- [ ] **Step 1:** Whole-diff Codex review (fresh-eyes, REVIEWER ONLY) per ship-feature Stage 4; iterate to APPROVE; class-sweep every finding before patching.
- [ ] **Step 2:** `git fetch origin main` + rebase if behind (stale-base lesson); re-run `pnpm test` if rebased.
- [ ] **Step 3:** Push; open PR (body ends with the standard generated-with footer); `gh pr checks <PR#> --watch` (PR number, NOT SHA); confirm `mergeStateStatus == CLEAN`.
- [ ] **Step 4:** `gh pr merge --merge`; fast-forward local main; `git rev-list --left-right --count main...origin/main` → `0  0`.
