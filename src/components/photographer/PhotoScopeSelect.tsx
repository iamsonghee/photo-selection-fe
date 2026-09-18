"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { RecommendationMark } from "@/components/RecommendationMark";
import styles from "./PhotoScopeSelect.module.css";

type PhotoScopeSelectProps = {
  totalCount: number;
  recommendedCount: number;
  recommendedOnly: boolean;
  onChange: (recommendedOnly: boolean) => void;
  showRecommendationGuide?: boolean;
  onDismissRecommendationGuide?: () => void;
};

export function PhotoScopeSelect({ totalCount, recommendedCount, recommendedOnly, onChange, showRecommendationGuide, onDismissRecommendationGuide }: PhotoScopeSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const select = (nextRecommendedOnly: boolean) => {
    onChange(nextRecommendedOnly);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={`보기 범위: ${recommendedOnly ? "추천한 사진" : "전체 사진"}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          onDismissRecommendationGuide?.();
          setOpen((current) => !current);
        }}
      >
        {recommendedOnly ? <RecommendationMark size={13} aria-hidden /> : null}
        <span>{recommendedOnly ? "추천한 사진" : "전체 사진"}</span>
        <strong>{(recommendedOnly ? recommendedCount : totalCount).toLocaleString()}장</strong>
        <ChevronDown size={15} aria-hidden />
      </button>
      {open ? (
        <div id={menuId} className={styles.menu} role="menu" aria-label="사진 보기 범위">
          <button type="button" role="menuitemradio" aria-checked={!recommendedOnly} onClick={() => select(false)}>
            <span>전체 사진</span><strong>{totalCount.toLocaleString()}장</strong>{!recommendedOnly ? <Check size={15} aria-hidden /> : null}
          </button>
          <button type="button" role="menuitemradio" aria-checked={recommendedOnly} onClick={() => select(true)}>
            <span><RecommendationMark size={13} aria-hidden />추천한 사진</span><strong>{recommendedCount.toLocaleString()}장</strong>{recommendedOnly ? <Check size={15} aria-hidden /> : null}
          </button>
        </div>
      ) : null}
      {showRecommendationGuide && !open ? (
        <div className={styles.guide} role="status" data-recommendation-guide>
          <button type="button" onClick={onDismissRecommendationGuide} aria-label="작가 추천 안내 닫기"><X size={14} aria-hidden /></button>
          <strong>고객에게 사진을 추천할 수 있어요</strong>
          <p>사진을 선택한 뒤 <b>고객에게 추천</b>을 누르면 고객 화면에 A 추천으로 표시됩니다.</p>
        </div>
      ) : null}
    </div>
  );
}
