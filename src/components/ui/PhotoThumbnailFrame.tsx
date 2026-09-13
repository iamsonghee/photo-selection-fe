import type { HTMLAttributes } from "react";
import styles from "./PhotoThumbnailFrame.module.css";

type PhotoThumbnailFrameProps = HTMLAttributes<HTMLDivElement> & {
  /** 실제 사진 선택 상태 — 그룹 펼침과 구분한다 */
  active?: boolean;
  /** 화면별 overlay보다 위, checkbox나 badge보다 아래에 링을 둘 때 사용한다. */
  ringLayer?: number;
};

/**
 * 고객/작가 갤러리가 공유하는 사진 media frame.
 * 기본 상태에는 외곽선을 만들지 않고 active 상태에서만 Brand Orange inset을 표시한다.
 */
export function PhotoThumbnailFrame({
  active = false,
  ringLayer = 6,
  className = "",
  children,
  ...props
}: PhotoThumbnailFrameProps) {
  return (
    <div
      {...props}
      data-photo-thumbnail-frame
      data-active={active ? "true" : "false"}
      className={`${styles.frame}${className ? ` ${className}` : ""}`}
    >
      {children}
      {active ? (
        <span
          data-photo-thumbnail-selection-ring
          className={styles.selectionRing}
          style={{ zIndex: ringLayer }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}
