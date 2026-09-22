"use client";

import type { ReactNode } from "react";
import { ChevronDown, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { FilenameSearchInput } from "@/components/ui/FilenameSearchInput";

type ScopeOption = { value: string; label: string; count: number; icon?: ReactNode };
type ActiveFilter = { key: string; label: string; color?: string; icon?: "star" | "search"; onRemove: () => void };

export function GalleryMobileToolbar({
  leading,
  compact = false,
  scopeOptions,
  scopeValue,
  scopeOpen,
  onScopeOpenChange,
  onScopeChange,
  columns,
  onColumnsChange,
  extraAction,
  filtersOpen,
  onOpenFilters,
  activeFilterCount,
  searchOpen,
  onSearchOpenChange,
  searchValue,
  onSearchValueChange,
  activeFilters,
}: {
  leading?: ReactNode;
  compact?: boolean;
  scopeOptions: ScopeOption[];
  scopeValue: string;
  scopeOpen: boolean;
  onScopeOpenChange: (open: boolean) => void;
  onScopeChange: (value: string) => void;
  columns: 2 | 3 | 4;
  onColumnsChange: (columns: 2 | 3 | 4) => void;
  extraAction?: ReactNode;
  filtersOpen: boolean;
  onOpenFilters: () => void;
  activeFilterCount: number;
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  activeFilters: ActiveFilter[];
}) {
  const selectedScope = scopeOptions.find((option) => option.value === scopeValue) ?? scopeOptions[0];
  const nextColumns = columns === 4 ? 2 : (columns + 1) as 2 | 3 | 4;

  return <>
    <div className={`gmc-toolbar${compact ? " gmc-toolbar-compact" : ""}`}>
      <div className="gmc-leading">
        {leading}
        <button type="button" className={`gmc-scope-trigger${scopeValue !== scopeOptions[0]?.value ? " gmc-scope-trigger-active" : ""}`} aria-expanded={scopeOpen} aria-haspopup="dialog" onClick={() => onScopeOpenChange(!scopeOpen)}>
          {selectedScope?.icon}
          <strong>{selectedScope?.label}</strong>
          <span>{selectedScope?.count ?? 0}장</span>
          <ChevronDown size={13} strokeWidth={1.8} aria-hidden />
        </button>
      </div>
      <div className="gmc-actions">
        {extraAction}
        <button type="button" className="gmc-tool-btn" onClick={() => onColumnsChange(nextColumns)} aria-label={`현재 ${columns}열, 누르면 ${nextColumns}열로 변경`} title={`${columns}열 보기`}>
          <span className="gmc-density-icon" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} aria-hidden>
            {Array.from({ length: columns * 2 }, (_, index) => <span key={index} />)}
          </span>
        </button>
        <span className="gmc-tool-wrap">
          <button type="button" className={`gmc-tool-btn${filtersOpen ? " gmc-tool-btn-active" : ""}`} onClick={onOpenFilters} aria-label="사진 필터 설정" aria-expanded={filtersOpen}><SlidersHorizontal size={14} strokeWidth={1.5} /></button>
          {activeFilterCount > 0 && <span className="gmc-filter-count">{activeFilterCount}</span>}
        </span>
        <button type="button" className={`gmc-tool-btn${searchOpen ? " gmc-tool-btn-active" : ""}`} onClick={() => onSearchOpenChange(!searchOpen)} aria-label="파일명 검색" aria-expanded={searchOpen}><Search size={14} strokeWidth={1.7} /></button>
      </div>
    </div>

    {searchOpen && <div className="gmc-search-row"><FilenameSearchInput value={searchValue} onChange={onSearchValueChange} ariaLabel="파일명으로 필터링" autoFocus style={{ "--fsi-height": "36px", "--fsi-border-color": "#ff4d00", "--fsi-radius": "4px" } as React.CSSProperties} /></div>}
    {!searchOpen && activeFilters.length > 0 && <div className="gmc-active-filters" aria-label="적용 중인 필터">
      {activeFilters.map((filter) => <button key={filter.key} type="button" className="gmc-filter-chip" onClick={filter.onRemove}>
        {filter.icon === "star" && <Star size={13} fill="#ff4d00" color="#ff4d00" />}
        {filter.icon === "search" && <Search size={13} />}
        {filter.color && <span className="gmc-filter-chip-dot" style={{ background: filter.color }} />}
        <span>{filter.label}</span><X size={14} />
      </button>)}
    </div>}

    {scopeOpen && <>
      <button type="button" className="gmc-backdrop" aria-label="사진 보기 선택 닫기" onClick={() => onScopeOpenChange(false)} />
      <section className="gmc-scope-sheet" role="dialog" aria-modal="true" aria-labelledby="gmc-scope-title">
        <div className="gmc-scope-header"><h2 id="gmc-scope-title">사진 보기</h2><button type="button" aria-label="사진 보기 선택 닫기" onClick={() => onScopeOpenChange(false)}><X size={18} /></button></div>
        <div className="gmc-scope-options" role="radiogroup" aria-label="사진 보기 범위">
          {scopeOptions.map((option) => <button key={option.value} type="button" role="radio" aria-checked={scopeValue === option.value} className={`gmc-scope-option${scopeValue === option.value ? " gmc-scope-option-active" : ""}`} onClick={() => { onScopeChange(option.value); onScopeOpenChange(false); }}><span>{option.icon}{option.label}</span><b>{option.count}장</b></button>)}
        </div>
      </section>
    </>}

    <style>{`
      .gmc-toolbar{height:48px;padding:0 20px;display:flex;align-items:center;justify-content:space-between;gap:8px;background:#fff}.gmc-toolbar-compact{height:56px}
      .gmc-leading{min-width:0;flex:1;display:flex;align-items:center;gap:4px}.gmc-actions{display:flex;align-items:center;gap:8px;flex:none}.gmc-tool-wrap{position:relative;display:inline-flex}
      .gmc-scope-trigger{min-width:0;max-width:100%;height:44px;padding:0;border:0;background:transparent;display:flex;align-items:center;gap:6px;color:#191918;font:inherit}
      .gmc-scope-trigger-active{color:#d84100}.gmc-scope-trigger strong,.gmc-scope-trigger span{line-height:20px;white-space:nowrap}.gmc-scope-trigger strong{overflow:hidden;text-overflow:ellipsis;font-size:15px}.gmc-scope-trigger span{color:#73777d;font-size:14px;font-weight:500}.gmc-scope-trigger-active span{color:#d84100}.gmc-scope-trigger[aria-expanded=true]>svg:last-child{transform:rotate(180deg)}
      .gmc-tool-btn{width:34px;height:44px;padding:0;border:0;border-radius:6px;background:transparent;color:#6f747b;display:grid;place-items:center}.gmc-tool-btn-active{background:#fff0e8;color:#ff4d00}.gmc-tool-btn:focus-visible,.gmc-scope-trigger:focus-visible{outline:2px solid #ff4d00;outline-offset:1px}
      .gmc-density-icon{width:15px;height:14px;display:grid;grid-template-rows:repeat(2,minmax(0,1fr));gap:2px}.gmc-density-icon span{min-width:0;min-height:0;border:1px solid currentColor;border-radius:1px}.gmc-filter-count{position:absolute;top:-6px;right:-6px;min-width:14px;height:14px;padding:0 3px;border-radius:999px;background:#ff4d00;color:#fff;font-size:8px;line-height:14px;font-weight:700;text-align:center;pointer-events:none}
      .gmc-search-row{height:51px;padding:7px 20px 8px;background:#fff}.gmc-active-filters{min-height:37px;padding:4px 20px;display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;background:#fff}.gmc-active-filters::-webkit-scrollbar{display:none}.gmc-filter-chip{height:29px;padding:0 8px 0 12px;border:1px solid #838b94;border-radius:999px;background:#fff;color:#191918;display:flex;align-items:center;gap:5px;flex:none;font:12px/19px Pretendard,sans-serif}.gmc-filter-chip-dot{width:9px;height:9px;border-radius:50%;flex:none}
      .gmc-backdrop{position:fixed;inset:0;z-index:80;border:0;background:#0007;padding:0}.gmc-scope-sheet{position:fixed;left:50%;bottom:0;z-index:81;width:min(100%,375px);transform:translateX(-50%);border-radius:8px 8px 0 0;background:#fff;padding-bottom:env(safe-area-inset-bottom);box-shadow:0 -8px 30px #0002;color:#191918}.gmc-scope-header{height:58px;padding:20px 20px 0;display:flex;align-items:center;justify-content:space-between}.gmc-scope-header h2{margin:0;font-size:18px;line-height:30px;letter-spacing:-.6px}.gmc-scope-header button{width:34px;height:34px;padding:0;border:0;background:transparent;color:#5f5e5b;display:grid;place-items:center}.gmc-scope-options{padding:10px 20px 20px}.gmc-scope-option{width:100%;height:52px;padding:0 12px;border:0;border-radius:8px;background:transparent;display:flex;align-items:center;justify-content:space-between;color:#26282c;font:14px/20px Pretendard,sans-serif}.gmc-scope-option>span{display:flex;align-items:center;gap:7px;font-weight:600}.gmc-scope-option b{color:#7d7a75;font-weight:400;font-variant-numeric:tabular-nums}.gmc-scope-option-active{background:#fff0e8;color:#d84100}.gmc-scope-option-active b{color:#d84100;font-weight:700}
      @media(max-width:359px){.gmc-toolbar{padding:0 10px;gap:4px}.gmc-actions{gap:4px}.gmc-scope-trigger{gap:3px}}
      @media(min-width:768px){.gmc-toolbar,.gmc-search-row,.gmc-active-filters{display:none!important}}
    `}</style>
  </>;
}
