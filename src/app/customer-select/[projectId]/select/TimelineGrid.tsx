"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
// ponytail: 경계 카드 앞뒤 여백과 넘어가는 데 필요한 "더 내리기" 양이 멈춤 체감을 정한다. 실기기에서 만져 보며 조정할 값.
const BOUNDARY_HEIGHT = { desktop: 260, mobile: 230 };
const PULL_TO_PASS = 160;
const STOP_MARGIN = 16;
const PULL_DECAY_MS = 900;

/**
 * 장면을 하나로 이어 붙인 가상화 타임라인. 머리글·사진 줄·경계 카드를 높이가 다른 행으로 섞어 렌더링한다.
 * 가상화된 행은 화면 밖에서 사라지므로 위에 붙는 장면 머리글은 스크롤 위치로 계산한 오버레이로 그린다.
 */
export function TimelineGrid({ sections, mobileColumns, positionKey, renderCard, empty, initialSection, jump, focus, onSectionChange, stickyHeader }: {
  sections: TimelineSection[];
  mobileColumns: MobileColumns;
  positionKey: string;
  renderCard: (photo: Photo, columns: number) => ReactNode;
  empty: ReactNode;
  /** 처음 열 때 이 구간에서 시작한다(없으면 마지막으로 보던 위치). */
  initialSection?: number | null;
  /** 장면 목록에서 고른 구간으로 이동(nonce가 바뀔 때마다). */
  jump?: { section: number; nonce: number } | null;
  /** 상세 보기를 닫은 뒤 마지막으로 본 사진이 화면 밖이면 그 사진 줄을 가운데로 가져온다(작가 고객 갤러리와 같은 규칙). */
  focus?: { photoId: string; nonce: number } | null;
  onSectionChange?: (section: number) => void;
  stickyHeader?: (section: number) => ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const restoredKeyRef = useRef("");
  const currentSectionRef = useRef(-1);
  const [layout, setLayout] = useState({ cols: 4, gap: DESKTOP_GAP, rowHeight: DESKTOP_MIN_CELL + DESKTOP_GAP, mobile: false, overscan: 6 });
  // 실제 격자 폭으로 열 수를 계산하기 전에는 위치를 복원하지 않는다(기본 4열 기준 행으로 잘못 이동함).
  const [measured, setMeasured] = useState(false);
  const [sticky, setSticky] = useState<number | null>(null);
  // 경계 멈춤: 카드가 화면에 다 보이는 순간 멈추고, 더 내리려는 만큼 진행선을 채운 뒤 다음 장면으로 넘긴다.
  const [hold, setHold] = useState<{ boundary: number; progress: number } | null>(null);
  const holdRef = useRef<{ boundary: number; stop: number; pulled: number } | null>(null);
  const passedRef = useRef(new Map<number, number>());
  const decayRef = useRef(0);
  const lastPullInputRef = useRef(0);
  const previousTopRef = useRef(0);

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
      // 작가 고객 갤러리와 같이 화면 2.5개 분량을 미리 그려 빠르게 내릴 때 빈 칸이 덜 보이게 한다.
      const overscan = Math.ceil(Math.ceil((scrollRef.current?.clientHeight || window.innerHeight) / rowHeight) * 2.5);
      setLayout((current) => current.cols === cols && current.gap === gap && current.rowHeight === rowHeight && current.mobile === mobile && current.overscan === overscan ? current : { cols, gap, rowHeight, mobile, overscan });
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
    overscan: layout.overscan,
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

  useEffect(() => {
    const el = scrollRef.current;
    if (!focus || !el) return;
    const index = rows.findIndex((row) => row.kind === "photos" && row.photos.some((photo) => photo.id === focus.photoId));
    const item = virtualizer.measurementsCache[index];
    if (!item) return;
    const visible = item.start >= el.scrollTop && item.end <= el.scrollTop + el.clientHeight;
    if (!visible) virtualizer.scrollToIndex(index, { align: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);

  /** 아래로 내리려는 입력(dy>0). 경계 카드에서 멈춰야 하면 기본 스크롤을 막고 true를 돌려준다. */
  const pullRef = useRef<(dy: number) => boolean>(() => false);
  pullRef.current = (dy) => {
    const el = scrollRef.current;
    if (!el || !hasSections) return false;
    const current = holdRef.current;
    if (dy < 0) {
      if (current) { holdRef.current = null; setHold(null); }
      return false;
    }
    if (current) {
      current.pulled += dy;
      window.clearTimeout(decayRef.current);
      decayRef.current = window.setTimeout(() => {
        if (holdRef.current) { holdRef.current.pulled = 0; setHold({ boundary: holdRef.current.boundary, progress: 0 }); }
      }, PULL_DECAY_MS);
      if (current.pulled < PULL_TO_PASS) {
        setHold({ boundary: current.boundary, progress: current.pulled / PULL_TO_PASS });
        return true;
      }
      passedRef.current.set(current.boundary, current.stop);
      holdRef.current = null;
      setHold(null);
      const next = headerRowOf.get(current.boundary + 1);
      if (next !== undefined) virtualizer.scrollToIndex(next, { align: "start", behavior: "smooth" });
      return true;
    }
    lastPullInputRef.current = performance.now();
    return false;
  };

  /**
   * 실제로 스크롤된 뒤 경계 카드의 멈춤 위치(카드 하단 = 화면 하단선)를 지났는지 본다. 입력 이동량(deltaY)은
   * 기기·배율마다 실제 스크롤량과 달라 미리 예측하면 놓치므로, 지난 뒤 멈춤 위치로 되돌린다.
   * 휠·터치 입력 직후만 멈추고, 손을 뗀 뒤의 빠른 관성 스크롤은 그대로 지나간다.
   */
  function stopAtBoundary(previousTop: number, top: number) {
    const el = scrollRef.current;
    if (!el || !hasSections || holdRef.current || top <= previousTop || performance.now() - lastPullInputRef.current > 200) return;
    const box = el.getBoundingClientRect();
    for (const node of el.querySelectorAll<HTMLElement>("[data-boundary-card]")) {
      const boundary = Number(node.dataset.boundaryCard);
      if (boundary >= sections.length - 1 || passedRef.current.has(boundary)) continue;
      // 측정한 카드 위치는 지금의 scrollTop 기준이다(이벤트 이후 부드러운 스크롤이 더 진행됐을 수 있음).
      const stop = el.scrollTop + (node.getBoundingClientRect().bottom - box.bottom) + STOP_MARGIN;
      if (previousTop < stop && el.scrollTop >= stop - 0.5) {
        el.scrollTop = stop;
        holdRef.current = { boundary, stop, pulled: 0 };
        setHold({ boundary, progress: 0 });
        return;
      }
    }
  }

  // 휠·터치만 가로챈다(키보드·스크롤바는 그대로). 빠르게 넘기는 관성 스크롤은 입력 이벤트가 없어 그대로 지나간다.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let lastY: number | null = null;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      // 줄·페이지 단위 휠(일부 브라우저·마우스)도 픽셀로 맞춰 더 내리기 양을 센다.
      const dy = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * el.clientHeight : event.deltaY;
      if (pullRef.current(dy)) event.preventDefault();
    };
    const onTouchStart = (event: TouchEvent) => { lastY = event.touches.length === 1 ? event.touches[0].clientY : null; };
    const onTouchMove = (event: TouchEvent) => {
      if (lastY === null || event.touches.length !== 1) return;
      const y = event.touches[0].clientY;
      const dy = lastY - y;
      lastY = y;
      if (pullRef.current(dy) && event.cancelable) event.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      window.clearTimeout(decayRef.current);
    };
  }, []);

  function handleScroll(top: number) {
    // 멈춘 동안에는 남은 부드러운 휠 스크롤이 밀어내지 못하게 위치를 고정하고, 위로 올리면 풀어 준다.
    const held = holdRef.current;
    if (held && scrollRef.current) {
      if (top < held.stop - 4) { holdRef.current = null; setHold(null); }
      else if (Math.abs(top - held.stop) > 0.5) { scrollRef.current.scrollTop = held.stop; return; }
    }
    stopAtBoundary(previousTopRef.current, top);
    previousTopRef.current = scrollRef.current?.scrollTop ?? top;
    // 지나간 경계보다 한참 위로 돌아가면 다시 그 경계에서 멈추게 한다.
    passedRef.current.forEach((stop, boundary) => { if (top < stop - (scrollRef.current?.clientHeight ?? 0)) passedRef.current.delete(boundary); });
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
        className={`${ui.selectGallery} ${s.timelineScroll} gl-density-${mobileColumns}`}
        onScroll={(event) => handleScroll(event.currentTarget.scrollTop)}
      >
        <div ref={gridRef} className={`${ui.selectGrid} ${ui[`selectDensity${mobileColumns}`]}`} style={{ height: totalPhotos || hasSections ? virtualizer.getTotalSize() : "100%" }}>
          {!totalPhotos && !hasSections ? <div className={ui.selectEmpty}>{empty}</div> : virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            const position = { top: item.start, height: item.size };
            if (row.kind === "header") return <div key={item.key} className={s.timelineHeader} style={position}>{sections[row.section].header}</div>;
            if (row.kind === "empty") return <div key={item.key} className={s.timelineEmpty} style={position}>조건에 맞는 사진이 없어요</div>;
            if (row.kind === "boundary") {
              const holding = hold?.boundary === row.section;
              return (
                <div key={item.key} className={s.timelineBoundary} data-holding={holding ? "" : undefined} style={{ ...position, "--pull": holding ? hold.progress : 0 } as CSSProperties}>
                  <div className={s.snapTarget} data-boundary-card={row.section}>{sections[row.section].boundary}</div>
                </div>
              );
            }
            return (
              <div
                key={item.key}
                className={ui.selectGridRow}
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
