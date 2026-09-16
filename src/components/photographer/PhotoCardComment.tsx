import { MessageSquareText } from "lucide-react";
import { TruncatedTextTooltip } from "@/components/ui/TruncatedTextTooltip";
import styles from "./PhotoCardComment.module.css";

type PhotoCardCommentProps = {
  comment: string;
  className?: string;
  showLabel?: boolean;
  compact?: boolean;
  label?: string;
  truncate?: boolean;
  minimal?: boolean;
  readable?: boolean;
  onOpen?: () => void;
};

/** 사진 카드 안에서 고객 코멘트를 표시하는 공통 영역. */
export function PhotoCardComment({
  comment,
  className = "",
  showLabel = true,
  compact = false,
  label = "고객 코멘트",
  truncate = true,
  minimal = false,
  readable = false,
  onOpen,
}: PhotoCardCommentProps) {
  const normalizedComment = comment.trim();
  if (!normalizedComment) return null;

  return (
    <div
      className={`${styles.root} ${compact ? styles.compact : ""} ${minimal ? styles.minimal : ""} ${readable ? styles.readable : ""} ${!truncate ? styles.full : ""} ${className}`.trim()}
    >
      <div className={styles.label}>
        <MessageSquareText size={12} aria-hidden />
        {showLabel ? <span>{label}</span> : null}
      </div>
      <TruncatedTextTooltip text={normalizedComment} className={styles.body} />
      {onOpen ? <button type="button" className={styles.open} onClick={(event) => { event.stopPropagation(); onOpen(); }}>상세 보기</button> : null}
    </div>
  );
}
