import { NextResponse } from 'next/server';
import { TEAMS_DB, FINANCIALS_DB } from '@/app/lib/db';

const CAP_CEILING = 104.0;
const CAP_FLOOR = 75.0;

const slugify = (n: string) =>
  n
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '-');

const buildFallbackMap = (map: Map<string, any>) => {
  const fb = new Map<string, any>();
  map.forEach((val, slug) => {
    const last = slug.split('-').slice(-1)[0];
    fb.set(last, fb.has(last) ? null : val);
  });
  return fb;
};

const fetchWithTimeout = (url: string, ms = 7000): Promise<Response> => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal, cache: 'no-store' }).finally(() =>
    clearTimeout(t)
  );
};

const normalisePos = (code: string) =>
  code === 'L' || code === 'R' ? 'W' : code;

const calcAge = (birthDate: string): number => {
  const b = new Date(birthDate);
  const n = new Date();
  let age = n.getFullYear() - b.getFullYear();
  const m = n.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) age--;
  return age;
};

// ============================================================
// STATIC ROSTER — guaranteed fallback when NHL API is blocked.
// Format: [teamId, name, position, birthDate, nhlId]
// Covers top 6-8 skaters per team — enough for a trade machine.
// ============================================================
const STATIC_ROSTER: [string, string, string, string, string][] = [
  // ANA
  ['ANA', 'Mason McTavish', 'C', '2003-01-30', '8482702'],
  ['ANA', 'Leo Carlsson', 'C', '2004-04-09', '8484997'],
  ['ANA', 'Trevor Zegras', 'C', '2001-03-20', '8481533'],
  ['ANA', 'Troy Terry', 'W', '1997-09-10', '8479371'],
  ['ANA', 'Frank Vatrano', 'W', '1994-03-14', '8478366'],
  ['ANA', 'Cam Fowler', 'D', '1991-12-05', '8475764'],
  ['ANA', 'Radko Gudas', 'D', '1990-06-05', '8475462'],
  ['ANA', 'Jackson LaCombe', 'D', '2001-06-12', '8482655'],
  // BOS
  ['BOS', 'David Pastrnak', 'W', '1996-05-25', '8778476'],
  ['BOS', 'Brad Marchand', 'W', '1988-05-11', '8473419'],
  ['BOS', 'Charlie Coyle', 'C', '1992-03-02', '8476469'],
  ['BOS', 'Pavel Zacha', 'C', '1997-04-06', '8479325'],
  ['BOS', 'Charlie McAvoy', 'D', '1997-12-21', '8479325'],
  ['BOS', 'Matt Grzelcyk', 'D', '1994-01-05', '8478009'],
  ['BOS', 'Hampus Lindholm', 'D', '1993-01-20', '8477506'],
  // BUF
  ['BUF', 'Tage Thompson', 'C', '1997-10-30', '8480801'],
  ['BUF', 'JJ Peterka', 'W', '2002-01-14', '8482716'],
  ['BUF', 'Jason Zucker', 'W', '1992-01-16', '8475743'],
  ['BUF', 'Dylan Cozens', 'C', '2001-02-09', '8482114'],
  ['BUF', 'Rasmus Dahlin', 'D', '2000-04-13', '8480769'],
  ['BUF', 'Owen Power', 'D', '2002-11-22', '8483516'],
  ['BUF', 'Henri Jokiharju', 'D', '1999-06-17', '8481033'],
  // CGY
  ['CGY', 'Nazem Kadri', 'C', '1990-10-06', '8475172'],
  ['CGY', 'Jonathan Huberdeau', 'W', '1993-06-04', '8476456'],
  ['CGY', 'Yegor Sharangovich', 'W', '1998-06-06', '8481617'],
  ['CGY', 'Daniil Miromanov', 'D', '1999-06-17', '8482752'],
  ['CGY', 'Rasmus Andersson', 'D', '1996-10-27', '8479369'],
  ['CGY', 'MacKenzie Weegar', 'D', '1994-01-07', '8478007'],
  // CAR
  ['CAR', 'Sebastian Aho', 'C', '1997-07-26', '8478443'],
  ['CAR', 'Andrei Svechnikov', 'W', '2000-03-26', '8480830'],
  ['CAR', 'Martin Necas', 'C', '1999-01-15', '8480762'],
  ['CAR', 'Seth Jarvis', 'W', '2002-02-01', '8483413'],
  ['CAR', 'Brent Burns', 'D', '1985-03-09', '8470319'],
  ['CAR', 'Jaccob Slavin', 'D', '1994-05-01', '8477507'],
  ['CAR', 'Brady Skjei', 'D', '1994-03-26', '8476894'],
  // CHI
  ['CHI', 'Connor Bedard', 'C', '2005-07-17', '8484144'],
  ['CHI', 'Nick Foligno', 'W', '1987-10-31', '8471769'],
  ['CHI', 'Tyler Bertuzzi', 'W', '1995-02-24', '8478476'],
  ['CHI', 'Seth Jones', 'D', '1994-10-03', '8476882'],
  ['CHI', 'Alex Vlasic', 'D', '2002-07-10', '8482175'],
  ['CHI', 'Kevin Korchinski', 'D', '2003-09-09', '8483604'],
  ['CHI', 'Frank Nazar', 'C', '2003-06-10', '8484148'],
  // COL
  ['COL', 'Nathan MacKinnon', 'C', '1995-09-01', '8477492'],
  ['COL', 'Mikko Rantanen', 'W', '1996-10-29', '8478444'],
  ['COL', 'Valeri Nichushkin', 'W', '1995-03-04', '8477503'],
  ['COL', 'Cale Makar', 'D', '1998-10-30', '8480069'],
  ['COL', 'Devon Toews', 'D', '1994-02-27', '8479038'],
  ['COL', 'Samuel Girard', 'D', '1998-05-12', '8480768'],
  ['COL', 'Casey Mittelstadt', 'C', '1998-11-22', '8481532'],
  // CBJ
  ['CBJ', 'Kirill Marchenko', 'W', '2000-08-08', '8482699'],
  ['CBJ', 'Dmitri Voronkov', 'W', '1999-07-28', '8482718'],
  ['CBJ', 'Sean Monahan', 'C', '1994-10-12', '8476988'],
  ['CBJ', 'Ivan Provorov', 'D', '1997-01-13', '8479324'],
  ['CBJ', 'Zach Werenski', 'D', '1996-07-19', '8479672'],
  ['CBJ', 'David Jiricek', 'D', '2003-04-09', '8483484'],
  ['CBJ', 'Adam Fantilli', 'C', '2004-01-13', '8484799'],
  // DAL
  ['DAL', 'Jason Robertson', 'W', '1999-07-22', '8481533'],
  ['DAL', 'Roope Hintz', 'C', '1997-03-03', '8479346'],
  ['DAL', 'Wyatt Johnston', 'C', '2003-05-14', '8483493'],
  ['DAL', 'Tyler Seguin', 'C', '1992-01-31', '8475794'],
  ['DAL', 'Miro Heiskanen', 'D', '1999-07-18', '8481600'],
  ['DAL', 'Thomas Harley', 'D', '2002-08-19', '8482669'],
  ['DAL', 'Matt Duchene', 'C', '1991-01-16', '8476460'],
  // DET
  ['DET', 'Dylan Larkin', 'C', '1996-07-30', '8478009'],
  ['DET', 'Lucas Raymond', 'W', '2002-03-28', '8482071'],
  ['DET', 'Patrick Kane', 'W', '1988-11-19', '8474141'],
  ['DET', 'Moritz Seider', 'D', '2001-04-06', '8482638'],
  ['DET', 'Ben Chiarot', 'D', '1991-05-09', '8476397'],
  ['DET', 'Simon Edvinsson', 'D', '2003-02-13', '8483469'],
  ['DET', 'Alex DeBrincat', 'W', '1997-12-18', '8480768'],
  // EDM
  ['EDM', 'Connor McDavid', 'C', '1997-01-13', '8478402'],
  ['EDM', 'Leon Draisaitl', 'C', '1995-10-27', '8477934'],
  ['EDM', 'Zach Hyman', 'W', '1992-06-09', '8475786'],
  ['EDM', 'Ryan Nugent-Hopkins', 'C', '1992-04-12', '8476454'],
  ['EDM', 'Evan Bouchard', 'D', '1999-10-20', '8480762'],
  ['EDM', 'Darnell Nurse', 'D', '1995-02-04', '8477498'],
  ['EDM', 'Brett Kulak', 'D', '1994-01-06', '8477346'],
  // FLA
  ['FLA', 'Aleksander Barkov', 'C', '1995-09-02', '8478444'],
  ['FLA', 'Sam Reinhart', 'W', '1995-11-06', '8477956'],
  ['FLA', 'Matthew Tkachuk', 'W', '1997-12-11', '8479314'],
  ['FLA', 'Carter Verhaeghe', 'W', '1995-08-14', '8478244'],
  ['FLA', 'Aaron Ekblad', 'D', '1996-02-07', '8478021'],
  ['FLA', 'Gustav Forsling', 'D', '1996-06-12', '8478028'],
  ['FLA', 'Niko Mikkola', 'D', '1996-04-26', '8480315'],
  // LAK
  ['LAK', 'Anze Kopitar', 'C', '1987-08-24', '8470626'],
  ['LAK', 'Kevin Fiala', 'W', '1996-07-22', '8478475'],
  ['LAK', 'Adrian Kempe', 'W', '1996-09-20', '8478550'],
  ['LAK', 'Quinton Byfield', 'C', '2002-08-13', '8482182'],
  ['LAK', 'Drew Doughty', 'D', '1989-12-08', '8474563'],
  ['LAK', 'Mikey Anderson', 'D', '1999-05-07', '8481537'],
  ['LAK', 'Brandt Clarke', 'D', '2002-11-27', '8483491'],
  // MIN
  ['MIN', 'Kirill Kaprizov', 'W', '1997-04-26', '8481596'],
  ['MIN', 'Joel Eriksson Ek', 'C', '1997-07-29', '8478837'],
  ['MIN', 'Matt Boldy', 'W', '2001-04-05', '8482102'],
  ['MIN', 'Marco Rossi', 'C', '2002-06-23', '8482116'],
  ['MIN', 'Jonas Brodin', 'D', '1993-07-12', '8476981'],
  ['MIN', 'Jake Middleton', 'D', '1996-02-04', '8478880'],
  ['MIN', 'Jared Spurgeon', 'D', '1989-11-29', '8473419'],
  // MTL
  ['MTL', 'Nick Suzuki', 'C', '1999-08-10', '8481540'],
  ['MTL', 'Cole Caufield', 'W', '2001-01-02', '8482468'],
  ['MTL', 'Juraj Slafkovsky', 'W', '2004-03-30', '8484793'],
  ['MTL', 'Kirby Dach', 'C', '2001-01-21', '8482116'],
  ['MTL', 'Mike Matheson', 'D', '1994-02-27', '8477220'],
  ['MTL', 'Kaiden Guhle', 'D', '2002-01-18', '8483438'],
  ['MTL', 'Lane Hutson', 'D', '2003-02-12', '8484930'],
  // NSH
  ['NSH', 'Filip Forsberg', 'W', '1994-08-13', '8477932'],
  ['NSH', "Ryan O'Reilly", 'C', '1991-02-07', '8475158'],
  ['NSH', 'Gustav Nyquist', 'W', '1990-09-01', '8476410'],
  ['NSH', 'Roman Josi', 'D', '1990-06-01', '8474600'],
  ['NSH', 'Alexandre Carrier', 'D', '1997-10-08', '8478527'],
  ['NSH', 'Jeremy Lauzon', 'D', '1997-04-28', '8479324'],
  // NJD
  ['NJD', 'Jack Hughes', 'C', '2001-05-14', '8481559'],
  ['NJD', 'Nico Hischier', 'C', '1999-01-04', '8480315'],
  ['NJD', 'Jesper Bratt', 'W', '1998-07-30', '8480817'],
  ['NJD', 'Timo Meier', 'W', '1996-10-08', '8478476'],
  ['NJD', 'Dougie Hamilton', 'D', '1993-06-17', '8477474'],
  ['NJD', 'Jonas Siegenthaler', 'D', '1997-05-06', '8479394'],
  ['NJD', 'Luke Hughes', 'D', '2003-09-09', '8483484'],
  // NYI
  ['NYI', 'Mathew Barzal', 'C', '1997-05-26', '8478470'],
  ['NYI', 'Bo Horvat', 'C', '1995-04-05', '8477500'],
  ['NYI', 'Anders Lee', 'W', '1990-07-03', '8474716'],
  ['NYI', 'Brock Nelson', 'C', '1991-10-15', '8476434'],
  ['NYI', 'Noah Dobson', 'D', '2000-01-07', '8481603'],
  ['NYI', 'Ryan Pulock', 'D', '1994-10-18', '8478248'],
  ['NYI', 'Adam Pelech', 'D', '1994-08-16', '8477474'],
  // NYR
  ['NYR', 'Artemi Panarin', 'W', '1991-10-30', '8478550'],
  ['NYR', 'Mika Zibanejad', 'C', '1993-04-18', '8476459'],
  ['NYR', 'Chris Kreider', 'W', '1991-04-30', '8476775'],
  ['NYR', 'Vincent Trocheck', 'C', '1993-07-11', '8476893'],
  ['NYR', 'Adam Fox', 'D', '1998-02-17', '8481554'],
  ['NYR', 'Ryan Lindgren', 'D', '1998-02-11', '8481534'],
  ['NYR', 'Alexis Lafreniere', 'W', '2001-10-11', '8482055'],
  // OTT
  ['OTT', 'Tim Stutzle', 'C', '2002-01-15', '8482116'],
  ['OTT', 'Brady Tkachuk', 'W', '1999-09-16', '8481543'],
  ['OTT', 'Drake Batherson', 'W', '1998-04-27', '8480762'],
  ['OTT', 'Claude Giroux', 'W', '1988-01-12', '8474150'],
  ['OTT', 'Jake Sanderson', 'D', '2002-07-08', '8483438'],
  ['OTT', 'Thomas Chabot', 'D', '1997-01-30', '8479420'],
  ['OTT', 'Artem Zub', 'D', '1995-10-03', '8480369'],
  // PHI
  ['PHI', 'Sean Couturier', 'C', '1992-12-07', '8476892'],
  ['PHI', 'Travis Konecny', 'W', '1997-03-11', '8479325'],
  ['PHI', 'Owen Tippett', 'W', '1999-02-16', '8481028'],
  ['PHI', 'Matvei Michkov', 'W', '2004-11-06', '8485694'],
  ['PHI', 'Travis Sanheim', 'D', '1996-03-29', '8478876'],
  ['PHI', 'Sean Walker', 'D', '1994-11-05', '8479041'],
  ['PHI', 'Cam York', 'D', '2001-01-05', '8481601'],
  // PIT
  ['PIT', 'Sidney Crosby', 'C', '1987-08-07', '8471675'],
  ['PIT', 'Evgeni Malkin', 'C', '1986-07-31', '8471218'],
  ['PIT', 'Rickard Rakell', 'W', '1993-05-05', '8476461'],
  ['PIT', 'Bryan Rust', 'W', '1991-05-11', '8476792'],
  ['PIT', 'Kris Letang', 'D', '1987-04-24', '8471724'],
  ['PIT', 'Marcus Pettersson', 'D', '1996-05-08', '8478554'],
  ['PIT', 'Erik Karlsson', 'D', '1990-05-31', '8474578'],
  // SEA
  ['SEA', 'Matty Beniers', 'C', '2002-11-05', '8483411'],
  ['SEA', 'Jordan Eberle', 'W', '1990-05-15', '8474455'],
  ['SEA', 'Jared McCann', 'C', '1996-05-31', '8478391'],
  ['SEA', 'Yanni Gourde', 'C', '1991-12-15', '8478571'],
  ['SEA', 'Vince Dunn', 'D', '1996-10-29', '8479369'],
  ['SEA', 'Adam Larsson', 'D', '1992-11-12', '8477494'],
  ['SEA', 'Will Borgen', 'D', '1996-12-19', '8479671'],
  // SJS
  ['SJS', 'Macklin Celebrini', 'C', '2006-01-05', '8487533'],
  ['SJS', 'Fabian Zetterlund', 'W', '1999-08-26', '8481600'],
  ['SJS', 'William Eklund', 'W', '2003-10-12', '8483492'],
  ['SJS', 'Mikael Granlund', 'C', '1992-02-26', '8476469'],
  ['SJS', 'Jake Walman', 'D', '1996-02-10', '8478775'],
  ['SJS', 'Marc-Edouard Vlasic', 'D', '1987-03-30', '8471242'],
  ['SJS', 'Cody Ceci', 'D', '1993-12-21', '8477498'],
  // STL
  ['STL', 'Robert Thomas', 'C', '1999-07-02', '8481543'],
  ['STL', 'Pavel Buchnevich', 'W', '1995-04-17', '8479410'],
  ['STL', 'Jordan Kyrou', 'W', '1998-05-05', '8481034'],
  ['STL', 'Brayden Schenn', 'C', '1991-08-22', '8476460'],
  ['STL', 'Torey Krug', 'D', '1991-04-12', '8476345'],
  ['STL', 'Colton Parayko', 'D', '1993-05-12', '8477987'],
  ['STL', 'Justin Faulk', 'D', '1992-03-20', '8476368'],
  // TBL
  ['TBL', 'Nikita Kucherov', 'W', '1993-06-17', '8476453'],
  ['TBL', 'Brayden Point', 'C', '1996-03-13', '8479314'],
  ['TBL', 'Brandon Hagel', 'W', '1998-08-27', '8480796'],
  ['TBL', 'Steven Stamkos', 'C', '1990-02-07', '8474600'],
  ['TBL', 'Victor Hedman', 'D', '1990-12-18', '8475167'],
  ['TBL', 'Mikhail Sergachev', 'D', '1998-06-25', '8479420'],
  ['TBL', 'Erik Cernak', 'D', '1997-05-28', '8479325'],
  // TOR
  ['TOR', 'Auston Matthews', 'C', '1997-09-17', '8479318'],
  ['TOR', 'Mitch Marner', 'W', '1997-05-05', '8478483'],
  ['TOR', 'William Nylander', 'W', '1996-05-01', '8477939'],
  ['TOR', 'John Tavares', 'C', '1990-09-20', '8475091'],
  ['TOR', 'Morgan Rielly', 'D', '1994-03-09', '8477492'],
  ['TOR', 'Jake McCabe', 'D', '1993-10-12', '8477459'],
  ['TOR', 'Timothy Liljegren', 'D', '1999-04-30', '8480801'],
  // UTA
  ['UTA', 'Clayton Keller', 'C', '1998-07-29', '8479543'],
  ['UTA', 'Nick Schmaltz', 'C', '1996-02-15', '8478476'],
  ['UTA', 'Lawson Crouse', 'W', '1997-06-23', '8479543'],
  ['UTA', 'Mikhail Sergachev', 'D', '1998-06-25', '8479420'],
  ['UTA', 'Juuso Valimaki', 'D', '1998-10-06', '8481034'],
  ['UTA', 'Vladislav Kolyachonok', 'D', '2001-04-18', '8482655'],
  ['UTA', 'Logan Cooley', 'C', '2003-05-04', '8483549'],
  // VAN
  ['VAN', 'Elias Pettersson', 'C', '1998-11-12', '8480012'],
  ['VAN', 'J.T. Miller', 'C', '1993-03-14', '8476468'],
  ['VAN', 'Brock Boeser', 'W', '1997-02-25', '8479435'],
  ['VAN', 'Conor Garland', 'W', '1996-03-11', '8480369'],
  ['VAN', 'Quinn Hughes', 'D', '2000-10-14', '8481533'],
  ['VAN', 'Filip Hronek', 'D', '1997-11-02', '8479434'],
  ['VAN', 'Carson Soucy', 'D', '1994-07-27', '8479038'],
  // VGK
  ['VGK', 'Jack Eichel', 'C', '1996-10-28', '8478403'],
  ['VGK', 'Mitch Marner', 'W', '1997-05-05', '8478483'],
  ['VGK', 'Mark Stone', 'W', '1992-05-13', '8477494'],
  ['VGK', 'William Karlsson', 'C', '1993-01-08', '8477973'],
  ['VGK', 'Shea Theodore', 'D', '1995-08-03', '8478476'],
  ['VGK', 'Alex Pietrangelo', 'D', '1990-01-18', '8475763'],
  ['VGK', 'Zach Whitecloud', 'D', '1996-11-26', '8479325'],
  // WSH
  ['WSH', 'Alexander Ovechkin', 'W', '1985-09-17', '8471214'],
  ['WSH', 'Nicklas Backstrom', 'C', '1987-11-23', '8473563'],
  ['WSH', 'Dylan Strome', 'C', '1997-03-07', '8479420'],
  ['WSH', 'Tom Wilson', 'W', '1994-03-26', '8477493'],
  ['WSH', 'John Carlson', 'D', '1990-01-10', '8474578'],
  ['WSH', 'Trevor van Riemsdyk', 'D', '1991-07-24', '8477220'],
  ['WSH', 'Matt Roy', 'D', '1995-04-05', '8479038'],
  // WPG
  ['WPG', 'Mark Scheifele', 'C', '1993-03-15', '8476460'],
  ['WPG', 'Kyle Connor', 'W', '1996-12-09', '8478398'],
  ['WPG', 'Nikolaj Ehlers', 'W', '1996-02-14', '8478476'],
  ['WPG', 'Gabriel Vilardi', 'C', '2000-08-16', '8480762'],
  ['WPG', 'Josh Morrissey', 'D', '1995-03-28', '8477504'],
  ['WPG', 'Dylan DeMelo', 'D', '1993-05-01', '8478009'],
  ['WPG', 'Brenden Dillon', 'D', '1990-11-13', '8476345'],
  ['WPG', 'Adam Lowry', 'C', '1992-03-29', '8476374'],
];

export async function GET() {
  // ── 1. MoneyPuck live analytics ────────────────────────────
  const analyticsMap = new Map<string, any>();
  let fbMap = new Map<string, any>();

  try {
    const mpRes = await fetchWithTimeout(
      'https://moneypuck.com/moneypuck/playerData/seasonSummary/2025/regular/skaters.csv',
      8000
    );
    if (mpRes.ok) {
      const csv = await mpRes.text();
      const rows = csv.split('\n').filter(Boolean);
      const hdr = rows[0].split(',');
      const h = (k: string) => hdr.indexOf(k);
      const [nI, sI, pI, xgI, gI, iceI, onAI, offAI, rkI] = [
        h('name'),
        h('situation'),
        h('I_F_points'),
        h('I_F_xGoals'),
        h('games_played'),
        h('icetime'),
        h('OnIce_A_xGoals'),
        h('OffIce_A_xGoals'),
        h('iceTimeRank'),
      ];
      rows.slice(1).forEach((row) => {
        const c = row.split(',');
        if (c.length <= nI || c[sI]?.trim() !== 'all') return;
        const name = c[nI].replace(/"/g, '').trim();
        const g = Math.max(1, parseFloat(c[gI]) || 1);
        const iceSec = parseFloat(c[iceI]) || 1;
        const iceHours = iceSec / 3600;
        const benchH = Math.max(0.01, (g * 60 - iceSec / 60) / 60);
        const onA = (parseFloat(c[onAI]) || 0) / Math.max(0.01, iceHours);
        const offA = (parseFloat(c[offAI]) || 0) / Math.max(0.01, benchH);
        analyticsMap.set(slugify(name), {
          ptsPace: (parseFloat(c[pI]) / g) * 82,
          xGPace: (parseFloat(c[xgI]) / g) * 82,
          defRate: offA - onA,
          avgTOI: iceSec / g / 60,
          qocRank: parseFloat(c[rkI]) || 500,
          games: g,
          hasLiveStats: true,
        });
      });
      fbMap = buildFallbackMap(analyticsMap);
    }
  } catch (_) {
    /* MoneyPuck blocked */
  }

  // ── 2. Try NHL API for live rosters; fall back to STATIC_ROSTER ──
  let rosterMap = new Map<string, any[]>(); // teamId → player objects
  let usedLiveRoster = false;

  try {
    const results = await Promise.allSettled(
      TEAMS_DB.map((t) =>
        fetchWithTimeout(
          `https://api-web.nhle.com/v1/roster/${t.id}/current`,
          6000
        )
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    );

    let liveCount = 0;
    results.forEach((result, idx) => {
      const teamId = TEAMS_DB[idx].id;
      const data = result.status === 'fulfilled' ? result.value : null;
      if (!data) return;
      const skaters = [...(data.forwards || []), ...(data.defensemen || [])];
      if (skaters.length === 0) return;
      liveCount++;
      rosterMap.set(
        teamId,
        skaters.map((p: any) => ({
          id: p.id.toString(),
          name: `${p.firstName.default} ${p.lastName.default}`,
          position: normalisePos(p.positionCode),
          age: calcAge(p.birthDate),
          headshot: p.headshot ?? null,
        }))
      );
    });

    usedLiveRoster = liveCount >= 20; // at least 20 teams responded
  } catch (_) {
    /* NHL API blocked */
  }

  // If live roster failed, build from static list
  if (!usedLiveRoster) {
    rosterMap = new Map();
    for (const [teamId, name, position, birthDate, _id] of STATIC_ROSTER) {
      const list = rosterMap.get(teamId) ?? [];
      list.push({
        id: `${teamId}-${slugify(name)}`,
        name,
        position: normalisePos(position),
        age: calcAge(birthDate),
        headshot: null,
      });
      rosterMap.set(teamId, list);
    }
  }

  // ── 3. Build player objects ─────────────────────────────────
  const players: any[] = [];

  rosterMap.forEach((skaters, teamId) => {
    const team = TEAMS_DB.find((t) => t.id === teamId);
    if (!team) return;

    skaters.forEach((p) => {
      const slug = slugify(p.name);
      let stats = analyticsMap.get(slug);
      if (!stats) {
        const last = slug.split('-').slice(-1)[0];
        const fb = fbMap.get(last);
        if (fb !== null && fb !== undefined) stats = fb;
      }

      const fin = FINANCIALS_DB[p.name] ?? null;
      const defaultTOI = p.position === 'D' ? 18.5 : 13.5;
      const defaultPts = p.position === 'D' ? 22 : p.position === 'C' ? 32 : 28;

      players.push({
        id: p.id,
        teamId,
        name: p.name,
        position: p.position,
        age: p.age,
        headshot: p.headshot ?? null,
        games: stats?.games ?? 40,
        ptsPace: stats?.ptsPace ?? defaultPts,
        xGPace: stats?.xGPace ?? 8,
        defRate: stats?.defRate ?? 0.08,
        avgTOI: stats?.avgTOI ?? defaultTOI,
        qocRank: stats?.qocRank ?? 450,
        hasLiveStats: stats?.hasLiveStats ?? false,
        capHit: fin?.capHit ?? 0.925,
        yearsRemaining: fin?.yearsRemaining ?? 1,
        hasNMC: fin?.hasNMC ?? false,
        hasNTC: fin?.hasNTC ?? false,
        canRetain: fin?.canRetain ?? true,
        retainedPct: 0,
        multiplier: fin?.intangibleMultiplier ?? 1.0,
      });
    });
  });

  // ── 4. Draft picks ──────────────────────────────────────────
  const picks: any[] = [];
  TEAMS_DB.forEach((team) => {
    [
      { round: 1, year: 2026 },
      { round: 1, year: 2027 },
      { round: 2, year: 2026 },
    ].forEach(({ round, year }) => {
      picks.push({
        id: `pick-${team.id}-${year}-${round}`,
        teamId: team.id,
        name: `${year} ${round === 1 ? '1st' : '2nd'} Round Pick (${team.id})`,
        position: 'Pick',
        age: 19,
        round,
        year,
        teamStanding: team.standing,
        isProtected: false,
        games: 0,
        ptsPace: 0,
        xGPace: 0,
        defRate: 0,
        avgTOI: 0,
        qocRank: 999,
        capHit: 0,
        yearsRemaining: 0,
        hasNMC: false,
        hasNTC: false,
        canRetain: false,
        retainedPct: 0,
        multiplier: 1.0,
        hasLiveStats: false,
      });
    });
  });

  const teams = TEAMS_DB.map((t) => ({
    id: t.id,
    name: t.name,
    capSpace: t.capSpace,
    standing: t.standing,
    phase: t.phase,
    needs: (t as any).needs ?? [],
  }));

  return NextResponse.json({
    teams,
    players: [...players, ...picks],
    capCeiling: CAP_CEILING,
    capFloor: CAP_FLOOR,
    generatedAt: new Date().toISOString(),
    source: usedLiveRoster ? 'NHL API (live)' : 'Static roster (fallback)',
    liveStats: analyticsMap.size > 0,
  });
}
