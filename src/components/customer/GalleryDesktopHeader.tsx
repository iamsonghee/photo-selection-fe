"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Star, ChevronsDown, ChevronsUp, Layers, RotateCcw } from "lucide-react";
import { FilenameSearchInput } from "@/components/ui/FilenameSearchInput";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { COLOR_OPTIONS } from "@/lib/gallery-filter";
import type { ColorTag, SortOrder } from "@/types";

type TabFilter = "all" | "selected";

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "filename", label: "파일명순" },
  { value: "oldest", label: "번호순" },
  { value: "newest", label: "최신순" },
];

interface GalleryDesktopHeaderProps {
  token: string;
  projectName: string;
  photographerName: string | null;
  deadlineLabel: string;
  dDayLabel: string;
  dDayTone: BadgeTone;
  Y: number;
  N: number;
  tabFilter: TabFilter;
  onTabFilterChange: (value: TabFilter) => void;
  starFilter: number;
  hoverStar: number;
  onStarFilterChange: (value: number) => void;
  onHoverStarChange: (value: number) => void;
  colorFilter: ColorTag[];
  /** 프로젝트에서 실제로 쓰인 색(=참여 중인 사람). 안 쓰인 색은 필터에 노출하지 않는다. */
  usedColors: ColorTag[];
  /** 이 기기의 색 — 점에 별도 테두리를 준다 */
  myColor: ColorTag | null;
  /** 색을 부르는 이름("내 찜" / "신랑 찜" / "빨강 찜") — 참가자 명단을 아는 부모가 만들어 넘긴다 */
  colorLabel: (key: ColorTag) => string;
  /** 색 2개 이상일 때 "한 명이라도 찜"(any) / "모두 찜"(all) */
  colorFilterMode: "any" | "all";
  onColorFilterModeChange: (mode: "any" | "all") => void;
  onColorFilterChange: (value: ColorTag[]) => void;
  showSimilarityToggle: boolean;
  similarityToggleOn: boolean;
  onSimilarityToggleChange: (value: boolean) => void;
  hasBlurryPhotos: boolean;
  hasEyesClosedPhotos: boolean;
  qualityFilter: Set<"blurry" | "eyesClosed">;
  onToggleQualityFilter: (key: "blurry" | "eyesClosed") => void;
  onResetFilters: () => void;
  sortOrder: SortOrder;
  onSortOrderChange: (value: SortOrder) => void;
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  onJumpToFirst: () => void;
  onJumpToLast: () => void;
}

/** 고객 셀렉 갤러리 PC(≥768px) 헤더 · 툴바 — docs/customer-design.md §10 "PC composition" 참조.
 * 필터·정렬·검색은 상시 노출하며 가용 폭에 따라 그룹 단위로 줄바꿈한다. */
export function GalleryDesktopHeader({
  token,
  projectName,
  photographerName,
  deadlineLabel,
  dDayLabel,
  dDayTone,
  Y,
  N,
  tabFilter,
  onTabFilterChange,
  starFilter,
  hoverStar,
  onStarFilterChange,
  onHoverStarChange,
  colorFilter,
  usedColors,
  myColor,
  colorLabel,
  colorFilterMode,
  onColorFilterModeChange,
  onColorFilterChange,
  showSimilarityToggle,
  similarityToggleOn,
  onSimilarityToggleChange,
  hasBlurryPhotos,
  hasEyesClosedPhotos,
  qualityFilter,
  onToggleQualityFilter,
  onResetFilters,
  sortOrder,
  onSortOrderChange,
  searchValue,
  onSearchValueChange,
  onJumpToFirst,
  onJumpToLast,
}: GalleryDesktopHeaderProps) {
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    // 필터 칩이 늘어나도 사진 첫 행을 가리지 않도록 실제 헤더 높이를 전달한다.
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty("--selection-header-height", `${header.offsetHeight}px`);
    });
    observer.observe(header);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty("--selection-header-height"); };
  }, []);
  return (
    <header className="gld-header" ref={headerRef}>
      <div className="gld-top">
        <div className="gld-brand-group">
          <Link href={token ? `/c/${token}` : "#"} aria-label="처음 화면으로" className="gld-brand-mark">
            A
          </Link>
          <div>
            <h1 className="gld-title">{projectName}</h1>
            <p className="gld-deadline">
              {deadlineLabel}
              {dDayLabel && (
                <Badge tone={dDayTone} theme="customerLight" className="font-mono">
                  {dDayLabel}
                </Badge>
              )}
            </p>
          </div>
        </div>

        <div className="gld-summary-group">
          {photographerName && (
            <>
              <div className="gld-photographer">
                <p>담당 작가</p>
                <p>{photographerName}</p>
              </div>
              <div className="gld-divider-v" />
            </>
          )}
          <div className="gld-selected">
            <span className="gld-selected-label">선택</span>
            <span className="gld-selected-count">
              {Y} <span>/ {N}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="gld-filter-bar-wrap">
        <div className="gld-filter-bar">
          <div className="gld-filter-left">
            {(["all", "selected"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onTabFilterChange(value)}
                className={`gld-tab${tabFilter === value ? " gld-tab-active" : ""}`}
              >
                {value === "all" ? "전체 사진" : "선택됨"}
              </button>
            ))}

          </div>
          {showSimilarityToggle && <button type="button" className={`gld-toggle${similarityToggleOn ? " gld-toggle-active" : ""}`} aria-pressed={similarityToggleOn} onClick={() => onSimilarityToggleChange(!similarityToggleOn)}><Layers size={15} aria-hidden />유사컷 묶어보기</button>}
          {/* PC에서는 조건을 바로 조정하며, 좁아지면 도구 그룹 단위로 다음 줄에 배치한다. */}
            <div className="gld-inline-tools" role="group" aria-label="사진 필터와 검색">
            <div className="gld-filter-left">
            <div className="gld-stars">
              <span className="gld-stars-op" style={{ color: starFilter > 0 ? "var(--accent)" : undefined }}>
                ≥
              </span>
              {([1, 2, 3, 4, 5] as const).map((s) => {
                const filled = s <= (hoverStar || starFilter);
                const previewing = hoverStar > 0;
                return (
                  <button
                    key={s}
                    type="button"
                    className="gld-star-btn"
                    aria-label={`별점 ${s}점 이상 필터`}
                    aria-pressed={starFilter === s}
                    style={{
                      color: filled ? (previewing ? "rgba(255,77,0,.7)" : "#FF4D00") : undefined,
                      transform: hoverStar === s ? "scale(1.2)" : "scale(1)",
                    }}
                    onClick={() => {
                      onStarFilterChange(starFilter === s ? 0 : s);
                      onHoverStarChange(0);
                    }}
                    onMouseEnter={() => onHoverStarChange(s)}
                    onMouseLeave={() => onHoverStarChange(0)}
                    onPointerDown={() => onHoverStarChange(s)}
                  >
                    <Star size={18} fill={filled ? "currentColor" : "none"} strokeWidth={2} aria-hidden="true" style={{ display: "block", flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>

            {hasBlurryPhotos && (
              <button
                type="button"
                onClick={() => onToggleQualityFilter("blurry")}
                className={`gld-toggle${qualityFilter.has("blurry") ? " gld-toggle-active gld-toggle-warning" : ""}`}
                aria-pressed={qualityFilter.has("blurry")}
              >
                흐림만
              </button>
            )}
            {hasEyesClosedPhotos && (
              <button
                type="button"
                onClick={() => onToggleQualityFilter("eyesClosed")}
                className={`gld-toggle${qualityFilter.has("eyesClosed") ? " gld-toggle-active gld-toggle-info" : ""}`}
                aria-pressed={qualityFilter.has("eyesClosed")}
              >
                눈감음만
              </button>
            )}
          </div>

          <div className="gld-filter-right">
            <div className="gld-colors">
              {COLOR_OPTIONS.filter((option) => usedColors.includes(option.key)).map((option) => {
                const isActive = colorFilter.includes(option.key);
                const label = colorLabel(option.key);
                return (
                  <button
                    key={option.key}
                    type="button"
                    title={`${label}만 보기`}
                    aria-label={`${label}만 보기`}
                    aria-pressed={isActive}
                    onClick={() =>
                      onColorFilterChange(
                        isActive ? colorFilter.filter((c) => c !== option.key) : [...colorFilter, option.key]
                      )
                    }
                    className={`gld-color-dot${isActive ? " gld-color-dot-active" : ""}${option.key === myColor ? " gld-color-dot-mine" : ""}`}
                    style={{ background: option.hex }}
                  />
                );
              })}
            </div>

            {/* 색 = 사람이라 둘 이상 고르면 "누구 하나라도"와 "둘 다"가 다른 질문이 된다 */}
            {colorFilter.length > 1 && (
              <button
                type="button"
                aria-pressed={colorFilterMode === "all"}
                title={colorFilterMode === "all" ? "고른 사람이 모두 찜한 사진만 보는 중" : "고른 사람 중 한 명이라도 찜한 사진을 보는 중"}
                onClick={() => onColorFilterModeChange(colorFilterMode === "all" ? "any" : "all")}
                className={`gld-color-mode${colorFilterMode === "all" ? " gld-color-mode-on" : ""}`}
              >
                모두 찜
              </button>
            )}

            <button type="button" title="초기화" aria-label="필터 초기화" onClick={onResetFilters} className="gld-icon-btn">
              <RotateCcw size={13} strokeWidth={1.8} />
            </button>

            <select
              value={sortOrder}
              onChange={(event) => onSortOrderChange(event.target.value as SortOrder)}
              className="gld-sort-select"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <div className="gld-jump-group">
              <button type="button" title="처음으로" aria-label="처음으로 이동" onClick={onJumpToFirst} className="gld-icon-btn">
                <ChevronsUp size={14} strokeWidth={1.8} />
              </button>
              <button type="button" title="마지막으로" aria-label="마지막으로 이동" onClick={onJumpToLast} className="gld-icon-btn">
                <ChevronsDown size={14} strokeWidth={1.8} />
              </button>
            </div>

            <FilenameSearchInput
              value={searchValue}
              onChange={onSearchValueChange}
              placeholder="파일명 검색 (쉼표로 여러 개)"
              className="gld-search"
              style={{ "--fsi-height": "32px", "--fsi-width": "auto", "--fsi-input-width": "180px" } as React.CSSProperties}
            />
          </div>
          </div>
        </div>
        {(starFilter > 0 || colorFilter.length > 0 || qualityFilter.size > 0 || searchValue.trim()) && <div className="gld-active-filters" aria-label="적용 중인 필터">
          {starFilter > 0 && <button onClick={() => onStarFilterChange(0)}>{starFilter}점 이상 ×</button>}
          {colorFilter.map(color => <button key={color} onClick={() => onColorFilterChange(colorFilter.filter(value => value !== color))}>{colorLabel(color)} ×</button>)}
          {Array.from(qualityFilter).map(key => <button key={key} onClick={() => onToggleQualityFilter(key)}>{key === "blurry" ? "흐림" : "눈감음"} ×</button>)}
          {searchValue.trim() && <button onClick={() => onSearchValueChange("")}>{searchValue} ×</button>}
        </div>}
      </div>

      <style>{`
        .gld-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 50;
          background: var(--customer-canvas);
          border-bottom: 1px solid var(--customer-divider);
        }

        .gld-top {
          max-width: var(--customer-gallery-max-width, 1440px);
          margin: 0 auto;
          height: 64px;
          padding: 0 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }

        .gld-brand-group {
          display: flex;
          align-items: center;
          gap: 16px;
          min-width: 0;
        }

        .gld-brand-mark {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--accent);
          color: #fff;
          font-weight: 800;
          font-size: 15px;
          text-decoration: none;
        }

        .gld-title {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          line-height: 1.3;
          color: var(--customer-ink);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .gld-deadline {
          margin: 4px 0 0;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: var(--customer-ink-secondary);
        }

        .gld-summary-group {
          display: flex;
          align-items: center;
          gap: 24px;
          flex-shrink: 0;
        }

        .gld-photographer {
          text-align: right;
        }
        .gld-photographer p:first-child {
          margin: 0;
          font-size: 11px;
          color: var(--customer-ink-secondary);
        }
        .gld-photographer p:last-child {
          margin: 2px 0 0;
          font-size: 13px;
          font-weight: 700;
          color: var(--customer-ink);
        }

        .gld-divider-v {
          width: 1px;
          height: 24px;
          background: var(--customer-divider);
          flex-shrink: 0;
        }

        .gld-selected {
          display: flex;
          align-items: baseline;
          gap: 8px;
        }
        .gld-selected-label {
          font-size: 12px;
          font-weight: 700;
          color: var(--accent);
        }
        .gld-selected-count {
          font-size: 22px;
          font-weight: 800;
          line-height: 1;
          color: var(--customer-ink);
        }
        .gld-selected-count span {
          font-size: 13px;
          font-weight: 400;
          color: var(--customer-ink-secondary);
        }

        .gld-filter-bar-wrap {
          border-top: 1px solid var(--customer-divider);
          background: var(--customer-canvas);
        }

        .gld-filter-bar {
          max-width: var(--customer-gallery-max-width, 1440px);
          margin: 0 auto;
          min-height: 52px;
          padding: 0 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          position: relative;
        }

        .gld-filter-left,
        .gld-filter-right {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }

        .gld-tab {
          position: relative;
          padding: 8px 12px;
          font-size: 13px;
          font-weight: 600;
          color: var(--customer-ink-secondary);
          background: none;
          border: none;
          cursor: pointer;
          white-space: nowrap;
          font-family: inherit;
        }
        .gld-tab-active {
          color: var(--accent);
        }
        .gld-tab-active::after {
          content: "";
          position: absolute;
          bottom: -1px;
          left: 12px;
          right: 12px;
          height: 2px;
          background: var(--accent);
        }

        .gld-stars {
          display: flex;
          align-items: center;
          gap: 1px;
        }
        .gld-stars-op {
          font-size: 13px;
          color: #c7ccd1;
          margin-right: 3px;
          user-select: none;
        }
        .gld-star-btn {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          color: #c7ccd1;
          background: none;
          border: none;
          cursor: pointer;
          transition: color 0.1s, transform 0.1s;
        }

        .gld-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 600;
          color: var(--customer-ink-secondary);
          background: none;
          border: 1px solid var(--customer-divider);
          border-radius: 999px;
          cursor: pointer;
          white-space: nowrap;
          font-family: inherit;
        }
        .gld-toggle-active {
          color: var(--accent);
          border-color: var(--accent);
          background: #fff0e8;
        }
        .gld-toggle-warning.gld-toggle-active {
          color: #b17600;
          border-color: #ffb800;
          background: #fff6e0;
        }
        .gld-toggle-info.gld-toggle-active {
          color: #2f6fd6;
          border-color: #4da3ff;
          background: #e9f2ff;
        }

        .gld-colors {
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .gld-color-dot {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 2px solid transparent;
          cursor: pointer;
          flex-shrink: 0;
          padding: 0;
          transition: border-color 0.15s;
        }
        .gld-color-dot-mine { box-shadow: 0 0 0 2px #fff, 0 0 0 3px var(--customer-divider); }
        .gld-color-dot-active {
          border-color: var(--customer-ink);
        }
        .gld-color-mode {
          height: 24px;
          padding: 0 9px;
          border: 1px solid var(--customer-divider);
          border-radius: 999px;
          background: var(--customer-control);
          color: var(--customer-ink-secondary);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          flex-shrink: 0;
          transition: border-color 0.15s, background 0.15s, color 0.15s;
        }
        .gld-color-mode-on {
          border-color: var(--customer-ink);
          background: var(--customer-ink);
          color: #fff;
        }

        .gld-icon-btn {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          background: none;
          border: 1px solid var(--customer-divider);
          border-radius: 6px;
          color: var(--customer-ink-secondary);
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
        }
        .gld-icon-btn:hover {
          color: var(--accent);
          border-color: var(--accent);
        }

        .gld-sort-select {
          height: 28px;
          padding: 0 8px;
          background: var(--customer-canvas);
          border: 1px solid var(--customer-divider);
          border-radius: 6px;
          font-size: 12px;
          color: var(--customer-ink-secondary);
          outline: none;
          cursor: pointer;
        }

        .gld-jump-group {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        @media (max-width: 767px) {
          .gld-header {
            display: none !important;
          }
        }
        .gld-filter-bar { justify-content: flex-start; flex-wrap:wrap; padding-top:8px; padding-bottom:8px; gap:12px; }
        .gld-inline-tools { flex:1 1 640px; min-width:0; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px 16px; }
        .gld-inline-tools .gld-filter-left, .gld-inline-tools .gld-filter-right { flex-wrap:wrap; }
        .gld-inline-tools .gld-star-btn { width:24px; height:32px; }
        .gld-active-filters { max-width:1440px; margin:auto; background:var(--customer-canvas); display:flex; flex-wrap:wrap; gap:8px; padding:8px 24px; }
        .gld-active-filters button { border:1px solid var(--customer-divider); border-radius:16px; padding:5px 10px; font-size:12px; }
      `}</style>
    </header>
  );
}
