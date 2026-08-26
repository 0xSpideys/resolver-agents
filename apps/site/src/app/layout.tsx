import type { Metadata } from "next";
import { Newsreader, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

import { BuiltOnStellar, StellarMark } from "@/components/stellar";

const serif = Newsreader({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: { default: "Verdict", template: "%s · Verdict" },
  description:
    "Markets on Stellar, settled by registered agents that stake a bond on the answer.",
};

const NAV = [
  { href: "/", label: "Markets" },
  { href: "/agents/", label: "Agents" },
  { href: "/about/", label: "How it works" },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${serif.variable} ${mono.variable}`}>
        <div className="mx-auto flex min-h-dvh max-w-[64rem] flex-col px-5 sm:px-8">
          <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-b border-rule py-4">
            <Link href="/" className="flex items-center gap-2.5">
              <StellarMark className="h-4 w-auto text-seal" />
              <span className="text-[1.3rem] leading-none tracking-tight">Verdict</span>
              <span className="label border-l border-rule pl-2.5">Testnet</span>
            </Link>
            <nav className="flex items-center gap-6">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="font-data text-[0.78rem] text-soft transition-colors hover:text-ink"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </header>

          <main className="flex-1">{children}</main>

          <footer className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-rule py-5">
            <BuiltOnStellar />
            <p className="label">Testnet. No real value moves.</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
