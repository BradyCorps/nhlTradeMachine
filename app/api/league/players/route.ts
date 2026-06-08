import { NextResponse } from "next/server";
import { SEASON } from "@/app/lib/season-config";
import { TEAMS_DB } from "@/app/lib/db";
import { scrapeCapWages } from "@/app/services/scraper";
import { redis } from "@/app/lib/redis";
import { db } from "@/app/db/client";
import { players as playersTable, tradeBlock as tradeBlockTable, teams as teamsTable } from "@/app/db/schema";

export const dynamic = "force-dynamic";

const CONTRACTS_CACHE_TTL = 23 * 60 * 60; // 23 hours
const MONEYPUCK_CACHE_TTL =  4 * 60 * 60; // 4 hours
const PS_CACHE_TTL        = 12 * 60 * 60; // 12 hours

// Manual overrides for contracts where the CapWages scraper's age-based year calculation
// is unreliable (e.g. back-loaded extensions where ageSigned ≠ effective start year).
const CONTRACT_OVERRIDES: Record<string, { capHit?: number; yearsRemaining?: number; position?: string }> = {
  "Quinton Byfield":  { position: "C" },          // NHL API sometimes tags as "LW"
  "Mark Scheifele":   { yearsRemaining: 5 },       // 8yr/2023→2031; scraper age math gives 1
  "Aaron Ekblad":     { capHit: 6.1, yearsRemaining: 8 }, // 8yr/2025→2033; extension announced 2024 so ageSigned is off by 1
};

const NHL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin": "https://www.nhl.com",
  "Referer": "https://www.nhl.com/",
};

const fetchWithTimeout = (url: string, ms = 8000, extraHeaders: Record<string, string> = {}): Promise<Response> => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, {
    signal: ctrl.signal,
    cache: "no-store",
    headers: { ...extraHeaders },
  }).finally(() => clearTimeout(t));
};

const parseCSVRow = (row: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of row) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
};

const slugify = (n: string) =>
  n.toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim().replace(/\s+/g, "-");

const buildFallbackMap = (map: Map<string, any>) => {
  const fb = new Map<string, any>();
  map.forEach((val, slug) => {
    const last = slug.split("-").slice(-1)[0];
    fb.set(last, fb.has(last) ? null : val);
  });
  return fb;
};

const normalisePos = (code: string) =>
  code === "L" || code === "R" ? "W" : code;

const calcAge = (birthDate: string): number => {
  const b = new Date(birthDate);
  const n = new Date();
  let age = n.getFullYear() - b.getFullYear();
  const m = n.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) age--;
  return age;
};

// ============================================================
// STATIC ROSTER — ~15 players per team, no duplicates
// Format: [teamId, name, position, birthDate]
// ============================================================
const STATIC_ROSTER: [string, string, string, string][] = [
  // ANA
  ["ANA","Mason McTavish","C","2003-01-30"],
  ["ANA","Leo Carlsson","C","2004-04-09"],
  ["ANA","Trevor Zegras","C","2001-03-20"],
  ["ANA","Troy Terry","W","1997-09-10"],
  ["ANA","Frank Vatrano","W","1994-03-14"],
  ["ANA","Alex Killorn","W","1989-09-14"],
  ["ANA","Brock McGinn","W","1994-02-02"],
  ["ANA","Cam Fowler","D","1991-12-05"],
  ["ANA","Jackson LaCombe","D","2001-06-12"],
  ["ANA","Radko Gudas","D","1990-06-05"],
  ["ANA","Urho Vaakanainen","D","1999-03-20"],
  ["ANA","Pavel Mintyukov","D","2003-10-05"],
  ["ANA","Brian Dumoulin","D","1991-09-06"],
  // BOS
  ["BOS","David Pastrnak","W","1996-05-25"],
  ["BOS","Brad Marchand","W","1988-05-11"],
  ["BOS","Morgan Geekie","C","1998-07-20"],
  ["BOS","Pavel Zacha","C","1997-04-06"],
  ["BOS","Elias Lindholm","C","1994-12-02"],
  ["BOS","Casey Mittelstadt","C","1998-11-22"],
  ["BOS","Fraser Minten","C","2004-03-05"],
  ["BOS","Charlie McAvoy","D","1997-12-21"],
  ["BOS","Hampus Lindholm","D","1993-01-20"],
  ["BOS","Mason Lohrei","D","2001-09-06"],
  ["BOS","Nikita Zadorov","D","1995-04-16"],
  ["BOS","Andrew Peeke","D","1997-03-17"],
  // BUF
  ["BUF","Tage Thompson","C","1997-10-30"],
  ["BUF","Dylan Cozens","C","2001-02-09"],
  ["BUF","JJ Peterka","W","2002-01-14"],
  ["BUF","Jack Quinn","W","2001-09-19"],
  ["BUF","Alex Tuch","W","1996-02-17"],
  ["BUF","Zach Benson","W","2004-05-12"],
  ["BUF","Jason Zucker","W","1992-01-16"],
  ["BUF","Rasmus Dahlin","D","2000-04-13"],
  ["BUF","Owen Power","D","2002-11-22"],
  ["BUF","Bowen Byram","D","2001-06-13"],
  ["BUF","Mattias Samuelsson","D","1999-03-17"],
  ["BUF","Henri Jokiharju","D","1999-06-17"],
  // CGY
  ["CGY","Nazem Kadri","C","1990-10-06"],
  ["CGY","Yegor Sharangovich","C","1998-06-06"],
  ["CGY","Jonathan Huberdeau","W","1993-06-04"],
  ["CGY","Blake Coleman","W","1991-11-28"],
  ["CGY","Matt Coronato","W","2002-10-11"],
  ["CGY","Joel Farabee","W","1999-08-25"],
  ["CGY","MacKenzie Weegar","D","1994-01-07"],
  ["CGY","Rasmus Andersson","D","1996-10-27"],
  ["CGY","Kevin Bahl","D","2000-05-27"],
  ["CGY","Zayne Parekh","D","2005-04-02"],
  // CAR
  ["CAR","Sebastian Aho","C","1997-07-26"],
  ["CAR","Seth Jarvis","C","2002-02-01"],
  ["CAR","Jordan Staal","C","1988-09-10"],
  ["CAR","Andrei Svechnikov","W","2000-03-26"],
  ["CAR","Nikolaj Ehlers","W","1996-02-14"],
  ["CAR","Taylor Hall","W","1991-11-14"],
  ["CAR","Jaccob Slavin","D","1994-05-01"],
  ["CAR","Shayne Gostisbehere","D","1993-04-20"],
  ["CAR","Brady Skjei","D","1994-03-26"],
  ["CAR","KAndre Miller","D","1999-01-21"],
  ["CAR","Sean Walker","D","1994-11-05"],
  // CHI
  ["CHI","Connor Bedard","C","2005-07-17"],
  ["CHI","Frank Nazar","C","2003-06-10"],
  ["CHI","Ryan Greene","C","2003-04-16"],
  ["CHI","Tyler Bertuzzi","W","1995-02-24"],
  ["CHI","Ilya Mikheyev","W","1994-10-10"],
  ["CHI","Nick Lardis","W","2004-08-05"],
  ["CHI","Seth Jones","D","1994-10-03"],
  ["CHI","Alex Vlasic","D","2002-07-10"],
  ["CHI","Kevin Korchinski","D","2003-09-09"],
  ["CHI","Artyom Levshunov","D","2005-02-08"],
  ["CHI","Wyatt Kaiser","D","2002-03-01"],
  // COL
  ["COL","Nathan MacKinnon","C","1995-09-01"],
  ["COL","Martin Necas","C","1999-01-15"],
  ["COL","Nazem Kadri","C","1990-10-06"],
  ["COL","Mikko Rantanen","W","1996-10-29"],
  ["COL","Valeri Nichushkin","W","1995-03-04"],
  ["COL","Artturi Lehkonen","W","1995-07-04"],
  ["COL","Gabriel Landeskog","W","1992-11-23"],
  ["COL","Cale Makar","D","1998-10-30"],
  ["COL","Devon Toews","D","1994-02-27"],
  ["COL","Josh Manson","D","1991-10-07"],
  ["COL","Brent Burns","D","1985-03-09"],
  // CBJ
  ["CBJ","Adam Fantilli","C","2004-01-13"],
  ["CBJ","Sean Monahan","C","1994-10-12"],
  ["CBJ","Kirill Marchenko","W","2000-08-08"],
  ["CBJ","Dmitri Voronkov","W","1999-07-28"],
  ["CBJ","Ivan Provorov","D","1997-01-13"],
  ["CBJ","Zach Werenski","D","1996-07-19"],
  ["CBJ","David Jiricek","D","2003-04-09"],
  ["CBJ","Jake Bean","D","1998-06-09"],
  // DAL
  ["DAL","Jason Robertson","W","1999-07-22"],
  ["DAL","Roope Hintz","C","1997-03-03"],
  ["DAL","Wyatt Johnston","C","2003-05-14"],
  ["DAL","Tyler Seguin","C","1992-01-31"],
  ["DAL","Matt Duchene","C","1991-01-16"],
  ["DAL","Logan Stankoven","C","2002-11-16"],
  ["DAL","Miro Heiskanen","D","1999-07-18"],
  ["DAL","Thomas Harley","D","2002-08-19"],
  ["DAL","Esa Lindell","D","1994-05-23"],
  ["DAL","Brendan Smith","D","1988-02-08"],
  // DET
  ["DET","Dylan Larkin","C","1996-07-30"],
  ["DET","Alex DeBrincat","W","1997-12-18"],
  ["DET","Lucas Raymond","W","2002-03-28"],
  ["DET","Patrick Kane","W","1988-11-19"],
  ["DET","Andrew Copp","C","1994-07-08"],
  ["DET","Robby Fabbri","C","1996-01-22"],
  ["DET","Moritz Seider","D","2001-04-06"],
  ["DET","Simon Edvinsson","D","2003-02-13"],
  ["DET","Ben Chiarot","D","1991-05-09"],
  ["DET","Jeff Petry","D","1987-12-09"],
  // EDM
  ["EDM","Connor McDavid","C","1997-01-13"],
  ["EDM","Leon Draisaitl","C","1995-10-27"],
  ["EDM","Ryan Nugent-Hopkins","C","1992-04-12"],
  ["EDM","Zach Hyman","W","1992-06-09"],
  ["EDM","Vasily Podkolzin","W","2001-06-24"],
  ["EDM","Kasperi Kapanen","W","1996-07-23"],
  ["EDM","Matt Savoie","C","2003-07-17"],
  ["EDM","Jack Roslovic","C","1996-01-29"],
  ["EDM","Evan Bouchard","D","1999-10-20"],
  ["EDM","Darnell Nurse","D","1995-02-04"],
  ["EDM","Mattias Ekholm","D","1990-05-03"],
  ["EDM","Brett Kulak","D","1994-01-06"],
  ["EDM","Connor Murphy","D","1992-03-26"],
  // FLA
  ["FLA","Aleksander Barkov","C","1995-09-02"],
  ["FLA","Sam Reinhart","W","1995-11-06"],
  ["FLA","Matthew Tkachuk","W","1997-12-11"],
  ["FLA","Carter Verhaeghe","W","1995-08-14"],
  ["FLA","Evan Rodrigues","C","1993-07-28"],
  ["FLA","Eetu Luostarinen","C","1998-09-02"],
  ["FLA","Aaron Ekblad","D","1996-02-07"],
  ["FLA","Gustav Forsling","D","1996-06-12"],
  ["FLA","Niko Mikkola","D","1996-04-26"],
  ["FLA","Brandon Montour","D","1994-04-11"],
  // LAK
  ["LAK","Anze Kopitar","C","1987-08-24"],
  ["LAK","Quinton Byfield","C","2002-08-13"],
  ["LAK","Kevin Fiala","W","1996-07-22"],
  ["LAK","Adrian Kempe","W","1996-09-20"],
  ["LAK","Artemi Panarin","W","1991-10-30"],
  ["LAK","Alex Laferriere","W","2001-12-08"],
  ["LAK","Trevor Moore","W","1995-01-31"],
  ["LAK","Drew Doughty","D","1989-12-08"],
  ["LAK","Mikey Anderson","D","1999-05-07"],
  ["LAK","Brandt Clarke","D","2002-11-27"],
  ["LAK","Joel Edmundson","D","1993-09-28"],
  // MIN
  ["MIN","Kirill Kaprizov","W","1997-04-26"],
  ["MIN","Matt Boldy","W","2001-04-05"],
  ["MIN","Joel Eriksson Ek","C","1997-07-29"],
  ["MIN","Marco Rossi","C","2002-06-23"],
  ["MIN","Ryan Hartman","W","1994-09-20"],
  ["MIN","Marcus Johansson","W","1990-10-06"],
  ["MIN","Mats Zuccarello","W","1987-09-01"],
  ["MIN","Quinn Hughes","D","2000-10-14"],
  ["MIN","Jonas Brodin","D","1993-07-12"],
  ["MIN","Brock Faber","D","2002-05-28"],
  ["MIN","Jake Middleton","D","1996-02-04"],
  ["MIN","Jared Spurgeon","D","1989-11-29"],
  // MTL
  ["MTL","Nick Suzuki","C","1999-08-10"],
  ["MTL","Cole Caufield","W","2001-01-02"],
  ["MTL","Juraj Slafkovsky","W","2004-03-30"],
  ["MTL","Ivan Demidov","W","2005-10-14"],
  ["MTL","Kirby Dach","C","2001-01-21"],
  ["MTL","Phillip Danault","C","1993-04-24"],
  ["MTL","Alex Newhook","C","2001-01-28"],
  ["MTL","Jake Evans","C","1996-06-02"],
  ["MTL","Lane Hutson","D","2003-02-12"],
  ["MTL","Mike Matheson","D","1994-02-27"],
  ["MTL","Kaiden Guhle","D","2002-01-18"],
  ["MTL","Noah Dobson","D","2000-01-07"],
  ["MTL","Alexandre Carrier","D","1997-10-08"],
  // NSH
  ["NSH","Filip Forsberg","W","1994-08-13"],
  ["NSH","Ryan O'Reilly","C","1991-02-07"],
  ["NSH","Steven Stamkos","C","1990-02-07"],
  ["NSH","Jonathan Marchessault","C","1990-12-27"],
  ["NSH","Luke Evangelista","W","2001-12-25"],
  ["NSH","Roman Josi","D","1990-06-01"],
  ["NSH","Brady Skjei","D","1994-03-26"],
  ["NSH","Alexandre Carrier","D","1997-10-08"],
  ["NSH","Nick Perbix","D","1997-12-14"],
  // NJD
  ["NJD","Jack Hughes","C","2001-05-14"],
  ["NJD","Nico Hischier","C","1999-01-04"],
  ["NJD","Timo Meier","W","1996-10-08"],
  ["NJD","Jesper Bratt","W","1998-07-30"],
  ["NJD","Dawson Mercer","C","2002-10-27"],
  ["NJD","Stefan Noesen","W","1993-02-26"],
  ["NJD","Dougie Hamilton","D","1993-06-17"],
  ["NJD","Jonas Siegenthaler","D","1997-05-06"],
  ["NJD","Luke Hughes","D","2003-09-09"],
  ["NJD","Brendan Smith","D","1988-02-08"],
  // NYI
  ["NYI","Mathew Barzal","C","1997-05-26"],
  ["NYI","Bo Horvat","C","1995-04-05"],
  ["NYI","Jean-Gabriel Pageau","C","1992-11-11"],
  ["NYI","Brock Nelson","C","1991-10-15"],
  ["NYI","Simon Holmstrom","W","2001-10-15"],
  ["NYI","Anders Lee","W","1990-07-03"],
  ["NYI","Noah Dobson","D","2000-01-07"],
  ["NYI","Ryan Pulock","D","1994-10-18"],
  ["NYI","Adam Pelech","D","1994-08-16"],
  ["NYI","Alexander Romanov","D","2000-02-06"],
  ["NYI","Matthew Schaefer","D","2007-02-13"],
  // NYR
  ["NYR","Mika Zibanejad","C","1993-04-18"],
  ["NYR","Vincent Trocheck","C","1993-07-11"],
  ["NYR","Artemi Panarin","W","1991-10-30"],
  ["NYR","Alexis Lafreniere","W","2001-10-11"],
  ["NYR","Chris Kreider","W","1991-04-30"],
  ["NYR","Will Cuylle","W","2002-02-05"],
  ["NYR","Gabe Perreault","W","2004-08-02"],
  ["NYR","JT Miller","C","1993-03-14"],
  ["NYR","Adam Fox","D","1998-02-17"],
  ["NYR","Braden Schneider","D","2001-09-20"],
  ["NYR","Vladislav Gavrikov","D","1995-11-15"],
  ["NYR","K'Andre Miller","D","1999-01-21"],
  // OTT
  ["OTT","Tim Stutzle","C","2002-01-15"],
  ["OTT","Brady Tkachuk","W","1999-09-16"],
  ["OTT","Drake Batherson","W","1998-04-27"],
  ["OTT","Dylan Cozens","C","2001-02-09"],
  ["OTT","Claude Giroux","W","1988-01-12"],
  ["OTT","Shane Pinto","C","2000-11-07"],
  ["OTT","Ridly Greig","C","2002-08-08"],
  ["OTT","Jake Sanderson","D","2002-07-08"],
  ["OTT","Thomas Chabot","D","1997-01-30"],
  ["OTT","Artem Zub","D","1995-10-03"],
  ["OTT","Jordan Spence","D","2000-09-28"],
  // PHI
  ["PHI","Sean Couturier","C","1992-12-07"],
  ["PHI","Travis Konecny","W","1997-03-11"],
  ["PHI","Matvei Michkov","W","2004-11-06"],
  ["PHI","Owen Tippett","W","1999-02-16"],
  ["PHI","Joel Farabee","W","1999-08-25"],
  ["PHI","Morgan Frost","C","1999-05-14"],
  ["PHI","Travis Sanheim","D","1996-03-29"],
  ["PHI","Cam York","D","2001-01-05"],
  ["PHI","Ivan Provorov","D","1997-01-13"],
  ["PHI","Sean Walker","D","1994-11-05"],
  // PIT
  ["PIT","Sidney Crosby","C","1987-08-07"],
  ["PIT","Evgeni Malkin","C","1986-07-31"],
  ["PIT","Rickard Rakell","W","1993-05-05"],
  ["PIT","Bryan Rust","W","1991-05-11"],
  ["PIT","Reilly Smith","W","1991-04-01"],
  ["PIT","Kris Letang","D","1987-04-24"],
  ["PIT","Erik Karlsson","D","1990-05-31"],
  ["PIT","Marcus Pettersson","D","1996-05-08"],
  ["PIT","Matt Grzelcyk","D","1994-01-05"],
  // SEA
  ["SEA","Matty Beniers","C","2002-11-05"],
  ["SEA","Jared McCann","C","1996-05-31"],
  ["SEA","Jordan Eberle","W","1990-05-15"],
  ["SEA","Chandler Stephenson","C","1993-08-09"],
  ["SEA","Eeli Tolvanen","W","1998-04-02"],
  ["SEA","Kaapo Kakko","W","2001-02-15"],
  ["SEA","Shane Wright","C","2003-01-05"],
  ["SEA","Vince Dunn","D","1996-10-29"],
  ["SEA","Adam Larsson","D","1992-11-12"],
  ["SEA","Brandon Montour","D","1994-04-11"],
  ["SEA","Ryker Evans","D","2001-11-06"],
  // SJS
  ["SJS","Macklin Celebrini","C","2006-01-05"],
  ["SJS","Will Smith","C","2004-02-21"],
  ["SJS","William Eklund","W","2003-10-12"],
  ["SJS","Tyler Toffoli","W","1992-04-24"],
  ["SJS","Fabian Zetterlund","W","1999-08-26"],
  ["SJS","Alexander Wennberg","C","1994-09-22"],
  ["SJS","Collin Graf","W","2002-07-07"],
  ["SJS","Mario Ferraro","D","1998-09-17"],
  ["SJS","Dmitry Orlov","D","1991-07-23"],
  ["SJS","Jake Walman","D","1996-02-10"],
  ["SJS","Sam Dickinson","D","2005-11-15"],
  // STL
  ["STL","Robert Thomas","C","1999-07-02"],
  ["STL","Jordan Kyrou","W","1998-05-05"],
  ["STL","Pavel Buchnevich","W","1995-04-17"],
  ["STL","Dylan Holloway","W","2002-01-23"],
  ["STL","Jake Neighbours","W","2002-03-30"],
  ["STL","Jimmy Snuggerud","W","2004-06-25"],
  ["STL","Colton Parayko","D","1993-05-12"],
  ["STL","Philip Broberg","D","2001-07-11"],
  ["STL","Cam Fowler","D","1991-12-05"],
  ["STL","Logan Mailloux","D","2002-09-22"],
  // TBL
  ["TBL","Nikita Kucherov","W","1993-06-17"],
  ["TBL","Brayden Point","C","1996-03-13"],
  ["TBL","Brandon Hagel","W","1998-08-27"],
  ["TBL","Jake Guentzel","C","1994-10-06"],
  ["TBL","Anthony Cirelli","C","1997-07-15"],
  ["TBL","Steven Stamkos","C","1990-02-07"],
  ["TBL","Yanni Gourde","C","1991-12-15"],
  ["TBL","Victor Hedman","D","1990-12-18"],
  ["TBL","Mikhail Sergachev","D","1998-06-25"],
  ["TBL","Erik Cernak","D","1997-05-28"],
  ["TBL","Darren Raddysh","D","1995-08-10"],
  // TOR
  ["TOR","Auston Matthews","C","1997-09-17"],
  ["TOR","Mitch Marner","W","1997-05-05"],
  ["TOR","William Nylander","W","1996-05-01"],
  ["TOR","John Tavares","C","1990-09-20"],
  ["TOR","Matthew Knies","W","2003-03-25"],
  ["TOR","Max Domi","C","1995-03-02"],
  ["TOR","Nicholas Robertson","W","2001-09-11"],
  ["TOR","Morgan Rielly","D","1994-03-09"],
  ["TOR","Jake McCabe","D","1993-10-12"],
  ["TOR","Chris Tanev","D","1989-12-20"],
  ["TOR","Timothy Liljegren","D","1999-04-30"],
  // UTA
  ["UTA","Clayton Keller","C","1998-07-29"],
  ["UTA","Nick Schmaltz","C","1996-02-15"],
  ["UTA","Logan Cooley","C","2003-05-04"],
  ["UTA","Lawson Crouse","W","1997-06-23"],
  ["UTA","Dylan Guenther","W","2003-06-24"],
  ["UTA","Mikhail Sergachev","D","1998-06-25"],
  ["UTA","Juuso Valimaki","D","1998-10-06"],
  ["UTA","Sean Durzi","D","1998-10-03"],
  ["UTA","Ian Cole","D","1989-02-21"],
  // VAN
  ["VAN","Elias Pettersson","C","1998-11-12"],
  ["VAN","JT Miller","C","1993-03-14"],
  ["VAN","Brock Boeser","W","1997-02-25"],
  ["VAN","Jake DeBrusk","W","1999-10-17"],
  ["VAN","Conor Garland","W","1996-03-11"],
  ["VAN","Nils Hoglander","W","2000-10-20"],
  ["VAN","Quinn Hughes","D","2000-10-14"],
  ["VAN","Filip Hronek","D","1997-11-02"],
  ["VAN","Marcus Pettersson","D","1996-05-08"],
  ["VAN","Nikita Zadorov","D","1995-04-16"],
  ["VAN","Tom Willander","D","2004-06-05"],
  // VGK
  ["VGK","Jack Eichel","C","1996-10-28"],
  ["VGK","Mitch Marner","W","1997-05-05"],
  ["VGK","Mark Stone","W","1992-05-13"],
  ["VGK","Ivan Barbashev","W","1995-12-08"],
  ["VGK","William Karlsson","C","1993-01-08"],
  ["VGK","Pavel Dorofeyev","W","2000-11-21"],
  ["VGK","Tomas Hertl","C","1993-11-12"],
  ["VGK","Shea Theodore","D","1995-08-03"],
  ["VGK","Rasmus Andersson","D","1996-10-27"],
  ["VGK","Noah Hanifin","D","1997-01-25"],
  ["VGK","Brayden McNabb","D","1991-01-21"],
  // WSH
  ["WSH","Alexander Ovechkin","W","1985-09-17"],
  ["WSH","Dylan Strome","C","1997-03-07"],
  ["WSH","Tom Wilson","W","1994-03-26"],
  ["WSH","Lars Eller","C","1989-05-08"],
  ["WSH","Aliaksei Protas","C","2001-01-06"],
  ["WSH","Pierre-Luc Dubois","C","1998-06-24"],
  ["WSH","John Carlson","D","1990-01-10"],
  ["WSH","Matt Roy","D","1995-04-05"],
  ["WSH","Trevor van Riemsdyk","D","1991-07-24"],
  ["WSH","Jakob Chychrun","D","1998-03-31"],
  // WPG
  ["WPG","Mark Scheifele","C","1993-03-15"],
  ["WPG","Kyle Connor","W","1996-12-09"],
  ["WPG","Gabriel Vilardi","C","2000-08-16"],
  ["WPG","Adam Lowry","C","1992-03-29"],
  ["WPG","Cole Perfetti","C","2002-01-01"],
  ["WPG","Josh Morrissey","D","1995-03-28"],
  ["WPG","Dylan DeMelo","D","1993-05-01"],
  ["WPG","Neal Pionk","D","1995-07-29"],
  // GOALIES
  ["WPG","Connor Hellebuyck","G","1993-05-19"],
  ["EDM","Stuart Skinner","G","1998-11-01"],
  ["EDM","Calvin Pickard","G","1992-04-15"],
  ["FLA","Sergei Bobrovsky","G","1988-09-20"],
  ["TBL","Andrei Vasilevskiy","G","1994-07-25"],
  ["CAR","Pyotr Kochetkov","G","1999-06-25"],
  ["COL","Alexandar Georgiev","G","1996-02-10"],
  ["DAL","Jake Oettinger","G","1998-12-18"],
  ["NYR","Igor Shesterkin","G","1995-12-30"],
  ["VGK","Adin Hill","G","1996-05-11"],
  ["TOR","Joseph Woll","G","1998-07-12"],
  ["TOR","Anthony Stolarz","G","1994-01-20"],
  ["BOS","Jeremy Swayman","G","1998-11-16"],
  ["MIN","Filip Gustavsson","G","1998-06-07"],
  ["NSH","Juuse Saros","G","1995-04-19"],
  ["OTT","Linus Ullmark","G","1993-07-31"],
  ["NJD","Jacob Markstrom","G","1990-01-31"],
  ["SEA","Philipp Grubauer","G","1991-11-25"],
  ["BUF","Ukko-Pekka Luukkonen","G","1999-03-09"],
  ["MTL","Sam Montembeault","G","1996-10-30"],
  ["VAN","Kevin Lankinen","G","1995-04-28"],
  ["LAK","Darcy Kuemper","G","1990-05-05"],
  ["PIT","Tristan Jarry","G","1995-04-29"],
  ["STL","Jordan Binnington","G","1993-07-11"],
  ["ANA","Lukas Dostal","G","2000-06-22"],
  ["CHI","Petr Mrazek","G","1992-02-14"],
  ["DET","Cam Talbot","G","1987-07-05"],
  ["PHI","Samuel Ersson","G","2000-02-26"],
  ["NYI","Semyon Varlamov","G","1988-04-27"],
  ["SJS","Mackenzie Blackwood","G","1996-12-09"],
  ["CBJ","Elvis Merzlikins","G","1994-04-13"],
  ["UTA","Connor Ingram","G","1997-04-09"],
  ["CGY","Dustin Wolf","G","2001-04-16"],
  ["WSH","Logan Thompson","G","1997-02-25"],
  ["BOS","Linus Ullmark","G","1993-07-31"],
  ["CAR","Frederik Andersen","G","1989-10-02"],
  ["NYI","Ilya Sorokin","G","1995-08-04"],
];

async function loadFromDB(): Promise<Record<string, any>> {
  try {
    const rows = await db.select().from(playersTable);
    const result: Record<string, any> = {};
    for (const row of rows) {
      result[row.name] = {
        capHit:            row.capHit,
        yearsRemaining:    row.yearsRemaining,
        hasNMC:            row.hasNmc  ?? false,
        hasNTC:            row.hasNtc  ?? false,
        canRetain:         row.hasNmc  ? false : true,
        secondaryPosition: row.secondaryPosition ?? null,
        extensionCapHit:   row.extensionCapHit   ?? null,
        extensionYears:    row.extensionYears     ?? null,
        hasExtension:      !!(row.extensionCapHit || row.extensionYears),
      };
    }
    return result;
  } catch (e: any) {
    console.warn("[DB] loadFromDB failed, falling back to bundled.json:", e.message);
    return loadBundledFallback();
  }
}

function loadBundledFallback(): Record<string, any> {
  try {
    const fs   = require("fs");
    const path = require("path");
    const file = path.join(process.cwd(), "app/data/contracts.bundled.json");
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (e: any) {
    console.error("[Bundled] FAILED:", e.message);
  }
  return {};
}

function loadExtensions(): Record<string, any> {
  try {
    const fs   = require("fs");
    const path = require("path");
    const file = path.join(process.cwd(), "app/data/contracts.extensions.json");
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (_) { return {}; }
}

function loadBaselines(): Record<string, any> {
  try {
    const fs   = require("fs");
    const path = require("path");
    const file = path.join(process.cwd(), "app/data/moneypuck_baselines.json");
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (_) { return {}; }
}

async function loadContracts(): Promise<Record<string, any>> {
  if (redis) {
    const cached = await redis.get<Record<string, any>>("cache:contracts");
    if (cached && Object.keys(cached).length > 200) return cached;
  }

  // DB is the source of truth — CapWages sync happens only in /admin.
  // Never scrape live on the page-load path (adds 3-4s and burns CapWages quota).
  const dbData = await loadFromDB();
  const merged: Record<string, any> = {};

  for (const [name, b] of Object.entries(dbData)) {
    merged[name] = {
      capHit:            b.capHit,
      yearsRemaining:    b.yearsRemaining ?? 1,
      hasNMC:            b.hasNMC  ?? false,
      hasNTC:            b.hasNTC  ?? false,
      canRetain:         b.hasNMC  ? false : true,
      secondaryPosition: b.secondaryPosition ?? null,
      extensionCapHit:   b.extensionCapHit   ?? null,
      extensionYears:    b.extensionYears     ?? null,
      hasExtension:      b.hasExtension       ?? false,
    };
  }

  for (const [name, override] of Object.entries(CONTRACT_OVERRIDES)) {
    if (merged[name]) {
      if (override.capHit         !== undefined) merged[name].capHit         = override.capHit;
      if (override.yearsRemaining !== undefined) merged[name].yearsRemaining = override.yearsRemaining;
    }
  }

  if (redis && Object.keys(merged).length > 200) {
    await redis.setex("cache:contracts", CONTRACTS_CACHE_TTL, merged);
  }

  return merged;
}

interface NHLSkaterRow {
  playerId:         number;
  skaterFullName:   string;
  teamAbbrevs:      string;
  positionCode:     string;
  gamesPlayed:      number;
  goals:            number;
  assists:          number;
  plusMinus:        number;
  timeOnIcePerGame: number;
}

interface NHLTeamRow {
  teamId:       number;
  teamFullName: string;
  gamesPlayed:  number;
  goalsFor:     number;
  goalsAgainst: number;
  points:       number;
}

async function fetchPointShares(): Promise<Map<string, { ops: number; dps: number }>> {
  if (redis) {
    const cached = await redis.get<Record<string, { ops: number; dps: number }>>("cache:pointshares");
    if (cached) return new Map(Object.entries(cached));
  }

  const psMap = new Map<string, { ops: number; dps: number }>();

  try {
    const [skatersRes, teamsRes] = await Promise.allSettled([
      fetchWithTimeout(
        "https://api.nhle.com/stats/rest/en/skater/summary?cayenneExp=seasonId%3D20252026%20and%20gameTypeId%3D2&limit=-1",
        10000
      ),
      fetchWithTimeout(
        "https://api.nhle.com/stats/rest/en/team/summary?cayenneExp=seasonId%3D20252026%20and%20gameTypeId%3D2&limit=32",
        8000
      ),
    ]);

    if (skatersRes.status !== "fulfilled" || !skatersRes.value.ok) return psMap;
    if (teamsRes.status  !== "fulfilled" || !teamsRes.value.ok)   return psMap;

    const skaterData: { data: NHLSkaterRow[] } = await skatersRes.value.json();
    const teamData:   { data: NHLTeamRow[]   } = await teamsRes.value.json();
    const skaters = skaterData.data ?? [];
    const teams   = teamData.data   ?? [];

    if (skaters.length < 100 || teams.length < 28) return psMap;

    const leagueGoals  = teams.reduce((s, t) => s + t.goalsFor, 0);
    const leaguePoints = teams.reduce((s, t) => s + t.points, 0);
    const totalTeamGames = teams.reduce((s, t) => s + t.gamesPlayed, 0);
    const leagueGPG      = leagueGoals / totalTeamGames;
    const marginalGoalsPerPoint = leagueGoals / leaguePoints;

    const TEAM_ABBREV_MAP: Record<string, string> = {
      "ANA":"Anaheim Ducks","ARI":"Utah Hockey Club","UTA":"Utah Hockey Club",
      "BOS":"Boston Bruins","BUF":"Buffalo Sabres","CGY":"Calgary Flames",
      "CAR":"Carolina Hurricanes","CHI":"Chicago Blackhawks","COL":"Colorado Avalanche",
      "CBJ":"Columbus Blue Jackets","DAL":"Dallas Stars","DET":"Detroit Red Wings",
      "EDM":"Edmonton Oilers","FLA":"Florida Panthers","LAK":"Los Angeles Kings",
      "MIN":"Minnesota Wild","MTL":"Montreal Canadiens","NSH":"Nashville Predators",
      "NJD":"New Jersey Devils","NYI":"New York Islanders","NYR":"New York Rangers",
      "OTT":"Ottawa Senators","PHI":"Philadelphia Flyers","PIT":"Pittsburgh Penguins",
      "SJS":"San Jose Sharks","SEA":"Seattle Kraken","STL":"St. Louis Blues",
      "TBL":"Tampa Bay Lightning","TOR":"Toronto Maple Leafs","VAN":"Vancouver Canucks",
      "VGK":"Vegas Golden Knights","WSH":"Washington Capitals","WPG":"Winnipeg Jets",
    };

    const normalise = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const teamByName = new Map<string, NHLTeamRow>();
    for (const t of teams) teamByName.set(normalise(t.teamFullName), t);
    const teamByAbbrev = new Map<string, NHLTeamRow>();
    for (const [abbrev, fullName] of Object.entries(TEAM_ABBREV_MAP)) {
      const t = teamByName.get(normalise(fullName));
      if (t) teamByAbbrev.set(abbrev, t);
    }

    const toMin = (sec: number) => sec / 60;
    const MIN_TOI_PER_GAME = 5 * 60;

    const teamAggregates = new Map<string, {
      fwdTOI: number; defTOI: number; totalSktTOI: number;
      fwdPM: number;  defPM: number;
      fwdGP: number;  defGP: number;
    }>();

    for (const s of skaters) {
      if (s.timeOnIcePerGame < MIN_TOI_PER_GAME) continue;
      const abbrev   = s.teamAbbrevs.split(",")[0].trim();
      const totalTOI = toMin(s.timeOnIcePerGame) * s.gamesPlayed;
      const isD      = s.positionCode === "D";
      const agg      = teamAggregates.get(abbrev) ?? {
        fwdTOI: 0, defTOI: 0, totalSktTOI: 0,
        fwdPM: 0,  defPM: 0,
        fwdGP: 0,  defGP: 0,
      };
      if (isD) { agg.defTOI += totalTOI; agg.defPM += s.plusMinus; agg.defGP += s.gamesPlayed; }
      else     { agg.fwdTOI += totalTOI; agg.fwdPM += s.plusMinus; agg.fwdGP += s.gamesPlayed; }
      agg.totalSktTOI += totalTOI;
      teamAggregates.set(abbrev, agg);
    }

    let fwdTOItotal = 0;
    let defTOItotal = 0;
    for (const s of skaters) {
      const totTOI = toMin(s.timeOnIcePerGame) * s.gamesPlayed;
      if (s.positionCode === "D") defTOItotal += totTOI;
      else                        fwdTOItotal += totTOI;
    }

    const fwdGCtotal   = leagueGoals * 0.75 * 1.85 * 0.5;
    const defGCtotal   = leagueGoals * 0.25 * 1.85 * 0.5;
    const fwdGCperTOI  = fwdTOItotal > 0 ? fwdGCtotal / fwdTOItotal : 0;
    const defGCperTOI  = defTOItotal > 0 ? defGCtotal / defTOItotal : 0;

    for (const s of skaters) {
      const abbrev = s.teamAbbrevs.split(",")[0].trim();
      const team   = teamByAbbrev.get(abbrev);
      const agg    = teamAggregates.get(abbrev);
      if (!team || !agg) continue;

      const isD    = s.positionCode === "D";
      const posAdj = isD ? 10/7 : 5/7;
      const totTOI = toMin(s.timeOnIcePerGame) * s.gamesPlayed;

      const teamFactor = team.goalsFor / (team.goalsFor + team.goalsAgainst);
      const gc = (s.goals + 0.5 * s.assists) * teamFactor;

      const gcPerTOI   = isD ? defGCperTOI : fwdGCperTOI;
      const marginalGF = gc - (7/12) * totTOI * gcPerTOI;
      const ops        = Math.max(-3, marginalGF / marginalGoalsPerPoint);

      const teamMGA        = (1 + 7/12) * team.gamesPlayed * leagueGPG - team.goalsAgainst;
      const teamSktTOI     = agg.totalSktTOI;
      const toiProportion  = teamSktTOI > 0 ? totTOI / teamSktTOI : 0;
      const posTOI         = isD ? agg.defTOI : agg.fwdTOI;
      const posPM          = isD ? agg.defPM  : agg.fwdPM;
      const pmAdj          = (1/7) * posAdj * (s.plusMinus - totTOI * (posTOI > 0 ? posPM / posTOI : 0));
      const marginalGA     = toiProportion * (5/7) * posAdj * teamMGA + pmAdj;
      const dps            = Math.max(-3, marginalGA / marginalGoalsPerPoint);

      const name = s.skaterFullName.trim();
      const ps   = { ops: Math.round(ops * 10) / 10, dps: Math.round(dps * 10) / 10 };
      psMap.set(name,               ps);
      psMap.set(`id:${s.playerId}`, ps);
      psMap.set(slugify(name),      ps);
    }

    console.log(`[PS] Computed Point Shares for ${psMap.size / 3} players`);
    if (redis) {
      await redis.setex("cache:pointshares", PS_CACHE_TTL, Object.fromEntries(psMap));
    }
  } catch (e: any) {
    console.warn("[PS] fetchPointShares failed:", e.message);
  }

  return psMap;
}

// ── Trade Block auto-algorithm ─────────────────────────────────────────────
function autoTradeBlockStatus(
  p: { age: number; capHit: number; yearsRemaining: number; ptsPace: number; position: string; name: string },
  phase: string,
  topTwo: Set<string>,
): 'available' | 'untouchable' | null {
  if (p.position === 'Pick' || p.position === 'G') {
    // Goalies: only flag obvious rental starters
    if (p.position === 'G') {
      if (['Rebuilding','Tanking'].includes(phase) && p.age >= 30 && p.capHit >= 5.0) return 'available';
      if (p.yearsRemaining === 1 && p.capHit >= 6.0) return 'available';
    }
    return null;
  }

  const { age, capHit, yearsRemaining } = p;
  const isTopTwo     = topTwo.has(p.name);
  const isRebuilding = ['Rebuilding', 'Tanking'].includes(phase);
  const isRetooling  = phase === 'Retooling';
  const isContender  = phase === 'Contender';

  // UNTOUCHABLE: franchise cornerstones in their prime
  if (isTopTwo && age <= 29) return 'untouchable';
  if (age <= 22 && capHit <= 1.1) return 'untouchable';

  // AVAILABLE — rebuilding teams move any veteran with trade value
  if (isRebuilding) {
    if (age >= 29 && capHit >= 4.0 && yearsRemaining >= 2) return 'available';
    if (age >= 32) return 'available';
    if (yearsRemaining === 1 && capHit >= 4.0 && !isTopTwo) return 'available';
  }

  // AVAILABLE — retooling teams move expensive aging players
  if (isRetooling) {
    if (age >= 33 && capHit >= 5.0 && yearsRemaining >= 2) return 'available';
    if (yearsRemaining === 1 && capHit >= 6.0 && !isTopTwo) return 'available';
  }

  // AVAILABLE — universal: old expensive contracts + rentals on any team
  if (!isContender && age >= 35 && capHit >= 5.0) return 'available';
  if (yearsRemaining === 1 && capHit >= 6.5 && !isTopTwo) return 'available';

  return null;
}

export async function GET() {
  const [CONTRACTS, PS_MAP] = await Promise.all([
    loadContracts(),
    fetchPointShares(),
  ]);
  const EXTENSIONS = loadExtensions();
  const BASELINES  = loadBaselines();

  // ── MoneyPuck analytics ─────────────────────────────────────
  const analyticsMap = new Map<string, any>();
  const goalieMap    = new Map<string, any>();
  const teamXgaMap   = new Map<string, { xGoals: number; games: number }>();
  let fbMap = new Map<string, any>();

  let skaterCsv: string | null = null;
  let goalieCsv: string | null = null;

  if (redis) {
    skaterCsv = await redis.get<string>("cache:mp_skaters");
    goalieCsv = await redis.get<string>("cache:mp_goalies");
  }

  const skaterCsvFresh = !!skaterCsv;
  const goalieCsvFresh = !!goalieCsv;

  try {
    const [mpRes, gpRes] = await Promise.allSettled([
      skaterCsvFresh
        ? Promise.resolve({ ok: true, text: async () => skaterCsv! })
        : fetchWithTimeout(
            "https://moneypuck.com/moneypuck/playerData/seasonSummary/2025/regular/skaters.csv",
            8000,
            { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
          ),
      goalieCsvFresh
        ? Promise.resolve({ ok: true, text: async () => goalieCsv! })
        : fetchWithTimeout(
            "https://moneypuck.com/moneypuck/playerData/seasonSummary/2025/regular/goalies.csv",
            8000,
            { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
          ),
    ]);

    if (mpRes.status === "fulfilled" && mpRes.value.ok) {
      const csv  = await mpRes.value.text();
      if (!skaterCsvFresh && redis) await redis.setex("cache:mp_skaters", MONEYPUCK_CACHE_TTL, csv);
      const rows = csv.split("\n").filter(Boolean);
      const hdr  = parseCSVRow(rows[0]);
      const h    = (k: string) => hdr.indexOf(k);
      const [nI, sI, pI, xgI, gI, iceI, onAI, offAI, rkI, onFI, offFI, dzI, ozI, goalsI, posI] = [
        h("name"), h("situation"), h("I_F_points"), h("I_F_xGoals"),
        h("games_played"), h("icetime"),
        h("OnIce_A_xGoals"), h("OffIce_A_xGoals"),
        h("iceTimeRank"),
        h("OnIce_F_xGoals"), h("OffIce_F_xGoals"),
        h("I_F_dZoneShiftStarts"), h("I_F_oZoneShiftStarts"),
        h("I_F_goals"),
        h("position"),
      ];
      const zoneMap = new Map<string, number>();

      rows.slice(1).forEach((row) => {
        const c = parseCSVRow(row);
        if (c.length <= nI) return;
        if (c[sI]?.trim() !== "5on5") return;
        if (dzI < 0 || ozI < 0) return;
        const name = c[nI].trim();
        const dz5  = parseFloat(c[dzI]) || 0;
        const oz5  = parseFloat(c[ozI]) || 0;
        if (dz5 + oz5 > 0) {
          const pos5 = posI >= 0 ? (c[posI]?.trim().toUpperCase() ?? "") : "";
          if (pos5) zoneMap.set(`${slugify(name)}__${pos5}`, dz5 / (dz5 + oz5));
          zoneMap.set(slugify(name), dz5 / (dz5 + oz5));
        }
      });

      rows.slice(1).forEach((row) => {
        const c = parseCSVRow(row);
        if (c.length <= nI || c[sI]?.trim() !== "all") return;
        const name     = c[nI].trim();
        const g        = Math.max(1, parseFloat(c[gI]) || 1);
        const iceSec   = parseFloat(c[iceI]) || 1;
        const iceHours = iceSec / 3600;
        const benchH   = Math.max(0.01, (g * 60 - iceSec / 60) / 60);
        const onA  = (parseFloat(c[onAI])  || 0) / Math.max(0.01, iceHours);
        const offA = (parseFloat(c[offAI]) || 0) / Math.max(0.01, benchH);

        const onF      = parseFloat(c[onFI])  || 0;
        const offFVal  = parseFloat(c[offFI]) || 0;
        const onAVal   = parseFloat(c[onAI])  || 0;
        const offAVal  = parseFloat(c[offAI]) || 0;
        const onXgPct  = onF + onAVal > 0 ? onF / (onF + onAVal) : 0.5;
        const offXgPct = offFVal + offAVal > 0 ? offFVal / (offFVal + offAVal) : 0.5;
        const xgRelTM  = (onXgPct - offXgPct) * 100;
        const xgaRelTM = onA - offA;

        const pos = posI >= 0 ? (c[posI]?.trim().toUpperCase() ?? "") : "";
        const posForZone = pos ? `${slugify(name)}__${pos}` : slugify(name);
        const dzPct = zoneMap.get(posForZone) ?? zoneMap.get(slugify(name)) ?? null;

        const mapKey     = pos ? `${slugify(name)}__${pos}` : slugify(name);
        const rawPtsPace = (parseFloat(c[pI]) / g) * 82;
        const posDefault = pos.startsWith("D") ? 26 : pos === "C" ? 52 : 44;
        const sampleWeight = Math.min(1.0, g / 25);
        const ptsPace    = rawPtsPace * sampleWeight + posDefault * (1 - sampleWeight);
        const rawXgPace  = (parseFloat(c[xgI]) / g) * 82;
        const xGPace     = rawXgPace * sampleWeight + (pos.startsWith("D") ? 6 : 10) * (1 - sampleWeight);

        const entry = {
          ptsPace, xGPace,
          defRate:  offA - onA,
          avgTOI:   iceSec / g / 60,
          xgRelTM:  xgRelTM  * Math.min(1.0, g / 30),
          xgaRelTM: xgaRelTM * Math.min(1.0, g / 30),
          qocRank:  Math.round(
            (parseFloat(c[rkI]) || 500) * Math.min(1.0, g / 20) +
            400 * (1 - Math.min(1.0, g / 20))
          ),
          games: g, hasLiveStats: true, dzPct,
          goalsPace:   goalsI >= 0 ? (parseFloat(c[goalsI])   / g) * 82 : undefined,
          assistsPace: goalsI >= 0 ? ((parseFloat(c[pI]) - parseFloat(c[goalsI])) / g) * 82 : undefined,
        };
        analyticsMap.set(mapKey, entry);
        if (pos) analyticsMap.set(slugify(name), entry);
      });
      fbMap = buildFallbackMap(analyticsMap);
    }

    if (gpRes.status === "fulfilled" && gpRes.value.ok) {
      const csv  = await gpRes.value.text();
      if (!goalieCsvFresh && redis) await redis.setex("cache:mp_goalies", MONEYPUCK_CACHE_TTL, csv);
      const rows = csv.split("\n").filter(Boolean);
      const hdr  = parseCSVRow(rows[0]);
      const h    = (k: string) => hdr.indexOf(k);
      const [nI, sI, gI, xgI, goalsI, ongoalI, teamI] = [
        h("name"), h("situation"), h("games_played"),
        h("xGoals"), h("goals"), h("ongoal"), h("team"),
      ];
      if (nI >= 0 && xgI >= 0) {
        const goalieRows = new Map<string, any>();
        rows.slice(1).forEach((row) => {
          const c   = parseCSVRow(row);
          if (c.length <= nI) return;
          if ((c[sI] ?? "").trim().toLowerCase() !== "all") return;
          const name   = c[nI].trim();
          const g      = Math.max(1, parseFloat(c[gI]) || 1);
          const xGoals = parseFloat(c[xgI])    || 0;
          const goals  = parseFloat(c[goalsI]) || 0;
          const ongoal = parseFloat(c[ongoalI])|| 0;
          const gsax   = xGoals - goals;
          const savePct = ongoal > 0 ? (ongoal - goals) / ongoal : 0.900;

          const teamAbbr = (c[teamI] ?? "").trim().toUpperCase();
          if (teamAbbr) {
            const prev = teamXgaMap.get(teamAbbr) ?? { xGoals: 0, games: 0 };
            teamXgaMap.set(teamAbbr, {
              xGoals: prev.xGoals + xGoals,
              games:  Math.max(prev.games, g),
            });
          }

          goalieRows.set(name, {
            gsax,
            savePct:      Math.round(savePct * 10000) / 10000,
            shotsPerGame: ongoal / g,
            gamesStarted: g,
            xGoalsAllowed: xGoals,
            hasLiveStats: true,
          });
        });

        goalieRows.forEach((stats, name) => {
          goalieMap.set(slugify(name), stats);
          const parts = name.split(" ");
          if (parts.length >= 2) goalieMap.set(slugify(parts[parts.length - 1]), stats);
        });
      }
    }
  } catch (_) {}

  // ── Build roster from static list ──────────────────────────
  const rosterMap = new Map<string, any[]>();
  for (const [teamId, name, position, birthDate] of STATIC_ROSTER) {
    const list = rosterMap.get(teamId) ?? [];
    list.push({ id: `${teamId}-${slugify(name)}`, name, position: normalisePos(position), age: calcAge(birthDate), headshot: null });
    rosterMap.set(teamId, list);
  }

  try {
    const results = await Promise.allSettled(
      TEAMS_DB.map((t) =>
        fetchWithTimeout(`https://api-web.nhle.com/v1/roster/${t.id}/current`, 5000, NHL_HEADERS)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() =>
            fetchWithTimeout(`https://api-web.nhle.com/v1/roster/${t.id}/${SEASON.nhleSeasonId}`, 5000, NHL_HEADERS)
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null)
          )
      )
    );

    results.forEach((result, idx) => {
      const teamId = TEAMS_DB[idx].id;
      const data   = result.status === "fulfilled" ? result.value : null;
      if (!data) return;

      const skaters = [...(data.forwards || []), ...(data.defensemen || []), ...(data.goalies || [])];
      if (skaters.length < 5) return;

      rosterMap.set(teamId, skaters.map((p: any) => ({
        id:       p.id.toString(),
        name:     `${p.firstName.default} ${p.lastName.default}`,
        position: normalisePos(p.positionCode),
        age:      calcAge(p.birthDate),
        headshot: p.headshot ?? null,
      })));
    });
  } catch (_) {}

  // ── Build player objects ────────────────────────────────────
  const players: any[] = [];

  rosterMap.forEach((skaters, teamId) => {
    if (!TEAMS_DB.find(t => t.id === teamId)) return;

    skaters.forEach((p: any) => {
      const slug    = slugify(p.name);
      const posSlug = `${slug}__${(p.position ?? "").toUpperCase()}`;
      let stats = analyticsMap.get(posSlug) ?? analyticsMap.get(slug);
      if (!stats) {
        const last = slug.split("-").slice(-1)[0];
        const fb   = fbMap.get(last);
        if (fb !== null && fb !== undefined) stats = fb;
      }
      if (!stats && slug.length > 4) {
        const truncSlug = slug.slice(0, -1);
        stats = analyticsMap.get(`${truncSlug}__${(p.position ?? "").toUpperCase()}`)
             ?? analyticsMap.get(truncSlug);
      }

      const normalName  = p.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const posKey      = `${p.name}__${p.position}`;
      const teamKey     = `${p.name}__${teamId.toLowerCase()}`;
      const normPosKey  = `${normalName}__${p.position}`;
      const normTeamKey = `${normalName}__${teamId.toLowerCase()}`;
      const fin = CONTRACTS[posKey]     ?? CONTRACTS[teamKey]
               ?? CONTRACTS[normPosKey] ?? CONTRACTS[normTeamKey]
               ?? CONTRACTS[p.name]     ?? CONTRACTS[normalName]
               ?? null;

      const isLikelyELC = !fin && p.age <= 23;
      const elcCapHit   = p.age <= 22 ? 0.8775 : 0.925;

      const normContractPos = (pos: string | undefined): string => {
        if (!pos) return "";
        const u = pos.toUpperCase();
        if (u.includes("G")) return "G";
        if (u.includes("D")) return "D";
        if (u.includes("C")) return "C";
        if (u.includes("W") || u.includes("L") || u.includes("R")) return "W";
        return u.charAt(0);
      };

      const override         = EXTENSIONS[p.name]    ?? EXTENSIONS[normalName];
      const contractOverride = CONTRACT_OVERRIDES[p.name] ?? CONTRACT_OVERRIDES[normalName];
      const finalPosition    = contractOverride?.position ?? p.position;

      const isGoalie   = finalPosition === "G";
      const defaultTOI = isGoalie ? 0 : finalPosition === "D" ? 18.5 : 13.5;
      const defaultPts = isGoalie ? 0 : finalPosition === "D" ? 22 : finalPosition === "C" ? 32 : 28;

      const goalieStats = isGoalie
        ? (goalieMap.get(slugify(p.name)) ?? goalieMap.get(slugify(p.name.split(" ").pop() ?? "")) ?? null)
        : null;

      const rawCapHit     = isLikelyELC ? elcCapHit : (fin?.capHit ?? 0.925);
      const nameCollision = p.age <= 23
        && rawCapHit > 3.0
        && normContractPos(fin?.position) !== p.position;

      const finalCapHit  = contractOverride?.capHit ?? override?.capHit ?? (nameCollision ? elcCapHit : rawCapHit);
      const finalYears   = override?.yearsRemaining ?? (nameCollision ? 1 : (isLikelyELC ? 1 : (fin?.yearsRemaining ?? 1)));
      const finalNMC     = override?.hasNMC  ?? (nameCollision ? false : (fin?.hasNMC  ?? false));
      const finalNTC     = override?.hasNTC  ?? (nameCollision ? false : (fin?.hasNTC  ?? false));
      const finalRetain  = override?.canRetain ?? (nameCollision ? true : (fin?.canRetain ?? true));
      // DB extensions take priority over the legacy JSON file
      const hasExtension    = fin?.hasExtension    ?? override?.hasExtension    ?? false;
      const extensionCapHit = (fin?.extensionCapHit ?? override?.extensionCapHit) ?? undefined;
      const extensionYears  = (fin?.extensionYears  ?? override?.extensionYears)  ?? undefined;
      const intangibleMult  = override?.intangibleMultiplier ?? (fin?.intangibleMultiplier ?? 1.0);

      const LEAGUE_AVG_XGA60 = 2.55;
      const teamXgaRaw = teamXgaMap.get(teamId);
      const teamXga60  = teamXgaRaw && teamXgaRaw.games > 10
        ? Math.round((teamXgaRaw.xGoals / teamXgaRaw.games / (30 / 60)) * 100) / 100
        : LEAGUE_AVG_XGA60;

      const currentYearGsax = goalieStats?.gsax ?? 0;
      const baselineKey = p.name.toLowerCase().replace(/[^a-z]/g, "");
      const baselines   = BASELINES[baselineKey] || {};

      players.push({
        id:             p.id,
        teamId,
        name:           p.name,
        position:       finalPosition,
        age:            p.age,
        headshot:       p.headshot ?? null,
        games:          stats?.games    ?? goalieStats?.gamesStarted ?? 40,
        ptsPace:        stats?.ptsPace  ?? defaultPts,
        xGPace:         stats?.xGPace   ?? 0,
        defRate:        stats?.defRate  ?? 0.08,
        avgTOI:         stats?.avgTOI   ?? defaultTOI,
        qocRank:        stats?.qocRank  ?? 450,
        hasLiveStats:   stats?.hasLiveStats ?? goalieStats?.hasLiveStats ?? false,
        gsax:           goalieStats?.gsax         ?? 0,
        savePct:        goalieStats?.savePct       ?? 0.900,
        gamesStarted:   goalieStats?.gamesStarted  ?? 0,
        shotsPerGame:   goalieStats?.shotsPerGame  ?? 0,
        teamXga60,
        baselineGsax:      baselines.baselineGsax      ?? currentYearGsax,
        baselinePtsPace:   baselines.baselinePtsPace,
        baselineGameScore: baselines.baselineGameScore,
        baselineDpsProxy:  baselines.baselineDpsProxy,
        capHit:         CONTRACT_OVERRIDES[p.name]?.capHit         ?? finalCapHit,
        yearsRemaining: CONTRACT_OVERRIDES[p.name]?.yearsRemaining ?? finalYears,
        hasExtension, extensionCapHit, extensionYears,
        hasNMC:    finalNMC,
        hasNTC:    finalNTC,
        canRetain: finalRetain,
        retainedPct: 0,
        multiplier:  intangibleMult,
        ops:  PS_MAP.get(p.name)?.ops ?? PS_MAP.get(`id:${p.id}`)?.ops ?? PS_MAP.get(slugify(p.name))?.ops ?? null,
        dps:  PS_MAP.get(p.name)?.dps ?? PS_MAP.get(`id:${p.id}`)?.dps ?? PS_MAP.get(slugify(p.name))?.dps ?? null,
        xgRelTM:     stats?.xgRelTM   ?? null,
        xgaRelTM:    stats?.xgaRelTM  ?? null,
        dzPct:       stats?.dzPct     ?? null,
        goalsPace:         stats?.goalsPace,
        assistsPace:       stats?.assistsPace,
        secondaryPosition: fin?.secondaryPosition ?? null,
      });
    });
  });

  // ── Trade Block: load overrides + auto-compute status ─────────────────────
  let tbOverrides = new Map<string, { status: string; note: string | null }>();
  try {
    const rows = await db.select().from(tradeBlockTable);
    for (const r of rows) tbOverrides.set(r.name, { status: r.status, note: r.note ?? null });
  } catch (_) {}

  // Team phase map: DB override → TEAMS_DB fallback
  const teamPhaseMap = new Map<string, string>(TEAMS_DB.map(t => [t.id, t.phase]));
  try {
    const dbTeams = await db.select().from(teamsTable);
    for (const t of dbTeams) { if (t.phaseOverride) teamPhaseMap.set(t.id, t.phaseOverride); }
  } catch (_) {}

  // Top-2 skaters per team by ptsPace (to guard franchise cornerstones)
  const teamRosterPts = new Map<string, { name: string; ptsPace: number }[]>();
  for (const p of players) {
    if (p.position === 'Pick') continue;
    const list = teamRosterPts.get(p.teamId) ?? [];
    list.push({ name: p.name, ptsPace: p.ptsPace ?? 0 });
    teamRosterPts.set(p.teamId, list);
  }
  const teamTopTwo = new Map<string, Set<string>>();
  teamRosterPts.forEach((list, tid) => {
    const sorted = [...list].sort((a, b) => b.ptsPace - a.ptsPace);
    teamTopTwo.set(tid, new Set(sorted.slice(0, 2).map(x => x.name)));
  });

  // Apply status to each player
  for (const p of players) {
    if (p.position === 'Pick') continue;
    const override = tbOverrides.get(p.name);
    if (override) {
      (p as any).tradeBlockStatus = override.status === 'blocked' ? null : override.status;
      (p as any).tradeBlockNote   = override.note;
    } else {
      const phase  = teamPhaseMap.get(p.teamId) ?? 'Bubble';
      const topTwo = teamTopTwo.get(p.teamId)   ?? new Set<string>();
      (p as any).tradeBlockStatus = autoTradeBlockStatus(p as any, phase, topTwo);
      (p as any).tradeBlockNote   = null;
    }
  }

  return NextResponse.json({
    players,
    liveStats:  analyticsMap.size > 0,
    generatedAt: new Date().toISOString(),
    debug: {
      playerCount:    players.length,
      analyticsCount: analyticsMap.size,
    },
  });
}
