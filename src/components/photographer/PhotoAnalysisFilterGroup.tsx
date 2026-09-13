"use client";

import styles from "./PhotoAnalysisFilterGroup.module.css";

type FilterOption = {
  count: number;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

type PhotoAnalysisFilterGroupProps = {
  similarity?: FilterOption;
  eyesClosed?: FilterOption;
  blurry?: FilterOption;
  layout?: "inline" | "grid";
};

/** 원본 업로드와 원본 탭에서 같은 AI 결과를 같은 조작 문법으로 보여준다. */
export function PhotoAnalysisFilterGroup({
  similarity,
  eyesClosed,
  blurry,
  layout = "inline",
}: PhotoAnalysisFilterGroupProps) {
  const options = [
    similarity ? { key: "similarity", label: "유사컷 묶어보기", ...similarity } : null,
    eyesClosed ? { key: "eyesClosed", label: "눈감음만", ...eyesClosed } : null,
    blurry ? { key: "blurry", label: "흔들림만", ...blurry } : null,
  ].filter((option): option is NonNullable<typeof option> => Boolean(option && option.count > 0));

  if (options.length === 0) return null;

  return (
    <div className={`${styles.root}${layout === "grid" ? ` ${styles.grid}` : ""}`} role="group" aria-label="사진 분석 필터">
      {options.map((option) => (
        <label key={option.key} className={styles.item} data-active={option.checked ? "true" : undefined}>
          <input type="checkbox" checked={option.checked} onChange={(event) => option.onChange(event.target.checked)} />
          <span>{option.label}</span>
          <b>{option.count.toLocaleString()}</b>
        </label>
      ))}
    </div>
  );
}
