export async function readAdminResponse<T = Record<string, unknown>>(
  res: Response,
  fallbackMessage: string,
): Promise<T> {
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Some failures may not include a JSON body.
  }

  const error = typeof data === "object" && data !== null && "error" in data
    ? String((data as { error?: unknown }).error ?? "")
    : "";

  if (!res.ok || error) {
    const statusMessage = res.ok ? fallbackMessage : `${fallbackMessage} (HTTP ${res.status})`;
    throw new Error(error || statusMessage);
  }

  return (data ?? {}) as T;
}

export function adminErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error ? error.message : fallbackMessage;
}
