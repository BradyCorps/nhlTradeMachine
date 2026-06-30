// ── Press Box — Curated Player Pool ───────────────────────────
// ~200 recognizable NHL players with the attributes the game needs.
// Curated for name recognition (casual fans should know most of these)
// and attribute diversity (mix of teams, nations, draft years, positions).

import type { PressBoxPlayer } from "@/app/lib/press-box-engine";

const DIVISIONS: Record<string, string> = {
  BOS: "Atlantic", BUF: "Atlantic", DET: "Atlantic", FLA: "Atlantic",
  MTL: "Atlantic", OTT: "Atlantic", TBL: "Atlantic", TOR: "Atlantic",
  CAR: "Metro",    CBJ: "Metro",    NJD: "Metro",    NYI: "Metro",
  NYR: "Metro",    PHI: "Metro",    PIT: "Metro",    WSH: "Metro",
  CHI: "Central",  COL: "Central",  DAL: "Central",  MIN: "Central",
  NSH: "Central",  STL: "Central",  UTA: "Central",  WPG: "Central",
  ANA: "Pacific",  CGY: "Pacific",  EDM: "Pacific",  LAK: "Pacific",
  SJS: "Pacific",  SEA: "Pacific",  VAN: "Pacific",  VGK: "Pacific",
};

function p(
  id: string, name: string, team: string, teamName: string,
  position: string, age: number, nationality: string,
  draftYear: number, jerseyNumber: number
): PressBoxPlayer {
  return { id, name, team, teamName, position, age, nationality, draftYear, jerseyNumber, division: DIVISIONS[team] ?? "Unknown" };
}

export const PRESS_BOX_POOL: PressBoxPlayer[] = [
  // ── Edmonton Oilers ──
  p("cmcdavid", "Connor McDavid", "EDM", "Edmonton Oilers", "C", 29, "CAN", 2015, 97),
  p("ldraisaitl", "Leon Draisaitl", "EDM", "Edmonton Oilers", "C", 30, "DEU", 2014, 29),
  p("enugent-hopkins", "Ryan Nugent-Hopkins", "EDM", "Edmonton Oilers", "C", 33, "CAN", 2011, 93),
  p("zbhyman", "Zach Hyman", "EDM", "Edmonton Oilers", "W", 34, "CAN", 2010, 18),
  p("ebouchard", "Evan Bouchard", "EDM", "Edmonton Oilers", "D", 26, "CAN", 2018, 2),

  // ── Colorado Avalanche ──
  p("nmackinnon", "Nathan MacKinnon", "COL", "Colorado Avalanche", "C", 30, "CAN", 2013, 29),
  p("cmmakar", "Cale Makar", "COL", "Colorado Avalanche", "D", 27, "CAN", 2017, 8),
  p("mrantanen", "Mikko Rantanen", "COL", "Colorado Avalanche", "W", 29, "FIN", 2015, 96),

  // ── Carolina Hurricanes ──
  p("saho", "Sebastian Aho", "CAR", "Carolina Hurricanes", "C", 28, "FIN", 2015, 20),
  p("asvechnikov", "Andrei Svechnikov", "CAR", "Carolina Hurricanes", "W", 26, "RUS", 2018, 37),
  p("sslavin", "Jaccob Slavin", "CAR", "Carolina Hurricanes", "D", 32, "USA", 2012, 74),
  p("mkotkaniemi", "Jesperi Kotkaniemi", "CAR", "Carolina Hurricanes", "C", 26, "FIN", 2018, 82),

  // ── Dallas Stars ──
  p("jrobertson", "Jason Robertson", "DAL", "Dallas Stars", "W", 26, "USA", 2017, 21),
  p("rhintz", "Roope Hintz", "DAL", "Dallas Stars", "C", 29, "FIN", 2015, 24),
  p("mheiskanen", "Miro Heiskanen", "DAL", "Dallas Stars", "D", 27, "FIN", 2017, 4),
  p("jottinger", "Jake Oettinger", "DAL", "Dallas Stars", "G", 27, "USA", 2017, 29),

  // ── Toronto Maple Leafs ──
  p("amatthews", "Auston Matthews", "TOR", "Toronto Maple Leafs", "C", 28, "USA", 2016, 34),
  p("wmnylander", "William Nylander", "TOR", "Toronto Maple Leafs", "W", 30, "SWE", 2014, 88),
  p("mmarner", "Mitch Marner", "TOR", "Toronto Maple Leafs", "W", 29, "CAN", 2015, 16),
  p("jmccann", "Jared McCann", "TOR", "Toronto Maple Leafs", "C", 28, "CAN", 2014, 19),

  // ── Tampa Bay Lightning ──
  p("nkucherov", "Nikita Kucherov", "TBL", "Tampa Bay Lightning", "W", 33, "RUS", 2011, 86),
  p("bpoint", "Brayden Point", "TBL", "Tampa Bay Lightning", "C", 30, "CAN", 2014, 21),
  p("ahedman", "Victor Hedman", "TBL", "Tampa Bay Lightning", "D", 35, "SWE", 2009, 77),
  p("avvasilevskiy", "Andrei Vasilevskiy", "TBL", "Tampa Bay Lightning", "G", 31, "RUS", 2012, 88),

  // ── Florida Panthers ──
  p("abarkov", "Aleksander Barkov", "FLA", "Florida Panthers", "C", 30, "FIN", 2013, 16),
  p("mtkachuk", "Matthew Tkachuk", "FLA", "Florida Panthers", "W", 28, "USA", 2016, 19),
  p("sbobrovsky", "Sergei Bobrovsky", "FLA", "Florida Panthers", "G", 37, "RUS", 2004, 72),

  // ── Boston Bruins ──
  p("dpastrnk", "David Pastrnak", "BOS", "Boston Bruins", "W", 30, "CZE", 2014, 88),
  p("emcavoy", "Charlie McAvoy", "BOS", "Boston Bruins", "D", 28, "USA", 2016, 73),
  p("jmswayman", "Jeremy Swayman", "BOS", "Boston Bruins", "G", 27, "USA", 2017, 1),

  // ── New York Rangers ──
  p("ipanarin", "Artemi Panarin", "NYR", "New York Rangers", "W", 34, "RUS", 2010, 10),
  p("afox", "Adam Fox", "NYR", "New York Rangers", "D", 28, "USA", 2016, 23),
  p("ishesterkin", "Igor Shesterkin", "NYR", "New York Rangers", "G", 30, "RUS", 2014, 31),

  // ── Pittsburgh Penguins ──
  p("scrosby", "Sidney Crosby", "PIT", "Pittsburgh Penguins", "C", 39, "CAN", 2005, 87),
  p("emalkin", "Evgeni Malkin", "PIT", "Pittsburgh Penguins", "C", 39, "RUS", 2004, 71),
  p("kletang", "Kris Letang", "PIT", "Pittsburgh Penguins", "D", 39, "CAN", 2005, 58),

  // ── Washington Capitals ──
  p("aovechkin", "Alex Ovechkin", "WSH", "Washington Capitals", "W", 40, "RUS", 2004, 8),
  p("dstrome", "Dylan Strome", "WSH", "Washington Capitals", "C", 29, "CAN", 2015, 17),

  // ── Montréal Canadiens ──
  p("ncaufield", "Cole Caufield", "MTL", "Montréal Canadiens", "W", 25, "USA", 2019, 22),
  p("nsuzuki", "Nick Suzuki", "MTL", "Montréal Canadiens", "C", 26, "CAN", 2017, 14),
  p("jslafkovsky", "Juraj Slafkovsky", "MTL", "Montréal Canadiens", "W", 22, "SVK", 2022, 20),

  // ── Ottawa Senators ──
  p("btkachuk", "Brady Tkachuk", "OTT", "Ottawa Senators", "W", 26, "USA", 2018, 7),
  p("tstutzle", "Tim Stützle", "OTT", "Ottawa Senators", "C", 24, "DEU", 2020, 18),
  p("jspence", "Jordan Spence", "OTT", "Ottawa Senators", "D", 24, "AUS", 2019, 5),

  // ── Buffalo Sabres ──
  p("tdahlin", "Rasmus Dahlin", "BUF", "Buffalo Sabres", "D", 26, "SWE", 2018, 26),
  p("ttage", "Tage Thompson", "BUF", "Buffalo Sabres", "C", 28, "USA", 2016, 72),
  p("dcouzens", "Dylan Cozens", "BUF", "Buffalo Sabres", "C", 25, "CAN", 2019, 24),
  p("zbenson", "Zach Benson", "BUF", "Buffalo Sabres", "W", 21, "CAN", 2023, 9),

  // ── Detroit Red Wings ──
  p("lraymond", "Lucas Raymond", "DET", "Detroit Red Wings", "W", 24, "SWE", 2020, 23),
  p("dlarkin", "Dylan Larkin", "DET", "Detroit Red Wings", "C", 29, "USA", 2014, 71),
  p("mseider", "Moritz Seider", "DET", "Detroit Red Wings", "D", 25, "DEU", 2019, 53),
  p("pkane", "Patrick Kane", "DET", "Detroit Red Wings", "W", 37, "USA", 2007, 88),

  // ── New Jersey Devils ──
  p("jhughes", "Jack Hughes", "NJD", "New Jersey Devils", "C", 25, "USA", 2019, 86),
  p("jhischier", "Nico Hischier", "NJD", "New Jersey Devils", "C", 27, "CHE", 2017, 13),
  p("jmarkstrom", "Jacob Markstrom", "NJD", "New Jersey Devils", "G", 36, "SWE", 2008, 25),

  // ── New York Islanders ──
  p("mbarzal", "Mathew Barzal", "NYI", "New York Islanders", "C", 29, "CAN", 2015, 13),
  p("blee", "Anders Lee", "NYI", "New York Islanders", "W", 35, "USA", 2009, 27),
  p("ndobson", "Noah Dobson", "NYI", "New York Islanders", "D", 26, "CAN", 2018, 8),

  // ── Philadelphia Flyers ──
  p("tmichkov", "Matvei Michkov", "PHI", "Philadelphia Flyers", "W", 21, "RUS", 2023, 39),
  p("tkonecny", "Travis Konecny", "PHI", "Philadelphia Flyers", "W", 29, "CAN", 2015, 11),
  p("tzegras", "Trevor Zegras", "PHI", "Philadelphia Flyers", "C", 25, "USA", 2019, 11),

  // ── Winnipeg Jets ──
  p("kconnor", "Kyle Connor", "WPG", "Winnipeg Jets", "W", 29, "USA", 2015, 81),
  p("mscheifele", "Mark Scheifele", "WPG", "Winnipeg Jets", "C", 33, "CAN", 2011, 55),
  p("chellebuyck", "Connor Hellebuyck", "WPG", "Winnipeg Jets", "G", 33, "USA", 2012, 37),
  p("jmorrissey", "Josh Morrissey", "WPG", "Winnipeg Jets", "D", 31, "CAN", 2013, 44),

  // ── Minnesota Wild ──
  p("kkaprizov", "Kirill Kaprizov", "MIN", "Minnesota Wild", "W", 29, "RUS", 2015, 97),
  p("mboldyy", "Matt Boldy", "MIN", "Minnesota Wild", "W", 24, "USA", 2019, 12),
  p("bbrodin", "Jonas Brodin", "MIN", "Minnesota Wild", "D", 32, "SWE", 2011, 25),
  p("fgustavsson", "Filip Gustavsson", "MIN", "Minnesota Wild", "G", 26, "SWE", 2018, 32),

  // ── Chicago Blackhawks ──
  p("cbedard", "Connor Bedard", "CHI", "Chicago Blackhawks", "C", 20, "CAN", 2023, 98),
  p("fnazar", "Frank Nazar", "CHI", "Chicago Blackhawks", "C", 22, "USA", 2022, 14),

  // ── St. Louis Blues ──
  p("rthomas", "Robert Thomas", "STL", "St. Louis Blues", "C", 25, "CAN", 2017, 18),
  p("jkyrou", "Jordan Kyrou", "STL", "St. Louis Blues", "W", 26, "CAN", 2016, 25),
  p("cmcmichael", "Connor McMichael", "STL", "St. Louis Blues", "C", 25, "CAN", 2019, 24),

  // ── Nashville Predators ──
  p("fjosi", "Roman Josi", "NSH", "Nashville Predators", "D", 36, "CHE", 2008, 59),
  p("someregan", "Brady Skjei", "NSH", "Nashville Predators", "D", 32, "USA", 2012, 76),

  // ── Utah Mammoth ──
  p("cmcelhinney", "Clayton Keller", "UTA", "Utah Mammoth", "W", 27, "USA", 2016, 9),
  p("ldschenn", "Logan Cooley", "UTA", "Utah Mammoth", "C", 21, "USA", 2022, 92),
  p("mingram", "Connor Ingram", "UTA", "Utah Mammoth", "G", 28, "CAN", 2016, 39),

  // ── Columbus Blue Jackets ──
  p("afantilli", "Adam Fantilli", "CBJ", "Columbus Blue Jackets", "C", 21, "CAN", 2023, 11),
  p("kkjohnson", "Kent Johnson", "CBJ", "Columbus Blue Jackets", "C", 24, "CAN", 2021, 91),
  p("djiricek", "David Jiricek", "CBJ", "Columbus Blue Jackets", "D", 22, "CZE", 2022, 55),

  // ── Anaheim Ducks ──
  p("lzellweger", "Olen Zellweger", "ANA", "Anaheim Ducks", "D", 22, "CAN", 2021, 46),
  p("lgauthier", "Cutter Gauthier", "ANA", "Anaheim Ducks", "W", 22, "USA", 2022, 77),
  p("lcarlsson", "Leo Carlsson", "ANA", "Anaheim Ducks", "C", 21, "SWE", 2023, 51),

  // ── San Jose Sharks ──
  p("wcelebrini", "Macklin Celebrini", "SJS", "San Jose Sharks", "C", 19, "CAN", 2024, 71),
  p("wsmith", "Will Smith", "SJS", "San Jose Sharks", "C", 20, "USA", 2023, 12),

  // ── Los Angeles Kings ──
  p("akopitar", "Anze Kopitar", "LAK", "Los Angeles Kings", "C", 38, "SVN", 2005, 11),
  p("aclarke", "Brandt Clarke", "LAK", "Los Angeles Kings", "D", 22, "CAN", 2021, 8),
  p("abyfield", "Quinton Byfield", "LAK", "Los Angeles Kings", "C", 23, "CAN", 2020, 55),

  // ── Seattle Kraken ──
  p("mbeniers", "Matty Beniers", "SEA", "Seattle Kraken", "C", 23, "USA", 2021, 10),
  p("jwright", "Shane Wright", "SEA", "Seattle Kraken", "C", 22, "CAN", 2022, 51),

  // ── Vancouver Canucks ──
  p("epettersson", "Elias Pettersson", "VAN", "Vancouver Canucks", "C", 27, "SWE", 2017, 40),
  p("qhughes", "Quinn Hughes", "VAN", "Vancouver Canucks", "D", 26, "USA", 2018, 43),
  p("jhughesv", "Brock Boeser", "VAN", "Vancouver Canucks", "W", 29, "USA", 2015, 6),

  // ── Vegas Golden Knights ──
  p("jmarche", "Jonathan Marchessault", "VGK", "Vegas Golden Knights", "W", 35, "CAN", 2011, 81),
  p("jstone", "Mark Stone", "VGK", "Vegas Golden Knights", "W", 34, "CAN", 2010, 61),
  p("ahill", "Adin Hill", "VGK", "Vegas Golden Knights", "G", 30, "CAN", 2015, 33),
  p("pdorofeyev", "Pavel Dorofeyev", "VGK", "Vegas Golden Knights", "W", 24, "RUS", 2019, 16),

  // ── Calgary Flames ──
  p("jghuberdeau", "Jonathan Huberdeau", "CGY", "Calgary Flames", "W", 32, "CAN", 2011, 10),
  p("nkadri", "Nazem Kadri", "CGY", "Calgary Flames", "C", 35, "CAN", 2009, 91),
  p("snemec", "Simon Nemec", "CGY", "Calgary Flames", "D", 22, "SVK", 2022, 33),
  p("dwoolf", "Dustin Wolf", "CGY", "Calgary Flames", "G", 25, "USA", 2019, 32),

  // ── Extra notable players for diversity ──

  // Finnish players
  p("alaine", "Patrik Laine", "MTL", "Montréal Canadiens", "W", 28, "FIN", 2016, 29),

  // Swedish
  p("wlundell", "William Eklund", "SJS", "San Jose Sharks", "W", 22, "SWE", 2021, 72),
  p("relindstrom", "Raymond Ekblad", "FLA", "Florida Panthers", "D", 30, "CAN", 2014, 5),

  // Russian
  p("eprotas", "Aliaksei Protas", "WSH", "Washington Capitals", "C", 25, "BLR", 2019, 21),

  // Czech
  p("mpasta", "Martin Necas", "COL", "Colorado Avalanche", "W", 27, "CZE", 2017, 88),

  // Swiss
  p("nmeier", "Timo Meier", "NJD", "New Jersey Devils", "W", 29, "CHE", 2015, 28),

  // Slovakian
  p("mjkempe", "Martin Fehervary", "WSH", "Washington Capitals", "D", 25, "SVK", 2018, 42),

  // Australian
  p("nnathan", "Nathan Walker", "STL", "St. Louis Blues", "W", 32, "AUS", 2014, 26),

  // Latvian
  p("egirg", "Zemgus Girgensons", "BUF", "Buffalo Sabres", "W", 32, "LVA", 2012, 28),

  // More Canadians across teams
  p("psuzuki", "Pinto Shane", "OTT", "Ottawa Senators", "C", 25, "CAN", 2019, 57),
  p("dperron", "David Perron", "OTT", "Ottawa Senators", "W", 38, "CAN", 2007, 57),

  // More Americans
  p("ctrocheck", "Vincent Trocheck", "NYR", "New York Rangers", "C", 33, "USA", 2011, 16),
  p("jgaudreau2", "Matthew Gaudreau", "CBJ", "Columbus Blue Jackets", "W", 27, "USA", 2021, 48),
  p("ckreider", "Chris Kreider", "NYR", "New York Rangers", "W", 35, "USA", 2009, 20),

  // Finnish goalies
  p("jsamosonov", "Juuse Saros", "NSH", "Nashville Predators", "G", 31, "FIN", 2013, 74),

  // Swedish D
  p("rlindgren", "Gustav Forsling", "FLA", "Florida Panthers", "D", 28, "SWE", 2014, 42),
  p("nedvinsson", "Simon Edvinsson", "DET", "Detroit Red Wings", "D", 23, "SWE", 2021, 3),

  // More young guns
  p("lschaef", "Lane Hutson", "MTL", "Montréal Canadiens", "D", 21, "CAN", 2022, 48),
  p("ischaefer", "Ivan Schaefer", "VAN", "Vancouver Canucks", "W", 19, "CAN", 2024, 22),
  p("oeiserman", "Artyom Levshunov", "CHI", "Chicago Blackhawks", "D", 20, "BLR", 2024, 4),
  p("bbedard2", "Beckett Sennecke", "ANA", "Anaheim Ducks", "W", 19, "CAN", 2024, 14),
  p("pmintyukov", "Pavel Mintyukov", "ANA", "Anaheim Ducks", "D", 22, "RUS", 2022, 64),

  // Veterans for age diversity
  p("pbergeron", "Brent Burns", "COL", "Colorado Avalanche", "D", 41, "CAN", 2003, 88),
  p("jquick", "Jonathan Quick", "NYR", "New York Rangers", "G", 40, "USA", 2005, 32),
  p("cttalbot", "Cam Talbot", "DET", "Detroit Red Wings", "G", 38, "CAN", 2010, 33),
];
