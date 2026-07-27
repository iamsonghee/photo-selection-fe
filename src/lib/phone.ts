const PHONE_REGEX = /^01[016789]-?\d{3,4}-?\d{4}$/;

/** 한국 휴대폰번호 형식인지 확인(대시 유무 무관). */
export function isValidKoreanPhone(raw: string): boolean {
  return PHONE_REGEX.test(raw.trim());
}

/** 숫자만 남긴다 — DB 저장/중복 조회 시 비교 기준. */
export function normalizePhone(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

/** 숫자만 있는 전화번호를 화면 표시용으로 하이픈 포맷팅한다. */
export function formatPhone(digits: string): string {
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
}
