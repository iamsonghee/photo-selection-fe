import type { BadgeTone } from "@/components/ui/Badge";

/**
 * 고객 화면의 D-day 표기 — 셀렉 갤러리·보정본 검토 목록·원본 다운로드 기한이 모두 이 규칙을 쓴다.
 *
 * 같은 계산과 같은 색 기준을 화면마다 다시 적으면(예전에는 두 군데에 복사돼 있었다) 한쪽만 고쳐져
 * "3일 남았는데 한 화면은 경고색, 다른 화면은 회색"이 된다. 표기는 `Badge` 컴포넌트가 그린다.
 *
 * 색 기준: 3일 초과는 중립, 1~3일은 주의, 당일·초과는 임계.
 * 지난 기한도 숨기지 않고 `D+N`으로 보여준다 — 서버가 막는 조건이 아니어서 사실대로 알리는 편이 낫다.
 */
export type CustomerDDay = { label: string; tone: BadgeTone; days: number };

export function customerDDay(target: Date | string | null | undefined): CustomerDDay | null {
  if (!target) return null;
  const date = target instanceof Date ? target : new Date(target);
  if (Number.isNaN(date.getTime())) return null;

  const days = Math.ceil((date.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  const label = days > 0 ? `D-${days}` : days === 0 ? "D-Day" : `D+${Math.abs(days)}`;
  const tone: BadgeTone = days > 3 ? "time" : days > 0 ? "attention-warning" : "attention-critical";
  return { label, tone, days };
}
