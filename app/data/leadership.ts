// ── Leadership — captains and alternates ("intangibles") ──────
// Curated for the 2026-27 season; edit freely as letters move. Keyed by
// player name. Used by Best Lines (a C belongs in the top nine even on
// a rough contract) and as a small team-strength steadier in the sim.
// This is deliberately NOT part of X-NAV trade value — leadership makes
// a lineup better, it doesn't make a contract tradeable.

export type LeadershipRole = "C" | "A";

export const LEADERSHIP: Record<string, LeadershipRole> = {
  // Captains
  "Connor McDavid": "C",
  "Sidney Crosby": "C",
  "Nathan MacKinnon": "C",
  "Aleksander Barkov": "C",
  "Auston Matthews": "C",
  "Quinn Hughes": "C",
  "Cale Makar": "A",
  "Jordan Staal": "C",
  "Sebastian Aho": "A",
  "Adam Lowry": "C",
  "Mark Scheifele": "A",
  "Josh Morrissey": "A",
  "Jack Hughes": "C",
  "Nick Suzuki": "C",
  "Brady Tkachuk": "C",
  "Matthew Tkachuk": "A",
  "Jamie Benn": "C",
  "Roope Hintz": "A",
  "Anze Kopitar": "C",
  "Drew Doughty": "A",
  "Mikko Rantanen": "A",
  "Alexander Ovechkin": "C",
  "Dylan Larkin": "C",
  "Brayden Point": "A",
  "Victor Hedman": "C",
  "Roman Josi": "C",
  "Filip Forsberg": "A",
  "Clayton Keller": "C",
  "Mika Zibanejad": "A",
  "Bo Horvat": "C",
  "Kyle Connor": "A",
  "Leon Draisaitl": "A",
  "Ryan Nugent-Hopkins": "A",
  "Elias Pettersson": "A",   // resolves to the C via position-aware joins elsewhere; harmless for the D
  "Charlie McAvoy": "C",
  "David Pastrnak": "A",
  "Rasmus Dahlin": "C",
  "Cole Caufield": "A",
  "Robert Thomas": "C",
  "Jordan Kyrou": "A",
};

export const leadershipBonus = (name: string | undefined, scale: { c: number; a: number }): number => {
  if (!name) return 0;
  const role = LEADERSHIP[name];
  return role === "C" ? scale.c : role === "A" ? scale.a : 0;
};
