import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // Extract the player ID from our internal request URL
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { error: 'Player ID is required' },
      { status: 400 }
    );
  }

  try {
    // The server makes the request to the NHL (Bypassing CORS)
    const nhlResponse = await fetch(
      `https://api-web.nhle.com/v1/player/${id}/landing`
    );

    if (!nhlResponse.ok) {
      throw new Error(`NHL API Status: ${nhlResponse.status}`);
    }

    const data = await nhlResponse.json();

    // Send the data back to our frontend
    return NextResponse.json(data);
  } catch (error) {
    console.error('Server Fetch Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from NHL API' },
      { status: 500 }
    );
  }
}
