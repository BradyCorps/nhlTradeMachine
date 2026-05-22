import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'The Hockey Ledger — NHL Trade Machine',
  description: 'X-NAV Analytics · xG Suppression · GM Logic Engine',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Courier+Prime:ital,wght@0,400;0,700;1,400&family=UnifrakturMaguntia&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased" style={{ fontFamily: "'Libre Baskerville', Georgia, serif" }}>
        {children}
      </body>
    </html>
  );
}