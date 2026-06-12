// app/show/[slug]/unpublish/page.tsx — M12.13 emailed-undo confirm page
// (spec §5). PUBLIC, unauthenticated BY DESIGN: the single-use 24h token PLUS
// the recipient binding (r resolving to an unrevoked admin_emails row) is the
// auth (spec §10). Minimal standalone layout — NO admin chrome, no help
// affordances — reached from the undo email on any device.
//
// STATIC SEGMENT beside app/show/[slug]/[shareToken]/: Next.js resolves the
// static `unpublish` segment over the dynamic [shareToken] one
// deterministically, and a share token can never BE the literal "unpublish"
// (generated 64-hex) — pinned by tests/show/unpublishRoutePrecedence.test.ts.
//
// GET renders only (the prefetch pin: NO mutation on GET — a mail prefetcher
// hitting this URL must change nothing; pinned real-DB by
// tests/show/unpublishConfirmGetNoMutation.test.ts). The §5 R11 evaluation
// order lives in lib/sync/unpublishConfirmPage.ts; the POST is a server
// action on the client form, rendering its outcome in place.
//
// Server Component. No 'use client'. Inherits the minimal crew shell from
// app/show/[slug]/layout.tsx (Inter + bg tokens; no chrome).
import {
  evaluateUnpublishConfirmGet,
  type UnpublishConfirmGetState,
} from "@/lib/sync/unpublishConfirmPage";
import { messageFor } from "@/lib/messages/lookup";
import { ConfirmUnpublishForm } from "./ConfirmUnpublishForm";
import { ExpiredBlock, NeutralBlock, RetryBlock } from "./blocks";

export const dynamic = "force-dynamic";

function singleParam(value: string | string[] | undefined): string | undefined {
  // Array-valued (repeated) query params are treated as absent — the §5
  // guard conditions send malformed requests to the neutral state.
  return typeof value === "string" ? value : undefined;
}

function StateBody({
  state,
  slug,
  token,
  r,
}: {
  state: UnpublishConfirmGetState;
  slug: string;
  token: string | undefined;
  r: string | undefined;
}) {
  switch (state.state) {
    case "confirm":
      return (
        <ConfirmUnpublishForm
          slug={slug}
          title={state.title}
          token={token as string}
          r={r as string}
        />
      );
    case "expired": {
      const entry = messageFor("UNPUBLISH_TOKEN_EXPIRED");
      return <ExpiredBlock title={entry.title} body={entry.dougFacing as string} />;
    }
    case "infra":
      return <RetryBlock />;
    case "neutral":
      return <NeutralBlock />;
  }
}

export default async function UnpublishConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const token = singleParam(sp.token);
  const r = singleParam(sp.r);

  const state = await evaluateUnpublishConfirmGet({ slug, token, r });

  return (
    <main
      data-testid="unpublish-confirm-root"
      className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 py-section-gap text-center text-text"
    >
      <span className="text-xs font-bold uppercase tracking-eyebrow-strong text-accent-on-bg">
        FXAV
      </span>
      <div className="mt-2 w-full">
        <StateBody state={state} slug={slug} token={token} r={r} />
      </div>
    </main>
  );
}
