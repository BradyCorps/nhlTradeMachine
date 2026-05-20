// lib/utils.ts

/**
 * Converts a player name to a URL-safe slug.
 * "Connor McDavid" -> "connor-mcdavid"
 * "T.J. Oshie" -> "tj-oshie"
 */
export const generateSlug = (firstName: string, lastName: string): string => {
  const fullName = `${firstName} ${lastName}`;
  return fullName
    .toLowerCase()
    .normalize('NFD') // Removes accents (e.g., É -> E)
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '') // Removes dots and special chars (T.J. -> tj)
    .trim()
    .replace(/\s+/g, '-'); // Replaces spaces with hyphens
};
