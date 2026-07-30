import Image from "next/image";

type BrandLogoProps = {
  width?: number;
  layout?: "horizontal" | "stacked" | "wordmark";
  className?: string;
  priority?: boolean;
};

const logoFiles = {
  horizontal: "cap-and-crease-lockup-horizontal.svg",
  stacked: "cap-and-crease-lockup-stacked.svg",
  wordmark: "cap-and-crease-wordmark.svg",
} as const;

const aspectRatios = {
  horizontal: 1560 / 320,
  stacked: 1200 / 720,
  wordmark: 1280 / 240,
} as const;

export function BrandLogo({
  width = 360,
  layout = "horizontal",
  className,
  priority = false,
}: BrandLogoProps) {
  return (
    <Image
      src={`/brand/svg/${logoFiles[layout]}`}
      alt="Cap & Crease"
      width={width}
      height={Math.round(width / aspectRatios[layout])}
      className={className}
      priority={priority}
    />
  );
}
