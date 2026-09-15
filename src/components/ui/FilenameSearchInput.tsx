"use client";

import type { CSSProperties } from "react";
import { Search, X } from "lucide-react";

export type FilenameSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  className?: string;
  /** 호출부마다 다른 크기·테두리색만 CSS 변수로 넘긴다(--fsi-*) — 값·placeholder 색 자체는
   * 이 컴포넌트가 고정한다. 일반 style 속성(예: flex)도 그대로 통과시킨다. */
  style?: CSSProperties;
};

/**
 * "파일명 검색" 입력창.
 *
 * 예전엔 화면마다(작가 업로드/자산 PC·모바일, 고객 갤러리 PC·모바일) 따로 구현돼 있어
 * 색이 제각각이었다 — 고객 갤러리 PC만 placeholder에 아이콘·테두리용 "보조 텍스트" 색을
 * 그대로 써서 유독 짙었고, 빈 칸인데도 이미 값이 채워진 비활성 필드처럼 보였다(실측:
 * 다른 화면 대비 밝기 167 vs 213~230). 그 문제를 고친 고객 갤러리 버전(연한 아이콘·
 * 옅은 placeholder·지우기 버튼)을 기준으로 다섯 곳을 전부 통일한다.
 *
 * 색을 페이지별 스코프 CSS 변수(--customer-*, --foreground 등)에 기대지 않고 값을 직접
 * 적었다 — 이 컴포넌트는 고객·작가 양쪽, 스코프가 다른 화면에 두루 놓이는데, 스코프
 * 변수를 쓰면 그 화면의 토큰 정의에 따라 조용히 또 달라진다. `--accent`만은 예외로
 * 재사용한다 — 그 값은 앱 전체에서 이미 #ff4d00으로 동일하다.
 *
 * 크기·테두리색은 호출부마다 다르다(예: 고객 모바일은 검색이 열려 있는 동안 항상
 * 주황 테두리). className 기반 CSS로 덮어쓰려 하면 두 컴포넌트의 <style> 태그 중
 * 어느 쪽이 DOM에 먼저 삽입되는지에 따라 결과가 갈려 불안정하다 — 대신 `--fsi-*`
 * CSS 변수 몇 개만 열어 호출부가 style prop으로 명시적으로 지정하게 한다.
 */
export function FilenameSearchInput({
  value,
  onChange,
  placeholder = "파일명 검색 (쉼표로 여러 개)",
  ariaLabel = "파일명으로 필터링",
  autoFocus = false,
  className = "",
  style,
}: FilenameSearchInputProps) {
  return (
    <label className={`fsi-root ${className}`} style={style}>
      <Search size={14} strokeWidth={1.8} className="fsi-icon" aria-hidden />
      <input
        type="text"
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
      {value ? (
        <button type="button" className="fsi-clear" onClick={() => onChange("")} aria-label="검색어 지우기">
          <X size={14} aria-hidden />
        </button>
      ) : null}

      <style>{`
        .fsi-root {
          box-sizing: border-box;
          display: flex;
          align-items: center;
          gap: var(--fsi-gap, 8px);
          height: var(--fsi-height, 36px);
          width: var(--fsi-width, 100%);
          padding: 0 10px;
          border: 1px solid var(--fsi-border-color, #dde1e4);
          border-radius: var(--fsi-radius, 6px);
          background: #fff;
          cursor: text;
        }
        .fsi-root:focus-within {
          border-color: var(--fsi-border-color-focus, var(--accent));
        }
        .fsi-icon {
          flex-shrink: 0;
          color: #9aa0a6;
        }
        .fsi-root input {
          min-width: 0;
          flex: 1;
          width: var(--fsi-input-width, auto);
          border: none;
          outline: none;
          background: transparent;
          font-family: inherit;
          font-size: var(--fsi-font-size, 13px);
          color: #191918;
        }
        .fsi-root input::placeholder {
          /* 아이콘·테두리보다 한 단 더 옅게 — 빈 상태와 입력된 상태가 한눈에 구분되게 한다. */
          color: color-mix(in srgb, #5f5e5b 55%, transparent);
        }
        .fsi-clear {
          flex-shrink: 0;
          display: grid;
          place-items: center;
          padding: 4px;
          border: 0;
          background: transparent;
          color: #9aa0a6;
          cursor: pointer;
        }
        .fsi-clear:hover {
          color: #5f5e5b;
        }
      `}</style>
    </label>
  );
}
