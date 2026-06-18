import { SharedTradeView } from "@/app/components/QuickTradeMachine";

export default function SharedTradePage({ params }: { params: { code: string } }) {
  return <SharedTradeView code={params.code} />;
}
