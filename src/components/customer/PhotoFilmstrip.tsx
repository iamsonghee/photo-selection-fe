"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

export type FilmstripItem = {
  id: string;
  url: string;
  /** 스크린리더용 이름(파일명 등) */
  label: string;
};

/**
 * 사진 목록을 가로로 훑고 곧장 이동하는 썸네일 행.
 *
 * 셀렉 뷰어와 보정본 검토가 같은 모양을 쓰도록 공통화했다. 두 화면의 차이는
 * "썸네일 위에 어떤 배지를 얹는가"뿐이라 그 부분만 render prop(`badge`)으로 연다
 * (뷰어=선택 체크, 검토=확정/재보정/미검토 상태).
 *
 * 색 규칙(docs/customer-design.md §11): 현재 위치는 **흰 테두리**, 주황은 "선택됨" 배지 전용이다.
 * 둘 다 주황을 쓰면 "여기 있음"과 "골랐음"이 구분되지 않는다.
 */
export function PhotoFilmstrip({
  items,
  activeId,
  onSelect,
  badge,
  colorize = false,
  className = "",
}: {
  items: FilmstripItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  badge?: (item: FilmstripItem) => ReactNode;
  /** 비활성 썸네일도 컬러로 — 색 보정 결과 자체가 판단 대상인 화면(보정본 검토)에서 쓴다.
   * 기본(false)은 셀렉 뷰어처럼 흑백으로 눌러 현재 사진에 집중시킨다. */
  colorize?: boolean;
  className?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  /* 첫 진입은 즉시, 이후 사진 전환은 부드럽게 — 진입할 때부터 스르륵 움직이면 산만하다. */
  const seenRef = useRef(false);

  useEffect(() => {
    const container = scrollerRef.current;
    if (!container || !activeId) return;
    const active = container.querySelector<HTMLElement>(`[data-photo-id="${CSS.escape(activeId)}"]`);
    if (!active) return;
    active.scrollIntoView({
      behavior: seenRef.current ? "smooth" : "instant",
      block: "nearest",
      inline: "center",
    });
    seenRef.current = true;
  }, [activeId, items.length]);

  return (
    <div
      ref={scrollerRef}
      className={`cfs-root${colorize ? " cfs-color" : ""} ${className}`}
      aria-label="사진 목록"
      onTouchStart={(event) => event.stopPropagation()}
      onTouchEnd={(event) => event.stopPropagation()}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            data-photo-id={item.id}
            className={`cfs-thumb${active ? " cfs-thumb-active" : ""}`}
            onClick={() => onSelect(item.id)}
            aria-label={`${item.label}${active ? ", 현재 사진" : ""}`}
            aria-current={active ? "true" : undefined}
          >
            <img src={item.url} alt="" loading="lazy" decoding="async" />
            {badge?.(item)}
          </button>
        );
      })}

      <style>{`
        .cfs-root {
          display: flex; align-items: center; gap: 12px;
          overflow-x: auto; width: 100%;
          scrollbar-width: none; -ms-overflow-style: none;
        }
        .cfs-root::-webkit-scrollbar { display: none; }
        .cfs-thumb {
          position: relative; flex: 0 0 auto;
          width: 132px; height: 88px; padding: 0;
          /* 아래 미디어쿼리에서 모바일 크기로 줄인다 */
          border: 2px solid transparent; border-radius: 4px;
          background: transparent; cursor: pointer; overflow: hidden;
          filter: grayscale(1); opacity: .45;
          transition: filter .25s ease, opacity .25s ease, border-color .25s ease, transform .25s ease;
        }
        .cfs-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .cfs-thumb:not(.cfs-thumb-active):hover { opacity: .8; filter: grayscale(.3); }
        .cfs-color .cfs-thumb { filter: none; opacity: .62; }
        .cfs-color .cfs-thumb:not(.cfs-thumb-active):hover { filter: none; opacity: .85; }
        .cfs-color .cfs-thumb-active { filter: none; opacity: 1; }
        .cfs-thumb-active {
          filter: grayscale(0); opacity: 1;
          border-color: #fff; transform: scale(1.04); z-index: 2;
        }
        .cfs-thumb:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
        /* 좁은 화면에서 132px은 두 장밖에 안 보인다 — 훑어보려면 한 화면에 여러 장이 들어와야 한다 */
        @media (max-width: 767px) {
          .cfs-root { gap: 8px; }
          .cfs-thumb { width: 84px; height: 58px; border-width: 2px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .cfs-thumb { transition: none; }
          .cfs-thumb-active { transform: none; }
        }
      `}</style>
    </div>
  );
}
