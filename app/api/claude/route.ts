import { NextResponse } from "next/server";

// Allowlist of models the client is permitted to request
const ALLOWED_MODELS = new Set([
  "claude-haiku-4-5",
  "claude-sonnet-4-5",
  "claude-sonnet-4-20250514",
  "claude-haiku-4-5-20251001",
]);

const MAX_TOKENS_LIMIT = 1500;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Validate and sanitize — never trust the client payload ───
  const requestedModel = typeof body.model === "string" ? body.model : "";
  const safeModel = ALLOWED_MODELS.has(requestedModel)
    ? requestedModel
    : "claude-sonnet-4-5";  // safe default

  const requestedTokens = typeof body.max_tokens === "number" ? body.max_tokens : 700;
  const safeTokens = Math.min(Math.max(1, requestedTokens), MAX_TOKENS_LIMIT);

  // Validate messages array — must exist and be non-empty
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages must be a non-empty array" }, { status: 400 });
  }

  // Sanitize each message — only allow role/content strings
  const safeMessages = body.messages
    .filter((m: any) => m && typeof m.role === "string" && typeof m.content === "string")
    .map((m: any) => ({ role: m.role, content: m.content }));

  if (safeMessages.length === 0) {
    return NextResponse.json({ error: "No valid messages" }, { status: 400 });
  }

  const safePayload = {
    model:      safeModel,
    max_tokens: safeTokens,
    messages:   safeMessages,
  };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(safePayload),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}