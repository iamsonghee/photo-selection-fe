import "server-only";

// 쉼표로 여러 개 — 공개 주소를 우리 도메인으로 바꾼 뒤에도 DB에 남은 예전 r2.dev 주소를 읽을 수 있게.
const ALLOWED_R2_HOSTS = (process.env.R2_HOST ?? "").split(",").map((host) => host.trim()).filter(Boolean);

/**
 * R2 공개 URL에서 object key를 추출합니다 (서버 전용).
 * R2_HOST 환경변수(쉼표 구분)로 도메인 whitelist를 강제합니다.
 */
export function extractR2Key(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (ALLOWED_R2_HOSTS.length && !ALLOWED_R2_HOSTS.includes(parsed.hostname)) {
    throw new Error(`R2 domain not allowed: ${parsed.hostname}`);
  }

  const key = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!key) throw new Error(`Empty key from URL: ${url}`);
  return key;
}
