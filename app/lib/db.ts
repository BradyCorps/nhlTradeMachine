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
  { id: "ANA", name: "Anaheim Ducks",          capSpace: 46.2, standing: 32, phase: "Tanking"    },
  { id: "BOS", name: "Boston Bruins",           capSpace: 9.1,  standing: 8,  phase: "Bubble"     },
  { id: "BUF", name: "Buffalo Sabres",          capSpace: 24.8, standing: 25, phase: "Rebuilding" },
  { id: "CGY", name: "Calgary Flames",          capSpace: 17.2, standing: 19, phase: "Rebuilding"  },
  { id: "CAR", name: "Carolina Hurricanes",     capSpace: 7.4,  standing: 4,  phase: "Contender"  },
  { id: "CHI", name: "Chicago Blackhawks",      capSpace: 42.0, standing: 30, phase: "Rebuilding" },
  { id: "COL", name: "Colorado Avalanche",      capSpace: 5.2,  standing: 6,  phase: "Contender"  },
  { id: "CBJ", name: "Columbus Blue Jackets",   capSpace: 33.1, standing: 29, phase: "Rebuilding" },
  { id: "DAL", name: "Dallas Stars",            capSpace: 6.9,  standing: 3,  phase: "Contender"  },
  { id: "DET", name: "Detroit Red Wings",       capSpace: 20.3, standing: 20, phase: "Retooling"  },
  { id: "EDM", name: "Edmonton Oilers",         capSpace: 16.5, standing: 2,  phase: "Contender"  },
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
  { id: "UTA", name: "Utah Mammoth",            capSpace: 19.4, standing: 23, phase: "Retooling"  },
  { id: "VAN", name: "Vancouver Canucks",       capSpace: 10.2, standing: 12, phase: "Bubble"     },
  { id: "VGK", name: "Vegas Golden Knights",    capSpace: 1.1,  standing: 5,  phase: "Contender"  },
  { id: "WSH", name: "Washington Capitals",     capSpace: 13.5, standing: 26, phase: "Retooling"  },
  { id: "WPG", name: "Winnipeg Jets",           capSpace: 12.7, standing: 4,  phase: "Contender"  },
];