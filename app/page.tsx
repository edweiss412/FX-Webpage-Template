// app/page.tsx — public root landing (spec §4.2). Signed-in visitors
// redirect into the existing sign-in resolution (admin → /admin,
// crew → /me; spec D-2). Fail-open render with operator signal (§4.1.2).
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { rootSessionProbe } from "@/lib/auth/rootSessionProbe";

export default async function Home() {
  const probe = await rootSessionProbe(); // redirect() stays OUTSIDE any try/catch (NEXT_REDIRECT)
  if (probe.kind === "authenticated") {
    redirect("/auth/sign-in?next=/admin");
  }
  if (probe.kind === "infra_error") {
    console.error("[root-landing] session probe infra fault:", probe.message);
  }
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-sunken p-page-pad-mobile sm:p-page-pad-desktop">
      <div
        data-testid="root-landing-card"
        className="flex w-full max-w-sm flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad"
      >
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-text-strong">
          <Image
            src="/brand/fxav-icon.png"
            alt=""
            aria-hidden
            width={28}
            height={28}
            className="size-7 shrink-0 select-none"
          />
          FXAV <span className="text-accent-on-bg">Crew Pages</span>
        </h1>
        <Link
          href="/auth/sign-in?next=/admin"
          data-testid="root-landing-signin"
          aria-label="Sign in with Google"
          // CTA visual = the sign-in door's official Google-branded image
          // button, copied from app/auth/sign-in/SignInButton.tsx:50 with
          // three deliberate deltas: disabled: utilities dropped (Links
          // don't disable), ring-offset-bg -> ring-offset-surface (this
          // control sits on the card surface, not the page bg), and
          // self-start (spec 4.2.2 - the ring must hug the 175px control,
          // not stretch across the card). The focus-visible:ring-[#1a73e8]
          // arbitrary value is the shipped Google interaction-blue ring
          // from that button.
          className="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/google-signin-button.svg"
            alt="Sign in with Google"
            width={175}
            height={40}
            className="block select-none"
          />
        </Link>
        <p className="border-t border-border pt-3 text-sm text-text-subtle">
          On a crew? The link Doug sent goes straight to your show.
        </p>
      </div>
    </main>
  );
}
