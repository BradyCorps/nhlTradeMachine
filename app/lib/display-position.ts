export function displayPosition(position: string, secondaryPosition?: string | null): string {
  if (!secondaryPosition) return position;
  return `${position}/${secondaryPosition}`;
}
