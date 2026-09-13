"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
import {
  viewerImageBlockDownloadHandlers,
  viewerImageBlockDownloadStyle,
  viewerImageDownloadBlocked,
} from "@/lib/viewer-image-guard";

function getObjectFitContainOffset(
  containerW: number,
  containerH: number,
  naturalW: number,
  naturalH: number,
) {
  if (containerW <= 0 || containerH <= 0 || naturalW <= 0 || naturalH <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const scale = Math.min(containerW / naturalW, containerH / naturalH);
  const drawnW = naturalW * scale;
  const drawnH = naturalH * scale;
  return {
    left: (containerW - drawnW) / 2,
    top: (containerH - drawnH) / 2,
    width: drawnW,
    height: drawnH,
  };
}

function touchDistance(t: TouchList): number {
  if (t.length < 2) return 0;
  const dx = t[0].clientX - t[1].clientX;
  const dy = t[0].clientY - t[1].clientY;
  return Math.hypot(dx, dy);
}

const MAX_SCALE = 4;
const SNAP_BELOW = 1.06;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_DIST = 48;
const DOUBLE_TAP_SCALE = 2;
const TAP_MOVE_SLOP = 14;

type Props = {
  src: string;
  alt: string;
  /** 사진 위 오버레이(체크박스·참가자 마크·선택 테두리) 표시 여부. 집중 모드에서 false로 내려 사진만 남긴다. */
  showBadge: boolean;
  /** 선택 여부 — 지정하면 배지가 탭 가능한 체크박스로 렌더링된다(onToggleSelect와 함께 사용) */
  selected?: boolean;
  /** 체크박스 탭 콜백. 없으면 기존처럼 읽기 전용 표시만 한다(LockedPhotoViewer 등) */
  onToggleSelect?: () => void;
  /** 값이 바뀔 때 실제 사진 경계에 선택 완료 flash를 한 번 재생 */
  selectionFlashKey?: number;
  /** 확대 중이면 부모에서 좌우 스와이프(다음/이전 사진) 비활성화 */
  onZoomStateChange?: (zoomed: boolean) => void;
  /** 더블 탭(확대/리셋)으로 이어지지 않은 한 번의 탭 — 사진에 집중하기 위한 chrome 숨기기/보이기 토글에 사용 */
  onSingleTap?: () => void;
  previewSrc?: string;
  previewVisible?: boolean;
  suppressTap?: () => boolean;
  /** 다른 참가자의 찜 표시 — 사진 우측 상단에 읽기 전용으로 얹는다.
   * 하단 컨트롤 행에 두면 폭 경쟁에 밀려 잘리는데, "누가 이 사진을 찜했나"는 사진에 붙는 정보라 여기가 제자리다. */
  /** named=false면 아직 이름을 등록하지 않은 참가자 — 점선 테두리로 "미등록"을 구분한다 */
  marks?: { key: string; hex: string; ink: string; text: string; named: boolean; label: string }[];
};

/**
 * 모바일 고객 뷰어: 핀치 확대·팬, 더블 탭 확대/리셋
 */
export function MobileViewerPinchPhoto({ src, alt, showBadge, selected = false, onToggleSelect, selectionFlashKey = 0, onZoomStateChange, onSingleTap, previewSrc, previewVisible, suppressTap, marks = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  /* 측정된 사진 모서리 좌표 — 어떤 src 기준으로 잰 값인지 함께 들고 있어야
   * 사진을 넘긴 직후 이전 사진 좌표로 잠깐 그려지는 것을 막을 수 있다. */
  const [badgeAnchor, setBadgeAnchor] = useState<{ src: string; left: number; top: number } | null>(null);
  const [imageBounds, setImageBounds] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const transformRef = useRef(transform);

  const gestureRef = useRef({
    mode: "none" as "none" | "pinch" | "pan",
    pinchStartDist: 0,
    pinchStartScale: 1,
    startTx: 0,
    startTy: 0,
    panStartX: 0,
    panStartY: 0,
  });

  const sessionRef = useRef({
    sawMultiTouch: false,
    oneFingerMoved: false,
    startX: 0,
    startY: 0,
  });

  const tapRef = useRef({ lastMs: 0, lastX: 0, lastY: 0 });
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notifyZoom = useCallback(
    (zoomed: boolean) => {
      onZoomStateChange?.(zoomed);
    },
    [onZoomStateChange],
  );

  const measureBadge = useCallback(() => {
    const el = containerRef.current;
    const img = imgRef.current;
    if (!el) return;
    const { width: cw, height: ch } = el.getBoundingClientRect();
    const nw = img?.naturalWidth ?? 0;
    const nh = img?.naturalHeight ?? 0;
    /* 새 사진이 디코딩되기 전에는 렌더 위치를 알 수 없다. 이때 컨테이너 모서리에 임시 배치하면
     * 로드 직후 실제 사진 모서리로 배지가 튀므로, 측정되기 전에는 아예 렌더하지 않는다(아래 badgeAnchor). */
    if (nw <= 0 || nh <= 0) return;
    const bounds = getObjectFitContainOffset(cw, ch, nw, nh);
    setBadgeAnchor({ src, left: bounds.left + 5, top: bounds.top + 5 });
    setImageBounds(bounds);
  }, [src]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const resetTransform = { scale: 1, tx: 0, ty: 0 };
      setTransform(resetTransform);
      transformRef.current = resetTransform;
      tapRef.current = { lastMs: 0, lastX: 0, lastY: 0 };
      notifyZoom(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [src, notifyZoom]);

  useEffect(() => {
    const frame = requestAnimationFrame(measureBadge);
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(frame);
    }
    const ro = new ResizeObserver(() => measureBadge());
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [measureBadge, src]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const setT = (next: { scale: number; tx: number; ty: number }) => {
      const scale = Math.min(MAX_SCALE, Math.max(1, next.scale));
      setTransform({ scale, tx: next.tx, ty: next.ty });
      transformRef.current = { scale, tx: next.tx, ty: next.ty };
      notifyZoom(scale > SNAP_BELOW);
    };

    const onStart = (e: TouchEvent) => {
      const t = e.touches;
      if (t.length === 1) {
        sessionRef.current.startX = t[0].clientX;
        sessionRef.current.startY = t[0].clientY;
        sessionRef.current.oneFingerMoved = false;
      }
      if (t.length === 2) {
        sessionRef.current.sawMultiTouch = true;
      }
      if (t.length === 2) {
        const g = gestureRef.current;
        g.mode = "pinch";
        g.pinchStartDist = touchDistance(t);
        g.pinchStartScale = transformRef.current.scale;
        g.startTx = transformRef.current.tx;
        g.startTy = transformRef.current.ty;
        notifyZoom(true);
      } else if (t.length === 1 && transformRef.current.scale > SNAP_BELOW) {
        const g = gestureRef.current;
        g.mode = "pan";
        g.panStartX = t[0].clientX;
        g.panStartY = t[0].clientY;
        g.startTx = transformRef.current.tx;
        g.startTy = transformRef.current.ty;
        notifyZoom(true);
      }
    };

    const onMove = (e: TouchEvent) => {
      const t = e.touches;
      const g = gestureRef.current;

      /* 1배일 때만 이동으로 더블 탭 후보 무효화 — 확대 후 팬해도 더블 탭 리셋 가능 */
      if (t.length === 1 && transformRef.current.scale <= SNAP_BELOW) {
        const dx = t[0].clientX - sessionRef.current.startX;
        const dy = t[0].clientY - sessionRef.current.startY;
        if (Math.hypot(dx, dy) > TAP_MOVE_SLOP) {
          sessionRef.current.oneFingerMoved = true;
        }
      }

      if (g.mode === "pinch" && t.length >= 2) {
        e.preventDefault();
        const d0 = g.pinchStartDist;
        if (d0 < 1) return;
        const d1 = touchDistance(t);
        const nextScale = Math.min(MAX_SCALE, Math.max(1, g.pinchStartScale * (d1 / d0)));
        setT({
          scale: nextScale,
          tx: g.startTx,
          ty: g.startTy,
        });
      } else if (g.mode === "pan" && t.length === 1) {
        e.preventDefault();
        const dx = t[0].clientX - g.panStartX;
        const dy = t[0].clientY - g.panStartY;
        setT({
          scale: transformRef.current.scale,
          tx: g.startTx + dx,
          ty: g.startTy + dy,
        });
      }
    };

    const finishAllTouches = () => {
      gestureRef.current.mode = "none";
      const { scale } = transformRef.current;
      if (scale < SNAP_BELOW) {
        setT({ scale: 1, tx: 0, ty: 0 });
        notifyZoom(false);
      } else {
        notifyZoom(true);
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (e.touches.length === 1 && gestureRef.current.mode === "pinch") {
        const g = gestureRef.current;
        g.mode = "pan";
        g.panStartX = e.touches[0].clientX;
        g.panStartY = e.touches[0].clientY;
        g.startTx = transformRef.current.tx;
        g.startTy = transformRef.current.ty;
        return;
      }
      if (e.touches.length === 0) {
        const skipDoubleTap =
          sessionRef.current.sawMultiTouch || sessionRef.current.oneFingerMoved || suppressTap?.();

        if (!skipDoubleTap && e.changedTouches.length === 1) {
          const ct = e.changedTouches[0];
          const now = Date.now();
          const tr = tapRef.current;
          const distTap = Math.hypot(ct.clientX - tr.lastX, ct.clientY - tr.lastY);
          if (tr.lastMs > 0 && now - tr.lastMs < DOUBLE_TAP_MS && distTap < DOUBLE_TAP_DIST) {
            if (singleTapTimerRef.current) {
              clearTimeout(singleTapTimerRef.current);
              singleTapTimerRef.current = null;
            }
            const cur = transformRef.current;
            if (cur.scale <= SNAP_BELOW) {
              setT({ scale: Math.min(MAX_SCALE, DOUBLE_TAP_SCALE), tx: 0, ty: 0 });
            } else {
              setT({ scale: 1, tx: 0, ty: 0 });
            }
            tapRef.current = { lastMs: 0, lastX: 0, lastY: 0 };
          } else {
            tapRef.current = { lastMs: now, lastX: ct.clientX, lastY: ct.clientY };
            /* 이 시점에는 아직 두 번째 탭이 올지 몰라 DOUBLE_TAP_MS만큼 기다렸다가,
             * 그사이 더블 탭으로 소비되지 않았으면(tapRef가 그대로면) 한 번 탭으로 확정한다. */
            if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
            singleTapTimerRef.current = setTimeout(() => {
              singleTapTimerRef.current = null;
              if (tapRef.current.lastMs === now) {
                tapRef.current = { lastMs: 0, lastX: 0, lastY: 0 };
                onSingleTap?.();
              }
            }, DOUBLE_TAP_MS);
          }
        }

        finishAllTouches();
        sessionRef.current = {
          sawMultiTouch: false,
          oneFingerMoved: false,
          startX: 0,
          startY: 0,
        };
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);

    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
    };
  }, [notifyZoom, src, onSingleTap, suppressTap]);

  const { scale, tx, ty } = transform;
  /* 현재 src로 실제 측정이 끝난 경우에만 배지를 그린다 — 사진 이동 시 위치가 튀지 않게. */
  const badgeOffset = badgeAnchor?.src === src ? badgeAnchor : null;
  const showBadgeVisible = showBadge && scale <= SNAP_BELOW && badgeOffset != null;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      /* none이면 iOS/Android에서 이미지 롱프레스(저장·복사) 시스템 메뉴가 뜨지 않는 경우가 많음 */
      style={{
        touchAction: viewerImageDownloadBlocked ? "none" : "manipulation",
      }}
      onContextMenu={viewerImageDownloadBlocked ? (e) => e.preventDefault() : undefined}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transformOrigin: "center center",
          willChange: "transform",
        }}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          onLoad={measureBadge}
          {...viewerImageBlockDownloadHandlers}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            objectPosition: "center",
            display: "block",
            /* none이면 터치가 img가 아닌 부모로만 가서 iOS 롱프레스(저장/복사)가 안 뜸. 차단 모드일 때만 none */
            pointerEvents: viewerImageDownloadBlocked ? "none" : "auto",
            ...viewerImageBlockDownloadStyle,
            /* 갤러리 썸네일과 같이 롱프레스 콜아웃 허용 (차단 모드에서는 guard가 none) */
            ...(!viewerImageDownloadBlocked
              ? ({ WebkitTouchCallout: "default" } as CSSProperties)
              : {}),
          }}
        />
        {/* 원본을 별도 레이어에 유지해 비교 중 확대 상태와 터치 세션을 보존한다. */}
        {previewSrc ? (
          <img
            src={previewSrc}
            alt="원본"
            aria-hidden={!previewVisible}
            draggable={false}
            className="mobile-viewer-preview"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              backgroundColor: "#000",
              opacity: previewVisible ? 1 : 0,
              pointerEvents: "none",
              transition: "opacity 140ms ease",
            }}
          />
        ) : null}
        {selectionFlashKey > 0 && imageBounds.width > 0 && imageBounds.height > 0 && (
          <span
            key={selectionFlashKey}
            className="fv-selection-flash"
            style={imageBounds}
            aria-hidden
          />
        )}
        {/* 선택 여부는 이 화면의 결과물 그 자체라 배지 하나가 아니라 사진 테두리 전체로 알린다.
          * 단 집중 모드(showBadge=false)에서는 이 테두리도 함께 숨겨 사진만 남긴다. */}
        {showBadge && selected && imageBounds.width > 0 && imageBounds.height > 0 && (
          <span className="fv-selected-frame" style={imageBounds} aria-hidden />
        )}
      </div>
      {showBadgeVisible && onToggleSelect && (
        <button
          type="button"
          onClick={onToggleSelect}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          aria-label={selected ? "사진 선택 해제" : "사진 선택"}
          aria-pressed={selected}
          className="fv-photo-checkbox absolute z-[3] flex items-center justify-center"
          style={{
            left: badgeOffset.left,
            top: badgeOffset.top,
            width: 44,
            height: 44,
            background: "transparent",
            border: 0,
            padding: 0,
          }}
        >
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              /* 갤러리 카드 체크박스(.gl-check-box)와 같은 규칙 — 미선택은 흰 채움이라
               * "아직 안 고른 빈 체크박스"로 읽히고, 어두운 사진에 묻히지 않는다. */
              background: selected ? "var(--accent)" : "rgba(255,255,255,0.92)",
              border: selected ? "2px solid var(--accent)" : "2px solid rgba(255,255,255,0.95)",
              /* 밝은 사진 위에서 흰 박스가 묻히지 않도록 바깥쪽에 어두운 링을 한 겹 더 둔다 */
              boxShadow: selected
                ? "0 0 0 1px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.35)"
                : "0 0 0 1px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.35)",
              transition: "background-color 160ms ease, border-color 160ms ease",
            }}
          >
            {selected && <Check style={{ width: 20, height: 20, color: "#fff" }} strokeWidth={3} />}
          </span>
        </button>
      )}
      {showBadgeVisible && marks.length > 0 && (
        <div
          className="fv-photo-marks"
          style={{
            left: badgeOffset.left,
            top: badgeOffset.top,
            width: Math.max(imageBounds.width - 10, 0),
          }}
          aria-label="다른 참가자의 찜"
        >
          {marks.map((mark) => (
            <span
              key={mark.key}
              className={`fv-photo-mark${mark.named ? "" : " fv-photo-mark-unnamed"}`}
              style={{ background: mark.hex, color: mark.ink }}
              title={mark.label}
              aria-label={mark.label}
            >
              {mark.text}
            </span>
          ))}
        </div>
      )}
      {showBadgeVisible && !onToggleSelect && (
        <div
          className="pointer-events-none absolute z-[3] flex items-center justify-center"
          style={{
            left: badgeOffset.left,
            top: badgeOffset.top,
            width: 22,
            height: 22,
            background: "var(--accent)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
          }}
          aria-hidden
        >
          <Check style={{ width: 12, height: 12, color: "#000" }} strokeWidth={3} />
        </div>
      )}
    </div>
  );
}
