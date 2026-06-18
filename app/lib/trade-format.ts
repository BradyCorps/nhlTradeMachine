export const formatPickRound = (round?: number | null): string => {
  if (round == null) return "?";
  if (round === 1) return "1st";
  if (round === 2) return "2nd";
  if (round === 3) return "3rd";
  return `${round}th`;
};
