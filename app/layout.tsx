import type { Metadata, Viewport } from 'next';
import { Libre_Baskerville, Courier_Prime } from 'next/font/google';
import './globals.css';

// ── next/font: self-hosted, no layout shift, no external request ──
const baskerville = Libre_Baskerville({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-baskerville',
  display: 'swap',
});

const courier = Courier_Prime({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-courier',
  display: 'swap',
});

// UnifrakturMaguntia not in next/font — loaded via globals.css @import
// so we don't lose the masthead fraktur style

export const metadata: Metadata = {
  title: 'The Hockey Ledger — Trade Machine & Armchair GM',
  description: 'X-NAV Analytics · Trade Machine · Armchair GM. Evaluate NHL trades and front-office decisions with advanced analytics.',
  keywords: ['NHL', 'trade machine', 'armchair GM', 'hockey analytics', 'X-NAV', 'xG', 'cap hit'],
  openGraph: {
    title: 'The Hockey Ledger — Trade Machine & Armchair GM',
    description: 'Build NHL trades, test front-office logic, and run Armchair GM scenarios. X-NAV · STRAND™ · GM Logic Engine.',
    type: 'website',
    siteName: 'The Hockey Ledger',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The Hockey Ledger — Trade Machine & Armchair GM',
    description: 'Build NHL trades, test front-office logic, and run Armchair GM scenarios. X-NAV · STRAND™ · GM Logic Engine.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${baskerville.variable} ${courier.variable}`}>
      <head>
        {/* UnifrakturMaguntia — not available in next/font, load via CSS */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=UnifrakturMaguntia&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased font-serif">
        {children}
      </body>
    </html>
  );
}
