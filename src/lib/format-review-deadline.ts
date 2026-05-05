/**
 * review_deadline 저장값(YYYY-MM-DD, ISO, 뒤에 붙은 `-`·`.` 등)에서
 * 앞의 연-월-일만 추출해 `YYYY-MM-DD`로 맞춘다. UI 표시와 PATCH 저장에 동일하게 사용.
 */
export function normalizeReviewDeadlineYmd(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const head = s.split("T")[0].split(" ")[0] ?? "";
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(head);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
