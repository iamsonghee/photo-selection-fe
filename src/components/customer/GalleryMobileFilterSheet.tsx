"use client";

import { Star, X } from "lucide-react";
import type { ColorTag } from "@/types";

type ColorOption = { key: ColorTag; hex: string; label: string };

interface GalleryMobileFilterSheetProps {
  open: boolean;
  onClose: () => void;
  onReset: () => void;
  starFilter: number;
  onStarFilterChange: (value: number) => void;
  colorFilter: ColorTag[];
  colorOptions: ColorOption[];
  onColorFilterChange: (value: ColorTag[]) => void;
  colorFilterMode: "any" | "all";
  onColorFilterModeChange: (value: "any" | "all") => void;
  hasBlurryPhotos?: boolean;
  hasEyesClosedPhotos?: boolean;
  qualityFilter?: Set<"blurry" | "eyesClosed">;
  onToggleQualityFilter?: (value: "blurry" | "eyesClosed") => void;
}

export function GalleryMobileFilterSheet({
  open,
  onClose,
  onReset,
  starFilter,
  onStarFilterChange,
  colorFilter,
  colorOptions,
  onColorFilterChange,
  colorFilterMode,
  onColorFilterModeChange,
  hasBlurryPhotos = false,
  hasEyesClosedPhotos = false,
  qualityFilter = new Set(),
  onToggleQualityFilter,
}: GalleryMobileFilterSheetProps) {
  if (!open) return null;
  return (
    <>
      <button type="button" className="gmf-backdrop" aria-label="필터 닫기" onClick={onClose} />
      <section className="gmf-sheet" role="dialog" aria-modal="true" aria-labelledby="gmf-title">
        <div className="gmf-header">
          <h2 id="gmf-title">필터 설정</h2>
          <button type="button" className="gmf-reset" onClick={onReset}>필터 초기화</button>
          <button type="button" className="gmf-close" aria-label="필터 닫기" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="gmf-body">
          <div className="gmf-section">
            <h3>별점</h3>
            <div className="gmf-stars">
              <span style={{ color: starFilter > 0 ? "var(--accent)" : undefined }}>≥</span>
              {([1, 2, 3, 4, 5] as const).map((star) => (
                <button key={star} type="button" aria-label={`별점 ${star}점 이상 필터`} aria-pressed={starFilter === star} onClick={() => onStarFilterChange(starFilter === star ? 0 : star)}>
                  <Star size={26} fill={star <= starFilter ? "currentColor" : "none"} strokeWidth={2} style={{ color: star <= starFilter ? "var(--accent)" : "#c6cbd0" }} />
                </button>
              ))}
            </div>
          </div>
          <div className="gmf-section">
            <h3>찜</h3>
            <div className="gmf-options">
              {colorOptions.length === 0 ? <p className="gmf-empty">아직 찜한 사람이 없어요</p> : colorOptions.map((option) => {
                const active = colorFilter.includes(option.key);
                return <button key={option.key} type="button" className={active ? "gmf-option gmf-option-active" : "gmf-option"} aria-pressed={active} onClick={() => onColorFilterChange(active ? colorFilter.filter((item) => item !== option.key) : [...colorFilter, option.key])}><span style={{ background: option.hex }} />{option.label}</button>;
              })}
            </div>
            {colorFilter.length > 1 && <div className="gmf-mode" role="radiogroup" aria-label="찜 조건">
              <button type="button" role="radio" aria-checked={colorFilterMode === "any"} className={colorFilterMode === "any" ? "gmf-mode-active" : ""} onClick={() => onColorFilterModeChange("any")}>한 명이라도 찜</button>
              <button type="button" role="radio" aria-checked={colorFilterMode === "all"} className={colorFilterMode === "all" ? "gmf-mode-active" : ""} onClick={() => onColorFilterModeChange("all")}>모두 찜</button>
            </div>}
          </div>
          {(hasBlurryPhotos || hasEyesClosedPhotos) && <div className="gmf-section">
            <h3>사진 상태</h3>
            <div className="gmf-quality">
              {hasBlurryPhotos && <button type="button" aria-pressed={qualityFilter.has("blurry")} onClick={() => onToggleQualityFilter?.("blurry")}>흐림만</button>}
              {hasEyesClosedPhotos && <button type="button" aria-pressed={qualityFilter.has("eyesClosed")} onClick={() => onToggleQualityFilter?.("eyesClosed")}>눈감음만</button>}
            </div>
          </div>}
        </div>
      </section>
      <style>{`
        .gmf-backdrop{position:fixed;inset:0;z-index:80;border:0;background:rgba(0,0,0,.48)}
        .gmf-sheet{position:fixed;left:50%;bottom:0;z-index:81;width:min(100%,375px);transform:translateX(-50%);border-radius:8px 8px 0 0;background:var(--surface);padding-bottom:env(safe-area-inset-bottom);box-shadow:0 -8px 30px rgba(0,0,0,.12);color:var(--foreground)}
        .gmf-header{height:58px;padding:20px 20px 0;display:flex;align-items:center;gap:12px}.gmf-header h2{margin:0;margin-right:auto;font-size:18px;line-height:30px;font-weight:700;letter-spacing:-.6px}.gmf-reset{border:0;background:transparent;color:#838b94;font:12px/24px Pretendard,sans-serif;text-decoration:underline;padding:0}.gmf-close{display:none;border:0;background:transparent;padding:4px;color:var(--muted-foreground)}
        .gmf-body{padding:20px}.gmf-section+.gmf-section{margin-top:20px;padding-top:20px;border-top:1px solid #eef0f2}.gmf-section h3{margin:0 0 10px;font-size:14px;line-height:24px;font-weight:500}.gmf-stars{display:flex;align-items:center;gap:4px;padding:2px 0}.gmf-stars>span{margin-right:4px;color:#aab0b8;font-weight:700}.gmf-stars button{padding:4px;border:0;background:transparent;display:inline-flex}
        .gmf-options{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.gmf-option{height:39px;min-width:0;padding:0 4px;border:1px solid #c6cbd0;border-radius:4px;background:var(--surface);display:flex;align-items:center;justify-content:center;gap:4px;font:12px/19px Pretendard,sans-serif}.gmf-option>span{width:10px;height:10px;border-radius:50%;flex:none}.gmf-option-active{border-color:var(--accent);background:#fff0e8}.gmf-empty{grid-column:1/-1;margin:0;color:#6f747b;font-size:12px}
        .gmf-mode,.gmf-quality{margin-top:10px;display:flex;gap:6px}.gmf-mode button,.gmf-quality button{flex:1;min-height:38px;padding:0 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--muted-foreground);font:500 13px/18px Pretendard,sans-serif}.gmf-mode-active,.gmf-quality button[aria-pressed=true]{border-color:var(--accent)!important;background:#fff5f0!important;color:var(--foreground)!important;font-weight:600!important}
        @media(min-width:768px){.gmf-backdrop,.gmf-sheet{display:none}}
      `}</style>
    </>
  );
}
