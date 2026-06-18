import type { Metadata } from "next";
import { SharedTradeView } from "@/app/components/QuickTradeMachine";
import { decodeTradeSharePayload, summarizeTradeSharePayload } from "@/app/lib/trade-share";

export function generateMetadata({ params }: { params: { code: string } }): Metadata {
  try {
    const preview = summarizeTradeSharePayload(decodeTradeSharePayload(params.code));
    return {
      title: `${preview.title} | The Hockey Ledger`,
      description: preview.description,
      openGraph: {
        title: preview.title,
        description: preview.description,
        type: "article",
        siteName: "The Hockey Ledger",
        images: [{
          url: `/t/${params.code}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: preview.imageAlt,
        }],
      },
      twitter: {
        card: "summary_large_image",
        title: preview.title,
        description: preview.description,
        images: [`/t/${params.code}/opengraph-image`],
      },
    };
  } catch {
    return {
      title: "Shared Trade | The Hockey Ledger",
      description: "Open a shared NHL trade receipt from The Hockey Ledger.",
    };
  }
}

export default function SharedTradePage({ params }: { params: { code: string } }) {
  return <SharedTradeView code={params.code} />;
}
