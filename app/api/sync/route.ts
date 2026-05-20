import { NextResponse } from 'next/server';

export const revalidate = 86400;
// This represents your database of financials.
// In production, you would fetch this from a real database like Supabase or MongoDB.
const FINANCIAL_DB = [
  {
    nhlId: '8478398',
    name: 'Kyle Connor',
    capHit: 7.14,
    teamId: 'WPG',
    clause: null,
  },
  {
    nhlId: '8476460',
    name: 'Mark Scheifele',
    capHit: 8.5,
    teamId: 'WPG',
    clause: 'NMC',
  },
  {
    nhlId: '8477504',
    name: 'Josh Morrissey',
    capHit: 6.25,
    teamId: 'WPG',
    clause: null,
  },
];

export async function GET() {
  try {
    // 1. Fetch Live Advanced Stats from MoneyPuck (Daily CSV Dump)
    // Note: You update the year in the URL based on the current season
    const mpResponse = await fetch(
      'https://moneypuck.com/moneypuck/playerData/totals/2023/regular/skaters.csv'
    );

    if (!mpResponse.ok) {
      throw new Error('Failed to fetch MoneyPuck data');
    }

    const csvText = await mpResponse.text();

    // Parse the CSV into an array of rows
    const rows = csvText.split('\n');
    const headers = rows[0].split(',');

    // Find the column indexes we care about (Points, xGoals, etc.)
    const nameIdx = headers.indexOf('name');
    const pointsIdx = headers.indexOf('I_F_points');
    const xGoalsIdx = headers.indexOf('I_F_xGoals'); // Using Expected Goals as a proxy for WAR here
    const gamesIdx = headers.indexOf('games_played');

    // Create a map of MoneyPuck stats keyed by Player Name
    const liveStatsMap = new Map();

    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i].split(',');
      if (cols.length > nameIdx) {
        // Clean the name to match our database
        const rawName = cols[nameIdx]?.replace(/"/g, '');

        // Calculate a crude "Advanced Stat" score based on xGoals per game
        const games = parseFloat(cols[gamesIdx]) || 1;
        const xg = parseFloat(cols[xGoalsIdx]) || 0;
        const points = parseInt(cols[pointsIdx]) || 0;

        // Simple analytic proxy: Expected Goals per 82 games
        const advStatProxy = (xg / games) * 82;

        liveStatsMap.set(rawName, {
          points: points,
          advStat: parseFloat(advStatProxy.toFixed(2)),
        });
      }
    }

    // 2. Merge Financials with Live Stats
    const mergedRoster = FINANCIAL_DB.map((player) => {
      const liveData = liveStatsMap.get(player.name);

      return {
        id: player.nhlId,
        nhlId: player.nhlId,
        name: player.name,
        teamId: player.teamId,
        capHit: player.capHit,
        clause: player.clause,
        // If we found live stats, use them. Otherwise, default to 0.
        points: liveData ? liveData.points : 0,
        advStat: liveData ? liveData.advStat : 0.0,
      };
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: mergedRoster,
    });
  } catch (error) {
    console.error('Sync Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to sync live data' },
      { status: 500 }
    );
  }
}
