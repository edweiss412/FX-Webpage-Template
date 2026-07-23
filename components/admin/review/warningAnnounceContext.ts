// components/admin/review/warningAnnounceContext.ts
//
// Announcer spec 2026-07-22 §2.2: the published Parse-warnings panel's
// actions-only announce channel. `ShowReviewSurface` provides a real
// `announce` on the published surface; producers (the ignore controls) call
// it on their fetch-success branches. The default is a no-op so a control
// mounted outside the provider (wizard, standalone harnesses) announces
// nothing and never throws (spec §2.5).
"use client";
import { createContext } from "react";

export type WarningAnnounce = { announce: (message: string) => void };

export const NOOP_WARNING_ANNOUNCE: WarningAnnounce = { announce: () => {} };

export const WarningAnnounceContext = createContext<WarningAnnounce>(NOOP_WARNING_ANNOUNCE);
