"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { Photo } from "@/types";
import ui from "../../_lib/ui.module.css";
import s from "./select.module.css";

export type MobileColumns = 2 | 3 | 4;

const DESKTOP_MIN_CELL = 180;
const DESKTOP_GAP = 12;
const MOBILE_GRID: Record<MobileColumns, { gap: number; aspect: number }> = {
  2: { gap: 10, aspect: 4 / 3 },
  3: { gap: 8, aspect: 1 },
  4: { gap: 6, aspect: 1 },
};
const FOOTER_HEIGHT = { desktop: 120, mobile: 104 };
// ponytail: 바닥에서 더 당기는 고무줄의 최대 길이·저항·넘어가는 지점. 실기기에서 만져 보며 조정할 값.
const PULL_MAX = 170;
const PULL_RESISTANCE = 220;
const PULL_TO_PASS = 0.68;
const WHEEL_RELEASE_MS = 180;
// 바닥에 닿은 뒤 이만큼 쉬었다가 새로 시작한 휠만 당기기로 본다(빠르게 내린 관성 스크롤로 넘어가지 않게).
const WHEEL_NEW_GESTURE_MS = 140;

type Row = { kind: "photos"; photos: Photo[] } | { kind: "footer" };

/**
 * 장면 하나의 가상화 사진 격자. 장면 끝(또는 처음)에서는 브라우저 스크롤이 스스로 멈추고, 거기서 더 당기면
 * 고무줄처럼 늘어나며 다음(이전) 장면이 드러난다. 충분히 당긴 채 놓으면 넘어간다(덜 당기면 원래대로).
 */
export function SceneGrid({ photos, mobileColumns, positionKey, startAt, enterFrom, renderCard, empty, footer, next, prev, focus }: {
  photos: Photo[];
  mobileColumns: MobileColumns;
  positionKey: string;
  /** 당겨서 넘어온 장면은 다음이면 처음부터, 이전이면 끝부터 본다. 없으면 마지막으로 보던 곳. */
  startAt?: "top" | "bottom" | null;
  /** 넘어올 때 화면이 들어오는 방향 */
  enterFrom?: "below" | "above" | null;
  renderCard: (photo: Photo, columns: number) => ReactNode;
  empty: ReactNode;
  /** 사진 목록 끝의 얇은 안내(다음 장면 이름, 마지막 장면의 보내기 등) */
  footer?: ReactNode;
  /** 바닥에서 당겨 넘어갈 다음 장면. 없으면 당기기를 쓰지 않는다. */
  next?: { label: string; onPass: () => void } | null;
  /** 맨 위에서 위로 당겨 돌아갈 이전 장면. */
  prev?: { label: string; onPass: () => void } | null;
  /** 상세 보기를 닫은 뒤 마지막으로 본 사진이 화면 밖이면 가운데로 가져온다(작가 고객 갤러리와 같은 규칙). */
  focus?: { photoId: string; nonce: number } | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  const [layout, setLayout] = useState({ cols: 4, gap: DESKTOP_GAP, rowHeight: DESKTOP_MIN_CELL + DESKTOP_GAP, mobile: false, overscan: 6 });
  // 실제 격자 폭으로 열 수를 계산하기 전에는 위치를 복원하지 않는다(기본 4열 기준 행으로 잘못 이동함).
  const [measured, setMeasured] = useState(false);
  // dir 1: 끝에서 아래로 더 당김(다음 장면), -1: 처음에서 위로 더 당김(이전 장면)
  const [pull, setPull] = useState({ distance: 0, active: false, dir: 1 as 1 | -1 });

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

  const rows = useMemo<Row[]>(() => {
    const list: Row[] = [];
    for (let start = 0; start < photos.length; start += layout.cols) list.push({ kind: "photos", photos: photos.slice(start, start + layout.cols) });
    if (footer && photos.length) list.push({ kind: "footer" });
    return list;
  }, [footer, layout.cols, photos]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => rows[index].kind === "footer" ? FOOTER_HEIGHT[layout.mobile ? "mobile" : "desktop"] : layout.rowHeight,
    overscan: layout.overscan,
  });

  useEffect(() => {
    virtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, layout.rowHeight, layout.mobile]);

  // 처음 열 때: 처음부터 보기 → 마지막으로 보던 사진 → 맨 위 순서.
  useEffect(() => {
    if (!measured || !rows.length || restoredRef.current) return;
    restoredRef.current = true;
    let anchorId: string | null = null;
    try { anchorId = startAt ? null : sessionStorage.getItem(positionKey); } catch {}
    const anchorRow = anchorId ? rows.findIndex((row) => row.kind === "photos" && row.photos.some((photo) => photo.id === anchorId)) : -1;
    let second = 0;
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => {
        if (startAt === "bottom") scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
        else if (anchorRow >= 0) virtualizer.scrollToIndex(anchorRow, { align: "start" });
        else scrollRef.current?.scrollTo({ top: 0 });
      });
    });
    return () => { window.cancelAnimationFrame(first); window.cancelAnimationFrame(second); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measured, rows]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!focus || !el) return;
    const index = rows.findIndex((row) => row.kind === "photos" && row.photos.some((photo) => photo.id === focus.photoId));
    const item = virtualizer.measurementsCache[index];
    if (!item) return;
    if (item.start < el.scrollTop || item.end > el.scrollTop + el.clientHeight) virtualizer.scrollToIndex(index, { align: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);

  // 끝(처음)에서 더 당기기. 화면이 손을 따라 늘어나되 점점 덜 늘어나고(저항), 놓을 때 충분히 당겼으면 넘어간다.
  const targetsRef = useRef({ next, prev });
  targetsRef.current = { next, prev };
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raw = 0;
    let dir: 1 | -1 = 1;
    let armed = false;
    let lastWheel = 0;
    let releaseTimer = 0;
    let touchY: number | null = null;
    const atBottom = () => el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    const atTop = () => el.scrollTop <= 0;
    const targetOf = (direction: 1 | -1) => (direction === 1 ? targetsRef.current.next : targetsRef.current.prev);
    // 이 방향으로 더 갈 곳이 없는 가장자리에서만 당기기를 시작한다.
    const canArm = (dy: number) => (dy > 0 ? atBottom() && targetOf(1) : dy < 0 ? atTop() && targetOf(-1) : null);
    const distanceOf = (value: number) => PULL_MAX * (1 - Math.exp(-Math.max(0, value) / PULL_RESISTANCE));
    const release = () => {
      window.clearTimeout(releaseTimer);
      const passed = armed && distanceOf(raw) / PULL_MAX >= PULL_TO_PASS;
      const direction = dir;
      armed = false;
      raw = 0;
      setPull({ distance: 0, active: false, dir: direction });
      if (passed) targetOf(direction)?.onPass();
    };
    const move = (dy: number) => {
      raw += dy * dir;
      if (raw <= 0) { raw = 0; armed = false; setPull({ distance: 0, active: false, dir }); return; }
      setPull({ distance: distanceOf(raw), active: true, dir });
    };
    const arm = (dy: number) => {
      if (!canArm(dy)) return false;
      dir = dy > 0 ? 1 : -1;
      armed = true;
      return true;
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const now = performance.now();
      const gap = now - lastWheel;
      lastWheel = now;
      const dy = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * el.clientHeight : event.deltaY;
      // 가장자리에 닿은 뒤 잠깐 쉬었다 새로 시작한 휠만 당기기로 본다(빠르게 스크롤한 관성으로 넘어가지 않게).
      if (!armed && (gap < WHEEL_NEW_GESTURE_MS || !arm(dy))) return;
      event.preventDefault();
      move(dy);
      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(release, WHEEL_RELEASE_MS);
    };
    const onTouchStart = (event: TouchEvent) => { touchY = event.touches.length === 1 ? event.touches[0].clientY : null; };
    const onTouchMove = (event: TouchEvent) => {
      if (touchY === null || event.touches.length !== 1) return;
      const y = event.touches[0].clientY;
      const dy = touchY - y;
      touchY = y;
      if (!armed && !arm(dy)) return;
      if (event.cancelable) event.preventDefault();
      move(dy);
    };
    const onTouchEnd = () => { touchY = null; if (armed) release(); };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      window.clearTimeout(releaseTimer);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  const progress = pull.distance / PULL_MAX;
  const ready = progress >= PULL_TO_PASS;

  return (
    <div className={`${s.timeline} ${enterFrom === "above" ? s.sceneEnterDown : enterFrom === "below" ? s.sceneEnter : ""}`}>
      <div
        ref={scrollRef}
        className={`${ui.selectGallery} ${s.timelineScroll} gl-density-${mobileColumns}`}
        onScroll={(event) => {
          const item = virtualizer.getVirtualItemForOffset(event.currentTarget.scrollTop + 1);
          const row = item ? rows[item.index] : null;
          if (row?.kind === "photos") {
            try { sessionStorage.setItem(positionKey, row.photos[0].id); } catch {}
          }
        }}
      >
        <div
          ref={gridRef}
          className={`${ui.selectGrid} ${ui[`selectDensity${mobileColumns}`]} ${pull.active ? "" : s.pullSettle}`}
          style={{ height: photos.length ? virtualizer.getTotalSize() : "100%", transform: pull.distance ? `translateY(${-pull.distance * pull.dir}px)` : undefined }}
        >
          {!photos.length ? <div className={ui.selectEmpty}>{empty}</div> : virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            if (row.kind === "footer") return <div key={item.key} className={s.sceneFooter} style={{ top: item.start, height: item.size }}>{footer}</div>;
            return (
              <div key={item.key} className={ui.selectGridRow} style={{ top: item.start, height: Math.max(0, item.size - layout.gap), gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`, gap: layout.gap }}>
                {row.photos.map((photo) => renderCard(photo, layout.cols))}
              </div>
            );
          })}
        </div>
      </div>
      {pull.distance > 0 && (pull.dir === 1 ? next : prev) ? (
        <div className={`${s.pullReveal} ${pull.dir === -1 ? s.pullRevealTop : ""} ${ready ? s.pullReady : ""}`} style={{ height: pull.distance }} aria-hidden>
          <span className={s.pullRing} style={{ "--pull": Math.min(1, progress / PULL_TO_PASS) } as CSSProperties}>{pull.dir === 1 ? <ArrowDown size={16} /> : <ArrowUp size={16} />}</span>
          <strong>{(pull.dir === 1 ? next : prev)!.label}</strong>
        </div>
      ) : null}
    </div>
  );
}
