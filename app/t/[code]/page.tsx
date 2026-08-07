import type { Metadata } from "next";
import { SharedTradeView } from "@/app/components/QuickTradeMachine";
import { decodeTradeSharePayload, summarizeTradeSharePayload } from "@/app/lib/trade-share";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  try {
    const preview = summarizeTradeSharePayload(decodeTradeSharePayload(code));
    return {
      title: `${preview.title} | Cap & Crease`,
      description: preview.description,
      openGraph: {
        title: preview.title,
        description: preview.description,
        type: "article",
        siteName: "Cap & Crease",
        images: [{
          url: `/t/${code}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: preview.imageAlt,
        }],
      },
      twitter: {
        card: "summary_large_image",
        title: preview.title,
        description: preview.description,
        images: [`/t/${code}/opengraph-image`],
      },
    };
  } catch {
    return {
      title: "Shared Trade | Cap & Crease",
      description: "Open a shared NHL trade receipt from Cap & Crease.",
    };
  }
}

export default async function SharedTradePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <SharedTradeView code={code} />;
}
