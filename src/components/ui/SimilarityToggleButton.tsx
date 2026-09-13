"use client";

import { Layers } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import styles from "./SimilarityToggleButton.module.css";

type SimilarityToggleButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-pressed" | "children" | "onClick"
> & {
  active: boolean;
  count: number;
  onClick: () => void;
  size?: "compact" | "default";
};

export function SimilarityToggleButton({
  active,
  count,
  onClick,
  size = "default",
  disabled = false,
  className = "",
  ...buttonProps
}: SimilarityToggleButtonProps) {
  const nextAction = active ? "묶기 해제" : "묶어보기";

  return (
    <button
      {...buttonProps}
      type="button"
      className={`${styles.button} ${styles[size]} ${active ? styles.active : ""} ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={`유사컷 ${count}개 그룹 ${nextAction}`}
      aria-pressed={active}
    >
      <Layers size={size === "compact" ? 13 : 16} strokeWidth={1.7} aria-hidden="true" />
      <span>유사컷</span>
      <span className={styles.count}>{count}</span>
    </button>
  );
}
