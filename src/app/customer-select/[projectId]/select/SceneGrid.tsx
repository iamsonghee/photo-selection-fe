"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown } from "lucide-react";
import type { Photo } from "@/types";
import ui from "../../_lib/ui.module.css";
import s from "./select.module.css";
import { CUSTOMER_GALLERY_GRID } from "../../_lib/photo-grid";

export type MobileColumns = 2 | 3 | 4;

const DESKTOP_MIN_CELL = CUSTOMER_GALLERY_GRID.desktopMinCell;
const DESKTOP_GAP = CUSTOMER_GALLERY_GRID.desktopGap;
// 3열이 기준(photo-grid.ts). 2·4열은 고르기 화면에서만 고를 수 있는 보기 옵션.
const MOBILE_GRID: Record<MobileColumns, { gap: number; aspect: number }> = {
  2: { gap: 10, aspect: 1 },
  3: { gap: CUSTOMER_GALLERY_GRID.mobileGap, aspect: 1 },
  4: { gap: 6, aspect: 1 },
};
const FOOTER_HEIGHT = { desktop: 120, mobile: 104 };
// ponytail: 바닥에서 더 당기는 고무줄의 최대 길이·저항·넘어가는 지점. 실기기에서 만져 보며 조정할 값.
const PULL_MAX = 170;
const PULL_RESISTANCE = 220;
const PULL_TO_PASS = 0.62;
const WHEEL_RELEASE_MS = 350; // 천천히 굴리는 마우스 휠 칸 사이(0.2~0.3초)에 풀리지 않게
// 휠: 바닥에서 이만큼 멈춰 있은 뒤, 잠깐 쉬었거나(간격) 느려지지 않는(새 스와이프·마우스 휠) 휠만 당기기로 본다.
// 관성 스크롤은 계속 느려지기만 하므로 당기기로 잡히지 않는다.
const WHEEL_BOTTOM_DWELL_MS = 250;
const WHEEL_NEW_GESTURE_MS = 140;
// 맥 마우스처럼 한 칸이 몇 px뿐인 휠도 몇 칸이면 넘어가도록 한 번에 최소 이만큼 당긴다.
const WHEEL_MIN_STEP = 20;

/** band: 펼친 유사컷 묶음 키(그 줄은 그 묶음 사진만 담는다). bandStart/bandEnd로 띠의 위·아래 끝을 둥글게 닫는다. */
type Row = { kind: "photos"; photos: Photo[]; band: string | null; bandStart: boolean; bandEnd: boolean } | { kind: "footer" };

/**
 * 장면 하나의 가상화 사진 격자. 장면 끝에서는 브라우저 스크롤이 스스로 멈추고, 거기서 더 당기면 고무줄처럼
 * 늘어나며 다음 장면이 드러난다. 충분히 당긴 채 놓으면 넘어간다(덜 당기면 원래대로). 위로는 걸림 없이 이전 장면으로 이어진다.
 */
export function SceneGrid({ photos, mobileColumns, positionKey, startAt, enterFrom, renderCard, empty, footer, next, prev, focus, bandOf }: {
  photos: Photo[];
  /** 펼친 유사컷 묶음이면 그 묶음 키. 묶음은 새 줄에서 시작해 묶음 사진만으로 줄을 채우고, 뒤에 하나로 이어진 띠를 깐다. */
  bandOf?: (photo: Photo) => string | null;
  mobileColumns: MobileColumns;
  positionKey: string;
  /** 당겨서 넘어온 장면은 다음이면 처음부터, 이전이면 끝부터 본다. 없으면 마지막으로 보던 곳. */
  startAt?: "top" | "bottom" | null;
  /** 당겨서 다음 장면으로 넘어왔으면 아래에서 올라오듯 들어온다 */
  enterFrom?: "below" | null;
  renderCard: (photo: Photo, columns: number) => ReactNode;
  empty: ReactNode;
  /** 사진 목록 끝의 얇은 안내(다음 장면 이름, 마지막 장면의 보내기 등) */
  footer?: ReactNode;
  /** 바닥에서 당겨 넘어갈 다음 장면. 없으면 당기기를 쓰지 않는다. */
  next?: { label: string; onPass: () => void } | null;
  /** 맨 위에서 더 올리면 저항 없이 바로 이어지는 이전 장면(그 장면의 끝에서 계속 올라간다). */
  prev?: { label: string; onPass: () => void } | null;
  /** 상세 보기를 닫은 뒤 마지막으로 본 사진이 화면 밖이면 가운데로 가져온다(작가 고객 갤러리와 같은 규칙). */
  focus?: { photoId: string; nonce: number } | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  // 처음 위치를 잡기 전에는 위로 이어 가기를 하지 않는다(장면이 바뀌자마자 두 장면을 건너뛰지 않게).
  const positionedRef = useRef(false);
  const [layout, setLayout] = useState({ cols: 4, gap: DESKTOP_GAP, rowHeight: DESKTOP_MIN_CELL + DESKTOP_GAP, mobile: false, overscan: 6 });
  // 실제 격자 폭으로 열 수를 계산하기 전에는 위치를 복원하지 않는다(기본 4열 기준 행으로 잘못 이동함).
  const [measured, setMeasured] = useState(false);
  const [pull, setPull] = useState({ distance: 0, active: false });

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
    let current: Photo[] = [];
    let currentBand: string | null = null;
    const flush = () => {
      if (current.length) list.push({ kind: "photos", photos: current, band: currentBand, bandStart: false, bandEnd: false });
      current = [];
    };
    for (const photo of photos) {
      const band = bandOf?.(photo) ?? null;
      // 묶음이 시작·끝나는 곳에서 줄을 바꾼다 — 묶음은 다른 사진과 한 줄에 섞이지 않는다.
      if (band !== currentBand || current.length === layout.cols) { flush(); currentBand = band; }
      current.push(photo);
    }
    flush();
    list.forEach((row, index) => {
      if (row.kind !== "photos" || !row.band) return;
      const before = list[index - 1], after = list[index + 1];
      row.bandStart = !(before?.kind === "photos" && before.band === row.band);
      row.bandEnd = !(after?.kind === "photos" && after.band === row.band);
    });
    if (footer && photos.length) list.push({ kind: "footer" });
    return list;
  }, [bandOf, footer, layout.cols, photos]);

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
        window.setTimeout(() => { positionedRef.current = true; }, 120);
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

  // 끝에서 더 당기기. 화면이 손을 따라 늘어나되 점점 덜 늘어나고(저항), 놓을 때 충분히 당겼으면 넘어간다.
  const targetsRef = useRef({ next, prev });
  targetsRef.current = { next, prev };
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raw = 0;
    let armed = false;
    // 장면이 바뀌면 이 그리드가 새로 마운트된다. 넘어온 스크롤이 이어지는 동안(휠이 한 번 쉬기 전)에는 다음 장면 당김을
    // 시작하지 않는다 — 한 번의 스크롤로 장면을 여러 개 건너뛰지 않게.
    let lastWheel = performance.now();
    let needPause = true;
    let lastWheelAbs = 0;
    let bottomSince = 0;
    let releaseTimer = 0;
    let touchY: number | null = null;
    // 터치는 장면 끝에 멈춘 상태에서 새로 댄 손가락으로만 당긴다(스크롤하던 손가락이 그대로 다음 장면으로 넘어가지 않게).
    let touchFromBottom = false;
    const atBottom = () => el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    const atTop = () => el.scrollTop <= 0;
    let continuedUp = false;
    // 위로는 걸림 없이: 맨 위에 닿은 채 더 올리면 바로 이전 장면의 끝으로 이어진다.
    const continueUp = (dy: number) => {
      if (dy >= 0 || !atTop() || !targetsRef.current.prev || !positionedRef.current || continuedUp) return false;
      continuedUp = true;
      targetsRef.current.prev.onPass();
      return true;
    };
    const distanceOf = (value: number) => PULL_MAX * (1 - Math.exp(-Math.max(0, value) / PULL_RESISTANCE));
    const release = () => {
      window.clearTimeout(releaseTimer);
      const passed = armed && distanceOf(raw) / PULL_MAX >= PULL_TO_PASS;
      armed = false;
      raw = 0;
      setPull({ distance: 0, active: false });
      if (passed) targetsRef.current.next?.onPass();
    };
    const move = (dy: number) => {
      raw += dy;
      if (raw <= 0) { raw = 0; armed = false; setPull({ distance: 0, active: false }); return; }
      setPull({ distance: distanceOf(raw), active: true });
    };
    // 더 내려갈 곳이 없는 끝에서 아래로 더 당길 때만 시작한다.
    const arm = (dy: number) => {
      if (dy <= 0 || !atBottom() || !targetsRef.current.next) return false;
      armed = true;
      return true;
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      // 처리 시각이 아니라 휠이 생긴 시각으로 잰다 — 장면을 새로 그리느라 바쁜 동안 쌓였다 늦게 처리된 휠을 '쉰 뒤 새 휠'로 오해하지 않게.
      const now = event.timeStamp || performance.now();
      const gap = now - lastWheel;
      lastWheel = now;
      const dy = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * el.clientHeight : event.deltaY;
      const notSlowing = Math.abs(dy) >= Math.max(lastWheelAbs, 10); // 관성 꼬리는 같은 작은 값(7, 7…)이 반복되기도 한다
      lastWheelAbs = Math.abs(dy);
      if (gap >= WHEEL_NEW_GESTURE_MS) needPause = false;
      if (!armed && continueUp(dy)) { event.preventDefault(); return; }
      if (!armed) {
        if (!atBottom()) { bottomSince = 0; return; }
        // 휠 없이 바닥에 머물러 있다가(간격이 충분히 길면) 다시 굴린 것도 멈춤을 거친 것으로 본다.
        if (!bottomSince) bottomSince = gap >= WHEEL_BOTTOM_DWELL_MS ? now - WHEEL_BOTTOM_DWELL_MS : now;
        const fresh = !needPause && now - bottomSince >= WHEEL_BOTTOM_DWELL_MS && (gap >= WHEEL_NEW_GESTURE_MS || notSlowing);
        if (!fresh || !arm(dy)) return;
      }
      event.preventDefault();
      move(dy > 0 ? Math.max(dy, WHEEL_MIN_STEP) : dy);
      window.clearTimeout(releaseTimer);
      // 휠은 다 당기면 손을 떼기 기다리지 않고 바로 넘어간다(놓기 판정은 덜 당겼을 때 제자리로 돌릴 때만).
      if (armed && distanceOf(raw) / PULL_MAX >= PULL_TO_PASS) release();
      else releaseTimer = window.setTimeout(release, WHEEL_RELEASE_MS);
    };
    const onTouchStart = (event: TouchEvent) => {
      touchY = event.touches.length === 1 ? event.touches[0].clientY : null;
      touchFromBottom = atBottom();
    };
    const onTouchMove = (event: TouchEvent) => {
      if (touchY === null || event.touches.length !== 1) return;
      const y = event.touches[0].clientY;
      const dy = touchY - y;
      touchY = y;
      if (!armed && continueUp(dy)) { if (event.cancelable) event.preventDefault(); return; }
      if (!armed && (!touchFromBottom || !arm(dy))) return;
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
    <div className={`${s.timeline} ${enterFrom === "below" ? s.sceneEnter : ""}`}>
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
          style={{ height: photos.length ? virtualizer.getTotalSize() : "100%", transform: pull.distance ? `translateY(${-pull.distance}px)` : undefined }}
        >
          {!photos.length ? <div className={ui.selectEmpty}>{empty}</div> : virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            if (row.kind === "footer") return <div key={item.key} className={s.sceneFooter} style={{ top: item.start, height: item.size }}>{footer}</div>;
            return (
              <div key={item.key} className={ui.selectGridRow} style={{ top: item.start, height: Math.max(0, item.size - layout.gap), gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`, gap: layout.gap, overflow: row.band ? "visible" : undefined }}>
                {/* 펼친 묶음의 띠: 묶음 사진이 놓인 칸만큼, 여러 줄이면 줄 사이 간격 가운데서 위아래가 맞붙는다. */}
                {row.band && <div className={s.groupBand} aria-hidden style={{
                  gridColumn: `1 / span ${row.photos.length}`, gridRow: 1,
                  top: row.bandStart ? -5 : -layout.gap / 2, bottom: row.bandEnd ? -5 : -layout.gap / 2,
                  borderRadius: `${row.bandStart ? 9 : 0}px ${row.bandStart ? 9 : 0}px ${row.bandEnd ? 9 : 0}px ${row.bandEnd ? 9 : 0}px`,
                }} />}
                {row.photos.map((photo) => renderCard(photo, layout.cols))}
              </div>
            );
          })}
        </div>
      </div>
      {next && pull.distance > 0 ? (
        <div className={`${s.pullReveal} ${ready ? s.pullReady : ""}`} style={{ height: pull.distance }} aria-hidden>
          <span className={s.pullRing} style={{ "--pull": Math.min(1, progress / PULL_TO_PASS) } as CSSProperties}><ArrowDown size={16} /></span>
          <strong>{next.label}</strong>
        </div>
      ) : null}
    </div>
  );
}
