"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Photo } from "@/types";
import ui from "../../_lib/ui.module.css";
import s from "./select.module.css";

export type MobileColumns = 2 | 3 | 4;

/** 타임라인의 한 구간. 장면이 없으면 머리글 없는 구간 하나로 전체 사진을 보여준다. */
export type TimelineSection = {
  key: string;
  header?: ReactNode;
  photos: Photo[];
  /** 다음 구간으로 넘어가기 전 쉬어 가는 경계 카드(스크롤이 근처에서 살짝 멈춘다) */
  boundary?: ReactNode;
};

type Row =
  | { kind: "header"; section: number }
  | { kind: "photos"; section: number; photos: Photo[] }
  | { kind: "empty"; section: number }
  | { kind: "boundary"; section: number };

const DESKTOP_MIN_CELL = 180;
const DESKTOP_GAP = 12;
const MOBILE_GRID: Record<MobileColumns, { gap: number; aspect: number }> = {
  2: { gap: 10, aspect: 4 / 3 },
  3: { gap: 8, aspect: 1 },
  4: { gap: 6, aspect: 1 },
};
const HEADER_HEIGHT = 56;
const EMPTY_HEIGHT = 44;
// ponytail: 경계 카드 앞뒤 여백이 "멈췄다 넘어가는" 체감을 정한다. 실기기에서 만져 보며 조정할 값.
const BOUNDARY_HEIGHT = { desktop: 260, mobile: 230 };

/**
 * 장면을 하나로 이어 붙인 가상화 타임라인. 머리글·사진 줄·경계 카드를 높이가 다른 행으로 섞어 렌더링한다.
 * 가상화된 행은 화면 밖에서 사라지므로 위에 붙는 장면 머리글은 스크롤 위치로 계산한 오버레이로 그린다.
 */
export function TimelineGrid({ sections, mobileColumns, positionKey, renderCard, empty, initialSection, jump, onSectionChange, stickyHeader }: {
  sections: TimelineSection[];
  mobileColumns: MobileColumns;
  positionKey: string;
  renderCard: (photo: Photo, columns: number) => ReactNode;
  empty: ReactNode;
  /** 처음 열 때 이 구간에서 시작한다(없으면 마지막으로 보던 위치). */
  initialSection?: number | null;
  /** 장면 목록에서 고른 구간으로 이동(nonce가 바뀔 때마다). */
  jump?: { section: number; nonce: number } | null;
  onSectionChange?: (section: number) => void;
  stickyHeader?: (section: number) => ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const restoredKeyRef = useRef("");
  const currentSectionRef = useRef(-1);
  const [layout, setLayout] = useState({ cols: 4, gap: DESKTOP_GAP, rowHeight: DESKTOP_MIN_CELL + DESKTOP_GAP, mobile: false });
  // 실제 격자 폭으로 열 수를 계산하기 전에는 위치를 복원하지 않는다(기본 4열 기준 행으로 잘못 이동함).
  const [measured, setMeasured] = useState(false);
  const [sticky, setSticky] = useState<number | null>(null);

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
      setLayout((current) => current.cols === cols && current.gap === gap && current.rowHeight === rowHeight && current.mobile === mobile ? current : { cols, gap, rowHeight, mobile });
      setMeasured(true);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [mobileColumns]);

  const rows = useMemo<Row[]>(() => sections.flatMap((section, index) => {
    const photoRows: Row[] = [];
    for (let start = 0; start < section.photos.length; start += layout.cols) {
      photoRows.push({ kind: "photos", section: index, photos: section.photos.slice(start, start + layout.cols) });
    }
    return [
      ...(section.header ? [{ kind: "header", section: index } as Row] : []),
      ...(photoRows.length ? photoRows : section.header ? [{ kind: "empty", section: index } as Row] : []),
      ...(section.boundary ? [{ kind: "boundary", section: index } as Row] : []),
    ];
  }), [layout.cols, sections]);
  const headerRowOf = useMemo(() => {
    const map = new Map<number, number>();
    rows.forEach((row, index) => { if (!map.has(row.section)) map.set(row.section, index); });
    return map;
  }, [rows]);
  const totalPhotos = sections.reduce((sum, section) => sum + section.photos.length, 0);
  const hasSections = sections.length > 1;

  const sizeOf = (row: Row) => row.kind === "header" ? HEADER_HEIGHT
    : row.kind === "empty" ? EMPTY_HEIGHT
    : row.kind === "boundary" ? BOUNDARY_HEIGHT[layout.mobile ? "mobile" : "desktop"]
    : layout.rowHeight;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => sizeOf(rows[index]),
    overscan: 6,
  });

  useEffect(() => {
    virtualizer.measure();
    // 행 구성이나 높이가 바뀌면 다시 계산한다(virtualizer 참조는 렌더마다 바뀜).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, layout.rowHeight, layout.mobile]);

  const scrollToSection = (section: number) => {
    const index = headerRowOf.get(section);
    if (index !== undefined) virtualizer.scrollToIndex(index, { align: "start" });
  };

  // 처음 열 때: 지정한 장면 → 마지막으로 보던 사진 → 맨 위 순서로 위치를 정한다.
  useEffect(() => {
    if (!measured || !rows.length || restoredKeyRef.current === positionKey) return;
    restoredKeyRef.current = positionKey;
    let anchorId: string | null = null;
    try { anchorId = sessionStorage.getItem(positionKey); } catch {}
    const anchorRow = initialSection == null && anchorId ? rows.findIndex((row) => row.kind === "photos" && row.photos.some((photo) => photo.id === anchorId)) : -1;
    let second = 0;
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => {
        if (initialSection != null) scrollToSection(initialSection);
        else if (anchorRow >= 0) virtualizer.scrollToIndex(anchorRow, { align: "start" });
        else scrollRef.current?.scrollTo({ top: 0 });
      });
    });
    return () => { window.cancelAnimationFrame(first); window.cancelAnimationFrame(second); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measured, positionKey, rows]);

  useEffect(() => {
    if (jump) scrollToSection(jump.section);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump?.nonce]);

  function handleScroll(top: number) {
    // 화면에 그려진 행 목록은 스크롤 이벤트 시점에 아직 이전 범위일 수 있어(멀리 이동할 때) 전체 행 위치에서 찾는다.
    const current = virtualizer.getVirtualItemForOffset(top + 1);
    if (!current) return;
    const row = rows[current.index];
    if (row.section !== currentSectionRef.current) {
      currentSectionRef.current = row.section;
      onSectionChange?.(row.section);
    }
    // 구간 머리글이 화면 위로 지나간 뒤에만 위에 붙는 머리글을 보여준다.
    const headerIndex = headerRowOf.get(row.section) ?? 0;
    const headerStart = virtualizer.measurementsCache[headerIndex]?.start ?? -Infinity;
    setSticky(hasSections && sections[row.section]?.header && (current.index !== headerIndex || top > headerStart + 4) ? row.section : null);
    const anchor = rows.slice(current.index).find((item) => item.kind === "photos");
    if (anchor?.kind === "photos") {
      try { sessionStorage.setItem(positionKey, anchor.photos[0].id); } catch {}
    }
  }

  return (
    <div className={s.timeline}>
      {sticky !== null && stickyHeader ? <div className={s.stickyHeader}>{stickyHeader(sticky)}</div> : null}
      <div
        ref={scrollRef}
        className={`${ui.selectGallery} ${s.timelineScroll} gl-density-${mobileColumns} ${hasSections ? s.snapScroll : ""}`}
        onScroll={(event) => handleScroll(event.currentTarget.scrollTop)}
      >
        <div ref={gridRef} className={`${ui.selectGrid} ${ui[`selectDensity${mobileColumns}`]}`} style={{ height: totalPhotos || hasSections ? virtualizer.getTotalSize() : "100%" }}>
          {!totalPhotos && !hasSections ? <div className={ui.selectEmpty}>{empty}</div> : virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            const position = { top: item.start, height: item.size };
            if (row.kind === "header") return <div key={item.key} className={s.timelineHeader} style={position}>{sections[row.section].header}</div>;
            if (row.kind === "empty") return <div key={item.key} className={s.timelineEmpty} style={position}>조건에 맞는 사진이 없어요</div>;
            if (row.kind === "boundary") return <div key={item.key} className={s.timelineBoundary} style={position}><div className={s.snapTarget}>{sections[row.section].boundary}</div></div>;
            return (
              <div
                key={item.key}
                className={ui.selectGridRow}
                // 스크롤 스냅이 실제 위치를 읽도록 transform 대신 top으로 배치한다.
                style={{ top: item.start, height: Math.max(0, item.size - layout.gap), gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`, gap: layout.gap }}
              >
                {row.photos.map((photo) => renderCard(photo, layout.cols))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
