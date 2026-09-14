import { format } from "date-fns";
import type { PhotographerTier, BetaStatus } from "@/lib/beta-policy";

export function formatAdminDate(iso: string): string {
  return format(new Date(iso), "yyyy.MM.dd");
}

export function formatAdminDateTime(iso: string): string {
  return format(new Date(iso), "yyyy.MM.dd HH:mm");
}

export type TierBadge = { label: string; className: string };

/** 작가 등급/베타 상태를 배지 라벨+색상으로 변환 */
export function getTierBadge(tier: PhotographerTier, betaStatus: BetaStatus): TierBadge {
  if (tier === "admin") return { label: "관리자", className: "bg-primary/20 text-primary" };
  if (tier === "beta") return { label: "베타 참여중", className: "bg-success/20 text-success" };
  if (betaStatus === "ended") return { label: "베타 종료", className: "bg-surface-raised text-muted-foreground" };
  if (betaStatus === "suspended") return { label: "중지", className: "bg-danger/20 text-danger" };
  return { label: "일반", className: "bg-surface-raised text-muted-foreground" };
}

export type DdayLevel = "ok" | "warn" | "danger";

/** D-day 텍스트 + 위험도. date는 ISO 날짜/일시 문자열.
 * customerDDay(고객 화면용)와 계산식이 다르다 — 여기는 date 자체를 자정으로 정규화해
 * 시:분:초에 관계없이 "그 날짜"를 기준으로 세므로 병합하지 않는다. */
export function ddayFrom(date: string): { text: string; level: DdayLevel } {
  const diff = Math.ceil(
    (new Date(date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000
  );
  if (diff > 3) return { text: `D-${String(diff).padStart(2, "0")}`, level: "ok" };
  if (diff > 0) return { text: `D-${String(diff).padStart(2, "0")}`, level: "warn" };
  if (diff === 0) return { text: "D-Day", level: "danger" };
  return { text: `D+${String(Math.abs(diff)).padStart(2, "0")}`, level: "danger" };
}
