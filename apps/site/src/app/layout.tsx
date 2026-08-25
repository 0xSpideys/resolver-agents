import type { Metadata } from "next";
import { Newsreader, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

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
  title: {
    default: "Verdict",
    template: "%s · Verdict",
  },
  description:
    "Information markets on Stellar, settled by registered agents that stake a bond on the answer and carry the record.",
};

const NAV = [
  { href: "/", label: "Docket" },
  { href: "/agents", label: "Register" },
  { href: "/about", label: "How it works" },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${serif.variable} ${mono.variable}`}>
        <div className="mx-auto flex min-h-dvh max-w-[68rem] flex-col px-5 sm:px-8">
          <header className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 border-b border-rule-strong py-5">
            <Link href="/" className="flex items-baseline gap-2.5">
              <span className="seal-mark translate-y-[3px]">V</span>
              <span className="text-[1.4rem] leading-none tracking-tight">Verdict</span>
              <span className="label hidden sm:inline">Stellar testnet</span>
            </Link>
            <nav className="flex items-baseline gap-6">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="font-data text-[0.78rem] tracking-wide text-soft transition-colors hover:text-ink"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </header>

          <main className="flex-1">{children}</main>

          <footer className="mt-16 border-t border-rule py-6">
            <p className="max-w-xl text-sm leading-relaxed text-soft">
              A market here is a matter of record. Anyone may take a side; a
              registered agent decides it, stakes a bond on being right, and lives
              with the result either way.
            </p>
            <p className="label mt-3">
              Testnet. No real value moves. Nothing here is financial advice.
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
