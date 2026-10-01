"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Photo } from "@/types";
import { galleryAnchorPhotoId } from "../../_lib/gallery-view";
import ui from "../../_lib/ui.module.css";

export type MobileColumns = 2 | 3 | 4;

const DESKTOP_MIN_CELL = 180;
const DESKTOP_GAP = 12;
const MOBILE_GRID: Record<MobileColumns, { gap: number; aspect: number }> = {
  2: { gap: 10, aspect: 4 / 3 },
  3: { gap: 8, aspect: 1 },
  4: { gap: 6, aspect: 1 },
};

/** 가상화 사진 격자. 장면마다 positionKey가 달라 장면을 오가도 각자의 위치로 돌아온다. */
export function PhotoGrid({ photos, mobileColumns, positionKey, renderCard, empty, onScrolled }: {
  photos: Photo[];
  mobileColumns: MobileColumns;
  positionKey: string;
  renderCard: (photo: Photo, columns: number) => ReactNode;
  empty: ReactNode;
  onScrolled?: (scrollTop: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const restoredKeyRef = useRef("");
  const [layout, setLayout] = useState({ cols: 4, gap: DESKTOP_GAP, rowHeight: DESKTOP_MIN_CELL + DESKTOP_GAP });
  // 실제 격자 폭으로 열 수를 계산하기 전에는 위치를 복원하지 않는다(기본 4열 기준 행으로 잘못 이동함).
  const [measured, setMeasured] = useState(false);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const update = () => {
      const width = grid.clientWidth;
      if (!width) return;
      const mobile = window.innerWidth <= 767;
      const gap = mobile ? MOBILE_GRID[mobileColumns].gap : DESKTOP_GAP;
      const cols = mobile ? mobileColumns : Math.max(1, Math.floor((width + gap) / (DESKTOP_MIN_CELL + gap)));
      const cell = (width - gap * (cols - 1)) / cols;
      const rowHeight = Math.ceil(cell / (mobile ? MOBILE_GRID[mobileColumns].aspect : 1)) + gap;
      setLayout((current) => current.cols === cols && current.gap === gap && current.rowHeight === rowHeight ? current : { cols, gap, rowHeight });
      setMeasured(true);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [mobileColumns]);

  const rowCount = Math.ceil(photos.length / layout.cols);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => layout.rowHeight,
    overscan: 6,
  });

  useEffect(() => {
    virtualizer.measure();
    // virtualizer 참조는 렌더마다 바뀌므로 실제 행 높이만 추적한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.rowHeight]);

  // 장면(positionKey)이 바뀌면 그 장면에서 마지막으로 보던 행으로 한 번 복원한다.
  useEffect(() => {
    if (!measured || restoredKeyRef.current === positionKey) return;
    restoredKeyRef.current = positionKey;
    let anchorId: string | null = null;
    try { anchorId = sessionStorage.getItem(positionKey); } catch {}
    const index = anchorId ? photos.findIndex((photo) => photo.id === anchorId) : -1;
    // 측정된 행 높이가 반영된 다음 프레임에 이동한다.
    let second = 0;
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => {
        if (index >= 0) virtualizer.scrollToIndex(Math.floor(index / layout.cols), { align: "start" });
        else scrollRef.current?.scrollTo({ top: 0 });
      });
    });
    return () => { window.cancelAnimationFrame(first); window.cancelAnimationFrame(second); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measured, positionKey, photos, layout.cols]);

  return (
    <div
      ref={scrollRef}
      className={`${ui.selectGallery} gl-density-${mobileColumns}`}
      onScroll={(event) => {
        const top = event.currentTarget.scrollTop;
        onScrolled?.(top);
        const anchorId = galleryAnchorPhotoId(photos, top, layout.cols, layout.rowHeight);
        if (anchorId) {
          try { sessionStorage.setItem(positionKey, anchorId); } catch {}
        }
      }}
    >
      <div ref={gridRef} className={`${ui.selectGrid} ${ui[`selectDensity${mobileColumns}`]}`} style={{ height: photos.length ? virtualizer.getTotalSize() : "100%" }}>
        {photos.length === 0 ? <div className={ui.selectEmpty}>{empty}</div> : virtualizer.getVirtualItems().map((row) => (
          <div
            key={row.key}
            className={ui.selectGridRow}
            style={{ height: Math.max(0, row.size - layout.gap), gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`, gap: layout.gap, transform: `translateY(${row.start}px)` }}
          >
            {photos.slice(row.index * layout.cols, row.index * layout.cols + layout.cols).map((photo) => renderCard(photo, layout.cols))}
          </div>
        ))}
      </div>
    </div>
  );
}
