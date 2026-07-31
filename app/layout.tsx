import type { Metadata, Viewport } from 'next';
import { BRAND } from "@/app/lib/brand";
import { Libre_Baskerville, Courier_Prime } from 'next/font/google';
import './globals.css';
import LedgerToaster from './components/LedgerToaster';
import WelcomeModal from './components/WelcomeModal';
import { SpeedInsights } from '@vercel/speed-insights/next';

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
  // Icons, manifest and OG image come from the brand kit
  // (docs/cap-and-crease-brand-kitV3/implementation/metadata-snippet.ts), served
  // out of public/brand. Titles stay driven by BRAND so the name still lives in
  // exactly one place.
  metadataBase: new URL(BRAND.url),
  applicationName: BRAND.name,
  icons: {
    icon: [
      { url: "/brand/favicon/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/brand/favicon/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      { rel: "mask-icon", url: "/brand/favicon/safari-pinned-tab.svg", color: "#1c140a" },
    ],
  },
  manifest: "/brand/favicon/site.webmanifest",
  title: `${BRAND.name} — ${BRAND.descriptor}`,
  description: 'X-NAV Analytics · Trade Machine · Armchair GM. Evaluate NHL trades and front-office decisions with advanced analytics.',
  keywords: ['NHL', 'trade machine', 'armchair GM', 'hockey analytics', 'X-NAV', 'xG', 'cap hit'],
  openGraph: {
    title: `${BRAND.name} — ${BRAND.descriptor}`,
    description: 'Build NHL trades, test front-office logic, and run Armchair GM scenarios. X-NAV · STRAND · GM Logic Engine.',
    type: 'website',
    siteName: BRAND.name,
    url: BRAND.url,
    images: [{
      url: "/brand/png/cap-and-crease-og-1200x630.png",
      width: 1200, height: 630, alt: BRAND.name,
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND.name} — ${BRAND.descriptor}`,
    description: 'Build NHL trades, test front-office logic, and run Armchair GM scenarios. X-NAV · STRAND · GM Logic Engine.',
    images: ["/brand/png/cap-and-crease-og-1200x630.png"],
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
        <WelcomeModal />
        <LedgerToaster />
        <SpeedInsights />
      </body>
    </html>
  );
}
