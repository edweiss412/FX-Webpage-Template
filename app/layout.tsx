import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FXAV Crew Pages",
  description: "Per-show, per-crew-member webpages.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
