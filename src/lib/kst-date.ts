/**
 * DB에는 UTC(timestamptz)로 저장된 시각을 항상 한국 시간(KST, UTC+9, DST 없음)으로
 * 표시하기 위한 공통 포맷터. `date-fns`의 `format()`이나 `toLocaleDateString()`은
 * 실행 환경(서버는 보통 UTC, 브라우저는 사용자 기기 시간대)의 로컬 시간대를 그대로
 * 쓰기 때문에, 서버에서 렌더링되거나 해외에서 접속하면 시각이 어긋난다.
 * `Intl.DateTimeFormat`의 `timeZone` 옵션은 실행 환경과 무관하게 항상 같은 결과를
 * 주므로 이걸로 시:분:초까지 직접 뽑아 원하는 패턴으로 조립한다.
 */
const KST_TIME_ZONE = "Asia/Seoul";

function kstParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  // hour12:false인데도 자정을 "24"로 주는 로케일이 있어 보정한다.
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { year: get("year"), month: get("month"), day: get("day"), hour, minute: get("minute") };
}

/** "2026.09.16" */
export function formatKstDate(iso: string): string {
  const { year, month, day } = kstParts(iso);
  return `${year}.${month}.${day}`;
}

/** "2026.09.16 14:30" */
export function formatKstDateTime(iso: string): string {
  const { year, month, day, hour, minute } = kstParts(iso);
  return `${year}.${month}.${day} ${hour}:${minute}`;
}

/** "2026-09-16 14:30" */
export function formatKstDateTimeDash(iso: string): string {
  const { year, month, day, hour, minute } = kstParts(iso);
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

/** "2026년 9월" */
export function formatKstYearMonth(iso: string): string {
  const { year, month } = kstParts(iso);
  return `${year}년 ${Number(month)}월`;
}

/** "2026년 9월 16일" */
export function formatKstLongDate(iso: string): string {
  const { year, month, day } = kstParts(iso);
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

/** "2026년 9월 16일 14:30" */
export function formatKstLongDateTime(iso: string): string {
  const { year, month, day, hour, minute } = kstParts(iso);
  return `${year}년 ${Number(month)}월 ${Number(day)}일 ${hour}:${minute}`;
}

/**
 * KST 벽시계 값을 UTC getter로 바로 읽을 수 있도록 시각을 밀어둔 Date를 돌려준다
 * (한국은 DST가 없어 항상 고정 +9시간이라 이 방식이 안전하다). "이 시각 + N일" 같은
 * 날짜 산술을 KST 달력 기준으로 하고 싶을 때, 반환값에 setUTCDate 등을 그대로 쓰면 된다.
 */
export function toKstShifted(iso: string): Date {
  return new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
}
