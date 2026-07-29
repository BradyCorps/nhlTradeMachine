import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://capandcrease.com"),
  applicationName: "Cap & Crease",
  icons: {
    icon: [
      { url: "/brand/favicon/favicon.svg", type: "image/svg+xml" },
      {
        url: "/brand/favicon/favicon-32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: "/brand/favicon/favicon-16.png",
        sizes: "16x16",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/brand/favicon/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    other: [
      {
        rel: "mask-icon",
        url: "/brand/favicon/safari-pinned-tab.svg",
        color: "#1c140a",
      },
    ],
  },
  manifest: "/brand/favicon/site.webmanifest",
  openGraph: {
    siteName: "Cap & Crease",
    images: [
      {
        url: "/brand/png/cap-and-crease-og-1200x630.png",
        width: 1200,
        height: 630,
        alt: "Cap & Crease",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/png/cap-and-crease-og-1200x630.png"],
  },
};
