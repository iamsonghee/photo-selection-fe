import "server-only";

const ALLOWED_R2_HOST = process.env.R2_HOST ?? "";

/**
 * R2 공개 URL에서 object key를 추출합니다 (서버 전용).
 * R2_HOST 환경변수로 도메인 whitelist를 강제합니다.
 */
export function extractR2Key(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (ALLOWED_R2_HOST && parsed.hostname !== ALLOWED_R2_HOST) {
    throw new Error(`R2 domain not allowed: ${parsed.hostname}`);
  }

  const key = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!key) throw new Error(`Empty key from URL: ${url}`);
  return key;
}
