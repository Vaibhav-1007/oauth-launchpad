import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "OAuth Launchpad",
  description: "Source-backed OAuth setup guides for developers and AI agent builders: effort, approvals, scopes and next actions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line bg-card/80">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span aria-hidden className="grid h-6 w-6 place-items-center rounded-md bg-foreground text-xs text-background">OL</span>
              OAuth Launchpad
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/" className="text-muted hover:text-foreground">Guides</Link>
              <Link href="/generate" className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:opacity-90">Generate a guide</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">{children}</main>
        <footer className="border-t border-line py-5 text-center text-xs text-muted">
          Guides distinguish documented facts from estimates. Always confirm in the provider&apos;s official documentation.
        </footer>
      </body>
    </html>
  );
}
