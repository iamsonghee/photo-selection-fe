"use client";

import type { CSSProperties, MouseEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Direction = "prev" | "next";
type Size = "sm" | "md" | "lg";
type Position = "absolute" | "static";
type Align = "inside" | "edge";

const SIZE: Record<Size, { box: number; icon: number }> = {
  sm: { box: 32, icon: 16 },
  md: { box: 40, icon: 18 },
  lg: { box: 48, icon: 22 },
};

export type PrevNextButtonProps = {
  direction: Direction;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  size?: Size;
  position?: Position;
  align?: Align;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
};

/**
 * 사진/항목의 이전/다음 이동을 위한 표준 네비게이션 버튼.
 * - 모양/사이즈/배경/테두리를 페이지 간 통일하기 위한 공용 컴포넌트.
 * - 의미가 다른 "뒤로 가기"·"breadcrumb"·"CTA chevron"에는 사용하지 않는다.
 */
export function PrevNextButton({
  direction,
  onClick,
  size = "md",
  position = "absolute",
  align = "inside",
  disabled,
  ariaLabel,
  className,
  style,
}: PrevNextButtonProps) {
  const { box, icon } = SIZE[size];
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  const offset = align === "edge" ? 16 : 8;

  const positionStyle: CSSProperties =
    position === "absolute"
      ? {
          position: "absolute",
          top: "50%",
          transform: "translateY(-50%)",
          [direction === "prev" ? "left" : "right"]: offset,
          zIndex: 5,
        }
      : { position: "static" };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? (direction === "prev" ? "이전 사진" : "다음 사진")}
      className={className}
      style={{
        ...positionStyle,
        width: box,
        height: box,
        borderRadius: 9999,
        background: "rgba(0,0,0,0.45)",
        border: "1px solid #27272c",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        padding: 0,
        transition: "background 0.15s, border-color 0.15s",
        ...style,
      }}
    >
      <Icon size={icon} />
    </button>
  );
}

export default PrevNextButton;
