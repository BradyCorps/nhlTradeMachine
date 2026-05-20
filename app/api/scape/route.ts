import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const URL = 'https://puckpedia.com/team/winnipeg-jets';
  const HEADERS = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  try {
    // 1. Fetch the HTML
    const response = await fetch(URL, { headers: HEADERS });
    if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);

    const html = await response.text();
    const $ = cheerio.load(html);

    const financialData: Record<string, any> = {};

    // 2. Parse the Data
    $('tr').each((_, row) => {
      const cols = $(row).find('td');
      if (cols.length > 3) {
        const nameTag = $(cols[0]).find('a');
        if (!nameTag.length) return; // Skip if no name link found

        const rawName = nameTag.text().trim();

        // Clean the Cap Hit string ($8,500,000 -> 8.5)
        const capString = $(cols[2])
          .text()
          .trim()
          .replace('$', '')
          .replace(/,/g, '');
        const capHitMillions = capString
          ? parseFloat(capString) / 1000000
          : 1.0;

        // Find Clauses
        const rowText = $(row).text();
        let clause = null;
        if (rowText.includes('NMC')) clause = 'NMC';
        else if (rowText.includes('M-NTC')) clause = 'M-NTC';

        financialData[rawName] = {
          capHit: Number(capHitMillions.toFixed(2)),
          clause: clause,
        };
      }
    });

    // 3. Save to File System
    const outputDir = path.join(process.cwd(), 'app', 'data');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filePath = path.join(outputDir, 'financials.json');
    fs.writeFileSync(filePath, JSON.stringify(financialData, null, 2));

    return NextResponse.json({
      success: true,
      message: `Successfully scraped ${
        Object.keys(financialData).length
      } players`,
      data: financialData,
    });
  } catch (error: any) {
    console.error('Scraping Error:', error.message);
    return NextResponse.json(
      {
        success: false,
        error: 'Scraping failed',
        details: error.message, // This will send the exact error to your browser
      },
      { status: 500 }
    );
  }
}
