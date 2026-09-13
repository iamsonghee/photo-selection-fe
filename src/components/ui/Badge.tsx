import { type HTMLAttributes, type ReactNode } from "react";

/**
 * A-CUT 공통 Badge — Status / Attention / Time 3종.
 * Turn Indicator(작가/고객 차례 표시)와는 별개 컴포넌트다: Turn = 지금 누구 차례인가,
 * Badge = 지금 Workflow가 어떤 상태인가. 색은 기존 semantic token만 재사용한다(신규 색상 없음).
 */
export type BadgeTone =
  | "status-photographer" // Status Badge · 작가 관련(보정/수정/업로드 등) — accent
  | "status-customer"     // Status Badge · 고객 관련(대기/셀렉/납품대기 등) — Customer Actor semantic(Cyan/Porcelain, docs/design-system.md §30). Blue(--primary)가 아니다.
  | "status-success"      // Status Badge · 완료/확정(완료/확정/납품완료) — success
  | "attention-warning"   // Attention Badge · 일반 주의(안내/확인 필요, 마감 임박) — warning
  | "attention-critical"  // Attention Badge · 임계/기한초과 — danger, 대비를 조금 더 강하게 허용
  | "time";                // Time Badge · 항상 Neutral

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone: BadgeTone;
  icon?: ReactNode;
  /** "customerLight" = 고객 라이트 화면(갤러리·검토 목록·잠금 갤러리)에서 쓰는 팔레트.
   * attention/status 톤은 반투명 틴트라 흰 배경에서도 그대로 읽히지만, `time`만은
   * 불투명한 다크 토큰(bg-surface-raised)이라 흰 배경에서 "어두운 칩에 회색 글씨"가 된다.
   * 그래서 이 테마에서는 `time`만 갈아 끼운다(기본값은 다크 그대로라 다른 호출부는 영향 없음). */
  theme?: "workspace" | "customerLight";
}

const toneClasses: Record<BadgeTone, string> = {
  "status-photographer": "bg-accent/10 text-accent border-accent/20",
  "status-customer": "bg-cyan/10 text-cyan border-cyan/20",
  "status-success": "bg-success/10 text-success border-success/20",
  "attention-warning": "bg-warning/10 text-warning border-warning/20",
  "attention-critical": "bg-danger/15 text-danger border-danger/30",
  time: "bg-surface-raised text-subtle-foreground border-border-subtle",
};

const lightToneClasses: Partial<Record<BadgeTone, string>> = {
  time: "bg-white text-[#5f5e5b] border-[#dde1e4]",
};

export function Badge({ tone, icon, theme = "workspace", className = "", children, ...props }: BadgeProps) {
  const toneClass =
    (theme === "customerLight" ? lightToneClasses[tone] : undefined) ?? toneClasses[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 h-6 px-2 rounded-md border text-[11px] font-semibold whitespace-nowrap ${toneClass} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}
