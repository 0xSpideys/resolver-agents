import type { Metadata } from "next";
import { Instrument_Serif, Archivo, DM_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

import { BuiltOnStellar, StellarMark } from "@/components/stellar";
import { ThemeScript, ThemeToggle } from "@/components/theme";
import { ConnectButton, WalletProvider } from "@/components/wallet";

const serif = Instrument_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const grotesque = Archivo({
  variable: "--font-grotesque",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const mono = DM_Mono({
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${serif.variable} ${grotesque.variable} ${mono.variable}`}>
        <WalletProvider>
        <div className="mx-auto flex min-h-dvh max-w-[70rem] flex-col px-5 sm:px-8">
          <header className="sticky top-0 z-20 -mx-5 flex items-center justify-between gap-6 border-b border-line bg-bg/85 px-5 py-3 backdrop-blur-md sm:-mx-8 sm:px-8">
            <div className="flex items-center gap-7">
              <Link href="/" className="flex items-baseline gap-2">
                <span className="font-display text-[1.45rem] leading-none tracking-tight">
                  Verdict
                </span>
                <span className="tag hidden sm:inline">Testnet</span>
              </Link>
              <nav className="flex items-center gap-5">
                {NAV.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    className="text-[0.85rem] text-mid transition-colors hover:text-fg"
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-2">
              <ConnectButton />
              <ThemeToggle />
            </div>
          </header>

          <main className="flex-1">{children}</main>

          <footer className="mt-20 flex flex-wrap items-center justify-between gap-4 border-t border-line py-6">
            <BuiltOnStellar />
            <div className="flex items-center gap-2">
              <StellarMark className="h-3 w-auto text-dim" />
              <p className="tag">Testnet. No real value moves.</p>
            </div>
          </footer>
        </div>
        </WalletProvider>
      </body>
    </html>
  );
}
