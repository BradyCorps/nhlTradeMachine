import Image from "next/image";

type BrandMarkProps = {
  size?: number;
  variant?: "primary" | "reversed" | "ink" | "cream";
  className?: string;
  priority?: boolean;
};

const variantFiles = {
  primary: "cap-and-crease-mark-primary.svg",
  reversed: "cap-and-crease-mark-reversed.svg",
  ink: "cap-and-crease-mark-one-color-ink.svg",
  cream: "cap-and-crease-mark-one-color-cream.svg",
} as const;

export function BrandMark({
  size = 48,
  variant = "primary",
  className,
  priority = false,
}: BrandMarkProps) {
  const file =
    variant === "primary" && size <= 32
      ? "cap-and-crease-mark-small.svg"
      : variantFiles[variant];

  return (
    <Image
      src={`/brand/svg/${file}`}
      alt="Cap & Crease"
      width={size}
      height={size}
      className={className}
      priority={priority}
    />
  );
}
