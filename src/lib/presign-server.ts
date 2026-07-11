import "server-only";

const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

const INTERNAL_PRESIGN_SECRET = process.env.INTERNAL_PRESIGN_SECRET ?? "";

export type PresignResult = {
  urls: Record<string, string>;
  expiresAt: number;
};

/**
 * FastAPI /api/storage/presign 를 호출해 R2 key → presigned URL 배치 변환.
 * keys는 최대 200개.
 */
export async function callPresignApi(keys: string[]): Promise<PresignResult> {
  if (!INTERNAL_PRESIGN_SECRET) {
    throw new Error("INTERNAL_PRESIGN_SECRET is not set");
  }
  if (keys.length === 0) {
    return { urls: {}, expiresAt: Math.floor(Date.now() / 1000) + 3600 };
  }

  const res = await fetch(`${BACKEND_URL}/api/storage/presign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${INTERNAL_PRESIGN_SECRET}`,
    },
    body: JSON.stringify({ keys }),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(
      `Presign API error ${res.status}: ${(detail as { detail?: string }).detail ?? "unknown"}`
    );
  }

  return res.json() as Promise<PresignResult>;
}
