import { NextResponse } from "next/server";

export function issueResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store", Vary: "Cookie" } });
}

export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(req.url).origin;
}

// Enforce the limit even when Content-Length is absent or dishonest.
export async function readIssueJson(req: Request): Promise<unknown> {
  if (req.headers.get("content-type")?.split(";")[0] !== "application/json") throw new Error("Use JSON.");
  const reader = req.body?.getReader();
  if (!reader) throw new Error("Missing request body.");
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 32768) { await reader.cancel(); throw new Error("Report is too large."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(buffer));
}
