// app/lib/db.ts
// ============================================================
// SOURCE OF TRUTH — contract data, cap figures, team metadata
//
// Rosters are now pulled LIVE from the NHL API in route.ts.
// This file only needs to contain:
//   1. TEAMS_DB    — all 32 teams with cap space + standing
//   2. FINANCIALS_DB — AAV, term, clauses for notable players
//
// The API route merges these onto live NHL roster data.
// If a player isn't in FINANCIALS_DB, they get a $925K
// entry-level estimate (correct for most depth players).
// ============================================================

export const TEAMS_DB = [
  { id: "ANA", name: "Anaheim Ducks",          capSpace: 46.2, standing: 32, phase: "Tanking"    },
  { id: "BOS", name: "Boston Bruins",           capSpace: 9.1,  standing: 8,  phase: "Bubble"     },
  { id: "BUF", name: "Buffalo Sabres",          capSpace: 24.8, standing: 25, phase: "Rebuilding" },
  { id: "CGY", name: "Calgary Flames",          capSpace: 17.2, standing: 19, phase: "Retooling"  },
  { id: "CAR", name: "Carolina Hurricanes",     capSpace: 7.4,  standing: 4,  phase: "Contender"  },
  { id: "CHI", name: "Chicago Blackhawks",      capSpace: 42.0, standing: 30, phase: "Rebuilding",
    needs: [{ pos: "W", minWar: 2.5, label: "Elite Winger for Bedard" }] },
  { id: "COL", name: "Colorado Avalanche",      capSpace: 5.2,  standing: 6,  phase: "Contender"  },
  { id: "CBJ", name: "Columbus Blue Jackets",   capSpace: 33.1, standing: 29, phase: "Rebuilding" },
  { id: "DAL", name: "Dallas Stars",            capSpace: 6.9,  standing: 3,  phase: "Contender"  },
  { id: "DET", name: "Detroit Red Wings",       capSpace: 20.3, standing: 20, phase: "Retooling"  },
  { id: "EDM", name: "Edmonton Oilers",         capSpace: 16.5, standing: 2,  phase: "Contender",
    needs: [{ pos: "D", minWar: 2.0, label: "Top 4 RD" }] },
  { id: "FLA", name: "Florida Panthers",        capSpace: 8.2,  standing: 1,  phase: "Contender"  },
  { id: "LAK", name: "Los Angeles Kings",       capSpace: 10.8, standing: 10, phase: "Bubble"     },
  { id: "MIN", name: "Minnesota Wild",          capSpace: 12.4, standing: 13, phase: "Bubble"     },
  { id: "MTL", name: "Montréal Canadiens",      capSpace: 21.6, standing: 24, phase: "Rebuilding" },
  { id: "NSH", name: "Nashville Predators",     capSpace: 26.7, standing: 27, phase: "Rebuilding" },
  { id: "NJD", name: "New Jersey Devils",       capSpace: 11.8, standing: 14, phase: "Bubble"     },
  { id: "NYI", name: "New York Islanders",      capSpace: 14.2, standing: 17, phase: "Retooling"  },
  { id: "NYR", name: "New York Rangers",        capSpace: 7.1,  standing: 7,  phase: "Contender"  },
  { id: "OTT", name: "Ottawa Senators",         capSpace: 22.3, standing: 22, phase: "Retooling"  },
  { id: "PHI", name: "Philadelphia Flyers",     capSpace: 18.9, standing: 21, phase: "Retooling"  },
  { id: "PIT", name: "Pittsburgh Penguins",     capSpace: 8.4,  standing: 18, phase: "Retooling"  },
  { id: "SEA", name: "Seattle Kraken",          capSpace: 15.6, standing: 16, phase: "Retooling"  },
  { id: "SJS", name: "San Jose Sharks",         capSpace: 48.1, standing: 31, phase: "Tanking"    },
  { id: "STL", name: "St. Louis Blues",         capSpace: 14.1, standing: 15, phase: "Retooling"  },
  { id: "TBL", name: "Tampa Bay Lightning",     capSpace: 4.6,  standing: 9,  phase: "Bubble"     },
  { id: "TOR", name: "Toronto Maple Leafs",     capSpace: 5.8,  standing: 11, phase: "Bubble"     },
  { id: "UTA", name: "Utah Hockey Club",        capSpace: 19.4, standing: 23, phase: "Retooling"  },
  { id: "VAN", name: "Vancouver Canucks",       capSpace: 10.2, standing: 12, phase: "Bubble"     },
  { id: "VGK", name: "Vegas Golden Knights",    capSpace: 1.1,  standing: 5,  phase: "Contender",
    needs: [{ pos: "D", minWar: 2.0, label: "Top 4 D" }] },
  { id: "WSH", name: "Washington Capitals",     capSpace: 13.5, standing: 26, phase: "Retooling"  },
  { id: "WPG", name: "Winnipeg Jets",           capSpace: 12.7, standing: 4,  phase: "Contender",
    needs: [{ pos: "C", minWar: 2.0, label: "Top 6 C" }, { pos: "D", minWar: 2.0, label: "Top 4 D" }] },
];

// ============================================================
// FINANCIALS — 2025-26 / 2026-27 AAV, term, clauses
// Source: Puckpedia / CapFriendly
// Players NOT listed here get capHit: 0.925 (ELC estimate)
// ============================================================
export const FINANCIALS_DB: Record<string, {
  capHit: number;
  yearsRemaining: number;
  hasNMC?: boolean;
  hasNTC?: boolean;
  canRetain?: boolean;
  intangibleMultiplier?: number;
}> = {
  // ── SUPERSTARS ─────────────────────────────────────────────
  "Connor McDavid":        { capHit: 12.5,  yearsRemaining: 2,  hasNMC: true,  intangibleMultiplier: 1.2  },
  "Leon Draisaitl":        { capHit: 14.0,  yearsRemaining: 7,  hasNMC: true,  intangibleMultiplier: 1.1  },
  "Nathan MacKinnon":      { capHit: 12.6,  yearsRemaining: 6,  hasNMC: true,  intangibleMultiplier: 1.15 },
  "Auston Matthews":       { capHit: 13.25, yearsRemaining: 3,  hasNMC: true,  intangibleMultiplier: 1.12 },
  "Cale Makar":            { capHit: 9.0,   yearsRemaining: 3,  hasNTC: true,  intangibleMultiplier: 1.1  },
  "David Pastrnak":        { capHit: 11.25, yearsRemaining: 4,  hasNMC: true,  intangibleMultiplier: 1.08 },
  "Mitch Marner":          { capHit: 12.0,  yearsRemaining: 5,  hasNMC: true,  intangibleMultiplier: 1.06 },
  "Nikita Kucherov":       { capHit: 9.5,   yearsRemaining: 3,  hasNMC: true,  intangibleMultiplier: 1.12 },
  "Artemi Panarin":        { capHit: 11.642,yearsRemaining: 1,  hasNMC: true,  intangibleMultiplier: 1.05 },
  "Aleksander Barkov":     { capHit: 10.0,  yearsRemaining: 3,  hasNMC: true,  intangibleMultiplier: 1.1  },
  "Sam Reinhart":          { capHit: 8.5,   yearsRemaining: 7,  intangibleMultiplier: 1.06 },
  "Brady Tkachuk":         { capHit: 9.5,   yearsRemaining: 5,  hasNTC: true,  intangibleMultiplier: 1.07 },
  "Matthew Tkachuk":       { capHit: 9.5,   yearsRemaining: 5,  hasNTC: true,  intangibleMultiplier: 1.07 },
  "Jack Hughes":           { capHit: 8.0,   yearsRemaining: 4,  intangibleMultiplier: 1.08 },
  "Quinn Hughes":          { capHit: 7.85,  yearsRemaining: 5,  intangibleMultiplier: 1.06 },
  "Kirill Kaprizov":       { capHit: 9.0,   yearsRemaining: 3,  hasNTC: true,  intangibleMultiplier: 1.09 },
  "Mikko Rantanen":        { capHit: 9.25,  yearsRemaining: 5,  hasNTC: true,  intangibleMultiplier: 1.05 },
  "Brayden Point":         { capHit: 9.5,   yearsRemaining: 4,  hasNTC: true,  intangibleMultiplier: 1.07 },
  "Sebastian Aho":         { capHit: 8.454, yearsRemaining: 3,  intangibleMultiplier: 1.04 },
  "Jason Robertson":       { capHit: 7.75,  yearsRemaining: 6,  intangibleMultiplier: 1.04 },
  "Roope Hintz":           { capHit: 8.45,  yearsRemaining: 6,  hasNTC: true,  intangibleMultiplier: 1.03 },
  "Connor Bedard":         { capHit: 14.0,  yearsRemaining: 7,  intangibleMultiplier: 1.25 },
  "Tim Stutzle":           { capHit: 8.35,  yearsRemaining: 6,  intangibleMultiplier: 1.05 },
  "Nick Suzuki":           { capHit: 7.875, yearsRemaining: 6,  intangibleMultiplier: 1.05 },
  "Cole Caufield":         { capHit: 7.85,  yearsRemaining: 6,  intangibleMultiplier: 1.06 },
  "Juraj Slafkovsky":      { capHit: 7.6,   yearsRemaining: 6,  intangibleMultiplier: 1.06 },
  "Jack Eichel":           { capHit: 10.0,  yearsRemaining: 3,  hasNMC: true  },
  "Elias Pettersson":      { capHit: 11.6,  yearsRemaining: 4,  hasNTC: true,  intangibleMultiplier: 1.05 },
  "J.T. Miller":           { capHit: 8.0,   yearsRemaining: 3,  hasNTC: true  },
  "Adam Fox":              { capHit: 9.5,   yearsRemaining: 4,  intangibleMultiplier: 1.04 },
  "Alexis Lafreniere":     { capHit: 6.5,   yearsRemaining: 6,  intangibleMultiplier: 1.04 },
  "Filip Forsberg":        { capHit: 8.5,   yearsRemaining: 5,  hasNMC: true,  intangibleMultiplier: 1.04 },
  "Dylan Larkin":          { capHit: 8.7,   yearsRemaining: 5,  hasNTC: true,  intangibleMultiplier: 1.04 },
  "Tage Thompson":         { capHit: 7.142, yearsRemaining: 5,  intangibleMultiplier: 1.06 },
  "Jesper Bratt":          { capHit: 7.875, yearsRemaining: 4,  intangibleMultiplier: 1.03 },
  "Clayton Keller":        { capHit: 7.15,  yearsRemaining: 4,  intangibleMultiplier: 1.03 },
  "Kevin Fiala":           { capHit: 7.875, yearsRemaining: 4,  hasNTC: true  },

  // ── DEFENCEMEN ─────────────────────────────────────────────
  "Roman Josi":            { capHit: 9.059, yearsRemaining: 1,  hasNMC: true,  intangibleMultiplier: 1.08 },
  "Victor Hedman":         { capHit: 7.875, yearsRemaining: 1,  hasNMC: true,  intangibleMultiplier: 1.05 },
  "Charlie McAvoy":        { capHit: 9.5,   yearsRemaining: 4,  hasNTC: true,  intangibleMultiplier: 1.04 },
  "Evan Bouchard":         { capHit: 10.5,  yearsRemaining: 4,  intangibleMultiplier: 1.03 },
  "Rasmus Dahlin":         { capHit: 8.35,  yearsRemaining: 6,  intangibleMultiplier: 1.05 },
  "Josh Morrissey":        { capHit: 6.25,  yearsRemaining: 6,  intangibleMultiplier: 1.03 },
  "Dougie Hamilton":       { capHit: 9.0,   yearsRemaining: 2,  hasNTC: true,  canRetain: true },
  "Seth Jones":            { capHit: 9.5,   yearsRemaining: 3,  hasNMC: true  },
  "Shea Theodore":         { capHit: 5.8,   yearsRemaining: 3,  intangibleMultiplier: 1.02 },
  "Adam Pelech":           { capHit: 5.75,  yearsRemaining: 4  },
  "Jakob Chychrun":        { capHit: 4.6,   yearsRemaining: 3  },
  "Moritz Seider":         { capHit: 7.6,   yearsRemaining: 4,  intangibleMultiplier: 1.05 },
  "Darnell Nurse":         { capHit: 9.25,  yearsRemaining: 3,  hasNMC: true  },
  "Drew Doughty":          { capHit: 11.0,  yearsRemaining: 1,  hasNMC: true  },
  "Alex Vlasic":           { capHit: 4.6,   yearsRemaining: 6  },
  "Jake Sanderson":        { capHit: 6.75,  yearsRemaining: 6,  intangibleMultiplier: 1.04 },
  "Mikhail Sergachev":     { capHit: 8.5,   yearsRemaining: 6,  intangibleMultiplier: 1.02 },

  // ── SUPPORTING CAST ────────────────────────────────────────
  "Kyle Connor":           { capHit: 7.142, yearsRemaining: 1,  hasNTC: true,  canRetain: true },
  "Nikolaj Ehlers":        { capHit: 6.0,   yearsRemaining: 1,  canRetain: true },
  "Gabriel Vilardi":       { capHit: 5.0,   yearsRemaining: 3  },
  "Mark Scheifele":        { capHit: 8.5,   yearsRemaining: 2,  hasNMC: true  },
  "Adam Lowry":            { capHit: 2.95,  yearsRemaining: 2,  intangibleMultiplier: 1.15 },
  "Connor Hellebuyck":     { capHit: 8.5,   yearsRemaining: 3,  hasNMC: true  },
  "Ryan Nugent-Hopkins":   { capHit: 5.125, yearsRemaining: 2,  hasNTC: true  },
  "Zach Hyman":            { capHit: 5.5,   yearsRemaining: 2  },
  "Mark Stone":            { capHit: 9.5,   yearsRemaining: 2,  hasNMC: true  },
  "William Karlsson":      { capHit: 5.9,   yearsRemaining: 1  },
  "Nazem Kadri":           { capHit: 7.0,   yearsRemaining: 2,  hasNTC: true  },
  "William Nylander":      { capHit: 11.5,  yearsRemaining: 4,  hasNTC: true,  intangibleMultiplier: 1.04 },
  "John Tavares":          { capHit: 11.0,  yearsRemaining: 1,  hasNMC: true  },
  "Steven Stamkos":        { capHit: 7.5,   yearsRemaining: 2,  hasNMC: true,  intangibleMultiplier: 1.04 },
  "Joel Eriksson Ek":      { capHit: 5.25,  yearsRemaining: 3,  intangibleMultiplier: 1.03 },
  "Phillip Danault":       { capHit: 5.5,   yearsRemaining: 3,  intangibleMultiplier: 1.04 },
  "Jonathan Huberdeau":    { capHit: 10.5,  yearsRemaining: 4,  hasNTC: true  },
  "Drake Batherson":       { capHit: 4.975, yearsRemaining: 2  },
  "Alex DeBrincat":        { capHit: 8.25,  yearsRemaining: 3,  hasNTC: true,  intangibleMultiplier: 1.03 },
  "Rickard Rakell":        { capHit: 5.0,   yearsRemaining: 2,  canRetain: true },
  "Frank Nazar":           { capHit: 1.2,   yearsRemaining: 3  },
  "Valeri Nichushkin":     { capHit: 6.125, yearsRemaining: 4,  intangibleMultiplier: 1.02 },
};

