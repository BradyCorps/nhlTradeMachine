import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── Headshot proxy ───────────────────────────────────────────────
// Streams an NHL player mug through our own origin. The player page shows
// it, and the shareable-card export fetches this same-origin URL to inline
// the mug as a data URL for the server-side card render — no CORS
// dependency on assets.nhle.com either way.
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("u");
  if (!raw) return new NextResponse(null, { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  // SSRF guard — only proxy NHL asset hosts.
  if (target.protocol !== "https:" || !/(^|\.)nhle\.com$/i.test(target.hostname)) {
    return new NextResponse(null, { status: 403 });
  }

  try {
    const res = await fetch(target.toString(), {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*" },
      cache: "no-store",
    });
    if (!res.ok) return new NextResponse(null, { status: 404 });
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/png",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
