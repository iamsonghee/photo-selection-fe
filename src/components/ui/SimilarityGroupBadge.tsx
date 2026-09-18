"use client";

import type { MouseEvent } from "react";
import { Layers, ChevronDown, ChevronUp } from "lucide-react";
import { RecommendationMark } from "@/components/RecommendationMark";
import styles from "./SimilarityGroupBadge.module.css";

/** 묶음 탐색은 선택과 구분되는 중립색을 사용하고 장수는 항상 전체 장수로 표시한다. */
export function SimilarityGroupBadge({ count, expanded, selectedCount = 0, recommendedCount = 0, label, onClick, inline = false }: {
  count: number; expanded: boolean; selectedCount?: number; recommendedCount?: number; label?: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void; inline?: boolean;
}) {
  return <div className={`${styles.wrap} ${inline ? styles.inline : ""}`}>
    {selectedCount > 0 && <span className={styles.selected}>{selectedCount}장 선택</span>}
    {recommendedCount > 0 && <span className={styles.recommended} aria-label={`작가 추천 ${recommendedCount}장`}><RecommendationMark size={10} />추천 {recommendedCount}장</span>}
    <button type="button" className={styles.button} onClick={onClick} aria-expanded={expanded}
      aria-label={`${label ? `${label}, ` : ""}유사컷 ${count}장 ${expanded ? "접기" : "펼치기"}`}>
      <Layers size={13} aria-hidden />
      <span>{expanded && label ? <><span className={styles.word}>묶음 </span>{label.replace("묶음 ", "")} · </> : <span className={styles.word}>유사컷 </span>}{count}장</span>
      {expanded ? <ChevronUp size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />}
    </button>
  </div>;
}
