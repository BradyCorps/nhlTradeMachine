import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quant Front Office — NHL Trade Machine',
  description: 'X-NAV Analytics · xG Suppression · GM Logic Engine',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
