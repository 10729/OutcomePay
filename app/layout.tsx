import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "OutcomePay",
  description: "Pay only if it works. Outcome-based payments on PayPal, verified by AI.",
};

const NAV = [
  { href: "/new", label: "New job" },
  { href: "/agent", label: "Agent" },
  { href: "/sellers", label: "Sellers" },
  { href: "/dashboard", label: "Dashboard" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,400..800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <header className="border-b border-line bg-paper/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
            <Link href="/" className="flex items-center gap-2.5">
              <Mark />
              <span className="display hidden text-xl font-extrabold sm:inline">OutcomePay</span>
            </Link>
            <nav className="-mr-2 flex items-center gap-0.5 overflow-x-auto whitespace-nowrap text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-md px-2.5 py-1.5 font-medium text-muted hover:bg-white hover:text-ink">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-10">{children}</main>
        <footer className="mx-auto max-w-6xl px-5 pb-12 text-xs text-muted">
          Runs on the PayPal sandbox with test money. Payments are held with PayPal authorize and capture, which is a hold, not legal escrow.
        </footer>
      </body>
    </html>
  );
}

// The mark: a held bar split into earned and returned.
function Mark() {
  return (
    <svg width="30" height="18" viewBox="0 0 30 18" aria-hidden="true">
      <rect x="0" y="5" width="20" height="8" rx="2" fill="#17845A" />
      <rect x="21" y="5" width="9" height="8" rx="2" fill="#3F6FB0" />
    </svg>
  );
}
