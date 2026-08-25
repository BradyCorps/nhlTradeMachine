export function displayPosition(position: string, secondaryPosition?: string | null): string {
  const primary = String(position ?? "").trim().toUpperCase();
  const secondary = String(secondaryPosition ?? "").trim().toUpperCase();
  if (!secondary || secondary === primary) return primary;
  return `${primary}/${secondary}`;
}
