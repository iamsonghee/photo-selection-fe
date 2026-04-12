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
    return { left: 0, top: 0 };
  }
  const scale = Math.min(containerW / naturalW, containerH / naturalH);
  const drawnW = naturalW * scale;
  const drawnH = naturalH * scale;
  return {
    left: (containerW - drawnW) / 2,
    top: (containerH - drawnH) / 2,
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
  showBadge: boolean;
  /** 확대 중이면 부모에서 좌우 스와이프(다음/이전 사진) 비활성화 */
  onZoomStateChange?: (zoomed: boolean) => void;
};

/**
 * 모바일 고객 뷰어: 핀치 확대·팬, 더블 탭 확대/리셋
 */
export function MobileViewerPinchPhoto({ src, alt, showBadge, onZoomStateChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [badgeOffset, setBadgeOffset] = useState({ left: 5, top: 5 });
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const transformRef = useRef(transform);
  transformRef.current = transform;

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
    if (nw <= 0 || nh <= 0) {
      setBadgeOffset({ left: 5, top: 5 });
      return;
    }
    const { left, top } = getObjectFitContainOffset(cw, ch, nw, nh);
    setBadgeOffset({ left: left + 5, top: top + 5 });
  }, []);

  useEffect(() => {
    setTransform({ scale: 1, tx: 0, ty: 0 });
    tapRef.current = { lastMs: 0, lastX: 0, lastY: 0 };
    notifyZoom(false);
  }, [src, notifyZoom]);

  useEffect(() => {
    measureBadge();
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measureBadge());
    ro.observe(el);
    return () => ro.disconnect();
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
          sessionRef.current.sawMultiTouch || sessionRef.current.oneFingerMoved;

        if (!skipDoubleTap && e.changedTouches.length === 1) {
          const ct = e.changedTouches[0];
          const now = Date.now();
          const tr = tapRef.current;
          const distTap = Math.hypot(ct.clientX - tr.lastX, ct.clientY - tr.lastY);
          if (tr.lastMs > 0 && now - tr.lastMs < DOUBLE_TAP_MS && distTap < DOUBLE_TAP_DIST) {
            const cur = transformRef.current;
            if (cur.scale <= SNAP_BELOW) {
              setT({ scale: Math.min(MAX_SCALE, DOUBLE_TAP_SCALE), tx: 0, ty: 0 });
            } else {
              setT({ scale: 1, tx: 0, ty: 0 });
            }
            tapRef.current = { lastMs: 0, lastX: 0, lastY: 0 };
          } else {
            tapRef.current = { lastMs: now, lastX: ct.clientX, lastY: ct.clientY };
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
    };
  }, [notifyZoom, src]);

  const { scale, tx, ty } = transform;
  const showBadgeVisible = showBadge && scale <= SNAP_BELOW;

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
      </div>
      {showBadgeVisible && (
        <div
          className="pointer-events-none absolute z-[3] flex items-center justify-center"
          style={{
            left: badgeOffset.left,
            top: badgeOffset.top,
            width: 22,
            height: 22,
            background: "#FF4D00",
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
