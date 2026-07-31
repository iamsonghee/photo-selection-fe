import "server-only";

const UNSAFE_RE = /[/\\\x00-\x1f"]/g;
const MAX_LEN = 80;

/** Content-Disposition에 안전하게 넣을 수 있도록 파일명 구성요소를 정리한다.
 * 슬래시/백슬래시/제어문자/따옴표 제거, 연속 공백 축소, 길이 제한. */
export function sanitizeFilenameComponent(raw: string): string {
  let cleaned = (raw || "").replace(UNSAFE_RE, "");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  if (!cleaned) cleaned = "download";
  return cleaned.slice(0, MAX_LEN);
}

/** RFC 5987 filename*(UTF-8, 한글 등 유지) + ASCII fallback filename을 함께 담은
 * Content-Disposition 헤더 값을 만든다. */
export function buildContentDisposition(displayName: string): string {
  const safe = sanitizeFilenameComponent(displayName);
  const encoded = encodeURIComponent(safe);
  return `attachment; filename="download.zip"; filename*=UTF-8''${encoded}`;
}
