"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { RecommendationMark } from "@/components/RecommendationMark";
import styles from "./PhotoScopeSelect.module.css";

type PhotoScopeSelectProps = {
  totalCount: number;
  recommendedCount: number;
  recommendedOnly: boolean;
  onChange: (recommendedOnly: boolean) => void;
};

export function PhotoScopeSelect({ totalCount, recommendedCount, recommendedOnly, onChange }: PhotoScopeSelectProps) {
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
        className={`${styles.trigger} ${recommendedOnly ? styles.triggerActive : ""}`}
        aria-label={`보기 범위: ${recommendedOnly ? "작가 추천" : "전체 사진"}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        {recommendedOnly ? <RecommendationMark size={13} aria-hidden /> : null}
        <span>{recommendedOnly ? "작가 추천" : "전체 사진"}</span>
        <strong>{(recommendedOnly ? recommendedCount : totalCount).toLocaleString()}장</strong>
        <ChevronDown size={15} aria-hidden />
      </button>
      {open ? (
        <div id={menuId} className={styles.menu} role="menu" aria-label="사진 보기 범위">
          <button type="button" role="menuitemradio" aria-checked={!recommendedOnly} onClick={() => select(false)}>
            <span>전체 사진</span><strong>{totalCount.toLocaleString()}장</strong>{!recommendedOnly ? <Check size={15} aria-hidden /> : null}
          </button>
          <button type="button" role="menuitemradio" aria-checked={recommendedOnly} onClick={() => select(true)}>
            <span><RecommendationMark size={13} aria-hidden />작가 추천</span><strong>{recommendedCount.toLocaleString()}장</strong>{recommendedOnly ? <Check size={15} aria-hidden /> : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}
