// ============================================================
// SOURCE OF TRUTH — team metadata and fallback data
//
// TEAMS_DB is used by /api/league/route.ts as:
//   1. The authoritative list of all 32 team IDs and names
//   2. Fallback standings/capSpace if the NHL API is unreachable
//   3. Phase fallback if derivePhase() can't run
//
// Contract data
//   - app/data/contracts.bundled.json  (primary)
//   - app/data/contracts.extensions.json (in-season extensions)
//   - app/data/contracts.json (additional overrides)

// ============================================================

export const TEAMS_DB = [
 
  { id: "ANA", name: "Anaheim Ducks",           capSpace: 12.6, standing: 15, phase: "Bubble"     },
  { id: "BOS", name: "Boston Bruins",           capSpace: 2.9,  standing: 8,  phase: "Contender"  },
  { id: "BUF", name: "Buffalo Sabres",          capSpace: 4.4,  standing: 4,  phase: "Contender"  },
  { id: "CGY", name: "Calgary Flames",          capSpace: 14.0, standing: 30, phase: "Tanking" },
  { id: "CAR", name: "Carolina Hurricanes",     capSpace: 7.9,  standing: 2,  phase: "Contender"  },
  { id: "CHI", name: "Chicago Blackhawks",      capSpace: 16.6, standing: 31, phase: "Rebuilding" },
  { id: "COL", name: "Colorado Avalanche",      capSpace: -1.9, standing: 1,  phase: "Contender"  },
  { id: "CBJ", name: "Columbus Blue Jackets",   capSpace: 5.6,  standing: 17, phase: "Retooling"  },
  { id: "DAL", name: "Dallas Stars",            capSpace: -4.2, standing: 3,  phase: "Contender"  },
  { id: "DET", name: "Detroit Red Wings",       capSpace: 8.9,  standing: 18, phase: "Retooling"  },
  { id: "EDM", name: "Edmonton Oilers",         capSpace: -0.1, standing: 14, phase: "Bubble"     },
  { id: "FLA", name: "Florida Panthers",        capSpace: -3.7, standing: 25, phase: "Retooling"  },
  { id: "LAK", name: "Los Angeles Kings",       capSpace: 4.7,  standing: 20, phase: "Retooling"  },
  { id: "MIN", name: "Minnesota Wild",          capSpace: -2.5, standing: 7,  phase: "Contender"  },
  { id: "MTL", name: "Montréal Canadiens",      capSpace: -1.9, standing: 6,  phase: "Contender"  },
  { id: "NSH", name: "Nashville Predators",     capSpace: 14.3, standing: 24, phase: "Retooling"  },
  { id: "NJD", name: "New Jersey Devils",       capSpace: 0.3,  standing: 21, phase: "Retooling"  },
  { id: "NYI", name: "New York Islanders",      capSpace: -7.0, standing: 19, phase: "Retooling"  },
  { id: "NYR", name: "New York Rangers",        capSpace: 8.1,  standing: 29, phase: "Tanking" },
  { id: "OTT", name: "Ottawa Senators",         capSpace: 3.0,  standing: 9,  phase: "Bubble"     },
  { id: "PHI", name: "Philadelphia Flyers",     capSpace: 10.3, standing: 11, phase: "Bubble"     },
  { id: "PIT", name: "Pittsburgh Penguins",     capSpace: 15.3, standing: 10, phase: "Bubble"     },
  { id: "SEA", name: "Seattle Kraken",          capSpace: 7.6,  standing: 27, phase: "Rebuilding" },
  { id: "SJS", name: "San Jose Sharks",         capSpace: 22.3, standing: 23, phase: "Bubble"  },
  { id: "STL", name: "St. Louis Blues",         capSpace: 9.5,  standing: 22, phase: "Retooling"  },
  { id: "TBL", name: "Tampa Bay Lightning",     capSpace: 0.9,  standing: 5,  phase: "Contender"  },
  { id: "TOR", name: "Toronto Maple Leafs",     capSpace: 9.6,  standing: 28, phase: "Rebuilding" },
  { id: "UTA", name: "Utah Mammoth",            capSpace: 4.6,  standing: 16, phase: "Bubble"     },
  { id: "VAN", name: "Vancouver Canucks",       capSpace: 10.4, standing: 32, phase: "Tanking"    },
  { id: "VGK", name: "Vegas Golden Knights",    capSpace: -6.8, standing: 13, phase: "Bubble"     },
  { id: "WSH", name: "Washington Capitals",     capSpace: 14.6, standing: 12, phase: "Bubble"     },
  { id: "WPG", name: "Winnipeg Jets",           capSpace: 5.0,  standing: 26, phase: "Retooling" },
];
