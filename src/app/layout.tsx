import type { Metadata } from "next";
import Link from "next/link";
import { AS_OF_DATE } from "@/data";
import { HeaderActions } from "@/components/HeaderActions";
import { formatDate } from "@/lib/dates";
import "./globals.css";

export const metadata: Metadata = {
  title: "Multifamily Operations Intelligence · Synthetic-data prototype",
  description:
    "Independent portfolio prototype: investigate a renewal/service pattern across fragmented multifamily records, review evidence, and approve a simulated follow-up.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans text-ink">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        <header className="border-b border-line bg-surface/80 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
                <span aria-hidden className="grid size-7 place-items-center rounded-md bg-ink text-xs font-bold text-canvas">
                  MO
                </span>
                Multifamily Ops Intelligence
              </Link>
              <span className="rounded-full border border-warn/30 bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">
                Independent prototype · Synthetic data
              </span>
              <span className="text-xs text-ink-faint">Data as of {formatDate(AS_OF_DATE)}</span>
            </div>
            <HeaderActions />
          </div>
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
        <footer className="mx-auto max-w-7xl px-4 pb-10 pt-4 text-xs leading-relaxed text-ink-faint sm:px-6">
          Independent portfolio prototype built on synthetic data. All properties, residents, identifiers and comments are
          fictional. Not affiliated with any property-management company or software vendor. Actions are simulated and stored
          only in this browser; nothing is sent to residents, staff or external systems.
        </footer>
      </body>
    </html>
  );
}
